import { randomUUID, randomInt as cryptoRandomInt } from 'node:crypto';
import { redact } from './security.mjs';
import { battleAnalysis, parseFormation } from './formation.mjs';

const own = (value, name) => value !== null && typeof value === 'object' && Object.hasOwn(value, name);
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const stageNumber = (value) => positive(value) && value <= 2147483647;
const terminalStates = new Set(['FAILED', 'REJECTED', 'CLOSED', 'EXPIRED', 'STOPPED']);
const HISTORY_LIMIT = 200;

function problem(code, message, statusCode = 409) {
  return Object.assign(new Error(message), { code, statusCode });
}
// STEP 4-B1 accepts stage-137 E2E evidence for this request pair only.
// Ignored diagnostic files document the authorization; they are not runtime dependencies.
export const MAINLINE_CHALLENGE = 'MAINLINE_CHALLENGE';
export const MAINLINE_SIDE_AUTHORIZATION = Object.freeze({
  battleMode: MAINLINE_CHALLENGE,
  requestName: 'ChallengeStageRequest', responseName: 'ChallengeStageResponse',
  battleType: 1, // Existing BattleType.BT_MAINLINE, explicit in the real response.
  playerSide: 'LEFT', playerWin: 'stats.isLeftWin',
  evidencePath: 'work/e2e/20261110-real/run-2026-11-10T08-21-23-670Z-88bbe383/side-evidence.json',
  evidenceSha256: 'd09323345c8966eb24b93d8e206998857a9c043b4a71d892857363cd5a534816',
  acceptedIn: 'STEP 4-B1', evidenceStage: 137, uniqueInstanceMatches: 16,
});
function assertMainlineContext(context) {
  const { battleMode, requestName, responseName } = context ?? {};
  if (battleMode !== MAINLINE_CHALLENGE || requestName !== 'ChallengeStageRequest' || responseName !== 'ChallengeStageResponse') {
    throw problem('SIDE_UNVERIFIED', '该战斗模式或协议调用不在已授权的主线阵营证据范围内');
  }
}
export function resolveMainlineChallengeSide(response, _player, context) {
  assertMainlineContext(context);
  if (!own(response, 'initialData') || !own(response.initialData, 'battleType') ||
      response.initialData.battleType !== MAINLINE_SIDE_AUTHORIZATION.battleType) {
    throw problem('SIDE_UNVERIFIED', '响应未明确标记为已授权的主线战斗 BT_MAINLINE');
  }
  return MAINLINE_SIDE_AUTHORIZATION.playerSide;
}

export function defaultStageFormationConfig() { return { enabled: false, presetId: null }; }

export function defaultStageConfig() {
  return { enabled: false, retryDelaySeconds: 10, maxAttempts: null, maxStage: null };
}
export function validateStageConfig(value) {
  // Optional for old API/UI callers: omitted stopOnDefeat retains the retry policy.
  const keys = ['enabled', 'retryDelaySeconds', 'maxAttempts', 'maxStage', 'stopOnDefeat', 'interStageDelay', 'formation'];
  const delay = value?.interStageDelay;
  const formation = value?.formation;
  const validFormation = !own(value, 'formation') || (formation !== null && typeof formation === 'object' && !Array.isArray(formation) &&
    Object.keys(formation).length === 2 && own(formation, 'enabled') && own(formation, 'presetId') && typeof formation.enabled === 'boolean' &&
    (formation.presetId === null || stageNumber(formation.presetId)) && (!formation.enabled || stageNumber(formation.presetId)));
  const validSeconds = (seconds) => Number.isFinite(seconds) && seconds >= 0 && seconds <= 86400 && Number.isSafeInteger(seconds * 1000);
  const validDelay = !own(value, 'interStageDelay') || (delay !== null && typeof delay === 'object' && !Array.isArray(delay) &&
    Object.keys(delay).length === 2 && own(delay, 'minSeconds') && own(delay, 'maxSeconds') &&
    validSeconds(delay.minSeconds) && validSeconds(delay.maxSeconds) && delay.minSeconds <= delay.maxSeconds);
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some((key) => !keys.includes(key)) || typeof value.enabled !== 'boolean' ||
      (own(value, 'stopOnDefeat') && typeof value.stopOnDefeat !== 'boolean') || !validDelay || !validFormation ||
      !Number.isFinite(value.retryDelaySeconds) || value.retryDelaySeconds < 0 || value.retryDelaySeconds > 86400 ||
      (value.maxAttempts !== null && !positive(value.maxAttempts)) ||
      (value.maxStage !== null && !stageNumber(value.maxStage))) {
    throw problem('INVALID_CONFIG', '闯关配置无效：间隔需为 0–86400 秒（至多毫秒精度），关卡间隔最小值不能大于最大值，次数和目标关卡需为正整数或 null', 400);
  }
  return { enabled: value.enabled, retryDelaySeconds: value.retryDelaySeconds,
    maxAttempts: value.maxAttempts, maxStage: value.maxStage,
    ...(own(value, 'stopOnDefeat') ? { stopOnDefeat: value.stopOnDefeat } : {}),
    ...(own(value, 'interStageDelay') ? { interStageDelay: { ...delay } } : {}),
    ...(own(value, 'formation') ? { formation: { ...formation } } : {}) };
}

