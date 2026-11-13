import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createCodec } from './codec.mjs';
import { trustedGameClock } from './state-facts.mjs';

// Only this module can attest that a local error preceded socket dispatch.
const undispatchedErrors = new WeakMap();
export const isUndispatchedTransportError = (error,guard) => typeof guard === 'function' && error !== null && (typeof error === 'object' || typeof error === 'function') && undispatchedErrors.get(error)===guard;
export const MAX_SEQ = 2147483647;
const HALF_SEQ = (MAX_SEQ - 1) / 2;

export const TICK_INTERVAL_MS = 1000;
export const PING_TIMEOUT_MS = 1000;
export const LOGIN_TIMEOUT_MS = 15000;
export const ACK_DELAY_MS = 1000;
export const HEARTBEAT_DEADLINE_MS = 604800000 + TICK_INTERVAL_MS;

export const DEFAULT_GATEWAY = 'wss://dhyaoj-gate.khlgamen.com/ws';

export function nextSeqNo(seq) {
  return seq === MAX_SEQ ? 1 : seq + 1;
}

// protobufjs decodes int64 into { low, high, unsigned } when no Long library is
// installed, so values echoed back by the server need converting before compare.
export function toNumber(value) {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && typeof value.low === 'number') {
    return value.high * 4294967296 + (value.low >>> 0);
  }
  return Number(value);
}

export function isSeqNoInRange(seq, right) {
  if (!(right > 0 && right <= MAX_SEQ)) throw new RangeError(`Invalid seqNoRight=${right}`);
  const left = right - HALF_SEQ;
  if (left > 0) return seq >= left && seq <= right;
  return (seq >= 1 && seq <= right) || (seq >= MAX_SEQ + left && seq <= MAX_SEQ);
}

// Only this module can own or renew a live VIP-level authority.
const liveVipLevels = new WeakMap();
const vipOwn = (value, key) => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? Object.getOwnPropertyDescriptor(value, key) : null;
const vipValue = (value, key) => {
  const descriptor = vipOwn(value, key);
  return descriptor?.enumerable && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
};
const vipText = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value;
const vipGeneration = value => Number.isSafeInteger(value) && value >= 0;
const vipLevel = value => Number.isInteger(value) && value >= 0 && value <= 2147483647;
function vipIdentity(value) {
  let exact = value;
  if (typeof value === 'number') exact = Number.isSafeInteger(value) && value > 0 ? BigInt(value) : null;
  else if (typeof value === 'string') exact = /^[1-9][0-9]{0,18}$/.test(value) ? BigInt(value) : null;
  else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const low = vipValue(value, 'low'), high = vipValue(value, 'high'), unsigned = vipValue(value, 'unsigned');
    const int32 = part => Number.isInteger(part) && part >= -2147483648 && part <= 2147483647;
    if (!int32(low) || !int32(high) || unsigned !== undefined && typeof unsigned !== 'boolean'
        || Reflect.ownKeys(value).some(key => !['low', 'high', 'unsigned'].includes(key))) return null;
    const bits = BigInt(high >>> 0) << 32n | BigInt(low >>> 0);
    exact = unsigned === true ? bits : BigInt.asIntN(64, bits);
  }
  return typeof exact === 'bigint' && exact > 0n && exact < (1n << 63n) ? String(exact) : null;
}
function vipContext(client) {
  const context = vipValue(client, 'factContext');
  return { accountId: vipValue(context, 'accountId') ?? null, generation: vipValue(context, 'generation') ?? null,
    connectionId: vipValue(context, 'connectionId') ?? null };
}
const sameVipContext = (a, b) => a?.accountId === b?.accountId && a?.generation === b?.generation && a?.connectionId === b?.connectionId;
function resetVipLevel(client, reason) {
  const previous = liveVipLevels.get(client), context = vipContext(client);
  liveVipLevels.set(client, { owner: previous?.owner ?? null, context, socket: null, identity: null,
    level: null, source: null, reason, invalid: false, seeded: false });
}
function invalidateVipLevel(client, reason) {
  const state = liveVipLevels.get(client);
  if (state) { state.level = null; state.source = null; state.reason = reason; state.invalid = true; }
}
function vipCurrentContext(client, state) {
  const context = vipContext(client);
  return vipText(context.accountId) && vipGeneration(context.generation) && vipText(context.connectionId)
    && context.accountId === state?.owner?.accountId && context.generation === state?.owner?.generation
    && sameVipContext(state.context, context);
}
function seedVipLevel(client, body, socket) {
  const state = liveVipLevels.get(client);
  if (state?.invalid) return;
  if (!state || state.socket !== socket || !vipCurrentContext(client, state)) { invalidateVipLevel(client, 'VIP_CONTEXT_UNKNOWN_OR_CHANGED'); return; }
  if (vipValue(body, 'result') !== 0) { invalidateVipLevel(client, 'VIP_LOGIN_RESULT_NOT_EXPLICIT_SUCCESS'); return; }
  const player = vipValue(body, 'playerInfo'), playerId = vipIdentity(vipValue(player, 'playerId')), worldId = vipIdentity(vipValue(player, 'worldId'));
  if (!playerId || !worldId || vipOwn(player, 'id') && vipIdentity(vipValue(player, 'id')) !== playerId) {
    invalidateVipLevel(client, 'VIP_PLAYER_IDENTITY_UNKNOWN'); return;
  }
  state.identity = { playerId, worldId };state.streamId=randomUUID();state.cursor=0;state.events=[];
  const level = vipValue(vipValue(player, 'vip'), 'vipLevel');
  if (!vipLevel(level)) { invalidateVipLevel(client, 'VIP_LEVEL_NOT_EXPLICIT_OR_INVALID'); return; }
  state.level = level; state.source = 'LoginResponse.playerInfo.vip'; state.reason = null; state.seeded = true;
}
function updateVipLevel(client, body, seq, receivedAt) {
  const state = liveVipLevels.get(client);
  if (!state || state.invalid) return;
  if (!client.connected || state.socket !== client.socket || !vipCurrentContext(client, state)) {
    invalidateVipLevel(client, 'VIP_CONTEXT_UNKNOWN_OR_CHANGED'); return;
  }
  if (!state.seeded) { invalidateVipLevel(client, 'VIP_LOGIN_BASELINE_UNKNOWN'); return; }
  if (!Number.isInteger(seq) || seq <= 0 || seq > MAX_SEQ) { invalidateVipLevel(client, 'VIP_UPDATE_SEQUENCE_UNKNOWN'); return; }
  const level = vipValue(body, 'vipLevel');
  if (!vipLevel(level)) { invalidateVipLevel(client, 'VIP_LEVEL_NOT_EXPLICIT_OR_INVALID'); return; }
  if(!Number.isSafeInteger(state.cursor)||state.cursor>=Number.MAX_SAFE_INTEGER){invalidateVipLevel(client,'VIP_EVENT_CURSOR_EXHAUSTED');return;}
  const cursor=++state.cursor;state.events.push({eventId:state.streamId+':'+cursor,streamId:state.streamId,cursor,seq,previousLevel:state.level,vipLevel:level,receivedAt:new Date(receivedAt).toISOString()});if(state.events.length>200)state.events.shift();
  state.level = level; state.source = 'SCVipUpdate'; state.reason = null;
}
// Attested event cursors share the existing private continuous VIP fact owner.
// Raw EventEmitter payloads, public login copies and replacement methods cannot seed them.
export function readVipLevelEvent(client,{cursor}={}){
 const state=liveVipLevels.get(client),fact=GameClient.prototype.readVipLevel.call(client);
 if(!fact.reliable||!state?.streamId)return {status:'UNKNOWN',reliable:false,reason:fact.reason??'VIP_EVENT_BASELINE_UNKNOWN'};
 const event=cursor===undefined?state.events.at(-1)??null:state.events.find(row=>row.cursor===cursor);
 if(cursor!==undefined&&!event)return {status:'UNKNOWN',reliable:false,reason:'VIP_EVENT_CURSOR_UNAVAILABLE'};
 return {...fact,streamId:state.streamId,cursor:state.cursor,event:event?structuredClone(event):null};
}
export const LIVE_VIP_LEVEL_EVIDENCE = Object.freeze({
  packageSha256: '4fd1f03034b78b0ea0d80590ce1082aa805529b91b2ef99ced9ca2d9f00c2444',
  entrySha256: 'a6046fcc2ad7a3424282e9f8b51073656f5ae8d48742129743560bf958266c54',
  protocolSha256: 'ef6137ef923f0b8b44b10379effe0ac2b3555ffab18b278e03e97b19bf4a4dcc',
  modelManager: Object.freeze({ byteOffset: 4644292, methodByteOffset: 4664885, sha256: '43daf7b7886502e2eb33949b2f552dd736da3f4ad34f10cedc391e9c5516be7e' }),
  digestScope: 'System.register start through next System.register start, including trailing whitespace',
  scope: 'CONTINUOUS_CONNECTION_VIP_LEVEL_ONLY', realGame: 'REAL_UNVERIFIED',
});

