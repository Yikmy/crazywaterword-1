# crazywaterword

当前进度唯一基线是 [ROADMAP_RECONCILIATION](docs/ROADMAP_RECONCILIATION.md)（2026-11-15完成对齐；后续提交与具体交付边界见该表）。原目标 COMPLETE_CRAZYWATER_PLATFORM_R1_R8 保持 ACTIVE，完整保留 M0–M15、95C、42P、8S 和 273 Inventory；工程尚未完成，R7 全量离线与 R8 真实验收均未执行。PHASE 1–4 报告保留各自版本的历史证据。

本项目通过游戏 WebSocket 协议提供只读数据浏览、具体业务计划和受控执行。现有 OperationService、Function Registry、ResourceLedger、ExecutionHistory 与有限 Workflow 共用账号、连接、授权、预算、D6、取消及 UNKNOWN 保护。26 个静态模块加原 Stage 已注册；每个模块的可执行子集和缺证操作见唯一进度基线，注册不代表完整玩法交付。

Tasks、Dailies 和有限 Loop 的页面入口将明确选择编译为原 Workflow。生成计划、检查具体操作和父预算后，仍须明确授权。旧通用写路由及独立 CLI 游戏写已拒绝；只读、dry 和离线工具按原边界保留。当前交付以离线合成测试为主，历史真实证据仅适用于报告列出的版本和场景。a93acb8范围对齐、dacd718 Museum纠正、b6edb78普通收益、8869553三入口、ba72763明确升级及后续有限收益→升级准备统一见路线图§2和§12.4；逐模块的代码、API/UI、Workflow及测试/真实边界见§6。未提交或只读子集不计为完整写能力。

---


运行资产可以在离线环境单独检查和保留：

~~~bash
node src/app.mjs assets
node src/app.mjs assets archive
node src/app.mjs assets verify
node src/app.mjs assets restore
~~~

归档固定写入 `work/runtime-assets.cwassets.gz`，已有同名文件会保留并拒绝覆盖。迁移时携带仓库中的 `docs/RUNTIME_ASSETS.json` 和该归档，先运行 verify，再按需 restore。恢复仅补缺失的已登记协议、配置和地图文件；先完整校验归档及全部目标，任何现有冲突文件均保留。中断写入留下的部分文件也不会被自动覆盖。归档缺失项继续显示为缺口，保留本地字节不等于证明原始包/CDN版本或真实玩法通过；命令不读取账号凭证、不连接游戏。

## 免责声明

**本项目仅供协议分析与学习研究。使用它会违反游戏的用户协议，账号可能被处罚或封禁。**

- 所有请求都由你**自己的账号、自己的凭证**发出，作者不为任何后果负责。
- 请只用你自己的账号测试，**不要**用于批量、代练、工作室或任何形式的牟利。
- 项目刻意保留了一批「不做」的边界（见下方「安全边界」），例如不花钻石、不买付费礼包、
  不使用 `LoginRequest` 里 `testAccount` / `superToken` 这类开发者后门字段。
- 如果你不接受这些，请不要使用本项目。

---

## 它是什么

| 能力 | 当前范围 |
|---|---|
| 账号与数据 | 显式登录、账号隔离、48项查询及缓存浏览；28解析、20原始 |
| 任务与日常 | 主线、支线、成就和日常任务受控单领；普通挂机明确等级/区间，可信时间下单独授权，物品/徽章净入独立复读；其后可明确升级1/5/10级，核主线门槛、逐档自有徽章成本及当前连接已确认收益，精确净扣复读。原页面可明确级数与总时长，准备有限收益确认→升级图；原收益来源和自有徽章成本固定，收益确认落盘后才调查实际新区间，父预算不随收入扩大。UNKNOWN不重放；其他实例收益及完整日常缺口保留。9类明确日常动作子集及缺证边界保留 |
| 英雄与阵容 | 单项养成、明确补足碎片后单/多英雄有限单星组合、装备/徽章/专武子集（含装备显式零费首次升级）、Pet投喂和服役单级升级、锻造明确配方数量准备；完整队伍预设及极限来源复制，有限主线换阵支持明确顺序或匹配历史胜率选择 |
| 城市与生产 | 建造升级、收取排产、明确农田种收及订单提交；可在农田页明确选择1至12块成熟田和总期限，准备原Workflow逐田收取图，固定剩余作物来源/累计UID预算，每田复读确认，拒绝/UNKNOWN停止，重启只读。批量协议结算、免费刷新和最终金币仍缺证 |
| 专业玩法 | 港口、联盟、博物馆、扫荡、贸易等受控子集；钓鱼仅只读，具体边界见路线图 |
| 编排与历史 | 原生有限图、父预算、有限日周/可信事件、持久拒绝及UNKNOWN历史；重启只读 |

