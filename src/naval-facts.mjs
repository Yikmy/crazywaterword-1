// Shared read-only fleet/resource facts and conservative selection; no transport executor.
import { ResourceLedger, safeResourceQuantity, stockFromResponses } from './resource-ledger.mjs';
import { validateModuleConfig } from './gameplay-settings.mjs';
import { assertExecutionActive, awaitExecution } from './execution.mjs';

export const quantity = safeResourceQuantity;
export const factQuantity = (object, key) => object && Object.hasOwn(object, key) ? quantity(object[key]) : null;
export const rowsOf = (config, name) => Array.isArray(config?.tables?.[name]?.data) ? config.tables[name].data : [];
export const nonempty = value => typeof value === 'string' && value.trim().length > 0;
export const stable = value => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export function invalid(message = '业务参数无效') { return Object.assign(new Error(message), { code: 'INVALID_INPUT', statusCode: 400 }); }
export function strictParameters(value = {}, allowed = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.keys(value).some(key => !allowed.includes(key))) throw invalid('请求包含不支持的业务参数');
  return value;
}
// One query contract for the existing WorldInfo consumers. This is a viewport,
// never an assertion of whole-map completeness or authority to dispatch.
export function worldObservationQuery(screenCenter) {
 if(screenCenter===undefined)return {screenCenter:{x:0,y:0}};
 strictParameters(screenCenter,['x','y']);
 if(Reflect.ownKeys(screenCenter).length!==2||!['x','y'].every(key=>{const d=Object.getOwnPropertyDescriptor(screenCenter,key);return d?.enumerable&&Object.hasOwn(d,'value')&&Number.isSafeInteger(d.value)&&Math.abs(d.value)<=2147483647;}))throw invalid('观察中心必须为明确自有int32坐标');
 return {screenCenter:{x:screenCenter.x,y:screenCenter.y}};
}
export function moduleConfiguration(value, defaults) {
  strictParameters(value, Object.keys(defaults));
  try { return validateModuleConfig(value, defaults); } catch (error) { throw invalid(error.message); }
}
export function stringIds(value, { optional = true } = {}) {
  if (value === undefined && optional) return null;
  if (!Array.isArray(value) || !value.length || value.some(id => !nonempty(id)) || new Set(value).size !== value.length) throw invalid('舰队 ID 必须是非空且不重复的精确字符串');
  return [...value];
}
export function configuredCost(config, name) {
  const matches = rowsOf(config, 'WorldParamCfg').filter(row => row.paramName === name);
  if (matches.length !== 1) return null;
  return quantity(matches[0].paramValue);
}
export async function readNavalFact(client, protocol, request, body = {}, { signal, timeout = 10000 } = {}) {
  assertExecutionActive(client, { signal });
  const response = request.slice(0, -7) + 'Response';
  if (!protocol?.[request] || !protocol?.[response]) return { available: false, reason: 'PROTOCOL_UNAVAILABLE', body: null };
  try {
    const value = await awaitExecution(client.request(request, body, response, timeout, { signal }), client, { signal });
    assertExecutionActive(client, { signal });
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { available: false, reason: 'INVALID_RESPONSE', body: null };
    return { available: true, body: value };
  } catch (error) {
    if (error?.code === 'CANCELLED' || error?.name === 'AbortError') throw error;
    return { available: false, reason: 'QUERY_FAILED', body: null };
  }
}
export function stockFacts(items, resources) {
  const reliable = items?.available === true && resources?.available === true && Array.isArray(items.body?.items) && Array.isArray(resources.body?.list)
    && items.body.items.every(row => nonempty(row?.itemId ?? row?.id) && quantity(row.num ?? row.count) !== null)
    && resources.body.list.every(row => Number.isSafeInteger(row?.res) && row.res > 0 && quantity(row.amount) !== null);
  return { stock: reliable ? stockFromResponses(items.body, resources.body) : new Map(), stockReliable: reliable };
}
export function fleetFacts(source) {
  const raw = source?.body?.fleets;
  const reliable = source?.available === true && Array.isArray(raw) && raw.every(fleet => nonempty(fleet?.buildingId)) && new Set(raw.map(fleet => fleet.buildingId)).size === raw.length;
  const fleets = reliable ? raw.map(fleet => ({
    buildingId: fleet.buildingId, state: factQuantity(fleet, 'state'), durability: factQuantity(fleet, 'durability'), maxDura: factQuantity(fleet, 'maxDura'),
    cityId: factQuantity(fleet, 'cityId'), targetCityId: factQuantity(fleet, 'targetCityId'), moveStartTs: factQuantity(fleet, 'moveStartTs'), moveEndTs: factQuantity(fleet, 'moveEndTs'),
    treasureLootUid: factQuantity(fleet, 'treasureLootUid'),
    owner: fleet.owner ? structuredClone(fleet.owner) : null,
    autoFight: fleet.autoFight && Object.hasOwn(fleet.autoFight, 'isOn') && typeof fleet.autoFight.isOn === 'boolean' ? { isOn: fleet.autoFight.isOn, todayTimes: quantity(fleet.autoFight.todayTimes) } : null,
    repairing: fleet.repairing ? { startTs: quantity(fleet.repairing.startTs), endTs: quantity(fleet.repairing.endTs), endDura: quantity(fleet.repairing.endDura) } : null,
  })) : [];
  return { fleets, fleetReliable: reliable };
}
// Exact complete inventory delta; callers retain their original authoritative parsers.
export function stockMatchesDelta(before, after, costs, rewards) {
  if (!(before instanceof Map) || !(after instanceof Map) || !Array.isArray(costs) || !Array.isArray(rewards)) return false;
  const delta = new Map();
  for (const [rows, sign] of [[costs, -1], [rewards, 1]]) for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !row.id.trim() || !Number.isSafeInteger(row.num) || row.num < 0) return false;
    const next = (delta.get(row.id) ?? 0) + sign * row.num;
    if (!Number.isSafeInteger(next)) return false;
    delta.set(row.id, next);
  }
  return [...new Set([...before.keys(), ...after.keys(), ...delta.keys()])].every(id => {
    const old = quantity(before.has(id) ? before.get(id) : 0), current = quantity(after.has(id) ? after.get(id) : 0);
    const expected = old + (delta.get(id) ?? 0);
    return nonempty(id) && old !== null && current !== null && Number.isSafeInteger(expected) && expected >= 0 && current === expected;
  });
}

