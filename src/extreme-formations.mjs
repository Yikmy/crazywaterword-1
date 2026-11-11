// C215 source preparation only. Existing Formation owns every write and permit.
import { surveyFormation, planFormation, parseFormation, catalogFrom } from './formation.mjs';
import { toSnapshotJson } from './game.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { createStateFact, factsFreshnessPolicy } from './state-facts.mjs';
import { stableBusinessValue } from './business-functions.mjs';
const own=(v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(v,k);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const int32=v=>Number.isInteger(v)&&v>=-2147483648&&v<=2147483647,positive=v=>int32(v)&&v>0;
const text=v=>typeof v==='string'&&v.length>0&&v.length<=256&&v.trim()===v&&[...v].every(c=>c.charCodeAt(0)>=32&&c.charCodeAt(0)!==127);
const field=(v,k)=>own(v,k)&&own(Object.getOwnPropertyDescriptor(v,k),'value')?Object.getOwnPropertyDescriptor(v,k).value:undefined;
const fields=(v,keys)=>object(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).every(k=>typeof k==='string'&&keys.includes(k)&&own(Object.getOwnPropertyDescriptor(v,k),'value')&&Object.getOwnPropertyDescriptor(v,k).enumerable);
const dense=v=>Array.isArray(v)&&v.length<=1000&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>own(v,i)&&own(Object.getOwnPropertyDescriptor(v,String(i)),'value')).every(Boolean);
const same=(a,b)=>stableBusinessValue(a)===stableBusinessValue(b),copy=v=>structuredClone(v);
const blocked=reason=>Object.assign(new Error(reason),{code:'EXTREME_FORMATION_BLOCKED',statusCode:409});
const invalid=reason=>Object.assign(new Error(reason),{code:'INVALID_PARAMETERS',statusCode:400});
const moduleId='extreme-formations',scopeFor=stage=>({kind:'ENTITY',key:'MAINLINE_EXTREME:'+stage});
const targetSpecs={formation:'GetFormationResponse',presets:'MyFormationPresetResponse',heroes:'AllHeroResponse'};
export const EXTREME_FORMATION_EVIDENCE=Object.freeze({capabilityId:'C215',source:'v76 StageView.ts:3001; BestPassPop.ts:363; BestPassItem.ts:361',mainSha256:'a6046fcc2ad7a3424282e9f8b51073656f5ae8d48742129743560bf958266c54',sourceKind:'SERVER_EXTREME_PASS_SOURCE',battleType:'BT_MAINLINE',raidModule:3,independentVictoryVerification:false,rankSource:false,automaticApply:false,realGame:'REAL_UNVERIFIED'});
function safeTree(value,seen=new Set()){
 if(value===null||['string','boolean'].includes(typeof value))return true;
 if(typeof value==='number')return Number.isFinite(value)&&(!Number.isInteger(value)||Number.isSafeInteger(value));
 if(typeof value!=='object'||seen.has(value))return false;seen.add(value);
 const valid=Reflect.ownKeys(value).every(key=>typeof key==='string'&&own(Object.getOwnPropertyDescriptor(value,key),'value')&&(Array.isArray(value)&&key==='length'||Object.getOwnPropertyDescriptor(value,key).enumerable)&&safeTree(field(value,key),seen));seen.delete(value);return valid;
}
function snapshot(value){if(!safeTree(value))throw blocked('SOURCE_DATA_UNSAFE');return toSnapshotJson(value);}
function exactId(value,{zero=false}={}){
 if(typeof value==='number'&&!Number.isSafeInteger(value))return null;
 if(value!==null&&typeof value==='object'&&!safeTree(value))return null;const n=toSnapshotJson(value);
 if(!(typeof n==='number'&&Number.isSafeInteger(n))&&!(typeof n==='string'&&/^(0|[1-9]\d*)$/.test(n)))return null;
 try{const b=BigInt(n);return b>=(zero?0n:1n)&&b<(1n<<63n)?b.toString():null;}catch{return null;}
}
export function validateExtremeFormationParameters(value){
 if(!fields(value,['stage','playerId','worldId','replayId'])||!positive(field(value,'stage'))||!['playerId','worldId','replayId'].every(key=>typeof field(value,key)==='string'&&exactId(field(value,key))===field(value,key)))throw invalid('极限来源必须含明确stage及精确playerId/worldId/replayId十进制字符串');
 return {stage:value.stage,playerId:value.playerId,worldId:value.worldId,replayId:value.replayId};
}
function normalizeViewer(v){
 if(!fields(v,['accountId','playerId','worldId','generation','connectionId'])||!text(field(v,'accountId'))||!text(field(v,'connectionId'))||!Number.isSafeInteger(field(v,'generation'))||v.generation<0||exactId(field(v,'playerId'))===null||exactId(field(v,'worldId'))===null)return null;
 return {accountId:v.accountId,playerId:exactId(v.playerId),worldId:exactId(v.worldId),generation:v.generation,connectionId:v.connectionId};
}
function contextMatches(client,player,viewer,stage){
 const c=client?.factContext;return viewer!==null&&c?.accountId===viewer.accountId&&c?.generation===viewer.generation&&c?.connectionId===viewer.connectionId&&exactId(field(player,'playerId'))===viewer.playerId&&exactId(field(player,'worldId'))===viewer.worldId&&field(player,'mainlineStage')===stage&&(!own(c,'playerId')||exactId(field(c,'playerId'))===viewer.playerId)&&(!own(c,'worldId')||exactId(field(c,'worldId'))===viewer.worldId);
}
function assertQuiet(client){if(client.pending?.length||client.watchers?.length||client.promptUncertain||client.lateResponses?.size||client.uncertainWrites?.size)throw blocked('SOURCE_CONNECTION_UNCERTAIN');}
function positions(rows,report=false){
 if(!dense(rows)||!rows.length)return null;const parsed=[];
 for(const row of rows){
  if(!object(row)||!own(row,'pos')||!object(row.pos)||!own(row.pos,'x')||!own(row.pos,'y')||!int32(row.pos.x)||!int32(row.pos.y))return null;
  const hero=report?field(row,'hero'):row,id=field(hero,'heroId');
  if(!text(id)||report&&(field(row,'boss')===true||field(row,'assistant')===true||own(row,'summon')&&row.summon!==null||own(row,'extSummons')&&(!dense(row.extSummons)||row.extSummons.length>0)))return null;
  parsed.push({heroId:id,pos:{x:row.pos.x,y:row.pos.y}});
 }
 if(new Set(parsed.map(r=>r.heroId)).size!==parsed.length||new Set(parsed.map(r=>r.pos.x+':'+r.pos.y)).size!==parsed.length)return null;
 return parsed.sort((a,b)=>a.heroId.localeCompare(b.heroId));
}
function parseList(raw){
 if(!own(raw,'pass')||!dense(raw.pass))return null;const rows=[];
 for(const row of raw.pass){
  const playerId=exactId(field(row,'playerId')),worldId=exactId(field(row,'worldId')),replayId=exactId(field(row,'replayId')),heroPositions=positions(field(row,'hero'));
  if(!playerId||!worldId||!replayId||!heroPositions)return null;
  const power=own(row,'power')?exactId(row.power,{zero:true}):null;if(own(row,'power')&&power===null)return null;
  if(own(row,'nickname')&&(typeof row.nickname!=='string'||row.nickname.length>256))return null;
  rows.push({playerId,worldId,replayId,nickname:typeof row.nickname==='string'?row.nickname:'',power,heroPositions});
 }
 if(new Set(rows.map(r=>r.replayId)).size!==rows.length)return null;return rows;
}
function parseReport(raw,stage){
 const data=field(raw,'initialData'),team=field(data,'leftTeam');
 if(!object(data)||field(data,'battleType')!==1||field(data,'mainlineStage')!==stage||!positive(field(team,'presetId')))return null;
 const heroPositions=positions(field(team,'members'),true);return heroPositions?{presetId:team.presetId,heroPositions}:null;
}
function fact(value,source,sourceAt,viewer,stage,reliable){return createStateFact(value,{accountId:viewer.accountId,generation:viewer.generation,source,sourceAt,scope:scopeFor(stage),reliable});}
function fresh(value,source,viewer,stage){return value?.provenance?.source===source&&factsFreshnessPolicy(value,{accountId:viewer.accountId,generation:viewer.generation,scope:scopeFor(stage),maxAgeMs:30000}).status==='FRESH';}
function activeFor(client,player,viewer,stage,options){return ()=>{assertExecutionActive(client,options);if(!contextMatches(client,player,viewer,stage))throw Object.assign(new Error('极限来源读取期间账号、角色、世界、连接或主线进度已变化'),{code:'CANCELLED'});};}
async function requestSource(client,protocol,request,body,response,{active,signal,stop,timeout}){
 active();assertQuiet(client);if(!protocol?.[request]||!protocol?.[response])throw blocked('SOURCE_PROTOCOL_UNAVAILABLE');
 let value;try{value=await awaitExecution(client.request(request,body,response,timeout,{signal}),client,{signal,stop});}catch(error){if(executionOutcome(error)==='CANCELLED')throw error;throw blocked('SOURCE_RESPONSE_UNKNOWN');}
 const sourceAt=Date.now();active();assertQuiet(client);return {value:snapshot(value),sourceAt};
}
export async function surveyExtremeFormationList(client,protocol,{player,viewerContext,signal,stop,timeout=15000}={}){
 const viewer=normalizeViewer(viewerContext),stage=field(player,'mainlineStage');if(!viewer||!positive(stage))throw blocked('VIEWER_CONTEXT_OR_CURRENT_STAGE_UNKNOWN');
 const active=activeFor(client,player,viewer,stage,{signal,stop});active();
 const read=await requestSource(client,protocol,'RaidExtremePassRequest',{module:3,raidId:stage},'RaidExtremePassResponse',{active,signal,stop,timeout}),rows=parseList(read.value),listFact=fact(read.value,'RaidExtremePassResponse',read.sourceAt,viewer,stage,rows!==null);
 return {module:moduleId,viewerContext:viewer,stage,rows:rows??[],listFact,sourceFacts:{list:listFact},notes:rows===null?['EXTREME_PASS_LIST_UNRELIABLE']:[],evidence:EXTREME_FORMATION_EVIDENCE};
}
export async function surveyExtremeFormations(client,protocol,{parameters,config,player,viewerContext,signal,stop,timeout=15000}={}){
 parameters=validateExtremeFormationParameters(parameters);if(parameters.stage!==field(player,'mainlineStage'))throw blocked('SOURCE_STAGE_IS_NOT_CURRENT_STAGE');
 const list=await surveyExtremeFormationList(client,protocol,{player,viewerContext,signal,stop,timeout}),viewer=list.viewerContext,stage=list.stage,active=activeFor(client,player,viewer,stage,{signal,stop});
 const selected=list.rows.filter(row=>['playerId','worldId','replayId'].every(key=>row[key]===parameters[key]));
 if(selected.length!==1||!fresh(list.listFact,'RaidExtremePassResponse',viewer,stage))throw blocked('EXACT_SOURCE_NOT_IN_CURRENT_LIST');
 const report=await requestSource(client,protocol,'BattleReportRequest',{reportId:parameters.replayId},'BattleReportResponse',{active,signal,stop,timeout}),mapped=parseReport(report.value,stage);
 if(!mapped||!same(mapped.heroPositions,selected[0].heroPositions))throw blocked('SOURCE_REPORT_MODE_STAGE_OR_HERO_MAPPING_MISMATCH');
 const captured=new Map(),observed=new Map();
 const observedClient=new Proxy(client,{get(target,key){if(key!=='request'){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}return async(...args)=>{active();const value=await awaitExecution(target.request(...args),client,{signal,stop});const sourceAt=Date.now();active();captured.set(args[0],snapshot(value));observed.set(args[2],sourceAt);return value;};}});
 active();assertQuiet(client);const targetFacts=await surveyFormation(observedClient,protocol,{config,player,signal});active();assertQuiet(client);
 const targetInputs={formation:captured.get('GetFormationRequest')??null,presets:captured.get('MyFormationPresetRequest')??null,heroes:captured.get('AllHeroRequest')??null};
 const targetSources=Object.fromEntries(Object.entries(targetSpecs).map(([key,source])=>[key,fact(targetInputs[key],source,observed.get(source)??null,viewer,stage,targetFacts.reliability?.[key]===true)]));
 return {...list,parameters,selected:copy(selected[0]),reportInput:report.value,reportFact:fact(report.value,'BattleReportResponse',report.sourceAt,viewer,stage,true),mapping:mapped,targetInputs,targetFacts,targetSourceFacts:targetSources,sourceFacts:{...list.sourceFacts,report:fact(report.value,'BattleReportResponse',report.sourceAt,viewer,stage,true),...targetSources}};
}
function validateAuthority(facts,{viewerContext,parameters,config,player}){
 const viewer=normalizeViewer(viewerContext),stage=parameters.stage;
 if(!viewer||!same(viewer,facts?.viewerContext)||stage!==field(player,'mainlineStage')||exactId(field(player,'playerId'))!==viewer.playerId||exactId(field(player,'worldId'))!==viewer.worldId||facts.stage!==stage)throw blocked('VIEWER_OR_STAGE_MISMATCH');
 if(!fresh(facts.listFact,'RaidExtremePassResponse',viewer,stage)||!same(facts.sourceFacts?.list,facts.listFact))throw blocked('EXTREME_LIST_STALE_OR_UNRELIABLE');
 const rows=parseList(facts.listFact.value),selected=rows?.filter(row=>['playerId','worldId','replayId'].every(key=>row[key]===parameters[key]));
 if(selected?.length!==1||!same(rows,facts.rows)||!same(selected[0],facts.selected)||!same(parameters,facts.parameters))throw blocked('EXTREME_SOURCE_PROJECTION_MISMATCH');
 if(!fresh(facts.reportFact,'BattleReportResponse',viewer,stage)||!same(facts.reportFact,facts.sourceFacts?.report)||!same(facts.reportFact.value,facts.reportInput)||facts.reportFact.provenance.sourceAt<facts.listFact.provenance.sourceAt)throw blocked('REPORT_STALE_OR_UNCORRELATED');
 const mapping=parseReport(facts.reportFact.value,stage);if(!mapping||!same(mapping.heroPositions,selected[0].heroPositions)||!same(mapping,facts.mapping))throw blocked('SOURCE_REPORT_MODE_STAGE_OR_HERO_MAPPING_MISMATCH');
 const raw=facts.targetInputs,core=facts.targetFacts;
 for(const [key,source]of Object.entries(targetSpecs))if(!fresh(facts.targetSourceFacts?.[key],source,viewer,stage)||!same(facts.targetSourceFacts[key],facts.sourceFacts?.[key])||!same(facts.targetSourceFacts[key].value,raw?.[key])||facts.targetSourceFacts[key].provenance.sourceAt<facts.reportFact.provenance.sourceAt)throw blocked('TARGET_SOURCE_STALE_OR_UNRELIABLE');
 const formation=parseFormation(field(raw?.formation,'formation')),presets=field(raw?.presets,'ids'),heroes=field(raw?.heroes,'heroes');
 if(!formation||!own(formation,'petUid')||exactId(formation.petUid,{zero:true})===null||!dense(presets)||presets.some(v=>!positive(v))||new Set(presets).size!==presets.length||!dense(heroes)||heroes.some(v=>!text(field(v,'heroId')))||new Set(heroes.map(v=>v.heroId)).size!==heroes.length)throw blocked('TARGET_FORMATION_PRESETS_OR_OWNERSHIP_UNKNOWN');
 if(!same(formation,core?.formation)||!same([...new Set([1,...presets])].sort((a,b)=>a-b),core.unlockedPresetIds)||!same(heroes.map(v=>v.heroId),core.ownedHeroIds)||!same(core.catalog,catalogFrom(config,player))||!['formation','presets','heroes','config'].every(key=>core.reliability?.[key]===true))throw blocked('TARGET_PROJECTION_OR_CONFIG_MISMATCH');
 return {viewer,selected:selected[0],mapping,formation};
}
export function prepareExtremeFormation(facts,{parameters=facts?.parameters,moduleConfig={enabled:false},viewerContext,config,player}={}){
 parameters=validateExtremeFormationParameters(parameters);const {selected,mapping,formation}=validateAuthority(facts,{viewerContext,parameters,config,player});
 const targetParameters={presetId:mapping.presetId,heroPositions:copy(mapping.heroPositions)},planned=planFormation(facts.targetFacts,{parameters:targetParameters,moduleConfig});
 const candidate=planned.actions?.[0];if(planned.actions?.length!==1||!same(candidate.parameters,targetParameters)||exactId(candidate.expectedState?.petUid,{zero:true})!==exactId(formation.petUid,{zero:true}))throw blocked('TARGET_FORMATION_APPLY_BLOCKED: '+(planned.notes??[]).join('; '));
 return {module:moduleId,mode:'MAINLINE',parameters:targetParameters,preservedPetUid:copy(formation.petUid),source:{kind:'SERVER_EXTREME_PASS_SOURCE',stage:parameters.stage,playerId:selected.playerId,worldId:selected.worldId,replayId:selected.replayId,nickname:selected.nickname,power:selected.power,heroPositions:copy(selected.heroPositions),presetId:mapping.presetId,listSourceAt:facts.listFact.provenance.sourceAt,reportSourceAt:facts.reportFact.provenance.sourceAt,independentVictoryVerification:false},requiresFreshSurvey:true,requiresFreshPlan:true,requiresAuthorization:true,resumable:false,automaticApply:false,evidence:EXTREME_FORMATION_EVIDENCE};
}
export function viewExtremeFormations(facts){
 const viewer=normalizeViewer(facts?.viewerContext),stage=facts?.stage;let rows=[];const notes=[...(facts?.notes??[])];
 if(viewer&&positive(stage)&&fresh(facts.listFact,'RaidExtremePassResponse',viewer,stage)){const parsed=parseList(facts.listFact.value);if(parsed&&same(parsed,facts.rows))rows=parsed;else notes.push('EXTREME_PASS_LIST_UNRELIABLE');}else notes.push('EXTREME_PASS_LIST_STALE_OR_UNRELIABLE');
 return {module:moduleId,stage:positive(stage)?stage:null,rows:copy(rows),notes,evidence:EXTREME_FORMATION_EVIDENCE};
}
