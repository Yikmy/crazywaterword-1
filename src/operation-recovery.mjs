// Read-only, evidence-bound reconciliation. Never dispatch or replay a business write.
import { parseFormation, verifyFormation } from './formation.mjs';
import { assertExecutionActive, awaitExecution } from './execution.mjs';
import { toSnapshotJson } from './game.mjs';

export const RECOVERY_DISPATCH_CONTRACT = 'business-write-ahead-v1';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => object(value) && Object.hasOwn(value, key);
const text = value => typeof value === 'string' && value.length > 0 && value.trim() === value;
const writeStages = new Set(['DISPATCH_INTENT', 'DISPATCHED', 'RESPONSE', 'OBSERVATION_ENDED', 'VERIFY', 'VERIFIED']);
const preDispatchStages = new Set(['SURVEY', 'RESOURCE_PREFLIGHT']);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function gameId(value) {
  const copied = toSnapshotJson(value);
  if (typeof copied === 'number' && (!Number.isSafeInteger(copied) || copied <= 0)) return null;
  if (!['number', 'string'].includes(typeof copied) || !/^[1-9]\d*$/.test(String(copied))) return null;
  try { return BigInt(copied).toString(); } catch { return null; }
}
function scope(value) {
  if (!object(value) || !text(value.accountId) || !text(value.connectionId) || value.connectionId.length > 256 || !Number.isSafeInteger(value.generation) || value.generation < 0) return null;
  const playerId = gameId(value.playerId), worldId = gameId(value.worldId);
  return playerId && worldId ? { accountId: value.accountId, playerId, worldId, generation: value.generation, connectionId: value.connectionId } : null;
}
function completeFormation(value) {
  if (!object(value) || Object.keys(value).some(key => !['heroPositions', 'presetId', 'petUid'].includes(key))) return null;
  if (!Array.isArray(value.heroPositions) || !value.heroPositions.length ||
      value.heroPositions.some(row => !object(row) || Object.keys(row).some(key => !['heroId', 'pos'].includes(key)) ||
        !object(row.pos) || Object.keys(row.pos).some(key => !['x', 'y'].includes(key)))) return null;
  const parsed = parseFormation(value);
  if (!parsed) return null;
  parsed.heroPositions.sort((a, b) => a.heroId.localeCompare(b.heroId));
  return parsed;
}
function sameFormation(a, b) {
  const left = completeFormation(a), right = completeFormation(b);
  return left !== null && right !== null && same(left, right);
}
function provenNotDispatched(row) {
  const proof = row.dispatchEvidence;
  if (!object(proof) || proof.version !== 1 || proof.contract !== RECOVERY_DISPATCH_CONTRACT || proof.state !== 'NOT_DISPATCHED') return false;
  if (row.dispatched === true || row.unresolvedWrite === true || row.verifiedReceipt ||
      row.requestStatus === 'SUCCESS' || row.result === 'SUCCESS') return false;
  if (row.stages !== undefined && (!Array.isArray(row.stages) || row.stages.some(entry => !object(entry) ||
      writeStages.has(entry.stage) || !preDispatchStages.has(entry.stage)))) return false;
  return true;
}
function receiptProblem(row, expected, originalScope) {
  const receipt = row.verifiedReceipt;
  if (!object(receipt) || receipt.version !== 1 || receipt.verified !== true ||
      receipt.request !== 'SaveFormationRequest' || receipt.response !== 'SaveFormationResponse' || receipt.module !== 1) return 'MISSING_VERIFIED_RECEIPT';
  if (!same(scope(receipt.executionContext), originalScope)) return 'RECEIPT_SCOPE_MISMATCH';
  if (!sameFormation(receipt.expectedState, expected) || !sameFormation(receipt.beforeFacts?.formation, row.beforeState) ||
      receipt.beforeFacts?.reliability?.formation !== true || !sameFormation(receipt.responseEvidence?.formation, expected)) return 'INCOMPLETE_VERIFIED_RECEIPT';
  return null;
}

