import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { DATA_DIR } from './accounts.mjs';
import { redact } from './security.mjs';
import { toSnapshotJson } from './game.mjs';
import { factsFreshnessPolicy, trustedGameDay } from './state-facts.mjs';
import { actionWasUncertain } from './execution-history.mjs';
import { safeResourceQuantity } from './resource-ledger.mjs';

export const EXECUTION_MEMORY_PATH = path.join(DATA_DIR, 'execution-memory.json');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 512 && value === value.trim();
const integer = value => Number.isSafeInteger(value) && value >= 0;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fail = (message, code = 'MEMORY_INVALID_INPUT') => Object.assign(new Error(message), { code, statusCode: 409 });
const exact = (value, keys) => plain(value) && Reflect.ownKeys(value).every(key => typeof key === 'string' && keys.includes(key));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Read-only projection of original History, independent of supplemental memory.
// Reconciliations never promote an original UNKNOWN. Costs/reservations are not
// receipts; only complete reliable before/after inventories quantify net changes.
export function summarizeExecutionHistory(runs, { accountId, filters = {} } = {}) {
  const selectors = ['module','runId','workflowId','nodeId','batchId','actionId','status'];
  if (!text(accountId) || !Array.isArray(runs) || !exact(filters, selectors)
    || Object.values(filters).some(value => !text(value))) throw fail('历史摘要筛选无效');
  const summary = { version:1, accountId, source:'ExecutionHistory.original-actions.v1', coverage:'tool-recorded-only',
    filters:{...filters}, gameDayKnown:false, totalGameResources:null, executable:false, resumable:false, retryAllowed:false,
    groups:[], excluded:{unidentifiedActions:0, missingIdentityActions:0, conflictingActions:0, duplicateRecords:0},
    reasonAudit:{accountId,source:'ExecutionHistory.original-reasons.v1',coverage:'recorded-fields-only',readOnly:true,runs:[],actions:[],
      excluded:{unidentifiedRuns:0,missingIdentityRuns:0,conflictingRuns:0,duplicateRunRecords:0}} };
  const records = new Map(), groups = new Map(), runRecords = new Map();
  const own = (object,key) => plain(object) && Object.hasOwn(object,key);
  const id = value => text(value) || Number.isSafeInteger(value) && value > 0;
  const originalFields = ['module','actionType','target','identity','timestamp','result','requestStatus','dispatched','unresolvedWrite',
    'dispatchEvidence','verification','beforeState','afterState','beforeInventory','afterInventory','beforeInventoryReliable','afterInventoryReliable','reason','error','nextDecision'];
  const canonical = value => JSON.stringify(value, (_key,item) => typeof item === 'bigint' ? {bigint:item.toString()}
    : plain(item) ? Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])) : item);
  const fields = (run,row) => ({ module:row.module??run.module, runId:run.runId, workflowId:run.workflowId??null,
    nodeId:run.workflowNodeId??null, batchId:run.planSummary?.batchId??run.authorizationSummary?.batchId??null,
    actionId:row.actionId, status:actionWasUncertain(row)?'UNKNOWN':row.result });
  const matches = value => Object.entries(filters).every(([key,expected])=>value[key]===expected);
  const reasonText = value => typeof value==='string' && value.length<=4000 && value.trim().length>0 ? value : null;
  const validContext = run => plain(run.executionContext) && own(run.executionContext,'playerId') && own(run.executionContext,'worldId')
    && id(run.executionContext.playerId) && id(run.executionContext.worldId) && run.executionContext.accountId===accountId
    && !(run.planSummary?.batchId && run.authorizationSummary?.batchId && run.planSummary.batchId!==run.authorizationSummary.batchId);
  const scope = (run,selected) => ({...selected,playerId:run.executionContext.playerId,worldId:run.executionContext.worldId,
    workflowRound:integer(run.workflowRound)?run.workflowRound:null});
  const actionEvidence = row => Object.fromEntries(['actionId',...originalFields].map(key=>[key,row[key]]));
  function reasons(row) {
    const evidence=['reason','error'].filter(key=>own(row,key)&&reasonText(row[key])!==null)
      .map(key=>({source:'ExecutionHistory.action.'+key,text:row[key]}));
    let nextDecision=null;
    if(own(row,'nextDecision') && row.nextDecision!==null){
      const next=row.nextDecision, decision=own(next,'decision')&&['RECOMMEND_KEEP','RECOMMEND_REFRESH','RECOMMEND_SUBMIT','NEEDS_REVIEW'].includes(next.decision)?next.decision:null;
      const explanation=own(next,'explanation')&&Array.isArray(next.explanation)&&next.explanation.length>0&&next.explanation.length<=100&&Array.from(next.explanation,(item,index)=>Object.hasOwn(next.explanation,index)&&reasonText(item)!==null).every(Boolean)?[...next.explanation]:null;
      nextDecision={source:'ExecutionHistory.action.nextDecision',decision,explanation,coverage:decision!==null&&explanation!==null?'RECORDED':'UNKNOWN',executionConfirmed:false};
    }
    return {evidence,nextDecision,coverage:evidence.length?'RECORDED':'UNKNOWN'};
  }
  function inventory(row,key) {
    if (!own(row,key) || !Array.isArray(row[key])) return null;
    const stock = new Map();
    for (const entry of row[key]) {
      if (!own(entry,'id') || !own(entry,'num') || !text(entry.id) || stock.has(entry.id)) return null;
      const amount = ['number','string','bigint'].includes(typeof entry.num) ? safeResourceQuantity(entry.num) : null;
      if (amount === null) return null;
      stock.set(entry.id,BigInt(amount));
    }
    return stock;
  }
  for (const run of runs) {
    if (!plain(run) || run.accountId !== accountId || !Array.isArray(run.actions)) continue;
    if(text(run.runId)){
      if(!runRecords.has(run.runId))runRecords.set(run.runId,[]);
      runRecords.get(run.runId).push(run);
    }else if(!filters.actionId&&matches(fields(run,{result:run.finalStatus})))summary.reasonAudit.excluded.unidentifiedRuns++;
    for (const row of run.actions) {
      if (!plain(row)) continue;
      const selected = fields(run,row);
      if (!text(run.runId) || !text(row.actionId)) {
        if (matches(selected)) summary.excluded.unidentifiedActions++;
        continue;
      }
      const key = JSON.stringify([accountId,run.runId,row.actionId]);
      if (!records.has(key)) records.set(key,[]);
      records.get(key).push({run,row,selected});
    }
  }
  for (const versions of records.values()) {
    // Resolve conflicts before selectors so a filter cannot hide a bad version.
    if (!versions.some(({selected})=>matches(selected))) continue;
    const fingerprint = ({run,row,selected}) => canonical({selected,executionContext:run.executionContext??null,
      source:run.source??null, workflowDefinitionId:run.workflowDefinitionId??null,
      workflowRound:run.workflowRound??null, planBatch:run.planSummary?.batchId??null,
      authorizationBatch:run.authorizationSummary?.batchId??null,
      action:Object.fromEntries(originalFields.map(key=>[key,row[key]]))});
    if (new Set(versions.map(fingerprint)).size !== 1) { summary.excluded.conflictingActions++; continue; }
    const {run,row,selected} = versions[0], context = run.executionContext;
    summary.excluded.duplicateRecords += versions.length-1;
    if (!plain(context) || !own(context,'playerId') || !own(context,'worldId') || !id(context.playerId) || !id(context.worldId)
      || context.accountId !== accountId || !text(selected.module) || !text(row.actionType)
      || run.planSummary?.batchId && run.authorizationSummary?.batchId && run.planSummary.batchId !== run.authorizationSummary.batchId) {
      summary.excluded.missingIdentityActions++; continue;
    }
    summary.reasonAudit.actions.push({...scope(run,selected),actionType:row.actionType,requestStatus:run.recovered===true?null:row.requestStatus,...reasons(row)});
    const identity = {playerId:context.playerId, worldId:context.worldId, module:selected.module, actionType:row.actionType};
    const key = canonical(identity);
    if (!groups.has(key)) groups.set(key,{...identity, counts:{confirmedSuccess:0, originalUnknown:0, rejected:0, notExecuted:0, other:0},
      quantifiedActions:0, unquantifiedActions:0, deltas:new Map()});
    const group = groups.get(key);
    if (actionWasUncertain(row)) { group.counts.originalUnknown++; continue; }
    if (row.result !== 'SUCCESS' || row.requestStatus !== 'SUCCESS' || !own(row,'verification') || !own(row.verification,'status') || row.verification.status !== 'CONFIRMED' || row.dispatched !== true || row.unresolvedWrite !== false) {
      const kind = row.result==='REJECTED' && row.requestStatus==='REJECTED' ? 'rejected'
        : row.result==='NOT_EXECUTED' && row.dispatched===false ? 'notExecuted' : 'other';
      group.counts[kind]++; continue;
    }
    group.counts.confirmedSuccess++;
    const before = inventory(row,'beforeInventory'), after = inventory(row,'afterInventory');
    if (!own(row,'beforeInventoryReliable') || !own(row,'afterInventoryReliable') || row.beforeInventoryReliable !== true || row.afterInventoryReliable !== true
      || !before || !after || before.size !== after.size || [...before.keys()].some(id=>!after.has(id))) {
      group.unquantifiedActions++; continue;
    }
    group.quantifiedActions++;
    for (const [id,amount] of before) group.deltas.set(id,(group.deltas.get(id)??0n)+after.get(id)-amount);
  }
  summary.groups = [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,group])=>{
    const {deltas,...result} = group;
    return {...result,resourceChanges:[...deltas].sort(([a],[b])=>a.localeCompare(b)).map(([id,delta])=>({id,delta:delta.toString()}))};
  });
  // Run stops are separate provenance: never copy one run reason to a filtered
  // action or treat a post-write recommendation as an actual next-round skip.
  if(!filters.actionId)for(const versions of runRecords.values()){
    const selected=run=>({...fields(run,{result:run.recovered===true?null:run.finalStatus}),actionId:null});
    if(!versions.some(run=>matches(selected(run))))continue;
    const fingerprint=run=>canonical({selected:selected(run),executionContext:run.executionContext??null,
      workflowDefinitionId:run.workflowDefinitionId??null,workflowRound:run.workflowRound??null,
      stopReason:run.stopReason,source:run.source??null,recovered:run.recovered===true,
      authorizationBatch:run.authorizationSummary?.batchId??null,actions:run.actions.map(row=>plain(row)?actionEvidence(row):null)});
    if(new Set(versions.map(fingerprint)).size!==1){summary.reasonAudit.excluded.conflictingRuns++;continue;}
    const run=versions[0],selection=selected(run);
    summary.reasonAudit.excluded.duplicateRunRecords+=versions.length-1;
    if(!validContext(run)||!text(run.module)||!(run.recovered===true&&selection.status===null)&&!text(selection.status)){summary.reasonAudit.excluded.missingIdentityRuns++;continue;}
    const reason=own(run,'stopReason')?reasonText(run.stopReason):null;
    summary.reasonAudit.runs.push({...scope(run,selection),
      stopReason:{source:'ExecutionHistory.run.stopReason',coverage:run.recovered===true?'RECOVERY_ONLY':reason===null?'UNKNOWN':'RECORDED',text:run.recovered===true?null:reason}});
  }
  summary.reasonAudit.actions.sort((a,b)=>canonical([a.runId,a.actionId]).localeCompare(canonical([b.runId,b.actionId])));
  summary.reasonAudit.runs.sort((a,b)=>a.runId.localeCompare(b.runId));
  return summary;
}

