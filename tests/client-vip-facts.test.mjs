import { dailyChecklist } from '../src/daily-checklist.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameClient, readVipLevelEvent, readPlayerLevelEvent, readDailyResetEvent, readDailyTaskProgressEvent, readFestivalActivitySnapshot, LIVE_VIP_LEVEL_EVIDENCE, MAX_SEQ } from '../src/client.mjs';
import { createCodec } from '../src/codec.mjs';
import { loadProtocol } from '../src/proto.mjs';
import { collectState, ENTRY_QUERIES, summarize, formatState } from '../src/game.mjs';

const protocol = loadProtocol(), codec = createCodec(protocol);
const player = (vipLevel = 0) => ({ playerId: '9007199254740993', worldId: '9', vip: { vipLevel, vipExp: '0' } });
const login = (vipLevel = 0) => ({ result: 0, initSeqNo: 12, playerInfo: player(vipLevel) });
function fixture({ accountId = 'vip-account', generation = 3, connectionId = 'vip-connection' } = {}) {
  const sockets = [], errors = [];
  class Socket {
    constructor() { this.readyState = 0; this.sent = []; this.closes = []; sockets.push(this); }
    send(bytes) { assert.equal(this.readyState, 1); this.sent.push(codec.decode(bytes)); }
    close(code, reason) { this.readyState = 3; this.closes.push({ code, reason }); }
    open() { this.readyState = 1; this.onopen?.(); }
    receive(name, body, seq = 0) { this.onmessage?.({ data: codec.encode(name, seq, body) }); }
    end() { this.readyState = 3; this.onclose?.({ code: 1006 }); }
  }
  const client = new GameClient({ protocol, accountId, generation, WebSocketImpl: Socket });
  client.factContext = { accountId, generation, ...(connectionId === null ? {} : { connectionId }) };
  client.on('error', error => errors.push(error));
  async function ready(body = login(), beforeReply) {
    const pending = client.connect({}), socket = sockets.at(-1); socket.open(); beforeReply?.(socket);
    socket.receive('LoginResponse', body); await pending; return socket;
  }
  return { client, sockets, errors, ready };
}
const current = (client, level, source = 'LoginResponse.playerInfo.vip') => {
  const result = client.readVipLevel();
  assert.equal(result.status, 'CURRENT'); assert.equal(result.reliable, true); assert.equal(result.vipLevel, level);
  assert.equal(result.source, source); assert.equal(result.reason, null);
  assert.equal(result.playerId, '9007199254740993'); assert.equal(result.worldId, '9');
  return result;
};
const unknown = (client, reason) => {
  const result = client.readVipLevel();
  assert.equal(result.status, 'UNKNOWN'); assert.equal(result.reliable, false);
  assert.equal(result.vipLevel, null); assert.equal(result.source, null);
  if (reason) assert.equal(result.reason, reason);
  return result;
};

test('real GameClient seeds explicit zero VIP before READY listeners and returns independent plain exact-ID facts', async t => {
  const f = fixture(); t.after(() => f.client.stop());
  unknown(f.client);
  let duringReady; f.client.on('state', ({ state }) => { if (state === 'READY') duringReady = f.client.readVipLevel(); });
  await f.ready(login(0));
  assert.equal(duringReady.status, 'CURRENT'); assert.equal(duringReady.vipLevel, 0);
  const result = current(f.client, 0);
  assert.deepEqual(Object.keys(result), ['status', 'reliable', 'vipLevel', 'source', 'reason', 'accountId', 'generation', 'connectionId', 'playerId', 'worldId']);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.deepEqual([result.accountId, result.generation, result.connectionId], ['vip-account', 3, 'vip-connection']);
  result.vipLevel = 999; result.playerId = '5'; current(f.client, 0);
  f.client.loginResponse.playerInfo.vip.vipLevel = 99; current(f.client, 0);
  assert.equal(Object.keys(f.client).some(key => /vip/i.test(key)), false);
  assert.equal(LIVE_VIP_LEVEL_EVIDENCE.modelManager.methodByteOffset, 4664885);
});

test('missing wire scalar defaults never become login VIP zero or explicit login success', async t => {
  const variants = [
    { initSeqNo: 12, playerInfo: player() },
    { result: 0, playerInfo: { ...player(), vip: { vipExp: '0' } } },
    { result: 0, playerInfo: { ...player(), vip: {} } },
    { result: 0, playerInfo: { playerId: '17', worldId: '9' } },
    { result: 0, playerInfo: { worldId: '9', vip: { vipLevel: 0 } } },
    { result: 0, playerInfo: { playerId: '17', vip: { vipLevel: 0 } } },
    { result: 0, playerInfo: { ...player(), playerId: '0' } },
    { result: 0, playerInfo: { ...player(), worldId: '0' } },
    { result: 0, playerInfo: player(-1) },
  ];
  for (const body of variants) {
    const f = fixture(); t.after(() => f.client.stop()); const socket = await f.ready(body);
    assert.equal(f.client.connected, true); unknown(f.client);
    socket.receive('SCVipUpdate', { vipLevel: 5 }, 1); unknown(f.client);
  }
});

test('accepted sequenced VIP updates replace level before message listeners and ignore unrelated vipExp availability', async t => {
  const f = fixture(); t.after(() => f.client.stop()); const socket = await f.ready(login(1));
  let observed; f.client.on('message', ({ name }) => { if (name === 'SCVipUpdate') observed = f.client.readVipLevel(); });
  socket.receive('SCVipUpdate', { vipLevel: 4 }, 1);
  assert.equal(observed.vipLevel, 4); current(f.client, 4, 'SCVipUpdate');
  socket.receive('SCVipUpdate', { vipLevel: 0, vipExp: '99' }, 2); current(f.client, 0, 'SCVipUpdate');
});

test('missing or invalid push level permanently invalidates this connection, even after later complete updates', async t => {
  for (const body of [{ vipExp: '99' }, {}, { vipLevel: -1 }]) {
    const f = fixture(); t.after(() => f.client.stop()); const socket = await f.ready(login(2));
    socket.receive('SCVipUpdate', body, 1); unknown(f.client, 'VIP_LEVEL_NOT_EXPLICIT_OR_INVALID');
    socket.receive('SCVipUpdate', { vipLevel: 8 }, 2); unknown(f.client, 'VIP_LEVEL_NOT_EXPLICIT_OR_INVALID');
    f.client.stop(); await f.ready(login(3)); current(f.client, 3);
  }
});

