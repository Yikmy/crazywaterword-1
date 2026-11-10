# PHASE 3 — Acceptance Record

日期：2026-11-11。工作分支：`codex/phase-3-advanced-gameplay`。本报告只说明离线实现及合成环境证据，不代表真实账号业务验收。

## 1. 阶段转换与基线

Owner 已批准 PHASE 2 通过并开始 PHASE 3，另已明确批准本阶段最小有限图 Workflow 方案。必须保留以下真实事实：

- PHASE 2 离线实现与测试已验收。
- 真实账号只读调查与建设预览通过。
- 居民订单、建筑升级、生产管理的真实写入链尚未完成完整验收。
- 已批准的单次建筑升级在派发前因 GameClient 心跳超时停止，业务写请求发送次数为 **0**。
- 本阶段没有将上述结果改写为真实写入成功。

起点 HEAD 为 `9d9706554d708f5fdef55b9f2d2137937d19d69d`。已核对 PHASE 1 `da41d1c`、PHASE 2 `972f81a` / `52b7824` / `9d97065`。原 main 保留 `61ce3c020ea8abedd9e70387c88528b6a8fe055b`。没有 reset、clean、强制覆盖或推送。

原始 Inventory、Master、blueprint、三维度表单、PHASE 2 真实 E2E 报告均保留为原有本地输入。三维度表单确认非空（15,208 字节）。根目录未发现 AGENTS.md / TREE.md，因此沿用现有 src/tests/docs 结构。

原 Master 的 PHASE 3 是 Formation & Battle Intelligence；本次 Owner 明确将联盟、博物馆、世界宝藏、舰队、海战规则与有限 Workflow 提前纳入本阶段。原历史阶段不改写，映射见 `PHASE_3_CAPABILITY_DELTA.md`。原先 `docs/baseline.md` 的规划材料在当前工作区文件名为 `docs/Master Development Plan.md`。

## 2. 实际完成范围与复用

| 模块 | 离线交付 | 复用 | 限定范围 |
| --- | --- | --- | --- |
| Formation | 当前阵容、模板解锁状态/布局、英雄与手动位置、职业重排、保存/复读、旧阵容恢复参数、历史 | GetFormation / MyFormationPreset / AllHero、客户端布局规则、同一 OperationService | presetId 仅表示布局；保留 petUid；不解锁/购买 |
| Battle Intelligence | 参战队伍/站位、伤害/存活、保守战败分类、候选推荐、已有逐场历史 | 已有 ChallengeStageResponse、StageRunner、BT_MAINLINE 证据 | 不加额外挑战；不默认换阵或继续 |
| Alliance | 请求/成员/本人求助、取消、领取互助、福利、订单适配与互助优先级/预算规则 | guildOrder / guildPack 的业务规则、已有查询 | 帮助/发起求助/订单/Fort 的缺失前提明确阻塞 |
| Museum | 展陈、关键词/展柜/展区升级、到期竣工、道具加速、收益/成就、探险出发/道具加速 | Museum 客户端调用链、MuseumInfo / AllHero / AllAntique | Complete/Reward 缺可辨认 pending 身份，保持阻塞 |
| Treasure | 状态、列表、指定 UID 排名/防守、舰队规划与派遣复读 | treasure.mjs survey/view/plan 的规则、MyFleets | SUCCESS 仅确认派遣，不代表掠夺胜利或领奖 |
| Fleet | 维修、停止维修、停止委任、移动、编队、货船装货/领奖 | FleetRepairParam、OnWater、同一阵容算法、tradePort 规则 | 城市移动仅是移动；持续自动战斗与三类舰队/货船加速均无可执行候选 |
| Naval Rules | 当前观察中心响应范围内的精确 ID 目标观察、优先顺序三值规则、规则轨迹 | WorldInfo / MyFleets / Boss 只读来源 | 无权威 attack/follow 结果身份时不生成写动作 |
| Workflow | 有限 DAG、规则/分支、等待/取消、图存取/模拟/运行/停止、ACTION 单次授权暂停 | OperationService、同一 Session 与 StageRunner、ExecutionHistory | 不执行 JS、不循环、不继承旧许可 |

业务 Function 可独立 Survey/View/Plan；具有可执行候选的 Function 经同一服务 Authorize/Execute/Verify，也可作为静态注册节点组合。只读及阻塞能力不计为完整写功能。业务适配器没有登录、客户端或独立写执行器。Stage 节点包装原账号 StageRunner，使用有限尝试/目标与墙钟截止。

