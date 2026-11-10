# PHASE 1 — Shared Execution Safety & Existing Defect Closure 验收记录

日期：2026-11-10（Asia/Shanghai）。本阶段仅做现有执行链安全修复；完成后停止，等待人工验收。

## 1. 输入与 Git 基线

三份输入已完整读取、交叉核查。实际文件位置如下，原文件保持原样：

| 用户给定名称 | 实际输入 | 情况 |
| --- | --- | --- |
| docs/CAPABILITY_INVENTORY.md | 根目录 CAPABILITY_INVENTORY.md | 1410 行；包含完整 Function 表与协议附录 |
| docs/标准三维度拆分表单 | docs/标准三维度拆分表单.md | 现有文件为 0 字节；不补写或推断缺失原文 |
| Master Development Plan.md | docs/baseline.md | 1410 行，标题为 Capability Mapping & Master Development Plan；PHASE 1 位于第 478 行起 |

基线提交：`61ce3c020ea8abedd9e70387c88528b6a8fe055b`。工作分支：`codex/phase-1-execution-safety`，由该基线创建。主分支 `main` 的基线保留，无 reset、amend、rebase、clean、强制覆盖或推送。阶段修复作为独立提交交付。

开始时未跟踪的 CAPABILITY_INVENTORY.md、docs/baseline.md、docs/blueprint.md、三维度表单保留，不纳入阶段源码提交；原 data、work、E2E 材料不改动。初始另一个工作区 aibot-crazywaterword 只有 UI 原型，本阶段未修改。

## 2. 逐项核实与闭合

| 分组 | 已核实问题 | 修复与复用 | 验证 |
| --- | --- | --- | --- |
| 1.1 CLI 与凭证安全 | accounts show 原样展示秘密；list、headless、state/raw/out、act 和日志未统一脱敏；旧 probe 直接使用旧凭证来源 | 复用 redact、validateCredentials、describeAccount、loadStore/pickAccount；统一 CLI sink 在截断/序列化前脱敏；show 仅返回元信息；probe 使用安全账号来源；入口导入不读账号、不连接；finally stop 与 CLI 中断清理 | 独立 CLI 测试、合成子进程账号、Token/Sign/Cookie/URL/登录帧、多格式输出、损坏 JSON、SIGINT、Web 原有脱敏测试 |
| 1.2 资源预算 | 多订单复用初始 missing；建筑候选选出后未重新扣预算；生产/英雄各自预算；未知成本可经 Number(null) 变为零 | 复用现有库存事实及 AllItem/AllResource；ResourceLedger 原子聚合/预留；world、heroes、可选规则分配共享账本；执行前重查当前余额并保守扣留本轮预算；未知数量、缺失成本、无效 Long、钻石拒绝 | 库存 2/两单各 2 只计划一单；两座建筑同理；组合计划不超余额；执行前余额下降、迟到旧余额、无效/重复成本、伪 kind、取消/UNKNOWN |
| 1.3 Action 参数 | buildingCollect repeated string 收到标量；无舰队的 challengeField 产生 undefined 字符串；repeated index 缺少严格整数形态 | 复用 ACTIONS/buildBody；buildingId、fleetBuildingIds、index 标量/数组规范化；缺省舰队为 []；加速器数量必须为正 int32 | CollectBuildingProduct、ChallengeResField、DrawDailyReward、DrawWeeklyReward 使用现有真实 Protobuf encode/decode 往返；原 selftest 不变 |
| 1.4 付费边界 | DiscountShopBuy 将 ready 误当免费，且没用真实配套 Response；陈旧计划/伪 ready 可绕成本 | Request 语义与成本元数据共同校验；D6 对钻石/付费礼包始终硬拒，allowPaid 不能解除；折扣价格/折扣/购买状态可靠才展示成本，真实 DiscountShopBuyResponse 保留；每个允许日常动作执行前复用 survey/driver，按新服务器状态与配置匹配 | allowPaid 两种设置、伪 ready、未知成本、失效免费状态、取消；免费点金/招募必须有可靠状态与配置 |
| 1.5 生命周期 | loop 只在轮边界停止；tasks rejected 每轮重建；静默 sendWatch resolve 被当成功；旧结果可回填 | 复用 GameClient、Session generation/AbortSignal、Stage Runner；既有执行器逐步检查取消；延迟可中断；tasks/dailies/world 跨轮拒绝记忆；静默发送返回 UNKNOWN 并停止；typed 与静默未决写保留指纹；同步 close/prompt/abort 清理；已复读确认的奖励才释放对应指纹 | 停止后不发下一步、未决不重发、typed 超时/重连、迟到响应、无自动重连、监听/定时器清理、原 Stage/Session 全回归 |

