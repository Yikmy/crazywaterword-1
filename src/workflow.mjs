import fs from 'node:fs';
import { readVipLevelEvent } from './client.mjs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { toSnapshotJson } from './game.mjs';
import { redact } from './security.mjs';
import { normalizeBudgetClaims } from './resource-ledger.mjs';
import { validateFunctionParameters } from './function-contracts.mjs';
import { actionNeedsReconciliation } from './execution-history.mjs';

export const WORKFLOW_LIMITS = Object.freeze({ nodes: 50, edges: 100, steps: 200, waitMs: 60000, bytes: 131072, runDurationMs: 86400000, actionPlans: 200, rounds: 200 });
const TYPES = new Set(['START','SURVEY','CONDITION','RULE','ACTION','WAIT','VERIFY','BRANCH','STOP']);
const ACTIVE = new Set(['STARTING','RUNNING','WAITING','AWAITING_AUTHORIZATION']);
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value));
const text = value => typeof value === 'string' && value.trim().length > 0;
const copy = value => structuredClone(value);
const workflowJsonDigest = value => createHash('sha256').update(JSON.stringify(value,(_key,item)=>plain(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item)).digest('hex');
const fail = (message, code = 'WORKFLOW_INVALID') => Object.assign(new Error(message), { code, statusCode: 400 });
const forbidden = new Set(['__proto__','prototype','constructor','request','body','costs','permit','permitid','authorization','authorizationheader','credentials','credential','password','token','sign','login','loginframehex','wsurl','url','javascript','script','code','eval']);
export const WORKFLOW_CONDITION_FIELDS = Object.freeze({ sources:Object.freeze(['survey','run']), operators:Object.freeze(['EQ','NE','GT','GTE','LT','LTE','EXISTS']), maxDepth:8, forbidden:Object.freeze([...forbidden]) });
function exact(value, keys, label) { if (!plain(value) || Object.keys(value).some(key => !keys.includes(key))) throw fail(label + ' 包含未知字段'); }
function json(value, depth = 0) {
  if (depth > 8) throw fail('业务参数嵌套过深');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw fail('非有限数值'); return; }
  if (typeof value === 'string') { if (value.length > 2000) throw fail('文本过长'); return; }
  if (Array.isArray(value)) { if (value.length > 100) throw fail('数组过长'); value.forEach(item => json(item, depth + 1)); return; }
  if (!plain(value) || Object.keys(value).length > 50) throw fail('业务参数必须是有限 JSON');
  for (const [key, item] of Object.entries(value)) { if (forbidden.has(key.toLowerCase())) throw fail('工作流禁止传输、凭证、脚本及授权参数'); json(item, depth + 1); }
}
function registryOf(options) { const candidate = options?.modules ?? options?.registry ?? options; return candidate instanceof Map ? candidate : new Map(Object.entries(candidate ?? {})); }
function registered(registry, id, type) {
  const module = registry.get(id);
  if (!text(id) || !module || module.id !== id || typeof module.survey !== 'function' || typeof module.view !== 'function' || typeof module.plan !== 'function' || typeof module.verify !== 'function') throw fail('节点引用未注册的业务模块');
  return module;
}
function condition(value) {
  exact(value, ['source','path','operator','value'], '条件');
  if (!WORKFLOW_CONDITION_FIELDS.sources.includes(value.source) || !Array.isArray(value.path) || !value.path.length || value.path.length > WORKFLOW_CONDITION_FIELDS.maxDepth || value.path.some(key => !text(key) || forbidden.has(key.toLowerCase())) || !WORKFLOW_CONDITION_FIELDS.operators.includes(value.operator)) throw fail('条件必须使用受支持的事实路径和比较器');
  if (value.operator !== 'EXISTS' && !Object.hasOwn(value, 'value')) throw fail('条件比较值缺失');
  if (Object.hasOwn(value, 'value')) { if (value.value !== null && !['string','number','boolean'].includes(typeof value.value)) throw fail('条件比较值必须是标量'); json(value.value); }
}
// Declarative compilation provenance only. Never an eligibility, retry or time policy.
function validatePreparation(value) {
  exact(value, ['entry','blocked'], '统一入口来源');
  if (!['tasks','dailies','loop'].includes(value.entry) || !Array.isArray(value.blocked) || value.blocked.length > 96) throw fail('统一入口来源无效');
  const seen = new Set();
  for (const row of value.blocked) {
    exact(row, ['phase','index','reason','taskId'], '未纳入步骤');
    if (!['tasks','dailies'].includes(row.phase) || value.entry !== 'loop' && row.phase !== value.entry || !Number.isSafeInteger(row.index) || row.index < 0 || row.index >= 48 || !Number.isSafeInteger(row.taskId) || row.taskId < 1) throw fail('未纳入步骤身份无效');
    const key = row.phase + ':' + row.index;
    if (seen.has(key)) throw fail('未纳入步骤重复'); seen.add(key);
    if (row.phase === 'tasks' ? row.reason !== 'DAILY_ORDER_CONTRACT_UNVERIFIED' : !['DAILY_ACTION_CONTRACT_UNVERIFIED','EXACT_PIRATE_TARGET_REQUIRED'].includes(row.reason)) throw fail('未纳入步骤原因无效');
    if (row.reason === 'EXACT_PIRATE_TARGET_REQUIRED' && row.taskId !== 1010) throw fail('海盗目标缺口身份无效');
  }
  return copy(value);
}
function validateWorkflowSchedule(schedule){
 const calendar=schedule?.kind==='DAILY'||schedule?.kind==='WEEKLY';exact(schedule,calendar?['kind','localTime','timeZone','missedPolicy',...(schedule.kind==='WEEKLY'?['weekDay']:[])]:['kind','at','timeZone','missedPolicy'],'时间触发');
 if(schedule.timeZone!=='Asia/Shanghai'||schedule.missedPolicy!=='SKIP')throw fail('时间触发必须明确上海时区与错过跳过策略');
 if(!calendar){if(schedule.kind!=='ONCE'||typeof schedule.at!=='string'||!Number.isFinite(Date.parse(schedule.at))||new Date(schedule.at).toISOString()!==schedule.at)throw fail('一次触发必须明确UTC时间');return;}
 if(typeof schedule.localTime!=='string'||!/^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9][.][0-9]{3}$/.test(schedule.localTime)||schedule.kind==='DAILY'&&schedule.weekDay!==undefined||schedule.kind==='WEEKLY'&&(!Number.isSafeInteger(schedule.weekDay)||schedule.weekDay<1||schedule.weekDay>7))throw fail('日周触发须明确上海本地时刻，周触发使用周一1至周日7');
}
// Resolve a single calendar occurrence within the existing explicitly armed run.
// Calendar recurrence never supplies a game reset policy or renews authorization.
export function workflowScheduledAt(schedule,startedAt){
 validateWorkflowSchedule(schedule);if(schedule.kind==='ONCE')return schedule.at;
 const start=Date.parse(startedAt);if(typeof startedAt!=='string'||!Number.isFinite(start))throw fail('日历触发需要本次明确启动时刻');
 const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:schedule.timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',fractionalSecondDigits:3,hourCycle:'h23'});
 const localStamp=value=>{const parts=Object.fromEntries(formatter.formatToParts(value).map(part=>[part.type,part.value]));return Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second),Number(parts.fractionalSecond));};
 const localStart=localStamp(start),date=new Date(localStart),[hour,minute,second,millisecond]=schedule.localTime.split(/[:.]/).map(Number);
 for(let day=0;day<=7;day++){
  const wall=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+day,hour,minute,second,millisecond),weekday=new Date(wall).getUTCDay()||7;if(schedule.kind==='WEEKLY'&&weekday!==schedule.weekDay)continue;
  let candidate=wall;for(let pass=0;pass<4;pass++){const offset=localStamp(candidate)-candidate,next=wall-offset;if(next===candidate)break;candidate=next;}
  if(localStamp(candidate)!==wall)continue; // A nonexistent local time is skipped, never normalized.
  if(candidate>start)return new Date(candidate).toISOString();
 }
 throw fail('无法确定下一个明确上海日历时刻');
}
function validateWorkflowEventRule(rule){exact(rule,['kind','level'],'业务事件');if(rule.kind!=='VIP_LEVEL_CHANGED'||!Number.isInteger(rule.level)||rule.level<0||rule.level>2147483647)throw fail('事件仅支持VIP等级变为明确值；不接受传输或默认字段');}
function validateEventCursor(value){exact(value,['streamId','cursor','playerId','worldId'],'业务事件基线');if(typeof value.streamId!=='string'||!/^[a-f0-9-]{36}$/.test(value.streamId)||!Number.isSafeInteger(value.cursor)||value.cursor<0||['playerId','worldId'].some(key=>typeof value[key]!=='string'||!value[key]||value[key].trim()!==value[key]))throw fail('业务事件游标或角色世界身份无效');}
export function workflowVipEventCursor(session){
 const fact=readVipLevelEvent(session.client),identity=toSnapshotJson(session.player??{});
 if(!fact.reliable||fact.accountId!==session.id||fact.generation!==session.generation||fact.connectionId!==session.connectionId||fact.playerId!==String(identity.playerId)||fact.worldId!==String(identity.worldId))throw fail('VIP事件缺少当前登录、连续序列或精确账号角色世界连接来源','WORKFLOW_EVENT_UNKNOWN');
 const result={streamId:fact.streamId,cursor:fact.cursor,playerId:fact.playerId,worldId:fact.worldId};validateEventCursor(result);return result;
}
export function workflowVipEvent(session,baseline,rule,cursor){
 validateWorkflowEventRule(rule);validateEventCursor(baseline);const current=workflowVipEventCursor(session);
 if(current.streamId!==baseline.streamId||current.playerId!==baseline.playerId||current.worldId!==baseline.worldId||current.cursor<baseline.cursor)throw fail('事件连接流或游标基线已失效','WORKFLOW_EVENT_UNKNOWN');
 if(current.cursor===baseline.cursor)return null;
 const source=readVipLevelEvent(session.client,cursor===undefined?{}:{cursor});if(!source.reliable)throw fail('具体业务事件已不在可信有界游标内','WORKFLOW_EVENT_UNKNOWN');const event=source.event;
 return event&&event.cursor>baseline.cursor&&event.previousLevel!==event.vipLevel&&event.vipLevel===rule.level?copy(event):null;
}
function validateEventTriggerHistory(run){
 const rule=run.runPolicy?.eventTrigger,trigger=run.eventTrigger;if(rule===undefined){if(trigger!==undefined)throw fail('事件历史缺少原规则');return;}validateWorkflowEventRule(rule);
 exact(trigger,['state','baseline','armedAt','firedAt','observedAt','event'],'业务事件历史');validateEventCursor(trigger.baseline);if(!['PENDING','WAITING','FIRED'].includes(trigger.state))throw fail('业务事件状态无效');
 const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value,start=Date.parse(run.startedAt),end=Date.parse(run.expiresAt);
 if(!Number.isFinite(start)||!Number.isFinite(end)||trigger.state==='PENDING'&&(trigger.armedAt!==null||trigger.event!==null||trigger.firedAt!==null||trigger.observedAt!==null)||trigger.state!=='PENDING'&&(!stamp(trigger.armedAt)||Date.parse(trigger.armedAt)<start)||trigger.state==='WAITING'&&(trigger.event!==null||trigger.observedAt!==null||trigger.firedAt!==null)||trigger.state!=='FIRED'&&((run.actionPlans??0)!==0||(run.trace?.length??0)!==0))throw fail('业务事件时间或写前状态不一致');
 if(trigger.state==='FIRED'){const event=trigger.event;exact(event,['eventId','streamId','cursor','seq','previousLevel','vipLevel','receivedAt'],'业务事件证据');if(event.streamId!==trigger.baseline.streamId||!Number.isSafeInteger(event.cursor)||event.cursor<=trigger.baseline.cursor||event.eventId!==event.streamId+':'+event.cursor||!Number.isInteger(event.seq)||event.seq<1||event.seq>2147483647||!Number.isInteger(event.previousLevel)||event.previousLevel<0||event.previousLevel>2147483647||event.vipLevel!==rule.level||event.previousLevel===event.vipLevel||!stamp(event.receivedAt)||!stamp(trigger.observedAt)||Date.parse(trigger.observedAt)<start||!stamp(trigger.firedAt)||Date.parse(trigger.firedAt)<Date.parse(trigger.observedAt)||Date.parse(trigger.firedAt)<Date.parse(trigger.armedAt)||Date.parse(trigger.firedAt)>=end)throw fail('业务事件身份、游标或时间证据不一致');}
}
function validateRunPolicy(value) {
 exact(value,['maxDurationMs','maxActions','modules','maxRounds','roundIntervalMs','schedule','eventTrigger'],'运行边界');
 if(value.maxRounds!==undefined&&(!Number.isSafeInteger(value.maxRounds)||value.maxRounds<1||value.maxRounds>WORKFLOW_LIMITS.rounds)||value.roundIntervalMs!==undefined&&(value.maxRounds===undefined||!Number.isSafeInteger(value.roundIntervalMs)||value.roundIntervalMs<0||value.roundIntervalMs>WORKFLOW_LIMITS.waitMs))throw fail('重复轮次或轮间隔必须有明确有限范围');
 if(!Number.isSafeInteger(value.maxDurationMs)||value.maxDurationMs<1||value.maxDurationMs>WORKFLOW_LIMITS.runDurationMs||!Number.isSafeInteger(value.maxActions)||value.maxActions<0||value.maxActions>WORKFLOW_LIMITS.actionPlans||!Array.isArray(value.modules)||value.modules.length>WORKFLOW_LIMITS.nodes||value.modules.some(id=>!text(id)||id.trim()!==id||id.length>100)||new Set(value.modules).size!==value.modules.length)throw fail('运行期限、动作计划上限或明确玩法范围无效');
 if(value.eventTrigger!==undefined){validateWorkflowEventRule(value.eventTrigger);if(value.schedule!==undefined)throw fail('本次运行只能明确选择时间触发或业务事件触发');}
 if(value.schedule!==undefined)validateWorkflowSchedule(value.schedule);
 return copy(value);
}
function validateRoundHistory(run){
 const max=run.runPolicy?.maxRounds;
 if(max===undefined){if(run.round!==undefined||run.completedRounds!==undefined||run.trace?.some(row=>row?.round!==undefined||row?.result?.startsWith('ROUND_')))throw fail('轮次历史缺少原有限重复声明');return;}
 if(!Number.isSafeInteger(run.round)||run.round<1||run.round>max||!Number.isSafeInteger(run.completedRounds)||run.completedRounds<run.round-1||run.completedRounds>run.round||run.status==='COMPLETED'&&run.completedRounds!==max||run.trace?.some(row=>row?.round===undefined||row.round>run.round||row.result?.startsWith('ROUND_')&&(row.type!=='STOP'||row.round>run.completedRounds)))throw fail('有限重复历史轮次无效');
 let previous=0;for(const row of run.trace??[]){if(row.round<previous||row.round!==previous&&(row.round!==previous+1||row.type!=='START'||row.result!=='START'))throw fail('有限重复历史缺少按序轮次开始证据');previous=row.round;if(row.result?.startsWith('ROUND_')&&(!['ROUND_WAIT_STARTED','ROUND_WAITED'].includes(row.result)||row.round>=max||row.durationMs!==(run.runPolicy.roundIntervalMs??0)||row.durationMs<=0))throw fail('轮间隔历史与明确声明不符');}
}
function validateTriggerHistory(run){
 const schedule=run.runPolicy?.schedule,trigger=run.trigger;
 if(schedule===undefined){if(trigger!==undefined)throw fail('触发历史缺少明确时间声明');return;}
 const calendar=schedule.kind!=='ONCE';exact(trigger,calendar?['state','armedAt','firedAt','missedAt','scheduledAt','playerId','worldId']:['state','armedAt','firedAt','missedAt'],'时间触发历史');if(calendar&&(trigger.scheduledAt!==workflowScheduledAt(schedule,run.startedAt)||['playerId','worldId'].some(key=>typeof trigger[key]!=='string'||!trigger[key]||trigger[key].trim()!==trigger[key])))throw fail('日历触发的具体时刻或角色世界身份缺失');if(!['PENDING','WAITING','FIRED','MISSED'].includes(trigger.state))throw fail('时间触发历史状态无效');
 if(['armedAt','firedAt','missedAt'].some(key=>trigger[key]!==null&&(typeof trigger[key]!=='string'||!Number.isFinite(Date.parse(trigger[key]))||new Date(trigger[key]).toISOString()!==trigger[key])))throw fail('触发时刻必须保留原明确UTC时间或null');
 const at=Date.parse(calendar?trigger.scheduledAt:schedule.at),started=Date.parse(run.startedAt),expires=Date.parse(run.expiresAt),armed=trigger.armedAt===null?null:Date.parse(trigger.armedAt),fired=trigger.firedAt===null?null:Date.parse(trigger.firedAt),missed=trigger.missedAt===null?null:Date.parse(trigger.missedAt);
 if(!Number.isFinite(started)||!Number.isFinite(expires)||armed!==null&&(!Number.isFinite(armed)||armed<started)||trigger.state==='PENDING'&&(armed!==null||fired!==null||missed!==null)||trigger.state==='WAITING'&&(!Number.isFinite(armed)||armed>=at||fired!==null||missed!==null)||trigger.state==='FIRED'&&(!Number.isFinite(armed)||armed>=at||!Number.isFinite(fired)||fired<at||fired<armed||fired>=expires||missed!==null)||trigger.state==='MISSED'&&(!Number.isFinite(missed)||missed<at||fired!==null)||trigger.state!=='FIRED'&&((run.actionPlans??0)!==0||(run.trace?.length??0)!==0))throw fail('时间触发历史与原时间窗口不一致');
}
function validateAuthorizationAudit(run,modules){
 if(run.runAuthorization===undefined)return;
 const audit=run.runAuthorization;exact(audit,['scope','approvedAt','resumable'],'有限运行授权审计');const scope=audit.scope;exact(scope,['accountId','runId','workflowId','graphHash','executionContext','graph','dependencies','expiresAt','scheduledAt','eventCursor'],'有限运行授权范围');
 if(audit.resumable!==false||!text(audit.approvedAt)||!Number.isFinite(Date.parse(audit.approvedAt))||scope.accountId!==run.accountId||scope.runId!==run.runId||scope.workflowId!==run.workflowId||scope.expiresAt!==run.expiresAt||Date.parse(audit.approvedAt)>=Date.parse(scope.expiresAt))throw fail('运行授权审计身份或期限无效');
 const graph=validateWorkflow(scope.graph,{modules}).workflow,hash=workflowJsonDigest;
 if(!graph.runPolicy||graph.id!==scope.workflowId||hash(graph)!==scope.graphHash||hash(graph.runPolicy)!==hash(run.runPolicy))throw fail('授权图、边界或摘要不一致');
 const started=Date.parse(run.startedAt),expires=Date.parse(scope.expiresAt),approved=Date.parse(audit.approvedAt);if(!Number.isFinite(started)||!Number.isFinite(expires)||expires<=started||expires-started>graph.runPolicy.maxDurationMs||approved<started)throw fail('授权期限超出原运行边界');
 const calendar=graph.runPolicy.schedule&&graph.runPolicy.schedule.kind!=='ONCE';if(calendar?(scope.scheduledAt!==workflowScheduledAt(graph.runPolicy.schedule,run.startedAt)||scope.scheduledAt!==run.trigger?.scheduledAt):scope.scheduledAt!==undefined)throw fail('授权的具体日历触发时刻不一致');
 const identity=scope.executionContext;exact(identity,['accountId','playerId','worldId','generation','connectionId'],'授权账号身份');if(identity.accountId!==run.accountId||!Number.isSafeInteger(identity.generation)||identity.generation<0||!text(identity.connectionId)||[identity.playerId,identity.worldId].some(value=>!(typeof value==='string'&&value.trim()===value&&value.length>0||Number.isSafeInteger(value)&&value>=0)))throw fail('授权角色、世界或连接身份缺失');
 if(calendar&&(String(identity.playerId)!==run.trigger.playerId||String(identity.worldId)!==run.trigger.worldId))throw fail('日历触发与授权角色世界不一致');
 if(graph.runPolicy.eventTrigger){if(workflowJsonDigest(scope.eventCursor)!==workflowJsonDigest(run.eventTrigger?.baseline)||String(identity.playerId)!==scope.eventCursor?.playerId||String(identity.worldId)!==scope.eventCursor?.worldId)throw fail('授权事件游标与账号身份不一致');}else if(scope.eventCursor!==undefined)throw fail('原授权没有事件规则');
 const dependencies=scope.dependencies;exact(dependencies,['configHash','rulesHash','productionHash','moduleConfigs'],'授权配置版本');if(['configHash','rulesHash','productionHash'].some(key=>typeof dependencies[key]!=='string'||!/^[a-f0-9]{64}$/.test(dependencies[key]))||!plain(dependencies.moduleConfigs)||graph.nodes.some(node=>node.type==='ACTION'&&!Object.hasOwn(dependencies.moduleConfigs,node.module)))throw fail('授权业务配置版本缺失');
}
export function validateWorkflow(input, options = {}) {
  exact(input, ['version','id','name','nodes','edges','budget','preparation','runPolicy'], '工作流');
  if (input.version !== 1 || !text(input.id) || input.id.length > 100 || !text(input.name) || input.name.length > 160 || !Array.isArray(input.nodes) || !input.nodes.length || input.nodes.length > WORKFLOW_LIMITS.nodes || !Array.isArray(input.edges) || input.edges.length > WORKFLOW_LIMITS.edges) throw fail('工作流版本、身份或图大小无效');
  const registry = registryOf(options); let graph; try { graph = copy(input); } catch { throw fail('工作流必须为可复制的 JSON'); } const nodes = new Map();
  if (graph.budget !== undefined) { try { graph.budget=normalizeBudgetClaims(graph.budget); } catch { throw fail('工作流预算必须为有限资源/配额/UID上限'); } }
  if(graph.runPolicy!==undefined){graph.runPolicy=validateRunPolicy(graph.runPolicy);for(const id of graph.runPolicy.modules)registered(registry,id);if(graph.budget===undefined)throw fail('声明运行边界必须同时声明明确累计预算');}
  if (graph.preparation !== undefined) graph.preparation = validatePreparation(graph.preparation);
  const fields = {
    START: [], STOP: [], BRANCH: [], WAIT: ['durationMs'], SURVEY: ['module','parameters'], ACTION: ['module','parameters','selection'],
    CONDITION: ['condition'], RULE: ['condition'], VERIFY: ['module','condition'],
  };
  for (const node of graph.nodes) {
    if (!plain(node) || !TYPES.has(node.type) || !text(node.id) || node.id.length > 100 || nodes.has(node.id)) throw fail('节点类型或唯一 ID 无效');
    exact(node, ['id','type','label',...fields[node.type]], '节点');
    if (node.label !== undefined && (!text(node.label) || node.label.length > 160)) throw fail('节点标签无效');
    if (['SURVEY','ACTION'].includes(node.type) || node.module !== undefined) registered(registry, node.module, node.type);
    if (node.parameters !== undefined) { if (!plain(node.parameters)) throw fail('业务参数必须为对象'); json(node.parameters); }
    if (['SURVEY','ACTION'].includes(node.type)) { const adapter=registry.get(node.module); if(adapter?.contractVersion===1) validateFunctionParameters(node.module,adapter,node.parameters??{}); }
    if (node.type === 'ACTION') {
      if (typeof node.selection === 'string') { if (!text(node.selection) || node.selection.length > 1000) throw fail('操作选择无效'); }
      else if (plain(node.selection) && node.selection.unique === true) { exact(node.selection, ['unique'], '唯一候选选择'); }
      else { exact(node.selection, ['actionId'], '操作选择'); if (!text(node.selection.actionId) || node.selection.actionId.length > 1000) throw fail('缺少明确操作 ID'); }
    }
    if (['CONDITION','RULE'].includes(node.type) || node.condition !== undefined) condition(node.condition);
    if (node.type === 'WAIT' && (!Number.isSafeInteger(node.durationMs) || node.durationMs < 0 || node.durationMs > WORKFLOW_LIMITS.waitMs)) throw fail('WAIT 必须为 0–60000 毫秒');
    if(graph.runPolicy&&node.module!==undefined&&!graph.runPolicy.modules.includes(node.module))throw fail('节点玩法超出声明运行范围');
    nodes.set(node.id, node);
  }
  const starts = graph.nodes.filter(node => node.type === 'START');
  if (starts.length !== 1 || !graph.nodes.some(node => node.type === 'STOP')) throw fail('必须恰好一个 START 且至少一个 STOP');
  const outgoing = new Map(graph.nodes.map(node => [node.id, []])), incoming = new Map(graph.nodes.map(node => [node.id, 0])), seen = new Set();
  for (const edge of graph.edges) {
    exact(edge, ['from','to','when'], '边');
    if (!nodes.has(edge.from) || !nodes.has(edge.to) || !['ALWAYS','PASS','FAIL'].includes(edge.when ?? 'ALWAYS')) throw fail('边引用无效节点或条件');
    const key = edge.from + ':' + (edge.when ?? 'ALWAYS'); if (seen.has(key)) throw fail('同一节点的出口条件不得重复'); seen.add(key);
    outgoing.get(edge.from).push(edge); incoming.set(edge.to, incoming.get(edge.to) + 1);
  }
  if (incoming.get(starts[0].id) !== 0) throw fail('START 不得有入边');
  for (const node of graph.nodes) {
    const edges = outgoing.get(node.id);
    if (node.type === 'STOP') { if (edges.length) throw fail('STOP 不得有出边'); }
    else if (node.type === 'BRANCH' || ['CONDITION','RULE'].includes(node.type) && edges.length === 2) {
      if (edges.length !== 2 || !edges.some(edge => edge.when === 'PASS') || !edges.some(edge => edge.when === 'FAIL')) throw fail('分支必须恰好有 PASS/FAIL 出口');
    } else {
      if (edges.length !== 1 || (edges[0].when ?? 'ALWAYS') !== 'ALWAYS') throw fail('普通节点必须有一个无条件出口');
      if (['CONDITION','RULE'].includes(node.type) && nodes.get(edges[0].to).type !== 'BRANCH') throw fail('条件结果必须通过显式分支消费');
    }
  }
  const visited = new Set(), visiting = new Set(), order = [];
  function visit(id) { if (visiting.has(id)) throw fail('工作流禁止循环'); if (visited.has(id)) return; visiting.add(id); for (const edge of outgoing.get(id)) visit(edge.to); visiting.delete(id); visited.add(id); order.unshift(id); }
  visit(starts[0].id);
  if (visited.size !== nodes.size) throw fail('工作流不得包含不可达节点');
  let bytes; try { bytes = Buffer.byteLength(JSON.stringify(graph)); } catch { throw fail('工作流必须可序列化'); }
  if (bytes > WORKFLOW_LIMITS.bytes) throw fail('工作流过大');
  return { valid: true, workflow: graph, order };
}
export function evaluateWorkflowCondition(rule, context = {}) {
  condition(rule);
  let value = context[rule.source];
  for (const key of rule.path) { if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) return { status: 'UNKNOWN', reason: '条件事实路径缺失' }; value = value[key]; }
  if (value === undefined || typeof value === 'number' && !Number.isFinite(value)) return { status: 'UNKNOWN', reason: '条件事实不可靠' };
  if (rule.operator === 'EXISTS') return value === null ? { status: 'UNKNOWN', reason: '条件事实为null，无法确认' } : { status: 'PASS', reason: '权威事实存在' };
  if (value !== null && !['string','number','boolean'].includes(typeof value) || typeof value !== typeof rule.value) return { status: 'UNKNOWN', reason: '条件类型不一致' };
  let result;
  switch (rule.operator) { case 'EQ': result = value === rule.value; break; case 'NE': result = value !== rule.value; break; default: if (typeof value !== 'number' || !Number.isFinite(rule.value)) return { status: 'UNKNOWN', reason: '排序比较只接受可靠数值' }; result = rule.operator === 'GT' ? value > rule.value : rule.operator === 'GTE' ? value >= rule.value : rule.operator === 'LT' ? value < rule.value : value <= rule.value; }
  return { status: result ? 'PASS' : 'FAIL', reason: result ? '条件满足' : '条件不满足' };
}
export function simulateWorkflow(graph, options = {}) {
  const validated = validateWorkflow(graph, options), byId = new Map(validated.workflow.nodes.map(node => [node.id, node]));
  return { status: 'SIMULATED', workflowId: graph.id, runtimeCreated: false, requestsSent: 0,...(validated.workflow.runPolicy?{runPolicy:copy(validated.workflow.runPolicy)}:{}),...(validated.workflow.runPolicy?.maxRounds!==undefined?{traceCoverage:'ONE_STATIC_DAG_PASS'}:{}),
    trace: validated.order.map(id => { const node = byId.get(id); return { nodeId: id, type: node.type, module: node.module ?? null, requiresAuthorization: node.type === 'ACTION', result: node.condition ? evaluateWorkflowCondition(node.condition, options.facts ?? {}).status : node.type === 'ACTION' ? 'AWAITING_AUTHORIZATION' : 'STATIC', durationMs: node.durationMs ?? 0 }; }) };
}
function confirmedRun(run, plan, accountId) {
  if (!run || run.accountId !== accountId || run.finalStatus !== 'SUCCESS' || !text(run.finishedAt) || !Array.isArray(run.actions) || !Array.isArray(plan.actions) || !run.actions.length || run.actions.length !== plan.actions.length) return false;
  const ids = plan.actions.map(action => action.actionId);
  if (new Set(ids).size !== ids.length || new Set(run.actions.map(action => action.actionId)).size !== run.actions.length) return false;
  if (run.planSummary?.batchId !== plan.batchId && run.authorizationSummary?.batchId !== plan.batchId) return false;
  if (run.planSummary?.batchId && run.planSummary.batchId !== plan.batchId || run.authorizationSummary?.batchId && run.authorizationSummary.batchId !== plan.batchId || run.planSummary?.planHash && run.planSummary.planHash !== plan.planHash) return false;
  return run.actions.every(action => ids.includes(action.actionId) && action.result === 'SUCCESS' && (action.verification === 'CONFIRMED' || action.verification?.confirmed === true || action.verification?.status === 'CONFIRMED'));
}
export function createWorkflowRunner({ operations, getSession, modules, isCurrent, signal, clock = Date.now, claim = () => true, release = () => {}, onUpdate = () => {} } = {}) {
  if (!operations || typeof operations.surveyModule !== 'function' || typeof operations.plan !== 'function' || typeof operations.history !== 'function' || typeof getSession !== 'function') throw fail('工作流缺少已注册的操作服务');
  let context = null, task = null, starting = false, resuming = false, finishing = false, authorizing = false;
  const now = () => new Date(clock()).toISOString();
  function getStatus() { if (!context) return { status: 'IDLE', running: false }; const parent=operations.workflowBudget?.(context.accountId); if(parent?.scope.runId===context.runId)context.runBudget=parent; return copy({ runId: context.runId, accountId: context.accountId, workflowId: context.graph.id, ...(context.graph.preparation ? {preparation:copy(context.graph.preparation)} : {}), status: context.status, running: ACTIVE.has(context.status), ...(context.authorizationOffer?{authorizationOffer:context.authorizationOffer}:{}),...(context.runAuthorization?{runAuthorization:context.runAuthorization}:{}),...(context.trigger?{trigger:context.trigger}:{}),...(context.eventTrigger?{eventTrigger:context.eventTrigger}:{}), currentNode: context.nodeId, steps: context.steps, startedAt: context.startedAt, finishedAt: context.finishedAt, reason: context.reason, plan: context.waitingPlan, lastRun: context.lastRun ? { runId: context.lastRun.runId, finalStatus: context.lastRun.finalStatus, finishedAt: context.lastRun.finishedAt } : null, trace: context.trace, ...(context.graph.runPolicy?{runPolicy:context.graph.runPolicy,expiresAt:context.expiresAt,actionPlans:context.actionPlans,...(context.graph.runPolicy.maxRounds!==undefined?{round:context.round,completedRounds:context.completedRounds}:{})}:{}), ...(operations.workflowBudget ? {runBudget:context.runBudget??null} : {}) }); }
  // Capture both owners: the Console session and the existing client's live
  // connection facts. Reusing a client must never inherit an old workflow.
  const connectionScope = session => [session.id, session.connectionId, session.client?.factContext?.accountId, session.client?.factContext?.generation, session.client?.factContext?.connectionId];
  const roleScope = session => [session.player?.playerId, session.player?.worldId].map(value => { const normalized=toSnapshotJson(value); return typeof normalized==='number'||typeof normalized==='string'?String(normalized):JSON.stringify(normalized); });
  function current(ctx) {
    if(ctx.graph.runPolicy&&clock()>=Date.parse(ctx.expiresAt)){ctx.limitReason='运行总时长已到限；停止后续节点，旧授权不继承';throw fail(ctx.limitReason,'WORKFLOW_LIMIT');}
    if (ctx.cancel.signal.aborted || signal?.aborted || context !== ctx || ![...ACTIVE].includes(ctx.status) || ctx.session.abort?.signal?.aborted) throw fail('工作流已取消或账号会话失效', 'CANCELLED');
    if(ctx.eventTrigger)workflowVipEvent(ctx.session,ctx.eventTrigger.baseline,ctx.graph.runPolicy.eventTrigger);
    if (ctx.session.generation !== ctx.generation || ctx.session.client !== ctx.client || ctx.client?.connected === false || ctx.session.abort?.signal !== ctx.sessionSignal || connectionScope(ctx.session).some((value,index) => value !== ctx.connectionScope[index]) || roleScope(ctx.session).some((value,index) => value !== ctx.roleScope[index]) || isCurrent && isCurrent(ctx.session, ctx.generation, ctx.client) === false) throw fail('账号会话或连接已切换', 'CANCELLED');
  }
  async function relinquish(ctx) { if (!ctx.claimed) return; ctx.claimed = false; if (ctx.releaseClaim) await ctx.releaseClaim(); else await release(ctx.accountId, ctx.runId); }
  function finish(ctx,status,reason){if(!ctx.finishTask)ctx.finishTask=finishWork(ctx,status,reason);return ctx.finishTask;}
  async function finishWork(ctx, status, reason) {
    clearTimeout(ctx.deadlineTimer);ctx.eventCleanup?.();finishing=true;
    ctx.status=status; ctx.reason=reason; ctx.finishedAt=now(); ctx.waitingPlan=null;
    signal?.removeEventListener('abort',ctx.externalAbort); ctx.sessionSignal?.removeEventListener('abort',ctx.externalAbort);
    // Close the parent immediately but retain the owner until its operation settles.
    const outcome={COMPLETED:'SUCCESS',UNKNOWN:'UNKNOWN',CANCELLED:'CANCELLED',FAILED:'FAILED'}[status]??'STOPPED';
    const parent=operations.closeWorkflowBudget?.(ctx.accountId,ctx.runId,outcome); if(parent)ctx.runBudget=parent;
    if(operations.running?.(ctx.accountId)){operations.stop?.(ctx.accountId);await operations.settle(ctx.accountId);}
    try{await onUpdate(getStatus());}catch{ctx.status='FAILED';ctx.reason='工作流持久化失败；已停止所有后续节点';}
    try{await relinquish(ctx);}catch{ctx.status='FAILED';ctx.reason='账号工作流锁释放失败';}finally{finishing=false;}
  }
  function cancelled(ctx, promise) {
    const observed = Promise.resolve(promise); let listener;
    const aborted = new Promise((_, reject) => { listener = () => reject(fail('工作流已取消', 'CANCELLED')); ctx.cancel.signal.addEventListener('abort', listener, { once: true }); if (ctx.cancel.signal.aborted || signal?.aborted) listener(); });
    return Promise.race([observed, aborted]).finally(() => ctx.cancel.signal.removeEventListener('abort', listener));
  }
  function next(ctx, result = 'ALWAYS') { const edges = ctx.graph.edges.filter(edge => edge.from === ctx.nodeId), edge = edges.find(entry => entry.when === result) ?? edges.find(entry => (entry.when ?? 'ALWAYS') === 'ALWAYS'); if (!edge) throw fail('工作流出口未匹配', 'WORKFLOW_UNKNOWN'); return edge.to; }
  async function trace(ctx, node, result, evidence = {}) { if(ctx.trace.length>=WORKFLOW_LIMITS.steps)throw fail('累计历史步骤上限已达到','WORKFLOW_LIMIT');ctx.trace.push({...(ctx.graph.runPolicy?.maxRounds!==undefined?{round:ctx.round}:{}), nodeId: node.id, type: node.type, result, timestamp: now(), ...(node.module ? {module:node.module} : {}), ...evidence }); await onUpdate(getStatus()); }
function repeatAfterStop(ctx,node){
 return (async()=>{
  const policy=ctx.graph.runPolicy;if(policy?.maxRounds===undefined)return false;
  ctx.completedRounds=ctx.round;await onUpdate(getStatus());current(ctx);if(ctx.round>=policy.maxRounds)return false;
  const durationMs=policy.roundIntervalMs??0;
  if(durationMs>0){
   ctx.status='WAITING';await trace(ctx,node,'ROUND_WAIT_STARTED',{durationMs});current(ctx);let timer;
   try{await cancelled(ctx,new Promise(resolve=>{timer=setTimeout(resolve,durationMs);}));}finally{clearTimeout(timer);}
   ctx.status='RUNNING';current(ctx);await trace(ctx,node,'ROUND_WAITED',{durationMs});current(ctx);
  }
  ctx.round++;ctx.nodeId=ctx.graph.nodes.find(entry=>entry.type==='START').id;
  ctx.survey=null;ctx.surveyModule=null;ctx.lastResult=null;ctx.lastPlan=null;ctx.lastRun=null;ctx.lastActionModule=null;
  await onUpdate(getStatus());current(ctx);return true;
 })();
}
  async function advance(ctx) {
    try {
      ctx.status = 'RUNNING';
      while (true) {
        current(ctx); if (ctx.steps >= WORKFLOW_LIMITS.steps) throw fail('工作流累计步骤上限已达到', 'WORKFLOW_LIMIT');ctx.steps++;
        const node = ctx.graph.nodes.find(entry => entry.id === ctx.nodeId);
        if (node.type === 'STOP') { await trace(ctx, node, 'STOP'); current(ctx); if(await repeatAfterStop(ctx,node))continue;await finish(ctx, 'COMPLETED', ctx.trace.some(row => row.result.startsWith('BLOCKED_')) || ctx.graph.preparation?.blocked.length ? '工作流到达 STOP；含未执行的阻塞节点或编译未纳入步骤，详情见运行历史' : '工作流到达 STOP'); break; }
        if (node.type === 'START') { await trace(ctx, node, 'START'); ctx.nodeId = next(ctx); continue; }
        if (node.type === 'SURVEY') { ctx.survey = await cancelled(ctx, operations.surveyModule(ctx.session, node.module, copy(node.parameters ?? {}), { workflowId: ctx.runId })); current(ctx); ctx.surveyModule = node.module; await trace(ctx, node, 'SURVEYED'); ctx.nodeId = next(ctx); continue; }
        if (node.type === 'ACTION') {
          if(ctx.graph.runPolicy&&ctx.actionPlans>=ctx.graph.runPolicy.maxActions)throw fail('累计动作计划已到声明上限','WORKFLOW_LIMIT');
          ctx.lastPlan = null; ctx.lastRun = null; ctx.lastActionModule = null;
          operations.bindWorkflowNode?.(ctx.session,ctx.runId,{workflowId:ctx.graph.id,nodeId:node.id,...(ctx.graph.runPolicy?.maxRounds!==undefined?{round:ctx.round}:{})});
          let selectedId = typeof node.selection === 'string' ? node.selection : node.selection.actionId;
          if (node.selection?.unique === true) {
            const surveyed = await cancelled(ctx, operations.surveyModule(ctx.session, node.module, copy(node.parameters ?? {}), { workflowId: ctx.runId })); current(ctx);
            if (surveyed?.accountId !== ctx.accountId || surveyed.module !== node.module || !Array.isArray(surveyed.view?.candidates)) throw fail('唯一候选缺少同账号同模块调查', 'WORKFLOW_UNKNOWN');
            ctx.survey = surveyed; ctx.surveyModule = node.module;
            const candidates = surveyed.view.candidates.filter(row => row.executable === true);
            if (!candidates.length) {
              const blockedReasons = [...new Set(surveyed.view.candidates.map(row => row.blockedReason).filter(reason => text(reason) && reason.length <= 512))].slice(0,50);
              await trace(ctx, node, 'BLOCKED_NO_EXECUTABLE_CANDIDATE', {blockedReasons:blockedReasons.length?blockedReasons:['NO_EXECUTABLE_CANDIDATE']}); ctx.nodeId = next(ctx); continue;
            }
            if (candidates.length !== 1 || !text(candidates[0].actionId)) throw fail('存在多个候选或候选身份不明；须选择明确操作', 'WORKFLOW_UNKNOWN');
            selectedId = candidates[0].actionId;
          }
          let plan;
          if(ctx.graph.runPolicy){ctx.actionPlans++;await onUpdate(getStatus());current(ctx);}
          try { plan = await cancelled(ctx, operations.plan(ctx.session, { module: node.module, mode: 'Manual', selections: [selectedId], parameters: copy(node.parameters ?? {}) }, { workflowId: ctx.runId })); current(ctx); }
          catch (error) {
            current(ctx);
            if (node.selection?.unique === true && error.code === 'REJECTION_MEMORY_ACTIVE') { await trace(ctx, node, 'BLOCKED_REJECTION_MEMORY', {actionId:selectedId,blockedReasons:['REJECTION_MEMORY_ACTIVE']}); ctx.nodeId = next(ctx); continue; }
            throw error;
          }
          if (!plain(plan) || !text(plan.batchId) || plan.accountId !== ctx.accountId || !Array.isArray(plan.actions) || plan.actions.length !== 1 || !text(plan.actions[0].actionId)) throw fail('操作服务未返回可单次确认的账号计划', 'WORKFLOW_UNKNOWN');
          if (plan.actions[0].actionId !== selectedId || plan.module && plan.module !== node.module) throw fail('计划与工作流精确操作选择不一致', 'WORKFLOW_UNKNOWN');
          ctx.waitingPlan = copy(plan); ctx.lastPlan = copy(plan); ctx.lastActionModule = node.module; ctx.status = 'AWAITING_AUTHORIZATION'; ctx.reason = '须由用户单次授权并执行当前具体计划'; await trace(ctx, node, 'AWAITING_AUTHORIZATION', {actionId:selectedId,batchId:plan.batchId,...(plan.planHash?{planHash:plan.planHash}:{})});if(ctx.runAuthorization){if(await executeAuthorizedBatch(ctx))continue;} break;
        }
        if (node.type === 'WAIT') { ctx.status = 'WAITING'; await trace(ctx, node, 'WAIT_STARTED', {durationMs:node.durationMs}); current(ctx); let timer; try { await cancelled(ctx, new Promise(resolve => { timer = setTimeout(resolve, node.durationMs); })); } finally { clearTimeout(timer); } ctx.status = 'RUNNING'; current(ctx); await trace(ctx, node, 'WAITED', {durationMs:node.durationMs}); ctx.nodeId = next(ctx); continue; }
        if (node.type === 'BRANCH') { if (!['PASS','FAIL'].includes(ctx.lastResult)) throw fail('分支缺少已验证的条件结果', 'WORKFLOW_UNKNOWN'); await trace(ctx, node, ctx.lastResult); ctx.nodeId = next(ctx, ctx.lastResult); continue; }
        if (node.type === 'VERIFY' && !node.condition) {
          if (!ctx.lastPlan || !confirmedRun(ctx.lastRun, ctx.lastPlan, ctx.accountId) || node.module && node.module !== ctx.lastActionModule) throw fail('VERIFY 缺少当前批次成功且确认的执行历史', 'WORKFLOW_UNKNOWN');
          ctx.lastResult = 'PASS'; await trace(ctx, node, 'CONFIRMED'); ctx.nodeId = next(ctx); continue;
        }
        if (node.condition) {
          const result = evaluateWorkflowCondition(node.condition, { survey: ctx.survey, run: ctx.lastRun });
          if (result.status === 'UNKNOWN') throw fail(result.reason, 'WORKFLOW_UNKNOWN');
          if (node.type === 'VERIFY' && result.status !== 'PASS') throw fail('VERIFY 条件未确认成功', 'WORKFLOW_UNKNOWN');
          ctx.lastResult = result.status; await trace(ctx, node, result.status); ctx.nodeId = next(ctx, result.status); continue;
        }
        throw fail('节点未通过静态注册验证', 'WORKFLOW_UNKNOWN');
      }
    } catch (error) { await finish(ctx, ctx.limitReason||error.code==='WORKFLOW_LIMIT'?'STOPPED':error.code === 'CANCELLED' ? 'CANCELLED' : ['WORKFLOW_UNKNOWN','WORKFLOW_EVENT_UNKNOWN'].includes(error.code) ? 'UNKNOWN' : 'FAILED',ctx.limitReason??(error.code === 'CANCELLED' ? '工作流已停止或账号会话失效' : error.message)); }
    return getStatus();
  }
  async function start(accountId, graph) {
    if (starting || resuming || authorizing || finishing || context && ACTIVE.has(context.status)) throw fail('账号工作流尚未结束', 'WORKFLOW_BUSY');
    if (!text(accountId)) throw fail('工作流必须绑定精确账号 ID');
    const validated = validateWorkflow(graph, { modules }); starting = true;
    try {
      const session = await getSession(accountId); if (!session || session.id !== accountId) throw fail('工作流账号会话不存在');
      const ctx = { accountId, session, generation: session.generation, client: session.client, connectionScope: connectionScope(session), roleScope: roleScope(session), sessionSignal: session.abort?.signal, runId: randomUUID(), graph: validated.workflow, nodeId: validated.workflow.nodes.find(node => node.type === 'START').id, status: 'STARTING', steps: 0, startedAt: now(), finishedAt: null, reason: null, trace: [], waitingPlan: null, lastRun: null, lastPlan: null, cancel: new AbortController(), claimed: false };
      if(ctx.graph.runPolicy){ctx.expiresAt=new Date(Date.parse(ctx.startedAt)+ctx.graph.runPolicy.maxDurationMs).toISOString();ctx.actionPlans=0;if(ctx.graph.runPolicy.maxRounds!==undefined){ctx.round=1;ctx.completedRounds=0;}}
      if(ctx.graph.runPolicy?.schedule){const schedule=ctx.graph.runPolicy.schedule;ctx.trigger={state:'PENDING',armedAt:null,firedAt:null,missedAt:null};if(schedule.kind!=='ONCE'){const identity=toSnapshotJson(session.player??{});if(['playerId','worldId'].some(key=>!(typeof identity[key]==='string'&&identity[key].trim()===identity[key]&&identity[key].length>0||Number.isSafeInteger(identity[key])&&identity[key]>=0)))throw fail('日周触发必须绑定明确角色与世界');Object.assign(ctx.trigger,{scheduledAt:workflowScheduledAt(schedule,ctx.startedAt),playerId:String(identity.playerId),worldId:String(identity.worldId)});}}
      if(ctx.graph.runPolicy?.eventTrigger)ctx.eventTrigger={state:'PENDING',baseline:workflowVipEventCursor(session),armedAt:null,firedAt:null,observedAt:null,event:null};
      context = ctx; ctx.externalAbort = () => { ctx.cancel.abort(); if (ctx.status === 'AWAITING_AUTHORIZATION') task = finish(ctx, 'CANCELLED', '外部信号或账号会话已取消工作流').then(getStatus); }; signal?.addEventListener('abort', ctx.externalAbort, { once: true }); ctx.sessionSignal?.addEventListener('abort', ctx.externalAbort, { once: true });
      if(ctx.graph.runPolicy){ctx.deadlineTimer=setTimeout(()=>{if(context!==ctx||!ACTIVE.has(ctx.status))return;ctx.limitReason='运行总时长已到限；停止后续节点，旧授权不继承';ctx.cancel.abort();if(ctx.status==='AWAITING_AUTHORIZATION')task=finish(ctx,'STOPPED',ctx.limitReason).then(getStatus);},ctx.graph.runPolicy.maxDurationMs);}
      if(ctx.trigger){const at=Date.parse(ctx.trigger.scheduledAt??ctx.graph.runPolicy.schedule.at);if(at<=clock()){ctx.trigger.state='MISSED';ctx.trigger.missedAt=now();await finish(ctx,'STOPPED','明确触发时间已错过，按SKIP跳过且不补跑');return getStatus();}if(at>=Date.parse(ctx.expiresAt)){await finish(ctx,'STOPPED','明确触发时间不在本次有限运行期限内');return getStatus();}}
      try { if(ctx.eventTrigger)listenForEvent(ctx); current(ctx); const lock = await claim(accountId, ctx.runId, {limits:ctx.graph.budget??null,...(ctx.graph.runPolicy?{expiresAt:ctx.expiresAt,graph:ctx.graph,...(ctx.eventTrigger?{eventCursor:ctx.eventTrigger.baseline}:{})}:{})}); if (lock === false) throw fail('账号已有互斥任务', 'WORKFLOW_BUSY'); ctx.claimed = true; ctx.releaseClaim = typeof lock === 'function' ? lock : null; current(ctx);ctx.authorizationOffer=operations.workflowAuthorizationOffer?.(session,ctx.runId)??null; await onUpdate(getStatus()); current(ctx); }
      catch (error) { await finish(ctx, ctx.limitReason || ['WORKFLOW_LIMIT','SCHEDULE_MISSED'].includes(error.code) ? 'STOPPED' : error.code === 'CANCELLED' ? 'CANCELLED' : 'FAILED', ctx.limitReason ?? error.message); throw error; }
      if(ctx.trigger){ctx.status='WAITING';ctx.trigger.state='WAITING';ctx.trigger.armedAt=now();if(clock()>=Date.parse(ctx.trigger.scheduledAt??ctx.graph.runPolicy.schedule.at)){ctx.trigger.state='MISSED';ctx.trigger.missedAt=now();await finish(ctx,'STOPPED','启动已错过触发时间，按SKIP跳过');return getStatus();}try{await onUpdate(getStatus());current(ctx);if(clock()>=Date.parse(ctx.trigger.scheduledAt??ctx.graph.runPolicy.schedule.at)){ctx.trigger.state='MISSED';ctx.trigger.missedAt=now();await finish(ctx,'STOPPED','等待状态落盘前已错过触发时间，按SKIP跳过');return getStatus();}}catch(error){await finish(ctx,'FAILED',error.message);return getStatus();}task=waitScheduledStart(ctx);return getStatus();}
      if(ctx.eventTrigger){ctx.status='WAITING';ctx.eventTrigger.state='WAITING';ctx.eventTrigger.armedAt=now();try{await onUpdate(getStatus());current(ctx);}catch(error){await finish(ctx,'FAILED',error.message);return getStatus();}task=waitEventStart(ctx);return getStatus();}
      task = advance(ctx); return await task;
    } finally { starting = false; }
  }
  function listenForEvent(ctx){
    ctx.eventReady=new Promise(resolve=>ctx.wakeEvent=resolve);const changed=()=>{if(ctx.queuedEvent||ctx.eventError)return;try{current(ctx);const event=workflowVipEvent(ctx.session,ctx.eventTrigger.baseline,ctx.graph.runPolicy.eventTrigger);if(event){ctx.queuedEvent={event,observedAt:now()};ctx.wakeEvent();}}catch(error){ctx.eventError=error;ctx.wakeEvent();}};
    const names=['message','drop','error','state','close'];if(typeof ctx.client.on!=='function'||typeof ctx.client.off!=='function')throw fail('事件来源不支持现有连接订阅');for(const name of names)ctx.client.on(name,changed);ctx.eventCleanup=()=>{for(const name of names)ctx.client.off(name,changed);};
  }
  async function waitEventStart(ctx){
    try{await cancelled(ctx,ctx.eventReady);current(ctx);if(ctx.eventError)throw ctx.eventError;if(ctx.authorizationTask)await cancelled(ctx,ctx.authorizationTask);current(ctx);const queued=ctx.queuedEvent;if(!queued||!workflowVipEvent(ctx.session,ctx.eventTrigger.baseline,ctx.graph.runPolicy.eventTrigger,queued.event.cursor))throw fail('业务事件已失去独立可信来源','WORKFLOW_EVENT_UNKNOWN');Object.assign(ctx.eventTrigger,{state:'FIRED',event:queued.event,observedAt:queued.observedAt,firedAt:now()});ctx.status='RUNNING';await onUpdate(getStatus());current(ctx);if(typeof operations.activateWorkflowEvent!=='function')throw fail('事件未接入共享Service');operations.activateWorkflowEvent(ctx.session,ctx.runId,queued.event);ctx.eventCleanup?.();return await advance(ctx);}
    catch(error){if(ctx.authorizationTask){operations.closeWorkflowBudget?.(ctx.accountId,ctx.runId,ctx.limitReason?'STOPPED':'CANCELLED');await ctx.authorizationTask;}await finish(ctx,ctx.limitReason||error.code==='WORKFLOW_LIMIT'?'STOPPED':error.code==='CANCELLED'?'CANCELLED':error.code==='WORKFLOW_EVENT_UNKNOWN'?'UNKNOWN':'FAILED',ctx.limitReason??error.message);return getStatus();}
  }
  async function waitScheduledStart(ctx){
    try{const at=Date.parse(ctx.trigger.scheduledAt??ctx.graph.runPolicy.schedule.at);while(clock()<at){current(ctx);let timer;try{await cancelled(ctx,new Promise(resolve=>{timer=setTimeout(resolve,Math.min(at-clock(),WORKFLOW_LIMITS.waitMs));}));}finally{clearTimeout(timer);}}current(ctx);if(ctx.authorizationTask)await cancelled(ctx,ctx.authorizationTask);current(ctx);ctx.trigger.state='FIRED';ctx.trigger.firedAt=now();ctx.status='RUNNING';await onUpdate(getStatus());current(ctx);return await advance(ctx);}
    catch(error){if(ctx.authorizationTask){operations.closeWorkflowBudget?.(ctx.accountId,ctx.runId,ctx.limitReason?'STOPPED':'CANCELLED');await ctx.authorizationTask;}await finish(ctx,ctx.limitReason||error.code==='WORKFLOW_LIMIT'?'STOPPED':error.code==='CANCELLED'?'CANCELLED':'FAILED',ctx.limitReason??error.message);return getStatus();}
  }
  function stop() { if (!context || !ACTIVE.has(context.status)) return getStatus(); const ctx = context; ctx.cancel.abort(); if (ctx.status === 'AWAITING_AUTHORIZATION') task = finish(ctx, 'CANCELLED', '用户已停止工作流；不会消费或继承计划授权').then(getStatus); return getStatus(); }
  async function confirmBatch(ctx) {
      const result = await cancelled(ctx, Promise.resolve().then(() => operations.history(ctx.accountId)));
      current(ctx);
      const runs = Array.isArray(result?.runs) ? result.runs : [];
      const matches = runs.filter(run => run.accountId === ctx.accountId && (run.planSummary?.batchId === ctx.waitingPlan.batchId || run.authorizationSummary?.batchId === ctx.waitingPlan.batchId));
      if (!matches.length || matches.length === 1 && !matches[0].finishedAt && ['EXECUTING','VERIFY','RESOURCE_PREFLIGHT'].includes(matches[0].finalStatus)) {
        ctx.reason = '当前批次尚无已完成执行历史；继续等待用户授权与执行';
        await onUpdate(getStatus());
        return false;
      }
      const refused = matches.length === 1 ? matches[0] : null;
      if (refused?.finalStatus === 'REJECTED' && text(refused.finishedAt) &&
          refused.planSummary?.batchId === ctx.waitingPlan.batchId && refused.planSummary?.planHash === ctx.waitingPlan.planHash &&
          Array.isArray(refused.actions) && refused.actions.length === 1 &&
          refused.actions[0].actionId === ctx.waitingPlan.actions[0].actionId && refused.actions[0].result === 'REJECTED' &&
          refused.actions[0].requestStatus === 'REJECTED' && refused.actions[0].unresolvedWrite === false) {
        ctx.lastRun = copy(refused);
        await finish(ctx, 'FAILED', '当前批次确定拒绝；共享拒绝记忆保留，停止后续执行');
        return false;
      }
      if (matches.length !== 1 || !confirmedRun(matches[0], ctx.waitingPlan, ctx.accountId)) {
        await finish(ctx, 'UNKNOWN', '当前同批次执行未同时满足 SUCCESS 与 CONFIRMED，停止工作流');
        return false;
      }
      ctx.lastRun = copy(matches[0]); ctx.waitingPlan = null; ctx.status = 'RUNNING'; ctx.reason = null;
      ctx.nodeId = next(ctx); await onUpdate(getStatus()); current(ctx); return true;
  }
function executeAuthorizedBatch(ctx){
 return (async()=>{current(ctx);ctx.status='RUNNING';ctx.reason='按本次有限运行授权生成原单次许可并核验';await onUpdate(getStatus());current(ctx);
 const plan=ctx.waitingPlan,permit=operations.authorizeWorkflowPlan(ctx.session,{runId:ctx.runId,nodeId:ctx.nodeId,batchId:plan.batchId,planHash:plan.planHash,...(ctx.graph.runPolicy?.maxRounds!==undefined?{round:ctx.round}:{})});current(ctx);operations.execute(ctx.session,permit);await cancelled(ctx,operations.settle(ctx.accountId));current(ctx);
 if(await confirmBatch(ctx))return true;if(ctx.status==='AWAITING_AUTHORIZATION'||ctx.status==='RUNNING')await finish(ctx,'UNKNOWN','执行已结束但缺少当前批次完整确认历史；有限运行停止且不重放');return false;})();
}
function authorizeRun(payload){
 const ctx=context,scheduled=ctx?.status==='WAITING'&&(ctx.trigger?.state==='WAITING'||ctx.eventTrigger?.state==='WAITING');
 if(starting||resuming||authorizing||finishing||!ctx||!(scheduled||ctx.status==='AWAITING_AUTHORIZATION'&&ctx.waitingPlan)||ctx.runAuthorization||!ctx.authorizationOffer||typeof operations.authorizeWorkflow!=='function')throw fail('当前没有可明确授权的有限运行范围','AUTHORIZATION_REQUIRED');
 exact(payload,['offer','batchId','planHash','confirm'],'有限运行确认');current(ctx);
 const invalidScope=payload.confirm!==true||!plain(payload.offer)||workflowJsonDigest(payload.offer)!==workflowJsonDigest(ctx.authorizationOffer),invalidContext=scheduled?(payload.batchId!==null||payload.planHash!==null||ctx.trigger&&clock()>=Date.parse(ctx.trigger.scheduledAt??ctx.graph.runPolicy.schedule.at)):(payload.batchId!==ctx.waitingPlan.batchId||payload.planHash!==ctx.waitingPlan.planHash);if(invalidScope||invalidContext)throw fail('授权范围与当前暂停计划或时间触发不一致','AUTHORIZATION_REQUIRED');
 authorizing=true;if(!scheduled)ctx.status='RUNNING';
 const work=(async()=>{try{current(ctx);await operations.authorizeWorkflow(ctx.session,payload,async audit=>{current(ctx);ctx.runAuthorization=copy(audit);await onUpdate(getStatus());current(ctx);});current(ctx);authorizing=false;if(scheduled)return getStatus();if(await executeAuthorizedBatch(ctx))return await advance(ctx);return getStatus();}
 catch(error){if(scheduled)ctx.cancel.abort();await finish(ctx,ctx.limitReason||error.code==='WORKFLOW_LIMIT'?'STOPPED':error.code==='CANCELLED'?'CANCELLED':error.code==='WORKFLOW_EVENT_UNKNOWN'?'UNKNOWN':'FAILED',ctx.limitReason??error.message);return getStatus();}finally{authorizing=false;}})();
 if(scheduled)ctx.authorizationTask=work;else task=work;return work;
}
  async function resume(...args) {
    if (args.length) throw fail('resume 不接受外部运行结果或授权');
    if (resuming) throw fail('工作流正在核对当前批次结果', 'WORKFLOW_BUSY');
    const ctx = context;
    if (!ctx || ctx.status !== 'AWAITING_AUTHORIZATION' || !ctx.waitingPlan) throw fail('工作流当前没有等待用户执行的计划');
    resuming = true;
    try {
      current(ctx);
      if(await confirmBatch(ctx)){task=advance(ctx);return await task;}return getStatus();
    } catch (error) {
      await finish(ctx, ctx.limitReason || error.code === 'WORKFLOW_LIMIT' ? 'STOPPED' : error.code === 'CANCELLED' ? 'CANCELLED' : 'UNKNOWN', ctx.limitReason ?? (error.code === 'WORKFLOW_LIMIT' ? error.message : '无法确认或持久化当前批次执行历史，工作流已停止'));
      return getStatus();
    } finally { resuming = false; }
  }
  function getLiveRunId() {
    if (!context?.claimed) return null;
    try { current(context); return context.runId; } catch { return null; }
  }
  return { start, getStatus, getLiveRunId, stop, resume, authorizeRun, settle: async () => { if (task) await task; return getStatus(); } };
}

