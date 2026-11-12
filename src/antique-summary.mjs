import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';

export const ANTIQUE_SUMMARY_REQUEST = 'AntiqueAttrSummaryRequest';
export const ANTIQUE_SUMMARY_RESPONSE = 'AntiqueAttrSummaryResponse';

export const ANTIQUE_SUMMARY_EVIDENCE = Object.freeze({
  source: 'v76 /subpackages/main/game.js: AntiqueView._onBtnTips',
  packageSha256: '4fd1f03034b78b0ea0d80590ce1082aa805529b91b2ef99ced9ca2d9f00c2444',
  entrySha256: 'a6046fcc2ad7a3424282e9f8b51073656f5ae8d48742129743560bf958266c54',
  antiqueView: Object.freeze({ byteOffset: 307873, sha256: '2058e8b78473a77e274b78db728ac74338dda0ee2d3264bd3276edd337eb8731' }),
  request: ANTIQUE_SUMMARY_REQUEST, response: ANTIQUE_SUMMARY_RESPONSE,
  scope: 'READ_ONLY_GLOBAL_CAMP_PROFESSION_ATTRIBUTES_AND_EFFECTS',
  realGame: 'REAL_UNVERIFIED',
});
const own = (record, key) => Object.hasOwn(record, key) ? record[key] : undefined;
const recordOf = (value, keys) => value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
const exactText = value => typeof value === 'string' && value.length > 0 && value.trim() === value;
const int32 = value => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
const absentOrScopeId = (row, key) => !Object.hasOwn(row, key) || row[key] === '' || exactText(row[key]);
const unknown = reason => ({ status: 'UNKNOWN', reason, global: [], camps: [], professions: [], effects: [] });

function addScoped(groups, id, attribute) {
  if (!groups.has(id)) groups.set(id, new Map());
  const rows = groups.get(id);
  if (rows.has(attribute.attr)) return false;
  rows.set(attribute.attr, attribute);
  return true;
}

const groupRows = groups => Array.from(groups, ([id, values]) => ({ id, attributes: Array.from(values.values()) }));

// The v76 summary button reads only this response. Optional protobuf defaults
// do not attest a row's attribute ID or value; both must be present on the wire.
export function parseAntiqueSummary(response, { protocol } = {}) {
  if (!recordOf(response, ['items', 'effects'])
      || !Array.isArray(own(response, 'items')) || !Array.isArray(own(response, 'effects'))) return unknown('INVALID_RESPONSE');

  const global = new Map(), camps = new Map(), professions = new Map(), effects = new Map();
  for (const row of response.items) {
    if (!recordOf(row, ['heroCamp', 'heroProf', 'attrValue'])
        || !absentOrScopeId(row, 'heroCamp') || !absentOrScopeId(row, 'heroProf')) return unknown('INVALID_RESPONSE');
    const attrValue = own(row, 'attrValue');
    if (!recordOf(attrValue, ['attr', 'value', 'rating'])) return unknown('INVALID_RESPONSE');
    const attr = own(attrValue, 'attr'), value = own(attrValue, 'value');
    if (!int32(attr) || attr < 0 || !Number.isFinite(value)
        || (Object.hasOwn(attrValue, 'rating') && !int32(attrValue.rating))) return unknown('INVALID_RESPONSE');

    const camp = own(row, 'heroCamp'), profession = own(row, 'heroProf');
    if (camp && profession) return unknown('UNSUPPORTED_ATTRIBUTE_SCOPE');
    const name = protocol?.EnhanceAttr?.[attr];
    const attribute = { attr, value, attrKey: exactText(name) ? name : null };
    const added = camp ? addScoped(camps, camp, attribute) : profession ? addScoped(professions, profession, attribute) : addScoped(global, '', attribute);
    if (!added) return unknown('DUPLICATE_ATTRIBUTE');
  }

  for (const row of response.effects) {
    if (!recordOf(row, ['effectId', 'value'])) return unknown('INVALID_RESPONSE');
    const effectId = own(row, 'effectId'), value = own(row, 'value');
    if (!exactText(effectId) || !Number.isFinite(value)) return unknown('INVALID_RESPONSE');
    if (effects.has(effectId)) return unknown('DUPLICATE_EFFECT');
    effects.set(effectId, { effectId, value });
  }

  return {
    status: 'AVAILABLE', reason: null, global: groupRows(global)[0]?.attributes ?? [],
    camps: groupRows(camps), professions: groupRows(professions),
    effects: Array.from(effects.values()),
  };
}

export async function surveyAntiqueSummary(client, protocol, { signal, timeout = 8000 } = {}) {
  assertExecutionActive(client, { signal });
  if (!protocol?.[ANTIQUE_SUMMARY_REQUEST] || !protocol?.[ANTIQUE_SUMMARY_RESPONSE]) return unknown('PROTOCOL_UNAVAILABLE');
  let response;
  try {
    response = await awaitExecution(
      client.request(ANTIQUE_SUMMARY_REQUEST, {}, ANTIQUE_SUMMARY_RESPONSE, timeout, { signal }),
      client, { signal },
    );
  } catch (error) {
    if (executionOutcome(error) === 'CANCELLED') throw error;
    return unknown('READ_FAILED');
  }
  return parseAntiqueSummary(response, { protocol });
}

function configRows(config, table, key) {
  const index = new Map(), rows = config?.tables?.[table]?.data;
  if (!Array.isArray(rows)) return index;
  for (const row of rows) {
    if (!exactText(row?.[key])) continue;
    const id = row[key];
    index.set(id, index.has(id) ? null : row);
  }
  return index;
}

const textOrNull = value => exactText(value) ? value : null;

// Config describes labels and units only. It never fills or converts server
// amounts, and absence of display metadata does not erase typed attributes.
export function antiqueSummaryView(facts, { config } = {}) {
  if (facts?.status !== 'AVAILABLE') return unknown(facts?.reason ?? 'NOT_SURVEYED');
  const attrs = configRows(config, 'AdditionAttrOverviewCfg', 'enhanceAttr');
  const factions = configRows(config, 'HeroFactionCfg', 'faction');
  const careers = configRows(config, 'HeroCareerCfg', 'career');
  const effects = configRows(config, 'AntiqueEffectLibCfg', 'effectId');
  const attributes = rows => rows.map(({ attr, value, attrKey }) => {
    const meta = attrs.get(attrKey);
    return { attr, value, name: textOrNull(meta?.name), viewType: textOrNull(meta?.type) };
  });
  const scopes = (groups, metadata) => groups.map(({ id, attributes: rows }) => ({
    id, name: textOrNull(metadata.get(id)?.showName), attributes: attributes(rows),
  }));
  return {
    status: 'AVAILABLE', reason: null, global: attributes(facts.global),
    camps: scopes(facts.camps, factions), professions: scopes(facts.professions, careers),
    effects: facts.effects.map(({ effectId, value }) => {
      const meta = effects.get(effectId);
      return { effectId, value, description: textOrNull(meta?.desc), viewType: textOrNull(meta?.viewType) };
    }),
  };
}
