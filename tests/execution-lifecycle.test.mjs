import assert from 'node:assert/strict';
import test from 'node:test';
import { getEventListeners } from 'node:events';
import { runTasks, surveyTasks, nextOrderTier, formatTaskPlan } from '../src/tasks.mjs';
import { runLoop, formatLoopRound } from '../src/loop.mjs';
import { awaitExecution, executionDelay } from '../src/execution.mjs';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const task = (id) => ({ kind: 'main', id, request: 'DrawMainTaskRewardRequest', body: { taskId: id } });
const taskProtocol = { DrawMainTaskRewardRequest: {} };
const config = { tables: { MainTaskCfg: { data: [{ taskId: 1, type: 'fixture', params: [1] }] } } };
function loopFixture({ claimable = false } = {}) {
  const reads = [], writes = [];
  const protocol = { ...taskProtocol };
  for (const name of ['OnWater', 'AllItem', 'AllResource', 'MyResFields', 'MyFleets']) {
    protocol[name + 'Request'] = {}; protocol[name + 'Response'] = {};
  }
  const client = {
    connected: true,
    async request(name) {
      reads.push(name);
      if (name === 'MainTaskInfoRequest') return claimable ? { task: { taskId: 1, progress: 1, rewardClaimed: false } } : {};
      if (name === 'AchievementInfoRequest') return { task: [] };
      if (name === 'DailyTaskInfoRequest') return { dailyTask: [] };
      if (name === 'AllItemRequest') return { items: [] };
      if (name === 'AllResourceRequest') return { list: [] };
      return {};
    },
    async sendWatch(name, body) { writes.push({ name, body }); return { status: 'UNKNOWN' }; },
  };
  return { client, protocol, reads, writes };
}

test('legacy task previews and local rejection sets cannot replace a Service permit', async () => {
  const rejected = new Set(); let sends = 0;
  const client = { async sendWatch() { sends++; throw Object.assign(new Error('server prompt: denied'), { prompt: {} }); } };
  const survey = { plan: [task(1)] };
  const first = await runTasks(client, taskProtocol, survey, { allowMutate: true, rejected });
  const second = await runTasks(client, taskProtocol, survey, { allowMutate: true, rejected });
  assert.equal(first[0].status, 'NOT_EXECUTED'); assert.equal(first[0].code, 'AUTHORIZATION_REQUIRED');
  assert.equal(second[0].status, 'NOT_EXECUTED');
  assert.equal(sends, 0);
});

test('legacy task transport is never reached without the registered permit', async () => {
  for (const timeout of [false, true]) {
    let sends = 0; const rejected = new Set();
    const client = { async sendWatch() { sends++; if (timeout) throw new Error('timeout'); } };
    const results = await runTasks(client, taskProtocol, { plan: [task(1), task(2)] }, { allowMutate: true, rejected });
    assert.equal(results.length, 1); assert.equal(sends, 0);
    assert.equal(results[0].status, 'NOT_EXECUTED'); assert.equal(results[0].code, 'AUTHORIZATION_REQUIRED'); assert.equal(results[0].ok, false);
    assert.equal(rejected.size, 0, 'uncertainty is never stored as a definite rejection');
  }
});

test('missing Service permit ends the legacy loop before daily/world surveys or another round', async () => {
  const env = loopFixture({ claimable: true });
  const result = await runLoop(env.client, env.protocol, { config, allowMutate: true, rounds: 3, everyMs: 0 });
  assert.equal(result.status, 'NOT_EXECUTED'); assert.equal(result.history.length, 1);
  assert.equal(env.writes.length, 0);
  assert.deepEqual(env.reads, ['MainTaskInfoRequest', 'AchievementInfoRequest', 'OnWaterRequest']);
  assert.equal(result.history[0].tasks.results[0].code, 'AUTHORIZATION_REQUIRED'); assert.match(formatLoopRound(result.history[0]), /NOT_EXECUTED/);
});