test('sequence gap invalidates VIP before drop observers; recovered contiguous delivery cannot renew the old baseline', async t => {
  const f = fixture(); t.after(() => f.client.stop()); const socket = await f.ready(login(1));
  socket.receive('SCVipUpdate', { vipLevel: 2 }, 1); current(f.client, 2, 'SCVipUpdate');
  let dropped; f.client.on('drop', event => { if (event.reason === 'gap') dropped = f.client.readVipLevel(); });
  socket.receive('SCVipUpdate', { vipLevel: 4 }, 3);
  assert.equal(dropped.status, 'UNKNOWN'); unknown(f.client, 'VIP_STREAM_SEQUENCE_GAP');
  assert.equal(socket.sent.filter(row => row.name === 'Nack').length, 1);
  socket.receive('SCVipUpdate', { vipLevel: 3 }, 2); socket.receive('SCVipUpdate', { vipLevel: 4 }, 3);
  unknown(f.client, 'VIP_STREAM_SEQUENCE_GAP');
});

test('duplicate delivery changes neither current VIP nor authority, and valid sequence wrap stays continuous', async t => {
  const f = fixture(); t.after(() => f.client.stop()); const socket = await f.ready(login(1));
  socket.receive('SCVipUpdate', { vipLevel: 2 }, MAX_SEQ);
  socket.receive('SCVipUpdate', { vipLevel: 99 }, MAX_SEQ); current(f.client, 2, 'SCVipUpdate');
  socket.receive('SCVipUpdate', { vipLevel: 3 }, 1); current(f.client, 3, 'SCVipUpdate');
  socket.receive('SCVipUpdate', {}, 1); current(f.client, 3, 'SCVipUpdate');
});

test('decode failure invalidates authority before error listeners and later valid frames cannot recover it', async t => {
  const f = fixture(); t.after(() => f.client.stop()); const socket = await f.ready(login(2));
  let atError; f.client.on('error', () => { atError = f.client.readVipLevel(); });
  socket.onmessage({ data: new Uint8Array([1, 2, 3]) });
  assert.equal(atError.status, 'UNKNOWN'); unknown(f.client, 'VIP_STREAM_DECODE_FAILED');
  socket.receive('SCVipUpdate', { vipLevel: 4 }, 1); unknown(f.client, 'VIP_STREAM_DECODE_FAILED');
});

test('unsequenced VIP pushes cannot establish ordered continuous authority', async t => {
  const f = fixture(); t.after(() => f.client.stop()); const socket = await f.ready(login(2));
  socket.receive('SCVipUpdate', { vipLevel: 3 }, 0); unknown(f.client, 'VIP_UPDATE_SEQUENCE_UNKNOWN');
  socket.receive('SCVipUpdate', { vipLevel: 4 }, 1); unknown(f.client, 'VIP_UPDATE_SEQUENCE_UNKNOWN');
});

test('terminal paths clear VIP before state observers; relogin creates a fresh socket baseline and ignores old socket closures', async t => {
  const f = fixture(); t.after(() => f.client.stop()); const oldSocket = await f.ready(login(2)), oldMessage = oldSocket.onmessage, oldClose = oldSocket.onclose;
  let ended; f.client.on('state', ({ state }) => { if (state === 'STOPPED') ended = f.client.readVipLevel(); });
  f.client.stop(); assert.equal(ended.status, 'UNKNOWN'); unknown(f.client);
  const fresh = await f.ready(login(5)); current(f.client, 5);
  oldMessage({ data: codec.encode('SCVipUpdate', 1, { vipLevel: 99 }) }); oldClose({ code: 1006 });
  current(f.client, 5); assert.equal(f.client.socket, fresh);
  fresh.end(); unknown(f.client); await f.ready(login(6)); current(f.client, 6);
});

test('connection identity or owner context changes fail closed and restoring public context cannot revive a baseline', async t => {
  for (const key of ['accountId', 'generation', 'connectionId']) {
    const f = fixture(); t.after(() => f.client.stop()); await f.ready(login(2));
    const old = f.client.factContext[key]; f.client.factContext[key] = key === 'generation' ? old + 1 : 'changed';
    unknown(f.client, 'VIP_CONTEXT_UNKNOWN_OR_CHANGED'); f.client.factContext[key] = old; unknown(f.client);
  }
  const f = fixture(); t.after(() => f.client.stop()); await f.ready(login(2)); const socket = f.client.socket;
  f.client.socket = { readyState: 1, close() {} }; unknown(f.client, 'VIP_CONNECTION_NOT_CURRENT');
  f.client.socket = socket; unknown(f.client);
});

test('default clients and incomplete account context retain ordinary transport with unknown VIP authority', async t => {
  for (const options of [{ accountId: null }, { connectionId: null }, { accountId: '' }]) {
    const f = fixture(options); t.after(() => f.client.stop()); await f.ready(login(2));
    assert.equal(f.client.connected, true); unknown(f.client);
  }
});

test('two live accounts and returned or public login copies cannot cross-seed VIP state', async t => {
  const a = fixture({ accountId: 'account-A', connectionId: 'connection-A' }), b = fixture({ accountId: 'account-B', connectionId: 'connection-B' });
  t.after(() => { a.client.stop(); b.client.stop(); });
  const socketA = await a.ready(login(2)), socketB = await b.ready(login(4));
  socketA.receive('SCVipUpdate', { vipLevel: 6 }, 1);
  assert.equal(current(a.client, 6, 'SCVipUpdate').accountId, 'account-A'); current(b.client, 4);
  a.client.stop(); unknown(a.client); socketB.receive('SCVipUpdate', { vipLevel: 7 }, 1); current(b.client, 7, 'SCVipUpdate');
});

test('real live VIP tracker flows through the unchanged 48-query collector into pirate display observations', async t => {
  const f = fixture(); t.after(() => f.client.stop()); const socket = await f.ready(login(1)), reads = [];
  f.client.request = async (name, _body, response) => {
    reads.push(name);
    if (name === 'MonthCardRequest') socket.receive('SCVipUpdate', { vipLevel: 4 }, 1);
    const body = name === 'AllPirateRequest' ? { pirates: [], sweepTimes: 2 } : {};
    return protocol[response].decode(protocol[response].encode(body).finish());
  };
  const snapshot = await collectState(f.client, protocol), view = summarize(snapshot);
  assert.deepEqual(reads, ENTRY_QUERIES.map(row => row.name));
  assert.equal(reads.length, 48);
  assert.deepEqual(snapshot.sessionFacts.vipLevel, {
    status: 'OBSERVED', reliable: true, vipLevel: 4, source: 'SCVipUpdate', reason: null,
    accountId: 'vip-account', generation: 3, connectionId: 'vip-connection',
    playerId: '9007199254740993', worldId: '9', observedAt: snapshot.sessionFacts.vipLevel.observedAt,
  });
  assert.equal(view.pirateSweep.vipLevel, 4); assert.equal(view.pirateSweep.vipLevelStatus, 'OBSERVED');
  const checklist=dailyChecklist(snapshot);assert.equal(checklist.vip.vipLevel,4);assert.equal(checklist.vip.claimStatus,'UNKNOWN');assert.equal(checklist.vip.executable,false);
  assert.equal(view.pirateSweep.usedSweeps, 2);
  assert.equal(view.pirateSweep.totalSweeps, null); assert.equal(view.pirateSweep.remainingSweeps, null);
  assert.match(formatState(view), /VIP 等级：4；本次采集的连接观察值/);
  // The previous snapshot stays a display observation; the next collection must consult live authority again.
  socket.receive('SCVipUpdate', { vipLevel: 7 }, 3); unknown(f.client, 'VIP_STREAM_SEQUENCE_GAP');
  reads.length = 0;
  const invalid = await collectState(f.client, protocol), invalidView = summarize(invalid);
  assert.equal(reads.length, 48); assert.equal(invalid.sessionFacts.vipLevel.status, 'UNKNOWN');
  assert.equal(invalidView.pirateSweep.vipLevel, null); assert.equal(invalidView.pirateSweep.totalSweeps, null);
  assert.equal(dailyChecklist(invalid).vip.vipLevel,null);assert.equal(dailyChecklist(invalid).vip.eligible,null);
  assert.match(formatState(invalidView), /VIP 等级：未知；连接权威未知/);
});

