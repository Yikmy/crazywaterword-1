// W16/C511: exact page observations; no mail read/claim mutation is proven yet.
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { createStateFact } from './state-facts.mjs';
import { stableBusinessValue } from './business-functions.mjs';

const moduleId='mail',maxPage=2147483647;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const own=(v,k)=>{const d=object(v)?Object.getOwnPropertyDescriptor(v,k):null;return d?.enumerable&&Object.hasOwn(d,'value')?d.value:undefined;};
const fields=(v,keys)=>object(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&Object.getOwnPropertyDescriptor(v,k)?.enumerable&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'));
const dense=v=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=10000&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,i)).every(d=>d?.enumerable&&Object.hasOwn(d,'value'));
const uint=v=>Number.isInteger(v)&&v>=0&&v<=maxPage;
const identifier=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v.trim()===v&&!/[\u0000-\u001f\u007f]/.test(v);
const invalid=message=>Object.assign(new Error(message),{code:'INVALID_PARAMETERS',statusCode:400});
const same=(a,b)=>stableBusinessValue(a)===stableBusinessValue(b);
export const MAIL_DEFAULT_CONFIG=Object.freeze({enabled:false});
export function validateMailConfig(v={}) {
  if(!fields(v,['enabled'])||Object.hasOwn(v,'enabled')&&typeof v.enabled!=='boolean')throw invalid('邮件配置只接受 enabled 布尔值');
  return {enabled:v.enabled??false};
}
export function validateMailParameters(v={}) {
  if(!fields(v,['pageNo'])||Object.hasOwn(v,'pageNo')&&!uint(v.pageNo))throw invalid('邮件 pageNo 须为非负 int32 页码');
  return {pageNo:v.pageNo??0};
}
function int64(v,{positive=false}={}) {
  let value;
  if(typeof v==='number'&&Number.isSafeInteger(v))value=BigInt(v);
  else if(typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(v))value=BigInt(v);
  else if(object(v)&&Number.isInteger(own(v,'low'))&&own(v,'low')>=-2147483648&&own(v,'low')<=maxPage&&Number.isInteger(own(v,'high'))&&own(v,'high')>=-2147483648&&own(v,'high')<=maxPage&&own(v,'unsigned')===false)value=(BigInt(own(v,'high'))<<32n)+BigInt(own(v,'low')>>>0);
  return value===undefined||value<(positive?1n:0n)||value>((1n<<63n)-1n)?null:String(value);
}
function contextOf(client,player) {
  const c=client.factContext,role=key=>{const id=int64(own(player,key),{positive:true});return own(c,key)!==undefined&&int64(own(c,key),{positive:true})!==id?null:id;};
  return {accountId:identifier(own(c,'accountId'))?own(c,'accountId'):null,generation:Number.isSafeInteger(own(c,'generation'))&&own(c,'generation')>=0?own(c,'generation'):null,
    connectionId:identifier(own(c,'connectionId'))?own(c,'connectionId'):null,playerId:role('playerId'),worldId:role('worldId')};
}
function attachments(raw) {
  if(raw===null)return {hasAttachment:false,assets:[],other:{heroes:0,equips:0,antiques:0},status:'AVAILABLE'};
  const assets=own(own(raw,'assets'),'asset'),other=Object.fromEntries(['heroes','equips','antiques'].map(key=>[key,dense(own(raw,key))?own(raw,key).length:null]));
  const valid=dense(assets)&&assets.every(row=>[0,1].includes(own(row,'type'))&&identifier(own(row,'id'))&&int64(own(row,'num'),{positive:true})!==null)
    &&new Set(assets.map(row=>own(row,'type')+':'+own(row,'id'))).size===assets.length;
  const parsed=valid?assets.map(row=>({type:own(row,'type')===0?'ITEM':'RESOURCE',id:own(row,'id'),num:int64(own(row,'num'),{positive:true})})):null;
  const found=valid&&assets.length>0||Object.values(other).some(n=>n!==null&&n>0),complete=valid&&Object.values(other).every(n=>n!==null);
  return {hasAttachment:found?true:complete?false:null,assets:parsed,other,status:complete?'AVAILABLE':'PARTIAL'};
}
export function mailPage(raw,{pageNo=0}={}) {
  const list=own(raw,'email'),total=own(raw,'total'),totalReported=uint(total)?total:null;
  const valid=dense(list)&&list.every(row=>int64(own(row,'emailId'),{positive:true})!==null)&&new Set(list.map(row=>int64(own(row,'emailId'),{positive:true}))).size===list.length;
  const emails=valid?list.map(row=>{
    const status=own(row,'status'),read=status===1?true:status===2?false:null,got=typeof own(row,'got')==='boolean'?own(row,'got'):null;
    const attachment=attachments(own(row,'attachment'));
    const eligible=read===null||got===null||attachment.hasAttachment===null?null:read&&!got&&attachment.hasAttachment;
    return {emailId:int64(own(row,'emailId'),{positive:true}),subject:typeof own(row,'subject')==='string'?own(row,'subject').slice(0,500):null,
      read,got,attachment,eligibility:eligible,executable:false,blockedReason:'MAIL_READ_CLAIM_SETTLEMENT_UNVERIFIED'};
  }):[];
  return {pageNo,totalReported,pageCount:valid?emails.length:null,emails,status:valid?'AVAILABLE':'UNKNOWN',reason:valid?null:'MAIL_LIST_OR_ID_UNKNOWN',
    scope:'CURRENT_PAGE_ONLY',allPagesComplete:false,hasNext:null,hasPrevious:pageNo>0};
}
export async function surveyMail(client,protocol,{parameters={},player,signal,stop,timeout=15000}={}) {
  parameters=validateMailParameters(parameters);const context=contextOf(client,player),options={signal,stop},notes=[];
  const active=()=>assertExecutionActive(client,options);active();
  let page=mailPage(null,parameters),sourceAt=null;
  const contextKnown=identifier(context.accountId)&&identifier(context.connectionId)&&context.generation!==null&&context.playerId!==null&&context.worldId!==null;
  if(!contextKnown)notes.push('MAIL_CONTEXT_UNKNOWN');
  else if(!protocol?.EmailBoxRequest||!protocol?.EmailBoxResponse)notes.push('MAIL_PROTOCOL_UNAVAILABLE');
  else try {
    const raw=await awaitExecution(client.request('EmailBoxRequest',{pageNo:parameters.pageNo},'EmailBoxResponse',timeout,{signal}),client,options);
    sourceAt=Date.now();page=mailPage(raw,parameters);
  }catch(error){if(executionOutcome(error)==='CANCELLED')throw error;notes.push('MAIL_PAGE_READ_FAILED');}
  active();if(!same(context,contextOf(client,player)))throw Object.assign(new Error('邮件采集期间账号或连接改变'),{code:'CANCELLED'});
  const fact=createStateFact(page,{accountId:context.accountId,generation:context.generation,source:'EmailBoxResponse',sourceAt,scope:{kind:'ENTITY',key:'mail-page:'+parameters.pageNo},reliable:contextKnown&&page.status==='AVAILABLE'});
  return {module:moduleId,parameters,context,page,sourceFact:fact,notes,stockReliable:false,stock:null};
}
export function viewMail(facts) {
  return {module:moduleId,page:structuredClone(facts?.page??mailPage(null)),provenance:structuredClone(facts?.sourceFact?.provenance??null),candidates:[],
    notes:[...(facts?.notes??[]),'只展示所选页；total 原值不证明页数、全量或快照一致性。未读及附件领取写合同待核实。']};
}
export function planMail(_facts,{parameters={},selections=[]}={}) {
  validateMailParameters(parameters);if(!dense(selections)||selections.length)throw Object.assign(new Error('邮件当前仅支持分页观察'),{code:'MAIL_READ_ONLY',statusCode:400});
  return {module:moduleId,actions:[],notes:['MAIL_READ_CLAIM_SETTLEMENT_UNVERIFIED']};
}
export const mailModule=Object.freeze({id:moduleId,label:'邮件',capabilities:Object.freeze(['C511']),defaultConfig:MAIL_DEFAULT_CONFIG,validateConfig:validateMailConfig,
  validateParameters:validateMailParameters,survey:surveyMail,view:viewMail,plan:planMail,verify:()=>({confirmed:false,reason:'邮件写操作及附件结算尚未核实'})});