test('plain stop cancels an in-flight survey promptly; late data cannot start the next query', async () => {
  const waiting = deferred(), entered = deferred();
  const stop = { aborted: false }; const reads = [];
  const client = { connected: true, request(name) { reads.push(name); entered.resolve(); return waiting.promise; } };
  const running = runLoop(client, {}, { allowMutate: true, rounds: 2, stop });
  await entered.promise; stop.aborted = true;
  const result = await running;
  assert.equal(result.status, 'CANCELLED');
  waiting.resolve({}); await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(reads, ['MainTaskInfoRequest']);
});

test('a stop from a step observer cannot dispatch another phase', async () => {
  const env = loopFixture({ claimable: true }); const stop = { aborted: false };
  env.client.sendWatch = async () => { throw Object.assign(new Error('server prompt: denied'), { prompt: {} }); };
  const result = await runLoop(env.client, env.protocol, {
    config, allowMutate: true, rounds: 2, stop, onStep: () => { stop.aborted = true; },
  });
  assert.equal(result.status, 'CANCELLED');
  assert.equal(env.reads.includes('DailyTaskInfoRequest'), false);
});

test('plain stop interrupts the round delay and never starts the next round', async () => {
  const env = loopFixture(); const stop = { aborted: false }; const sleeping = deferred();
  const running = runLoop(env.client, env.protocol, {
    config, allowMutate: true, rounds: 2, everyMs: 60_000, stop,
    sleep: () => { sleeping.resolve(); return new Promise(() => {}); },
  });
  await sleeping.promise; const before = env.reads.length; stop.aborted = true;
  const result = await running;
  assert.equal(result.status, 'CANCELLED'); assert.equal(result.history.length, 1);
  assert.equal(env.reads.length, before); assert.equal(env.writes.length, 0);
});

test('disconnect during a query stops the loop without reconnecting or writing', async () => {
  const reads = [];
  const client = { connected: true, async request(name) { reads.push(name); client.connected = false; return {}; } };
  const result = await runLoop(client, {}, { allowMutate: true, rounds: 2 });
  assert.equal(result.status, 'CANCELLED'); assert.deepEqual(reads, ['MainTaskInfoRequest']);
});