test('context changes during real client collection cannot export another connection VIP observation', async t => {
  const f = fixture(); t.after(() => f.client.stop()); await f.ready(login(2));
  const reads = [];
  f.client.request = async (name, _body, response) => {
    reads.push(name);
    if (name === 'MonthCardRequest') f.client.factContext.connectionId = 'changed-during-collection';
    return protocol[response].decode(protocol[response].encode({}).finish());
  };
  const snapshot = await collectState(f.client, protocol);
  assert.equal(reads.length, 48); assert.equal(snapshot.sessionFacts.vipLevel.status, 'UNKNOWN');
  assert.equal(summarize(snapshot).pirateSweep.vipLevel, null); unknown(f.client);
});

test('every terminal connection path removes a live VIP baseline and rejected relogin cannot retain it', async t => {
  for (const terminate of [
    (f, socket) => socket.receive('SCChannelExpired', { reason: 'synthetic' }, 1),
    (f, socket) => socket.receive('ResendFailed', { seqNo: 1 }, 1),
    (f, socket) => socket.onerror(),
    (f, socket) => socket.end(),
    f => { f.client.lastPingTimestamp = Date.now() - 1001; f.client.tick(); },
  ]) {
    const f = fixture(); t.after(() => f.client.stop()); const socket = await f.ready(login(3));
    terminate(f, socket); assert.equal(f.client.connected, false); unknown(f.client);
    const rejected = assert.rejects(f.client.connect({}), /login rejected/), retry = f.sockets.at(-1);
    retry.open(); retry.receive('LoginResponse', { result: 3 }); await rejected; unknown(f.client);
  }
});

test('stale callbacks from an unfinished old login cannot seed or replace a newer VIP baseline', async t => {
  const f = fixture(); t.after(() => f.client.stop());
  const rejected = assert.rejects(f.client.connect({}), /client stopped/), old = f.sockets[0], stale = old.onmessage;
  old.open(); f.client.stop(); await rejected;
  await f.ready(login(2)); current(f.client, 2);
  stale({ data: codec.encode('LoginResponse', 0, login(99)) }); current(f.client, 2);
});

test('accepted terminal protocol messages invalidate VIP before public message observers run', async t => {
  for (const name of ['SCChannelExpired', 'ResendFailed']) {
    const f = fixture(); t.after(() => f.client.stop()); const socket = await f.ready(login(3));
    let observed;
    f.client.on('message', message => { if (message.name === name) observed = f.client.readVipLevel(); });
    socket.receive(name, name === 'SCChannelExpired' ? { reason: 'synthetic' } : { seqNo: 1 }, 1);
    assert.equal(observed.status, 'UNKNOWN'); assert.equal(observed.vipLevel, null);
    assert.equal(observed.reason, 'VIP_CONNECTION_ENDED'); assert.equal(f.client.connected, false); unknown(f.client);
  }
});

test('private VIP event cursors bind changed levels, exact identity and accepted sequence without trusting emitted payloads',async t=>{
 const f=fixture();t.after(()=>f.client.stop());const socket=await f.ready(login(1)),baseline=readVipLevelEvent(f.client);assert.equal(baseline.reliable,true);assert.equal(baseline.cursor,0);assert.equal(baseline.event,null);f.client.emit('message',{name:'SCVipUpdate',seq:1,body:{vipLevel:8}});assert.equal(readVipLevelEvent(f.client).cursor,0);socket.receive('SCVipUpdate',{vipLevel:3},1);const event=readVipLevelEvent(f.client);assert.equal(event.streamId,baseline.streamId);assert.equal(event.cursor,1);assert.deepEqual([event.event.previousLevel,event.event.vipLevel,event.event.seq],[1,3,1]);assert.equal(event.event.eventId,event.streamId+':1');assert.equal(event.playerId,'9007199254740993');assert.equal(event.worldId,'9');event.event.vipLevel=99;assert.equal(readVipLevelEvent(f.client,{cursor:1}).event.vipLevel,3);socket.receive('SCVipUpdate',{vipLevel:9},1);assert.equal(readVipLevelEvent(f.client).cursor,1);socket.receive('SCVipUpdate',{vipLevel:4},2);assert.equal(readVipLevelEvent(f.client,{cursor:1}).event.vipLevel,3);assert.equal(readVipLevelEvent(f.client).event.vipLevel,4);
});

test('private VIP event stream identity changes on relogin and cannot be forged by plain clients or replacement readers',async t=>{
 const f=fixture();t.after(()=>f.client.stop());const oldSocket=await f.ready(login(1)),old=readVipLevelEvent(f.client),oldMessage=oldSocket.onmessage;f.client.readVipLevel=()=>({reliable:true,vipLevel:99});f.client.emit('message',{name:'SCVipUpdate',seq:1,body:{vipLevel:99}});assert.equal(readVipLevelEvent(f.client).cursor,0);assert.equal(readVipLevelEvent({readVipLevel:()=>old}).reliable,false);f.client.stop();assert.equal(readVipLevelEvent(f.client).reliable,false);await f.ready(login(2));const fresh=readVipLevelEvent(f.client);assert.notEqual(fresh.streamId,old.streamId);assert.equal(fresh.cursor,0);oldMessage({data:codec.encode('SCVipUpdate',1,{vipLevel:99})});assert.equal(readVipLevelEvent(f.client).cursor,0);
});