// Identity/target values are hashes only; no request, response, credentials,
// permit, budget or executable state is persisted in this supplemental store.
function identityDigest(value) {
  if (value === undefined || value === null) throw fail('记忆需要明确目标及事实身份');
  const seen = new WeakSet(); let nodes = 0;
  function inspect(item, depth) {
    if (++nodes > 10000 || depth > 12) throw fail('目标或事实身份过大');
    if (item === null || typeof item === 'boolean' || typeof item === 'bigint') return;
    if (typeof item === 'number') { if (!Number.isSafeInteger(item)) throw fail('事实身份数量不可靠'); return; }
    if (typeof item === 'string') { if (item.length > 4096) throw fail('事实身份过大'); return; }
    if (!item || typeof item !== 'object' || seen.has(item) || item instanceof Date) throw fail('事实身份必须为无环有限数据');
    seen.add(item);
    if (!Array.isArray(item) && !plain(item) && !(Number.isInteger(item.low) && Number.isInteger(item.high) && Reflect.ownKeys(item).every(key => ['low','high','unsigned'].includes(key)) && (item.unsigned === undefined || typeof item.unsigned === 'boolean'))) throw fail('事实身份对象类型无效');
    for (const key of Reflect.ownKeys(item)) { if (typeof key !== 'string') throw fail('事实身份字段无效'); inspect(item[key], depth + 1); }
    seen.delete(item);
  }
  inspect(value, 0);
  const normalized = toSnapshotJson(value);
  const canonical = item => Array.isArray(item) ? item.map(canonical) : plain(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, canonical(item[key])])) : item;
  return hash(canonical(normalized));
}
function targetKey(query) {
  if (!exact(query, ['module','actionType','target','identity']) || !text(query.module) || !text(query.actionType)) throw fail('记忆查询必须绑定模块、动作及目标');
  const targetDigest = identityDigest(query.target);
  return { key: hash([query.module, query.actionType, targetDigest]), targetDigest };
}
export function executionMemoryKey(query) { return targetKey(query).key; }

