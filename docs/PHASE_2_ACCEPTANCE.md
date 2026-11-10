# PHASE 2 Acceptance Report

交付日期：2026-11-11。状态：本阶段离线实现与回归完成，等待人工验收；未进入 PHASE 3。本文不代表真实游戏操作验收。

## 基线与需求确认

- 开始基线：`main@61ce3c0`；已验收 PHASE 1 提交 `da41d1ce7b610d3b0e595a81e4a78ad090a2fa9a` 完整保留。
- 从 PHASE 1 HEAD 创建 `codex/phase-2-order-world-execution`，不 reset、clean、amend、覆盖历史或推送。
- 已完整读取本阶段附件、Capability Inventory、Master Development Plan（实际文件 `docs/baseline.md`）、README、PHASE 1 验收及治理要求。
- 三维度表单重新读取确认非空，开始时为 15,208 字节。其旧临时状态按 Inventory、Master 与当前 D6 约束解释；没有据旧表单的付费或重试描述放宽权限。
- 对照 Master 2.1/2.2/2.3：除本次附件细化的订单、建设、生产与授权闭环外，补齐生产策略配置、缺口汇总及真实覆盖范围的当日报表；未扩展至贸易、战斗智能或其他后续阶段。
- 开始完整基线：29 组 selftest、459 项 Node 测试通过。

## 修改文件与 Function 复用

| 分组 | 文件 | 作用 |
| --- | --- | --- |
| M1 | `src/order-execution.mjs` | `surveyOrderExecution` / `decorateOrderSurvey` / `planOrderExecution` / `executeOrderOperation`，组合当前订单规则、需求、身份和执行能力 |
| M2 | `src/city-operations.mjs` | `surveyCityOperations` / `decorateCitySurvey` / `cityView` / `planCityOperations` / `executeCityAction`，展示、选择、复核与验证建筑及生产操作 |
| 生产策略 | `src/production-policy.mjs` | 默认/严格验证、按账号原子保存、`productionShortages`、`selectProductionCandidates` |
| 生产报表 | `src/production-report.mjs` | `summarizeProductionHistory`，上海日期下本工具已证实记录的本地聚合 |
| M3 | `src/operation-service.mjs` | `createOperationService`，调用现有 Session 和执行器，组合规划、绑定授权、单账号互斥、停止和持久证据 |
| 历史 | `src/execution-history.mjs` | `createExecutionHistory`，原子 JSON 写入、按账号查看、异常退出后未决恢复保护 |
| 既有传输 | `src/client.mjs` | 增加与既有确认方法对称的 `markUnverifiedWrite`，typed 响应后复读失败也保留原指纹格式 |
| API | `src/server.mjs` | 独立 PHASE 2 门控，复用现有 Session/generation/AbortSignal/busy/Stage 锁，停止与关闭时收尾 |
| UI | `src/page.mjs` | 新增订单执行、城市建设、生产管理、执行历史；复用原策略编辑器、账号 guard、DOM 安全与状态轮询 |
| 文档 | `README.md`、本报告、`docs/PHASE_2_CAPABILITY_DELTA.md` | 使用流程、能力追踪、验证、边界与验收依据 |

复用原有 `evaluateOrder` / Rule Contract v1、`order-rules-store`、`surveyWorld`、`planWorld`、`runWorld`、`ACTIONS` / `buildBody`、`ResourceLedger` / `resourceCosts` / `validateResources`、`execution.mjs` 与 GameClient 指纹保护。未重建 GameClient、Session、Snapshot/48 项入口查询、Action Layer、协议或数据库。采集包装只观察原查询的原始完整性；订单和城市可在同一次五项世界采集中取得元数据。

## 业务行为与 UI

居民订单保留五类规则、priority、首个 FAIL/UNKNOWN 停止语义。KEEP/REVIEW 无游戏写入。SUBMIT 前复读精确身份、规则、需求及可靠库存；完成后必须确认旧身份变化/消失且完成数恰好增加 1。同 index 替换订单重新评估但不继承上次执行授权。免费刷新缺少证据时仅显示 REFRESH 建议，不发送请求；测试中的权威免费证据路径有跨操作共享额度预留，不会复用旧配额。

城市页展示建筑类型、等级、状态、升级条件、材料、候选和预期状态；选择服务端已存在的建筑/空槽位，支持多个不同建筑组合。生产页展示配方、队列、剩余时间、总槽位/空位、在产、成品与需求缺口，复用生产开始、收取、竣工和道具加速。每个建筑每批只允许一次操作，以避免前一步改变目标后沿用旧授权。