test('private VIP event retention is bounded and gaps or decoding failures invalidate all pending event authority',async t=>{
 const f=fixture();t.after(()=>f.client.stop());const socket=await f.ready(login(0));for(let seq=1;seq<=201;seq++)socket.receive('SCVipUpdate',{vipLevel:seq},seq);assert.equal(readVipLevelEvent(f.client).cursor,201);assert.equal(readVipLevelEvent(f.client,{cursor:1}).reliable,false);assert.equal(readVipLevelEvent(f.client,{cursor:2}).event.vipLevel,2);socket.receive('SCVipUpdate',{vipLevel:203},203);assert.equal(readVipLevelEvent(f.client).reliable,false);socket.receive('SCVipUpdate',{vipLevel:202},202);assert.equal(readVipLevelEvent(f.client).reliable,false);
});

const playerLogin=level=>({result:0,initSeqNo:12,playerInfo:{playerId:'9007199254740993',worldId:'9',level}});
test('private player-level event source uses explicit login and accepted exp update independently from VIP completeness',async t=>{
 const f=fixture();t.after(()=>f.client.stop());const socket=await f.ready(playerLogin(0)),baseline=readPlayerLevelEvent(f.client);assert.equal(baseline.reliable,true);assert.equal(baseline.playerLevel,0);assert.equal(baseline.cursor,0);assert.equal(baseline.event,null);assert.equal(f.client.readVipLevel().reliable,false);f.client.loginResponse.playerInfo.level=99;f.client.readPlayerLevelEvent=()=>({reliable:true,playerLevel:99});f.client.emit('message',{name:'SCPlayerExpUpdate',seq:1,body:{level:99}});assert.equal(readPlayerLevelEvent(f.client).playerLevel,0);socket.receive('SCPlayerLevelGrade',{level:99,grade:1},1);assert.equal(readPlayerLevelEvent(f.client).cursor,0);socket.receive('SCPlayerExpUpdate',{level:2,exp:'9007199254740993'},2);const fact=readPlayerLevelEvent(f.client);assert.deepEqual([fact.event.previousLevel,fact.event.playerLevel,fact.event.seq],[0,2,2]);assert.equal(fact.streamId,baseline.streamId);assert.equal(fact.event.eventId,fact.streamId+':1');assert.equal(fact.playerId,'9007199254740993');assert.equal(fact.worldId,'9');assert.equal(fact.source,'SCPlayerExpUpdate');fact.event.playerLevel=8;assert.equal(readPlayerLevelEvent(f.client,{cursor:1}).event.playerLevel,2);socket.receive('SCPlayerExpUpdate',{level:9},2);assert.equal(readPlayerLevelEvent(f.client).cursor,1);socket.receive('SCPlayerExpUpdate',{level:2},3);assert.equal(readPlayerLevelEvent(f.client).event.previousLevel,2);assert.equal(readPlayerLevelEvent(f.client).cursor,2);
});
for(const body of [{result:0,playerInfo:{playerId:'17',worldId:'9'}},playerLogin(-1),{...playerLogin(1),playerInfo:{level:1,worldId:'9'}},{...playerLogin(1),playerInfo:{level:1,playerId:'17',worldId:'0'}}])test('missing or invalid explicit player level/identity cannot seed authority '+JSON.stringify(body),async t=>{const f=fixture();t.after(()=>f.client.stop());await f.ready(body);assert.equal(readPlayerLevelEvent(f.client).reliable,false);});
for(const fault of ['missing','negative','zero-sequence','gap','decode','context','terminal'])test('player event source fails closed on '+fault,async t=>{
 const f=fixture();t.after(()=>f.client.stop());const socket=await f.ready(playerLogin(1));socket.receive('SCPlayerExpUpdate',{level:2,exp:'0'},1);if(fault==='missing')socket.receive('SCPlayerExpUpdate',{exp:'0'},2);if(fault==='negative')socket.receive('SCPlayerExpUpdate',{level:-1},2);if(fault==='zero-sequence')socket.receive('SCPlayerExpUpdate',{level:3},0);if(fault==='gap')socket.receive('SCPlayerExpUpdate',{level:3},3);if(fault==='decode')socket.onmessage({data:Buffer.from([0])});if(fault==='context')f.client.factContext.connectionId='other';if(fault==='terminal')socket.receive('SCChannelExpired',{reason:'synthetic'},2);assert.equal(readPlayerLevelEvent(f.client).reliable,false);socket.receive('SCPlayerExpUpdate',{level:3},2);assert.equal(readPlayerLevelEvent(f.client).reliable,false);
});
test('player event cursors are bounded, not forgeable, and isolated across reconnect and stale sockets',async t=>{
 const f=fixture();t.after(()=>f.client.stop());const socket=await f.ready(playerLogin(1)),old=readPlayerLevelEvent(f.client),handler=socket.onmessage;assert.equal(readPlayerLevelEvent({readPlayerLevelEvent:()=>old}).reliable,false);for(let seq=1;seq<=201;seq++)socket.receive('SCPlayerExpUpdate',{level:seq},seq);assert.equal(readPlayerLevelEvent(f.client,{cursor:1}).reliable,false);assert.equal(readPlayerLevelEvent(f.client,{cursor:2}).event.playerLevel,2);f.client.stop();assert.equal(readPlayerLevelEvent(f.client).reliable,false);await f.ready(playerLogin(2));const fresh=readPlayerLevelEvent(f.client);assert.notEqual(fresh.streamId,old.streamId);assert.equal(fresh.cursor,0);handler({data:codec.encode('SCPlayerExpUpdate',1,{level:99})});assert.equal(readPlayerLevelEvent(f.client).playerLevel,2);
});

