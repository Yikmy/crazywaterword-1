// W13 / C152: facts from the existing read-only collection, not catch or claim authority.
import { RESOURCE_NAMES } from './resource-ledger.mjs';

const fishItem = '鱼', capacityEffect = 16;
const maxRows = 10000, maxSignedInt64 = (1n << 63n) - 1n;

export const FISHING_VIEW_EVIDENCE = Object.freeze({
  packageSha256: '4fd1f03034b78b0ea0d80590ce1082aa805529b91b2ef99ced9ca2d9f00c2444',
  entrySha256: 'a6046fcc2ad7a3424282e9f8b51073656f5ae8d48742129743560bf958266c54',
  protocolSha256: 'ef6137ef923f0b8b44b10379effe0ac2b3555ffab18b278e03e97b19bf4a4dcc',
  v76ProtocolSha256: 'fc25d58348197c04d83af90df1d2f3200f9a9e35ba36ebb3e8a8a90a88348b2f',
  configSha256: '0809253d78b00a81ebb78ab9fc8b94668372f6b8a08430144710325a165da762',
  fishView: Object.freeze({
    byteOffset: 2652227, capacityCheckByteOffset: 2663265, startByteOffset: 2663638, gainByteOffset: 2664672,
    sha256: '43a405289cff271e2dce7e50a51b931d7b2dd39dc7452cc4c671d5f9381d1f99',
  }),
  fishList: Object.freeze({
    byteOffset: 2639544, scoreByteOffset: 2642395, claimByteOffset: 2642882,
    sha256: '48c2105f42d8fe3d3217ceee5e42102c6e817ac7d98415cd390e9411af00f22f',
  }),
  fishModel: Object.freeze({
    byteOffset: 2644780, claimedScoreByteOffset: 2645932, totalScoreByteOffset: 2646114,
    sha256: 'dcb6bffbabb94b3dabd492a22d92cb898aaa7d2052a03417796acda9649472fd',
  }),
  effectModel: Object.freeze({
    byteOffset: 1956702, capacityByteOffset: 1958305,
    sha256: '356949a03e2db24eadef16ca3115d81190fed4c488767cc17b5f9230c08e99af',
  }),
  fishingLevelByteOffset: 7315240, fishItemByteOffset: 2969206,
  scope: 'CURRENT_SNAPSHOT_READ_ONLY', realGame: 'REAL_UNVERIFIED',
});

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const has = (value, key) => object(value) && Object.hasOwn(value, key);
function own(value, key) {
  if (!has(value, key)) return undefined;
  const d = Object.getOwnPropertyDescriptor(value, key);
  return d?.enumerable && Object.hasOwn(d, 'value') ? d.value : undefined;
}
const dense = (value, limit = maxRows) => Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype
  && value.length <= limit && Reflect.ownKeys(value).length === value.length + 1
  && Array.from({ length: value.length }, (_, i) => Object.getOwnPropertyDescriptor(value, i))
    .every(d => d?.enumerable && Object.hasOwn(d, 'value'));
const uint = value => Number.isInteger(value) && value >= 0 && value <= 2147483647;
const positive = value => uint(value) && value > 0;
const signed32 = value => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
const safeCount = value => Number.isSafeInteger(value) && value >= 0;
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 256
  && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
const table = (config, name) => own(own(own(config, 'tables'), name), 'data');
const status = (reason, observed) => reason === null ? 'AVAILABLE' : observed ? 'PARTIAL' : 'UNKNOWN';

function currentResponse(state, name) {
  const failed = own(state, 'failed'), outcomes = own(state, 'outcomes');
  const success = own(own(outcomes, name), 'status') === 'SUCCESS';
  if (has(failed, name) || has(state, 'outcomes') && !success) return null;
  // A current raw snapshot must have its own success marker. Never fall back to
  // an older normalized entry for a missing or invalid current response.
  const exact = has(state, 'raw');
  if (exact && !success) return null;
  const response = own(own(state, exact ? 'raw' : 'ok'), name);
  return object(response) ? { response, exact } : null;
}