`UNKNOWN` 的 `ok` 为 null；确定成功才为 true。UNKNOWN、CANCELLED、RATE_LIMITED 终止后续执行。只有确定的服务端拒绝进入 rejected 记忆；超时与断线不会被当作普通失败自动重试。免费赠礼/宝箱在复读确认后才能报告 SUCCESS。奖励状态缺失或无效（如 null 进度、NaN 活跃度、缺少合法 drawnPack）不会发领奖请求；真实 Protobuf 解码后的合法空列表保留其原有语义。CLI loot 复用同一领奖过滤器，并移除绕开预算的直接建造分支。

现有普通订单页面仍为明确的逐单只读模拟。`evaluateOrders` 增加可选共享 ledger，用于组合分配；没有把独立模拟结果误充为已预留、已提交或批量可执行计划。

## 3. C / P / S 追踪与复用

本阶段是公共前置修复，涉及 C001/C002/C005 的 CLI/执行安全，C102/C113/C114/C115/C123/C125 的预算，C221-C224 的英雄预算与执行，C603-C605 的执行/记忆/顺序取消。上述编号表示修复覆盖范围，不表示已经完成后续阶段的完整产品能力。

保留现有账号、数据、规则预览和 P3-1 主线页面；未新增 UI。S1 手动、S2 单次和现有固定循环的执行安全得到修复；S4 沿用 Stage Runner。没有实现 S5-S8 的通用调度或工作流。

直接复用：GameClient.request/sendWatch、Session、collectState/Snapshot、ACTIONS/buildBody/assertAllowed/runAction、surveyWorld/planWorld/runWorld、planHeroes/runHeroPlan、evaluateOrders、surveyDailies/runDailies/claimDailies、surveyTasks/runTasks、runLoop、redact/validateCredentials/describeAccount、claimableDailyTasks。

新增有明确职责的 helper：

- cli-safety.mjs：CLI 输出与安全账号来源、入口判断。
- resource-ledger.mjs：数量转换、共享库存归并、原子预留与执行前余额检查。
- execution.mjs：取消检查、可中断等待/延迟、结果分类。不是新的 Action Layer、Runtime 或 Scheduler。

## 4. API、协议和配置契约

没有新增 HTTP 路由，没有扩大 Web 写白名单，没有开放通用 Request/Action API。原有 READ_ONLY_ROUTE 的限制和主线授权边界继续生效。

- 参数修复使用原有 CollectBuildingProductRequest/Response、ChallengeResFieldRequest（无同名 Response）、DrawDailyRewardRequest、DrawWeeklyRewardRequest。
- 执行前余额检查复用 AllItemRequest/Response、AllResourceRequest/Response。未重建 48 项 Snapshot 查询。
- DiscountShopBuyRequest/Response 仅用于正确识别既有协议和展示付费计划；D6 下仍拒绝发送购买。
- 赠礼复核使用原有 DailyGiftPackRequest/Response；宝箱复核使用 DailyTaskInfoRequest/Response。
- typed 写调用向现有 request 的第 5 参数传入 `{ mutate: true, signal }`。读请求默认行为和同请求 single-flight 保留。
- planWorld/planHeroes 可传同一个 `ledger`；evaluateOrders 第 4 参数可传 `{ ledger }`；组合执行传同一个 `budget = { ledger: null }`。规划账本和执行预算分开，执行预算只基于新查询初始化，不因旧余额回复补回已占用材料。
- 取消选项支持既有 stop 标记与 AbortSignal；rejected Set 由对应账号的本次循环持有。未新增账号配置文件、数据库、通用持久历史或跨进程锁。

CLI `loot` 不再夹带直接建造；建造统一走 world 计划。CLI `act` 中六种资源动作（upgradeBuilding、buildBuilding、startProduce、finishOrder、speedUpUpgrade、speedUpProduce）改为在读取账号/连接之前拒绝，要求走 world 的 survey→plan→预算复核执行。afkUpgrade 缺少可靠的成本前置校验，直接 act 入口同样拒绝。底层现有 Function 保留。

