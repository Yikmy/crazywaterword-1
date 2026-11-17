# PHASE 2 Real Account E2E Acceptance

日期：2026-11-11（Asia/Shanghai）。**本次真实验收已按异常停止规则结束：只读调查与建设预览通过；用户批准后的新鲜复查发生 ping timeout，升级未派发。真实写入验收未完成，未进入 PHASE 3。**

## A. 基线、账号与运行环境

- 仓库：//zhangnas/app/crazywaterword。分支 codex/phase-2-order-world-execution，HEAD 9d9706554d708f5fdef55b9f2d2137937d19d69d。PHASE 1 da41d1c 以及 PHASE 2 972f81a、52b7824、9d97065 保留；本次无 commit/push/reset/clean/rebase。
- 已完整复读 PHASE 1/PHASE 2 验收、Delta、Inventory、baseline、README，核对 9 个 operations 路由、4 个页面入口及执行适配器。三维度表单重新确认为 15,208 字节、209 行。原四份未跟踪输入不变。见 [文档审计](../work/e2e/phase2-real/20261111-003037-f6b66ad6/document-audit.json)。
- 复用现有 pickAccount(loadStore()) 选中账号 **c06a…3547**。精确账号 SHA-256：70ba7a304f4690452d561251f7b6b1c64338f2e4f8d775c3a4232a48919227b3；本地 id 与凭证 openId 一致，服务端 PlayerInfo 身份哈希及保存的昵称/区服匹配，角色等级17。未读取或导出原始登录帧，未输出 Token/Sign/Cookie。
- 全程最多一个并发 GameClient：只读阶段一次连接，结束关闭后，因用户具体批准而建立一次串行新连接；两次均 LoginResponse.result=0、READY、generation=1。获批后的连接不是失败重试；异常发生后未再重连或重发。另有一次零 GameClient 的 Console 权限预检，已关闭。
- 所有 Console 仅绑定127.0.0.1：预检56104、只读53323、获批验证50264；未开放外网/LAN。连接前无历史 UNKNOWN、Stage/Loop/其他批次/完整采集或未决写。仅验证无互斥任务的前置检查，没有制造真实竞争场景。
- 新 Session 无既有 Snapshot，使用现有 PHASE 2 五查询 Survey；未进行48项完整刷新，不据此声称完整 Snapshot 页面联动已通过。复用 createConsole/GameClient/Session/ResourceLedger/Operation Service/Survey/Plan，产品代码与测试均未改。

## B. 三模块只读调查

调查时间 2026-11-10T16:41:03.434Z。第一连接的调查与预览分别复用五项查询，共 **10/10 SUCCESS**。权威业务字段投影见 [源证据](../work/e2e/phase2-real/20261111-003037-f6b66ad6/business-source-evidence.json)，状态与候选见 [完整调查](../work/e2e/phase2-real/20261111-003037-f6b66ad6/read-only-survey.json)。

| 模块 | 数据读取 | 数据可靠性 | 本次允许条件下的候选 |
| --- | --- | --- | --- |
| 居民订单 | 4条；数组实际存在、需求/身份/库存及完成计数已读，计数为0 | 读取PASS；策略判断SKIPPED/NEEDS_REVIEW | 0可提交；规则禁用 |
| 城市建设 | 46栋建筑、46栋基础状态可靠；等级、条件、成本、余额与槽位已读 | PASS；未知成本仍为null | 3普通升级、0建造 |
| 生产管理 | 10家工厂，队列/剩余时间/成品/配方/总槽位与空位已读 | PASS；缺口reliable=true | 0策略合格候选：策略禁用且缺口0 |

现有cityView共有19个潜在动作（3升级、13排产、3收取），不能等同于本任务允许执行19项。每个潜在候选的 actionId、目标、前态/预期状态、资源、成本来源、单独预算及前置条件见 [候选预览明细](../work/e2e/phase2-real/20261111-003037-f6b66ad6/candidate-previews.md)。

