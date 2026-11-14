// Existing fixed loop: task rewards -> daily actions -> world actions.
// Every await and phase boundary observes cancellation. UNKNOWN ends the run.
import { validateWorkflow } from './workflow.mjs';
import { validateTaskRewardsParameters } from './task-rewards.mjs';
import { museumStartExploreSelection } from './museum.mjs';
import { allianceOrderSelection } from './alliance.mjs';
import { validateMailParameters } from './mail.mjs';
import { validatePirateSweepParameters } from './pirate-operations.mjs';
import { validateAfkLevelRewardsParameters } from './afk-level-rewards.mjs';
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
  exact(input,['entry','id','name','tasks','dailies','world','rounds','everyMs','budget','runPolicy']);
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
      // A named wait is compiled into the existing WAIT node; its native contract is validated below.
      if(row?.type==='WAIT'){
        exact(row,['type','cooldown']);if(!Object.hasOwn(row,'cooldown'))invalid('统一等待须明确具名冷却来源及等待上限');
        steps.push({type:'WAIT',phase,index,cooldown:structuredClone(row.cooldown)});continue;
      }
      // Explicit observation reuses the native survey; no plan, selection or claim is generated.
      if(['tasks','dailies'].includes(phase)&&row?.action==='observe'){
        exact(row,phase==='tasks'?['kind','taskId','action']:['taskId','action']);
        const kind=phase==='tasks'?row.kind:'daily';
        if(!['main','branch','achievement','daily'].includes(kind))invalid('只读任务观察仅支持明确主线、支线、成就或每日任务');
        try{parameters=validateTaskRewardsParameters({kind,taskId:row.taskId});}catch{invalid('只读任务观察须明确正int32任务ID');}
        steps.push({type:'SURVEY',phase,index,module:'task-rewards',parameters});continue;
      }
      if(phase==='tasks'&&row?.kind==='afk-level-reward'){
        exact(row,['kind','level']);
        try{parameters=validateAfkLevelRewardsParameters({level:row.level});}catch{invalid('Tasks挂机等级奖励须明确正int32等级');}
        steps.push({phase,index,module:'afk-level-rewards',parameters,selection});continue;
      }
      if(phase==='tasks'&&row?.kind==='mail-enumeration'){
        exact(row,['kind','maxPages']);
        if(!Object.hasOwn(row,'maxPages'))invalid('邮箱枚举须明确1至100页的上限');
        try{parameters=validateMailParameters({action:'enumerate',maxPages:row.maxPages});}catch{invalid('邮箱枚举须明确1至100页的上限');}
        steps.push({type:'SURVEY',phase,index,module:'mail',parameters});continue;
      }
      if(phase==='tasks'&&row?.kind==='mail'){
        exact(row,['kind','pageNo','emailId','action']);
        if(!['claim','read'].includes(row.action))invalid('Tasks邮件仅支持明确单封claim/read');
        try{parameters=validateMailParameters({pageNo:row.pageNo,emailId:row.emailId,action:row.action});}catch{invalid('Tasks邮件须明确来源页和精确正int64邮件ID');}
        steps.push({phase,index,module:'mail',parameters,selection});continue;
      }
      if(['tasks','dailies'].includes(phase)&&row?.kind==='weekly-chip-task'){
        exact(row,phase==='tasks'?['kind','round','taskId']:['kind','round','taskId','action']);
        if(!['round','taskId'].every(k=>Number.isSafeInteger(row[k])&&row[k]>=1&&row[k]<=2147483647)||phase==='dailies'&&row.action!=='claim')invalid('周芯片任务须明确当前轮次、任务ID及日常action=claim');
        steps.push({phase,index,module:'task-rewards',parameters:{kind:row.kind,round:row.round,taskId:row.taskId},selection});continue;
      }
      if(phase==='tasks'){
        if(['daily-gift','weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift'].includes(row?.kind)){
          exact(row,['kind','packId']);if(row.packId!==(row.kind==='daily-gift'?'赠礼':'1000'))invalid('仅允许明确固定免费礼包');
          module='task-rewards';parameters={kind:row.kind,packId:row.packId};
        }else if(row?.kind==='daily-activity'){
          exact(row,['kind','tierId']);
          if(!Number.isSafeInteger(row.tierId)||row.tierId<1||row.tierId>2147483647)invalid('日活跃领奖需要精确档位ID');
          module='task-rewards';parameters={kind:'daily-activity',tierId:row.tierId};
        }else{
          exact(row,['kind','taskId']);
          if(!Number.isSafeInteger(row.taskId)||row.taskId<1)invalid('Tasks 需要精确任务ID');
          if(row.kind==='orderDaily'){blocked.push({phase,index,reason:'DAILY_ORDER_CONTRACT_UNVERIFIED',taskId:row.taskId});continue;}
          if(!['main','branch','achievement','daily'].includes(row.kind))invalid('任务种类无效');
          module='task-rewards';parameters={kind:row.kind,taskId:row.taskId};
        }
      } else if(phase==='dailies'){
        const activity=row?.kind==='daily-activity',gift=['daily-gift','weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift'].includes(row?.kind);
        exact(row,gift?['kind','packId','parameters','action']:activity?['kind','tierId','parameters','action']:['taskId','parameters','action']);
        if(gift){if(row.packId!==(row.kind==='daily-gift'?'赠礼':'1000')||row.action!=='claim')invalid('免费礼包须明确固定packId与action=claim');}
        else if(activity){
          if(row.action!=='claim'||!Number.isSafeInteger(row.tierId)||row.tierId<1||row.tierId>2147483647)invalid('日活跃宝箱仅允许明确action=claim与精确档位ID');
        }else if(!Number.isSafeInteger(row.taskId)||row.taskId<1)invalid('Dailies 需要精确任务ID');
        if(Object.hasOwn(row,'action')&&!['perform','claim'].includes(row.action))invalid('Dailies action 只允许 perform 或 claim');
        if(row.action==='claim'){
          if(Object.hasOwn(row,'parameters')&&(!object(row.parameters)||![Object.prototype,null].includes(Object.getPrototypeOf(row.parameters))||Reflect.ownKeys(row.parameters).length))invalid('日常领奖仅使用明确任务或档位ID，不接受驱动或协议参数');
          module='task-rewards';parameters=gift?{kind:row.kind,packId:row.packId}:activity?{kind:'daily-activity',tierId:row.tierId}:{kind:'daily',taskId:row.taskId};
        }else{
          module=({1002:'free-recruit',1003:'stage',1006:'free-gold',1009:'trial-challenge',1010:'pirate-sweep',1012:'alliance',1016:'museum'})[row.taskId];
          if(!module){blocked.push({phase,index,reason:'DAILY_ACTION_CONTRACT_UNVERIFIED',taskId:row.taskId});continue;}
          parameters=row.parameters??{};
          if(module==='alliance')try{selection=allianceOrderSelection(parameters);}catch{invalid('日常1012仅支持明确城市的联盟订单');}
          if(module==='museum')try{selection=museumStartExploreSelection(parameters);}catch{invalid('日常1016仅支持明确关卡、英雄队伍及时间倍率的探险出发');}
          if(module==='pirate-sweep'){
            const hasUid=object(parameters)&&Object.hasOwn(parameters,'uid'),hasCity=object(parameters)&&Object.hasOwn(parameters,'cityId');
            // Validate any supplied half with the original domain schema. The probe
            // only checks its type/range; it is never compiled or used as a target.
            let probe=parameters;
            if(hasUid!==hasCity){
              probe=Object.create(Object.getPrototypeOf(parameters),Object.getOwnPropertyDescriptors(parameters));
              Object.defineProperty(probe,hasUid?'cityId':'uid',{value:Object.getOwnPropertyDescriptor(parameters,hasUid?'uid':'cityId').value,enumerable:true});
            }
            validatePirateSweepParameters(probe);
            if(!hasUid||!hasCity){blocked.push({phase,index,reason:'EXACT_PIRATE_TARGET_REQUIRED',taskId:row.taskId});continue;}
          }
        }
      } else {
        exact(row,['type','module','parameters','selection']);module=row.module;parameters=row.parameters??{};
        if(Object.hasOwn(row,'type')&&!['SURVEY','ACTION'].includes(row.type))invalid('Loop其他玩法仅接受SURVEY或ACTION');
        if(row.type==='SURVEY'){
          if(Object.hasOwn(row,'parameters')&&(!object(row.parameters)||Array.isArray(row.parameters)))invalid('只读SURVEY业务参数须为对象');
          if(Object.hasOwn(row,'selection'))invalid('只读SURVEY不接受动作选择');
          if(module==='mail'&&parameters.action==='enumerate'&&!Object.hasOwn(parameters,'maxPages'))invalid('邮箱枚举须明确1至100页的上限');
          steps.push({type:'SURVEY',phase,index,module,parameters});continue;
        }
        selection=row.selection??selection;
      }
      steps.push({phase,index,module,parameters,selection});
    }
  }
  const nodes=[{id:'start',type:'START'}],edges=[];
  const add=node=>{edges.push({from:nodes.at(-1).id,to:node.id});nodes.push(node);};
  for(let round=1;round<=rounds;round++){
    if(round>1&&everyMs)add({id:'wait-'+round,type:'WAIT',durationMs:everyMs});
    for(const step of steps)add({id:step.phase+'-'+step.index+'-'+round,type:step.type??'ACTION',label:step.phase+' '+round+' / '+(step.index+1),...(step.type==='WAIT'?{cooldown:structuredClone(step.cooldown)}:{module:step.module,parameters:step.parameters,...(step.type==='SURVEY'?{}:{selection:step.selection})})});
  }
  add({id:'stop',type:'STOP'});
  const graph={version:1,id:input.id??('unified-'+input.entry),name:input.name??('Unified '+input.entry),nodes,edges,budget:input.budget,...(Object.hasOwn(input,'runPolicy')?{runPolicy:input.runPolicy}:{}),preparation:{entry:input.entry,blocked:structuredClone(blocked)}};
  const validated=validateWorkflow(graph,{modules}).workflow;
  return {entry:input.entry,graph:steps.length?validated:null,blocked};
}