const historyId = value => typeof value === 'string' && value.length > 0 && value.length <= 512 && value.trim() === value;
const ids = (rows, pick) => {
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) return null;
  const values = rows.map(pick);
  return values.every(historyId) && new Set(values).size === values.length ? values : null;
};
const TRACE_EVIDENCE_FIELDS = ['module','actionId','batchId','planHash'];
function traceEvidence(row) {
  const evidence={};
  for(const key of TRACE_EVIDENCE_FIELDS)if(row[key]!==undefined){
    if(!(key==='actionId' ? typeof row[key]==='string'&&row[key].length>0&&row[key].length<=1000&&row[key].trim()===row[key] : historyId(row[key])))throw fail('工作流trace身份无效');
    evidence[key]=row[key];
  }
  if(row.blockedReasons!==undefined){
    if(!Array.isArray(row.blockedReasons)||row.blockedReasons.length>50||row.blockedReasons.some(reason=>!historyId(reason)))throw fail('工作流阻塞原因无效');
    evidence.blockedReasons=[...row.blockedReasons];
  }
  if(row.round!==undefined){if(!Number.isSafeInteger(row.round)||row.round<1||row.round>WORKFLOW_LIMITS.rounds)throw fail('历史轮次无效');evidence.round=row.round;}
  if(row.durationMs!==undefined){
    if(!(row.type==='WAIT'&&['WAIT_STARTED','WAITED'].includes(row.result)||row.type==='STOP'&&['ROUND_WAIT_STARTED','ROUND_WAITED'].includes(row.result))||!Number.isSafeInteger(row.durationMs)||row.durationMs<0||row.durationMs>WORKFLOW_LIMITS.waitMs)throw fail('等待历史时长无效');
    evidence.durationMs=row.durationMs;
  }
  return evidence;
}
const sameIds = (left, right) => left && right && left.length === right.length && left.every((id, index) => id === right[index]);

