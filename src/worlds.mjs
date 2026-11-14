import { GameClient } from './client.mjs';
import { toNumber } from './client.mjs';

// The gateway is not world-scoped: one socket serves the whole account, and the world
// is chosen by LoginRequest.worldId (0 means "wherever this account last was"). So both
// listing worlds and entering one happen on the same kind of connection.
export const CURRENT_WORLD = 0;

// protobufjs hands back int64 as { low, high, unsigned } with no Long library installed.
// Collapse those back to numbers so the output is readable and JSON-safe.
export function normalize(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value !== 'object') return value;
  if (typeof value.low === 'number' && typeof value.high === 'number') return toNumber(value);
  const out = {};
  for (const [key, item] of Object.entries(value)) out[key] = normalize(item);
  return out;
}

// Preserve exact signed int64 identities without changing legacy numeric views.
// Missing/inherited protobuf defaults are unknown, never an existing identity.
const own = (value,key) => value !== null && typeof value === 'object' && Object.hasOwn(value,key);
function exactIdentity(value) {
  let id;
  if (typeof value === 'number' && Number.isSafeInteger(value)) id=BigInt(value);
  else if (typeof value === 'bigint') id=value;
  else if (typeof value === 'string' && /^[1-9][0-9]*$/.test(value) && value.length<=19) id=BigInt(value);
  else if (own(value,'low') && own(value,'high') && ['low','high'].every(key=>Number.isInteger(value[key])&&value[key]>=-2147483648&&value[key]<=2147483647)
    && (value.unsigned===undefined||typeof value.unsigned==='boolean') && Object.keys(value).every(key=>['low','high','unsigned'].includes(key))) {
    const bits=(BigInt(value.high>>>0)<<32n)|BigInt(value.low>>>0);
    id=value.unsigned===true?bits:BigInt.asIntN(64,bits);
  }
  return id>0n && id<=9223372036854775807n ? id<=BigInt(Number.MAX_SAFE_INTEGER)?Number(id):id.toString() : null;
}
function exactRoleId(info) {
  const keys=['id','playerId'].filter(key=>own(info,key));
  if(!keys.length)return null;
  const ids=keys.map(key=>exactIdentity(info[key]));
  return ids.some(id=>id===null)||ids.some(id=>id!==ids[0])?null:ids[0];
}

// AccountRoleInfo (world list) and PlayerInfo (login) carry the same identity fields
// under different names, so accept either.
export function describeRole(info) {
  if (!info) return null;
  const role = normalize(info);
  return {
    id: exactRoleId(info),
    nickname: role.nickname,
    level: role.level,
    power: role.power,
    appId: role.appId,
    channelId: role.channelId,
    worldId: own(info,'worldId') ? exactIdentity(info.worldId) : null,
    bornWorldId: own(info,'bornWorldId') ? exactIdentity(info.bornWorldId) : null,
    roleCreateTime: role.roleCreateTime,
    lastLoginTime: role.lastLoginTime,
    ...(role.newRole === undefined ? {} : { newRole: role.newRole }),
  };
}

// GameWorldInfo.worldId is the key the server-select screen uses, which is the world the
// role was *born* in. roleInfo.worldId is where the role actually lives now — after a
// world merge the two differ, and the server resolves the requested key to the successor.
export function describeWorld(world) {
  const value = normalize(world);
  return { worldId: own(world,'worldId') ? exactIdentity(world.worldId) : null, tag: value.tag, role: describeRole(world.roleInfo) };
}

// Pure query. Returns the worlds this account has roles on, which is exactly what the
// game's server-select screen renders.
export async function listWorlds(client, timeout = 10000) {
  const body = await client.request('GameWorldListRequest', {}, 'GameWorldListResponse', timeout);
  if (!body || !Object.hasOwn(body,'recentWorlds') || !Array.isArray(body.recentWorlds)) throw Object.assign(new Error('区服列表来源缺失或无效'),{code:'WORLD_LIST_UNKNOWN',statusCode:409});
  return {
    latestGroupId: Object.hasOwn(body,'latestGroupId') ? body.latestGroupId : null,
    recentWorlds: body.recentWorlds.map(describeWorld),
  };
}

// All worlds inside a group, not just the ones this account has visited.
export async function listGroup(client, groupId, timeout = 10000) {
  const body = await client.request('GameWorldGroupListRequest', { groupId }, 'GameWorldGroupListResponse', timeout);
  if (!body || !Object.hasOwn(body,'worlds') || !Array.isArray(body.worlds)) throw Object.assign(new Error('区服分组来源缺失或无效'),{code:'WORLD_LIST_UNKNOWN',statusCode:409});
  return body.worlds.map(describeWorld);
}

// Entering a world is just a login that names it. `newRole` in the returned PlayerInfo
// means the server created a fresh role there, so callers must not treat an arbitrary
// worldId as a read.
export async function enterWorld({ url, login, protocol }, worldId, timeout = 15000) {
  const client = new GameClient({ url, protocol });
  try {
    const response = await client.connect({ ...login, worldId });
    return { client, player: normalize(response.playerInfo), initSeqNo: response.initSeqNo };
  } catch (error) {
    client.stop();
    throw error;
  }
}
