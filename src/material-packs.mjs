// W04 / BIZ-R14: explicitly chosen owned material packs; shared executor only.
import { createHash } from 'node:crypto';
import { parseOperationInventory } from './hero-operations.mjs';
import { ResourceLedger } from './resource-ledger.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { createStateFact, factsFreshnessPolicy } from './state-facts.mjs';
import { toSnapshotJson } from './game.mjs';
import { stableBusinessValue, businessRejectionIdentity } from './business-functions.mjs';

const moduleId='material-packs',request='SelectPackRequest',scope={kind:'ACCOUNT'};
const copy=v=>structuredClone(v),same=(a,b)=>stableBusinessValue(a)===stableBusinessValue(b);
const hash=v=>createHash('sha256').update(stableBusinessValue(v)).digest('hex');
const own=(v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},'value');
const positive=v=>Number.isInteger(v)&&v>0&&v<=2147483647;
const text=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v.trim()===v&&!/[\u0000-\u001f\u007f]/.test(v);
const fields=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&Object.getOwnPropertyDescriptor(v,k)?.enumerable&&own(v,k));
const dense=v=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=10000&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,i)).every(d=>d?.enumerable&&Object.hasOwn(d,'value'));
const invalid=message=>Object.assign(new Error(message),{code:'INVALID_PARAMETERS',statusCode:400});
export const MATERIAL_PACK_TARGETS=Object.freeze({'原料自选包':Object.freeze(['鱼','塑料','木材','碎布','金属','玻璃','海藻']),'工事材料自选包':Object.freeze(['耐火砖','高温合金','炮弹','压电陶瓷','碳纤维','液态金属'])});
export const MATERIAL_PACK_EVIDENCE=Object.freeze({source:'Fixed v76 SelectPackPop.ts / WorldIdRule.ts; SelectPackLibCfg / ItemCfg',moduleByteOffset:5986541,moduleSha256:'f68699a8acc6c4b7030d2847586936231c72c3bd81b6a4f2e3a311b2dda4a4f7',semantics:'num is number of owned packs; selectItemId is chosen material; reward num is per pack; season=floor(worldId/1e6 % 1e3)',realGame:'REAL_UNVERIFIED'});
export const MATERIAL_PACK_DEFAULT_CONFIG=Object.freeze({enabled:false});
const configNames=['ItemCfg','SelectPackLibCfg'],sources={items:'AllItemResponse',resources:'AllResourceResponse'},liveFacts=new WeakMap();
const costSource='Fixed v76 SelectPackPop._onBtnOpen: num owned packs; SelectPackLibCfg.num per-pack output and season; ItemCfg material type';
export function validateMaterialPackConfig(v={}){if(!fields(v,['enabled'])||own(v,'enabled')&&typeof v.enabled!=='boolean')throw invalid('材料包配置只允许 enabled 布尔值');return {enabled:v.enabled??false};}
export function validateMaterialPackParameters(v={}){
 if(!fields(v,['packId','itemId','num']))throw invalid('材料包参数只允许 packId、itemId、num');
 if(Reflect.ownKeys(v).length===0)return {};
 if(!['packId','itemId','num'].every(k=>own(v,k))||!Object.hasOwn(MATERIAL_PACK_TARGETS,v.packId)||!MATERIAL_PACK_TARGETS[v.packId].includes(v.itemId)||!positive(v.num))throw invalid('必须明确两种普通材料包之一、合法材料和正 int32 包数');
 return {packId:v.packId,itemId:v.itemId,num:v.num};
}
function roleId(v) {
 if(typeof v==='number'&&(!Number.isSafeInteger(v)||v<=0))return null;
 const n=toSnapshotJson(v);
 if(!(typeof n==='number'||typeof n==='string'&&/^[1-9][0-9]*$/.test(n)))return null;
 try{return BigInt(n)>0n&&BigInt(n)<(1n<<63n)?String(n):null;}catch{return null;}
}
function contextOf(client,player) {
 const c=client.factContext,role=k=>{const id=own(player,k)?roleId(player[k]):null;return own(c,k)&&roleId(c[k])!==id?null:id;};
 return {accountId:text(c?.accountId)?c.accountId:null,generation:Number.isSafeInteger(c?.generation)&&c.generation>=0?c.generation:null,connectionId:text(c?.connectionId)?c.connectionId:null,playerId:role('playerId'),worldId:role('worldId')};
}

