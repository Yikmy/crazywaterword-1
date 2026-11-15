import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProtocol } from '../src/proto.mjs';
import { DAILY_DRIVERS, runDailies, claimDailies, surveyDailies, parseDailyTaskObservation, claimableDailyTasks, dailyTaskRows, dailyTaskObservation, dailyTaskQualification } from '../src/dailies.mjs';

const protocol = loadProtocol();
const noSleep = async () => {};
const clickConfig = { tables: { OfflineParamCfg: { data: [
  { paramName: '免费点金次数', paramValue: 3 }, { paramName: '点金价格', paramValue: 50 },
] } } };
const daily = (id, count = 1) => ({ id, progress: 0, targetProgress: count, title: String(id) });
const queryNames = new Set(['DailyTaskInfoRequest', 'AllItemRequest', 'AllResourceRequest', 'DailyGiftPackRequest', ...Object.values(DAILY_DRIVERS).flatMap((driver) => (driver.probes ?? []).map(([name]) => name))]);
function fixture({ tasks = [], replies = {}, write, watch } = {}) {
  const calls = [];
  const mutations = [];
  const client = {
    connected: true,
    async request(name, body) {
      calls.push(name);
      if (!queryNames.has(name)) { mutations.push(name); return write ? write(name, body) : {}; }
      if (typeof replies[name] === 'function') return replies[name](body);
      if (Object.hasOwn(replies, name)) return replies[name];
      if (name === 'DailyTaskInfoRequest') return { dailyTask: tasks, dailyRewardClaimed: [], weeklyRewardClaimed: [] };
      if (name === 'AllItemRequest') return { items: [] };
      if (name === 'AllResourceRequest') return { list: [{ res: 4, amount: 1000 }] };
      if (name === 'DailyGiftPackRequest') return { heroId: 'synthetic-hero', drawnPack: ['赠礼'] };
      return {};
    },
    async sendWatch(name, body) { calls.push(name); mutations.push(name); return watch?.(name, body); },
  };
  return { client, calls, mutations };
}
const surveyOf = (task, actions, extra = {}) => ({ tasks: [{ task, status: 'ready', actions }], ...extra });

test('DiscountShop marks known dynamic price paid and uses its actual response type', () => {
  const evaluate = (shop) => DAILY_DRIVERS[1007].evaluate({ task: daily(1007), ruby: 1000, probe: () => shop });
  const result = evaluate({ shopItem: [{ id: 1, price: 200, discount: 0.5, isBuy: false }] });
  assert.equal(result.status, 'paid');
  assert.equal(result.actions[0].paid, true);
  assert.equal(result.actions[0].needsPaid, true);
  assert.equal(result.actions[0].cost, '钻石 x100');
  assert.equal(result.actions[0].response, 'DiscountShopBuyResponse');
  const response = protocol.DiscountShopBuyResponse.decode(protocol.DiscountShopBuyResponse.encode({ shopItem: { id: 1, isBuy: true } }).finish());
  assert.equal(response.shopItem.id, 1);
  assert.equal(response.shopItem.isBuy, true);
  for (const item of [
    { id: 1, isBuy: false }, { id: 1, isBuy: false, price: NaN, discount: 1 },
    { id: 1, isBuy: false, price: 10, discount: -1 }, { id: 1, isBuy: false, price: 10, discount: 2 },
  ]) {
    const invalid = evaluate({ shopItem: [item] });
    assert.equal(invalid.status, 'unknown');
    assert.equal(invalid.actions, undefined);
  }
});

test('D6 blocks forged ready discount, paid gold and paid gifts even with allowPaid', async () => {
  for (const allowPaid of [false, true]) {
    for (const action of [
      { request: 'DiscountShopBuyRequest', body: { id: 1 }, cost: '无', paid: false },
      { request: 'ClickGoldRequest', body: { free: false, times: 1 }, cost: '无' },
      { request: 'GotFreeDailyPackRequest', body: { packId: '礼包1' }, cost: '无' },
      { request: 'UnknownRequest', body: {}, cost: '无' },
    ]) {
      const f = fixture();
      const result = await runDailies(f.client, protocol, surveyOf(daily(1007), [action]), { allowMutate: true, allowPaid, claimRewards: false, sleep: noSleep });
      assert.equal(result[0].status, 'NOT_EXECUTED');
      assert.equal(f.calls.length, 0);
      assert.equal(f.mutations.length, 0);
    }
  }
});