const festivalRecord=(extra={})=>({activityId:'9007199254740993',festival:1,type:'合成季节活动',season:1,startTime:800,openTime:900,closeTime:1900,endTime:2000,subActivity:[{subActivityType:11,openTime:900,closeTime:1900,dailyActive:{checkInId:[1],activeScore:0,claimedRewardId:0,checkRuby:'9007199254740993'}}],...extra});
test('accepted festival pushes are private exact-ID observations independent of missing VIP or player level',async t=>{
 const f=fixture();t.after(()=>f.client.stop());assert.equal(readFestivalActivitySnapshot(f.client).status,'UNKNOWN');const socket=await f.ready({result:0,initSeqNo:12,playerInfo:{playerId:'9007199254740993',worldId:9}});
 assert.equal(readFestivalActivitySnapshot(f.client).status,'UNKNOWN');f.client.emit('message',{name:'SCAllActivity',seq:1,body:{festivalActivities:[festivalRecord()]}});assert.equal(readFestivalActivitySnapshot(f.client).status,'UNKNOWN');
 socket.receive('SCAllActivity',{festivalActivities:[festivalRecord()]},1);const observed=readFestivalActivitySnapshot(f.client);
 assert.equal(observed.status,'OBSERVED');assert.equal(observed.seq,1);assert.equal(observed.playerId,'9007199254740993');assert.equal(observed.worldId,'9');assert.equal(observed.accountId,'vip-account');assert.equal(observed.connectionId,'vip-connection');
 assert.equal(observed.complete,false);assert.equal(observed.independentRereadAvailable,false);assert.equal(observed.executable,false);assert.equal(observed.scope,'ACCEPTED_STREAM_OBSERVATION_ONLY');
 assert.equal(observed.activities[0].activityId.low,1);observed.activities[0].subActivity[0].dailyActive.checkInId.push(99);assert.deepEqual(readFestivalActivitySnapshot(f.client).activities[0].subActivity[0].dailyActive.checkInId,[1]);
 f.client.loginResponse.playerInfo.playerId='2';assert.equal(readFestivalActivitySnapshot(f.client).playerId,'9007199254740993');assert.equal(readFestivalActivitySnapshot({factContext:f.client.factContext}).status,'UNKNOWN');
 socket.receive('ClaimActivityDailyCheckInRewardResponse',{checkId:[1,2],reward:{asset:[]}},2);assert.deepEqual(readFestivalActivitySnapshot(f.client).activities[0].subActivity[0].dailyActive.checkInId,[1]);
 socket.receive('SCAllActivity',{festivalActivities:[]},3);assert.deepEqual(readFestivalActivitySnapshot(f.client).activities,[]);assert.equal(readFestivalActivitySnapshot(f.client).seq,3);
});
for(const mode of['duplicate','gap','decode','zero-seq','role','world','account','generation','connection','socket','stop'])test('festival observations respect existing stream isolation: '+mode,async t=>{
 const f=fixture();t.after(()=>f.client.stop());const socket=await f.ready();socket.receive('SCAllActivity',{festivalActivities:[festivalRecord()]},1);
 if(mode==='duplicate'){socket.receive('SCAllActivity',{festivalActivities:[festivalRecord({type:'unaccepted'})]},1);assert.equal(readFestivalActivitySnapshot(f.client).activities[0].type,'合成季节活动');return;}
 if(mode==='gap'){socket.receive('SCAllActivity',{festivalActivities:[]},3);socket.receive('SCAllActivity',{festivalActivities:[]},2);}
 else if(mode==='decode')f.client.onMessage(new Uint8Array([255]));
 else if(mode==='zero-seq')socket.receive('SCAllActivity',{festivalActivities:[]},0);
 else if(mode==='role')f.client.factContext.playerId='2';
 else if(mode==='world')f.client.factContext.worldId='18';
 else if(mode==='account')f.client.factContext.accountId='B';
 else if(mode==='generation')f.client.factContext.generation++;
 else if(mode==='connection')f.client.factContext.connectionId='replacement';
 else if(mode==='socket')f.client.socket={};
 else f.client.stop();
 const result=readFestivalActivitySnapshot(f.client);assert.equal(result.status,'UNKNOWN');assert.equal(result.activities,null);assert.equal(result.executable,false);
});
test('festival observations do not survive reconnect or accept old socket callbacks',async t=>{
 const f=fixture();t.after(()=>f.client.stop());const socket=await f.ready(),oldMessage=socket.onmessage;socket.receive('SCAllActivity',{festivalActivities:[festivalRecord()]},MAX_SEQ);assert.equal(readFestivalActivitySnapshot(f.client).status,'OBSERVED');socket.receive('SCAllActivity',{festivalActivities:[]},1);assert.equal(readFestivalActivitySnapshot(f.client).seq,1);
 f.client.stop();await f.ready();assert.equal(readFestivalActivitySnapshot(f.client).status,'UNKNOWN');oldMessage({data:codec.encode('SCAllActivity',2,{festivalActivities:[festivalRecord()]})});assert.equal(readFestivalActivitySnapshot(f.client).status,'UNKNOWN');
});
test('original collector snapshots only same-collection-context festival observations and sends the original 48 reads',async t=>{
 const f=fixture();t.after(()=>f.client.stop());const socket=await f.ready();socket.receive('SCAllActivity',{festivalActivities:[festivalRecord()]},1);const reads=[];f.client.request=async name=>{reads.push(name);return {};};
 const snap=await collectState(f.client,protocol);assert.equal(reads.length,48);assert.equal(snap.sessionFacts.festivalActivities.status,'OBSERVED');assert.equal(snap.sessionFacts.festivalActivities.activities[0].activityId,'9007199254740993');
 const view=dailyChecklist(snap);assert.equal(view.festival.rows[0].checkInRecord.checkRuby,'9007199254740993');assert.deepEqual(view.festival.rows[0].checkInRecord.checkInId,[1]);assert.equal(view.festival.rows[0].eligible,null);assert.equal(view.festival.rows[0].executable,false);
 f.client.request=async()=>{f.client.factContext.connectionId='changed-during-collection';return {};};const stale=await collectState(f.client,protocol);assert.equal(stale.sessionFacts.festivalActivities.status,'UNKNOWN');assert.equal(dailyChecklist(stale).festival.rows.length,0);assert.equal(reads.length,48);
});

for(const kind of ['VIP_LEVEL_CHANGED','PLAYER_LEVEL_CHANGED'])for(const level of [0,3])test('level event matcher ignores unchanged target and pinned no-op cursor '+kind+' '+level,async t=>{
 const {workflowEventCursor,workflowLevelEvent}=await import('../src/workflow.mjs'),f=fixture();t.after(()=>f.client.stop());const body=login(level);body.playerInfo.level=level;const socket=await f.ready(body),session={id:'vip-account',generation:3,connectionId:'vip-connection',client:f.client,player:{playerId:'9007199254740993',worldId:'9'}},rule={kind,level},baseline=workflowEventCursor(session,rule),name=kind==='PLAYER_LEVEL_CHANGED'?'SCPlayerExpUpdate':'SCVipUpdate',key=kind==='PLAYER_LEVEL_CHANGED'?'playerLevel':'vipLevel',update=n=>kind==='PLAYER_LEVEL_CHANGED'?{level:n,exp:'10'}:{vipLevel:n};
 assert.equal(workflowLevelEvent(session,baseline,rule),null);socket.receive(name,update(level),1);assert.equal(workflowLevelEvent(session,baseline,rule),null);assert.equal(workflowLevelEvent(session,baseline,rule,1),null);socket.receive(name,update(level),1);assert.equal(workflowEventCursor(session,rule).cursor,1);
 const away=level===0?1:2;socket.receive(name,update(away),2);assert.equal(workflowLevelEvent(session,baseline,rule),null);socket.receive(name,update(level),3);const event=workflowLevelEvent(session,baseline,rule);assert.equal(event.cursor,3);assert.equal(event.previousLevel,away);assert.equal(event[key],level);assert.equal(workflowLevelEvent(session,baseline,rule,1),null);assert.equal(workflowLevelEvent(session,baseline,rule,2),null);assert.deepEqual(workflowLevelEvent(session,baseline,rule,3),event);
});