function policyOf(policy, unknown) {
  const value = policy ?? { kind: 'UNTIL_IDENTITY_CHANGE' };
  if (!plain(value)) throw fail('记忆失效策略无效');
  if (value.kind === 'UNTIL_IDENTITY_CHANGE') {
    if (!exact(value, ['kind'])) throw fail('身份失效策略包含未知字段');
  } else if (value.kind === 'COOLDOWN') {
    if (!exact(value, ['kind','durationMs']) || !integer(value.durationMs) || value.durationMs < 1 || value.durationMs > 366 * 86400000) throw fail('冷却必须是有限正毫秒');
  } else if (value.kind === 'GAME_DAY') {
    if (!exact(value, ['kind','utcOffsetMinutes','boundaryHour']) || !Number.isInteger(value.utcOffsetMinutes) || Math.abs(value.utcOffsetMinutes) > 840
      || !Number.isInteger(value.boundaryHour) || value.boundaryHour < 0 || value.boundaryHour > 23) throw fail('日界必须显式声明时区及小时');
  } else throw fail('未知记忆失效策略');
  return unknown ? { kind: 'HISTORY_RECONCILIATION' } : structuredClone(value);
}
function trustedClock(clock, accountId, generation) {
  return clock?.status === 'TRUSTED' && clock.reliable === true && clock.accountId === accountId && clock.generation === generation
    && text(clock.source) && [clock.nowMs,clock.earliestMs,clock.latestMs].every(value => Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER)
    && clock.earliestMs <= clock.nowMs && clock.nowMs <= clock.latestMs;
}
function timeGate(policy, clock, accountId, generation) {
  const valid = trustedClock(clock, accountId, generation);
  if (policy.kind === 'COOLDOWN') {
    const untilMs = valid ? Math.ceil(clock.latestMs + policy.durationMs) : null;
    return { notBeforeMs: Number.isSafeInteger(untilMs) ? untilMs : null };
  }
  if (policy.kind === 'GAME_DAY') {
    const day = valid ? trustedGameDay(clock, policy) : null;
    return { dayKey: day?.status === 'TRUSTED' ? day.dayKey : null };
  }
  return null;
}
const eventFields = ['eventId','key','module','actionType','targetDigest','identityDigest','source','generation','runId','workflowId','nodeId','batchId','actionId','capabilityId','status','dispatched','unresolvedWrite','reason','policy','timeGate','recordedAt','inputDigest','integrityDigest'];
function validEvent(event) {
  if (!exact(event,eventFields) || Object.keys(event).length !== eventFields.length || !['REJECTED','UNKNOWN'].includes(event.status)
    || !['eventId','key','targetDigest','identityDigest','inputDigest','integrityDigest'].every(key => digest(event[key]))
    || !['module','actionType','source','runId','batchId','actionId','recordedAt'].every(key => text(event[key]))
    || !['workflowId','nodeId','capabilityId'].every(key => event[key] === null || text(event[key])) || !integer(event.generation)
    || typeof event.dispatched !== 'boolean' || typeof event.unresolvedWrite !== 'boolean' || !(event.reason === null || typeof event.reason === 'string' && event.reason.length <= 4000)
    || !Number.isFinite(Date.parse(event.recordedAt))) return false;
  if (event.key !== hash([event.module,event.actionType,event.targetDigest])) return false;
  const inputKeys=['key','module','actionType','targetDigest','identityDigest','source','generation','runId','workflowId','nodeId','batchId','actionId','capabilityId','status','dispatched','unresolvedWrite','reason','policy'];
  if(event.inputDigest!==hash(Object.fromEntries(inputKeys.map(key=>[key,event[key]]))))return false;
  const integrityKeys=['eventId',...inputKeys,'timeGate','recordedAt','inputDigest'];
  if(event.integrityDigest!==hash(Object.fromEntries(integrityKeys.map(key=>[key,event[key]]))))return false;
  if (event.status === 'UNKNOWN') return event.unresolvedWrite === true && exact(event.policy,['kind']) && event.policy.kind === 'HISTORY_RECONCILIATION' && event.timeGate === null;
  if (event.unresolvedWrite) return false;
  try { if (!same(policyOf(event.policy,false),event.policy)) return false; } catch { return false; }
  if (event.policy.kind === 'UNTIL_IDENTITY_CHANGE') return event.timeGate === null;
  if (event.policy.kind === 'COOLDOWN') return exact(event.timeGate,['notBeforeMs']) && Object.hasOwn(event.timeGate,'notBeforeMs') && (event.timeGate.notBeforeMs === null || integer(event.timeGate.notBeforeMs));
  return exact(event.timeGate,['dayKey']) && Object.hasOwn(event.timeGate,'dayKey') && (event.timeGate.dayKey === null || /^\d{4}-\d{2}-\d{2}$/.test(event.timeGate.dayKey));
}
const origin = event => Object.fromEntries(['eventId','module','actionType','runId','workflowId','nodeId','batchId','actionId','capabilityId','source'].map(key => [key,event[key]]));

