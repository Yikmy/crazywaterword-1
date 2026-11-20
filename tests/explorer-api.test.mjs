import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Only synthetic accounts; no GameClient, certificate or game network is used.
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-explorer-api-'));
process.env.CW_DATA_DIR = sandbox;
const { dailyChecklist } = await import('../src/daily-checklist.mjs');
const { getConfig } = await import('../src/config.mjs');
const { DATA_DIR: parsedDataDir } = await import('../src/accounts.mjs');
assert.equal(parsedDataDir, sandbox, 'all domain imports must follow test account-store isolation');
const { createConsole } = await import('../src/server.mjs');
const { saveStore } = await import('../src/accounts.mjs');
const token = 'explorer-synthetic-token', sign = 'explorer-synthetic-sign';
const account = (id) => ({ id, label: id === 'account-A' ? 'Alias A' : id, url: 'wss://example.invalid/ws', login: { eworldParams: { openId: id, token, sign, timestamp: 1 } } });
async function harness() {
  saveStore({ version: 1, activeId: 'account-A', accounts: [account('account-A'), account('account-B')] });
  let creates = 0, collects = 0;
  const app = createConsole({ port: 0, protocol: {}, tracePath: path.join(sandbox, 'trace.log'), clientFactory: () => { creates++; throw Error('Explorer must never create a client'); }, collect: (client) => { collects++; assert.ok(client.syntheticSnapshot, 'only explicitly staged synthetic collection is allowed'); return client.syntheticSnapshot; } });
  await app.listen();
  const call = (query = '', method = 'GET', endpoint = '/api/data-explorer') => new Promise((resolve, reject) => {
    const req = http.request('http://127.0.0.1:' + app.server.address().port + endpoint + query, { method, headers: { connection: 'close' } }, (res) => {
      let text = ''; res.setEncoding('utf8'); res.on('data', (chunk) => text += chunk); res.on('end', () => resolve({ status: res.statusCode, text, data: JSON.parse(text) }));
    });
    req.on('error', reject); req.end();
  });
  return { ...app, call, counts: () => ({ creates, collects }) };
}
async function bindCached(app, id, snapshot, at) {
  const session = {...cached(snapshot, at), id, state:'READY', connectionId:'synthetic-'+id, player:{playerId:id==='account-A'?'1':'2',worldId:'17'}, client:{connected:true,syntheticSnapshot:snapshot,stop(){}}};
  app.sessions.set(id, session);
  const refreshed=await app.call('?account='+id,'POST','/api/refresh');
  assert.equal(refreshed.status,200,JSON.stringify(refreshed.data));
  session.snapshotAt=at;session.snapshotStale=true;
}
function cached(snapshot, at) {
  return { id: at, snapshot, snapshotAt: at, snapshotStale: true, generation: 0, abort: new AbortController(), loop: { stop: { aborted: false }, running: false }, client: null };
}

test('Explorer reads a named account without allocating a Runtime, client or collection', async () => {
  const app = await harness();
  try {
    for (let i = 0; i < 3; i++) {
      const response = await app.call('?account=account-A'); assert.equal(response.status, 200); assert.equal(response.data.accountId, 'account-A');
      assert.equal(response.data.total, 48); assert.equal(response.data.domains.length, 12); assert.equal(response.data.entries.length, 48);
      assert.ok(response.data.entries.every(({ status }) => status === 'NOT_EXECUTED'));
    }
    assert.equal(app.sessions.size, 0); assert.deepEqual(app.counts(), { creates: 0, collects: 0 });
  } finally { await app.close(); }
});

test('Explorer requires exact account IDs and never falls back to active account, label or index', async () => {
  const app = await harness();
  try {
    assert.equal((await app.call()).status, 400);
    for (const id of ['unknown', 'account', 'Alias A', '1']) assert.equal((await app.call('?account=' + encodeURIComponent(id))).status, 404);
    assert.equal(app.sessions.size, 0); assert.deepEqual(app.counts(), { creates: 0, collects: 0 });
  } finally { await app.close(); }
});