test('daily reset events seed exact login identity independently of absent VIP and player levels',async t=>{
 const f=fixture();t.after(()=>f.client.stop());assert.equal(readDailyResetEvent(f.client).reliable,false);const socket=await f.ready({result:0,initSeqNo:12,playerInfo:{playerId:'9007199254740993',worldId:'9'}}),first=readDailyResetEvent(f.client);
 assert.equal(first.reliable,true);assert.equal(first.cursor,0);assert.equal(first.event,null);assert.equal(f.client.readVipLevel().reliable,false);assert.equal(readPlayerLevelEvent(f.client).reliable,false);
 f.client.readDailyResetEvent=()=>({reliable:true,event:{dailyResetTime:500}});f.client.emit('message',{name:'SCDailyTaskReset',seq:1,body:{dailyResetTime:500}});assert.equal(readDailyResetEvent(f.client).cursor,0);assert.equal(readDailyResetEvent({readDailyResetEvent:()=>first}).reliable,false);
 socket.receive('SCDailyWeeklyReset',{},1);assert.equal(readDailyResetEvent(f.client).cursor,0);socket.receive('SCDailyTaskReset',{dailyResetTime:1000,dailyTask:[]},2);const fact=readDailyResetEvent(f.client);assert.equal(fact.event.dailyResetTime,1000);assert.equal(fact.event.seq,2);assert.equal(fact.cursor,1);assert.equal(fact.playerId,'9007199254740993');assert.equal(fact.worldId,'9');assert.equal(fact.event.eventId,fact.streamId+':1');
 fact.event.dailyResetTime=4;assert.equal(readDailyResetEvent(f.client).event.dailyResetTime,1000);socket.receive('SCDailyTaskReset',{dailyResetTime:1000},2);socket.receive('SCDailyTaskReset',{dailyResetTime:1000},3);assert.equal(readDailyResetEvent(f.client).cursor,1);socket.receive('SCDailyTaskReset',{dailyResetTime:2000},4);assert.equal(readDailyResetEvent(f.client).cursor,2);assert.equal(readDailyResetEvent(f.client,{cursor:1}).event.dailyResetTime,1000);
});
for(const body of [{result:0,playerInfo:{worldId:'9'}},{result:0,playerInfo:{playerId:'17',worldId:'0'}},{playerInfo:{playerId:'17',worldId:'9'}}])test('daily reset login source requires explicit successful identity '+JSON.stringify(body),async t=>{
 const f=fixture();t.after(()=>f.client.stop());await f.ready(body);assert.equal(readDailyResetEvent(f.client).reliable,false);
});
for(const fault of ['missing','zero','negative','zero-sequence','gap','decode','account','generation','connection','terminal','rollback'])test('daily reset source stops on '+fault,async t=>{
 const f=fixture();t.after(()=>f.client.stop());const socket=await f.ready(login());socket.receive('SCDailyTaskReset',{dailyResetTime:1000},1);
 if(['missing','zero','negative'].includes(fault))socket.receive('SCDailyTaskReset',fault==='missing'?{}:{dailyResetTime:fault==='zero'?0:-1},2);
 if(fault==='zero-sequence')socket.receive('SCDailyTaskReset',{dailyResetTime:2000},0);if(fault==='gap')socket.receive('SCDailyTaskReset',{dailyResetTime:2000},3);if(fault==='decode')socket.onmessage({data:Buffer.from([0])});if(fault==='account')f.client.factContext.accountId='B';if(fault==='generation')f.client.factContext.generation++;if(fault==='connection')f.client.factContext.connectionId='changed';if(fault==='terminal')socket.receive('SCChannelExpired',{reason:'synthetic'},2);if(fault==='rollback')socket.receive('SCDailyTaskReset',{dailyResetTime:999},2);
 assert.equal(readDailyResetEvent(f.client).reliable,false);socket.receive('SCDailyTaskReset',{dailyResetTime:2000},2);assert.equal(readDailyResetEvent(f.client).reliable,false);
});
test('daily reset cursors are bounded and old sockets cannot recover a new connection',async t=>{
 const f=fixture();t.after(()=>f.client.stop());const socket=await f.ready(login()),old=readDailyResetEvent(f.client),handler=socket.onmessage;
 for(let seq=1;seq<=201;seq++)socket.receive('SCDailyTaskReset',{dailyResetTime:1000+seq},seq);assert.equal(readDailyResetEvent(f.client,{cursor:1}).reliable,false);assert.equal(readDailyResetEvent(f.client,{cursor:2}).event.dailyResetTime,1002);
 f.client.stop();assert.equal(readDailyResetEvent(f.client).reliable,false);await f.ready(login());const fresh=readDailyResetEvent(f.client);assert.notEqual(fresh.streamId,old.streamId);assert.equal(fresh.cursor,0);handler({data:codec.encode('SCDailyTaskReset',1,{dailyResetTime:9999})});assert.equal(readDailyResetEvent(f.client).cursor,0);
});

for(const [name,body]of[['SCDailyTaskUpdate',{task:{id:1001}}],['SCDailyWeeklyReset',{}]])
test('daily cache revisions follow accepted '+name+' without adding reset triggers',async t=>{
 const f=fixture();t.after(()=>f.client.stop());const socket=await f.ready(login()),baseline=readDailyResetEvent(f.client),before=socket.sent.length;
 assert.equal(baseline.cacheRevision,0);f.client.emit('message',{name,body,seq:1});assert.equal(readDailyResetEvent(f.client).cacheRevision,0);
 socket.receive(name,body,1);const updated=readDailyResetEvent(f.client);assert.equal(updated.cacheRevision,1);assert.equal(updated.cursor,0);assert.equal(updated.event,null);assert.equal(updated.streamId,baseline.streamId);
 updated.cacheRevision=999;assert.equal(readDailyResetEvent(f.client).cacheRevision,1);socket.receive(name,body,1);assert.equal(readDailyResetEvent(f.client).cacheRevision,1);assert.equal(socket.sent.length,before);
 socket.receive('SCDailyTaskReset',{dailyResetTime:1000},2);assert.equal(readDailyResetEvent(f.client).cursor,1);assert.equal(readDailyResetEvent(f.client).cacheRevision,1);
 socket.receive(name,body,4);assert.equal(readDailyResetEvent(f.client).reliable,false);
});

