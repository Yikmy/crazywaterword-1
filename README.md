# crazywaterword

当前 Web Console 保留显式登录、只读采集、本地账号管理及独立主线 Stage 门控。PHASE 2 增加居民订单、城市建设和生产的具体批次预览、预算授权与执行历史；旧通用游戏写路由、自动循环和网页抓包入口继续关闭。本次交付仅做离线验证，详见 [PHASE 2 验收报告](docs/PHASE_2_ACCEPTANCE.md)。

微信小游戏《疯狂水世界》的**协议侧挂机工具**：不开游戏界面，直接用游戏自己的 WebSocket 协议完成
日常任务、领奖、英雄养成、海面世界的收成品/排产/交单/建造/升级，并附带一个本地网页控制台。

不是模拟器、不是图像识别、不是内存修改 —— 全程只收发游戏客户端本来就会发的那些报文。

---

## 免责声明

**本项目仅供协议分析与学习研究。使用它会违反游戏的用户协议，账号可能被处罚或封禁。**

- 所有请求都由你**自己的账号、自己的凭证**发出，作者不为任何后果负责。
- 请只用你自己的账号测试，**不要**用于批量、代练、工作室或任何形式的牟利。
- 项目刻意保留了一批「不做」的边界（见下方「安全边界」），例如不花钻石、不买付费礼包、
  不使用 `LoginRequest` 里 `testAccount` / `superToken` 这类开发者后门字段。
- 如果你不接受这些，请不要使用本项目。

---

## 它是什么

| 能力 | 说明 |
|---|---|
| 登录 | 用抓包拿到的真实凭证连接网关，支持多账号 |
| 任务 | 主线、支线、成就、每日订单档位奖励的自动领取 |
| 日常 | 17 项日常任务的自动完成 + 任务奖励 + 活跃度宝箱 + 每日免费赠礼 |
| 英雄 | 升级、升星、升技能（判定条件照抄客户端红点逻辑） |
| 海面世界 | 收成品、竣工、建造新建筑、交居民订单、按订单缺口排产、余料升级、加速 |
| 自动循环 | 上面三块按轮执行，可只读探测、可长期挂机 |
| 网页控制台 | 本地页面，中文业务视图，一键领取 / 一键完成 / 自动循环 / 账号与凭证管理 |

## 它不是什么

- 不做手机端抓包，不做云端同步。
- 不做资源田之外的地图争夺（占田需要舰队，多数账号不满足前置条件）。
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

- **总览** —— 账号卡、资源与库存（带游戏自己的图标）、一键领取；
- **挂机** —— 工厂/订单/建筑/空位、资源田报告、执行一轮、自动循环开关；
- **英雄** —— 英雄卡片与养成计划；
- **日常** —— 日常任务表（中文，并说明「为什么不可做」）；
- **账号** —— 多账号切换、扫码添加、凭证查看（默认打码）。

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
| `act <id> [k=v …]` | 手动发一条动作（改状态的要 `--yes`） |
| `loot [--dry]` | 一键领取：邮件、任务、成就、挂机、建筑产物/成品、活跃度宝箱、每日赠礼 |
| `tasks [--dry]` | 主线 / 支线 / 成就 / 每日订单档位 |
| `dailies [--dry] [--paid]` | 日常任务闭环 |
| `heroes [--dry]` | 英雄养成 |
| `world [--dry] [--speed-up] [--reroll]` | 海面世界一轮 |
| `field [gridIdx]` | 资源田报告 / 占田 / 弃田 |
| `loop [--rounds N] [--every 秒]` | 自动循环（`--rounds 0` = 一直跑） |

**任何会改变账号状态的命令都必须显式授权**：CLI 加 `--yes` 或 `CW_ALLOW_MUTATE=1`，
网页请求体里带 `confirm: true`。不加就只打印计划，一个字节都不发出去。

常用环境变量：`CW_ACCOUNT`（选账号）、`CW_PORT`（控制台端口）、`CW_DATA_DIR`、
`CW_CONFIG_PACK`、`CW_PROXY_PORT`、`CW_NO_BROWSER`、`CW_DEBUG`。

---

## Game Data Explorer（MVP 只读）