主线战败建议沿原 `POST /api/formations/recommendation/prepare` 准备有限图。`presetIds` 与 `maxDurationMs` 继续限定候选和总期限；可明确加入 `selectionRule: "OBSERVED_WIN_RATE"`、`minSamples`（1–200），按最近最多200份原历史中同账号/角色/世界/关卡、相同已观察队伍资料及对手、精确候选站位的胜率排序，同率保留输入顺序，再按 `maxAttempts` 截断。每候选样本不足则不生成统计图，不开战采样。准备只读；保存/开战仍沿原授权、独立复读和确认战败分支。未观察属性、成长与随机仍未知，历史排序不保证后续更优；UNKNOWN及重启不自动续跑。

英雄页可明确英雄、兑换数量和总时长，调用 `POST /api/gameplay/heroes/star/prepare`（`heroId`、`num`、`maxDurationMs`）只读准备兑换后单星图。数量必须恰好补足下一颗星；图固定原星级、每步专属余额和星成本，兑换完整入库确认后才生成原单星计划（`universal:false`）。同一入口也接受 `targets: [{heroId,num}, ...]` 与 `maxDurationMs`，明确1至12名不同英雄的执行顺序，各最多一星；`num: 0` 仅表示已有足够专属碎片。准备时核各品质共享万能碎片总量，图共用原授权、累计预算及历史，未来收入不增加额度；每步独立复读，前置变化、拒绝或UNKNOWN停止，重启只读，仍未进行真实游戏验收。

Fleet页可显式开启 `giveUpResourceField`，从本账号完整已占列表选择一个网格，以 `{resourceFieldGridIdx: 0}` 等精确参数重新探测、预览并单独授权放弃。0是有效网格，空白不代表0。沿用原Service、世界/网格UID预算、写前持久化与独立完整列表及库存复读；不领取收益，结果未知或重启均不重放，真实游戏未验。

## 它不是什么

- 不做手机端抓包，不做云端同步。
- 地图争夺、资源田占领及其他战斗模式仍在原范围内；缺少权威目标、成本、战果或结算证据的具体操作保持禁用，已交付边界见路线图。
- 不为没有图标的美术资源做手工绘制或猜测映射，找不到就退回纯文字。

---

## 环境要求

- **Node.js >= 20.11**（用到 `import.meta.dirname`），实测于 Node 22。
- Windows（微信 PC 端抓包走 HKCU 系统代理 + 当前用户根证书）。
- 唯一的 Node.js 运行时依赖：`protobufjs`。
- 生成抓包证书需要 OpenSSL；优先使用 `CW_OPENSSL` 指定的路径，Windows 下也会查找 Git 自带的 OpenSSL。

```bash
npm ci
```

---

## 快速开始

### 1. 抓一份登录凭证

游戏不会把凭证交给外部程序，只能由本机代理从真实会话里抓：

```bash
node tools/capture-credentials.mjs
```

此命令会先询问确认，再临时修改当前用户的系统设置。真实捕获仅在单独授权的 E2E 阶段执行；离线测试不执行此命令的实际捕获流程。获得授权后，它将：

- 起一个只监听 `127.0.0.1:17322` 的本地 MITM 代理；
- 把本地 CA 装进**当前用户**的根证书区（`certutil -user`）；
- 设置 **HKCU** 的 `Internet Settings` 代理。

代理默认只解密精确主机 `dhyaoj-gate.khlgamen.com` 的 443 端口，其余 CONNECT 流量透明转发；上游 TLS 链和主机名必须校验通过。捕获正常 `LoginRequest` 后，CLI 将凭证保存到 `data/accounts.json`（可由 `CW_DATA_DIR` 指定目录），不保存原始登录帧、不打印凭证，也不自动登录。旧 `credentials.json` 不会被此命令读取、删除或覆盖；已有账号迁移逻辑保持兼容。

开始系统修改前，控制器在本地 CA 目录 `~/.cw-ca` 保存无凭证的 `capture-session.json` 和独立的版本化代理快照 `proxy-backup.v1.json`。停止时恢复原代理值、类型和缺失状态，只按 SHA1 指纹移除本次新增的 CA；原有证书保留。恢复失败保留记录并阻止覆盖。正常退出、信号和可处理异常会尝试恢复；强制终止或断电后需重新运行恢复流程，不能保证终止瞬间自动还原。