test('separate accounts return only their own snapshot and preserve concurrent reads', async () => {
  const app = await harness();
  try {
    for (const id of ['account-A', 'account-B']) await bindCached(app,id,{ ok: { AllItemRequest: { items: [{ itemId: id, num: 3 }] } }, failed: {} },id+'-time');
    const before=app.counts();assert.deepEqual(before,{creates:0,collects:2});
    const [a, b] = await Promise.all([app.call('?account=account-A'), app.call('?account=account-B')]);
    assert.equal(a.data.updatedAt, 'account-A-time'); assert.equal(b.data.updatedAt, 'account-B-time'); assert.equal(a.data.stale, true);
    assert.equal(a.data.entries[0].raw.items[0].itemId, 'account-A'); assert.equal(b.data.entries[0].raw.items[0].itemId, 'account-B');
    assert.equal(a.text.includes('account-B-time'), false); assert.equal(b.text.includes('account-A-time'), false); assert.deepEqual(app.counts(),before);
  } finally { await app.close(); }
});

test('Explorer domain filtering uses the same catalog; invalid domains fail without side effects', async () => {
  const app = await harness();
  try {
    const response = await app.call('?account=account-A&domain=orders'); assert.equal(response.status, 200); assert.equal(response.data.total, 48);
    assert.ok(response.data.entries.some(({ request }) => request === 'OnWaterRequest')); assert.ok(response.data.entries.every(({ domains }) => domains.includes('orders')));
    assert.equal((await app.call('?account=account-A&domain=unknown')).status, 400); assert.equal((await app.call('?account=account-A', 'POST')).status, 403);
    assert.equal(app.sessions.size, 0); assert.deepEqual(app.counts(), { creates: 0, collects: 0 });
  } finally { await app.close(); }
});

test('raw and parsed data remain visible together, failures stay null, exports are safely redacted and lossless', async () => {
  const app = await harness();
  try {
    await bindCached(app,'account-A',{
      ok: { AllItemRequest: { items: [{ itemId: 'wood', num: 8 }] }, BadgesRequest: { badges: [{ id: 5 }] } },
      raw: { AllItemRequest: { items: [{ itemId: 'wood', num: 8 }], serial: '18446744073709551615', nested: [{ Token: token, SIGN: sign }], message: token + '/' + sign }, BadgesRequest: { badges: [{ id: 5 }], huge: 9223372036854775807n } },
      failed: { AllHeroRequest: 'timeout ' + token, EquipsRequest: 'missing response' },
      outcomes: { AllHeroRequest: { status: 'FAILED', error: 'timeout ' + token, updatedAt: 'failed-time' }, EquipsRequest: { status: 'NOT_EXECUTED', error: 'missing response' } },
    }, 'snapshot-time');
    const before=app.counts();assert.deepEqual(before,{creates:0,collects:1});
    const response = await app.call('?account=account-A'); assert.equal(response.status, 200);
    const byName = new Map(response.data.entries.map((entry) => [entry.request, entry]));
    assert.equal(byName.get('AllItemRequest').raw.serial, '18446744073709551615'); assert.equal(byName.get('AllItemRequest').parsed.items.total, 8);
    assert.equal(byName.get('BadgesRequest').raw.huge, '9223372036854775807'); assert.deepEqual(byName.get('BadgesRequest').parsed, {badges:{count:null,list:null}});
    assert.equal(byName.get('AllHeroRequest').status, 'FAILED'); assert.equal(byName.get('AllHeroRequest').raw, null); assert.equal(byName.get('AllHeroRequest').parsed, null);
    assert.equal(byName.get('EquipsRequest').status, 'FAILED'); assert.equal(byName.get('EquipsRequest').raw, null); assert.equal(byName.get('EquipsRequest').parsed, null);
    for (const secret of [token, sign]) assert.equal(response.text.includes(secret), false); assert.ok(response.text.includes('[REDACTED]'));
    assert.deepEqual(app.counts(),before);
  } finally { await app.close(); }
});

test.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));