test('execution rechecks free allowance against config and fresh server state', async () => {
  const task = daily(1006);
  const action = { request: 'ClickGoldRequest', body: { times: 1, free: true }, response: 'ClickGoldResponse', cost: '免费次数' };
  for (const [config, freeTimes, expected] of [[clickConfig, 3, 0], [{ tables: {} }, 0, 0], [clickConfig, 0, 0]]) {
    const f = fixture({ tasks: [task], replies: { ClickGoldInfoRequest: { info: { freeTimes, paidTimes: 0, maxPaidTimes: 7 } } } });
    const result = await runDailies(f.client, protocol, surveyOf(task, [action]), { allowMutate: true, claimRewards: false, config, sleep: noSleep });
    assert.equal(f.mutations.length, expected);
    assert.equal(result[0].status, expected ? 'SUCCESS' : 'NOT_EXECUTED');
  }
});

test('daily pirate progress never builds or dispatches a legacy sweep', async () => {
  const task = daily(1010, 2);
  assert.deepEqual(DAILY_DRIVERS[1010].probes, []);
  const plan = DAILY_DRIVERS[1010].evaluate({ task });
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.actions, undefined);
  assert.equal(plan.functionId, 'pirate-sweep');
  assert.equal(DAILY_DRIVERS[1010].evaluate({ task: { ...task, progress: 2 } }).status, 'done');
  const f = fixture({ tasks: [task] });
  const survey = await surveyDailies(f.client, protocol);
  assert.equal(survey.tasks[0].functionId, 'pirate-sweep');
  assert.equal(f.calls.includes('AllPirateRequest'), false);
  f.calls.length = 0;
  const stale = { request: 'PirateSweepRequest', body: { uid: 17, cityId: 9 }, costs: [] };
  const result = await runDailies(f.client, protocol, surveyOf(task, [stale]), { allowMutate: true, claimRewards: false, sleep: noSleep });
  assert.equal(result[0].status, 'NOT_EXECUTED');
  assert.deepEqual(f.calls, []);
});

test('silent daily action is UNKNOWN and stops later drivers and reward collection', async () => {
  const task = daily(1006, 2);
  const action = { request: 'ClickGoldRequest', body: { times: 1, free: true }, response: 'ClickGoldResponse', cost: '免费次数' };
  const f = fixture({ tasks: [task], replies: { ClickGoldInfoRequest: { info: { freeTimes: 0 } } }, write: () => null });
  const result = await runDailies(f.client, protocol, surveyOf(task, [action, action]), { allowMutate: true, config: clickConfig, sleep: noSleep });
  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'NOT_EXECUTED');
  assert.equal(result[0].code, 'AUTHORIZATION_REQUIRED');
  assert.equal(result[0].ok, false);
  assert.deepEqual(f.mutations, []);
});

test('daily cancellation during survey or delay cannot dispatch the next request', async () => {
  const ac = new AbortController();
  const f = fixture({ replies: { DailyTaskInfoRequest: () => { ac.abort(); return { dailyTask: [] }; } } });
  await assert.rejects(surveyDailies(f.client, protocol, { signal: ac.signal }), { code: 'CANCELLED' });
  assert.deepEqual(f.calls, ['DailyTaskInfoRequest']);
  const other = fixture();
  const delayAbort = new AbortController();
  delayAbort.abort();
  const result = await runDailies(other.client, protocol, { tasks: [] }, {
    allowMutate: true, signal: delayAbort.signal,
    sleep: async () => { delayAbort.abort(); },
  });
  assert.equal(result[0].status, 'CANCELLED');
  assert.deepEqual(other.calls, []);
});