历史 `proxy-backup.json` 原件始终保留。旧格式只保存匹配到的字符串，不能还原注册表类型和原始缺失状态，因此只读标记为 `LEGACY_PARTIAL`，不自动迁移或恢复；无未完成事务时，新捕获从当前完整状态创建独立 V1 快照。已有 V1 恢复记录继续支持读取，未知或损坏记录会阻止新捕获。

CA 是否已信任通过 Windows .NET `X509Store(CurrentUser, Root)` 只读枚举并精确匹配 SHA1 指纹：`FOUND` 为匹配到，`ABSENT` 为完整枚举后未匹配，`ERROR` 为无法可靠查询并阻止系统修改。`certutil` 错误码只用于诊断，不能据此推断证书不存在。

仅恢复上次未完成事务，不开始捕获：

```bash
node tools/capture-credentials.mjs --recover
```

此恢复命令同样先询问确认。网页抓包入口仍由服务端只读白名单阻止。

### 2. 启动控制台

```bash
node src/app.mjs            # 默认就是这个
```

浏览器打开 `http://127.0.0.1:17321`。页面上：

- **总览与Explorer**：浏览已有快照、可靠性、库存和原始响应；刷新须已有READY会话。
- **城市、生产、订单及专业玩法**：显式探测、选择具体操作、生成计划、检查预算并授权。
- **Tasks / Dailies / Loop**：准备原Workflow有限执行图，缺证业务显示原因。
- **Workflow与历史**：节点编辑、运行状态、逐场/批次/动作查询、拒绝及UNKNOWN审计。
- **账号与设置**：账号切换、独立配置、资产诊断和显式普通凭证JSON导入（仅新增、重复拒绝，保存后需单独连接）；网页扫码/抓包及真实凭证回显未开放。

---

## 命令行

```bash
node src/app.mjs <子命令> [参数]
```

| 子命令 | 作用 |
|---|---|
| `console`（默认） | 起本地网页控制台 |
| `selftest` | 离线自检（协议帧 / LZ4 / 账号仓库 / 素材索引 / 二维码 / 海面计划 / 活跃度宝箱 / 每日赠礼） |
| `probe` | 连接并长连，只观察服务端推送，不发任何业务请求 |
| `connect [秒]` | 连接并保持指定秒数 |
| `state` | 采集一遍只读状态集（`--raw` 原样、`--out` 写 `data/state.json`） |
| `worlds [worldId\|all]` | 账号下的区服列表与角色位置 |
| `accounts <list\|use\|label\|remove\|show>` | 多账号管理 |
| `config [表名]` | 列出本地配置表 / 打印某张表 |
| `actions` | 列出所有动作及其协议消息名 |
| `act <id> [k=v …]` | 动作目录和只读能力保留；独立游戏写在读凭证前拒绝 |
| `loot [--dry]` | 原领取清单dry保留；写入改用页面具体Function |
| `tasks [--dry]` | 原任务只读/dry保留；统一Tasks入口选择具名任务 |
| `dailies [--dry] [--paid]` | 原日常只读/dry保留；统一入口只支持已证驱动，--paid不解除D6 |
| `heroes [--dry]` | 原英雄只读/dry保留；写使用统一计划授权 |
| `world [--dry] [--speed-up] [--reroll]` | 原海面只读/dry保留；写使用原OperationService |
| `field [gridIdx]` | 资源田只读报告；独立占领/放弃写拒绝 |
| `loop [--rounds N] [--every 秒]` | 旧独立写循环拒绝；页面有限Loop准备原Workflow，不开放无限循环 |

**游戏写入使用已有READY Session上的具体计划与单次或有限run授权**，同时检查账号、连接代次、Origin/CSRF、预算、D6和持久化。`--yes`、`CW_ALLOW_MUTATE=1`、`--paid`或`confirm:true`都不能单独授权，也不能恢复关闭的独立写入口。

常用环境变量：`CW_ACCOUNT`（选账号）、`CW_PORT`（控制台端口）、`CW_DATA_DIR`、
`CW_CONFIG_PACK`、`CW_PROXY_PORT`、`CW_NO_BROWSER`、`CW_DEBUG`。

---

## Game Data Explorer（MVP 只读）

在现有控制台的「数据探索器」页中，点击「读取已有快照」浏览当前账号最近一次手动采集的 Snapshot。按 12 个业务域筛选，或搜索业务名称、Request、Response；左侧选择查询，右侧同时展开原始 JSON 与已有业务解析。目录唯一来源为 `src/data-catalog.mjs`：48 项查询，其中 28 项有解析视图（包括钓鱼图鉴），另外 20 项展示原始响应。