test('overview and Explorer expose only the selected cached fishing sources without game requests', async () => {
  const app = await harness();
  try {
    const config = (await import('../src/config.mjs')).getConfig();
    assert.ok(config.tables.FishStageCfg.data.length);
    for (const id of ['account-A', 'account-B']) {
      const ok = {
        AllItemRequest: { items: [{ itemId: '鱼', num: id === 'account-A' ? '9007199254740993' : 2 }] },
        GameEffectRequest: { effects: [{ id: 16, value: 100 }] },
        FishEncyclopediaRequest: { fishList: [14, 7, 2, 1], rewardId: 1 },
        OnWaterRequest: { fishingLevel: { level: 2, enhance: 0, criticalRate: 0 } },
      };
      const outcomes = Object.fromEntries(Object.keys(ok).map(key => [key, { status: 'SUCCESS' }]));
      await bindCached(app,id,{ ok, raw: structuredClone(ok), outcomes, failed: {} },id+'-time');
    }
    const before=app.counts();assert.deepEqual(before,{creates:0,collects:2});
    const [a, b] = await Promise.all(['account-A', 'account-B'].map(id => app.call('?account=' + id, 'GET', '/api/overview')));
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    assert.equal(a.data.accountId, 'account-A'); assert.equal(b.data.accountId, 'account-B');
    assert.equal(a.data.fishing.inventory.owned, '9007199254740993');
    assert.equal(b.data.fishing.inventory.owned, 2);
    assert.equal(a.data.fishing.collection.availableScore, 50);
    assert.equal(a.data.fishing.collection.nextStage.eligible, true);
    assert.equal(a.data.fishing.pendingCatch.status, 'UNKNOWN');
    assert.equal(a.data.snapshotStale, true);
    assert.equal(b.text.includes('9007199254740993'), false);
    const state = app.sessions.get('account-A').snapshot;
    state.failed.GameEffectRequest = 'synthetic capacity failure';
    state.outcomes.GameEffectRequest.status = 'FAILED';
    const failed = await app.call('?account=account-A', 'GET', '/api/overview');
    assert.equal(failed.data.snapshotStatus, 'PARTIAL');
    assert.equal(failed.data.fishing.inventory.capacity, null);
    assert.equal(failed.data.fishing.inventory.owned, '9007199254740993');
    assert.equal(failed.data.fishing.collection.availableScore, 50);
    const explorer = await app.call('?account=account-A&domain=collections');
    const entries = new Map(explorer.data.entries.map(row => [row.request, row]));
    assert.equal(entries.get('GameEffectRequest').parsed, null);
    assert.equal(entries.get('AllItemRequest').parsed['fishing.inventory.owned'], '9007199254740993');
    assert.equal(entries.get('FishEncyclopediaRequest').parsed['fishing.collection'].nextStage.eligible, true);
    assert.deepEqual(app.counts(),before);
  } finally { await app.close(); }
});


