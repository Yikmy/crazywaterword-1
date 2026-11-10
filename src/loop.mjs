// Existing fixed loop: task rewards -> daily actions -> world actions.
// Every await and phase boundary observes cancellation. UNKNOWN ends the run.
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
