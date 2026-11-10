# PHASE 3 Capability Delta（原规划映射与实施结果）

日期：2026-11-11；起点 codex/phase-2-order-world-execution@9d9706554d708f5fdef55b9f2d2137937d19d69d；工作分支 codex/phase-3-advanced-gameplay。

Owner 明确决定 PHASE 2 通过并进入 PHASE 3。保留原事实：离线实现/测试已验收；真实只读调查与建设预览通过；订单/建筑/生产真实写入未完成；已批准升级在派发前因心跳超时停止，业务写发送次数为0。这个风险不阻断本阶段，也不触发重写。

## 原始规划与本次增量

Master docs/Master Development Plan.md:676–775（原 docs/baseline.md） 原 PHASE 3 是 Formation & Battle Intelligence：C207/C211–214 阵容、C206–208实际战斗分析、C209/C215推荐换阵。保留这些目标。当前用户明确将 Alliance、Museum、Treasure、Fleet、Naval Rules 和最小 Workflow 提前纳入本阶段；它们在原 Master 的后续阶段保持原文，不回写历史规划。

| 顺序 | 模块 | 映射 | 接入原则 |
| --- | --- | --- | --- |
| 3.1 | Formation/Battle Intelligence | FRM001–008/C206–215 | SaveFormation全量布局/英雄/pet；模板不是队伍；复用Stage实际响应分析 |
| 3.2 | Alliance | PRO001/002/C301–307 | reqId绑定成员，互助物资与DonateFort区分，次数/成本未知阻断 |
| 3.3 | Museum | PRO006/C141–144 | 展陈/收益/探险独立，Complete与Reward分开 |
| 3.4 | Treasure | PRO009 | 世界宝藏独立于Museum，派舰后权威MyFleets复读 |
| 3.5 | Fleet | PRO003/C401–408 | Repair服务端参数，Move仅移动；钻石加速硬拒绝 |
| 3.6 | Naval Rules | C403–410 | 真实ID与可靠状态、有序三值规则；未证实攻城/跟随保持缺口 |
| 3.7 | Workflow | C601–607/P7 | 最小有限图编排，不能绕过OperationService |

## 共享契约与影响评估

实施前基线的 OperationService 固定 orders/city。本阶段已增加静态模块适配表，契约 survey/view/plan/verify，仍由同一个 OperationService 保存计划/授权/预算/执行历史并拥有Session互斥。新增公共执行适配只组合已有 assertExecutionActive、ResourceLedger、validateResources、request/sendWatch 和 fingerprint 确认；不复制客户端，不从Web接收request/body。旧订单/城市契约保持。

Workflow最小方案：新增受限、有限节点图解释器与账号级本地文档；节点只有START/SURVEY/CONDITION/RULE/ACTION/WAIT/VERIFY/BRANCH/STOP，不允许JS、任意请求或无限图循环。ACTION只引用静态注册Function，并提交同一个OperationService生成的具体计划；授权绑定原有action/hash/budget。动态状态变化后停在重新规划/待授权，不继承旧许可。等待可取消；所有账号锁、UNKNOWN恢复和历史沿用既有基础。

影响：仅扩展OperationService adapter hook，server独立窄路由、现有page独立页签和受限图编辑器；Stage前置阵容应用在同Session锁内，经OperationService验证完成后才能启动原Runner。48项Snapshot、GameClient、账号存储、现有Action入口、D6、BT_MAINLINE LEFT证据范围保持。编排器涉及新的调度状态，本方案和影响评估已提交，Owner 明确答复“同意最小有限图方案”后实施；未扩大到通用脚本或无限循环。

## 治理与验证

根目录未发现AGENTS.md/TREE.md；沿用src/tests/docs，不建第二server/client目录。基线29组selftest和609项Node测试已通过（临时隔离CW_DATA_DIR，UNC由PowerShell直接执行等价命令）。新增模块逐项合成测试与真实Protobuf往返，未知/取消/超时/历史恢复/账号隔离/D6与原测试全回归。用户本阶段禁止真实连接、凭证读取、代理/CA和真实业务写入。

本文件作为原 Inventory 的实施增量，原始本地 Inventory 不覆盖。完整请求/响应、API/UI、配置、预算、最终测试及提交记录见 PHASE_3_ACCEPTANCE.md；不可验证语义不计为完整执行。

## 最终能力变化

