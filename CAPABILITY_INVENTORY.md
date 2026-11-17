# CrazyWater Platform Capability Inventory

审计日期：2026-11-10。对象：`\\zhangnas\app\crazywaterword`，基线提交 `61ce3c020ea8abedd9e70387c88528b6a8fe055b`。参考对象：`C:\Users\zyk-o\Documents\crazywaterword`，`main@6c2825a4d7dda17bf894b45744d2fd39e6a05499`；只读，工作区未修改。

本文是当前单一能力主清单。依据提交后的实际 Function、调用者、API 白名单、页面事件、测试、已恢复本地协议/配置及参考实现；README、旧交接报告和名称相似性不构成功能实现证据。所有路径未特别注明时相对开发仓库，`reference/src/...` 特指参考仓库，绝不计作当前已有 Function。表中行号对应此基线，后续变更需重新定位。

本轮只执行本地源码读取、离线测试、已授权基线提交和本文整理；没有游戏登录、捕获、真实业务请求、Runner 启动、代理/CA 修改或推送。各表中的 Request 是实现证据，不表示本轮执行过。

## 1. Git 基线与验证

| 项目 | 实际结果 |
| --- | --- |
| 根目录 / 分支 | `\\zhangnas\app\crazywaterword` / `main` |
| 原 HEAD | `4094a69b76bb0e6ad6c61865ae60fe6640ebdb8c` |
| 新 HEAD | `61ce3c020ea8abedd9e70387c88528b6a8fe055b` |
| 提交信息 | `chore: establish platform development baseline` |
| origin | `https://github.com/gy520187/crazywaterword.git`，未推送 |
| 范围 | 48 个变更文件，8312 行新增、1885 行删除；提交树共 80 文件 |
| staging | 明确文件列表；检查 staged diff 后提交，未使用 `git add .` |
| npm test | 29 组既有 selftest + 370 项 Node 测试通过；0 失败；原有 art 检查按自身条件跳过 |
| 语法 | 46 个候选 `.mjs` 文件 `node --check` 通过 |
| whitespace | 工作区及 staged `git diff --check` 通过；仅修正一处测试文件末尾多余空行，未改断言 |
| 锁文件 | `package-lock.json` 无变更；未更新依赖 |
| 提交后 | 工作区一度干净；本文为基线之后新增、待审阅的未提交文档 |

纳入：生产代码、页面、API、居民订单规则、Stage Runner、数据目录、全部新增测试、捕获/代理/证书修复工具、B2 安全 Harness helper 和必要 README 更新。未进行 amend/reset/rebase/checkout/clean。

安全审查实际读取候选源码/测试，以及 ignored E2E 文本内容；合成凭证确认属于测试夹具。未发现需要纳入基线的源码含真实秘密；未将运行材料按文件名直接视为安全。116 份 E2E 文本虽未发现明文鉴权材料/私钥 PEM，仍包含玩家资料、实例 UID 和真实游戏状态，全部保持本地 ignored，不随基线提交。`data/accounts.json` 只核对元数据，不读取账户凭证内容。

| 未提交 / 排除项 | 原因与保留方式 |
| --- | --- |
| `data/` | 账号凭证及本地配置/数据；保持 ignored，不删除 |
| `work/`（含所有 E2E 报告和证据） | 真实响应、玩家资料、运行日志、缓存、可再生成客户端解包资源；保持 ignored，不删除 |
| `node_modules/` | 锁定依赖可由 npm ci 恢复；保持 ignored |
| 外部 `~/.cw-ca/` 等私钥、CA、代理/事务材料 | 不属提交范围；本轮不改真实系统或这些材料 |
| `docs/blueprint.md` | 提交之后出现的外部 0 字节文件；保持原样、未 staging，不当作能力依据 |
| `CAPABILITY_INVENTORY.md` | 本文在基线完成后产生，留待产品规划验收；未自动创建第二个提交 |

离线测试原始日志在本机 `%TEMP%/cw-baseline-npm-test-20261110.log`。协议、配置和客户端摘录在 ignored `work`，基线 clone 后需要按已有资源恢复工具/来源记录重建，不能假定 Git 包含运行资产。

## 2. 状态口径

| 状态 | 严格含义 |
| --- | --- |
| EXISTING_UI | 当前允许使用的 UI、API 和实际业务/本地功能链均存在 |
| EXISTING_API | 当前允许使用的 API 和业务实现存在，缺少完整 UI |
| EXISTING_FUNCTION | 当前业务 Function 已实现，未接入可用产品入口；旧 CLI 可调用也在此类 |
| DATA_ONLY | 已有采集/解析；不代表对应玩法写操作已经实现 |
| PROTOCOL_ONLY | 当前仅协议或客户端调用线索，无目标项目业务 Function |
| PARTIAL | 已有部分实现并能指出具体缺口；不能泛指“未实测” |
| NOT_FOUND | 已完成相关目标源码/协议/客户端链搜索，未找到所述能力；不表示服务端必定不支持 |

API 白名单以 `src/server.mjs` 的分派前检查为准：保留 handler、旧按钮或旧文档不等于当前开放。表中协议“无同名 Response”表示生成类型没有该名称，不能推断没有反馈，也不能编造 Response 名。只读游戏查询、本地策略保存和游戏写操作分开标注；本地 POST 不等于游戏写操作。

## 3. 产品业务域树

下树按用户的 18 个产品域组织。`[参考]` 只表示本地参考仓库可复用，详细调用链见后文；`[协议]` 不代表完整功能。

```text
CrazyWater Platform
├─ 01 平台与账号管理
│  ├─ 账号新增/切换/删除、凭证导入、单账号连接 Single-flight
│  ├─ Session/Runtime 隔离、断开/失效/删除清理、心跳与首错诊断
│  └─ 本机 Console、只读白名单、写确认、脱敏与凭证捕获恢复工具
├─ 02 数据采集与 Game Data Explorer
│  ├─ 48 查询 → Snapshot → 27 已有解析 + 21 原始响应
│  └─ 12 数据域、搜索、双视图、状态/时间/错误、脱敏复制/导出
├─ 03 城市建设
│  ├─ 建筑/升级状态、规划、建造与升级 Function
│  └─ [协议] 工人分配；现有加速仅允许加速器道具，非钻石
├─ 04 资源与生产
│  ├─ 库存/资源、产物收取、排产、船体/漂浮物海面动作
│  └─ [参考] 工厂独立规划；当前跨订单库存预留存在缺口
├─ 05 居民订单
│  ├─ 需求/缺口/经验解析、旧提交/刷新 Function
│  ├─ 规则编辑/保存、优先级短路、KEEP/REFRESH/REVIEW、只读模拟
│  └─ 缺：新规则到写执行的授权桥接、跨单库存分配、统一持久历史
├─ 06 英雄养成
│  ├─ 英雄/装备/任命/碎片调查、规划、现有成长 Action
│  └─ [参考] 独立 heroGrow、装备/宠物模块；详见各项真实链
├─ 07 阵容与战斗编队
│  ├─ 当前主线阵容读取、已解锁阵型模板 ID
│  ├─ [协议+客户端] SaveFormation、布局重排、换人、解锁
│  └─ 缺：当前项目保存/应用 Function、UI、闯关前确认；模板≠完整队伍存档
├─ 08 主线闯关
│  ├─ 单账号串行 Runner、主线 LEFT 授权、严格结果/关卡检查
│  ├─ 战败重试、stopOnDefeat、总次数/目标关卡、停止与迟到保护
│  └─ 已有 10–11 秒胜利后随机间隔、倒计时、限频停止；真实效果待验收
├─ 09 日常与成长任务
│  ├─ 主/支线、日常、成就调查/规划/领奖 Function
│  └─ 日常驱动注册表、活动/免费奖励等已实现动作与占位探测分列
├─ 10 联盟与公会
│  ├─ 公会摘要、科技、订单数据；当前日常部分为 probe
│  └─ [参考] 公会订单/舰队/福利；[协议] 科技升级与重置
├─ 11 互助、捐赠与求助
│  ├─ [当前数据] GuildAid 等探测
│  └─ [协议/参考] 求助/协助/捐赠，不能把查询认作执行
├─ 12 舰队与海战
│  ├─ 舰队/货船/海盗/Boss 数据；当前海面模块与独立海战区别记录
│  └─ [参考] 海盗、装载/船长/补给、相关自动链；主线授权不适用
├─ 13 世界地图与资源田
│  ├─ 海域开关/世界状态、资源田与雷达数据
│  └─ [参考] 雷达/世界地图动作；未迁入不计当前已实现
├─ 14 博物馆与寻宝
│  ├─ [当前] Museum 只读 probe/占位
│  └─ [协议/参考] 展陈/收益/探险、独立寻宝执行，分开记录
├─ 15 活动与赛季
│  ├─ 周活动/赛季/周订单/限时玩法数据
│  └─ 现有日常奖励驱动与纯协议活动逐项区分
├─ 16 招募、商店与资源管理
│  ├─ 招募、商店、挂机/点金等现有 Action 与规划
│  └─ [参考] 贸易港/跑商；现有折扣店 CLI 付费门控风险待修
├─ 17 工作流与自动化调度
│  ├─ 既有固定顺序 runLoop、单模块 survey→plan→run
│  ├─ Stage Runner 独立调度及账号生命周期
│  └─ 缺通用可编辑 Workflow、持久恢复；本轮不引入
└─ 18 其他游戏与开发支撑
   ├─ 藏品/图鉴/宠物等数据、邮件/身份与通用协议请求工具
   └─ wxapkg/协议/配置/图标/FGUI、离线回归、诊断与捕获工具
```

## 4. Function 级能力证据

下表压缩列名，但保留 ID、Function、协议、API/UI、来源、执行性质、程度、代码、测试和复用建议。同一 Function 可以被多个产品域引用；只保留一个权威条目，交叉引用不代表重复实现。


| 产品域 | 权威条目与交叉引用 |
| --- | --- |
| 01 平台与账号管理 | PLT-001—029；账号/连接/Session/权限/安全 |
| 02 数据采集与Explorer | DEX-001—009、DAT-001—048；48查询完整表 |
| 03 城市建设 | BIZ-W01/02/07/11/12/13；BIZ-A05/06/07/22/23/24 |
| 04 资源与生产 | BIZ-W02/06/09/10/12；BIZ-A01/04/08/21/25；参考R14/R16分项 |
| 05 居民订单 | ORD-001—022；BIZ-A18/19/20、W03/04/05/08/09、D23 |
| 06 英雄养成 | BIZ-H01—05；DAT-003/006/007/020；参考R07/R09 |
| 07 阵容与战斗编队 | FRM-001—008；DAT-004/029；PRO-010 |
| 08 主线闯关 | STG-001—017、PLT-021；旧日常BIZ-D03独立列为PARTIAL |
| 09 日常与成长任务 | BIZ-D01—25、BIZ-A02/03/09/10/12/13/16/17 |
| 10 联盟与公会 | DAT-023/027/028；BIZ-D11/12；PRO-001/002；参考R01/R05/R06 |
| 11 互助、捐赠与求助 | BIZ-D13/14；PRO-002；参考R01订单交付不等于任意互助 |
| 12 舰队与海战 | DAT-019/024/025/031/032/044；PRO-003/004/005；参考R02/03/04/05 |
| 13 世界地图与资源田 | BIZ-W14/15/16、A26/27；DAT-026/039；参考R02 |
| 14 博物馆与寻宝 | BIZ-D15、PRO-006/009；参考R11世界宝藏，不是博物馆 |
| 15 活动与赛季 | DAT-030/034/035/037/041/043/046/047；参考R17a—h；协议附录 |
| 16 招募、商店与资源管理 | BIZ-D02/04/06/07/08/19/20/25；参考R10/13/14/15 |
| 17 工作流与自动化调度 | BIZ-L03—09、PLT-043、Stage状态机；通用引擎未找到 |
| 18 其他游戏与开发支撑 | 邮件BIZ-A11、藏品/图鉴/宠物等DAT；PLT-030—042；PRO-007 |

## 平台、账号、Runtime、API、UI 与开发工具盘点（PLT）

审计基线：`61ce3c020ea8abedd9e70387c88528b6a8fe055b`。实际读取当前仓库 `src/server.mjs`、`src/page.mjs`、`src/accounts.mjs`、`src/client.mjs`、`src/capture.mjs`、`src/security.mjs`、`src/app.mjs`、`src/worlds.mjs`、协议/配置/图集模块、全部现有 `tools/*.mjs` 的入口和相关实现；同时读取参考仓库对应账号、捕获、客户端、服务端与工具实现。只做静态审计，没有读取真实凭证文件、运行 GameClient、查询/修改系统代理或证书。

本节状态以**当前产品可达调用链**为准：被 `READ_ONLY_ROUTE` 拒绝的历史路由不能标作 EXISTING_API；CLI 可调用而 Web 不可达的能力标 EXISTING_FUNCTION。这里只描述当前实现与已有测试，测试执行结果由整份清单的本轮验证章节统一记录。

### 平台与账号能力明细

| ID | 域 / 功能 | Function 与 Request → Response | API / UI | 数据来源 / 执行性质 | 状态 / 实现范围 | 代码位置 | 测试 / 复用建议 |
|---|---|---|---|---|---|---|---|
| PLT-001 | 平台：本机 Web Console | `createConsole().listen()`；无游戏请求 | `GET /`；8 个 Tab | PAGE 本地常量 / 本地只读 | EXISTING_UI；默认 `127.0.0.1:17321`，`CW_PORT` 可改，`CW_NO_BROWSER` 阻止自动打开浏览器 | `src/server.mjs:42,1056`；`src/app.mjs:858` | `server-runtime`、页面测试；直接复用 |
| PLT-002 | 账号列表与状态 | `loadStore → describeAccount → accountStatus`；无游戏请求 | `GET /api/accounts`；顶部账号选择器和账号页 | `data/accounts.json` 或旧凭证兼容来源、Session / 本地只读 | EXISTING_UI；列表读取会 `sessionFor` 建立**空 Session 记录**，不会创建 GameClient/Socket | `src/server.mjs:727`；`src/accounts.mjs:57,164` | `server-runtime`、`account-view`；不要把空 Session 等同已启动 Runtime |
| PLT-003 | 账号选择/切换活动账号 | `pickAccount,setActive,saveStore`；无游戏请求 | `POST /api/accounts/active`，`confirm:true`；选择器/使用按钮 | 账号库 / 本地写入 | EXISTING_UI；当前选择切换，不自动登录其他账号 | `src/server.mjs:745`；`src/page.mjs:460`；`src/accounts.mjs:129,135` | `src/selftest.mjs` 账号读写、`account-view`；直接复用 |
| PLT-004 | 账号重命名 | `pickAccount → account.label → saveStore` | `POST /api/accounts/label`，`confirm:true`；账号页重命名 | 账号库 / 本地写入 | EXISTING_UI；空标签归 null | `src/server.mjs:757`；`src/page.mjs:1023` | `account-view` 与账号 selftest；直接复用 |
| PLT-005 | 删除账号及会话取消 | `cancelSession → removeAccount → saveStore → sessions.delete` | `POST /api/accounts/remove`，`confirm:true`；账号页删除 | 账号库、Session / 本地删除和断开 | EXISTING_UI；取消 Runner、loop、待处理登录/采集，断 Socket，阻止旧 generation 发布结果 | `src/server.mjs:768,125`；`src/accounts.mjs:122` | `server-runtime` 删除登录/采集、`stages-api` 删除 Runner；直接复用 |
| PLT-006 | 凭证脱敏元信息展示 | `describeAccount`（不调用 revealAccount） | `GET /api/accounts/credential`；账号页查看脱敏信息/收起 | 账号库 / 本地只读 | EXISTING_UI；不返回凭证全文或原始登录帧；统一 JSON redact | `src/server.mjs:738,576`；`src/page.mjs:1044`；`src/accounts.mjs:164` | `server-runtime`、`account-view`、`data-safety`；直接复用 |
| PLT-007 | 凭证导入、同账号更新和旧单账号读取 | `accountId,accountFromCredential,upsertAccount,toCredential,loadStore,saveStore`；无游戏请求 | 无通用开放 HTTP 导入；CLI 捕获使用 accountStore；CLI `accounts` 管理 | `login/body`,`url/wsUrl` → 版本1账号库，openId 为键 / 本地秘密持久化 | EXISTING_FUNCTION；完整 login 保存，旧 `credentials.json` 仅迁移来源，临时文件 rename 发布；不把失效自动推断为固定 Token 有效期 | `src/accounts.mjs:20,36,57,79,88`；`tools/capture-credentials.mjs:60` | `src/selftest.mjs`、`capture-cli`、`data-safety`；复用当前安全导入 |
| PLT-008 | 鉴权输入校验 | `validateCredentials,validTimestamp` | accounts 导入和显式 connect 前内用；无独立页面 | 凭证对象 / 纯校验 | EXISTING_FUNCTION；必需 normal openId/token/sign/正时间戳；拒绝 developer 字段、账号不一致、非 wss（回环测试 ws 除外）、URL 密码等 | `src/security.mjs:50,60`；`src/server.mjs:200` | `data-safety`；直接复用，不新增鉴权字段 |
| PLT-009 | 显式登录和单账号连接 Single-flight | `connect(session,account) → GameClient.connect(login) → LoginRequest → LoginResponse` | `POST /api/connect`；顶部连接（UI 连接后主动调用一次 refresh） | 当前账号凭证、实时网关 / 登录会话 | EXISTING_UI；同账号 connectionPromise 合并，READY 复用登录响应，不同账号各自 GameClient；成功回填身份 | `src/server.mjs:196,182,785`；`src/client.mjs:87`；`src/page.mjs:470` | `server-runtime`、`client-lifecycle`；直接复用 |
| PLT-010 | 显式断开/关闭/失效清理 | `cancelSession,GameClient.finishConnection,discardSocket,stop` | `POST /api/disconnect`；断开按钮；Console.close() | Session / 会话资源释放 | EXISTING_UI；清理登录 Timer、tick/ack、pending/watchers、Socket、监听器，snapshot 标 stale；FAILED/REJECTED/CLOSED/EXPIRED 同步到 HTTP；手动断开后的轮询不重连 | `src/server.mjs:125,162,791,1073`；`src/client.mjs:172,443` | `server-runtime`、`client-lifecycle`、`stages-api`；直接复用 |
| PLT-011 | 心跳、序号、ACK/NACK、失效通知 | `sendPing/tryHandlePong/tick/handleSeqNo/ack/sendNack`；`PingRequest → PingResponse`、`Ack`,`Nack`,`ResendFailed`,`SCChannelExpired` | Runtime 内部，UI 看连接状态 | 实时传输 / 基础连接控制 | EXISTING_FUNCTION；READY 后立即 Ping，1秒 tick，Ping 超时出 READY，重发失败/被顶号进入终态 | `src/client.mjs:285,293,310,356,378,404` | `client-lifecycle`、selftest；复用，不重写 |
| PLT-012 | 请求关联与迟到响应隔离 | `request,sendWatch,attributePrompt,onMessage`；通用协议 | 所有 Function 的 GameClient | 实时消息 / 关联保护 | EXISTING_FUNCTION；同请求合并，同响应类型的冲突请求拒绝；超时记 lateResponses，旧响应丢弃；Prompt 无可靠归属时不猜测并锁定不确定性 | `src/client.mjs:207,242,266,310` | `client-lifecycle`；直接复用 |
| PLT-013 | 多账号 Session、取消和防旧结果写入 | `sessions Map,newSession,sessionFor,assertCurrent,activeTask` | 全部账号路由；页面切换 | 账号隔离 / 内存生命周期 | EXISTING_FUNCTION；每账号独立 client/snapshot/runner/日志，generation+AbortSignal 管理；不是数据库、不是跨进程账号锁服务 | `src/server.mjs:48,85,109,146,158` | `server-runtime`、`stages-api`；直接复用 |
| PLT-014 | 账号页面请求代次 | `createAccountViewGuard,selectAccount,readView,call,subscribe` | 全8页和 SSE | 账号/页面本地状态 / 纯 UI 防污染 | EXISTING_UI；account+generation+各视图 request 代次，A→B→A 和旧 SSE 都不能回填；失败清旧表 | `src/page.mjs:2,367,381,408,435` | `account-view`、`explorer-view`、`order-rules-view`、`stages-view`；直接复用 |
| PLT-015 | 显式采集和缓存刷新边界 | `refresh → collectState`；48 ENTRY_QUERIES | `POST /api/refresh`；刷新数据；`GET /api/overview` 读缓存 | 实时只读采集后写 session.snapshot / 只读游戏 | EXISTING_UI；每账号 collectionPromise 合并；不自动 connect；Runner/未决战斗时完整采集409，但缓存可看 | `src/server.mjs:236,287,651`；`src/page.mjs:493,1089` | `data-safety`、`server-runtime`、`stages-api`；48项明细见数据目录章节 |
| PLT-016 | 总览、缓存明细和 Snapshot 导出 | `overview,cachedClient,tasks,world,heroes,dailies`；来源映射至既有查询，无新请求 | GET overview/heroes/dailies/tasks/world/snapshot/export；总览和3业务页 | Snapshot+配置 / 游戏只读 | EXISTING_UI；明细适配 survey/plan/format，缺失依赖抛错，缺每日 probes 标 unknown；导出完整 snapshot 有 API，但专门导出按钮属于 Explorer | `src/server.mjs:287,326,439,445,479,501,687,836` | `server-runtime`、`account-view`、`snapshot-precision`；复用缓存适配，不误报为空 |
| PLT-017 | 实时区服列表 | `listWorlds → GameWorldListRequest → GameWorldListResponse` | `GET /api/worlds`；账号页加载区服 | READY GameClient 的实时请求（**不是 Snapshot**） / 游戏只读 | EXISTING_UI；不自动登录，Stage 活跃或未决时409 | `src/worlds.mjs:51`；`src/server.mjs:861`；`src/page.mjs:1062` | selftest、`stages-api` 区服互斥；直接复用 |
| PLT-018 | 全区服分组和指定区服登录 | `listGroup`: GameWorldGroupListRequest→Response；`enterWorld`: LoginRequest(worldId)→LoginResponse | CLI `worlds --group`/`worlds <id>`；`POST /api/worlds/enter` 存在但403；UI禁用 | 实时 / 指定新区服登录可能创建角色 | EXISTING_FUNCTION；禁止把 enterWorld 当纯查询 | `src/worlds.mjs:60,68`；`src/app.mjs:100,846`；`src/server.mjs:872` | selftest worlds；将来单独授权接入，不开放当前只读白名单 |
| PLT-019 | 运行事件和递归脱敏 | `emit,trace,redact,redactText,secrets` | `GET /api/events?account=`；总览运行记录；所有 JSON/trace/export | 账号日志+内存已知秘密 / 本地观测 | EXISTING_UI；SSE按账号过滤，400条上限；trace仅帧元信息+截断脱敏消息；bigint字符串、循环引用安全；已删除账号秘密仍保留在 knownSecrets 防迟到泄露 | `src/server.mjs:55,70,114,576,713`；`src/security.mjs:5,18` | `server-runtime` SSE/trace/JSON、`data-safety`；直接复用 |
| PLT-020 | Web 游戏写权限边界 | `handle` 顶部 allowed+stageRoute、`needConfirm`；page READ_POSTS+stageMutation | 旧写路由统一403；Stage 独立 start 授权 | 路由策略 / 游戏修改权限 | EXISTING_FUNCTION；只开放当前主线 start，confirm:true+enabled+READY+阵营证据+无未决请求；本地订单配置保存不是游戏写 | `src/server.mjs:583,593,604,619`；`src/page.mjs:366,854` | `server-runtime` 白名单、`stages-api`；边界直接复用 |
| PLT-021 | Stage 状态/开始/停止产品入口 | `stageView → createStageRunner.start/stop`；ChallengeStageRequest→Response | GET /api/stages；POST start/stop；自动闯关Tab | 当前Session/实时挑战 / 游戏修改 | EXISTING_UI；主线LEFT单模式授权，runId+generation+同账号锁，缓存浏览继续，停止不绕过未决锁；细分策略见主线章节 | `src/server.mjs:561,604`；`src/page.mjs:230,770,839,854` | `stages-api`、`stages-view`；直接复用 |
| PLT-022 | 独立凭证捕获并导入 | `runCaptureCli → startCapture → createProxy.onLogin → upsertAccount/saveStore → stopCapture`；观察原 LoginRequest | CLI `npm run capture`；Web capture路由403、UI禁用 | 正常微信登录握手 / 临时系统代理和信任变更+秘密持久化 | EXISTING_FUNCTION；导入完整 login，不保存 rawFrame；成功/超时/异常都 finally stop；不会自动 GameClient 登录 | `tools/capture-credentials.mjs:18,60,115`；`src/capture.mjs:166` | `capture-cli`、`capture-transaction`；直接复用安全CLI，Web添加账号仍为接入缺口 |
| PLT-023 | 捕获事务和崩溃恢复 | `createCaptureController,startCapture,stopCapture,recoverCapture,restoreSystem,loadPending` | CLI `--recover`；无开放 Web 恢复入口 | durable journal+进程锁 / 系统恢复 | EXISTING_FUNCTION；exclusive transaction/journal，记录意图再变更；活跃PID不接管；正常退出/信号/异常回滚；硬杀后靠下次显式恢复；恢复失败留记录 | `src/capture.mjs:12,33,66,71,87,112,129,138,266` | `capture-transaction`、`capture-recovery-process`、`proxy-backup`；直接复用 |
| PLT-024 | MITM 主机与TLS安全 | `createProxy,decodeWsFrame,tlsServer,upstream` | 捕获内部；独立工具拒绝直接持久化 | 白名单 wss 登录帧 / 网络中继和受控解密 | EXISTING_FUNCTION；默认仅精确 `dhyaoj-gate.khlgamen.com:443`；白名单外 CONNECT 透明隧道；keyPem 加载私钥；rejectUnauthorized:true；observer 脱敏；异步 generation 保护、幂等 stop/listen | `tools/mitm-proxy.mjs:13,21,71,119,148,232` | `mitm-proxy`、selftest-mitm；直接复用，不扩大白名单 |
| PLT-025 | CA生成、只读精确查询与归属清理 | `createCaManager,initCa,leafFor,caFingerprint,queryCa/queryCurrentUserRoot,installCa,uninstallCa` | tools CLI init/leaf/install/status；uninstall命令明确拒绝无归属清理，事务恢复走--recover；无产品 UI | 本地证书文件+CurrentUser Root / 文件和信任存储操作 | EXISTING_FUNCTION；FOUND/ABSENT/ERROR，.NET X509Store只读精确SHA1；key/cert配对、叶链/主机/有效期校验；安装证书快照绑定指纹，既有CA不删，仅receipt owned清理 | `tools/mitm-ca.mjs:21,84,113,127,151,179` | `mitm-ca-query`、`capture-system`；复用当前经理，不移植参考CN删除 |
| PLT-026 | Windows代理版本化备份和恢复 | `createProxySettings,readSnapshot,inspectBackups,assertBackupReady,backup,setProxy,restore` | tools CLI show/backup/set/restore；无产品 UI | HKCU Internet Settings 的ProxyEnable/Server/Override / 系统写入 | EXISTING_FUNCTION；V1保存type/exists/data；原子发布、冲突拒绝；旧字符串格式认定LEGACY_PARTIAL且保留，不伪造完整快照；完整journal独立恢复和失败重试 | `tools/proxy-settings.mjs:19,22,42,59,84,97,118,134` | `proxy-backup`、`capture-system`、selftest-registry；直接复用 |
| PLT-027 | B2定向首错诊断与心跳发送白名单 | `createB2Diagnostics.attach/capture/getFirstFailure/getEvents`；仅no-seq PingRequest/Ack | Harness内用，无产品 API/UI | Runtime事件元数据 / 本地诊断 | EXISTING_FUNCTION；第一次FAILED/REJECTED/CLOSED/EXPIRED前同步保存脱敏原错，含beforeState/类型/时间/可用close；后续终态不覆盖；不保存任意Error附加对象或原帧 | `tools/b2-harness.mjs:4,25,39` | `b2-harness`；首错机制是Harness特有，生产GameClient没有相同持久化机制，不能宣称全局具备 |
| PLT-028 | CLI账号管理与开发操作 | `accountsCli,headless,state,act,heroes,dailies,tasks,world,field,loopCli,loot` | `app` 模式 accounts/connect/probe/actions/act/config/state/worlds/loot/heroes/dailies/tasks/world/field/loop；无通用Web Action入口 | 本地配置/实时游戏 / 读或写（--yes/CW_ALLOW_MUTATE） | EXISTING_FUNCTION；成熟CLI仍存在，Web白名单不会限制独立CLI；执行链复用现有业务Function，不能等同Web已开放 | `src/app.mjs:57,100,141,260,315,335,382,434,479,535,589,641,705` | selftest业务模块；将来逐项授权接入，无需重写 |
| PLT-029 | CLI日志/导出安全差异（明确待办） | `accountsCli(show) → revealAccount`；`headless/state/act`直接JSON输出 | CLI only；Web credential仍只脱敏 | 原凭证或响应 / 本地输出 | PARTIAL（统一安全覆盖）；`accounts show`会输出raw token/sign/loginFrameHex，`accounts list`含完整openId；headless消息/警告、state --raw/--out、act结果未统一调用redact；未在本轮执行这些入口 | `src/app.mjs:62,66,68,161,169,328,664,694`；`src/accounts.mjs:185` | Web脱敏测试不等于CLI覆盖；后续最小统一脱敏和定向CLI测试；不因当前未泄露而宣称全入口安全 |

