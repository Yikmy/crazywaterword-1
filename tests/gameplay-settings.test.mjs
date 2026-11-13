import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createModuleSettings } from '../src/gameplay-settings.mjs';
import { GAMEPLAY_MODULES, listBusinessFunctions } from '../src/function-registry.mjs';
import { assertPaymentAllowed } from '../src/actions.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-p3-settings-'));
const file=path.join(dir,'settings.json'), settings=createModuleSettings({file,modules:GAMEPLAY_MODULES});
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
test('all static functions use one contract and default to disabled without reading or creating a runtime',()=>{
 assert.deepEqual(listBusinessFunctions().map(x=>x.id),['formation','alliance','museum','treasure','fleet','naval','orders','city','production','heroes','farm','equipment-forge','formation-unlock','equipment-growth','badge-growth','antique-growth','pirate-sweep','task-rewards','mail','afk-level-rewards','free-gold','free-recruit','trial-challenge','pet','material-packs']);
 for(const id of Object.keys(GAMEPLAY_MODULES)) assert.equal(settings.get('A',id).config.enabled,false);
 assert.equal(fs.existsSync(file),false);
 assert.throws(()=>settings.get('A','constructor'));
});
test('module settings isolate accounts and preserve independent switches atomically',()=>{
 settings.save('A','formation',{enabled:true,mainlineEnabled:false});
 assert.equal(settings.get('A','formation').config.enabled,true);
 assert.equal(settings.get('B','formation').config.enabled,false);
 assert.equal(settings.get('A','museum').config.enabled,false);
 assert.equal(fs.readdirSync(dir).some(name=>name.endsWith('.tmp')),false);
});
test('strict configuration rejects request injection, invalid quantities and arbitrary executable rules',()=>{
 for(const value of [{enabled:'yes'},{enabled:true,allowPaid:true},{request:'BuyRubyRequest'},null])assert.throws(()=>settings.save('A','formation',value));
 for(const value of [{minimumDurabilityRatio:2},{scenarioId:0},{petrolReserve:-1}])assert.throws(()=>settings.save('A','fleet',value));
 for(const rules of [[{id:'a',type:'javascript',value:'alert(1)'}],[{id:'a',type:'targetId',value:1}],[{id:'a',type:'sameGuild',value:true,body:{}}],[{id:'a',type:'minPetrol',value:2},{id:'a',type:'minPetrol',value:3}]])assert.throws(()=>settings.save('A','naval',{rules}));
 const result=settings.save('A','naval',{rules:[{id:'reserve',type:'minPetrol',value:10},{id:'guild',type:'sameGuild',value:false}]});
 assert.equal(result.config.rules.length,2);assert.equal(result.config.enabled,false);
});
test('damaged settings retain original evidence and cannot be silently overwritten',()=>{
 fs.writeFileSync(file,'{damaged');
 assert.throws(()=>settings.get('A','formation'),{code:'SETTINGS_UNAVAILABLE'});
 assert.throws(()=>settings.save('A','formation',{enabled:false}),{code:'SETTINGS_UNAVAILABLE'});
 assert.equal(fs.readFileSync(file,'utf8'),'{damaged');
});
test('D6 premium block remains absolute for verified business requests and unknown requests',()=>{
 for(const request of ['SaveFormationRequest','MuseumSpeedUpExploreRequest','RepairFleetRequest','MoveFleetsToCityRequest','TreasureLootSendFleetsRequest']) {
  assert.throws(()=>assertPaymentAllowed({request,body:{},costs:[{id:'RUBY',num:1}]}),{code:'D6_FORBIDDEN'});
  assert.throws(()=>assertPaymentAllowed({request,body:{speedUp:{type:1}},costs:[]}),{code:'D6_FORBIDDEN'});
 }
 assert.throws(()=>assertPaymentAllowed({request:'UnregisteredRequest',body:{},costs:[]}),{code:'COST_UNKNOWN'});
 assert.doesNotThrow(()=>assertPaymentAllowed({request:'SaveFormationRequest',body:{module:1},costs:[]}));
});


test('shared naval rule metadata retains the original exact type and 100-rule boundaries',async()=>{
 const { NAVAL_RULE_CONTRACT,validateModuleConfig }=await import('../src/gameplay-settings.mjs');assert.equal(Object.isFrozen(NAVAL_RULE_CONTRACT),true);assert.equal(Object.isFrozen(NAVAL_RULE_CONTRACT.types),true);assert.equal(NAVAL_RULE_CONTRACT.maxRules,100);
 const check=rules=>validateModuleConfig({rules},GAMEPLAY_MODULES.naval.defaultConfig);
 for(const type of [['targetId'],['minPetrol'],new String('minPetrol'),{},'__proto__','constructor','playerSide'])assert.throws(()=>check([{id:'x',type,value:1}]));
 for(const [type,kind]of Object.entries(NAVAL_RULE_CONTRACT.types)){const value=kind==='text'?'exact-key':kind==='boolean'?false:0;assert.deepEqual(check([{id:'x',type,value}]).rules,[{id:'x',type,value}]);}
 const rules=Array.from({length:100},(_,i)=>({id:'r'+i,type:'freshTarget',value:0}));assert.equal(check(rules).rules.length,100);assert.throws(()=>check([...rules,{id:'overflow',type:'freshTarget',value:0}]));
});
