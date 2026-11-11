// City integration: existing survey/planner/executor with target-bound selections.
// The server owns authorization, the account lock, and durable execution history.
import { toSnapshotJson } from './game.mjs';
import { surveyWorld, planWorld, runWorld, upgradeRow } from './world.mjs';
import { ResourceLedger, resourceCosts, safeResourceQuantity } from './resource-ledger.mjs';
import { assertExecutionActive, executionOutcome, operationResult } from './execution.mjs';
import { selectProductionCandidates } from './production-policy.mjs';

const rows = (config, name) => config?.tables?.[name]?.data ?? [];
const quantity = (value) => safeResourceQuantity(value) !== null;
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const copy = (value) => JSON.parse(JSON.stringify(value));
const stable = (value) => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);
const costsOf = (value) => { try { return resourceCosts(value); } catch { return null; } };
const assetsReliable = (value) => Array.isArray(value) && value.every((a) => text(a?.id) && quantity(a.num));
const queueReliable = (value) => Array.isArray(value) && value.every((q) => quantity(q?.idx)
  && text(q.productId) && quantity(q.finishTime)) && new Set(value.map((q) => Number(q.idx))).size === value.length;

// Capture raw completeness before the existing survey applies display defaults.
export function decorateCitySurvey(survey, capturedResponses) {
  const raw = capturedResponses instanceof Map ? capturedResponses.get('OnWaterRequest') : capturedResponses?.OnWaterRequest;
  const byBuilding = Object.create(null);
  const buildings = Array.isArray(raw?.building) && raw.building.every((b) => text(b?.buildingId))
    && new Set(raw.building.map((b) => b.buildingId)).size === raw.building.length;
  for (const b of buildings ? raw.building : []) {
    const factory = b.factory;
    byBuilding[b.buildingId] = {
      base: quantity(b.level) && quantity(b.buildStartTime) && quantity(b.buildFinishTime),
      product: assetsReliable(b.product?.asset),
      factory: !!factory && typeof factory === 'object' && typeof factory.autoProductId === 'string',
      queue: !!factory && queueReliable(factory.factoryQ),
      finishedProducts: !!factory && assetsReliable(factory.finishedProducts),
    };
  }
  const captured = name => capturedResponses instanceof Map ? capturedResponses.get(name) : capturedResponses?.[name];
  return { ...survey, rawOnWater: toSnapshotJson(raw ?? null), rawAllItem: toSnapshotJson(captured('AllItemRequest') ?? null), rawAllResource: toSnapshotJson(captured('AllResourceRequest') ?? null), cityReliability: { buildings, byBuilding } };
}

export async function surveyCityOperations(client, protocol, options = {}) {
  const captured = new Map();
  const observed = new Proxy(client, { get(target, key) {
    if (key !== 'request') { const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value; }
    return async (...args) => { const value = await target.request(...args); captured.set(args[0], value); return value; };
  } });
  return decorateCitySurvey(await surveyWorld(observed, protocol, options), captured);
}

function stateOf(building) {
  return {
    buildingId: building.buildingId, type: building.type, level: building.level,
    buildStartTime: building.buildStartTime, buildFinishTime: building.buildFinishTime,
    product: copy(building.product ?? []),
    factory: building.factory ? {
      autoProductId: building.factory.autoProductId,
      factoryQ: copy(building.factory.factoryQ ?? []), finishedProducts: copy(building.factory.finishedProducts ?? []),
    } : null,
  };
}

function isReliable(survey, building, kind) {
  const info = survey.cityReliability?.byBuilding?.[building.buildingId];
  if (!survey.cityReliability?.buildings || !info?.base || !building.type) return false;
  if (kind === 'collectProduct') return !building.factory && info.product;
  if (['gainFactory', 'startProduce', 'speedUpProduce'].includes(kind)) return info.factory && info.queue && info.finishedProducts;
  return true;
}

function actionId(kind, buildingId, detail = '') {
  return `city:${kind}:${encodeURIComponent(buildingId)}${detail === '' ? '' : `:${encodeURIComponent(detail)}`}`;
}

