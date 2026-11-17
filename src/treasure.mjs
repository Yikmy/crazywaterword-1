import { createHash } from 'node:crypto';
import { businessRejectionIdentityFromHistory } from './business-functions.mjs';
// World treasure integration, adapted from the reference survey/view/plan functions.
// No transport executor, no inferred victory and no short-window success assumption.
import { ResourceLedger } from './resource-ledger.mjs';
import { parseOperationInventory } from './hero-operations.mjs';
import { toSnapshotJson } from './game.mjs';
import { strictParameters, stringIds, invalid, readNavalFact, fleetFacts, configuredCost, rowsOf, quantity, factQuantity, stable, selectedActions, stockMatchesDelta, moduleConfiguration } from './naval-facts.mjs';
import { readGameTime, gameTimeBounds } from './state-facts.mjs';

export const TREASURE_DEFAULT_CONFIG = Object.freeze({ enabled: false, dispatch: false, colors: [5], maxFleets: 1, minimumDurabilityRatio: 0.8, petrolReserve: 0 });
function parametersOf(parameters = {}) {
  strictParameters(parameters, ['uid', 'fleetBuildingIds', 'expectedDispatch']);
  if (parameters.uid !== undefined && (!Number.isSafeInteger(parameters.uid) || parameters.uid <= 0 || parameters.uid > 2147483647)) throw invalid('宝藏 UID 必须是明确的正 int32');
  stringIds(parameters.fleetBuildingIds);
  if(parameters.expectedDispatch!==undefined){validateDispatchExpectation(parameters.expectedDispatch);if(!parameters.uid||!parameters.fleetBuildingIds||parameters.expectedDispatch.fleetHashes.length!==parameters.fleetBuildingIds.length)throw invalid('派遣守卫须绑定明确目标及逐舰摘要');}
  return parameters;
}
export function validateTreasureConfig(value = {}) {
  const result = moduleConfiguration(value, TREASURE_DEFAULT_CONFIG);
  if (!Array.isArray(result.colors) || !result.colors.length || result.colors.some(color => ![3, 4, 5].includes(color)) || new Set(result.colors).size !== result.colors.length
    || !Number.isSafeInteger(result.maxFleets) || result.maxFleets < 1 || result.maxFleets > 10 || !Number.isFinite(result.minimumDurabilityRatio) || result.minimumDurabilityRatio <= 0 || result.minimumDurabilityRatio > 1 || quantity(result.petrolReserve) === null) throw invalid('寻宝规则无效');
  return result;
}
export async function surveyTreasure(client, protocol, { config = null, player = null, signal, parameters = {}, moduleConfig = {} } = {}) {
  parametersOf(parameters); validateTreasureConfig(moduleConfig);
  const names = ['TreasureLootStatsRequest', 'TreasureLootListRequest', 'MyFleetsRequest', 'SeasonRankInfoRequest', 'AllItemRequest', 'AllResourceRequest'];
  const values = await Promise.all(names.map(request => readNavalFact(client, protocol, request, {}, { signal })));
  const sources = Object.fromEntries(names.map((name, index) => [name, values[index]]));
  const list = sources.TreasureLootListRequest.body?.treasure;
  const treasureReliable = sources.TreasureLootListRequest.available && Array.isArray(list) && list.every(row => factQuantity(row, 'uid') !== null && row.uid > 0) && new Set(list.map(row => row.uid)).size === list.length;
  const treasures = treasureReliable ? list.map(row => ({ uid: factQuantity(row, 'uid'), color: factQuantity(row, 'color'), ownerGuildIdx: factQuantity(row, 'ownerGuildIdx'), ownerFleetNum: factQuantity(row, 'ownerFleetNum'), progress: Object.hasOwn(row, 'progress') && Number.isFinite(row.progress) && row.progress >= 0 && row.progress <= 100 ? row.progress : null, gridIdx: factQuantity(row, 'gridIdx') })) : [];
  const targetDetails = parameters.uid === undefined ? null : await surveyTreasureDetails(client,protocol,parameters.uid,{signal,sources});
  const stats = sources.TreasureLootStatsRequest;
  const season = sources.SeasonRankInfoRequest;
  return { ...readGameTime(client), config, player: structuredClone(player), parameters: structuredClone(parameters), sources,
    targetDetails, ...parseOperationInventory(sources.AllItemRequest.body, sources.AllResourceRequest.body), ...fleetFacts(sources.MyFleetsRequest), treasureReliable, treasures,
    statsReliable: stats.available && factQuantity(stats.body, 'todayRewardTimes') !== null && factQuantity(stats.body, 'totalRewardTimes') !== null && stats.body.totalRewardTimes > 0,
    todayRewardTimes: quantity(stats.body?.todayRewardTimes), totalRewardTimes: factQuantity(stats.body, 'totalRewardTimes'),
    season: { startTime: factQuantity(season.body, 'startTime'), endTime: factQuantity(season.body, 'endTime'), reliable: season.available },
    protocolReady: Boolean(protocol?.TreasureLootSendFleetsRequest),
  };
}
async function surveyTreasureDetails(client,protocol,uid,{signal,sources={}}={}) {
  const [rank,defence]=await Promise.all(['TreasureLootRankRequest','TreasureLootDefenceRequest'].map(request=>readNavalFact(client,protocol,request,{uid},{signal})));
  sources.TreasureLootRankRequest=rank;sources.TreasureLootDefenceRequest=defence;
  const rankReliable=rank.available&&Array.isArray(rank.body?.items),defenceReliable=defence.available&&Array.isArray(defence.body?.fleets);
  return {uid,rankReliable,defenceReliable,rank:rankReliable?toSnapshotJson(rank.body.items):[],defence:defenceReliable?toSnapshotJson(defence.body.fleets):[]};
}
const dispatchHash=value=>createHash('sha256').update(stable(value)).digest('hex');
const exactFields=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{const d=Object.getOwnPropertyDescriptor(value,key);return d&&Object.hasOwn(d,'value')&&d.enumerable;});
const dense=value=>Array.isArray(value)&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));return d&&Object.hasOwn(d,'value')&&d.enumerable;}).every(Boolean);
function validateDispatchExpectation(value){
 if(!exactFields(value,['targetHash','fleetHashes'])||typeof value.targetHash!=='string'||! /^[a-f0-9]{64}$/.test(value.targetHash)||!dense(value.fleetHashes)||value.fleetHashes.length<1||value.fleetHashes.length>10||value.fleetHashes.some(hash=>typeof hash!=='string'||! /^[a-f0-9]{64}$/.test(hash)))throw invalid('派遣来源须为目标和逐舰完整摘要');return structuredClone(value);
}
function dispatchPreparation(facts,{config=facts.config,moduleConfig={}}={}){
 const opts=validateTreasureConfig(moduleConfig),context={worldId:facts.player?.worldId??null,season:facts.season,todayRewardTimes:facts.todayRewardTimes,totalRewardTimes:facts.totalRewardTimes,config:{GameplayOpenCfg:rowsOf(config,'GameplayOpenCfg'),WorldParamCfg:rowsOf(config,'WorldParamCfg')},moduleConfig:opts};
 return {petrolPerFleet:configuredCost(config,'进攻宝藏消耗汽油'),availablePetrol:facts.stockReliable?quantity(facts.stock?.get('汽油')):null,targets:(facts.treasures??[]).map(target=>({uid:target.uid,targetHash:dispatchHash({context,target})})),fleets:(facts.fleets??[]).map(fleet=>({buildingId:fleet.buildingId,fleetHash:dispatchHash({worldId:context.worldId,fleet})}))};
}
// Shared six-source survey; each explicitly selected target retains its original rank/defence reads.
export async function surveyTreasurePreparation(client,protocol,options,targets){
 const facts=await surveyTreasure(client,protocol,{...options,parameters:{}}),details=[];
 for(const target of targets)details.push(await surveyTreasureDetails(client,protocol,target.uid,options));
 return {facts,details};
}
function opening(facts, config) {
  const time = gameTimeBounds(facts);
  if (time.now === null) return null;
  const worldId = quantity(facts.player?.worldId);
  const season = worldId === null ? 0 : Math.floor(worldId / 1000000) % 1000;
  const matches = rowsOf(config, 'GameplayOpenCfg').filter(row => row.gameplay === '世界宝藏');
  const days = matches.length === 1 ? matches[0].openDays?.[Math.min(season - 1, matches[0].openDays.length - 1)] : null;
  if (!facts.season?.reliable || quantity(facts.season.startTime) === null || facts.season.startTime <= 0 || quantity(facts.season.endTime) === null || facts.season.endTime <= facts.season.startTime || !Number.isSafeInteger(days) || days < 1 || season < 1) return null;
  const opens = facts.season.startTime + (days - 1) * 86400, closes = facts.season.endTime - 3600;
  if (time.earliest >= opens && time.latest < closes) return true;
  if (time.latest < opens || time.earliest >= closes) return false;
  return null;
}
function buildCandidates(facts, { config = facts.config, parameters = facts.parameters ?? {}, moduleConfig = {} } = {}) {
  parametersOf(parameters); const opts = validateTreasureConfig(moduleConfig), unit = configuredCost(config, '进攻宝藏消耗汽油');
  const selected = stringIds(parameters.fleetBuildingIds);
  const idle = (facts.fleets ?? []).filter(fleet => fleet.state === 1 && fleet.autoFight?.isOn === false && fleet.treasureLootUid === 0 && !fleet.repairing && fleet.durability !== null && fleet.maxDura > 0 && fleet.durability / fleet.maxDura >= opts.minimumDurabilityRatio);
  const picks = selected ? selected.map(id => (facts.fleets ?? []).find(fleet => fleet.buildingId === id)) : idle.slice().sort((a, b) => a.buildingId.localeCompare(b.buildingId)).slice(0, opts.maxFleets);
  const ids = picks.filter(Boolean).map(fleet => fleet.buildingId), preparation = parameters.expectedDispatch ? dispatchPreparation(facts,{config,moduleConfig}) : null;
  return (facts.treasures ?? []).filter(target => parameters.uid === undefined || parameters.uid === target.uid).map(target => {
    let reason = null;
    const cost = unit === null ? null : unit * picks.length;
    if (opts.enabled !== true || opts.dispatch !== true) reason = 'MODULE_DISABLED';
    else if (!facts.protocolReady || !facts.treasureReliable || !facts.fleetReliable || !facts.stockReliable || !facts.statsReliable) reason = 'FACTS_UNRELIABLE';
    else if (opening(facts, config) === null) reason = 'SEASON_UNKNOWN';
    else if (!opening(facts, config)) reason = 'SEASON_CLOSED';
    else if (facts.todayRewardTimes >= facts.totalRewardTimes) reason = 'DAILY_LIMIT';
    else if (!opts.colors.includes(target.color) || target.progress === null || target.progress >= 100) reason = 'TARGET_UNAVAILABLE';
    else if (target.ownerGuildIdx === null || target.ownerFleetNum === null) reason = 'OWNER_UNKNOWN';
    else if (target.ownerGuildIdx !== 0 || target.ownerFleetNum !== 0) reason = 'CONTESTED_TARGET_UNVERIFIED';
    else if (parameters.uid !== undefined && (!facts.targetDetails || facts.targetDetails.uid !== target.uid || !facts.targetDetails.rankReliable || !facts.targetDetails.defenceReliable)) reason = 'TARGET_DETAILS_UNRELIABLE';
    else if (facts.targetDetails?.uid === target.uid && facts.targetDetails.defence?.length) reason = 'DEFENCE_PRESENT';
    else if (!picks.length || picks.length > opts.maxFleets || picks.length > 10 || picks.some(fleet => !fleet || !idle.includes(fleet))) reason = 'FLEET_UNAVAILABLE';
    else if (parameters.expectedDispatch && stable(parameters.expectedDispatch)!==stable({targetHash:preparation.targets.find(row=>row.uid===target.uid)?.targetHash,fleetHashes:ids.map(id=>preparation.fleets.find(row=>row.buildingId===id)?.fleetHash)})) reason = 'DISPATCH_SOURCE_CHANGED';
    else if (unit === null || !Number.isSafeInteger(cost)) reason = 'COST_UNKNOWN';
    else if (quantity(facts.stock?.get('汽油')) === null || facts.stock.get('汽油') < cost + opts.petrolReserve) reason = 'INSUFFICIENT_PETROL';
    const costs = cost === null || !Number.isSafeInteger(cost) ? [] : [{ id: '汽油', num: cost }];
    const beforeState = { treasure: target, fleets: picks.map(fleet => fleet ?? null), todayRewardTimes: facts.todayRewardTimes, totalRewardTimes: facts.totalRewardTimes, season: facts.season };
    const targetIdentity = { uid: target.uid, fleetBuildingIds: ids };
    return { actionId: 'treasure:dispatch:' + target.uid + ':' + ids.map(encodeURIComponent).join(','), actionType: 'treasureDispatch', target: targetIdentity, costs,
      costSource: unit === null ? null : 'WorldParamCfg.进攻宝藏消耗汽油 × 舰队数量', beforeState, identity: stable(beforeState), expectedState: { treasureLootUid: target.uid, scope: 'DISPATCH_CONFIRMED_ONLY' },
      ...(parameters.expectedDispatch?{budgetClaims:{resources:costs,quotas:[],uids:[{type:'treasure',id:String(target.uid)},...ids.map(id=>({type:'fleet',id}))]}}:{}),
      parameters: {...targetIdentity,...(parameters.expectedDispatch?{expectedDispatch:structuredClone(parameters.expectedDispatch)}:{})}, decision: reason ? 'BLOCKED' : 'READY', reason, label: '派舰至世界宝藏 ' + target.uid,
      action: reason ? null : { request: 'TreasureLootSendFleetsRequest', response: null, body: { uid: target.uid, fleetBuildingIds: ids } } };
  });
}
export function treasureView(facts, options = {}) { return { preparation: dispatchPreparation(facts,options), candidates: buildCandidates(facts, options), targetDetails: facts.targetDetails ?? null, reliability: { treasures: facts.treasureReliable === true, fleets: facts.fleetReliable === true, stock: facts.stockReliable === true, stats: facts.statsReliable === true }, treasures: facts.treasures ?? [], fleets: facts.fleets ?? [], todayRewardTimes: facts.todayRewardTimes, totalRewardTimes: facts.totalRewardTimes }; }
export function planTreasure(facts, options = {}) { return selectedActions(buildCandidates(facts, options), options.selections ?? [], options.ledger ?? new ResourceLedger(facts.stockReliable ? facts.stock : null), validateTreasureConfig(options.moduleConfig).petrolReserve); }
export function verifyTreasure(operation, beforeFacts, afterFacts) {
  if (operation?.actionType !== 'treasureDispatch' || !beforeFacts?.fleetReliable || !afterFacts?.fleetReliable || !afterFacts?.treasureReliable || beforeFacts?.stockReliable!==true || afterFacts?.stockReliable!==true) return { confirmed: false, reason: '寻宝权威复读或库存不完整' };
  const target = operation.target, ids = target?.fleetBuildingIds;
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) return { confirmed: false, reason: '舰队选择无效' };
  const targetExists = afterFacts.treasures.some(treasure => treasure.uid === target.uid);
  const inventoryConfirmed = Array.isArray(operation.costs) && operation.costs.length===1 && operation.costs[0]?.id==='汽油' && stockMatchesDelta(beforeFacts.stock, afterFacts.stock, operation.costs, []);
  const confirmed = inventoryConfirmed && targetExists && ids.every(id => { const before = beforeFacts.fleets.find(fleet => fleet.buildingId === id), after = afterFacts.fleets.find(fleet => fleet.buildingId === id); return before?.state === 1 && before.treasureLootUid === 0 && after?.treasureLootUid === target.uid && [1, 2, 3, 5].includes(after.state); });
  return { confirmed, reason: confirmed ? 'MyFleets 精确舰队已关联目标宝藏且汽油净扣已确认；仅确认派遣，不代表获胜或奖励到账' : inventoryConfirmed ? 'MyFleets 未证实精确舰队派遣到目标；保留 UNKNOWN' : '汽油净扣或其他库存变化未按授权成本确认；保留 UNKNOWN' };
}
export function validateTreasurePreparation(value){
 if(!exactFields(value,['targets','maxDurationMs'])||!dense(value.targets)||value.targets.length<1||value.targets.length>10||!Number.isSafeInteger(value.maxDurationMs)||value.maxDurationMs<1||value.maxDurationMs>86400000)throw invalid('须明确1至10个宝藏目标及有限时长');
 const used=new Set(),targets=value.targets.map(target=>{
  if(!exactFields(target,['uid','fleetBuildingIds','expectedDispatch'])||!dense(target.fleetBuildingIds)||target.fleetBuildingIds.length<1||target.fleetBuildingIds.length>10)throw invalid('每目标须明确舰队组及原来源');
  parametersOf(target);for(const id of target.fleetBuildingIds){if(id.length>300||id!==id.trim()||used.has(id))throw invalid('不同目标不得重复派遣同一舰队');used.add(id);}return structuredClone(target);
 });if(new Set(targets.map(row=>row.uid)).size!==targets.length)throw invalid('宝藏目标不得重复');return {targets,maxDurationMs:value.maxDurationMs};
}
export function prepareTreasureWorkflow(facts,details,{config=facts.config,moduleConfig={},...input}={}){
 const payload=validateTreasurePreparation(input),ledger=new ResourceLedger(facts.stockReliable?facts.stock:null),nodes=[{id:'start',type:'START'}];
 const steps=payload.targets.map((parameters,i)=>{
  const matches=details.filter(row=>row.uid===parameters.uid);if(matches.length!==1)throw invalid('缺少精确目标的独立排行/防守来源');
  const source={...facts,parameters,targetDetails:matches[0]},candidate=buildCandidates(source,{config,moduleConfig,parameters})[0];
  if(!candidate)throw invalid('目标已不在原完整列表');
  const plan=planTreasure(source,{config,moduleConfig,parameters,ledger,selections:[candidate.actionId]});
  if(plan.actions.length!==1)throw invalid('宝藏目标或累计汽油/保留线不满足原单次合同：'+(plan.notes[0]??'UNKNOWN'));
  const row=plan.actions[0],selection={actionId:row.actionId};nodes.push({id:'dispatch-'+i,type:'ACTION',module:'treasure',parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'treasure'});
  return {parameters,selection,target:structuredClone(row.target),costs:structuredClone(row.costs),budgetClaims:structuredClone(row.budgetClaims)};
 });nodes.push({id:'stop',type:'STOP'});
 const petrol=steps.reduce((sum,row)=>sum+row.costs[0].num,0);if(!Number.isSafeInteger(petrol))throw invalid('汽油总额溢出');
 const budget={resources:petrol?[{id:'汽油',num:petrol}]:[],quotas:[],uids:steps.flatMap(row=>row.budgetClaims.uids)};
 return {...payload,steps,budget,graph:{version:1,id:'treasure-dispatch-'+dispatchHash(payload).slice(0,20),name:'明确无人防守世界宝藏逐目标派舰',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs:payload.maxDurationMs,maxActions:steps.length,modules:['treasure']}},resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'明确不同目标、互不重复的原空闲舰队；固定初始汽油预算并保留原安全余量。每目标独立读取排行/防守、重新核赛季/次数/目标/舰队/成本，逐项授权及原派舰关联和完整库存汽油净扣验证。来源变化、拒绝或UNKNOWN停止；只确认派遣，不确认占领、胜负或奖励，不续跑。'};
}

export const treasureModule = Object.freeze({ id: 'treasure', rejectionIdentity: businessRejectionIdentityFromHistory, validateParameters: parametersOf, defaultConfig: TREASURE_DEFAULT_CONFIG, validateConfig: validateTreasureConfig, survey: surveyTreasure, view: treasureView, plan: planTreasure, verify: verifyTreasure });
