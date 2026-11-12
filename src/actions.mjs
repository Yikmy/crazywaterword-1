// Catalog of the protocol calls that matter for idle play, with an explicit split
// between "ask the server something" and "tell the server to change something".
//
// Field numbers come from tools/describe.mjs against the game's own generated codec, not
// from guessing. Requests whose response type does not exist in the protocol table are
// answered by a push or a generic OkResponse instead, so they are sent fire-and-forget.

import { assertExecutionActive, awaitExecution, operationResult } from './execution.mjs';

// SpeedUpCost.SPEED_UP_ITEM=2（1=钻石 2=加速器 3=广告）。本工具只允许 2。
export const SPEED_UP_ITEM_TYPE = 2;

// 「每日精选」里几个礼包的 packId 是客户端写死的字面量（DailyPackBuyPanel 的字段初值），
// 不是配置表里的值，所以这里也只能写死。赠礼=免费那档，合并礼包=要买过礼包1/2/3 才能领。
export const FREE_DAILY_PACK_ID = '赠礼';
export const DAILY_GIFT_PACK_IDS = ['礼包1', '礼包2', '礼包3'];

// repeated int32 参数：接受 "1,2,3" 或 1 或 [1,2,3]。
function indexList(value) {
  const values = Array.isArray(value) ? value : String(value ?? '').split(',');
  if (!values.length || values.some((part) => !['string', 'number'].includes(typeof part) || String(part).trim() === '')) {
    throw new Error('index must contain int32 values');
  }
  const numbers = values.map(Number);
  if (numbers.some((number) => !Number.isInteger(number) || number < -2147483648 || number > 2147483647)) {
    throw new Error('index must contain int32 values');
  }
  return numbers;
}

function positiveInt32(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0 || number > 2147483647) throw new Error('useNum must be a positive int32');
  return number;
}

function stringList(value, { required = false } = {}) {
  if (value == null) {
    if (required) throw new Error('missing parameter: buildingId');
    return [];
  }
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [value];
  if (values.some((part) => !['string', 'number'].includes(typeof part) || (typeof part === 'number' && !Number.isFinite(part)))) {
    throw new Error('IDs must be strings or finite numbers');
  }
  const strings = values.map((part) => String(part).trim()).filter(Boolean);
  if (required && !strings.length) throw new Error('missing parameter: buildingId');
  return strings;
}

