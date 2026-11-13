import {validateExpeditionFormationParameters,surveyExpeditionFormation,viewExpeditionFormation,planExpeditionFormation,verifyExpeditionFormation} from './expedition-formations.mjs';
import { businessRejectionIdentityFromHistory } from './business-functions.mjs';
// Mainline Formation adapter. Shared execution owns authorization, locks and dispatch.
import { createHash } from 'node:crypto';
import { getConfig } from './config.mjs';
import { toSnapshotJson } from './game.mjs';
import { assertExecutionActive, awaitExecution } from './execution.mjs';
import { ResourceLedger, stockFromResponses } from './resource-ledger.mjs';
import { MAINLINE_CHALLENGE, parseStageResult, resolveMainlineChallengeSide } from './stages.mjs';

const own = (v, k) => v !== null && typeof v === 'object' && Object.hasOwn(v, k);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const int32 = v => Number.isInteger(v) && v >= -2147483648 && v <= 2147483647;
const positive = v => int32(v) && v > 0;
const validId = v => typeof v === 'string' && v.length > 0 && v.trim() === v;
const hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const careers = ['坦克', '战士', '法师', '射手'];
const costSource = 'MainLineFormationView.saveFormation/onSwitchFormationType: full SaveFormationRequest for already-unlocked layout; no configured resource cost in this client path; never UnlockFormationPresetRequest';
export const defaultConfig = Object.freeze({ enabled: false, mainlineEnabled: false });
const invalid = message => Object.assign(new Error(message), { code: 'INVALID_PARAMETERS', statusCode: 400 });
function exactInteger(v) {
  if (typeof v === 'number' && !Number.isSafeInteger(v)) return null;
  const copied = toSnapshotJson(v);
  if (!(typeof copied === 'number' && Number.isSafeInteger(copied)) && !(typeof copied === 'string' && /^-?(0|[1-9]\d*)$/.test(copied))) return null;
  try { const n = BigInt(copied); return n >= -(1n << 63n) && n < (1n << 63n) ? n.toString() : null; } catch { return null; }
}
function position(v) { return own(v, 'x') && own(v, 'y') && int32(v.x) && int32(v.y) ? { x: v.x, y: v.y } : null; }
function slots(v) {
  if (!Array.isArray(v)) return null;
  const ids = new Set(), occupied = new Set(), out = [];
  for (const row of v) {
    const pos = position(row?.pos);
    if (!own(row, 'heroId') || !validId(row.heroId) || !pos || ids.has(row.heroId) || occupied.has(pos.x + ':' + pos.y)) return null;
    ids.add(row.heroId); occupied.add(pos.x + ':' + pos.y); out.push({ heroId: row.heroId, pos });
  }
  return out;
}
// Required fields and optional pet presence remain distinct from protobuf defaults.
export function parseFormation(v) {
  if (!own(v, 'presetId') || !positive(v.presetId) || !own(v, 'heroPositions')) return null;
  const heroPositions = slots(v.heroPositions);
  if (!heroPositions) return null;
  const out = { heroPositions, presetId: v.presetId };
  if (own(v, 'petUid')) {
    const uid = exactInteger(v.petUid);
    if (uid === null) return null;
    out.petUid = Number.isSafeInteger(Number(uid)) ? Number(uid) : uid;
  }
  return out;
}
function canonical(v) { const out = parseFormation(v); if (out) out.heroPositions.sort((a, b) => a.heroId.localeCompare(b.heroId)); return out; }
function same(a, b) { const x = canonical(a), y = canonical(b); return x !== null && y !== null && hash(x) === hash(y); }
function samePet(a, b) { return own(a, 'petUid') === own(b, 'petUid') && (!own(a, 'petUid') || exactInteger(a.petUid) === exactInteger(b.petUid)); }
export function validateFormationParameters(v = {}) {
  if(own(v,'mode')&&v.mode==='expedition')return validateExpeditionFormationParameters(v);
  if (!object(v) || Object.keys(v).some(k => !['presetId', 'heroIds', 'heroPositions'].includes(k))) throw invalid('阵容参数只允许 presetId、heroIds 或 heroPositions；宠物 UID 从当前阵容保留');
  if (own(v, 'presetId') && !positive(v.presetId)) throw invalid('presetId 必须为正 int32');
  if (own(v, 'heroIds') && own(v, 'heroPositions')) throw invalid('heroIds 与 heroPositions 不能同时提供');
  const out = own(v, 'presetId') ? { presetId: v.presetId } : {};
  if (own(v, 'heroIds')) {
    if (!Array.isArray(v.heroIds) || !v.heroIds.length || v.heroIds.some(id => !validId(id)) || new Set(v.heroIds).size !== v.heroIds.length) throw invalid('heroIds 需要非空且不重复的英雄 ID');
    out.heroIds = [...v.heroIds];
  }
  if (own(v, 'heroPositions')) {
    if (!Array.isArray(v.heroPositions) || !v.heroPositions.length || v.heroPositions.some(row => !object(row) || Object.keys(row).some(k => !['heroId', 'pos'].includes(k)) || !object(row.pos) || Object.keys(row.pos).some(k => !['x', 'y'].includes(k)))) throw invalid('手动站位结构无效');
    const parsed = slots(v.heroPositions);
    if (!parsed) throw invalid('英雄、站位必须明确且不能重复');
    out.heroPositions = parsed;
  }
  return out;
}
export function catalogFrom(config, player) {
  const rows = name => Array.isArray(config?.tables?.[name]?.data) ? config.tables[name].data : null;
  const positions = rows('FormationTypePositionCfg'), heroRows = rows('HeroCfg'), limits = rows('FormationHeroNumCfg');
  const layouts = new Map(), heroes = new Map(), badLayouts = new Set(), badHeroes = new Set();
  if (positions) for (const row of positions) {
    if (!positive(row?.id)) continue;
    if (!layouts.has(row.id)) layouts.set(row.id, []);
    const pos = Array.isArray(row.position) && row.position.length === 2 ? position({ x: row.position[0], y: row.position[1] }) : null;
    if (!pos || layouts.get(row.id).some(p => p.x === pos.x && p.y === pos.y)) badLayouts.add(row.id);
    else layouts.get(row.id).push(pos);
  }
  // Client uses stable x-descending sort: equal-x rows retain config order.
  for (const layout of layouts.values()) layout.sort((a, b) => b.x - a.x);
  if (heroRows) for (const row of heroRows) {
    if (!validId(row?.id)) continue;
    if (heroes.has(row.id) || !careers.includes(row.career)) badHeroes.add(row.id);
    heroes.set(row.id, row.career);
  }
  const stage = own(player, 'mainlineStage') && positive(player.mainlineStage) ? player.mainlineStage : null;
  let maxHeroes = null;
  if (limits?.length && stage !== null && limits.every(row => positive(row?.heroNum) && int32(row?.mainlineStage) && row.mainlineStage >= 0)) {
    maxHeroes = 0;
    // Exact HeroUtil condition is stage > configured stage, not >=.
    for (const row of limits) if (stage > row.mainlineStage) maxHeroes = row.heroNum;
  }
  return { layouts: [...layouts].map(([id, positions]) => ({ id, positions, reliable: !badLayouts.has(id) })),
    heroes: [...heroes].map(([heroId, career]) => ({ heroId, career, reliable: !badHeroes.has(heroId) })),
    maxHeroes, reliable: positions !== null && heroRows !== null && limits !== null };
}
export function surveyFormation(client,protocol,options={}) {return options.parameters?.mode==='expedition'?surveyExpeditionFormation(client,protocol,options):surveyMainlineFormation(client,protocol,options);}
async function surveyMainlineFormation(client, protocol, { config, player, signal } = {}) {
  assertExecutionActive(client, { signal });
  const errors = [];
  if (!config) { try { config = getConfig(); } catch { errors.push('静态阵型配置不可用'); } }
  const queries = [['GetFormationRequest', { module: 1 }, 'GetFormationResponse'], ['MyFormationPresetRequest', {}, 'MyFormationPresetResponse'], ['AllHeroRequest', {}, 'AllHeroResponse']];
  const observedAt = new Map();
  const results = await Promise.allSettled(queries.map(async ([request, body, response]) => {
    if (!protocol?.[request] || !protocol?.[response]) throw new Error('PROTOCOL_MISSING');
    assertExecutionActive(client, { signal });
    const value = await awaitExecution(client.request(request, body, response, 15000, { signal }), client, { signal });
    observedAt.set(response, Date.now()); return value;
  }));
  assertExecutionActive(client, { signal });
  const values = results.map((r, i) => { if (r.status === 'fulfilled') return r.value; errors.push(queries[i][0] + ' 不可用'); return null; });
  const formation = own(values[0], 'formation') ? parseFormation(values[0].formation) : null;
  const presetIds = own(values[1], 'ids') && Array.isArray(values[1].ids) && values[1].ids.every(positive) ? values[1].ids : null;
  const rawHeroes = own(values[2], 'heroes') && Array.isArray(values[2].heroes) ? values[2].heroes : null;
  const ownedHeroIds = rawHeroes && rawHeroes.every(r => own(r, 'heroId') && validId(r.heroId)) && new Set(rawHeroes.map(r => r.heroId)).size === rawHeroes.length ? rawHeroes.map(r => r.heroId) : null;
  const catalog = catalogFrom(config, player);
  return { module: 'formation', formation, formationSource: { source: 'GetFormationResponse', sourceAt: observedAt.get('GetFormationResponse') ?? null }, ownedHeroIds, unlockedPresetIds: [...new Set([1, ...(presetIds ?? [])])].sort((a, b) => a - b), catalog,
    reliability: { formation: formation !== null, presets: presetIds !== null, heroes: ownedHeroIds !== null, config: catalog.reliable },
    writeProtocolAvailable: Boolean(protocol?.SaveFormationRequest && protocol?.SaveFormationResponse),
    stock: stockFromResponses({ items: [] }, { list: [] }), stockReliable: true, costSource, errors };
}
function candidate(facts, parameters, { moduleConfig = defaultConfig } = {}) {
  const before = parseFormation(facts?.formation), presetId = parameters.presetId ?? before?.presetId ?? null;
  const layout = facts?.catalog?.layouts?.find(r => r.id === presetId);
  const ids = parameters.heroPositions?.map(r => r.heroId) ?? parameters.heroIds ?? before?.heroPositions.map(r => r.heroId) ?? [];
  const heroCfg = new Map((facts?.catalog?.heroes ?? []).map(r => [r.heroId, r]));
  let reason = null, after = null;
  if (moduleConfig?.enabled !== true) reason = 'Formation 模块未启用';
  else if (!before || facts?.reliability?.formation !== true) reason = '当前阵容字段不可靠';
  else if (facts?.writeProtocolAvailable !== true) reason = '缺少 SaveFormation 协议';
  else if (!layout?.reliable || facts?.reliability?.config !== true) reason = '目标阵型配置不可靠';
  else if (presetId !== 1 && (facts?.reliability?.presets !== true || !facts.unlockedPresetIds?.includes(presetId))) reason = '目标阵型未可靠证明已解锁；不会自动解锁';
  else if (facts?.reliability?.heroes !== true || ids.some(id => !facts.ownedHeroIds?.includes(id))) reason = '英雄归属不可靠或包含未拥有英雄';
  else if (ids.some(id => !heroCfg.get(id)?.reliable)) reason = '英雄职业配置缺失或不明确';
  else if (!positive(facts?.catalog?.maxHeroes)) reason = '缺少可靠主线进度或上阵人数配置';
  else if (!ids.length || ids.length > facts.catalog.maxHeroes || ids.length > layout.positions.length) reason = '上阵人数超限或为空';
  else {
    let heroPositions;
    if (parameters.heroPositions) heroPositions = slots(parameters.heroPositions);
    else {
      const ordered = [...ids].sort((a, b) => careers.indexOf(heroCfg.get(a).career) - careers.indexOf(heroCfg.get(b).career));
      heroPositions = ordered.map((heroId, i) => ({ heroId, pos: { ...layout.positions[i] } }));
    }
    if (!heroPositions || heroPositions.some(r => !layout.positions.some(p => p.x === r.pos.x && p.y === r.pos.y))) reason = '目标站位不属于该阵型或存在重复';
    else { after = { heroPositions, presetId, ...(own(before, 'petUid') ? { petUid: before.petUid } : {}) }; if (same(before, after) && !(own(parameters, 'presetId') && own(parameters, 'heroPositions'))) reason = '阵容没有变化；需要明确完整站位后重新应用'; }
  }
  const beforeState = canonical(before), expectedState = canonical(after);
  const identity = beforeState ? hash({ formation: beforeState, targetLayout: layout, maxHeroes: facts?.catalog?.maxHeroes,
    heroes: ids.map(id => ({ id, owned: facts?.ownedHeroIds?.includes(id), career: heroCfg.get(id) })), unlocked: presetId === 1 || (facts?.reliability?.presets === true && facts.unlockedPresetIds?.includes(presetId)) }) : null;
  const actionId = 'formation:SAVE:' + hash({ identity, expectedState });
  return { module: 'formation', actionId, actionType: 'SAVE', target: { module: 1, presetId }, costs: [], costSource,
    beforeState, identity, expectedState, parameters, executable: reason === null, blockedReason: reason,
    restoreParameters: before ? { presetId: before.presetId, heroPositions: before.heroPositions } : null,
    ...(reason === null ? { action: { request: 'SaveFormationRequest', response: 'SaveFormationResponse', body: { module: 1, formation: after } } } : {}) };
}
export function viewFormation(facts,options={}) {return facts?.mode==='expedition'?viewExpeditionFormation(facts,options):viewMainlineFormation(facts,options);}
function viewMainlineFormation(facts, { parameters = {}, moduleConfig = defaultConfig } = {}) {
  parameters = validateFormationParameters(parameters);
  const choices = Object.keys(parameters).length ? [parameters] : (facts?.catalog?.layouts ?? []).map(r => ({ presetId: r.id }));
  return { module: 'formation', formation: parseFormation(facts?.formation), unlockedPresetIds: facts?.unlockedPresetIds ?? [], maxHeroes: facts?.catalog?.maxHeroes ?? null,
    heroes: facts?.catalog?.heroes ?? [], layouts: facts?.catalog?.layouts ?? [], templatesAreNotSavedTeams: true, reliability: facts?.reliability ?? {},
    candidates: choices.map(choice => candidate(facts, choice, { moduleConfig })), notes: [...(facts?.errors ?? [])] };
}
export function planFormation(facts,options={}) {return facts?.mode==='expedition'?planExpeditionFormation(facts,options):planMainlineFormation(facts,options);}
function planMainlineFormation(facts, { parameters = {}, moduleConfig = defaultConfig, selections, ledger = new ResourceLedger(facts?.stockReliable === true ? facts.stock : null) } = {}) {
  parameters = validateFormationParameters(parameters);
  if (selections !== undefined && (!Array.isArray(selections) || selections.some(id => typeof id !== 'string'))) throw invalid('selections 必须为 actionId 数组');
  if (!Object.keys(parameters).length) return { module: 'formation', actions: [], notes: ['需要明确选择阵型或英雄站位'] };
  const row = candidate(facts, parameters, { moduleConfig });
  const selected = selections === undefined || selections.includes(row.actionId);
  if (row.executable && selected && ledger.reserve(row.costs)) return { module: 'formation', actions: [row], notes: [] };
  return { module: 'formation', actions: [], notes: [row.blockedReason ?? (selected ? '共享资源预算不可用' : '动作未选择')] };
}
export function verifyFormation(operation,beforeFacts,afterFacts,response) {return operation?.actionType==='SAVE_EXPEDITION'?verifyExpeditionFormation(operation,beforeFacts,afterFacts,response):verifyMainlineFormation(operation,beforeFacts,afterFacts,response);}
function verifyMainlineFormation(operation, beforeFacts, afterFacts, response) {
  const before = parseFormation(beforeFacts?.formation), after = parseFormation(afterFacts?.formation);
  const acknowledged = own(response, 'formation') ? parseFormation(response.formation) : null;
  const desired = parseFormation(operation?.expectedState), sent = parseFormation(operation?.action?.body?.formation);
  if (operation?.action?.request !== 'SaveFormationRequest' || operation?.action?.response !== 'SaveFormationResponse' || operation?.action?.body?.module !== 1 || !desired || !same(sent, desired)) return { confirmed: false, reason: 'SaveFormation 请求或目标状态不可靠' };
  if (beforeFacts?.reliability?.formation !== true || !before || !same(before, operation.beforeState) || !samePet(before, desired)) return { confirmed: false, reason: '写前阵容不匹配或宠物 UID 被改变' };
  if (!acknowledged || !same(acknowledged, desired)) return { confirmed: false, reason: 'SaveFormation 回包缺少完整匹配阵容' };
  if (afterFacts?.reliability?.formation !== true || !after || !same(after, desired)) return { confirmed: false, reason: 'GetFormation 权威复读未确认目标阵容' };
  return { confirmed: true, reason: 'SaveFormation 回包和新 GetFormation 复读均确认完整站位、阵型及原宠物 UID' };
}
function teamProjection(team) {
  if (!object(team)) return null;
  return { raw: toSnapshotJson(team), presetId: own(team, 'presetId') && positive(team.presetId) ? team.presetId : null, power: own(team, 'power') ? exactInteger(team.power) : null,
    members: own(team, 'members') && Array.isArray(team.members) ? team.members.map(r => ({ heroId: own(r?.hero, 'heroId') && validId(r.hero.heroId) ? r.hero.heroId : null,
      pos: position(r?.pos), hp: own(r, 'hp') ? exactInteger(r.hp) : null, hero: own(r, 'hero') ? toSnapshotJson(r.hero) : null })) : null,
    pet: own(team, 'pet') ? toSnapshotJson(team.pet) : null };
}
function damageProjection(rows) {
  if (!Array.isArray(rows)) return null;
  return rows.map(r => {
    const damage = r?.statBar?.damage, parts = ['physical', 'magic', 'true'].map(k => own(damage, k) ? exactInteger(damage[k]) : null);
    const valid = parts.every(v => v !== null && BigInt(v) >= 0n), hp = own(r, 'leftHp') ? exactInteger(r.leftHp) : null;
    return { heroId: own(r, 'heroId') && validId(r.heroId) ? r.heroId : null, pos: position(r?.pos), leftHp: hp !== null && BigInt(hp) >= 0n ? hp : null,
      survival: hp === null || BigInt(hp) < 0n ? 'UNKNOWN' : BigInt(hp) === 0n ? 'FALLEN' : 'ALIVE', damage: valid ? parts.reduce((sum, v) => sum + BigInt(v), 0n).toString() : null,
      physical: parts[0], magic: parts[1], trueDamage: parts[2] };
  });
}
// Consume the existing ChallengeStageResponse. Never issue a battle to collect a report.
export function battleAnalysis(response, context = {}) {
  const initial = own(response, 'initialData') ? response.initialData : null, stats = own(response, 'stats') ? response.stats : null;
  const stage = context.stage ?? (own(initial, 'mainlineStage') ? initial.mainlineStage : null);
  const report = { module: 'formation', stage, status: 'UNKNOWN', outcome: 'UNKNOWN', playerSide: null,
    leftTeam: teamProjection(initial?.leftTeam), rightTeams: Array.isArray(initial?.rightTeams) ? initial.rightTeams.map(teamProjection) : null,
    leftPlayer: own(initial, 'leftPlayer') ? toSnapshotJson(initial.leftPlayer) : null, rightPlayer: own(initial, 'rightPlayer') ? toSnapshotJson(initial.rightPlayer) : null,
    leftHeroDamages: own(stats, 'leftHeroDamages') ? damageProjection(stats.leftHeroDamages) : null, rightHeroDamages: own(stats, 'rightHeroDamages') ? damageProjection(stats.rightHeroDamages) : null,
    positionComparisons: [], defeatReasons: [], recommendations: [], automaticSwitch: false, resumeAllowed: false, gaps: [] };
  try {
    const result = parseStageResult(response, { stage, player: context.player, resolvePlayerSide: resolveMainlineChallengeSide, battleMode: context.battleMode ?? MAINLINE_CHALLENGE,
      requestName: context.requestName ?? 'ChallengeStageRequest', responseName: context.responseName ?? 'ChallengeStageResponse' });
    Object.assign(report, { status: 'ANALYZED', outcome: result.outcome, playerSide: result.playerSide });
  } catch (error) { report.status = error.code ?? 'UNKNOWN'; report.gaps.push(error.message); return report; }
  if (!report.leftTeam?.members || !report.rightTeams?.length) report.gaps.push('参战队伍资料不完整');
  const members = report.leftTeam?.members ?? [], damages = report.leftHeroDamages;
  for (const member of members) {
    const matches = damages?.filter(r => r.heroId !== null && r.heroId === member.heroId) ?? [], row = matches.length === 1 ? matches[0] : null;
    report.positionComparisons.push({ heroId: member.heroId, participating: member.pos, statistics: row?.pos ?? null, matches: member.pos && row?.pos ? member.pos.x === row.pos.x && member.pos.y === row.pos.y : null });
  }
  if (report.outcome === 'FAILED') {
    const memberIds = members.map(r => r.heroId);
    const known = members.length > 0 && memberIds.every(id => id !== null) && new Set(memberIds).size === memberIds.length && damages?.length === members.length &&
      damages.every(r => r.heroId !== null && r.leftHp !== null && memberIds.includes(r.heroId)) && new Set(damages.map(r => r.heroId)).size === damages.length;
    if (known && damages.every(r => r.survival === 'FALLEN')) report.defeatReasons.push({ code: 'TEAM_WIPED', evidence: { fallen: damages.length }, limitation: '最终生命值不能证明阵亡先后顺序' });
    const total = rows => rows?.length && rows.every(r => r.damage !== null) ? rows.reduce((sum, r) => sum + BigInt(r.damage), 0n) : null;
    const opponents = (report.rightTeams ?? []).flatMap(team => team?.members ?? []);
    const key = row => row?.heroId && row.pos ? row.heroId + ':' + row.pos.x + ':' + row.pos.y : null;
    const matchingRows = (expected, actual) => expected.length > 0 && actual?.length === expected.length && expected.every(row => key(row) !== null) &&
      JSON.stringify(expected.map(key).sort()) === JSON.stringify(actual.map(key).sort());
    const left = known ? total(damages) : null, right = matchingRows(opponents, report.rightHeroDamages) ? total(report.rightHeroDamages) : null;
    if (left !== null && right !== null && left < right) report.defeatReasons.push({ code: 'DAMAGE_GAP', evidence: { leftDamage: left.toString(), rightDamage: right.toString() }, limitation: '仅比较本场累计伤害，不推断英雄强度或阵亡时间' });
    if (!known || report.positionComparisons.some(r => r.matches === null)) report.gaps.push('站位或生存统计不足，不能据此推断失败机制');
    if (context.formationFacts) report.recommendations = recommendFormations(report, context.formationFacts, { moduleConfig: context.moduleConfig });
  }
  return report;
}
export function recommendFormations(report, facts, { moduleConfig = defaultConfig } = {}) {
  if (report?.status !== 'ANALYZED' || report.outcome !== 'FAILED' || report.playerSide !== 'LEFT') return [];
  return viewFormation(facts, { moduleConfig }).candidates.filter(r => r.executable).map(r => ({ actionId: r.actionId, parameters: r.parameters, beforeState: r.beforeState, expectedState: r.expectedState,
    rule: 'CLIENT_CAREER_LAYOUT', reason: '按客户端职业排序预览已解锁阵型；本场统计不能证明该候选必然更优', requiresApproval: true, automatic: false }));
}
export const formationModule = Object.freeze({ id: 'formation', rejectionIdentity: businessRejectionIdentityFromHistory, validateParameters: validateFormationParameters, defaultConfig, survey: surveyFormation, view: viewFormation, plan: planFormation, verify: verifyFormation });
