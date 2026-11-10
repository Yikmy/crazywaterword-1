# PHASE 2 Capability Delta

本文件是 `CAPABILITY_INVENTORY.md` 与 `docs/标准三维度拆分表单.md` 的可提交增量，记录 PHASE 2 的代码实现及离线验证范围。输入文档和既有 Git 基线不被替换。此处的“验证”均指合成数据、Fake Client 或本地测试服务，不代表真实游戏验收。

## M2：城市建设与生产

| 需求 | 复用能力 | 本阶段集成与新增 | 边界 |
| --- | --- | --- | --- |
| C101 建筑信息读取 | `surveyWorld`、OnWater、BuildingCfg | `surveyCityOperations` 在同一次已有采集中观察原始字段；`cityView` 展示建筑等级、状态 | 缺失字段不以默认零变成可写事实；未知类型不生成操作 |
| C102 升级前置校验 | `planWorld`、`upgradeRow`、ResourceLedger | 展示下一等级、等级/人口/额外条件、材料、预期状态和候选动作 | 成本缺失不是零成本；条件与现有规划器一致，不推测协议 |
| C103 升级执行 | `UpgradeBuildingRequest` 经 `planWorld` 和 `runWorld` | 候选 ID 选择、授权前规划、执行前精确复核、执行后权威复读 | 等级/目标/状态/成本变化后需重规划；静默请求不直接认定成功 |
| C104 建造执行 | `BuildBuildingRequest` 经已有规划器 | 选择服务端已提供的 level=0 建筑槽位，沿用建造与升级不同请求 | 不增加地图坐标或任意新建筑协议；每个建筑每批一次操作 |
| C111 工厂状态读取 | `surveyWorld`、DispFactory 队列/成品、配置表 | 工厂、产品、队列、剩余秒数、配方、可收取状态、总槽位及空位展示 | 队列/成品/自动产品字段不可靠则无生产写候选；未知槽位不假装空闲 |
| C112 当日生产报表 | 本阶段持久执行历史 | `summarizeProductionHistory`，按指定时区/日期聚合已确认的启动和收取操作 | `coverage=tool-verified-only`、`totalGameProduction=null`；缺乏完整游戏全天产量来源 |
| C113 库存缺口计算 | 当前订单需求、AllItem/AllResource、现有队列和成品 | `productionShortages` 合并需求，扣除库存、在产单位和未收取成品，输出 required/inventory/inProgress/finished/missing | 需求、库存、队列或数量不可靠时返回 UNKNOWN，不推测零缺口 |
| C114 自动生产决策 | `planWorld` 现有配方/空位/材料限制 | `production-policy.mjs` 仅从服务端现有 `startProduce` 候选筛选；按账号持久配置 | 不设置新的游戏自动生产协议，不增加持续调度器，不自动沿用上批授权 |
| C115 生产提交执行 | `StartFactoryProduceRequest`、`runWorld` | 目标/队列/成本复核，共享执行预算；Automatic 在新鲜订单与工厂状态上再次检查策略 | 队列新增或成品实际增加才确认，支持仓库证据中“即时完成”情况 |
| C116 成品收取与竣工 | GainFactoryProduce、CollectBuildingProduct、FinishUpgradeBuilding | typed 响应仍需复读；收取同时验证成品减少及库存增加；竣工验证等级变更 | 单纯响应、时间经过或库存净变化均不等于已证明完整生产量 |

新增模块只做组合和适配：

- `src/city-operations.mjs`：已有世界采集/规划/执行的城市适配，统一 operation 契约，无 Session、GameClient、Snapshot 或协议构造器重建。
- `src/production-policy.mjs`：严格策略契约、按账号原子 JSON 存储、可靠缺口展示与候选筛选。
- `src/production-report.mjs`：只读取执行历史的纯统计，无游戏访问。

### 生产策略

默认配置为：

```json
{
  "version": 1,
  "enabled": false,
  "onlyShortages": true,
  "productIds": [],
  "maxOperations": 10
}
```

`productIds=[]` 表示当前既有候选配方全体。配置开启不会立即发出游戏写操作。Automatic 仅执行当前明确授权批次内、仍符合策略的候选；同工厂最多选择一次，最多执行 `maxOperations` 项。Manual 与 Hybrid 的具体授权不依赖自动策略开关，但仍接受共同的成本、协议、资源及执行安全检查。

`onlyShortages` 的数量依据来自当前可靠需求、库存、在产队列和未收成品；在产队列每项按仓库已确认的一次一件生产语义计算。需求变化、其他工厂新增队列或成品覆盖缺口后，执行前复核将拒绝过期 Automatic 操作。材料仍由实际计划及执行的共享 ResourceLedger 约束，推荐列表本身不授予写权限。

