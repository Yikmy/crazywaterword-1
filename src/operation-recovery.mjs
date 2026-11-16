// Read-only, evidence-bound reconciliation. Never dispatch or replay a business write.
import { createHash } from 'node:crypto';
import { assertPaymentAllowed } from './actions.mjs';
import { parseFormation, verifyFormation, validateFormationParameters } from './formation.mjs';
import { fleetStopAction, fleetFormationAction, fleetFormationBuildings, fleetLifecycleAction, fleetInventory, fleetInventorySnapshot, fleetCargoAction, fleetCargoShip, fleetCargoHeader, fleetCargoAssets, verifyFleet } from './fleet.mjs';
import { fleetFacts, stable } from './naval-facts.mjs';
import { assertExecutionActive, awaitExecution } from './execution.mjs';
import { toSnapshotJson } from './game.mjs';

export const RECOVERY_DISPATCH_CONTRACT = 'business-write-ahead-v1';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => object(value) && Object.hasOwn(value, key);
const text = value => typeof value === 'string' && value.length > 0 && value.trim() === value;
const writeStages = new Set(['DISPATCH_INTENT', 'DISPATCHED', 'RESPONSE', 'OBSERVATION_ENDED', 'VERIFY', 'VERIFIED']);
const preDispatchStages = new Set(['SURVEY', 'RESOURCE_PREFLIGHT']);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function gameId(value) {
  const copied = toSnapshotJson(value);
  if (typeof copied === 'number' && (!Number.isSafeInteger(copied) || copied <= 0)) return null;
  if (!['number', 'string'].includes(typeof copied) || !/^[1-9]\d*$/.test(String(copied))) return null;
  try { return BigInt(copied).toString(); } catch { return null; }
}
function scope(value) {
  if (!object(value) || !text(value.accountId) || !text(value.connectionId) || value.connectionId.length > 256 || !Number.isSafeInteger(value.generation) || value.generation < 0) return null;
  const playerId = gameId(value.playerId), worldId = gameId(value.worldId);
  return playerId && worldId ? { accountId: value.accountId, playerId, worldId, generation: value.generation, connectionId: value.connectionId } : null;
}
function completeFormation(value) {
  if (!object(value) || Object.keys(value).some(key => !['heroPositions', 'presetId', 'petUid'].includes(key))) return null;
  if (!Array.isArray(value.heroPositions) || !value.heroPositions.length ||
      value.heroPositions.some(row => !object(row) || Object.keys(row).some(key => !['heroId', 'pos'].includes(key)) ||
        !object(row.pos) || Object.keys(row.pos).some(key => !['x', 'y'].includes(key)))) return null;
  const parsed = parseFormation(value);
  if (!parsed) return null;
  parsed.heroPositions.sort((a, b) => a.heroId.localeCompare(b.heroId));
  return parsed;
}
function sameFormation(a, b) {
  const left = completeFormation(a), right = completeFormation(b);
  return left !== null && right !== null && same(left, right);
}
export function provenNotDispatched(row) {
  const proof = row.dispatchEvidence;
  if (!object(proof) || proof.version !== 1 || proof.contract !== RECOVERY_DISPATCH_CONTRACT || proof.state !== 'NOT_DISPATCHED') return false;
  if (row.dispatched === true || row.unresolvedWrite === true || row.verifiedReceipt ||
      row.requestStatus === 'SUCCESS' || row.result === 'SUCCESS') return false;
  if (row.stages !== undefined && (!Array.isArray(row.stages) || row.stages.some(entry => !object(entry) ||
      writeStages.has(entry.stage) || !preDispatchStages.has(entry.stage)))) return false;
  return true;
}
function receiptProblem(row, expected, originalScope) {
  const receipt = row.verifiedReceipt;
  if (!object(receipt) || receipt.version !== 1 || receipt.verified !== true ||
      receipt.request !== 'SaveFormationRequest' || receipt.response !== 'SaveFormationResponse' || receipt.module !== 1) return 'MISSING_VERIFIED_RECEIPT';
  if (!same(scope(receipt.executionContext), originalScope)) return 'RECEIPT_SCOPE_MISMATCH';
  if (!sameFormation(receipt.expectedState, expected) || !sameFormation(receipt.beforeFacts?.formation, row.beforeState) ||
      receipt.beforeFacts?.reliability?.formation !== true || !sameFormation(receipt.responseEvidence?.formation, expected)) return 'INCOMPLETE_VERIFIED_RECEIPT';
  return null;
}

