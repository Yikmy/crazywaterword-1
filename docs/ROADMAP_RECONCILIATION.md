# CrazyWater Platform — 全路线图对账与工程总计划

审计日期：2026-11-11（Asia/Shanghai）。源码基线：codex/phase-3-advanced-gameplay@a50501910e8308771d3b6899cd4d48992e8c4012。Planning Only；本报告的新增Function/API均为未来施工约定，本轮没有实施。

> 当前执行状态见附录D：Owner后续已授权 COMPLETE_CRAZYWATER_PLATFORM_R1_R8，Goal ACTIVE；以下原Planning Only审计内容保留为历史基线。

## 1. 结论、计数与范围

保留原Master的M0–M15，共 **16个工程产品模块（12个直接玩法模块+4个平台/整合模块）**；同时保留Inventory的18个业务域视图，二者是归并关系。原始表有 **95项Cxxx、42项Pxxx、8类Sx**；baseline补齐D1–D9。Inventory有 **273个唯一条目**：PLT43、DEX9、DAT48、BIZ116、ORD22、STG17、FRM8、PRO10。273含细粒度子能力、别名、参考实现和非C扩展，不与95相加。

95项Function独立分类：**EXISTING_FUNCTION 48，PARTIAL 29，PROTOCOL_ONLY 16，NOT_IMPLEMENTED 2**。48包含C409的D6硬拒绝，正向业务已有47项；人工确认不能解除D6。需要新增当前仓库业务Function的明确需求为 **18项（16仅协议+2未实现）**，另外29项要扩展/补链。“新增”允许提取本地参考成熟算法，不能理解为从零开发。已有Function不等于UI、调度、恢复和真实验收全部完成。

外部证据阻塞作为独立维度逐项列出，不与上述分类相加；95项中14项必要闭环为BLOCKED_EVIDENCE，完整ID见第5节。a505019新增写能力均REAL_UNVERIFIED；旧真实读取/主线证据保留版本和范围，不能删除也不能外推。

后续拆成 **6个开发阶段R1–R6、统一离线回归R7、统一真实E2E R8，共8阶段**；工程工作包共22个；最终真实验收为24组E01–E24。模块、工作包、阶段、场景组不混算。开发期间连续推进依赖已满足的工作，仅证据确实缺失或最终真实操作授权时停相关分支，不按页面逐项等真实验收。

## 2. 实际Git基线与保护

| 核对项 | 本轮实际结果 |
|---|---|
| 初始目录 | //zhangnas/app/aibot-crazywaterword；独立Git，master无提交，无可解析HEAD，原型及未跟踪.gitignore |
| 开发根目录 | //zhangnas/app/crazywaterword；本报告写入此仓库docs |
| 分支/HEAD | codex/phase-3-advanced-gameplay / a50501910e8308771d3b6899cd4d48992e8c4012；与Owner给定一致 |
| main/merge-base | 均61ce3c020ea8abedd9e70387c88528b6a8fe055b |
| 与main关系 | git rev-list --left-right --count main...HEAD = 0 / 18；无分叉待合并 |
| PHASE1/2祖先 | da41d1c；972f81a、52b7824、9d97065完整存在 |
| PHASE3 | git rev-list --count 9d97065..HEAD =14；没有HEAD之后修复 |
| 已跟踪变动 | 开始git diff与git diff --cached均空，无未提交修改 |
| 原未跟踪5份 | CAPABILITY_INVENTORY.md；docs/baseline.md；docs/blueprint.md；docs/标准三维度拆分表单.md；docs/PHASE_2_REAL_E2E_ACCEPTANCE.md |
| 本地远端引用 | origin/main=4094a69；main相对此引用ahead1；未fetch或联网查GitHub。未推送以本地引用和历史记录为据 |
| 目录约束 | 仓库含隐藏目录及可访问NAS祖先未找到AGENTS.md/TREE.md；沿用src/tests/tools/docs/data/work，不新增目录 |

PHASE3祖先顺序：c22d3f7 Formation →7e147bc Alliance →e7f79e8 Museum →4b3fded共享设置/事实 →0db2187 Treasure →3dbd4d6 Fleet →378d975 Naval →19ba83a runtime/stage →7717e6b Workflow →09084fe Fleet预算/委任隔离 →f0bd3eb阵容重应用 →86b43ab UI →f300a35 API →a505019文档。

本轮只新增本报告；不reset/rebase/clean/checkout、不合并main、不stage/commit/push、不写data/work/E2E、不读账号凭证/Token、不启Runtime/Stage/MITM、不连接游戏。普通沙箱无法访问NAS后，经自动审批执行指定仓库审计命令；没有自动审批拒绝后仍继续的动作。PowerShell工具忽略workdir，实际采用显式Set-Location；一次首次文档写入因Provider路径格式失败，未产生文件，已改用明确UNC目标。

原输入开始SHA256（结束复核不变）：

| 文件 | SHA256 |
|---|---|
| CAPABILITY_INVENTORY.md | 33a040e52e62ebacaa682e315e0187857e9c12578ac85801e958f3d9764f2b4a |
| docs/baseline.md | 74b243da49562f02907e941037736e6c168ba01770e3cb7e06852233be0452a6 |
| docs/标准三维度拆分表单.md | baeca896e6f16b6d34121bbe9e85bf90538045927a9bce56cde859b81ee81f32 |
| docs/PHASE_2_REAL_E2E_ACCEPTANCE.md | 1e54b13ccb229c9fbc4668c9be8f0e2c870696a0c4ae6054ad323003285dd2d5 |
| docs/blueprint.md | da6249caa761b80d0a56e2d5122a9cec17fcc1f24778a01fdc4394edad27e6c3 |

## 3. 原Master阶段对账

完整读取baseline、Inventory、三维表、PHASE1/2/3验收、PHASE2/3增量及PHASE2真实验收；文档只作索引，判定使用当前Function、调用者、白名单、UI事件、测试及本地协议。baseline称九阶段，实际PHASE0–9共10条。阶段报告内部M1/M2/M3只是该阶段分组，不替换原Master模块编号。

| 原阶段 | 源码核对结果 | 本路线图处理 |
|---|---|---|
| 0 Baseline/Mapping | 原表PHASE1时为空，当前恢复非空；本次重新核对95项 | 保留原文，增补当前账本 |
| 1 Shared Safety | 安全修复实际存在；不等于跨进程和恢复已完整 | R1补交付级公共保护 |
| 2 City/Production/Orders | 已有受控执行闭环；日报/金币/刷新及真实写仍缺 | R2补缺，R8真实验收 |
| 3 Formation/Battle | 保存复读/战报已实现；自动换阵仅推荐，极限复制缺 | R2补齐 |
| 4 Alliance | 已提前部分实现；Help/Ask/赛季限额阻塞、科技仅协议 | R3完成 |
| 5 Fleet/CityWar | 编队/维修/停止/移动/港口已有；监听/跟随/攻击/道具加速未全 | R4完成 |
| 6 Museum/Secondary | 展陈/收益/出发/道具加速已有；结算领奖缺身份；扫荡配额/钓鱼缺 | R3/R4完成 |
| 7 Activities/Trade | 旧日常/任务/原始数据存在；周活动/VIP/军备/贸易缺链 | R3/R4完成 |
| 8 Workflow | 有限DAG/图编辑已实现；注册覆盖、元数据、持久记忆、S5/S6/跨节点预算缺 | R1先适配，R5完成 |
| 9 Integration/Release | 未完成 | R6集成→R7离线→R8真实 |

实际交付PHASE3是Advanced Gameplay & Workflow，提前包含原PHASE4/5/6/8子功能，不能整体继承这些原阶段PASS。Owner本轮连续开发模式取代历史每功能停等真实验收；后续仍独立提交/保留离线证据，路线图批准不自动授权真实账号操作。

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
### 4.5 PHASE3七域复核（以当前源码覆盖历史TODO）

| 域 | 当前真实实现与后续提交核对 | 当前仍缺 / 施工归属 |
|---|---|---|
| Formation | survey/校验/完整SaveFormation+GetFormation复读、手动布局/重新应用/旧队恢复、职业布局推荐存在；f0bd3eb已补重新应用，不能沿用早期缺失结论 | automatic:false；无极限复制/自动保存续跑；原模板普通解锁/具名整队及其他模式范围待补，W08 |
| Alliance | 成员识别、help规则与请求构造、取消/领取/福利存在；不能写成成员识别尚无实现 | production survey的helpAllowance/helpUsage/season仍null；ask无body；科技/商船/Fort各独立闭环，W09/W10 |
| Museum | 出发/道具加速、展陈/展柜展区升级/收益/成就存在 | Complete与Reward独立，pending身份与恢复来源未证；专业缺货/藏品培养另补W11 |
| Treasure | Stats/List/Rank/Defence、合规无人防守派舰及MyFleets.treasureLootUid确认已实现，treasure.mjs:20/54/87 | 派遣不等争夺/占有/战果/领奖完成；W14独立子域，不并入Museum |
| Fleet | 编队/维修阈值模式预算/优先级/停止维修/关闭autoFight/移动/港口货物与领奖存在；09084fe等补预算隔离，编队不能再判仅协议 | 非零pet绑定、敌城几何/攻击/宣战/胜负、合法道具加速、原资源田和在线奖剩余链；W05/W14 |
| Naval Rules | 当前WorldInfo只读、精确playerId过滤、三值有序规则与原因轨迹存在 | CURRENT_RESPONSE_ONLY不是全图持续定位；监听/跟随/动态攻击未闭环，W15 |
| Workflow | 有限DAG、静态模块调用、条件/WAIT/逐批暂停授权、持久图与RECOVERED_STOPPED存在；86b43ab/f300a35页面/API集成已落地 | Registry未覆盖全平台、元数据/父run预算/跨轮记忆/日周事件调度/拖拽专业交互未全；W02/W19/W20/W21 |

源码与各领域tests的逐项证据见第5节、附录A/B。PHASE3最后提交a505019仅文档，f300a35之后没有功能修复提交，故不能将交付报告剩余缺口凭推测视为已关闭；同时上述后期已完成的Fleet编队/维修预算/阵容重应用也不再重复开发。

## 5. 原始95项需求账本（独立维度）

以下每行保留原C编号和原能力名。Function四类互斥；Protocol为已确认编码类型/调用语义证据，BLOCKED_EVIDENCE另列。profile不是总体评级：它仅把重复的12维检查值展开到每行，局部覆盖以备注为准。EXISTING_UI只表示声明范围已有界面；通用JSON页不算专业业务页全部完成。N/A是该只读能力不需要消费/授权执行基础，不等于缺失。

| Profile | 实际调用者→GameClient/API/UI | 参数/权限(第6项) | Ledger / OperationService / History(7–9项) | 取消/超时/迟到/UNKNOWN(10项) | 离线(11项) / 真实(12项) |
|---|---|---|---|---|---|
| P 平台/本地存储 | app/server→账号/Session；指定API；UI存在但扫码等原P仍PARTIAL | 既有校验/账号键，Stage门控差异见W01 | 只读/本地配置N/A；执行历史按具体调用，非全量 | Session generation/stop；本地坏文件fail-closed | H1/H2/H3历史对应tests；a505019 REAL_UNVERIFIED，旧登录证据限定版本 |
| R 只读/纯计算 | CLI/server/Snapshot/Explorer→GameClient.request或缓存/纯函数；GET或preview；UI EXISTING_UI或原始范围PARTIAL | 可靠性/数量/账号scope；无写许可 | Ledger仅库存计算/预览可选；Operation写N/A；本地读历史N/A | 底层请求保护；collectState仍有失败outcome；不是业务写UNKNOWN恢复 | 历史selftest/catalog/explorer/rules；旧48/48限定历史，当前REAL_UNVERIFIED |
| O Phase2受控业务 | page→operations API→Order/City wrapper→runWorld→GameClient | 严格参数/Origin/CSRF/精确账号/一次permit | 三者均接入；规划和执行账本分离，同批共享 | 全部接入；已派不明保持UNKNOWN并持久阻断，无恢复入口 | H2+H3；order-execution/city-operations/operations-*；真实只读局部，写REAL_UNVERIFIED |
| G 注册业务/Workflow | gameplay-page/Workflow→gameplay survey/operations plan-authorize-execute→静态adapter→GameClient | 严格参数/账号模块配置/Origin/CSRF/动作ID绑定 | 写入execute路径三者接入；只读survey/view不消耗Ledger且不写ExecutionHistory，PLAN不作已执行历史；单批Ledger非整图累计预算 | execution+client+generation；静默后verify；无权威恢复入口 | H3 gameplay-*/领域tests（仅已有分支）；新增写REAL_UNVERIFIED |
| L 旧CLI/局部链 | app/loop→旧Function→GameClient；读API/预览UI有；旧写HTTP被READ_ONLY_ROUTE拒 | allowMutate/D6/局部前检；非统一permit | World/Hero有Ledger；日常部分成本仅文字；Operation/持久History未全 | Phase1逐步取消/超时/迟到已接；多typed只确认响应，静默UNKNOWN；缺业务权威复读 | H1/H3 existing selftest/execution；缺新增分支测试；当前REAL_UNVERIFIED |
| S Standalone Stage | page→stages start/stop/status→原Runner→GameClient | needConfirm/config/锁/未决保护；未复用operations Origin/CSRF | 不直接消费账本；Standalone未写全量History；Stage Function外层走Operation | runId/generation/Abort/倒计时/迟到/UNKNOWN/限频已有 | Stage系列H1/H3；历史B3局部REAL_VERIFIED，当前冷却/战败停止/新版本REAL_UNVERIFIED |
| Q 仅协议/参考 | 无目标业务调用者→无GameClient业务接入；无可执行API；UI为NOT_IMPLEMENTED或仅阻塞占位 | 不得从协议存在推断校验/授权已完成 | 均未接入该业务；参考预算不算目标实现 | 仅底层可复用，业务生命周期尚未实现 | codec存在≠该业务OFFLINE_VERIFIED；业务NOT_IMPLEMENTED；REAL_UNVERIFIED |
| N 未实现 | 无Function/调用者/GameClient/API/UI | 未实现 | 未接入 | 未实现 | 无业务离线或真实证据 |
| B 禁止能力 | 所有现有业务执行者→assertPaymentAllowed；无允许消费UI | D6不可override | Ledger/Action均硬拒钻石；禁止路径无成功History | 派发前NOT_EXECUTED，不制造UNKNOWN | actions/dailies安全H1/H3；本轮无真实付费尝试 |

H1=da41d1c历史459测试；H2=9d97065历史609；H3=f300a35实现树/a505019文档845。OFFLINE_VERIFIED仅指这些版本中对应已实现分支；PARTIAL/纯协议需求整体不能继承该标签。C行Function为第1项，源符号证据为第2项调用者入口结合profile；profile逐项展开3–12项。未带目录的源码名如accounts.mjs均指当前仓库src/accounts.mjs；tests/及其他显式路径按原路径；行号对应a505019。

