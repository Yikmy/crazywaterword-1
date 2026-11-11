import { equipmentGrowthModule } from './equipment-growth.mjs';
import { formationUnlockModule } from './formation-unlock.mjs';
import { equipmentForgeModule } from './equipment-forge.mjs';
import { farmModule } from './farm-operations.mjs';
import { heroModule } from './hero-operations.mjs';
import { formationModule } from './formation.mjs';
import { allianceModule } from './alliance.mjs';
import { museumModule } from './museum.mjs';
import { treasureModule } from './treasure.mjs';
import { fleetModule } from './fleet.mjs';
import { navalModule } from './naval-rules.mjs';
import { CORE_OPERATION_MODULES } from './core-operation-adapters.mjs';
import { FUNCTION_CONTRACTS, describeFunctionContract, validateFunctionContract } from './function-contracts.mjs';

const valueAt = (options, key) => key.startsWith('config.') ? options.config?.tables?.[key.slice(7)] ?? null : key.split('.').reduce((value, part) => value?.[part], options) ?? null;
function declaredDependencies(id, options) {
 const declaration=FUNCTION_CONTRACTS[id].dependencyVersions, keys=[...declaration.required];
 for(const conditional of declaration.conditional??[]) { const [path,expected]=conditional.when.split('='); if(String(valueAt(options,path))===expected)keys.push(...conditional.keys); }
 return Object.fromEntries(keys.map(key=>[key,structuredClone(valueAt(options,key))]));
}
export function registerBusinessFunction(module) { const adapter=Object.freeze({...module,contractVersion:1,dependencyVersions:module.dependencyVersions??(options=>declaredDependencies(module.id,options))});validateFunctionContract(adapter.id,adapter);return adapter; }
// Static trusted registration only. Browser data never supplies code or transport.
export const GAMEPLAY_MODULES=Object.freeze(Object.fromEntries([formationModule,allianceModule,museumModule,treasureModule,fleetModule,navalModule,...Object.values(CORE_OPERATION_MODULES),heroModule,farmModule,equipmentForgeModule,formationUnlockModule,equipmentGrowthModule].map(module=>[module.id,registerBusinessFunction(module)])));
export function listBusinessFunctions(modules=GAMEPLAY_MODULES){return Object.values(modules).map(module=>({id:module.id,label:module.label??module.id,contract:'Survey → View → Plan → Authorize → Execute → Verify',defaultConfig:structuredClone(module.defaultConfig??{enabled:false}),capabilities:module.capabilities??FUNCTION_CONTRACTS[module.id]?.requirementIds.C??[],source:module.evidence??FUNCTION_CONTRACTS[module.id]?.source??null,metadata:module.contractVersion===1?describeFunctionContract(module.id):null}));}