test('daily checklist preserves independent parsing but unbound restored HTTP snapshots never regain task qualifications', async () => {
  const app=await harness();
  try {
    for(const id of ['account-A','account-B']) {
      const raw={DailyTaskInfoRequest:{dailyTask:[{id:1001,progress:id==='account-A'?1:0,targetProgress:1,rewardClaimed:false}],dailyActivity:40,weeklyActivity:85,dailyRewardClaimed:[],weeklyRewardClaimed:[],dailyResetTime:1780000000},
        DailyGiftPackRequest:{drawnPack:id==='account-A'?[]:['赠礼'],heroId:id,resetTime:1780000000},
        AchievementInfoRequest:{task:[{id:1001,progress:id==='account-A'?'9007199254740993':'0',targetProgress:'9007199254740993',rewardClaimed:false}]},
        AfkInfoRequest:{clickGoldInfo:{freeTimes:id==='account-A'?0:3,paidTimes:0,minGold:3000,resetTime:1780000000,maxPaidTimes:7}}};
      const snapshot={raw,ok:structuredClone(raw),outcomes:Object.fromEntries(Object.keys(raw).map(name=>[name,{status:'SUCCESS',updatedAt:'2026-11-12T01:00:00Z'}])),failed:{}};
      app.sessions.set(id,cached(snapshot,id+'-time'));
    }
    app.sessions.get('account-A').snapshot.sessionFacts={vipLevel:{status:'OBSERVED',reliable:true,vipLevel:2,source:'SCVipUpdate',reason:null,accountId:'account-A',generation:0,connectionId:'offline-A',playerId:'9007199254740993',worldId:'17',observedAt:Date.now()}};
    const before=JSON.stringify([...app.sessions].map(([id,s])=>[id,s.snapshot]));
    const [a,b]=await Promise.all(['account-A','account-B'].map(id=>app.call('?account='+id,'GET','/api/dailies')));
    assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.data.accountId,'account-A');assert.equal(b.data.accountId,'account-B');
    // Retain the original offline arithmetic assertions; restored HTTP state has no live binding.
    const parsed=id=>dailyChecklist(app.sessions.get(id).snapshot,{config:getConfig()}),observedA=parsed('account-A'),observedB=parsed('account-B');
    assert.equal(observedA.tasks.counts.eligible,1);assert.equal(observedB.tasks.counts.eligible,0);
    assert.equal(observedA.gift.eligible,true);assert.equal(observedB.gift.eligible,false);assert.equal(observedA.achievements.rows[0].progress,'9007199254740993');assert.equal(observedA.achievements.counts.eligible,1);assert.equal(observedB.achievements.counts.eligible,0);assert.equal(observedA.achievements.rows[0].configuredRewards,null);assert.equal(observedA.activity.weekly.tiers[0].eligible,false);
    for(const response of [a,b]){assert.equal(response.data.checklist.tasks.counts.eligible,null);assert.equal(response.data.checklist.gift.eligible,null);assert.equal(response.data.checklist.achievements.counts.eligible,null);assert.deepEqual(response.data.checklist.achievements.rows,[]);assert.equal(response.data.checklist.activity.weekly.tiers[0].eligible,null);assert.equal(response.data.executable,false);assert.deepEqual(response.data.tasks,[]);}
    assert.equal(a.data.checklist.vip.vipLevel,2);assert.equal(b.data.checklist.vip.vipLevel,null);assert.equal(a.data.checklist.vip.eligible,null);
    assert.equal(a.data.checklist.freeGold.remaining,3);assert.equal(b.data.checklist.freeGold.remaining,0);assert.equal(a.data.checklist.freeGold.executable,false);
    assert.equal(a.data.stale,true);
    assert.equal(b.text.includes('account-A'),false);assert.equal(a.text.includes('account-B'),false);
    assert.equal(JSON.stringify([...app.sessions].map(([id,s])=>[id,s.snapshot])),before);
    app.sessions.get('account-A').snapshot.failed.DailyTaskInfoRequest='token=hidden';
    const partial=await app.call('?account=account-A','GET','/api/dailies');
    assert.equal(partial.status,200);assert.equal(partial.data.checklist.tasks.counts.total,null);assert.equal(partial.data.checklist.gift.eligible,null);assert.doesNotMatch(partial.text,/hidden/);
    const other=await app.call('?account=account-B','GET','/api/dailies');assert.equal(other.data.checklist.tasks.counts.total,null);
    app.sessions.get('account-A').snapshot.outcomes.AchievementInfoRequest.status='FAILED';app.sessions.get('account-A').snapshot.outcomes.AfkInfoRequest.status='UNKNOWN';
    const noStale=await app.call('?account=account-A','GET','/api/dailies');assert.equal(noStale.data.checklist.achievements.counts.total,null);assert.equal(noStale.data.checklist.freeGold.remaining,null);assert.equal(noStale.data.checklist.gift.eligible,null);
    const intact=await app.call('?account=account-B','GET','/api/dailies');assert.equal(intact.data.checklist.achievements.counts.total,null);assert.equal(intact.data.checklist.freeGold.remaining,0);
    const malformed=app.sessions.get('account-A').snapshot;
    delete malformed.failed.DailyTaskInfoRequest;malformed.ok.DailyTaskInfoRequest={dailyTask:{invalid:true}};
    for(const name of ['AllItemRequest','AllResourceRequest','AfkInfoRequest','RecruitInfoRequest'])malformed.ok[name]={};
    const independent=await app.call('?account=account-A','GET','/api/dailies');assert.equal(independent.status,200);assert.equal(independent.data.checklist.gift.eligible,null);assert.equal(independent.data.checklist.tasks.counts.eligible,null);
    assert.equal(parsed('account-A').tasks.counts.eligible,1);assert.equal(parsed('account-A').gift.eligible,true);assert.equal(parsed('account-B').tasks.counts.total,1);assert.equal(parsed('account-B').achievements.counts.total,1);
    assert.deepEqual(app.counts(),{creates:0,collects:0});
  } finally {await app.close();}
});