| C ID | 原能力 | Function | Profile | Protocol/外证 | 当前Function与源码 | 缺口/边界 | 工作包 |
|---|---|---|---|---|---|---|---|
| C001 | 凭证→Session 建立 | EXISTING_FUNCTION | P | 已用类型/本地计算已核 | accounts.mjs:loadStore/upsertAccount; server.mjs:91/237 newSession/connect | Session建立存在，扫码产品入口仍隐藏/禁止 | W03 |
| C002 | 账号隔离 | EXISTING_FUNCTION | P | 已用类型/本地计算已核 | server.mjs:91/115/163; accounts.mjs | 账号Session/配置/快照隔离存在；跨进程所有者见W01 | W01 |
| C003 | 世界/区服切换 | EXISTING_FUNCTION | L | 已用类型/本地计算已核 | worlds.mjs:68 enterWorld; app.mjs:139 | CLI进入存在；Web enter在白名单前被拒；任意worldId可能创建角色 | W03 |
| C004 | 状态采集（只读） | EXISTING_FUNCTION | R | 已用类型/本地计算已核 | game.mjs:7/98/131 ENTRY_QUERIES/collectState/summarize | 48基础查询，27解析21原始，不新建清单 | W03 |
| C005 | 协议调用（通用） | EXISTING_FUNCTION | R | 已用类型/本地计算已核 | client.mjs:211/266; proto.mjs:44; codec.mjs:15 | 通用传输内部可复用；不开放任意HTTP请求 | W01 |
| C101 | 建筑信息读取 | EXISTING_FUNCTION | R | 已用类型/本地计算已核 | world.mjs:86 surveyWorld; city-operations.mjs:38/131 | 建筑信息与业务页面已有 | W04 |
| C102 | 建筑升级前置校验 | EXISTING_FUNCTION | O | 已用类型/本地计算已核 | world.mjs:209 planWorld; city-operations.mjs:167 | 材料/等级/人口/队列前检已有；未知不计划 | W04 |
| C103 | 建筑升级执行 | EXISTING_FUNCTION | O | 已用类型/本地计算已核 | city-operations.mjs:221 executeCityAction; world.mjs:469 | 升级授权与权威复读已有，真实未验 | W04 |
| C104 | 建造执行 | EXISTING_FUNCTION | O | 已用类型/本地计算已核 | city-operations.mjs:167/221; actions.mjs BuildBuilding | 仅服务端已有level0槽；不是任意地图新坐标建造 | W04 |
| C111 | 工厂状态读取 | EXISTING_FUNCTION | R | 已用类型/本地计算已核 | surveyCityOperations/cityView; world.mjs:86 | 工厂/队列/空位/成品可靠性已有 | W04 |
| C112 | 生产报表聚合 | PARTIAL | O | 类型存在/部分语义 BLOCKED_EVIDENCE | production-report.mjs:36 summarizeProductionHistory | 仅工具确认事件，完整全天产量null；需完整事件覆盖或Owner缩减口径 | W04 |
| C113 | 库存缺口计算 | EXISTING_FUNCTION | R | 已用类型/本地计算已核 | production-policy.mjs:61 productionShortages | 合并订单需求扣库存/在产/成品；UNKNOWN不作零 | W04 |
| C114 | 自动生产决策 | EXISTING_FUNCTION | O | 已用类型/本地计算已核 | production-policy.mjs:101 selectProductionCandidates; planWorld | 本批策略已有，持续轮询属于调度缺口 | W04 |
| C115 | 生产提交执行 | EXISTING_FUNCTION | O | 已用类型/本地计算已核 | executeCityAction/runWorld StartFactoryProduce | 启动/即时完成复读已有 | W04 |
| C116 | 成品收取/竣工 | EXISTING_FUNCTION | O | 已用类型/本地计算已核 | executeCityAction GainFactoryProduce/CollectBuildingProduct/FinishUpgradeBuilding | 数量双证据确认；真实未验 | W04 |
| C121 | 居民需求读取 | EXISTING_FUNCTION | R | 已用类型/本地计算已核 | order-execution.mjs:92 surveyOrderExecution; surveyWorld | 需求源OnWater，缺数组不是权威空 | W04 |
| C122 | 需求物品解析 | EXISTING_FUNCTION | R | 已用类型/本地计算已核 | decorateOrderSurvey; world.mjs:86; resourceCosts | 物品ID/安全数量解析已有 | W04 |
| C123 | 订单库存缺口 | EXISTING_FUNCTION | R | 已用类型/本地计算已核 | evaluateOrders; planOrderExecution; ResourceLedger | 跨订单预算分配已有，不把独立模拟当批量预留 | W04 |
| C124 | 订单奖励计算 | PARTIAL | R | 类型存在/部分语义 BLOCKED_EVIDENCE | surveyWorld rewardExp; order-rules.mjs:113 | EXP存在，金币/MIN_GOLD可靠来源缺失 | W04 |
| C125 | 订单规则评估 | EXISTING_FUNCTION | R | 已用类型/本地计算已核 | order-rules.mjs validateOrderRules/evaluateOrder/evaluateOrders | 五类规则/优先级/解释轨迹已有 | W04 |
| C126 | 订单提交执行 | PARTIAL | O | 类型存在/部分语义 BLOCKED_EVIDENCE | order-execution.mjs:104/146 planOrderExecution/executeOrderOperation | SUBMIT闭环已有；免费REFRESH proof生产缺失 | W04 |
| C127 | 规则持久化 | EXISTING_FUNCTION | P | 已用类型/本地计算已核 | order-rules-store.mjs loadOrderRules/saveOrderRules | 精确账号原子保存及坏文件保护已有 | W03 |
| C128 | 执行历史记录 | EXISTING_FUNCTION | O | 已用类型/本地计算已核 | execution-history.mjs:16; operation-service.mjs:256 | 订单持久历史存在；恢复解除见W01 | W01 |
| C131 | 港口货物读取 | EXISTING_FUNCTION | G | 已用类型/本地计算已核 | fleet.mjs:18/134 surveyFleet/fleetView | CargoShips读取和通用Fleet展示已有 | W05 |
| C132 | 港口缺货识别 | PARTIAL | G | 已用类型/本地计算已核 | fleet.mjs:119/141 buildCandidates/planFleet | 成本/余额阻断有；required/have/missing明细与高亮缺 | W05 |
| C133 | 提交货物执行 | EXISTING_FUNCTION | G | 已用类型/本地计算已核 | fleet.mjs:127/194 cargoFill/verifyFleet | FillCargoShip typed+精确货格filled复读已有 | W05 |
| C134 | 领取港口奖励 | EXISTING_FUNCTION | G | 已用类型/本地计算已核 | fleet.mjs:129/198 cargoClaim/verifyFleet | 到港状态消费+奖励回包已有；E2E加库存核对 | W05 |
| C141 | 寻宝状态读取 | EXISTING_FUNCTION | G | 已用类型/本地计算已核 | museum.mjs:40/58 surveyMuseum/museumView | 探索次数/进度/状态可读，COMPLETE_UNSETTLED独立 | W11 |
| C142 | 寻宝缺货识别 | PARTIAL | G | 已用类型/本地计算已核 | museum.mjs:61/93/175 | 成本/库存线阻断有，missing明细未形成 | W11 |
| C143 | 冒险寻宝执行 | EXISTING_FUNCTION | G | 已用类型/本地计算已核 | museum.mjs:95/188 MuseumStartExplore/verifyMuseum | 出发和道具加速Function存在，结算领奖另计C144 | W11 |
| C144 | 领取寻宝奖励 | PROTOCOL_ONLY | Q | 类型存在/部分语义 BLOCKED_EVIDENCE | museum.mjs:74 blocked; proto MuseumCompleteExplore/MuseumReward | 两个动作独立，缺可恢复pending身份，不可用收益代替 | W11 |
| C151 | 海面扫荡 | PARTIAL | L | 已用类型/本地计算已核 | dailies.mjs:376 DAILY_DRIVERS[1010] | PirateSweep执行有，权威次数/配额检查和复读缺 | W12 |
| C152 | 钓鱼 | PROTOCOL_ONLY | Q | 类型存在/部分语义 BLOCKED_EVIDENCE | proto StartFishing/StartFishingResponse/GainBigFish/DrawFishReward | 无生产调用链；FishEncyclopedia只是图鉴 | W13 |
| C201 | 当前关卡读取 | EXISTING_FUNCTION | S | 已用类型/本地计算已核 | stages.mjs:114 createStageRunner; server.mjs stageView | mainlineStage当前读取已有 | W08 |
| C202 | 挑战关卡执行 | EXISTING_FUNCTION | S | 已用类型/本地计算已核 | stages.mjs createStageRunner/parseStageResult | ChallengeStage执行已有，保持主线专属证据 | W08 |
| C203 | 战斗结果解析 | EXISTING_FUNCTION | S | 已用类型/本地计算已核 | stages.mjs:85 parseStageResult/resolveMainlineChallengeSide | 严格关卡/Boolean/BT_MAINLINE/LEFT已有 | W08 |
| C204 | 关卡循环控制 | EXISTING_FUNCTION | S | 已用类型/本地计算已核 | stages.mjs:114 createStageRunner | 顺序长任务/可取消等待/最大尝试和目标已有 | W08 |
| C205 | 限频处理 | EXISTING_FUNCTION | S | 已用类型/本地计算已核 | stages.mjs stageError; execution.mjs executionOutcome | RATE_LIMITED独立停止；原表等待重试被D8安全修订取代 | W08 |
| C206 | 敌方阵容抓取 | EXISTING_FUNCTION | S | 已用类型/本地计算已核 | formation.mjs:180/198 battleAnalysis | 消费已有rightTeams，不额外挑战取数据 | W08 |
| C207 | 我方阵容抓取 | EXISTING_FUNCTION | S | 已用类型/本地计算已核 | formation.mjs:180/198; surveyFormation | 实际leftTeam与当前GetFormation来源分开 | W08 |
| C208 | 战斗结果分析 | EXISTING_FUNCTION | S | 已用类型/本地计算已核 | formation.mjs:198 battleAnalysis; stages.mjs:255 | 伤害/存活/战败保守分析存在；长期比较留W08 | W08 |
| C209 | 自动换阵决策 | PARTIAL | G | 已用类型/本地计算已核 | formation.mjs:234 recommendFormations | 只有CLIENT_CAREER_LAYOUT推荐，automatic:false；无自动保存续跑闭环 | W08 |
| C211 | 当前阵容查询 | EXISTING_FUNCTION | G | 已用类型/本地计算已核 | formation.mjs:98/154 surveyFormation/viewFormation | 主线当前阵容独立读，petUid精度保留 | W08 |
| C212 | 已解锁阵型查询 | EXISTING_FUNCTION | G | 已用类型/本地计算已核 | formation.mjs:69/98 catalogFrom/surveyFormation | 解锁布局列表存在，preset不是整队存档 | W08 |
| C213 | 阵容保存/切换前置校验 | EXISTING_FUNCTION | G | 已用类型/本地计算已核 | formation.mjs:52/69/120 validateFormationParameters/candidate | 归属/人数/职业/站位/宠物校验已有 | W08 |
| C214 | 阵容保存/切换执行 | EXISTING_FUNCTION | G | 已用类型/本地计算已核 | formation.mjs:161/170 planFormation/verifyFormation | SaveFormation typed与GetFormation全量一致才确认 | W08 |
| C215 | 一键复制"极限通关"站位 | NOT_IMPLEMENTED | N | 本地算法需求 | formation.mjs:234仅职业重排；无极限复制算法 | 定义源战报/敌我英雄映射/缺人/坐标变换再实现 | W08 |
| C221 | 角色升级前置校验 | EXISTING_FUNCTION | L | 已用类型/本地计算已核 | heroes.mjs:39/66 maxHeroLevelFor/planHeroes | 成长等级和材料前检已有，复用Ledger | W06 |
| C222 | 角色升级执行 | PARTIAL | L | 已用类型/本地计算已核 | heroes.mjs:221/275 runHeroPlan/sendHero | 等级CLI写存在，sendWatch后UNKNOWN；缺权威Hero复读/API/UI/History | W06 |
| C223 | 角色升星前置校验/执行 | PARTIAL | L | 已用类型/本地计算已核 | heroes.mjs:221/282 HeroStarUp | typed回复直接SUCCESS，缺权威复读和产品桥 | W06 |
| C224 | 技能升级前置校验/执行 | PARTIAL | L | 已用类型/本地计算已核 | heroes.mjs:56/221/275 skillLevelMinStar/runHeroPlan | 技能预算/星级校验有，缺执行后权威确认与产品桥 | W06 |
| C225 | 专武等级前置校验/执行 | PROTOCOL_ONLY | Q | 类型存在，业务待接 | proto HeroExclusiveLevelUp; reference heroGrow.mjs:629 | 目标无专武成长Function，先提取参考成本算法 | W07 |
| C226 | 专武星级前置校验/执行 | PROTOCOL_ONLY | Q | 类型存在，业务待接 | proto HeroExclusiveStarUp/HeroExclusiveNextUpResponse; ref heroGrow | 目标无业务，Response不能按同名猜造 | W07 |
| C227 | 纹章替换前置校验/执行 | PROTOCOL_ONLY | Q | 类型存在，业务待接 | proto BadgeReplace/PutOnBadge; ref heroGrow.mjs:629 | 纹章实例替换未接目标，H确认与唯一UID预留必须 | W07 |
| C228 | 纹章升级前置校验/执行 | PROTOCOL_ONLY | Q | 类型存在，业务待接 | proto EnhanceBadge; ref heroGrow planBadgeEnhance | 纹章升级目标无业务，复用参考校验而非预算器 | W07 |
| C229 | 装备升级前置校验/执行 | PROTOCOL_ONLY | Q | 类型存在，业务待接 | proto EnhanceEquip; ref heroGrow/equip | 装备升级目标无业务，材料与实例身份复读必需 | W07 |
| C230 | 装备替换前置校验/执行 | PROTOCOL_ONLY | Q | 类型存在，业务待接 | proto EquipReplace/PutOnEquip; ref heroGrow | 装备替换目标无业务，不自动分解/不可逆扩域 | W07 |
| C301 | 联盟求助单识别 | EXISTING_FUNCTION | G | 已用类型/本地计算已核 | alliance.mjs:84/99 surveyAlliance/allianceView | reqId精确绑定成员求助单，已有展示 | W09 |
| C302 | 联盟成员识别 | EXISTING_FUNCTION | G | 已用类型/本地计算已核 | alliance.mjs:92 titleList.members | 成员ID识别已实现，专业列表UI可改进 | W09 |
| C303 | 按成员捐赠前置校验/执行 | PARTIAL | G | 类型存在/部分语义 BLOCKED_EVIDENCE | alliance.mjs:36/96/113 allianceHelpRules | 规则与help构造有，生产helpAllowance/helpUsage=null，永阻 | W09 |
| C304 | 按物品捐赠前置校验/执行 | PARTIAL | G | 类型存在/部分语义 BLOCKED_EVIDENCE | allianceHelpRules/planAlliance; alliance.mjs:52 | 共用按itemIds规则，不建第二捐赠器；配额证据缺 | W09 |
| C305 | 自动求助前置校验/执行 | PROTOCOL_ONLY | Q | 类型存在/部分语义 BLOCKED_EVIDENCE | alliance.mjs:120 ASK_COOLDOWN_UNKNOWN | 配置/协议有，无ask body/执行复读，阈值/日限/冷却缺 | W09 |
| C306 | 联盟科技状态读取 | EXISTING_FUNCTION | R | 已用类型/本地计算已核 | game.mjs:34 GuildTechInfo; data-catalog.mjs:48 | 原始只读存在，科技树UI未实现 | W10 |
| C307 | 联盟科技升级前置校验/执行 | PROTOCOL_ONLY | Q | 类型存在，业务待接 | proto UpgradeGuildTechRequest/Response | 无业务适配；补前置/成本/权限/目标等级/复读 | W10 |
| C401 | 舰队编组读取 | EXISTING_FUNCTION | G | 已用类型/本地计算已核 | fleet.mjs:18/24/134 | MyFleets+OnWater队伍读取已有，不用MyFleets代替阵容复读 | W14 |
| C402 | 舰队编组修改前置校验/执行 | EXISTING_FUNCTION | G | 已用类型/本地计算已核 | fleet.mjs:97/105/165 FleetSaveFormation | 无非零宠物范围编组可执行；非零宠物绑定证据另列受限分支 | W14 |
| C403 | 地图目标读取 | EXISTING_FUNCTION | G | 已用类型/本地计算已核 | naval-rules.mjs:52/69 surveyNaval/navalView; world.mjs地图 | 当前WorldInfo城市/玩家/舰队和资源田可读；非全地图 | W15 |
| C404 | 目标监听 | PARTIAL | G | 已用类型/本地计算已核 | naval-rules.mjs:67/87 observations | 单次观察/规则有，有限持续监听/事件游标缺 | W15 |
| C405 | 跟随指定玩家 | PARTIAL | G | 类型存在/部分语义 BLOCKED_EVIDENCE | naval-rules.mjs:42/75/91 | 精确玩家过滤有，跨视野稳定定位/跟随事件流缺 | W15 |
| C406 | 攻击派遣前置校验/执行 | PARTIAL | G | 类型存在/部分语义 BLOCKED_EVIDENCE | fleet.mjs:56/114/190 movementCost/fleetMove | 仅移动已实现；攻击/宣战/胜负/权限语义缺 | W14 |
| C407 | 修船前置校验/执行 | EXISTING_FUNCTION | G | 已用类型/本地计算已核 | fleet.mjs:38/72/88/141/181 | 维修阈值/单价/计划汽油上限/优先级/停止已有 | W14 |
| C408 | 加速前置校验/执行 | PROTOCOL_ONLY | Q | 类型存在/部分语义 BLOCKED_EVIDENCE | fleet.mjs:134 blocked SpeedUpFleet/Repair/Cargo | 无D6允许的道具加速候选；不能用RUBY补齐 | W14 |
| C409 | 钻石使用规则评估 | EXISTING_FUNCTION | B | 已用类型/本地计算已核 | actions.mjs:277 assertPaymentAllowed | D6统一硬拒绝已实现；正向钻石消费EXCLUDE | W01 |
| C410 | 动态攻击决策 | PARTIAL | G | 类型存在/部分语义 BLOCKED_EVIDENCE | naval-rules.mjs:10/94 evaluateNavalRules/planNaval | 三值观察规则有，动态攻击选择与授权派遣无 | W15 |
| C501 | 活动识别 | PARTIAL | R | 已用类型/本地计算已核 | game.mjs Snapshot Week/Season; data-catalog | 有活动数据，无完整活动身份/开放状态聚合 | W16 |
| C502 | 活动任务读取 | PARTIAL | R | 已用类型/本地计算已核 | dailies.mjs:421 surveyDailies; tasks.mjs:63 surveyTasks | 部分任务读取，不能当全部周/季活动任务 | W16 |
| C503 | 活动任务执行前置校验/执行 | PARTIAL | L | 已用类型/本地计算已核 | dailies.mjs:539 runDailies; tasks.mjs:190 runTasks | 部分日常驱动/领奖存在，活动全量和Operation桥缺 | W16 |
| C511 | 邮件领取 | PARTIAL | L | 已用类型/本地计算已核 | actions.mjs emailQuickGet; app.mjs loot | 仅已读附件QuickGotReadEmail，静默UNKNOWN，未读/复读/UI链缺 | W16 |
| C512 | VIP 礼包领取 | PROTOCOL_ONLY | Q | 类型存在，业务待接 | proto GotVipDailyRewardRequest | 无生产调用，月卡权益不等于VIP礼包 | W16 |
| C513 | 商城礼包领取（日/周） | PARTIAL | L | 已用类型/本地计算已核 | dailies.mjs:135/583 planDailyGift/claimDailies | 免费日赠礼已复读；原需求免费周礼包未全 | W16 |
| C514 | 周活动补给礼包领取 | PROTOCOL_ONLY | Q | 类型存在/部分语义 BLOCKED_EVIDENCE | proto WeekLotteryFreePack/WeekChipGotFree等候选 | 缺具体周补给身份/资格契约，不按名称混认 | W17 |
| C515 | 周活动每日任务执行 | PARTIAL | L | 已用类型/本地计算已核 | game.mjs WeekInfo/WeekOrderInfo; DrawWeeklyReward | 周状态/周活跃不等于活动每日任务闭环 | W17 |
| C516 | 周活动奖励领取 | PARTIAL | L | 已用类型/本地计算已核 | dailies.mjs:81/611 planChests | 周活跃箱已有，活动奖励语义未全 | W17 |
| C517 | 军备竞赛奖励领取 | PROTOCOL_ONLY | Q | 类型存在/部分语义 BLOCKED_EVIDENCE | proto Season/Ranking/活动候选；无军备业务映射 | 须识别活动ID/领取档位/资格与权威复读来源 | W17 |
| C521 | 海商王价格读取 | PARTIAL | R | 已用类型/本地计算已核 | dailies.mjs:340 TradeInfo probe | 原始TradeInfo可读，价格/商品/港口业务模型缺 | W18 |
| C522 | 低买高卖预期计算 | NOT_IMPLEMENTED | N | 本地算法需求 | reference tradeKing.mjs:585 planBuy仅参考 | 目标无收益算法；先移植只读模型和可靠卖点 | W18 |
| C523 | 自动买卖前置校验/执行 | PROTOCOL_ONLY | Q | 类型存在，业务待接 | proto TradeBuy/TradeSellRequest/Response; ref planTradeKing | 无目标买卖适配；商会币需专用成本语义，不能全局放开Buy | W18 |
| C524 | 自动巡航 | PROTOCOL_ONLY | Q | 类型存在，业务待接 | proto TradeMove/TradeSpeedRequest/Response; reference tradeKing | 无目标巡航；仅已证实非钻石路径可用 | W18 |
| C601 | 只读探测（每轮首步） | EXISTING_FUNCTION | G | 已用类型/本地计算已核 | workflow.mjs:136; operation-service.mjs:92 surveyModule | 现有SURVEY可用，复用基础Snapshot，不建第二collector | W02 |
| C602 | 计划生成 | PARTIAL | G | 已用类型/本地计算已核 | operation-service.mjs:103; workflow.mjs:137 | 计划合同存在，orders/city/production/heroes等未全注册 | W02 |
| C603 | 动作执行（单条/整轮） | PARTIAL | G | 已用类型/本地计算已核 | business-functions.mjs:12 executeBusinessOperation; OperationService | 共用执行有，旧执行链未全适配 | W02 |
| C604 | 跨轮记忆 | PARTIAL | L | 已用类型/本地计算已核 | loop.mjs:15/102 rejected; tasks/dailies rejected参数 | 仅进程内跨轮记忆，持久冷却/拒绝/日界缺 | W19 |
| C605 | 顺序执行引擎 | EXISTING_FUNCTION | G | 已用类型/本地计算已核 | workflow.mjs:110 createWorkflowRunner | 有限DAG顺序执行已实现；S5/S6另补 | W20 |
| C606 | 运行状态/历史查询 | PARTIAL | G | 已用类型/本地计算已核 | operation-service.mjs:256; workflow.mjs:206/235 | 已有持久操作/图历史，Standalone Stage/旧Loop未全接与关联字段缺 | W19 |
| C607 | Function 注册表 | PARTIAL | G | 已用类型/本地计算已核 | function-registry.mjs:9/10; server.mjs:132/133 | 6玩法+stage，缺完整目录/schema/C-P-S/授权/取消/验证元数据 | W02 |