在现有控制台的「数据探索器」页中，点击「读取已有快照」浏览当前账号最近一次手动采集的 Snapshot。按 12 个业务域筛选，或搜索业务名称、Request、Response；左侧选择查询，右侧同时展开原始 JSON 与已有业务解析。目录唯一来源为 `src/data-catalog.mjs`：48 项查询，其中 27 项复用 `summarize()`，另外 21 项直接展示原始响应。

只读接口：`GET /api/data-explorer?account=<精确账号ID>&domain=<可选业务域ID>`。返回查询名称、响应类型、解析来源、`SUCCESS` / `FAILED` / `NOT_EXECUTED`、采集时间、错误、`raw` 与 `parsed`；只读取已有 `session.snapshot`，不创建 Runtime、不连接或刷新游戏。失败和未执行的响应及解析为 `null`，不会被替换为成功的空数组或零值。

「复制脱敏 JSON」和「导出脱敏 JSON」保存当前筛选结果，沿用服务端递归脱敏。新采集的原始解码响应保存在 `snapshot.raw`；超出 JavaScript 安全整数范围的 int64 以十进制字符串保存。业务模块继续使用既有归一化数据。旧快照仅有归一化数据时，界面会提示无法恢复之前的整数精度，可通过原有手动刷新获得新快照。

原有任务、海面、英雄、日常的只读页面和业务模块继续复用；游戏写操作路由保持关闭。Explorer 不包含 48 项入口查询以外的额外探针，也不为没有解析器的字段推测含义。

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

支持 ITEM_FORBIDDEN / ITEM_REQUIRED（params.itemIds）、MIN_EXPERIENCE（value 与 GT/GTE）、MAX_ITEM_COUNT（itemId 与 value）、INVENTORY_AVAILABLE（空参数）。priority 唯一且按升序评估；禁用规则 SKIPPED，首个 FAIL 或 UNKNOWN 后停止。FAIL 按独立 onFail=KEEP/REFRESH/REVIEW 给建议；UNKNOWN 转人工检查。全部规则通过后独立检查库存：充足建议提交，不足建议保留，缺失或不安全数量建议人工检查。默认配置关闭、规则为空；配置无效时安全回落，不覆盖坏文件。

本地接口（均要求精确 account ID）：

- GET /api/order-rules：读取账号配置、默认配置、规则类型和带来源的物品 ID。
- POST /api/order-rules，body={config}：只保存账号独立规则 JSON。
- POST /api/order-rules/preview，body={config}：用当前编辑配置对已有 Snapshot 模拟，不保存配置、不创建 Runtime、不发游戏请求。

预览复用 surveyWorld() 的现有需求、经验和库存解析，显示实际缓存订单数、规则轨迹、首败、库存事实和解释。四个订单独立使用同一份库存，未跨订单预留，不能将各单建议视为可同时执行的提交计划。现有游戏写操作白名单保持关闭；没有提交、刷新、生产或资源消耗。最低金币规则尚无可靠的订单金币奖励解析，本阶段不提供。

---

## 自动闯关（STEP 4）

新增独立「自动闯关」页和账号级 Stage Runner。配置仅用于本次运行，不自动持久化：

```json
{
  "enabled": false,
  "retryDelaySeconds": 10,
  "maxAttempts": null,
  "maxStage": null
}
```

总尝试次数包含胜利和战败；留空不限制。仅明确战败才等待配置间隔并重试同一关，成功后清零连续失败并推进本地预期关卡。每次响应必须带本次关卡号和显式布尔 `stats.isLeftWin`。超时、断线、顶号、解码错误、未知结果及无法归因的 Prompt 立即停止，不自动重发；不发送跳过请求。历史最多保留当前运行最近 200 条，随控制台重启清空。

**主线阵营映射已由 STEP 4-B1 授权。** 仅 `MAINLINE_CHALLENGE` 的 `ChallengeStageRequest → ChallengeStageResponse` 使用 `PLAYER_SIDE_LEFT`，玩家获胜等于 `stats.isLeftWin`。依据 STEP 4-A 第 137 关真实响应：16 个装备/徽章实例 UID 唯一匹配左队、右队命中 0。证据路径和 SHA256 记录在 `src/stages.mjs` 的 `MAINLINE_SIDE_AUTHORIZATION`；无需运行时读取本地诊断材料。生产适配器要求响应实际存在 `battleType=BT_MAINLINE(1)`，继续检查胜负字段自有布尔值和响应关卡。未知模式、其他请求/响应或其他 battleType 仍以 `SIDE_UNVERIFIED` 拒绝；核心 Function 未提供可信适配器时也仍拒绝。HTTP、配置和环境变量不能指定阵营或扩大授权范围。

