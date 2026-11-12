// Translate the original StageRunner boundaries into the shared execution history.
// The caller supplies the already-authorized Session. There is no transport here.
const source = 'STANDALONE_STAGE_V1';
const module = 'stage';
const actionType = 'CHALLENGE_MAINLINE';
const capabilityId = 'C202';
const writeContract = 'standalone-stage-write-ahead-v1';

export function isConfirmedStandaloneDefeat(run, row) {
  const state = row.afterState;
  return run.source === source && row.module === module && row.actionType === actionType &&
    row.dispatchEvidence?.contract === writeContract && row.dispatched === true && row.unresolvedWrite === false &&
    row.requestStatus === 'FAILED' && row.result === 'FAILED' && state?.outcome === 'FAILED' &&
    Number.isSafeInteger(state.stage) && state.stage > 0 && state.stage === row.target?.stage &&
    (state.playerSide === 'LEFT' && state.isLeftWin === false || state.playerSide === 'RIGHT' && state.isLeftWin === true);
}

export function createStandaloneStageJournal(history, executionContext) {
  let record;
  function put(next) {
    history.put(next);
    record = next;
  }
  function pending({runId, attempt, stage}) {
    const last = record?.actions.at(-1);
    if (record?.runId !== runId || last?.attempt !== attempt || last.target.stage !== stage ||
        last.requestStatus !== 'DISPATCHING') throw new Error('独立闯关缺少对应的派发意图');
    return last;
  }

  return {
    start({runId, stage, at, config}) {
      const {accountId} = executionContext;
      put({source, accountId, executionContext, runId, parentRunId: null, workflowId: null,
        module, mode: 'STANDALONE', startedAt: at, finishedAt: null, resumable: false,
        authorizationSummary: {batchId: runId, kind: 'EXPLICIT_STAGE_CONFIRMATION', approvedAt: at},
        planSummary: {batchId: runId, fromStage: stage, config: structuredClone(config)},
        actions: [], finalStatus: 'NOT_EXECUTED', stopReason: '尚未派发；历史仅供查看，不恢复授权'});
    },
    dispatch({runId, stage, attempt, at}) {
      if (record?.runId !== runId || record.actions.length + 1 !== attempt ||
          record.actions.at(-1)?.requestStatus === 'DISPATCHING') throw new Error('独立闯关的派发序号不一致');
      const row = {module, capabilityId, actionType, actionId: `stage:CHALLENGE_MAINLINE:${attempt}`, attempt,
        target: {stage}, identity: {stage, battleMode: 'MAINLINE_CHALLENGE'}, beforeState: {stage}, afterState: null,
        request: 'ChallengeStageRequest', response: 'ChallengeStageResponse', timestamp: at,
        dispatched: null, dispatchEvidence: {version: 1, contract: writeContract, state: 'MAY_HAVE_DISPATCHED'},
        requestStatus: 'DISPATCHING', result: 'NOT_EXECUTED', stages: [{stage: 'DISPATCH_INTENT', timestamp: at}]};
      put({...record, finalStatus: 'EXECUTING', stopReason: null, actions: [...record.actions, row]});
    },
    settle({runId, stage, attempt, at, result}) {
      const last = pending({runId, stage, attempt});
      const {outcome, isLeftWin, playerSide} = result;
      if (result.stage !== stage || !['SUCCESS', 'FAILED'].includes(outcome) ||
          !['LEFT', 'RIGHT'].includes(playerSide) || typeof isLeftWin !== 'boolean') throw new Error('独立闯关缺少对应的已解析胜负');
      const row = {...last, timestamp: at, dispatched: true, requestStatus: outcome, result: outcome,
        unresolvedWrite: false, afterState: {stage, outcome, isLeftWin, playerSide},
        verification: {status: 'CONFIRMED', reason: '现有主线解析器已核对本场关卡、阵营与明确胜负'},
        stages: [...last.stages, {stage: 'VERIFIED', timestamp: at}]};
      put({...record, actions: [...record.actions.slice(0,-1), row]});
    },
    finish({runId, at, kind, reason, code}) {
      if (record?.runId !== runId) throw new Error('独立闯关缺少对应的运行');
      const last = record.actions.at(-1);
      const unknown = last?.requestStatus === 'DISPATCHING';
      const finalStatus = unknown ? 'UNKNOWN' : kind === 'USER' ? 'CANCELLED' :
        !last ? 'NOT_EXECUTED' : kind === 'COMPLETED' && last.result === 'SUCCESS' ? 'SUCCESS' : 'FAILED';
      const actions = unknown ? [...record.actions.slice(0,-1), {...last, timestamp: at, requestStatus: 'UNKNOWN',
        result: 'UNKNOWN', unresolvedWrite: true, reason, ...(code ? {errorCode: code} : {})}] : record.actions;
      put({...record, actions, finalStatus, finishedAt: at, stopReason: reason, stopKind: kind, ...(code ? {errorCode: code} : {})});
      return finalStatus;
    },
  };
}