for (const change of ['account','player','world','generation','connection','client','disconnected','not-ready','snapshot']) {
  test('fishing cached HTTP projections invalidate permanently after '+change+' changes', async () => {
    const app=await harness();
    try {
      const raw={
        AllItemRequest:{items:[{itemId:'鱼',num:88}]},
        GameEffectRequest:{effects:[{id:16,value:100}]},
        FishEncyclopediaRequest:{fishList:[14,7,2,1],rewardId:1},
        OnWaterRequest:{fishingLevel:{level:2,enhance:0,criticalRate:0}},
      };
      const snapshot={raw,ok:structuredClone(raw),outcomes:Object.fromEntries(Object.keys(raw).map(name=>[name,{status:'SUCCESS'}])),failed:{}};
      await bindCached(app,'account-A',snapshot,'fishing-context-time');
      const session=app.sessions.get('account-A');
      const initial=(await app.call('?account=account-A','GET','/api/overview')).data.fishing;
      assert.equal(initial.collection.nextStage.eligible,true);
      assert.equal(initial.inventory.owned,88);
      const original={id:session.id,player:{...session.player},generation:session.generation,connectionId:session.connectionId,client:session.client,state:session.state,snapshot:session.snapshot};
      if(change==='account')session.id='account-B';
      if(change==='player')session.player.playerId='9';
      if(change==='world')session.player.worldId='99';
      if(change==='generation')session.generation++;
      if(change==='connection')session.connectionId='other-connection';
      if(change==='client')session.client={...session.client};
      if(change==='disconnected')session.client.connected=false;
      if(change==='not-ready')session.state='DISCONNECTED';
      if(change==='snapshot')session.snapshot=structuredClone(snapshot);
      const before=app.counts();
      const invalid=(await app.call('?account=account-A','GET','/api/overview')).data.fishing;
      assert.equal(invalid.collection.rewardId,null);
      assert.equal(invalid.collection.nextStage,null);
      assert.equal(invalid.inventory.owned,null);
      assert.equal(invalid.inventory.capacity,null);
      assert.equal(invalid.level.level,null);
      const explorer=await app.call('?account=account-A&domain=collections');
      const fish=explorer.data.entries.find(row=>row.request==='FishEncyclopediaRequest');
      assert.equal(fish.parsed,null);
      assert.notEqual(fish.status,'SUCCESS');
      Object.assign(session,original);session.client.connected=true;
      const reverted=(await app.call('?account=account-A','GET','/api/overview')).data.fishing;
      assert.equal(reverted.collection.rewardId,null,'reverting identity cannot revive invalidated cache');
      assert.equal(reverted.collection.nextStage,null);
      assert.equal(reverted.inventory.owned,null);
      assert.deepEqual(app.counts(),before);
      const refreshed=await app.call('?account=account-A','POST','/api/refresh');
      assert.equal(refreshed.status,200);
      const rebound=(await app.call('?account=account-A','GET','/api/overview')).data.fishing;
      assert.equal(rebound.collection.nextStage.eligible,true);
      assert.equal(rebound.inventory.owned,88);
      assert.deepEqual(app.counts(),{creates:0,collects:before.collects+1});
    } finally {await app.close();}
  });
}


