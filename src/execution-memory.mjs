import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DATA_DIR } from './accounts.mjs';
import { redact } from './security.mjs';
import { toSnapshotJson } from './game.mjs';
import { factsFreshnessPolicy, trustedGameDay } from './state-facts.mjs';

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
  let knownStore = false;
  const unavailable = () => fail('执行记忆无法读取、版本不支持或已损坏；保留原文件并禁止覆盖', 'MEMORY_UNAVAILABLE');
  const account = id => { if (!text(id)) throw fail('记忆需要精确账号ID'); return id; };
  function read() {
    try {
      let stat; try { stat=fileSystem.lstatSync(file); } catch(error) { if(error.code==='ENOENT' && !knownStore)return {version:1,accounts:Object.create(null)};throw unavailable(); }
      knownStore=true;
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw unavailable();
      const raw = JSON.parse(fileSystem.readFileSync(file,'utf8'));
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
      fileSystem.mkdirSync(path.dirname(file),{recursive:true});
      fd = fileSystem.openSync(temporary,'wx',0o600);
      const serialized=JSON.stringify(raw,null,2)+'\n';if(Buffer.byteLength(serialized,'utf8')>8*1024*1024)throw fail('执行记忆超过安全读取上限；保留原文件','MEMORY_UNAVAILABLE');
      fileSystem.writeFileSync(fd,serialized,'utf8'); fileSystem.fsyncSync(fd);
      fileSystem.closeSync(fd); fd = undefined;
      assertWriter(); fileSystem.renameSync(temporary,file); knownStore=true;
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