## 3. Request / Response 与验证语义

`—` 表示没有在该业务路径使用可关联的同名 Response；走既有 sendWatch 后权威复读。观察窗口 resolve 永远不单独判定成功。

| Request | Response | 真正业务及验证 |
| --- | --- | --- |
| SaveFormation | SaveFormation | 完整主线阵容；响应和新 GetFormation 都匹配，包含 petUid |
| ChallengeStage | ChallengeStage | 原 BT_MAINLINE Runner 的逐场明确结果；有限节点核对完整 history/进度 |
| GuildAidHelp | — | 对已存在 reqId 的一件物品帮助，绑定 asker.playerId；配额/冷却未知阻塞 |
| CancelMyGuildAid | — | 取消本人未获帮助请求，排除自然到期造成的消失 |
| GotMyGuildAid | — | 领取已获帮助请求；原 ID 消失且对应库存增加 |
| FinishGuildOrder | FinishGuildOrder | 对 cityId 交联盟订单，扣料且同日计数增加；真实赛季未知阻塞 |
| GotGuildWelfarePack | GotGuildWelfarePack | 领取水位增加且正数奖励到账 |
| MuseumExhibit | — | AllAntique 归属、可展陈配置、唯一展柜分配，复读精确展柜 |
| MuseumUpgradeKeyword | — | 精确 keywordType 1..3 等级增加并扣配置材料 |
| MuseumUpgradeCase | — | 展柜等级增加或权威施工时间出现，并扣配置材料 |
| MuseumFinishCaseUpgrade | — | 到期展柜等级增加且施工时间清零 |
| MuseumSpeedUpCase | — | type=2、加速器精确数量；同展柜结束时间减少并扣道具 |
| MuseumUpgradeExhibition | — | 关键词前置与展区等级增加，并扣配置材料 |
| MuseumCollectRevenue | MuseumCollectRevenue | 待领收入归零，collected 与人气币到账相符 |
| MuseumClaimAchievement | — | 阈值进入已领集合且配置奖励到账 |
| MuseumStartExplore | MuseumStartExplore | 新探险、英雄/factor 身份、实际扣料 |
| MuseumSpeedUpExplore | MuseumSpeedUpExplore | 同探险时间减少，扣博物馆加速道具 |
| TreasureLootSendFleets | — | MyFleets 精确 buildingId 绑定 treasureLootUid，仅派遣确认 |
| RepairFleet | — | 服务端维修参数预算；精确舰队维修状态/耐久改变 |
| StopRepairing | — | 原维修且未委任舰队回到空闲，无付费 |
| SetFleetAutoFight | — | 仅 isOn=false 关闭既有委任；不授予持续战斗 |
| FleetSaveFormation | — | OnWater 中精确建筑 fleet.formation 完整复读，不使用 MyFleets 伪证据 |
| MoveFleetsToCity | — | 精确目标城市移动/到达字段；不代表宣战、攻击或胜利 |
| FillCargoShip | FillCargoShip | 原货格资产身份和 filled 改变，不购买缺料 |
| DrawShipReward | DrawShipReward | 精确到港货船状态消耗且奖励回包匹配 |

上表名称省略 Request / Response 后缀。实际编码仍使用完整现有类型。所有成本未知、目标变化、缺字段、账号代次变化、取消和未决响应都会停止；UNKNOWN 保留预算与指纹，不自动重试。

## 4. API、UI 与组合

- GET `/api/gameplay?account=<exactId>&module=<staticId>`：只读本地缓存、配置、状态、函数目录；不创建 Session，不连接。
- POST `/api/gameplay/survey`：显式只读采集，业务参数白名单。
- POST `/api/gameplay/config`：账号独立本地配置，默认关闭。
- 复用 `/api/operations/plan|authorize|execute|stop|history`：具体 actionId、planHash、资源预算、单次 permit。服务端不接收任意请求/body/成本。
- GET `/api/workflows` 与 POST `/api/workflows/save|simulate|start|resume|stop`：静态图校验/拓扑预览、后台有限调度和状态读取。
- 新窄路由复用同源 Host/Origin/CSRF 与精确账号检查；原通用 Web 游戏写白名单不扩大。