const stockState=stock=>[...stock].filter(([,num])=>num>0).sort(([a],[b])=>a.localeCompare(b)).map(([id,num])=>({id,num}));
const snapshot=(inputs,context)=>{const i=parseOperationInventory(inputs?.items,inputs?.resources);return i.stockReliable?{context,inventory:stockState(i.stock)}:null;};
const digest=f=>hash({parameters:f.parameters,context:f.context,configEvidence:f.configEvidence,inputs:f.inputs,sourceFacts:f.sourceFacts,state:f.state,stock:[...f.stock].sort(),stockReliable:f.stockReliable,available:f.available});
export async function surveyMaterialPacks(client,protocol,{config,player,parameters={},signal,stop,timeout=15000}={}){
 parameters=validateMaterialPackParameters(parameters);const opts={signal,stop},context=contextOf(client,player),notes=[];
 const active=()=>assertExecutionActive(client,opts);active();
 const observations=await Promise.all(Object.entries(sources).map(async([key,response])=>{
  const name=response.replace(/Response$/,'Request');active();
  if(!protocol?.[name]||!protocol?.[response]){notes.push(name+': PROTOCOL_UNAVAILABLE');return[key,null,null];}
  try{const value=await awaitExecution(client.request(name,{},response,timeout,{signal}),client,opts);return[key,value,Date.now()];}
  catch(e){if(executionOutcome(e)==='CANCELLED')throw e;notes.push(name+': STATE_UNKNOWN');return[key,null,null];}
 }));
 active();if(!same(context,contextOf(client,player)))throw Object.assign(new Error('材料包采集期间账号或连接变化'),{code:'CANCELLED'});
 const raw=Object.fromEntries(observations.map(([k,v])=>[k,v])),inputs=toSnapshotJson(raw),inventory=parseOperationInventory(raw.items,raw.resources);
 const sourceFacts=Object.fromEntries(observations.map(([k,,sourceAt])=>[k,createStateFact(inputs[k],{accountId:context.accountId,generation:context.generation,source:sources[k],sourceAt,scope,reliable:inventory.stockReliable})]));
 const f={module:moduleId,parameters,context,configEvidence:{tables:Object.fromEntries(configNames.map(n=>[n,copy(config?.tables?.[n]??null)]))},inputs,sourceFacts,...inventory,state:inventory.stockReliable?snapshot(inputs,context):null,available:Object.keys(protocol??{}),notes};
 liveFacts.set(f,{client,player,digest:digest(f)});return f;
}
function authority(f){
 const live=liveFacts.get(f),c=f?.context;
 if(!live||live.digest!==digest(f)||live.client.connected!==true||!same(c,contextOf(live.client,live.player))||!text(c?.accountId)||!text(c?.connectionId)||!Number.isSafeInteger(c?.generation)||c.generation<0||!c.playerId||!c.worldId||!f.state||f.stockReliable!==true||!(f.stock instanceof Map)||!same(snapshot(f.inputs,c),f.state))return false;
 return Object.entries(sources).every(([k,source])=>f.sourceFacts?.[k]?.provenance?.source===source&&same(f.sourceFacts[k].value,f.inputs[k])&&factsFreshnessPolicy(f.sourceFacts[k],{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope}).status==='FRESH');
}
function seasonOf(context){try{const id=BigInt(context.worldId);return id>0n?Number(id/1000000n%1000n):null;}catch{return null;}}
function reward(config,packId,itemId){
 const rows=config?.tables?.SelectPackLibCfg?.data,items=config?.tables?.ItemCfg?.data;
 if(!dense(rows)||!dense(items))return null;
 const selected=rows.filter(r=>own(r,'itemId')&&r.itemId===packId&&own(r,'selectItemId')&&r.selectItemId===itemId);
 const pack=items.filter(r=>own(r,'id')&&r.id===packId),item=items.filter(r=>own(r,'id')&&r.id===itemId);
 if(selected.length!==1||pack.length!==1||item.length!==1||!own(pack[0],'type')||pack[0].type!=='自选包'||!own(item[0],'type')||item[0].type!==(packId==='原料自选包'?'原料':'加工品'))return null;
 const row=selected[0];return own(row,'type')&&row.type==='道具'&&own(row,'num')&&positive(row.num)&&own(row,'season')&&positive(row.season)?{num:row.num,season:row.season}:null;
}
function candidate(f,parameters,{config,moduleConfig=MATERIAL_PACK_DEFAULT_CONFIG}={}){
 const {packId,itemId,num}=parameters,valid=authority(f),matching=same(configNames.map(n=>config?.tables?.[n]??null),configNames.map(n=>f?.configEvidence?.tables?.[n]??null));
 const r=matching?reward(f?.configEvidence,packId,itemId):null,season=valid?seasonOf(f.context):null;
 const have=valid?(f.stock.get(packId)??0):null,gain=r?num*r.num:null,stock=valid?new Map(f.stock):null;
 const total=valid&&gain!==null?(stock.get(itemId)??0)+gain:null;
 const blockedReason=!validateMaterialPackConfig(moduleConfig).enabled?'MATERIAL_PACK_DISABLED':!valid?'MATERIAL_PACK_AUTHORITY_UNKNOWN':!r?'MATERIAL_PACK_CONFIG_UNKNOWN':season===null||season<r.season?'MATERIAL_PACK_SEASON_LOCKED':!f.available.includes(request)?'PROTOCOL_UNAVAILABLE':have<num?'MATERIAL_PACK_SHORTAGE':!Number.isSafeInteger(gain)||!Number.isSafeInteger(total)?'MATERIAL_PACK_QUANTITY_OVERFLOW':null;
 const beforeState=copy(f?.state??null);let expectedState=null;
 if(stock&&r&&have>=num&&Number.isSafeInteger(gain)&&Number.isSafeInteger(total)){stock.set(packId,have-num);stock.set(itemId,total);expectedState={context:copy(f.context),inventory:stockState(stock)};}
 const identity=hash({beforeState,parameters,reward:r,season}),costs=[{id:packId,num}],budgetClaims={resources:copy(costs),quotas:[],uids:[]};
 return {module:moduleId,actionId:moduleId+':'+identity,actionType:'EXCHANGE',target:{packId,itemId},parameters:copy(parameters),identity,beforeState,expectedState,costs,costSource,budgetClaims,executable:blockedReason===null,blockedReason,label:packId+' ×'+num+' → '+itemId+' ×'+(gain??'未知'),gain,have,season,requiredSeason:r?.season??null,...(blockedReason===null?{action:{request,response:null,body:{itemId:packId,selectItemId:itemId,num}}}:{})};
}
export function viewMaterialPacks(f,options={}){
 const parameters=validateMaterialPackParameters(options.parameters??{}),valid=authority(f);
 return {module:moduleId,season:valid?seasonOf(f.context):null,packs:Object.entries(MATERIAL_PACK_TARGETS).map(([packId,targets])=>({packId,have:valid?(f.stock.get(packId)??0):null,targets:targets.map(itemId=>{const r=reward(f?.configEvidence,packId,itemId);return {itemId,perPack:r?.num??null,requiredSeason:r?.season??null,have:valid?(f.stock.get(itemId)??0):null};})})),candidates:Object.keys(parameters).length?[candidate(f,parameters,options)]:[],notes:[...(f?.notes??[]),'必须明确包、目标及数量，单独授权兑换；预计所得不作为库存或生产预算，只有完整库存复读确认扣包得料后才成功。']};
}
export function planMaterialPacks(f,{parameters={},selections=[],ledger=new ResourceLedger(f?.stockReliable===true?f.stock:null),...options}={}){
 if(!dense(selections)||selections.length>1||selections.some(v=>!text(v)))throw invalid('每批仅允许一个精确材料包兑换');
 const row=viewMaterialPacks(f,{...options,parameters}).candidates.find(r=>r.executable&&selections.includes(r.actionId));
 return {module:moduleId,actions:row&&ledger.reserve(row.costs)?[row]:[],notes:[]};
}
export function verifyMaterialPack(operation,before,after){
 const no=reason=>({confirmed:false,reason});
 if(!authority(before)||!authority(after)||!same(before.context,after.context)||!same(before.configEvidence,after.configEvidence))return no('材料包前后身份、库存或配置不可靠');
 const canonical=candidate(before,before.parameters,{config:before.configEvidence,moduleConfig:{enabled:true}});
 if(!canonical.executable||['module','actionId','actionType','target','parameters','identity','beforeState','expectedState','costs','costSource','budgetClaims','action'].some(k=>!same(operation?.[k],canonical[k])))return no('材料包合同与明确选择或写前事实不一致');
 if(Object.keys(sources).some(k=>after.sourceFacts[k].provenance.sourceAt<before.sourceFacts[k].provenance.sourceAt)||!same(after.state,canonical.expectedState))return no('完整独立库存未同时确认精确扣包、目标得料及其他余额不变');
 return {confirmed:true,afterState:copy(after.state),reason:'完整独立库存精确扣包与目标材料净入共同确认',responseEvidence:{packId:operation.parameters.packId,itemId:operation.parameters.itemId,packsUsed:operation.parameters.num,materialReceived:canonical.gain}};
}
export function materialPackDependencyVersions({config,moduleConfig=MATERIAL_PACK_DEFAULT_CONFIG}={}){return {moduleConfig:validateMaterialPackConfig(moduleConfig),tables:Object.fromEntries(configNames.map(n=>[n,copy(config?.tables?.[n]??null)]))};}
export const materialPackModule=Object.freeze({id:moduleId,label:'持有材料包兑换',capabilities:Object.freeze(['BIZ-R14']),defaultConfig:MATERIAL_PACK_DEFAULT_CONFIG,validateConfig:validateMaterialPackConfig,validateParameters:validateMaterialPackParameters,survey:surveyMaterialPacks,view:viewMaterialPacks,plan:planMaterialPacks,verify:verifyMaterialPack,rejectionIdentity:businessRejectionIdentity,dependencyVersions:materialPackDependencyVersions});