// Only an already verified original execution may create this durable projection.
// No protocol bodies, credentials, config tables or unrelated player state are kept.
export function buildVerifiedReceipt(candidate, beforeFacts, afterFacts, response, context) {
  const executionContext = scope(context), expectedState = completeFormation(candidate?.expectedState);
  if (!executionContext || candidate?.module !== 'formation' || candidate?.actionType !== 'SAVE' ||
      !Array.isArray(candidate.costs) || candidate.costs.length !== 0 || candidate.target?.module !== 1 ||
      !expectedState || candidate.target?.presetId !== expectedState.presetId ||
      beforeFacts?.reliability?.formation !== true || afterFacts?.reliability?.formation !== true) return null;
  const before = completeFormation(beforeFacts.formation), after = completeFormation(afterFacts.formation);
  const acknowledged = own(response, 'formation') ? completeFormation(response.formation) : null;
  if (!before || !after || !acknowledged) return null;
  const verification = verifyFormation(candidate, beforeFacts, afterFacts, response);
  if (verification?.confirmed !== true) return null;
  return { version: 1, verified: true, request: 'SaveFormationRequest', response: 'SaveFormationResponse', module: 1,
    beforeFacts: { formation: before, reliability: { formation: true } }, expectedState,
    responseEvidence: { formation: acknowledged }, executionContext };
}
// context is the service-owned, currently locked session identity. assertCurrent
// must reject a replaced client/session before and after the fixed authoritative read.
// The caller persists this result as an append-only event; this collector never edits history.
export async function collectOperationRecovery(client, protocol, run, row, { signal, clock = Date.now, context, assertCurrent = () => {} } = {}) {
  const time = Number(clock()), checkedAt = Number.isFinite(time) && !Number.isNaN(new Date(time).getTime()) ? new Date(time).toISOString() : null;
  let originalScope = null, readRequest = null, observation = null;
  const finish = (status, reasonCode, reason) => ({ status, evidence: {
    version: 1, method: status === 'NOT_APPLIED' ? 'DURABLE_NOT_DISPATCHED_V1' : 'READ_ONLY_FORMATION_V1',
    reasonCode, reason, checkedAt, scope: originalScope, readRequest, observation,
    references: { runId: text(run?.runId) ? run.runId : null, actionId: text(row?.actionId) ? row.actionId : null },
  } });
  if (!checkedAt) return finish('STILL_UNKNOWN', 'INVALID_CLOCK', '复核时间不可用，未解除保护');
  if (!object(run) || !text(run.accountId) || !text(run.runId) || !text(row?.actionId) || !Array.isArray(run.actions)) return finish('STILL_UNKNOWN', 'INVALID_HISTORY', '缺少唯一持久批次和动作证据');
  const stored = run.actions.filter(action => action?.actionId === row.actionId);
  if (stored.length !== 1) return finish('STILL_UNKNOWN', 'INVALID_HISTORY', '持久动作不存在或不唯一');
  // Ignore caller-supplied projections; all decisions use the selected persisted row.
  row = stored[0];
  originalScope = scope(run.executionContext);
  const currentScope = scope(context);
  if (!originalScope || !currentScope || originalScope.accountId !== run.accountId || !same(originalScope, currentScope)) return finish('STILL_UNKNOWN', 'SCOPE_MISMATCH', '账号、角色、世界或连接代次不能与原执行证据绑定');
  try { assertExecutionActive(client, { signal }); assertCurrent(); }
  catch (error) { return finish('STILL_UNKNOWN', error?.code === 'CANCELLED' || error?.name === 'AbortError' ? 'CANCELLED' : 'SESSION_CHANGED', '复核已取消或会话归属已变化'); }
  if (provenNotDispatched(row)) return finish('NOT_APPLIED', 'PROVEN_NOT_DISPATCHED', '版本化写前屏障证明业务请求从未派发；不会重用原授权');
  const expected = completeFormation(row.expectedState);
  if (row.module !== 'formation' || row.actionType !== 'SAVE' || !Array.isArray(row.costs) || row.costs.length !== 0 ||
      row.target?.module !== 1 || !expected || row.target?.presetId !== expected.presetId) return finish('STILL_UNKNOWN', 'UNSUPPORTED_OPERATION', '当前仅复核明确、完整且零成本的主线阵容保存');
  if (client?.connected !== true || typeof client.request !== 'function') return finish('STILL_UNKNOWN', 'NOT_CONNECTED', '没有可用于权威复读的当前连接');
  if (client.pending?.length || client.watchers?.length || client.promptUncertain || client.lateResponses?.size) return finish('STILL_UNKNOWN', 'READ_CONTEXT_UNCERTAIN', '当前连接存在未决或迟到响应，不能安全复读');
  if (!protocol?.GetFormationRequest || !protocol?.GetFormationResponse) return finish('STILL_UNKNOWN', 'PROTOCOL_MISSING', '缺少固定 GetFormation 只读协议');
  const problem = receiptProblem(row, expected, originalScope);
  try {
    assertExecutionActive(client, { signal }); assertCurrent();
    readRequest = { request: 'GetFormationRequest', module: 1, response: 'GetFormationResponse' };
    const response = await awaitExecution(client.request('GetFormationRequest', { module: 1 }, 'GetFormationResponse', 15000, { signal }), client, { signal });
    assertExecutionActive(client, { signal }); assertCurrent();
    if (!same(scope(context), currentScope)) return finish('STILL_UNKNOWN', 'SESSION_CHANGED', '复读期间会话身份或连接代次发生变化');
    const formation = own(response, 'formation') ? completeFormation(response.formation) : null;
    if (!formation) return finish('STILL_UNKNOWN', 'UNRELIABLE_READ', 'GetFormation 回包缺少完整可靠阵容');
    observation = { formation, desiredStateMatches: sameFormation(formation, expected), authoritative: true };
    if (problem) return finish('STILL_UNKNOWN', problem, '当前状态仅供观察，缺少原业务请求回包与写前身份的持久验证凭据');
    const receipt = row.verifiedReceipt;
    const verification = verifyFormation({
      ...row, action: { request: 'SaveFormationRequest', response: 'SaveFormationResponse', body: { module: 1, formation: expected } },
    }, receipt.beforeFacts, { formation, reliability: { formation: true } }, receipt.responseEvidence);
    if (verification?.confirmed !== true) return finish('STILL_UNKNOWN', 'STATE_NOT_CONFIRMED', verification?.reason ?? '权威复读未确认原目标状态');
    assertExecutionActive(client, { signal }); assertCurrent();
    if (!same(scope(context), currentScope)) return finish('STILL_UNKNOWN', 'SESSION_CHANGED', '提交复核前会话身份发生变化');
    return finish('APPLIED', 'RECEIPT_AND_AUTHORITY_CONFIRMED', verification.reason);
  } catch (error) {
    const cancelled = error?.code === 'CANCELLED' || error?.name === 'AbortError' || signal?.aborted || client?.connected === false;
    return finish('STILL_UNKNOWN', cancelled ? 'CANCELLED' : 'READ_FAILED', cancelled ? '复核取消或连接断开，未解除保护' : '固定只读复核失败，未解除保护');
  }
}