UI 有阵容、联盟、博物馆、世界寻宝、舰队、海战规则与工作流独立页。阵容页提供选中模板的只读网格布局、精确坐标与当前英雄标注、英雄与手动坐标；其他业务以独立开关、参数 JSON、权威状态详情、候选和具体成本/阻塞原因呈现。图编辑器提供节点/边、节点展示顺序、参数、条件分支、SVG、保存/加载、静态模拟、运行状态和停止。静态模拟只校验有限图与条件，不创建 Runtime，也不预测真实业务结果。账号 generation 守卫隔离 A→B→A 迟到响应；3 秒缓存轮询不覆盖本地配置草稿，不发起 Survey 或写请求。

工作流关系：阵容 ACTION → VERIFY → 有限主线 ACTION；主线 ACTION 内部已核对逐场完整历史与结束条件，也可手工追加 VERIFY 节点；舰队 Survey → 条件/规则 → 维修/移动 ACTION → VERIFY；联盟 Survey → 规则 → 帮助 ACTION → VERIFY。模板只引用已注册 Function，必须填入真实候选参数/ID。ACTION 每次停在具体计划，不自动 authorize/execute；resume 仅接受同批次 SUCCESS 且所有 action CONFIRMED 的既有历史。

## 5. 配置与预算

每个静态模块的 defaultConfig、参数校验与配置校验器构成配置权威契约；简单开关由共享配置校验，复杂业务由模块 validateConfig 继续严格校验，GET 返回当前账号完整契约。所有 enabled 与子域写开关默认 false，未知字段拒绝。

- Formation：enabled/mainlineEnabled；业务参数 presetId、heroIds 或 heroPositions；不接受调用者 petUid。
- Alliance：精确成员/物品、优先顺序、安全库存、每日总数/物品预算、每计划上限；可信配额/冷却/日用量不能由参数伪造。
- Museum：展陈/收益/探险及升级/竣工/加速独立开关，道具数量、最低收益、安全库存、每计划上限。
- Treasure/Fleet：颜色、舰队数、最低耐久、安全油量、场景及各动作开关；维修单价/时间取 FleetRepairParam。repairBelowDurabilityRatio 默认0.8，repairMode 仅 IMMEDIATE / WAIT_NATURAL，maximumRepairPetrolPerPlan 默认0（需明确设置，最大1e9），repairPriorityBuildingIds 为唯一精确舰队 ID。低于阈值且即时模式才规划维修；优先级只排列已选择候选，同时受专用累计汽油预算和共享账本限制。自然等待不承诺恢复时间；停止维修需另一次明确授权。维修、移动和世界宝藏派舰还要求权威 autoFight.isOn=false，开启或缺失一律阻塞。
- Naval：有序规则仅支持固定类型和标量值，缺字段为 UNKNOWN；真实玩家 ID 不由昵称推断。观察参数为 playerId/targetId/excludeGuildIds/cityIds/minimumPower/maximumPower/screenCenter；保留 int64 精度，仅针对本次观察中心响应范围。
- Stage Function：默认关闭；每个节点有完整 Stage config，maxAttempts≤200，或有限 maxStage 加 stopOnDefeat；有墙钟截止。
- Workflow：version=1，最多50节点/100边/200步骤；单 WAIT≤60秒；DAG，不开放 JavaScript。

所有成本由服务端事实/静态配置/客户端确证无消耗路径产生。计划共享 ResourceLedger，执行前复读库存，整个批次预算不会因后续库存查询而补充。免费道具仍明确扣预算。D6 继续硬拒绝 RUBY、钻石修理/加速/购买；allowPaid 和 UI 开关不能解除。未知费用不执行。

## 6. 剩余缺口与真实验证