// Prompt ownership remains GameClient's responsibility; classify its rejection only.
// Keep sanitized diagnostics without retaining arbitrary response or login frames.
function stageError(error, at, login) {
  const limited = error?.code === 'RATE_LIMITED' || /^(?:(?:server prompt|PromptResponse):\s*)?too frequent, retry later\b/i.test(error?.message ?? '');
  return redact({ login, error: { code: limited ? 'RATE_LIMITED' : error?.code ?? 'STAGE_ERROR',
    name: error?.name ?? 'Error', message: error?.message ?? String(error),
    ...(error?.prompt ? { prompt: error.prompt } : {}),
    ...(error?.request ? { request: error.request } : {}), at } }).error;
}

// Only a trusted protocol/gameplay adapter may establish which side owns this account.
// Names, avatars and hero types do not uniquely identify a player.
export function parseStageResult(response, { stage, player, resolvePlayerSide,
  battleMode = MAINLINE_CHALLENGE, requestName = 'ChallengeStageRequest', responseName = 'ChallengeStageResponse' } = {}) {
  const context = { battleMode, requestName, responseName };
  assertMainlineContext(context);
  if (!stageNumber(stage) || !own(response, 'initialData') ||
      !own(response.initialData, 'mainlineStage') || response.initialData.mainlineStage !== stage) {
    throw problem('STAGE_MISMATCH', '战斗响应缺少明确关卡号或与本次挑战不一致');
  }
  if (own(response.initialData, 'battleType') && response.initialData.battleType !== MAINLINE_SIDE_AUTHORIZATION.battleType) {
    throw problem('SIDE_UNVERIFIED', '其他或未知战斗模式不能使用主线阵营映射');
  }
  if (!own(response, 'stats') || !own(response.stats, 'isLeftWin') ||
      typeof response.stats.isLeftWin !== 'boolean') {
    throw problem('UNKNOWN_RESULT', '战斗响应缺少明确的布尔胜负结果');
  }
  if (typeof resolvePlayerSide !== 'function') {
    throw problem('SIDE_UNVERIFIED', '现有协议证据尚不能可靠确定当前玩家阵营，禁止自动开战');
  }
  const playerSide = resolvePlayerSide(response, player, context);
  if (playerSide !== 'LEFT' && playerSide !== 'RIGHT') {
    throw problem('SIDE_UNVERIFIED', '无法可靠确定本次战斗的玩家阵营');
  }
  const isLeftWin = response.stats.isLeftWin;
  return { stage, isLeftWin, playerSide,
    outcome: (playerSide === 'LEFT' ? isLeftWin : !isLeftWin) ? 'SUCCESS' : 'FAILED' };
}