// Player levels share existing connection/identity checks, independently of VIP completeness.
const livePlayerLevels = new WeakMap();
function resetPlayerLevel(client,reason){const previous=livePlayerLevels.get(client);livePlayerLevels.set(client,{owner:previous?.owner??null,context:vipContext(client),socket:null,identity:null,invalid:false,seeded:false,level:null,source:null,reason});}
function invalidatePlayerLevel(client,reason){const state=livePlayerLevels.get(client);if(state){state.invalid=true;state.reason=reason;state.level=null;state.source=null;}}
function seedPlayerLevel(client,body,socket){const state=livePlayerLevels.get(client);if(state?.invalid)return;if(!state||state.socket!==socket||!vipCurrentContext(client,state)){invalidatePlayerLevel(client,'PLAYER_CONTEXT_UNKNOWN_OR_CHANGED');return;}const player=vipValue(body,'playerInfo'),playerId=vipIdentity(vipValue(player,'playerId')),worldId=vipIdentity(vipValue(player,'worldId')),level=vipValue(player,'level');if(vipValue(body,'result')!==0||!playerId||!worldId||vipOwn(player,'id')&&vipIdentity(vipValue(player,'id'))!==playerId||!vipLevel(level)){invalidatePlayerLevel(client,'PLAYER_LOGIN_LEVEL_OR_IDENTITY_UNKNOWN');return;}Object.assign(state,{identity:{playerId,worldId},level,source:'LoginResponse.playerInfo.level',reason:null,seeded:true,streamId:randomUUID(),cursor:0,events:[]});}
function updatePlayerLevel(client,body,seq,receivedAt){const state=livePlayerLevels.get(client);if(!state||state.invalid)return;if(!state.seeded||!client.connected||state.socket!==client.socket||!vipCurrentContext(client,state)){invalidatePlayerLevel(client,'PLAYER_LOGIN_OR_CONTEXT_UNKNOWN');return;}const level=vipValue(body,'level');if(!Number.isInteger(seq)||seq<1||seq>MAX_SEQ||!vipLevel(level)){invalidatePlayerLevel(client,'PLAYER_UPDATE_LEVEL_OR_SEQUENCE_UNKNOWN');return;}if(!Number.isSafeInteger(state.cursor)||state.cursor>=Number.MAX_SAFE_INTEGER){invalidatePlayerLevel(client,'PLAYER_EVENT_CURSOR_EXHAUSTED');return;}const cursor=++state.cursor;state.events.push({eventId:state.streamId+':'+cursor,streamId:state.streamId,cursor,seq,previousLevel:state.level,playerLevel:level,receivedAt:new Date(receivedAt).toISOString()});if(state.events.length>200)state.events.shift();state.level=level;state.source='SCPlayerExpUpdate';}
export function readPlayerLevelEvent(client,{cursor}={}){const state=livePlayerLevels.get(client);if(state&&!vipCurrentContext(client,state))invalidatePlayerLevel(client,'PLAYER_CONTEXT_UNKNOWN_OR_CHANGED');else if(state?.seeded&&(!client.connected||state.socket!==client.socket))invalidatePlayerLevel(client,'PLAYER_CONNECTION_NOT_CURRENT');if(!state||state.invalid||!state.seeded)return {status:'UNKNOWN',reliable:false,reason:state?.reason??'PLAYER_LOGIN_BASELINE_UNKNOWN'};const event=cursor===undefined?state.events.at(-1)??null:state.events.find(row=>row.cursor===cursor);if(cursor!==undefined&&!event)return {status:'UNKNOWN',reliable:false,reason:'PLAYER_EVENT_CURSOR_UNAVAILABLE'};return {status:'CURRENT',reliable:true,playerLevel:state.level,source:state.source,reason:null,...state.context,...state.identity,streamId:state.streamId,cursor:state.cursor,event:event?structuredClone(event):null};}
export const LIVE_PLAYER_LEVEL_EVIDENCE=Object.freeze({connectionEvidence:LIVE_VIP_LEVEL_EVIDENCE,source:'ModelManager._onSCPlayerExpUpdate',policy:'Explicit login level then continuous SCPlayerExpUpdate.level; SCPlayerLevelGrade has no evidenced consumer and is excluded',realGame:'REAL_UNVERIFIED'});
// Full replacement MonthCardResponse snapshots are separate from VIP-level facts.
const liveMonthCards = new WeakMap(), monthCardQueries = new WeakMap();
function resetMonthCards(client, reason) {
  const previous = liveMonthCards.get(client);
  liveMonthCards.set(client, { owner: previous?.owner ?? null, context: vipContext(client), socket: null, identity: null,
    anchored: false, invalid: false, epoch: 0, cards: null, sourceAt: null, reason });
}
function invalidateMonthCards(client, reason, permanent = false, dirty = false) {
  const state = liveMonthCards.get(client);
  if (!state) return;
  state.cards = null; state.sourceAt = null; state.reason = reason;
  if (permanent) state.invalid = true;
  if (dirty) state.epoch++;
}
function seedMonthCards(client, body, socket) {
  const state = liveMonthCards.get(client);
  if (!state || state.invalid) return;
  if (state.socket !== socket || !vipCurrentContext(client, state) || vipValue(body, 'result') !== 0) {
    invalidateMonthCards(client, 'MONTH_CARD_LOGIN_OR_CONTEXT_UNKNOWN', true); return;
  }
  const player = vipValue(body, 'playerInfo'), playerId = vipIdentity(vipValue(player, 'playerId')), worldId = vipIdentity(vipValue(player, 'worldId'));
  if (!playerId || !worldId || vipOwn(player, 'id') && vipIdentity(vipValue(player, 'id')) !== playerId) {
    invalidateMonthCards(client, 'MONTH_CARD_PLAYER_IDENTITY_UNKNOWN', true); return;
  }
  state.identity = { playerId, worldId }; state.anchored = true; state.reason = 'MONTH_CARD_QUERY_REQUIRED';
}
function monthCardsCurrentConnection(client, state) {
  return Boolean(state && state.anchored && !state.invalid && client.connected && state.socket === client.socket && vipCurrentContext(client, state));
}
function parseMonthCards(body) {
  const list = vipValue(body, 'cardItem');
  if (!Array.isArray(list) || Object.getPrototypeOf(list) !== Array.prototype || list.length > 2
      || Reflect.ownKeys(list).length !== list.length + 1) return null;
  const cards = [], seen = new Set();
  for (let index = 0; index < list.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(list, index);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
    const row = descriptor.value, type = vipValue(row, 'type'), endTime = vipValue(row, 'endTime');
    if (![1, 2].includes(type) || seen.has(type) || endTime !== -1 && !vipLevel(endTime)) return null;
    seen.add(type); cards.push({ type, endTime });
  }
  return cards.sort((a, b) => a.type - b.type);
}
function monthCardRefreshDispatched(client, entry) {
  const state = liveMonthCards.get(client);
  if (!state || state.invalid) return;
  if (!monthCardQueries.has(entry)) { invalidateMonthCards(client, 'MONTH_CARD_QUERY_UNCORRELATED', true); return; }
  invalidateMonthCards(client, monthCardsCurrentConnection(client, state) ? 'MONTH_CARD_QUERY_PENDING' : 'MONTH_CARD_LOGIN_OR_CONTEXT_UNKNOWN');
}
function failMonthCardQuery(client, entry, reason) {
  const token = monthCardQueries.get(entry);
  if (token?.dispatched && liveMonthCards.get(client) === token.state && !token.state.invalid)
    invalidateMonthCards(client, reason);
}
function prepareMonthCardQuery(client, entry, signal) {
  if (entry.name !== 'MonthCardRequest' || entry.responseName !== 'MonthCardResponse' || entry.mutate) return;
  const token = { dispatched: false, settled: false, signal, state: null, epoch: null, socket: null };
  monthCardQueries.set(entry, token);
  const cleanup = () => { token.settled = true; signal?.removeEventListener('abort', cancel); };
  const cancel = () => {
    if (token.settled) return;
    failMonthCardQuery(client, entry, 'MONTH_CARD_QUERY_CANCELLED');
    client.pending = client.pending.filter(item => item !== entry);
    clearTimeout(entry.timer);
    if (token.dispatched) client.lateResponses.add(entry.responseName);
    cleanup();
    entry.reject(Object.assign(new Error('month card query cancelled'), { code: 'CANCELLED' }));
  };
  entry.cleanup = cleanup;
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
}
function captureMonthCardQuery(client, entry) {
  const token = monthCardQueries.get(entry);
  if (!token) return;
  if (token.settled || token.signal?.aborted || !client.connected || !client.pending.includes(entry))
    throw Object.assign(new Error('month card query cancelled before dispatch'), { code: 'CANCELLED' });
  const state = liveMonthCards.get(client);
  token.dispatched = true; token.state = state; token.epoch = state?.epoch; token.socket = client.socket;
}
function observeMonthCardResponse(client, body, seq, receivedAt) {
  const state = liveMonthCards.get(client);
  if (!Number.isInteger(seq) || seq <= 0 || seq > MAX_SEQ) {
    invalidateMonthCards(client, 'MONTH_CARD_RESPONSE_SEQUENCE_UNKNOWN', true); return;
  }
  if (state?.invalid) return;
  const entry = client.pending.find(item => item.responseName === 'MonthCardResponse');
  const token = entry && monthCardQueries.get(entry);
  if (client.lateResponses.has('MonthCardResponse') || !token || !token.dispatched || token.settled) {
    if (state?.cards) invalidateMonthCards(client, 'MONTH_CARD_RESPONSE_UNCORRELATED');
    return;
  }
  if (token.signal?.aborted) { failMonthCardQuery(client, entry, 'MONTH_CARD_QUERY_CANCELLED'); return; }
  if (!monthCardsCurrentConnection(client, state) || state !== token.state || token.socket !== client.socket) {
    invalidateMonthCards(client, 'MONTH_CARD_LOGIN_OR_CONTEXT_UNKNOWN', true); return;
  }
  if (state.epoch !== token.epoch) { invalidateMonthCards(client, 'MONTH_CARD_CHANGED_DURING_QUERY'); return; }
  const cards = parseMonthCards(body);
  if (cards === null) { invalidateMonthCards(client, 'MONTH_CARD_LIST_NOT_EXPLICIT_OR_INVALID'); return; }
  state.cards = cards; state.sourceAt = receivedAt; state.reason = null;
}
function observeMonthCardDelivery(client, body, seq) {
  if (!vipOwn(body, 'monthCard')) return;
  if (!Number.isInteger(seq) || seq <= 0 || seq > MAX_SEQ) {
    invalidateMonthCards(client, 'MONTH_CARD_DELIVERY_SEQUENCE_UNKNOWN', true, true); return;
  }
  invalidateMonthCards(client, 'MONTH_CARD_DELIVERY_REQUIRES_QUERY', false, true);
}
export const LIVE_MONTH_CARD_EVIDENCE = Object.freeze({
  packageSha256: LIVE_VIP_LEVEL_EVIDENCE.packageSha256, entrySha256: LIVE_VIP_LEVEL_EVIDENCE.entrySha256,
  protocolSha256: LIVE_VIP_LEVEL_EVIDENCE.protocolSha256,
  monthCardModel: Object.freeze({ byteOffset: 4682260, initDataByteOffset: 4683045, sha256: '5fcf22ef42392b52ac22f4fb249a9dbe03d662415ff8a603973eb74b333e4b63' }),
  monthCardItem: Object.freeze({ byteOffset: 4676757, paymentClosureByteOffset: 4681792, sha256: 'f297b8d45ad33363a6667243fed6d1065b8ca4e9ddf28808cd5f5a4bb37cdd06' }),
  monthCardView: Object.freeze({ byteOffset: 4683423, sha256: '8b4613dd82cd77fe524aa6373cb75a84b4bf5726bf39da1c95f69e5ca2d04f2a' }),
  modelManager: Object.freeze({ byteOffset: 4644292, deliveryByteOffset: 4663947, sha256: LIVE_VIP_LEVEL_EVIDENCE.modelManager.sha256 }),
  gameConstants: Object.freeze({ byteOffset: 2968528, foreverByteOffset: 2969709, sha256: 'fe400eb67cc8e0c7b7f3ee49cb404eca20f1a84eaa5a76809c43a6446f938ae2' }),
  digestScope: LIVE_VIP_LEVEL_EVIDENCE.digestScope,
  listPolicy: 'Full replacement response, zero to two unique known types; preserve only returned rows, never synthesize absent cards or default endTime',
  scope: 'CONTINUOUS_CONNECTION_MONTH_CARD_ROWS_ONLY_NO_ACTIVE_OR_DAY', realGame: 'REAL_UNVERIFIED',
});

