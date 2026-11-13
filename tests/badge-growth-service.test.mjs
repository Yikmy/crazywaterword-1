import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createExecutionHistory } from '../src/execution-history.mjs';
import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';
import { toSnapshotJson } from '../src/game.mjs';
import { createModuleSettings } from '../src/gameplay-settings.mjs';
import { createOperationService } from '../src/operation-service.mjs';
import { loadProtocol } from '../src/proto.mjs';
import { createWorkflowRunner } from '../src/workflow.mjs';

const protocol = loadProtocol();
const wire = (name, data) => protocol[name].decode(protocol[name].encode(data).finish());
const moduleId = 'badge-growth';
const account = 'badge-account';
const uid = '9007199254740993';
const parameters = { heroId: 'A', uid };
const wearParameters = { action: 'put-on', heroId: 'A', uid, pos: 1 };
const badgeId = '蓝法师徽章';
const xp = '徽章经验';
const costs = { [xp]: 5, GOLD: 100 };
const uidClaim = [{ type: 'badge', id: uid }];
const costMap = rows => Object.fromEntries(rows.map(({ id, num }) => [id, num]));

function fixture(t, { effect = 'apply', material = { asset: [] }, putOn = false, star = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-badge-service-'));
  const file = path.join(dir, 'execution-history.json');
  const newHistory = () => createExecutionHistory({ file });
  const durable = newHistory(); let failPersist = () => false;
  const history = {...durable,put(record){if(failPersist(record))throw Error('synthetic badge persistence unavailable');return durable.put(record);}};
  const settings = createModuleSettings({ file: path.join(dir, 'settings.json'), modules: GAMEPLAY_MODULES });
  const config = { tables: {
    HeroCfg: { data: [{ id: 'A', type: '英雄', career: '法师' }] },
    HeroBadgeCfg: { data: [{ id: badgeId, career: '法师' }] },
    HeroBadgeAttrCfg: { data: [{ id: badgeId, star: 0, maxLevel: 4 }] },
    HeroBadgeLevelCfg: { data: [
      { level: 1, exp: 0, goldExpRadio: 0 },
      { level: 2, exp: 5, goldExpRadio: 20 },
      { level: 3, exp: 7, goldExpRadio: 25 },
      { level: 4, exp: 10, goldExpRadio: 30 },
    ] },
    ModuleOpenCfg: { data: [{ moduleId: '英雄徽章', playerLevel: 12 }] },
    HeroBadgeUnlockCfg: { data: [1, 70, 90, 110].map((level, index) => ({ pos: index + 1, level })) },
  } };
  if(star){config.tables.HeroBadgeCfg.data=[{id:'红法师徽章',career:'法师',quality:'RED'}];config.tables.HeroBadgeAttrCfg.data=[0,1,2,3,4,5].map(star=>({id:'红法师徽章',star,maxLevel:100}));config.tables.HeroBadgeStarCfg={data:[1,2,3,4,5].map(star=>({star,upBadgeNum:2**(star-1),consume:['GOLD',500000*2**(star-1)]}))};}
  const services = [], sessions = [];
  t.after(async () => {
    for (const session of sessions) session.abort.abort();
    await Promise.all(services.map(service => service.settle(account)));
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  settings.save(account, moduleId, { enabled: true });
  const newService = (store = newHistory()) => {
    const service = createOperationService({
      protocol, modules: GAMEPLAY_MODULES, history: store, moduleSettings: settings, getConfig: () => structuredClone(config),
      loadRules: () => ({ config: { version: 1, enabled: true, rules: [] } }),
      loadProduction: () => ({ config: { version: 1, enabled: false } }),
    });
    services.push(service);
    return service;
  };
  function newSession(generation = 1) {
    const connectionId = 'offline-badge-' + generation;
    const core = { uid, badgeId:star?'红法师徽章':badgeId, level: 1, star: 0, attr: { attr: 1, value: 1.5, rating: 2 } };
    const worn = { ...structuredClone(core), pos: 1 };
    const badge = { ...structuredClone(core), exp: 0 };
    const hero = { heroId: 'A', level: 20, star: 3, power: '9007199254741001', attributes: [{ attr: 1, value: 4 }], skillLevels: [1, 2], badges: putOn ? [] : [worn] };
    const stock = new Map([[xp, 25], ['GOLD', 500], ['其他', 1]]);
    if(star){stock.set('徽章升星石',32);stock.set('GOLD',10000000);}
    const writes = [], reads = [], uncertainWrites = new Map();
    const client = {
      connected: true, pending: [], watchers: [], lateResponses: new Map(), uncertainWrites,
      factContext: { accountId: account, generation, connectionId },
      markUnverifiedWrite(name, body) { uncertainWrites.set(JSON.stringify([name, body]), true); },
      async sendWatch(name, body, options) {
        options.beforeDispatch?.();
        assert.equal(putOn, true);
        assert.equal(name, 'PutOnBadgeRequest');
        const decoded = toSnapshotJson(wire(name, body));
        assert.deepEqual(decoded, { uid, heroId: 'A', pos: 1 });
        const durable = JSON.parse(fs.readFileSync(file, 'utf8')).accounts[account][0];
        writes.push({ body: decoded, durable });
        if (effect === 'apply') {
          hero.badges.push(worn);
          hero.power = '9007199254741007';
          hero.attributes[0].value++;
        }
        return { status: 'UNKNOWN' };
      },
      async request(name, body, reply, _timeout, options = {}) {
        const decoded = toSnapshotJson(wire(name, body));
        if (options.mutate) {
          options.beforeDispatch?.();
          assert.equal(name, star ? 'BadgeStarRequest' : 'EnhanceBadgeRequest');
          assert.equal(reply, star ? 'BadgeStarResponse' : 'EnhanceBadgeResponse');
          assert.deepEqual(decoded, star ? {uid,decomposeUid:[],starItemNum:2**badge.star} : { uid, decomposeUid: [], expItemNum: 5 });
          // Read the actual file at the transport boundary, before altering
          // synthetic game state. The snapshot is not a stubbed history callback.
          const durable = JSON.parse(fs.readFileSync(file, 'utf8')).accounts[account][0];
          writes.push({ body: decoded, durable });
          if (effect !== 'none') {
            const increase = effect === 'double-level' ? 2 : 1;
            if(star){badge.star+=effect==='double-star'?2:1;worn.star=badge.star;badge.attr.value++;worn.attr.value++;}
            else {badge.level += increase;worn.level += increase;}
            hero.power = '9007199254741007';
            hero.attributes[0].value++;
            if(star){stock.set('徽章升星石',stock.get('徽章升星石')-decoded.starItemNum);stock.set('GOLD',stock.get('GOLD')-500000*decoded.starItemNum);}
            else {stock.set(xp, stock.get(xp) - 5);stock.set('GOLD', stock.get('GOLD') - 100);}
          }
          if(session.onWrite)return session.onWrite();
          return wire(reply, { material });
        }
        reads.push({ name, afterDispatch: writes.length > 0 });
        await session.onRead?.(name);
        const value = {
          BadgesRequest: () => ({ badge: [badge] }),
          AllHeroRequest: () => ({ heroes: [hero] }),
          AllItemRequest: () => ({ items: [...stock].filter(([id]) => id !== 'GOLD').map(([itemId, num]) => ({ itemId, num })) }),
          AllResourceRequest: () => ({ list: [{ res: 3, amount: stock.get('GOLD') }] }),
        }[name]?.();
        assert.ok(value, 'Unexpected offline read ' + name);
        return wire(reply, value);
      },
    };
    const session = {
      id: account, client, state: 'READY', player: { playerId: '17', worldId: '9', level: 30 },
      generation, connectionId, abort: new AbortController(), busy: null, loop: { running: false }, snapshot: { ok: {}, failed: {} },
      writes, reads, stock, badge, worn, hero, log:[],
    };
    sessions.push(session);
    return session;
  }
  async function displayed(service, session, selectedParameters = star ? {...parameters,action:'star'} : putOn ? wearParameters : parameters, workflowId = null) {
    const survey = await service.surveyModule(session, moduleId, selectedParameters, {workflowId});
    const candidate = survey.view.candidates.find(row => row.executable);
    assert.ok(candidate, JSON.stringify(survey.view.blocked));
    assert.equal(candidate.action, undefined);
    assert.equal(candidate.configEvidence, undefined);
    return service.plan(session, { module: moduleId, mode: 'Manual', parameters: selectedParameters, selections: [candidate.actionId] }, {workflowId});
  }
  const permitPayload = plan => ({
    batchId: plan.batchId, planHash: plan.planHash, approvedActionIds: plan.actions.map(row => row.actionId), resourceBudget: plan.resourceBudget, confirm: true,
  });
  return { history, newHistory, newService, newSession, displayed, permitPayload, config, file, failPersist:fn=>{failPersist=fn;} };
}

test('C228 real OperationService persists both costs and exact badge UID before typed transport and confirms full effect', async t => {
  const f = fixture(t), service = f.newService(f.history), session = f.newSession();
  const plan = await f.displayed(service, session), payload = f.permitPayload(plan);
  assert.deepEqual(costMap(plan.resourceBudget), costs);
  assert.deepEqual(plan.budgetClaims.uids, uidClaim);
  assert.equal(plan.actions[0].action, undefined);
  assert.equal(plan.actions[0].configEvidence, undefined);
  assert.throws(() => service.execute(session, { batchId: plan.batchId }));
  for (const omitted of [xp, 'GOLD']) {
    assert.throws(() => service.authorize(session, { ...payload, resourceBudget: payload.resourceBudget.filter(row => row.id !== omitted) }), { code: 'AUTHORIZATION_REQUIRED' });
  }
  assert.equal(session.writes.length, 0);
  const permit = service.authorize(session, payload);
  service.execute(session, permit);
  await service.settle(session.id);
  assert.equal(session.writes.length, 1);
  const [{ body, durable }] = session.writes;
  assert.deepEqual(body, { uid, decomposeUid: [], expItemNum: 5 });
  assert.equal(durable.actions[0].dispatchEvidence.state, 'MAY_HAVE_DISPATCHED');
  assert.equal(durable.actions[0].stages.at(-1).stage, 'DISPATCH_INTENT');
  assert.deepEqual(costMap(durable.runBudget.reserved.resources), costs);
  assert.deepEqual(durable.runBudget.reserved.uids, uidClaim);

  const reopened = f.newHistory();
  const [run] = reopened.list(account), [action] = run.actions;
  assert.equal(run.finalStatus, 'SUCCESS');
  assert.equal(action.requestStatus, 'SUCCESS');
  assert.equal(action.verification.status, 'CONFIRMED');
  assert.deepEqual(action.stages.slice(-3).map(row => row.stage), ['RESPONSE', 'VERIFY', 'VERIFIED']);
  assert.deepEqual(session.reads.filter(row => row.afterDispatch).map(row => row.name).sort(), ['AllHeroRequest', 'AllItemRequest', 'AllResourceRequest', 'BadgesRequest']);
  assert.equal(action.afterState.badge.uid, uid);
  assert.equal(action.afterState.badge.level, 2);
  assert.equal(action.afterState.badge.exp, 0);
  assert.equal(action.afterState.hero.badges[0].level, 2);
  assert.equal(session.stock.get(xp), 20);
  assert.equal(session.stock.get('GOLD'), 400);
  assert.equal(reopened.unresolved(account), false);
  assert.throws(() => service.execute(session, permit), { code: 'AUTHORIZATION_REQUIRED' });
});

for (const [label, options] of [
  ['typed reply alone', { effect: 'none' }],
  ['wrong level effect with the expected typed reply', { effect: 'double-level' }],
  ['exact level and debits with unexpected typed material', { material: { asset: [{ type: 0, id: 'unexpected', num: 1 }] } }],
]) {
  test('C228 ' + label + ' leaves both claims reserved and blocks retries after restart', async t => {
    const f = fixture(t, options), service = f.newService(f.history), session = f.newSession();
    const plan = await f.displayed(service, session), permit = service.authorize(session, f.permitPayload(plan));
    service.execute(session, permit);
    await service.settle(session.id);
    const [run] = f.history.list(account), [action] = run.actions;
    assert.equal(run.finalStatus, 'UNKNOWN');
    assert.equal(action.requestStatus, 'SUCCESS', 'typed transport completed but effect verification did not');
    assert.equal(action.unresolvedWrite, true);
    assert.equal(action.verification.status, 'UNCONFIRMED');
    assert.ok(action.stages.some(row => row.stage === 'RESPONSE'));
    assert.equal(action.stages.some(row => row.stage === 'VERIFIED'), false);
    assert.deepEqual(costMap(run.runBudget.reserved.resources), costs);
    assert.deepEqual(run.runBudget.reserved.uids, uidClaim);
    assert.throws(() => service.execute(session, permit));
    assert.equal(session.writes.length, 1);
    const restarted = f.newService(), fresh = f.newSession(2);
    assert.equal(restarted.status(fresh.id).blocked, true);
    await assert.rejects(f.displayed(restarted, fresh), { code: 'RECOVERY_UNCERTAIN' });
    assert.equal(fresh.writes.length, 0);
    assert.equal(f.newHistory().unresolved(account), true);
  });
}

for (const effect of ['apply', 'none']) {
  test('badge empty-slot watch requires fresh authoritative effect (' + effect + ')', async t => {
    const f = fixture(t, { effect, putOn: true }), service = f.newService(f.history), session = f.newSession();
    const plan = await f.displayed(service, session);
    assert.deepEqual(plan.resourceBudget, []);
    assert.deepEqual(plan.budgetClaims.uids, uidClaim);
    assert.equal(plan.actions[0].action, undefined);
    assert.deepEqual(plan.actions[0].target, { heroId: 'A', uid, pos: 1 });
    assert.throws(() => service.execute(session, { batchId: plan.batchId }), { code: 'AUTHORIZATION_REQUIRED' });
    assert.equal(session.writes.length, 0);

    const permit = service.authorize(session, f.permitPayload(plan));
    service.execute(session, permit);
    await service.settle(session.id);
    assert.equal(session.writes.length, 1);
    const [{ body, durable }] = session.writes;
    assert.deepEqual(body, { uid, heroId: 'A', pos: 1 });
    assert.equal(durable.actions[0].dispatchEvidence.state, 'MAY_HAVE_DISPATCHED');
    assert.equal(durable.actions[0].stages.at(-1).stage, 'DISPATCH_INTENT');
    assert.deepEqual(durable.runBudget.reserved.resources, []);
    assert.deepEqual(durable.runBudget.reserved.uids, uidClaim);
    assert.deepEqual(session.reads.filter(row => row.afterDispatch).map(row => row.name).sort(), ['AllHeroRequest', 'AllItemRequest', 'AllResourceRequest', 'BadgesRequest']);

    const reopened = f.newHistory(), [run] = reopened.list(account), [action] = run.actions;
    assert.equal(action.requestStatus, 'UNKNOWN');
    assert.ok(action.stages.some(row => row.stage === 'OBSERVATION_ENDED'));
    assert.equal(session.stock.get(xp), 25);
    assert.equal(session.stock.get('GOLD'), 500);
    assert.throws(() => service.execute(session, permit));
    if (effect === 'apply') {
      assert.equal(run.finalStatus, 'SUCCESS');
      assert.equal(action.verification.status, 'CONFIRMED');
      assert.equal(action.afterState.hero.badges[0].uid, uid);
      assert.equal(action.afterState.hero.badges[0].pos, 1);
      assert.equal(action.afterState.badge.level, 1);
      assert.equal(reopened.unresolved(account), false);
    } else {
      assert.equal(run.finalStatus, 'UNKNOWN');
      assert.equal(action.verification.status, 'UNCONFIRMED');
      assert.deepEqual(run.runBudget.reserved.uids, uidClaim);
      assert.equal(reopened.unresolved(account), true);
      const restarted = f.newService(reopened), fresh = f.newSession(2);
      await assert.rejects(f.displayed(restarted, fresh), { code: 'RECOVERY_UNCERTAIN' });
      assert.equal(fresh.writes.length, 0);
    }
  });
}


const starParameters={...parameters,action:'star'};
const starClaims={resources:[{id:'徽章升星石',num:1},{id:'GOLD',num:500000}],quotas:[],uids:uidClaim};
async function executeStar(f,service,session,plan){
 const permit=service.authorize(session,f.permitPayload(plan));service.execute(session,permit);await service.settle(session.id);
 return {permit,run:f.newHistory().list(account)[0]};
}
test('badge STAR persists exact two costs and shared badge UID before typed dispatch and confirms independent authority',async t=>{
 const f=fixture(t,{star:true}),service=f.newService(f.history),session=f.newSession(),plan=await f.displayed(service,session);
 assert.equal(plan.actions[0].actionType,'STAR');assert.deepEqual(plan.budgetClaims,starClaims);assert.equal(plan.actions[0].action,undefined);
 for(const omitted of ['徽章升星石','GOLD'])assert.throws(()=>service.authorize(session,{...f.permitPayload(plan),resourceBudget:plan.resourceBudget.filter(row=>row.id!==omitted)}),{code:'AUTHORIZATION_REQUIRED'});
 assert.equal(session.writes.length,0);const {permit,run}=await executeStar(f,service,session,plan),sent=session.writes[0];
 assert.equal(run.finalStatus,'SUCCESS');assert.equal(run.actions[0].verification.status,'CONFIRMED');
 assert.deepEqual(sent.body,{uid,decomposeUid:[],starItemNum:1});assert.equal(sent.durable.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');
 assert.deepEqual(sent.durable.runBudget.reserved,starClaims);assert.equal(run.actions[0].afterState.badge.star,1);assert.equal(run.actions[0].afterState.badge.level,1);
 assert.equal(f.newHistory().unresolved(account),false);assert.throws(()=>service.execute(session,permit));
 assert.deepEqual(session.reads.filter(row=>row.afterDispatch).map(row=>row.name).sort(),['AllHeroRequest','AllItemRequest','AllResourceRequest','BadgesRequest']);
});
for(const options of [{effect:'none'},{effect:'double-star'},{material:{asset:[{id:'unexpected',num:1}]}}]){
 test('badge STAR unconfirmed typed effect stays UNKNOWN across restart: '+JSON.stringify(options),async t=>{
  const f=fixture(t,{star:true,...options}),service=f.newService(f.history),s=f.newSession(),p=await f.displayed(service,s);
  const {run}=await executeStar(f,service,s,p);assert.equal(run.finalStatus,'UNKNOWN');assert.equal(run.actions[0].unresolvedWrite,true);
  assert.deepEqual(run.runBudget.reserved,starClaims);assert.equal(s.writes.length,1);
  const restarted=f.newService(),fresh=f.newSession(2);await assert.rejects(f.displayed(restarted,fresh),{code:'RECOVERY_UNCERTAIN'});
  assert.equal(fresh.writes.length,0);assert.equal(f.newHistory().unresolved(account),true);
 });
}
test('badge STAR authorization cannot cross account, player, world, connection, generation or changed star cost',async t=>{
 for(const kind of ['account','player','world','connection','generation','cost']){
  const f=fixture(t,{star:true}),service=f.newService(f.history),s=f.newSession(),p=await f.displayed(service,s);
  if(kind==='cost'){f.config.tables.HeroBadgeStarCfg.data[0].consume[1]++;assert.throws(()=>service.authorize(s,f.permitPayload(p)),{code:'STALE_PLAN'});}
  else{
   const permit=service.authorize(s,f.permitPayload(p));
   if(kind==='account'){assert.throws(()=>service.execute({...s,id:'other-account',client:{...s.client,factContext:{...s.client.factContext,accountId:'other-account'}}},permit));}
   else {if(kind==='player')s.player.playerId='99';if(kind==='world')s.player.worldId='11';if(kind==='connection'){s.connectionId+='new';s.client.factContext.connectionId+='new';}if(kind==='generation'){s.generation++;s.client.factContext.generation++;}
    try{service.execute(s,permit);await service.settle(account);}catch{}assert.notEqual(service.status(account).finalStatus,'SUCCESS');}
  }
  assert.equal(s.writes.length,0);
 }
});
test('badge STAR requires persisted reservations and dispatch intent; persistence failure sends nothing',async t=>{
 for(const kind of ['budget','intent']){
  const f=fixture(t,{star:true}),service=f.newService(f.history),s=f.newSession(),p=await f.displayed(service,s);
  f.failPersist(record=>kind==='budget'?(record.runBudget?.reserved.resources??[]).some(row=>row.id==='徽章升星石'):record.actions?.some(row=>row.dispatchEvidence?.state==='MAY_HAVE_DISPATCHED'));
  try{service.execute(s,service.authorize(s,f.permitPayload(p)));await service.settle(account);assert.equal(s.writes.length,0);assert.notEqual(service.status(account).finalStatus,'SUCCESS');}finally{f.failPersist(()=>false);}
 }
});
test('badge STAR cancellation before dispatch sends nothing; after dispatch late typed success never clears UNKNOWN',async t=>{
 for(const before of [true,false]){
  const f=fixture(t,{star:true}),service=f.newService(f.history),s=f.newSession(),p=await f.displayed(service,s),permit=service.authorize(s,f.permitPayload(p));
  let finish;
  if(before){s.abort.abort();try{service.execute(s,permit);await service.settle(account);}catch{}assert.equal(s.writes.length,0);}
  else{
   s.onWrite=()=>new Promise(resolve=>{finish=resolve;});service.execute(s,permit);
   for(let i=0;i<100&&!finish;i++)await new Promise(setImmediate);assert.ok(finish);service.stop(account);finish(wire('BadgeStarResponse',{}));await service.settle(account);
   const run=f.newHistory().list(account)[0];assert.equal(run.finalStatus,'UNKNOWN');assert.equal(run.actions[0].unresolvedWrite,true);assert.deepEqual(run.runBudget.reserved,starClaims);
   await assert.rejects(f.displayed(service,s));assert.equal(s.writes.length,1);
  }
 }
});
for(const mode of ['enough','stone-short','gold-short','uid-missing'])test('badge STAR Workflow shares parent budget and requires per-batch authorization: '+mode,async t=>{
 const f=fixture(t,{star:true}),service=f.newService(f.history),s=f.newSession(),preview=await service.surveyModule(s,moduleId,starParameters);
 const claims=structuredClone(starClaims);if(mode==='stone-short')claims.resources[0].num=0;if(mode==='gold-short')claims.resources[1].num=499999;if(mode==='uid-missing')claims.uids=[];
 const graph={version:1,id:'badge-star-'+mode,name:'Offline badge star',budget:claims,nodes:[{id:'s',type:'START'},{id:'a',type:'ACTION',module:moduleId,parameters:starParameters,selection:preview.view.candidates.find(row=>row.executable).actionId},{id:'v',type:'VERIFY',module:moduleId},{id:'z',type:'STOP'}],edges:[{from:'s',to:'a'},{from:'a',to:'v'},{from:'v',to:'z'}]};
 const runner=createWorkflowRunner({operations:service,modules:GAMEPLAY_MODULES,getSession:id=>id===account?s:null,claim:(id,runId,opts)=>service.claimWorkflow(s,runId,opts),isCurrent:(target,generation,client)=>target===s&&target.generation===generation&&target.client===client});
 t.after(async()=>{runner.stop();await runner.settle();});
 const first=await runner.start(account,graph);assert.equal(first.status,'AWAITING_AUTHORIZATION');assert.equal(s.writes.length,0);
 if(mode==='enough'){await executeStar(f,service,s,first.plan);assert.equal((await runner.resume()).status,'COMPLETED');assert.equal(s.writes.length,1);}
 else {assert.throws(()=>service.execute(s,service.authorize(s,f.permitPayload(first.plan))),{code:'RUN_BUDGET_INVALID'});assert.equal(s.writes.length,0);}
});
test('badge STAR and LEVEL reserve the same instance in one cumulative parent',async t=>{
 const f=fixture(t,{star:true}),service=f.newService(f.history),s=f.newSession();let release;
 try{
  const limits=structuredClone(starClaims);limits.resources[1].num+=100;limits.resources.push({id:xp,num:5});release=service.claimWorkflow(s,'star-level-parent',{limits});
  const p=await f.displayed(service,s,starParameters,'star-level-parent');assert.equal((await executeStar(f,service,s,p)).run.finalStatus,'SUCCESS');
  // LEVEL remains the original zero-XP operation; use its current catalog after
  // STAR to test shared instance ownership rather than a stale pre-star plan.
  f.config.tables.HeroBadgeLevelCfg.data[1].exp=5;
  const level=await f.displayed(service,s,parameters,'star-level-parent');
  try{service.execute(s,service.authorize(s,f.permitPayload(level)));await service.settle(account);}catch{}
  assert.notEqual(service.status(account).finalStatus,'SUCCESS');assert.equal(s.writes.length,1);
  assert.deepEqual(service.workflowBudget(account).reserved.uids,uidClaim);
 }finally{release?.();}
});

for(const mode of ['level','star','put-on'])test('W19 badge '+mode+' refusal survives restart, reconnect and role return',async t=>{
 const f=fixture(t,{effect:'none',star:mode==='star',putOn:mode==='put-on'}),service=f.newService(f.history),a=f.newSession();
 if(mode==='put-on'){const send=a.client.sendWatch.bind(a.client);a.client.sendWatch=async(...args)=>{await send(...args);return {status:'REJECTED'};};}else a.onWrite=()=>{throw Object.assign(Error('synthetic definite badge refusal'),{code:'REJECTED'});};
 const p=await f.displayed(service,a),permit=service.authorize(a,f.permitPayload(p));service.execute(a,permit);await service.settle(account);assert.equal(f.newHistory().list(account)[0].finalStatus,'REJECTED');const bytes=fs.readFileSync(f.file,'utf8');
 const next=f.newService(),b=f.newSession(2);await assert.rejects(f.displayed(next,b),{code:'REJECTION_MEMORY_ACTIVE'});b.player.worldId='10';assert.equal((await f.displayed(next,b)).actions.length,1);b.player.worldId='9';await assert.rejects(f.displayed(next,b),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(b.writes.length,0);assert.equal(fs.readFileSync(f.file,'utf8'),bytes);
});