### 居民订单

订单规则来自 default，enabled=false。每单 ruleResults=[]、inventory=SKIPPED，现有规则返回NEEDS_REVIEW；没有把禁用规则伪报为PASS。下列需求库存事实可靠，但不绕过规则提交。

| index | 精确身份SHA-256 | 需求 / 库存 | 配置可确认EXP | 决策 |
| --- | --- | --- | --- | --- |
| 1 | `dad7dc393101c1fd72dfe412c23d9b483c52d1740fb4fd4be4d9593667419f01` | 刺身拼盘 1 / 3；淡水 2 / 23；烤鱼 2 / 50 | 115 | NEEDS_REVIEW |
| 2 | `a8de9d7eefd3530af19c772ef76d11bf7670a9b64a4b3ad3ac8379f69c292c61` | 刺身拼盘 1 / 3；烤鱼 1 / 50 | 59 | NEEDS_REVIEW |
| 3 | `039fab4308ae1adae183a428bab97ea356677380cd9ce92463935dbf5aad8276` | 日用品 2 / 7；生鱼片 2 / 50 | 94 | NEEDS_REVIEW |
| 4 | `0a9b1b41ffd83cbc858ce8e00c47ba7d8eac1571b924873f4dfaf780980a646f` | 布匹 1 / 48；长绳 1 / 10 | 123 | NEEDS_REVIEW |

EXP来自现有配置计算；金币奖励未知，不伪造MIN_GOLD。订单数组确实存在，未把缺失数组当空。REFRESH免费次数、冷却和允许证据不足，refreshEligibility=null；本次没有刷新。

### 城市建设与生产

3个普通升级候选：切鱼厂、材料厂、服装厂；选中金币成本最低的切鱼厂。只用现有buildingId与配置，未知成本保留null。

生产实际账号配置为 version=1、enabled=false、onlyShortages=true、productIds=[]、maxOperations=10；未修改策略。7种订单物品均被库存覆盖，missing全部0，在产/已完成抵扣均0，不为制造写入结果强制排产。13个配方候选没有通过本任务的策略/缺口要求；收取须独立授权，本次未申请。

## C. 阶段判定

| 模块 | READ_ONLY_PASS | PREVIEW_PASS | AUTHORIZED | DISPATCHED | CONFIRMED | UNKNOWN | NOT_EXECUTED |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 居民订单 | 是 | 无符合规则的提交计划 | 否 | 否 | 否 | 无业务写UNKNOWN | 未尝试写入 |
| 城市建设 | 是，首轮 | 是，首轮一次升级预览 | 人工批准已收到；API authorize未到达 | 否，0次 | 否 | 连接心跳异常；无业务写UNKNOWN | 升级未派发，无执行run |
| 生产管理 | 是 | 无符合策略/缺口的启动计划 | 否 | 否 | 否 | 无业务写UNKNOWN | 未尝试写入 |

人工批准和服务端授权阶段分开记录：用户明确批准了下列具体操作，但新连接的只读复查先失败，未调用authorize/execute、未取得permit、未生成runId，不能声称Operation Service授权链已真实通过。

## D. 获批升级预览与实际停止结果

