// W08: Expedition mode of the existing formation Function; no second executor.
import {createHash} from 'node:crypto';
import {parseFormation,catalogFrom,viewFormation,validateFormationParameters} from './formation.mjs';
import {parseOperationInventory} from './hero-operations.mjs';
import {ResourceLedger} from './resource-ledger.mjs';
import {assertExecutionActive,awaitExecution,executionOutcome} from './execution.mjs';
import {createStateFact,factsFreshnessPolicy} from './state-facts.mjs';
import {toSnapshotJson} from './game.mjs';
import {stableBusinessValue} from './business-functions.mjs';

const copy=v=>structuredClone(v),same=(a,b)=>stableBusinessValue(a)===stableBusinessValue(b);
const hash=v=>createHash('sha256').update(stableBusinessValue(v)).digest('hex');
const own=(v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(v,k);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const fields=(v,keys)=>plain(v)&&Reflect.ownKeys(v).every(k=>typeof k==='string'&&keys.includes(k)&&Object.getOwnPropertyDescriptor(v,k)?.enumerable&&own(Object.getOwnPropertyDescriptor(v,k),'value'));
const dense=v=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=10000&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,i)).every(d=>d?.enumerable&&own(d,'value'));
const positive=n=>Number.isInteger(n)&&n>0&&n<=2147483647;
const text=s=>typeof s==='string'&&s.length>0&&s.length<=200&&s.trim()===s&&!/[\u0000-\u001f\u007f]/.test(s);
const invalid=m=>Object.assign(Error(m),{code:'INVALID_PARAMETERS',statusCode:400});
const configNames=['FormationTypePositionCfg','FormationHeroNumCfg','HeroCfg','ExpeditionRaidCfg'];
const sources={info:'ExpeditionInfoResponse',presets:'MyFormationPresetResponse',heroes:'AllHeroResponse',items:'AllItemResponse',resources:'AllResourceResponse'};
const scope={kind:'ACCOUNT'},live=new WeakMap();
const costSource='Fixed v76 ExpeditionFormationView.saveFormation/onSwitchFormationType; exact active raidId, selected living owned heroes, preserve petUid, zero resource debit; no entering/reset/fight';
export const EXPEDITION_FORMATION_EVIDENCE=Object.freeze({source:'Existing fixed v76 package manifest; ExpeditionFormationView.ts',byte:2150424,sha256:'ff5f64087bfd5368a6d700014e3a4b7b96b030b9fdc451681ce315271d457f76',qualification:'ExpeditionModel.getHeroList/getHeroHp; FormationBase.maxFormationHeroes; ExpeditionUtil.checkInfoIsExpire uses server seconds'});
function decimal(v) {
 if(typeof v==='number'&&(!Number.isSafeInteger(v)||v<0))return null;
 const value=toSnapshotJson(v);if(!['string','number'].includes(typeof value)||!/^(0|[1-9][0-9]*)$/.test(String(value)))return null;
 try{const n=BigInt(value);return n>=0n&&n<(1n<<63n)?String(n):null;}catch{return null;}
}
function contextOf(client,player) {
 const c=client.factContext,id=k=>{const v=own(player,k)?decimal(player[k]):null;return v&&v!=='0'&&(!own(c,k)||decimal(c[k])===v)?v:null;};
 return {accountId:text(c?.accountId)?c.accountId:null,generation:Number.isSafeInteger(c?.generation)&&c.generation>=0?c.generation:null,connectionId:text(c?.connectionId)?c.connectionId:null,
  playerId:id('playerId'),worldId:id('worldId'),playerLevel:own(player,'level')&&positive(player.level)?player.level:null,mainlineStage:own(player,'mainlineStage')&&positive(player.mainlineStage)?player.mainlineStage:null};
}
export function validateExpeditionFormationParameters(v) {
 if(!fields(v,['mode','raidId','presetId','heroIds','heroPositions'])||v.mode!=='expedition'||!own(v,'raidId')||!positive(v.raidId))throw invalid('远征阵容需要 mode=expedition 和明确正整数 raidId');
 const rest=Object.fromEntries(Object.entries(v).filter(([k])=>!['mode','raidId'].includes(k)));
 return {mode:'expedition',raidId:v.raidId,...validateFormationParameters(rest)};
}
function parseInfo(v) {
 const required=['raidId','stageFormId','endTime','passedStage','hero','buff','gotFinal','isFirst','formation','stageBuff','stagePower','passedRaid'];
 if(!plain(v)||required.some(k=>!own(v,k))||!positive(v.raidId)||![v.stageFormId,v.passedStage].every(n=>Number.isInteger(n)&&n>=0&&n<=2147483647)||!Number.isSafeInteger(v.endTime)||v.endTime<=0||v.endTime>Math.floor(Number.MAX_SAFE_INTEGER/1000)||typeof v.gotFinal!=='boolean'||typeof v.isFirst!=='boolean'||decimal(v.stagePower)===null)return null;
 if(!['buff','stageBuff','passedRaid'].every(k=>dense(v[k])&&v[k].every(positive)&&new Set(v[k]).size===v[k].length)||!dense(v.hero)||!v.hero.length||v.hero.some(r=>!own(r,'heroId')||!text(r.heroId)||!own(r,'hp')||decimal(r.hp)===null)||new Set(v.hero.map(r=>r.heroId)).size!==v.hero.length)return null;
 const formation=parseFormation(v.formation);if(!formation||!own(formation,'petUid')||decimal(formation.petUid)===null||!formation.heroPositions.length)return null;
 return {...toSnapshotJson(v),formation,hero:v.hero.map(r=>({heroId:r.heroId,hp:decimal(r.hp)})).sort((a,b)=>a.heroId.localeCompare(b.heroId)),stagePower:decimal(v.stagePower)};
}
const stockState=s=>[...s].filter(([,n])=>n>0).sort(([a],[b])=>a.localeCompare(b)).map(([id,num])=>({id,num}));
function stateOf(inputs,context) {
 const info=parseInfo(inputs?.info),stock=parseOperationInventory(inputs?.items,inputs?.resources),heroes=inputs?.heroes?.heroes,presets=inputs?.presets?.ids;
 if(!info||!stock.stockReliable||!dense(heroes)||heroes.some(r=>!own(r,'heroId')||!text(r.heroId))||new Set(heroes.map(r=>r.heroId)).size!==heroes.length||!dense(presets)||presets.some(n=>!positive(n))||new Set(presets).size!==presets.length)return null;
 return {context,info,heroes:toSnapshotJson(heroes).sort((a,b)=>a.heroId.localeCompare(b.heroId)),presets:[...presets].sort((a,b)=>a-b),inventory:stockState(stock.stock)};
}
const seal=f=>hash({parameters:f.parameters,context:f.context,inputs:f.inputs,state:f.state,configEvidence:f.configEvidence,sourceFacts:f.sourceFacts,available:f.available,base:f.base,stock:[...f.stock],stockReliable:f.stockReliable});
function clockFor(client,c) {
 let clock;try{clock=client.gameClock?.read(c);}catch{return null;}
 return clock?.status==='TRUSTED'&&clock.reliable===true&&clock.source==='PingResponse.serverTimestamp'&&clock.accountId===c.accountId&&clock.generation===c.generation&&['earliestMs','nowMs','latestMs'].every(k=>own(clock,k)&&Number.isFinite(clock[k])&&clock[k]>=0&&clock[k]<=Number.MAX_SAFE_INTEGER)&&clock.earliestMs<=clock.nowMs&&clock.nowMs<=clock.latestMs?clock:null;
}
export async function surveyExpeditionFormation(client,protocol,{config,player,parameters,signal}={}) {
 parameters=validateExpeditionFormationParameters(parameters);const context=contextOf(client,player),notes=[],active=()=>assertExecutionActive(client,{signal});active();
 const rows=await Promise.all(Object.entries(sources).map(async([key,response])=>{const request=response.replace(/Response$/,'Request');active();if(!protocol?.[request]||!protocol?.[response])return [key,null,null];
  try{const value=await awaitExecution(client.request(request,{},response,15000,{signal}),client,{signal});return [key,value,Date.now()];}catch(e){if(executionOutcome(e)==='CANCELLED')throw e;notes.push(request+': STATE_UNKNOWN');return [key,null,null];}}));
 active();if(!same(context,contextOf(client,player)))throw Object.assign(Error('远征阵容调查期间账号、角色或连接变化'),{code:'CANCELLED'});
 const inputs=toSnapshotJson(Object.fromEntries(rows.map(([k,v])=>[k,v]))),state=stateOf(inputs,context),inventory=parseOperationInventory(inputs.items,inputs.resources),catalog=catalogFrom(config,player);
 const base={formation:state?.info.formation??null,ownedHeroIds:state?.info.hero.filter(r=>r.hp!=='0'&&state.heroes.some(h=>h.heroId===r.heroId)).map(r=>r.heroId)??null,unlockedPresetIds:[...new Set([1,...(state?.presets??[])])],catalog,
  reliability:{formation:state!==null,presets:state!==null,heroes:state!==null,config:catalog.reliable},writeProtocolAvailable:Boolean(protocol?.ExpeditionSaveFormationRequest&&protocol?.ExpeditionSaveFormationResponse),stock:inventory.stock,stockReliable:inventory.stockReliable};
 const sourceFacts=Object.fromEntries(rows.map(([key,,sourceAt])=>[key,createStateFact(inputs[key],{accountId:context.accountId,generation:context.generation,source:sources[key],sourceAt,scope,reliable:state!==null})]));
 const f={module:'formation',mode:'expedition',parameters,context,inputs,state,configEvidence:{tables:Object.fromEntries(configNames.map(k=>[k,copy(config?.tables?.[k]??null)]))},sourceFacts,available:Object.keys(protocol??{}),base,...inventory,notes};
 live.set(f,{client,player,seal:seal(f)});return f;
}
function authority(f,options) {
 const l=live.get(f),c=f?.context;
 if(!l||l.client.connected!==true||l.seal!==seal(f)||!same(c,contextOf(l.client,l.player))||!text(c?.accountId)||!text(c?.connectionId)||!Number.isSafeInteger(c?.generation)||!c.playerId||!c.worldId||!positive(c.playerLevel)||!f.state||!same(stateOf(f.inputs,c),f.state)||!f.stockReliable)return 'EXPEDITION_AUTHORITY_UNKNOWN';
 if(!same(configNames.map(k=>options.config?.tables?.[k]??null),configNames.map(k=>f.configEvidence.tables[k])))return 'EXPEDITION_CONFIG_CHANGED';
 if(Object.entries(sources).some(([k,source])=>f.sourceFacts[k]?.provenance?.source!==source||!same(f.sourceFacts[k].value,f.inputs[k])||factsFreshnessPolicy(f.sourceFacts[k],{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope}).status!=='FRESH'))return 'EXPEDITION_FACTS_EXPIRED';
 const rows=f.configEvidence.tables.ExpeditionRaidCfg?.data;
 if(!dense(rows)||rows.some(r=>!positive(r.raidId))||new Set(rows.map(r=>r.raidId)).size!==rows.length)return 'EXPEDITION_RAID_CONFIG_UNKNOWN';
 const raid=rows.find(r=>r.raidId===f.parameters.raidId);
 if(!raid||!positive(raid.unlockLv)||!positive(raid.heroCount)||c.playerLevel<raid.unlockLv||f.state.info.hero.length>raid.heroCount)return 'EXPEDITION_RAID_INELIGIBLE';
 if(f.state.info.raidId!==f.parameters.raidId)return 'EXPEDITION_RAID_CHANGED';
 const clock=clockFor(l.client,c);
 if(!clock||clock.latestMs>f.state.info.endTime*1000)return 'EXPEDITION_PERIOD_UNVERIFIED_OR_EXPIRED';
 return null;
}
function candidate(f,base,options) {
 const p={mode:'expedition',raidId:f.parameters.raidId,...base.parameters},beforeState=copy(f.state),expectedState=beforeState&&base.expectedState?{...copy(beforeState),info:{...copy(beforeState.info),formation:copy(base.expectedState)}}:null;
 const reason=authority(f,options)??base.blockedReason,identity=hash({parameters:p,beforeState,expectedState,baseIdentity:base.identity,config:f.configEvidence}),budgetClaims={resources:[],quotas:[],uids:[{type:'expedition-formation',id:String(p.raidId)}]};
 return {module:'formation',actionType:'SAVE_EXPEDITION',actionId:'formation:SAVE_EXPEDITION:'+identity,target:{mode:'expedition',raidId:p.raidId,presetId:base.target.presetId},parameters:p,identity,beforeState,expectedState,costs:[],costSource,budgetClaims,executable:reason===null,blockedReason:reason,label:'保存远征 '+p.raidId+' 阵容',
  restoreParameters:beforeState?{mode:'expedition',raidId:p.raidId,presetId:beforeState.info.formation.presetId,heroPositions:copy(beforeState.info.formation.heroPositions)}:null,
  ...(reason===null?{action:{request:'ExpeditionSaveFormationRequest',response:'ExpeditionSaveFormationResponse',body:{raidId:p.raidId,formation:copy(base.expectedState)}}}:{})};
}
export function viewExpeditionFormation(f,options={}) {
 const p=validateExpeditionFormationParameters(options.parameters??f.parameters),baseParameters=Object.fromEntries(Object.entries(p).filter(([k])=>!['mode','raidId'].includes(k)));
 if(p.raidId!==f.parameters.raidId)throw invalid('远征调查与参数raidId不匹配');
 const base=viewFormation(f.base,{...options,parameters:baseParameters});
 return {...base,mode:'expedition',raidId:p.raidId,period:{endTime:f.state?.info.endTime??null},selectedHeroes:copy(f.state?.info.hero??null),candidates:base.candidates.map(row=>candidate(f,row,options)),notes:[...f.notes,'仅保存明确有效远征，保留宠物、英雄生命/增益/进度与完整库存；独立复读确认，不自动选英雄/重置/挑战。']};
}
export function planExpeditionFormation(f,{selections=[],ledger=new ResourceLedger(f?.stockReliable?f.stock:null),...options}={}) {
 if(!dense(selections)||selections.length>1||selections.some(v=>!text(v)))throw invalid('远征阵容每批仅允许一个精确actionId');
 const row=viewExpeditionFormation(f,options).candidates.find(r=>r.executable&&selections.includes(r.actionId));
 return {module:'formation',actions:row&&ledger.reserve(row.costs)?[row]:[],notes:[]};
}
export function verifyExpeditionFormation(operation,before,after,response) {
 const no=reason=>({confirmed:false,reason});
 if(authority(before,{config:before?.configEvidence})||authority(after,{config:after?.configEvidence})||!same(before.context,after.context)||!same(before.configEvidence,after.configEvidence))return no('前后远征、角色、时段或完整事实不可靠');
 const canonical=viewExpeditionFormation(before,{config:before.configEvidence,moduleConfig:{enabled:true},parameters:operation.parameters}).candidates.find(r=>r.actionId===operation.actionId);
 if(!canonical?.executable||['module','actionId','actionType','target','parameters','identity','beforeState','expectedState','costs','costSource','budgetClaims','action'].some(k=>!same(operation[k],canonical[k])))return no('远征保存合同与原事实不一致');
 const typed=own(response,'formation')?parseFormation(response.formation):null;
 if(!typed||!same(typed,canonical.expectedState.info.formation))return no('远征typed回执没有完整匹配阵容');
 if(Object.keys(sources).some(k=>after.sourceFacts[k].provenance.sourceAt<before.sourceFacts[k].provenance.sourceAt)||!same(after.state,canonical.expectedState))return no('独立远征复读未确认精确阵容，或生命/进度/增益/英雄/完整库存变化');
 return {confirmed:true,afterState:copy(after.state),reason:'精确远征typed阵容与独立完整状态复读一致，其他业务及库存不变'};
}