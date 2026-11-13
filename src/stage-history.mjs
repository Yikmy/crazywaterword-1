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
    settle({runId, stage, attempt, at, result, analysis}) {
      const last = pending({runId, stage, attempt});
      const {outcome, isLeftWin, playerSide} = result;
      if (result.stage !== stage || !['SUCCESS', 'FAILED'].includes(outcome) ||
          !['LEFT', 'RIGHT'].includes(playerSide) || typeof isLeftWin !== 'boolean') throw new Error('独立闯关缺少对应的已解析胜负');
      const row = {...last, timestamp: at, dispatched: true, requestStatus: outcome, result: outcome,
        unresolvedWrite: false, afterState: {stage, outcome, isLeftWin, playerSide},
        ...(analysis?.status==='ANALYZED'&&analysis.stage===stage&&analysis.outcome===outcome&&analysis.playerSide===playerSide?{battleAnalysis:structuredClone(analysis)}:{}),
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

// Bounded read projection of the shared History; older rows without analyses
// remain readable and are never filled with reconstructed or current facts.
export function projectStageBattleHistory(accountId, runs, {limit=100}={}) {
  if(typeof accountId!=='string'||!accountId||!Array.isArray(runs)||!Number.isSafeInteger(limit)||limit<1||limit>200)throw new Error('战报历史范围无效');
  const role=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0?String(value):typeof value==='string'&&/^[1-9][0-9]{0,18}$/.test(value)&&BigInt(value)<(1n<<63n)?value:null;
  const reports=[],seen=new Set();
  for(const run of runs) {
    const context=run?.executionContext;
    if(run?.accountId!==accountId||context?.accountId!==accountId||!role(context.playerId)||!role(context.worldId))continue;
    const scope={accountId,playerId:role(context.playerId),worldId:role(context.worldId),battleMode:'MAINLINE_CHALLENGE'};
    const add=(row,entry,analysis,runnerId)=>{
      if(analysis?.status!=='ANALYZED'||analysis.playerSide!=='LEFT'||!['SUCCESS','FAILED'].includes(entry?.outcome)||analysis.outcome!==entry.outcome||!Number.isSafeInteger(entry.stage)||entry.stage<1||analysis.stage!==entry.stage||!Number.isSafeInteger(entry.attempt)||entry.attempt<1)return;
      const reportId=JSON.stringify([run.runId,row.actionId,runnerId,entry.attempt]);if(seen.has(reportId))return;seen.add(reportId);
      reports.push({reportId,runId:run.runId,actionId:row.actionId,workflowId:run.workflowId??null,nodeId:run.workflowNodeId??null,runnerId,attempt:entry.attempt,stage:entry.stage,outcome:entry.outcome,at:entry.at??row.timestamp??null,scope,analysis:structuredClone(analysis)});
    };
    for(const row of run.actions??[]) {
      if(run.source===source&&row.module==='stage'&&row.actionType===actionType&&row.dispatchEvidence?.contract===writeContract&&row.verification?.status==='CONFIRMED'&&row.unresolvedWrite===false&&row.dispatched===true&&['SUCCESS','FAILED'].includes(row.result)&&row.requestStatus===row.result&&row.afterState?.outcome===row.result&&row.afterState?.stage===row.target?.stage&&row.afterState.playerSide==='LEFT'&&row.afterState.isLeftWin===(row.result==='SUCCESS')) {
        add(row,{stage:row.target.stage,attempt:row.attempt,outcome:row.result},row.battleAnalysis,run.runId);
      } else if(row.module==='stage'&&row.actionType==='RUN_MAINLINE') {
        const runner=row.afterState?.runner??row.afterState;
        if(row.dispatched!==true||typeof runner?.runId!=='string'||!Array.isArray(runner.history))continue;
        for(const entry of runner.history)if(entry.runId===runner.runId)add(row,entry,entry.battleAnalysis,runner.runId);
      }
    }
  }
  reports.sort((a,b)=>String(b.at??'').localeCompare(String(a.at??''))||b.attempt-a.attempt);
  return {reports:reports.slice(0,limit),total:reports.length,limit,resumable:false,note:'仅比较同账号、角色、世界及主线关卡的已解析历史；旧记录缺少分析或身份时保留缺口，不补造。'};
}

// Pure observation comparison, also embedded in the professional page.
export function compareStageBattles(before, after) {
  const blocked=reason=>({status:'BLOCKED',reason,automaticSwitch:false,resumeAllowed:false});
  if(!before||!after||typeof before.reportId!=='string'||typeof after.reportId!=='string'||before.reportId===after.reportId)return blocked('请选择两份不同的历史战报');
  const validScope=s=>s&&typeof s.accountId==='string'&&s.accountId&&['playerId','worldId'].every(k=>typeof s[k]==='string'&&/^[1-9][0-9]{0,18}$/.test(s[k])&&BigInt(s[k])<(1n<<63n))&&s.battleMode==='MAINLINE_CHALLENGE';
  if(!validScope(before.scope)||!validScope(after.scope)||['accountId','playerId','worldId','battleMode'].some(k=>before.scope[k]!==after.scope[k]))return blocked('账号、角色、世界或战斗模式不一致');
  if(!Number.isSafeInteger(before.stage)||before.stage<1||before.stage!==after.stage)return blocked('关卡不同，不能作为同关卡比较');
  const valid=row=>row.analysis?.status==='ANALYZED'&&row.analysis.playerSide==='LEFT'&&row.analysis.stage===row.stage&&['SUCCESS','FAILED'].includes(row.outcome)&&row.analysis.outcome===row.outcome;
  if(!valid(before)||!valid(after))return blocked('战报缺少明确主线阵营、关卡或胜负');
  const count=value=>typeof value==='string'&&/^(0|[1-9][0-9]{0,39})$/.test(value)?BigInt(value):typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?BigInt(value):null;
  const position=p=>p&&Number.isSafeInteger(p.x)&&Number.isSafeInteger(p.y)&&p.x>=0&&p.y>=0?{x:p.x,y:p.y}:null;
  const metrics=report=>{
    const members=report.leftTeam?.members,damage=report.leftHeroDamages;
    if(!Array.isArray(members)||!members.length||members.some(r=>typeof r?.heroId!=='string'||!r.heroId||!position(r.pos))||new Set(members.map(r=>r.heroId)).size!==members.length)return null;
    const complete=Array.isArray(damage)&&damage.length===members.length&&new Set(damage.map(r=>r?.heroId)).size===damage.length&&damage.every(r=>members.some(m=>m.heroId===r?.heroId));
    return members.map(member=>{
      const matches=Array.isArray(damage)?damage.filter(r=>r?.heroId===member.heroId):[],row=matches.length===1?matches[0]:null;
      const samePosition=complete&&row&&position(row.pos)&&row.pos.x===member.pos.x&&row.pos.y===member.pos.y;
      return {heroId:member.heroId,pos:position(member.pos),damage:samePosition?count(row.damage)?.toString()??null:null,hp:samePosition?count(row.leftHp)?.toString()??null:null};
    });
  };
  const a=metrics(before.analysis),b=metrics(after.analysis),delta=(x,y)=>count(x)!==null&&count(y)!==null?(count(y)-count(x)).toString():null;
  const total=(rows,key)=>rows&&rows.every(r=>r[key]!==null)?rows.reduce((sum,r)=>sum+BigInt(r[key]),0n).toString():null;
  const ids=[...new Set([...(a??[]).map(r=>r.heroId),...(b??[]).map(r=>r.heroId)])].sort();
  const heroes=ids.map(heroId=>{const left=a?.find(r=>r.heroId===heroId)??null,right=b?.find(r=>r.heroId===heroId)??null;return {heroId,before:left,after:right,damageDelta:delta(left?.damage,right?.damage),hpDelta:delta(left?.hp,right?.hp)};});
  const damageBefore=total(a,'damage'),damageAfter=total(b,'damage');
  return {status:'COMPARED',stage:before.stage,before:{reportId:before.reportId,outcome:before.outcome},after:{reportId:after.reportId,outcome:after.outcome},damage:{before:damageBefore,after:damageAfter,delta:delta(damageBefore,damageAfter)},heroes,
    gaps:[...(!a||!b?['参战队伍身份或站位不完整']:[]),...(damageBefore===null||damageAfter===null?['伤害统计缺失或不能精确对应参战英雄']:[])],automaticSwitch:false,resumeAllowed:false,
    limitation:'仅记录两次已观察到的差异；阵容、对手、随机及成长变化均可能影响结果，不能证明改阵因果或保证后续胜利。'};
}