test('transport timeout is UNKNOWN and definite rejection is remembered across runs', async () => {
  const task = daily(1006, 2);
  const action = { request: 'ClickGoldRequest', body: { times: 1, free: true }, response: 'ClickGoldResponse', cost: '免费次数' };
  for (const code of ['TIMEOUT', 'REJECTED']) {
    const f = fixture({ tasks: [task], replies: { ClickGoldInfoRequest: { info: { freeTimes: 0 } } }, write: () => { const error = new Error(code); error.code = code; throw error; } });
    const rejected = new Set();
    const result = await runDailies(f.client, protocol, surveyOf(task, [action, action]), { allowMutate: true, claimRewards: false, config: clickConfig, sleep: noSleep, rejected });
    assert.equal(result[0].status, 'NOT_EXECUTED');
    assert.equal(result[0].code, 'AUTHORIZATION_REQUIRED');
    assert.equal(f.mutations.length, 0);
    if (code === 'REJECTED') {
      await runDailies(f.client, protocol, surveyOf(task, [action]), { allowMutate: true, claimRewards: false, config: clickConfig, sleep: noSleep, rejected });
      assert.equal(f.mutations.length, 0);
    }
  }
});

test('missing declared response refuses daily mutation rather than using sendWatch', async () => {
  const task = daily(1006);
  const action = { request: 'ClickGoldRequest', body: { times: 1, free: true }, response: 'ClickGoldResponse', cost: '免费次数' };
  const f = fixture({ tasks: [task], replies: { ClickGoldInfoRequest: { info: { freeTimes: 0 } } } });
  const stripped = { ...protocol }; delete stripped.ClickGoldResponse;
  const result = await runDailies(f.client, stripped, surveyOf(task, [action]), { allowMutate: true, claimRewards: false, config: clickConfig, sleep: noSleep });
  assert.equal(result[0].status, 'NOT_EXECUTED');
  assert.deepEqual(f.mutations, []);
});

test('free gift is reported once and only a fresh drawnPack confirms success', async () => {
  for (const confirmed of [false, true]) {
    let queries = 0;
    const f = fixture({ replies: { DailyGiftPackRequest: () => ({ heroId: 'synthetic-hero', drawnPack: ++queries === 1 || !confirmed ? [] : ['赠礼'] }) } });
    const confirmations = [];
    f.client.confirmWatchedWrite = (name, body) => confirmations.push({ name, body });
    const result = await claimDailies(f.client, protocol, { allowMutate: true, sleep: noSleep });
    assert.equal(result[0].status, 'NOT_EXECUTED');assert.equal(result[0].code,'AUTHORIZATION_REQUIRED');
    assert.equal(confirmations.length,0);assert.equal(result.length,1);assert.deepEqual(f.mutations,[]);assert.equal(queries,0);
    // Positive/UNKNOWN settlement is exercised through the real Service in daily-task-rewards.test.
  }
});

test('unconfirmed first activity chest prevents the next chest and gift', async () => {
  const f = fixture();
  const result = await claimDailies(f.client, protocol, { allowMutate: true, sleep: noSleep });
  assert.equal(result[0].status, 'NOT_EXECUTED');assert.equal(result[0].code,'AUTHORIZATION_REQUIRED');
  assert.deepEqual(f.mutations, []);assert.deepEqual(f.calls,[]);
  // Authorized UNKNOWN and durable blocking use the real shared Service fixture.
});

test('a failed required probe stays unknown instead of advertising a writable plan', async () => {
  const f = fixture({ tasks: [daily(1006)], replies: { ClickGoldInfoRequest: () => { throw new Error('offline probe failure'); } } });
  const report = await surveyDailies(f.client, protocol, { config: clickConfig });
  assert.equal(report.tasks[0].status, 'unknown');
  assert.match(report.tasks[0].reason, /offline probe failure/);
  assert.deepEqual(report.tasks[0].actions, []);
});