策略按精确账号键保存到单一 `production-policy.json`，账号 ID 不拼接路径。格式损坏时默认禁用并拒绝覆盖原文件；单账号配置损坏不影响其他账号。严格拒绝未知字段、重复产品、非法数量、付费/协议注入字段。

### 日报证据

只纳入 `result=SUCCESS` 且 `verification.status=CONFIRMED`、拥有可靠操作时间戳的历史事件。启动生产只累计操作次数，不能推导产量。工厂或建筑收取量必须同时存在可靠前后 asset 数量与显式前后库存数量，并且减少量与增加量一致；缺少证据时只累计已确认收取操作次数。

日报使用指定时区，默认 Asia/Shanghai，按批次和 action ID 去重。未知、限频、未确认、拒绝、取消和仅规划事件均不记入已证明产量。库存差额受到订单消耗、配方消耗及其他来源影响，不能声称是完整游戏生产量。

## M1：居民订单闭环

| 需求 | 复用与集成 | 已知边界 |
| --- | --- | --- |
| C121 当前需求读取 | 复用 `surveyWorld`，`surveyOrderExecution` 在同一原始 OnWater 回复上附可靠性元数据 | 缺失订单数组不当作权威空数组 |
| C122 物品解析 | 复用当前订单 requirements 与 `resourceCosts` | 缺失、零、负数、非安全数量不允许提交 |
| C123 订单库存缺口 | 复用规则评估器、库存采集和跨模块 ResourceLedger | 多订单、重复材料、建筑及生产共用规划账本，执行账本独立且不补回已花预算 |
| C124 奖励计算 | 复用 WorkerOrderCfg/WorkerSpecOrderCfg 的已有经验逻辑 | 无可靠金币奖励字段；MIN_GOLD 继续保留原限制，不猜测补齐 |
| C125 规则评估 | 保留 Rule Contract v1 的五类规则、priority、首个 FAIL/UNKNOWN 停止和 KEEP/REFRESH/REVIEW 语义 | KEEP/REVIEW 无游戏写操作 |
| C126 提交与刷新 | `order-execution.mjs` 复用 ACTIONS、buildBody 与 `runWorld`；新鲜身份/规则/成本复核，执行后再读 | SUBMIT 同时需要目标订单变化及完成计数增加；REFRESH 缺可靠免费配额/允许条件证据则禁止 |
| C127 规则持久化 | 继续使用 `order-rules-store.mjs` 的按账号 JSON 约定 | 不重写或改变既有规则语义 |
| C128 执行历史 | `operation-service.mjs` 与 `execution-history.mjs` 记录授权摘要、预算、前后状态、请求结果及验证证据 | 历史不是实时状态，不保存凭证和原始登录帧，不向新计划复用授权 |

Manual 每次选择一项；Hybrid 的提交逐单授权；Automatic 仍绑定本批次具体操作。它们均使用同一个服务端门控，不形成独立运行时或新的长期调度框架。

## 共享安全约束

所有城市候选请求都由原有 `planWorld` 生成，实际发送由 `runWorld` 完成。客户端只提交服务端候选 ID，不接收任意 Request/body/Action。旧 Web 写操作白名单保持原限制，新增批次路由使用独立的同源/CSRF门控及精确账号绑定。

授权绑定账号、批次、计划哈希、具体操作、资源预算、配置和规则版本，为一次性、限时授权。单账号写操作与 Stage Runner、收集及循环执行互斥；账号之间独立。每条动作派发前校验 Session generation、停止状态、余额与未决写保护。

静默观察窗口结束本身为 UNKNOWN。只有权威复读证明预期变化才确认 SUCCESS 并清除指纹。已发送后断连/停止而未完成验证保留 UNKNOWN；限频立即停止。未决指纹、预算和持久历史保护均保留，不自动重试、不释放未确认成本。D6 持续禁止钻石和付费路径，生产/建筑加速仅沿用已存在的加速器 type=2 成本。

本阶段未连接真实游戏、未读取真实凭证、未修改代理或 CA。后续真实环境验收和所有剩余协议缺口必须单独明确处理；不会自动进入 PHASE 3。

## 本模块离线测试证据

- `tests/city-operations.test.mjs`：30 项，覆盖多建筑/跨订单共享预算、队列与启动/即时完成、收取复读、加速成本、过期计划、资源变化、D6、UNKNOWN/限频/取消、generation 及 Automatic 新鲜策略复核。
- `tests/production-policy.test.mjs`：12 项，覆盖严格配置、默认禁用、账号隔离、原子替换失败、损坏保留、白名单/额度/同厂一次、可靠缺口与未知状态。
- `tests/production-report.test.mjs`：10 项，覆盖确认状态、时区日界、可靠数量、缺证据保守统计、重复记录、不安全数量与证据不变性。

上述 52 项均在隔离环境通过。全量回归及最终交付提交以 `PHASE_2_ACCEPTANCE.md` 的最终记录为准。