test('fishing restored snapshots and explicit source failures cannot surface prior qualifications',async()=>{
  const app=await harness();
  try {
    const raw={AllItemRequest:{items:[{itemId:'鱼',num:88}]},GameEffectRequest:{effects:[{id:16,value:100}]},
      FishEncyclopediaRequest:{fishList:[14,7,2,1],rewardId:1},OnWaterRequest:{fishingLevel:{level:2,enhance:0,criticalRate:0}}};
    const snapshot={raw,ok:structuredClone(raw),outcomes:Object.fromEntries(Object.keys(raw).map(name=>[name,{status:'SUCCESS'}])),failed:{}};
    app.sessions.set('account-A',cached(snapshot,'restored-time'));
    const restored=(await app.call('?account=account-A','GET','/api/overview')).data.fishing;
    assert.equal(restored.collection.nextStage,null);
    assert.equal(restored.collection.rewardId,null);
    assert.equal(restored.inventory.owned,null);
    assert.equal(restored.inventory.capacity,null);
    assert.deepEqual(app.counts(),{creates:0,collects:0});
    await bindCached(app,'account-A',snapshot,'current-time');
    assert.equal((await app.call('?account=account-A','GET','/api/overview')).data.fishing.collection.nextStage.eligible,true);
    snapshot.failed.FishEncyclopediaRequest='synthetic failure';
    snapshot.outcomes.FishEncyclopediaRequest.status='FAILED';
    const failed=(await app.call('?account=account-A','GET','/api/overview')).data.fishing;
    assert.equal(failed.collection.rewardId,null);
    assert.equal(failed.collection.nextStage,null);
    assert.equal(failed.inventory.owned,88);
    const explorer=await app.call('?account=account-A&domain=collections');
    const fish=explorer.data.entries.find(row=>row.request==='FishEncyclopediaRequest');
    assert.equal(fish.status,'FAILED');
    assert.equal(fish.parsed,null);
    assert.deepEqual(app.counts(),{creates:0,collects:1});
  } finally {await app.close();}
});


test('remaining cached summaries expose exact selected-account business details through original read-only API',async()=>{
 const app=await harness();try{
  const raw={BadgesRequest:{badge:[{uid:'9007199254740993',badgeId:'徽章甲',level:0,exp:0,star:0}]},GuildOrderRequest:{order:{requirements:[{type:0,id:'木材',num:'9007199254740995'}],nextRefreshTime:200}},RadarInfoRequest:{radarInfo:{level:1,events:[],fixedEvent:{eventId:4,gridIdx:5,state:0}}},SeasonCardRequest:{isPaid:false,gotDaily:false,customId:[]}};
  await bindCached(app,'account-A',{ok:structuredClone(raw),raw,failed:{}},'2026-11-20T01:00:00Z');
  const before=app.counts(),a=await app.call('?account=account-A'),b=await app.call('?account=account-B');assert.equal(a.status,200);assert.equal(b.status,200);
  const rows=new Map(a.data.entries.map(row=>[row.request,row]));assert.equal(rows.get('BadgesRequest').parsed.badges.list[0].uid,'9007199254740993');assert.equal(rows.get('GuildOrderRequest').parsed.guildOrder.requirements[0].num,'9007199254740995');assert.deepEqual(rows.get('RadarInfoRequest').parsed.radar.events,[]);assert.equal(rows.get('RadarInfoRequest').parsed.radar.fixedEvent.eventId,4);assert.equal(rows.get('SeasonCardRequest').parsed.seasonCard.isPaid,false);assert.ok(a.data.entries.every(row=>row.readOnly===true&&row.executable===false));assert.ok(b.data.entries.every(row=>row.parsed===null&&row.raw===null));assert.deepEqual(app.counts(),before);
  const filtered=await app.call('?account=account-A&domain=guild');assert.equal(filtered.status,200);assert.equal(filtered.data.entries.find(row=>row.request==='GuildOrderRequest').parsed.guildOrder.requirements[0].id,'木材');assert.deepEqual(app.counts(),before);
 }finally{await app.close();}
});