### 开发资源与离线工具明细

| ID | 域 / 功能 | Function / 输入输出 | API / UI | 来源 / 性质 | 状态 / 范围 | 位置 | 测试 / 建议 |
|---|---|---|---|---|---|---|---|
| PLT-030 | Protobuf载入和注册器沙箱 | `loadProtocol,describe`；微信静态模块→encode/decode类型表 | 内部模块；tools buildproto | 本地 extracted game.js / 离线读取执行受限模块 | EXISTING_FUNCTION；无 .proto 重写；`loadProtocol(bundlePath)`参数可指定资源（没有CW_PROTO_BUNDLE环境变量入口） | `src/proto.mjs:7,26,44,105`；`tools/buildproto.mjs` | selftest真实编解码、protocol相关测试；直接复用资源记录 |
| PLT-031 | 协议帧编解码、LZ4 | `createCodec.encode/decode`；name+seq+body↔帧 | GameClient与捕获共用 | 协议对象 / 纯数据转换 | EXISTING_FUNCTION；plain/LZ4、头与名字检查；使用原生成定义 | `src/codec.mjs:15`；`src/lz4.mjs` | selftest、`mitm-proxy`真实合成Login帧；直接复用 |
| PLT-032 | 协议字段和消息反查 | `typeNames,findType,fields`；生成encode/decode源码→字段号、类型、required/optional | `tools/describe --list` 或类型名，无Web UI | 当前提取bundle / 离线研究 | EXISTING_FUNCTION；支持组首声明及单字段decode，不代表有完整Function | `tools/describe.mjs:23,30,42,95` | `tools/selftest-describe.mjs`；缺失功能先用此查证 |
| PLT-033 | 压缩客户端上下文定位 | ctx needle窗口；mod System.register模块截取 | `node tools/ctx.mjs`/`mod.mjs` | 任意指定本地JS / 离线只读 | EXISTING_FUNCTION；无协议请求 | `tools/ctx.mjs:4`；`tools/mod.mjs:4` | 无独立专项测试；直接复用研究工具 |
| PLT-034 | 微信包解密/解包 | `decrypt,unpack`；V1MMWX/wxapkg→本地文件 | `tools/wxapkg.mjs decrypt/unpack` | 本地缓存包 / 本地文件生成 | EXISTING_FUNCTION；不自动下载客户端，不是游戏操作 | `tools/wxapkg.mjs:10,24,50` | 当前无独立test文件；复用已校验资源来源，生成物不进基线 |
| PLT-035 | 本地配置表发现、提取和查询 | `findConfigPack,extractTables,loadTables,loadConfig,getConfig`；资源名/挂机上限/奖励级 | CLI `app config`；业务模块和UI间接用 | CW_CONFIG_PACK→work/cdn→本机微信缓存 / 离线读取 | EXISTING_FUNCTION；从嵌套JSON读表；无新数据库 | `src/config.mjs:29,38,58,65,99`；`src/app.mjs:755` | selftest配置；直接复用，不以注释中不存在的fetch-config工具为能力 |
| PLT-036 | 固化配置包 | sync-config：loadTables验证≥100表→copyFile | `npm run sync-config` | 本机已有config_cn / 本地资源复制 | EXISTING_FUNCTION；不自动远程下载 | `tools/sync-config.mjs:7` | 无独立专项test；复用锁定资源与SHA记录 |
| PLT-037 | 图集提取和本地展示 | `parsePackage,parsePackageFile,pngSize`；`iconIndex/iconOf/itemIcon/resourceIcon/materialIcon/buildingIcon/heroIcon/heroCard/atlasFile/iconCoverage` | GET art/index、art/atlas/:bundle/:file；总览和业务表图标 | 配置+FairyGUI图集 / 本地只读 | EXISTING_UI；缺图可降级；atlasFile约束文件路径 | `src/fgui.mjs:112,247,252`；`src/art.mjs:16,59,110`；`src/server.mjs:697` | selftest FGUI/art、页面测试；直接复用 |
| PLT-038 | 图集资源同步 | `findCacheDir,readCacheList,readBundleConfig,assetUrl,materialize,main` | `npm run sync-art`；`--fetch`可选 | 微信缓存，用户启用时CDN补齐 / 本地生成+可选网络下载 | EXISTING_FUNCTION；输出index.json和图集页，本轮只审计未运行 | `tools/sync-art.mjs:59,69,79,93,104,118` | 无独立专项test；默认优先离线缓存 |
| PLT-039 | 客户端枚举名称提取 | `walk + ENUM/ASSIGN`；bundle内联名称表→work/names.json | `tools/build-names.mjs` | extracted JS / 离线生成 | EXISTING_FUNCTION；仅命名元数据，不是业务执行器 | `tools/build-names.mjs:10` | 无独立专项test；直接复用 |
| PLT-040 | 扩展玩法实时只读探针 | probe-dailies/probe-world 创建GameClient后逐条request | 开发CLI，无Web API/UI | **旧data/credentials.json**+实时游戏 / 登录与只读查询 | EXISTING_FUNCTION；是已有工具，但不属于48项缓存浏览；原始输出未统一脱敏、旧凭证路径，无本轮执行授权 | `tools/probe-dailies.mjs:8,18`；`tools/probe-world.mjs:10,21` | 无隔离专项test；未来使用前改安全凭证适配，不能当离线自检运行 |
| PLT-041 | 登录拒绝在线诊断 | check-login-failure读旧凭证→修改sign副本→GameClient.connect | 开发CLI，无Web | 旧data/credentials.json/实时网关 / 主动失败登录 | EXISTING_FUNCTION；**不是离线测试**，无授权不执行；直接JSON错误输出 | `tools/check-login-failure.mjs:8` | 不被npm test自动执行；列入危险开发入口治理待办 |
| PLT-042 | 离线回归入口 | `npm test`: selftest + node --test；MITM/registry兼容自检 | CLI 无Web | 合成凭证/Fake WS/临时CA/注入注册表 / 离线验证 | EXISTING_FUNCTION；selftest-mitm对子测试、selftest-registry注入fakes；不应混入在线probe或check-login-failure | `package.json:8`；`src/selftest.mjs`；`tools/selftest-mitm.mjs`；`tools/selftest-registry.mjs` | 本轮总结果见报告；直接保留历史断言 |
| PLT-043 | 游戏协议全自动发现/通用工作流设计器 | 当前查到的是ENTRY_QUERIES、ACTIONS、survey/plan/run、固定loop与Stage Runner，未发现可视化通用编排器/通用Rules Engine | 无API/UI | 不适用 | NOT_FOUND（通用引擎）；不能将固定loop或订单规则称为完整Workflow/Rules平台 | `src/server.mjs:593`白名单与全部路由；`src/app.mjs:705`模式分发；`src/loop.mjs` | 现有能力可组合，但本轮不开发新引擎 |

### 实际 API 地图（先看白名单，再看历史 handler）

`src/server.mjs:593` 的白名单在所有 handler 之前执行；未通过就返回 HTTP 403 和 `code=READ_ONLY_ROUTE`。未知未列出的路由同样先403，不能因下方保留代码就当可调用API。

| 可达性 | 路由 | 实际调用 / 请求与授权 |
|---|---|---|
| 可达 | GET `/` | PAGE本地HTML，无Runtime |
| 可达 | GET `/api/accounts`、`/api/accounts/credential` | 账号描述与Session状态；credential只describeAccount |
| 可达，本地写 | POST `/api/accounts/active`、`/label`、`/remove` | needConfirm；改本地账号库，remove取消Runtime |
| 可达，显式登录 | POST `/api/connect` | 单账号single-flight；LoginRequest→LoginResponse |
| 可达，断开 | POST `/api/disconnect` | cancelSession，不发送业务Action |
| 可达，显式游戏只读采集 | POST `/api/refresh` | 已READY账号，48项collectState；禁止Stage运行中采集 |
| 可达，缓存 | GET `/api/overview`、`/heroes`、`/dailies`、`/tasks`、`/world` | summarize/cachedClient+既有模块；不重新连接或查询 |
| 可达，缓存 | GET `/api/data-explorer?account=<精确ID>&domain=` | sessions.get读取，48目录、原始/解析/状态；无Runtime创建 |
| 可达，缓存 | GET `/api/snapshot/export` | session.snapshot 脱敏JSON；通用resolve可按现有账号选择器解析 |
| 可达，实时只读 | GET `/api/worlds` | READY连接→GameWorldListRequest；Stage期间409 |
| 可达，缓存状态 | GET `/api/loop` | 旧loop本地状态；不启动执行 |
| 可达，本地规则 | GET/POST `/api/order-rules`；POST `/api/order-rules/preview` | 精确账号；加载/保存本地配置、缓存模拟；无游戏Action |
| 可达，独立主线授权 | GET `/api/stages`；POST `/api/stages/start`、`/stop` | 精确账号；start需confirm/enabled/READY/证据/无busy或未决；stop取消后续但保留未决锁 |
| 可达，观测/资源 | GET `/api/events`、`/api/art/index`、`/api/art/atlas/:bundle/:file` | SSE日志/本地图集，无游戏写 |
| **403不可达** | GET `/api/capture`、`/api/capture/qrcode`；POST `/api/capture/start`、`/stop` | 下方handler仍在801–834；正常入口目前是安全CLI |
| **403不可达** | POST `/api/worlds/enter` | 历史handler872；enterWorld业务函数和CLI仍在 |
| **403不可达** | POST `/api/heroes/run`、`/api/dailies/run`、`/api/tasks/run`、`/api/world/run` | 历史handler885/907/932/950；实际业务Function/CLI可复用，Web执行未开放 |
| **403不可达** | POST `/api/loop/start`、`/api/loop/stop` | 历史handler976/1025；固定loop函数/CLI仍在 |
| 无实现的产品路由 | 通用Action执行、订单规则自动提交/刷新、一键loot API、阵容预设编辑/应用API | 当前全部handler没有这些入口；不能凭隐藏按钮/协议定义补记 |

### 当前页面地图（单一 PAGE，8 个 Tab）

| 页面 / 位置 | 当前可操作 | 只读与缺少的入口 |
|---|---|---|
| 全局头部（page:136,367,470） | 账号切换、显式连接/断开、刷新数据 | 连接按钮主动一次refresh；boot/3秒轮询只读overview，不自动登录；Stage运行中禁完整刷新 |
| 总览（page:157,512） | 玩家和状态、资源库存、主力英雄、账号SSE运行记录 | 一键领取按钮disabled+hidden；没有可达loot API |
| 数据探索器（page:173,890） | 读缓存、域筛选、业务/Request/Response搜索、原始JSON与已有解析同时展开、状态/时间/错误、复制和导出脱敏JSON | 无额外查询、无写Action；具体48/27/21见数据目录清单 |
| 居民订单策略（page:199,555） | 启用、添加/排序/删除/编辑规则、账号独立加载/保存、恢复编辑器默认、缓存模拟和trace | 明示只读；没有提交/刷新按钮；各订单共用同一库存独立模拟，未跨订单预留 |
| 自动闯关（page:230,753） | 启用、最高关卡、重试秒数、最大总尝试、开始确认、停止、状态/结果/次数/历史/停止原因/错误时间/倒计时 | 10–11秒胜利间隔**已显示且默认取服务器配置**；stopOnDefeat可经API配置并在UI构造时保留已有值，**无独立UI勾选控件**；无阵容预设选择器 |
| 任务与海面（page:253,551,1172） | 检查可领（缓存计划）、海面数据（建筑/工厂队列/订单/库存/资源田） | loop、领取任务、执行海面全部disabled+hidden；不是完整可执行Web自动化 |
| 英雄（page:287,1220） | 查看缓存英雄、等级/星级/战力/技能和现有养成计划 | 执行养成disabled+hidden；无装备/徽章/专属等参考扩展模块UI |
| 日常（page:297,1234） | 缓存任务、状态、建议动作、活跃宝箱/赠礼；缺探针unknown | 一键完成/花钻石控件disabled+hidden，Web执行403 |
| 账号（page:308,1009） | 使用/重命名/删除、凭证脱敏信息、实时加载区服 | 进入区服、扫码捕获按钮disabled+hidden；没有通用凭证文件导入表单 |

### 可组合平台调用链与边界

- 账号库 → 显式 `connect` → READY → 手动 `refresh` → `session.snapshot` → overview/Explorer/cached survey。轮询从缓存读，不带隐式重连；失败与NOT_EXECUTED保持不同。
- 现有 READY Session → `POST /api/stages/start` 独立授权 → 生产 Stage Runner → 串行 ChallengeStageRequest；Stage运行时缓存浏览可继续，采集与实时区服查询被互斥。断开/删除/close通过同一abort与generation取消Runner。
- 正常微信登录 → 精确白名单 MITM `onLogin` → `runCaptureCli` 的正常鉴权校验/账号upsert → durable保存 → finally stop/事务恢复。Web下方旧capture handler不是可达产品链；其中 `addCapturedAccount`（server:535）仍保存 rawFrameHex 并自动短连读取身份，和安全CLI不同，未来重新开放前需单独处理，不能直接解除白名单。
- 账号缓存 → surveyWorld → 订单规则预览；没有把预览结果接入runWorld/提交动作，跨订单库存预留仍无完整链。
- CLI `act` 与业务CLI仍可调用已有Function，但不经过Web权限白名单，也未统一经过Web日志脱敏。未来产品接入应单独授权；本轮不开放。

### 参考仓库的平台可复用差异

实际参考路径：`C:\Users\zyk-o\Documents\crazywaterword`，只读。参考 `src/server.mjs:1–75` 已导入archive、heroGrow、radar、pirate、equip、pet、idle、treasure、guildShip、cityWar、youdu、tradePort、tradeKing、factories、stats等**当前没有**的模块；业务详情由相应域清单逐项审计，不能将参考模块当作当前已集成。

- 参考 `src/accounts.mjs:20–115` 保留同源账户存储和upsert机制；当前新增validateCredentials与body兼容，保留当前账号隔离无需迁回旧实现。
- 参考 `tools/capture-credentials.mjs:1–115` 直接读写旧credentials.json、进程局部rollback与旧代理/CA流程；当前安全CLI/事务恢复/指纹归属更完整。参考不是安全捕获的替代基线。
- 参考 `src/client.mjs:3–6` 已有archive attach/SECRET_FRAMES/clipBody，参考服务端也有archive/console日志归档；当前没有archive模块，而是Web emit/trace递归脱敏+Harness首错。可评估归档思想，不能整段复制覆盖当前single-flight、关联与取消保护。
- 参考额外工具经文件枚举实际存在：`watch-check.py`、`probe-youdu.mjs`、`probe-trade.mjs`、`probe-citywar.mjs`、`probe-cargo.mjs`、`gift-codes.mjs`、`fetch-map.mjs`、`console-log.mjs`、`archive.mjs`、`archive-backfill.mjs`；它们不在当前tools目录，未记为当前可调用能力；业务请求与资源消费需逐项研究后复用，不在本轮执行。

### 平台明确待办（保留事实，不扩展开发）

1. 10–11秒关卡间隔与限频停止在当前基线已经存在；继续保留为产品事项，标记“已实现/已有专项测试，待未来真实验收”，不能再写“未开发”。本轮不运行真实闯关。
2. 阵容读取/预设保存/预设应用的审计结果需与主线章节一起保留；UI/API目前无formation写入口，不能因有预设查询认定可自动应用。
3. 统一CLI/旧probe的递归脱敏与凭证安全入口，尤其显式 `accounts show` 的真实秘密输出；现状有证据但本轮不修改业务或工具逻辑。
4. Web添加账号、指定区服登录、英雄/日常/任务/海面/循环执行目前不可达，属于已有Function按产品授权重新接入的工作，不是重开发协议。
5. stopOnDefeat已有Runner/API能力但缺UI独立开关；阶段策略/延时参数无持久化编辑页；通用Workflow/Rules平台没有实现，本轮不建空模块。



## 数据、协议与本地资源能力

本节基于提交 `61ce3c020ea8abedd9e70387c88528b6a8fe055b` 后的实际源码与本地生成协议。仅本地静态读取/加载；未读取凭证、创建 GameClient、发送游戏请求或修改代理/证书。

### 数据浏览链和状态定义

现有链：账号 Session → 一次 collectState → session.snapshot（ok / failed / outcomes / raw）→ exploreSnapshot → GET /api/data-explorer?account=…&domain=… → Explorer。Explorer 自身只读缓存，不创建 Runtime、不重新采集、不发送游戏请求。刷新采集与缓存浏览是两项能力。

48 项源数据能力均记作 DATA_ONLY：表示已有采集/解析，不表示相应玩法的执行 Action 已实现。统一浏览入口单列 EXISTING_UI；48 项都可经该入口查看，27 项复用 summarize 的已有解析，21 项只显示原始响应，未补造解释。

