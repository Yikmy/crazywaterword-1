// Existing fixed loop: task rewards -> daily actions -> world actions.
// Every await and phase boundary observes cancellation. UNKNOWN ends the run.
import { validateWorkflow } from './workflow.mjs';
import { surveyTasks, runTasks } from './tasks.mjs';
import { surveyDailies, runDailies } from './dailies.mjs';
import { surveyWorld, planWorld, runWorld } from './world.mjs';
import { assertExecutionActive, awaitExecution, executionDelay, executionOutcome, stopsExecution } from './execution.mjs';

export async function runLoop(client, protocol, {
  config = null, player = null, rounds = 1, everyMs = 60_000,
  allowMutate = false, allowPaid = false, allowSpeedUp = false, allowReroll = false,
  sleep, stop = { aborted: false }, signal, onRound, onStep,
} = {}) {
  if (!allowMutate) throw new Error('循环会持续改变账号状态，需要 --yes');
  if (!Number.isSafeInteger(rounds) || !Number.isFinite(everyMs) || everyMs < 0) throw new Error('循环次数和间隔无效');
  const rejected = { tasks: new Set(), dailies: new Set(), world: new Set() };
  const history = [];
  const options = { signal, stop };
  const total = rounds > 0 ? rounds : Infinity;
  let status = 'SUCCESS';
  let error = null;
  const active = () => assertExecutionActive(client, options);
  const observe = (task) => awaitExecution(task, client, options);
  const halted = (results) => {
    const entry = results.find(stopsExecution);
    if (!entry) return false;
    status = entry.status;
    error = entry.error ?? entry.reason ?? '执行结果未确认，已停止后续操作';
    return true;
  };

  for (let round = 1; round <= total; round += 1) {
    const summary = {
      round, startedAt: Math.floor(Date.now() / 1000),
      tasks: { planned: 0, results: [] }, dailies: { planned: 0, results: [] },
      world: { planned: 0, results: [], notes: [], population: '?' },
    };
    try {
      active();
      const tasksSurvey = await observe(surveyTasks(client, protocol, { config, ...options }));
      active();
      summary.tasks.planned = tasksSurvey.plan.length;
      if (tasksSurvey.plan.length) {
        summary.tasks.results = await observe(runTasks(client, protocol, tasksSurvey, {
          allowMutate, rejected: rejected.tasks, ...options,
          onStep: (entry) => onStep?.({ round, phase: 'tasks', ...entry }),
        }));
      }
      if (!halted(summary.tasks.results)) {
        active();
        const dailySurvey = await observe(surveyDailies(client, protocol, { config, player, ...options }));
        active();
        summary.dailies.planned = dailySurvey.tasks.reduce((sum, entry) => sum + (entry.actions ?? []).length, 0)
          + (dailySurvey.chests?.actions.length ?? 0) + (dailySurvey.gift?.actions.length ?? 0);
        if (summary.dailies.planned) {
          summary.dailies.results = await observe(runDailies(client, protocol, dailySurvey, {
            config, player, allowMutate, allowPaid, rejected: rejected.dailies, ...options,
            onStep: (entry) => onStep?.({ round, phase: 'dailies', ...entry }),
          }));
        }
        if (!halted(summary.dailies.results)) {
          active();
          const worldSurvey = await observe(surveyWorld(client, protocol, { config, player, ...options }));
          active();
          const worldPlan = planWorld(worldSurvey, { config, allowSpeedUp, allowReroll });
          summary.world = {
            planned: worldPlan.actions.length, notes: [...worldSurvey.notes, ...worldPlan.notes],
            population: `${worldSurvey.population}/${worldSurvey.maxPopulation}`, results: [],
          };
          if (worldPlan.actions.length) {
            const result = await observe(runWorld(client, protocol, worldPlan, {
              allowMutate, rejected: rejected.world, ...options,
              onStep: (entry) => onStep?.({ round, phase: 'world', ...entry }),
            }));
            summary.world.results = result.results;
          }
          halted(summary.world.results);
        }
      }
      active();
    } catch (failure) {
      status = executionOutcome(failure);
      error = failure.message;
    }
    summary.status = status;
    summary.error = error;
    summary.finishedAt = Math.floor(Date.now() / 1000);
    history.push(summary);
    onRound?.(summary);
    if (status !== 'SUCCESS') break;
    if (round < total) {
      try {
        active();
        await executionDelay(everyMs, { ...options, sleep });
        active();
      } catch (failure) {
        status = executionOutcome(failure);
        error = failure.message;
        break;
      }
    }
  }
  return { history, rejected, status, error };
}