function expected(kind, building, recipe, index) {
  if (kind === 'upgrade' || kind === 'build') return { levelAtLeast: building.level + 1, orConstructionStarted: true };
  if (kind === 'finishUpgrade') return { levelAtLeast: building.level + 1, buildFinishTime: 0 };
  if (kind === 'collectProduct' || kind === 'gainFactory') return { collected: true, inventoryIncreased: true };
  if (kind === 'startProduce') return { productId: recipe.itemId, queuedOrFinished: true };
  return { ...(index === undefined ? {} : { index }), finishTimeReduced: true };
}

// Derive requests only through planWorld; isolate unrelated tentative reservations.
function plannedAction(survey, config, building, kind, { productId, index } = {}, ledger) {
  const targeted = { ...building };
  if (kind === 'speedUpProduce') {
    targeted.buildFinishTime = 0;
    targeted.factory = { ...building.factory, factoryQ: building.factory.factoryQ.filter((q) => q.idx === index) };
  }
  const factories = ['gainFactory', 'startProduce', 'speedUpProduce'].includes(kind) ? [targeted] : [];
  const selectedConfig = { ...config, tables: { ...config?.tables,
    BuildingProduceCfg: { data: kind === 'startProduce' ? rows(config, 'BuildingProduceCfg').filter((r) => r.itemId === productId) : [] },
  } };
  const local = { ...survey, buildings: [targeted], factories, orders: [] };
  return planWorld(local, {
    config: selectedConfig, ledger: new ResourceLedger(ledger.inventory([productId].filter(Boolean))),
    maxBuilds: kind === 'build' ? 1 : 0, maxUpgrades: kind === 'upgrade' ? 1 : 0,
    allowSpeedUp: kind === 'speedUpUpgrade' || kind === 'speedUpProduce',
  }).actions.find((action) => action.kind === kind && (kind !== 'speedUpProduce' || action.body.index === index));
}

function candidatesFor(survey, config, ledger) {
  const candidates = [];
  for (const building of survey.buildings ?? []) {
    const choices = [
      ['build', {}], ['upgrade', {}], ['finishUpgrade', {}], ['collectProduct', {}], ['gainFactory', {}], ['speedUpUpgrade', {}],
      ...rows(config, 'BuildingProduceCfg').filter((r) => r.buildType === building.type).map((r) => ['startProduce', { productId: r.itemId }]),
      ...(building.factory?.factoryQ ?? []).map((q) => ['speedUpProduce', { index: q.idx }]),
    ];
    for (const [kind, detail] of choices) {
      if (!isReliable(survey, building, kind)) continue;
      if (['gainFactory', 'collectProduct'].includes(kind) && survey.stockReliable !== true) continue;
      const action = plannedAction(survey, config, building, kind, detail, ledger);
      if (!action) continue;
      const costs = costsOf(action.costs ?? []);
      if (costs === null || !ledger.canReserve(costs)) continue;
      const beforeState = stateOf(building);
      const recipe = rows(config, 'BuildingProduceCfg').find((r) => r.itemId === detail.productId && r.buildType === building.type);
      const target = { buildingId: building.buildingId, ...detail };
      candidates.push({
        actionId: actionId(kind, building.buildingId, detail.productId ?? detail.index ?? ''),
        actionType: kind, target, costs, beforeState, identity: stable(beforeState),
        action: { ...action, costs }, label: action.label, expectedState: expected(kind, building, recipe, detail.index),
      });
    }
  }
  return candidates;
}

function statusOf(building, now) {
  return building.buildFinishTime > now ? 'BUILDING' : building.buildFinishTime > 0 ? 'READY_TO_FINISH'
    : building.level === 0 ? 'UNBUILT' : 'READY';
}