function workflowRunAuthorizationLink(workflowRun,run){
 const audit=workflowRun.runAuthorization,marker=run.authorizationSummary?.workflowRunAuthorization;
 const missing=reason=>({status:'MISSING',reason}),conflict=reason=>({status:'CONFLICT',reason});
 if(!audit)return marker===undefined?{status:'BATCH_ONLY'}:missing('PARENT_SCOPE_UNAVAILABLE');
 if(marker===undefined)return missing('CHILD_SCOPE_UNAVAILABLE');
 const scope=audit.scope,expected={runId:workflowRun.runId,graphHash:scope.graphHash,approvedAt:audit.approvedAt};
 if(!plain(marker)||workflowJsonDigest(marker)!==workflowJsonDigest(expected))return conflict('RUN_SCOPE_MISMATCH');
 if(!plain(run.executionContext))return missing('CHILD_IDENTITY_UNAVAILABLE');
 if(workflowJsonDigest(run.executionContext)!==workflowJsonDigest(scope.executionContext))return conflict('CHILD_IDENTITY_MISMATCH');
 const childApproved=Date.parse(run.authorizationSummary.approvedAt),started=Date.parse(run.startedAt),approved=Date.parse(audit.approvedAt),expires=Date.parse(scope.expiresAt);
 if(![childApproved,started,approved,expires].every(Number.isFinite))return missing('AUTHORIZATION_TIME_UNAVAILABLE');
 if(childApproved<approved||childApproved>=expires||started<childApproved||started>=expires)return conflict('AUTHORIZATION_TIME_OUTSIDE_SCOPE');
 if(scope.graph.runPolicy.maxRounds!==undefined&&(!Number.isSafeInteger(run.workflowRound)||run.workflowRound<1||run.workflowRound>scope.graph.runPolicy.maxRounds||run.planSummary?.workflowRound!==run.workflowRound))return conflict('ROUND_SCOPE_MISMATCH');
 if(scope.graph.runPolicy.eventTrigger){const trigger=workflowRun.eventTrigger;if(trigger?.state!=='FIRED'||workflowJsonDigest(trigger.baseline)!==workflowJsonDigest(scope.eventCursor))return missing('EVENT_TRIGGER_EVIDENCE_UNAVAILABLE');if(childApproved<Date.parse(trigger.firedAt)||started<Date.parse(trigger.firedAt))return conflict('EVENT_TRIGGER_TIME_OUTSIDE_SCOPE');}
 if(scope.graph.runPolicy.schedule){const trigger=workflowRun.trigger,at=Date.parse(scope.scheduledAt??scope.graph.runPolicy.schedule.at);if(trigger?.state!=='FIRED')return missing('TRIGGER_EVIDENCE_UNAVAILABLE');if(started<at||childApproved<at||childApproved<Date.parse(trigger.firedAt))return conflict('TRIGGER_TIME_OUTSIDE_SCOPE');}
 const plan=run.planSummary,node=scope.graph.nodes.find(row=>row.id===run.workflowNodeId&&row.type==='ACTION'),selection=node?.selection;
 if(!node||node.module!==run.module||plan.mode!=='Manual'||plan.actions.length!==1||workflowJsonDigest(plan.parameters??{})!==workflowJsonDigest(node.parameters??{})||selection?.unique!==true&&plan.actions[0].actionId!==(typeof selection==='string'?selection:selection?.actionId))return conflict('GRAPH_STRATEGY_MISMATCH');
 if(!plan.runBudgetIdentity||plan.moduleConfig===undefined)return missing('CHILD_CONTRACT_UNAVAILABLE');
 const parentScope={accountId:scope.accountId,runId:scope.runId,generation:scope.executionContext.generation,connectionId:scope.executionContext.connectionId};
 if(workflowJsonDigest(plan.runBudgetIdentity)!==workflowJsonDigest({scope:parentScope,limits:scope.graph.budget})||workflowJsonDigest(plan.moduleConfig)!==workflowJsonDigest(scope.dependencies.moduleConfigs[run.module]))return conflict('CHILD_CONTRACT_MISMATCH');
 return{status:'MATCHED',...expected};
}