- 联盟：帮助每日次数/冷却、可信日用量来源；发起求助冷却；订单赛季来源；Fort 独立捐赠适配。不能宣称指定成员任意物资转移或自动求助已可执行。
- Museum：Complete 与 Reward 的独立 pending 身份尚不足；不以 typed response 或探险到期冒充结算/领奖成功。
- Treasure：当前只允许满足赛季/限额/油量/耐久及无人防守条件的派遣；不实现争夺胜负、完整排名奖励领取。
- Fleet/Naval：敌对城市移动所需地图几何/成本不完整时阻塞；非零宠物舰队绑定缺少业务证据；真实宣战/攻城最终结果、跨视野持续目标定位/自动跟随、持续委任预算没有完整证据。规则只对当前 WorldInfoResponse 范围求值，不是持续后台监视器。
- Fleet SpeedUpPolicy：当前未提供已证实的免费道具行军/维修加速执行；speedUp 开关不能生成付费动作。按剩余秒数自动加速与实时维修中断仍需明确道具路径/权威状态及外层有限工作流条件，不宣称自治策略已全部实现。
- 付费维修与加速按 D6 保持禁止；非主线战斗仍 SIDE_UNVERIFIED。
- Workflow：持久化中的活动历史重启后展示 RECOVERED_STOPPED、resumable=false，不恢复执行；需重新显式启动与逐批授权。
- 所有新增游戏写 Function 均只完成离线与合成验证，真实账号目标状态、成本、服务端限额/推送和节奏仍需未来单独授权验证。
- 不连接真实游戏、不读真实凭证、不修改代理/CA、不执行真实业务写入。

停止只阻止后续节点/请求；已发出的业务请求不可撤销，必须保留 UNKNOWN 与预算。同一当前阵容可使用明确 presetId 加完整 heroPositions 重新应用，仍需新计划授权、typed回复与权威复读；不自动重试。主线启用 formation 时要求先通过具体保存计划授权及复读；启动前再复读，不隐式代替用户保存。

后续阶段依赖是上述权威语义/状态字段和 Owner 单独授权的真实环境验收。不能为了填满功能清单而用不确定语义派发。本阶段结束后等待 Owner 验收，不自动进入 PHASE 4。

## 6.1 参考与客户端证据

本地参考仓库 C:/Users/zyk-o/Documents/crazywaterword 的检查点为 6c2825a。src/dailies.mjs:396 的 DAILY_DRIVERS[1016] 只注册 MuseumInfo 探测；:401 的 lockedReason 仅检查任务进度，未完成即固定 blocked，不使用 MuseumInfo 内容；:414 的 surveyDailies/fetchProbe 负责查询。tools/probe-dailies.mjs:23 也仅列出探测。本阶段没有运行该联网探测脚本。已证实的问题是静态阻塞占位和缺少完整业务 Function，不能据此认定查询协议失效。

本地参考的 src/docs/tools 未找到 Museum 专用 Function；其 Git remote 身份未确认属于 xutongxue233，因此没有声称审计或修复了该作者全部旧接口。本次禁止联网，未抓取身份不明的远程版本；这一比较保留为资料缺口。

已缓存客户端 v76 的静态包 SHA-256 为 a6046fcc2ad7a3424282e9f8b51073656f5ae8d48742129743560bf958266c54。按模块在内存中核对，无复制完整客户端：FormationBase:1239、WorldFleetFormationView:3585、ArmyPop:179、TroopAppointPop:3319、TreasureLootPop:3281、WorldJump:3605、GuildHelp:1455–1459；MuseumModel:2207、MuseumUtil:2225、BuildTeamPop:439、SpeedPop:2949、MusuemUpgradePop:2247、MusuemLevelUpPop:2243、UpgradeBoothPop:3411、MuseumBoothView:2187、SpeedUpPop:2953、MuseumRecruitTaskItem:2219。

Museum Complete 调用来自 MapPointPop:2031 / MuseumExplorationView:2193，结算回包包含 grade/progressGain/fixedReward/randomReward；OverPop:2367 再独立调用 MuseumReward。客户端证明这是两个动作，但当前只读状态不足以可靠恢复待领取身份，所以没有伪造完整闭环。缺少同名 Response 的其他 Request 使用共享 watch + 权威复读，不等于接口坏掉。

Formation、Guild、Treasure、Fleet 只逐模块提取现有 Function 合同、配置算法和业务规则；没有复制参考 server/client。新增 Function 的权威清单见 PHASE_3_CAPABILITY_DELTA.md。

## 7. 最终验证、文件与提交

最终全量结果：**845 / 845 Node 测试通过，0失败、0跳过、0取消；29组selftest通过。** 原基线609项Node测试保留且未改删，新增236项。测试使用临时隔离CW_DATA_DIR、显式合成存储、假客户端、内存帧及回环HTTP；没有真实游戏连接或业务写入。

执行命令等价于package测试入口：PowerShell切换到仓库后，设置CW_DATA_DIR指向TEMP/cw-phase3-offline-baseline/isolated-data，运行 node src/selftest.mjs 与 node --test。UNC下直接调用Node，避免npm经CMD丢失工作目录。最终原始日志在本机TEMP/cw-phase3-offline-baseline/phase3-final-regression.log。可选素材检查因未运行sync-art而跳过；本阶段未下载或同步素材。