G-R/G-P覆盖：C131/C141/C211/C212/C301/C302/C401/C403/C601属于只读survey/view，不消耗Ledger、不创建写许可、不记业务ExecutionHistory；C602是PLAN，使用规划预算模拟但未执行，不把其输出当执行历史。C132/C142/C209/C404/C405/C410等规划/观察子功能同理；只有真正执行的候选继承G写入路径。C606历史查询是本地读取。Function状态和相邻模块的执行底座不能互相替代。

### 5.1 可复算的需求状态清单

- EXISTING_FUNCTION（48）：C001、C002、C003、C004、C005、C101、C102、C103、C104、C111、C113、C114、C115、C116、C121、C122、C123、C125、C127、C128、C131、C133、C134、C141、C143、C201、C202、C203、C204、C205、C206、C207、C208、C211、C212、C213、C214、C221、C301、C302、C306、C401、C402、C403、C407、C409、C601、C605。
- PARTIAL（29）：C112、C124、C126、C132、C142、C151、C209、C222、C223、C224、C303、C304、C404、C405、C406、C410、C501、C502、C503、C511、C513、C515、C516、C521、C602、C603、C604、C606、C607。
- PROTOCOL_ONLY（16）：C144、C152、C225、C226、C227、C228、C229、C230、C305、C307、C408、C512、C514、C517、C523、C524。
- NOT_IMPLEMENTED（2）：C215、C522。
- BLOCKED_EVIDENCE（14）：C112、C124、C126、C144、C152、C303、C304、C305、C405、C406、C408、C410、C514、C517。它是与Function交叉的证据维度。

18个当前无业务Function的需求=PROTOCOL_ONLY+NOT_IMPLEMENTED；其余29个部分需求仍需补功能，不可因已有局部Function而排除工程工作。C402非零宠物舰队、敌城几何缺失等是当前明确受限的分支（不可据此缩减完整Inventory范围），另列风险；14的统计固定为上述95原始需求中已确认阻塞必要闭环的集合。非C扩展的证据阻塞不加入该数；完整产品仍受8.1及附录全部原ID证据闸门约束。
## 6. 产品树、原业务域与三维交叉映射

以下保留Inventory的18个业务域，不将示例树当新产品定义；括号为原Master归并模块及C编号。跨域相同C只拥有一个业务Function，多页引用不复制执行链。

~~~text
CrazyWater Platform
├─01 平台与账号 [M0：C001–005]
│ ├─账号/凭证/Session/Runtime/世界区服
│ └─配置、账号切换和生命周期 [同时服务全部业务]
├─02 数据浏览/Explorer [M1：C004/C005及各领域只读C]
│ ├─48查询/27解析/21原始、可靠性、精度、来源
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

### 6.1 全部42项Pxxx

| P ID | 原页面/面板 | 当前UI维度 | 需求/施工 |
|---|---|---|---|
| P0-1 | 账号列表/扫码添加 | PARTIAL：列表已有，扫码隐藏且捕获路由403 | C001/C002；W03 |
| P0-2 | 账号配置 | PARTIAL：规则/模块配置已有，未覆盖全业务 | C002；W03/W21 |
| P1-1 | 数据中心总览 | EXISTING_UI | C004；W03 |
| P1-2 | 建筑生产 | PARTIAL：队列有，完整当日图表缺 | C101/C111/C112；W04 |
| P1-3 | 英雄阵容 | EXISTING_UI：英雄预览+独立Formation | C211/C212；W06/W08 |
| P1-4 | 舰队地图 | PARTIAL：Fleet/当前观察有，非完整业务地图 | C401/C403；W14/W15 |
| P1-5 | 活动联盟 | PARTIAL：联盟详情有，活动聚合缺 | C301/C501；W09/W16 |
| P1-6 | 原始响应浏览器 | EXISTING_UI：当前48项，原表27为旧口径 | C004/C005；W03 |
| P2-1 | 建筑管理 | EXISTING_UI：已有槽位/候选/不可升原因 | C101–104；W04 |
| P2-2 | 资源生产 | PARTIAL：队列/策略已有，完整日报缺 | C111–116；W04 |
| P2-3 | 居民规则编辑 | EXISTING_UI | C125/C127；W04 |
| P2-4 | 居民订单预览 | EXISTING_UI | C121–125；W04 |
| P2-5 | 居民订单执行 | EXISTING_UI：提交+历史；免费刷新安全阻塞 | C126/C128；W04 |
| P2-6 | 贸易港口 | PARTIAL：Fleet通用货船候选已有，专业缺货明细缺 | C131–134；W05 |
| P2-7 | 博物馆寻宝 | PARTIAL：通用详情/出发已有，missing/结算领奖缺 | C141–144；W11 |
| P2-8 | 海面扫荡 | NOT_IMPLEMENTED：日常CLI不等于独立页 | C151；W12 |
| P2-9 | 钓鱼 | NOT_IMPLEMENTED | C152；W13 |
| P3-1 | 主线运行 | PARTIAL：已有运行/倒计时，stopOnDefeat只透传无独立开关 | C201/C204/C205；W08 |
| P3-2 | 阵容对比 | EXISTING_UI：原战报details | C206/C207；W08 |
| P3-3 | 战斗分析 | EXISTING_UI：保守统计，长期比较待扩展 | C208；W08 |
| P3-4 | 自动换阵 | PARTIAL：职业布局建议，无自动闭环开关 | C209；W08 |
| P3-5 | 阵容管理 | PARTIAL：保存/模板/恢复有，极限复制缺 | C211–215；W08 |
| P3-6 | 英雄列表 | PARTIAL：基础等级/星级/技能有，专武纹章装备视图缺 | C221–230；W06/W07 |
| P3-7 | 英雄操作 | NOT_IMPLEMENTED：旧Web写被拒 | C221–230；W06/W07 |
| P4-1 | 联盟成员/求助单 | EXISTING_UI：通用详情可用 | C301/C302；W09 |
| P4-2 | 捐赠配置 | PARTIAL：member/item规则有，真实限额闭环阻塞 | C303/C304；W09 |
| P4-3 | 自动求助配置 | PARTIAL：配置存在，ask无可执行候选 | C305；W09 |
| P4-4 | 联盟科技 | NOT_IMPLEMENTED：只有Explorer原始数据 | C306/C307；W10 |
| P5-1 | 舰队编组 | PARTIAL：通用参数/候选保存有，专业表格不足 | C401/C402；W14 |
| P5-2 | 城战委托单船 | PARTIAL：维修/移动有，攻击与道具加速缺 | C406–408；W14 |
| P5-3 | 钻石规则 | NOT_IMPLEMENTED，D6明确EXCLUDE；保持禁止 | C409；W01验拒绝 |
| P5-4 | 监听跟随 | PARTIAL：一次观察筛选有，无持续事件流 | C404/C405；W15 |
| P5-5 | 动态决策 | PARTIAL：三值规则有，无攻击计划 | C410；W15 |
| P6-1 | 活动列表 | PARTIAL：原始数据/部分日常展示 | C501–503；W16/W17 |
| P6-2 | 日常清单 | PARTIAL：旧预览有，7项业务统一执行/定时缺 | C511–517；W16/W17/W20 |
| P6-3 | 海商王 | NOT_IMPLEMENTED | C521–524；W18 |
| P7-1 | 工作流画布 | PARTIAL：节点表单/连线/SVG/JSON有，拖拽及全量目录缺 | C607/C602；W02/W20 |
| P7-2 | 工作流运行 | EXISTING_UI：有限图当前状态；统一所有Runner待W19 | C605/C606；W19/W20 |
| P7-3 | 历史/跨轮记忆 | PARTIAL：图/批次历史有，持久记忆缺 | C604/C606；W19 |
| P8-1 | 账号默认设置 | PARTIAL：订单/生产/玩法独立配置已有 | C002；W03/W21 |
| P8-2 | 敏感操作确认 | PARTIAL：具体批次确认有，统一风险分类缺 | D4/D6；W01/W02 |
| P8-3 | 全局调度 | NOT_IMPLEMENTED：有限图不是通用日周调度 | S1–S8；W20 |

### 6.2 调度方式及冲突修订

| S | 当前实现 | 交付扩展 |
|---|---|---|
| S1 手动 | Stage/账号/CLI/具体Operation | 统一门控；保留敏感操作显式确认 |
| S2 单次 | Actions、Operation批次、有限Stage Function | 所有业务共用原Service/效果验证 |
| S3 轮询 | 缓存UI轮询、旧Loop、业务显式survey | 有界计划轮次；缓存3秒≠向游戏每3秒发48查询；统一时效/预算 |
| S4 长时 | 成熟StageRunner | 持久事件、finite limits、同账号锁，不重写Runner |
| S5 定时 | 无通用持久日/周scheduler | 上海时区/日界/错过策略/禁用默认/重启不自动执行未授权写 |
| S6 事件 | Socket推送/SSE日志存在 | 业务事件身份/去重/游标/有界触发；推送≠可靠最终效果 |
| S7 工作流 | 有限DAG顺序/条件/等待/逐ACTION授权 | 全目录/总预算/有界调度；不加任意脚本和图内无限环 |
| S8 条件 | OrderRules/Naval三值/planWorld | 复用业务规则；事实UNKNOWN不派发，规则PASS不等于授权 |

原表C205“限频等待重试”、C409“批准钻石”与D6/D8冲突，以baseline和本轮保护要求为准：限频独立停止，钻石一律拒绝。记录兼容影响，不改原表。挂机持续执行的未来run授权需有账号、函数白名单、总预算、期限、次数和取消，不能把当前一次permit复制到下一批。该新合同未获后续开发批准前，沿用逐批确认安全模式；可并行完成其他业务。

## 7. 现有Function复用矩阵

| 现有Function/当前源码 | 现有调用者 | 最小接口扩展 | 新业务调用者 | 必需测试 |
|---|---|---|---|---|
| GameClient.request/sendWatch/markUnverifiedWrite/confirmWatchedWrite（client.mjs:211/266/331/338） | 全部传输 | 只增脱敏时序/provenance hook；不换关联算法 | Hero/Trade/活动适配器 | client-lifecycle/unverified+新协议codec |
| newSession/sessionFor/cancelSession/assertCurrent（server.mjs:91/115/163/199） | Web/Stage/Workflow | 单写所有者、统一gate、只读reconcile context | 全业务 | server-runtime/gameplay-locks/跨进程故障 |
| collectState/summarize/exploreSnapshot/cachedClient（game.mjs:98/131；server.mjs:367） | Snapshot/Explorer/preview | sourceAt/serverTime/scope/version；附加查询登记用途 | 活动聚合/数据视图 | catalog/snapshot-precision/data-safety |
| ACTIONS/buildBody/assertAllowed/runAction/assertPaymentAllowed（actions.mjs:315/324/335/277） | CLI/world/旧驱动 | 命名精确成本policy；Trade合法币种不可全局移除Buy拒绝 | 业务adapter | actions-safety/D6协议注入 |
| ResourceLedger/resourceCosts/stockFromResponses/validateResources（resource-ledger.mjs:52/38/24/84） | World/Hero/City/Order/Gameplay | 父run预算、保留线、离散UID/配额独占声明、成本来源 | 成长/捐赠/扫荡/Trade/Workflow | 跨模块争用、UNKNOWN保留、旧余额不补回 |
| assertExecutionActive/awaitExecution/executionDelay/executionOutcome/stopsExecution（execution.mjs:2/28/51/10/23） | 所有现有执行器 | 复用signal/stop，事件游标取消hook | 轮询/定时/跟随 | 执行前/中/后取消、迟到、限频 |
| createOperationService（operation-service.mjs:32） | City/Orders/6玩法/Stage Function | dependencyVersions、facts provenance、统一adapter、parentBudget、恢复上下文 | 所有新业务/旧CLI安全桥 | operation-service/adapter集成/API门控 |
| executeBusinessOperation（business-functions.mjs:12） | 6玩法 | domain verify/响应证据schema，不嵌领域决策 | Hero/Trade/Activity/Fishing | typed成功但无效果→UNKNOWN |
| createExecutionHistory（execution-history.mjs:16/43） | OperationService | 追加恢复事件/所有者写串行、run-node-action关系/兼容迁移 | Stage/CLI/Workflow/Scheduler | 原子失败/损坏/旧版/崩溃/多进程丢更 |
| surveyWorld/planWorld/runWorld（world.mjs:86/209/469） | City/Orders/CLI/Loop | 接wrapper，不让页面直接runWorld当成功 | 港口缺口/生产/世界 | resource-budget/city/order |
| surveyOrderExecution/planOrderExecution/executeOrderOperation（order-execution.mjs:92/104/146） | OperationService | 权威免费proof来源、金币reward provenance | 订单节点/生产需求 | 同index换单/免费额度/成本变化 |
| surveyCityOperations/cityView/planCityOperations/executeCityAction（city-operations.mjs:38/131/167/221） | 页面/Operation | registry adapter外壳；覆盖可靠新增状态 | City/Production节点 | 原集成预算+复读 |
| productionShortages/selectProductionCandidates/summarizeProductionHistory（production-policy.mjs:61/101；production-report.mjs:36） | 生产页/日报 | required/have/missing通用展示；完整事件覆盖另证 | Port/Museum视图、报表 | 缺字段不假零、日期/时区/去重 |
| planHeroes/runHeroPlan（heroes.mjs:66/221） | CLI/预览/Loop | 保留请求构造，增加operation adapter与AllHero权威verify | Hero节点/P3-7 | 逐级成本、typed/静默未复读、换账号 |
| surveyDailies/runDailies/claimDailies/surveyTasks/runTasks | 旧CLI/Loop/只读页 | domain adapter、权威claim状态、统一配额/记忆 | 统一清单/活动节点 | 免费/VIP/周活动资格隔离 |
| survey/plan/verifyFormation、battleAnalysis（formation.mjs:98/161/170/198） | Formation/Stage/Fleet | 推荐规则/复制映射/战报源身份 | 自动换阵/极限复制 | 保存前后完整英雄/站位/pet/迟到 |
| allianceHelpRules/planAlliance（alliance.mjs:36/137） | Alliance | 权威quota/cooldown/season输入，不能接受UI自报 | C303/C304/C305 | 真实survey固定null阻塞测试+证据路径 |
| survey/plan/verifyMuseum、Fleet、Treasure、evaluateNavalRules | Gameplay/Workflow | pending身份、missing、道具/攻击scope、持续观察契约 | W11/W14/W15 | 领域专项及共享业务执行测试 |
| createStageRunner/parseStageResult/createStageFunction（stages.mjs:114/85；stage-function.mjs:15） | Standalone/有限节点 | 统一history/gate、配置表单；保留LEFT模式 | Battle/Workflow/Scheduler | 原Stage所有回归不弱化 |
| validateWorkflow/createWorkflowRunner/createWorkflowStore（workflow.mjs:36/110/206） | 工作流UI/API | registry schemas、父预算、有界重复调度外壳、恢复状态 | 全业务图 | 循环拒绝/单次授权绑定/停止/重启 |
| createCliOutput/redact/validateCredentials（cli-safety/security） | 全CLI/日志 | 所有新诊断复用安全sink，先脱敏后截断 | 新工具/历史导出 | 合成秘密全格式不泄漏 |

### 7.1 参考实现复用边界

本地参考C:/Users/zyk-o/Documents/crazywaterword已核HEAD=6c2825a4d7dda17bf894b45744d2fd39e6a05499，status空。heroGrow.mjs:235/629/1063有survey/计划/行模型，:190成本/上限算法；tradeKing.mjs:202/224/585/628有价格、卖点和计划；tradePort.mjs:86/178/195有缺货视图/需求/计划；youdu.mjs:71/123/214/378/429/481有活动子流程。当前目标部分贸易港口已由Fleet提取，不再搬整套tradePort。

参考heroGrow有自己的makeBudget和无阵容时扩大到所有英雄的回退；Trade计划会基于预计卖出收入排买入；不得原封复制。提取纯算法后适配当前Ledger，只有卖出权威确认且新授权/父预算允许才可使用收入。参考client/server/loop绝不覆盖当前保护。Museum旧版本作者身份未确认，未联网取资料，不把参考占位判成协议失效。

## 8. 架构、重复实现与公共前置

公共标准保持：SURVEY → PLAN → VALIDATE → AUTHORIZE → EXECUTE → VERIFY → PERSIST；每阶段有来源/代次/结果。业务适配器拥有领域规则与验证，OperationService拥有计划许可/锁/预算/历史，GameClient拥有传输关联，Workflow只编排调用，页面只编辑参数/展示候选/提交ID。

| 问题与证据 | 影响 | 精确扩展/不变量 | 工作包 |
|---|---|---|---|
| UNKNOWN持久阻断，但acquire也用于survey（operation-service.mjs:45/72/92）；无解除API | 缺可靠恢复产品链，当前无法靠正常业务survey完成reconcile | 独立只读恢复context读原identity→权威复读→APPLIED/NOT_APPLIED/STILL_UNKNOWN→追加事件；原UNKNOWN不抹掉，证据不足不解锁 | W01 |
| Session/lockOwners/runs为内存；CLI可另建Client；History put为读改写rename | 同进程隔离≠多进程/NAS单写，原子rename不防丢更新 | 默认选择单服务写所有者+CLI委托/拒绝独立写；Owner要多服务才选租约/CAS；必须有崩溃/NAS失败测试 | W01 |
| standalone stages/start只有confirm/config，未复用operations Origin/CSRF | 平台授权门控不一致 | 抽最小共同gate供Stage和operations；不批量解禁旧Web白名单 | W01 |
| 旧Hero/Tasks/Dailies/World/Loop typed存在即可SUCCESS/无统一History | 响应成功≠效果成功，重启失忆 | adapter包装已有Function，按权威验证和持久History确认；不另造业务发送器 | W02/W06/W16/W19 |
| Registry仅6模块+stage；capabilities默认[]、source默认null | city/order/production不能作为图节点，schema/Cxxx/权限/验证元数据不全 | 扩静态目录和现有survey/view/plan/verify；只注册可信实现，不允许JS/任意Request | W02 |
| Workflow每ACTION新plan/新Ledger | 单批预算≠整图累计预算，重复新批可突破run总上限 | runBudget父范围只减不返UNKNOWN，子许可绑定具体动作；配额/物资/UID使用统一声明 | W02/W20 |
| 任意玩法都绑定订单rules/productionPolicy hash（operation-service.mjs:145–168） | 改无关规则导致阵容/联盟计划失效，保守但耦合 | adapter.dependencyVersions声明真实依赖；旧行为兼容过渡，相关变更仍失效 | W02 |
| 同一次survey/read/validateResources存在重复查询 | 成本/性能增加，但用途不同 | 同阶段可带provenance复用；派发前余额/派发后效果必须新鲜，不用缓存去掉安全复读；同Response类型串行保持 | W03 |
| alliance/museum可信serverClockOffset；fleet/treasure/naval部分Date.now | 日界/冷却/可用次数可能不一致 | 统一可信clock/provenance/scope和最大误差；缺可靠时钟不授权时间敏感动作 | W03 |
| OperationService有orders/city特判、设置/阵容证明/图owner/日报 | 职责增长，但当前约260行不构成重写理由 | 新域走adapter，逐步缩专用分支；不预建空架构/大拆目录 | W02 |
| Stage计时、executionDelay、Workflow WAIT各有循环 | 部分合理领域差异；新页面自行定时会分叉 | 保留原Stage状态机；普通等待复用executionDelay；有界重复由同scheduler而非每页面Runner | W20 |
| UI已有JSON技术参数、专业业务表不足 | 原P页面“可配置”≠最终产品易用性 | 业务表单/控件调用同Function；技术JSON保留高级查看，常规流程解释决策/成本/原因 | W21 |
| 协议/配置/地图资源ignored | clone无资产不代表可交付/测试可复现 | W03生成来源/版本/哈希/离线恢复说明，缺资产显式阻塞；不下载新资源代替本轮审计 | W03 |