test('guild ship activity period comes only from accepted private transport and retains explicit zero closure',async t=>{
 const {readGuildShipActivitySnapshot:read}=await import('../src/client.mjs'),f=fixture();t.after(()=>f.client.stop());assert.equal(read(f.client).status,'UNKNOWN');const socket=await f.ready({result:0,initSeqNo:12,playerInfo:{playerId:'9007199254740993',worldId:9}});
 f.client.emit('message',{name:'SCGuildShipActivity',seq:1,body:{period:{period:7,startTime:100,endTime:200}}});assert.equal(read(f.client).status,'UNKNOWN');
 socket.receive('SCGuildShipActivity',{period:{period:7,startTime:100,endTime:200}},1);const value=read(f.client);assert.equal(value.status,'OBSERVED');assert.equal(value.reliable,true);assert.equal(value.source,'SCGuildShipActivity.period');assert.equal(value.playerId,'9007199254740993');assert.deepEqual(value.period,{period:7,startTime:100,endTime:200});assert.equal(value.executable,false);
 value.period.period=999;assert.equal(read(f.client).period.period,7);assert.equal(read({factContext:f.client.factContext}).status,'UNKNOWN');assert.equal(read(f.client,{accountId:'other',generation:3,connectionId:'vip-connection',playerId:'9007199254740993',worldId:'9'}).status,'UNKNOWN');
 socket.receive('SCGuildShipActivity',{period:{period:0,startTime:0,endTime:0}},2);assert.deepEqual(read(f.client).period,{period:0,startTime:0,endTime:0});assert.equal(socket.sent.filter(row=>row.name==='GuildShipOrderRequest'||row.name==='GuildShipSeekRequest').length,0);
});
for(const mode of ['duplicate','gap','decode','zero-seq','role','world','account','generation','connection','socket','stop'])test('guild ship period respects original stream isolation: '+mode,async t=>{
 const {readGuildShipActivitySnapshot:read}=await import('../src/client.mjs'),f=fixture();t.after(()=>f.client.stop());const socket=await f.ready();socket.receive('SCGuildShipActivity',{period:{period:7,startTime:100,endTime:200}},1);
 if(mode==='duplicate'){socket.receive('SCGuildShipActivity',{period:{period:8,startTime:100,endTime:200}},1);assert.equal(read(f.client).period.period,7);return;}
 if(mode==='gap'){socket.receive('SCGuildShipActivity',{period:{period:8,startTime:100,endTime:200}},3);socket.receive('SCGuildShipActivity',{period:{period:8,startTime:100,endTime:200}},2);}
 else if(mode==='decode')f.client.onMessage(new Uint8Array([255]));
 else if(mode==='zero-seq')socket.receive('SCGuildShipActivity',{period:{period:8,startTime:100,endTime:200}},0);
 else if(mode==='role')f.client.factContext.playerId='2';
 else if(mode==='world')f.client.factContext.worldId='18';
 else if(mode==='account')f.client.factContext.accountId='B';
 else if(mode==='generation')f.client.factContext.generation++;
 else if(mode==='connection')f.client.factContext.connectionId='replacement';
 else if(mode==='socket')f.client.socket={};
 else f.client.stop();
 assert.equal(read(f.client).status,'UNKNOWN');assert.equal(read(f.client).period,null);
});
test('invalid guild ship period clears only its observation and cannot reuse a prior valid window',async t=>{
 const {readGuildShipActivitySnapshot:read}=await import('../src/client.mjs'),f=fixture();t.after(()=>f.client.stop());const socket=await f.ready();socket.receive('SCAllActivity',{festivalActivities:[festivalRecord()]},1);let seq=2;
 for(const period of [null,{}, {period:7,startTime:100},{period:7,endTime:200},{startTime:100,endTime:200},{period:-1,startTime:100,endTime:200},{period:7,startTime:200,endTime:100},{period:7,startTime:100,endTime:100},{period:0,startTime:100,endTime:200}]){
  socket.receive('SCGuildShipActivity',{period:{period:7,startTime:100,endTime:200}},seq++);assert.equal(read(f.client).status,'OBSERVED');socket.receive('SCGuildShipActivity',period===null?{}:{period},seq++);assert.equal(read(f.client).status,'UNKNOWN');assert.equal(read(f.client).period,null);assert.equal(readFestivalActivitySnapshot(f.client).status,'OBSERVED');
 }
});
test('guild ship period cannot survive reconnection or late callbacks and follows original sequence wrap',async t=>{
 const {readGuildShipActivitySnapshot:read}=await import('../src/client.mjs'),f=fixture();t.after(()=>f.client.stop());const socket=await f.ready(),old=socket.onmessage;socket.receive('SCGuildShipActivity',{period:{period:7,startTime:100,endTime:200}},MAX_SEQ);socket.receive('SCGuildShipActivity',{period:{period:8,startTime:200,endTime:300}},1);assert.equal(read(f.client).period.period,8);assert.equal(read(f.client).seq,1);
 f.client.stop();await f.ready();assert.equal(read(f.client).status,'UNKNOWN');old({data:codec.encode('SCGuildShipActivity',2,{period:{period:8,startTime:200,endTime:300}})});assert.equal(read(f.client).status,'UNKNOWN');
});

const shipStatePushes=[
 ['SCGuildShipLeader',{shipId:41,leader:{playerId:'21'},preparedEndTime:300}],
 ['SCGuildShipOrder',{shipId:41,crewId:1,player:{playerId:'21'}}],
 ['SCGuildShipMove',{shipId:41,startTime:200,endTime:300}],
 ['SCGuildShipReset',{shipId:[41]}],
];
for(const [name,body]of shipStatePushes)test('merchant revision accepts private contiguous state only '+name,async t=>{
 const {readGuildShipActivitySnapshot:read}=await import('../src/client.mjs'),f=fixture();t.after(()=>f.client.stop());const socket=await f.ready();
 socket.receive('SCGuildShipActivity',{period:{period:7,startTime:100,endTime:400}},1);
 assert.equal(read(f.client).stateRevision,0);const sent=socket.sent.length;
 f.client.emit('message',{name,body,seq:2});assert.equal(read(f.client).stateRevision,0);
 socket.receive(name,body,2);const value=read(f.client);assert.equal(value.status,'OBSERVED');assert.equal(value.stateRevision,1);assert.equal(value.seq,1);assert.deepEqual(value.period,{period:7,startTime:100,endTime:400});
 value.stateRevision=999;socket.receive(name,body,2);assert.equal(read(f.client).stateRevision,1);assert.equal(socket.sent.length,sent);
 socket.receive(name,body,3);assert.equal(read(f.client).stateRevision,2);
});
for(const mode of ['gap','zero','role','world','connection','stop'])test('merchant state revision cannot restore lost authority '+mode,async t=>{
 const {readGuildShipActivitySnapshot:read}=await import('../src/client.mjs'),f=fixture();t.after(()=>f.client.stop());const socket=await f.ready();
 socket.receive('SCGuildShipActivity',{period:{period:7,startTime:100,endTime:400}},1);
 if(mode==='gap')socket.receive('SCGuildShipReset',{shipId:[41]},3);
 else if(mode==='zero')socket.receive('SCGuildShipReset',{shipId:[41]},0);
 else {if(mode==='role')f.client.factContext.playerId='2';if(mode==='world')f.client.factContext.worldId='18';if(mode==='connection')f.client.factContext.connectionId='new';if(mode==='stop')f.client.stop();socket.receive('SCGuildShipReset',{shipId:[41]},2);}
 assert.equal(read(f.client).status,'UNKNOWN');assert.equal(read(f.client).reliable,false);
});