| ID | 能力 | Function / 调用链 | API / UI | 数据/执行性质 | 程度 | 源码 / 测试 | 复用建议 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DEX-001 | 48 项查询单次采集 | collectState → GameClient.request；WeakMap 对单客户端 single-flight | 既有账号连接/显式刷新入口；非 Explorer 轮询触发 | 实时只读 → Snapshot | EXISTING_UI | [src/game.mjs:98](<//zhangnas/app/crazywaterword/src/game.mjs:98>)；tests/server-runtime.test.mjs、data-safety.test.mjs | 直接复用；不要另建查询集 |
| DEX-002 | 12 域目录与 48 项浏览 | DATA_CATALOG → exploreSnapshot → Explorer | GET /api/data-explorer；数据探索器页签 | 指定账号 Snapshot；只读 | EXISTING_UI | [src/data-catalog.mjs:72](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:72>)、[src/server.mjs:676](<//zhangnas/app/crazywaterword/src/server.mjs:676>)；data-catalog / explorer-api / explorer-view 测试 | 直接复用唯一目录 |
| DEX-003 | 27 个现有业务解析视图 | summarize；按 query 隔离解析后同时返回 raw / parsed | 同 DEX-002；双面板同时可见 | Snapshot / 本地 config；只读 | EXISTING_UI | [src/game.mjs:131](<//zhangnas/app/crazywaterword/src/game.mjs:131>)、[src/data-catalog.mjs:91](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:91>)；data-catalog 测试逐项 synthetic 值 | 直接复用；27 是查询级解析，不是 27 项写 Action |
| DEX-004 | 21 个无专门解析的原始响应 | exploreSnapshot.raw；parsed=null | 同 DEX-002；原始 JSON 展开 | Snapshot；只读 | EXISTING_UI | [src/page.mjs:911](<//zhangnas/app/crazywaterword/src/page.mjs:911>)；explorer-view 测试 | 直接复用原始展示；业务执行另盘点 |
| DEX-005 | 状态、错误、采集时间 | outcomes SUCCESS / FAILED / NOT_EXECUTED；缺失成功 body 转 FAILED | 同 DEX-002 | Snapshot；只读 | EXISTING_UI | [src/game.mjs:98](<//zhangnas/app/crazywaterword/src/game.mjs:98>)、[src/data-catalog.mjs:91](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:91>)；data-catalog / explorer-api 测试 | 直接复用；失败不能伪造零数据 |
| DEX-006 | 按域、业务名和协议名搜索 | explorerEntries / refreshExplorer；相关域共享同条 query | Explorer 域筛选和文本搜索 | Snapshot；只读 | EXISTING_UI | [src/page.mjs:901](<//zhangnas/app/crazywaterword/src/page.mjs:901>)；explorer-view 测试 | 直接复用；本地搜索不增加请求 |
| DEX-007 | 安全 JSON 复制/导出 | exportExplorer / clipboard；snapshot export → shared redact | GET /api/snapshot/export；Explorer 复制/下载 | Snapshot；本地导出 | EXISTING_UI | [src/server.mjs:687](<//zhangnas/app/crazywaterword/src/server.mjs:687>)、[src/page.mjs:975](<//zhangnas/app/crazywaterword/src/page.mjs:975>)；explorer-api / explorer-view 测试 | 直接复用；导出仍含玩家业务信息，应按需分享 |
| DEX-008 | int64 精度保留 | toSnapshotJson：安全整数为 number，越界 decimal string；独立 raw | 同浏览/导出链 | 本地序列化；只读 | EXISTING_FUNCTION | [src/game.mjs:69](<//zhangnas/app/crazywaterword/src/game.mjs:69>)；snapshot-precision.test.mjs | 直接复用；normalize 业务视图不能替代 raw |
| DEX-009 | 跨账号缓存与迟到响应隔离 | sessions.get(id)；严格 accountId；页面 scope / generation 校验 | Explorer + 现有账号页面 | 各账号 Snapshot；只读 | EXISTING_UI | [src/server.mjs:676](<//zhangnas/app/crazywaterword/src/server.mjs:676>)、[src/page.mjs:953](<//zhangnas/app/crazywaterword/src/page.mjs:953>)；explorer-api / account-view / explorer-view 测试 | 直接复用现有账号作用域 |

### 48 项基础查询与解析完整映射

本表每项 API/UI 都为 DEX-002 的缓存浏览入口，状态 DATA_ONLY 指底层业务数据；不是把已有 UI 降级。所有 48 对 Request / 同名 Response 已用 loadProtocol() 实际核对存在。除表中列出的参数外，Request body 均为 {}。Source 列前者为查询定义、后者为唯一目录；parsed path 均来自 src/game.mjs:summarize。

| Capability ID | 业务名称 / 主域（相关域） | Request → 已存在 Response | 参数 | 已有解析路径 / 原始展示 | 状态 | 代码位置 |
| --- | --- | --- | --- | --- | --- | --- |
| DAT-001 | 库存道具 / 资源与生产 | AllItemRequest → AllItemResponse | {} | items | DATA_ONLY | [src/game.mjs:8](<//zhangnas/app/crazywaterword/src/game.mjs:8>)；[src/data-catalog.mjs:22](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:22>) |
| DAT-002 | 玩家资源 / 资源与生产 | AllResourceRequest → AllResourceResponse | {} | resources | DATA_ONLY | [src/game.mjs:9](<//zhangnas/app/crazywaterword/src/game.mjs:9>)；[src/data-catalog.mjs:23](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:23>) |
| DAT-003 | 英雄 / 英雄养成 | AllHeroRequest → AllHeroResponse | {} | heroes.count；heroes.power；heroes.list | DATA_ONLY | [src/game.mjs:10](<//zhangnas/app/crazywaterword/src/game.mjs:10>)；[src/data-catalog.mjs:24](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:24>) |
| DAT-004 | 英雄阵型 / 英雄养成 | GetFormationRequest → GetFormationResponse | {"module":1} | heroes.formation | DATA_ONLY | [src/game.mjs:11](<//zhangnas/app/crazywaterword/src/game.mjs:11>)；[src/data-catalog.mjs:25](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:25>) |
| DAT-005 | 邮件 / 日常与成长任务 | EmailBoxRequest → EmailBoxResponse | {"pageNo":0} | email | DATA_ONLY | [src/game.mjs:12](<//zhangnas/app/crazywaterword/src/game.mjs:12>)；[src/data-catalog.mjs:26](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:26>) |
| DAT-006 | 装备 / 英雄养成（收藏与辅助养成） | EquipsRequest → EquipsResponse | {} | equips | DATA_ONLY | [src/game.mjs:13](<//zhangnas/app/crazywaterword/src/game.mjs:13>)；[src/data-catalog.mjs:27](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:27>) |
| DAT-007 | 徽章 / 英雄养成（收藏与辅助养成） | BadgesRequest → BadgesResponse | {} | 无专门解析；原始响应可查看 | DATA_ONLY | [src/game.mjs:14](<//zhangnas/app/crazywaterword/src/game.mjs:14>)；[src/data-catalog.mjs:28](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:28>) |
| DAT-008 | 招募信息 / 招募与商店 | RecruitInfoRequest → RecruitInfoResponse | {} | recruit | DATA_ONLY | [src/game.mjs:15](<//zhangnas/app/crazywaterword/src/game.mjs:15>)；[src/data-catalog.mjs:29](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:29>) |
| DAT-009 | 成就 / 日常与成长任务 | AchievementInfoRequest → AchievementInfoResponse | {} | achievements | DATA_ONLY | [src/game.mjs:16](<//zhangnas/app/crazywaterword/src/game.mjs:16>)；[src/data-catalog.mjs:30](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:30>) |
| DAT-010 | 每日任务与活跃度 / 日常与成长任务 | DailyTaskInfoRequest → DailyTaskInfoResponse | {} | daily | DATA_ONLY | [src/game.mjs:17](<//zhangnas/app/crazywaterword/src/game.mjs:17>)；[src/data-catalog.mjs:31](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:31>) |
| DAT-011 | 每日赠礼 / 日常与成长任务（招募与商店） | DailyGiftPackRequest → DailyGiftPackResponse | {} | 无专门解析；原始响应可查看 | DATA_ONLY | [src/game.mjs:18](<//zhangnas/app/crazywaterword/src/game.mjs:18>)；[src/data-catalog.mjs:32](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:32>) |
| DAT-012 | 主线与支线任务 / 日常与成长任务 | MainTaskInfoRequest → MainTaskInfoResponse | {} | mainTask | DATA_ONLY | [src/game.mjs:19](<//zhangnas/app/crazywaterword/src/game.mjs:19>)；[src/data-catalog.mjs:33](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:33>) |
| DAT-013 | 新手引导 / 日常与成长任务 | GuideInfoRequest → GuideInfoResponse | {} | guide | DATA_ONLY | [src/game.mjs:20](<//zhangnas/app/crazywaterword/src/game.mjs:20>)；[src/data-catalog.mjs:34](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:34>) |
| DAT-014 | 挂机收益与点金摘要 / 日常与成长任务（资源与生产） | AfkInfoRequest → AfkInfoResponse | {} | afk；clickGold | DATA_ONLY | [src/game.mjs:21](<//zhangnas/app/crazywaterword/src/game.mjs:21>)；[src/data-catalog.mjs:35](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:35>) |
| DAT-015 | 月卡 / 招募与商店（活动与赛季） | MonthCardRequest → MonthCardResponse | {} | monthCard | DATA_ONLY | [src/game.mjs:22](<//zhangnas/app/crazywaterword/src/game.mjs:22>)；[src/data-catalog.mjs:36](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:36>) |
| DAT-016 | 藏品 / 收藏与辅助养成 | AllAntiqueRequest → AllAntiqueResponse | {} | antiques | DATA_ONLY | [src/game.mjs:23](<//zhangnas/app/crazywaterword/src/game.mjs:23>)；[src/data-catalog.mjs:37](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:37>) |
| DAT-017 | 建筑、生产与居民订单 / 城市建设（资源与生产、居民订单） | OnWaterRequest → OnWaterResponse | {} | buildings；water | DATA_ONLY | [src/game.mjs:24](<//zhangnas/app/crazywaterword/src/game.mjs:24>)；[src/data-catalog.mjs:38](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:38>) |
| DAT-018 | 鱼类图鉴 / 收藏与辅助养成 | FishEncyclopediaRequest → FishEncyclopediaResponse | {} | fish | DATA_ONLY | [src/game.mjs:25](<//zhangnas/app/crazywaterword/src/game.mjs:25>)；[src/data-catalog.mjs:39](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:39>) |
| DAT-019 | 货船 / 舰队与航海 | CargoShipsRequest → CargoShipsResponse | {} | cargo | DATA_ONLY | [src/game.mjs:26](<//zhangnas/app/crazywaterword/src/game.mjs:26>)；[src/data-catalog.mjs:40](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:40>) |
| DAT-020 | 英雄任命 / 英雄养成 | AppointInfoRequest → AppointInfoResponse | {} | heroes.appointed | DATA_ONLY | [src/game.mjs:27](<//zhangnas/app/crazywaterword/src/game.mjs:27>)；[src/data-catalog.mjs:41](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:41>) |
| DAT-021 | 聊天记录 / 公会与联盟 | ChatRecordRequest → ChatRecordResponse | {"channel":1} | 无专门解析；原始响应可查看 | DATA_ONLY | [src/game.mjs:28](<//zhangnas/app/crazywaterword/src/game.mjs:28>)；[src/data-catalog.mjs:42](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:42>) |
| DAT-022 | 游戏效果 / 收藏与辅助养成 | GameEffectRequest → GameEffectResponse | {} | 无专门解析；原始响应可查看 | DATA_ONLY | [src/game.mjs:29](<//zhangnas/app/crazywaterword/src/game.mjs:29>)；[src/data-catalog.mjs:43](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:43>) |
| DAT-023 | 公会摘要 / 公会与联盟 | AllGuildAbstractionRequest → AllGuildAbstractionResponse | {} | guild | DATA_ONLY | [src/game.mjs:30](<//zhangnas/app/crazywaterword/src/game.mjs:30>)；[src/data-catalog.mjs:44](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:44>) |
| DAT-024 | 我的舰队 / 舰队与航海（世界地图） | MyFleetsRequest → MyFleetsResponse | {} | fleets | DATA_ONLY | [src/game.mjs:31](<//zhangnas/app/crazywaterword/src/game.mjs:31>)；[src/data-catalog.mjs:45](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:45>) |
| DAT-025 | 海盗击杀记录 / 城战与战斗（舰队与航海） | PirateKillRecordRequest → PirateKillRecordResponse | {} | 无专门解析；原始响应可查看 | DATA_ONLY | [src/game.mjs:32](<//zhangnas/app/crazywaterword/src/game.mjs:32>)；[src/data-catalog.mjs:46](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:46>) |
| DAT-026 | 我的资源田 / 世界地图 | MyResFieldsRequest → MyResFieldsResponse | {} | resFields | DATA_ONLY | [src/game.mjs:33](<//zhangnas/app/crazywaterword/src/game.mjs:33>)；[src/data-catalog.mjs:47](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:47>) |
| DAT-027 | 公会科技 / 公会与联盟 | GuildTechInfoRequest → GuildTechInfoResponse | {} | 无专门解析；原始响应可查看 | DATA_ONLY | [src/game.mjs:34](<//zhangnas/app/crazywaterword/src/game.mjs:34>)；[src/data-catalog.mjs:48](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:48>) |
| DAT-028 | 公会订单 / 公会与联盟（居民订单） | GuildOrderRequest → GuildOrderResponse | {} | 无专门解析；原始响应可查看 | DATA_ONLY | [src/game.mjs:35](<//zhangnas/app/crazywaterword/src/game.mjs:35>)；[src/data-catalog.mjs:49](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:49>) |
| DAT-029 | 阵型预设 / 英雄养成 | MyFormationPresetRequest → MyFormationPresetResponse | {} | 无专门解析；原始响应可查看 | DATA_ONLY | [src/game.mjs:36](<//zhangnas/app/crazywaterword/src/game.mjs:36>)；[src/data-catalog.mjs:50](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:50>) |
| DAT-030 | 赛季任务阶段 / 活动与赛季（日常与成长任务） | SeasonTaskStageRequest → SeasonTaskStageResponse | {} | 无专门解析；原始响应可查看 | DATA_ONLY | [src/game.mjs:37](<//zhangnas/app/crazywaterword/src/game.mjs:37>)；[src/data-catalog.mjs:51](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:51>) |
| DAT-031 | 世界 Boss / 城战与战斗（活动与赛季） | WorldBossInfoRequest → WorldBossInfoResponse | {} | worldBoss | DATA_ONLY | [src/game.mjs:38](<//zhangnas/app/crazywaterword/src/game.mjs:38>)；[src/data-catalog.mjs:52](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:52>) |
| DAT-032 | 限时 Boss 开放信息 / 城战与战斗（活动与赛季） | LimitedBossOpenRequest → LimitedBossOpenResponse | {} | 无专门解析；原始响应可查看 | DATA_ONLY | [src/game.mjs:39](<//zhangnas/app/crazywaterword/src/game.mjs:39>)；[src/data-catalog.mjs:53](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:53>) |
| DAT-033 | 宠物 / 收藏与辅助养成 | AllPetRequest → AllPetResponse | {} | pets | DATA_ONLY | [src/game.mjs:40](<//zhangnas/app/crazywaterword/src/game.mjs:40>)；[src/data-catalog.mjs:54](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:54>) |
| DAT-034 | 赛季排名信息 / 活动与赛季 | SeasonRankInfoRequest → SeasonRankInfoResponse | {} | season | DATA_ONLY | [src/game.mjs:41](<//zhangnas/app/crazywaterword/src/game.mjs:41>)；[src/data-catalog.mjs:55](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:55>) |
| DAT-035 | 周活动 / 活动与赛季 | WeekInfoRequest → WeekInfoResponse | {} | week | DATA_ONLY | [src/game.mjs:42](<//zhangnas/app/crazywaterword/src/game.mjs:42>)；[src/data-catalog.mjs:56](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:56>) |
| DAT-036 | 关卡状态 / 城战与战斗 | PassStageStateRequest → PassStageStateResponse | {} | 无专门解析；原始响应可查看 | DATA_ONLY | [src/game.mjs:43](<//zhangnas/app/crazywaterword/src/game.mjs:43>)；[src/data-catalog.mjs:57](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:57>) |
| DAT-037 | 周订单 / 活动与赛季（居民订单） | WeekOrderInfoRequest → WeekOrderInfoResponse | {} | 无专门解析；原始响应可查看 | DATA_ONLY | [src/game.mjs:44](<//zhangnas/app/crazywaterword/src/game.mjs:44>)；[src/data-catalog.mjs:58](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:58>) |
| DAT-038 | 日常计数 / 日常与成长任务 | CounterInfoRequest → CounterInfoResponse | {} | counters | DATA_ONLY | [src/game.mjs:45](<//zhangnas/app/crazywaterword/src/game.mjs:45>)；[src/data-catalog.mjs:59](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:59>) |
| DAT-039 | 雷达 / 世界地图 | RadarInfoRequest → RadarInfoResponse | {} | 无专门解析；原始响应可查看 | DATA_ONLY | [src/game.mjs:46](<//zhangnas/app/crazywaterword/src/game.mjs:46>)；[src/data-catalog.mjs:60](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:60>) |
| DAT-040 | 环境皮肤 / 收藏与辅助养成 | EnvSkinListRequest → EnvSkinListResponse | {} | 无专门解析；原始响应可查看 | DATA_ONLY | [src/game.mjs:47](<//zhangnas/app/crazywaterword/src/game.mjs:47>)；[src/data-catalog.mjs:61](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:61>) |
| DAT-041 | 渠道奖励信息 / 活动与赛季 | ChannelRewardInfoRequest → ChannelRewardInfoResponse | {} | 无专门解析；原始响应可查看 | DATA_ONLY | [src/game.mjs:48](<//zhangnas/app/crazywaterword/src/game.mjs:48>)；[src/data-catalog.mjs:62](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:62>) |
| DAT-042 | 限时券 / 招募与商店（活动与赛季） | LimitTicketRequest → LimitTicketResponse | {} | 无专门解析；原始响应可查看 | DATA_ONLY | [src/game.mjs:49](<//zhangnas/app/crazywaterword/src/game.mjs:49>)；[src/data-catalog.mjs:63](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:63>) |
| DAT-043 | 赛季卡 / 活动与赛季（招募与商店） | SeasonCardRequest → SeasonCardResponse | {} | 无专门解析；原始响应可查看 | DATA_ONLY | [src/game.mjs:50](<//zhangnas/app/crazywaterword/src/game.mjs:50>)；[src/data-catalog.mjs:64](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:64>) |
| DAT-044 | 海盗 / 城战与战斗（世界地图） | AllPirateRequest → AllPirateResponse | {} | pirates | DATA_ONLY | [src/game.mjs:51](<//zhangnas/app/crazywaterword/src/game.mjs:51>)；[src/data-catalog.mjs:65](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:65>) |
| DAT-045 | 玩家头像框 / 收藏与辅助养成 | PlayerFrameRequest → PlayerFrameResponse | {} | 无专门解析；原始响应可查看 | DATA_ONLY | [src/game.mjs:52](<//zhangnas/app/crazywaterword/src/game.mjs:52>)；[src/data-catalog.mjs:66](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:66>) |
| DAT-046 | Churn 信息 / 活动与赛季 | ChurnInfoRequest → ChurnInfoResponse | {} | 无专门解析；原始响应可查看 | DATA_ONLY | [src/game.mjs:53](<//zhangnas/app/crazywaterword/src/game.mjs:53>)；[src/data-catalog.mjs:67](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:67>) |
| DAT-047 | Ultra 开放信息 / 活动与赛季 | UltraOpenRequest → UltraOpenResponse | {} | 无专门解析；原始响应可查看 | DATA_ONLY | [src/game.mjs:54](<//zhangnas/app/crazywaterword/src/game.mjs:54>)；[src/data-catalog.mjs:68](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:68>) |
| DAT-048 | 黑名单 / 公会与联盟 | BlackListRequest → BlackListResponse | {} | 无专门解析；原始响应可查看 | DATA_ONLY | [src/game.mjs:55](<//zhangnas/app/crazywaterword/src/game.mjs:55>)；[src/data-catalog.mjs:69](<//zhangnas/app/crazywaterword/src/data-catalog.mjs:69>) |

12 域是 Explorer 的数据分类；产品业务域可以映射到更细的任务、阵容、互助、博物馆等 18 域，不能据数据域数量推断业务 Function 数量。

| 数据域 | 主归属查询数 | 含相关域查询数 |
| --- | --- | --- |
| 城市建设 | 1 | 1 |
| 资源与生产 | 2 | 4 |
| 居民订单 | 0 | 3 |
| 英雄养成 | 6 | 6 |
| 舰队与航海 | 2 | 3 |
| 城战与战斗 | 5 | 5 |
| 世界地图 | 2 | 4 |
| 公会与联盟 | 5 | 5 |
| 活动与赛季 | 8 | 12 |
| 日常与成长任务 | 8 | 9 |
| 收藏与辅助养成 | 6 | 8 |
| 招募与商店 | 3 | 5 |



## 业务 Function 专项清单（BIZ）

审计基线：目标 `\\zhangnas\app\crazywaterword`，提交 `61ce3c020ea8abedd9e70387c88528b6a8fe055b`。本节只把当前生产源码作为当前能力；参考仓库 `C:\Users\zyk-o\Documents\crazywaterword` 的额外实现单列，未移植不计当前完成。未连接游戏、未读凭证、未修改业务。

### 统一入口和判定约定

- 下表位置以目标仓库根目录为准。`src/server.mjs:593–607` 的白名单只开放读取、账号管理、订单规则本地保存/模拟；Stage API 有单独授权。旧 `/api/heroes/run`、`/api/dailies/run`、`/api/tasks/run`、`/api/world/run`、`/api/loop/start`、`/api/worlds/enter` 虽有 handler，但请求先返回 `READ_ONLY_ROUTE`。不能把这些旧 handler 算作当前可执行 API/UI。
- `CLI act` 调用链：`src/app.mjs:315 act → assertAllowed → buildBody → GameClient.connect → runAction → stop`；CLI 其他业务命令同样要求 `--yes` 或 `CW_ALLOW_MUTATE=1`。CLI 是现有入口，未接产品 UI 的写 Function 记 `EXISTING_FUNCTION`。
- Action 的 `response: null` 是真实声明：通过 `sendWatch` 观察 Prompt/推送，不能虚构同名 Response，也不能把短窗口未拒绝当作已验证服务器最终状态。
- 以下“测试 A”＝`src/selftest.mjs:288–305`（27项参数、授权）、`:730–760`（真实协议存在、静默集合、每项恰发一条、request/watch 分流）；只验证构造与分流，不证明每个动作的服务端效果或资源预算。
- 只读 Web 计划链：`GET /api/heroes|dailies|tasks|world → server 缓存 adapter → session.snapshot → 既有 planner/survey`。不会为了浏览重新请求游戏。写执行 Function 不因此获得授权。

### 27 项已有 Action（逐项）

所有 Action `mutate:true`；实际函数入口均为 `runAction(client,protocol,id,params,{allowMutate})`，`src/actions.mjs:281`。表中“API/UI”均为“无可用通用写 API/UI；CLI act 可调用”；各项均可直接复用构造，产品接入必须另做显式授权与效果确认。

| Capability ID | 业务域 / 名称 | Action / 必填字段 | Request → Response | 执行性质 / 成本 | 当前状态 / 代码位置 | 测试 / 复用建议 |
|---|---|---|---|---|---|---|
| BIZ-A01 | 资源与生产：领取挂机本段收益 | afkDraw；可选 useAdvCard | DrawAfkRewardRequest → DrawAfkRewardResponse | 状态修改；可选useAdvCard标志（具体成本未证实）；领取会重置本段计时 | EXISTING_FUNCTION；actions:26 | A；复用，保留先领后升约束 |
| BIZ-A02 | 日常成长：领取挂机等级奖励 | afkLevelDraw；level | DrawAfkLevelRewardRequest → DrawAfkLevelRewardResponse | 奖励领取 | EXISTING_FUNCTION；actions:33 | A；等级应由配置选取 |
| BIZ-A03 | 日常成长：提升挂机等级 | afkUpgrade；level | UpgradeAfkLevelRequest → UpgradeAfkLevelResponse | 消耗挂机徽章，重置本段计时 | EXISTING_FUNCTION；actions:41 | A；没有参考 idle 的完整依赖计划 |
| BIZ-A04 | 生产：收取工厂成品 | factoryGain；buildingId | GainFactoryProduceRequest → GainFactoryProduceResponse | 领取产物 | EXISTING_FUNCTION；actions:49 | A；可复用 |
| BIZ-A05 | 城市：收取建筑产物 | buildingCollect；buildingId实际为string[] | CollectBuildingProductRequest → CollectBuildingProductResponse | 领取产物 | PARTIAL；actions:57 | A未覆盖CLI标量；合成编解码证明字符串被逐字符编码；planWorld传数组正确，CLI参数需归一化后复用 |
| BIZ-A06 | 城市：确认已到期建筑竣工 | buildingFinish；buildingId | FinishUpgradeBuildingRequest → 无专属响应 | 建筑状态修改 | EXISTING_FUNCTION；actions:65 | A；需后续查询确认 |
| BIZ-A07 | 城市：切换自动工作 | buildingAutoWork；buildingId,isOn | SetBuildingAutoWorkRequest → 无专属响应 | 状态修改；具体开关限制由游戏决定 | EXISTING_FUNCTION；actions:73 | A；未有专用产品入口 |
| BIZ-A08 | 生产：设置自动生产产品 | factoryAutoProduce；buildingId,productId | SetFactoryAutoProduceRequest → 无专属响应 | 修改生产策略；实际生产消耗材料 | EXISTING_FUNCTION；actions:81 | A；未有专用产品入口 |
| BIZ-A09 | 日常：领取单条任务奖励 | dailyTaskDraw；id | DrawDailyTaskRewardRequest → DrawDailyTaskRewardResponse | 奖励领取 | EXISTING_FUNCTION；actions:89 | A；claimDailies 已复用 |
| BIZ-A10 | 成就：领取奖励 | achievementDraw；id | GotAchievementRewardRequest → 无专属响应 | 奖励领取 | EXISTING_FUNCTION；actions:97 | A；surveyTasks/runTasks 已覆盖计划链 |
| BIZ-A11 | 邮箱：一键领取已读邮件附件 | emailQuickGet；固定 all:true | QuickGotReadEmailRequest → 无专属响应 | 奖励领取 | EXISTING_FUNCTION；actions:105 | A；不能假定覆盖所有未读邮件 |
| BIZ-A12 | 日常：领取活跃宝箱 | dailyRewardDraw；index数组 | DrawDailyRewardRequest → 无专属响应 | 奖励领取 | EXISTING_FUNCTION；actions:114 | A；planChests 使用日表 |
| BIZ-A13 | 周常：领取活跃宝箱 | weeklyRewardDraw；index数组 | DrawWeeklyRewardRequest → 无专属响应 | 奖励领取 | EXISTING_FUNCTION；actions:122 | A；planChests 使用周表 |
| BIZ-A14 | 商店：领取每日免费赠礼 | freeDailyPackDraw；固定 packId=赠礼 | GotFreeDailyPackRequest → 无专属响应 | 免费奖励；付费档不开放 | EXISTING_FUNCTION；actions:130 | A；claimDailies 会重读 drawnPack 确认 |
| BIZ-A15 | 月卡：领取每日权益 | monthCardDaily；空体 | MonthCardDailyRewardRequest → 无专属响应 | 已有月卡权益领取，不含购买 | EXISTING_FUNCTION；actions:138 | A；需查询资格 |
| BIZ-A16 | 主线任务：领奖 | taskDrawMain；taskId | DrawMainTaskRewardRequest → 无专属响应 | 奖励领取 | EXISTING_FUNCTION；actions:145 | A；surveyTasks/runTasks |
| BIZ-A17 | 支线任务：领奖 | taskDrawBranch；taskId | GotBranchTaskRewardRequest → 无专属响应 | 奖励领取 | EXISTING_FUNCTION；actions:153 | A；surveyTasks/runTasks |
| BIZ-A18 | 居民订单：每日单数档奖励 | orderDayReward；空体 | GetNextOrderOTDRewardRequest → 无专属响应 | 下一档奖励领取 | EXISTING_FUNCTION；actions:161 | A；nextOrderTier 选档 |
| BIZ-A19 | 居民订单：交单 | finishOrder；index | FinishWorkerOrderRequest → FinishWorkerOrderResponse | 消耗需求物品，获得奖励 | EXISTING_FUNCTION；actions:168 | A；未接新规则引擎执行，勿直接批量套用旧预算 |
| BIZ-A20 | 居民订单：拒单刷新 | rerollOrder；index | DenyOrderRequest → 无专属响应 | 修改订单，消耗刷新配额/冷却（以游戏为准） | EXISTING_FUNCTION；actions:176 | A；新规则引擎仅决策，未授权执行 |
| BIZ-A21 | 生产：开始制造 | startProduce；buildingId,productId | StartFactoryProduceRequest → 无专属响应 | 消耗配方材料，占制造位 | EXISTING_FUNCTION；actions:184 | A；planWorld 已组装 |
| BIZ-A22 | 城市：升级建筑 | upgradeBuilding；buildingId | UpgradeBuildingRequest → 无专属响应 | 消耗配置材料/时间 | EXISTING_FUNCTION；actions:192 | A；planWorld 预算有缺口，见风险 |
| BIZ-A23 | 城市：建造空建筑位 | buildBuilding；buildingId | BuildBuildingRequest → 无专属响应 | 状态修改；依配置条件 | EXISTING_FUNCTION；actions:200 | A；level0 与已到期竣工互斥 |
| BIZ-A24 | 城市：道具加速升级 | speedUpUpgrade；buildingId,useNum | SpeedUpUpgradeBuildingRequest → 无专属响应 | 只允许 speedUp.type=2 加速器；无钻石/广告 | EXISTING_FUNCTION；actions:208 | A；可复用固定类型约束 |
| BIZ-A25 | 生产：道具加速制造位 | speedUpProduce；buildingId,index,useNum | SpeedUpFactoryProduceRequest → 无专属响应 | 只消耗加速器 | EXISTING_FUNCTION；actions:216 | A；可复用固定类型约束 |
| BIZ-A26 | 世界资源田：派舰占领 | challengeField；gridIdx，fleetBuildingIds可传 | ChallengeResFieldRequest（required resFieldGridIdx:int32、repeated fleetBuildingIds:string[]） → 无专属响应 | 派舰战斗；不能承诺零资源消耗 | EXISTING_FUNCTION；actions:228 | A；直接 action 未给舰队会构造字符串 undefined，参考已修，宜走 planFieldOccupy |
| BIZ-A27 | 世界资源田：放弃占领 | giveUpField；gridIdx | GiveUpResFieldRequest → 无专属响应 | 放弃资源田 | EXISTING_FUNCTION；actions:239 | A；planFieldGiveUp 校验所有权 |

### 城市、生产、居民订单旧链

| Capability ID | 业务域 / 功能 | 实际 Function 与调用链 | Request / Response、数据源 | API/UI | 性质 | 状态 / 代码 | 测试与复用建议 |
|---|---|---|---|---|---|---|---|
| BIZ-W01 | 城市建筑、工厂队列、产物、建造时间读取 | surveyWorld | OnWaterRequest/Response；附加 AllItem、AllResource、MyResFields、MyFleets 同名Response；实时或 server cached adapter | GET /api/world；任务与海面页 | 只读 | EXISTING_UI；world:77；server:446,856 | world planner selftest:546,608；复用解析；旧 survey 可选查询失败折null，Explorer另有状态 |
| BIZ-W02 | 库存归并与人口/上限计算 | surveyWorld → stock Map/have、配置 effect | Item/Resource + BuildingUpgradeCfg、BuildingParamCfg | 任务与海面页/订单模拟间接使用 | 只读配置计算 | EXISTING_UI；world:97–128,171–188 | selftest:546；共享资源映射现有可复用 |
| BIZ-W03 | 获取居民需求与物品缺口 | surveyWorld → orders requirements/missing | OnWater.workerOrder + 库存 | 任务与海面页/订单规则预览 | 只读 | EXISTING_UI；world:131–139 | tests/order-rules-api.test.mjs；复用 |
| BIZ-W04 | 普通/特殊订单经验 | surveyWorld | WorkerOrderCfg EXP×数量；WorkerSpecOrderCfg.times 对 textId | 订单规则页面 | 只读 | EXISTING_UI；world:140–165 | order rule/服务端测试；缺配置为null |
| BIZ-W05 | 订单金币奖励 | 无可靠实现 | 当前只算EXP；无应计金币字段 | 无 | 只读 | NOT_FOUND；world:140–165 | 不得用0代替未知；新规则审计另列 |
| BIZ-W06 | 收工厂成品与建筑产物计划 | planWorld → runWorld | GainFactoryProduce/CollectBuildingProduct 配对Response | 只读计划可见；旧写API禁用 | 写/收取 | EXISTING_FUNCTION；world:209–237,434 | selftest:546；复用 |
| BIZ-W07 | 到期竣工与空位建造 | planWorld → runWorld | FinishUpgradeBuilding、BuildBuilding；无专属Response | 任务与海面页计划；写禁用 | 写/配置材料 | EXISTING_FUNCTION；world:239–288 | selftest:608–665；互斥/等级/条件/maxBuilds |
| BIZ-W08 | 订单优先交付/低经验缺料刷新 | planWorld → runWorld | FinishWorkerOrder/Response；DenyOrder无专属Response | CLI world；旧写API禁用 | 写/材料 | PARTIAL；world:290–318 | selftest:588–601；旧链未接新规则评估，预算判断有错误 |
| BIZ-W09 | 跨订单与其他计划材料预留 | planWorld reserved/free | 初始库存、各步骤consume | 计划返回 reserved | 纯计划 | PARTIAL；world:205–207,292–294 | 现有测试验证生产/升级预留，未覆盖多个可交订单；合成证明下列缺口 |
| BIZ-W10 | 按订单缺口排产 | planWorld | StartFactoryProduce；无专属Response；BuildingProduceCfg | 任务与海面计划；CLI world | 写/材料 | EXISTING_FUNCTION；world:320–351 | selftest:575–586；按缺口再短耗时，尊重自动生产与队列/库存上限 |
| BIZ-W11 | 余料升级建筑 | planWorld | UpgradeBuilding，无专属Response；BuildingUpgradeCfg | 任务与海面计划；CLI world | 写/材料/时间 | PARTIAL；world:353–385 | selftest:546；候选先筛再多选，彼此最终消耗未逐项再核验，多个候选可能超预算 |
| BIZ-W12 | 可选加速建筑/生产 | planWorld | SpeedUpUpgradeBuilding、SpeedUpFactoryProduce；type2 | CLI --speed-up；Web写禁用 | 写/加速器 | EXISTING_FUNCTION；world:388–424 | actions/参数测试；复用、不含钻石 |
| BIZ-W13 | 串行计划执行与失败同类隔离 | runWorld、stepKey | response明确则 request，否则sendWatch400 | CLI world/field/loop | 写 | EXISTING_FUNCTION；world:427–470 | A覆盖底层，未发现独立完整runWorld故障/取消测试；无逐步AbortSignal |
| BIZ-W14 | 世界地图资源田资产读取/展示 | loadMapAsset/mapPath/formatFieldReport | work/cdn JsonAsset；MyResFields、MyFleets | CLI field info；Explorer原始数据 | 只读 | EXISTING_FUNCTION；world:480–536 | 未找到专属planField测试；地图资源可缺，不是假定自动探索 |
| BIZ-W15 | 指定资源田占领计划 | idleFleets → planFieldOccupy → runWorld | ChallengeResField{resFieldGridIdx,fleetBuildingIds} | CLI field occupy；无Web入口 | 写/派舰 | EXISTING_FUNCTION；world:512,537 | 自动选 state1且durability>0；校验上限和已知舰队，不是自动抢田循环 |
| BIZ-W16 | 放弃自有资源田 | planFieldGiveUp → runWorld | GiveUpResField{resFieldGridIdx} | CLI field giveup；无Web入口 | 写 | EXISTING_FUNCTION；world:561 | 校验自己已拥有；未找到专属测试 |

### 英雄养成

| ID | 功能 / Function | Request → Response / 数据源 | API/UI | 性质/成本 | 状态与位置 | 测试/建议 |
|---|---|---|---|---|---|---|
| BIZ-H01 | 英雄及阵容数据读取、养成计划展示；planHeroes、maxHeroLevelFor | AllHero/AllItem、玩家等级、配置；GetFormation 由Snapshot取得 | GET /api/heroes，英雄页 | 只读 | EXISTING_UI；heroes:35,62；app:335；server:841 | selftest:373–417，直接复用 |
| BIZ-H02 | 英雄升级；planHeroes→runHeroPlan→sendHero | HeroLevelUpRequest{heroId} → SCUpdateHero/Prompt观察，无专属Response | CLI heroes；旧 /api/heroes/run 禁用 | 英雄经验道具 | EXISTING_FUNCTION；heroes:62,210,245–266 | 计划测试；没找到执行层独立测试；按count逐次请求 |
| BIZ-H03 | 英雄升星；planHeroes→runHeroPlan | HeroStarUpRequest{heroId,universal} → HeroStarUpResponse | 同上 | 英雄碎片，可选通用碎片，按品质配置 | EXISTING_FUNCTION；heroes:62,210,261 | 计划测试；失败按英雄+kind停止后续同类 |
| BIZ-H04 | 英雄技能升级；planHeroes→runHeroPlan | HeroSkillLevelUpRequest{heroId,skillIdx(1起)} → SCUpdateHero/Prompt观察 | 同上 | 技能材料；星级解锁约束 | EXISTING_FUNCTION；heroes:62,210,248 | selftest:407–417；未升级未解锁技能 |
| BIZ-H05 | 装备/徽章穿戴、升级、替换、精炼、升星、专武养成 | 当前只有 Equips Snapshot，无上述执行 Function | Explorer数据；无动作UI/API | 会消费材料/金币 | DATA_ONLY（目标）；参考heroGrow已实现，见后 | 不能重新从零研究，先评估参考移植 |

### 日常、任务、奖励、商店与战斗旧驱动

| ID | 功能 / Function | Request → Response / 数据源 | API/UI | 性质/成本 | 状态与位置 | 测试/建议 |
|---|---|---|---|---|---|---|
| BIZ-D01 | 日常任务进度、目标与可执行动作评估；describeDailyTask/surveyDailies/DAILY_DRIVERS | DailyTaskInfo/Response；AllItem/AllResource；各driver probes；配置 | GET /api/dailies，日常页（缓存） | 只读 | EXISTING_UI；dailies:44,138,359；server:846 | selftest:423–468；可选probe失败→null为旧链局限 |
| BIZ-D02 | 免费与招募券单抽；Function：DAILY_DRIVERS[1002] → runDailies→sendAction | RecruitInfo/Response；RecruitStart{way1免费/way2券}/RecruitStartResponse | CLI dailies，写API禁用 | 消耗免费次数或招募券 | EXISTING_FUNCTION；dailies:139–165,445 | driver结构测试；无完整执行故障测试；没有十连/高级计划 |
| BIZ-D03 | 日常单次主线战斗；Function：DAILY_DRIVERS[1003] → runDailies | ChallengeStage{stage=player.mainlineStage}/Response | 仅旧CLI驱动；独立Stage产品另列 | 战斗写操作；源码标体力，真实成本需协议/配置证据 | PARTIAL；dailies:167–181 | selftest:454；未使用Stage严格胜负/关卡/runId门控，不应替代新Runner |
| BIZ-D04 | 挂机满段领取驱动；Function：DAILY_DRIVERS[1004] | AfkInfo/Response → DrawAfkReward/Response | CLI dailies | 收益领取 | EXISTING_FUNCTION；dailies:183–196 | ready时钟判断；底层A |
| BIZ-D05 | 竞技场低战力对手挑战；Function：DAILY_DRIVERS[1005] | ArenaInfo/Response → ArenaChallenge{rank,challengeId}/Response | CLI dailies；无可用写UI | 竞技场次数 | EXISTING_FUNCTION；dailies:198–218 | driver结构；未有Stage式结果验证 |
| BIZ-D06 | 免费点金/可选钻石点金；Function：DAILY_DRIVERS[1006] | ClickGoldInfo/Response → ClickGold{times,free}/Response | CLI dailies --paid 控付费 | 免费次数或钻石 | EXISTING_FUNCTION；dailies:220–252 | selftest:438–448；免费逐次times1，配置价格 |
| BIZ-D07 | 折扣店挑最低价购买；Function：DAILY_DRIVERS[1007] | DiscountShop/Response → DiscountShopBuyRequest{id}；协议存在DiscountShopBuyResponse，但当前driver action.response=null，仅sendWatch，未使用配对Response | CLI dailies；Web写禁用 | 钻石 | PARTIAL；dailies:254–273,450 | 已确认目标 status=ready 绕过allowPaid，参考needsPaid已修；使用前优先修边界 |
| BIZ-D08 | 贸易日常能力；Function：DAILY_DRIVERS[1008] probes | CargoShips/TradeInfo同名Response，仅评估说明，无action | 日常评估；Explorer货船 | 只读 | DATA_ONLY；dailies:275–288 | 目标未有FillCargo/领船奖；参考tradePort可复用 |
| BIZ-D09 | 英雄经验试炼推进；Function：DAILY_DRIVERS[1009] | TrialRaidInfo{raidId:1}/Response → TrialRaidChallenge{raidId,stageId}/Response | CLI dailies；写UI禁用 | 挑战次数 | EXISTING_FUNCTION；dailies:290–313 | selftest:464–468，区分passedStage与stageId、玩家等级 |
| BIZ-D10 | 海盗免战扫荡；Function：DAILY_DRIVERS[1010] | AllPirate/Response → PirateSweep{uid,cityId}，无专属Response | CLI dailies | 扫荡次数；不派舰 | PARTIAL；dailies:315–333 | selftest:450空海盗；未扣每日sweepTimes配额，reference已有正确已用次数解释 |
| BIZ-D11 | 联盟情报日常探测；Function：DAILY_DRIVERS[1011] | TradeGuildRadar/Response | 日常说明，无action | 只读 | DATA_ONLY；dailies:335 | lockedReason仅占位，不应写成已可执行 |
| BIZ-D12 | 联盟订单日常探测；Function：DAILY_DRIVERS[1012] | GuildCityInfo/Response | 日常说明，Explorer GuildOrder原始 | 只读 | DATA_ONLY；dailies:336 | 当前没有FinishGuildOrder Function，参考有 |
| BIZ-D13 | 联盟互助探测；Function：DAILY_DRIVERS[1013] | GuildAidList{type:0}/Response | 日常说明，无action | 只读 | DATA_ONLY；dailies:337 | 未找到实际互助/捐赠 Function |
| BIZ-D14 | 请求帮助/城战功勋日常驱动；Function：DAILY_DRIVERS[1014/1015] lockedReason | 无probe，无action | 日常说明 | 无执行 | NOT_FOUND（执行）；dailies:338–339 | 只是名称占位；参考cityWar另有模块 |
| BIZ-D15 | 博物馆探险探测；Function：DAILY_DRIVERS[1016] | MuseumInfo/Response | 日常说明，无action | 只读 | DATA_ONLY；dailies:340 | 未找到当前博物馆探险执行 Function |
| BIZ-D16 | 跨服积分赛探测；Function：DAILY_DRIVERS[1017] | LeagueInfo/Response | 日常说明，无action | 只读 | DATA_ONLY；dailies:341 | 未找到当前积分赛执行 Function |
| BIZ-D17 | 执行日常动作并收尾领奖；Function：runDailies→sendAction→claimDailies | 有Response走request，其余sendWatch400；动作间隔400ms，收尾等1s | CLI dailies/loop，旧写API禁用 | 多种写/资源 | PARTIAL；dailies:432–475 | 计划有测、缺执行层覆盖；钻石边界缺口见D07；不具Stage取消/终态约束 |
| BIZ-D18 | 领取已完成日常任务奖励；Function：claimDailies | 重读DailyTaskInfo → DrawDailyTaskReward/Response | 同上 | 奖励领取 | EXISTING_FUNCTION；dailies:479–500 | 底层A；领取后再次重读活跃度 |
| BIZ-D19 | 日/周活跃宝箱计划与领取；Function：chestTiers/planChests→claimDailies | DailyActivityRewardCfg/WeeklyActivityRewardCfg → DrawDailyReward / DrawWeeklyReward，无专属Response | 日常页计划+CLI执行 | 奖励领取 | EXISTING_FUNCTION；dailies:54–117,502–514 | selftest:361,668–701 日周阈值/已领索引/季度；直接复用 |
| BIZ-D20 | 每日免费赠礼计划与验证；Function：planDailyGift→claimDailies | DailyGiftPack/Response → GotFreeDailyPack(赠礼) → 重读drawnPack | 日常页计划+CLI执行 | 免费奖励 | EXISTING_FUNCTION；dailies:118,516–534 | selftest:704–724；失败时旧结果重复计数（参考已修） |
| BIZ-D21 | 主线/支线任务状态与领奖计划；Function：surveyTasks、taskTarget | MainTaskInfo/Response + MainTaskCfg/BranchTaskCfg | GET /api/tasks，任务页 | 只读 | EXISTING_UI；tasks:33,61–127 | selftest:471起 taskTarget；复用 |
| BIZ-D22 | 成就状态与领奖计划；Function：surveyTasks | AchievementInfo/Response，优先服务端targetProgress | 任务页 | 只读 | EXISTING_UI；tasks:129–152 | 旧解析可复用，不编造缺目标 |
| BIZ-D23 | 每日订单档位判断；Function：nextOrderTier→surveyTasks | OnWater.orderOfTheDay + OrderOTDRewardCfg | 任务页 | 只读 | EXISTING_UI；tasks:51,154–176 | selftest任务档位相关；可复用 |
| BIZ-D24 | 主/支/成就/订单档奖励串行领取；Function：runTasks | DrawMainTaskReward、GotBranchTaskReward、GotAchievementReward、GetNextOrderOTDReward；全sendWatch | CLI tasks/loop；旧写API禁用 | 奖励领取 | PARTIAL；tasks:180–210 | 同调用失败记忆有，跨轮没有；reference182接受rejected Set，勿重复研究 |
| BIZ-D25 | 一键可领取清单与前后对比；Function：app内部planLoot→loot→runAction | collectState前后；邮件/日常/活跃/成就/挂机/竣工/建筑产品 | CLI loot（--dry支持），非导出Function | 多种奖励/建造写 | EXISTING_FUNCTION；app:182–310 | 无独立planLoot导出测试；新产品应抽复用而非整段复制 |

### 区服、自动循环与组合关系

| ID | 功能 / 调用链 | Request / 来源 | API/UI | 性质 | 状态 / 位置 | 测试与限制 |
|---|---|---|---|---|---|---|
| BIZ-L01 | 角色摘要/区服列表与分组；Function：describeRole/listWorlds/listGroup | GameWorldList/Response、GameWorldGroupList/Response | GET /api/worlds；区服页；CLI worlds | 只读（GET worlds会即时联网，Stage忙则拒绝） | EXISTING_UI；worlds:23,51,60；server:861–869 | 未找到专门完整网络测试；describeRole为现有复用点 |
| BIZ-L02 | 指定区服登录；Function：enterWorld→新GameClient.connect({...login,worldId}) | LoginRequest/LoginResponse | CLI worlds enter；旧POST入口禁用 | 可能创建新角色，不能当查询 | EXISTING_FUNCTION；worlds:68–79 | 当前需保留显式授权；不是无副作用选服 |
| BIZ-L03 | 固定三段自动循环；Function：runLoop → surveyTasks/runTasks → surveyDailies/runDailies → surveyWorld/planWorld/runWorld | 各既有业务请求 | CLI loop；GET /api/loop查看；Web start/stop禁用 | 多种写/资源 | PARTIAL；loop:13–85；app:589 | rounds<=0无限、默认60s；无通用Workflow；非各步取消；任务rejected未跨轮传 |
| BIZ-L04 | 循环轮次记录/步骤回调；Function：runLoop history/onRound/onStep→formatLoopRound | 内存历史 | GET /api/loop只读 | 本地 | EXISTING_FUNCTION；loop:29,35,80,88 | 目标未找到独立runLoop测试；不是持久化编排或定时计划 |
| BIZ-L05 | 订单库存→评估→刷新/交单组合；Function：新order-rules只读决策 + 旧finishOrder/rerollOrder | Snapshot和配置/旧动作 | 当前仅模拟UI，不执行 | 决策只读；执行会消耗 | PARTIAL；world:290；actions:168,176 | 两套决策未接；需执行前共享库存与授权，不是缺底层动作 |
| BIZ-L06 | 建筑→队列→收取/排产组合；Function：surveyWorld→planWorld→runWorld | OnWater/库存/配置 | CLI world，计划只读UI | 写/材料 | EXISTING_FUNCTION；world:77,194,434 | 已有完整最小链；多候选预算与确认不足需修 |
| BIZ-L07 | 玩家→指定阵容→主线组合；Function：玩家/formation读取与Stage Runner已存在，应用阵容动作未接 | GetFormation/MyFormationPreset | 缺阵容应用UI/Function | 潜在写 | PARTIAL | 不应把GetFormation当切换；主审计需保留阵容专项待处理 |
| BIZ-L08 | 舰队→维修→派遣组合；Function：目标仅fleet读取+资源田手动计划；无Repair Function | MyFleets、ChallengeResField | CLI field局部 | 写/资源 | PARTIAL | 参考radar/pirate成熟链可复用，目标尚未接 |
| BIZ-L09 | 通用 Workflow Engine / DAG / Rules编排 | 未找到 | 无 | 无 | NOT_FOUND | 现有固定loop和订单规则不能宣称通用引擎；本轮不开发 |

### 静态/合成审计确认的已知缺口（未修改）

1. `world.mjs:292` 用 `order.missing` 而非完整 `requirements` 判定可交。离线合成：库存布匹2，两张各需布匹2的订单，其初始missing均为空，`planWorld` 返回两次finishOrder，reserved布匹4。已有selftest只覆盖一张可交订单，不覆盖这个场景。新订单规则引擎的正确性与旧world链需分别盘点。
2. `world.mjs:354–375` 先按同一free余额建立全部upgrades候选，再slice并reserve，未在每次选取时核验余额；多个升级候选可能超计划库存。离线合成：库存木材2，两座建筑各需2，返回plannedUpgrades=2、reserved木材4。是预算计划缺口，不表示Build/Upgrade协议缺失。
3. `dailies.mjs:254–270` 折扣店付钻动作被标ready，`:450`只拦status paid。离线合成返回 `{shopStatus:'ready',shopCost:'钻石 x100',paidFlag:null}`。当前Web拒绝旧写API；CLI --yes旧loop仍有该风险。参考已增加needsPaid，优先复用修复，不能通过放宽只读白名单接入。
4. `tasks.mjs:183` 每次runTasks新建rejected；`loop.mjs:28`建rejected.tasks但调用未传入。参考tasks:182与loop已修跨轮记忆。
5. `surveyWorld`/`surveyDailies` 的可选请求失败catch→null旧行为与新Explorer状态不同，不能依此声称玩法未开放或无数据。当前Explorer有独立FAILED结果，旧自动链未来接入前需保留错误语义。
6. 对无专属Response动作，runWorld/runHeroPlan/runDailies/runTasks多以sendWatch短窗口静默视作成功；少数free gift重读验证。完整业务效果确认仍有缺口。
7. `loop`只在轮边界检查stop，sleep可注入但默认不是即时取消；单步不支持AbortSignal。不能把Stage Runner的强取消特性推广给旧循环。
8. `actions.challengeField` 将未给fleetBuildingIds的undefined转成字符串列表；参考已经归一为空数组。CLI规划链有自己的校验，不应直接暴露旧Action参数。
9. `actions.buildingCollect` 原样传入buildingId，但实际协议字段是repeated string；合成fixture-building经真实encode/decode成为逐字符列表。缺口限旧CLI act的标量适配，planWorld批量收取传数组正确，不能将两条链混为一谈。

### 参考仓库中的可复用实现（当前项目没有移植）

比较真实SHA256：`heroes.mjs`、`worlds.mjs`与目标完全相同；actions/world/dailies/tasks/loop/app不同。reference world约2113行、loop约2025行起格式函数，明显多于目标，不能当目标当前能力。以下已读取导出、survey/plan动作构造和server/loop执行链；没有执行参考代码或参考测试。

通用参考调用链：参考server对应GET→survey/view/plan；POST→显式确认→survey/view/plan→`runWorld`或专用run→再读状态。参考loop按开关/间隔重复调用相同Function。**移植时必须适配目标Session、只读边界、账号隔离、错误保留、请求关联与资源授权，不复制参考server/client整套基座。**

| ID | 可复用能力（当前状态） | 参考 Function / 精确位置（相对参考根） | 已实际构造的请求与响应 | 参考入口/测试线索 | 成本与复用建议 |
|---|---|---|---|---|---|
| BIZ-R01 | 联盟订单交付（当前DATA_ONLY） | guildOrder:54 surveyGuildOrder→107 viewGuildOrder→123 planGuildOrder→loop/runWorld | GuildOrder、GuildCityInfo、CounterInfo同名Response；FinishGuildOrder{cityId}/FinishGuildOrderResponse | ref selftest:1995–2037；loop引入:26，无专用当前API | 扣订单物品，校验库存/每日配额/城市；直接复用小模块适配 |
| BIZ-R02 | 联盟情报奖励/派舰/修理（当前无执行） | radar:183 surveyRadar→348 viewRadar→446 planRadar | RadarGetAllRewards{}、RadarSendFleets{uid可选,fleetBuildingIds}、RepairFleet{buildingId}均无专属Response；FleetRepairParam查询参数 | ref server GET radar1487/POST1493→runWorld1510；selftest:2108–2440 | 汽油，耐久阈值、战力/材料、维修预算；不是TradeGuildRadar占位 |
| BIZ-R03 | 海盗派舰实战与免战扫荡（当前扫荡PARTIAL） | pirate:160 surveyPirates→236 viewPirates→450 planPirates | ChallengePirateRequest、PirateSweepRequest（动作response null）；MyFleets/AllPirate | ref server1526/1532→runWorld1560；selftest有相关planner | 消耗汽油/扫荡配额；区分派舰实战与免战扫荡 |
| BIZ-R04 | 贸易货船补货/返航领奖（当前DATA_ONLY） | tradePort:55 surveyCargo→86 viewCargo→195 planCargo→runWorld | FillCargoShipRequest/FillCargoShipResponse；DrawShipRewardRequest/DrawShipRewardResponse | ref server1608/1614→runWorld1622 | 常规货品；共享余额避免跨船重复花；当前D08占位可替换 |
| BIZ-R05 | 联盟商船补货与应聘船长（当前未接） | guildShip:114 survey→150 view→282 plan | GuildShip/Response；GuildShipOrder{shipId,crewId}、GuildShipSeek{shipId}（未声明专属Response） | ref server GET guildship注释1643，POST1807→runWorld1817；loop导入并调用 | 补货扣常规物品；船长有英雄条件/名额；不能宣称ref GET当前可用 |
| BIZ-R06 | 联盟福利礼包领取（当前未接） | guildPack:52 survey→106 plan→139 runGuildPack | GuildInfo/Response；GotGuildWelfarePackRequest/Response（空体全部领取） | ref server1649/1655；loop段1496 | 礼包时间窗、已领取时间；显式写授权 |
| BIZ-R07 | 装备厂制造/收取（当前只有装备DATA） | equip:97 surveyEquip→199 planEquip | PickMadeEquip{buildingId}/PickMadeEquipResponse；MakeEquip{buildingId,makeId,universal:false}无专属Response | ref server1578/1584→runWorld1592；selftest2558–2647 | 配方材料/金币；按部位数量选，收取失败隔离不继续造 |
| BIZ-R08 | 海兽培育/成熟收取/材料投喂（当前DATA_ONLY） | pet:167 surveyPet→238 planPet | GetMaturePet{}、PetFeed{jobIdx}、PetBreed{petId,universal:false}均无专属Response | ref server1871/1876→runWorld1886；selftest2674–2820 | 常规材料/金币；共享余额、品质上限、队列位；不是仅AllPet解析 |
| BIZ-R09 | 徽章/装备/专武完整养成（当前DATA_ONLY） | heroGrow:235 surveyHeroGrowth→629 planHeroGrowth；1063 buildHeroRows | PutOnBadge；BadgeReplace/Response；BadgeStar/Response；EnhanceBadge/Response；PutOnEquip；EquipReplace/Response；EnhanceEquip、EquipRefine、EquipStarUp、HeroExclusiveStarUp、HeroExclusiveLevelUp（若未声明则sendWatch） | ref server1131→planHeroes1135+planHeroGrowth1136；POST heroes/grow2133→runWorld2151+runHeroPlan2157；selftest555–895 | 大量金币/材料；可按开关/上阵英雄/heroIds，不能默认整套全开 |
| BIZ-R10 | 挂机、邮件及升级依赖计划（当前底层Action已在） | idle:189 surveyIdle→283 planIdle→339 runIdle | EmailBox/Response分页、QuickGotReadEmail；DrawAfkReward/Response、DrawAfkLevelReward/Response、UpgradeAfkLevel/Response | ref server1901/1907；selftest4362起 | 升级花挂机徽章；升级after afkDraw成功约束，避免重置未领收益 |
| BIZ-R11 | 世界宝藏货轮抢占（当前未接） | treasure:258 survey→349 view→545 plan | TreasureLootStats/Response、TreasureLootList/Response、SeasonRankInfo/Response、MyFleets/Response；TreasureLootSendFleets{uid,fleetBuildingIds}无专属Response | ref server1930→runWorld1944；selftest4498–4825 | 汽油/派舰战斗；颜色/赛季/日上限/耐久/空闲约束；不是博物馆探险 |
| BIZ-R12 | 城战读状态、修理、调遣、在线奖（当前只有占位） | cityWar:207 survey→337 view→400 plan；638 claimWarOnlineReward | RepairFleet、MoveFleetsToCity；GotWorldOnlineRwdRequest{} → GotRewardResponse（claimWarOnlineReward:642–653） | ref server1679/1685→runWorld1707；loop段1600 | 汽油、联盟权限、限时窗口；未完整审计宣战写入口，不假定自动宣战 |
| BIZ-R13 | 海商王买卖/移动/奖励/免费战令（当前未接） | tradeKing:202 survey→224 view→628 plan；585 planBuy | TradeInfo/Response、TradeGuildRadar/Response、TradeCity/Response；GotTradeAchievement/Response；GotTradeReport/GotTTradeReportResponse（名字确有T）；TradeGotTask/Response；BattlePassGotReward/Response；TradeSpeed/Response；TradeSell/Response；TradeCityReport无专属；TradeBuy/Response；TradeMove/Response | ref server1836/1842→runWorld1852；loop引入 | 活动货币、商品及商会指针加速；保留免费战令type3，不推断钻石零消耗 |
| BIZ-R14 | 工厂独立页面与自选材料包覆盖（当前仅简单排产） | factories:25 packCoverPlan→67 exchangePacks；80 surveyFactories→173 viewFactories；291 startProduce；300 gainAllProducts | SelectPack{itemId,selectItemId,num}sendWatch；StartFactoryProduce；GainFactoryProduce/Response | ref server1959/1966/1989；selftest4129/4264 | 消耗包和配方物品；只许白名单包，不全量自动开包 |
| BIZ-R15 | 漂浮物拾荒、礼包码（当前只有计数/协议） | ref ACTIONS pickUpFloater/giftCode/selectPack；world增强planWorld | PickUpFloaterRequest/Response；GotGiftCodeRequest无Response；SelectPackRequest无Response | ref actions diff新增三Action；app/loot/world接入 | 礼包码原文trim；拾荒用服务端真实floaterId，不伪造Diving奖励 |
| BIZ-R16 | 农田种植/喂种、委任减时、订单供给水位（当前简单planWorld未有） | ref world:190 farmOf；217 appointProduceReduce；234 produceFinalTime；274 decideOrderReroll；565增强planWorld | FarmHarvestRequest{buildingId:string[]}、FarmPlantRequest{args:[{buildingId,productId}]}（action response:null）；AppointInfoRequest/Response + AllHeroRequest/Response只读委任计算；供给需求无新协议，沿用StartFactoryProduceRequest | ref world/loop既有组合；ref selftest广泛纯计划 | 保留现有订单Rule Engine产品定义，不能整段覆盖目标world |
| BIZ-R17 | 活动幽都驱邪/罗盘/敕令/签到（当前未接） | youdu:71 survey→123 view→214 plan；378 runYouduActive；429 settleYouduEdict；481 runYouduSigns | EvilExpelInfo/Response、CompassWheelInfo/Response、EdictInfo/Response；EvilExpelKill/Claim、SpinCompassWheel、ClaimCompassWheelReward、EdictGuess/Start | ref server1729/1735→runWorld+runYouduSigns+runYouduActive | 活动道具与资源；已在下表按Function逐项列真实请求/响应；均未接目标项目 |

### 参考专项 Function 追加明细（更精细粒度）

| ID | 参考 Function/分支与位置 | 实际数据流/Request → Response | 当前项目状态/成本/验证 |
|---|---|---|---|
| BIZ-R12a | claimWarOnlineReward；参考cityWar:638–670 | protocol存在检查→循环最多CW_ONLINE_TRIES(4)→GotWorldOnlineRwdRequest{} → GotRewardResponse→提取reward.asset；空奖励/拒绝立即停 | 当前PROTOCOL_ONLY（无执行Function）；免费在线奖励领取；reference server/loop调用，不是普遍奖励接口 |
| BIZ-R16a | farmOf；参考world:190；surveyWorld:368 | OnWaterResponse building.farm、FarmlandPlantCfg→productId/ripeAt等状态 | 当前没有农田专用解析/计划；DATA_ONLY（OnWater原始） |
| BIZ-R16b | 增强planWorld farmHarvest分支；参考world:1555–1577→runWorld | 已熟田筛选→FarmHarvestRequest{buildingId:[...]}；实际有FarmHarvestResponse，但参考动作response:null未使用，走sendWatch；数量单位为地块，不冒充真实奖励件数 | 当前PROTOCOL_ONLY（无目标Function）；收取状态修改；参考既有实现可适配 |
| BIZ-R16c | 增强planWorld farmPlant分支；参考world:1579–1687→runWorld | 空地/刚收田→检查游戏autoFarming→选种/扣种子预留→按作物分组FarmPlantRequest{args:[{buildingId,productId}]}，动作response:null | 当前PROTOCOL_ONLY（无目标Function）；消耗FarmlandPlantCfg.material种子；不修改游戏内自动种植开关；被拒作物冷却/上限/水位检查 |
| BIZ-R16d | appointEffectValue→appointProduceReduce→produceFinalTime；参考world:205,217,234；surveyWorld:383–389 | AppointInfoRequest/Response的appointed(posId,heroId) + AllHeroRequest/Response星级 + AppointPosCfg/AppointEffectCfg/HeroCfg → 减时秒数 → ceil(max(0,time-reduce)/(1+speedUp)) | 当前NOT_FOUND计算；只读；**不是更改委任或阵容**；已有参考纯计算可复用 |
| BIZ-R16e | 增强planWorld内部waterlineOf；参考world:1065–1089 | FarmlandPlantCfg作物 + BuildingProduceCfg用途计数 + farmCropCap → 用途多水位高；常规40–200且低于单种上限 | 当前NOT_FOUND策略；纯计算，无协议；影响种植及后续制造选择 |
| BIZ-R16f | 增强planWorld种子缺口需求；参考world:1091–1130 | 未到水位作物→可解锁种子配方→种子安全库存8 + 饥荒权重→demand Map；后由现有StartFactoryProduceRequest{buildingId,productId}执行 | 当前NOT_FOUND策略；消费普通配方材料；没有虚构新Request |
| BIZ-R16g | 增强planWorld过剩作物→成品需求；参考world:1131–1167 | 超水位作物 + 已齐料配方→最多FARM_FEED_MAX(3)份需求→工厂scoreFor；同一共享预算 | 当前NOT_FOUND策略；纯计划→普通排产；不为无料过剩策略自动烧包 |
| BIZ-R16h | decideOrderReroll；参考world:274；增强planWorld:872–1029 | 需求缺口、减时后配方、整条队列等待时间→leadSec→时窗/单数/刷新配额决策；FinishWorkerOrder先排，DenyOrder后排 | 当前新order-rules已有产品决策，不能整体替换；参考只可作为缺口/队列成本计算复用候选 |
| BIZ-R17a | planYoudu kill分支；参考youdu:230–249→runWorld | view.evil.alive→逐只EvilExpelKillRequest{activityId} → EvilExpelKillResponse | 当前PROTOCOL_ONLY（无执行Function）；游戏状态修改；每组错误隔离 |
| BIZ-R17b | planYoudu驱邪累计奖励；参考youdu:252–277→runWorld | 当前killTotal + 计划击杀数投影 + LinkageLSREvilExpelTotalRewardCfg→EvilExpelClaimRequest{activityId} → EvilExpelClaimResponse | 当前PROTOCOL_ONLY；奖励领取；可失败后下轮重新核算 |
| BIZ-R17c | planYoudu罗盘；参考youdu:279–298→runWorld | 持券/每次成本→按spinMax分批（默认10）→SpinCompassWheelRequest{activityId,num} → SpinCompassWheelResponse | 当前PROTOCOL_ONLY；消耗活动券；不推断免费无限抽 |
| BIZ-R17d | planYoudu罗盘累计奖；参考youdu:300–315→runWorld | view.wheel.claimable→ClaimCompassWheelRewardRequest{activityId} → ClaimCompassWheelRewardResponse | 当前PROTOCOL_ONLY（无目标Function）；奖励领取 |
| BIZ-R17e | planYoudu敕令开局；参考youdu:337–347→runWorld | canStart/入场券→EdictStartRequest{activityId} → EdictStartResponse | 当前PROTOCOL_ONLY；消耗活动贡品/入场券 |
| BIZ-R17f | planYoudu敕令作答/settleYouduEdict；参考youdu:317–336,429–445 | 既有session.rune必须4位→EdictGuessRequest{activityId,guess:rune[]} → EdictGuessResponse；开局结果可由settle续交 | 当前PROTOCOL_ONLY；影响耐心与局进度；不猜答案，不丢0合法符文 |
| BIZ-R17g | runYouduActive；参考youdu:378–418 | ClaimActivityDailyActiveRewardRequest{activityId} → ClaimActivityDailyActiveRewardResponse；最多8次；no claimable reward正常停+退避 | 当前PROTOCOL_ONLY；活动活跃奖励领取；显式run函数 |
| BIZ-R17h | runYouduSigns；参考youdu:481–550 | LinkageLSRSignCfg签到档 + 本地当天memo→ClaimActivityDailyCheckInRewardRequest{activityId,checkId} → ClaimActivityDailyCheckInRewardResponse；已签/未到期区分 | 当前PROTOCOL_ONLY；活动签到领奖；memo是进程级，移植时需账号隔离 |

协议字段补核：当前实际恢复的protobuf构造器 encode/decode表明ChallengeResFieldRequest #1 resFieldGridIdx是required int32，#2 fleetBuildingIds是repeated string；GiveUpResFieldRequest #1同为required int32。目标Action在fleet未给时String(undefined)得到['undefined']；planFieldOccupy默认自动挑空闲耐久>0舰队，但显式指定仅校验存在，没有逐项校验空闲/耐久。参考Action修复了默认空数组。DiscountShopBuyResponse实际存在，含shopItem与reward；目标driver没有使用它属于调用链缺口，不能说协议无响应。



## 居民订单策略与执行边界（领域5）

依据：当前提交的 `src/order-rules.mjs`、`src/order-rules-store.mjs`、`src/world.mjs`、`src/server.mjs` 及实际调用者。新 Rule Engine 是居民订单专用的确定性只读评估器，不能视为通用 Rules Engine。下表“同源查询”指 OnWaterRequest/Response、AllItemRequest/Response、AllResourceRequest/Response；模拟没有新增游戏请求。

| Capability ID | 功能 / 状态 | Function、代码位置 | Request → Response | API / UI | 来源 / 执行性质 | 测试 | 复用建议与缺口 |
|---|---|---|---|---|---|---|---|
| ORD-001 | 读取居民订单 / EXISTING_UI | collectState；surveyWorld，world:77、134 | OnWaterRequest → OnWaterResponse | /api/refresh、/api/world、Explorer；订单卡 | Snapshot/显式刷新；只读 | catalog、explorer-api、server-runtime | 已有查询直接复用 |
| ORD-002 | 解析需求物品与数量 / EXISTING_UI | surveyWorld，world:134；previewOrderRules，server:377 | 同源查询 | /api/world、/api/order-rules/preview | Snapshot；只读 | order-rules-api:107、166 | 预览校验需求结构/安全数量，不重复开发解析 |
| ORD-003 | 库存与缺口计算 / EXISTING_UI | surveyWorld.stock/missing；inventoryResult，rules:76；safeQuantity，server:372 | 同源查询 | preview库存事实/缺口 | Snapshot；只读计算 | rules:115、124、150；api:136、154、210、240 | 来源失败/不安全数量保持UNKNOWN，不补成功零值 |
| ORD-004 | 普通订单经验 / EXISTING_UI | surveyWorld，world:145；WorkerOrderCfg.reward的EXP×数量 | 无新增协议 | world/preview经验 | 配置＋需求；只读 | order-rules-api:107、181 | 已有解析，缺配置时未知 |
| ORD-005 | 特殊订单经验 / EXISTING_UI | surveyWorld，world:142；WorkerSpecOrderCfg，textId/times匹配 | 无新增协议 | world/preview | 配置；只读 | selftest海面组；order-rules-api | 已有解析，不能编造缺失经验 |
| ORD-006 | 金币奖励解析 / NOT_FOUND | surveyWorld仅生成rewardExp；evaluateOrder无金币逻辑 | 无确认的专门Function | 无 | 未实现业务输出 | 无专门测试 | 若需要，核对可靠reward来源后扩展解析，非重写协议 |
| ORD-007 | 规则契约校验 / EXISTING_UI | validateOrderRules，rules:28 | 无 | GET/POST /api/order-rules | 本地配置；本地写 | rules:22、32；store/api | v1最多100条、唯一id/priority，拒绝未知字段 |
| ORD-008 | 规则增删编辑/排序/启停 / EXISTING_UI | editOrderRules/renderOrderRulesEditor，page:573、587 | 无 | 策略编辑器 | 本地草稿；本地操作 | order-rules-view | 上下移动重排priority，五类规则 |
| ORD-009 | 原始物品ID匹配与名称展示 / EXISTING_UI | orderItems，server:354；orderItemText，page:569 | 无新增查询 | 配置items及候选UI | 配置＋缓存ID；只读 | rules:54；view/api | 名称只展示，不猜名称→ID |
| ORD-010 | 禁止物品 / EXISTING_UI | checkRule ITEM_FORBIDDEN，rules:91 | 无 | 编辑器＋preview | 需求；只读 | rules:54、60 | 直接复用 |
| ORD-011 | 必须包含全部指定物品 / EXISTING_UI | checkRule ITEM_REQUIRED，rules:95 | 无 | 编辑器＋preview | 需求；只读 | rules:107 | 直接复用 |
| ORD-012 | 经验GT/GTE阈值 / EXISTING_UI | checkRule MIN_EXPERIENCE，rules:99 | 无 | 编辑器＋preview | rewardExp；只读 | rules:76、142 | 未知经验转REVIEW |
| ORD-013 | 单物品需求数量上限 / EXISTING_UI | checkRule MAX_ITEM_COUNT，rules:104 | 无 | 编辑器＋preview | 重复需求合计；只读 | rules:115 | 并非订单总件数上限 |
| ORD-014 | 库存规则及最终独立库存检查 / EXISTING_UI | inventoryResult/evaluateOrder，rules:76、113、141 | 无 | 编辑器＋preview | Map库存；只读 | rules:124、133、150 | 全规则通过仍检查库存 |
| ORD-015 | 优先级短路评估 / EXISTING_UI | validateOrderRules.sort/evaluateOrder，rules:57、113 | 无 | preview逐条轨迹 | 纯函数；只读 | rules:81、89、95、159 | 首个FAIL/UNKNOWN停止，禁用项SKIPPED |
| ORD-016 | 每条规则独立KEEP/REFRESH/REVIEW / EXISTING_UI | evaluateOrder，rules:134 | 无 | onFail编辑及预览 | 纯函数；只读建议 | rules:60、81、142 | REFRESH不是发送刷新 |
| ORD-017 | 全通过后建议提交 / EXISTING_UI | evaluateOrder，rules:143–146 | 无 | RECOMMEND_SUBMIT/KEEP/NEEDS_REVIEW | 纯函数；只读建议 | rules:124、150 | SUBMIT是建议，非执行 |
| ORD-018 | 账号隔离持久化/安全回退 / EXISTING_UI | loadOrderRules/saveOrderRules，store:45、61 | 无 | GET/POST /api/order-rules；加载保存恢复默认 | data/order-rules.json；本地写 | store:29–120；api | 原子替换；坏文件不覆盖，默认禁用 |
| ORD-019 | Snapshot模拟与解释 / EXISTING_UI | previewOrderRules，server:377；renderOrderPreview，page:697 | 无游戏消息 | POST /api/order-rules/preview | 编辑配置＋账号缓存；只读 | api:107、124、136、166；view | 不保存草稿、不分配Runtime，输出首个失败及轨迹 |
| ORD-020 | 跨订单库存预留 / PARTIAL | evaluateOrders，rules:151；server:380 simulationNote | 无 | 当前仅逐订单模拟 | 所有订单共用同一库存 | rules:173明确不预留 | 缺预留/分配；多个SUBMIT建议不能直接一起执行 |
| ORD-021 | 规则建议→真实提交/刷新 / NOT_FOUND | evaluator无Action依赖；world.planWorld为独立旧策略 | 旧SubmitWorkerOrder/RejectWorkerOrder已存在，见BIZ/ACT | 无规则执行API/UI | 尚无编排桥接 | rules:193证明无网络 | 复用旧Function，新增授权/编排/逐单复查，不重造请求 |
| ORD-022 | 订单执行历史持久化 / PARTIAL | runWorld返回结果，runLoop有内存history；preview返回轨迹 | 旧订单动作 | 无统一持久历史入口 | 内存及本地运行记录 | selftest/world间接 | 缺统一持久执行账本，不等于毫无执行结果 |

旧提交/刷新和低经验阈值策略位于 planWorld/runWorld 与 ACTIONS，不读取 order-rules.json，也不继承新优先级规则。“旧策略会交单”不代表“新规则自动执行已接入”。

## 主线闯关（领域8）

真实产品链：页面确认 → POST /api/stages/start → 现有 READY Session/排他检查 → createStageRunner.start → 串行 ChallengeStageRequest → parseStageResult/主线LEFT授权 → 胜利推进或停止。GET状态只读缓存；没有独立CLI stages命令。

| Capability ID | 功能 / 状态 | Function、代码位置 | Request → Response | API / UI | 来源 / 执行性质 | 测试 | 复用建议与缺口 |
|---|---|---|---|---|---|---|---|
| STG-001 | 从当前主线启动 / EXISTING_UI | createStageRunner.start/execute，stages:106、292；server:609–649 | ChallengeStageRequest{stage} → ChallengeStageResponse | /api/stages/start；开始按钮 | Session.player.mainlineStage；游戏写 | stages-api/mainline-release | 不新建登录，不由缓存浏览触发 |
| STG-002 | 主线专用LEFT授权 / EXISTING_UI | resolveMainlineChallengeSide，stages:31；authorization:16 | initialData.battleType=1、stats.isLeftWin | 主线默认适配器，HTTP不能指定side | 固定模式授权；判断 | mainline-release:63、127、137、186 | 其他模式仍SIDE_UNVERIFIED |
| STG-003 | 关卡号/Boolean胜负检查 / EXISTING_UI | parseStageResult，stages:77 | own mainlineStage/isLeftWin | API/UI结果及错误 | 本次关联响应；只读判断 | stages:11；mainline-release:106–119 | 缺失/类型错/关卡错为ERROR，不猜战败 |
| STG-004 | 胜利推进下一关 / EXISTING_UI | execute，stages:237–276 | 同STG-001 | 启动后自动推进 | progress+1；游戏写 | stages:01/05；mainline-release:82 | 不发额外查询/跳过，不等动画 |
| STG-005 | 明确战败后重试 / EXISTING_UI | execute WAIT_RETRY，stages:276–290 | 同关卡ChallengeStage | retryDelaySeconds输入，默认10秒 | 本次配置；游戏写 | stages:02/03/07/08/13 | 不与胜利间隔混用 |
| STG-006 | 首次战败立即停止 / EXISTING_API | execute stopOnDefeat，stages:278；validateStageConfig | 同STG-001 | start.config.stopOnDefeat；UI只透传已有值，无新建勾选框 | 可选Boolean策略 | stages-stop-on-defeat全部8项 | 仅需补UI控件即可由页面设置，不重写Runner |
| STG-007 | 最大总开战次数 / EXISTING_UI | execute attempts/maxAttempts，stages:202、218、254 | 同STG-001 | 最大尝试次数输入，可空 | 胜利＋失败总次数；边界 | stages:04/06；mainline-release:170 | null无限，达限不再等下一关 |
| STG-008 | 最高目标关卡 / EXISTING_UI | execute maxStage，stages:200、251 | 同STG-001 | maxStage输入，可空 | 当前/本地预期下一关 | stages:05；mainline-release:170 | 已超过目标则不挑战 |
| STG-009 | 胜利后随机10–11秒 / EXISTING_UI | interStageDelay，stages:260；validate:43 | 不增加消息 | server:565 defaults；page:779默认提交 | crypto.randomInt闭区间毫秒采样；本地等待 | cooldown:45、64、179；B4 API/UI | 已入基线；旧API省略仍即时推进，后续Harness须显式设置 |
| STG-010 | 下一关倒计时/随机时长历史 / EXISTING_UI | nextStageAt/history，stages:266；page:793 | 无 | GET /api/stages；倒计时及历史 | Runner内存；只读 | cooldown、B4 view | 保存选定等待时长；UI约3秒更新，不等于取消后实际等待时长 |
| STG-011 | RATE_LIMITED独立停止 / EXISTING_UI | stageError，stages:67；finish:139 | 明确归因的PromptResponse限频文本 | error.code/at/message及UI | 脱敏原错＋时间；停止 | cooldown:138、186；B4 view | 不计战败/不重试；真实10–11秒效果待授权验证 |
| STG-012 | 同账号排他/未决锁 / EXISTING_UI | pendingRequest/start，stages:113、303；server:632 | 单请求串行 | 冲突拒绝，缓存仍可浏览 | 每Session；保护 | stages:15/16；cooldown:78；API | 等待时running=true；账号间可并行 |
| STG-013 | 停止/失效/删除取消 / EXISTING_UI | stop/fail/listen/waitDelay，stages:161、171、189 | 无额外操作 | /api/stages/stop；停止按钮 | AbortSignal/连接事件 | stages:09/12/13、abort；cooldown:87/95 | 无法撤销已发战斗；保留未决和uncertain |
| STG-014 | runId/generation/迟到保护 / EXISTING_UI | current/assertActive/activeRun，stages:129、173、227 | 原关联响应 | 状态API/UI runId及页面代次 | Session代次 | stages:16/generation；cooldown:108/113/122 | 旧Timer/旧响应不推进新任务 |
| STG-015 | 内存历史/状态重读 / EXISTING_UI | HISTORY_LIMIT=200；getStatus，stages:7、120 | 无 | GET /api/stages；页面重开可读 | 进程内缓存；只读 | stages-view/api | 关页面不停止；重启进程不恢复历史/任务 |
| STG-016 | 持久化Runner历史/自动恢复 / NOT_FOUND | stages无存储/恢复入口；E2E脚本不是产品能力 | 无 | 无 | 未实现 | 无 | 不把work日志当数据库/持久调度器 |
| STG-017 | 其他战斗模式支持 / PROTOCOL_ONLY | assertMainlineContext仅接受主线，其他模式协议见附录 | 其他模式请求未接入Runner | 无其他模式入口 | 协议线索 | mainline-release:127–149 | 各模式需独立适配/证据，不能推广LEFT结论 |

## 阵容与战斗编队（领域7）

重新核对当前src、已恢复协议和客户端业务摘录。本地证据：`work/e2e/20261110-b4/formation-client-evidence/manifest.json`（源包缓存版本76、来源/哈希/偏移）；不纳入Git，也不据此前AI结论直接标成功。

| Capability ID | 功能 / 状态 | Function、代码位置 | Request → Response | API / UI | 来源 / 性质 | 测试 | 复用建议 |
|---|---|---|---|---|---|---|---|
| FRM-001 | 当前主线阵容读取 / EXISTING_UI | game:11、165；catalog:25 | GetFormationRequest{module:1} → GetFormationResponse.formation | Snapshot/Explorer及英雄摘要 | Snapshot；只读 | data-catalog/explorer | 已有读取，不代表可编辑 |
| FRM-002 | 已解锁阵型模板ID读取 / EXISTING_UI | game:36；catalog:50 | MyFormationPresetRequest{} → MyFormationPresetResponse.ids | Explorer原始JSON | Snapshot；只读 | data-catalog/explorer | ids不是完整英雄队伍 |
| FRM-003 | 保存/修改当前阵容 / PROTOCOL_ONLY | 客户端MainLineFormationView.saveFormation；当前src无Function | SaveFormationRequest{module,formation} → SaveFormationResponse.formation | 无生产API/UI | 协议＋客户端链；游戏写 | B4本地6项codec检查 | 新增小型Function，复用现有协议 |
| FRM-004 | 应用已解锁阵型模板 / PROTOCOL_ONLY | 客户端MainLineFormationView.onSwitchFormationType→FormationBase.switchPresetFormation | SaveFormationRequest完整heroPositions/presetId/petUid → SaveFormationResponse | 无生产Function/API/UI | 配置＋当前英雄；游戏写 | B4静态/codec | 按职业排序后分配目标站位，不能只改presetId |
| FRM-005 | 解锁阵型模板 / PROTOCOL_ONLY | 客户端FormationTypePanel._onBtnOK；UnlockCfg | UnlockFormationPresetRequest{id}；无同名专用Response定义 | 无 | 默认1＋23解锁模板；消耗图纸 | B4codec | 不应自动解锁/购买，资源授权独立 |
| FRM-006 | 更换上下阵英雄 / PROTOCOL_ONLY | 客户端换人链/协议；当前src未接入 | SwitchFormationHeroRequest{heroIdDown,heroIdUp}；无同名专用Response定义 | 无 | 游戏写；须查换人影响 | B4协议检查 | 不等同阵型模板切换 |
| FRM-007 | 具名多套完整英雄队伍预设 / NOT_FOUND | 当前src及已检查客户端预设链未找到；MyFormationPreset仅ids | 无确认的专用请求 | 无 | 无整队存档契约 | 无 | 若需要先定义完整队伍语义，不猜协议名 |
| FRM-008 | 闯关前应用并确认阵容 / NOT_FOUND | Runner仅ChallengeStage，无formation执行分支 | 可复用Get/SaveFormation，尚无产品组合 | 无 | 未编排 | 无 | 独立applyFunction：解锁校验→重排→保存→复读→同Session锁启动Runner |

Formation：heroPositions[]、必需presetId:int32、可选petUid:int64；HeroPosition：必需heroId:string、pos；Position.x/y可选int32。保留int64和缺失语义，严格验证响应。已解锁模板切换链未发现支付字段，不能据此保证服务端无任何费用。`formation:{enabled:false,presetId:null}`可规划为阵型模板选择；若要切整套英雄队伍，契约需另定义。本轮没有实现其执行分支。


## 协议、配置资源与其他玩法协议证据

本地协议文件：`\\zhangnas\app\crazywaterword\work\extracted\_src_chunks_\src\chunks\game.js`；SHA256 `ef6137ef923f0b8b44b10379effe0ac2b3555ffab18b278e03e97b19bf4a4dcc`。

本地配置文件：`\\zhangnas\app\crazywaterword\work\cdn\config_cn_pack.json`；SHA256 `0809253d78b00a81ebb78ab9fc8b94668372f6b8a08430144710325a165da762`。

恢复来源与包版本见 work/e2e/20261110-a0/resources.json 以及 B4 静态 formation manifest；work/extracted、work/cdn 属本地恢复/可再生产资源，本轮不纳入基线，不读取真实账户响应代替源码证明。

重点配置表：FormationHeroNumCfg / FormationTypeUnlockCfg / FormationTypePositionCfg；GuildTechCfg / GuildOrderCfg / GuildHelpCfg；WorldPirateCfg / WorldBossCfg；Museum*；OfflineCfg / OfflineLvRewardCfg；Hero* / Recruit* / Shop*。应从实际 Function 使用情况判断程度。

### 本地参考版本对照

参考仓库 C:/Users/zyk-o/Documents/crazywaterword：main，HEAD 6c2825a4d7dda17bf894b45744d2fd39e6a05499，git status --short 为空。已实际读取 game.mjs、proto.mjs、config.mjs。proto.mjs 与当前逐字节相同；参考版已有同 48 查询和 summarize，但 collectState 会发 ENTRY_SIGNALS、无当前 raw/outcomes/single-flight；当前已保留源码复用并补齐账号隔离、失败语义和安全序列化。参考版没有 data-catalog.mjs。config.mjs 有实现差异，不应为复用而整文件覆盖当前版本。

### 协议层已存在、业务层未完成的重点能力

以下为已核对的真实消息族；均不等于完整产品入口。具体已实现 Action 以业务 Function 清单为准。尤其 dailies 的 probes / lockedReason 只是查询/占位，不能认作互助、博物馆或公会业务执行。

| ID | 业务族 | 实际 Request / 同名 Response | 源码差距与复用建议 |
| --- | --- | --- | --- |
| PRO-001 | 公会科技 | UpgradeGuildTechRequest → UpgradeGuildTechResponse；ResetGuildTechRequest → ResetGuildTechResponse | 科技信息已查询；升级/重置未找到目标业务 Function；重置可能消耗资源，需实际客户端规则 |
| PRO-002 | 公会订单与互助 | FinishGuildOrderRequest → FinishGuildOrderResponse；GuildAidHelpRequest → 无同名 Response；GuildAidAskRequest → 无同名 Response；GuildAidListRequest → GuildAidListResponse；MyGuildAidRequest → MyGuildAidResponse；GotMyGuildAidRequest → 无同名 Response；CancelMyGuildAidRequest → 无同名 Response；DonateFortRequest → DonateFortResponse | GuildOrder 基础 raw + GuildAidList 日常探测不等于捐赠/求助执行 |
| PRO-003 | 舰队维修/编队/派遣 | FleetSaveFormationRequest → 无同名 Response；RepairFleetRequest → 无同名 Response；StopRepairingRequest → 无同名 Response；MoveFleetsToCityRequest → 无同名 Response；SpeedUpFleetRequest → 无同名 Response；SpeedUpRepairRequest → 无同名 Response；FleetRepairParamRequest → FleetRepairParamResponse；SetFleetAutoFightRequest → 无同名 Response | MyFleets 数据可读；未找到相应完整维修/编队业务入口；SpeedUp 不能视为免费 |
| PRO-004 | 货船操作 | FillCargoShipRequest → FillCargoShipResponse；DrawShipRewardRequest → DrawShipRewardResponse；SpeedUpShipRequest → 无同名 Response | CargoShips 已采集；装货/领船奖励/加速需独立确认执行与消耗 |
| PRO-005 | 世界与限时 Boss 战斗 | ChallengeWorldBossRequest → 无同名 Response；LimitedBossSendFleetsRequest → 无同名 Response | WorldBossInfo / LimitedBossOpen 已采集；不可继承主线 LEFT 授权 |
| PRO-006 | 博物馆展陈与探险 | MuseumExhibitRequest → 无同名 Response；MuseumUpgradeKeywordRequest → 无同名 Response；MuseumUpgradeCaseRequest → 无同名 Response；MuseumSpeedUpCaseRequest → 无同名 Response；MuseumFinishCaseUpgradeRequest → 无同名 Response；MuseumUpgradeExhibitionRequest → 无同名 Response；MuseumCollectRevenueRequest → MuseumCollectRevenueResponse；MuseumClaimAchievementRequest → 无同名 Response；MuseumStartExploreRequest → MuseumStartExploreResponse；MuseumSpeedUpExploreRequest → MuseumSpeedUpExploreResponse；MuseumCompleteExploreRequest → MuseumCompleteExploreResponse；MuseumRewardRequest → MuseumRewardResponse | MuseumInfo 是日常只读 probe / locked 占位；缺业务执行 |
| PRO-007 | 藏品养成 | ActivateAntiqueRequest → 无同名 Response；AntiqueStarUpRequest → 无同名 Response；AntiqueSuitLevelUpRequest → 无同名 Response；AntiqueFragExchangeRequest → 无同名 Response；AntiqueMasterLevelUpRequest → AntiqueMasterLevelUpResponse；AntiqueAttrSummaryRequest → AntiqueAttrSummaryResponse | AllAntique 摘要已实现；此组培养/兑换/查询未找到完整 Function |
| PRO-008 | 贸易与货运玩法 | TradeInfoRequest → TradeInfoResponse；TradeBuyRequest → TradeBuyResponse；TradeSellRequest → TradeSellResponse；TradeMoveRequest → TradeMoveResponse；TradeSpeedRequest → TradeSpeedResponse；TradeCargoUpgradeRequest → TradeCargoUpgradeResponse；TradeBuySpeedItemRequest → TradeBuySpeedItemResponse；TradeGuildRadarRequest → TradeGuildRadarResponse | TradeInfo / TradeGuildRadar 日常探测不是贸易执行 |
| PRO-009 | 寻宝与掠夺 | TreasureLootStatsRequest → TreasureLootStatsResponse；TreasureLootListRequest → TreasureLootListResponse；TreasureLootRankRequest → TreasureLootRankResponse；TreasureLootDefenceRequest → TreasureLootDefenceResponse；TreasureLootSendFleetsRequest → 无同名 Response | 真实协议存在；未找到完整业务执行入口 |
| PRO-010 | 其他模式阵容 | ArenaFormationInfoRequest → ArenaFormationInfoResponse；ExpeditionSaveFormationRequest → ExpeditionSaveFormationResponse；LeagueSaveFormationRequest → 无同名 Response；LeagueFormationSequenceRequest → 无同名 Response；LeagueOtherFormationRequest → LeagueOtherFormationResponse；TournamentFormationRequest → TournamentFormationResponse；TournamentSaveFormationRequest → TournamentSaveFormationResponse；UltraSaveFormationRequest → 无同名 Response；UltraFormationSequenceRequest → 无同名 Response | 协议存在；与主线 FormationModule=MAINLINE 分开，不能沿用主线胜负/队伍授权 |


工具局限补充：tools/describe.mjs 的部分嵌套类型识别使用 tf.protocol 正则，而当前生成包可能使用 tk.protocol；字段显示 unknown 时应结合实际 encode/decode 与生成源码核对，不能判定协议缺失。该工具已有且可复用，但不能视为完整反射系统。


## 5. API 与 Function 的产品接入结论

实际完整路由和 8 页地图见 PLT 节。以下是产品规划时必须保留的边界：

| 已有实现层级 | 可直接复用的入口 / Function | 当前尚缺什么 |
| --- | --- | --- |
| 平台与账号 | loadStore/pickAccount/upsertAccount/saveStore；Session connect/cancelSession；GameClient.request/sendWatch；redact | 不换账号基座；CLI安全输出、旧Web捕获handler需另行修复后才可开放 |
| 数据 | collectState/summarize/exploreSnapshot/toSnapshotJson；cachedClient | 新数据视图优先复用目录/解析；21项没有专门解析不是协议缺失 |
| 只读订单决策 | validateOrderRules/evaluateOrder/evaluateOrders；load/saveOrderRules；previewOrderRules | 新规则→受授权执行桥接、库存预留和执行前复查 |
| 主线 | createStageRunner/parseStageResult/resolveMainlineChallengeSide | 不重写Runner；stopOnDefeat UI开关、配置持久化、持久历史尚无完整入口 |
| 旧动作 | 27 ACTIONS、buildBody/assertAllowed/runAction | 无通用开放Web写入口；不能默认“sendWatch未报错=业务最终完成” |
| 城市/生产 | surveyWorld/planWorld/runWorld；planFieldOccupy/planFieldGiveUp | 修已证实的预算/确认/取消缺口，再做明确授权入口 |
| 英雄 | planHeroes/runHeroPlan | 当前Web执行禁用；装备/徽章等增强优先参考heroGrow而非重做 |
| 日常/任务 | surveyDailies/runDailies/claimDailies；surveyTasks/runTasks | 付费边界、跨轮失败记忆、取消和执行确认需补齐；probe占位不可当执行 |
| 固定循环 | runLoop/formatLoopRound | 是固定顺序CLI自动化；不是可编辑工作流或持久调度系统 |
| 参考独立模块 | guildOrder、guildPack、tradePort、idle、radar、pirate、heroGrow、equip、pet、treasure、cityWar、tradeKing、factories、youdu等 | 源码已在本机参考库；按目标Session/授权/脱敏接入，逐项复用计划，不搬整套server/client |

“直接复用”指已有业务计算/请求构造无需重造，不表示绕过当前只读边界、取消用户确认或免除必要的资源预算检查。

## 6. 现有组合关系

| 组合 | 当前实现 | 最小缺口 / 规划依赖 |
| --- | --- | --- |
| 登录 → Snapshot → Explorer | 完整产品链；显式connect/refresh，之后缓存轮询 | 保持48目录与账号generation，不加隐式查询 |
| 玩家 → 主线挑战 → 再挑战 | 独立Stage API/UI和Runner已实现 | 胜利间隔已实现；真实限频效果待未来授权验收 |
| 玩家 → 指定阵型 → 主线 | 读取和挑战存在，保存/应用只在协议及客户端 | 实现小型apply业务Function和确认；共享同账号排他锁，再启动Runner |
| 库存 → 新规则 → 提交/刷新 | 当前到模拟建议为止；旧提交/刷新Function已在 | 受授权执行桥接、共享库存、计划与执行时状态复核；不能直接把REFRESH标签当网络动作 |
| 建筑 → 队列 → 收取/排产 | 旧world CLI已有端到端survey/plan/run | 先修跨候选预算、动作效果确认和取消，再接Web |
| 联盟订单 → 判断 → 捐交 | 当前基础数据＋probe；参考guildOrder已有完整计划 | 适配参考模块；不能用占位driver当已完成 |
| 舰队 → 维修 → 派遣 | 当前只有局部资源田规划；参考radar/pirate等已有链 | 模块接入、预算/耐久/油耗/模式授权，不继承主线左右结论 |
| 多业务反复执行 | 当前固定runLoop可CLI运行 | 与Web独立Stage Runner互斥/取消语义不同；不把它提升成通用引擎 |

## 7. 确认缺失与无需重新开发的边界

以下是审计确认的**目标产品缺口**；是否排期取决于需求，不要求本轮开发。

| 缺口 | 证据范围与实现程度 | 后续处理 |
| --- | --- | --- |
| 新订单规则受授权自动执行 | evaluator无网络依赖，当前无把建议接入旧动作的桥接 | 新编排与复核，不重写FinishWorkerOrder/DenyOrder |
| 跨订单共享库存分配 | 新evaluateOrders明确独立模拟；旧planWorld存在超额预留 | 新分配逻辑/修复预算，不重做库存查询 |
| 当前项目阵型保存/应用业务Function | 只有Get/MyPreset查询；SaveFormation有协议和客户端链 | 新小型业务适配及验证，不研究新协议；闯关组合待此能力完成 |
| 具名完整英雄队伍存档 | 当前及已检客户端布局预设链未找到相应产品/协议契约 | 需求若确实指整队存档，另定义本地契约；不把presetId冒充整队 |
| 订单金币奖励业务输出 | 当前只计算EXP，未找到可靠金币解析Function | 找可靠来源后增加解析；未知不补0 |
| Runner配置持久编辑/持久历史 | 当前配置/历史在内存，history上限200；无恢复存储 | 若有需求再加最小持久机制；E2E文件不是产品账本 |
| 通用可视化Workflow/通用Rules/DAG | 当前只有固定loop、特定订单规则和Stage状态机 | 确认未实现；不作为当前必须先建的架构 |

以下属于**已有代码接入或修复**，不应列为从零开发：27 Action；英雄等级/星级/技能；日常/主支线/成就领奖；城市收取/制造/升级；固定loop；参考仓库的公会订单/福利、货船、雷达、海盗、装备宠物、挂机、寻宝、贸易和活动模块。只有协议的博物馆/其他战斗模式等也应先读客户端链，不能凭消息名承诺完整Function。

## 8. 明确待处理事项与风险

| 事项 | 当前事实 | 后续验收边界 |
| --- | --- | --- |
| 胜利后10–11秒随机间隔 | **已实现并纳入本基线**；首次不等、非终止胜利才等；取消/旧Timer/锁/倒计时/随机历史已有专项离线覆盖 | API/旧Harness若省略interStageDelay仍可即时推进；未来真实运行应显式配置，验证服务器限频效果。本轮未真实运行 |
| 阵容切换专项 | **源码审计已完成**：Get/MyPreset是查询，SaveFormation才保存/应用；模板不等于整队；当前缺业务Function/API/UI | 最小适配→响应与再读验证→同Session锁下组合Runner；不自动解锁或消耗图纸 |
| RATE_LIMITED | 已分类为ERROR停止并保留脱敏原错/时间；不重试、不计普通战败 | 不以等待10–11秒保证服务器永不再限频 |
| stopOnDefeat产品入口 | Function/API已有；页面只保留已有值，无独立开关 | 未来补控件/保存策略，不重写调度 |
| 旧world预算 | 合成证据证明两订单各需2、库存2可计划交两张；多个升级候选也可能超预算 | 保持Web写禁用；未来修复并增加针对性回归后再接入 |
| 旧dailies付费边界 | 折扣店ready未标paid，旧CLI --yes可能绕过allowPaid；参考已有needsPaid | 需独立最小修复；不能放开旧Web路由代替修复 |
| 旧Action参数适配 | buildingCollect标量传入repeated string会按字符编码；challengeField未给fleet会生成字符串undefined | planWorld/planField与直接act的参数路径不同；后续修适配并补协议回归，不能统一判定底层功能不存在 |
| 旧tasks/loop失败记忆 | runTasks每轮新建rejected，loop的集合未传递 | 参考已有跨轮复用方案，避免重做 |
| 旧执行链错误/取消 | 可选survey失败可能折null、sendWatch短窗口结果确认不足、loop只在轮边界检查stop | 新Explorer和Stage保护不自动覆盖旧CLI；接入时逐步对齐 |
| CLI统一安全 | accounts show/revealAccount可输出真实凭证；headless/state/act及旧probe未统一redact | 本轮未执行这些入口；需安全改造和合成凭证输出测试；不能宣称全平台所有入口都已脱敏 |
| 旧Web捕获handler | 当前被403阻止，但其内部仍有原始登录帧保存/自动短连身份逻辑 | 不能只改白名单开放；复用安全CLI事务链后再设计Web接入 |
| 运行资产恢复 | 协议/配置/图集来自本地恢复、Git忽略 | clone后按来源与SHA恢复；现有npm test不代表Git仓库自带全部运行资产 |
| 历史验证范围 | 本轮只证明离线回归和源码链；参考测试只阅读未运行，且多旧执行层缺专项测试 | 不重验未改旧功能；真正接入/修复时针对变更补测试，真实操作需另行授权 |

其他协议模式继续保留SIDE_UNVERIFIED；本清单没有修改任何阵营授权或安全门控。旧参考中的更丰富能力不能覆盖当前多账号、关联、取消、脱敏和只读边界。

## 9. 后续产品模块与依赖建议（仅规划）

沿用现有目录和业务分层，不建立空模块、通用引擎或新数据库：

1. **平台基座**：accounts、GameClient、Session、security、capture事务为共同依赖。业务接入使用同一账号Runtime和排他规则；浏览使用Snapshot。
2. **数据产品**：以唯一data-catalog和48项Snapshot为读模型，原始/解析/状态始终一起保留。业务模块不再创建重复采集清单。
3. **独立业务能力**：城市生产、订单决策、英雄养成、主线等继续用survey/plan/run或现有Runner。先选已有Function/参考模块，只有真实缺口才新增小Function。
4. **写执行边界**：每项业务单独声明动作、资源预算、效果确认、取消与历史；保持显式授权。订单建议→执行和阵容应用→闯关是两个小组合，均不要求完整Workflow Engine。
5. **UI接入**：先修已证实风险，再把选定Function接入明确API/按钮。旧handler和隐藏按钮不是可以统一解禁的功能包。
6. **自动化**：固定loop与Stage各自保留，先明确互斥/生命周期，等实际组合需求出现再讨论统一调度；不提前引入Rules/Workflow框架。

建议需求树优先区分“当前可用”“已有待接入”“参考可移植”“只有协议/真正缺失”。每项未来工作沿用本清单ID，写清变更目标、范围和验收；本轮停于能力盘点，等待产品需求树和统一规划。

## 附录：全部 Request / Response 类型索引（实际载入协议）

共 643 Request、361 Response、166 个 SC* 消息。346 个 Request 有同名 Response，297 个没有。没有同名 Response 只能记作未定义，不能从名称直接推断 generic OK 或服务器推送语义。

“src 引用”是排除 page/selftest/data-catalog 后，src 代码字符串的静态位置，包含查询表、probe、未发信号与动作定义，不等于已验证 Function。无 src 引用且仅存在协议时标为 PROTOCOL_ONLY。此索引供查缺，已有业务动作以调用链清单为准。

<details><summary>643 个 Request 的完整协议索引</summary>

| 索引 | Request | 实际同名 Response | 当前目标 src 静态引用 / 程度 |
| --- | --- | --- | --- |
| REQ-001 | AccumulateChargeRequest | AccumulateChargeResponse | PROTOCOL_ONLY |
| REQ-002 | AchievementInfoRequest | AchievementInfoResponse | DAT-009 DATA_ONLY；src/game.mjs:16，src/game.mjs:234，src/server.mjs:440，src/tasks.mjs:63 |
| REQ-003 | ActivateAntiqueRequest | 未定义 | PROTOCOL_ONLY |
| REQ-004 | ActivateHeroFateRequest | 未定义 | PROTOCOL_ONLY |
| REQ-005 | ActivityRankRequest | ActivityRankResponse | PROTOCOL_ONLY |
| REQ-006 | ActivityTaskInfoRequest | ActivityTaskInfoResponse | PROTOCOL_ONLY |
| REQ-007 | AdvShopInfoRequest | AdvShopInfoResponse | PROTOCOL_ONLY |
| REQ-008 | AfkInfoRequest | AfkInfoResponse | DAT-014 DATA_ONLY；src/app.mjs:20，src/dailies.mjs:186，src/dailies.mjs:189，src/game.mjs:21，src/game.mjs:234，src/game.mjs:234，src/server.mjs:502 |
| REQ-009 | AllAntiqueRequest | AllAntiqueResponse | DAT-016 DATA_ONLY；src/game.mjs:23，src/game.mjs:234 |
| REQ-010 | AllGuildAbstractionRequest | AllGuildAbstractionResponse | DAT-023 DATA_ONLY；src/game.mjs:30，src/game.mjs:234 |
| REQ-011 | AllHeroRequest | AllHeroResponse | DAT-003 DATA_ONLY；src/app.mjs:345，src/app.mjs:373，src/game.mjs:10，src/game.mjs:234，src/server.mjs:480，src/server.mjs:481，src/server.mjs:903 |
| REQ-012 | AllItemRequest | AllItemResponse | DAT-001 DATA_ONLY；src/app.mjs:19，src/app.mjs:346，src/dailies.mjs:362，src/game.mjs:8，src/game.mjs:234，src/server.mjs:364，src/server.mjs:394，src/server.mjs:446，src/server.mjs:480，src/server.mjs:482，src/server.mjs:502，src/world.mjs:91 |
| REQ-013 | AllPetRequest | AllPetResponse | DAT-033 DATA_ONLY；src/game.mjs:40，src/game.mjs:234 |
| REQ-014 | AllPirateRequest | AllPirateResponse | DAT-044 DATA_ONLY；src/dailies.mjs:318，src/dailies.mjs:321，src/game.mjs:51，src/game.mjs:234 |
| REQ-015 | AllResourceRequest | AllResourceResponse | DAT-002 DATA_ONLY；src/app.mjs:18，src/dailies.mjs:368，src/game.mjs:9，src/game.mjs:234，src/server.mjs:395，src/server.mjs:446，src/server.mjs:502，src/world.mjs:92 |
| REQ-016 | AnonymousWelfareRequest | 未定义 | PROTOCOL_ONLY |
| REQ-017 | AntiqueAttrSummaryRequest | AntiqueAttrSummaryResponse | PROTOCOL_ONLY |
| REQ-018 | AntiqueFragExchangeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-019 | AntiqueMasterLevelUpRequest | AntiqueMasterLevelUpResponse | PROTOCOL_ONLY |
| REQ-020 | AntiqueRecruitRequest | AntiqueRecruitResponse | PROTOCOL_ONLY |
| REQ-021 | AntiqueStarUpRequest | 未定义 | PROTOCOL_ONLY |
| REQ-022 | AntiqueSuitLevelUpRequest | 未定义 | PROTOCOL_ONLY |
| REQ-023 | ApplyBuildingMoveFxRequest | 未定义 | PROTOCOL_ONLY |
| REQ-024 | ApplyBuildingSkinRequest | 未定义 | PROTOCOL_ONLY |
| REQ-025 | ApplyBuildingStreakFxRequest | 未定义 | PROTOCOL_ONLY |
| REQ-026 | AppointHeroRequest | 未定义 | PROTOCOL_ONLY |
| REQ-027 | AppointInfoRequest | AppointInfoResponse | DAT-020 DATA_ONLY；src/game.mjs:27，src/game.mjs:237 |
| REQ-028 | AppointPriorRequest | 未定义 | PROTOCOL_ONLY |
| REQ-029 | ArenaChallengeRequest | ArenaChallengeResponse | src/dailies.mjs:210 |
| REQ-030 | ArenaFormationInfoRequest | ArenaFormationInfoResponse | PROTOCOL_ONLY |
| REQ-031 | ArenaInfoRequest | ArenaInfoResponse | src/app.mjs:22，src/dailies.mjs:201，src/dailies.mjs:204 |
| REQ-032 | ArenaRefreshChallengeRequest | ArenaRefreshChallengeResponse | PROTOCOL_ONLY |
| REQ-033 | ArenaReportRequest | ArenaReportResponse | PROTOCOL_ONLY |
| REQ-034 | ArenaSweepRequest | 未定义 | PROTOCOL_ONLY |
| REQ-035 | AutoAppointRequest | 未定义 | PROTOCOL_ONLY |
| REQ-036 | AutoUnAppointRequest | 未定义 | PROTOCOL_ONLY |
| REQ-037 | BadgeExchangeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-038 | BadgeReplaceRequest | BadgeReplaceResponse | PROTOCOL_ONLY |
| REQ-039 | BadgeResetRequest | BadgeResetResponse | PROTOCOL_ONLY |
| REQ-040 | BadgeStarPreviewRequest | BadgeStarPreviewResponse | PROTOCOL_ONLY |
| REQ-041 | BadgeStarRequest | BadgeStarResponse | PROTOCOL_ONLY |
| REQ-042 | BadgesRequest | BadgesResponse | DAT-007 DATA_ONLY；src/game.mjs:14 |
| REQ-043 | BatchFillMetaRequest | 未定义 | PROTOCOL_ONLY |
| REQ-044 | BatchHeroStarUpRequest | 未定义 | PROTOCOL_ONLY |
| REQ-045 | BattlePassBuyLevelRequest | BattlePassBuyLevelResponse | PROTOCOL_ONLY |
| REQ-046 | BattlePassGotRewardRequest | BattlePassGotRewardResponse | PROTOCOL_ONLY |
| REQ-047 | BattlePassRequest | BattlePassResponse | PROTOCOL_ONLY |
| REQ-048 | BattleReportRequest | BattleReportResponse | PROTOCOL_ONLY |
| REQ-049 | BeautyInfoRequest | BeautyInfoResponse | PROTOCOL_ONLY |
| REQ-050 | BeautyVoteRequest | BeautyVoteResponse | PROTOCOL_ONLY |
| REQ-051 | BeginSalvageRequest | 未定义 | PROTOCOL_ONLY |
| REQ-052 | BlackListRequest | BlackListResponse | DAT-048 DATA_ONLY；src/game.mjs:55 |
| REQ-053 | BlindBoxAutoDrawRequest | BlindBoxAutoDrawResponse | PROTOCOL_ONLY |
| REQ-054 | BlindBoxDetailRequest | BlindBoxDetailResponse | PROTOCOL_ONLY |
| REQ-055 | BlindBoxOpenRequest | BlindBoxOpenResponse | PROTOCOL_ONLY |
| REQ-056 | BlindBoxStartRequest | BlindBoxStartResponse | PROTOCOL_ONLY |
| REQ-057 | BuildBuildingRequest | 未定义 | src/actions.mjs:201，src/world.mjs:282 |
| REQ-058 | BuildFortRequest | 未定义 | PROTOCOL_ONLY |
| REQ-059 | ButtonClickEventRequest | 未定义 | PROTOCOL_ONLY |
| REQ-060 | BuyFactoryAutoProduceRequest | BuyFactoryAutoProduceResponse | PROTOCOL_ONLY |
| REQ-061 | BuyGroupBuyingProductRequest | BuyGroupBuyingProductResponse | PROTOCOL_ONLY |
| REQ-062 | BuyNewbieGiftPackRequest | 未定义 | PROTOCOL_ONLY |
| REQ-063 | BuyShopProductRequest | 未定义 | PROTOCOL_ONLY |
| REQ-064 | BuyUniqueLotteryItemRequest | BuyUniqueLotteryItemResponse | PROTOCOL_ONLY |
| REQ-065 | CakeLotteryRecordsRequest | CakeLotteryRecordsResponse | PROTOCOL_ONLY |
| REQ-066 | CampaignReportDetailRequest | CampaignReportDetailResponse | PROTOCOL_ONLY |
| REQ-067 | CampaignReportsRequest | CampaignReportsResponse | PROTOCOL_ONLY |
| REQ-068 | CancelDeclareWarRequest | 未定义 | PROTOCOL_ONLY |
| REQ-069 | CancelFactoryAutoProduceRequest | 未定义 | PROTOCOL_ONLY |
| REQ-070 | CancelFactoryProduceRequest | 未定义 | PROTOCOL_ONLY |
| REQ-071 | CancelMyGuildAidRequest | 未定义 | PROTOCOL_ONLY |
| REQ-072 | CargoShipsRequest | CargoShipsResponse | DAT-019 DATA_ONLY；src/dailies.mjs:278，src/dailies.mjs:281，src/game.mjs:26，src/game.mjs:234 |
| REQ-073 | CatcherEndRequest | CatcherEndResponse | PROTOCOL_ONLY |
| REQ-074 | CatcherInfoRequest | CatcherInfoResponse | PROTOCOL_ONLY |
| REQ-075 | CatcherStartRequest | CatcherStartResponse | PROTOCOL_ONLY |
| REQ-076 | CatcherSweepRequest | CatcherSweepResponse | PROTOCOL_ONLY |
| REQ-077 | CelebrationBoostRequest | CelebrationBoostResponse | PROTOCOL_ONLY |
| REQ-078 | CelebrationDetailRequest | CelebrationDetailResponse | PROTOCOL_ONLY |
| REQ-079 | ChallengePirateRequest | 未定义 | PROTOCOL_ONLY |
| REQ-080 | ChallengeResFieldRequest | 未定义 | src/actions.mjs:229，src/world.mjs:553 |
| REQ-081 | ChallengeStageRequest | ChallengeStageResponse | src/dailies.mjs:178，src/stages.mjs:18，src/stages.mjs:27，src/stages.mjs:78，src/stages.mjs:217，src/stages.mjs:300 |
| REQ-082 | ChallengeWorldBossRequest | 未定义 | PROTOCOL_ONLY |
| REQ-083 | ChangeGuildMemberTitleRequest | 未定义 | PROTOCOL_ONLY |
| REQ-084 | ChangeServePetRequest | 未定义 | PROTOCOL_ONLY |
| REQ-085 | ChannelAutoLoginRequest | ChannelAutoLoginResponse | PROTOCOL_ONLY |
| REQ-086 | ChannelRewardInfoRequest | ChannelRewardInfoResponse | DAT-041 DATA_ONLY；src/game.mjs:48 |
| REQ-087 | ChatRecordRequest | ChatRecordResponse | DAT-021 DATA_ONLY；src/game.mjs:28 |
| REQ-088 | ChipBatchUpgradeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-089 | ChipChestGotScoreRequest | ChipChestGotScoreResponse | PROTOCOL_ONLY |
| REQ-090 | ChipChestOpenRequest | ChipChestOpenResponse | PROTOCOL_ONLY |
| REQ-091 | ChipDecomposeRequest | ChipDecomposeResponse | PROTOCOL_ONLY |
| REQ-092 | ChipMineListRequest | ChipMineListResponse | PROTOCOL_ONLY |
| REQ-093 | ChipMineRequest | ChipMineResponse | PROTOCOL_ONLY |
| REQ-094 | ChipMineRetreatRequest | 未定义 | PROTOCOL_ONLY |
| REQ-095 | ChipMineRewardRequest | ChipMineRewardResponse | PROTOCOL_ONLY |
| REQ-096 | ChipMineSendFleetRequest | 未定义 | PROTOCOL_ONLY |
| REQ-097 | ChipUpgradeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-098 | ChurnGotFreeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-099 | ChurnGotPaidGiftRequest | ChurnGotPaidGiftResponse | PROTOCOL_ONLY |
| REQ-100 | ChurnGotTaskRequest | 未定义 | PROTOCOL_ONLY |
| REQ-101 | ChurnInfoRequest | ChurnInfoResponse | DAT-046 DATA_ONLY；src/game.mjs:53 |
| REQ-102 | CityDefenceRequest | CityDefenceResponse | PROTOCOL_ONLY |
| REQ-103 | CityFortInfoRequest | CityFortInfoResponse | PROTOCOL_ONLY |
| REQ-104 | CityRecruitDefenceRequest | 未定义 | PROTOCOL_ONLY |
| REQ-105 | ClaimActivityDailyActiveRewardRequest | ClaimActivityDailyActiveRewardResponse | PROTOCOL_ONLY |
| REQ-106 | ClaimActivityDailyCheckInRewardRequest | ClaimActivityDailyCheckInRewardResponse | PROTOCOL_ONLY |
| REQ-107 | ClaimActivityTaskRewardRequest | ClaimActivityTaskRewardResponse | PROTOCOL_ONLY |
| REQ-108 | ClaimBingoTaskFinishRequest | 未定义 | PROTOCOL_ONLY |
| REQ-109 | ClaimBingoTaskLineRequest | 未定义 | PROTOCOL_ONLY |
| REQ-110 | ClaimBingoTaskPaidRequest | 未定义 | PROTOCOL_ONLY |
| REQ-111 | ClaimBlindBoxScoreRewardRequest | 未定义 | PROTOCOL_ONLY |
| REQ-112 | ClaimCakeLotteryRewardRequest | 未定义 | PROTOCOL_ONLY |
| REQ-113 | ClaimCelebrationRewardRequest | 未定义 | PROTOCOL_ONLY |
| REQ-114 | ClaimCleanSeaProgressRewardRequest | ClaimCleanSeaProgressRewardResponse | PROTOCOL_ONLY |
| REQ-115 | ClaimCompassWheelRewardRequest | ClaimCompassWheelRewardResponse | PROTOCOL_ONLY |
| REQ-116 | ClaimDailyCombGiftRequest | 未定义 | PROTOCOL_ONLY |
| REQ-117 | ClaimDailyPackRequest | 未定义 | PROTOCOL_ONLY |
| REQ-118 | ClaimDanceProgressRewardRequest | ClaimDanceProgressRewardResponse | PROTOCOL_ONLY |
| REQ-119 | ClaimFestivalCumulativeRewardRequest | 未定义 | PROTOCOL_ONLY |
| REQ-120 | ClaimFoodRewardRequest | 未定义 | PROTOCOL_ONLY |
| REQ-121 | ClaimFreeSelectGiftRequest | 未定义 | PROTOCOL_ONLY |
| REQ-122 | ClaimLucyWheelRewardRequest | ClaimLucyWheelRewardResponse | PROTOCOL_ONLY |
| REQ-123 | ClaimPeelZongziScoreRewardRequest | ClaimPeelZongziScoreRewardResponse | PROTOCOL_ONLY |
| REQ-124 | ClaimRelicRepairedRequest | 未定义 | PROTOCOL_ONLY |
| REQ-125 | CleanSeaInfoRequest | CleanSeaInfoResponse | PROTOCOL_ONLY |
| REQ-126 | ClickGoldInfoRequest | ClickGoldInfoResponse | src/dailies.mjs:223，src/dailies.mjs:226 |
| REQ-127 | ClickGoldRequest | ClickGoldResponse | src/dailies.mjs:237，src/dailies.mjs:249 |
| REQ-128 | CollectBuildingProductRequest | CollectBuildingProductResponse | src/actions.mjs:58，src/world.mjs:225 |
| REQ-129 | CollectLightDetailRequest | CollectLightDetailResponse | PROTOCOL_ONLY |
| REQ-130 | CollectLightRequest | 未定义 | PROTOCOL_ONLY |
| REQ-131 | ComicDramaGotDailyRequest | 未定义 | PROTOCOL_ONLY |
| REQ-132 | ComicDramaGotRewardRequest | 未定义 | PROTOCOL_ONLY |
| REQ-133 | ComicDramaReadRequest | 未定义 | PROTOCOL_ONLY |
| REQ-134 | CommonBuyGoodsRequest | CommonBuyGoodsResponse | PROTOCOL_ONLY |
| REQ-135 | CompassWheelInfoRequest | CompassWheelInfoResponse | PROTOCOL_ONLY |
| REQ-136 | CounterInfoRequest | CounterInfoResponse | DAT-038 DATA_ONLY；src/game.mjs:45，src/game.mjs:234 |
| REQ-137 | CouponBuyRequest | 未定义 | PROTOCOL_ONLY |
| REQ-138 | CrossRankInfoRequest | CrossRankInfoResponse | PROTOCOL_ONLY |
| REQ-139 | DailyGiftPackRequest | DailyGiftPackResponse | DAT-011 DATA_ONLY；src/dailies.mjs:422，src/dailies.mjs:519，src/dailies.mjs:525，src/game.mjs:18 |
| REQ-140 | DailyTaskInfoRequest | DailyTaskInfoResponse | DAT-010 DATA_ONLY；src/app.mjs:21，src/dailies.mjs:360，src/dailies.mjs:488，src/dailies.mjs:503，src/game.mjs:17，src/game.mjs:234，src/server.mjs:502 |
| REQ-141 | DanceEndRequest | DanceEndResponse | PROTOCOL_ONLY |
| REQ-142 | DanceStartRequest | DanceStartResponse | PROTOCOL_ONLY |
| REQ-143 | DeclareWarRequest | 未定义 | PROTOCOL_ONLY |
| REQ-144 | DecomposeEquipRequest | DecomposeEquipResponse | PROTOCOL_ONLY |
| REQ-145 | DecryptChannelCodeRequest | DecryptChannelCodeResponse | PROTOCOL_ONLY |
| REQ-146 | DeleteAllCampaignReportRequest | 未定义 | PROTOCOL_ONLY |
| REQ-147 | DeleteAllReadEmailRequest | 未定义 | PROTOCOL_ONLY |
| REQ-148 | DeleteCampaignReportRequest | 未定义 | PROTOCOL_ONLY |
| REQ-149 | DeleteEmailRequest | 未定义 | PROTOCOL_ONLY |
| REQ-150 | DemolishFortRequest | 未定义 | PROTOCOL_ONLY |
| REQ-151 | DenyOrderRequest | 未定义 | src/actions.mjs:177，src/world.mjs:310 |
| REQ-152 | DiscountShopBuyRequest | DiscountShopBuyResponse | src/dailies.mjs:270 |
| REQ-153 | DiscountShopRefreshRequest | 未定义 | PROTOCOL_ONLY |
| REQ-154 | DiscountShopRequest | DiscountShopResponse | src/dailies.mjs:257，src/dailies.mjs:260 |
| REQ-155 | DissolveGuildRequest | 未定义 | PROTOCOL_ONLY |
| REQ-156 | DivingLevelUpRequest | 未定义 | PROTOCOL_ONLY |
| REQ-157 | DivingRequest | DivingResponse | PROTOCOL_ONLY |
| REQ-158 | DivingTreasureDrawRequest | DivingTreasureDrawResponse | PROTOCOL_ONLY |
| REQ-159 | DonateFortRequest | DonateFortResponse | PROTOCOL_ONLY |
| REQ-160 | DragonBoatEndRequest | DragonBoatEndResponse | PROTOCOL_ONLY |
| REQ-161 | DragonBoatStartRequest | 未定义 | PROTOCOL_ONLY |
| REQ-162 | DrawAccumulateChargeGiftRequest | 未定义 | PROTOCOL_ONLY |
| REQ-163 | DrawAfkLevelRewardRequest | DrawAfkLevelRewardResponse | src/actions.mjs:34 |
| REQ-164 | DrawAfkRewardRequest | DrawAfkRewardResponse | src/actions.mjs:27，src/dailies.mjs:194 |
| REQ-165 | DrawDailyRewardRequest | 未定义 | src/actions.mjs:115，src/dailies.mjs:80 |
| REQ-166 | DrawDailyTaskRewardRequest | DrawDailyTaskRewardResponse | src/actions.mjs:90，src/dailies.mjs:492，src/server.mjs:927 |
| REQ-167 | DrawFishRewardRequest | DrawFishRewardResponse | PROTOCOL_ONLY |
| REQ-168 | DrawKoiTicketRequest | DrawKoiTicketResponse | PROTOCOL_ONLY |
| REQ-169 | DrawMainTaskRewardRequest | 未定义 | src/actions.mjs:146，src/tasks.mjs:93 |
| REQ-170 | DrawNewbieLoginRewardRequest | 未定义 | PROTOCOL_ONLY |
| REQ-171 | DrawNewbieRechargeRewardRequest | 未定义 | PROTOCOL_ONLY |
| REQ-172 | DrawShipRewardRequest | DrawShipRewardResponse | PROTOCOL_ONLY |
| REQ-173 | DrawWeeklyRewardRequest | 未定义 | src/actions.mjs:123，src/app.mjs:194，src/dailies.mjs:89，src/dailies.mjs:506 |
| REQ-174 | EWorldPayOrderIdRequest | EWorldPayOrderIdResponse | PROTOCOL_ONLY |
| REQ-175 | EdictAskRequest | EdictAskResponse | PROTOCOL_ONLY |
| REQ-176 | EdictGuessRequest | EdictGuessResponse | PROTOCOL_ONLY |
| REQ-177 | EdictInfoRequest | EdictInfoResponse | PROTOCOL_ONLY |
| REQ-178 | EdictStartRequest | EdictStartResponse | PROTOCOL_ONLY |
| REQ-179 | EmailBoxRequest | EmailBoxResponse | DAT-005 DATA_ONLY；src/game.mjs:12，src/game.mjs:234 |
| REQ-180 | EndSalvageRequest | EndSalvageResponse | PROTOCOL_ONLY |
| REQ-181 | EnhanceBadgeRequest | EnhanceBadgeResponse | PROTOCOL_ONLY |
| REQ-182 | EnhanceEquipRequest | 未定义 | PROTOCOL_ONLY |
| REQ-183 | EnvSkinListRequest | EnvSkinListResponse | DAT-040 DATA_ONLY；src/game.mjs:47 |
| REQ-184 | EquinoxChangeKiteRequest | 未定义 | PROTOCOL_ONLY |
| REQ-185 | EquinoxFlyRequest | EquinoxFlyResponse | PROTOCOL_ONLY |
| REQ-186 | EquinoxGotFreeCombRequest | EquinoxGotFreeCombResponse | PROTOCOL_ONLY |
| REQ-187 | EquinoxGotHeightRequest | EquinoxGotHeightResponse | PROTOCOL_ONLY |
| REQ-188 | EquinoxGotScoreRewardRequest | EquinoxGotScoreRewardResponse | PROTOCOL_ONLY |
| REQ-189 | EquinoxGotSevenPackRequest | EquinoxGotSevenPackResponse | PROTOCOL_ONLY |
| REQ-190 | EquinoxGotTaskBingoRequest | 未定义 | PROTOCOL_ONLY |
| REQ-191 | EquinoxGotTaskFinishRequest | 未定义 | PROTOCOL_ONLY |
| REQ-192 | EquinoxGotTaskPaidRequest | 未定义 | PROTOCOL_ONLY |
| REQ-193 | EquinoxInfoRequest | EquinoxInfoResponse | PROTOCOL_ONLY |
| REQ-194 | EquinoxRankRequest | 未定义 | PROTOCOL_ONLY |
| REQ-195 | EquinoxShopBuyRequest | 未定义 | PROTOCOL_ONLY |
| REQ-196 | EquinoxShopRequest | EquinoxShopResponse | PROTOCOL_ONLY |
| REQ-197 | EquipFragExchangeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-198 | EquipPreviewStarUpRequest | EquipPreviewStarUpResponse | PROTOCOL_ONLY |
| REQ-199 | EquipRefineRequest | 未定义 | PROTOCOL_ONLY |
| REQ-200 | EquipReplaceRequest | EquipReplaceResponse | PROTOCOL_ONLY |
| REQ-201 | EquipRerollAttrRequest | 未定义 | PROTOCOL_ONLY |
| REQ-202 | EquipResetRequest | EquipResetResponse | PROTOCOL_ONLY |
| REQ-203 | EquipStarUpRequest | 未定义 | PROTOCOL_ONLY |
| REQ-204 | EquipsRequest | EquipsResponse | DAT-006 DATA_ONLY；src/game.mjs:13，src/game.mjs:234 |
| REQ-205 | EvilExpelClaimRequest | EvilExpelClaimResponse | PROTOCOL_ONLY |
| REQ-206 | EvilExpelInfoRequest | EvilExpelInfoResponse | PROTOCOL_ONLY |
| REQ-207 | EvilExpelKillRequest | EvilExpelKillResponse | PROTOCOL_ONLY |
| REQ-208 | ExchangePaidAppraisalTicketRequest | ExchangePaidAppraisalTicketResponse | PROTOCOL_ONLY |
| REQ-209 | ExchangeShopBuyRequest | 未定义 | PROTOCOL_ONLY |
| REQ-210 | ExchangeShopCheckoutRequest | 未定义 | PROTOCOL_ONLY |
| REQ-211 | ExchangeShopDetailRequest | ExchangeShopDetailResponse | PROTOCOL_ONLY |
| REQ-212 | ExitWorldMapRequest | 未定义 | src/game.mjs:61 |
| REQ-213 | ExpeditionChallengeRequest | ExpeditionChallengeResponse | PROTOCOL_ONLY |
| REQ-214 | ExpeditionChooseBuffRequest | ExpeditionChooseBuffResponse | PROTOCOL_ONLY |
| REQ-215 | ExpeditionChooseRaidRequest | 未定义 | PROTOCOL_ONLY |
| REQ-216 | ExpeditionGotFinalRewardRequest | 未定义 | PROTOCOL_ONLY |
| REQ-217 | ExpeditionInfoRequest | ExpeditionInfoResponse | PROTOCOL_ONLY |
| REQ-218 | ExpeditionSaveFormationRequest | ExpeditionSaveFormationResponse | PROTOCOL_ONLY |
| REQ-219 | ExpeditionSweepRequest | ExpeditionSweepResponse | PROTOCOL_ONLY |
| REQ-220 | FarmHarvestRequest | FarmHarvestResponse | PROTOCOL_ONLY |
| REQ-221 | FarmPlantRequest | 未定义 | PROTOCOL_ONLY |
| REQ-222 | FarmSpeedUpRequest | 未定义 | PROTOCOL_ONLY |
| REQ-223 | FillCargoShipRequest | FillCargoShipResponse | PROTOCOL_ONLY |
| REQ-224 | FinishActiveQuestionRequest | 未定义 | PROTOCOL_ONLY |
| REQ-225 | FinishFortRequest | 未定义 | PROTOCOL_ONLY |
| REQ-226 | FinishGuildOrderRequest | FinishGuildOrderResponse | PROTOCOL_ONLY |
| REQ-227 | FinishUpgradeBuildingRequest | 未定义 | src/actions.mjs:66，src/world.mjs:239 |
| REQ-228 | FinishWeekOrderRequest | FinishWeekOrderResponse | PROTOCOL_ONLY |
| REQ-229 | FinishWorkerOrderRequest | FinishWorkerOrderResponse | src/actions.mjs:169，src/world.mjs:297 |
| REQ-230 | FirstChargeRequest | FirstChargeResponse | PROTOCOL_ONLY |
| REQ-231 | FishEncyclopediaRequest | FishEncyclopediaResponse | DAT-018 DATA_ONLY；src/game.mjs:25，src/game.mjs:234 |
| REQ-232 | FishingLevelUpRequest | 未定义 | PROTOCOL_ONLY |
| REQ-233 | FixedGuildRequest | 未定义 | PROTOCOL_ONLY |
| REQ-234 | FleetRepairParamRequest | FleetRepairParamResponse | PROTOCOL_ONLY |
| REQ-235 | FleetSaveFormationRequest | 未定义 | PROTOCOL_ONLY |
| REQ-236 | FortListRequest | FortListResponse | PROTOCOL_ONLY |
| REQ-237 | FreePetRequest | 未定义 | PROTOCOL_ONLY |
| REQ-238 | GainBigFishRequest | 未定义 | PROTOCOL_ONLY |
| REQ-239 | GainFactoryProduceRequest | GainFactoryProduceResponse | src/actions.mjs:50，src/world.mjs:214 |
| REQ-240 | GameEffectRequest | GameEffectResponse | DAT-022 DATA_ONLY；src/game.mjs:29 |
| REQ-241 | GameWorldGroupListRequest | GameWorldGroupListResponse | src/worlds.mjs:61 |
| REQ-242 | GameWorldListRequest | GameWorldListResponse | src/worlds.mjs:52 |
| REQ-243 | GetDailyRewardRequest | 未定义 | PROTOCOL_ONLY |
| REQ-244 | GetFormationRequest | GetFormationResponse | DAT-004 DATA_ONLY；src/game.mjs:11，src/game.mjs:236 |
| REQ-245 | GetIntCookieRequest | GetIntCookieResponse | PROTOCOL_ONLY |
| REQ-246 | GetMaturePetRequest | 未定义 | PROTOCOL_ONLY |
| REQ-247 | GetNextOrderOTDRewardRequest | 未定义 | src/actions.mjs:162，src/tasks.mjs:169 |
| REQ-248 | GiveUpResFieldRequest | 未定义 | src/actions.mjs:240，src/world.mjs:567 |
| REQ-249 | GoldFishLotteryRequest | GoldFishLotteryResponse | PROTOCOL_ONLY |
| REQ-250 | GoldFishLuckyRecordRequest | GoldFishLuckyRecordResponse | PROTOCOL_ONLY |
| REQ-251 | GoldFishLuckyRequest | 未定义 | PROTOCOL_ONLY |
| REQ-252 | GoldFishRequest | GoldFishResponse | PROTOCOL_ONLY |
| REQ-253 | GotAchievementRewardRequest | 未定义 | src/actions.mjs:98，src/tasks.mjs:145 |
| REQ-254 | GotAdvRewardRequest | 未定义 | PROTOCOL_ONLY |
| REQ-255 | GotAntiqueRecruitTaskRequest | 未定义 | PROTOCOL_ONLY |
| REQ-256 | GotBeautyVoteRequest | GotBeautyVoteResponse | PROTOCOL_ONLY |
| REQ-257 | GotBranchTaskRewardRequest | 未定义 | src/actions.mjs:154，src/tasks.mjs:120 |
| REQ-258 | GotChainPackRequest | 未定义 | PROTOCOL_ONLY |
| REQ-259 | GotChannelRewardRequest | 未定义 | PROTOCOL_ONLY |
| REQ-260 | GotFirstChargeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-261 | GotFreeDailyPackRequest | 未定义 | src/actions.mjs:131，src/dailies.mjs:127 |
| REQ-262 | GotGiftCodeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-263 | GotGuildTitleRewardRequest | 未定义 | PROTOCOL_ONLY |
| REQ-264 | GotGuildWelfarePackRequest | GotGuildWelfarePackResponse | PROTOCOL_ONLY |
| REQ-265 | GotHeroRecruitTaskRequest | 未定义 | PROTOCOL_ONLY |
| REQ-266 | GotHeroShowSkillRequest | 未定义 | PROTOCOL_ONLY |
| REQ-267 | GotLeagueBonusItemRequest | 未定义 | PROTOCOL_ONLY |
| REQ-268 | GotMyGuildAidRequest | 未定义 | PROTOCOL_ONLY |
| REQ-269 | GotOpenRankRewardRequest | 未定义 | PROTOCOL_ONLY |
| REQ-270 | GotPirateEventRequest | 未定义 | PROTOCOL_ONLY |
| REQ-271 | GotSeasonTaskRequest | GotSeasonTaskResponse | PROTOCOL_ONLY |
| REQ-272 | GotSpringCumulativeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-273 | GotSpringLiveRequest | GotSpringLiveResponse | PROTOCOL_ONLY |
| REQ-274 | GotStormTaskRewardRequest | 未定义 | PROTOCOL_ONLY |
| REQ-275 | GotTopBonusRequest | 未定义 | PROTOCOL_ONLY |
| REQ-276 | GotTradeAchievementRequest | GotTradeAchievementResponse | PROTOCOL_ONLY |
| REQ-277 | GotTradeReportRequest | 未定义 | PROTOCOL_ONLY |
| REQ-278 | GotUltraScoreRewardRequest | GotUltraScoreRewardResponse | PROTOCOL_ONLY |
| REQ-279 | GotUniqueLotteryFloorRequest | GotUniqueLotteryFloorResponse | PROTOCOL_ONLY |
| REQ-280 | GotUniqueLotteryFreeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-281 | GotVipDailyRewardRequest | 未定义 | PROTOCOL_ONLY |
| REQ-282 | GotWorldOnlineRwdRequest | 未定义 | PROTOCOL_ONLY |
| REQ-283 | GroupBuyingInfoRequest | GroupBuyingInfoResponse | PROTOCOL_ONLY |
| REQ-284 | GuideInfoRequest | GuideInfoResponse | DAT-013 DATA_ONLY；src/game.mjs:20，src/game.mjs:234 |
| REQ-285 | GuildAidAskRequest | 未定义 | PROTOCOL_ONLY |
| REQ-286 | GuildAidHelpRequest | 未定义 | PROTOCOL_ONLY |
| REQ-287 | GuildAidListRequest | GuildAidListResponse | src/dailies.mjs:337 |
| REQ-288 | GuildCityInfoRequest | GuildCityInfoResponse | src/dailies.mjs:336 |
| REQ-289 | GuildFeatGrantRequest | 未定义 | PROTOCOL_ONLY |
| REQ-290 | GuildFeatGrantResultRequest | GuildFeatGrantResultResponse | PROTOCOL_ONLY |
| REQ-291 | GuildFeatGrantStatRequest | GuildFeatGrantStatResponse | PROTOCOL_ONLY |
| REQ-292 | GuildImpeachFightRequest | GuildImpeachFightResponse | PROTOCOL_ONLY |
| REQ-293 | GuildInfoRequest | GuildInfoResponse | src/app.mjs:23 |
| REQ-294 | GuildLeaderBoardRequest | GuildLeaderBoardResponse | PROTOCOL_ONLY |
| REQ-295 | GuildMemberRequest | GuildMemberResponse | PROTOCOL_ONLY |
| REQ-296 | GuildOrderRequest | GuildOrderResponse | DAT-028 DATA_ONLY；src/game.mjs:35 |
| REQ-297 | GuildR2PageRequest | GuildR2PageResponse | PROTOCOL_ONLY |
| REQ-298 | GuildShipOrderRequest | 未定义 | PROTOCOL_ONLY |
| REQ-299 | GuildShipRequest | GuildShipResponse | PROTOCOL_ONLY |
| REQ-300 | GuildShipSeekRequest | 未定义 | PROTOCOL_ONLY |
| REQ-301 | GuildTechInfoRequest | GuildTechInfoResponse | DAT-027 DATA_ONLY；src/game.mjs:34 |
| REQ-302 | HeroExclusiveLevelUpRequest | 未定义 | PROTOCOL_ONLY |
| REQ-303 | HeroExclusiveStarUpRequest | 未定义 | PROTOCOL_ONLY |
| REQ-304 | HeroFragExchangeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-305 | HeroLevelUpRequest | 未定义 | src/heroes.mjs:256 |
| REQ-306 | HeroPreviewRequest | HeroPreviewResponse | PROTOCOL_ONLY |
| REQ-307 | HeroRaidChallengeRequest | HeroRaidChallengeResponse | PROTOCOL_ONLY |
| REQ-308 | HeroRaidFinishOrderRequest | 未定义 | PROTOCOL_ONLY |
| REQ-309 | HeroRaidGotOrderRewardRequest | 未定义 | PROTOCOL_ONLY |
| REQ-310 | HeroRaidGotRewardRequest | HeroRaidGotRewardResponse | PROTOCOL_ONLY |
| REQ-311 | HeroRaidPrizeRequest | HeroRaidPrizeResponse | PROTOCOL_ONLY |
| REQ-312 | HeroRecruitRequest | 未定义 | PROTOCOL_ONLY |
| REQ-313 | HeroSkillLevelUpRequest | 未定义 | src/heroes.mjs:259 |
| REQ-314 | HeroSkillUpgradeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-315 | HeroStarUpRequest | HeroStarUpResponse | src/heroes.mjs:258，src/heroes.mjs:261 |
| REQ-316 | HeroSupplyExchangeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-317 | KickOutGuildRequest | 未定义 | PROTOCOL_ONLY |
| REQ-318 | LeagueBattlePassInfoRequest | LeagueBattlePassInfoResponse | PROTOCOL_ONLY |
| REQ-319 | LeagueBuyPointRequest | LeagueBuyPointResponse | PROTOCOL_ONLY |
| REQ-320 | LeagueFightRequest | LeagueFightResponse | PROTOCOL_ONLY |
| REQ-321 | LeagueFormationSequenceRequest | 未定义 | PROTOCOL_ONLY |
| REQ-322 | LeagueGotBonusDanRequest | LeagueGotBonusDanResponse | PROTOCOL_ONLY |
| REQ-323 | LeagueGotPassRewardRequest | LeagueGotPassRewardResponse | PROTOCOL_ONLY |
| REQ-324 | LeagueInfoRequest | LeagueInfoResponse | src/dailies.mjs:341 |
| REQ-325 | LeagueOtherFormationRequest | LeagueOtherFormationResponse | PROTOCOL_ONLY |
| REQ-326 | LeagueRankRequest | LeagueRankResponse | PROTOCOL_ONLY |
| REQ-327 | LeagueRefreshRivalRequest | LeagueRefreshRivalResponse | PROTOCOL_ONLY |
| REQ-328 | LeagueReportListRequest | LeagueReportListResponse | PROTOCOL_ONLY |
| REQ-329 | LeagueSaveFormationRequest | 未定义 | PROTOCOL_ONLY |
| REQ-330 | LeaveFormationRebornPreviewRequest | LeaveFormationRebornPreviewResponse | PROTOCOL_ONLY |
| REQ-331 | LeaveFormationRebornRequest | LeaveFormationRebornResponse | PROTOCOL_ONLY |
| REQ-332 | LeaveGuildRequest | LeaveGuildResponse | PROTOCOL_ONLY |
| REQ-333 | LimitTicketRequest | LimitTicketResponse | DAT-042 DATA_ONLY；src/game.mjs:49 |
| REQ-334 | LimitedBossGetRewardRequest | 未定义 | PROTOCOL_ONLY |
| REQ-335 | LimitedBossInfoRequest | LimitedBossInfoResponse | PROTOCOL_ONLY |
| REQ-336 | LimitedBossOpenRequest | LimitedBossOpenResponse | DAT-032 DATA_ONLY；src/game.mjs:39 |
| REQ-337 | LimitedBossRankRequest | LimitedBossRankResponse | PROTOCOL_ONLY |
| REQ-338 | LimitedBossSendFleetsRequest | 未定义 | PROTOCOL_ONLY |
| REQ-339 | LimitedShopGotFreeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-340 | LimitedShopRequest | LimitedShopResponse | PROTOCOL_ONLY |
| REQ-341 | LoginFinishRequest | 未定义 | PROTOCOL_ONLY |
| REQ-342 | LoginRequest | LoginResponse | src/client.mjs:89，src/client.mjs:97 |
| REQ-343 | LuckyWheelInfoRequest | LuckyWheelInfoResponse | PROTOCOL_ONLY |
| REQ-344 | MagicOceanClaimTaskRewardRequest | 未定义 | PROTOCOL_ONLY |
| REQ-345 | MagicOceanReportCleanRequest | 未定义 | PROTOCOL_ONLY |
| REQ-346 | MainTaskInfoRequest | MainTaskInfoResponse | DAT-012 DATA_ONLY；src/game.mjs:19，src/game.mjs:234，src/server.mjs:306，src/server.mjs:440，src/tasks.mjs:62 |
| REQ-347 | MakeEquipRequest | 未定义 | PROTOCOL_ONLY |
| REQ-348 | MakeFoodRequest | MakeFoodResponse | PROTOCOL_ONLY |
| REQ-349 | MatchMakingApplicantsRequest | MatchMakingApplicantsResponse | PROTOCOL_ONLY |
| REQ-350 | MatchMakingApplyRequest | MatchMakingApplyResponse | PROTOCOL_ONLY |
| REQ-351 | MatchMakingApproveRequest | 未定义 | PROTOCOL_ONLY |
| REQ-352 | MatchMakingCreateTeamRequest | 未定义 | PROTOCOL_ONLY |
| REQ-353 | MatchMakingDissolveRequest | 未定义 | PROTOCOL_ONLY |
| REQ-354 | MatchMakingKickRequest | 未定义 | PROTOCOL_ONLY |
| REQ-355 | MatchMakingMyTeamRequest | MatchMakingMyTeamResponse | PROTOCOL_ONLY |
| REQ-356 | MatchMakingQuitRequest | 未定义 | PROTOCOL_ONLY |
| REQ-357 | MatchMakingSetTeamRequest | 未定义 | PROTOCOL_ONLY |
| REQ-358 | MatchMakingSetViceRequest | 未定义 | PROTOCOL_ONLY |
| REQ-359 | MatchMakingTeamsRequest | MatchMakingTeamsResponse | PROTOCOL_ONLY |
| REQ-360 | ModifyGuildAnnouncementRequest | 未定义 | PROTOCOL_ONLY |
| REQ-361 | ModifyGuildFlagRequest | 未定义 | PROTOCOL_ONLY |
| REQ-362 | ModifyGuildNameRequest | 未定义 | PROTOCOL_ONLY |
| REQ-363 | MonthCardDailyRewardRequest | 未定义 | src/actions.mjs:139 |
| REQ-364 | MonthCardRequest | MonthCardResponse | DAT-015 DATA_ONLY；src/game.mjs:22，src/game.mjs:234 |
| REQ-365 | MoveFleetsToCityRequest | 未定义 | PROTOCOL_ONLY |
| REQ-366 | MuseumClaimAchievementRequest | 未定义 | PROTOCOL_ONLY |
| REQ-367 | MuseumCollectRevenueRequest | MuseumCollectRevenueResponse | PROTOCOL_ONLY |
| REQ-368 | MuseumCompleteExploreRequest | MuseumCompleteExploreResponse | PROTOCOL_ONLY |
| REQ-369 | MuseumExhibitRequest | 未定义 | PROTOCOL_ONLY |
| REQ-370 | MuseumFinishCaseUpgradeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-371 | MuseumInfoRequest | MuseumInfoResponse | src/dailies.mjs:340 |
| REQ-372 | MuseumRewardRequest | MuseumRewardResponse | PROTOCOL_ONLY |
| REQ-373 | MuseumSpeedUpCaseRequest | 未定义 | PROTOCOL_ONLY |
| REQ-374 | MuseumSpeedUpExploreRequest | MuseumSpeedUpExploreResponse | PROTOCOL_ONLY |
| REQ-375 | MuseumStartExploreRequest | MuseumStartExploreResponse | PROTOCOL_ONLY |
| REQ-376 | MuseumUpgradeCaseRequest | 未定义 | PROTOCOL_ONLY |
| REQ-377 | MuseumUpgradeExhibitionRequest | 未定义 | PROTOCOL_ONLY |
| REQ-378 | MuseumUpgradeKeywordRequest | 未定义 | PROTOCOL_ONLY |
| REQ-379 | MyFleetsRequest | MyFleetsResponse | DAT-024 DATA_ONLY；src/game.mjs:31，src/game.mjs:234，src/server.mjs:446，src/world.mjs:94 |
| REQ-380 | MyFormationPresetRequest | MyFormationPresetResponse | DAT-029 DATA_ONLY；src/game.mjs:36 |
| REQ-381 | MyGuildAidRequest | MyGuildAidResponse | PROTOCOL_ONLY |
| REQ-382 | MyResFieldsRequest | MyResFieldsResponse | DAT-026 DATA_ONLY；src/game.mjs:33，src/game.mjs:234，src/server.mjs:446，src/world.mjs:93 |
| REQ-383 | OnWaterRequest | OnWaterResponse | DAT-017 DATA_ONLY；src/game.mjs:24，src/game.mjs:234，src/game.mjs:234，src/server.mjs:366，src/server.mjs:381，src/server.mjs:389，src/server.mjs:440，src/server.mjs:446，src/tasks.mjs:65，src/world.mjs:88 |
| REQ-384 | OnlineNoticesRequest | OnlineNoticesResponse | PROTOCOL_ONLY |
| REQ-385 | OpenAccessPopRequest | 未定义 | PROTOCOL_ONLY |
| REQ-386 | OpenRandomBoxRequest | 未定义 | PROTOCOL_ONLY |
| REQ-387 | OpenRankInfoRequest | OpenRankInfoResponse | PROTOCOL_ONLY |
| REQ-388 | OpenRankLeaderBoardRequest | OpenRankLeaderBoardResponse | PROTOCOL_ONLY |
| REQ-389 | OtherPlayerInfoRequest | OtherPlayerInfoResponse | PROTOCOL_ONLY |
| REQ-390 | PassStageGotRewardRequest | PassStageGotRewardResponse | PROTOCOL_ONLY |
| REQ-391 | PassStageRequest | PassStageResponse | PROTOCOL_ONLY |
| REQ-392 | PassStageStateRequest | PassStageStateResponse | DAT-036 DATA_ONLY；src/game.mjs:43 |
| REQ-393 | PeelZongziDetailRequest | PeelZongziDetailResponse | PROTOCOL_ONLY |
| REQ-394 | PeelZongziRevealRequest | PeelZongziRevealResponse | PROTOCOL_ONLY |
| REQ-395 | PeelZongziSettleRequest | PeelZongziSettleResponse | PROTOCOL_ONLY |
| REQ-396 | PeelZongziStartRequest | PeelZongziStartResponse | PROTOCOL_ONLY |
| REQ-397 | PetBreedRequest | 未定义 | PROTOCOL_ONLY |
| REQ-398 | PetFeedRequest | 未定义 | PROTOCOL_ONLY |
| REQ-399 | PetFragExchangeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-400 | PetInitExtAttrRequest | 未定义 | PROTOCOL_ONLY |
| REQ-401 | PetLevelUpRequest | 未定义 | PROTOCOL_ONLY |
| REQ-402 | PetPreviewStarUpRequest | PetPreviewStarUpResponse | PROTOCOL_ONLY |
| REQ-403 | PetRerollAttrRequest | 未定义 | PROTOCOL_ONLY |
| REQ-404 | PetStarUpRequest | 未定义 | PROTOCOL_ONLY |
| REQ-405 | PetSwitchExtAttrRequest | 未定义 | PROTOCOL_ONLY |
| REQ-406 | PetUpgradeFeedRequest | 未定义 | PROTOCOL_ONLY |
| REQ-407 | PetUpgradeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-408 | PickMadeEquipRequest | PickMadeEquipResponse | PROTOCOL_ONLY |
| REQ-409 | PickUpFloaterRequest | PickUpFloaterResponse | PROTOCOL_ONLY |
| REQ-410 | PingRequest | PingResponse | src/client.mjs:288 |
| REQ-411 | PirateKillRecordRequest | PirateKillRecordResponse | DAT-025 DATA_ONLY；src/game.mjs:32 |
| REQ-412 | PirateSweepRequest | 未定义 | src/dailies.mjs:325 |
| REQ-413 | PlayerFrameRequest | PlayerFrameResponse | DAT-045 DATA_ONLY；src/game.mjs:52 |
| REQ-414 | PlayerMoveFxRequest | PlayerMoveFxResponse | PROTOCOL_ONLY |
| REQ-415 | PlayerStreakFxRequest | PlayerStreakFxResponse | PROTOCOL_ONLY |
| REQ-416 | PrivateChatBlockRequest | PrivateChatBlockResponse | PROTOCOL_ONLY |
| REQ-417 | PrivateChatDeleteRequest | 未定义 | PROTOCOL_ONLY |
| REQ-418 | PrivateChatListRequest | PrivateChatListResponse | PROTOCOL_ONLY |
| REQ-419 | PrivateChatReadRequest | 未定义 | PROTOCOL_ONLY |
| REQ-420 | PrivateChatRecordRequest | PrivateChatRecordResponse | PROTOCOL_ONLY |
| REQ-421 | PrivateChatSendRequest | 未定义 | PROTOCOL_ONLY |
| REQ-422 | PutOnBadgeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-423 | PutOnChipRequest | 未定义 | PROTOCOL_ONLY |
| REQ-424 | PutOnEquipRequest | 未定义 | PROTOCOL_ONLY |
| REQ-425 | PutOnSupplyRequest | 未定义 | PROTOCOL_ONLY |
| REQ-426 | QueryKoiDetailRequest | QueryKoiDetailResponse | PROTOCOL_ONLY |
| REQ-427 | QuickGotCampaignReportRequest | 未定义 | PROTOCOL_ONLY |
| REQ-428 | QuickGotReadEmailRequest | 未定义 | src/actions.mjs:106 |
| REQ-429 | RadarGetAllRewardsRequest | 未定义 | PROTOCOL_ONLY |
| REQ-430 | RadarGetRewardRequest | 未定义 | PROTOCOL_ONLY |
| REQ-431 | RadarInfoRequest | RadarInfoResponse | DAT-039 DATA_ONLY；src/game.mjs:46 |
| REQ-432 | RadarSendFleetsRequest | 未定义 | PROTOCOL_ONLY |
| REQ-433 | RaidExtremePassRequest | RaidExtremePassResponse | PROTOCOL_ONLY |
| REQ-434 | RankRequest | RankResponse | PROTOCOL_ONLY |
| REQ-435 | ReadPlayerFrameRequest | 未定义 | PROTOCOL_ONLY |
| REQ-436 | ReadPlayerFxRequest | 未定义 | PROTOCOL_ONLY |
| REQ-437 | RecommendFormRequest | RecommendFormResponse | PROTOCOL_ONLY |
| REQ-438 | RecommendReportRequest | RecommendReportResponse | PROTOCOL_ONLY |
| REQ-439 | RecruitInfoRequest | RecruitInfoResponse | DAT-008 DATA_ONLY；src/dailies.mjs:142，src/dailies.mjs:144，src/game.mjs:15，src/game.mjs:234，src/server.mjs:502 |
| REQ-440 | RecruitStartRequest | RecruitStartResponse | src/dailies.mjs:150，src/dailies.mjs:155 |
| REQ-441 | RedPointRequest | 未定义 | src/game.mjs:61 |
| REQ-442 | RefreshShopRequest | 未定义 | PROTOCOL_ONLY |
| REQ-443 | RelicAppraisalInfoRequest | RelicAppraisalInfoResponse | PROTOCOL_ONLY |
| REQ-444 | RelicAppraisalRequest | RelicAppraisalResponse | PROTOCOL_ONLY |
| REQ-445 | RelicRepairRequest | RelicRepairResponse | PROTOCOL_ONLY |
| REQ-446 | RepairFleetRequest | 未定义 | PROTOCOL_ONLY |
| REQ-447 | ResetGuildTechRequest | ResetGuildTechResponse | PROTOCOL_ONLY |
| REQ-448 | ResourceRecoveryRequest | ResourceRecoveryResponse | PROTOCOL_ONLY |
| REQ-449 | ResourceRefreshTimeRequest | ResourceRefreshTimeResponse | PROTOCOL_ONLY |
| REQ-450 | RevokeAccountRequest | 未定义 | PROTOCOL_ONLY |
| REQ-451 | SalvageLevelUpRequest | 未定义 | PROTOCOL_ONLY |
| REQ-452 | SaveEquipRerollRequest | 未定义 | PROTOCOL_ONLY |
| REQ-453 | SaveFormationRequest | SaveFormationResponse | PROTOCOL_ONLY |
| REQ-454 | SaveIntCookieRequest | 未定义 | PROTOCOL_ONLY |
| REQ-455 | SavePetRerollRequest | 未定义 | PROTOCOL_ONLY |
| REQ-456 | SeasonCardChooseRequest | 未定义 | PROTOCOL_ONLY |
| REQ-457 | SeasonCardGotDailyRequest | 未定义 | PROTOCOL_ONLY |
| REQ-458 | SeasonCardRequest | SeasonCardResponse | DAT-043 DATA_ONLY；src/game.mjs:50 |
| REQ-459 | SeasonChestAskRequest | 未定义 | PROTOCOL_ONLY |
| REQ-460 | SeasonChestCancelRequest | 未定义 | PROTOCOL_ONLY |
| REQ-461 | SeasonChestExchangeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-462 | SeasonChestGotExchangeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-463 | SeasonChestInfoRequest | SeasonChestInfoResponse | PROTOCOL_ONLY |
| REQ-464 | SeasonChestListRequest | SeasonChestListResponse | PROTOCOL_ONLY |
| REQ-465 | SeasonChestOpenRequest | SeasonChestOpenResponse | PROTOCOL_ONLY |
| REQ-466 | SeasonFactoryComposeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-467 | SeasonRankGuildRequest | SeasonRankGuildResponse | PROTOCOL_ONLY |
| REQ-468 | SeasonRankInfoRequest | SeasonRankInfoResponse | DAT-034 DATA_ONLY；src/game.mjs:41，src/game.mjs:234 |
| REQ-469 | SeasonRankPlayerRequest | SeasonRankPlayerResponse | PROTOCOL_ONLY |
| REQ-470 | SeasonTaskRequest | SeasonTaskResponse | PROTOCOL_ONLY |
| REQ-471 | SeasonTaskStageRequest | SeasonTaskStageResponse | DAT-030 DATA_ONLY；src/game.mjs:37 |
| REQ-472 | SelectChoiceRequest | 未定义 | PROTOCOL_ONLY |
| REQ-473 | SelectCleanSeaFactionRequest | 未定义 | PROTOCOL_ONLY |
| REQ-474 | SelectGiftRewardRequest | 未定义 | PROTOCOL_ONLY |
| REQ-475 | SelectPackRequest | 未定义 | PROTOCOL_ONLY |
| REQ-476 | SellRelicAppraisalRequest | 未定义 | PROTOCOL_ONLY |
| REQ-477 | SendChatRequest | 未定义 | PROTOCOL_ONLY |
| REQ-478 | SendEmailRequest | 未定义 | PROTOCOL_ONLY |
| REQ-479 | SetAssembleCityRequest | 未定义 | PROTOCOL_ONLY |
| REQ-480 | SetAutoFarmingRequest | 未定义 | PROTOCOL_ONLY |
| REQ-481 | SetBuildingAutoWorkRequest | 未定义 | src/actions.mjs:74 |
| REQ-482 | SetFactoryAutoProduceRequest | 未定义 | src/actions.mjs:82 |
| REQ-483 | SetFleetAutoFightRequest | 未定义 | PROTOCOL_ONLY |
| REQ-484 | SetGuildRecommendRequest | 未定义 | PROTOCOL_ONLY |
| REQ-485 | SetLanguageRequest | 未定义 | PROTOCOL_ONLY |
| REQ-486 | SetUniqueLotterySelectRequest | 未定义 | PROTOCOL_ONLY |
| REQ-487 | SetZongziFactorRequest | 未定义 | PROTOCOL_ONLY |
| REQ-488 | ShopInfoRequest | ShopInfoResponse | PROTOCOL_ONLY |
| REQ-489 | SkinActiveGotDailyRequest | SkinActiveGotDailyResponse | PROTOCOL_ONLY |
| REQ-490 | SkinActiveGotFreeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-491 | SnapCancelMatchmakingRequest | 未定义 | PROTOCOL_ONLY |
| REQ-492 | SnapDetailRequest | 未定义 | PROTOCOL_ONLY |
| REQ-493 | SnapEndRoundRequest | SnapEndRoundResponse | PROTOCOL_ONLY |
| REQ-494 | SnapGiveUpRequest | 未定义 | PROTOCOL_ONLY |
| REQ-495 | SnapInfoRequest | SnapInfoResponse | PROTOCOL_ONLY |
| REQ-496 | SnapPvpRankInfoRequest | SnapPvpRankInfoResponse | PROTOCOL_ONLY |
| REQ-497 | SnapPvpToggleTrusteeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-498 | SnapSaveDraftRequest | 未定义 | PROTOCOL_ONLY |
| REQ-499 | SnapStartMatchmakingRequest | 未定义 | PROTOCOL_ONLY |
| REQ-500 | SnapStartRequest | 未定义 | PROTOCOL_ONLY |
| REQ-501 | SnowballBuyStaminaRequest | 未定义 | PROTOCOL_ONLY |
| REQ-502 | SnowballClaimGiftRequest | 未定义 | PROTOCOL_ONLY |
| REQ-503 | SnowballClaimRewardRequest | SnowballClaimRewardResponse | PROTOCOL_ONLY |
| REQ-504 | SnowballDetailRequest | SnowballDetailResponse | PROTOCOL_ONLY |
| REQ-505 | SnowballOpRequest | SnowballOpResponse | PROTOCOL_ONLY |
| REQ-506 | SnowballStartRequest | SnowballStartResponse | PROTOCOL_ONLY |
| REQ-507 | SnowballUseItemRequest | SnowballUseItemResponse | PROTOCOL_ONLY |
| REQ-508 | SpeechReportRequest | 未定义 | PROTOCOL_ONLY |
| REQ-509 | SpeedMakeEquipRequest | SpeedMakeEquipResponse | PROTOCOL_ONLY |
| REQ-510 | SpeedUpFactoryProduceRequest | 未定义 | src/actions.mjs:217，src/world.mjs:414 |
| REQ-511 | SpeedUpFleetRequest | 未定义 | PROTOCOL_ONLY |
| REQ-512 | SpeedUpOrderRequest | 未定义 | PROTOCOL_ONLY |
| REQ-513 | SpeedUpRepairRequest | 未定义 | PROTOCOL_ONLY |
| REQ-514 | SpeedUpShipRequest | 未定义 | PROTOCOL_ONLY |
| REQ-515 | SpeedUpUpgradeBuildingRequest | 未定义 | src/actions.mjs:209，src/world.mjs:399 |
| REQ-516 | SpinCakeLotteryRequest | SpinCakeLotteryResponse | PROTOCOL_ONLY |
| REQ-517 | SpinCompassWheelRequest | SpinCompassWheelResponse | PROTOCOL_ONLY |
| REQ-518 | SpinLucyWheelRequest | SpinLucyWheelResponse | PROTOCOL_ONLY |
| REQ-519 | SpringBombRequest | SpringBombResponse | PROTOCOL_ONLY |
| REQ-520 | SpringBuyRubyPackRequest | SpringBuyRubyPackResponse | PROTOCOL_ONLY |
| REQ-521 | SpringCheckRequest | SpringCheckResponse | PROTOCOL_ONLY |
| REQ-522 | SpringCollectRequest | SpringCollectResponse | PROTOCOL_ONLY |
| REQ-523 | SpringGotDamageRequest | SpringGotDamageResponse | PROTOCOL_ONLY |
| REQ-524 | SpringGotFreeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-525 | SpringInfoRequest | SpringInfoResponse | PROTOCOL_ONLY |
| REQ-526 | SpringRankRequest | SpringRankResponse | PROTOCOL_ONLY |
| REQ-527 | SpringShopBuyRequest | 未定义 | PROTOCOL_ONLY |
| REQ-528 | SpringShopRequest | SpringShopResponse | PROTOCOL_ONLY |
| REQ-529 | StartFactoryProduceRequest | 未定义 | src/actions.mjs:185，src/world.mjs:346 |
| REQ-530 | StartFishingRequest | StartFishingResponse | PROTOCOL_ONLY |
| REQ-531 | StartRelicAppraisalRequest | 未定义 | PROTOCOL_ONLY |
| REQ-532 | StopRepairingRequest | 未定义 | PROTOCOL_ONLY |
| REQ-533 | SuppliesRequest | SuppliesResponse | PROTOCOL_ONLY |
| REQ-534 | SupplyBatchComposeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-535 | SupplyComposeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-536 | SupplyCustomOpenRequest | 未定义 | PROTOCOL_ONLY |
| REQ-537 | SupplyProduceRequest | 未定义 | PROTOCOL_ONLY |
| REQ-538 | SupplySeniorProduceRequest | 未定义 | PROTOCOL_ONLY |
| REQ-539 | SwitchDailyPackRequest | 未定义 | PROTOCOL_ONLY |
| REQ-540 | SwitchFormationHeroRequest | 未定义 | PROTOCOL_ONLY |
| REQ-541 | SwitchHeroSkinRequest | 未定义 | PROTOCOL_ONLY |
| REQ-542 | TakeOffAllSupplyRequest | 未定义 | PROTOCOL_ONLY |
| REQ-543 | TakeOffBadgeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-544 | TakeOffChipRequest | 未定义 | PROTOCOL_ONLY |
| REQ-545 | TakeOffEquipRequest | 未定义 | PROTOCOL_ONLY |
| REQ-546 | TakeOffSupplyRequest | 未定义 | PROTOCOL_ONLY |
| REQ-547 | TestCmdRequest | 未定义 | PROTOCOL_ONLY |
| REQ-548 | TournamentBetCardPoolInfoRequest | TournamentBetCardPoolInfoResponse | PROTOCOL_ONLY |
| REQ-549 | TournamentClaimBetCardPoolRequest | TournamentClaimBetCardPoolResponse | PROTOCOL_ONLY |
| REQ-550 | TournamentClaimComboRequest | 未定义 | PROTOCOL_ONLY |
| REQ-551 | TournamentClaimDailyGiftRequest | 未定义 | PROTOCOL_ONLY |
| REQ-552 | TournamentClaimPredictRequest | 未定义 | PROTOCOL_ONLY |
| REQ-553 | TournamentFighterDetailRequest | TournamentFighterDetailResponse | PROTOCOL_ONLY |
| REQ-554 | TournamentFinalScheduleRequest | TournamentFinalScheduleResponse | PROTOCOL_ONLY |
| REQ-555 | TournamentFormationRequest | TournamentFormationResponse | PROTOCOL_ONLY |
| REQ-556 | TournamentGroupFightersRequest | TournamentGroupFightersResponse | PROTOCOL_ONLY |
| REQ-557 | TournamentGroupGuessRequest | TournamentGroupGuessResponse | PROTOCOL_ONLY |
| REQ-558 | TournamentGroupPredictRequest | 未定义 | PROTOCOL_ONLY |
| REQ-559 | TournamentGroupScheduleRequest | 未定义 | PROTOCOL_ONLY |
| REQ-560 | TournamentKnockoutBetListRequest | TournamentKnockoutBetListResponse | PROTOCOL_ONLY |
| REQ-561 | TournamentKnockoutBetRequest | TournamentKnockoutBetResponse | PROTOCOL_ONLY |
| REQ-562 | TournamentKnockoutScheduleRequest | 未定义 | PROTOCOL_ONLY |
| REQ-563 | TournamentMatchDetailRequest | TournamentMatchDetailResponse | PROTOCOL_ONLY |
| REQ-564 | TournamentRankingRequest | TournamentRankingResponse | PROTOCOL_ONLY |
| REQ-565 | TournamentSaveFormationRequest | TournamentSaveFormationResponse | PROTOCOL_ONLY |
| REQ-566 | TournamentShopBuyRequest | 未定义 | PROTOCOL_ONLY |
| REQ-567 | TournamentShopInfoRequest | TournamentShopInfoResponse | PROTOCOL_ONLY |
| REQ-568 | TradeBuyRequest | TradeBuyResponse | PROTOCOL_ONLY |
| REQ-569 | TradeBuySpeedItemRequest | TradeBuySpeedItemResponse | PROTOCOL_ONLY |
| REQ-570 | TradeCargoUpgradeRequest | TradeCargoUpgradeResponse | PROTOCOL_ONLY |
| REQ-571 | TradeCityReportRequest | 未定义 | PROTOCOL_ONLY |
| REQ-572 | TradeCityRequest | TradeCityResponse | PROTOCOL_ONLY |
| REQ-573 | TradeGotTaskRequest | TradeGotTaskResponse | PROTOCOL_ONLY |
| REQ-574 | TradeGuildRadarRequest | TradeGuildRadarResponse | src/dailies.mjs:335 |
| REQ-575 | TradeGuildRankRequest | TradeGuildRankResponse | PROTOCOL_ONLY |
| REQ-576 | TradeInfoRequest | TradeInfoResponse | src/dailies.mjs:278，src/dailies.mjs:282 |
| REQ-577 | TradeMoveRequest | TradeMoveResponse | PROTOCOL_ONLY |
| REQ-578 | TradeRankRequest | TradeRankResponse | PROTOCOL_ONLY |
| REQ-579 | TradeSellRequest | TradeSellResponse | PROTOCOL_ONLY |
| REQ-580 | TradeSpeedRequest | TradeSpeedResponse | PROTOCOL_ONLY |
| REQ-581 | TradeTaskRequest | TradeTaskResponse | PROTOCOL_ONLY |
| REQ-582 | TranslateRequest | TranslateResponse | PROTOCOL_ONLY |
| REQ-583 | TreasureLootDefenceRequest | TreasureLootDefenceResponse | PROTOCOL_ONLY |
| REQ-584 | TreasureLootListRequest | TreasureLootListResponse | PROTOCOL_ONLY |
| REQ-585 | TreasureLootRankRequest | TreasureLootRankResponse | PROTOCOL_ONLY |
| REQ-586 | TreasureLootSendFleetsRequest | 未定义 | PROTOCOL_ONLY |
| REQ-587 | TreasureLootStatsRequest | TreasureLootStatsResponse | PROTOCOL_ONLY |
| REQ-588 | TrialRaidBuySweepRequest | 未定义 | PROTOCOL_ONLY |
| REQ-589 | TrialRaidChallengeRequest | TrialRaidChallengeResponse | src/dailies.mjs:310 |
| REQ-590 | TrialRaidInfoRequest | TrialRaidInfoResponse | src/dailies.mjs:293，src/dailies.mjs:296 |
| REQ-591 | TriggerGuideRequest | 未定义 | PROTOCOL_ONLY |
| REQ-592 | UltraEnemyRequest | UltraEnemyResponse | PROTOCOL_ONLY |
| REQ-593 | UltraExtremeRequest | UltraExtremeResponse | PROTOCOL_ONLY |
| REQ-594 | UltraFightRequest | UltraFightResponse | PROTOCOL_ONLY |
| REQ-595 | UltraFormationSequenceRequest | 未定义 | PROTOCOL_ONLY |
| REQ-596 | UltraInfoRequest | UltraInfoResponse | PROTOCOL_ONLY |
| REQ-597 | UltraOpenRequest | UltraOpenResponse | DAT-047 DATA_ONLY；src/game.mjs:54 |
| REQ-598 | UltraRankRequest | UltraRankResponse | PROTOCOL_ONLY |
| REQ-599 | UltraSaveFormationRequest | 未定义 | PROTOCOL_ONLY |
| REQ-600 | UnAppointHeroRequest | 未定义 | PROTOCOL_ONLY |
| REQ-601 | UnAppointPriorRequest | 未定义 | PROTOCOL_ONLY |
| REQ-602 | UniqueLotteryPrizeRequest | UniqueLotteryPrizeResponse | PROTOCOL_ONLY |
| REQ-603 | UniteWorldsPlanRequest | UniteWorldsPlanResponse | PROTOCOL_ONLY |
| REQ-604 | UnlockFormationPresetRequest | 未定义 | PROTOCOL_ONLY |
| REQ-605 | UpdateEnvSkinRequest | 未定义 | PROTOCOL_ONLY |
| REQ-606 | UpdateGuideRequest | 未定义 | PROTOCOL_ONLY |
| REQ-607 | UpdateHeroPrivacyRequest | 未定义 | PROTOCOL_ONLY |
| REQ-608 | UpdateNicknameRequest | 未定义 | PROTOCOL_ONLY |
| REQ-609 | UpdatePlayerChatFrameRequest | 未定义 | PROTOCOL_ONLY |
| REQ-610 | UpdatePlayerFrameRequest | 未定义 | PROTOCOL_ONLY |
| REQ-611 | UpdatePlayerIconRequest | 未定义 | PROTOCOL_ONLY |
| REQ-612 | UpdatePlayerTitleRequest | 未定义 | PROTOCOL_ONLY |
| REQ-613 | UpgradeAfkLevelRequest | UpgradeAfkLevelResponse | src/actions.mjs:42 |
| REQ-614 | UpgradeBuildingRequest | 未定义 | src/actions.mjs:193，src/world.mjs:378 |
| REQ-615 | UpgradeGuildTechRequest | UpgradeGuildTechResponse | PROTOCOL_ONLY |
| REQ-616 | VoucherBuyRequest | 未定义 | PROTOCOL_ONLY |
| REQ-617 | WarDeclarationRequest | WarDeclarationResponse | PROTOCOL_ONLY |
| REQ-618 | WatchAdvRequest | 未定义 | PROTOCOL_ONLY |
| REQ-619 | WeekBattlePassFinishTaskRequest | WeekBattlePassFinishTaskResponse | PROTOCOL_ONLY |
| REQ-620 | WeekBattlePassGotRewardRequest | WeekBattlePassGotRewardResponse | PROTOCOL_ONLY |
| REQ-621 | WeekBattlePassInfoRequest | WeekBattlePassInfoResponse | PROTOCOL_ONLY |
| REQ-622 | WeekChargeGotRewardRequest | 未定义 | PROTOCOL_ONLY |
| REQ-623 | WeekChargeInfoRequest | WeekChargeInfoResponse | PROTOCOL_ONLY |
| REQ-624 | WeekChipGotFreeRequest | 未定义 | PROTOCOL_ONLY |
| REQ-625 | WeekChipGotTaskRequest | WeekChipGotTaskResponse | PROTOCOL_ONLY |
| REQ-626 | WeekChipInfoRequest | WeekChipInfoResponse | PROTOCOL_ONLY |
| REQ-627 | WeekHeroStarGotRewardRequest | WeekHeroStarGotRewardResponse | PROTOCOL_ONLY |
| REQ-628 | WeekHeroStarInfoRequest | WeekHeroStarInfoResponse | PROTOCOL_ONLY |
| REQ-629 | WeekInfoRequest | WeekInfoResponse | DAT-035 DATA_ONLY；src/game.mjs:42，src/game.mjs:234 |
| REQ-630 | WeekLotteryFreePackRequest | 未定义 | PROTOCOL_ONLY |
| REQ-631 | WeekLotteryInfoRequest | WeekLotteryInfoResponse | PROTOCOL_ONLY |
| REQ-632 | WeekLotteryPrizeRequest | WeekLotteryPrizeResponse | PROTOCOL_ONLY |
| REQ-633 | WeekLotteryTimesRewardRequest | WeekLotteryTimesRewardResponse | PROTOCOL_ONLY |
| REQ-634 | WeekOrderGotFinalRequest | 未定义 | PROTOCOL_ONLY |
| REQ-635 | WeekOrderInfoRequest | WeekOrderInfoResponse | DAT-037 DATA_ONLY；src/game.mjs:44 |
| REQ-636 | WeekUniqueLotteryRequest | WeekUniqueLotteryResponse | PROTOCOL_ONLY |
| REQ-637 | WorldBossDamageInfoRequest | WorldBossDamageInfoResponse | PROTOCOL_ONLY |
| REQ-638 | WorldBossGetDamageRewardRequest | 未定义 | PROTOCOL_ONLY |
| REQ-639 | WorldBossGuildRankRequest | WorldBossGuildRankResponse | PROTOCOL_ONLY |
| REQ-640 | WorldBossInfoRequest | WorldBossInfoResponse | DAT-031 DATA_ONLY；src/game.mjs:38，src/game.mjs:234 |
| REQ-641 | WorldBossPlayerRankRequest | WorldBossPlayerRankResponse | PROTOCOL_ONLY |
| REQ-642 | WorldInfoRequest | WorldInfoResponse | PROTOCOL_ONLY |
| REQ-643 | WorldResRequest | WorldResResponse | PROTOCOL_ONLY |

</details>

下列 Response 没有同名 Request（实际存在，不自行推断关联）：

`ClaimAccumulateRewardResponse`、`EquinoxGotTaskResponse`、`GainBigResponse`、`GotRecruitTaskResponse`、`GotRewardResponse`、`GotTTradeReportResponse`、`HeroExclusiveNextUpResponse`、`HeroRaidOrderResponse`、`LeagueFormationResponse`、`MuseumCaseUpdateResponse`、`OkResponse`、`PromptResponse`、`SnapMatchStateResponse`、`TournamentScheduleResponse`、`UltraFormationResponse`。

<details><summary>166 个 SC* 消息类型索引</summary>

`SCAchievementUpdate`、`SCActivityActiveScoreUpdate`、`SCActivityPaidMoneyUpdate`、`SCActivityTaskUpdate`、`SCAllActivity`、`SCAntiqueSuitUpdate`、`SCAntiqueUpdate`、`SCArenaChallengeItem`、`SCAssembleCity`、`SCBackLimitTimePack`、`SCBadgeDelete`、`SCBatchChatReceive`、`SCBingoTaskUpdate`、`SCBlackWaterId`、`SCBranchTaskUpdate`、`SCBreedLevelUpdate`、`SCBuildFort`、`SCChannelExpired`、`SCChatReceive`、`SCChipMine`、`SCChipMineRewardInfo`、`SCChoiceEventUpdate`、`SCChurnNew`、`SCChurnTask`、`SCCityDefNum`、`SCCityWarTime`、`SCClientUpdate`、`SCCounterUpdate`、`SCDailyTaskReset`、`SCDailyTaskUpdate`、`SCDailyWeeklyReset`、`SCDelLimitTicket`、`SCDeleteTreasureLoot`、`SCDivingLevelUpdate`、`SCEWorldOrderDelivery`、`SCEquinoxPaidMoney`、`SCEquinoxTask`、`SCEquipDelete`、`SCEvilExpelRefresh`、`SCFishingLevelUpdate`、`SCFleet`、`SCForgeLevelUpdate`、`SCFormationUpdate`、`SCFortAction`、`SCFortBuilding`、`SCFortProcess`、`SCFortRemoved`、`SCGameEffectUpdate`、`SCGoldFishLuckyRecord`、`SCGroupBuyingProductUpdate`、`SCGuildAbstraction`、`SCGuildAidHelp`、`SCGuildAidRemove`、`SCGuildChanged`、`SCGuildFeatBox`、`SCGuildMemberTitleChange`、`SCGuildOrder`、`SCGuildRecommendChanged`、`SCGuildShipActivity`、`SCGuildShipLeader`、`SCGuildShipMove`、`SCGuildShipOrder`、`SCGuildShipReset`、`SCGuildTechChestProgressUpdate`、`SCHeroRaidOpen`、`SCJoinGuild`、`SCLeaveGuild`、`SCLimitTimePack`、`SCLimitedBossGodStrike`、`SCLimitedBossHp`、`SCLimitedBossRefresh`、`SCLimitedBossRewardInfo`、`SCMagicOceanActivity`、`SCMagicOceanTaskUpdate`、`SCMainTaskUpdate`、`SCMuseumPopularityChanged`、`SCMuseumRevenueUpdate`、`SCMyFleetPower`、`SCMyFleetUpdate`、`SCNewCampaignReport`、`SCNewChainPack`、`SCNewEmail`、`SCNewGuildAidAsk`、`SCNewGuildWelfarePack`、`SCNewLimitTicket`、`SCNewbieActivityUpdate`、`SCNotice`、`SCOpenRankRedDot`、`SCOrderOfTheDay`、`SCPaidMoney`、`SCPetDelete`、`SCPetsUpdate`、`SCPirateCampaignBegin`、`SCPirateCampaignEnd`、`SCPirateKillRecordUpdate`、`SCPirateSweepTimes`、`SCPirateUpdate`、`SCPlayerExpUpdate`、`SCPlayerLevelGrade`、`SCPlayerName`、`SCPlayerPower`、`SCPlayerTitle`、`SCPlotOpen`、`SCPrivateChatMessage`、`SCRadarEventState`、`SCRadarUpdate`、`SCRandPityTimes`、`SCRandomWaterFloaters`、`SCRedPoint`、`SCRefundState`、`SCRemoveDeclaration`、`SCRemovePirates`、`SCResFieldCampaignBegin`、`SCResFieldCampaignEnd`、`SCResFieldInfo`、`SCResourceRecovery`、`SCRevokeNotice`、`SCSalvageLevelUpdate`、`SCSeasonChestRemove`、`SCSeasonChestUpdate`、`SCSeasonPlayerProgress`、`SCSeasonTeamProgress`、`SCServerTimeChanged`、`SCShopPreRefund`、`SCSnapMatchmakingFinished`、`SCSnapPvpAborted`、`SCSnapPvpOngoingMatch`、`SCSnapPvpOpponentStateUpdate`、`SCSnapPvpRoundResult`、`SCSpeedUp`、`SCSpringLiveScore`、`SCSpringPaidMoney`、`SCStormTaskUpdate`、`SCSupplyDelete`、`SCTierTaskUpdate`、`SCTopBonusRank`、`SCTournamentChampion`、`SCTournamentContestantUpdate`、`SCTournamentMatchComplete`、`SCTournamentOpen`、`SCTournamentUpdate`、`SCTradeCargoMove`、`SCTradeCityGoods`、`SCTradeCityReport`、`SCTradeGuildTask`、`SCTreasureLootRefresh`、`SCTreasureLootUpdate`、`SCTrialRaidUpdate`、`SCUpdateBadge`、`SCUpdateDebt`、`SCUpdateEquip`、`SCUpdateHero`、`SCUpdateItem`、`SCUpdateResource`、`SCUpdateShip`、`SCUpdateSupply`、`SCUpdateWaterBuilding`、`SCVipUpdate`、`SCWarDeclaration`、`SCWorkerOrder`、`SCWorldBossCampaignBegin`、`SCWorldBossCampaignEnd`、`SCWorldBossInfo`、`SCWorldRes`、`SCWxForumCheckTimes`、`SCity`。

</details>

特别核对：DiscountShopBuyResponse 在当前实际协议中存在，但 dailies.mjs 对应 Action 仍设置 response:null、走 sendWatch；不能照旧注释把它写成协议无 Response，也不能仅凭类型存在宣称业务已使用该响应。


## PHASE 2 离线交付状态（2026-11-11）

PHASE 1 已验收。PHASE 2 已完成订单/城市/生产受控执行、共享预算、单批授权、持久历史和离线测试，等待人工验收；不自动开始 PHASE 3。

详细功能与验证见 `docs/PHASE_2_ACCEPTANCE.md`；可提交能力增量见 `docs/PHASE_2_CAPABILITY_DELTA.md`。免费刷新权威配额、MIN_GOLD 和游戏完整当日产量仍保留明确缺口，未知状态不授权写入。

本文为用户提供的 Capability Inventory 输入，原有正文逐字节保留，仅追加本执行状态；功能提交不包含此原始输入文件。追加前 SHA-256：`e17b1c1a3f0f9701fa8b6874a6642ae4aedc5e9ee90df0e3747560fedc85042a`。