只读接口：`GET /api/data-explorer?account=<精确账号ID>&domain=<可选业务域ID>`。返回查询名称、响应类型、解析来源、`SUCCESS` / `FAILED` / `NOT_EXECUTED`、采集时间、错误、`raw` 与 `parsed`；只读取已有 `session.snapshot`，不创建 Runtime、不连接或刷新游戏。失败和未执行的响应及解析为 `null`，不会被替换为成功的空数组或零值。

「复制脱敏 JSON」和「导出脱敏 JSON」保存当前筛选结果，沿用服务端递归脱敏。新采集的原始解码响应保存在 `snapshot.raw`；超出 JavaScript 安全整数范围的 int64 以十进制字符串保存。业务模块继续使用既有归一化数据。旧快照仅有归一化数据时，界面会提示无法恢复之前的整数精度，可通过原有手动刷新获得新快照。

原有任务、海面、英雄、日常的只读页面和业务模块继续复用；旧通用游戏写操作路由保持关闭；明确业务写走原受控接口。Explorer 不包含 48 项入口查询以外的额外探针，也不为没有解析器的字段推测含义。

---

## 居民订单策略（STEP 3A，只读模拟）

「居民订单策略」页可添加、编辑、删除、上下移动规则，逐条配置启用状态及失败建议。物品按配置表或缓存响应中的原始 ID 匹配；名称只用于展示，不自动建立名称到 ID 的映射。规则配置按账号独立保存在被 Git 忽略的 `data/order-rules.json`，不写入账号凭证或 Snapshot。恢复默认只复制到编辑器，点击保存后才持久化。

Rule Contract v1：

```json
{
  "version": 1,
  "enabled": true,
  "rules": [
    {
      "id": "rule-001",
      "priority": 1,
      "type": "MIN_EXPERIENCE",
      "enabled": true,
      "params": { "value": 700, "operator": "GT" },
      "onFail": "KEEP"
    }
  ]
}
```

支持 ITEM_FORBIDDEN / ITEM_REQUIRED（params.itemIds）、MIN_EXPERIENCE（value 与 GT/GTE）、MAX_ITEM_COUNT（itemId 与 value）、INVENTORY_AVAILABLE（空参数）。另支持 MAX_PRODUCTION_WAIT（用户明确非负安全整数秒 value）：比较原队列、效果与同次可信时间的等待投影，未知转人工检查，通过后仍须真实库存；每次写前重新调查，不自动排产或收取，也不授予免费刷新资格。倒计时变化不解除同一订单拒绝；生产配置变化使原授权失效。另支持 OBSERVED_ORDER_COUNT（明确非负 int32 value 与 LT/LTE）：只比较本轮原响应 orderNum，缺失、显示默认零、错型或跨账号来源转人工检查；周期仍未知，不代表每日剩余额度、已领奖档位或奖励资格。每次提交前重新调查，计数变化和重启均不解除既有拒绝记忆。另支持 LOCAL_TIME_WINDOW（start/end 为 HH:mm，timeZone 必须为 Asia/Shanghai）：用户明确配置每日本地策略时窗，起点包含、终点不含，可跨午夜；两端必填且不同。本地时钟未知转人工检查，写前及实际发送回调重核窗口；它不提供服务器日界、免费刷新资格或定时运行授权，本地跨日不解除原拒绝记忆。priority 唯一且按升序评估；禁用规则 SKIPPED，首个 FAIL 或 UNKNOWN 后停止。FAIL 按独立 onFail=KEEP/REFRESH/REVIEW 给建议；UNKNOWN 转人工检查。全部规则通过后独立检查库存：充足建议提交，不足建议保留，缺失或不安全数量建议人工检查。默认配置关闭、规则为空；配置无效时安全回落，不覆盖坏文件。

本地接口（均要求精确 account ID）：

- GET /api/order-rules：读取账号配置、默认配置、规则类型和带来源的物品 ID。
- POST /api/order-rules，body={config}：只保存账号独立规则 JSON。
- POST /api/order-rules/preview，body={config}：用当前编辑配置对已有 Snapshot 模拟，不保存配置、不创建 Runtime、不发游戏请求。

预览复用 surveyWorld() 的现有需求、经验和库存解析，显示实际缓存订单数、规则轨迹、首败、库存事实和解释。四个订单独立使用同一份库存，未跨订单预留，不能将各单建议视为可同时执行的提交计划。此Snapshot模拟接口不提交、刷新或消耗资源；受控订单执行使用下文独立计划链。普通/特殊订单基础金币已有配置预览，最终加成、取整和事前总金币仍缺证，MIN_GOLD不开放。