// W17 observations reuse the existing connection/sequence contract. They never
// establish claim eligibility, a game day, or an independent post-write reread.
const liveFestivalActivities = new WeakMap();
function resetFestivalActivities(client, reason) {
  const previous=liveFestivalActivities.get(client);
  liveFestivalActivities.set(client,{owner:previous?.owner??null,context:vipContext(client),socket:null,identity:null,seeded:false,invalid:false,reason,snapshot:null});
}
function invalidateFestivalActivities(client, reason) {
  const state=liveFestivalActivities.get(client);if(state){state.invalid=true;state.reason=reason;state.snapshot=null;}
}
function festivalContextCurrent(client,state) {
  return vipCurrentContext(client,state)&&['playerId','worldId'].every(k=>!vipOwn(client.factContext,k)||vipIdentity(vipValue(client.factContext,k))===state.identity?.[k]);
}
function seedFestivalActivities(client,body,socket) {
  const state=liveFestivalActivities.get(client),player=vipValue(body,'playerInfo');
  const playerId=vipIdentity(vipValue(player,'playerId')),worldId=vipIdentity(vipValue(player,'worldId'));
  if(!state||state.invalid||state.socket!==socket||!vipCurrentContext(client,state)||vipValue(body,'result')!==0||!playerId||!worldId||vipOwn(player,'id')&&vipIdentity(vipValue(player,'id'))!==playerId){invalidateFestivalActivities(client,'FESTIVAL_LOGIN_IDENTITY_UNKNOWN');return;}
  state.identity={playerId,worldId};state.seeded=true;state.reason='FESTIVAL_PUSH_NOT_OBSERVED';
}
function updateFestivalActivities(client,body,seq,receivedAt) {
  const state=liveFestivalActivities.get(client);
  if(!state||state.invalid)return;
  if(!state.seeded||!client.connected||state.socket!==client.socket||!festivalContextCurrent(client,state)){invalidateFestivalActivities(client,'FESTIVAL_CONNECTION_OR_IDENTITY_CHANGED');return;}
  const rows=vipValue(body,'festivalActivities');
  if(!Number.isInteger(seq)||seq<1||seq>MAX_SEQ||!Array.isArray(rows)||Object.getPrototypeOf(rows)!==Array.prototype||rows.length>10000||Reflect.ownKeys(rows).length!==rows.length+1||!Array.from({length:rows.length},(_,i)=>Object.getOwnPropertyDescriptor(rows,i)).every(d=>d?.enumerable&&Object.hasOwn(d,'value'))){invalidateFestivalActivities(client,'FESTIVAL_PUSH_STRUCTURE_OR_SEQUENCE_UNKNOWN');return;}
  try{state.snapshot={seq,observedAt:new Date(receivedAt).toISOString(),activities:structuredClone(rows)};state.reason=null;}catch{invalidateFestivalActivities(client,'FESTIVAL_PUSH_NOT_COPYABLE');}
}
export function readFestivalActivitySnapshot(client,expected=null) {
  const state=liveFestivalActivities.get(client);
  if(state&&!festivalContextCurrent(client,state))invalidateFestivalActivities(client,'FESTIVAL_CONTEXT_UNKNOWN_OR_CHANGED');
  else if(state?.seeded&&(!client.connected||state.socket!==client.socket))invalidateFestivalActivities(client,'FESTIVAL_CONNECTION_NOT_CURRENT');
  const common={readOnly:true,executable:false,source:'SCAllActivity.festivalActivities',scope:'ACCEPTED_STREAM_OBSERVATION_ONLY',complete:false,independentRereadAvailable:false};
  if(!state||state.invalid||!state.seeded||!state.snapshot||expected&&['accountId','generation','connectionId'].some(k=>vipValue(expected,k)!==state.context[k]))return {...common,status:'UNKNOWN',reliable:false,reason:state?.reason??'FESTIVAL_CONTEXT_OR_PUSH_UNKNOWN',activities:null,observedAt:null,seq:null};
  return {...common,status:'OBSERVED',reliable:true,reason:null,...state.context,...state.identity,...structuredClone(state.snapshot)};
}
export const FESTIVAL_ACTIVITY_OBSERVATION_EVIDENCE=Object.freeze({protocolSha256:LIVE_VIP_LEVEL_EVIDENCE.protocolSha256,source:'SCAllActivity.festivalActivities / DispFestivalActivity / DispSubActivity.dailyActive / DailyActiveDetail.checkInId',scope:'Transport observation only; no eligibility, game day, independent claim reread or automatic execution',realGame:'REAL_UNVERIFIED'});