/** Supplemental decision memory. ExecutionHistory owns UNKNOWN reconciliation.
 * Trusted in-process callers supply original outcomes and provenance; HTTP data
 * must never supply these fields. Reads restore audit data, never runnable state.
 */
export function createExecutionMemory({ file = EXECUTION_MEMORY_PATH, secrets = () => [], assertWriter = () => {}, fileSystem = fs, wallNow = Date.now } = {}) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || typeof secrets !== 'function' || typeof assertWriter !== 'function' || typeof wallNow !== 'function') throw fail('记忆存储必须使用绝对路径及可信本地依赖');
  let knownStore = false, anchorObserved = false;
  const anchor = file + '.anchor';
  const anchorValue = { version:1, kind:'EXECUTION_MEMORY_EXISTENCE', basename:path.basename(file) };
  const unavailable = () => fail('执行记忆或存在锚无法读取、已丢失、版本不支持或损坏；保留原文件并禁止覆盖', 'MEMORY_UNAVAILABLE');
  // Same existence-anchor contract as ExecutionHistory: a restart cannot turn
  // a lost established store into an empty first run. Legacy reads stay pure.
  function anchored() {
    let stat;
    try { stat=fileSystem.lstatSync(anchor); }
    catch(cause) { if(cause.code==='ENOENT'&&!anchorObserved)return false;throw unavailable(); }
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024)throw unavailable();
    try {
      const value=JSON.parse(fileSystem.readFileSync(anchor,'utf8'));
      if(!exact(value,['version','kind','basename'])||Object.keys(value).length!==3||
        Object.keys(anchorValue).some(key=>value[key]!==anchorValue[key]))throw unavailable();
      anchorObserved=true;return true;
    } catch { throw unavailable(); }
  }
  function ensureAnchor() {
    if(anchored())return;
    assertWriter();let fd;
    try {
      fd=fileSystem.openSync(anchor,'wx',0o600);
      fileSystem.writeFileSync(fd,JSON.stringify(anchorValue)+'\n','utf8');
      fileSystem.fsyncSync(fd);anchorObserved=true;
    } catch(cause) {
      if(cause.code==='EEXIST'&&anchored())return;
      throw cause;
    } finally { if(fd!==undefined)fileSystem.closeSync(fd); }
  }
  const account = id => { if (!text(id)) throw fail('记忆需要精确账号ID'); return id; };
  function read(allowInitialMissing = false) {
    try {
      let stat; try { stat=fileSystem.lstatSync(file); } catch(error) { if(error.code==='ENOENT' && !knownStore && (!anchored() || allowInitialMissing))return {version:1,accounts:Object.create(null)};throw unavailable(); }
      knownStore=true;
      anchored();
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw unavailable();
      const source = fileSystem.readFileSync(file,'utf8');
      if(Buffer.byteLength(source,'utf8')>8*1024*1024)throw unavailable();
      const raw = JSON.parse(source);
      if (!exact(raw,['version','accounts']) || raw.version !== 1 || !plain(raw.accounts)) throw unavailable();
      const ids = new Set();
      for (const [id,events] of Object.entries(raw.accounts)) {
        if (!text(id) || !Array.isArray(events) || events.some(event => !validEvent(event) || event.eventId !== hash([id,event.runId,event.batchId,event.actionId,event.status]) || ids.has(event.eventId) || !ids.add(event.eventId))) throw unavailable();
      }
      return raw;
    } catch { throw unavailable(); }
  }
  function write(raw) {
    assertWriter();
    const temporary = file + '.' + process.pid + '.' + randomUUID() + '.tmp'; let fd;
    try {
      const original = read();
      const initialStore = !knownStore;
      fileSystem.mkdirSync(path.dirname(file),{recursive:true});
      ensureAnchor();
      fd = fileSystem.openSync(temporary,'wx',0o600);
      const serialized=JSON.stringify(raw,null,2)+'\n';if(Buffer.byteLength(serialized,'utf8')>8*1024*1024)throw fail('执行记忆超过安全读取上限；保留原文件','MEMORY_UNAVAILABLE');
      fileSystem.writeFileSync(fd,serialized,'utf8'); fileSystem.fsyncSync(fd);
      fileSystem.closeSync(fd); fd = undefined;
      // Same original-evidence barrier as ExecutionHistory and WorkflowStore:
      // only this first write may see its own anchor before the initial file.
      // A lost or corrupt established store must never be overwritten.
      assertWriter();
      const latest = read(initialStore);
      if (initialStore ? knownStore : !isDeepStrictEqual(original, latest)) throw fail('执行记忆在临时文件刷盘期间变化；保留原证据');
      assertWriter();
      fileSystem.renameSync(temporary,file); knownStore=true;
    } catch (error) { if (error?.code?.startsWith('WRITER_')) throw error; throw fail('执行记忆原子保存失败；原文件保留，不允许继续派发', 'MEMORY_UNAVAILABLE'); }
    finally { if (fd !== undefined) try { fileSystem.closeSync(fd); } catch {} try { fileSystem.unlinkSync(temporary); } catch {} }
  }
  function record(accountId, input, { clock = null } = {}) {
    account(accountId); assertWriter();
    const fields = ['module','actionType','target','identity','source','generation','runId','workflowId','nodeId','batchId','actionId','capabilityId','status','dispatched','unresolvedWrite','reason','policy'];
    if (!exact(input,fields) || !['module','actionType','source','runId','batchId','actionId'].every(key => text(input[key])) || !integer(input.generation)
      || !['workflowId','nodeId','capabilityId'].every(key => input[key] === undefined || input[key] === null || text(input[key])) || !['REJECTED','UNKNOWN'].includes(input.status)
      || typeof input.dispatched !== 'boolean' || typeof input.unresolvedWrite !== 'boolean' || !(input.reason === undefined || typeof input.reason === 'string' && input.reason.length <= 4000)) throw fail('执行记忆仅接受明确拒绝或UNKNOWN及完整原始关联');
    const status = input.status === 'UNKNOWN' || input.unresolvedWrite ? 'UNKNOWN' : 'REJECTED', { key,targetDigest } = targetKey({module:input.module,actionType:input.actionType,target:input.target});
    const knownSecrets=secrets(),safe=redact({source:input.source,reason:input.reason??null},knownSecrets);
    const links=Object.fromEntries(['module','actionType','runId','workflowId','nodeId','batchId','actionId','capabilityId'].map(key=>[key,input[key]??null]));
    if(!same(links,redact(links,knownSecrets)))throw fail('关联标识不得包含凭证');
    const entry = { key,module:input.module,actionType:input.actionType,targetDigest,identityDigest:identityDigest(input.identity),source:safe.source,generation:input.generation,
      runId:input.runId,workflowId:input.workflowId??null,nodeId:input.nodeId??null,batchId:input.batchId,actionId:input.actionId,capabilityId:input.capabilityId??null,status,
      dispatched:input.dispatched,unresolvedWrite:status==='UNKNOWN',reason:safe.reason,policy:policyOf(input.policy,status==='UNKNOWN') };
    const eventId = hash([accountId,entry.runId,entry.batchId,entry.actionId,entry.status]), inputDigest = hash(entry), raw = read();
    const events = Object.hasOwn(raw.accounts,accountId) ? raw.accounts[accountId] : [], previous = events.find(event => event.eventId === eventId);
    if (previous) { if (previous.inputDigest !== inputDigest) throw fail('重复执行记忆事件与原始证据冲突', 'MEMORY_EVENT_CONFLICT'); return {...structuredClone(previous),accountId,resumable:false,retryAllowed:false}; }
    const wall=wallNow();if(!integer(wall)||Number.isNaN(new Date(wall).getTime()))throw fail('本地审计时间不可用');
    const event = { eventId,...entry,timeGate:timeGate(entry.policy,clock,accountId,input.generation),recordedAt:new Date(wall).toISOString(),inputDigest };
    event.integrityDigest=hash(event);
    if (!validEvent(event)) throw fail('执行记忆事件无效');
    Object.defineProperty(raw.accounts,accountId,{value:[...events,event],enumerable:true,configurable:true,writable:true});
    write(raw); return {...structuredClone(event),accountId,resumable:false,retryAllowed:false};
  }
  function list(accountId, filters = {}) {
    account(accountId);
    if (!exact(filters,['module','runId','workflowId','nodeId','batchId','actionId','status']) || Object.values(filters).some(value => !text(value))) throw fail('执行记忆筛选无效');
    const raw = read(), events = Object.hasOwn(raw.accounts,accountId) ? raw.accounts[accountId] : [];
    return events.filter(event => Object.entries(filters).every(([key,value]) => event[key]===value)).map(event => ({...structuredClone(event),accountId,resumable:false,retryAllowed:false}));
  }
  function evaluate(accountId, query, {clock=null,generation,identityFact=null,maxFactAgeMs} = {}) {
    account(accountId); const {key} = targetKey(query), identity = identityDigest(query.identity), events = list(accountId);
    const unknown = events.filter(event => event.status==='UNKNOWN');
    const matches=events.filter(event=>event.status==='REJECTED' && event.key===key), decisions=[];
    for(const event of matches) {
      let reason='REJECTION_RETAINED',active=true;
      const fact=factsFreshnessPolicy(identityFact,{accountId,generation,now:wallNow(),maxAgeMs:maxFactAgeMs,scope:{kind:'ENTITY',key}});
      if(fact.status==='FRESH' && identityDigest(identityFact.value)===identity && identity!==event.identityDigest){active=false;reason='IDENTITY_CHANGED';}
      else if(event.policy.kind==='COOLDOWN') {
        if(event.timeGate.notBeforeMs!==null && trustedClock(clock,accountId,generation) && clock.earliestMs>=event.timeGate.notBeforeMs){active=false;reason='COOLDOWN_ELAPSED';}
        else reason='COOLDOWN_NOT_PROVEN_ELAPSED';
      } else if(event.policy.kind==='GAME_DAY') {
        const day=trustedClock(clock,accountId,generation)?trustedGameDay(clock,event.policy):null;
        if(event.timeGate.dayKey!==null && day?.status==='TRUSTED' && day.dayKey>event.timeGate.dayKey){active=false;reason='GAME_DAY_CHANGED';}
        else reason='GAME_DAY_CHANGE_UNPROVEN';
      } else if(identity!==event.identityDigest) reason='IDENTITY_CHANGE_UNVERIFIED';
      decisions.push({...origin(event),active,reason});
    }
    const rejection={status:decisions.some(row=>row.active)?'BLOCKED_REJECTED':'CLEAR',blocked:decisions.some(row=>row.active),reason:decisions.some(row=>row.active)?'REJECTION_MEMORY_ACTIVE':'NO_ACTIVE_MEMORY',decisions};
    if(unknown.length)return {status:'BLOCKED_UNKNOWN',blocked:true,reason:'ORIGINAL_HISTORY_RECONCILIATION_REQUIRED',requiresHistoryReconciliation:true,origins:unknown.map(origin),rejection,requiresFreshPlan:true,resumable:false,retryAllowed:false};
    return {...rejection,requiresFreshPlan:true,resumable:false,retryAllowed:false};
  }
  return Object.freeze({record,list,evaluate});
}