export function cityView(survey, { config = null } = {}) {
  const ledger = new ResourceLedger(survey.stockReliable === true ? survey.stock : null);
  const candidates = candidatesFor(survey, config, ledger), notes = [...(survey.notes ?? [])];
  const operations = (buildingId) => candidates.filter((c) => c.target.buildingId === buildingId).map((c) => c.actionId);
  const buildings = (survey.buildings ?? []).map((b) => {
    const next = upgradeRow(config, b.type, b.level + 1);
    const reliable = isReliable(survey, b, b.level === 0 ? 'build' : 'upgrade');
    if (!reliable) notes.push(`${b.buildingId} 的建筑状态不完整，不生成写操作`);
    return {
      buildingId: b.buildingId, type: b.type, level: b.level, status: reliable ? statusOf(b, survey.now) : 'UNKNOWN',
      upgradeConditions: next ? { playerLevel: next.playerLevel ?? null, population: next.curPeople ?? null, conditions: next.condition ?? [] } : null,
      materialCosts: next ? costsOf(next.consume) : null, expectedState: next ? { level: b.level + 1, costTime: next.costTime ?? null } : null,
      allowedOperations: operations(b.buildingId), reliable,
    };
  });
  const slotsRow = [...rows(config, 'GameParamCfg'), ...rows(config, 'BuildingProduceParamCfg')].find((row) => row.paramName === '制造位上限');
  const configuredSlots = safeResourceQuantity(slotsRow?.paramValue);
  const slotCapacity = configuredSlots !== null && configuredSlots === safeResourceQuantity(survey.factorySlots) ? configuredSlots : null;
  const factories = (survey.factories ?? []).map((b) => {
    const reliable = isReliable(survey, b, 'startProduce');
    if (!reliable) notes.push(`${b.buildingId} 的生产队列或产出状态不完整，不生成生产写操作`);
    return {
      buildingId: b.buildingId, type: b.type, level: b.level,
      status: !reliable ? 'UNKNOWN' : b.factory.autoProductId ? 'AUTO' : b.factory.factoryQ.length ? 'PRODUCING' : 'IDLE',
      queue: (b.factory.factoryQ ?? []).map((q) => ({ ...q, remainingSeconds: Math.max(0, q.finishTime - survey.now) })),
      finishedProducts: copy(b.factory.finishedProducts ?? []), autoProductId: b.factory.autoProductId ?? null,
      slotCapacity, freeSlots: reliable && slotCapacity !== null ? Math.max(0, slotCapacity - b.factory.factoryQ.length) : null,
      recipes: rows(config, 'BuildingProduceCfg').filter((r) => r.buildType === b.type)
        .map((r) => ({ productId: r.itemId, unlockLevel: r.unlockLevel, produceTime: r.produceTime, costs: costsOf(r.costItem) })),
      allowedOperations: operations(b.buildingId), reliable,
    };
  });
  if (survey.stockReliable !== true) notes.push('库存来源不完整，不能规划资源消耗或收取验证');
  return { buildings, factories, stock: [...(survey.stock ?? [])].map(([id, num]) => ({ id, num })), candidates, notes };
}

export function planCityOperations(survey, { config = null, selections = [],
  ledger = new ResourceLedger(survey.stockReliable === true ? survey.stock : null) } = {}) {
  if (!Array.isArray(selections) || selections.some((id) => typeof id !== 'string')) throw new Error('城市选择必须是候选 actionId 数组');
  if (new Set(selections).size !== selections.length) throw new Error('城市操作不可重复选择');
  const view = cityView(survey, { config }), known = new Map(view.candidates.map((c) => [c.actionId, c]));
  if (selections.some((id) => !known.has(id))) throw new Error('城市操作已过期或不在候选列表');
  const targets = selections.map((id) => known.get(id).target.buildingId);
  if (new Set(targets).size !== targets.length) throw new Error('同一建筑每批仅允许一个操作，请验证后重新规划');
  const before = new Map(ledger.reserved), actions = [], notes = [...view.notes];
  for (const id of selections) {
    const candidate = candidatesFor(survey, config, ledger).find((c) => c.actionId === id);
    if (!candidate || !ledger.reserve(candidate.costs)) { notes.push(`${known.get(id).label} 共享预算不足，保留待处理`); continue; }
    actions.push(candidate);
  }
  return { module: 'city', actions, reserved: [...ledger.reserved].map(([id, num]) => [id, num - (before.get(id) ?? 0)]).filter(([, num]) => num > 0), notes, view };
}

function assetTotals(list) {
  const totals = new Map();
  for (const a of list) totals.set(a.id, (totals.get(a.id) ?? 0) + a.num);
  return totals;
}