// Audit the records already present in the two stores. The current graph can
// have been edited since the run, so only its persisted ACTION trace is used.
export function projectWorkflowExecutionHistory(accountId, workflowRun, operationRuns) {
  if (workflowRun?.accountId !== accountId || !historyId(workflowRun?.runId) || !text(workflowRun?.workflowId) ||
      !Array.isArray(operationRuns)) throw fail('缺少精确的账号与工作流历史');
  const workflowRunId = workflowRun.runId, workflowDefinitionId = workflowRun.workflowId;
  const nodes = new Map(), duplicateNodes = new Set(),nodeKey=(id,round)=>JSON.stringify([round??null,id]);
  const trace = Array.isArray(workflowRun.trace) && workflowRun.trace.length <= WORKFLOW_LIMITS.steps ? workflowRun.trace : [];
  for (const row of trace) {
    if (row?.type !== 'ACTION' || !text(row.nodeId)) continue;
    const key=nodeKey(row.nodeId,row.round);if (nodes.has(key)) duplicateNodes.add(key);
    else nodes.set(key, { nodeId: row.nodeId, traceResult: row.result, timestamp: row.timestamp ?? null, ...traceEvidence(row), batches: [] });
  }
  for (const nodeId of duplicateNodes) nodes.delete(nodeId);

  const accountRuns = operationRuns.filter(run => run?.accountId === accountId);
  const runCounts = new Map(), batchCounts = new Map();
  const count = (counts, id) => { if (historyId(id)) counts.set(id, (counts.get(id) ?? 0) + 1); };
  for (const run of accountRuns) {
    count(runCounts, run.runId);
    for (const batchId of new Set([run.planSummary?.batchId, run.authorizationSummary?.batchId])) count(batchCounts, batchId);
  }
  let unlinkedOperationCount = 0;
  for (const run of accountRuns) {
    const plan = run.planSummary, authorization = run.authorizationSummary;
    if (![run.workflowId, run.parentRunId, plan?.parentRunId].includes(workflowRunId)) continue;
    const node = nodes.get(nodeKey(run.workflowNodeId,run.workflowRound)), batchId = plan?.batchId;
    const actionIds = ids(run.actions, row => row?.actionId);
    if (!node || node.traceResult?.startsWith('BLOCKED_') ||
        node.module !== undefined && node.module !== run.module ||
        node.batchId !== undefined && node.batchId !== batchId ||
        node.planHash !== undefined && node.planHash !== plan?.planHash ||
        node.actionId !== undefined && (actionIds?.length !== 1 || actionIds[0] !== node.actionId) ||
        run.workflowId !== workflowRunId || run.parentRunId !== workflowRunId || plan?.parentRunId !== workflowRunId ||
        run.workflowDefinitionId !== workflowDefinitionId || plan?.workflowDefinitionId !== workflowDefinitionId ||
        plan?.workflowNodeId !== node.nodeId || plan?.workflowRound !== node.round || plan?.accountId !== accountId ||
        runCounts.get(run.runId) !== 1 || batchCounts.get(batchId) !== 1 || authorization?.batchId !== batchId ||
        authorization?.planHash !== undefined && authorization.planHash !== plan?.planHash ||
        !sameIds(actionIds, ids(plan?.actions, row => row?.actionId)) || !sameIds(actionIds, ids(authorization?.actionIds, id => id))) {
      unlinkedOperationCount++;
      continue;
    }
    node.batches.push({ batchId, operationRunId: run.runId, module: run.module ?? null, finalStatus: run.finalStatus, runAuthorizationLink:workflowRunAuthorizationLink(workflowRun,run),
      startedAt: run.startedAt ?? null, finishedAt: run.finishedAt ?? null, recovered: run.recovered === true,
      actions: run.actions.map(row => ({ actionId: row.actionId, capabilityId: row.capabilityId ?? null,
        actionType: row.actionType ?? null, result: row.result, requestStatus: row.requestStatus,
        verificationStatus: row.verification?.status ?? null, needsReconciliation: actionNeedsReconciliation(run, row),
        reconciliationStatus: Array.isArray(row.reconciliations) ? row.reconciliations.at(-1)?.status ?? null : null })) });
  }
  return { accountId, workflowRunId, workflowDefinitionId, ...(workflowRun.runAuthorization?{runAuthorization:copy(workflowRun.runAuthorization)}:{}),...(workflowRun.trigger?{trigger:copy(workflowRun.trigger)}:{}),...(workflowRun.eventTrigger?{eventTrigger:copy(workflowRun.eventTrigger)}:{}), ...(workflowRun.runPolicy?{runPolicy:validateRunPolicy(workflowRun.runPolicy),expiresAt:workflowRun.expiresAt,actionPlans:workflowRun.actionPlans,...(workflowRun.runPolicy.maxRounds!==undefined?{round:workflowRun.round,completedRounds:workflowRun.completedRounds}:{})}:{}), ...(workflowRun.preparation !== undefined ? {preparation:validatePreparation(workflowRun.preparation)} : {}), status: workflowRun.status,
    startedAt: workflowRun.startedAt ?? null, finishedAt: workflowRun.finishedAt ?? null, recovered: workflowRun.recovered === true,
    readOnly: true, resumable: false, coverage: 'PERSISTED_WORKFLOW_OPERATION_LINKS_ONLY', unlinkedOperationCount,
    waits: trace.filter(row=>row?.type==='WAIT'||row?.type==='STOP'&&['ROUND_WAIT_STARTED','ROUND_WAITED'].includes(row.result)).map(row=>({nodeId:row.nodeId,result:row.result,timestamp:row.timestamp??null,...traceEvidence(row)})),
    nodes: [...nodes.values()] };
}