---

## 自动闯关（STEP 4）

现有「自动闯关」页和账号级Stage Runner保留。配置仅用于明确启动的本次运行，示例：

```json
{
  "enabled": false,
  "retryDelaySeconds": 10,
  "maxAttempts": null,
  "maxStage": null,
  "stopOnDefeat": false
}
```

总尝试次数包含胜利和战败；留空不限制。仅明确战败才等待配置间隔并重试同一关，成功后清零连续失败并推进本地预期关卡。每次响应必须带本次关卡号和显式布尔 `stats.isLeftWin`。超时、断线、顶号、解码错误、未知结果及无法归因的 Prompt 立即停止，不自动重发；不发送跳过请求。当前运行内存窗口最多200条；逐场事件另由原stage-history持久化，重启仅可查询，不恢复战斗、等待或授权。首败停止可在页面明确开关。

**主线阵营映射已由 STEP 4-B1 授权。** 仅 `MAINLINE_CHALLENGE` 的 `ChallengeStageRequest → ChallengeStageResponse` 使用 `PLAYER_SIDE_LEFT`，玩家获胜等于 `stats.isLeftWin`。依据 STEP 4-A 第 137 关真实响应：16 个装备/徽章实例 UID 唯一匹配左队、右队命中 0。证据路径和 SHA256 记录在 `src/stages.mjs` 的 `MAINLINE_SIDE_AUTHORIZATION`；无需运行时读取本地诊断材料。生产适配器要求响应实际存在 `battleType=BT_MAINLINE(1)`，继续检查胜负字段自有布尔值和响应关卡。未知模式、其他请求/响应或其他 battleType 仍以 `SIDE_UNVERIFIED` 拒绝；核心 Function 未提供可信适配器时也仍拒绝。HTTP、配置和环境变量不能指定阵营或扩大授权范围。

接口均要求精确 `account` ID；写入口同时校验同源 Origin、JSON 和页面 CSRF：

- `GET /api/stages`：只读已有 Runner 状态，不创建 Runtime、不触发查询。
- `POST /api/stages/start`：body=`{config,confirm:true}`，进入独立写操作授权；还需配置启用、已有 READY 会话、已授权的主线阵营适配器及无其他在途任务。核心 Function 另要求 `allowMutate:true`。
- `POST /api/stages/stop`：取消本地后续执行和重试等待，不发送游戏请求。

同账号只能有一个 Runner；不同账号独立。运行或旧战斗未决时阻止完整采集，已有 Snapshot/Explorer 浏览不受影响。页面关闭不停止服务端任务，再打开读取状态即可。断开、删除和关闭控制台会取消 Runner。停止无法撤销已发出的战斗；未决请求锁保留，迟到结果不能更新历史或新运行。结果不确定时必须显式重新连接并取得新的登录关卡，不能原连接直接重启。

胜利后的 `stage + 1` 是本地预期进度；界面明确标注，不冒充重新读取的服务端状态。服务器拒绝、关卡不符或未知上限均停止。既有通用游戏写路由保持关闭；订单策略模拟只读，具体提交走原受控Operations接口。

---

## 工作原理

### 通信

- 网关 `wss://dhyaoj-gate.khlgamen.com/ws`，首次连接直接发 `LoginRequest`，没有独立的挑战握手。
- 自定义帧：`int32 BE 长度` + `uint8 版本=2` + `int32 BE 序号` + `uint8 名称长度` + `ASCII 名称`
  + `uint8 标志`（0 = 原始，非零 = LZ4）+ protobuf 载荷。
- 协议定义来自客户端自带的 protobufjs **static module** 产物 —— 它没有任何反射元数据，
  字段号和字段名只能从生成的 `encode` / `decode` 函数体里读回来（`tools/describe.mjs`）。

### 账号与区服

- 账号身份是 `login.eworldParams.openId`；机密是同一处的 `token` / `sign` / `timestamp`。
- 网关不区分区服：一个 socket 服务整个账号，区服由 `LoginRequest.worldId` 选择。
- 选服界面的键是 `GameWorldInfo.worldId`（角色**出生**服），`roleInfo.worldId` 是**当前**服；
  合服之后两者不同，服务端会把出生服键解析到承接服 —— 不了解这一点会把合服误读成 bug。
- **一个账号同时只能有一条连接**：第二条会话登录会把第一条顶掉（`SCChannelExpired`）。多账号各一条。