## 5. 修改文件

| 类别 | 文件 |
| --- | --- |
| CLI / 工具 | src/cli-safety.mjs（新增）、src/app.mjs、tools/probe-world.mjs、tools/probe-dailies.mjs |
| 预算 / 规划 | src/resource-ledger.mjs（新增）、src/world.mjs、src/heroes.mjs、src/order-rules.mjs |
| Action / 日常 | src/actions.mjs、src/dailies.mjs |
| 生命周期 | src/execution.mjs（新增）、src/client.mjs、src/tasks.mjs、src/loop.mjs、src/server.mjs、src/stages.mjs |
| 新回归 | tests/cli-safety.test.mjs、tests/resource-budget.test.mjs、tests/actions-safety.test.mjs、tests/dailies-safety.test.mjs、tests/dailies-state-reliability.test.mjs、tests/execution-lifecycle.test.mjs |
| 原测试追加 | tests/client-lifecycle.test.mjs；只追加用例，原测试与断言全部保留 |
| 验收文档 | docs/PHASE_1_ACCEPTANCE.md（本文件） |

package.json、package-lock.json、依赖、页面、48 项查询定义不变。

## 6. 测试

最终结果：

| 检查 | 结果 |
| --- | --- |
| 修改前基线 | 29 组 selftest；370 项 Node 测试，全部通过 |
| 最终完整回归 | 29 组 selftest；459 项 Node 测试，0 失败、0 取消、0 skipped |
| 新增覆盖 | 在原 370 项基础上增加 89 项；原测试与断言全部保留 |
| CLI 定向 | 14 项：脱敏、合成子进程、导入无副作用、中断、act/loot 预算边界 |
| 预算定向 | 28 项：原子预留、跨计划、执行前复核、未知成本与取消 |
| Action / 日常定向 | 29 项：真实 codec、D6、陈旧计划、状态可靠性、奖励验证 |
| 生命周期 | 新文件 10 项；原 client-lifecycle 追加 8 项 |
| 语法 | 23 个修改或新增 MJS 文件 node --check 全通过 |
| 空白 | 工作区与 staged git diff --check 全通过 |
| 原有素材检查 | selftest 内按原条件跳过：未运行 sync-art；没有下载或修改素材 |

原始最终日志：`C:\Users\zyk-o\AppData\Local\Temp\cw-phase1-final-npm-test-20261110.log`。没有新测试失败被隐藏、删除或改成 skip。

Windows npm.cmd 无法直接以 UNC 路径作为工作目录；实际执行 package.json 的完整等效测试链：`node src/selftest.mjs`，成功后 `node --test`。测试仅使用既有本地协议/配置资产、合成凭证、临时目录、模拟客户端和本地测试服务。未连接真实游戏、读取真实凭证或操作真实代理/CA。

## 7. 剩余缺口与下一阶段依赖

1. 三维度原表为空，缺少该输入的可独立核验正文；本次范围以完整 Master Plan 的 PHASE 1 为准。原文由用户后续恢复后，需核对需求映射。
2. 本次是离线验收；真实游戏效果没有执行或确认。将来的真实验收按功能单独授权。
3. 没有可用权威复读验证的静默写保持 UNKNOWN 并停止，不能作为失败自动重试。未知发送保护在当前 GameClient 内保留；没有新增跨进程或持久化未决账本。
4. 未实现 PHASE 2 的订单执行适配器、建筑/生产新页面、持久执行历史或自动授权桥接。订单默认预览仍是逐单模拟。
5. PHASE 2 必须把规则结果、world 计划接入同一规划 ledger；批量执行共享同一执行 budget，逐项核对最新订单/建筑状态、预算、显式授权和结果复读。UI、API 和写权限仍需按具体功能验收，不能直接放开旧路由。
6. afkUpgrade 的直接 CLI 写入口需要可靠的成本语义与前置复核后才能恢复。后续海战/维修必须复用相同预算和 UNKNOWN 语义，不将主线 LEFT 授权推广到其他玩法。

PHASE 1 交付后停止，等待验收；不自动进入 PHASE 2。