export function createWorkflowStore({ file, modules, secrets = () => [], assertWriter = () => {}, fileSystem = fs } = {}) {
  if (!text(file) || !path.isAbsolute(file)) throw fail('工作流存储必须使用显式绝对路径');
  const unavailable = () => fail('工作流存储损坏或不可读；原证据已保留', 'WORKFLOW_STORE_UNAVAILABLE');
  const maxBytes = 8 * 1024 * 1024;
  let knownStore = false;
  const statuses = new Set(['IDLE','STARTING','RUNNING','WAITING','AWAITING_AUTHORIZATION','COMPLETED','STOPPED','UNKNOWN','FAILED','CANCELLED','RECOVERED_STOPPED']);
  function validRun(run, accountId) {
    if (!plain(run) || run.accountId !== accountId || !text(run.runId) || !text(run.workflowId) || !statuses.has(run.status)
        || run.steps !== undefined && (!Number.isSafeInteger(run.steps) || run.steps < 0 || run.steps > WORKFLOW_LIMITS.steps)) return false;
    try { validateEventTriggerHistory(run);validateTriggerHistory(run);validateRoundHistory(run);validateAuthorizationAudit(run,modules);if (run.preparation !== undefined) validatePreparation(run.preparation);if(run.runPolicy!==undefined){validateRunPolicy(run.runPolicy);if(!text(run.expiresAt)||!Number.isFinite(Date.parse(run.expiresAt))||!Number.isSafeInteger(run.actionPlans)||run.actionPlans<0||run.actionPlans>run.runPolicy.maxActions)throw fail('运行边界历史无效');} } catch { return false; }
    if (run.trace === undefined) return true;
    if (!Array.isArray(run.trace) || run.trace.length > WORKFLOW_LIMITS.steps) return false;
    try { return run.trace.every(row => plain(row) && text(row.nodeId) && TYPES.has(row.type) && text(row.result)
      && (row.timestamp === undefined || text(row.timestamp)) && Boolean(traceEvidence(row))); } catch { return false; }
  }
  function read() {
    try {
      let stat;
      try { stat = fileSystem.lstatSync(file); } catch (error) {
        if (error.code === 'ENOENT' && !knownStore) return { version: 1, accounts: Object.create(null) };
        throw unavailable();
      }
      knownStore = true;
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) throw unavailable();
      const source = fileSystem.readFileSync(file, 'utf8');
      if (Buffer.byteLength(source, 'utf8') > maxBytes) throw unavailable();
      const raw = JSON.parse(source);
      if (!plain(raw) || raw.version !== 1 || !plain(raw.accounts)) throw unavailable();
      for (const [accountId, entry] of Object.entries(raw.accounts)) {
        if (!text(accountId) || !plain(entry) || !Array.isArray(entry.workflows) || !Array.isArray(entry.history) || entry.history.some(run => !validRun(run, accountId))) throw unavailable();
        entry.workflows.forEach(graph => validateWorkflow(graph, { modules }));
        if (new Set(entry.workflows.map(graph => graph.id)).size !== entry.workflows.length || new Set(entry.history.map(run => run.runId)).size !== entry.history.length) throw unavailable();
      }
      return raw;
    } catch { throw unavailable(); }
  }
  function write(raw) {
    assertWriter();
    const temporary = file + '.' + process.pid + '.' + randomUUID() + '.tmp';
    try {
      const serialized = JSON.stringify(raw, null, 2) + '\n';
      if (Buffer.byteLength(serialized, 'utf8') > maxBytes) throw unavailable();
      fileSystem.mkdirSync(path.dirname(file), { recursive: true });
      const fd = fileSystem.openSync(temporary, 'wx', 0o600);
      try { fileSystem.writeFileSync(fd, serialized, 'utf8'); fileSystem.fsyncSync(fd); } finally { fileSystem.closeSync(fd); }
      assertWriter();
      // Recheck the original path after flushing: a lost store must never be
      // silently replaced with a new history while its owner is still running.
      read();
      fileSystem.renameSync(temporary, file);
      knownStore = true;
    } catch (error) {
      if (error?.code?.startsWith('WRITER_')) throw error;
      throw fail('工作流原子保存失败，原历史未覆盖', 'WORKFLOW_STORE_UNAVAILABLE');
    } finally { try { fileSystem.unlinkSync(temporary); } catch {} }
  }
  function entry(raw, accountId) { if (!text(accountId)) throw fail('缺少精确账号 ID'); if (!Object.hasOwn(raw.accounts, accountId)) Object.defineProperty(raw.accounts, accountId, { value: { workflows: [], history: [] }, enumerable: true, configurable: true, writable: true }); return raw.accounts[accountId]; }
  function list(accountId) { const raw = read(); return copy(Object.hasOwn(raw.accounts, accountId) ? raw.accounts[accountId].workflows : []); }
  function save(accountId, graph) { const validated = validateWorkflow(graph, { modules }).workflow, raw = read(), account = entry(raw, accountId); account.workflows = [validated, ...account.workflows.filter(existing => existing.id !== validated.id)]; write(raw); return copy(validated); }
  function record(accountId, run) {
    const allowed = ['runId','workflowId','status','currentNode','steps','startedAt','finishedAt','reason','trace','runBudget','preparation','runPolicy','expiresAt','actionPlans','runAuthorization','round','completedRounds','trigger','eventTrigger'];
    if (!plain(run) || !text(run.runId) || !text(run.workflowId) || !['IDLE','STARTING','RUNNING','WAITING','AWAITING_AUTHORIZATION','COMPLETED','STOPPED','UNKNOWN','FAILED','CANCELLED','RECOVERED_STOPPED'].includes(run.status) || run.accountId !== undefined && run.accountId !== accountId || run.steps !== undefined && (!Number.isSafeInteger(run.steps) || run.steps < 0 || run.steps > WORKFLOW_LIMITS.steps)) throw fail('工作流历史身份无效');
    validateEventTriggerHistory(run);validateTriggerHistory(run);validateRoundHistory(run);validateAuthorizationAudit({...run,accountId},modules);
    if (run.preparation !== undefined) validatePreparation(run.preparation);if(run.runPolicy!==undefined){validateRunPolicy(run.runPolicy);if(!text(run.expiresAt)||!Number.isFinite(Date.parse(run.expiresAt))||!Number.isSafeInteger(run.actionPlans)||run.actionPlans<0||run.actionPlans>run.runPolicy.maxActions)throw fail('运行边界历史无效');}
    const safe = redact(Object.fromEntries(allowed.filter(key => run[key] !== undefined).map(key => [key, copy(run[key])])), secrets());
    safe.accountId = accountId;
    if (safe.trace !== undefined) { if (!Array.isArray(safe.trace) || safe.trace.length > WORKFLOW_LIMITS.steps) throw fail('工作流历史过大'); if (safe.trace.some(row => !plain(row) || !text(row.nodeId) || !TYPES.has(row.type) || !text(row.result) || row.timestamp !== undefined && !text(row.timestamp))) throw fail('工作流trace必须是有限状态记录'); safe.trace = safe.trace.map(row => ({...Object.fromEntries(['nodeId','type','result','timestamp'].filter(key => row?.[key] !== undefined).map(key => [key, row[key]])),...traceEvidence(row)})); }
    const raw = read(), account = entry(raw, accountId);
    if(safe.trigger?.scheduledAt&&(safe.status==='STARTING'||safe.trigger.state==='FIRED')&&account.history.some(existing=>existing.runId!==safe.runId&&existing.workflowId===safe.workflowId&&existing.trigger?.state==='FIRED'&&existing.trigger.scheduledAt===safe.trigger.scheduledAt&&existing.trigger.playerId===safe.trigger.playerId&&existing.trigger.worldId===safe.trigger.worldId))throw fail('本角色世界该图的具体日历时刻已触发；不因回拨或重启重放','WORKFLOW_TRIGGER_CONSUMED');
    if(safe.eventTrigger?.state==='FIRED'&&account.history.some(existing=>existing.runId!==safe.runId&&existing.workflowId===safe.workflowId&&existing.eventTrigger?.state==='FIRED'&&existing.eventTrigger.event.eventId===safe.eventTrigger.event.eventId&&existing.eventTrigger.baseline.playerId===safe.eventTrigger.baseline.playerId&&existing.eventTrigger.baseline.worldId===safe.eventTrigger.baseline.worldId))throw fail('该角色世界的同图业务事件已消费','WORKFLOW_TRIGGER_CONSUMED');
    account.history = [safe, ...account.history.filter(existing => existing.runId !== safe.runId)]; write(raw); return copy(safe);
  }
  function history(accountId, { liveRunId = null, runId = null } = {}) {
    const raw = read();
    // An active snapshot is only live if the current server-owned runner still
    // holds that exact run. Neither the saved snapshot nor the caller can resume it.
    const entries = Object.hasOwn(raw.accounts, accountId) ? raw.accounts[accountId].history : [];
    return copy(runId === null ? entries : entries.filter(run => run.runId === runId)).map(run =>
      ACTIVE.has(run.status) && run.runId !== liveRunId
        ? { ...run, status: 'RECOVERED_STOPPED', recovered: true, resumable: false, reason: '恢复历史仅供查看；必须重新显式启动与逐批授权' }
        : { ...run, resumable: false });
  }
  function remove(accountId, workflowId) { const raw = read(), account = entry(raw, accountId); account.workflows = account.workflows.filter(graph => graph.id !== workflowId); write(raw); return list(accountId); }
  return { list, load: list, save, remove, record, history };
}
export function exampleWorkflows(registry) {
  const modules = registryOf(registry), examples = [];
  for (const [id, module] of modules) {
    if (!module || module.id !== id || !['survey','view','plan','verify'].every(key => typeof module[key] === 'function')) continue;
    examples.push({ id: 'example-' + id, name: id + '：只读采集后停止', workflow: { version: 1, id: 'example-' + id, name: id + '：只读采集后停止', nodes: [{ id: 'start', type: 'START' }, { id: 'survey', type: 'SURVEY', module: id }, { id: 'stop', type: 'STOP' }], edges: [{ from: 'start', to: 'survey' }, { from: 'survey', to: 'stop' }] }, scope: '仅使用已注册 survey；写节点必须填入真实候选选择并单次授权' });
  }
  if (['formation','stage'].every(id => modules.get(id)?.id === id && ['survey','view','plan','verify'].every(key => typeof modules.get(id)[key] === 'function'))) examples.push({ id: 'formation-stage-template', name: '主线阵容→验证→已注册主线启动', requiresSelection: true, workflow: { version: 1, id: 'formation-stage-template', name: '主线阵容→验证→已注册主线启动', nodes: [{ id: 'start', type: 'START' }, { id: 'formation', type: 'ACTION', module: 'formation', selection: 'REPLACE_WITH_EXACT_FORMATION_CANDIDATE' }, { id: 'verify', type: 'VERIFY', module: 'formation' }, { id: 'stage', type: 'ACTION', module: 'stage', selection: 'REPLACE_WITH_EXACT_REGISTERED_STAGE_CANDIDATE' }, { id: 'stop', type: 'STOP' }], edges: [{ from: 'start', to: 'formation' }, { from: 'formation', to: 'verify' }, { from: 'verify', to: 'stage' }, { from: 'stage', to: 'stop' }] }, scope: '仅在 formation/stage 都注册时提供；不推断其他模式阵营，每个 ACTION 独立单次授权' });
  for (const template of [
    { module: 'fleet', id: 'fleet-repair-dispatch-template', name: '舰队维修→验证→移动→验证', selections: ['REPLACE_WITH_EXACT_FLEET_REPAIR_CANDIDATE','REPLACE_WITH_EXACT_FLEET_MOVE_CANDIDATE'] },
    { module: 'alliance', id: 'alliance-help-template', name: '联盟帮助→验证', selections: ['REPLACE_WITH_EXACT_ALLIANCE_HELP_CANDIDATE'] },
  ]) {
    const module = modules.get(template.module);
    if (!module || module.id !== template.module || !['survey','view','plan','verify'].every(key => typeof module[key] === 'function')) continue;
    const nodes = [{ id: 'start', type: 'START' }, { id: 'survey', type: 'SURVEY', module: template.module }];
    const edges = [{ from: 'start', to: 'survey' }]; let previous = 'survey';
    template.selections.forEach((selection, index) => {
      const action = 'action-' + index, verify = 'verify-' + index;
      nodes.push({ id: action, type: 'ACTION', module: template.module, selection }, { id: verify, type: 'VERIFY', module: template.module });
      edges.push({ from: previous, to: action }, { from: action, to: verify }); previous = verify;
    });
    nodes.push({ id: 'stop', type: 'STOP' }); edges.push({ from: previous, to: 'stop' });
    examples.push({ id: template.id, name: template.name, requiresSelection: true, workflow: { version: 1, id: template.id, name: template.name, nodes, edges }, scope: '真实候选与精确业务参数必须先编辑；每个ACTION分别授权，缺失能力保持阻断' });
  }
  return examples;
}