export const ACTIONS = {
  afkDraw: {
    request: 'DrawAfkRewardRequest',
    response: 'DrawAfkRewardResponse',
    mutate: true,
    desc: '领取挂机时段收益，服务端据此把挂机时间段重置',
    body: (params) => (params?.useAdvCard ? { useAdvCard: true } : {}),
  },
  afkLevelDraw: {
    request: 'DrawAfkLevelRewardRequest',
    response: 'DrawAfkLevelRewardResponse',
    mutate: true,
    desc: '领取指定挂机等级的奖励',
    params: ['level'],
    body: ({ level }) => ({ level: Number(level) }),
  },
  afkUpgrade: {
    request: 'UpgradeAfkLevelRequest',
    response: 'UpgradeAfkLevelResponse',
    mutate: true,
    desc: '提升挂机等级',
    params: ['level'],
    body: ({ level }) => ({ level: Number(level) }),
  },
  factoryGain: {
    request: 'GainFactoryProduceRequest',
    response: 'GainFactoryProduceResponse',
    mutate: true,
    desc: '收取指定建筑的工厂产出',
    params: ['buildingId'],
    body: ({ buildingId }) => ({ buildingId }),
  },
  buildingCollect: {
    request: 'CollectBuildingProductRequest',
    response: 'CollectBuildingProductResponse',
    mutate: true,
    desc: '收取指定建筑的产物',
    params: ['buildingId'],
    body: ({ buildingId }) => ({ buildingId: stringList(buildingId, { required: true }) }),
  },
  buildingFinish: {
    request: 'FinishUpgradeBuildingRequest',
    response: null,
    mutate: true,
    desc: '竣工指定建筑，仅在 buildFinishTime 已过时有效',
    params: ['buildingId'],
    body: ({ buildingId }) => ({ buildingId }),
  },
  buildingAutoWork: {
    request: 'SetBuildingAutoWorkRequest',
    response: null,
    mutate: true,
    desc: '开关指定建筑的自动工作',
    params: ['buildingId', 'isOn'],
    body: ({ buildingId, isOn }) => ({ buildingId, isOn: isOn === true || isOn === 'true' }),
  },
  factoryAutoProduce: {
    request: 'SetFactoryAutoProduceRequest',
    response: null,
    mutate: true,
    desc: '设置工厂自动生产的产品',
    params: ['buildingId', 'productId'],
    body: ({ buildingId, productId }) => ({ buildingId, productId }),
  },
  dailyTaskDraw: {
    request: 'DrawDailyTaskRewardRequest',
    response: 'DrawDailyTaskRewardResponse',
    mutate: true,
    desc: '领取每日任务奖励',
    params: ['id'],
    body: ({ id }) => ({ id: Number(id) }),
  },
  achievementDraw: {
    request: 'GotAchievementRewardRequest',
    response: null,
    mutate: true,
    desc: '领取成就奖励',
    params: ['id'],
    body: ({ id }) => ({ id: Number(id) }),
  },
  emailQuickGet: {
    request: 'QuickGotReadEmailRequest',
    response: null,
    mutate: true,
    desc: '一键领取已读邮件附件',
    body: () => ({ all: true }),
  },
  // index 是 repeated int32，传单个数字会被编码成空数组，所以这里统一收成数组，
  // 命令行写 "1" 或 "1,2,3,4" 都行。
  dailyRewardDraw: {
    request: 'DrawDailyRewardRequest',
    response: null,
    mutate: true,
    desc: '领取日常活跃宝箱（档位来自 DailyActivityRewardCfg，门槛 20/40/60/80/100）',
    params: ['index'],
    body: ({ index }) => ({ index: indexList(index) }),
  },
  weeklyRewardDraw: {
    request: 'DrawWeeklyRewardRequest',
    response: null,
    mutate: true,
    desc: '领取周活跃宝箱（自己的表 WeeklyActivityRewardCfg，门槛 120/240/360/480/600）',
    params: ['index'],
    body: ({ index }) => ({ index: indexList(index) }),
  },
  freeDailyPackDraw: {
    request: 'GotFreeDailyPackRequest',
    response: null,
    mutate: true,
    desc: '领「每日精选」里那档免费礼包（packId 由客户端硬编码为「赠礼」，可领性看 DailyGiftPackResponse.drawnPack）',
    // 付费那三档与「合并礼包」不在工具范围内，所以参数写死、不开放给命令行。
    body: () => ({ packId: FREE_DAILY_PACK_ID }),
  },
  monthCardDaily: {
    request: 'MonthCardDailyRewardRequest',
    response: null,
    mutate: true,
    desc: '领取月卡每日奖励',
    body: () => ({}),
  },
  taskDrawMain: {
    request: 'DrawMainTaskRewardRequest',
    response: null,
    mutate: true,
    desc: '领取主线（成长任务）奖励',
    params: ['taskId'],
    body: ({ taskId }) => ({ taskId: Number(taskId) }),
  },
  taskDrawBranch: {
    request: 'GotBranchTaskRewardRequest',
    response: null,
    mutate: true,
    desc: '领取支线任务奖励',
    params: ['taskId'],
    body: ({ taskId }) => ({ taskId: Number(taskId) }),
  },
  orderDayReward: {
    request: 'GetNextOrderOTDRewardRequest',
    response: null,
    mutate: true,
    desc: '领取每日订单进度档位奖励（空体，一次领一档）',
    body: () => ({}),
  },
  finishOrder: {
    request: 'FinishWorkerOrderRequest',
    response: 'FinishWorkerOrderResponse',
    mutate: true,
    desc: '提交居民订单，材料必须齐全',
    params: ['index'],
    body: ({ index }) => ({ index: Number(index) }),
  },
  rerollOrder: {
    request: 'DenyOrderRequest',
    response: null,
    mutate: true,
    desc: '拒绝（重刷）一条居民订单，会消耗订单名额',
    params: ['index'],
    body: ({ index }) => ({ index: Number(index) }),
  },
  startProduce: {
    request: 'StartFactoryProduceRequest',
    response: null,
    mutate: true,
    desc: '让工厂开始生产指定产品',
    params: ['buildingId', 'productId'],
    body: ({ buildingId, productId }) => ({ buildingId, productId }),
  },
  upgradeBuilding: {
    request: 'UpgradeBuildingRequest',
    response: null,
    mutate: true,
    desc: '升级建筑（要满足 BuildingUpgradeCfg 的等级、人口与消耗）',
    params: ['buildingId'],
    body: ({ buildingId }) => ({ buildingId }),
  },
  buildBuilding: {
    request: 'BuildBuildingRequest',
    response: null,
    mutate: true,
    desc: '建造新建筑（OnWaterResponse 里 level=0 的空位，条件是 BuildingUpgradeCfg 的 level 1 行）',
    params: ['buildingId'],
    body: ({ buildingId }) => ({ buildingId }),
  },
  speedUpUpgrade: {
    request: 'SpeedUpUpgradeBuildingRequest',
    response: null,
    mutate: true,
    desc: '花加速器缩短建造时间；type=2 是加速器，钻石(1)与广告(3)本工具不用',
    params: ['buildingId', 'useNum'],
    body: ({ buildingId, useNum }) => ({ buildingId, speedUp: { type: SPEED_UP_ITEM_TYPE, useNum: positiveInt32(useNum) } }),
  },
  speedUpProduce: {
    request: 'SpeedUpFactoryProduceRequest',
    response: null,
    mutate: true,
    desc: '花加速器缩短工厂生产时间',
    params: ['buildingId', 'index', 'useNum'],
    body: ({ buildingId, index, useNum }) => ({
      buildingId,
      index: Number(index),
      speedUp: { type: SPEED_UP_ITEM_TYPE, useNum: positiveInt32(useNum) },
    }),
  },
  challengeField: {
    request: 'ChallengeResFieldRequest',
    response: null,
    mutate: true,
    desc: '派舰队攻打并占领资源田，要求该田所属城是我方城且有闲置舰队',
    params: ['gridIdx'],
    body: ({ gridIdx, fleetBuildingIds }) => ({
      resFieldGridIdx: Number(gridIdx),
      fleetBuildingIds: stringList(fleetBuildingIds),
    }),
  },
  giveUpField: {
    request: 'GiveUpResFieldRequest',
    response: null,
    mutate: true,
    desc: '放弃已占领的资源田',
    params: ['gridIdx'],
    body: ({ gridIdx }) => ({ resFieldGridIdx: Number(gridIdx) }),
  },
};