function verified(operation, before, after, beforeSurvey, afterSurvey) {
  const kind = operation.actionType;
  if (!after || after.type !== before.type || after.buildingId !== before.buildingId) return false;
  if (kind === 'build' || kind === 'upgrade') return after.level > before.level
    || after.level === before.level && after.buildStartTime >= beforeSurvey.now
      && after.buildFinishTime > before.buildFinishTime && after.buildFinishTime > afterSurvey.now;
  if (kind === 'finishUpgrade') return after.level > before.level && after.buildFinishTime === 0;
  if (kind === 'speedUpUpgrade') return after.level > before.level
    || after.buildFinishTime < before.buildFinishTime && after.buildFinishTime > 0;
  if (kind === 'startProduce') {
    const productId = operation.target.productId;
    const oldQueue = new Set(before.factory.factoryQ.map((q) => `${q.idx}:${q.productId}:${q.finishTime}`));
    return after.factory.factoryQ.some((q) => q.productId === productId && !oldQueue.has(`${q.idx}:${q.productId}:${q.finishTime}`))
      || (assetTotals(after.factory.finishedProducts).get(productId) ?? 0) > (assetTotals(before.factory.finishedProducts).get(productId) ?? 0);
  }
  if (kind === 'speedUpProduce') {
    const previous = before.factory.factoryQ.find((q) => q.idx === operation.target.index);
    const current = after.factory.factoryQ.find((q) => q.idx === operation.target.index && q.productId === previous.productId);
    return !!current && current.finishTime < previous.finishTime
      || !current && (assetTotals(after.factory.finishedProducts).get(previous.productId) ?? 0) > (assetTotals(before.factory.finishedProducts).get(previous.productId) ?? 0);
  }
  if (kind === 'gainFactory' || kind === 'collectProduct') {
    if (beforeSurvey.stockReliable !== true || afterSurvey.stockReliable !== true) return false;
    const oldAssets = assetTotals(kind === 'gainFactory' ? before.factory.finishedProducts : before.product);
    const newAssets = assetTotals(kind === 'gainFactory' ? after.factory.finishedProducts : after.product);
    return oldAssets.size > 0 && [...oldAssets].every(([id, num]) => num > 0 && (newAssets.get(id) ?? 0) < num
      && quantity(beforeSurvey.have(id)) && quantity(afterSurvey.have(id)) && afterSurvey.have(id) > beforeSurvey.have(id));
  }
  return false;
}