Manual 每批一项；Hybrid 订单提交逐单授权、刷新可按具体名单成批；Automatic 仅执行当前授权清单。生产策略按账号原子保存，默认禁用，可限制产品、仅缺口及每批上限。Automatic 生产在规划和执行时都用新鲜需求、库存及其他工厂队列再次筛选；需求消失或已覆盖时拒绝发送。没有跨批次持续运行或无限授权。

页面区分预览、待授权、执行中、成功、拒绝/未执行、UNKNOWN、限频和取消。模式、选择、账号、策略变化使旧计划失效；同一有效计划的后台缓存更新不会误清授权预览。旧策略页面仍是独立只读模拟，不把单单可行误认为同批全部可行。

## 资源与授权流程

1. 使用已有 READY Session 显式采集，保留原始字段可靠性；只读状态/历史 GET 不创建连接或额外 Runtime。
2. 用户选择候选 actionId，服务器重建具体计划。订单、建筑和生产共用同一个规划 ResourceLedger，重复材料合并预留；任何部分无法满足时整批拒绝授权。
3. 展示账号、模式、操作、目标、前态、预期状态、预算及有效期。服务端保存内部动作，客户端不能传 Request/body/Action。
4. 同源 POST 同时校验精确 Host、Origin、JSON 和当前页面 CSRF 请求头。授权精确绑定账号、batchId、planHash、有序操作列表和预算，返回随机单次许可；`confirm:true` 单独无效。
5. 执行前检验许可、五分钟有效期、Session 代次、客户端实例、规则、成本配置和生产策略。派发前 guard 再次复核，变化即停止。
6. 执行账本与已预留的规划账本分开，但同批全部模块共用同一个执行预算；从原计划库存保守初始化，发送前复读实时余额，旧快照及后续新收取都不补回预算。
7. 每步先持久化 DISPATCHING，再调用既有执行器并权威复读。每步结果保存完成后才考虑下一条操作。

同一账号与 Stage、完整采集、其他批次互斥；不同账号可并行。缓存浏览不触发写入或采集。新路由与原 Web 白名单分开，旧通用游戏写路由保持禁止，`allowPaid` 和任意 Action 字段被拒绝。

## UNKNOWN、停止与历史

静默观察窗口结束不直接成功，只允许在可靠复读证明效果后确认。超时、断连、解码/关联失败、限频立即停止，不重试后续操作。已派发后停止、授权撤销或复读未确认都保留 UNKNOWN；限频保留结果分类，并以 unresolvedWrite 保持未决阻断。只有权威确认才释放指纹。

`data/execution-history.json` 被 Git 忽略，按精确账号键隔离，不以账号 ID 拼接文件路径。单次更新使用独占临时文件、fsync、原子 rename；损坏、未知版本或逻辑结构无效时保留原证据并阻断新写入。历史不保存许可句柄、Token、Sign、Cookie、登录帧或完整敏感响应。

批次记录 `runId/accountId/module/mode/startedAt/finishedAt/authorization/authorizationSummary/planSummary/resourceBudget/actions/finalStatus/stopReason`；动作记录目标、身份、前后状态、规则、库存、资源预留、请求状态、验证状态、时间、是否派发及 unresolvedWrite。authorization 是公开确认摘要，HTTP 展示复用既有脱敏并另提供 authorizationSummary，不持久保存 bearer 许可。

进程异常退出时未完成动作恢复为 UNKNOWN，保留预算和动作证据，仅允许查看历史；新批次与 Stage 被阻止，不自动续跑。当前网页没有清除未决保护的接口。停止只阻止后续操作，不能将已发出的请求伪装成安全取消。

## 新增 API

全部精确绑定 `?account=<id>`：

| 方法与路径 | 输入与用途 |
| --- | --- |
| GET `/api/operations` | 缓存状态、视图、当前页面 CSRF 上下文 |
| POST `/api/operations/survey` | 空对象；显式只读采集 |
| POST `/api/operations/plan` | `{module,mode,selections:[actionId]}`，返回服务端 batchId/planHash/预算 |
| POST `/api/operations/authorize` | `{batchId,planHash,approvedActionIds,resourceBudget,confirm:true}`，返回单次 permitId |
| POST `/api/operations/execute` | `{batchId,permitId}`，启动异步批次 |
| POST `/api/operations/stop` | 空对象；停止后续操作 |
| GET `/api/operations/history` | 可选 runId，按账号历史及当日报表 |
| GET `/api/operations/production-policy` | 本地账号生产策略 |
| POST `/api/operations/production-policy` | `{config}`，原子保存并使旧计划失效 |

