# CrazyWater Platform — 全路线图对账与工程总计划

当前核对日期：2026-11-15（Asia/Shanghai）；本轮文档核对的已提交源码HEAD为10d0d95。原对账a93acb8之后，Museum边界纠正、普通挂机收益及升级/有限组合、明确多田收取与空田播种准备均已提交。工作区另有src/farm-operations.mjs收取后再播种草稿，尚无完整API/UI/Workflow接线和定向测试，不计交付。PHASE1–4及D.1–D.28保留为历史证据，本页当前M/C/P/S/Inventory与W表为唯一进度基线。

> 原目标COMPLETE_CRAZYWATER_PLATFORM_R1_R8范围不变，尚未完成；原D.1–D.28仅为交接历史。无新增Gate/阶段/编号，R7统一离线与R8单独真实授权条件保持。

2026-11-12 执行策略按 Owner 的 REDUCE_GATE_AND_TOKEN_OVERHEAD 修正：沿用原 R/W/E/X 与需求编号，只保留统一运行时安全合同、具体业务缺证操作和最终 R7/R8 控制。R1–R6 按影响范围定向测试，冻结后统一 R7 全量；只维护本文件的当前状态表与需求索引，不新增 Gate、阶段或原子报告。账号、授权、预算、D6、UNKNOWN 持久化与零自动重放要求不变。

| 工作包 | 已完成能力 | 当前下一项 | 真正阻塞 | 最后提交 | 对应测试 |
|---|---|---|---|---|---|
| W01 PARTIAL | 唯一Console所有者、CLI独立写拒绝、Stage共同门控和有限证据恢复已有 | 维持原合同，按领域权威证据扩恢复 | 通用恢复缺独立证明，重连/重启及其他领域STILL_UNKNOWN | 26ed68d；当前执行链fc68c50 | 原writer-ownership/recovery/Service/API专项；本轮未重跑 |
| W02 PARTIAL | 26静态模块加Stage、27合同、原核心Adapter及父资源/配额/UID预算已有 | 随原剩余领域补合同/Registry | 注册或协议存在不能证明未闭合写可执行 | 原公共实现保留；合同104755d及本批W07（父b4c5f64） | 本批Contract/Registry定向PASS计入W07六文件1015项；原W04及其他共享历史证据保留 |
| W05 PARTIAL | 港口专业货舱/逐物品缺货、明确装货及到港领取已有 | 补原范围其余允许分支 | D6/未知成本/未证身份仅冻结具体操作；不推导全包完成 | fleet最近32656af；原领域提交保留 | 原fleet/HTTP/PAGE专项；本轮未重跑 |
| W10 PARTIAL | 科技专业树、下一等级/实际扣点及复读已接原联盟链 | 原科技重置独立合同 | 重置成本/资格/恢复缺证 | 原科技提交保留；alliance最近72c6388 | 原alliance-tech/共享测试；本轮未重跑 |
| W14 PARTIAL | 原Fleet编队/维修/移动及港口子集保留；本批BIZ-W16默认关闭、明确自有gridIdx（0有效）经原Fleet Function/Service/Executor/History、HTTP及专业页接入。复用私有连续流使推送失效旧计划；父预算预留世界/网格UID，写前意图持久化，独立完整MyResFields/库存复读只确认指定田移除、其他田/上限/库存不变；有限Workflow共用原授权、拒绝/UNKNOWN持久记忆 | 原剩余范围及具体缺证保留；本轮统一下一项见§12.4，已交子集不重复施工；BIZ-W15占领缺证冻结 | 攻击/模式结果、宣战成本/身份、非premium加速、占领及其他原缺口保留；放弃不领取收益，UNKNOWN零重放，W14仍PARTIAL，R7/R8 NOT_RUN | eaa9bf9；原fleet32656af保留 | 2026-11-15：17文件初1912/1913，唯一旧Contract精确字段预期遗漏新增参数；修正并补普通Fleet共存/原Inventory追踪后3文件158/158 PASS（5.32秒），0 fail/cancel/skip/todo。其余Client/共享执行历史记忆/Workflow/D6/HTTP/完整页沿本批首次通过结果不重复运行。设置默认开关8/8另通过，5源语法及diff检查通过。覆盖缺省/零/重复、库存/推送/五维失效、意图失败零写、独立结算、UNKNOWN/重启/迟到/取消、拒绝跨连接持久；离线合成，REAL_UNVERIFIED |
| W22 PARTIAL | 按10d0d95已提交源码续核原M0–M15、95C、42P、8S、273Inventory及W/R/E/X；§6继续逐模块区分代码、API/UI、Workflow、测试和真实边界，README/PHASE4指向唯一当前表 | 文档对齐后按§12.4继续原DAG；先完成保留的农田来源链草稿 | 全范围未齐；C144等具体缺证保留，R7/R8 NOT_RUN；在途代码未验不计完成 | 本次文档提交（父10d0d95）；原对账a93acb8保留 | 本轮仅静态核对：M16/C95/P42/S8/Inventory273与原输入精确一致，名称及C53/38/4、P10/31/1、Inventory188/75/10不变；26模块/27合同、48查询（28解析/20原始），127个当前源码/测试索引均存在。W22/R8/E24/X18精确编号保留。五份原输入和在途源码字节不变；既有测试结果按提交引用，不累计或重跑全套；R7/R8未执行 |
| W03 PARTIAL | 保留原资产archive/verify/restore及普通凭证显式导入。本批修复原worlds.listWorlds/listGroup/describeRole/describeWorld：真实Codec的角色ID、列表区服键、出生服和当前世界均按精确signed int64保留，安全值仍数值、大值十进制字符串；不改原通用normalize。缺失/继承默认/非法/冲突身份为未知，列表缺失不补空。原GET /api/worlds复用busy锁及activeTask，响应复核账号/角色/世界/连接/代次与client事实，旧读取不释放后继锁。原区服页面分别展示各身份，读取中清空、错账号拒绝；enter/输入继续禁用 | 原剩余范围及具体缺证保留；本轮统一下一项见§12.4，已交子集不重复施工 | 原LoginRequest仅worldId目标，没有角色ID/出生服条件或existingRoleOnly；列表观察不保证未来登录不会隐式新建，故切服写产品链未闭合，不能以本次只读修复标写完成。map-1/上游来源哈希缺证，归档complete=false；扫码/捕获未开放。R7/R8未执行 | c87947b；凭证导入b78878e及原资产成果保留 | 2026-11-15：server-runtime/account-view/cli-safety三文件106/106 PASS，0 fail/cancel/skip/todo，12.81秒。含真实本地Codec大int64、合服键分离、坏/缺失/冲突/原型默认、只读/零隐式连接、账号隔离、九种迟到身份变化、互斥/断开/后继锁、原POST enter403及CLI读凭证前写拒绝；3源语法/diff检查通过。全为合成凭证/回环HTTP/离线Codec，REAL_UNVERIFIED |
| W13 PARTIAL | 已有48项缓存贯通钓鱼等级、精确鱼库存/容量、图鉴积分与下一档门槛；CLI、Explorer、只读钓鱼页与账号隔离 | 仅在目标可精确授权后接入领取/收线 | DrawFishReward 空请求缺档位条件；GainBigFish 缺可恢复待捕鱼身份与过期权威读源，冻结这两类写 | 285186f | fishing-view/data-catalog/explorer-view/explorer-api：35/35 PASS，0 fail/skip；本地 Codec、HTTP 与完整页面合成夹具，未连接游戏 |
| W16 PARTIAL | 保留任务/邮件/等级奖励/周礼包、普通收益及ba72763明确升级。本批原afk-level-rewards增加有限收益→升级准备，明确原等级/区间、增量1/5/10与总期限；当前自有挂机徽章先足额，逐档真实成本和主线门槛固定。原Service私有History匹配同五维上下文的收益原来源与实际新区间；逐步原授权/父预算/独立复读，收入不扩授权，拒绝/UNKNOWN停止 | 直接升级及本批有限收益→升级准备/API/UI限定切片已交；下一继续原W19独立能力与原领域剩余，不重复原执行器 | 其他实例收益包和断线旧区间回执仍缺；升级不预测新区间公式，UNKNOWN持久零重放。VIP、实例附件、日周/每日订单原缺口保留；W16/BIZ-R10仍PARTIAL，R7/R8 NOT_RUN | 3b52410；普通收益b6edb78、入口8869553及升级ba72763保留 | 2026-11-15：Adapter/Contract/Registry/D6、Service/History/Memory/Workflow及父预算、HTTP/完整PAGE十二文件2128/2129（247.65秒），唯一新增来源替代用例漏传原Workflow所有权参数导致ACCOUNT_BUSY；修正夹具后相关六边界6/6 PASS（18.92秒），0 fail/cancel/skip/todo。新组合三文件首67/77，十个失败为测试传参/故障夹具及Runner既有状态语义，修正后领域组合40/40；接口/页面37项沿首次通过结果，不重复累计。覆盖逐批/有限run授权、1/5/10、初始材料/成本/来源变化、父预算不足、两处拒绝/UNKNOWN、意图失败零写、派发后身份变化、磁盘重启零重放及迟到/五维/编辑器隔离。九源语法/diff通过；仅离线Codec/回环HTTP/合成PAGE，REAL_UNVERIFIED |
| W17 PARTIAL | 保留原周活动成果；本批BIZ-R17h签到前置观察接入原Client私有来源、48项Collector、日常API及专业页：仅采纳当前连接连续序列SCAllActivity.festivalActivities，精确活动ID/窗口和dailyActive签到记录，独立于VIP/角色等级是否存在；重复/缺口/断线/迟到及五维身份隔离 | 继续原签到资格/成本、游戏日界和独立领取复读合同；随后推进其他依赖已满足分支 | 推送仅为已观察片段，不证明完整活动目录、当前可领或到账；签到仍缺权威日界/资格及独立结算复读，保持具体写操作BLOCKED_EVIDENCE；R7/R8未执行 | a96ee6c；周芯片任务1c0d196保留 | 2026-11-14：日常领域/API/完整PAGE/Client来源及生命周期/月卡/时钟/UNKNOWN/数据目录9文件806/806 PASS（22.337秒），0 fail/cancel/skip/todo；覆盖精确int64、合法0与缺失区分、重复活动仅局部未知、安全DOM、当前上下文隔离、采集仍48请求和零新增派发。全部离线Codec/固定配置/合成传输，REAL_UNVERIFIED |
| W12 PARTIAL | 保留原C151单目标扫荡、权威配额/新鲜度和独立复读；本批日常1010及Loop原表单补齐精确城市与int32 UID，实际注册Function复用原Service/Workflow授权、配额/UID父预算及双持久历史 | 原剩余范围及具体缺证保留；本轮统一下一项见§12.4，已交子集不重复施工 | 已确认计次不证明奖励归属；跨日、目标变化或无法确认结算仍UNKNOWN，禁止自动重放。W12仍PARTIAL，R7/R8未执行 | 8afb70b；原C151成果保留 | 与本批W19共用七文件1147/1147，不重复计数；仅离线，REAL_UNVERIFIED |
| W18 PARTIAL | 保留原观察、非亏损卖出、买入7ec3216、每日时段ff18df9及单航段38597d4。本批C524自有商会指针加速复用原Adapter/Service/Executor/资源配额UID预算/History：明确当前cityId/mvToCityId/num，固定TradeSpeedPop自有路径及ItemCfg/ActivityTradeCfg核验道具与时长；仅缩短后仍为可信未来终点，专用终点回执与独立完整Info/库存确认精确道具净扣、相同航段和其他状态不变；购买路径保持独立 | 原剩余范围及具体缺证保留；本轮统一下一项见§12.4，已交子集不重复施工 | 固定v76的TradeCity仅请求当前cargo.cityId；Radar仅城市/商品/报告者，无目的港价格/时点。旧tradeKing历史表及sellRatio不能证明当前目的港报价；加速至到达边界、补购、多段策略、到达/收益与亏损公式仍未闭合；UNKNOWN持久零重放。W18仍PARTIAL，R7/R8未执行 | 104755d；原买卖/时段/单航段提交保留 | 2026-11-14：贸易领域236/236（131.75秒）及随后新增六项6/6（4.91秒）；D6/Contract/Registry/HTTP/两页面/派发新鲜度七文件1061/1061（82.16秒），合计本批8文件1303/1303 PASS，0 fail/cancel/skip/todo。覆盖缺道具/成本/配置/边界、独立精确净扣、UNKNOWN/重启/迟到/五维隔离、意图后失效及跨入口记忆。HTTP拒绝回归先复现1失败：固定本地时钟与真实心跳时基不一致导致权威时钟失效，改为真实本地时钟校验与合成服务器时间；原拒绝记忆断言、1秒心跳及运行时门槛未放宽。前批1777/1777独立保留不累计，REAL_UNVERIFIED |
| W19 PARTIAL | 原Loop/Tasks/Dailies、父预算/持久History、拒绝/UNKNOWN、具名WAIT和7类事件保留；有限收益→升级及逐田收取已有。本批空田顺序播种准备继续原Registry/Service/Runner/编辑器及节点/批次/动作历史；单田和组合共用拒绝身份，不新增执行器或调度器 | 跟随原BIZ-R16c确认收取后再播种合同；通用cooldown/gameDay仅在领域有权威来源时接，不重复已有入口 | 原准备不授权、不派发；初始自有种子和父预算固定，UNKNOWN持久不重放。通用cooldown/gameDay拒绝专属来源仍缺，policyCoverage保持false；W19 PARTIAL，R7/R8 NOT_RUN | 10d0d95；原3b52410/0421d9b及统一入口成果保留 | 与W04共用2026-11-15：farm领域/Service、Contract/Registry/D6、共享Service/History/Memory/Workflow/父预算、HTTP和完整PAGE共13文件2099/2099 PASS，0 fail/cancel/skip/todo，161.713秒，不重复累计；保留原单田动作/成本/身份、D6及有限运行授权，发送后落盘失败重启仍拦截。REAL_UNVERIFIED |
| W09 PARTIAL | 保留联盟/Fort与c62ee20商船补货；本批BIZ-R05明确单船应聘接入原Alliance/Registry、Generic Executor、OperationService、共享History/Memory、HTTP/专业页及有限Loop。固定客户端明确每名指定英雄的基础星级+已观察专武星级达到总门槛，GuildShipSeekRequest仅shipId、零支出；父预算预留同周期船位及资格英雄UID。独立商船复读确认本人船长与服务端明确未来准备截止，完整英雄池/库存及其他船舱不变。原Client私有连续流新增商船状态修订，调查或持久派发意图后收到Leader/Order/Move/Reset即失效旧计划；写后推送仅触发独立复读，不代替结算 | 原剩余范围及具体缺证保留；本轮统一下一项见§12.4，已交子集不重复施工 | 帮助额度/冷却、求助阈值/请求、跨玩法隐藏英雄占用仍BLOCKED_EVIDENCE；资格UID预留不证明游戏占用。补料购买、万能材料、航行收益/奖励未接入。UNKNOWN持久零自动重放；W09/W19仍PARTIAL，R7/R8未执行 | 船长72c6388；合成心跳夹具24615f6 | 2026-11-14：联盟/Client来源生命周期/月卡/UNKNOWN、科技/Fort、Registry/Contract/D6/写前新鲜度、预算记忆/HTTP/完整PAGE共17文件1432/1432 PASS（受限并发2，89.74秒），0 fail/cancel/skip/todo；新增商船/私有来源169/169、完整HTTP115/115独立保留不累计。覆盖准确总星级/缺失与负数、船位英雄父预算、意图后推送零发送、推送不能证明成功、完整复读与迟到/隔离/重启UNKNOWN、原Loop授权及跨重连拒绝记忆。首次组合运行发现页面测试共享概览被断线用例污染，改为每次启动独立JSON副本；旧商船HTTP间歇409后来定位为合成Socket未回复Pong且替换时钟丢失心跳方法，已在本批W19补齐夹具并通过共用五文件1012/1012；未修改运行时1秒超时、30秒门槛或403重放断言。仅离线Codec/既有固定配置/合成传输，REAL_UNVERIFIED |
| W15 PARTIAL | 原Loop有限naval SURVEY新增CURRENT_RESPONSE_ONLY摘要：同查询/规则绑定的哈希及通过/不匹配/未知计数；响应排序与本地时间不产生变化，相同响应标UNCHANGED，查询/规则改变重建基线；缺来源/身份重复或失源为UNKNOWN。不持久化原始玩家/联盟/舰队数据，不新增调度器 | 继续原C404有界观察及W14有据能力；跨视野定位/跟随和动态攻击须先补原X07/X08证据 | 当前响应未见不证明全局消失、移动或全图完整；哈希仅本轮响应比较，不建立全局持续身份，不推导派遣/攻击资格。W15仍PARTIAL，R7/R8未执行 | 3fdc7ca；原海战观察20d438c/规则a31b4d2保留 | 与本批W19共用五文件879/879 PASS（5.92秒），不重复计数。覆盖精确int64同名不同玩家、乱序/变化/空响应、查询/规则切换、未知不跨接基线、新run不继承及原执行链零写；仅离线Codec/合成传输，REAL_UNVERIFIED |
| W20 PARTIAL | 保留原图编辑、有限run/父预算、日历及三类具名WAIT（FREE_RECRUIT、TRADE_LEG_END、FACTORY_QUEUE_CLOCK）；新增ACHIEVEMENT_TASK_PROGRESS复用原GameClient/Runner/Service/Store和页面，Tasks/Dailies/Loop使用同一策略。当前七类可信事件，不新建调度器；成就列表只触发一次原调查链 | 本批W19已收口第三类队列WAIT；继续原S6有据业务覆盖，缺证操作各自冻结 | 成就目标进度和已领标记仅为观察，不授予领奖资格；与主支线保持独立游标，不由每日重置推断其周期。通用日界/跨窗口策略仍缺，重启不恢复监听或权限。W20仍PARTIAL，R7/R8未执行 | 队列WAIT 59c011b；c0a6f24及原成果保留 | 59c011b定向Adapter/Service241/241及具名HTTP1/1 PASS；更早九文件1446项作为历史保留，不与后续W19导航测试累计。原六类事件及WAIT回归保留；仅离线合成，REAL_UNVERIFIED |
| W21 PARTIAL | 原专业页/预算/舰队配置及历史导航保留；原记忆独立展示Operation与Workflow原因。新增记忆卡到原Workflow历史只读导航，反向到原记忆复用既有入口；不加载图/计划，返回记录核原图与上下文，草稿不变；旧引用、迟到与在途刷新不能替换原历史 | 跟随W19可信来源策略及原42P其余未闭合交互 | 原因/建议和导航不解除资格、预算、UNKNOWN或授权；全业务/完整42P和通用冷却/日界未齐，W21 PARTIAL，R7/R8未执行 | cb57431；原成果保留 | 与W19三文件238/238共用，不重复累计，REAL_UNVERIFIED |
| W04 PARTIAL | 原生产/订单、策略、单田种收和0421d9b逐田收取保留。本批原BIZ-R16c明确1至12块空田、每田作物和期限，经原farm/Service/API/专业页准备有限播种图；初始种子须覆盖全部作物，原Ledger累计预算，每步原单田授权、目标作物及精确种子净扣复读，固定所有剩余空田/配方身份 | 原BIZ-R16c下一接成熟收取确认→同地再播种的有限准备：复用已确认单田历史，绑定原作物批次与实际空田，不预测未来状态；BIZ-R16a状态解析已交，不重复实现 | 批量协议结算、全天量、最终金币和免费刷新仍缺证。拒绝、UNKNOWN、剩余来源/成本变化或到限停止后继；重启只读，W04 PARTIAL，R7/R8 NOT_RUN | 10d0d95；逐田收取0421d9b及原成果保留 | 2026-11-15：farm领域/Service、Contract/Registry/D6、共享Service/History/Memory/Workflow/父预算、HTTP和完整PAGE共13文件2099/2099 PASS，0 fail/cancel/skip/todo，161.713秒；新增领域/Service32/32和HTTP/PAGE36/36与此重叠不累计。覆盖1/2/12田、混合作物及逆序、初始种子总额不足、未来收入不扩预算、两步拒绝/UNKNOWN/磁盘故障与重启、五维/配置迟到、草稿保护；仅离线Codec/回环HTTP/合成PAGE，REAL_UNVERIFIED |
| W11 PARTIAL | 保留ac64891古董兑换及原博物馆/成长成果。本批收口既有C144纠正：真实离线Codec证实Complete/Reward均必需stageId；Contract/专业页明确关卡目标不能恢复同次结算，原计划/验证/D6继续拒绝。新增负例不把到期、库存增加或expedition消失当结算/到账；PAGE复用原museum夹具 | C144缺可恢复结算证据局部冻结；挂机收益及有限升级组合已交；当前下一项见§12.4，不重复施工 | MuseumInfo没有同次结算结果、pending领奖凭据或收据；Complete响应无结算ID。到期/库存增加/expedition消失均不足以证明原结算或领奖。C144保持PROTOCOL_ONLY/BLOCKED_EVIDENCE，W11 PARTIAL | 本行所在提交（父a93acb8）；ac64891及原成果保留 | 2026-11-15：museum/function-contracts/function-registry 125/125 PASS（1.800秒）；完整PAGE的museum过滤6/6 PASS（1.254秒），均0 fail/cancel/skip/todo，4文件语法及diff通过。初跑页面5/6的undefined.module夹具错误已修复为复用原numberConfigPage，保留全部断言；早前61项与此重叠不累计，原76项仍为历史。全为离线Codec/合成页面，REAL_UNVERIFIED |
| W06 PARTIAL | cc0679c单英雄合同保留；本批扩展同一API/UI准备入口：明确1至12名不同英雄及顺序，各最多一星；逐英雄兑换量恰好补缺，0明确只用已有专属碎片。原Ledger准备时核各品质共享万能来源总量，原Workflow累计预算合并全部兑换及单星消耗；每步原Function/Service调查、授权、独立验证及History，固定原星级/余额/成本，不新造执行器 | 原剩余范围及具体缺证保留；本轮统一下一项见§12.4，已交子集不重复施工 | 隐式universal=true、全自动策略及其他兑换仍缺各自身份/成本/结算；不把明确有限顺序当完整策略或W06完成。前置变化、拒绝、UNKNOWN或期限到限停止，重启只读零重放；R7/R8 NOT_RUN | 本批提交（父cc0679c）；cc0679c、dec9005及原成果保留 | 2026-11-15：英雄领域/Service、Contract/Registry、OperationService/Workflow/History、HTTP和完整页面十文件初次1633/1634，唯一失败为既有阵容HTTP的500ms墙钟窗口在首战前耗尽；测试局部控制原Date.now并在首战响应越过期限，保留原派发次数断言，11种边界11/11及完整HTTP219/219 PASS（12.32/92.83秒），与前次重叠不相加。新切片覆盖跨品质来源不足、0与剩余专属库存、两种授权、累计预算不被收入补足、四处UNKNOWN/重启/拒绝/隔离/迟到及UI篡改/草稿变化；新成本变化夹具绑定实际成本，不因元数据版本变化收紧原逐批合同。四源语法通过；仅离线Codec/合成传输，REAL_UNVERIFIED |
| W07 PARTIAL | 原装备/徽章/专武、零费首级、Pet FEED及服役单级LEVEL保留。本批BIZ-R07复用原Forge Adapter/Contract/Service/API/专业页及Workflow：完整闲置背包＋在产队列统计部位（不计佩戴），稳定同量顺序，在明确makeIds内按品质与自有材料选择一份；冻结配方和数量/队列护栏，原批次确认PICK后才MAKE，共享父预算和持久历史；准备不执行、不授权 | 4046f04原BIZ-R07普通材料单厂准备已交；通用材料扣取局部冻结。W11/C144定点纠正已收口，关卡ID不等于同次结算身份；下一原W16/BIZ-R10见§12.4，不重复已交成长 | 通用材料资格总量不证明实际扣取顺序/混用分摊；C227/C230成长转移、旧物及返还合同、C228上限、专武未激活及Pet培育/成熟目标原缺证保留。执行不动态换配方，缺/变队列或数量、拒绝和UNKNOWN均停止；W07仍PARTIAL，R7/R8 NOT_RUN | 4046f04；8c52423及原b2a0f56/88fd646/42a85e7保留 | 2026-11-15：equipment-forge/function-contracts/function-registry/gameplay-api/farm-forge-full-page/operation-service/workflow/workflow-execution-history/run-budget-service/execution-memory-service十文件1834/1834 PASS，0 fail/cancel/skip/todo，97.34秒。含固定真实离线配置与Codec、实际回环HTTP、完整PAGE、精确计数/品质/成本/旧批次、父预算不足零制造、拒绝或UNKNOWN零后续写、磁盘重建Service零重放和五维/配置/编辑器迟到隔离。首跑暴露页面作用域及调用白名单遗漏，均修复；配置变更用真实配置引用校验，代次测试保留新owner。仅离线合成，REAL_UNVERIFIED；原1560项为上批历史，不累计 |

| W08 PARTIAL | 原确认战败、单模板与69bb0bd有限候选保留。新增明确OBSERVED_WIN_RATE/minSamples：复用原有界History，按同账号/角色/世界/关卡、相同已观察队伍资料与对手、精确候选站位的胜率排序，同率保留输入顺序，先排序全部明确候选再按总开战数截断。原Service/API/页面准备→原Formation保存/复读→单次Stage/有限DAG/父预算与历史；不新增调度器。来源统计摘要随原图落盘，重启只读 | 原剩余范围及具体缺证保留；本轮统一下一项见§12.4，已交子集不重复施工 | 每候选匹配样本不足只阻塞本次统计图，不以未知补零、不自动开战采样；未观察属性、成长与随机未知，不能保证未来更优。其他模式SIDE/次数/归属及远征恢复原缺证保留；W08 PARTIAL，R7/R8未执行 | 本批提交（父ad34094）；69bb0bd、8f247c7、6466ac2及原成果保留 | 2026-11-15：stage-history/Formation/Stage Function与Runner/Protocol/formation、Service、Workflow/执行历史/History、stages-view及实际本地HTTP十二文件980/980 PASS，0 fail/cancel/skip/todo，81.18秒。覆盖精确胜率/同率/截断、不同账号角色世界关卡/对手/成长/宠物/位置排除、缺样本/重复冲突/损坏历史、来源防篡改/迟到、UI最少样本与草稿、有限授权胜利/确认战败/UNKNOWN停止、磁盘只读和旧许可零重放。首轮新增恢复测试误以为删除授权审计，已改核原resumable=false审计及不可重用，原断言和生产合同保留。四源语法/diff通过，REAL_UNVERIFIED |

R7、R8 均未执行，新增能力仍为 REAL_UNVERIFIED；R8 维持 R7 后的独立真实操作授权。

| 目标/阶段 | 当前状态 | 判定边界 |
|---|---|---|
| COMPLETE_CRAZYWATER_PLATFORM_R1_R8 | ACTIVE；完整交付未满足 | 2026-11-15 Goal工具已确认；原目标、范围及编号不变，继续原DAG |
| M0–M15 | 16/16保留；全部PARTIAL | §6逐模块表；子能力可用不等于整个模块完成 |
| 原95C | 95/95保留；53 EXISTING_FUNCTION / 38 PARTIAL / 4 PROTOCOL_ONLY | §5及5.1；Function状态不等于API/UI/Workflow或真实通过 |
| 原42P | 42/42保留；10 EXISTING_UI / 31 PARTIAL / 1 EXCLUDE | §6.1；P5-3依D6硬拒钻石；已有界面不等于完整业务完成 |
| 原8S | 8/8保留；各自已有有限实现及剩余边界 | §6.2；本地日历/具名WAIT不证明游戏日界，重启不续权 |
| 原273 Inventory | 273/273保留；188 EXISTING_FUNCTION / 75 PARTIAL / 10 PROTOCOL_ONLY | 附录A；PLT43/DEX9/DAT48/BIZ116/ORD22/STG17/FRM8/PRO10，与95C不相加 |
| R1 | PARTIAL | 公共保护/合同子集已有；来源资产及完整原DoD未闭合 |
| R2 | PARTIAL | 核心业务和成长子集已有；剩余领域缺口按W/C冻结 |
| R3 | PARTIAL | 联盟/Museum/扫荡/日常子集已有；原完整范围未齐 |
| R4 | PARTIAL | 钓鱼/舰队/活动/贸易部分已有；复杂结算及完整业务缺 |
| R5 | PARTIAL | Workflow/记忆/有限调度已有；全入口与权威策略未齐 |
| R6 | PARTIAL | 专业API/UI持续集成；42P和全业务冻结条件未满足 |
| R7 | NOT_RUN | 全范围完成冻结后统一回归；历史局部测试不代替 |
| R8 | NOT_RUN / 待单独授权 | R7后E01–E24具体账号/请求/次数/预算/风险/清理清单 |

## 1. 结论、计数与范围

保留原Master的M0–M15，共 **16个工程产品模块（12个直接玩法模块+4个平台/整合模块）**；同时保留Inventory的18个业务域视图，二者是归并关系。原始表有 **95项Cxxx、42项Pxxx、8类Sx**；baseline补齐D1–D9。Inventory有 **273个唯一条目**：PLT43、DEX9、DAT48、BIZ116、ORD22、STG17、FRM8、PRO10。273含细粒度子能力、别名、参考实现和非C扩展，不与95相加。

95项Function按当前源码分类：**EXISTING_FUNCTION 53，PARTIAL 38，PROTOCOL_ONLY 4**，清单见5.1。EXISTING_FUNCTION仅指行内范围的函数存在，不表示API/UI/Workflow/真实验收全完成；C409以D6硬拒绝实现需求。附录A保留全部273项ID及交付边界。

1536835文档对齐使用源码fc68c50；其前批fetch的fd7e0b4为当时本地祖先。当前工作基线见§2及顶部W行。原目标范围未完成，按原依赖DAG继续。PHASE1–4及附录B/C/D均为各自标注版本的历史证据，不覆盖本文件当前表。

后续拆成 **6个开发阶段R1–R6、统一离线回归R7、统一真实E2E R8，共8阶段**；工程工作包共22个；最终真实验收为24组E01–E24。模块、工作包、阶段、场景组不混算。开发期间连续推进依赖已满足的工作，仅证据确实缺失或最终真实操作授权时停相关分支，不按页面逐项等真实验收。

## 2. 实际Git基线与保护

| 核对项 | 本轮实际结果 |
|---|---|
| 开发根目录 | //zhangnas/app/crazywaterword；初始aibot-crazywaterword为另一仓库，不在其中施工 |
| 分支/HEAD | codex/phase-4-alliance-integration / 10d0d951fac94506855749ef5a44f6c7dccb9d15（文档核对起点）；a93acb8后7个业务/集成提交已保留；不修改main |
| 远端关系 | 2026-11-15安全fetch确认origin/codex/phase-4-alliance-integration=1861eca3e24b41da0b7a23692d16c1c2a786bba2，为10d0d95祖先；核对起点本地领先11、落后0，无分叉；本次文档提交另计，未push/merge |
| 工作区 | 已提交源码以10d0d95为准。保留src/farm-operations.mjs收取→再播种在途差异：仅领域草稿，未完成图生成、Service私有历史注入、Contract/API/UI及测试，不能把接受参数当作组合可用。5份原始输入仍未跟踪、未暂存；本轮仅提交README、PHASE4说明与本路线图，不读真实账号/Token、不连接游戏 |
| 历史/权限 | PHASE1–4原提交和证据保留；允许离线施工与本地提交；push/merge/reset/rebase/clean及真实游戏操作仍未授权 |
| 目录约束 | 沿用既有src/tests/tools/docs/data/work；不新建仓库、worktree、目录或报告 |

## 3. 原Master阶段对账

原Master PHASE0–9与M0–M15、R1–R8是不同索引，均保留。历史报告的局部DONE不代表本版本最终验收。当前模块逐项见§6；原始输入与历史验收保持原文。

| 原阶段 | 当前源码核对结果 | 原路线图处理 |
|---|---|---|
| 0 Baseline/Mapping | 原编号完整，当前表重核95C/42P/8S/273Inventory | 保留原文与唯一进度基线 |
| 1 Shared Safety | Writer所有权、父预算、持久拒绝/UNKNOWN及有限恢复已接；通用冷却/日界来源未闭合 | R1已交付子集保留，具体缺证局部冻结 |
| 2 City/Production/Orders | 受控写、基础金币预览、单田收种及生产投影已有；全天量/最终金币/免费刷新缺 | R2继续补缺，R8真实验收 |
| 3 Formation/Battle | 极限来源复制、具名整队、图纸解锁、Stage逐场持久历史已有；全模式与自动换阵未全 | R2继续原剩余项 |
| 4 Alliance | 成员/订单/福利/科技单升/Fort/商船补货和船长已有；帮助求助及科技重置缺 | R3具体缺证操作冻结 |
| 5 Fleet/CityWar | 编队/维修/移动/港口/有界观察已有；攻击/加速/跨视野跟随未全 | R4继续 |
| 6 Museum/Secondary | Museum出发/缺料、古董成长、精确扫荡、钓鱼只读已有；结算身份/奖励/捕鱼缺 | R3/R4继续 |
| 7 Activities/Trade | 任务/邮件/免费招募点金/试炼/部分周活动及贸易单步写已有；完整周期/活动/贸易策略缺 | R3/R4继续 |
| 8 Workflow | 26静态模块+Stage、父预算、持久记忆、有限日周与可信事件、原生拖拽已有；全目录/全策略来源未闭合 | W19提前推进，R5继续 |
| 9 Integration/Release | 专业API/UI与定向测试持续集成；全范围未冻结，R7/R8 NOT_RUN | R6→R7→R8；不反复执行最终验收 |

离线连续开发已有Owner授权；不再按每功能人工审批。真实操作仍须在R7后提交E01–E24具体账号/请求/次数/预算/风险/清理范围，单独授权。

## 4. PHASE1–3核验与历史证据

### 4.1 PHASE1源码确认

CLI createCliOutput/loadCliCredential（cli-safety.mjs:8/49）、security.redact:18实际接入，app.act:364先拒无预算消费后才读账号。ACTIONS/buildBody:324规范化repeated；assertPaymentAllowed:277对RUBY/付费/成本未知硬拒，allowPaid无豁免。ResourceLedger:52原子预留、validateResources:84写前重读且保留已花预算。execution.mjs保护逐步取消/可中断等待/UNKNOWN与RATE_LIMITED；client.request:211/sendWatch:266维护lateResponses/promptUncertain/uncertainWrites。静默窗口仅UNKNOWN，停止不能撤销已派请求。

对应现有测试：cli-safety、actions-safety、resource-budget、dailies-safety、dailies-state-reliability、execution-lifecycle、client-lifecycle、client-unverified-write。旧执行器仍未全部具有权威效果确认/持久History，不重复宣称全平台闭环。

### 4.2 PHASE2源码确认

surveyOrderExecution/planOrderExecution/executeOrderOperation（order-execution.mjs:92/104/146）绑定精确订单身份，SUBMIT复读旧单替换且完成数+1；proofFor:52生产缺可靠免费证明则REFRESH不派。surveyCityOperations/planCityOperations/executeCityAction（city-operations.mjs:38/167/221）复用surveyWorld/planWorld/runWorld，写前复核和写后效果验证实际存在。组合规划共用Ledger，单批执行共用budget。

createOperationService:32/170/179绑定账号/代次/客户端/5分钟计划/哈希/动作顺序/预算/规则配置，permit单次。createExecutionHistory:16/43写DISPATCHING→fsync/原子rename→执行→结果保存后才下一条；坏版本/损坏fail-closed。异常退出未决保持UNKNOWN，当前无权威解除入口。C124金币、C126免费刷新、C112完整日产量尚缺；未知地图槽位/成本/队列不产生可写候选。production-report.mjs:36明确tool-verified-only及totalGameProduction=null。

### 4.3 离线历史版本

| 历史记录 | 对应版本 | 历史结果（本轮未重跑） |
|---|---|---|
| Inventory基线 | 61ce3c0 | 29组selftest+370 Node |
| PHASE1 | da41d1c | 29+459 Node |
| PHASE2 | 9d97065，含972f81a/52b7824 | 29+609 Node，原459保留、新增150 |
| PHASE3 | f300a35实现/测试树；a505019仅文档记录 | 29+845 Node，原609保留、新增236，Node0失败/跳过/取消 |

selftest素材检查按原条件跳过，与Node0skip分开。本轮仅读测试及离线协议目录，不运行完整测试。未来源码变动后以上不自动变成新HEAD的PASS。

### 4.4 真实历史的精确边界

| 证据 | 可确认历史 | 不能外推 |
|---|---|---|
| work/e2e/20261110-real/run-2026-11-10T08-21-23-670Z-88bbe383/report.md | 旧main@4094a69+当时未提交工作树，48/48查询、137关单挑战；相关成果后纳61ce3c0 | Git HEAD不等于当时完整工作树；无独立画面交叉核验；不是a505019全平台验收 |
| work/e2e/20261110-b1/report.md | 主线LEFT映射获批；一次登录READY | 不推广其他模式 |
| work/e2e/20261110-b2/report.md与C/C1报告 | 0挑战；后离线复现Harness禁止首次Ping并修复 | 不倒推Token失效或登录成功 |
| work/e2e/20261110-b3/run-2026-11-10T11-42-06-341Z-95483092/report.md | 156胜、157限频停止，2请求/1战斗响应、无158 | 未遇真实战败；10–11秒为B4后续离线实现，未实测 |
| docs/PHASE_2_REAL_E2E_ACCEPTANCE.md @9d97065 | 首轮两次五查询10/10、三模块只读和建设预览 | 获批升级的新鲜复查遇心跳超时；authorize/execute未调用，无permit/runId，业务写帧0；订单/建筑/生产写与真实History/UNKNOWN恢复未验；该次未跑48查询 |

client.mjs:7–9仍TICK/PING=1000ms，历史约1105ms首Pong未处理只有单样本。先补脱敏时序/事件循环观测，不直接调大超时、重写Client、换Token或自动重连。
### 4.5 PHASE3七域的当前复用边界

| 域 | 当前已实现子集 | 剩余边界 |
|---|---|---|
| Formation | 完整SAVE/复读、具名整队、普通图纸解锁、极限来源复制、有限确认战败候选及主线/远征阵容子集 | 统计/规则优化与其他模式未全；W08 |
| Alliance | 精确成员/请求、订单福利、科技单升、Fort普通捐赠、商船补货和应聘船长 | 帮助/求助权威额度冷却、科技重置、收益/隐藏跨玩法占用缺；W09/W10 |
| Museum | 展陈/收益/成就/出发/道具加速/逐物品缺料，独立古董成长子集 | Complete/Reward可恢复身份与结算缺；W11 |
| Treasure | 既有Stats/List/Rank/Defence及无人防守目标派舰、精确MyFleets关联 | 派遣不证明争夺/占有/战果/领奖；W14，不并入Museum |
| Fleet | 编队/维修模式阈值预算优先序/停止维修/移动/港口及专业缺货；明确自有资源田放弃 | 非零pet绑定、攻击宣战/结果、非premium加速、资源田占领及在线奖未全；W05/W14 |
| Naval Rules | 有界WorldInfo精确筛选、三值规则、同查询规则响应哈希比较 | CURRENT_RESPONSE_ONLY非全图持续身份；跟随/动态攻击缺；W15 |
| Workflow | 原生拖拽/有限DAG/父预算/run授权、持久图/历史/记忆、有限日周/可信事件和三类具名WAIT | 全业务目录/入口及权威cooldown/gameDay来源未闭合；W19/W20/W21 |

当前证据以§5/6及附录A的源码和测试索引为准；附录B和PHASE3报告保留a505019历史快照，不把旧缺口重新当待建架构，也不将新增离线能力标为真实验收。

## 5. 原始95项需求账本（独立维度）

以下每行保留原C编号和原能力名。Function四类互斥；Protocol为已确认编码类型/调用语义证据，BLOCKED_EVIDENCE另列。profile不是总体评级：它仅把重复的12维检查值展开到每行，局部覆盖以备注为准。EXISTING_UI只表示声明范围已有界面；通用JSON页不算专业业务页全部完成。N/A是该只读能力不需要消费/授权执行基础，不等于缺失。

| Profile | 调用者 / GameClient / API / UI（2–5） | 权限（6） | Ledger / Service / History（7–9） | 生命周期（10） | 离线 / 真实（11–12） |
|---|---|---|---|---|---|
| T 平台/底座 | 原server/app/Client及本地账号与工具，精确API；行内范围 | 账号校验/脱敏/原安全合同，非任意请求授权 | 本地工具N/A；所有者和持久存储按实际模块；非独立业务账本 | 连接/代次/迟到/所有者fence；传输不证明业务成功 | 行内tests；本批仅文档校验；当前REAL_UNVERIFIED |
| R 只读/纯计算 | 原Collector/survey/缓存及专业只读区；浏览缓存零请求 | 账号scope/来源/可靠性/时效，无写许可 | 只读N/A；Service可管理survey，不是写历史 | 失败/缺失保持UNKNOWN，不伪装零或成功 | 行内读tests；历史真实仅§4.4，当前REAL_UNVERIFIED |
| G 注册/共享业务 | 原Registry→Adapter→Service/Executor→GameClient；原API/专业页 | 精确参数/身份/Origin/CSRF/计划哈希/单次或有限run授权/D6 | 原Ledger及父资源/配额/typed UID预算、Service、ExecutionHistory/WorkflowHistory/拒绝记忆；survey不消费写预算 | 写前持久化、独立复读、取消/迟到/UNKNOWN零重放；有限恢复见W01 | 行内领域和共享tests仅证明已实现分支；当前REAL_UNVERIFIED |
| L 本地规划/投影 | 原订单/生产纯计算及本地配置；原API/专业页 | 精确账号/结构及配置来源，预测值非服务端事实 | 规划可引用原Ledger；无独立游戏写，N/A不表示执行完成 | 缺失保守，不补库存或推定全天覆盖 | 行内算法tests；不代表真实最终奖励/全天量 |
| S Stage/战报 | 原StageRunner或有限Stage Function/只读战报；原API/UI/首败开关 | READY/精确账号/Origin/CSRF/所有者/互斥/主线LEFT/未决/授权 | 空成本；Function接原Service/父预算；原stage-history逐场持久，战报读N/A | runId/generation/取消/限频/迟到；重启只读，不恢复战斗许可 | 原Stage/历史tests；历史137关、156胜/157限频限定§4.4；当前REAL_UNVERIFIED |
| B 禁止消费 | 原Action/Service/Registry拒绝路径，无允许钻石消费UI | D6不可override，Owner授权不放宽 | 派发前拒绝，无正向消费成功账本 | NOT_EXECUTED不伪造UNKNOWN | 原D6负向tests；正向消费EXCLUDE，不做真实尝试 |

第1维为行内Function状态，2–12维按本表与源码/边界合读。源码与tests是当前索引，不表示本轮重新运行；已有结果以顶部W对应提交记录为准，不累计。a93acb8文档批仅做静态对账；源码增量的定向回归单独记录，不能把工作树通过当已提交基线或R7通过。当前真实验收未执行，协议、注册或离线通过不等于完整业务/真实通过。

| C ID | 原能力 | Function | Profile | Protocol/外证 | 当前Function与源码 | 缺口/边界 | 工作包 |
|---|---|---|---|---|---|---|---|
| C001 | 凭证→Session 建立 | EXISTING_FUNCTION | T | 当前有限范围已核；最终未验 | src/server.mjs；tests/server-runtime.test.mjs | 唯一Console所有权、显式Session/凭证校验及脱敏；扫码捕获仍走独立授权CLI | W03 |
| C002 | 账号隔离 | EXISTING_FUNCTION | T | 当前有限范围已核；最终未验 | src/server.mjs；tests/server-runtime.test.mjs | 账号/角色/世界/连接/代次隔离和旧回调保护；选择账号不隐式登录 | W01 |
| C003 | 世界/区服切换 | PARTIAL | T | 当前有限范围已核；最终未验 | src/server.mjs；tests/server-runtime.test.mjs | 原列表/分组精确角色与区服int64、五维会话复核及原busy锁只读修复已有；独立CLI写在读凭证前拒绝、网页enter403，现存角色实际切换及恢复合同未全 | W03 |
| C004 | 状态采集（只读） | EXISTING_FUNCTION | R | 当前有限范围已核；最终未验 | src/game.mjs；tests/data-catalog.test.mjs | 固定48查询、28解析/20原始；缓存与显式刷新分离，扩展调查不计入48 | W03 |
| C005 | 协议调用（通用） | EXISTING_FUNCTION | T | 当前有限范围已核；最终未验 | src/client.mjs；tests/client-lifecycle.test.mjs | 请求关联、ACK及迟到隔离；协议可调用不授予任意Request写权限 | W01 |
| C101 | 建筑信息读取 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/city-operations.mjs；tests/city-operations.test.mjs | 建筑信息与业务页面已有 | W04 |
| C102 | 建筑升级前置校验 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/city-operations.mjs；tests/city-operations.test.mjs | 材料/等级/人口/队列前检已有；未知不计划 | W04 |
| C103 | 建筑升级执行 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/city-operations.mjs；tests/city-operations.test.mjs | 升级授权与权威复读已有，真实未验 | W04 |
| C104 | 建造执行 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/city-operations.mjs；tests/city-operations.test.mjs | 仅服务端已有level0槽；不是任意地图新坐标建造 | W04 |
| C111 | 工厂状态读取 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | 工厂/队列/空位/成品可靠性已有 | W04 |
| C112 | 生产报表聚合 | PARTIAL | L | 当前有限范围已核；最终未验 | src/production-report.mjs；src/operation-service.mjs；src/page.mjs；tests/production-report.test.mjs；tests/operations-view.test.mjs | 原Service.history→GET /api/operations/history.dailyReport→原历史页已接，按本地日历汇总工具确认收取；coverage=tool-verified-only，fullDayCoverage=false，totalGameProduction=null，游戏全天量/权威日界未闭合，不重复开发已有接线 | W04 |
| C113 | 库存缺口计算 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | 订单优先缺口、在产/成品抵扣及共享库存；收入不自动扩额 | W04 |
| C114 | 自动生产决策 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | 原排产及种子/过剩作物水位接入生产策略，缺配置不推测数量 | W04 |
| C115 | 生产提交执行 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | registered production复用原city链、共享预算、写前调查和写后复读 | W04 |
| C116 | 成品收取/竣工 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | 工厂成品与竣工受控执行；原生批量农田结算另有缺证 | W04 |
| C121 | 居民需求读取 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/order-execution.mjs；tests/order-execution.test.mjs | 需求源OnWater，缺数组不是权威空 | W04 |
| C122 | 需求物品解析 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/order-execution.mjs；tests/order-execution.test.mjs | 物品ID/安全数量解析已有 | W04 |
| C123 | 订单库存缺口 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/order-execution.mjs；tests/order-execution.test.mjs | 跨订单预算分配已有，不把独立模拟当批量预留 | W04 |
| C124 | 订单奖励计算 | PARTIAL | L | 当前有限范围已核；最终未验 | src/order-rewards.mjs；tests/order-rewards.test.mjs | 经验和已证基础金币预览已有；最终金币倍率/结算公式缺证 | W04 |
| C125 | 订单规则评估 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/order-execution.mjs；tests/order-execution.test.mjs | 规则/三值评估/库存复查已有；免费刷新资格缺证继续冻结 | W04 |
| C126 | 订单提交执行 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/order-execution.mjs；tests/order-execution.test.mjs | 明确单单提交已受控并独立确认订单替换及完成数；免费刷新另行缺证 | W04 |
| C127 | 规则持久化 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/order-execution.mjs；tests/order-execution.test.mjs | 精确账号原子保存及坏文件保护已有 | W03 |
| C128 | 执行历史记录 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/order-execution.mjs；tests/order-execution.test.mjs | 原History持久化、run/batch/action查询及未决保守保护 | W01 |
| C131 | 港口货物读取 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/fleet.mjs；tests/fleet.test.mjs | CargoShips读取和通用Fleet展示已有 | W05 |
| C132 | 港口缺货识别 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/fleet.mjs；tests/fleet.test.mjs | cargoShortageView逐物品缺货及专业页已有；不自动购买 | W05 |
| C133 | 提交货物执行 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/fleet.mjs；tests/fleet.test.mjs | FillCargoShip typed+精确货格filled复读已有 | W05 |
| C134 | 领取港口奖励 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/fleet.mjs；tests/fleet.test.mjs | 到港状态消费+奖励回包已有；E2E加库存核对 | W05 |
| C141 | 寻宝状态读取 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/museum.mjs；tests/museum.test.mjs | 探索次数/进度/状态可读，COMPLETE_UNSETTLED独立 | W11 |
| C142 | 寻宝缺货识别 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/museum.mjs；tests/museum.test.mjs | Museum缺料逐项明细和API/专业页已有，不证明结算资格 | W11 |
| C143 | 冒险寻宝执行 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/museum.mjs；tests/museum.test.mjs | 出发和道具加速Function存在，结算领奖另计C144 | W11 |
| C144 | 领取寻宝奖励 | PROTOCOL_ONLY | G | 当前有限范围已核；最终未验 | src/museum.mjs；tests/museum.test.mjs | Complete/Reward均需stageId；仅定位关卡，MuseumInfo缺同次结算结果、pending身份及收据，Complete响应无结算ID，BLOCKED_EVIDENCE；定向验证见W11 | W11 |
| C151 | 海面扫荡 | PARTIAL | G | 当前有限范围已核；最终未验 | src/pirate-operations.mjs；tests/pirate-operations.test.mjs | 精确UID/city单目标扫荡和配额/计次已接；奖励归属、目标变化及日界仍缺证 | W12 |
| C152 | 钓鱼 | PARTIAL | R | 当前有限范围已核；最终未验 | src/fishing-view.mjs；tests/fishing-view.test.mjs | 等级/库存/容量/图鉴门槛只读已接；DrawFishReward/GainBigFish身份与结算缺证 | W13 |
| C201 | 当前关卡读取 | EXISTING_FUNCTION | S | 当前有限范围已核；最终未验 | src/stages.mjs；tests/stage-history.test.mjs | mainlineStage当前读取已有 | W08 |
| C202 | 挑战关卡执行 | EXISTING_FUNCTION | S | 当前有限范围已核；最终未验 | src/stages.mjs；tests/stage-history.test.mjs | ChallengeStage执行已有，保持主线专属证据 | W08 |
| C203 | 战斗结果解析 | EXISTING_FUNCTION | S | 当前有限范围已核；最终未验 | src/stages.mjs；tests/stage-history.test.mjs | 严格关卡/Boolean/BT_MAINLINE/LEFT已有 | W08 |
| C204 | 关卡循环控制 | EXISTING_FUNCTION | S | 当前有限范围已核；最终未验 | src/stages.mjs；tests/stage-history.test.mjs | 有限次数/终点、胜利推进、战败停止开关、取消及倒计时已有 | W08 |
| C205 | 限频处理 | EXISTING_FUNCTION | S | 当前有限范围已核；最终未验 | src/stages.mjs；tests/stage-history.test.mjs | RATE_LIMITED独立停止；不自动重试限频或UNKNOWN | W08 |
| C206 | 敌方阵容抓取 | EXISTING_FUNCTION | S | 当前有限范围已核；最终未验 | src/stages.mjs；tests/stage-history.test.mjs | 消费已有rightTeams，不额外挑战取数据 | W08 |
| C207 | 我方阵容抓取 | EXISTING_FUNCTION | S | 当前有限范围已核；最终未验 | src/stages.mjs；tests/stage-history.test.mjs | 实际leftTeam与当前GetFormation来源分开 | W08 |
| C208 | 战斗结果分析 | EXISTING_FUNCTION | S | 当前有限范围已核；最终未验 | src/stages.mjs；tests/stage-history.test.mjs | 持久战报、同角色世界关卡差异和保守建议；缺分析保持未知 | W08 |
| C209 | 自动换阵决策 | PARTIAL | G | 当前有限范围已核；最终未验 | src/stage-history.mjs；src/workflow.mjs；src/operation-service.mjs；src/page.mjs；tests/stage-history.test.mjs；tests/gameplay-api.test.mjs；tests/stages-view.test.mjs | 原单模板、明确顺序及匹配历史胜率选择已接原DAG/逐批或有限run授权；明确最少样本、同作用域/队伍/对手/精确站位统计，胜率同率保留输入序，样本不足不生成统计图。确认同关卡战败才换阵，胜利/耗尽/到限/拒绝/UNKNOWN停止。历史启发式不保证未来更优；完整原DoD及真实验收未齐，REAL_UNVERIFIED | W08 |
| C211 | 当前阵容查询 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/formation.mjs；tests/formation.test.mjs | 主线及远征阵容分模式读取 | W08 |
| C212 | 已解锁阵型查询 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/formation.mjs；tests/formation.test.mjs | 解锁模板及图纸解锁独立Function已有 | W08 |
| C213 | 阵容保存/切换前置校验 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/formation.mjs；tests/formation.test.mjs | 归属/人数/职业/站位/宠物校验已有 | W08 |
| C214 | 阵容保存/切换执行 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/formation.mjs；tests/formation.test.mjs | 保存/应用/恢复均新计划独立复读，具名完整队伍已接 | W08 |
| C215 | 一键复制"极限通关"站位 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/extreme-formations.mjs；tests/extreme-formations-service.test.mjs | 当前关卡极限战报精确来源核验及站位准备已接；不继承开战授权 | W08 |
| C221 | 角色升级前置校验 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/hero-operations.mjs；tests/hero-service.test.mjs | 成长等级和材料前检已有，复用Ledger | W06 |
| C222 | 角色升级执行 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/hero-operations.mjs；tests/hero-service.test.mjs | 英雄单次升级经heroes/Service及英雄全池/库存复读 | W06 |
| C223 | 角色升星前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/hero-operations.mjs；tests/hero-service.test.mjs | 自有专属碎片单星、明确1:1兑换、cc0679c单英雄及本批1至12名明确顺序共享来源的单星Workflow已有；固定原星级/余额/成本及累计预算，0仅用已有专属碎片；隐式混用及完整自动策略仍冻结 | W06 |
| C224 | 技能升级前置校验/执行 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/hero-operations.mjs；tests/hero-service.test.mjs | 明确技能槽单次升级、前置及资源独立复读已接 | W06 |
| C225 | 专武等级前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/hero-operations.mjs；tests/hero-service.test.mjs | 已激活专武单次升级已接；未激活状态与激活分支缺证 | W07 |
| C226 | 专武星级前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/hero-operations.mjs；tests/hero-service.test.mjs | 已激活专武单次升星已接；未激活/其他成长分支未闭合 | W07 |
| C227 | 纹章替换前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/badge-growth.mjs；tests/badge-growth.test.mjs | 自有闲置徽章穿空槽已接；固定BadgeSelectItem明确downUid候选/upUid现有，BadgeReplaceResponse.material存在，但成长转移/旧物/返还合同缺证 | W07 |
| C228 | 纹章升级前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/badge-growth.mjs；tests/badge-growth.test.mjs | 精确经验差额单级且低于上限、红徽章单星已有；上限经验落点缺证 | W07 |
| C229 | 装备升级前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/equipment-growth.mjs；tests/equipment-growth.test.mjs | 显式配置零费首次0→1、正等级单级、红装精炼/单星已有；替换及完整成长边界仍未全 | W07 |
| C230 | 装备替换前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/equipment-growth.mjs；tests/equipment-growth.test.mjs | 自有装备穿同类空槽已接；固定EquipSelectItem明确downUid候选/upUid现有，EquipReplaceResponse.material存在，但成长转移/旧物/返还合同缺证；元数据纠正为BLOCKED_EVIDENCE | W07 |
| C301 | 联盟求助单识别 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/alliance.mjs；tests/alliance-tech.test.mjs | reqId精确绑定成员求助单，已有展示 | W09 |
| C302 | 联盟成员识别 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/alliance.mjs；tests/alliance-tech.test.mjs | 精确成员ID及专业列表已有 | W09 |
| C303 | 按成员捐赠前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/alliance.mjs；tests/alliance-tech.test.mjs | 按成员帮助规则有；服务端总额度/冷却缺证，不生成可执行help | W09 |
| C304 | 按物品捐赠前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/alliance.mjs；tests/alliance-tech.test.mjs | 按物品帮助共用原合同，不把本地历史当服务端额度 | W09 |
| C305 | 自动求助前置校验/执行 | PROTOCOL_ONLY | G | 当前有限范围已核；最终未验 | src/alliance.mjs；tests/alliance-tech.test.mjs | 求助阈值/日限/冷却与结算缺证，无ask写合同 | W09 |
| C306 | 联盟科技状态读取 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/alliance.mjs；tests/alliance-tech.test.mjs | 赛季科技状态、前置及专业树展示已有 | W10 |
| C307 | 联盟科技升级前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/alliance.mjs；tests/alliance-tech.test.mjs | 单级科技升级及精确扣点复读已接；原范围科技重置尚缺完整合同 | W10 |
| C401 | 舰队编组读取 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/fleet.mjs；tests/fleet.test.mjs | MyFleets+OnWater队伍读取已有，不用MyFleets代替阵容复读 | W14 |
| C402 | 舰队编组修改前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/fleet.mjs；tests/fleet.test.mjs | 无非零宠物范围编组可执行；非零宠物绑定证据另列受限分支 | W14 |
| C403 | 地图目标读取 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/naval-rules.mjs；tests/naval-rules.test.mjs | WorldInfo当前视野、精确ID及资源田读取，不宣称全图完整 | W15 |
| C404 | 目标监听 | PARTIAL | G | 当前有限范围已核；最终未验 | src/naval-rules.mjs；tests/naval-rules.test.mjs | 有限Loop调查及同查询规则摘要/变化计数已有；非跨视野持续目标身份 | W15 |
| C405 | 跟随指定玩家 | PARTIAL | G | 当前有限范围已核；最终未验 | src/naval-rules.mjs；tests/naval-rules.test.mjs | 当前精确玩家筛选已有，跨视野定位/跟随事件来源缺证 | W15 |
| C406 | 攻击派遣前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/fleet.mjs；tests/fleet.test.mjs | 原移动/维修委托已有；攻击/宣战/胜负及参战归属未闭合 | W14 |
| C407 | 修船前置校验/执行 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/fleet.mjs；tests/fleet.test.mjs | 维修/停止、优先序及最大汽油预算已有；自然恢复仅观察 | W14 |
| C408 | 加速前置校验/执行 | PROTOCOL_ONLY | G | 当前有限范围已核；最终未验 | src/fleet.mjs；tests/fleet.test.mjs | SpeedUpFleet/Repair/Cargo无已证非钻石完整写候选，BLOCKED_EVIDENCE | W14 |
| C409 | 钻石使用规则评估 | EXISTING_FUNCTION | B | 当前有限范围已核；最终未验 | src/actions.mjs；tests/actions-safety.test.mjs | D6硬拒钻石/付费及开发凭证；正向消费EXCLUDE，人工授权不豁免 | W01 |
| C410 | 动态攻击决策 | PARTIAL | G | 当前有限范围已核；最终未验 | src/naval-rules.mjs；tests/naval-rules.test.mjs | 三值观察规则有，动态攻击选择与授权派遣无 | W15 |
| C501 | 活动识别 | PARTIAL | R | 当前有限范围已核；最终未验 | src/daily-checklist.mjs；tests/daily-checklist.test.mjs | 日常/周活动及私有签到推送片段可读，不构造完整活动目录 | W16 |
| C502 | 活动任务读取 | PARTIAL | R | 当前有限范围已核；最终未验 | src/daily-checklist.mjs；tests/daily-checklist.test.mjs | 主/支/成就/每日/周芯片任务观察已有；全部活动任务未闭合 | W16 |
| C503 | 活动任务执行前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/task-rewards.mjs；tests/task-rewards.test.mjs | 已证奖励及八类日常动作子集通过原Function；其他任务按具体合同冻结 | W16 |
| C511 | 邮件领取 | PARTIAL | G | 当前有限范围已核；最终未验 | src/mail.mjs；tests/mail-claim.test.mjs | 有界分页、单封读领及可结算附件已有；批量/实例附件归属缺证 | W16 |
| C512 | VIP 礼包领取 | PARTIAL | R | 当前有限范围已核；最终未验 | src/daily-checklist.mjs；tests/daily-checklist.test.mjs | VIP等级和礼包资格独立观察；真实领取资格及独立结算未闭合 | W16 |
| C513 | 商城礼包领取（日/周） | PARTIAL | G | 当前有限范围已核；最终未验 | src/task-rewards.mjs；tests/task-rewards.test.mjs | 免费日赠礼及三类周礼包已接；全部日周归属/周期未闭合 | W16 |
| C514 | 周活动补给礼包领取 | PARTIAL | G | 当前有限范围已核；最终未验 | src/task-rewards.mjs；tests/task-rewards.test.mjs | 周转盘/翻牌/芯片明确免费固定礼包已接；其他周补给合同缺证 | W17 |
| C515 | 周活动每日任务执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/task-rewards.mjs；tests/task-rewards.test.mjs | 具名周芯片任务及签到观察已有；末项换轮和其他活动日任务缺证 | W17 |
| C516 | 周活动奖励领取 | PARTIAL | G | 当前有限范围已核；最终未验 | src/task-rewards.mjs；tests/task-rewards.test.mjs | 日活跃和已证周奖励子集已有；周活跃周期归属/完整活动奖未闭合 | W17 |
| C517 | 军备竞赛奖励领取 | PROTOCOL_ONLY | R | 当前有限范围已核；最终未验 | src/daily-checklist.mjs；tests/daily-checklist.test.mjs | 原始赛季/排名只读不等于军备档位领取合同，BLOCKED_EVIDENCE | W17 |
| C521 | 海商王价格读取 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/trade.mjs；tests/trade.test.mjs | 明确当前港口价格/库存/持货/容量和可信时段；非所有目的地价格 | W18 |
| C522 | 低买高卖预期计算 | PARTIAL | G | 当前有限范围已核；最终未验 | src/trade.mjs；tests/trade.test.mjs | 单次非亏损卖出预期公式已有；跨港低买高卖完整收益策略缺证 | W18 |
| C523 | 自动买卖前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/trade.mjs；tests/trade.test.mjs | 单次买/卖及商会币成本独立复读已有；自动多段策略未完成 | W18 |
| C524 | 自动巡航 | PARTIAL | G | 当前有限范围已核；最终未验 | src/trade.mjs；tests/trade.test.mjs | Radar移动、自有道具仍未来终点加速/时钟WAIT已有；到达/补购/巡航收益缺证 | W18 |
| C601 | 只读探测（每轮首步） | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/operation-service.mjs；tests/operation-service.test.mjs | 原Registry survey及Workflow SURVEY/具名WAIT调查，无新collector | W02 |
| C602 | 计划生成 | PARTIAL | G | 当前有限范围已核；最终未验 | src/operation-service.mjs；tests/operation-service.test.mjs | 26静态玩法+server Stage具体计划及父预算；全范围业务未齐 | W02 |
| C603 | 动作执行（单条/整轮） | PARTIAL | G | 当前有限范围已核；最终未验 | src/operation-service.mjs；tests/operation-service.test.mjs | Service/Executor统一已交付写；旧Web写403/CLI独立写拒绝，未映射业务仍未交付 | W02 |
| C604 | 跨轮记忆 | PARTIAL | G | 当前有限范围已核；最终未验 | src/execution-memory.mjs；tests/execution-memory-service.test.mjs | 持久拒绝/UNKNOWN/身份变化及关联、原历史跨轮确认计数/可靠库存净变化、原批次/动作原因及后续建议分源只读摘要已有；Workflow无动作原原因/归属已接原历史及共享记忆API/页面，筛选保持原运行/节点语义，不混入动作统计；全业务策略未齐，Service cooldown/gameDay仍false | W19 |
| C605 | 顺序执行引擎 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/workflow.mjs；tests/workflow.test.mjs | 原Runner有限顺序/条件/WAIT/重复、逐批及有限run授权；未新增调度器 | W20 |
| C606 | 运行状态/历史查询 | PARTIAL | G | 当前有限范围已核；最终未验 | src/stage-history.mjs；tests/workflow-execution-history.test.mjs | run→definition/node→batch→action及Stage逐场持久历史已有；Workflow批次/记忆可精确只读打开原证据；原记忆API/页面增加跨轮计数/资源/原始原因只读摘要；Workflow无动作原reason/trace与捕获身份已进入共享记忆查询，记忆卡可精确只读打开原Workflow历史并校验原图及身份；全业务未齐 | W19 |
| C607 | Function 注册表 | PARTIAL | G | 当前有限范围已核；最终未验 | src/function-registry.mjs；tests/function-registry.test.mjs | 26静态玩法+server Stage，共27份schema/元数据；登记不等于全部分支可执行 | W02 |


G-R/G-P覆盖：C131/C141/C211/C212/C301/C302/C401/C403/C601属于只读survey/view，不消耗Ledger、不创建写许可、不记业务ExecutionHistory；C602是PLAN，使用规划预算模拟但未执行，不把其输出当执行历史。C132/C142/C209/C404/C405/C410等规划/观察子功能同理；只有真正执行的候选继承G写入路径。C606历史查询是本地读取。Function状态和相邻模块的执行底座不能互相替代。

### 5.1 可复算的需求状态清单

- EXISTING_FUNCTION（53）：C001、C002、C004、C005、C101、C102、C103、C104、C111、C113、C114、C115、C116、C121、C122、C123、C125、C126、C127、C128、C131、C132、C133、C134、C141、C142、C143、C201、C202、C203、C204、C205、C206、C207、C208、C211、C212、C213、C214、C215、C221、C222、C224、C301、C302、C306、C401、C403、C407、C409、C521、C601、C605。
- PARTIAL（38）：C003、C112、C124、C151、C152、C209、C223、C225、C226、C227、C228、C229、C230、C303、C304、C307、C402、C404、C405、C406、C410、C501、C502、C503、C511、C512、C513、C514、C515、C516、C522、C523、C524、C602、C603、C604、C606、C607。
- PROTOCOL_ONLY（4）：C144、C305、C408、C517。

Function分类描述行内范围，不是最终通过数；缺证按原W/X和行内限制。本轮文档核对仅做静态校验，测试路径不表示重跑；Museum、挂机组合及逐田种收的已有定向结果按顶部W11/W16/W04/W19对应提交引用，R7/R8均NOT_RUN。

## 6. 产品树、原业务域与三维交叉映射

以下保留Inventory的18个业务域，不将示例树当新产品定义；括号为原Master归并模块及C编号。跨域相同C只拥有一个业务Function，多页引用不复制执行链。

~~~text
CrazyWater Platform
├─01 平台与账号 [M0：C001–005]
│ ├─账号/凭证/Session/Runtime/世界区服
│ └─配置、账号切换和生命周期 [同时服务全部业务]
├─02 数据浏览/Explorer [M1：C004/C005及各领域只读C]
│ ├─48查询/28解析/20原始、可靠性、精度、来源
│ └─缓存浏览/显式刷新/导出
├─03 城市建设 [M2：C101–104]
├─04 资源与生产 [M2：C111–116；与M3/M4共享缺口]
├─05 居民订单 [M3：C121–128]
├─06 英雄养成 [M7：C221–230]
├─07 阵容/战斗编队 [M8：C206–209/C211–215]
├─08 主线闯关 [M9：C201–205；复用M8]
├─09 日常/成长任务 [M12：C502/C503/C511–517]
├─10 联盟/公会 [M10：C301/C302/C306/C307]
├─11 互助/捐赠/求助 [M10：C303–305；共用reqId与规则]
├─12 舰队/海战 [M11：C401–410]
│ ├─编队/维修/加速/委托/观察跟随/动态决策
│ └─港口货船 [M4：C131–134；实现位于Fleet，保留业务归属]
├─13 世界/资源田 [M11：C403，BIZ-W14–16非C补充]
├─14 博物馆/寻宝 [M5：C141–144；M6：C151/C152]
│ ├─Museum展陈/收益/探险：三子域，不能互相冒充完成
│ ├─海面扫荡/钓鱼 [M6；不同玩法不共享配额语义]
│ └─世界宝藏TreasureLoot [PRO-009，PHASE3已交付附加范围，非Museum]
├─15 活动/赛季 [M12：C501–503/C514–517]
├─16 招募/商店/资源 [M12的免费日常；D6排除消费]
│ └─海商王 [M13：C521–524；与港口货船不是同一玩法]
├─17 编排/调度 [M14：C601–607/S1–S8]
│ ├─静态注册/有限DAG/有界重复调度/运行面板/记忆与历史
│ └─跨业务组合复用OperationService；同账号单写
└─18 其他支撑 [M15：GameClient/Action/Ledger/授权/历史/取消/恢复/工具]
~~~

原Master模块一览：M0 Platform Runtime；M1 Data Center；M2 City & Production；M3 Resident Orders；M4 Port & Trade Cargo；M5 Museum & Exploration；M6 Sea Sweep & Fishing；M7 Hero Growth；M8 Formation & Battle Analysis；M9 Mainline Automation；M10 Alliance；M11 Fleet & City War；M12 Activities & Dailies；M13 Trade King；M14 Workflow & Scheduler；M15 Shared Execution Services。M1按读模型跨模块引用C，不重复计需求。

当前16模块状态如下；PARTIAL覆盖完整原范围，已实现子集的离线证据不等于最终产品完成。接线列只说明已有允许子集，测试列是实际文件索引，不表示本轮重跑或完整模块通过；已有定向结果按顶部W行与对应提交引用，本轮文档核对不重新执行或累加。各模块本版本真实验收均未执行（历史精确边界见§4.4）。

| 模块 | 原名称 | 状态 | 工作包 | 当前范围与剩余边界 | 现有API/UI/Workflow接线 | 对应测试/真实边界 |
|---|---|---|---|---|---|---|
| M0 | Platform Runtime | PARTIAL | W01/W03 | 账号/连接/所有权、显式仅新增本地导入及来源检查已有；扫码产品链、地图来源与资产缺口保留 | 原账号/区服API与账号页；导入仅本地新增，enter写403；Runtime不以Workflow恢复连接 | tests/server-runtime.test.mjs；当前真实未验 |
| M1 | Data Center | PARTIAL | W03 | 48查询（28解析/20原始）、可靠性与钓鱼解析已有；全业务完整读模型未闭合 | 原GET /api/data-explorer、缓存总览/Explorer；领域SURVEY与缓存分开 | tests/explorer-api.test.mjs；当前真实未验 |
| M2 | City & Production | PARTIAL | W04 | 建筑/生产/单田种收及明确多田有限顺序种收准备、水位与委任投影已有；完整全天量及批量协议结算缺 | 原city/production/farm Function→Service；城市/生产/农田专业页及有限Workflow、逐田种收准备API | tests/city-operations.test.mjs；当前真实未验 |
| M3 | Resident Orders | PARTIAL | W04 | 规则/提交/库存/基础金币预览已有；最终金币公式与免费刷新额度缺 | 原Orders Function、规则API及订单页；Tasks/Loop订单只读调查接SURVEY，提交另授权 | tests/order-execution.test.mjs；当前真实未验 |
| M4 | Port & Trade Cargo | PARTIAL | W05 | 港口装货/到港领取/专业缺货已有；完整原港口范围仍受D6及证据限制 | 原Fleet货舱Function/API/专业缺货页；有限Dailies装货不推导任务完成 | tests/fleet.test.mjs；当前真实未验 |
| M5 | Museum & Exploration | PARTIAL | W11 | 展陈/收益/出发/缺料及古董成长已有；探索完成/领奖可恢复身份缺 | 原museum/antique-growth Function、API与专业页/有限Workflow；Complete/Reward禁用 | tests/museum.test.mjs；限定定向验证见W11，当前真实未验 |
| M6 | Sea Sweep & Fishing | PARTIAL | W12/W13 | 精确目标扫荡与钓鱼只读已有；奖励归属/日界/钓鱼领取及收线缺 | 原pirate-sweep Function与精确城市UID表单接有限图；Fishing页/Explorer仅只读 | tests/pirate-operations.test.mjs、tests/fishing-view.test.mjs；当前真实未验 |
| M7 | Hero Growth | PARTIAL | W06/W07 | 等级/星/技能、明确碎片及有限单/多英雄单星组合、装备/徽章/专武子集、Pet投喂与服役单级LEVEL、锻造明确配方数量准备已有；替换/激活/培育及成熟领取等缺 | 原heroes/star/prepare与equipment-forge/prepare、专业成长页；Pet LEVEL沿原参数、Service/Workflow | tests/pet-operations.test.mjs、tests/equipment-forge.test.mjs；8c52423/4046f04定向证据见W07，当前真实未验 |
| M8 | Formation & Battle Analysis | PARTIAL | W08 | 整队预设/普通解锁/极限复制/战报、有限顺序与历史胜率换阵已有；完整原DoD、所有模式及真实验收未齐 | 原Formation保存/极限来源/推荐prepare、阵容页及有限候选图；统计选择不自动开战采样 | tests/formation.test.mjs；当前真实未验 |
| M9 | Mainline Automation | PARTIAL | W08/W19 | Stage门控/逐场持久历史、有限Function及确认战败候选分支已离线实现；真实间隔和战败分支未验 | 原Stage API/专业页/Runner及有限Stage Function；逐场History和确认战败分支 | tests/stage-history.test.mjs；历史真实仅§4.4限定，当前未验 |
| M10 | Alliance | PARTIAL | W09/W10 | 订单/福利/科技单升/Fort/商船补货与船长已有；帮助/求助/科技重置缺 | 原Alliance/Tech/Fort Function、API与成员/科技/商船页，允许子集接原有限图 | tests/alliance.test.mjs、tests/alliance-tech.test.mjs；当前真实未验 |
| M11 | Fleet & City War | PARTIAL | W14/W15 | 编队/维修/移动/港口、有界响应比较及明确自有资源田放弃已有；攻击/加速/跟随/资源田占领合同缺 | 原Fleet/Naval Function、API及舰队/有界观察页；有限Loop SURVEY，放弃目标单独授权 | tests/fleet.test.mjs；当前真实未验 |
| M12 | Activities & Dailies | PARTIAL | W16/W17 | 具名任务、邮件、免费招募点金/试炼、部分周奖励、明确普通挂机物品/徽章收益及其后明确1/5/10级升级已有；有限收益→升级准备/API/UI已接原Workflow；VIP/周期/订单档及其他实例收益仍缺 | 原task-rewards/mail/afk-level-rewards等Function；Tasks/Dailies页转原Workflow，资格与执行分开 | tests/task-rewards.test.mjs、tests/mail-claim.test.mjs、tests/afk-level-rewards.test.mjs；当前真实未验 |
| M13 | Trade King | PARTIAL | W18 | 当前港报价/精确买卖移动/自有加速及时钟等待已有；目的地报价、策略、到达收益缺 | 原Trade Function/API/专业页与同航段WAIT；目的港报价及多段策略未接 | tests/trade.test.mjs；当前真实未验 |
| M14 | Workflow & Scheduler | PARTIAL | W19/W20 | 统一Tasks/Dailies/有限Loop、原生图、父预算/持久历史/有限日周事件已有；全入口覆盖与权威策略未全 | 原workflows/prepare→Registry/Service；Tasks/Dailies/有限Loop、原生图及历史/记忆页已有 | tests/workflow.test.mjs、tests/execution-memory-service.test.mjs；当前真实未验 |
| M15 | Shared Execution Services | PARTIAL | W01/W02/W19/W22 | 原Service/Executor/Ledger/History/Registry复用；恢复仅原连接零成本阵容或未派发证明，不是通用恢复 | 原Service/Executor/Ledger/History/Registry/Contract共用；授权/预算/UNKNOWN不另建 | tests/operation-service.test.mjs、tests/gameplay-api.test.mjs；当前真实未验 |

### 6.1 全部42项Pxxx

| P ID | 原页面/面板 | 当前UI维度 | 需求/施工 |
|---|---|---|---|
| P0-1 | 账号列表/扫码添加 | PARTIAL：账号列表及显式仅新增普通凭证导入已有，同源确认/重复拒绝/独立本地读取；扫码隐藏且捕获路由403，未覆盖原完整登录产品链 | C001/C002；W03 |
| P0-2 | 账号配置 | PARTIAL：账号独立模块/规则/生产/预算配置已有；未覆盖全业务 | C002；W03/W21 |
| P1-1 | 数据中心总览 | EXISTING_UI：只读缓存总览/可靠性及显式刷新 | C004；W03 |
| P1-2 | 建筑生产 | PARTIAL：队列/工具内生产历史日报已有；游戏完整全天图表缺 | C101/C111/C112；W04 |
| P1-3 | 英雄阵容 | EXISTING_UI：英雄预览与独立阵容页，完整写范围另见P3 | C211/C212；W06/W08 |
| P1-4 | 舰队地图 | PARTIAL：Fleet/有界世界观察已有；完整地图来源及业务地图缺 | C401/C403；W14/W15 |
| P1-5 | 活动联盟 | PARTIAL：联盟成员/科技/订单/商船已有；活动完整聚合缺 | C301/C501；W09/W16 |
| P1-6 | 原始响应浏览器 | EXISTING_UI：48查询，28解析/20原始；原27口径仅历史 | C004/C005；W03 |
| P2-1 | 建筑管理 | EXISTING_UI：槽位/候选/原因及受控建造升级加速 | C101–104；W04 |
| P2-2 | 资源生产 | PARTIAL：队列/策略/委任减时/水位/材料包/单田种收及有限逐田种收准备已有；完整全天及批量协议结算缺 | C111–116；W04 |
| P2-3 | 居民规则编辑 | EXISTING_UI：原规则编辑/排序/账号保存及明确本地时窗、观察计数阈值 | C125/C127；W04 |
| P2-4 | 居民订单预览 | EXISTING_UI：需求/库存/规则/基础金币及缓存生产等待投影；最终金币未知，投影不代表到账或刷新资格 | C121–125；W04 |
| P2-5 | 居民订单执行 | PARTIAL：提交与持久历史已有；免费刷新执行缺权威额度 | C126/C128；W04 |
| P2-6 | 贸易港口 | PARTIAL：专业货舱/缺货明细、装货和到港领取已有；其他原范围受D6/证据限制 | C131–134；W05 |
| P2-7 | 博物馆寻宝 | PARTIAL：缺料/出发、古董属性与成长已有；探索完成/领奖缺身份 | C141–144；W11 |
| P2-8 | 海面扫荡 | PARTIAL：专业扫荡页有明确城市/UID/配额/单次计划；奖励与日界未闭合 | C151；W12 |
| P2-9 | 钓鱼 | PARTIAL：专业只读钓鱼等级/库存/容量/图鉴已有；领取/捕鱼缺合同 | C152；W13 |
| P3-1 | 主线运行 | EXISTING_UI：运行/倒计时/首败停止开关/持久历史已有；真实验证另记 | C201/C204/C205；W08 |
| P3-2 | 阵容对比 | EXISTING_UI：原战报details与阵容比较 | C206/C207；W08 |
| P3-3 | 战斗分析 | EXISTING_UI：保守统计及同角色/世界/关卡持久历史比较；缺分析保持未知 | C208；W08 |
| P3-4 | 自动换阵 | PARTIAL：明确顺序及匹配历史胜率选择、确认战败换阵和原有限授权已接；缺样本不补造，完整原DoD与真实验收未全 | C209；W08 |
| P3-5 | 阵容管理 | PARTIAL：完整队伍预设/普通图纸解锁/极限来源复制已有；其他模式未全 | C211–215；W08 |
| P3-6 | 英雄列表 | PARTIAL：英雄/专武/纹章/装备/锻造/Pet子区已有；原完整成长分支未全 | C221–230；W06/W07 |
| P3-7 | 英雄操作 | PARTIAL：升级/升星/技能/明确碎片兑换与单/多英雄顺序单星组合及成长子集接统一计划授权，装备显式首次0→1沿原表单；替换等冻结 | C221–230；W06/W07 |
| P4-1 | 联盟成员/求助单 | EXISTING_UI：精确玩家/请求/订单/福利及商船明细 | C301/C302；W09 |
| P4-2 | 捐赠配置 | PARTIAL：member/item规则和Fort捐赠已有；互助额度/冷却缺源 | C303/C304；W09 |
| P4-3 | 自动求助配置 | PARTIAL：原求助配置保留；无权威阈值/额度/冷却，不产可执行候选 | C305；W09 |
| P4-4 | 联盟科技 | PARTIAL：科技投影/单级成本/单次升级已有；科技重置未接 | C306/C307；W10 |
| P5-1 | 舰队编组 | PARTIAL：专业舰队编组、维修模式/顺序和明确移动已有；全原范围未全 | C401/C402；W14 |
| P5-2 | 城战委托单船 | PARTIAL：维修/移动已有；攻击与舰队道具加速缺权威合同 | C406–408；W14 |
| P5-3 | 钻石规则 | EXCLUDE：D6硬拒绝钻石；拒绝路径已有，不能通过页面授权放开 | C409；W01验拒绝 |
| P5-4 | 监听跟随 | PARTIAL：有界观察筛选与当前响应哈希比较已有；跨视野持续身份/跟随未全 | C404/C405；W15 |
| P5-5 | 动态决策 | PARTIAL：三值规则/只读摘要已有；动态攻击计划未接 | C410；W15 |
| P6-1 | 活动列表 | PARTIAL：日常/周活动/签到前置观察已有；完整活动与周期资格未全 | C501–503；W16/W17 |
| P6-2 | 日常清单 | PARTIAL：Tasks/Dailies具名选择转原Workflow，9类明确动作子集及部分领奖已有，港口装货不证明任务完成；非17项全自动完成 | C511–517；W16/W17/W20 |
| P6-3 | 海商王 | PARTIAL：贸易单步买卖/移动/自有加速及同航段WAIT已有；全策略/收益/到达结算缺 | C521–524；W18 |
| P7-1 | 工作流画布 | PARTIAL：原生节点表单/拖动排序/拖动连线/SVG/JSON已有；全业务目录未齐 | C607/C602；W02/W20 |
| P7-2 | 工作流运行 | PARTIAL：有限run授权/父预算/节点与批次状态/取消已有；全业务及策略覆盖未齐 | C605/C606；W19/W20 |
| P7-3 | 历史/跨轮记忆 | PARTIAL：共享持久历史/Stage逐场/拒绝及UNKNOWN关联/重启只读已有；批次/记忆可追溯原执行证据，新增原始已确认次数/可靠库存净变化/原批次与动作原因分源只读摘要（建议非实际跳过）；Workflow无动作原原因/归属已接历史及记忆页，记忆卡可精确打开原历史；通用冷却/日界来源未闭合 | C604/C606；W19 |
| P8-1 | 账号默认设置 | PARTIAL：账号独立默认配置与预算表单已有；全42P一致性仍待补齐 | C002；W03/W21 |
| P8-2 | 敏感操作确认 | PARTIAL：具体计划/单次及有限run授权、D6/拒绝/UNKNOWN已有；全业务风险交互未齐 | D4/D6；W01/W02 |
| P8-3 | 全局调度 | PARTIAL：原Workflow有限ONCE/DAILY/WEEKLY和7类可信事件已有；通用日界/全事件策略未全 | S1–S8；W20 |

### 6.2 调度方式及冲突修订

| S | 当前实现 | 剩余交付边界 |
|---|---|---|
| S1 手动 | 原Service精确计划/授权；独立Stage门控；CLI只读/离线工具保留 | 独立CLI写在读取凭证前拒绝，参数不代替统一许可 |
| S2 单次 | 原Operation批次、有限Stage Function、Tasks/Dailies转原Workflow | 已接模块不代表所有原业务已接 |
| S3 轮询 | 有限Loop编译为原Registry节点，明确轮数/间隔/动作/期限/父预算 | 缓存轮询不等于游戏请求；缺源分支保持UNKNOWN或阻断 |
| S4 长时 | 原StageRunner与有限Workflow复用所有者/取消/持久历史 | 不恢复未授权写；无限长期委托和全业务范围未齐 |
| S5 定时 | 原Workflow有限ONCE/DAILY/WEEKLY，Asia/Shanghai、明确missedPolicy与单个所选发生次 | 本地日历不证明游戏日界；重启只读，不恢复计时/授权 |
| S6 事件 | 原Client私有可信VIP_LEVEL_CHANGED、PLAYER_LEVEL_CHANGED、DAILY_TASK_RESET、DAILY_TASK_PROGRESS及MAIN_TASK_PROGRESS/BRANCH_TASK_PROGRESS/ACHIEVEMENT_TASK_PROGRESS触发原有限run；主支线/成就保留int64字符串，列表整体校验 | 不采信公开emit或重复/失序事件；全领域事件与日界来源缺 |
| S7 工作流 | 原有限DAG、条件/数值和三类具名WAIT、父预算、run授权及持久历史 | 仅覆盖已注册有证据业务；UNKNOWN/拒绝不被WAIT清除 |
| S8 条件 | 原OrderRules/Naval三值/业务plan与工作流条件 | UNKNOWN不派发，规则通过不等于执行授权；非全平台任意规则引擎 |

原表C205“限频等待重试”、C409“批准钻石”与D6/D8冲突：沿用限频独立停止及钻石硬拒绝。当前有限run授权绑定账号、Function白名单、总预算、期限、次数与取消；重启不恢复授权。不能将定时发生次或WAIT结果当作游戏日界、业务资格或UNKNOWN重放许可。


## 7. 现有Function复用矩阵

已实现公共能力直接沿用，只补原需求的真实缺口，不重新建设。

| 当前源码 / 调用链 | 已接能力 | 剩余扩展 / 定向验证 |
|---|---|---|
| client / execution / writer-ownership → 原Console | 请求关联、trusted clock、写前fence、取消、所有者 | 新领域只补私有来源与效果验证，不放宽1000ms心跳 |
| function-registry / function-contracts | 26静态模块加Stage、27合同；City/Orders/Production已接 | 未证写不注册为可执行；变更补公共集成 |
| resource-ledger / business-functions / operation-service | 原通用执行器、父资源/配额/UID预算、依赖版本、新鲜度、授权 | 复用领域Adapter；预计收益不扩额，UNKNOWN不返预算 |
| execution-history / execution-memory / stage-history / workflow store | 业务/图/逐场持久历史、run-node-batch-action关联和拒绝/UNKNOWN | 剩余入口关联继续补；cooldown/gameDay来源未闭合 |
| operation-recovery → Service → API/UI | 证据预览、独立复读与追加确认 | APPLIED仅同原连接代次零成本Formation；NOT_APPLIED仅持久未派发证明，其余STILL_UNKNOWN |
| city-operations / order-execution / production-planning / farm-operations | 原城市/订单/生产/单田种收与纯投影 | 最终金币、免费刷新、全天量、批量农田按原X冻结 |
| hero-operations / growth / forge / pet / antique | 原养成、锻造、投喂及古董受控子集 | 替换/激活/培育和结算身份不凭邻近功能推定 |
| task-rewards / mail / afk-level-rewards / free-* / trial-challenge | 具名奖励、单封读领、等级奖励、普通挂机物品/徽章收益、其后明确1/5/10级升级、免费招募点金及经验试炼 | 有限收益→升级准备已有；周期、VIP、实例附件及订单档仍冻结；UNKNOWN不恢复重发 |
| alliance / fleet / museum / treasure / trade | 原专业Adapter和API/UI/Workflow子集 | 帮助求助、攻击跟随、探索完成领奖、到达收益缺证局部冻结 |
| compileUnifiedExecution → 原Registry/Workflow/Service | Tasks/Dailies/有限Loop；9类明确日常动作子集，Loop可显式引用原模块 | 继续W19已有Function入口与历史接线，不重开旧写handler |
| workflow / gameplay-page / page | 原生拖拽、父预算、有限日周/可信事件、数值及三类具名WAIT | 缺冷却/日界保持未知；WAIT不清拒绝/UNKNOWN，不新建调度器 |

### 7.1 参考实现复用边界

本地参考C:/Users/zyk-o/Documents/crazywaterword已核HEAD=6c2825a4d7dda17bf894b45744d2fd39e6a05499，status空。heroGrow.mjs:235/629/1063有survey/计划/行模型，:190成本/上限算法；tradeKing.mjs:202/224/585/628有价格、卖点和计划；tradePort.mjs:86/178/195有缺货视图/需求/计划；youdu.mjs:71/123/214/378/429/481有活动子流程。当前目标部分贸易港口已由Fleet提取，不再搬整套tradePort。

参考heroGrow有自己的makeBudget和无阵容时扩大到所有英雄的回退；Trade计划会基于预计卖出收入排买入；不得原封复制。提取纯算法后适配当前Ledger，只有卖出权威确认且新授权/父预算允许才可使用收入。参考client/server/loop绝不覆盖当前保护。Museum旧版本作者身份未确认，未联网取资料，不把参考占位判成协议失效。

## 8. 架构、重复实现与公共前置

沿用原SURVEY → PLAN → VALIDATE → AUTHORIZE → EXECUTE → VERIFY → PERSIST，写前意图必须持久化。Adapter拥有领域语义，OperationService拥有许可/锁/预算/历史，GameClient拥有传输关联，Workflow只编排，页面只编辑和展示。§7所有者、父预算、注册、记忆及历史均已有实现，不得依历史规划再造。

当前公共剩余边界：通用恢复仍有限；Service policyCoverage.cooldown/gameDay仍false；完整资产缺map-1及上游来源；全业务/API/UI/Workflow覆盖和最终R7/R8未闭合。旧独立CLI写和旧Web写入口持续拒绝。缺口见顶部W、§5/6和附录A，正常开发检查不新增人工Gate。

固定客户端与配置继续复用原RUNTIME_ASSETS清单及历史记录，不在相邻功能重复抄写指纹。类型存在不证明资格、成本、可恢复身份或结算。

### 8.1 全Inventory交付边界及非C工作包补充

完整产品范围以95项原始Cxxx、原Inventory全部目标能力及其参考子项共同构成。没有Cxxx编号不等于可选，也不因只剩协议/客户端证据就从计划移除。273个Inventory条目继续逐项保留；它们有重复和分层，不能算作273项独立业务需求。下表保留原非C完整验收合同和工作包归属，已实现子集及当前缺口以附录A同ID行为准，旧“必需扩展”不重复视为未施工任务；原合同，不新造C编号、不增加目录、不复制参考整模块。证据未齐仅将具体操作保留BLOCKED_EVIDENCE；已授权的独立业务继续连续开发。Owner决策用于裁定真实语义冲突、D6允许路径不存在或确认修改原产品要求，不作为默认将非C整体移出范围的前置批准。

D6始终排除钻石支付、购买付费礼包、testAccount/superToken等开发凭证。任意JS/任意协议写接口不属于需求允许的工作流能力，不实现。道具、普通材料、已有权益、免费奖励、只读和本地算法按证据及授权进入交付；名称含加速/解锁/领取不自动等于付费。必须按具体客户端成本/资格路径判定，证据不足保持阻塞而非偷偷排除。

| 原Inventory ID / 补充能力 | 主工作包 / 共享工作包 | 当前可复用Function | 必需扩展与验收边界 | 证据闸门 / D6排除 | 最终真实E2E归属（组内分支） |
|---|---|---|---|---|---|
| BIZ-R05 联盟商船补货/应聘船长 | W09；W14舰队占用与W02目录 | 目标surveyAlliance、surveyFleet与BusinessExecutor；参考guildShip survey/view/plan | 商船/crew身份、货物需求、英雄船长资格/空位、补货/应聘各自plan/verify；同物品和英雄UID共用预留；不能把港口cargoFill等同GuildShipOrder | GuildShipOrder/GuildShipSeek客户端完整body/资格/费用与权威复读来源；钻石补货/买位分支排除 | 联盟E12+舰队E17/E18各增加补货与应聘分支 |
| BIZ-R07 装备厂制造/收取 | W07；W04工厂状态/W19历史 | 参考surveyEquip/planEquip，目标city survey/Ledger/Operation | MakeEquip与PickMadeEquip独立适配；部位/配方/队列/材料/装备实例权威复读；收取未确认不得继续制造 | 普通配方材料可做；universal参数的真实语义须核验，不能默许用钻石补料 | 英雄高级E09增加制造/收取和UNKNOWN分支 |
| BIZ-R08 海兽培育/投喂/成熟收取 | W07独立子边界；W02/W19 | 参考surveyPet/planPet；现有AllPet读取、原共享executor | 补海兽领域survey/plan/verify，不挤进英雄大函数；PetBreed/PetFeed/GetMaturePet分开确认，队列/品质上限/素材/实例UID共享 | 普通材料/金币来源有据；付费补料或未知universal成本阻塞；不得因无C号删掉此能力 | 英雄高级E09增加海兽三种原子动作及重启恢复分支 |
| BIZ-R09 除C225–230外的装备/徽章精炼、升星、穿戴等参考分项 | W07；W02/W19 | 参考heroGrow实际已定义的plan分支；目标planHeroes及Ledger | 按原Inventory消息列逐项拆明PutOnBadge/BadgeStar/EnhanceBadge/PutOnEquip/EquipRefine/EquipStarUp等；共用同一Hero adapter，不另造执行器；实例转移和不可逆消耗精确授权 | 仅纳原清单实际描述的分项，分解等未列新需求不得顺手扩域；付费补齐排除；缺成本/归属阻塞 | E09内按原子分支列检查清单，不以六C通过代替其余分支 |
| BIZ-R10 挂机/邮件完整依赖计划 | W16；W19 | 原ACTIONS、planLoot、参考surveyIdle/planIdle/runIdle；目标runTasks | 有限收益确认→明确升级准备/API/UI已接原Workflow；固定原来源及成本，不预测新区间，各步独立复读；完整邮件及其他实例结算仍缺，UNKNOWN不续写 | 普通收益零支出/区间UID且金额不预估；升级逐档挂机徽章、主线门槛、资源/UID父预算和独立精确净扣；广告/付费替代禁用 | 基础日常E15保留分页、收益→升级依赖、无资格/已领分支，真实未验 |
| BIZ-R11、PRO-009 世界宝藏货轮完整业务 | W14独立TreasureLoot子边界；W15观察/W19历史 | 现有surveyTreasure/planTreasure/verifyTreasure与fleet事实 | 保留已做无争夺派舰；补按原世界宝藏语义所需争夺结果/目标归属/次数/奖励闭环，分别确认派遣、服务器结果、目标状态和奖励；不能用派遣分配成功替代抢占成功 | 赛季/次数/战斗模式、返回身份和权威战果/奖励来源先证实；不复用主线LEFT；钻石购买次数排除 | 世界宝藏E24内拆无争夺、争夺、有/无奖励、同目标竞争与UNKNOWN |
| BIZ-R12、BIZ-R12a 城战在线免费奖 | W14；W19 | 原fleet维修/移动；参考claimWarOnlineReward | 补在线奖励资格/服务器时间窗、GotWorldOnlineRwdRequest→GotRewardResponse正确关联、空奖/已领停止；与攻城/移动合同分开，非普遍任意领奖接口 | 在线资格和权威领取标志缺失先证据闸门；免费在线奖不属于D6排除 | E18增加在线免费奖资格/空奖/重复/超时分支 |
| BIZ-R14 工厂独立视图、自选材料包覆盖 | W04；W02/W19 | 当前cityView/productionShortages/production policy；参考packCoverPlan/exchangePacks | 补包内候选覆盖算法、白名单包资格/持有量、SelectPack参数/消耗/新库存双证据；独立工厂视图共用原city链；不能自动打开全部包 | 包本体与目标材料成本需可靠；免费持有包使用不自动排除，购买缺包/付费替代排除 | 城市生产E05/E06增加有限自选包→排产依赖和UNKNOWN不排产 |
| BIZ-R15 漂浮物拾荒、礼包码领取 | W16；W04海面读模型 | 参考pickUpFloater/giftCode；目标runAction/BusinessExecutor | 真实floaterId/过期/拾取复读；礼包码trim且不误改内容，资格/返回/奖励权威确认，禁止日志记录不必要秘密；均注册具体函数 | 不伪造Diving奖励或floaterId；真实客户端/本地协议来源先核验；付费礼包购买排除，合法免费礼包码属于范围 | E15增加拾荒/免费礼包码有效/已用/过期与UNKNOWN分支 |
| BIZ-R16a 农田专用状态解析 | W04；W03可信数据 | OnWater原始、参考farmOf | 恢复farm产物/成熟时间/autoFarming/地块身份，失败不变零，纳现有surveyWorld领域投影 | FarmlandPlantCfg与原字段来源/单位先确认；不重复48查询 | E06增加农田状态/未知/跨日分支 |
| BIZ-R16b 农田成熟收取 | W04；W02/W19 | 参考farmHarvest、现有runWorld/BusinessExecutor | 现有合同只发送单地块buildingId数组；明确多田准备有限逐田图，固定剩余来源/UID；逐田成熟资格、typed回执及独立完整库存净入确认，批量协议结算仍冻结 | 收取数量单位是地块，不编造真实奖励件数；无可靠库存变化则UNKNOWN | E06保留成熟收取、多田累计UID/错地块/来源变化/UNKNOWN；本批仅离线，真实NOT_RUN |
| BIZ-R16c 农田种植/供给 | W04；W02/W19 | 参考farmPlant、原ResourceLedger | 明确空田及每田作物→原种子预留→单FarmPlant args；1至12空田有限准备核初始种子总额，固定剩余空田/配方，逐田原授权与净扣确认；已收田须新调查，后续原来源链仍待补；尊重autoFarming，不改游戏开关 | 普通种子材料有据可做；付费补种/钻石加速排除；种植权威状态需确认 | E06保留明确多田/混合作物、初始种子总额/累计预算不足、来源变化、UNKNOWN/取消及重启；本批仅离线，真实NOT_RUN |
| BIZ-R16d 委任减时纯计算 | W04；W07英雄数据 | 参考appointEffectValue/appointProduceReduce/produceFinalTime；目标AppointInfo/AllHero | 恢复配置引用与向上取整公式，产出时间与可靠性只用于计划；不新增委任写操作 | 所需配置/星级/速度来源缺失返回UNKNOWN；没有D6付费分支可排除 | E05核对读数和生产时间；主体离线公式边界验收 |
| BIZ-R16e 作物供给水位 | W04 | 参考waterlineOf、当前productionShortages | 作为独立纯策略扩展，限额/用途/目标库存可解释；不覆写用户订单规则 | 水位属于策略参数而非权威库存，不装作服务器事实；普通生产预算共享 | E05计划/实际需求变化分支；主体离线验收 |
| BIZ-R16f 种子缺口需求 | W04 | 参考增强planWorld种子需求、现有startProduce | 合并种子安全库存/配方解锁/需求权重，纳统一demand和Ledger；复用StartFactoryProduce，不造新协议 | 配方/种子身份可靠；不可为满足水位自动购买材料 | E05种子缺口→普通排产与共享材料冲突 |
| BIZ-R16g 过剩作物转成品需求 | W04 | 参考增强planWorld配方算法、production policy | 可解释转换与最大份数，使用现有配方和工厂选择；与订单/种子计划合并去重 | 超水位不等于可任意烧包；所有配方已有真实成本 | E05过剩/非过剩/无配方/预算不足 |
| BIZ-R16h 排队等待/刷新成本决策复用 | W04；W02 | 当前order-rules、planOrderExecution；参考decideOrderReroll可复用纯计算 | 补配方减时、整队列等待leadSec和单数/时窗信息供规则解释/预览；保留原用户KEEP/REFRESH/REVIEW产品契约，不能整段换成参考旧策略 | 免费刷新权威quota/eligibility未解仍阻塞执行；成本推算不授予刷新权限 | E04订单规则增加等待估计与免费刷新证据门控 |
| BIZ-R17、BIZ-R17a 驱邪击杀 | W17 | 参考surveyYoudu/planYoudu kill；原日常框架 | activityId/存活/资格/成本→EvilExpelKill→关联结果/状态变化；按动作族失败隔离 | 活动版本/状态/开放期先证据闸门；次数/入场成本未知不派 | E15季节活动子场景/活动期内可用夹具 |
| BIZ-R17b 驱邪累计奖 | W17 | 参考累计奖励分支 | killTotal与配置档位对应，只有已确认击杀可增加后续资格，领取后权威档位复读 | 不将计划击杀数直接视作已完成计数 | E15季节活动累计奖/未达档/已领 |
| BIZ-R17c 罗盘抽取 | W17 | 参考planYoudu罗盘分支 | 活动券、批量次数上限、领取/抽取状态分别记录；共享券Ledger | 消耗券而非免费无限；钻石购买券/补齐排除 | E15罗盘1次/批量/券不足/UNKNOWN不重抽 |
| BIZ-R17d 罗盘累计奖 | W17 | 参考ClaimCompassWheelReward | 准确activityId/档位/已领标志/奖励复读 | 抽取成功不等于累计奖已领 | E15罗盘累计奖独立分支 |
| BIZ-R17e 敕令开局 | W17 | 参考EdictStart | 入场券/贡品、局身份、未完成局冲突；新局结果持久化供恢复 | 不为未知新局重发；普通活动道具成本可做，钻石入场排除 | E15敕令开局/已有局/断线 |
| BIZ-R17f 敕令作答/结算 | W17；W19 | 参考settleYouduEdict | 四位rune保持合法0，精确session身份/耐心/进度复读；不猜答案，断线恢复同局 | 缺可靠答案/局身份则BLOCKED_EVIDENCE，不自动随机作答 | E15敕令续局/0符文/错局/UNKNOWN |
| BIZ-R17g 活动活跃奖 | W17 | 参考runYouduActive | 有界最多次数/无奖正常停/奖励标志权威确认，退避交共享调度 | 已领不重领；普通免费资格，不因参考独立run而另造Runner | E15活动活跃奖/空奖/已领 |
| BIZ-R17h 活动签到 | W17；W19/W20 | 参考runYouduSigns、可信clock | checkId/活动期/服务器日界；账号隔离持久memo，memo不替代权威已领状态 | 不跨账号共用进程memo；未到期/免费已领明确停止 | E15签到/跨日/账号切换/重启 |
| FRM-005 阵型模板解锁 | W08；W07材料/UID | 原catalogFrom/已解锁查询；UnlockFormationPreset协议 | 先核真实模板解锁所需图纸/上限/资格，明确手动单次解锁候选，复读ids；与普通SaveFormation分开，绝不默认自动解锁 | 普通图纸解锁可纳入；钻石购买/补图纸排除；成本未知保持证据阻塞。不能把“无自动解锁”误写成“不开发任何解锁” | E10增加普通图纸解锁/已解锁/成本未知分支；如仅付费路径则记录D6排除证据 |
| FRM-007 具名完整英雄队伍存档 | W08；W19本地持久化 | 现有parseFormation/validateFormationParameters/SaveFormation与settings模式 | 定义本地版本化具名队伍存档，不臆造游戏专用请求；保存英雄/preset/pet与来源账号/模式/版本，应用必须重新validate→授权Save→复读，恢复也新授权 | 这是本地产品合同，可合理设计；与C215极限站位复制不同；缺英雄/未知宠物/其他账号禁止应用 | E10增加本地存档重启、命名/覆盖、应用/恢复/缺英雄分支 |
| PRO-005、STG-017 其他战斗模式/世界与限时Boss | W14：世界/限时Boss；W08：其他模式独立battle adapter；W02目录 | 现有Naval只读、各模式真实协议、parseStageResult仅作模式专属范例 | 每一已在Inventory列出的模式独立身份、参战方语义、成本/次数/权限、结果和目标状态复读；复用执行/调度，不直接放宽主线LEFT | 核清BT/左右归属/战果/胜负源；无可靠模式证据保留SIDE_UNVERIFIED/BLOCKED_EVIDENCE，不从范围移除；钻石门票/购买次数排除 | E11主线组增加其他模式专属子场景；E18世界/限时Boss分支。STG017是额外其他模式，不映成C204/C606已完成 |
| PRO-007 藏品培养/兑换/精通/汇总 | W11独立藏品子边界；W07英雄效果/W19 | AllAntique、参考培养线索、原Museum执行基础 | ActivateAntique/AntiqueStarUp/AntiqueSuitLevelUp/AntiqueFragExchange/AntiqueMasterLevelUp与AttrSummary逐项核语义、普通碎片/金币预算、唯一藏品ID及效果复读；不能把Museum陈列当培养 | 兑换可能不可逆，精确授权；普通材料路径纳入，付费购买/未知成本阻塞；无可靠来源先证据闸门 | E14增加藏品培养/兑换/精通/重复与UNKNOWN子场景 |
| PRO-010 其他模式阵容 | W08；W14舰队关联 | 主线完整Save验证模式、Arena/Expedition/League/Tournament/Ultra协议线索 | 按原族逐模式字段/槽位/序列/宠物/队伍人数核契约；分别query→validate→save→复读；静态registry声明battleMode，不以通用module参数直通 | 模式未证不执行；原LEFT结论仅主线；资源付费路径排除而非排除整个模式 | E10分模式保存/复读/跨模式拒绝子场景，E11引用对应队伍 |
| BIZ-R02 雷达领奖/派舰；BIZ-R03 海盗实战 | W14；W12共享配额、W15观察 | 当前Radar/AllPirate/MyFleets读事实、旧日常/原Fleet执行层；参考radar/pirate计划 | 雷达资格/奖励/派舰分开plan/verify；海盗实战目标/次数/参战资格/舰队占用与模式战报权威复读，非PirateSweep | 模式side/战果/资格/成本与奖励来源先核；普通次数/油/舰队共享预算，钻石补次排除；UNKNOWN不重派 | E18分雷达领奖、雷达派舰、海盗实战各子分支；E15扫荡单独验证 |
| PRO-001 科技重置 | W10独立子边界 | 固定v76 GuildTechPop._onBtnReset为空实现；ResetGuildTechRequest/Response类型存在，但资格、费用、返还及等级结算均未证实 | 原清单重置保持BLOCKED_EVIDENCE；原Alliance视图/Function Contract明确resetTech缺证，升级仍可独立执行，不按协议类型推断免费或资格 | 免费/普通材料路径保留原范围；未知成本不派发，仅付费路径按D6排除 | 本行所在提交（父c73a35f）：alliance-tech/alliance/function-contracts/gameplay-api四文件103/103 PASS，0 fail/cancel/skip/todo，9.05秒；伪造reset不规划/不验证/D6拒绝，原升级回归；未运行R7/R8，E13原验收保留 |

原Inventory其他未映C的既有Function也必须纳回归，不因Function已有而消失：挂机/成就/主支线领奖/资源田占领放弃/自动工作/生产设置/免费招募/点金/竞技场/经验试炼等，分别由W04、W08、W14、W16接adapter、验证和目录。免费招募与普通/免费点金保留真实资格；需要钻石的分支按D6拒绝。BIZ-A26/A27及W14–16世界资源田不是仅C403读取，必须保留其局部执行/效果确认缺口。工具PLT030–042以可复现、脱敏和离线安全治理纳W03/W22；不把需要在线的probe/诊断作为本轮或离线测试自动执行项。

#### 对工作包Definition of Done的必要增补

- W04 DoD增列R14/R16a–h：农田、委任减时、水位、种子、自选包均有可解释算法、可靠状态、共享预算和权威效果；纯算法不新增游戏查询/执行器。
- W07 Scope/DoD增列R07/R08/R09全原清单分支：装备厂与海兽是明确子模块边界，复用执行层；删除原“六C即完成且宠物不做”的缩减口径。未列分解能力仍不随意扩域。
- W08增列FRM005/007、PRO010、STG017：普通材料解锁、本地具名队伍、其他模式阵容/战斗适配；各模式独立证据，不解锁主线SIDE约束。
- W09增列R05/R01/R06：联盟商船、原订单赛季来源、福利链均完成；不要仅C301–305通过就停止。
- W11增列PRO007，Museum与藏品培养分别survey/plan/verify和状态；W14增列R11/R12a/PRO005与资源田执行，保持世界宝藏≠Museum、移动≠攻击、领取≠资格。
- W16增列R10/R15及原免费招募/挂机/竞技场/点金/试炼原子业务的受控接入；W17明列R17a–h而非“所选活动”。过季活动靠版本化协议/配置/录制fixture完成离线能力，最终真实E2E按可用活动期分支验证，未遇活动不得伪造REAL_VERIFIED。
- W20目录、W21 UI、W22集成的依赖保持工作包ID，不需增加工作包数，但对应Requirement IDs与测试/E2E子分支必须包含上述原Inventory ID。95C分类数字不变；273覆盖表保留；真实E2E顶层组数可不变，必须另列组内所有必测原子分支及证据/季节闸门。

## 9. 后续施工工作包（22项）

工作包是对16产品模块的依赖拆分；同模块可跨阶段施工。下表保留原范围和DoD，不是第二份进度表。New Functions为当时接口意图，顶部W/§7和附录A已确认的Symbol直接复用，禁止重复实现。所有DoD继承D1–D9及第12节治理；任何证据闸门未关闭不得用模拟成功标成真实语义已实现。8.1原Inventory子项是默认完整范围，以下各包逐项接纳，不再另问是否开发无C项。

### W01 — 公共安全、单写所有者与UNKNOWN恢复

| 字段 | 工程约定 |
|---|---|
| Module ID | W01 |
| Module Name | 公共安全、单写所有者与UNKNOWN恢复 |
| Requirement IDs | M0/M15；C001/C002/C005/C128/C409/C603/C606 |
| Existing Functions | createOperationService/acquire；createExecutionHistory；client指纹；Session/current guard |
| Required Extensions | 追加reconciliation事件与只读context；Stage复用同源CSRF；单服务写所有者/CLI委托 |
| New Functions | reconcileOperation、evaluateRecoveryEvidence、claimWriterOwnership（建议名，先查现有后定） |
| Dependencies | 无 |
| Shared Components | OperationService/History/GameClient/execution/账号锁 |
| API/UI Scope | 专用恢复预览/确认API与历史页；Stage gate最小复用；旧白名单不变 |
| Data/Protocol Scope | 原request/target/identity/成本、authoritative sources、owner/fencing元数据；旧v1兼容 |
| Budget Rules | UNKNOWN保留预算；证据确认不发生才能可审计释放；多进程不能重复扣/覆盖 |
| Safety Rules | 不删除旧UNKNOWN；APPLIED/NOT_APPLIED/STILL_UNKNOWN分层；已发取消仍未决；D6不可override |
| Offline Tests | 崩溃DISPATCHING、读失败/目标替换/迟到/部分效果不释放；两个进程争锁与NAS写失败；Stage CSRF |
| Real E2E Tests | E01/E21/E22/E23/E24 |
| Definition of Done | 单服务和CLI均受唯一所有者保护；恢复只能由可靠证据追加历史解除；坏文件无副作用 |

### W02 — 统一adapter、注册元数据及父预算合同

| 字段 | 工程约定 |
|---|---|
| Module ID | W02 |
| Module Name | 统一adapter、注册元数据及父预算合同 |
| Requirement IDs | M14/M15；C602/C603/C607及全部写C |
| Existing Functions | executeBusinessOperation；ResourceLedger；GAMEPLAY_MODULES；OperationService专用Order/City分支 |
| Required Extensions | registry capabilityId/C-P-S/schema/auth/verify/dependencyVersions；runBudget父scope；将现有City/Order包装为adapter |
| New Functions | registerExistingBusinessAdapters、validateFunctionContract、createRunBudgetContext（建议接口） |
| Dependencies | W01,W03 |
| Shared Components | 原Function/静态registry/Ledger/History/Session |
| API/UI Scope | 维持现有命名业务端点；Workflow节点目录与输入表单；不开放任意request/body |
| Data/Protocol Scope | 版本/来源/时效/schema/Cxxx/支持Scheduler；兼容旧订单/城市计划 |
| Budget Rules | 父run累计预算+子批精确许可；物资/配额/UID有统一预占声明；收入不隐式补回 |
| Safety Rules | unknown字段拒绝；相关依赖变更使计划失效；无关规则不误失效；不复制许可 |
| Offline Tests | 真实adapter链跨订单/生产/修船争用；图内新plan不得突破总上限；schema注入/旧图兼容 |
| Real E2E Tests | E03/E04/E05/E19/E20/E21 |
| Definition of Done | 原函数发送/验证不重写；注册目录可追溯C/P/S和验证方法；所有新节点使用同一Service |

### W03 — 账号、数据来源、可信时间与资产可复现

| 字段 | 工程约定 |
|---|---|
| Module ID | W03 |
| Module Name | 账号、数据来源、可信时间与资产可复现 |
| Requirement IDs | M0/M1；C001–005/C127，全部只读C |
| Existing Functions | accounts/cli-safety/collectState/DATA_CATALOG/cachedClient；worlds；模块settings |
| Required Extensions | 统一facts sourceAt/serverTime/scope/reliability；账号默认设置；资源manifest/恢复说明；有界首错时序观测 |
| New Functions | factsFreshnessPolicy、trustedGameClock、assetReadinessReport（最小缺失接口） |
| Dependencies | 无；与W01可并行，W02消费二者 |
| Shared Components | 现有Session/快照目录/安全sink/本地原子store |
| API/UI Scope | P0/P1/P8设置与数据可靠性展示；显式区服进入需独立授权；安全导入产品入口逐条评审 |
| Data/Protocol Scope | 48目录保持唯一；额外业务query登记；bundle/config/map来源+哈希；不读取当前真实Token |
| Budget Rules | 只读N/A；新世界进入是潜在写，不当无成本查询 |
| Safety Rules | 缓存不制造实时事实；无可信时钟不派时间敏感动作；不擅自启Web捕获/代理 |
| Offline Tests | 48目录不重复、int64、旧响应/多账号、坏配置、时区/误差、缺资产、首Pong FakeClock/事件循环延迟 |
| Real E2E Tests | E01/E02/E22/E23/E24 |
| Definition of Done | 可从保留来源离线恢复运行资产；账号/配置/快照无串号；诊断不含秘密且不改心跳阈值 |

### W04 — 订单、建筑与生产剩余闭环

| 字段 | 工程约定 |
|---|---|
| Module ID | W04 |
| Module Name | 订单、建筑与生产剩余闭环 |
| Requirement IDs | M2/M3；C101–104/C111–116/C121–128；BIZ-R14/R16a–h及现有自动工作/生产设置 |
| Existing Functions | survey/planWorld；Order/City wrappers；productionShortages/selectProductionCandidates/summarizeProductionHistory |
| Required Extensions | 金币reward及MIN_GOLD可靠来源；REFRESH权威proof；完整日报coverage；可靠槽位/队列范围；农田状态/成熟收取/种植、委任减时公式、水位/种子/过剩作物需求与材料自选包覆盖；不重复48采集 |
| New Functions | 接通refreshEligibility/rewardGold来源适配、productionCoverageReport；仅缺失计算新增；farm领域投影与plan/verify、packCoverPlan纯算法适配；复用原StartFactoryProduce及原executor |
| Dependencies | W02,W03 |
| Shared Components | Ledger/Operation/History/可信facts |
| API/UI Scope | 已有建筑/生产/订单页补缺口/coverage；注册City/Orders/Production节点 |
| Data/Protocol Scope | OnWater/AllItem/AllResource及配置；X01日产量/X02金币/X03刷新；未知保持null；FarmlandPlantCfg/OnWater/AppointInfo/AllHero；FarmPlant/FarmHarvest/SelectPack只用已核成本与权威源 |
| Budget Rules | 跨订单/建筑/排产同一ledger；免费刷新quota独占；不购买缺料；日量不能库存差推算；种子/作物/持有包与订单、建筑共享预留；不购买缺包/补料 |
| Safety Rules | 旧身份/规则/成本变化重规划；免费条件无证据不发；UNKNOWN停相关链 |
| Offline Tests | 原47订单/30城市等回归；同index替换/配额日界/工厂即时完成/跨模块耗材/完整覆盖缺失；R14/R16a–h逐原子分支、公式边界、种子与订单争用、包未确认不得排产、农田错地块/UNKNOWN |
| Real E2E Tests | E03/E04/E05/E06/E20/E21 |
| Definition of Done | 提交/刷新和建筑/生产每个允许分支均权威复读；日报覆盖合同被证实或Owner明确批准缩减原需求；不能将工具日报冒称完整；农田/委任/水位/种子/自选包全原分支均有可解释算法、可信状态/预算/权威效果，纯计算不另造查询/执行器 |

### W05 — 港口货船专业缺货视图与节点

| 字段 | 工程约定 |
|---|---|
| Module ID | W05 |
| Module Name | 港口货船专业缺货视图与节点 |
| Requirement IDs | M4；C131–134 |
| Existing Functions | surveyFleet/buildCandidates/planFleet/verifyFleet已含cargoFill/cargoClaim；参考cargoDemandOf/viewCargo |
| Required Extensions | required/have/missing明细与货格/船状态UI；复用fleet adapter，不再移植整套cargo执行 |
| New Functions | cargoShortageView（缺失纯投影） |
| Dependencies | W02,W03 |
| Shared Components | 现有Fleet/Ledger/Operation/History |
| API/UI Scope | P2-6专业表；原Fleet视图共享同一候选/计划；Workflow port投影 |
| Data/Protocol Scope | CargoShips.orderItem资产/1-based cargoIndex/到港状态；配对typed回复 |
| Budget Rules | 物料共享预占；不自动购买缺料；领奖核对实际库存 |
| Safety Rules | 精确船/货格/原资产身份，状态变化则重规划；UNKNOWN不再装一次 |
| Offline Tests | 缺料逐物品明细、重复船/格、typed奖励无状态变化、库存不一致、跨模块争用 |
| Real E2E Tests | E07/E20/E21 |
| Definition of Done | 原cargo执行不复制；专业页/图节点调用同Function；装货/领奖均有复读和资源变化证据 |

### W06 — 英雄等级、升星、技能产品闭环

| 字段 | 工程约定 |
|---|---|
| Module ID | W06 |
| Module Name | 英雄等级、升星、技能产品闭环 |
| Requirement IDs | M7；C221–224 |
| Existing Functions | planHeroes/runHeroPlan/sendHero/buildHeroBody；maxHeroLevelFor/skillLevelMinStar |
| Required Extensions | 抽取可复用请求构造；Hero adapter精确前后AllHero/物资verify；Operation/History接入 |
| New Functions | surveyHeroOperations、verifyHeroOperation（领域适配，不新执行器） |
| Dependencies | W02,W03 |
| Shared Components | Ledger/Operation/History/原GameClient |
| API/UI Scope | P3-6/P3-7按英雄单项候选/禁用原因；新增受控Hero节点，旧写handler保持403 |
| Data/Protocol Scope | AllHero/AllItem/AllResource、HeroLevel/Star/SkillCfg；不得捏造同名Response |
| Budget Rules | 全英雄/通用碎片/书共享预算；每次一级不以总count绕过复核 |
| Safety Rules | typed升星也需权威变化；静默升级/技能未确认仍UNKNOWN；H默认不启 |
| Offline Tests | 等级/星级/技能上限、通用碎片跨英雄、取消后late hero推送、typed无效果、缺自有字段 |
| Real E2E Tests | E08/E20/E21 |
| Definition of Done | 三类成长均Function/API/UI/节点/History闭环且资源及目标匹配；旧CLI语义安全兼容 |

### W07 — 专武、纹章、装备厂与海兽成长

| 字段 | 工程约定 |
|---|---|
| Module ID | W07 |
| Module Name | 专武、纹章、装备厂与海兽成长 |
| Requirement IDs | M7；C225–230；BIZ-R07/R08/R09全原成长分项 |
| Existing Functions | 本地reference heroGrow/equip纯算法；目标planHeroes/Ledger/BusinessExecutor |
| Required Extensions | 将参考cost/upper-limit/候选算法提取接目标；禁止带入独立makeBudget或大范围fallback；原清单精炼/升星/穿戴、装备制造收取、海兽培育/投喂/成熟收取按独立子边界适配 |
| New Functions | 专武level/star、纹章level/replace、装备level/replace的领域plan/verify适配（先检查可复用symbol）；装备厂与Pet独立survey/plan/verify，沿用同一执行层 |
| Dependencies | W06 |
| Shared Components | Operation/Ledger/UID预占/History |
| API/UI Scope | P3-6/7六类详情和H确认，使用同Hero API/节点；装备厂/海兽专业子视图，接同registry而非塞进英雄单一大函数 |
| Data/Protocol Scope | Exclusive/Badge/Equip协议+配置与实例UID/槽位；回包名字按实际表核对；MakeEquip/PickMadeEquip/PetBreed/PetFeed/GetMaturePet及原Badge/Equip其余消息；universal成本语义先核验 |
| Budget Rules | GOLD/材料/碎片共享；同装备/纹章UID不可跨英雄重复使用；不自动分解或购买；制造队列/饲料/金币/实例UID共用预算；universal未知或付费补料不派 |
| Safety Rules | 不可逆替换须精确H授权；默认禁用；旧物归属/新物槽位复读；成本未知不派 |
| Offline Tests | 六类上限、UID重复、占用、替换前后完整状态、取消/UNKNOWN、D6；原R07/R08/R09全部原子分支、制造收取依赖、海兽队列/成熟/重启、精炼升星/实例转移 |
| Real E2E Tests | E09/E20/E21 |
| Definition of Done | 六C及BIZ-R07/R08/R09原清单每一分支具前检/预算/执行/权威复读/历史与业务UI；装备厂、Pet保留独立领域边界且复用执行层；未列分解不擅自扩域 |

### W08 — 阵容、极限复制、战败建议与主线整合

| 字段 | 工程约定 |
|---|---|
| Module ID | W08 |
| Module Name | 阵容、极限复制、战败建议与主线整合 |
| Requirement IDs | M8/M9；C201–209/C211–215；FRM-005/007、PRO-010、STG-017其他模式 |
| Existing Functions | Formation完整保存/复读；battleAnalysis/recommendFormations；原StageRunner/StageFunction |
| Required Extensions | 极限站位源身份/英雄映射；可解释推荐规则与有界续跑；战报历史比较；stopOnDefeat控件；普通图纸解锁候选/复读，本地版本化具名完整队伍存档；其他模式阵容和战斗逐模式adapter与SIDE证据 |
| New Functions | copyClearanceLayout、evaluateFormationRecommendation（纯算法）；不创建第二save或Runner；namedFormationStore、unlockPreset领域适配、各模式独立验证器（先搜现有函数） |
| Dependencies | W02,W03 |
| Shared Components | 原Formation/Stage/Operation/History/模式隔离 |
| API/UI Scope | P3-1开关/配置、P3-2/3比较、P3-4建议/授权、P3-5复制预览 |
| Data/Protocol Scope | 实际战报left/rightTeams、模板配置、完整布局/petUid、关卡/战报身份；缺少“极限”数据来源先用Owner提供合法源，不能猜请求；UnlockFormationPreset与MyFormationPreset；本地存档绑定账号/模式/版本；原Arena/Expedition/League/Tournament/Ultra族逐项证据 |
| Budget Rules | 已解锁保存声明已知零成本；普通图纸解锁须独立精确授权/预算，不能自动买图；其他模式票/次数按各自成本；Stage尝试/时间/run上限 |
| Safety Rules | 推荐不保证更优；保存→复读→新鲜Stage前检；自动模式仅在批准run合同内，未知不续跑 |
| Offline Tests | 缺英雄/重复坐标/映射不唯一/pet精度/错误战报、战败后保存未确认不挑战、旧Timer/限频回归；FRM005解锁/已解锁/未知成本；FRM007命名覆盖/重启/缺英雄/应用复读；PRO010/STG017逐模式身份/slot/side/权限拒绝 |
| Real E2E Tests | E10/E11/E20/E21/E23 |
| Definition of Done | 复制和建议具源证据与解释；原LEFT仅主线；阵容可新授权恢复；当前10–11秒/战败分支留最终真实验证；普通材料解锁、具名完整队伍、其他模式阵容/战斗全部按原ID逐项闭环；证据未齐不以主线PASS代替 |

### W09 — 联盟互助捐赠、自动求助及已交付联盟回归

| 字段 | 工程约定 |
|---|---|
| Module ID | W09 |
| Module Name | 联盟互助捐赠、自动求助及已交付联盟回归 |
| Requirement IDs | M10；C301–305；PRO-002已交付福利/取消/领取；BIZ-R01/R05/R06、PRO-002联盟订单/商船/福利/Fort |
| Existing Functions | surveyAlliance/allianceHelpRules/planAlliance/verifyAlliance |
| Required Extensions | 用X06可信每日quota/usage/cooldown/season填真实survey，移除合成可行但生产永阻的缺口；原联盟订单赛季来源、商船补货/应聘船长资格/crew/货物与Fort独立捐赠进度/权限/成本 |
| New Functions | ask阈值候选/verify适配；可信allowance/usage来源适配；guildShip与Fort独立plan/verify领域适配，复用Alliance/Fleet读事实与原executor |
| Dependencies | W02,W03 |
| Shared Components | 同reqId规则/可信clock/Ledger/Operation/History |
| API/UI Scope | P4-1/2/3专业列表/白名单/阈值/日限；默认禁用；联盟商船/船长与Fort专业子视图，跨页同候选不复制 |
| Data/Protocol Scope | GuildAid/MyGuildAid/GuildMember/Counter/配置；当前helpAllowance/helpUsage/season=null必须有证据再接；GuildShipOrder/GuildShipSeek与DonateFort真实body/资格、guildShip/Fort权威源先核；不等同港口cargo或互助 |
| Budget Rules | 每reqId一件物资；总/按物品每日上限；库存保留线；成员精确ID；商船材料、船长英雄UID、Fort材料共用Ledger；钻石补货/买位不派 |
| Safety Rules | 成员和联盟身份变更重规划；不将DonateFort当互助；请求过期/缺clock停；UNKNOWN不重捐 |
| Offline Tests | 真实survey到plan成功路径（不是注入facts）、每日quota/冷却/过期/他人同reqId/自己求助、福利取消领取回归；商船补货/船长空位与UID占用、Fort权限/进度/扣料、订单赛季来源及UNKNOWN |
| Real E2E Tests | E12/E13/E17/E20/E21 |
| Definition of Done | C303/304生产事实源能产生合法候选，C305阈值/冷却/限额/执行复读闭合；无证据保留阻塞不能宣称DoD；R01/R05/R06/PRO002原分支含商船和Fort分别闭环；非C不因五个C完成而遗漏 |

### W10 — 联盟科技业务

| 字段 | 工程约定 |
|---|---|
| Module ID | W10 |
| Module Name | 联盟科技业务 |
| Requirement IDs | M10；C306/C307；PRO-001升级与重置 |
| Existing Functions | 现有GuildTechInfo Snapshot/Explorer；参考GuildTechCfg及原协议 |
| Required Extensions | 科技树/目标等级/材料/权限view与候选；接同Alliance adapter |
| New Functions | 科技升级及PRO-001原重置合法路径的独立plan/verify领域函数 |
| Dependencies | W02,W03；可与W09并行 |
| Shared Components | Ledger/Operation/History/Alliance身份 |
| API/UI Scope | P4-4树/可升原因/目标等级；重置独立展示影响及成本，精确确认，不与升级混批 |
| Data/Protocol Scope | GuildTechInfo/UpgradeGuildTechResponse；客户端前置与成本；PRO-001 ResetGuildTech作为独立证据子分支，免费/普通材料路径纳入，付费按D6拒绝 |
| Budget Rules | 当前等级→目标每级预算，资源/每日限制按证据；不钻石重置 |
| Safety Rules | 成员权限/联盟/等级变化则旧授权失效；typed后复读等级 |
| Offline Tests | 权限缺失、前置未满足、跨等级成本、typed无变化/UNKNOWN/账号隔离；重置免费/普通材料/未知成本/付费分支分别测试 |
| Real E2E Tests | E13/E20/E21 |
| Definition of Done | 完整科技读/前检/升级/复读/UI/历史；原PRO-001重置独立核成本/资格，免费或普通材料路径有plan/预算/精确授权/权威复读，未证实BLOCKED、仅付费D6排除；Fort由W09交付并在E13验收 |

### W11 — Museum完整探索结算与资源视图

| 字段 | 工程约定 |
|---|---|
| Module ID | W11 |
| Module Name | Museum完整探索结算与资源视图 |
| Requirement IDs | M5；C141–144；保留展陈/收益已交付；PRO-007藏品培养/兑换/精通/汇总 |
| Existing Functions | surveyMuseum/museumView/planMuseum/verifyMuseum |
| Required Extensions | missing明细；X04 Complete与Reward独立pending身份/可恢复结果；复用原收益/展陈；藏品培养/兑换/精通/属性汇总为独立子域，不等同Museum展陈 |
| New Functions | completeExplore/claimExplore领域plan/verify与pending证据适配；Antique领域survey/plan/verify，复用共享执行器 |
| Dependencies | W02,W03 |
| Shared Components | 可信clock/Ledger/Operation/History |
| API/UI Scope | P2-7次数/队伍/缺货/状态/结算/领奖分层；自动探索由统一调度 |
| Data/Protocol Scope | MuseumInfo/CompleteExploreResponse的grade/progressGain/fixed/randomReward与独立Reward；可恢复pending来源必须可靠；AllAntique及ActivateAntique/AntiqueStarUp/AntiqueSuitLevelUp/AntiqueFragExchange/AntiqueMasterLevelUp/AttrSummary逐项核契约 |
| Budget Rules | 出发factor精确乘成本、英雄/队位独占、道具上限；展陈/收益不混记探索奖励；普通碎片/金币共享预算；不可逆兑换精确授权，不购买补齐 |
| Safety Rules | 到期不等于已结算，typed不等于已领；pending身份缺时保留BLOCKED_EVIDENCE |
| Offline Tests | 结算后断线/重启/领奖前停止、重复领取、已领状态缺失、缺货明细/队伍占用、原展陈回归；PRO007逐原子分支、重复兑换/实例身份、效果汇总与成本不明/UNKNOWN |
| Real E2E Tests | E14/E20/E21/E22 |
| Definition of Done | 出发→到期→结算→领奖→权威复读可独立恢复；不靠内存唯一结果冒充重启可恢复；PRO007原列培养/兑换/精通/汇总逐项完成，Museum与藏品子域各有权威状态 |

### W12 — 海面扫荡配额与业务接入

| 字段 | 工程约定 |
|---|---|
| Module ID | W12 |
| Module Name | 海面扫荡配额与业务接入 |
| Requirement IDs | M6；C151 |
| Existing Functions | DAILY_DRIVERS[1010]/PirateSweep现有构造；参考pirate quota算法 |
| Required Extensions | 权威已用次数/总量/目标存活状态；效果验证；替换旧只按task剩余截取策略 |
| New Functions | sweep quota事实/verify adapter |
| Dependencies | W02,W03 |
| Shared Components | Ledger配额/Operation/History/原日常驱动 |
| API/UI Scope | P2-8目标/剩余次数/计划；也供日常和Workflow复用 |
| Data/Protocol Scope | AllPirate/sweepTimes/push与配置证据；不把task剩余当扫荡额度 |
| Budget Rules | 计划与执行次数共享预留；无余额不派；非派舰攻击 |
| Safety Rules | 目标消失/配额变化/UNKNOWN停止；不继承主线胜负 |
| Offline Tests | used不是remaining语义、无配额/重复目标/跨日、静默未知、配额扣量与消失双证据 |
| Real E2E Tests | E15/E20/E21 |
| Definition of Done | 可证明免费合法次数和效果；日常引用同Function，无独立第二sweep执行器 |

### W13 — 钓鱼完整业务

| 字段 | 工程约定 |
|---|---|
| Module ID | W13 |
| Module Name | 钓鱼完整业务 |
| Requirement IDs | M6；C152 |
| Existing Functions | StartFishing/GainBigFish/DrawFishReward本地协议；原FishEncyclopedia仅图鉴 |
| Required Extensions | X05客户端完整调用链/前置/消耗/次数/结果/领奖；先静态证据再受控适配 |
| New Functions | Fishing survey/plan/verify领域函数（真实语义确定后命名） |
| Dependencies | W02,W03；X05证据前置 |
| Shared Components | Ledger/Operation/History/可信clock |
| API/UI Scope | P2-9状态/资源/当前任务/领奖；注册命名节点 |
| Data/Protocol Scope | 杆/饵/等级/次数/时间/鱼ID与奖励权威读源；不能按类型名称推断链 |
| Budget Rules | 仅已知免费/道具预算；未知收费/次数保守拒绝 |
| Safety Rules | 不连接游戏补证据；玩法条件未知BLOCKED，不造response或自动再钓 |
| Offline Tests | 静态真实codec+合成业务状态机；资源不足/取消/迟到/领奖幂等/UNKNOWN |
| Real E2E Tests | E16/E20/E21 |
| Definition of Done | 完整钓鱼和领奖状态有权威证据，Function/API/UI/预算/History闭环；缺X05时该模块不得PASS |

### W14 — 舰队加速、攻击委托及边界补齐

| 字段 | 工程约定 |
|---|---|
| Module ID | W14 |
| Module Name | 舰队加速、攻击委托及边界补齐 |
| Requirement IDs | M11；C401/C402/C406–408；C409保持禁用；BIZ-R02/R03/R11/R12a、PRO-005/009及原资源田占领/放弃 |
| Existing Functions | surveyFleet/planFleet/verifyFleet；Formation校验；movementCost；原维修停止 |
| Required Extensions | X08移动/宣战/攻击/结果/权限独立模型；X09仅D6内道具加速；原Inventory非零宠物绑定受证据闸门限制的分支；雷达领奖/派舰与海盗实战的独立资格/次数/目标/战报闭环；世界TreasureLoot争夺/战果/占有/结算/奖励闭环，原资源田占领放弃，世界/限时Boss与城战在线免费奖独立合同 |
| New Functions | attack/dispatch monitor/verify、item speed plan/verify领域适配；radarReward/radarDispatch/pirateBattle与TreasureLoot争夺/奖励、resourceField/Boss/onlineReward领域plan/verify，不新建Runner |
| Dependencies | W02,W03；复用现有Formation不依赖W08新推荐 |
| Shared Components | Ledger/Operation/History/同fleet独占/可信clock |
| API/UI Scope | P5-1/2维修移动攻击分层；加速必须展示道具成本，钻石规则禁用 |
| Data/Protocol Scope | FleetRepairParam/OnWater/MyFleets/WorldInfo/地图成本/独立战报；SIDE_UNVERIFIED不放宽；TreasureLoot/MyResFields/独立战报/WorldInfo、GotWorldOnlineRwdRequest→GotRewardResponse关联；不借主线LEFT |
| Budget Rules | 汽油保留线/每run累计/耐久/最大委托数；未知几何成本不派；不得RUBY；原资源田次数、宝藏赛季次数、Boss入场成本及免费奖资格共用配额；不买次数/门票 |
| Safety Rules | MOVE仅移动；declare/attack权限/保护时间/目标身份新鲜；UNKNOWN保留舰队占用 |
| Offline Tests | 原25Fleet等全回归、道具路径/成本、非零宠物、攻击结果错目标/不明胜负、维修与委任互斥；BIZ-R02/R03/R11/R12a/PRO005/009和资源田全部原分支、争夺≠派遣、空奖/已领、独立模式身份与UNKNOWN |
| Real E2E Tests | E17/E18/E20/E21/E24 |
| Definition of Done | 普通维修/编队/移动保留；攻击与D6允许道具各有独立权威效果模型；无合法免费路径则记录产品阻塞/Owner裁决，不用钻石凑数；雷达领奖/派舰、海盗实战、TreasureLoot完整闭环、原资源田执行、世界/限时Boss与免费在线奖分别可验证；海盗扫荡仍由W12，二者共享权威额度而不混称，不以移动或派遣成功替代战果 |

### W15 — 有界监听、跟随观察与动态决策

| 字段 | 工程约定 |
|---|---|
| Module ID | W15 |
| Module Name | 有界监听、跟随观察与动态决策 |
| Requirement IDs | M11；C403–405/C410 |
| Existing Functions | surveyNaval/navalView/evaluateNavalRules；现有精确playerId过滤 |
| Required Extensions | X07跨视野定位合同；有限观察轮次/事件游标/变化去重；动态规则输出计划再交Fleet |
| New Functions | boundedObserveTargets、planFollowObservation、selectAttackCandidate（领域组合） |
| Dependencies | W14；X07/X08证据前置；外层周期交W20 |
| Shared Components | executionDelay/Operation owner/run预算/History |
| API/UI Scope | P5-4事件流与停止/目标消失；P5-5可解释决策；不每页创建Runner |
| Data/Protocol Scope | CURRENT_RESPONSE_ONLY范围必须展示；稳定playerId+buildingId/坐标来源、stale/失联 |
| Budget Rules | 观察查询限频/最多轮次/总时限；攻击共用run汽油/配额/耐久预算 |
| Safety Rules | PASS不等授权；目标消失停、无全局证据不全局跟随；UNKNOWN不选择其他目标绕过 |
| Offline Tests | 重复/乱序推送、跨视野缺失、同昵称不同ID、过时power/position、取消等待、重复攻击抑制 |
| Real E2E Tests | E18/E20/E21/E23/E24 |
| Definition of Done | 有界观察与目标变更可追溯；攻击候选经W14同执行链；无全局定位证据保持受限且不能标完整跟随 |

### W16 — 基础日常清单、邮件、VIP与免费礼包

| 字段 | 工程约定 |
|---|---|
| Module ID | W16 |
| Module Name | 基础日常清单、邮件、VIP与免费礼包 |
| Requirement IDs | M12；C501–503/C511–513；BIZ-R10/R15及原挂机/免费招募/普通免费点金/竞技场/经验试炼 |
| Existing Functions | surveyDailies/runDailies/claimDailies、surveyTasks/runTasks、27Actions |
| Required Extensions | 权威领取状态/未读邮件处理/真正VIP资格、免费日周礼包区分；统一Activity读模型与adapter；邮件分页、挂机领取确认→升级依赖、拾荒真实floaterId、合法免费礼包码及原免费招募/普通免费点金/竞技场/试炼受控接入 |
| New Functions | mail/VIP/free-pack验证适配，daily checklist投影；原R10/R15领域资格/状态投影与verify适配，复用原动作/日常函数 |
| Dependencies | W02,W03,W12；邮件/VIP开发可先于扫荡集成 |
| Shared Components | Operation/Ledger quota/History/原驱动 |
| API/UI Scope | P6-1/2统一清单，勾选/禁用原因/一批计划；不是7个Runner |
| Data/Protocol Scope | EmailBox/QuickGotReadEmail/已读状态、GotVipDailyReward、DailyGiftPack/Week免费来源；月卡不冒VIP；邮件分页/AFK/海面实体/免费礼包码、各模式真实资格与结果源；不给任意领奖接口 |
| Budget Rules | 只免费/已有权益，不买付费；所有次数/资源纳预算；unknown价格拒绝 |
| Safety Rules | 领取需标志+奖励变化；静默不SUCCESS；主线/竞技场等模式各自验证，不泛用LEFT |
| Offline Tests | 邮件未读/无附件/VIP无资格/免费已领/付费伪ready/typed无效果、跨账号/取消；R10/R15、分页/无资格/已领/过期、收益未确认不升级、免费招募/点金/试炼原分支；D6负向派发0 |
| Real E2E Tests | E15/E20/E21 |
| Definition of Done | 基础清单同Function可从UI/Workflow执行，全部领取权威确认；保留未知/禁用而不批量解禁旧路由；R10/R15及原既有原子日常全覆盖，免费与普通材料资格有据，竞技场/试炼各模式独立验证 |

### W17 — 周活动、军备与季节活动完成

| 字段 | 工程约定 |
|---|---|
| Module ID | W17 |
| Module Name | 周活动、军备与季节活动完成 |
| Requirement IDs | M12；C514–517及C501–503全量；BIZ-R17/R17a–h全部原活动分支 |
| Existing Functions | Week/Season Snapshot、planChests、参考youdu纯算法/既有任务框架 |
| Required Extensions | X10明确各周补给/任务/奖励/军备活动ID与档位；活动目录版本化；周活跃与周活动分离 |
| New Functions | BIZ-R17a–h驱邪击杀/累计奖、罗盘抽取/累计奖、敕令开局/作答结算、活跃奖、签到的领域survey/plan/verify，版本化活动fixture |
| Dependencies | W16；X10证据前置 |
| Shared Components | 可信clock/Operation/Ledger/History/日周scheduler |
| API/UI Scope | P6-1/2活动/赛季/资格/免费档，统一清单及节点 |
| Data/Protocol Scope | WeekInfo/WeekOrder/活动专用协议；season/activityId/period/task/reward状态权威读源；rune合法0、局session身份/答案来源、activityId/period/checkId、可信clock；过季保留协议配置fixture |
| Budget Rules | 活动币/券/每日次数共享；付费档即使已有UI也拒绝购买；活动券/贡品/局次数预占；不开钻石入场/买券 |
| Safety Rules | 过期/换期使计划失效；免费周补给与军备领取不按消息名猜同一玩法 |
| Offline Tests | 跨期/跨日/时区/已领奖/缺档位/多个活动共享道具、旧期迟到/UNKNOWN；R17a–h逐分支、符文0/错局/已有局/未知答案不作答、跨日与跨账号、抽取UNKNOWN不再抽 |
| Real E2E Tests | E15/E20/E21/E22 |
| Definition of Done | C514–517与BIZ-R17a–h全部原列分支具明确玩法合同/成本/执行/权威复读/历史；过季保留离线版本证据，最终未遇活动仍REAL_UNVERIFIED，不用所选子集代全部 |

### W18 — 海商王价格、收益、买卖与巡航

| 字段 | 工程约定 |
|---|---|
| Module ID | W18 |
| Module Name | 海商王价格、收益、买卖与巡航 |
| Requirement IDs | M13；C521–524 |
| Existing Functions | reference tradeKing survey/view/planBuy/planTradeKing/mergeLearned；目标TradeInfo读 |
| Required Extensions | 提取价格/卖点/路线模型；适配当前商会币/货仓预算和typed+权威verify；精确非钻石支付策略 |
| New Functions | 目标Trade adapter的价格/收益投影与买卖/移动/道具加速plan/verify |
| Dependencies | W02,W03；可与W05港口并行，二者不同玩法 |
| Shared Components | Ledger/Operation/History/可信clock/父run预算 |
| API/UI Scope | P6-3价格/预期收益/仓位/路线/运行；静态可信节点 |
| Data/Protocol Scope | TradeInfo/TradeCity/Radar、Buy/Sell/Move/Speed；商会币不是RUBY；非同名GotTTradeReportResponse按实际协议 |
| Budget Rules | 资金/仓位/商品库存/油量和道具；卖出确认前不能把预计收入用于买入；总run上限 |
| Safety Rules | 不全局放开/Buy/；仅精确已证实非钻石请求；价格过期/地图缺失/UNKNOWN停止 |
| Offline Tests | 参考算法提取回归+未知卖点不买、超仓/共享资金/卖未确认不买、跨period/路线/typed无变化 |
| Real E2E Tests | E19/E20/E21/E22 |
| Definition of Done | 价格/收益可解释，买卖/移动均权威确认；单段与有界组合巡航adapter及测试完成即可供W20集成，持续调度验收归W20，不反向依赖W20完成 |

### W19 — 统一事件历史、持久记忆与重启读恢复

| 字段 | 工程约定 |
|---|---|
| Module ID | W19 |
| Module Name | 统一事件历史、持久记忆与重启读恢复 |
| Requirement IDs | M14/M15；C604/C606，所有业务历史 |
| Existing Functions | createExecutionHistory/createWorkflowStore；runLoop rejected；Stage history |
| Required Extensions | run→workflow→node→batch→action关联；Standalone Stage逐场事件；拒绝/冷却/日界持久记忆；版本兼容 |
| New Functions | 原execution-memory与History关联查询已实现，继续全入口接线，不创建新Store或数据库 |
| Dependencies | W01,W02；可提前并行开发schema，R5完成全业务接入 |
| Shared Components | 单写所有者/原子store/可信clock/脱敏 |
| API/UI Scope | P7-2/3统一运行/历史/记忆；按账号/run筛选，恢复只读状态 |
| Data/Protocol Scope | capabilityId/module/account/identity/source/时戳/资源/错误/stopReason；原UNKNOWN追加不改 |
| Budget Rules | 未决预算持久保留；可变收入不等自动扩额；记忆不代替实时余额 |
| Safety Rules | 重启不自动续发或继承permit；只读恢复与重新规划明确；rejected仅确定拒绝可记 |
| Offline Tests | 旧版本迁移/损坏/断电/截断/重复事件/账号__proto__/时区日界/冷却失效/UNKNOWN不能自动过期 |
| Real E2E Tests | E21/E22/E23/E24 |
| Definition of Done | 全入口运行证据可追溯；重启能查原历史和保护；不能将RECOVERED_STOPPED说成已恢复执行 |

### W20 — 全产品Workflow与统一有界调度

| 字段 | 工程约定 |
|---|---|
| Module ID | W20 |
| Module Name | 全产品Workflow与统一有界调度 |
| Requirement IDs | M14；C601–607/S1–S8；全部原Inventory273条目及8.1非C子项按原ID覆盖，重复条目映射不复制Function |
| Existing Functions | 原有限DAG/validateWorkflow/createWorkflowRunner/store；StageRunner；W02注册目录 |
| Required Extensions | 全业务节点、父预算、S3/S5/S6有界触发；一次运行范围授权；图编辑拖拽/条件/优先级；外层重复不改DAG无环 |
| New Functions | 复用原Workflow runPolicy/Runner/Store和事件来源，只补原缺口，不新建scheduler或任意JS |
| Dependencies | W04,W05,W07,W08,W09,W10,W11,W12,W13,W15,W16,W17,W18,W19 |
| Shared Components | 原Session单写/Operation/History/runBudget/可信clock |
| API/UI Scope | P7-1/2/3/P8-3；明确scope/期限/最大轮次/运行时/停止；条件UNKNOWN显示 |
| Data/Protocol Scope | 静态registry schema；有限DAG原50节点/100边/200步/WAIT≤60s兼容；Schedule时区/错过/事件游标 |
| Budget Rules | 一次run预算固定总上限+子permit；每轮新鲜survey；UNKNOWN不返预算；收入利用需独立明确policy |
| Safety Rules | 默认禁用；实现本报告所列有限run授权合同并保留逐批模式，运行时必须显式授权具体scope/期限/次数/预算；重启不静默运行；D6任何层均拒 |
| Offline Tests | 所有节点真实adapter合成集成、条件分支/优先级/上限/跨日/事件重复/停止/许可过期/多账号独立 |
| Real E2E Tests | E19/E20/E21/E22/E23/E24 |
| Definition of Done | 全部允许业务及非C子项可从静态目录受控调用；C409仅D6禁用描述，C005仅内部传输不成为任意请求节点；有界自动执行复用原引擎，许可可撤销且不无限 |

### W21 — P0–P8全平台产品交互与一致性

| 字段 | 工程约定 |
|---|---|
| Module ID | W21 |
| Module Name | P0–P8全平台产品交互与一致性 |
| Requirement IDs | M0–M14；42项P及95C映射；全部原Inventory273条目及8.1非C子项按原ID覆盖，重复条目映射不复制Function |
| Existing Functions | 现有page/gameplay-page/AccountViewGuard/所有业务view |
| Required Extensions | 专业表单/业务表/资源缺口/统一运行面板；页面引用同Function；高级JSON保留但不强迫用户填协议 |
| New Functions | 仅缺失业务投影/表单组件；不新增页面执行器 |
| Dependencies | W03,W04,W05,W07,W08,W09,W10,W11,W12,W13,W15,W16,W17,W18,W19,W20 |
| Shared Components | 同API合同/registry/安全DOM/account guard |
| API/UI Scope | 全部42P逐项验收，P5-3明确禁用；跨页同能力合并导航而不改业务定义 |
| Data/Protocol Scope | UI字段由Schema/事实决定；来源/更新时间/可执行原因可见 |
| Budget Rules | 显示精确成本/余额/保留线/批次总额，预期收益标非已实现 |
| Safety Rules | 账号切换清旧plan/permit；按钮状态只是辅助，后端门控始终权威；敏感H确认独立 |
| Offline Tests | VM DOM/路由/表单/schema/屏幕交互；42P覆盖、旧响应不污染、同候选跨页一致 |
| Real E2E Tests | E01–E24相应UI证据 |
| Definition of Done | 42P每项有C/Function/API/测试映射，EXCLUDE明确；原要求的可操作界面不以JSON占位冒充 |

### W22 — 全平台集成、离线验收准备与交付治理

| 字段 | 工程约定 |
|---|---|
| Module ID | W22 |
| Module Name | 全平台集成、离线验收准备与交付治理 |
| Requirement IDs | M0–M15；全部95C、既有非C交付和D1–D9；全部原Inventory273条目及8.1非C子项按原ID覆盖，重复条目映射不复制Function |
| Existing Functions | 现有测试体系/安全Harness/全部领域adapter |
| Required Extensions | 集成夹具、R7/R8证据模板、运行资产预检/恢复指引、README与最终矩阵对账 |
| New Functions | 只新增必要集成测试/helper及文档，无生产第二实现 |
| Dependencies | W21（传递依赖全部W01–W20） |
| Shared Components | 全部公共组件/唯一目录/History/安全sink |
| API/UI Scope | 端到端本地Console/假客户端/多账号；不连接真实游戏 |
| Data/Protocol Scope | 固定测试资产manifest/schema版本；输出C-P-S-D到源码/测试/结果索引 |
| Budget Rules | 全资源争用、次数/UID/run上限验证；D6负向覆盖 |
| Safety Rules | 所有旧失败证据保留；测试失败修实现不删断言；本轮计划不提交，后续按阶段独立提交 |
| Offline Tests | 先定向后统一R7全量原npm test等价链；缺资产明示，不吞失败/新增skip |
| Real E2E Tests | E01–E24，仅R8获独立真实授权后执行 |
| Definition of Done | 全部W01–W21工作包DoD与外部证据关闭、集成定向检查和离线验收准备完成；冻结待R7验证提交树及资产；R7全量PASS为最终离线验收，不作W22前置条件；R8具体请求/预算届时生成 |

## 10. 依赖DAG、完整顺序与连续开发规则

### 10.1 八个执行阶段

| 原R阶段 | 工作包/原阶段来源 | 依赖与完成标准（不另设审批） |
|---|---|---|
| R1 公共合同与交付安全 | W01/W03可并行→W02；原PHASE1/8/9缺口 | 单写所有者、恢复/门控、facts/clock与静态adapter/父预算合同离线可验 |
| R2 已有核心业务补齐 | W04/W05/W06/W08并行；W06→W07；原PHASE2/3及Hero | 核心现有执行链补齐且注册；证据障碍只冻结对应分支，不要求真实验收 |
| R3 联盟/Museum/扫荡/基础日常 | W09/W10/W11/W12并行；W12→W16集成；原PHASE4/6/7 | 日限/冷却/pending/配额有可信来源；领域定向测试通过 |
| R4 复杂玩法与证据闭环 | W13/W14/W17/W18并行；W14→W15；原PHASE5/6/7 | 钓鱼/攻击/跟随/道具/活动合同证实，所有计划内业务完成；外证未决不能伪造PASS |
| R5 调度与持久运行整合 | W19可从R1后提前开发；领域齐备→W20；原PHASE8 | 所有业务节点/记忆/历史/父预算/S1–S8及有限授权合同集成 |
| R6 全平台产品交付集成 | W21→W22；原PHASE9 | 42P逐项、C-P-S-D追踪、已交付附加能力回归、文档/资产/证据模板齐备 |
| R7 统一离线回归 | 不新增业务工作包；基于W22冻结提交树运行 | 全量原selftest+Node tests、API/UI/多账号/重启/预算/UNKNOWN集成；失败修实现后按影响重测；新失败/skip无隐藏 |
| R8 统一真实游戏E2E | R7全部通过、Owner审阅具体请求/预算并授权；E01–E24按依赖执行 | 全部计划内真实效果+权威复读+资源变化+清理；发现异常仅停止受影响链并保留首错；有未验必标未验 |

R阶段不沿用PHASE4名称掩盖多个原阶段。R1–R6连续开发时每模块做必要定向离线测试、每阶段独立提交；不重复耗时全套来等人为确认。R7统一广覆盖回归，R8是一轮统一验收活动中的24组场景，仍按具体账号、动作、资源预算逐组限制授权。不是一个无限制“一键全功能”许可。

一个合法拓扑施工序列：W01/W03 → W02 → {W04,W05,W06,W08,W09,W10,W11,W12,W13,W14,W18,W19}；W06→W07；W12→W16→W17；W14→W15；所有领域及W19→W20→W21→W22→R7→R8。阶段表表达推荐合并节奏，DAG才是可开工依赖；例如证据成熟的W18不必等联盟被外证阻塞。

### 10.2 可视DAG

~~~mermaid
flowchart TD
  A[W01 安全/恢复/单写] --> C[W02 Adapter/注册/父预算]
  B[W03 账号/事实/时钟/资产] --> C
  C --> D[W04 城市订单生产]
  C --> E[W05 港口]
  C --> F[W06 英雄基础]
  F --> G[W07 英雄高级]
  C --> H[W08 阵容战斗]
  C --> I[W09 互助求助]
  C --> J[W10 科技]
  C --> K[W11 Museum]
  C --> L[W12 扫荡]
  C --> M[W13 钓鱼]
  C --> N[W14 舰队攻击/道具]
  N --> O[W15 监听/跟随/决策]
  L --> P[W16 日常基础]
  P --> Q[W17 周活动/军备]
  C --> R[W18 海商王]
  A --> S[W19 记忆/历史]
  C --> S
  D & E & G & H & I & J & K & L & M & O & P & Q & R & S --> T[W20 Workflow/调度]
  T --> U[W21 全UI集成]
  U --> V[W22 交付集成]
  V --> X[R7 统一离线]
  X --> Y[R8 24组真实E2E]
~~~

### 10.3 并行边界与共享文件风险

- W01与W03可分别做恢复/所有者和facts/clock/数据资产，W02消费接口后集成；History/Session修改统一集成人合入。
- R1合同冻结后，City/Orders、Port、Hero、Formation、Alliance、Museum、Fishing、Activities、Trade各领域算法/验证与测试可并行。W05仅改Fleet中的cargo区域，与W14改Fleet维修/移动存在同文件冲突，应由同一维护者串行合入或先提交纯view helper，禁止各自复制Fleet执行器。
- W09互助与W10科技业务不同，但alliance.mjs/settings/page/registry共享，先固定导出接口，领域小提交按序整合；不以W09帮助外证缺失阻断科技读取/开发。
- W06→W07、W14→W15、W16→W17必须按领域依赖串行。W19的schema/存储测试可在R1后与业务并行，最终采纳放R5。
- server.mjs、operation-service.mjs、function-registry.mjs、actions.mjs、resource-ledger.mjs、execution-history.mjs、page.mjs/gameplay-page.mjs、协议/配置manifest是高冲突文件，由一名集成人串行编辑。领域分支提交adapter导出/测试/路由需求，不各改公共引擎。
- 本轮没有创建分支/worktree。未来并行可用独立任务文件边界或隔离worktree，但不覆盖共享未提交修改；分阶段提交，不自动merge main/push。

### 10.4 机器可读依赖（仅报告内，不增加目录）

~~~json
{
  "schemaVersion": 1,
  "base": "a505019",
  "dependencies": {
    "W01": [],
    "W03": [],
    "W02": [
      "W01",
      "W03"
    ],
    "W04": [
      "W02",
      "W03"
    ],
    "W05": [
      "W02",
      "W03"
    ],
    "W06": [
      "W02",
      "W03"
    ],
    "W07": [
      "W06"
    ],
    "W08": [
      "W02",
      "W03"
    ],
    "W09": [
      "W02",
      "W03"
    ],
    "W10": [
      "W02",
      "W03"
    ],
    "W11": [
      "W02",
      "W03"
    ],
    "W12": [
      "W02",
      "W03"
    ],
    "W13": [
      "W02",
      "W03"
    ],
    "W14": [
      "W02",
      "W03"
    ],
    "W15": [
      "W14"
    ],
    "W16": [
      "W02",
      "W03",
      "W12"
    ],
    "W17": [
      "W16"
    ],
    "W18": [
      "W02",
      "W03"
    ],
    "W19": [
      "W01",
      "W02"
    ],
    "W20": [
      "W04",
      "W05",
      "W07",
      "W08",
      "W09",
      "W10",
      "W11",
      "W12",
      "W13",
      "W15",
      "W16",
      "W17",
      "W18",
      "W19"
    ],
    "W21": [
      "W03",
      "W04",
      "W05",
      "W07",
      "W08",
      "W09",
      "W10",
      "W11",
      "W12",
      "W13",
      "W15",
      "W16",
      "W17",
      "W18",
      "W19",
      "W20"
    ],
    "W22": [
      "W21"
    ]
  },
  "releaseGates": {
    "R7": [
      "W22"
    ],
    "R8": [
      "R7",
      "OWNER_REAL_E2E_AUTHORIZATION"
    ]
  }
}
~~~

所有工作包继承共同DoD：C/P/S清晰、Function确有调用者、可靠参数与账号授权、共享预算与锁、写前复核/写后权威效果、UNKNOWN/取消/迟到保护、持久记录及相应离线测试；新源码/接口必须有必要性和兼容影响说明。EXISTING_FUNCTION已有部分不重新开发，但缺UI/调度/恢复仍必须在对应工作包交付。

## 11. 最终统一真实E2E矩阵（24组，当前全部为计划）

R8从E01/E02开始，业务组按实际前置准备，E20组合在单域效果全部确认后执行，E21–E23审查异常/恢复/清理。E24是世界Treasure，独立于E14 Museum；非C补充范围作为所属组的独立子场景登记，绝不以同组某一条成功替代其他条。24是场景组数，不是请求次数或已通过数。

四层结果必须分别记录：**本地派发尝试/帧发送证据 → 服务器typed/Prompt/push结果 → 业务状态实际变化 → 新鲜权威复读确认**。frame事件若发生在socket.send之前不能单独证明服务器收到。typed SUCCESS、静默未拒绝或UI提示均不足以填最终CONFIRMED。

每个实际子场景证据模板必须含：冻结Git HEAD+工作树差异哈希、协议/配置manifest、环境/时区；脱敏account ID、client/generation、run/workflow/node/batch/action ID；前态/目标identity/来源/更新时间；拟请求名和精确body摘要；授权scope/预算/有效期（不记bearer permit）；dispatchedAt/socket-send证据/实际Response类型与归属；预期/实际效果；资源before/after/delta；权威复读来源/字段/时间/CONFIRMED理由；首错与异常停止；Runtime清理结果；未执行/未触发分支原因。Token/Sign/Cookie/登录帧和私钥不得进入普通证据。

只允许在R7通过后，基于当时新鲜候选生成可审阅的具体账号、目标、请求、最大次数/耗时/资源总额及清理方案，再取得真实操作授权。本报告没有授权真实登录、读取真实凭证、MITM/CA或任何写请求。历史PHASE2过期升级许可不可复用。正常验收优先使用既有合法账号路径，不为验收重捕Token。

### E01 — 登录、账号切换、区服与Runtime

| 字段 | 场景合同 |
|---|---|
| Group ID | E01 |
| 业务/覆盖 | 登录、账号切换、区服与Runtime |
| 模块/需求 | W01/W03；C001–003 |
| 前置状态 | 已有正常凭证在受控路径使用；Owner指定A/B账号及区服；无活动任务/未知写；先核身份 |
| 请求 | LoginRequest、GameWorldList/Group；区服进入须单独列入授权 |
| 预期Response | LoginResponse成功及PlayerInfo身份/区服；列表typed；不得以connect事件代替完整READY |
| 预期游戏状态变化 | 选择/断开/重连按显式操作，A/B隔离；指定world进入只允许获批角色，不误建新角色 |
| 资源变化 | 登录/读N/A；区服新角色潜在写须独立预算/范围 |
| 权威复读方式 | 新PlayerInfo+world列表及Session account/generation/client；首Ping/Pong元数据和loop delay |
| 异常停止条件 | 身份/区服不符、首Pong/任意超时即停止，不换Token/自动重连 |
| 清理要求 | 检查stop/disconnect分支时断开并核socket/tick/login/pending/watchers/listener清零；正常验收可在已授权共享Session下转E02，E23统一断开清理；已断开的分支必须按原授权重新登录，不假设仍READY |

### E02 — 完整Snapshot及多页一致

| 字段 | 场景合同 |
|---|---|
| Group ID | E02 |
| 业务/覆盖 | 完整Snapshot及多页一致 |
| 模块/需求 | W03；C004/C005与48 DAT |
| 前置状态 | E01身份/READY已确认且共享验收Session仍存活；若E01结束已断开，须在E01已授权范围重新建立READY；无互斥写，资产manifest满足 |
| 请求 | 仅ENTRY_QUERIES固定48；缓存切页/导出不得重发游戏请求 |
| 预期Response | 48各自配对Response；记录SUCCESS/FAILED/NOT_EXECUTED、raw、解析来源；27解析21纯原始 |
| 预期游戏状态变化 | 本次采集与页面资源/英雄/建筑/舰队一致；保留失败原态而非默认0 |
| 资源变化 | 只读；记录查询次数/耗时，无任何隐式entry信号/业务写 |
| 权威复读方式 | 各Request outcome/sourceAt/generation；游戏UI对照可辅助但不替代权威Response |
| 异常停止条件 | 身份变化/部分必需数据失效不准进入依赖写；缺查询不报48通过 |
| 清理要求 | 释放采集锁/监听；缓存不清除原证据；统计实际48发送与重用次数 |

### E03 — 建筑建造、升级及道具加速

| 字段 | 场景合同 |
|---|---|
| Group ID | E03 |
| 业务/覆盖 | 建筑建造、升级及道具加速 |
| 模块/需求 | W04；C101–104/BIZ-A24 |
| 前置状态 | E01/E02；选现有合法level0槽或可升级建筑；新鲜等级/队列/前置；精确资源预算；重做PHASE2未派发升级 |
| 请求 | BuildBuilding或UpgradeBuilding；合法加速另独立SpeedUpUpgradeBuilding(type2)；具体目标/成本列授权 |
| 预期Response | 无专属Response的请求只看watch/push，不以静默成功；typed资源读正常 |
| 预期游戏状态变化 | 建造/升级工时或目标等级变化；加速剩余工期减；达到竣工状态后另授权完成 |
| 资源变化 | GOLD/蓝图/材料/加速器精确前后；不补钻石；其他来源变化须解释 |
| 权威复读方式 | OnWater目标buildingId等级/开始结束时间+AllItem/AllResource；并核旧前态身份 |
| 异常停止条件 | 旧计划、成本/队列变化、心跳/解码/复读不明停止并保持UNKNOWN（已派时） |
| 清理要求 | 释放任务owner；不自动撤销建造或为清理加速；历史保留实际建筑进度 |

### E04 — 居民订单提交与免费刷新

| 字段 | 场景合同 |
|---|---|
| Group ID | E04 |
| 业务/覆盖 | 居民订单提交与免费刷新 |
| 模块/需求 | W04；C121–128 |
| 前置状态 | E03无冲突；规则/四单身份/完成数/库存可靠；REFRESH另需X03权威免费额度 |
| 请求 | 一次FinishWorkerOrder；刷新单独DenyOrder；两个动作独立具体permit |
| 预期Response | FinishWorkerOrderResponse不能独自代表已交单；DenyOrder无专属Response看权威读 |
| 预期游戏状态变化 | SUBMIT旧单变化/消失且完成数恰+1；REFRESH为新身份且免费次数/冷却按合同变化 |
| 资源变化 | 提交需求精确扣料、EXP/金币按可靠来源核；刷新只免费额度，不付费 |
| 权威复读方式 | 新OnWater订单身份/计数+物资/资源；同index新单不继承旧授权 |
| 异常停止条件 | KEEP/REVIEW不发；额度未知/金币未知阻断对应规则；错单/UNKNOWN不再交一次 |
| 清理要求 | 历史区分preview/request/effect/verify；不得为清理刷新新单或复用旧permit |

### E05 — 生产决策、缺口和启动

| 字段 | 场景合同 |
|---|---|
| Group ID | E05 |
| 业务/覆盖 | 生产决策、缺口和启动 |
| 模块/需求 | W04；C111/C113–115 |
| 前置状态 | 存在可靠订单/港口等缺口、空位/配方、策略明确；所有在产/成品抵扣；禁用/零缺口负分支 |
| 请求 | StartFactoryProduce命名动作；策略只生成本批候选 |
| 预期Response | 无专属Response保持待复读；GameClient watch仅UNKNOWN |
| 预期游戏状态变化 | 对应工厂队列新增该产品或权威已完成成品增加；其他工厂变化纳入缺口复评 |
| 资源变化 | 配方材料精确扣减，共享预算与厂位预占；不因新收取自动扩大本run预算 |
| 权威复读方式 | OnWater精确工厂队列/产品/finishedProducts +库存，必要记录实际即时完成 |
| 异常停止条件 | 未知槽位/成本/需求已覆盖/队列被占拒绝；未确认停止 |
| 清理要求 | 停止调度不撤销已入队生产；保留队列前后与资源/History |

### E06 — 成品收取、竣工、生产日报与农田供给

| 字段 | 场景合同 |
|---|---|
| Group ID | E06 |
| 业务/覆盖 | 成品收取、竣工、生产日报与农田供给 |
| 模块/需求 | W04；C112/C116；BIZ-R14/R16a–h |
| 前置状态 | 存在成熟成品/到期建筑/合法农田；覆盖完整生产事件时才能验完整当日量；跨日fixture另离线验 |
| 请求 | GainFactoryProduce/CollectBuildingProduct/FinishUpgradeBuilding；农田Plant/Harvest按已证实协议；自动工作/材料包另明确授权 |
| 预期Response | 有typed仍需效果；无专属请求按push/复读；不能以操作次数当产量 |
| 预期游戏状态变化 | 成品减少与库存增加一致；建筑竣工等级/状态；农田播种/收割/种子供给/委任耗时按合同 |
| 资源变化 | 成品/作物/种子/包/材料数量；完整日量需证明所有来源覆盖，库存差不足以证实 |
| 权威复读方式 | OnWater各精确目标+AllItem/AllResource+事件覆盖游标；日报source events逐条回查 |
| 异常停止条件 | partial coverage不得称完整当日；包成本/委任未知停对应分支，UNKNOWN不重复收 |
| 清理要求 | 不销毁剩余产物或为清理消耗材料；保留覆盖边界与未纳入原因 |

### E07 — 港口装货、缺货与到港奖励

| 字段 | 场景合同 |
|---|---|
| Group ID | E07 |
| 业务/覆盖 | 港口装货、缺货与到港奖励 |
| 模块/需求 | W05；C131–134 |
| 前置状态 | 指定shipIndex/cargoIndex、asset、filled=false与可靠库存；另有ARRIVED可领取船 |
| 请求 | FillCargoShipRequest；领奖单独DrawShipRewardRequest |
| 预期Response | 两者配对typed；奖励回包含精确ship与非空reward |
| 预期游戏状态变化 | 指定货格filled=true且原资产身份一致；领奖旧到港状态被消费 |
| 资源变化 | 装货物料精确扣减；领奖物品/资源增加与reward一致；不买缺料 |
| 权威复读方式 | CargoShips新读+AllItem/AllResource；required/have/missing明细核对 |
| 异常停止条件 | 船/格/asset变化/缺货/typed奖励与状态不一致即停；UNKNOWN不重装/重领 |
| 清理要求 | 保留船实际航行/等待，不自动加速或补满整船；历史关联精确格 |

### E08 — 英雄升级、升星、技能

| 字段 | 场景合同 |
|---|---|
| Group ID | E08 |
| 业务/覆盖 | 英雄升级、升星、技能 |
| 模块/需求 | W06；C221–224 |
| 前置状态 | 指定heroId/当前等级星级技能/玩家上限；碎片/经验/书预算；不自动扩大到全英雄 |
| 请求 | HeroLevelUp/HeroStarUp/HeroSkillLevelUp逐次独立构造 |
| 预期Response | Star typed；Level/Skill实际无专属Response则用push；typed也不代替AllHero效果 |
| 预期游戏状态变化 | 目标属性按一档变化，未解锁技能不操作；其他英雄不受误影响 |
| 资源变化 | 对应经验/碎片/通用碎片/技能书精确变化，跨英雄共用额度 |
| 权威复读方式 | AllHero精确heroId+AllItem/AllResource；玩家等级与配置来源 |
| 异常停止条件 | 上限/归属/成本变、推送无法归属、效果不明停；不把typed直接SUCCESS |
| 清理要求 | 不为清理回滚等级/星级或再消耗材料；记录每一级动作 |

### E09 — 专武、纹章、装备及Inventory附加成长

| 字段 | 场景合同 |
|---|---|
| Group ID | E09 |
| 业务/覆盖 | 专武、纹章、装备及Inventory附加成长 |
| 模块/需求 | W07；C225–230/BIZ-R07/R08/R09；PRO007藏品由E14独立验收 |
| 前置状态 | 指定实例UID/槽位/归属、当前和候选状态、配置上限；不可逆替换H确认；制造/宠物合法前态 |
| 请求 | 各已确认Exclusive/Badge/Equip请求；装备制造收取、Pet培育投喂成熟等独立授权分支 |
| 预期Response | 按实际类型表；无同名响应不用虚构；记录typed/push |
| 预期游戏状态变化 | 专武等级/星；纹章和装备属性/槽位归属；制造队列/收取；Pet成长/成熟各自验证 |
| 资源变化 | GOLD/精铁/经验/碎片/饲料/道具及实例唯一性；不隐式分解/购买付费 |
| 权威复读方式 | AllHero/Equips/Badges/AllPet和OnWater制造状态+库存；每子域单独权威源 |
| 异常停止条件 | UID被占/归属变化/缺语义不做；UNKNOWN冻结该实例及预算。BIZ-R07准备须按闲置＋在产计数、不计佩戴，明确允许配方及同量顺序；原队列/数量变化、收取拒绝或UNKNOWN不得进入制造；父预算不足不因收取扩额，执行不动态换配方 |
| 清理要求 | 不为恢复旧装自动触发不可逆操作；旧装备去向明确；只清任务/监听 |

### E10 — 阵容保存、切换、极限复制及本地完整队伍预设

| 字段 | 场景合同 |
|---|---|
| Group ID | E10 |
| 业务/覆盖 | 阵容保存、切换、极限复制及本地完整队伍预设 |
| 模块/需求 | W08；C211–215/FRM-005/007/PRO-010 |
| 前置状态 | 已解锁布局/合法英雄；原阵容完整含petUid；复制源战报可靠；解锁图纸另授权 |
| 请求 | SaveFormation；模板解锁仅已证实非钻石UnlockFormationPreset单独permit；本地预设保存无游戏请求；其他模式按原PRO010各族独立query→save→复读，不泛化module直通 |
| 预期Response | SaveFormationResponse含完整formation；解锁推送/新读；本地存档持久化 |
| 预期游戏状态变化 | 当前完整英雄/坐标/preset/pet与目标精确一致；复制缺英雄给原因不乱换；预设名不冒presetId |
| 资源变化 | 保存已知无支付范围；解锁仅已证实图纸成本，保留线；不自动购买 |
| 权威复读方式 | GetFormation(module1)+MyFormationPreset；保存typed和后读双比对；本地预设重启复读；各非主线模式分别核槽位/人数/pet/序列与对应权威保存源 |
| 异常停止条件 | 缺字段/坐标冲突/pet精度/未解锁/错误战报停；UNKNOWN不挑战、不自动保存第二次 |
| 清理要求 | 需要恢复原阵容时也必须新计划/新permit并复读；保留旧新阵容证据 |

### E11 — 主线、战报分析、建议及其他模式隔离

| 字段 | 场景合同 |
|---|---|
| Group ID | E11 |
| 业务/覆盖 | 主线、战报分析、建议及其他模式隔离 |
| 模块/需求 | W08；C201–209；STG017/PRO010 |
| 前置状态 | 当前mainlineStage；maxAttempts/目标/10–11s/stopOnDefeat显式有限配置；Formation proof有效 |
| 请求 | 原Stage API→ChallengeStage串行；战败建议保存须新具体授权；其他模式另选独立授权测试 |
| 预期Response | ChallengeStageResponse关卡/BT_MAINLINE/自有Boolean；Prompt限频独立事件 |
| 预期游戏状态变化 | 胜利推进；明确战败立即停止（若实际遇到）；非终止胜利等10–11s；实际left/right分析不重发挑战 |
| 资源变化 | 记录响应reward与资源变化；其他模式次数/票/材料按其独立预算，不借主线零成本 |
| 权威复读方式 | 新PlayerInfo或已确认推进源+本次关联battle stats/initialData；其他模式独立side/result证据 |
| 异常停止条件 | 错关/缺Boolean/非主线模式/限频/未知停；不为凑战败重试或主动打无授权关 |
| 清理要求 | 停止Runner/Timer/监听；保留每次attempt和未出现分支NOT_EXERCISED，不冒称全部实测 |

### E12 — 联盟成员、互助、求助、订单、福利及商船

| 字段 | 场景合同 |
|---|---|
| Group ID | E12 |
| 业务/覆盖 | 联盟成员、互助、求助、订单、福利及商船 |
| 模块/需求 | W09；C301–305/PRO002/BIZ-R01/R05/R06 |
| 前置状态 | 正确guild/player/member/reqId、日限/usage/cooldown/season和stock可靠；求助阈值/已有单核对 |
| 请求 | Help/Ask/Cancel/GotAid/FinishGuildOrder/GotWelfare；联盟商船补货/船长独立按已确认协议 |
| 预期Response | 多静默请求靠复读；有typed也核业务状态；Fort是另子域 |
| 预期游戏状态变化 | 只对获批成员/物品/reqId帮助；求助新身份/冷却/额度；订单数+1；福利旧可领消失；商船角色变化 |
| 资源变化 | 帮助一件/reqId及日配额；订单/补货精确扣料；领取奖励变化 |
| 权威复读方式 | GuildAidList/MyGuildAid/GuildMember/GuildInfo/Counter/相关商船权威读 |
| 异常停止条件 | 生产source仍null则BLOCKED不验写；成员换盟/冷却不明/响应不明停 |
| 清理要求 | 不为清理取消已受助单或消耗新订单；原pending/领取记录保留 |

### E13 — 联盟科技及堡垒独立业务

| 字段 | 场景合同 |
|---|---|
| Group ID | E13 |
| 业务/覆盖 | 联盟科技及堡垒独立业务 |
| 模块/需求 | W10/W09；C306/C307/PRO002 Fort |
| 前置状态 | 有成员权限、tech前置/目标/材料；Fort独立city/fort事实与权限，不混互助 |
| 请求 | UpgradeGuildTech；PRO-001 ResetGuildTech已证实免费/普通材料路径单独精确授权；原Fort由W09独立DonateFort候选和许可验收，不混为互助 |
| 预期Response | 对应typed回复；仍需等级/建设进度权威复读 |
| 预期游戏状态变化 | 科技准确+1或目标范围；合法重置按证实合同恢复等级/返还资源；Fort建设进度/资源按独立语义改变 |
| 资源变化 | 科技/建设材料及重置消耗/返还精确变化；不购买付费路径 |
| 权威复读方式 | GuildTechInfo和独立Fort info/Counter+库存 |
| 异常停止条件 | 权限/前置/赛季变化、typed无效果、UNKNOWN停 |
| 清理要求 | 不重置科技作清理；只释放执行owner，保留实际长期状态 |

### E14 — Museum展陈、收益、探索结算/领奖与藏品

| 字段 | 场景合同 |
|---|---|
| Group ID | E14 |
| 业务/覆盖 | Museum展陈、收益、探索结算/领奖与藏品 |
| 模块/需求 | W11；C141–144/PRO006/007 |
| 前置状态 | 展陈/探索队伍位/英雄/次数/成本可靠；到期pending身份和已结算未领奖可恢复；藏品实例已知 |
| 请求 | 展陈/升级/收益/StartExplore；CompleteExplore与MuseumReward分开；藏品培养按独立已证实协议 |
| 预期Response | Start/Complete/Reward typed记录；grade/progressGain/fixed/randomReward不能代替已领取 |
| 预期游戏状态变化 | 展陈精确位置/等级；收益复读；探索出发→到期→独立结算→独立领奖；藏品属性变化 |
| 资源变化 | 成本factor/道具/收益/探索奖励/培养材料逐步核；不把收益当探索奖励 |
| 权威复读方式 | MuseumInfo+pending/result权威源+AllAntique/AllItem/AllResource；重启后身份仍匹配 |
| 异常停止条件 | pending不可读则BLOCKED；到期/typed但未结算或未领不SUCCESS；UNKNOWN不再领奖 |
| 清理要求 | 不自动换回展陈/开新探险或花加速清理；保留占用队伍/待领奖状态 |

### E15 — 扫荡、邮件、VIP、免费包、周活动/军备及参考日常

| 字段 | 场景合同 |
|---|---|
| Group ID | E15 |
| 业务/覆盖 | 扫荡、邮件、VIP、免费包、周活动/军备及参考日常 |
| 模块/需求 | W12/W16/W17；C151/C501–517/BIZ-R10/R15/R17a–h |
| 前置状态 | 每子场景指定活动/任务/period/奖励ID与资格；扫荡quota可靠；免费/已有权益；普通AFK须明确等级/区间并依可信61秒门槛，等级奖/升级/任务领奖独立；有限收益→升级须原来源/固定自有成本/父预算与总期限，准备不派发；礼包码等独立范围 |
| 请求 | 原命名驱动；VIP真请求而非MonthCard；Week/军备按已确认链；幽都驱邪/罗盘/敕令/签到分开 |
| 预期Response | 实际typed/push逐项；周活跃箱不能代周活动，码兑换无对应typed不猜 |
| 预期游戏状态变化 | 扫荡扣次且目标变化；邮件附件已领；VIP/包/任务领取标志；活动进度；AFK先领取再升级；招募/点金结果 |
| 资源变化 | 次数/券/道具/GOLD/奖励精确核；所有RUBY/付费负分支派发0；扫荡与日常共用额度 |
| 权威复读方式 | DailyTask/Counter/Email/Vip/Week/Season/活动专用读源及物资；每条事件标period。普通AFK专用新区间与完整库存/徽章/英雄独立净入，调查区间围栏；其他实例及断线回执未知不重放 |
| 异常停止条件 | 跨期/未知资格/价格/次数/敕令答案语义不足则停；部分完成不整体PASS |
| 清理要求 | 不自动继续剩余清单或转付费；保留每项成功/未执行/未知，活动关闭后不重试旧计划 |

### E16 — 钓鱼业务

| 字段 | 场景合同 |
|---|---|
| Group ID | E16 |
| 业务/覆盖 | 钓鱼业务 |
| 模块/需求 | W13；C152 |
| 前置状态 | X05调用语义已解决；指定鱼/次数/饵/当前Fishing任务与容量；不将图鉴当状态 |
| 请求 | StartFishing；GainBigFish/DrawFishReward按已确认顺序分别授权 |
| 预期Response | StartFishingResponse；其他真实类型或推送；不虚构结算回包 |
| 预期游戏状态变化 | Fishing任务/计时/结果/领取身份各层状态变更且可恢复 |
| 资源变化 | 已知饵/道具/次数扣量和鱼/奖励增加；未知收费不发 |
| 权威复读方式 | 业务权威Fishing状态+AllItem/资源/图鉴辅助，按具体合同 |
| 异常停止条件 | 任何语义/时间/状态身份不明停，不能自动再Start替代领奖 |
| 清理要求 | 保留尚在钓鱼/待领奖状态；不为清理取消或消费额外道具 |

### E17 — 舰队编队、维修、移动、道具加速、资源田

| 字段 | 场景合同 |
|---|---|
| Group ID | E17 |
| 业务/覆盖 | 舰队编队、维修、移动、道具加速、资源田 |
| 模块/需求 | W14；C401/C402/C406–408/BIZ-W15/16 |
| 前置状态 | fleet明确空闲/autoFight=false、耐久/维修参数、目标/地图几何/油量、编队归属；加速仅已证实道具 |
| 请求 | FleetSaveFormation/Repair/StopRepair/Move；item Speed；资源田Challenge/GiveUp独立 |
| 预期Response | 静默请求靠MyFleets/OnWater；移动不承诺战斗响应 |
| 预期游戏状态变化 | 精确fleet编队/维修开始或完成/停止/目标移动到达；资源田占领/放弃所有权；加速剩余时间 |
| 资源变化 | 汽油ceil单价×耐久/距离、保留线、道具/田次数与奖励；默认修理预算0则拒 |
| 权威复读方式 | MyFleets+OnWater完整编队、MyResFields/WorldInfo+资源 |
| 异常停止条件 | 正在委任/未知状态/非零pet无证/敌城油费不明不派；UNKNOWN锁舰队 |
| 清理要求 | 不以派返/停修作默认清理；需要业务回收也须新授权；停止所有外层调度 |

### E18 — 目标监听、跟随观察、动态攻击及独立海战

| 字段 | 场景合同 |
|---|---|
| Group ID | E18 |
| 业务/覆盖 | 目标监听、跟随观察、动态攻击及独立海战 |
| 模块/需求 | W14/W15；C403–405/C410/BIZ-R02/R03/R12a/PRO005 |
| 前置状态 | 稳定ID/定位范围/可靠时钟，最多轮次/总时限；攻击独立权限/保护/模式/结果合同已证实 |
| 请求 | 有界WorldInfo或合法事件；选目标→新permit→Declare/Attack；雷达/海盗/Boss/在线奖各独立 |
| 预期Response | 读响应与push可去重；攻击战报必须目标/模式关联；其他模式side无证则SIDE_UNVERIFIED |
| 预期游戏状态变化 | 位置变化事件流、目标消失停止；规则仅选合法目标；声明/移动/战斗/胜负分层；领奖独立 |
| 资源变化 | 查询节奏/轮数/攻击次数/汽油/耐久/奖励核；不是看到PASS就持续攻击 |
| 权威复读方式 | 稳定targetId+观察scope+独立战报/WorldInfo/MyFleets/Counter |
| 异常停止条件 | 跨视野缺失不猜位置、无权限/超限/限频/UNKNOWN停；不换目标绕过阻断 |
| 清理要求 | 清定时器/事件游标监听/owner；已派舰和未知战斗保留，不补发探索请求 |

### E19 — 海商王价格、低买高卖与巡航

| 字段 | 场景合同 |
|---|---|
| Group ID | E19 |
| 业务/覆盖 | 海商王价格、低买高卖与巡航 |
| 模块/需求 | W18；C521–524 |
| 前置状态 | 活动period开放、商品/港口/资金/仓位/路线/卖点可靠；新鲜价格；有限段数/时间 |
| 请求 | TradeBuy/Sell/Move/Speed等命名适配，卖出后复读再规划买入 |
| 预期Response | 配对typed不代表仓位/币到账；TradeSpeed仅非钻石已证实路径 |
| 预期游戏状态变化 | 货物增加/减少、商会币扣/入账、位置/航行变化；预期收益和实际利润分开 |
| 资源变化 | 商会币/舱位/商品可用量/道具上限；预计卖出不提前补预算 |
| 权威复读方式 | TradeInfo+TradeCity/Radar及对应库存/币/period；每段权威后态 |
| 异常停止条件 | 价格过期/卖点未知/仓位变化/typed无效果/UNKNOWN停，不全局放开Buy |
| 清理要求 | 不清仓/返航作默认清理；保留真实仓位/路线和未完成批次，停调度 |

### E20 — 跨业务Workflow、日周/事件调度和总预算

| 字段 | 场景合同 |
|---|---|
| Group ID | E20 |
| 业务/覆盖 | 跨业务Workflow、日周/事件调度和总预算 |
| 模块/需求 | W20；C601–607/S1–S8 |
| 前置状态 | 所有节点已注册且Function合格；图有限；账号/run总预算/期限/轮次/白名单明确；独立批准运行合同 |
| 请求 | 原Workflow/Operation各域请求；每轮survey→plan→子permit→execute→verify→history；定时/事件只触发受控流程 |
| 预期Response | 各域自己的Response/权威复读；图COMPLETED需所有必需节点CONFIRMED |
| 预期游戏状态变化 | City→Orders→Hero→Alliance/Museum/Fleet/Trade按图组合；条件/WAIT/分支/优先级/空计划行为正确 |
| 资源变化 | 所有节点竞争同run预算，UNKNOWN不返还；跨批不能突破总额/次数/UID占用；收入policy明确 |
| 权威复读方式 | run/node/batch/action关联历史+领域权威状态；实际顺序与图边一致 |
| 异常停止条件 | 任节点UNKNOWN/超时/失效/撤销授权停依赖后继；无无限循环；过期不自动新permit |
| 清理要求 | 停止scheduler/Workflow/Operation/Stage，保留游标/记忆；重启不得重用许可或静默续跑 |

### E21 — UNKNOWN权威复核与预算保护

| 字段 | 场景合同 |
|---|---|
| Group ID | E21 |
| 业务/覆盖 | UNKNOWN权威复核与预算保护 |
| 模块/需求 | W01；D8/C603/C606 |
| 前置状态 | 选择已授权小范围动作的自然未知或明确批准的受控断连分支；保留原DISPATCHING/identity/成本；不为造异常扩大游戏损失 |
| 请求 | 原动作至多一次；后续仅专用只读reconcile查询，不自动重发业务 |
| 预期Response | 可能无响应/late/typed已回但verify失败；分别记requestStatus与verification |
| 预期游戏状态变化 | 结果分类APPLIED/NOT_APPLIED/STILL_UNKNOWN，原UNKNOWN原样保留，追加恢复事件 |
| 资源变化 | 未确认成本/UID/配额继续占用；仅足够证据可审计释放，不以超时过期归零 |
| 权威复读方式 | 精确目标/身份/资源/业务计数权威多证据；同index替换不能推断not-applied |
| 异常停止条件 | 结果不可区分或读失败保持阻断；不能手动clear历史冒成功 |
| 清理要求 | 清读context/连接，保留未决记录/预算与首错；自然未知不可安全重现则本分支NOT_EXERCISED并保留离线证明 |

### E22 — 历史持久化、崩溃与重启只读恢复

| 字段 | 场景合同 |
|---|---|
| Group ID | E22 |
| 业务/覆盖 | 历史持久化、崩溃与重启只读恢复 |
| 模块/需求 | W19/W01；C604/C606 |
| 前置状态 | 已有成功/拒绝/未知run与完整脱敏history；备份证据；重启仅本次服务，不能触碰其他进程 |
| 请求 | 重启后只读history/config/workflow/memory；恢复前不得任何游戏写 |
| 预期Response | 本地API状态+保留UNKNOWN/RECOVERED_STOPPED；无需游戏Response也不能叫业务成功 |
| 预期游戏状态变化 | 原run/node/action/资源/错误/时间完整；旧版本迁移；账号隔离；重启不自动运行 |
| 资源变化 | 未决预算继续保留；已确认生产事件日报去重；日界记忆不吞未知 |
| 权威复读方式 | 磁盘文件元数据/哈希及API可见投影；必要权威状态复读须独立恢复授权 |
| 异常停止条件 | 文件损坏/写失败版本不明停写，不覆盖证据；不删除lock来强行启动 |
| 清理要求 | 释放本次服务owner；确认没有旧子进程和timer；保留持久文件与对账记录 |

### E23 — 停止、断线、失效、账号隔离与Runtime清理

| 字段 | 场景合同 |
|---|---|
| Group ID | E23 |
| 业务/覆盖 | 停止、断线、失效、账号隔离与Runtime清理 |
| 模块/需求 | W01/W03/W19；C002/C605/C606 |
| 前置状态 | A/B两个允许账号分别受限；A执行/等待，B独立状态；业务写前/中/后停止分支；真实账号失效不人为篡改凭证 |
| 请求 | stop/disconnect/失效回调；已发游戏请求不可撤销；只读缓存查询不创建Runtime |
| 预期Response | 状态CANCELLED/UNKNOWN按派发与否区分；保留首错，后续取消不覆盖 |
| 预期游戏状态变化 | A后继请求0，B不污染；旧generation/timer/response不改新A任务；账号删除保护仅在明确获批本地场景 |
| 资源变化 | A预算/指纹保留，B独立；不因UI切号把A许可给B |
| 权威复读方式 | 进程/Session/socket/tick/ack/loginTimer/pending/watchers/listener/owner与runId全核 |
| 异常停止条件 | 任何残留或跨账号污染失败；不重连来完成测试；失效未自然出现用离线故障证据标未实测 |
| 清理要求 | 关闭本次Console/Workflow/Stage/scheduler，端口/子进程无残留，不杀无关进程，不改代理/CA |

### E24 — 世界宝藏TreasureLoot（独立Museum）

| 字段 | 场景合同 |
|---|---|
| Group ID | E24 |
| 业务/覆盖 | 世界宝藏TreasureLoot（独立Museum） |
| 模块/需求 | W14/W15已交付扩展；PRO009/BIZ-R11 |
| 前置状态 | 赛季/次数/无人防守或已证实争夺分支、精确treasure UID、空闲舰队/油/耐久/autoFight=false；权限可靠 |
| 请求 | Stats/List/Rank/Defence；TreasureLootSendFleets；争夺/结算/领奖只在补齐各自证据后独立请求 |
| 预期Response | 派遣无专属Response靠MyFleets绑定；排名/防守typed只是读；不以派遣当抢占胜利 |
| 预期游戏状态变化 | fleet.treasureLootUid等目标绑定确认派遣；争夺胜负/占有/结算/领奖各自状态独立验证 |
| 资源变化 | 汽油/次数/耐久/奖励精确；maxAwards/赛季限制；UNKNOWN冻结舰队 |
| 权威复读方式 | TreasureLoot权威状态+MyFleets/奖励库存与独立战报；原target身份一致 |
| 异常停止条件 | 目标被防守/被抢/过期/油费不明/typed不明停；不能借Museum奖励判Treasure成功 |
| 清理要求 | 停止观察和外层图，不自动召回/再派或抢占其他目标；保留在途和待结算状态 |

### 11.1 最终判定规则

所有计划内子能力要逐项Function/API/UI/预算/效果/权威复读/历史通过，才能把组判完整通过。BLOCKED_EVIDENCE、NOT_EXERCISED、REAL_UNVERIFIED保留为非通过状态；若Owner明确缩减范围，须改需求基线/计数和DoD，不能在验收表直接删行。故障注入离线用例与真实业务未知自然出现的证据分开；无法安全触发真实限频/战败/失效时记录未实测，不为取得PASS扩大操作范围。

所有异常首错write-once脱敏保存；后续CANCELLED/清理不能覆盖原心跳/协议/服务端错误。停止受影响依赖链，其他已授权独立账号/只读分支是否继续按当轮具体授权，不自动恢复未知写。每组结束统计实际请求数/类型与预算，所有组结束统一核Runtime、端口、进程及历史持久性。


## 12. 外部证据、风险、Owner决策与施工治理

### 12.1 外部证据闸门登记

这些是证据工作，不是连接真实游戏的授权。优先使用现有本地协议、客户端完整调用点、配置、合法历史脱敏录制及可离线验证的状态模型。只有确实缺失且不能合理静态证明时才向Owner索取业务说明或安排最终受控取证；不能猜Request/body、凭名字拼业务、伪造server facts。每一闸门记录来源版本/哈希、字段与单位、账号/模式/活动范围、成本、前置资格、唯一身份、权威复读、异常与恢复；类型编码成功不算闸门关闭。

| 闸门 | 当前确切缺口 / 应收集证据 | 影响及处理 |
|---|---|---|
| X01 完整生产日报 | 当前仅工具确认事件；缺非工具生产/采集/农田等全来源的权威全天覆盖与时间口径 | C112/W04；覆盖不全输出partial/null，不能库存差假算；若游戏无此证据则O02裁定需求调整 |
| X02 订单金币 | 基础金币配置预览和事后关联已有；最终加成、取整和事前总金币公式缺，MIN_GOLD保持未知 | C124/W04；MIN_GOLD条件保持UNKNOWN，不默认为0 |
| X03 免费刷新 | 真实生产来源缺免费eligibility/quota/cooldown，proofFor合成测试不是来源 | C126/W04；SUBMIT独立可继续，REFRESH无证不发 |
| X04 Museum结算身份 | 两请求均必需stageId（非空）；Complete结果只传临时弹窗且无结算ID，MuseumInfo无同次结果、pending领奖或收据；缺断线后可恢复独立来源 | C144/W11局部冻结；到期、库存变化或expedition消失不证明原结算/领奖；原页面夹具失败已修复并定向通过，不能据此开放写 |
| X05 Fishing全链 | 等级、库存、容量和图鉴门槛只读已有；DrawFishReward无档位条件，GainBigFish缺可恢复pending身份及过期来源 | C152/W13；图鉴不可替代当前任务 |
| X06 联盟真实限额与赛季 | 联盟订单、福利、Fort和商船子集已有；帮助总额度、冷却、Ask阈值次数和权威周期缺 | C303–305/W09；分配字段/配置不能由用户输入伪装权威事实 |
| X07 稳定目标定位 | 当前WorldInfo范围有限；跨视野稳定ID、更新范围、消失/移动来源及跟随含义 | C405/C410/W15；只读过滤可用，不能声称全局跟随 |
| X08 攻击与模式结果 | 移动、宣战、参战资格、保护/地图油费、模式专属side/result、胜负与收益 | C406/C410及PRO005/STG017/W08/W14/W15；保持SIDE_UNVERIFIED，主线LEFT不外推 |
| X09 D6内舰队加速 | 舰队非premium道具加速合同未闭合；贸易自有指针SPEED已有不证明舰队加速；钻石D6拒绝 | C408/W14；若只有钻石路径，记录D6排除及产品阻塞，不制造合法路径 |
| X10 周/军备活动身份 | 三类周免费包与具名周芯片任务已有；周活跃、换轮末任务、军备及完整周期归属缺 | C514/C517及C515/516补链/W17；过季保留fixture，真实分支未遇保持未验 |
| X11 Fleet非零Pet | OnWater宠物绑定/舰队归属精确字段、UID与完整保存复读 | C402受限分支/W14；已有无非零Pet编队不重写，不能把原需求自动缩小 |
| X12 联盟商船/Fort | 单船补货、应聘船长和Fort普通捐赠已有；商船收益补购、隐藏跨玩法占用及Fort其余操作未全 | BIZ-R05/PRO002/W09；cargoFill不等GuildShip、Aid不等Fort |
| X13 装备厂/Pet/其余养成 | 锻造MAKE/PICK、明确允许配方内按部位数量准备、Pet FEED/服役单级LEVEL和成长子集已有；通用成本、培育成熟身份、替换未激活及完整实例结算缺 | BIZ-R07/R08/R09/W07；只迁移纯算法和明确分支，不能搬独立预算/客户端 |
| X14 农田/包/委任 | 单田种收、明确多田有限顺序种收准备、委任减时水位/种子作物投影和明确自选包已有；批量协议结算/全天覆盖缺，预测不入库存 | BIZ-R14/R16a–h/W04；水位是用户策略，非服务器事实；包不明不自动打开 |
| X15 其他阵容/藏品 | 普通图纸解锁、整队预设、极限复制、远征阵容和古董成长子集已有；其他模式、科技重置及完整范围未全 | FRM005/PRO010/PRO007/PRO001/W08/W10/W11；具名队伍是可设计本地合同，非猜游戏专用请求 |
| X16 世界宝藏/资源田 | 派舰后争夺/占有/战果/结算奖励、赛季/次数、资源田占领/放弃权威身份 | BIZ-R11/PRO009及原资源田/W14；派遣成功只确认派遣 |
| X17 免费日常增强 | 邮件有界枚举/单封普通附件、挂机等级奖励、明确普通物品/徽章收益、其后明确1/5/10级升级及免费招募点金/试炼已有；有限普通收益→升级准备已接原API/UI/Workflow；其他实例收益、实例附件/VIP/订单档/拾荒码/在线奖缺 | BIZ-R10/R12a/R15及原子Action/W14/W16；不创建任意领取接口，不自动转付费 |
| X18 季节活动局身份 | 可信签到前置观察已有；完整目录、日界资格成本/领取复读及幽都敕令等局身份仍缺 | BIZ-R17a–h/W17；缺答案不随机作答，未知开局不重复开，未遇真实活动不标已验 |

不沿用旧快照14项BLOCKED_EVIDENCE汇总数，冻结按当前需求行和具体操作判断。X01–X18是一组或多组需求共享的证据任务，不能相加计算新需求。缺证据不删除原ID，不把NOT_EXERCISED改通过。只有外证阻塞的子分支停止，已有合法依赖与独立模块继续施工。

### 12.2 风险与处理优先级

统一运行时合同已有保护，后续必须维持所有者/身份/授权/父预算/持久化/独立复读和UNKNOWN零重放。风险集中在缺证领域错误外推、旧入口绕行、日界/收益/结算身份不足、资产来源缺口及历史离线证据误标当前真实通过。按变更范围定向验证；原1000ms心跳失败证据保留，无因果证据不放宽。全范围冻结后统一R7，R8另授权。

### 12.3 Owner决策登记（本轮不请求真实操作许可）

| ID | 审阅点 | 路线图的默认处理 / 需要决定的边界 |
|---|---|---|
| O01 全产品范围与计数口径 | 原95C、全部原Inventory目标与参考子项、42P及8S均纳计划，273不作为独立需求相加 | 默认完整范围，不要求逐个无C项再次批准。仅全新未在原资料中的需求另列变更；本轮不自行开发 |
| O02 无权威全量日报 | 若X01证实服务器/客户端无法提供完整全来源日量 | 保留C112未完成；可由Owner明确将需求改为工具确认产量并调整基线/DoD，不能默默把partial当完成 |
| O03 只有付费实现路径 | X09或其他具体分支若证实仅RUBY/付费 | D6不可解除；Owner可接受禁用描述及明确范围排除，或保留产品阻塞。H确认不能让付费合法 |
| O04 自动化产品合同 | 原需求含自动切阵/日周/重复运行，现有每ACTION暂停授权 | 已实现并保留逐批模式和有限run合同：账号、能力白名单、具体策略、期限/最大轮次/时长/资源累计上限、撤销与重启不续；不授无限未知动作许可。沿用原实现继续接线，不等逐项审批 |
| O05 部署写所有者 | 当前是本地Console/NAS文件 | 已实现单Console所有者及独立CLI写拒绝，沿用原fence；若要求多服务并发，先调整W01为租约/fencing/CAS并重新评估依赖 |
| O06 “极限通关”复制源 | C215可信源调查映射和准备复制已实现 | 复用原extreme-formations API/专业页与Formation链；缺英雄或未知模式保守拒绝，不重复实现复制源 |
| O07 最终真实验收范围 | R8具体账号、目标、次数、预算、不可逆动作、恢复/清理、活动可用窗口 | R7通过后生成当时新鲜候选的具体清单，再取得一次统一验收范围授权；本报告与历史过期许可不能代替 |
| O08 过季/未自然出现异常 | 活动窗口、真实败北/限频/账号失效/UNKNOWN可能无法安全重现 | 离线故障证明照常完成，真实状态保留REAL_UNVERIFIED/NOT_EXERCISED；若Owner接受阶段性交付须明示保留项，不能称全场景真实PASS |

以上决策供Owner审阅总计划，不是让开发每个页面停等批准。已有明确范围的普通实现按DAG连续推进。证据确实无法取得/必须调整需求/要真实账号操作时，才停止受影响分支提出具体事实与可审阅选项。

### 12.4 可连续交给Codex的施工合同

按原DAG选依赖已满足的一项，直接复用实现、定向验证和本地提交；具体缺证记原C/W/X后冻结，立即继续独立能力。只维护顶部W和当前需求表，不新增Gate/编号/报告。禁止真实连接、读Token、MITM/CA、push/merge/reset/rebase/clean。原DoD和完整交付条件保持：全范围与API/UI/Workflow/预算/历史/生命周期闭环，R7全量离线和单独授权R8；未验不标通过。

本轮文档核对以10d0d95为已提交源码起点。M16/C95/P42/S8/Inventory273及原名称精确保留，分类未变；R1–R6与全部M/W仍PARTIAL，R7/R8 NOT_RUN。a93acb8后dacd718修正Museum关卡目标与结算身份的区别；b6edb78/8869553/ba72763/3b52410完成普通挂机收益、三入口、明确升级及有限组合；0421d9b/10d0d95完成明确多田收取/空田播种准备。对应定向结果见顶部W行，历史通过不算本轮测试，更不代替R7。原Loop/Tasks/Dailies、父预算/持久History、拒绝/UNKNOWN、7类事件和三类具名WAIT已接，继续复用。

下一批按现有依赖推进；以下为原W项内的实现顺序，不新设工作包、阶段或审批：

| 原工作包/范围 | 下一项可执行工作 | 完成边界与依赖 |
|---|---|---|
| W04/W19 — BIZ-R16c | 收口保留的成熟收取确认→同地再播种来源链 | 1至12田及每田明确下一作物；原HARVEST确认落盘后，由同五维私有History与实际空田新调查证明前置；初始自有种子覆盖全链、累计资源/UID预算固定。补现有图生成、Service/Contract、原prepare API和专业页；定向覆盖拒绝、UNKNOWN、落盘失败、重启、来源变化与迟到，然后单个逻辑批次提交。当前仅领域草稿，尚不可用。 |
| W04/W19 — BIZ-R14 | 明确持有材料包→指定配方生产的有限准备 | 已有material-packs兑换、缺口覆盖投影及production单步合同；尚无专用组合prepare入口。复用原Registry/Service/Workflow，兑换确认后重新调查库存/队列并独立授权生产；覆盖投影不能当现有库存或到账，未来收入不扩大父预算，缺任一实际成本或配方来源只冻结对应候选。 |

W19/C604/C606通用cooldown/gameDay仍缺各领域权威策略来源，policyCoverage保持false；不以本地时间、WAIT或工具历史解除拒绝/UNKNOWN。W14/BIZ-W15占领、W07替换/培育或成熟领取、W18目的港报价、W11/C144结算、W03切服/地图、W04全天量/最终金币/免费刷新、W09互助、W12奖励/日界、W13捕鱼及W16/W17周期等原缺口全部保留；没有新业务来源时不反复审计冻结项，继续原DAG其他独立能力。所有原范围完成并冻结后统一R7，再生成E01–E24具体R8授权清单。

### 12.5 文档对齐提交1536835的文件边界与校验（历史）

本轮仅修改README.md、docs/PHASE_4_RECONCILIATION.md及本文件，不新增玩法、源码、测试、编号、目录或报告。原5份未跟踪输入保留。当前表覆盖M0–M15、95C、42P、8S、273Inventory及原W/R/E/X；文档校验与功能测试、真实验收分别记录。本轮不重跑Node全套，不把历史PASS累计为本轮测试。最后提交为本行所在文档提交（父fc68c50）。实际静态校验PASS：M16/C95/P42/S8/Inventory273、原W22/R8/E24/X18、原ID和能力名保持、135个源码/测试路径存在、5份原输入指纹不变；git diff --check通过。离线静态导入确认26模块/27合同/48查询（28解析、20原始），未创建Client/Runtime。

## 附录A — 原Inventory 273项源码索引（原对账a93acb8；本批限定增量见§2及顶部W）

本表按原文ID行顺序保留273项；它们是函数、数据、工具、参考子项、协议族的不同粒度，并非273项独立产品需求。原始95个Cxxx按主表计数；非C项按完整Inventory默认纳入对应工作包；Owner只裁定语义冲突或D6无允许路径，不默认移出交付范围。`EXISTING_FUNCTION`仅指该行标题所述Function存在，UI/API及端到端缺口另看profile和覆盖；PARTIAL不继承原报告结论。所有行必须与以下12维profile连读，行内缺口优先覆盖profile。

| Profile | 1 Function | 2 调用者 | 3 GameClient | 4 API | 5 UI | 6 校验/权限 | 7 Ledger | 8 OperationService | 9 ExecutionHistory | 10 取消/超时/迟到/UNKNOWN | 11 离线测试 | 12 真实游戏 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R | 行内状态 | collectState/server cachedClient/对应survey | 读链；缓存浏览不发请求 | 既有GET/显式refresh；条目内只读边界 | 总览/Explorer/既有业务预览；非独立写页 | 账号scope、READY/缓存可靠性 | 读能力N/A | 读能力N/A；Phase3survey可经operation管理 | 只读无业务执行历史；采集outcomes保留 | GameClient读取消+generation；失败不当零数据；无写UNKNOWN | tests/data-catalog,explorer-api,server-runtime,snapshot-precision,data-safety；实际条目专项见主表 | REAL_UNVERIFIED(1495e48)；旧4094a69+未提交工作树历史48/48 REAL_VERIFIED，后来纳入61ce3c0；PHASE2首轮10项只读查询历史见§4.4，不外推当前完整48项 |
| L | 行内状态 | server/page本地配置/纯计算 | N/A：不新增游戏请求 | 对应本地GET/POST或页面纯交互；不是任意写API | 既有配置/预览/日志页面；缺口行覆盖 | 精确账号、结构校验，敏感本地变更确认 | N/A，纯规则可接账本见行 | N/A（本地配置/展示） | N/A或仅读取；不得称写执行已留存 | 页面account+generation；本地错误显式 | tests/account-view,order-rules,order-rules-store,order-rules-api,order-rules-view,data-safety | REAL_UNVERIFIED；本地UI离线不等于游戏通过 |
| T | 行内状态 | 指定模块/CLI/工具内调用 | 仅底座/指定工具有；纯本地工具N/A | 内部Function或指定安全API；非通用游戏写 | 工具通常无UI；行内已有展示除外 | 参数/凭证/D6/脱敏/路径与归属按模块 | N/A，底座不拥有业务预算 | N/A，底座不当独立执行业务 | N/A，日志/系统journal不等于执行账本 | 底座GameClient/capture有生命周期；本地纯工具N/A；具体工具非统一可取消 | tests/client-lifecycle,client-unverified-write,cli-safety,data-safety,capture-*,mitm-*,proxy-backup；工具selftest历史 | REAL_UNVERIFIED；历史登录/清理证据仅按主报告场景 |
| C | 行内状态 | 原CLI/旧run保留；目标写未接共享桥 | 旧请求存在不等于允许派发 | 旧通用写/Tasks/Dailies/Loop路由403 | 可有只读预览；非完整受控写页 | 独立CLI写在读凭证前拒绝，参数不覆盖D6 | 旧预算不冒充共享账本 | 目标写未接；已迁移子集列G/B | 旧内存不冒充共享持久历史 | 保留旧取消/迟到保护；不凭响应推定成功 | legacy safety/cli-safety仅证明所测范围 | REAL_UNVERIFIED |
| B | 行内状态 | operation-service → city/order adapter → 原world/action | 已接原GameClient | /api/operations survey/plan/authorize/execute/stop/history | 建筑/生产/订单执行/历史页 | 精确账号、CSRF、计划哈希、单批一次性授权、fresh precheck、D6 | 是：原Ledger及父资源/配额/UID预算，不返还未确认消耗 | 是 | 是：账号级原子JSON、恢复未决保守阻塞 | 是：AbortSignal/generation/UNKNOWN/RATE_LIMITED/迟到保留 | tests/city-operations,order-execution,operation-service,operations-api,operation-adapters-integration,execution-history,production-*；历史609@9d97065，后续845回归范围见主报告 | REAL_UNVERIFIED；9d97065只读/预览部分REAL_VERIFIED，0业务写帧 |
| G | 行内状态 | registered adapter → executeBusinessOperation/OperationService；或WorkflowRunner | adapter survey与写调用；阻塞动作不派发 | /api/gameplay + /api/operations；工作流 /api/workflows | 原专业子区/通用候选授权页；原生Workflow编辑器 | 精确账号/CSRF、模块严格配置、单次或有限run授权/父预算、身份/状态/成本复查、D6 | 是；只读/空成本N/A；权威成本缺则阻塞 | 是；纯只读策略无需执行 | 写execute是operation历史；workflow持久store历史/共享execution-memory拒绝与UNKNOWN关联；只读survey/view不写业务ExecutionHistory，PLAN不是已执行历史 | 是；UNKNOWN锁/取消/迟到保护继承；未实现动作没有效果确认 | tests/formation,alliance,museum,treasure,fleet,naval-rules,workflow,gameplay-*,stages-formation；历史845+29实现f300a35/记录a505019 | REAL_UNVERIFIED |
| S | 行内状态 | 原StageRunner或有限Stage Function | 仅授权MAINLINE ChallengeStage | 原stages或operations/workflows | 运行/首败开关/逐场历史 | 主线LEFT/READY/所有者/互斥/未决/授权 | 空成本；有限Function父动作预算 | 独立Runner保留；有限Function接原Service | stage-history逐场持久；Function关联共享历史 | runId/generation/取消/限频/迟到；重启不恢复战斗 | 原stages*/stage-function/stage-history/共享测试 | REAL_UNVERIFIED；旧137关、156胜/157限频边界见§4.4 |
| P | PROTOCOL_ONLY或行内PARTIAL | 无目标写调用者；有参考/读探针不计业务写 | 仅底座和可能只读数据；目标写未接 | 无目标写API | 原始Explorer可看不等于业务UI | 业务校验/授权未实现或明确安全阻塞 | 未接目标业务 | 未接目标业务 | 无该写业务历史 | 未形成该写闭环；协议超时规则不能代替业务确认 | 只有协议/codec/读数据可能有测试；无目标业务Offline Verified | REAL_UNVERIFIED |
| N | NOT_IMPLEMENTED或行内PARTIAL | 无该算法/完整业务调用者；附近基础函数行内列明 | N/A或基础数据已有 | 无该完整业务API | 无完整业务UI | 未实现；证据未知应阻塞 | 未实现该能力预算 | 未实现该业务桥 | 无该业务独立历史 | 未实现该闭环，不推定安全成功 | 无该业务专项通过证据 | REAL_UNVERIFIED |

profile中的测试是继承的相关测试族索引，不能把整个族通过当作尚未实现分支已通过。本轮按10d0d95已提交源码、现有API/UI/Workflow及127个源码/测试索引续核，273项原ID、原能力名和188/75/10分类不变。DAT只表示只读查询；原能力名内“当前未接”等措辞及1495e48等profile版本引用是历史出处，不代表现行HEAD。已提交范围按顶部W行；src/farm-operations.mjs收取后再播种草稿未计交付，R7/R8均NOT_RUN。

| 原ID | 原能力名 | Cxxx / 非C补充项 | 当前Function维度 | 当前实际函数 / 源码证据 | 12维Profile | 关键剩余缺口 / 限制 |
|---|---|---|---|---|---|---|
| PLT-001 | 平台：本机 Web Console | C001 C002 | EXISTING_FUNCTION | createConsole → PAGE; src/server.mjs | L | 平台本机页面已存在；配置入口覆盖仍有限 |
| PLT-002 | 账号列表与状态 | C002 | EXISTING_FUNCTION | loadStore/describeAccount; src/accounts.mjs; src/server.mjs | R | 账号列表建空Session不等于Runtime |
| PLT-003 | 账号选择/切换活动账号 | C002 | EXISTING_FUNCTION | setActive/pickAccount; src/accounts.mjs | L | 切换选择不隐式登录 |
| PLT-004 | 账号重命名 | C002 | EXISTING_FUNCTION | saveStore; src/accounts.mjs | L | 本地账号标签 |
| PLT-005 | 删除账号及会话取消 | C002 C606 | EXISTING_FUNCTION | cancelSession/removeAccount; src/server.mjs; src/accounts.mjs | L | 取消运行且保留不确定写历史 |
| PLT-006 | 凭证脱敏元信息展示 | C001 | EXISTING_FUNCTION | describeAccount/redact; src/accounts.mjs; src/security.mjs | L | 不公开真实秘密 |
| PLT-007 | 凭证导入、同账号更新和旧单账号读取 | C001 | EXISTING_FUNCTION | accountFromCredential/upsertAccount/saveStore; src/accounts.mjs | T | 安全CLI可导入；无产品化Web扫码/导入 |
| PLT-008 | 鉴权输入校验 | C001 | EXISTING_FUNCTION | validateCredentials; src/security.mjs | T | 正常账号鉴权；D6禁止开发凭证 |
| PLT-009 | 显式登录和单账号连接 Single-flight | C001 | EXISTING_FUNCTION | connect; src/server.mjs; GameClient src/client.mjs | R | 显式connect；single-flight |
| PLT-010 | 显式断开/关闭/失效清理 | C002 C606 | EXISTING_FUNCTION | cancelSession/GameClient.stop; src/server.mjs; src/client.mjs | R | 原心跳超时样本保留；清理不是业务成功 |
| PLT-011 | 心跳、序号、ACK/NACK、失效通知 | C001 C005 | EXISTING_FUNCTION | sendPing/tryHandlePong/tick; src/client.mjs | T | 1000ms首Ping超时需离线诊断而非直接放宽 |
| PLT-012 | 请求关联与迟到响应隔离 | C005 | EXISTING_FUNCTION | request/sendWatch; src/client.mjs | T | 迟到/未决保护存在；调用者须验证业务效果 |
| PLT-013 | 多账号 Session、取消和防旧结果写入 | C002 C605 | EXISTING_FUNCTION | src/app.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | T | 账号/连接/代次隔离及唯一Console跨进程所有权已有；不扩大为任意NAS多writer |
| PLT-014 | 账号页面请求代次 | C002 | EXISTING_FUNCTION | createAccountViewGuard; src/page.mjs | L | 页面scope/generation防旧结果 |
| PLT-015 | 显式采集和缓存刷新边界 | C004 | EXISTING_FUNCTION | refresh/collectState; src/server.mjs; src/game.mjs | R | 48查询采集与缓存浏览分离 |
| PLT-016 | 总览、缓存明细和 Snapshot 导出 | C004 | EXISTING_FUNCTION | src/game.mjs；src/data-catalog.mjs；tests/data-catalog.test.mjs | R | 48查询中28解析/20原始；浏览缓存零请求 |
| PLT-017 | 实时区服列表 | C003 | EXISTING_FUNCTION | listWorlds; src/worlds.mjs | R | 实时只读区服列表 |
| PLT-018 | 全区服分组和指定区服登录 | C003 | PARTIAL | src/worlds.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 列表/分组和角色/出生/当前世界精确身份、当前Session归属只读修复已有；独立CLI写在读凭证前拒绝，Web enter403；实际切服的目标原子绑定/禁止隐式新建/恢复合同待核 |
| PLT-019 | 运行事件和递归脱敏 | C606 | EXISTING_FUNCTION | emit/trace/redact; src/server.mjs; src/security.mjs | L | SSE有限内存，不等于所有持久运行历史 |
| PLT-020 | Web 游戏写权限边界 | C603 C409 | EXISTING_FUNCTION | route gates; src/server.mjs; assertPaymentAllowed src/actions.mjs | T | 新增受控operations/gameplay/workflow路由；旧写白名单仍拒绝 |
| PLT-021 | Stage 状态/开始/停止产品入口 | C201 C202 C203 C204 C205 | EXISTING_FUNCTION | stageView/createStageRunner; src/server.mjs; src/stages.mjs | S | 真实挑战和10–11秒限频效果待最终验收 |
| PLT-022 | 独立凭证捕获并导入 | C001 | EXISTING_FUNCTION | runCaptureCli/createCaptureController; tools/capture-credentials.mjs; src/capture.mjs | T | 安全CLI；Web旧捕获handler不可直接解禁 |
| PLT-023 | 捕获事务和崩溃恢复 | C001 非C:捕获崩溃恢复 | EXISTING_FUNCTION | recoverCapture/startCapture/stopCapture; src/capture.mjs | T | 本轮未启动或读真实凭证 |
| PLT-024 | MITM 主机与TLS安全 | 非C:MITM安全 | EXISTING_FUNCTION | createProxy; tools/mitm-proxy.mjs | T | 默认精确主机白名单；不在本轮运行 |
| PLT-025 | CA生成、只读精确查询与归属清理 | 非C:CA归属 | EXISTING_FUNCTION | queryCurrentUserRoot/createCaManager; tools/mitm-ca.mjs | T | 只归属receipt清理；本轮未操作CA |
| PLT-026 | Windows代理版本化备份和恢复 | 非C:代理恢复 | EXISTING_FUNCTION | createProxySettings; tools/proxy-settings.mjs | T | 版本化备份/恢复；本轮未操作代理 |
| PLT-027 | B2定向首错诊断与心跳发送白名单 | C001 非C:首错诊断 | EXISTING_FUNCTION | createB2Diagnostics; tools/b2-harness.mjs | T | 真实Phase2首Ping超时留待最终诊断 |
| PLT-028 | CLI账号管理与开发操作 | C001 C003 C603 | PARTIAL | src/app.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | T | 本地账号管理/只读/dry保留；--yes、--paid或环境变量不能开放独立游戏写 |
| PLT-029 | CLI日志/导出安全差异（明确待办） | C001 C002 | EXISTING_FUNCTION | createCliOutput/loadCliCredential; src/cli-safety.mjs; accountsCli src/app.mjs | T | PHASE1已补普通输出脱敏；危险旧展示不作为可用产品入口 |
| PLT-030 | Protobuf载入和注册器沙箱 | C005 | EXISTING_FUNCTION | loadProtocol; src/proto.mjs | T | ignored生成协议资源需可复现恢复 |
| PLT-031 | 协议帧编解码、LZ4 | C005 | EXISTING_FUNCTION | createCodec; src/codec.mjs; compressBlock/decompressBlock src/lz4.mjs | T | 传输实现存在不等于业务完成 |
| PLT-032 | 协议字段和消息反查 | C005 非C:协议反查 | EXISTING_FUNCTION | fields/findType; tools/describe.mjs | T | 部分嵌套显示unknown需生成源码核对 |
| PLT-033 | 压缩客户端上下文定位 | 非C:压缩客户端定位 | EXISTING_FUNCTION | CLI source; tools/ctx.mjs | T | 纯本地定位工具 |
| PLT-034 | 微信包解密/解包 | 非C:wxapkg解包 | EXISTING_FUNCTION | decrypt/unpack; tools/wxapkg.mjs | T | 运行资产不随Git提交 |
| PLT-035 | 本地配置表发现、提取和查询 | C004 非C:配置恢复 | EXISTING_FUNCTION | findConfigPack/extractTables/loadConfig; src/config.mjs | T | 恢复来源/哈希要求保留 |
| PLT-036 | 固化配置包 | 非C:配置固化 | EXISTING_FUNCTION | CLI source; tools/sync-config.mjs | T | 本轮未同步或访问网络 |
| PLT-037 | 图集提取和本地展示 | C004 非C:图集显示 | EXISTING_FUNCTION | iconIndex/atlasFile; src/art.mjs | R | 缺资源可降级 |
| PLT-038 | 图集资源同步 | 非C:图集同步 | EXISTING_FUNCTION | sync-art helpers; tools/sync-art.mjs | T | 本轮未同步或网络下载 |
| PLT-039 | 客户端枚举名称提取 | 非C:枚举名称提取 | EXISTING_FUNCTION | CLI source; tools/build-names.mjs | T | 名称不代表业务Function |
| PLT-040 | 扩展玩法实时只读探针 | C601 非C:扩展探针 | EXISTING_FUNCTION | runDailiesProbe/runWorldProbe; tools/probe-dailies.mjs; tools/probe-world.mjs | T | 原扩展只读探针保留，不属于48项Snapshot；账号/脱敏保护已有，本轮不执行在线工具 |
| PLT-041 | 登录拒绝在线诊断 | 非C:在线登录诊断 | EXISTING_FUNCTION | CLI source; tools/check-login-failure.mjs | T | 原登录诊断工具保留，独立于业务执行；本轮不执行在线工具 |
| PLT-042 | 离线回归入口 | 非C:离线回归 | EXISTING_FUNCTION | src/selftest.mjs; package.json; tools/selftest-registry.mjs | T | 历史结果需带提交；本轮未重跑 |
| PLT-043 | 游戏协议全自动发现/通用工作流设计器 | C607 非C:自动协议发现 | PARTIAL | src/loop.mjs；src/workflow.mjs；src/operation-service.mjs；tests/workflow.test.mjs | G | 26静态模块加Stage、27合同及原生图编辑已有；自动协议发现/全目录仍缺 |
| DEX-001 | 48 项查询单次采集 | C004 C005 C601 | EXISTING_FUNCTION | src/data-catalog.mjs；src/game.mjs；src/page.mjs；tests/data-catalog.test.mjs | R | 当前48查询/28解析/20原始；原DEX-003/004标题27/21仅历史口径；非当前真实验收 |
| DEX-002 | 12 域目录与 48 项浏览 | C004 C005 C601 | EXISTING_FUNCTION | src/data-catalog.mjs；src/game.mjs；src/page.mjs；tests/data-catalog.test.mjs | R | 当前48查询/28解析/20原始；原DEX-003/004标题27/21仅历史口径；非当前真实验收 |
| DEX-003 | 27 个现有业务解析视图 | C004 C005 C601 | EXISTING_FUNCTION | src/data-catalog.mjs；src/game.mjs；src/page.mjs；tests/data-catalog.test.mjs | R | 当前48查询/28解析/20原始；原DEX-003/004标题27/21仅历史口径；非当前真实验收 |
| DEX-004 | 21 个无专门解析的原始响应 | C004 C005 C601 | EXISTING_FUNCTION | src/data-catalog.mjs；src/game.mjs；src/page.mjs；tests/data-catalog.test.mjs | R | 当前48查询/28解析/20原始；原DEX-003/004标题27/21仅历史口径；非当前真实验收 |
| DEX-005 | 状态、错误、采集时间 | C004 C005 C601 | EXISTING_FUNCTION | src/data-catalog.mjs；src/game.mjs；src/page.mjs；tests/data-catalog.test.mjs | R | 当前48查询/28解析/20原始；原DEX-003/004标题27/21仅历史口径；非当前真实验收 |
| DEX-006 | 按域、业务名和协议名搜索 | C004 C005 C601 | EXISTING_FUNCTION | src/data-catalog.mjs；src/game.mjs；src/page.mjs；tests/data-catalog.test.mjs | R | 当前48查询/28解析/20原始；原DEX-003/004标题27/21仅历史口径；非当前真实验收 |
| DEX-007 | 安全 JSON 复制/导出 | C004 C005 C601 | EXISTING_FUNCTION | src/data-catalog.mjs；src/game.mjs；src/page.mjs；tests/data-catalog.test.mjs | R | 当前48查询/28解析/20原始；原DEX-003/004标题27/21仅历史口径；非当前真实验收 |
| DEX-008 | int64 精度保留 | C004 C005 C601 | EXISTING_FUNCTION | src/data-catalog.mjs；src/game.mjs；src/page.mjs；tests/data-catalog.test.mjs | R | 当前48查询/28解析/20原始；原DEX-003/004标题27/21仅历史口径；非当前真实验收 |
| DEX-009 | 跨账号缓存与迟到响应隔离 | C004 C005 C601 | EXISTING_FUNCTION | src/data-catalog.mjs；src/game.mjs；src/page.mjs；tests/data-catalog.test.mjs | R | 当前48查询/28解析/20原始；原DEX-003/004标题27/21仅历史口径；非当前真实验收 |
| DAT-001 | 库存道具 / 资源与生产 | C113 C123 C221 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-002 | 玩家资源 / 资源与生产 | C113 C123 C102 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-003 | 英雄 / 英雄养成 | C221 C207 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-004 | 英雄阵型 / 英雄养成 | C211 C207 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-005 | 邮件 / 日常与成长任务 | C511 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-006 | 装备 / 英雄养成（收藏与辅助养成） | C229 C230 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-007 | 徽章 / 英雄养成（收藏与辅助养成） | C227 C228 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-008 | 招募信息 / 招募与商店 | 非C:招募 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-009 | 成就 / 日常与成长任务 | C502 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-010 | 每日任务与活跃度 / 日常与成长任务 | C502 C503 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-011 | 每日赠礼 / 日常与成长任务（招募与商店） | C513 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-012 | 主线与支线任务 / 日常与成长任务 | C502 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-013 | 新手引导 / 日常与成长任务 | 非C:新手引导 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-014 | 挂机收益与点金摘要 / 日常与成长任务（资源与生产） | 非C:挂机收益 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-015 | 月卡 / 招募与商店（活动与赛季） | C513 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-016 | 藏品 / 收藏与辅助养成 | 非C:藏品 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-017 | 建筑、生产与居民订单 / 城市建设（资源与生产、居民订单） | C101 C111 C121 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-018 | 鱼类图鉴 / 收藏与辅助养成 | C152 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-019 | 货船 / 舰队与航海 | C131 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-020 | 英雄任命 / 英雄养成 | C221 非C:委任 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-021 | 聊天记录 / 公会与联盟 | 非C:聊天 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-022 | 游戏效果 / 收藏与辅助养成 | 非C:游戏效果 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-023 | 公会摘要 / 公会与联盟 | C302 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-024 | 我的舰队 / 舰队与航海（世界地图） | C401 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-025 | 海盗击杀记录 / 城战与战斗（舰队与航海） | C151 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-026 | 我的资源田 / 世界地图 | C403 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-027 | 公会科技 / 公会与联盟 | C306 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-028 | 公会订单 / 公会与联盟（居民订单） | 非C:联盟订单 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-029 | 阵型预设 / 英雄养成 | C212 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-030 | 赛季任务阶段 / 活动与赛季（日常与成长任务） | C501 C502 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-031 | 世界 Boss / 城战与战斗（活动与赛季） | 非C:世界Boss | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-032 | 限时 Boss 开放信息 / 城战与战斗（活动与赛季） | 非C:限时Boss | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-033 | 宠物 / 收藏与辅助养成 | 非C:海兽 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-034 | 赛季排名信息 / 活动与赛季 | C501 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-035 | 周活动 / 活动与赛季 | C501 C515 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-036 | 关卡状态 / 城战与战斗 | C201 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-037 | 周订单 / 活动与赛季（居民订单） | C515 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-038 | 日常计数 / 日常与成长任务 | C502 C503 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-039 | 雷达 / 世界地图 | C403 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-040 | 环境皮肤 / 收藏与辅助养成 | 非C:环境皮肤 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-041 | 渠道奖励信息 / 活动与赛季 | C501 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-042 | 限时券 / 招募与商店（活动与赛季） | C501 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-043 | 赛季卡 / 活动与赛季（招募与商店） | C501 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-044 | 海盗 / 城战与战斗（世界地图） | C151 C403 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-045 | 玩家头像框 / 收藏与辅助养成 | 非C:头像框 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-046 | Churn 信息 / 活动与赛季 | C501 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-047 | Ultra 开放信息 / 活动与赛季 | C501 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-048 | 黑名单 / 公会与联盟 | 非C:黑名单 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| BIZ-A01 | 资源与生产：领取挂机本段收益 | 非C:挂机收益 | PARTIAL | src/afk-level-rewards.mjs；tests/afk-level-rewards.test.mjs；src/loop.mjs | G | 明确区间普通物品/徽章收益已接共享合同及三入口；有限普通收益→升级准备/API/UI已有；其他实例包及断线旧区间回执未齐；UNKNOWN零重放 |
| BIZ-A02 | 日常成长：领取挂机等级奖励 | 非C:挂机奖励 | EXISTING_FUNCTION | src/afk-level-rewards.mjs；tests/afk-level-rewards.test.mjs | G | 明确单等级奖励受控领取；不证明时段收益或升级 |
| BIZ-A03 | 日常成长：提升挂机等级 | 非C:挂机升级 | PARTIAL | src/afk-level-rewards.mjs；src/operation-service.mjs；tests/afk-level-rewards.test.mjs | G | 明确1/5/10级升级已接原合同/API/UI/有限Workflow；同连接持久收益前置、逐档真实成本与主线门槛，独立精确净扣；有限来源绑定准备/API/UI已有；完整挂机/邮件其余分支未齐，UNKNOWN零重放 |
| BIZ-A04 | 生产：收取工厂成品 | C116 | EXISTING_FUNCTION | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | G | 工厂成品与竣工受控执行；原生批量农田结算另有缺证 |
| BIZ-A05 | 城市：收取建筑产物 | C116 | EXISTING_FUNCTION | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | G | 工厂成品与竣工受控执行；原生批量农田结算另有缺证 |
| BIZ-A06 | 城市：确认已到期建筑竣工 | C116 | EXISTING_FUNCTION | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | G | 工厂成品与竣工受控执行；原生批量农田结算另有缺证 |
| BIZ-A07 | 城市：切换自动工作 | 非C:自动工作 | PARTIAL | src/app.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 自动工作旧实现保留；未接共享受控写 |
| BIZ-A08 | 生产：设置自动生产产品 | C114 | PARTIAL | src/app.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 旧自动生产开关及产品设定不等于Production单次排产 |
| BIZ-A09 | 日常：领取单条任务奖励 | C503 | EXISTING_FUNCTION | src/task-rewards.mjs；tests/task-rewards.test.mjs | G | 明确日常taskId单次领取已接；不推定周期 |
| BIZ-A10 | 成就：领取奖励 | 非C:成就领奖 | EXISTING_FUNCTION | src/task-rewards.mjs；tests/task-rewards.test.mjs | G | 明确成就ID、配置奖励映射与独立复读已接 |
| BIZ-A11 | 邮箱：一键领取已读邮件附件 | C511 | PARTIAL | src/mail.mjs；tests/mail-claim.test.mjs | G | 有界枚举和已读、未读单封读领已有；批量及实例附件归属缺 |
| BIZ-A12 | 日常：领取活跃宝箱 | C503 | EXISTING_FUNCTION | src/daily-task-rewards.mjs；tests/daily-task-rewards.test.mjs | G | 明确日活跃档及奖励复读已有；非通用日界策略 |
| BIZ-A13 | 周常：领取活跃宝箱 | C516 | PARTIAL | src/daily-task-rewards.mjs；tests/daily-task-rewards.test.mjs | G | 三类周免费包和具名周芯片任务已有；周活跃箱完整周期和归属缺 |
| BIZ-A14 | 商店：领取每日免费赠礼 | C513 | EXISTING_FUNCTION | src/task-rewards.mjs；tests/task-rewards.test.mjs | G | 固定赠礼packId零支出与独立复读已有 |
| BIZ-A15 | 月卡：领取每日权益 | C513 | PARTIAL | src/app.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 月卡只读保留；完整每日权益未接共享写合同 |
| BIZ-A16 | 主线任务：领奖 | C503 | EXISTING_FUNCTION | src/task-rewards.mjs；tests/task-rewards.test.mjs | G | 明确主线taskId计划授权与独立结算 |
| BIZ-A17 | 支线任务：领奖 | C503 | EXISTING_FUNCTION | src/task-rewards.mjs；tests/task-rewards.test.mjs | G | 明确支线taskId计划授权与独立结算 |
| BIZ-A18 | 居民订单：每日单数档奖励 | C128 非C:订单档奖励 | PARTIAL | src/app.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 每日订单档资格、身份和奖励合同缺证 |
| BIZ-A19 | 居民订单：交单 | C126 | EXISTING_FUNCTION | src/order-execution.mjs；tests/order-execution.test.mjs | G | 明确单单提交已受控并独立确认订单替换及完成数；免费刷新另行缺证 |
| BIZ-A20 | 居民订单：拒单刷新 | C126 | EXISTING_FUNCTION | src/order-execution.mjs；tests/order-execution.test.mjs | G | 明确单单提交已受控并独立确认订单替换及完成数；免费刷新另行缺证 |
| BIZ-A21 | 生产：开始制造 | C115 | EXISTING_FUNCTION | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | G | registered production复用原city链、共享预算、写前调查和写后复读 |
| BIZ-A22 | 城市：升级建筑 | C103 | EXISTING_FUNCTION | src/city-operations.mjs；tests/city-operations.test.mjs | G | 升级授权与权威复读已有，真实未验 |
| BIZ-A23 | 城市：建造空建筑位 | C104 | EXISTING_FUNCTION | src/city-operations.mjs；tests/city-operations.test.mjs | G | 仅服务端已有level0槽；不是任意地图新坐标建造 |
| BIZ-A24 | 城市：道具加速升级 | C102 非C:建筑道具加速 | EXISTING_FUNCTION | src/city-operations.mjs；tests/city-operations.test.mjs | G | 材料/等级/人口/队列前检已有；未知不计划 |
| BIZ-A25 | 生产：道具加速制造位 | C114 非C:生产道具加速 | EXISTING_FUNCTION | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | G | 原排产及种子/过剩作物水位接入生产策略，缺配置不推测数量 |
| BIZ-A26 | 世界资源田：派舰占领 | C403 非C:资源田占领 | PARTIAL | src/world.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 资源田只读和旧计划保留；占领未接共享写及独立复读 |
| BIZ-A27 | 世界资源田：放弃占领 | C403 非C:资源田放弃 | PARTIAL | src/world.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 资源田只读和旧计划保留；放弃未接共享写及独立复读 |
| BIZ-W01 | 城市建筑、工厂队列、产物、建造时间读取 | C101 C111 | EXISTING_FUNCTION | src/city-operations.mjs；tests/city-operations.test.mjs | G | 建筑信息与业务页面已有 |
| BIZ-W02 | 库存归并与人口/上限计算 | C113 C123 | EXISTING_FUNCTION | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | G | 订单优先缺口、在产/成品抵扣及共享库存；收入不自动扩额 |
| BIZ-W03 | 获取居民需求与物品缺口 | C121 C122 C123 | EXISTING_FUNCTION | src/order-execution.mjs；tests/order-execution.test.mjs | G | 需求源OnWater，缺数组不是权威空 |
| BIZ-W04 | 普通/特殊订单经验 | C124 | EXISTING_FUNCTION | src/order-rewards.mjs；tests/order-rewards.test.mjs | L | 经验和已证基础金币预览已有；最终金币倍率/结算公式缺证 |
| BIZ-W05 | 订单金币奖励 | C124 | PARTIAL | src/order-rewards.mjs；tests/order-rewards.test.mjs | B | 配置基础预览及事后奖励关联已有；最终金币、加成取整和MIN_GOLD资格缺 |
| BIZ-W06 | 收工厂成品与建筑产物计划 | C116 | EXISTING_FUNCTION | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | G | 工厂成品与竣工受控执行；原生批量农田结算另有缺证 |
| BIZ-W07 | 到期竣工与空位建造 | C104 C116 | EXISTING_FUNCTION | src/city-operations.mjs；tests/city-operations.test.mjs | G | 仅服务端已有level0槽；不是任意地图新坐标建造 |
| BIZ-W08 | 订单优先交付/低经验缺料刷新 | C125 C126 | PARTIAL | src/order-execution.mjs；tests/order-execution.test.mjs | G | 规则/三值评估/库存复查已有；免费刷新资格缺证继续冻结 |
| BIZ-W09 | 跨订单与其他计划材料预留 | C123 C113 | EXISTING_FUNCTION | src/order-execution.mjs；tests/order-execution.test.mjs | G | 跨订单预算分配已有，不把独立模拟当批量预留 |
| BIZ-W10 | 按订单缺口排产 | C114 C115 | EXISTING_FUNCTION | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | G | 原排产及种子/过剩作物水位接入生产策略，缺配置不推测数量 |
| BIZ-W11 | 余料升级建筑 | C102 C103 | EXISTING_FUNCTION | src/city-operations.mjs；tests/city-operations.test.mjs | G | 材料/等级/人口/队列前检已有；未知不计划 |
| BIZ-W12 | 可选加速建筑/生产 | C102 非C:加速 | EXISTING_FUNCTION | src/city-operations.mjs；tests/city-operations.test.mjs | G | 材料/等级/人口/队列前检已有；未知不计划 |
| BIZ-W13 | 串行计划执行与失败同类隔离 | C603 | EXISTING_FUNCTION | src/operation-service.mjs；tests/operation-service.test.mjs | G | Service/Executor统一已交付写；旧Web写403/CLI独立写拒绝，未映射业务仍未交付 |
| BIZ-W14 | 世界地图资源田资产读取/展示 | C403 | PARTIAL | src/world.mjs；src/asset-readiness.mjs；tests/asset-readiness.test.mjs | R | 固定清单、只读诊断和保留归档已有；map-1及上游来源缺 |
| BIZ-W15 | 指定资源田占领计划 | 非C:资源田占领 | PARTIAL | src/world.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 固定v76 SelectTroopPop明确ChallengeResFieldRequest的grid/fleet列表、闲置/耐久及每舰资源地汽油成本；回调仅关窗。map-1实际缺失且清单来源/哈希空，目标资格和独立归属/模式结算未闭合；BLOCKED_EVIDENCE，不以派遣当占领 |
| BIZ-W16 | 放弃自有资源田 | 非C:资源田放弃 | EXISTING_FUNCTION | src/fleet.mjs；src/client.mjs；src/actions.mjs；src/function-contracts.mjs；src/gameplay-page.mjs；tests/fleet.test.mjs；tests/gameplay-api.test.mjs；tests/farm-forge-full-page.test.mjs | G | 明确本账号当前完整已占列表中的单个gridIdx（0有效）；默认关闭，原授权/UID预算/持久历史/独立前后完整列表及库存不变验证；推送只失效，UNKNOWN/重启零重放。非占领/收益，REAL_UNVERIFIED |
| BIZ-H01 | 英雄及阵容数据读取、养成计划展示；planHeroes、maxHeroLevelFor | C221 C211 | EXISTING_FUNCTION | src/hero-operations.mjs；tests/hero-service.test.mjs | G | 成长等级和材料前检已有，复用Ledger |
| BIZ-H02 | 英雄升级；planHeroes→runHeroPlan→sendHero | C222 | EXISTING_FUNCTION | src/hero-operations.mjs；tests/hero-service.test.mjs | G | 明确单英雄等级加一及完整英雄池、库存复读已接 |
| BIZ-H03 | 英雄升星；planHeroes→runHeroPlan | C223 | PARTIAL | src/hero-operations.mjs；tests/hero-service.test.mjs | G | 专属碎片星、明确1比1兑换、固定前置的单英雄及1至12名共享来源明确顺序单星组合已有；隐式混用及完整自动策略缺 |
| BIZ-H04 | 英雄技能升级；planHeroes→runHeroPlan | C224 | EXISTING_FUNCTION | src/hero-operations.mjs；tests/hero-service.test.mjs | G | 明确单英雄技能升级及完整池、库存复读已接 |
| BIZ-H05 | 装备/徽章穿戴、升级、替换、精炼、升星、专武养成 | C225 C226 C227 C228 C229 C230 | PARTIAL | src/hero-operations.mjs；src/equipment-growth.mjs；src/badge-growth.mjs；tests/equipment-growth.test.mjs | G | 专武、装备、徽章成长和空槽穿戴子集已有，装备显式配置零费首次0→1已接；替换、激活及部分边界缺 |
| BIZ-D01 | 日常任务进度、目标与可执行动作评估；describeDailyTask/surveyDailies/DAILY_DRIVERS | C502 C503 | EXISTING_FUNCTION | src/daily-checklist.mjs；tests/daily-checklist.test.mjs | R | 主/支/成就/每日/周芯片任务观察已有；全部活动任务未闭合 |
| BIZ-D02 | 免费与招募券单抽；Function：DAILY_DRIVERS[1002] → runDailies→sendAction | 非C:免费招募 | PARTIAL | src/free-recruit.mjs；tests/free-recruit.test.mjs | G | 明确RECRUIT_FREE单抽已接；招募券和其他抽取未接 |
| BIZ-D03 | 日常单次主线战斗；Function：DAILY_DRIVERS[1003] → runDailies | C202 | PARTIAL | src/loop.mjs；src/workflow.mjs；src/operation-service.mjs；tests/workflow.test.mjs | G | 日常1003显式转原Stage；战斗结果不代替日常完成观察 |
| BIZ-D04 | 挂机满段领取驱动；Function：DAILY_DRIVERS[1004] | 非C:挂机收益 | PARTIAL | src/loop.mjs；src/afk-level-rewards.mjs；tests/afk-level-rewards.test.mjs | G | 8869553已接明确普通区间收益；无需整段到期，可信61秒门槛。无区间旧1004仍拒绝；完整结算及依赖准备未齐 |
| BIZ-D05 | 竞技场低战力对手挑战；Function：DAILY_DRIVERS[1005] | 非C:竞技场 | PARTIAL | src/app.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 竞技场旧驱动保留；受控对手、成本、阵营及结算缺 |
| BIZ-D06 | 免费点金/可选钻石点金；Function：DAILY_DRIVERS[1006] | 非C:点金 | PARTIAL | src/free-gold.mjs；tests/free-gold.test.mjs | G | 普通免费点金单次已接；原可选钻石分支D6硬拒绝 |
| BIZ-D07 | 折扣店挑最低价购买；Function：DAILY_DRIVERS[1007] | C513 非C:折扣店 | PARTIAL | src/app.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 折扣店普通物资购买缺合同；钻石和付费D6硬拒绝 |
| BIZ-D08 | 贸易日常能力；Function：DAILY_DRIVERS[1008] probes | C131 C133 | PARTIAL | src/fleet.mjs；src/loop.mjs；tests/cargo-service.test.mjs；tests/workflow.test.mjs | G | 日常1008属港口货轮，非海商王C521；Dailies/Loop精确单格装货已接原Fleet，独立观察/领奖；完整任务完成归因仍缺证 |
| BIZ-D09 | 英雄经验试炼推进；Function：DAILY_DRIVERS[1009] | 非C:经验试炼 | EXISTING_FUNCTION | src/trial-challenge.mjs；tests/trial-challenge.test.mjs | G | 明确单次经验试炼已接；不外推所有试炼 |
| BIZ-D10 | 海盗免战扫荡；Function：DAILY_DRIVERS[1010] | C151 | PARTIAL | src/pirate-sweep.mjs；tests/pirate-sweep.test.mjs | G | 日常1010精确城市、UID及配额单扫已接；奖励、目标变化、日界缺 |
| BIZ-D11 | 联盟情报日常探测；Function：DAILY_DRIVERS[1011] | 非C:联盟雷达 | PARTIAL | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs | R | 只读/probe/状态或计划；不得作为对应写入已完成 |
| BIZ-D12 | 联盟订单日常探测；Function：DAILY_DRIVERS[1012] | 非C:联盟订单 | PARTIAL | src/alliance.mjs；tests/alliance.test.mjs | G | 日常1012明确城市订单已接；非全部联盟日常 |
| BIZ-D13 | 联盟互助探测；Function：DAILY_DRIVERS[1013] | C301 | PARTIAL | src/alliance.mjs；tests/alliance-tech.test.mjs | G | reqId精确绑定成员求助单，已有展示 |
| BIZ-D14 | 请求帮助/城战功勋日常驱动；Function：DAILY_DRIVERS[1014/1015] lockedReason | C305 C406 | PARTIAL | src/app.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 帮助和城战驱动仍缺权威资格、额度、冷却及结算 |
| BIZ-D15 | 博物馆探险探测；Function：DAILY_DRIVERS[1016] | C141 | PARTIAL | src/museum.mjs；tests/museum.test.mjs | G | 日常1016明确关卡、英雄和倍率出发已接；不等于完成领奖 |
| BIZ-D16 | 跨服积分赛探测；Function：DAILY_DRIVERS[1017] | 非C:跨服积分赛 | PARTIAL | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs | R | 只读/probe/状态或计划；不得作为对应写入已完成 |
| BIZ-D17 | 执行日常动作并收尾领奖；Function：runDailies→sendAction→claimDailies | C503 | PARTIAL | src/loop.mjs；src/workflow.mjs；src/operation-service.mjs；tests/workflow.test.mjs | G | 统一Dailies有限图覆盖9类明确动作子集及部分领取，装货与日常完成分离；完整17驱动和周期未全 |
| BIZ-D18 | 领取已完成日常任务奖励；Function：claimDailies | C503 | EXISTING_FUNCTION | src/task-rewards.mjs；tests/task-rewards.test.mjs | G | 明确日常taskId单次领取已有 |
| BIZ-D19 | 日/周活跃宝箱计划与领取；Function：chestTiers/planChests→claimDailies | C516 | PARTIAL | src/daily-task-rewards.mjs；tests/daily-task-rewards.test.mjs | G | 日活跃箱、周免费包和芯片任务子集已有；周活跃完整周期缺 |
| BIZ-D20 | 每日免费赠礼计划与验证；Function：planDailyGift→claimDailies | C513 | EXISTING_FUNCTION | src/task-rewards.mjs；tests/task-rewards.test.mjs | G | 固定每日赠礼受控领取；不含VIP或付费包 |
| BIZ-D21 | 主线/支线任务状态与领奖计划；Function：surveyTasks、taskTarget | C502 C503 | EXISTING_FUNCTION | src/task-rewards.mjs；tests/task-rewards.test.mjs | G | 主线、支线状态与单次受控领奖已有 |
| BIZ-D22 | 成就状态与领奖计划；Function：surveyTasks | 非C:成就 | EXISTING_FUNCTION | src/task-rewards.mjs；tests/task-rewards.test.mjs | G | 成就状态、奖励映射和单次受控领取已有 |
| BIZ-D23 | 每日订单档位判断；Function：nextOrderTier→surveyTasks | 非C:订单档奖励 | PARTIAL | src/tasks.mjs；src/loop.mjs；src/core-operation-adapters.mjs；tests/execution-lifecycle.test.mjs；tests/workflow.test.mjs | R | Tasks观察及Tasks/Loop显式Orders SURVEY已接；1495e48保存明确完成数/已领奖阈值历史，缺失不补零；适用赛季/周期、领取资格及到账仍缺证，无领奖写 |
| BIZ-D24 | 主/支/成就/订单档奖励串行领取；Function：runTasks | C503 C604 | PARTIAL | src/loop.mjs；src/workflow.mjs；src/operation-service.mjs；tests/workflow.test.mjs | G | Tasks具名主线、支线、成就转原Workflow；订单档合同缺 |
| BIZ-D25 | 一键可领取清单与前后对比；Function：app内部planLoot→loot→runAction | C511 C513 | PARTIAL | src/app.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 旧loot清单和dry保留，独立及批量旧写拒绝；迁移单项走原Service |
| BIZ-L01 | 角色摘要/区服列表与分组；Function：describeRole/listWorlds/listGroup | C003 | EXISTING_FUNCTION | src/server.mjs；tests/server-runtime.test.mjs | T | 列表及显式CLI切服已有，网页enter仍403，创建角色未授权 |
| BIZ-L02 | 指定区服登录；Function：enterWorld→新GameClient.connect({...login,worldId}) | C003 | PARTIAL | src/world.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 只读world列表保留，enterWorld写拒绝，Web enter403 |
| BIZ-L03 | 固定三段自动循环；Function：runLoop → surveyTasks/runTasks → surveyDailies/runDailies → surveyWorld/planWorld/runWorld | C605 C604 | PARTIAL | src/loop.mjs；src/workflow.mjs；src/operation-service.mjs；tests/workflow.test.mjs | G | Loop编译为原Registry有限图，明确轮次、间隔、期限与父预算；未迁移驱动不派发 |
| BIZ-L04 | 循环轮次记录/步骤回调；Function：runLoop history/onRound/onStep→formatLoopRound | C606 | PARTIAL | src/execution-history.mjs；src/workflow.mjs；tests/workflow-execution-history.test.mjs | G | run、节点、批次及动作持久查询已有，批次/记忆可精确只读导航原执行证据；重启不恢复计时授权 |
| BIZ-L05 | 订单库存→评估→刷新/交单组合；Function：新order-rules只读决策 + 旧finishOrder/rerollOrder | C125 C126 | PARTIAL | src/order-execution.mjs；tests/order-execution.test.mjs | G | 规则/三值评估/库存复查已有；免费刷新资格缺证继续冻结 |
| BIZ-L06 | 建筑→队列→收取/排产组合；Function：surveyWorld→planWorld→runWorld | C101 C111 C115 C116 | EXISTING_FUNCTION | src/city-operations.mjs；tests/city-operations.test.mjs | G | 建筑信息与业务页面已有 |
| BIZ-L07 | 玩家→指定阵容→主线组合；Function：玩家/formation读取与Stage Runner已存在，应用阵容动作未接 | C214 C204 | EXISTING_FUNCTION | src/formation.mjs；tests/formation.test.mjs | G | 指定阵容SAVE独立复读后走原Stage；不外推其他战斗模式 |
| BIZ-L08 | 舰队→维修→派遣组合；Function：目标仅fleet读取+资源田手动计划；无Repair Function | C401 C407 C406 | PARTIAL | src/fleet.mjs；tests/fleet.test.mjs | G | 维修、编队及明确移动可组合；移动不代替攻击 |
| BIZ-L09 | 通用 Workflow Engine / DAG / Rules编排 | C601 C602 C603 C604 C605 C606 C607 | PARTIAL | src/loop.mjs；src/workflow.mjs；src/operation-service.mjs；tests/workflow.test.mjs | G | 原DAG、父预算、日周、可信事件及具名WAIT已有；全业务策略未全 |
| BIZ-R01 | 联盟订单交付（当前DATA_ONLY） | 非C:联盟订单 | EXISTING_FUNCTION | src/alliance.mjs；tests/alliance.test.mjs | G | 明确联盟订单预算授权与独立复读已有 |
| BIZ-R02 | 联盟情报奖励/派舰/修理（当前无执行） | C403 C407 非C:雷达奖励派舰 | PARTIAL | src/fleet.mjs；tests/fleet.test.mjs | G | 有界观察、维修移动已有；情报奖励及派舰完整归属缺 |
| BIZ-R03 | 海盗派舰实战与免战扫荡（当前扫荡PARTIAL） | C151 非C:海盗实战 | PARTIAL | src/pirate-sweep.mjs；tests/pirate-sweep.test.mjs | G | 精确扫荡已有；海盗实战、完整奖励和日界缺 |
| BIZ-R04 | 贸易货船补货/返航领奖（当前DATA_ONLY） | C131 C132 C133 C134 | PARTIAL | src/fleet.mjs；tests/fleet.test.mjs | G | 专业缺货、装货、到港领取已有；全范围受D6和证据限制 |
| BIZ-R05 | 联盟商船补货与应聘船长（当前未接） | 非C:联盟商船 | PARTIAL | src/alliance.mjs；tests/alliance.test.mjs | G | 单船补货、应聘船长及私有状态修订已接；收益、补购、隐藏占用缺 |
| BIZ-R06 | 联盟福利礼包领取（当前未接） | 非C:联盟福利 | EXISTING_FUNCTION | allianceView/verifyAlliance; src/alliance.mjs | G | 领取现有福利需权威时间/库存/回包复读 |
| BIZ-R07 | 装备厂制造/收取（当前只有装备DATA） | 非C:装备厂 | PARTIAL | src/equipment-forge.mjs；tests/equipment-forge.test.mjs | G | 自有配方MAKE和到期单批PICK已有；本批明确允许配方内按闲置＋在产部位数量及品质准备一份，固定队列/数量护栏，经同Service/API/专业页/Workflow和父预算，收取确认后才制造；普通材料切片OFFLINE_VERIFIED，通用实际扣取顺序/混用成本仍缺证，缺队列不当空闲 |
| BIZ-R08 | 海兽培育/成熟收取/材料投喂（当前DATA_ONLY） | 非C:海兽培育 | PARTIAL | src/pet-operations.mjs；tests/pet-operations.test.mjs | G | 明确Pet FEED及服役单级LEVEL已有；后者绑定建筑/UID、私有玩家等级与推送修订，独立确认下级属性及精确经验扣减；培育、成熟领取仍缺可恢复目标身份 |
| BIZ-R09 | 徽章/装备/专武完整养成（当前DATA_ONLY） | C225 C226 C227 C228 C229 C230 | PARTIAL | src/hero-operations.mjs；src/equipment-growth.mjs；src/badge-growth.mjs；tests/equipment-growth.test.mjs | G | 已激活专武升等星、空槽穿戴、装备明确零费首次/正等级升级红精炼星及徽章升级红星已有；完整成长未全 |
| BIZ-R10 | 挂机、邮件及升级依赖计划（当前底层Action已在） | C511 非C:挂机依赖计划 | PARTIAL | src/mail.mjs；src/afk-level-rewards.mjs；tests/mail-claim.test.mjs；tests/afk-level-rewards.test.mjs | G | 单封读领、等级奖励、普通物品/徽章收益及其后明确1/5/10级升级已有；有限原收益→升级准备/API/UI已有；其他实例收益、邮件实例附件及完整范围未齐；UNKNOWN零重放 |
| BIZ-R11 | 世界宝藏货轮抢占（当前未接） | 非C:世界宝藏 | PARTIAL | surveyTreasure/planTreasure/verifyTreasure; src/treasure.mjs | G | 只证无争夺派舰分配；非抢占胜利/奖励闭环 |
| BIZ-R12 | 城战读状态、修理、调遣、在线奖（当前只有占位） | C403 C406 C407 非C:城战在线奖 | PARTIAL | src/naval-rules.mjs；tests/naval-rules.test.mjs | G | WorldInfo当前视野、精确ID及资源田读取，不宣称全图完整 |
| BIZ-R13 | 海商王买卖/移动/奖励/免费战令（当前未接） | C521 C522 C523 C524 | PARTIAL | src/trade.mjs；tests/trade.test.mjs | G | 当前港价容量及单BUY、SELL、MOVE、自有SPEED已有；目的地策略、到达收益、奖励战令缺 |
| BIZ-R14 | 工厂独立页面与自选材料包覆盖（当前仅简单排产） | C111 C112 C114 C115 C116 非C:自选包 | PARTIAL | src/production-planning.mjs；src/material-packs.mjs；tests/material-packs.test.mjs | B | 专业生产页、明确自选包和覆盖投影已有；投影不进库存，全天量缺 |
| BIZ-R15 | 漂浮物拾荒、礼包码（当前只有计数/协议） | 非C:漂浮物礼包码 | PROTOCOL_ONLY | target ACTIONS src/actions.mjs无pickUpFloater/giftCode | P | 参考新增Action尚未移植 |
| BIZ-R16 | 农田种植/喂种、委任减时、订单供给水位（当前简单planWorld未有） | C113 C114 非C:农田委任水位 | PARTIAL | src/farm-operations.mjs；tests/farm-operations.test.mjs | G | 委任减时、种子作物水位及单田种收已有；原批量结算未全 |
| BIZ-R17 | 活动幽都驱邪/罗盘/敕令/签到（当前未接） | C501 C502 C503 | PARTIAL | src/daily-checklist.mjs；src/client.mjs；tests/daily-checklist.test.mjs | R | 签到仅可信私有流前置观察；幽都、罗盘、敕令写未接 |
| BIZ-R12a | claimWarOnlineReward；参考cityWar:638–670 | 非C:城战在线奖 | PROTOCOL_ONLY | target registry src/function-registry.mjs无claimWarOnlineReward | P | GotWorldOnlineRwdRequest存在不等于Function；纳W14补资格/回包关联/权威复读 |
| BIZ-R16a | farmOf；参考world:190；surveyWorld:368 | C113 C114 非C:农田委任水位 | EXISTING_FUNCTION | src/farm-operations.mjs；tests/farm-operations.test.mjs | R | 农田结构、种子、时段观察已有；缺字段UNKNOWN |
| BIZ-R16b | 增强planWorld farmHarvest分支；参考world:1555–1577→runWorld | C113 C114 非C:农田委任水位 | PARTIAL | src/farm-operations.mjs；tests/farm-operations.test.mjs | G | 单田HARVEST与明确1至12田的有限顺序准备/API/UI已有；固定剩余来源，复用原预算/授权/History，单田与组合拒绝身份统一；批量协议结算仍未全 |
| BIZ-R16c | 增强planWorld farmPlant分支；参考world:1579–1687→runWorld | C113 C114 非C:农田委任水位 | PARTIAL | src/farm-operations.mjs；tests/farm-operations.test.mjs | G | 明确空田、自有种子、autoFarming=false单PLANT及1至12田明确作物的有限顺序准备/API/UI已有；固定剩余来源、初始足额种子及累计预算，逐田净扣确认；已收田来源串联、自动策略与批量协议仍未全 |
| BIZ-R16d | appointEffectValue→appointProduceReduce→produceFinalTime；参考world:205,217,234；surveyWorld:383–389 | C113 C114 非C:农田委任水位 | EXISTING_FUNCTION | src/production-planning.mjs；tests/production-planning.test.mjs | B | 委任效果及减时纯投影已有；不更改任命或冒充实际耗时 |
| BIZ-R16e | 增强planWorld内部waterlineOf；参考world:1065–1089 | C113 C114 非C:农田委任水位 | EXISTING_FUNCTION | src/production-planning.mjs；tests/production-planning.test.mjs | B | 原Production水位策略已有；预测收成不进库存 |
| BIZ-R16f | 增强planWorld种子缺口需求；参考world:1091–1130 | C113 C114 非C:农田委任水位 | EXISTING_FUNCTION | src/production-planning.mjs；tests/production-planning.test.mjs | B | 种子需求缺口纯规划接原策略 |
| BIZ-R16g | 增强planWorld过剩作物→成品需求；参考world:1131–1167 | C113 C114 非C:农田委任水位 | EXISTING_FUNCTION | src/production-planning.mjs；tests/production-planning.test.mjs | B | 过剩作物到成品需求纯规划已有；实际消耗走原账本 |
| BIZ-R16h | decideOrderReroll；参考world:274；增强planWorld:872–1029 | C113 C114 非C:农田委任水位 | PARTIAL | src/production-planning.mjs；src/core-operation-adapters.mjs；src/server.mjs；src/page.mjs；src/gameplay-page.mjs；原领域/HTTP/Workflow/页面测试 | B | 已补原缓存预览和原注册Function/Service/API/Workflow的队列/总效果等待、完成/领奖阈值和客户端上限投影；单条等待标记到点仍须复读。明确上海本地时窗、完成计数及等待投影阈值已接原规则/API/UI/共享执行；每次写前重查，阈值通过仍须真实库存，刷新须独立资格。周期及免费配额仍缺证，保留UNKNOWN与KEEP/REFRESH/REVIEW |
| BIZ-R17a | planYoudu kill分支；参考youdu:230–249→runWorld | C501 C502 C503 非C:幽都活动 | PROTOCOL_ONLY | target src/function-registry.mjs; src/dailies.mjs未实现youdu分支 | P | 原参考分项未移植；需活动状态/成本/奖励/账号记忆合同后适配 |
| BIZ-R17b | planYoudu驱邪累计奖励；参考youdu:252–277→runWorld | C501 C502 C503 非C:幽都活动 | PROTOCOL_ONLY | target src/function-registry.mjs; src/dailies.mjs未实现youdu分支 | P | 原参考分项未移植；需活动状态/成本/奖励/账号记忆合同后适配 |
| BIZ-R17c | planYoudu罗盘；参考youdu:279–298→runWorld | C501 C502 C503 非C:幽都活动 | PROTOCOL_ONLY | target src/function-registry.mjs; src/dailies.mjs未实现youdu分支 | P | 原参考分项未移植；需活动状态/成本/奖励/账号记忆合同后适配 |
| BIZ-R17d | planYoudu罗盘累计奖；参考youdu:300–315→runWorld | C501 C502 C503 非C:幽都活动 | PROTOCOL_ONLY | target src/function-registry.mjs; src/dailies.mjs未实现youdu分支 | P | 原参考分项未移植；需活动状态/成本/奖励/账号记忆合同后适配 |
| BIZ-R17e | planYoudu敕令开局；参考youdu:337–347→runWorld | C501 C502 C503 非C:幽都活动 | PROTOCOL_ONLY | target src/function-registry.mjs; src/dailies.mjs未实现youdu分支 | P | 原参考分项未移植；需活动状态/成本/奖励/账号记忆合同后适配 |
| BIZ-R17f | planYoudu敕令作答/settleYouduEdict；参考youdu:317–336,429–445 | C501 C502 C503 非C:幽都活动 | PROTOCOL_ONLY | target src/function-registry.mjs; src/dailies.mjs未实现youdu分支 | P | 原参考分项未移植；需活动状态/成本/奖励/账号记忆合同后适配 |
| BIZ-R17g | runYouduActive；参考youdu:378–418 | C501 C502 C503 非C:幽都活动 | PROTOCOL_ONLY | target src/function-registry.mjs; src/dailies.mjs未实现youdu分支 | P | 原参考分项未移植；需活动状态/成本/奖励/账号记忆合同后适配 |
| BIZ-R17h | runYouduSigns；参考youdu:481–550 | C501 C502 C503 非C:幽都活动 | PARTIAL | src/daily-checklist.mjs；src/client.mjs；tests/daily-checklist.test.mjs | R | 可信窗口签到观察已有；完整目录、日界、资格、成本及领取结算缺 |
| ORD-001 | 读取居民订单 | C121 | EXISTING_FUNCTION | surveyWorld/surveyOrderExecution; src/world.mjs; src/order-execution.mjs | R | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-002 | 解析需求物品与数量 | C122 | EXISTING_FUNCTION | surveyWorld/surveyOrderExecution; src/world.mjs; src/order-execution.mjs | R | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-003 | 库存与缺口计算 | C123 | EXISTING_FUNCTION | surveyWorld/surveyOrderExecution; src/world.mjs; src/order-execution.mjs | R | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-004 | 普通订单经验 | C124 | EXISTING_FUNCTION | surveyWorld/surveyOrderExecution; src/world.mjs; src/order-execution.mjs | R | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-005 | 特殊订单经验 | C124 | EXISTING_FUNCTION | surveyWorld/surveyOrderExecution; src/world.mjs; src/order-execution.mjs | R | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-006 | 金币奖励解析 | C124 | PARTIAL | src/order-rewards.mjs；tests/order-rewards.test.mjs | B | 普通SUM基础奖励、特殊直接reward及事后关联已有；最终金币未知，MIN_GOLD不开放 |
| ORD-007 | 规则契约校验 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-008 | 规则增删编辑/排序/启停 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-009 | 原始物品ID匹配与名称展示 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-010 | 禁止物品 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-011 | 必须包含全部指定物品 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-012 | 经验GT/GTE阈值 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-013 | 单物品需求数量上限 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-014 | 库存规则及最终独立库存检查 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-015 | 优先级短路评估 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-016 | 每条规则独立KEEP/REFRESH/REVIEW | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-017 | 全通过后建议提交 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-018 | 账号隔离持久化/安全回退 | C127 | EXISTING_FUNCTION | loadOrderRules/saveOrderRules; src/order-rules-store.mjs | L | 精确账号持久化，损坏保留不覆盖 |
| ORD-019 | Snapshot模拟与解释 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-020 | 跨订单库存预留 | C123 | EXISTING_FUNCTION | ResourceLedger/evaluateOrders/planOrderExecution; src/order-rules.mjs; src/order-execution.mjs | B | PHASE1/2已共享跨订单预算；独立快照预览与执行计划需区分 |
| ORD-021 | 规则建议→真实提交/刷新 | C126 | PARTIAL | planOrderExecution/executeOrderOperation; src/order-execution.mjs | B | SUBMIT闭环存在；REFRESH仍因免费配额证据缺失被阻塞 |
| ORD-022 | 订单执行历史持久化 | C128 | EXISTING_FUNCTION | createExecutionHistory/createOperationService; src/execution-history.mjs; src/operation-service.mjs | B | 账号级持久历史已实现；真实写入/重启恢复仍待最终验收 |
| STG-001 | 从当前主线启动 | C201 C202 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-002 | 主线专用LEFT授权 | C203 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-003 | 关卡号/Boolean胜负检查 | C203 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-004 | 胜利推进下一关 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-005 | 明确战败后重试 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-006 | 首次战败立即停止 | C204 C606 | EXISTING_FUNCTION | src/stages.mjs；src/stage-function.mjs；src/page.mjs；tests/stages-view.test.mjs | S | 原API及独立首次战败勾选已有，保留轮询草稿且换账号清空；本批Function与Workflow确认战败后FAILED停止，未知结果不续跑；真实未验 |
| STG-007 | 最大总开战次数 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-008 | 最高目标关卡 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-009 | 胜利后随机10–11秒 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-010 | 下一关倒计时/随机时长历史 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-011 | RATE_LIMITED独立停止 | C205 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-012 | 同账号排他/未决锁 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-013 | 停止/失效/删除取消 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-014 | runId/generation/迟到保护 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-015 | 内存历史/状态重读 | C204 C606 | EXISTING_FUNCTION | src/stages.mjs；src/stage-history.mjs；tests/stage-history.test.mjs | S | 内存当前状态保留，逐场持久历史另已接；重启只读 |
| STG-016 | 持久化Runner历史/自动恢复 | C204 C606 | PARTIAL | src/stages.mjs；src/stage-history.mjs；tests/stage-history.test.mjs | S | 持久历史与只读重启已有；自动恢复标题不授予写重放，UNKNOWN保守锁 |
| STG-017 | 其他战斗模式支持 | 非C:其他战斗模式；W08/W14（不并入C204/C606完成数） | PARTIAL | src/expedition-formations.mjs；src/trial-challenge.mjs；tests/expedition-formations.test.mjs | G | 其他模式阵容和经验试炼子集已有；全模式战斗阵营奖励未全 |
| FRM-001 | 当前主线阵容读取 | C211 C207 | EXISTING_FUNCTION | surveyFormation/parseFormation; src/formation.mjs | R | 实时阵容与本次战斗阵容保持不同证据 |
| FRM-002 | 已解锁阵型模板ID读取 | C212 | EXISTING_FUNCTION | surveyFormation/catalogFrom; src/formation.mjs | R | 模板ID不是完整队伍存档 |
| FRM-003 | 保存/修改当前阵容 | C213 C214 | EXISTING_FUNCTION | planFormation/verifyFormation; src/formation.mjs | G | 完整SaveFormation与复读已做 |
| FRM-004 | 应用已解锁阵型模板 | C213 C214 | EXISTING_FUNCTION | candidate/planFormation/verifyFormation; src/formation.mjs | G | 按职业重排站位/保留petUid；只用已解锁模板 |
| FRM-005 | 解锁阵型模板 | 非C:解锁阵型 | EXISTING_FUNCTION | src/formation-unlock.mjs；tests/formation-unlock.test.mjs | G | 自有普通图纸明确单目标解锁；D6购买补图拒绝 |
| FRM-006 | 更换上下阵英雄 | C213 C214 | EXISTING_FUNCTION | src/formation.mjs；tests/formation.test.mjs | G | 明确完整英雄站位上下阵SAVE与独立复读已有；非自动换阵 |
| FRM-007 | 具名多套完整英雄队伍预设 | 非C:具名完整队伍预设 | EXISTING_FUNCTION | src/named-formations.mjs；tests/named-formations-service.test.mjs | G | 整队具名存改删、只读重启和准备应用已有；应用需原新计划授权 |
| FRM-008 | 闯关前应用并确认阵容 | C214 C204 | EXISTING_FUNCTION | assertFormationReady; src/operation-service.mjs; createStageFunction src/stage-function.mjs | G | 同Session保存/复读后允许主线；明确有限候选确认战败分支已有，统计/规则优化仍未全 |
| PRO-001 | 公会科技 | C306 C307 | PARTIAL | src/alliance.mjs；tests/alliance-tech.test.mjs | G | 科技状态、精确单升及扣点复读已有；科技重置缺合同 |
| PRO-002 | 公会订单与互助 | C301 C302 C303 C304 C305 非C:联盟订单 | PARTIAL | src/alliance.mjs；tests/alliance-tech.test.mjs | G | reqId精确绑定成员求助单，已有展示 |
| PRO-003 | 舰队维修/编队/派遣 | C401 C402 C406 C407 C408 | PARTIAL | src/fleet.mjs；tests/fleet.test.mjs | G | MyFleets+OnWater队伍读取已有，不用MyFleets代替阵容复读 |
| PRO-004 | 货船操作 | C131 C132 C133 C134 | PARTIAL | src/fleet.mjs；tests/fleet.test.mjs | G | CargoShips读取和通用Fleet展示已有 |
| PRO-005 | 世界与限时 Boss 战斗 | 非C:世界/限时Boss | PROTOCOL_ONLY | surveyNaval/navalView; src/naval-rules.mjs | P | 写候选不生成；独立战斗语义和结果关联缺失 |
| PRO-006 | 博物馆展陈与探险 | C141 C142 C143 C144 | PARTIAL | src/museum.mjs；tests/museum.test.mjs | G | 探索次数/进度/状态可读，COMPLETE_UNSETTLED独立 |
| PRO-007 | 藏品养成 | 非C:藏品养成 | PARTIAL | src/antique-growth.mjs；tests/antique-advanced.test.mjs | G | 古董激活、专属碎片星、套装、精通及万能兑换已有；完整范围未全 |
| PRO-008 | 贸易与货运玩法 | C521 C522 C523 C524 | PARTIAL | src/trade.mjs；tests/trade.test.mjs | G | 原贸易单步写、观察和WAIT已有；全策略、目的地价格与到达收益缺 |
| PRO-009 | 寻宝与掠夺 | 非C:世界宝藏 | PARTIAL | surveyTreasure/planTreasure/verifyTreasure; src/treasure.mjs | G | 列表/排名/防守+无争夺派舰；缺抢占/战斗/领奖 |
| PRO-010 | 其他模式阵容 | 非C:其他模式阵容 | PARTIAL | src/expedition-formations.mjs；src/trial-challenge.mjs；tests/expedition-formations.test.mjs | G | 主线与远征阵容子集已有；其他模式未全，不外推主线LEFT |

本附录按具体子Function补充证据；第5节95项完整需求分类为统计权威，子Function存在不能覆盖整项PARTIAL。所有测试均为指定版本历史证据，本轮没有重跑。

## 附录B — PHASE3历史Function、API/UI及测试证据（a505019快照）

本节逐项对照原三维度需求、Inventory、`docs/baseline.md`、两份 PHASE 3 文档与当前实现；没有运行测试、启动 Runtime 或连接真实游戏。`docs/PHASE_3_ACCEPTANCE.md:127` 的 845/845 Node 与 29 组 selftest 是历史离线证据。提交 `a505019` 只改 README 和两份阶段文档，代码测试的末版本为其父提交 `f300a35`；不能声称本轮重跑或真实通过。以下所有新增写能力均 `REAL_UNVERIFIED`。协议证据来自已缓存客户端 v76 `work/extracted/_src_chunks_/src/chunks/game.js`，由 `src/proto.mjs:46` 加载；本轮仅读静态文本，未执行客户端。

### B.1 逐 C 需求复核

Function 状态与 API/UI、离线测试、外部证据阻塞分别记录。EXISTING_FUNCTION 指明确业务子能力存在，不能外推该业务全部闭环或自动调度已完成。普通 gameplay API 只暴露受控业务参数及计划，不接受 Request/body/成本覆盖。

| C ID | Function 现状 | API/UI 现状与边界 | 源码与离线测试证据 | 待完成或证据阻塞 |
|---|---|---|---|---|
| C131 | EXISTING_FUNCTION | fleet 现有货船页面/通用候选，未单独制作原 P2-6 专业港口页 | `fleet.mjs:18` survey 的 CargoShips；`:134` fleetView 返回 ships；`tests/fleet.test.mjs:15` | 读取链已存在，应复用而非重新移植 tradePort |
| C132 | PARTIAL | 缺料表现为候选不可执行原因，缺逐物品 missing 清单/高亮 | `fleet.mjs:119` 从 order.asset 算成本；`:125` 资源不足阻断；`tests/fleet.test.mjs:16` | 扩展 view 的 required/have/missing 和 P2-6 表格，不新建预算器 |
| C133 | EXISTING_FUNCTION | fleet cargoFill 经 OperationService 单次计划/授权/执行；通用页面可用 | `fleet.mjs:127` FillCargoShipRequest/Response；`:194` 精确货格验证；`tests/fleet.test.mjs:15,20` | REAL_UNVERIFIED；不能购买缺料；保持 1-based cargoIndex |
| C134 | EXISTING_FUNCTION | fleet cargoClaim 经同一批次 API/UI | `fleet.mjs:129` DrawShipReward；`:198` 验证原到港状态消费+精确船+奖励回包；`tests/fleet.test.mjs:20` | REAL_UNVERIFIED；当前只验证回包与船状态，最终 E2E 必须额外核对奖励库存变化 |
| C141 | EXISTING_FUNCTION | museum 独立页，通用 JSON 状态/候选 | `museum.mjs:40` surveyMuseum、`:56` stateOf、`:58` museumView；`tests/museum.test.mjs:26` | IDLE/EXPLORING/COMPLETE_UNSETTLED 分开，缺字段 UNKNOWN |
| C142 | PARTIAL | 已有成本与资源不足阻断，无明细 missing 输出 | `museum.mjs:60` Ledger、`:61` add、`:93` 权威消耗、`:175` planMuseum；`tests/museum.test.mjs:40` | 把费用/库存线/缺口输出成结构化清单，复用 Ledger 与现有 view |
| C143 | EXISTING_FUNCTION | museum 出发及道具加速有受控候选；未形成出发到领奖完整循环 | `museum.mjs:95` MuseumStartExplore、`:82` MuseumSpeedUpExplore、`:188` start 验证、`:192` speed 验证 | REAL_UNVERIFIED；英雄忙闲、队伍位、factor、权威 cost 及实际扣料必需；Complete/Reward 属 C144 缺口 |
| C144 | PROTOCOL_ONLY + BLOCKED_EVIDENCE | UI 明确显示阻塞；无结算/探险领奖候选或 body 构造 | `museum.mjs:74` SETTLEMENT_PENDING_STATE_NOT_OBSERVABLE / REQUIRES_VERIFIED_COMPLETE_RESULT_AND_PENDING_IDENTITY；`tests/museum.test.mjs:26` | MuseumCompleteExplore 与 MuseumReward 是两个请求，缺可恢复 pending 身份。收益 collectRevenue/成就 claimAchievement 不能冒充探险奖励 |
| C206 | EXISTING_FUNCTION | 主线已有战报分析 details，展示实际右队，非独立抓敌请求 | `formation.mjs:198` battleAnalysis/rightTeams；`stages.mjs:255` 消费原回包；`page.mjs:1218`；`tests/formation.test.mjs:170` | 来自已发生主线战斗，不额外发挑战；非主线不能继承 LEFT 结论 |
| C207 | EXISTING_FUNCTION | 战报实际 leftTeam 与当前 GetFormation 保留不同来源 | `formation.mjs:180,198`；`tests/formation.test.mjs:170,180` | 不可用当前阵容替代历史参战队伍 |
| C208 | EXISTING_FUNCTION | 现有主线分析面板；保守 TEAM_WIPED/DAMAGE_GAP/站位对照 | `formation.mjs:198`；`stages.mjs:255`；`tests/formation.test.mjs:180,187,195` | 只在完整统计支持时下结论，不推断阵亡时序或阵容必优 |
| C209 | PARTIAL | 展示建议但 automaticSwitch=false、resumeAllowed=false；无自动换阵控制闭环 | `formation.mjs:205,234` recommendFormations 只生成 CLIENT_CAREER_LAYOUT 预览；`tests/formation.test.mjs:195` | 缺按统计/规则选择更优阵容、战败后的新计划授权/保存复读/有限续跑策略；不能把职业布局候选称自动换阵完成 |
| C211 | EXISTING_FUNCTION | formation 独立页、当前队伍/宠物只读 | `formation.mjs:98,154`；`tests/formation.test.mjs:37` | GetFormation(module=1)；保留 petUid 精度和缺失语义 |
| C212 | EXISTING_FUNCTION | 已解锁模板列表、网格布局 | `formation.mjs:69,98,154`；`gameplay-page.mjs:27,43`；`tests/formation.test.mjs:71,79` | 模板 ID 仅布局，不是完整队伍存档；不自动解锁 |
| C213 | EXISTING_FUNCTION | 模板、英雄、手动坐标参数校验及候选禁用原因 | `formation.mjs:52,69,120`；`tests/formation.test.mjs:84,91,97,103` | 上阵人数严格 stage > 阈值，归属/职业/解锁/站位/宠物均校验 |
| C214 | EXISTING_FUNCTION | 完整保存/切换/重新应用/恢复旧队参数，经原授权 API/UI | `formation.mjs:161,170`；`tests/formation.test.mjs:146,205,231,239`；`tests/gameplay-api.test.mjs:112` | SaveFormation 回包与新 GetFormation 全量相符才 CONFIRMED；恢复是新授权而非自动回滚 |
| C215 | NOT_IMPLEMENTED | 没有复制极限通关控件和算法 | `formation.mjs:234` 只按职业排已有英雄；`gameplay-page.mjs:49,53` 仅职业重排/手动/恢复 | 需定义源战报身份、敌我英雄映射/缺失英雄/布局坐标转换与用户预览，不能把 preset 切换或恢复旧队当一键复制 |
| C301 | EXISTING_FUNCTION | alliance 请求列表/权威详情/阻塞原因 | `alliance.mjs:84` surveyAlliance、`:99` allianceView；`tests/alliance.test.mjs:14` | reqId 绑定 asker.playerId，区分本人/他人请求 |
| C302 | EXISTING_FUNCTION | alliance 成员数据已展示于通用详情，原专业列表可再改进 | `alliance.mjs:92` titleList.members 映射、`:97` membersReliable；`tests/alliance.test.mjs:14,17` | 精确 int64 ID；不能再以历史 DISCOVER 认定成员识别未实现 |
| C303 | PARTIAL + BLOCKED_EVIDENCE | help 按成员配置存在；真实 survey→plan 不能生成可执行 help | `alliance.mjs:36` allianceHelpRules、`:96` 固定 helpAllowance:null/helpUsage:null、`:113` 候选；`tests/alliance.test.mjs:16,32,33,34` | 缺服务端每日配额/冷却和可信日用量生产来源；合成注入成功不是产品闭环；不是任意物品转移 |
| C304 | PARTIAL + BLOCKED_EVIDENCE | 与 C303 共用 help 适配器，按 itemIds/priorityItemIds 配置 | 同 C303；`alliance.mjs:52` 物品过滤、`:113` 一件物资/reqId；`tests/alliance.test.mjs:34` | 不得另建捐赠执行器；DonateFort 不代表互助捐赠 |
| C305 | PROTOCOL_ONLY + BLOCKED_EVIDENCE | ask 配置存在，但 view 永久 block，无 GuildAidAsk body 构造 | `alliance.mjs:120` ASK_DAILY_LIMIT_UNKNOWN/ASK_COOLDOWN_UNKNOWN；`tests/alliance.test.mjs:20` | 缺可信求助冷却、阈值驱动、日限与执行/复读；仅协议 reqItemId/type 存在 |
| C306 | EXISTING_FUNCTION（原始只读范围） | Snapshot/Explorer 可读；没有原 P4-4 专门科技树展示 | `game.mjs:34` GuildTechInfo、`data-catalog.mjs:48`；`tests/data-catalog.test.mjs:29` | 不将 raw 查询描述成科技升级计划或 UI 树 |
| C307 | PROTOCOL_ONLY | 无 UpgradeGuildTech 业务 Function/API/专业 UI | 缓存 proto UpgradeGuildTechRequest{techId} 存在，`CAPABILITY_INVENTORY.md:648` 作索引；src 搜索没有对应执行构造 | 需还原 GuildTechCfg 前置/成本/权限、升级计划/复读；Reset 是独立需求和可能付费，不能顺带开放 |
| C401 | EXISTING_FUNCTION | fleet 页读取 MyFleets；开启 formation 后读 OnWater 真正队伍 | `fleet.mjs:18,24,134`；`naval-facts.mjs:50`；`tests/fleet.test.mjs:39` | MyFleets 无 formation 权威字段，不能当保存复读来源 |
| C402 | EXISTING_FUNCTION（无非零宠物舰队范围） | fleet formation 经通用参数页/授权候选可用 | `fleet.mjs:97` 复用 planFormation、`:105` FleetSaveFormation、`:165` verify；`tests/fleet.test.mjs:34,35,36`；`tests/naval-protocol.test.mjs:15` | 非零 petUid 的舰队绑定 BLOCKED_EVIDENCE，其他舰队占用英雄要保持；不复制主线保存器 |
| C403 | EXISTING_FUNCTION（当前响应范围） | naval 当前 WorldInfo 舰队/玩家/城市筛选；fleet 当前城市读取 | `naval-rules.mjs:52,69`、`fleet.mjs:45`；`tests/naval-rules.test.mjs:54,58,59` | 标明 CURRENT_RESPONSE_ONLY，不宣称覆盖全地图/跨视野/持续追踪 |
| C404 | PARTIAL | 当前观察及三值规则可用，无长期事件流 | `naval-rules.mjs:67` scope、`:87` observations；`tests/naval-rules.test.mjs:54` | 缺有限轮询/事件生命周期、目标变更去重、冷却与持久事件游标；共享调度器扩展，不能每页面另起循环 |
| C405 | PARTIAL + BLOCKED_EVIDENCE | 已能以精确 playerId 过滤当前观察；不是跟随位置事件流 | `naval-rules.mjs:42,75,91`；`tests/naval-protocol.test.mjs:17` | 缺跨视野稳定目标定位与派遣语义；禁止昵称推断ID；没有 FleetInfoRequest 可猜 |
| C406 | PARTIAL + BLOCKED_EVIDENCE | 已有 MoveFleetsToCity 授权候选和移动复读；没有攻击/宣战完成判据 | `fleet.mjs:56,114,190`；`tests/fleet.test.mjs:13,19,23` | movement≠attack≠win；敌城缺地图几何/油费时阻断，主线 LEFT 证据不能移植海战 |
| C407 | EXISTING_FUNCTION | 维修阈值/模式/专用计划汽油预算/优先级及停止维修可用 | `fleet.mjs:38,72,88,141,181`；`tests/fleet.test.mjs:10,12,37,43,44,45,46` | RepairFleetParam 单价×缺耐久向上取整；默认维修预算0；WAIT_NATURAL仅观察；autoFight 必须明确 false |
| C408 | PROTOCOL_ONLY + BLOCKED_EVIDENCE | speedUp 配置有但不产生可执行候选 | `fleet.mjs:134` speedUpFleet/Repair/Cargo 全阻塞；`tests/fleet.test.mjs:14` | 行军加速缓存客户端为 RUBY；维修/货船的免费道具路径/成本/身份未证实。只可研究D6内道具，不能为完成编号开放钻石 |
| C409 | D6 范围明确排除消费功能；EXISTING_FUNCTION 为统一硬拒绝 | 没有可批准钻石消费的 UI；配置不能解除 | `actions.mjs:275,277` assertPaymentAllowed；`tests/actions-safety.test.mjs:62` | 原 Master 明确 EXCLUDE：不要把缺消费模块算待开发，也不得让 [H] 确认解除 D6 |
| C410 | PARTIAL | 有序三值规则/观察轨迹；无可执行动态攻击计划 | `naval-rules.mjs:10,87,94` evaluateNavalRules/planNaval；`tests/naval-rules.test.mjs:6,13,38` | 依赖 C403-C408，先补 attack/follow 权威语义；规则 PASS 不能冒充派遣许可 |
| C601 | EXISTING_FUNCTION | 业务 Survey 与 Workflow SURVEY 节点存在 | `workflow.mjs:136` 调 OperationService.surveyModule；`operation-service.mjs:92`；`tests/workflow.test.mjs:29` | 不重建48项 Snapshot；新增事实查询登记来源、范围、时效 |
| C602 | PARTIAL（全产品范围） | 各业务计划与现有 Workflow ACTION plan 可用，覆盖不完整 | `operation-service.mjs:103`、`workflow.mjs:137`；`tests/gameplay-execution.test.mjs:80` | city/orders 是专用分支，不在 Workflow 模块注册；hero/tasks/dailies/trade 亦未全接 |
| C603 | PARTIAL（全产品范围） | 受控 adapter 共用 executeBusinessOperation；原业务有独立旧执行路径 | `business-functions.mjs:12`、`operation-service.mjs:207`；`tests/gameplay-execution.test.mjs:72,97,102,106,114` | 继续适配旧 Function 到共同计划/确认契约，不能宣布所有旧路径都具 OperationService/持久History |
| C604 | PARTIAL | Loop 内存 rejected Set 有，持久跨轮拒绝/冷却/次数记忆无 | `loop.mjs:15,102`；`dailies.mjs:567,597`；Workflow 历史不是再规划记忆 | 需账号隔离、日界/过期/事实失效规则与可信次数来源；UNKNOWN不能自动遗忘/重试 |
| C605 | EXISTING_FUNCTION（有限顺序范围） | 有限 DAG 顺序执行，Session互斥，同账号一个写任务，不同账号可独立 | `workflow.mjs:110,131`、`operation-service.mjs:45,99`；`tests/workflow.test.mjs:29,36,58` | S3/S5/S6 统一轮询/日周定时/事件仍需扩展；有限DAG无循环是已批准边界 |
| C606 | PARTIAL（已有操作/Workflow历史Function存在，原要求全范围尚未闭合） | 操作持久History与Workflow状态/历史查询可用 | `operation-service.mjs:256`、`workflow.mjs:206,235`；`tests/workflow.test.mjs:39,42`；`tests/gameplay-execution.test.mjs:106` | 历史关系字段仍要统一，旧Loop/英雄等未全接；重启 RECOVERED_STOPPED/resumable=false，UNKNOWN操作持续阻锁 |
| C607 | PARTIAL | 静态注册目录和Function节点选择已存在 | `function-registry.mjs:9,10`、`server.mjs:132,133`、`workflow.mjs:25`；`tests/workflow.test.mjs:26,43` | 6 gameplay模块+stage，缺全平台覆盖；capabilities 默认[]/source默认null，原Master要求capabilityId、输入输出Schema、权限、预算、Scheduler、取消/验证元数据未完整提供 |

### B.2 非原始 Cxxx 的世界宝藏与阶段额外交付

- 世界宝藏须保留为独立产品子域（PRO-009/BIZ-R11），不得混入 C141-C144 Museum 探险。`treasure.mjs:20` survey/query，`:54` 规划，`:87` 精确 MyFleets.treasureLootUid 复读；`tests/treasure.test.mjs:26,37,46,47`；`tests/naval-protocol.test.mjs:9`。当前为 PARTIAL：读 Stats/List/Rank/Defence、无人防守且赛季/次数/油量/耐久满足的派舰；SUCCESS仅派舰确认，无争夺胜负/排名奖励闭环。
- Museum 展陈/关键词/展柜/展区升级、竣工、道具加速、收益/成就已实现；`museum.mjs:98,108,119,131,175,186`；`tests/museum.test.mjs:41-46,51,62`。这些扩展不能替代 C144 探险结算领奖。
- Alliance 取消本人未受助求助、领取互助、福利礼包已实现且独立校验：`alliance.mjs:115,117,132,154`；`tests/alliance.test.mjs:24,25,27,39`。联盟订单适配代码存在，但 production survey 固定 season:null，配额无法证明；Fort 仍独立阻塞。
- Fleet 只允许关闭已开启 autoFight，`fleet.mjs:91` isOn:false，不是持续委任执行；维修/移动/宝藏派舰都要求权威 autoFight.isOn===false。已有安全补丁仍在，不能按早期报告或旧测试名字认定fleet formation未实现（`tests/fleet.test.mjs:14` 的旧测试标题包含 formation blocked，但后续 `:34-39` 已新增完整适配测试）。

### B.3 API/UI 与统一保护的真实调用链

`GAMEPLAY_MODULES` → `server.mjs:133` createOperationService → `/api/gameplay/survey|config` → `/api/operations/plan|authorize|execute|stop|history` → `executeBusinessOperation` → 原 `GameClient.request/sendWatch` → adapter.survey/verify → ExecutionHistory。`server.mjs:647-690` 使用精确账号、同源Host/Origin、CSRF和参数白名单。`gameplay-page.mjs:1,2,5` 有六独立玩法页，阵容专用控件在 `:27,43,49`；其他业务主要为配置与业务参数JSON、权威详情、候选/成本/阻塞原因，不等于原全部 Pxxx 专业表格/图表/开关交互已经完成。工作流字段/边编辑+SVG预览在 `:56,62`，无任意JS，也无真正自由拖拽画布实现。

共享执行器 `business-functions.mjs:12`：执行前原 adapter 复读/重算，绑定 target/costs/identity/action/beforeState/expectedState/costSource，D6、validateResources、未决请求/迟到响应检查；发出后typed响应或watch只是中间事实，必须再次Survey+Verify。已发请求取消/超时/验证不明成为 UNKNOWN，markUnverifiedWrite 指纹/预算保留；停止只阻止后续动作。`tests/gameplay-execution.test.mjs:80,86,92,97,102,106,114,119,123`覆盖；代次/锁回收竞态有 `tests/gameplay-locks.test.mjs:29,48,68`。API/UI安全和真实适配器集成有 `tests/gameplay-api.test.mjs:31-38,43,46,112`、`tests/gameplay-view.test.mjs:21-42,45,46,48,72,84`。

### B.4 可复用 Function 与必要扩展

| 现有Function | 直接复用位置 | 必要接口扩展 | 新业务调用者 | 对应验证 |
|---|---|---|---|---|
| survey/view/plan/verify 的静态module契约 | 六玩法；原Service与Workflow | 让orders/city/production/hero/dailies/trade复用现有业务Function进入同一目录；保留各自语义 | 全产品Workflow与统一Scheduler | 原业务断言+跨模块计划/授权/History集成 |
| executeBusinessOperation | 全新受控业务；不独立登录/传输 | 业务事实 provenance、costSource、verify结果统一；不接浏览器request/body | 科技、Museum结算、道具加速、活动、贸易 | 假Client+真实本地codec；成本未知/状态变化/UNKNOWN |
| planFormation/catalogFrom/parseFormation | 主线阵容与舰队阵容已复用 | 复制站位输入模型、推荐选择规则；非零舰队pet需独立证据 | C209/C215/C402补充 | 解锁/归属/重复站位/其他舰队占用/宠物精度 |
| ResourceLedger + validateResources | 每个Operation批次规划/执行 | Workflow或Scheduler的run级累计预算父上下文（只有有跨节点总额约束时）；每日用量和安全库存读取 | 联盟日预算/多节点养成/贸易循环 | 累计不得因下一ACTION新建plan而补充；奖励不自动充值 |
| OperationService.acquire/claimWorkflow/current | 账号互斥与代次保护 | 统一旧Loop/长任务入口与Scheduler任务owner；不要增加第二套写队列 | C404/S3/S5/S6 | 同账号互斥、不同账号并行、停止/迟到释放 |
| createStageFunction + 原 StageRunner | 有限主线ACTION，最大200次/墙钟截止 | 建议→新保存计划→复读→有限续跑；保持主线LEFT范围 | C209 与Workflow | 同tick取消不多发、代次变化、未决响应、战败不是成功 |
| ExecutionHistory + createWorkflowStore | 操作/图/历史原子文件 | 父子workflowId/capabilityId/runId关系、可信日用量聚合、只读UNKNOWN复核流程 | 全平台历史/日预算/故障恢复 | 重启未知状态仍阻断；损坏证据保留；不自动续跑 |
| readNavalFact/stockFacts/fleetFacts | Fleet/Treasure/Naval已经复用 | freshness/source/scope及可信时钟口径；地图全局ID需证据 | 连续观察、跟随、动态决策 | 当前响应范围/缺字段/身份精度/冷却/取消 |
| allianceHelpRules/evaluateNavalRules/evaluateWorkflowCondition | 已有专用规则各自保留 | 共享事实与三值结果元数据；不要把业务规则强行合为通用脚本 | 未来规则节点 | UNKNOWN不入PASS分支/不派发 |

### B.5 真实架构缺口与重复实现分析

1. 已有正确复用：各 adapter 不持有独立Session、GameClient、登录器或transport executor；Formation算法在Fleet复用；Fleet/Treasure/Naval共享事实校验；Workflow复用原OperationService，Stage节点复用原Runner。不要为追求抽象重写这些。
2. 旧/新路径尚未统一：`OperationService.plan:106` 对 gameplay adapter、orders/city/combined 两类分支；`server.mjs:133` 的 modules 只有六玩法+stage。`workflow.mjs:25` 强制模块注册，`gameplay-page.mjs:56` 同样硬编码七模块，因此城市/订单/生产目前不能作为Workflow节点。必须适配已有Function，不能据“支持Function注册”推断全平台工作流已完成。
3. 预算的范围必须写清：OperationService 每次 plan 在 `:121` 新建Ledger，execute在`:194` 新建保守运行Ledger；Workflow每ACTION重新调用plan，不持有跨ACTION总Ledger。现有实现保证单批预算，不能声称已提供整张Workflow的累计资源封顶。日限需从可信history和游戏counter组成，不能接受参数伪造。
4. 联盟生产事实未接通：`alliance.mjs:96` 的 helpAllowance/helpUsage/season固定null。这是确切接口缺口；不能用注入这些字段的合成测试认定线上可执行。ask在`:120`始终阻塞；Fort独立阻塞。
5. UNKNOWN持久保护目前保守，但缺“确认后解除”的产品路径：`execution-history.mjs:28-34` 重启未完成动作恢复UNKNOWN，`:64` unresolved阻锁。该文件只暴露list/put/unresolved，未提供权威复读解决不确定性的专项Function/API/UI。未来需保存复核证据与判定，禁止直接清锁/改写成SUCCESS。Workflow重启活动历史`:235`仅RECOVERED_STOPPED，resumable=false；这是明确保护，不能视为故障自动恢复已实现。
6. 读事实存在可控重复：alliance/museum各自get helper与stock校验；Fleet/Treasure/Naval已有readNavalFact/stockFacts。不同权威响应结构的解析应保留领域边界，优先共享 freshness/来源/取消契约，而非一次性改所有parser。静态stable序列化也重复，先按新增使用量收敛，不能以此发起大重构。
7. 可信时钟不一致：alliance/museum以serverClockOffsetMs可用为前提，否则now=null；Fleet/Treasure/Naval使用本地Date.now。赛季/日限/目标freshness依赖时钟时需共享可信时钟来源和误差门槛，不能以本地时间代替未知权威时刻。
8. UI产品差距有源码依据：六玩法当前大多JSON参数/原始详情；Workflow为字段编辑和SVG，不是原P7-1拖拽画布。应按原Pxxx逐控件补齐，业务决策继续放Function，不移到页面。



## 附录C — 历史文档静态校验与保护复核（原规划批次）

校验对象为本报告及原始规划文本，不是运行功能测试。以脚本实际读取表格进行复算：

| 校验项 | 实际结果 |
|---|---|
| 原始Cxxx | 95行、95唯一ID；原编号顺序与原能力名一致；每行有工作包映射 |
| Function分类 | 48 EXISTING_FUNCTION / 29 PARTIAL / 16 PROTOCOL_ONLY / 2 NOT_IMPLEMENTED，合计95 |
| Cxxx外证必要闭环 | 14个BLOCKED_EVIDENCE；完整ID集合见5.1，与Function分类交叉 |
| 原Inventory | 原文与附录A均273行，唯一ID及顺序完全一致；旧状态后缀剥离后业务名保留 |
| Inventory细粒度Function | 203 EXISTING_FUNCTION / 36 PARTIAL / 26 PROTOCOL_ONLY / 8 NOT_IMPLEMENTED，合计273；含只读/工具/参考子项及重复映射，绝不作为95需求完成数 |
| 原P页面 | 42项，编号及顺序与原三维表一致 |
| 原S调度 | S1–S8逐项保留并映射扩展；D1–D9继承 |
| 工程工作包 | W01–W22唯一；各有要求的全部15字段 |
| 依赖 | 内嵌JSON22节点引用有效、DAG无环；W18仅交adapter供W20集成，W22仅交离线验收准备供R7，DoD无反向依赖 |
| 最终真实验收 | E01–E24唯一；各有完整前态/请求/Response/效果/资源/权威复读/停止/清理字段；组内子分支另按原ID逐项，当前未执行 |
| Markdown/编码 | 围栏成对、表格列数一致、无编码替代字符 |
| Git/文件保护 | 结束HEAD仍a50501910e8308771d3b6899cd4d48992e8c4012，分支不变；tracked/staged diff均空；只新增本报告，原五份未跟踪文件仍在；main...HEAD仍0/18，PHASE3仍14提交 |
| 原输入保护 | 第2节5个输入SHA256结束复核全部相同；原验收/增量及E2E证据无写操作 |

本报告共95项原需求账本、273条原能力附录、42页面、22工作包、8阶段、24最终真实验收组，编号可反查源码/测试/外证与DoD。完成文档交付后停止，等待Owner审阅，不开始PHASE4或其他开发，不提交Git。
## 附录D — 持续执行历史登记（D.1–D.28，各节为提交时快照）

### D.1 授权、实际基线与保护

本报告前文与附录C的 Planning Only、a505019、停止等待审阅等叙述是原审计交付时的历史事实。Owner 后续明确下达 **COMPLETE_CRAZYWATER_PLATFORM_R1_R8 / EXECUTION DIRECTIVE**，授权按本报告连续实施、修复、离线测试、阶段提交和交接；该后续指令现优先适用。持久 Goal 保持 ACTIVE，不因单个工作包、对话结束或压缩重置。R8 仍须单独批准，真实登录、Token读取、MITM/CA、真实游戏写和自动push/merge均未获授权。

恢复核对：最初 cwd 是另一个未建历史的 `aibot-crazywaterword`，实际工程在 `\\zhangnas\app\crazywaterword`；当前分支 `codex/phase-4-alliance-integration`、起点 HEAD `7aef482eda751bb3d9e9ae88b3b5bf282dfec4ec`，main `61ce3c0`，main...HEAD 为 0/22。a505019 仍为祖先，PHASE3 14提交保留；其后 97c619c/6d86188/21da53d/7aef482 分别交路线图核对、固定执行阶段、联盟科技及交付资料。原tracked/staged为空；原六份未跟踪资料保留。本报告现按唯一规划基线纳入版本，其他原输入不自动暂存。未发现适用 AGENTS.md 或 TREE.md。未reset/rebase/clean/切换main/推送。

前文95C、273 Inventory、42P、8S、W01–W22、R1–R8、E01–E24、X01–X18完整保留。前文48/29/16/2及14外证计数只对应a505019历史，不冒充当前整产品交付计数。PHASE4已实现单级联盟科技升级和专用UI，应复用而非重做；其余缺口按本节和后续工作包增量登记。全部新增写仍REAL_UNVERIFIED；PHASE2真实升级首次Pong超时且0业务派发的证据及E03待验项不变。

### D.2 R1 当前交付与边界

| 工作包 | 当前状态 | 实际源码/调用闭环 | 明确保留事项 |
|---|---|---|---|
| W01 | OFFLINE_VERIFIED（已实施的公共安全/恢复合同） | writer-ownership→Console listen/派发/持久写/关闭结算；独立CLI非dry写在读凭证前拒绝；writer inspect/recover显式同机双DEAD证明；Stage共用精确账号/Origin/CSRF；History追加reconciliation→Service预览/二次复读/确认→专用API→历史UI | APPLIED仅完整原凭据+同connectionId/代次/角色/世界+零成本Formation权威复读；NOT_APPLIED仅版本化未派发屏障；其余/旧记录/重连/重启仍STILL_UNKNOWN，不清指纹、不重发、不改原结果或预算。后续领域按证据扩，不伪造通用恢复 |
| W03 | 公共事实/时钟/目录 OFFLINE_VERIFIED；资产可移植恢复 BLOCKED_EVIDENCE | state-facts→Client匹配Ping/Pong/terminal reset→五领域survey最早/最晚时间；48基础collector追加精度/来源/范围；Explorer保留provenance；28业务只读目录（16复用基础+12附加）仅元数据；账号默认配置复用ModuleSettings账户隔离；有界20项首Pong/事件循环诊断与页面可靠性；asset-readiness→固定清单→显式assets CLI | map1缺失；原协议包/CDN版本和可移植恢复archive尚无可靠证据。清单与本地文件匹配≠可从干净clone完整恢复。账号安全导入/新区进入继续按独立权限和证据评审，不启捕获路由。诊断不改原1000ms心跳 |
| W02 | OFFLINE_VERIFIED（公共合同与原核心Adapter范围，见D.6） | 父run/子batch统一物资、配额、typed UID声明；10项静态合同；原City/Orders/Production包装及Workflow配置/候选/执行 | 不等于所有领域工作包已完成；W03地图/来源恢复仍局部BLOCKED，不冒称R1完整DoD关闭 |

W01 的恢复证据存于原ExecutionHistory v1的动作reconciliations数组，原finalStatus/requestStatus/result/resourceReservation保持。未完成run读取仍保守投影UNKNOWN；损坏历史拒写，已有复核事件不能被put覆盖。预览有效期60秒，确认复读后再次检查到期、历史digest及上下文。发送前持久DISPATCH_INTENT；崩溃窗口视为MAY_HAVE_DISPATCHED。成功原Formation验证后仅保存脱敏最小凭据，验证凭据持久失败仍UNKNOWN。只读复核不创建假业务写历史，不预留/返还资源。

Console正常关闭先取消账号、停transport，再等Operation/Stage/Workflow/HTTP/trace结算后释放owner。运行期HTTP error仅取消并保留owner，绝不提前释放。Login在构造socket前和事件回调后的最终发送前复核owner；延后connect微任务也复核。NAS I/O或未知主机/PID/坏锁fail closed；显式残留owner恢复只恢复进程互斥，不解除游戏UNKNOWN。

### D.3 资产清单与离线恢复

唯一新增持久资产清单为 `docs/RUNTIME_ASSETS.json`；无新目录。显式命令 `node src/app.mjs assets` 只读该清单列出的3个协议/config/map路径，输出hash、格式、缺失原因与恢复步骤，不读账号、不扫描微信缓存、不联网、不执行bundle。当前：

| 固定资产 | 观测SHA256 | 结论 |
|---|---|---|
| work/extracted/_src_chunks_/src/chunks/game.js | ef6137ef923f0b8b44b10379effe0ac2b3555ffab18b278e03e97b19bf4a4dcc | 1,621,701 bytes，本地清单匹配；原包版本未记录 |
| work/cdn/config_cn_pack.json | 0809253d78b00a81ebb78ab9fc8b94668372f6b8a08430144710325a165da762 | 11,317,227 bytes，表结构/本地清单匹配；CDN版本未记录 |
| work/cdn/world_map.world_map1.json | null | ASSET_MISSING，来源和预期hash未证，保持BLOCKED |

恢复必须从保留原来源/副本放回精确相对路径，再校验清单hash与格式；不能重写清单迎合任意下载资产，不能扫描账号/Token缓存或自动下载。Owner最终需明确保留原包/配置/地图来源与离线副本；当前不以清单自证来源。此局部阻塞不扩大为整个Goal停止。

### D.4 实际离线验证及失败保留

本节测试对应以7aef482为父的R1公共基础提交及其暂存源码；引入本节的Git提交可精确追溯测试对象。不是R7全平台回归，未执行真实游戏。夹具用TEMP、合成账号/响应、FakeSocket；涉及协议roundtrip使用现有本地codec，不打开真实连接。

统一定向命令：

```powershell
node --test tests/writer-ownership.test.mjs tests/cli-safety.test.mjs tests/actions-safety.test.mjs tests/execution-history.test.mjs tests/operation-recovery.test.mjs tests/operation-recovery-service.test.mjs tests/operation-recovery-api.test.mjs tests/client-clock-facts.test.mjs tests/client-lifecycle.test.mjs tests/client-unverified-write.test.mjs tests/server-runtime.test.mjs tests/stages-api.test.mjs tests/stages-view.test.mjs tests/gameplay-execution.test.mjs tests/gameplay-locks.test.mjs tests/gameplay-api.test.mjs tests/operations-api.test.mjs tests/operations-view.test.mjs tests/operation-service.test.mjs tests/operation-adapters-integration.test.mjs tests/state-facts.test.mjs tests/asset-readiness.test.mjs tests/alliance.test.mjs tests/alliance-tech.test.mjs tests/museum.test.mjs tests/fleet.test.mjs tests/treasure.test.mjs tests/naval-rules.test.mjs tests/naval-protocol.test.mjs tests/data-catalog.test.mjs tests/explorer-view.test.mjs tests/gameplay-settings.test.mjs
```

实际结果 **516 tests / 516 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**，8.26秒。另 `node src/app.mjs assets` 实际整体BLOCKED（map缺失），未当测试PASS。未重跑历史selftest，也未把PHASE4历史887+29结果贴到新提交上。

| 发现/失败证据 | 修复与回归 |
|---|---|
| 新Client默认创建trustedGameClock但原合成/只读Client无account，gameplay-execution 12项TypeError | 无上下文Client维持UNKNOWN时钟并兼容只读；31/31定向通过，统一516包含 |
| confirm入口未过期但第二读后越过60秒，service25项曾24PASS/1FAIL | append前再次检到期，失败用例完整保留；服务+历史+API45/45 |
| 同源CSRF加强后旧Stage两条race fixture提前403；未知side伪造字段改400 | fixture先真实GET取token，原await竞态/409/0派发断言保留；专门CSRF缺失/跨源0Runtime/0派发测试保留 |
| watch响应UNKNOWN但最终result SUCCESS且权威CONFIRMED被新history helper误阻塞，combined集成失败 | 仅已权威CONFIRMED的SUCCESS免该响应中间态，unresolvedWrite/真正UNKNOWN继续阻塞；combined/history/stage38/38及统一516 |
| 局部编辑脚本tick模式未匹配、测试导入未导出的responseNameOf | 已核对实际写入范围修正，不改生产导出凑测试；脚本后检查native exit，Client接线用例7/7 |
| 审查发现启动error listener遗留和Login frame回调失锁窗口 | 启动成功移除startup listener，运行期保留owner；Login最终发送前复核；新增真实控制路径回归，Client/server24/24 |

### D.5 可恢复交接与下一个可执行工作

继续使用现有分支/目录，不建新worktree。先查Git状态、附录D最新增量和所有未提交diff；不要重复创建Goal或重做W01/PHASE4。W02按父预算→Service/Workflow接入、静态合同→Registry/实际模块validator、Core Adapter→旧API兼容/Workflow目录接线串行集成；公共文件由root统一修改，独立Ledger/Core Adapter/Contract文件由各子任务负责。相关定向测试通过后完成R1独立阶段提交；随后才开放R2及可提前的W19。

未覆盖/待后续：旧UNKNOWN缺原凭据/跨重连无法自动解除；原CLI写已封禁需使用服务具体业务API；全量账号默认专业设置在W21产品整合继续；原工具在线诊断治理仍属W22、未调用；W02跨node父预算尚未宣称完成。所有R2–R8、W04–W22原DoD及24最终真实场景均保持，R8授权清单在R7完成后具体生成。局部外证、NOT_EXERCISED/REAL_UNVERIFIED不改PASS。

### D.6 W02 公共合同集成增量（2026-11-11，取代D.5待实施项）

公共安全基础已提交为26ed68d8fd09996418bd23946e2a3a21a4042949；W02测试对象以该提交为父，本节随W02提交保存，Git可准确定位源码。目录/分支不变，原五份未跟踪输入不暂存。未真实连接、未读真实凭证、未push/merge。

实施链：function-contracts → registerBusinessFunction → 9个静态域及server注册Stage（共10） → OperationService → 原业务executor或唯一generic executor → 原GameClient → 权威verify → 原ExecutionHistory。元数据含capabilityId、C/P/S、输入/输出结构、权限、预算、取消、验证、调度支持及证据限制；元数据不授予缺证子能力权限。已注册域暴露原validateParameters；未知字段、transport、脚本、凭证、原型、访问器注入在读状态前拒绝。

Orders/City/Production包装原survey/planner/executor，保留规则、Manual/Hybrid/Automatic、生产策略、完整状态和资源复读，不新建发送器。无parameters旧orders/city计划兼容；Workflow或有parameters的新节点走同Service受控Adapter，默认关闭。Workflow现有区可读取/保存三模块账号开关，变更清旧候选/计划，迟到响应按账号及编辑代次丢弃。

createRunBudgetContext冻结account/run/generation/connectionId与有限上限；child精确绑定batchId。operationBudgetClaims要求resources等于costs；quota/typed UID是可信planner声明，不代替业务资格。每action及合并batch声明进入planHash，同批重复UID拒绝；fresh replan比较声明。没有可靠配额来源的原业务继续阻塞，不编造quota事实。三类声明原子检查后才扣减；库存/收益/新batch不补父预算，无refund/reset/restore。旧图无budget时冻结首计划可靠库存，后续加额须新run明确预算。摘要resumable=false，重启不重建活父预算。

Service在transport前同步保存父累计扣减；Stage零材料也走同preflight。UNKNOWN/取消子链关闭父预算并保留扣减。Workflow结束先close父，再等Operation结算、保存CLOSED最终快照、释放匹配owner；结算期间不准新start，旧run不读取新run预算。最终history失败保持UNKNOWN并close父；standalone成功只有最终落盘成功才真正close SUCCESS。

依赖失效使用可信adapter.dependencyVersions：相关配置变化作废，无关订单/生产规则不影响Formation等域；旧端点保留原保护。Fleet读取实际scenario地图成本相关投影，缺地图保持null并阻塞对应业务，不把固定空metadata当版本。计划另绑定精确player/world/generation/connection，变化在授权/执行前STALE_PLAN，不制造虚假写历史。

D.4原32个测试文件，加tests/gameplay-view.test.mjs、run-budget.test.mjs、run-budget-service.test.mjs、run-budget-safety.test.mjs、core-operation-adapters.test.mjs、function-contracts.test.mjs、function-registry.test.mjs、workflow.test.mjs、resource-budget.test.mjs、stage-function.test.mjs组成42文件统一定向命令（均位于tests/）。实际758 tests / 758 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo，18.06秒。之后只增加standalone最终持久失败场景，run-budget-safety单文件14/14 PASS，0 skip；两套有重叠，不相加。不是R7，也不是真实E2E。

合成真实Function链：同汽油订单/生产/修船各40，父100只允许前两次，父120允许三次，派发前持久usage依次40/80/120；fresh1000不补额。真实双ACTION Workflow父60挡第二笔40，父80两次独立授权且CONFIRMED完成。零材料quota/UID、跨账号/代次/连接、STOP/UNKNOWN、fresh声明变化、persist失败0派发、重启拒复用均有用例。quota/UID合成声明只验证共享机制，不声称具体资格已获服务端证据。

| 失败证据 | 修复及保留断言 |
|---|---|
| 新预算快照改变put次数，旧fault注入第三次不再对应写后 | 按action SUCCESS语义注入，原1次派发/阻塞断言保留 |
| STOP夹具初始60先花40，后续40无法规划 | 仅该场景初始及父限改80，停止后0派发/不退款断言保留 |
| CLOSED父摘要先前被删除 | 保留匹配run CLOSED审计；旧release不清新owner |
| 原目录断言仅6域 | 扩到9静态域，原全部默认关闭/账号隔离检查保留 |
| 世界变化更早拒绝，旧API测试取不存在history导致TypeError | 明确断言409/STALE_PLAN、0游戏派发、0虚假history |
| 写后最终history失败父仍ACTIVE | 故障测试先复现12PASS/1FAIL；finally close UNKNOWN不退quota/材料；workflow与standalone各有用例 |
| 编辑脚本引号/路径转义解析失败 | 均在写文件前失败，改String.raw和显式Set-Location检查；无源码部分覆盖 |

R1公共合同足够供不依赖地图的后续域使用；W03资产可移植恢复仍BLOCKED，R1整体不标完整交付。下一集合W04/W05/W06/W08及可提前W19；root统一改Service/Registry/Contracts/API/UI共享区，独立领域与测试可并行。后续按原DoD逐项实施，缺证只冻结子分支。W02不使C602/C603/C607全产品范围自动完整；95/273/42/8、W01–W22、E01–E24及所有REAL_UNVERIFIED保留。

### D.7 R2 首批领域闭环与 W04 规划增量（2026-11-11）

本节源码/测试以 `fe80056499b1fe2fad8c9ff583ff969354907d07` 为父提交，随本节所在提交定位。恢复时实际分支仍为 `codex/phase-4-alliance-integration`；原入口 `aibot-crazywaterword` 仍是无 HEAD 的独立空仓库。已核对 staged 为空、已有未提交成果属于本持续施工并由各子任务冻结交还；原五份未跟踪资料完整保留且不暂存。未重新创建 Goal，持久目标 ACTIVE。NAS 普通沙箱访问被拒后使用获准的明确 UNC 命令；PowerShell 必须先 Set-Location -ErrorAction Stop，不能依赖 workdir。

| 工作包/要求 | 当前源码与调用闭环 | 状态与明确边界 |
|---|---|---|
| W05 / C131–134 | `fleet.mjs#cargoShortageView/fleetView/planFleet/verifyFleet` → 既有 Fleet Adapter → OperationService → ResourceLedger/History → 原 Gameplay API 与专业港口表 → Workflow Fleet ACTION | 允许的装货/到港领奖及缺货视图 OFFLINE_VERIFIED；E07/E20/E21 REAL_UNVERIFIED。货船加速仍由 D6/独立证据闸门限制，不能把这一禁止路径写成已交付可执行能力 |
| W06 / C221–224 | `heroes.mjs#planHeroes/buildHeroBody/buildHeroAction` + `hero-operations.mjs#heroModule` → 静态 registry/contract → 原 generic executor/Service/History/API → 原英雄页单项选择 → Workflow ACTION | LEVEL/STAR/SKILL 的自有材料原子路径 OFFLINE_VERIFIED；通用碎片兑换和消费语义仍 BLOCKED_EVIDENCE，不以本分支通过宣告 W06 原 DoD 全部完成；E08/E20/E21 REAL_UNVERIFIED |
| W04 / BIZ-R16d–g 计算增量 | `production-planning.mjs#appointEffectValue/appointProduceReduce/produceFinalTime/packCoverPlan/cropSupplyPlan` → production Adapter survey/view → 原生产页专业规划区 | 委任减时、持有包覆盖、作物水位/种子/余料纯投影 OFFLINE_VERIFIED；不自动开包/排产/购买，projectedGain 不进入库存。W04 整体 PARTIAL |
| W08 / FRM-007 本地子域 | 已另行完成 named-formations Store 及专项测试，暂未纳本 R2 首批提交 | Store 独立离线验证不等于专业 API/UI 和应用执行闭环；后续交接继续施工 |
| W19 | execution-memory Store 及测试已冻结，后续独立接线 | 尚未进入本 R2 首批提交；不能声称全入口拒绝记忆/历史关联已完成 |

港口成本固定来自原 `CargoShipsResponse.ship[].orderItem[].asset`，装货预期奖励取对应原货格 `reward.asset`，到港预期奖励取原船 `reward`；响应不能自定义预期。每艘货船每批至多一个动作，跨船共享 Ledger。验证绑定整航次、货格、typed 奖励与完整库存净变化，EXP 跨级语义不能精确证明时保持 UNKNOWN。重复物资先合并需求再扣一次库存，未知/溢出/继承默认值不会变零。专业按钮仅选择同一个服务端 actionId，不另建 cargo 发送器。

英雄复用原 planner，新增兼容默认值的 kinds/slots/atomic 只缩小候选范围。业务每次单英雄/单级/单技能槽，STAR 明确 universal=false；允许用户传 true 也 BLOCKED_EVIDENCE。AllHero 必须有明确自有标量、唯一身份及实际技能槽，Long 保真并保留合法 double 属性。验证目标精确增量、其他维度/英雄不变及完整材料净扣除，STAR 还核对 nextStar；无 typed 的 LEVEL/SKILL 不发明 Response。静默或 typed ACK 独立均不能变成功。稳定 actionId 只作 Workflow 语义选择器；identity/before/expected/costs/dependencies 仍逐批进 planHash，旧预览/permit 在等级变化后失效。

原 `/api/heroes/run` 仍 403，CLI `heroes` 在 loadCredentials 前由 rejectStandaloneGameWrite 拒绝真实写；旧 runHeroPlan 仅保留兼容实现，不是新产品执行入口。真实写统一走现有受控 API，同源 CSRF、账号/代次/连接、模块默认关闭、精确批次预算、UNKNOWN/取消/迟到、持久执行历史保护均未放宽。没有扩大任意 Web 写白名单或协议表。

生产附加采集复用原 core survey，只增已登记的 AppointInfo/AllHero 只读查询，不重建 Snapshot。时间范围明确为 APPOINTMENT_ONLY_SPEED_BONUS_NOT_ESTABLISHED。新增实际配置依赖 AppointEffectCfg/AppointPosCfg/HeroCfg/FarmlandPlantCfg/SelectPackLibCfg 纳入 production 版本钩子；其他业务不被这些表无关变化作废。物资包永远 executable=false，仅原料自选包/工事材料自选包可投影，需求共享包数量累计，RUBY/钻石/4 均拒绝；预计产量或合计包数溢出则 unreliable/ok=false。种子和余料建议排除含 D6 成本配方。

离线统一命令：`node --test tests/production-planning.test.mjs tests/core-operation-adapters.test.mjs tests/fleet.test.mjs tests/cargo-operations.test.mjs tests/cargo-service.test.mjs tests/hero-operations.test.mjs tests/hero-service.test.mjs tests/function-contracts.test.mjs tests/function-registry.test.mjs tests/gameplay-settings.test.mjs tests/gameplay-view.test.mjs tests/gameplay-api.test.mjs tests/gameplay-execution.test.mjs tests/run-budget.test.mjs tests/run-budget-service.test.mjs tests/run-budget-safety.test.mjs tests/resource-budget.test.mjs tests/actions-safety.test.mjs tests/cli-safety.test.mjs tests/execution-lifecycle.test.mjs tests/order-execution.test.mjs tests/city-operations.test.mjs tests/workflow.test.mjs`。

实际结果 **534 tests / 534 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo，15.71秒**。23文件集成定向回归；不是 R7 全量，也不是真实 E2E。Hero 领域使用真实本地 protobuf Codec+合成状态；Cargo Service 使用真实 GameClient 本地 Codec/假 socket；HTTP 测试仅127.0.0.1临时 Console，clientFactory 禁真实 client、临时账号与临时 History。没有创建真实 Runtime、读取真实 Token、联网游戏、MITM/CA 或真实写请求。阶段前置安全/原订单/城市/Workflow/预算/CLI 断言保留。`git diff --check`通过。

| 本批失败证据 | 修复及保留断言 |
|---|---|
| 生产纯算法首次21项18PASS/3FAIL | 补 D6 的4别名；pack乘积溢出不可 reliable/ok；排除付费余料/种子配方。原失败用例保留，另加 seed D6 回归 |
| 新Hero请求构造对未知kind改变旧NOT_EXECUTED为UNKNOWN | 构造器恢复明确 NOT_EXECUTED，原断言通过，未改旧测试制造PASS |
| Hero初版合法小数属性被拒、raw/parsed状态不一致 | 按实际协议 double 保真及完整原状态一致性修复，增加真实Codec用例 |
| 静态Workflow第二个Hero节点因第一个成长导致旧全局哈希actionId失效 | 稳定语义选择器+逐批完整事实绑定；旧permit0派发、下一等级新成本/planHash专项保留 |
| 新增Hero后3个注册计数断言仍写10 | 扩到11个真实Function，并对新增域运行原注入拒绝/依赖失效/账号隔离断言；没有删除原域 |
| Cargo UI测试最初访问私有gpControls | 测试改走公开刷新；pending detached按钮/账号迟到保护原断言保留 |
| 两次UI编辑脚本解析/匹配失败 | 均未写对应UI文件；采用完整匹配后原子写单文件，再语法/VM/DOM测试 |

### D.8 当前恢复位置、依赖与下一步（本批提交时）

R1 W01/W02 公共合同已提交，W03资产恢复局部BLOCKED仍保留；R1/R2整阶段均未虚报完成。W05允许分支已离线交付；W06通用碎片、W04完整日报X01/金币X02/免费刷新X03、农田状态与种植/成熟收取、物资包实际兑换/权威入库、队列leadSec等待窗口及自动需求接线均尚未闭合。W07/W08其余高级成长/复制/其他模式/图纸解锁仍按原DoD连续补齐，不把纯投影当写功能。原95C/273Inventory/42P/8S以及W01–W22、R1–R8、E01–E24保持原编号与全部范围。

后续文件所有权：root串行集成 registry/contracts/gameplay-page/page/文档；W19子任务独占 OperationService/Workflow/ExecutionHistory/Server 及专用测试，R2本批提交后才写这些共享文件；具名阵容Store已冻结，可交root接线；高级成长先静态还原客户端成本/实例/槽位，不复用reference独立执行器。所有并行成果冻结后统一检查/提交，不自动push/merge/reset。R8仍待R7后具体账号/请求/次数/预算/风险/清理授权，不以本Goal推导真实操作许可。


### D.9 History 存在锚与确认后停止恢复（2026-11-11）

本安全增量以 528dc6e9d8445877490fb1014dd305604fef4238 为父，随本节所在提交保存。当前未提交的 Farm/Forge/Named/Memory 协作成果另行整合，不因此宣称所属工作包完整完成。持久 Goal ACTIVE，分支、目录、原输入及真实操作边界保持 D.1/D.7。

两个已复现的崩溃窗口：其一，History 记录 DISPATCHING 后文件消失，ENOENT 被误认作全新安装，且补充 Memory 尚可能没有事件；其二，动作已全部 SUCCESS+CONFIRMED、批次最终写中断，旧恢复把批次改 UNKNOWN 却没有可复核的不确定动作，产生永久锁。

现有 createExecutionHistory 扩展同目录 file+'.anchor' 固定存在锚（version/kind/basename，无游戏状态）。首次写 History 前经过 writer fence，以 wx/write/fsync 保存；已读 History 或已见锚在同实例丢失均 fail closed，锚保留而 History 缺失跨重启同样拒绝。锚损坏或写/fsync失败不能生成/覆盖 History，原证据不变。旧版无锚 History 保持只读兼容，下次写迁移；GET 不创建锚。storagePath 只读导出，供同目录补充记忆依赖注入使用，不暴露写句柄。

若未完成批次的所有原动作已 SUCCESS+CONFIRMED 且没有不确定派发，只读恢复投影为 CANCELLED、recovered、resumable=false、RECOVERED_STOPPED_AFTER_CONFIRMED_ACTIONS，并保留 interruptedFinalStatus。不制造批次 SUCCESS，不修改原动作、预算或磁盘字节；原 UNKNOWN 绝不降级，不重建 permit 或父预算。此状态不等于失败重试许可。

兼容/外部故障边界：跨重启同时丢失整个 History+anchor 证据对，或旧版仅只读、尚未写入迁移锚的 History 丢失，单靠该目录无法区分全新安装；本修复不声称防止全部外部删除。已有 Memory 的 orphan UNKNOWN 继续保守阻塞。新增文件是原 History 同目录的伴随文件，无新增目录。

实际命令：node --test tests/execution-history.test.mjs tests/operation-recovery.test.mjs tests/operation-recovery-service.test.mjs tests/operation-recovery-api.test.mjs tests/run-budget-safety.test.mjs。结果 117 tests / 117 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo，2.98秒。对应本节提交的安全文件及父 528dc6e 上本次协作工作区，不是 R7 或真实 E2E。独立只读审查的107项与本次有重叠，不相加。原故障注入/账号隔离/追加复核/预算不退款断言保留；同目录精确文件断言增加 anchor，而非删除断言。git diff --check 通过。

下一步继续整合 W04 单田种植、W07 装备制造收取、W08 具名阵容与首败停止 UI、W19 补充记忆及只读展示。所有真实游戏场景仍 REAL_UNVERIFIED，W03 资产来源恢复及其余外证闸门不改。


### D.10 R2 领域扩展与提前 W19 集成（2026-11-11）

本增量以安全提交 2258e16c844e2aa5929c640e334917c8bd262dd1 为父；源代码及本节随所在提交共同定位。此前领域/服务专项测试在父 528dc6e 的协作工作区运行，不能冒称已在旧提交独立交付。全部共享 Service/Server/Registry/Contracts/Page 由 root 串行集成，各独立领域及测试冻结后合并到当前工作区。原五份未跟踪输入不自动暂存，无新目录/worktree；未 push/merge/reset/真实操作。原 95C/273Inventory/42P/8S、W01–W22、R1–R8、E01–E24 和 X01–X18 未缩减。

| 原工作包/要求 | Function、实际调用与离线交付 | 当前完整范围及保留边界 |
|---|---|---|
| W04 / BIZ-R16a–c | farm-operations#surveyFarmOperations/viewFarmOperations/planFarmOperations/verifyFarmOperation → farmModule → 静态 registry/contract → 原 generic executor/OperationService/Ledger/History/API/Workflow；原生产页内独立农田专业区 | 显式空田、autoFarming=false、精确持有种子的一田 PLANT OFFLINE_VERIFIED；HARVEST 的成熟时间单位及 CriticalAsset 暴击奖励缺证，始终没有action，成熟/收取仍 BLOCKED_EVIDENCE；不把 BIZ 农田误映射成 C111/C113 完成。W04 PARTIAL |
| W07 / BIZ-R07 | equipment-forge#surveyEquipmentForge/viewEquipmentForge/planEquipmentForge/verifyEquipmentForge → equipmentForgeModule → 同 registry/原 generic executor/Service/预算/History/API/Workflow；原英雄页内装备厂子区 | 自有精确配方材料 MAKE、到期单批次 PICK OFFLINE_VERIFIED；universal兑换/自动品质回退不开放；C225–230高级成长、Pet及BIZ-R08/R09剩余原分项未因此完成。W07 PARTIAL |
| W08 / FRM-007 | named-formations#createNamedFormationStore → Service 的同锁fresh Formation survey/可信 StateFact → 6个精确本地 API（1GET/5POST）→ 原阵容页存档区；应用只产原 planner 参数 | 本地命名、重命名、覆盖、删除、重启读及准备应用 OFFLINE_VERIFIED；保存完整 preset/英雄坐标/明确 petUid（含0），应用要求拥有/解锁/合法layout/当前pet匹配，再经原 survey→plan→单次授权→Save→verify，不恢复旧授权。其他模式、极限复制及图纸解锁尚未由本增量交付。W08 PARTIAL |
| W08 / C201/C204/C205 运行控件 | 原 StageRunner 的 stopOnDefeat 配置接现有 page/stageConfig/账号切换和轮询 | UI 可显式开关；首败停止和原重试策略均保留既有Runner，不新增执行器、不启动Runner。控件 OFFLINE_VERIFIED，真实10–11秒及战败分支 E11 仍 REAL_UNVERIFIED |
| W19 / C604/C606、S7/所有业务历史的受控Operation子集 | execution-memory#createExecutionMemory → 原History先落盘，再幂等补充投影；Service plan/fresh plan/pre-dispatch拒绝检查；workflow#bindWorkflowNode补definition/node关联；生产Console注入带secrets/writer的同目录store；原历史页只读审计 | 身份变化拒绝记忆、UNKNOWN原历史关联和只读重启查询 OFFLINE_VERIFIED；Store冷却/游戏日界有纯能力，但Service没有可信领域策略来源，policyCoverage.cooldown/gameDay明确false。Standalone Stage逐场、Loop/Tasks/Dailies所有入口尚未全接，W19 PARTIAL，不能宣称全入口完成 |

原始 P 页面映射：Farm 沿用 P2-2，Forge 是 P3-6/P3-7 的现有页子域，没有原 P3-8；FRM-007沿用P3-5及原运行/历史页面。新增 Farm/Forge 的 requirementIds.C=[]，分别记录 inventoryRequirementIds，保留原业务分项。当前 12 个静态 Adapter + 1 个动态原 Stage Function 共 13 合同，不是新增13个产品模块或95C交付数。前文a505019历史分类计数不覆盖当前增量；此表作为原ID当前差异索引，禁止据测试数量推导完成需求数量。

农田/装备复用链：surveyCityOperations 同一轮采集保留 rawOnWater/rawAllItem/rawAllResource，raw字段完整性在展示默认值转换前验证，不重复拉全量Snapshot。Farm复用core survey；Forge附加原Equips/AllHero及现有hero parseOperationInventory；赛季最小提取alliance#seasonFromWorldId供两域复用，精确Long算法不变。两域没有自带execute，由原generic唯一派发器负责预算/授权/取消/迟到/UNKNOWN及History。默认enabled=false，新增账号配置由原ModuleSettings持久化，禁止前端提供transport/body/成本/证明。

Farm每田每批一个动作，多个田共用Ledger及父预算；收益不入预算。PLANT后权威完整crop、精确seed净扣、其余物资和地块不变才确认。缺farm绝不推断空田，autoFarming=true或缺完整字段均不派。D6只接精确单田body及单个正种子成本，Harvest不因同请求族定义而开放。

Forge MAKE绑定正int32 makeId及明确universal=false、BuildingEquipMakeCfg.costItem精确自有材料；只认own四零队列，不将省略队列当空闲；产物必须在EquipMakeLibCfg合法集合，不预言star或精确finishTime（委任影响）。PICK绑定原批次、可信game clock earliest已到期及typed PickMadeEquipResponse.equipId；后态必须显式四零IDLE、恰好一个新UID/equipId/star匹配，原bag/英雄装备归属/其他建筑/全部库存不变。typed ACK单独或默认化空队列均UNKNOWN。D6仅这两种严格body和成本分支，不允许premium/兑换/购买/分解。

具名队伍持久文件沿用原DATA_DIR/测试History同目录，原子fsync/rename、writer fence、账号/revision隔离；损坏fail closed。save/overwrite只接受进程内同锁fresh GetFormationResponse事实，30秒以实际响应完成时间计算，缓存读取不刷新时间。rename/delete本地可离线，GET不创建Session；save/overwrite/prepare须现有READY Session，并取消旧plan。所有POST同源JSON/CSRF/精确账号，不能HTTP注入阵容、proof或provenance。prepare等待期间立即废弃旧授权并锁相关计划，草稿编辑后丢弃迟到准备结果。完整PAGE实际调用器仅加入五条精确本地路径，原普通Web写白名单和任意请求保护不变。

记忆先持久History、再record；memory失败/损坏/pending/orphan UNKNOWN保守阻止后续派发。UNKNOWN必须精确原run/batch/action/module/type/目标hash/identity hash匹配，只有原History追加APPLIED/NOT_APPLIED解除补充锁；原结果与预算永不改写或退款。RATE_LIMITED未决结果保持原status，另有UNKNOWN补充审计，不把CONFIRMED成功伪造UNKNOWN。file History自动同目录依赖注入；custom非文件History保持兼容且coverage明确不可用。GET /api/operations/memory只读过滤，不补写；UI展示原UNKNOWN与historyOrigin当前复核分开、operation run/workflow run/definition/node/batch/action关联、pending投影和未覆盖策略，账号代次/新读/错误清旧显示，无清除/重试/授权入口。重启无自动执行、permit、父预算或虚假业务history。

#### D.10.1 实际离线验证

命令一（38文件，业务/服务/协议/预算/历史/安全）：

node --test tests/farm-operations.test.mjs tests/farm-service.test.mjs tests/equipment-forge.test.mjs tests/equipment-forge-service.test.mjs tests/farm-forge-api.test.mjs tests/named-formations.test.mjs tests/named-formations-service.test.mjs tests/execution-memory.test.mjs tests/execution-memory-service.test.mjs tests/execution-memory-api.test.mjs tests/execution-history.test.mjs tests/operation-service.test.mjs tests/operation-recovery.test.mjs tests/operation-recovery-service.test.mjs tests/operation-recovery-api.test.mjs tests/operation-adapters-integration.test.mjs tests/function-contracts.test.mjs tests/function-registry.test.mjs tests/gameplay-settings.test.mjs tests/gameplay-api.test.mjs tests/gameplay-execution.test.mjs tests/gameplay-locks.test.mjs tests/operations-api.test.mjs tests/actions-safety.test.mjs tests/cli-safety.test.mjs tests/core-operation-adapters.test.mjs tests/hero-operations.test.mjs tests/hero-service.test.mjs tests/formation.test.mjs tests/alliance-tech.test.mjs tests/run-budget.test.mjs tests/run-budget-service.test.mjs tests/run-budget-safety.test.mjs tests/resource-budget.test.mjs tests/workflow.test.mjs tests/stage-function.test.mjs tests/stages-formation.test.mjs tests/stages-stop-on-defeat.test.mjs

实际 736 tests / 736 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo，17.69秒。

命令二：node --test tests/operations-view.test.mjs tests/gameplay-view.test.mjs tests/stages-view.test.mjs tests/account-view.test.mjs。实际 144/144 PASS，0fail/cancelled/skipped/todo，0.39秒；包含完整PAGE Named五路径、10项Memory及fragment59项等既有保护。之后仅合同页面编号纠正，在 tests/function-contracts.test.mjs tests/function-registry.test.mjs 定向59/59 PASS；与命令一重叠，不相加。

命令三：node --test tests/farm-forge-full-page.test.mjs tests/server-runtime.test.mjs tests/writer-ownership.test.mjs tests/execution-stages.test.mjs。实际60/60 PASS，0fail/cancelled/skipped/todo，4.57秒；完整PAGE不替换call/operationMutation，Farm/Forge各自精确Manual→取消确认/批准→单次authorize/execute、账号迟到permit、编辑晚preview、错误计划/账号、默认禁用等12项。相邻Server测试使用合成Client/临时本地Console，所有权使用临时文件和本地进程；均无真实游戏网络/账号/凭证/Runtime。新Farm/Forge API15项实际createConsole in-process不listen，clientFactory/全量collect计数并抛错，断言0调用；专域服务使用真实GameClient本地Codec+假socket/TEMP，不能称真实E2E。不是R7全量回归，所有E03–E24真实分支状态不因此改变。

| 失败/审查证据 | 修复及保留回归 |
|---|---|
| Farm/Forge API初次10PASS/2FAIL：重复account被接受；跨账号permit误期望403 | 共享受控gate要求唯一account；第二项按原STALE_PLAN409合同纠正，仍要求0派发/账号隔离。专属15/15及相邻64/64通过 |
| 完整PAGE Named首次34PASS/1FAIL，保存按钮到不了fetch；fragment替身漏过入口 | 加五个精确本地path，不接任意prefix；完整生命周期/CSRF/account测试保留并通过 |
| Memory初版对live DISPATCHING误生成UNKNOWN导致相邻15FAIL；扩Workflow scope破坏旧接口74/75 | completed result才补投影，重启由原History保守恢复；保持旧父scope，新增可选bindWorkflowNode；原断言保留 |
| 完整PAGE新Farm/Forge测试初轮VM跨realm headers deepEqual假失败 | 仅比较plain归一化headers，不降低内容/账号/成本/0派发断言；12/12通过 |
| 静态合同误填不存在P3-8 | 改原P3-6/P3-7并补原BIZ/C空集断言，59/59通过；没有新建产品页编号 |
| root长UI编辑脚本在exec解析前SyntaxError | 未写文件，改独占双文件小范围接线；原成果保留，最终完整页面回归通过 |
| D.9首次提交前diff-check发现文档EOF多空行 | 仅修尾空白再提交，未绕过check或混入原输入 |

#### D.10.2 最新恢复位置及可执行后续

D.8待办按本节替代已交子分支：农田单田播种、装备厂自有材料制造/收取、具名队伍专业API/UI、首败停止控件、Operation/Workflow补充记忆和历史页审计已落地；不再重复开发。W04/W06/W07/W08/W19整体仍PARTIAL，R1 W03来源/地图资产恢复仍BLOCKED_EVIDENCE；W05允许装货领奖分支及前批Hero LEVEL/STAR/SKILL继续复用。全部本批写路径REAL_UNVERIFIED。

下一独立工作：W04订单奖励证据解析由独立order-rewards纯模块推进，root随后统一接原survey/executor/History/UI，不再创建订单执行器。X02本地WorkerOrderCfg129/129及WorkerSpecOrderCfg25/25都有EXP/GOLD，旧“没有任何金币来源”需细化为“配置基础GOLD存在，但最终预派发公式/加成链未证实”；FinishWorkerOrderResponse.reward可提供事后实际奖励，不能倒当MIN_GOLD事前事实。X01完整游戏全天产量及X03免费刷新provider仍缺证，不以工具日报/refreshTime/每日40订单上限替代。W08普通图纸解锁与极限复制继续静态核客户端分支/配置/模式，不擅自解除闸门。root独占共享文件，领域独占两文件，冻结后定向回归、记录并提交。R7后才生成R8具体授权清单；Goal保持ACTIVE。

Forge静态参考定位（不属于目标仓库源码）：C:/Users/zyk-o/Documents/crazywaterword/src/equip.mjs，SHA256 7592c2112579fad5097e71e503561574966f22616b45a2eeec19eecd793e26ff；describeRecipe:49、pickRecipe:82/83、surveyEquip:97/118、planEquip:199/223–225/246–248。参考155/164省略finishTime即成熟的推断未移植，目标要求显式完整队列和可信到期。引用不代表真实游戏证据。

### D.11 订单奖励证据、普通图纸解锁及装备全池修复（2026-11-11）

本批父提交6901b068bbd48046da39d61d56871832f031716c，代码/测试/本节随同一次本地提交定位。分支codex/phase-4-alliance-integration；提交前main...HEAD为0/27，a505019仍祖先。原五份输入不暂存。Goal ACTIVE；没有真实连接、账号操作、凭证读取、Runtime、Stage Runner、MITM/CA、push/merge/reset。本节为原历史账本的当前增量，不以测试数推导完成需求数。

| 原工作包/ID | 实际Function与调用链 | 当前边界 |
|---|---|---|
| W04 / C124、BIZ-W05、ORD-006 | order-rewards#configuredBaseOrderReward/parseReceivedOrderReward/orderRewardEvidenceScope/inspectOrderRewardEvidence → 原order-execution survey/plan/executor → OperationService/History → 原订单与历史页 | 配置来源及事后关联证据OFFLINE_VERIFIED；C124完整范围PARTIAL，最终事前GOLD/MIN_GOLD仍BLOCKED_EVIDENCE；X01全天产量、X03免费刷新未闭合 |
| W08 / FRM-005、P3-5 | formation-unlock#surveyFormationUnlock/viewFormationUnlock/planFormationUnlock/verifyFormationUnlock → registry/contract → 原generic executor/Service/Ledger/History/API/Workflow → 原阵容页子区 | Function EXISTING_FUNCTION、UI EXISTING_UI、Protocol STATIC_VERIFIED、OFFLINE_VERIFIED、REAL_UNVERIFIED；只用已持有普通图纸单目标2–24，不购买补图或自动应用；W08仍PARTIAL |
| W07 / BIZ-R07 | equipment-forge#parseEquipmentOwnership/verifyEquipmentForge修复，原Forge调用链复用 | Equips完整pool与英雄佩戴镜像一致；bag派生闲置实例；C225–230未因此完成，W07仍PARTIAL |

订单扩展不改原identity/actionId、规则、请求、成本、订单替换+orderNum递增确认或UNKNOWN。survey同轮观察AllResource及实际完成时间，不额外查询；解析确切FinishWorkerOrderResponse.reward.asset，区分ITEM GOLD和RESOURCE GOLD。诊断绑定Service拥有的account/player/world/generation/connection/run/batch/action/opaque identity/index、来源、scope、30秒时效及前余额≤响应≤后余额顺序。MATCHED只是奖励诊断，不把未变订单/UNKNOWN变SUCCESS，不释放预算或重试；收入不能补充父预算。页面仅展示证据。

普通图纸复用surveyFormation、parseOperationInventory及共享执行器，没有新executor或HTTP写入口。23实际模板均精确扣对应图纸1；UnlockFormationPresetRequest只有required int32 id，没有同名Response。quiet watch不能证明成功，必须完整ids仅新增目标、完整库存仅扣对应图纸1、原Formation/英雄坐标/pet不变。own字段、可信身份、原响应完成时间、30秒时效、完整相关table.revision均纳校验。合同C=[]、inventoryRequirementIds=[FRM-005]，不虚构C编号；13静态Adapter+原动态Stage共14合同。D6仅加严格{id2..24}+匹配图纸1分支，购买仍硬拒。

Forge修复依据原主客户端：pool UID唯一，每个AllHero佩戴镜像须在pool且完整逐字段相同，全英雄唯一主人；bag只过滤未佩戴。MAKE保全pool/英雄，PICK保全全部旧pool与归属，只增1匹配typed equipId/原批star的闲置UID。缺池/冲突/双主人/重复/投影篡改/写后额外变化仍阻断。parseEquipmentOwnership最小导出供后续成长复用，没有循环依赖或新目录。原错误互斥负例改为同UID内容冲突并保留重复/缺失保护，新增16项。

#### D.11.1 固定静态证据及未解除闸门

图纸证据沿用work/e2e/20261110-b4/formation-client-evidence/manifest.json（SHA256 40c0eff9a9e8863b9156014bb712ceb614449be55398b29240dd786364d9953d），FormationTypePanel._refreshCurFormationInfo/_onBtnOK、FormationModel/FormationUtil。v76包SHA256 4fd1f03034b78b0ea0d80590ce1082aa805529b91b2ef99ced9ca2d9f00c2444；包内/subpackages/main/game.js SHA256 a6046fcc2ad7a3424282e9f8b51073656f5ae8d48742129743560bf958266c54。固定协议ef6137ef923f0b8b44b10379effe0ac2b3555ffab18b278e03e97b19bf4a4dcc、配置0809253d78b00a81ebb78ab9fc8b94668372f6b8a08430144710325a165da762重新核验。仅内存读取现存包，不运行客户端。

EquipModel.ts:1077 setData/fixupEquip/allIdleEquip证明全池与佩戴镜像；模块SHA256 b11a06b0209cf966d0c6634d3a74608971b0d574d035b36c8dd496aa8489c27b（切分含末尾双换行）。C229下一单次成长已有EquipDetailPop.ts:1057、EquipLevelBtn.ts:1065、EquipUtil.ts:1087成本/上限证据；AllHeroesModel.ts:93完整DisplayHero替换，HeroDetail.ts:1569展示新power、HeroUtil.ts:1673读attributes。未来只允许目标hero明确power/attributes按结构变化、其余字段一致，不预测数值；当前不计交付。

X02更精确边界：129/129普通及25/25特殊配置存在EXP/GOLD。v76 WorkerOrderPop._refreshUI(line3547，模块SHA256 c7a2c410b753661c103cffc11656511d0c2a1b578b7d4d509c24d9d44041844e)普通按需求num乘unitReward累加，特殊直接spec.reward；CmdUtil.autoWorkerOrder(line773，f6d97b0ecae9778de85dada8b05f71bd50486901954d98d93cc2801be05b9423)同式。证明客户端基础预览，尚未纳本批算法，不证明最终服务端奖励。AntiqueSuitCfg2002/AntiqueEffectLibCfg存在订单金币提高，BuildingSkin/SeasonCatchup存在订单EXP加成；配套本地协议ORDER_GOLD_INC6/ORDER_EXP_INC_PERCENT12有定义（schema原包版本未登记，不冒称v76提取）。EffectModel(line1041，356949a03e2db24eadef16ca3115d81190fed4c488767cc17b5f9230c08e99af)接GameEffectResponse/SCGameEffectUpdate；1850主模块未找到最终GOLD加成应用点，取整/顺序/特殊范围未知。MIN_GOLD继续关闭。

X03：WorkerOrderPop.open删除按钮level>=12，_onBtnDelete直发Deny{index}，没有配额来源；_onBtnOK刷新冷却走独立SpeedUpOrder，不能混淆。TipsDesc居民订单写15秒递增至10分钟/每日重置，不声明免费次数。OrderParam每日40及WORKER_ORDER_INC是完成上限，不是刷新配额。DispWorkerOrder/OrderOfTheDay无refreshRemaining/Used。请求无cost不证明免费/无限，X03继续BLOCKED_EVIDENCE。

#### D.11.2 实际测试及失败证据

父6901b06上本批冻结工作区，30文件联合命令：

node --test tests/order-rewards.test.mjs tests/order-rewards-service.test.mjs tests/order-execution.test.mjs tests/core-operation-adapters.test.mjs tests/operation-service.test.mjs tests/operations-api.test.mjs tests/execution-history.test.mjs tests/execution-memory-service.test.mjs tests/operation-recovery-service.test.mjs tests/function-contracts.test.mjs tests/function-registry.test.mjs tests/gameplay-settings.test.mjs tests/gameplay-view.test.mjs tests/gameplay-api.test.mjs tests/gameplay-execution.test.mjs tests/farm-forge-api.test.mjs tests/farm-forge-full-page.test.mjs tests/actions-safety.test.mjs tests/cli-safety.test.mjs tests/formation-unlock.test.mjs tests/formation.test.mjs tests/named-formations-service.test.mjs tests/equipment-forge.test.mjs tests/equipment-forge-service.test.mjs tests/hero-operations.test.mjs tests/hero-service.test.mjs tests/run-budget-service.test.mjs tests/run-budget-safety.test.mjs tests/workflow.test.mjs tests/operations-view.test.mjs

实际747 tests/747 pass/0 fail/0 cancelled/0 skipped/0 todo，22.90秒。不是R7或真实E2E。订单用真实GameClient/本地Codec/进程内fake socket/临时History；解锁用真实Codec及合成client；HTTP为createConsole in-process，无监听，clientFactory/collect断言0；完整assembled PAGE不替换call/operationMutation。原订单47及安全/预算/历史/CLI/Workflow断言保留。独立93/139/64、root118/143/19与747重叠，不相加。git diff --check通过。

| 失败/审查证据 | 修复 |
|---|---|
| 订单接线首轮144/145，额外active改变原request SUCCESS语义 | 移除诊断额外控制检查，保留纯观察及原47断言 |
| 新奖励Service13/14误取rewardSource | 改真实configuredRewardEvidence，14/14，未删旧断言 |
| 解锁脚本UI匹配失败 | 所有文件写前预检退出，无半套注册；定位真实分支再写 |
| 四文件123/124，相关table.revision不使许可失效 | clone完整相关表及revision，原依赖测试通过 |
| Forge互斥假设被v76模型否定 | 完整pool+镜像一致/唯一主人；原负例保留冲突，专项64/64及联合通过 |
| D.11初次脚本换行SyntaxError、重试btoa不可用 | 均在文档写入前退出；改PowerShell单引号here-string直接追加UTF8 |

#### D.11.3 恢复位置和最终验收分支

已交子域不重复开发。W04/W07/W08/W19整体仍PARTIAL，R1 W03来源恢复局部BLOCKED保留，R1/R2整阶段未虚报完成。下一独立施工：W07 C229明确已佩戴UID/正精铁成本的单次LEVEL Adapter；W08 C215源战报/站位关联离线证据还原；X02/X03有证据才扩展。root串行注册/D6/UI/文档，专域独占文件冻结后整合。

E10组内增加持有图纸解锁、已解锁/缺图零派发、ids精确新增/扣图/原阵容pet不变及UNKNOWN；E09装备厂复读完整pool与镜像；E04关联typed奖励和净金币，不把基础预览当最终奖励。原E01–E24不增删，全部新增真实写REAL_UNVERIFIED。R7后另列账号/目标/请求/次数/预算/风险/清理等待R8单独授权。当前继续工程，Goal保持ACTIVE。

### D.12 C229 装备升级、订单基础预览与公共派发时效修复（2026-11-11）

本批父提交8cae74bba98ef43d25221743168ea7e67c166780，代码/测试/本节由同一次本地提交定位。恢复核对分支codex/phase-4-alliance-integration，原staged为空，未提交差异与交接一致。五份原始未跟踪输入保留且不暂存。父目录/仓库各级未发现AGENTS.md/TREE.md，沿用现有src/tests/docs目录。Goal ACTIVE；未连接真实游戏、读取真实凭证、创建Runtime、启动Stage Runner、操作MITM/CA或push/merge/reset。

| 工作包/ID | 当前Function和调用链 | 当前分维度状态及边界 |
|---|---|---|
| W07 / C229、P3-6/P3-7、BIZ-H05/BIZ-R09装备LEVEL子分支 | equipment-growth#surveyEquipmentGrowth/viewEquipmentGrowth/planEquipmentGrowth/verifyEquipmentGrowth → equipmentGrowthModule → contract/registry → 唯一generic executor/Service/Ledger/History → 原Gameplay/Operations API → 英雄页装备子区/Workflow ACTION | Function EXISTING_FUNCTION；UI EXISTING_UI；Protocol STATIC_VERIFIED；允许的单次正精铁分支OFFLINE_VERIFIED；REAL_UNVERIFIED。C229完整范围PARTIAL，level=0/闲置装备升级未开放；W07其余专武/纹章/替换/精炼/升星/Pet不因此完成 |
| W04 / C124、BIZ-W05、ORD-006 | order-rewards#configuredBaseOrderReward/clientBasePreview → 原survey/planner证据 → 原订单页 | 普通基础SUM(unitReward×requirement.num)，特殊直接配置reward且不乘需求量，OFFLINE_VERIFIED；CLIENT_BASE_ONLY_BONUSES_NOT_APPLIED，finalPreview仍BLOCKED_EVIDENCE，minGoldEligible=false。最终金币/加成/取整、X03刷新资格仍未证 |
| W01/W02公共安全 | business-functions#executeBusinessOperation重用同adapter.plan精确候选校验 | 每次资源await后、原子reserve前、同步DISPATCH_INTENT持久化返回后重核事实时效和原授权候选；没有新executor、协议或任意Web写权限 |

C229参数只有heroId与精确正int64十进制uid；默认关闭，仅明确已佩戴、level≥1、nextLevel≤配置上限、正精铁成本。复用parseEquipmentOwnership全pool/AllHero完整镜像/唯一主人/派生bag；各源保留原响应完成时间，30秒可信事实及账号/角色/世界/代次/连接/相关配置依赖均受控。成本与父子精铁/typed equipment UID声明一致，UNKNOWN保留预算/UID且不自动重发。

EnhanceEquipRequest只含uid，没有专用Response；watch标签不能证明成功。verify要求完整pool与佩戴镜像同UID同字段、目标level恰好+1、精铁精确净扣、非目标装备/英雄/归属/库存不变。目标英雄仅允许服务器完整AllHero复读的power/attributes合法结构变化，不预测数值或要求战力必增。level=0/refine/star/replace不借零成本开放。D6只新增精确自有精铁及UID合同，付费/补料/购买仍硬拒。14静态Adapter加动态Stage共15合同。

#### D.12.1 固定证据

沿用work/e2e/20261110-b4/formation-client-evidence/manifest.json；只读重新核验v76包SHA256 4fd1f03034b78b0ea0d80590ce1082aa805529b91b2ef99ced9ca2d9f00c2444、包内/subpackages/main/game.js a6046fcc2ad7a3424282e9f8b51073656f5ae8d48742129743560bf958266c54、本地协议ef6137ef923f0b8b44b10379effe0ac2b3555ffab18b278e03e97b19bf4a4dcc及配置0809253d78b00a81ebb78ab9fc8b94668372f6b8a08430144710325a165da762。仅内存解包/静态读取，不执行bundle。

EquipLevelBtn.ts:1065 refreshLvBtn/_toUpRequest确认EquipUpDecomposeCfg[level+1].upgradeCost及精铁；EquipUtil.ts:1087确认EquipAttrCfg[id_star].maxLv、绿首字star=0；EquipModel.ts:1077、AllHeroesModel.ts:93、HeroDetail.ts:1569、HeroUtil.ts:1673支撑pool镜像及权威派生字段。WorkerOrderPop._refreshUI:3547与CmdUtil.autoWorkerOrder:773证实客户端基础公式，配置129普通/25特殊行进入回归；未将客户端展示扩为最终服务端事实。

#### D.12.2 实际测试与失败保留

初次16文件404/404后，独立审查复现30秒事实过期仍派发，故该结果不是最终结论。新增RED命令：node --test --test-name-pattern 'expired equipment facts|equipment facts expiring' tests/equipment-growth.test.mjs；修复前2 tests/0 pass/2 fail，两条均确切在writes=1而期望0处失败；修复后同命令2/2 PASS。

最终35文件统一定向命令：

```powershell
node --test tests/equipment-growth.test.mjs tests/equipment-growth-service.test.mjs tests/formation-unlock.test.mjs tests/equipment-forge.test.mjs tests/equipment-forge-service.test.mjs tests/hero-operations.test.mjs tests/hero-service.test.mjs tests/farm-operations.test.mjs tests/farm-service.test.mjs tests/alliance.test.mjs tests/alliance-tech.test.mjs tests/museum.test.mjs tests/fleet.test.mjs tests/treasure.test.mjs tests/naval-rules.test.mjs tests/function-registry.test.mjs tests/function-contracts.test.mjs tests/gameplay-settings.test.mjs tests/gameplay-view.test.mjs tests/gameplay-api.test.mjs tests/gameplay-execution.test.mjs tests/operations-api.test.mjs tests/workflow.test.mjs tests/farm-forge-api.test.mjs tests/farm-forge-full-page.test.mjs tests/actions-safety.test.mjs tests/order-rewards.test.mjs tests/order-rewards-service.test.mjs tests/order-execution.test.mjs tests/run-budget-service.test.mjs tests/run-budget-safety.test.mjs tests/operation-service.test.mjs tests/operation-adapters-integration.test.mjs tests/execution-memory-service.test.mjs tests/operation-recovery-service.test.mjs
```

实际814 tests/814 pass/0 fail/0 cancelled/0 skipped/0 todo，12.28秒。不是R7或真实E2E。历史131/98/404与本814重叠，不相加。HTTP为进程内createConsole合成边界，clientFactory/collect保持0；assembled PAGE使用实际call/operationMutation及封闭fetch；无真实连接。

| 失败/审查证据 | 修复与保留行为 |
|---|---|
| 2×14.9秒库存读加此前0.5秒，事实30.3秒后仍Enhance派发，事后才UNKNOWN | 同planner同步重核；异步读过期0派发、0资源/UID预留、库存/等级不变 |
| DISPATCH_INTENT同步持久化31秒后仍派发 | transport前再核，0派发；已预留精铁/UID保守保留，不发明refund |
| 首版回归在旧post-survey计数先失败 | 零派发断言前置，两条RED精确记录危险派发，不降低断言 |
| 原equipment注释字面换行导致ReferenceError | 上轮已修真实换行；本814含实际import/Service/UI运行 |
| root只读静态脚本匹配/解密/转义失败及首次D.12 provider路径错误 | 均未写任何文件；改明确UNC/Stop后追加；包/entry/protocol/config哈希和独立静态语义复核保留 |

#### D.12.3 当前账本、恢复及真实验收

原95C/273Inventory/42P/8S、W01–W22、R1–R8、E01–E24全部保持。原a505019主表/附录继续作为历史基线，C229当前增量以本节为准，不能把协议历史行当当前无实现。W04/W06/W07/W08/W19整体仍PARTIAL，W03来源/地图恢复仍BLOCKED_EVIDENCE。E09（非E08）纳Forge与C229：pool/镜像、精铁净扣、目标派生、非目标保持及无效果UNKNOWN；E04保留最终事前金币未证；E20/E21/E23覆盖父预算/UNKNOWN/取消/隔离。所有真实写REAL_UNVERIFIED；R7尚未执行，R8其后另列具体账号/请求/次数/预算/风险/清理等待单独授权。

下一独立工作：W08/C215极限列表→所选replay→BattleReport→合法站位来源链；W09/PRO002已有Fort普通自有材料捐赠；W07其余11原子成长子项核证后逐个闭环。root串行共享Registry/Contract/Service/D6/API/UI/docs，领域两文件可并行，不因局部缺证停止其他链。

### D.13 极限来源复制、普通堡垒捐赠及实际传输时效屏障（2026-11-11）

本批以5f1e54705ce9ee279a56ae130cb1037961fd9325为父，源码/测试/本节随所在本地提交共同定位。实际目录 //zhangnas/app/crazywaterword，分支codex/phase-4-alliance-integration，提交前main...HEAD=0/29，a505019仍为祖先；恢复时staged为空，只有交接列明的协作成果。无AGENTS.md/TREE.md新变化；沿用src/tests/docs，无新目录/worktree。五份原始未跟踪输入SHA与第2节完全一致，仍不暂存；未push/merge/reset、未读真实Token、未创建真实Runtime或连接游戏。人类持续执行Goal取代早期Planning Only，Goal保持ACTIVE。

| 工作包/原ID | 实际Function/调用者 | 当前离线交付及保留边界 |
|---|---|---|
| W08 / C215、P3-5 | extreme-formations#surveyExtremeFormationList/surveyExtremeFormations/prepareExtremeFormation → OperationService.extremeFormations/prepareExtremeFormationSource → 两条精确只读准备API → 原Formation页极限来源区 → 原Formation survey/plan/permit/SAVE/verify/History | Function EXISTING_FUNCTION、UI EXISTING_UI、Protocol STATIC_VERIFIED、Offline OFFLINE_VERIFIED、Real REAL_UNVERIFIED。原C215历史NOT_IMPLEMENTED由本节增量替代；准备只返回合法主线站位参数，保存仍须新计划/单次授权。其他战斗模式/自动换阵续跑未因此完成，W08 PARTIAL |
| W09 / PRO-002、REQ-103/REQ-159 | alliance-fort#parseAllianceFortObservations/viewAllianceFort/planAllianceFort/verifyAllianceFort → 原allianceModule → 同generic executor/OperationService/Ledger/History/API/Workflow → 原联盟专业页 | 普通自有六材料、显式单city/item/num捐赠OFFLINE_VERIFIED；PRO-002整体PARTIAL，C303/C304帮助配额、C305求助、商船等原缺口不变。不是新增C编号；build/finish/demolish/selectPack/自动兑换均未开放。全部写REAL_UNVERIFIED |
| W01/W02 公共执行合同 | executeBusinessOperation → GameClient.request/sendWatch → send.beforeDispatch | 在异步库存读、原子预留前、DISPATCH_INTENT持久化后、授权/Memory同步检查后及编码/frame/writer fence后重核原planner。最终纯领域检查之后没有业务I/O回调。不是另建执行器，不把socket已尝试后的异常降为无派发 |

#### D.13.1 C215 证据与合同

沿用D.12的v76主包/entry/protocol/config固定SHA。新增只读核验同v76 _src_chunks_.wxapkg SHA b271d4cdcfd3ddaed52e9cdb03f708d95f1f732707a8fc401ae67482d1e52a6d；entry offset49/size1621701，SHA fc25d58348197c04d83af90df1d2f3200f9a9e35ba36ebb3e8a8a90a88348b2f。此包完整schema与旧bundle不同，C215使用的19个定义逐字节一致，不能外推全部schema版本相同。StageView:3001 → RaidExtremePass(module=3)，BestPassPop:363、BestPassItem:361 → BattleReport；普通Rank不含replay/hero/pos，不能替代来源。

来源参数严格stage正int32及playerId/worldId/replayId精确正int64十进制字符串。viewer账号/角色/世界/代次/连接与source身份分别绑定，允许跨服来源。列表与report同stage、BT_MAINLINE、完整LEFT英雄/坐标精确一致，明确report.presetId，不从相同坐标的9/10模板反推；来源没有isWin，仅标SERVER_EXTREME_PASS_SOURCE，不套ChallengeStage胜负判断。目标须已拥有英雄/已解锁layout/人数与坐标合法，保留目标当前明确petUid（含0），不复制源宠物。

每份来源保留原响应完成sourceAt，30秒事实；未决/迟到/UNKNOWN/取消阻断且不自动重试。发现与准备均在原同账号锁内，废弃旧plan/permit和旧source cache，不建history/budget/run/runtime。来源证据仅30秒内、账号/连接/关卡/相关配置/参数一致时附原Formation planSummary并派发前落History；重启不恢复来源授权。HTTP仍同源JSON/CSRF/精确唯一account/READY gate，只有两条精确准备路由，未扩任意游戏写白名单。完整PAGE账号切换/编辑草稿/迟到响应均清空或丢弃旧结果。

#### D.13.2 Fort 证据与复用

静态v76 FortExchangePop:1263、FortDonatePop:1261、FortUtil:1269；Exchange模块SHA 91da72b3dc2743728ca59e5e2f490ae01ed41a773990ccefdc3d08ba410817a9，Util SHA 4077bd8087df5d56677655624fb602a2cb0fbc3cbd047943ceab3cd737066f38。读取复用原Alliance同轮GuildInfo/GuildCityInfo/AllItem/AllResource，仅显式city增加CityFortInfo；raw own字段先解析，再展示转换。五来源各保留sourceAt/gameTime，不用慢兄弟响应刷新旧事实。fortFacts保留对象引用并以私有WeakMap绑定live currentContext/currentGameTime，序列化facts只读不可授权。

默认enabled=false/fort=false，明确本盟guildId/自有city/两份完整Fort镜像、own state=0 BUILDING、season与五张配置表、同可信游戏日和30秒事实。每次plan/verify都核当前trusted clock与账号/角色/世界/联盟/代次/连接。墙钟/monotonic漂移、跨日、日界不确定均阻断。参数仅{}或city-only读取、完整{cityId,itemId,num}捐赠；捐赠不混科技/成员等其他业务目标。材料精确为压电陶瓷/炮弹/耐火砖/高温合金/液态金属/碳纤维，库存及剩余需求必须足够，body固定{cityId,item:{itemId,num},selectPackNum:0}，D6逐字段及同材料同数量成本核验。没有礼包、购买、补料、build或自动兑换。

功勋按正常部分+衰减部分整体floor，500是衰减阈值而非日配额；ITEM type=0，不是联盟resource6。DonateFortResponse.process全量/增量消费语义未证，保留SHAPE_ONLY_SEMANTICS_UNPROVEN，不能单凭它确认成功。typed功勋类型/数量、fresh CityFortInfo全进度/日计数、GuildInfo/GuildCityInfo归属及完整库存必须共同确认：材料精确净扣、功勋精确净增、目标进度和日计数+num、其他状态不变；FortFund/fundSpeed可独立计时，保留原始证据但不伪造为成本。并发其他变化保守UNKNOWN，不重发。

原Alliance专业UI新增城市读取、材料进度/库存/数量选择，仍调用原survey→plan→authorize→execute，没有另建API写入口。public顶层及nested fort.candidates均裁剪transport action。Workflow ACTION复用原Alliance及父RunBudget；UNKNOWN原History与预算保持，重启只读恢复锁；Fort的资源型UNKNOWN尚无安全APPLIED/NOT_APPLIED自动解除合同，继续STILL_UNKNOWN，不由新复读猜清锁。

#### D.13.3 失败证据与最终离线验证

| 原始失败/发现 | 修复与保留回归 |
|---|---|
| D.12后第三次复现：DISPATCH_INTENT后最后assertCurrent同步I/O推时31秒，1 test/0pass/1fail，writes1而期望0 | 最后所有潜在阻塞检查之后增加纯领域plan；Memory fresh observer只在第一次fresh plan记录一次，后续重核不重复observer I/O；原第三回归保留 |
| 真实GameClient编码/frame/assertTransport在最后planner后推时31秒，lastPlanAt=1000000/sendAt=1031000，writes1、UNKNOWN | beforeDispatch在writer fence后/onDispatch前重核；原C229+真实Codec+合成socket三边界均0写；普通伪造dispatchPrevented属性不能绕过 |
| typed/silent零发送取消/断连首轮32测试24PASS/8FAIL；扩大40测试后34PASS/6FAIL | client内部私有WeakMap将无派发证明绑定本次回调和新错误实例；watch取消在sent不存在时同样证明；socket已尝试后无效果/抛错仍UNKNOWN、保留指纹。最终40/40 |
| Fort嵌套view泄漏action transport | Service复用公开候选裁剪，nested与top-level均无action；Service专项断言保留 |
| 首次Fort接线159PASS/2FAIL | 无city读取保留原Fort blocker；合同字段测试增加itemId/num，全部旧注入/安全断言保留，最终162/162 |
| C215完整PAGE首轮24PASS/4FAIL，路径gate未登记使fetch=0 | page.operationMutation仅登记两条精确准备路径，最终28/28；Fort完整页面新增2项后与相邻view89/89 |
| Fort live-clock审查复现WALL_CLOCK_CHANGED仍有动作 | 领域每次plan/verify检查当前可信时钟，漂移专项修复后39/39；Service用实际trustedGameClock再验 |
| 少量编辑脚本因引号/模板语法在解析期失败、Fort新增屏障fixture过早触发 | 解析期无文件写入，改小块编辑；fixture修正后32/32，不把测试fixture错归生产缺陷，不删旧断言 |

最终统一定向命令（48文件；不是R7）：

```powershell
node --test tests/business-transport-freshness.test.mjs tests/equipment-growth.test.mjs tests/equipment-growth-service.test.mjs tests/extreme-formations.test.mjs tests/extreme-formations-service.test.mjs tests/alliance-fort.test.mjs tests/alliance-fort-service.test.mjs tests/alliance.test.mjs tests/alliance-tech.test.mjs tests/formation.test.mjs tests/formation-unlock.test.mjs tests/named-formations.test.mjs tests/named-formations-service.test.mjs tests/equipment-forge.test.mjs tests/equipment-forge-service.test.mjs tests/hero-operations.test.mjs tests/hero-service.test.mjs tests/farm-operations.test.mjs tests/farm-service.test.mjs tests/function-registry.test.mjs tests/function-contracts.test.mjs tests/gameplay-settings.test.mjs tests/gameplay-view.test.mjs tests/gameplay-api.test.mjs tests/gameplay-execution.test.mjs tests/gameplay-locks.test.mjs tests/operations-api.test.mjs tests/workflow.test.mjs tests/farm-forge-api.test.mjs tests/farm-forge-full-page.test.mjs tests/actions-safety.test.mjs tests/run-budget.test.mjs tests/run-budget-service.test.mjs tests/run-budget-safety.test.mjs tests/resource-budget.test.mjs tests/operation-service.test.mjs tests/operation-adapters-integration.test.mjs tests/execution-memory-service.test.mjs tests/execution-history.test.mjs tests/operation-recovery.test.mjs tests/operation-recovery-service.test.mjs tests/client-lifecycle.test.mjs tests/client-unverified-write.test.mjs tests/execution-lifecycle.test.mjs tests/server-runtime.test.mjs tests/writer-ownership.test.mjs tests/stages-formation.test.mjs tests/execution-stages.test.mjs
```

实际1147 tests/1147 pass/0fail/cancelled/skipped/todo，18.90秒。之后只将无派发证明收紧为单次fresh错误+本次callback绑定，重跑business-transport-freshness/client-lifecycle/client-unverified-write 70/70、0fail/skip，1.18秒；与1147重叠不相加。独立C215 Service36、domain54、Fort domain39/Service32、完整PAGE30均包含于统一命令；前批历史结果不冒充本提交全量回归。HTTP用进程内Console不listen，Service协议测试为真实本地Codec+合成state；实际GameClient仅合成socket、构造WebSocket会抛错，无游戏网络/账号/Token。git diff --check通过。

#### D.13.4 恢复位置和后续

原95C/273Inventory/42P/8S、W01–W22、R1–R8、E01–E24、X01–X18全部保持。C215本节替代历史NOT_IMPLEMENTED；PRO-002/REQ-159捐赠子分支新交，不把整项互助/联盟交付标完成。W04/W06/W07/W08/W09/W19仍PARTIAL，W03来源/地图资产恢复BLOCKED_EVIDENCE；R1/R2/R3整阶段未虚报完成。E10纳极限源身份/站位/宠物保留及保存复读，E12纳普通堡垒材料/功勋/日计数精确变化，E20/E21/E23纳父预算/UNKNOWN/取消/账号隔离；原E03真实升级0派发待验保留。R7未完成，R8必须其后单独批准具体账号/请求/次数/预算/风险/清理，所有真实分支REAL_UNVERIFIED。

下一可执行原子分支：W07/BIZ-R09明确已佩戴RED装备REFINE+1。静态证据已核EquipDetailPop:1057（SHA a72390a57247af8a52e500a34c726043f5e58d2d5d7fee8edcaa7b9d28c27e50）、EquipUtil:1087（eee5b62dd7bd3295b60c062ed12986073b55fca1fad85018af07716c41e9ea9b）；请求仅uid、无专用Response，EquipRefineCfg[next]双正成本精铁/精炼石、EquipAttrCfg[id_star].maxRefineLv。扩原equipment-growth而非建新执行器；缺省action保持LEVEL，显式refine单项授权，完整pool/英雄镜像/refineLv+1和双材料精确扣除，目标派生只容合法power/attributes变化。尚未纳本提交实现，不计C230替换完成；其余原W07原子子项继续保留。领域两文件独占，root串行D6/合同/UI/Service/docs，阶段提交后继续，不等待Owner逐项确认。

### D.14 红装 REFINE 单次闭环与配置依赖对账（2026-11-11）

本批父提交d79e2d39198588454e0deb809873851db14570e4，代码、测试及本节由同一次本地提交定位。恢复实核目录 //zhangnas/app/crazywaterword，分支codex/phase-4-alliance-integration，main...HEAD=0/30，a505019仍祖先。staged原为空，11份未提交文件均为交接列明的本Goal协作成果；没有覆盖用户改动。可访问祖先及仓库未发现AGENTS.md/TREE.md；沿用原src/tests/docs，无新目录/worktree。原五份未跟踪输入重新核SHA与第2节一致，不纳暂存。Goal ACTIVE；没有真实连接、Token读取、Runtime/Stage Runner/MITM/CA、push/merge/reset。

| 工作包/原ID | 实际Function/调用链 | 当前状态与边界 |
|---|---|---|
| W07 / BIZ-R09、P3-6/P3-7 | 原equipment-growth#surveyEquipmentGrowth/viewEquipmentGrowth/planEquipmentGrowth/verifyEquipmentGrowth → 同equipmentGrowthModule/contract/registry → 原generic executor/OperationService/ResourceLedger/ExecutionHistory → 原API/专业装备页/Workflow ACTION | 显式已佩戴RED单UID REFINE+1：Function EXISTING_FUNCTION、UI EXISTING_UI、Protocol STATIC_VERIFIED、OFFLINE_VERIFIED、REAL_UNVERIFIED。没有新增C编号，不把C230装备替换或整包W07标完成 |
| W01/W02 配置依赖及传输保护 | equipmentGrowthDependencyVersions；原registerBusinessFunction fallback；真实GameClient合成socket回归 | LEVEL与REFINE只绑定各自实际费用表；两种模式共用equipment UID父预算。复用旧的本地未派发错误不能伪装新socket尝试为零派发 |

省略action完全保留C229 LEVEL参数、actionId、identity及依赖形状。唯一新增参数action:'refine'；action:'level'/star/replace及传输/费用/批次注入仍拒绝。明确英雄已佩戴、唯一主人、完整Equips池与AllHero镜像逐字段一致；level≥1、own refineLv≥0、EquipCfg.quality=RED、低于EquipAttrCfg[id_star].maxRefineLv。EquipRefineRequest仅{uid}、没有专用Response，watch不能证明成功。取EquipRefineCfg[refineLv+1].costItem1精铁及costItem2精炼石，两项均正整数；不开放付费、补料、购买、自动激活或闲置装备。

REFINE权威复读仅允许目标UID refineLv恰好+1，level/star/equipId/attr/rerollAttrs及其他装备、英雄、归属不变；完整库存仅两项材料精确净扣。目标英雄仅允许权威power/attributes合法变化。请求标签SUCCESS但无效果仍UNKNOWN；双成本与typed equipment UID预算持久预留，父级跨批累计且同UID LEVEL与REFINE不能重复消耗，重启禁止自动重发。各独立响应保留原完成时间，30秒时效在资源await后、DISPATCH_INTENT后及真实传输边界重核；预算与UID必须先持久化才派发。

动态依赖公共moduleConfig/EquipCfg/EquipAttrCfg；缺省LEVEL只加EquipUpDecomposeCfg，显式REFINE只加EquipRefineCfg。独立审查发现合同缺省条件写undefined而registry valueAt归一为null，当前域自定义依赖正确，但元数据fallback不一致；已改parameters.action=null，并用移除自定义依赖的真实注册fallback分别对照四组参数，确保两种路径一致。相关table.revision变化失效，无关费用表不失效。Registry回归补齐原Fort五表相关变化断言，未扩大生产白名单。

原装备专业页新增两种明确模式，只编辑草稿并要求重新survey/plan/单次authorize；默认LEVEL。完整PAGE账号切换、脏草稿及迟到结果保护保留，不在页面计算费用或做业务判断。15合同数量不变，没有新executor/adapter/HTTP写入口。

#### D.14.1 固定静态证据

沿用D.13固定manifest、v76主包4fd1f03034b78b0ea0d80590ce1082aa805529b91b2ef99ced9ca2d9f00c2444、main entry a6046fcc2ad7a3424282e9f8b51073656f5ae8d48742129743560bf958266c54、本地协议ef6137ef923f0b8b44b10379effe0ac2b3555ffab18b278e03e97b19bf4a4dcc及配置0809253d78b00a81ebb78ab9fc8b94668372f6b8a08430144710325a165da762。EquipDetailPop:1057模块SHA a72390a57247af8a52e500a34c726043f5e58d2d5d7fee8edcaa7b9d28c27e50，UTF8 byte1981657，refresh1991603/request1994952；EquipUtil:1087模块eee5b62dd7bd3295b60c062ed12986073b55fca1fad85018af07716c41e9ea9b，byte2075468，资格2079901/成本2088678。完整证据常量EQUIPMENT_REFINE_EVIDENCE保留具体offset/hash。60档配置及36条正精炼上限（均RED）进入固定配置回归；红武器1 star0 cap10，首档90500精铁+100精炼石，第11档108500/120。客户端仅静态内存分析，不执行bundle或连接游戏。

#### D.14.2 实际离线验证与失败证据

最终21文件统一定向命令（父d79e2d3+本批最终工作区）：

```powershell
node --test tests/equipment-growth.test.mjs tests/equipment-growth-service.test.mjs tests/function-contracts.test.mjs tests/function-registry.test.mjs tests/actions-safety.test.mjs tests/business-transport-freshness.test.mjs tests/farm-forge-full-page.test.mjs tests/hero-operations.test.mjs tests/hero-service.test.mjs tests/equipment-forge.test.mjs tests/equipment-forge-service.test.mjs tests/execution-memory-service.test.mjs tests/operation-recovery-service.test.mjs tests/run-budget-service.test.mjs tests/run-budget-safety.test.mjs tests/workflow.test.mjs tests/gameplay-settings.test.mjs tests/gameplay-view.test.mjs tests/gameplay-api.test.mjs tests/gameplay-execution.test.mjs tests/operations-api.test.mjs
```

实际590 tests/590 pass/0fail/cancelled/skipped/todo，13.0246秒。包含domain48、Service66、transport42及完整PAGE；先前266/266、domain48和Service66与本590重叠，不相加。不是R7或真实E2E。原LEVEL域28及Service29全部保留；旧refine非法断言改为确实未支持的star，新增明确refine合法及省略仍LEVEL的互斥用例，没有删测试/降低成功条件。真实本地Codec+合成状态、内存socket、临时History、进程内Console handler；没有监听真实控制台，clientFactory/collector调用0。完整PAGE用实际call/operationMutation及封闭fetch；没有浏览器DOM和真实游戏定时器覆盖。git diff --check通过。

| 原始失败/审查 | 修复及保留 |
|---|---|
| 两条旧已证明error复用回归首跑失败于缺ResourceLedger import | fixture补import；42/42证明第一次本地编码/frame失败后，第二次socket重抛同Error仍dispatched=true/UNKNOWN。此失败不是生产缺陷 |
| 缺省LEVEL依赖声明undefined与registry null不一致 | 精确改声明并新增真实fallback与域依赖相等回归；无关表不误失效 |
| 传输测试EOF空行 | 仅修尾部空白，无断言删改；diff-check通过 |

#### D.14.3 追踪、恢复与后续

95C/273Inventory/42P/8S、22W、8R、24E及X01–X18全部保留。BIZ-R09新增REFINE子分支由本节覆盖历史未实现表述，C229仍仅已佩戴level≥1，C230替换不变；专武、纹章、升星、Pet等W07子项继续分别核证。W04/W06/W07/W08/W09/W19整体仍PARTIAL，W03来源/地图恢复仍BLOCKED_EVIDENCE，不虚报R1/R2/R3完成。

E09组内增加明确RED同UID REFINE、双材料精确净扣、cap/缺材料零派发、镜像/非目标保持、无效果UNKNOWN；E20/E21/E23覆盖同UID跨种类父预算、重启、停止及账号隔离。全部真实分支REAL_UNVERIFIED；原E03真实升级0派发待验保留，R7尚未完成，R8必须其后单独批准账号/请求/次数/预算/风险/清理。

下一独立原子分支W07/C225：已有激活专武单次LEVEL，优先扩原hero-operations/buildHeroAction及同共享执行合同。静态审计正在还原HeroDetailExclusiveLevel:1579、ExclusiveUpgradeCfg下一档、RED cost[1]/其他cost[0]、ExclusiveStarCfg当前星unlockLv及英雄星级前置、实际Response配对和完整DisplayHero权威字段；证据齐全后才实现，不使用任意非空cost fallback。root串行共享合同/D6/UI/docs，领域与Service测试分文件独占。Goal保持ACTIVE，继续施工无需Owner逐项确认。

### D.15 C225 已激活专武单次升级（2026-11-12）

父提交 `7d71bf9d2e8754c8a4b33ea9d7ce12965c36b98b`，分支 `codex/phase-4-alliance-integration`，恢复时相对 main 为 0/31，暂存区为空。保留交接中的 C225 改动与原五份未跟踪输入。实际工作目录为 `//zhangnas/app/crazywaterword`，未发现适用 AGENTS.md/TREE.md。

| 工作包 / 原需求 | 实际链路 | 状态 |
|---|---|---|
| W07 / C225、P3-6/P3-7、BIZ-H05/BIZ-R09 专武 LEVEL | `hero-operations#surveyHeroOperations/viewHeroOperations/planHeroOperations/verifyHeroOperation` → 现有 heroes Adapter/合同 → 通用执行器、OperationService、ResourceLedger、ExecutionHistory → 原英雄页 / Operations API / Workflow ACTION | 已激活专武单次等级+1：EXISTING_FUNCTION、EXISTING_UI、STATIC_VERIFIED、OFFLINE_VERIFIED、REAL_UNVERIFIED。W07 仍 PARTIAL；不开放激活、专武升星或材料兑换。 |

必须显式选择 `action:'exclusive-level'` 及英雄 ID。默认仍只列基础成长，旧 CLI 循环不接受专武步骤。读取的专武 level、star 必须真实存在，不能使用 protobuf 原型默认值。对固定 v76 的 `HeroDetailExclusiveLevel.ts:1579`（SHA256 `b0432b543ca2e5ec359a352eb76dc122a118ba5f266b72bd54d21909ce4a9913`，byte 3490281）核实：上限取当前 `ExclusiveStarCfg.unlockLv`，门槛和费用取下一等级 `ExclusiveUpgradeCfg`，ORANGE 取 cost[0]、RED 取 cost[1]。唯一允许正整数自有专武材料成本；D6 拒绝其他材料、附加请求字段和旧循环绕行。包、协议、配置及具体配置表哈希见 `HERO_EXCLUSIVE_LEVEL_EVIDENCE`。

`HeroExclusiveLevelUpRequest {heroId}` 无专用 Response，`HeroExclusiveNextUpResponse.nextHero` 仅为预览。独立复读 AllHero/AllItem/AllResource 必须属于同一账号、玩家、世界和连接代次；逐条检查新鲜度和写前/写后时序。仅当目标专武等级+1、星级不变、其他英雄不变且库存仅精确扣除对应材料时确认；目标英雄仅允许合法权威派生 power/attributes 变化。没有明确效果或写后复读不可靠则 UNKNOWN，持久保留材料和 hero-exclusive UID 预算，禁止重放。专业页切换模式后仍需重新探测、预览、单次授权。预览不返回内部验证配置，配置快照仅保留在内部计划。

#### D.15.1 离线验证及失败证据

```powershell
node --test tests/hero-exclusive-service.test.mjs tests/hero-service.test.mjs tests/hero-operations.test.mjs tests/equipment-growth.test.mjs tests/equipment-growth-service.test.mjs tests/function-contracts.test.mjs tests/function-registry.test.mjs tests/actions-safety.test.mjs tests/cli-safety.test.mjs tests/business-transport-freshness.test.mjs tests/farm-forge-full-page.test.mjs tests/equipment-forge.test.mjs tests/equipment-forge-service.test.mjs tests/execution-memory-service.test.mjs tests/operation-recovery-service.test.mjs tests/run-budget-service.test.mjs tests/run-budget-safety.test.mjs tests/workflow.test.mjs tests/gameplay-settings.test.mjs tests/gameplay-view.test.mjs tests/gameplay-api.test.mjs tests/gameplay-execution.test.mjs tests/operations-api.test.mjs
```

最终 **714/714 PASS，0 fail/cancelled/skipped/todo，13.37 秒**。对应父提交及本节同批代码/测试。包含真实本地 Codec、内存 socket、合成账号、临时 History、进程内 Console、完整页面脚本与 Workflow；不计 R7 或真实游戏。先前 712 项与本次重叠。失败与修复：

| 原始失败 / 审查 | 修复 |
|---|---|
| 四项 Codec 领域测试中，不完整装备不能编码；小数 int32 夹具在编码时被截断 | 以含 64 位 UID 的完整装备走 Codec；另证缺字段拒绝、小数来源拒绝及 Codec 截断行为，保留生产拒绝逻辑。 |
| 候选逐行携带配置，88 英雄离线样本的视图约 96 MB；写后来源早于写前时仍可能确认 | 公共预览移除内部配置和 identity，复用同一权威性检查；视图样本降至约 164 KB。新增 HTTP 断言与三来源时序反例。回归的大小断言只衡量候选视图，完整响应另断言不含私有夹具配置。 |

E09 纳入 ORANGE/RED 单次专武等级、缺材料/星级/达上限零派发、精确扣除及完整复读；E20/E21/E23 核对累计预算、取消、UNKNOWN 和隔离。原需求和 E01–E24 不增删。C226 在现有证据基础上继续独立实施，C225 仍须最终真实验收；R7 未执行，R8 须单独批准。未连接真实游戏或推送。

### D.16 C226 已激活专武单次升星（2026-11-12）

父提交 `1b6dd6c2200860312d61b45d6e2ec0e17e897e73`。W07 / C226、P3-6/P3-7、BIZ-H05/BIZ-R09 复用现有 heroes Adapter、OperationService、ResourceLedger、ExecutionHistory、英雄页与 Workflow ACTION：EXISTING_FUNCTION、EXISTING_UI、STATIC_VERIFIED、OFFLINE_VERIFIED、REAL_UNVERIFIED。C225、基础英雄成长与旧 CLI 合同保持；激活、万能碎片和兑换仍不开放。

固定 v76 `ExclusiveStarPanel.ts:1111` SHA256 `8295bef34f6f46a85c882339e563baac99c54079e3c0a7e33134e49505638b68` 证明下一专武星级的英雄星数门槛、碎片数量、ORANGE/RED 石头分支；`HeroUtil.ts:1673` 定义同英雄碎片 ID。证据及各表哈希见 `HERO_EXCLUSIVE_STAR_EVIDENCE`。首档门槛为英雄 25 星，自有碎片 60、对应品质石 5；不要求专武先升到当前等级上限，只拒绝观察等级已超出该上限的异常状态。确认只绑定实际涉及的五张表，不绑定等级价格表。

显式 `action:'exclusive-star'` 和英雄 ID 才能规划；D6 仅接受 `HeroExclusiveStarUpRequest {heroId,universal:false}` 及两种精确自有材料。无专用响应，`nextHero` 预览不作为确认。独立复读必须证明星级恰好 +1、等级不变、两种材料净扣精确且其他状态不变（目标英雄可有合法派生变化）。写前权威时效、账号与连接隔离、两项持久预算和 `hero-exclusive` UID 均复用 C225。同一父运行下，一次升星已占用 UID 后，即使下一等级成本可支付，也不能再派发该英雄的升级。无效果/歧义保留 UNKNOWN，不重放。

离线验证：D.15 的 23 文件命令追加 `tests/hero-exclusive-star.test.mjs`；共 **737/737 PASS，0 fail/cancelled/skipped/todo，24.00 秒**。包含 ORANGE/RED 真实本地 Codec、固定配置、合成账号、HTTP 授权拒绝缺任一费用、临时 History 重启、跨动作父预算及完整页面。首跑发现 Service 合成石头缺 quality、合同测试误用不含领域校验的桩；补足夹具和真实 Adapter 后通过，保留生产规则。R7 全量及真实游戏未执行。E09 增补 C226 两品质正例及门槛/缺材料/上限零派发；E20/E21/E23 加跨动作预算、无效果和重启隔离。W07 仍 PARTIAL，下一独立分支 C228 核对已佩戴徽章、经验边界和金币，不将 C227/C230 替换标完成。

### D.17 C228 已佩戴徽章从零经验单次升级（2026-11-12）

父提交 `6bdd1572eb74db80aee76f79debec15c6bddda1b`。W07 / C228、P3-6/P3-7、BIZ-R09 增加徽章领域 Adapter，沿用 OperationService、共享执行器、ResourceLedger、ExecutionHistory、原 Gameplay/Operations API 与 Workflow ACTION。英雄页显示已佩戴徽章的槽位、UID、当前经验、等级和两项成本；默认关闭。该原子分支 EXISTING_FUNCTION、EXISTING_UI、STATIC_VERIFIED、OFFLINE_VERIFIED、REAL_UNVERIFIED。C228 完整范围与 W07 仍 PARTIAL；非零经验、升级到上限、献祭、升星、穿戴和替换各自待核。

固定 v76 `BadgeLvUpPop`、`BadgeUtil`、`HeroDetailBadge` 的哈希和偏移见 `BADGE_GROWTH_EVIDENCE`。只允许明确英雄和唯一已佩戴徽章 UID，要求完整 Badges 池与全 AllHero 槽位镜像匹配，目标职业与槽位已满足配置。当前经验必须确为 0，目标等级严格低于上限；下一档 `exp` 即徽章经验用量，金币为该用量乘同档 `goldExpRadio`（固定配置首档 5 经验 / 100 GOLD）。`EnhanceBadgeRequest {uid,decomposeUid:[],expItemNum}` 只接受精确 64 位 UID、空献祭列表、两项正成本；不增加 CLI 或任意请求入口。

`EnhanceBadgeResponse` 必须可验证且无返还材料；响应本身不证明效果。独立的 Badges、AllHero、AllItem、AllResource 响应检查原采集时效、账号/连接和写前写后时序。确认要求同 UID 原槽位等级恰好 +1、残余经验 0、随机属性和其余池/槽位/库存不变（仅目标英雄合法派生战力和属性可变），经验和 GOLD 恰好净扣。预算与 badge UID 派发前持久化；无效果、错效果或意外返还均保留 UNKNOWN，重启不自动重放。公开预览保留必要状态和成本，不包含内部配置或请求体。

离线验证：D.16 的 24 文件定向命令追加 `tests/badge-growth.test.mjs`、`tests/badge-growth-service.test.mjs`、`tests/farm-forge-api.test.mjs`，共 **790/790 PASS，0 fail/cancelled/skipped/todo，23.87 秒**。包括真实本地 Codec、合成状态、共享执行器、磁盘历史、原 HTTP 隔离与完整页面；16 领域、4 Service 和 165 项专项与本次重叠。保留失败证据：未接 D6 时计划按未知成本阻断；修复测试的缺 required int32 夹具使其真正省略编码字段；Service 回归发现预览剥离内部 action 后误标不可执行，现保留给 Service 内部并由其在输出前删除；联合回归发现旧模块清单固定 14 个静态 Adapter，已纳入第 15 个及默认禁用/账号/CSRF 断言。未放宽成本或确认规则。不是 R7；未执行真实游戏。

E09 增加当前受控徽章等级、槽位镜像、精确双扣、零派发与意外材料；E20/E21/E23 增加 UID 预算、重启和隔离复核。C227/C230 的旧/新 UID 归属、继承及返还仍需权威证据；W10 科技重置按钮在固定客户端无实现，当前协议字段不足以推断成本或退款。继续核实独立可施工的装备空槽穿戴及其他工作包，不因上述缺证停止推进。R8 仍在 R7 后单独授权。

### D.18 BIZ-R09 自有闲置装备穿入同类空槽（2026-11-12）

父提交 `1edef7343d009f78aefb31138bd6ab7bc57059fa`。在现有 equipment-growth Adapter 增加显式 `action:'put-on'`；沿用共享执行器、授权、预算、历史、原 Operations API、英雄页和 Workflow。默认 LEVEL、显式 REFINE 及其依赖和计划身份不变。此分支 EXISTING_FUNCTION、EXISTING_UI、STATIC_VERIFIED、OFFLINE_VERIFIED、REAL_UNVERIFIED。属于 BIZ-R09；C230 替换未完成。

固定 v76 `HeroDetail/HeroDetailEquip` 进入装备页前要求 `ModuleOpenUtil.isOpen('英雄装备')`，以唯一 `ModuleOpenCfg.playerLevel` 和当前玩家等级判定（固定配置 16）。空槽按 EquipCfg 的武器、防具、饰品类型区分；`EquipSelectPop` 空槽模式只列该类型闲置装备。包、模块、配置和字节位置见 `EQUIPMENT_PUT_ON_EVIDENCE`。必须明确英雄和 UID，完整装备池与英雄装备镜像一致，目标 UID 为自有闲置、类型可证且目标槽位为空。无资源成本仍须授权和持久预留原 `equipment` UID；D6 只接受 `PutOnEquipRequest {uid,heroId}` 与显式空成本数组。无专用 Response。

写后独立复读须确认完整池、库存与其他英雄和槽位不变，同一 UID 原属性完整地进入目标空槽，仅目标英雄可有合法派生变化；原读数必须新鲜且时序不倒退。无效果、状态不全或非预期变化保留 UNKNOWN 和 UID，重启不重放。页面选择模式只改变草稿，需指定英雄、重新探测并单次授权。不开放替换、卸下、分解、装备消耗或付费行为。

离线验证：D.17 的 27 文件定向命令追加 `tests/equipment-put-on.test.mjs`，共 **816/816 PASS，0 fail/cancelled/skipped/todo，23.78 秒**。原 LEVEL/REFINE 领域 48 项保留；新增真实本地 Codec、会话开启门槛、空槽、库存与 UID 预留、未知恢复、完整页面及父预算。首轮专项发现 D6 的通用成本默认值会接纳显式 null，以及页面测试假设每次有材料，已改为只接受真实空数组并断言明确显示无资源消耗。未执行 R7 或真实游戏。E09 增加同 UID 空槽穿戴、占用/不明零派发、库存不变与无效果 UNKNOWN；E20/E21/E23 增加零资源 UID 预算和重启防重发。C227/C230、W10 重置缺证保持；并行继续 W11/C142 只读远征材料缺口。

### D.19 W11/C142 博物馆远征材料缺口（2026-11-12）

父提交 `280050c9739e6ddf8345d2689705f556782c0278`。C142 的结构化只读缺口已接入现有 `surveyMuseum → museumView → /api/gameplay → 博物馆页`，不增写入口或历史，不要求启用写入或选择英雄。Function/UI EXISTING、STATIC_VERIFIED、OFFLINE_VERIFIED、REAL_UNVERIFIED；W11 仍有其他工作，C144 结算/领取仍需证据。

材料需求只取当前空闲且已解锁远征的 `MuseumInfoResponse.exploreStages[].expedition.cost.asset`，按本次明确倍率和当前玩家门槛缩放。v76 `BuildTeamPop` SHA256 `d50da1c7564449c1766a4641ec9a490dc8b148da5989b1690fab2e26e90a9f6a`（byte 968567），`MuseumUtil` SHA256 `20c6ece1398050221661ec9fc01c8a863602d2134b7359d2a93038d1314e26c1`（byte 4808198）；固定倍率 1/2/3 的玩家门槛分别 1/30/40。已开始或待结算的远征不引用旧成本；成本或倍率无法确认时不猜配置回退。使用完整物品/资源读取，缺读、重复或冲突库存时，已知需求仍显示，持有与缺口为未知；只有可信完整库存未列该材料才视为零。

输出需求、持有、实际缺口、配置保留量、含保留量缺口。物理状态与配置保留政策分开；即使材料足够，原计划仍可能因库存线或累计预算被拒。只提取原 planner 的倍率和费用计算供只读视图复用，保持原出发条件、保留规则、授权和派发不变。

`node --test tests/museum-shortage.test.mjs tests/museum.test.mjs tests/farm-forge-full-page.test.mjs tests/gameplay-view.test.mjs tests/gameplay-api.test.mjs tests/function-registry.test.mjs`：**235/235 PASS，0 fail/cancelled/skipped/todo，7.57 秒**。首跑完整页面测试把模拟 DOM 的标签假定为大写；按标签大小写无关选择后通过，数字、未知和禁用状态仍逐项核对。覆盖固定配置、合成只读响应、原出发报价/保留量一致性和完整页面；未运行 R7 或真实游戏。E14 增加倍率、可信/不可信库存、保留量和已开始远征的只读验收。后续可继续核证同类独立装备/徽章分支及 W11 结算证据；保留 C227/C230 替换和 W10 重置的缺证闸门。

### D.20 BIZ-R09 自有闲置徽章穿入已解锁空槽（2026-11-12）

父提交 `8f1297af9725f741258044a0bad7edd3154113a7`。沿用 W07 的 badge-growth Adapter，增加显式 `action:'put-on'` 与精确 `heroId/uid/pos`；默认 LEVEL 的配置依赖、报价与计划身份不变。Function/UI EXISTING、STATIC_VERIFIED、OFFLINE_VERIFIED、REAL_UNVERIFIED；BIZ-R09 本分支已接入共享执行器、预算、磁盘历史、原 API/Workflow 与英雄页。C227 替换、C228 其他升级分支和 W07 全包仍未完成。

固定 v76 `BadgeSelectItem._onBtnOn`（byte 485010）发 `PutOnBadgeRequest {uid,heroId,pos}`，没有专用 Response；包、模块哈希和偏移见 `BADGE_PUT_ON_EVIDENCE`。要求玩家达到唯一 ModuleOpenCfg 的“英雄徽章”门槛（固定配置 12），目标英雄职业匹配，HeroBadgeUnlockCfg 对应位置已解锁（1/2/3/4 槽分别英雄等级 1/70/90/110），且槽位为空。完整 Badges 池与 AllHero 镜像一致，目标必须是自有闲置 UID，64 位 UID 不经浮点数。D6 只接纳准确字段和真实空成本数组，资源无消耗仍需单次授权和持久 badge UID 预留。

复读确认完整池和库存不变，同 UID 原属性进入指定槽位，其他英雄和槽位不变；仅目标英雄合法派生战力/属性可变。事实必须新鲜、属于当前账号/角色/世界/连接，写后来源时间不得早于基线。静默观察窗口自身不算效果；无效果或异常状态保持 UNKNOWN 和 UID 预留，重启不得重放。页面显式选择模式、英雄空槽后重新探测，可见精确闲置候选和无资源消耗，任何模式或槽位变化均撤销旧选择及授权。

离线验证命令：`node --test tests/actions-safety.test.mjs tests/badge-growth.test.mjs tests/badge-growth-service.test.mjs tests/badge-put-on.test.mjs tests/function-contracts.test.mjs tests/function-registry.test.mjs tests/farm-forge-full-page.test.mjs tests/farm-forge-api.test.mjs tests/gameplay-api.test.mjs tests/gameplay-view.test.mjs tests/equipment-growth.test.mjs tests/equipment-put-on.test.mjs tests/execution-history.test.mjs tests/resource-ledger.test.mjs tests/operation-service.test.mjs tests/business-functions.test.mjs tests/workflow.test.mjs`。

**421/421 PASS，0 fail/cancelled/skipped/todo，7.35 秒**。独立代码复核未发现待修问题；29 项领域/服务复核与本次重叠。包括真实本地 Codec、共享执行器与磁盘派发前历史、空成本 UID 预算、无效果 UNKNOWN/重启、完整页面/账号隔离和原装备/LEVEL 分支。首轮页面测试选到新增 PUT-ON 样例而误查已佩戴表，已按模块和动作种类选择原 LEVEL 夹具，未改业务规则。不是 R7，未连接真实游戏。

W11/C144 静态复核仍缺可恢复的“待领/已领”权威身份：Complete 在计时结束后打开临时结果页，Reward 由该页发送；可选 exploreStage 不足以区分重启前后领取状态。保持缺证，不以收益或空响应替代。并行推进 PRO-007 只读古董属性总览与 W12 扫荡只读事实；完整结算、培养及扫荡执行范围不因这些只读增量缩小。E09/E20/E21/E23 增加徽章精确空槽与未决恢复验收。R8 仍在 R7 后由 Owner 单独授权。

### D.21 W11/PRO-007 古董属性只读总览（2026-11-12）

父提交 `b29ba89c26296818ae5ac2d4770d69c547349c87`。新增独立 Antique 只读子边界 `surveyAntiqueSummary → antiqueSummaryView → OperationService.surveyAntiqueAttributes → POST /api/antiques/summary`，在博物馆页提供显式查询。它是 PRO-007 的“汇总”分支，不把 Museum 展陈、藏品数量或属性查询算作激活/培养/兑换/精通已完成；PRO-007 与 W11 全包仍 PARTIAL。汇总分支 Function/UI EXISTING、STATIC_VERIFIED、OFFLINE_VERIFIED、REAL_UNVERIFIED，不伪造没有写动作的完整写入 Function。

固定 v76 `AntiqueView._onBtnTips`（byte 307873，模块 SHA256 `2058e8b78473a77e274b78db728ac74338dda0ee2d3264bd3276edd337eb8731`）只发 `AntiqueAttrSummaryRequest {}`，响应独立提供 items 和 effects。包/入口哈希在 `ANTIQUE_SUMMARY_EVIDENCE`。属性按全局、仅 heroCamp、仅 heroProf 分组；不展平双重范围、重复属性/效果或损坏字段。attr/value 缺失不能借 protobuf 默认值冒充零；明确空结果与 UNKNOWN 分开。可选 AdditionAttrOverviewCfg、HeroFactionCfg、HeroCareerCfg、AntiqueEffectLibCfg 只补名称和显示类型，不补数值或猜百分比/符号换算。页面“原值/类型”分列。

现有会话必须 READY，Origin/CSRF/JSON、唯一精确账号与空参数检查在领域请求前完成；拒绝额外查询/请求字段，不创建 Session、客户端或全量采集。读取沿用账号互斥锁，撤销旧服务端计划；账号/角色/世界/连接代际变化或取消后不返回旧结果。页面独立显式触发、读取中清空旧值、切换账号丢弃迟到响应；无需启用养成配置，不创建历史、预算、许可或写入。仅增加 DOMAIN_SURVEY_ONLY 元数据：业务读取目录 29 项，其中 13 项非入口读；原 ENTRY_QUERIES 与 Explorer 48 项不变。

离线证据：领域/目录/完整页面 95/95，独立合成 HTTP handler API 14/14。联合命令 `node --test tests/antique-summary.test.mjs tests/antique-summary-api.test.mjs tests/data-catalog.test.mjs tests/explorer-view.test.mjs tests/farm-forge-full-page.test.mjs tests/gameplay-api.test.mjs tests/gameplay-view.test.mjs tests/museum.test.mjs tests/museum-shortage.test.mjs tests/operation-service.test.mjs tests/function-registry.test.mjs tests/function-contracts.test.mjs tests/phase2-api.test.mjs tests/stage-api.test.mjs tests/pirate-sweep.test.mjs` 为 **325/325 PASS，0 fail/cancelled/skipped/todo，7.41 秒**（含 8 项并行 W12 测试，由 D.22 另提交）。最后仅将表头明确为“原值/类型”。真实本地 Codec/固定配置、独立作用域、显式零与缺字段、失败/取消、六种互斥和四类延迟身份变化均覆盖。首跑新增页面测试误用不存在的 harness 接口，按原 run/viewGuard 方式切换后通过，未改变隔离规则。

E14 增加汇总作用域、原值/单位、明确空/UNKNOWN、只读和账号切换验收。未执行 R7 或真实游戏；培养/兑换/精通及 C144 结算身份缺证继续保留，R8 不提前。

### D.22 W12 野怪扫荡只读次数与目标等级关系（2026-11-12）

父提交 `f0408bb6afffcbca2689780595b6da455f7d2c11`。在现有 `collectState → summarize → formatState` 加独立 `view.pirateSweep`，保留原 pirates 投影，原 48 项采集不增请求或信号。此“次数和目标事实查看”分支 EXISTING_FUNCTION、OFFLINE_VERIFIED、REAL_UNVERIFIED。它不新增扫荡写入口，也不替代 W12/C151 执行、C152 召唤、计次/UNKNOWN 和 E15 验收；W12 继续 PARTIAL。

`AllPirateResponse.sweepTimes` 只表示当前读到的已用次数，只有真实自有非负 int32 字段才采纳，缺字段、原型默认零、失败/NOT_EXECUTED/UNKNOWN 或损坏结果元数据均不能冒充零。总额与剩余固定 UNKNOWN，原因是当前缺新鲜完整额度权威。完整有效 pirates 列表保留准确正 int32 uid/type/level/cityId，重复 UID 或任一损坏目标不输出部分列表；完整成功 PirateKillRecord 按 type/maxKilledLevel 解析，重复/损坏/缺字段使关系 UNKNOWN。明确空首杀记录中的未列类型可判需先首杀；目标等于/低于/高于已杀最高等级分别仅显示等级关系、低档需确认、先首杀，不生成 executable 候选或执行许可。

静态 v76 PiratePop/PirateUtil 的已核包/模块哈希和 UTF8 偏移保留在 `PIRATE_SWEEP_READ_EVIDENCE`。总额计算线索为 PirateParamCfg 基数 + VipLevelCfg 当前等级效果 + 有效月卡效果；月卡是否有效依赖服务器时间。LoginResponse.vip 与 SCVipUpdate 有初始/推送来源，但现有 GameClient 没有持续跟踪当前 VIP，且无新鲜 VipInfoRequest；不能拿登录旧值、基数 10 或两条固定月卡配置当前零加成猜实时额度。DailyReset 时区也不能统一假定 UTC+8。下一步应核实并实现完整当前账号 VIP/卡/可信游戏日生命周期，再接共享预算与复读，不把本只读分支当执行完成。

`node --test tests/pirate-sweep.test.mjs tests/data-catalog.test.mjs tests/explorer-view.test.mjs`：**28/28 PASS，0 fail/cancelled/skipped/todo，1.64 秒**（8 项新增专项）；另随 D.21 的 15 文件联合 **325/325 PASS，7.41 秒**，是重叠证据，不累计。真实本地 Codec、原 collector 和合成快照检查显式零/缺失、原始字段保留、坏/重复记录、失败来源与原 48 请求集合；CLI 显式区分已用、未知总额、未知剩余，不暗示可执行。未运行 R7 或真实游戏。E15 增加次数方向、UNKNOWN 与等级关系只读验收，原执行和真实验收条件保留。

### D.23 W11/PRO-007 藏品激活与专属碎片单次升星（2026-11-12）

父提交 `1a70729be976eb4faf4d11be4dc1dfbd4c276964`。新增独立 antique-growth Adapter 与静态 Function 合同，复用 OperationService、共享执行器、ResourceLedger、ExecutionHistory、原 Gameplay/Operations API 和 Workflow ACTION。博物馆页增加藏品/自有碎片表、藏品选择、激活/升星种类及单项候选；选择只改草稿，重新探测、预览和精确授权后才可执行。默认关闭。当前静态 Adapter 16 个、含动态 Stage 共 17 个合同；PRO-007 保持独立 Inventory ID，不冒用 C141–C144。此两个原子分支 EXISTING_FUNCTION/EXISTING_UI、STATIC_VERIFIED、OFFLINE_VERIFIED、REAL_UNVERIFIED；PRO-007、W11 全包仍 PARTIAL。

固定 v76 包/入口/本地协议/配置已重新只读核实，具体字节偏移、原始模块 SHA256 和摘要边界在 `ANTIQUE_GROWTH_EVIDENCE`。TopOperateView/ModuleOpenUtil 的“藏品”门槛取唯一 ModuleOpenCfg（固定 10 级）。AntiqueItem 激活发 `ActivateAntiqueRequest {id}`，消耗该 AntiqueBaseCfg.activeFrag 数量的 `antiqueId+'碎片'`；AntiqueDetailPop 单次升星发 `AntiqueStarUpRequest {id,universal:false}`，取下一档 AntiqueStarCfg，按 BLUE/PURPLE/ORANGE/RED 分支消费对应专属碎片；固定 25 档连续配置决定上限。不得购买补齐、消耗万能碎片或混入套装/兑换/精通请求。两者均无专用 Response，观察窗口不证明成功。

权威读取完整 AllAntique（antiques/suits/masterLv）、AllItem 和 AllResource，拒绝缺字段、重复、损坏与原型默认值冒充状态。激活要求目标原不存在，复读明确出现同 ID 的自有零星条目；省略 star 或其他初始值保留 UNKNOWN。升星要求已有精确条目，恰好 +1。目标以外藏品、精通、套装身份和等级保持，专属碎片必须精确净扣，其余库存不变。ACTIVATE 仅对 AntiqueSuitCfg 明确“拥有紫色藏品”关联的既有套装，允许服务器 effectiveNum/advEffectValue 派生值变化；仅验证值形状和受影响身份，不声称验证了奖励公式、阈值、增量或因果关联。新套装身份/等级、其他套装变化仍 UNKNOWN；STAR 无此派生豁免。激活绑定套装规则且不绑定升星价格，STAR 只绑定其价格，默认查看绑定并集。

事实以私有 WeakMap 绑定原始账号/角色/世界/代际/连接、内容摘要及各来源时间，序列化克隆、字段篡改、旧来源续期不能授权。慢兄弟读取不得刷新早已过期的藏品事实；相同完整响应重排行不改变计划身份。资源与唯一 `{type:'antique',id:antiqueId}` 实体预算派发前持久化，任何无效果/非预期变化保留 UNKNOWN 与预算，重启不自动重发。公开计划身份使用 SHA256 摘要，避免携带完整库存与配置；内部请求和 configEvidence 不公开。业务读取目录同步登记实际三来源的 antique-growth 消费关系，保持原 48 采集与 29/13 业务读数量不变。

离线命令（启动前对全部 34 个路径逐一 Test-Path）：

`node --test tests/antique-growth.test.mjs tests/antique-growth-service.test.mjs tests/antique-summary.test.mjs tests/antique-summary-api.test.mjs tests/actions-safety.test.mjs tests/function-contracts.test.mjs tests/function-registry.test.mjs tests/gameplay-settings.test.mjs tests/farm-forge-full-page.test.mjs tests/farm-forge-api.test.mjs tests/gameplay-api.test.mjs tests/gameplay-view.test.mjs tests/museum.test.mjs tests/museum-shortage.test.mjs tests/operation-service.test.mjs tests/execution-history.test.mjs tests/resource-budget.test.mjs tests/run-budget.test.mjs tests/run-budget-safety.test.mjs tests/run-budget-service.test.mjs tests/workflow.test.mjs tests/equipment-growth.test.mjs tests/equipment-growth-service.test.mjs tests/equipment-put-on.test.mjs tests/badge-growth.test.mjs tests/badge-growth-service.test.mjs tests/badge-put-on.test.mjs tests/pirate-sweep.test.mjs tests/data-catalog.test.mjs tests/explorer-view.test.mjs tests/hero-operations.test.mjs tests/hero-service.test.mjs tests/hero-exclusive-star.test.mjs tests/hero-exclusive-service.test.mjs`

最终 **838/838 PASS，0 fail/cancelled/skipped/todo，12.88 秒**。15 项领域、6 项真实本地 Service/Codec/磁盘历史与 218 项合同/页面/HTTP 隔离证据均与此重叠，不累计。覆盖当前固定配置、紫色派生范围、完整库存/藏品归一化、门槛/上限/余额、成本与唯一实体预算、修改/过期/账号变化、无专用响应和 UNKNOWN 恢复，保留原装备/徽章/英雄/Museum/Workflow/预算回归。首轮共享测试尚固定 16 个合同，已按新增第 17 个校准；复核发现库存返回顺序影响身份，已仅将计划库存按 ID 排序并新增实际重排行测试；最终复核将公开 identity 改摘要后重新跑完整命令。D.20 命令中 resource-ledger.test.mjs、business-functions.test.mjs 当前并不存在，不能将它们算作已运行文件；421 的原始结果保留。本次使用实际 resource-budget/run-budget/run-budget-safety/run-budget-service，并先验路径，纠正覆盖范围。

E14 增加激活/单星、对应碎片、明确零星/缺失、既有套装派生观察和意外身份/精通变化；E20/E21/E23 增加实体预算持久化、无效果 UNKNOWN、重启与隔离。后续仍需逐项完成 PRO-007 套装升级、碎片兑换、精通和万能材料独立合同，以及 C144 结算恢复身份、W12 可靠额度等原工作包。未运行 R7、真实游戏或 R8，未 push/merge；总目标继续 ACTIVE，R8 必须在 R7 后由 Owner 单独授权。

### D.24 W11/PRO-007 单次套装、精通及自有万能碎片兑换（2026-11-12）

父提交 `960fa2be74fbc9c17ae5ce95e12383f124fd9ce1`。在原 antique-growth Adapter 增加显式 `suit/master/exchange`，保持 17 个合同、PRO-007 独立身份及原 ACTIVATE/STAR 的完整 operation JSON、配置依赖和计划 identity 不变。五类具名写请求与 D.21 的独立属性汇总现在均有受控离线业务链；PRO-007 全范围仍 PARTIAL，直接万能/混合升星仍受限；此三分支 EXISTING_FUNCTION/EXISTING_UI、STATIC_VERIFIED、OFFLINE_VERIFIED、REAL_UNVERIFIED。W11/C144 结算恢复及其他原工作包继续保留，不将此增量计作 R7 或全产品完成。

重新只读核验固定 v76 包 SHA256 `4fd1f03034b78b0ea0d80590ce1082aa805529b91b2ef99ced9ca2d9f00c2444` 与 main/game.js 入口 SHA256 `a6046fcc2ad7a3424282e9f8b51073656f5ae8d48742129743560bf958266c54`。新增 AntiqueMasterPop byte 257076、请求 byte 261306、模块 SHA256 `64b192c66b3ad15a7f11cc6704b14cc965553a63fddef55ab5ccd41540ce9dd9`；FragExchangePop byte 2772381、请求 byte 2778539、模块 SHA256 `cb98aefaca24d75fd3a5c0f9ea34909eedd3f81b3299eb257f627027b8324911`；套装请求 byte 300009。模块摘要覆盖 System.register 起点至下一模块起点，含尾空白，记录在 ANTIQUE_GROWTH_EVIDENCE。仅在内存解包和分析代码，没有执行游戏代码、连接或凭证读取。

- SUIT：`AntiqueSuitLevelUpRequest {id}` 无专用响应。缺行或明确 level=0 只激活到 1，真实零成本；BLUE/PURPLE/ORANGE 需拥有本套全部成员，RED 需至少两件。已有正等级逐次 +1，按下一档 AntiqueSuitLvCfg 双成本扣 GOLD 与同品质藏品经验，同时受该品质上限及当前精通 maxSuitLv 限制。精通 0 不阻塞首次套装激活，但不能据此升级已有套装。完整复读只允许目标套装等级 +1，其 effectiveNum/advEffectValue 是合法服务器观察值，不推断奖励或属性公式。
- MASTER：`AntiqueMasterLevelUpRequest {}` 必须同时取得自有正确 next masterLv 的专用 Response 与独立完整复读；仅响应或仅状态改变都不足以确认。累计自有藏品星数达到下一 AntiqueMasterLvCfg.totalStarNum，未达上限；首级真实零成本，后续只消耗明确的“藏品大师经验”。预览显示配置属性原值，不宣称已验证英雄最终属性。
- EXCHANGE：`AntiqueFragExchangeRequest {antiqueId,fragItemId,num}` 无专用响应。仅明确已激活、未满星藏品，来源必须是 AntiqueBaseCfg.universalItemId 与 ItemCfg 对应品质的自有万能碎片，数量为正 int32 且不超过持有；允许超过下一星缺口。独立复读须确认来源精确净扣 num、`antiqueId+'碎片'` 等量净增、完整藏品/套装/精通及其他库存不变；目标加法溢出事先阻断。兑换不自动激活或升星，所得材料不提高父运行原始预算额度。

追加静态复核纠正 D.23 的客户端描述：byte 251108 的唯一 StarUp 调用实际传 `universal:this._isAutoExchange`，不是固定 false；byte 248643 合并专属与万能数量检查足够，byte 251788 的按钮写私有开关，AntiqueUtil byte 303836 读取该开关。D.23 的 `universal:false` 是当前受控合同，不应外推为客户端全部行为。当前明确保留 DIRECT_UNIVERSAL_STAR 限制，独立 EXCHANGE 不冒充直接/混合扣款合同完成；待核实精确扣除分配后再施工。

保留原三来源、账号/角色/世界/代际/连接与各来源时效的私有事实绑定。SUIT / MASTER 分别预留唯一 `antique-suit:suitId` / `antique-master:GLOBAL`，EXCHANGE 使用原 `antique:antiqueId`；成本及实体派发前必须写入磁盘。无效果、错等级、缺/错响应、错扣/错到账、其他状态变化均保持 UNKNOWN 与预留，重启不重放。零成本仍需具体单批许可。公开计划只含摘要 identity，内部请求与配置证据不出 API；原 Operations API/Workflow 共用执行器不复制。页面提供五种明确模式、套装选择和兑换数量；修改只更新草稿并撤销旧预览/授权，必须重新探测。默认关闭、账号切换与迟到结果隔离保留。

联合回归启动前逐一 Test-Path 检查实际 36 文件：D.23 的 34 文件集合，加 `tests/antique-advanced.test.mjs`、`tests/antique-advanced-service.test.mjs`，随后 `node --test` 一次运行全部。最终 **921/921 PASS，0 fail/cancelled/skipped/todo，19.63 秒**。其中新增领域 14 项、真实本地 Service/Codec/磁盘历史 36 项（含五种免费/消耗组合的持久化失败零传输）、完整页面五组合与旧能力重叠，不重复累计。确认完整当前配置支持全部三分支；真实共享父预算用例确认库存 100→102 后原材料额度仍为 100，且同一实体不能重复预留。独立复核还与父提交逐字节比较原 ACTIVATE/STAR 完整 operation，均相同。

首轮审查复现共享 D6 的成本数组子类可覆写迭代方法，导致实际 RUBY 被伪装。现 Ruby 检查调用原生 some，exactCosts 要求标准数组及逐索引 own data descriptor；新增 RUBY 子类、普通伪成本子类和 getter 成本回归，原复现已拒绝。付费硬边界、精确资源形状及原测试均保留。Service 初跑 31/31 成功，因复制全部无关配置耗时 89.31 秒，随后仅投影七张完整相关配置表，不删行或伪造配置，并追加五项持久化失败后纳入最终联合回归。只将已合法的 exchange 模式改为 unknown-mode 的非法参数断言，没有删除失败用例或放宽确认。

E14 增加套装首次免费激活、品质成员门槛、精通等级/星数门槛、双成本、明确精通响应、兑换精确扣入与非目标状态；E20/E21/E23 增加零成本实体预留、磁盘失败零传输、收入不扩预算、UNKNOWN 重启与页面账号隔离。原五份未跟踪输入的 SHA256 与历史基线一致。未运行 R7、真实游戏或 R8，未 push/merge；Goal 保持 ACTIVE，R8 仍须在 R7 后由 Owner 单独授权。
### D.25 W12 同连接连续 VIP 等级权威与只读观察（2026-11-12）

父提交 `2097f7d362a17a6ec98205bd763d96baa9db1073`。在真实 GameClient 内用私有 WeakMap 跟踪当前连接的 VIP_LEVEL，实际调用链为 `readVipLevel → collectState.sessionFacts.vipLevel → pirateSweepView → summarize/formatState`，不是孤立工具。此基础与只读分支 EXISTING_FUNCTION、STATIC_VERIFIED、OFFLINE_VERIFIED、REAL_UNVERIFIED；W12/C151 仍 PARTIAL，没有增加扫荡写动作或把额度猜为已知。

固定 v76 的 ModelManager byte 4644292、更新方法 byte 4664885，模块 SHA256 `43daf7b7886502e2eb33949b2f552dd736da3f4ad34f10cedc391e9c5516be7e`；包/入口/协议指纹与前轮一致，详见 LIVE_VIP_LEVEL_EVIDENCE。Model 直接替换 VIP 字段，不支持把缺 vipLevel 的 push 当作保留旧等级。实际登录字段为 `LoginResponse.playerInfo.vip.vipLevel`，更正 D.22 的简写；本增量只证明等级，不声称 vipExp 或其他 VIP 信息完整。

登录锚点要求明确 own result=0、完整精确 playerId/worldId、own VIP 非负 int32 等级，以及构造者账号/代际、当前 connectionId/socket；明确零与 protobuf 原型默认零分开。锚定发生在 READY 发布前；有效有序 SCVipUpdate 在 message/pending 观察者前更新等级。缺/坏字段、无序 VIP 更新、序列缺口、解码失败或身份/连接变化永久使本次登录权威失效，后续推送不能自行续期，必须新登录；重复帧不污染当前等级。connect 起始和每个 terminal 清空，旧登录/旧 socket 回调不能污染新连接。没有登录上下文的旧客户端仍可使用原只读传输，但 VIP 为 UNKNOWN；不改变心跳阈值和普通传输序列行为。

收集器保持原 48 请求集合，不增 Vip 查询、信号或写请求。开始采集时捕获账号/代际/连接，全部读取结束后只调用一次当前等级读取，返回后再核同一上下文；期间发生切换则 UNKNOWN。导出统一标记 OBSERVED 和采集时间，表示历史显示数据，不能把缓存重新当成 live CURRENT；缺字段、继承字段、坏值、失败读取和旧 loginResponse 均不回填。CLI 明示“本次采集的连接观察值”，扫荡 total/remaining 仍为 null；下一次采集必须再次访问 live tracker。

启动前逐一 Test-Path 检查实际 51 文件：D.24 的 36 文件集合，追加 `tests/client-vip-facts.test.mjs`、`tests/client-lifecycle.test.mjs`、`tests/client-clock-facts.test.mjs`、`tests/client-unverified-write.test.mjs`、`tests/business-transport-freshness.test.mjs`、`tests/execution-lifecycle.test.mjs`、`tests/state-facts.test.mjs`、`tests/server-runtime.test.mjs`、`tests/explorer-api.test.mjs`、`tests/gameplay-locks.test.mjs`、`tests/gameplay-execution.test.mjs`、`tests/operations-api.test.mjs`、`tests/operation-recovery-api.test.mjs`、`tests/execution-memory-api.test.mjs`、`tests/stages-api.test.mjs`。随后一次 `node --test` 联合 **1122/1122 PASS，0 fail/cancelled/skipped/todo，21.28 秒**。17 项新真实 GameClient/Codec/合成 socket 测试、4 项只读消费者测试和四文件 65 项专项均与本次重叠，不累计。覆盖精确大 ID、显式零/缺字段、登录前后观察时序、VIP 更新与监听、缺口/重复/无序/解码失败、五种 terminal、拒绝重登、旧未完成登录回调、双账号和 actual client→48 查询采集→只读显示。根审查发现 ResendFailed/SCChannelExpired 原先先发布 message 再进入清理，已在发布前先使 VIP 失效，并测试监听器窗口直接读取也为 UNKNOWN。

下一步原范围不变：完整当前月卡与可信游戏日未闭合，总额、剩余、日额度预算、扫荡派发和复读仍待施工。静态核实月卡交付 push 仅有 endTime 无类型，不能局部猜更新；应使卡权威失效并显式重查，且防查询期间新交付覆盖。月卡到期需可信时间区间，-1 永久卡与跨到期边界分别处理。游戏计时器用 originLang，LoginRequest.language 是当前 UI lang，两者不等；native manifest、私有语言配置和正常 WeChat 默认路径也不能直接从当前 Session 反推，应先限定可信日策略来源，不把所有账号一律当 UTC+8。

补充 D.24 直接万能升星限制的进一步证据：Detail byte 248632–248828 只证明专属与万能合计足够；Util byte 302496 只返回总需求；StarUp body 无材料分配字段且无专用费用回执。物品 push 是最终余额、Model 直接替换，不能据此推断预授权扣款顺序，所以不假定 dedicated-first。未激活路径 byte 255741 只校验专属碎片，byte 256578 的 Activate 请求仅 id，开关不影响激活。独立兑换不能冒充此混合扣款合同完成。

E15 增加 VIP 等级权威/历史观察分离、推送断流与日策略未知；E23 增加重连与跨上下文隔离。原五份未跟踪资料保留。未执行 R7、真实游戏、R8、push 或 merge；总 Goal 继续 ACTIVE，R8 仍在 R7 后由 Owner 单独授权。

### D.26 W19 独立闯关逐场持久历史（2026-11-12）

基线 c2e4968。POST /api/stages/start 继续走原账号、授权、阵容和会话门禁，复用原 StageRunner 与唯一共享 ExecutionHistory；Operation/Workflow 路径不重复写历史。每场 ChallengeStageRequest 前同步持久化账号/世代/连接、关卡、序号及 DISPATCH_INTENT，原主线解析器确认该关、阵营和明确胜负后才保存结果并允许下一场。派发意图落盘失败时零请求；结果落盘失败、派发后取消或无法归属时停止后续请求并保留 UNKNOWN。重连和重启只读恢复，未决记录会阻止新的受控写操作；迟到响应不解除拦截，也不自动重发。已确认胜负且只缺批次终态时，只读恢复为已停止并保留逐场证据。

五文件联合测试：tests/stages.test.mjs、tests/stages-api.test.mjs、tests/stage-function.test.mjs、tests/execution-history.test.mjs、tests/operation-recovery-api.test.mjs，98/98 PASS，0 fail/cancelled/skipped/todo（6.25 秒）。全量离线 Node 测试及 29 组自检也由并行施工者运行通过；自检沿用素材未同步时的既有跳过条件。

W19 仍 PARTIAL：Loop/Tasks/Dailies 各入口的历史和拒绝记忆覆盖、可信冷却/日界策略、主线未决写的权威解除仍待施工。E20/E21/E23 增加逐场持久化、磁盘故障、取消和重启隔离。真实游戏仍 REAL_UNVERIFIED；原范围、R7/R8 状态与授权门禁不变。

### D.27 W12 可信配额、单目标扫荡及日常入口（2026-11-12）

父提交 60d08ba；D.22 与 D.25 的只读层之上新增 C151/P2-8 默认关闭的 pirate-sweep Function，复用同一 Operation/Workflow 授权、资源台账和执行历史。既有 48 项采集不加请求；CLI 和控制台概览展示已用、基础/VIP/有效月卡总额及可确认的剩余。日常 1010 指向同一页面，旧按任务差额批量截取的构造与派发均关闭，伪造旧计划零发送。D.22 中“C152 召唤”为笔误；C152 是 W13 钓鱼，未纳入此提交。

固定 v76 微信包及配置的哈希和源偏移见 PIRATE_QUOTA_EVIDENCE、LIVE_MONTH_CARD_EVIDENCE、PIRATE_SWEEP_OPERATION_EVIDENCE。MonthCardResponse 是当前连接有归属的完整替换列表；空列表保留为空，交付推送使旧列表失效，同一次调查中发生交付也不接受旧响应。使用 PirateParamCfg、当前 VIP 精确配置行、当前有效卡效果和匹配 Ping 的可信时间。跨到期、缺配置或 VIP 行（固定配置无 VIP0 行）、非当前连接、时钟变动等均不补默认。游戏日只在 v76 已知 +480/+540 两个策略对整个时间区间一致、且排除本地 reset 的 10.002 秒延迟区间时确认；该规则未证明服务器实际重置时刻，真实边界仍待 E15。

静态证据支持 PiratePop 的首杀等级门、低等级明示确认、精确 {uid,cityId} 与普通日额度。只生成并授权一个目标，消耗一个带游戏日标识的配额，预占该目标 UID，普通资源成本为空。独立复查身份、配置、剩余与目标到实际 socket 边界；D6 拒绝扩展字段与付费。无专用 typed 扫荡响应；仅当独立同日复读计数恰好加一、目标池和首杀记录保持一致、期间无相冲突的领域推送时确认这一计次效果。结果证据不足则 UNKNOWN、保留预占、停止且不重放。

验证在 NAS 直接运行 npm test 的两条 Node 命令：node src/selftest.mjs 29 组通过（原素材未同步检查按既有条件跳过）；node --test --test-reporter=spec 为 2505/2505 PASS、0 fail/cancelled/skipped/todo（25.74 秒）。包含本地真实 Codec 与合成 socket 的交付/超时/拒绝/重启、正式 OperationService 派发前磁盘预占及零重放、完整页面明确授权和账号切换。未连接真实游戏。

W12 仍 PARTIAL：E15 原定的“扣次且目标变化”双证据、目标删除归属、具体奖励归属和服务器日界仍未闭合；目标池变动或无效果保留 UNKNOWN，不能以计数替代这些证据。E15/E20/E21/E23 增加边界、预算与身份失效分支；R7/R8、E01–E24 及原工作包范围保持。此轮未 push/merge，R8 仍需 R7 后由 Owner 单独授权。

### D.28 W19 区分当前工作流与只读恢复记录（2026-11-12）

父提交 058445b。原 GET /api/workflows 会将当前 Runner 刚落盘的活动行显示为 RECOVERED_STOPPED。现在仅在服务器当前账号、世代、连接及持有运行的 Runner 全部匹配时保留该运行的活动历史状态；失去会话归属或新进程读取时才显示已恢复停止。读取不修改文件、不恢复运行或授权。联合 workflow、gameplay-api、execution-memory-api、operation-recovery-api 四套离线测试 56/56 PASS，0 fail/cancelled/skipped/todo（6.47 秒），覆盖真实 HTTP handler 的活动和失效对照、跨账号及新 Store 字节不变。旧 Loop/Tasks/Dailies 写入口仍禁用；新增业务须复用注册 Function、逐批授权和共享历史，W19 其余原 DoD 未完成。

并行静态复核确定 W13 下一安全切片为钓鱼图鉴的只读奖励资格。FishList byte 2642395/2642882、FishModel byte 2645932/2646114：FishEncyclopediaResponse 自有 fishList 与显式 rewardId，按 FishBaseCfg 已发现唯一鱼积分减去已领奖的 FishStageCfg 门槛，判断下一档。DrawFishRewardRequest 为空，typed DrawFishRewardResponse 提供 rewardId 与 DisplayAssetPackage；请求没有 stage 条件，外部客户端可能抢领并使下一档变化，写分支需单独解决这一授权边界。FishView byte 2663638/2664672：StartFishingResponse 的 fishId 只在临时 UI 状态；GainBigFishRequest 无鱼/任务 ID，对应异名 GainBigResponse（isNew/extReward），无恢复身份或过期权威读源。满仓门按 GameEffect ID 16 与 AllItem 的鱼库存校验。此段仅静态证据，未实现 W13，也不视为 E16 或 R7/R8 通过。