协议bundle SHA256=ef6137ef923f0b8b44b10379effe0ac2b3555ffab18b278e03e97b19bf4a4dcc；config SHA256=0809253d78b00a81ebb78ab9fc8b94668372f6b8a08430144710325a165da762，本轮本地哈希复核一致。Fishing/VIP/Week/Exclusive/Badge/Equip/Trade请求已通过只加载loadProtocol类型表确认存在，没有创建GameClient或游戏Runtime；类型存在不消除业务证据障碍。

### 8.1 全Inventory交付边界及非C工作包补充

完整产品范围以95项原始Cxxx、原Inventory全部目标能力及其参考子项共同构成。没有Cxxx编号不等于可选，也不因只剩协议/客户端证据就从计划移除。273个Inventory条目继续逐项保留；它们有重复和分层，不能算作273项独立业务需求。下表将目前未实现或部分实现的非C业务明确纳入既有工作包，不新造C编号、不增加目录、不复制参考整模块。证据未齐的能力保留BLOCKED_EVIDENCE并设前置闸门；已授权的独立业务继续连续开发。Owner决策用于裁定真实语义冲突、D6允许路径不存在或确认修改原产品要求，不作为默认将非C整体移出范围的前置批准。

D6始终排除钻石支付、购买付费礼包、testAccount/superToken等开发凭证。任意JS/任意协议写接口不属于需求允许的工作流能力，不实现。道具、普通材料、已有权益、免费奖励、只读和本地算法按证据及授权进入交付；名称含加速/解锁/领取不自动等于付费。必须按具体客户端成本/资格路径判定，证据不足保持阻塞而非偷偷排除。

| 原Inventory ID / 补充能力 | 主工作包 / 共享工作包 | 当前可复用Function | 必需扩展与验收边界 | 证据闸门 / D6排除 | 最终真实E2E归属（组内分支） |
|---|---|---|---|---|---|
| BIZ-R05 联盟商船补货/应聘船长 | W09；W14舰队占用与W02目录 | 目标surveyAlliance、surveyFleet与BusinessExecutor；参考guildShip survey/view/plan | 商船/crew身份、货物需求、英雄船长资格/空位、补货/应聘各自plan/verify；同物品和英雄UID共用预留；不能把港口cargoFill等同GuildShipOrder | GuildShipOrder/GuildShipSeek客户端完整body/资格/费用与权威复读来源；钻石补货/买位分支排除 | 联盟E12+舰队E17/E18各增加补货与应聘分支 |
| BIZ-R07 装备厂制造/收取 | W07；W04工厂状态/W19历史 | 参考surveyEquip/planEquip，目标city survey/Ledger/Operation | MakeEquip与PickMadeEquip独立适配；部位/配方/队列/材料/装备实例权威复读；收取未确认不得继续制造 | 普通配方材料可做；universal参数的真实语义须核验，不能默许用钻石补料 | 英雄高级E09增加制造/收取和UNKNOWN分支 |
| BIZ-R08 海兽培育/投喂/成熟收取 | W07独立子边界；W02/W19 | 参考surveyPet/planPet；现有AllPet读取、原共享executor | 补海兽领域survey/plan/verify，不挤进英雄大函数；PetBreed/PetFeed/GetMaturePet分开确认，队列/品质上限/素材/实例UID共享 | 普通材料/金币来源有据；付费补料或未知universal成本阻塞；不得因无C号删掉此能力 | 英雄高级E09增加海兽三种原子动作及重启恢复分支 |
| BIZ-R09 除C225–230外的装备/徽章精炼、升星、穿戴等参考分项 | W07；W02/W19 | 参考heroGrow实际已定义的plan分支；目标planHeroes及Ledger | 按原Inventory消息列逐项拆明PutOnBadge/BadgeStar/EnhanceBadge/PutOnEquip/EquipRefine/EquipStarUp等；共用同一Hero adapter，不另造执行器；实例转移和不可逆消耗精确授权 | 仅纳原清单实际描述的分项，分解等未列新需求不得顺手扩域；付费补齐排除；缺成本/归属阻塞 | E09内按原子分支列检查清单，不以六C通过代替其余分支 |
| BIZ-R10 挂机/邮件完整依赖计划 | W16；W19 | 原ACTIONS、planLoot、参考surveyIdle/planIdle/runIdle；目标runTasks | 补邮件分页/已读附件资格和权威领取；挂机收益先确认再允许升级，挂机等级奖励/升级分别复读，失败隔离但UNKNOWN不续写 | 普通挂机徽章成本纳预算；广告/付费替代有成本未知则不派；邮件登录信息不进入历史 | 基础日常E15增加分页、收益→升级依赖、无资格/已领分支 |
| BIZ-R11、PRO-009 世界宝藏货轮完整业务 | W14独立TreasureLoot子边界；W15观察/W19历史 | 现有surveyTreasure/planTreasure/verifyTreasure与fleet事实 | 保留已做无争夺派舰；补按原世界宝藏语义所需争夺结果/目标归属/次数/奖励闭环，分别确认派遣、服务器结果、目标状态和奖励；不能用派遣分配成功替代抢占成功 | 赛季/次数/战斗模式、返回身份和权威战果/奖励来源先证实；不复用主线LEFT；钻石购买次数排除 | 世界宝藏E24内拆无争夺、争夺、有/无奖励、同目标竞争与UNKNOWN |
| BIZ-R12、BIZ-R12a 城战在线免费奖 | W14；W19 | 原fleet维修/移动；参考claimWarOnlineReward | 补在线奖励资格/服务器时间窗、GotWorldOnlineRwdRequest→GotRewardResponse正确关联、空奖/已领停止；与攻城/移动合同分开，非普遍任意领奖接口 | 在线资格和权威领取标志缺失先证据闸门；免费在线奖不属于D6排除 | E18增加在线免费奖资格/空奖/重复/超时分支 |
| BIZ-R14 工厂独立视图、自选材料包覆盖 | W04；W02/W19 | 当前cityView/productionShortages/production policy；参考packCoverPlan/exchangePacks | 补包内候选覆盖算法、白名单包资格/持有量、SelectPack参数/消耗/新库存双证据；独立工厂视图共用原city链；不能自动打开全部包 | 包本体与目标材料成本需可靠；免费持有包使用不自动排除，购买缺包/付费替代排除 | 城市生产E05/E06增加有限自选包→排产依赖和UNKNOWN不排产 |
| BIZ-R15 漂浮物拾荒、礼包码领取 | W16；W04海面读模型 | 参考pickUpFloater/giftCode；目标runAction/BusinessExecutor | 真实floaterId/过期/拾取复读；礼包码trim且不误改内容，资格/返回/奖励权威确认，禁止日志记录不必要秘密；均注册具体函数 | 不伪造Diving奖励或floaterId；真实客户端/本地协议来源先核验；付费礼包购买排除，合法免费礼包码属于范围 | E15增加拾荒/免费礼包码有效/已用/过期与UNKNOWN分支 |
| BIZ-R16a 农田专用状态解析 | W04；W03可信数据 | OnWater原始、参考farmOf | 恢复farm产物/成熟时间/autoFarming/地块身份，失败不变零，纳现有surveyWorld领域投影 | FarmlandPlantCfg与原字段来源/单位先确认；不重复48查询 | E06增加农田状态/未知/跨日分支 |
| BIZ-R16b 农田成熟收取 | W04；W02/W19 | 参考farmHarvest、现有runWorld/BusinessExecutor | FarmHarvest批量buildingId严格数组；成熟资格、地块状态变化及奖励/库存确认；原typed响应实际存在须核对使用 | 收取数量单位是地块，不编造真实奖励件数；无可靠库存变化则UNKNOWN | E06增加成熟收取与多田预算/错地块/UNKNOWN |
| BIZ-R16c 农田种植/供给 | W04；W02/W19 | 参考farmPlant、原ResourceLedger | 空地/已收田→种子预留→按作物构造FarmPlant args；尊重服务端autoFarming，不改游戏自动开关；拒绝冷却账号隔离 | 普通种子材料有据可做；付费补种/钻石加速排除；种植权威状态需确认 | E06增加空地种植/种子不足/队列冲突/取消 |
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
| PRO-001 科技重置 | W10独立子边界 | GuildTechInfo与原Alliance/Operation；ResetGuildTech协议线索 | 原清单包含的重置不整体排除；核权限/费用/返还/等级合同，合法路径独立plan/verify与不可逆影响预览 | 免费/普通材料路径纳入；未知成本BLOCKED，只有付费路径才按D6排除 | E13独立重置/权限不足/未知成本/付费拒绝/返还复读子分支 |

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

工作包是对16产品模块的依赖拆分；同模块可跨阶段施工。建议Function名称是接口意图，实施前必须再次搜索当前Symbol并复用。所有DoD继承D1–D9及第12节治理；任何证据闸门未关闭不得用模拟成功标成真实语义已实现。8.1原Inventory子项是默认完整范围，以下各包逐项接纳，不再另问是否开发无C项。

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
| New Functions | executionMemoryStore与history projection/关联查询；不创建新数据库 |
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
| New Functions | scheduleStore/boundedScheduleRunner最小外壳，调用原Workflow/Operation；禁止任意JS |
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
| Definition of Done | 全部W01–W21工作包DoD与外部证据关闭、集成定向检查和离线验收准备完成；冻结待R7验证提交树及资产；R7全量PASS是后续阶段退出门，不作W22前置条件；R8具体请求/预算届时生成 |

## 10. 依赖DAG、完整顺序与连续开发规则

### 10.1 八个执行阶段

| 新阶段 | 工作包/原阶段来源 | 依赖与阶段退出门槛 |
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
| 异常停止条件 | UID被占/归属变化/缺语义不做；UNKNOWN冻结该实例及预算 |
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
| 前置状态 | 每子场景指定活动/任务/period/奖励ID与资格；扫荡quota可靠；免费/已有权益；招募/AFK/礼包码等独立范围 |
| 请求 | 原命名驱动；VIP真请求而非MonthCard；Week/军备按已确认链；幽都驱邪/罗盘/敕令/签到分开 |
| 预期Response | 实际typed/push逐项；周活跃箱不能代周活动，码兑换无对应typed不猜 |
| 预期游戏状态变化 | 扫荡扣次且目标变化；邮件附件已领；VIP/包/任务领取标志；活动进度；AFK先领取再升级；招募/点金结果 |
| 资源变化 | 次数/券/道具/GOLD/奖励精确核；所有RUBY/付费负分支派发0；扫荡与日常共用额度 |
| 权威复读方式 | DailyTask/Counter/Email/Vip/Week/Season/活动专用读源及物资；每条事件标period |
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
| X02 订单金币 | 当前可靠rewardExp而无可靠rewardGold来源/公式与领取变化 | C124/W04；MIN_GOLD条件保持UNKNOWN，不默认为0 |
| X03 免费刷新 | 真实生产来源缺免费eligibility/quota/cooldown，proofFor合成测试不是来源 | C126/W04；SUBMIT独立可继续，REFRESH无证不发 |
| X04 Museum结算身份 | Complete结果与Reward身份/已领状态、断线后pending可恢复来源 | C144/W11；到期/收益/成就不是探索领奖成功 |
| X05 Fishing全链 | Start/Gain/Reward的前态、杆饵/次数/容量/结果身份、可恢复任务与权威复读 | C152/W13；图鉴不可替代当前任务 |
| X06 联盟真实限额与赛季 | helpAllowance/helpUsage/season生产值固定null；Ask日限/冷却/阈值及订单season来源 | C303–305/W09；分配字段/配置不能由用户输入伪装权威事实 |
| X07 稳定目标定位 | 当前WorldInfo范围有限；跨视野稳定ID、更新范围、消失/移动来源及跟随含义 | C405/C410/W15；只读过滤可用，不能声称全局跟随 |
| X08 攻击与模式结果 | 移动、宣战、参战资格、保护/地图油费、模式专属side/result、胜负与收益 | C406/C410及PRO005/STG017/W08/W14/W15；保持SIDE_UNVERIFIED，主线LEFT不外推 |
| X09 D6内舰队加速 | 已知行军加速客户端为RUBY；修船/货船普通道具路径、成本/身份未证实 | C408/W14；若只有钻石路径，记录D6排除及产品阻塞，不制造合法路径 |
| X10 周/军备活动身份 | 周补给与周活跃/军备各自activityId/period/档位/资格/领取源，不能互相代替 | C514/C517及C515/516补链/W17；过季保留fixture，真实分支未遇保持未验 |
| X11 Fleet非零Pet | OnWater宠物绑定/舰队归属精确字段、UID与完整保存复读 | C402受限分支/W14；已有无非零Pet编队不重写，不能把原需求自动缩小 |
| X12 联盟商船/Fort | GuildShipOrder/Seek具体body、船长空位资格、费用/crew身份、Fort独立前置及进度 | BIZ-R05/PRO002/W09；cargoFill不等GuildShip、Aid不等Fort |
| X13 装备厂/Pet/其余养成 | 原参考分项的universal成本、队列、实例归属、普通材料路径及效果 | BIZ-R07/R08/R09/W07；只迁移纯算法和明确分支，不能搬独立预算/客户端 |
| X14 农田/包/委任 | 原田块状态/成熟单位、作物配置、委任减时公式、种子成本、SelectPack候选与扣包得料 | BIZ-R14/R16a–h/W04；水位是用户策略，非服务器事实；包不明不自动打开 |
| X15 其他阵容/藏品 | 模板图纸解锁成本、各模式槽位/队伍/pet字段；藏品培养兑换精通的前置与物资 | FRM005/PRO010/PRO007/PRO001/W08/W10/W11；具名队伍是可设计本地合同，非猜游戏专用请求 |
| X16 世界宝藏/资源田 | 派舰后争夺/占有/战果/结算奖励、赛季/次数、资源田占领/放弃权威身份 | BIZ-R11/PRO009及原资源田/W14；派遣成功只确认派遣 |
| X17 免费日常增强 | 邮件分页/附件、挂机领取依赖、floaterId、合法礼包码、在线免费奖、招募/点金/试炼真实资格 | BIZ-R10/R12a/R15及原子Action/W14/W16；不创建任意领取接口，不自动转付费 |
| X18 季节活动局身份 | R17a–h开放期/活动券/贡品、敕令session/rune合法0/答案来源、累计奖与签到权威已领 | BIZ-R17a–h/W17；缺答案不随机作答，未知开局不重复开，未遇真实活动不标已验 |

14是原95项必要闭环的BLOCKED_EVIDENCE需求数，不是X表行数，也不是全部Inventory未知原子分支数量。X01–X18是一组或多组需求共享的证据任务，不能相加计算新需求。缺证据不删除原ID，不把NOT_EXERCISED改通过。只有外证阻塞的子分支停止，已有合法依赖与独立模块继续施工。

### 12.2 风险与处理优先级

| 风险 | 影响 | 前置措施 / 验收门 |
|---|---|---|
| P0 UNKNOWN没有权威解除入口 | 重启后正确阻断但产品无法恢复，误清锁会重复写 | W01追加证据式恢复；原历史/预算保留；E21/E22 |
| P0 多进程/NAS写所有者缺口 | 单账号多Client或丢失history更新，破坏预算与许可隔离 | W01单服务写所有者/CLI委托；双进程/NAS断连离线测试；E23 |
| P0 授权/支付边界 | Stage门控差异、新节点可能绕旧白名单，D6可能被H确认误解 | 最小共用gate；命名adapter及静态schema；钻石/开发凭证硬拒，E20负向 |
| P1 单批预算不是run总预算 | 多节点/多轮累加越过总额，预计收入提前使用 | W02父预算/子预留/UNKNOWN不返；W20累计集成 |
| P1 历史只读通过被说成真实写通过 | 导致Owner无法判断实际交付风险 | 每条证据绑定Git/工作树/资产/动作和四层结果，PHASE2升级重列E03 |
| P1 心跳首Pong历史失败 | E01尚可能先阻断最终所有业务真实验收 | W03离线FakeClock/loop delay与脱敏时序；无因果证据不改阈值/Token |
| P1 证据及活动季节性 | 部分业务不能凭协议名完成或当期无法真实验 | X任务提前静态并行，R7与R8分别记录；季节分支未验证不能宣称完整真实交付 |
| P1 ignored资产不可复现 | 克隆/新环境缺协议配置地图，测试和运行无可靠基线 | W03本地来源manifest/哈希/恢复说明；缺资产fail-closed |
| P2 UI/单Service职责增长 | 多页重复决策或再建执行器，提高维护与安全成本 | adapter拥有规则，页面只展示，公共文件单人集成；仅扩真实缺口接口 |
| P2 需求口径冲突 | 无限循环/自动重试与D8/D9、有成本解锁与D6冲突 | 有界scheduler/明确限频停止；原ID保留，调整原因兼容性写变更记录，不偷改需求 |

### 12.3 Owner决策登记（本轮不请求真实操作许可）

| ID | 审阅点 | 路线图的默认处理 / 需要决定的边界 |
|---|---|---|
| O01 全产品范围与计数口径 | 原95C、全部原Inventory目标与参考子项、42P及8S均纳计划，273不作为独立需求相加 | 默认完整范围，不要求逐个无C项再次批准。仅全新未在原资料中的需求另列变更；本轮不自行开发 |
| O02 无权威全量日报 | 若X01证实服务器/客户端无法提供完整全来源日量 | 保留C112未完成；可由Owner明确将需求改为工具确认产量并调整基线/DoD，不能默默把partial当完成 |
| O03 只有付费实现路径 | X09或其他具体分支若证实仅RUBY/付费 | D6不可解除；Owner可接受禁用描述及明确范围排除，或保留产品阻塞。H确认不能让付费合法 |
| O04 自动化产品合同 | 原需求含自动切阵/日周/重复运行，现有每ACTION暂停授权 | 推荐保留逐批模式并新增一次有限run合同：账号、能力白名单、具体策略、期限/最大轮次/时长/资源累计上限、撤销与重启不续；不授无限未知动作许可。路线图审阅确认合同后连续实现 |
| O05 部署写所有者 | 当前是本地Console/NAS文件 | 推荐单服务唯一写所有者+CLI委托，避免先建分布式系统；若要求多服务并发，先调整W01为租约/fencing/CAS并重新评估依赖 |
| O06 “极限通关”复制源 | C215有原定义但当前无可信源模型 | 先定义合法源战报/同账号/英雄映射、缺英雄处理与预览；本地算法和fixture可先做；不猜未证实查询或随机换英雄 |
| O07 最终真实验收范围 | R8具体账号、目标、次数、预算、不可逆动作、恢复/清理、活动可用窗口 | R7通过后生成当时新鲜候选的具体清单，再取得一次统一验收范围授权；本报告与历史过期许可不能代替 |
| O08 过季/未自然出现异常 | 活动窗口、真实败北/限频/账号失效/UNKNOWN可能无法安全重现 | 离线故障证明照常完成，真实状态保留REAL_UNVERIFIED/NOT_EXERCISED；若Owner接受阶段性交付须明示保留项，不能称全场景真实PASS |

