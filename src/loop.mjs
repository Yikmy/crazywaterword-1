// Existing fixed loop: task rewards -> daily actions -> world actions.
// Every await and phase boundary observes cancellation. UNKNOWN ends the run.
import { validateStageFunctionParameters } from './stage-function.mjs';
import { validateTrialChallengeParameters } from './trial-challenge.mjs';
import { validateFreeRecruitParameters } from './free-recruit.mjs';
import { validateFreeGoldParameters } from './free-gold.mjs';
import { residentOrderSelection } from './order-execution.mjs';
import { validateCompassWheelParameters } from './compass-wheel.mjs';
import { validateWorkflow } from './workflow.mjs';
import { validateFunctionParameters } from './function-contracts.mjs';
import { validateTaskRewardsParameters, OPEN_RANK_TASK_KINDS } from './task-rewards.mjs';
import { museumStartExploreSelection } from './museum.mjs';
import { allianceOrderSelection } from './alliance.mjs';
import { fleetCargoFillSelection } from './fleet.mjs';
import { validateMailParameters } from './mail.mjs';
import { validatePirateSweepParameters } from './pirate-operations.mjs';
import { validateAfkLevelRewardsParameters } from './afk-level-rewards.mjs';
import { surveyTasks, runTasks } from './tasks.mjs';
import { DAILY_DRIVERS, surveyDailies, runDailies } from './dailies.mjs';
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
    const entry = results.find(row => stopsExecution(row) || row.code === 'AUTHORIZATION_REQUIRED');
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
      // The daily-order counter is account observation, not a task/reward ID.
      // Keep the legacy claim below blocked; only the explicit read intent maps
      // to the existing Orders Function and its unchanged survey contract.
      if(phase==='tasks'&&row?.kind==='orderDaily'&&row.action==='observe'){
        exact(row,['kind','action']);
        steps.push({type:'SURVEY',phase,index,module:'orders',parameters:{}});continue;
      }
      // Explicit observation reuses the native survey; no plan, selection or claim is generated.
      if(['tasks','dailies'].includes(phase)&&row?.action==='observe'){
        try {
          const descriptors=Object.getOwnPropertyDescriptors(row);delete descriptors.action;
          const target=Object.create(Object.getPrototypeOf(row),descriptors);
          if(phase==='dailies'&&!Object.hasOwn(target,'kind'))target.kind='daily';
          parameters=validateTaskRewardsParameters(target);
          if(!Object.hasOwn(parameters,'kind')||phase==='dailies'&&['main','branch','achievement'].includes(parameters.kind))invalid('该分组不支持此任务观察');
        }catch{invalid('只读观察须使用原任务Function的明确完整目标');}
        steps.push({type:'SURVEY',phase,index,module:'task-rewards',parameters});continue;
      }
      if(['tasks','dailies'].includes(phase)&&row?.kind==='month-card-gift'){exact(row,phase==='tasks'?['kind','cardType']:['kind','cardType','action']);if(![1,2].includes(row.cardType)||phase==='dailies'&&row.action!=='claim')invalid('月卡权益须明确cardType=1/2及日常claim，不购买或推定周期');parameters=validateTaskRewardsParameters({kind:row.kind,cardType:row.cardType});steps.push({phase,index,module:'task-rewards',parameters,selection});continue;}
      // Original professional candidates may be ordered with task rewards.
      // Keep the exact candidate instead of widening it to a unique/future target.
      if (phase === 'tasks' && ['city','production','heroes','equipment-growth','badge-growth','antique-growth','pet','formation-unlock','equipment-forge','material-packs','fleet','alliance','trade','treasure','farm','formation'].includes(row?.kind)) {
        const keys = ['kind','parameters','actionId'];
        if (!object(row) || Reflect.ownKeys(row).length !== keys.length || keys.some(key => {
          const d = Object.getOwnPropertyDescriptor(row, key);
          return !d?.enumerable || !Object.hasOwn(d, 'value');
        })) invalid('Tasks业务须明确原kind、parameters及精确候选actionId');
        module = row.kind;
        const adapter = modules instanceof Map ? modules.get(module) : modules?.[module];
        if (adapter?.contractVersion !== 1) invalid('Tasks业务必须使用已注册的原Function合同');
        if (typeof row.actionId !== 'string' || !row.actionId.trim() || row.actionId.trim() !== row.actionId || row.actionId.length > 1000) invalid('Tasks业务须保留完整精确候选actionId');
        try { parameters = validateFunctionParameters(module, adapter, row.parameters); }
        catch { invalid('Tasks业务参数不符合原Function合同'); }
        steps.push({phase,index,module,parameters,selection:{actionId:row.actionId}});
        continue;
      }
      if(phase==='tasks'&&row?.kind==='resident-order'){
        exact(row,['kind','actionId']);
        try{selection=residentOrderSelection(row.actionId);}catch{invalid('Tasks居民订单须明确原SUBMIT候选actionId，不接受刷新或替换目标');}
        steps.push({phase,index,module:'orders',parameters:{},selection});continue;
      }
      if (phase === 'tasks' && row?.kind === 'compass-wheel') {
        exact(row, ['kind', 'parameters', 'actionId']);
        try {
          parameters = validateCompassWheelParameters(row.parameters);
          if (!parameters.activityId || typeof row.actionId !== 'string' || !/^compass-wheel:[a-f0-9]{64}$/.test(row.actionId)) {
            throw Error('缺少明确抽取目标');
          }
        } catch {
          invalid('Tasks罗盘须明确原活动、原抽取次数或累计领奖范围和当前候选actionId');
        }
        steps.push({phase, index, module:'compass-wheel', parameters, selection:{actionId:row.actionId}});
        continue;
      }
      if(phase==='tasks'&&row?.kind==='free-recruit'){
        exact(row,['kind','parameters']);if(!Object.hasOwn(row,'parameters')||!object(row.parameters))invalid('Tasks招募须明确原Function业务参数，免费单次使用空对象');
        try{parameters=validateFreeRecruitParameters(row.parameters);}catch{invalid('Tasks招募仅支持明确英雄或古董、免费单次及自有1/10/50券的原参数');}
        steps.push({phase,index,module:'free-recruit',parameters,selection});continue;
      }
      if(phase==='tasks'&&['cargo-fill','alliance-order','museum','pirate-sweep'].includes(row?.kind)){
        exact(row,['kind','parameters']);if(!Object.hasOwn(row,'parameters')||!object(row.parameters))invalid('Tasks业务须明确原Function parameters，不推断目标');
        parameters=row.parameters;
        try{
          if(row.kind==='cargo-fill'){module='fleet';selection=fleetCargoFillSelection(parameters);}
          else if(row.kind==='alliance-order'){exact(parameters,['cityId']);module='alliance';selection=allianceOrderSelection(parameters);}
          else if(row.kind==='museum'){exact(parameters,['stageId','heroIds','factor']);module='museum';selection=museumStartExploreSelection(parameters);}
          else {module='pirate-sweep';parameters=validatePirateSweepParameters(parameters);if(!Object.hasOwn(parameters,'uid')||!Object.hasOwn(parameters,'cityId'))invalid('需要明确海盗UID和城市');}
        }catch{invalid('Tasks仅支持明确单格装货、单城市联盟订单、固定队伍倍率探险出发或单目标普通扫荡的原参数');}
        steps.push({phase,index,module,parameters,selection});continue;
      }
      if(phase==='tasks'&&row?.kind==='stage'){
        exact(row,['kind','parameters']);if(!Object.hasOwn(row,'parameters')||!object(row.parameters))invalid('Tasks主线须明确原Stage Function有限config参数');
        try{parameters=validateStageFunctionParameters(row.parameters);if(!parameters)invalid('需要明确有限config');}catch{invalid('Tasks主线仅接受原有限config及可选expectedStage，不接受协议、付费或无限重试');}
        steps.push({phase,index,module:'stage',parameters,selection});continue;
      }
      if(phase==='tasks'&&row?.kind==='trial-challenge'){
        exact(row,['kind','parameters']);if(!Object.hasOwn(row,'parameters')||!object(row.parameters))invalid('Tasks试炼须明确原Function参数和raidId=1/2/3');
        try{parameters=validateTrialChallengeParameters(row.parameters);if(!Object.hasOwn(parameters,'raidId'))invalid('需要明确副本');}catch{invalid('Tasks试炼仅接受明确raidId=1/2/3及可选下一关stageId，禁止扫荡、购买和广告');}
        steps.push({phase,index,module:'trial-challenge',parameters,selection});continue;
      }
      if(phase==='tasks'&&row?.kind==='free-gold'){
        exact(row,['kind','parameters']);if(!Object.hasOwn(row,'parameters')||!object(row.parameters))invalid('Tasks点金须明确原Function参数；普通免费单次使用空对象');
        try{parameters=validateFreeGoldParameters(row.parameters);}catch{invalid('Tasks点金仅接受原免费单次及完整expectedGold状态，禁止付费或自定义次数');}
        steps.push({phase,index,module:'free-gold',parameters,selection});continue;
      }
      if(phase==='tasks'&&row?.kind==='afk-income'){
        exact(row,['kind','level','afkStartTime','afkFinishTime']);
        try{parameters=validateAfkLevelRewardsParameters({action:'income',level:row.level,afkStartTime:row.afkStartTime,afkFinishTime:row.afkFinishTime});}catch{invalid('Tasks普通挂机收益须明确等级和完整区间');}
        steps.push({phase,index,module:'afk-level-rewards',parameters,selection});continue;
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
        exact(row,['kind','pageNo','emailId','action','expectedMailHash']);
        if(!['claim','read'].includes(row.action))invalid('Tasks邮件仅支持明确单封claim/read');
        try{parameters=validateMailParameters({pageNo:row.pageNo,emailId:row.emailId,action:row.action,...(Object.hasOwn(row,'expectedMailHash')?{expectedMailHash:row.expectedMailHash}:{})});}catch{invalid('Tasks邮件须明确来源页和精确正int64邮件ID');}
        steps.push({phase,index,module:'mail',parameters,selection});continue;
      }
      if(['tasks','dailies'].includes(phase)&&OPEN_RANK_TASK_KINDS.includes(row?.kind)){
        exact(row,phase==='tasks'?['kind','tierId']:['kind','tierId','action']);
        if(!Number.isSafeInteger(row.tierId)||row.tierId<1||row.tierId>2147483647||phase==='dailies'&&row.action!=='claim')invalid('开服任务须明确种类和score档位tierId及日常action=claim');
        steps.push({phase,index,module:'task-rewards',parameters:{kind:row.kind,tierId:row.tierId},selection});continue;
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
          exact(row,['kind','tierId','expectedResetTime']);
          if(!Number.isSafeInteger(row.tierId)||row.tierId<1||row.tierId>2147483647)invalid('日活跃领奖需要精确档位ID');
          module='task-rewards';parameters=validateTaskRewardsParameters({kind:'daily-activity',tierId:row.tierId,...(Object.hasOwn(row,'expectedResetTime')?{expectedResetTime:row.expectedResetTime}:{})});
        }else{
          exact(row,['kind','taskId','expectedResetTime']);
          if(Object.hasOwn(row,'expectedResetTime')&&row.kind!=='daily')invalid('原重置标记仅用于日常领奖');
          if(!Number.isSafeInteger(row.taskId)||row.taskId<1)invalid('Tasks 需要精确任务ID');
          if(row.kind==='orderDaily'){blocked.push({phase,index,reason:'DAILY_ORDER_CONTRACT_UNVERIFIED',taskId:row.taskId});continue;}
          if(!['main','branch','achievement','daily'].includes(row.kind))invalid('任务种类无效');
          module='task-rewards';parameters=validateTaskRewardsParameters({kind:row.kind,taskId:row.taskId,...(Object.hasOwn(row,'expectedResetTime')?{expectedResetTime:row.expectedResetTime}:{})});
        }
      } else if(phase==='dailies'){
        const activity=row?.kind==='daily-activity',gift=['daily-gift','weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift'].includes(row?.kind);
        exact(row,gift?['kind','packId','parameters','action']:activity?['kind','tierId','parameters','action','expectedResetTime']:['taskId','parameters','action','expectedResetTime']);
        if(Object.hasOwn(row,'expectedResetTime')&&(gift||row.action!=='claim'))invalid('原重置标记仅用于日常任务或日活跃领奖');
        if(gift){if(row.packId!==(row.kind==='daily-gift'?'赠礼':'1000')||row.action!=='claim')invalid('免费礼包须明确固定packId与action=claim');}
        else if(activity){
          if(row.action!=='claim'||!Number.isSafeInteger(row.tierId)||row.tierId<1||row.tierId>2147483647)invalid('日活跃宝箱仅允许明确action=claim与精确档位ID');
        }else if(!Number.isSafeInteger(row.taskId)||row.taskId<1)invalid('Dailies 需要精确任务ID');
        if(Object.hasOwn(row,'action')&&!['perform','claim'].includes(row.action))invalid('Dailies action 只允许 perform 或 claim');
        if(row.action==='claim'){
          if(Object.hasOwn(row,'parameters')&&(!object(row.parameters)||![Object.prototype,null].includes(Object.getPrototypeOf(row.parameters))||Reflect.ownKeys(row.parameters).length))invalid('日常领奖仅使用明确任务或档位ID，不接受驱动或协议参数');
          module='task-rewards';parameters=validateTaskRewardsParameters(gift?{kind:row.kind,packId:row.packId}:{kind:activity?'daily-activity':'daily',...(activity?{tierId:row.tierId}:{taskId:row.taskId}),...(Object.hasOwn(row,'expectedResetTime')?{expectedResetTime:row.expectedResetTime}:{})});
        }else{
          // Preserve legacy missing-target declarations as blocked; never infer today's interval.
          if(row.taskId===1004&&!Object.hasOwn(row,'parameters')){blocked.push({phase,index,reason:'DAILY_ACTION_CONTRACT_UNVERIFIED',taskId:row.taskId});continue;}
          module=Object.hasOwn(DAILY_DRIVERS,row.taskId)?DAILY_DRIVERS[row.taskId].functionId:null;
          if(!module){blocked.push({phase,index,reason:'DAILY_ACTION_CONTRACT_UNVERIFIED',taskId:row.taskId});continue;}
          parameters=row.parameters??{};
          if(module==='trial-challenge')parameters=validateTrialChallengeParameters(parameters);
          if(module==='free-recruit'){parameters=validateFreeRecruitParameters(parameters);if(parameters.recruit==='antique')invalid('日常1002仅代表英雄招募，古董请用原Workflow独立ACTION');}
          if(module==='afk-level-rewards')try{parameters=validateAfkLevelRewardsParameters(row.parameters);if(parameters.action!=='income')invalid('必须明确income');}catch{invalid('日常1004普通挂机收益须明确action=income、当前等级和完整区间');}
          if(module==='fleet')try{selection=fleetCargoFillSelection(parameters);}catch{invalid('日常1008仅支持明确货轮和货格的单次装货；任务进度需独立观察');}
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