| Inventory / 原规划 | 本阶段变化 | 最终范围 |
| --- | --- | --- |
| FRM-001/002 | 读取→独立页面及布局预览 | 当前阵容、模板解锁状态、英雄/站位、原宠物UID |
| FRM-003/004/006 | PROTOCOL_ONLY→离线受控执行 | 复用SaveFormation完整保存更换上下阵英雄和站位，typed回复+GetFormation复读 |
| FRM-005 | 保留未执行 | 不自动解锁、不购买图纸 |
| FRM-007 | 保留未实现 | presetId不是完整队伍存档；未额外提供具名多队本地存档 |
| FRM-008 / C206–215 | 新组合与真实战报分析 | 保存授权→复读→原StageRunner；推荐需新授权，不自动换阵/续跑 |
| PRO-001 | 保持原阶段边界 | Inventory该ID实际为公会科技，非互助；本任务未要求科技升级/重置 |
| PRO-002 | 只读→部分执行/规则 | 取消本人未受助请求、领取互助/福利；Help/Ask/订单/Fort仍有可信限额/冷却/赛季等阻塞 |
| PRO-006 | 探测占位→三个独立域的部分执行 | 展陈/升级/收益/出发及已知道具加速；Complete/Reward pending身份缺失 |
| PRO-009 | 协议→状态/规划/无争夺派舰 | 读排名/防守；MyFleets绑定确认派遣，不称胜利/领奖 |
| PRO-003 | 读取→受控维修/编队/移动/停止 | 修理预算/阈值/优先级、仅友方或已知精确成本移动；autoFight仅关闭，不开启持续委任 |
| PRO-004 | 读取→货船装货/到港领奖 | 不购买缺料；加速无可执行候选 |
| PRO-005 | 保留只读阻塞 | Boss不能继承主线LEFT证据，不新增实战写入口 |
| BIZ-R02/R03/R12 | 只提取共享Fleet/目标规则 | 雷达领奖/派舰、海盗派舰/扫荡、城战在线奖不计本次完整执行；未猜宣战/攻城请求 |
| Naval目标规则 | 新三值规则/观察筛选 | 精确玩家ID/排除联盟/城市/战力范围；仅当前WorldInfo响应，无持续跨视野监听/自动跟随 |
| Workflow C601–607 | 单模块→有限图基础 | 有序条件与分支、有限等待、具体ACTION授权暂停、历史确认、静态图模拟、可视编辑 |

## 复用与新增Function

公共连接、协议编解码、Session代次、Snapshot/Explorer、资源账本、历史、取消与结果分类继续复用。没有第二套登录/客户端/任意Web写入口。参考逐模块提取 guildOrder/guildPack、treasure、tradePort/cityWar 等已有Function的业务规则与成本算法；共享执行统一落入原 OperationService。

| 实现文件 | 新增公开Function / 静态模块 | 复用重点 |
| --- | --- | --- |
| formation.mjs | surveyFormation/viewFormation/planFormation/verifyFormation、battleAnalysis/recommendFormations、formationModule | 现有GetFormation/MyFormationPreset/AllHero/ChallengeStage响应、客户端重排算法 |
| alliance.mjs | surveyAlliance/allianceView/planAlliance/verifyAlliance/allianceHelpRules、allianceModule | 公会既有读协议、参考订单/福利规则 |
| museum.mjs | surveyMuseum/museumView/planMuseum/verifyMuseum、museumModule | MuseumInfo/AllHero/AllAntique、本地配置与客户端证据 |
| treasure.mjs | surveyTreasure/treasureView/planTreasure/verifyTreasure、treasureModule | Stats/List/Rank/Defence/MyFleets、开服/限额/油耗规则 |
| fleet.mjs | surveyFleet/fleetView/planFleet/verifyFleet、fleetModule | FleetRepairParam、OnWater、Formation校验器、共享资源账本 |
| naval-rules.mjs | surveyNaval/navalView/planNaval/evaluateNavalRules、navalModule | WorldInfo/MyFleets/Boss只读事实；无写动作 |
| business-functions.mjs / function-registry.mjs | executeBusinessOperation/listBusinessFunctions、静态GAMEPLAY_MODULES | request/sendWatch、ResourceLedger、assertPaymentAllowed、原执行生命周期 |
| stage-function.mjs / stages.mjs | createStageFunction、defaultStageFormationConfig；扩展原createStageRunner | 有界Function包装原Runner，无第二战斗执行器 |
| workflow.mjs | validateWorkflow/evaluateWorkflowCondition/simulateWorkflow/createWorkflowRunner/createWorkflowStore/exampleWorkflows | 原OperationService计划/授权/历史、原Session互斥 |
| gameplay-settings.mjs / naval-facts.mjs | createModuleSettings/validateModuleConfig与共享事实校验 | 账号独立原子设置、统一库存及舰队事实 |

业务Function导出defaultConfig与严格参数/配置校验；写开关默认关闭。RepairPolicy默认专用预算0，必须明确设置。成本未知、自动委任开启/未知、状态变化或UNKNOWN阻塞；所有付费及RUBY继续由D6硬拒绝。Fleet speedUp策略无可执行免费路径，配置开启不代表支持。

图编辑器为字段/连线编辑加SVG预览，执行次序由边决定；不是任意脚本。静态模拟不调用业务Survey、不模拟资源或胜负，条件可UNKNOWN。运行到ACTION只生成当前具体计划；每批需人工单次授权，SUCCESS且CONFIRMED历史才继续。STOP阻止后续节点，已派发动作不可撤销。重启活动历史为RECOVERED_STOPPED，不自动续跑。

## 资料缺口与后续依赖

本地参考6c2825a的Museum每日驱动为固定blocked占位；未取得可确认身份的xutongxue233旧版本，不能宣称其协议全部失效/已修复。详细客户端调用证据与当前Complete/Reward阻断见验收报告。

所有新增业务只完成离线/合成验证。真实限额/推送/节奏、真实账户写闭环、地图几何成本、结算pending身份、真实攻城及持续目标定位仍依赖后续证据和Owner单独授权。本阶段不联网验证、不进入PHASE 4。

最终验证：845/845 Node测试、29组selftest通过；基线609项保留且未改删，新增236项。完整文件与13个实现/安全/UI/API提交及最终文档提交说明见 PHASE_3_ACCEPTANCE.md §7。分支 codex/phase-3-advanced-gameplay，未推送，原main不变。