## 测试结果

完整执行 `npm test` 原脚本 `node src/selftest.mjs && node --test`。UNC 目录下使用 npm CLI 加 `--script-shell <pwsh.exe>`，未修改 package.json 或脚本语义。

- selftest：29 组通过；原有素材检查因尚未同步素材而按既有条件跳过。
- Node：609/609 通过，0 失败、0 取消、0 skip。
- PHASE 1：459 项全部保留；新增 150 项，没有删除断言或改为 skip。
- 全部变更源码及测试 `node --check` 通过；`git diff --check` 通过。
- 完整离线日志：系统 TEMP 中 `cw-phase2-final-npm-test-20261111.log`；开始日志为 `cw-phase2-baseline-test-20261110.log`，不提交证据目录。

| 新增测试文件 | 数量 |
| --- | ---: |
| `tests/order-execution.test.mjs` | 47 |
| `tests/city-operations.test.mjs` | 30 |
| `tests/production-policy.test.mjs` | 12 |
| `tests/production-report.test.mjs` | 10 |
| `tests/execution-history.test.mjs` | 7 |
| `tests/operation-service.test.mjs` | 11 |
| `tests/operations-api.test.mjs` | 8 |
| `tests/operations-view.test.mjs` | 21 |
| `tests/operation-adapters-integration.test.mjs` | 3 |
| `tests/client-unverified-write.test.mjs` | 1 |
| 合计 | 150 |

覆盖真实适配器的合成订单→建筑→生产组合、共享预算、成本变化、精确授权/过期/账号/规则/策略绑定、单账号互斥与不同账号并行、Stage 冲突、执行前后复核、超时不重发、写后取消/授权撤销、限频未决持久保护、异常退出恢复、原子替换失败、敏感字段脱敏，以及账号切换和轮询的页面交互。全部使用 Fake Client、合成账号、本地 HTTP 或 VM DOM；没有真实游戏连接、真实凭证读取、代理或 CA 操作。

## 剩余缺口与下一阶段依赖

| 缺口 | 当前处理 | 后续所需证据/依赖 |
| --- | --- | --- |
| 免费刷新次数、冷却与允许状态的权威来源 | 生产默认拒绝 REFRESH；仅保留规则建议及合成适配器测试 | 客户端调用点与字段语义证据，确认免费条件后单独验收接入 |
| MIN_GOLD / 订单金币奖励 | 保留既有不支持限制 | 可靠金币奖励来源；禁止猜字段 |
| 完整游戏当日产量 | 报表标明 tool-verified-only、totalGameProduction=null；缺证据只计操作次数 | 完整生产事件或可靠时间序列；库存差不能替代产量 |
| 缺失建筑/队列字段、未知成本和新地图建造位置 | 不生成可写候选；仅使用现有槽位/配方与已知成本 | 相应协议/配置语义证据，补齐后重新规划与授权 |
| UNKNOWN 的后续人工复核/解除 | 保留历史、指纹和预算并阻断；无清除网页入口 | 独立设计权威复核证据和审计流程；不能删除记录绕过保护 |
| 真实环境验收 | 本阶段仅离线完成，未进行真实写入 | 用户单独授权、可靠测试账号和明确操作范围；此交付不预先授权 |

本阶段交付后等待验收。任何 PHASE 3 阵容/战斗智能工作都依赖后续明确指令，不能通过本批次许可自动开始。

Cxxx 追踪：C101–C104、C111–C116、C121–C128 的逐项 Function/适配/缺口见 `PHASE_2_CAPABILITY_DELTA.md`。C124 金币、C112 完整全天量与免费刷新依赖明确标记为缺口，不用伪造成功补齐。

## Git 与原始输入保留

功能按模块边界提交：`972f81a`（订单/城市/策略/日报适配）、`52b7824`（共享授权/历史/API），以及本报告所在的 UI/文档交付提交（提交号见最终交付消息）。未推送，main 和 PHASE 1 历史未改。

原始 `CAPABILITY_INVENTORY.md`、`docs/baseline.md`、`docs/blueprint.md`、`docs/标准三维度拆分表单.md` 在开始时为用户未跟踪输入，继续保留未跟踪，不纳入功能提交。前两份仅追加本阶段状态和报告链接，原始正文逐字节保留；追加前 SHA-256 已记录于附录。可提交的能力增量与本验收报告提供完整可审阅交付依据。没有提交 data、work、E2E 证据、凭证或日志。