| 新测试文件 | 新增测试数 |
| --- | ---: |
| formation.test.mjs | 26 |
| alliance.test.mjs | 21 |
| museum.test.mjs | 27 |
| treasure.test.mjs | 11 |
| fleet.test.mjs | 25 |
| naval-rules.test.mjs / naval-protocol.test.mjs | 14 / 5 |
| gameplay-settings.test.mjs | 5 |
| gameplay-execution.test.mjs / gameplay-locks.test.mjs | 12 / 4 |
| stages-formation.test.mjs / stage-function.test.mjs | 10 / 16 |
| workflow.test.mjs | 23 |
| gameplay-api.test.mjs / gameplay-view.test.mjs | 13 / 24 |
| 合计 | 236 |

覆盖正常/字段缺失与无效、成本未知、库存不足、累计预算、重复选择/单次permit、目标变更、配置变化、账号代次、取消、超时、UNKNOWN、RATE_LIMITED、迟到响应、异常退出恢复；真实本地Protobuf编解码覆盖目标请求及权威复读字段。API验证同源/CSRF/精确账号；UI验证A→B→A、草稿/候选/计划保留、Workflow自身锁恢复、阵型布局预览。原功能全部参与最终全量回归。

最终审查关闭的可复现问题：Stage停止/配置变化与首场回包同tick时不得继续派发；重连不得引用旧Runner进度；旧generation任务不得释放新锁；旧Workflow释放不得删除新计划；STOP后晚Survey/Plan不得恢复缓存；disconnect须同步废止旧owner；主线阵容await后重新检查代次/互斥/未决状态；自动委任开启或未知时不得手动维修/移动/宝藏派舰。原Stage错误分类及重连行为的旧测试保持通过。

### 修改文件

以下均相对仓库根目录；未建立重复server/client/actions/workflow目录。

- 业务新增：src/formation.mjs、src/alliance.mjs、src/museum.mjs、src/treasure.mjs、src/fleet.mjs、src/naval-rules.mjs。
- 共享新增：src/business-functions.mjs、src/function-registry.mjs、src/gameplay-settings.mjs、src/naval-facts.mjs、src/stage-function.mjs、src/workflow.mjs、src/gameplay-page.mjs。
- 既有扩展：src/actions.mjs（仅D6已知业务语义，非通用Web白名单）、src/operation-service.mjs、src/stages.mjs、src/server.mjs、src/page.mjs。GameClient、Session基础、Snapshot与原协议编解码未重写。
- 测试：上表15个tests文件，均为新增，原测试无改删。
- 文档：README.md、docs/PHASE_3_ACCEPTANCE.md、docs/PHASE_3_CAPABILITY_DELTA.md。原Inventory/规划/表单/真实E2E输入未覆盖、未混入代码提交。

### Git提交

| 提交 | 内容 |
| --- | --- |
| c22d3f7 | formation：完整布局校验与实际主线战报分析 |
| 7e147bc | alliance：精确身份互助规则与领取验证 |
| e7f79e8 | museum：展陈/收益/探险离线适配 |
| 4b3fded | shared：严格账号设置和权威舰队事实 |
| 0db2187 | treasure：派舰规划与精确目标复读 |
| 3dbd4d6 | fleet：维修/移动/编队/货船 |
| 378d975 | naval rules：精确ID观察及有序三值规则 |
| 19ba83a | runtime：原OperationService与有限Stage复用 |
| 7717e6b | workflow：有限图与具体授权/历史确认 |
| 09084fe | fleet safety：委任隔离与维修策略预算 |
| f0bd3eb | formation：明确完整当前阵容重应用 |
| 86b43ab | UI：独立玩法页与有限图编辑器 |
| f300a35 | API：窄路由、账号门控、主线等待竞态复核 |
| 本报告所在最终文档提交 | README与两份PHASE 3报告；哈希由最终交付消息列出 |

所有提交都在codex/phase-3-advanced-gameplay，不推送，不修改main。提交均逐文件暂存、检查cached diff与diff --check；暂存清单未包含data/work/E2E原始材料或凭证。Git最终只留下原先未跟踪的输入资料。已停止，等待Owner验收，不自动进入PHASE 4。