function exactItemCount(value, exact) {
  if (safeCount(value)) return value === 0 ? 0 : value;
  if (!exact) return null; // A legacy normalized snapshot cannot recover lost int64 precision.
  let amount;
  if (typeof value === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(value)) amount = BigInt(value);
  else if (object(value) && [own(value, 'low'), own(value, 'high')].every(signed32)
      && own(value, 'unsigned') === false
      && Reflect.ownKeys(value).every(key => ['low', 'high', 'unsigned'].includes(key))) {
    amount = (BigInt(own(value, 'high')) << 32n) + BigInt(own(value, 'low') >>> 0);
  }
  return amount === undefined || amount < 0n || amount > maxSignedInt64 ? null
    : amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : String(amount);
}

function fishStock(observation) {
  const rows = own(observation?.response, 'items');
  if (!dense(rows)) return null;
  const seen = new Set();
  let stock = 0;
  for (const row of rows) {
    const id = own(row, 'itemId');
    if (!identifier(id) || seen.has(id)) return null;
    seen.add(id);
    if (id === fishItem) stock = exactItemCount(own(row, 'num'), observation.exact);
  }
  return stock;
}

function fishCapacity(observation) {
  const rows = own(observation?.response, 'effects');
  if (!dense(rows)) return null;
  const seen = new Set();
  let capacity = null;
  for (const row of rows) {
    const id = own(row, 'id');
    if (!positive(id) || seen.has(id)) return null;
    seen.add(id);
    if (id === capacityEffect) {
      const value = own(row, 'value');
      if (safeCount(value)) capacity = value === 0 ? 0 : value;
    }
  }
  return capacity;
}

function levelView(observation) {
  const row = own(observation?.response, 'fishingLevel');
  const rawLevel = own(row, 'level'), rawEnhance = own(row, 'enhance'), rawRate = own(row, 'criticalRate');
  const level = positive(rawLevel) ? rawLevel : null, enhance = uint(rawEnhance) ? rawEnhance : null;
  const criticalRate = typeof rawRate === 'number' && Number.isFinite(rawRate) && rawRate >= 0 ? rawRate : null;
  const reason = !object(row) ? 'FISHING_LEVEL_NOT_OBSERVED' : [level, enhance, criticalRate].some(value => value === null)
    ? 'FISHING_LEVEL_FIELDS_INCOMPLETE' : null;
  return { level, enhance, criticalRate, status: status(reason, [level, enhance, criticalRate].some(value => value !== null)), reason };
}

function inventoryView(itemObservation, effectObservation) {
  const owned = fishStock(itemObservation), capacity = fishCapacity(effectObservation);
  const reason = owned === null && capacity === null ? 'FISHING_INVENTORY_AND_CAPACITY_UNKNOWN'
    : owned === null ? 'FISHING_STOCK_UNKNOWN' : capacity === null ? 'FISHING_CAPACITY_UNKNOWN' : null;
  const full = reason ? null : BigInt(owned) >= BigInt(capacity);
  const remaining = reason ? null : full ? 0 : capacity - Number(owned);
  return { itemId: fishItem, owned, capacity, remaining, full, status: status(reason, owned !== null || capacity !== null), reason };
}

function fishCatalog(config) {
  const rows = table(config, 'FishBaseCfg');
  if (!dense(rows) || rows.length === 0) return null;
  const fish = new Map();
  for (const row of rows) {
    const id = own(row, 'fishId'), score = own(row, 'score');
    if (!positive(id) || !positive(score) || fish.has(id)) return null;
    fish.set(id, score);
  }
  return fish;
}

