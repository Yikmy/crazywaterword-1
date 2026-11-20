# CrazyWater Platform — 全路线图对账与工程总计划

当前核对日期：2026-11-17（Asia/Shanghai）；Owner明确跳过驱邪，本轮未提交实现已撤回；BIZ-R17a保留原编号并注明跳过，不标完成。Owner不再要求恢复默认账号文件，未声称原数据恢复。按Owner新顺序先集中实现、后统一离线测试、通过后完整离线模拟；本批P8-1专业页与Workflow三核心模块共用原Registry默认配置，支持来源显示/恢复安全默认到草稿，原账号保存及计划失效保护保留。16项页面用例仅编写未运行，静态语法检查另记。全范围仍PARTIAL/REAL_UNVERIFIED；2026-11-17已开始集中离线回归，R7 IN_PROGRESS且未通过，局部修复和剩余失败见W07/W11/W19，R8 NOT_RUN。

> 原目标COMPLETE_CRAZYWATER_PLATFORM_R1_R8范围不变，尚未完成；原D.1–D.28仅为交接历史。无新增Gate/阶段/编号，R7统一离线与R8单独真实授权条件保持。

2026-11-17 本批续接本地829091e（保留远端9612040之后的三批成果），先核W19真实源码，再完成原DAG两项完整业务接线：W09/PRO-002、REQ-103/REQ-159普通堡垒捐献支持同城明确1至6种不同自有材料；W08/FRM-005、P3-5支持明确1至23个不同普通模板图纸解锁。两项均已接原Service只读准备API、专业页和逐项ACTION→VERIFY，沿用原Function/Adapter/Registry、单次授权、父预算、History和拒绝/UNKNOWN停止，无新执行或恢复体系。实际修改：src/alliance-fort.mjs、src/alliance.mjs（PRO-002原普通捐献合同及来源守卫）；src/formation-unlock.mjs（FRM-005原单模板计划器组合）；src/function-contracts.mjs（原alliance增加expectedFortHash规划字段）；src/operation-service.mjs、src/server.mjs、src/gameplay-page.mjs（上述两项API/专业页/Workflow一致接入；图纸复用原共用成长表单）。Fort摘要仅绑定原身份/同日/堡垒及指定材料进度和配置，其他材料与同日衰减计数可随已确认前项改变，每项实际功勋仍由原单次合同重新计算并授权；图纸仅解锁，不应用阵容。未知语义沿原条目局部冻结。本批未新增/运行测试；源码语法、整页脚本编译和diff仅静态检查，非功能PASS。R7统一补1/6材料及1/23模板、重复/坏参数/访问器、需求/累计库存/原typed功勋与完整库存、衰减跨阈值/目标变化/跨日、模板精确新增及完整阵容宠物不变、逐项授权拒绝/UNKNOWN、草稿/迟到/scope/配置隔离、原单项兼容及完整离线模拟。R7/R8 NOT_RUN，全部真实写REAL_UNVERIFIED；未连接游戏、读取凭证、push或merge。

2026-11-16 按Owner最新FEATURE FIRST顺序：集中实现全部有据能力及API/UI/Workflow集成，之后统一R7补测试、回归、修复和完整离线模拟，R8仍单独授权。R1–R6不运行测试套件、不逐小功能补测/提交/报告；只保留原编号、统一安全合同与具体缺证冻结。账号、授权、父预算、D6、持久历史和UNKNOWN零自动重放不变。本轮实际读取原Goal工具状态为active；继续原目标，不重建Goal，不将工程实现或静态检查等同完整交付。

| 工作包 | 已完成能力 | 当前下一项 | 真正阻塞 | 最后提交 | 对应测试 |
|---|---|---|---|---|---|
| W01 PARTIAL | 唯一Console所有者、CLI独立写拒绝、Stage共同门控和有限证据恢复已有 | 维持原合同，按领域权威证据扩恢复 | 通用恢复缺独立证明，重连/重启及其他领域STILL_UNKNOWN | 26ed68d；当前执行链fc68c50 | 原writer-ownership/recovery/Service/API专项；本轮未重跑 |
| W02 PARTIAL | 27静态模块加Stage、28合同、原核心Adapter及父资源/配额/UID预算已有；本批罗盘仅加原静态Registry领域Adapter | 随原剩余领域补合同，不另建注册或执行体系 | 注册或协议存在不能证明未闭合写可执行 | 本行所在提交（父97f671f）；原公共实现保留 | 本批Contract/Registry/D6/公共Adapter集成结果共用W17，不重复计数；原合同及预算/历史回归保持  2026-11-18集中R7：tests/core-operation-adapters、operation-adapters-integration、production-policy及function-contracts更新已有明确生产参数/已交Schema断言；tests/execution-memory-service及farm-service保留已派发UNKNOWN，身份变化不改写为CANCELLED，历史不变/后续零派发守卫保留。 合同等九文件688/688通过（61.78秒），缓存/海战三文件60/60通过（5.75秒），古董原Workflow定向1/1通过（4.28秒）；共享结果不跨行累计。此批仅测试合同/夹具修正，非业务写链改造，R7 IN_PROGRESS、R8 NOT_RUN。 |
| W05 PARTIAL |港口专业货舱/逐物品缺货、明确装货及到港领取已有 本批将原cargoShortageView直接显示于原生Workflow候选面板：船号/状态/原到达值、逐格材料与合计缺口，未知不补零，不复制成本、资格或装货/领奖执行。  本批C131–C133、BIZ-R04/PRO-004关联：明确勾选当前一艘采购货船的1至24格，复用原cargoFill计划、成本、请求及typed奖励/完整库存验证，准备原Workflow逐格ACTION→VERIFY；共享原父预算只预留准备时自有材料，不把预期奖励补额度。原Service只读准备API与专业页同源，完整货船摘要逐步核对，目标/编辑/账号或迟到变化丢弃旧预览；拒绝、UNKNOWN或状态变化停止，不补购、不含到港/下一航次，原单格及领奖入口保留。 本批C133/BIZ-R04：原到港单船领取增加明确1至24艘有限组合；原cargo准备端点区分claim，原planFleet确认全部所选航次，专业页不默认选择，原Workflow逐船ACTION→VERIFY。expectedCargoHash仅作规划守卫，实际单船请求/参数、typed原奖励和完整库存净入/其他船不变验证及已有恢复保持；收入不扩父预算，不含装货、出航、加速或下一航次。  2026-11-18 W05 / C131–C133、BIZ-R04、PRO-004。货船专业页可以同时选多艘采购船的货格，总计最多24格。原货船准备API接受action=fill及逐船loads，保留原单船载荷和到港领取入口。原planFleet按每艘船的完整采购摘要及船内装货次序准备，全部目标共用一份初始材料预算。原Workflow逐格确认许可，原请求仍一次一格，并以typed奖励、货船和完整库存复读确认。未知、拒绝或摘要变化停止。补回前端原货船准备路由。改动src/fleet.mjs、src/function-contracts.mjs、src/operation-service.mjs、src/server.mjs、src/page.mjs、src/gameplay-page.mjs及其定向测试。Service、HTTP和页面VM三项通过，覆盖两船三格结算、累计不足、旧单船载荷、过期摘要和预算篡改。新增24格准备、25格零读取拒绝及第13格UNKNOWN停止余下11格的Service回归，跨船定向2/2通过；本地R7定向覆盖24格全部成功及第13格UNKNOWN后停止，2/2通过，验证两艘装货船、第三船保持、完整库存、持久历史及父预算关闭。浏览器E2E及全平台离线模拟仍属R7，R8 NOT_RUN。| 继续W16/W19原DAG有据业务；同页邮件及多船到港组合纳入R7，缺证操作局部冻结。 | D6/未知成本/未证身份仅冻结具体操作；不推导全包完成 | 本批提交（父86ab4e5）；此前成果保留 | 本批未新增或执行测试；仅源语法、完整PAGE脚本编译及diff静态检查，非测试PASS，R7须覆盖原投影一致/未知来源、目标变化重调查、节点缓存/账号/迟到控件及原Service预算/History/UNKNOWN链。历史证据（本轮未重跑）：原fleet/HTTP/PAGE专项；本轮未重跑  货船组合未新增/执行测试；源语法、原浏览器函数仅编译及diff为静态检查，非PASS。R7补选格/累计同物资不足、原typed净扣净入/末格出航、完整状态变化、原Workflow逐批授权/拒绝/UNKNOWN、账号/代次/Client/迟到/编辑失效、原单格与恢复兼容；R7/R8 NOT_RUN，REAL_UNVERIFIED。 本批未新增/运行测试；七源node --check、原浏览器函数只编译及diff仅静态检查，非测试PASS。R7须补1/24船、重复/坏参数、航次/奖励/配置变化、原单船typed及完整库存/其他船、零成本父预算、逐船单次授权、拒绝/UNKNOWN、草稿/编辑/迟到及账号角色世界Client连接代次、原装货准备与恢复兼容。R7/R8 NOT_RUN。  2026-11-19 W05多船到港领取R7：新增原Fleet/Service/Workflow单船、双船、24船成功及首/次/末船UNKNOWN，验证逐船单次授权、合成响应结构与完整库存净入、派发前持久意图、零成本父预算及UNKNOWN不重放；准备阶段拒绝重复/稀疏/超24/恶意访问器/时长越界以及航次、奖励或状态变化，零派发。原本地HTTP新增双船成功/首船拒绝/UNKNOWN及单次许可重放拒绝；完整页面VM新增默认未选、同源图和奖励/预算篡改、选择变化迟到拒绝。cargo-operations、cargo-service、fleet、farm-forge-full-page四文件1381/1381通过（141.98秒，0失败/取消/跳过）；HTTP定向3/3通过（6.68秒），与四文件不重叠。未运行真实浏览器E2E或真实游戏；原24船HTTP/页面、身份变化、末船拒绝及其他原R7边界仍待覆盖，W05 PARTIAL、R7 IN_PROGRESS、R8 NOT_RUN。   2026-11-19 W05到港组合Edge及本地Codec：复用原HTTP合成货船夹具并改用仓库实际协议encode/decode；Edge专业页默认未选，明确两船后载入原Workflow，模拟零派发、零运行时；成功路径逐船确认及完整库存净入，首船UNKNOWN路径不派发第二船。核对各节点历史、父预算CLOSED、跨账号空历史及无真实Client/全量采集。HTTP成功/拒绝/UNKNOWN三项与Edge成功/UNKNOWN两项联合5/5通过（21.67秒，0失败/取消/跳过）；真实Codec仅本地合成响应，非真实游戏验收。仍欠24船HTTP/浏览器及其他原身份/拒绝边界、全平台完整离线模拟；W05 PARTIAL、R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。   2026-11-19 W05到港组合边界续验：本地真实Codec/合成传输的24船HTTP依次单次授权，成功、末船UNKNOWN和末船拒绝均核对24笔节点历史、结果、库存及关闭父预算；准备和执行调查期间分别注入账号、角色、世界、代次、连接、Client、断连和取消，16项均零派发且无未决历史。连同原双船HTTP和Edge成功/UNKNOWN共24/24通过（94.17秒）。完整页面VM最大24船及原篡改/迟到共5/5（2.42秒）；Edge另完成24船默认未选、明确选择、原图载入和模拟零派发1/1（6.28秒），未在Edge逐船执行24次。均无失败/取消/跳过，未连接真实游戏；仍有其他W05边界、全平台完整离线模拟和R7未完成，R8 NOT_RUN、REAL_UNVERIFIED。 |
| W10 PARTIAL | 科技专业树、下一等级/实际扣点及复读已接原联盟链；本批精确点数净扣/其他库存及非目标已研究科技不变复用公共差额，原缺行零级与列表顺序兼容保留  本批C306/C307：明确1至24项不同科技的当前下一等级，原allianceTechView提供参数/原actionId选择，planAlliance逐项单级并共用Ledger核全部初始自有科技点。原Service只读准备API、专业树多选与Workflow逐项ACTION→VERIFY同源；仅当前已满足前置者可选，不模拟未来解锁。原typed等级、全部其他已研究科技及完整库存精确扣点验证、单次授权/父预算/History/UNKNOWN保持，无新请求或恢复分支。 | 继续W19原Tasks/Dailies有限声明尚未接入的明确目标业务；直接复用原Function/Service，不增加调度/历史/恢复机制，缺冷却/日界证据保持局部冻结。 | 重置成本/资格/恢复缺证，不能由单级升级完成推导重置完成 | 本批提交（父a20e108）；原成果保留 | 本批定向结果共用W09的244/200/29项，不重复计数，REAL_UNVERIFIED  本批未新增或执行测试；四源语法、浏览器函数仅编译及diff仅静态检查，非测试PASS。R7补1/24科技、重复/坏参数、精确下一等级/赛季阶段/原前置上限、单项足额但累计点数不足、两类点数与原typed完整表/库存验证、逐项授权/拒绝/UNKNOWN、旧单级/其他联盟业务及选择编辑/迟到/scope隔离；R7/R8 NOT_RUN。   2026-11-19 W10/C306/C307联盟科技组合R7：原准备器新增1/24目标、两类科技点累计预算、重复/稀疏/超限/访问器/时间边界、下一等级、不可借未来升级满足前置及单项足额但累计不足。原Registry/Service/Workflow经真实本地Codec与合成传输，双目标覆盖成功/首项拒绝/UNKNOWN，24目标覆盖成功/末项拒绝/UNKNOWN，逐项单次授权、两个固定点数预算、历史及重放拒绝；Edge验证两目标默认未选、同源图、模拟零派发、逐项授权及UNKNOWN停止。alliance-tech整文件51/51通过（3.02秒）；HTTP/Edge定向8/8通过（72.51秒），0失败/取消/跳过，两个集合不重叠。首轮HTTP测试因测试夹具使用裸模块缺dependencyVersions而失败，改为实际注册Function后通过，不涉及生产代码修改。仍欠24目标页面/Edge、账号角色世界连接Client代次及配置变化等原边界、全平台完整模拟；W10 PARTIAL、R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。   2026-11-19 W10/C306/C307续验：原本地Codec/合成传输下，在科技组合准备及执行调查时分别注入账号、角色、世界、代次、连接、Client、断连、取消、配置成本变化，18项均零派发、无未决历史；Edge另核24项默认未选、明确选择、双点数固定预算、原Workflow加载和模拟零派发。与原双目标HTTP/Edge、24目标HTTP成功/末项拒绝/UNKNOWN联合27/27通过（78.12秒，0失败/取消/跳过）。Edge 24项仅准备和模拟，未逐项执行；未测试真实游戏。页面草稿/迟到/篡改及其他原范围、全平台完整模拟仍待验证；W10 PARTIAL、R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。   2026-11-19 W10/C306/C307页面草稿续验：完整页面VM新增11项，核对默认未选、成功同源图，以及账号/联盟/阶段/成本/预算/图篡改、选择/时长/编辑器和A→B→A切换后的迟到响应；不自动授权或执行。Edge以本地HTTP实际准备结果测试预算篡改错误及用户编辑后迟到结果不覆盖草稿，2/2通过（7.84秒）。alliance-tech与farm-forge-full-page两整文件1262/1262通过（15.65秒），0失败/取消/跳过；Edge两项不在前述文件集合。仅测试修改、合成传输与本地Codec；其他原W10及全平台完整模拟未完成，R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。 |
| W14 PARTIAL | 原Fleet编队/维修/停止/移动、港口装货/领奖、精确资源田放弃和有界观察保留；完整库存同源与精确净扣净入、原Service/父预算/History/拒绝/UNKNOWN保持。1e23bab停止维修/委任持久凭据及只读恢复保留。本批舰队编组保存复用唯一fleetFormationAction和fleetFormationBuildings：原活体验证回调将明确buildingId、原参数、完整前后舰队阵容及scope白名单保存为verifiedReceipt；原恢复collector经同一OnWater投影和verifyFleet独立复核，仅原凭据完整、scope一致、目标阵容及其他舰队确认才APPLIED。原通用API/历史页入口复用，无新执行器、许可或写请求；当前阵容匹配但缺凭据仍UNKNOWN，跨重连/重启不解除。  本批维修/移动及货船装货/领奖复用原请求描述、完整库存解析与verifyFleet；原成功验证回调持久化最小目标/航次、成本、typed奖励及完整前后库存凭据。原恢复入口独立MyFleets或CargoShips加AllItem/AllResource，仅原凭据完整、同scope且原验证器再次确认才APPLIED；现状匹配不替代凭据，其他库存变化或跨重连/重启仍UNKNOWN，不重发/续权/恢复执行。 本批资源田放弃仅复用原私有封印验证成功回调留存凭据；原MyResFields/完整库存/MyResFields双读调查与原精确目标移除比较同源，四次查询边界均核原Service归属。原同scope凭据完整、指定田移除且其他田/上限/库存不变才APPLIED；当前田缺失不证明原操作或收益。原活体私有校验、请求、预算及写入口保持。 本批舰队城市调查复用原海战worldObservationQuery，支持明确screenCenter，默认(0,0)及原查询数量保持；移动候选/重新调查/持久凭据保留同一视野，原API与Workflow Contract同源。专业页新增坐标草稿及本次响应城市范围，草稿撤旧计划/授权，应用后须重调查；Workflow展示同一视野来源，不推全图、攻击或占领。 本批C131–C133、BIZ-R04/PRO-004关联：货船明确多格有限组合已实现，原合同与边界见W05；非新增执行器或恢复分支。 本批C407/BIZ-L08维修子项：明确选择1至24艘当前合格舰队，原planFleet一次确认全部选择、原优先序/累计maximumRepairPetrolPerPlan/汽油保留线后，原Service准备API与专业页生成逐舰ACTION→VERIFY。每步原舰队/维修参数/成本/配置摘要锁定规划，实际动作参数、请求、beforeState、identity及verifyFleet/原恢复不变；父预算仅准备时原总汽油，不补油、不派遣、不推断全部维修完成。目标/配置变化、拒绝及UNKNOWN停止，编辑撤旧计划/授权，账号/Client/代次/迟到结果隔离。 本批C133/BIZ-R04多艘到港明确领取复用原单船合同、原cargo准备API/专业页和原Workflow，详细交付与R7范围共用W05；无新请求、结算器或恢复分支。 本批C407/BIZ-L08：原多舰维修准备端点/表单扩展明确stop-repair或stop-auto-fight，1至24艘同类动作逐舰ACTION→VERIFY；复用原StopRepairing/SetFleetAutoFight(false)、planFleet和MyFleets停止验证，无新请求/结算器/恢复分支。原expectedRepairHash仅规划守卫并区分动作，旧维修摘要与省略action格式保持；停止零父资源支出、不顺带开委任/维修/派遣，状态或配置变化、拒绝/UNKNOWN停止。 本批原资源田放弃：明确1至24个已占网格（含0），同次私有完整调查只重绑定原参数，planFleet/唯一GiveUpResField请求与原verifyFleet完整列表移除/库存不变验证复用。原Service准备API、舰队页不默认多选、Workflow逐田ACTION→VERIFY同源，固定原world:grid父UID预算，零资源支出；每田重新调查和单次授权，拒绝/UNKNOWN停止，不占田或领取收益，无恢复扩展。 本批C407/BIZ-L08原定点移动：明确1至24艘不同舰队向同一当前视野城市逐舰移动，复用原planFleet一次核全部初始汽油、城市归属/地图成本和累计保留线。原Service只读准备API、舰队专业页同城候选多选与Workflow逐舰ACTION→VERIFY同源；参数沿原buildingId/cityId/screenCenter/actionId，每步重新调查并单次授权当前具体成本，父汽油预算固定，不以收入扩额。原MyFleets/完整库存净扣验证、拒绝/UNKNOWN/重启只读保持；不推全图、跟随、攻击或到达后的胜利，无新请求或恢复分支。 本批W14/BIZ-R11/PRO-009：明确1至10个不同无人防守世界宝藏，各目标分配不重复的自有空闲舰队组（每组沿原maxFleets上限）。原六源共用调查及逐目标Rank/Defence、原planTreasure/verifyTreasure，接Service只读准备API /api/gameplay/treasure/prepare、专业页明确分组及原Workflow逐目标ACTION→VERIFY。目标摘要固定原赛季/次数/配置与目标状态，逐舰摘要只绑定本组；固定初始汽油父预算/原保留线及目标/舰队UID，每项新调查、单次授权，变化/拒绝/UNKNOWN停止；原单项兼容，仅证派遣与完整库存精确汽油净扣，不证占有、战果、奖励或日界，无新执行/恢复体系。实际修改src/treasure.mjs、src/function-contracts.mjs、src/operation-service.mjs、src/server.mjs、src/gameplay-page.mjs及本行。 | 继续W19原Tasks/Dailies有限声明尚未接入的明确目标业务；直接复用原Function/Service，不增加调度/历史/恢复机制，缺冷却/日界证据保持局部冻结。 | 攻击/宣战/模式结算、D6内道具加速、非零Pet、占田及其他原缺证保留；放弃不领取收益。在线奖空请求不能指定档位，DAILY_WORLD_ONLINE_RWD及客户端时区20/21点窗口不证明账号策略或同次结算/恢复归属；不从GotReward或updateTime推导可领。W14 PARTIAL，R7/R8 NOT_RUN | 本批提交（父326dd8e）；原成果保留 | 本批未新增或执行测试；fleet/recovery/contracts三源node --check与diff仅静态检查，非测试PASS。R7补原编组保存→凭据→终态故障→独立OnWater复核，缺/坏凭据、参数/目标/原阵容冲突、重复或稀疏建筑、未知/空/非零宠物阵容、其他舰队变化、账号/角色/世界/连接/代次/Client隔离、迟到/取消/持久化故障、零业务写零续权及原Formation/停止恢复和Service预算链；此前R7债务/历史证据保留不累计，REAL_UNVERIFIED。  本批未新增或执行测试；三源node --check和git diff --check仅静态检查。R7补维修开始/完成、零费及付费移动、汽油精确净扣、装货单格/末格出航、到港原typed奖励/新船、完整库存无关变化、坏/缺/冲突凭据、未知耐久与身份、同scope及跨账号/角色/世界/Client/连接/代次、取消/迟到/磁盘失败与零写零续权；R7/R8 NOT_RUN，REAL_UNVERIFIED。  本批资源田恢复未新增或执行测试；仅三源语法/diff静态检查。R7补gridIdx=0、完整前后列表/非目标/上限/库存、重复/稀疏/未知字段、私有封印和revision、四次读之间身份切换/取消、坏/缺原凭据及零写零收益推定；原放弃Service/父预算/History和其他恢复回归待统一执行。  本批未新增/执行测试；六源语法、原浏览器函数只编译及diff仅静态检查。R7补默认/显式零与负坐标、缺失/重复/继承/getter/坏坐标、页面草稿与旧视野失效、Workflow参数同步、移动fresh survey及成功凭据同视野、旧历史兼容、货船/资源田独立与零新增请求；R7/R8 NOT_RUN，REAL_UNVERIFIED。 本批货船组合静态检查及R7待测范围见W05，不重复累计。 本批未新增/运行测试；五源node --check、原浏览器函数仅编译及diff为静态检查，非测试PASS。R7补明确多舰/重复坏参数/1与24舰边界、原排序与累计限额/保留线/共享父预算、原完整库存净扣及开始或完成、逐舰状态/成本/配置变化、WAIT_NATURAL/UNKNOWN/拒绝停止、草稿编辑/迟到/账号角色世界Client连接代次、旧单舰及恢复兼容。R7/R8 NOT_RUN，REAL_UNVERIFIED。 本维护批次未新增或执行测试；三源语法/浏览器函数只编译/diff仅静态检查。R7补三种维护模式/旧省略action、1/24舰/重复/坏输入、同舰不同动作摘要冲突、旧维修优先序/汽油限额、原停止请求/独立复读/零资源父预算、状态/配置变化、逐舰授权拒绝/UNKNOWN和草稿/迟到/账号Client连接代次；旧单舰及恢复兼容保留待回归，R7/R8 NOT_RUN。 本批未新增或执行测试；四源语法、浏览器函数只编译及diff仅静态检查。R7补0/1/24网格、重复/非自有/坏字段/访问器、原私有来源与配置隔离、每田完整列表/上限/非目标/库存不变、父world:grid UID预算、逐项授权/拒绝/UNKNOWN、旧单田及原恢复兼容、草稿/迟到/scope隔离；R7/R8 NOT_RUN。 本批未新增或执行测试；四源语法、浏览器函数仅编译及diff为静态检查，非测试PASS。R7补1/24舰、重复/坏参数及显式/默认视野、同盟零费/地图费用未知、单舰足油但累计或保留线不足、原移动/到达与完整净扣、固定父预算/逐舰授权/拒绝/UNKNOWN、旧单舰兼容及目标/时长编辑与迟到/scope隔离；R7/R8 NOT_RUN。  本批未新增或执行功能测试；源码语法/PAGE脚本编译与diff仅静态检查。R7补1/10目标、每组1/10与策略上限、重复UID/舰队/坏参数/访问器、原Rank/Defence未知或驻军、赛季/次数/目标/本组舰队变化、前项已派舰不影响后组、累计汽油不足/保留线/零成本、原完整库存与关联验证、逐项授权/拒绝/UNKNOWN、路由真实HTTP可达、草稿/编辑/迟到与五维Client隔离、旧单项及完整离线模拟；R7/R8 NOT_RUN，REAL_UNVERIFIED。  2026-11-18集中R7：tests/fleet补原维修夹具缺失耐久值；tests/naval-protocol独立核海战摘要不持久目标明细，同时精确保留Workflow原executionContext。 合同等九文件688/688通过（61.78秒），缓存/海战三文件60/60通过（5.75秒），古董原Workflow定向1/1通过（4.28秒）；共享结果不跨行累计。此批仅测试合同/夹具修正，非业务写链改造，R7 IN_PROGRESS、R8 NOT_RUN。   2026-11-18集中R7（C407/BIZ-L08及原资源田放弃）：tests/fleet.test.mjs复用原Service夹具/真实本地Codec新增29项，覆盖维修/停止维修/关闭委任/同城免费移动各1与24舰，原优先序/累计维修限额/汽油保留线/旧省略action，付费移动原地图费用及累计不足/视野一致，资源田grid0及1/24田私有来源/world:grid UID，逐项独立许可/持久派发意图，第二项拒绝或UNKNOWN停止第三项和终态零重放，坏参数/未占目标/伪造私有来源。tests/gameplay-view.test.mjs新增46项，原计划器生成维护/移动响应、专业页明确选择及原图/预算接线、编辑/迟到/账号/目标/成本/UID/完整田列表/VERIFY篡改隔离。tests/gameplay-api.test.mjs新增12项原HTTP，覆盖维护三类及移动1/24目标准备、Origin/CSRF/writer/未知账号及来源变化CANCELLED=409，零授权/业务派发。实际修复src/fleet.mjs维护嵌套目标先读取getter：先核明确buildingId/expectedRepairHash数据字段，拒绝访问器/混合字段及空目标；src/gameplay-page.mjs维护准备增加原Workflow JSON草稿一致性，迟到响应不覆盖用户编辑。舰队整文件120/120通过（144.31秒）；页面/货船Service/货船动作三整文件211/211通过（8.41秒）；本批HTTP定向12/12通过（6.36秒）。最后补空目标边界后维护/Schema定向4/4通过（1.71秒，重叠不累计）；历史runId/图ID及原错误码的新增测试假设已纠正，未改原合同。仅合成状态/本地协议/HTTP/VM页面，非浏览器E2E；付费移动完整Service、资源田HTTP、多宝藏组合及完整离线模拟等原债务保留，W14 PARTIAL、R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。实际修改上述2源/3测试及本行。  2026-11-18集中R7补W14/BIZ-R11/PRO-009世界宝藏组合派遣：tests/treasure.test.mjs新增34项原Service/Workflow，tests/gameplay-view.test.mjs新增19项页面VM，tests/gameplay-api.test.mjs新增5项真实本地HTTP。覆盖1/10目标与每组1/2/10舰、显式零汽油和累计不足/保留线、原Rank/Defence资格、目标及本组舰队/配置变化、逐项许可及派发前持久意图、精确完整库存与舰队关联、拒绝/UNKNOWN停止及重启零重放、父汽油/UID预算、页面编辑/迟到/篡改和HTTP身份/CSRF/互斥。前两整文件255/255（25.23秒），API整文件422/422（390.90秒），均0失败/取消/跳过；HTTP定向5项已包含，不累计。此批无生产缺陷修正；夹具补原协议必填reward及DefenceFleetInfo，变化后断言按原Runner FAILED/关闭父预算合同核对，未放宽守卫。非浏览器E2E、全范围R7或完整离线模拟，其他原债务保留，R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。 |
| W22 PARTIAL | 原M0–M15/95C/42P/8S/273Inventory及W/R/E/X对账保留；本批仅维护P1-4当前表、README与测试边界  2026-11-18原W22集成模拟新增自有包兑换→工厂单份生产→明确建筑道具加速→另一工厂队列道具加速四步跨领域场景；复用原准备API各自产图节点和同一Workflow/Service/Ledger/History，不新增执行器或模拟生产实现。一个父预算绑定初始自有包及20加速器，原受证兑换来源守卫仅允许已结算材料用于指定生产。每步独立许可，任一位置拒绝/无关库存变化UNKNOWN停止后续，跨账号和重放拒绝；原Workflow Store/History重开只读，缓存历史不查询游戏。实际只修改tests/gameplay-api.test.mjs和本账本，无生产代码变更；仅此四步场景，不宣称全平台完整离线模拟完成。 本批W22/W19补原Tasks跨模块离线模拟：罗盘精确抽取（BIZ-R17c）→居民订单明确SUBMIT，统一固定父预算保留自有券、订单材料、配额及UID。覆盖全成、首项UNKNOWN零订单派发、订单UNKNOWN及拒绝；复核逐项许可、跨账号、许可重放、原库存净变化、持久历史重开及父预算关闭。改动tests/gameplay-api.test.mjs和本行。四项新场景及原罗盘HTTP/Edge、双订单专项联合9/9，0失败/跳过。仅本地HTTP及合成协议状态，全平台模拟及R8尚未完成。 | 按§12.4继续原有据业务覆盖，不重做全仓对账 | 完整范围未齐，原具体缺证保留；R7/R8 NOT_RUN | 本行所在提交（父57b0990）；ecbcfa2保留 | 当前表原ID/状态分类不变；原五份未跟踪输入保留，baseline哈希复核不变  本批与W04共用gameplay-api整文件467/467通过（415.17秒，0失败/取消/跳过），新增跨领域9项及加速HTTP8项；17项定向67.06秒已含整文件不累计。覆盖固定父预算/每步DISPATCHING先落盘/节点关联、同账号三模块连续成功、每步拒绝或UNKNOWN终止、跨账号不可授权/不可读历史、许可重放拒绝、重开无授权/不可续跑和磁盘字节不变；clientFactory/全量collector均0调用。原其他领域完整模拟、真实浏览器E2E及R7剩余覆盖未完成，R8 NOT_RUN。  2026-11-18修复前端操作入口遗漏25条既有业务准备路由。联盟、舰队、成长、贸易、任务等专业页通过原operationMutation进入已注册Service，原账号、CSRF和精确路径检查继续生效。src/page.mjs保留34条已注册的精确准备路径。完整页面VM、Operations页面和Cargo Service三文件1322/1322通过（13.16秒）。真实浏览器E2E和全平台离线模拟仍属R7，R8 NOT_RUN。   2026-11-20集中R7安全全量续验：044ef4c干净基线，启用安装Edge，原130个test文件按4并发运行；继续排除capture-cli/capture-recovery-process/capture-system/capture-transaction/mitm-ca-query/mitm-proxy/proxy-backup七文件，不改变原验收范围或将排除项算PASS。node --test --test-concurrency=4的明确文件集合最终9866/9866 PASS，0 fail/cancelled/skipped/todo，1592.55秒，Node退出码0。原始完整日志、130文件manifest及exit-code.txt位于C:/Users/zyk-o/AppData/Local/Temp/cw-r7-044ef4c-resume-avnx49zx/；外层Python仅在打印末尾含对勾摘要时遇GBK编码异常而返回1，已独立读取原日志总计及保存的Node退出码0，未重跑或掩盖失败。该进程在读取gameplay-api旧文件后才加入W19测试，故基线9866不冒充a4fb5a4最终HEAD全套；a4fb5a4新增W19矩阵另以最终56/56联合验证（含与基线重叠的原场景），不累计数字。两提交之间只有测试和本路线图变化，无生产源码变化。复用上一段同044ef4c的29组离线自检结果，素材检查跳过；world_map.world_map1.json权威来源/文件缺口仍保留，未伪造补齐或连接下载。原完整平台离线模拟、其余各W/C/P/S/Inventory交付及R8未完成，R7 IN_PROGRESS、R8 NOT_RUN，Goal ACTIVE；E01–E24具体真实授权清单仍须全部可独立工作完成后再生成。 |
| W03 PARTIAL | 保留原资产archive/verify/restore及普通凭证显式导入。本批修复原worlds.listWorlds/listGroup/describeRole/describeWorld：真实Codec的角色ID、列表区服键、出生服和当前世界均按精确signed int64保留，安全值仍数值、大值十进制字符串；不改原通用normalize。缺失/继承默认/非法/冲突身份为未知，列表缺失不补空。原GET /api/worlds复用busy锁及activeTask，响应复核账号/角色/世界/连接/代次与client事实，旧读取不释放后继锁。原区服页面分别展示各身份，读取中清空、错账号拒绝；enter/输入继续禁用 | 原剩余范围及具体缺证保留；本轮统一下一项见§12.4，已交子集不重复施工 | 原LoginRequest仅worldId目标，没有角色ID/出生服条件或existingRoleOnly；列表观察不保证未来登录不会隐式新建，故切服写产品链未闭合，不能以本次只读修复标写完成。map-1/上游来源哈希缺证，归档complete=false；扫码/捕获未开放。R7/R8未执行 | c87947b；凭证导入b78878e及原资产成果保留 | 2026-11-15：server-runtime/account-view/cli-safety三文件106/106 PASS，0 fail/cancel/skip/todo，12.81秒。含真实本地Codec大int64、合服键分离、坏/缺失/冲突/原型默认、只读/零隐式连接、账号隔离、九种迟到身份变化、互斥/断开/后继锁、原POST enter403及CLI读凭证前写拒绝；3源语法/diff检查通过。全为合成凭证/回环HTTP/离线Codec，REAL_UNVERIFIED |
| W13 PARTIAL | 原48项采集、FishBaseCfg/FishStageCfg唯一积分及显式rewardId/下一档门槛投影保留；本批API、Explorer、CLI和钓鱼页复用原私有采集绑定检查账号/角色/世界/连接/代次/Client，失效或恢复缓存不显示当前资格。统一投影公开逐源未知原因、只读/不可执行标记；页面和CLI区分总分、已用积分、已领档位、下一档门槛及未知原因，无新增请求、积分器或写计划 | 继续原DAG有据能力；R7验证缓存失效与同源输出，领奖/收线须各自先解决原目标身份缺证 | DrawFishReward空请求无档位条件；GainBigFish缺可恢复待捕鱼身份及过期权威读源，继续BLOCKED_EVIDENCE；门槛达到不代表可执行领奖或到账，W13仍PARTIAL | 本行所在提交（父6a931a5）；原285186f保留 | 本批未新增或运行测试；仅源码语法、整页内联脚本编译和diff静态检查，非测试PASS。R7待覆盖五维/Client/恢复/迟到、失败优先于旧SUCCESS、各只读入口一致和原写链零扩展。原35/35仅历史证据未重跑、不累计；REAL_UNVERIFIED，R7/R8 NOT_RUN   2026-11-19 W13/C152只读R7：tests/explorer-api.test.mjs新增9项账号/角色/世界/代次/连接/Client/断连/非READY/快照替换失效；Overview和Explorer均不再给资格，恢复旧身份不复活，显式合成重采才重新观察。另覆盖未绑定恢复缓存未知、失败覆盖旧SUCCESS且独立库存保留。fishing-view、explorer-api、explorer-view、data-catalog四文件联合94/94通过（5.20秒，0失败/取消/跳过），含原真实本地Codec/配置、CLI、页面VM和48查询合同；仅离线合成，无Client创建或隐式采集。未执行真实浏览器E2E/真实游戏，领奖和收线仍缺目标身份证据冻结，W13 PARTIAL、R7 IN_PROGRESS、R8 NOT_RUN。 |
| W16 PARTIAL |原任务/邮件/挂机/周礼包及招募成果、赠礼共同解析保留。本批BIZ-R15复用原OnWater缓存，观察明确种类ID/数量及GarbageProductionCfg类型/产物，普通拾取与打捞分开，不借用潜水表；原dailyChecklist、日常API/总览/页面同源，无新查询/动作/许可 本批任务ID选择仅消费原view.tasks和明确daily来源的已解析列表，不新增查询/任务算法；主支线、成就和每日来源分开，未观察类型保留明确ID调查入口，不根据列表出现推导可领取或到账。 本批日活跃档位复用activityDefinition，周芯片/开服档位复用原definition函数；原Service视图公开只读targetSelection，页面选择后更新原参数并重新调查。  本批累计招募任务与招募写状态复用唯一task字段解析器；英雄/古董任务仅依赖同次RecruitInfo明确times/gotId、原始来源时间、私有活体摘要/五维Client身份及配置季校验。英雄/广播站/库存或无关招募字段失效不再隐藏可靠任务观察；写入仍要求原完整authority，累计领奖仍无候选/许可。  本批主/支线及成就只读资格复用原parseTaskObservation/taskConfigurationRow/taskTarget/taskQualification，以原查询私有活体封印、五维Client身份及原sourceAt绑定；可靠任务观察与库存/奖励映射失败分离。原API、专业页和Workflow同一view分别公开进度、目标、完成/奖励记录及到账UNKNOWN，不生成额外请求或许可，原领取候选及完整库存净入验证保持。 本批原FREE_RECRUIT具名WAIT允许明确recruit=antique，省略仍为英雄；同一RecruitInfo/可信Ping投影按来源隔离英雄/古董截止，原统一入口、原生WAIT表单及History同源。两次调查均经原Function/Service，目标来源及截止必须相同、到期复读确认；草稿编辑撤旧计划/授权，不新建调度或业务写，不解除拒绝/UNKNOWN，重启只读。 本批招募冷却/任务观察共用原RecruitInfo独立字段事实，截止解析与写状态同源；无关英雄/广播站/库存失败不再隐藏可靠冷却，缺时钟只显示原截止、到期UNKNOWN。原写authority不变。 本批普通免费点金复用原单次请求、完整状态投影及唯一typed GOLD/同标记freeTimes加一/全库存净入比较；原live私有封印、配置、原候选及可信时段校验保持。原Service成功回调保存目标合同摘要、原完整前后状态、明确写前GOLD（含零）和最小typed金额。原只读恢复/API/History沿ClickGoldInfo→完整库存→ClickGoldInfo双读，仅同scope、原成功凭据和未过期可信Ping共同确认才APPLIED；原凭据缺失、跨周期/身份/重连或其他库存变化仍UNKNOWN，不重发/续权/恢复任务。 本批主线/支线/成就领取的原请求描述、标准化任务状态和完整库存结算比较同源；原Service成功回调保存精确目标合同摘要、配置奖励、完整前后状态及写前完整余额（含明确零）。原恢复API独立任务→库存→任务双读，仅同scope原成功凭据及唯一结算比较共同确认才APPLIED；当前已领/支线消失/库存匹配不替代凭据，无重放/续权。每日/周活动原合同与缺证保持。 本批英雄/古董免费及自有1/10/50券招募复用原合同、Hero/Antique完整解析、typed奖励及唯一净扣净入/套装派生比较；原Service成功回调保存最小typed结算、原可信时钟和完整前后状态。原复核API读取原五/六种来源并双读RecruitInfo，仅同scope完整成功凭据与新可信Ping共同确认才APPLIED；单次仍须明确未来冷却，古董转换/新增/套装/英雄派生差异保留原守卫。缺凭据、跨连接或无关变化仍UNKNOWN，不重招/续权/恢复或累计领奖。 本批经验试炼raid1下一首通复用原请求、状态及typed奖励解析和唯一期望/净入比较；原Service成功回调保存同scope完整前后状态及最小结算凭据。原恢复API按raid→英雄/完整库存→raid五读独立确认，缺凭据、进度/次数或无关状态变化保持UNKNOWN，不重打/续权/恢复或扫荡。 本批日常任务/日活跃/免费赠礼的原请求、状态与期望净入同源，Service成功回调保存最小结算、完整前后状态及明确原余额（含零）。原恢复API四读原信息→完整库存→原信息，同scope成功凭据和原周期可信Ping或赠礼原样标记均确认才APPLIED；当前已领不替代凭据，不重领/续权/恢复。 本批周转盘/翻牌/芯片1000号免费礼包及芯片同轮任务复用原日常解析、请求、期望状态、typed结算与成功凭据回调；原恢复API按业务信息/WeekInfo/完整库存/WeekInfo/业务信息六读，仅同scope完整成功凭据及原窗口可信Ping确认才APPLIED。跨轮最后任务、缺凭据/周期或其他状态变化仍UNKNOWN，零重领/续权/恢复。 本批旧Dailies executeDailyDriver从原三模块接至已在Loop声明支持的九类日常Function具体动作，直接复用原DAILY_DRIVERS的functionId/actionTypes，Loop移除重复模块映射；原lookup、单次permit、父预算/持久History/UNKNOWN及各域复读不变。只接英雄招募、有限主线、普通挂机收益、免费点金、货船单格、试炼首通、扫荡、联盟订单和Museum出发，不混入古董招募/挂机升级/到港奖/其他联盟Museum动作。旧1004复用原AFK区间解析与61秒可信Ping资格，保留精确区间、缺时钟/身份变化UNKNOWN，不再错误等待整段到期；1012/1016改为要求精确目标及原Function，不虚构服务器拒绝。未证明日常完成、奖励到账或新增恢复。 本批BIZ-D06/C503原普通免费点金增加当前resetTime内明确1至24次的有限组合，限准备时可靠剩余额度；复用原单次请求、typed GOLD/完整库存及同周期次数加一验证。专业页明确次数/时长→原Service只读准备API→原Workflow逐次ACTION/VERIFY，固定原配额/slot UID父预算，不预测金额或以收入扩额度。每步完整gold-info预期只作规划守卫，原动作参数/身份/结算/恢复合同保留；状态/周期变化、拒绝或UNKNOWN停止，不付费、不发批量请求、不跨周期/重启续领，草稿修改撤旧计划/授权，迟到和账号编辑变化丢弃旧结果。 本批BIZ-D09/P6-2：固定v76 RaidItem._onBtnGo和TrialRaidUtil三副本枚举/下一关算法及原TrialRaidCfg/TrialRaidStageCfg证实强化石raid2、海兽经验raid3首通共用原零支出请求；扩展唯一trial-challenge接受明确raidId=1/2/3，省略{}仍英雄经验raid1。原survey、parseRaid、目录/下关、typed回执及完整英雄/库存/扫荡计数验证按副本同源，未新增执行器/解析器。原API/专业页/原生Workflow及Dailies1009/Loop共用参数；选择变更撤旧计划/授权并重新调查。原成功回调/只读恢复共用路径仅以原目标raidId读取并绑定参数、前后状态、回执和配额/UID，旧raid1历史格式保留，缺凭据或跨身份仍UNKNOWN；不增加恢复分支。 本批C511/BIZ-A11/BIZ-R10：明确同页1至10封普通附件或完整空附件未读邮件有限读领；复用唯一claimObservation、单封请求与完整库存验证。原Service只读准备API重新读取所选页，原专业页明确勾选后生成原Workflow逐封ACTION→VERIFY；expectedMailHash绑定原账号/角色/世界/连接/代次、邮件动作/状态/附件/配置，原逐封UID父预算、单次授权/拒绝/UNKNOWN保持。all=true、实例附件和原子全邮箱仍冻结，旧单封/枚举入口保留，无恢复扩展。 本批BIZ-D09/P6-2：英雄经验、强化石、海兽经验三类副本可明确从当前下一关至指定配置末关、最多24关有限首通。原Function新增可选精确stageId守卫，仍用唯一nextTrialStage/catalog、请求和typed奖励/完整库存英雄次数验证；原Service只读准备、专业页和Workflow同源，逐关原配额/UID父预算与单次授权。配置目标不证明未来胜利/到账，进度变化、拒绝或UNKNOWN停止，不扫荡/购买/重试，原单场及既有恢复保持。 本批C503/C516、BIZ-D18/D19：明确1至24个当前合格日常任务/日活跃档位可准备同周期逐项收尾；唯一原候选重绑定已采集DailyInfo与完整库存，无新增游戏查询或奖励算法，原Workflow先任务后活跃ACTION→VERIFY。专业页/原Service准备API及Tasks/Dailies/Loop同源expectedResetTime固定原服务器重置秒；原完整结算、单次授权/父UID预算/History/拒绝/UNKNOWN保持，不预支活跃资格或奖励。 本批C502/C503/C515、BIZ-A10：明确选择1至24个当前合格主线/支线或同源成就奖励，复用原candidate、taskQualification、精确已领/移除及完整库存净入；同次已采集事实只重绑定明确参数，无新游戏查询。原Service准备API/专业页/Workflow逐项ACTION→VERIFY，固定原task-reward UID父预算及单次授权；不混主支与成就来源，不追加未来任务或以收入扩预算，不扩恢复。 本批C516/C517：原任务收尾API/专业表单/Workflow扩展明确1至24个同轮周芯片或同模式开服订单/闯关/剿匪/战争档位。只重绑定原同次私有调查，原chipTaskCandidate/openRankTaskCandidate、奖励定义/季节策略、请求及完整库存验证唯一；无新增查询/参数/请求/恢复分支。原父UID固定窗口/轮次/任务或档位，每项重新调查和单次授权，奖励不扩预算；周芯片所选总数严格少于原剩余未领数，末任务跨轮继续冻结，开服四模式/主支/成就不混源，未知或拒绝停止。| 继续W19原Tasks/Dailies有限声明尚未接入的明确目标业务；直接复用原Function/Service，不增加调度/历史/恢复机制，缺冷却/日界证据保持局部冻结。 | 拾取写缺当前资格/过期及同次结算恢复归属，礼包码缺资格/已用与独立结算源；仅局部冻结。累计招募空请求档位、VIP/实例附件/每日订单/周周期及其他原缺口保留，W16 PARTIAL，R7/R8 NOT_RUN | 本批提交（父2cfd5ca）；此前成果保留 | 本批未新增或执行测试；四源node --check、原浏览器函数静态编译与diff仅静态检查，非测试PASS。R7待覆盖任务观察在库存/奖励坏时独立、三类目标/配置/精确int64、未知/已领记录非到账、战令Info与WeekInfo分别缺失/冲突/坏字段/过期/窗口不绑定、五维Client/重启/迟到隔离、零新增请求或写及原领取净入/授权/预算/History链；此前R7债务及历史证据保留，不重复累计。R7/R8 NOT_RUN，REAL_UNVERIFIED。  本批未新增或执行测试；四源node --check、原浏览器函数仅编译不执行和diff仅静态检查。R7补英雄旧声明/历史兼容、古董来源及参数、相同秒值不同招募源不混淆、坏/缺来源/可信时钟/截止变化/超上限、两次调查账号隔离及迟到取消、原Tasks/Dailies/Loop编译/原生WAIT/页面草稿失效、只读零业务写、重启零恢复权限和原招募净扣净入/父预算/History链；R7/R8 NOT_RUN，REAL_UNVERIFIED。  本批独立冷却及任务历史静态检查/待R7范围见W19，不重复累计；原写链未执行回归。 点金恢复R7待测范围见W19；静态检查非测试PASS，旧测试未重跑。 本批未新增/运行测试；三源语法与diff仅静态检查。R7补三类原live合同等价、achievement精确int64、主线前移/支线缺失/非目标任务变化、明确零资源和完整库存无关变动、奖励映射/坏凭据/原余额缺失/溢出、同scope/跨账号角色世界Client连接代次、四读间取消迟到、落盘失败和旧历史无凭据仍UNKNOWN；原日常/招募/活动与预算授权共享链统一回归。R7/R8 NOT_RUN，REAL_UNVERIFIED。 本批未新增/执行测试；三源node --check及diff仅静态检查。R7补英雄/古董免费与1/10/50券原live等价、片段/新英雄/新古董/转换混合批次、重复身份/整型溢出/无关英雄库存/套装精通变化、派生属性仅原新古董范围、前后冷却/单次过期/批次原规则/可信时钟回退、六/七读各边界取消迟到、scope及Client隔离、缺坏/旧凭据和原金额UID成本、持久化中断/复核预览确认变化、只读零写零续权，原Tasks/Dailies/Loop/Workflow与舰队/点金/任务/罗盘共享链留R7统一回归。R7/R8 NOT_RUN，REAL_UNVERIFIED。 本批未新增/执行测试；三源node --check和diff仅静态检查。R7补原live等价、passedStage=0及非连续stageId、错raid/stage/typed包、重复坏值溢出、完整库存/英雄/扫荡购买次数变化、双读变化、五读各边界取消迟到及scope/Client隔离、缺坏旧凭据、持久化失败与原共享链。R7/R8 NOT_RUN，REAL_UNVERIFIED。 本批未新增/运行测试；三源node --check和diff仅静态检查。R7补原候选/live等价、明确零余额、错任务/档位/赠礼英雄/标记/季节、完成/资格/已领分离、typed活跃/日周计次/EXP或RUBY精确净入、无关库存/任务变动、缺坏旧凭据、坏字段/访问器/重复/溢出、过期/时钟回退/双读变化、四读边界取消迟到及scope/Client隔离、凭据持久化故障和原共享链。R7/R8 NOT_RUN，REAL_UNVERIFIED。 本批未新增或运行测试；三源node --check与git diff --check仅静态检查。R7补三种免费周礼包/芯片同轮任务原live等价、原活动窗口/期数及六读变化、typed轮次/完整领取列表、明确零余额/完整净入、最后任务跨轮仍阻断、旧/缺/坏凭据及scope/Client/取消/迟到隔离和原共享授权预算链；R7/R8 NOT_RUN，REAL_UNVERIFIED。 本批未新增/运行测试，仅四源语法、静态import/diff检查；静态依赖环与父提交相同，未导入运行时。R7覆盖九类精确动作正负边界、旧三模块兼容、古董/升级/到港/捐赠/展陈排除、有限主线配置、AFK60/61秒/未满整段/坏区间/缺时钟/身份或连接变化、Loop映射等价及原permit/预算/拒绝/History/UNKNOWN；R7/R8 NOT_RUN，REAL_UNVERIFIED。 本批未新增/运行测试，仅五源语法、原浏览器函数仅编译及diff静态检查。R7补明确次数1/24/超额、完整预期状态/周期变更、初始资格/时钟/配置失效、原单次typed金币与全库存净入、固定配额UID预算、逐批授权/拒绝/UNKNOWN、旧空参数/恢复兼容、账号/角色/世界/代次/Client及迟到/控件/草稿失效；R7/R8 NOT_RUN，REAL_UNVERIFIED。 本批未新增/运行测试；六源node --check、原浏览器函数仅编译和diff均为静态检查，非测试PASS。R7补三副本/默认raid1等价、配置关卡与开放等级、非连续stageId/零首通/通关终点、错副本Info/回执/配额/UID/参数、type0配置奖励与完整净入、未知/拒绝/状态变化/跨账号角色世界Client连接代次及迟到隔离；旧raid1凭据/同路径副本读取、坏缺凭据UNKNOWN/零重放、原Function/Service授权预算/History和Dailies/Loop/native表单失效统一回归。R7/R8 NOT_RUN，REAL_UNVERIFIED。 本批未新增/执行测试；源语法、原浏览器函数仅编译及diff为静态检查，非测试PASS。R7补旧单封/枚举等价、同页1/10封和重复/大int64/坏摘要、read/claim/已领/未知/实例分离、原附件及完整库存/其他邮件精确比较、逐封UID父预算/单次授权/拒绝/UNKNOWN、编辑撤旧计划、迟到/账号角色世界Client连接代次、重启只读和零批量请求。R7/R8 NOT_RUN。 本批未新增/运行测试；五源node --check、原浏览器函数仅编译和diff仅静态检查，非测试PASS。R7补三副本/旧默认、显式stageId与非连续stageId、passedStage=0、等级锁/配置坏/完成、1/24关和顺序重复/跳关、逐关quota/UID/typed奖励及完整库存英雄次数、拒绝/UNKNOWN/无重试、API/页面/原生Workflow/Tasks/Dailies同参、草稿及迟到/账号角色世界Client连接代次、原单场及持久凭据兼容。R7/R8 NOT_RUN。 本批未新增或执行测试；七源语法、浏览器函数仅编译及diff仅静态检查。R7补同周期1/24目标、缺失/重复/坏字段、任务/活跃身份、只读三源复用、任务后档位原typed及完整净入、跨周期/到期/配置/草稿/迟到/账号Client连接代次、父UID预算/逐步授权/拒绝/UNKNOWN及旧单次/历史兼容；R7/R8 NOT_RUN。 本批未新增或执行测试；四源语法、浏览器函数只编译及diff仅静态检查。R7补1/24目标、混源/重复/坏输入、原候选等价、完成/可领/已领分离、主线前移UNKNOWN/支线精确移除/成就同ID、累计奖励整数边界、逐步授权和完整净入、父UID预算/拒绝/UNKNOWN、旧单次及恢复兼容、草稿/迟到/scope隔离；R7/R8 NOT_RUN。 本批未新增或运行测试；三源语法、浏览器函数只编译及diff仅静态检查，非测试PASS。R7补1/24目标、同轮/同模式与重复混源拒绝、原候选及配置/季节规则等价、累计奖励整数边界、芯片保留末任务及外部竞争/跨轮阻断、原窗口UID父预算/单次授权/typed或独立完整净入、坏/过期/账号角色世界Client连接代次、编辑/迟到及旧主支成就日常单次/恢复兼容；R7/R8 NOT_RUN。  2026-11-18本批BIZ-D02已有英雄/古董四模式招募补齐Tasks原声明/API/原生表单和专业页同参数接线；完整范围与R7债务共用W19，原Function成本/结算及Dailies1002英雄限制保持。 |
| W17 PARTIAL |2026-11-18 W17 / BIZ-R17c（P6-2，接 W19 Tasks）：罗盘专业页把当前可执行的精确活动、1/5/10/50 次及原抽取候选摘要加入 Tasks 草稿。原 /api/workflows/prepare 编译为原罗盘 ACTION，复用调查、授权、ResourceLedger、ExecutionHistory 及结算验证。抽前状态变动时不替换候选，UNKNOWN 停止。累计领奖、保底资格及外环整轮结算继续冻结。修改 src/loop.mjs、src/gameplay-page.mjs。定向离线 4/4：专业页到原准备 API 的请求合同、成功、UNKNOWN、旧候选零派发。测试修改 tests/compass-wheel.test.mjs、tests/farm-forge-full-page.test.mjs。R7 仍欠真实 HTTP handler 联调、拒绝和完整离线模拟，R8 待独立验收。 dd419e8四模式任务单档及97f671f子活动只读保留。本批BIZ-R17c默认关闭的compass-wheel Adapter：精确活动ID和1/5/10/50次，私有同账号/角色/世界/连接/代次活动窗口及可信Ping、独立Info.cost×次数和持有券；唯一请求构造复用原Service/父资源配额UID预算/持久History，逐抽配置奖励与typed累计积分、独立times/score/外环和完整库存精确净扣净入共同确认。API/专业页及原生Workflow/有限Loop共用，无自动选活动、补购或重抽 本批罗盘活动选择复用同一windowOf及原私有连接活动来源，无新增请求；账号/角色/世界/连接或事实变化未知。活动身份/窗口观察不证明开放或抽奖资格，抽取次数与原授权、成本、完整库存及UNKNOWN合同保持。 本批开服四类/周芯片目标选择复用原季节及档位定义，不新增领取器；战令目标仅复用已解析任务ID，保持无候选/无写。Workflow读取同一view。  本批战令原Info及WeekInfo解析拆为同一实现的独立只读来源；保留原完整组合解析，任务列表/累计积分/档位记录与窗口分别按原时间、私有摘要及五维Client校验。一个来源坏或缺失不隐藏另一个可靠观察；专业页与API/Workflow同一view显示窗口来源状态。每日epoch、窗口绑定和累计分数同次结算仍缺证，无领取候选或许可。 本批罗盘Info复用原infoOf、私有活体摘要/五维Client及原sourceAt，独立于库存/配置失败保留次数、积分、已领档位、成本/外环/保底原值；同一只读投影接原Function视图/API/专业页和Workflow持久调查历史，精确activityId绑定。不新增请求，原抽取全来源authority/净扣净入保持，累计领取与到账UNKNOWN。 本批原战令task-rewards SURVEY的Info/WeekInfo独立只读投影接入原Workflow Store/API/历史页；固定白名单仅保留明确任务ID/计数/任务已领记录、累计积分/付费激活原值/独立档位记录和type1窗口及各自sourceAt。复用原Info和Window解析器，不重新计算资格、任务周期、窗口归属或积分到账；缺一个来源保留另一个，原任务ID绑定，旧历史无此字段仍兼容，无新请求/候选/许可。 本批罗盘单批抽取复用原逐抽配置/typed回执和唯一Info/完整库存净扣净入比较；原Service成功回调持久化最小已验证结算、完整前后状态与合同摘要。原复核API按精确activityId读取Info→库存→Info，仅原成功凭据、同scope私有活动窗口/可信Ping及同一结算函数共同确认才APPLIED；计次/积分匹配不替代凭据，不重抽/续权/恢复或累计领奖。 本批周转盘/翻牌/芯片1000号免费礼包及芯片同轮任务复用原日常解析、请求、期望状态、typed结算与成功凭据回调；原恢复API按业务信息/WeekInfo/完整库存/WeekInfo/业务信息六读，仅同scope完整成功凭据及原窗口可信Ping确认才APPLIED。跨轮最后任务、缺凭据/周期或其他状态变化仍UNKNOWN，零重领/续权/恢复。 本批C516/C517：原任务收尾API/专业表单/Workflow扩展明确1至24个同轮周芯片或同模式开服订单/闯关/剿匪/战争档位。只重绑定原同次私有调查，原chipTaskCandidate/openRankTaskCandidate、奖励定义/季节策略、请求及完整库存验证唯一；无新增查询/参数/请求/恢复分支。原父UID固定窗口/轮次/任务或档位，每项重新调查和单次授权，奖励不扩预算；周芯片所选总数严格少于原剩余未领数，末任务跨轮继续冻结，开服四模式/主支/成就不混源，未知或拒绝停止。| 继续W19原Tasks/Dailies有限声明尚未接入的明确目标业务；直接复用原Function/Service，不增加调度/历史/恢复机制，缺冷却/日界证据保持局部冻结。 | 已满外环拒绝新抽；本次若产生第八外环或跨轮未知保持UNKNOWN。pity只观察独立原值，不猜公式/奖励资格。ClaimCompassWheelReward/EvilExpelClaim/ClaimActivityDailyActiveReward仅activityId的累计归属、战令epoch、其他周奖/排名及原完整范围缺证保持；W17 PARTIAL，R7/R8 NOT_RUN  本批有界复核REQ-486周翻牌自选：固定v76 SetUniqueLotterySelectRequest仅selectId，没有period/floor条件，原独立结果与同窗口/楼层归属未证明；仅此设置写BLOCKED_EVIDENCE，不反复扩展研究，不阻塞其他业务。| 本批提交（父2cfd5ca）；此前成果保留 | 本批未新增或执行测试；四源node --check、原浏览器函数静态编译与diff仅静态检查，非测试PASS。R7待覆盖任务观察在库存/奖励坏时独立、三类目标/配置/精确int64、未知/已领记录非到账、战令Info与WeekInfo分别缺失/冲突/坏字段/过期/窗口不绑定、五维Client/重启/迟到隔离、零新增请求或写及原领取净入/授权/预算/History链；此前R7债务及历史证据保留，不重复累计。R7/R8 NOT_RUN，REAL_UNVERIFIED。  本批未新增或执行测试；四源node --check、原浏览器函数仅编译不执行、diff仅静态检查。R7补Info可靠但库存/配置坏时独立观察、原sourceAt/过期/私有摘要/账号角色世界Client连接代次隔离、原型缺省/坏字段/外环重复/错误活动ID、Workflow调查目标绑定/持久历史白名单/重启零续权与原抽取成本/typed回执/完整净扣净入/UNKNOWN链。REAL_UNVERIFIED，R7/R8 NOT_RUN。  本批战令只读持久历史待R7范围见W19；静态检查非测试PASS，原epoch/窗口归属/同次积分结算缺证保持。 末次静态审阅同时明确点金恢复状态的null角色/世界身份拒绝，其他原scope校验保留。 本批未新增/执行测试；三源node --check和diff仅静态检查。R7补1/5/10/50原live等价、逐抽奖励与积分/外环/票券精确差额、坏缺原凭据/重复奖励/溢出/第八外环/跨轮、私有窗口或可信时钟变化、Info双读变化、四读各边界取消迟到及账号角色世界Client连接代次隔离、原Service凭据落盘故障/API预览确认变化与零写零续权；原任务/舰队/点金共享链统一回归。R7/R8 NOT_RUN，REAL_UNVERIFIED。 本批未新增或运行测试；三源node --check与git diff --check仅静态检查。R7补三种免费周礼包/芯片同轮任务原live等价、原活动窗口/期数及六读变化、typed轮次/完整领取列表、明确零余额/完整净入、最后任务跨轮仍阻断、旧/缺/坏凭据及scope/Client/取消/迟到隔离和原共享授权预算链；R7/R8 NOT_RUN，REAL_UNVERIFIED。 本批未新增或运行测试；三源语法、浏览器函数只编译及diff仅静态检查，非测试PASS。R7补1/24目标、同轮/同模式与重复混源拒绝、原候选及配置/季节规则等价、累计奖励整数边界、芯片保留末任务及外部竞争/跨轮阻断、原窗口UID父预算/单次授权/typed或独立完整净入、坏/过期/账号角色世界Client连接代次、编辑/迟到及旧主支成就日常单次/恢复兼容；R7/R8 NOT_RUN。 |
| W12 PARTIAL |保留原C151单目标扫荡、权威配额/新鲜度和独立复读；本批日常1010及Loop原表单补齐精确城市与int32 UID，实际注册Function复用原Service/Workflow授权、配额/UID父预算及双持久历史 本批Dailies扫荡表单补原allowLowerLevel明确确认，仍绑定单UID/城市；账号、分组、种类或目标变化及加入声明后清确认；复用原Loop编译与pirate参数校验，原计次/归属缺证保持。  本批C151/P2-8明确1至24个不同UID/城市普通扫荡，原单项Function组合接Service只读准备API POST /api/gameplay/pirate-sweep/prepare、专业页和原Workflow逐项ACTION→VERIFY。expectedSweep仅规划守卫，绑定原可信游戏日、总额度、逐项used计次及目标池/首杀记录/权益配置摘要，原协议仍只发UID/城市；私有采集重绑定仅改参数，不制造新鲜度或未来事实。父配额固定所选次数和不同海盗UID，每步重新调查及单次授权，原独立计次验证成功后继续；低等级逐目标明确确认，变化/拒绝/UNKNOWN停止。修改src/pirate-operations.mjs、src/function-contracts.mjs、src/operation-service.mjs、src/server.mjs、src/gameplay-page.mjs；旧单目标及日常声明兼容，无新执行/恢复体系；计次仍不证明奖励归属。 | 继续原DAG有据能力；扫荡奖励归属、目标变化和跨日恢复缺证保留。 | 已确认计次不证明奖励归属；跨日、目标变化或无法确认结算仍UNKNOWN，禁止自动重放。W12仍PARTIAL，R7/R8未执行 | 本批关联实现（父e1012c0）；此前提交保留 | 本批未编写或执行测试；仅四源语法、完整PAGE脚本编译及diff静态检查，非测试PASS，R7/R8 NOT_RUN。历史结果（本轮未重跑）：与本批W19共用七文件1147/1147，不重复计数；仅离线，REAL_UNVERIFIED  本批未新增或运行功能测试；五源语法、PAGE脚本编译及diff仅静态检查，非功能PASS。R7补1/24目标、重复UID/坏参数/嵌套访问器、低等级逐目标确认、当前额度不足及最终额度耗尽、跨日/目标池/首杀记录/权益/配置/外部计次变化、原私有来源时序和新鲜度、逐项授权/拒绝/UNKNOWN/取消、固定父quota/UID及重启零重放、账号角色世界连接代次/迟到/草稿隔离、旧单项/日常声明兼容与完整离线模拟。R7/R8 NOT_RUN，REAL_UNVERIFIED。 |
| W18 PARTIAL |保留原观察、非亏损卖出、买入7ec3216、每日时段ff18df9及单航段38597d4。本批C524自有商会指针加速复用原Adapter/Service/Executor/资源配额UID预算/History：明确当前cityId/mvToCityId/num，固定TradeSpeedPop自有路径及ItemCfg/ActivityTradeCfg核验道具与时长；仅缩短后仍为可信未来终点，专用终点回执与独立完整Info/库存确认精确道具净扣、相同航段和其他状态不变；购买路径保持独立 本批原trade Function当前港口行情、pid持货、非亏损卖价投影、Radar和航段在原生Workflow候选面板展示；直接复用原视图，不重算价格/收益，不提供缺证目的港策略。  本批C522/P6-3：当前港口明确1至24个持货全批非亏损出售，原saleCandidate/报价/请求及typed+独立完整结算不变；原Service准备API、专业页和Workflow逐批ACTION→VERIFY同源。expectedPeriod/expectedSaleHash只锁原周期、航次、单批持货、价格及配置，不绑定余额或其他批次；每步fresh plan/单次授权，固定原quota/UID父预算，收入不扩额度；变化、拒绝或UNKNOWN停止，旧单次部分出售保留，无恢复扩展。 本批C523/P6-3当前港口明确1至24种不同货物、每种指定数量买入，原buyCandidate/planTrade与共享Ledger累计核全部初始贸易币，按原货物单位容量累计核剩余仓位；原Service准备API、共用买卖表单及Workflow逐货物ACTION→VERIFY。可选expectedPeriod/expectedBuyHash仅绑定原窗口/航次/所选市场价格stock/配置，排除余额和其他货物，旧单次无守卫参数保持。原typed专用回执及独立完整持货/库存验证不变，原市场quota/UID父预算固定，不借预计出售扩额，无新执行/恢复体系。| 继续W07原Pet有据成长业务：先核现有Domain与明确UID/建筑目标，直接复用原请求/计划器/完整结算；培育与成熟领取缺证保持局部冻结，不扩恢复。 | 固定v76的TradeCity仅请求当前cargo.cityId；Radar仅城市/商品/报告者，无目的港价格/时点。旧tradeKing历史表及sellRatio不能证明当前目的港报价；加速至到达边界、补购、多段策略、到达/收益与亏损公式仍未闭合；UNKNOWN持久零重放。W18仍PARTIAL，R7/R8未执行 | 本批提交（父75531fa）；原成果保留 | 本批未新增或执行测试；仅源语法、完整PAGE脚本编译及diff静态检查，非测试PASS，R7须覆盖原投影一致/未知来源、目标变化重调查、节点缓存/账号/迟到控件及原Service预算/History/UNKNOWN链。历史证据（本轮未重跑）：2026-11-14：贸易领域236/236（131.75秒）及随后新增六项6/6（4.91秒）；D6/Contract/Registry/HTTP/两页面/派发新鲜度七文件1061/1061（82.16秒），合计本批8文件1303/1303 PASS，0 fail/cancel/skip/todo。覆盖缺道具/成本/配置/边界、独立精确净扣、UNKNOWN/重启/迟到/五维隔离、意图后失效及跨入口记忆。HTTP拒绝回归先复现1失败：固定本地时钟与真实心跳时基不一致导致权威时钟失效，改为真实本地时钟校验与合成服务器时间；原拒绝记忆断言、1秒心跳及运行时门槛未放宽。前批1777/1777独立保留不累计，REAL_UNVERIFIED  本批未新增或执行测试；五源语法、浏览器函数只编译及diff仅静态检查。R7补1/24批、旧单次/部分出售、重复/坏参数、原非亏损报价及累计余额边界、周期/港口/航次/持货/配置变化、前批成功后后批守卫稳定、typed全结算、父quota/UID预算、逐步授权/拒绝/UNKNOWN及草稿/迟到/scope隔离；R7/R8 NOT_RUN。 本批未新增或执行测试；五源语法、浏览器函数只编译/diff仅静态检查。R7补1/24种/重复/稀疏/坏参数、旧单次及卖出兼容、单种足额但累计币或仓位不足、原maxCount-stock/价格/数量int32边界、周期/窗口/航次/报价/配置变化、前项成功后其他目标守卫稳定、typed唯一持货新增/精确扣币/其他库存不变、原quota/UID父预算和授权/拒绝/UNKNOWN、草稿/迟到/账号Client代次隔离；R7/R8 NOT_RUN。   2026-11-19 W18/C523多货物买入R7：复用原活体调查及本地Codec，1/24合成市场目标验证固定初始贸易币/市场quota/UID、累计仓位，拒绝重复/稀疏/超限/访问器/无效时间及累计币或仓位不足；双货物原Service/Workflow覆盖成功、首项/次项UNKNOWN与次项拒绝，逐项授权、独立完整状态和重放拒绝。现有测试夹具为多次合成新持货分配唯一PID，原单次仍为99。HTTP成功/首项拒绝/UNKNOWN及Edge成功/首项UNKNOWN共5/5通过（31.18秒），Edge确认默认未选、数量留空、明确数量后原图与模拟零派发；trade整文件259/259通过（174.06秒），0失败/取消/跳过，两个集合不重叠。初次领域测试误传调查用多余字段被原严格合同拒绝，修正测试调用后通过；未修改生产代码。24目标Service/HTTP/Edge逐项执行、报价/身份变化和页面篡改迟到等原边界、全平台完整模拟仍未完成；W18 PARTIAL、R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。   2026-11-19 W18/C523多货物最大规模与性能：原Service/Workflow 24目标逐项执行成功/末项UNKNOWN/末项拒绝三条均通过，核对原Codec、单次授权、持久意图、精确TRADE_COINS/市场quota/UID及不可重放；准备和执行调查期间13类账号角色世界代次连接Client断连取消配置价格市场存量周期港口变化共26项零派发。Edge核24项默认不选/数量为空、明确选择、固定预算及模拟零派发，未在浏览器逐项执行。初次Edge 24项准备超过夹具10秒CDP命令上限，改为分段轮询并仅对该场景设置45秒有界命令超时。定位planTrade为每个选中目标重复计算整份买卖准备投影；src/trade.mjs复用相同observation和买卖/移动/加速候选生成，只省略计划不需要的准备列表，身份/行情/成本/原权限校验保留。四类原候选等价与原单项回归通过；完整trade文件266/266通过（390.27秒），HTTP/Edge/原Loop联合44/44通过（73.85秒），0失败/取消/跳过。优化前24目标三条分别172.70/174.12/169.66秒，优化后同机整文件内80.45/77.35/76.96秒，测试条件有差异，仅为离线观察；非性能保证。未重新运行全平台130文件，其他W18边界/完整模拟及R7未完成，R8 NOT_RUN、REAL_UNVERIFIED。   2026-11-19 W18/C522多批出售R7：原活体调查/本地Codec使用合成市场，1/24持货准备核对全批非亏损报价、固定持货quota/UID和不将收入加入预算；拒绝重复/稀疏/超限/访问器/部分数量、价格变化及累计余额溢出。双批原Service/Workflow覆盖成功、首项/次项UNKNOWN和次项拒绝、逐项授权及持久历史；HTTP成功/首项拒绝/UNKNOWN与Edge成功/首项UNKNOWN验证原图、模拟零派发和逐批确认。原单批与新增组合领域定向41/41（28.68秒）、HTTP/Edge定向5/5（28.80秒），0失败/取消/跳过，集合不重叠。只修改测试，未连接真实游戏；24批逐项执行、身份/报价变化和页面草稿迟到等原边界、全平台完整模拟仍待覆盖，W18 PARTIAL、R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。   2026-11-19 W18/C522多批出售续验：原Service/Workflow 24批逐项授权与原Codec合成传输覆盖成功、末批UNKNOWN及拒绝，核对准确收入/持货、派发前历史、固定quota/UID与不可重放，3/3通过（167.51秒）。准备及执行调查期间13类账号角色世界代次连接Client断连取消配置价格持货周期港口变化共26项零派发；与原双批HTTP/Edge及Edge 24批默认不选、原图加载和模拟零派发联合32/32通过（47.46秒）。Edge另核买卖两模式预算篡改与迟到编辑器各两项，4/4通过（13.26秒）；初次测试脚本未跨浏览器上下文传递kind导致4项失败，修正后通过，无生产代码改动。三组均0失败/取消/跳过；Edge 24批仅准备模拟，未逐批执行。未连接真实游戏，其他W18及全平台完整离线模拟未完成，R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。 |
| W19 PARTIAL | 原Tasks/Dailies/Loop统一Function/Service、单次及有限运行授权、父预算、持久History/拒绝记忆、目标/条件/WAIT/预算草稿失效保护保留；b05c473同批次终态核对、1e23bab舰队停止凭据只读恢复、c750ab5任务资格持久trace/历史页保留。本批收尾仅停止/等待原workflow runId的Service批次，未取得占用时不触碰其他操作；未确认停妥保留UNKNOWN和占用，未释放上下文不可被新启动覆盖；释放成功才清claimed，释放失败经原Store再次保存修正终态，不将UNKNOWN改成FAILED。原历史投影保留明确同批次AWAITING_AUTHORIZATION→CONFIRMED_DEFEAT的单次动作关联，其余重复/冲突仍排除；不续权、不重放。本批W14舰队编组凭据沿用相同恢复API/History链，同scope且原凭据与独立OnWater/verifyFleet均确认才APPLIED；缺证UNKNOWN，零业务写。此前共享ExecutionHistory复用原存在锚，在临时文件fsync后再次核对原历史与assertWriter；仅本次首次建库允许自己的锚先于文件出现，既有文件消失/损坏或写入者失效均拒绝覆盖。历史战败关联还复用原confirmedStageDefeat校验实际批次，trace文字不能单独证明战败。  本批维修/移动及货船装货/领奖复用原请求描述、完整库存解析与verifyFleet；原成功验证回调持久化最小目标/航次、成本、typed奖励及完整前后库存凭据。原恢复入口独立MyFleets或CargoShips加AllItem/AllResource，仅原凭据完整、同scope且原验证器再次确认才APPLIED；现状匹配不替代凭据，其他库存变化或跨重连/重启仍UNKNOWN，不重发/续权/恢复执行。 本批资源田放弃仅复用原私有封印验证成功回调留存凭据；原MyResFields/完整库存/MyResFields双读调查与原精确目标移除比较同源，四次查询边界均核原Service归属。原同scope凭据完整、指定田移除且其他田/上限/库存不变才APPLIED；当前田缺失不证明原操作或收益。原活体私有校验、请求、预算及写入口保持。 本批原FREE_RECRUIT具名WAIT允许明确recruit=antique，省略仍为英雄；同一RecruitInfo/可信Ping投影按来源隔离英雄/古董截止，原统一入口、原生WAIT表单及History同源。两次调查均经原Function/Service，目标来源及截止必须相同、到期复读确认；草稿编辑撤旧计划/授权，不新建调度或业务写，不解除拒绝/UNKNOWN，重启只读。 本批罗盘Info复用原infoOf、私有活体摘要/五维Client及原sourceAt，独立于库存/配置失败保留次数、积分、已领档位、成本/外环/保底原值；同一只读投影接原Function视图/API/专业页和Workflow持久调查历史，精确activityId绑定。不新增请求，原抽取全来源authority/净扣净入保持，累计领取与到账UNKNOWN。 本批招募冷却/任务观察共用原RecruitInfo独立字段事实，截止解析与写状态同源；无关英雄/广播站/库存失败不再隐藏可靠冷却，缺时钟只显示原截止、到期UNKNOWN。原写authority不变。 原Workflow调查校验同账号/Function及招募类型；原Store/API/历史页保存英雄/古董任务计数、已领标记、来源时间和配置季的固定只读摘要，不重算资格、到账或恢复许可。 本批普通免费点金复用原单次请求、完整状态投影及唯一typed GOLD/同标记freeTimes加一/全库存净入比较；原live私有封印、配置、原候选及可信时段校验保持。原Service成功回调保存目标合同摘要、原完整前后状态、明确写前GOLD（含零）和最小typed金额。原只读恢复/API/History沿ClickGoldInfo→完整库存→ClickGoldInfo双读，仅同scope、原成功凭据和未过期可信Ping共同确认才APPLIED；原凭据缺失、跨周期/身份/重连或其他库存变化仍UNKNOWN，不重发/续权/恢复任务。 本批原战令task-rewards SURVEY的Info/WeekInfo独立只读投影接入原Workflow Store/API/历史页；固定白名单仅保留明确任务ID/计数/任务已领记录、累计积分/付费激活原值/独立档位记录和type1窗口及各自sourceAt。复用原Info和Window解析器，不重新计算资格、任务周期、窗口归属或积分到账；缺一个来源保留另一个，原任务ID绑定，旧历史无此字段仍兼容，无新请求/候选/许可。 本批原ExecutionMemory沿用History/Workflow存在锚合同，在临时文件fsync后再次读取并验证原拒绝/UNKNOWN存储，只有本次首次建库允许自己的锚先于文件；已见原文件丢失/损坏/不合法路径或读取超8MiB均阻断覆盖。三个原存储在该复读后、rename前再次assertWriter，写入者失效不提交。无新存储/版本/事件/调度器，旧纯读取和拒绝/UNKNOWN语义保持。 本批复用原Service onVerifiedReceipt和既有恢复API/History页，接入主线/支线/成就成功凭据及同scope只读复核；任务解析、写前期望及净入比较与live verifier同源，不储许可/配置表，不从现态推原成功，不重发或恢复执行。 本批罗盘单批抽取复用原逐抽配置/typed回执和唯一Info/完整库存净扣净入比较；原Service成功回调持久化最小已验证结算、完整前后状态与合同摘要。原复核API按精确activityId读取Info→库存→Info，仅原成功凭据、同scope私有活动窗口/可信Ping及同一结算函数共同确认才APPLIED；计次/积分匹配不替代凭据，不重抽/续权/恢复或累计领奖。 本批英雄/古董免费及自有1/10/50券招募复用原合同、Hero/Antique完整解析、typed奖励及唯一净扣净入/套装派生比较；原Service成功回调保存最小typed结算、原可信时钟和完整前后状态。原复核API读取原五/六种来源并双读RecruitInfo，仅同scope完整成功凭据与新可信Ping共同确认才APPLIED；单次仍须明确未来冷却，古董转换/新增/套装/英雄派生差异保留原守卫。缺凭据、跨连接或无关变化仍UNKNOWN，不重招/续权/恢复或累计领奖。 本批三个原存储在fsync前后复读原文件并比较完整解析内容；首次建库期间若原路径出现有效文件也阻断rename，已存在文件若被替换为其他有效内容则保留新证据。沿用原存在锚、临时文件、写入者复核及失败停派发，不增加持久版本或存储体系。 本批经验试炼raid1下一首通复用原请求、状态及typed奖励解析和唯一期望/净入比较；原Service成功回调保存同scope完整前后状态及最小结算凭据。原恢复API按raid→英雄/完整库存→raid五读独立确认，缺凭据、进度/次数或无关状态变化保持UNKNOWN，不重打/续权/恢复或扫荡。 本批日常任务/日活跃/免费赠礼的原请求、状态与期望净入同源，Service成功回调保存最小结算、完整前后状态及明确原余额（含零）。原恢复API四读原信息→完整库存→原信息，同scope成功凭据和原周期可信Ping或赠礼原样标记均确认才APPLIED；当前已领不替代凭据，不重领/续权/恢复。 本批周转盘/翻牌/芯片1000号免费礼包及芯片同轮任务复用原日常解析、请求、期望状态、typed结算与成功凭据回调；原恢复API按业务信息/WeekInfo/完整库存/WeekInfo/业务信息六读，仅同scope完整成功凭据及原窗口可信Ping确认才APPLIED。跨轮最后任务、缺凭据/周期或其他状态变化仍UNKNOWN，零重领/续权/恢复。 本批C131–C133、BIZ-R04/PRO-004关联：货船明确多格有限组合已实现，原合同与边界见W05；非新增执行器或恢复分支。 本批旧日常九类动作接原Service且与Loop共用原驱动绑定，具体动作和AFK共享资格见W16；无新注册器/执行器/恢复分支。 本批普通免费点金明确次数同周期有限组合接原API/专业页/Workflow，具体原合同边界见W16；无新执行/恢复体系。 本批明确多舰有限维修接原Function、Service准备API、专业页和Workflow；原优先序/累计预算/写前复读/History/UNKNOWN均复用，具体合同见W14，无新执行或恢复分支。 本批三类试炼首通原Function/API/专业页/原生Workflow/Dailies1009/Loop同源集成见W16；旧{}仍raid1，明确raidId=2/3才切换，不以首通确认推导日常完成，无新执行或恢复体系。 本批C511/BIZ-A11/BIZ-R10及C133/BIZ-R04的明确有限业务组合均复用原Workflow、Service、父预算、History和UNKNOWN；原Tasks/Loop邮件声明接受同一可选expectedMailHash，未新建调度/历史/恢复。原活体单次授权和重启只读保持。 本批BIZ-D09有限首通复用原唯一候选Workflow和逐关配额/UID父预算；原Loop/Dailies参数校验直接复用扩展后的唯一试炼校验器，原History与恢复框架未修改。 本批同周期日常奖励收尾及统一声明参数沿原编译器/Function/Service/Workflow接入，专业和原生目标编辑保留周期；无新增执行器或恢复分支，具体范围共用W16。 本批W14有限维护通过原Workflow明确actionId逐舰授权/验证，停止动作零父资源预算，原历史和UNKNOWN不变；范围共用W14。 本批C522/P6-3：当前港口明确1至24个持货全批非亏损出售，原saleCandidate/报价/请求及typed+独立完整结算不变；原Service准备API、专业页和Workflow逐批ACTION→VERIFY同源。expectedPeriod/expectedSaleHash只锁原周期、航次、单批持货、价格及配置，不绑定余额或其他批次；每步fresh plan/单次授权，固定原quota/UID父预算，收入不扩额度；变化、拒绝或UNKNOWN停止，旧单次部分出售保留，无恢复扩展。 本批当前主支/成就奖励明确收尾沿原Service/API/专业页/Workflow，原参数及逐项授权/父UID/History/UNKNOWN复用，具体交付和R7范围共用W16；无新执行或恢复分支。 本批明确多工厂各单份生产沿原Function/Service/API/专业页/Workflow，原计划器和Ledger唯一；交付及R7范围共用W04，无恢复扩展。 本批明确已占资源田逐田放弃共用原Function/Service/API/舰队页/Workflow，原网格身份、父UID及执行历史保持；交付与R7范围共用W14，无新执行或恢复分支。 本批装备/徽章明确多UID单次成长接原Service/API/专业页/Workflow；合同与R7范围共用W07，无新执行或恢复体系。  本批英雄等级/技能及已激活专武多目标接原Service/API/共用成长表单/Workflow；合同和R7范围共用W06，原兑换升星入口保留。  本批明确多科技各单级接原联盟Function、Service/API、专业树及Workflow；交付和R7范围共用W10，不开放重置或新恢复分支。  本批PRO-007明确多目标藏品成长共用原Service/API/成长表单/Workflow；合同与R7范围共用W11，C144及原缺证保持。  本批明确多舰同城移动共用原Function/Service/API/舰队专业页/Workflow；合同与R7范围见W14，原单舰入口保持，无新执行或恢复体系。 本批联盟不同商船逐船单舱补货同源接原Function/Service/API/专业页/Workflow，具体合同及R7范围共用W09；无新执行/恢复体系。 本批周芯片同轮及开服四模式任务有限收尾复用原Function/Service/API/任务专业页/Workflow，合同与R7范围共用W16/W17；无新执行或恢复体系。 本批原Museum各入口共用完整库存精确结算与非目标展区/展柜验证；具体交付和R7范围见W11，无新执行/恢复体系。 本批Museum明确多目标成长复用原Function/Service/API/共用成长控件及Workflow，具体交付与R7范围见W11，无新执行/恢复体系。 本批W18当前港口明确多货物买入共用原Function/Service/API/买卖表单/Workflow，具体合同及R7范围见W18，无新执行/恢复体系。 本批BIZ-R08明确多目标海兽升级/投喂同源接原Service/API/共用成长控件/Workflow，具体交付与R7范围见W07，无新执行/恢复体系。 2026-11-18本批W19/BIZ-D09（复用W16试炼原合同）：Tasks新增kind=trial-challenge与必填原parameters对象，须明确raidId=1/2/3，可绑定原stageId。原/api/workflows/prepare经compileUnifiedExecution生成原trial-challenge唯一候选ACTION，直接复用Function Registry、OperationService、ResourceLedger、ExecutionHistory及原Runner单场许可/验证/UNKNOWN停止，无新协议或执行器。原生Tasks/Loop表单可明确副本；试炼专业页仅本次合格单候选可将精确副本和下一关加入同一Tasks草稿，保留原步骤和累计预算，编辑撤旧预览，忙状态/来源/账号/迟到保护沿原作用域。原Dailies1009省略副本默认raid1及明确三副本、独立单场/有限首通序列保持兼容；零资源成本与原首通quota/UID不变，仅原typed同副本关卡回执、精确进度和完整库存共同确认，不证明日常完成或领奖。raid4、扫荡/购买/广告及其他缺证动作冻结。实际修改src/loop.mjs、src/gameplay-page.mjs及本行。  2026-11-18本批W19/BIZ-D08/D10/D12/D15（关联C131/C133、C151、C141及原BIZ-R01/R04）：Tasks新增cargo-fill、pirate-sweep、alliance-order、museum四种明确业务，parameters必填。原/api/workflows/prepare经compileUnifiedExecution复用fleetCargoFillSelection、allianceOrderSelection、museumStartExploreSelection及validatePirateSweepParameters，生成原Function ACTION；仅单格装货、明确UID/城市普通扫荡、单城市订单、固定关卡/队伍/倍率探险出发，不混其他动作或推日常完成。原生Tasks/Loop表单与专业候选新增加入Tasks入口，沿现有候选来源/账号/版本/编辑/忙状态失效守卫，保留原步骤和父预算，新增草稿撤旧Workflow预览。联盟广调查候选取原target.cityId明确绑定，已有来源摘要参数不静默剥除；旧单项、Dailies1008/1010/1012/1016、Loop world及组合API保持兼容。继续用原Service/Ledger/History/Runner逐项独立授权、验证及拒绝/UNKNOWN停止，无新执行/调度/恢复体系。实际修改src/loop.mjs、src/gameplay-page.mjs及本行。  2026-11-18本批W19/BIZ-D03、C202：Tasks新增kind=stage，必填原parameters/config，经导出的原Stage Function参数校验器确认有限配置及可选expectedStage。原/api/workflows/prepare沿compileUnifiedExecution生成原stage ACTION并使用原StageRunner、OperationService、父预算、History和逐场结果验证；无新协议、执行器或恢复体系。原生Tasks/Loop表单支持1至200次明确总尝试并按首次战败停止；原主线专业页增加将当前有限配置及当前首关加入Tasks草稿，保留原关间隔/阵容证明参数、已有步骤及预算，账号/忙状态/未决状态禁止加入，草稿编辑使旧预览失效。专业入口须明确1至200次总尝试，旧Dailies1003及独立主线启动保持；战斗不证明日常完成、不自动领奖。实际修改src/stage-function.mjs（仅导出原校验器）、src/loop.mjs、src/gameplay-page.mjs、src/page.mjs、tests/farm-forge-full-page.test.mjs（原不支持类型断言换为未开放arena）及本行。 | 本批城防普通材料组合及FRM-005图纸逐模板解锁已接线，见顶部记录；继续原DAG其他有据业务，日界/周期、C144、W13待捕鱼等原缺证局部冻结，不推全范围完成。 | cooldown/gameDay权威来源、每日订单及其他原缺证保持局部冻结。测试隔离错误已修复；原默认账号文件被覆盖，Owner决定无需恢复，未恢复原数据。W19仍PARTIAL，R7/R8 NOT_RUN | 本批提交（父c2695da）；此前成果保留 | 本批未新增或运行测试；本批fleet/recovery/contracts三源node --check与git diff --check仅静态检查，非测试PASS。R7须覆盖未获占用不停止其他操作、同账号不同runId隔离、停止/settle失败或仍运行、释放锁/二次落盘失败、UNKNOWN保持及新启动阻断；战败双trace同批次关联、重复/错目标/错轮次/错哈希排除、旧历史兼容及原授权/预算/恢复链；首次建库、已有锚缺文件、落盘期间文件丢失/损坏、二次assertWriter失败、原证据保留及战败trace与实际批次一致。本批编组恢复覆盖见W14；此前R7债务与历史证据保留不累计，REAL_UNVERIFIED。  本批未新增或执行测试；三源node --check和git diff --check仅静态检查。R7补维修开始/完成、零费及付费移动、汽油精确净扣、装货单格/末格出航、到港原typed奖励/新船、完整库存无关变化、坏/缺/冲突凭据、未知耐久与身份、同scope及跨账号/角色/世界/Client/连接/代次、取消/迟到/磁盘失败与零写零续权；R7/R8 NOT_RUN，REAL_UNVERIFIED。  本批资源田恢复未新增或执行测试；仅三源语法/diff静态检查。R7补gridIdx=0、完整前后列表/非目标/上限/库存、重复/稀疏/未知字段、私有封印和revision、四次读之间身份切换/取消、坏/缺原凭据及零写零收益推定；原放弃Service/父预算/History和其他恢复回归待统一执行。  本批未新增或执行测试；四源node --check、原浏览器函数仅编译不执行和diff仅静态检查。R7补英雄旧声明/历史兼容、古董来源及参数、相同秒值不同招募源不混淆、坏/缺来源/可信时钟/截止变化/超上限、两次调查账号隔离及迟到取消、原Tasks/Dailies/Loop编译/原生WAIT/页面草稿失效、只读零业务写、重启零恢复权限和原招募净扣净入/父预算/History链；R7/R8 NOT_RUN，REAL_UNVERIFIED。  本批未新增或执行测试；四源node --check、原浏览器函数仅编译不执行、diff仅静态检查。R7补Info可靠但库存/配置坏时独立观察、原sourceAt/过期/私有摘要/账号角色世界Client连接代次隔离、原型缺省/坏字段/外环重复/错误活动ID、Workflow调查目标绑定/持久历史白名单/重启零续权与原抽取成本/typed回执/完整净扣净入/UNKNOWN链。REAL_UNVERIFIED，R7/R8 NOT_RUN。  本批未新增/执行测试；四源node --check、原浏览器函数仅编译及diff均为静态检查。R7补英雄/古董独立字段、明确零/继承缺省/坏值/陈旧/篡改、库存及其他来源失败、可信时钟缺失/边界、同账号Function/来源匹配、任务双来源/配置季历史白名单及旧历史兼容、重启零续权和原招募净扣净入/预算/History链；REAL_UNVERIFIED，R7/R8 NOT_RUN。 本批未新增/运行测试；三源node --check和diff仅静态检查。R7补原点金live合同等价、明确零/正GOLD和安全整数溢出、typed正额/错计次/付费字段/无关库存、目标/预算/摘要/原凭据缺坏、同scope与跨账号角色世界Client连接代次、四读间取消/迟到/标记变化/可信时钟丢失或跨周期、成功凭据持久化故障及复核API零写零续权，原Fleet/Formation恢复链回归；R7/R8 NOT_RUN，REAL_UNVERIFIED。 本批未新增/执行测试；四源node --check、原浏览器函数只编译不执行及diff仅静态检查。R7补Info/WeekInfo单源缺失、明确零/精确int64/重复档位/坏字段/来源时间、目标ID冲突、空type1窗口与未证实绑定、旧历史兼容、持久白名单/账号角色世界Client连接代次隔离及零写零续权；战令原领取冻结和点金/舰队恢复共享链统一回归。REAL_UNVERIFIED，R7/R8 NOT_RUN。 本批未新增/执行测试；三源node --check和git diff --check仅静态检查。R7补ExecutionMemory首次建库、自有锚前置、旧无锚文件、fsync后原文件消失/坏内容/目录或符号链接/超限、锚消失、最终read期间写入者失效、原字节与非本次临时文件保留；History/Workflow原子写及Service拒绝记忆持久化失败零后续派发统一回归。R7/R8 NOT_RUN，REAL_UNVERIFIED。 本批未新增/运行测试；三源语法与diff仅静态检查。R7补任务凭据写入中断/恢复预览和确认间变化、缺坏旧凭据、原taskId/完整前后状态/奖励余额一致性、四读各边界隔离取消、UNKNOWN保留及零业务写零续权，原舰队/点金/Workflow共享恢复链统一回归。R7/R8 NOT_RUN，REAL_UNVERIFIED。 本批未新增/执行测试；三源node --check和diff仅静态检查。R7补1/5/10/50原live等价、逐抽奖励与积分/外环/票券精确差额、坏缺原凭据/重复奖励/溢出/第八外环/跨轮、私有窗口或可信时钟变化、Info双读变化、四读各边界取消迟到及账号角色世界Client连接代次隔离、原Service凭据落盘故障/API预览确认变化与零写零续权；原任务/舰队/点金共享链统一回归。R7/R8 NOT_RUN，REAL_UNVERIFIED。 本批未新增/执行测试；三源node --check及diff仅静态检查。R7补英雄/古董免费与1/10/50券原live等价、片段/新英雄/新古董/转换混合批次、重复身份/整型溢出/无关英雄库存/套装精通变化、派生属性仅原新古董范围、前后冷却/单次过期/批次原规则/可信时钟回退、六/七读各边界取消迟到、scope及Client隔离、缺坏/旧凭据和原金额UID成本、持久化中断/复核预览确认变化、只读零写零续权，原Tasks/Dailies/Loop/Workflow与舰队/点金/任务/罗盘共享链留R7统一回归。R7/R8 NOT_RUN，REAL_UNVERIFIED。 本批未新增/执行测试；三源node --check和diff仅静态检查。R7补三存储fsync期间有效内容替换、首次建库路径出现有效空/非空文件、内容等价重排、原锚/坏文件/写入者失效、被替换原字节和非本次临时文件保留、Service/Workflow持久化失败零后续派发及UNKNOWN保持；其他R7债务保留。R7/R8 NOT_RUN，REAL_UNVERIFIED。 本批未新增/执行测试；三源node --check和diff仅静态检查。R7补原live等价、passedStage=0及非连续stageId、错raid/stage/typed包、重复坏值溢出、完整库存/英雄/扫荡购买次数变化、双读变化、五读各边界取消迟到及scope/Client隔离、缺坏旧凭据、持久化失败与原共享链。R7/R8 NOT_RUN，REAL_UNVERIFIED。 本批未新增/运行测试；三源node --check和diff仅静态检查。R7补原候选/live等价、明确零余额、错任务/档位/赠礼英雄/标记/季节、完成/资格/已领分离、typed活跃/日周计次/EXP或RUBY精确净入、无关库存/任务变动、缺坏旧凭据、坏字段/访问器/重复/溢出、过期/时钟回退/双读变化、四读边界取消迟到及scope/Client隔离、凭据持久化故障和原共享链。R7/R8 NOT_RUN，REAL_UNVERIFIED。 本批未新增或运行测试；三源node --check与git diff --check仅静态检查。R7补三种免费周礼包/芯片同轮任务原live等价、原活动窗口/期数及六读变化、typed轮次/完整领取列表、明确零余额/完整净入、最后任务跨轮仍阻断、旧/缺/坏凭据及scope/Client/取消/迟到隔离和原共享授权预算链；R7/R8 NOT_RUN，REAL_UNVERIFIED。 本批货船组合静态检查及R7待测范围见W05，不重复累计。 本批日常共享接线的静态检查及R7范围见W16，不累计历史PASS。 本批免费点金组合静态检查及R7范围见W16，不重复累计。 本批多舰维修静态检查和R7待测范围见W14，不累计历史PASS。 本批三副本集成静态检查及R7范围见W16，不累计历史PASS。 本批两个组合的静态检查和统一R7待测范围共用W05/W16，不重复累计；未执行测试，R7/R8 NOT_RUN。 本批试炼静态检查与R7待测范围共用W16，不重复累计，未运行测试。 本批未新增或执行测试；七源语法、浏览器函数仅编译及diff仅静态检查。R7补同周期1/24目标、缺失/重复/坏字段、任务/活跃身份、只读三源复用、任务后档位原typed及完整净入、跨周期/到期/配置/草稿/迟到/账号Client连接代次、父UID预算/逐步授权/拒绝/UNKNOWN及旧单次/历史兼容；R7/R8 NOT_RUN。 本维护批次未新增或执行测试；三源语法/浏览器函数只编译/diff仅静态检查。R7补三种维护模式/旧省略action、1/24舰/重复/坏输入、同舰不同动作摘要冲突、旧维修优先序/汽油限额、原停止请求/独立复读/零资源父预算、状态/配置变化、逐舰授权拒绝/UNKNOWN和草稿/迟到/账号Client连接代次；旧单舰及恢复兼容保留待回归，R7/R8 NOT_RUN。 本批未新增或执行测试；五源语法、浏览器函数只编译及diff仅静态检查。R7补1/24批、旧单次/部分出售、重复/坏参数、原非亏损报价及累计余额边界、周期/港口/航次/持货/配置变化、前批成功后后批守卫稳定、typed全结算、父quota/UID预算、逐步授权/拒绝/UNKNOWN及草稿/迟到/scope隔离；R7/R8 NOT_RUN。 2026-11-17集中离线回归已启动但未通过：22文件首轮2397项，2103通过/294失败（677.44秒），其中workflow.test.mjs因挂起人工停止，不能作为完整R7结果；独立有限超时诊断361项292通过/66失败/3取消（53.52秒），与首轮重叠不累计。已确认问题包括原Workflow合成会话身份不足、页面目标变更后重新调查及重绘控件的陈旧假设、历史观察断言与当前字段不符；其他失败待逐项分类，不声称均为夹具问题。临时页面诊断改动已撤回，仅W07/W11修复及124项通过范围落盘。全量回归和完整离线模拟未完成，R7 IN_PROGRESS；R8 NOT_RUN。  2026-11-18续修集中R7：tests/workflow.test.mjs正例调查桩补当前原合同accountId/module来源，消除错误提前UNKNOWN及后继测试挂起，新增缺失/错账号与模块四种零计划反例；生产守卫不改。tests/farm-forge-full-page.test.mjs实际走更换目标→调查→重选→预览→单次许可，参数编辑后明确清除旧actionId并经原选择编辑器重选；核对事件种类切换清空旧条件、账号/迟到/重绘控件防护；修正付费种植与历史文案夹具，私有状态仅测试注入，不新增生产导出。联合Workflow/ExecutionHistory/完整PAGE三文件1496/1496 PASS，0失败/取消/跳过（11.04秒）；非全量R7完成。后续四文件gameplay-view/execution/locks/settings回归105项86通过/19失败（4.26秒）；失败集中旧目标选择后直接预览假设及旧Registry清单等，尚未全部分类，仍需修复；gameplay-api首轮失败和完整离线模拟债务保留。全部离线合成数据；R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED，无真实连接/凭证读取/push/merge。 2026-11-18页面回归收尾：tests/gameplay-view.test.mjs载入原PAGE计划身份/资源渲染函数，改为目标选择后显式调查及重选，核对重绘控件、货舱选择列、账号旧回调失效；tests/gameplay-settings.test.mjs补已注册compass-wheel显式清单，生产守卫不改。联合view/execution/locks/settings四文件105/105通过，0失败/取消/跳过（3.62秒），仅该离线范围；API失败及完整离线模拟仍待处理，R7 IN_PROGRESS，R8 NOT_RUN、REAL_UNVERIFIED。 2026-11-18集中R7收尾本批API：tests/gameplay-api.test.mjs修正古董所选来源已有OBSERVED冷却的旧UNKNOWN断言，明确原source/截止/时钟就绪度与零自动资格；战令Tasks/Dailies/Loop历史按现有严格白名单核原Info/Window来源及时间、精确int64进度，保持无ACTION/授权/写入、描述不落盘和账号隔离。生产合同未放宽。原首轮373项362通过/11失败（294.67秒）；修正后含W11新增4项的全文件377/377通过，0失败/取消/跳过（287.60秒），定向11项与总数重叠不相加。仅真实本地HTTP及合成游戏响应，不代表真实游戏或全R7完成；跨文件全量回归与完整离线模拟等原债务保留，战令日界/周期绑定和积分结算、其他缺证动作仍冻结。实际修改tests/gameplay-api.test.mjs及本行；R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。  2026-11-18集中R7：src/daily-task-rewards.mjs在快照序列化前独立验证原战令任务/窗口来源，拒绝稀疏数组被归一化为空数组；tests/daily-task-rewards.test.mjs保留两来源独立UNKNOWN并新增稀疏档位/窗口回归。定向25/25通过（2.74秒），仅此离线覆盖，未完成R7/R8。  2026-11-18集中R7：tests/trial-challenge按原raidId1/2/3免费合同补正，raidId4/未知成本仍拒绝；tests/free-recruit核原古董冷却可观察但资格未知/不可执行。tests/order-rules-api通过原刷新绑定合成来源后核任务计数，仍无领取许可。 合同等九文件688/688通过（61.78秒），缓存/海战三文件60/60通过（5.75秒），古董原Workflow定向1/1通过（4.28秒）；共享结果不跨行累计。此批仅测试合同/夹具修正，非业务写链改造，R7 IN_PROGRESS、R8 NOT_RUN。  2026-11-18原Tasks/Dailies主支成就及日常奖励收尾接线已存在；在线奖励/日界等缺权威语义继续局部冻结，转原DAG完成本人求助逐项取消，详细合同与R7债务共用W09。  2026-11-18本批W19/BIZ-D02：Tasks新增明确kind=free-recruit及必填原parameters对象（免费单次用{}），支持原英雄/普通古董免费与自有1/10/50券；原compileUnifiedExecution经既有/api/workflows/prepare编译为原free-recruit ACTION，沿原Function/Registry/Service、私有调查/可信冷却、原成本/typed完整结算、父预算/单次许可/History/UNKNOWN。原生Tasks表单可选英雄或古董和四种支付方式；专业招募页将当前合格原候选参数加入Tasks或Loop的tasks草稿，保持全部原步骤/累计预算，不复制许可、预测奖励或扩预算。目标/支付编辑和新增步骤撤旧预览；专业来源/账号/迟到保护沿原作用域。Dailies1002保持仅英雄，古董不计为日常英雄招募；原独立Workflow、Loop world与冷却WAIT兼容，累计招募任务领奖继续缺证冻结。实际修改src/loop.mjs、src/gameplay-page.mjs及本行（无新增执行器/调度/恢复）。本批未新增/运行功能测试；源语法、完整浏览器脚本仅编译和diff均为静态检查，非功能PASS。R7补2来源×四模式原参数/唯一候选/真实HTTP编译与Service执行、必填空对象及坏参数拒绝、原券成本/冷却/完整typed结算与固定父预算、逐项许可/拒绝/UNKNOWN/重启零重放、Dailies1002拒古董与旧默认、原专业/原生表单及草稿/迟到/账号角色世界Client连接代次隔离、Loop轮次兼容及完整离线模拟。R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。  2026-11-18集中R7补BIZ-D02 Tasks招募：tests/free-recruit.test.mjs新增21项，Tasks/Loop英雄及古董免费/自有1、10、50券经原编译器/Service/Workflow单次授权、原typed完整结算、独立来源/精确初始券耗尽/父预算/派发前持久意图/UNKNOWN或拒绝停止后项/重启不重放及原日常1002仅英雄兼容。tests/farm-forge-full-page.test.mjs新增25项，原Tasks表单及专业页加入声明保留原步骤/预算，明确来源、数量、48项上限及编辑/scope/busy失效；原旧断言按Tasks招募已开放更新。tests/gameplay-api.test.mjs新增3项原prepare HTTP，覆盖全部模式及Origin/CSRF/账号/无连接无授权派发。招募与Workflow两整文件685/685通过（259.07秒）；完整PAGE文件1104/1104通过（10.37秒）；HTTP与取消组合共用6/6（5.27秒），均不累计重叠轮次。非浏览器E2E，完整离线模拟及R7全范围仍未完成，R8 NOT_RUN。   2026-11-18本批W19/BIZ-D06：已有普通免费点金Function新增Tasks显式kind=free-gold及必填原parameters对象，空对象保留原免费单次，也支持原expectedGold完整状态绑定。原compileUnifiedExecution经既有/api/workflows/prepare生成唯一候选ACTION，复用原ClickGoldRequest/typed金币与完整库存净入、服务器resetTime配额/UID、OperationService/ResourceLedger/ExecutionHistory和逐项授权，拒绝/UNKNOWN停止，不扩收入预算。原生Tasks表单及Loop的tasks分组可添加免费单次；专业点金页将本次合格完整状态加入同一声明，保留原步骤/父预算，沿账号/来源/编辑/迟到与忙状态守卫。原Dailies1006、独立单次和同周期明确次数准备API保持兼容，不从点金推导日常完成或任务领奖。实际修改src/loop.mjs、src/gameplay-page.mjs及本行；无新增执行/调度/恢复体系。本批未新增或运行功能测试，仅两源语法、完整浏览器脚本编译与diff静态检查，非功能PASS。R7补Tasks/Loop空对象及完整状态、原prepare HTTP/Service真实编译执行、必填参数/坏字段/付费次数拒绝、原周期配额和UID父预算/原typed完整净入、逐项许可/拒绝/UNKNOWN/重启零重放、专业及原生草稿/状态编辑/迟到/账号角色世界Client连接代次隔离和Dailies旧入口兼容；完整离线模拟仍待补，R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。  本试炼Tasks批次未新增/执行功能测试；两源node --check、完整PAGE内嵌脚本仅编译及git diff --check为静态检查，非功能PASS。R7补Tasks/Loop三副本及固定stageId、必填参数/副本与付费字段拒绝、原prepare HTTP到Service/Workflow逐项许可和精确结算、原quota/UID父预算、进度变化/拒绝/UNKNOWN/重启零重放、原生及专业页草稿编辑/48项/迟到/账号角色世界Client连接代次隔离、Dailies1009默认与原首通序列兼容及完整离线模拟；R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。  本四业务Tasks接线批次未新增/执行功能测试；两源node --check、完整PAGE脚本仅编译和diff为静态检查，非功能PASS。R7补四业务Tasks/Loop原prepare HTTP、准确参数/选择器及旧Dailies兼容、坏字段/缺目标/付费/非对应动作拒绝、原父材料/额度/UID及逐项授权结算/UNKNOWN/拒绝/重启零重放、原生与候选入口的账号/编辑/迟到/48项及预算不扩额；博物馆C144结算、扫荡奖励归属及日常完成归因等原缺证保持局部冻结。完整离线模拟及R7全范围仍待补，R8 NOT_RUN、REAL_UNVERIFIED。  2026-11-18集中R7补W19/BIZ-D06/D09/D08/D10/D12/D15：tests/workflow、farm-forge-full-page、cargo-service、free-gold、trial-challenge、pirate-operations六整文件1653/1653通过（36.11秒）；gameplay-api本地HTTP定向18/18通过（11.23秒），0失败/取消/跳过，重叠轮次不累计。覆盖Tasks/Loop六类原Function编译、原生及专业页草稿、固定父预算、逐项许可、原Service结算、拒绝/UNKNOWN和重启零重放，保留旧Dailies。修复src/trial-challenge.mjs同一raid/stage在省略及明确参数间切换可绕过拒绝记忆的问题，沿原Service同时重算新动作与旧History领域身份；三种历史参数别名互查且原History/补充记忆字节不变。测试修正原Dailies默认步骤、点金规划守卫与实际空参数动作的既有合同，未放宽生产守卫。其余两副本Service集成、浏览器E2E、剩余HTTP边界、全范围R7及完整离线模拟仍待完成；R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。  本批仅源语法、完整PAGE内联脚本编译及diff静态检查，未新增或执行功能测试，不标记测试PASS。R7须补Tasks/Loop有限config、expectedStage变化、原生及专业页参数/阵容/间隔保留、最大48步/父预算/草稿失效、跨账号/角色/世界/Client/代次及迟到、HTTP身份/CSRF、原StageRunner逐场成功/明确战败/UNKNOWN及取消/旧许可/重启零重放、旧Dailies1003和独立主线入口兼容；R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。 2026-11-18主线Tasks/BIZ-D03/C202集中离线补证：tests/gameplay-api.test.mjs将原Dailies/Loop主线三类HTTP矩阵扩至Tasks/Loop-Tasks，新增6项，连同工厂领取3项及原6项共15/15通过（11.95秒）；覆盖原Runner授权、逐场历史/账号隔离、UNKNOWN阻断及原Service重建零重放、取消后旧许可拒绝。tests/stages-view.test.mjs新增10项专业页明确有限配置/首关草稿、Loop原步骤/父预算保持、无界/超限/未知首关/busy/断线/未决/错误入口/48步拒绝；整文件81/81通过（2.37秒）。完整PAGE原测试导出锚点因新增公开helper改变而失效，修正测试锚点后整文件1129/1129通过（10.41秒），保留原断言。上述仅离线HTTP/脚本VM；阵容/间隔及更多五维变化、其他副本Service、浏览器E2E、全范围R7和完整离线模拟仍待完成。  2026-11-18 W19/C126、BIZ-A19、BIZ-L05：居民订单专业页将本次可执行SUBMIT候选加入Tasks或Loop。原生表单接受同一完整actionId。原/api/workflows/prepare编译为原orders ACTION，锁定订单与规则摘要，逐单重新调查和确认。带运行期限的Tasks订单图仍使用原累计材料预算和范围，沿现有Service只开放逐单授权。复用原派发、材料净扣、订单变化与完成计数验证，以及History和UNKNOWN停止。每日订单观察、旧独立交单入口及免费刷新、档位领奖的缺证边界保留。实际改动src/order-execution.mjs、src/loop.mjs、src/operation-service.mjs、src/page.mjs、src/gameplay-page.mjs与两份定向测试。页面VM及本地HTTP各1项通过，覆盖同候选入草稿、跨账号失效、刷新不加入、两单逐项确认与精确累计扣料。R7补原订单或规则变化、累计不足、拒绝/UNKNOWN、重启、真实浏览器及完整模拟。R7 IN_PROGRESS，R8 NOT_RUN。   2026-11-20 W19/C126、BIZ-A19/BIZ-L05居民订单Tasks/Loop离线续验（父044ef4c）：复用原gameplay-api HTTP夹具、原Service/Workflow/父预算/History/执行记忆，仅测试改动。原两单成功用例扩至两入口成功、首/末单UNKNOWN及明确拒绝；每单独立许可、跨账号拒绝、旧许可重放拒绝、材料精确净扣、固定初始父预算及关闭均核对。真实本地HTTP服务器重建后，原历史/Workflow字节只读、账号隔离和不续权保持；原拒绝记忆或未决历史继续阻断同目标计划。第二单前订单、规则、库存变化停止；父预算不足时许可可创建，但原执行检查在派发前记录NOT_EXECUTED、零请求，Runner保守停在UNKNOWN，History无未决写，不将该终态改成成功。角色/世界/连接/代次/Client/断线/取消分别在计划及派发调查注入，两入口28项全部零派发，保留后继busy所有者。Edge两入口从原订单专业页选择精确候选加入同一Tasks草稿，模拟零写、逐单确认成功，以及首单UNKNOWN/拒绝后停止共6项。最终在CW_TEST_BROWSER为安装Edge的环境下，对tests/gameplay-api.test.mjs联合匹配本批resident-order HTTP/Edge及原罗盘→订单场景：56/56 PASS，0 fail/cancelled/skipped/todo，72.25秒；46项HTTP、6项Edge和原4项罗盘→订单场景，前轮18/6/28结果与此重叠不累计。首轮新增夹具/断言错误包括CSRF初始化、关闭后Client引用、STARTING异步状态、selection对象、预算检查时机及页面尚显示旧计划；均按原合同修正，未修改生产守卫。日志为本机临时目录cw-w19-resident-orders-final.log。48步上限、更多页面编辑/迟到及其余原W19范围仍保留；通用cooldown/gameDay、R7全范围/完整离线模拟、R8未完成，REAL_UNVERIFIED。 |
| W09 PARTIAL | 原联盟订单/福利/科技单级/Fort/商船与总览及f8f0ab1库存资格同源保留。本批原upgradeTech结果改用stockMatchesDelta确认精确科技点净扣和全部其他库存不变，并保持非目标已研究科技不变；完整技术表缺行/显式零级等价、乱序及最后点数耗尽保持。原成本/请求/资格/授权/历史链不改  本批明确多科技各单级接原联盟Function、Service/API、专业树及Workflow；交付和R7范围共用W10，不开放重置或新恢复分支。  本批BIZ-R05明确1至24艘不同商船各一舱补货登船：复用原shipCandidate/planAlliance、唯一GuildShipOrderRequest及完整库存/本人舱位验证；原参与计数提为唯一helper，准备时核全部当前余量及共享Ledger累计自有普通材料。原Service只读准备API、专业页同次候选多选和Workflow逐船ACTION→VERIFY同源，原expectedPeriod/expectedShipHash仅规划守卫固定活动窗口/选定船只和配置，不绑定其他船或余额，不是结算身份。每船重新调查/单次授权/完整独立复读，父材料预算固定；周期/目标变化、资格失效、拒绝/UNKNOWN停止，无新请求或恢复分支，旧单舱/船长入口保留。 本批PRO-002原同城普通材料逐项捐献已接API/专业页/Workflow；细节、文件及R7债务见顶部本批记录。 后续C151组合接线复核发现此前prepare处理函数遗漏server入口路由集合；本批已将堡垒、图纸和材料包准备端点补入原gameplayRoute集合（src/server.mjs），HTTP可达性须R7实际验证，原静态检查不证明此前API已可用。  本批BIZ-R01/BIZ-D12（日常1012关联，非新增C编号）：原FinishGuildOrderRequest明确1至24个不同联盟城市交付当前同一订单，复用原allianceView/planAlliance/verifyAlliance、等级赛季额度及可靠同日计数。原Service只读准备API /api/gameplay/alliance/orders/prepare、专业页逐城市明确选择及Workflow逐项ACTION→VERIFY同源；来源摘要固定联盟/角色/世界、等级赛季额度、完整订单/刷新截止/城市与原配置，顺序计数逐项递增由实际新调查确认，准备不伪造未来状态。共享Ledger累计仅用初始材料，原父材料/同日配额/城市UID预算，不预支收入；原单城市/日常1012兼容，每项独立授权，换档/跨日/变化/拒绝/UNKNOWN停止。原验证仅确认同日订单计数和材料消耗，未扩大为完整奖励到账；无新增执行/恢复体系。实际修改src/alliance.mjs、src/function-contracts.mjs、src/operation-service.mjs、src/server.mjs、src/gameplay-page.mjs和本行。 | 继续W19原Tasks/Dailies有限声明尚未接入的明确目标业务；直接复用原Function/Service，不增加调度/历史/恢复机制，缺冷却/日界证据保持局部冻结。 | 互助额度/冷却、求助合同、科技重置、跨玩法英雄占用与航行奖励等原缺证未解；无关变化保持UNKNOWN，零重放，W09 PARTIAL，R7/R8 NOT_RUN | 本批提交（父ec7ec9e）；原成果保留 | 2026-11-16：alliance/alliance-tech两文件244/244 PASS（42.46秒），Contract/Registry/公共Adapter集成三文件200/200 PASS（19.56秒），联盟HTTP过滤29/29 PASS（13.06秒），均0 fail/cancel/skip/todo。先复现六项无关余额/科技变动误成功各失败；修复覆盖精确扣点、其他库存/科技新增减少、乱序/零级缺行/最后点耗尽。原Generic Executor异常保留24点，实际HTTP异常保留2400点和持久UNKNOWN；新Client重建Service阻断且磁盘字节不变、账号B无历史、零重放。初跑新增HTTP错误读取不存在的action.reservation，改核原API与磁盘runBudget，生产合同/旧断言保持。三源语法/diff及Baseline指纹通过；重叠与历史不累计，均离线REAL_UNVERIFIED  本批未新增或运行测试；五源语法、浏览器函数只编译及diff仅静态检查，非测试PASS。R7补同周期1/24目标/同船多舱拒绝、坏参数/摘要/旧格式、私有调查/scope/配置/周期/时钟、累计材料及参与余量不足、每步原单舱净扣/归属/其他船库存不变、固定父预算/授权/拒绝/UNKNOWN、专业页和Workflow同参/编辑/迟到隔离，旧船长与Fort/科技/订单入口兼容；R7/R8 NOT_RUN。  本批未新增/执行功能测试；源语法、PAGE脚本编译、静态注册加载及diff仅静态检查。R7补1/24城市、重复/坏参数/访问器/溢出、原cap=-1仍有限及额度边界、累计初始材料不足、同单换档/跨日/刷新截止/等级赛季/联盟/城市/配置变化、真实计数顺序及原消耗验证、父预算/逐项授权/拒绝/UNKNOWN、API真实HTTP可达、草稿/迟到/账号角色世界Client代次隔离、原单城市与日常1012兼容及完整离线模拟；R7/R8 NOT_RUN，REAL_UNVERIFIED。  2026-11-18集中R7：PRO-002：tests/alliance-fort.test.mjs补真实配置2/3种材料顺序捐献、used499奖励衰减、精确库存/进度及跨日/目标变化拒绝；Schema上限6不代表已有单堡垒6种需求，未编造成功案例。 三文件共94/94通过（4.89秒），跨行共享不累计；仅离线覆盖，完整HTTP/UI/模拟债务保留，R7 IN_PROGRESS、R8 NOT_RUN。  2026-11-18后续集中R7：PRO-002：同批tests/gameplay-api.test.mjs补原双材料捐献准备HTTP、逐项授权、used499起精确功勋5000/2000与库存净扣，首/后项拒绝及正确typed奖励但独立复读无变化均停止；预算固定，历史持久UNKNOWN重启不可重放，五维准备身份漂移拒绝。tests/gameplay-view.test.mjs用原堡垒调查/准备函数验证真实控件到Workflow原图、明确数量/来源摘要及迟到/篡改拒绝。实际仅覆盖双材料HTTP，不把Schema6种上限当作单堡垒六种需求。 两工作包共享本次gameplay-api全文件399/399（374.00秒）、gameplay-view全文件95/95（7.85秒），0失败/取消/跳过；新增HTTP22项及UI12项已包含在全文件结果中，不另行累加。早期新增夹具缺Client事实上下文、用未注册联盟Adapter、额外player字段和写死材料顺序的失败均修正夹具，生产合同未放松。浏览器端到端、各读边界取消、堡垒三材料HTTP及完整离线模拟仍待补；R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。  2026-11-18本批W09/PRO-002、P4-1原本人求助取消子项（关联C301精确请求身份，非C303/C304帮助或C305新求助）：明确1至24个不同本人未获帮助且未过期请求，复用原CancelMyGuildAidRequest、allianceView/planAlliance/verifyAlliance与原单项兼容。原Service只读准备API /api/gameplay/alliance/aid/cancel/prepare、联盟专业页默认不选/明确时长和Workflow逐项ACTION→VERIFY同源；expectedCancelHash仅作规划守卫，绑定原联盟/角色/世界、指定请求完整物品/帮助者/截止及原配置，不绑定其他请求，前项已确认取消不使后项失效。零资源成本，父alliance-aid UID固定，每项新调查/单次授权，目标变化、拒绝或UNKNOWN停止，原History与只读恢复保持，无新执行器/请求或结算语义。实际修改src/alliance.mjs、src/function-contracts.mjs、src/operation-service.mjs、src/server.mjs、src/gameplay-page.mjs及本行。未新增/运行本功能测试；五源语法、整页浏览器脚本仅编译和diff为静态检查，非功能PASS。R7补1/24请求、精确大int64、重复/稀疏/访问器/坏摘要、已帮助/到期/未知时钟/缺列表、逐项请求来源及其他请求独立变化、固定父UID/单次许可/拒绝/UNKNOWN/取消和重启零重放、HTTP权限/坏参数及页面编辑/迟到/账号角色世界Client连接代次/配置隔离、旧单项及完整离线模拟。R7 IN_PROGRESS、R8 NOT_RUN，REAL_UNVERIFIED。  2026-11-18集中R7补PRO-002/P4-1原本人求助撤销组合（C301身份关联，不将C303–C305帮助/求助标完成）：tests/alliance.test.mjs新增5项，真实离线Codec/原Service及Workflow验证1/24精确int64请求逐项独立授权、零资源父UID预算、原本人列表精确移除/其他读取不变/派发前History、第二项UNKNOWN或拒绝停止第三项、坏参数/访问器/重复/物品/截止/帮助者变化零派发；重建原Service验证持久UNKNOWN/拒绝记忆继续阻断。联盟整文件201项在联合轮全部通过，后补重建断言定向2/2（4.57秒）；联合轮唯一失败是旧Tasks页面不支持断言，修正后整页1104/1104通过。tests/gameplay-view.test.mjs新增8项，明确1/24选择、同源原图及账号/预算/目标/迟到/编辑隔离，整文件103/103（7.68秒）；tests/gameplay-api.test.mjs新增3项原取消prepare HTTP，覆盖1/24及Origin/CSRF/账号/互斥writer/陈旧来源零写，与Tasks招募共用6/6（5.27秒），不累计重叠结果。完整离线模拟/浏览器E2E债务仍存，R7 IN_PROGRESS、R8 NOT_RUN。 |
| W15 PARTIAL | 原Loop有限naval SURVEY新增CURRENT_RESPONSE_ONLY摘要：同查询/规则绑定的哈希及通过/不匹配/未知计数；响应排序与本地时间不产生变化，相同响应标UNCHANGED，查询/规则改变重建基线；缺来源/身份重复或失源为UNKNOWN。不持久化原始玩家/联盟/舰队数据，不新增调度器 ；本批P1-4将原Fleet舰队/WorldInfo有界历史白名单接总览，测试见W21| 本缓存切片已交；原剩余范围/缺证保留，下一W19见§12.4 | 当前响应未见不证明全局消失、移动或全图完整；哈希仅本轮响应比较，不建立全局持续身份，不推导派遣/攻击资格。W15仍PARTIAL，R7/R8未执行 | 3fdc7ca；原海战观察20d438c/规则a31b4d2保留 ；本行所在提交（父57b0990）| 与本批W19共用五文件879/879 PASS（5.92秒），不重复计数。覆盖精确int64同名不同玩家、乱序/变化/空响应、查询/规则切换、未知不跨接基线、新run不继承及原执行链零写；仅离线Codec/合成传输，REAL_UNVERIFIED |
| W20 PARTIAL | 保留原图编辑、有限run/父预算、日历和三类具名WAIT。本批RESOURCE_AMOUNT_CHANGED复用原GameClient私有连续流、Runner/Service/Store/API及表单；八类可信事件共用原授权链。按原RESOURCE_NAMES选资源、精确int64阈值；首次余额只建基线，后续增减达到阈值触发一次新调查，同包较早匹配不丢 本批原有限运行事件表单复用同图同账号任务Function已调查ID，按main/branch/achievement/daily分源；切事件类型清旧任务/阈值，不推周期或领奖资格。运行边界/事件草稿开始编辑即撤旧预览/授权，未应用时暂停保存/开始和有限运行授权，可明确放弃；仍用原事件流、执行器、父预算和历史。 | 本资源事件切片已交；继续原DAG有据业务，其他领域事件和权威日界逐项保留 | 余额推送不是增量、收入归属、奖励回执或预算额度；坏整包/断流/身份变化未知；重启只读，不恢复监听或许可。全业务及通用周期仍未闭合，W20 PARTIAL，R7/R8 NOT_RUN | 本批事件目标与运行边界草稿集成（父befbaff）；原提交保留 | 本批未新增或执行测试；仅源语法、完整PAGE脚本编译和diff静态检查，不计PASS。R7须覆盖事件类型切换/任务ID同源/无阈值默认、运行边界连续编辑/应用/放弃、旧授权阻断、账号切换和原有限运行历史预算UNKNOWN链。 2026-11-16：Client四文件、Workflow、run-budget-service、Operations/Gameplay HTTP、完整PAGE、D6、History及Memory Service共12文件2307/2307 PASS（177.97秒），随后等待态重启1/1 PASS（3.05秒），本批2308个唯一用例，0 fail/cancel/skip/todo；资源过滤50项已被联合范围覆盖不累计。首轮真实Codec暴露数组descriptor误用，已修复并复验；必需字段缺失的wire解码失败按原合同使全连接来源失效，普通坏列表仅使资源流未知。3源语法/diff及Baseline指纹通过；均离线REAL_UNVERIFIED |
| W21 PARTIAL | 原总览/本人联盟/舰队/任务缓存、19类活动目录、48项Collector、默认配置草稿、计划五维身份与resourcePreview保留。任务15种、装备五动作、徽章/英雄/Pet/Forge/Formation解锁、生产工厂配方及Museum出发/展区目标沿原Function/API/Workflow；原参数、UID/空槽/队列、占用、倍率与materialSource不变。fcc2aeb/440321f/33d4edb/54bfa46已交目标及Workflow领域观察保留。本批原条件字段选择和具名WAIT直接消费同一原调查；共享目标编辑保护扩至阵容模板/英雄站位、联盟商船/捐赠、寻宝、海战筛选、舰队编组/移动/资源田，港口货船旧选择同步暂停。普通/专业/货船候选切换复用原页面渲染刷新表单版本，既清旧计划又允许继续修改；准备目标后仍重新调查。未增业务参数系统、请求或执行器。 原生Workflow目标草稿复用专业页任务ID/生产工厂配方/Museum关卡-倍率-英雄来源；填原Schema字段/列表，不另解析身份。任务kind隔离，周芯片带原round；生产保留materialSource，Museum其他业务/前置约束不覆盖。所有选择清旧候选/计划/授权，应用后重新调查。动态工厂控件同用目标编辑保护。 本批成长原生Workflow选择直接复用专业页英雄/技能槽、装备UID、徽章UID/空槽、Pet建筑/UID/队列idx、Forge建筑/配方及普通模板的只读来源；只填原Schema字段，动作草稿变化须先应用重调查，不跨穿戴/成长来源。Pet idx含0、技能槽从1、UID文本、Forge expectedQueue/expectedEquipmentCounts及高级前置约束保持，未开放培育/成熟领取或替换。 本批原有限运行事件表单复用同图同账号任务Function已调查ID，按main/branch/achievement/daily分源；切事件类型清旧任务/阈值，不推周期或领奖资格。运行边界/事件草稿开始编辑即撤旧预览/授权，未应用时暂停保存/开始和有限运行授权，可明确放弃；仍用原事件流、执行器、父预算和历史。 原累计预算表单也复用同一未应用草稿保护：输入/增删撤旧预览和授权，暂停保存/开始；未添加条目不能静默丢弃，应用或明确放弃后恢复编辑。ResourceLedger与原预算语义不变。  本批原FREE_RECRUIT具名WAIT允许明确recruit=antique，省略仍为英雄；同一RecruitInfo/可信Ping投影按来源隔离英雄/古董截止，原统一入口、原生WAIT表单及History同源。两次调查均经原Function/Service，目标来源及截止必须相同、到期复读确认；草稿编辑撤旧计划/授权，不新建调度或业务写，不解除拒绝/UNKNOWN，重启只读。 本批C131–C133、BIZ-R04/PRO-004关联：货船明确多格有限组合已实现，原合同与边界见W05；非新增执行器或恢复分支。 本批普通免费点金明确次数同周期有限组合接原API/专业页/Workflow，具体原合同边界见W16；无新执行/恢复体系。 本批明确多舰有限维修接原Function、Service准备API、专业页和Workflow；原优先序/累计预算/写前复读/History/UNKNOWN均复用，具体合同见W14，无新执行或恢复分支。 本批三类试炼首通原Function/API/专业页/原生Workflow/Dailies1009/Loop同源集成见W16；旧{}仍raid1，明确raidId=2/3才切换，不以首通确认推导日常完成，无新执行或恢复体系。 本批原邮件页增加明确同页多封目标，原港口页增加明确多艘到港航次目标；同源参数与Function生成原Workflow，不新增页面或目标解析器。勾选/时长/目标/配置编辑撤旧计划及授权，准备重新调查，账号/Client/连接代次或迟到变化丢弃旧响应。 本批P6-2原试炼页支持明确配置末关及有限总时长，原Function/API/Workflow共用raidId/stageId和原catalog/nextTrialStage；未新建页面或目标算法。末关/时长/副本/参数编辑撤旧计划与授权，准备新调查，迟到或账号/Client/连接代次变化丢弃旧响应。 本批日常收尾专业页明确勾选及有限时长，准备重调查，响应逐项核原目标/奖励/父预算/图；账号角色世界Client连接代次/迟到/草稿编辑撤旧计划与授权，原生Workflow及统一声明同源周期字段共用W16。 本批原舰队维护表单支持维修/停止维修/关闭委任，切换清空明确选择及旧预览授权；准备重调查，账号/Client/代次/迟到隔离及原Workflow图校验沿用W14。 本批C522/P6-3：当前港口明确1至24个持货全批非亏损出售，原saleCandidate/报价/请求及typed+独立完整结算不变；原Service准备API、专业页和Workflow逐批ACTION→VERIFY同源。expectedPeriod/expectedSaleHash只锁原周期、航次、单批持货、价格及配置，不绑定余额或其他批次；每步fresh plan/单次授权，固定原quota/UID父预算，收入不扩额度；变化、拒绝或UNKNOWN停止，旧单次部分出售保留，无恢复扩展。 本批当前主支/成就奖励明确收尾沿原Service/API/专业页/Workflow，原参数及逐项授权/父UID/History/UNKNOWN复用，具体交付和R7范围共用W16；无新执行或恢复分支。 本批明确多工厂各单份生产沿原Function/Service/API/专业页/Workflow，原计划器和Ledger唯一；交付及R7范围共用W04，无恢复扩展。 本批明确已占资源田逐田放弃共用原Function/Service/API/舰队页/Workflow，原网格身份、父UID及执行历史保持；交付与R7范围共用W14，无新执行或恢复分支。 本批装备/徽章明确多UID单次成长接原Service/API/专业页/Workflow；合同与R7范围共用W07，无新执行或恢复体系。  本批英雄等级/技能及已激活专武多目标接原Service/API/共用成长表单/Workflow；合同和R7范围共用W06，原兑换升星入口保留。  本批明确多科技各单级接原联盟Function、Service/API、专业树及Workflow；交付和R7范围共用W10，不开放重置或新恢复分支。  本批PRO-007明确多目标藏品成长共用原Service/API/成长表单/Workflow；合同与R7范围共用W11，C144及原缺证保持。  本批明确多舰同城移动共用原Function/Service/API/舰队专业页/Workflow；合同与R7范围见W14，原单舰入口保持，无新执行或恢复体系。 本批联盟不同商船逐船单舱补货同源接原Function/Service/API/专业页/Workflow，具体合同及R7范围共用W09；无新执行/恢复体系。 本批周芯片同轮及开服四模式任务有限收尾复用原Function/Service/API/任务专业页/Workflow，合同与R7范围共用W16/W17；无新执行或恢复体系。 本批原Museum各入口共用完整库存精确结算与非目标展区/展柜验证；具体交付和R7范围见W11，无新执行/恢复体系。 本批Museum明确多目标成长复用原Function/Service/API/共用成长控件及Workflow，具体交付与R7范围见W11，无新执行/恢复体系。 本批W18当前港口明确多货物买入共用原Function/Service/API/买卖表单/Workflow，具体合同及R7范围见W18，无新执行/恢复体系。 本批BIZ-R08明确多目标海兽升级/投喂同源接原Service/API/共用成长控件/Workflow，具体交付与R7范围见W07，无新执行/恢复体系。| 本批城防普通材料组合及FRM-005图纸逐模板解锁已接线，见顶部记录；继续原DAG其他有据业务，日界/周期、C144、W13待捕鱼等原缺证局部冻结，不推全范围完成。 | 解码器空数组不证明线字段已上报或没有活动；无实例ID不造ID，缺字段/重复身份局部未知。目录不证明完整服务器目录、开放、周期、资格或结算；W21 PARTIAL，R7/R8 NOT_RUN | 本批提交（父c2695da）；此前成果保留 | 本批未执行测试，仅源语法/整页编译/diff静态检查。R7须覆盖预算输入、增删、未添加条目、应用/放弃及旧计划零授权。 本批未新增或执行测试；仅源语法、完整PAGE脚本编译和diff静态检查，不计PASS。R7须覆盖事件类型切换/任务ID同源/无阈值默认、运行边界连续编辑/应用/放弃、旧授权阻断、账号切换和原有限运行历史预算UNKNOWN链。 本批未编写或运行测试；源语法/整页脚本编译/diff仅静态检查。R7待覆盖所有共用来源等价、UID/槽位/0索引/技能索引、未知/重复、动作草稿失效、原高级约束及Service预算/History/UNKNOWN链。 本批未编写或运行测试；仅源语法、完整PAGE脚本编译和diff静态检查，不计PASS。R7待覆盖同源选择/原Schema读取、未知/重复来源、任务kind及round、材料包约束、Museum人数/占用/倍率/原参数保持、动态工厂及账号/迟到控件、原Service预算/History/UNKNOWN。 本批未编写或运行测试；源语法、组合PAGE编译与diff仅静态检查，非测试PASS。R7待覆盖所有目标入口、候选切换后编辑/重新准备、旧计划零授权、字段/等待来源与账号/迟到控件隔离。历史22项装备、19项资源、11项计划身份、目录/16项默认草稿用例仍仅编写未运行；历史结果不累计，Baseline不变，REAL_UNVERIFIED，R7/R8 NOT_RUN。  本批未新增或执行测试；四源node --check、原浏览器函数仅编译不执行和diff仅静态检查。R7补英雄旧声明/历史兼容、古董来源及参数、相同秒值不同招募源不混淆、坏/缺来源/可信时钟/截止变化/超上限、两次调查账号隔离及迟到取消、原Tasks/Dailies/Loop编译/原生WAIT/页面草稿失效、只读零业务写、重启零恢复权限和原招募净扣净入/父预算/History链；R7/R8 NOT_RUN，REAL_UNVERIFIED。  本批货船组合静态检查及R7待测范围见W05，不重复累计。 本批免费点金组合静态检查及R7范围见W16，不重复累计。 本批多舰维修静态检查和R7待测范围见W14，不累计历史PASS。 本批三副本集成静态检查及R7范围见W16，不累计历史PASS。 本批邮件/港口控件及原浏览器函数仅编译，未新增/运行测试；R7补草稿/选择/预算/授权失效与迟到/隔离，范围共用W05/W16。 本批原浏览器函数只编译；试炼序列页面、API与Workflow集成留R7，未运行测试。 本批未新增或执行测试；七源语法、浏览器函数仅编译及diff仅静态检查。R7补同周期1/24目标、缺失/重复/坏字段、任务/活跃身份、只读三源复用、任务后档位原typed及完整净入、跨周期/到期/配置/草稿/迟到/账号Client连接代次、父UID预算/逐步授权/拒绝/UNKNOWN及旧单次/历史兼容；R7/R8 NOT_RUN。 本维护批次未新增或执行测试；三源语法/浏览器函数只编译/diff仅静态检查。R7补三种维护模式/旧省略action、1/24舰/重复/坏输入、同舰不同动作摘要冲突、旧维修优先序/汽油限额、原停止请求/独立复读/零资源父预算、状态/配置变化、逐舰授权拒绝/UNKNOWN和草稿/迟到/账号Client连接代次；旧单舰及恢复兼容保留待回归，R7/R8 NOT_RUN。 本批未新增或执行测试；五源语法、浏览器函数只编译及diff仅静态检查。R7补1/24批、旧单次/部分出售、重复/坏参数、原非亏损报价及累计余额边界、周期/港口/航次/持货/配置变化、前批成功后后批守卫稳定、typed全结算、父quota/UID预算、逐步授权/拒绝/UNKNOWN及草稿/迟到/scope隔离；R7/R8 NOT_RUN。 2026-11-18集中R7：tests/data-catalog与explorer-api核failed覆盖旧NOT_EXECUTED；Explorer合成快照经原HTTP刷新建立私有绑定，后续读取零额外采集、账号隔离/精确int64/脱敏保留，未放松未绑定恢复缓存保护。 合同等九文件688/688通过（61.78秒），缓存/海战三文件60/60通过（5.75秒），古董原Workflow定向1/1通过（4.28秒）；共享结果不跨行累计。此批仅测试合同/夹具修正，非业务写链改造，R7 IN_PROGRESS、R8 NOT_RUN。 |
| W04 PARTIAL |原生产/材料包覆盖及bf918f7构造、dbf65db加速、24ce534收取、2575b37建造、8fa3b2b订单材料净余额保留；订单奖励诊断仍独立。本批原农田库存复用parseOperationInventory，保留canonical-only及DEL禁止，冲突别名拒绝；种子净扣和typed作物净入改用原stockMatchesDelta，原配置成本、成熟时钟、单田目标/凭据、其他库存不变与原授权历史链保持  本批普通定点生产允许明确buildingId/productId，同一原候选只保留该对的startProduce，计划/原派发器核对范围，工厂详情/API/原生Workflow同源；材料包固定来源合同保持。 本批普通startProduce候选公开同一精确buildingId/productId，供专业页与Loop/原生Workflow直接复用；固定materialSource组合参数原样保留，无新增成本器、计划器或验证器。 本批生产配方/队列/精确成本/库存与时间范围在Workflow原候选面板同源显示；专业候选细化参数后先清旧选择/计划，要求重新调查，不以旧全厂候选直接预览。 Workflow普通生产选择复用专业页唯一工厂及配方来源，只填原buildingId/productId；materialSource组合约束保留，选后清旧计划并重新调查，不推断完成结算。  本批C111/P2-1：明确选择1至24个不同工厂各单份普通配方，原productionQuote/planCityOperations与同一ResourceLedger累计核初始自有材料，未新建计划器或成本算法。原Service准备API、生产页逐厂明确配方和原Workflow逐厂ACTION→VERIFY同源；每步原Function重新调查、单次授权，原执行器确认精确扣料和队列新增。每厂只一份，不自动收取/补购/加速/兑换，不以预计产出扩预算；原材料包组合及单厂入口保留。 本批BIZ-R14：独立材料包专业页支持明确1至13个不同包/材料组合及各自包数，复用原projectMaterialPackPreparations有序完整库存报价、SelectPack单项Function及原精确净扣净入验证。Service只读准备API POST /api/gameplay/material-packs/prepare与专业页生成同一原Workflow逐项ACTION→VERIFY，固定每步原actionId及初始持有包累计父预算；每项重新调查及单次授权，来源变化、拒绝或UNKNOWN停止，不补购、不自动排产，原单项及兑换后生产入口兼容。修改src/material-packs.mjs、src/operation-service.mjs、src/server.mjs、src/gameplay-page.mjs。  后续C151组合接线复核发现此前prepare处理函数遗漏server入口路由集合；本批已将堡垒、图纸和材料包准备端点补入原gameplayRoute集合（src/server.mjs），HTTP可达性须R7实际验证，原静态检查不证明此前API已可用。  2026-11-18本批W04/C116（关联原C111/C115执行链）：明确1至24个不同工厂当前成品逐厂领取。原production/start/prepare端点扩展action=collect及原工厂/expectedCollectionHash参数；同次私有调查仅投影原gainFactory候选，摘要固定各自完整建筑/队列/成品、原身份和配置，不绑定其他所选工厂或库存收入。原Service准备锁、来源/配置复核、Registry/Contract、planCityOperations及原executeCityAction/verifyCoreOperation复用，专业页明确多选与原Workflow逐厂ACTION→VERIFY同源。每厂新调查/单次授权，原仓储上限、部分领取及完整库存精确净入验证保持，零父资源支出，收入不扩预算；批次/队列变化、拒绝或UNKNOWN停止，不自动领余量、排产/加速/等待或补购，无新执行/恢复体系。旧空参数单项及明确生产/材料组合保持。实际修改src/core-operation-adapters.mjs、src/function-contracts.mjs、src/server.mjs、src/gameplay-page.mjs、tests/core-operation-adapters.test.mjs及本行；src/operation-service.mjs原生产准备方法直接复用。  2026-11-18本批W04/C101–C104/C116：原city Function增加明确buildingId/action/expectedCityHash目标，支持1至24个不同建筑各一个当前build、upgrade、finishUpgrade或collectProduct。复用原cityView/planCityOperations、ResourceLedger、executeCityAction与verifyCoreOperation；同次私有调查摘要绑定原身份、建筑完整状态、原动作和配置，不把其他目标或库存收入固定进每步摘要。原Service准备API POST /api/gameplay/city/prepare、原城市页专业区和原Workflow逐项ACTION→VERIFY一次接线，每项fresh plan、单次授权及原独立成本/完整库存结算。原人口、等级、建造位、仓储上限继续逐项核对，不预测前项解锁/未来产出、不自动加速/补购或重复领取；拒绝或UNKNOWN停止，收入不扩固定父预算，重启只读。原空参数单项及旧城市共用批次入口保留。实际修改src/core-operation-adapters.mjs、src/function-contracts.mjs、src/operation-service.mjs、src/server.mjs、src/page.mjs、src/gameplay-page.mjs及对应三测试文件；tests/function-contracts.test.mjs同步既有联盟取消/工厂领取与本批城市参数清单。  2026-11-18本批W04/C103/C115（原城市/工厂道具加速合同，P1-2/P2-2）：城市原明确目标及city/prepare增加speedUpUpgrade；原production/start/prepare增加action=speedUpProduce与明确buildingId/index/expectedAccelerationHash，允许1至24个不同工厂各一个当前队列的一次加速。复用原cityView/planCityOperations/planWorld、自有加速器type=2成本和原截止/完整库存净扣验证，原Ledger累计核准备时持有量；私有摘要绑定完整建筑/队列、原精确用量、五维身份和配置，不绑定其他已选目标的变化。原城市专业区及生产页明确多选、有限期限、原Workflow逐项ACTION→VERIFY同源，每步新调查、单次授权，时间推移使原用量变化、队列变化、拒绝或UNKNOWN即停。既有成品领取和生产草稿守卫复用，没有新增执行/授权/恢复链；旧空参数和各单项入口保留，不收RUBY/广告/补购，不自动追加或推定完成/领取。实际修改src/core-operation-adapters.mjs、src/function-contracts.mjs、src/gameplay-page.mjs；测试修改core-operation-adapters、farm-forge-full-page、gameplay-api、function-contracts四文件。 | 继续W19原Tasks/Dailies有限声明尚未接入的明确目标业务；直接复用原Function/Service，不增加调度/历史/恢复机制，缺冷却/日界证据保持局部冻结。 | 全天量、订单最终金币、免费刷新及原其余农田结算缺证不变；材料匹配不等于奖励到账。UNKNOWN零重放，W04 PARTIAL，R7/R8 NOT_RUN  原buildingAutoWork/factoryAutoProduce仅有遗留动作描述，缺明确成本、独立状态复读及持续耗材合同，具体操作保持BLOCKED_EVIDENCE；不开放旧写入口。| 本批提交（父d1bb530）；此前成果保留 | 本批未编写或运行测试；仅源语法、完整PAGE脚本编译和diff静态检查，不计PASS。R7待覆盖同源选择/原Schema读取、未知/重复来源、任务kind及round、材料包约束、Museum人数/占用/倍率/原参数保持、动态工厂及账号/迟到控件、原Service预算/History/UNKNOWN。 本批未新增或执行测试；仅源语法、完整PAGE脚本编译及diff静态检查，非测试PASS，R7须覆盖原投影一致/未知来源、目标变化重调查、节点缓存/账号/迟到控件及原Service预算/History/UNKNOWN链。历史证据（本轮未重跑）：本批未编写或执行测试；仅四源语法、完整PAGE脚本编译及diff静态检查，非测试PASS，R7/R8 NOT_RUN。历史结果（本轮未重跑）：2026-11-16：farm-operations/farm-service两文件238/238 PASS（46.08秒），Contract/Registry两文件93/93 PASS（1.35秒），农田API/专业页过滤83/83 PASS（3.45秒），均0 fail/cancel/skip/todo。先复现冲突id/count各1失败；修复覆盖同源完整性、canonical/相同别名兼容、拒旧alias-only/DEL/稀疏/继承/碰撞/坏res、最后种子移除及非目标库存变化；Plant/Harvest写前零派发、写后UNKNOWN资源/UID保留及原Service磁盘重启零重放。首轮新matching夹具须同类型count，API旧收获未实现假设改显式缺可信时钟，原不可执行/409/零写/零历史断言保持。四源语法/diff及Baseline指纹通过；8fa3b2b的737及13为上一批证据，不累计。均离线REAL_UNVERIFIED  本批定点生产未运行测试，R7须验证部分参数拒绝/精确目标/原空对象及包组合兼容、原执行链预算和UNKNOWN；历史PASS不累计。  本批未新增或执行测试；四源语法、浏览器函数只编译及diff仅静态检查。R7补1/24厂、同厂重复/坏目标、单厂足料但累计不足、共享材料累计预留/零成本、原配方/队列/制造位/库存上限、逐厂授权与精确净扣/队列新增、资格/配置变化、父资源预算/拒绝/UNKNOWN、旧单厂/材料来源兼容及草稿/迟到/scope隔离；R7/R8 NOT_RUN。 本批材料包组合未新增/执行功能测试；四源语法、完整PAGE脚本编译及diff仅静态检查，非测试PASS。R7补1/13项、重复/坏参数/访问器、两类包共享累计不足、精确包数/赛季/配置、累计所得溢出、完整库存报价/actionId连续匹配、逐项授权/拒绝/UNKNOWN/取消、账号角色世界连接代次/迟到/编辑/草稿隔离及旧单项/包后生产兼容。R7/R8 NOT_RUN，REAL_UNVERIFIED。  本批定向离线三项3/3通过（2.00秒）：双厂顺序原Adapter真实执行/精确cloth和fuel净入及零未决，首厂不生效保留UNKNOWN且无后项，队列变化/重复/混动作/缺或坏摘要零准备写。初轮新夹具错误传入rules/player等非准备字段被原严格校验拒绝，已只传原config/moduleConfig；生产校验未放松。源语法及PAGE脚本编译仅静态检查。R7仍须覆盖原Service/真实本地HTTP路由及CSRF/账号/五维Client/配置变化、页面明确选择/草稿/迟到/响应篡改、1/24厂边界、仓储部分领取/无关库存变化/数字边界、逐厂单次授权/拒绝/UNKNOWN/重启零重放、旧生产/材料组合及完整离线模拟；R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。 2026-11-18成品组合领取C116集中离线补证：tests/gameplay-api.test.mjs新增成功/UNKNOWN/明确拒绝3项真实本地HTTP，经原Service逐厂授权、单次许可、派发前History及完整库存结算，复读History保留UNKNOWN；与主线矩阵共15/15通过（11.95秒）。tests/farm-forge-full-page.test.mjs新增9项默认不选、精确选择/零支出预算图载入及选择/时长/编辑/账号迟到和产品/预算/节点/目标篡改拒绝。首轮发现实际src/page.mjs原operationMutation白名单缺已有production/start/prepare，已补入同一路由，沿原账号与CSRF检查，修复多厂生产及领取专业页无法准备。完整PAGE整文件1129/1129通过（10.41秒）；核心Adapter整文件69/69通过（5.96秒，含此前3项，不累计），src/core-operation-adapters.mjs仅恢复原空对象错误文案兼容。仍欠1/24厂边界、仓储部分领取/无关库存与数字边界、更多Client/配置变化和旧生产材料组合覆盖；浏览器E2E、全范围R7/完整模拟未完成，R8 NOT_RUN、REAL_UNVERIFIED。  本批集中离线：核心Adapter/完整PAGE/Function合同三整文件1237/1237通过（10.90秒），本地HTTP及页面定向7/7（7.34秒，4项页面已含整文件，不累计）。新增4项原Adapter连续建造升级/精确累计净扣、UNKNOWN、累计不足/重复/混字段/旧摘要拒绝、完工及普通产物精确净入；新增4项城市页面明确选择/原守卫路由/图载入、迟到编辑及成本/目标篡改拒绝；新增3项HTTP经原Service/Workflow逐项授权、许可重放拒绝、History/重启读取及成功/拒绝/UNKNOWN终态。保留初轮失败：旧合同字段清单遗漏已存在expectedCancelHash及工厂领取字段；新普通产物夹具误用buildingIds，已按原builder实际buildingId数组断言，未改协议。R7仍欠1/24建筑边界、全部状态动作的Service/HTTP组合、人口/等级/并发建造位/库存上限变化、更多五维/Client/配置及迟到选择/账号隔离、真实浏览器E2E、全范围回归与完整离线模拟；R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。  本批道具加速集中离线：tests/core-operation-adapters、city-operations、farm-forge-full-page、function-contracts四整文件1402/1402通过（10.84秒）；HTTP及页面定向12/12（6.03秒，其中页面6项已含整文件，不累计）。新增领域6项覆盖两模块连续两目标、精确原2+2道具扣至零、首项无效果UNKNOWN且无后项、原用量变化/重复/付费字段/累计不足零派发；新增页面6项覆盖原守卫API、预算/图同源、成本篡改及迟到选择拒绝；新增HTTP6项覆盖两模块成功/明确拒绝/UNKNOWN、逐项许可/重放拒绝、派发前History及磁盘未决读取，真实本地Codec检查speedUp.type=2和原useNum。均0失败/取消/跳过；静态检查不计功能PASS。R7仍欠1/24目标、队列index边界、同厂多选拒绝更多组合、跨分钟用量变化/截止完成/配置及五维Client变化、旧单项/其他生产组合的更广Service回归、浏览器E2E、全范围与完整离线模拟；R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。  2026-11-18集中R7补C103/C115加速组合边界：tests/core-operation-adapters.test.mjs新增15项，复用原夹具及执行/验证器；城市与工厂各1/24目标原图校验及逐项实际执行，初始道具精确耗尽，工厂idx=0/int32上限；原分钟成本跨界、完成状态、配置/代次改变拒绝旧摘要，同厂双队列互斥、完整队列变化及0/25/稀疏/期限/访问器零读取零派发。整文件94/94通过（9.11秒）；首轮8项因新测试把通用options传给严格prepare而拒绝，已只传原config/moduleConfig和合法payload，生产守卫未改。其他R7 HTTP/UI边界与完整离线模拟仍待补，R8 NOT_RUN。  2026-11-18集中R7补C103/C115真实本地HTTP八项：城市/工厂各1和24目标成功、各第23项UNKNOWN/拒绝停止24项，idx=0/int32上限沿原Codec；逐项目标/计划成本/独立许可/许可重放、固定初始父额度与实际预留、完整道具净扣、History节点与磁盘重开、终止后零查询/重派发均确认。与W22跨领域模拟共用gameplay-api整文件467/467（415.17秒），不累计17项定向重叠。首轮八项在成功走完执行后因测试误取关闭预算字段失败，按原state=CLOSED纠正并加强limits/reserved精确断言，生产规则未改。页面浏览器E2E/各读取消与全平台完整模拟仍待补，R7 IN_PROGRESS、R8 NOT_RUN。  2026-11-18本批补W04/C103/C115加速页面50项及HTTP40项：页面涵盖1/24目标、明确选择和期限、原图/固定预算、迟到身份/配置/编辑变化及篡改拒绝；HTTP涵盖城市5和工厂7读取边界在准备/执行阶段取消零派发，以及账号/角色/世界/连接/代次/Client/配置/断线变化拒绝和后继锁保留。完整PAGE与Adapter两文件1283/1283通过（11.70秒）；最终含旧城市准备/领取和跨领域场景联合166/166通过（76.21秒），轮次重叠不累计。首轮执行取消12项因新夹具遗漏Manual selections失败，补齐原actionId后40/40通过，生产合同未改。PAGE为脚本VM，非浏览器E2E；本批未重跑130文件，全平台完整模拟和其他原债务仍待完成，R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。 |
| W11 PARTIAL |2026-11-20 修复博物馆首次加载无缓存视图时多队出发控件访问空对象的问题，未调查时保留不可准备提示；Edge经本地HTTP确认空缓存加载后可只读调查。新增全GP_MODULES模拟空视图首次加载与零写请求检查；完整页面夹具和博物馆合同1269/1269通过，博物馆HTTP及Edge 11/11通过。修改 src/gameplay-page.mjs、tests/farm-forge-full-page.test.mjs、tests/gameplay-api.test.mjs 和本行，真实环境仍待独立验收。 2026-11-18 PRO-006 / P2-7 扩展原展陈操作。专业页支持选择 1 至 24 个升级中的展柜。原博物馆准备 API 与 Workflow 复用同一 Function、父预算与 History。固定原展区、展柜计时和道具数量，每柜独立授权，核对每件加速器缩短 60 秒、全部库存净扣及其他展柜不变。仅当缩短后仍在升级时可执行，效果不确定即停止。修复探险加速组合重复显示普通候选。代码在 src/museum.mjs、src/gameplay-page.mjs、src/function-contracts.mjs。tests/gameplay-api.test.mjs 和 tests/farm-forge-full-page.test.mjs 覆盖批量成功、陈旧计时和库存不足拒绝、59 秒变动进入 UNKNOWN 及后续零派发。博物馆 HTTP 8 项和专业页 3 项定向离线通过，R7 全量仍待完成。C144 结算和领奖仍冻结。2026-11-18 W11 / C143、PRO-006、P2-7：专业页可勾选 1 至 24 支正在探险的队伍。原博物馆成长准备 API 复用原 Function 和共享 Ledger 核对自有道具存量并生成逐队 ACTION→VERIFY。每队固定原身份、计时和道具量，单独授权，按每件 1800 秒和完整库存核对净扣。到期边界、拒绝或 UNKNOWN 停止。原单队入口保留，C144 结算与领奖继续冻结。修改 src/museum.mjs、src/function-contracts.mjs、src/gameplay-page.mjs、tests/museum.test.mjs、tests/function-contracts.test.mjs、tests/gameplay-api.test.mjs、tests/farm-forge-full-page.test.mjs。博物馆与合同 74 项、准备 API 6 项和新增专业页用例通过。R7 仍欠全量离线回归和完整模拟，R8 待独立验收。 ac64891及原古董激活/成长/套装/精通/兑换、Museum合同保留；本批古董净扣和兑换净入复用stockMatchesDelta，删除两段独立库存算法。原品质成本、精确藏品/套装/精通变化及typed精通凭据独立验证保持  本批原Museum出发提供最小关卡/人数/英雄占用/已解锁倍率白名单投影及专业选择表单，只准备stageId/heroIds/factor；原出发/Service/授权/预算/History保持，结算/领奖继续缺证。 本批展区/关键词/展柜有效性沿用原keywordsValid/casesValid，未知只返回null；陈列空字符串明确撤下，持有藏品选择不冒充资格。原候选携带其精确目标参数，原Service/父预算/History/UNKNOWN保护不变；C144继续冻结。 本批Museum原只读关卡/人数/占用/倍率/材料及展区在Workflow候选面板同源显示，不推导新资格或结算。 Workflow出发目标与专业页共用原explorationSelection投影，原关卡人数、明确倍率和未占用英雄多选填原Schema列表；其他Museum业务/前置约束不覆盖，应用后重新调查和单次授权。  本批PRO-007：明确1至24个不同藏品/套装，同批一种原激活、升星、套装单级或明确数量1:1兑换，各目标一次。复用原liveFacts封印、planAntiqueGrowth及共享Ledger核全部初始自有材料，原完整藏品/套装/精通/库存验证保持；原Service只读准备API、共用成长控件和Workflow逐项ACTION→VERIFY同源，每步重新调查/单次授权。兑换收入不补父预算，不跨模式推资格，拒绝/UNKNOWN停止，无新增请求或恢复分支。  本批原Museum调查统一调用parseOperationInventory，移除独立宽松库存解析，缺料投影共用同一可靠性。原出发/道具加速及展区/关键词/展柜成长净扣、typed收益/成就配置净入统一stockMatchesDelta，完整库存必须精确差额，不再接受至少扣料或无关变化；零支出完工/陈列也确认库存不变。成长/陈列原非目标展区、关键词、展柜字段比较保持，原即时/计时分支及明确空字符串撤下保留，成就只新增所选档位。原Function/Service/API/UI/Workflow自动共用唯一验证器，无新请求、参数、执行器或恢复分支。 本批明确1至24个不同展区/关键词/展柜同类单次成长或到期完工，原Museum候选/actionId、planMuseum及共享Ledger累计核初始自有材料/保留线；原Service只读准备API、共用专业成长表单及Workflow逐目标ACTION→VERIFY同源。每步重新调查/单次授权/原完整状态与库存精确验证；开始计时不表示完工，不模拟未来解锁，无新执行器或恢复分支。 本批PRO-006/P2-7原陈列子域（非C144结算）：明确1至24个不同展柜的当前合格放入、替换或空藏品ID撤下；复用原museumView陈列规则投影合格目标，原planMuseum/verifyMuseum、Service及原/api/gameplay/museum/growth/prepare，专业页每柜明确选择并接逐项ACTION→VERIFY。expectedExhibitHash仅为原展柜/展区等级/关键词、藏品归属及目标配置/开关的规划守卫，前项其他展柜陈列不破坏后项摘要；同一展柜及非空藏品ID各一次，固定原父展柜/藏品UID和零资源预算。原单项兼容，逐柜新调查、单次授权，原完整展柜/非目标状态及库存净差验证；变化/拒绝/UNKNOWN停止，不推算先撤下再转放的未来资格、不连带收益/探险结算或恢复执行。实际修改src/museum.mjs、src/function-contracts.mjs、src/gameplay-page.mjs及本行；原Service/API/Registry/History执行与恢复体系直接复用。  2026-11-18 W11/P2-7：原Museum Function（沿用C141–C144元数据）claimAchievement人气成就子动作支持明确1至24个当前达标未领档位，C144探险结算仍冻结。原POST /api/gameplay/museum/growth/prepare直接复用Service调查/身份/配置守卫及原prepare/plan；专业页同源多选、原生Workflow精确档位字段/来源选择及逐档ACTION→VERIFY接通。明确档位候选只含该动作，原请求、零成本、完整已领列表唯一新增及全库存奖励净入验证保留，父UID固定角色与档位，累计奖励核安全余额但不扩父预算；每项仍新调查、单次授权、拒绝/UNKNOWN停止。旧空参数单项候选保持原预算合同。实际修改src/museum.mjs、src/function-contracts.mjs、src/gameplay-page.mjs及本行，Service/server路由无需重复建设。  2026-11-18 W11/C143/P2-7：明确1至24队当前空闲已解锁关卡逐队出发，完整指定各队当前未占用英雄与原已解锁倍率；原队伍容量一次容纳全部目标，关卡及英雄互斥，原planMuseum/ResourceLedger累计核初始材料和保留线。原museum/growth准备API与专业页队伍列表、原Workflow逐队ACTION→VERIFY同源；expectedExploreHash绑定原关卡/英雄归属/等级解锁配置，排除本批其他队已确认出发和库存，使后队可重新计划而不模拟未来状态。父关卡/英雄UID及材料预算固定，各队仍新调查、单次授权及原出发/全库存净扣验证，变化/拒绝/UNKNOWN停止；旧单队入口和预算合同保持，C144完成结算/探险奖励继续冻结。实际修改src/museum.mjs、src/function-contracts.mjs、src/gameplay-page.mjs、tests/museum.test.mjs、tests/gameplay-view.test.mjs及本行；复用原Service/server准备路由，无新执行/调度/恢复体系。 | 继续W18当前港口明确多货物买入：复用原buyCandidate/planTrade及完整typed结算，累计核自有贸易币与仓位；不推跨港收益或扩恢复。 | MuseumInfo没有同次结算结果、pending领奖凭据或收据，Complete响应无结算ID；stageId不能恢复同次结果。到期/库存增加/expedition消失均不足，C144仍PROTOCOL_ONLY/BLOCKED_EVIDENCE，W11 PARTIAL，R7/R8 NOT_RUN | 本批提交（父af6b670）；原成果保留 | 本批未编写或运行测试；仅源语法、完整PAGE脚本编译和diff静态检查，不计PASS。R7待覆盖同源选择/原Schema读取、未知/重复来源、任务kind及round、材料包约束、Museum人数/占用/倍率/原参数保持、动态工厂及账号/迟到控件、原Service预算/History/UNKNOWN。 本批未新增或执行测试；仅源语法、完整PAGE脚本编译及diff静态检查，非测试PASS，R7须覆盖原投影一致/未知来源、目标变化重调查、节点缓存/账号/迟到控件及原Service预算/History/UNKNOWN链。历史证据（本轮未重跑）：本批未编写或执行测试；仅四源语法、完整PAGE脚本编译及diff静态检查，非测试PASS，R7/R8 NOT_RUN。历史结果（本轮未重跑）：与W07共用本批13文件579/579，不重复计数；四品质最后万能来源耗尽、零行省略及专属等量净入通过，原激活/星/套装/精通/拒绝/UNKNOWN及持久恢复回归通过；前批Museum125/6为历史，Baseline未变，REAL_UNVERIFIED  本批未运行测试，原人数解析等价及投影/表单隔离待R7。  本批未新增或执行测试；四源语法、浏览器函数仅编译及diff仅静态检查，非测试PASS。R7补1/24目标、重复/坏参数/同类动作、原私有封印/过期/scope/配置、原激活派生套装/星/套装上限与精确兑换净入、共享来源累计不足、原完整库存/目标及非目标验证、逐项预算/授权/拒绝/UNKNOWN、原精通/单次及共用英雄装备徽章表单兼容、编辑/迟到隔离；R7/R8 NOT_RUN。  本批未新增或执行测试；两源语法及diff仅静态检查，非测试PASS。R7补原全部Museum动作等价、最后成本来源耗尽/零行省略/坏重复或冲突库存、少多扣/少多入及无关库存变化、目标成长与非目标展区/关键词/展柜变化/乱序、即时或计时升级/到期完工/道具加速、精确陈列撤下与其他库存不变、typed收入/配置多奖励及成就唯一新增，原API/UI/Workflow/Service预算/授权/UNKNOWN；C144继续冻结，R7/R8 NOT_RUN。  本批未新增或执行测试；四源语法、浏览器函数仅编译及diff仅静态检查。R7补1/24目标、重复/稀疏/未知字段/混动作、各关键词/柜身份、原成本及累计材料/保留线、即时/计时/到期分支、精确actionId、逐项授权/预算/拒绝/UNKNOWN、旧单次及其他成长表单兼容和编辑/迟到/scope隔离；R7/R8 NOT_RUN。  本批未新增/执行功能测试；源语法/PAGE脚本编译、静态注册加载与diff仅静态检查。R7补1/24展柜、放入/替换/撤下空ID、重复柜/非空藏品与坏参数/访问器/混入其他动作、原归属/已陈列/锁柜/升级中资格、目标摘要/配置变化及前项陈列不阻后项、精确目标及全部非目标展区/柜/关键词/库存保持、固定父UID/逐项授权/拒绝/UNKNOWN、原prepare端点真实HTTP、页面互斥/草稿/编辑/迟到/五维Client隔离、旧成长/单项兼容及完整离线模拟；R7/R8 NOT_RUN，REAL_UNVERIFIED。  2026-11-17集中R7发现并修复src/museum.mjs：expectedExhibitHash限定陈列候选，避免其他成长候选继承摘要后触发严格参数拒绝，原单项及资格/结算不变。tests/museum.test.mjs新增放入/空ID撤下组合、原actionId/固定柜及藏品UID、前项独立成功后后项可计划、目标/归属/配置变化拒绝、重复与假设移动拒绝；实际准备结果经专业页面原图校验器通过并拒绝篡改。与W07共用museum、museum-shortage、equipment-forge、equipment-forge-service四文件124/124 PASS，0失败/取消/跳过（7.04秒）。仅该范围离线验证；24柜/真实HTTP/完整页面交互/逐项历史及完整模拟仍待补，C144冻结，R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。  本批既有museum/museum-shortage两文件41/41回归通过，0失败/取消/跳过（3.59秒），仅既有覆盖；另用合成双档位核原准备输出经页面图校验及原Workflow validator、后项重新计划、奖励篡改拒绝，不作为完整R7验收。源码/PAGE编译及diff为静态检查。R7补1/24档位、重复/稀疏/访问器/未知/重复配置、已领/未达标、累计奖励溢出与完整库存、原Service真实本地HTTP、逐档授权/拒绝/UNKNOWN及父UID、旧单项/成长兼容、页面与Workflow编辑/迟到/账号角色世界Client连接代次隔离和完整离线模拟。R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。  本批定向三文件museum/museum-shortage/gameplay-view联合129/129通过，0失败/取消/跳过（4.05秒）；新增覆盖多队实际准备图经原Workflow/专业页校验、原单队兼容、首队原验证成功后后队新计划、关卡/英雄/配置变化、累计材料/保留线/容量不足、重复及访问器零读取、父UID/成本/跳过VERIFY篡改、页面真实选择到准备图及账号/时长/Workflow草稿迟到隔离，并补前批人气领奖组合的独立后项/累计奖励溢出/重复配置。首个临时纯函数烟测因合成时钟字段不全在准备前拒绝，已改用原survey夹具回归，未改时钟守卫。源语法/PAGE编译及diff均属静态检查。非完整R7验收；R7仍须补1/24队边界、真实本地HTTP和原Service逐项授权/父预算/持久历史/拒绝/UNKNOWN、并发占用/各读边界取消、五维Client隔离及完整离线模拟；R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。 2026-11-18集中R7补tests/gameplay-api.test.mjs：原museum/growth准备端点经本地HTTP、Service与Workflow验证双档人气成就及双队出发；逐项新计划/独立许可、原零资源或累计6小麦及固定父UID、确认后后项继续、完整库存精确变化、原History批次/节点关联、跨账号拒绝、许可重放拒绝均覆盖。合成无效果首项保持UNKNOWN并关闭父预算，后项零派发、重复resume零查询/零重放；不涉及C144探险结算。Museum合成传输按明确stageId更新目标，具名请求经原Codec校验。与W19共用gameplay-api全文件377/377通过，0失败/取消/跳过（287.60秒），不重复累计定向4项。仅此本地离线覆盖；1/24边界、后项拒绝/UNKNOWN、完整页面端到端、各读边界取消及完整离线模拟仍待补。R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。  2026-11-18集中R7：C143/P2-7：tests/museum-batch-boundaries.test.mjs补1/24队和1/24人气档位，经原准备图/Workflow/新计划/验证，固定父UID/初始材料、无效果与无关库存拒绝、累计不足/容量/溢出/末项变化拒绝。 三文件共94/94通过（4.89秒），跨行共享不累计；仅离线覆盖，完整HTTP/UI/模拟债务保留，R7 IN_PROGRESS、R8 NOT_RUN。 |
| W06 PARTIAL | cc0679c及原明确1至12英雄有序兑换/单星准备保留；本批原英雄碎片兑换库存验证复用stockMatchesDelta，以原合同成本和精确目标num核1:1净入，完整英雄及其他库存不变。原共享来源预算、固定星级/余额/成本和单步Service链保持  本批C221/C222/C224及W07的C225/C226：明确1至24名不同英雄，同批一种等级/明确技能槽/已激活专武成长，各一次；复用原planHeroes/planHeroOperations、operationBudgetClaims及共享Ledger核全部自有材料。原Service只读准备API、原专业页共用成长控件与Workflow逐名ACTION→VERIFY同源；每步仍重新调查、单次授权及完整英雄池/库存复读，不按未来升星解锁技能。 | 继续W19原Tasks/Dailies有限声明尚未接入的明确目标业务；直接复用原Function/Service，不增加调度/历史/恢复机制，缺冷却/日界证据保持局部冻结。 | 隐式universal=true、全自动策略及其他兑换仍缺各自身份/成本/结算，不由已交子集推导W06完成。前置变化、拒绝、UNKNOWN或期限到限停止，重启只读零重放；R7/R8 NOT_RUN | 本批提交（父a21a4cb）；原成果保留 | 与W07共用本批13文件579/579，不重复计数；四品质最后来源耗尽/零行省略和精确专属净入通过，原英雄及公共执行链回归通过；Baseline未变，REAL_UNVERIFIED  本批未新增或执行测试；四源语法、浏览器函数仅编译及diff仅静态检查。R7补1/24英雄、重复/坏参数、同类动作与技能1–4槽、已激活专武/原成本上限、共享材料累计不足、原完整英雄池/库存验证、单次授权/拒绝/UNKNOWN、共用装备徽章入口兼容及编辑/迟到/scope隔离；R7/R8 NOT_RUN。  2026-11-18集中R7补C221/C222/C224及W07/C225/C226：tests/hero-service.test.mjs新增24项，LEVEL、明确SKILL槽1–4、已激活EXCLUSIVE-LEVEL/STAR各1/24英雄经原prepare/Service/Workflow逐项新计划、单次许可及History执行，核全部初始材料耗尽、ORANGE/RED各原成本与碎片、固定父资源/专武UID、完整英雄/非目标与库存、第二项UNKNOWN/拒绝停止第三项及终止后零读取重放、累计材料不足和稀疏/访问器/重复/混动作/末项资格缺失零派发。tests/hero-exclusive-service.test.mjs新增5项原Console准备API及逐项HTTP许可/执行、跨已连接账号批次不可见STALE_PLAN、许可重放拒绝、Origin/CSRF/互斥及采集期间世界变化；测试Runner与Service统一原合成时钟。tests/gameplay-view.test.mjs新增16项，四类1/24明确选择、原逐项验证图/预算同源、来源/时长/编辑/scope迟到及成本/UID/VERIFY篡改拒绝。三个整文件275/275通过（75.50秒），0失败/取消/跳过；首轮补齐合成四技能槽各星级上限和成本，HTTP按原STALE_PLAN与CANCELLED合同断言，生产规则未放宽。仅离线Codec/合成传输及原页面脚本VM，非浏览器E2E、129文件全量重跑或完整离线模拟，R7 IN_PROGRESS、R8 NOT_RUN。 |
| W07 PARTIAL |2026-11-20 装备厂批量离线补验：合成 Service/Workflow 分别完成24厂制造及收取，并覆盖末厂无效果时 UNKNOWN、持久未决与父预算关闭；逐厂重新授权及派发前持久记录均核对。装备厂两个测试文件合计87/87通过。补真实本地HTTP准备接口两厂显式制造及未授权拒绝，准备阶段零派发，相关HTTP用例5/5通过；修复装备厂首次加载空视图导致批量控件报错：src/gameplay-page.mjs 对未调查视图保留阻塞提示。Edge真实页面经本地HTTP分别验证两厂制造、收取成功及首厂UNKNOWN停止后续派发，均逐厂确认授权；结合HTTP共8/8通过，页面与装备厂合同定向58/58通过。修改 src/gameplay-page.mjs、tests/gameplay-api.test.mjs 及本行。仅修改 tests/equipment-forge-service.test.mjs 和本行；不代表完整平台回归或真实游戏验收。 4be11d2装备/徽章库存验证复用及原Pet来源保留；本批原装备锻造MAKE/PICK及英雄专武LEVEL/STAR库存验证也复用stockMatchesDelta，移除重复净扣循环。原配方、随机输出约束、精确装备UID/队列/英雄、成本和目标/非目标状态、typed/独立复读、Service/预算/History保持 本批原成长投影接原生Workflow候选面板，UID原字符串、徽章空槽和Pet原idx含0保持；未新增成本、资格、请求或执行器。 本批成长原生Workflow选择直接复用专业页英雄/技能槽、装备UID、徽章UID/空槽、Pet建筑/UID/队列idx、Forge建筑/配方及普通模板的只读来源；只填原Schema字段，动作草稿变化须先应用重调查，不跨穿戴/成长来源。Pet idx含0、技能槽从1、UID文本、Forge expectedQueue/expectedEquipmentCounts及高级前置约束保持，未开放培育/成熟领取或替换。  本批C228/C229、BIZ-R09：明确1至24个已佩戴装备或徽章UID，同批一种原成长动作、每UID一次；原candidate/plan与共享Ledger累计核全部自有材料，原等级/首次升级/精炼/升星成本和完整归属/库存验证保持。原Service只读准备API、专业页与Workflow逐件ACTION→VERIFY同源，无新请求/资格算法；每件仍重新调查、单次授权，父资源/UID固定，拒绝或UNKNOWN停止。  本批英雄等级/技能及已激活专武多目标接原Service/API/共用成长表单/Workflow；合同和R7范围共用W06，原兑换升星入口保留。  本批BIZ-R08明确1至24个不同在岗UID/建筑各升一级，或不同明确队列各投喂一次，保留原jobIdx含0及同批原模式。复用原Pet私有来源、planPet和共享Ledger累计核初始材料，原pet/serving-building/job父UID保持；原Service只读准备API、共用成长控件及Workflow逐项ACTION→VERIFY同源，固定原actionId等级或队列开始/完成/海兽身份，逐项重新调查/单次授权/原完整海兽建筑队列与库存验证。无新请求或恢复体系，培育/成熟领取继续缺证。 本批P3-6/P3-7（C228/C229原空槽穿戴子项）：原装备/徽章组合prepare API扩展明确1至24个不同闲置自有UID逐空槽穿戴，复用原单项Function/Adapter/Contract/Registry、OperationService、父UID预算及完整池/英雄镜像/库存不变验证。装备拒同英雄同部位，徽章拒同英雄同位置，原模块等级/职业/槽位解锁资格保留；徽章仅所选英雄枚举已证空槽和合格闲置UID。专业页复用原共用组合表单，UID/槽位互斥，逐项ACTION→VERIFY，每项新调查及单次授权，拒绝/UNKNOWN停止。修改src/equipment-growth.mjs、src/badge-growth.mjs、src/gameplay-page.mjs；原Service/server路由不变，无新执行/恢复体系，原单项及成长组合兼容。  本批BIZ-R07/P3-6、P3-7：明确1至24个不同装备厂的同种原MAKE或PICK动作；MAKE须当前空闲且逐厂明确配方，PICK须当前可靠成熟且绑定原批次。原prepare端点增加action/targets有限组合，专业页逐厂选配方/收取与Workflow逐厂ACTION→VERIFY同源。复用原planEquipmentForge/verifyEquipmentForge、D6/universal=false、自有材料Ledger累计与父预算、可信成熟时钟、原队列/typed equipId/原星级/新唯一UID/完整库存及其他建筑英雄原装备保持；闲置背包＋在产数量：配置原catalog证明全部合法产物与配方同一部位，仅前项原MAKE已验证新增一队列后后项数量守卫加一，PICK只从在产转背包数量不变；不构造未来事实/随机产物/完成时间，变化/拒绝/UNKNOWN停止。原单厂及收取后制造兼容，无新执行/授权/恢复体系。实际修改src/equipment-forge.mjs、src/function-contracts.mjs、src/operation-service.mjs、src/server.mjs、src/gameplay-page.mjs和本行。 | 本批城防普通材料组合及FRM-005图纸逐模板解锁已接线，见顶部记录；继续原DAG其他有据业务，日界/周期、C144、W13待捕鱼等原缺证局部冻结，不推全范围完成。 | Pet培育/成熟领取、装备替换/成长转移、专武激活等原缺证保持；不推导随机结果或开放新写入口。W07 PARTIAL，R7/R8 NOT_RUN | 本批提交（父7867a03）；原成果保留 | 本批未编写或运行测试；源语法/整页脚本编译/diff仅静态检查。R7待覆盖所有共用来源等价、UID/槽位/0索引/技能索引、未知/重复、动作草稿失效、原高级约束及Service预算/History/UNKNOWN链。 本批未新增或执行测试；源语法、完整PAGE脚本编译及diff仅静态检查。R7待覆盖成长投影与专业页同源、未知来源、UID/空槽/队列隔离。 历史结果本轮未重跑、不累计，R7/R8 NOT_RUN。原证据：2026-11-16：Forge领域/Service、古董成长及高级领域/Service、英雄领域/Service/专武星/专武Service、Contract/Registry/公共Adapter集成13文件579/579 PASS（24.97秒），0 fail/cancel/skip/todo。新增10项覆盖对象/真实离线Codec的锻造最后材料与金币耗尽、四品质英雄/古董兑换来源耗尽零行省略及精确净入；原少多扣/无关库存/目标变化、父预算/持久意图、UNKNOWN/拒绝重启零重放及身份/迟到隔离通过。三源语法/diff及Baseline指纹通过；前批465与本批不累计，全部REAL_UNVERIFIED  本批未新增或运行测试；五源语法、浏览器函数仅编译及diff为静态检查，非测试PASS。R7补1/24UID、重复/坏参数、同类动作/已佩戴归属、累计材料不足、原徽章残余经验/上限/红星资格、逐件预算/授权/拒绝/UNKNOWN及编辑/迟到/scope隔离；R7/R8 NOT_RUN。  本批未新增或执行测试；四源语法、浏览器函数仅编译/diff仅静态检查。R7补1/24目标/混模式/稀疏坏字段/重复UID建筑与队列、idx0、原在岗等级属性/可信来源版本、投喂精确减时或成熟转移、共享材料不足/父UID、固定actionId的目标改变阻断、完整目标非目标及库存、旧单次与各成长表单兼容、逐步授权/拒绝/UNKNOWN/重启零重放和草稿/迟到/scope隔离；R7/R8 NOT_RUN。  本批穿戴组合未新增/运行功能测试；源语法、PAGE脚本编译及diff仅静态检查，非功能PASS。R7补1/24 UID、重复UID/同英雄同槽、跨英雄不同槽、同UID多槽互斥、徽章明确英雄全空槽/指定槽旧格式、模块等级/职业/锁槽/已占槽/归属及坏参数、完整池/镜像和非目标/库存不变、父UID/逐项授权/拒绝/UNKNOWN/取消、scope/配置/草稿/迟到隔离、旧单项与成长组合及完整离线模拟。R7/R8 NOT_RUN，REAL_UNVERIFIED。  本批未新增/执行功能测试；源语法/PAGE脚本编译、静态注册及diff仅静态检查。R7补MAKE/PICK各1/24厂、重复/坏参数/访问器/新旧格式混用、成熟时钟边界/未知队列、空闲及配方/赛季/D6/通用材料拒绝、累计初始同材料不足、精确队列/数量变化、MAKE逐项原部位计数递增/溢出及PICK转背包计数保持、typed产物/星级/唯一UID/精确材料净扣/完整库存/其他建筑英雄装备变化、原父预算/逐项授权/拒绝/UNKNOWN、API真实HTTP与草稿/编辑/迟到/五维Client隔离、旧单厂/收取后制造兼容及完整离线模拟；R7/R8 NOT_RUN，REAL_UNVERIFIED。  2026-11-17集中R7局部回归：tests/equipment-forge.test.mjs、equipment-forge-service.test.mjs新增多厂MAKE/PICK初始合计成本、顺序部位计数守卫、收取总计数保持、重复/陈旧/累计不足/未知时钟拒绝；实际准备结果经src/gameplay-page.mjs原图校验器一致，账号/预算/计数篡改拒绝；真实本地Codec/原Service/Workflow逐笔授权及首笔UNKNOWN零后续派发。与W11共用四文件124/124 PASS（7.04秒），不累计前轮重叠结果；未覆盖的24厂边界、完整HTTP/交互/隔离及模拟债务保留，R7 IN_PROGRESS、R8 NOT_RUN。  2026-11-18装备成长集中R7：tests/equipment-growth-service.test.mjs新增20项，原Service准备图经原Workflow逐UID执行LEVEL/INITIAL_LEVEL/REFINE/STAR各1及24件，覆盖精确初始材料耗尽、完整镜像/非目标不变、逐项许可/父UID/持久历史、第二项UNKNOWN或拒绝停止及零重放、累计不足和坏目标零派发。夹具Runner与Service统一原合成时钟，终止后resume按原合同拒绝。整文件131/131通过（81.60秒），不等同完整R7、HTTP/浏览器E2E或R8；徽章/Pet组合及完整离线模拟债务保留。  2026-11-18徽章/Pet集中R7：tests/badge-growth-service.test.mjs、tests/pet-operations.test.mjs新增27项，覆盖徽章LEVEL（零/残余经验）及STAR、Pet LEVEL/FEED各1/24目标经原Service/Workflow逐项授权执行、初始材料耗尽/累计不足、精确UID及jobIdx=0、完整镜像/非目标与库存、第二项UNKNOWN/拒绝停止及持久历史重启零重放、坏目标/访问器/重复身份/末项归属缺失零派发。两整文件188/188通过（59.04秒），0失败/取消/跳过；仅离线Codec与合成传输，HTTP/页面交互及完整离线模拟债务保留，R7 IN_PROGRESS、R8 NOT_RUN。  2026-11-18专武多英雄成长组合集中R7结果共用W06本批275/275（新增45项，75.50秒）：含已激活等级/升星各1/24、ORANGE/RED原材料及独立碎片、父专武UID、UNKNOWN/拒绝后项停止、原API逐项许可与专业页同源图；不重复累计。专武激活/替换等原缺证保持，完整离线模拟/浏览器E2E债务未消除，R7 IN_PROGRESS、R8 NOT_RUN。   2026-11-19 W07/BIZ-R08 Pet组合HTTP与页面R7：原多目标夹具接实际localhost HTTP，在feed/level两模式各验证双目标成功、首项目UNKNOWN或拒绝、原CSRF、模拟零派发、逐项单次授权、固定资源/UID父预算、历史与跨账号隔离（6项）；页面VM新增两模式12项，验证idx=0与精确长UID、默认不选、原图以及成本/UID篡改和选择/编辑器/A→B→A迟到响应拒绝，不自动授权或执行。pet-operations与farm-forge-full-page两整文件1367/1367通过（62.13秒，0失败/取消/跳过），含上述18项；本地HTTP夹具使用合成客户端/本地Codec及隔离用无操作writerOwnership，不据此证明真实进程写者锁。未执行真实浏览器E2E/真实游戏；24目标HTTP、身份配置变化、完整离线模拟和原缺证仍待覆盖，W07 PARTIAL、R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。   2026-11-20 W07/BIZ-R08续验：feed/level各24目标本地HTTP逐项授权覆盖成功、末项UNKNOWN与拒绝，连同原双目标12/12通过（145.41秒）；两模式准备/执行调查期间账号、角色、世界、代次、连接、Client、断连、取消与配置变化36/36零派发（5.66秒）。Pet及完整页面整文件1411/1411通过（208.01秒，未启用浏览器），含24目标页面VM。Edge单独验证两模式双目标成功与首项UNKNOWN 4/4（51.21秒）；共享浏览器辅助提取后城市及贸易原场景2/2（21.16秒）。Edge测试曾因错误Pet导航和Windows临时配置被进程占用失败，修正导航、按唯一测试配置清理进程后通过；一次并行启动Pet文件初始化退出、无具体断言，单独重跑未复现，原因未明。HTTP夹具使用合成客户端/本地Codec和无操作writerOwnership，不证明真实写者锁；Edge 24目标逐项执行、全平台模拟及其他原缺口仍待完成，R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。 |

| W08 PARTIAL |原确认战败、单模板与69bb0bd有限候选保留。新增明确OBSERVED_WIN_RATE/minSamples：复用原有界History，按同账号/角色/世界/关卡、相同已观察队伍资料与对手、精确候选站位的胜率排序，同率保留输入顺序，先排序全部明确候选再按总开战数截断。原Service/API/页面准备→原Formation保存/复读→单次Stage/有限DAG/父预算与历史；不新增调度器。来源统计摘要随原图落盘，重启只读；本批移除原ArenaChallengeRequest仅按请求名接受任意/缺失成本的支付白名单，保留旧低战力只读建议。 本批FRM-005普通自有图纸明确逐模板解锁已接原Service/API/共用专业表单和Workflow，原单次模板新增/净扣及阵容不变验证保持；细节及R7债务见顶部本批记录。 后续C151组合接线复核发现此前prepare处理函数遗漏server入口路由集合；本批已将堡垒、图纸和材料包准备端点补入原gameplayRoute集合（src/server.mjs），HTTP可达性须R7实际验证，原静态检查不证明此前API已可用。 | 本竞技场支付边界修复已交；继续§12.4原DAG有据能力，不把只读建议当受控挑战 |每候选匹配样本不足只阻塞本次统计图，不以未知补零、不自动开战采样；未观察属性、成长与随机未知，不能保证未来更优。其他模式SIDE/次数/归属及远征恢复原缺证保留；W08 PARTIAL，R7/R8未执行；竞技场客户端只检查竞技点>0，没有精确扣量；ArenaReport无对手ID，BattlePlayerData仅昵称/头像，缺独立同次结果身份。| 本行所在提交（父1119c41）；原成果保留 | 2026-11-16：actions-safety/business-transport-freshness/stages-mainline-release/dailies-safety/operation-adapters-integration五文件234/234 PASS（21.31秒），0 fail/cancel/skip/todo；两W行共用本次结果不累计。先复现守卫缺异常及原通用执行器对空成本/猜测1点均报告SUCCESS；修复后零资源查询/零父预算预留/零派发/无UNKNOWN，allowPaid不绕过；真实离线Codec保留精确int64目标，原日常建议及旧授权拒绝、主线及公共Service写链保持。新增旧入口断言起初误期望空数组，修正为原AUTHORIZATION_REQUIRED，旧断言不改；前批已交证据保留为历史，均离线REAL_UNVERIFIED  2026-11-18集中R7：FRM-005：tests/formation-unlock.test.mjs补1/23模板逐项新计划与原验证、精确扣料/新增、原阵容Pet不变及稀疏/访问器零读取/末项不可用拒绝。 三文件共94/94通过（4.89秒），跨行共享不累计；仅离线覆盖，完整HTTP/UI/模拟债务保留，R7 IN_PROGRESS、R8 NOT_RUN。  2026-11-18后续集中R7：FRM-005：tests/gameplay-api.test.mjs补原准备端点经本地HTTP/Registry/Service/Workflow的双模板成功及首/后项UNKNOWN、拒绝，另核1/23模板逐项单次许可、初始图纸父预算与精确耗尽、历史节点关联、跨账号及许可重放拒绝、零真实Client/完整采集；准备期间账号/角色/世界/连接/代次漂移拒绝。tests/gameplay-view.test.mjs使用VM运行真实专业页控件，原准备结果载入Workflow图；账号/时长/参数/编辑草稿变化丢弃迟到结果，成本/目标/父预算/VERIFY图篡改拒绝。 两工作包共享本次gameplay-api全文件399/399（374.00秒）、gameplay-view全文件95/95（7.85秒），0失败/取消/跳过；新增HTTP22项及UI12项已包含在全文件结果中，不另行累加。早期新增夹具缺Client事实上下文、用未注册联盟Adapter、额外player字段和写死材料顺序的失败均修正夹具，生产合同未放松。浏览器端到端、各读边界取消、堡垒三材料HTTP及完整离线模拟仍待补；R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。 |

R7集中离线回归进行中，尚未完成全范围验收；R8未执行，全部仍为REAL_UNVERIFIED，保持独立真实操作授权。

| 目标/阶段 | 当前状态 | 判定边界 |
|---|---|---|
| COMPLETE_CRAZYWATER_PLATFORM_R1_R8 | ACTIVE（完整交付未满足） | 2026-11-16本轮get_goal实际返回active；未重建Goal，范围不变，R7进行中、R8未执行 |
| M0–M15 | 16/16保留；全部PARTIAL | §6逐模块表；子能力可用不等于整个模块完成 |
| 原95C | 95/95保留；53 EXISTING_FUNCTION / 39 PARTIAL / 3 PROTOCOL_ONLY | §5及5.1；Function状态不等于API/UI/Workflow或真实通过 |
| 原42P | 42/42保留；10 EXISTING_UI / 31 PARTIAL / 1 EXCLUDE | §6.1；P5-3依D6硬拒钻石；已有界面不等于完整业务完成 |
| 原8S | 8/8保留；各自已有有限实现及剩余边界 | §6.2；本地日历/具名WAIT不证明游戏日界，重启不续权 |
| 原273 Inventory | 273/273保留；188 EXISTING_FUNCTION / 78 PARTIAL / 7 PROTOCOL_ONLY | 附录A；PLT43/DEX9/DAT48/BIZ116/ORD22/STG17/FRM8/PRO10，与95C不相加 |
| R1 | PARTIAL | 公共保护/合同子集已有；来源资产及完整原DoD未闭合 |
| R2 | PARTIAL | 核心业务和成长子集已有；剩余领域缺口按W/C冻结 |
| R3 | PARTIAL | 联盟/Museum/扫荡/日常子集已有；原完整范围未齐 |
| R4 | PARTIAL | 钓鱼/舰队/活动/贸易部分已有；复杂结算及完整业务缺 |
| R5 | PARTIAL | Workflow/记忆/有限调度已有；全入口与权威策略未齐 |
| R6 | PARTIAL | 专业API/UI持续集成；42P和全业务冻结条件未满足 |
| R7 | IN_PROGRESS | 当前集中结果（2026-11-18，effd9b5）：130个离线测试文件，9587/9587通过，0失败/取消/跳过，1749.14秒。沿用下述7项capture/MITM/proxy排除范围。W05的24格追加断言在3bb505e单独跑过2项，不叠加计数。selftest通过29组，素材检查跳过，归档仍缺世界地图。四步跨领域模拟包含在以上结果。真实Edge本地E2E发现主线节点缺少默认和来源控件导致专业页初始化中断，已修复。城市页实测从默认未选、勾选加速目标、准备原Workflow到模拟零派发；启动仍零派发，经明确确认才派发一次合成请求，验证计时减少60秒、持久结算成功和父预算关闭。另跑主线账号设置专项，共2项通过。新增Edge本地罗盘Tasks闭环2项：精确活动/次数/券预算/配额/UID进入统一Workflow，模拟零写入；授权后成功结算和UNKNOWN停止均验证，合计2/2通过。W11 / PRO-006 / P2-7补Edge展柜加速2项。专业页默认未选，明确两柜后载入原Workflow，模拟零派发。成功分支逐柜独立确认并分别缩短60秒。首柜只缩短59秒时进入UNKNOWN，第二柜零派发。核对自有加速器净扣、持久历史和父预算关闭。连同原HTTP、城市和罗盘浏览器及Tasks跨模块场景联合11/11通过。仅修改tests/gameplay-api.test.mjs及本行。W19日常任务奖励与活跃宝箱入口修复，改为打开现有「任务与海面」内的任务奖励区。定向页面回归3/3通过，覆盖两个入口跳转、账号切换后的旧入口失效及零派发。两个整文件页面脚本回归1379/1379通过。Edge使用本地HTTP的日常缓存验证任务奖励入口打开可见面板，1/1通过。活跃宝箱入口通过页面脚本验证。改动src/page.mjs、tests/farm-forge-full-page.test.mjs、tests/gameplay-api.test.mjs及本行。其余浏览器路径、完整平台离线模拟及R8仍待验证。130文件复跑于dbef512启动并启用本地Edge，沿用7个捕获与代理文件排除范围，9597/9597通过，0失败/取消/跳过，1437.48秒。日志位于运行主机TEMP/cw-r7-dbef512-54603b1900a1464da69571a5161607e3/tests.log。运行期间修复日常导航，后续提交另有页面整文件和Edge定向结果。W22原四步跨领域流程新增Edge 1/1：加载原准备API生成的组合图，模拟零读取和派发。逐步显示待授权计划，第二步关闭确认框维持原历史和零新增派发，重新确认后完成原四笔合成请求。核对库存净变化、逐节点历史和父预算关闭。浏览器和跨领域场景联合20/20通过。另测父预算仅19加速器时，前三步仍正常结算，第四步留下NOT_EXECUTED且零派发，库存仍有10件也不扩张预算。该用例1/1通过。改动tests/gameplay-api.test.mjs及本行。7d03183自检29组通过，素材检查跳过。归档verify仍为complete:false，缺地图及其可信来源。历史轮次：2026-11-18集中离线129文件8972项：8934通过、38失败（1394.33秒）；排除capture-cli/capture-recovery-process/capture-system/capture-transaction/mitm-ca-query/mitm-proxy/proxy-backup七文件。38项已按来源修复并由相关文件/定向回归确认；修复后未重复129文件，不宣称全套通过。新增边界三文件94/94、合同九文件688/688、缓存三文件60/60及战令25/25、古董1/1分别计，不累计重叠轮次。selftest29组通过但素材检查跳过；完整离线模拟、剩余HTTP/UI边界及全范围验收仍未完成。  后续W08/W09集中API399/399及页面脚本VM95/95已通过，包含新增22HTTP/12UI项；不是129文件全量重跑或浏览器真实E2E。  装备成长Service/Workflow整文件131/131通过（81.60秒，新增20项），剩余组合与完整模拟未完成。  徽章/Pet Service与Workflow两整文件188/188通过（59.04秒，新增27项），不累计重叠轮次；完整R7及离线模拟仍未完成。  本批W19/BIZ-D02及W09/PRO-002原取消接线新增65项离线回归：招募/Workflow两整文件685/685（259.07秒），完整PAGE1104/1104（10.37秒），页面VM103/103（7.68秒），本批HTTP定向6/6（5.27秒）；联盟整文件201项在联合轮通过，重建阻断追加断言2/2（4.57秒）。保留首轮失败：旧Tasks招募不支持及按钮数量断言更新、测试夹具原古董请求/完整Registry/单候选/合成重连状态修正；生产合同未放宽。以上非129文件全量重跑、浏览器真实E2E或完整离线模拟，R7仍未完成。  W06/W07英雄等级/技能/已激活专武等级升星组合新增45项Service/HTTP/页面VM回归，三个整文件275/275通过（75.50秒，0失败/取消/跳过）；失败夹具修正与覆盖见W06，不累计重叠轮次。未执行129文件全量重跑、浏览器E2E或完整离线模拟，R7仍未完成，R8 NOT_RUN。   2026-11-18本批结果共用W14：舰队120/120（144.31秒）、页面/货船三文件211/211（8.41秒）、舰队HTTP定向12/12（6.36秒）；最终空目标边界修正后维护/Schema4/4（1.71秒，重叠不累计）。新增87项覆盖原Service/Workflow/API/专业页，修复维护目标getter读取及迟到准备覆盖Workflow JSON两处实际问题。完整跨文件全量重跑、其他组合和完整离线模拟仍待完成；R7 IN_PROGRESS、R8 NOT_RUN。  2026-11-18集中R7补W14/BIZ-R11/PRO-009世界宝藏组合派遣：tests/treasure.test.mjs新增34项原Service/Workflow，tests/gameplay-view.test.mjs新增19项页面VM，tests/gameplay-api.test.mjs新增5项真实本地HTTP。覆盖1/10目标与每组1/2/10舰、显式零汽油和累计不足/保留线、原Rank/Defence资格、目标及本组舰队/配置变化、逐项许可及派发前持久意图、精确完整库存与舰队关联、拒绝/UNKNOWN停止及重启零重放、父汽油/UID预算、页面编辑/迟到/篡改和HTTP身份/CSRF/互斥。前两整文件255/255（25.23秒），API整文件422/422（390.90秒），均0失败/取消/跳过；HTTP定向5项已包含，不累计。此批无生产缺陷修正；夹具补原协议必填reward及DefenceFleetInfo，变化后断言按原Runner FAILED/关闭父预算合同核对，未放宽守卫。非浏览器E2E、全范围R7或完整离线模拟，其他原债务保留，R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。  2026-11-18集中R7补W19/BIZ-D06/D09/D08/D10/D12/D15：tests/workflow、farm-forge-full-page、cargo-service、free-gold、trial-challenge、pirate-operations六整文件1653/1653通过（36.11秒）；gameplay-api本地HTTP定向18/18通过（11.23秒），0失败/取消/跳过，重叠轮次不累计。覆盖Tasks/Loop六类原Function编译、原生及专业页草稿、固定父预算、逐项许可、原Service结算、拒绝/UNKNOWN和重启零重放，保留旧Dailies。修复src/trial-challenge.mjs同一raid/stage在省略及明确参数间切换可绕过拒绝记忆的问题，沿原Service同时重算新动作与旧History领域身份；三种历史参数别名互查且原History/补充记忆字节不变。测试修正原Dailies默认步骤、点金规划守卫与实际空参数动作的既有合同，未放宽生产守卫。其余两副本Service集成、浏览器E2E、剩余HTTP边界、全范围R7及完整离线模拟仍待完成；R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。 2026-11-18本批W19/BIZ-D03/C202及W04/C116集中离线结果：核心Adapter整文件69/69（5.96秒）、主线专业页整文件81/81（2.37秒）、完整PAGE整文件1129/1129（10.41秒）、本地HTTP定向15/15（11.95秒），均0失败/取消/跳过；新增HTTP9项、主线专业页10项、工厂领取页面9项。修复已有生产准备路由未进入前端白名单的实际接线缺陷；旧PAGE测试导出锚点更新后原断言保留。保留初轮失败：页面9项被原白名单拒绝；完整页旧测试helper因公开导出前缀变化出现ReferenceError，修正后整文件通过。未重跑129文件，不累计重叠结果；各包剩余边界、浏览器E2E、完整离线模拟及全范围R7仍未完成，R8 NOT_RUN、REAL_UNVERIFIED。 2026-11-18城市组合W04/C101–C104/C116：核心Adapter/完整PAGE/合同三整文件1237/1237通过（10.90秒），HTTP及页面定向7/7（7.34秒，页面4项与整文件重叠不累计）；新增领域4、页面4、HTTP3项。真实本地Codec、合成账号/状态及原Service/Workflow/History路径验证，原字段清单和新夹具协议字段修正见W04。全范围R7及完整模拟仍未完成，R8 NOT_RUN、REAL_UNVERIFIED。 2026-11-18 W04/C103/C115原城市/生产道具加速组合：核心Adapter、city-operations、完整PAGE及Function合同四整文件1402/1402通过（10.84秒）；HTTP及页面定向12/12（6.03秒，页面6项已含整文件，不累计）。新增领域/页面/HTTP各6项，覆盖原精确道具成本、累计预算、逐项授权、拒绝/UNKNOWN及迟到/篡改。各包剩余边界、全范围R7/浏览器E2E和完整离线模拟仍未完成，R8 NOT_RUN、REAL_UNVERIFIED。  2026-11-18基于b710dd2集中重跑当前130文件：node --test --test-concurrency=4 --test-reporter=tap，仍明确排除capture-cli/capture-recovery-process/capture-system/capture-transaction/mitm-ca-query/mitm-proxy/proxy-backup七文件；9448/9448通过，0失败/取消/跳过/todo，1421.45秒。此前38项修复已由本轮相关用例重跑覆盖，不等于含被排除七文件的全套通过。selftest29组通过但素材检查仍跳过。耗时日常奖励取消用例另定向1/1通过（15.67秒总耗时），不重复累计。随后仅新增W04加速边界15项，Adapter整文件94/94（9.11秒），无生产源码修改；该新增测试后的130文件未重复整跑。两份原TAP日志位于运行主机TEMP/crazywater-r7-b710dd2.tap及crazywater-r7-acceleration-boundaries.tap，未包含真实凭证。真实浏览器E2E、剩余HTTP/UI边界、被排除文件覆盖与完整离线模拟仍未完成；R7 IN_PROGRESS，R8 NOT_RUN，REAL_UNVERIFIED。  2026-11-18基于7ad5113补W22跨领域离线HTTP模拟9项及W04加速1/24目标HTTP8项，gameplay-api整文件467/467通过（415.17秒，0失败/取消/跳过/todo）；定向17/17（67.06秒）与整文件重叠不累计。仅新增测试，原生产链未改。原关闭父预算字段测试错误已按state=CLOSED修正并核初始limits/实际reserved。日志TEMP/crazywater-r7-api-simulation.tap；本轮未重复130文件、未执行被排除七文件或真实浏览器E2E，全平台完整离线模拟仍未完成，R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。  2026-11-18本批补W04/C103/C115加速页面50项及HTTP40项：页面涵盖1/24目标、明确选择和期限、原图/固定预算、迟到身份/配置/编辑变化及篡改拒绝；HTTP涵盖城市5和工厂7读取边界在准备/执行阶段取消零派发，以及账号/角色/世界/连接/代次/Client/配置/断线变化拒绝和后继锁保留。完整PAGE与Adapter两文件1283/1283通过（11.70秒）；最终含旧城市准备/领取和跨领域场景联合166/166通过（76.21秒），轮次重叠不累计。首轮执行取消12项因新夹具遗漏Manual selections失败，补齐原actionId后40/40通过，生产合同未改。PAGE为脚本VM，非浏览器E2E；本批未重跑130文件，全平台完整模拟和其他原债务仍待完成，R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。   2026-11-19 W22跨模块累计预算浏览器边界：复用四模块合成夹具，模拟零派发、四次明确确认；加速器父预算19，城市加速占用10后，工厂加速记录NOT_EXECUTED且无第四笔派发，核对库存10、持久历史与父预算CLOSED。原成功浏览器场景改为读取页面显示状态，避免测试并发查询工作流；新旧浏览器及原HTTP预算场景联合3/3通过（38.54秒）。此前浏览器用例曾超时并使后续两项因测试写入所有权未释放而失败；此次通过不证明超时根因已消除，仍需后续稳定性验证。仅修改tests/gameplay-api.test.mjs及本行。R7 IN_PROGRESS，完整离线模拟未完成，R8 NOT_RUN、REAL_UNVERIFIED。   2026-11-19浏览器夹具清理：重跑复现原55秒超时，临时诊断显示四动作结算并到达测试服务器close后未返回；浏览器结束后关闭该本地测试服务器的连接，并为CDP命令加10秒超时以避免无界等待。全体原Edge离线场景及HTTP预算用例联合9/9通过（66.13秒），其中跨模块3项再次3/3通过（39.17秒，重叠不累计）。证据支持本地连接延迟关闭是此次挂起因素，但不证明所有潜在超时已消除；未修改生产执行链。仅修改tests/gameplay-api.test.mjs及本行；R7仍IN_PROGRESS、R8 NOT_RUN。   2026-11-19 W22跨模块中断与重启：原自有包→生产→城市加速→工厂加速夹具增加前三个节点结算后、下个节点授权前停止；验证CANCELLED、已结算历史及父预算CLOSED、后续零派发、旧许可不可重用。另以原Workflow及ExecutionHistory磁盘文件关闭并重启本地HTTP服务器，分别核对停止与UNKNOWN历史只读、账号隔离、旧授权拒绝、未自动重放。UNKNOWN重启后重新提供有效CSRF及合成就绪会话，启动HTTP返回200但状态立即FAILED、steps=0，原因明确为UNKNOWN/未决；新失败尝试会写入Workflow审计，原ExecutionHistory保持不变。与原成功、各位置拒绝/UNKNOWN及预算不足联合15/15通过（20.37秒，0失败/取消/跳过）；测试使用合成传输并确认真实clientFactory/全量collector均零调用。修改tests/gameplay-api.test.mjs及本行。此为四模块覆盖，不代表全平台完整模拟或R7完成；R8 NOT_RUN、REAL_UNVERIFIED。   2026-11-19 W13/C152只读R7：tests/explorer-api.test.mjs新增9项账号/角色/世界/代次/连接/Client/断连/非READY/快照替换失效；Overview和Explorer均不再给资格，恢复旧身份不复活，显式合成重采才重新观察。另覆盖未绑定恢复缓存未知、失败覆盖旧SUCCESS且独立库存保留。fishing-view、explorer-api、explorer-view、data-catalog四文件联合94/94通过（5.20秒，0失败/取消/跳过），含原真实本地Codec/配置、CLI、页面VM和48查询合同；仅离线合成，无Client创建或隐式采集。未执行真实浏览器E2E/真实游戏，领奖和收线仍缺目标身份证据冻结，W13 PARTIAL、R7 IN_PROGRESS、R8 NOT_RUN。   2026-11-19基于7bbac74重跑当前130文件安全离线集合：node --test --test-concurrency=4 --test-reporter=tap，9617项中9609通过、0失败/取消/todo、8跳过（1705.80秒）。8项均为未设置CW_TEST_BROWSER的本地Edge场景；随后明确设置本机Edge单独补跑8/8通过（64.91秒，0失败/跳过），两次合计覆盖该集合全部9617项，但不是单次全绿运行。显式排除capture-cli、capture-recovery-process、capture-system、capture-transaction、mitm-ca-query、mitm-proxy、proxy-backup七文件，未运行真实凭证/抓包/MITM/CA/代理测试。node src/selftest.mjs 29组通过，素材未同步检查按既有条件跳过。原TAP与文件清单在本机TEMP/crazywater-r7-7bbac74.tap及crazywater-r7-7bbac74-files.txt；真实浏览器仅覆盖上述8项，不代表完整UI E2E。全平台完整离线模拟、被排除范围及原工作包缺口仍未完成，R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。   2026-11-19 W05多船到港领取R7：新增原Fleet/Service/Workflow单船、双船、24船成功及首/次/末船UNKNOWN，验证逐船单次授权、合成响应结构与完整库存净入、派发前持久意图、零成本父预算及UNKNOWN不重放；准备阶段拒绝重复/稀疏/超24/恶意访问器/时长越界以及航次、奖励或状态变化，零派发。原本地HTTP新增双船成功/首船拒绝/UNKNOWN及单次许可重放拒绝；完整页面VM新增默认未选、同源图和奖励/预算篡改、选择变化迟到拒绝。cargo-operations、cargo-service、fleet、farm-forge-full-page四文件1381/1381通过（141.98秒，0失败/取消/跳过）；HTTP定向3/3通过（6.68秒），与四文件不重叠。未运行真实浏览器E2E或真实游戏；原24船HTTP/页面、身份变化、末船拒绝及其他原R7边界仍待覆盖，W05 PARTIAL、R7 IN_PROGRESS、R8 NOT_RUN。   2026-11-19 W05到港组合Edge及本地Codec：复用原HTTP合成货船夹具并改用仓库实际协议encode/decode；Edge专业页默认未选，明确两船后载入原Workflow，模拟零派发、零运行时；成功路径逐船确认及完整库存净入，首船UNKNOWN路径不派发第二船。核对各节点历史、父预算CLOSED、跨账号空历史及无真实Client/全量采集。HTTP成功/拒绝/UNKNOWN三项与Edge成功/UNKNOWN两项联合5/5通过（21.67秒，0失败/取消/跳过）；真实Codec仅本地合成响应，非真实游戏验收。仍欠24船HTTP/浏览器及其他原身份/拒绝边界、全平台完整离线模拟；W05 PARTIAL、R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。   2026-11-19 W05到港组合边界续验：本地真实Codec/合成传输的24船HTTP依次单次授权，成功、末船UNKNOWN和末船拒绝均核对24笔节点历史、结果、库存及关闭父预算；准备和执行调查期间分别注入账号、角色、世界、代次、连接、Client、断连和取消，16项均零派发且无未决历史。连同原双船HTTP和Edge成功/UNKNOWN共24/24通过（94.17秒）。完整页面VM最大24船及原篡改/迟到共5/5（2.42秒）；Edge另完成24船默认未选、明确选择、原图载入和模拟零派发1/1（6.28秒），未在Edge逐船执行24次。均无失败/取消/跳过，未连接真实游戏；仍有其他W05边界、全平台完整离线模拟和R7未完成，R8 NOT_RUN、REAL_UNVERIFIED。   2026-11-19 W10/C306/C307联盟科技组合R7：原准备器新增1/24目标、两类科技点累计预算、重复/稀疏/超限/访问器/时间边界、下一等级、不可借未来升级满足前置及单项足额但累计不足。原Registry/Service/Workflow经真实本地Codec与合成传输，双目标覆盖成功/首项拒绝/UNKNOWN，24目标覆盖成功/末项拒绝/UNKNOWN，逐项单次授权、两个固定点数预算、历史及重放拒绝；Edge验证两目标默认未选、同源图、模拟零派发、逐项授权及UNKNOWN停止。alliance-tech整文件51/51通过（3.02秒）；HTTP/Edge定向8/8通过（72.51秒），0失败/取消/跳过，两个集合不重叠。首轮HTTP测试因测试夹具使用裸模块缺dependencyVersions而失败，改为实际注册Function后通过，不涉及生产代码修改。仍欠24目标页面/Edge、账号角色世界连接Client代次及配置变化等原边界、全平台完整模拟；W10 PARTIAL、R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。   2026-11-19 W10/C306/C307续验：原本地Codec/合成传输下，在科技组合准备及执行调查时分别注入账号、角色、世界、代次、连接、Client、断连、取消、配置成本变化，18项均零派发、无未决历史；Edge另核24项默认未选、明确选择、双点数固定预算、原Workflow加载和模拟零派发。与原双目标HTTP/Edge、24目标HTTP成功/末项拒绝/UNKNOWN联合27/27通过（78.12秒，0失败/取消/跳过）。Edge 24项仅准备和模拟，未逐项执行；未测试真实游戏。页面草稿/迟到/篡改及其他原范围、全平台完整模拟仍待验证；W10 PARTIAL、R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。   2026-11-19 W10/C306/C307页面草稿续验：完整页面VM新增11项，核对默认未选、成功同源图，以及账号/联盟/阶段/成本/预算/图篡改、选择/时长/编辑器和A→B→A切换后的迟到响应；不自动授权或执行。Edge以本地HTTP实际准备结果测试预算篡改错误及用户编辑后迟到结果不覆盖草稿，2/2通过（7.84秒）。alliance-tech与farm-forge-full-page两整文件1262/1262通过（15.65秒），0失败/取消/跳过；Edge两项不在前述文件集合。仅测试修改、合成传输与本地Codec；其他原W10及全平台完整模拟未完成，R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。   2026-11-19 W18/C523多货物买入R7：复用原活体调查及本地Codec，1/24合成市场目标验证固定初始贸易币/市场quota/UID、累计仓位，拒绝重复/稀疏/超限/访问器/无效时间及累计币或仓位不足；双货物原Service/Workflow覆盖成功、首项/次项UNKNOWN与次项拒绝，逐项授权、独立完整状态和重放拒绝。现有测试夹具为多次合成新持货分配唯一PID，原单次仍为99。HTTP成功/首项拒绝/UNKNOWN及Edge成功/首项UNKNOWN共5/5通过（31.18秒），Edge确认默认未选、数量留空、明确数量后原图与模拟零派发；trade整文件259/259通过（174.06秒），0失败/取消/跳过，两个集合不重叠。初次领域测试误传调查用多余字段被原严格合同拒绝，修正测试调用后通过；未修改生产代码。24目标Service/HTTP/Edge逐项执行、报价/身份变化和页面篡改迟到等原边界、全平台完整模拟仍未完成；W18 PARTIAL、R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。   2026-11-19 W18/C523多货物最大规模与性能：原Service/Workflow 24目标逐项执行成功/末项UNKNOWN/末项拒绝三条均通过，核对原Codec、单次授权、持久意图、精确TRADE_COINS/市场quota/UID及不可重放；准备和执行调查期间13类账号角色世界代次连接Client断连取消配置价格市场存量周期港口变化共26项零派发。Edge核24项默认不选/数量为空、明确选择、固定预算及模拟零派发，未在浏览器逐项执行。初次Edge 24项准备超过夹具10秒CDP命令上限，改为分段轮询并仅对该场景设置45秒有界命令超时。定位planTrade为每个选中目标重复计算整份买卖准备投影；src/trade.mjs复用相同observation和买卖/移动/加速候选生成，只省略计划不需要的准备列表，身份/行情/成本/原权限校验保留。四类原候选等价与原单项回归通过；完整trade文件266/266通过（390.27秒），HTTP/Edge/原Loop联合44/44通过（73.85秒），0失败/取消/跳过。优化前24目标三条分别172.70/174.12/169.66秒，优化后同机整文件内80.45/77.35/76.96秒，测试条件有差异，仅为离线观察；非性能保证。未重新运行全平台130文件，其他W18边界/完整模拟及R7未完成，R8 NOT_RUN、REAL_UNVERIFIED。   2026-11-19 W18/C522多批出售R7：原活体调查/本地Codec使用合成市场，1/24持货准备核对全批非亏损报价、固定持货quota/UID和不将收入加入预算；拒绝重复/稀疏/超限/访问器/部分数量、价格变化及累计余额溢出。双批原Service/Workflow覆盖成功、首项/次项UNKNOWN和次项拒绝、逐项授权及持久历史；HTTP成功/首项拒绝/UNKNOWN与Edge成功/首项UNKNOWN验证原图、模拟零派发和逐批确认。原单批与新增组合领域定向41/41（28.68秒）、HTTP/Edge定向5/5（28.80秒），0失败/取消/跳过，集合不重叠。只修改测试，未连接真实游戏；24批逐项执行、身份/报价变化和页面草稿迟到等原边界、全平台完整模拟仍待覆盖，W18 PARTIAL、R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。   2026-11-19 W18/C522多批出售续验：原Service/Workflow 24批逐项授权与原Codec合成传输覆盖成功、末批UNKNOWN及拒绝，核对准确收入/持货、派发前历史、固定quota/UID与不可重放，3/3通过（167.51秒）。准备及执行调查期间13类账号角色世界代次连接Client断连取消配置价格持货周期港口变化共26项零派发；与原双批HTTP/Edge及Edge 24批默认不选、原图加载和模拟零派发联合32/32通过（47.46秒）。Edge另核买卖两模式预算篡改与迟到编辑器各两项，4/4通过（13.26秒）；初次测试脚本未跨浏览器上下文传递kind导致4项失败，修正后通过，无生产代码改动。三组均0失败/取消/跳过；Edge 24批仅准备模拟，未逐批执行。未连接真实游戏，其他W18及全平台完整离线模拟未完成，R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。   2026-11-19 W07/BIZ-R08 Pet组合HTTP与页面R7：原多目标夹具接实际localhost HTTP，在feed/level两模式各验证双目标成功、首项目UNKNOWN或拒绝、原CSRF、模拟零派发、逐项单次授权、固定资源/UID父预算、历史与跨账号隔离（6项）；页面VM新增两模式12项，验证idx=0与精确长UID、默认不选、原图以及成本/UID篡改和选择/编辑器/A→B→A迟到响应拒绝，不自动授权或执行。pet-operations与farm-forge-full-page两整文件1367/1367通过（62.13秒，0失败/取消/跳过），含上述18项；本地HTTP夹具使用合成客户端/本地Codec及隔离用无操作writerOwnership，不据此证明真实进程写者锁。未执行真实浏览器E2E/真实游戏；24目标HTTP、身份配置变化、完整离线模拟和原缺证仍待覆盖，W07 PARTIAL、R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。   2026-11-20 W07/BIZ-R08续验：feed/level各24目标本地HTTP逐项授权覆盖成功、末项UNKNOWN与拒绝，连同原双目标12/12通过（145.41秒）；两模式准备/执行调查期间账号、角色、世界、代次、连接、Client、断连、取消与配置变化36/36零派发（5.66秒）。Pet及完整页面整文件1411/1411通过（208.01秒，未启用浏览器），含24目标页面VM。Edge单独验证两模式双目标成功与首项UNKNOWN 4/4（51.21秒）；共享浏览器辅助提取后城市及贸易原场景2/2（21.16秒）。Edge测试曾因错误Pet导航和Windows临时配置被进程占用失败，修正导航、按唯一测试配置清理进程后通过；一次并行启动Pet文件初始化退出、无具体断言，单独重跑未复现，原因未明。HTTP夹具使用合成客户端/本地Codec和无操作writerOwnership，不证明真实写者锁；Edge 24目标逐项执行、全平台模拟及其他原缺口仍待完成，R7 IN_PROGRESS、R8 NOT_RUN、REAL_UNVERIFIED。 |
| R8 | NOT_RUN / 待单独授权 | R7后E01–E24具体账号/请求/次数/预算/风险/清理清单 |

## 1. 结论、计数与范围

保留原Master的M0–M15，共 **16个工程产品模块（12个直接玩法模块+4个平台/整合模块）**；同时保留Inventory的18个业务域视图，二者是归并关系。原始表有 **95项Cxxx、42项Pxxx、8类Sx**；baseline补齐D1–D9。Inventory有 **273个唯一条目**：PLT43、DEX9、DAT48、BIZ116、ORD22、STG17、FRM8、PRO10。273含细粒度子能力、别名、参考实现和非C扩展，不与95相加。

95项Function按当前源码分类：**EXISTING_FUNCTION 53，PARTIAL 39，PROTOCOL_ONLY 3**，清单见5.1。EXISTING_FUNCTION仅指行内范围的函数存在，不表示API/UI/Workflow/真实验收全完成；C409以D6硬拒绝实现需求。附录A保留全部273项ID及交付边界。

1536835文档对齐使用源码fc68c50；其前批fetch的fd7e0b4为当时本地祖先。当前工作基线见§2及顶部W行。原目标范围未完成，按原依赖DAG继续。PHASE1–4及附录B/C/D均为各自标注版本的历史证据，不覆盖本文件当前表。

后续拆成 **6个开发阶段R1–R6、统一离线回归R7、统一真实E2E R8，共8阶段**；工程工作包共22个；最终真实验收为24组E01–E24。模块、工作包、阶段、场景组不混算。开发期间连续推进依赖已满足的工作，仅证据确实缺失或最终真实操作授权时停相关分支，不按页面逐项等真实验收。

## 2. 实际Git基线与保护

| 核对项 | 本轮实际结果 |
|---|---|
| 开发根目录 | //zhangnas/app/crazywaterword；初始aibot-crazywaterword为另一仓库，不在其中施工 |
| 分支/HEAD | codex/phase-4-alliance-integration；本批父fcc2aeb，已交Museum/生产/任务/活动目标及Workflow参数同源；本批继续多领域Workflow只读交互及专业候选目标失效，不修改main |
| 远端关系 | 2026-11-16安全fetch指定开发分支后，origin/codex/phase-4-alliance-integration=e1012c0，与本批父HEAD一致（领先0/落后0）；以下本地提交不冒称远端已更新。无push/merge/reset/rebase |
| 工作区 | fcc2aeb已提交四份源码及账本，本批仅原gameplay-page与本唯一账本；五份原未跟踪输入保留且不暂存。Baseline SHA256仍74b243da49562f02907e941037736e6c168ba01770e3cb7e06852233be0452a6；未读真实Token或连接游戏 |
| 历史/权限 | PHASE1–4原提交和证据保留；允许离线施工与本地提交；push/merge/reset/rebase/clean及真实游戏操作仍未授权 |
| 目录约束 | 沿用既有src/tests/tools/docs/data/work；不新建仓库、worktree、目录或报告 |

## 3. 原Master阶段对账

原Master PHASE0–9与M0–M15、R1–R8是不同索引，均保留。历史报告的局部DONE不代表本版本最终验收。当前模块逐项见§6；原始输入与历史验收保持原文。

| 原阶段 | 当前源码核对结果 | 原路线图处理 |
|---|---|---|
| 0 Baseline/Mapping | 原编号完整，当前表重核95C/42P/8S/273Inventory | 保留原文与唯一进度基线 |
| 1 Shared Safety | Writer所有权、父预算、持久拒绝/UNKNOWN及有限恢复已接；通用冷却/日界来源未闭合 | R1已交付子集保留，具体缺证局部冻结 |
| 2 City/Production/Orders | 受控写、基础金币预览、单田收种及生产投影已有；全天量/最终金币/免费刷新缺 | R2继续补缺，R8真实验收 |
| 3 Formation/Battle | 极限来源复制、具名整队、图纸解锁、Stage逐场持久历史已有；全模式与自动换阵未全 | R2继续原剩余项 |
| 4 Alliance | 成员/订单/福利/科技单升/Fort/商船补货和船长已有；帮助求助及科技重置缺 | R3具体缺证操作冻结 |
| 5 Fleet/CityWar | 编队/维修/移动/港口/有界观察已有；攻击/加速/跨视野跟随未全 | R4继续 |
| 6 Museum/Secondary | Museum出发/缺料、古董成长、精确扫荡、钓鱼只读已有；结算身份/奖励/捕鱼缺 | R3/R4继续 |
| 7 Activities/Trade | 任务/邮件/免费招募点金/试炼/部分周活动及贸易单步写已有；完整周期/活动/贸易策略缺 | R3/R4继续 |
| 8 Workflow | 27静态模块+Stage、父预算、持久记忆、有限日周与可信事件、原生拖拽已有；全目录/全策略来源未闭合 | W19提前推进，R5继续 |
| 9 Integration/Release | 专业API/UI与定向测试持续集成；全范围未冻结，R7/R8 NOT_RUN | R6→R7→R8；不反复执行最终验收 |

离线连续开发已有Owner授权；不再按每功能人工审批。真实操作仍须在R7后提交E01–E24具体账号/请求/次数/预算/风险/清理范围，单独授权。

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
### 4.5 PHASE3七域的当前复用边界

| 域 | 当前已实现子集 | 剩余边界 |
|---|---|---|
| Formation | 完整SAVE/复读、具名整队、普通图纸解锁、极限来源复制、有限确认战败候选及主线/远征阵容子集 | 统计/规则优化与其他模式未全；W08 |
| Alliance | 精确成员/请求、订单福利、科技单升、Fort普通捐赠、商船补货和应聘船长 | 帮助/求助权威额度冷却、科技重置、收益/隐藏跨玩法占用缺；W09/W10 |
| Museum | 展陈/收益/成就/出发/道具加速/逐物品缺料，独立古董成长子集 | Complete/Reward可恢复身份与结算缺；W11 |
| Treasure | 既有Stats/List/Rank/Defence及无人防守目标派舰、精确MyFleets关联 | 派遣不证明争夺/占有/战果/领奖；W14，不并入Museum |
| Fleet | 编队/维修模式阈值预算优先序/停止维修/移动/港口及专业缺货；明确自有资源田放弃 | 非零pet绑定、攻击宣战/结果、非premium加速、资源田占领及在线奖未全；W05/W14 |
| Naval Rules | 有界WorldInfo精确筛选、三值规则、同查询规则响应哈希比较 | CURRENT_RESPONSE_ONLY非全图持续身份；跟随/动态攻击缺；W15 |
| Workflow | 原生拖拽/有限DAG/父预算/run授权、持久图/历史/记忆、有限日周/可信事件和三类具名WAIT | 全业务目录/入口及权威cooldown/gameDay来源未闭合；W19/W20/W21 |

当前证据以§5/6及附录A的源码和测试索引为准；附录B和PHASE3报告保留a505019历史快照，不把旧缺口重新当待建架构，也不将新增离线能力标为真实验收。

## 5. 原始95项需求账本（独立维度）

以下每行保留原C编号和原能力名。Function四类互斥；Protocol为已确认编码类型/调用语义证据，BLOCKED_EVIDENCE另列。profile不是总体评级：它仅把重复的12维检查值展开到每行，局部覆盖以备注为准。EXISTING_UI只表示声明范围已有界面；通用JSON页不算专业业务页全部完成。N/A是该只读能力不需要消费/授权执行基础，不等于缺失。

| Profile | 调用者 / GameClient / API / UI（2–5） | 权限（6） | Ledger / Service / History（7–9） | 生命周期（10） | 离线 / 真实（11–12） |
|---|---|---|---|---|---|
| T 平台/底座 | 原server/app/Client及本地账号与工具，精确API；行内范围 | 账号校验/脱敏/原安全合同，非任意请求授权 | 本地工具N/A；所有者和持久存储按实际模块；非独立业务账本 | 连接/代次/迟到/所有者fence；传输不证明业务成功 | 行内tests；本批仅文档校验；当前REAL_UNVERIFIED |
| R 只读/纯计算 | 原Collector/survey/缓存及专业只读区；浏览缓存零请求 | 账号scope/来源/可靠性/时效，无写许可 | 只读N/A；Service可管理survey，不是写历史 | 失败/缺失保持UNKNOWN，不伪装零或成功 | 行内读tests；历史真实仅§4.4，当前REAL_UNVERIFIED |
| G 注册/共享业务 | 原Registry→Adapter→Service/Executor→GameClient；原API/专业页 | 精确参数/身份/Origin/CSRF/计划哈希/单次或有限run授权/D6 | 原Ledger及父资源/配额/typed UID预算、Service、ExecutionHistory/WorkflowHistory/拒绝记忆；survey不消费写预算 | 写前持久化、独立复读、取消/迟到/UNKNOWN零重放；有限恢复见W01 | 行内领域和共享tests仅证明已实现分支；当前REAL_UNVERIFIED |
| L 本地规划/投影 | 原订单/生产纯计算及本地配置；原API/专业页 | 精确账号/结构及配置来源，预测值非服务端事实 | 规划可引用原Ledger；无独立游戏写，N/A不表示执行完成 | 缺失保守，不补库存或推定全天覆盖 | 行内算法tests；不代表真实最终奖励/全天量 |
| S Stage/战报 | 原StageRunner或有限Stage Function/只读战报；原API/UI/首败开关 | READY/精确账号/Origin/CSRF/所有者/互斥/主线LEFT/未决/授权 | 空成本；Function接原Service/父预算；原stage-history逐场持久，战报读N/A | runId/generation/取消/限频/迟到；重启只读，不恢复战斗许可 | 原Stage/历史tests；历史137关、156胜/157限频限定§4.4；当前REAL_UNVERIFIED |
| B 禁止消费 | 原Action/Service/Registry拒绝路径，无允许钻石消费UI | D6不可override，Owner授权不放宽 | 派发前拒绝，无正向消费成功账本 | NOT_EXECUTED不伪造UNKNOWN | 原D6负向tests；正向消费EXCLUDE，不做真实尝试 |

第1维为行内Function状态，2–12维按本表与源码/边界合读。源码与tests是当前索引，不表示本轮重新运行；已有结果以顶部W对应提交记录为准，不累计。a93acb8文档批仅做静态对账；源码增量的定向回归单独记录，不能把工作树通过当已提交基线或R7通过。当前真实验收未执行，协议、注册或离线通过不等于完整业务/真实通过。

| C ID | 原能力 | Function | Profile | Protocol/外证 | 当前Function与源码 | 缺口/边界 | 工作包 |
|---|---|---|---|---|---|---|---|
| C001 | 凭证→Session 建立 | EXISTING_FUNCTION | T | 当前有限范围已核；最终未验 | src/server.mjs；tests/server-runtime.test.mjs | 唯一Console所有权、显式Session/凭证校验及脱敏；扫码捕获仍走独立授权CLI | W03 |
| C002 | 账号隔离 | EXISTING_FUNCTION | T | 当前有限范围已核；最终未验 | src/server.mjs；tests/server-runtime.test.mjs | 账号/角色/世界/连接/代次隔离和旧回调保护；选择账号不隐式登录 | W01 |
| C003 | 世界/区服切换 | PARTIAL | T | 当前有限范围已核；最终未验 | src/server.mjs；tests/server-runtime.test.mjs | 原列表/分组精确角色与区服int64、五维会话复核及原busy锁只读修复已有；独立CLI写在读凭证前拒绝、网页enter403，现存角色实际切换及恢复合同未全 | W03 |
| C004 | 状态采集（只读） | EXISTING_FUNCTION | R | 当前有限范围已核；最终未验 | src/game.mjs；tests/data-catalog.test.mjs | 固定48查询、28解析/20原始；缓存与显式刷新分离，扩展调查不计入48 | W03 |
| C005 | 协议调用（通用） | EXISTING_FUNCTION | T | 当前有限范围已核；最终未验 | src/client.mjs；tests/client-lifecycle.test.mjs | 请求关联、ACK及迟到隔离；协议可调用不授予任意Request写权限 | W01 |
| C101 | 建筑信息读取 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/city-operations.mjs；tests/city-operations.test.mjs | 建筑信息与业务页面已有 | W04 |
| C102 | 建筑升级前置校验 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/city-operations.mjs；tests/city-operations.test.mjs | 材料/等级/人口/队列前检已有；未知不计划 | W04 |
| C103 | 建筑升级执行 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/city-operations.mjs；tests/city-operations.test.mjs | 升级授权与权威复读已有，真实未验 | W04 |
| C104 | 建造执行 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/city-operations.mjs；tests/city-operations.test.mjs | 仅服务端已有level0槽；不是任意地图新坐标建造 | W04 |
| C111 | 工厂状态读取 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | 工厂/队列/空位/成品可靠性已有 | W04 |
| C112 | 生产报表聚合 | PARTIAL | L | 当前有限范围已核；最终未验 | src/production-report.mjs；src/operation-service.mjs；src/page.mjs；tests/production-report.test.mjs；tests/operations-view.test.mjs | 原Service.history→GET /api/operations/history.dailyReport→原历史页已接，按本地日历汇总工具确认收取；coverage=tool-verified-only，fullDayCoverage=false，totalGameProduction=null，游戏全天量/权威日界未闭合，不重复开发已有接线 | W04 |
| C113 | 库存缺口计算 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | 订单优先缺口、在产/成品抵扣及共享库存；收入不自动扩额 | W04 |
| C114 | 自动生产决策 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | 原排产及种子/过剩作物水位接入生产策略，缺配置不推测数量 | W04 |
| C115 | 生产提交执行 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | registered production复用原city链、共享预算、写前调查和写后复读 | W04 |
| C116 | 成品收取/竣工 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | 工厂成品与竣工受控执行；原生批量农田结算另有缺证 | W04 |
| C121 | 居民需求读取 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/order-execution.mjs；tests/order-execution.test.mjs | 需求源OnWater，缺数组不是权威空 | W04 |
| C122 | 需求物品解析 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/order-execution.mjs；tests/order-execution.test.mjs | 物品ID/安全数量解析已有 | W04 |
| C123 | 订单库存缺口 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/order-execution.mjs；tests/order-execution.test.mjs | 跨订单预算分配已有，不把独立模拟当批量预留 | W04 |
| C124 | 订单奖励计算 | PARTIAL | L | 当前有限范围已核；最终未验 | src/order-rewards.mjs；tests/order-rewards.test.mjs | 经验和已证基础金币预览已有；最终金币倍率/结算公式缺证 | W04 |
| C125 | 订单规则评估 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/order-execution.mjs；tests/order-execution.test.mjs | 规则/三值评估/库存复查已有；免费刷新资格缺证继续冻结 | W04 |
| C126 | 订单提交执行 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/order-execution.mjs；tests/order-execution.test.mjs | 明确单单提交已受控并独立确认订单替换及完成数；免费刷新另行缺证 | W04 |
| C127 | 规则持久化 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/order-execution.mjs；tests/order-execution.test.mjs | 精确账号原子保存及坏文件保护已有 | W03 |
| C128 | 执行历史记录 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/order-execution.mjs；tests/order-execution.test.mjs | 原History持久化、run/batch/action查询及未决保守保护 | W01 |
| C131 | 港口货物读取 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/fleet.mjs；tests/fleet.test.mjs | CargoShips读取和通用Fleet展示已有 | W05 |
| C132 | 港口缺货识别 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/fleet.mjs；tests/fleet.test.mjs | cargoShortageView逐物品缺货及专业页已有；不自动购买 | W05 |
| C133 | 提交货物执行 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/fleet.mjs；tests/fleet.test.mjs | FillCargoShip typed+精确货格filled复读已有 | W05 |
| C134 | 领取港口奖励 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/fleet.mjs；tests/fleet.test.mjs | 到港状态消费+奖励回包已有；E2E加库存核对 | W05 |
| C141 | 寻宝状态读取 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/museum.mjs；tests/museum.test.mjs | 探索次数/进度/状态可读，COMPLETE_UNSETTLED独立 | W11 |
| C142 | 寻宝缺货识别 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/museum.mjs；tests/museum.test.mjs | Museum缺料逐项明细和API/专业页已有，不证明结算资格 | W11 |
| C143 | 冒险寻宝执行 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/museum.mjs；tests/museum.test.mjs | 出发和道具加速Function存在，结算领奖另计C144 | W11 |
| C144 | 领取寻宝奖励 | PROTOCOL_ONLY | G | 当前有限范围已核；最终未验 | src/museum.mjs；tests/museum.test.mjs | Complete/Reward均需stageId；仅定位关卡，MuseumInfo缺同次结算结果、pending身份及收据，Complete响应无结算ID，BLOCKED_EVIDENCE；定向验证见W11 | W11 |
| C151 | 海面扫荡 | PARTIAL | G | 当前有限范围已核；最终未验 | src/pirate-operations.mjs；tests/pirate-operations.test.mjs | 精确UID/city单目标扫荡和配额/计次已接；奖励归属、目标变化及日界仍缺证 | W12 |
| C152 | 钓鱼 | PARTIAL | R | 当前有限范围已核；最终未验 | src/fishing-view.mjs；tests/fishing-view.test.mjs | 等级/库存/容量/图鉴门槛只读已接；DrawFishReward/GainBigFish身份与结算缺证 | W13 |
| C201 | 当前关卡读取 | EXISTING_FUNCTION | S | 当前有限范围已核；最终未验 | src/stages.mjs；tests/stage-history.test.mjs | mainlineStage当前读取已有 | W08 |
| C202 | 挑战关卡执行 | EXISTING_FUNCTION | S | 当前有限范围已核；最终未验 | src/stages.mjs；tests/stage-history.test.mjs | ChallengeStage执行已有，保持主线专属证据 | W08 |
| C203 | 战斗结果解析 | EXISTING_FUNCTION | S | 当前有限范围已核；最终未验 | src/stages.mjs；tests/stage-history.test.mjs | 严格关卡/Boolean/BT_MAINLINE/LEFT已有 | W08 |
| C204 | 关卡循环控制 | EXISTING_FUNCTION | S | 当前有限范围已核；最终未验 | src/stages.mjs；tests/stage-history.test.mjs | 有限次数/终点、胜利推进、战败停止开关、取消及倒计时已有 | W08 |
| C205 | 限频处理 | EXISTING_FUNCTION | S | 当前有限范围已核；最终未验 | src/stages.mjs；tests/stage-history.test.mjs | RATE_LIMITED独立停止；不自动重试限频或UNKNOWN | W08 |
| C206 | 敌方阵容抓取 | EXISTING_FUNCTION | S | 当前有限范围已核；最终未验 | src/stages.mjs；tests/stage-history.test.mjs | 消费已有rightTeams，不额外挑战取数据 | W08 |
| C207 | 我方阵容抓取 | EXISTING_FUNCTION | S | 当前有限范围已核；最终未验 | src/stages.mjs；tests/stage-history.test.mjs | 实际leftTeam与当前GetFormation来源分开 | W08 |
| C208 | 战斗结果分析 | EXISTING_FUNCTION | S | 当前有限范围已核；最终未验 | src/stages.mjs；tests/stage-history.test.mjs | 持久战报、同角色世界关卡差异和保守建议；缺分析保持未知 | W08 |
| C209 | 自动换阵决策 | PARTIAL | G | 当前有限范围已核；最终未验 | src/stage-history.mjs；src/workflow.mjs；src/operation-service.mjs；src/page.mjs；tests/stage-history.test.mjs；tests/gameplay-api.test.mjs；tests/stages-view.test.mjs | 原单模板、明确顺序及匹配历史胜率选择已接原DAG/逐批或有限run授权；明确最少样本、同作用域/队伍/对手/精确站位统计，胜率同率保留输入序，样本不足不生成统计图。确认同关卡战败才换阵，胜利/耗尽/到限/拒绝/UNKNOWN停止。历史启发式不保证未来更优；完整原DoD及真实验收未齐，REAL_UNVERIFIED | W08 |
| C211 | 当前阵容查询 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/formation.mjs；tests/formation.test.mjs | 主线及远征阵容分模式读取 | W08 |
| C212 | 已解锁阵型查询 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/formation.mjs；tests/formation.test.mjs | 解锁模板及图纸解锁独立Function已有 | W08 |
| C213 | 阵容保存/切换前置校验 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/formation.mjs；tests/formation.test.mjs | 归属/人数/职业/站位/宠物校验已有 | W08 |
| C214 | 阵容保存/切换执行 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/formation.mjs；tests/formation.test.mjs | 保存/应用/恢复均新计划独立复读，具名完整队伍已接 | W08 |
| C215 | 一键复制"极限通关"站位 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/extreme-formations.mjs；tests/extreme-formations-service.test.mjs | 当前关卡极限战报精确来源核验及站位准备已接；不继承开战授权 | W08 |
| C221 | 角色升级前置校验 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/hero-operations.mjs；tests/hero-service.test.mjs | 成长等级和材料前检已有，复用Ledger | W06 |
| C222 | 角色升级执行 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/hero-operations.mjs；tests/hero-service.test.mjs | 英雄单次升级经heroes/Service及英雄全池/库存复读 | W06 |
| C223 | 角色升星前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/hero-operations.mjs；tests/hero-service.test.mjs | 自有专属碎片单星、明确1:1兑换、cc0679c单英雄及本批1至12名明确顺序共享来源的单星Workflow已有；固定原星级/余额/成本及累计预算，0仅用已有专属碎片；隐式混用及完整自动策略仍冻结 | W06 |
| C224 | 技能升级前置校验/执行 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/hero-operations.mjs；tests/hero-service.test.mjs | 明确技能槽单次升级、前置及资源独立复读已接 | W06 |
| C225 | 专武等级前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/hero-operations.mjs；tests/hero-service.test.mjs | 已激活专武单次升级已接；未激活状态与激活分支缺证 | W07 |
| C226 | 专武星级前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/hero-operations.mjs；tests/hero-service.test.mjs | 已激活专武单次升星已接；未激活/其他成长分支未闭合 | W07 |
| C227 | 纹章替换前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/badge-growth.mjs；tests/badge-growth.test.mjs | 自有闲置徽章穿空槽已接；固定BadgeSelectItem明确downUid候选/upUid现有，BadgeReplaceResponse.material存在，但成长转移/旧物/返还合同缺证 | W07 |
| C228 | 纹章升级前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/badge-growth.mjs；tests/badge-growth.test.mjs | 精确经验差额单级且低于上限、红徽章单星已有；上限经验落点缺证 | W07 |
| C229 | 装备升级前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/equipment-growth.mjs；tests/equipment-growth.test.mjs | 显式配置零费首次0→1、正等级单级、红装精炼/单星已有；替换及完整成长边界仍未全 | W07 |
| C230 | 装备替换前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/equipment-growth.mjs；tests/equipment-growth.test.mjs | 自有装备穿同类空槽已接；固定EquipSelectItem明确downUid候选/upUid现有，EquipReplaceResponse.material存在，但成长转移/旧物/返还合同缺证；元数据纠正为BLOCKED_EVIDENCE | W07 |
| C301 | 联盟求助单识别 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/alliance.mjs；tests/alliance-tech.test.mjs | reqId精确绑定成员求助单，已有展示 | W09 |
| C302 | 联盟成员识别 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/alliance.mjs；tests/alliance-tech.test.mjs | 精确成员ID及专业列表已有 | W09 |
| C303 | 按成员捐赠前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/alliance.mjs；tests/alliance-tech.test.mjs | 按成员帮助规则有；服务端总额度/冷却缺证，不生成可执行help | W09 |
| C304 | 按物品捐赠前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/alliance.mjs；tests/alliance-tech.test.mjs | 按物品帮助共用原合同，不把本地历史当服务端额度 | W09 |
| C305 | 自动求助前置校验/执行 | PROTOCOL_ONLY | G | 当前有限范围已核；最终未验 | src/alliance.mjs；tests/alliance-tech.test.mjs | 求助阈值/日限/冷却与结算缺证，无ask写合同 | W09 |
| C306 | 联盟科技状态读取 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/alliance.mjs；tests/alliance-tech.test.mjs | 赛季科技状态、前置及专业树展示已有 | W10 |
| C307 | 联盟科技升级前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/alliance.mjs；tests/alliance-tech.test.mjs | 单级科技升级及精确扣点复读已接；原范围科技重置尚缺完整合同 | W10 |
| C401 | 舰队编组读取 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/fleet.mjs；tests/fleet.test.mjs | MyFleets+OnWater队伍读取已有，不用MyFleets代替阵容复读 | W14 |
| C402 | 舰队编组修改前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/fleet.mjs；tests/fleet.test.mjs | 无非零宠物范围编组可执行；非零宠物绑定证据另列受限分支 | W14 |
| C403 | 地图目标读取 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/naval-rules.mjs；tests/naval-rules.test.mjs | WorldInfo当前视野、精确ID及资源田读取，不宣称全图完整 | W15 |
| C404 | 目标监听 | PARTIAL | G | 当前有限范围已核；最终未验 | src/naval-rules.mjs；tests/naval-rules.test.mjs | 有限Loop调查及同查询规则摘要/变化计数已有；非跨视野持续目标身份 | W15 |
| C405 | 跟随指定玩家 | PARTIAL | G | 当前有限范围已核；最终未验 | src/naval-rules.mjs；tests/naval-rules.test.mjs | 当前精确玩家筛选已有，跨视野定位/跟随事件来源缺证 | W15 |
| C406 | 攻击派遣前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/fleet.mjs；tests/fleet.test.mjs | 原移动/维修委托已有；攻击/宣战/胜负及参战归属未闭合 | W14 |
| C407 | 修船前置校验/执行 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/fleet.mjs；tests/fleet.test.mjs | 维修/停止、优先序及最大汽油预算已有；自然恢复仅观察 | W14 |
| C408 | 加速前置校验/执行 | PROTOCOL_ONLY | G | 当前有限范围已核；最终未验 | src/fleet.mjs；tests/fleet.test.mjs | SpeedUpFleet/Repair/Cargo无已证非钻石完整写候选，BLOCKED_EVIDENCE | W14 |
| C409 | 钻石使用规则评估 | EXISTING_FUNCTION | B | 当前有限范围已核；最终未验 | src/actions.mjs；tests/actions-safety.test.mjs | D6硬拒钻石/付费及开发凭证；正向消费EXCLUDE，人工授权不豁免 | W01 |
| C410 | 动态攻击决策 | PARTIAL | G | 当前有限范围已核；最终未验 | src/naval-rules.mjs；tests/naval-rules.test.mjs | 三值观察规则有，动态攻击选择与授权派遣无 | W15 |
| C501 | 活动识别 | PARTIAL | R | 当前有限范围已核；最终未验 | src/daily-checklist.mjs；tests/daily-checklist.test.mjs | 日常/周活动、festival/openRank专用视图及SCAllActivity其他19类已知字段目录元数据同源；不推导完整服务器目录或资格 | W16 |
| C502 | 活动任务读取 | PARTIAL | R | 当前有限范围已核；最终未验 | src/daily-checklist.mjs；src/tasks.mjs；src/task-rewards.mjs；tests/daily-checklist.test.mjs；tests/task-rewards.test.mjs | 主/支/成就与旧Tasks共享只读解析，Tasks API精确缓存/五维Client绑定及主支线/成就逐源失效；每日/周芯片独立周期观察已有；全部活动任务未闭合 | W16 |
| C503 | 活动任务执行前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/task-rewards.mjs；tests/task-rewards.test.mjs | 已证奖励及八类日常动作子集通过原Function；其他任务按具体合同冻结 | W16 |
| C511 | 邮件领取 | PARTIAL | G | 当前有限范围已核；最终未验 | src/mail.mjs；tests/mail-claim.test.mjs | 有界分页、单封读领及可结算附件已有；批量/实例附件归属缺证 | W16 |
| C512 | VIP 礼包领取 | PARTIAL | R | 当前有限范围已核；最终未验 | src/daily-checklist.mjs；tests/daily-checklist.test.mjs | VIP等级和礼包资格独立观察；真实领取资格及独立结算未闭合 | W16 |
| C513 | 商城礼包领取（日/周） | PARTIAL | G | 当前有限范围已核；最终未验 | src/task-rewards.mjs；tests/task-rewards.test.mjs | 免费日赠礼及三类周礼包已接；全部日周归属/周期未闭合 | W16 |
| C514 | 周活动补给礼包领取 | PARTIAL | G | 当前有限范围已核；最终未验 | src/task-rewards.mjs；tests/task-rewards.test.mjs | 周转盘/翻牌/芯片明确免费固定礼包已接；其他周补给合同缺证 | W17 |
| C515 | 周活动每日任务执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/task-rewards.mjs；src/daily-task-rewards.mjs；tests/daily-task-rewards.test.mjs | 具名周芯片任务及签到观察保留；本批战令taskId/精确进度/配置目标/isGot/独立档位与累计积分只读已有，每日epoch/积分到账缺证不授领取资格；末项换轮和其他活动日任务缺证 | W17 |
| C516 | 周活动奖励领取 | PARTIAL | G | 当前有限范围已核；最终未验 | src/task-rewards.mjs；tests/task-rewards.test.mjs | 日活跃和已证周奖励子集已有；周活跃周期归属/完整活动奖未闭合 | W17 |
| C517 | 军备竞赛奖励领取 | PARTIAL | R/W子集 | 开服四模式任务单档离线受控；完整范围未验 | src/client.mjs；src/daily-task-rewards.mjs；src/task-rewards.mjs；src/actions.mjs；tests/daily-task-rewards.test.mjs；tests/gameplay-api.test.mjs | 明确type1–4/score，Order/Stage直接表，Pirate/War当前季精确否则最高配置季；同私有窗口/Info.endTime/可信Ping、进度达标且完整已领列表明确未领，经原Service授权与模式UID父预算。独立复读确认唯一score新增与完整库存精确净入；排名奖励/宝箱打开及军备完整合同仍BLOCKED_EVIDENCE，REAL_UNVERIFIED | W17 |
| C521 | 海商王价格读取 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/trade.mjs；tests/trade.test.mjs | 明确当前港口价格/库存/持货/容量和可信时段；非所有目的地价格 | W18 |
| C522 | 低买高卖预期计算 | PARTIAL | G | 当前有限范围已核；最终未验 | src/trade.mjs；tests/trade.test.mjs | 单次非亏损卖出预期公式已有；跨港低买高卖完整收益策略缺证 | W18 |
| C523 | 自动买卖前置校验/执行 | PARTIAL | G | 当前有限范围已核；最终未验 | src/trade.mjs；tests/trade.test.mjs | 单次买/卖及商会币成本独立复读已有；自动多段策略未完成 | W18 |
| C524 | 自动巡航 | PARTIAL | G | 当前有限范围已核；最终未验 | src/trade.mjs；tests/trade.test.mjs | Radar移动、自有道具仍未来终点加速/时钟WAIT已有；到达/补购/巡航收益缺证 | W18 |
| C601 | 只读探测（每轮首步） | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/operation-service.mjs；tests/operation-service.test.mjs | 原Registry survey及Workflow SURVEY/具名WAIT调查，无新collector | W02 |
| C602 | 计划生成 | PARTIAL | G | 当前有限范围已核；最终未验 | src/operation-service.mjs；tests/operation-service.test.mjs | 26静态玩法+server Stage具体计划及父预算；全范围业务未齐 | W02 |
| C603 | 动作执行（单条/整轮） | PARTIAL | G | 当前有限范围已核；最终未验 | src/operation-service.mjs；tests/operation-service.test.mjs | Service/Executor统一已交付写；旧Web写403/CLI独立写拒绝，未映射业务仍未交付 | W02 |
| C604 | 跨轮记忆 | PARTIAL | G | 当前有限范围已核；最终未验 | src/execution-memory.mjs；tests/execution-memory-service.test.mjs | 持久拒绝/UNKNOWN/身份变化及关联、原历史跨轮确认计数/可靠库存净变化、原批次/动作原因及后续建议分源只读摘要已有；Workflow无动作原原因/归属已接原历史及共享记忆API/页面，筛选保持原运行/节点语义，不混入动作统计；全业务策略未齐，Service cooldown/gameDay仍false | W19 |
| C605 | 顺序执行引擎 | EXISTING_FUNCTION | G | 当前有限范围已核；最终未验 | src/workflow.mjs；tests/workflow.test.mjs | 原Runner有限顺序/条件/WAIT/重复、逐批及有限run授权；未新增调度器 | W20 |
| C606 | 运行状态/历史查询 | PARTIAL | G | 当前有限范围已核；最终未验 | src/stage-history.mjs；tests/workflow-execution-history.test.mjs | run→definition/node→batch→action及Stage逐场持久历史已有；Workflow批次/记忆可精确只读打开原证据；原记忆API/页面增加跨轮计数/资源/原始原因只读摘要；Workflow无动作原reason/trace与捕获身份已进入共享记忆查询，记忆卡可精确只读打开原Workflow历史并校验原图及身份；已支持任务只读目标入口/历史复用原Function参数解析，不授资格或续权；全业务未齐 | W19 |
| C607 | Function 注册表 | PARTIAL | G | 当前有限范围已核；最终未验 | src/function-registry.mjs；tests/function-registry.test.mjs | 26静态玩法+server Stage，共27份schema/元数据；登记不等于全部分支可执行 | W02 |


G-R/G-P覆盖：C131/C141/C211/C212/C301/C302/C401/C403/C601属于只读survey/view，不消耗Ledger、不创建写许可、不记业务ExecutionHistory；C602是PLAN，使用规划预算模拟但未执行，不把其输出当执行历史。C132/C142/C209/C404/C405/C410等规划/观察子功能同理；只有真正执行的候选继承G写入路径。C606历史查询是本地读取。Function状态和相邻模块的执行底座不能互相替代。

### 5.1 可复算的需求状态清单

- EXISTING_FUNCTION（53）：C001、C002、C004、C005、C101、C102、C103、C104、C111、C113、C114、C115、C116、C121、C122、C123、C125、C126、C127、C128、C131、C132、C133、C134、C141、C142、C143、C201、C202、C203、C204、C205、C206、C207、C208、C211、C212、C213、C214、C215、C221、C222、C224、C301、C302、C306、C401、C403、C407、C409、C521、C601、C605。
- PARTIAL（39）：C003、C112、C124、C151、C152、C209、C223、C225、C226、C227、C228、C229、C230、C303、C304、C307、C402、C404、C405、C406、C410、C501、C502、C503、C511、C512、C513、C514、C515、C516、C517、C522、C523、C524、C602、C603、C604、C606、C607。
- PROTOCOL_ONLY（3）：C144、C305、C408。

Function分类描述行内范围，不是最终通过数；缺证按原W/X和行内限制。本轮文档核对仅做静态校验，测试路径不表示重跑；Museum、挂机组合及逐田种收的已有定向结果按顶部W11/W16/W04/W19对应提交引用，R7/R8均NOT_RUN。

## 6. 产品树、原业务域与三维交叉映射

以下保留Inventory的18个业务域，不将示例树当新产品定义；括号为原Master归并模块及C编号。跨域相同C只拥有一个业务Function，多页引用不复制执行链。

~~~text
CrazyWater Platform
├─01 平台与账号 [M0：C001–005]
│ ├─账号/凭证/Session/Runtime/世界区服
│ └─配置、账号切换和生命周期 [同时服务全部业务]
├─02 数据浏览/Explorer [M1：C004/C005及各领域只读C]
│ ├─48查询/28解析/20原始、可靠性、精度、来源
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

当前16模块状态如下；PARTIAL覆盖完整原范围，已实现子集的离线证据不等于最终产品完成。接线列只说明已有允许子集，测试列是实际文件索引，不表示本轮重跑或完整模块通过；已有定向结果按顶部W行与对应提交引用，本轮文档核对不重新执行或累加。各模块本版本真实验收均未执行（历史精确边界见§4.4）。

| 模块 | 原名称 | 状态 | 工作包 | 当前范围与剩余边界 | 现有API/UI/Workflow接线 | 对应测试/真实边界 |
|---|---|---|---|---|---|---|
| M0 | Platform Runtime | PARTIAL | W01/W03 | 账号/连接/所有权、显式仅新增本地导入及来源检查已有；扫码产品链、地图来源与资产缺口保留 | 原账号/区服API与账号页；导入仅本地新增，enter写403；Runtime不以Workflow恢复连接 | tests/server-runtime.test.mjs；当前真实未验 |
| M1 | Data Center | PARTIAL | W03 | 48查询（28解析/20原始）、可靠性与钓鱼解析已有；全业务完整读模型未闭合 | 原GET /api/data-explorer、缓存总览/Explorer；领域SURVEY与缓存分开 | tests/explorer-api.test.mjs；当前真实未验 |
| M2 | City & Production | PARTIAL | W04 | 建筑/生产/单田种收、明确多田有限种收与收取确认后再播种、明确单包及2至23项有序持有材料包兑换后单份生产有限准备及指定配方持有包资格/缺口建议接原prepare已有；本批独立工厂视图接现有队列/成品/可靠库存及原候选，水位/委任仍为投影，完整全天量及批量协议结算缺 | 原city/production/farm Function→Service；城市/生产/农田专业页、prepare API和有限Workflow，收取与兑换前置由同五维私有History及实际空田/完整库存证明 | tests/city-operations.test.mjs、farm领域/Service及HTTP/PAGE定向；当前真实未验 |
| M3 | Resident Orders | PARTIAL | W04 | 规则/提交/库存/基础金币预览已有；最终金币公式与免费刷新额度缺 | 原Orders Function、规则API及订单页；Tasks/Loop订单只读调查接SURVEY，提交另授权 | tests/order-execution.test.mjs；当前真实未验 |
| M4 | Port & Trade Cargo | PARTIAL | W05 | 港口装货/到港领取/专业缺货已有；完整原港口范围仍受D6及证据限制 | 原Fleet货舱Function/API/专业缺货页；有限Dailies装货不推导任务完成 | tests/fleet.test.mjs；当前真实未验 |
| M5 | Museum & Exploration | PARTIAL | W11 | 展陈/收益/出发/缺料及古董成长已有；探索完成/领奖可恢复身份缺 | 原museum/antique-growth Function、API与专业页/有限Workflow；Complete/Reward禁用 | tests/museum.test.mjs；限定定向验证见W11，当前真实未验 |
| M6 | Sea Sweep & Fishing | PARTIAL | W12/W13 | 精确目标扫荡与钓鱼只读已有；奖励归属/日界/钓鱼领取及收线缺 | 原pirate-sweep Function与精确城市UID表单接有限图；Fishing页/Explorer仅只读 | tests/pirate-operations.test.mjs、tests/fishing-view.test.mjs；当前真实未验 |
| M7 | Hero Growth | PARTIAL | W06/W07 | 等级/星/技能、明确碎片及有限单/多英雄单星组合、装备/徽章/专武子集、Pet投喂与服役单级LEVEL、锻造明确配方数量准备已有；替换/激活/培育及成熟领取等缺 | 原heroes/star/prepare与equipment-forge/prepare、专业成长页；Pet LEVEL沿原参数、Service/Workflow | tests/pet-operations.test.mjs、tests/equipment-forge.test.mjs；8c52423/4046f04定向证据见W07，当前真实未验 |
| M8 | Formation & Battle Analysis | PARTIAL | W08 | 整队预设/普通解锁/极限复制/战报、有限顺序与历史胜率换阵已有；完整原DoD、所有模式及真实验收未齐 | 原Formation保存/极限来源/推荐prepare、阵容页及有限候选图；统计选择不自动开战采样 | tests/formation.test.mjs；当前真实未验 |
| M9 | Mainline Automation | PARTIAL | W08/W19 | Stage门控/逐场持久历史、有限Function及确认战败候选分支已离线实现；真实间隔和战败分支未验 | 原Stage API/专业页/Runner及有限Stage Function；逐场History和确认战败分支 | tests/stage-history.test.mjs；历史真实仅§4.4限定，当前未验 |
| M10 | Alliance | PARTIAL | W09/W10 | 订单/福利/科技单升/Fort/商船补货与船长已有；帮助/求助/科技重置缺 | 原Alliance/Tech/Fort Function、API与成员/科技/商船页，允许子集接原有限图 | tests/alliance.test.mjs、tests/alliance-tech.test.mjs；P1-5已接五维隔离缓存总览及本人联盟显式调查历史观察；摘要不授业务资格，当前真实未验 |
| M11 | Fleet & City War | PARTIAL | W14/W15 | 编队/维修/移动/港口、有界响应比较及明确自有资源田放弃已有；攻击/加速/跟随/资源田占领合同缺 | 原Fleet/Naval Function、API及舰队/有界观察页；有限Loop SURVEY，放弃目标单独授权 | tests/fleet.test.mjs；当前真实未验 |
| M12 | Activities & Dailies | PARTIAL | W16/W17 | 具名任务、邮件、免费招募点金/试炼、部分周奖励、明确普通挂机物品/徽章收益及其后明确1/5/10级升级已有；有限收益→升级准备/API/UI已接原Workflow；VIP/周期/订单档及其他实例收益仍缺 | 原task-rewards/mail/afk-level-rewards等Function；Tasks/Dailies页转原Workflow，资格与执行分开 | tests/task-rewards.test.mjs、tests/mail-claim.test.mjs、tests/afk-level-rewards.test.mjs；P1-5已接五维隔离缓存总览；摘要不授业务资格，当前真实未验 |
| M13 | Trade King | PARTIAL | W18 | 当前港报价/精确买卖移动/自有加速及时钟等待已有；目的地报价、策略、到达收益缺 | 原Trade Function/API/专业页与同航段WAIT；目的港报价及多段策略未接 | tests/trade.test.mjs；当前真实未验 |
| M14 | Workflow & Scheduler | PARTIAL | W19/W20 | 统一Tasks/Dailies/有限Loop、原生图、父预算/持久历史/有限日周事件已有；全入口覆盖与权威策略未全 | 原workflows/prepare→Registry/Service；Tasks/Dailies/有限Loop、原生图及历史/记忆页已有 | tests/workflow.test.mjs、tests/execution-memory-service.test.mjs；当前真实未验 |
| M15 | Shared Execution Services | PARTIAL | W01/W02/W19/W22 | 原Service/Executor/Ledger/History/Registry复用；恢复仅原连接零成本阵容/舰队停止的持久已验证凭据或未派发证明，不是通用恢复 | 原Service/Executor/Ledger/History/Registry/Contract共用；授权/预算/UNKNOWN不另建 | tests/operation-service.test.mjs、tests/gameplay-api.test.mjs；当前真实未验 |

### 6.1 全部42项Pxxx

| P ID | 原页面/面板 | 当前UI维度 | 需求/施工 |
|---|---|---|---|
| P0-1 | 账号列表/扫码添加 | PARTIAL：账号列表及显式仅新增普通凭证导入已有，同源确认/重复拒绝/独立本地读取；扫码隐藏且捕获路由403，未覆盖原完整登录产品链 | C001/C002；W03 |
| P0-2 | 账号配置 | PARTIAL：账号独立模块/规则/生产/预算配置已有；未覆盖全业务 | C002；W03/W21 |
| P1-1 | 数据中心总览 | EXISTING_UI：只读缓存总览/可靠性及显式刷新 | C004；W03 |
| P1-2 | 建筑生产 | PARTIAL：队列/工具内生产历史日报已有；游戏完整全天图表缺 | C101/C111/C112；W04 |
| P1-3 | 英雄阵容 | EXISTING_UI：英雄预览与独立阵容页，完整写范围另见P3 | C211/C212；W06/W08 |
| P1-4 | 舰队地图 | PARTIAL：原Fleet及本次WorldInfo响应的有界历史摘要已接原总览与舰队导航；完整地图来源及业务地图缺 | C401/C403；W14/W15/W21 |
| P1-5 | 活动联盟 | PARTIAL：原联盟成员/科技/订单/商船及31164c1活动片段/任务活跃度/周窗口/公会摘要保留；本批总览组合本人联盟最近显式Service调查的五维历史观察，普通/商船各有范围、逐来源状态/时间独立。缺源未知、非实时资格、非全活动/奖励归属；原完整范围仍待齐 | C301/C501；W09/W16/W21 |
| P1-6 | 原始响应浏览器 | EXISTING_UI：48查询，28解析/20原始；原27口径仅历史 | C004/C005；W03 |
| P2-1 | 建筑管理 | EXISTING_UI：槽位/候选/原因及受控建造升级加速 | C101–104；W04 |
| P2-2 | 资源生产 | PARTIAL：队列/策略/委任减时/水位/材料包/单田种收及有限逐田种收、确认收取后再播种及明确单包及有序多项兑换后指定工厂单份生产准备、指定配方资格覆盖建议及独立工厂详情/原控制接线已有；完整全天及批量协议结算缺 | C111–116；W04 |
| P2-3 | 居民规则编辑 | EXISTING_UI：原规则编辑/排序/账号保存及明确本地时窗、观察计数阈值 | C125/C127；W04 |
| P2-4 | 居民订单预览 | EXISTING_UI：需求/库存/规则/基础金币及缓存生产等待投影；最终金币未知，投影不代表到账或刷新资格 | C121–125；W04 |
| P2-5 | 居民订单执行 | PARTIAL：提交与持久历史已有；免费刷新执行缺权威额度 | C126/C128；W04 |
| P2-6 | 贸易港口 | PARTIAL：专业货舱/缺货明细、装货和到港领取已有；其他原范围受D6/证据限制 | C131–134；W05 |
| P2-7 | 博物馆寻宝 | PARTIAL：缺料/出发、古董属性与成长已有；探索完成/领奖缺身份 | C141–144；W11 |
| P2-8 | 海面扫荡 | PARTIAL：专业扫荡页有明确城市/UID/配额/单次计划；奖励与日界未闭合 | C151；W12 |
| P2-9 | 钓鱼 | PARTIAL：专业只读钓鱼等级/库存/容量/图鉴已有；领取/捕鱼缺合同 | C152；W13 |
| P3-1 | 主线运行 | EXISTING_UI：运行/倒计时/首败停止开关/持久历史已有；真实验证另记 | C201/C204/C205；W08 |
| P3-2 | 阵容对比 | EXISTING_UI：原战报details与阵容比较 | C206/C207；W08 |
| P3-3 | 战斗分析 | EXISTING_UI：保守统计及同角色/世界/关卡持久历史比较；缺分析保持未知 | C208；W08 |
| P3-4 | 自动换阵 | PARTIAL：明确顺序及匹配历史胜率选择、确认战败换阵和原有限授权已接；缺样本不补造，完整原DoD与真实验收未全 | C209；W08 |
| P3-5 | 阵容管理 | PARTIAL：完整队伍预设/普通图纸解锁/极限来源复制已有；其他模式未全 | C211–215；W08 |
| P3-6 | 英雄列表 | PARTIAL：英雄/专武/纹章/装备/锻造/Pet子区已有；本批原装备五种动作补明确英雄/UID调查表单，待统一测试；原完整成长分支未全 | C221–230；W06/W07 |
| P3-7 | 英雄操作 | PARTIAL：升级/升星/技能/明确碎片兑换与单/多英雄顺序单星组合及成长子集接统一计划授权，装备显式首次0→1及其他原成长/空槽动作可用结构化英雄与精确UID调查草稿，保持原Service链；本批待测，替换等冻结 | C221–230；W06/W07 |
| P4-1 | 联盟成员/求助单 | EXISTING_UI：精确玩家/请求/订单/福利及商船明细 | C301/C302；W09 |
| P4-2 | 捐赠配置 | PARTIAL：member/item规则和Fort捐赠已有；互助额度/冷却缺源 | C303/C304；W09 |
| P4-3 | 自动求助配置 | PARTIAL：原求助配置保留；无权威阈值/额度/冷却，不产可执行候选 | C305；W09 |
| P4-4 | 联盟科技 | PARTIAL：科技投影/单级成本/单次升级已有；科技重置未接 | C306/C307；W10 |
| P5-1 | 舰队编组 | PARTIAL：专业舰队编组、维修模式/顺序和明确移动已有；全原范围未全 | C401/C402；W14 |
| P5-2 | 城战委托单船 | PARTIAL：维修/移动已有；攻击与舰队道具加速缺权威合同 | C406–408；W14 |
| P5-3 | 钻石规则 | EXCLUDE：D6硬拒绝钻石；拒绝路径已有，不能通过页面授权放开 | C409；W01验拒绝 |
| P5-4 | 监听跟随 | PARTIAL：有界观察筛选与当前响应哈希比较已有；跨视野持续身份/跟随未全 | C404/C405；W15 |
| P5-5 | 动态决策 | PARTIAL：三值规则/只读摘要已有；动态攻击计划未接 | C410；W15 |
| P6-1 | 活动列表 | PARTIAL：日常/周活动、季节子项/开服及其他已知协议目录元数据已接原API/页面；本批待统一测试，完整服务器目录与周期资格未全 | C501–503；W16/W17 |
| P6-2 | 日常清单 | PARTIAL：Tasks/Dailies具名选择转原Workflow，9类明确动作子集及部分领奖已有，港口装货不证明任务完成；非17项全自动完成 | C511–517；W16/W17/W20 |
| P6-3 | 海商王 | PARTIAL：贸易单步买卖/移动/自有加速及同航段WAIT已有；全策略/收益/到达结算缺 | C521–524；W18 |
| P7-1 | 工作流画布 | PARTIAL：原生节点表单/拖动排序/拖动连线/SVG/JSON已有；全业务目录未齐 | C607/C602；W02/W20 |
| P7-2 | 工作流运行 | PARTIAL：有限run授权/父预算/节点与批次状态/取消已有；全业务及策略覆盖未齐 | C605/C606；W19/W20 |
| P7-3 | 历史/跨轮记忆 | PARTIAL：共享持久历史/Stage逐场/拒绝及UNKNOWN关联/重启只读已有；批次/记忆可追溯原执行证据，新增原始已确认次数/可靠库存净变化/原批次与动作原因分源只读摘要（建议非实际跳过）；Workflow无动作原原因/归属已接历史及记忆页，记忆卡可精确打开原历史；通用冷却/日界来源未闭合 | C604/C606；W19 |
| P8-1 | 账号默认设置 | PARTIAL：账号独立默认配置与预算表单保留；本批专业页/Workflow三核心模块增加同源默认草稿与配置来源，待统一离线验证；全42P一致性未标完成 | C002；W03/W21 |
| P8-2 | 敏感操作确认 | PARTIAL：具体计划/单次及有限run授权、D6/拒绝/UNKNOWN已有；本批原计划五维身份/哈希/有效期在核心、专业和Workflow ACTION确认同源展示，原调查库存/成本/预计余量同源对照已补，预计值不冒实际结算；待统一测试，全业务风险交互未齐 | D4/D6；W01/W02 |
| P8-3 | 全局调度 | PARTIAL：原Workflow有限ONCE/DAILY/WEEKLY和7类可信事件已有；通用日界/全事件策略未全 | S1–S8；W20 |

### 6.2 调度方式及冲突修订

| S | 当前实现 | 剩余交付边界 |
|---|---|---|
| S1 手动 | 原Service精确计划/授权；独立Stage门控；CLI只读/离线工具保留 | 独立CLI写在读取凭证前拒绝，参数不代替统一许可 |
| S2 单次 | 原Operation批次、有限Stage Function、Tasks/Dailies转原Workflow | 已接模块不代表所有原业务已接 |
| S3 轮询 | 有限Loop编译为原Registry节点，明确轮数/间隔/动作/期限/父预算 | 缓存轮询不等于游戏请求；缺源分支保持UNKNOWN或阻断 |
| S4 长时 | 原StageRunner与有限Workflow复用所有者/取消/持久历史 | 不恢复未授权写；无限长期委托和全业务范围未齐 |
| S5 定时 | 原Workflow有限ONCE/DAILY/WEEKLY，Asia/Shanghai、明确missedPolicy与单个所选发生次 | 本地日历不证明游戏日界；重启只读，不恢复计时/授权 |
| S6 事件 | 原七类可信等级/重置/任务事件保留；本批RESOURCE_AMOUNT_CHANGED复用私有连续流和原有限run，按已有资源名与精确非负int64阈值；首次只建余额基线，后续增减变化触发新调查，整包校验及有界游标 | 推送不证明收入、奖励、可用预算或写资格；不采信公开emit/重复/失序，重启不续权；全领域事件与日界来源仍缺 |
| S7 工作流 | 原有限DAG、条件/数值和三类具名WAIT、父预算、run授权及持久历史 | 仅覆盖已注册有证据业务；UNKNOWN/拒绝不被WAIT清除 |
| S8 条件 | 原OrderRules/Naval三值/业务plan与工作流条件 | UNKNOWN不派发，规则通过不等于执行授权；非全平台任意规则引擎 |

原表C205“限频等待重试”、C409“批准钻石”与D6/D8冲突：沿用限频独立停止及钻石硬拒绝。当前有限run授权绑定账号、Function白名单、总预算、期限、次数与取消；重启不恢复授权。不能将定时发生次或WAIT结果当作游戏日界、业务资格或UNKNOWN重放许可。


## 7. 现有Function复用矩阵

已实现公共能力直接沿用，只补原需求的真实缺口，不重新建设。

| 当前源码 / 调用链 | 已接能力 | 剩余扩展 / 定向验证 |
|---|---|---|
| client / execution / writer-ownership → 原Console | 请求关联、trusted clock、写前fence、取消、所有者 | 新领域只补私有来源与效果验证，不放宽1000ms心跳 |
| function-registry / function-contracts | 27静态模块加Stage、28合同；City/Orders/Production已接 | 未证写不注册为可执行；变更补公共集成 |
| resource-ledger / business-functions / operation-service | 原通用执行器、父资源/配额/UID预算、依赖版本、新鲜度、授权 | 复用领域Adapter；预计收益不扩额，UNKNOWN不返预算 |
| execution-history / execution-memory / stage-history / workflow store | 业务/图/逐场持久历史、run-node-batch-action关联和拒绝/UNKNOWN | 剩余入口关联继续补；cooldown/gameDay来源未闭合 |
| operation-recovery → Service → API/UI | 证据预览、独立复读与追加确认 | APPLIED仅同原连接代次零成本Formation；NOT_APPLIED仅持久未派发证明，其余STILL_UNKNOWN |
| city-operations / order-execution / production-planning / farm-operations | 原城市/订单/生产/单田种收与纯投影 | 最终金币、免费刷新、全天量、批量农田按原X冻结 |
| hero-operations / growth / forge / pet / antique | 原养成、锻造、投喂及古董受控子集 | 替换/激活/培育和结算身份不凭邻近功能推定 |
| task-rewards / mail / afk-level-rewards / free-* / trial-challenge | 具名奖励、单封读领、等级奖励、普通挂机物品/徽章收益、其后明确1/5/10级升级、免费招募点金及经验试炼 | 有限收益→升级准备已有；周期、VIP、实例附件及订单档仍冻结；UNKNOWN不恢复重发 |
| alliance / fleet / museum / treasure / trade | 原专业Adapter和API/UI/Workflow子集 | 帮助求助、攻击跟随、探索完成领奖、到达收益缺证局部冻结 |
| compileUnifiedExecution → 原Registry/Workflow/Service | Tasks/Dailies/有限Loop；9类明确日常动作子集，Loop可显式引用原模块 | 继续W19已有Function入口与历史接线，不重开旧写handler |
| workflow / gameplay-page / page | 原生拖拽、父预算、有限日周/可信事件、数值及三类具名WAIT | 缺冷却/日界保持未知；WAIT不清拒绝/UNKNOWN，不新建调度器 |

### 7.1 参考实现复用边界

本地参考C:/Users/zyk-o/Documents/crazywaterword已核HEAD=6c2825a4d7dda17bf894b45744d2fd39e6a05499，status空。heroGrow.mjs:235/629/1063有survey/计划/行模型，:190成本/上限算法；tradeKing.mjs:202/224/585/628有价格、卖点和计划；tradePort.mjs:86/178/195有缺货视图/需求/计划；youdu.mjs:71/123/214/378/429/481有活动子流程。当前目标部分贸易港口已由Fleet提取，不再搬整套tradePort。

参考heroGrow有自己的makeBudget和无阵容时扩大到所有英雄的回退；Trade计划会基于预计卖出收入排买入；不得原封复制。提取纯算法后适配当前Ledger，只有卖出权威确认且新授权/父预算允许才可使用收入。参考client/server/loop绝不覆盖当前保护。Museum旧版本作者身份未确认，未联网取资料，不把参考占位判成协议失效。

## 8. 架构、重复实现与公共前置

沿用原SURVEY → PLAN → VALIDATE → AUTHORIZE → EXECUTE → VERIFY → PERSIST，写前意图必须持久化。Adapter拥有领域语义，OperationService拥有许可/锁/预算/历史，GameClient拥有传输关联，Workflow只编排，页面只编辑和展示。§7所有者、父预算、注册、记忆及历史均已有实现，不得依历史规划再造。

当前公共剩余边界：通用恢复仍有限；Service policyCoverage.cooldown/gameDay仍false；完整资产缺map-1及上游来源；全业务/API/UI/Workflow覆盖和最终R7/R8未闭合。旧独立CLI写和旧Web写入口持续拒绝。缺口见顶部W、§5/6和附录A，正常开发检查不新增人工Gate。

固定客户端与配置继续复用原RUNTIME_ASSETS清单及历史记录，不在相邻功能重复抄写指纹。类型存在不证明资格、成本、可恢复身份或结算。

### 8.1 全Inventory交付边界及非C工作包补充

完整产品范围以95项原始Cxxx、原Inventory全部目标能力及其参考子项共同构成。没有Cxxx编号不等于可选，也不因只剩协议/客户端证据就从计划移除。273个Inventory条目继续逐项保留；它们有重复和分层，不能算作273项独立业务需求。下表保留原非C完整验收合同和工作包归属，已实现子集及当前缺口以附录A同ID行为准，旧“必需扩展”不重复视为未施工任务；原合同，不新造C编号、不增加目录、不复制参考整模块。证据未齐仅将具体操作保留BLOCKED_EVIDENCE；已授权的独立业务继续连续开发。Owner决策用于裁定真实语义冲突、D6允许路径不存在或确认修改原产品要求，不作为默认将非C整体移出范围的前置批准。

D6始终排除钻石支付、购买付费礼包、testAccount/superToken等开发凭证。任意JS/任意协议写接口不属于需求允许的工作流能力，不实现。道具、普通材料、已有权益、免费奖励、只读和本地算法按证据及授权进入交付；名称含加速/解锁/领取不自动等于付费。必须按具体客户端成本/资格路径判定，证据不足保持阻塞而非偷偷排除。

| 原Inventory ID / 补充能力 | 主工作包 / 共享工作包 | 当前可复用Function | 必需扩展与验收边界 | 证据闸门 / D6排除 | 最终真实E2E归属（组内分支） |
|---|---|---|---|---|---|
| BIZ-R05 联盟商船补货/应聘船长 | W09；W14舰队占用与W02目录 | 目标surveyAlliance、surveyFleet与BusinessExecutor；参考guildShip survey/view/plan | 商船/crew身份、货物需求、英雄船长资格/空位、补货/应聘各自plan/verify；同物品和英雄UID共用预留；不能把港口cargoFill等同GuildShipOrder | GuildShipOrder/GuildShipSeek客户端完整body/资格/费用与权威复读来源；钻石补货/买位分支排除 | 联盟E12+舰队E17/E18各增加补货与应聘分支 |
| BIZ-R07 装备厂制造/收取 | W07；W04工厂状态/W19历史 | 参考surveyEquip/planEquip，目标city survey/Ledger/Operation | MakeEquip与PickMadeEquip独立适配；部位/配方/队列/材料/装备实例权威复读；收取未确认不得继续制造 | 普通配方材料可做；universal参数的真实语义须核验，不能默许用钻石补料 | 英雄高级E09增加制造/收取和UNKNOWN分支 |
| BIZ-R08 海兽培育/投喂/成熟收取 | W07独立子边界；W02/W19 | 参考surveyPet/planPet；现有AllPet读取、原共享executor | 补海兽领域survey/plan/verify，不挤进英雄大函数；PetBreed/PetFeed/GetMaturePet分开确认，队列/品质上限/素材/实例UID共享 | 普通材料/金币来源有据；付费补料或未知universal成本阻塞；不得因无C号删掉此能力 | 英雄高级E09增加海兽三种原子动作及重启恢复分支 |
| BIZ-R09 除C225–230外的装备/徽章精炼、升星、穿戴等参考分项 | W07；W02/W19 | 参考heroGrow实际已定义的plan分支；目标planHeroes及Ledger | 按原Inventory消息列逐项拆明PutOnBadge/BadgeStar/EnhanceBadge/PutOnEquip/EquipRefine/EquipStarUp等；共用同一Hero adapter，不另造执行器；实例转移和不可逆消耗精确授权 | 仅纳原清单实际描述的分项，分解等未列新需求不得顺手扩域；付费补齐排除；缺成本/归属阻塞 | E09内按原子分支列检查清单，不以六C通过代替其余分支 |
| BIZ-R10 挂机/邮件完整依赖计划 | W16；W19 | 原ACTIONS、planLoot、参考surveyIdle/planIdle/runIdle；目标runTasks | 有限收益确认→明确升级准备/API/UI已接原Workflow；固定原来源及成本，不预测新区间，各步独立复读；完整邮件及其他实例结算仍缺，UNKNOWN不续写 | 普通收益零支出/区间UID且金额不预估；升级逐档挂机徽章、主线门槛、资源/UID父预算和独立精确净扣；广告/付费替代禁用 | 基础日常E15保留分页、收益→升级依赖、无资格/已领分支，真实未验 |
| BIZ-R11、PRO-009 世界宝藏货轮完整业务 | W14独立TreasureLoot子边界；W15观察/W19历史 | 现有surveyTreasure/planTreasure/verifyTreasure与fleet事实 | 保留已做无争夺派舰；补按原世界宝藏语义所需争夺结果/目标归属/次数/奖励闭环，分别确认派遣、服务器结果、目标状态和奖励；不能用派遣分配成功替代抢占成功 | 赛季/次数/战斗模式、返回身份和权威战果/奖励来源先证实；不复用主线LEFT；钻石购买次数排除 | 世界宝藏E24内拆无争夺、争夺、有/无奖励、同目标竞争与UNKNOWN |
| BIZ-R12、BIZ-R12a 城战在线免费奖 | W14；W19 | 原fleet维修/移动；参考claimWarOnlineReward | 补在线奖励资格/服务器时间窗、GotWorldOnlineRwdRequest→GotRewardResponse正确关联、空奖/已领停止；与攻城/移动合同分开，非普遍任意领奖接口 | 在线资格和权威领取标志缺失先证据闸门；免费在线奖不属于D6排除 | E18增加在线免费奖资格/空奖/重复/超时分支 |
| BIZ-R14 工厂独立视图、自选材料包覆盖 | W04；W02/W19 | 当前cityView/productionShortages/production policy；参考packCoverPlan/exchangePacks | 补包内候选覆盖算法、白名单包资格/持有量、SelectPack参数/消耗/新库存双证据；独立工厂视图共用原city链；不能自动打开全部包 | 包本体与目标材料成本需可靠；免费持有包使用不自动排除，购买缺包/付费替代排除 | 城市生产E05/E06增加有限自选包→排产依赖和UNKNOWN不排产 |
| BIZ-R15 漂浮物拾荒、礼包码领取 | W16；W04海面读模型 | 参考pickUpFloater/giftCode；目标runAction/BusinessExecutor | 真实floaterId/过期/拾取复读；礼包码trim且不误改内容，资格/返回/奖励权威确认，禁止日志记录不必要秘密；均注册具体函数 | 不伪造Diving奖励或floaterId；真实客户端/本地协议来源先核验；付费礼包购买排除，合法免费礼包码属于范围 | E15增加拾荒/免费礼包码有效/已用/过期与UNKNOWN分支 |
| BIZ-R16a 农田专用状态解析 | W04；W03可信数据 | OnWater原始、参考farmOf | 恢复farm产物/成熟时间/autoFarming/地块身份，失败不变零，纳现有surveyWorld领域投影 | FarmlandPlantCfg与原字段来源/单位先确认；不重复48查询 | E06增加农田状态/未知/跨日分支 |
| BIZ-R16b 农田成熟收取 | W04；W02/W19 | 参考farmHarvest、现有runWorld/BusinessExecutor | 现有合同只发送单地块buildingId数组；明确多田准备有限逐田图，固定剩余来源/UID；逐田成熟资格、typed回执及独立完整库存净入确认，批量协议结算仍冻结 | 收取数量单位是地块，不编造真实奖励件数；无可靠库存变化则UNKNOWN | E06保留成熟收取、多田累计UID/错地块/来源变化/UNKNOWN；本批仅离线，真实NOT_RUN |
| BIZ-R16c 农田种植/供给 | W04；W02/W19 | 参考farmPlant、原ResourceLedger | 明确空田或成熟田及每田下一作物→初始足额种子预留→原单田授权/净扣确认；再播种须同五维私有已确认收取历史和实际EMPTY匹配，固定所有剩余来源/成本，拒绝或UNKNOWN停止；尊重autoFarming，不改游戏开关 | 普通种子材料有据可做；付费补种/钻石加速排除；种植权威状态需确认 | E06保留明确多田/混合作物、初始种子总额/累计预算不足、来源变化、UNKNOWN/取消及重启；本批仅离线，真实NOT_RUN |
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
| PRO-001 科技重置 | W10独立子边界 | 固定v76 GuildTechPop._onBtnReset为空实现；ResetGuildTechRequest/Response类型存在，但资格、费用、返还及等级结算均未证实 | 原清单重置保持BLOCKED_EVIDENCE；原Alliance视图/Function Contract明确resetTech缺证，升级仍可独立执行，不按协议类型推断免费或资格 | 免费/普通材料路径保留原范围；未知成本不派发，仅付费路径按D6排除 | 本行所在提交（父c73a35f）：alliance-tech/alliance/function-contracts/gameplay-api四文件103/103 PASS，0 fail/cancel/skip/todo，9.05秒；伪造reset不规划/不验证/D6拒绝，原升级回归；未运行R7/R8，E13原验收保留 |

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

工作包是对16产品模块的依赖拆分；同模块可跨阶段施工。下表保留原范围和DoD，不是第二份进度表。New Functions为当时接口意图，顶部W/§7和附录A已确认的Symbol直接复用，禁止重复实现。所有DoD继承D1–D9及第12节治理；任何证据闸门未关闭不得用模拟成功标成真实语义已实现。8.1原Inventory子项是默认完整范围，以下各包逐项接纳，不再另问是否开发无C项。

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
| New Functions | 原execution-memory与History关联查询已实现，继续全入口接线，不创建新Store或数据库 |
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
| New Functions | 复用原Workflow runPolicy/Runner/Store和事件来源，只补原缺口，不新建scheduler或任意JS |
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
| Definition of Done | 全部W01–W21工作包DoD与外部证据关闭、集成定向检查和离线验收准备完成；冻结待R7验证提交树及资产；R7全量PASS为最终离线验收，不作W22前置条件；R8具体请求/预算届时生成 |

## 10. 依赖DAG、完整顺序与连续开发规则

### 10.1 八个执行阶段

| 原R阶段 | 工作包/原阶段来源 | 依赖与完成标准（不另设审批） |
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
| 异常停止条件 | UID被占/归属变化/缺语义不做；UNKNOWN冻结该实例及预算。BIZ-R07准备须按闲置＋在产计数、不计佩戴，明确允许配方及同量顺序；原队列/数量变化、收取拒绝或UNKNOWN不得进入制造；父预算不足不因收取扩额，执行不动态换配方 |
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
| 前置状态 | 每子场景指定活动/任务/period/奖励ID与资格；扫荡quota可靠；免费/已有权益；普通AFK须明确等级/区间并依可信61秒门槛，等级奖/升级/任务领奖独立；有限收益→升级须原来源/固定自有成本/父预算与总期限，准备不派发；礼包码等独立范围 |
| 请求 | 原命名驱动；VIP真请求而非MonthCard；Week/军备按已确认链；幽都驱邪/罗盘/敕令/签到分开 |
| 预期Response | 实际typed/push逐项；周活跃箱不能代周活动，码兑换无对应typed不猜 |
| 预期游戏状态变化 | 扫荡扣次且目标变化；邮件附件已领；VIP/包/任务领取标志；活动进度；AFK先领取再升级；招募/点金结果 |
| 资源变化 | 次数/券/道具/GOLD/奖励精确核；所有RUBY/付费负分支派发0；扫荡与日常共用额度 |
| 权威复读方式 | DailyTask/Counter/Email/Vip/Week/Season/活动专用读源及物资；每条事件标period。普通AFK专用新区间与完整库存/徽章/英雄独立净入，调查区间围栏；其他实例及断线回执未知不重放 |
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
| X02 订单金币 | 基础金币配置预览和事后关联已有；最终加成、取整和事前总金币公式缺，MIN_GOLD保持未知 | C124/W04；MIN_GOLD条件保持UNKNOWN，不默认为0 |
| X03 免费刷新 | 真实生产来源缺免费eligibility/quota/cooldown，proofFor合成测试不是来源 | C126/W04；SUBMIT独立可继续，REFRESH无证不发 |
| X04 Museum结算身份 | 两请求均必需stageId（非空）；Complete结果只传临时弹窗且无结算ID，MuseumInfo无同次结果、pending领奖或收据；缺断线后可恢复独立来源 | C144/W11局部冻结；到期、库存变化或expedition消失不证明原结算/领奖；原页面夹具失败已修复并定向通过，不能据此开放写 |
| X05 Fishing全链 | 等级、库存、容量和图鉴门槛只读已有；DrawFishReward无档位条件，GainBigFish缺可恢复pending身份及过期来源 | C152/W13；图鉴不可替代当前任务 |
| X06 联盟真实限额与赛季 | 联盟订单、福利、Fort和商船子集已有；帮助总额度、冷却、Ask阈值次数和权威周期缺 | C303–305/W09；分配字段/配置不能由用户输入伪装权威事实 |
| X07 稳定目标定位 | 当前WorldInfo范围有限；跨视野稳定ID、更新范围、消失/移动来源及跟随含义 | C405/C410/W15；只读过滤可用，不能声称全局跟随 |
| X08 攻击与模式结果 | 移动、宣战、参战资格、保护/地图油费、模式专属side/result、胜负与收益 | C406/C410及PRO005/STG017/W08/W14/W15；保持SIDE_UNVERIFIED，主线LEFT不外推 |
| X09 D6内舰队加速 | 舰队非premium道具加速合同未闭合；贸易自有指针SPEED已有不证明舰队加速；钻石D6拒绝 | C408/W14；若只有钻石路径，记录D6排除及产品阻塞，不制造合法路径 |
| X10 周/军备活动身份 | 三类周免费包、具名周芯片任务及开服排行窗口观察已有；本批type1–4任务明确score单档受控领取含独立库存结算，未推导排名奖励或完整军备。周活跃、换轮末任务、完整军备与周期归属仍缺 | C514/C517及C515/516补链/W17；过季保留fixture，全部真实分支仍未验 |
| X11 Fleet非零Pet | OnWater宠物绑定/舰队归属精确字段、UID与完整保存复读 | C402受限分支/W14；已有无非零Pet编队不重写，不能把原需求自动缩小 |
| X12 联盟商船/Fort | 单船补货、应聘船长和Fort普通捐赠已有；商船收益补购、隐藏跨玩法占用及Fort其余操作未全 | BIZ-R05/PRO002/W09；cargoFill不等GuildShip、Aid不等Fort |
| X13 装备厂/Pet/其余养成 | 锻造MAKE/PICK、明确允许配方内按部位数量准备、Pet FEED/服役单级LEVEL和成长子集已有；通用成本、培育成熟身份、替换未激活及完整实例结算缺 | BIZ-R07/R08/R09/W07；只迁移纯算法和明确分支，不能搬独立预算/客户端 |
| X14 农田/包/委任 | 单田种收、明确多田有限顺序种收准备、委任减时水位/种子作物投影和明确自选包已有；批量协议结算/全天覆盖缺，预测不入库存 | BIZ-R14/R16a–h/W04；水位是用户策略，非服务器事实；包不明不自动打开 |
| X15 其他阵容/藏品 | 普通图纸解锁、整队预设、极限复制、远征阵容和古董成长子集已有；其他模式、科技重置及完整范围未全 | FRM005/PRO010/PRO007/PRO001/W08/W10/W11；具名队伍是可设计本地合同，非猜游戏专用请求 |
| X16 世界宝藏/资源田 | 派舰后争夺/占有/战果/结算奖励、赛季/次数、资源田占领/放弃权威身份 | BIZ-R11/PRO009及原资源田/W14；派遣成功只确认派遣 |
| X17 免费日常增强 | 邮件有界枚举/单封普通附件、挂机等级奖励、明确普通物品/徽章收益、其后明确1/5/10级升级及免费招募点金/试炼已有；有限普通收益→升级准备已接原API/UI/Workflow；其他实例收益、实例附件/VIP/订单档/拾荒码/在线奖缺 | BIZ-R10/R12a/R15及原子Action/W14/W16；不创建任意领取接口，不自动转付费 |
| X18 季节活动局身份 | 可信签到前置观察已有；完整目录、日界资格成本/领取复读及幽都敕令等局身份仍缺 | BIZ-R17a–h/W17；缺答案不随机作答，未知开局不重复开，未遇真实活动不标已验 |

不沿用旧快照14项BLOCKED_EVIDENCE汇总数，冻结按当前需求行和具体操作判断。X01–X18是一组或多组需求共享的证据任务，不能相加计算新需求。缺证据不删除原ID，不把NOT_EXERCISED改通过。只有外证阻塞的子分支停止，已有合法依赖与独立模块继续施工。

### 12.2 风险与处理优先级

统一运行时合同已有保护，后续必须维持所有者/身份/授权/父预算/持久化/独立复读和UNKNOWN零重放。风险集中在缺证领域错误外推、旧入口绕行、日界/收益/结算身份不足、资产来源缺口及历史离线证据误标当前真实通过。按变更范围定向验证；原1000ms心跳失败证据保留，无因果证据不放宽。全范围冻结后统一R7，R8另授权。

### 12.3 Owner决策登记（本轮不请求真实操作许可）

| ID | 审阅点 | 路线图的默认处理 / 需要决定的边界 |
|---|---|---|
| O01 全产品范围与计数口径 | 原95C、全部原Inventory目标与参考子项、42P及8S均纳计划，273不作为独立需求相加 | 默认完整范围，不要求逐个无C项再次批准。仅全新未在原资料中的需求另列变更；本轮不自行开发 |
| O02 无权威全量日报 | 若X01证实服务器/客户端无法提供完整全来源日量 | 保留C112未完成；可由Owner明确将需求改为工具确认产量并调整基线/DoD，不能默默把partial当完成 |
| O03 只有付费实现路径 | X09或其他具体分支若证实仅RUBY/付费 | D6不可解除；Owner可接受禁用描述及明确范围排除，或保留产品阻塞。H确认不能让付费合法 |
| O04 自动化产品合同 | 原需求含自动切阵/日周/重复运行，现有每ACTION暂停授权 | 已实现并保留逐批模式和有限run合同：账号、能力白名单、具体策略、期限/最大轮次/时长/资源累计上限、撤销与重启不续；不授无限未知动作许可。沿用原实现继续接线，不等逐项审批 |
| O05 部署写所有者 | 当前是本地Console/NAS文件 | 已实现单Console所有者及独立CLI写拒绝，沿用原fence；若要求多服务并发，先调整W01为租约/fencing/CAS并重新评估依赖 |
| O06 “极限通关”复制源 | C215可信源调查映射和准备复制已实现 | 复用原extreme-formations API/专业页与Formation链；缺英雄或未知模式保守拒绝，不重复实现复制源 |
| O07 最终真实验收范围 | R8具体账号、目标、次数、预算、不可逆动作、恢复/清理、活动可用窗口 | R7通过后生成当时新鲜候选的具体清单，再取得一次统一验收范围授权；本报告与历史过期许可不能代替 |
| O08 过季/未自然出现异常 | 活动窗口、真实败北/限频/账号失效/UNKNOWN可能无法安全重现 | 离线故障证明照常完成，真实状态保留REAL_UNVERIFIED/NOT_EXERCISED；若Owner接受阶段性交付须明示保留项，不能称全场景真实PASS |

以上决策供Owner审阅总计划，不是让开发每个页面停等批准。已有明确范围的普通实现按DAG连续推进。证据确实无法取得/必须调整需求/要真实账号操作时，才停止受影响分支提出具体事实与可审阅选项。

### 12.4 可连续交给Codex的施工合同

2026-11-16 本批续接e1012c0：保留已交八类目标，集中补Museum现有业务专业目标、生产/Museum精确候选参数、原生Workflow参数同步和选择失效、任务原解析ID选择、罗盘原窗口活动选择、Dailies精确扫荡低等级确认。只改原Function投影和原页面，不新增请求构造/成本/结果验证/执行体系。R7待统一补覆盖：普通/固定材料来源兼容，Museum各目标和空陈列/未知来源，Workflow旧参数/旧选择失效，任务种类/周期隔离，活动来源失效及只读零写，扫荡确认清除，以及Service/父预算/History/UNKNOWN和完整离线模拟。本批未编写或运行测试，仅静态编译/diff；全范围未冻结，继续原DAG，不进入R7。 后续父fcc2aeb批次继续W05/W18及生产/Museum的原生Workflow同源观察表，专业候选参数细化要求重新调查，原账号/视图/编辑代次旧控件保护补齐。仅原页面与账本，未运行测试；R7统一覆盖已列各领域投影、缓存失效及执行链，当前不进入R7。

2026-11-16 Owner续跑修正：跳过驱邪BIZ-R17a，不再恢复默认账号文件（Owner确认此前有账号，随后明确无需恢复；事故事实保留，未恢复）。先集中实现其余有据功能，之后统一离线测试，全部通过再完整离线模拟；未运行测试不得标PASS/离线已验。驱邪本轮未提交Adapter/注册/D6/UI及相关公共改动已全部撤回，既有罗盘不变；不扩大跳过范围至其他玩法。本批P8-1复用原Function元数据提供安全默认草稿，专业页与Workflow三核心入口同源，不新增API/存储/执行器。16项用例已写待跑，不作为R7或R8证据。本批父1262f29后继续P6-1/C501已知活动目录元数据，19类白名单与原festival/openRank分工；同一私有来源、原48项采集、日常/总览API及页面贯通，恢复缓存与五维/Client变化未知。目录用例已写未跑，不标实际资格/完整目录或离线通过；后续本批P8-2补原计划身份确认：原Service调查前五维身份进入既有摘要哈希和History，三入口仅显示该计划绑定值与期限，不借实时页面补旧身份，不增授权接口/执行器；11项用例已写未跑。随后父37e9ef0后补原计划资源对照：复用resourceBudget和safeResourceQuantity，不复制成本器/预算器；只公开成本涉及物资，哈希及History同源持有/预计余量，不计奖励、不扩权限，19项用例待跑。随后父6467041后补P3-6/7原装备目标表单：五种原动作同源heroId/uid/action，英雄切换清UID，穿戴仅idle、成长仅本人佩戴，留空仅调查该英雄，未知/重复来源及配置/参数/账号/视图变化旧控件不改草稿；22项用例待跑，不新增玩法或装备替换。下一项继续原W21/W17尚未覆盖且有据能力。

按原DAG连续集中实现依赖已满足的能力及集成，不逐小功能运行测试或提交；关联实现批次及恢复交接可本地提交。具体缺证记原C/W/X后冻结，立即继续独立能力。只维护顶部W和当前需求表，不新增Gate/编号/报告。禁止真实连接、读Token、MITM/CA、push/merge/reset/rebase/clean。原DoD和完整交付条件保持：全范围与API/UI/Workflow/预算/历史/生命周期闭环，R7全量离线和单独授权R8；未验不标通过。

ecbcfa2已按10d0d95完成文档对齐；e4d6d0e收口逐田收取确认后再播种；0712db4补齐原生产单步完整库存精确配方净扣与单份结果验证；c2ac68a接入明确单包兑换后固定工厂单份生产；dc00d29扩展同一入口至2至23项有序兑换，每步原授权/历史/预算，最终生产要求全部连续结算；f0f14c5将指定配方实际缺口的白名单自有包覆盖建议接同一prepare/API/生产页。52b5f34补原独立工厂视图及显式库存来源标记；31164c1在原overview组合dailyChecklist/数据目录缓存；本人联盟交接切片（本轮父d212557）完成P1-5本人联盟显式调查缓存与逐来源只读总览，原Service事实/视图/五维来源成套更新，缺失及身份变化未知，不增加Collector查询、业务请求或许可。M16/C95/P42/S8/Inventory273及原名称精确保留，分类未变；R1–R6与全部M/W仍PARTIAL，R7/R8 NOT_RUN。a93acb8后dacd718修正Museum关卡目标与结算身份的区别；b6edb78/8869553/ba72763/3b52410完成普通挂机收益、三入口、明确升级及有限组合；0421d9b/10d0d95完成明确多田收取/空田播种准备。对应定向结果见顶部W行，历史通过不算本轮测试，更不代替R7。原Loop/Tasks/Dailies、父预算/持久History、拒绝/UNKNOWN、7类事件和三类具名WAIT已接，继续复用。

下一批按现有依赖推进；以下为原W项内的实现顺序，不新设工作包、阶段或审批：

| 原工作包/范围 | 下一项可执行工作 | 完成边界与依赖 |
|---|---|---|
| W21/W09 — P1-5 | 本批本人联盟显式调查缓存摘要已交，保留原完整范围 | 成员/科技/订单/商船白名单历史观察复用原Service；普通和商船调查各自覆盖；缺源、失败、五维或原client变化未知。原活动完整目录及写缺证保留，不重复本切片。 |
| W21/W14/W15 — P1-4 | 本批有界舰队/世界历史观察已交，完整地图及原写缺证保留 | 原Fleet六查询保持；总览只消费五维/client绑定缓存，逐源失败未知，资源田窄调查不补舰队/世界来源，不推导资格。定向结果见W21。 |
| W19 — Tasks | 本批总览每日/成就也复用原共同计数；本批原主线摘要资格及五维/Client失效已收敛。原兼容写、Tasks/日常只读解析及缓存保护已交；本批含战令在内全部15种已支持任务目标的只读入口和持久历史同源，原更广范围仍PARTIAL | 复用原validateTaskRewardsParameters，三入口显式observe仅SURVEY，旧每日格式及旧历史兼容；表单类型来自原Contract，周芯片保留round/taskId，开服四模式各自保留score tierId，不混主支成就与每日身份。原账号/角色/世界/连接/代次/Client隔离不变，不存资格、原始状态、配置、奖励或许可。默认领取及Service授权/预算/History/UNKNOWN链保持。本批共同taskTarget完整整数守卫已交，1092条固定目标等价；未知配置不截断、不强转为资格。通用冷却/日界仍缺权威领域策略，继续原DAG有据能力。本批免费赠礼另复用原dailies只读helper，旧格式观察与完整写证据分开，无新请求/注册/执行链。批量招募不改变Tasks只读解析或统一观察合同。 |

2525e7c补原W14/PRO-009派舰完整库存精确汽油净扣；本批继续将同一完整库存来源和差额算法用于原Fleet维修/移动资格及结算，旧字段兼容和免费同盟移动保留，未新增玩法、成本或执行链。定向证据见顶部W14。本批原P3将AFK三类及planWorld七类等价请求复用ACTIONS/buildBody；资源田放弃在现有代码已收敛，不重复改写。批量建筑收取和两类加速在本批收敛，保留两种ID输入语义及原用量公式，超范围零预留；本批已补城市加速完整库存精确道具净扣，原单份生产改复用同一差额算法；本批已补原建筑/工厂实际移除量与完整库存精确净入，保留部分收取；本批已补原建筑建造/升级精确配置材料净扣，保留原零成本及即时/在建状态；本批已补原订单需求材料精确净余额及只读等待库存同源：普通材料与同输入typed返还按原stockMatchesDelta核验，资源输入缺可靠typed奖励不确认；材料证据经原verification持久化，奖励诊断保持独立，不能称完整奖励结算。最终金币公式原缺证继续冻结；本批原农田收种接同一库存与差额实现，保留canonical-only及更严ID、原成熟时钟与typed凭据、非目标不变，冲突别名未知。本批原联盟通用调查也接同一库存资格来源，旧别名与逐源部分观察保留，冲突/碰撞不授写资格；原商船/Fort合同不改。材料包已使用公共解析，不重复施工。本批原单级科技验证接公共精确差额，并要求其他库存及非目标已研究科技不变；原零级缺行语义保留，异常通过原History持久UNKNOWN。本批原Pet升级/投喂的两处库存净扣循环也复用stockMatchesDelta，原成本/目标/成熟时钟/非目标状态和UNKNOWN恢复合同保持，不新增培育/领奖。本批原Pet四查询增加普通培育只读条件来源及API/页面，专属基因/GOLD/配置时长、赛季与库存/队列独立观察，不产生培育动作或许可。固定客户端已证明普通成本与universal=false，但PetBreedRequest没有建筑/队列目标，同次结果恢复及随机品质仍缺证，原培育/领奖局部冻结。本批W07装备等级/精炼/单星/空槽穿戴及徽章等级/单星的完整库存验证也复用stockMatchesDelta，删除两段重复净扣算法；原独立业务成本、目标/非目标状态和UNKNOWN恢复保持，最后一份耗尽的省略物品行兼容由原执行链及Codec验证，结果见顶部W07。随后本批原W06/W07/W11锻造、古董成长/套装/精通/兑换及英雄专武/碎片兑换也复用同一stockMatchesDelta；删除独立净扣/净入循环，原成本来源、目标身份、状态/typed凭据及UNKNOWN保持。13文件579项定向结果见顶部W07，不改变功能分类或开放原缺证写。下一沿原DAG推进其他有据能力，不猜测奖励或新增执行链；原占田仍未等价迁移，不能由构造收敛推导可执行或完成。

本批竞技场静态证据仅确认前十次挑战奖励来自ArenaParamCfg[每日挑战奖励]及ArenaUtil.challengeReward；点数检查仅>0不推定扣1，独立战报缺玩家ID，不推定同次对手/结果。ArenaChallengeRequest移除无证通用成本白名单，旧Driver只读与原统一执行链保持；缺证仅冻结原BIZ-D05。

40bf092的BIZ-D02明确单券复用原free-recruit Function，heroRecruitCosts同时供旧日常只读建议；固定HeroRecruitItem._recruit/RecruitUtil.needRecruitItemNum证明RECRUIT_SINGLE单券且不足只打开来源提示。只接受显式单次，不从免费不足自动转券，不猜招募计数、周期或luck公式。原API/专业页及有限Workflow复用同一Service/预算/History，冷却标记须保持可信未来，完整库存精确净扣并验证typed英雄/碎片净入；UNKNOWN/拒绝及重启零重放。该切片40bf092的定向证据见W16。随后仅离线核实BIZ-D07：同一固定v76包的DiscountShopItem（字节1713031起）实际购买分支使用floor(price×discount)及Resource.RUBY，再发仅id的DiscountShopBuyRequest；DiscountShopPanel同样显示钻石资源。当前路径没有金币/自有材料支付选择，不将商品为普通物资推导为允许的普通币支付。原最低价建议及D6硬拒绝保留；此为业务事实补记，无新代码/测试/真实操作，前批394项已覆盖原折扣建议和D6，不另累计。继续原DAG其他依赖已满足项。 d6cedc3继续同一Function的显式10连/50连：固定HeroRecruitItem._recruit与RecruitUtil.needRecruitItemNum证明way3/4分别扣10/50张；批量分支独立于免费选择，保持原观察marker且仍要求可信时钟。精确回执条数和英雄/碎片汇总净入、完整库存扣券与其他状态独立复读；专业页、Dailies及Loop日常声明仅改草稿并重新调查授权，父预算/UID/持久历史/UNKNOWN零重放保持。广告、潜水及补购仍局部冻结；普通古董招募由下文本批统一合同覆盖，定向结果见W16，其他原范围不变。

本批在daae6b6私有活动窗口来源上完成原W17/C517开服战争type4任务score单档子集：固定OpenRankWarPanel/OpenRankTaskItem/OpenRankUtil证明id=score与当前季精确否则最大配置季；沿原task-rewards Adapter/Function/Service/预算/History，不新增执行器。OpenRankInfo进度/完整已领列表、同一私有窗口及可信Ping须共同支持资格；无专用领奖响应，仅独立复读的唯一score新增及完整库存精确净入确认，异常UNKNOWN且不重放。原Tasks/Dailies/Loop声明和专业页/API复用同链。定向证据见W17；C517由PROTOCOL_ONLY改PARTIAL，95C为53/39/3，其他原ID/分类不变。下一沿原DAG核对剩余有据业务，通用冷却/日界、排名奖励及完整军备缺证局部冻结；不重复Task只读解析或已交活动窗口，不以本子集代替完整C517。

34a5498已交普通古董四模式，原Service/API/专业页/原生Workflow及日常1002隔离保持，不重复施工。本批继续原W16招募累计任务，只读复用RecruitData、原日常有序配置季节选择及已有RecruitInfo调查；task.times、逐档达标、gotId已领记录及实际到账分开。固定RecruitTaskItem/RecruitUtil与本地Codec证明两类GotRecruitTask请求均为空、共用响应仅gotId/reward，未证明单档/赛季条件和恢复归属，因此累计领奖局部BLOCKED_EVIDENCE，不建立请求构造或第二执行链。API/专业页只展示同账号/角色/世界/连接/代次的当前观察，未知/陈旧/迟到/重启副本不授资格，不增加查询或持久许可；原招募/任务写链保持。随后原W17/C515只读核证WeekBattlePassFinishTaskRequest明确taskId，Response.score由固定WeekBattlePass客户端直接替换为累计总值，不能当本次增量；Info保留taskId/progress/isGot与score/got/activePay各自语义。WeekInfo.activityTime虽有period/startTime/endTime，尚未证明每日任务周期与重置边界，故该写局部BLOCKED_EVIDENCE，不以本地日历或普通每日任务resetTime补齐。继续独立S6资源变化事件，无新增战令动作或许可。

本批原W20/S6资源变化事件接原Client连续连接流、有限Workflow/Service和现有API/表单，资源ID复用ResourceLedger枚举；SCUpdateResource.list.amount为替换余额，首次未知不补零。新明确增减且达到指定阈值才触发原调查，完整精确int64与200条游标边界、列表整包拒绝、五维/迟到隔离、原单次/有限授权、父预算及持久UNKNOWN保持。推送不作为成本、收入利用或奖励证明；本次不加请求/执行器/注册表/调度器。本批12文件2307项与后补重启1项全部通过，结果见顶部W20，不重复累计。随后本批W17/C515战令只读已复用原task-rewards与WeekPassTaskCfg：只读两请求，精确int64沿用tasks解析，不套主支线taskTarget。任务isGot与got(stage/freeGot/payGot)分开，score为累计总量；无候选/写构造/许可，写及周期缺证继续局部冻结。三入口观察、API/专业页和原持久历史测试见顶部W17。随后本批将type1–3具名任务score档位接原type4共同Adapter：Order/Stage直接表，Pirate/War当前季精确否则最高配置季，按同模式私有窗口/Info.endTime和可信Ping授资格。唯一请求构造器/Service/父预算/独立完整库存净入/UNKNOWN链复用，API/专业页与三入口同步，type4拒绝身份不变；排名奖励、完整军备及宝箱打开不支持。随后本批原BIZ-R17a–h子活动只读片段复用私有SCAllActivity和dailyChecklist：类型11签到活跃、28罗盘score/claimedId、30驱邪killTotal/claimed/alive按同一父活动ID及独立子类型解析；类型29只有窗口，敕令会话保持UNKNOWN。总览/日常页共用原值表，API不新增查询或写许可，缺字段/重复身份不补零；完整目录及领取仍未交。固定客户端尚未充分证明仅activityId累计请求的任意选档/下一档或聚合范围与恢复归属，不根据参考脚本说明推断服务端事实。随后本批BIZ-R17c明确活动/自有铜钱1/5/10/50次复用新领域Adapter与原Registry/Service/预算/History，原Gameplay API/专业页及原生Workflow/有限Loop通用world入口闭合。固定v76类型为捞尸人联动活动，不把历史youdu同名自动视为全部等价；完整旧策略保留。独立Info与逐抽配置回执、完整库存精确结算；pity仅原值，满外环与跨轮未知、累计领奖/补购保持冻结，不自动重放。定向结果见顶部W17。继续原DAG其他有据能力，不重做已交Tasks或窗口；全为离线REAL_UNVERIFIED，R7/R8 NOT_RUN。

本批W16/BIZ-R15固定客户端BuildUtil.floaterCfg查GarbageProductionCfg，FloatingManager按num生成同种对象，WorkerState的PickUpFloaterRequest重复种类ID表示多个且响应deniedFloaterIds需独立处理；WaterModel仅做本地减数，不能替代服务器结算。当前只交OnWater采集时的种类/数量与配置类型/产物观察，缺字段/重复身份未知，原五维/Client缓存绑定复用；推送不补当前资格。过期及同次结算/恢复归属未闭合，普通拾取写与礼包码分别局部BLOCKED_EVIDENCE，不从配置production或通用奖励猜实际到账。本批总览每日/成就计数收敛已交：原source及详细视图共同计数供game.summarize使用，完整旧格式不变，坏/缺失/重复状态UNKNOWN，不能把完成/门槛/到账合一。本批已修正原overview.claimable.mainTask存在即1：复用原主线配置目标/资格，资格摘要走原任务缓存绑定，日常按原reset失效；不重开写。Owner已明确跳过W17驱邪BIZ-R17a；继续原DAG其他有据能力，具体缺证仅局部冻结。

本轮真实测试失败说明：1b6fcbf的Explorer测试新增静态领域导入早于CW_DATA_DIR设置，accounts模块提前绑定默认目录，合成账号写入data/accounts.json；随后并行测试在该文件rename上报EPERM。已将领域导入移至测试env设置后，新增DATA_DIR等于sandbox的硬断言；重跑441项通过且默认文件元数据不变。仅列默认data元数据，账号文件当前700字节、创建/修改时间2026-11-16 12:29:53，另gameplay-settings.json仍为11月13日；未读取凭证内容、未建立真实连接。无法据此确认旧账号内容是否曾存在或已恢复；已向Owner询问该文件原用途及明确备份/快照位置，保留文件，不擅自删除/恢复。Owner后续确认此前确有账号，随后明确无需恢复；恢复事项按其决定停止，当前文件保留，未声称原数据恢复。其他独立开发继续，不新增Gate。

W19/C604/C606通用cooldown/gameDay仍缺各领域权威策略来源，policyCoverage保持false；不以本地时间、WAIT或工具历史解除拒绝/UNKNOWN。W14/BIZ-W15占领、W07替换/培育或成熟领取、W18目的港报价、W11/C144结算、W03切服/地图、W04全天量/最终金币/免费刷新、W09互助、W12奖励/日界、W13捕鱼及W16/W17周期等原缺口全部保留；没有新业务来源时不反复审计冻结项，继续原DAG其他独立能力。所有原范围完成并冻结后统一R7，再生成E01–E24具体R8授权清单。

### 12.5 文档对齐提交1536835的文件边界与校验（历史）

本轮仅修改README.md、docs/PHASE_4_RECONCILIATION.md及本文件，不新增玩法、源码、测试、编号、目录或报告。原5份未跟踪输入保留。当前表覆盖M0–M15、95C、42P、8S、273Inventory及原W/R/E/X；文档校验与功能测试、真实验收分别记录。本轮不重跑Node全套，不把历史PASS累计为本轮测试。最后提交为本行所在文档提交（父fc68c50）。实际静态校验PASS：M16/C95/P42/S8/Inventory273、原W22/R8/E24/X18、原ID和能力名保持、135个源码/测试路径存在、5份原输入指纹不变；git diff --check通过。离线静态导入确认26模块/27合同/48查询（28解析、20原始），未创建Client/Runtime。

## 附录A — 原Inventory 273项源码索引（原对账a93acb8；本批限定增量见§2及顶部W）

本表按原文ID行顺序保留273项；它们是函数、数据、工具、参考子项、协议族的不同粒度，并非273项独立产品需求。原始95个Cxxx按主表计数；非C项按完整Inventory默认纳入对应工作包；Owner只裁定语义冲突或D6无允许路径，不默认移出交付范围。`EXISTING_FUNCTION`仅指该行标题所述Function存在，UI/API及端到端缺口另看profile和覆盖；PARTIAL不继承原报告结论。所有行必须与以下12维profile连读，行内缺口优先覆盖profile。

| Profile | 1 Function | 2 调用者 | 3 GameClient | 4 API | 5 UI | 6 校验/权限 | 7 Ledger | 8 OperationService | 9 ExecutionHistory | 10 取消/超时/迟到/UNKNOWN | 11 离线测试 | 12 真实游戏 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R | 行内状态 | collectState/server cachedClient/对应survey | 读链；缓存浏览不发请求 | 既有GET/显式refresh；条目内只读边界 | 总览/Explorer/既有业务预览；非独立写页 | 账号scope、READY/缓存可靠性 | 读能力N/A | 读能力N/A；Phase3survey可经operation管理 | 只读无业务执行历史；采集outcomes保留 | GameClient读取消+generation；失败不当零数据；无写UNKNOWN | tests/data-catalog,explorer-api,server-runtime,snapshot-precision,data-safety；实际条目专项见主表 | REAL_UNVERIFIED(1495e48)；旧4094a69+未提交工作树历史48/48 REAL_VERIFIED，后来纳入61ce3c0；PHASE2首轮10项只读查询历史见§4.4，不外推当前完整48项 |
| L | 行内状态 | server/page本地配置/纯计算 | N/A：不新增游戏请求 | 对应本地GET/POST或页面纯交互；不是任意写API | 既有配置/预览/日志页面；缺口行覆盖 | 精确账号、结构校验，敏感本地变更确认 | N/A，纯规则可接账本见行 | N/A（本地配置/展示） | N/A或仅读取；不得称写执行已留存 | 页面account+generation；本地错误显式 | tests/account-view,order-rules,order-rules-store,order-rules-api,order-rules-view,data-safety | REAL_UNVERIFIED；本地UI离线不等于游戏通过 |
| T | 行内状态 | 指定模块/CLI/工具内调用 | 仅底座/指定工具有；纯本地工具N/A | 内部Function或指定安全API；非通用游戏写 | 工具通常无UI；行内已有展示除外 | 参数/凭证/D6/脱敏/路径与归属按模块 | N/A，底座不拥有业务预算 | N/A，底座不当独立执行业务 | N/A，日志/系统journal不等于执行账本 | 底座GameClient/capture有生命周期；本地纯工具N/A；具体工具非统一可取消 | tests/client-lifecycle,client-unverified-write,cli-safety,data-safety,capture-*,mitm-*,proxy-backup；工具selftest历史 | REAL_UNVERIFIED；历史登录/清理证据仅按主报告场景 |
| C | 行内状态 | 原CLI/旧run保留；目标写未接共享桥 | 旧请求存在不等于允许派发 | 旧通用写/Tasks/Dailies/Loop路由403 | 可有只读预览；非完整受控写页 | 独立CLI写在读凭证前拒绝，参数不覆盖D6 | 旧预算不冒充共享账本 | 目标写未接；已迁移子集列G/B | 旧内存不冒充共享持久历史 | 保留旧取消/迟到保护；不凭响应推定成功 | legacy safety/cli-safety仅证明所测范围 | REAL_UNVERIFIED |
| B | 行内状态 | operation-service → city/order adapter → 原world/action | 已接原GameClient | /api/operations survey/plan/authorize/execute/stop/history | 建筑/生产/订单执行/历史页 | 精确账号、CSRF、计划哈希、单批一次性授权、fresh precheck、D6 | 是：原Ledger及父资源/配额/UID预算，不返还未确认消耗 | 是 | 是：账号级原子JSON、恢复未决保守阻塞 | 是：AbortSignal/generation/UNKNOWN/RATE_LIMITED/迟到保留 | tests/city-operations,order-execution,operation-service,operations-api,operation-adapters-integration,execution-history,production-*；历史609@9d97065，后续845回归范围见主报告 | REAL_UNVERIFIED；9d97065只读/预览部分REAL_VERIFIED，0业务写帧 |
| G | 行内状态 | registered adapter → executeBusinessOperation/OperationService；或WorkflowRunner | adapter survey与写调用；阻塞动作不派发 | /api/gameplay + /api/operations；工作流 /api/workflows | 原专业子区/通用候选授权页；原生Workflow编辑器 | 精确账号/CSRF、模块严格配置、单次或有限run授权/父预算、身份/状态/成本复查、D6 | 是；只读/空成本N/A；权威成本缺则阻塞 | 是；纯只读策略无需执行 | 写execute是operation历史；workflow持久store历史/共享execution-memory拒绝与UNKNOWN关联；只读survey/view不写业务ExecutionHistory，PLAN不是已执行历史 | 是；UNKNOWN锁/取消/迟到保护继承；未实现动作没有效果确认 | tests/formation,alliance,museum,treasure,fleet,naval-rules,workflow,gameplay-*,stages-formation；历史845+29实现f300a35/记录a505019 | REAL_UNVERIFIED |
| S | 行内状态 | 原StageRunner或有限Stage Function | 仅授权MAINLINE ChallengeStage | 原stages或operations/workflows | 运行/首败开关/逐场历史 | 主线LEFT/READY/所有者/互斥/未决/授权 | 空成本；有限Function父动作预算 | 独立Runner保留；有限Function接原Service | stage-history逐场持久；Function关联共享历史 | runId/generation/取消/限频/迟到；重启不恢复战斗 | 原stages*/stage-function/stage-history/共享测试 | REAL_UNVERIFIED；旧137关、156胜/157限频边界见§4.4 |
| P | PROTOCOL_ONLY或行内PARTIAL | 无目标写调用者；有参考/读探针不计业务写 | 仅底座和可能只读数据；目标写未接 | 无目标写API | 原始Explorer可看不等于业务UI | 业务校验/授权未实现或明确安全阻塞 | 未接目标业务 | 未接目标业务 | 无该写业务历史 | 未形成该写闭环；协议超时规则不能代替业务确认 | 只有协议/codec/读数据可能有测试；无目标业务Offline Verified | REAL_UNVERIFIED |
| N | NOT_IMPLEMENTED或行内PARTIAL | 无该算法/完整业务调用者；附近基础函数行内列明 | N/A或基础数据已有 | 无该完整业务API | 无完整业务UI | 未实现；证据未知应阻塞 | 未实现该能力预算 | 未实现该业务桥 | 无该业务独立历史 | 未实现该闭环，不推定安全成功 | 无该业务专项通过证据 | REAL_UNVERIFIED |

profile中的测试是继承的相关测试族索引，不能把整个族通过当作尚未实现分支已通过。本轮按10d0d95已提交源码、现有API/UI/Workflow及127个源码/测试索引续核，273项原ID和原能力名保留；原BIZ-R17c已由PROTOCOL_ONLY改PARTIAL；本批BIZ-R12a新增只读阶段观察亦改PARTIAL，当前188/77/8。DAT只表示只读查询；原能力名内“当前未接”等措辞及1495e48等profile版本引用是历史出处，不代表现行HEAD。当前交付按顶部W行；本批收取确认后再播种已完成原API/UI/Workflow与定向验证；罗盘受控抽取子集按BIZ-R17c行、在线奖只读子集按BIZ-R12a行更新，273项范围不变，R7/R8均NOT_RUN。

| 原ID | 原能力名 | Cxxx / 非C补充项 | 当前Function维度 | 当前实际函数 / 源码证据 | 12维Profile | 关键剩余缺口 / 限制 |
|---|---|---|---|---|---|---|
| PLT-001 | 平台：本机 Web Console | C001 C002 | EXISTING_FUNCTION | createConsole → PAGE; src/server.mjs | L | 平台本机页面已存在；配置入口覆盖仍有限 |
| PLT-002 | 账号列表与状态 | C002 | EXISTING_FUNCTION | loadStore/describeAccount; src/accounts.mjs; src/server.mjs | R | 账号列表建空Session不等于Runtime |
| PLT-003 | 账号选择/切换活动账号 | C002 | EXISTING_FUNCTION | setActive/pickAccount; src/accounts.mjs | L | 切换选择不隐式登录 |
| PLT-004 | 账号重命名 | C002 | EXISTING_FUNCTION | saveStore; src/accounts.mjs | L | 本地账号标签 |
| PLT-005 | 删除账号及会话取消 | C002 C606 | EXISTING_FUNCTION | cancelSession/removeAccount; src/server.mjs; src/accounts.mjs | L | 取消运行且保留不确定写历史 |
| PLT-006 | 凭证脱敏元信息展示 | C001 | EXISTING_FUNCTION | describeAccount/redact; src/accounts.mjs; src/security.mjs | L | 不公开真实秘密 |
| PLT-007 | 凭证导入、同账号更新和旧单账号读取 | C001 | EXISTING_FUNCTION | accountFromCredential/upsertAccount/saveStore; src/accounts.mjs | T | 安全CLI可导入；无产品化Web扫码/导入 |
| PLT-008 | 鉴权输入校验 | C001 | EXISTING_FUNCTION | validateCredentials; src/security.mjs | T | 正常账号鉴权；D6禁止开发凭证 |
| PLT-009 | 显式登录和单账号连接 Single-flight | C001 | EXISTING_FUNCTION | connect; src/server.mjs; GameClient src/client.mjs | R | 显式connect；single-flight |
| PLT-010 | 显式断开/关闭/失效清理 | C002 C606 | EXISTING_FUNCTION | cancelSession/GameClient.stop; src/server.mjs; src/client.mjs | R | 原心跳超时样本保留；清理不是业务成功 |
| PLT-011 | 心跳、序号、ACK/NACK、失效通知 | C001 C005 | EXISTING_FUNCTION | sendPing/tryHandlePong/tick; src/client.mjs | T | 1000ms首Ping超时需离线诊断而非直接放宽 |
| PLT-012 | 请求关联与迟到响应隔离 | C005 | EXISTING_FUNCTION | request/sendWatch; src/client.mjs | T | 迟到/未决保护存在；调用者须验证业务效果 |
| PLT-013 | 多账号 Session、取消和防旧结果写入 | C002 C605 | EXISTING_FUNCTION | src/app.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | T | 账号/连接/代次隔离及唯一Console跨进程所有权已有；不扩大为任意NAS多writer |
| PLT-014 | 账号页面请求代次 | C002 | EXISTING_FUNCTION | createAccountViewGuard; src/page.mjs | L | 页面scope/generation防旧结果 |
| PLT-015 | 显式采集和缓存刷新边界 | C004 | EXISTING_FUNCTION | refresh/collectState; src/server.mjs; src/game.mjs | R | 48查询采集与缓存浏览分离 |
| PLT-016 | 总览、缓存明细和 Snapshot 导出 | C004 | EXISTING_FUNCTION | src/game.mjs；src/data-catalog.mjs；tests/data-catalog.test.mjs | R | 48查询中28解析/20原始；浏览缓存零请求 |
| PLT-017 | 实时区服列表 | C003 | EXISTING_FUNCTION | listWorlds; src/worlds.mjs | R | 实时只读区服列表 |
| PLT-018 | 全区服分组和指定区服登录 | C003 | PARTIAL | src/worlds.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 列表/分组和角色/出生/当前世界精确身份、当前Session归属只读修复已有；独立CLI写在读凭证前拒绝，Web enter403；实际切服的目标原子绑定/禁止隐式新建/恢复合同待核 |
| PLT-019 | 运行事件和递归脱敏 | C606 | EXISTING_FUNCTION | emit/trace/redact; src/server.mjs; src/security.mjs | L | SSE有限内存，不等于所有持久运行历史 |
| PLT-020 | Web 游戏写权限边界 | C603 C409 | EXISTING_FUNCTION | route gates; src/server.mjs; assertPaymentAllowed src/actions.mjs | T | 新增受控operations/gameplay/workflow路由；旧写白名单仍拒绝 |
| PLT-021 | Stage 状态/开始/停止产品入口 | C201 C202 C203 C204 C205 | EXISTING_FUNCTION | stageView/createStageRunner; src/server.mjs; src/stages.mjs | S | 真实挑战和10–11秒限频效果待最终验收 |
| PLT-022 | 独立凭证捕获并导入 | C001 | EXISTING_FUNCTION | runCaptureCli/createCaptureController; tools/capture-credentials.mjs; src/capture.mjs | T | 安全CLI；Web旧捕获handler不可直接解禁 |
| PLT-023 | 捕获事务和崩溃恢复 | C001 非C:捕获崩溃恢复 | EXISTING_FUNCTION | recoverCapture/startCapture/stopCapture; src/capture.mjs | T | 本轮未启动或读真实凭证 |
| PLT-024 | MITM 主机与TLS安全 | 非C:MITM安全 | EXISTING_FUNCTION | createProxy; tools/mitm-proxy.mjs | T | 默认精确主机白名单；不在本轮运行 |
| PLT-025 | CA生成、只读精确查询与归属清理 | 非C:CA归属 | EXISTING_FUNCTION | queryCurrentUserRoot/createCaManager; tools/mitm-ca.mjs | T | 只归属receipt清理；本轮未操作CA |
| PLT-026 | Windows代理版本化备份和恢复 | 非C:代理恢复 | EXISTING_FUNCTION | createProxySettings; tools/proxy-settings.mjs | T | 版本化备份/恢复；本轮未操作代理 |
| PLT-027 | B2定向首错诊断与心跳发送白名单 | C001 非C:首错诊断 | EXISTING_FUNCTION | createB2Diagnostics; tools/b2-harness.mjs | T | 真实Phase2首Ping超时留待最终诊断 |
| PLT-028 | CLI账号管理与开发操作 | C001 C003 C603 | PARTIAL | src/app.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | T | 本地账号管理/只读/dry保留；--yes、--paid或环境变量不能开放独立游戏写 |
| PLT-029 | CLI日志/导出安全差异（明确待办） | C001 C002 | EXISTING_FUNCTION | createCliOutput/loadCliCredential; src/cli-safety.mjs; accountsCli src/app.mjs | T | PHASE1已补普通输出脱敏；危险旧展示不作为可用产品入口 |
| PLT-030 | Protobuf载入和注册器沙箱 | C005 | EXISTING_FUNCTION | loadProtocol; src/proto.mjs | T | ignored生成协议资源需可复现恢复 |
| PLT-031 | 协议帧编解码、LZ4 | C005 | EXISTING_FUNCTION | createCodec; src/codec.mjs; compressBlock/decompressBlock src/lz4.mjs | T | 传输实现存在不等于业务完成 |
| PLT-032 | 协议字段和消息反查 | C005 非C:协议反查 | EXISTING_FUNCTION | fields/findType; tools/describe.mjs | T | 部分嵌套显示unknown需生成源码核对 |
| PLT-033 | 压缩客户端上下文定位 | 非C:压缩客户端定位 | EXISTING_FUNCTION | CLI source; tools/ctx.mjs | T | 纯本地定位工具 |
| PLT-034 | 微信包解密/解包 | 非C:wxapkg解包 | EXISTING_FUNCTION | decrypt/unpack; tools/wxapkg.mjs | T | 运行资产不随Git提交 |
| PLT-035 | 本地配置表发现、提取和查询 | C004 非C:配置恢复 | EXISTING_FUNCTION | findConfigPack/extractTables/loadConfig; src/config.mjs | T | 恢复来源/哈希要求保留 |
| PLT-036 | 固化配置包 | 非C:配置固化 | EXISTING_FUNCTION | CLI source; tools/sync-config.mjs | T | 本轮未同步或访问网络 |
| PLT-037 | 图集提取和本地展示 | C004 非C:图集显示 | EXISTING_FUNCTION | iconIndex/atlasFile; src/art.mjs | R | 缺资源可降级 |
| PLT-038 | 图集资源同步 | 非C:图集同步 | EXISTING_FUNCTION | sync-art helpers; tools/sync-art.mjs | T | 本轮未同步或网络下载 |
| PLT-039 | 客户端枚举名称提取 | 非C:枚举名称提取 | EXISTING_FUNCTION | CLI source; tools/build-names.mjs | T | 名称不代表业务Function |
| PLT-040 | 扩展玩法实时只读探针 | C601 非C:扩展探针 | EXISTING_FUNCTION | runDailiesProbe/runWorldProbe; tools/probe-dailies.mjs; tools/probe-world.mjs | T | 原扩展只读探针保留，不属于48项Snapshot；账号/脱敏保护已有，本轮不执行在线工具 |
| PLT-041 | 登录拒绝在线诊断 | 非C:在线登录诊断 | EXISTING_FUNCTION | CLI source; tools/check-login-failure.mjs | T | 原登录诊断工具保留，独立于业务执行；本轮不执行在线工具 |
| PLT-042 | 离线回归入口 | 非C:离线回归 | EXISTING_FUNCTION | src/selftest.mjs; package.json; tools/selftest-registry.mjs | T | 历史结果需带提交；本轮未重跑 |
| PLT-043 | 游戏协议全自动发现/通用工作流设计器 | C607 非C:自动协议发现 | PARTIAL | src/loop.mjs；src/workflow.mjs；src/operation-service.mjs；tests/workflow.test.mjs | G | 27静态模块加Stage、28合同及原生图编辑已有；自动协议发现/全目录仍缺 |
| DEX-001 | 48 项查询单次采集 | C004 C005 C601 | EXISTING_FUNCTION | src/data-catalog.mjs；src/game.mjs；src/page.mjs；tests/data-catalog.test.mjs | R | 当前48查询/28解析/20原始；原DEX-003/004标题27/21仅历史口径；非当前真实验收 |
| DEX-002 | 12 域目录与 48 项浏览 | C004 C005 C601 | EXISTING_FUNCTION | src/data-catalog.mjs；src/game.mjs；src/page.mjs；tests/data-catalog.test.mjs | R | 当前48查询/28解析/20原始；原DEX-003/004标题27/21仅历史口径；非当前真实验收 |
| DEX-003 | 27 个现有业务解析视图 | C004 C005 C601 | EXISTING_FUNCTION | src/data-catalog.mjs；src/game.mjs；src/page.mjs；tests/data-catalog.test.mjs | R | 当前48查询/28解析/20原始；原DEX-003/004标题27/21仅历史口径；非当前真实验收 |
| DEX-004 | 21 个无专门解析的原始响应 | C004 C005 C601 | EXISTING_FUNCTION | src/data-catalog.mjs；src/game.mjs；src/page.mjs；tests/data-catalog.test.mjs | R | 当前48查询/28解析/20原始；原DEX-003/004标题27/21仅历史口径；非当前真实验收 |
| DEX-005 | 状态、错误、采集时间 | C004 C005 C601 | EXISTING_FUNCTION | src/data-catalog.mjs；src/game.mjs；src/page.mjs；tests/data-catalog.test.mjs | R | 当前48查询/28解析/20原始；原DEX-003/004标题27/21仅历史口径；非当前真实验收 |
| DEX-006 | 按域、业务名和协议名搜索 | C004 C005 C601 | EXISTING_FUNCTION | src/data-catalog.mjs；src/game.mjs；src/page.mjs；tests/data-catalog.test.mjs | R | 当前48查询/28解析/20原始；原DEX-003/004标题27/21仅历史口径；非当前真实验收 |
| DEX-007 | 安全 JSON 复制/导出 | C004 C005 C601 | EXISTING_FUNCTION | src/data-catalog.mjs；src/game.mjs；src/page.mjs；tests/data-catalog.test.mjs | R | 当前48查询/28解析/20原始；原DEX-003/004标题27/21仅历史口径；非当前真实验收 |
| DEX-008 | int64 精度保留 | C004 C005 C601 | EXISTING_FUNCTION | src/data-catalog.mjs；src/game.mjs；src/page.mjs；tests/data-catalog.test.mjs | R | 当前48查询/28解析/20原始；原DEX-003/004标题27/21仅历史口径；非当前真实验收 |
| DEX-009 | 跨账号缓存与迟到响应隔离 | C004 C005 C601 | EXISTING_FUNCTION | src/data-catalog.mjs；src/game.mjs；src/page.mjs；tests/data-catalog.test.mjs | R | 当前48查询/28解析/20原始；原DEX-003/004标题27/21仅历史口径；非当前真实验收 |
| DAT-001 | 库存道具 / 资源与生产 | C113 C123 C221 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-002 | 玩家资源 / 资源与生产 | C113 C123 C102 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-003 | 英雄 / 英雄养成 | C221 C207 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-004 | 英雄阵型 / 英雄养成 | C211 C207 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-005 | 邮件 / 日常与成长任务 | C511 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-006 | 装备 / 英雄养成（收藏与辅助养成） | C229 C230 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-007 | 徽章 / 英雄养成（收藏与辅助养成） | C227 C228 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-008 | 招募信息 / 招募与商店 | 非C:招募 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-009 | 成就 / 日常与成长任务 | C502 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-010 | 每日任务与活跃度 / 日常与成长任务 | C502 C503 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-011 | 每日赠礼 / 日常与成长任务（招募与商店） | C513 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-012 | 主线与支线任务 / 日常与成长任务 | C502 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-013 | 新手引导 / 日常与成长任务 | 非C:新手引导 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-014 | 挂机收益与点金摘要 / 日常与成长任务（资源与生产） | 非C:挂机收益 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-015 | 月卡 / 招募与商店（活动与赛季） | C513 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-016 | 藏品 / 收藏与辅助养成 | 非C:藏品 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-017 | 建筑、生产与居民订单 / 城市建设（资源与生产、居民订单） | C101 C111 C121 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-018 | 鱼类图鉴 / 收藏与辅助养成 | C152 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-019 | 货船 / 舰队与航海 | C131 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-020 | 英雄任命 / 英雄养成 | C221 非C:委任 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-021 | 聊天记录 / 公会与联盟 | 非C:聊天 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-022 | 游戏效果 / 收藏与辅助养成 | 非C:游戏效果 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-023 | 公会摘要 / 公会与联盟 | C302 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-024 | 我的舰队 / 舰队与航海（世界地图） | C401 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-025 | 海盗击杀记录 / 城战与战斗（舰队与航海） | C151 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-026 | 我的资源田 / 世界地图 | C403 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-027 | 公会科技 / 公会与联盟 | C306 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-028 | 公会订单 / 公会与联盟（居民订单） | 非C:联盟订单 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-029 | 阵型预设 / 英雄养成 | C212 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-030 | 赛季任务阶段 / 活动与赛季（日常与成长任务） | C501 C502 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-031 | 世界 Boss / 城战与战斗（活动与赛季） | 非C:世界Boss | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-032 | 限时 Boss 开放信息 / 城战与战斗（活动与赛季） | 非C:限时Boss | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-033 | 宠物 / 收藏与辅助养成 | 非C:海兽 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-034 | 赛季排名信息 / 活动与赛季 | C501 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-035 | 周活动 / 活动与赛季 | C501 C515 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-036 | 关卡状态 / 城战与战斗 | C201 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-037 | 周订单 / 活动与赛季（居民订单） | C515 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-038 | 日常计数 / 日常与成长任务 | C502 C503 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-039 | 雷达 / 世界地图 | C403 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-040 | 环境皮肤 / 收藏与辅助养成 | 非C:环境皮肤 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-041 | 渠道奖励信息 / 活动与赛季 | C501 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-042 | 限时券 / 招募与商店（活动与赛季） | C501 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-043 | 赛季卡 / 活动与赛季（招募与商店） | C501 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-044 | 海盗 / 城战与战斗（世界地图） | C151 C403 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-045 | 玩家头像框 / 收藏与辅助养成 | 非C:头像框 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-046 | Churn 信息 / 活动与赛季 | C501 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-047 | Ultra 开放信息 / 活动与赛季 | C501 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| DAT-048 | 黑名单 / 公会与联盟 | 非C:黑名单 | EXISTING_FUNCTION | collectState ENTRY_QUERIES; src/game.mjs; DATA_CATALOG src/data-catalog.mjs | R | 仅48项Collector对应只读查询/缓存；28解析/20原始见DATA_CATALOG，不代表目标写或完整领域交付 |
| BIZ-A01 | 资源与生产：领取挂机本段收益 | 非C:挂机收益 | PARTIAL | src/afk-level-rewards.mjs；tests/afk-level-rewards.test.mjs；src/loop.mjs | G | 明确区间普通物品/徽章收益已接共享合同及三入口；有限普通收益→升级准备/API/UI已有；其他实例包及断线旧区间回执未齐；UNKNOWN零重放 |
| BIZ-A02 | 日常成长：领取挂机等级奖励 | 非C:挂机奖励 | EXISTING_FUNCTION | src/afk-level-rewards.mjs；tests/afk-level-rewards.test.mjs | G | 明确单等级奖励受控领取；不证明时段收益或升级 |
| BIZ-A03 | 日常成长：提升挂机等级 | 非C:挂机升级 | PARTIAL | src/afk-level-rewards.mjs；src/operation-service.mjs；tests/afk-level-rewards.test.mjs | G | 明确1/5/10级升级已接原合同/API/UI/有限Workflow；同连接持久收益前置、逐档真实成本与主线门槛，独立精确净扣；有限来源绑定准备/API/UI已有；完整挂机/邮件其余分支未齐，UNKNOWN零重放 |
| BIZ-A04 | 生产：收取工厂成品 | C116 | EXISTING_FUNCTION | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | G | 工厂成品与竣工受控执行；原生批量农田结算另有缺证 |
| BIZ-A05 | 城市：收取建筑产物 | C116 | EXISTING_FUNCTION | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | G | 工厂成品与竣工受控执行；原生批量农田结算另有缺证 |
| BIZ-A06 | 城市：确认已到期建筑竣工 | C116 | EXISTING_FUNCTION | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | G | 工厂成品与竣工受控执行；原生批量农田结算另有缺证 |
| BIZ-A07 | 城市：切换自动工作 | 非C:自动工作 | PARTIAL | src/app.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 自动工作旧实现保留；未接共享受控写 |
| BIZ-A08 | 生产：设置自动生产产品 | C114 | PARTIAL | src/app.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 旧自动生产开关及产品设定不等于Production单次排产 |
| BIZ-A09 | 日常：领取单条任务奖励 | C503 | EXISTING_FUNCTION | src/task-rewards.mjs；tests/task-rewards.test.mjs | G | 明确日常taskId单次领取已接；不推定周期 |
| BIZ-A10 | 成就：领取奖励 | 非C:成就领奖 | EXISTING_FUNCTION | src/task-rewards.mjs；tests/task-rewards.test.mjs | G | 明确成就ID、配置奖励映射与独立复读已接 |
| BIZ-A11 | 邮箱：一键领取已读邮件附件 | C511 | PARTIAL | src/mail.mjs；tests/mail-claim.test.mjs | G | 有界枚举和已读、未读单封读领已有；批量及实例附件归属缺 |
| BIZ-A12 | 日常：领取活跃宝箱 | C503 | EXISTING_FUNCTION | src/daily-task-rewards.mjs；tests/daily-task-rewards.test.mjs | G | 明确日活跃档及奖励复读已有；非通用日界策略 |
| BIZ-A13 | 周常：领取活跃宝箱 | C516 | PARTIAL | src/daily-task-rewards.mjs；tests/daily-task-rewards.test.mjs | G | 三类周免费包和具名周芯片任务已有；周活跃箱完整周期和归属缺 |
| BIZ-A14 | 商店：领取每日免费赠礼 | C513 | EXISTING_FUNCTION | src/task-rewards.mjs；tests/task-rewards.test.mjs | G | 固定赠礼packId零支出与独立复读已有 |
| BIZ-A15 | 月卡：领取每日权益 | C513 | PARTIAL | src/app.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 月卡只读保留；完整每日权益未接共享写合同 |
| BIZ-A16 | 主线任务：领奖 | C503 | EXISTING_FUNCTION | src/task-rewards.mjs；tests/task-rewards.test.mjs | G | 明确主线taskId计划授权与独立结算 |
| BIZ-A17 | 支线任务：领奖 | C503 | EXISTING_FUNCTION | src/task-rewards.mjs；tests/task-rewards.test.mjs | G | 明确支线taskId计划授权与独立结算 |
| BIZ-A18 | 居民订单：每日单数档奖励 | C128 非C:订单档奖励 | PARTIAL | src/app.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 每日订单档资格、身份和奖励合同缺证 |
| BIZ-A19 | 居民订单：交单 | C126 | EXISTING_FUNCTION | src/order-execution.mjs；tests/order-execution.test.mjs | G | 明确单单提交已受控并独立确认订单替换及完成数；免费刷新另行缺证 Tasks/Loop现可明确选择原SUBMIT候选逐单提交。专业页、原准备API和原Workflow接线见W19。 |
| BIZ-A20 | 居民订单：拒单刷新 | C126 | EXISTING_FUNCTION | src/order-execution.mjs；tests/order-execution.test.mjs | G | 明确单单提交已受控并独立确认订单替换及完成数；免费刷新另行缺证 |
| BIZ-A21 | 生产：开始制造 | C115 | EXISTING_FUNCTION | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | G | registered production复用原city链、共享预算、写前调查和写后复读 |
| BIZ-A22 | 城市：升级建筑 | C103 | EXISTING_FUNCTION | src/city-operations.mjs；tests/city-operations.test.mjs | G | 升级授权与权威复读已有，真实未验 |
| BIZ-A23 | 城市：建造空建筑位 | C104 | EXISTING_FUNCTION | src/city-operations.mjs；tests/city-operations.test.mjs | G | 仅服务端已有level0槽；不是任意地图新坐标建造 |
| BIZ-A24 | 城市：道具加速升级 | C102 非C:建筑道具加速 | EXISTING_FUNCTION | src/city-operations.mjs；tests/city-operations.test.mjs | G | 材料/等级/人口/队列前检已有；未知不计划 |
| BIZ-A25 | 生产：道具加速制造位 | C114 非C:生产道具加速 | EXISTING_FUNCTION | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | G | 原排产及种子/过剩作物水位接入生产策略，缺配置不推测数量 |
| BIZ-A26 | 世界资源田：派舰占领 | C403 非C:资源田占领 | PARTIAL | src/world.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 资源田只读和旧计划保留；占领未接共享写及独立复读 |
| BIZ-A27 | 世界资源田：放弃占领 | C403 非C:资源田放弃 | PARTIAL | src/world.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 资源田只读和旧计划保留；放弃未接共享写及独立复读 |
| BIZ-W01 | 城市建筑、工厂队列、产物、建造时间读取 | C101 C111 | EXISTING_FUNCTION | src/city-operations.mjs；tests/city-operations.test.mjs | G | 建筑信息与业务页面已有 |
| BIZ-W02 | 库存归并与人口/上限计算 | C113 C123 | EXISTING_FUNCTION | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | G | 订单优先缺口、在产/成品抵扣及共享库存；收入不自动扩额 |
| BIZ-W03 | 获取居民需求与物品缺口 | C121 C122 C123 | EXISTING_FUNCTION | src/order-execution.mjs；tests/order-execution.test.mjs | G | 需求源OnWater，缺数组不是权威空 |
| BIZ-W04 | 普通/特殊订单经验 | C124 | EXISTING_FUNCTION | src/order-rewards.mjs；tests/order-rewards.test.mjs | L | 经验和已证基础金币预览已有；最终金币倍率/结算公式缺证 |
| BIZ-W05 | 订单金币奖励 | C124 | PARTIAL | src/order-rewards.mjs；tests/order-rewards.test.mjs | B | 配置基础预览及事后奖励关联已有；最终金币、加成取整和MIN_GOLD资格缺 |
| BIZ-W06 | 收工厂成品与建筑产物计划 | C116 | EXISTING_FUNCTION | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | G | 工厂成品与竣工受控执行；原生批量农田结算另有缺证 |
| BIZ-W07 | 到期竣工与空位建造 | C104 C116 | EXISTING_FUNCTION | src/city-operations.mjs；tests/city-operations.test.mjs | G | 仅服务端已有level0槽；不是任意地图新坐标建造 |
| BIZ-W08 | 订单优先交付/低经验缺料刷新 | C125 C126 | PARTIAL | src/order-execution.mjs；tests/order-execution.test.mjs | G | 规则/三值评估/库存复查已有；免费刷新资格缺证继续冻结 |
| BIZ-W09 | 跨订单与其他计划材料预留 | C123 C113 | EXISTING_FUNCTION | src/order-execution.mjs；tests/order-execution.test.mjs | G | 跨订单预算分配已有，不把独立模拟当批量预留 |
| BIZ-W10 | 按订单缺口排产 | C114 C115 | EXISTING_FUNCTION | src/core-operation-adapters.mjs；tests/operation-adapters-integration.test.mjs | G | 原排产及种子/过剩作物水位接入生产策略，缺配置不推测数量 |
| BIZ-W11 | 余料升级建筑 | C102 C103 | EXISTING_FUNCTION | src/city-operations.mjs；tests/city-operations.test.mjs | G | 材料/等级/人口/队列前检已有；未知不计划 |
| BIZ-W12 | 可选加速建筑/生产 | C102 非C:加速 | EXISTING_FUNCTION | src/city-operations.mjs；tests/city-operations.test.mjs | G | 材料/等级/人口/队列前检已有；未知不计划 |
| BIZ-W13 | 串行计划执行与失败同类隔离 | C603 | EXISTING_FUNCTION | src/operation-service.mjs；tests/operation-service.test.mjs | G | Service/Executor统一已交付写；旧Web写403/CLI独立写拒绝，未映射业务仍未交付 |
| BIZ-W14 | 世界地图资源田资产读取/展示 | C403 | PARTIAL | src/world.mjs；src/asset-readiness.mjs；tests/asset-readiness.test.mjs | R | 固定清单、只读诊断和保留归档已有；map-1及上游来源缺 |
| BIZ-W15 | 指定资源田占领计划 | 非C:资源田占领 | PARTIAL | src/world.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 固定v76 SelectTroopPop明确ChallengeResFieldRequest的grid/fleet列表、闲置/耐久及每舰资源地汽油成本；回调仅关窗。map-1实际缺失且清单来源/哈希空，目标资格和独立归属/模式结算未闭合；BLOCKED_EVIDENCE，不以派遣当占领 |
| BIZ-W16 | 放弃自有资源田 | 非C:资源田放弃 | EXISTING_FUNCTION | src/fleet.mjs；src/client.mjs；src/actions.mjs；src/function-contracts.mjs；src/gameplay-page.mjs；tests/fleet.test.mjs；tests/gameplay-api.test.mjs；tests/farm-forge-full-page.test.mjs | G | 明确本账号当前完整已占列表中的单个gridIdx（0有效）；默认关闭，原授权/UID预算/持久历史/独立前后完整列表及库存不变验证；推送只失效，UNKNOWN/重启零重放。非占领/收益，REAL_UNVERIFIED |
| BIZ-H01 | 英雄及阵容数据读取、养成计划展示；planHeroes、maxHeroLevelFor | C221 C211 | EXISTING_FUNCTION | src/hero-operations.mjs；tests/hero-service.test.mjs | G | 成长等级和材料前检已有，复用Ledger |
| BIZ-H02 | 英雄升级；planHeroes→runHeroPlan→sendHero | C222 | EXISTING_FUNCTION | src/hero-operations.mjs；tests/hero-service.test.mjs | G | 明确单英雄等级加一及完整英雄池、库存复读已接 |
| BIZ-H03 | 英雄升星；planHeroes→runHeroPlan | C223 | PARTIAL | src/hero-operations.mjs；tests/hero-service.test.mjs | G | 专属碎片星、明确1比1兑换、固定前置的单英雄及1至12名共享来源明确顺序单星组合已有；隐式混用及完整自动策略缺 |
| BIZ-H04 | 英雄技能升级；planHeroes→runHeroPlan | C224 | EXISTING_FUNCTION | src/hero-operations.mjs；tests/hero-service.test.mjs | G | 明确单英雄技能升级及完整池、库存复读已接 |
| BIZ-H05 | 装备/徽章穿戴、升级、替换、精炼、升星、专武养成 | C225 C226 C227 C228 C229 C230 | PARTIAL | src/hero-operations.mjs；src/equipment-growth.mjs；src/badge-growth.mjs；tests/equipment-growth.test.mjs | G | 专武、装备、徽章成长和空槽穿戴子集已有，装备显式配置零费首次0→1已接；替换、激活及部分边界缺 |
| BIZ-D01 | 日常任务进度、目标与可执行动作评估；describeDailyTask/surveyDailies/DAILY_DRIVERS | C502 C503 | EXISTING_FUNCTION | src/daily-checklist.mjs；tests/daily-checklist.test.mjs | R | 主/支/成就/每日/周芯片任务观察已有；全部活动任务未闭合 |
| BIZ-D02 | 英雄/普通古董免费、单券、10连、50连招募及累计任务只读条件；原只读Driver1002保留英雄 → 同一free-recruit Function/Service | 非C:免费与招募券批量 | PARTIAL | src/free-recruit.mjs；src/dailies.mjs；src/antique-growth.mjs；src/actions.mjs；src/loop.mjs；src/function-contracts.mjs；src/gameplay-page.mjs；tests/free-recruit.test.mjs；tests/gameplay-api.test.mjs；tests/farm-forge-full-page.test.mjs | G | 默认英雄，古董须显式recruit=antique/type1；四模式成本/唯一构造及单一typed验证、独立完整AllAntique/库存和原派生校验保持。本批累计条件只读复用原RecruitData与季节选择，达标/已领记录/到账分开，未知不授资格；空领奖请求缺档位/季节绑定与恢复归属，累计写BLOCKED_EVIDENCE。广告/潜水/补购、周期与真实验收保留，REAL_UNVERIFIED |
| BIZ-D03 | 日常单次主线战斗；Function：DAILY_DRIVERS[1003] → runDailies | C202 | PARTIAL | src/loop.mjs；src/workflow.mjs；src/operation-service.mjs；tests/workflow.test.mjs | G | 日常1003显式转原Stage；战斗结果不代替日常完成观察 |
| BIZ-D04 | 挂机满段领取驱动；Function：DAILY_DRIVERS[1004] | 非C:挂机收益 | PARTIAL | src/loop.mjs；src/afk-level-rewards.mjs；tests/afk-level-rewards.test.mjs | G | 8869553已接明确普通区间收益；无需整段到期，可信61秒门槛。无区间旧1004仍拒绝；完整结算及依赖准备未齐 |
| BIZ-D05 | 竞技场低战力对手挑战；Function：DAILY_DRIVERS[1005] | 非C:竞技场 | PARTIAL | src/dailies.mjs；src/actions.mjs；tests/actions-safety.test.mjs；tests/business-transport-freshness.test.mjs；tests/dailies-safety.test.mjs | C | 原低战力只读建议保留；无证请求成本白名单已移除，缺/猜测成本在预检前拒绝。客户端检查竞技点>0未证明精确扣量；ArenaReport和BattlePlayerData无双方玩家ID，受控对手/成本/阵营/同次结算仍缺，未开放挑战 |
| BIZ-D06 | 免费点金/可选钻石点金；Function：DAILY_DRIVERS[1006] | 非C:点金 | PARTIAL | src/free-gold.mjs；tests/free-gold.test.mjs | G | 普通免费点金单次已接；原可选钻石分支D6硬拒绝 |
| BIZ-D07 | 折扣店挑最低价购买；Function：DAILY_DRIVERS[1007] | C513 非C:折扣店 | PARTIAL | src/dailies.mjs；src/actions.mjs；tests/dailies-safety.test.mjs；tests/actions-safety.test.mjs | C | 固定v76 DiscountShopItem._buyDiscountItem明确floor(price×discount)、Resource.RUBY及仅id请求；独立Codec确认响应为shopItem/reward。该购买路径未见金币或自有材料支付选择，普通物资不等于普通币成本；D6继续拒绝含伪造零成本/allowPaid的购买，不开放新写链。原只读最低价建议保留，REAL_UNVERIFIED |
| BIZ-D08 | 贸易日常能力；Function：DAILY_DRIVERS[1008] probes | C131 C133 | PARTIAL | src/fleet.mjs；src/loop.mjs；tests/cargo-service.test.mjs；tests/workflow.test.mjs | G | 日常1008属港口货轮，非海商王C521；Dailies/Loop精确单格装货已接原Fleet，独立观察/领奖；完整任务完成归因仍缺证 |
| BIZ-D09 | 英雄经验试炼推进；Function：DAILY_DRIVERS[1009] | 非C:经验试炼 | EXISTING_FUNCTION | src/trial-challenge.mjs；tests/trial-challenge.test.mjs | G | 明确单次经验试炼已接；不外推所有试炼 |
| BIZ-D10 | 海盗免战扫荡；Function：DAILY_DRIVERS[1010] | C151 | PARTIAL | src/pirate-sweep.mjs；tests/pirate-sweep.test.mjs | G | 日常1010精确城市、UID及配额单扫已接；奖励、目标变化、日界缺 |
| BIZ-D11 | 联盟情报日常探测；Function：DAILY_DRIVERS[1011] | 非C:联盟雷达 | PARTIAL | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs | R | 只读/probe/状态或计划；不得作为对应写入已完成 |
| BIZ-D12 | 联盟订单日常探测；Function：DAILY_DRIVERS[1012] | 非C:联盟订单 | PARTIAL | src/alliance.mjs；tests/alliance.test.mjs | G | 日常1012明确城市订单已接；非全部联盟日常 ；本批1至24个明确不同城市当前同单有限组合接原API/专业页/逐项Workflow，原单项兼容；同日顺序计数/来源守卫及固定初始材料父预算，奖励独立，R7/R8 NOT_RUN |
| BIZ-D13 | 联盟互助探测；Function：DAILY_DRIVERS[1013] | C301 | PARTIAL | src/alliance.mjs；tests/alliance-tech.test.mjs | G | reqId精确绑定成员求助单，已有展示 |
| BIZ-D14 | 请求帮助/城战功勋日常驱动；Function：DAILY_DRIVERS[1014/1015] lockedReason | C305 C406 | PARTIAL | src/app.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 帮助和城战驱动仍缺权威资格、额度、冷却及结算 |
| BIZ-D15 | 博物馆探险探测；Function：DAILY_DRIVERS[1016] | C141 | PARTIAL | src/museum.mjs；tests/museum.test.mjs | G | 日常1016明确关卡、英雄和倍率出发已接；不等于完成领奖 |
| BIZ-D16 | 跨服积分赛探测；Function：DAILY_DRIVERS[1017] | 非C:跨服积分赛 | PARTIAL | surveyDailies/DAILY_DRIVERS/runDailies/claimDailies; src/dailies.mjs | R | 只读/probe/状态或计划；不得作为对应写入已完成 |
| BIZ-D17 | 执行日常动作并收尾领奖；Function：runDailies→sendAction→claimDailies | C503 | PARTIAL | src/loop.mjs；src/workflow.mjs；src/operation-service.mjs；tests/workflow.test.mjs | G | 统一Dailies有限图覆盖9类明确动作子集及部分领取，装货与日常完成分离；完整17驱动和周期未全 |
| BIZ-D18 | 领取已完成日常任务奖励；Function：claimDailies | C503 | EXISTING_FUNCTION | src/task-rewards.mjs；tests/task-rewards.test.mjs | G | 明确日常taskId单次领取已有 |
| BIZ-D19 | 日/周活跃宝箱计划与领取；Function：chestTiers/planChests→claimDailies | C516 | PARTIAL | src/daily-task-rewards.mjs；tests/daily-task-rewards.test.mjs | G | 日活跃箱、周免费包和芯片任务子集已有；周活跃完整周期缺 |
| BIZ-D20 | 每日免费赠礼计划与验证；Function：planDailyGift→claimDailies | C513 | EXISTING_FUNCTION | src/task-rewards.mjs；tests/task-rewards.test.mjs | G | 固定每日赠礼受控领取；不含VIP或付费包 |
| BIZ-D21 | 主线/支线任务状态与领奖计划；Function：surveyTasks、taskTarget | C502 C503 | EXISTING_FUNCTION | src/task-rewards.mjs；tests/task-rewards.test.mjs | G | 主线、支线状态与单次受控领奖已有 |
| BIZ-D22 | 成就状态与领奖计划；Function：surveyTasks | 非C:成就 | EXISTING_FUNCTION | src/task-rewards.mjs；tests/task-rewards.test.mjs | G | 成就状态、奖励映射和单次受控领取已有 |
| BIZ-D23 | 每日订单档位判断；Function：nextOrderTier→surveyTasks | 非C:订单档奖励 | PARTIAL | src/tasks.mjs；src/loop.mjs；src/core-operation-adapters.mjs；tests/execution-lifecycle.test.mjs；tests/workflow.test.mjs | R | Tasks观察及Tasks/Loop显式Orders SURVEY已接；1495e48保存明确完成数/已领奖阈值历史，缺失不补零；适用赛季/周期、领取资格及到账仍缺证，无领奖写 |
| BIZ-D24 | 主/支/成就/订单档奖励串行领取；Function：runTasks | C503 C604 | PARTIAL | src/loop.mjs；src/workflow.mjs；src/operation-service.mjs；tests/workflow.test.mjs | G | Tasks具名主线、支线、成就转原Workflow；旧runTasks复用原Service单次许可和持久结果，独立发送已移除；订单档合同缺 |
| BIZ-D25 | 一键可领取清单与前后对比；Function：app内部planLoot→loot→runAction | C511 C513 | PARTIAL | src/app.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 旧loot清单和dry保留，独立及批量旧写拒绝；迁移单项走原Service |
| BIZ-L01 | 角色摘要/区服列表与分组；Function：describeRole/listWorlds/listGroup | C003 | EXISTING_FUNCTION | src/server.mjs；tests/server-runtime.test.mjs | T | 列表及显式CLI切服已有，网页enter仍403，创建角色未授权 |
| BIZ-L02 | 指定区服登录；Function：enterWorld→新GameClient.connect({...login,worldId}) | C003 | PARTIAL | src/world.mjs；src/writer-ownership.mjs；tests/cli-safety.test.mjs | C | 只读world列表保留，enterWorld写拒绝，Web enter403 |
| BIZ-L03 | 固定三段自动循环；Function：runLoop → surveyTasks/runTasks → surveyDailies/runDailies → surveyWorld/planWorld/runWorld | C605 C604 | PARTIAL | src/loop.mjs；src/workflow.mjs；src/operation-service.mjs；tests/workflow.test.mjs | G | Loop编译为原Registry有限图，明确轮次、间隔、期限与父预算；旧Loop无Service许可立即停止后继；未迁移驱动不派发 |
| BIZ-L04 | 循环轮次记录/步骤回调；Function：runLoop history/onRound/onStep→formatLoopRound | C606 | PARTIAL | src/execution-history.mjs；src/workflow.mjs；tests/workflow-execution-history.test.mjs | G | run、节点、批次及动作持久查询已有，批次/记忆可精确只读导航原执行证据；重启不恢复计时授权 |
| BIZ-L05 | 订单库存→评估→刷新/交单组合；Function：新order-rules只读决策 + 旧finishOrder/rerollOrder | C125 C126 | PARTIAL | src/order-execution.mjs；tests/order-execution.test.mjs | G | 规则/三值评估/库存复查已有；免费刷新资格缺证继续冻结 原Loop的Tasks分组已接精确SUBMIT候选，按原规则复查并逐单确认。 |
| BIZ-L06 | 建筑→队列→收取/排产组合；Function：surveyWorld→planWorld→runWorld | C101 C111 C115 C116 | EXISTING_FUNCTION | src/city-operations.mjs；tests/city-operations.test.mjs | G | 建筑信息与业务页面已有 |
| BIZ-L07 | 玩家→指定阵容→主线组合；Function：玩家/formation读取与Stage Runner已存在，应用阵容动作未接 | C214 C204 | EXISTING_FUNCTION | src/formation.mjs；tests/formation.test.mjs | G | 指定阵容SAVE独立复读后走原Stage；不外推其他战斗模式 |
| BIZ-L08 | 舰队→维修→派遣组合；Function：目标仅fleet读取+资源田手动计划；无Repair Function | C401 C407 C406 | PARTIAL | src/fleet.mjs；tests/fleet.test.mjs | G | 维修、编队及明确移动可组合；移动不代替攻击 |
| BIZ-L09 | 通用 Workflow Engine / DAG / Rules编排 | C601 C602 C603 C604 C605 C606 C607 | PARTIAL | src/loop.mjs；src/workflow.mjs；src/operation-service.mjs；tests/workflow.test.mjs | G | 原DAG、父预算、日周、可信事件及具名WAIT已有；全业务策略未全 |
| BIZ-R01 | 联盟订单交付（当前DATA_ONLY） | 非C:联盟订单 | EXISTING_FUNCTION | src/alliance.mjs；tests/alliance.test.mjs | G | 明确联盟订单预算授权与独立复读已有 ；本批1至24个明确不同城市当前同单有限组合接原API/专业页/逐项Workflow，原单项兼容；同日顺序计数/来源守卫及固定初始材料父预算，奖励独立，R7/R8 NOT_RUN |
| BIZ-R02 | 联盟情报奖励/派舰/修理（当前无执行） | C403 C407 非C:雷达奖励派舰 | PARTIAL | src/fleet.mjs；tests/fleet.test.mjs | G | 有界观察、维修移动已有；情报奖励及派舰完整归属缺 |
| BIZ-R03 | 海盗派舰实战与免战扫荡（当前扫荡PARTIAL） | C151 非C:海盗实战 | PARTIAL | src/pirate-sweep.mjs；tests/pirate-sweep.test.mjs | G | 精确扫荡已有；海盗实战、完整奖励和日界缺 |
| BIZ-R04 | 贸易货船补货/返航领奖（当前DATA_ONLY） | C131 C132 C133 C134 | PARTIAL | src/fleet.mjs；tests/fleet.test.mjs | G | 专业缺货、装货、到港领取已有；全范围受D6和证据限制 |
| BIZ-R05 | 联盟商船补货与应聘船长（当前未接） | 非C:联盟商船 | PARTIAL | src/alliance.mjs；tests/alliance.test.mjs | G | 单船补货、应聘船长及私有状态修订已接；收益、补购、隐藏占用缺 |
| BIZ-R06 | 联盟福利礼包领取（当前未接） | 非C:联盟福利 | EXISTING_FUNCTION | allianceView/verifyAlliance; src/alliance.mjs | G | 领取现有福利需权威时间/库存/回包复读 |
| BIZ-R07 | 装备厂制造/收取（当前只有装备DATA） | 非C:装备厂 | PARTIAL | src/equipment-forge.mjs；tests/equipment-forge.test.mjs | G | 自有配方MAKE和到期单批PICK已有；本批明确允许配方内按闲置＋在产部位数量及品质准备一份，固定队列/数量护栏，经同Service/API/专业页/Workflow和父预算，收取确认后才制造；普通材料切片OFFLINE_VERIFIED，通用实际扣取顺序/混用成本仍缺证，缺队列不当空闲 ；本批1至24个不同装备厂同种明确单份MAKE或成熟PICK接原API/专业页/逐厂Workflow，原队列及同部位计数守卫，累计仅初始自有材料父预算，旧单厂兼容，R7/R8 NOT_RUN |
| BIZ-R08 | 海兽培育/成熟收取/材料投喂（当前DATA_ONLY） | 非C:海兽培育 | PARTIAL | src/pet-operations.mjs；tests/pet-operations.test.mjs | G | 明确Pet FEED及服役单级LEVEL已有；后者绑定建筑/UID、私有玩家等级与推送修订，独立确认下级属性及精确经验扣减；普通培育成本/赛季/库存/队列条件已只读展示，无培育动作；培育、成熟领取仍缺可恢复目标身份 |
| BIZ-R09 | 徽章/装备/专武完整养成（当前DATA_ONLY） | C225 C226 C227 C228 C229 C230 | PARTIAL | src/hero-operations.mjs；src/equipment-growth.mjs；src/badge-growth.mjs；tests/equipment-growth.test.mjs | G | 已激活专武升等星、空槽穿戴、装备明确零费首次/正等级升级红精炼星及徽章升级红星已有；完整成长未全 |
| BIZ-R10 | 挂机、邮件及升级依赖计划（当前底层Action已在） | C511 非C:挂机依赖计划 | PARTIAL | src/mail.mjs；src/afk-level-rewards.mjs；tests/mail-claim.test.mjs；tests/afk-level-rewards.test.mjs | G | 单封读领、等级奖励、普通物品/徽章收益及其后明确1/5/10级升级已有；有限原收益→升级准备/API/UI已有；其他实例收益、邮件实例附件及完整范围未齐；UNKNOWN零重放 |
| BIZ-R11 | 世界宝藏货轮抢占（当前未接） | 非C:世界宝藏 | PARTIAL | surveyTreasure/planTreasure/verifyTreasure; src/treasure.mjs | G | 只证无争夺派舰分配及精确汽油净扣；非抢占胜利/奖励闭环 ；本批明确多目标不重复舰队组接原Service/API/专业页/逐项Workflow及固定初始汽油父预算；R7/R8 NOT_RUN |
| BIZ-R12 | 城战读状态、修理、调遣、在线奖（当前只有占位） | C403 C406 C407 非C:城战在线奖 | PARTIAL | src/naval-rules.mjs；tests/naval-rules.test.mjs | G | WorldInfo当前视野、精确ID及资源田读取，不宣称全图完整 |
| BIZ-R13 | 海商王买卖/移动/奖励/免费战令（当前未接） | C521 C522 C523 C524 | PARTIAL | src/trade.mjs；tests/trade.test.mjs | G | 当前港价容量及单BUY、SELL、MOVE、自有SPEED已有；目的地策略、到达收益、奖励战令缺 |
| BIZ-R14 | 工厂独立页面与自选材料包覆盖（当前仅简单排产） | C111 C112 C114 C115 C116 非C:自选包 | PARTIAL | src/production-planning.mjs；src/material-packs.mjs；tests/material-packs.test.mjs | B | 专业生产页、明确自选包及覆盖投影已有；原生产单步加强完整库存精确配方净扣与单份结果。单包及明确2至23项有序兑换→同五维/同Workflow连续持久成功证明→固定工厂/配方单份生产的同一prepare/API/UI及有限Workflow已交。中间兑换前重核来源，合计包与配方父预算固定；投影不进库存，f0f14c5覆盖建议已核完整私有资格并接原prepare；本批独立工厂视图展示本厂队列/成品/配方/可靠实际库存/缺口，候选与配方均明确复用原入口；全日量等原边界未齐，不以投影或UI切片标完整需求完成 |
| BIZ-R15 | 漂浮物种类/数量只读；拾荒与礼包码写缺证 | 非C:漂浮物礼包码 | PARTIAL | src/daily-checklist.mjs#waterFloaterView → 原日常API/总览/页面；本行所在提交（父320b6bb） | P | 原OnWater采集数量与配置类型分开；无拾取/礼包码写，不作实例或到账证明 |
| BIZ-R16 | 农田种植/喂种、委任减时、订单供给水位（当前简单planWorld未有） | C113 C114 非C:农田委任水位 | PARTIAL | src/farm-operations.mjs；tests/farm-operations.test.mjs | G | 委任减时、种子作物水位及单田种收已有；原批量结算未全 |
| BIZ-R17 | 活动幽都驱邪/罗盘/敕令/签到（当前未接） | C501 C502 C503 | PARTIAL | src/daily-checklist.mjs；src/client.mjs；src/compass-wheel.mjs；tests/daily-checklist.test.mjs；tests/compass-wheel.test.mjs | G | 签到/活跃、罗盘和驱邪原值观察保留；当前明确捞尸人联动罗盘自有券抽取子集已接原执行链，其他驱邪/敕令/签到写及完整活动策略仍未齐，不跨活动推定等价 |
| BIZ-R12a | claimWarOnlineReward；参考cityWar:638–670 | 非C:城战在线奖 | PARTIAL | src/daily-checklist.mjs；原CounterInfo采集/日常API/page；tests/daily-checklist.test.mjs及HTTP/PAGE | R | 固定WarPop读取DAILY_WORLD_ONLINE_RWD的num阶段/updateTime；现有48项原查询可只读观察精确阶段及WorldOnlineRwdCfg下一档秒数，未知不补零。GotWorldOnlineRwdRequest为空，WarUtil开放日与客户端时区20/21点窗口、同次回包/权威复读/恢复归属未闭合；无写候选或许可，领取仍局部BLOCKED_EVIDENCE，REAL_UNVERIFIED |
| BIZ-R16a | farmOf；参考world:190；surveyWorld:368 | C113 C114 非C:农田委任水位 | EXISTING_FUNCTION | src/farm-operations.mjs；tests/farm-operations.test.mjs | R | 农田结构、种子、时段观察已有；缺字段UNKNOWN |
| BIZ-R16b | 增强planWorld farmHarvest分支；参考world:1555–1577→runWorld | C113 C114 非C:农田委任水位 | PARTIAL | src/farm-operations.mjs；tests/farm-operations.test.mjs | G | 单田HARVEST与明确1至12田的有限顺序准备/API/UI已有；固定剩余来源，复用原预算/授权/History，单田与组合拒绝身份统一；批量协议结算仍未全 |
| BIZ-R16c | 增强planWorld farmPlant分支；参考world:1579–1687→runWorld | C113 C114 非C:农田委任水位 | PARTIAL | src/farm-operations.mjs；tests/farm-operations.test.mjs | G | 明确空田/成熟田、自选作物及初始自有种子的1至12田有限准备/API/UI已有；收取确认后以同五维私有历史和新调查实际空田证明再播种前置，原授权/累计预算/逐田净扣确认；自动策略与批量协议仍未全|
| BIZ-R16d | appointEffectValue→appointProduceReduce→produceFinalTime；参考world:205,217,234；surveyWorld:383–389 | C113 C114 非C:农田委任水位 | EXISTING_FUNCTION | src/production-planning.mjs；tests/production-planning.test.mjs | B | 委任效果及减时纯投影已有；不更改任命或冒充实际耗时 |
| BIZ-R16e | 增强planWorld内部waterlineOf；参考world:1065–1089 | C113 C114 非C:农田委任水位 | EXISTING_FUNCTION | src/production-planning.mjs；tests/production-planning.test.mjs | B | 原Production水位策略已有；预测收成不进库存 |
| BIZ-R16f | 增强planWorld种子缺口需求；参考world:1091–1130 | C113 C114 非C:农田委任水位 | EXISTING_FUNCTION | src/production-planning.mjs；tests/production-planning.test.mjs | B | 种子需求缺口纯规划接原策略 |
| BIZ-R16g | 增强planWorld过剩作物→成品需求；参考world:1131–1167 | C113 C114 非C:农田委任水位 | EXISTING_FUNCTION | src/production-planning.mjs；tests/production-planning.test.mjs | B | 过剩作物到成品需求纯规划已有；实际消耗走原账本 |
| BIZ-R16h | decideOrderReroll；参考world:274；增强planWorld:872–1029 | C113 C114 非C:农田委任水位 | PARTIAL | src/production-planning.mjs；src/core-operation-adapters.mjs；src/server.mjs；src/page.mjs；src/gameplay-page.mjs；原领域/HTTP/Workflow/页面测试 | B | 已补原缓存预览和原注册Function/Service/API/Workflow的队列/总效果等待、完成/领奖阈值和客户端上限投影；单条等待标记到点仍须复读。明确上海本地时窗、完成计数及等待投影阈值已接原规则/API/UI/共享执行；每次写前重查，阈值通过仍须真实库存，刷新须独立资格。周期及免费配额仍缺证，保留UNKNOWN与KEEP/REFRESH/REVIEW |
| BIZ-R17a | planYoudu kill分支；参考youdu:230–249→runWorld | C501 C502 C503 非C:幽都活动 | PROTOCOL_ONLY | target src/function-registry.mjs; src/dailies.mjs未实现youdu分支 | P | 2026-11-16 Owner明确跳过本项（Owner表示活动已结束）；本轮未提交实现撤回，状态不改为完成。固定v76 EvilExpelInfo独立返回killTotal/claimed/todayKill/alive；Kill请求只有activityId，本地EvilObject._idx未发送。缺今日重置标记、目标同次归属与恢复合同；不从alive或本地对象序号推导资格，写局部BLOCKED_EVIDENCE |
| BIZ-R17b | planYoudu驱邪累计奖励；参考youdu:252–277→runWorld | C501 C502 C503 非C:幽都活动 | PROTOCOL_ONLY | target src/function-registry.mjs; src/dailies.mjs未实现youdu分支 | P | 原参考分项未移植；需活动状态/成本/奖励/账号记忆合同后适配 |
| BIZ-R17c | planYoudu罗盘；参考youdu:279–298→runWorld | C501 C502 C503 非C:幽都活动 | PARTIAL | src/compass-wheel.mjs；src/actions.mjs；原Registry/Service/API/gameplay-page；tests/compass-wheel.test.mjs及HTTP/完整页面测试 | G | 固定v76捞尸人联动活动的明确活动ID、自有铜钱1/5/10/50次受控抽取已接原Function/Service/History/父预算和原生Workflow/有限Loop通用world入口。逐抽配置奖励、typed积分与独立同活动次数/外环及完整库存净入共同确认；完整旧youdu策略及跨活动协议不由同名推导等价，满外环/跨轮和累计领奖仍缺证。REAL_UNVERIFIED |
| BIZ-R17d | planYoudu罗盘累计奖；参考youdu:300–315→runWorld | C501 C502 C503 非C:幽都活动 | PROTOCOL_ONLY | target src/function-registry.mjs; src/dailies.mjs未实现youdu分支 | P | 原参考分项未移植；需活动状态/成本/奖励/账号记忆合同后适配 |
| BIZ-R17e | planYoudu敕令开局；参考youdu:337–347→runWorld | C501 C502 C503 非C:幽都活动 | PROTOCOL_ONLY | target src/function-registry.mjs; src/dailies.mjs未实现youdu分支 | P | 固定v76 EdictInfo返回cost及可选DispEdictSession；session只有rune/shown/patience，无sessionId或revision，Start请求仅activityId。未报session不能自行推定可重新开局；同次开始与重启归属缺证，写局部BLOCKED_EVIDENCE |
| BIZ-R17f | planYoudu敕令作答/settleYouduEdict；参考youdu:317–336,429–445 | C501 C502 C503 非C:幽都活动 | PROTOCOL_ONLY | target src/function-registry.mjs; src/dailies.mjs未实现youdu分支 | P | 固定v76 Ask仅activityId/paperIdx，Guess仅activityId/guess；[99]是独立扫荡路径，普通猜符/揭示不可借用其资格。session无身份或revision，结果与后续/恢复会话关联缺证，写局部BLOCKED_EVIDENCE |
| BIZ-R17g | runYouduActive；参考youdu:378–418 | C501 C502 C503 非C:幽都活动 | PROTOCOL_ONLY | target src/function-registry.mjs; src/dailies.mjs未实现youdu分支 | P | 固定v76签到请求明确activityId/checkId，响应checkId列表/reward；LinkageLSRUtil.signRedDot按getOpenDays(openTime)与配置signDay相等判断当日，独立时区/游戏日及同活动签到状态复读尚未闭合。不能由未领列表或普通每日任务resetTime授资格，写局部BLOCKED_EVIDENCE |
| BIZ-R17h | runYouduSigns；参考youdu:481–550 | C501 C502 C503 非C:幽都活动 | PARTIAL | src/daily-checklist.mjs；src/client.mjs；tests/daily-checklist.test.mjs | R | 可信窗口签到观察已有；完整目录、日界、资格、成本及领取结算缺 |
| ORD-001 | 读取居民订单 | C121 | EXISTING_FUNCTION | surveyWorld/surveyOrderExecution; src/world.mjs; src/order-execution.mjs | R | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-002 | 解析需求物品与数量 | C122 | EXISTING_FUNCTION | surveyWorld/surveyOrderExecution; src/world.mjs; src/order-execution.mjs | R | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-003 | 库存与缺口计算 | C123 | EXISTING_FUNCTION | surveyWorld/surveyOrderExecution; src/world.mjs; src/order-execution.mjs | R | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-004 | 普通订单经验 | C124 | EXISTING_FUNCTION | surveyWorld/surveyOrderExecution; src/world.mjs; src/order-execution.mjs | R | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-005 | 特殊订单经验 | C124 | EXISTING_FUNCTION | surveyWorld/surveyOrderExecution; src/world.mjs; src/order-execution.mjs | R | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-006 | 金币奖励解析 | C124 | PARTIAL | src/order-rewards.mjs；tests/order-rewards.test.mjs | B | 普通SUM基础奖励、特殊直接reward及事后关联已有；最终金币未知，MIN_GOLD不开放 |
| ORD-007 | 规则契约校验 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-008 | 规则增删编辑/排序/启停 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-009 | 原始物品ID匹配与名称展示 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-010 | 禁止物品 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-011 | 必须包含全部指定物品 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-012 | 经验GT/GTE阈值 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-013 | 单物品需求数量上限 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-014 | 库存规则及最终独立库存检查 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-015 | 优先级短路评估 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-016 | 每条规则独立KEEP/REFRESH/REVIEW | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-017 | 全通过后建议提交 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-018 | 账号隔离持久化/安全回退 | C127 | EXISTING_FUNCTION | loadOrderRules/saveOrderRules; src/order-rules-store.mjs | L | 精确账号持久化，损坏保留不覆盖 |
| ORD-019 | Snapshot模拟与解释 | C125 | EXISTING_FUNCTION | evaluateOrder/evaluateOrders; src/order-rules.mjs; previewOrderRules src/server.mjs | L | 五类规则和解释轨迹存在；预览不等于执行 |
| ORD-020 | 跨订单库存预留 | C123 | EXISTING_FUNCTION | ResourceLedger/evaluateOrders/planOrderExecution; src/order-rules.mjs; src/order-execution.mjs | B | PHASE1/2已共享跨订单预算；独立快照预览与执行计划需区分 |
| ORD-021 | 规则建议→真实提交/刷新 | C126 | PARTIAL | planOrderExecution/executeOrderOperation; src/order-execution.mjs | B | SUBMIT闭环存在；REFRESH仍因免费配额证据缺失被阻塞 |
| ORD-022 | 订单执行历史持久化 | C128 | EXISTING_FUNCTION | createExecutionHistory/createOperationService; src/execution-history.mjs; src/operation-service.mjs | B | 账号级持久历史已实现；真实写入/重启恢复仍待最终验收 |
| STG-001 | 从当前主线启动 | C201 C202 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-002 | 主线专用LEFT授权 | C203 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-003 | 关卡号/Boolean胜负检查 | C203 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-004 | 胜利推进下一关 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-005 | 明确战败后重试 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-006 | 首次战败立即停止 | C204 C606 | EXISTING_FUNCTION | src/stages.mjs；src/stage-function.mjs；src/page.mjs；tests/stages-view.test.mjs | S | 原API及独立首次战败勾选已有，保留轮询草稿且换账号清空；本批Function与Workflow确认战败后FAILED停止，未知结果不续跑；真实未验 |
| STG-007 | 最大总开战次数 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-008 | 最高目标关卡 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-009 | 胜利后随机10–11秒 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-010 | 下一关倒计时/随机时长历史 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-011 | RATE_LIMITED独立停止 | C205 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-012 | 同账号排他/未决锁 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-013 | 停止/失效/删除取消 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-014 | runId/generation/迟到保护 | C204 C606 | EXISTING_FUNCTION | createStageRunner/parseStageResult; src/stages.mjs | S | 现有主线Runner逻辑保留；历史离线通过，真实战斗/限频效果仍待验证 |
| STG-015 | 内存历史/状态重读 | C204 C606 | EXISTING_FUNCTION | src/stages.mjs；src/stage-history.mjs；tests/stage-history.test.mjs | S | 内存当前状态保留，逐场持久历史另已接；重启只读 |
| STG-016 | 持久化Runner历史/自动恢复 | C204 C606 | PARTIAL | src/stages.mjs；src/stage-history.mjs；tests/stage-history.test.mjs | S | 持久历史与只读重启已有；自动恢复标题不授予写重放，UNKNOWN保守锁 |
| STG-017 | 其他战斗模式支持 | 非C:其他战斗模式；W08/W14（不并入C204/C606完成数） | PARTIAL | src/expedition-formations.mjs；src/trial-challenge.mjs；tests/expedition-formations.test.mjs | G | 其他模式阵容和经验试炼子集已有；全模式战斗阵营奖励未全 |
| FRM-001 | 当前主线阵容读取 | C211 C207 | EXISTING_FUNCTION | surveyFormation/parseFormation; src/formation.mjs | R | 实时阵容与本次战斗阵容保持不同证据 |
| FRM-002 | 已解锁阵型模板ID读取 | C212 | EXISTING_FUNCTION | surveyFormation/catalogFrom; src/formation.mjs | R | 模板ID不是完整队伍存档 |
| FRM-003 | 保存/修改当前阵容 | C213 C214 | EXISTING_FUNCTION | planFormation/verifyFormation; src/formation.mjs | G | 完整SaveFormation与复读已做 |
| FRM-004 | 应用已解锁阵型模板 | C213 C214 | EXISTING_FUNCTION | candidate/planFormation/verifyFormation; src/formation.mjs | G | 按职业重排站位/保留petUid；只用已解锁模板 |
| FRM-005 | 解锁阵型模板 | 非C:解锁阵型 | EXISTING_FUNCTION | src/formation-unlock.mjs；tests/formation-unlock.test.mjs | G | 自有普通图纸原单目标及明确1至23个不同模板逐项解锁；API/专业页/Workflow同源，R7待测；D6购买补图拒绝 |
| FRM-006 | 更换上下阵英雄 | C213 C214 | EXISTING_FUNCTION | src/formation.mjs；tests/formation.test.mjs | G | 明确完整英雄站位上下阵SAVE与独立复读已有；非自动换阵 |
| FRM-007 | 具名多套完整英雄队伍预设 | 非C:具名完整队伍预设 | EXISTING_FUNCTION | src/named-formations.mjs；tests/named-formations-service.test.mjs | G | 整队具名存改删、只读重启和准备应用已有；应用需原新计划授权 |
| FRM-008 | 闯关前应用并确认阵容 | C214 C204 | EXISTING_FUNCTION | assertFormationReady; src/operation-service.mjs; createStageFunction src/stage-function.mjs | G | 同Session保存/复读后允许主线；明确有限候选确认战败分支已有，统计/规则优化仍未全 |
| PRO-001 | 公会科技 | C306 C307 | PARTIAL | src/alliance.mjs；tests/alliance-tech.test.mjs | G | 科技状态、精确单升及扣点复读已有；科技重置缺合同 |
| PRO-002 | 公会订单与互助 | C301 C302 C303 C304 C305 非C:联盟订单 | PARTIAL | src/alliance.mjs；tests/alliance-tech.test.mjs | G | reqId精确绑定成员求助单，已有展示 |
| PRO-003 | 舰队维修/编队/派遣 | C401 C402 C406 C407 C408 | PARTIAL | src/fleet.mjs；tests/fleet.test.mjs | G | MyFleets+OnWater队伍读取已有，不用MyFleets代替阵容复读 |
| PRO-004 | 货船操作 | C131 C132 C133 C134 | PARTIAL | src/fleet.mjs；tests/fleet.test.mjs | G | CargoShips读取和通用Fleet展示已有 |
| PRO-005 | 世界与限时 Boss 战斗 | 非C:世界/限时Boss | PROTOCOL_ONLY | surveyNaval/navalView; src/naval-rules.mjs | P | 写候选不生成；独立战斗语义和结果关联缺失 |
| PRO-006 | 博物馆展陈与探险 | C141 C142 C143 C144 | PARTIAL | src/museum.mjs；tests/museum.test.mjs | G | 探索次数/进度/状态可读，COMPLETE_UNSETTLED独立 ；本批明确多展柜放入/替换/撤下接原API/专业页/逐项Workflow，目标摘要和固定UID，原单项兼容；C144结算仍冻结，R7/R8 NOT_RUN |
| PRO-007 | 藏品养成 | 非C:藏品养成 | PARTIAL | src/antique-growth.mjs；tests/antique-advanced.test.mjs | G | 古董激活、专属碎片星、套装、精通及万能兑换已有；完整范围未全 |
| PRO-008 | 贸易与货运玩法 | C521 C522 C523 C524 | PARTIAL | src/trade.mjs；tests/trade.test.mjs | G | 原贸易单步写、观察和WAIT已有；全策略、目的地价格与到达收益缺 |
| PRO-009 | 寻宝与掠夺 | 非C:世界宝藏 | PARTIAL | surveyTreasure/planTreasure/verifyTreasure; src/treasure.mjs | G | 列表/排名/防守+无争夺派舰及完整库存精确汽油净扣；缺抢占/战斗/领奖 ；本批明确多目标不重复舰队组接原Service/API/专业页/逐项Workflow及固定初始汽油父预算；R7/R8 NOT_RUN |
| PRO-010 | 其他模式阵容 | 非C:其他模式阵容 | PARTIAL | src/expedition-formations.mjs；src/trial-challenge.mjs；tests/expedition-formations.test.mjs | G | 主线与远征阵容子集已有；其他模式未全，不外推主线LEFT |

本附录按具体子Function补充证据；第5节95项完整需求分类为统计权威，子Function存在不能覆盖整项PARTIAL。所有测试均为指定版本历史证据，本轮没有重跑。

## 附录B — PHASE3历史Function、API/UI及测试证据（a505019快照）

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

- 世界宝藏须保留为独立产品子域（PRO-009/BIZ-R11），不得混入 C141-C144 Museum 探险。`treasure.mjs:20` survey/query，`:54` 规划，`:87` 精确 MyFleets.treasureLootUid 复读；`tests/treasure.test.mjs:26,37,46,47`；`tests/naval-protocol.test.mjs:9`。当前为 PARTIAL：读 Stats/List/Rank/Defence、无人防守且赛季/次数/油量/耐久满足的派舰；SUCCESS须精确舰队关联及完整库存汽油净扣共同确认派遣，无争夺胜负/排名奖励闭环。
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



## 附录C — 历史文档静态校验与保护复核（原规划批次）

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
## 附录D — 持续执行历史登记（D.1–D.28，各节为提交时快照）

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

### D.20 BIZ-R09 自有闲置徽章穿入已解锁空槽（2026-11-12）

父提交 `8f1297af9725f741258044a0bad7edd3154113a7`。沿用 W07 的 badge-growth Adapter，增加显式 `action:'put-on'` 与精确 `heroId/uid/pos`；默认 LEVEL 的配置依赖、报价与计划身份不变。Function/UI EXISTING、STATIC_VERIFIED、OFFLINE_VERIFIED、REAL_UNVERIFIED；BIZ-R09 本分支已接入共享执行器、预算、磁盘历史、原 API/Workflow 与英雄页。C227 替换、C228 其他升级分支和 W07 全包仍未完成。

固定 v76 `BadgeSelectItem._onBtnOn`（byte 485010）发 `PutOnBadgeRequest {uid,heroId,pos}`，没有专用 Response；包、模块哈希和偏移见 `BADGE_PUT_ON_EVIDENCE`。要求玩家达到唯一 ModuleOpenCfg 的“英雄徽章”门槛（固定配置 12），目标英雄职业匹配，HeroBadgeUnlockCfg 对应位置已解锁（1/2/3/4 槽分别英雄等级 1/70/90/110），且槽位为空。完整 Badges 池与 AllHero 镜像一致，目标必须是自有闲置 UID，64 位 UID 不经浮点数。D6 只接纳准确字段和真实空成本数组，资源无消耗仍需单次授权和持久 badge UID 预留。

复读确认完整池和库存不变，同 UID 原属性进入指定槽位，其他英雄和槽位不变；仅目标英雄合法派生战力/属性可变。事实必须新鲜、属于当前账号/角色/世界/连接，写后来源时间不得早于基线。静默观察窗口自身不算效果；无效果或异常状态保持 UNKNOWN 和 UID 预留，重启不得重放。页面显式选择模式、英雄空槽后重新探测，可见精确闲置候选和无资源消耗，任何模式或槽位变化均撤销旧选择及授权。

离线验证命令：`node --test tests/actions-safety.test.mjs tests/badge-growth.test.mjs tests/badge-growth-service.test.mjs tests/badge-put-on.test.mjs tests/function-contracts.test.mjs tests/function-registry.test.mjs tests/farm-forge-full-page.test.mjs tests/farm-forge-api.test.mjs tests/gameplay-api.test.mjs tests/gameplay-view.test.mjs tests/equipment-growth.test.mjs tests/equipment-put-on.test.mjs tests/execution-history.test.mjs tests/resource-ledger.test.mjs tests/operation-service.test.mjs tests/business-functions.test.mjs tests/workflow.test.mjs`。

**421/421 PASS，0 fail/cancelled/skipped/todo，7.35 秒**。独立代码复核未发现待修问题；29 项领域/服务复核与本次重叠。包括真实本地 Codec、共享执行器与磁盘派发前历史、空成本 UID 预算、无效果 UNKNOWN/重启、完整页面/账号隔离和原装备/LEVEL 分支。首轮页面测试选到新增 PUT-ON 样例而误查已佩戴表，已按模块和动作种类选择原 LEVEL 夹具，未改业务规则。不是 R7，未连接真实游戏。

W11/C144 静态复核仍缺可恢复的“待领/已领”权威身份：Complete 在计时结束后打开临时结果页，Reward 由该页发送；可选 exploreStage 不足以区分重启前后领取状态。保持缺证，不以收益或空响应替代。并行推进 PRO-007 只读古董属性总览与 W12 扫荡只读事实；完整结算、培养及扫荡执行范围不因这些只读增量缩小。E09/E20/E21/E23 增加徽章精确空槽与未决恢复验收。R8 仍在 R7 后由 Owner 单独授权。

### D.21 W11/PRO-007 古董属性只读总览（2026-11-12）

父提交 `b29ba89c26296818ae5ac2d4770d69c547349c87`。新增独立 Antique 只读子边界 `surveyAntiqueSummary → antiqueSummaryView → OperationService.surveyAntiqueAttributes → POST /api/antiques/summary`，在博物馆页提供显式查询。它是 PRO-007 的“汇总”分支，不把 Museum 展陈、藏品数量或属性查询算作激活/培养/兑换/精通已完成；PRO-007 与 W11 全包仍 PARTIAL。汇总分支 Function/UI EXISTING、STATIC_VERIFIED、OFFLINE_VERIFIED、REAL_UNVERIFIED，不伪造没有写动作的完整写入 Function。

固定 v76 `AntiqueView._onBtnTips`（byte 307873，模块 SHA256 `2058e8b78473a77e274b78db728ac74338dda0ee2d3264bd3276edd337eb8731`）只发 `AntiqueAttrSummaryRequest {}`，响应独立提供 items 和 effects。包/入口哈希在 `ANTIQUE_SUMMARY_EVIDENCE`。属性按全局、仅 heroCamp、仅 heroProf 分组；不展平双重范围、重复属性/效果或损坏字段。attr/value 缺失不能借 protobuf 默认值冒充零；明确空结果与 UNKNOWN 分开。可选 AdditionAttrOverviewCfg、HeroFactionCfg、HeroCareerCfg、AntiqueEffectLibCfg 只补名称和显示类型，不补数值或猜百分比/符号换算。页面“原值/类型”分列。

现有会话必须 READY，Origin/CSRF/JSON、唯一精确账号与空参数检查在领域请求前完成；拒绝额外查询/请求字段，不创建 Session、客户端或全量采集。读取沿用账号互斥锁，撤销旧服务端计划；账号/角色/世界/连接代际变化或取消后不返回旧结果。页面独立显式触发、读取中清空旧值、切换账号丢弃迟到响应；无需启用养成配置，不创建历史、预算、许可或写入。仅增加 DOMAIN_SURVEY_ONLY 元数据：业务读取目录 29 项，其中 13 项非入口读；原 ENTRY_QUERIES 与 Explorer 48 项不变。

离线证据：领域/目录/完整页面 95/95，独立合成 HTTP handler API 14/14。联合命令 `node --test tests/antique-summary.test.mjs tests/antique-summary-api.test.mjs tests/data-catalog.test.mjs tests/explorer-view.test.mjs tests/farm-forge-full-page.test.mjs tests/gameplay-api.test.mjs tests/gameplay-view.test.mjs tests/museum.test.mjs tests/museum-shortage.test.mjs tests/operation-service.test.mjs tests/function-registry.test.mjs tests/function-contracts.test.mjs tests/phase2-api.test.mjs tests/stage-api.test.mjs tests/pirate-sweep.test.mjs` 为 **325/325 PASS，0 fail/cancelled/skipped/todo，7.41 秒**（含 8 项并行 W12 测试，由 D.22 另提交）。最后仅将表头明确为“原值/类型”。真实本地 Codec/固定配置、独立作用域、显式零与缺字段、失败/取消、六种互斥和四类延迟身份变化均覆盖。首跑新增页面测试误用不存在的 harness 接口，按原 run/viewGuard 方式切换后通过，未改变隔离规则。

E14 增加汇总作用域、原值/单位、明确空/UNKNOWN、只读和账号切换验收。未执行 R7 或真实游戏；培养/兑换/精通及 C144 结算身份缺证继续保留，R8 不提前。

### D.22 W12 野怪扫荡只读次数与目标等级关系（2026-11-12）

父提交 `f0408bb6afffcbca2689780595b6da455f7d2c11`。在现有 `collectState → summarize → formatState` 加独立 `view.pirateSweep`，保留原 pirates 投影，原 48 项采集不增请求或信号。此“次数和目标事实查看”分支 EXISTING_FUNCTION、OFFLINE_VERIFIED、REAL_UNVERIFIED。它不新增扫荡写入口，也不替代 W12/C151 执行、C152 召唤、计次/UNKNOWN 和 E15 验收；W12 继续 PARTIAL。

`AllPirateResponse.sweepTimes` 只表示当前读到的已用次数，只有真实自有非负 int32 字段才采纳，缺字段、原型默认零、失败/NOT_EXECUTED/UNKNOWN 或损坏结果元数据均不能冒充零。总额与剩余固定 UNKNOWN，原因是当前缺新鲜完整额度权威。完整有效 pirates 列表保留准确正 int32 uid/type/level/cityId，重复 UID 或任一损坏目标不输出部分列表；完整成功 PirateKillRecord 按 type/maxKilledLevel 解析，重复/损坏/缺字段使关系 UNKNOWN。明确空首杀记录中的未列类型可判需先首杀；目标等于/低于/高于已杀最高等级分别仅显示等级关系、低档需确认、先首杀，不生成 executable 候选或执行许可。

静态 v76 PiratePop/PirateUtil 的已核包/模块哈希和 UTF8 偏移保留在 `PIRATE_SWEEP_READ_EVIDENCE`。总额计算线索为 PirateParamCfg 基数 + VipLevelCfg 当前等级效果 + 有效月卡效果；月卡是否有效依赖服务器时间。LoginResponse.vip 与 SCVipUpdate 有初始/推送来源，但现有 GameClient 没有持续跟踪当前 VIP，且无新鲜 VipInfoRequest；不能拿登录旧值、基数 10 或两条固定月卡配置当前零加成猜实时额度。DailyReset 时区也不能统一假定 UTC+8。下一步应核实并实现完整当前账号 VIP/卡/可信游戏日生命周期，再接共享预算与复读，不把本只读分支当执行完成。

`node --test tests/pirate-sweep.test.mjs tests/data-catalog.test.mjs tests/explorer-view.test.mjs`：**28/28 PASS，0 fail/cancelled/skipped/todo，1.64 秒**（8 项新增专项）；另随 D.21 的 15 文件联合 **325/325 PASS，7.41 秒**，是重叠证据，不累计。真实本地 Codec、原 collector 和合成快照检查显式零/缺失、原始字段保留、坏/重复记录、失败来源与原 48 请求集合；CLI 显式区分已用、未知总额、未知剩余，不暗示可执行。未运行 R7 或真实游戏。E15 增加次数方向、UNKNOWN 与等级关系只读验收，原执行和真实验收条件保留。

### D.23 W11/PRO-007 藏品激活与专属碎片单次升星（2026-11-12）

父提交 `1a70729be976eb4faf4d11be4dc1dfbd4c276964`。新增独立 antique-growth Adapter 与静态 Function 合同，复用 OperationService、共享执行器、ResourceLedger、ExecutionHistory、原 Gameplay/Operations API 和 Workflow ACTION。博物馆页增加藏品/自有碎片表、藏品选择、激活/升星种类及单项候选；选择只改草稿，重新探测、预览和精确授权后才可执行。默认关闭。当前静态 Adapter 16 个、含动态 Stage 共 17 个合同；PRO-007 保持独立 Inventory ID，不冒用 C141–C144。此两个原子分支 EXISTING_FUNCTION/EXISTING_UI、STATIC_VERIFIED、OFFLINE_VERIFIED、REAL_UNVERIFIED；PRO-007、W11 全包仍 PARTIAL。

固定 v76 包/入口/本地协议/配置已重新只读核实，具体字节偏移、原始模块 SHA256 和摘要边界在 `ANTIQUE_GROWTH_EVIDENCE`。TopOperateView/ModuleOpenUtil 的“藏品”门槛取唯一 ModuleOpenCfg（固定 10 级）。AntiqueItem 激活发 `ActivateAntiqueRequest {id}`，消耗该 AntiqueBaseCfg.activeFrag 数量的 `antiqueId+'碎片'`；AntiqueDetailPop 单次升星发 `AntiqueStarUpRequest {id,universal:false}`，取下一档 AntiqueStarCfg，按 BLUE/PURPLE/ORANGE/RED 分支消费对应专属碎片；固定 25 档连续配置决定上限。不得购买补齐、消耗万能碎片或混入套装/兑换/精通请求。两者均无专用 Response，观察窗口不证明成功。

权威读取完整 AllAntique（antiques/suits/masterLv）、AllItem 和 AllResource，拒绝缺字段、重复、损坏与原型默认值冒充状态。激活要求目标原不存在，复读明确出现同 ID 的自有零星条目；省略 star 或其他初始值保留 UNKNOWN。升星要求已有精确条目，恰好 +1。目标以外藏品、精通、套装身份和等级保持，专属碎片必须精确净扣，其余库存不变。ACTIVATE 仅对 AntiqueSuitCfg 明确“拥有紫色藏品”关联的既有套装，允许服务器 effectiveNum/advEffectValue 派生值变化；仅验证值形状和受影响身份，不声称验证了奖励公式、阈值、增量或因果关联。新套装身份/等级、其他套装变化仍 UNKNOWN；STAR 无此派生豁免。激活绑定套装规则且不绑定升星价格，STAR 只绑定其价格，默认查看绑定并集。

事实以私有 WeakMap 绑定原始账号/角色/世界/代际/连接、内容摘要及各来源时间，序列化克隆、字段篡改、旧来源续期不能授权。慢兄弟读取不得刷新早已过期的藏品事实；相同完整响应重排行不改变计划身份。资源与唯一 `{type:'antique',id:antiqueId}` 实体预算派发前持久化，任何无效果/非预期变化保留 UNKNOWN 与预算，重启不自动重发。公开计划身份使用 SHA256 摘要，避免携带完整库存与配置；内部请求和 configEvidence 不公开。业务读取目录同步登记实际三来源的 antique-growth 消费关系，保持原 48 采集与 29/13 业务读数量不变。

离线命令（启动前对全部 34 个路径逐一 Test-Path）：

`node --test tests/antique-growth.test.mjs tests/antique-growth-service.test.mjs tests/antique-summary.test.mjs tests/antique-summary-api.test.mjs tests/actions-safety.test.mjs tests/function-contracts.test.mjs tests/function-registry.test.mjs tests/gameplay-settings.test.mjs tests/farm-forge-full-page.test.mjs tests/farm-forge-api.test.mjs tests/gameplay-api.test.mjs tests/gameplay-view.test.mjs tests/museum.test.mjs tests/museum-shortage.test.mjs tests/operation-service.test.mjs tests/execution-history.test.mjs tests/resource-budget.test.mjs tests/run-budget.test.mjs tests/run-budget-safety.test.mjs tests/run-budget-service.test.mjs tests/workflow.test.mjs tests/equipment-growth.test.mjs tests/equipment-growth-service.test.mjs tests/equipment-put-on.test.mjs tests/badge-growth.test.mjs tests/badge-growth-service.test.mjs tests/badge-put-on.test.mjs tests/pirate-sweep.test.mjs tests/data-catalog.test.mjs tests/explorer-view.test.mjs tests/hero-operations.test.mjs tests/hero-service.test.mjs tests/hero-exclusive-star.test.mjs tests/hero-exclusive-service.test.mjs`

最终 **838/838 PASS，0 fail/cancelled/skipped/todo，12.88 秒**。15 项领域、6 项真实本地 Service/Codec/磁盘历史与 218 项合同/页面/HTTP 隔离证据均与此重叠，不累计。覆盖当前固定配置、紫色派生范围、完整库存/藏品归一化、门槛/上限/余额、成本与唯一实体预算、修改/过期/账号变化、无专用响应和 UNKNOWN 恢复，保留原装备/徽章/英雄/Museum/Workflow/预算回归。首轮共享测试尚固定 16 个合同，已按新增第 17 个校准；复核发现库存返回顺序影响身份，已仅将计划库存按 ID 排序并新增实际重排行测试；最终复核将公开 identity 改摘要后重新跑完整命令。D.20 命令中 resource-ledger.test.mjs、business-functions.test.mjs 当前并不存在，不能将它们算作已运行文件；421 的原始结果保留。本次使用实际 resource-budget/run-budget/run-budget-safety/run-budget-service，并先验路径，纠正覆盖范围。

E14 增加激活/单星、对应碎片、明确零星/缺失、既有套装派生观察和意外身份/精通变化；E20/E21/E23 增加实体预算持久化、无效果 UNKNOWN、重启与隔离。后续仍需逐项完成 PRO-007 套装升级、碎片兑换、精通和万能材料独立合同，以及 C144 结算恢复身份、W12 可靠额度等原工作包。未运行 R7、真实游戏或 R8，未 push/merge；总目标继续 ACTIVE，R8 必须在 R7 后由 Owner 单独授权。

### D.24 W11/PRO-007 单次套装、精通及自有万能碎片兑换（2026-11-12）

父提交 `960fa2be74fbc9c17ae5ce95e12383f124fd9ce1`。在原 antique-growth Adapter 增加显式 `suit/master/exchange`，保持 17 个合同、PRO-007 独立身份及原 ACTIVATE/STAR 的完整 operation JSON、配置依赖和计划 identity 不变。五类具名写请求与 D.21 的独立属性汇总现在均有受控离线业务链；PRO-007 全范围仍 PARTIAL，直接万能/混合升星仍受限；此三分支 EXISTING_FUNCTION/EXISTING_UI、STATIC_VERIFIED、OFFLINE_VERIFIED、REAL_UNVERIFIED。W11/C144 结算恢复及其他原工作包继续保留，不将此增量计作 R7 或全产品完成。

重新只读核验固定 v76 包 SHA256 `4fd1f03034b78b0ea0d80590ce1082aa805529b91b2ef99ced9ca2d9f00c2444` 与 main/game.js 入口 SHA256 `a6046fcc2ad7a3424282e9f8b51073656f5ae8d48742129743560bf958266c54`。新增 AntiqueMasterPop byte 257076、请求 byte 261306、模块 SHA256 `64b192c66b3ad15a7f11cc6704b14cc965553a63fddef55ab5ccd41540ce9dd9`；FragExchangePop byte 2772381、请求 byte 2778539、模块 SHA256 `cb98aefaca24d75fd3a5c0f9ea34909eedd3f81b3299eb257f627027b8324911`；套装请求 byte 300009。模块摘要覆盖 System.register 起点至下一模块起点，含尾空白，记录在 ANTIQUE_GROWTH_EVIDENCE。仅在内存解包和分析代码，没有执行游戏代码、连接或凭证读取。

- SUIT：`AntiqueSuitLevelUpRequest {id}` 无专用响应。缺行或明确 level=0 只激活到 1，真实零成本；BLUE/PURPLE/ORANGE 需拥有本套全部成员，RED 需至少两件。已有正等级逐次 +1，按下一档 AntiqueSuitLvCfg 双成本扣 GOLD 与同品质藏品经验，同时受该品质上限及当前精通 maxSuitLv 限制。精通 0 不阻塞首次套装激活，但不能据此升级已有套装。完整复读只允许目标套装等级 +1，其 effectiveNum/advEffectValue 是合法服务器观察值，不推断奖励或属性公式。
- MASTER：`AntiqueMasterLevelUpRequest {}` 必须同时取得自有正确 next masterLv 的专用 Response 与独立完整复读；仅响应或仅状态改变都不足以确认。累计自有藏品星数达到下一 AntiqueMasterLvCfg.totalStarNum，未达上限；首级真实零成本，后续只消耗明确的“藏品大师经验”。预览显示配置属性原值，不宣称已验证英雄最终属性。
- EXCHANGE：`AntiqueFragExchangeRequest {antiqueId,fragItemId,num}` 无专用响应。仅明确已激活、未满星藏品，来源必须是 AntiqueBaseCfg.universalItemId 与 ItemCfg 对应品质的自有万能碎片，数量为正 int32 且不超过持有；允许超过下一星缺口。独立复读须确认来源精确净扣 num、`antiqueId+'碎片'` 等量净增、完整藏品/套装/精通及其他库存不变；目标加法溢出事先阻断。兑换不自动激活或升星，所得材料不提高父运行原始预算额度。

追加静态复核纠正 D.23 的客户端描述：byte 251108 的唯一 StarUp 调用实际传 `universal:this._isAutoExchange`，不是固定 false；byte 248643 合并专属与万能数量检查足够，byte 251788 的按钮写私有开关，AntiqueUtil byte 303836 读取该开关。D.23 的 `universal:false` 是当前受控合同，不应外推为客户端全部行为。当前明确保留 DIRECT_UNIVERSAL_STAR 限制，独立 EXCHANGE 不冒充直接/混合扣款合同完成；待核实精确扣除分配后再施工。

保留原三来源、账号/角色/世界/代际/连接与各来源时效的私有事实绑定。SUIT / MASTER 分别预留唯一 `antique-suit:suitId` / `antique-master:GLOBAL`，EXCHANGE 使用原 `antique:antiqueId`；成本及实体派发前必须写入磁盘。无效果、错等级、缺/错响应、错扣/错到账、其他状态变化均保持 UNKNOWN 与预留，重启不重放。零成本仍需具体单批许可。公开计划只含摘要 identity，内部请求与配置证据不出 API；原 Operations API/Workflow 共用执行器不复制。页面提供五种明确模式、套装选择和兑换数量；修改只更新草稿并撤销旧预览/授权，必须重新探测。默认关闭、账号切换与迟到结果隔离保留。

联合回归启动前逐一 Test-Path 检查实际 36 文件：D.23 的 34 文件集合，加 `tests/antique-advanced.test.mjs`、`tests/antique-advanced-service.test.mjs`，随后 `node --test` 一次运行全部。最终 **921/921 PASS，0 fail/cancelled/skipped/todo，19.63 秒**。其中新增领域 14 项、真实本地 Service/Codec/磁盘历史 36 项（含五种免费/消耗组合的持久化失败零传输）、完整页面五组合与旧能力重叠，不重复累计。确认完整当前配置支持全部三分支；真实共享父预算用例确认库存 100→102 后原材料额度仍为 100，且同一实体不能重复预留。独立复核还与父提交逐字节比较原 ACTIVATE/STAR 完整 operation，均相同。

首轮审查复现共享 D6 的成本数组子类可覆写迭代方法，导致实际 RUBY 被伪装。现 Ruby 检查调用原生 some，exactCosts 要求标准数组及逐索引 own data descriptor；新增 RUBY 子类、普通伪成本子类和 getter 成本回归，原复现已拒绝。付费硬边界、精确资源形状及原测试均保留。Service 初跑 31/31 成功，因复制全部无关配置耗时 89.31 秒，随后仅投影七张完整相关配置表，不删行或伪造配置，并追加五项持久化失败后纳入最终联合回归。只将已合法的 exchange 模式改为 unknown-mode 的非法参数断言，没有删除失败用例或放宽确认。

E14 增加套装首次免费激活、品质成员门槛、精通等级/星数门槛、双成本、明确精通响应、兑换精确扣入与非目标状态；E20/E21/E23 增加零成本实体预留、磁盘失败零传输、收入不扩预算、UNKNOWN 重启与页面账号隔离。原五份未跟踪输入的 SHA256 与历史基线一致。未运行 R7、真实游戏或 R8，未 push/merge；Goal 保持 ACTIVE，R8 仍须在 R7 后由 Owner 单独授权。
### D.25 W12 同连接连续 VIP 等级权威与只读观察（2026-11-12）

父提交 `2097f7d362a17a6ec98205bd763d96baa9db1073`。在真实 GameClient 内用私有 WeakMap 跟踪当前连接的 VIP_LEVEL，实际调用链为 `readVipLevel → collectState.sessionFacts.vipLevel → pirateSweepView → summarize/formatState`，不是孤立工具。此基础与只读分支 EXISTING_FUNCTION、STATIC_VERIFIED、OFFLINE_VERIFIED、REAL_UNVERIFIED；W12/C151 仍 PARTIAL，没有增加扫荡写动作或把额度猜为已知。

固定 v76 的 ModelManager byte 4644292、更新方法 byte 4664885，模块 SHA256 `43daf7b7886502e2eb33949b2f552dd736da3f4ad34f10cedc391e9c5516be7e`；包/入口/协议指纹与前轮一致，详见 LIVE_VIP_LEVEL_EVIDENCE。Model 直接替换 VIP 字段，不支持把缺 vipLevel 的 push 当作保留旧等级。实际登录字段为 `LoginResponse.playerInfo.vip.vipLevel`，更正 D.22 的简写；本增量只证明等级，不声称 vipExp 或其他 VIP 信息完整。

登录锚点要求明确 own result=0、完整精确 playerId/worldId、own VIP 非负 int32 等级，以及构造者账号/代际、当前 connectionId/socket；明确零与 protobuf 原型默认零分开。锚定发生在 READY 发布前；有效有序 SCVipUpdate 在 message/pending 观察者前更新等级。缺/坏字段、无序 VIP 更新、序列缺口、解码失败或身份/连接变化永久使本次登录权威失效，后续推送不能自行续期，必须新登录；重复帧不污染当前等级。connect 起始和每个 terminal 清空，旧登录/旧 socket 回调不能污染新连接。没有登录上下文的旧客户端仍可使用原只读传输，但 VIP 为 UNKNOWN；不改变心跳阈值和普通传输序列行为。

收集器保持原 48 请求集合，不增 Vip 查询、信号或写请求。开始采集时捕获账号/代际/连接，全部读取结束后只调用一次当前等级读取，返回后再核同一上下文；期间发生切换则 UNKNOWN。导出统一标记 OBSERVED 和采集时间，表示历史显示数据，不能把缓存重新当成 live CURRENT；缺字段、继承字段、坏值、失败读取和旧 loginResponse 均不回填。CLI 明示“本次采集的连接观察值”，扫荡 total/remaining 仍为 null；下一次采集必须再次访问 live tracker。

启动前逐一 Test-Path 检查实际 51 文件：D.24 的 36 文件集合，追加 `tests/client-vip-facts.test.mjs`、`tests/client-lifecycle.test.mjs`、`tests/client-clock-facts.test.mjs`、`tests/client-unverified-write.test.mjs`、`tests/business-transport-freshness.test.mjs`、`tests/execution-lifecycle.test.mjs`、`tests/state-facts.test.mjs`、`tests/server-runtime.test.mjs`、`tests/explorer-api.test.mjs`、`tests/gameplay-locks.test.mjs`、`tests/gameplay-execution.test.mjs`、`tests/operations-api.test.mjs`、`tests/operation-recovery-api.test.mjs`、`tests/execution-memory-api.test.mjs`、`tests/stages-api.test.mjs`。随后一次 `node --test` 联合 **1122/1122 PASS，0 fail/cancelled/skipped/todo，21.28 秒**。17 项新真实 GameClient/Codec/合成 socket 测试、4 项只读消费者测试和四文件 65 项专项均与本次重叠，不累计。覆盖精确大 ID、显式零/缺字段、登录前后观察时序、VIP 更新与监听、缺口/重复/无序/解码失败、五种 terminal、拒绝重登、旧未完成登录回调、双账号和 actual client→48 查询采集→只读显示。根审查发现 ResendFailed/SCChannelExpired 原先先发布 message 再进入清理，已在发布前先使 VIP 失效，并测试监听器窗口直接读取也为 UNKNOWN。

下一步原范围不变：完整当前月卡与可信游戏日未闭合，总额、剩余、日额度预算、扫荡派发和复读仍待施工。静态核实月卡交付 push 仅有 endTime 无类型，不能局部猜更新；应使卡权威失效并显式重查，且防查询期间新交付覆盖。月卡到期需可信时间区间，-1 永久卡与跨到期边界分别处理。游戏计时器用 originLang，LoginRequest.language 是当前 UI lang，两者不等；native manifest、私有语言配置和正常 WeChat 默认路径也不能直接从当前 Session 反推，应先限定可信日策略来源，不把所有账号一律当 UTC+8。

补充 D.24 直接万能升星限制的进一步证据：Detail byte 248632–248828 只证明专属与万能合计足够；Util byte 302496 只返回总需求；StarUp body 无材料分配字段且无专用费用回执。物品 push 是最终余额、Model 直接替换，不能据此推断预授权扣款顺序，所以不假定 dedicated-first。未激活路径 byte 255741 只校验专属碎片，byte 256578 的 Activate 请求仅 id，开关不影响激活。独立兑换不能冒充此混合扣款合同完成。

E15 增加 VIP 等级权威/历史观察分离、推送断流与日策略未知；E23 增加重连与跨上下文隔离。原五份未跟踪资料保留。未执行 R7、真实游戏、R8、push 或 merge；总 Goal 继续 ACTIVE，R8 仍在 R7 后由 Owner 单独授权。

### D.26 W19 独立闯关逐场持久历史（2026-11-12）

基线 c2e4968。POST /api/stages/start 继续走原账号、授权、阵容和会话门禁，复用原 StageRunner 与唯一共享 ExecutionHistory；Operation/Workflow 路径不重复写历史。每场 ChallengeStageRequest 前同步持久化账号/世代/连接、关卡、序号及 DISPATCH_INTENT，原主线解析器确认该关、阵营和明确胜负后才保存结果并允许下一场。派发意图落盘失败时零请求；结果落盘失败、派发后取消或无法归属时停止后续请求并保留 UNKNOWN。重连和重启只读恢复，未决记录会阻止新的受控写操作；迟到响应不解除拦截，也不自动重发。已确认胜负且只缺批次终态时，只读恢复为已停止并保留逐场证据。

五文件联合测试：tests/stages.test.mjs、tests/stages-api.test.mjs、tests/stage-function.test.mjs、tests/execution-history.test.mjs、tests/operation-recovery-api.test.mjs，98/98 PASS，0 fail/cancelled/skipped/todo（6.25 秒）。全量离线 Node 测试及 29 组自检也由并行施工者运行通过；自检沿用素材未同步时的既有跳过条件。

W19 仍 PARTIAL：Loop/Tasks/Dailies 各入口的历史和拒绝记忆覆盖、可信冷却/日界策略、主线未决写的权威解除仍待施工。E20/E21/E23 增加逐场持久化、磁盘故障、取消和重启隔离。真实游戏仍 REAL_UNVERIFIED；原范围、R7/R8 状态与授权门禁不变。

### D.27 W12 可信配额、单目标扫荡及日常入口（2026-11-12）

父提交 60d08ba；D.22 与 D.25 的只读层之上新增 C151/P2-8 默认关闭的 pirate-sweep Function，复用同一 Operation/Workflow 授权、资源台账和执行历史。既有 48 项采集不加请求；CLI 和控制台概览展示已用、基础/VIP/有效月卡总额及可确认的剩余。日常 1010 指向同一页面，旧按任务差额批量截取的构造与派发均关闭，伪造旧计划零发送。D.22 中“C152 召唤”为笔误；C152 是 W13 钓鱼，未纳入此提交。

固定 v76 微信包及配置的哈希和源偏移见 PIRATE_QUOTA_EVIDENCE、LIVE_MONTH_CARD_EVIDENCE、PIRATE_SWEEP_OPERATION_EVIDENCE。MonthCardResponse 是当前连接有归属的完整替换列表；空列表保留为空，交付推送使旧列表失效，同一次调查中发生交付也不接受旧响应。使用 PirateParamCfg、当前 VIP 精确配置行、当前有效卡效果和匹配 Ping 的可信时间。跨到期、缺配置或 VIP 行（固定配置无 VIP0 行）、非当前连接、时钟变动等均不补默认。游戏日只在 v76 已知 +480/+540 两个策略对整个时间区间一致、且排除本地 reset 的 10.002 秒延迟区间时确认；该规则未证明服务器实际重置时刻，真实边界仍待 E15。

静态证据支持 PiratePop 的首杀等级门、低等级明示确认、精确 {uid,cityId} 与普通日额度。只生成并授权一个目标，消耗一个带游戏日标识的配额，预占该目标 UID，普通资源成本为空。独立复查身份、配置、剩余与目标到实际 socket 边界；D6 拒绝扩展字段与付费。无专用 typed 扫荡响应；仅当独立同日复读计数恰好加一、目标池和首杀记录保持一致、期间无相冲突的领域推送时确认这一计次效果。结果证据不足则 UNKNOWN、保留预占、停止且不重放。

验证在 NAS 直接运行 npm test 的两条 Node 命令：node src/selftest.mjs 29 组通过（原素材未同步检查按既有条件跳过）；node --test --test-reporter=spec 为 2505/2505 PASS、0 fail/cancelled/skipped/todo（25.74 秒）。包含本地真实 Codec 与合成 socket 的交付/超时/拒绝/重启、正式 OperationService 派发前磁盘预占及零重放、完整页面明确授权和账号切换。未连接真实游戏。

W12 仍 PARTIAL：E15 原定的“扣次且目标变化”双证据、目标删除归属、具体奖励归属和服务器日界仍未闭合；目标池变动或无效果保留 UNKNOWN，不能以计数替代这些证据。E15/E20/E21/E23 增加边界、预算与身份失效分支；R7/R8、E01–E24 及原工作包范围保持。此轮未 push/merge，R8 仍需 R7 后由 Owner 单独授权。

### D.28 W19 区分当前工作流与只读恢复记录（2026-11-12）

父提交 058445b。原 GET /api/workflows 会将当前 Runner 刚落盘的活动行显示为 RECOVERED_STOPPED。现在仅在服务器当前账号、世代、连接及持有运行的 Runner 全部匹配时保留该运行的活动历史状态；失去会话归属或新进程读取时才显示已恢复停止。读取不修改文件、不恢复运行或授权。联合 workflow、gameplay-api、execution-memory-api、operation-recovery-api 四套离线测试 56/56 PASS，0 fail/cancelled/skipped/todo（6.47 秒），覆盖真实 HTTP handler 的活动和失效对照、跨账号及新 Store 字节不变。旧 Loop/Tasks/Dailies 写入口仍禁用；新增业务须复用注册 Function、逐批授权和共享历史，W19 其余原 DoD 未完成。

并行静态复核确定 W13 下一安全切片为钓鱼图鉴的只读奖励资格。FishList byte 2642395/2642882、FishModel byte 2645932/2646114：FishEncyclopediaResponse 自有 fishList 与显式 rewardId，按 FishBaseCfg 已发现唯一鱼积分减去已领奖的 FishStageCfg 门槛，判断下一档。DrawFishRewardRequest 为空，typed DrawFishRewardResponse 提供 rewardId 与 DisplayAssetPackage；请求没有 stage 条件，外部客户端可能抢领并使下一档变化，写分支需单独解决这一授权边界。FishView byte 2663638/2664672：StartFishingResponse 的 fishId 只在临时 UI 状态；GainBigFishRequest 无鱼/任务 ID，对应异名 GainBigResponse（isNew/extReward），无恢复身份或过期权威读源。满仓门按 GameEffect ID 16 与 AllItem 的鱼库存校验。此段仅静态证据，未实现 W13，也不视为 E16 或 R7/R8 通过。