export class GameClient extends EventEmitter {
  constructor({ url = DEFAULT_GATEWAY, protocol, login = null, WebSocketImpl = globalThis.WebSocket, assertTransport = () => {}, accountId = null, generation = 0, gameClock = null } = {}) {
    super();
    this.assertTransport = assertTransport;
    this.factContext = { accountId, generation };
    liveVipLevels.set(this, { owner: { accountId, generation } });
    livePlayerLevels.set(this, { owner: { accountId, generation } });
    resetVipLevel(this, 'VIP_NOT_LOGGED_IN');
    resetPlayerLevel(this, 'PLAYER_NOT_LOGGED_IN');
    liveFestivalActivities.set(this,{owner:{accountId,generation}});
    resetFestivalActivities(this,'FESTIVAL_NOT_LOGGED_IN');
    liveMonthCards.set(this, { owner: { accountId, generation } });
    resetMonthCards(this, 'MONTH_CARD_NOT_LOGGED_IN');
    this.gameClock = gameClock ?? (typeof accountId === 'string' && accountId ? trustedGameClock({ accountId, generation }) : { reset() {}, markPing() {}, observePong() {}, read: () => ({ status: 'UNKNOWN', reliable: false, reason: 'CONTEXT_UNKNOWN' }) });
    this.url = url;
    this.login = login;
    this.WebSocketImpl = WebSocketImpl;
    this.loginPromise = null;
    this.loginAttempt = null;
    this.loginResponse = null;
    this.codec = createCodec(protocol);
    this.state = 'IDLE';
    this.socket = null;
    this.sendSeqNo = Math.floor(1000 * Math.random()) + 1;
    this.recvSeqNo = null;
    this.nextAckSeqNo = null;
    this.ackTimer = null;
    this.tickTimer = null;
    this.lastPingTimestamp = 0;
    this.lastResponseAt = 0;
    this.latencyMs = 0;
    this.serverClockOffsetMs = 0;
    this.pending = [];
    this.lateResponses = new Set();
    this.promptUncertain = false;
    this.watchers = [];
    this.uncertainWrites = new Set();
    this.sendOrder = 0;
    this.heartbeatDiagnostics = [];
    this.lastTickAt = null;
    this.stopping = false;
  }