const resourceIds = new Set(Object.values(RESOURCE_NAMES));
function stagesOf(config) {
  const rows = table(config, 'FishStageCfg');
  if (!dense(rows) || rows.length === 0) return null;
  const items = table(config, 'ItemCfg');
  const itemIds = dense(items) ? new Set(items.map(row => own(row, 'id')).filter(identifier)) : new Set();
  itemIds.add('加速器'); // The item reward in the fixed v76 fishing stages.
  let cumulative = 0;
  const stages = [];
  for (const row of rows) {
    const stage = own(row, 'stage'), requiredScore = own(row, 'star'), pairs = own(row, 'reward');
    if (stage !== stages.length + 1 || !positive(requiredScore) || !dense(pairs) || pairs.length === 0) return null;
    const rewards = [], seen = new Set();
    for (const pair of pairs) {
      if (!dense(pair, 2) || pair.length !== 2) return null;
      const [id, num] = pair, type = resourceIds.has(id) ? 'RESOURCE' : itemIds.has(id) ? 'ITEM' : null;
      if (!type || !Number.isSafeInteger(num) || num <= 0 || seen.has(id)) return null;
      seen.add(id);
      rewards.push({ type, id, num });
    }
    cumulative += requiredScore;
    stages.push({ stage, requiredScore, cumulativeRequiredScore: cumulative, rewards });
  }
  return stages;
}

function collectionView(observation, config) {
  if (!observation) return {
    rewardId: null, collectedIds: null, collectedCount: null, catalogCount: null,
    totalScore: null, claimedScore: null, availableScore: null, nextStage: null, complete: null,
    status: 'UNKNOWN', reason: 'FISHING_COLLECTION_NOT_OBSERVED',
  };
  const response = observation.response, list = own(response, 'fishList'), reward = own(response, 'rewardId');
  const rewardId = uint(reward) ? reward : null;
  const collectedIds = dense(list) && list.every(positive) && new Set(list).size === list.length ? [...list].sort((a, b) => a - b) : null;
  const catalog = fishCatalog(config), stages = stagesOf(config);
  const validStage = rewardId !== null && stages !== null && rewardId <= stages.length;
  const totalScore = catalog && collectedIds && collectedIds.every(id => catalog.has(id))
    ? collectedIds.reduce((sum, id) => sum + catalog.get(id), 0) : null;
  const claimedScore = validStage ? rewardId === 0 ? 0 : stages[rewardId - 1].cumulativeRequiredScore : null;
  const inconsistent = totalScore !== null && claimedScore !== null && totalScore < claimedScore;
  const availableScore = totalScore === null || claimedScore === null || inconsistent ? null : totalScore - claimedScore;
  // An explicit last-claimed stage is useful even if its fish list is
  // unavailable. A known contradictory score does invalidate completion.
  const complete = validStage && !inconsistent ? rewardId === stages.length : null;
  const next = complete === false ? stages[rewardId] : null;
  // Eligibility is for the configured score requirement only. The view never
  // claims the module is unlocked or a mutation is authorized.
  const nextStage = next ? { ...next, missingScore: availableScore === null ? null : Math.max(0, next.requiredScore - availableScore),
    eligible: availableScore === null ? null : availableScore >= next.requiredScore } : null;
  const reason = collectedIds === null ? 'FISHING_FISH_LIST_UNKNOWN'
    : rewardId === null ? 'FISHING_REWARD_ID_UNKNOWN' : !catalog ? 'FISHING_BASE_CONFIG_UNKNOWN'
      : !stages ? 'FISHING_STAGE_CONFIG_UNKNOWN' : !validStage ? 'FISHING_REWARD_ID_OUTSIDE_CONFIG'
        : totalScore === null ? 'FISHING_COLLECTED_ID_OUTSIDE_CONFIG' : inconsistent ? 'FISHING_COLLECTION_SCORE_INCONSISTENT' : null;
  return { rewardId, collectedIds, collectedCount: collectedIds?.length ?? null, catalogCount: catalog?.size ?? null,
    totalScore, claimedScore, availableScore, nextStage, complete,
    status: status(reason, rewardId !== null || collectedIds !== null), reason };
}

export function fishingView(state, { config = null } = {}) {
  const observed = name => currentResponse(state, name);
  return {
    level: levelView(observed('OnWaterRequest')),
    inventory: inventoryView(observed('AllItemRequest'), observed('GameEffectRequest')),
    collection: collectionView(observed('FishEncyclopediaRequest'), config),
    pendingCatch: { status: 'UNKNOWN', reason: 'NO_AUTHORITATIVE_PENDING_CATCH_READ' },
    evidence: FISHING_VIEW_EVIDENCE,
  };
}