test('daily progress preview and Function share exact explicit int32 row observations',()=>{
 const row={id:1001,progress:1,targetProgress:1,rewardClaimed:false,extra:'retained'};
 assert.deepEqual(parseDailyTaskObservation(row),{taskId:1001,progress:1,targetProgress:1,rewardClaimed:false});
 assert.deepEqual(claimableDailyTasks({dailyTask:[row]}),[row]);assert.equal(claimableDailyTasks({dailyTask:[row]})[0],row);assert.equal(row.extra,'retained');
 for(const changed of [{...row,progress:0},{...row,rewardClaimed:true}]){assert.ok(parseDailyTaskObservation(changed));assert.deepEqual(claimableDailyTasks({dailyTask:[changed]}),[]);}
 for(const key of ['id','progress','targetProgress','rewardClaimed']){
  const missing={...row};delete missing[key];assert.equal(parseDailyTaskObservation(missing),null);
  const inherited=Object.assign(Object.create({[key]:row[key]}),missing);assert.equal(parseDailyTaskObservation(inherited),null);
  const accessor={...missing};Object.defineProperty(accessor,key,{enumerable:true,get(){throw Error('must not call accessor');}});assert.equal(parseDailyTaskObservation(accessor),null);
 }
 for(const changed of [{...row,id:0},{...row,id:2147483648},{...row,progress:2147483648},{...row,progress:'1'},{...row,targetProgress:0},{...row,targetProgress:2147483648},{...row,rewardClaimed:0}]){assert.equal(parseDailyTaskObservation(changed),null);assert.deepEqual(claimableDailyTasks({dailyTask:[changed]}),[]);}
 const type=protocol.DailyTaskInfoResponse;
 const absent=type.decode(type.encode({dailyTask:[{id:1001,targetProgress:1,rewardClaimed:false}]}).finish()).dailyTask[0];
 assert.equal(absent.progress,0);assert.equal(parseDailyTaskObservation(absent),null);
});


test('daily observation keeps completion, reward state and eligibility separate without defaults or coercion',()=>{
 const valid={id:1001,progress:1,targetProgress:1,rewardClaimed:false,extra:'retained'};
 for(const [row,completion,rewardState,claimable]of[
  [valid,'COMPLETE','UNCLAIMED',true],
  [{...valid,progress:0},'INCOMPLETE','UNCLAIMED',false],
  [{...valid,rewardClaimed:true},'COMPLETE','CLAIMED',false],
  [{id:1001,progress:1,targetProgress:1},'COMPLETE','UNKNOWN',null],
  [{id:1001,rewardClaimed:true},'UNKNOWN','CLAIMED',null],
  [{...valid,targetProgress:0},'UNKNOWN','UNCLAIMED',null],
  [{...valid,progress:'1'},'UNKNOWN','UNCLAIMED',null],
  [{...valid,id:0},'UNKNOWN','UNKNOWN',null],
 ]){
  assert.deepEqual(dailyTaskQualification(row),{completion,rewardState,claimable});
  assert.deepEqual(claimableDailyTasks({dailyTask:[row]}),claimable===true?[row]:[]);
 }
 for(const key of ['id','progress','targetProgress','rewardClaimed']){
  for(const descriptor of [{enumerable:true,get(){throw Error('must not execute accessor');}},{enumerable:false,value:valid[key]}]){
   const row={...valid};Object.defineProperty(row,key,descriptor);assert.equal(parseDailyTaskObservation(row),null);assert.equal(dailyTaskQualification(row).claimable,null);assert.equal(claimableDailyTasks({dailyTask:[row]}).length,0);
  }
 }
 const inherited=Object.create(valid);assert.deepEqual(dailyTaskObservation(inherited),{taskId:null,progress:null,targetProgress:null,rewardClaimed:null});assert.equal(parseDailyTaskObservation(inherited),null);
 for(const value of [null,[],1,'row'])assert.equal(parseDailyTaskObservation(value),null);
 const type=protocol.DispDailyTask,omitted=type.decode(type.encode({id:1001,targetProgress:1,rewardClaimed:false}).finish());
 assert.equal(omitted.progress,0);assert.equal(dailyTaskObservation(omitted).progress,null);assert.equal(dailyTaskQualification(omitted).completion,'UNKNOWN');assert.equal(valid.extra,'retained');
});