// Project only the exact stopped fleet through the original MyFleets parser.
// Neither a current stopped flag nor a VERIFIED stage alone is a receipt.
function fleetStopFacts(facts,buildingId) {
  if(facts?.fleetReliable!==true)return null;
  const parsed=fleetFacts({available:true,body:{fleets:facts.fleets}});
  if(!parsed.fleetReliable)return null;
  const rows=parsed.fleets.filter(row=>row.buildingId===buildingId);if(rows.length!==1)return null;
  const fleet=Object.fromEntries(['buildingId','state','durability','autoFight','repairing'].map(key=>[key,rows[0][key]]));
  return {fleetReliable:true,fleets:[fleet]};
}
function fleetStopContract(row) {
  if(row?.module!=='fleet'||!['fleetStopRepair','fleetStopAutoFight'].includes(row.actionType)||!Array.isArray(row.costs)||row.costs.length!==0||!text(row.target?.buildingId))return null;
  const buildingId=row.target.buildingId,repair=row.actionType==='fleetStopRepair';
  const target={buildingId},expectedState=repair?{state:1,repairing:null}:{autoFight:{isOn:false}};
  if(!same(row.target,target)||!same(row.parameters,target)||!same(row.expectedState,expectedState)||row.actionId!=='fleet:'+row.actionType+':'+encodeURIComponent(buildingId))return null;
  return {buildingId,expectedState,action:fleetStopAction(row.actionType,buildingId)};
}
function fleetStopReceiptProblem(row,contract,originalScope) {
  const receipt=row.verifiedReceipt;
  if(!object(receipt)||receipt.version!==1||receipt.verified!==true||receipt.module!=='fleet'||receipt.actionType!==row.actionType||receipt.request!==contract.action.request||receipt.response!==null)return 'MISSING_VERIFIED_RECEIPT';
  if(!same(scope(receipt.executionContext),originalScope))return 'RECEIPT_SCOPE_MISMATCH';
  const before=fleetStopFacts(receipt.beforeFacts,contract.buildingId),after=fleetStopFacts(receipt.afterFacts,contract.buildingId);
  const original=fleetStopFacts({fleetReliable:true,fleets:[row.beforeState?.fleet]},contract.buildingId);
  if(!before||!after||!original||!same(before,original)||!same(receipt.target,row.target)||!same(receipt.expectedState,contract.expectedState)||verifyFleet(row,before,after).confirmed!==true)return 'INCOMPLETE_VERIFIED_RECEIPT';
  return null;
}
function buildFleetStopVerifiedReceipt(candidate,beforeFacts,afterFacts,context) {
  const executionContext=scope(context),contract=fleetStopContract(candidate);
  if(!executionContext||!contract||!same(candidate.action,contract.action))return null;
  const before=fleetStopFacts(beforeFacts,contract.buildingId),after=fleetStopFacts(afterFacts,contract.buildingId);
  const original=fleetStopFacts({fleetReliable:true,fleets:[candidate.beforeState?.fleet]},contract.buildingId);
  if(!before||!after||!original||!same(before,original)||verifyFleet(candidate,before,after).confirmed!==true)return null;
  return {version:1,verified:true,module:'fleet',actionType:candidate.actionType,request:contract.action.request,response:null,
    target:{buildingId:contract.buildingId},beforeFacts:before,afterFacts:after,expectedState:contract.expectedState,executionContext};
}