export function selectedActions(candidates, selections = [], ledger = new ResourceLedger(null), petrolReserve = 0) {
  if (!Array.isArray(selections)) throw invalid('必须提供明确的业务选择数组');
  const ids = selections.map(selection => {
    if (typeof selection === 'string') return selection;
    strictParameters(selection, ['actionId']);
    if (!nonempty(selection.actionId)) throw invalid('缺少操作 ID');
    return selection.actionId;
  });
  if (new Set(ids).size !== ids.length) throw invalid('操作 ID 不得重复');
  const byId = new Map(candidates.map(candidate => [candidate.actionId, candidate]));
  const actions = [], notes = [], used = new Set();
  for (const id of ids) {
    const operation = byId.get(id);
    if (!operation) throw invalid('操作选择不在当前权威事实中');
    if (operation.decision !== 'READY' || !operation.action) { notes.push(operation.reason ?? '操作尚未验证'); continue; }
    const fleetIds = operation.target?.fleetBuildingIds ?? (operation.target?.buildingId ? [operation.target.buildingId] : []);
    if (fleetIds.some(fleet => used.has(fleet))) { notes.push('同一批次的舰队已被其他动作预占'); continue; }
    const fuel = operation.costs.find(cost => cost.id === '汽油')?.num ?? 0;
    if (fuel > 0 && (ledger.available('汽油') === null || ledger.available('汽油') < fuel + petrolReserve)) { notes.push('共享汽油预算不足以保留安全余量'); continue; }
    if (!ledger.reserve(operation.costs)) { notes.push('共享资源预算不足或不可靠'); continue; }
    fleetIds.forEach(fleet => used.add(fleet)); actions.push(operation);
  }
  return { actions, notes };
}