### 数据来源

- **配置表**：客户端运行时从 CDN 拉独立 bundle `config_cn`（591 张表）。微信缓存里有副本，
  `tools/sync-config.mjs` 把它快照到 `work/cdn/`。游戏里的 itemId / heroId / buildingType
  本身就是中文字符串（`生鱼片`、`杰森`、`食品厂`）。
- **素材**：Cocos 远程 bundle 里的 FairyGUI 图集。`tools/sync-art.mjs` 从微信缓存还原文件名并镜像，
  `src/fgui.mjs` 从 `FGUI` 二进制里解出「名字 → 图集矩形」，页面直接用 CSS `background-position`
  裁切，不需要任何图像处理依赖。
- **地图**：资源田的 grid 数据只在客户端地图 bundle 里，`work/cdn/world_map.*.json`。
- 这些都在 `.gitignore` 里，不进仓库；缺了程序会如实降级而不是编造。
- 默认协议、配置和地图加载使用 `docs/RUNTIME_ASSETS.json` 中的保留来源、SHA-256、长度及格式检查，并直接消费已校验字节。缺地图只影响地图能力；配置缺失不会自动搜索用户缓存。显式配置导入与手动同步入口保留，恢复资产时不自动改写清单。

---

## 目录结构

```
src/
  app.mjs        CLI 入口与各子命令
  client.mjs     网关连接、心跳、请求/推送的路由与 prompt 归属
  codec.mjs      自定义帧 + protobuf 编解码
  proto.mjs      协议表加载
  accounts.mjs   多账号存储（data/accounts.json）
  config.mjs     配置表加载与资源名映射
  game.mjs       只读状态集与精确原始快照
  data-catalog.mjs  Explorer 唯一数据目录与快照视图
  order-rules.mjs   居民订单纯函数规则评估
  order-rules-store.mjs 账号独立规则 JSON 保存
  stages.mjs     账号级串行闯关、停止与未决请求保护
  tasks.mjs      主线/支线/成就/订单档位
  dailies.mjs    日常任务、活跃度宝箱、每日赠礼
  heroes.mjs     英雄养成
  world.mjs      海面世界：建造/工厂/订单/资源田
  loop.mjs       自动循环
  actions.mjs    动作目录（请求名、参数、是否改状态）
  server.mjs     HTTP + SSE，多会话
  page.mjs       控制台页面（单文件：CSS + HTML + 内联 JS）
  art.mjs        实体 → 图标名 → 图集矩形
  fgui.mjs       FairyGUI 二进制解析
  lz4.mjs        LZ4 解压
  selftest.mjs   离线自检
  vendor/        第三方单文件（二维码编码器，MIT）
tools/
  capture-credentials.mjs  抓凭证（CLI，带确认与回滚）
  mitm-proxy.mjs           本地 MITM 代理（由捕获事务控制器调用）
  mitm-ca.mjs              本地 CA 生成/安装/卸载
  proxy-settings.mjs       HKCU 代理读写与还原
  sync-config.mjs          镜像 config_cn
  sync-art.mjs             镜像 UI 贴图并建索引
  describe.mjs             从 static module 里读回字段
  build-names.mjs          抠出内联的 id→名字枚举
  wxapkg.mjs               解密并解包 PC 微信小程序包
  probe-*.mjs              只读探针
  selftest-*.mjs           工具侧自检
docs/
  gameplay.md    协议与玩法的详细记录（哪条结论是从哪段客户端代码/哪张表得来的）
```

---

## 安全边界

这些边界是**有意保留**的，不是还没做：

- 写操作绑定具体计划、身份、预算和单次或有限run授权；独立CLI写在读凭证前拒绝，旧参数不能覆盖。
- **不花钻石**。加速只花「加速器」道具（`SpeedUpCostParam.type` 恒为 2；1 = 钻石、3 = 广告都不使用）。
  普通免费点金使用独立零支出合同；钻石点金和未证折扣购买保持拒绝，`--paid`不覆盖D6。