  get connected() {
    return this.state === 'READY' && this.socket !== null && this.socket.readyState === 1;
  }

  readVipLevel() {
    const state = liveVipLevels.get(this), context = vipContext(this);
    if (state && !vipCurrentContext(this, state)) invalidateVipLevel(this, 'VIP_CONTEXT_UNKNOWN_OR_CHANGED');
    else if (state?.seeded && (!this.connected || state.socket !== this.socket)) invalidateVipLevel(this, 'VIP_CONNECTION_NOT_CURRENT');
    const current = Boolean(state && !state.invalid && state.seeded && this.connected && state.socket === this.socket
      && vipCurrentContext(this, state) && vipLevel(state.level));
    return { status: current ? 'CURRENT' : 'UNKNOWN', reliable: current, vipLevel: current ? state.level : null,
      source: current ? state.source : null, reason: current ? null : state?.reason ?? 'VIP_LOGIN_BASELINE_UNKNOWN',
      accountId: vipText(context.accountId) ? context.accountId : null, generation: vipGeneration(context.generation) ? context.generation : null,
      connectionId: vipText(context.connectionId) ? context.connectionId : null,
      playerId: state && sameVipContext(state.context, context) ? state.identity?.playerId ?? null : null,
      worldId: state && sameVipContext(state.context, context) ? state.identity?.worldId ?? null : null };
  }

  readMonthCards() {
    const state = liveMonthCards.get(this), context = vipContext(this);
    if (state && !vipCurrentContext(this, state)) invalidateMonthCards(this, 'MONTH_CARD_CONTEXT_UNKNOWN_OR_CHANGED', true);
    else if (state?.anchored && (!this.connected || state.socket !== this.socket)) invalidateMonthCards(this, 'MONTH_CARD_CONNECTION_NOT_CURRENT', true);
    const current = monthCardsCurrentConnection(this, state) && state.cards !== null;
    return { status: current ? 'CURRENT' : 'UNKNOWN', reliable: current,
      cards: current ? state.cards.map(row => ({ ...row })) : null, source: current ? 'MonthCardResponse' : null,
      sourceAt: current ? state.sourceAt : null, reason: current ? null : state?.reason ?? 'MONTH_CARD_LOGIN_BASELINE_UNKNOWN',
      accountId: vipText(context.accountId) ? context.accountId : null, generation: vipGeneration(context.generation) ? context.generation : null,
      connectionId: vipText(context.connectionId) ? context.connectionId : null,
      playerId: state && sameVipContext(state.context, context) ? state.identity?.playerId ?? null : null,
      worldId: state && sameVipContext(state.context, context) ? state.identity?.worldId ?? null : null };
  }

  setState(state, detail) {
    this.state = state;
    this.emit('state', { state, detail });
  }

  // One login owns one socket; all callers share it until it settles.
  connect(loginBody = this.login, { timeout = LOGIN_TIMEOUT_MS } = {}) {
    if (this.loginPromise) return this.loginPromise;
    if (this.state === 'READY' && this.connected) return Promise.resolve(this.loginResponse);
    this.stopping = false;
    this.gameClock.reset();
    resetVipLevel(this, 'VIP_LOGIN_PENDING');
    resetPlayerLevel(this, 'PLAYER_LOGIN_PENDING');
    resetFestivalActivities(this,'FESTIVAL_LOGIN_PENDING');
    resetMonthCards(this, 'MONTH_CARD_LOGIN_PENDING');
    const attempt = { resolve: null, reject: null, timer: null };
    const promise = new Promise((resolve, reject) => Object.assign(attempt, { resolve, reject }));
    this.loginPromise = promise;
    this.loginAttempt = attempt;
    this.setState('CONNECTING', this.url);
    if (this.loginAttempt !== attempt) return promise;
    try {
      this.assertTransport();
      const socket = new this.WebSocketImpl(this.url);
      socket.binaryType = 'arraybuffer';
      this.socket = socket;
      liveVipLevels.get(this).socket = socket;
      livePlayerLevels.get(this).socket = socket;
      liveFestivalActivities.get(this).socket = socket;
      liveMonthCards.get(this).socket = socket;
      const frame = this.codec.encode('LoginRequest', this.bumpSeqNo(), loginBody || {});
      const current = () => this.loginAttempt === attempt && this.socket === socket;
      attempt.timer = setTimeout(() => {
        if (current()) this.finishConnection('FAILED', new Error('login timeout'), 'loginTimeout');
      }, timeout);
      socket.onopen = () => {
        if (!current()) return;
        try {
          this.emit('frame', { dir: 'out', name: 'LoginRequest', seq: this.sendSeqNo, bytes: frame });
          this.assertTransport();
          if (!current()) return;
          socket.send(frame);
        } catch (error) {
          this.finishConnection('FAILED', error, 'loginSendFailed');
        }
      };
      socket.onerror = () => {
        if (current()) this.finishConnection('FAILED', new Error('socket error during login'), 'loginSocketError');
      };
      socket.onclose = (event) => { if (current()) this.onClose(event); };
      socket.onmessage = (event) => {
        if (!current()) return;
        try {
          const decoded = this.codec.decode(event.data);
          if (decoded.name !== 'LoginResponse') throw new Error('unexpected auth reply: ' + decoded.name);
          const body = decoded.body;
          if (body.result !== 0) {
            const error = new Error('login rejected: result=' + body.result + ' ' + (body.errorMessage || ''));
            error.loginResponse = body;
            this.finishConnection('REJECTED', error, 'loginRejected');
            return;
          }
          clearTimeout(attempt.timer);
          attempt.timer = null;
          this.sendSeqNo = body.initSeqNo ?? 0;
          this.recvSeqNo = null;
          this.nextAckSeqNo = null;
          this.lastResponseAt = Date.now();
          this.loginResponse = body;
          seedVipLevel(this, body, socket);
          seedPlayerLevel(this, body, socket);
          seedFestivalActivities(this,body,socket);
          seedMonthCards(this, body, socket);
          socket.onmessage = (message) => { if (this.socket === socket) this.onMessage(message.data); };
          socket.onclose = (closed) => { if (this.socket === socket) this.onClose(closed); };
          socket.onerror = () => {
            if (this.socket !== socket) return;
            const error = new Error('socket error');
            this.finishConnection('FAILED', error, 'socketError');
            if (this.listenerCount('error')) this.emit('error', error);
          };
          socket.onopen = null;
          this.lastPingTimestamp = 0;
          this.setState('READY', 'player=' + (body.playerInfo?.nickname ?? '') + ' initSeqNo=' + body.initSeqNo);
          if (!current()) return;
          this.sendPing(Date.now());
          if (!current()) return;
          this.tickTimer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
          this.loginAttempt = null;
          this.loginPromise = null;
          attempt.resolve(body);
          this.emit('login', body);
        } catch (error) {
          if (this.socket === socket) this.finishConnection('FAILED', error, 'loginFailed');
        }
      };
    } catch (error) {
      this.finishConnection('FAILED', error, 'connectFailed');
    }
    return promise;
  }