接口均要求精确 `account` ID：

- `GET /api/stages`：只读已有 Runner 状态，不创建 Runtime、不触发查询。
- `POST /api/stages/start`：body=`{config,confirm:true}`，进入独立写操作授权；还需配置启用、已有 READY 会话、已授权的主线阵营适配器及无其他在途任务。核心 Function 另要求 `allowMutate:true`。
- `POST /api/stages/stop`：取消本地后续执行和重试等待，不发送游戏请求。

同账号只能有一个 Runner；不同账号独立。运行或旧战斗未决时阻止完整采集，已有 Snapshot/Explorer 浏览不受影响。页面关闭不停止服务端任务，再打开读取状态即可。断开、删除和关闭控制台会取消 Runner。停止无法撤销已发出的战斗；未决请求锁保留，迟到结果不能更新历史或新运行。结果不确定时必须显式重新连接并取得新的登录关卡，不能原连接直接重启。

胜利后的 `stage + 1` 是本地预期进度；界面明确标注，不冒充重新读取的服务端状态。服务器拒绝、关卡不符或未知上限均停止。既有通用游戏写路由保持关闭，居民订单策略仍只读。

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

- 写操作一律要 `--yes` / `CW_ALLOW_MUTATE=1` / 网页 `confirm: true`，且在连网关**之前**就检查。
- **不花钻石**。加速只花「加速器」道具（`SpeedUpCostParam.type` 恒为 2；1 = 钻石、3 = 广告都不使用）。
  点金与折扣店默认跳过，要勾 `--paid` 才做。
- **不买任何付费礼包**（含 12 元那个「自动生产」礼包）。
- 建造/升级材料不齐时，客户端会弹「用钻石补」——本工具**不补**，跳过等下一轮。
- 默认**不拒单**（`--reroll` 才开，且跟客户端一样拒绝重刷）。
- **不使用** `LoginRequest` 的 `testAccount` / `superToken` —— 那是绕过鉴权的开发者后门。
- 抓包系统改动仅在**当前用户**范围内（`certutil -user`、HKCU），CLI 显式确认后才开始；恢复采用写前记录、精确快照、进程锁和退出钩子。强制终止后的恢复需再次运行恢复命令。
- 凭证保存在本机受控账号文件，普通日志、HTTP/SSE 和快照导出递归脱敏；网页不提供原始凭证回显。
- 账号的自动循环**每轮都是「先只读探测 → 算计划 → 再执行」**，所以没什么可做时计划自然为空，
  不会重复发同样的请求；被服务端拒过的动作会跨轮记住不再重试。

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

本地文件 `data/production-policy.json`、`data/execution-history.json` 均被 Git 忽略。历史采用原子替换，发送前及每步结果后持久化，包含脱敏的前后状态、规则轨迹、库存、预留和复核结果。异常退出后仅恢复查看，未决批次继续阻止新写入及 Stage，不自动恢复执行；损坏文件保留并阻断执行。暂无用于清除未决的网页按钮，应保留证据等待人工复核，不能删除历史来绕过保护。

生产日报按上海日期汇总本工具历史中已确认的生产开始/收取次数，仅在产出减少与可靠库存增加数量一致时统计收取材料。它不代表游戏完整全天产量。免费刷新配额/冷却缺少可靠来源时，REFRESH 仅显示建议，执行保持禁用；MIN_GOLD 继续缺少可靠金币奖励来源。钻石、付费礼包及开发者凭证限制不变。

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

能力映射和原始 Inventory 的增量见 [PHASE 2 Capability Delta](docs/PHASE_2_CAPABILITY_DELTA.md)。原始 Master Development Plan 对应工作区的 `docs/baseline.md`，执行状态见验收报告；用户提供的原始输入文件保留在工作区，不混入功能提交。本阶段结束后等待验收，不自动开始 PHASE 3。
