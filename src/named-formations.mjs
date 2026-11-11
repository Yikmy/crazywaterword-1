import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DATA_DIR } from './accounts.mjs';
import { parseFormation, validateFormationParameters, planFormation } from './formation.mjs';
import { factsFreshnessPolicy } from './state-facts.mjs';
import { redact } from './security.mjs';

export const NAMED_FORMATIONS_PATH = path.join(DATA_DIR, 'named-formations.json');
export const NAMED_FORMATION_SCOPE = Object.freeze({ kind: 'ENTITY', key: 'MAINLINE:1' });
const FORMAT_VERSION = 1, MAX_BYTES = 2 * 1024 * 1024, MAX_ENTRIES = 200;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value, keys) => plain(value) && Reflect.ownKeys(value).every(key => typeof key === 'string' && keys.includes(key));
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
const nameOf = value => text(value) && value.length <= 80;
const integer = value => Number.isSafeInteger(value) && value >= 0;
const revisionOf = value => integer(value) && value > 0;
const idOf = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const fail = (message, code = 'NAMED_FORMATION_INVALID') => Object.assign(new Error(message), { code, statusCode: 409 });
const unavailable = () => fail('具名阵容文件不可用、损坏或版本不支持；保留原文件并禁止覆盖', 'NAMED_FORMATION_UNAVAILABLE');
const active = signal => { if (signal?.aborted) throw fail('具名阵容操作已取消', 'CANCELLED'); };
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

// A complete archive requires an explicitly observed pet UID, including zero.
// Optional/missing protobuf fields must never be silently treated as no pet.
function completeFormation(value) {
  if (!exact(value,['presetId','heroPositions','petUid']) || !Object.hasOwn(value,'petUid')) throw fail('完整队伍必须包含明确的阵型、英雄站位和宠物UID');
  const parsed = parseFormation(value);
  if (!parsed || !parsed.heroPositions.length || parsed.heroPositions.length > 100) throw fail('完整阵容字段不可靠');
  const parameters = validateFormationParameters({presetId:parsed.presetId,heroPositions:value.heroPositions});
  return {...parameters,petUid:parsed.petUid};
}
function canonical(value) {
  const formation = completeFormation(value);
  formation.heroPositions.sort((a,b)=>a.heroId < b.heroId ? -1 : a.heroId > b.heroId ? 1 : 0);
  return formation;
}
function sourceOf(value, accountId) {
  if (!exact(value,['accountId','generation','source','sourceAt','serverTime','scope','reliability'])
    || value.accountId !== accountId || !integer(value.generation) || value.source !== 'GetFormationResponse'
    || !integer(value.sourceAt) || !(value.serverTime === null || integer(value.serverTime))
    || !exact(value.scope,['kind','key']) || value.scope.kind !== NAMED_FORMATION_SCOPE.kind || value.scope.key !== NAMED_FORMATION_SCOPE.key
    || value.reliability !== 'RELIABLE') throw fail('阵容来源必须绑定同账号主线GetFormation权威读取');
  return {accountId,generation:value.generation,source:value.source,sourceAt:value.sourceAt,serverTime:value.serverTime,
    scope:{...NAMED_FORMATION_SCOPE},reliability:'RELIABLE'};
}
function validEntry(entry, accountId) {
  try {
    if (!exact(entry,['id','revision','name','mode','formation','source','formationDigest','createdAt','updatedAt','integrityDigest'])
      || !idOf(entry.id) || !revisionOf(entry.revision) || !nameOf(entry.name) || entry.mode !== 'MAINLINE'
      || !iso(entry.createdAt) || !iso(entry.updatedAt) || entry.updatedAt < entry.createdAt) return false;
    const formation = completeFormation(entry.formation);
    sourceOf(entry.source,accountId);
    const {integrityDigest,...data} = entry;
    return same(formation,entry.formation) && entry.formationDigest === hash(canonical(formation)) && integrityDigest === hash(data);
  } catch { return false; }
}

/** Local read-only team archives, never permits or executable state.
 * Only trusted in-process survey callers may supply formationFact/currentFormationFact.
 * HTTP input must never construct source facts. prepareApply validates via the
 * existing planner, discards its action, and requires a new ordinary plan/permit.
 */