export async function executeCityAction(client, protocol, planned, {
  config = null, player = null, allowMutate = false, budget = { ledger: null }, signal, stop,
  assertCurrent = () => {}, onStage = () => {}, timeout = 15000, window = 400,
  survey = surveyCityOperations, mode = 'Manual', productionPolicy,
} = {}) {
  const detail = { actionId: planned?.actionId, actionType: planned?.actionType, target: planned?.target,
    beforeState: planned?.beforeState, resourceReservation: [], requestStatus: 'NOT_EXECUTED', afterState: null, verification: { status: 'NOT_STARTED' } };
  let dispatched = false, sentAction = null;
  const finish = (status, extra = {}) => {
    if (dispatched && !['SUCCESS', 'REJECTED', 'RATE_LIMITED', 'UNKNOWN'].includes(status)) status = 'UNKNOWN';
    if (dispatched && status !== 'SUCCESS' && status !== 'REJECTED') {
      detail.verification = { status: 'UNCONFIRMED', reason: extra.error ?? '已发送操作尚未通过权威复读确认' };
      client.markUnverifiedWrite?.(sentAction.request, sentAction.body);
    }
    return operationResult(status, { ...detail, ...extra, sent: dispatched, dispatched, unresolvedWrite: dispatched && ['UNKNOWN', 'RATE_LIMITED'].includes(status), result: status, timestamp: new Date().toISOString() });
  };
  const active = () => { assertExecutionActive(client, { signal, stop }); assertCurrent(); };
  // Guard the existing survey's reads as well as runWorld's writes.
  const guarded = new Proxy(client, { get(target, key) {
    if (!['request', 'sendWatch'].includes(key)) { const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value; }
    return (...args) => { active(); if (key === 'sendWatch' || args[4]?.mutate) dispatched = true; return target[key](...args); };
  } });
  try {
    active();
    if (!allowMutate) return finish('NOT_EXECUTED', { error: '城市写操作需要明确授权' });
    onStage('SURVEY');
    const beforeSurvey = await survey(guarded, protocol, { config, player, signal, stop, timeout });
    active();
    const currentView = cityView(beforeSurvey, { config });
    const candidate = currentView.candidates.find((c) => c.actionId === planned?.actionId);
    if (!candidate || candidate.identity !== planned.identity || stable(candidate.costs) !== stable(planned.costs)
      || stable(candidate.target) !== stable(planned.target) || candidate.actionType !== planned.actionType
      || stable(candidate.action) !== stable(planned.action)) return finish('NOT_EXECUTED', { error: '城市计划的目标、状态或成本已改变，请重新规划' });
    if (mode === 'Automatic' && candidate.actionType === 'startProduce'
      && !selectProductionCandidates(beforeSurvey, { policy: productionPolicy, candidates: currentView.candidates }).includes(candidate.actionId)) {
      return finish('NOT_EXECUTED', { error: '当前生产需求或队列已变化，操作已超出自动生产策略范围' });
    }
    detail.beforeState = candidate.beforeState;
    const output = candidate.actionType === 'gainFactory' ? candidate.beforeState.factory.finishedProducts
      : candidate.actionType === 'collectProduct' ? candidate.beforeState.product : [];
    const evidenceIds = new Set([...beforeSurvey.stock.keys(), ...output.map((a) => a.id)]);
    detail.beforeInventory = [...evidenceIds].map((id) => ({ id, num: beforeSurvey.have(id) }));
    detail.beforeInventoryReliable = beforeSurvey.stockReliable === true;
    onStage('RESOURCE_PREFLIGHT'); active();
    onStage('EXECUTING');
    sentAction = candidate.action;
    const reservationBefore = new Map(budget.ledger?.reserved ?? []);
    const run = await runWorld(guarded, protocol, { actions: [candidate.action] }, { allowMutate: true, budget, signal, stop, timeout, window });
    const request = run.results[0];
    detail.requestStatus = request?.status ?? 'UNKNOWN';
    detail.resourceReservation = [...(budget.ledger?.reserved ?? [])].map(([id, num]) => ({ id, num: num - (reservationBefore.get(id) ?? 0) })).filter(({ num }) => num > 0);
    // Only a quiet completed watch can be verified here. Transport/association
    // failures, cancellation and rate limits stop without speculative reads.
    if (request?.status !== 'SUCCESS' && !(request?.status === 'UNKNOWN' && request.sent && !request.error)) return finish(request?.status ?? 'UNKNOWN', { error: request?.error });
    if (run.results.some((r) => r.status === 'CANCELLED')) return finish('CANCELLED', { error: '执行已取消，已发送操作待复核' });
    active(); onStage('VERIFY');
    const afterSurvey = await survey(guarded, protocol, { config, player, signal, stop, timeout });
    active();
    const after = afterSurvey.buildings.find((b) => b.buildingId === candidate.target.buildingId);
    if (after) detail.afterState = stateOf(after);
    detail.afterInventory = [...evidenceIds].map((id) => ({ id, num: afterSurvey.have(id) }));
    detail.afterInventoryReliable = afterSurvey.stockReliable === true;
    if (!after || !isReliable(afterSurvey, after, candidate.actionType)
      || !verified(candidate, candidate.beforeState, detail.afterState, beforeSurvey, afterSurvey)) return finish('UNKNOWN', { error: '权威复读尚未确认预期状态变化，保留预算及未决指纹' });
    active(); client.confirmWatchedWrite?.(candidate.action.request, candidate.action.body);
    detail.verification = { status: 'CONFIRMED', reason: '权威复读确认预期城市状态变化' };
    if (['gainFactory', 'collectProduct'].includes(candidate.actionType)) {
      const remaining = assetTotals(candidate.actionType === 'gainFactory' ? detail.afterState.factory.finishedProducts : detail.afterState.product);
      detail.collectedProducts = [...assetTotals(output)].map(([id, num]) => ({ id, num: num - (remaining.get(id) ?? 0) }))
        .filter(({ id, num }) => Number.isSafeInteger(num) && num > 0 && afterSurvey.have(id) - beforeSurvey.have(id) === num);
    }
    return finish('SUCCESS');
  } catch (error) {
    const outcome = executionOutcome(error);
    if (dispatched && detail.requestStatus === 'NOT_EXECUTED') detail.requestStatus = 'UNKNOWN';
    return finish(outcome === 'UNKNOWN' && !dispatched ? 'NOT_EXECUTED' : outcome, { error: error.message });
  }
}