const progressTask=(id=1001,progress=0)=>({id,progress,targetProgress:5,rewardClaimed:false});
test('daily progress source uses exact private typed push after successful login and never grants claim eligibility',async t=>{
 const f=fixture();t.after(()=>f.client.stop());assert.equal(readDailyTaskProgressEvent(f.client).reliable,false);const socket=await f.ready({result:0,initSeqNo:12,playerInfo:{playerId:'9007199254740993',worldId:'9'}}),baseline=readDailyTaskProgressEvent(f.client);
 assert.equal(baseline.reliable,true);assert.equal(baseline.cursor,0);assert.equal(baseline.event,null);f.client.emit('message',{name:'SCDailyTaskUpdate',seq:1,body:{task:progressTask()}});assert.equal(readDailyTaskProgressEvent(f.client).cursor,0);
 f.client.readDailyTaskProgressEvent=()=>({reliable:true});assert.equal(readDailyTaskProgressEvent({readDailyTaskProgressEvent:()=>baseline}).reliable,false);
 socket.receive('SCDailyTaskUpdate',{task:progressTask()},1);const observed=readDailyTaskProgressEvent(f.client);assert.equal(observed.source,'SCDailyTaskUpdate.task');assert.equal(observed.playerId,'9007199254740993');assert.equal(observed.event.progress,0);assert.equal(observed.event.targetProgress,5);assert.equal(observed.event.rewardClaimed,false);assert.equal(observed.cursor,1);assert.equal(observed.streamId,baseline.streamId);assert.notEqual(observed.streamId,readDailyResetEvent(f.client).streamId);assert.equal(readDailyResetEvent(f.client).cursor,0);
 observed.event.progress=999;assert.equal(readDailyTaskProgressEvent(f.client).event.progress,0);assert.equal(Object.hasOwn(observed,'eligibility'),false);
});
test('daily progress deduplicates unchanged progress and claimed-only updates but resets its baseline on new daily reset',async t=>{
 const f=fixture();t.after(()=>f.client.stop());const socket=await f.ready(login());socket.receive('SCDailyTaskUpdate',{task:progressTask()},1);const source=readDailyTaskProgressEvent(f.client);socket.receive('SCDailyTaskUpdate',{task:progressTask()},1);socket.receive('SCDailyTaskUpdate',{task:{...progressTask(),rewardClaimed:true}},2);assert.equal(readDailyTaskProgressEvent(f.client).cursor,1);
 socket.receive('SCDailyTaskUpdate',{task:progressTask(1001,1)},3);assert.equal(readDailyTaskProgressEvent(f.client).cursor,2);socket.receive('SCDailyWeeklyReset',{},4);assert.equal(readDailyTaskProgressEvent(f.client).streamId,source.streamId);socket.receive('SCDailyTaskReset',{dailyResetTime:1000},5);const reset=readDailyTaskProgressEvent(f.client);assert.notEqual(reset.streamId,source.streamId);assert.equal(reset.cursor,0);assert.equal(reset.event,null);socket.receive('SCDailyTaskUpdate',{task:progressTask()},6);assert.equal(readDailyTaskProgressEvent(f.client).event.progress,0);
});
for(const field of ['id','progress','targetProgress','rewardClaimed'])test('daily progress never fills missing wire scalar '+field,async t=>{
 const f=fixture();t.after(()=>f.client.stop());const socket=await f.ready(login()),task=progressTask();delete task[field];socket.receive('SCDailyTaskUpdate',{task},1);assert.equal(readDailyTaskProgressEvent(f.client).reliable,false);assert.equal(readDailyResetEvent(f.client).reliable,true);assert.equal(readDailyResetEvent(f.client).cacheRevision,1);socket.receive('SCDailyTaskUpdate',{task:progressTask(1001,1)},2);assert.equal(readDailyTaskProgressEvent(f.client).reliable,false);
});
for(const fault of ['rollback','zero-id','negative','gap','decode','account','generation','connection','terminal','zero-seq'])test('daily progress retains source isolation and fails closed on '+fault,async t=>{
 const f=fixture();t.after(()=>f.client.stop());const socket=await f.ready(login());socket.receive('SCDailyTaskUpdate',{task:progressTask(1001,1)},1);
 if(fault==='rollback')socket.receive('SCDailyTaskUpdate',{task:progressTask()},2);if(fault==='zero-id')socket.receive('SCDailyTaskUpdate',{task:progressTask(0,2)},2);if(fault==='negative')socket.receive('SCDailyTaskUpdate',{task:progressTask(1001,-1)},2);if(fault==='gap')socket.receive('SCDailyTaskUpdate',{task:progressTask(1001,2)},3);if(fault==='decode')socket.onmessage({data:Buffer.from([0])});if(fault==='account')f.client.factContext.accountId='B';if(fault==='generation')f.client.factContext.generation++;if(fault==='connection')f.client.factContext.connectionId='other';if(fault==='terminal')socket.receive('SCChannelExpired',{reason:'synthetic'},2);if(fault==='zero-seq')socket.receive('SCDailyTaskUpdate',{task:progressTask(1001,2)},0);
 assert.equal(readDailyTaskProgressEvent(f.client).reliable,false);
});
test('daily progress keeps bounded event history and old connections cannot publish or restore new sources',async t=>{
 const f=fixture();t.after(()=>f.client.stop());const socket=await f.ready(login()),receive=socket.onmessage;for(let seq=1;seq<=201;seq++)socket.receive('SCDailyTaskUpdate',{task:progressTask(1001,seq)},seq);assert.equal(readDailyTaskProgressEvent(f.client,{cursor:1}).reliable,false);assert.equal(readDailyTaskProgressEvent(f.client,{cursor:2}).event.progress,2);const old=readDailyTaskProgressEvent(f.client);f.client.stop();assert.equal(readDailyTaskProgressEvent(f.client).reliable,false);await f.ready(login());const fresh=readDailyTaskProgressEvent(f.client);assert.notEqual(fresh.streamId,old.streamId);receive({data:codec.encode('SCDailyTaskUpdate',202,{task:progressTask(1001,202)})});assert.equal(readDailyTaskProgressEvent(f.client).cursor,0);
});