test('completion and abort release execution listeners, including a cancelled delay', async () => {
  const controller = new AbortController();
  assert.equal(await awaitExecution(Promise.resolve(3), null, { signal: controller.signal }), 3);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  const pending = assert.rejects(executionDelay(60_000, { signal: controller.signal }), { code: 'CANCELLED' });
  controller.abort(); await pending;
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('legacy loop cannot turn a local rejection set into a second write chain', async () => {
  const env = loopFixture({ claimable: true }); let sends = 0;
  env.client.sendWatch = async () => { sends++; throw Object.assign(new Error('server prompt: denied'), { prompt: {} }); };
  const result = await runLoop(env.client, env.protocol, { config, allowMutate: true, rounds: 2, everyMs: 0 });
  assert.equal(result.status, 'NOT_EXECUTED'); assert.equal(result.history.length, 1);
  assert.equal(result.history[0].tasks.results[0].status, 'NOT_EXECUTED');
  assert.equal(result.history[0].tasks.results[0].code, 'AUTHORIZATION_REQUIRED');
  assert.equal(sends, 0);
});


test('invalid or missing task progress cannot authorize main, branch or achievement reward writes', async () => {
  for (const progress of [null, undefined, NaN, -1, '']) {
    const client = { async request(name) {
      if (name === 'MainTaskInfoRequest') return { task: { taskId: 1, progress, rewardClaimed: false }, branch: [{ taskId: 1, progress }] };
      if (name === 'AchievementInfoRequest') return { task: [{ id: 1, progress, targetProgress: null, rewardClaimed: false }] };
      return {};
    } };
    const survey = await surveyTasks(client, {}, { config: { tables: {
      MainTaskCfg: config.tables.MainTaskCfg, BranchTaskCfg: config.tables.MainTaskCfg,
    } } });
    assert.deepEqual(survey.plan, []);
    assert.equal(survey.plan.some((step) => step.kind === 'achievement'), false);
  }
});

const dailyTierConfig={tables:{OrderDailyRewardCfg:{data:[{reqNum:6},{reqNum:12},{reqNum:18}]},...config.tables}};
test('order tier math retains exact explicit thresholds for a single unscoped list',()=>{
 const result=nextOrderTier(dailyTierConfig,{orderNum:12,rewardedNum:6});assert.equal(result.status,'CALCULATED');assert.equal(result.tier,12);assert.equal(result.claimable,true);assert.deepEqual(result.reqNums,[6,12,18]);
 assert.equal(nextOrderTier(dailyTierConfig,{orderNum:0,rewardedNum:0}).claimable,false);const done=nextOrderTier(dailyTierConfig,{orderNum:18,rewardedNum:18});assert.equal(done.tier,null);assert.equal(done.claimable,false);assert.equal(done.status,'CALCULATED');
});
for(const data of [{},{orderNum:12},{rewardedNum:6},{orderNum:-1,rewardedNum:0},{orderNum:12,rewardedNum:1.5},{orderNum:'12',rewardedNum:6},{orderNum:2147483648,rewardedNum:6}])test('missing or malformed daily order fields cannot create tier eligibility '+JSON.stringify(data),()=>{
 const result=nextOrderTier(dailyTierConfig,data);assert.equal(result.status,'UNKNOWN');assert.equal(result.tier,null);assert.equal(result.claimable,false);
});
for(const rows of [[],[{reqNum:6},{reqNum:6}],[{reqNum:6},{reqNum:-1}],[{reqNum:6},{reqNum:0}],[{reqNum:'6'}],[{season:1,worldOpenDays:1,reqNum:40},{season:2,worldOpenDays:5,reqNum:45}],[{reqNum:6},{season:2,reqNum:12}]])test('daily order unknown or scoped configuration cannot become a merged completion list '+JSON.stringify(rows),()=>{
 const cfg={tables:{OrderDailyRewardCfg:{data:rows}}},result=nextOrderTier(cfg,{orderNum:99,rewardedNum:0});assert.equal(result.status,'UNKNOWN');assert.equal(result.tier,null);assert.equal(result.claimable,false);assert.deepEqual(result.reqNums,[]);
});
test('unrecognized or impossible rewarded-through values do not silently skip a daily order threshold',()=>{
 for(const data of [{orderNum:12,rewardedNum:5},{orderNum:6,rewardedNum:12}]){const result=nextOrderTier(dailyTierConfig,data);assert.equal(result.reason,'ORDER_REWARDED_THRESHOLD_INCONSISTENT');assert.equal(result.claimable,false);}
});
async function taskOrderSurvey(orderOfTheDay,cfg=dailyTierConfig,{water=null,signal}={}){
 const reads=[],writes=[],client={connected:true,async request(name){reads.push(name);if(name==='MainTaskInfoRequest')return {task:{taskId:1,progress:1,rewardClaimed:false},branch:[]};if(name==='AchievementInfoRequest')return {task:[]};return {orderOfTheDay};},async sendWatch(){writes.push(true);}};
 const survey=await surveyTasks(client,{}, {config:cfg,water,signal});return {survey,reads,writes};
}
test('Tasks keeps explicit zero and scoped tier unknown, while independent main-task observation remains available',async()=>{
 const cfg={tables:{...dailyTierConfig.tables,OrderDailyRewardCfg:{data:[{season:1,worldOpenDays:1,reqNum:40},{season:2,worldOpenDays:5,reqNum:45}]}}};
 const {survey,reads,writes}=await taskOrderSurvey({orderNum:40,rewardedNum:40},cfg);assert.equal(survey.orderOfTheDay.orderNum,40);assert.equal(survey.orderOfTheDay.rewardedNum,40);assert.equal(survey.orderOfTheDay.status,'UNKNOWN');assert.equal(survey.orderOfTheDay.reason,'ORDER_REWARD_CONTEXT_UNAVAILABLE');assert.equal(survey.orderOfTheDay.claimable,false);assert.equal(survey.orderOfTheDay.progress.period.status,'UNKNOWN');assert.equal(survey.plan.some(row=>row.kind==='orderDaily'),false);assert.equal(survey.plan.some(row=>row.kind==='main'),true);assert.deepEqual(reads,['MainTaskInfoRequest','AchievementInfoRequest','OnWaterRequest']);assert.equal(writes.length,0);assert.match(formatTaskPlan(survey),/观察完成 40 单.*下一档 未知.*周期与重置时间未知/);assert.doesNotMatch(formatTaskPlan(survey),/各档位都已领完|订单 今日/);
 const zero=await taskOrderSurvey({orderNum:0,rewardedNum:0});assert.equal(zero.survey.orderOfTheDay.orderNum,0);assert.equal(zero.survey.orderOfTheDay.rewardedNum,0);assert.equal(zero.survey.orderOfTheDay.tier,6);
});
test('Tasks never promotes inherited Codec defaults or missing order response into zero progress or all-claimed status',async()=>{
 const {loadProtocol}=await import('../src/proto.mjs'),p=loadProtocol(),wire=body=>p.OrderOfTheDay.decode(p.OrderOfTheDay.encode(body).finish());
 for(const body of [undefined,{},wire({}),wire({orderNum:12}),wire({rewardedNum:6})]){
  const {survey}=await taskOrderSurvey(body);assert.equal(survey.orderOfTheDay.status,'UNKNOWN');assert.equal(survey.orderOfTheDay.claimable,false);assert.equal(survey.plan.some(row=>row.kind==='orderDaily'),false);assert.ok(survey.plan.some(row=>row.kind==='main'));assert.doesNotMatch(formatTaskPlan(survey),/各档位都已领完|订单 今日/);
 }
 const explicit=await taskOrderSurvey(wire({orderNum:0,rewardedNum:0}));assert.equal(explicit.survey.orderOfTheDay.status,'CALCULATED');assert.equal(explicit.survey.orderOfTheDay.orderNum,0);
});
test('preprovided Tasks water reuses the same raw observation and does not request another snapshot',async()=>{
 const {survey,reads,writes}=await taskOrderSurvey(null,dailyTierConfig,{water:{orderOfTheDay:{orderNum:12,rewardedNum:6}}});assert.equal(survey.orderOfTheDay.tier,12);assert.equal(survey.orderOfTheDay.claimable,true);assert.deepEqual(reads,['MainTaskInfoRequest','AchievementInfoRequest']);assert.equal(writes.length,0);
});

for(const mode of ['missing','duplicate','wrong-account','wrong-run','empty-actions','account-switch','client-switch'])test('compatibility reporting refuses missing or mismatched persistent result '+mode,async()=>{
 const client={connected:true},session={id:'synthetic-A',client},record={accountId:session.id,runId:'synthetic-run',finalStatus:'SUCCESS',actions:[{actionId:'synthetic-action',result:'SUCCESS'}]};let executed=0;
 const service={executeTaskRewards(){executed++;return {runId:record.runId};},async settle(){if(mode==='account-switch')session.id='synthetic-B';if(mode==='client-switch')session.client={connected:true};},history(){if(mode==='wrong-account')record.accountId='synthetic-B';if(mode==='wrong-run')record.runId='other-run';if(mode==='empty-actions')record.actions=[];return {runs:mode==='missing'?[]:mode==='duplicate'?[record,record]:[record]};}};
 const result=await runTasks(client,{}, {plan:[]},{allowMutate:true,operationService:service,session,authorization:{}});assert.equal(result.length,1);assert.equal(result[0].status,'UNKNOWN');assert.equal(result[0].ok,null);assert.equal(executed,1);
});