// D6 is a hard boundary: an opt-in never authorizes diamonds or paid packs.
// Use request semantics as well as cost metadata; a forged ready label is insufficient.
export function assertPaymentAllowed(action, { allowPaid = false } = {}) {
  const request = action.request;
  const body = action.body ?? {};
  const costs = action.costs ?? [];
  const hasRuby = Array.isArray(costs) && Array.prototype.some.call(costs, (item) => ['RUBY', '钻石', '4'].includes(String(item?.id ?? item?.[0])));
  const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };
  if (hasRuby || request === 'DiscountShopBuyRequest' || (request === 'ClickGoldRequest' && body.free !== true)
    || (request === 'GotFreeDailyPackRequest' && body.packId !== FREE_DAILY_PACK_ID)
    || /Buy|Paid|Charge|Coupon/.test(request ?? '') || /钻石|RUBY|付费礼包/i.test(action.cost ?? '')
    || (body.speedUp && body.speedUp.type !== SPEED_UP_ITEM_TYPE)) {
    fail('D6_FORBIDDEN', 'D6 禁止钻石消费和付费礼包');
  }
  if (action.paid || action.needsPaid) {
    if (!allowPaid) fail('PAID_NOT_ALLOWED', '需要付费，未开 allowPaid');
    fail('D6_FORBIDDEN', 'D6 禁止付费动作');
  }
  if (request === 'DrawAfkRewardRequest' && body.useAdvCard) fail('COST_UNKNOWN', '广告卡成本未经确认');
  const fields=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).length===keys.length&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&Object.getOwnPropertyDescriptor(v,k)?.enumerable===true&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'));
  const identifier=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v.trim()===v&&!/[\u0000-\u001f\u007f]/.test(v);
  const exactCosts=list=>Array.isArray(list)&&Object.getPrototypeOf(list)===Array.prototype&&Reflect.ownKeys(list).length===list.length+1&&Array.from({length:list.length},(_,index)=>Object.getOwnPropertyDescriptor(list,index)).every(d=>d?.enumerable&&Object.hasOwn(d,'value'))&&list.every(v=>fields(v,['id','num'])&&identifier(v.id)&&Number.isSafeInteger(v.num)&&v.num>0)&&new Set(list.map(v=>v.id)).size===list.length;
  // Exact seed-only or owned-material branches. No fallback purchase, exchange,
  // harvest or automatic-farming branch is admitted by a request-family label.
  const donateFort=request==='DonateFortRequest';
  const fortMaterials=['压电陶瓷','炮弹','耐火砖','高温合金','液态金属','碳纤维'];
  const positiveInt32=v=>Number.isInteger(v)&&v>0&&v<=2147483647;
  if(donateFort&&(!fields(body,['cityId','item','selectPackNum'])||!positiveInt32(body.cityId)||body.selectPackNum!==0||!fields(body.item,['itemId','num'])||!fortMaterials.includes(body.item.itemId)||!positiveInt32(body.item.num)||!exactCosts(costs)||costs.length!==1||costs[0].id!==body.item.itemId||costs[0].num!==body.item.num))fail('COST_UNKNOWN','堡垒仅允许单城市、自有普通材料精确成本及selectPackNum=0');
  const exclusiveLevel=request==='HeroExclusiveLevelUpRequest';
  if(exclusiveLevel&&(!fields(body,['heroId'])||!identifier(body.heroId)||!exactCosts(costs)||costs.length!==1||!['初级专武材料','中级专武材料','高级专武材料','特级专武材料'].includes(costs[0].id)))fail('COST_UNKNOWN','专武升级仅允许明确已激活英雄及单种自有专武材料正成本');
  const exclusiveStar=request==='HeroExclusiveStarUpRequest';
  if(exclusiveStar&&(!fields(body,['heroId','universal'])||!identifier(body.heroId)||body.universal!==false||!exactCosts(costs)||costs.length!==2||!costs.some(row=>row.id===body.heroId+'碎片')||!costs.some(row=>['橙专武升星石','红专武升星石'].includes(row.id))))fail('COST_UNKNOWN','专武升星仅允许自有同英雄碎片、对应品质升星石及universal=false');
  const refineEquip=request==='EquipRefineRequest';
  const enhanceEquip=request==='EnhanceEquipRequest';
  const exactUid=value=>typeof value==='string'&&/^[1-9][0-9]*$/.test(value)&&value.length<=19&&BigInt(value)<(1n<<63n);
  const activateAntique=request==='ActivateAntiqueRequest',starAntique=request==='AntiqueStarUpRequest';
  if((activateAntique||starAntique)&&(!fields(body,starAntique?['id','universal']:['id'])||!identifier(body.id)||starAntique&&body.universal!==false||!exactCosts(costs)||costs.length!==1||costs[0].id!==body.id+'碎片'))fail('COST_UNKNOWN','藏品成长仅允许明确藏品及其自有专用碎片，禁止万能碎片或购买补齐');
  const emptyOwnArray=v=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length===0&&Reflect.ownKeys(v).length===1;
  const sweepPirate=request==='PirateSweepRequest';
  if(sweepPirate&&(!fields(body,['uid','cityId'])||!positiveInt32(body.uid)||!positiveInt32(body.cityId)||!emptyOwnArray(Object.getOwnPropertyDescriptor(action,'costs')?.value)))fail('COST_UNKNOWN','海面扫荡仅允许明确UID和城市且不消耗普通资源');
  const suitAntique=request==='AntiqueSuitLevelUpRequest',masterAntique=request==='AntiqueMasterLevelUpRequest',exchangeAntique=request==='AntiqueFragExchangeRequest';
  const suitXp=['蓝藏品经验','紫藏品经验','橙藏品经验','红藏品经验'],universalFragments=['蓝藏万能碎片','紫藏万能碎片','橙藏万能碎片','红藏万能碎片'];
  const explicitFree=emptyOwnArray(Object.getOwnPropertyDescriptor(action,'costs')?.value);
  if(suitAntique&&(!fields(body,['id'])||!positiveInt32(body.id)||!(explicitFree||exactCosts(costs)&&costs.length===2&&costs.every(row=>positiveInt32(row.num))&&costs.some(row=>row.id==='GOLD')&&costs.some(row=>suitXp.includes(row.id)))))fail('COST_UNKNOWN','藏品套装仅允许明确套装ID，零成本激活或自有金币及同品质藏品经验');
  if(masterAntique&&(!fields(Object.getOwnPropertyDescriptor(action,'body')?.value,[])||!(explicitFree||exactCosts(costs)&&costs.length===1&&costs[0].id==='藏品大师经验'&&positiveInt32(costs[0].num))))fail('COST_UNKNOWN','藏品精通仅允许明确空请求、零成本首级或自有藏品大师经验');
  if(exchangeAntique&&(!fields(body,['antiqueId','fragItemId','num'])||!identifier(body.antiqueId)||!universalFragments.includes(body.fragItemId)||!positiveInt32(body.num)||!exactCosts(costs)||costs.length!==1||costs[0].id!==body.fragItemId||costs[0].num!==body.num))fail('COST_UNKNOWN','藏品碎片兑换仅允许明确藏品、已持有万能碎片与精确正数量');
  const putOnEquip=request==='PutOnEquipRequest';
  if(putOnEquip&&(!fields(body,['uid','heroId'])||!exactUid(body.uid)||!identifier(body.heroId)||!emptyOwnArray(Object.getOwnPropertyDescriptor(action,'costs')?.value)))fail('COST_UNKNOWN','装备穿戴仅允许明确自有UID和英雄，且不消耗资源');
  const putOnBadge=request==='PutOnBadgeRequest';
  if(putOnBadge&&(!fields(body,['uid','heroId','pos'])||!exactUid(body.uid)||!identifier(body.heroId)||!Number.isInteger(body.pos)||body.pos<1||body.pos>4||!emptyOwnArray(Object.getOwnPropertyDescriptor(action,'costs')?.value)))fail('COST_UNKNOWN','纹章穿戴仅允许明确自有UID、英雄和单一槽位，且不消耗资源');
  const enhanceBadge=request==='EnhanceBadgeRequest';
  if(enhanceBadge&&(!fields(body,['uid','decomposeUid','expItemNum'])||!exactUid(body.uid)||!emptyOwnArray(body.decomposeUid)||!positiveInt32(body.expItemNum)||!exactCosts(costs)||costs.length!==2||!costs.some(row=>row.id==='徽章经验'&&row.num===body.expItemNum)||!costs.some(row=>row.id==='GOLD')))fail('COST_UNKNOWN','纹章升级仅允许明确已佩戴UID、自有徽章经验和金币，不消耗其他徽章');
  if(enhanceEquip&&(!fields(body,['uid'])||!exactUid(body.uid)||!exactCosts(costs)||costs.length!==1||costs[0].id!=='精铁'))fail('COST_UNKNOWN','装备升级仅允许明确已佩戴UID及精确正精铁成本');
  if(refineEquip&&(!fields(body,['uid'])||!exactUid(body.uid)||!exactCosts(costs)||costs.length!==2||!['精铁','精炼石'].every(id=>costs.some(row=>row.id===id))))fail('COST_UNKNOWN','装备精炼仅允许明确已佩戴UID及精确双材料正成本');
  const unlockPreset=request==='UnlockFormationPresetRequest';
  if(unlockPreset&&(!fields(body,['id'])||!Number.isInteger(body.id)||body.id<2||body.id>24||!exactCosts(costs)||costs.length!==1||costs[0].id!=='阵型'+body.id+'图纸'||costs[0].num!==1))fail('COST_UNKNOWN','阵型解锁仅允许持有的对应普通图纸一张及精确目标');
  const farmPlant=request==='FarmPlantRequest',forgeMake=request==='MakeEquipRequest',forgePick=request==='PickMadeEquipRequest';
  if(farmPlant&&(!fields(body,['args'])||!Array.isArray(body.args)||body.args.length!==1||Reflect.ownKeys(body.args).length!==2||!fields(body.args[0],['buildingId','productId'])||!identifier(body.args[0].buildingId)||!identifier(body.args[0].productId)||!exactCosts(costs)||costs.length!==1))fail('COST_UNKNOWN','仅允许有精确种子成本的单田播种');
  if(forgeMake&&(!fields(body,['buildingId','makeId','universal'])||!identifier(body.buildingId)||!Number.isInteger(body.makeId)||body.makeId<=0||body.makeId>2147483647||body.universal!==false||!exactCosts(costs)||costs.length===0))fail('COST_UNKNOWN','装备制造仅允许精确配方、自有材料及universal=false');
  if(forgePick&&(!fields(body,['buildingId'])||!identifier(body.buildingId)||!Object.hasOwn(action,'costs')||!exactCosts(costs)||costs.length!==0))fail('COST_UNKNOWN','装备收取仅允许明确单建筑及零成本');
  const known = sweepPirate || activateAntique || starAntique || suitAntique || masterAntique || exchangeAntique || exclusiveLevel || exclusiveStar || donateFort || refineEquip || enhanceEquip || putOnEquip || enhanceBadge || putOnBadge || unlockPreset || farmPlant || forgeMake || forgePick || Object.values(ACTIONS).some((entry) => entry.request === request)
    || ['SaveFormationRequest','GuildAidHelpRequest','CancelMyGuildAidRequest','GotMyGuildAidRequest','GotGuildWelfarePackRequest','FinishGuildOrderRequest','UpgradeGuildTechRequest','MuseumStartExploreRequest','MuseumSpeedUpExploreRequest','MuseumSpeedUpCaseRequest','MuseumCollectRevenueRequest','MuseumClaimAchievementRequest','MuseumUpgradeExhibitionRequest','MuseumExhibitRequest','MuseumUpgradeKeywordRequest','MuseumUpgradeCaseRequest','MuseumFinishCaseUpgradeRequest','TreasureLootSendFleetsRequest','RepairFleetRequest','StopRepairingRequest','SetFleetAutoFightRequest','FleetSaveFormationRequest','MoveFleetsToCityRequest','FillCargoShipRequest','DrawShipRewardRequest'].includes(request)
    || ['RecruitStartRequest', 'ChallengeStageRequest', 'ArenaChallengeRequest', 'ClickGoldRequest', 'TrialRaidChallengeRequest', 'HeroLevelUpRequest', 'HeroSkillLevelUpRequest', 'HeroStarUpRequest'].includes(request);
  if (!known || (request === 'RecruitStartRequest' && ![1, 2].includes(body.way))) {
    fail('COST_UNKNOWN', '动作成本未知，拒绝执行');
  }
  return action;
}