  // Every terminal path releases resources before publishing its final state.
  finishConnection(state, error, reason = state.toLowerCase()) {
    resetVipLevel(this, 'VIP_CONNECTION_ENDED');
    resetPlayerLevel(this, 'PLAYER_CONNECTION_ENDED');
    resetFestivalActivities(this,'FESTIVAL_CONNECTION_ENDED');
    resetMonthCards(this, 'MONTH_CARD_CONNECTION_ENDED');
    this.recordHeartbeat('TERMINAL', { state });
    this.gameClock.reset();
    const attempt = this.loginAttempt;
    this.loginAttempt = null;
    this.loginPromise = null;
    this.loginResponse = null;
    this.lateResponses.clear();
    this.promptUncertain = false;
    if (attempt) clearTimeout(attempt.timer);
    if (this.tickTimer !== null) clearInterval(this.tickTimer);
    if (this.ackTimer !== null) clearTimeout(this.ackTimer);
    this.tickTimer = null;
    this.ackTimer = null;
    this.nextAckSeqNo = null;
    this.lastPingTimestamp = 0;
    for (const entry of [...this.pending.splice(0), ...this.watchers.splice(0)]) {
      clearTimeout(entry.timer);
      entry.cleanup?.();
      if (entry.mutate && entry.sent !== undefined) this.uncertainWrites.add(entry.key);
      entry.reject(error);
    }
    this.discardSocket(reason);
    this.setState(state, error?.message);
    attempt?.reject(error);
  }

  bumpSeqNo() {
    this.sendSeqNo = nextSeqNo(this.sendSeqNo);
    return this.sendSeqNo;
  }

  send(name, body, { signal, onDispatch, beforeDispatch } = {}) {
    let transportEntered = false;
    try {
      if (!this.connected) throw Object.assign(new Error('not connected'),{code:'CANCELLED'});
      const seq = this.bumpSeqNo();
      const frame = this.codec.encode(name, seq, body || {});
      this.emit('frame', { dir: 'out', name, seq, bytes: frame, body });
      if (signal?.aborted) {
        const error = new Error('execution cancelled before dispatch');
        error.code = 'CANCELLED';
        throw error;
      }
      if (!this.connected) throw Object.assign(new Error('not connected'),{code:'CANCELLED'});
      this.assertTransport();
      // Encoding, frame listeners and the writer fence can block synchronously.
      // The caller rechecks current business eligibility after all of them.
      beforeDispatch?.();
      const entry = onDispatch?.(seq);
      transportEntered = true;
      if (name === 'MonthCardRequest') monthCardRefreshDispatched(this, entry);
      this.socket.send(frame);
      return seq;
    } catch(error) {
      if(!transportEntered) {
        // A fresh wrapper proves this occurrence only; a reused Error from a
        // prior failed attempt must never attest a later socket failure.
        const local = new Error(error?.message ?? String(error), {cause:error});
        if(error?.code!==undefined)local.code=error.code;
        if(error?.name==='AbortError')local.name='AbortError';
        undispatchedErrors.set(local,beforeDispatch);
        throw local;
      }
      throw error;
    }
  }

  sendNoSeq(name, body) {
    if (!this.connected) return false;
    const frame = this.codec.encode(name, 0, body || {});
    this.emit('frame', { dir: 'out', name, seq: 0, bytes: frame, body });
    this.assertTransport();
    if (name === 'MonthCardRequest') monthCardRefreshDispatched(this);
    this.socket.send(frame);
    return true;
  }

  request(name, body, responseName = name.slice(0, -7) + 'Response', timeout = 15000, { mutate = false, signal, beforeDispatch } = {}) {
    // Responses carry no request id: only equivalent requests can share one response.
    let key;
    try {
      key = Array.from(this.codec.encode(name, 0, body || {})).join(',');
    } catch (error) {
      return Promise.reject(error);
    }
    if (signal?.aborted) {
      const error = new Error('execution cancelled before dispatch');
      error.code = 'CANCELLED';
      return Promise.reject(error);
    }
    if (mutate && this.uncertainWrites.has(key)) {
      const error = new Error('previous write remains unverified: ' + name);
      error.code = 'WRITE_UNCERTAIN';
      return Promise.reject(error);
    }
    if (this.lateResponses.has(responseName)) {
      const error = new Error('previous request timed out; response is still uncorrelated: ' + responseName);
      error.code = 'RESPONSE_UNCERTAIN';
      return Promise.reject(error);
    }
    const existing = this.pending.find((entry) => entry.responseName === responseName);
    if (existing) {
      if (existing.name === name && existing.key === key) return existing.promise;
      const error = new Error('conflicting request already waiting for ' + responseName);
      error.code = 'RESPONSE_CONFLICT';
      return Promise.reject(error);
    }
    const entry = { name, responseName, key, mutate, timer: null, order: this.sendOrder++, promise: null };
    entry.promise = new Promise((resolve, reject) => Object.assign(entry, { resolve, reject }));
    entry.timer = setTimeout(() => {
      this.pending = this.pending.filter((item) => item !== entry);
      this.lateResponses.add(responseName);
      if (entry.mutate && entry.sent !== undefined) this.uncertainWrites.add(key);
      this.promptUncertain = true;
      failMonthCardQuery(this, entry, 'MONTH_CARD_QUERY_TIMEOUT');
      entry.cleanup?.();
      const error = new Error('timeout waiting for ' + responseName + ' (sent ' + name + ')');
      error.code = 'RESPONSE_TIMEOUT';
      entry.reject(error);
    }, timeout);
    this.pending.push(entry);
    prepareMonthCardQuery(this, entry, signal);
    try {
      this.send(name, body, { signal, beforeDispatch, onDispatch: (seq) => { captureMonthCardQuery(this, entry); entry.sent = seq; return entry; } });
    } catch (error) {
      failMonthCardQuery(this, entry, 'MONTH_CARD_QUERY_FAILED');
      entry.cleanup?.();
      if (entry.mutate && entry.sent !== undefined) this.uncertainWrites.add(key);
      clearTimeout(entry.timer);
      this.pending = this.pending.filter((item) => item !== entry);
      entry.reject(error);
    }
    return entry.promise;
  }