// Formation recovery keeps only the original OnWater fleet layouts. The live
// parser and verifier remain the authority; no roster or unlock inference here.
function fleetFormationReceiptFacts(facts) {
  const source=facts?.formationFacts;
  if(source?.buildingsReliable!==true||!Array.isArray(source.buildings))return null;
  const parsed=fleetFormationBuildings({available:true,body:{building:source.buildings.map(row=>({buildingId:row?.buildingId,level:row?.level,fleet:{formation:row?.formation}}))}});
  if(!parsed.buildingsReliable||parsed.buildings.some(row=>!row.formation))return null;
  const buildings=parsed.buildings.map(row=>({buildingId:row.buildingId,formation:row.formation}));
  for(const row of buildings)row.formation.heroPositions.sort((a,b)=>a.heroId.localeCompare(b.heroId));
  buildings.sort((a,b)=>a.buildingId.localeCompare(b.buildingId));
  return {formationFacts:{buildingsReliable:true,buildings}};
}
function originalFleetFormationFacts(row) {
  if(!row.beforeState?.building||!Array.isArray(row.beforeState.otherFleets)||row.beforeState.building.buildingId!==row.target?.buildingId)return null;
  return fleetFormationReceiptFacts({formationFacts:{buildingsReliable:true,buildings:[row.beforeState.building,...row.beforeState.otherFleets]}});
}
function fleetFormationContract(row) {
  if(row?.module!=='fleet'||row.actionType!=='fleetFormation'||!Array.isArray(row.costs)||row.costs.length!==0||!text(row.target?.buildingId))return null;
  const buildingId=row.target.buildingId,formation=row.expectedState?.formation;
  if(!same(row.target,{buildingId})||row.actionId!=='fleet:fleetFormation:'+encodeURIComponent(buildingId)||row.identity!==stable(row.beforeState)||
    !object(row.expectedState)||Object.keys(row.expectedState).some(key=>key!=='formation')||!object(formation)||Object.keys(formation).some(key=>!['heroPositions','presetId'].includes(key)))return null;
  const parsed=fleetFormationBuildings({available:true,body:{building:[{buildingId,fleet:{formation}}]}}).buildings[0]?.formation;
  if(!parsed||stable(row.expectedState)!==stable({formation:parsed})||row.beforeState?.fleet?.buildingId!==buildingId||!object(row.parameters)||row.parameters.buildingId!==buildingId)return null;
  const {buildingId:ignored,...parameters}=row.parameters;
  if(!Object.keys(parameters).length)return null;
  try{validateFormationParameters(parameters);}catch{return null;}
  return {buildingId,expectedState:{formation:parsed},parameters:structuredClone(row.parameters),action:fleetFormationAction(buildingId,formation)};
}
function fleetFormationReceiptProblem(row,contract,originalScope) {
  const receipt=row.verifiedReceipt;
  if(!object(receipt)||receipt.version!==1||receipt.verified!==true||receipt.module!=='fleet'||receipt.actionType!=='fleetFormation'||receipt.request!==contract.action.request||receipt.response!==null)return 'MISSING_VERIFIED_RECEIPT';
  if(!same(scope(receipt.executionContext),originalScope))return 'RECEIPT_SCOPE_MISMATCH';
  const before=fleetFormationReceiptFacts(receipt.beforeFacts),after=fleetFormationReceiptFacts(receipt.afterFacts),original=originalFleetFormationFacts(row);
  if(!before||!after||!original||!same(before,receipt.beforeFacts)||!same(after,receipt.afterFacts)||!same(before,original)||
    !same(receipt.target,row.target)||!same(receipt.parameters,contract.parameters)||!same(receipt.expectedState,contract.expectedState)||verifyFleet(row,before,after).confirmed!==true)return 'INCOMPLETE_VERIFIED_RECEIPT';
  return null;
}
function buildFleetFormationVerifiedReceipt(candidate,beforeFacts,afterFacts,context) {
  const executionContext=scope(context),contract=fleetFormationContract(candidate);
  if(!executionContext||!contract||!same(candidate.action,contract.action))return null;
  const before=fleetFormationReceiptFacts(beforeFacts),after=fleetFormationReceiptFacts(afterFacts),original=originalFleetFormationFacts(candidate);
  if(!before||!after||!original||!same(before,original)||verifyFleet(candidate,before,after).confirmed!==true)return null;
  return {version:1,verified:true,module:'fleet',actionType:'fleetFormation',request:contract.action.request,response:null,
    target:{buildingId:contract.buildingId},parameters:contract.parameters,beforeFacts:before,afterFacts:after,expectedState:contract.expectedState,executionContext};
}
// Lifecycle receipts retain complete inventory counts, not source packets.
// Costs are the original authorized declaration; only verifyFleet judges the
// net debit and movement/repair outcome, both before persistence and on reread.
function fleetLifecycleReceiptFacts(facts,buildingId) {
  const inventory=fleetInventorySnapshot(facts);
  if(facts?.fleetReliable!==true||!inventory)return null;
  const parsed=fleetFacts({available:true,body:{fleets:facts.fleets}});
  if(!parsed.fleetReliable)return null;
  const rows=parsed.fleets.filter(row=>row.buildingId===buildingId);if(rows.length!==1)return null;
  const fleet=Object.fromEntries(['buildingId','state','durability','maxDura','cityId','targetCityId','moveStartTs','moveEndTs','treasureLootUid','autoFight','repairing'].map(key=>[key,rows[0][key]]));
  return {fleetReliable:true,fleets:[fleet],stockReliable:true,stock:[...inventory].sort(([a],[b])=>a.localeCompare(b))};
}
function fleetStoredInventoryFacts(value,project) {
  if(!object(value)||!Array.isArray(value.stock)||value.stock.some(row=>!Array.isArray(row)||row.length!==2))return null;
  try{
    if(new Set(value.stock.map(row=>row[0])).size!==value.stock.length)return null;
    const facts={...value,stock:new Map(value.stock)},canonical=project(facts);
    return canonical&&same(canonical,value)?facts:null;
  }catch{return null;}
}
function fleetLifecycleStoredFacts(value,buildingId) { return fleetStoredInventoryFacts(value,facts=>fleetLifecycleReceiptFacts(facts,buildingId)); }
const fleetIdentityHash=row=>createHash('sha256').update(row.identity).digest('hex');
function fleetLifecycleContract(row) {
  if(row?.module!=='fleet'||!['fleetRepair','fleetMove'].includes(row.actionType)||!Array.isArray(row.costs)||!text(row.target?.buildingId)||!text(row.identity)||row.identity!==stable(row.beforeState)||!text(row.costSource))return null;
  const buildingId=row.target.buildingId,repair=row.actionType==='fleetRepair',cityId=row.target.cityId;
  const originalFleet=row.beforeState?.fleet;
  if(originalFleet?.buildingId!==buildingId||originalFleet.state!==1||!Number.isSafeInteger(originalFleet.durability)||originalFleet.durability<0||!Number.isSafeInteger(originalFleet.maxDura)||originalFleet.maxDura<=0||originalFleet.durability>originalFleet.maxDura)return null;
  if(repair&&originalFleet.durability===originalFleet.maxDura)return null;
  const paid=row.costs.length===1&&row.costs[0]?.id==='汽油'&&Number.isSafeInteger(row.costs[0].num)&&row.costs[0].num>0;
  if(!paid&&(repair||row.costs.length!==0))return null;
  if(paid&&!same(row.costs,[{id:'汽油',num:row.costs[0].num}]))return null;
  if(!repair&&(!Number.isInteger(cityId)||cityId<=0||cityId>2147483647||row.beforeState.city?.id!==cityId||row.beforeState.petrol!==(paid?row.costs[0].num:0)))return null;
  const target=repair?{buildingId}:{buildingId,cityId};
  const expectedState=repair?{maxDura:row.beforeState.fleet.maxDura,repairingOrCompleted:true}:{cityId,scope:'MOVEMENT_ONLY'};
  if(!same(row.target,target)||!same(row.parameters,target)||!same(row.expectedState,expectedState)||row.actionId!=='fleet:'+row.actionType+':'+Object.values(target).map(value=>encodeURIComponent(String(value))).join(':'))return null;
  return {buildingId,target,expectedState,action:fleetLifecycleAction(row.actionType,target)};
}
function fleetLifecycleReceiptProblem(row,contract,originalScope) {
  const receipt=row.verifiedReceipt;
  if(!object(receipt)||receipt.version!==1||receipt.verified!==true||receipt.module!=='fleet'||receipt.actionType!==row.actionType||receipt.request!==contract.action.request||receipt.response!==null)return 'MISSING_VERIFIED_RECEIPT';
  if(!same(scope(receipt.executionContext),originalScope))return 'RECEIPT_SCOPE_MISMATCH';
  const before=fleetLifecycleStoredFacts(receipt.beforeFacts,contract.buildingId),after=fleetLifecycleStoredFacts(receipt.afterFacts,contract.buildingId);
  const original=before?fleetLifecycleReceiptFacts({...before,fleets:[row.beforeState.fleet]},contract.buildingId):null;
  if(!before||!after||!original||!same(original,receipt.beforeFacts)||receipt.identityHash!==fleetIdentityHash(row)||!same(receipt.target,row.target)||!same(receipt.parameters,row.parameters)||
    !same(receipt.costs,row.costs)||receipt.costSource!==row.costSource||!same(receipt.expectedState,contract.expectedState)||verifyFleet(row,before,after).confirmed!==true)return 'INCOMPLETE_VERIFIED_RECEIPT';
  return null;
}
function buildFleetLifecycleVerifiedReceipt(candidate,beforeFacts,afterFacts,context) {
  const executionContext=scope(context),contract=fleetLifecycleContract(candidate);
  if(!executionContext||!contract||!same(candidate.action,contract.action))return null;
  const before=fleetLifecycleReceiptFacts(beforeFacts,contract.buildingId),after=fleetLifecycleReceiptFacts(afterFacts,contract.buildingId);
  const original=before?fleetLifecycleReceiptFacts({...beforeFacts,fleets:[candidate.beforeState.fleet]},contract.buildingId):null;
  if(!before||!after||!original||!same(before,original)||verifyFleet(candidate,beforeFacts,afterFacts).confirmed!==true)return null;
  return {version:1,verified:true,module:'fleet',actionType:candidate.actionType,request:contract.action.request,response:null,
    target:contract.target,parameters:structuredClone(candidate.parameters),costs:structuredClone(candidate.costs),costSource:candidate.costSource,identityHash:fleetIdentityHash(candidate),
    beforeFacts:before,afterFacts:after,expectedState:contract.expectedState,executionContext};
}
function cargoReceiptShip(raw) {
  const ship=fleetCargoShip(raw);
  return ship?{...ship,orderItem:ship.orderItem.map(row=>({asset:row.asset,filled:row.filled,reward:{asset:row.reward}}))}:null;
}
function fleetCargoReceiptFacts(facts,shipIndex) {
  const inventory=fleetInventorySnapshot(facts);
  if(facts?.cargoReliable!==true||!fleetCargoHeader(facts.ships)||!inventory)return null;
  const ship=cargoReceiptShip(facts.ships.find(row=>row.index===shipIndex));
  return ship?{cargoReliable:true,ships:[ship],stockReliable:true,stock:[...inventory].sort(([a],[b])=>a.localeCompare(b))}:null;
}
function fleetCargoStoredFacts(value,shipIndex) { return fleetStoredInventoryFacts(value,facts=>fleetCargoReceiptFacts(facts,shipIndex)); }
function cargoReceiptResponse(response,kind) {
  const assets=fleetCargoAssets(response?.reward?.asset);if(!assets)return null;
  const ship=kind==='cargoClaim'?cargoReceiptShip(response?.ship):null;if(kind==='cargoClaim'&&!ship)return null;
  return {reward:{asset:assets},...(ship?{ship}:{})};
}
function fleetCargoContract(row) {
  if(row?.module!=='fleet'||!['cargoFill','cargoClaim'].includes(row.actionType)||!text(row.identity)||row.identity!==stable(row.beforeState)||!text(row.costSource)||!Array.isArray(row.costs))return null;
  const shipIndex=row.target?.shipIndex,cargoIndex=row.target?.cargoIndex,fill=row.actionType==='cargoFill';
  if(!Number.isInteger(shipIndex)||shipIndex<=0||shipIndex>2147483647||fill&&(!Number.isInteger(cargoIndex)||cargoIndex<=0||cargoIndex>2147483647))return null;
  const target=fill?{shipIndex,cargoIndex}:{shipIndex},action=fleetCargoAction(row.actionType,target);
  if(!same(row.target,target)||!same(row.parameters,target)||row.actionId!=='fleet:'+row.actionType+':'+Object.values(target).map(value=>encodeURIComponent(String(value))).join(':')||!object(row.expectedState))return null;
  try{assertPaymentAllowed({...action,costs:row.costs});}catch{return null;}
  return {shipIndex,target,expectedState:structuredClone(row.expectedState),action};
}
function fleetCargoReceiptProblem(row,contract,originalScope) {
  const receipt=row.verifiedReceipt;
  if(!object(receipt)||receipt.version!==1||receipt.verified!==true||receipt.module!=='fleet'||receipt.actionType!==row.actionType||receipt.request!==contract.action.request||receipt.response!==contract.action.response)return 'MISSING_VERIFIED_RECEIPT';
  if(!same(scope(receipt.executionContext),originalScope))return 'RECEIPT_SCOPE_MISMATCH';
  const before=fleetCargoStoredFacts(receipt.beforeFacts,contract.shipIndex),after=fleetCargoStoredFacts(receipt.afterFacts,contract.shipIndex),response=cargoReceiptResponse(receipt.responseEvidence,row.actionType);
  if(!before||!after||!response||!same(response,receipt.responseEvidence)||stable(row.beforeState)!==stable({ship:fleetCargoShip(before.ships[0])})||
    receipt.identityHash!==fleetIdentityHash(row)||!same(receipt.target,row.target)||!same(receipt.parameters,row.parameters)||!same(receipt.costs,row.costs)||receipt.costSource!==row.costSource||!same(receipt.expectedState,contract.expectedState)||
    verifyFleet({...row,action:contract.action},before,after,response).confirmed!==true)return 'INCOMPLETE_VERIFIED_RECEIPT';
  return null;
}
function buildFleetCargoVerifiedReceipt(candidate,beforeFacts,afterFacts,response,context) {
  const executionContext=scope(context),contract=fleetCargoContract(candidate);if(!executionContext||!contract||!same(candidate.action,contract.action))return null;
  const before=fleetCargoReceiptFacts(beforeFacts,contract.shipIndex),after=fleetCargoReceiptFacts(afterFacts,contract.shipIndex),evidence=cargoReceiptResponse(response,candidate.actionType);
  if(!before||!after||!evidence||stable(candidate.beforeState)!==stable({ship:fleetCargoShip(before.ships[0])})||verifyFleet(candidate,beforeFacts,afterFacts,response).confirmed!==true)return null;
  return {version:1,verified:true,module:'fleet',actionType:candidate.actionType,request:contract.action.request,response:contract.action.response,
    target:contract.target,parameters:structuredClone(candidate.parameters),costs:structuredClone(candidate.costs),costSource:candidate.costSource,identityHash:fleetIdentityHash(candidate),
    beforeFacts:before,afterFacts:after,responseEvidence:evidence,expectedState:contract.expectedState,executionContext};
}
// Only an already verified original execution may create this durable projection.
// No protocol bodies, credentials, config tables or unrelated player state are kept.
export function buildVerifiedReceipt(candidate, beforeFacts, afterFacts, response, context) {
  if(candidate?.module==='fleet'){
    if(candidate.actionType==='fleetFormation')return buildFleetFormationVerifiedReceipt(candidate,beforeFacts,afterFacts,context);
    if(['fleetRepair','fleetMove'].includes(candidate.actionType))return buildFleetLifecycleVerifiedReceipt(candidate,beforeFacts,afterFacts,context);
    if(['cargoFill','cargoClaim'].includes(candidate.actionType))return buildFleetCargoVerifiedReceipt(candidate,beforeFacts,afterFacts,response,context);
    return buildFleetStopVerifiedReceipt(candidate,beforeFacts,afterFacts,context);
  }
  const executionContext = scope(context), expectedState = completeFormation(candidate?.expectedState);
  if (!executionContext || candidate?.module !== 'formation' || candidate?.actionType !== 'SAVE' ||
      !Array.isArray(candidate.costs) || candidate.costs.length !== 0 || candidate.target?.module !== 1 ||
      !expectedState || candidate.target?.presetId !== expectedState.presetId ||
      beforeFacts?.reliability?.formation !== true || afterFacts?.reliability?.formation !== true) return null;
  const before = completeFormation(beforeFacts.formation), after = completeFormation(afterFacts.formation);
  const acknowledged = own(response, 'formation') ? completeFormation(response.formation) : null;
  if (!before || !after || !acknowledged) return null;
  const verification = verifyFormation(candidate, beforeFacts, afterFacts, response);
  if (verification?.confirmed !== true) return null;
  return { version: 1, verified: true, request: 'SaveFormationRequest', response: 'SaveFormationResponse', module: 1,
    beforeFacts: { formation: before, reliability: { formation: true } }, expectedState,
    responseEvidence: { formation: acknowledged }, executionContext };
}
// context is the service-owned, currently locked session identity. assertCurrent
// must reject a replaced client/session before and after the fixed authoritative read.
// The caller persists this result as an append-only event; this collector never edits history.
export async function collectOperationRecovery(client, protocol, run, row, { signal, clock = Date.now, context, assertCurrent = () => {} } = {}) {
  const time = Number(clock()), checkedAt = Number.isFinite(time) && !Number.isNaN(new Date(time).getTime()) ? new Date(time).toISOString() : null;
  let originalScope = null, readRequest = null, observation = null, readMethod = 'READ_ONLY_FORMATION_V1';
  const finish = (status, reasonCode, reason) => ({ status, evidence: {
    version: 1, method: status === 'NOT_APPLIED' ? 'DURABLE_NOT_DISPATCHED_V1' : readMethod,
    reasonCode, reason, checkedAt, scope: originalScope, readRequest, observation,
    references: { runId: text(run?.runId) ? run.runId : null, actionId: text(row?.actionId) ? row.actionId : null },
  } });
  if (!checkedAt) return finish('STILL_UNKNOWN', 'INVALID_CLOCK', '复核时间不可用，未解除保护');
  if (!object(run) || !text(run.accountId) || !text(run.runId) || !text(row?.actionId) || !Array.isArray(run.actions)) return finish('STILL_UNKNOWN', 'INVALID_HISTORY', '缺少唯一持久批次和动作证据');
  const stored = run.actions.filter(action => action?.actionId === row.actionId);
  if (stored.length !== 1) return finish('STILL_UNKNOWN', 'INVALID_HISTORY', '持久动作不存在或不唯一');
  // Ignore caller-supplied projections; all decisions use the selected persisted row.
  row = stored[0];
  originalScope = scope(run.executionContext);
  const currentScope = scope(context);
  if (!originalScope || !currentScope || originalScope.accountId !== run.accountId || !same(originalScope, currentScope)) return finish('STILL_UNKNOWN', 'SCOPE_MISMATCH', '账号、角色、世界或连接代次不能与原执行证据绑定');
  try { assertExecutionActive(client, { signal }); assertCurrent(); }
  catch (error) { return finish('STILL_UNKNOWN', error?.code === 'CANCELLED' || error?.name === 'AbortError' ? 'CANCELLED' : 'SESSION_CHANGED', '复核已取消或会话归属已变化'); }
  if (provenNotDispatched(row)) return finish('NOT_APPLIED', 'PROVEN_NOT_DISPATCHED', '版本化写前屏障证明业务请求从未派发；不会重用原授权');
  const fleetStop=fleetStopContract(row),fleetFormation=fleetFormationContract(row),fleetLifecycle=fleetLifecycleContract(row),fleetCargo=fleetCargoContract(row);
  if(fleetStop)readMethod='READ_ONLY_FLEET_STOP_V1';
  if(fleetFormation)readMethod='READ_ONLY_FLEET_FORMATION_V1';
  if(fleetLifecycle)readMethod='READ_ONLY_FLEET_LIFECYCLE_V1';
  if(fleetCargo)readMethod='READ_ONLY_CARGO_V1';
  const expected = completeFormation(row.expectedState);
  if (!fleetStop && !fleetFormation && !fleetLifecycle && !fleetCargo && (row.module !== 'formation' || row.actionType !== 'SAVE' || !Array.isArray(row.costs) || row.costs.length !== 0 ||
      row.target?.module !== 1 || !expected || row.target?.presetId !== expected.presetId)) return finish('STILL_UNKNOWN', 'UNSUPPORTED_OPERATION', '当前仅复核原主线/舰队编组保存、舰队停止、声明汽油成本的维修/移动及货船装货/领奖；均须原持久验证凭据');
  if (client?.connected !== true || typeof client.request !== 'function') return finish('STILL_UNKNOWN', 'NOT_CONNECTED', '没有可用于权威复读的当前连接');
  if (client.pending?.length || client.watchers?.length || client.promptUncertain || client.lateResponses?.size) return finish('STILL_UNKNOWN', 'READ_CONTEXT_UNCERTAIN', '当前连接存在未决或迟到响应，不能安全复读');
  const requestName=fleetCargo?'CargoShipsRequest':fleetFormation?'OnWaterRequest':fleetStop||fleetLifecycle?'MyFleetsRequest':'GetFormationRequest',responseName=fleetCargo?'CargoShipsResponse':fleetFormation?'OnWaterResponse':fleetStop||fleetLifecycle?'MyFleetsResponse':'GetFormationResponse';
  if (!protocol?.[requestName] || !protocol?.[responseName]) return finish('STILL_UNKNOWN', 'PROTOCOL_MISSING', '缺少固定只读复核协议');
  if((fleetLifecycle||fleetCargo)&&['AllItemRequest','AllItemResponse','AllResourceRequest','AllResourceResponse'].some(name=>!protocol?.[name]))return finish('STILL_UNKNOWN','PROTOCOL_MISSING','缺少完整库存只读复核协议');
  const problem = fleetCargo?fleetCargoReceiptProblem(row,fleetCargo,originalScope):fleetLifecycle?fleetLifecycleReceiptProblem(row,fleetLifecycle,originalScope):fleetFormation?fleetFormationReceiptProblem(row,fleetFormation,originalScope):fleetStop?fleetStopReceiptProblem(row,fleetStop,originalScope):receiptProblem(row, expected, originalScope);
  try {
    assertExecutionActive(client, { signal }); assertCurrent();
    readRequest = fleetCargo?{request:requestName,shipIndex:fleetCargo.shipIndex,response:responseName,inventoryRequests:['AllItemRequest','AllResourceRequest']}:fleetStop||fleetFormation||fleetLifecycle?{request:requestName,buildingId:(fleetStop??fleetFormation??fleetLifecycle).buildingId,response:responseName,...(fleetLifecycle?{inventoryRequests:['AllItemRequest','AllResourceRequest']}:{})}:{request:requestName,module:1,response:responseName};
    const response = await awaitExecution(client.request(requestName, fleetStop||fleetFormation||fleetLifecycle||fleetCargo?{}:{module:1}, responseName, 15000, { signal }), client, { signal });
    assertExecutionActive(client, { signal }); assertCurrent();
    if (!same(scope(context), currentScope)) return finish('STILL_UNKNOWN', 'SESSION_CHANGED', '复读期间会话身份或连接代次发生变化');
    if(fleetLifecycle||fleetCargo){
      const inventorySources=[];
      for(const [request,response] of [['AllItemRequest','AllItemResponse'],['AllResourceRequest','AllResourceResponse']]){
        assertExecutionActive(client,{signal});assertCurrent();
        const body=await awaitExecution(client.request(request,{},response,15000,{signal}),client,{signal});
        assertExecutionActive(client,{signal});assertCurrent();inventorySources.push({available:true,body});
      }
      if(!same(scope(context),currentScope))return finish('STILL_UNKNOWN','SESSION_CHANGED','完整库存复读期间会话身份发生变化');
      const inventory=fleetInventory(...inventorySources);
      const snapshot=fleetCargo?fleetCargoReceiptFacts({cargoReliable:true,ships:own(response,'ship')?response.ship:null,...inventory},fleetCargo.shipIndex):fleetLifecycleReceiptFacts({...fleetFacts({available:true,body:response}),...inventory},fleetLifecycle.buildingId);
      const hydrate=value=>fleetCargo?fleetCargoStoredFacts(value,fleetCargo.shipIndex):fleetLifecycleStoredFacts(value,fleetLifecycle.buildingId);
      const facts=snapshot?hydrate(snapshot):null;
      if(!facts)return finish('STILL_UNKNOWN','UNRELIABLE_READ','舰队/货船或完整物品/资源库存缺失、冲突或身份不唯一');
      const before=hydrate(row.verifiedReceipt?.beforeFacts),verification=before?verifyFleet(fleetCargo?{...row,action:fleetCargo.action}:row,before,facts,fleetCargo?row.verifiedReceipt?.responseEvidence:undefined):null;
      observation={...(fleetCargo?{ship:snapshot.ships[0]}:{fleet:snapshot.fleets[0]}),inventory:{status:'COMPLETE',entries:snapshot.stock.length,hash:createHash('sha256').update(stable(snapshot.stock)).digest('hex')},desiredStateMatches:verification?verification.confirmed===true:null,authoritative:true};
      if(problem)return finish('STILL_UNKNOWN',problem,'当前状态与库存仅供观察，缺少原同身份完整业务验证的持久凭据');
      if(verification?.confirmed!==true)return finish('STILL_UNKNOWN','STATE_NOT_CONFIRMED',verification?.reason??'独立目标状态及完整库存未共同确认原维修/移动或货船操作');
      assertExecutionActive(client,{signal});assertCurrent();
      if(!same(scope(context),currentScope))return finish('STILL_UNKNOWN','SESSION_CHANGED','提交复核前会话身份发生变化');
      return finish('APPLIED','RECEIPT_AND_AUTHORITY_CONFIRMED','原持久验证凭据及独立完整复读共同确认：'+verification.reason+'；不重发、续权或恢复执行');
    }
    if(fleetFormation){
      const facts=fleetFormationReceiptFacts({formationFacts:fleetFormationBuildings({available:true,body:response})});
      if(!facts)return finish('STILL_UNKNOWN','UNRELIABLE_READ','OnWater缺少完整可靠的舰队编组身份或阵容');
      const before=originalFleetFormationFacts(row);
      observation={buildingId:fleetFormation.buildingId,formations:facts.formationFacts.buildings,desiredStateMatches:before?verifyFleet(row,before,facts).confirmed===true:false,authoritative:true};
      if(problem)return finish('STILL_UNKNOWN',problem,'当前舰队编组仅供观察，缺少原同身份业务验证的持久凭据');
      if(verifyFleet(row,row.verifiedReceipt.beforeFacts,facts).confirmed!==true)return finish('STILL_UNKNOWN','STATE_NOT_CONFIRMED','独立OnWater未确认原舰队目标阵容或其他舰队保持不变');
      assertExecutionActive(client,{signal});assertCurrent();
      if(!same(scope(context),currentScope))return finish('STILL_UNKNOWN','SESSION_CHANGED','提交复核前会话身份发生变化');
      return finish('APPLIED','RECEIPT_AND_AUTHORITY_CONFIRMED','原持久验证凭据与独立OnWater共同确认同一舰队编组保存；不重发、续权或恢复执行');
    }
    if(fleetStop){
      const facts=fleetStopFacts(fleetFacts({available:true,body:response}),fleetStop.buildingId);
      if(!facts)return finish('STILL_UNKNOWN','UNRELIABLE_READ','MyFleets缺少可靠且唯一的原舰队身份');
      const before=fleetStopFacts({fleetReliable:true,fleets:[row.beforeState?.fleet]},fleetStop.buildingId);
      const verification=before?verifyFleet(row,before,facts):{confirmed:false};
      observation={fleet:facts.fleets[0],desiredStateMatches:verification.confirmed===true,authoritative:true};
      if(problem)return finish('STILL_UNKNOWN',problem,'当前停止状态仅供观察，缺少原同身份业务验证的持久凭据');
      if(verifyFleet(row,row.verifiedReceipt.beforeFacts,facts).confirmed!==true)return finish('STILL_UNKNOWN','STATE_NOT_CONFIRMED','原舰队的停止状态未由独立MyFleets确认');
      assertExecutionActive(client,{signal});assertCurrent();
      if(!same(scope(context),currentScope))return finish('STILL_UNKNOWN','SESSION_CHANGED','提交复核前会话身份发生变化');
      return finish('APPLIED','RECEIPT_AND_AUTHORITY_CONFIRMED','原持久验证凭据与独立MyFleets共同确认同一舰队停止状态；不重发或恢复委任');
    }
    const formation = own(response, 'formation') ? completeFormation(response.formation) : null;
    if (!formation) return finish('STILL_UNKNOWN', 'UNRELIABLE_READ', 'GetFormation 回包缺少完整可靠阵容');
    observation = { formation, desiredStateMatches: sameFormation(formation, expected), authoritative: true };
    if (problem) return finish('STILL_UNKNOWN', problem, '当前状态仅供观察，缺少原业务请求回包与写前身份的持久验证凭据');
    const receipt = row.verifiedReceipt;
    const verification = verifyFormation({
      ...row, action: { request: 'SaveFormationRequest', response: 'SaveFormationResponse', body: { module: 1, formation: expected } },
    }, receipt.beforeFacts, { formation, reliability: { formation: true } }, receipt.responseEvidence);
    if (verification?.confirmed !== true) return finish('STILL_UNKNOWN', 'STATE_NOT_CONFIRMED', verification?.reason ?? '权威复读未确认原目标状态');
    assertExecutionActive(client, { signal }); assertCurrent();
    if (!same(scope(context), currentScope)) return finish('STILL_UNKNOWN', 'SESSION_CHANGED', '提交复核前会话身份发生变化');
    return finish('APPLIED', 'RECEIPT_AND_AUTHORITY_CONFIRMED', verification.reason);
  } catch (error) {
    const cancelled = error?.code === 'CANCELLED' || error?.name === 'AbortError' || signal?.aborted || client?.connected === false;
    return finish('STILL_UNKNOWN', cancelled ? 'CANCELLED' : 'READ_FAILED', cancelled ? '复核取消或连接断开，未解除保护' : '固定只读复核失败，未解除保护');
  }
}