// One object belongs to one connected account/client generation. Reconnection creates
// another object; there is deliberately no unsafe reset for an uncertain battle.
export function createStageRunner({ client, player, protocol, resolvePlayerSide, battleMode = MAINLINE_CHALLENGE,
  isCurrent = () => true, signal = null, onUpdate = null, clock = {}, randomInt = cryptoRandomInt, formationFacts = null, formationModuleConfig = null } = {}) {
  const now = clock.now ?? Date.now;
  const schedule = clock.setTimeout ?? globalThis.setTimeout;
  const unschedule = clock.clearTimeout ?? globalThis.clearTimeout;
  let progress = player?.mainlineStage;
  let activeRun = null;
  let pendingRequest = null;
  let completion = Promise.resolve();
  let view = { runId: null, state: 'IDLE', running: false, currentStage: progress ?? null,
    nextStage: progress ?? null, attempts: 0, consecutiveFailures: 0, lastResult: null,
    retryAt: null, nextStageAt: null, history: [], stopReason: null, stopKind: null, error: null,
    uncertain: false, config: defaultStageConfig() };

  function getStatus() {
    return { ...view, config: { ...view.config,
      ...(view.config.interStageDelay ? { interStageDelay: { ...view.config.interStageDelay } } : {}),
      ...(view.config.formation ? { formation: { ...view.config.formation } } : {}) }, lastResult: view.lastResult ? structuredClone(view.lastResult) : null,
      battleAnalysis: view.battleAnalysis ? structuredClone(view.battleAnalysis) : null,
      recommendations: structuredClone(view.recommendations ?? []), formationVerification: view.formationVerification ? structuredClone(view.formationVerification) : null,
      error: view.error ? structuredClone(view.error) : null, history: view.history.map((item) => structuredClone(item)),
      inFlight: pendingRequest !== null };
  }
  function publish() { onUpdate?.(getStatus()); }
  function setState(state) { view.state = state; publish(); }
  function current(run) { return activeRun === run && run.active && isCurrent(); }
  function append(entry) {
    view.history.push({ runId: view.runId, stage: view.currentStage, attempt: view.attempts,
      at: new Date(now()).toISOString(), reason: null, ...entry });
    if (view.history.length > HISTORY_LIMIT) view.history.splice(0, view.history.length - HISTORY_LIMIT);
  }
  function cleanup(run) {
    if (run.timer !== null) { unschedule(run.timer); run.timer = null; }
    for (const [name, handler] of run.handlers) client.off?.(name, handler);
    run.handlers.length = 0;
    if (run.abortHandler) signal?.removeEventListener('abort', run.abortHandler);
    run.abortHandler = null;
  }
  function finish(run, kind, reason, error = null) {
    if (activeRun !== run || !run.active) return;
    run.active = false;
    run.cancel();
    cleanup(run);
    view.running = false;
    view.retryAt = null;
    view.nextStageAt = null;
    view.stopKind = kind;
    view.stopReason = reason;
    if (kind === 'ERROR') {
      view.error = stageError(error ?? problem('STAGE_ERROR', reason), new Date(now()).toISOString(), client?.login);
      view.stopReason = view.error.message;
      view.uncertain = true;
    } else if (pendingRequest) {
      // Cancellation cannot revoke a request already sent to the game.
      view.uncertain = true;
    }
    try {
      const persisted = run.journal?.finish({ runId: run.id, kind, at: new Date(now()).toISOString(), reason: view.stopReason, code: view.error?.code });
      if (persisted === 'NOT_EXECUTED' && view.error?.code === 'HISTORY_UNAVAILABLE') view.uncertain = false;
    } catch (cause) {
      // The previous durable intent remains authoritative if finishing fails.
      // Never retry a request to compensate for a failed local history write.
      view.stopKind = 'ERROR';
      view.error = stageError(cause, new Date(now()).toISOString(), client?.login);
      view.stopReason = view.error.message;
    }
    if (view.stopKind === 'ERROR') {
      append({ outcome: 'ERROR', reason: view.error.message, code: view.error.code, at: view.error.at });
      setState('ERROR');
    }
    setState('STOPPED');
  }
  function stop(reason = '用户主动停止') {
    if (activeRun?.active) finish(activeRun, 'USER', reason);
    return getStatus();
  }
  function fail(error) {
    const actual = error instanceof Error ? error : problem('STAGE_ERROR', String(error || '闯关异常'));
    if (activeRun?.active) finish(activeRun, 'ERROR', actual.message, actual);
    return getStatus();
  }
  function assertActive(run) {
    if (!current(run)) throw problem('STALE_RUN', '账号或运行代次已改变，停止闯关');
    if (!client?.connected) throw problem('DISCONNECTED', '账号连接已断开');
  }
  function listen(run) {
    const on = (name, handler) => {
      if (typeof client.on === 'function') { client.on(name, handler); run.handlers.push([name, handler]); }
    };
    on('error', (error) => { if (current(run)) fail(error); });
    on('fatal', () => { if (current(run)) fail(problem('ACCOUNT_INVALID', '游戏连接失效，闯关停止')); });
    on('promptAmbiguous', () => { if (current(run)) fail(problem('AMBIGUOUS_PROMPT', '无法确定服务端提示归属，闯关停止')); });
    on('state', ({ state } = {}) => {
      if (current(run) && terminalStates.has(state)) fail(problem('ACCOUNT_' + state, '账号进入终止状态：' + state));
    });
    if (signal) {
      run.abortHandler = () => fail(problem('ACCOUNT_CANCELLED', '账号任务已取消'));
      signal.addEventListener('abort', run.abortHandler, { once: true });
    }
  }
  async function waitDelay(run, milliseconds) {
    let wake;
    const waiting = new Promise((resolve) => { wake = resolve; });
    run.timer = schedule(() => { run.timer = null; wake(); }, milliseconds);
    await Promise.race([waiting, run.cancelled]);
  }
  async function execute(run) {
    try {
      while (activeRun === run && run.active) {
        assertActive(run);
        if (view.config.maxStage !== null && progress > view.config.maxStage) {
          finish(run, 'COMPLETED', '已达到最高目标关卡'); return;
        }
        if (view.config.maxAttempts !== null && view.attempts >= view.config.maxAttempts) {
          finish(run, 'COMPLETED', '已达到最大尝试次数'); return;
        }
        view.currentStage = progress;
        view.nextStage = progress;
        setState('STARTING');
        assertActive(run);
        // Trusted in-memory caller guard runs synchronously before every send.
        if (run.beforeDispatch) {
          const allowed = run.beforeDispatch({ runId: run.id, stage: progress });
          if (allowed === false || allowed && typeof allowed.then === 'function') throw problem('DISPATCH_CANCELLED', '可信发送检查已拒绝本次挑战');
          assertActive(run);
        }
        // The standalone entry persists the intent synchronously before the
        // request can enter the transport. Operation/Workflow own their history.
        const attempt = view.attempts + 1;
        run.journal?.dispatch({ runId: run.id, stage: progress, attempt, at: new Date(now()).toISOString() });
        assertActive(run);
        // No read/skip/query is sent here. All battles are strictly serialized.
        view.attempts = attempt;
        const sentinel = {};
        pendingRequest = sentinel;
        let original;
        try {
          original = Promise.resolve(client.request('ChallengeStageRequest',
            { stage: progress }, 'ChallengeStageResponse', 15000, { mutate: true, signal,
              ...(run.journal ? { beforeDispatch: () => assertActive(run) } : {}) }));
        } catch (error) {
          if (pendingRequest === sentinel) pendingRequest = null;
          throw error;
        }
        let tracked;
        tracked = original.then(
          (body) => { if (pendingRequest === tracked) pendingRequest = null; return { body }; },
          (error) => { if (pendingRequest === tracked) pendingRequest = null; return { error }; });
        pendingRequest = tracked;
        if (!run.active) return;
        setState('WAITING_RESULT');
        const answer = await Promise.race([tracked, run.cancelled.then(() => ({ cancelled: true }))]);
        if (activeRun !== run || !run.active || answer.cancelled) return;
        if (answer.error) throw answer.error;
        assertActive(run);
        const result = parseStageResult(answer.body, { stage: progress, player, resolvePlayerSide, battleMode });
        assertActive(run);
        run.journal?.settle({ runId: run.id, stage: progress, attempt, at: new Date(now()).toISOString(), result });
        let formationContext = null, moduleSettings = null;
        try { formationContext = typeof formationFacts === 'function' ? formationFacts() : formationFacts; moduleSettings = typeof formationModuleConfig === 'function' ? formationModuleConfig() : formationModuleConfig; } catch { /* Missing recommendation facts do not trigger another battle or a formation write. */ }
        const analysis = battleAnalysis(answer.body, { stage: progress, player, battleMode, formationFacts: moduleSettings?.mainlineEnabled === true ? formationContext : null, moduleConfig: moduleSettings ?? undefined });
        view.battleAnalysis = analysis;
        view.recommendations = analysis.recommendations;
        view.lastResult = { ...result, at: new Date(now()).toISOString(), battleAnalysis: analysis };
        append({ outcome: result.outcome, battleAnalysis: analysis, recommendations: analysis.recommendations });
        const lastProtocolStage = progress === 2147483647;
        if (result.outcome === 'SUCCESS') {
          view.consecutiveFailures = 0;
          if (!lastProtocolStage) progress += 1;
          view.nextStage = progress;
        } else view.consecutiveFailures += 1;
        setState(result.outcome);
        if (!run.active) return;
        assertActive(run);
        if (result.outcome === 'SUCCESS') {
          if (lastProtocolStage) {
            finish(run, 'COMPLETED', '已达到协议关卡号上限'); return;
          }
          if (view.config.maxStage !== null && progress > view.config.maxStage) {
            finish(run, 'COMPLETED', '已达到最高目标关卡'); return;
          }
          if (view.config.maxAttempts !== null && view.attempts >= view.config.maxAttempts) {
            finish(run, 'COMPLETED', '已达到最大尝试次数'); return;
          }
          setState('NEXT_STAGE');
          if (!run.active) return;
          assertActive(run);
          if (view.config.interStageDelay) {
            const { minSeconds, maxSeconds } = view.config.interStageDelay;
            const milliseconds = randomInt(minSeconds * 1000, maxSeconds * 1000 + 1);
            if (!Number.isSafeInteger(milliseconds) || milliseconds < minSeconds * 1000 || milliseconds > maxSeconds * 1000) {
              throw problem('INVALID_DELAY', '随机关卡间隔超出配置范围');
            }
            view.nextStageAt = now() + milliseconds;
            Object.assign(view.history[view.history.length - 1], { interStageDelayMs: milliseconds, nextStageAt: view.nextStageAt });
            setState('WAIT_NEXT_STAGE');
            if (!run.active) return;
            assertActive(run);
            await waitDelay(run, milliseconds);
            if (!run.active) return;
            assertActive(run);
            view.nextStageAt = null;
          }
        } else {
          if (view.config.stopOnDefeat === true) {
            finish(run, 'DEFEAT_STOPPED', '首次明确战败，按配置立即停止'); return;
          }
          if (view.config.maxAttempts !== null && view.attempts >= view.config.maxAttempts) {
            finish(run, 'COMPLETED', '已达到最大尝试次数'); return;
          }
          view.retryAt = now() + view.config.retryDelaySeconds * 1000;
          setState('WAIT_RETRY');
          if (!run.active) return;
          await waitDelay(run, view.config.retryDelaySeconds * 1000);
          if (!run.active) return;
          assertActive(run);
          view.retryAt = null;
        }
      }
    } catch (error) {
      if (activeRun === run && run.active) finish(run, 'ERROR', error.message, error);
    }
  }
  function start(config, { allowMutate = false, formationEvidence = null, beforeDispatch = null, journal = null } = {}) {
    if (journal !== null && ['start', 'dispatch', 'settle', 'finish'].some(method => typeof journal?.[method] !== 'function')) {
      throw problem('HISTORY_UNAVAILABLE', '独立闯关历史接口无效');
    }
    if (beforeDispatch !== null && typeof beforeDispatch !== 'function') throw problem('INVALID_GUARD', '可信发送检查必须为同步函数');
    if (!allowMutate) throw problem('MUTATION_NOT_AUTHORIZED', '自动闯关会改变游戏状态，需要明确授权', 403);
    const clean = validateStageConfig(config ?? defaultStageConfig());
    if (!clean.enabled) throw problem('DISABLED', '请先启用自动闯关配置');
    assertMainlineContext({ battleMode, requestName: 'ChallengeStageRequest', responseName: 'ChallengeStageResponse' });
    if (typeof resolvePlayerSide !== 'function') throw problem('SIDE_UNVERIFIED', '现有协议证据尚不能可靠确定当前玩家阵营，禁止自动开战');
    if (view.running || pendingRequest) throw problem('STAGE_BUSY', '该账号已有闯关或未决战斗');
    if (view.uncertain) throw problem('RESULT_UNCERTAIN', '上次战斗结果不确定，请先明确重新连接同步关卡');
    if (!isCurrent() || signal?.aborted || !client?.connected) throw problem('DISCONNECTED', '请先显式连接账号');
    if (!stageNumber(progress)) throw problem('INVALID_STAGE', '登录信息缺少有效主线关卡号');
    if (!protocol?.ChallengeStageRequest || !protocol?.ChallengeStageResponse) throw problem('PROTOCOL_MISSING', '缺少现有主线战斗协议');
    if (typeof client.request !== 'function') throw problem('PROTOCOL_MISSING', '客户端缺少请求能力');
    let formationVerification = null;
    if (clean.formation?.enabled === true) {
      const proof = formationEvidence, formation = parseFormation(proof?.formation), checkedAt = proof?.checkedAt;
      if (!['confirmed','presetId','formation','client','playerId','checkedAt','batchId','planHash'].every(key => own(proof, key)) || proof.confirmed !== true || proof?.client !== client || !own(player, 'playerId') || player.playerId == null || proof?.playerId !== player.playerId ||
          !Number.isSafeInteger(checkedAt) || checkedAt > now() || now() - checkedAt > 30000 ||
          typeof proof?.batchId !== 'string' || !proof.batchId.trim() || typeof proof?.planHash !== 'string' || !proof.planHash.trim() ||
          proof.presetId !== clean.formation.presetId || !formation?.heroPositions.length || formation.presetId !== clean.formation.presetId) {
        throw problem('FORMATION_UNVERIFIED', '启动前阵容尚未通过当前账号授权保存和新复读验证，禁止闯关');
      }
      formationVerification = { confirmed: true, presetId: proof.presetId, formation, checkedAt, batchId: proof.batchId, planHash: proof.planHash };
    }
    let cancel;
    const cancelled = new Promise((resolve) => { cancel = resolve; });
    const run = { id: randomUUID(), active: true, cancel, cancelled, timer: null, handlers: [], abortHandler: null, beforeDispatch, journal };
    journal?.start({ runId: run.id, stage: progress, at: new Date(now()).toISOString(), config: clean });
    activeRun = run;
    view = { ...view, runId: run.id, state: 'STARTING', running: true, currentStage: progress,
      nextStage: progress, attempts: 0, consecutiveFailures: 0, lastResult: null, retryAt: null, nextStageAt: null,
      history: [], stopReason: null, stopKind: null, error: null, config: clean, formationVerification, battleAnalysis: null, recommendations: [] };
    listen(run);
    completion = Promise.resolve().then(() => execute(run));
    publish();
    return getStatus();
  }
  return { start, stop, fail, getStatus, get completion() { return completion; },
    get pending() { return pendingRequest !== null; } };
}