以上决策供Owner审阅总计划，不是让开发每个页面停等批准。已有明确范围的普通实现按DAG连续推进。证据确实无法取得/必须调整需求/要真实账号操作时，才停止受影响分支提出具体事实与可审阅选项。

### 12.4 可连续交给Codex的施工合同

1. 每次开工重新检查cwd/branch/HEAD/status/staged/unstaged/untracked与上轮记录；先读适用AGENTS/TREE及本报告、目标工作包、原ID和当前Function。HEAD变化先分析，不reset，不覆盖或删除用户文件，不自动merge main/push。
2. 一次领取一个边界明确的W包或已声明并行子边界；按第7节复用矩阵搜索Function/调用者/API/UI/测试与成本来源，再提交最小实现方案。仅缺失Symbol才新建，沿用现有目录，不搬整套reference client/server/loop或另建执行器。
3. 按工作包15字段实现。写前可靠状态/精确身份/成本/权限、共享ResourceLedger与Operation、D6、可撤销取消/Abort、迟到和UNKNOWN保护、权威效果复读、持久History不得为赶进度省掉。只读/纯函数不强行制造写历史或预算消耗。
4. 先完成原Function到adapter的必要桥接和对应离线测试，再做页面/节点。每个包保留原断言和失败证据；只能修实现或记录真实需求变更，不能删除/降级测试制造PASS。采用真实本地协议编码与合成状态，无真实Token/连接；缺资产/证据显式失败或阻塞。
5. 实现后运行与变更相关的必要定向测试，记录Git提交/工作树与资产哈希、命令、通过/失败/跳过、首错及未覆盖分支。阶段结束独立提交（未来开发获准后），保留完整原证据和变更兼容性记录；本轮报告不提交。
6. 完成一个包后更新本报告能力账本/接口复用/依赖/DoD状态与交接，自动选下一个依赖已满足且不冲突的包继续。共享文件由集成人顺序修改，不并行复制公共实现。仅受阻子分支留BLOCKED，其他独立包继续。
7. R1–R6每阶段的退出门是实现与必要离线证明，无逐页面真实游戏验收。所有计划内包与外证闭合后冻结树进入R7统一全量离线；R7失败修实现并按影响补测，不能带未明失败进入R8。
8. R7通过后提供E01–E24每个必测子分支的具体账号/目标/请求/预算/耗时/清理清单，Owner审阅授权后统一R8。请求发送、Response、游戏状态变化、权威复读四层分别记录。发生UNKNOWN/限频/首错，停止受影响链保留原证据，不换账号/目标绕保护。
9. 最终产品完成必须同时满足：原需求全覆盖（D6明确禁用分支有记录）、全部Function/调用者/API/UI/权限/预算/生命周期/History闭环、全部计划离线证明、真实矩阵全部必测分支通过或经Owner书面修改交付范围；剩余未验和外证阻塞不能隐藏。

后续交接单最少包含：冻结HEAD/状态；领取W与原C/P/S/Inventory IDs；复用Function及新扩展必要性；依赖已完成证据；修改文件及共享冲突；精确测试与版本；未决X/O及不变量；完成的DoD；下一个可开工W。无需再建立新目录或新编号体系。

### 12.5 本轮文件边界与文档校验

本轮输出仅docs/ROADMAP_RECONCILIATION.md；原五份未跟踪输入、原验收/增量报告与全部work/e2e证据保留。没有生产源码/API/协议/权限/业务规则修改，没有完整测试重跑，没有真实账号/Runtime/Stage/代理/CA操作，没有Git提交或推送。文档静态校验结果在末尾登记，不把文档校验称为功能测试通过。



## 附录A — 原Inventory 273项逐项源码复核（a505019）

本表按原文ID行顺序保留273项；它们是函数、数据、工具、参考子项、协议族的不同粒度，并非273项独立产品需求。原始95个Cxxx按主表计数；非C项按完整Inventory默认纳入对应工作包；Owner只裁定语义冲突或D6无允许路径，不默认移出交付范围。`EXISTING_FUNCTION`仅指该行标题所述Function存在，UI/API及端到端缺口另看profile和覆盖；PARTIAL不继承原报告结论。所有行必须与以下12维profile连读，行内缺口优先覆盖profile。

| Profile | 1 Function | 2 调用者 | 3 GameClient | 4 API | 5 UI | 6 校验/权限 | 7 Ledger | 8 OperationService | 9 ExecutionHistory | 10 取消/超时/迟到/UNKNOWN | 11 离线测试 | 12 真实游戏 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R | 行内状态 | collectState/server cachedClient/对应survey | 读链；缓存浏览不发请求 | 既有GET/显式refresh；条目内只读边界 | 总览/Explorer/既有业务预览；非独立写页 | 账号scope、READY/缓存可靠性 | 读能力N/A | 读能力N/A；Phase3survey可经operation管理 | 只读无业务执行历史；采集outcomes保留 | GameClient读取消+generation；失败不当零数据；无写UNKNOWN | tests/data-catalog,explorer-api,server-runtime,snapshot-precision,data-safety；实际条目专项见主表 | REAL_UNVERIFIED(a505019)；旧4094a69+未提交工作树历史48/48 REAL_VERIFIED，后来纳入61ce3c0；Phase2五查询历史另列，不外推当前完整48项 |
| L | 行内状态 | server/page本地配置/纯计算 | N/A：不新增游戏请求 | 对应本地GET/POST或页面纯交互；不是任意写API | 既有配置/预览/日志页面；缺口行覆盖 | 精确账号、结构校验，敏感本地变更确认 | N/A，纯规则可接账本见行 | N/A（本地配置/展示） | N/A或仅读取；不得称写执行已留存 | 页面account+generation；本地错误显式 | tests/account-view,order-rules,order-rules-store,order-rules-api,order-rules-view,data-safety | REAL_UNVERIFIED；本地UI离线不等于游戏通过 |
| T | 行内状态 | 指定模块/CLI/工具内调用 | 仅底座/指定工具有；纯本地工具N/A | 内部Function或指定安全API；非通用游戏写 | 工具通常无UI；行内已有展示除外 | 参数/凭证/D6/脱敏/路径与归属按模块 | N/A，底座不拥有业务预算 | N/A，底座不当独立执行业务 | N/A，日志/系统journal不等于执行账本 | 底座GameClient/capture有生命周期；本地纯工具N/A；具体工具非统一可取消 | tests/client-lifecycle,client-unverified-write,cli-safety,data-safety,capture-*,mitm-*,proxy-backup；工具selftest历史 | REAL_UNVERIFIED；历史登录/清理证据仅按主报告场景 |
| C | 行内状态 | app CLI/runLoop/已有runAction或runHeroPlan/runDailies/runTasks | 已接请求发送 | 历史业务Web写路由403；读预览不等于写可达 | 预览可有；写按钮隐藏/缺失 | CLI allowMutate+D6；业务前置强弱见行 | heroes/world已接；普通日常/原子act未统一共享预算，须补适配 | 未统一接入（城市订单专用桥见B） | CLI/loop多内存结果；未统一持久 | PHASE1已逐步取消、迟到及UNKNOWN停止；多数旧写缺权威复读，不认静默成功 | tests/actions-safety,dailies-safety,dailies-state-reliability,resource-budget,execution-lifecycle,cli-safety及selftest；缺业务专项不得外推 | REAL_UNVERIFIED |
| B | 行内状态 | operation-service → city/order adapter → 原world/action | 已接原GameClient | /api/operations survey/plan/authorize/execute/stop/history | 建筑/生产/订单执行/历史页 | 精确账号、CSRF、计划哈希、单批一次性授权、fresh precheck、D6 | 是：计划与执行共享，不返还未确认消耗 | 是 | 是：账号级原子JSON、恢复未决保守阻塞 | 是：AbortSignal/generation/UNKNOWN/RATE_LIMITED/迟到保留 | tests/city-operations,order-execution,operation-service,operations-api,operation-adapters-integration,execution-history,production-*；历史609@9d97065，后续845回归范围见主报告 | REAL_UNVERIFIED；9d97065只读/预览部分REAL_VERIFIED，0业务写帧 |
| G | 行内状态 | registered adapter → executeBusinessOperation/OperationService；或WorkflowRunner | adapter survey与写调用；阻塞动作不派发 | /api/gameplay + /api/operations；工作流 /api/workflows | gameplay通用配置/候选/授权页；Workflow有限编辑器 | 精确账号/CSRF、模块严格配置、单批授权、身份/状态/成本复查、D6 | 是；只读/空成本N/A；权威成本缺则阻塞 | 是；纯只读策略无需执行 | 写execute是operation历史；workflow独立store历史；只读survey/view不写业务ExecutionHistory，PLAN不是已执行历史 | 是；UNKNOWN锁/取消/迟到保护继承；未实现动作没有效果确认 | tests/formation,alliance,museum,treasure,fleet,naval-rules,workflow,gameplay-*,stages-formation；历史845+29实现f300a35/记录a505019 | REAL_UNVERIFIED |
| S | 行内状态 | server direct Stage Runner；可选有限stage Function | 已接ChallengeStage | /api/stages + 有限stage节点operations | 主线页面；配置缺口见行 | LEFT仅主线、READY、账号互斥、未决锁、显式授权 | direct主线无材料ledger；stage操作空成本 | 直启独立；有限stage Function可接OperationService | 直启内存200条；包装执行有持久history，不能冒称全Runner已持久 | AbortSignal、runId/generation、迟到保护、RATE_LIMITED停止；发送与效果须区分 | tests/stages*,stage-function,gameplay-locks,gameplay-execution；历史845+29范围见主报告 | REAL_UNVERIFIED(a505019)；历史旧工作树137关成功、B3的156胜/157限频停止受限REAL_VERIFIED；10–11秒及stopOnDefeat战败分支未真实验证 |
| P | PROTOCOL_ONLY或行内PARTIAL | 无目标写调用者；有参考/读探针不计业务写 | 仅底座和可能只读数据；目标写未接 | 无目标写API | 原始Explorer可看不等于业务UI | 业务校验/授权未实现或明确安全阻塞 | 未接目标业务 | 未接目标业务 | 无该写业务历史 | 未形成该写闭环；协议超时规则不能代替业务确认 | 只有协议/codec/读数据可能有测试；无目标业务Offline Verified | REAL_UNVERIFIED |
| N | NOT_IMPLEMENTED或行内PARTIAL | 无该算法/完整业务调用者；附近基础函数行内列明 | N/A或基础数据已有 | 无该完整业务API | 无完整业务UI | 未实现；证据未知应阻塞 | 未实现该能力预算 | 未实现该业务桥 | 无该业务独立历史 | 未实现该闭环，不推定安全成功 | 无该业务专项通过证据 | REAL_UNVERIFIED |

profile中的测试是继承的相关测试族索引，不能把整个族通过当作任一尚未实现分支已通过；本轮只读取未重跑。所有行保留原 Inventory 作为索引，不把旧基线行号当当前证据；本表行内位置均按当前a505019源码重新定位。

