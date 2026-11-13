// W16/C511: exact page observations, single-mail attachment claims and empty-mail reads.
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { createStateFact, factsFreshnessPolicy } from './state-facts.mjs';
import { createHash } from 'node:crypto';
import { toSnapshotJson } from './game.mjs';
import { parseOperationInventory } from './hero-operations.mjs';
import { ResourceLedger, safeResourceQuantity, RESOURCE_NAMES } from './resource-ledger.mjs';
import { assertPaymentAllowed } from './actions.mjs';
import { stableBusinessValue, businessRejectionIdentity } from './business-functions.mjs';

const moduleId='mail',maxPage=2147483647;
// Fixed v76 AllMailModel.hasNextPage/nextPageNo and GameConstants.MAIL_PAGE_SIZE.
const mailPageSize=10,maxEnumerationPages=100;
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
  if(!fields(v,['pageNo','action','emailId','maxPages'])||Object.hasOwn(v,'pageNo')&&!uint(v.pageNo))throw invalid('邮件仅允许 pageNo、action、emailId、maxPages；pageNo 须为非负 int32');
  if(v.action==='enumerate'){
    if(Object.hasOwn(v,'pageNo')||Object.hasOwn(v,'emailId')||Object.hasOwn(v,'maxPages')&&(!Number.isInteger(v.maxPages)||v.maxPages<1||v.maxPages>maxEnumerationPages))throw invalid('邮箱枚举从0页开始，maxPages须为1至100的明确页数上限，不接受邮件ID');
    return {action:'enumerate',maxPages:v.maxPages??20};
  }
  if(Object.hasOwn(v,'maxPages'))throw invalid('maxPages仅用于明确的邮箱枚举');
  if(Object.hasOwn(v,'action')&&!['claim','read'].includes(v.action))throw invalid('邮件仅支持单封 action=claim/read 或只读 enumerate');
  if(Object.hasOwn(v,'emailId')&&(typeof v.emailId!=='string'||int64(v.emailId,{positive:true})!==v.emailId))throw invalid('emailId 须为精确正 int64 字符串');
  if(Object.hasOwn(v,'action')!==Object.hasOwn(v,'emailId'))throw invalid('单封操作必须同时指定 action=claim/read 和 emailId');
  return {...v,pageNo:v.pageNo??0};
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
export async function surveyMail(client,protocol,{config,parameters={},player,signal,stop,timeout=15000}={}) {
  parameters=validateMailParameters(parameters);if(parameters.action==='enumerate')return surveyMailbox(client,protocol,{parameters,player,signal,stop,timeout});if(['claim','read'].includes(parameters.action))return surveyClaim(client,protocol,{parameters,player,signal,stop,timeout,config});const context=contextOf(client,player),options={signal,stop},notes=[];
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
// A complete traversal proves observed page coverage only. The protocol has no
// mailbox revision/snapshot token; even matching totals cannot prove atomicity.
// Each subsequent claim/read must freshly survey its exact page and email ID.
async function surveyMailbox(client,protocol,{parameters,player,signal,stop,timeout}){
 const context=contextOf(client,player),options={signal,stop},pages=[],sourceFacts=[],seen=new Set();
 const active=()=>{assertExecutionActive(client,options);if(!same(context,contextOf(client,player)))throw Object.assign(new Error('邮件枚举期间账号或连接改变'),{code:'CANCELLED'});};active();
 const known=identifier(context.accountId)&&identifier(context.connectionId)&&context.generation!==null&&context.playerId!==null&&context.worldId!==null;
 let total=null,expectedPages=null,reason=null,complete=false;
 if(!known)reason='MAIL_CONTEXT_UNKNOWN';
 else if(!protocol?.EmailBoxRequest||!protocol?.EmailBoxResponse)reason='MAIL_PROTOCOL_UNAVAILABLE';
 else for(let pageNo=0;pageNo<parameters.maxPages;pageNo++){
  active();let raw,sourceAt;
  try{raw=await awaitExecution(client.request('EmailBoxRequest',{pageNo},'EmailBoxResponse',timeout,{signal}),client,options);sourceAt=Date.now();}
  catch(error){if(executionOutcome(error)==='CANCELLED')throw error;reason='MAIL_PAGE_READ_FAILED';break;}
  active();const page=mailPage(raw,{pageNo});pages.push(page);
  sourceFacts.push(createStateFact(page,{accountId:context.accountId,generation:context.generation,source:'EmailBoxResponse',sourceAt,scope:{kind:'ENTITY',key:'mail-page:'+pageNo},reliable:page.status==='AVAILABLE'}));
  if(page.status!=='AVAILABLE'){reason='MAIL_LIST_OR_ID_UNKNOWN';break;}
  if(page.totalReported===null){reason='MAIL_TOTAL_UNKNOWN';break;}
  if(total===null){total=page.totalReported;expectedPages=Math.max(1,Math.ceil(total/mailPageSize));}
  else if(page.totalReported!==total){reason='MAIL_TOTAL_CHANGED';break;}
  const expectedCount=Math.min(mailPageSize,Math.max(0,total-pageNo*mailPageSize));
  if(page.pageCount!==expectedCount){reason='MAIL_PAGE_SIZE_MISMATCH';break;}
  if(page.emails.some(row=>seen.has(row.emailId))){reason='MAIL_CROSS_PAGE_DUPLICATE_ID';break;}
  for(const row of page.emails)seen.add(row.emailId);
  if(pageNo+1===expectedPages){complete=seen.size===total;if(!complete)reason='MAIL_ENUMERATION_COUNT_MISMATCH';break;}
 }
 active();if(!complete&&!reason)reason='MAIL_PAGE_LIMIT_REACHED';
 const mailbox={scope:'OBSERVED_MAILBOX_PAGES',status:complete?'COMPLETE':pages.length?'PARTIAL':'UNKNOWN',allPagesComplete:complete,atomicSnapshot:false,
  totalReported:total,pageSize:mailPageSize,expectedPages,readPages:pages.length,maxPages:parameters.maxPages,reason,pages,
  emails:pages.flatMap(page=>page.emails.map(row=>({...row,pageNo:page.pageNo})))};
 return {module:moduleId,parameters,context,page:pages[0]??mailPage(null),mailbox,sourceFacts,notes:reason?[reason]:[],stockReliable:false,stock:null};
}
const hash=value=>createHash('sha256').update(stableBusinessValue(value)).digest('hex');
const copy=value=>structuredClone(value);
const privateClaims=new WeakMap();
const claimQueries=[['page','EmailBoxRequest','EmailBoxResponse'],['items','AllItemRequest','AllItemResponse'],['resources','AllResourceRequest','AllResourceResponse']];
const digest=f=>hash({...f,stock:[...(f.stock??[])]});
const omitStatus=row=>Object.fromEntries(Object.entries(row).filter(([k])=>!['status','got'].includes(k)));
function catalog(config){
 const rows=config?.tables?.ItemCfg?.data;
 return dense(rows)&&rows.length&&rows.every(r=>identifier(own(r,'id')))&&new Set(rows.map(r=>r.id)).size===rows.length?rows.map(r=>r.id).sort():null;
}
function claimObservation(raw,p,config){
 const page=mailPage(raw,p),rows=own(raw,'email'),total=own(raw,'total'),cat=catalog(config);
 if(page.status!=='AVAILABLE'||!uint(total)||!cat)return null;
 const target=rows.find(row=>int64(own(row,'emailId'),{positive:true})===p.emailId);
 if(!target)return null;
 const attachment=own(target,'attachment'),assets=own(own(attachment,'assets'),'asset');
 if(!dense(assets)||(p.action==='read'?assets.length!==0:!assets.length)||!['heroes','equips','antiques'].every(k=>dense(own(attachment,k))&&own(attachment,k).length===0))return null;
 const rewards=[];
 for(const r of assets){
  const type=own(r,'type'),id=own(r,'id'),num=safeResourceQuantity(own(r,'num'));
  if(!identifier(id)||num===null||num<=0||!(type===0&&cat.includes(id)&&!Object.values(RESOURCE_NAMES).includes(id)||type===1&&Object.values(RESOURCE_NAMES).includes(id)))return null;
  rewards.push({id,num});
 }
 if(new Set(rewards.map(r=>r.id)).size!==rewards.length||![1,2].includes(own(target,'status'))||typeof own(target,'got')!=='boolean')return null;
 const normalized=toSnapshotJson(target);
 return {page,target:page.emails.find(r=>r.emailId===p.emailId),rewards:rewards.sort((a,b)=>a.id.localeCompare(b.id)),
  immutable:hash(omitStatus(normalized)),others:rows.filter(r=>int64(own(r,'emailId'),{positive:true})!==p.emailId).map(r=>({id:int64(own(r,'emailId'),{positive:true}),hash:hash(toSnapshotJson(r))})).sort((a,b)=>a.id.localeCompare(b.id)),total};
}
async function surveyClaim(client,protocol,{config,parameters,player,signal,stop,timeout}){
 const context=contextOf(client,player),active=()=>assertExecutionActive(client,{signal,stop}),notes=[];active();
 const known=identifier(context.accountId)&&identifier(context.connectionId)&&context.generation!==null&&context.playerId!==null&&context.worldId!==null;
 const results=await Promise.all(claimQueries.map(async([key,request,response])=>{
  if(!known||!protocol?.[request]||!protocol?.[response])return [key,null,null];
  try{active();const raw=await awaitExecution(client.request(request,key==='page'?{pageNo:parameters.pageNo}:{},response,timeout,{signal}),client,{signal,stop});return [key,raw,Date.now()];}
  catch(error){if(executionOutcome(error)==='CANCELLED')throw error;notes.push('MAIL_CLAIM_'+key.toUpperCase()+'_READ_FAILED');return [key,null,null];}
 }));active();if(!same(context,contextOf(client,player)))throw Object.assign(new Error('邮件调查期间账号或连接改变'),{code:'CANCELLED'});
 const raw=Object.fromEntries(results.map(([k,v])=>[k,v])),observation=claimObservation(raw.page,parameters,config),inventory=parseOperationInventory(raw.items,raw.resources);
 const sourceFacts=Object.fromEntries(results.map(([k,v,sourceAt],i)=>[k,createStateFact(k==='page'?observation:{reliable:inventory.stockReliable},{accountId:context.accountId,generation:context.generation,source:claimQueries[i][2],sourceAt,scope:{kind:'ACCOUNT'},reliable:known&&(k==='page'?observation!==null:inventory.stockReliable)})]));
 const f={module:moduleId,parameters,context,page:mailPage(raw.page,parameters),observation,...inventory,sourceFacts,notes,available:Object.keys(protocol??{}),catalog:catalog(config)};
 privateClaims.set(f,{client,player,digest:digest(f)});return f;
}
function authority(f,config){
 const live=privateClaims.get(f),c=f?.context;
 return !!(live&&live.digest===digest(f)&&same(c,contextOf(live.client,live.player))&&identifier(c.accountId)&&identifier(c.connectionId)&&c.generation!==null&&c.playerId&&c.worldId&&f.observation&&f.stockReliable&&same(f.catalog,catalog(config))&&f.catalog&&claimQueries.every(([key,,source])=>f.sourceFacts?.[key]?.provenance.source===source&&factsFreshnessPolicy(f.sourceFacts[key],{accountId:c.accountId,generation:c.generation,scope:{kind:'ACCOUNT'},maxAgeMs:30000}).status==='FRESH'));
}
export function mailDependencyVersions({config,moduleConfig=MAIL_DEFAULT_CONFIG}={}){
 return {moduleConfig:validateMailConfig(moduleConfig),'config.ItemCfg':copy(config?.tables?.ItemCfg??null)};
}
function claimCandidate(f,{config,moduleConfig=MAIL_DEFAULT_CONFIG,parameters=f?.parameters??{}}={}){
 const p=validateMailParameters(parameters),enabled=validateMailConfig(moduleConfig).enabled,valid=authority(f,config),o=valid?f.observation:null,read=p.action==='read',actionType=read?'READ':'CLAIM';
 let reason=!['claim','read'].includes(p.action)?'MAIL_EXPLICIT_SINGLE_CLAIM_REQUIRED':!enabled?'MAIL_MODULE_DISABLED':!valid?'MAIL_ATTACHMENT_OR_AUTHORITY_UNKNOWN':read?(o.target.read!==false?'MAIL_ALREADY_READ':null):o.target.got!==false?'MAIL_ALREADY_CLAIMED':null;
 if(!reason&&(!f.available.includes('QuickGotReadEmailRequest')||f.available.includes('QuickGotReadEmailResponse')))reason='MAIL_PROTOCOL_UNAVAILABLE';
 if(!reason&&(!same(f.parameters,p)||o.rewards.some(r=>!Number.isSafeInteger((f.stock.get(r.id)??0)+r.num))))reason='MAIL_PARAMETERS_OR_REWARD_RANGE_INVALID';
 const action={request:'QuickGotReadEmailRequest',response:null,body:{emailId:[p.emailId],all:false}};
 if(!reason)try{assertPaymentAllowed({...action,costs:[]});}catch(e){reason=e.code??'MAIL_REQUEST_NOT_ALLOWED';}
 const target={pageNo:p.pageNo,emailId:p.emailId??null,attachmentFingerprint:o?.immutable??null};
 return {module:moduleId,actionId:'mail:'+actionType+':'+hash(target),actionType,label:(read?'标记单封无附件邮件已读 ':'领取单封邮件附件 ')+(p.emailId??'')+(o&&!read?'：'+o.rewards.map(r=>r.id+' × '+r.num).join('；'):''),parameters:p,target,
  executable:reason===null,blockedReason:reason,costs:[],rewards:o?copy(o.rewards):[],costSource:read?'v76 MailDetailPop.open ES_NEW without attachments; _onBtnGotOrDelete exact emailId/all=false; independent empty attachments and unchanged inventory':'v76 MailDetailPop._onBtnGotOrDelete; exact EmailDetail.attachment; all=false, one emailId',
  identity:o?hash({context:f.context,observation:o,dependencies:mailDependencyVersions({config,moduleConfig})}):null,configEvidence:{ItemCfg:copy(config?.tables?.ItemCfg??null)},
  beforeState:o?copy(o.target):null,expectedState:o?{emailId:p.emailId,read:true,got:true,rewards:copy(o.rewards)}:null,
  budgetClaims:{resources:[],quotas:[],uids:p.emailId?[{type:'mail',id:p.emailId}]:[]},...(reason===null?{action}:{})};
}
export function viewMail(facts,options={}) {
 const claim=privateClaims.has(facts),candidate=claim?claimCandidate(facts,options):null;
 return {module:moduleId,page:copy(facts?.page??mailPage(null)),...(facts?.mailbox?{mailbox:copy(facts.mailbox),pageProvenance:copy(facts.sourceFacts.map(f=>f.provenance))}:{}),provenance:copy(facts?.sourceFact?.provenance??facts?.sourceFacts?.page?.provenance??null),candidates:candidate?[candidate]:[],
  notes:[...(facts?.notes??[]),'普通读取只展示所选页；明确枚举按固定客户端每页10封逐页观察，页数上限内总数稳定、数量匹配且ID唯一才标为分页覆盖完成，不证明原子快照一致。单封普通道具/资源附件和完整空附件未读邮件仍须重新精确探测和授权；批量及实例附件继续冻结。']};
}
export function planMail(facts,{parameters={},selections=[],ledger=new ResourceLedger(facts?.stockReliable?facts.stock:null),...options}={}) {
 const p=validateMailParameters(parameters);
 if(!dense(selections)||selections.length>1||selections.some(v=>!identifier(v)))throw invalid('每批仅允许一个明确邮件动作');
 if(!['claim','read'].includes(p.action)){if(selections.length)throw Object.assign(new Error('分页观察不接受写动作选择'),{code:'MAIL_READ_ONLY',statusCode:400});return {module:moduleId,actions:[],notes:['MAIL_EXPLICIT_SINGLE_CLAIM_REQUIRED']};}
 const c=claimCandidate(facts,{...options,parameters:p});return {module:moduleId,actions:c.executable&&selections.includes(c.actionId)&&ledger.reserve([])?[c]:[],notes:c.blockedReason?[c.blockedReason]:[]};
}
export function verifyMailClaim(op,b,a){
 const fail=reason=>({confirmed:false,reason}),config={tables:op?.configEvidence??{}};
 if(!authority(b,config)||!authority(a,config)||!same(b.context,a.context))return fail('MAIL_AUTHORITY_OR_CONTEXT_UNKNOWN');
 let expected;try{expected=claimCandidate(b,{config,moduleConfig:{enabled:true},parameters:op?.parameters});}catch{return fail('MAIL_OPERATION_PARAMETERS_INVALID');}
 if(!expected.executable||['module','actionId','actionType','parameters','target','identity','costs','rewards','costSource','beforeState','expectedState','budgetClaims','action','configEvidence'].some(k=>!same(op[k],expected[k])))return fail('MAIL_OPERATION_CONTRACT_MISMATCH');
 if(claimQueries.some(([key])=>a.sourceFacts[key].provenance.sourceAt<b.sourceFacts[key].provenance.sourceAt))return fail('MAIL_POST_READ_PREDATES_BASELINE');
 const x=b.observation,y=a.observation;
 if(!same(b.parameters,a.parameters)||x.immutable!==y.immutable||x.total!==y.total||!same(x.others,y.others)||!same(x.rewards,y.rewards)||y.target.read!==true||y.target.got!==true)return fail('MAIL_EXACT_CLAIM_STATE_NOT_CONFIRMED');
 const income=new Map(x.rewards.map(r=>[r.id,r.num]));
 if([...new Set([...b.stock.keys(),...a.stock.keys(),...income.keys()])].some(k=>(a.stock.get(k)??0)!==(b.stock.get(k)??0)+(income.get(k)??0)))return fail('MAIL_EXACT_ATTACHMENT_NET_INCOME_NOT_CONFIRMED');
 if(!authority(b,config)||!authority(a,config))return fail('MAIL_AUTHORITY_EXPIRED_DURING_VERIFICATION');
 return {confirmed:true,reason:op.actionType==='READ'?'独立邮件页确认同一空附件邮件已读，完整库存不变；未领取或删除其他邮件':'独立邮件页确认同一邮件已读已领且附件不变，完整库存确认精确附件净入；未领取其他邮件',afterState:copy(y.target)};
}
export const mailModule=Object.freeze({id:moduleId,label:'邮件',capabilities:Object.freeze(['C511']),defaultConfig:MAIL_DEFAULT_CONFIG,validateConfig:validateMailConfig,
 validateParameters:validateMailParameters,survey:surveyMail,view:viewMail,plan:planMail,verify:verifyMailClaim,
 // The exact mail contract and original History role remain authoritative;
 // reconnecting cannot turn a definite refusal into a new business observation.
 rejectionIdentity(operation,{context}={}) {
  if(!operation?.beforeState||!operation.expectedState||!context)return null;
  return businessRejectionIdentity({...operation,beforeState:{...operation.beforeState,context},expectedState:{...operation.expectedState,context}});
 },dependencyVersions:mailDependencyVersions});