- **不买任何付费礼包**（含 12 元那个「自动生产」礼包）。
- 建造/升级材料不齐时，客户端会弹「用钻石补」——本工具**不补**，跳过等下一轮。
- 免费刷新缺权威次数/冷却，规则可给建议，执行冻结；`--reroll`不能补足证据。
- **不使用** `LoginRequest` 的 `testAccount` / `superToken` —— 那是绕过鉴权的开发者后门。
- 抓包系统改动仅在**当前用户**范围内（`certutil -user`、HKCU），CLI 显式确认后才开始；恢复采用写前记录、精确快照、进程锁和退出钩子。强制终止后的恢复需再次运行恢复命令。
- 凭证保存在本机受控账号文件，普通日志、HTTP/SSE 和快照导出递归脱敏；网页不提供原始凭证回显。
- 原有限Loop每轮重新探测和规划，共享持久拒绝/UNKNOWN；未知结果不自动重放，WAIT不解除拒绝或未决。冷却和游戏日界仅接受权威来源，Service通用cooldown/gameDay覆盖仍未闭合。
- 原操作历史页的执行记忆可按精确运行/工作流筛选跨轮摘要：按原角色和世界分别显示原始已确认成功、UNKNOWN、拒绝与未执行次数；仅完整可靠的前后库存给出精确净变化。缺证显示未知，冲突排除、重复去重，原UNKNOWN追加复核后仍不计原始成功。摘要只覆盖本工具历史，不代表游戏完整资源、服务器配额或游戏日界，也不提供执行或重试权限。
- 同一记忆页分别展示原始批次停止原因、动作原因/错误，以及记录的后续建议。原因保留来源，缺失保持未知；重启恢复提示不冒充原始原因，批次原因不复制到某个动作，后续建议不证明下一轮已跳过。同一记忆页单独显示原Workflow无Operation动作时的暂停、条件分支、日历错过原因及启动时角色/世界归属，不计入Operation动作次数或资源变化。记忆卡可只读打开该精确Workflow运行的原历史，核对原图及原始身份；此导航只读取历史，保留当前图草稿，不加载执行计划。原Workflow历史页保留详细证据；恢复提示与原状态/原因分离，旧身份缺失保持未知。工作流运行ID精确筛选；操作运行/批次/动作/模块ID不推断无动作Workflow，节点筛选不带入整个运行原因。该来源不可读明确未知，其他原动作摘要独立显示；读取不恢复执行。
- 原区服列表只读展示精确角色 ID、列表区服键、出生服与当前世界，区分合服后的字段；查询复用当前账号互斥和会话身份保护。切服按钮及写入口仍关闭：现存角色的目标绑定、禁止隐式新建和结果恢复合同尚未闭合。

---

## 自检

```bash
npm test
node tools/selftest-mitm.mjs
node tools/selftest-registry.mjs
```

`npm test` 保留原自检并运行 `tests/` 下回归。MITM 自检只使用临时 CA、合成协议和本机回环服务；registry 自检使用模拟命令适配器，不访问真实 HKCU 或证书存储。OpenSSL 只生成临时文件。

原有离线检查，覆盖协议帧编解码、LZ4、账号仓库（迁移/选中/替换）、配置表与素材索引、
二维码、海面计划器（含建造与竣工互斥）、活跃度宝箱（日/周两套门槛）、每日赠礼。
工具侧另有 `tools/selftest-mitm.mjs`、`tools/selftest-describe.mjs`、`tools/selftest-registry.mjs`。

---

## 文档

深入细节都在 [`docs/gameplay.md`](docs/gameplay.md)：帧格式、协议表面统计、每一条结论背后的
客户端代码位置与配置表依据、以及踩过的坑（比如日/周活跃宝箱是两张不同门槛的表、
「每日赠礼」的 packId 在客户端里硬编码、建造与升级是两个不同的请求）。

---

## 许可

ISC（见 `package.json`）。`src/vendor/qrcode.mjs` 为第三方单文件，保留其原始版权头。


## PHASE 2：订单与城市受控执行

使用「居民订单策略」保存账号规则，再在「居民订单执行」「城市建设」「生产管理」中读取状态并点击只读探测。勾选具体操作后生成计划，检查操作依据、总材料预算和过期时间，再明确授权执行。计划有效期五分钟；授权绑定账号、Session 代次、规则、配置、生产策略、批次、具体操作和预算，单次使用。

Manual 每批一项；Hybrid 的订单提交逐单授权、刷新可组成具体批次；Automatic 只执行本次选定和授权的清单。新订单和新计划必须重新授权，没有跨批次或无限期后台执行权限。生产策略按账号保存，默认禁用，可限定产品、仅订单缺口及每批上限；推荐选择仍需预览和授权。策略与缺口会在执行前重新检查。

订单、建筑与生产的规划共用一个 `ResourceLedger`；执行共用独立的保守账本，每次消耗前重读余额，旧快照和新收取不会补回已预留预算。同一账号与 Stage、完整采集互斥，不同账号可并行，已有缓存可继续浏览。请求响应与业务成功分开记录，只有权威复读确认目标变化才能成功。停止仅阻止后续操作；已发送未确认的操作保留 UNKNOWN、预算和指纹，不自动重试。