export function createNamedFormationStore({file=NAMED_FORMATIONS_PATH,secrets=()=>[],assertWriter=()=>{},fileSystem=fs,wallNow=Date.now}={}) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || typeof secrets !== 'function' || typeof assertWriter !== 'function' || typeof wallNow !== 'function') throw fail('具名阵容需要绝对存储路径和可信本地依赖');
  let knownStore = false;
  const account = id => { if(!text(id)) throw fail('需要精确账号ID'); return id; };
  function read() {
    try {
      let stat;
      try { stat=fileSystem.lstatSync(file); }
      catch(error) { if(error.code==='ENOENT' && !knownStore)return {raw:{version:FORMAT_VERSION,accounts:Object.create(null)},fingerprint:null}; throw unavailable(); }
      knownStore=true;
      if(!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES)throw unavailable();
      const contents=fileSystem.readFileSync(file,'utf8'),raw=JSON.parse(contents);
      if(!exact(raw,['version','accounts']) || raw.version!==FORMAT_VERSION || !plain(raw.accounts))throw unavailable();
      const ids=new Set();
      for(const [accountId,entries] of Object.entries(raw.accounts)) {
        if(!text(accountId) || !Array.isArray(entries) || entries.length>MAX_ENTRIES)throw unavailable();
        const names=new Set();
        for(const entry of entries) {
          if(!validEntry(entry,accountId) || ids.has(entry.id) || names.has(entry.name))throw unavailable();
          ids.add(entry.id);names.add(entry.name);
        }
      }
      return {raw,fingerprint:hash(contents)};
    } catch { throw unavailable(); }
  }
  function persist(raw,fingerprint,signal) {
    active(signal);assertWriter();
    const temporary=file+'.'+process.pid+'.'+randomUUID()+'.tmp';
    let fd;
    try {
      const serialized=JSON.stringify(raw,null,2)+'\n';
      if(Buffer.byteLength(serialized,'utf8')>MAX_BYTES)throw unavailable();
      fileSystem.mkdirSync(path.dirname(file),{recursive:true});
      fd=fileSystem.openSync(temporary,'wx',0o600);
      fileSystem.writeFileSync(fd,serialized,'utf8');fileSystem.fsyncSync(fd);
      fileSystem.closeSync(fd);fd=undefined;
      active(signal);assertWriter();
      if(read().fingerprint!==fingerprint)throw fail('存档文件已变化，需要重新读取后操作','NAMED_FORMATION_VERSION_CONFLICT');
      active(signal);assertWriter();
      fileSystem.renameSync(temporary,file);knownStore=true;
    } catch(error) {
      if(error?.code==='CANCELLED' || error?.code?.startsWith('NAMED_FORMATION_') || error?.code?.startsWith('WRITER_'))throw error;
      throw unavailable();
    } finally {
      if(fd!==undefined)try{fileSystem.closeSync(fd);}catch{}
      try{fileSystem.unlinkSync(temporary);}catch{}
    }
  }
  const entriesOf = (raw,accountId) => Object.hasOwn(raw.accounts,accountId)?raw.accounts[accountId]:[];
  const replaceEntries = (raw,accountId,entries) => Object.defineProperty(raw.accounts,accountId,{value:entries,enumerable:true,configurable:true,writable:true});
  const view = (entry,accountId) => ({...structuredClone(entry),accountId,resumable:false,requiresFreshPlan:true,requiresAuthorization:true});
  function auditTime(previous) {
    const value=wallNow();
    if(!integer(value) || Number.isNaN(new Date(value).getTime()))throw fail('本地审计时间不可用');
    const result=new Date(value).toISOString();
    if(previous && result<previous)throw fail('本地审计时间倒退');
    return result;
  }
  function checkedName(value) {
    if(!nameOf(value) || !same(value,redact(value,secrets())))throw fail('队伍名称无效或包含凭证');
    return value;
  }
  function factFormation(accountId, fact, {generation,maxFactAgeMs=30000,signal}={}) {
    active(signal);
    if(!exact(fact,['value','provenance']))throw fail('需要当前完整阵容的权威事实','NAMED_FORMATION_SOURCE_BLOCKED');
    const freshness=factsFreshnessPolicy(fact,{accountId,generation,now:wallNow(),maxAgeMs:maxFactAgeMs,scope:NAMED_FORMATION_SCOPE});
    if(freshness.status!=='FRESH')throw fail('阵容来源不新鲜或账号/会话不匹配','NAMED_FORMATION_SOURCE_BLOCKED');
    const formation=completeFormation(fact.value),source=sourceOf(fact.provenance,accountId);
    if(!same(formation,redact(formation,secrets())))throw fail('阵容标识不得包含凭证');
    return {formation,source};
  }
  function selected(raw,accountId,id,expectedRevision) {
    if(!idOf(id) || !revisionOf(expectedRevision))throw fail('需要精确存档ID及预期版本');
    const entry=entriesOf(raw,accountId).find(row=>row.id===id);
    if(!entry)throw fail('当前账号没有该具名队伍','NAMED_FORMATION_NOT_FOUND');
    if(entry.revision!==expectedRevision)throw fail('具名队伍版本冲突，请重新读取','NAMED_FORMATION_VERSION_CONFLICT');
    if(entry.mode!=='MAINLINE')throw fail('其他模式不能应用主线存档');
    return entry;
  }
  function seal(data) {
    if(data.revision>Number.MAX_SAFE_INTEGER)throw fail('具名队伍版本耗尽');
    return {...data,integrityDigest:hash(data)};
  }
  function list(accountId,{signal}={}) {
    account(accountId);active(signal);
    return entriesOf(read().raw,accountId).map(entry=>view(entry,accountId));
  }
  function save(accountId,input,options={}) {
    account(accountId);active(options.signal);assertWriter();
    if(!exact(input,['name','formationFact']))throw fail('新存档仅接受名称及可信阵容事实');
    const name=checkedName(input.name),{formation,source}=factFormation(accountId,input.formationFact,options);
    const {raw,fingerprint}=read(),entries=entriesOf(raw,accountId);
    if(entries.some(entry=>entry.name===name))throw fail('名称已存在，请显式覆盖指定版本','NAMED_FORMATION_NAME_CONFLICT');
    if(entries.length>=MAX_ENTRIES)throw fail('具名队伍数量达到安全上限');
    const timestamp=auditTime(),entry=seal({id:randomUUID(),revision:1,name,mode:'MAINLINE',formation,source,
      formationDigest:hash(canonical(formation)),createdAt:timestamp,updatedAt:timestamp});
    replaceEntries(raw,accountId,[...entries,entry]);persist(raw,fingerprint,options.signal);
    return view(entry,accountId);
  }
  function rename(accountId,id,input,{signal}={}) {
    account(accountId);active(signal);assertWriter();
    if(!exact(input,['name','expectedRevision']))throw fail('重命名需要名称及预期版本');
    const name=checkedName(input.name),{raw,fingerprint}=read(),entry=selected(raw,accountId,id,input.expectedRevision);
    if(entriesOf(raw,accountId).some(row=>row.id!==id && row.name===name))throw fail('名称已存在','NAMED_FORMATION_NAME_CONFLICT');
    const {integrityDigest,...data}=entry,updated=seal({...data,name,revision:entry.revision+1,updatedAt:auditTime(entry.updatedAt)});
    replaceEntries(raw,accountId,entriesOf(raw,accountId).map(row=>row.id===id?updated:row));persist(raw,fingerprint,signal);
    return view(updated,accountId);
  }
  function overwrite(accountId,id,input,options={}) {
    account(accountId);active(options.signal);assertWriter();
    if(!exact(input,['expectedRevision','formationFact']))throw fail('覆盖需要预期版本及新的可信阵容事实');
    const {formation,source}=factFormation(accountId,input.formationFact,options),{raw,fingerprint}=read(),entry=selected(raw,accountId,id,input.expectedRevision);
    const {integrityDigest,...data}=entry,updated=seal({...data,formation,source,formationDigest:hash(canonical(formation)),
      revision:entry.revision+1,updatedAt:auditTime(entry.updatedAt)});
    replaceEntries(raw,accountId,entriesOf(raw,accountId).map(row=>row.id===id?updated:row));persist(raw,fingerprint,options.signal);
    return view(updated,accountId);
  }
  function remove(accountId,id,input,{signal}={}) {
    account(accountId);active(signal);assertWriter();
    if(!exact(input,['expectedRevision']))throw fail('删除需要预期版本');
    const {raw,fingerprint}=read(),entry=selected(raw,accountId,id,input.expectedRevision);
    replaceEntries(raw,accountId,entriesOf(raw,accountId).filter(row=>row.id!==id));persist(raw,fingerprint,signal);
    return {id:entry.id,deleted:true,revision:entry.revision,accountId};
  }
  function prepareApply(accountId,id,input) {
    account(accountId);
    if(!exact(input,['expectedRevision','currentFormationFact','facts','generation','maxFactAgeMs','moduleConfig','signal']))throw fail('应用预览参数无效');
    active(input.signal);
    const {raw}=read(),entry=selected(raw,accountId,id,input.expectedRevision);
    const {formation:current}=factFormation(accountId,input.currentFormationFact,input);
    if(input.facts?.module!=='formation' || !same(canonical(input.facts.formation),canonical(current)))throw fail('规划事实与当前权威阵容不匹配','NAMED_FORMATION_SOURCE_BLOCKED');
    if(String(entry.formation.petUid)!==String(current.petUid))throw fail('存档与当前宠物UID不一致；不会切换或覆盖宠物','NAMED_FORMATION_PET_MISMATCH');
    const parameters=validateFormationParameters({presetId:entry.formation.presetId,heroPositions:entry.formation.heroPositions});
    const plan=planFormation(input.facts,{parameters,moduleConfig:input.moduleConfig});
    if(plan.actions.length!==1)throw fail('现有阵容规划器拒绝存档应用：'+plan.notes.join('；'),'NAMED_FORMATION_APPLY_BLOCKED');
    active(input.signal);
    return {id:entry.id,revision:entry.revision,accountId,mode:'MAINLINE',parameters,
      preservedPetUid:current.petUid,requiresFreshSurvey:true,requiresFreshPlan:true,requiresAuthorization:true,resumable:false};
  }
  return Object.freeze({list,save,rename,overwrite,delete:remove,prepareApply});
}