  // Silence proves dispatch only. Keep an unresolved fingerprint so the same
  // write cannot be re-sent after timeout, cancellation or reconnection.
  sendWatch(name, body, { window = 350, signal, beforeDispatch } = {}) {
    if (signal?.aborted) {
      const error = new Error('execution cancelled');
      error.code = 'CANCELLED';
      return Promise.reject(error);
    }
    let key;
    try { key = Array.from(this.codec.encode(name, 0, body || {})).join(','); }
    catch (error) { return Promise.reject(error); }
    if (this.uncertainWrites.has(key) || this.watchers.some((entry) => entry.key === key)) {
      const error = new Error('previous write remains unverified: ' + name);
      error.code = 'WRITE_UNCERTAIN';
      return Promise.reject(error);
    }
    const watcher = { name, key, mutate: true, order: this.sendOrder++, timer: null };
    const promise = new Promise((resolve, reject) => Object.assign(watcher, { resolve, reject }));
    const cleanup = () => {
      watcher.settled = true;
      signal?.removeEventListener('abort', cancel);
    };
    const uncertain = () => {
      if (watcher.sent !== undefined) {
        this.uncertainWrites.add(key);
      }
    };
    const cancel = () => {
      if (watcher.settled) return;
      this.watchers = this.watchers.filter((entry) => entry !== watcher);
      clearTimeout(watcher.timer);
      cleanup();
      uncertain();
      const error = new Error('execution cancelled; dispatched write is unverified');
      error.code = 'CANCELLED';
      if(watcher.sent===undefined)undispatchedErrors.set(error,beforeDispatch);
      watcher.reject(error);
    };
    watcher.cleanup = cleanup;
    this.watchers.push(watcher);
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      this.send(name, body, { signal, beforeDispatch, onDispatch: (seq) => { watcher.sent = seq; } });
      // Synchronous prompts, close and abort callbacks already settled this watcher.
      if (watcher.settled) return promise;
      if (signal?.aborted) { cancel(); return promise; }
      watcher.timer = setTimeout(() => {
        this.watchers = this.watchers.filter((entry) => entry !== watcher);
        cleanup();
        uncertain();
        if (watcher.ambiguousPrompt) {
          const error = new Error('uncorrelated server prompt while waiting for ' + name);
          error.code = 'AMBIGUOUS_PROMPT';
          watcher.reject(error);
        } else {
          watcher.resolve({ sent: watcher.sent, name, status: 'UNKNOWN', ok: null });
        }
      }, window);
    } catch (error) {
      this.watchers = this.watchers.filter((entry) => entry !== watcher);
      cleanup();
      uncertain();
      watcher.reject(error);
    }
    return promise;
  }

  // A typed acknowledgement is insufficient when the authoritative post-read failed.
  markUnverifiedWrite(name, body) {
    const key = Array.from(this.codec.encode(name, 0, body || {})).join(',');
    this.uncertainWrites.add(key);
    return key;
  }

  // Only a caller that re-read and verified the effect may release this write.
  confirmWatchedWrite(name, body) {
    const key = Array.from(this.codec.encode(name, 0, body || {})).join(',');
    return this.uncertainWrites.delete(key);
  }

  // PromptResponse has no correlation id. Multiple candidates must not be guessed.
  attributePrompt(body) {
    const candidates = [...this.pending, ...this.watchers];
    const uncertain = this.promptUncertain || this.uncertainWrites.size > 0;
    if (candidates.length !== 1 || uncertain) {
      if (candidates.length > 1 || uncertain) {
        this.promptUncertain = true;
        for (const entry of candidates) entry.ambiguousPrompt = true;
        this.emit('promptAmbiguous', { requests: candidates.map((entry) => entry.name) });
      }
      return;
    }
    const entry = candidates[0];
    const reason = (body?.args ?? []).join(' ') || 'prompt=' + body?.prompt;
    const error = new Error('server prompt: ' + reason);
    error.prompt = body;
    error.request = entry.name;
    this.pending = this.pending.filter((item) => item !== entry);
    this.watchers = this.watchers.filter((item) => item !== entry);
    clearTimeout(entry.timer);
    entry.cleanup?.();
    entry.reject(error);
  }

  recordHeartbeat(kind, values = {}) {
    this.heartbeatDiagnostics.push({ kind, at: Date.now(), ...values });
    if (this.heartbeatDiagnostics.length > 20) this.heartbeatDiagnostics.shift();
  }

  clockDiagnostics() { return { clock: this.gameClock.read(this.factContext), events: structuredClone(this.heartbeatDiagnostics), pingTimeoutMs: PING_TIMEOUT_MS, tickIntervalMs: TICK_INTERVAL_MS }; }

  sendPing(timestamp) {
    this.lastPingTimestamp = timestamp;
    this.gameClock.markPing(timestamp);
    this.recordHeartbeat('PING', { outstandingAgeMs: 0 });
    this.sendNoSeq('PingRequest', { clientTimestamp: timestamp });
  }

  tryHandlePong(body) {
    if (!this.lastPingTimestamp) return false;
    // The server echoes our timestamp back as an int64, which decodes to the
    // long-form { low, high } object when no Long library is installed.
    const echoed = toNumber(body?.clientTimestamp);
    if (echoed !== this.lastPingTimestamp) return false;
    const now = Date.now();
    const clockFact = this.gameClock.observePong(body);
    this.recordHeartbeat('PONG', { roundTripMs: Math.max(0, now - echoed), trusted: clockFact?.reliable === true });
    this.lastPingTimestamp = 0;
    const sample = 0.4 * (now - echoed) + 0.6 * this.latencyMs;
    this.latencyMs = Math.round(Math.max(sample, 0));
    this.serverClockOffsetMs = Math.round(toNumber(body.serverTimestamp) - now + sample / 2);
    this.emit('pong', { latencyMs: this.latencyMs, offsetMs: this.serverClockOffsetMs });
    return true;
  }

  onMessage(data) {
    let decoded;
    try {
      decoded = this.codec.decode(data);
    } catch (error) {
      invalidateVipLevel(this, 'VIP_STREAM_DECODE_FAILED');
      invalidatePlayerLevel(this, 'PLAYER_STREAM_DECODE_FAILED');
      invalidateFestivalActivities(this,'FESTIVAL_STREAM_DECODE_FAILED');
      invalidateMonthCards(this, 'MONTH_CARD_STREAM_DECODE_FAILED', true);
      this.emit('error', new Error(`decode failed: ${error.message}`));
      return;
    }
    const receivedAt = Date.now();
    this.lastResponseAt = receivedAt;
    const { seq, name, body } = decoded;
    if (name === 'PingResponse' && this.tryHandlePong(body)) return;

    if (!this.handleSeqNo(seq, name)) return;
    if (name === 'ResendFailed' || name === 'SCChannelExpired') {
      invalidateVipLevel(this, 'VIP_CONNECTION_ENDED');
      invalidatePlayerLevel(this, 'PLAYER_CONNECTION_ENDED');
      invalidateFestivalActivities(this,'FESTIVAL_CONNECTION_ENDED');
      invalidateMonthCards(this, 'MONTH_CARD_CONNECTION_ENDED', true);
    }
    if (name === 'SCServerTimeChanged') this.gameClock.reset();
    if (name === 'SCVipUpdate') updateVipLevel(this, body, seq, receivedAt);
    if (name === 'SCPlayerExpUpdate') updatePlayerLevel(this, body, seq, receivedAt);
    if (name === 'SCAllActivity') updateFestivalActivities(this,body,seq,receivedAt);
    if (name === 'SCEWorldOrderDelivery') observeMonthCardDelivery(this, body, seq);
    if (name === 'MonthCardResponse') observeMonthCardResponse(this, body, seq, receivedAt);
    this.emit('message', { seq, name, body });

    if (name === 'ResendFailed') {
      this.finishConnection('FAILED', new Error('resend failed'), 'resendFailed');
      this.emit('fatal', { reason: 'ResendFailed', seqNo: body.seqNo });
      return;
    }
    if (name === 'SCChannelExpired') {
      this.finishConnection('EXPIRED', new Error('channel expired'), 'channelExpired');
      this.emit('fatal', { reason: 'SCChannelExpired', detail: body.reason });
      return;
    }
    // 业务拦截：服务端拒绝一个请求时不回 *Response，而是推一条 PromptResponse。
    // 不处理的话每次被拒都要干等满超时。
    if (name === 'PromptResponse') {
      this.emit('prompt', body);
      this.attributePrompt(body);
      return;
    }
    if (this.lateResponses.delete(name)) {
      this.emit('drop', { reason: 'lateResponse', name, seq });
      return;
    }
    const index = this.pending.findIndex((item) => item.responseName === name);
    if (index >= 0) {
      const [entry] = this.pending.splice(index, 1);
      clearTimeout(entry.timer);
      entry.cleanup?.();
      entry.resolve(body);
    }
  }

  handleSeqNo(seq, name) {
    if (seq > 0 && seq <= MAX_SEQ) {
      if (this.recvSeqNo === null) {
        this.recvSeqNo = seq;
      } else if (seq !== nextSeqNo(this.recvSeqNo)) {
        if (isSeqNoInRange(seq, this.recvSeqNo)) {
          this.ack(this.recvSeqNo);
          this.emit('drop', { reason: 'duplicate', name, seq, recvSeqNo: this.recvSeqNo });
        } else {
          invalidateVipLevel(this, 'VIP_STREAM_SEQUENCE_GAP');
      invalidatePlayerLevel(this, 'PLAYER_STREAM_SEQUENCE_GAP');
          invalidateFestivalActivities(this,'FESTIVAL_STREAM_SEQUENCE_GAP');
          invalidateMonthCards(this, 'MONTH_CARD_STREAM_SEQUENCE_GAP', true);
          this.sendNack(this.recvSeqNo);
          this.emit('drop', { reason: 'gap', name, seq, recvSeqNo: this.recvSeqNo });
        }
        return false;
      } else {
        this.recvSeqNo = seq;
        this.ack(seq);
      }
    }
    return true;
  }

  ack(seq) {
    if (this.nextAckSeqNo === null) {
      this.nextAckSeqNo = seq;
    } else if (!isSeqNoInRange(seq, this.nextAckSeqNo)) {
      this.nextAckSeqNo = seq;
    }
    if (this.ackTimer === null) {
      this.ackTimer = setTimeout(() => {
        this.ackTimer = null;
        if (this.nextAckSeqNo !== null) {
          try {
            this.sendNoSeq('Ack', { seqNo: this.nextAckSeqNo });
          } catch (error) {
            this.finishConnection('FAILED', error, 'ackSendFailed');
          }
          this.nextAckSeqNo = null;
        }
      }, ACK_DELAY_MS);
    }
  }

  sendNack(seqNo) {
    this.sendNoSeq('Nack', { seqNo });
  }

  tick() {
    const observedAt = Date.now(), tickGapMs = this.lastTickAt === null ? null : Math.max(0, observedAt - this.lastTickAt);
    this.lastTickAt = observedAt;
    if (tickGapMs !== null && tickGapMs > TICK_INTERVAL_MS + 100) this.recordHeartbeat('TICK_DELAY', { tickGapMs });
    if (!this.stopping) {
      const now = Date.now();
      if (this.connected) {
        if (this.lastPingTimestamp > 0) {
          if (now - this.lastPingTimestamp > PING_TIMEOUT_MS) {
            this.emit('warn', 'ping timeout');
            this.finishConnection('FAILED', new Error('ping timeout'), 'pingTimeout');
          }
        } else {
          try {
            this.sendPing(now);
          } catch (error) {
            this.finishConnection('FAILED', error, 'pingSendFailed');
          }
        }
      }
    }
    this.emit('tick', this.snapshot());
  }

  snapshot() {
    return {
      state: this.state,
      url: this.url,
      connected: this.connected,
      latencyMs: this.latencyMs,
      offsetMs: this.serverClockOffsetMs,
      sendSeqNo: this.sendSeqNo,
      recvSeqNo: this.recvSeqNo,
      lastResponseAt: this.lastResponseAt,
    };
  }

  discardSocket(reason) {
    if (!this.socket) return;
    const socket = this.socket;
    this.socket = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    socket.onopen = null;
    try {
      socket.close(4001, reason);
    } catch {
      /* already closing */
    }
  }

  onClose(event) {
    const error = new Error('socket closed: ' + (event?.code ?? '') + ' ' + (event?.reason || ''));
    this.finishConnection(this.stopping ? 'STOPPED' : 'CLOSED', error, 'socketClosed');
    this.emit('close', { code: event?.code, reason: event?.reason });
  }

  stop() {
    this.stopping = true;
    if (!this.socket && !this.loginAttempt && ['FAILED', 'CLOSED', 'REJECTED', 'EXPIRED', 'STOPPED'].includes(this.state)) return;
    this.finishConnection('STOPPED', new Error('client stopped'), 'stop');
  }
}