本地文件 `data/production-policy.json`、`data/execution-history.json` 均被 Git 忽略。历史采用原子替换，发送前及每步结果后持久化，包含脱敏的前后状态、规则轨迹、库存、预留和复核结果。异常退出后仅恢复查看，未决批次继续阻止新写入及 Stage，不自动恢复执行；损坏文件保留并阻断执行。现有恢复预览/复读/确认只在严格证明下追加reconciliation：APPLIED限同原连接及代次的零成本Formation完整复读，NOT_APPLIED限持久未派发证明；其他、重连或重启仍STILL_UNKNOWN。不能删除历史或自动重放绕过保护。

生产日报按上海日期汇总本工具历史中已确认的生产开始/收取次数，仅在产出减少与可靠库存增加数量一致时统计收取材料。它不代表游戏完整全天产量。免费刷新配额/冷却缺少可靠来源时，REFRESH 仅显示建议，执行保持禁用；基础金币已有配置预览，但最终金币公式和MIN_GOLD事前资格仍缺可靠来源。钻石、付费礼包及开发者凭证限制不变。

新增接口均要求精确 `?account=<id>`：

| 接口 | 用途 |
|---|---|
| `GET /api/operations` | 缓存视图、运行状态、当前页面 CSRF 上下文；不连接或查询游戏 |
| `POST /api/operations/survey` | 在已有 READY Session 上显式只读采集 |
| `POST /api/operations/plan` | 仅接收模块、模式和候选 actionId，生成服务端计划 |
| `POST /api/operations/authorize` | 精确确认 batchId、planHash、操作列表和预算，返回单次许可 |
| `POST /api/operations/execute` | 使用当前批次的单次许可启动执行 |
| `POST /api/operations/stop` | 停止后续操作，保留已发送操作证据 |
| `GET /api/operations/history` | 按账号查看历史及本工具当日统计；支持 runId 筛选 |
| `GET/POST /api/operations/production-policy` | 读取或原子保存本地账号生产策略 |

新增 POST 同时校验 Host、同源 Origin、JSON 和页面 CSRF 请求头；`confirm:true` 不能单独授权。没有开放 Request 或 Action 通用入口。

能力映射和原始 Inventory 的增量见 [PHASE 2 Capability Delta](docs/PHASE_2_CAPABILITY_DELTA.md)。原始Master对应工作区的`docs/baseline.md`，原输入保留。当前状态仅见ROADMAP_RECONCILIATION；PHASE2报告是历史证据。Owner已授权按原DAG连续离线开发，真实操作仍需R7后单独批准。


## PHASE 4：原路线图对齐与联盟科技

原Master的PHASE4是Alliance C301–C307；[PHASE4报告](docs/PHASE_4_RECONCILIATION.md)保存2026-11-11历史快照，当前范围和进度仅见[ROADMAP_RECONCILIATION](docs/ROADMAP_RECONCILIATION.md)。PHASE 3 离线交付与 PHASE 2 的真实写入未验收记录继续保留。

联盟页按精确玩家/请求 ID 展示成员、求助、额度和科技。帮助额度或冷却未知仍阻断；DonateFort 仍是堡垒建设。科技配置新增默认关闭的 tech 开关，选择 {techId,targetLevel} 后重新探测，仅允许当前等级加一级。成本取真实赛季配置的 techPointCost + techPointCostGrowth × 当前等级，使用公会科技点或联盟职级科技点；可信 worldId 来自当前 Session，阶段来自 SeasonTaskStage，不能由页面伪造。升级复用原 OperationService 的精确计划、预算、单次授权、账号互斥和执行器；关联响应、科技新读等级和实际扣点全部匹配才确认成功。没有新增通用写入口，D6 继续硬拒钻石。

共享业务执行器的历史新增 SURVEY、RESOURCE_PREFLIGHT、DISPATCH_INTENT、DISPATCHED、RESPONSE / OBSERVATION_ENDED、VERIFY、VERIFIED。DISPATCHED 仅表示调用传输方法；响应和观察结束均不代表业务成功。阶段保存失败在发送前停止，发送后保持 UNKNOWN。旧 orders/city/Stage 自定义执行路径保留原有历史粒度。后续已加入唯一Console跨进程写所有者、有限日周/可信事件和持久历史。恢复仅覆盖上述严格证明子集，其他UNKNOWN继续封锁。离线/合成证据不代表真实账号验收；完整范围和缺口见唯一进度基线。
