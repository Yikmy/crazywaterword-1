import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from './accounts.mjs';

export const NAVAL_RULE_CONTRACT = Object.freeze({ maxRules:100, types:Object.freeze({ targetId:'text', targetState:'integer', fleetState:'integer', minDurability:'integer', minPetrol:'integer', sameGuild:'boolean', freshTarget:'integer' }) });

const plain = value => value && typeof value === 'object' && !Array.isArray(value);
export function validateModuleConfig(value, defaults) {
  function check(input, model, label) {
    if (typeof model === 'boolean') { if (typeof input !== 'boolean') throw new Error(label + ' 必须为布尔值'); return input; }
    if (typeof model === 'number') { if (!Number.isFinite(input) || input < 0 || input > 1e9 || label.endsWith('DurabilityRatio') && (input <= 0 || input > 1) || ['maxFleets','scenarioId','maxActionsPerPlan','minimumRevenue'].some(k=>label.endsWith('.'+k)) && (!Number.isSafeInteger(input) || input < 1)) throw new Error(label + ' 数值无效'); return input; }
    if (typeof model === 'string') { if (typeof input !== 'string' || input.length > 1000) throw new Error(label + ' 字符串无效'); return input; }
    if (model === null) { if (input !== null && typeof input !== 'string' && !Number.isSafeInteger(input)) throw new Error(label + ' 标识无效'); return input; }
    if (Array.isArray(model) && label === 'config.rules') {
      if (!Array.isArray(input) || input.length > NAVAL_RULE_CONTRACT.maxRules) throw new Error('规则列表无效');
      const ids = new Set();
      for (const rule of input) {
        if (!plain(rule) || Object.keys(rule).some(k => !['id','type','value'].includes(k)) || typeof rule.id !== 'string' || !rule.id || ids.has(rule.id) || typeof rule.type !== 'string' || !Object.hasOwn(NAVAL_RULE_CONTRACT.types, rule.type)) throw new Error('规则契约无效');
        ids.add(rule.id);
        if (rule.type === 'targetId' ? typeof rule.value !== 'string' || !rule.value : rule.type === 'sameGuild' ? typeof rule.value !== 'boolean' : !Number.isSafeInteger(rule.value) || rule.value < 0) throw new Error('规则值无效');
      }
      return structuredClone(input);
    }
    if (Array.isArray(model)) { if (!Array.isArray(input) || input.length > 100 || input.some(v => !['string','number'].includes(typeof v) || typeof v === 'number' && !Number.isSafeInteger(v))) throw new Error(label + ' 列表无效'); return structuredClone(input); }
    if (!plain(input) || Object.keys(input).some(key => !Object.hasOwn(model, key))) throw new Error(label + ' 包含未知字段');
    return Object.fromEntries(Object.entries(model).map(([key, sample]) => [key, check(Object.hasOwn(input,key) ? input[key] : sample, sample, label + '.' + key)]));
  }
  return check(value, defaults, 'config');
}

export function createModuleSettings({ file = path.join(DATA_DIR, 'gameplay-settings.json'), modules = {} } = {}) {
  function read() {
    try { const raw=JSON.parse(fs.readFileSync(file,'utf8')); if(!plain(raw)||raw.version!==1||!plain(raw.accounts))throw new Error('invalid');return raw; }
    catch(error){if(error.code==='ENOENT')return {version:1,accounts:{}};throw Object.assign(new Error('玩法配置损坏或不可读取；禁止覆盖原文件'),{code:'SETTINGS_UNAVAILABLE'});}
  }
  function defaults(id) { const module=Object.hasOwn(modules,id)?modules[id]:null;if(!module)throw new Error('未注册玩法');return structuredClone(module.defaultConfig??{enabled:false}); }
  function get(accountId,id) { const base=defaults(id),raw=read();const value=Object.hasOwn(raw.accounts,accountId)?raw.accounts[accountId]?.[id]:null;const config=validateModuleConfig(value??base,base);modules[id].validateConfig?.(config);return {config,source:value?'account':'default'}; }
  function save(accountId,id,input) { if(typeof accountId!=='string'||!accountId||accountId.length>512)throw new Error('账号无效');const config=validateModuleConfig(input,defaults(id));modules[id].validateConfig?.(config);const raw=read();const account=Object.hasOwn(raw.accounts,accountId)?raw.accounts[accountId]:{};Object.defineProperty(account,id,{value:config,enumerable:true,writable:true,configurable:true});Object.defineProperty(raw.accounts,accountId,{value:account,enumerable:true,writable:true,configurable:true});const tmp=file+'.'+process.pid+'.'+randomUUID()+'.tmp';try{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(tmp,JSON.stringify(raw,null,2),{flag:'wx',mode:0o600});fs.renameSync(tmp,file);}finally{try{fs.unlinkSync(tmp);}catch{}}return get(accountId,id); }
  return {get,save};
}
