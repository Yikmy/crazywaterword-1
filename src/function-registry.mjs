import { formationModule } from './formation.mjs';
import { allianceModule } from './alliance.mjs';
import { museumModule } from './museum.mjs';
import { treasureModule } from './treasure.mjs';
import { fleetModule } from './fleet.mjs';
import { navalModule } from './naval-rules.mjs';

// Static trusted registration only. No browser supplied implementation or Request.
export const GAMEPLAY_MODULES = Object.freeze(Object.fromEntries([formationModule,allianceModule,museumModule,treasureModule,fleetModule,navalModule].map(module=>[module.id,Object.freeze(module)])));
export function listBusinessFunctions(modules=GAMEPLAY_MODULES) {return Object.values(modules).map(module=>({id:module.id,label:module.label??module.id,contract:'Survey → View → Plan → Authorize → Execute → Verify',defaultConfig:structuredClone(module.defaultConfig??{enabled:false}),capabilities:module.capabilities??[],source:module.evidence??null}));}