export function formatLoopRound(summary) {
  const line = (name, part) => {
    const results = part?.results ?? [];
    const ok = results.filter((entry) => entry.ok === true).length;
    const failed = results.filter((entry) => entry.ok === false && !entry.skipped && entry.status !== 'CANCELLED').length;
    const unknown = results.filter((entry) => entry.status === 'UNKNOWN').length;
    return `  ${name} 计划 ${part?.planned ?? 0}，成功 ${ok}，失败 ${failed}，未知 ${unknown}`;
  };
  return [
    `第 ${summary.round} 轮（${summary.status ?? 'SUCCESS'}）`,
    line('任务', summary.tasks), line('日常', summary.dailies),
    `${line('海面', summary.world)}  人口 ${summary.world?.population ?? '?'}`,
  ].join('\n');
}

// Compile legacy entry intents into the existing runner. This function is pure:
// it never surveys, connects, authorizes, schedules or dispatches a game request.
export function compileUnifiedExecution(input, { modules } = {}) {
  const invalid = message => { throw Object.assign(new Error(message), { code:'WORKFLOW_INVALID',statusCode:400 }); };
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const exact = (value,keys) => { if(!object(value)||Object.keys(value).some(key=>!keys.includes(key))) invalid('统一执行声明包含未知字段'); };
  exact(input,['entry','id','name','tasks','dailies','world','rounds','everyMs','budget']);
  if(!['tasks','dailies','loop'].includes(input.entry))invalid('需要 Tasks、Dailies 或 Loop 入口');
  const rounds=input.rounds===undefined?1:input.rounds,everyMs=input.everyMs===undefined?0:input.everyMs;
  if(!Number.isSafeInteger(rounds)||rounds<1||rounds>48||!Number.isSafeInteger(everyMs)||everyMs<0||everyMs>60000)invalid('统一循环必须有限且间隔不超过60000毫秒');
  if(input.entry!=='loop'&&(rounds!==1||everyMs!==0))invalid('只有 Loop 接受多轮与间隔');
  if(!object(input.budget))invalid('统一执行必须声明父级资源、配额及UID预算');
  const phases={tasks:input.tasks===undefined?[]:input.tasks,dailies:input.dailies===undefined?[]:input.dailies,world:input.world===undefined?[]:input.world},steps=[],blocked=[];
  for(const [phase,rows] of Object.entries(phases)){
    if(!Array.isArray(rows)||rows.length>48)invalid('入口步骤列表无效');
    if(input.entry!=='loop'&&phase!==input.entry&&rows.length)invalid('入口与业务阶段不匹配');
    for(const [index,row] of rows.entries()){
      let module,parameters,selection={unique:true};
      if(phase==='tasks'){
        exact(row,['kind','taskId']);
        if(!Number.isSafeInteger(row.taskId)||row.taskId<1)invalid('Tasks 需要精确任务ID');
        if(row.kind==='orderDaily'){blocked.push({phase,index,reason:'DAILY_ORDER_CONTRACT_UNVERIFIED'});continue;}
        if(!['main','branch','achievement','daily'].includes(row.kind))invalid('任务种类无效');
        module='task-rewards';parameters={kind:row.kind,taskId:row.taskId};
      } else if(phase==='dailies'){
        exact(row,['taskId','parameters']);
        if(!Number.isSafeInteger(row.taskId)||row.taskId<1)invalid('Dailies 需要精确任务ID');
        module=({1002:'free-recruit',1006:'free-gold',1009:'trial-challenge',1010:'pirate-sweep'})[row.taskId];
        if(!module){blocked.push({phase,index,reason:'DAILY_ACTION_CONTRACT_UNVERIFIED',taskId:row.taskId});continue;}
        parameters=row.parameters??{};
        if(module==='pirate-sweep'&&(!Number.isSafeInteger(parameters.uid)||parameters.uid<1)){blocked.push({phase,index,reason:'EXACT_PIRATE_TARGET_REQUIRED',taskId:row.taskId});continue;}
      } else {
        exact(row,['module','parameters','selection']);module=row.module;parameters=row.parameters??{};selection=row.selection??selection;
      }
      steps.push({phase,index,module,parameters,selection});
    }
  }
  const nodes=[{id:'start',type:'START'}],edges=[];
  const add=node=>{edges.push({from:nodes.at(-1).id,to:node.id});nodes.push(node);};
  for(let round=1;round<=rounds;round++){
    if(round>1&&everyMs)add({id:'wait-'+round,type:'WAIT',durationMs:everyMs});
    for(const step of steps)add({id:step.phase+'-'+step.index+'-'+round,type:'ACTION',label:step.phase+' '+round+' / '+(step.index+1),module:step.module,parameters:step.parameters,selection:step.selection});
  }
  add({id:'stop',type:'STOP'});
  const graph={version:1,id:input.id??('unified-'+input.entry),name:input.name??('Unified '+input.entry),nodes,edges,budget:input.budget};
  const validated=validateWorkflow(graph,{modules}).workflow;
  return {entry:input.entry,graph:steps.length?validated:null,blocked};
}