| 原ID | 原能力名 | Cxxx / 非C补充项 | 当前Function维度 | 当前实际函数 / 源码证据 | 12维Profile | 关键剩余缺口 / 限制 |
|---|---|---|---|---|---|---|
| PLT-001 | 平台：本机 Web Console | C001 C002 | EXISTING_FUNCTION | createConsole → PAGE; src/server.mjs:48 | L | 平台本机页面已存在；配置入口覆盖仍有限 |
| PLT-002 | 账号列表与状态 | C002 | EXISTING_FUNCTION | loadStore/describeAccount; src/accounts.mjs:57,164; src/server.mjs:309 | R | 账号列表建空Session不等于Runtime |
| PLT-003 | 账号选择/切换活动账号 | C002 | EXISTING_FUNCTION | setActive/pickAccount; src/accounts.mjs:129,135 | L | 切换选择不隐式登录 |
| PLT-004 | 账号重命名 | C002 | EXISTING_FUNCTION | saveStore; src/accounts.mjs:79 | L | 本地账号标签 |
| PLT-005 | 删除账号及会话取消 | C002 C606 | EXISTING_FUNCTION | cancelSession/removeAccount; src/server.mjs:163; src/accounts.mjs:122 | L | 取消运行且保留不确定写历史 |
| PLT-006 | 凭证脱敏元信息展示 | C001 | EXISTING_FUNCTION | describeAccount/redact; src/accounts.mjs:164; src/security.mjs:18 | L | 不公开真实秘密 |
| PLT-007 | 凭证导入、同账号更新和旧单账号读取 | C001 | EXISTING_FUNCTION | accountFromCredential/upsertAccount/saveStore; src/accounts.mjs:36,88,79 | T | 安全CLI可导入；无产品化Web扫码/导入 |
| PLT-008 | 鉴权输入校验 | C001 | EXISTING_FUNCTION | validateCredentials; src/security.mjs:60 | T | 正常账号鉴权；D6禁止开发凭证 |
| PLT-009 | 显式登录和单账号连接 Single-flight | C001 | EXISTING_FUNCTION | connect; src/server.mjs:237; GameClient src/client.mjs:36 | R | 显式connect；single-flight |
| PLT-010 | 显式断开/关闭/失效清理 | C002 C606 | EXISTING_FUNCTION | cancelSession/GameClient.stop; src/server.mjs:163; src/client.mjs:532 | R | 原心跳超时样本保留；清理不是业务成功 |
| PLT-011 | 心跳、序号、ACK/NACK、失效通知 | C001 C005 | EXISTING_FUNCTION | sendPing/tryHandlePong/tick; src/client.mjs:367,372,477 | T | 1000ms首Ping超时需离线诊断而非直接放宽 |
| PLT-012 | 请求关联与迟到响应隔离 | C005 | EXISTING_FUNCTION | request/sendWatch; src/client.mjs:211,266 | T | 迟到/未决保护存在；调用者须验证业务效果 |
| PLT-013 | 多账号 Session、取消和防旧结果写入 | C002 C605 | EXISTING_FUNCTION | newSession/assertCurrent/activeTask; src/server.mjs:91,199,187 | T | 账号级内存隔离；非跨进程锁 |
| PLT-014 | 账号页面请求代次 | C002 | EXISTING_FUNCTION | createAccountViewGuard; src/page.mjs:3 | L | 页面scope/generation防旧结果 |
| PLT-015 | 显式采集和缓存刷新边界 | C004 | EXISTING_FUNCTION | refresh/collectState; src/server.mjs:277; src/game.mjs:98 | R | 48查询采集与缓存浏览分离 |
| PLT-016 | 总览、缓存明细和 Snapshot 导出 | C004 | EXISTING_FUNCTION | overview/cachedClient/summarize; src/server.mjs:328,367; src/game.mjs:131 | R | 21项仍原始；扩展玩法另做读模型 |
| PLT-017 | 实时区服列表 | C003 | EXISTING_FUNCTION | listWorlds; src/worlds.mjs:51 | R | 实时只读区服列表 |
| PLT-018 | 全区服分组和指定区服登录 | C003 | EXISTING_FUNCTION | listGroup/enterWorld; src/worlds.mjs:60,68 | C | CLI已有；Web enter仍403、可能创建角色 |
| PLT-019 | 运行事件和递归脱敏 | C606 | EXISTING_FUNCTION | emit/trace/redact; src/server.mjs:61,76; src/security.mjs:18 | L | SSE有限内存，不等于所有持久运行历史 |
| PLT-020 | Web 游戏写权限边界 | C603 C409 | EXISTING_FUNCTION | route gates; src/server.mjs:646; assertPaymentAllowed src/actions.mjs:277 | T | 新增受控operations/gameplay/workflow路由；旧写白名单仍拒绝 |
| PLT-021 | Stage 状态/开始/停止产品入口 | C201 C202 C203 C204 C205 | EXISTING_FUNCTION | stageView/createStageRunner; src/server.mjs:602; src/stages.mjs:114 | S | 真实挑战和10–11秒限频效果待最终验收 |
| PLT-022 | 独立凭证捕获并导入 | C001 | EXISTING_FUNCTION | runCaptureCli/createCaptureController; tools/capture-credentials.mjs:18; src/capture.mjs:12 | T | 安全CLI；Web旧捕获handler不可直接解禁 |
| PLT-023 | 捕获事务和崩溃恢复 | C001 非C:捕获崩溃恢复 | EXISTING_FUNCTION | recoverCapture/startCapture/stopCapture; src/capture.mjs:138,166,266 | T | 本轮未启动或读真实凭证 |
| PLT-024 | MITM 主机与TLS安全 | 非C:MITM安全 | EXISTING_FUNCTION | createProxy; tools/mitm-proxy.mjs:71 | T | 默认精确主机白名单；不在本轮运行 |
| PLT-025 | CA生成、只读精确查询与归属清理 | 非C:CA归属 | EXISTING_FUNCTION | queryCurrentUserRoot/createCaManager; tools/mitm-ca.mjs:21,84 | T | 只归属receipt清理；本轮未操作CA |
| PLT-026 | Windows代理版本化备份和恢复 | 非C:代理恢复 | EXISTING_FUNCTION | createProxySettings; tools/proxy-settings.mjs:19 | T | 版本化备份/恢复；本轮未操作代理 |
| PLT-027 | B2定向首错诊断与心跳发送白名单 | C001 非C:首错诊断 | EXISTING_FUNCTION | createB2Diagnostics; tools/b2-harness.mjs:4 | T | 真实Phase2首Ping超时留待最终诊断 |
| PLT-028 | CLI账号管理与开发操作 | C001 C003 C603 | EXISTING_FUNCTION | accountsCli/main; src/app.mjs:686,750 | C | CLI独立显式授权；不能等同Web产品完成 |
| PLT-029 | CLI日志/导出安全差异（明确待办） | C001 C002 | EXISTING_FUNCTION | createCliOutput/loadCliCredential; src/cli-safety.mjs:8,49; accountsCli src/app.mjs:686 | T | PHASE1已补普通输出脱敏；危险旧展示不作为可用产品入口 |
| PLT-030 | Protobuf载入和注册器沙箱 | C005 | EXISTING_FUNCTION | loadProtocol; src/proto.mjs:44 | T | ignored生成协议资源需可复现恢复 |
| PLT-031 | 协议帧编解码、LZ4 | C005 | EXISTING_FUNCTION | createCodec; src/codec.mjs:15; compressBlock/decompressBlock src/lz4.mjs:53,7 | T | 传输实现存在不等于业务完成 |
| PLT-032 | 协议字段和消息反查 | C005 非C:协议反查 | EXISTING_FUNCTION | fields/findType; tools/describe.mjs:42,30 | T | 部分嵌套显示unknown需生成源码核对 |
| PLT-033 | 压缩客户端上下文定位 | 非C:压缩客户端定位 | EXISTING_FUNCTION | CLI source; tools/ctx.mjs:1 | T | 纯本地定位工具 |
| PLT-034 | 微信包解密/解包 | 非C:wxapkg解包 | EXISTING_FUNCTION | decrypt/unpack; tools/wxapkg.mjs:10,24 | T | 运行资产不随Git提交 |
| PLT-035 | 本地配置表发现、提取和查询 | C004 非C:配置恢复 | EXISTING_FUNCTION | findConfigPack/extractTables/loadConfig; src/config.mjs:29,38,65 | T | 恢复来源/哈希要求保留 |
| PLT-036 | 固化配置包 | 非C:配置固化 | EXISTING_FUNCTION | CLI source; tools/sync-config.mjs:1 | T | 本轮未同步或访问网络 |
| PLT-037 | 图集提取和本地展示 | C004 非C:图集显示 | EXISTING_FUNCTION | iconIndex/atlasFile; src/art.mjs:16,59 | R | 缺资源可降级 |
| PLT-038 | 图集资源同步 | 非C:图集同步 | EXISTING_FUNCTION | sync-art helpers; tools/sync-art.mjs:44 | T | 本轮未同步或网络下载 |
| PLT-039 | 客户端枚举名称提取 | 非C:枚举名称提取 | EXISTING_FUNCTION | CLI source; tools/build-names.mjs:1 | T | 名称不代表业务Function |
| PLT-040 | 扩展玩法实时只读探针 | C601 非C:扩展探针 | EXISTING_FUNCTION | runDailiesProbe/runWorldProbe; tools/probe-dailies.mjs:8; tools/probe-world.mjs:9 | C | PHASE1已改安全账号/脱敏；非48项Snapshot；本轮不运行 |
| PLT-041 | 登录拒绝在线诊断 | 非C:在线登录诊断 | EXISTING_FUNCTION | CLI source; tools/check-login-failure.mjs:1 | C | 在线工具；本轮不执行 |
| PLT-042 | 离线回归入口 | 非C:离线回归 | EXISTING_FUNCTION | src/selftest.mjs:1; package.json:8; tools/selftest-registry.mjs:1 | T | 历史结果需带提交；本轮未重跑 |
| PLT-043 | 游戏协议全自动发现/通用工作流设计器 | C607 非C:自动协议发现 | PARTIAL | listBusinessFunctions/createWorkflowRunner; src/function-registry.mjs:10; src/workflow.mjs:110 | G | 有限Workflow存在；自动协议发现仍无；目录覆盖6+stage |
| DEX-001 | 48 项查询单次采集 | C004 C005 C601 | EXISTING_FUNCTION | collectState; src/game.mjs:98 | R | 48查询、27解析、21原始共用目录；已有历史离线证据；a505019未真实完整48项验收；旧4094a69+未提交版本历史48/48成功，不能跨版本外推 |
| DEX-002 | 12 域目录与 48 项浏览 | C004 C005 C601 | EXISTING_FUNCTION | DATA_CATALOG/exploreSnapshot; src/data-catalog.mjs:72,91; UI src/page.mjs:1 | R | 48查询、27解析、21原始共用目录；已有历史离线证据；a505019未真实完整48项验收；旧4094a69+未提交版本历史48/48成功，不能跨版本外推 |
| DEX-003 | 27 个现有业务解析视图 | C004 C005 C601 | EXISTING_FUNCTION | DATA_CATALOG/exploreSnapshot; src/data-catalog.mjs:72,91; UI src/page.mjs:1 | R | 48查询、27解析、21原始共用目录；已有历史离线证据；a505019未真实完整48项验收；旧4094a69+未提交版本历史48/48成功，不能跨版本外推 |
| DEX-004 | 21 个无专门解析的原始响应 | C004 C005 C601 | EXISTING_FUNCTION | DATA_CATALOG/exploreSnapshot; src/data-catalog.mjs:72,91; UI src/page.mjs:1 | R | 48查询、27解析、21原始共用目录；已有历史离线证据；a505019未真实完整48项验收；旧4094a69+未提交版本历史48/48成功，不能跨版本外推 |
| DEX-005 | 状态、错误、采集时间 | C004 C005 C601 | EXISTING_FUNCTION | DATA_CATALOG/exploreSnapshot; src/data-catalog.mjs:72,91; UI src/page.mjs:1 | R | 48查询、27解析、21原始共用目录；已有历史离线证据；a505019未真实完整48项验收；旧4094a69+未提交版本历史48/48成功，不能跨版本外推 |
| DEX-006 | 按域、业务名和协议名搜索 | C004 C005 C601 | EXISTING_FUNCTION | DATA_CATALOG/exploreSnapshot; src/data-catalog.mjs:72,91; UI src/page.mjs:1 | R | 48查询、27解析、21原始共用目录；已有历史离线证据；a505019未真实完整48项验收；旧4094a69+未提交版本历史48/48成功，不能跨版本外推 |
| DEX-007 | 安全 JSON 复制/导出 | C004 C005 C601 | EXISTING_FUNCTION | DATA_CATALOG/exploreSnapshot; src/data-catalog.mjs:72,91; UI src/page.mjs:1 | R | 48查询、27解析、21原始共用目录；已有历史离线证据；a505019未真实完整48项验收；旧4094a69+未提交版本历史48/48成功，不能跨版本外推 |
| DEX-008 | int64 精度保留 | C004 C005 C601 | EXISTING_FUNCTION | toSnapshotJson; src/game.mjs:69 | R | 48查询、27解析、21原始共用目录；已有历史离线证据；a505019未真实完整48项验收；旧4094a69+未提交版本历史48/48成功，不能跨版本外推 |
| DEX-009 | 跨账号缓存与迟到响应隔离 | C004 C005 C601 | EXISTING_FUNCTION | DATA_CATALOG/exploreSnapshot; src/data-catalog.mjs:72,91; UI src/page.mjs:1 | R | 48查询、27解析、21原始共用目录；已有历史离线证据；a505019未真实完整48项验收；旧4094a69+未提交版本历史48/48成功，不能跨版本外推 |
| DAT-001 | 库存道具 / 资源与生产 | C113 C123 C221 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:8; DATA_CATALOG src/data-catalog.mjs:22 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-002 | 玩家资源 / 资源与生产 | C113 C123 C102 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:9; DATA_CATALOG src/data-catalog.mjs:23 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-003 | 英雄 / 英雄养成 | C221 C207 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:10; DATA_CATALOG src/data-catalog.mjs:24 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-004 | 英雄阵型 / 英雄养成 | C211 C207 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:11; DATA_CATALOG src/data-catalog.mjs:25 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-005 | 邮件 / 日常与成长任务 | C511 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:12; DATA_CATALOG src/data-catalog.mjs:26 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-006 | 装备 / 英雄养成（收藏与辅助养成） | C229 C230 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:13; DATA_CATALOG src/data-catalog.mjs:27 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-007 | 徽章 / 英雄养成（收藏与辅助养成） | C227 C228 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:14; DATA_CATALOG src/data-catalog.mjs:28 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-008 | 招募信息 / 招募与商店 | 非C:招募 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:15; DATA_CATALOG src/data-catalog.mjs:29 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-009 | 成就 / 日常与成长任务 | C502 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:16; DATA_CATALOG src/data-catalog.mjs:30 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-010 | 每日任务与活跃度 / 日常与成长任务 | C502 C503 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:17; DATA_CATALOG src/data-catalog.mjs:31 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-011 | 每日赠礼 / 日常与成长任务（招募与商店） | C513 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:18; DATA_CATALOG src/data-catalog.mjs:32 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-012 | 主线与支线任务 / 日常与成长任务 | C502 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:19; DATA_CATALOG src/data-catalog.mjs:33 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-013 | 新手引导 / 日常与成长任务 | 非C:新手引导 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:20; DATA_CATALOG src/data-catalog.mjs:34 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-014 | 挂机收益与点金摘要 / 日常与成长任务（资源与生产） | 非C:挂机收益 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:21; DATA_CATALOG src/data-catalog.mjs:35 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-015 | 月卡 / 招募与商店（活动与赛季） | C513 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:22; DATA_CATALOG src/data-catalog.mjs:36 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-016 | 藏品 / 收藏与辅助养成 | 非C:藏品 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:23; DATA_CATALOG src/data-catalog.mjs:37 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-017 | 建筑、生产与居民订单 / 城市建设（资源与生产、居民订单） | C101 C111 C121 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:24; DATA_CATALOG src/data-catalog.mjs:38 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-018 | 鱼类图鉴 / 收藏与辅助养成 | C152 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:25; DATA_CATALOG src/data-catalog.mjs:39 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-019 | 货船 / 舰队与航海 | C131 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:26; DATA_CATALOG src/data-catalog.mjs:40 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-020 | 英雄任命 / 英雄养成 | C221 非C:委任 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:27; DATA_CATALOG src/data-catalog.mjs:41 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-021 | 聊天记录 / 公会与联盟 | 非C:聊天 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:28; DATA_CATALOG src/data-catalog.mjs:42 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-022 | 游戏效果 / 收藏与辅助养成 | 非C:游戏效果 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:29; DATA_CATALOG src/data-catalog.mjs:43 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-023 | 公会摘要 / 公会与联盟 | C302 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:30; DATA_CATALOG src/data-catalog.mjs:44 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-024 | 我的舰队 / 舰队与航海（世界地图） | C401 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:31; DATA_CATALOG src/data-catalog.mjs:45 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-025 | 海盗击杀记录 / 城战与战斗（舰队与航海） | C151 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:32; DATA_CATALOG src/data-catalog.mjs:46 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-026 | 我的资源田 / 世界地图 | C403 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:33; DATA_CATALOG src/data-catalog.mjs:47 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-027 | 公会科技 / 公会与联盟 | C306 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:34; DATA_CATALOG src/data-catalog.mjs:48 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-028 | 公会订单 / 公会与联盟（居民订单） | 非C:联盟订单 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:35; DATA_CATALOG src/data-catalog.mjs:49 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-029 | 阵型预设 / 英雄养成 | C212 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:36; DATA_CATALOG src/data-catalog.mjs:50 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-030 | 赛季任务阶段 / 活动与赛季（日常与成长任务） | C501 C502 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:37; DATA_CATALOG src/data-catalog.mjs:51 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-031 | 世界 Boss / 城战与战斗（活动与赛季） | 非C:世界Boss | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:38; DATA_CATALOG src/data-catalog.mjs:52 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-032 | 限时 Boss 开放信息 / 城战与战斗（活动与赛季） | 非C:限时Boss | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:39; DATA_CATALOG src/data-catalog.mjs:53 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-033 | 宠物 / 收藏与辅助养成 | 非C:海兽 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:40; DATA_CATALOG src/data-catalog.mjs:54 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-034 | 赛季排名信息 / 活动与赛季 | C501 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:41; DATA_CATALOG src/data-catalog.mjs:55 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-035 | 周活动 / 活动与赛季 | C501 C515 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:42; DATA_CATALOG src/data-catalog.mjs:56 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-036 | 关卡状态 / 城战与战斗 | C201 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:43; DATA_CATALOG src/data-catalog.mjs:57 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-037 | 周订单 / 活动与赛季（居民订单） | C515 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:44; DATA_CATALOG src/data-catalog.mjs:58 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-038 | 日常计数 / 日常与成长任务 | C502 C503 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:45; DATA_CATALOG src/data-catalog.mjs:59 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-039 | 雷达 / 世界地图 | C403 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:46; DATA_CATALOG src/data-catalog.mjs:60 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-040 | 环境皮肤 / 收藏与辅助养成 | 非C:环境皮肤 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:47; DATA_CATALOG src/data-catalog.mjs:61 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-041 | 渠道奖励信息 / 活动与赛季 | C501 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:48; DATA_CATALOG src/data-catalog.mjs:62 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-042 | 限时券 / 招募与商店（活动与赛季） | C501 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:49; DATA_CATALOG src/data-catalog.mjs:63 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-043 | 赛季卡 / 活动与赛季（招募与商店） | C501 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:50; DATA_CATALOG src/data-catalog.mjs:64 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-044 | 海盗 / 城战与战斗（世界地图） | C151 C403 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:51; DATA_CATALOG src/data-catalog.mjs:65 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-045 | 玩家头像框 / 收藏与辅助养成 | 非C:头像框 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:52; DATA_CATALOG src/data-catalog.mjs:66 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-046 | Churn 信息 / 活动与赛季 | C501 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:53; DATA_CATALOG src/data-catalog.mjs:67 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-047 | Ultra 开放信息 / 活动与赛季 | C501 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:54; DATA_CATALOG src/data-catalog.mjs:68 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| DAT-048 | 黑名单 / 公会与联盟 | 非C:黑名单 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs:55; DATA_CATALOG src/data-catalog.mjs:69 | R | 这里只确认只读采集/已有解析，原DATA_ONLY维度保留；不证明对应玩法写入 |
| BIZ-A01 | 资源与生产：领取挂机本段收益 | 非C:挂机收益 | EXISTING_FUNCTION | ACTIONS.afkDraw → runAction; src/actions.mjs:52,335 | C | 旧CLI原子Action存在；sendWatch静默不算最终成功；Web未开放此旧路由 |
| BIZ-A02 | 日常成长：领取挂机等级奖励 | 非C:挂机奖励 | EXISTING_FUNCTION | ACTIONS.afkLevelDraw → runAction; src/actions.mjs:59,335 | C | 旧CLI原子Action存在；sendWatch静默不算最终成功；Web未开放此旧路由 |
| BIZ-A03 | 日常成长：提升挂机等级 | 非C:挂机升级 | EXISTING_FUNCTION | ACTIONS.afkUpgrade → runAction; src/actions.mjs:67,335 | C | 旧CLI原子Action存在；sendWatch静默不算最终成功；Web未开放此旧路由 |
| BIZ-A04 | 生产：收取工厂成品 | C116 | EXISTING_FUNCTION | ACTIONS.factoryGain → runAction; src/actions.mjs:75,335 | B | 原子Action存在；经city/orders适配才具授权+复读+持久历史；CLI仍须区分 |
| BIZ-A05 | 城市：收取建筑产物 | C116 | EXISTING_FUNCTION | ACTIONS.buildingCollect → runAction; src/actions.mjs:83,335 | B | 原子Action存在；经city/orders适配才具授权+复读+持久历史；CLI仍须区分 |
| BIZ-A06 | 城市：确认已到期建筑竣工 | C116 | EXISTING_FUNCTION | ACTIONS.buildingFinish → runAction; src/actions.mjs:91,335 | B | 原子Action存在；经city/orders适配才具授权+复读+持久历史；CLI仍须区分 |
| BIZ-A07 | 城市：切换自动工作 | 非C:自动工作 | EXISTING_FUNCTION | ACTIONS.buildingAutoWork → runAction; src/actions.mjs:99,335 | C | 旧CLI原子Action存在；sendWatch静默不算最终成功；Web未开放此旧路由 |
| BIZ-A08 | 生产：设置自动生产产品 | C114 | EXISTING_FUNCTION | ACTIONS.factoryAutoProduce → runAction; src/actions.mjs:107,335 | C | 旧CLI原子Action存在；sendWatch静默不算最终成功；Web未开放此旧路由 |
| BIZ-A09 | 日常：领取单条任务奖励 | C503 | EXISTING_FUNCTION | ACTIONS.dailyTaskDraw → runAction; src/actions.mjs:115,335 | C | 旧CLI原子Action存在；sendWatch静默不算最终成功；Web未开放此旧路由 |
| BIZ-A10 | 成就：领取奖励 | 非C:成就领奖 | EXISTING_FUNCTION | ACTIONS.achievementDraw → runAction; src/actions.mjs:123,335 | C | 旧CLI原子Action存在；sendWatch静默不算最终成功；Web未开放此旧路由 |
| BIZ-A11 | 邮箱：一键领取已读邮件附件 | C511 | EXISTING_FUNCTION | ACTIONS.emailQuickGet → runAction; src/actions.mjs:131,335 | C | 旧CLI原子Action存在；sendWatch静默不算最终成功；Web未开放此旧路由 |
| BIZ-A12 | 日常：领取活跃宝箱 | C503 | EXISTING_FUNCTION | ACTIONS.dailyRewardDraw → runAction; src/actions.mjs:140,335 | C | 旧CLI原子Action存在；sendWatch静默不算最终成功；Web未开放此旧路由 |
| BIZ-A13 | 周常：领取活跃宝箱 | C516 | EXISTING_FUNCTION | ACTIONS.weeklyRewardDraw → runAction; src/actions.mjs:148,335 | C | 旧CLI原子Action存在；sendWatch静默不算最终成功；Web未开放此旧路由 |
| BIZ-A14 | 商店：领取每日免费赠礼 | C513 | EXISTING_FUNCTION | ACTIONS.freeDailyPackDraw → runAction; src/actions.mjs:156,335 | C | 旧CLI原子Action存在；sendWatch静默不算最终成功；Web未开放此旧路由 |
| BIZ-A15 | 月卡：领取每日权益 | C513 | EXISTING_FUNCTION | ACTIONS.monthCardDaily → runAction; src/actions.mjs:164,335 | C | 旧CLI原子Action存在；sendWatch静默不算最终成功；Web未开放此旧路由 |
| BIZ-A16 | 主线任务：领奖 | C503 | EXISTING_FUNCTION | ACTIONS.taskDrawMain → runAction; src/actions.mjs:171,335 | C | 旧CLI原子Action存在；sendWatch静默不算最终成功；Web未开放此旧路由 |
| BIZ-A17 | 支线任务：领奖 | C503 | EXISTING_FUNCTION | ACTIONS.taskDrawBranch → runAction; src/actions.mjs:179,335 | C | 旧CLI原子Action存在；sendWatch静默不算最终成功；Web未开放此旧路由 |
| BIZ-A18 | 居民订单：每日单数档奖励 | C128 非C:订单档奖励 | EXISTING_FUNCTION | ACTIONS.orderDayReward → runAction; src/actions.mjs:187,335 | C | 旧CLI原子Action存在；sendWatch静默不算最终成功；Web未开放此旧路由 |
| BIZ-A19 | 居民订单：交单 | C126 | EXISTING_FUNCTION | ACTIONS.finishOrder → runAction; src/actions.mjs:194,335 | B | 原子Action存在；经city/orders适配才具授权+复读+持久历史；CLI仍须区分 |
| BIZ-A20 | 居民订单：拒单刷新 | C126 | EXISTING_FUNCTION | ACTIONS.rerollOrder → runAction; src/actions.mjs:202,335 | B | REFRESH适配存在但缺可靠免费配额；默认禁止 |
| BIZ-A21 | 生产：开始制造 | C115 | EXISTING_FUNCTION | ACTIONS.startProduce → runAction; src/actions.mjs:210,335 | B | 原子Action存在；经city/orders适配才具授权+复读+持久历史；CLI仍须区分 |
| BIZ-A22 | 城市：升级建筑 | C103 | EXISTING_FUNCTION | ACTIONS.upgradeBuilding → runAction; src/actions.mjs:218,335 | B | 原子Action存在；经city/orders适配才具授权+复读+持久历史；CLI仍须区分 |
| BIZ-A23 | 城市：建造空建筑位 | C104 | EXISTING_FUNCTION | ACTIONS.buildBuilding → runAction; src/actions.mjs:226,335 | B | 原子Action存在；经city/orders适配才具授权+复读+持久历史；CLI仍须区分 |
| BIZ-A24 | 城市：道具加速升级 | C102 非C:建筑道具加速 | EXISTING_FUNCTION | ACTIONS.speedUpUpgrade → runAction; src/actions.mjs:234,335 | B | 原子Action存在；经city/orders适配才具授权+复读+持久历史；CLI仍须区分 |
| BIZ-A25 | 生产：道具加速制造位 | C114 非C:生产道具加速 | EXISTING_FUNCTION | ACTIONS.speedUpProduce → runAction; src/actions.mjs:242,335 | B | 原子Action存在；经city/orders适配才具授权+复读+持久历史；CLI仍须区分 |
| BIZ-A26 | 世界资源田：派舰占领 | C403 非C:资源田占领 | EXISTING_FUNCTION | ACTIONS.challengeField → runAction; src/actions.mjs:254,335 | C | 旧CLI原子Action存在；sendWatch静默不算最终成功；Web未开放此旧路由 |
| BIZ-A27 | 世界资源田：放弃占领 | C403 非C:资源田放弃 | EXISTING_FUNCTION | ACTIONS.giveUpField → runAction; src/actions.mjs:265,335 | C | 旧CLI原子Action存在；sendWatch静默不算最终成功；Web未开放此旧路由 |
| BIZ-W01 | 城市建筑、工厂队列、产物、建造时间读取 | C101 C111 | EXISTING_FUNCTION | surveyWorld/planWorld/runWorld; src/world.mjs:86,209,469 | B | 共享Ledger与城市订单受控适配已接入；原CLI路径不继承Web历史 |
| BIZ-W02 | 库存归并与人口/上限计算 | C113 C123 | EXISTING_FUNCTION | surveyWorld/planWorld/runWorld; src/world.mjs:86,209,469 | B | 共享Ledger与城市订单受控适配已接入；原CLI路径不继承Web历史 |
| BIZ-W03 | 获取居民需求与物品缺口 | C121 C122 C123 | EXISTING_FUNCTION | surveyWorld/planWorld/runWorld; src/world.mjs:86,209,469 | B | 共享Ledger与城市订单受控适配已接入；原CLI路径不继承Web历史 |
| BIZ-W04 | 普通/特殊订单经验 | C124 | EXISTING_FUNCTION | surveyWorld/planWorld/runWorld; src/world.mjs:86,209,469 | B | 共享Ledger与城市订单受控适配已接入；原CLI路径不继承Web历史 |
| BIZ-W05 | 订单金币奖励 | C124 | NOT_IMPLEMENTED | surveyWorld只rewardExp; src/world.mjs:86; evaluateOrder src/order-rules.mjs:113 | N | BLOCKED_EVIDENCE：没有金币奖励可靠来源，MIN_GOLD不得猜测 |
| BIZ-W06 | 收工厂成品与建筑产物计划 | C116 | EXISTING_FUNCTION | surveyWorld/planWorld/runWorld; src/world.mjs:86,209,469 | B | 共享Ledger与城市订单受控适配已接入；原CLI路径不继承Web历史 |
| BIZ-W07 | 到期竣工与空位建造 | C104 C116 | EXISTING_FUNCTION | surveyWorld/planWorld/runWorld; src/world.mjs:86,209,469 | B | 共享Ledger与城市订单受控适配已接入；原CLI路径不继承Web历史 |
| BIZ-W08 | 订单优先交付/低经验缺料刷新 | C125 C126 | PARTIAL | surveyWorld/planWorld/runWorld; src/world.mjs:86,209,469 | B | 旧低经验订单策略与新规则仍两条计划链；新submit已接但refresh默认阻塞 |
| BIZ-W09 | 跨订单与其他计划材料预留 | C123 C113 | EXISTING_FUNCTION | surveyWorld/planWorld/runWorld; src/world.mjs:86,209,469 | B | 共享Ledger与城市订单受控适配已接入；原CLI路径不继承Web历史 |
| BIZ-W10 | 按订单缺口排产 | C114 C115 | EXISTING_FUNCTION | surveyWorld/planWorld/runWorld; src/world.mjs:86,209,469 | B | 共享Ledger与城市订单受控适配已接入；原CLI路径不继承Web历史 |
| BIZ-W11 | 余料升级建筑 | C102 C103 | EXISTING_FUNCTION | surveyWorld/planWorld/runWorld; src/world.mjs:86,209,469 | B | 共享Ledger与城市订单受控适配已接入；原CLI路径不继承Web历史 |
| BIZ-W12 | 可选加速建筑/生产 | C102 非C:加速 | EXISTING_FUNCTION | surveyWorld/planWorld/runWorld; src/world.mjs:86,209,469 | B | 共享Ledger与城市订单受控适配已接入；原CLI路径不继承Web历史 |
| BIZ-W13 | 串行计划执行与失败同类隔离 | C603 | EXISTING_FUNCTION | surveyWorld/planWorld/runWorld; src/world.mjs:86,209,469 | B | 共享Ledger与城市订单受控适配已接入；原CLI路径不继承Web历史 |
| BIZ-W14 | 世界地图资源田资产读取/展示 | C403 | EXISTING_FUNCTION | loadMapAsset/planFieldOccupy/planFieldGiveUp; src/world.mjs:545,595,619 | C | 世界资源田CLI局部链；未接OperationService和最终效果复读 |
| BIZ-W15 | 指定资源田占领计划 | 非C:资源田占领 | EXISTING_FUNCTION | loadMapAsset/planFieldOccupy/planFieldGiveUp; src/world.mjs:545,595,619 | C | 世界资源田CLI局部链；未接OperationService和最终效果复读 |
| BIZ-W16 | 放弃自有资源田 | 非C:资源田放弃 | EXISTING_FUNCTION | loadMapAsset/planFieldOccupy/planFieldGiveUp; src/world.mjs:545,595,619 | C | 世界资源田CLI局部链；未接OperationService和最终效果复读 |
| BIZ-H01 | 英雄及阵容数据读取、养成计划展示；planHeroes、maxHeroLevelFor | C221 C211 | EXISTING_FUNCTION | planHeroes/runHeroPlan/sendHero; src/heroes.mjs:66,221,275 | R | 等级/星级/技能计划和CLI存在；Web写403、缺Operation适配和权威复读；升级/技能静默UNKNOWN |
| BIZ-H02 | 英雄升级；planHeroes→runHeroPlan→sendHero | C222 | EXISTING_FUNCTION | planHeroes/runHeroPlan/sendHero; src/heroes.mjs:66,221,275 | C | 等级/星级/技能计划和CLI存在；Web写403、缺Operation适配和权威复读；升级/技能静默UNKNOWN |
| BIZ-H03 | 英雄升星；planHeroes→runHeroPlan | C223 | EXISTING_FUNCTION | planHeroes/runHeroPlan/sendHero; src/heroes.mjs:66,221,275 | C | 等级/星级/技能计划和CLI存在；Web写403、缺Operation适配和权威复读；升级/技能静默UNKNOWN |
| BIZ-H04 | 英雄技能升级；planHeroes→runHeroPlan | C224 | EXISTING_FUNCTION | planHeroes/runHeroPlan/sendHero; src/heroes.mjs:66,221,275 | C | 等级/星级/技能计划和CLI存在；Web写403、缺Operation适配和权威复读；升级/技能静默UNKNOWN |
| BIZ-H05 | 装备/徽章穿戴、升级、替换、精炼、升星、专武养成 | C225 C226 C227 C228 C229 C230 | PROTOCOL_ONLY | AllHero/Equips/Badges data; src/game.mjs:10,13,14; no heroGrow in target src | P | 参考heroGrow尚未移植；读取装备/徽章不能算培养执行 |
| BIZ-D01 | 日常任务进度、目标与可执行动作评估；describeDailyTask/surveyDailies/DAILY_DRIVERS | C502 C503 | EXISTING_FUNCTION | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs:421,181,539,583 | R | 只读/probe/状态或计划；不得作为对应写入已完成 |
| BIZ-D02 | 免费与招募券单抽；Function：DAILY_DRIVERS[1002] → runDailies→sendAction | 非C:免费招募 | EXISTING_FUNCTION | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs:421,181,539,583 | C | 局部日常/领奖Function存在；旧Web执行仍403；静默无业务确认保留UNKNOWN |
| BIZ-D03 | 日常单次主线战斗；Function：DAILY_DRIVERS[1003] → runDailies | C202 | PARTIAL | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs:421,181,539,583 | C | 日常ChallengeStage不能替代主线Runner授权/结果合同 |
| BIZ-D04 | 挂机满段领取驱动；Function：DAILY_DRIVERS[1004] | 非C:挂机收益 | EXISTING_FUNCTION | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs:421,181,539,583 | C | 局部日常/领奖Function存在；旧Web执行仍403；静默无业务确认保留UNKNOWN |
| BIZ-D05 | 竞技场低战力对手挑战；Function：DAILY_DRIVERS[1005] | 非C:竞技场 | EXISTING_FUNCTION | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs:421,181,539,583 | C | 局部日常/领奖Function存在；旧Web执行仍403；静默无业务确认保留UNKNOWN |
| BIZ-D06 | 免费点金/可选钻石点金；Function：DAILY_DRIVERS[1006] | 非C:点金 | EXISTING_FUNCTION | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs:421,181,539,583 | C | 局部日常/领奖Function存在；旧Web执行仍403；静默无业务确认保留UNKNOWN |
| BIZ-D07 | 折扣店挑最低价购买；Function：DAILY_DRIVERS[1007] | C513 非C:折扣店 | PARTIAL | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs:421,181,539,583 | C | PHASE1已修D6；DiscountShopBuyResponse存在但旧driver仍走静默窗口 |
| BIZ-D08 | 贸易日常能力；Function：DAILY_DRIVERS[1008] probes | C131 C521 | PARTIAL | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs:421,181,539,583 | R | 只读/probe/状态或计划；不得作为对应写入已完成 |
| BIZ-D09 | 英雄经验试炼推进；Function：DAILY_DRIVERS[1009] | 非C:经验试炼 | EXISTING_FUNCTION | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs:421,181,539,583 | C | 局部日常/领奖Function存在；旧Web执行仍403；静默无业务确认保留UNKNOWN |
| BIZ-D10 | 海盗免战扫荡；Function：DAILY_DRIVERS[1010] | C151 | PARTIAL | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs:421,181,539,583 | C | 扫荡仅按日常进度截取海盗；没有可靠剩余扫荡配额与最终效果确认 |
| BIZ-D11 | 联盟情报日常探测；Function：DAILY_DRIVERS[1011] | 非C:联盟雷达 | PARTIAL | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs:421,181,539,583 | R | 只读/probe/状态或计划；不得作为对应写入已完成 |
| BIZ-D12 | 联盟订单日常探测；Function：DAILY_DRIVERS[1012] | 非C:联盟订单 | PARTIAL | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs:421,181,539,583 | R | 只读/probe/状态或计划；不得作为对应写入已完成 |
| BIZ-D13 | 联盟互助探测；Function：DAILY_DRIVERS[1013] | C301 | PARTIAL | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs:421,181,539,583 | R | 只读/probe/状态或计划；不得作为对应写入已完成 |
| BIZ-D14 | 请求帮助/城战功勋日常驱动；Function：DAILY_DRIVERS[1014/1015] lockedReason | C305 C406 | NOT_IMPLEMENTED | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs:421,181,539,583 | N | lockedReason占位不是自动求助/城战执行 |
| BIZ-D15 | 博物馆探险探测；Function：DAILY_DRIVERS[1016] | C141 | PARTIAL | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs:421,181,539,583 | R | 只读/probe/状态或计划；不得作为对应写入已完成 |
| BIZ-D16 | 跨服积分赛探测；Function：DAILY_DRIVERS[1017] | 非C:跨服积分赛 | PARTIAL | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs:421,181,539,583 | R | 只读/probe/状态或计划；不得作为对应写入已完成 |
| BIZ-D17 | 执行日常动作并收尾领奖；Function：runDailies→sendAction→claimDailies | C503 | PARTIAL | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs:421,181,539,583 | C | 局部日常/领奖Function存在；旧Web执行仍403；静默无业务确认保留UNKNOWN |
| BIZ-D18 | 领取已完成日常任务奖励；Function：claimDailies | C503 | EXISTING_FUNCTION | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs:421,181,539,583 | C | 局部日常/领奖Function存在；旧Web执行仍403；静默无业务确认保留UNKNOWN |
| BIZ-D19 | 日/周活跃宝箱计划与领取；Function：chestTiers/planChests→claimDailies | C516 | EXISTING_FUNCTION | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs:421,181,539,583 | C | 局部日常/领奖Function存在；旧Web执行仍403；静默无业务确认保留UNKNOWN |
| BIZ-D20 | 每日免费赠礼计划与验证；Function：planDailyGift→claimDailies | C513 | EXISTING_FUNCTION | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs:421,181,539,583 | C | 局部日常/领奖Function存在；旧Web执行仍403；静默无业务确认保留UNKNOWN |
| BIZ-D21 | 主线/支线任务状态与领奖计划；Function：surveyTasks、taskTarget | C502 C503 | EXISTING_FUNCTION | surveyTasks/nextOrderTier/runTasks; src/tasks.mjs:63,53,190 | R | PHASE1已跨轮rejected传递；仍缺Operation适配/通用持久记忆及逐动作权威复读 |
| BIZ-D22 | 成就状态与领奖计划；Function：surveyTasks | 非C:成就 | EXISTING_FUNCTION | surveyTasks/nextOrderTier/runTasks; src/tasks.mjs:63,53,190 | R | PHASE1已跨轮rejected传递；仍缺Operation适配/通用持久记忆及逐动作权威复读 |
| BIZ-D23 | 每日订单档位判断；Function：nextOrderTier→surveyTasks | 非C:订单档奖励 | EXISTING_FUNCTION | surveyTasks/nextOrderTier/runTasks; src/tasks.mjs:63,53,190 | R | PHASE1已跨轮rejected传递；仍缺Operation适配/通用持久记忆及逐动作权威复读 |
| BIZ-D24 | 主/支/成就/订单档奖励串行领取；Function：runTasks | C503 C604 | PARTIAL | surveyTasks/nextOrderTier/runTasks; src/tasks.mjs:63,53,190 | C | PHASE1已跨轮rejected传递；仍缺Operation适配/通用持久记忆及逐动作权威复读 |
| BIZ-D25 | 一键可领取清单与前后对比；Function：app内部planLoot→loot→runAction | C511 C513 | EXISTING_FUNCTION | planLoot; src/app.mjs:234; runAction src/actions.mjs:335 | C | 局部日常/领奖Function存在；旧Web执行仍403；静默无业务确认保留UNKNOWN |
| BIZ-L01 | 角色摘要/区服列表与分组；Function：describeRole/listWorlds/listGroup | C003 | EXISTING_FUNCTION | describeRole/listWorlds/listGroup; src/worlds.mjs:23,51,60 | R | 读取与进入区服分开 |
| BIZ-L02 | 指定区服登录；Function：enterWorld→新GameClient.connect({...login,worldId}) | C003 | EXISTING_FUNCTION | enterWorld; src/worlds.mjs:68 | C | Web仍403；新区登录可能建角 |
| BIZ-L03 | 固定三段自动循环；Function：runLoop → surveyTasks/runTasks → surveyDailies/runDailies → surveyWorld/planWorld/runWorld | C605 C604 | PARTIAL | runLoop; src/loop.mjs:8 | C | PHASE1已逐步取消/拒绝记忆；仍固定CLI循环，无统一持久调度 |
| BIZ-L04 | 循环轮次记录/步骤回调；Function：runLoop history/onRound/onStep→formatLoopRound | C606 | EXISTING_FUNCTION | runLoop/formatLoopRound; src/loop.mjs:8,105 | C | 仅loop内存历史；不是统一持久账本 |
| BIZ-L05 | 订单库存→评估→刷新/交单组合；Function：新order-rules只读决策 + 旧finishOrder/rerollOrder | C125 C126 | PARTIAL | planOrderExecution/executeOrderOperation; src/order-execution.mjs:104,146 | B | 提交闭环存在，免费刷新证据默认缺失 |
| BIZ-L06 | 建筑→队列→收取/排产组合；Function：surveyWorld→planWorld→runWorld | C101 C111 C115 C116 | EXISTING_FUNCTION | surveyCityOperations/planCityOperations/executeCityAction; src/city-operations.mjs:38,167,221 | B | 原世界链复用，显式新批次授权 |
| BIZ-L07 | 玩家→指定阵容→主线组合；Function：玩家/formation读取与Stage Runner已存在，应用阵容动作未接 | C214 C204 | EXISTING_FUNCTION | assertFormationReady; src/operation-service.mjs:238; createStageFunction src/stage-function.mjs:15 | G | 授权保存/权威复读后才挑战；非自动换阵策略 |
| BIZ-L08 | 舰队→维修→派遣组合；Function：目标仅fleet读取+资源田手动计划；无Repair Function | C401 C407 C406 | PARTIAL | surveyFleet/planFleet/verifyFleet; src/fleet.mjs:18,141,165 | G | 维修和移动已做；移动不等于攻击闭环 |
| BIZ-L09 | 通用 Workflow Engine / DAG / Rules编排 | C601 C602 C603 C604 C605 C606 C607 | PARTIAL | createWorkflowRunner/validateWorkflow; src/workflow.mjs:110,36 | G | 有限DAG和条件存在；缺完整目录、跨轮调度、画布 |
| BIZ-R01 | 联盟订单交付（当前DATA_ONLY） | 非C:联盟订单 | PARTIAL | surveyAlliance/allianceView/planAlliance; src/alliance.mjs:84,99,137 | G | BLOCKED_EVIDENCE：season=null使权威订单上限未知 |
| BIZ-R02 | 联盟情报奖励/派舰/修理（当前无执行） | C403 C407 非C:雷达奖励派舰 | PARTIAL | surveyFleet/planFleet; src/fleet.mjs:18,141; surveyNaval src/naval-rules.mjs:52 | G | 只共用维修；雷达领奖与派舰仍无目标Function |
| BIZ-R03 | 海盗派舰实战与免战扫荡（当前扫荡PARTIAL） | C151 非C:海盗实战 | PARTIAL | DAILY_DRIVERS[1010]; src/dailies.mjs:376 | C | 扫荡有限实现无配额；海盗实战未移植 |
| BIZ-R04 | 贸易货船补货/返航领奖（当前DATA_ONLY） | C131 C132 C133 C134 | PARTIAL | surveyFleet/buildCandidates/verifyFleet; src/fleet.mjs:18,72,165 | G | cargoFill/Claim存在；专门缺货清单与独立港口交互仍缺 |
| BIZ-R05 | 联盟商船补货与应聘船长（当前未接） | 非C:联盟商船 | PROTOCOL_ONLY | DAT read/protocol; src/game.mjs:26; target src/function-registry.mjs:9未注册guildShip | P | 补货/应聘船长参考未移植 |
| BIZ-R06 | 联盟福利礼包领取（当前未接） | 非C:联盟福利 | EXISTING_FUNCTION | allianceView/verifyAlliance; src/alliance.mjs:99,154 | G | 领取现有福利需权威时间/库存/回包复读 |
| BIZ-R07 | 装备厂制造/收取（当前只有装备DATA） | 非C:装备厂 | PROTOCOL_ONLY | Equips data; src/game.mjs:13; target src/function-registry.mjs:9未注册equip | P | 制造收取参考未移植 |
| BIZ-R08 | 海兽培育/成熟收取/材料投喂（当前DATA_ONLY） | 非C:海兽培育 | PROTOCOL_ONLY | AllPet data; src/game.mjs:40; target src/function-registry.mjs:9未注册pet | P | 培育投喂收成熟参考未移植 |
| BIZ-R09 | 徽章/装备/专武完整养成（当前DATA_ONLY） | C225 C226 C227 C228 C229 C230 | PROTOCOL_ONLY | data only; src/game.mjs:10,13,14; target src/heroes.mjs:221仅level/star/skill | P | heroGrow未移植，参考代码不计当前实现 |
| BIZ-R10 | 挂机、邮件及升级依赖计划（当前底层Action已在） | C511 非C:挂机依赖计划 | PARTIAL | planLoot/runAction; src/app.mjs:234; src/actions.mjs:335 | C | 原子底层存在，完整idle依赖/分页/确认未移植 |
| BIZ-R11 | 世界宝藏货轮抢占（当前未接） | 非C:世界宝藏 | PARTIAL | surveyTreasure/planTreasure/verifyTreasure; src/treasure.mjs:20,86,87 | G | 只证无争夺派舰分配；非抢占胜利/奖励闭环 |
| BIZ-R12 | 城战读状态、修理、调遣、在线奖（当前只有占位） | C403 C406 C407 非C:城战在线奖 | PARTIAL | surveyFleet/planFleet/verifyFleet; src/fleet.mjs:18,141,165 | G | 维修和移动存在；攻击/在线奖仍缺 |
| BIZ-R13 | 海商王买卖/移动/奖励/免费战令（当前未接） | C521 C522 C523 C524 | PROTOCOL_ONLY | TradeInfo probe; src/dailies.mjs:340; target registry src/function-registry.mjs:9无tradeKing | P | tradeKing买卖/收益/巡航未移植 |
| BIZ-R14 | 工厂独立页面与自选材料包覆盖（当前仅简单排产） | C111 C112 C114 C115 C116 非C:自选包 | PARTIAL | cityView/productionShortages; src/city-operations.mjs:131; src/production-policy.mjs:61 | B | 生产页已做；材料包兑换未移植，日报只覆盖工具事件 |
| BIZ-R15 | 漂浮物拾荒、礼包码（当前只有计数/协议） | 非C:漂浮物礼包码 | PROTOCOL_ONLY | target ACTIONS src/actions.mjs:51无pickUpFloater/giftCode | P | 参考新增Action尚未移植 |
| BIZ-R16 | 农田种植/喂种、委任减时、订单供给水位（当前简单planWorld未有） | C113 C114 非C:农田委任水位 | PARTIAL | surveyWorld/planWorld; src/world.mjs:86,209 | C | 基础生产在；农田、减时、水位与种子链缺失 |
| BIZ-R17 | 活动幽都驱邪/罗盘/敕令/签到（当前未接） | C501 C502 C503 | PROTOCOL_ONLY | target DAILY_DRIVERS src/dailies.mjs:181无youdu | P | 幽都驱邪/罗盘/敕令/签到参考未移植 |
| BIZ-R12a | claimWarOnlineReward；参考cityWar:638–670 | 非C:城战在线奖 | PROTOCOL_ONLY | target registry src/function-registry.mjs:9无claimWarOnlineReward | P | GotWorldOnlineRwdRequest存在不等于Function；纳W14补资格/回包关联/权威复读 |
| BIZ-R16a | farmOf；参考world:190；surveyWorld:368 | C113 C114 非C:农田委任水位 | PARTIAL | surveyWorld/planWorld; src/world.mjs:86,209; current target lacks farmOf/appointProduceReduce/waterlineOf/decideOrderReroll | P | 原参考分项未移植；基础OnWater或普通排产不等于此算法 |
| BIZ-R16b | 增强planWorld farmHarvest分支；参考world:1555–1577→runWorld | C113 C114 非C:农田委任水位 | PROTOCOL_ONLY | surveyWorld/planWorld; src/world.mjs:86,209; current target lacks farmOf/appointProduceReduce/waterlineOf/decideOrderReroll | P | 原参考分项未移植；基础OnWater或普通排产不等于此算法 |
| BIZ-R16c | 增强planWorld farmPlant分支；参考world:1579–1687→runWorld | C113 C114 非C:农田委任水位 | PROTOCOL_ONLY | surveyWorld/planWorld; src/world.mjs:86,209; current target lacks farmOf/appointProduceReduce/waterlineOf/decideOrderReroll | P | 原参考分项未移植；基础OnWater或普通排产不等于此算法 |
| BIZ-R16d | appointEffectValue→appointProduceReduce→produceFinalTime；参考world:205,217,234；surveyWorld:383–389 | C113 C114 非C:农田委任水位 | NOT_IMPLEMENTED | surveyWorld/planWorld; src/world.mjs:86,209; current target lacks farmOf/appointProduceReduce/waterlineOf/decideOrderReroll | N | 原参考分项未移植；基础OnWater或普通排产不等于此算法 |
| BIZ-R16e | 增强planWorld内部waterlineOf；参考world:1065–1089 | C113 C114 非C:农田委任水位 | NOT_IMPLEMENTED | surveyWorld/planWorld; src/world.mjs:86,209; current target lacks farmOf/appointProduceReduce/waterlineOf/decideOrderReroll | N | 原参考分项未移植；基础OnWater或普通排产不等于此算法 |
| BIZ-R16f | 增强planWorld种子缺口需求；参考world:1091–1130 | C113 C114 非C:农田委任水位 | NOT_IMPLEMENTED | surveyWorld/planWorld; src/world.mjs:86,209; current target lacks farmOf/appointProduceReduce/waterlineOf/decideOrderReroll | N | 原参考分项未移植；基础OnWater或普通排产不等于此算法 |
| BIZ-R16g | 增强planWorld过剩作物→成品需求；参考world:1131–1167 | C113 C114 非C:农田委任水位 | NOT_IMPLEMENTED | surveyWorld/planWorld; src/world.mjs:86,209; current target lacks farmOf/appointProduceReduce/waterlineOf/decideOrderReroll | N | 原参考分项未移植；基础OnWater或普通排产不等于此算法 |
| BIZ-R16h | decideOrderReroll；参考world:274；增强planWorld:872–1029 | C113 C114 非C:农田委任水位 | PARTIAL | surveyWorld/planWorld; src/world.mjs:86,209; current target lacks farmOf/appointProduceReduce/waterlineOf/decideOrderReroll | N | 保留已有order-rules产品语义；不整体替换成参考decideOrderReroll |
| BIZ-R17a | planYoudu kill分支；参考youdu:230–249→runWorld | C501 C502 C503 非C:幽都活动 | PROTOCOL_ONLY | target src/function-registry.mjs:9; src/dailies.mjs:181未实现youdu分支 | P | 原参考分项未移植；需活动状态/成本/奖励/账号记忆合同后适配 |
| BIZ-R17b | planYoudu驱邪累计奖励；参考youdu:252–277→runWorld | C501 C502 C503 非C:幽都活动 | PROTOCOL_ONLY | target src/function-registry.mjs:9; src/dailies.mjs:181未实现youdu分支 | P | 原参考分项未移植；需活动状态/成本/奖励/账号记忆合同后适配 |
| BIZ-R17c | planYoudu罗盘；参考youdu:279–298→runWorld | C501 C502 C503 非C:幽都活动 | PROTOCOL_ONLY | target src/function-registry.mjs:9; src/dailies.mjs:181未实现youdu分支 | P | 原参考分项未移植；需活动状态/成本/奖励/账号记忆合同后适配 |
| BIZ-R17d | planYoudu罗盘累计奖；参考youdu:300–315→runWorld | C501 C502 C503 非C:幽都活动 | PROTOCOL_ONLY | target src/function-registry.mjs:9; src/dailies.mjs:181未实现youdu分支 | P | 原参考分项未移植；需活动状态/成本/奖励/账号记忆合同后适配 |
| BIZ-R17e | planYoudu敕令开局；参考youdu:337–347→runWorld | C501 C502 C503 非C:幽都活动 | PROTOCOL_ONLY | target src/function-registry.mjs:9; src/dailies.mjs:181未实现youdu分支 | P | 原参考分项未移植；需活动状态/成本/奖励/账号记忆合同后适配 |
| BIZ-R17f | planYoudu敕令作答/settleYouduEdict；参考youdu:317–336,429–445 | C501 C502 C503 非C:幽都活动 | PROTOCOL_ONLY | target src/function-registry.mjs:9; src/dailies.mjs:181未实现youdu分支 | P | 原参考分项未移植；需活动状态/成本/奖励/账号记忆合同后适配 |
| BIZ-R17g | runYouduActive；参考youdu:378–418 | C501 C502 C503 非C:幽都活动 | PROTOCOL_ONLY | target src/function-registry.mjs:9; src/dailies.mjs:181未实现youdu分支 | P | 原参考分项未移植；需活动状态/成本/奖励/账号记忆合同后适配 |
| BIZ-R17h | runYouduSigns；参考youdu:481–550 | C501 C502 C503 非C:幽都活动 | PROTOCOL_ONLY | target src/function-registry.mjs:9; src/dailies.mjs:181未实现youdu分支 | P | 原参考分项未移植；需活动状态/成本/奖励/账号记忆合同后适配 |
| ORD-001 | 读取居民订单 | C121 | EXISTING_FUNCTION | surveyWorld/surveyOrderExecution; src/world.mjs:86; src/order-execution.mjs:92 | R | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-002 | 解析需求物品与数量 | C122 | EXISTING_FUNCTION | surveyWorld/surveyOrderExecution; src/world.mjs:86; src/order-execution.mjs:92 | R | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-003 | 库存与缺口计算 | C123 | EXISTING_FUNCTION | surveyWorld/surveyOrderExecution; src/world.mjs:86; src/order-execution.mjs:92 | R | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-004 | 普通订单经验 | C124 | EXISTING_FUNCTION | surveyWorld/surveyOrderExecution; src/world.mjs:86; src/order-execution.mjs:92 | R | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-005 | 特殊订单经验 | C124 | EXISTING_FUNCTION | surveyWorld/surveyOrderExecution; src/world.mjs:86; src/order-execution.mjs:92 | R | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-006 | 金币奖励解析 | C124 | NOT_IMPLEMENTED | evaluateOrder/evaluateOrders; src/order-rules.mjs:113,152; previewOrderRules src/server.mjs:418 | N | BLOCKED_EVIDENCE：EXP有来源，金币未知，MIN_GOLD仍不实现 |
| ORD-007 | 规则契约校验 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs:113,152; previewOrderRules src/server.mjs:418 | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-008 | 规则增删编辑/排序/启停 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs:113,152; previewOrderRules src/server.mjs:418 | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-009 | 原始物品ID匹配与名称展示 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs:113,152; previewOrderRules src/server.mjs:418 | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-010 | 禁止物品 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs:113,152; previewOrderRules src/server.mjs:418 | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-011 | 必须包含全部指定物品 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs:113,152; previewOrderRules src/server.mjs:418 | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-012 | 经验GT/GTE阈值 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs:113,152; previewOrderRules src/server.mjs:418 | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-013 | 单物品需求数量上限 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs:113,152; previewOrderRules src/server.mjs:418 | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-014 | 库存规则及最终独立库存检查 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs:113,152; previewOrderRules src/server.mjs:418 | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-015 | 优先级短路评估 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs:113,152; previewOrderRules src/server.mjs:418 | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-016 | 每条规则独立KEEP/REFRESH/REVIEW | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs:113,152; previewOrderRules src/server.mjs:418 | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-017 | 全通过后建议提交 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs:113,152; previewOrderRules src/server.mjs:418 | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-018 | 账号隔离持久化/安全回退 | C127 | EXISTING_FUNCTION | loadOrderRules/saveOrderRules; src/order-rules-store.mjs:46,59 | L | 精确账号持久化，损坏保留不覆盖 |
| ORD-019 | Snapshot模拟与解释 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs:113,152; previewOrderRules src/server.mjs:418 | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-020 | 跨订单库存预留 | C123 | EXISTING_FUNCTION | ResourceLedger/evaluateOrders/planOrderExecution; src/order-rules.mjs:152; src/order-execution.mjs:104 | B | PHASE1/2已共享跨订单预算；独立快照预览与执行计划需区分 |
| ORD-021 | 规则建议→真实提交/刷新 | C126 | PARTIAL | planOrderExecution/executeOrderOperation; src/order-execution.mjs:104,146 | B | SUBMIT闭环存在；REFRESH仍因免费配额证据缺失被阻塞 |
| ORD-022 | 订单执行历史持久化 | C128 | EXISTING_FUNCTION | createExecutionHistory/createOperationService; src/execution-history.mjs:16; src/operation-service.mjs:32 | B | 账号级持久历史已实现；真实写入/重启恢复仍待最终验收 |
| STG-001 | 从当前主线启动 | C201 C202 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs:114,85 | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-002 | 主线专用LEFT授权 | C203 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs:114,85 | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-003 | 关卡号/Boolean胜负检查 | C203 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs:114,85 | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-004 | 胜利推进下一关 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs:114,85 | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-005 | 明确战败后重试 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs:114,85 | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-006 | 首次战败立即停止 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs:114,85 | S | API有stopOnDefeat；UI只透传，独立勾选仍缺 |
| STG-007 | 最大总开战次数 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs:114,85 | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-008 | 最高目标关卡 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs:114,85 | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-009 | 胜利后随机10–11秒 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs:114,85 | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-010 | 下一关倒计时/随机时长历史 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs:114,85 | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-011 | RATE_LIMITED独立停止 | C205 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs:114,85 | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-012 | 同账号排他/未决锁 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs:114,85 | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-013 | 停止/失效/删除取消 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs:114,85 | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-014 | runId/generation/迟到保护 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs:114,85 | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-015 | 内存历史/状态重读 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs:114,85 | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-016 | 持久化Runner历史/自动恢复 | C204 C606 | PARTIAL | createStageRunner/parseStageResult; src/stages.mjs:114,85; src/stage-function.mjs:15; src/execution-history.mjs:16 | S | 直启Runner仍内存200条；有限Stage Function可进入operation持久历史；不自动恢复写入 |
| STG-017 | 其他战斗模式支持 | 非C:其他战斗模式；W08/W14（不并入C204/C606完成数） | PROTOCOL_ONLY | createStageRunner/parseStageResult; src/stages.mjs:114,85 | P | SIDE_UNVERIFIED：其他战斗模式不能继承主线LEFT |
| FRM-001 | 当前主线阵容读取 | C211 C207 | EXISTING_FUNCTION | surveyFormation/parseFormation; src/formation.mjs:98,37 | R | 实时阵容与本次战斗阵容保持不同证据 |
| FRM-002 | 已解锁阵型模板ID读取 | C212 | EXISTING_FUNCTION | surveyFormation/catalogFrom; src/formation.mjs:98,69 | R | 模板ID不是完整队伍存档 |
| FRM-003 | 保存/修改当前阵容 | C213 C214 | EXISTING_FUNCTION | planFormation/verifyFormation; src/formation.mjs:161,170 | G | 完整SaveFormation与复读已做 |
| FRM-004 | 应用已解锁阵型模板 | C213 C214 | EXISTING_FUNCTION | candidate/planFormation/verifyFormation; src/formation.mjs:120,161,170 | G | 按职业重排站位/保留petUid；只用已解锁模板 |
| FRM-005 | 解锁阵型模板 | 非C:解锁阵型 | PROTOCOL_ONLY | target src/formation.mjs:120只使用已解锁；protocol UnlockFormationPreset | P | 原范围纳W08：仅已证实普通图纸路径，单次精确授权；成本未知BLOCKED，钻石补图排除 |
| FRM-006 | 更换上下阵英雄 | C213 C214 | PARTIAL | planFormation; src/formation.mjs:161 | G | 完整SaveFormation可换英雄；未实现专用SwitchFormationHero路径，不能冒称专用接口接通 |
| FRM-007 | 具名多套完整英雄队伍预设 | 非C:具名完整队伍预设 | NOT_IMPLEMENTED | catalogFrom/validateFormationParameters; src/formation.mjs:69,52 | N | 缺具名整队本地合同；纳W08定义/实现；不等同C215极限站位复制 |
| FRM-008 | 闯关前应用并确认阵容 | C214 C204 | EXISTING_FUNCTION | assertFormationReady; src/operation-service.mjs:238; createStageFunction src/stage-function.mjs:15 | G | 同Session保存/复读后允许主线；自动决策仍未完成 |
| PRO-001 | 公会科技 | C306 C307 | PROTOCOL_ONLY | GuildTechInfo query; src/game.mjs:34; no UpgradeGuildTech in target business | P | 科技升级/重置未实现，query不计write |
| PRO-002 | 公会订单与互助 | C301 C302 C303 C304 C305 非C:联盟订单 | PARTIAL | surveyAlliance/allianceView/planAlliance/verifyAlliance; src/alliance.mjs:84,99,137,154 | G | 帮助/取消/领取存在；ask冷却、help权威配额、订单赛季阻塞；Fort独立 |
| PRO-003 | 舰队维修/编队/派遣 | C401 C402 C406 C407 C408 | PARTIAL | surveyFleet/planFleet/verifyFleet; src/fleet.mjs:18,141,165 | G | 编队/普通维修/移动做；攻击/免费加速/持续委任未闭环 |
| PRO-004 | 货船操作 | C131 C132 C133 C134 | PARTIAL | surveyFleet/buildCandidates/verifyFleet; src/fleet.mjs:18,72,165 | G | 装货/领奖已实现；货船加速禁止，不能将全族计完成 |
| PRO-005 | 世界与限时 Boss 战斗 | 非C:世界/限时Boss | PROTOCOL_ONLY | surveyNaval/navalView; src/naval-rules.mjs:52,69 | P | 写候选不生成；独立战斗语义和结果关联缺失 |
| PRO-006 | 博物馆展陈与探险 | C141 C142 C143 C144 | PARTIAL | surveyMuseum/planMuseum/verifyMuseum; src/museum.mjs:40,175,186 | G | 展陈/收益/StartExplore存在；Complete/Reward权威语义阻塞 |
| PRO-007 | 藏品养成 | 非C:藏品养成 | PROTOCOL_ONLY | AllAntique data; src/game.mjs:23; target registry src/function-registry.mjs:9无antique | P | 培养/兑换/精通未实现；纳W11独立子边界与证据闸门 |
| PRO-008 | 贸易与货运玩法 | C521 C522 C523 C524 | PROTOCOL_ONLY | TradeInfo probe; src/dailies.mjs:340; target registry src/function-registry.mjs:9无tradeKing | P | 只有读与协议/参考；买卖/路线业务不在目标 |
| PRO-009 | 寻宝与掠夺 | 非C:世界宝藏 | PARTIAL | surveyTreasure/planTreasure/verifyTreasure; src/treasure.mjs:20,86,87 | G | 列表/排名/防守+无争夺派舰；缺抢占/战斗/领奖 |
| PRO-010 | 其他模式阵容 | 非C:其他模式阵容 | PROTOCOL_ONLY | mainline-only validation; src/formation.mjs:52; src/stages.mjs:26 | P | 其他模式不复用主线阵营结论；须逐模式合同/证据，纳W08 |

本附录按具体子Function补充证据；第5节95项完整需求分类为统计权威，子Function存在不能覆盖整项PARTIAL。所有测试均为指定版本历史证据，本轮没有重跑。

## 附录B — PHASE3实际Function、API/UI及测试证据补充

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



## 附录C — 本轮文档静态校验与保护复核

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
## 附录D — 持续执行登记（2026-11-11，当前有效）

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
