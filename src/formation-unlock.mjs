// Owned ordinary formation blueprints only. Shared OperationService owns permits,
// account locks, transport, finite budgets, cancellation and durable UNKNOWN.
import { createHash } from 'node:crypto';
import { surveyFormation, parseFormation, catalogFrom } from './formation.mjs';
import { parseOperationInventory } from './hero-operations.mjs';
import { ResourceLedger, safeResourceQuantity } from './resource-ledger.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { createStateFact, factsFreshnessPolicy } from './state-facts.mjs';
import { toSnapshotJson } from './game.mjs';
import { stableBusinessValue, businessRejectionIdentity } from './business-functions.mjs';

const own=(v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(v,k);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const dense=v=>Array.isArray(v)&&v.length<=10000&&Array.from({length:v.length},(_,i)=>own(v,i)).every(Boolean);
const text=v=>typeof v==='string'&&v.length>0&&v.length<=256&&v.trim()===v&&!/[\u0000-\u001f\u007f]/.test(v);
const integer=v=>Number.isInteger(v)&&v>0&&v<=2147483647;
const preset=v=>integer(v)&&v>=2&&v<=24;
const same=(a,b)=>stableBusinessValue(a)===stableBusinessValue(b),copy=v=>structuredClone(v);
const hash=v=>createHash('sha256').update(stableBusinessValue(v)).digest('hex');
const invalid=message=>Object.assign(new Error(message),{code:'INVALID_PARAMETERS',statusCode:400});
const fields=(v,keys)=>object(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).every(k=>typeof k==='string'&&keys.includes(k)&&own(Object.getOwnPropertyDescriptor(v,k),'value')&&Object.getOwnPropertyDescriptor(v,k).enumerable);
const source='v76 FormationTypePanel._onBtnOK/_refreshCurFormationInfo; FormationTypeUnlockCfg.unlockCost; owned matching ordinary blueprint only, no ACCESS_POP purchase or automatic application';
const formationScope=Object.freeze({kind:'ENTITY',key:'MAINLINE:1'}),accountScope=Object.freeze({kind:'ACCOUNT'});
const sourceSpecs=Object.freeze({formation:['GetFormationResponse',formationScope],presets:['MyFormationPresetResponse',accountScope],items:['AllItemResponse',accountScope],resources:['AllResourceResponse',accountScope]});
const tableNames=['FormationTypeUnlockCfg','ItemCfg','FormationTypePositionCfg'];
export const FORMATION_UNLOCK_DEFAULT_CONFIG=Object.freeze({enabled:false});
export const FORMATION_UNLOCK_EVIDENCE=Object.freeze({capabilityId:'FRM-005',ordinaryOwnedBlueprint:'STATIC_VERIFIED',typedResponse:'NOT_DEFINED',purchase:'EXCLUDED_D6',automaticApply:'EXCLUDED',realGame:'REAL_UNVERIFIED'});
export function validateFormationUnlockConfig(v={}){if(!fields(v,['enabled'])||own(v,'enabled')&&typeof v.enabled!=='boolean')throw invalid('阵型图纸解锁配置仅允许 enabled 布尔值');return {enabled:v.enabled??false};}
export function validateFormationUnlockParameters(v={}){if(!fields(v,['presetId'])||own(v,'presetId')&&!preset(v.presetId))throw invalid('普通解锁仅接受单个 presetId，范围 2–24');return own(v,'presetId')?{presetId:v.presetId}:{};}
function parsePresets(raw){if(!own(raw,'ids')||!dense(raw.ids)||!raw.ids.every(integer)||new Set(raw.ids).size!==raw.ids.length)return null;return [...new Set([1,...raw.ids])].sort((a,b)=>a-b);}
function completeFormation(raw){const formation=own(raw,'formation')?parseFormation(raw.formation):null;return formation&&own(formation,'petUid')&&formation.heroPositions.length?formation:null;}
const stockEntries=stock=>[...stock].sort(([a],[b])=>a.localeCompare(b));
const reliableStock=stock=>stock instanceof Map&&[...stock].every(([key,value])=>text(key)&&typeof value==='number'&&safeResourceQuantity(value)===value);
const stockState=stock=>[...stock].filter(([,num])=>num>0).sort(([a],[b])=>a.localeCompare(b)).map(([id,num])=>({id,num}));
function catalog(config,player){
 const rows=config?.tables?.FormationTypeUnlockCfg?.data,items=config?.tables?.ItemCfg?.data,layouts=catalogFrom(config,player).layouts,bad=()=>({reliable:false,templates:[]});
 const keys=['id','name','unlockDesc','buffId','activeDesc','unlockCost','unlockEffect','unlockDescParams','activeDescParams'];
 if(!dense(rows)||!rows.length||!dense(items)||!items.length||new Set(rows.map(r=>r?.id)).size!==rows.length||new Set(items.map(r=>r?.id)).size!==items.length)return bad();
 const templates=[];
 for(const row of rows){
  if(!fields(row,keys)||!preset(row.id)||!dense(row.unlockCost)||row.unlockCost.length!==2||row.unlockCost[0]!=='阵型'+row.id+'图纸'||row.unlockCost[1]!==1)return bad();
  const item=items.find(v=>v?.id===row.unlockCost[0]),layout=layouts.find(v=>v.id===row.id);
  if(!item||item.type!=='阵型图纸'||!layout?.reliable||!layout.positions.length)return bad();
  templates.push({presetId:row.id,name:typeof row.name==='string'?row.name:'阵型'+row.id,costs:[{id:row.unlockCost[0],num:1}],positions:copy(layout.positions)});
 }
 return {reliable:true,templates:templates.sort((a,b)=>a.presetId-b.presetId)};
}
function exactRoleId(value){
 if(typeof value==='number'&&!Number.isSafeInteger(value))return null;
 const normalized=toSnapshotJson(value);if(!(typeof normalized==='number'&&Number.isSafeInteger(normalized))&&!(typeof normalized==='string'&&/^[1-9]\d*$/.test(normalized)))return null;
 try{const id=BigInt(normalized);return id>0n&&id<(1n<<63n)?id.toString():null;}catch{return null;}
}
function contextOf(client,player){const c=client.factContext,role=key=>{const value=own(player,key)?exactRoleId(player[key]):null;return own(c,key)&&exactRoleId(c[key])!==value?null:value;};return {accountId:text(c?.accountId)?c.accountId:null,playerId:role('playerId'),worldId:role('worldId'),generation:Number.isSafeInteger(c?.generation)&&c.generation>=0?c.generation:null,connectionId:text(c?.connectionId)?c.connectionId:null};}
export async function surveyFormationUnlock(client,protocol,{config,player,parameters={},signal,stop,timeout=15000}={}){
 parameters=validateFormationUnlockParameters(parameters);const options={config,player,signal,stop,timeout},active=()=>assertExecutionActive(client,options),context=contextOf(client,player),captured=new Map(),observedAt=new Map(),notes=[];
 active();
 // Observe existing Formation reads without extending their completion times or
 // replacing their parser. Each source retains its actual response timestamp.
 const observedClient=new Proxy(client,{get(target,key){if(key!=='request'){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}return async(...args)=>{active();const value=await awaitExecution(target.request(...args),client,options);captured.set(args[0],value);observedAt.set(args[2],Date.now());return value;};}});
 const read=async(request,response)=>{active();if(!protocol?.[request]||!protocol?.[response]){notes.push(request+': PROTOCOL_UNAVAILABLE');return null;}try{return await awaitExecution(observedClient.request(request,{},response,timeout,{signal}),client,options);}catch(error){if(executionOutcome(error)==='CANCELLED')throw error;notes.push(request+': STATE_UNKNOWN');return null;}};
 const [core]=await Promise.all([surveyFormation(observedClient,protocol,options),read('AllItemRequest','AllItemResponse'),read('AllResourceRequest','AllResourceResponse')]);
 active();if(!same(context,contextOf(client,player)))throw Object.assign(new Error('阵型解锁采集期间账号或代次改变'),{code:'CANCELLED'});
 const raw={formation:captured.get('GetFormationRequest')??null,presets:captured.get('MyFormationPresetRequest')??null,items:captured.get('AllItemRequest')??null,resources:captured.get('AllResourceRequest')??null};
 const inputs=toSnapshotJson(raw),formation=completeFormation(raw.formation),unlockedPresetIds=parsePresets(raw.presets),inventory=parseOperationInventory(raw.items,raw.resources);
 const reliable={formation:formation!==null,presets:unlockedPresetIds!==null,items:inventory.stockReliable,resources:inventory.stockReliable};
 const sourceFacts=Object.fromEntries(Object.entries(sourceSpecs).map(([key,[name,scope]])=>[key,createStateFact(inputs[key],{accountId:context.accountId,generation:context.generation,source:name,sourceAt:observedAt.get(name)??null,scope,reliable:reliable[key]})]));
 const state={context,formation,unlockedPresetIds,inventory:inventory.stockReliable?stockState(inventory.stock):null};
 return {module:'formation-unlock',parameters,identityContext:context,formation,unlockedPresetIds,...inventory,catalog:catalog(config,player),inputs,sourceFacts,available:Object.keys(protocol??{}),notes:[...core.errors,...notes],evidence:FORMATION_UNLOCK_EVIDENCE,state};
}
function authority(f){
 const c=f?.identityContext;if(!text(c?.accountId)||exactRoleId(c.playerId)!==c.playerId||exactRoleId(c.worldId)!==c.worldId||c.playerId===null||c.worldId===null||!Number.isSafeInteger(c.generation)||c.generation<0)return false;
 const inputs=f.inputs,formation=completeFormation(inputs?.formation),presets=parsePresets(inputs?.presets),inventory=parseOperationInventory(inputs?.items,inputs?.resources);
 if(!formation||!presets||!inventory.stockReliable||f.stockReliable!==true||!reliableStock(f.stock)||!same(formation,f.formation)||!same(presets,f.unlockedPresetIds)||!same(stockEntries(inventory.stock),stockEntries(f.stock)))return false;
 if(!same(f.state,{context:c,formation,unlockedPresetIds:presets,inventory:stockState(inventory.stock)}))return false;
 return Object.entries(sourceSpecs).every(([key,[name,scope]])=>f.sourceFacts?.[key]?.provenance?.source===name&&same(f.sourceFacts[key].value,inputs[key])&&factsFreshnessPolicy(f.sourceFacts[key],{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope}).status==='FRESH');
}
function candidate(f,p,{config,player,moduleConfig=FORMATION_UNLOCK_DEFAULT_CONFIG}={}){
 p=validateFormationUnlockParameters(p);moduleConfig=validateFormationUnlockConfig(moduleConfig);
 const template=f?.catalog?.templates?.find(v=>v.presetId===p.presetId),costs=template?copy(template.costs):[];let reason=null;
 if(!p.presetId)reason='EXPLICIT_SINGLE_PRESET_REQUIRED';
 else if(!moduleConfig.enabled)reason='FORMATION_UNLOCK_DISABLED';
 else if(!authority(f))reason='FORMATION_UNLOCK_AUTHORITY_UNKNOWN';
 else if(!f.catalog?.reliable||!same(f.catalog,catalog(config,player))||!template)reason='FORMATION_UNLOCK_CONFIG_UNKNOWN';
 else if(!f.available?.includes('UnlockFormationPresetRequest'))reason='PROTOCOL_UNAVAILABLE';
 else if(f.unlockedPresetIds.includes(p.presetId))reason='PRESET_ALREADY_UNLOCKED';
 else if((f.stock.get(costs[0].id)??0)<1)reason='OWNED_BLUEPRINT_REQUIRED';
 const beforeState=copy(f?.state??null),identity=hash({beforeState,template:template??null}),expectedState=authority(f)&&template&&Array.isArray(beforeState?.unlockedPresetIds)&&Array.isArray(beforeState?.inventory)?{...copy(beforeState),unlockedPresetIds:[...new Set([...beforeState.unlockedPresetIds,p.presetId])].sort((a,b)=>a-b),inventory:stockState(new Map(beforeState.inventory.map(v=>[v.id,v.num])).set(costs[0].id,(f.stock?.get(costs[0].id)??0)-1))}:null;
 return {module:'formation-unlock',capabilityId:'FRM-005',actionId:'formation-unlock:UNLOCK:'+String(p.presetId??'?')+':'+identity,actionType:'UNLOCK',target:{presetId:p.presetId??null},parameters:p,costs,costSource:source,beforeState,identity,expectedState,executable:reason===null,blockedReason:reason,label:'普通图纸解锁 '+(template?.name??String(p.presetId??'')),...(reason===null?{action:{request:'UnlockFormationPresetRequest',response:null,body:{id:p.presetId}}}:{})};
}
export function viewFormationUnlock(f,options={}){const parameters=validateFormationUnlockParameters(options.parameters??{}),choices=own(parameters,'presetId')?[parameters]:(f?.catalog?.templates??[]).map(v=>({presetId:v.presetId}));return {module:'formation-unlock',formation:copy(f?.formation??null),unlockedPresetIds:copy(f?.unlockedPresetIds??null),templates:copy(f?.catalog?.templates??[]),inventory:f?.stockReliable===true&&reliableStock(f.stock)?stockState(f.stock):null,candidates:choices.map(p=>candidate(f,p,options)),reliability:{authority:authority(f),catalog:f?.catalog?.reliable===true,inventory:f?.stockReliable===true},evidence:FORMATION_UNLOCK_EVIDENCE,notes:[...(f?.notes??[]),'只消耗已经持有的对应普通图纸；不购买、不兑换、不自动应用阵容。']};}
export function planFormationUnlock(f,{parameters={},selections,ledger=new ResourceLedger(f?.stockReliable===true?f.stock:null),...options}={}){
 parameters=validateFormationUnlockParameters(parameters);if(selections!==undefined&&(!dense(selections)||selections.some(v=>!text(v))||new Set(selections).size!==selections.length))throw invalid('selections 必须为不重复的明确 actionId');
 if(!own(parameters,'presetId'))return {module:'formation-unlock',actions:[],notes:['需要明确选择一个普通图纸解锁模板']};
 const row=candidate(f,parameters,options);if(row.executable&&(selections===undefined||selections.includes(row.actionId))&&ledger.reserve(row.costs))return {module:'formation-unlock',actions:[row],notes:[]};
 return {module:'formation-unlock',actions:[],notes:[row.blockedReason??'ACTION_NOT_SELECTED_OR_SHARED_BUDGET_EXHAUSTED']};
}
export function verifyFormationUnlock(operation,before,after,response){
 const failed=reason=>({confirmed:false,reason});
 if(response!==null&&response!==undefined)return failed('没有专用Unlock成功响应，不能用调用者回包替代权威复读');
 const target=operation?.target?.presetId;if(!preset(target)||operation.actionType!=='UNLOCK'||operation.action?.request!=='UnlockFormationPresetRequest'||operation.action?.response!==null||!same(operation.action.body,{id:target})||!same(operation.parameters,{presetId:target})||operation.costSource!==source)return failed('解锁请求、单目标或成本来源不匹配');
 if(!authority(before)||!authority(after)||!same(before.identityContext,after.identityContext)||!before.catalog?.reliable||!same(before.catalog,after.catalog))return failed('前后权威事实、账号代次或解锁配置不可靠');
 if(Object.keys(sourceSpecs).some(key=>after.sourceFacts[key].provenance.sourceAt<before.sourceFacts[key].provenance.sourceAt))return failed('写后权威来源时戳早于写前观察');
 const template=before.catalog.templates.find(row=>row.presetId===target);if(!template||!same(operation.costs,template.costs)||!same(operation.beforeState,before.state)||operation.identity!==hash({beforeState:before.state,template}))return failed('写前完整状态、图纸费用或动作身份不匹配');
 if(before.unlockedPresetIds.includes(target)||!same(after.unlockedPresetIds,[...before.unlockedPresetIds,target].sort((a,b)=>a-b)))return failed('完整模板集合没有且仅新增指定模板');
 if(!same(before.formation,after.formation))return failed('普通解锁不得应用阵容或改变英雄站位及宠物');
 const cost=template.costs[0],stock=new Map(before.stock);if((stock.get(cost.id)??0)<cost.num)return failed('写前图纸不足');stock.set(cost.id,stock.get(cost.id)-cost.num);
 const expected={...copy(before.state),unlockedPresetIds:[...before.unlockedPresetIds,target].sort((a,b)=>a-b),inventory:stockState(stock)};
 if(!same(after.state,expected)||!same(operation.expectedState,expected))return failed('库存未精确净扣对应图纸，或其他完整状态变化');
 return {confirmed:true,reason:'MyFormationPreset完整集合仅新增指定模板，权威库存精确净扣自有图纸1张，原完整阵容与宠物保持不变',afterState:copy(after.state),responseEvidence:{typedResponse:'NOT_DEFINED',authority:['MyFormationPresetResponse','AllItemResponse','AllResourceResponse','GetFormationResponse']}};
}
export function formationUnlockDependencyVersions({config,player,moduleConfig=FORMATION_UNLOCK_DEFAULT_CONFIG}={}){return {catalog:catalog(config,player),tables:Object.fromEntries(tableNames.map(name=>[name,copy(config?.tables?.[name]??null)])),config:validateFormationUnlockConfig(moduleConfig)};}
export const formationUnlockModule=Object.freeze({id:'formation-unlock',label:'普通阵型图纸解锁',capabilities:Object.freeze(['FRM-005']),defaultConfig:FORMATION_UNLOCK_DEFAULT_CONFIG,validateConfig:validateFormationUnlockConfig,validateParameters:validateFormationUnlockParameters,survey:surveyFormationUnlock,view:viewFormationUnlock,plan:planFormationUnlock,verify:verifyFormationUnlock,rejectionIdentity:businessRejectionIdentity,dependencyVersions:formationUnlockDependencyVersions});