| 项目 | 内容 |
| --- | --- |
| 账号 | c06a…3547；精确身份哈希见A |
| 操作/目标 | Manual单次普通升级，buildingId=1切鱼厂，2→3级 |
| actionId | city:upgrade:1%E5%88%87%E9%B1%BC%E5%8E%82 |
| 获批前态 | level=2，buildStartTime=0，buildFinishTime=0，队列/成品为空 |
| 预期状态 | 进入建设或等级至少3；配置工期6900秒（1小时55分） |
| 精确成本/预算 | GOLD2300、建筑蓝图9、粗铁5 |
| 原调查库存 | GOLD615857、蓝图138、粗铁7；不将旧库存当作执行时余额 |
| 成本来源/条件 | 现有BuildingUpgradeCfg，切鱼厂level3；角色≥15、人口≥90；consume明确，非钻石 |
| 风险 | 消耗上述材料，粗铁按原库存预计余2；工厂进入建设等待；不加速 |
| 原batchId | 2fc110ed-429c-4571-964b-a468aef7ad7f |
| 原planHash | bd1a304f638ae90cbf9750791e738aee837b2555d014e8a5f10f92bab92cb109 |
| 人工授权 | 已收到“批准上述单次升级及精确消耗”，证据独立保存 |
| 新计划/API授权 | 尚未生成：新连接首次Survey即因心跳失败中止 |
| 请求类型 | UpgradeBuildingRequest，body={buildingId:1切鱼厂}；**未发送** |
| 派发尝试 / sendWatch | 0 / 0 |
| 实际资源消耗 | 未派发该操作，无该操作导致的扣费；没有后续权威余额读数，不能据此宣称整个账号余额始终未变 |
| 业务服务端响应/写后复读 | 无，未到达业务写入 |
| 最终历史 | runs=[]，无runId，无未决写指纹，原execution-history文件仍不存在 |

预览见 [原计划](../work/e2e/phase2-real/20261111-003037-f6b66ad6/preview-city.json)、[成本来源](../work/e2e/phase2-real/20261111-003037-f6b66ad6/preview-cost-source.json)、[人工批准](../work/e2e/phase2-real/20261111-003037-f6b66ad6/human-approval-record.json)。原Console已关闭，原计划过期；它不能被复用执行。

2026-11-10T16:59:49.436Z（上海时间2026-11-11 00:59:49.436），第二串行连接进入READY后，现有GameClient触发 **ping timeout**，state READY→FAILED。首Ping在2026-11-10T16:59:48.331Z发送；约1105ms后触发现有1000ms PING_TIMEOUT_MS。OnWaterRequest当时仍pending，其失败由连接终止导致；不是已证实的OnWater请求超时。

证据只显示Login/Ping/OnWater三个出站帧，无Pong或OnWater响应被处理。无法仅凭该样本区分网络/服务器延迟和本地事件循环停顿，**不判定凭证失效或服务端拒绝，不调大超时、不改登录链、不自动重连/重试**。

脱敏首错保留最先发生的pingTimeout及堆栈，后续CANCELLED不覆盖它。见 [首错](../work/e2e/phase2-real/20261111-003037-f6b66ad6/authorized-upgrade/first-failure.json)、[传输记录](../work/e2e/phase2-real/20261111-003037-f6b66ad6/authorized-upgrade/transport-summary.json)、[停止检查](../work/e2e/phase2-real/20261111-003037-f6b66ad6/authorized-validation.json)。用户要求任何超时即停止，本次因此结束；未以删除历史或UNKNOWN解除阻断。

## E. 历史、日报及文件写保护

起止历史API均runs=[]；执行history没有生成或删除。生产日报日期2026-11-11、Asia/Shanghai、coverage=tool-verified-only、totalGameProduction=null，startedOperations=0、collectedOperations=0。无真实SUCCESS+CONFIRMED事件，不能验证真实历史持久化、账号隔离、页面显示和生产事件聚合。

第一只读进程用Node permission model仅允许本机TEMP证据写入，拒绝账号元数据回填。Windows UNC窄目录写授权实测存在问题；获批验证改用受信任单进程fs写入口保护，在导入server前安装，允许TEMP证据及原路径history的独占临时文件→fsync→rename，拒绝账号/策略其他写入；**它不是OS级沙箱**。实际history仍使用原默认实现与原默认路径，没有换为fixture。

[32项独立fixture测试](../work/e2e/phase2-real/20261111-003037-f6b66ad6/file-write-guard-test.json)全部通过，包含现有createExecutionHistory原子序列和账号写入拒绝。真实获批运行的accounts.json.tmp回填被阻止；本次未到execute，因此真实history写路径仍未实测。该保护没有改变业务逻辑、预算、协议、鉴权或心跳超时。