export function listActions() {
  return Object.entries(ACTIONS).map(([id, action]) => ({
    id,
    request: action.request,
    mutate: action.mutate,
    params: action.params ?? [],
    desc: action.desc,
  }));
}

// Checked before dialing the gateway, so a missing opt-in costs nothing and never even
// opens a session.
export function assertAllowed(id, { allowMutate = false } = {}) {
  const action = ACTIONS[id];
  if (!action) throw new Error(`unknown action: ${id}`);
  if (action.mutate && !allowMutate) {
    throw new Error(`action "${id}" changes account state; re-run with --yes to proceed`);
  }
  return action;
}

export function buildBody(action, params = {}) {
  for (const key of action.params ?? []) {
    if (params[key] === undefined || params[key] === '') {
      throw new Error(`missing parameter: ${key}`);
    }
  }
  return action.body(params) ?? {};
}

// Runs one action. Mutating calls are refused unless the caller explicitly opts in, so a
// stray command line cannot change the account by accident.
export async function runAction(client, protocol, id, params = {}, options = {}) {
  const { allowMutate = false, timeout = 15000 } = options;
  const action = assertAllowed(id, { allowMutate });
  const body = buildBody(action, params);
  assertPaymentAllowed({ ...action, body }, options);
  assertExecutionActive(client, options);
  if (!protocol[action.request]) throw new Error(`protocol has no type ${action.request}`);
  if (action.response) {
    if (!protocol[action.response]) throw new Error(`protocol has no type ${action.response}`);
    const response = await awaitExecution(client.request(action.request, body, action.response, timeout, { mutate: true, signal: options.signal }), client, options);
    return operationResult('SUCCESS', { id, sent: action.request, response: action.response, body: response });
  }
  await awaitExecution(client.sendWatch(action.request, body, { window: 400, signal: options.signal }), client, options);
  return operationResult('UNKNOWN', { id, sent: action.request, response: null, body: null });
}