test('legacy daily survey uses the shared read-only qualification and retains original valid driver suggestions',async()=>{
 const rows=[{id:1001,progress:1,targetProgress:1,extra:'keep-without-claim-marker'},
 {id:1002,progress:1,targetProgress:1,rewardClaimed:true},
 {id:1006,progress:0,targetProgress:2,rewardClaimed:false}];
 const f=fixture({tasks:rows,replies:{ClickGoldInfoRequest:{info:{freeTimes:0}}}}),report=await surveyDailies(f.client,protocol,{config:clickConfig});
 assert.equal(report.readOnly,true);assert.equal(report.executable,false);assert.equal(report.qualificationScope,'TASK_PROGRESS_ONLY');assert.equal(report.taskListStatus,'OBSERVED');
 for(let i=0;i<rows.length;i++)assert.deepEqual(report.tasks[i].qualification,dailyTaskQualification(rows[i]));
 assert.equal(report.tasks[0].status,'done');assert.equal(report.tasks[0].qualification.claimable,null);assert.equal(report.tasks[0].task.extra,rows[0].extra);assert.deepEqual(report.tasks[0].actions,[]);
 assert.equal(report.tasks[1].status,'done');assert.equal(report.tasks[1].qualification.claimable,false);
 const expected=DAILY_DRIVERS[1006].evaluate({task:rows[2],probe:()=>({info:{freeTimes:0}}),config:clickConfig,ruby:1000});
 assert.equal(report.tasks[2].status,expected.status);assert.deepEqual(report.tasks[2].actions,expected.actions);assert.deepEqual(f.mutations,[]);
});
for(const [label,change]of[
 ['zero target',row=>row.targetProgress=0],['negative target',row=>row.targetProgress=-1],['string progress',row=>row.progress='2'],['unsafe progress',row=>row.progress=2147483648],
 ['infinite progress',row=>row.progress=Infinity],['missing progress',row=>delete row.progress],['missing target',row=>delete row.targetProgress],
 ['accessor progress',row=>Object.defineProperty(row,'progress',{enumerable:true,get(){throw Error('must not execute');}})],
])test('legacy daily preview cannot complete or suggest actions from unknown counts '+label,async()=>{
 const row={id:1006,progress:2,targetProgress:2,rewardClaimed:false,extra:'keep'};change(row);
 const f=fixture({tasks:[row,{id:1001,progress:1,targetProgress:1,rewardClaimed:false}]}),report=await surveyDailies(f.client,protocol,{config:clickConfig});
 assert.equal(report.tasks[0].status,'unknown');assert.equal(report.tasks[0].qualification.completion,'UNKNOWN');assert.equal(report.tasks[0].qualification.claimable,null);assert.deepEqual(report.tasks[0].actions,[]);assert.equal(report.tasks[0].task.extra,'keep');assert.equal(report.tasks[1].status,'done');assert.deepEqual(f.mutations,[]);
});
for(const [label,rows]of [['duplicate',[{id:1001,progress:1,targetProgress:1},{id:1001,progress:1,targetProgress:1}]],['sparse',Array(1)],['invalid identity',[{id:0,progress:1,targetProgress:1}]],['malformed',{}],['missing',undefined]])test('legacy daily preview unknown task list preserves independent gift '+label,async()=>{
 const f=fixture({replies:{DailyTaskInfoRequest:{dailyTask:rows},DailyGiftPackRequest:{heroId:'h',drawnPack:[]}}}),report=await surveyDailies(f.client,protocol);
 assert.equal(report.taskListStatus,'UNKNOWN');assert.equal(report.taskListReason,'DAILY_TASK_LIST_UNKNOWN');assert.deepEqual(report.tasks,[]);assert.equal(report.gift.freeAvailable,true);assert.deepEqual(f.mutations,[]);
});


test('one daily list parser preserves exact rows and rejects ambiguous identities across preview and claim candidates',async()=>{
 const row={id:1001,progress:1,targetProgress:1,rewardClaimed:false,extra:'keep'},rows=[row],body={dailyTask:rows};
 assert.equal(dailyTaskRows(body),rows);assert.equal(claimableDailyTasks(body)[0],row);assert.deepEqual(dailyTaskRows({dailyTask:[]}),[]);
 const sparse=[row];sparse.length=2;
 for(const invalid of [{dailyTask:[row,{...row}]},{dailyTask:sparse},{dailyTask:[row,{id:0}]},Object.create(body),{}]){
  assert.equal(dailyTaskRows(invalid),null);assert.deepEqual(claimableDailyTasks(invalid),[]);
 }
 const accessor={};Object.defineProperty(accessor,'dailyTask',{enumerable:true,get(){throw Error('must not invoke list getter');}});assert.equal(dailyTaskRows(accessor),null);assert.deepEqual(claimableDailyTasks(accessor),[]);
 const f=fixture({replies:{DailyTaskInfoRequest:{dailyTask:[row,{...row}]}}}),report=await surveyDailies(f.client,protocol);assert.equal(report.taskListStatus,'UNKNOWN');assert.deepEqual(report.tasks,[]);assert.deepEqual(f.mutations,[]);
});