## F. 清理、Git与验证

- 两次业务连接均已关闭，所有Console停止，Operation Service停止，无Stage/Loop；socket、tick/ack计时器、pending/watchers、Session、监听器全部清空。异常前没有业务写指纹，异常后也没有；无需释放/删除保留预算或历史。
- 三个本次Console PID均退出，56104/53323/50264与17321/17322无遗留监听；无本仓库node进程。见 [进程检查](../work/e2e/phase2-real/20261111-003037-f6b66ad6/authorized-process-after.json)、[清理证据](../work/e2e/phase2-real/20261111-003037-f6b66ad6/authorized-upgrade/cleanup.json)。
- 代理仍为开始时的启用状态；完整值/类型/存在性摘要及备份一致。既有公有CA指纹及CurrentUser Root ABSENT结果一致；无安装/卸载/证书库修改；抓包journal/lock起止均不存在。
- accounts.json、credentials.json、production-policy.json、order-rules.json、execution-history.json的存在性、字节数和哈希前后一致。见 [最终环境比较](../work/e2e/phase2-real/20261111-003037-f6b66ad6/authorized-environment-comparison.json)。
- Git HEAD、分支和原四份输入保留；产品源代码、原测试及暂存区无变化。本次仅新增本报告和ignored证据/专用控制器/写保护脚本；无commit/push。
- 既有离线验收保持：29组selftest、609/609 Node测试通过，459原测试全部保留、新增150。本次不改产品代码，未重复整套回归。
- 本次控制器语法检查通过；文件写保护32/32通过；首轮10/10真实只读查询通过；第二连接首个Survey因pingTimeout中止；全程**0个业务写帧**。
- [初轮证据检查](../work/e2e/phase2-real/20261111-003037-f6b66ad6/evidence-validation.json)与[获批运行停止/环境检查](../work/e2e/phase2-real/20261111-003037-f6b66ad6/authorized-validation.json)通过，仅表示证据一致与正确停止，不能当作业务升级成功。

## G. 差异、建议及最终结论

| 分类 | 结果/建议 |
| --- | --- |
| 已有功能真实通过 | 当前账号复用、READY身份、无互斥任务前置检查、三模块只读调查、禁用规则/策略及零缺口的保守行为、建设候选/一次计划、失败停止与清理 |
| 真实环境差异 | 获批后的新连接首Pong未被处理，约1.1秒触发现有心跳保护；单样本不足以归因，不修改整个Client |
| 需要补充Integration | 在独立授权的后续验证中先观察首Pong、事件循环延迟与网络时序，再定位超时；补真实authorize/execute、持久history与权威复读/页面证据。异常后本次不继续 |
| 确实需要Development | 本次未证明新的业务缺陷；未改产品代码。免费刷新/金币奖励/UNKNOWN人工复核等已知缺口保留 |
| 当前证据不足 | 真实订单提交、建筑升级、生产启动/收取、真实UNKNOWN恢复、完整Snapshot与历史页面联动 |
| 文档差异 | README旧段落仍描述不可达网页领取/挂机/扫码、“未授权一个字节不发”及--paid能力；app无账号提示仍导向不可达扫码。记录但未扩大修改范围 |

| 最终判定 | 结论 |
| --- | --- |
| PHASE 2离线验收 | 保持此前通过 |
| PHASE 2真实环境验收 | **部分通过后异常中止，未完成真实写入验收** |
| 居民订单 | 只读通过；规则禁用，提交未验证 |
| 城市建设 | 调查/预览通过，人工已批准；新鲜复查超时，未派发、未确认 |
| 生产管理 | 调查/缺口/策略保守行为通过；无合格候选，未启动或收取 |
| UNKNOWN恢复能力 | 无业务写UNKNOWN，本次不能给出真实恢复通过结论 |
| PHASE 3条件 | 不自动推进；停止，等待本阶段人工验收 |
