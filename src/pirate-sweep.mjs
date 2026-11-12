// W12 observations only; level relations do not authorize PirateSweep writes.
export const PIRATE_SWEEP_READ_EVIDENCE = Object.freeze({
  packageSha256: '4fd1f03034b78b0ea0d80590ce1082aa805529b91b2ef99ced9ca2d9f00c2444',
  entrySha256: 'a6046fcc2ad7a3424282e9f8b51073656f5ae8d48742129743560bf958266c54',
  piratePop: Object.freeze({ byteOffset: 5274760, sha256: 'f49917699c61e9500f95b570d6378b8ced4b40de0f4118ef84c6f265da3edccb' }),
  pirateUtil: Object.freeze({ byteOffset: 5280971, sha256: 'a042c7074d4c099ae4e2f827ceeb6623ebb5cbc20aa220a72f95ab0b1b8452f8' }),
  scope: 'CURRENT_SNAPSHOT_READ_ONLY',
  realGame: 'REAL_UNVERIFIED',
});

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const ownValue = (value, key) => object(value) ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;
const uint = value => Number.isInteger(value) && value >= 0 && value <= 2147483647;
const positive = value => uint(value) && value > 0;
const dense = value => Array.isArray(value) && value.length <= 10000
  && Reflect.ownKeys(value).length === value.length + 1
  && Array.from({ length: value.length }, (_, index) => Object.getOwnPropertyDescriptor(value, index))
    .every(descriptor => descriptor?.enumerable && Object.hasOwn(descriptor, 'value'));

// Prefer the collector's lossless own-field snapshot; do not resurrect old data.
function observed(state, name) {
  if (Object.hasOwn(state?.failed ?? {}, name)) return null;
  const outcome = ownValue(state?.outcomes, name);
  if (Object.hasOwn(state?.outcomes ?? {}, name) && ownValue(outcome, 'status') !== 'SUCCESS') return null;
  if (Object.hasOwn(state?.raw ?? {}, name)) return ownValue(state.raw, name);
  return ownValue(state?.ok, name) ?? null;
}

function killLevels(response) {
  const rows = ownValue(response, 'records');
  if (!dense(rows)) return null;
  const levels = new Map();
  for (const row of rows) {
    const type = ownValue(row, 'type'), level = ownValue(row, 'maxKilledLevel');
    if (!positive(type) || !uint(level) || levels.has(type)) return null;
    levels.set(type, level);
  }
  return levels;
}

export function pirateSweepView(state) {
  const pirates = observed(state, 'AllPirateRequest');
  const kill = killLevels(observed(state, 'PirateKillRecordRequest'));
  const used = ownValue(pirates, 'sweepTimes');
  const result = {
    usedSweeps: uint(used) ? used : null,
    totalSweeps: null,
    remainingSweeps: null,
    quotaReason: 'TOTAL_QUOTA_AUTHORITY_UNAVAILABLE',
    targetsStatus: 'UNKNOWN',
    targetsReason: pirates ? 'INVALID_TARGET_LIST' : 'TARGETS_NOT_OBSERVED',
    killRecordsStatus: kill ? 'AVAILABLE' : 'UNKNOWN',
    targets: [],
  };
  const rows = ownValue(pirates, 'pirates');
  if (!dense(rows)) return result;
  const targets = [], uids = new Set();
  for (const row of rows) {
    const uid = ownValue(row, 'uid'), type = ownValue(row, 'type');
    const level = ownValue(row, 'level'), cityId = ownValue(row, 'cityId');
    if (![uid, type, level, cityId].every(positive) || uids.has(uid)) return result;
    uids.add(uid);
    const maxKilledLevel = kill ? (kill.get(type) ?? 0) : null;
    const levelRelation = maxKilledLevel === null ? 'UNKNOWN'
      : level > maxKilledLevel ? 'FIRST_KILL_REQUIRED'
      : level < maxKilledLevel ? 'LOWER_LEVEL_CONFIRMATION' : 'ELIGIBLE_LEVEL';
    targets.push({ uid, type, level, cityId, maxKilledLevel, levelRelation });
  }
  result.targetsStatus = 'AVAILABLE';
  result.targetsReason = null;
  result.targets = targets;
  return result;
}
