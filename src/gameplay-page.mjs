import { NAVAL_RULE_CONTRACT, moduleConfigNumberValid } from './gameplay-settings.mjs';
import { RUN_BUDGET_LIMITS, RESOURCE_NAMES } from './resource-ledger.mjs';
import { FUNCTION_CONTRACTS } from './function-contracts.mjs';
import { WORKFLOW_CONDITION_FIELDS, WORKFLOW_LIMITS } from './workflow.mjs';

export function validateWorkflowReasonAuditView(data) {
  const audit = data.reasonAudit;
  if (audit === undefined) return null;
  const txt = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 4000;
  const identity = value => value === null || typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 512 || Number.isSafeInteger(value) && value >= 0;
  if (!audit || audit.source !== 'Workflow.original-reasons.v1' || audit.accountId !== data.accountId || audit.workflowRunId !== data.workflowRunId || audit.workflowDefinitionId !== data.workflowDefinitionId || audit.readOnly !== true || audit.coverage !== 'recorded-fields-only' ||
      audit.originalStatus !== null && !['IDLE','STARTING','RUNNING','WAITING','AWAITING_AUTHORIZATION','COMPLETED','STOPPED','UNKNOWN','FAILED','CANCELLED'].includes(audit.originalStatus) ||
      !audit.reason || audit.reason.source !== 'Workflow.run.reason' || !['RECORDED','UNKNOWN','RECOVERY_ONLY'].includes(audit.reason.coverage) ||
      (audit.reason.coverage === 'RECORDED' ? !txt(audit.reason.text) : audit.reason.text !== null) ||
      !Array.isArray(audit.events) || audit.events.length > 200) throw Error('工作流原始原因归属不匹配');
  const ctx = audit.executionContext;
  if (ctx !== null && (!ctx || ctx.accountId !== data.accountId || !identity(ctx.playerId) || !identity(ctx.worldId) ||
      ctx.generation !== null && (!Number.isSafeInteger(ctx.generation) || ctx.generation < 0) || ctx.connectionId !== null && !(typeof ctx.connectionId === 'string' && identity(ctx.connectionId)))) throw Error('工作流原始身份不匹配');
  let previousIndex = -1;
  for (let i = 0; i < audit.events.length; i++) {
    const row = audit.events[i];
    if (!row || !Number.isSafeInteger(row.index) || row.index <= previousIndex || row.index >= 200 || row.source !== 'Workflow.run.trace' || !txt(row.nodeId) || !txt(row.result) ||
        !['START','SURVEY','CONDITION','RULE','ACTION','WAIT','VERIFY','BRANCH','STOP'].includes(row.type) ||
        row.timestamp !== null && !txt(row.timestamp) || row.round !== null && (!Number.isSafeInteger(row.round) || row.round < 1 || row.round > 200) ||
        row.blockedReasons !== undefined && (!Array.isArray(row.blockedReasons) || row.blockedReasons.length > 50 || Array.from(row.blockedReasons).some(value => !txt(value)))) throw Error('工作流原始节点原因无效');
    previousIndex = row.index;
  }
  return audit;
}

const workflowCoreHtml = Object.entries({ orders: '居民订单', city: '城市建设', production: '工厂生产' }).map(([id, name]) => '<details><summary>本账号' + name + '节点开关（默认关闭）</summary><button id="wf-' + id + '-load">读取' + name + '节点配置</button><p id="wf-' + id + '-source" class="dim">配置来源尚未读取</p><button id="wf-' + id + '-default" disabled>恢复安全默认开关到草稿</button><label><input id="wf-' + id + '-enabled" type="checkbox" disabled>允许工作流生成' + name + '节点计划</label><button id="wf-' + id + '-save" disabled>保存' + name + '节点配置</button><p id="wf-' + id + '-hint" role="status"></p></details>').join('');
const gameplayNames = { trade: '海商王', mail: '邮件', formation: '阵容与战报', alliance: '联盟与互助', museum: '博物馆', treasure: '世界寻宝', fleet: '舰队与货船', naval: '海战规则', 'pirate-sweep': '海面扫荡' };
const gameplaySection = ([id, name]) => '<section id="tab-' + id + '" class="hidden"><h2>' + name + '</h2><p class="dim">本账号独立配置。读取缓存后可显式探测；仅选中的具体动作进入现有批次授权。</p><div class="toolbar"><button id="gp-' + id + '-load">读取缓存</button><button id="gp-' + id + '-survey" disabled>只读探测</button><button id="gp-' + id + '-unified-survey" disabled>加入 Loop 只读调查</button><button id="gp-' + id + '-history">执行历史</button><button id="gp-' + id + '-stop" disabled>停止后续操作</button></div><p id="gp-' + id + '-hint" role="status"></p><pre id="gp-' + id + '-status">尚未读取本账号状态</pre><details><summary>本账号玩法配置（默认禁用）</summary><p id="gp-' + id + '-config-source" class="dim">配置来源尚未读取</p><button id="gp-' + id + '-config-default" disabled>恢复安全默认配置到草稿</button><div id="gp-' + id + '-config-fields"></div><label>完整配置 JSON<textarea id="gp-' + id + '-config" rows="6">{}</textarea></label><button id="gp-' + id + '-config-save" disabled>保存本账号配置</button></details>' + (id === 'formation' ? '<div class="card"><h3>阵容编辑</h3><label>模式 <select id="gp-formation-mode"><option value="mainline">主线</option><option value="expedition">远征</option></select></label><label>远征 raidId <input id="gp-formation-raid" type="number" min="1" step="1"></label><button id="gp-formation-mode-prepare">使用模式参数</button><p class="dim">模板表示布局；宠物 UID 始终由当前阵容保留。恢复也是新的具体计划。</p><label>布局模板 <select id="gp-formation-template"></select></label><div id="gp-formation-layout" aria-live="polite">尚未读取模板布局</div><div id="gp-formation-roster"></div><button id="gp-formation-career">生成职业排序参数</button><button id="gp-formation-manual">使用手动站位参数</button><button id="gp-formation-restore" disabled>加载旧阵容恢复参数</button><details><summary>复制主线极限通关站位</summary><p>读取当前关卡的服务器极限记录，选择具体战报并核对英雄和布局。保留本账号当前宠物；准备后仍需探测、预览和授权。</p><button id="ex-survey" disabled>读取当前关卡极限记录</button><select id="ex-selected" disabled></select><button id="ex-prepare" disabled>核对来源并加载站位参数</button><p id="ex-hint" role="status"></p><pre id="ex-detail"></pre></details><details><summary>本账号具名完整队伍</summary><p>存档包含主线布局、英雄站位和明确宠物 UID。应用后需重新探测、预览和授权。</p><button id="nf-load">读取本地队伍</button><select id="nf-selected"></select><label>队伍名称<input id="nf-name" maxlength="80"></label><button id="nf-save" disabled>从当前权威阵容新建</button><button id="nf-rename" disabled>重命名所选版本</button><button id="nf-overwrite" disabled>用当前阵容覆盖所选版本</button><button id="nf-delete" disabled>删除所选版本</button><button id="nf-prepare" disabled>验证并加载应用参数</button><p id="nf-hint" role="status"></p><pre id="nf-detail"></pre></details></div>' : '') + (id==='museum'?'<div class="card"><h3>古董属性总览</h3><p>单独读取全局、阵营、职业属性和特殊效果。查询无需启用养成操作。</p><button id="antique-summary-read" disabled>只读查询古董属性</button><p id="antique-summary-hint" role="status"></p><div id="antique-summary-view"></div></div>':'') + (id==='naval'?'<div id="gp-naval-rules"></div><div id="gp-naval-observations"></div>':'') + (id==='treasure'?'<div id="gp-treasure-targets"></div>':'') + (id==='fleet'?'<div id="gp-fleet-operations"></div><div id="gp-fleet-formations"></div><div id="gp-fleet-cargo"></div>':'') + '<label>业务参数 JSON<textarea id="gp-' + id + '-parameters" rows="5">{}</textarea></label><p class="dim">修改参数后请重新探测。参数只表示业务选择，不接受任意协议请求。</p><div id="gp-' + id + '-facts"></div><h3>候选动作</h3><div id="gp-' + id + '-candidates">尚未探测</div><button id="gp-' + id + '-plan" disabled>预览选中的具体动作</button><div id="gp-' + id + '-plan-view"></div><button id="gp-' + id + '-authorize" disabled>确认并授权执行此预览</button></section>';
export const CORE_GAMEPLAY_HTML = Object.fromEntries([['city','城市建设逐项操作'],['compass-wheel','龙王罗盘'],['material-packs','持有材料包兑换'],['heroes','英雄成长'],['production','生产规划与执行'],['farm','农田种植'],['equipment-forge','装备制造与收取'],['formation-unlock','普通阵型图纸解锁'],['equipment-growth','装备成长与穿戴'],['badge-growth','徽章成长与穿戴'],['antique-growth','藏品养成与碎片兑换'],['task-rewards','任务与日活跃奖励'],['afk-level-rewards','挂机等级奖励'],['free-gold','普通免费点金'],['free-recruit','免费英雄招募'],['trial-challenge','试炼副本首通'],['pet','海兽培育与投喂']].map(entry=>[entry[0],gameplaySection(entry).replace('id="tab-'+entry[0]+'" class="hidden"','id="gp-'+entry[0]+'-section"')]));
const executionBudgetFieldsHtml = prefix => "<h4>累计预算上限</h4><div class=\"bar\"><label>预算类别<select id=\"wf-unified-budget-kind\"><option value=\"resources\">资源</option><option value=\"quotas\">配额</option><option value=\"uids\">具体目标</option></select></label><label>ID<input id=\"wf-unified-budget-id\" type=\"text\"></label><label>数量<input id=\"wf-unified-budget-num\" type=\"text\" inputmode=\"numeric\"></label><label>具体目标类型<input id=\"wf-unified-budget-type\" type=\"text\"></label><button id=\"wf-unified-budget-add\" type=\"button\">添加预算上限</button></div><div id=\"wf-unified-budget-rows\"></div>".replaceAll('wf-unified',prefix);
const unifiedExecutionFormHtml = "<div class=\"card\"><h3>统一执行声明</h3><p>先选择业务步骤和明确目标，再填写累计预算上限。表单只编辑声明；预算不证明资格，预期收益不会自动增加额度。</p><div class=\"bar\"><label>入口<select id=\"wf-unified-entry\"><option value=\"tasks\">Tasks 任务与明确业务</option><option value=\"dailies\">Dailies 日常</option><option value=\"loop\">Loop 有限循环</option></select></label><label>轮次<input id=\"wf-unified-rounds\" type=\"number\" min=\"1\" max=\"48\" step=\"1\" value=\"1\"></label><label>轮间隔（毫秒）<input id=\"wf-unified-every\" type=\"number\" min=\"0\" max=\"60000\" step=\"1\" value=\"0\"></label><button id=\"wf-unified-limits\" type=\"button\">使用入口与轮次</button></div><div class=\"bar\"><label>步骤分组<select id=\"wf-unified-phase\"><option value=\"tasks\">任务与明确业务</option><option value=\"dailies\">日常</option></select></label><label>业务<select id=\"wf-unified-kind\"></select></label><label><input id=\"wf-unified-observe\" type=\"checkbox\">仅观察任务资格（不领取）</label><label>冷却等待招募目标<select id=\"wf-unified-cooldown-recruit\"><option value=\"hero\">英雄</option><option value=\"antique\">古董</option></select></label><label>招募业务目标<select id=\"wf-unified-recruit-kind\"><option value=\"hero\">英雄</option><option value=\"antique\">古董（Tasks）</option></select></label><label>招募方式<select id=\"wf-unified-recruit-count\"><option value=\"free\">免费单次</option><option value=\"1\">自有对应招募券1张</option><option value=\"10\">自有对应招募券10张，招募10次</option><option value=\"50\">自有对应招募券50张，招募50次</option></select></label><label><span id=\"wf-unified-target-label\">精确任务 ID</span><input id=\"wf-unified-target\" type=\"text\" inputmode=\"numeric\"></label><label>挂机本段起始秒<input id=\"wf-unified-afk-start\" type=\"text\" inputmode=\"numeric\" disabled></label><label>挂机本段上限秒<input id=\"wf-unified-afk-finish\" type=\"text\" inputmode=\"numeric\" disabled></label><label>精确工厂 buildingId<input id=\"wf-unified-factory-id\" type=\"text\" disabled></label><label>精确队列 idx（含0）<input id=\"wf-unified-factory-index\" type=\"text\" inputmode=\"numeric\" disabled></label><label>航段当前港口 ID<input id=\"wf-unified-trade-city\" type=\"text\" inputmode=\"numeric\" disabled></label><label>航段目的地港口 ID<input id=\"wf-unified-trade-destination\" type=\"text\" inputmode=\"numeric\" disabled></label><label>精确货格编号（从1开始）<input id=\"wf-unified-cargo-index\" type=\"text\" inputmode=\"numeric\" disabled></label><label>精确海盗城市 ID<input id=\"wf-unified-pirate-city\" type=\"text\" inputmode=\"numeric\" disabled></label><label><input id=\"wf-unified-pirate-lower\" type=\"checkbox\" disabled>明确允许此精确UID为较低等级目标（不扩大目标范围）</label><label>邮件来源页（含0）<input id=\"wf-unified-mail-page\" type=\"text\" inputmode=\"numeric\" disabled></label><label>周芯片当前轮次<input id=\"wf-unified-chip-round\" type=\"text\" inputmode=\"numeric\" disabled></label><label>原日常重置秒（可选；只绑定日常领奖）<input id=\"wf-unified-daily-reset\" type=\"text\" inputmode=\"numeric\" disabled></label><label>探险英雄 ID（每行一个）<textarea id=\"wf-unified-museum-heroes\" rows=\"3\" disabled></textarea></label><label>探险时间倍率<input id=\"wf-unified-museum-factor\" type=\"text\" inputmode=\"numeric\" disabled></label><button id=\"wf-unified-add\" type=\"button\">添加业务步骤</button></div><div id=\"wf-unified-steps\"></div>" + executionBudgetFieldsHtml('wf-unified') + "<p id=\"wf-unified-form-hint\" role=\"status\"></p><button id=\"wf-unified-form-load\" type=\"button\">从高级声明读取表单</button><p>可选运行边界沿用下方当前图配置，复制后须核对允许玩法覆盖本声明全部步骤。声明修改不会扩大原累计预算；每批仍单独授权。</p><button id=\"wf-unified-policy-copy\" type=\"button\">复制当前图运行边界到声明</button><button id=\"wf-unified-policy-remove\" type=\"button\">移除声明运行边界</button><p id=\"wf-unified-policy-summary\" role=\"status\"></p></div>";
export const GAMEPLAY_HTML = Object.entries(gameplayNames).map(entry=>entry[0]==='formation'?gameplaySection(entry).replace('</section>',CORE_GAMEPLAY_HTML['formation-unlock']+'</section>'):entry[0]==='museum'?gameplaySection(entry).replace('</section>',CORE_GAMEPLAY_HTML['antique-growth']+'</section>'):gameplaySection(entry)).join('') + String.raw`<section id="tab-workflow" class="hidden"><h2>工作流</h2><details open><summary>Tasks / Dailies / Loop 统一执行</summary><p>填写精确任务 ID、日常任务 ID 和累计预算。Loop 按任务、日常、海面顺序有限运行，每个动作都重新展示具体计划并单独授权。轮间隔仅是本次运行的等待，不代表游戏冷却或日界，重启后不会继续。没有可执行候选的节点记为阻塞；UNKNOWN 停止后续执行。</p>${unifiedExecutionFormHtml}<details><summary>高级业务声明 JSON</summary><p>任务格式：tasks:[{kind:"main" 或 "branch" 或 "achievement" 或 "daily",taskId:精确ID}]；精确邮件使用 tasks:[{kind:"mail",pageNo:明确来源页,emailId:"精确正int64",action:"claim" 或 "read"}]，每项复用原单封合同，枚举不自动生成领取声明；挂机单档奖励使用 tasks:[{kind:"afk-level-reward",level:明确等级}]，按配置下一档重新核实资格，普通收益使用 tasks:[{kind:"afk-income",level:当前等级,afkStartTime:本段起始秒,afkFinishTime:本段上限秒}]，日常1004使用parameters:{action:"income",level,afkStartTime,afkFinishTime}。两者重新调查并单独授权，金额仅回执与独立净入确认，升级和任务领奖保持独立；日常支持1002招募、1003有限主线（parameters.config 必须明确有限次数或终点，沿用主线授权与胜负合同，不自动领取日常奖励）、1006免费点金、1008港口货轮单格装货（parameters.shipIndex/cargoIndex 必须明确，不补购，任务进度独立观察）、1009经验试炼、1010海面扫荡（parameters.uid/cityId 均为正int32，allowLowerLevel 仅显式确认）、1016博物馆出发（parameters.stageId/heroIds/factor 必填，只出发，不含结算、加速或领奖）。只读任务观察使用 Tasks 的 {kind:"main"/"branch"/"achievement"/"daily",taskId:精确ID,action:"observe"} 或 Dailies 的 {taskId:精确ID,action:"observe"}，仅调用原Function调查并记录目标，不生成计划、完成任务或领奖。dailies 中省略 action 或 action:"perform" 执行所声明的具体动作，任务是否完成须独立观察，action:"claim" 只按 taskId 领取该任务奖励（不接受驱动 parameters），重新探测后逐项授权。日活跃宝箱使用 dailies:[{kind:"daily-activity",tierId:精确档位ID,action:"claim"}]，Tasks 也可使用 {kind:"daily-activity",tierId:精确档位ID}。免费赠礼使用 {kind:"daily-gift",packId:"赠礼",action:"claim"}（Tasks省略action）；周转盘免费礼包使用 {kind:"weekly-lottery-gift",packId:"1000",action:"claim"}（Tasks省略action），周翻牌使用kind:"weekly-unique-lottery-gift"及同一固定packId，须明确gotFree=false；周芯片使用kind:"weekly-chip-gift"及同一固定packId，须明确paidTimes=0，只收宝箱不打开；周芯片任务使用kind:"weekly-chip-task",round:当前轮次,taskId:明确任务ID（Dailies加action:"claim"），最后一项换轮仍缺证冻结；均须当前服务器活动窗口及明确资格，不跨周续领；不支持付费/合并礼包，不推断跨周期重领。Tasks也可使用kind=cargo-fill、alliance-order、museum或pirate-sweep及必填parameters声明原单格装货、城市订单、固定队伍倍率探险出发或明确UID/城市扫荡；参数与对应日常perform相同，专业页可将当前明确候选加入Tasks或Loop的tasks分组，每项重新调查并单次授权，预算不随收入增加，业务执行不证明日常完成或领奖。Tasks免费试炼首通使用 {kind:"trial-challenge",parameters:{raidId:1或2或3,stageId:可选明确下一关}}，专业页固定本次副本和下一关；每项原免费单场、独立调查授权与完整结算，不扫荡、购买或推定日常1009完成。Tasks普通免费点金使用 {kind:"free-gold",parameters:{}}；也可在parameters.expectedGold绑定原完整freeTimes/paidTimes/minGold/resetTime/maxPaidTimes，专业页使用当前调查状态。每项为原免费单次，重新调查并单独授权，禁止付费、预测金额或扩累计预算。任务与宝箱不能混用 ID；周宝箱周期仍缺证。各入口可显式插入 {type:"WAIT",cooldown:{kind:"FREE_RECRUIT",maxWaitMs:1至60000整数}}，复用原具名等待，须同目标到期复读；不招募、不清除拒绝或UNKNOWN。贸易航段使用 {type:"WAIT",cooldown:{kind:"TRADE_LEG_END",cityId:明确当前港口,mvToCityId:明确不同目的地,maxWaitMs:1至60000整数}}，同周期同船同航段独立复读仅证明时钟到期，不证明到港、收益或交易资格。world 使用已注册 module、parameters 和明确 selection。预算为 resources/quotas/uids 的累计上限。</p><textarea id="wf-unified-intent" rows="12"></textarea></details><button id="wf-unified-prepare" disabled>生成统一工作流预览</button><pre id="wf-unified-blocked"></pre></details>${workflowCoreHtml}<details><summary>本账号主线节点开关（默认关闭）</summary><button id="wf-stage-default" disabled>恢复主线安全默认</button><p id="wf-stage-source" class="dim"></p><button id="wf-stage-load">读取主线节点配置</button><label><input id="wf-stage-enabled" type="checkbox" disabled>允许工作流生成有限主线节点计划</label><button id="wf-stage-save" disabled>保存主线节点配置</button><p id="wf-stage-hint"></p></details><p class="dim">有限节点图逐步运行。ACTION 生成具体计划并暂停待授权；验证成功后才可继续。可在完整图 JSON 的 budget 声明 resources/quotas/uids 累计上限；未声明的旧图固定使用首个计划的可靠库存，后续收入不会补回额度。</p><div class="toolbar"><button id="wf-load">读取本账号图与状态</button><select id="wf-saved"></select><button id="wf-open">加载选中的图</button><button id="wf-save" disabled>保存图</button><button id="wf-simulate" disabled>模拟</button><button id="wf-start" disabled>开始流程</button><button id="wf-resume" disabled>验证已成功后继续</button><button id="wf-stop" disabled>停止流程</button></div><p id="wf-hint" role="status"></p><pre id="wf-status">尚未读取</pre><details><summary>本账号工作流执行历史</summary><select id="wf-history-selected" disabled></select><button id="wf-history-read" disabled>读取所选运行明细</button><p id="wf-history-hint" role="status"></p><div id="wf-history-detail"></div></details><label>图 ID<input id="wf-id" value="workflow-1"></label><label>名称<input id="wf-name" value="新工作流"></label><details open><summary>当前图累计预算</summary><p>预算只声明本次流程的累计上限，不证明资格或成本。明确启用并应用后才更新当前图；未声明的旧图仍使用首个计划的可靠库存，后续收入不会补回额度。</p><label><input id="wf-budget-enabled" type="checkbox">为当前图声明明确累计上限</label>${executionBudgetFieldsHtml('wf')}<button id="wf-budget-apply" type="button">应用预算到当前图</button><button id="wf-budget-discard" type="button">放弃未应用预算草稿</button><p id="wf-budget-hint" role="status"></p></details><details open><summary>当前图运行边界（可选）</summary><p>总时长包含启动、等待与逐批授权时间，最多24小时；动作上限按计划次数累计，最多200次。到限停止后续节点并关闭原父预算。此设置不授予执行权限，也不代表游戏冷却或重置周期。</p><label><input id="wf-policy-enabled" type="checkbox">明确声明本次运行边界</label><label>总时长（毫秒）<input id="wf-policy-duration" inputmode="numeric"></label><label>累计动作计划上限<input id="wf-policy-actions" inputmode="numeric"></label><label>外层最多轮次（可选；留空只运行一轮）<input id="wf-policy-rounds" inputmode="numeric"></label><label>轮间隔（毫秒，可选；仅本次运行的等待）<input id="wf-policy-interval" inputmode="numeric"></label><p>最多200轮；原200步、200条历史、累计动作、期限与预算仍按整次运行限制。每轮重新调查；等待不代表游戏冷却或日界。重启只恢复历史。</p><label><input id="wf-policy-scheduled" type="checkbox">启用一次或日周日历触发</label><label>日历规则<select id="wf-policy-kind"><option value="ONCE">一次明确时间</option><option value="DAILY">每日上海时刻</option><option value="WEEKLY">每周上海时刻</option></select></label><label>每日/每周时刻（HH:mm:ss.sss）<input id="wf-policy-local-time" placeholder="08:30:00.000"></label><label>星期（周一1至周日7，仅每周）<input id="wf-policy-week-day" inputmode="numeric"></label><label>上海时间（YYYY-MM-DDTHH:mm:ss.sss）<input id="wf-policy-at" placeholder="2026-11-14T20:30:00.000"></label><p>时区 Asia/Shanghai；错过按 SKIP 跳过，不补跑。等待包含在本次总时长内，到点重新调查。日周规则每次启用只覆盖本次24小时以内的有界窗口，超出窗口停止；下一窗口须重新启用并授权，不自动续权。重启只读，不自动恢复定时或授权。</p><label><input id="wf-policy-event-enabled" type="checkbox">业务事件触发一次</label><label>事件来源<select id="wf-policy-event-kind"><option value="VIP_LEVEL_CHANGED">VIP等级变化</option><option value="PLAYER_LEVEL_CHANGED">角色等级变化</option><option value="DAILY_TASK_RESET">收到每日任务重置推送</option><option value="DAILY_TASK_PROGRESS">每日任务进度达到阈值</option><option value="MAIN_TASK_PROGRESS">主线任务进度达到阈值</option><option value="BRANCH_TASK_PROGRESS">支线任务进度达到阈值</option><option value="ACHIEVEMENT_TASK_PROGRESS">成就任务进度达到阈值</option><option value="RESOURCE_AMOUNT_CHANGED">资源余额变化后达到阈值</option></select></label><label>资源<select id="wf-policy-event-resource" disabled>${Object.values(RESOURCE_NAMES).map(value=>'<option value="'+value+'">'+value+'</option>').join('')}</select></label><label>明确目标等级、任务进度或资源余额（含0）<input id="wf-policy-event-level" inputmode="numeric"></label><label>进度事件精确任务 ID<input id="wf-policy-event-task" inputmode="numeric" disabled></label><label>从本图已调查任务选择<select id="wf-policy-event-task-choice" disabled></select></label><p>只复用同类型任务ID，不自动填写进度阈值或领取资格；事件仍从本次可信连接的新变化开始。</p><p>只订阅当前可信登录连接中的新变化；每日任务重置不填写等级，仅认当前连续连接的新重置推送与服务端标记，不推断时区、日界或领取资格。任务进度事件须填写精确任务ID及进度阈值，只认新的明确进度观察；相同进度或仅已领标记变化不触发。每日任务重置使旧每日进度监听失效；主线/支线/成就进度按完整非负int64十进制字符串输入，不推断任务完成、领奖资格或周期。资源余额事件须选择资源与精确非负int64阈值；首次观察只建基线，后续余额变化且达到阈值才触发，余额可增可减，不证明收入或可支配预算。原期限与累计预算仍适用。推送只触发新调查，不证明领取资格或写入成功。时间触发与事件触发须明确选择一种，重启不恢复监听或权限。</p><label>允许玩法（每行一个精确 ID；无业务节点可留空）<textarea id="wf-policy-modules" rows="3"></textarea></label><button id="wf-policy-apply" type="button">应用运行边界到当前图</button><button id="wf-policy-discard" type="button">放弃未应用运行边界草稿</button><p id="wf-policy-hint" role="status"></p></details><button id="wf-add">添加节点</button><div id="wf-nodes"></div><h3>连线与条件分支</h3><button id="wf-add-edge">添加连线</button><div id="wf-edges"></div><svg id="wf-canvas" viewBox="0 0 800 120" role="img" aria-label="工作流节点与连线" style="width:100%;min-height:180px;overflow:auto"></svg><details><summary>完整图 JSON</summary><textarea id="wf-json" rows="14"></textarea><button id="wf-json-apply">应用 JSON 到图编辑器</button></details><div id="wf-result"></div><div id="wf-plan"></div><button id="wf-authorize" disabled>确认并授权当前 ACTION 计划</button><details><summary>本次有限运行授权范围（可选）</summary><div id="wf-run-scope"></div><button id="wf-authorize-run" disabled>确认本次有限运行范围并执行</button></details></section>`;

function gameplayClient(WF_CONDITION_FIELDS, WF_PARAMETER_SCHEMAS, WF_BUDGET_LIMITS, NAVAL_RULE_FIELDS, CONFIG_NUMBER_VALID, WF_GRAPH_LIMITS, WORKFLOW_REASON_VIEW, WF_RESOURCE_NAMES) {
const GP_MODULES = ['city','compass-wheel','trade','material-packs','formation','alliance','museum','treasure','fleet','naval','heroes','production','farm','equipment-forge','formation-unlock','equipment-growth','badge-growth','antique-growth','pirate-sweep','task-rewards','mail','afk-level-rewards','free-gold','free-recruit','trial-challenge','pet'];
const gpState = Object.create(null);
let nfState={entries:[],scope:null,pending:false,loaded:false};
let exState={stage:null,rows:[]};
let antiqueState={pending:false};
let gpRevision = 0, gpToken = null, wfData = null, wfPending = false, wfPlan = null;
let wfBudgetDraft = null, wfPolicyDraft = null;
let wfHistoryRows = [], wfHistoryPending = false, wfHistoryRevision = 0, wfHistoryReference = null;
let wfGraph = {version:1,id:'workflow-1',name:'新工作流',nodes:[{id:'start',type:'START'},{id:'stop',type:'STOP'}],edges:[{from:'start',to:'stop'}]};
function gpEl(tag,text) { const e=document.createElement(tag); if(text!==undefined)e.textContent=String(text); return e; }
function gpClear(e) { e.textContent=''; return e; }
function gpJson(v) { return JSON.stringify(v===undefined?null:v,null,2); }
function gpParse(id) { const v=JSON.parse($(id).value||'{}'); if(!v||typeof v!=='object'||Array.isArray(v))throw Error('参数必须为 JSON 对象');return v; }
function gpGet(id) { return gpState[id]||(gpState[id]={data:null,selected:new Set(),plan:null,pending:false,dirty:false,revision:0,restore:null,scope:null,configDirty:false}); }
function gameplayCsrfToken() { return gpToken&&gpToken.account===current&&viewGuard.current(gpToken.scope)?gpToken.token:null; }
function gpTokenFrom(data,scope) { if(data.accountId!==scope.account)throw Error('玩法响应账号不匹配');if(data.csrfToken)gpToken={account:scope.account,scope:viewGuard.capture(),token:data.csrfToken}; }
function gpSafe(scope,revision) { return viewGuard.current(scope)&&gpRevision===revision; }
function gpReady(id) { const s=gpGet(id);return Boolean(current&&s.data&&s.data.accountId===current&&s.scope&&viewGuard.current(s.scope)); }
function gpBlocked(row) { return row.executable===false||row.decision==='BLOCKED'||!(row.executable===true||row.action)||Boolean(row.blockedReason||row.reason); }
function gpBudget(v) { return Array.isArray(v)&&v.every(r=>typeof r.id==='string'&&r.id&&Number.isSafeInteger(r.num)&&r.num>=0); }
function gpPlanLive(p) { const expiry=typeof p?.expiresAt==='number'?p.expiresAt:Date.parse(p?.expiresAt||'');return Boolean(p&&!p.consumed&&p.accountId===current&&p.batchId&&p.planHash&&p.actions?.length&&p.actions.every(r=>gpBudget(r.costs))&&gpBudget(p.resourceBudget)&&expiry>Date.now()); }
function gpDefaultConfig(id) { return gpMetadataDefaults(gpGet(id).data,id); }
function gpMetadataDefaults(data,id) {
 const rows=data?.functions;if(!Array.isArray(rows))return null;const matches=rows.filter(row=>row&&typeof row==='object'&&row.id===id);if(matches.length!==1)return null;
 const value=matches[0].defaultConfig;return value&&typeof value==='object'&&!Array.isArray(value)&&value.enabled===false?value:null;
}
function gpConfigSource(id) {
 const source=gpGet(id).data?.source;$('gp-'+id+'-config-source').textContent='当前账号：'+current+' · '+(source==='account'?'账号独立配置':source==='default'?'安全默认配置（尚未保存账号覆盖）':'配置来源未知');
}
function gpRestoreDefaults(id) {
 const s=gpGet(id),button=$('gp-'+id+'-config-default');if(button.disabled||!gpReady(id)||s.pending||s.data?.status?.blocked||s.data?.status?.running||snapshot?.busy||id==='formation'&&nfState.pending)return;
 const value=gpDefaultConfig(id);if(!value)return;$('gp-'+id+'-config').value=gpJson(value);s.configDirty=true;gpInvalidate(id,true);gpConfigFields(id,gpParse('gp-'+id+'-config'));if(id==='naval')gpRenderNavalRules();gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已将安全默认配置复制到草稿；保存后仅修改本账号，执行前须重新探测、预览和授权。';
}
function gpControls(id) { wfUnifiedSyncCandidateControls(id); const s=gpGet(id),ready=gpReady(id),locked=Boolean(id==='formation'&&nfState.pending||s.data?.status?.blocked||s.data?.status?.running||snapshot?.busy);$('gp-'+id+'-load').disabled=s.pending||!current;$('gp-'+id+'-survey').disabled=!ready||s.pending||locked||!snapshot?.connected;$('gp-'+id+'-config-save').disabled=!ready||s.pending||locked;$('gp-'+id+'-config-default').disabled=!ready||s.pending||locked||!gpDefaultConfig(id);$('gp-'+id+'-plan').disabled=!ready||s.pending||locked||!snapshot?.connected||s.dirty||s.configDirty||s.selected.size!==1||Boolean(s.targetDraftPending);$('gp-'+id+'-authorize').disabled=s.pending||locked||!snapshot?.connected||s.dirty||s.configDirty||s.targetDraftPending||!gpPlanLive(s.plan);$('gp-'+id+'-stop').disabled=!ready||s.pending||!s.data?.status?.running;for(const field of $('gp-'+id+'-config-fields').children){const control=field.children[0];if(control?._configBooleanLive)control.disabled=!control._configBooleanLive();}for(const control of s.numberConfigControls||[])control.disabled=!control._numberConfigLive();for(const control of s.listConfigControls||[])control.disabled=!control._listConfigLive();for(const control of s.actionControls||[])control.disabled=control._blocked||Boolean((control._heroStarPrepare||control._workflowPrepare)&&!wfEditorEditable())||!(id==='trade'&&control._tradeSaleDraft?gpTradeSaleEditable():id==='heroes'&&control._heroExchangeDraft?gpHeroExchangeEditable():gpDomainSelectable(id));for(const control of s.factoryViewControls||[])control.disabled=s.pending||!gpReady(id);if(id==='mail'){for(const button of s.mailPageControls||[])button.disabled=!ready||s.pending||locked||!snapshot?.connected||button._mailOffset===-1&&(s.data?.view?.page?.pageNo??0)===0;for(const control of s.mailBatchControls||[])control.disabled=!control._mailBatchLive();}if(id==='trial-challenge')for(const control of s.trialSequenceControls||[])control.disabled=!control._trialSequenceLive();if(id==='task-rewards'){for(const control of s.dailyClosingControls||[])control.disabled=!control._dailyClosingLive();for(const control of s.taskRewardClosingControls||[])control.disabled=!control._taskRewardClosingLive();}if(id==='equipment-forge')for(const control of [...(s.forgePickControls||[]),...(s.forgeMakeControls||[])])control.disabled=!control._forgeBatchLive();if(id==='pirate-sweep')for(const control of s.pirateSweepBatchControls||[])control.disabled=!control._pirateSweepBatchLive();if(id==='material-packs')for(const control of s.materialPackBatchControls||[])control.disabled=!control._materialPackBatchLive();if(id==='trade')for(const control of s.tradeSaleBatchControls||[])control.disabled=!control._tradeSaleBatchLive();if(id==='city')for(const control of s.cityPreparationControls||[])control.disabled=!control._cityPreparationLive();if(id==='production')for(const control of [...(s.productionStartControls||[]),...(s.productionCollectionControls||[]),...(s.productionAccelerationControls||[])])control.disabled=!control._productionStartLive();if(id==='equipment-growth'||id==='badge-growth'||id==='heroes'||id==='antique-growth'||id==='museum'||id==='pet'||id==='formation-unlock')for(const control of s.growthBatchControls||[])control.disabled=!control._growthBatchLive();if(id==='museum'){antiqueControls();for(const control of s.museumExploreControls||[])control.disabled=!control._museumExploreLive();for(const control of s.museumExhibitControls||[])control.disabled=!control._museumExhibitLive();}if(id==='treasure'){for(const control of s.treasureControls||[])control.disabled=!control._treasureLive();for(const control of s.treasureBatchControls||[])control.disabled=!control._treasureBatchLive();}if(id==='naval'){for(const control of s.navalControls||[])control.disabled=!control._navalLive();for(const control of s.navalRuleControls||[])control.disabled=!control._navalRuleLive();}if(id==='formation'){for(const control of s.formationTargetControls||[])control.disabled=locked||!gpDomainSelectable(id);for(const key of ['mode','raid','mode-prepare'])$('gp-formation-'+key).disabled=!ready||s.pending||locked;for(const key of ['career','manual'])$('gp-formation-'+key).disabled=!gpDomainSelectable(id);$('gp-formation-restore').disabled=!s.restore||s.pending||nfState.pending;nfControls();exControls();}if(id==='fleet'){for(const control of s.fleetMoveControls||[])control.disabled=!control._fleetMoveLive();for(const control of s.fleetFieldControls||[])control.disabled=!control._fleetFieldLive();for(const control of s.cargoClaimControls||[])control.disabled=!control._cargoClaimLive();for(const control of s.cargoControls||[])control.disabled=control._blocked||Boolean(control._workflowPrepare&&!wfEditorEditable())||!gpCargoSelectable();for(const control of s.fleetFormationControls||[])control.disabled=!control._fleetFormLive();for(const control of [...(s.fleetOperationControls||[]),...(s.fleetRepairControls||[])])control.disabled=!control._fleetOperationLive();}if(id==='alliance'){for(const control of s.allianceCancelControls||[])control.disabled=!control._allianceCancelLive();for(const control of s.allianceOrderControls||[])control.disabled=!control._allianceOrderLive();for(const control of s.allianceFortControls||[])control.disabled=!control._allianceFortLive();for(const control of s.allianceShipControls||[])control.disabled=!control._allianceShipLive();for(const control of s.allianceControls||[])control.disabled=control._blocked||!gpAllianceSelectable();for(const control of s.allianceTechControls||[])control.disabled=!control._allianceTechLive();} wfUnifiedSurveyControl(id); }
function antiqueControls(){
 const s=gpGet('museum');
 $('antique-summary-read').disabled=antiqueState.pending||s.pending||!gpReady('museum')||!gameplayCsrfToken()||!snapshot?.connected||Boolean(snapshot?.busy)||s.data?.status?.blocked||s.data?.status?.running;
}
function renderAntiqueSummary(view){
 const box=gpClear($('antique-summary-view'));
 if(view?.status!=='AVAILABLE'){box.appendChild(gpEl('p','当前无法确认古董属性；请稍后重新查询。'));return;}
 const rows=[];
 for(const row of view.global||[])rows.push(['全局',row]);
 for(const group of view.camps||[])for(const row of group.attributes||[])rows.push(['阵营 · '+(group.name||group.id),row]);
 for(const group of view.professions||[])for(const row of group.attributes||[])rows.push(['职业 · '+(group.name||group.id),row]);
 function table(title,headers,values){
  box.appendChild(gpEl('h4',title));const t=gpEl('table'),head=gpEl('tr');
  for(const value of headers)head.appendChild(gpEl('th',value));t.appendChild(head);
  for(const row of values){const tr=gpEl('tr');for(const value of row)tr.appendChild(gpEl('td',value??'未知'));t.appendChild(tr);}
  box.appendChild(t);
 }
 if(rows.length)table('属性',['范围','属性','原值','类型'],rows.map(([scope,row])=>[scope,row.name||'属性 '+row.attr,row.value,row.viewType]));
 if(view.effects?.length)table('特殊效果',['效果','原值','类型'],view.effects.map(row=>[row.description||row.effectId,row.value,row.viewType]));
 if(!rows.length&&!view.effects?.length)box.appendChild(gpEl('p','本次查询没有属性或特殊效果。'));
}
$('antique-summary-read').onclick=async()=>{
 antiqueControls();if($('antique-summary-read').disabled)return;
 const scope=viewGuard.begin('antique-summary'),revision=gpRevision;antiqueState.pending=true;gpInvalidate('museum',false);gpRenderCandidates('museum');antiqueControls();gpClear($('antique-summary-view'));
 $('antique-summary-hint').textContent='正在读取本账号古董属性…';
 try{
  const data=await operationMutation('/api/antiques/summary',{},scope);
  if(!gpSafe(scope,revision))return;
  if(data.accountId!==scope.account||data.readOnly!==true||data.source!=='AntiqueAttrSummaryResponse')throw Error('古董属性响应不匹配');
  renderAntiqueSummary(data.view);
  $('antique-summary-hint').textContent=data.view?.status==='AVAILABLE'?'本次属性查询完成。':'本次属性未能确认。';
 }catch(error){if(gpSafe(scope,revision)){$('antique-summary-hint').textContent='查询失败：'+error.message;}}
 finally{if(gpSafe(scope,revision)){antiqueState.pending=false;antiqueControls();}}
};
function gpInvalidate(id,parametersChanged) { const s=gpGet(id);s.targetDraftPending=false;s.revision++;s.plan=null;s.selected.clear();if(parametersChanged)s.dirty=true;$('gp-'+id+'-plan-view').textContent='选择或参数已变化，请重新预览。';gpControls(id); }
function gpDetails(parent,label,value) { const d=gpEl('details'),sum=gpEl('summary',label);d.appendChild(sum);d.appendChild(gpEl('pre',gpJson(value)));parent.appendChild(d); }
function gpConfigFields(id,config) {
 const box=gpClear($('gp-'+id+'-config-fields')),s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-'+id+'-config').value,view=s.data?.view;
 for(const key of Object.keys(config||{})){
  if(typeof config[key]!=='boolean')continue;const label=gpEl('label'),input=gpEl('input');input.type='checkbox';input.checked=config[key];input._configBooleanLive=()=>gpSafe(scope,revision)&&gpReady(id)&&gpGet(id)===s&&s.data?.view===view&&$('gp-'+id+'-config').value===source&&Array.from(box.children).includes(label)&&!s.pending&&!s.data?.status?.blocked&&!s.data?.status?.running&&!snapshot?.busy;input.disabled=!input._configBooleanLive();
  input.onchange=()=>{if(!input._configBooleanLive())return;try{const value=gpParse('gp-'+id+'-config');value[key]=input.checked;$('gp-'+id+'-config').value=gpJson(value);if(s.numberConfigDraft?.source===source)s.numberConfigDraft.source=$('gp-'+id+'-config').value;if(s.listConfigDraft?.source===source)s.listConfigDraft.source=$('gp-'+id+'-config').value;gpGet(id).configDirty=true;gpInvalidate(id,false);gpConfigFields(id,value);if(id==='naval')gpRenderNavalRules();}catch(error){$('gp-'+id+'-hint').textContent=error.message;}};
  label.appendChild(input);label.appendChild(document.createTextNode(key));box.appendChild(label);
 }
 gpNumberConfigFields(id,config,box);gpListConfigFields(id,config,box);
}
function gpNumberConfigFields(id,config,box) {
 const s=gpGet(id),keys=Object.keys(config||{}).filter(key=>typeof config[key]==='number'),section=gpEl('div'),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-'+id+'-config').value,view=s.data?.view;s.numberConfigControls=[];
 if(!keys.length)return;box.appendChild(section);
 const live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&$('gp-'+id+'-config').value===source&&Array.from(box.children).includes(section);
 const editable=()=>live()&&gpReady(id)&&!s.pending&&!s.data?.status?.blocked&&!s.data?.status?.running&&!snapshot?.busy;
 const control=input=>{input._numberConfigLive=editable;input.disabled=!editable();s.numberConfigControls.push(input);return input;};
 const signature=JSON.stringify(keys);if(!s.numberConfigDraft||s.numberConfigDraft.source!==source||s.numberConfigDraft.signature!==signature)s.numberConfigDraft={source,signature,values:Object.fromEntries(keys.map(key=>[key,String(config[key])]))};const draft=s.numberConfigDraft;
 const labels={maxDailyHelps:'本次每日帮助上限',maxActionsPerPlan:'单计划动作上限',maximumSpeedItems:'最多使用探索加速道具',minimumRevenue:'最低探索收益门槛',maxFleets:'最多派遣舰队数',minimumDurabilityRatio:'最低耐久比例',petrolReserve:'汽油保留线',repairBelowDurabilityRatio:'低于此耐久比例才维修',maximumRepairPetrolPerPlan:'单计划维修汽油上限',scenarioId:'明确场景ID'};
 section.appendChild(gpEl('h4','本账号数值配置'));section.appendChild(gpEl('p','明确填写已有数值；应用后仍需保存本账号配置并重新探测。配置不证明实际库存、资格或成本；不会替代逐批授权。'));
 for(const key of keys){const label=gpEl('label',labels[key]||key),input=control(gpEl('input'));input.type='text';input.inputMode='decimal';input.value=draft.values[key];input.dataset.configNumber=key;input.oninput=()=>{if(input._numberConfigLive())draft.values[key]=input.value;};label.appendChild(input);section.appendChild(label);}
 const apply=control(gpEl('button','应用数值到配置草稿'));apply.type='button';apply.dataset.configNumbersApply=id;section.appendChild(apply);
 apply.onclick=()=>{if(!apply._numberConfigLive())return;try{const next=gpParse('gp-'+id+'-config');for(const key of keys){const raw=draft.values[key];if(!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(raw)||!CONFIG_NUMBER_VALID(Number(raw),'config.'+key))throw Error((labels[key]||key)+'超出原配置合同范围。');next[key]=Number(raw);}$('gp-'+id+'-config').value=gpJson(next);if(s.listConfigDraft?.source===source)s.listConfigDraft.source=$('gp-'+id+'-config').value;s.configDirty=true;gpInvalidate(id,true);gpConfigFields(id,next);$('gp-'+id+'-hint').textContent='数值已应用到本账号配置草稿；请保存后重新探测，原授权和预算保护继续生效。';}catch(error){$('gp-'+id+'-hint').textContent='数值未应用：'+error.message;}};
 const discard=control(gpEl('button','放弃数值编辑'));discard.type='button';discard.dataset.configNumbersDiscard=id;discard.onclick=()=>{if(!discard._numberConfigLive())return;s.numberConfigDraft=null;gpConfigFields(id,config);};section.appendChild(discard);
}

function gpListConfigFields(id,config,box) {
 const definitions=id==='alliance'?[
  {key:'memberIds',kind:'member',label:'明确成员ID列表'}, {key:'priorityMemberIds',kind:'member',label:'优先成员顺序'},
  {key:'itemIds',kind:'item',label:'明确物品ID列表'}, {key:'priorityItemIds',kind:'item',label:'优先物品顺序'},
  {key:'stockItemIds',pair:'stockReserveQuantities',kind:'item',label:'库存保留线'}, {key:'dailyBudgetItemIds',pair:'dailyBudgetQuantities',kind:'item',label:'每日预算上限（不推断日界）'}
 ]:id==='museum'?[{key:'stockItemIds',pair:'stockReserveQuantities',kind:'museum-item',label:'探索库存保留线'}]:id==='fleet'?[{key:'repairPriorityBuildingIds',kind:'fleet',label:'维修舰队优先顺序'}]:id==='treasure'?[{key:'colors',kind:'color',label:'明确宝藏品质列表',required:true}]:[];
 const specs=definitions.filter(spec=>Object.hasOwn(config||{},spec.key)||spec.pair&&Object.hasOwn(config||{},spec.pair)),s=gpGet(id);s.listConfigControls=[];if(!specs.length)return;
 const section=gpEl('div'),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-'+id+'-config').value,view=s.data?.view;box.appendChild(section);
 const live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&$('gp-'+id+'-config').value===source&&Array.from(box.children).includes(section);
 const editable=()=>live()&&gpReady(id)&&!s.pending&&!s.data?.status?.blocked&&!s.data?.status?.running&&!snapshot?.busy;
 const control=(input,allowed=()=>true)=>{input._listConfigLive=()=>editable()&&allowed();input.disabled=!input._listConfigLive();s.listConfigControls.push(input);return input;};
 const convert=(spec,rows)=>{
  if(rows.length>100||spec.required&&!rows.length)throw Error(spec.label+'需符合原列表数量范围。');const values=[],quantities=[];
  for(const row of rows){const text=row.value;let value=text;
   if(spec.kind==='member'){if(!/^[1-9][0-9]*$/.test(text)||text.length>19||BigInt(text)>9223372036854775807n)throw Error('成员ID需为正十进制int64原文。');}
   else if(spec.kind==='color'){if(!['3','4','5'].includes(text))throw Error('宝藏品质须明确选择3、4或5。');value=Number(text);}
   else if(spec.kind==='fleet'&&(!text.trim()||text.trim()!==text||text.length>300))throw Error('舰队建筑ID需为不带首尾空格的原文，最多300字符。');
   else if(!text.trim()||spec.kind==='item'&&text.length>200)throw Error('物品ID需非空且符合原字段长度；不自动裁剪或替换。');
   values.push(value);if(spec.pair){if(!/^(0|[1-9][0-9]*)$/.test(row.quantity)||!Number.isSafeInteger(Number(row.quantity))||Number(row.quantity)>1e9)throw Error('每项数量需明确填写0至10亿的安全整数。');quantities.push(Number(row.quantity));}
  }
  if(new Set(values).size!==values.length)throw Error(spec.label+'不能重复。');return {values,quantities};
 };
 section.appendChild(gpEl('h4','本账号列表与保留线'));section.appendChild(gpEl('p','每行是明确身份；成员ID保留十进制文本，物品ID原文保留，优先顺序不自动排序。库存/日预算的身份与数量同一行，数量不会自动补0；留空列表需明确删除全部行。应用后保存配置并重新探测；不证明库存或权威周期，不自动放行任何操作。'));
 let error;try{if(id==='fleet'&&!['IMMEDIATE','WAIT_NATURAL'].includes(config.repairMode))throw Error('原维修模式无效。');for(const spec of specs){const values=config[spec.key],quantities=spec.pair?config[spec.pair]:null;if(!Array.isArray(values)||values.length>100||spec.pair&&(!Array.isArray(quantities)||quantities.length!==values.length))throw Error(spec.label+'原配对结构或数量无效。');if(values.some(value=>spec.kind==='color'?typeof value!=='number':typeof value!=='string')||quantities?.some(value=>typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>1e9))throw Error(spec.label+'原字段类型无效。');convert(spec,values.map((value,index)=>({value:String(value),quantity:spec.pair?String(quantities[index]):''})));}}catch(cause){error=cause.message;}
 if(error){s.listConfigDraft=null;section.appendChild(gpEl('p','原列表需通过高级配置JSON明确修正：'+error+'；保留原文，不丢弃任何行。'));return;}
 const signature=JSON.stringify(specs.map(spec=>[spec.key,spec.pair]));if(!s.listConfigDraft||s.listConfigDraft.source!==source||s.listConfigDraft.signature!==signature)s.listConfigDraft={source,signature,repairMode:config.repairMode,rows:Object.fromEntries(specs.map(spec=>[spec.key,config[spec.key].map((value,index)=>({value:String(value),quantity:spec.pair?String(config[spec.pair][index]):''}))]))};const draft=s.listConfigDraft;
 const redraw=()=>gpConfigFields(id,config);
 if(id==='fleet'){
  const label=gpEl('label','明确维修模式 '),mode=control(gpEl('select'));mode.dataset.configRepairMode='true';for(const [value,text]of [['IMMEDIATE','即时维修（须有原精确成本与授权）'],['WAIT_NATURAL','等待自然恢复（仅观察，不派发维修）']]){const option=gpEl('option',text);option.value=value;mode.appendChild(option);}mode.value=draft.repairMode;mode.onchange=()=>{if(mode._listConfigLive())draft.repairMode=mode.value;};label.appendChild(mode);section.appendChild(label);section.appendChild(gpEl('p','优先顺序只排列已明确选择的原维修计划，不自动选择舰队；等待自然恢复不会推算恢复时间或定时触发维修。'));
 }

 const button=(text,key,run,allowed)=>{const value=control(gpEl('button',text),allowed);value.type='button';value.dataset.configListAction=key;value.onclick=()=>{if(value._listConfigLive())run();};return value;};
 for(const spec of specs){const rows=draft.rows[spec.key];gpAllianceTable(section,spec.label,spec.pair?['顺序','精确物品ID','明确数量','排序与删除']:['顺序',spec.kind==='color'?'明确品质':'精确ID','排序与删除'],rows.map((row,index)=>{
  const input=control(gpEl(spec.kind==='color'?'select':'input'));input.dataset.configList=spec.key;input.dataset.configListIndex=String(index);input.dataset.configListField='value';if(spec.kind==='color')for(const [value,text]of [['','请选择品质'],['3','3'],['4','4'],['5','5']]){const option=gpEl('option',text);option.value=value;input.appendChild(option);}input.value=row.value;input[spec.kind==='color'?'onchange':'oninput']=()=>{if(input._listConfigLive())row.value=input.value;};
  const values=[index+1,input];if(spec.pair){const quantity=control(gpEl('input'));quantity.type='text';quantity.inputMode='numeric';quantity.value=row.quantity;quantity.dataset.configList=spec.key;quantity.dataset.configListIndex=String(index);quantity.dataset.configListField='quantity';quantity.oninput=()=>{if(quantity._listConfigLive())row.quantity=quantity.value;};values.push(quantity);}
  const actions=gpEl('span');for(const [text,key,move,allowed]of [['上移','up',-1,()=>index>0],['下移','down',1,()=>index<rows.length-1]])actions.appendChild(button(text,key+':'+spec.key+':'+index,()=>{[rows[index],rows[index+move]]=[rows[index+move],rows[index]];redraw();},allowed));actions.appendChild(button('删除','remove:'+spec.key+':'+index,()=>{rows.splice(index,1);redraw();}));values.push(actions);return values;
 }));section.appendChild(button('添加'+spec.label,'add:'+spec.key,()=>{rows.push({value:'',quantity:''});redraw();},()=>rows.length<100));}
 section.appendChild(button('应用列表到配置草稿','apply',()=>{try{const next=gpParse('gp-'+id+'-config');if(id==='fleet'){if(!['IMMEDIATE','WAIT_NATURAL'].includes(draft.repairMode))throw Error('维修模式需明确选择原合同值。');next.repairMode=draft.repairMode;}for(const spec of specs){const converted=convert(spec,draft.rows[spec.key]);next[spec.key]=converted.values;if(spec.pair)next[spec.pair]=converted.quantities;}$('gp-'+id+'-config').value=gpJson(next);if(s.numberConfigDraft?.source===source)s.numberConfigDraft.source=$('gp-'+id+'-config').value;s.configDirty=true;gpInvalidate(id,true);gpConfigFields(id,next);$('gp-'+id+'-hint').textContent='列表与配对数量已应用到本账号配置草稿；请保存后重新探测，不推断日界或重领资格。';}catch(cause){$('gp-'+id+'-hint').textContent='列表未应用：'+cause.message;}}));
 section.appendChild(button('放弃列表编辑','discard',()=>{s.listConfigDraft=null;redraw();}));
}

function gpTargetDraftChanged(id){
 const s=gpGet(id);if(s.targetDraftPending)return;s.targetDraftPending=true;s.plan=null;s.selected.clear();gpClear($('gp-'+id+'-plan-view'));gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='目标表单正在编辑；旧候选选择、预览及授权已失效。应用明确目标后，请重新调查。';
}
function gpWatchTargetDraft(id,state,view,controlsKey='actionControls'){
 const scope=viewGuard.capture(),revision=gpRevision,controls=state[controlsKey]||[];
 for(const control of controls){
  if(!['input','select','textarea'].includes(control.tagName?.toLowerCase()))continue;
  for(const event of ['oninput','onchange']){const previous=control[event];if(previous?._targetDraftWatcher)continue;const watcher=function(...args){if(!control.disabled&&gpSafe(scope,revision)&&gpGet(id)===state&&state.data?.view===view&&state[controlsKey]?.includes(control)&&gpDomainSelectable(id))gpTargetDraftChanged(id);if(typeof previous==='function')return previous.apply(control,args);};watcher._targetDraftWatcher=true;control[event]=watcher;}
 }
}
function gpCandidateParametersChanged(id,row){
 if(!row.parameters||typeof row.parameters!=='object'||Array.isArray(row.parameters))return false;
 let old;try{old=gpParse('gp-'+id+'-parameters');}catch{old=null;}
 if(gpJson(old)===gpJson(row.parameters))return false;
 $('gp-'+id+'-parameters').value=gpJson(row.parameters);gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已同步原候选的精确目标参数；旧计划和选择已失效，请重新调查后再选择、预览并授权。';return true;
}
function gpRenderCandidates(id) {const s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,edit=s.revision,data=s.data,box=gpClear($('gp-'+id+'-candidates'));s.unifiedControls=[];for(const row of s.data?.view?.candidates||[]){const card=gpEl('article'),label=gpEl('label'),input=gpEl('input');input.type='checkbox';input.checked=s.selected.has(row.actionId);input.disabled=s.pending||s.dirty||s.targetDraftPending||gpBlocked(row);input.onchange=()=>{if(input.disabled||s.pending||s.targetDraftPending||!gpSafe(scope,revision)||gpGet(id)!==s||s.data!==data||s.revision!==edit)return;if(input.checked&&gpCandidateParametersChanged(id,row))return;s.selected.clear();if(input.checked){s.selected.add(row.actionId);if(row.parameters)$('gp-'+id+'-parameters').value=gpJson(row.parameters);}s.plan=null;s.revision++;gpClear($('gp-'+id+'-plan-view'));gpRender(id,s.data,s.scope);};label.appendChild(input);label.appendChild(document.createTextNode(row.label||row.actionType||row.actionId));card.appendChild(label);card.appendChild(gpEl('p','目标：'+gpJson(row.target)+' · 成本：'+operationCosts(row.costs)));card.appendChild(gpEl('p','成本来源：'+(row.costSource||'未知')));if(gpBlocked(row))card.appendChild(gpEl('p','禁止执行：'+(row.blockedReason||row.reason||'没有已验证动作')));gpDetails(card,'当前状态',row.beforeState);gpDetails(card,'预期状态',row.expectedState);wfUnifiedCandidateButton(card,id,row,s);box.appendChild(card);}for(const row of s.data?.view?.blocked||[])box.appendChild(gpEl('p','缺口：'+(row.blockedReason||row.reason||row.code||gpJson(row))));if(!box.children.length)box.textContent='当前没有可执行候选；请查看状态和缺口。'; }
function gpFarmHarvestText(plan) {return (plan.actions||[]).filter(row=>row.module==='farm'&&row.actionType==='HARVEST').map(row=>gpJson({buildingId:row.target?.buildingId,productId:row.target?.productId,plantTime:row.beforeState?.farm?.plantTime,ripeTime:row.beforeState?.farm?.ripeTime,uids:(plan.budgetClaims?.uids||[]).filter(uid=>uid.type==='farm-harvest')})).join('、');}
function gpQuotaText(plan) {const quotas=plan?.budgetClaims?.quotas;return Array.isArray(quotas)&&quotas.length?quotas.map(row=>row.id.startsWith('pirate-sweep:')?'海面扫荡 '+row.id.slice('pirate-sweep:'.length)+' ×'+row.num:row.id+' ×'+row.num).join('、'):'';}
function gpRenderPlan(box,plan) {gpClear(box);box.appendChild(gpEl('h3','待授权批次 '+plan.batchId));box.appendChild(gpEl('p',operationPlanIdentityText(plan)));box.appendChild(gpEl('p','总资源消耗：'+operationCosts(plan.resourceBudget)));renderOperationResourcePreview(box,plan);const crop=gpFarmHarvestText(plan);if(crop)box.appendChild(gpEl('p','作物批次：'+crop));const quota=gpQuotaText(plan);if(quota)box.appendChild(gpEl('p','额度占用：'+quota));box.appendChild(gpEl('p','计划标识：'+plan.planHash+' · 有效至：'+plan.expiresAt));for(const row of plan.actions||[]){const card=gpEl('article');card.appendChild(gpEl('h4',row.label||row.actionType));card.appendChild(gpEl('p','目标：'+gpJson(row.target)+' · 成本：'+operationCosts(row.costs)));card.appendChild(gpEl('p','成本来源：'+(row.costSource||'未知')));gpDetails(card,'当前状态',row.beforeState);gpDetails(card,'预期状态',row.expectedState);box.appendChild(card);}for(const note of plan.notes||[])box.appendChild(gpEl('p',typeof note==='string'?note:gpJson(note))); }
function gpRenderFormationLayout(view) {
 const box=$('gp-formation-layout');if(!box)return;gpClear(box);
 if(!gpReady('formation')){box.textContent='尚未读取本账号模板布局';return;}
 const id=Number($('gp-formation-template').value),layout=view?.layouts?.find(row=>row.id===id),unlocked=Array.isArray(view?.unlockedPresetIds)?view.unlockedPresetIds.includes(id):null;
 box.appendChild(gpEl('p','模板 '+(Number.isSafeInteger(id)&&id>0?id:'未知')+' · '+(unlocked===null?'解锁状态未知':unlocked?'已解锁':'未解锁')));
 const positions=layout?.positions,known=layout?.reliable===true&&Array.isArray(positions)&&positions.length>0&&positions.every(pos=>Number.isSafeInteger(pos?.x)&&Number.isSafeInteger(pos?.y))&&new Set(positions.map(pos=>pos.x+','+pos.y)).size===positions.length;
 if(!known){box.appendChild(gpEl('p','布局未知或坐标未经证实，无法预览。'));return;}
 box.appendChild(gpEl('p','站位布局：x 从上到下递减，y 从左到右递增。仅预览，不会应用阵容。'));
 const xs=[...new Set(positions.map(pos=>pos.x))].sort((a,b)=>b-a),ys=[...new Set(positions.map(pos=>pos.y))].sort((a,b)=>a-b),grid=gpEl('div');
 if(typeof grid.setAttribute==='function'){grid.setAttribute('role','group');grid.setAttribute('aria-label','模板 '+id+' 站位布局');}
 if(grid.style){grid.style.display='grid';grid.style.gridTemplateColumns='repeat('+ys.length+', minmax(90px, 1fr))';grid.style.gap='8px';grid.style.maxWidth='640px';grid.style.margin='8px 0';}
 for(const pos of positions){const slot=gpEl('div'),heroes=view?.formation?.presetId===id?(view.formation.heroPositions||[]).filter(row=>row.pos?.x===pos.x&&row.pos?.y===pos.y).map(row=>row.heroId):[];
  slot.appendChild(gpEl('strong','('+pos.x+', '+pos.y+')'));slot.appendChild(gpEl('p',heroes.length?'当前英雄：'+heroes.join('、'):'模板站位'));
  if(slot.style){slot.style.gridRow=String(xs.indexOf(pos.x)+1);slot.style.gridColumn=String(ys.indexOf(pos.y)+1);slot.style.border='1px solid #64748b';slot.style.borderRadius='6px';slot.style.padding='8px';slot.style.minWidth='0';slot.style.overflowWrap='anywhere';}grid.appendChild(slot);
 }box.appendChild(grid);
}
function gpRenderFormation(view) {$('gp-formation-mode').value=view?.mode==='expedition'?'expedition':'mainline';$('gp-formation-raid').value=view?.mode==='expedition'?String(view.raidId):'';const s=gpGet('formation'),scope=viewGuard.capture(),revision=gpRevision,select=gpClear($('gp-formation-template'));s.formationTargetControls=[select];for(const layout of view?.layouts||[]){const option=gpEl('option',layout.id+(view.unlockedPresetIds?.includes(layout.id)?' · 已解锁':' · 未解锁'));option.value=String(layout.id);option.disabled=!layout.reliable||!view.unlockedPresetIds?.includes(layout.id);select.appendChild(option);}select.value=String(s.previewPreset??view?.formation?.presetId??'');select.onchange=()=>{if(select.disabled||!gpSafe(scope,revision)||gpGet('formation')!==s||s.data?.view!==view||!s.formationTargetControls.includes(select))return;s.previewPreset=select.value;gpRenderFormationLayout(view);};gpRenderFormationLayout(view);const box=gpClear($('gp-formation-roster')),slots=new Map((view?.formation?.heroPositions||[]).map(r=>[r.heroId,r.pos]));for(const row of view?.heroes||[]){const label=gpEl('label'),check=gpEl('input'),x=gpEl('input'),y=gpEl('input');check.type='checkbox';check.checked=slots.has(row.heroId);check.value=row.heroId;x.type='number';y.type='number';x.value=String(slots.get(row.heroId)?.x??'');y.value=String(slots.get(row.heroId)?.y??'');check.dataset.hero=row.heroId;x.dataset.axis='x';y.dataset.axis='y';label.appendChild(check);label.appendChild(document.createTextNode(row.heroId+' · '+row.career+' x='));label.appendChild(x);label.appendChild(document.createTextNode(' y='));label.appendChild(y);label._formation={check:check,x:x,y:y};s.formationTargetControls.push(check,x,y);box.appendChild(label);}gpDetails(box,'当前完整阵容与宠物（只读）',view?.formation);s.restore=s.restore||null;gpWatchTargetDraft('formation',s,view,'formationTargetControls'); }
function gpAllianceSelectable() {const s=gpGet('alliance');return gpReady('alliance')&&!s.pending&&!s.data?.status?.blocked&&!s.data?.status?.running&&!snapshot?.busy&&snapshot?.connected;}
function gpAllianceParameters(parameters) {if(!gpAllianceSelectable())return;$('gp-alliance-parameters').value=gpJson(parameters);gpInvalidate('alliance',true);gpRenderCandidates('alliance');$('gp-alliance-hint').textContent='已选择精确业务目标；请重新只读探测、预览并授权。';}
function gpAllianceTable(parent,title,headings,rows) {const table=gpEl('table');table.appendChild(gpEl('caption',title));const head=gpEl('tr');for(const title of headings)head.appendChild(gpEl('th',title));table.appendChild(head);for(const values of rows){const tr=gpEl('tr');for(const value of values){const cell=gpEl('td');if(value&&typeof value==='object'&&value.tagName)cell.appendChild(value);else cell.textContent=String(value??'UNKNOWN');tr.appendChild(cell);}table.appendChild(tr);}if(!rows.length){const tr=gpEl('tr'),cell=gpEl('td','尚无可靠条目；不表示服务器状态为空');cell.setAttribute('colspan',String(headings.length));tr.appendChild(cell);table.appendChild(tr);}parent.appendChild(table);}
function gpAllianceFortGraph(data,payload,view,accountId){
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item),same=(a,b)=>canonical(a)===canonical(b),fort=view.fort,nodes=[{id:'start',type:'START'}],resources=[];
 if(data.accountId!==accountId||data.guildId!==view.guildId||data.cityId!==payload.cityId||fort?.fort?.cityId!==payload.cityId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||!same(data.donations,payload.donations)||data.maxDurationMs!==payload.maxDurationMs||!Array.isArray(data.steps)||data.steps.length!==payload.donations.length)throw Error('堡垒组合账号、联盟、城市或明确材料已变化');
 payload.donations.forEach((donation,i)=>{
  const material=fort.materials?.find(row=>row.itemId===donation.itemId),source=fort.donationSources?.find(row=>row.itemId===donation.itemId),parameters={cityId:payload.cityId,...donation},selection={unique:true},costs=[{id:donation.itemId,num:donation.num}],step=data.steps[i],target={guildId:view.guildId,cityId:payload.cityId,fortType:fort.fort.type,itemId:donation.itemId,num:donation.num};
  if(!source||source.expectedFortHash!==donation.expectedFortHash||!material||!Number.isSafeInteger(donation.num)||donation.num<1||donation.num>material.required-material.donated||donation.num>material.owned||!same(step?.parameters,parameters)||!same(step?.selection,selection)||!same(step?.target,target)||!same(step?.costs,costs)||!same(step?.budgetClaims,{resources:costs,quotas:[],uids:[]}))throw Error('堡垒原材料来源、需求、自有数量或父成本不匹配');
  resources.push(...costs);nodes.push({id:'fort-'+i,type:'ACTION',module:'alliance',parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'alliance'});
 });nodes.push({id:'stop',type:'STOP'});const graph=data.graph,budget={resources,quotas:[],uids:[]};
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.donations.length,modules:['alliance']}))throw Error('堡垒逐项验证图、有限上限或初始材料预算不匹配');return graph;
}
function gpRenderAllianceFortBatch(box,view){
 const id='alliance',s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-alliance-parameters').value,section=gpEl('article'),fort=view.fort,rows=fort?.materials||[];s.allianceFortControls=[];if(!rows.length)return;box.appendChild(section);section.appendChild(gpEl('h4','明确堡垒自有普通材料逐项捐献'));
 const live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&Array.from($('gp-alliance-facts').children).includes(box)&&$('gp-alliance-parameters').value===source,editable=()=>live()&&gpDomainSelectable(id)&&!s.targetDraftPending&&s.data?.config?.enabled===true&&s.data.config.fort===true&&wfEditorEditable(),control=(input,eligible=true)=>{input._allianceFortLive=()=>editable()&&eligible;input.disabled=!input._allianceFortLive();s.allianceFortControls.push(input);return input;};
 const changed=input=>{if(input.disabled||!editable())return;gpInvalidate(id,false);wfInvalidateSettingPlans();$('gp-alliance-hint').textContent='材料选择、数量或时长已编辑，旧计划和授权失效；准备时重新核对同城来源、当前需求及全部自有材料。';};
 const checks=rows.map(row=>{const original=fort.donationSources?.find(source=>source.itemId===row.itemId),eligible=fort.fort?.state===0&&!!original&&Number.isSafeInteger(row.owned)&&Number.isSafeInteger(row.donated)&&Number.isSafeInteger(row.required)&&Math.min(row.owned,row.required-row.donated)>0,check=control(gpEl('input'),eligible),num=control(gpEl('input'),eligible),label=gpEl('label',row.itemId+' · 已捐 '+row.donated+' / '+row.required+' · 自有 '+String(row.owned??'UNKNOWN')+' ');check.type='checkbox';check.checked=false;check.dataset.allianceFortTarget=row.itemId;check.onchange=()=>changed(check);num.type='number';num.min='1';num.max=String(Math.min(2147483647,row.owned??0,(row.required??0)-(row.donated??0)));num.step='1';num.value='';num.dataset.allianceFortQuantity=row.itemId;num.setAttribute('aria-label',row.itemId+'明确捐献数量');num.oninput=()=>changed(num);num.onchange=()=>changed(num);label.appendChild(check);label.appendChild(num);section.appendChild(label);return {row,original,check,num};});
 const chosen=()=>checks.filter(({check})=>check.checked).map(({row,original,num})=>({itemId:row.itemId,num:Number(num.value),expectedFortHash:original.expectedFortHash})),duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='';duration.placeholder='明确捐献组合总时长（秒）';duration.dataset.allianceFortDuration='true';duration.oninput=()=>changed(duration);duration.onchange=()=>changed(duration);section.appendChild(duration);
 const prepare=control(gpEl('button','准备原Workflow逐项捐献'),fort.fort?.state===0&&checks.some(({row,original})=>original&&Math.min(row.owned??0,(row.required??0)-(row.donated??0))>0));prepare.type='button';prepare.dataset.allianceFortPrepare='true';section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(!editable())return;const donations=chosen(),text=duration.value,seconds=Number(text),selected=checks.filter(({check})=>check.checked);if(!donations.length||donations.length>6||selected.some(({row,num})=>! /^[1-9][0-9]*$/.test(num.value)||!Number.isSafeInteger(Number(num.value))||Number(num.value)>2147483647||Number(num.value)>row.owned||Number(num.value)>row.required-row.donated)||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-alliance-hint').textContent='请明确1至6种不同自有普通材料、需求范围内的正整数数量及1至86400秒总时长。';return;}
  const payload={cityId:fort.fort.cityId,donations,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('alliance-fort-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(donations),config=s.data.config,editorDraft=$('wf-json').value;
  const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&duration.value===text&&JSON.stringify(chosen())===choice;
  s.plan=null;s.selected.clear();gpClear($('gp-alliance-plan-view'));s.pending=true;gpControls(id);
  try{const data=await operationMutation('/api/gameplay/alliance/fort/prepare',payload,requestScope);if(!active())return;editor.accept(gpAllianceFortGraph(data,payload,view,requestScope.account));$('wf-hint').textContent='已载入明确堡垒逐材料捐献；每项重新核算功勋、单次授权、typed回执和完整库存验证后继续。';$('gp-alliance-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-alliance-hint').textContent=error.message;}finally{if(gpGet(id)===s&&s.revision===edit){s.pending=false;gpControls(id);}}
 };section.appendChild(gpEl('p','默认不选、不填数量；固定初始自有材料预算，同日功勋按每项当前衰减重新预览。只捐献普通材料，不建造、兑换、使用礼包或推断堡垒完成。状态/目标变化、拒绝或UNKNOWN停止，重启只读。'));
}

function gpAllianceCancelGraph(data,payload,view,accountId){
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item),same=(a,b)=>canonical(a)===canonical(b),nodes=[{id:'start',type:'START'}],uids=[];
 if(data.accountId!==accountId||data.guildId!==view.guildId||data.playerId!==view.playerId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||!same(data.targets,payload.targets)||data.maxDurationMs!==payload.maxDurationMs||!Array.isArray(data.steps)||data.steps.length!==payload.targets.length)throw Error('取消组合账号、联盟或明确求助来源已变化');
 payload.targets.forEach((parameters,i)=>{const sources=view.cancelPreparation?.filter(row=>same(row.parameters,parameters)),source=sources?.length===1?sources[0]:null,step=data.steps[i];
  if(!source||!same(step?.parameters,parameters)||!same(step?.selection,source.selection)||!same(step?.target,source.target)||!same(step?.costs,[])||!same(step?.budgetClaims,source.budgetClaims)||!same(source.budgetClaims,{resources:[],quotas:[],uids:[{type:'alliance-aid',id:view.guildId+':'+parameters.reqIds[0]}]}))throw Error('原取消目标、来源、选择或零成本父UID不匹配');
  uids.push(...source.budgetClaims.uids);nodes.push({id:'cancel-'+i,type:'ACTION',module:'alliance',parameters,selection:source.selection},{id:'verify-'+i,type:'VERIFY',module:'alliance'});
 });nodes.push({id:'stop',type:'STOP'});const graph=data.graph,budget={resources:[],quotas:[],uids};
 if(new Set(uids.map(row=>row.id)).size!==uids.length||graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.targets.length,modules:['alliance']}))throw Error('取消逐项验证图、有限上限或父预算不匹配');return graph;
}
function gpRenderAllianceCancelBatch(box,view){
 const id='alliance',s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-alliance-parameters').value,section=gpEl('div'),rows=view.cancelPreparation||[];s.allianceCancelControls=[];if(!rows.length)return;box.appendChild(section);section.appendChild(gpEl('h4','明确本人未获帮助求助逐项取消'));
 const live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&$('gp-alliance-parameters').value===source,editable=()=>live()&&gpDomainSelectable(id)&&!s.targetDraftPending&&s.data?.config?.enabled===true&&s.data?.config?.cancel===true&&wfEditorEditable(),control=(input,eligible=true)=>{input._allianceCancelLive=()=>editable()&&eligible;input.disabled=!input._allianceCancelLive();s.allianceCancelControls.push(input);return input;};
 const changed=input=>{if(input.disabled||!editable())return;gpInvalidate(id,false);wfInvalidateSettingPlans();$('gp-alliance-hint').textContent='求助选择或时长已编辑，旧计划和授权失效；准备时重新调查本人列表、帮助者及截止。';};
 const checks=rows.map(row=>{const check=control(gpEl('input'));check.type='checkbox';check.checked=false;check.dataset.allianceCancelTarget=row.parameters.reqIds[0];check.onchange=()=>changed(check);const original=view.ownRequests?.find(item=>item.reqId===row.parameters.reqIds[0]),label=gpEl('label','请求 '+row.parameters.reqIds[0]+' · '+row.target.itemId+' · 截止 '+String(original?.endTime??'UNKNOWN')+' · 未获帮助 · 取消零资源成本 ');label.appendChild(check);section.appendChild(label);return {row,check};});
 const chosen=()=>checks.filter(({check})=>check.checked).map(({row})=>row.parameters),duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='';duration.dataset.allianceCancelDuration='true';duration.setAttribute('aria-label','取消求助组合总时长秒');duration.oninput=()=>changed(duration);duration.onchange=()=>changed(duration);section.appendChild(duration);
 const prepare=control(gpEl('button','准备原Workflow逐项取消'),rows.length>0);prepare.type='button';prepare.dataset.allianceCancelPrepare='true';section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(!editable())return;const targets=chosen(),text=duration.value,seconds=Number(text);if(!targets.length||targets.length>24||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-alliance-hint').textContent='请明确1至24个本人未获帮助请求及1至86400秒总时长。';return;}
  const payload={targets,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('alliance-cancel-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(targets),config=s.data.config,editorDraft=$('wf-json').value;
  const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&duration.value===text&&JSON.stringify(chosen())===choice;
  s.plan=null;s.selected.clear();gpClear($('gp-alliance-plan-view'));s.pending=true;gpControls(id);
  try{const data=await operationMutation('/api/gameplay/alliance/aid/cancel/prepare',payload,requestScope);if(!active())return;editor.accept(gpAllianceCancelGraph(data,payload,view,requestScope.account));$('wf-hint').textContent='已载入明确本人求助逐项取消；每项重新调查、单次授权及原本人列表移除验证。';$('gp-alliance-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-alliance-hint').textContent=error.message;}finally{if(gpGet(id)===s&&s.revision===edit){s.pending=false;gpControls(id);}}
 };section.appendChild(gpEl('p','默认不选；只取消当前未获帮助且未过期的本人请求，逐项重新确认来源。固定父请求UID，零资源成本；变化、拒绝或UNKNOWN停止，不领取、重新求助或重放。'));
}

function gpAllianceTechGraph(data,payload,view,accountId){
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item),same=(a,b)=>canonical(a)===canonical(b),nodes=[{id:'start',type:'START'}],totals=new Map();
 if(data.accountId!==accountId||data.guildId!==view.guildId||data.playerId!==view.playerId||!same(data.techState,view.techState)||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||!same(data.targets,payload.targets)||data.maxDurationMs!==payload.maxDurationMs||!Array.isArray(data.steps)||data.steps.length!==payload.targets.length)throw Error('科技组合账号、联盟、赛季/阶段或明确目标已变化');
 payload.targets.forEach((parameters,i)=>{const sources=view.technologies?.filter(row=>same(row.parameters,parameters)),source=sources?.length===1?sources[0]:null,step=data.steps[i],claims=source&&{resources:source.costs,quotas:[],uids:[]};
  if(!source||source.blockedReason!==null||!same(step?.parameters,parameters)||!same(step?.selection,source.selection)||!same(step?.target,parameters)||!same(step?.costs,source.costs)||!same(step?.budgetClaims,claims))throw Error('科技原目标、前置、成本或选择不匹配');
  for(const cost of source.costs){const num=(totals.get(cost.id)??0)+cost.num;if(!Number.isSafeInteger(cost.num)||cost.num<1||!Number.isSafeInteger(num))throw Error('科技点累计成本无效');totals.set(cost.id,num);}nodes.push({id:'tech-'+i,type:'ACTION',module:'alliance',parameters,selection:source.selection},{id:'verify-'+i,type:'VERIFY',module:'alliance'});
 });nodes.push({id:'stop',type:'STOP'});const graph=data.graph,budget={resources:[...totals].map(([id,num])=>({id,num})),quotas:[],uids:[]};
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.targets.length,modules:['alliance']}))throw Error('科技原逐项验证图、有限上限或父预算不匹配');return graph;
}
function gpRenderAllianceTechBatch(box,view){
 const id='alliance',s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-alliance-parameters').value,section=gpEl('div'),rows=view.technologies||[];s.allianceTechControls=[];if(!rows.length)return;box.appendChild(section);section.appendChild(gpEl('h4','明确科技逐项单级升级'));
 const live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&$('gp-alliance-parameters').value===source,editable=()=>live()&&gpDomainSelectable(id)&&!s.targetDraftPending&&s.data?.config?.enabled===true&&s.data?.config?.tech===true&&wfEditorEditable(),control=(input,eligible=true)=>{input._allianceTechLive=()=>editable()&&eligible;input.disabled=!input._allianceTechLive();s.allianceTechControls.push(input);return input;};
 const changed=input=>{if(input.disabled||!editable())return;gpInvalidate(id,false);wfInvalidateSettingPlans();$('gp-alliance-hint').textContent='科技选择或时长已编辑，旧计划和授权失效；准备时重新调查原等级、前置和完整库存。';};
 const checks=rows.map(row=>{const check=control(gpEl('input'),row.blockedReason===null&&Number.isSafeInteger(row.level)&&row.targetLevel===row.level+1);check.type='checkbox';check.checked=false;check.dataset.allianceTechTarget=String(row.techId);check.onchange=()=>changed(check);const label=gpEl('label',(row.name||row.techId)+' · '+row.level+'→'+row.targetLevel+' · '+operationCosts(row.costs)+' · '+(row.blockedReason||'当前前置已满足')+' ');label.appendChild(check);section.appendChild(label);return {row,check};});
 const chosen=()=>checks.filter(({check})=>check.checked).map(({row})=>row.parameters),duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='300';duration.dataset.allianceTechDuration='true';duration.setAttribute('aria-label','科技组合总时长秒');duration.oninput=()=>changed(duration);duration.onchange=()=>changed(duration);section.appendChild(duration);
 const prepare=control(gpEl('button','准备原Workflow逐项科技'),rows.some(row=>row.blockedReason===null));prepare.type='button';prepare.dataset.allianceTechPrepare='true';section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(!editable())return;const targets=chosen(),text=duration.value,seconds=Number(text);if(!targets.length||targets.length>24||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-alliance-hint').textContent='请明确1至24项不同科技的当前下一等级及1至86400秒总时长。';return;}
  const payload={targets,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('alliance-tech-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(targets),config=s.data.config,editorDraft=$('wf-json').value;
  const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&duration.value===text&&JSON.stringify(chosen())===choice;
  s.plan=null;s.selected.clear();gpClear($('gp-alliance-plan-view'));s.pending=true;gpControls(id);
  try{const data=await operationMutation('/api/gameplay/alliance/tech/prepare',payload,requestScope);if(!active())return;editor.accept(gpAllianceTechGraph(data,payload,view,requestScope.account));$('wf-hint').textContent='已载入明确科技逐项单级图；每项重新调查、单次授权及原完整科技/库存验证。';$('gp-alliance-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-alliance-hint').textContent=error.message;}finally{if(gpGet(id)===s&&s.revision===edit){s.pending=false;gpControls(id);}}
 };section.appendChild(gpEl('p','默认不选；每项仅升当前下一等级，必须已满足原前置，不能借本批未来升级制造资格。全部点数按原计划器累计预留；不自动选树、重置、兑换或补购，UNKNOWN停止不重放。'));
}

function gpAllianceShipGraph(data,payload,view,accountId){
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item),same=(a,b)=>canonical(a)===canonical(b),nodes=[{id:'start',type:'START'}],totals=new Map(),merchant=view.ship;
 if(data.accountId!==accountId||data.guildId!==view.guildId||data.playerId!==view.playerId||!same(data.period,merchant?.period)||!same(data.participation,merchant?.participation)||!Number.isSafeInteger(merchant?.participation?.remaining)||payload.targets.length>merchant.participation.remaining||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||!same(data.targets,payload.targets)||data.maxDurationMs!==payload.maxDurationMs||!Array.isArray(data.steps)||data.steps.length!==payload.targets.length)throw Error('商船组合账号、联盟、周期、参与余量或明确目标已变化');
 payload.targets.forEach((parameters,i)=>{const sources=merchant.preparation?.filter(row=>same(row.parameters,parameters)),source=sources?.length===1?sources[0]:null,step=data.steps[i];
  if(!source||source.executable!==true||source.blockedReason!==null||parameters.action!=='ship-order'||parameters.expectedPeriod!==merchant.period?.period||!same(step?.parameters,parameters)||!same(step?.selection,source.selection)||!same(step?.target,source.target)||!same(step?.costs,source.costs)||!same(step?.budgetClaims,source.budgetClaims)||!same(source.budgetClaims,{resources:source.costs,quotas:[],uids:[]}))throw Error('商船原单舱资格、周期/船只摘要、成本或选择不匹配');
  for(const cost of source.costs){const num=(totals.get(cost.id)??0)+cost.num;if(!Number.isSafeInteger(num)||num<=0)throw Error('商船累计材料不可靠');totals.set(cost.id,num);}nodes.push({id:'ship-'+i,type:'ACTION',module:'alliance',parameters,selection:source.selection},{id:'verify-'+i,type:'VERIFY',module:'alliance'});
 });nodes.push({id:'stop',type:'STOP'});const budget={resources:[...totals].map(([id,num])=>({id,num})),quotas:[],uids:[]},graph=data.graph;
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.targets.length,modules:['alliance']}))throw Error('商船原逐船验证图、有限上限或固定父材料预算不匹配');return graph;
}
function gpRenderAllianceShipBatch(box,view){
 const id='alliance',s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-alliance-parameters').value,section=gpEl('article'),merchant=view.ship,rows=merchant?.preparation||[];s.allianceShipControls=[];box.appendChild(section);section.appendChild(gpEl('h4','明确不同商船逐船单舱补货'));
 if(!rows.length){section.appendChild(gpEl('p','先选择原单舱补货目标并重新调查；组合候选复用同次商船完整来源，应聘船长不混入补货。'));return;}
 section.appendChild(gpEl('p','当前参与 '+String(merchant.participation?.current??'UNKNOWN')+' / '+String(merchant.participation?.maximum??'UNKNOWN')+' · 可再参与 '+String(merchant.participation?.remaining??'UNKNOWN')+'；不把预计到港当成释放余量。'));
 const live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&Array.from($('gp-alliance-facts').children).includes(box)&&$('gp-alliance-parameters').value===source,editable=()=>live()&&gpDomainSelectable(id)&&!s.targetDraftPending&&s.data?.config?.enabled===true&&s.data.config.ship===true&&wfEditorEditable(),control=(input,eligible=true)=>{input._allianceShipLive=()=>editable()&&eligible;input.disabled=!input._allianceShipLive();s.allianceShipControls.push(input);return input;};
 const changed=input=>{if(input.disabled||!editable())return;gpInvalidate(id,false);wfInvalidateSettingPlans();$('gp-alliance-hint').textContent='商船选择或时长已编辑，旧计划和授权失效；准备时重新核对原周期、各船舱位、参与余量与累计材料。';};
 const checks=rows.map(row=>{const check=control(gpEl('input'),row.executable===true&&row.blockedReason===null);check.type='checkbox';check.checked=false;check.dataset.allianceShipBatchTarget=row.parameters.shipId+':'+row.parameters.crewId;check.onchange=()=>changed(check);const label=gpEl('label','商船 '+row.parameters.shipId+' / 舱 '+row.parameters.crewId+' · '+operationCosts(row.costs)+' · '+(row.blockedReason??'可准备')+' ');label.appendChild(check);section.appendChild(label);return {check,row};});
 const chosen=()=>checks.filter(({check})=>check.checked).map(({row})=>row.parameters),duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='';duration.placeholder='明确补货组合总时长（秒）';duration.dataset.allianceShipBatchDuration='true';duration.oninput=()=>changed(duration);duration.onchange=()=>changed(duration);section.appendChild(duration);
 const prepare=control(gpEl('button','准备原Workflow逐船补货'),rows.some(row=>row.executable));prepare.type='button';prepare.dataset.allianceShipBatchPrepare='true';section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(!editable())return;const targets=chosen(),text=duration.value,seconds=Number(text);if(!targets.length||targets.length>24||new Set(targets.map(row=>row.shipId)).size!==targets.length||!Number.isSafeInteger(merchant.participation?.remaining)||targets.length>merchant.participation.remaining||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-alliance-hint').textContent='请明确选择1至24艘不同商船、每船仅一舱，且不超过当前参与余量，并填写1至86400秒总时长。';return;}
  const payload={targets,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('alliance-ships-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(targets),config=s.data.config,editorDraft=$('wf-json').value;
  const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&duration.value===text&&JSON.stringify(chosen())===choice;
  s.plan=null;s.selected.clear();gpClear($('gp-alliance-plan-view'));s.pending=true;gpControls(id);
  try{const data=await operationMutation('/api/gameplay/alliance/ship/prepare',payload,requestScope);if(!active())return;editor.accept(gpAllianceShipGraph(data,payload,view,requestScope.account));$('wf-hint').textContent='已载入明确不同商船逐船单舱补货；原同周期/目标守卫、初始自有材料父预算、逐船单次授权和完整库存/舱位验证保持。';$('gp-alliance-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-alliance-hint').textContent=error.message;}finally{if(gpGet(id)===s&&s.revision===edit){s.pending=false;gpControls(id);}}
 };section.appendChild(gpEl('p','默认不选；周期与原选定船只状态固定，材料和单舱资格沿同一原Function。每船确认本人登船且完整库存精确扣料后继续；变化、拒绝或UNKNOWN停止，不补购、不应聘船长、不推导出航、到港或航行奖励，重启只读。'));
}

function gpAllianceOrderGraph(data,payload,view,accountId){
 const canonical=v=>JSON.stringify(v,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item),same=(a,b)=>canonical(a)===canonical(b),graph=data.graph,source=view.orderPreparation,nodes=[{id:'start',type:'START'}],totals=new Map(),uids=[];
 if(data.accountId!==accountId||data.guildId!==view.guildId||data.playerId!==view.playerId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||!same(data.cityIds,payload.cityIds)||!same(data.expectedOrder,payload.expectedOrder)||!same(source?.expectedOrder,payload.expectedOrder)||data.maxDurationMs!==payload.maxDurationMs||!Array.isArray(data.steps)||data.steps.length!==payload.cityIds.length)throw Error('联盟订单账号、身份、来源、目标或时长不匹配');
 for(const [i,cityId] of payload.cityIds.entries()){
  const row=view.candidates?.find(row=>row.actionType==='finishOrder'&&row.target?.cityId===cityId),parameters={cityId,expectedOrder:{...payload.expectedOrder,used:payload.expectedOrder.used+i}},selection={actionId:'alliance:finishOrder:'+encodeURIComponent(canonical({cityId}))},costs=source.costs,claims={resources:costs,quotas:[{id:'alliance-order:'+data.guildId+':'+payload.expectedOrder.dayKey,num:1}],uids:[{type:'alliance-order',id:data.guildId+':'+payload.expectedOrder.dayKey+':'+cityId}]},step=data.steps[i];
  if(!row||!same(row.costs,costs)||!same(step?.parameters,parameters)||!same(step?.selection,selection)||!same(step?.target,{cityId})||!same(step?.costs,costs)||!same(step?.budgetClaims,claims))throw Error('订单逐城市原选择、成本或配额不匹配');
  for(const cost of costs){const sum=(totals.get(cost.id)??0)+cost.num;if(!Number.isSafeInteger(sum)||sum<=0)throw Error('订单累计材料无效');totals.set(cost.id,sum);}uids.push(...claims.uids);
  nodes.push({id:'order-'+i,type:'ACTION',module:'alliance',parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'alliance'});
 }
 nodes.push({id:'stop',type:'STOP'});const budget={resources:[...totals].map(([id,num])=>({id,num})),quotas:[{id:'alliance-order:'+data.guildId+':'+payload.expectedOrder.dayKey,num:payload.cityIds.length}],uids};
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.cityIds.length,modules:['alliance']}))throw Error('订单逐项验证、固定初始材料或有限配额不匹配');return graph;
}
function gpRenderAllianceOrderBatch(box,view){
 const id='alliance',s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-alliance-parameters').value,preparation=view?.orderPreparation,section=gpEl('div');s.allianceOrderControls=[];if(!preparation)return;box.appendChild(section);section.appendChild(gpEl('h4','明确多个联盟城市逐项交付当前订单'));
 const live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&$('gp-alliance-parameters').value===source,editable=()=>live()&&gpDomainSelectable(id)&&!s.targetDraftPending&&s.data?.config?.enabled===true&&s.data.config.orders===true&&wfEditorEditable(),control=(input,allowed=true)=>{input._allianceOrderLive=()=>editable()&&allowed;input.disabled=!input._allianceOrderLive();s.allianceOrderControls.push(input);return input;};
 const changed=input=>{if(input.disabled||!editable())return;gpInvalidate(id,false);wfInvalidateSettingPlans();$('gp-alliance-hint').textContent='订单城市或时长已编辑，旧计划和授权失效；准备时重新核订单、同日计数及累计材料。';};
 section.appendChild(gpEl('p','当前订单材料 '+operationCosts(preparation.costs)+' · 当前剩余额度 '+preparation.remaining+' · 游戏日 '+preparation.expectedOrder.dayKey+'。每城市各交付一次，不刷新订单。'));
 const rows=(view.candidates||[]).filter(row=>row.actionType==='finishOrder').map(row=>{const check=control(gpEl('input'));check.type='checkbox';check.checked=false;check.dataset.allianceOrderCity=String(row.target.cityId);check.onchange=()=>changed(check);const label=gpEl('label','城市 '+row.target.cityId+' · '+operationCosts(row.costs)+' ');label.appendChild(check);section.appendChild(label);return {row,check};});
 const chosen=()=>rows.filter(row=>row.check.checked).map(({row})=>row.target.cityId),duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='';duration.placeholder='明确订单组合总时长（秒）';duration.setAttribute('aria-label','联盟订单组合总时长秒');duration.oninput=()=>changed(duration);duration.onchange=()=>changed(duration);section.appendChild(duration);
 const prepare=control(gpEl('button','准备原Workflow逐城市交单'),rows.length>0);prepare.type='button';prepare.dataset.allianceOrderPrepare='true';section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(!editable())return;const cityIds=chosen(),text=duration.value,seconds=Number(text);if(!cityIds.length||cityIds.length>24||preparation.remaining!=='UNLIMITED'&&cityIds.length>preparation.remaining||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-alliance-hint').textContent='请选择当前额度内1至24个不同合格城市及1至86400秒总时长。';return;}
  const payload={cityIds,expectedOrder:preparation.expectedOrder,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('alliance-orders-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(cityIds),config=s.data.config,editorDraft=$('wf-json').value;
  const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&duration.value===text&&JSON.stringify(chosen())===choice;
  s.plan=null;s.selected.clear();gpClear($('gp-alliance-plan-view'));s.pending=true;gpControls(id);
  try{const data=await operationMutation('/api/gameplay/alliance/orders/prepare',payload,requestScope);if(!active())return;editor.accept(gpAllianceOrderGraph(data,payload,view,requestScope.account));$('wf-hint').textContent='已载入明确城市逐项交单图；每项新调查、单次授权及原同日计数/材料消耗验证。';$('gp-alliance-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-alliance-hint').textContent=error.message;}finally{if(gpGet(id)===s&&s.revision===edit){s.pending=false;gpControls(id);}}
 };section.appendChild(gpEl('p','默认不选；收入不扩初始材料预算，每城市一次，每项单独授权。订单换档、跨日、计数/身份/配置/城市变化、拒绝或UNKNOWN停止；不补购、不领取日常奖励、重启不续跑。当前仅显示本次调查范围内原合格城市，更多城市须用空参数重新调查。'));
}

function gpRenderAlliance(view) {const box=$('gp-alliance-facts'),s=gpGet('alliance'),scope=viewGuard.capture(),revision=gpRevision;s.allianceControls=[];if(!view)return;const section=gpEl('div');section.appendChild(gpEl('h3','联盟业务状态'));section.appendChild(gpEl('p','联盟 ID：'+(view.guildId??'UNKNOWN')+' · 本人 ID：'+(view.playerId??'UNKNOWN')));section.appendChild(gpEl('p','科技赛季 / 阶段：'+gpJson(view.techState)));const limits=view.dailyLimits||{};section.appendChild(gpEl('p','帮助剩余：'+(limits.help??'UNKNOWN')+' · 求助剩余：'+(limits.ask??'UNKNOWN')+' · 订单剩余：'+(limits.order??'UNKNOWN')+'。未知额度或冷却继续阻塞对应操作。'));
 const choose=(label,parameters,disabled=false)=>{const button=gpEl('button',label);button.disabled=disabled||!gpAllianceSelectable();button.dataset.allianceSelect=gpJson(parameters);button._blocked=disabled;button.onclick=()=>{if(!button.disabled&&gpSafe(scope,revision)&&gpGet('alliance').data?.view===view)gpAllianceParameters(parameters);};s.allianceControls.push(button);return button;};
 gpAllianceTable(section,'成员（按精确 ID 识别）',['玩家 ID','昵称','联盟职级','在线状态'],(view.members||[]).map(row=>[row.playerId,row.nickname,row.title,row.online===true?'在线':row.online===false?'离线':'UNKNOWN']));
 gpAllianceTable(section,'成员帮助请求',['请求 ID','玩家 ID','物品 ID','到期时间（服务器秒）','选择'],(view.requests||[]).map(row=>[row.reqId,row.askerId,row.itemId,row.endTime,choose('选择请求',{reqIds:[row.reqId],memberIds:[row.askerId],itemIds:[row.itemId]},!row.reqId||!row.askerId||!row.itemId)]));
 gpAllianceTable(section,'本人的求助',['请求 ID','物品 ID','帮助者 ID','到期时间（服务器秒）'],(view.ownRequests||[]).map(row=>[row.reqId,row.itemId,row.helperId??(row.helperKnown?'尚未帮助':'UNKNOWN'),row.endTime]));
 gpAllianceTable(section,'联盟科技（模板与前置由游戏配置提供）',['科技 ID','名称','当前等级','下一等级','成本及来源','前置条件 / 阻断','选择'],(view.technologies||[]).map(row=>{const level=row.level,targetLevel=row.targetLevel,parameters={techId:row.techId,targetLevel};return [row.techId,row.name,level,targetLevel,operationCosts(row.costs)+' · '+(row.costSource||'UNKNOWN'),gpJson({openStage:row.openStage,preTech:row.preTech,preTechLevel:row.preTechLevel,prerequisiteLevel:row.prerequisiteLevel})+' '+(row.blockedReason||''),choose('选择下一等级',parameters,!Number.isSafeInteger(row.techId)||!Number.isSafeInteger(level)||targetLevel!==level+1)];}));
 gpRenderAllianceCancelBatch(section,view);
 gpRenderAllianceTechBatch(section,view);
 gpRenderAllianceOrderBatch(section,view);
 gpAllianceTable(section,'联盟城市 / 堡垒读取',['城市 ID','读取'],(view.cities||[]).map(row=>[row.cityId,choose('选择城市读取',{cityId:row.cityId},!Number.isSafeInteger(row.cityId))]));
 const fort=view.fort;if(fort){section.appendChild(gpEl('p','堡垒：'+gpJson(fort.fort)+' · 同日捐赠计数：'+String(fort.dailyDonateNum??'UNKNOWN')+' · 游戏日：'+String(fort.dayKey??'UNKNOWN')+'。计数用于功勋衰减，单次仅使用已持有普通材料。'));gpAllianceTable(section,'堡垒普通材料单次目标',['材料','进度 / 需求','自有数量','本次数量','选择'],(fort.materials||[]).map(row=>{const input=gpEl('input');input.type='number';input.min='1';input.step='1';input.value='1';input.dataset.fortMaterial=row.itemId;input.disabled=!gpAllianceSelectable();input._blocked=false;s.allianceControls.push(input);const button=choose('选择捐赠',{cityId:fort.fort?.cityId,itemId:row.itemId,num:1},!fort.fort?.cityId);button.onclick=()=>{if(!button.disabled&&gpSafe(scope,revision)&&gpGet('alliance').data?.view===view){const num=Number(input.value);if(!Number.isSafeInteger(num)||num<=0||num>2147483647){$('gp-alliance-hint').textContent='本次数量必须为正整数';return;}gpAllianceParameters({cityId:fort.fort.cityId,itemId:row.itemId,num:num});}};return [row.itemId,String(row.donated??'UNKNOWN')+' / '+String(row.required??'UNKNOWN'),row.owned,input,button];}));}

 gpRenderAllianceFortBatch(section,view);
 section.appendChild(gpEl('h3','联盟商船补货与应聘'));
 section.appendChild(gpEl('p','补货选择单船单舱并使用已持有普通材料；应聘选择单船并核对英雄总星级资格。航行奖励仍需独立合同。'));
 const shipTarget=gpEl('div'),shipInput=gpEl('input'),crewInput=gpEl('input'),shipAction=gpEl('select');
 shipAction.dataset.allianceShipAction='true';for(const [value,label]of [['ship-order','补货并登船'],['ship-seek','应聘船长']]){const option=gpEl('option',label);option.value=value;shipAction.appendChild(option);}shipAction.value=view.ship?.selected?.action==='ship-seek'?'ship-seek':'ship-order';shipAction._blocked=false;s.allianceControls.push(shipAction);shipTarget.appendChild(shipAction);
 for(const [input,key,label] of [[shipInput,'shipId','商船 ID'],[crewInput,'crewId','舱位 ID']]){input.type='number';input.min='1';input.max='2147483647';input.step='1';input.value=String(view.ship?.selected?.[key]??'');input.dataset.allianceShipField=key;input.disabled=!gpAllianceSelectable();input._blocked=false;s.allianceControls.push(input);const field=gpEl('label',label+' ');field.appendChild(input);shipTarget.appendChild(field);}
 crewInput._blocked=shipAction.value==='ship-seek';crewInput.disabled=crewInput._blocked||!gpAllianceSelectable();
 shipAction.onchange=()=>{if(shipAction.disabled||!gpSafe(scope,revision)||gpGet('alliance').data?.view!==view)return;crewInput._blocked=shipAction.value==='ship-seek';crewInput.disabled=crewInput._blocked||!gpAllianceSelectable();};
 const prepareShip=choose('选择商船业务目标',{action:'ship-order'});prepareShip.dataset.allianceShipPrepare='true';prepareShip.onclick=()=>{if(prepareShip.disabled||!gpSafe(scope,revision)||gpGet('alliance').data?.view!==view)return;const valid=v=>/^[1-9][0-9]*$/.test(v)&&Number(v)<=2147483647;if(!['ship-order','ship-seek'].includes(shipAction.value)||!valid(shipInput.value)||shipAction.value==='ship-order'&&!valid(crewInput.value)){$('gp-alliance-hint').textContent='商船和舱位 ID 必须为正 int32 整数';return;}gpAllianceParameters({action:shipAction.value,shipId:Number(shipInput.value),...(shipAction.value==='ship-order'?{crewId:Number(crewInput.value)}:{})});};shipTarget.appendChild(prepareShip);section.appendChild(shipTarget);
 if(view.ship){const merchant=view.ship;section.appendChild(gpEl('p','商船周期：'+gpJson(merchant.period)+' · 来源：'+String(merchant.source??'UNKNOWN')+' · '+String(merchant.status??'UNKNOWN')+' · 最多参与：'+String(merchant.maximum??'UNKNOWN')+'。活动窗口仅用于资格校验，补货与应聘结果须独立复读。'));gpAllianceTable(section,'商船与精确舱位',['商船 ID','船长 ID','状态 / 准备截止','舱位 ID','乘员 ID','自有材料需求','选择'],(merchant.ships||[]).flatMap(ship=>(ship.cabin||[]).map(cabin=>[ship.shipId,ship.leaderId,ship.state+' / '+String(ship.preparedEndTime??'UNKNOWN'),cabin.crewId,cabin.playerId??'空舱',operationCosts(cabin.order),choose('选择此舱补货',{action:'ship-order',shipId:ship.shipId,crewId:cabin.crewId},!!cabin.playerId||!ship.leaderId||ship.state!==1)])));gpAllianceTable(section,'船长空位与精确应聘目标',['商船 ID','当前船长 ID','状态','选择'],(merchant.ships||[]).map(ship=>[ship.shipId,ship.leaderId??'空位',ship.state,choose('选择应聘船长',{action:'ship-seek',shipId:ship.shipId},!!ship.leaderId||ship.state!==1)]));
  if(merchant.qualification){section.appendChild(gpEl('p','每名英雄的基础星级与专武星级合计须达到总门槛；资格英雄在本轮预算中保留，其他玩法占用须单独核对。'));gpAllianceTable(section,'本船船长英雄资格',['英雄 ID','所需合计','基础星级','已观察专武星级','资格'],(merchant.qualification.rows||[]).map(row=>[row.heroId,row.requiredCombined,row.baseStar,row.exclusiveStar,row.qualified?'满足':'未知或未满足']));}}
 gpRenderAllianceShipBatch(section,view);
 section.appendChild(gpEl('p','选择只更新业务参数；没有直接游戏写入口。每次执行仍需具体计划、成本和单次授权。'));box.appendChild(section);gpWatchTargetDraft('alliance',s,view,'allianceControls');}

function gpHeroExchangeEditable(){const s=gpGet('heroes');return gpReady('heroes')&&!s.pending&&!s.configDirty&&!s.data?.status?.blocked&&!s.data?.status?.running&&!snapshot?.busy&&snapshot?.connected;}
function gpTradeSaleSource(){try{return gpJson(gpParse('gp-trade-parameters'));}catch{return $('gp-trade-parameters').value;}}
function gpTradeSaleEditable(){const s=gpGet('trade');return gpReady('trade')&&!s.pending&&!s.configDirty&&!s.data?.status?.blocked&&!s.data?.status?.running&&!snapshot?.busy&&snapshot?.connected;}
function gpDomainSelectable(id){const s=gpGet(id);return gpReady(id)&&!s.pending&&!s.dirty&&!s.configDirty&&!s.data?.status?.blocked&&!s.data?.status?.running&&!snapshot?.busy&&snapshot?.connected;}
function gpSelectDomainCandidate(id,actionId){const s=gpGet(id);if(s.targetDraftPending||!gpDomainSelectable(id))return;const row=s.data?.view?.candidates?.find(row=>row.actionId===actionId);if(!row||gpBlocked(row)||gpCandidateParametersChanged(id,row))return;s.selected.clear();s.selected.add(actionId);s.plan=null;s.revision++;if(row.parameters)$('gp-'+id+'-parameters').value=gpJson(row.parameters);gpClear($('gp-'+id+'-plan-view'));gpRender(id,s.data,s.scope);$('gp-'+id+'-hint').textContent='已选择当前单项候选；请预览成本及效果并授权。';}
function gpFarmPlantSources(view){return (view?.plots||[]).filter(plot=>plot.reliable===true&&plot.state==='EMPTY').flatMap(plot=>(view?.candidates||[]).filter(row=>row.actionType==='PLANT'&&row.target?.buildingId===plot.buildingId&&!gpBlocked(row)&&typeof row.identity==='string').map(row=>({buildingId:plot.buildingId,productId:row.target.productId,identity:row.identity})));}
function gpFarmPlantGraph(data,payload,view,accountId){
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item),same=(a,b)=>canonical(a)===canonical(b),sources=gpFarmPlantSources(view),nodes=[{id:'start',type:'START'}],resources=new Map();
 if(data.accountId!==accountId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||!same(data.targets,payload.targets)||payload.targets.length<1||payload.targets.length>12||new Set(payload.targets.map(t=>t.buildingId)).size!==payload.targets.length)throw Error('返回的账号、原空田或自选作物不匹配');
 for(let i=0;i<payload.targets.length;i++){const source=payload.targets[i],row=view.candidates.find(row=>row.actionType==='PLANT'&&row.target?.buildingId===source.buildingId&&row.target?.productId===source.productId),claims=row?.budgetClaims;if(!same(source,sources.find(r=>r.buildingId===source.buildingId&&r.productId===source.productId))||!same(claims?.resources,row?.costs)||!Array.isArray(row?.costs)||row.costs.length!==1||!same(claims?.quotas,[])||!same(claims?.uids,[]))throw Error('原空田、自选作物或种子成本不匹配');for(const cost of row.costs){const num=(resources.get(cost.id)||0)+cost.num;if(typeof cost.id!=='string'||!cost.id||!Number.isSafeInteger(cost.num)||cost.num<=0||!Number.isSafeInteger(num))throw Error('种子成本未知');resources.set(cost.id,num);}nodes.push({id:'plant-'+i,type:'ACTION',module:'farm',parameters:{buildingId:source.buildingId,action:'plant',productId:source.productId,pendingPlants:payload.targets.slice(i)},selection:{unique:true}},{id:'verify-'+i,type:'VERIFY',module:'farm'});}
 nodes.push({id:'stop',type:'STOP'});const graph=data.graph,budget={resources:[...resources].map(([id,num])=>({id,num})),quotas:[],uids:[]};if(graph?.version!==1||typeof graph.id!=='string'||!graph.id||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.targets.length,modules:['farm']}))throw Error('返回的播种顺序、剩余来源守卫或累计种子预算不匹配');return graph;
}
function gpFarmHarvestSources(view){return (view?.plots||[]).filter(plot=>plot.reliable===true&&plot.state==='RIPE').flatMap(plot=>{const row=view?.candidates?.find(row=>row.actionType==='HARVEST'&&row.target?.buildingId===plot.buildingId);return row&&!gpBlocked(row)&&typeof row.identity==='string'?[{buildingId:plot.buildingId,productId:plot.productId,plantTime:plot.plantTime,ripeTime:plot.ripeTime,identity:row.identity}]:[];});}
function gpFarmHarvestGraph(data,payload,view,accountId){
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item),same=(a,b)=>canonical(a)===canonical(b),sources=gpFarmHarvestSources(view),nodes=[{id:'start',type:'START'}],budget={resources:[],quotas:[],uids:[]},resources=new Map();
 if(data.accountId!==accountId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||!same(data.targets,payload.targets)||payload.targets.length<1||payload.targets.length>12||new Set(payload.targets.map(t=>t.buildingId)).size!==payload.targets.length)throw Error('返回的账号或原农田来源不匹配');
 const replant=payload.replant?.map((next,i)=>{const source=payload.targets[i],crop=view.crops?.find(c=>c.reliable===true&&c.productId===next.productId);if(next.buildingId!==source.buildingId||!Array.isArray(crop?.costs)||crop.costs.length!==1)throw Error('明确下一作物及种子来源不匹配');const cost=crop.costs[0],num=(resources.get(cost.id)||0)+cost.num;if(typeof cost.id!=='string'||!cost.id||['RUBY','钻石','4'].includes(cost.id)||!Number.isSafeInteger(cost.num)||cost.num<=0||!Number.isSafeInteger(num))throw Error('再播种种子成本未知');resources.set(cost.id,num);return {...source,nextProductId:next.productId,seedId:cost.id,seedNum:cost.num};});
 if(!same(data.replant,replant))throw Error('返回的再播种来源或初始成本不匹配');
 for(let i=0;i<payload.targets.length;i++){const source=payload.targets[i],row=view.candidates.find(row=>row.actionType==='HARVEST'&&row.target?.buildingId===source.buildingId),claims=row?.budgetClaims;if(!same(source,sources.find(r=>r.buildingId===source.buildingId))||!same(claims?.resources,[])||!same(claims?.quotas,[])||claims?.uids?.length!==1||claims.uids[0].type!=='farm-harvest'||typeof claims.uids[0].id!=='string'||!claims.uids[0].id)throw Error('返回的地块、作物、批次或原UID预算不匹配');budget.uids.push(...claims.uids);nodes.push({id:'harvest-'+i,type:'ACTION',module:'farm',parameters:{buildingId:source.buildingId,action:'harvest',pendingHarvests:payload.targets.slice(i),...(replant?{replant:replant.slice(i)}:{})},selection:{unique:true}},{id:(replant?'verify-harvest-':'verify-')+i,type:'VERIFY',module:'farm'});if(replant)nodes.push({id:'plant-'+i,type:'ACTION',module:'farm',parameters:{buildingId:source.buildingId,action:'plant',productId:replant[i].nextProductId,replant:replant.slice(i)},selection:{unique:true}},{id:'verify-plant-'+i,type:'VERIFY',module:'farm'});}
 budget.resources=[...resources].map(([id,num])=>({id,num}));nodes.push({id:'stop',type:'STOP'});const graph=data.graph;if(graph?.version!==1||typeof graph.id!=='string'||!graph.id||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.targets.length*(replant?2:1),modules:['farm']}))throw Error('返回的逐田顺序、来源守卫或父预算不匹配');return graph;
}
function gpRenderFarmHarvest(id,s,box,view){
 const scope=viewGuard.capture(),revision=gpRevision,sources=gpFarmHarvestSources(view),choices=[];box.appendChild(gpEl('h3','明确农田有限顺序收取'));box.appendChild(gpEl('p','明确选择成熟农田及总时长；可逐田收取，或为每田明确下一作物，收取确认后再播种。最多12田，准备只载入原工作流编辑器，仍须开始并授权。'));
 for(const source of sources){const label=gpEl('label'),choice=gpEl('input'),crop=gpEl('select');choice.type='checkbox';choice.checked=false;choice.dataset.farmHarvestTarget=source.buildingId;crop.dataset.farmReplantCrop=source.buildingId;const blank=gpEl('option','再播种时请选择下一作物');blank.value='';crop.appendChild(blank);for(const row of view.crops||[]){if(row.reliable!==true)continue;const option=gpEl('option',row.productId+' · '+operationCosts(row.costs));option.value=row.productId;crop.appendChild(option);}crop.value='';label.appendChild(choice);label.appendChild(gpEl('span',source.buildingId+' · '+source.productId+' · '+source.plantTime+' → '+source.ripeTime));label.appendChild(crop);box.appendChild(label);choices.push({source,choice,crop});}
 const durationLabel=gpEl('label','本次总时长（秒）'),duration=gpEl('input');duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='';duration.dataset.farmHarvestDuration='true';durationLabel.appendChild(duration);box.appendChild(durationLabel);
 const prepare=gpEl('button','准备所选农田逐田收取'),replant=gpEl('button','准备收取确认后再播种');prepare.dataset.farmHarvestPrepare='true';replant.dataset.farmReplantPrepare='true';for(const button of [prepare,replant]){button._workflowPrepare=true;button._blocked=!sources.length;}const selection=()=>choices.filter(row=>row.choice.checked).map(row=>row.source),nextSelection=()=>choices.filter(row=>row.choice.checked).map(row=>({buildingId:row.source.buildingId,productId:row.crop.value}));
 const run=async withReplant=>{const button=withReplant?replant:prepare;if(button.disabled||!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id).data?.view!==view||!wfEditorEditable())return;const targets=selection(),next=nextSelection(),secondsText=duration.value,seconds=Number(secondsText);if(targets.length<1||targets.length>12||!/^[1-9][0-9]*$/.test(secondsText)||!Number.isInteger(seconds)||seconds>86400||withReplant&&next.some(row=>!view.crops?.some(c=>c.reliable===true&&c.productId===row.productId))){$('gp-'+id+'-hint').textContent='请明确选择1至12块成熟农田及1至86400秒总时长；再播种还须明确每田下一作物。';return;}
  const payload={targets,maxDurationMs:seconds*1000,...(withReplant?{replant:next}:{})},requestScope=viewGuard.begin('farm-harvest-prepare'),editor=captureStageRecommendationEditor(),stateRevision=++s.revision,sourceText=gpJson(targets),nextText=gpJson(next),editorDraft=$('wf-json').value;const active=()=>gpSafe(requestScope,revision)&&gpGet(id)===s&&s.revision===stateRevision&&s.data?.view===view&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&gpJson(selection())===sourceText&&(!withReplant||gpJson(nextSelection())===nextText)&&duration.value===secondsText;
  s.plan=null;gpClear($('gp-'+id+'-plan-view'));s.pending=true;gpControls(id);try{const data=await operationMutation('/api/gameplay/farm/harvest/prepare',payload,requestScope);if(!active())return;editor.accept(gpFarmHarvestGraph(data,payload,view,requestScope.account));$('wf-hint').textContent=withReplant?'已载入逐田收取确认后再播种图；核对原作物、下一作物、初始种子累计预算和总期限，再开始并授权。':'已载入固定原作物批次的逐田收取图；核对每田来源、累计UID预算和总期限，再开始并授权。';$('gp-'+id+'-hint').textContent=data.limitation;}catch(cause){if(gpSafe(requestScope,revision)&&gpGet(id)===s)$('gp-'+id+'-hint').textContent='农田组合未准备：'+cause.message;}finally{if(gpSafe(requestScope,revision)&&gpGet(id)===s){s.pending=false;gpControls(id);}}
 };prepare.onclick=()=>run(false);replant.onclick=()=>run(true);box.appendChild(prepare);box.appendChild(replant);for(const control of [...choices.flatMap(row=>[row.choice,row.crop]),duration,prepare,replant]){control.disabled=control._blocked||!gpDomainSelectable(id);s.actionControls.push(control);}
}



function gpMaterialCoverageResult(data,target,recipe,accountId){
 const same=(a,b)=>gpJson(a)===gpJson(b),coverage=data?.coverage,covered=coverage?.status==='COVERED';
 if(data?.accountId!==accountId||!same(data.target,target)||!same(data.costs,recipe.costs)||data.executable!==false||data.projectionOnly!==true||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||!/^[a-f0-9]{64}$/.test(data.productionIdentity)||!coverage||!['COVERED','IN_STOCK','INSUFFICIENT','BLOCKED','UNKNOWN'].includes(coverage.status)||coverage.executable!==false||coverage.projectionOnly!==true||coverage.ok!==covered||coverage.reliable!==(coverage.status!=='UNKNOWN')||!Array.isArray(coverage.gaps)||!Array.isArray(coverage.needs)||!Array.isArray(coverage.exchanges)||!Array.isArray(data.packs)||!Number.isInteger(data.season)||data.season<0||!covered&&coverage.exchanges.length)throw Error('覆盖建议的账号、目标、配方成本或只读边界不匹配');
 if(!covered)return data;
 const choices=coverage.exchanges,totals=new Map(),materials=new Set();
 if(!choices.length||choices.length>23||choices.length!==coverage.gaps.length)throw Error('覆盖建议必须有有限、完整的缺口与明确选择');
 for(let i=0;i<choices.length;i++){
  const choice=choices[i],gap=coverage.gaps[i],cost=recipe.costs.find(row=>row.id===choice.itemId),pack=data.packs.find(row=>row.packId===choice.packId),item=pack?.targets?.find(row=>row.itemId===choice.itemId),total=(totals.get(choice.packId)||0)+choice.num;
  if(!choice||Object.keys(choice).sort().join(',')!=='itemId,num,packId'||!['原料自选包','工事材料自选包'].includes(choice.packId)||!cost||materials.has(choice.itemId)||!Number.isInteger(choice.num)||choice.num<1||choice.num>2147483647||!Number.isSafeInteger(total)||!Number.isSafeInteger(pack?.have)||pack.have<total||!Number.isInteger(item?.perPack)||item.perPack<1||!Number.isInteger(item.requiredSeason)||item.requiredSeason<1||item.requiredSeason>data.season||!Number.isSafeInteger(item.have)||item.have<0||gap?.id!==choice.itemId||gap.num!==cost.num||gap.have!==item.have||gap.gap!==Math.max(0,cost.num-item.have)||gap.gap<1||gap.pack!==choice.packId||gap.per!==item.perPack||gap.packs!==choice.num||gap.packHave!==pack.have||choice.num!==Math.ceil(gap.gap/item.perPack)||gap.projectedGain!==choice.num*item.perPack||!Number.isSafeInteger(gap.projectedGain)||gap.eligible!==true||gap.blockedReason!==null)throw Error('覆盖建议的材料缺口、赛季、包资格或合计数量不匹配');
  totals.set(choice.packId,total);materials.add(choice.itemId);
 }
 if(!same(coverage.needs,[...totals].map(([pack,num])=>({pack,num,have:data.packs.find(row=>row.packId===pack).have}))))throw Error('覆盖建议的合计持有包不匹配');
 return data;
}
function gpRenderMaterialCoverage(id,s,box,view){
 const scope=viewGuard.capture(),revision=gpRevision,select=gpEl('select');select.dataset.productionCoverageTarget='true';const empty=gpEl('option','请选择工厂与配方');empty.value='';select.appendChild(empty);
 const recipes=[];for(const factory of view?.factories||[])for(const recipe of factory.recipes||[]){const target={buildingId:factory.buildingId,productId:recipe.productId};if(!target.buildingId||!target.productId||!gpBudget(recipe.costs))continue;recipes.push({target,recipe});const option=gpEl('option',target.buildingId+' → '+target.productId+' · '+operationCosts(recipe.costs));option.value=gpJson(target);select.appendChild(option);}
 const read=gpEl('button','读取当前持有包覆盖建议');read.dataset.productionCoverageRead='true';const results=gpEl('div');results.dataset.productionCoverageResult='true';
 const use=gpEl('input');use.type='checkbox';use.checked=false;use._blocked=true;use.dataset.productionCoverageUse='true';const useLabel=gpEl('label','使用上述有序材料与包数准备有限图');useLabel.appendChild(use);
 const duration=gpEl('input');duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='';duration.dataset.productionCoverageDuration='true';const durationLabel=gpEl('label','本次总时长（秒）');durationLabel.appendChild(duration);
 const prepare=gpEl('button','准备覆盖后指定单份生产');prepare.dataset.productionCoveragePrepare='true';prepare._workflowPrepare=true;prepare._blocked=true;let suggestion=null;
 const reset=()=>{suggestion=null;use.checked=false;use._blocked=true;prepare._blocked=true;gpClear(results);gpControls(id);};select.onchange=reset;use.onchange=()=>{prepare._blocked=!(suggestion?.coverage.status==='COVERED'&&use.checked);gpControls(id);};
 read.onclick=async()=>{
  if(read.disabled||!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id).data?.view!==view)return;reset();const choice=select.value,entry=recipes.find(row=>gpJson(row.target)===choice);if(!entry){$('gp-'+id+'-hint').textContent='请明确选择一个当前工厂与配方。';return;}
  const requestScope=viewGuard.begin('production-coverage'),stateRevision=++s.revision,parameterText=$('gp-'+id+'-parameters').value,active=()=>gpSafe(requestScope,revision)&&gpGet(id)===s&&s.revision===stateRevision&&s.data?.view===view&&select.value===choice&&$('gp-'+id+'-parameters').value===parameterText&&snapshot?.connected&&!snapshot?.busy;
  s.pending=true;gpControls(id);try{const data=await operationMutation('/api/gameplay/production/material/coverage',entry.target,requestScope);if(!active())return;suggestion=gpMaterialCoverageResult(data,entry.target,entry.recipe,requestScope.account);results.appendChild(gpEl('p','覆盖状态：'+suggestion.coverage.status+' · '+(suggestion.coverage.reason||'当前只读投影')));for(const row of suggestion.coverage.gaps)results.appendChild(gpEl('p',row.id+' · 缺 '+row.gap+' · '+(row.pack||'无普通包')+' ×'+(row.packs??'未知')+' · '+(row.blockedReason||'仅建议')));use._blocked=suggestion.coverage.status!=='COVERED';$('gp-'+id+'-hint').textContent=data.limitation;}catch(error){if(gpSafe(requestScope,revision)&&gpGet(id)===s)$('gp-'+id+'-hint').textContent='覆盖建议未读取：'+error.message;}finally{if(gpSafe(requestScope,revision)&&gpGet(id)===s){s.pending=false;gpControls(id);}}
 };
 prepare.onclick=async()=>{
  if(prepare.disabled||!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id).data?.view!==view||!wfEditorEditable()||!use.checked||suggestion?.coverage.status!=='COVERED')return;
  const choice=select.value,entry=recipes.find(row=>gpJson(row.target)===choice),seconds=duration.value,selected=suggestion;if(!entry||!/^[1-9][0-9]*$/.test(seconds)||!Number.isInteger(Number(seconds))||Number(seconds)>86400){$('gp-'+id+'-hint').textContent='请明确填写1至86400秒总时长。';return;}
  const exchanges=selected.coverage.exchanges,payload={...(exchanges.length===1?exchanges[0]:{exchanges}),...entry.target,maxDurationMs:Number(seconds)*1000},requestScope=viewGuard.begin('production-coverage-prepare'),stateRevision=++s.revision,editor=captureStageRecommendationEditor(),editorDraft=$('wf-json').value,parameterText=$('gp-'+id+'-parameters').value;
  const active=()=>gpSafe(requestScope,revision)&&gpGet(id)===s&&s.revision===stateRevision&&s.data?.view===view&&select.value===choice&&suggestion===selected&&use.checked&&duration.value===seconds&&$('gp-'+id+'-parameters').value===parameterText&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft;
  s.plan=null;gpClear($('gp-'+id+'-plan-view'));s.pending=true;gpControls(id);try{const data=await operationMutation('/api/gameplay/production/material/prepare',payload,requestScope);if(!active())return;if(gpJson(data.costs)!==gpJson(selected.costs))throw Error('准备期间配方成本已变化，请重新读取建议');editor.accept(gpMaterialProductionGraph(data,payload,selected,requestScope.account));$('gp-'+id+'-hint').textContent=data.limitation;$('wf-hint').textContent='已载入明确覆盖后的有限生产图；核对每项材料、包数、配方成本与累计预算，再开始并授权。';}catch(error){if(gpSafe(requestScope,revision)&&gpGet(id)===s)$('gp-'+id+'-hint').textContent='覆盖生产图未准备：'+error.message;}finally{if(gpSafe(requestScope,revision)&&gpGet(id)===s){s.pending=false;gpControls(id);}}
 };
 box.appendChild(gpEl('h4','指定配方的当前普通材料包覆盖'));for(const node of [select,read,results,useLabel,durationLabel,prepare])box.appendChild(node);for(const control of [select,read,use,duration,prepare])s.actionControls.push(control);
 box.appendChild(gpEl('p','先读取并核对缺口、赛季和合计持有包，再明确选择建议及总期限。建议不增加库存；准备会重新调查，有限图仍须原授权，每步独立确认，UNKNOWN停止。'));
 return {clear(){select.value='';reset();},selectTarget(target){if(!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id).data?.view!==view||!recipes.some(row=>gpJson(row.target)===gpJson(target)))return false;select.value=gpJson(target);reset();return true;}};
}


function gpProductionFactories(view){
 const factories=Array.isArray(view?.factories)?view.factories:[];
 return factories.filter(factory=>typeof factory?.buildingId==='string'&&factory.buildingId&&factories.filter(row=>row?.buildingId===factory.buildingId).length===1);
}
function gpProductionRecipeTargets(factory){
 const recipes=Array.isArray(factory?.recipes)?factory.recipes:[];
 return recipes.filter(recipe=>typeof recipe?.productId==='string'&&recipe.productId&&gpBudget(recipe.costs)&&recipes.filter(row=>row?.productId===recipe.productId).length===1);
}
function gpRenderProductionFactory(id,s,box,view,coverage){
 const scope=viewGuard.capture(),revision=gpRevision,select=gpEl('select'),detail=gpEl('div'),unique=gpProductionFactories(view);
 select.dataset.productionFactory='true';detail.dataset.productionFactoryDetail='true';const blank=gpEl('option','请选择工厂查看详情');blank.value='';select.appendChild(blank);
 for(const factory of unique){const option=gpEl('option',factory.buildingId);option.value=factory.buildingId;select.appendChild(option);}select.value='';
 let version=0,controls=[];const show=value=>value===null||value===undefined?'未知':String(value),current=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view;
 const table=(title,headers,rows)=>{detail.appendChild(gpEl('h4',title));const t=gpEl('table'),head=gpEl('tr');for(const value of headers)head.appendChild(gpEl('th',value));t.appendChild(head);for(const row of rows){const tr=gpEl('tr');for(const value of row)tr.appendChild(gpEl('td',show(value)));t.appendChild(tr);}detail.appendChild(t);};
 const render=()=>{
  if(!current())return;const seen=++version,key=select.value;s.actionControls=s.actionControls.filter(control=>!controls.includes(control));controls=[];gpClear(detail);coverage.clear();
  const factory=unique.find(row=>row.buildingId===key);if(!factory){detail.appendChild(gpEl('p',key?'工厂身份不唯一或不属于本次来源。':'明确选择工厂后显示本次来源详情。'));return;}
  const live=()=>current()&&version===seen&&select.value===key;
  const reliable=factory.reliable===true,stock=view.stock,stockKnown=view.stockReliable===true&&Array.isArray(stock)&&stock.every(row=>typeof row?.id==='string'&&row.id&&Number.isSafeInteger(row.num)&&row.num>=0)&&new Set(stock.map(row=>row.id)).size===stock.length;
  const have=itemId=>stockKnown?(stock.find(row=>row.id===itemId)?.num??0):null;
  detail.appendChild(gpEl('h3','工厂 · '+factory.buildingId));
  table('当前工厂',['类型','等级','观察状态','自动产品','制造位上限','空闲位'],[[factory.type,factory.level,reliable?factory.status:'UNKNOWN',reliable?factory.autoProductId:null,reliable?factory.slotCapacity:null,reliable?factory.freeSlots:null]]);
  if(!reliable||!Array.isArray(factory.queue))detail.appendChild(gpEl('p','队列来源未知；不推定空闲或已完成。'));else table('本厂在产队列',['索引','产品','开始时间原值','完成时间原值','来源剩余秒数'],factory.queue.map(row=>[row.idx,row.productId,row.startTime,row.finishTime,row.remainingSeconds]));
  if(reliable&&Array.isArray(factory.finishedProducts))gpDetails(detail,'本厂已完成产品原值',factory.finishedProducts);else detail.appendChild(gpEl('p','已完成产品来源未知。'));
  const recipes=Array.isArray(factory.recipes)?factory.recipes:[];
  table('本厂配方与实际材料',['产品','解锁等级','单份成本','当前持有','缺料投影','原始秒数','委任调整秒数','时间范围'],recipes.map(recipe=>{
   const costs=Array.isArray(recipe.costs)?recipe.costs:[],projection=recipe.packCoverage;
   const gaps=costs.map(cost=>{const rows=projection?.gaps?.filter(row=>row.id===cost.id);return cost.id+' ×'+(stockKnown&&projection?.reliable===true&&Array.isArray(rows)&&rows.length<=1?show(rows[0]?.gap??0):'未知');}).join('；');
   return [recipe.productId,recipe.unlockLevel,operationCosts(recipe.costs),costs.map(cost=>cost.id+' ×'+show(have(cost.id))).join('；'),gaps||'未知',recipe.produceTime,recipe.appointmentAdjustedSeconds,recipe.timingScope];
  }));
  for(const recipe of gpProductionRecipeTargets(factory)){const button=gpEl('button','选择 '+recipe.productId+' 的覆盖建议');button.dataset.productionFactoryRecipe=recipe.productId;button.onclick=()=>{if(!button.disabled&&live())coverage.selectTarget({buildingId:key,productId:recipe.productId});};detail.appendChild(button);controls.push(button);const start=gpEl('button','准备本厂单份生产 '+recipe.productId);start.dataset.productionFactoryStart=recipe.productId;start._blocked=!reliable;start.onclick=()=>{if(start.disabled||!live()||!gpDomainSelectable(id))return;let parameters;try{parameters=gpParse('gp-'+id+'-parameters');}catch{return;}if(parameters.materialSource){$('gp-'+id+'-hint').textContent='当前含固定材料包来源；请保留组合约束，先在高级参数中明确切换为普通生产。';return;}$('gp-'+id+'-parameters').value=gpJson({buildingId:key,productId:recipe.productId});gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已固定本厂及产品；请重新探测单份成本与队列，预览后单独授权。';};detail.appendChild(start);controls.push(start);}
  for(const row of view.candidates||[]){if(row.target?.buildingId!==key)continue;const card=gpEl('article');card.appendChild(gpEl('p',(row.label||row.actionType)+' · '+operationCosts(row.costs)));if(gpBlocked(row))card.appendChild(gpEl('p','禁止执行：'+(row.blockedReason||row.reason||'缺少可靠动作')));const button=gpEl('button','选择本厂单项候选');button.dataset.productionFactoryAction=row.actionId;button._blocked=gpBlocked(row);button.onclick=()=>{if(!button.disabled&&live())gpSelectDomainCandidate(id,row.actionId);};card.appendChild(button);detail.appendChild(card);controls.push(button);}
  detail.appendChild(gpEl('p','本厂详情是本次来源观察，队列时间不证明结算或到账；缺料和减时仍为投影。选择候选或配方不派发，继续原预览、授权、预算、复读与UNKNOWN规则。'));
  s.actionControls.push(...controls);gpWatchTargetDraft(id,s,view);gpControls(id);
 };
 select.onchange=render;s.factoryViewControls.push(select);box.appendChild(gpEl('h3','独立工厂视图'));box.appendChild(select);box.appendChild(detail);detail.appendChild(gpEl('p','明确选择工厂后显示本次来源详情。'));
}

function gpPirateSweepGraph(data,payload,view,accountId){
 const canonical=v=>JSON.stringify(v,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item),same=(a,b)=>canonical(a)===canonical(b),graph=data.graph,nodes=[{id:'start',type:'START'}],uids=[];
 if(data.accountId!==accountId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||!same(data.expectedSweep,payload.expectedSweep)||!same(data.targets,payload.targets)||data.maxDurationMs!==payload.maxDurationMs||!Array.isArray(data.steps)||data.steps.length!==payload.targets.length||!same(payload.expectedSweep,view?.preparation?.expectedSweep))throw Error('扫荡账号、同日来源、明确目标或时长不匹配');
 for(const [i,target] of payload.targets.entries()){
  const source=view.targets?.filter(row=>row.uid===target.uid&&row.cityId===target.cityId),observed=source?.length===1?source[0]:null,step=data.steps[i],parameters={...target,expectedSweep:{...payload.expectedSweep,used:payload.expectedSweep.used+i}},selection={unique:true},claims={resources:[],quotas:[{id:'pirate-sweep:'+payload.expectedSweep.dayKey,num:1}],uids:[{type:'pirate',id:String(target.uid)}]};
  if(!observed||!['HIGHEST','LOWER'].includes(observed.levelRelation)||observed.levelRelation==='LOWER'&&target.allowLowerLevel!==true||!same(step?.parameters,parameters)||!same(step?.selection,selection)||!same(step?.target,observed)||!same(step?.costs,[])||!same(step?.budgetClaims,claims))throw Error('扫荡原目标、逐项低等级确认、计次或父预算变化');
  nodes.push({id:'sweep-'+i,type:'ACTION',module:'pirate-sweep',parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'pirate-sweep'});uids.push(...claims.uids);
 }
 nodes.push({id:'stop',type:'STOP'});const budget={resources:[],quotas:[{id:'pirate-sweep:'+payload.expectedSweep.dayKey,num:payload.targets.length}],uids};
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.targets.length,modules:['pirate-sweep']}))throw Error('扫荡逐项验证、有限边界或父配额不匹配');return graph;
}
function gpRenderPirateSweepBatch(box,view){
 const id='pirate-sweep',s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-'+id+'-parameters').value,expected=view?.preparation?.expectedSweep,section=gpEl('div');s.pirateSweepBatchControls=[];if(!expected||!view?.targets?.length)return;box.appendChild(section);section.appendChild(gpEl('h4','明确同日多目标逐项扫荡'));
 const live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&$('gp-'+id+'-parameters').value===source,editable=()=>live()&&gpDomainSelectable(id)&&!s.targetDraftPending&&s.data?.config?.enabled===true&&wfEditorEditable()&&Number.isSafeInteger(expected.used)&&expected.used<expected.total,control=(input,eligible=true)=>{input._pirateSweepBatchLive=()=>editable()&&eligible;input.disabled=!input._pirateSweepBatchLive();s.pirateSweepBatchControls.push(input);return input;};
 const changed=input=>{if(input.disabled||!editable())return;gpInvalidate(id,false);wfInvalidateSettingPlans();$('gp-'+id+'-hint').textContent='扫荡目标、确认或时长已编辑，旧计划和授权失效；准备时重新核同日配额及目标来源。';};
 const rows=view.targets.map(target=>{const eligible=['HIGHEST','LOWER'].includes(target.levelRelation),check=control(gpEl('input'),eligible),lower=control(gpEl('input'),eligible&&target.levelRelation==='LOWER');check.type=lower.type='checkbox';check.checked=lower.checked=false;check.dataset.pirateSweepBatchTarget=String(target.uid);lower.dataset.pirateSweepBatchLower=String(target.uid);check.onchange=()=>{if(!check.checked)lower.checked=false;changed(check);};lower.onchange=()=>changed(lower);const label=gpEl('label','UID '+target.uid+' · 城市 '+target.cityId+' · 等级 '+target.level+' · '+target.levelRelation+' ');label.appendChild(check);section.appendChild(label);if(target.levelRelation==='LOWER'){const confirm=gpEl('label','确认本目标低于已击杀最高等级 ');confirm.appendChild(lower);section.appendChild(confirm);}return {target,check,lower};});
 const chosen=()=>rows.filter(row=>row.check.checked).map(({target,lower})=>({uid:target.uid,cityId:target.cityId,...(lower.checked?{allowLowerLevel:true}:{})})),duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='';duration.setAttribute('aria-label','多目标扫荡总时长秒');duration.oninput=()=>changed(duration);duration.onchange=()=>changed(duration);section.appendChild(duration);
 const prepare=control(gpEl('button','准备原Workflow逐目标扫荡'));prepare.type='button';prepare.dataset.pirateSweepBatchPrepare='true';section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(!editable())return;const targets=chosen(),text=duration.value,seconds=Number(text);if(!targets.length||targets.length>24||targets.length>expected.total-expected.used||rows.some(row=>row.check.checked&&row.target.levelRelation==='LOWER'&&!row.lower.checked)||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-'+id+'-hint').textContent='请选择当前额度内1至24个不同目标，逐目标确认较低等级，并填写1至86400秒总时长。';return;}
  const payload={expectedSweep:expected,targets,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('pirate-sweep-batch-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(targets),config=s.data.config,editorDraft=$('wf-json').value;
  const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&duration.value===text&&JSON.stringify(chosen())===choice;
  s.plan=null;s.selected.clear();gpClear($('gp-'+id+'-plan-view'));s.pending=true;gpControls(id);
  try{const data=await operationMutation('/api/gameplay/pirate-sweep/prepare',payload,requestScope);if(!active())return;editor.accept(gpPirateSweepGraph(data,payload,view,requestScope.account));$('wf-hint').textContent='已载入明确同日逐目标扫荡图；每项新调查、单次授权及原计次验证。奖励归属仍未知。';$('gp-'+id+'-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-'+id+'-hint').textContent=error.message;}finally{if(gpGet(id)===s&&s.revision===edit){s.pending=false;gpControls(id);}}
 };section.appendChild(gpEl('p','默认不选，每个UID一次；较低等级须逐目标确认。固定游戏日、总额度、逐项计次及目标池/权益配置，逐项调查、授权并确认原独立计次后继续。拒绝、UNKNOWN或来源变化停止，不跨日、不购买次数、不首杀；计次不证明奖励到账，不将奖励加入预算。'));
}

function gpMaterialPackBatchGraph(data,payload,view,accountId){
 const canonical=v=>JSON.stringify(v,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item),same=(a,b)=>canonical(a)===canonical(b),graph=data.graph,nodes=[{id:'start',type:'START'}],totals=new Map();
 if(data.accountId!==accountId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||!same(data.targets,payload.targets)||data.maxDurationMs!==payload.maxDurationMs||!Array.isArray(data.steps)||data.steps.length!==payload.targets.length)throw Error('材料包组合账号、目标或有限边界不匹配');
 let previous=null;
 for(const [i,target] of payload.targets.entries()){
  const step=data.steps[i],pack=view?.packs?.find(row=>row.packId===target.packId),item=pack?.targets?.find(row=>row.itemId===target.itemId),num=(totals.get(target.packId)??0)+target.num;
  if(!Number.isSafeInteger(target.num)||target.num<1||target.num>2147483647||!Number.isSafeInteger(pack?.have)||num>pack.have||!Number.isSafeInteger(item?.perPack)||item.perPack<1||!Number.isSafeInteger(item.requiredSeason)||item.requiredSeason>view.season||!same(step?.parameters,target)||!same(step.costs,[{id:target.packId,num:target.num}])||step.gain!==target.num*item.perPack||!Number.isSafeInteger(step.gain)||! /^[a-f0-9]{64}$/.test(step.identity)||step.actionId!=='material-packs:'+step.identity||step.beforeState?.context?.accountId!==accountId||!same(step.beforeState?.context,step.expectedState?.context)||previous&&!same(previous,step.beforeState))throw Error('材料包原配方、累计包数或有序来源变化');
  const inventory=step.beforeState?.inventory;if(!Array.isArray(inventory)||inventory.some(row=>!row||typeof row.id!=='string'||!Number.isSafeInteger(row.num)||row.num<=0)||new Set(inventory.map(row=>row.id)).size!==inventory.length)throw Error('材料包完整库存无效');
  const stock=new Map(inventory.map(row=>[row.id,row.num]));if(i===0)for(const source of view.packs){if((stock.get(source.packId)??0)!==source.have)throw Error('材料包库存来源变化');for(const material of source.targets)if((stock.get(material.itemId)??0)!==material.have)throw Error('目标材料库存来源变化');}
  if((stock.get(target.packId)??0)<target.num)throw Error('原有包不足');stock.set(target.packId,stock.get(target.packId)-target.num);const amount=(stock.get(target.itemId)??0)+step.gain;if(!Number.isSafeInteger(amount))throw Error('累计材料溢出');stock.set(target.itemId,amount);
  const expected={context:step.beforeState.context,inventory:[...stock].filter(([,num])=>num>0).sort(([a],[b])=>a.localeCompare(b)).map(([id,num])=>({id,num}))};if(!same(step.expectedState,expected))throw Error('逐项精确扣包得料不匹配');previous=expected;totals.set(target.packId,num);
  nodes.push({id:'exchange-'+i,type:'ACTION',module:'material-packs',parameters:target,selection:step.actionId},{id:'verify-'+i,type:'VERIFY',module:'material-packs'});
 }
 nodes.push({id:'stop',type:'STOP'});const budget={resources:[...totals].map(([id,num])=>({id,num})),quotas:[],uids:[]};
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.targets.length,modules:['material-packs']}))throw Error('材料包逐项验证图或父预算不匹配');return graph;
}
function gpRenderMaterialPackBatch(box,view){
 const id='material-packs',s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-'+id+'-parameters').value,section=gpEl('div');s.materialPackBatchControls=[];if(!view?.packs?.length)return;box.appendChild(section);section.appendChild(gpEl('h4','明确自有材料包组合兑换'));
 const live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&$('gp-'+id+'-parameters').value===source,editable=()=>live()&&gpDomainSelectable(id)&&!s.targetDraftPending&&s.data?.config?.enabled===true&&wfEditorEditable(),control=(input,eligible=true)=>{input._materialPackBatchLive=()=>editable()&&eligible;input.disabled=!input._materialPackBatchLive();s.materialPackBatchControls.push(input);return input;};
 const changed=input=>{if(input.disabled||!editable())return;gpInvalidate(id,false);wfInvalidateSettingPlans();$('gp-'+id+'-hint').textContent='材料及包数已编辑，旧计划和授权失效；准备时重新调查完整库存。';};
 const rows=view.packs.flatMap(pack=>pack.targets.map(item=>{const eligible=Number.isSafeInteger(pack.have)&&pack.have>0&&Number.isSafeInteger(item.perPack)&&item.perPack>0&&Number.isSafeInteger(item.requiredSeason)&&item.requiredSeason<=view.season,check=control(gpEl('input'),eligible),num=control(gpEl('input'),eligible);check.type='checkbox';check.checked=false;check.dataset.materialPackBatchTarget=pack.packId+':'+item.itemId;num.type='number';num.min='1';num.max='2147483647';num.step='1';num.value='';num.setAttribute('aria-label',pack.packId+'兑换'+item.itemId+'包数');check.onchange=()=>changed(check);num.oninput=()=>changed(num);num.onchange=()=>changed(num);const label=gpEl('label',pack.packId+' → '+item.itemId+' · 每包 '+(item.perPack??'未知')+' · 持有包 '+(pack.have??'未知')+' ');label.appendChild(check);label.appendChild(num);section.appendChild(label);return {pack,item,check,num};}));
 const chosen=()=>rows.filter(row=>row.check.checked).map(row=>({packId:row.pack.packId,itemId:row.item.itemId,num:Number(row.num.value)})),duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='';duration.setAttribute('aria-label','组合兑换总时长秒');duration.oninput=()=>changed(duration);duration.onchange=()=>changed(duration);section.appendChild(duration);
 const prepare=control(gpEl('button','准备原Workflow逐项兑换'));prepare.type='button';prepare.dataset.materialPackBatchPrepare='true';section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(!editable())return;const targets=chosen(),text=duration.value,seconds=Number(text),totals=new Map();if(!targets.length||targets.length>13||targets.some(p=>!Number.isSafeInteger(p.num)||p.num<1||p.num>2147483647)||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-'+id+'-hint').textContent='请明确勾选材料、正整数包数及1至86400秒总时长。';return;}
  for(const p of targets){const n=(totals.get(p.packId)??0)+p.num;if(!Number.isSafeInteger(n)||n>view.packs.find(row=>row.packId===p.packId).have){$('gp-'+id+'-hint').textContent='同一种包的累计消耗超过本次观察持有量。';return;}totals.set(p.packId,n);}
  const payload={targets,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('material-packs-batch-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(targets),config=s.data.config,editorDraft=$('wf-json').value;
  const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&duration.value===text&&JSON.stringify(chosen())===choice;
  s.plan=null;s.selected.clear();gpClear($('gp-'+id+'-plan-view'));s.pending=true;gpControls(id);
  try{const data=await operationMutation('/api/gameplay/material-packs/prepare',payload,requestScope);if(!active())return;editor.accept(gpMaterialPackBatchGraph(data,payload,view,requestScope.account));$('wf-hint').textContent='已载入明确材料包逐项兑换图；每项重新调查、单次授权及完整库存验证。';$('gp-'+id+'-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-'+id+'-hint').textContent=error.message;}finally{if(gpGet(id)===s&&s.revision===edit){s.pending=false;gpControls(id);}}
 };section.appendChild(gpEl('p','默认不选，包数和总时长须明确填写。同种包累计预留初始库存；每项固定原有序报价，逐项重新调查并单次授权，完整库存精确扣包得料后继续。变化、拒绝或UNKNOWN停止，不补购、不排产、不以预计所得扩预算。'));
}

function gpMaterialProductionGraph(data,payload,view,accountId){
 const canonical=v=>JSON.stringify(v,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item),same=(a,b)=>canonical(a)===canonical(b),multi=Array.isArray(payload.exchanges),choices=multi?payload.exchanges:[{packId:payload.packId,itemId:payload.itemId,num:payload.num}],exchanges=multi?data.exchanges:[data.exchange],graph=data.graph,source=graph?.nodes?.[2*choices.length+1]?.parameters?.materialSource,costs=data.costs,totals=new Map(),packTotals=new Map();
 if(data.accountId!==accountId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||!same(data.source,payload)||!choices.length||choices.length>23||multi&&choices.length<2||!Array.isArray(exchanges)||exchanges.length!==choices.length||!Array.isArray(costs)||!costs.length||costs.length>100||costs.some(row=>!row||Object.keys(row).some(k=>!['id','num'].includes(k))||typeof row.id!=='string'||!row.id||row.id==='RUBY'||!Number.isSafeInteger(row.num)||row.num<=0)||new Set(costs.map(row=>row.id)).size!==costs.length||!source||Object.keys(source).length!==(multi?3:2)||!/^[a-f0-9]{64}$/.test(source.productionIdentity))throw Error('返回的账号、明确材料包来源、工厂、配方或成本不匹配');
 const nodes=[{id:'start',type:'START'}],identities=[];
 for(let i=0;i<choices.length;i++){
  const choice=choices[i],exchange=exchanges[i],pack=view?.packs?.find(row=>row.packId===choice.packId),target=pack?.targets?.find(row=>row.itemId===choice.itemId),num=(packTotals.get(choice.packId)||0)+choice.num;
  if(!Number.isSafeInteger(choice.num)||choice.num<1||choice.num>2147483647||!Number.isSafeInteger(num)||!Number.isSafeInteger(pack?.have)||pack.have<num||!Number.isSafeInteger(target?.perPack)||target.perPack<=0||!Number.isSafeInteger(target.requiredSeason)||target.requiredSeason>view.season||!Number.isSafeInteger(exchange?.gain)||exchange.gain!==target.perPack*choice.num||typeof exchange.actionId!=='string'||!/^material-packs:[a-f0-9]{64}$/.test(exchange.actionId)||!same(exchange.costs,[{id:choice.packId,num:choice.num}])||!costs.some(row=>row.id===choice.itemId))throw Error('返回的有序兑换、合计持有包、目标材料或所得不匹配');
  packTotals.set(choice.packId,num);totals.set(choice.packId,num);identities.push(exchange.actionId.slice(15));
  const suffix=multi?'-'+i:'';nodes.push({id:'exchange'+suffix,type:'ACTION',module:'material-packs',parameters:choice,selection:exchange.actionId},{id:'verify-exchange'+suffix,type:'VERIFY',module:'material-packs'});
 }
 if(source.exchangeIdentity!==identities.at(-1)||multi&&(!same(source.exchangeIdentities,identities)||new Set(identities).size!==identities.length))throw Error('返回的有序兑换历史摘要不匹配');
 for(const row of costs){const n=(totals.get(row.id)||0)+row.num;if(!Number.isSafeInteger(n))throw Error('累计支出溢出');totals.set(row.id,n);}const budget={resources:[...totals].map(([id,num])=>({id,num})),quotas:[],uids:[]};
 nodes.push({id:'produce',type:'ACTION',module:'production',parameters:{buildingId:payload.buildingId,productId:payload.productId,materialSource:source},selection:{unique:true}},{id:'verify-produce',type:'VERIFY',module:'production'},{id:'stop',type:'STOP'});
 if(graph?.version!==1||typeof graph.id!=='string'||!graph.id||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:choices.length+1,modules:['material-packs','production']}))throw Error('返回的有限兑换生产链或父预算不匹配');return graph;
}
function gpFreeGoldGraph(data,payload,accountId){
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item),same=(a,b)=>canonical(a)===canonical(b),graph=data.graph;
 if(data.accountId!==accountId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||!same(data.expectedGold,payload.expectedGold)||data.count!==payload.count||data.maxDurationMs!==payload.maxDurationMs)throw Error('免费点金组合账号、原计次状态或次数不匹配');
 const nodes=[{id:'start',type:'START'}],uids=[];
 for(let i=0;i<payload.count;i++){const slot=payload.expectedGold.freeTimes+i+1;nodes.push({id:'claim-'+slot,type:'ACTION',module:'free-gold',parameters:{expectedGold:{...payload.expectedGold,freeTimes:slot-1}},selection:{unique:true}},{id:'verify-'+slot,type:'VERIFY',module:'free-gold'});uids.push({type:'free-gold',id:payload.expectedGold.resetTime+':'+slot});}
 nodes.push({id:'stop',type:'STOP'});const budget={resources:[],quotas:[{id:'free-gold:reset:'+payload.expectedGold.resetTime,num:payload.count}],uids};
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.count,modules:['free-gold']}))throw Error('免费点金组合顺序、固定周期额度或原UID预算不匹配');return graph;
}
function gpAfkUpgradeGraph(data,payload,view,accountId){
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item),same=(a,b)=>canonical(a)===canonical(b),source={level:payload.level,afkStartTime:payload.afkStartTime,afkFinishTime:payload.afkFinishTime},quote=view?.upgradePreparation?.options?.find(row=>row.levels===payload.levels),graph=data.graph;
 if(data.accountId!==accountId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||view?.upgradePreparation?.reliable!==true||!same(source,{level:view?.afk?.level,afkStartTime:view?.afk?.afkStartTime,afkFinishTime:view?.afk?.afkFinishTime})||!same(data.source,source)||data.levels!==payload.levels||!quote||quote.blockedReason!==null||quote.targetLevel!==payload.level+payload.levels||data.targetLevel!==quote.targetLevel||data.mainlineStage!==view.upgradePreparation.mainlineStage||!same(data.costs,quote.costs)||!Array.isArray(data.costs)||data.costs.length!==1||data.costs[0].id!=='挂机徽章'||!Number.isSafeInteger(data.costs[0].num)||data.costs[0].num<=0)throw Error('返回的账号、原收益来源、升级增量、主线或成本不匹配');
 const income={action:'income',...source,upgradePreparation:{levels:payload.levels,expectedCost:data.costs[0].num}},incomeFrom={afkStartTime:payload.afkStartTime,afkFinishTime:payload.afkFinishTime},upgrade={action:'upgrade',level:payload.level,levels:payload.levels,incomeFrom,expectedUpgradeCost:data.costs[0].num},module='afk-level-rewards',nodes=[{id:'start',type:'START'},{id:'income',type:'ACTION',module,parameters:income,selection:{unique:true}},{id:'verify-income',type:'VERIFY',module},{id:'upgrade',type:'ACTION',module,parameters:upgrade,selection:{unique:true}},{id:'verify-upgrade',type:'VERIFY',module},{id:'stop',type:'STOP'}],budget={resources:data.costs,quotas:[],uids:[{type:'afk-income-interval',id:source.level+':'+source.afkStartTime+':'+source.afkFinishTime},{type:'afk-upgrade',id:source.level+':income:'+source.afkStartTime+':'+source.afkFinishTime+':'+payload.levels}]};
 if(graph?.version!==1||typeof graph.id!=='string'||!graph.id||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:2,modules:[module]}))throw Error('返回的收益确认→升级顺序、固定成本或父预算不匹配');return graph;
}
function gpForgeGraph(data,payload,view,accountId){
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item),same=(a,b)=>canonical(a)===canonical(b),graph=data.graph,observed=view?.preparation,forge=view?.forges?.find(row=>row.buildingId===payload.buildingId);
 if(data.accountId!==accountId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||data.buildingId!==payload.buildingId||!same(data.makeIds,payload.makeIds)||observed?.reliable!==true||!same(data.counts,observed.counts)||!same(data.order,observed.order)||!forge?.queue)throw Error('返回的账号、部位数量或装备厂不匹配，请重新探测');
 const {state,...queue}=forge.queue;if(!same(data.queue,queue)||!['IDLE','MAKING'].includes(state))throw Error('返回的原队列不匹配');
 const recipes=payload.makeIds.map(makeId=>observed.recipes?.find(row=>row.makeId===makeId));
 if(recipes.some(row=>row?.qualityReliable!==true))throw Error('明确允许配方缺少品质依据');
 recipes.sort((a,b)=>data.order.indexOf(a.type)-data.order.indexOf(b.type)||b.qualityIndex-a.qualityIndex||a.makeId-b.makeId);
 const allowedReasons=[null,'RECIPE_SEASON_UNAVAILABLE','MATERIAL_STOCK_INSUFFICIENT','D6_FORBIDDEN','PAID_NOT_ALLOWED','COST_NOT_ALLOWED'];
 if(!Array.isArray(data.candidates)||data.candidates.length!==recipes.length||data.candidates.some((row,i)=>{const {blockedReason,...recipe}=row;return !allowedReasons.includes(blockedReason)||!same(recipe,recipes[i]);}))throw Error('返回的配方范围或排序不匹配');
 const selected=data.candidates.find(row=>row.blockedReason===null);
 if(!selected||!same(selected,data.selected)||selected.season>view.season)throw Error('返回的选中配方不匹配');
 const guards={expectedEquipmentCounts:data.counts},nodes=[{id:'start',type:'START'}];
 if(state==='MAKING')nodes.push({id:'pick',type:'ACTION',module:'equipment-forge',parameters:{buildingId:payload.buildingId,action:'pick',...guards,expectedQueue:queue},selection:{unique:true}},{id:'verify-pick',type:'VERIFY',module:'equipment-forge'});
 nodes.push({id:'make',type:'ACTION',module:'equipment-forge',parameters:{buildingId:payload.buildingId,action:'make',makeId:selected.makeId,allowUniversal:false,...guards,expectedQueue:{makeId:0,finishTime:0,equipId:'',star:0}},selection:{unique:true}},{id:'verify-make',type:'VERIFY',module:'equipment-forge'},{id:'stop',type:'STOP'});
 if(graph?.version!==1||typeof graph.id!=='string'||!graph.id||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:state==='MAKING'?2:1,modules:['equipment-forge']})||!same(graph.budget,{resources:selected.costs,quotas:[],uids:[]}))throw Error('返回的单次执行链或累计预算不匹配');
 return graph;
}
function gpHeroStarGraph(data,payload,view,accountId){
 const multiple=Array.isArray(payload.targets),declared=multiple?payload.targets:[{heroId:payload.heroId,num:payload.num}],rows=multiple?data.targets:[data],graph=data.graph;
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item),same=(a,b)=>canonical(a)===canonical(b);
 if(data.accountId!==accountId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||!Array.isArray(rows)||rows.length!==declared.length)throw Error('返回的账号或英雄顺序不匹配');
 const nodes=[{id:'start',type:'START'}],amounts=new Map(),uids=[],targetIds=new Set(declared.map(row=>row.heroId+'碎片'));
 const add=(id,num)=>{const sum=(amounts.get(id)||0)+num;if(!Number.isSafeInteger(sum))throw Error('累计预算不可靠');amounts.set(id,sum);};
 for(const [index,request]of declared.entries()){
  const row=rows[index],heroId=request.heroId,num=request.num,from=row?.fromStar,owned=row?.ownedFragments,cost=row?.starCost,ending=multiple?'-'+index:'';
  if(row?.heroId!==heroId||row.exchangeNum!==num||!Number.isInteger(from)||from<0||from>=2147483647||row.toStar!==from+1||!Number.isSafeInteger(owned)||owned<0||!Number.isInteger(cost)||cost<1||cost>2147483647||num!==Math.max(0,cost-owned)||!multiple&&num===0)throw Error('返回的英雄、数量、星级或缺口不匹配');
  const guard={expectedStar:from,expectedFragmentBalance:owned,expectedStarCost:cost};
  if(num>0){const source=view?.fragments?.find(item=>item.heroId===heroId)?.sourceId;if(typeof source!=='string'||targetIds.has(source))throw Error('万能来源缺失或与目标冲突');add(source,num);uids.push({type:'hero-fragment-exchange',id:heroId});nodes.push({id:'exchange'+ending,type:'ACTION',module:'heroes',parameters:{heroId,action:'fragment-exchange',num,...guard},selection:{unique:true}},{id:'verify-exchange'+ending,type:'VERIFY',module:'heroes'});}
  add(heroId+'碎片',cost);nodes.push({id:'star'+ending,type:'ACTION',module:'heroes',parameters:{heroId,action:'star',allowUniversal:false,...guard,expectedFragmentBalance:owned+num},selection:{unique:true}},{id:'verify-star'+ending,type:'VERIFY',module:'heroes'});
 }
 nodes.push({id:'stop',type:'STOP'});
 const resources=graph?.budget?.resources;
 if(!same(graph?.nodes,nodes)||!same(graph?.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(graph?.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:nodes.filter(node=>node.type==='ACTION').length,modules:['heroes']})||!Array.isArray(resources)||resources.length!==amounts.size||new Set(resources.map(row=>row.id)).size!==amounts.size||resources.some(row=>!amounts.has(row?.id)||!same(row,{id:row.id,num:amounts.get(row.id)}))||!same(graph.budget.quotas,[])||!same(graph.budget.uids,uids))throw Error('返回的累计预算或执行链不匹配');
 return graph;
}
const GP_OPEN_RANK_LABELS={'open-rank-order':'开服订单','open-rank-stage':'开服闯关','open-rank-pirate':'开服剿匪','open-rank-war':'开服战争'};
function gpEquipmentTargetSources(view){
 const dense=value=>Array.isArray(value)&&value.length<=10000&&Object.keys(value).length===value.length&&Array.from({length:value.length},(_,index)=>Object.hasOwn(value,index)).every(Boolean);
 const text=value=>typeof value==='string'&&value.length>0&&value.length<=200&&value.trim()===value&&!/[\u0000-\u001f\u007f]/.test(value);
 const exactUid=value=>typeof value==='string'&&/^[1-9][0-9]{0,18}$/.test(value)&&BigInt(value)<(1n<<63n);
 const heroes=dense(view?.heroes)&&view.heroes.every(row=>text(row?.heroId))&&new Set(view.heroes.map(row=>row.heroId)).size===view.heroes.length?view.heroes:null;
 const choices=(heroId,action)=>{const target=heroes?.find(row=>row.heroId===heroId),rows=action==='put-on'?view?.bag:target?.equips;return target&&dense(rows)&&rows.every(row=>exactUid(row?.uid))&&new Set(rows.map(row=>row.uid)).size===rows.length?rows:null;};
 return {heroes,choices,text};
}
function gpRenderEquipmentTarget(box,view){
 const id='equipment-growth',state=gpGet(id),scope=viewGuard.capture(),revision=gpRevision;
 const {heroes,choices:observedChoices,text}=gpEquipmentTargetSources(view);
 let parameters;try{parameters=gpParse('gp-'+id+'-parameters');if(!parameters||typeof parameters!=='object'||Array.isArray(parameters)||Object.keys(parameters).some(key=>!['heroId','uid','action'].includes(key))||parameters.action!==undefined&&!['initial-level','refine','put-on','star','take-off'].includes(parameters.action))throw Error('unknown parameters');}catch{box.appendChild(gpEl('p','目标参数格式未知；请保留并在高级参数中修正，再重新探测。'));return;}
 box.appendChild(gpEl('h4','明确装备目标'));
 const mode=gpEl('select'),hero=gpEl('select'),equipment=gpEl('select'),apply=gpEl('button','使用所选目标准备调查');
 mode.dataset.equipmentTargetMode='true';hero.dataset.equipmentTargetHero='true';equipment.dataset.equipmentTargetUid='true';apply.dataset.equipmentTargetPrepare='true';
 const add=(select,value,label)=>{const option=gpEl('option',label);option.value=value;select.appendChild(option);};
 for(const [value,label]of [['level','单次等级'],['initial-level','首次升级（0→1）'],['refine','红装单次精炼'],['star','红装单次升星'],['put-on','自有闲置装备穿到空槽'],['take-off','卸下已佩戴装备回闲置池']])add(mode,value,label);
 mode.value=parameters.action||'level';add(hero,'','请选择明确英雄');for(const row of heroes||[])add(hero,row.heroId,row.heroId);hero.value='';
 const wrap=(label,control)=>{const node=gpEl('label',label);node.appendChild(control);box.appendChild(node);};wrap('原动作种类',mode);wrap('目标英雄',hero);wrap('精确装备 UID',equipment);box.appendChild(apply);
 box.appendChild(gpEl('p','只使用本次观察到的英雄和装备；UID保持十进制文本。装备留空仅调查该英雄候选，不自动选择或执行。空槽穿戴仅从闲置列表选择；卸下仅从所选英雄的已佩戴列表选择并回闲置池，已有装备替换继续冻结；点击只更新草稿，之后仍需重新探测、预览和授权。'));
 for(const control of [mode,hero,equipment,apply]){control._blocked=false;state.actionControls.push(control);}
 let equipmentKnown=false,choices=[];
 const live=()=>gpDomainSelectable(id)&&gpSafe(scope,revision)&&gpGet(id).data?.view===view;
 const redraw=()=>{
  gpClear(equipment);add(equipment,'','仅调查所选英雄候选');equipment.value='';const rows=observedChoices(hero.value,mode.value);
  equipmentKnown=rows!==null;choices=rows||[];
  for(const row of choices)add(equipment,row.uid,(text(row.equipId)?row.equipId:'装备名未知')+' · UID '+row.uid);
  equipment._blocked=!equipmentKnown;apply._blocked=!equipmentKnown;gpControls(id);
 };
 mode.onchange=hero.onchange=()=>{if(!live())return;redraw();};
 apply.onclick=()=>{
  if(apply.disabled||!live()||!equipmentKnown||!heroes.some(row=>row.heroId===hero.value)||!['level','initial-level','refine','star','put-on','take-off'].includes(mode.value)||equipment.value&&!choices.some(row=>row.uid===equipment.value))return;
  const next={heroId:hero.value,...(equipment.value?{uid:equipment.value}:{}),...(mode.value!=='level'?{action:mode.value}:{})};$('gp-'+id+'-parameters').value=gpJson(next);gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已准备明确英雄及装备目标；请重新探测归属、空槽与成本，再预览并单独授权。';
 };
 mode._blocked=hero._blocked=heroes===null;redraw();
}

function gpTaskRewardUsesTier(kind){return kind==='daily-activity'||Object.hasOwn(GP_OPEN_RANK_LABELS,kind);}
function gpTaskTargetIds(view,kind,parameters){
 const selection=view?.targetSelection;
 if(kind===parameters?.kind&&selection?.kind===kind&&selection.readOnly===true&&['OBSERVED_DEFINITIONS','OBSERVED_TASKS'].includes(selection.status)&&Array.isArray(selection.targets)){
  const ids=selection.targets.map(row=>row?.id);return ids.length&&ids.every(id=>Number.isInteger(id)&&id>0&&id<=2147483647)&&new Set(ids).size===ids.length?ids:null;
 }
 const rows=kind==='main'?(view?.tasks?.main?[view.tasks.main]:null):kind==='branch'?view?.tasks?.branch:kind==='achievement'?view?.tasks?.achievements:kind==='daily'&&['daily','daily-activity'].includes(parameters?.kind)?view?.daily?.tasks:null;
 return Array.isArray(rows)&&rows.every(row=>Number.isInteger(row?.taskId)&&row.taskId>0&&row.taskId<=2147483647)&&new Set(rows.map(row=>row.taskId)).size===rows.length?rows.map(row=>row.taskId):null;
}
function gpRenderTaskRewardTarget(box,view){
 const id='task-rewards',state=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,edit=state.revision,source=$('gp-'+id+'-parameters').value;
 let parameters;try{parameters=gpParse('gp-'+id+'-parameters');if(Object.keys(parameters).some(key=>!['kind','taskId','tierId','packId','round','expectedResetTime'].includes(key))||parameters.kind!==undefined&&!WF_TASK_REWARD_KINDS.includes(parameters.kind))throw Error('unknown parameters');}catch{box.appendChild(gpEl('p','目标参数格式未知；请先在高级参数中修正，再重新探测。'));return;}
 const kind=gpEl('select'),target=gpEl('input'),round=gpEl('input'),choose=gpEl('button','准备明确任务目标');
 kind.dataset.dailyRewardKind='true';target.dataset.dailyRewardId='true';round.dataset.chipTaskRound='true';choose.dataset.dailyRewardPrepare='true';
 for(const value of WF_TASK_REWARD_KINDS){const option=gpEl('option',WF_UNIFIED_KINDS[value]||value);option.value=value;kind.appendChild(option);}
 kind.value=parameters.kind||'daily';
 for(const input of [target,round]){input.type='text';input.inputMode='numeric';input.value='';}
 target.value=parameters.taskId!==undefined?String(parameters.taskId):parameters.tierId!==undefined?String(parameters.tierId):'';round.value=parameters.round===undefined?'':String(parameters.round);
 const label=gpEl('label'),caption=gpEl('span'),roundLabel=gpEl('label','周芯片当前轮次');label.appendChild(caption);label.appendChild(target);roundLabel.appendChild(round);box.appendChild(kind);box.appendChild(label);box.appendChild(roundLabel);box.appendChild(choose);
 const observedTarget=gpEl('select');observedTarget.dataset.dailyRewardObservedTarget='true';box.appendChild(observedTarget);
 const observedIds=()=>gpTaskTargetIds(view,kind.value,parameters);
 for(const control of [kind,target,round,choose,observedTarget])state.actionControls.push(control);
 const live=()=>gpDomainSelectable(id)&&gpSafe(scope,revision)&&gpGet(id)===state&&state.data?.view===view&&state.revision===edit&&$('gp-'+id+'-parameters').value===source;
 const gift=()=>['daily-gift','weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift'].includes(kind.value),tier=()=>gpTaskRewardUsesTier(kind.value);
 const redraw=()=>{const ids=observedIds();gpClear(observedTarget);const blank=gpEl('option',ids===null?'本次来源未观察此种任务；可明确填写ID后调查':'请选择本次已观察的同类任务ID');blank.value='';observedTarget.appendChild(blank);for(const id of ids||[]){const option=gpEl('option',String(id));option.value=String(id);observedTarget.appendChild(option);}observedTarget.value='';observedTarget._blocked=!ids?.length;target._blocked=gift();round._blocked=kind.value!=='weekly-chip-task';caption.textContent=gift()?'固定免费礼包（无需ID）':tier()?'精确score档位 / 活跃档位ID':'精确任务ID';choose.textContent=kind.value==='weekly-battle-pass-task'?'准备战令只读观察':'准备明确任务目标';gpControls(id);};
 kind.onchange=()=>{if(!live())return;target.value='';round.value='';redraw();};
 observedTarget.onchange=()=>{if(observedTarget.disabled||!live())return;const id=observedIds()?.find(id=>String(id)===observedTarget.value);if(id!==undefined){target.value=String(id);const selection=view?.targetSelection;if(kind.value==='weekly-chip-task'&&selection?.kind===kind.value&&Number.isInteger(selection.round)&&selection.round>0&&selection.round<=2147483647)round.value=String(selection.round);}};
 const positive=value=>/^[1-9][0-9]*$/.test(value)&&Number.isInteger(Number(value))&&Number(value)<=2147483647;
 choose.onclick=()=>{
  if(choose.disabled||!live()||!WF_TASK_REWARD_KINDS.includes(kind.value))return;
  if(!gift()&&!positive(target.value)||kind.value==='weekly-chip-task'&&!positive(round.value)){$('gp-'+id+'-hint').textContent='请填写明确的正int32任务/档位ID；周芯片还须当前轮次。';return;}
  const next={kind:kind.value};if(gift())next.packId=kind.value==='daily-gift'?'赠礼':'1000';else next[tier()?'tierId':'taskId']=Number(target.value);if(kind.value==='weekly-chip-task')next.round=Number(round.value);if(['daily','daily-activity'].includes(kind.value)&&parameters.expectedResetTime!==undefined)next.expectedResetTime=parameters.expectedResetTime;
  $('gp-'+id+'-parameters').value=gpJson(next);gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);
  $('gp-'+id+'-hint').textContent=kind.value==='weekly-battle-pass-task'?'已准备明确战令任务，只读观察不会生成领取动作。':'已准备明确任务身份；请重新探测完成状态与可领取资格，预览后单独授权。';
 };
 box.appendChild(gpEl('p','任务列表仅复用本次原解析结果，不新增查询，不表示可领取；未知种类和周期不跨接来源。主线、支线、成就及日常身份分别保留；完成、可领取与奖励到账独立判断。开服任务填写score档位，周芯片还须当前轮次；固定礼包不接受任务ID，战令仅观察。准备不发送请求、不授权。'));
 redraw();
}
function gpBadgeTargetSources(view){
 const dense=value=>Array.isArray(value)&&value.length<=10000&&Object.keys(value).length===value.length&&Array.from({length:value.length},(_,i)=>Object.hasOwn(value,i)).every(Boolean);
 const uid=value=>typeof value==='string'&&/^[1-9][0-9]{0,18}$/.test(value)&&BigInt(value)<(1n<<63n);
 const heroes=dense(view?.heroes)&&view.heroes.every(row=>typeof row?.heroId==='string'&&row.heroId.length>0)&&new Set(view.heroes.map(row=>row.heroId)).size===view.heroes.length?view.heroes:null;
 const choices=(heroId,action)=>{const selected=heroes?.find(row=>row.heroId===heroId),put=action==='put-on',rows=put?view?.bag:selected?.badges,known=Boolean(selected&&dense(rows)&&rows.every(row=>uid(row?.uid))&&new Set(rows.map(row=>row.uid)).size===rows.length);const slots=put&&selected&&dense(selected.emptySlots)&&selected.emptySlots.every(pos=>Number.isInteger(pos)&&pos>=1&&pos<=4)&&new Set(selected.emptySlots).size===selected.emptySlots.length?selected.emptySlots:[];return {known,rows:known?rows:[],slots};};
 return {heroes,choices};
}
function gpRenderBadgeTarget(box,view){
 const id='badge-growth',state=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,edit=state.revision,source=$('gp-'+id+'-parameters').value;
 const {heroes,choices:observedChoices}=gpBadgeTargetSources(view);
 let parameters;try{parameters=gpParse('gp-'+id+'-parameters');if(Object.keys(parameters).some(key=>!['heroId','uid','action','pos'].includes(key))||parameters.action!==undefined&&!['put-on','star'].includes(parameters.action))throw Error('unknown parameters');}catch{box.appendChild(gpEl('p','徽章目标格式未知；请先在高级参数中修正，再重新探测。'));return;}
 const mode=gpEl('select'),hero=gpEl('select'),badge=gpEl('select'),slot=gpEl('select'),prepare=gpEl('button','准备徽章目标');
 mode.dataset.badgeTargetMode='true';hero.dataset.badgeTargetHero='true';badge.dataset.badgeTargetUid='true';slot.dataset.badgeTargetSlot='true';prepare.dataset.badgeTargetPrepare='true';
 const add=(select,value,text)=>{const option=gpEl('option',text);option.value=value;select.appendChild(option);};
 for(const [value,text]of [['level','已佩戴单次升级'],['star','已佩戴红徽章单次升星'],['put-on','自有闲置徽章穿到空槽']])add(mode,value,text);mode.value=parameters.action||'level';
 add(hero,'','请选择英雄');for(const row of heroes||[])add(hero,row.heroId,row.heroId);hero.value='';
 for(const [text,control]of [['原动作种类',mode],['明确英雄',hero],['精确徽章UID',badge],['已解锁空槽',slot]]){const label=gpEl('label',text);label.appendChild(control);box.appendChild(label);}box.appendChild(prepare);
 for(const control of [mode,hero,badge,slot,prepare])state.actionControls.push(control);
 let choices=[],slots=[];
 const live=()=>gpDomainSelectable(id)&&gpSafe(scope,revision)&&gpGet(id)===state&&state.data?.view===view&&state.revision===edit&&$('gp-'+id+'-parameters').value===source;
 const redraw=()=>{
  gpClear(badge);gpClear(slot);add(badge,'','仅调查该英雄候选');add(slot,'','先调查该英雄的空槽');badge.value=slot.value='';
  const selected=heroes?.find(row=>row.heroId===hero.value),put=mode.value==='put-on',observed=observedChoices(hero.value,mode.value),known=observed.known;
  choices=observed.rows;for(const row of choices)add(badge,row.uid,(row.badgeId||'徽章')+' · UID '+row.uid);
  slots=observed.slots;
  for(const pos of slots)add(slot,String(pos),String(pos)+' 号空槽');
  mode._blocked=hero._blocked=heroes===null;badge._blocked=!known;slot._blocked=!put||slots.length===0;prepare._blocked=!selected;gpControls(id);
 };
 mode.onchange=hero.onchange=()=>{if(live())redraw();};
 prepare.onclick=()=>{
  if(prepare.disabled||!live()||!heroes?.some(row=>row.heroId===hero.value)||!['level','star','put-on'].includes(mode.value)||badge.value&&!choices.some(row=>row.uid===badge.value)||slot.value&&!slots.includes(Number(slot.value)))return;
  if(mode.value==='put-on'&&badge.value&&!slot.value){$('gp-'+id+'-hint').textContent='穿戴具体徽章还须选择本次已观察到的已解锁空槽。';return;}
  const next={heroId:hero.value,...(mode.value!=='level'?{action:mode.value}:{}),...(badge.value?{uid:badge.value}:{}),...(mode.value==='put-on'&&slot.value?{pos:Number(slot.value)}:{})};
  $('gp-'+id+'-parameters').value=gpJson(next);gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已准备徽章目标；请重新探测归属、空槽与成本，预览后单独授权。';
 };
 box.appendChild(gpEl('p','成长仅从该英雄已佩戴列表选择；穿戴仅从闲置列表和当前已解锁空槽选择。切换英雄或动作清除UID及槽位；未观察空槽时先只调查英雄，不替换已有徽章。'));
 redraw();
}

function gpHeroTargetSources(view){
 const rows=view?.reliability?.heroes===true&&Array.isArray(view.heroes)&&view.heroes.every(row=>typeof row?.heroId==='string'&&row.heroId.length>0)&&new Set(view.heroes.map(row=>row.heroId)).size===view.heroes.length?view.heroes:null;
 const slots=heroId=>{const selected=rows?.find(row=>row.heroId===heroId),levels=selected?.skillLevels;return Array.isArray(levels)&&levels.length>0&&levels.length<=4&&levels.every(n=>Number.isInteger(n)&&n>=0)?levels.map((level,index)=>({index:index+1,level})):[];};
 return {rows,slots};
}
function gpRenderHeroTarget(box,view){
 const id='heroes',state=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,edit=state.revision,source=$('gp-'+id+'-parameters').value;
 let parameters;try{parameters=gpParse('gp-'+id+'-parameters');if(Object.keys(parameters).some(key=>!['heroId','action','skillIdx','allowUniversal'].includes(key))||parameters.allowUniversal===true)throw Error('guarded or exchange parameters');}catch{box.appendChild(gpEl('p','当前为兑换、前置约束或高级成长草稿；此目标表单保留原参数，请使用下方专用入口或先明确切换成长种类。'));return;}
 const {rows,slots:observedSlots}=gpHeroTargetSources(view);
 const mode=gpEl('select'),hero=gpEl('select'),skill=gpEl('select'),prepare=gpEl('button','准备英雄单次成长目标');mode.dataset.heroTargetMode='true';hero.dataset.heroTargetHero='true';skill.dataset.heroTargetSkill='true';prepare.dataset.heroTargetPrepare='true';
 const add=(select,value,text)=>{const option=gpEl('option',text);option.value=value;select.appendChild(option);};
 for(const [value,text]of [['level','升一级'],['star','升一星（自有专属碎片）'],['skill','技能槽升一级'],['exclusive-level','专武升一级'],['exclusive-star','专武升一星']])add(mode,value,text);mode.value=['level','star','skill','exclusive-level','exclusive-star'].includes(parameters.action)?parameters.action:'level';
 add(hero,'','请选择已观察英雄');for(const row of rows||[])add(hero,row.heroId,row.heroId);hero.value='';
 for(const [text,control]of [['成长种类',mode],['明确英雄',hero],['技能槽（从1开始）',skill]]){const label=gpEl('label',text);label.appendChild(control);box.appendChild(label);}box.appendChild(prepare);
 for(const control of [mode,hero,skill,prepare])state.actionControls.push(control);
 let slots=[];const live=()=>gpDomainSelectable(id)&&gpSafe(scope,revision)&&gpGet(id)===state&&state.data?.view===view&&state.revision===edit&&$('gp-'+id+'-parameters').value===source;
 const redraw=()=>{gpClear(skill);add(skill,'','请选择技能槽');skill.value='';const selected=rows?.find(row=>row.heroId===hero.value);slots=observedSlots(hero.value);for(const row of slots)add(skill,String(row.index),row.index+' 号 · 当前 '+row.level);skill._blocked=mode.value!=='skill'||!slots.length;mode._blocked=hero._blocked=rows===null;prepare._blocked=!selected;gpControls(id);};
 mode.onchange=hero.onchange=()=>{if(live())redraw();};
 prepare.onclick=()=>{
  if(prepare.disabled||!live()||!rows?.some(row=>row.heroId===hero.value)||!['level','star','skill','exclusive-level','exclusive-star'].includes(mode.value))return;
  if(mode.value==='skill'&&!slots.some(row=>String(row.index)===skill.value)){$('gp-'+id+'-hint').textContent='请选择该英雄本次已观察到的技能槽。';return;}
  const next={heroId:hero.value,action:mode.value,...(mode.value==='skill'?{skillIdx:Number(skill.value)}:{}),...(mode.value==='star'?{allowUniversal:false}:{})};$('gp-'+id+'-parameters').value=gpJson(next);gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已准备单次英雄成长；请重新探测等级门槛和实际成本，预览后单独授权。';
 };
 box.appendChild(gpEl('p','每次只选择一个英雄及一种成长；技能使用已观察槽位。切换英雄清除槽位，升星保持自有专属碎片，不自动兑换、补购或改变前置约束。'));redraw();
}
function gpPetTargetSources(view){
 const level=view?.mode==='level',dense=value=>Array.isArray(value)&&value.length<=10000&&Object.keys(value).length===value.length&&Array.from({length:value.length},(_,i)=>Object.hasOwn(value,i)).every(Boolean);
 const exactUid=value=>typeof value==='string'&&/^[1-9][0-9]{0,18}$/.test(value)&&BigInt(value)<(1n<<63n);
 const sourceRows=level?view?.serving:view?.rooms,rows=dense(sourceRows)&&sourceRows.every(row=>typeof row?.buildingId==='string'&&row.buildingId.length>0)&&new Set(sourceRows.map(row=>row.buildingId)).size===sourceRows.length?sourceRows:null;
 const choices=buildingId=>{const row=rows?.find(row=>row.buildingId===buildingId),jobs=row?.queue?.breedQ;return level?(exactUid(row?.uid)?[{value:row.uid,label:'UID '+row.uid}]:[]):dense(jobs)&&jobs.every(job=>Number.isInteger(job?.idx)&&job.idx>=0&&job.idx<=2147483647)&&new Set(jobs.map(job=>job.idx)).size===jobs.length?jobs.map(job=>({value:String(job.idx),label:'idx '+job.idx+' · '+(job.petId||'种类未知')})):[];};
 return {level,rows,choices};
}
function gpRenderPetTarget(box,view){
 const id='pet',state=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,edit=state.revision,source=$('gp-'+id+'-parameters').value;
 if(view?.mode==='gene-exchange'){
  const rows=(view.genePreparation||[]).filter(row=>typeof row.petId==='string'&&typeof row.sourceId==='string'&&typeof row.targetId==='string'&&Number.isSafeInteger(row.sourceNum)&&row.sourceNum>0),choice=gpEl('select'),num=gpEl('input'),prepare=gpEl('button','准备明确数量基因兑换');choice.dataset.petGeneType='true';num.dataset.petGeneQuantity='true';prepare.dataset.petGenePrepare='true';num.type='number';num.min='1';num.max='2147483647';num.step='1';num.value='1';const first=gpEl('option','请选择目标专属基因');first.value='';choice.appendChild(first);for(const row of rows){const option=gpEl('option',row.petId+' · '+row.sourceId+' 持有'+row.sourceNum+' → '+row.targetId);option.value=row.petId;choice.appendChild(option);}choice.value='';
  const live=()=>gpDomainSelectable(id)&&gpSafe(scope,revision)&&gpGet(id)===state&&state.data?.view===view&&state.revision===edit&&$('gp-'+id+'-parameters').value===source,selected=()=>rows.find(row=>row.petId===choice.value),quantity=()=>/^[1-9][0-9]*$/.test(num.value)&&Number(num.value)<=2147483647?Number(num.value):null,sync=()=>{if(!live())return;choice._blocked=!rows.length;num._blocked=!selected();prepare._blocked=!selected()||!quantity()||quantity()>selected().sourceNum;gpControls(id);};choice._blocked=!rows.length;num._blocked=prepare._blocked=true;state.actionControls.push(choice,num,prepare);choice.onchange=num.oninput=num.onchange=sync;prepare.onclick=()=>{if(prepare.disabled||!live()||!selected()||!quantity()||quantity()>selected().sourceNum)return;$('gp-'+id+'-parameters').value=gpJson({action:'gene-exchange',petId:selected().petId,num:quantity()});gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已准备目标专属基因及明确兑换数量；请重新调查同组自有包和库存，再预览并单次授权。';};box.appendChild(choice);box.appendChild(num);box.appendChild(prepare);box.appendChild(gpEl('p','仅把已持有的对应品质/物种组基因自选包1:1兑换为所选专属基因。兑换不培育、不补购，收入不扩父预算；培育仍另行调查并保持universal=false。'));sync();return;
 }
 if(view?.mode==='breed'){
  const rows=(view.breedPreparation||[]).filter(row=>row.stockAvailable===true&&row.parameters?.action==='breed'&&row.parameters.buildingId==='1宠物培育室'&&typeof row.parameters.petId==='string'&&typeof row.parameters.expectedBreedHash==='string'&&/^[a-f0-9]{64}$/.test(row.parameters.expectedBreedHash)),choice=gpEl('select'),prepare=gpEl('button','准备单次普通基因培育');choice.dataset.petBreedType='true';prepare.dataset.petBreedPrepare='true';const first=gpEl('option','请选择本次海兽');first.value='';choice.appendChild(first);for(const row of rows){const option=gpEl('option',row.parameters.petId+' · '+operationCosts(row.costs)+' · '+row.breedTime+'秒');option.value=row.parameters.petId;choice.appendChild(option);}choice.value='';
  const live=()=>gpDomainSelectable(id)&&gpSafe(scope,revision)&&gpGet(id)===state&&state.data?.view===view&&state.revision===edit&&$('gp-'+id+'-parameters').value===source;choice._blocked=!rows.length;prepare._blocked=true;state.actionControls.push(choice,prepare);choice.onchange=()=>{if(!live())return;prepare._blocked=!rows.some(row=>row.parameters.petId===choice.value);gpControls(id);};prepare.onclick=()=>{if(prepare.disabled||!live())return;const row=rows.find(row=>row.parameters.petId===choice.value);if(!row)return;const {buildingId,petId,expectedBreedHash}=row.parameters;$('gp-'+id+'-parameters').value=gpJson({action:'breed',buildingId,petId,expectedBreedHash});gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已固定明确海兽和当前培育队列；请重新调查材料和空位，再预览并单次授权。';};box.appendChild(choice);box.appendChild(prepare);box.appendChild(gpEl('p','只消耗自有普通专属基因和金币，universal=false。每次新增一个培育任务，idx、星级和投喂材料由独立复读确认；不自动投喂、领取或补购。'));gpControls(id);return;
 }
 if(view?.mode==='claim'){
  const parameters=view.claimPreparation,prepare=gpEl('button','准备当前完整成熟海兽列表');prepare.dataset.petMaturePrepare='true';prepare._blocked=!parameters||parameters.action!=='claim'||parameters.buildingId!=='1宠物培育室'||typeof parameters.expectedMatureHash!=='string'||! /^[a-f0-9]{64}$/.test(parameters.expectedMatureHash);prepare.disabled=prepare._blocked||!gpDomainSelectable(id);state.actionControls.push(prepare);box.appendChild(prepare);
  prepare.onclick=()=>{if(prepare.disabled||!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id)!==state||state.data?.view!==view||state.revision!==edit||$('gp-'+id+'-parameters').value!==source)return;$('gp-'+id+'-parameters').value=gpJson({action:'claim',buildingId:parameters.buildingId,expectedMatureHash:parameters.expectedMatureHash});gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已固定当前完整成熟列表；请重新调查，再预览并单次授权领取。';};
  box.appendChild(gpEl('p','领取当前培育室完整成熟列表，不按显示行号挑选。生成UID与属性只由独立复读确认；已有海兽、队列和库存须保持，UNKNOWN停止不重放。'));return;
 }
 const {level,rows,choices:observedChoices}=gpPetTargetSources(view),building=gpEl('select'),target=gpEl('select'),prepare=gpEl('button',level?'准备服役海兽单级目标':'准备培育批次单次投喂');building.dataset.petTargetBuilding='true';target.dataset.petTargetInstance='true';prepare.dataset.petTargetPrepare='true';
 const add=(select,value,text)=>{const option=gpEl('option',text);option.value=value;select.appendChild(option);};
 add(building,'','请选择明确建筑');for(const row of rows||[])add(building,row.buildingId,row.buildingId);building.value='';
 for(const [text,control]of [['建筑',building],[level?'精确服役海兽UID':'精确培育任务idx（0有效）',target]]){const label=gpEl('label',text);label.appendChild(control);box.appendChild(label);}box.appendChild(prepare);for(const control of [building,target,prepare])state.actionControls.push(control);
 let choices=[];const live=()=>gpDomainSelectable(id)&&gpSafe(scope,revision)&&gpGet(id)===state&&state.data?.view===view&&state.revision===edit&&$('gp-'+id+'-parameters').value===source;
 const redraw=()=>{gpClear(target);add(target,'','请选择明确实例');target.value='';choices=observedChoices(building.value);
  for(const choice of choices)add(target,choice.value,choice.label);building._blocked=rows===null;target._blocked=prepare._blocked=!choices.length;gpControls(id);
 };
 building.onchange=()=>{if(live())redraw();};prepare.onclick=()=>{if(prepare.disabled||!live()||!rows?.some(row=>row.buildingId===building.value)||!choices.some(row=>row.value===target.value))return;
  const parameters={action:level?'level':'feed',buildingId:building.value,...(level?{uid:target.value}:{jobIdx:Number(target.value)})};$('gp-'+id+'-parameters').value=gpJson(parameters);gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已准备精确海兽目标；请重新探测批次、归属与成本，再预览并单独授权。';};
 box.appendChild(gpEl('p','建筑切换会清除旧实例；任务idx保持服务器值（含0），不使用显示行号。普通基因培育与成熟领取分别切换独立模式并固定当前队列或成熟清单。'));redraw();
}

function gpForgeBatchGraph(data,payload,view,accountId){
 const canonical=v=>JSON.stringify(v,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item),same=(a,b)=>canonical(a)===canonical(b),graph=data.graph,nodes=[{id:'start',type:'START'}],making=payload.action==='make',counts={...payload.expectedEquipmentCounts},totals=new Map();
 if(data.accountId!==accountId||data.action!==payload.action||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||!same(data.targets,payload.targets)||!same(data.expectedEquipmentCounts,payload.expectedEquipmentCounts)||!same(payload.expectedEquipmentCounts,view.preparation?.counts)||data.maxDurationMs!==payload.maxDurationMs||!Array.isArray(data.steps)||data.steps.length!==payload.targets.length)throw Error('装备厂组合账号、原队列、数量或时长不匹配');
 for(const [i,target] of payload.targets.entries()){
  const row=view.candidates?.find(row=>row.actionType===payload.action.toUpperCase()&&row.target?.buildingId===target.buildingId&&(!making||row.target.makeId===target.makeId)&&row.executable===true),queue=view.forges?.find(row=>row.buildingId===target.buildingId)?.queue,parameters={buildingId:target.buildingId,action:payload.action,expectedQueue:target.expectedQueue,expectedEquipmentCounts:{...counts},...(making?{makeId:target.makeId,allowUniversal:false}:{})},selection={unique:true},step=data.steps[i],expectedTarget={buildingId:target.buildingId,...(making?{makeId:target.makeId}:{})};
  if(!row||!queue||queue.state!==(making?'IDLE':'MAKING')||!same(target.expectedQueue,{makeId:queue.makeId,finishTime:queue.finishTime,equipId:queue.equipId,star:queue.star})||!same(step?.parameters,parameters)||!same(step?.selection,selection)||!same(step?.target,expectedTarget)||!Array.isArray(row.costs)||!same(step?.costs,row.costs)||!making&&!same(row.costs,[]))throw Error('装备厂原队列、逐厂参数或成本不匹配');
  for(const cost of row.costs){const num=(totals.get(cost.id)??0)+cost.num;if(!Number.isSafeInteger(cost.num)||cost.num<=0||!Number.isSafeInteger(num))throw Error('装备厂初始材料预算无效');totals.set(cost.id,num);}
  nodes.push({id:payload.action+'-'+i,type:'ACTION',module:'equipment-forge',parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'equipment-forge'});
  if(making){const type=view.recipes?.find(recipe=>recipe.makeId===target.makeId)?.type;if(!['武器','防具','饰品'].includes(type)||!Number.isSafeInteger(counts[type]+1)||counts[type]+1>2147483647)throw Error('原配方部位数量依据无效');counts[type]++;}
 }
 nodes.push({id:'stop',type:'STOP'});const budget={resources:[...totals].map(([id,num])=>({id,num})),quotas:[],uids:[]};
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.targets.length,modules:['equipment-forge']}))throw Error('装备厂逐项验证、初始父预算或有限边界不匹配');return graph;
}
function gpRenderForgeBatch(box,view,action){
 const id='equipment-forge',s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-'+id+'-parameters').value,counts=view?.preparation?.counts,section=gpEl('div'),making=action==='make',key=making?'forgeMakeControls':'forgePickControls';s[key]=[];box.appendChild(section);section.appendChild(gpEl('h4',making?'明确多个空闲装备厂逐厂单份制造':'明确多个成熟装备厂逐厂收取'));
 if(view?.preparation?.reliable!==true||!counts){section.appendChild(gpEl('p','完整闲置背包与在产数量来源可靠后，才能准备明确原批次操作。'));return;}
 const live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&$('gp-'+id+'-parameters').value===source,editable=()=>live()&&gpDomainSelectable(id)&&!s.targetDraftPending&&s.data?.config?.enabled===true&&wfEditorEditable(),control=(input,allowed=true)=>{input._forgeBatchLive=()=>editable()&&allowed;input.disabled=!input._forgeBatchLive();s[key].push(input);return input;};
 const changed=input=>{if(input.disabled||!editable())return;gpInvalidate(id,false);wfInvalidateSettingPlans();$('gp-'+id+'-hint').textContent='装备厂目标、配方或时长已编辑，旧计划和授权失效；准备时重读原队列、完整数量及累计材料。';};
 const candidates=(view.candidates||[]).filter(row=>row.actionType===action.toUpperCase()&&row.executable===true),rows=[];
 for(const forge of view.forges||[]){const options=candidates.filter(row=>row.target?.buildingId===forge.buildingId),queue=forge.queue;if(!options.length||queue?.state!==(making?'IDLE':'MAKING'))continue;
  const input=control(gpEl(making?'select':'input')),label=gpEl('label',forge.buildingId+' · 原队列 '+gpJson(queue)+' ');if(making){const empty=gpEl('option','不制造');empty.value='';input.appendChild(empty);for(const row of options){const option=gpEl('option','配方 '+row.target.makeId+' · '+operationCosts(row.costs));option.value=String(row.target.makeId);input.appendChild(option);}input.value='';}else{input.type='checkbox';input.checked=false;}input.dataset.forgeBatchBuilding=forge.buildingId;input.dataset.forgeBatchAction=action;input.onchange=()=>changed(input);label.appendChild(input);section.appendChild(label);rows.push({input,target:{buildingId:forge.buildingId,expectedQueue:{makeId:queue.makeId,finishTime:queue.finishTime,equipId:queue.equipId,star:queue.star}}});
 }
 const chosen=()=>rows.filter(row=>making?row.input.value!=='':row.input.checked).map(row=>({...row.target,...(making?{makeId:Number(row.input.value)}:{})})),duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='';duration.placeholder='明确组合总时长（秒）';duration.setAttribute('aria-label',making?'装备厂组合制造总时长秒':'装备厂组合收取总时长秒');duration.oninput=()=>changed(duration);duration.onchange=()=>changed(duration);section.appendChild(duration);
 const prepare=control(gpEl('button',making?'准备原Workflow逐厂制造':'准备原Workflow逐厂收取'),rows.length>0);prepare.type='button';prepare.dataset.forgeBatchPrepare=action;section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(!editable())return;const targets=chosen(),text=duration.value,seconds=Number(text);if(!targets.length||targets.length>24||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-'+id+'-hint').textContent='请选择1至24个不同合格装备厂及1至86400秒总时长，制造须逐厂明确原配方。';return;}
  const payload={action,targets,expectedEquipmentCounts:counts,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('forge-'+action+'-batch-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(targets),config=s.data.config,editorDraft=$('wf-json').value;
  const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&duration.value===text&&JSON.stringify(chosen())===choice;
  s.plan=null;s.selected.clear();gpClear($('gp-'+id+'-plan-view'));s.pending=true;gpControls(id);
  try{const data=await operationMutation('/api/gameplay/equipment-forge/prepare',payload,requestScope);if(!active())return;editor.accept(gpForgeBatchGraph(data,payload,view,requestScope.account));$('wf-hint').textContent='已载入明确逐厂原动作；每厂重新调查、单次授权及原队列/成本或typed产物/唯一UID/完整库存验证。';$('gp-'+id+'-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-'+id+'-hint').textContent=error.message;}finally{if(gpGet(id)===s&&s.revision===edit){s.pending=false;gpControls(id);}}
 };section.appendChild(gpEl('p','默认不选，只列本次原Function合格目标；更多厂须用空参数重新调查。每厂一次，制造仅自有普通材料与明确配方；原队列/数量变化、拒绝或UNKNOWN停止，不推算未来成熟/随机产物，不预支收入，重启不续跑。'));
}

function gpForgeTargetSources(view){
 const dense=value=>Array.isArray(value)&&value.length<=10000&&Object.keys(value).length===value.length&&Array.from({length:value.length},(_,i)=>Object.hasOwn(value,i)).every(Boolean);
 const rows=dense(view?.forges)&&view.forges.every(row=>typeof row?.buildingId==='string'&&row.buildingId.length>0)&&new Set(view.forges.map(row=>row.buildingId)).size===view.forges.length?view.forges:null;
 const recipes=dense(view?.recipes)&&view.recipes.every(row=>Number.isInteger(row?.makeId)&&row.makeId>0&&row.makeId<=2147483647)&&new Set(view.recipes.map(row=>row.makeId)).size===view.recipes.length?view.recipes:null;
 return {rows,recipes};
}
function gpRenderForgeTarget(box,view){
 const id='equipment-forge',state=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,edit=state.revision,source=$('gp-'+id+'-parameters').value;
 let parameters;try{parameters=gpParse('gp-'+id+'-parameters');if(Object.keys(parameters).some(key=>!['action','buildingId','makeId','allowUniversal'].includes(key))||parameters.allowUniversal===true)throw Error('guarded parameters');}catch{box.appendChild(gpEl('p','当前草稿含队列或数量前置约束；请保留并使用原有限组合准备入口，此单次表单不改写约束。'));return;}
 const {rows,recipes}=gpForgeTargetSources(view);
 const mode=gpEl('select'),building=gpEl('select'),recipe=gpEl('select'),prepare=gpEl('button','准备单次装备厂目标');mode.dataset.forgeTargetMode='true';building.dataset.forgeTargetBuilding='true';recipe.dataset.forgeTargetRecipe='true';prepare.dataset.forgeTargetPrepare='true';
 const add=(select,value,text)=>{const option=gpEl('option',text);option.value=value;select.appendChild(option);};add(mode,'make','单份制造');add(mode,'pick','收取一个明确批次');mode.value=parameters.action==='pick'?'pick':'make';add(building,'','请选择装备厂');for(const row of rows||[])add(building,row.buildingId,row.buildingId);building.value='';add(recipe,'','请选择明确配方');for(const row of recipes||[])add(recipe,String(row.makeId),row.makeId+' · '+row.type+' · '+operationCosts(row.costs));recipe.value='';
 for(const [text,control]of [['原操作',mode],['明确装备厂',building],['单份制造配方',recipe]]){const label=gpEl('label',text);label.appendChild(control);box.appendChild(label);}box.appendChild(prepare);for(const control of [mode,building,recipe,prepare])state.actionControls.push(control);
 const live=()=>gpDomainSelectable(id)&&gpSafe(scope,revision)&&gpGet(id)===state&&state.data?.view===view&&state.revision===edit&&$('gp-'+id+'-parameters').value===source;
 const redraw=()=>{mode._blocked=building._blocked=rows===null;recipe._blocked=mode.value==='pick'||recipes===null;prepare._blocked=rows===null||mode.value==='make'&&recipes===null;gpControls(id);};mode.onchange=()=>{if(live()){recipe.value='';redraw();}};building.onchange=()=>{if(live())recipe.value='';};
 prepare.onclick=()=>{
  if(prepare.disabled||!live()||!rows?.some(row=>row.buildingId===building.value)||!['make','pick'].includes(mode.value))return;
  const selected=recipes?.find(row=>String(row.makeId)===recipe.value);if(mode.value==='make'&&!selected){$('gp-'+id+'-hint').textContent='请选择本次已观察到的明确配方。';return;}
  const next={action:mode.value,buildingId:building.value,...(mode.value==='make'?{makeId:selected.makeId,allowUniversal:false}:{})};$('gp-'+id+'-parameters').value=gpJson(next);gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已准备装备厂单次目标；请重新探测队列、赛季及材料，预览后单独授权。';
 };
 box.appendChild(gpEl('p','单份制造与收取分别准备；切换工厂清除配方，不自动替换队列或配方，不使用通用补料。收取须重新调查明确队列及到期状态。'));redraw();
}
function gpFormationUnlockTargets(view){
 return view?.reliability?.catalog===true&&Array.isArray(view.templates)&&view.templates.every(row=>Number.isInteger(row?.presetId)&&row.presetId>=2&&row.presetId<=24)&&new Set(view.templates.map(row=>row.presetId)).size===view.templates.length?view.templates:null;
}
function gpRenderFormationUnlockTarget(box,view){
 const id='formation-unlock',state=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,edit=state.revision,source=$('gp-'+id+'-parameters').value,select=gpEl('select'),prepare=gpEl('button','准备单张普通图纸解锁');select.dataset.formationUnlockTarget='true';prepare.dataset.formationUnlockPrepare='true';
 const templates=gpFormationUnlockTargets(view),known=templates!==null;
 const empty=gpEl('option','请选择普通模板');empty.value='';select.appendChild(empty);for(const row of templates||[]){const option=gpEl('option',row.presetId+' · '+row.name);option.value=String(row.presetId);select.appendChild(option);}select.value='';for(const control of [select,prepare]){control._blocked=!known;state.actionControls.push(control);}box.appendChild(select);box.appendChild(prepare);
 prepare.onclick=()=>{if(prepare.disabled||!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id)!==state||state.data?.view!==view||state.revision!==edit||$('gp-'+id+'-parameters').value!==source||!known)return;const row=view.templates.find(row=>String(row.presetId)===select.value);if(!row)return;$('gp-'+id+'-parameters').value=gpJson({presetId:row.presetId});gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已准备一个普通模板；请重新探测持有图纸和解锁状态，预览后单独授权，不自动应用阵容。';};
}

function gpMuseumExploreSources(view){
 const observation=view?.explorationSelection,dense=value=>Array.isArray(value)&&value.length<=10000&&Object.keys(value).length===value.length&&Array.from({length:value.length},(_,i)=>Object.hasOwn(value,i)).every(Boolean),positive=value=>Number.isSafeInteger(value)&&value>0;
 const stages=dense(observation?.stages)&&observation.stages.every(row=>positive(row?.stageId))&&new Set(observation.stages.map(row=>row.stageId)).size===observation.stages.length?observation.stages:null;
 const heroes=dense(observation?.heroes)&&observation.heroes.every(row=>typeof row?.heroId==='string'&&row.heroId.length>0&&typeof row.busy==='boolean')&&new Set(observation.heroes.map(row=>row.heroId)).size===observation.heroes.length?observation.heroes:null;
 const factors=dense(observation?.factors)&&observation.factors.every(positive)&&new Set(observation.factors).size===observation.factors.length?observation.factors:null;
 return {stages,heroes,factors};
}
function gpRenderMuseumExploreTarget(box,view){
 const id='museum',state=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,edit=state.revision,source=$('gp-'+id+'-parameters').value;
 let parameters;try{parameters=gpParse('gp-'+id+'-parameters');if(Object.keys(parameters).some(key=>!['stageId','heroIds','factor'].includes(key)))throw Error('other museum branch');}catch{box.appendChild(gpEl('p','当前为其他博物馆业务草稿；出发表单保留原参数，请先在高级参数中明确切换为探险出发。'));return;}
 const {stages,heroes,factors}=gpMuseumExploreSources(view),positive=value=>Number.isSafeInteger(value)&&value>0;
 const stage=gpEl('select'),factor=gpEl('select'),members=gpEl('div'),hint=gpEl('p'),prepare=gpEl('button','准备明确博物馆出发');stage.dataset.museumExploreStage='true';factor.dataset.museumExploreFactor='true';members.dataset.museumExploreHeroes='true';prepare.dataset.museumExplorePrepare='true';
 const add=(select,value,text,disabled=false)=>{const option=gpEl('option',text);option.value=value;option.disabled=disabled;select.appendChild(option);};
 add(stage,'','请选择已观察关卡');for(const row of stages||[])add(stage,String(row.stageId),row.stageId+' · '+row.status+' · 需要 '+(row.requiredHeroCount??'未知')+' 英雄',row.status!=='IDLE'||row.unlocked!==true||!positive(row.requiredHeroCount));stage.value='';
 add(factor,'','请选择明确已解锁倍率');for(const value of factors||[])add(factor,String(value),'倍率 '+value);factor.value='';
 for(const [text,control]of [['明确关卡',stage],['本次倍率',factor]]){const label=gpEl('label',text);label.appendChild(control);box.appendChild(label);}box.appendChild(members);box.appendChild(hint);box.appendChild(prepare);
 const selections=[];for(const row of heroes||[]){const choice=gpEl('input'),label=gpEl('label',row.heroId+(row.busy?' · 已被探险占用':''));choice.type='checkbox';choice.checked=false;choice.dataset.museumExploreHero=row.heroId;choice._blocked=row.busy;label.appendChild(choice);members.appendChild(label);selections.push({heroId:row.heroId,control:choice});state.actionControls.push(choice);}
 for(const control of [stage,factor,prepare])state.actionControls.push(control);
 const live=()=>gpDomainSelectable(id)&&gpSafe(scope,revision)&&gpGet(id)===state&&state.data?.view===view&&state.revision===edit&&$('gp-'+id+'-parameters').value===source;
 const selected=()=>selections.filter(row=>row.control.checked&&!row.control._blocked).map(row=>row.heroId);
 const redraw=()=>{const row=stages?.find(row=>String(row.stageId)===stage.value);hint.textContent='本次需要 '+(row?.requiredHeroCount??'未知')+' 个英雄；明确选择 '+selected().length+' 个。队伍容量和实际成本将在重新探测时核验。';stage._blocked=stages===null;factor._blocked=factors===null;prepare._blocked=!row||row.status!=='IDLE'||row.unlocked!==true||!positive(row.requiredHeroCount)||heroes===null||factors===null;gpControls(id);};
 stage.onchange=()=>{if(!live())return;for(const row of selections)row.control.checked=false;redraw();};for(const row of selections)row.control.onchange=()=>{if(live())redraw();};
 prepare.onclick=()=>{
  if(prepare.disabled||!live())return;const row=stages?.find(row=>String(row.stageId)===stage.value),heroIds=selected(),multiplier=factors?.find(value=>String(value)===factor.value);
  if(!row||!positive(multiplier)||heroIds.length!==row.requiredHeroCount||heroIds.length>100){$('gp-'+id+'-hint').textContent='须选择明确已解锁倍率，并按本关人数选择未被探险占用的英雄。';return;}
  $('gp-'+id+'-parameters').value=gpJson({stageId:row.stageId,heroIds,factor:multiplier});gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已准备明确探险出发；请重新探测队伍容量、占用及实际材料，再预览并单独授权。';
 };
 box.appendChild(gpEl('p','本表单只准备原探险出发，不安排结算、领奖、自动换人或补料。切换关卡清除英雄选择；当前观察不保证未来资格。'));redraw();
}

function gpMuseumExploreGraph(data,payload,view,accountId){
 const canonical=v=>JSON.stringify(v,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item),same=(a,b)=>canonical(a)===canonical(b),graph=data.graph,nodes=[{id:'start',type:'START'}],uids=[],totals=new Map(),usedStages=new Set(),usedHeroes=new Set(),source=gpMuseumExploreSources(view);
 if(payload.actionType!=='startExplore'||data.accountId!==accountId||data.actionType!==payload.actionType||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||!same(data.targets,payload.targets)||data.maxDurationMs!==payload.maxDurationMs||!Array.isArray(data.steps)||data.steps.length!==payload.targets.length||payload.targets.length<1||payload.targets.length>24||!Number.isSafeInteger(view.teamCount)||!Number.isSafeInteger(view.occupiedTeams)||view.occupiedTeams+payload.targets.length>view.teamCount)throw Error('多队出发账号、目标、容量或有限时长不匹配');
 for(const [i,parameters] of payload.targets.entries()){
  const stage=source.stages?.find(row=>row.stageId===parameters.stageId),prices=stage?.startCosts?.filter(row=>row.factor===parameters.factor),costs=prices?.length===1?prices[0].costs:null,target={stageId:parameters.stageId,heroIds:parameters.heroIds,factor:parameters.factor},selection={actionId:'museum:startExplore:'+encodeURIComponent(canonical(target))},step=data.steps[i];
  if(!stage||stage.status!=='IDLE'||stage.unlocked!==true||!stage.preparationHash||stage.preparationHash!==parameters.expectedExploreHash||!source.factors?.includes(parameters.factor)||!Array.isArray(parameters.heroIds)||!parameters.heroIds.length||parameters.heroIds.length!==stage.requiredHeroCount||usedStages.has(stage.stageId)||parameters.heroIds.some(id=>usedHeroes.has(id)||source.heroes?.find(row=>row.heroId===id)?.busy!==false)||new Set(parameters.heroIds).size!==parameters.heroIds.length||!gpBudget(costs))throw Error('多队出发原关卡、英雄、倍率、来源或材料不匹配');
  usedStages.add(stage.stageId);parameters.heroIds.forEach(id=>usedHeroes.add(id));const claims={resources:costs,quotas:[],uids:[{type:'museum-explore-stage',id:String(stage.stageId)},...parameters.heroIds.map(id=>({type:'museum-explore-hero',id}))]};
  if(!same(step?.parameters,parameters)||!same(step?.selection,selection)||!same(step?.target,target)||!same(step?.costs,costs)||!same(step?.budgetClaims,claims))throw Error('多队出发原动作、成本或固定UID预算变化');
  for(const cost of costs){const next=(totals.get(cost.id)??0)+cost.num;if(!Number.isSafeInteger(next))throw Error('多队出发累计材料超过安全范围');totals.set(cost.id,next);}uids.push(...claims.uids);nodes.push({id:'grow-'+i,type:'ACTION',module:'museum',parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'museum'});
 }
 nodes.push({id:'stop',type:'STOP'});const budget={resources:[...totals].filter(([,num])=>num>0).map(([id,num])=>({id,num})),quotas:[],uids};
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.targets.length,modules:['museum']}))throw Error('多队出发逐项验证、原预算或有限上限不匹配');return graph;
}
function gpRenderMuseumExploreBatch(box,view){
 const id='museum',s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-museum-parameters').value,{stages,heroes,factors}=gpMuseumExploreSources(view),section=gpEl('div');s.museumExploreControls=[];box.appendChild(section);section.appendChild(gpEl('h4','明确多队探险逐队出发'));
 const available=stages?.filter(row=>row.status==='IDLE'&&row.unlocked===true&&Number.isSafeInteger(row.requiredHeroCount)&&row.requiredHeroCount>0&&typeof row.preparationHash==='string'&&/^[a-f0-9]{64}$/.test(row.preparationHash)),capacity=Number.isSafeInteger(view?.teamCount)&&Number.isSafeInteger(view?.occupiedTeams)?Math.max(0,view.teamCount-view.occupiedTeams):0;
 if(!available?.length||!heroes||!factors?.length||capacity<1){section.appendChild(gpEl('p','本次没有具备可靠来源、明确人数及空余队伍容量的关卡；出发不代表结算或领奖。'));return;}
 const teams=[],picks=[],list=gpEl('div'),hint=gpEl('p'),live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&$('gp-museum-parameters').value===source,editable=()=>live()&&gpDomainSelectable(id)&&!s.targetDraftPending&&s.data?.config?.enabled===true&&s.data.config.exploration===true&&wfEditorEditable(),control=(input,eligible=()=>true)=>{input._museumExploreLive=()=>editable()&&eligible();input.disabled=!input._museumExploreLive();s.museumExploreControls.push(input);return input;},changed=()=>{gpInvalidate(id,false);wfInvalidateSettingPlans();$('gp-museum-hint').textContent='出发队伍或总时长已编辑，旧计划和授权失效；准备时重新核人数、占用、容量和全部自有材料。';};
 const stage=control(gpEl('select')),factor=control(gpEl('select')),addOption=(select,value,text)=>{const option=gpEl('option',text);option.value=value;select.appendChild(option);};stage.dataset.museumExploreBatchStage='true';factor.dataset.museumExploreBatchFactor='true';addOption(stage,'','选择本队空闲关卡');for(const row of available)addOption(stage,String(row.stageId),row.stageId+' · 需要 '+row.requiredHeroCount+' 英雄');stage.value='';addOption(factor,'','选择本队已解锁倍率');for(const value of factors)addOption(factor,String(value),'倍率 '+value);factor.value='';section.appendChild(stage);section.appendChild(factor);
 for(const row of heroes){const check=control(gpEl('input'),()=>row.busy===false&&!teams.some(team=>team.heroIds.includes(row.heroId))),label=gpEl('label',row.heroId+(row.busy?' · 已占用':''));check.type='checkbox';check.checked=false;check.dataset.museumExploreBatchHero=row.heroId;label.appendChild(check);section.appendChild(label);picks.push({row,check});}
 const add=control(gpEl('button','将本队加入出发列表'),()=>teams.length<Math.min(24,capacity));add.type='button';add.dataset.museumExploreBatchAdd='true';section.appendChild(add);section.appendChild(list);section.appendChild(hint);
 const redraw=()=>{gpClear(list);for(const team of teams){const card=gpEl('div'),price=available.find(row=>row.stageId===team.stageId)?.startCosts?.find(row=>row.factor===team.factor);card.appendChild(gpEl('p','关卡 '+team.stageId+' · 英雄 '+team.heroIds.join('、')+' · 倍率 '+team.factor+' · 原成本 '+operationCosts(price?.costs)));const remove=control(gpEl('button','移除此队'),()=>teams.includes(team)&&Array.from(list.children).includes(card));remove.type='button';remove.dataset.museumExploreBatchRemove=String(team.stageId);remove.onclick=()=>{if(remove.disabled||!editable()||!Array.from(list.children).includes(card))return;teams.splice(teams.indexOf(team),1);changed();redraw();};card.appendChild(remove);list.appendChild(card);}hint.textContent='本次明确 '+teams.length+' 队；原空余容量 '+capacity+'。默认不选择队伍，所有关卡与英雄不得重复。';gpControls(id);};
 stage.onchange=()=>{if(stage.disabled||!editable())return;picks.forEach(({check})=>check.checked=false);changed();};factor.onchange=()=>{if(!factor.disabled&&editable())changed();};for(const {check} of picks)check.onchange=()=>{if(!check.disabled&&editable())changed();};
 add.onclick=()=>{if(add.disabled||!editable())return;const row=available.find(row=>String(row.stageId)===stage.value),multiplier=factors.find(value=>String(value)===factor.value),heroIds=picks.filter(({check})=>check.checked&&!check.disabled).map(({row})=>row.heroId);if(!row||!multiplier||heroIds.length!==row.requiredHeroCount||heroIds.length>100||teams.some(team=>team.stageId===row.stageId||team.heroIds.some(id=>heroIds.includes(id)))||row.startCosts?.filter(price=>price.factor===multiplier).length!==1){$('gp-museum-hint').textContent='请明确一个未重复关卡、已解锁倍率及本关完整人数的未占用英雄；每英雄在本列表只用一次。';return;}teams.push({stageId:row.stageId,heroIds,factor:multiplier,expectedExploreHash:row.preparationHash});stage.value=factor.value='';picks.forEach(({check})=>check.checked=false);changed();redraw();};
 const duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='';duration.placeholder='明确多队出发总时长（秒）';duration.setAttribute('aria-label','多队出发总时长秒');duration.dataset.museumExploreBatchDuration='true';duration.oninput=duration.onchange=()=>{if(!duration.disabled&&editable())changed();};section.appendChild(duration);
 const prepare=control(gpEl('button','准备原Workflow逐队出发'));prepare.type='button';prepare.dataset.museumExploreBatchPrepare='true';section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(prepare.disabled||!editable())return;const targets=teams.map(row=>({...row,heroIds:[...row.heroIds]})),text=duration.value,seconds=Number(text);if(!targets.length||targets.length>Math.min(24,capacity)||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-museum-hint').textContent='请明确加入1至24队、保留原初始空位，并填写1至86400秒总时长。';return;}
  const payload={actionType:'startExplore',targets,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('museum-explore-batch-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(targets),config=s.data.config,editorDraft=$('wf-json').value,active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&duration.value===text&&JSON.stringify(teams)===choice;
  s.plan=null;s.selected.clear();gpClear($('gp-museum-plan-view'));s.pending=true;gpControls(id);
  try{const data=await operationMutation('/api/gameplay/museum/growth/prepare',payload,requestScope);if(!active())return;editor.accept(gpMuseumExploreGraph(data,payload,view,requestScope.account));$('wf-hint').textContent='已载入明确逐队出发图；各队新调查、单次授权及原出发和材料净扣验证，UNKNOWN停止。';$('gp-museum-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-museum-hint').textContent=error.message;}finally{if(gpGet(id)===s&&s.revision===edit){s.pending=false;gpControls(id);}}
 };section.appendChild(gpEl('p','只使用本次空余队伍、自有材料和当前未占用英雄；每队明确关卡、完整英雄与倍率。原材料来源、关卡和英雄UID固定，各队单独调查、授权及验证；不安排完成结算、探险领奖、加速、补料或自动换人，重启不续跑。'));redraw();
}

function gpMuseumExhibitGraph(data,payload,view,accountId){
 const canonical=v=>JSON.stringify(v,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item),same=(a,b)=>canonical(a)===canonical(b),graph=data.graph,nodes=[{id:'start',type:'START'}],uids=[];
 if(data.accountId!==accountId||data.actionType!=='exhibit'||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||!same(data.targets,payload.targets)||data.maxDurationMs!==payload.maxDurationMs||!Array.isArray(data.steps)||data.steps.length!==payload.targets.length)throw Error('陈列组合账号、明确目标或时长不匹配');
 for(const [i,parameters] of payload.targets.entries()){
  const rows=view.exhibitPreparation?.filter(row=>same(row.parameters,parameters)),row=rows?.length===1?rows[0]:null,step=data.steps[i],target={exhibitionId:parameters.exhibitionId,caseIndex:parameters.caseIndex,antiqueId:parameters.antiqueId},claims={resources:[],quotas:[],uids:[{type:'museum-case',id:target.exhibitionId+':'+target.caseIndex},...(target.antiqueId?[{type:'antique',id:target.antiqueId}]:[])]};
  if(!row||!same(row.costs,[])||!same(row.target,target)||!same(step?.parameters,parameters)||!same(step?.selection,row.selection)||!same(step?.target,target)||!same(step?.costs,[])||!same(step?.budgetClaims,claims))throw Error('陈列原目标、展柜/归属摘要或父UID不匹配');
  nodes.push({id:'grow-'+i,type:'ACTION',module:'museum',parameters,selection:row.selection},{id:'verify-'+i,type:'VERIFY',module:'museum'});uids.push(...claims.uids);
 }
 nodes.push({id:'stop',type:'STOP'});const budget={resources:[],quotas:[],uids};
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.targets.length,modules:['museum']}))throw Error('陈列逐项验证、零成本或有限边界不匹配');return graph;
}
function gpRenderMuseumExhibits(box,view){
 const id='museum',s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-museum-parameters').value,rows=view?.exhibitPreparation||[],section=gpEl('div');s.museumExhibitControls=[];box.appendChild(section);section.appendChild(gpEl('h4','明确多个展柜陈列、替换或撤下'));
 if(!rows.length){section.appendChild(gpEl('p','本次无原合同合格陈列候选；需可靠展柜/藏品来源与原陈列开关，更多展柜用空参数重新调查。'));return;}
 const live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&$('gp-museum-parameters').value===source,editable=()=>live()&&gpDomainSelectable(id)&&!s.targetDraftPending&&s.data?.config?.enabled===true&&s.data.config.exhibition===true&&s.data.config.exhibit===true&&wfEditorEditable(),control=input=>{input._museumExhibitLive=editable;input.disabled=!editable();s.museumExhibitControls.push(input);return input;};
 const changed=input=>{if(input.disabled||!editable())return;gpInvalidate(id,false);wfInvalidateSettingPlans();$('gp-museum-hint').textContent='陈列分配或时长已编辑，旧计划和授权失效；准备时重新核展柜、归属及原配置。';},slots=[...new Set(rows.map(row=>row.target.exhibitionId+':'+row.target.caseIndex))],selects=[];
 for(const key of slots){const options=rows.filter(row=>row.target.exhibitionId+':'+row.target.caseIndex===key),select=control(gpEl('select')),first=options[0].target,current=view.exhibitions?.find(e=>e.exhibitionId===first.exhibitionId)?.cases?.find(c=>c.caseIndex===first.caseIndex),label=gpEl('label','展区 '+first.exhibitionId+' · 展柜 '+first.caseIndex+' · 当前 '+(current?.antiqueId||'空柜')+' '),empty=gpEl('option','保持当前');empty.value='';select.appendChild(empty);options.forEach((row,i)=>{const option=gpEl('option',row.target.antiqueId?'陈列 '+row.target.antiqueId:'明确撤下当前藏品');option.value=String(i);select.appendChild(option);});select.value='';select.dataset.museumExhibitCase=key;select.onchange=()=>{if(select.disabled||!editable())return;const antiqueId=options[Number(select.value)]?.target.antiqueId;if(select.value!==''&&antiqueId)for(const other of selects){if(other.select!==select&&other.select.value!==''&&other.options[Number(other.select.value)]?.target.antiqueId===antiqueId)other.select.value='';}changed(select);};label.appendChild(select);section.appendChild(label);selects.push({select,options});}
 const chosen=()=>selects.filter(row=>row.select.value!=='').map(row=>row.options[Number(row.select.value)].parameters),duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='';duration.placeholder='明确陈列组合总时长（秒）';duration.setAttribute('aria-label','多展柜陈列总时长秒');duration.oninput=()=>changed(duration);duration.onchange=()=>changed(duration);section.appendChild(duration);
 const prepare=control(gpEl('button','准备原Workflow逐展柜陈列'));prepare.type='button';prepare.dataset.museumExhibitPrepare='true';section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(!editable())return;const targets=chosen(),text=duration.value,seconds=Number(text);if(!targets.length||targets.length>24||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-museum-hint').textContent='请明确选择1至24个不同展柜的目标及1至86400秒总时长，同一非空藏品不得重复。';return;}
  const payload={actionType:'exhibit',targets,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('museum-exhibits-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(targets),config=s.data.config,editorDraft=$('wf-json').value;
  const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&duration.value===text&&JSON.stringify(chosen())===choice;
  s.plan=null;s.selected.clear();gpClear($('gp-museum-plan-view'));s.pending=true;gpControls(id);
  try{const data=await operationMutation('/api/gameplay/museum/growth/prepare',payload,requestScope);if(!active())return;editor.accept(gpMuseumExhibitGraph(data,payload,view,requestScope.account));$('wf-hint').textContent='已载入明确逐展柜陈列图；每柜新调查、单次授权及原完整展区/展柜和库存验证。';$('gp-museum-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-museum-hint').textContent=error.message;}finally{if(gpGet(id)===s&&s.revision===edit){s.pending=false;gpControls(id);}}
 };section.appendChild(gpEl('p','默认保持当前；同一藏品互斥，每展柜一次。只列当前已合格的放入/替换/撤下，不模拟先撤下再转放的未来资格。零材料支出、固定目标UID，每柜重新调查、授权和原独立验证，变化/拒绝/UNKNOWN停止，不领取探险或收益，重启不续跑。'));
}

function gpRenderMuseumBusinessTarget(box,view){
 const id='museum',state=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,edit=state.revision,source=$('gp-'+id+'-parameters').value;
 let parameters;try{parameters=gpParse('gp-'+id+'-parameters');if(Object.keys(parameters).some(key=>!['stageId','heroIds','factor','exhibitionId','caseIndex','keywordType','antiqueId','useNum','payment'].includes(key)))throw Error('unknown parameters');}catch{box.appendChild(gpEl('p','博物馆高级草稿包含未知约束；目标控件保留原草稿。'));return;}
 const positive=value=>Number.isSafeInteger(value)&&value>0,dense=value=>Array.isArray(value)&&value.length<=10000&&Object.keys(value).length===value.length,unique=(rows,key)=>dense(rows)&&new Set(rows.map(row=>row[key])).size===rows.length;
 const observation=view?.exhibitionSelection,areas=unique(observation?.exhibitions,'exhibitionId')&&observation.exhibitions.every(row=>positive(row?.exhibitionId))?observation.exhibitions:null,antiques=dense(observation?.antiques)&&observation.antiques.every(value=>typeof value==='string'&&value.length>0)&&new Set(observation.antiques).size===observation.antiques.length?observation.antiques:null,stages=unique(view?.explorationSelection?.stages,'stageId')?view.explorationSelection.stages:null;
 const mode=gpEl('select'),area=gpEl('select'),slot=gpEl('select'),keyword=gpEl('select'),antique=gpEl('select'),stage=gpEl('select'),num=gpEl('input'),prepare=gpEl('button','准备博物馆业务目标');
 const add=(select,value,text)=>{const option=gpEl('option',text);option.value=value;select.appendChild(option);};
 for(const [value,text]of [['area','展区单次成长'],['keyword','关键词单次成长'],['case','展柜升级或到期完成'],['exhibit','展柜陈列或撤下'],['case-speed','单柜自有道具加速'],['case-speed-batch','多柜自有道具加速'],['explore-speed','单队探险自有道具加速'],['explore-speed-batch','多队探险自有道具加速']])add(mode,value,text);mode.value='area';
 add(area,'','请选择已观察展区');for(const row of areas||[])add(area,String(row.exhibitionId),row.exhibitionId+' · 等级 '+row.level);area.value='';
 add(stage,'','请选择正在探险关卡');for(const row of stages||[])if(row.status==='EXPLORING'&&positive(row.stageId))add(stage,String(row.stageId),String(row.stageId));stage.value='';
 add(antique,'','请选择已持有藏品或明确撤下');add(antique,'remove','明确撤下当前展柜藏品');for(const value of antiques||[])add(antique,'id:'+value,value);antique.value='';
 num.type='number';num.min='1';num.max='2147483647';num.step='1';num.value='';
 for(const [key,text,control]of [['Mode','业务范围',mode],['Area','展区',area],['Case','展柜索引',slot],['Keyword','关键词类型',keyword],['Antique','陈列藏品',antique],['Stage','加速探险关卡',stage],['Quantity','自有加速道具数量',num]]){control.dataset['museumBusiness'+key]='true';const label=gpEl('label',text);label.appendChild(control);box.appendChild(label);state.actionControls.push(control);}prepare.dataset.museumBusinessPrepare='true';box.appendChild(prepare);state.actionControls.push(prepare);
 const live=()=>gpDomainSelectable(id)&&gpSafe(scope,revision)&&gpGet(id)===state&&state.data?.view===view&&state.revision===edit&&$('gp-'+id+'-parameters').value===source;
 const selectedArea=()=>areas?.find(row=>String(row.exhibitionId)===area.value),selectedCase=()=>selectedArea()?.cases?.find(row=>String(row.caseIndex)===slot.value);
 const redraw=()=>{const e=selectedArea(),explore=mode.value.startsWith('explore-speed'),batch=mode.value==='explore-speed-batch',caseBatch=mode.value==='case-speed-batch',cases=['case','exhibit','case-speed'].includes(mode.value),speed=mode.value==='case-speed'||caseBatch||explore;mode._blocked=false;area._blocked=explore||caseBatch||areas===null;slot._blocked=!cases||!dense(e?.cases);keyword._blocked=mode.value!=='keyword'||!dense(e?.keywordLevels);antique._blocked=mode.value!=='exhibit';stage._blocked=!explore||batch||stages===null;num._blocked=!speed;prepare._blocked=explore?!stages?.some(row=>row.status==='EXPLORING'&&(batch||String(row.stageId)===stage.value)):caseBatch?!areas?.some(area=>area.cases?.some(slot=>slot.upgradeFinishTime>0)):!e||cases&&!selectedCase()||mode.value==='keyword'&&!dense(e.keywordLevels);gpControls(id);};
 const rebuild=()=>{gpClear(slot);gpClear(keyword);add(slot,'','请选择本展区展柜');add(keyword,'','请选择本展区关键词');const e=selectedArea();for(const row of dense(e?.cases)?e.cases:[])if(positive(row.caseIndex))add(slot,String(row.caseIndex),row.caseIndex+' · 等级 '+row.level+' · '+(row.antiqueId||'空柜'));if(dense(e?.keywordLevels)&&e.keywordLevels.length===3)e.keywordLevels.forEach((level,index)=>add(keyword,String(index+1),(index+1)+' · 等级 '+level));slot.value=keyword.value=antique.value='';num.value='';redraw();};
 mode.onchange=()=>{if(!live())return;stage.value='';rebuild();};area.onchange=()=>{if(live())rebuild();};slot.onchange=stage.onchange=()=>{if(live())redraw();};
 prepare.onclick=()=>{
  if(prepare.disabled||!live())return;const e=selectedArea(),c=selectedCase(),selected=mode.value,next={};if(!['area','keyword','case','exhibit','case-speed','case-speed-batch','explore-speed','explore-speed-batch'].includes(selected))return;
  if(selected==='explore-speed'){const s=stages?.find(row=>String(row.stageId)===stage.value&&row.status==='EXPLORING');if(!s)return;next.stageId=s.stageId;}else if(!selected.endsWith('-batch')){if(!e)return;next.exhibitionId=e.exhibitionId;}
  if(['case','exhibit','case-speed'].includes(selected)){if(!c)return;next.caseIndex=c.caseIndex;}
  if(selected==='keyword'){const type=Number(keyword.value);if(!positive(type)||type>3||!dense(e.keywordLevels)||e.keywordLevels.length!==3){$('gp-'+id+'-hint').textContent='请选择本次已观察到的关键词类型。';return;}next.keywordType=type;}
  if(selected==='exhibit'){if(antique.value==='remove')next.antiqueId='';else{const value=antiques?.find(value=>'id:'+value===antique.value);if(!value){$('gp-'+id+'-hint').textContent='请选择已持有藏品，或明确选择撤下。';return;}next.antiqueId=value;}}
  if(['case-speed','case-speed-batch','explore-speed','explore-speed-batch'].includes(selected)){if(!/^[1-9][0-9]*$/.test(num.value)||Number(num.value)>2147483647){$('gp-'+id+'-hint').textContent='加速数量须为明确正int32整数。';return;}next.payment='ITEM';next.useNum=Number(num.value);}
  $('gp-'+id+'-parameters').value=gpJson(next);gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent=selected.endsWith('-batch')?'已设置每个目标的道具数量。重新调查，再选择要加速的目标。':'已准备精确博物馆目标；重新调查后选择具体动作、预览成本并单独授权。';
 };
 box.appendChild(gpEl('p','本表单仅限定原业务目标，具体可执行动作由重新调查和原候选决定。陈列资格、占用、升级前置、道具数量及可信时钟仍由原Function核验；出发、完成、结算与奖励保持独立。'));rebuild();
}

function gpMailWorkflowGraph(data,payload,view,accountId){
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item),same=(a,b)=>canonical(a)===canonical(b),graph=data.graph;
 if(data.accountId!==accountId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||data.pageNo!==payload.pageNo||data.maxDurationMs!==payload.maxDurationMs||!same(data.mails,payload.mails)||!Array.isArray(data.steps)||data.steps.length!==payload.mails.length)throw Error('邮件组合账号、来源页、目标或时长不匹配');
 const nodes=[{id:'start',type:'START'}];payload.mails.forEach((target,i)=>{
  const source=view.mailPreparation?.find(row=>row.pageNo===payload.pageNo&&row.emailId===target.emailId&&row.action===target.action&&row.expectedMailHash===target.expectedMailHash),step=data.steps[i],parameters={pageNo:payload.pageNo,...target};
  if(!source||!same(step?.parameters,parameters)||!same(step?.selection,source.selection)||!same(step?.rewards,source.rewards)||!same(step?.costs,[]))throw Error('邮件组合原身份、状态、附件或顺序已改变');
  nodes.push({id:'mail-'+i,type:'ACTION',module:'mail',parameters,selection:source.selection},{id:'verify-'+i,type:'VERIFY',module:'mail'});
 });nodes.push({id:'stop',type:'STOP'});const budget={resources:[],quotas:[],uids:payload.mails.map(row=>({type:'mail',id:row.emailId}))};
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.mails.length,modules:['mail']}))throw Error('邮件逐封验证、有限上限或原父UID预算不匹配');return graph;
}
function gpTrialWorkflowGraph(data,payload,view,accountId){
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item),same=(a,b)=>canonical(a)===canonical(b),graph=data.graph;
 if(data.accountId!==accountId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||data.raidId!==payload.raidId||view.raid?.raidId!==payload.raidId||data.maxDurationMs!==payload.maxDurationMs||!same(data.stageIds,payload.stageIds)||!Array.isArray(data.steps)||data.steps.length!==payload.stageIds.length)throw Error('首通序列账号、副本、目标或时长不匹配');
 const nodes=[{id:'start',type:'START'}],claims=[];payload.stageIds.forEach((stageId,i)=>{const source=view.upcomingStages?.[i],step=data.steps[i],parameters={raidId:payload.raidId,stageId},selection={unique:true};
  if(source?.stageId!==stageId||!same(step?.parameters,parameters)||!same(step?.selection,selection)||!same(step?.rewards,source.rewards)||!same(step?.costs,[])||!same(step?.budgetClaims,source.budgetClaims))throw Error('首通序列原顺序、配置奖励或逐关预算不匹配');
  claims.push(source.budgetClaims);nodes.push({id:'challenge-'+i,type:'ACTION',module:'trial-challenge',parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'trial-challenge'});
 });nodes.push({id:'stop',type:'STOP'});const budget={resources:[],quotas:claims.flatMap(claim=>claim.quotas),uids:claims.flatMap(claim=>claim.uids)};
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.stageIds.length,modules:['trial-challenge']}))throw Error('首通逐关验证、有限上限或原父预算不匹配');return graph;
}
function gpRenderTrialSequence(box,view){
 const s=gpGet('trial-challenge'),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-trial-challenge-parameters').value,section=gpEl('div'),rows=view?.upcomingStages||[];s.trialSequenceControls=[];box.appendChild(section);section.appendChild(gpEl('h4','明确关卡有限首通'));
 if(!rows.length){section.appendChild(gpEl('p','先选择副本并重新调查；仅当前首通资格可靠时显示从下一关开始的配置目标。未来关卡的目标列表不证明可获胜或奖励到账。'));return;}
 const live=()=>gpSafe(scope,revision)&&gpGet('trial-challenge')===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&$('gp-trial-challenge-parameters').value===source,editable=()=>live()&&gpDomainSelectable('trial-challenge')&&!s.targetDraftPending&&s.data?.config?.enabled===true&&wfEditorEditable(),control=input=>{input._trialSequenceLive=editable;input.disabled=!editable();s.trialSequenceControls.push(input);return input;};
 const changed=input=>{if(input.disabled||!editable())return;gpInvalidate('trial-challenge',false);wfInvalidateSettingPlans();$('gp-trial-challenge-hint').textContent='关卡序列草稿已改变，旧计划和授权失效；准备前将重新调查本副本。';};
 const end=control(gpEl('select'));end.dataset.trialSequenceEnd='true';const blank=gpEl('option','请选择明确的最后关卡');blank.value='';end.appendChild(blank);rows.forEach((row,i)=>{const option=gpEl('option','到第 '+row.stageLevel+' 关（ID '+row.stageId+'，共 '+(i+1)+' 关，开放等级 '+row.requiredLevel+'）');option.value=String(row.stageId);end.appendChild(option);});end.value='';end.onchange=()=>changed(end);section.appendChild(end);
 const duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='300';duration.dataset.trialSequenceDuration='true';duration.setAttribute('aria-label','有限首通总时长秒');duration.oninput=()=>changed(duration);duration.onchange=()=>changed(duration);section.appendChild(duration);
 const stages=()=>{const last=rows.findIndex(row=>String(row.stageId)===end.value);return last<0?[]:rows.slice(0,last+1).map(row=>row.stageId);},prepare=control(gpEl('button','准备原Workflow有限首通'));prepare.type='button';prepare.dataset.trialSequencePrepare='true';section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(!editable())return;const stageIds=stages(),text=duration.value,seconds=Number(text);if(!stageIds.length||stageIds.length>24||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-trial-challenge-hint').textContent='请明确最后关卡及1至86400秒总时长，序列从当前下一关开始且不超过24关。';return;}
  const payload={raidId:view.raid.raidId,stageIds,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('trial-sequence-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(stageIds),config=s.data.config;
  const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&duration.value===text&&JSON.stringify(stages())===choice;
  s.plan=null;s.selected.clear();gpClear($('gp-trial-challenge-plan-view'));s.pending=true;gpControls('trial-challenge');
  try{const data=await operationMutation('/api/gameplay/trial/prepare',payload,requestScope);if(!active())return;editor.accept(gpTrialWorkflowGraph(data,payload,view,requestScope.account));$('wf-hint').textContent='已载入明确试炼关卡序列；每关重新调查、单次授权并独立确认，未确认首通、拒绝或UNKNOWN停止。';$('gp-trial-challenge-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-trial-challenge-hint').textContent=error.message;}finally{if(gpGet('trial-challenge')===s&&s.revision===edit){s.pending=false;gpControls('trial-challenge');}}
 };section.appendChild(gpEl('p','仅明确副本连续配置关卡，每关必须仍是当前下一关并独立确认首通。完整库存与英雄/扫荡次数沿原合同核验；不预测胜负、无自动重试，不含扫荡或购买，预期奖励不扩预算，重启只读。'));
}


function gpDailyRewardWorkflowGraph(data,payload,view,accountId){
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item),same=(a,b)=>canonical(a)===canonical(b),graph=data.graph;
 if(data.accountId!==accountId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||data.expectedResetTime!==payload.expectedResetTime||view.dailyClosing?.expectedResetTime!==payload.expectedResetTime||data.maxDurationMs!==payload.maxDurationMs||!same(data.taskIds,payload.taskIds)||!same(data.tierIds,payload.tierIds))throw Error('日常收尾账号、原周期、目标或时长不匹配');
 const targets=[...payload.taskIds.map(taskId=>({kind:'daily',taskId,expectedResetTime:payload.expectedResetTime})),...payload.tierIds.map(tierId=>({kind:'daily-activity',tierId,expectedResetTime:payload.expectedResetTime}))],nodes=[{id:'start',type:'START'}],claims=[];
 if(!Array.isArray(data.steps)||data.steps.length!==targets.length)throw Error('日常收尾步骤数量不匹配');
 targets.forEach((parameters,i)=>{const source=view.dailyClosing.targets.find(row=>same(row.parameters,parameters)),step=data.steps[i];
  if(!source?.executable||!same(step?.parameters,parameters)||!same(step?.selection,{unique:true})||!same(step?.costs,[])||!same(step?.rewards,source.rewards)||step?.activityGain!==source.activityGain||!same(step?.budgetClaims,source.budgetClaims))throw Error('日常收尾原资格、配置奖励或逐目标预算已变化');
  claims.push(source.budgetClaims);nodes.push({id:'reward-'+i,type:'ACTION',module:'task-rewards',parameters,selection:{unique:true}},{id:'verify-'+i,type:'VERIFY',module:'task-rewards'});
 });nodes.push({id:'stop',type:'STOP'});const budget={resources:[],quotas:[],uids:claims.flatMap(row=>row.uids)};
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:targets.length,modules:['task-rewards']}))throw Error('日常逐项验证、有限上限或父UID预算不匹配');return graph;
}
function gpRenderDailyRewardClosing(box,view){
 const id='task-rewards',s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-'+id+'-parameters').value,section=gpEl('div'),closing=view?.dailyClosing;s.dailyClosingControls=[];
 if(!closing||closing.status!=='OBSERVED')return;box.appendChild(section);section.appendChild(gpEl('h4','同周期明确日常奖励收尾'));
 const targets=closing.targets||[],live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&$('gp-'+id+'-parameters').value===source,editable=()=>live()&&gpDomainSelectable(id)&&!s.targetDraftPending&&s.data?.config?.enabled===true&&wfEditorEditable();
 const control=(input,eligible=true)=>{input._dailyClosingLive=()=>editable()&&eligible;input.disabled=!input._dailyClosingLive();s.dailyClosingControls.push(input);return input;},changed=input=>{if(input.disabled||!editable())return;gpInvalidate(id,false);wfInvalidateSettingPlans();$('gp-'+id+'-hint').textContent='收尾目标或时长草稿已改变，旧计划和授权失效；准备时重新调查原周期和资格。';};
 const checks=targets.map(row=>{const check=control(gpEl('input'),row.executable===true);check.type='checkbox';check.checked=false;check.dataset.dailyClosingTarget=row.parameters.kind+':'+(row.parameters.taskId??row.parameters.tierId);check.onchange=()=>changed(check);const label=gpEl('label',(row.parameters.kind==='daily'?'任务 ':'日活跃档位 ')+(row.parameters.taskId??row.parameters.tierId??row.parameters.packId)+' · '+operationCosts(row.rewards)+' · '+(row.executable?'当前资格已确认':row.blockedReason||'未知')+' ');label.appendChild(check);section.appendChild(label);return {check,row};});
 const chosen=()=>{const rows=checks.filter(({check})=>check.checked).map(({row})=>row.parameters);return {taskIds:rows.filter(row=>row.kind==='daily').map(row=>row.taskId),tierIds:rows.filter(row=>row.kind==='daily-activity').map(row=>row.tierId)};};
 const duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='300';duration.dataset.dailyClosingDuration='true';duration.setAttribute('aria-label','日常收尾总时长秒');duration.oninput=()=>changed(duration);duration.onchange=()=>changed(duration);section.appendChild(duration);
 const addGroup=control(gpEl('button','将勾选日常来源加入跨来源清单'),targets.some(row=>row.executable===true));addGroup.type='button';addGroup.dataset.dailyRewardGroupAdd='true';section.appendChild(addGroup);
 addGroup.onclick=()=>{if(!editable())return;const selected=checks.filter(({check})=>check.checked).map(({row})=>row.parameters);gpAddTaskRewardGroup(selected,{rewardClosing:closing});};
 const prepare=control(gpEl('button','准备原Workflow逐项收尾'),targets.some(row=>row.executable===true));prepare.type='button';prepare.dataset.dailyClosingPrepare='true';section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(!editable())return;const selected=chosen(),text=duration.value,seconds=Number(text),count=selected.taskIds.length+selected.tierIds.length;
  if(count<1||count>24||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-'+id+'-hint').textContent='请选择1至24个明确目标及1至86400秒时长；未达标或未知目标不能加入。';return;}
  const payload={expectedResetTime:closing.expectedResetTime,...selected,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('daily-rewards-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(selected),config=s.data.config;
  const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&duration.value===text&&JSON.stringify(chosen())===choice;
  s.plan=null;s.selected.clear();gpClear($('gp-'+id+'-plan-view'));s.pending=true;gpControls(id);
  try{const data=await operationMutation('/api/gameplay/task-rewards/prepare',payload,requestScope);if(!active())return;editor.accept(gpDailyRewardWorkflowGraph(data,payload,view,requestScope.account));$('wf-hint').textContent='已载入同周期明确奖励收尾；逐任务后逐日活跃档位，每步重新调查、单次授权并验证。';$('gp-'+id+'-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-'+id+'-hint').textContent=error.message;}finally{if(gpGet(id)===s&&s.revision===edit){s.pending=false;gpControls(id);}}
 };section.appendChild(gpEl('p','不默认选择。仅当前已合格的任务和日活跃档位；本次服务器重置标记 '+closing.expectedResetTime+' 固定，不推断周界或未来活跃资格。每项独立确认后继续，周期变化、拒绝或UNKNOWN停止，不重领、不打开所得包，收入不扩预算。'));
}

function gpRenderMailBatch(box,view){
 const s=gpGet('mail'),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-mail-parameters').value,section=gpEl('div'),targets=view?.mailPreparation||[];s.mailBatchControls=[];box.appendChild(section);section.appendChild(gpEl('h4','明确同页多封读领'));
 if(!targets.length){section.appendChild(gpEl('p','请读取指定单页；只列出本页有完整普通附件或完整空附件合同的明确未处理邮件，未知及实例附件不产生组合目标。'));return;}
 const live=()=>gpSafe(scope,revision)&&gpGet('mail')===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&$('gp-mail-parameters').value===source,editable=()=>live()&&gpDomainSelectable('mail')&&!s.targetDraftPending&&s.data?.config?.enabled===true&&wfEditorEditable();
 const control=input=>{input._mailBatchLive=editable;input.disabled=!editable();s.mailBatchControls.push(input);return input;},changed=input=>{if(input.disabled||!editable())return;gpInvalidate('mail',false);wfInvalidateSettingPlans();$('gp-mail-hint').textContent='邮件组合草稿已改变，旧计划和授权失效；重新准备会重新读取所选页。';};
 const checks=targets.map(row=>{const check=control(gpEl('input'));check.type='checkbox';check.checked=false;check.dataset.mailBatchTarget=row.emailId;check.onchange=()=>changed(check);const label=gpEl('label',(row.action==='read'?'空附件标记已读 ':'普通附件领取 ')+row.emailId+' · '+(row.subject||'无主题')+' · '+(row.rewards.map(item=>item.id+' × '+item.num).join('；')||'库存不变')+' ');label.appendChild(check);section.appendChild(label);return {check,row};});
 const duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='300';duration.dataset.mailBatchDuration='true';duration.setAttribute('aria-label','邮件组合总时长秒');duration.oninput=()=>changed(duration);duration.onchange=()=>changed(duration);section.appendChild(duration);
 const chosen=()=>checks.filter(({check})=>check.checked).map(({row})=>({action:row.action,emailId:row.emailId,expectedMailHash:row.expectedMailHash})),prepare=control(gpEl('button','准备原Workflow逐封读领'));prepare.type='button';prepare.dataset.mailBatchPrepare='true';section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(!editable())return;const mails=chosen(),text=duration.value,seconds=Number(text),pageNo=view.page?.pageNo;
  if(!mails.length||mails.length>10||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-mail-hint').textContent='请明确选择本页1至10封邮件及1至86400秒总时长。';return;}
  const payload={pageNo,mails,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('mail-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(mails),config=s.data.config;
  const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&duration.value===text&&JSON.stringify(chosen())===choice;
  s.plan=null;s.selected.clear();gpClear($('gp-mail-plan-view'));s.pending=true;gpControls('mail');
  try{const data=await operationMutation('/api/gameplay/mail/prepare',payload,requestScope);if(!active())return;editor.accept(gpMailWorkflowGraph(data,payload,view,requestScope.account));$('wf-hint').textContent='已载入明确邮件逐封读领；每封独立调查、单次授权并验证，拒绝或UNKNOWN停止。';$('gp-mail-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-mail-hint').textContent=error.message;}finally{if(gpGet('mail')===s&&s.revision===edit){s.pending=false;gpControls('mail');}}
 };section.appendChild(gpEl('p','不默认选择、不使用all=true；同页最多10封，每封只发送原单封请求。准备重新读取本页，每封执行仍重新读取邮件及完整库存；状态变化、拒绝或UNKNOWN停止。实例附件继续冻结，不删除邮件。'));
}

function gpTradeSaleWorkflowGraph(data,payload,view,accountId,buy=false){
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item),same=(a,b)=>canonical(a)===canonical(b),graph=data.graph,targets=buy?payload.buys:payload.sales;
 if(data.accountId!==accountId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||data.cityId!==payload.cityId||view.cargo?.cityId!==payload.cityId||data.expectedPeriod!==payload.expectedPeriod||view.period!==payload.expectedPeriod||data.maxDurationMs!==payload.maxDurationMs||!same(buy?data.buys:data.sales,targets)||!Array.isArray(data.steps)||data.steps.length!==targets.length)throw Error('买卖组合账号、港口、周期、目标或时长不匹配');
 const nodes=[{id:'start',type:'START'}],claims=[],totals=new Map();let capacity=0;targets.forEach((target,i)=>{
  const parameters={action:buy?'buy':'sell',cityId:payload.cityId,expectedPeriod:payload.expectedPeriod,...target},source=buy?view.buyPreparation?.find(row=>row.goodsId===target.goodsId&&row.expectedPeriod===payload.expectedPeriod&&row.cityId===payload.cityId&&row.expectedBuyHash===target.expectedBuyHash):view.salePreparation?.find(row=>same(row.parameters,parameters)),step=data.steps[i];let costs=[],budgetClaims,quote;
  if(!source)throw Error('买卖原目标或报价身份已变化');
  if(buy){const total=source.price*target.num,used=source.unitCapacity*target.num,maxBuy=Math.min(source.maxCount-source.stock,Math.floor(view.capacity.remaining/source.unitCapacity),Math.floor(view.balances.coins/source.price));if(!Number.isSafeInteger(total)||total<1||total>2147483647||!Number.isSafeInteger(used)||used<1||!Number.isSafeInteger(capacity+used)||target.num>maxBuy||step?.capacityUsed!==used)throw Error('买入明确数量、原成本或仓位不匹配');capacity+=used;costs=[{id:'TRADE_COINS:'+payload.expectedPeriod,num:total}];quote={price:source.price,total,maxBuy};budgetClaims={resources:costs,quotas:[{id:'trade:'+payload.expectedPeriod+':market:'+payload.cityId+':'+target.goodsId,num:target.num}],uids:[{type:'trade-market',id:payload.expectedPeriod+':'+payload.cityId+':'+target.goodsId}]};}
  else{quote=source.quote;budgetClaims={resources:[],quotas:[{id:'trade:'+payload.expectedPeriod+':holding:'+target.pid,num:target.num}],uids:[{type:'trade-holding',id:payload.expectedPeriod+':'+target.pid}]};}
  if(!same(step?.parameters,parameters)||!same(step?.selection,{unique:true})||!same(step?.quote,quote)||!same(step?.costs,costs)||!same(step?.budgetClaims,budgetClaims))throw Error('买卖原目标、明确数量、报价或预算已变化');
  for(const cost of costs){const total=(totals.get(cost.id)??0)+cost.num;if(!Number.isSafeInteger(total))throw Error('累计贸易币支出无效');totals.set(cost.id,total);}claims.push(budgetClaims);nodes.push({id:(buy?'buy-':'sale-')+i,type:'ACTION',module:'trade',parameters,selection:{unique:true}},{id:'verify-'+i,type:'VERIFY',module:'trade'});
 });nodes.push({id:'stop',type:'STOP'});const budget={resources:[...totals].map(([id,num])=>({id,num})),quotas:claims.flatMap(row=>row.quotas),uids:claims.flatMap(row=>row.uids)};
 if(buy&&(data.capacityUsed!==capacity||capacity>view.capacity.remaining||[...totals.values()].some(num=>num>view.balances.coins)))throw Error('累计买入超过原自有贸易币或仓位');
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:targets.length,modules:['trade']}))throw Error('买卖逐项验证、有限上限或原父预算不匹配');return graph;
}
function gpRenderTradeSaleBatch(box,view,buy=false){
 const id='trade',s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-'+id+'-parameters').value,section=gpEl('div'),targets=(buy?view?.buyPreparation:view?.salePreparation)||[],kind=buy?'tradeBuyBatch':'tradeSaleBatch';if(!buy)s.tradeSaleBatchControls=[];box.appendChild(section);section.appendChild(gpEl('h4',buy?'当前港口明确多货物买入':'当前港口明确多批全量出售'));
 if(!targets.length){section.appendChild(gpEl('p',buy?'先观察当前港口；仅原货物、价格、市场原值及配置可靠时列出目标；须明确每种数量，列表不授予资格。':'先观察当前港口；仅原非亏损全批报价和原周期身份可靠时列出持货目标，目标列表不代表当前可执行。'));return;}
 const live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&$('gp-'+id+'-parameters').value===source,editable=()=>live()&&gpDomainSelectable(id)&&!s.targetDraftPending&&s.data?.config?.enabled===true&&wfEditorEditable();
 const control=input=>{input._tradeSaleBatchLive=editable;input.disabled=!editable();s.tradeSaleBatchControls.push(input);return input;},changed=input=>{if(input.disabled||!editable())return;gpInvalidate(id,false);wfInvalidateSettingPlans();$('gp-'+id+'-hint').textContent='买卖目标、数量或时长草稿已改变，旧计划和授权失效；准备时重新调查当前港口与资格。';};
 const checks=targets.map(row=>{const check=control(gpEl('input'));check.type='checkbox';check.checked=false;check.dataset[kind+'Target']=String(buy?row.goodsId:row.parameters.pid);check.onchange=()=>changed(check);const label=gpEl('label',buy?'货物 '+row.goodsId+' · 原单价 '+row.price+' · 单位仓位 '+row.unitCapacity+' · 本次数量 ':'持货 '+row.parameters.pid+' × '+row.parameters.num+' · 原报价 '+row.quote.total+' · 预计利润 '+row.quote.profit+' ');label.appendChild(check);let quantity=null;if(buy){quantity=control(gpEl('input'));quantity.type='number';quantity.min='1';quantity.max='2147483647';quantity.step='1';quantity.value='';quantity.dataset.tradeBuyBatchQuantity=String(row.goodsId);quantity.setAttribute('aria-label','货物 '+row.goodsId+' 明确买入数量');quantity.oninput=()=>changed(quantity);quantity.onchange=()=>changed(quantity);label.appendChild(quantity);}section.appendChild(label);return {check,row,quantity};});
 const duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='300';duration.dataset[kind+'Duration']='true';duration.setAttribute('aria-label',buy?'逐货物买入总时长秒':'逐批出售总时长秒');duration.oninput=()=>changed(duration);duration.onchange=()=>changed(duration);section.appendChild(duration);
 const chosen=()=>checks.filter(({check})=>check.checked).map(({row,quantity})=>buy?{goodsId:row.goodsId,num:Number(quantity.value),expectedBuyHash:row.expectedBuyHash}:{pid:row.parameters.pid,num:row.parameters.num,expectedSaleHash:row.parameters.expectedSaleHash}),prepare=control(gpEl('button',buy?'准备原Workflow逐货物买入':'准备原Workflow逐批出售'));prepare.type='button';prepare.dataset[kind+'Prepare']='true';section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(!editable())return;const selected=chosen(),text=duration.value,seconds=Number(text);if(!selected.length||selected.length>24||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400||buy&&checks.some(({check,quantity})=>check.checked&&(!/^[1-9][0-9]*$/.test(quantity.value)||!Number.isInteger(Number(quantity.value))||Number(quantity.value)>2147483647))){$('gp-'+id+'-hint').textContent=buy?'请明确选择1至24种不同货物、每种正int32数量及1至86400秒总时长。':'请明确选择1至24批持货及1至86400秒总时长；每批固定原完整数量。';return;}
  const payload={cityId:view.cargo.cityId,expectedPeriod:view.period,[buy?'buys':'sales']:selected,maxDurationMs:seconds*1000},requestScope=viewGuard.begin(buy?'trade-buys-prepare':'trade-sales-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(selected),config=s.data.config,editorDraft=$('wf-json').value;
  const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&duration.value===text&&JSON.stringify(chosen())===choice;
  s.plan=null;s.selected.clear();gpClear($('gp-'+id+'-plan-view'));s.pending=true;gpControls(id);
  try{const data=await operationMutation('/api/gameplay/trade/'+(buy?'buy':'sale')+'/prepare',payload,requestScope);if(!active())return;editor.accept(gpTradeSaleWorkflowGraph(data,payload,view,requestScope.account,buy));$('wf-hint').textContent=buy?'已载入当前港口明确买入图；每种重新调查、单次授权及原typed/独立完整结算验证。':'已载入当前港口明确持货出售图；每批重新调查、单次授权并独立确认，拒绝或UNKNOWN停止。';$('gp-'+id+'-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-'+id+'-hint').textContent=error.message;}finally{if(gpGet(id)===s&&s.revision===edit){s.pending=false;gpControls(id);}}
 };section.appendChild(gpEl('p',buy?'默认不选、不填数量；每种货物只买一次，原计划器累计核全部初始自有贸易币及仓位。固定原周期、航次、所选市场报价与配置；每种仍须当前资格、原单次授权及精确扣币/唯一持货增加验证，不借预计卖出扩预算，不移动、出售、补购或重放。':'不默认选择。固定原周期、航次、PID、全批数量、报价与配置；每批仍须当前资格。预计收入不扩预算，不自动买入、移动或重发，原单次部分出售继续可用。'));
}

function gpTaskRewardClosingGraph(data,payload,view,accountId){
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item),same=(a,b)=>canonical(a)===canonical(b),graph=data.graph;
 if(payload.groups){
  if(data.accountId!==accountId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||data.maxDurationMs!==payload.maxDurationMs||!same(data.groups,payload.groups)||!Array.isArray(data.parts)||data.parts.length!==payload.groups.length||view.groupViews?.length!==payload.groups.length)throw Error('跨来源收尾账号、分组或时长不匹配');
  const steps=[],claims=[];payload.groups.forEach((targets,i)=>{const part=data.parts[i];gpTaskRewardClosingGraph({...part,accountId},{targets,maxDurationMs:payload.maxDurationMs},view.groupViews[i],accountId);steps.push(...part.steps);claims.push(...part.budget.uids);});
  const nodes=[{id:'start',type:'START'}];steps.forEach((step,i)=>nodes.push({id:'reward-'+i,type:'ACTION',module:'task-rewards',parameters:step.parameters,selection:step.selection},{id:'verify-'+i,type:'VERIFY',module:'task-rewards'}));nodes.push({id:'stop',type:'STOP'});
  const budget={resources:[],quotas:[],uids:claims};
  if(steps.length<1||steps.length>24||!same(data.steps,steps)||graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:steps.length,modules:['task-rewards']}))throw Error('跨来源逐项验证、原父UID或有限上限不匹配');return graph;
 }
 if(data.accountId!==accountId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||data.maxDurationMs!==payload.maxDurationMs||!same(data.targets,payload.targets)||!Array.isArray(data.steps)||data.steps.length!==payload.targets.length)throw Error('任务收尾账号、目标或时长不匹配');
 if(payload.targets[0]?.kind==='weekly-chip-task'&&(view.rewardClosing?.status!=='OBSERVED'||view.rewardClosing?.round!==payload.targets[0].round||!Number.isSafeInteger(view.rewardClosing.maximumClaims)||payload.targets.length>view.rewardClosing.maximumClaims))throw Error('周芯片组合必须保留未领任务且同原轮次，不能跨轮收尾');
 const nodes=[{id:'start',type:'START'}],claims=[];payload.targets.forEach((parameters,i)=>{const source=view.rewardClosing?.targets?.find(row=>same(row.parameters,parameters)),step=data.steps[i];
  if(!source?.executable||!same(step?.parameters,parameters)||!same(step?.selection,{unique:true})||!same(step?.rewards,source.rewards)||!same(step?.costs,[])||!same(step?.budgetClaims,source.budgetClaims))throw Error('任务收尾原目标、当前资格、奖励或预算已变化');
  claims.push(source.budgetClaims);nodes.push({id:'reward-'+i,type:'ACTION',module:'task-rewards',parameters,selection:{unique:true}},{id:'verify-'+i,type:'VERIFY',module:'task-rewards'});
 });nodes.push({id:'stop',type:'STOP'});const budget={resources:[],quotas:[],uids:claims.flatMap(row=>row.uids)};
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.targets.length,modules:['task-rewards']}))throw Error('任务逐项验证、有限上限或原父UID预算不匹配');return graph;
}
function gpAddTaskRewardGroup(selected,view){
 const id='task-rewards',s=gpGet(id);if(!gpDomainSelectable(id)||!wfEditorEditable())return;
 const groups=s.taskRewardGroups??[],key=p=>['main','branch'].includes(p.kind)?'tasks':['daily','daily-activity'].includes(p.kind)?'daily':p.kind;
 if(!selected.length||groups.some(g=>key(g.targets[0])===key(selected[0]))||groups.reduce((n,g)=>n+g.targets.length,0)+selected.length>24||selected[0]?.kind==='weekly-chip-task'&&(!Number.isSafeInteger(view.rewardClosing.maximumClaims)||selected.length>view.rewardClosing.maximumClaims)){$('gp-'+id+'-hint').textContent='请勾选当前合格任务或免费礼包，每个原来源仅一个分组，共最多24项；日常固定原重置标记，周芯片保留末个未领任务。';return;}
 s.taskRewardGroups=[...groups,{targets:JSON.parse(JSON.stringify(selected)),view:{rewardClosing:JSON.parse(JSON.stringify(view.rewardClosing))}}];gpInvalidate(id,false);wfInvalidateSettingPlans();gpRender(id,s.data,s.scope);$('gp-'+id+'-hint').textContent='已加入明确目标草稿；可切换来源继续添加。准备时各来源重新调查，当前未授权或领取。';
}
function gpRenderTaskRewardGroups(box){
 const id='task-rewards',s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,view=s.data?.view,source=$('gp-'+id+'-parameters').value,section=gpEl('div'),groups=s.taskRewardGroups??[];box.appendChild(section);section.appendChild(gpEl('h4','跨来源任务奖励清单'));
 const live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&$('gp-'+id+'-parameters').value===source;
 const editable=()=>live()&&gpDomainSelectable(id)&&!s.targetDraftPending&&s.data?.config?.enabled===true&&wfEditorEditable();
 const control=input=>{input._taskRewardClosingLive=editable;input.disabled=!editable();s.taskRewardClosingControls.push(input);return input;};
 const redraw=()=>{gpInvalidate(id,false);wfInvalidateSettingPlans();gpRender(id,s.data,s.scope);};
 groups.forEach((group,index)=>{const card=gpEl('div');card.appendChild(gpEl('p','第 '+(index+1)+' 组：'+group.targets.map(p=>p.kind+' '+(p.taskId??p.tierId??p.packId)).join('、')));for(const [label,offset]of [['上移',-1],['下移',1],['移除',0]]){const button=control(gpEl('button',label));button.type='button';button.dataset.taskRewardGroupEdit=index+':'+offset;button.onclick=()=>{if(!editable()||s.taskRewardGroups!==groups)return;if(offset===0)groups.splice(index,1);else{const to=index+offset;if(to<0||to>=groups.length)return;[groups[index],groups[to]]=[groups[to],groups[index]];}redraw();};card.appendChild(button);}section.appendChild(card);});
 section.appendChild(gpEl('p',groups.length?'共 '+groups.reduce((n,g)=>n+g.targets.length,0)+' 项。保存的是明确目标草稿；准备时各来源重新调查，不保留资格或许可。':'在原主支线、成就、日常/日活跃、日赠礼、周免费礼包、周芯片或开服任务中明确勾选，再加入清单。共最多24项，不默认选择。'));
 const duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value=s.taskRewardGroupDuration??'300';duration.dataset.taskRewardGroupsDuration='true';duration.setAttribute('aria-label','跨来源任务奖励总时长秒');duration.oninput=()=>{if(!editable())return;s.taskRewardGroupDuration=duration.value;gpInvalidate(id,false);wfInvalidateSettingPlans();};section.appendChild(duration);
 const prepare=control(gpEl('button','准备原Workflow跨来源逐项领奖'));prepare.type='button';prepare.dataset.taskRewardGroupsPrepare='true';section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(!editable()||s.taskRewardGroups!==groups)return;const text=duration.value,seconds=Number(text);
  if(!groups.length||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-'+id+'-hint').textContent='请明确加入任务来源分组及1至86400秒总时长。';return;}
  const payload={groups:groups.map(g=>g.targets),maxDurationMs:seconds*1000},expected={groupViews:groups.map(g=>g.view)},requestScope=viewGuard.begin('task-rewards-groups-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=gpJson(groups),editorDraft=$('wf-json').value,config=s.data.config;
  const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&gpJson(s.taskRewardGroups)===choice&&duration.value===text;
  s.plan=null;s.selected.clear();gpClear($('gp-'+id+'-plan-view'));s.pending=true;gpControls(id);
  try{const data=await operationMutation('/api/gameplay/task-rewards/closing/prepare',payload,requestScope);if(!active())return;editor.accept(gpTaskRewardClosingGraph(data,payload,expected,requestScope.account));$('wf-hint').textContent='已载入明确跨来源任务清单；各项仍重新调查并单独授权，拒绝或UNKNOWN停止。';$('gp-'+id+'-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-'+id+'-hint').textContent=error.message;}finally{if(gpGet(id)===s&&s.revision===edit){s.pending=false;gpControls(id);}}
 };
}
function gpRenderTaskRewardClosing(box,view){
 const id='task-rewards',s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-'+id+'-parameters').value,targets=view?.rewardClosing?.targets,section=gpEl('div');s.taskRewardClosingControls=[];gpRenderTaskRewardGroups(box);if(!Array.isArray(targets)||!targets.length)return;box.appendChild(section);section.appendChild(gpEl('h4',targets[0].parameters.packId?'明确免费礼包收尾':targets[0].parameters.kind.startsWith('open-rank-')?'明确同模式开服任务逐档收尾':targets[0].parameters.kind==='weekly-chip-task'?'明确同轮周芯片任务收尾':targets[0].parameters.kind==='achievement'?'明确当前成就奖励收尾':'明确当前主支线奖励收尾'));
 const live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&$('gp-'+id+'-parameters').value===source,editable=()=>live()&&gpDomainSelectable(id)&&!s.targetDraftPending&&s.data?.config?.enabled===true&&wfEditorEditable();
 const control=(input,eligible=true)=>{input._taskRewardClosingLive=()=>editable()&&eligible;input.disabled=!input._taskRewardClosingLive();s.taskRewardClosingControls.push(input);return input;},changed=input=>{if(input.disabled||!editable())return;gpInvalidate(id,false);wfInvalidateSettingPlans();$('gp-'+id+'-hint').textContent='任务收尾目标或时长已编辑，旧计划和授权失效；准备时重新调查原任务来源。';};
 const checks=targets.map(row=>{const check=control(gpEl('input'),row.executable===true);check.type='checkbox';check.checked=false;check.dataset.taskRewardClosingTarget=row.parameters.kind+':'+(row.parameters.taskId??row.parameters.tierId??row.parameters.packId);check.onchange=()=>changed(check);const label=gpEl('label',({main:'主线',branch:'支线',achievement:'成就','daily-gift':'日免费赠礼','weekly-lottery-gift':'周转盘免费礼包','weekly-unique-lottery-gift':'周翻牌免费礼包','weekly-chip-gift':'周芯片免费礼包','weekly-chip-task':'周芯片第'+row.parameters.round+'轮任务','open-rank-order':'开服订单','open-rank-stage':'开服闯关','open-rank-pirate':'开服剿匪','open-rank-war':'开服战争'}[row.parameters.kind]||'未知')+' '+(row.parameters.taskId??row.parameters.tierId)+' · '+operationCosts(row.rewards)+' · '+(row.executable?'当前资格已确认':row.blockedReason||'未知')+' ');label.appendChild(check);section.appendChild(label);return {check,row};});
 const chosen=()=>checks.filter(({check})=>check.checked).map(({row})=>row.parameters),duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='300';duration.dataset.taskRewardClosingDuration='true';duration.setAttribute('aria-label','任务收尾总时长秒');duration.oninput=()=>changed(duration);duration.onchange=()=>changed(duration);section.appendChild(duration);
 const addGroup=control(gpEl('button','将勾选来源加入跨来源清单'),targets.some(row=>row.executable===true));addGroup.type='button';addGroup.dataset.taskRewardGroupAdd='true';section.appendChild(addGroup);
 addGroup.onclick=()=>{
  if(!editable())return;gpAddTaskRewardGroup(chosen(),view);
 };
 const prepare=control(gpEl('button','准备原Workflow逐任务收尾'),targets.some(row=>row.executable===true));prepare.type='button';prepare.dataset.taskRewardClosingPrepare='true';section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(!editable())return;const selected=chosen(),text=duration.value,seconds=Number(text);if(!selected.length||selected.length>24||selected[0]?.kind==='weekly-chip-task'&&(!Number.isSafeInteger(view.rewardClosing.maximumClaims)||selected.length>view.rewardClosing.maximumClaims)||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-'+id+'-hint').textContent='请明确选择1至24个同源当前合格任务及1至86400秒总时长；周芯片同轮须至少留一项未领，末任务跨轮仍阻断。';return;}
  const payload={targets:selected,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('task-rewards-closing-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(selected),config=s.data.config,editorDraft=$('wf-json').value;
  const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&duration.value===text&&JSON.stringify(chosen())===choice;
  s.plan=null;s.selected.clear();gpClear($('gp-'+id+'-plan-view'));s.pending=true;gpControls(id);
  try{const data=await operationMutation('/api/gameplay/task-rewards/closing/prepare',payload,requestScope);if(!active())return;editor.accept(gpTaskRewardClosingGraph(data,payload,view,requestScope.account));$('wf-hint').textContent='已载入明确当前任务奖励图；每项重新调查、单次授权及完整净入验证，不追加未来任务。';$('gp-'+id+'-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-'+id+'-hint').textContent=error.message;}finally{if(gpGet(id)===s&&s.revision===edit){s.pending=false;gpControls(id);}}
 };section.appendChild(gpEl('p',targets[0].parameters.packId?'不默认选择；仅原已证的免费礼包领取，准备时重新调查原领取列表、活动窗口和完整库存。每次重新授权并验证，变化、拒绝或UNKNOWN停止；不购买、不开包、不推算跨周期重领。':targets[0].parameters.kind==='weekly-chip-task'?'不默认选择。同轮最多领取 '+String(view.rewardClosing.maximumClaims??'UNKNOWN')+' 项并保留末个未领任务；原活动窗口/轮次/任务UID父预算固定。每项原typed回执及完整库存独立验证；跨轮、变化、拒绝或UNKNOWN停止，不开箱或推定到账，不追加未来任务，收入不扩父预算。':targets[0].parameters.kind.startsWith('open-rank-')?'不默认选择；只取同一开服模式当前合格score档位，不混入排名奖励。每档复用原请求、私有窗口、世界赛季/配置和完整库存净入验证；窗口/资格变化、拒绝或UNKNOWN停止，原父UID预算固定，不追加未来档位或以收入扩预算。':'不默认选择。主支与成就来源保持分离，不把完成当可领或到账。原精确任务与完整库存验证逐项确认；主线前移、未知或拒绝停止，不重领、不追加后续任务，收入不扩父预算；日常及赛季活动保留原入口。'));
}

function gpProductionStartGraph(data,payload,view,accountId){
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item),same=(a,b)=>canonical(a)===canonical(b),graph=data.graph;
 if(data.accountId!==accountId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||data.maxDurationMs!==payload.maxDurationMs||!same(data.targets,payload.targets)||!Array.isArray(data.steps)||data.steps.length!==payload.targets.length)throw Error('生产组合账号、工厂配方、顺序或时长不匹配');
 const nodes=[{id:'start',type:'START'}],totals=new Map();payload.targets.forEach((parameters,i)=>{const sources=view.startPreparation?.filter(row=>same(row.parameters,parameters)),source=sources?.length===1?sources[0]:null,step=data.steps[i];
  if(!source?.executable||!same(step?.parameters,parameters)||!same(step?.selection,{unique:true})||!same(step?.costs,source.costs)||!Array.isArray(source.costs))throw Error('生产组合原工厂配方或单份材料成本已变化');
  for(const cost of source.costs){const num=(totals.get(cost.id)??0)+cost.num;if(!Number.isSafeInteger(cost.num)||cost.num<0||!Number.isSafeInteger(num))throw Error('原生产累计成本无效');totals.set(cost.id,num);}
  nodes.push({id:'produce-'+i,type:'ACTION',module:'production',parameters,selection:{unique:true}},{id:'verify-'+i,type:'VERIFY',module:'production'});
 });nodes.push({id:'stop',type:'STOP'});const budget={resources:[...totals].filter(([,num])=>num>0).map(([id,num])=>({id,num})),quotas:[],uids:[]};
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.targets.length,modules:['production']}))throw Error('生产逐厂验证、有限上限或原累计资源预算不匹配');return graph;
}
function gpRenderProductionStarts(box,view){
 const id='production',s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-'+id+'-parameters').value,rows=view?.startPreparation||[],section=gpEl('div');s.productionStartControls=[];box.appendChild(section);section.appendChild(gpEl('h4','明确多工厂各生产一份'));
 if(!rows.length){section.appendChild(gpEl('p','仅完整来源、当前自有材料及原生产资格可靠时列出配方；材料包固定来源保留原组合入口。'));return;}
 const live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&$('gp-'+id+'-parameters').value===source,editable=()=>live()&&gpDomainSelectable(id)&&!s.targetDraftPending&&s.data?.config?.enabled===true&&wfEditorEditable(),control=input=>{input._productionStartLive=editable;input.disabled=!editable();s.productionStartControls.push(input);return input;};
 const changed=input=>{if(input.disabled||!editable())return;gpInvalidate(id,false);wfInvalidateSettingPlans();$('gp-'+id+'-hint').textContent='工厂配方或总时长已编辑，旧计划和授权失效；准备时重新调查并核对全部自有材料。';};
 const buildings=[...new Set(rows.map(row=>row.parameters.buildingId))],selects=buildings.map(buildingId=>{const select=control(gpEl('select')),label=gpEl('label',buildingId+' '),blank=gpEl('option','不选择本工厂');blank.value='';select.appendChild(blank);for(const row of rows.filter(row=>row.parameters.buildingId===buildingId)){const option=gpEl('option',row.parameters.productId+' × 1 · '+operationCosts(row.costs));option.value=row.parameters.productId;select.appendChild(option);}select.value='';select.dataset.productionStartBuilding=buildingId;select.onchange=()=>changed(select);label.appendChild(select);section.appendChild(label);return {buildingId,select};});
 const chosen=()=>selects.filter(({select})=>select.value).map(({buildingId,select})=>({buildingId,productId:select.value})),duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='300';duration.dataset.productionStartDuration='true';duration.setAttribute('aria-label','多工厂生产总时长秒');duration.oninput=()=>changed(duration);duration.onchange=()=>changed(duration);section.appendChild(duration);
 const prepare=control(gpEl('button','准备原Workflow逐厂单份生产'));prepare.type='button';prepare.dataset.productionStartPrepare='true';section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(!editable())return;const targets=chosen(),text=duration.value,seconds=Number(text);if(!targets.length||targets.length>24||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-'+id+'-hint').textContent='请选择1至24个不同工厂的明确配方及1至86400秒时长；每厂仅一份。';return;}
  const payload={targets,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('production-starts-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(targets),config=s.data.config,editorDraft=$('wf-json').value;
  const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&duration.value===text&&JSON.stringify(chosen())===choice;
  s.plan=null;s.selected.clear();gpClear($('gp-'+id+'-plan-view'));s.pending=true;gpControls(id);
  try{const data=await operationMutation('/api/gameplay/production/start/prepare',payload,requestScope);if(!active())return;editor.accept(gpProductionStartGraph(data,payload,view,requestScope.account));$('wf-hint').textContent='已载入明确多工厂单份生产图；每厂原调查、单次授权、精确扣料及队列新增验证后继续。';$('gp-'+id+'-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-'+id+'-hint').textContent=error.message;}finally{if(gpGet(id)===s&&s.revision===edit){s.pending=false;gpControls(id);}}
 };section.appendChild(gpEl('p','各厂默认不选，只使用当前自有材料；准备复用原计划器累计预留，不把单厂足料当作全部足料。固定工厂和产品，每步重新核队列、完整库存与资格；不自动领成品、重复排产、兑换、加速或补购，不推全天产量，UNKNOWN不重放。'));
}


function gpCityPreparationGraph(data,payload,view,accountId){
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item),same=(a,b)=>canonical(a)===canonical(b),graph=data.graph;
 if(data.accountId!==accountId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||data.maxDurationMs!==payload.maxDurationMs||!same(data.targets,payload.targets)||!Array.isArray(data.steps)||data.steps.length!==payload.targets.length)throw Error('城市操作账号、明确目标、顺序或时长不匹配');
 const nodes=[{id:'start',type:'START'}],totals=new Map();payload.targets.forEach((parameters,i)=>{
  const sources=view.preparation?.filter(row=>same(row.parameters,parameters)),source=sources?.length===1?sources[0]:null,step=data.steps[i];
  if(!source?.executable||!Array.isArray(source.costs)||!same(step?.parameters,parameters)||!same(step?.selection,{unique:true})||!same(step?.costs,source.costs)||!same(step?.beforeState,source.beforeState)||!same(step?.expectedState,source.expectedState))throw Error('城市原建筑状态、成本或预期变化不匹配');
  for(const cost of source.costs){const total=(totals.get(cost.id)||0)+cost.num;if(!Number.isSafeInteger(total)||total<0)throw Error('城市累计成本不可靠');totals.set(cost.id,total);}
  nodes.push({id:'city-'+i,type:'ACTION',module:'city',parameters,selection:{unique:true}},{id:'verify-'+i,type:'VERIFY',module:'city'});
 });nodes.push({id:'stop',type:'STOP'});const budget={resources:[...totals].filter(([,num])=>num>0).map(([id,num])=>({id,num})),quotas:[],uids:[]};
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.targets.length,modules:['city']}))throw Error('城市逐项验证、累计自有材料预算或有限上限不匹配');return graph;
}
function gpRenderCityPreparation(box,view){
 const id='city',s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-'+id+'-parameters').value,rows=view?.preparation||[],section=gpEl('div');s.cityPreparationControls=[];box.appendChild(section);section.appendChild(gpEl('h3','明确不同建筑逐项操作'));
 if(!rows.length){section.appendChild(gpEl('p','当前没有来源完整且原计划器允许的城市组合目标；请只读探测。'));return;}
 const live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&$('gp-'+id+'-parameters').value===source,editable=()=>live()&&gpDomainSelectable(id)&&!s.targetDraftPending&&s.data?.config?.enabled===true&&wfEditorEditable(),control=input=>{input._cityPreparationLive=editable;input.disabled=!editable();s.cityPreparationControls.push(input);return input;};
 const changed=input=>{if(input.disabled||!editable())return;gpInvalidate(id,false);wfInvalidateSettingPlans();$('gp-'+id+'-hint').textContent='城市目标或时长已编辑，旧计划失效；准备前重新核对原建筑状态及累计材料。';};
 const picks=rows.map(row=>{const label=gpEl('label',(row.label||row.parameters.action)+' · '+row.parameters.buildingId+' · '+operationCosts(row.costs)),input=control(gpEl('input'));input.type='checkbox';input.checked=false;input.dataset.cityPreparationTarget=row.actionId;input.onchange=()=>changed(input);label.appendChild(input);section.appendChild(label);gpDetails(section,'原状态与预期变化',{beforeState:row.beforeState,expectedState:row.expectedState});return {input,row};});
 const chosen=()=>picks.filter(pick=>pick.input.checked).map(pick=>pick.row.parameters),duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='';duration.dataset.cityPreparationDuration='true';duration.setAttribute('aria-label','城市组合总时长秒');duration.oninput=()=>changed(duration);duration.onchange=()=>changed(duration);section.appendChild(duration);
 const prepare=control(gpEl('button','准备原Workflow逐建筑操作'));prepare.type='button';prepare.dataset.cityPreparationPrepare='true';section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(!editable())return;const targets=chosen(),text=duration.value,seconds=Number(text);if(!targets.length||targets.length>24||new Set(targets.map(p=>p.buildingId)).size!==targets.length||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-'+id+'-hint').textContent='请选择1至24个不同建筑各一个当前动作及1至86400秒总时长。';return;}
  const payload={targets,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('city-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(targets),config=s.data.config,editorDraft=$('wf-json').value;
  const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&duration.value===text&&JSON.stringify(chosen())===choice;
  s.plan=null;s.selected.clear();gpClear($('gp-'+id+'-plan-view'));s.pending=true;gpControls(id);
  try{const data=await operationMutation('/api/gameplay/city/prepare',payload,requestScope);if(!active())return;editor.accept(gpCityPreparationGraph(data,payload,view,requestScope.account));$('wf-hint').textContent='已载入明确城市逐项操作图；每项重新调查、单次授权及原状态/库存结算验证。';$('gp-'+id+'-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-'+id+'-hint').textContent=error.message;}finally{if(gpGet(id)===s&&s.revision===edit){s.pending=false;gpControls(id);}}
 };section.appendChild(gpEl('p','默认不选择；每建筑仅一个当前动作，建造/单级升级/完工/普通产物收取/自有道具加速沿原合同。原人口、等级、建造位及库存上限逐项重核，拒绝或UNKNOWN停止。加速仅原精确数量自有加速器，不接受RUBY或广告；不等待未来资格、不补购或自动追加加速/重复领取，收入不扩累计预算，重启只读。'));
}

function gpProductionCollectionGraph(data,payload,view,accountId){
 const accelerate=payload.action==='speedUpProduce',canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item),same=(a,b)=>canonical(a)===canonical(b),graph=data.graph;
 if(data.accountId!==accountId||data.action!==payload.action||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||data.maxDurationMs!==payload.maxDurationMs||!same(data.targets,payload.targets)||!Array.isArray(data.steps)||data.steps.length!==payload.targets.length)throw Error('生产组合账号、原目标、顺序或时长不匹配');
 const nodes=[{id:'start',type:'START'}],totals=new Map();payload.targets.forEach((parameters,i)=>{
  const sources=(accelerate?view.accelerationPreparation:view.collectionPreparation)?.filter(row=>same(row.parameters,parameters)),source=sources?.length===1?sources[0]:null,step=data.steps[i],costs=accelerate?source?.costs:[];
  if(!source?.executable||!Array.isArray(costs)||!same(source.costs,costs)||!same(step?.parameters,parameters)||!same(step?.selection,{unique:true})||!same(step?.costs,costs)||(!accelerate&&!same(step?.products,source.products))||(accelerate&&(!same(step?.beforeState,source.beforeState)||!same(step?.expectedState,source.expectedState))))throw Error('生产原目标状态、成本或预期变化不匹配');
  for(const cost of costs){const total=(totals.get(cost.id)||0)+cost.num;if(!Number.isSafeInteger(cost.num)||cost.num<0||!Number.isSafeInteger(total))throw Error('加速原累计成本不可靠');totals.set(cost.id,total);}
  nodes.push({id:(accelerate?'accelerate-':'collect-')+i,type:'ACTION',module:'production',parameters,selection:{unique:true}},{id:'verify-'+i,type:'VERIFY',module:'production'});
 });nodes.push({id:'stop',type:'STOP'});const budget={resources:[...totals].filter(([,num])=>num>0).map(([id,num])=>({id,num})),quotas:[],uids:[]};
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.targets.length,modules:['production']}))throw Error('生产逐厂验证、有限上限或累计父预算不匹配');return graph;
}
function gpRenderProductionCollections(box,view,accelerate=false){
 const id='production',s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-'+id+'-parameters').value,rows=(accelerate?view?.accelerationPreparation:view?.collectionPreparation)||[],section=gpEl('div');const controls=accelerate?'productionAccelerationControls':'productionCollectionControls';s[controls]=[];box.appendChild(section);section.appendChild(gpEl('h4',accelerate?'明确多工厂当前队列道具加速':'明确多工厂当前成品领取'));
 if(!rows.length){section.appendChild(gpEl('p',accelerate?'当前没有来源完整、原计划器允许的生产队列道具加速目标。':'当前没有来源完整、原计划器允许领取的工厂成品。'));return;}
 const live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&$('gp-'+id+'-parameters').value===source,editable=()=>live()&&gpDomainSelectable(id)&&!s.targetDraftPending&&s.data?.config?.enabled===true&&wfEditorEditable(),control=input=>{input._productionStartLive=editable;input.disabled=!editable();s[controls].push(input);return input;};
 const changed=input=>{if(input.disabled||!editable())return;gpInvalidate(id,false);wfInvalidateSettingPlans();$('gp-'+id+'-hint').textContent=accelerate?'加速选择或时长已编辑，旧计划和授权失效；准备时重新核对原队列与精确道具数量。':'领取选择或时长已编辑，旧计划和授权失效；准备时重新核对原工厂成品和队列。';};
 const picks=rows.map(row=>{const label=gpEl('label',row.parameters.buildingId+(accelerate?' · 队列 '+row.parameters.index:'')+' · '+operationCosts(accelerate?row.costs:row.products)),input=control(gpEl('input'));input.type='checkbox';input.checked=false;input.dataset[accelerate?'productionAccelerationBuilding':'productionCollectionBuilding']=row.parameters.buildingId;input.onchange=()=>changed(input);label.appendChild(input);section.appendChild(label);return {input,row};});
 const chosen=()=>picks.filter(pick=>pick.input.checked).map(pick=>pick.row.parameters),duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value=accelerate?'':'300';duration.dataset[accelerate?'productionAccelerationDuration':'productionCollectionDuration']='true';duration.setAttribute('aria-label',accelerate?'多工厂生产加速总时长秒':'多工厂成品领取总时长秒');duration.oninput=()=>changed(duration);duration.onchange=()=>changed(duration);section.appendChild(duration);
 const prepare=control(gpEl('button',accelerate?'准备原Workflow逐厂队列道具加速':'准备原Workflow逐厂领取成品'));prepare.type='button';prepare.dataset[accelerate?'productionAccelerationPrepare':'productionCollectionPrepare']='true';section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(!editable())return;const targets=chosen(),text=duration.value,seconds=Number(text);if(!targets.length||targets.length>24||new Set(targets.map(p=>p.buildingId)).size!==targets.length||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-'+id+'-hint').textContent=accelerate?'请选择1至24个不同工厂各一个当前队列及1至86400秒总时长。':'请选择1至24个不同工厂的当前成品及1至86400秒总时长。';return;}
  const payload={action:accelerate?'speedUpProduce':'collect',targets,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('production-collections-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(targets),config=s.data.config,editorDraft=$('wf-json').value;
  const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&duration.value===text&&JSON.stringify(chosen())===choice;
  s.plan=null;s.selected.clear();gpClear($('gp-'+id+'-plan-view'));s.pending=true;gpControls(id);
  try{const data=await operationMutation('/api/gameplay/production/start/prepare',payload,requestScope);if(!active())return;editor.accept(gpProductionCollectionGraph(data,payload,view,requestScope.account));$('wf-hint').textContent=accelerate?'已载入明确生产队列道具加速图；逐厂新调查、单次授权、精确道具净扣及原队列变化验证。':'已载入明确工厂成品领取图；逐厂新调查、单次授权和完整库存净入验证。';$('gp-'+id+'-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-'+id+'-hint').textContent=error.message;}finally{if(gpGet(id)===s&&s.revision===edit){s.pending=false;gpControls(id);}}
 };section.appendChild(gpEl('p',accelerate?'默认不选择；每工厂仅一次指定当前队列的原精确自有道具加速。队列或原数量变化、拒绝或UNKNOWN停止，不推断完成/领取，不接受RUBY/广告/补购或自动追加，收入不扩固定父预算，重启只读。':'默认不选择。绑定各工厂当前成品和队列，零父资源支出；原仓储上限及部分领取合同保持，未领取余量不会自动再次领取。领取收入不扩父预算，不启动生产或等待未来产出；变化、拒绝或UNKNOWN停止，重启只读。'));
}

function gpGrowthBatchGraph(data,payload,view,accountId,id){
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item),same=(a,b)=>canonical(a)===canonical(b),graph=data.graph;
 if(data.accountId!==accountId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||data.maxDurationMs!==payload.maxDurationMs||id==='museum'&&data.actionType!==payload.actionType||!same(data.targets,payload.targets)||!Array.isArray(data.steps)||data.steps.length!==payload.targets.length)throw Error('成长组合账号、精确目标、顺序或时长不匹配');
 const nodes=[{id:'start',type:'START'}],totals=new Map(),uids=[];payload.targets.forEach((parameters,i)=>{const speed=['speedExplore','speedCase'].includes(payload.actionType),sources=(id==='museum'&&speed?view.speedPreparation:id==='museum'&&payload.actionType==='claimAchievement'?view.achievementPreparation:view.candidates)?.filter(row=>id==='museum'?row.actionType===payload.actionType&&same(speed?row.parameters:row.target,parameters):same(row.parameters,parameters)),source=sources?.length===1?sources[0]:null,step=data.steps[i],selection=id==='museum'||id==='pet'?{actionId:source?.actionId}:{unique:true},claims=source&&(Object.hasOwn(source,'budgetClaims')?source.budgetClaims:{resources:source.costs,quotas:[],uids:[]});
  if(id==='museum'&&payload.actionType==='claimAchievement'&&!same(step?.rewards,source?.expectedState?.rewards))throw Error('人气成就原配置奖励已变化');
  if(!source||(id!=='museum'&&!source.executable)||!same(step?.parameters,parameters)||!same(step?.selection,selection)||!same(step?.target,source.target)||!same(step?.costs,source.costs)||!same(step?.budgetClaims,claims))throw Error('成长原归属、成长目标、成本或UID预算已变化');
  for(const cost of source.costs){const num=(totals.get(cost.id)??0)+cost.num;if(!Number.isSafeInteger(cost.num)||cost.num<0||!Number.isSafeInteger(num))throw Error('成长原累计成本无效');totals.set(cost.id,num);}uids.push(...claims.uids);
  nodes.push({id:'grow-'+i,type:'ACTION',module:id,parameters,selection},{id:'verify-'+i,type:'VERIFY',module:id});
 });nodes.push({id:'stop',type:'STOP'});const budget={resources:[...totals].filter(([,num])=>num>0).map(([id,num])=>({id,num})),quotas:[],uids};
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.targets.length,modules:[id]}))throw Error('成长逐件验证、有限上限或原资源/UID预算不匹配');return graph;
}
function gpRenderGrowthBatch(box,view,id){
 const putting=['equipment-growth','badge-growth'].includes(id)&&view?.candidates?.some(row=>row.actionType==='PUT-ON'),unlock=id==='formation-unlock',heroes=id==='heroes',antiques=id==='antique-growth',museum=id==='museum',pet=id==='pet',s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-'+id+'-parameters').value,rows=(museum?[...(view?.candidates||[]).filter(row=>!['claimAchievement','speedExplore','speedCase'].includes(row.actionType)),...(view?.achievementPreparation||[]),...(view?.speedPreparation||[])]:view?.candidates||[]).filter(row=>(unlock?['UNLOCK']:pet?['LEVEL','FEED']:museum?['upgradeExhibition','upgradeKeyword','upgradeCase','finishCase','claimAchievement','speedExplore','speedCase']:heroes?['LEVEL','SKILL','EXCLUSIVE-LEVEL','EXCLUSIVE-STAR','EXCLUSIVE-ACTIVATE']:antiques?['ACTIVATE','STAR','SUIT','EXCHANGE']:['LEVEL','INITIAL_LEVEL','REFINE','STAR','PUT-ON','TAKE-OFF']).includes(row.actionType)&&(unlock?Number.isInteger(row.parameters?.presetId):pet?typeof row.parameters?.buildingId==='string'&&(row.parameters.action==='level'?typeof row.parameters.uid==='string':Number.isInteger(row.parameters.jobIdx)&&row.parameters.jobIdx>=0):museum?Number.isSafeInteger(row.target?.exhibitionId??row.target?.popularityThreshold??row.target?.stageId):antiques?typeof row.parameters?.antiqueId==='string'||Number.isSafeInteger(row.parameters?.suitId):typeof row.parameters?.heroId==='string'&&(heroes||typeof row.parameters?.uid==='string'))),section=gpEl('div');s.growthBatchControls=[];if(!rows.length)return;box.appendChild(section);section.appendChild(gpEl('h4',putting?'明确闲置'+(id==='badge-growth'?'徽章':'装备')+'逐空槽穿戴':unlock?'明确自有图纸逐模板解锁':pet?'明确海兽逐目标单次成长':museum?'明确博物馆逐目标成长或人气领奖':heroes?'明确英雄逐名单次成长':antiques?'明确藏品逐项单次成长':'明确已佩戴'+(id==='badge-growth'?'徽章':'装备')+'逐件单次成长'));
 const live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&$('gp-'+id+'-parameters').value===source,editable=()=>live()&&gpDomainSelectable(id)&&!s.targetDraftPending&&s.data?.config?.enabled===true&&wfEditorEditable(),control=(input,eligible=true)=>{input._growthBatchLive=()=>editable()&&(typeof eligible==='function'?eligible():eligible);input.disabled=!input._growthBatchLive();s.growthBatchControls.push(input);return input;};
 const changed=input=>{if(input.disabled||!editable())return;gpInvalidate(id,false);wfInvalidateSettingPlans();$('gp-'+id+'-hint').textContent=putting?'穿戴UID或时长已编辑，旧计划和授权失效；准备时重新调查闲置归属及原空槽。':unlock?'模板选择或时长已编辑，旧计划和授权失效；准备时重新调查未解锁模板及全部自有图纸。':'成长目标选择或时长已编辑，旧计划和授权失效；准备时重新调查归属、成长和完整库存。';};
 const parametersOfRow=row=>museum&&!['speedExplore','speedCase'].includes(row.actionType)?row.target:row.parameters,eligible=row=>museum||row.executable===true;
 const mode=heroes||museum?control(gpEl('select')):null;if(mode){if(museum)mode.dataset.museumGrowthBatchMode='true';else mode.dataset.heroGrowthBatchMode='true';mode.setAttribute('aria-label',museum?'本批博物馆成长动作':'本批英雄成长动作');for(const action of [...new Set(rows.map(row=>museum?row.actionType:row.parameters.action))]){const option=gpEl('option',({level:'等级',skill:'技能槽','exclusive-activate':'专武首次激活','exclusive-level':'已激活专武等级','exclusive-star':'已激活专武星级',upgradeExhibition:'展区升一级',upgradeKeyword:'关键词升一级',upgradeCase:'展柜升级一次（可能开始计时）',finishCase:'展柜到期完工',claimAchievement:'人气成就逐档领奖',speedExplore:'逐队探险道具加速',speedCase:'逐展柜道具加速'})[action]);option.value=action;mode.appendChild(option);}section.appendChild(mode);}
 const inMode=row=>!mode||(museum?row.actionType:row.parameters.action)===mode.value;
 const checks=rows.map(row=>{const check=control(gpEl('input'),()=>eligible(row)&&inMode(row));check.type='checkbox';check.checked=false;check.dataset.growthBatchTarget=unlock?String(row.parameters.presetId):pet?row.actionId:museum?row.actionId:heroes?row.parameters.heroId+':'+row.parameters.action+':'+(row.parameters.skillIdx??''):antiques?String(row.parameters.antiqueId??row.parameters.suitId):putting?row.actionId:row.parameters.uid;check.onchange=()=>{if(check.disabled||!editable())return;if(heroes&&check.checked)for(const other of checks)if(other.check!==check&&other.row.parameters.heroId===row.parameters.heroId)other.check.checked=false;if(putting&&check.checked)for(const other of checks)if(other.check!==check&&(other.row.parameters.uid===row.parameters.uid||other.row.parameters.heroId===row.parameters.heroId&&(id==='badge-growth'?other.row.parameters.pos===row.parameters.pos:other.row.target.type===row.target.type)))other.check.checked=false;changed(check);};const label=gpEl('label',(row.label||row.actionType)+(unlock?' · 模板 '+row.parameters.presetId:pet?' · 建筑 '+row.parameters.buildingId+(row.parameters.action==='level'?' UID '+row.parameters.uid:' 队列idx '+row.parameters.jobIdx):museum?row.actionType==='claimAchievement'?' · 人气档位 '+row.target.popularityThreshold+' · 原配置奖励 '+operationCosts(row.expectedState?.rewards):row.actionType==='speedExplore'?' · 探险 '+row.target.stageId+' · 原结束秒 '+row.endTime:' · 展区 '+row.target.exhibitionId+(row.target.keywordType?' 关键词 '+row.target.keywordType:row.target.caseIndex?' 展柜 '+row.target.caseIndex:'')+(row.actionType==='speedCase'?' · 原结束秒 '+row.endTime:''):heroes?' · '+row.parameters.heroId+(row.parameters.skillIdx?' 槽 '+row.parameters.skillIdx:''):antiques?' · '+String(row.parameters.antiqueId??row.parameters.suitId)+(row.parameters.num?' 明确兑换 '+row.parameters.num+' 个':''):' · '+row.parameters.heroId+' · UID '+row.parameters.uid+(putting?' · 空槽 '+(row.parameters.pos??row.target.type):''))+' · '+operationCosts(row.costs)+' · '+(eligible(row)?'当前可预览':row.blockedReason||'未知')+' ');label.hidden=!inMode(row);label.appendChild(check);section.appendChild(label);return {check,row,label};});
 if(mode)mode.onchange=()=>{if(mode.disabled||!editable())return;for(const item of checks){item.check.checked=false;item.label.hidden=!inMode(item.row);}changed(mode);gpControls(id);};
 const chosen=()=>checks.filter(({check,row})=>check.checked&&inMode(row)).map(({row})=>parametersOfRow(row)),duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='300';duration.dataset.growthBatchDuration='true';duration.setAttribute('aria-label',putting?'逐空槽穿戴总时长秒':unlock?'逐模板解锁总时长秒':'逐件成长总时长秒');duration.oninput=()=>changed(duration);duration.onchange=()=>changed(duration);section.appendChild(duration);
 const prepare=control(gpEl('button',putting?'准备原Workflow逐空槽穿戴':unlock?'准备原Workflow逐模板解锁':'准备原Workflow逐件成长'),rows.some(eligible));prepare.type='button';prepare.dataset.growthBatchPrepare='true';section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(!editable())return;const targets=chosen(),text=duration.value,seconds=Number(text);if(!targets.length||targets.length>(unlock?23:24)||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-'+id+'-hint').textContent=putting?'请选择1至24个不同闲置UID及不同英雄空槽，并明确1至86400秒总时长。':unlock?'请选择1至23个不同且当前有对应图纸的未解锁模板，并明确1至86400秒总时长。':pet?'请选择当前调查范围内1至24个不同在岗UID或队列，每目标一种原动作一次；队列idx保留0，并明确总时长。':museum?'请选择当前调查范围内1至24个不同展区、关键词、展柜、人气成就档位或探险队伍，同批一种原动作，每目标一次，并明确总时长。':heroes?'请选择1至24个不同英雄，每英雄一个明确等级/技能槽/专武首次激活或已激活成长动作及1至86400秒总时长；同批动作相同。':antiques?'请选择1至24个不同藏品或套装，每目标一个相同原动作及1至86400秒总时长；兑换须明确数量。':'请选择1至24个不同已佩戴UID及1至86400秒总时长，同批仅当前一种成长动作。';return;}
  const payload={targets,maxDurationMs:seconds*1000,...(museum?{actionType:mode.value}:{})},requestScope=viewGuard.begin(id+'-batch-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(targets),config=s.data.config,editorDraft=$('wf-json').value;
  const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&duration.value===text&&JSON.stringify(chosen())===choice&&(!museum||mode.value===payload.actionType);
  s.plan=null;s.selected.clear();gpClear($('gp-'+id+'-plan-view'));s.pending=true;gpControls(id);
  try{const data=await operationMutation('/api/gameplay/'+(pet?'pet/growth':museum?'museum/growth':heroes?'heroes/growth':id)+'/prepare',payload,requestScope);if(!active())return;editor.accept(gpGrowthBatchGraph(data,payload,view,requestScope.account,id));$('wf-hint').textContent=putting?'已载入明确空槽穿戴图；每UID重新调查、单次授权及完整归属/槽位/库存验证后继续。':unlock?'已载入明确逐模板解锁图；每项重新调查、单次授权及原完整模板/图纸净扣/阵容不变验证后继续。':'已载入明确逐件成长图；每件重新调查、单次授权及原完整成长/库存验证后继续。';$('gp-'+id+'-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-'+id+'-hint').textContent=error.message;}finally{if(gpGet(id)===s&&s.revision===edit){s.pending=false;gpControls(id);}}
 };section.appendChild(gpEl('p',putting?'默认不选。仅选择原候选已确认的闲置自有UID和合格空槽，每UID及英雄/槽位各一次；相同UID或槽位互斥。零资源支出，父UID固定，每项重新调查、单次授权并验证完整池、英雄镜像与库存保持。拒绝、UNKNOWN或资格变化停止，不替换、不转移、不自动成长或补购。':unlock?'默认不选。每个未解锁模板消耗一张已经持有的对应普通图纸，全部图纸按原计划器累计预留，每项重新调查及单次授权。完整模板集合仅新增指定模板，原阵容和宠物保持；不购买、兑换或自动应用，UNKNOWN停止不重放。':pet?'仅列当前调查模式及目标范围的原候选，默认不选。每在岗海兽UID升一级或每个明确建筑/队列投喂一次，保留原idx含0。固定原actionId目标，累计预留全部初始自有材料及原UID，每步重新调查、单次授权及完整海兽/建筑/队列与库存验证；身份、等级或队列时间变化停止。不培育、领取成熟奖励、替换或补购，UNKNOWN不重放。':museum?'仅列当前调查范围的原候选，默认不选。同批一种展区、关键词、展柜升级、到期完工或人气成就领奖，各目标一次；人气领奖仅列当前已达标未领档位，零资源支出，逐档独立确认原配置奖励及唯一已领档位净增，奖励不扩父预算；累计核全部初始自有材料和保留线，每步重新调查和单次授权，完整库存及目标/非目标状态沿原验证。加速使用自有道具，原计时须匹配，缩短后仍须在进行中。UNKNOWN停止不重放。':heroes?'默认不选，同批一种原动作，每英雄只成长一次；技能须明确已解锁槽；专武首次激活独立核角色/英雄/开服天数及首级材料，后续成长须已激活。只使用准备时自有材料，共用原计划器、成本、完整英雄池/库存验证、预算和单次授权，不借升星预测技能资格，不兑换/补购，激活与后续成长分别授权，UNKNOWN停止不重放。':antiques?'默认不选，同批一种原激活、升星、套装单级或明确数量兑换，每目标一次；复用原私有采集、配置成本和完整藏品/套装/精通/库存验证，累计只预留初始自有材料。兑换后不自动成长，不借未来资格、不补购，UNKNOWN停止不重放。':'默认不选，同批只执行当前一种原动作，每UID只一次；装备卸下须明确原英雄归属，零资源支出并完整回闲置池。原计划器累计预留全部自有材料，单件足料不表示全部足料。UID/英雄归属、精确成本及完整库存按原合同验证，不替换或分解，不猜随机结果，UNKNOWN不重放。'));
}

function gpRenderDomain(id,view){
 const s=gpGet(id),box=gpClear($('gp-'+id+'-facts'));s.actionControls=[];s.mailPageControls=[];s.mailBatchControls=[];s.trialSequenceControls=[];s.dailyClosingControls=[];s.taskRewardClosingControls=[];s.tradeSaleBatchControls=[];s.productionStartControls=[];s.productionCollectionControls=[];s.productionAccelerationControls=[];s.cityPreparationControls=[];s.growthBatchControls=[];s.factoryViewControls=[];
 const show=value=>value===null||value===undefined?'未知':String(value);
 const table=(title,headers,rows)=>{box.appendChild(gpEl('h3',title));const element=gpEl('table'),heading=gpEl('tr');for(const label of headers)heading.appendChild(gpEl('th',label));element.appendChild(heading);for(const row of rows){const tr=gpEl('tr');for(const value of row)tr.appendChild(gpEl('td',show(value)));element.appendChild(tr);}box.appendChild(element);};
 if(id==='city'){gpRenderCityPreparation(box,view);table('建筑状态与下一等级',['建筑','等级','状态','原材料需求','下一等级条件'],(view?.buildings||[]).map(row=>[row.buildingId,row.level,row.status,operationCosts(row.materialCosts),gpJson(row.upgradeConditions)]));
 }else if(id==='compass-wheel'){
  box.appendChild(gpEl('p','抽取使用持有铜钱；累计积分奖零支出，须独立准备范围和授权。资格与到账分开，保底仅显示服务器原值。购买及自动重抽未开放。'));
  const scope=viewGuard.capture(),revision=gpRevision,aid=gpEl('input'),count=gpEl('select'),prepare=gpEl('button','使用明确罗盘参数');aid.type='text';aid.dataset.compassActivity='true';aid.setAttribute('aria-label','罗盘活动ID');aid.value=view?.window?.activityId||'';count.dataset.compassCount='true';count.setAttribute('aria-label','罗盘次数');for(const n of [1,5,10,50]){const o=gpEl('option',String(n));o.value=String(n);count.appendChild(o);}prepare.dataset.compassPrepare='true';box.appendChild(aid);box.appendChild(count);box.appendChild(prepare);s.actionControls.push(aid,count,prepare);
  prepare.onclick=()=>{if(prepare.disabled||!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id).data?.view!==view)return;if(!/^[1-9][0-9]{0,18}$/.test(aid.value)||BigInt(aid.value)>=(1n<<63n)||![1,5,10,50].includes(Number(count.value))){$('gp-'+id+'-hint').textContent='请填写明确正int64活动ID及1/5/10/50次';return;}$('gp-'+id+'-parameters').value=gpJson({activityId:aid.value,count:Number(count.value)});gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已准备罗盘参数；重新只读探测，预览后单次授权。';};
  const activities=Array.isArray(view?.activitySelections)?view.activitySelections:null,activity=gpEl('select');activity.dataset.compassObservedActivity='true';const blank=gpEl('option','请选择本账号已观察罗盘活动');blank.value='';activity.appendChild(blank);
  for(const row of activities||[]){if(typeof row?.activityId!=='string'||!/^[1-9][0-9]{0,18}$/.test(row.activityId)||(activities.filter(other=>other?.activityId===row.activityId).length!==1))continue;const option=gpEl('option',row.activityId+' · 赛季 '+row.season+' · 窗口 '+row.subOpenTime+'–'+row.subCloseTime);option.value=row.activityId;activity.appendChild(option);}activity.value='';activity._blocked=activities===null;s.actionControls.push(activity);box.appendChild(activity);
  activity.onchange=()=>{if(activity.disabled||!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id).data?.view!==view||!activities?.some(row=>row.activityId===activity.value))return;aid.value=activity.value;};box.appendChild(gpEl('p','活动列表复用原连接的活动身份和窗口解析；观察到活动不代表开放或抽奖资格。明确次数并准备后仍须重新调查和授权；手填入口保留。'));
  const claim=view?.scoreClaim,claimPrepare=gpEl('button','准备当前累计积分奖参数');claimPrepare.type='button';claimPrepare.dataset.compassClaimPrepare='true';claimPrepare._blocked=!claim?.parameters;s.actionControls.push(claimPrepare);box.appendChild(claimPrepare);
  if(claim){table('当前已达标未领积分档（尚须重新调查）',['档位','积分门槛','原配置奖励'],(claim.tiers||[]).map(row=>[row.id,row.score,gpJson(row.rewards)]));box.appendChild(gpEl('p','准备范围 '+claim.parameters.expectedClaimedId+' → '+claim.parameters.expectedTierId+' · 总奖励 '+operationCosts(claim.rewards)+'。领取请求会收取当前全部已达标未领档；积分、已领档或配置变化须重新准备，不抽取、不打开奖励包。'));}
  claimPrepare.onclick=()=>{if(claimPrepare.disabled||!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id).data?.view!==view||aid.value!==claim?.parameters?.activityId)return;$('gp-'+id+'-parameters').value=gpJson(claim.parameters);gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已准备明确累计领奖范围；请重新调查、核对零支出与所有奖励，再预览并单独授权。';};
  const spin=view?.candidates?.length===1?view.candidates[0]:null;
  const taskSource=$('gp-'+id+'-parameters').value;
  const addTask=gpEl('button',spin?.actionType==='CLAIM'?'将当前累计领奖加入Tasks声明':'将当前罗盘抽取加入Tasks声明');
  addTask.type='button';
  addTask.dataset.compassTaskPrepare='true';
  addTask._workflowPrepare=true;
  addTask._blocked=spin?.executable!==true||!['SPIN','CLAIM'].includes(spin.actionType);
  if(!addTask._blocked&&spin.actionType==='SPIN')count.value=String(spin.parameters.count);
  addTask.onclick=()=>{
   if(addTask.disabled||addTask._blocked||!gpDomainSelectable(id)||!wfUnifiedEditable()||
      !gpSafe(scope,revision)||gpGet(id).data?.view!==view||$('gp-'+id+'-parameters').value!==taskSource)return;
   try {
    if(aid.value!==spin.parameters.activityId||spin.actionType==='SPIN'&&Number(count.value)!==spin.parameters.count)throw Error('活动或次数已改变，请重新调查候选。');
    const intent=$('wf-unified-intent').value.trim()?wfUnifiedData():{entry:'tasks',tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}};
    if(!['tasks','loop'].includes(intent.entry))throw Error('请先将声明入口改为Tasks或Loop。');
    if(intent.tasks.length>=48)throw Error('Tasks步骤已达48项上限。');
    if(intent.tasks.some(row=>row.kind==='compass-wheel'&&row.actionId===spin.actionId))throw Error('当前罗盘候选已在Tasks草稿中。');
    intent.tasks.push({kind:'compass-wheel',parameters:JSON.parse(JSON.stringify(spin.parameters)),actionId:spin.actionId});
    wfInvalidateSettingPlans();
    $('wf-unified-intent').value=gpJson(intent);
    wfUnifiedRender();
    wfControls();
    $('gp-'+id+'-hint').textContent=spin.actionType==='CLAIM'?'已加入明确累计奖。请核对零支出、领取范围和原UID预算，再去Workflow生成预览。':'已加入当前抽取。请核对自有券、配额和目标预算，再去Workflow生成预览。';
   }catch(error){$('gp-'+id+'-hint').textContent=error.message;}
  };
  box.appendChild(addTask);
  s.actionControls.push(addTask);
  const observed=view?.compassObservation;box.appendChild(gpEl('p','罗盘Info只读来源 '+(observed?.status??'UNKNOWN')+' · '+(observed?.source??'未知')+' · 原采集时间 '+(observed?.sourceAt??'未知')+(observed?.reason?' · '+observed.reason:'')+'；库存或配置缺失不抹去可靠Info，记录不证明当前可抽、可领或到账。'));if(observed)gpDetails(box,'原Info独立观察',observed);
  table('罗盘独立观察',['活动ID','赛季','累计次数','累计积分','已领奖档','单抽道具','单抽数量','保底原值'],[[view?.compassObservation?.activityId??view?.window?.activityId,view?.window?.season,view?.compass?.times,view?.compass?.score,view?.compass?.claimedId,view?.compass?.cost?.id,view?.compass?.cost?.num,view?.compass?.pity]]);
 }else if(id==='trade'){
  gpRenderTradeSaleBatch(box,view);
  gpRenderTradeSaleBatch(box,view,true);
  box.appendChild(gpEl('p','当前港口观察 · '+show(view?.status)+' · '+show(view?.reason)+'；只读预览不代表可售或到账。'));
  const hours=view?.tradingHours;box.appendChild(gpEl('p','每日贸易时段：'+show(hours?.status)+' · '+(hours?.range?hours.range.startHour+'–'+hours.range.endHour+' 时':'未知')+' · '+show(hours?.reason)+'；账号时区未精确确认，须所有受支持时区均处于开放时段。'));
  table('海商王账户与船舱',['周期','港口','船级','贸易币 coins','maxCoins 原值','profit 原值','已用容量','配置容量','剩余容量'],[[view?.period,view?.cargo?.cityId,view?.cargo?.cargoLv,view?.balances?.coins,view?.balances?.maxCoins,view?.balances?.profit,view?.capacity?.used,view?.capacity?.total,view?.capacity?.remaining]]);
  table('当前港口行情',['货物 ID','名称','价格','stock 原值'],(view?.prices||[]).map(row=>[row.goodsId,row.name,row.price,row.stock]));
  table('持有货物',['批次 PID','货物','数量','买入单价','来源港口'],(view?.holdings||[]).map(row=>[row.pid,row.name||row.goodsId,row.num,row.buyPrice,row.cityId]));
  table('全批非亏损卖价预览',['批次 PID','当前单价','预计利润','预计总价','预览状态'],(view?.quotes||[]).map(row=>[row.pid,row.price,row.profit,row.total,row.reason||row.status]));
  box.appendChild(gpEl('p','前后货舱相同不证明原子快照。买入按 maxCount-stock、剩余容量和贸易币余额核验明确数量；精确贸易币支出须单独授权。预期售得不加入预算。航行、加速和领奖保持独立。'));
  table('当前航段',['服务端开始秒','服务端终点秒','目的地港口 ID'],[[view?.cargo?.moveStartTime,view?.cargo?.moveEndTime,view?.cargo?.moveToCityId]]);
  const route=view?.route;table('当前 Radar 目的地',['港口 ID'],(route?.destinations||[]).map(row=>[row.cityId]));box.appendChild(gpEl('p','路线观察：'+show(route?.status)+'；单航段只确认建立，不证明到达、目的地价格或收益。'));
  box.appendChild(gpEl('p','自有商会指针：'+show(view?.speed?.owned)+'；每枚秒数：'+show(view?.speed?.policy?.secondsEach)+'。仅明确道具数且缩短后仍为可信未来终点时可预览；到达边界及补购保持独立。'));
  for(const action of ['sell','buy','move','speed']){
   const speed=action==='speed',move=action==='move',buy=action==='buy',keyTarget=move||speed?'mvToCityId':buy?'goodsId':'pid',keys=move?['cityId',keyTarget]:['cityId',keyTarget,'num'],draftKey=speed?'tradeSpeedDraft':move?'tradeMoveDraft':buy?'tradeBuyDraft':'tradeSaleDraft',title=speed?'自有道具加速':move?'移动':buy?'买入':'卖出';
   const scope=viewGuard.capture(),revision=gpRevision,inputs={},source=gpTradeSaleSource();
   if(!s[draftKey]||s[draftKey].source!==source){let parameters;try{parameters=gpParse('gp-'+id+'-parameters');}catch{}s[draftKey]={source,values:Object.fromEntries(keys.map(key=>[key,parameters?.action===action&&parameters[key]!==undefined?String(parameters[key]):'']))};}
   const draft=s[draftKey],valid=control=>!control.disabled&&gpTradeSaleEditable()&&gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&s[draftKey]===draft&&draft.source===gpTradeSaleSource();
   const update=parameters=>{$('gp-'+id+'-parameters').value=gpJson(parameters);draft.source=$('gp-'+id+'-parameters').value;for(const name of ['tradeSaleDraft','tradeBuyDraft','tradeMoveDraft','tradeSpeedDraft'])if(s[name])s[name].source=draft.source;gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);};
   const control=element=>{element._tradeSaleDraft=true;element.disabled=!gpTradeSaleEditable();s.actionControls.push(element);return element;};
   box.appendChild(gpEl('h3','单次'+title));
   for(const [key,label]of (speed?[['cityId','当前船舱港口 ID'],[keyTarget,'当前航段目的地 ID'],['num','本次自有道具数']]:move?[['cityId','当前起点港口 ID'],[keyTarget,'Radar 目的地港口 ID']]:[['cityId',title+'港口 ID'],[keyTarget,buy?'货物 ID':'持货批次 PID'],['num','本次数量']])){const field=gpEl('label',label),input=control(gpEl('input'));input.type='text';input.inputMode='numeric';input.value=draft.values[key];input.dataset[speed?'tradeSpeedField':move?'tradeMoveField':buy?'tradeBuyField':'tradeSellField']=key;input.oninput=()=>{if(!valid(input))return;draft.values[key]=input.value;update({});$('gp-'+id+'-hint').textContent=title+'输入已编辑，旧候选与预览失效；请明确准备参数后重新探测。';};inputs[key]=input;field.appendChild(input);box.appendChild(field);}
   for(const row of (speed?(view?.cargo?.moveToCityId?[view.cargo]:[]):move?route?.destinations:buy?view?.prices:view?.holdings)||[]){const target=speed?row.moveToCityId:move?row.cityId:row[keyTarget],select=control(gpEl('button',speed?'选择当前航段 '+view.cargo.cityId+' → '+target:move?'选择目的地 '+target:buy?'选择货物 '+target:'选择批次 '+target));select.dataset[speed?'tradeSpeedLeg':move?'tradeDestination':buy?'tradeGoods':'tradeHolding']=String(target);select.onclick=()=>{if(!valid(select))return;for(const [key,value]of Object.entries({cityId:String(view?.cargo?.cityId??''),[keyTarget]:String(target),...(move?{}:{num:''})})){draft.values[key]=value;inputs[key].value=value;}update({});};box.appendChild(select);}
   const prepare=control(gpEl('button',speed?'准备自有道具加速':move?'准备单航段移动':buy?'准备单次买入':'准备单次非亏损卖出'));prepare.dataset[speed?'tradeSpeedPrepare':move?'tradeMovePrepare':buy?'tradeBuyPrepare':'tradeSellPrepare']='true';prepare.onclick=()=>{if(!valid(prepare))return;const parameters={action};for(const key of keys){const raw=inputs[key].value;if(!/^[1-9][0-9]*$/.test(raw)||!Number.isInteger(Number(raw))||Number(raw)>2147483647){$('gp-'+id+'-hint').textContent=speed?'当前港口、航段目的地与本次道具数须为明确正int32整数':move?'起点与目的地须为明确正int32整数':'港口、目标和本次数量须为明确正int32整数';return;}parameters[key]=Number(raw);}if(move&&parameters.cityId===parameters.mvToCityId){$('gp-'+id+'-hint').textContent='起点和目的地须为不同港口';return;}for(const key of keys)draft.values[key]=inputs[key].value;update(parameters);$('gp-'+id+'-hint').textContent=speed?'已准备当前航段及本次自有道具数；重新探测库存和可信终点，预览精确支出后单独授权；不自动补购或确认到达。':move?'已准备明确单航段；重新探测当前船舱、Radar与活动窗口，再预览并单独授权；不证明到达或收益。':'已准备指定目标与数量；重新探测贸易窗口、行情和库存，再预览并单独授权。';};box.appendChild(prepare);
  }
  }else if(id==='material-packs'){
  gpRenderMaterialPackBatch(box,view);
  table('自有材料包',['包','持有'],(view?.packs||[]).map(pack=>[pack.packId,pack.have]));
  box.appendChild(gpEl('p','当前世界赛季：'+show(view?.season)+'。选择目标与包数后重新探测，再预览并单独授权。预计得料不作为库存；可明确准备兑换后单份生产有限图，每步仍需授权，不补购。'));
  const scope=viewGuard.capture(),revision=gpRevision;
  const select=gpEl('select');select.dataset.materialPackTarget='true';select.disabled=!gpDomainSelectable(id);
  for(const pack of view?.packs||[])for(const target of pack.targets||[]){const option=gpEl('option',pack.packId+' → '+target.itemId+' · 每包 '+show(target.perPack)+' · 赛季 '+show(target.requiredSeason));option.value=gpJson({packId:pack.packId,itemId:target.itemId});select.appendChild(option);}
  const num=gpEl('input');num.type='number';num.min='1';num.max='2147483647';num.step='1';num.value='';num.dataset.materialPackQuantity='true';num.disabled=!gpDomainSelectable(id);
  const choose=gpEl('button','准备指定材料兑换');choose.dataset.materialPackPrepare='true';choose.disabled=!gpDomainSelectable(id);
  choose.onclick=()=>{if(choose.disabled||!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id).data?.view!==view)return;const quantity=Number(num.value);if(!select.value||!Number.isInteger(quantity)||quantity<1||quantity>2147483647){$('gp-'+id+'-hint').textContent='请选择材料，并输入明确正整数包数。';return;}const target=JSON.parse(select.value);$('gp-'+id+'-parameters').value=gpJson({...target,num:quantity});gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已准备精确包、目标与数量；重新探测后预览并单独授权兑换。';};
  box.appendChild(select);box.appendChild(num);box.appendChild(choose);s.actionControls.push(select,num,choose);

  const exchangeDraft=[],exchangeList=gpEl('div');exchangeList.dataset.materialProductionList='true';box.appendChild(exchangeList);
  const renderExchangeDraft=()=>{gpClear(exchangeList);for(let i=0;i<exchangeDraft.length;i++){const row=exchangeDraft[i];exchangeList.appendChild(gpEl('p',(i+1)+'. '+row.packId+' ×'+row.num+' → '+row.itemId));}};
  const appendExchange=gpEl('button','将当前材料与包数加入有序组合');appendExchange.dataset.materialProductionAdd='true';s.actionControls.push(appendExchange);box.appendChild(appendExchange);
  appendExchange.onclick=()=>{if(appendExchange.disabled||!gpSafe(scope,revision)||!gpDomainSelectable(id))return;try{const target=JSON.parse(select.value),quantity=Number(num.value);if(!target.packId||!target.itemId||!/^[1-9][0-9]*$/.test(num.value)||!Number.isInteger(quantity)||quantity>2147483647||exchangeDraft.length>=23)throw Error('须明确选择材料与正整数包数，最多23项');exchangeDraft.push({...target,num:quantity});renderExchangeDraft();$('gp-'+id+'-hint').textContent='已加入第'+exchangeDraft.length+'项；至少两项后可准备多材料组合，请核对顺序和合计包数。';}catch(error){$('gp-'+id+'-hint').textContent=error.message;}};
  const clearExchanges=gpEl('button','清空有序材料组合');clearExchanges.dataset.materialProductionClear='true';s.actionControls.push(clearExchanges);box.appendChild(clearExchanges);clearExchanges.onclick=()=>{if(clearExchanges.disabled||!gpSafe(scope,revision)||!gpDomainSelectable(id))return;exchangeDraft.length=0;renderExchangeDraft();};
  const chainInputs={};for(const [key,label]of [['buildingId','目标工厂 ID（见生产页）'],['productId','指定配方产品 ID'],['maxDurationMs','本次总时长（秒）']]){const field=gpEl('label',label),input=gpEl('input');input.type=key==='maxDurationMs'?'number':'text';input.value='';if(key==='maxDurationMs'){input.min='1';input.max='86400';input.step='1';}input.dataset.materialProductionField=key;field.appendChild(input);box.appendChild(field);s.actionControls.push(input);chainInputs[key]=input;}
  const chain=gpEl('button','准备兑换确认后指定生产');chain.dataset.materialProductionPrepare='true';chain._workflowPrepare=true;chain.disabled=!gpDomainSelectable(id)||!wfEditorEditable();s.actionControls.push(chain);box.appendChild(chain);
  chain.onclick=async()=>{
   if(chain.disabled||!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id).data?.view!==view||!wfEditorEditable())return;
   const quantity=num.value,choice=select.value,buildingId=chainInputs.buildingId.value,productId=chainInputs.productId.value,secondsText=chainInputs.maxDurationMs.value;let target;try{target=JSON.parse(choice);}catch{}
   if(exchangeDraft.length===1||!exchangeDraft.length&&(!target||!/^[1-9][0-9]*$/.test(quantity)||!Number.isInteger(Number(quantity))||Number(quantity)>2147483647)||!buildingId.trim()||buildingId.trim()!==buildingId||!productId.trim()||productId.trim()!==productId||!/^[1-9][0-9]*$/.test(secondsText)||!Number.isInteger(Number(secondsText))||Number(secondsText)>86400){$('gp-'+id+'-hint').textContent='请明确选择材料、正整数包数、工厂和配方产品ID，以及1至86400秒总时长。';return;}
   const draftText=gpJson(exchangeDraft),payload={...(exchangeDraft.length?{exchanges:JSON.parse(draftText)}:{...target,num:Number(quantity)}),buildingId,productId,maxDurationMs:Number(secondsText)*1000},requestScope=viewGuard.begin('material-production-prepare'),editor=captureStageRecommendationEditor(),stateRevision=++s.revision,editorDraft=$('wf-json').value,parameterText=$('gp-'+id+'-parameters').value;
   const active=()=>gpSafe(requestScope,revision)&&gpGet(id)===s&&s.revision===stateRevision&&s.data?.view===view&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&$('gp-'+id+'-parameters').value===parameterText&&gpJson(exchangeDraft)===draftText&&select.value===choice&&num.value===quantity&&chainInputs.buildingId.value===buildingId&&chainInputs.productId.value===productId&&chainInputs.maxDurationMs.value===secondsText;
   s.plan=null;gpClear($('gp-'+id+'-plan-view'));s.pending=true;gpControls(id);
   try{const data=await operationMutation('/api/gameplay/production/material/prepare',payload,requestScope);if(!active())return;editor.accept(gpMaterialProductionGraph(data,payload,view,requestScope.account));$('wf-hint').textContent='已载入明确材料包兑换后单份生产预览；核对固定目标、配方成本、累计父预算和期限，再开始并授权。';$('gp-'+id+'-hint').textContent=data.limitation;}
   catch(cause){if(gpSafe(requestScope,revision)&&gpGet(id)===s)$('gp-'+id+'-hint').textContent='材料生产组合未准备：'+cause.message;}
   finally{if(gpSafe(requestScope,revision)&&gpGet(id)===s){s.pending=false;gpControls(id);}}
  };
  box.appendChild(gpEl('p','可将多项材料按顺序加入组合，合计使用已持有包。准备只生成有限图；全部兑换确认落盘后须同连接新调查和授权生产；完整库存、工厂或配方变化、拒绝及UNKNOWN停止后继，不补购、不重放。'));

 }else if(id==='mail'){
  const page=view?.page,mailbox=view?.mailbox,emails=mailbox?.emails||page?.emails||[];
  if(mailbox)box.appendChild(gpEl('p',(mailbox.allPagesComplete?'分页覆盖完成':'分页覆盖未完成')+' · 已读 '+show(mailbox.readPages)+' / '+show(mailbox.expectedPages)+' 页 · 观察 '+emails.length+' 封 · '+(mailbox.reason||'总数稳定且ID唯一')+'。非原子快照；单封操作仍须重新探测。'));
  box.appendChild(gpEl('p',page?'页码 '+page.pageNo+' · 本页 '+show(page.pageCount)+' 封 · total 原值 '+show(page.totalReported)+'；只代表本页观察':'尚未读取邮件页'));
  const input=gpEl('input');input.type='number';input.min='0';input.max='2147483647';input.value=String(page?.pageNo??0);input.id='gp-mail-pageNo';box.appendChild(input);
  const scope=viewGuard.capture();
  const read=async pageNo=>{if(!viewGuard.current(scope)||gpGet(id).pending)return;if(!Number.isInteger(pageNo)||pageNo<0||pageNo>2147483647){$('gp-mail-hint').textContent='页码须为非负整数';return;}$('gp-mail-parameters').value=gpJson({pageNo});await $('gp-mail-survey').onclick();};
  for(const [label,offset] of [['读取指定页',null],['上一页',-1],['下一页',1]]){const button=gpEl('button',label);button.type='button';button.dataset.mailPage=offset===null?'selected':String(offset);button.onclick=()=>read(offset===null?Number(input.value):(page?.pageNo??0)+offset);button._mailOffset=offset;button.disabled=!snapshot?.connected||(offset===-1&&(page?.pageNo??0)===0);box.appendChild(button);s.mailPageControls??=[];s.mailPageControls.push(button);}
  const limit=gpEl('input');limit.type='number';limit.min='1';limit.max='100';limit.step='1';limit.value=String(mailbox?.maxPages??20);limit.id='gp-mail-maxPages';box.appendChild(gpEl('span','枚举页数上限（1–100）：'));box.appendChild(limit);
  const enumerate=gpEl('button','只读枚举邮箱');enumerate.type='button';enumerate.dataset.mailEnumerate='true';enumerate.onclick=async()=>{if(enumerate.disabled||!viewGuard.current(scope)||gpGet(id).pending||gpGet(id).data?.view!==view)return;const maxPages=Number(limit.value);if(!Number.isInteger(maxPages)||maxPages<1||maxPages>100){$('gp-mail-hint').textContent='枚举页数上限须为1至100的整数';return;}$('gp-mail-parameters').value=gpJson({action:'enumerate',maxPages});await $('gp-mail-survey').onclick();};box.appendChild(enumerate);s.mailPageControls.push(limit,enumerate);
  table(mailbox?'枚举观察邮件':'本页邮件',['所在页','邮件 ID','主题','阅读状态','领取状态','附件观察'],emails.map(row=>[row.pageNo??page?.pageNo,row.emailId,row.subject,row.read===true?'已读':row.read===false?'未读':'未知',row.got===true?'已领':row.got===false?'未领':'未知',row.attachment?.hasAttachment===true?'有附件':row.attachment?.hasAttachment===false?'无附件':'未知']));
  gpRenderMailBatch(box,view);
  for(const row of emails){const read=row.read===false&&row.attachment?.hasAttachment===false&&typeof row.got==='boolean';if(!read&&(row.got!==false||row.attachment?.hasAttachment!==true))continue;const button=gpEl('button',(read?'准备单封已读 ':'准备单封附件 ')+row.emailId);if(read)button.dataset.mailReadPrepare=row.emailId;else button.dataset.mailClaimPrepare=row.emailId;button._blocked=false;button.disabled=!gpDomainSelectable(id);button.onclick=()=>{if(button.disabled||!gpDomainSelectable(id)||!viewGuard.current(scope)||gpGet(id).data?.view!==view)return;$('gp-mail-parameters').value=gpJson({pageNo:row.pageNo??page.pageNo,action:read?'read':'claim',emailId:row.emailId});gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-mail-hint').textContent='已准备精确单封邮件；请重新探测附件与库存，预览后单独授权。';};s.actionControls.push(button);box.appendChild(button);}
  box.appendChild(gpEl('p','普通分页只展示本页；明确枚举在页数上限内检查分页覆盖，不证明原子快照。普通附件及完整空附件未读邮件可独立探测、预览和授权；明确同页多封组合逐封使用原合同，all=true及实例附件继续冻结。'));
 }else if(id==='museum'){
  gpRenderMuseumExploreTarget(box,view);
  gpRenderMuseumExploreBatch(box,view);
  gpRenderMuseumBusinessTarget(box,view);
  gpRenderMuseumExhibits(box,view);
  gpRenderGrowthBatch(box,view,id);
  box.appendChild(gpEl('p','探险结算与领奖仍缺同次结算身份和可恢复的待领奖/到账凭证。到期只表示等待结算，不证明奖励已生成或到账；收益和成就领取独立。'));
  const materials=view?.explorationMaterials;
  const reasons={PLAYER_IDENTITY_UNKNOWN:'玩家身份未知',EXPEDITION_STATE_UNKNOWN:'远征列表未知',STAGE_NOT_OBSERVED:'未读到所选远征',EXPEDITION_ALREADY_STARTED:'本次远征已开始',STAGE_LOCKED:'远征未解锁',STAGE_UNLOCK_UNKNOWN:'远征解锁状态未知',TIME_FACTOR_LOCKED_OR_UNKNOWN:'倍率未解锁或无法确认',AUTHORITATIVE_EXPEDITION_COST_UNKNOWN:'本次材料需求未知',INVENTORY_UNKNOWN:'持有量未知'};
  const status={AVAILABLE:'材料足够',SHORTAGE:'材料不足',UNKNOWN:'未知',NOT_APPLICABLE:'不适用'};
  if(!materials){box.appendChild(gpEl('p','只读探测后可查看远征材料。'));return;}
  box.appendChild(gpEl('p','材料倍率：'+show(materials.factor)+'。持有量为本次读到的库存；计划仍会检查保留库存与执行预算。'));
  if(materials.reason)box.appendChild(gpEl('p',reasons[materials.reason]||'无法确认远征材料。'));
  const rows=(materials.stages||[]).flatMap(stage=>{
   const result=reasons[stage.reason]||status[stage.status]||'未知';
   return stage.materials?.length?stage.materials.map(row=>[stage.stageId,row.id,row.required,row.have,row.missing,row.reserve,row.missingWithReserve,result]):[[stage.stageId,'—','—','—','—','—','—',result]];
  });
  if(rows.length)table('远征材料缺口',['远征','材料','需求','持有','实际缺口','保留量','含保留量缺口','状态'],rows);
  else if(!materials.reason)box.appendChild(gpEl('p','没有可显示的远征。'));
 }else if(id==='pirate-sweep'){
  gpRenderPirateSweepBatch(box,view);
  const quota=view?.quota,breakdown=view?.quotaBreakdown;
  const scope=viewGuard.capture(),revision=gpRevision;
  const valid=control=>!control.disabled&&gpDomainSelectable(id)&&gpSafe(scope,revision)&&gpGet(id).data?.view===view;
  const reasons={PIRATE_DAY_BOUNDARY_UNCERTAIN:'当前接近游戏日切换',PIRATE_USED_EXCEEDS_TOTAL:'已用次数与当前额度不一致',PIRATE_VIP_OR_MONTH_CARDS_UNKNOWN:'未确认当前 VIP 或有效月卡',PIRATE_FRESH_AUTHORITY_NOT_CONFIRMED:'当前观察已过期或缺少连续证据'};
  const relation={HIGHEST:'已达到本类型最高已击杀等级',LOWER:'低于已击杀等级，需要单次确认',FIRST_KILL_REQUIRED:'需要首杀',UNKNOWN:'击杀上限未知'};
  if(!quota){box.appendChild(gpEl('p','探测后可查看当天额度和海盗目标。'));return;}
  table('海面扫荡额度',['游戏日','已用','总额','剩余'],[[quota.dayKey,quota.used,quota.total,quota.remaining]]);
  if(breakdown)box.appendChild(gpEl('p','基础 '+show(breakdown.base)+' · VIP '+show(breakdown.vip)+' · 月卡 '+show(breakdown.monthCards)));
  if(quota.reason)box.appendChild(gpEl('p',reasons[quota.reason]||'本次未能确认可用额度，请重新探测。'));
  const targets=view?.targets||[];
  if(!targets.length){box.appendChild(gpEl('p','本次没有可显示的海盗目标。'));return;}
  table('本次观察到的海盗',['UID','城市','类型','等级','坐标格','已击杀等级上限','资格'],targets.map(row=>[row.uid,row.cityId,row.type,row.level,row.gridIdx,row.maxKilledLevel,relation[row.levelRelation]||'未知']));
  const label=gpEl('label'),lower=gpEl('input');lower.type='checkbox';lower.disabled=!gpDomainSelectable(id);
  label.appendChild(lower);label.appendChild(document.createTextNode('确认扫荡所选低等级目标（仅用于这一次选择）'));box.appendChild(label);s.actionControls.push(lower);
  for(const row of targets){
   if(!['HIGHEST','LOWER'].includes(row.levelRelation))continue;
   const pick=gpEl('button','选择 UID '+row.uid+'（城市 '+row.cityId+'）');
   pick._blocked=!Number.isSafeInteger(quota.remaining)||quota.remaining<=0;pick.disabled=pick._blocked||!gpDomainSelectable(id);
   pick.onclick=()=>{
    if(!valid(pick))return;
    const allowLowerLevel=row.levelRelation==='LOWER';
    if(allowLowerLevel&&!lower.checked){$('gp-'+id+'-hint').textContent='请选择是否明确扫荡此低等级目标。';return;}
    lower.checked=false;
    const parameters={uid:row.uid,cityId:row.cityId,...(allowLowerLevel?{allowLowerLevel:true}:{})};
    $('gp-'+id+'-parameters').value=gpJson(parameters);gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);
    $('gp-'+id+'-hint').textContent='已选一个目标。请重新探测，再预览当天额度与单次授权。';
   };
   box.appendChild(pick);s.actionControls.push(pick);
  }
 }else if(id==='trial-challenge'){
  const scope=viewGuard.capture(),revision=gpRevision;
  for(const target of gpTrialRaidTargets(view)){const choose=gpEl('button','准备'+target.label+'副本（开放等级 '+target.requiredLevel+'）');choose.dataset.trialRaidId=String(target.raidId);choose.disabled=!gpDomainSelectable(id);
   choose.onclick=()=>{if(choose.disabled||!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id)!==s||s.data?.view!==view)return;$('gp-'+id+'-parameters').value=gpJson({raidId:target.raidId});gpInvalidate(id,true);wfInvalidateSettingPlans();gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已选择'+target.label+'副本；重新调查本副本进度、等级与精确下一关，再预览并单次授权。';};box.appendChild(choose);s.actionControls.push(choose);
  }
  const taskRow=view?.candidates?.length===1?view.candidates[0]:null,taskSource=$('gp-'+id+'-parameters').value;
  const addTask=gpEl('button','将当前明确试炼下一关加入Tasks声明');addTask.type='button';addTask.dataset.trialTaskPrepare='true';addTask._workflowPrepare=true;
  addTask._blocked=taskRow?.executable!==true||![1,2,3].includes(taskRow?.target?.raidId)||!Number.isInteger(taskRow?.target?.stageId)||taskRow.target.stageId<1;
  addTask.disabled=addTask._blocked||!gpDomainSelectable(id)||!wfUnifiedEditable();
  addTask.onclick=()=>{
   if(addTask.disabled||addTask._blocked||!gpDomainSelectable(id)||!wfUnifiedEditable()||!gpSafe(scope,revision)||gpGet(id)!==s||s.data?.view!==view||$('gp-'+id+'-parameters').value!==taskSource)return;
   try{
    const source=$('wf-unified-intent').value,intent=source.trim()?wfUnifiedData():{entry:'tasks',tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}};
    if(!['tasks','loop'].includes(intent.entry))throw Error('请先明确将声明入口改为Tasks或Loop，再加入试炼首通');
    if(intent.tasks.length>=48)throw Error('Tasks步骤已达48项上限');
    intent.tasks.push({kind:'trial-challenge',parameters:{raidId:taskRow.target.raidId,stageId:taskRow.target.stageId}});
    wfInvalidateSettingPlans();$('wf-unified-intent').value=gpJson(intent);wfUnifiedRender();wfControls();
    $('gp-'+id+'-hint').textContent='已将当前副本和精确下一首通关加入Tasks草稿；核对原首通配额和UID预算，每项重新调查并单独授权。进度变化时停止，不替换为其他关卡。';
    $('wf-unified-form-hint').textContent='已加入明确试炼首通，原步骤与累计预算保留；不证明日常1009完成或领奖。';
   }catch(error){$('gp-'+id+'-hint').textContent=error.message;}
  };box.appendChild(addTask);s.actionControls.push(addTask);
  gpRenderTrialSequence(box,view);
  table('试炼首通',['副本','已通关','下一首通关','开放等级','当前状态'],(view?.candidates||[]).map(row=>[row.target?.raidId,view.raid?.passedStage,row.target?.stageId,row.requiredLevel,row.executable?'可预览单场挑战':row.blockedReason]));
  for(const note of view?.notes||[])box.appendChild(gpEl('p',note));
 }else if(id==='free-recruit'){
  const scope=viewGuard.capture(),revision=gpRevision,selectedRecruit=view?.candidates?.[0]?.parameters?.recruit==='antique'?'antique':'hero';
  for(const recruit of ['hero','antique']){
   const choose=gpEl('button',recruit==='antique'?'准备古董招募':'准备英雄招募');choose.dataset.recruitKind=recruit;choose.disabled=!gpDomainSelectable(id);
   choose.onclick=()=>{if(choose.disabled||!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id).data?.view!==view)return;const current=view?.candidates?.[0]?.parameters||{};$('gp-'+id+'-parameters').value=gpJson({...current,...(recruit==='antique'?{recruit}:{recruit:'hero'})});gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已明确选择'+(recruit==='antique'?'古董':'英雄')+'；重新探测、预览并单独授权。';};box.appendChild(choose);s.actionControls.push(choose);
  }
  for(const [payment,count] of [['free',1],['ticket',1],['ticket',10],['ticket',50]]){const prepare=gpEl('button',payment==='ticket'?'准备用自有'+(selectedRecruit==='antique'?'藏品券':'抽卡券')+'招募'+count+'次':'准备免费单次');prepare.dataset.recruitPayment=count>1?'ticket-'+count:payment;prepare.disabled=!gpDomainSelectable(id);prepare.onclick=()=>{if(prepare.disabled||!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id).data?.view!==view)return;$('gp-'+id+'-parameters').value=gpJson({...((selectedRecruit==='antique')?{recruit:'antique'}:{}),...(payment==='ticket'?{payment:'ticket',...(count>1?{count}:{})}:{})});gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已选择'+(payment==='ticket'?'自有'+(selectedRecruit==='antique'?'藏品券':'抽卡券')+count+'张':'免费单次')+'；重新探测资格和库存，再预览并单独授权。';};box.appendChild(prepare);s.actionControls.push(prepare);}
  const recruitRow=view?.candidates?.length===1?view.candidates[0]:null,taskSource=$('gp-'+id+'-parameters').value;
  const addTask=gpEl('button','将当前明确招募加入Tasks声明');addTask.type='button';addTask.dataset.recruitTaskPrepare='true';addTask._workflowPrepare=true;addTask._blocked=recruitRow?.executable!==true;addTask.disabled=addTask._blocked||!gpDomainSelectable(id)||!wfUnifiedEditable();
  addTask.onclick=()=>{
   if(addTask.disabled||!gpDomainSelectable(id)||!wfUnifiedEditable()||!gpSafe(scope,revision)||gpGet(id).data?.view!==view||$('gp-'+id+'-parameters').value!==taskSource||recruitRow?.executable!==true)return;
   try{
    const source=$('wf-unified-intent').value,intent=source.trim()?wfUnifiedData():{entry:'tasks',tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}};
    if(!['tasks','loop'].includes(intent.entry))throw Error('当前声明入口为Dailies；请先明确改为Tasks或Loop，再加入独立招募业务');
    if(intent.tasks.length>=48)throw Error('Tasks步骤已达48项上限');
    intent.tasks.push({kind:'free-recruit',parameters:JSON.parse(JSON.stringify(recruitRow.parameters))});wfInvalidateSettingPlans();$('wf-unified-intent').value=gpJson(intent);wfUnifiedRender();wfControls();
    $('gp-'+id+'-hint').textContent='已将当前'+(selectedRecruit==='antique'?'古董':'英雄')+'招募参数加入Tasks草稿；请核对原成本、配额和UID预算后生成预览，每项仍须重新调查并单次授权。';$('wf-unified-form-hint').textContent='已加入明确招募步骤，原累计预算未增加；本次仅编辑声明。';
   }catch(error){$('gp-'+id+'-hint').textContent=error.message;}
  };box.appendChild(addTask);s.actionControls.push(addTask);
  table(selectedRecruit==='antique'?'古董招募':'英雄招募',['支付模式','当前冷却标记','当前累计次数','广播站','开放等级','当前状态'],(view?.candidates||[]).map(row=>[row.parameters?.payment==='ticket'?'自有'+(selectedRecruit==='antique'?'藏品券':'抽卡券')+(row.parameters.count??1)+'张':'免费',view.recruit?.[selectedRecruit]?.freeEndTimeSeconds,view.recruit?.[selectedRecruit]?.recruitTimes,view.broadcast?.level,row.requiredLevel,row.executable?'可预览明确招募':row.blockedReason]));
  for(const observation of view?.taskObservations||[]){
   box.appendChild(gpEl('p',(observation.kind==='antique'?'古董':'英雄')+'累计任务（仅只读） · '+show(observation.source)+' · 当前季/配置季 '+show(observation.season)+' / '+show(observation.configuredSeason)+' · 累计进度 '+show(observation.progress)+' · 已领至 '+show(observation.claimedThroughId)+' · '+show(observation.status)));
   table('累计任务条件与奖励',['档位','目标进度','完成状态','领取状态','本次观察条件','配置奖励','执行状态'],(observation.tasks||[]).map(row=>[row.id,row.requiredProgress,row.completion==='COMPLETE'?'已达标':'未达标',row.rewardState==='CLAIMED'?'服务端记录已领':'未领',row.observedRequirementsMet?'达标且未领':'条件未满足',(row.rewards||[]).map(r=>r.id+' × '+r.num).join('、'),'不可执行']));
  }
  if(view?.taskObservations?.length)box.appendChild(gpEl('p','累计任务达标、服务端已领记录和实际奖励到账分别观察。空领奖请求无法绑定档位与赛季，累计领奖保持冻结；这些只读条件不会生成领取动作或授权，也不代表日常1002完成。'));
  const antique=view?.antiqueObservation;
  if(antique){
   const requirements=value=>value===true?'已观察到所需条件':value===false?'所需条件未满足':'未知';
   table('古董招募条件（仅只读）',['来源','当前冷却标记','当前累计次数','开放等级','自有藏品券','免费冷却'],[[antique.source,antique.recruit?.freeEndTimeSeconds,antique.recruit?.recruitTimes,antique.requiredLevel,antique.ownedTickets,antique.readiness]]);
   table('古董招募模式（条件观察）',['模式','次数','已观察条件','执行状态'],(antique.modes||[]).map(row=>[row.payment==='free'?'免费':'自有藏品券',row.count,requirements(row.observedRequirementsMet),'不可执行']));
   box.appendChild(gpEl('p','古董条件来自本次调查，不代表任务完成、奖励到账或写入资格。执行须明确选择古董，重新调查完整藏品与库存后预览并独立授权。广告、潜水和购买保持关闭。'));
  }
  for(const note of view?.notes||[])box.appendChild(gpEl('p',note));
 }else if(id==='free-gold'){
  table('普通免费点金',['已用','上限','剩余','服务器重置标记','当前状态'],(view?.candidates||[]).map(row=>[view.gold?.freeTimes,row.limit,row.remaining,view.gold?.resetTime,row.executable?'可预览免费单次':row.blockedReason]));
  const scope=viewGuard.capture(),revision=gpRevision,row=view?.candidates?.[0],count=gpEl('input'),duration=gpEl('input'),prepare=gpEl('button','准备明确次数免费点金');
  const taskSource=$('gp-'+id+'-parameters').value,addTask=gpEl('button','将当前免费单次点金加入Tasks声明');
  addTask.type='button';addTask.dataset.freeGoldTaskPrepare='true';addTask._workflowPrepare=true;addTask._blocked=row?.executable!==true;
  addTask.disabled=addTask._blocked||!gpDomainSelectable(id)||!wfUnifiedEditable();
  addTask.onclick=()=>{
   if(addTask.disabled||!gpDomainSelectable(id)||!wfUnifiedEditable()||!gpSafe(scope,revision)||gpGet(id)!==s||s.data?.view!==view||$('gp-'+id+'-parameters').value!==taskSource||row?.executable!==true)return;
   try{
    const source=$('wf-unified-intent').value,intent=source.trim()?wfUnifiedData():{entry:'tasks',tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}};
    if(!['tasks','loop'].includes(intent.entry))throw Error('请先明确将声明入口改为Tasks或Loop，再加入免费点金');
    if(intent.tasks.length>=48)throw Error('Tasks步骤已达48项上限');
    intent.tasks.push({kind:'free-gold',parameters:{expectedGold:JSON.parse(JSON.stringify(view.gold))}});
    wfInvalidateSettingPlans();$('wf-unified-intent').value=gpJson(intent);wfUnifiedRender();wfControls();
    $('gp-'+id+'-hint').textContent='已将当前完整点金状态绑定的免费单次加入Tasks草稿；请核对原周期配额和UID累计预算，每项重新调查并单独授权。';
    $('wf-unified-form-hint').textContent='已加入免费单次点金，原步骤与累计预算保留；不预测金币或增加额度。';
   }catch(error){$('gp-'+id+'-hint').textContent=error.message;}
  };box.appendChild(addTask);s.actionControls.push(addTask);

  const enabled=row?.executable===true&&Number.isInteger(row.remaining)&&row.remaining>0;
  count.type='number';count.min='1';count.max=String(Math.min(24,row?.remaining??0));count.step='1';count.value='';count.dataset.freeGoldCount='true';duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='';duration.dataset.freeGoldDuration='true';prepare.type='button';prepare.dataset.freeGoldPrepare='true';
  const label=(text,input)=>{const label=gpEl('label',text);label.appendChild(input);box.appendChild(label);};label('本次明确次数',count);label('本次总时长（秒）',duration);box.appendChild(prepare);
  const live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&Array.from(box.children).includes(prepare)&&gpDomainSelectable(id)&&wfEditorEditable();
  for(const control of [count,duration,prepare]){control._workflowPrepare=true;control._blocked=!enabled;s.actionControls.push(control);control.disabled=!enabled||!gpDomainSelectable(id)||!wfEditorEditable();}
  const changed=control=>{if(control.disabled||!live())return;gpInvalidate(id,false);wfInvalidateSettingPlans();$('gp-'+id+'-hint').textContent='点金组合草稿已改变，旧预览和授权已失效；重新准备同周期明确次数。';};count.oninput=count.onchange=()=>changed(count);duration.oninput=duration.onchange=()=>changed(duration);
  prepare.onclick=async()=>{
   if(prepare.disabled||!live())return;const countText=count.value,durationText=duration.value,n=Number(countText),seconds=Number(durationText);
   if(!/^[1-9][0-9]*$/.test(countText)||!Number.isInteger(n)||n>Math.min(24,row.remaining)||!/^[1-9][0-9]*$/.test(durationText)||!Number.isInteger(seconds)||seconds>86400){$('gp-'+id+'-hint').textContent='请明确1至当前剩余额度内的次数（最多24）和1至86400秒总时长。';return;}
   const payload={expectedGold:JSON.parse(JSON.stringify(view.gold)),count:n,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('free-gold-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision;
   const active=()=>gpSafe(requestScope,revision)&&gpGet(id)===s&&s.revision===edit&&s.data?.view===view&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&count.value===countText&&duration.value===durationText&&Array.from(box.children).includes(prepare);
   s.plan=null;s.selected.clear();gpClear($('gp-'+id+'-plan-view'));s.pending=true;gpControls(id);
   try{const data=await operationMutation('/api/gameplay/free-gold/prepare',payload,requestScope);if(!active())return;editor.accept(gpFreeGoldGraph(data,payload,requestScope.account));$('wf-hint').textContent='已载入同周期明确次数免费点金；核对次数、总时长及原配额/UID预算，每次重新调查、计划和授权。';$('gp-'+id+'-hint').textContent=data.limitation;}
   catch(cause){if(gpSafe(requestScope,revision)&&gpGet(id)===s&&s.revision===edit)$('gp-'+id+'-hint').textContent='免费点金组合未准备：'+cause.message;}
   finally{if(gpSafe(requestScope,revision)&&gpGet(id)===s){s.pending=false;gpControls(id);}}
  };
  box.appendChild(gpEl('p','每个动作仍为原普通免费单次，不发送批量或付费请求；不预测金币，不跨周期续领，不证明日常完成或领奖。准备不执行、不授权，拒绝或UNKNOWN停止后续。'));
  for(const note of view?.notes||[])box.appendChild(gpEl('p',note));
 }else if(id==='afk-level-rewards'){
  const scope=viewGuard.capture(),revision=gpRevision,afk=view?.afk,prepare=gpEl('button','准备普通时段收益');prepare.dataset.afkIncomePrepare='true';prepare._blocked=!afk||!['level','afkStartTime','afkFinishTime'].every(k=>Number.isInteger(afk[k])&&afk[k]>0)||afk.afkFinishTime<=afk.afkStartTime;prepare.disabled=prepare._blocked||!gpDomainSelectable(id);
  prepare.onclick=()=>{if(prepare.disabled||!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id).data?.view!==view)return;$('gp-'+id+'-parameters').value=gpJson({action:'income',level:afk.level,afkStartTime:afk.afkStartTime,afkFinishTime:afk.afkFinishTime});gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已固定本段挂机等级及起止时间；重新探测可信服务器时钟、完整库存和徽章，预览后单独授权。';};box.appendChild(prepare);s.actionControls.push(prepare);
  for(const levels of [1,5,10]){const upgrade=gpEl('button','准备升级'+levels+'级');upgrade.dataset.afkUpgradePrepare=String(levels);upgrade._blocked=!Number.isInteger(afk?.level)||afk.level<=0||afk.level+levels>2147483647;upgrade.disabled=upgrade._blocked||!gpDomainSelectable(id);upgrade.onclick=()=>{if(upgrade.disabled||!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id).data?.view!==view)return;$('gp-'+id+'-parameters').value=gpJson({action:'upgrade',level:afk.level,levels});gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已固定当前等级及升级增量；须先有同连接已确认收益，重新探测主线门槛、逐档成本和共享历史，预览后单独授权。';};box.appendChild(upgrade);s.actionControls.push(upgrade);}
  const preparation=view?.upgradePreparation,levelsLabel=gpEl('label','收益确认后增加级数'),levelsChoice=gpEl('select');levelsChoice.dataset.afkChainLevels='true';const empty=gpEl('option','请选择1、5或10级');empty.value='';levelsChoice.appendChild(empty);for(const quote of preparation?.options||[]){const option=gpEl('option',quote.levels+'级 · '+operationCosts(quote.costs)+' · '+(quote.blockedReason||'当前可准备'));option.value=String(quote.levels);option.disabled=Boolean(quote.blockedReason);levelsChoice.appendChild(option);}levelsChoice.value='';levelsChoice._blocked=preparation?.reliable!==true;levelsLabel.appendChild(levelsChoice);box.appendChild(levelsLabel);
  const durationLabel=gpEl('label','本次总时长（秒）'),duration=gpEl('input');duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='';duration.dataset.afkChainDuration='true';durationLabel.appendChild(duration);box.appendChild(durationLabel);
  const chain=gpEl('button','准备收益确认后升级');chain.dataset.afkChainPrepare='true';chain._workflowPrepare=true;chain._blocked=preparation?.reliable!==true||!(preparation.options||[]).some(row=>row.blockedReason===null);
  const valid=()=>!chain.disabled&&gpDomainSelectable(id)&&gpSafe(scope,revision)&&gpGet(id).data?.view===view&&wfEditorEditable();
  chain.onclick=async()=>{
   if(!valid())return;const choice=levelsChoice.value,secondsText=duration.value,levels=Number(choice),seconds=Number(secondsText),quote=preparation.options.find(row=>row.levels===levels);
   if(![1,5,10].includes(levels)||!quote||quote.blockedReason||!/^[1-9][0-9]*$/.test(secondsText)||!Number.isInteger(seconds)||seconds>86400){$('gp-'+id+'-hint').textContent='请明确选择增加1、5或10级及1至86400秒总时长；先以普通收益参数重新探测资格与自有材料。';return;}
   const payload={level:afk.level,levels,afkStartTime:afk.afkStartTime,afkFinishTime:afk.afkFinishTime,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('afk-upgrade-prepare'),editor=captureStageRecommendationEditor(),stateRevision=++s.revision;
   const active=()=>gpSafe(requestScope,revision)&&gpGet(id)===s&&s.revision===stateRevision&&s.data?.view===view&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&levelsChoice.value===choice&&duration.value===secondsText;
   s.plan=null;gpClear($('gp-'+id+'-plan-view'));s.pending=true;gpControls(id);
   try{const data=await operationMutation('/api/gameplay/afk/upgrade/prepare',payload,requestScope);if(!active())return;editor.accept(gpAfkUpgradeGraph(data,payload,view,requestScope.account));$('wf-hint').textContent='已载入收益确认后明确升级预览；核对原收益区间、固定成本、父预算和总时长，再开始并授权。';$('gp-'+id+'-hint').textContent=data.limitation;}
   catch(cause){if(gpSafe(requestScope,revision)&&gpGet(id)===s)$('gp-'+id+'-hint').textContent='挂机组合未准备：'+cause.message;}
   finally{if(gpSafe(requestScope,revision)&&gpGet(id)===s){s.pending=false;gpControls(id);}}
  };
  box.appendChild(chain);for(const control of [levelsChoice,duration,chain]){control.disabled=control._blocked||!gpDomainSelectable(id);s.actionControls.push(control);}box.appendChild(gpEl('p','组合准备须先以普通收益参数重新探测。原区间和升级成本固定；收益确认落盘后再独立调查新段。预算不随收入扩大，拒绝或UNKNOWN停止，准备不执行、不授权。'));
  table('普通挂机时段',['当前等级','起始秒','上限秒','最小经过秒','奖励金额'],[[afk?.level,afk?.afkStartTime,afk?.afkFinishTime,view?.income?.minimumElapsedSeconds??61,'以服务端回执和独立净入确认']]);
  box.appendChild(gpEl('p','普通收益不要求整段到期；资格使用可信服务器时间，边界至少经过61秒。准备不派发，不使用广告、不升级；结果未知或重启不重放。'));
  table('挂机等级与奖励',['当前等级','已领奖等级','下一档','配置奖励','当前状态'],(view?.candidates||[]).map(row=>[view.afk?.level,view.afk?.rewardedLevel,row.target?.level,(row.rewards||[]).map(reward=>reward.id+' × '+reward.num).join('、')||'未知',row.executable?(row.actionType==='UPGRADE'?'可预览升级':row.actionType==='INCOME'?'可预览收益':'可预览领取'):row.blockedReason]));
  for(const note of view?.notes||[])box.appendChild(gpEl('p',note));
 }else if(id==='task-rewards'){
  gpRenderTaskRewardTarget(box,view);
  gpRenderDailyRewardClosing(box,view);
  gpRenderTaskRewardClosing(box,view);
  if(view?.qualificationObservations){table('任务进度与奖励记录（只读）',['种类','任务 ID','来源状态','进度','目标','完成状态','奖励记录','进度条件满足','奖励到账','来源说明'],view.qualificationObservations.map(row=>[row.kind,row.taskId,row.status,row.progress,row.requiredProgress,row.completion,row.rewardState,row.observedRequirementsMet,row.settlement,row.reason]));box.appendChild(gpEl('p','只读进度复用原任务解析；库存或奖励映射不可用时仍可观察可靠任务来源。完成、奖励记录和到账分别展示，写入仍须完整原Function资格、库存验证与单次授权。未知来源或账号变化不推定可领。'));}
  if(view?.targetSelection?.status==='OBSERVED_DEFINITIONS'){table('原同类任务配置目标（仅选择来源）',['ID','所需进度','当前季','配置季','原配置奖励'],(view.targetSelection.targets||[]).map(row=>[row.id,row.requiredProgress,row.season,row.configuredSeason,operationCosts(row.rewards)]));box.appendChild(gpEl('p','配置目标仅供明确选择；不表示任务完成、可领取或已到账。选择后仍须重新调查原周期、库存与原Function资格。'));}
  if(view?.battlePassObservation){const o=view.battlePassObservation;table('战令任务只读观察',['任务 ID','任务类型','进度','配置目标','完成状态','任务奖励记录','资格','积分到账'],[[o.taskId,o.taskType,o.progress,o.requiredProgress,o.completion,o.taskRewardState,'未知',o.scoreReceipt]]);table('战令独立观察',['累计积分','配置任务积分','付费激活观察','窗口来源状态','type1活动期数','活动开始秒','活动结束秒','任务周期与窗口归属'],[[o.totalScore,o.expectedTaskScore,o.activePay,o.windowStatus,o.activityWindow?.period,o.activityWindow?.startTime,o.activityWindow?.endTime,'未知/未证实绑定']]);table('战令档位记录（非任务奖励）',['档位','普通奖励已领记录','付费奖励已领记录'],(o.rewardStages||[]).map(row=>[row.stage,row.freeGot,row.payGot]));box.appendChild(gpEl('p','战令仅只读；任务完成不等于可领，任务isGot不等于积分到账，普通/付费档位与任务独立。累计积分不作增量；窗口不能证明每日周期或同次归属，不生成领取动作。'));}
  else if(Object.hasOwn(GP_OPEN_RANK_LABELS,view?.candidates?.[0]?.parameters?.kind)){const row=view.candidates[0];box.appendChild(gpEl('p',GP_OPEN_RANK_LABELS[row.parameters.kind]+' · type '+show(row.target?.type)+' · score档位 '+show(row.parameters.tierId)+' · 已领score '+show(view.daily?.gotRewardId?.join('、'))+' · 进度 '+show(view.daily?.progress)+' · 当前季/配置季 '+show(row.target?.season)+' / '+show(row.target?.configuredSeason)+' · 服务器窗口（秒） '+show(row.target?.startTime)+' 至 '+show(row.target?.endTime)+'；只领明确任务档位，窗口观察不能代替领取资格或结算。'));}
  else if(view?.candidates?.[0]?.parameters?.kind==='weekly-chip-task'){const a=view.daily?.activityTime?.find(r=>r.type===6);box.appendChild(gpEl('p','周芯片任务 · 当前轮次 '+show(view.daily?.round)+' · 累计积分 '+show(view.daily?.score)+' · 已领任务 '+show(view.daily?.gotTaskId?.join('、'))+' · 活动期数 '+show(a?.period)+' · 服务器窗口（秒） '+show(a?.startTime)+' 至 '+show(a?.endTime)+'；仅领取配置奖励并持有宝箱，不打开。'));}
  else if(['weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift'].includes(view?.candidates?.[0]?.parameters?.kind)){const unique=view.candidates[0].parameters.kind==='weekly-unique-lottery-gift',chip=view.candidates[0].parameters.kind==='weekly-chip-gift',a=view.daily?.activityTime?.find(r=>r.type===(chip?6:unique?7:4));box.appendChild(gpEl('p',(chip?'周芯片免费礼包':unique?'周翻牌免费礼包 · 已领 '+show(view.daily?.gotFree):'周转盘免费礼包')+' · 活动期数 '+show(a?.period)+' · 服务器窗口（秒） '+show(a?.startTime)+' 至 '+show(a?.endTime)+'；仅当前窗口，领取记录缺失时不推断未领。'));if(chip)table('周芯片礼包领取记录',['礼包 ID','领取计次'],(view.daily?.gift||[]).map(r=>[r.giftId,r.paidTimes]));else table('周转盘礼包领取记录',['礼包 ID','已领次数','充值标记'],(view.daily?.gift||[]).map(r=>[r.giftId,r.gotTimes,r.charge]));}
  else if(view?.candidates?.[0]?.parameters?.kind==='daily-gift')box.appendChild(gpEl('p','免费赠礼 · 服务器原样标记 '+show(view.daily?.resetMarker)+' · 英雄 '+show(view.daily?.heroId)+'；不据此安排日重领。'));
  else if(view?.daily)box.appendChild(gpEl('p','服务器日常重置标记 '+show(view.daily.resetTime)+' · 日活跃 '+show(view.daily.dailyActivity)+' · 周活跃 '+show(view.daily.weeklyActivity)));
  for(const row of view?.candidates||[])if(row.parameters?.kind==='daily')box.appendChild(gpEl('p','本次配置活跃增量 '+show(row.activityGain)+'；日周活跃和 EXP 须在同周期独立复读一致。'));
  table('任务进度与配置奖励',['任务类型','任务 / 档位 ID','进度','目标','奖励','当前状态'],(view?.candidates||[]).map(row=>[Object.hasOwn(GP_OPEN_RANK_LABELS,row.target?.kind)?GP_OPEN_RANK_LABELS[row.target.kind]+'档位':row.target?.kind==='weekly-chip-task'?'周芯片任务':row.target?.kind==='weekly-chip-gift'?'周芯片免费礼包':row.target?.kind==='weekly-unique-lottery-gift'?'周翻牌免费礼包':row.target?.kind==='weekly-lottery-gift'?'周转盘免费礼包':row.target?.kind==='daily-gift'?'免费赠礼':row.target?.kind==='daily-activity'?'日活跃宝箱':row.target?.kind==='daily'?'日常':row.target?.kind==='achievement'?'成就':row.target?.kind==='main'?'主线':row.target?.kind==='branch'?'支线':WF_UNIFIED_KINDS[row.target?.kind]||'未知任务种类',row.target?.taskId??row.target?.tierId??row.target?.packId,row.progress,row.requiredProgress,(row.rewards||[]).map(reward=>reward.id+' × '+reward.num).join('、')||'未知',row.executable?'可预览领取':row.blockedReason]));
  for(const note of view?.notes||[])box.appendChild(gpEl('p',note));
 }else if(id==='antique-growth'){
  gpRenderGrowthBatch(box,view,id);
  const scope=viewGuard.capture(),revision=gpRevision;
  const valid=control=>!control.disabled&&gpDomainSelectable(id)&&gpSafe(scope,revision)&&gpGet(id).data?.view===view;
  const draft=parameters=>{
   $('gp-'+id+'-parameters').value=gpJson(parameters);gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);
   $('gp-'+id+'-hint').textContent='已更新单次业务参数；请重新探测，再预览成本和授权。';
  };
  table('藏品与自有碎片',['藏品','品质','状态','星级','对应碎片','持有','万能碎片','万能持有'],(view?.antiques||[]).map(row=>[row.name||row.antiqueId,row.color,row.owned?'已激活':'未激活',row.star,row.fragmentId,row.fragments,row.universalItemId,row.universalFragments]));
  box.appendChild(gpEl('p','单次选择：激活一件、升一星、套装激活或升一级、精通升一级，或用已持有的万能碎片按 1:1 兑换专属碎片。兑换后须另行选择养成动作。'));
  const label=gpEl('label','选择藏品'),select=gpEl('select'),empty=gpEl('option','请选择藏品');empty.value='';select.appendChild(empty);
  for(const row of view?.antiques||[]){const option=gpEl('option',(row.name||row.antiqueId)+' · '+(row.owned?'已激活':'未激活'));option.value=row.antiqueId;select.appendChild(option);}
  select.dataset.antiqueChoice='true';select.disabled=!gpDomainSelectable(id);
  select.onchange=()=>{
   if(!valid(select))return;
   const row=view.antiques.find(row=>row.antiqueId===select.value);if(!row)return;
   const old=gpParse('gp-'+id+'-parameters'),parameters={antiqueId:row.antiqueId};
   if(['activate','star','exchange'].includes(old.action))parameters.action=old.action;
   // A new target requires a new explicit exchange quantity.
   draft(parameters);
  };
  label.appendChild(select);box.appendChild(label);s.actionControls.push(select);
  table('藏品套装',['套装','品质','等级','已拥有成员','激活所需','等级上限','精通开放等级','生效数量','特殊效果服务器值'],(view?.suits||[]).map(row=>[row.name||row.suitId,row.color,row.level,row.ownedMembers,row.requiredMembers,row.maximumLevel,row.unlockedLevel,row.effectiveNum,row.advEffectValue]));
  const suitLabel=gpEl('label','选择套装'),suitSelect=gpEl('select'),suitEmpty=gpEl('option','请选择套装');suitEmpty.value='';suitSelect.appendChild(suitEmpty);
  for(const row of view?.suits||[]){const option=gpEl('option',String(row.suitId)+' · '+(row.name||row.suitId));option.value=String(row.suitId);suitSelect.appendChild(option);}
  suitSelect.dataset.antiqueSuitChoice='true';suitSelect.disabled=!gpDomainSelectable(id);
  suitSelect.onchange=()=>{if(!valid(suitSelect))return;const row=view?.suits?.find(row=>String(row.suitId)===suitSelect.value);if(row)draft({action:'suit',suitId:row.suitId});};
  suitLabel.appendChild(suitSelect);box.appendChild(suitLabel);s.actionControls.push(suitSelect);
  if(view?.master){const row=view.master;table('藏品精通',['当前等级','总星数','等级上限','套装开放等级','下级需求与成本'],[[row.level,row.totalStars,row.maxLevel,row.unlockedSuitLevel,gpJson(row.next)]]);}
  for(const mode of [{label:'激活一件',action:'activate'},{label:'升一星',action:'star'},{label:'套装激活或升一级',action:'suit'},{label:'精通升一级',action:'master'},{label:'兑换专属碎片',action:'exchange'}]){
   const button=gpEl('button',mode.label);button.dataset.antiqueMode=mode.action;button.disabled=!gpDomainSelectable(id);
   button.onclick=()=>{
    if(!valid(button))return;
    const old=gpParse('gp-'+id+'-parameters'),parameters={action:mode.action};
    if(['activate','star','exchange'].includes(mode.action)&&old.antiqueId!==undefined)parameters.antiqueId=old.antiqueId;
    if(mode.action==='suit'&&old.suitId!==undefined)parameters.suitId=old.suitId;
    draft(parameters);
   };
   s.actionControls.push(button);box.appendChild(button);
  }
  const numLabel=gpEl('label','本次兑换数量'),num=gpEl('input');num.type='number';num.min='1';num.max='2147483647';num.step='1';num.value='';num.dataset.antiqueExchangeQuantity='true';num.disabled=!gpDomainSelectable(id);
  const apply=gpEl('button','准备指定数量兑换');apply.dataset.antiqueExchangePrepare='true';apply.disabled=!gpDomainSelectable(id);
  apply.onclick=()=>{if(!valid(apply))return;const old=gpParse('gp-'+id+'-parameters'),quantity=Number(num.value);if(!old.antiqueId||!Number.isInteger(quantity)||quantity<1||quantity>2147483647){$('gp-'+id+'-hint').textContent='先选择藏品，并输入本次兑换的正整数数量。';return;}draft({action:'exchange',antiqueId:old.antiqueId,num:quantity});};
  numLabel.appendChild(num);box.appendChild(numLabel);box.appendChild(apply);s.actionControls.push(num,apply);
 }else if(id==='pet'){
  gpRenderPetTarget(box,view);
  gpRenderGrowthBatch(box,view,id);
  const scope=viewGuard.capture(),revision=gpRevision;
  const valid=control=>!control.disabled&&gpDomainSelectable(id)&&gpSafe(scope,revision)&&gpGet(id).data?.view===view;
  const draft=parameters=>{$('gp-'+id+'-parameters').value=gpJson(parameters);gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已更新海兽操作；请重新探测，再选择明确实例并预览。';};
  for(const mode of [{action:'feed',label:'单次投喂'},{action:'level',label:'服役海兽升一级'},{action:'claim',label:'领取成熟海兽'},{action:'breed',label:'自有普通基因培育'},{action:'gene-exchange',label:'自有基因包兑换'}]){
   const button=gpEl('button',mode.label);button.dataset.petMode=mode.action;button.disabled=!gpDomainSelectable(id);
   button.onclick=()=>{if(valid(button))draft({action:mode.action});};box.appendChild(button);s.actionControls.push(button);
  }
  table('服役海兽',['建筑','海兽 UID'],(view?.serving||[]).map(row=>[row.buildingId,row.uid]));
  if(view?.mode==='level'){
   box.appendChild(gpEl('p','玩家等级 '+show(view.playerLevel)+'；每次仅升级明确建筑正在服役的同一海兽一级，按下级配置扣自有海兽经验。'));
   table('单级升级',['建筑','海兽 UID','当前等级','目标等级','成本','状态'],(view?.candidates||[]).filter(row=>row.actionType==='LEVEL').map(row=>[row.target.buildingId,row.target.uid,row.target.fromLevel,row.target.toLevel,operationCosts(row.costs),row.executable?'可以预览':row.blockedReason]));
  }
  table('当前成熟海兽',['培育室','海兽','星级'],(view?.rooms||[]).flatMap(room=>(room.queue?.maturePets||[]).map(p=>[room.buildingId,p.petId,p.star])));
  if(!['level','claim','breed','gene-exchange'].includes(view?.mode)){
  table('普通培育条件（只读）',['海兽','专属基因与金币','所需秒数','赛季','库存','队列','条件'],(view?.breeding?.candidates||[]).map(row=>[row.petId,operationCosts(row.costs),row.breedTime,row.seasonAvailable?'已开放':'未开放',row.stockAvailable?'足够':'不足',row.queueAvailable===null?'未知':row.queueAvailable?'有空位':'无空位',row.conditions==='MET'?'条件满足；须明确准备':row.conditions==='NOT_MET'?'条件未满足':'未知']));
  box.appendChild(gpEl('p','普通培育仅观察专属基因、金币、赛季和队列条件；'+(view?.breeding?.status==='UNKNOWN'?'来源未知：'+show(view.breeding.reason)+'。':'')+'条件满足不代表可执行；须切换普通基因培育模式，明确海兽与当前队列后重新调查授权。基因自选包可切换独立兑换模式明确目标和数量；成熟领取须切换独立模式明确当前完整列表。'));
  table('培育队列',['培育室','任务idx','海兽','星级','开始时间','完成时间'],(view?.rooms||[]).flatMap(room=>(room.queue?.breedQ||[]).map(job=>[room.buildingId,job.idx,job.petId,job.star,job.startTime,job.finishTime])));
  table('单次投喂',['培育室','任务idx','海兽','材料成本','状态'],(view?.candidates||[]).filter(row=>row.actionType==='FEED').map(row=>[row.target.buildingId,row.target.jobIdx,row.target.petId,operationCosts(row.costs),row.executable?'可以预览':row.blockedReason]));
  box.appendChild(gpEl('p','每次只投喂指定培育批次一次，减时 '+String(view?.secondsReduced??'未知')+' 秒；只用自有材料。成熟列表变化须独立复读，不自动领取或补料。'));
  }
 }else if(id==='badge-growth'){
  gpRenderBadgeTarget(box,view);
  gpRenderGrowthBatch(box,view,id);
  const scope=viewGuard.capture(),revision=gpRevision,rows=view?.candidates||[];
  const putOn=view?.mode==='put-on'||rows.some(row=>row.actionType==='PUT-ON'),star=view?.mode==='star'||rows.some(row=>row.actionType==='STAR');
  function draftButton(label,key,value,draft){
   const button=gpEl('button',label);button.dataset[key]=value;button.disabled=!gpDomainSelectable(id);
   button.onclick=()=>{
    if(button.disabled||!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id).data?.view!==view)return;
    $('gp-'+id+'-parameters').value=gpJson(draft());gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);
    $('gp-'+id+'-hint').textContent='草稿已更新；请重新探测，再选择具体徽章。';
   };
   s.actionControls.push(button);box.appendChild(button);
  }
  draftButton('查看单次升级','badgeGrowthMode','level',()=>({}));
  draftButton('穿到空槽','badgeGrowthMode','put-on',()=>({action:'put-on'}));
  draftButton('查看红徽章单次升星','badgeGrowthMode','star',()=>{const old=gpParse('gp-'+id+'-parameters'),draft={action:'star'};for(const key of ['heroId','uid'])if(old[key]!==undefined)draft[key]=old[key];return draft;});
  if(putOn){
   box.appendChild(gpEl('p','选择已解锁的空槽，再探测该槽可穿戴的自有闲置徽章。'));
   for(const hero of view?.heroes||[])for(const pos of hero.emptySlots||[]){
    if(typeof hero.heroId==='string'&&Number.isSafeInteger(pos)&&pos>=1&&pos<=4)draftButton(hero.heroId+' · '+pos+' 号空槽','badgeEmptySlot',String(pos),()=>({action:'put-on',heroId:hero.heroId,pos}));
   }
   if(rows.length)table('空槽徽章候选',['英雄','槽位','徽章','UID','本次消耗'],rows.filter(row=>row.actionType==='PUT-ON'&&row.beforeState?.badge).map(row=>[row.target.heroId,row.target.pos,row.beforeState.badge.badgeId,row.target.uid,operationCosts(row.costs)]));
  }else if(star){
   table('红徽章单次升星',['英雄','槽位','徽章','UID','等级','星级','当前经验','本次消耗'],rows.filter(row=>row.actionType==='STAR'&&row.beforeState?.badge).map(row=>[row.target.heroId,row.target.pos,row.beforeState.badge.badgeId,row.target.uid,row.beforeState.badge.level,row.beforeState.badge.star,row.beforeState.badge.exp,operationCosts(row.costs)]));
   box.appendChild(gpEl('p','红徽章每次只升一星，使用自有徽章升星石和金币；不分解其他徽章。'));
  }else{
   table('已佩戴徽章',['英雄','槽位','徽章','UID','等级','当前经验','本次消耗'],rows.filter(row=>row.actionType==='LEVEL'&&row.beforeState?.badge).map(row=>[row.target.heroId,row.target.pos,row.beforeState.badge.badgeId,row.target.uid,row.beforeState.badge.level,row.beforeState.badge.exp,operationCosts(row.costs)]));
   box.appendChild(gpEl('p','给已佩戴徽章精确补足下一级经验，扣除对应金币；升级后经验余量须为零。只消耗自有材料，不消耗其他徽章；达到等级上限的升级仍待结算证据。'));
  }
 }else if(id==='equipment-growth'){
  gpRenderEquipmentTarget(box,view);
  gpRenderGrowthBatch(box,view,id);
  table('已佩戴装备单次成长',['英雄','UID','装备','等级','星级','精炼等级'],(view?.heroes||[]).flatMap(hero=>(hero.equips||[]).map(equip=>[hero.heroId,equip.uid,equip.equipId,equip.level,equip.star,equip.refineLv])));
  if(view?.candidates?.some(row=>row.actionType==='PUT-ON')){
   table('空槽穿戴候选',['英雄','装备种类','装备','UID','状态'],view.candidates.filter(row=>row.actionType==='PUT-ON'&&row.beforeState?.equipment).map(row=>[row.target.heroId,row.target.type,row.beforeState.equipment.equipId,row.target.uid,row.executable?'可以预览':row.blockedReason]));
   box.appendChild(gpEl('p','先填写英雄 ID，再探测可穿戴的自有闲置装备。只穿到空槽，不替换已佩戴装备。'));
  }
  box.appendChild(gpEl('p','首次升级须明确当前零级且第一级配置费用为零，复读确认库存不变。其他等级单次消耗自有精铁；显式红装精炼消耗精铁与精炼石，单次升星消耗升星石与精铁。卸下明确已佩戴UID仅回闲置池，零资源支出，装备完整状态保持。目标英雄战力与属性以服务器完整复读为准。'));
  const scope=viewGuard.capture(),revision=gpRevision;for(const mode of [{label:'查看单次等级',action:null},{label:'查看首次升级（0→1）',action:'initial-level'},{label:'查看红装单次精炼',action:'refine'},{label:'穿到空槽',action:'put-on'},{label:'查看红装单次升星',action:'star'},{label:'卸下已佩戴装备',action:'take-off'}]){const button=gpEl('button',mode.label);button.dataset.equipmentGrowthMode=mode.action||'level';button._blocked=false;button.disabled=!gpDomainSelectable(id);button.onclick=()=>{if(button.disabled||!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id).data?.view!==view)return;const old=gpParse('gp-'+id+'-parameters'),parameters={};for(const key of ['heroId','uid'])if(old[key]!==undefined)parameters[key]=old[key];if(mode.action)parameters.action=mode.action;$('gp-'+id+'-parameters').value=gpJson(parameters);gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已选择成长种类；请重新探测明确目标、成本并单次授权。';};s.actionControls.push(button);box.appendChild(button);}
 }else if(id==='formation-unlock'){
  gpRenderFormationUnlockTarget(box,view);
  gpRenderGrowthBatch(box,view,id);
  table('普通阵型模板',['模板','名称','对应已有图纸','解锁状态'],(view?.templates||[]).map(row=>[row.presetId,row.name,operationCosts(row.costs),view?.unlockedPresetIds?.includes(row.presetId)?'已解锁':'未解锁']));
  box.appendChild(gpEl('p','仅消耗已持有的对应图纸一张；解锁后必须重新读取阵容列表，再单独预览并授权应用。'));
 }else if(id==='heroes'){
  gpRenderHeroTarget(box,view);
  gpRenderGrowthBatch(box,view,id);
  table('英雄成长',['英雄','等级','星级','技能槽等级','战力','专武等级','专武星级'],(view?.heroes||[]).map(hero=>[hero.heroId,hero.level,hero.star,Array.isArray(hero.skillLevels)?hero.skillLevels.join(' / '):null,hero.power,hero.exclusive?.level,hero.exclusive?.star]));
  box.appendChild(gpEl('p','每个候选只成长一级或一个技能槽。通用碎片可按指定数量1:1兑换英雄专属碎片；可生成明确补足后单次升星的有限工作流；各步重新调查、预览并授权，UNKNOWN停止。'));
  const scope=viewGuard.capture(),revision=gpRevision;for(const mode of [{label:'查看基础成长',action:null},{label:'查看专武首次激活',action:'exclusive-activate'},{label:'查看专武单次升级',action:'exclusive-level'},{label:'查看专武单次升星',action:'exclusive-star'},{label:'查看碎片兑换',action:'fragment-exchange'}]){const button=gpEl('button',mode.label);button.dataset.heroGrowthMode=mode.action||'basic';button._blocked=false;button.disabled=!gpDomainSelectable(id);button.onclick=()=>{if(button.disabled||!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id).data?.view!==view)return;const old=gpParse('gp-'+id+'-parameters'),parameters={};if(old.heroId!==undefined)parameters.heroId=old.heroId;if(mode.action)parameters.action=mode.action;$('gp-'+id+'-parameters').value=gpJson(parameters);gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已选择成长种类；请重新探测明确英雄、成本并单次授权。';};s.actionControls.push(button);box.appendChild(button);}
  table('英雄碎片库存',['英雄','万能碎片','持有数量','专属碎片','持有数量'],(view?.fragments||[]).map(row=>[row.heroId,row.sourceId,row.sourceNum,row.targetId,row.targetNum]));
  const heroLabel=gpEl('label','兑换目标英雄'),heroSelect=gpEl('select');heroSelect.dataset.heroExchangeTarget='true';heroSelect.appendChild(gpEl('option','请选择英雄'));heroSelect.children[0].value='';
  for(const hero of view?.heroes||[]){const option=gpEl('option',hero.heroId);option.value=hero.heroId;heroSelect.appendChild(option);}
  const numLabel=gpEl('label','本次兑换数量'),num=gpEl('input');num.type='number';num.min='1';num.max='2147483647';num.step='1';num.value='';num.dataset.heroExchangeQuantity='true';
  const prepare=gpEl('button','准备指定数量兑换');prepare.dataset.heroExchangePrepare='true';
  const valid=control=>!control.disabled&&gpHeroExchangeEditable()&&gpSafe(scope,revision)&&gpGet(id).data?.view===view;
  const draft=parameters=>{$('gp-'+id+'-parameters').value=gpJson(parameters);gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已更新兑换目标；请重新探测库存并预览本次数量。';};
  heroSelect.onchange=()=>{if(!valid(heroSelect))return;num.value='';draft({action:'fragment-exchange',...(heroSelect.value?{heroId:heroSelect.value}:{})});};
  num.oninput=()=>{if(!valid(num))return;draft({action:'fragment-exchange',...(heroSelect.value?{heroId:heroSelect.value}:{})});};
  prepare.onclick=()=>{if(!valid(prepare))return;const quantity=Number(num.value);if(!heroSelect.value||!Number.isInteger(quantity)||quantity<1||quantity>2147483647){$('gp-'+id+'-hint').textContent='先选择英雄，并输入本次兑换的正整数数量。';return;}draft({action:'fragment-exchange',heroId:heroSelect.value,num:quantity});};
  const exchangeDraft=gpParse('gp-'+id+'-parameters');if(exchangeDraft.action==='fragment-exchange'){heroSelect.value=exchangeDraft.heroId||'';num.value=exchangeDraft.num===undefined?'':String(exchangeDraft.num);}
  const durationLabel=gpEl('label','兑换及升星总时长（秒）'),duration=gpEl('input');duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='';duration.dataset.heroStarDuration='true';durationLabel.appendChild(duration);
  const sequenceBox=gpEl('div'),sequenceAdd=gpEl('button','加入升星顺序'),sequencePrepare=gpEl('button','预览按顺序逐英雄升星');sequenceAdd.dataset.heroStarAdd='true';sequencePrepare.dataset.heroStarSequencePrepare='true';sequencePrepare._heroStarPrepare=true;
  s.heroStarTargets=s.heroStarTargets||[];const sequence=()=>gpJson(s.heroStarTargets),sequenceChange=()=>{gpInvalidate(id,true);gpRenderCandidates(id);drawSequence();gpControls(id);};
  function drawSequence(){gpClear(sequenceBox);s.actionControls=s.actionControls.filter(control=>!control._heroStarList);for(const [index,row]of s.heroStarTargets.entries()){
   const line=gpEl('div',(index+1)+'. '+row.heroId+' · 明确兑换 '+row.num+' 个'),token=sequence();
   for(const [label,kind]of [['上移','up'],['下移','down'],['移除','remove']]){const button=gpEl('button',label);button.dataset.heroStarList=kind;button.dataset.heroStarListIndex=String(index);button._heroExchangeDraft=true;button._heroStarList=true;button._blocked=kind==='up'&&index===0||kind==='down'&&index===s.heroStarTargets.length-1;button.disabled=button._blocked||!gpHeroExchangeEditable();button.onclick=()=>{if(!valid(button)||sequence()!==token)return;if(kind==='remove')s.heroStarTargets.splice(index,1);else{const next=index+(kind==='up'?-1:1);[s.heroStarTargets[index],s.heroStarTargets[next]]=[s.heroStarTargets[next],s.heroStarTargets[index]];}sequenceChange();};s.actionControls.push(button);line.appendChild(button);}sequenceBox.appendChild(line);
  }if(!s.heroStarTargets.length)sequenceBox.textContent='尚未声明多英雄顺序。每个英雄最多一星；已有足够专属碎片可明确填0。';}
  sequenceAdd.onclick=()=>{if(!valid(sequenceAdd))return;const n=Number(num.value);if(!heroSelect.value||!/^(0|[1-9][0-9]*)$/.test(num.value)||!Number.isInteger(n)||n>2147483647||s.heroStarTargets.length>=12||s.heroStarTargets.some(row=>row.heroId===heroSelect.value)){$('gp-'+id+'-hint').textContent='顺序须1至12个不同英雄，兑换量为明确非负整数；0仅用于已有足够专属碎片。';return;}s.heroStarTargets.push({heroId:heroSelect.value,num:n});sequenceChange();};
  const starPrepare=gpEl('button','预览兑换后单次升星工作流');starPrepare.dataset.heroStarPrepare='true';starPrepare._heroStarPrepare=true;
  starPrepare.onclick=()=>prepareStar(false);sequencePrepare.onclick=()=>prepareStar(true);
  async function prepareStar(multiple){
   if(!valid(multiple?sequencePrepare:starPrepare)||!wfEditorEditable())return;
   const heroId=heroSelect.value,quantityText=num.value,durationText=duration.value,quantity=Number(quantityText),seconds=Number(durationText);
   if((multiple?s.heroStarTargets.length<1||s.heroStarTargets.length>12:!heroId||!/^[1-9][0-9]*$/.test(quantityText)||!Number.isInteger(quantity)||quantity>2147483647)||!/^[1-9][0-9]*$/.test(durationText)||!Number.isInteger(seconds)||seconds>86400){$('gp-'+id+'-hint').textContent='须明确英雄、恰好补足下一星的兑换数量及1至86400秒总时长。';return;}
   const payload={...(multiple?{targets:s.heroStarTargets.map(row=>({...row}))}:{heroId,num:quantity}),maxDurationMs:seconds*1000},sequenceSource=sequence();
   const requestScope=viewGuard.begin('hero-star-prepare'),editor=captureStageRecommendationEditor(),stateRevision=++s.revision;
   const active=()=>gpSafe(requestScope,revision)&&gpGet(id)===s&&s.revision===stateRevision&&s.data?.view===view&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&heroSelect.value===heroId&&num.value===quantityText&&duration.value===durationText&&sequence()===sequenceSource;
   s.plan=null;gpClear($('gp-'+id+'-plan-view'));s.pending=true;gpControls(id);
   try{
    const data=await operationMutation('/api/gameplay/heroes/star/prepare',payload,requestScope);
    if(!active())return;
    const graph=gpHeroStarGraph(data,payload,view,requestScope.account);
    editor.accept(graph);$('wf-hint').textContent='已载入明确顺序的单星预览；请核对累计预算，再保存或开始并授权。';$('gp-'+id+'-hint').textContent=data.limitation;
   }catch(cause){if(gpSafe(requestScope,revision)&&gpGet(id)===s)$('gp-'+id+'-hint').textContent='组合未准备：'+cause.message;}
   finally{if(gpSafe(requestScope,revision)&&gpGet(id)===s){s.pending=false;gpControls(id);}}
  }
  for(const control of [heroSelect,num,prepare,duration,starPrepare,sequenceAdd,sequencePrepare]){control._heroExchangeDraft=true;control.disabled=!gpHeroExchangeEditable();s.actionControls.push(control);}
  heroLabel.appendChild(heroSelect);numLabel.appendChild(num);box.appendChild(heroLabel);box.appendChild(numLabel);box.appendChild(prepare);box.appendChild(durationLabel);box.appendChild(starPrepare);box.appendChild(gpEl('h3','多英雄单星顺序'));box.appendChild(gpEl('p','依次添加英雄及明确兑换量；按列表顺序各升一星。共享万能碎片在准备时核总量，所有英雄共用本次总时长与累计预算。'));box.appendChild(sequenceAdd);box.appendChild(sequenceBox);box.appendChild(sequencePrepare);drawSequence();
 }else if(id==='equipment-forge'){
  gpRenderForgeTarget(box,view);
  gpRenderForgeBatch(box,view,'pick');
  gpRenderForgeBatch(box,view,'make');
  const scope=viewGuard.capture(),revision=gpRevision;
  table('装备厂队列',['建筑','等级','队列'],(view?.forges||[]).map(row=>[row.buildingId,row.level,gpJson(row.queue)]));
  table('制造配方',['配方','部位','所需赛季','材料','可能产物'],(view?.recipes||[]).map(row=>[row.makeId,row.type,row.season,operationCosts(row.costs),(row.equipIds||[]).join('、')]));
  table('背包装备实例',['UID','装备','等级','星级','精炼等级'],(view?.bag||[]).map(row=>[row.uid,row.equipId,row.level,row.star,row.refineLv]));
  box.appendChild(gpEl('p','每次只制造或收取一个明确批次。准备时仅在明确允许配方中选择，数量少的部位优先，同量按武器、防具、饰品排序，再按品质从高到低选足额配方。执行不更换配方，通用材料仍缺扣取证据。'));
  const observed=view?.preparation;
  table('选配方数量依据（不含佩戴）',['部位','闲置背包＋在产数量'],['武器','防具','饰品'].map(type=>[type,observed?.counts?.[type]]));
  const buildingLabel=gpEl('label','本次装备厂'),building=gpEl('select');building.dataset.forgePrepareBuilding='true';const empty=gpEl('option','请选择装备厂');empty.value='';building.appendChild(empty);for(const row of view?.forges||[]){const option=gpEl('option',row.buildingId);option.value=row.buildingId;building.appendChild(option);}building.value='';buildingLabel.appendChild(building);box.appendChild(buildingLabel);
  const allowedBox=gpEl('div'),recipeControls=[];box.appendChild(gpEl('p','明确勾选本次允许的配方（初始为空）；只准备一份，收取未确认即停止。'));
  for(const row of observed?.recipes||[]){const label=gpEl('label',row.makeId+' · '+row.type+' · '+(row.qualityName??'品质未知')+' · '+operationCosts(row.costs)),input=gpEl('input');input.type='checkbox';input.checked=false;input.dataset.forgePrepareRecipe=String(row.makeId);input._blocked=!observed?.reliable||row.qualityReliable!==true;label.appendChild(input);allowedBox.appendChild(label);recipeControls.push(input);}box.appendChild(allowedBox);
  const durationLabel=gpEl('label','本次总时长（秒）'),duration=gpEl('input');duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='';duration.dataset.forgePrepareDuration='true';durationLabel.appendChild(duration);box.appendChild(durationLabel);
  const prepare=gpEl('button','按部位数量准备单次制造');prepare.dataset.forgePrepare='true';prepare._workflowPrepare=true;prepare._blocked=observed?.reliable!==true;
  const valid=()=>!prepare.disabled&&gpDomainSelectable(id)&&gpSafe(scope,revision)&&gpGet(id).data?.view===view&&wfEditorEditable(),selection=()=>recipeControls.filter(control=>control.checked&&!control._blocked).map(control=>Number(control.dataset.forgePrepareRecipe));
  prepare.onclick=async()=>{
   if(!valid())return;const buildingId=building.value,durationText=duration.value,seconds=Number(durationText),makeIds=selection();
   if(!buildingId||makeIds.length<1||makeIds.length>50||!/^[1-9][0-9]*$/.test(durationText)||!Number.isInteger(seconds)||seconds>86400){$('gp-'+id+'-hint').textContent='须明确装备厂、允许配方及1至86400秒总时长。';return;}
   const payload={buildingId,makeIds,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('forge-prepare'),editor=captureStageRecommendationEditor(),stateRevision=++s.revision,source=gpJson(payload);
   const active=()=>gpSafe(requestScope,revision)&&gpGet(id)===s&&s.revision===stateRevision&&s.data?.view===view&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&source===gpJson({buildingId:building.value,makeIds:selection(),maxDurationMs:Number(duration.value)*1000});
   s.plan=null;gpClear($('gp-'+id+'-plan-view'));s.pending=true;gpControls(id);
   try{const data=await operationMutation('/api/gameplay/equipment-forge/prepare',payload,requestScope);if(!active())return;editor.accept(gpForgeGraph(data,payload,view,requestScope.account));$('wf-hint').textContent='已载入明确范围内的单次制造预览；请核对配方、原批次和累计预算，再保存或开始并授权。';$('gp-'+id+'-hint').textContent=data.limitation;}
   catch(cause){if(gpSafe(requestScope,revision)&&gpGet(id)===s)$('gp-'+id+'-hint').textContent='装备厂未准备：'+cause.message;}
   finally{if(gpSafe(requestScope,revision)&&gpGet(id)===s){s.pending=false;gpControls(id);}}
  };
  for(const control of [building,...recipeControls,duration,prepare]){control.disabled=control._blocked||!gpDomainSelectable(id);s.actionControls.push(control);}box.appendChild(prepare);
 }else if(id==='farm'){
  const scope=viewGuard.capture(),revision=gpRevision;
  gpRenderFarmHarvest(id,s,box,view);
  const plantSources=gpFarmPlantSources(view),plantChoices=[];box.appendChild(gpEl('h3','明确空田有限顺序播种'));box.appendChild(gpEl('p','按下列列表顺序逐田播种；明确选择空田及每田作物，最多12块。准备时核初始持有种子总量，不预支未来收获；每步仍需原授权及独立确认。'));
  for(const plot of view?.plots||[]){const options=plantSources.filter(row=>row.buildingId===plot.buildingId);if(!options.length)continue;const label=gpEl('label'),choice=gpEl('input'),crop=gpEl('select');choice.type='checkbox';choice.checked=false;choice.dataset.farmPlantTarget=plot.buildingId;crop.dataset.farmPlantCrop=plot.buildingId;const blank=gpEl('option','请选择作物');blank.value='';crop.appendChild(blank);for(const source of options){const row=view.candidates.find(r=>r.actionType==='PLANT'&&r.target?.buildingId===source.buildingId&&r.target?.productId===source.productId),option=gpEl('option',source.productId+' · '+operationCosts(row.costs));option.value=source.productId;crop.appendChild(option);}crop.value='';label.appendChild(choice);label.appendChild(gpEl('span',plot.buildingId));label.appendChild(crop);box.appendChild(label);plantChoices.push({choice,crop,options});}
  const plantDurationLabel=gpEl('label','本次播种总时长（秒）'),plantDuration=gpEl('input');plantDuration.type='number';plantDuration.min='1';plantDuration.max='86400';plantDuration.step='1';plantDuration.value='';plantDuration.dataset.farmPlantDuration='true';plantDurationLabel.appendChild(plantDuration);box.appendChild(plantDurationLabel);
  const plantPrepare=gpEl('button','准备所选空田逐田播种');plantPrepare.dataset.farmPlantPrepare='true';plantPrepare._workflowPrepare=true;plantPrepare._blocked=!plantChoices.length;const plantSelection=()=>plantChoices.filter(row=>row.choice.checked).map(row=>row.options.find(o=>o.productId===row.crop.value)??null);
  plantPrepare.onclick=async()=>{if(plantPrepare.disabled||!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id).data?.view!==view||!wfEditorEditable())return;const targets=plantSelection(),secondsText=plantDuration.value,seconds=Number(secondsText);if(targets.length<1||targets.length>12||targets.some(t=>!t)||!/^[1-9][0-9]*$/.test(secondsText)||!Number.isInteger(seconds)||seconds>86400){$('gp-'+id+'-hint').textContent='请明确选择1至12块空田、每田作物及1至86400秒总时长。';return;}
   const payload={targets,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('farm-plant-prepare'),editor=captureStageRecommendationEditor(),stateRevision=++s.revision,sourceText=gpJson(targets),editorDraft=$('wf-json').value;const active=()=>gpSafe(requestScope,revision)&&gpGet(id)===s&&s.revision===stateRevision&&s.data?.view===view&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&gpJson(plantSelection())===sourceText&&plantDuration.value===secondsText;
   s.plan=null;gpClear($('gp-'+id+'-plan-view'));s.pending=true;gpControls(id);try{const data=await operationMutation('/api/gameplay/farm/plant/prepare',payload,requestScope);if(!active())return;editor.accept(gpFarmPlantGraph(data,payload,view,requestScope.account));$('wf-hint').textContent='已载入明确空田和自选作物的有限播种图；核对逐田来源、初始种子累计预算和期限，再开始并授权。';$('gp-'+id+'-hint').textContent=data.limitation;}catch(cause){if(gpSafe(requestScope,revision)&&gpGet(id)===s)$('gp-'+id+'-hint').textContent='农田播种组合未准备：'+cause.message;}finally{if(gpSafe(requestScope,revision)&&gpGet(id)===s){s.pending=false;gpControls(id);}}
  };box.appendChild(plantPrepare);for(const control of [...plantChoices.flatMap(row=>[row.choice,row.crop]),plantDuration,plantPrepare]){control.disabled=control._blocked||!gpDomainSelectable(id);s.actionControls.push(control);}
  table('农田状态',['地块','状态','作物','种植时间（原值）','成熟时间（服务器秒）','阻断'],(view?.plots||[]).map(plot=>[plot.buildingId,plot.state,plot.productId,plot.plantTime,plot.ripeTime,plot.reason]));
  table('种子成本',['作物','种子成本','证据'],(view?.crops||[]).map(crop=>[crop.productId,operationCosts(crop.costs),crop.reliable?'已有种子':'BLOCKED_EVIDENCE']));
  box.appendChild(gpEl('p','服务端自动种植：'+show(view?.autoFarming)+'。明确空地可按精确种子成本单田播种；成熟收取需当前连接可信时钟，每次只收一块地，作物数量以回执和完整库存净入共同确认。'));
 }else{
  const appointment=view?.appointment;box.appendChild(gpEl('h3','生产需求与时间规划'));
  box.appendChild(gpEl('p','委任减时：'+(appointment?.reliable===true?show(appointment.seconds)+' 秒':'未知')+' · 来源：'+(appointment?.source||appointment?.reason||'未知')));
  table('配方时间与持有物资包覆盖',['工厂','产品','原始秒数','委任调整秒数','覆盖缺料','范围'],(view?.factories||[]).flatMap(factory=>(factory.recipes||[]).map(recipe=>[factory.buildingId,recipe.productId,recipe.produceTime,recipe.appointmentAdjustedSeconds,recipe.packCoverage?.reliable===true?(recipe.packCoverage.ok?'持有包可覆盖（仅投影）':'不需兑换或不可覆盖'):'未知',recipe.timingScope])));
  if(id==='production'){const coverage=gpRenderMaterialCoverage(id,s,box,view);gpRenderProductionFactory(id,s,box,view,coverage);gpRenderProductionStarts(box,view);gpRenderProductionCollections(box,view);gpRenderProductionCollections(box,view,true);}
  table('作物策略水位',['作物','配方用途数','策略目标'],(view?.cropSupply?.waterlines||[]).map(row=>[row.cropId,row.uses,row.capDisabled?'未设上限':row.target]));
  table('种子储备缺口',['种子','持有','策略目标','缺少'],(view?.cropSupply?.seedDemand||[]).map(row=>[row.itemId,row.have,row.required,row.missing]));
  table('余料建议',['工厂','产品','最多份数'],(view?.cropSupply?.surplusDemand||[]).map(row=>[row.buildType,row.itemId,row.maximumUnits]));
  box.appendChild(gpEl('p','水位、种子、余料和持有包覆盖均为规划投影；现有生产候选可进入单次授权，明确选择覆盖建议可准备原有限兑换生产图。完整速度加成、自动补料和整日产量尚待完成。'));
 }
 for(const row of view?.candidates||[]){const card=gpEl('article');card.appendChild(gpEl('p',(row.label||row.actionType||row.actionId)+' · '+operationCosts(row.costs)+' · '+(row.costSource||'成本来源未知')));if(gpBlocked(row))card.appendChild(gpEl('p','禁止执行：'+(row.blockedReason||row.reason||'缺少可靠动作')));const button=gpEl('button','选择单项候选');button.dataset.domainAction=row.actionId;button._blocked=gpBlocked(row);button.disabled=button._blocked||!gpDomainSelectable(id);button.onclick=()=>{if(!button.disabled&&gpGet(id).data?.view===view)gpSelectDomainCandidate(id,row.actionId);};s.actionControls.push(button);card.appendChild(button);box.appendChild(card);}
 gpDetails(box,'事实、可靠性与完整规划详情',view);gpWatchTargetDraft(id,s,view);
}





function gpRenderNavalRules() {
 const box=gpClear($('gp-naval-rules')),section=gpEl('div'),s=gpGet('naval'),view=s.data?.view,scope=viewGuard.capture(),revision=gpRevision,source=$('gp-naval-config').value;
 box.appendChild(section);s.navalRuleControls=[];
 const live=()=>gpSafe(scope,revision)&&gpGet('naval')===s&&s.data?.view===view&&$('gp-naval-config').value===source&&Array.from(box.children).includes(section);
 const editable=()=>live()&&gpReady('naval')&&!s.pending&&!s.data?.status?.blocked&&!s.data?.status?.running&&!snapshot?.busy&&snapshot?.connected;
 const control=(input,allowed=()=>true)=>{input._navalRuleLive=()=>editable()&&allowed();input.disabled=!input._navalRuleLive();s.navalRuleControls.push(input);return input;};
 section.appendChild(gpEl('h3','本账号有序海战观察规则'));section.appendChild(gpEl('p','规则顺序保留供解释。全部PASS才通过观察，任一FAIL优先，缺事实保持UNKNOWN；新鲜度使用原可信服务器时钟，不按本机时间推算。编辑后先应用到配置草稿，再保存本账号配置并重新探测；规则不会授权攻击或持续跟随。'));
 let config,error;try{
  config=gpParse('gp-naval-config');if(!Array.isArray(config.rules)||config.rules.length>NAVAL_RULE_FIELDS.maxRules)throw Error('原规则列表结构或数量无效');
  const ids=new Set();for(const row of config.rules){const kind=NAVAL_RULE_FIELDS.types[row?.type];if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(key=>!['id','type','value'].includes(key))||typeof row.id!=='string'||!row.id||ids.has(row.id)||typeof row.type!=='string'||!Object.hasOwn(NAVAL_RULE_FIELDS.types,row.type))throw Error('原规则ID、类型或字段无效');ids.add(row.id);if(kind==='text'?typeof row.value!=='string'||!row.value:kind==='boolean'?typeof row.value!=='boolean':!Number.isSafeInteger(row.value)||row.value<0)throw Error('原规则值无效');}
 }catch(cause){error=cause.message;}
 if(error){s.navalRuleDraft=null;section.appendChild(gpEl('p','原规则需先通过高级配置JSON修正：'+error+'；保留原文，不丢弃旧规则。'));return;}
 if(!s.navalRuleDraft||s.navalRuleDraft.source!==source)s.navalRuleDraft={source,rows:config.rules.map(row=>({id:row.id,type:row.type,value:String(row.value)}))};
 const draft=s.navalRuleDraft,labels={targetId:'目标关联键',targetState:'目标状态',fleetState:'舰队状态',minDurability:'最低耐久',minPetrol:'最低汽油',sameGuild:'是否同联盟',freshTarget:'最大观察年龄（秒）'};
 const button=(text,key,run,allowed)=>{const value=control(gpEl('button',text),allowed);value.type='button';value.dataset.navalRuleAction=key;value.onclick=()=>{if(value._navalRuleLive())run();};return value;};
 const redraw=()=>gpRenderNavalRules();
 gpAllianceTable(section,'有序规则草稿',['顺序','精确规则ID','规则类型','明确规则值','排序与删除'],draft.rows.map((row,index)=>{
  const id=control(gpEl('input'));id.value=row.id;id.dataset.navalRuleIndex=String(index);id.dataset.navalRuleField='id';id.oninput=()=>{if(id._navalRuleLive())row.id=id.value;};
  const type=control(gpEl('select'));type.dataset.navalRuleIndex=String(index);type.dataset.navalRuleField='type';let option=gpEl('option','请选择原规则类型');option.value='';type.appendChild(option);for(const key of Object.keys(NAVAL_RULE_FIELDS.types)){option=gpEl('option',labels[key]);option.value=key;type.appendChild(option);}type.value=row.type;type.onchange=()=>{if(!type._navalRuleLive()||!Object.hasOwn(NAVAL_RULE_FIELDS.types,type.value))return;row.type=type.value;row.value='';redraw();};
  const kind=NAVAL_RULE_FIELDS.types[row.type],value=control(gpEl(kind==='boolean'?'select':'input'));value.dataset.navalRuleIndex=String(index);value.dataset.navalRuleField='value';if(kind==='boolean')for(const [key,text]of [['','请选择明确布尔值'],['true','是'],['false','否']]){option=gpEl('option',text);option.value=key;value.appendChild(option);}value.value=row.value;value[kind==='boolean'?'onchange':'oninput']=()=>{if(value._navalRuleLive())row.value=value.value;};
  const actions=gpEl('span');for(const [text,key,move,allowed]of [['上移','up',-1,()=>index>0],['下移','down',1,()=>index<draft.rows.length-1]])actions.appendChild(button(text,key+':'+index,()=>{[draft.rows[index],draft.rows[index+move]]=[draft.rows[index+move],draft.rows[index]];redraw();},allowed));actions.appendChild(button('删除','remove:'+index,()=>{draft.rows.splice(index,1);redraw();}));
  return [index+1,id,type,value,actions];
 }));
 section.appendChild(button('添加明确规则','add',()=>{draft.rows.push({id:'',type:'',value:''});redraw();},()=>draft.rows.length<NAVAL_RULE_FIELDS.maxRules));
 section.appendChild(button('应用规则到配置草稿','apply',()=>{try{
  const ids=new Set(),rules=draft.rows.map(row=>{
   if(!row.id||ids.has(row.id)||!Object.hasOwn(NAVAL_RULE_FIELDS.types,row.type))throw Error('规则ID需非空且不重复，类型须明确选择。');ids.add(row.id);const kind=NAVAL_RULE_FIELDS.types[row.type];let value=row.value;
   if(kind==='text'){if(!value)throw Error('目标关联键不能为空。');}
   else if(kind==='boolean'){if(!['true','false'].includes(value))throw Error('同联盟规则须明确选择是或否。');value=value==='true';}
   else {if(!/^(0|[1-9][0-9]*)$/.test(value)||!Number.isSafeInteger(Number(value)))throw Error('数值规则需为非负安全整数。');value=Number(value);}
   return {id:row.id,type:row.type,value};
  });
  $('gp-naval-config').value=gpJson({...config,rules});s.configDirty=true;gpInvalidate('naval',true);gpRenderNavalRules();$('gp-naval-hint').textContent='规则已应用到本账号配置草稿；请保存配置后重新探测，未授权任何写操作。';
 }catch(cause){$('gp-naval-hint').textContent='规则未应用：'+cause.message;}}));
 section.appendChild(button('放弃规则编辑并重读当前配置草稿','discard',()=>{s.navalRuleDraft=null;redraw();}));
}

function gpRenderNaval(view) {
 const box=gpClear($('gp-naval-observations')),section=gpEl('div'),s=gpGet('naval'),scope=viewGuard.capture(),revision=gpRevision,edit=s.revision,source=$('gp-naval-parameters').value;s.navalControls=[];box.appendChild(section);
 const show=value=>value===null||value===undefined?'未知':String(value),live=()=>gpSafe(scope,revision)&&gpGet('naval')===s&&s.data?.view===view&&s.revision===edit&&$('gp-naval-parameters').value===source&&Array.from(box.children).includes(section);
 const editable=()=>live()&&gpReady('naval')&&!s.pending&&!s.configDirty&&!s.data?.status?.blocked&&!s.data?.status?.running&&!snapshot?.busy&&snapshot?.connected;
 const control=(input,allowed=()=>true)=>{input._navalLive=()=>editable()&&allowed();input.disabled=!input._navalLive();s.navalControls.push(input);return input;};
 const applyParameters=value=>{if(!editable())return;$('gp-naval-parameters').value=gpJson(value);gpInvalidate('naval',true);gpRenderCandidates('naval');gpRenderNaval(view);$('gp-naval-hint').textContent='观察筛选参数已更新；请显式只读探测，结果只关联本次响应。';};
 section.appendChild(gpEl('h3','本次海战观察与三值筛选'));section.appendChild(gpEl('p','来源：WorldInfoResponse.fleets · 可靠性 '+(view?.worldReliable===true?'本次响应可靠':'UNKNOWN')+' · 完整性 '+show(view?.scope?.completeness)+'。关联键仅在本次响应内使用；持续监听、跨视野跟随和攻击仍按原缺证范围处理。'));
 let original,parameterError;try{original=gpParse('gp-naval-parameters');}catch(error){original={};parameterError=error.message;}
 gpAllianceTable(section,'当前响应内的目标与规则依据',['关联键','玩家ID','舰队建筑','联盟ID','城市','战力原文','状态','观察时间（服务器秒）','三值结果','来源/依据','选择筛选'],(view?.targets||[]).map(row=>{
  const choose=control(gpEl('button','筛选此观察目标'),()=>!parameterError&&view.worldReliable===true&&typeof row.targetKey==='string'&&row.targetKey.length>0&&typeof row.playerId==='string');choose.type='button';choose.dataset.navalObservedTarget=row.targetKey??'';
  choose.onclick=()=>{if(choose._navalLive()&&!parameterError)applyParameters({...original,targetId:row.targetKey,playerId:row.playerId});};
  return [row.targetKey,row.playerId,row.buildingId,row.guildId,row.cityId,row.power,row.state,row.observedAt,row.status,row.source+' · '+gpJson(row.ruleTrace),choose];
 }));
 gpAllianceTable(section,'规则总览（缺事实保持UNKNOWN）',['规则ID','类型','三值结果','原因'],(view?.rules?.trace||[]).map(row=>[row.id,row.type,row.status,row.reason]));
 section.appendChild(gpEl('h4','明确观察筛选'));section.appendChild(gpEl('p','仅启用要声明的字段；玩家/联盟ID和战力保留十进制文本，每行一个列表值。未启用字段从本次观察参数移除，不改变原规则或授权。'));
 const schema=WF_PARAMETER_SCHEMAS.naval,fields=[];
 for(const [key,label,kind]of [['targetId','本次目标关联键','text'],['playerId','玩家ID','id'],['excludeGuildIds','排除联盟ID列表','ids'],['cityIds','城市ID列表','cities'],['minimumPower','最低战力','power'],['maximumPower','最高战力','power'],['screenCenter','观察中心','point']]){
  if(!Object.hasOwn(schema.properties,key))continue;
  const group=gpEl('label'),enabled=control(gpEl('input'));enabled.type='checkbox';enabled.checked=Object.hasOwn(original,key);enabled.dataset.navalParameter=key;enabled.dataset.navalControl='enabled';group.appendChild(enabled);group.appendChild(document.createTextNode(' '+label+' '));const field={key,enabled,kind};
  const input=(axis)=>{const value=control(gpEl(kind==='ids'||kind==='cities'?'textarea':'input'),()=>enabled.checked);value.dataset.navalParameter=key;value.dataset.navalControl=axis||'value';group.appendChild(value);return value;};
  if(kind==='point'){field.x=input('x');field.y=input('y');field.x.value=original[key]?.x===undefined?'':String(original[key].x);field.y.value=original[key]?.y===undefined?'':String(original[key].y);}
  else {field.input=input();field.input.value=kind==='ids'||kind==='cities'?Array.isArray(original[key])?original[key].map(String).join('\n'):original[key]===undefined?'':gpJson(original[key]):original[key]===undefined?'':String(original[key]);}
  enabled.onchange=()=>gpControls('naval');fields.push(field);section.appendChild(group);
 }
 const int64=(value,positive=false)=>{if(!/^(0|[1-9][0-9]*)$/.test(value)||BigInt(value)>9223372036854775807n||positive&&BigInt(value)===0n)throw Error('身份和战力需为原范围内精确十进制int64文本。');return value;};
 const cityId=value=>{if(!/^(0|[1-9][0-9]*)$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)<=0||Number(value)>2147483647)throw Error('城市ID需为明确正int32。');return Number(value);};
 const apply=control(gpEl('button','应用观察筛选参数'),()=>!parameterError);apply.type='button';apply.dataset.navalParametersApply='true';section.appendChild(apply);
 apply.onclick=()=>{if(!apply._navalLive())return;try{
  const next=JSON.parse(JSON.stringify(original));for(const field of fields){
   const {key,enabled,kind}=field;if(!enabled.checked){delete next[key];continue;}
   if(kind==='text'){if(!field.input.value.trim())throw Error('目标关联键不能为空。');next[key]=field.input.value;}
   else if(kind==='id'||kind==='power')next[key]=int64(field.input.value,kind==='id');
   else if(kind==='point'){
    const point={};for(const axis of ['x','y']){const raw=field[axis].value;if(!/^-?(0|[1-9][0-9]*)$/.test(raw)||!Number.isSafeInteger(Number(raw))||Math.abs(Number(raw))>2147483647)throw Error('观察中心需明确填写两个原范围内int32坐标。');point[axis]=Number(raw);}next[key]=point;
   }else {
    const rows=field.input.value===''?[]:field.input.value.split(/\r?\n/);if(rows.length>100)throw Error('列表超出原100项上限。');const values=rows.map(value=>kind==='ids'?int64(value):cityId(value));if(new Set(values).size!==values.length)throw Error('筛选列表不能重复。');next[key]=values;
   }
  }
  if(Object.hasOwn(next,'minimumPower')&&Object.hasOwn(next,'maximumPower')&&BigInt(next.minimumPower)>BigInt(next.maximumPower))throw Error('最低战力不能高于最高战力。');
  applyParameters(next);
 }catch(error){$('gp-naval-hint').textContent='筛选未应用：'+error.message;}};
 if(parameterError)section.appendChild(gpEl('p','原业务参数需先通过高级JSON修正：'+parameterError));
 for(const row of view?.blocked||[])section.appendChild(gpEl('p',row.actionType+' · '+row.code+' · '+row.reason));
 gpWatchTargetDraft('naval',s,view,'navalControls');
}

function gpTreasureBatchGraph(data,payload,view,config,accountId){
 const canonical=v=>JSON.stringify(v,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item),same=(a,b)=>canonical(a)===canonical(b),graph=data.graph,nodes=[{id:'start',type:'START'}],uids=[],used=new Set();let petrol=0;
 if(data.accountId!==accountId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||!same(data.targets,payload.targets)||data.maxDurationMs!==payload.maxDurationMs||!Array.isArray(data.steps)||data.steps.length!==payload.targets.length||!Number.isSafeInteger(view.preparation?.petrolPerFleet)||view.preparation.petrolPerFleet<0)throw Error('宝藏组合账号、来源、成本或时长不匹配');
 for(const [i,parameters] of payload.targets.entries()){
  const ids=parameters.fleetBuildingIds,target={uid:parameters.uid,fleetBuildingIds:ids},source=view.preparation.targets.find(row=>row.uid===parameters.uid),expectation={targetHash:source?.targetHash,fleetHashes:ids.map(id=>view.preparation.fleets.find(row=>row.buildingId===id)?.fleetHash)},cost=view.preparation.petrolPerFleet*ids.length,costs=[{id:'汽油',num:cost}],selection={actionId:'treasure:dispatch:'+parameters.uid+':'+ids.map(encodeURIComponent).join(',')},claims={resources:costs,quotas:[],uids:[{type:'treasure',id:String(parameters.uid)},...ids.map(id=>({type:'fleet',id}))]},step=data.steps[i];
  if(!source||!ids.length||ids.length>config.maxFleets||ids.length>10||ids.some(id=>used.has(id))||!Number.isSafeInteger(cost)||!same(parameters.expectedDispatch,expectation)||!same(step?.parameters,parameters)||!same(step?.selection,selection)||!same(step?.target,target)||!same(step?.costs,costs)||!same(step?.budgetClaims,claims))throw Error('宝藏逐目标舰队组、原摘要或汽油预算变化');
  ids.forEach(id=>used.add(id));petrol+=cost;uids.push(...claims.uids);nodes.push({id:'dispatch-'+i,type:'ACTION',module:'treasure',parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'treasure'});
 }
 nodes.push({id:'stop',type:'STOP'});const budget={resources:petrol?[{id:'汽油',num:petrol}]:[],quotas:[],uids};
 if(!Number.isSafeInteger(petrol)||!Number.isSafeInteger(view.preparation.availablePetrol)||view.preparation.availablePetrol<petrol+config.petrolReserve||graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.targets.length,modules:['treasure']}))throw Error('宝藏逐项验证、父预算/汽油保留线或有限边界不匹配');return graph;
}
function gpRenderTreasureBatch(box,view){
 const id='treasure',s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-treasure-parameters').value,section=gpEl('div'),config=s.data?.config||{},preparation=view?.preparation;s.treasureBatchControls=[];box.appendChild(section);section.appendChild(gpEl('h4','明确多个无人防守宝藏逐目标派舰'));
 if(!preparation||!view.reliability?.treasures||!view.reliability?.fleets||!view.reliability?.stock||!view.reliability?.stats){section.appendChild(gpEl('p','完整列表、舰队、次数与汽油来源可靠后，可明确分配舰队组。'));return;}
 const targets=view.treasures.filter(row=>row.ownerGuildIdx===0&&row.ownerFleetNum===0&&row.progress!==null&&row.progress<100&&config.colors?.includes(row.color)),live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&$('gp-treasure-parameters').value===source,editable=()=>live()&&gpDomainSelectable(id)&&!s.targetDraftPending&&config.enabled===true&&config.dispatch===true&&wfEditorEditable(),control=(input,allowed=true)=>{input._treasureBatchLive=()=>editable()&&allowed;input.disabled=!input._treasureBatchLive();s.treasureBatchControls.push(input);return input;};
 const changed=input=>{if(input.disabled||!editable())return;gpInvalidate(id,false);wfInvalidateSettingPlans();$('gp-treasure-hint').textContent='宝藏舰队分组或时长已编辑，旧计划和授权失效；准备时重读各目标详情。';};
 const rows=view.fleets.map(fleet=>{
  const idle=fleet.state===1&&fleet.autoFight?.isOn===false&&fleet.treasureLootUid===0&&fleet.repairing===null&&Number.isSafeInteger(fleet.durability)&&fleet.maxDura>0&&fleet.durability/fleet.maxDura>=config.minimumDurabilityRatio,select=control(gpEl('select'),idle);select.dataset.treasureBatchFleet=fleet.buildingId;const empty=gpEl('option','不派遣');empty.value='';select.appendChild(empty);for(const target of targets){const option=gpEl('option','宝藏 '+target.uid+' · 品质 '+target.color);option.value=String(target.uid);select.appendChild(option);}select.value='';select.onchange=()=>changed(select);const label=gpEl('label','舰队 '+fleet.buildingId+' · 耐久 '+fleet.durability+'/'+fleet.maxDura+' ');label.appendChild(select);section.appendChild(label);return {fleet,select};
 });
 const chosen=()=>{const groups=new Map();for(const {fleet,select} of rows){if(!select.value)continue;const uid=Number(select.value);if(!groups.has(uid))groups.set(uid,[]);groups.get(uid).push(fleet.buildingId);}return [...groups].map(([uid,fleetBuildingIds])=>({uid,fleetBuildingIds,expectedDispatch:{targetHash:preparation.targets.find(row=>row.uid===uid)?.targetHash,fleetHashes:fleetBuildingIds.map(id=>preparation.fleets.find(row=>row.buildingId===id)?.fleetHash)}}));};
 const duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='';duration.placeholder='明确派舰组合总时长（秒）';duration.setAttribute('aria-label','多目标派舰总时长秒');duration.oninput=()=>changed(duration);duration.onchange=()=>changed(duration);section.appendChild(duration);
 const prepare=control(gpEl('button','准备原Workflow逐目标派舰'));prepare.type='button';prepare.dataset.treasureBatchPrepare='true';section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(!editable())return;const targets=chosen(),text=duration.value,seconds=Number(text);if(!targets.length||targets.length>10||targets.some(target=>target.fleetBuildingIds.length>config.maxFleets||target.fleetBuildingIds.length>10)||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-treasure-hint').textContent='请明确分配1至10个不同宝藏的合格舰队组及1至86400秒时长，每组不超过原舰队上限。';return;}
  const payload={targets,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('treasure-batch-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(targets),editorDraft=$('wf-json').value;
  const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&duration.value===text&&JSON.stringify(chosen())===choice;
  s.plan=null;s.selected.clear();gpClear($('gp-treasure-plan-view'));s.pending=true;gpControls(id);
  try{const data=await operationMutation('/api/gameplay/treasure/prepare',payload,requestScope);if(!active())return;editor.accept(gpTreasureBatchGraph(data,payload,view,config,requestScope.account));$('wf-hint').textContent='已载入明确多目标派舰图；每项重新调查、单次授权及派舰/汽油独立验证。';$('gp-treasure-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-treasure-hint').textContent=error.message;}finally{if(gpGet(id)===s&&s.revision===edit){s.pending=false;gpControls(id);}}
 };section.appendChild(gpEl('p','默认全部不派遣；每舰只分配一个目标。准备时逐目标读取排行/防守；来源变化、拒绝或UNKNOWN停止。只确认舰队关联与汽油净扣，不确认占领、胜负、奖励或日界；奖励不扩预算，重启不续跑。'));
}

function gpRenderTreasure(view) {
 const box=gpClear($('gp-treasure-targets')),section=gpEl('div'),s=gpGet('treasure'),scope=viewGuard.capture(),revision=gpRevision,edit=s.revision,source=$('gp-treasure-parameters').value;s.treasureControls=[];box.appendChild(section);
 const show=value=>value===null||value===undefined?'未知':String(value),live=()=>gpSafe(scope,revision)&&gpGet('treasure')===s&&s.data?.view===view&&Array.from(box.children).includes(section);
 const editable=()=>live()&&gpReady('treasure')&&!s.pending&&!s.configDirty&&!s.data?.status?.blocked&&!s.data?.status?.running&&!snapshot?.busy&&snapshot?.connected;
 const draftLive=()=>editable()&&s.revision===edit&&$('gp-treasure-parameters').value===source;
 const control=(input,allowed=()=>true)=>{input._treasureLive=()=>editable()&&allowed();input.disabled=!input._treasureLive();s.treasureControls.push(input);return input;};
 const parameters=(value,message)=>{if(!draftLive())return;$('gp-treasure-parameters').value=gpJson(value);gpInvalidate('treasure',true);gpRenderCandidates('treasure');gpRenderTreasure(view);$('gp-treasure-hint').textContent=message;};
 section.appendChild(gpEl('h3','世界寻宝目标与明确舰队'));section.appendChild(gpEl('p','来源：TreasureLootList / TreasureLootStats / MyFleets；最近采集：'+show(view?.surveyedAt)+'。本能力验证精确舰队派遣关联，胜负与奖励到账仍按原缺证范围处理。'));
 section.appendChild(gpEl('p','服务端本期奖励次数：已用 '+(view?.reliability?.stats===true?show(view.todayRewardTimes):'未知')+' / 上限 '+(view?.reliability?.stats===true?show(view.totalRewardTimes):'未知')+'；不据此推断日界或安排重领。'));
 const targets=view?.treasures||[],fleets=view?.fleets||[],knownTargets=view?.reliability?.treasures===true,knownFleets=view?.reliability?.fleets===true;
 let currentParameters={};try{currentParameters=gpParse('gp-treasure-parameters');}catch{}
 gpAllianceTable(section,'本次宝藏列表',['UID','品质','占有联盟','驻守舰队数','进度','格子','准备详情读取'],targets.map(row=>{
  const button=control(gpEl('button','选择此宝藏详情'),()=>draftLive()&&knownTargets&&Number.isSafeInteger(row.uid)&&row.uid>0&&row.uid<=2147483647);button.type='button';button.dataset.treasureDetails=String(row.uid);
  button.onclick=()=>{if(!button._treasureLive())return;parameters({...currentParameters,uid:row.uid},'已选择精确宝藏UID；请只读探测其排行和防守详情，再核对舰队。');};
  return [row.uid,row.color,row.ownerGuildIdx,row.ownerFleetNum,row.progress,row.gridIdx,button];
 }));
 const target=control(gpEl('select'),()=>draftLive()&&knownTargets);target.dataset.treasureTarget='true';let option=gpEl('option','请选择本次宝藏UID');option.value='';target.appendChild(option);for(const row of targets){const option=gpEl('option','宝藏 '+row.uid+' · 品质 '+show(row.color));option.value=String(row.uid);target.appendChild(option);}target.value=Object.hasOwn(currentParameters,'uid')?String(currentParameters.uid):'';const targetLabel=gpEl('label','派遣目标 ');targetLabel.appendChild(target);section.appendChild(targetLabel);
 const config=s.data?.config||{},maximum=config.maxFleets,minimum=config.minimumDurabilityRatio;
 const fleetConfigKnown=Number.isSafeInteger(maximum)&&maximum>=1&&maximum<=10&&typeof minimum==='number'&&Number.isFinite(minimum)&&minimum>0&&minimum<=1;
 const idle=fleet=>fleet.state===1&&fleet.autoFight?.isOn===false&&fleet.treasureLootUid===0&&fleet.repairing===null&&typeof fleet.durability==='number'&&Number.isFinite(fleet.durability)&&typeof fleet.maxDura==='number'&&fleet.maxDura>0&&fleet.durability/fleet.maxDura>=minimum;
 const picks=[];gpAllianceTable(section,'本账号舰队（明确勾选，不自动挑选）',['选择','舰队ID','状态','耐久 / 上限','委任','当前宝藏','可选择状态'],fleets.map(row=>{
  const allowed=()=>draftLive()&&knownFleets&&fleetConfigKnown&&idle(row),check=control(gpEl('input'),allowed);check.type='checkbox';check.checked=Array.isArray(currentParameters.fleetBuildingIds)&&currentParameters.fleetBuildingIds.includes(row.buildingId);check.dataset.treasureFleet=row.buildingId;picks.push({row,check,allowed});
  return [check,row.buildingId,row.state,show(row.durability)+' / '+show(row.maxDura),row.autoFight?.isOn===false?'关闭':row.autoFight?.isOn===true?'开启':'未知',row.treasureLootUid,allowed()?'可明确选择':'事实/状态/耐久不满足原规则'];
 }));
 section.appendChild(gpEl('p','本账号最多派遣 '+(fleetConfigKnown?maximum:'未知')+' 艘，最低耐久比例 '+(fleetConfigKnown?minimum:'未知')+'；汽油保留线 '+show(config.petrolReserve)+'。成本以重新探测后的原候选为准。'));
 const prepare=control(gpEl('button','准备明确宝藏与舰队参数'),()=>draftLive()&&knownTargets&&knownFleets&&fleetConfigKnown);prepare.type='button';prepare.dataset.treasurePrepare='true';section.appendChild(prepare);
 prepare.onclick=()=>{if(!prepare._treasureLive())return;const row=targets.find(row=>String(row.uid)===target.value),selected=picks.filter(pick=>pick.check.checked);
  if(!row||!Number.isSafeInteger(row.uid)||row.uid<=0||row.uid>2147483647||!selected.length||selected.length>maximum||selected.some(pick=>!pick.allowed())){$('gp-treasure-hint').textContent='需本次精确宝藏与1至'+maximum+'艘满足原规则的明确舰队；不可使用未知或被占用舰队。';return;}
  parameters({uid:row.uid,fleetBuildingIds:selected.map(pick=>pick.row.buildingId)},'已准备精确宝藏与舰队；请重新探测目标排行/防守、资格和成本，再预览与单次授权。');
 };
 const details=view?.targetDetails;if(details){section.appendChild(gpEl('h4','精确目标 '+show(details.uid)+' 的排行与防守'));section.appendChild(gpEl('p','排行 '+(details.rankReliable===true?'本次读取可靠':'未知')+' · 防守 '+(details.defenceReliable===true?'本次读取可靠':'未知')));gpDetails(section,'排行原事实（精确身份保留）',details.rank);gpDetails(section,'防守原事实',details.defence);}
 gpAllianceTable(section,'原派遣候选',['动作','精确目标','舰队','可执行成本','成本来源','阻断 / 范围','选择'],(view?.candidates||[]).map(row=>{
  const button=control(gpEl('button','选择此派遣候选'),()=>!s.dirty&&!gpBlocked(row));button.type='button';button.dataset.treasureAction=row.actionId;
  button.onclick=()=>{if(!button._treasureLive()||!s.data?.view?.candidates?.includes(row))return;gpSelectDomainCandidate('treasure',row.actionId);gpRenderTreasure(view);};
  return [row.actionType,row.target?.uid,(row.target?.fleetBuildingIds||[]).join('、'),gpBlocked(row)?'尚未形成可执行成本':operationCosts(row.costs),row.costSource??'未知',gpBlocked(row)?row.reason||row.blockedReason||'UNKNOWN':'仅确认派遣关联',button];
 }));
 if(!knownTargets||!knownFleets)section.appendChild(gpEl('p','目标或舰队来源可靠性缺失；旧缓存不推断完整，重新探测后再准备目标。'));
 gpWatchTargetDraft('treasure',s,view,'treasureControls');
 gpRenderTreasureBatch(box,view);
}

function gpTrialRaidTargets(view){
 return Array.isArray(view?.raidSelection)?view.raidSelection.filter(row=>[1,2,3].includes(row?.raidId)&&typeof row.label==='string'&&Number.isInteger(row.requiredLevel)&&row.requiredLevel>0&&view.raidSelection.filter(other=>other?.raidId===row.raidId).length===1):[];
}
function gpFleetRepairGraph(data,payload,view,config,accountId){
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item),same=(a,b)=>canonical(a)===canonical(b),graph=data.graph,kind=payload.action??'repair',actionType={repair:'fleetRepair','stop-repair':'fleetStopRepair','stop-auto-fight':'fleetStopAutoFight'}[kind];
 if(!actionType||data.action!==payload.action||data.accountId!==accountId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||!same(data.repairs,payload.repairs)||data.maxDurationMs!==payload.maxDurationMs||!Array.isArray(data.steps)||data.steps.length!==payload.repairs.length)throw Error('维护组合账号、动作、目标或时长不匹配');
 const priority=new Map((config.repairPriorityBuildingIds||[]).map((id,i)=>[id,i])),ordered=kind==='repair'?[...payload.repairs].sort((a,b)=>(priority.get(a.buildingId)??Number.MAX_SAFE_INTEGER)-(priority.get(b.buildingId)??Number.MAX_SAFE_INTEGER)):[...payload.repairs],nodes=[{id:'start',type:'START'}];let total=0;
 ordered.forEach((target,i)=>{const row=(kind==='repair'?view.repairPreparation:view.maintenancePreparation)?.find(row=>row.buildingId===target.buildingId&&(kind==='repair'||row.actionType===actionType)),step=data.steps[i],selection={actionId:'fleet:'+actionType+':'+encodeURIComponent(target.buildingId)};
  if(row?.decision!=='READY'||row.reason!==null||row.expectedRepairHash!==target.expectedRepairHash||!same(step?.parameters,target)||!same(step?.selection,selection)||!same(step?.costs,row.costs))throw Error('维护组合原顺序、状态摘要或动作成本不匹配');
  if(kind==='repair'){if(row.costs?.length!==1||row.costs[0].id!=='汽油'||!Number.isSafeInteger(row.costs[0].num)||row.costs[0].num<=0)throw Error('维修原汽油成本不匹配');total+=row.costs[0].num;if(!Number.isSafeInteger(total)||total>config.maximumRepairPetrolPerPlan)throw Error('维修组合超过原计划总汽油限额');}else if(!same(row.costs,[]))throw Error('停止操作不允许新增支出');
  nodes.push({id:kind+'-'+i,type:'ACTION',module:'fleet',parameters:target,selection},{id:'verify-'+i,type:'VERIFY',module:'fleet'});
 });nodes.push({id:'stop',type:'STOP'});const budget={resources:kind==='repair'?[{id:'汽油',num:total}]:[],quotas:[],uids:[]};
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:ordered.length,modules:['fleet']}))throw Error('维护逐舰验证顺序或原父预算不匹配');return graph;
}
function gpFleetFieldGraph(data,payload,view,accountId){
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item),same=(a,b)=>canonical(a)===canonical(b),graph=data.graph,context=data.context;
 if(data.accountId!==accountId||context?.accountId!==accountId||typeof context.worldId!=='string'||! /^[1-9][0-9]{0,18}$/.test(context.worldId)||BigInt(context.worldId)>=(1n<<63n)||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||data.maxDurationMs!==payload.maxDurationMs||!same(data.gridIndices,payload.gridIndices)||!same(data.resourceFields,view.resourceFields)||!Array.isArray(data.steps)||data.steps.length!==payload.gridIndices.length)throw Error('资源田组合账号、世界、完整已占列表、选择或时长不匹配');
 const nodes=[{id:'start',type:'START'}],claims=[];payload.gridIndices.forEach((gridIdx,i)=>{const field=view.resourceFields.fields.find(row=>row.gridIdx===gridIdx),parameters={resourceFieldGridIdx:gridIdx},step=data.steps[i],budgetClaims={resources:[],quotas:[],uids:[{type:'resource-field',id:context.worldId+':'+gridIdx}]};
  if(!field||!same(step?.field,field)||!same(step?.parameters,parameters)||!same(step?.selection,{unique:true})||!same(step?.costs,[])||!same(step?.budgetClaims,budgetClaims))throw Error('资源田原目标或world:grid父UID已变化');
  claims.push(budgetClaims);nodes.push({id:'give-up-'+i,type:'ACTION',module:'fleet',parameters,selection:{unique:true}},{id:'verify-'+i,type:'VERIFY',module:'fleet'});
 });nodes.push({id:'stop',type:'STOP'});const budget={resources:[],quotas:[],uids:claims.flatMap(row=>row.uids)};
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.gridIndices.length,modules:['fleet']}))throw Error('资源田逐田验证、有限上限或原父预算不匹配');return graph;
}
function gpRenderFleetFieldBatch(box,view){
 const id='fleet',s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-fleet-parameters').value,fields=view?.resourceFields,section=gpEl('div');s.fleetFieldControls=[];box.appendChild(section);section.appendChild(gpEl('h4','明确已占资源田逐田放弃'));
 if(!Array.isArray(fields?.fields)||!fields.fields.length){section.appendChild(gpEl('p','原已占列表完整且非空时可明确选择，未知列表不推定没有资源田。'));return;}
 const live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&$('gp-fleet-parameters').value===source,editable=()=>live()&&gpDomainSelectable(id)&&!s.targetDraftPending&&s.data?.config?.enabled===true&&s.data.config.giveUpResourceField===true&&wfEditorEditable(),control=input=>{input._fleetFieldLive=editable;input.disabled=!editable();s.fleetFieldControls.push(input);return input;};
 const changed=input=>{if(input.disabled||!editable())return;gpInvalidate(id,false);wfInvalidateSettingPlans();$('gp-fleet-hint').textContent='资源田选择或时长已编辑，旧计划和授权失效；准备时重新读取完整已占列表和库存。';};
 const checks=fields.fields.map(field=>{const check=control(gpEl('input'));check.type='checkbox';check.checked=false;check.dataset.fleetFieldBatchTarget=String(field.gridIdx);check.onchange=()=>changed(check);const label=gpEl('label','网格 '+field.gridIdx+' · 城市 '+field.cityId+' · 类型原值 '+field.type+' ');label.appendChild(check);section.appendChild(label);return {check,field};});
 const chosen=()=>checks.filter(({check})=>check.checked).map(({field})=>field.gridIdx),duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='300';duration.dataset.fleetFieldBatchDuration='true';duration.setAttribute('aria-label','资源田逐田放弃总时长秒');duration.oninput=()=>changed(duration);duration.onchange=()=>changed(duration);section.appendChild(duration);
 const prepare=control(gpEl('button','准备原Workflow逐田放弃'));prepare.type='button';prepare.dataset.fleetFieldBatchPrepare='true';section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(!editable())return;const gridIndices=chosen(),text=duration.value,seconds=Number(text);if(!gridIndices.length||gridIndices.length>24||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-fleet-hint').textContent='请明确选择1至24个已占网格及1至86400秒时长，网格0保留原身份。';return;}
  const payload={gridIndices,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('fleet-fields-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(gridIndices),config=s.data.config,editorDraft=$('wf-json').value;
  const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&duration.value===text&&JSON.stringify(chosen())===choice;
  s.plan=null;s.selected.clear();gpClear($('gp-fleet-plan-view'));s.pending=true;gpControls(id);
  try{const data=await operationMutation('/api/gameplay/fleet/fields/prepare',payload,requestScope);if(!active())return;editor.accept(gpFleetFieldGraph(data,payload,view,requestScope.account));$('wf-hint').textContent='已载入明确资源田逐田放弃图；每田重新调查、单次授权和完整列表/库存验证后继续。';$('gp-fleet-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-fleet-hint').textContent=error.message;}finally{if(gpGet(id)===s&&s.revision===edit){s.pending=false;gpControls(id);}}
 };section.appendChild(gpEl('p','默认不选；放弃只移除所选已占网格，不领取产出或自动占田。每田完整原列表和库存核验，其他田/上限/库存变化或UNKNOWN停止，不重发，重启只读。'));
}

function gpFleetMoveGraph(data,payload,view,accountId){
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item),same=(a,b)=>canonical(a)===canonical(b),graph=data.graph;
 if(data.accountId!==accountId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||data.maxDurationMs!==payload.maxDurationMs||data.cityId!==payload.cityId||!same(data.buildingIds,payload.buildingIds)||!same(data.screenCenter,payload.screenCenter)||view?.worldScope?.status!=='OBSERVED'||!same(data.worldQuery,view.worldScope.query)||!Array.isArray(data.steps)||data.steps.length!==payload.buildingIds.length)throw Error('移动组合账号、城市、原查询视野、所选舰队或时长不匹配');
 const nodes=[{id:'start',type:'START'}];let petrol=0;payload.buildingIds.forEach((buildingId,i)=>{
  const rows=(view.candidates||[]).filter(row=>row.actionType==='fleetMove'&&row.target?.buildingId===buildingId&&row.target?.cityId===payload.cityId),row=rows[0],step=data.steps[i],parameters={buildingId,cityId:payload.cityId,...(payload.screenCenter===undefined?{}:{screenCenter:payload.screenCenter})};
  if(rows.length!==1||row.decision!=='READY'||!same(row.parameters,parameters)||!same(step?.parameters,row.parameters)||!same(step?.selection,{actionId:row.actionId})||!same(step?.target,row.target)||!same(step?.costs,row.costs)||!Array.isArray(row.costs)||row.costs.length>1||row.costs.some(cost=>cost.id!=='汽油'||!Number.isSafeInteger(cost.num)||cost.num<=0))throw Error('移动原候选、目标、选择或汽油成本已变化');
  petrol+=row.costs[0]?.num??0;if(!Number.isSafeInteger(petrol))throw Error('移动累计汽油溢出');nodes.push({id:'move-'+i,type:'ACTION',module:'fleet',parameters:row.parameters,selection:{actionId:row.actionId}},{id:'verify-'+i,type:'VERIFY',module:'fleet'});
 });nodes.push({id:'stop',type:'STOP'});const budget={resources:petrol?[{id:'汽油',num:petrol}]:[],quotas:[],uids:[]};
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.buildingIds.length,modules:['fleet']}))throw Error('移动逐舰验证顺序或固定父汽油预算不匹配');return graph;
}
function gpRenderFleetMoveBatch(box,view,centerUnchanged){
 const id='fleet',s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-fleet-parameters').value,section=gpEl('article');s.fleetMoveControls=[];box.appendChild(section);section.appendChild(gpEl('h4','明确多舰向同一城市逐舰移动'));
 let parameters;try{parameters=JSON.parse(source);}catch{}const cityId=parameters?.cityId,rows=(view?.candidates||[]).filter(row=>row.actionType==='fleetMove'&&row.target?.cityId===cityId);
 if(!Number.isSafeInteger(cityId)||!rows.length){section.appendChild(gpEl('p','先在下方选择本次视野城市，准备全部舰队候选并重新调查；候选资格和费用仍由原Function核验。'));return;}
 const live=()=>gpSafe(scope,revision)&&gpGet(id)===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&$('gp-fleet-parameters').value===source&&centerUnchanged(),editable=()=>live()&&gpDomainSelectable(id)&&!s.targetDraftPending&&s.data?.config?.enabled===true&&s.data.config.move===true&&view?.worldScope?.status==='OBSERVED'&&wfEditorEditable(),control=(input,allowed=()=>true)=>{input._fleetMoveLive=()=>editable()&&allowed();input.disabled=!input._fleetMoveLive();s.fleetMoveControls.push(input);return input;};
 const changed=input=>{if(input.disabled||!editable())return;gpInvalidate(id,false);wfInvalidateSettingPlans();$('gp-fleet-hint').textContent='移动舰队选择或时长已编辑，旧计划和授权失效；准备时重新调查并核累计汽油与保留线。';};
 const checks=rows.map(row=>{const check=control(gpEl('input'),()=>row.decision==='READY');check.type='checkbox';check.checked=false;check.dataset.fleetMoveBatchTarget=row.target.buildingId;check.onchange=()=>changed(check);const label=gpEl('label',row.target.buildingId+' → 城市 '+cityId+' · '+operationCosts(row.costs)+' · '+(row.reason??row.decision)+' ');label.appendChild(check);section.appendChild(label);return {check,row};});
 const chosen=()=>checks.filter(({check})=>check.checked).map(({row})=>row.target.buildingId),duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='';duration.placeholder='明确移动组合总时长（秒）';duration.dataset.fleetMoveBatchDuration='true';duration.oninput=()=>changed(duration);duration.onchange=()=>changed(duration);section.appendChild(duration);
 const prepare=control(gpEl('button','准备原Workflow逐舰定点移动'));prepare.type='button';prepare.dataset.fleetMoveBatchPrepare='true';section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(!editable())return;const buildingIds=chosen(),text=duration.value,seconds=Number(text);if(!buildingIds.length||buildingIds.length>24||new Set(buildingIds).size!==buildingIds.length||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-fleet-hint').textContent='请明确选择1至24艘不同合格舰队及1至86400秒总时长。';return;}
  const payload={buildingIds,cityId,...(Object.hasOwn(parameters,'screenCenter')?{screenCenter:parameters.screenCenter}:{}),maxDurationMs:seconds*1000},requestScope=viewGuard.begin('fleet-moves-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(buildingIds),config=s.data.config,editorDraft=$('wf-json').value;
  const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&duration.value===text&&JSON.stringify(chosen())===choice;
  s.plan=null;s.selected.clear();gpClear($('gp-fleet-plan-view'));s.pending=true;gpControls(id);
  try{const data=await operationMutation('/api/gameplay/fleet/move/prepare',payload,requestScope);if(!active())return;editor.accept(gpFleetMoveGraph(data,payload,view,requestScope.account));$('wf-hint').textContent='已载入明确多舰定点移动；每舰重新调查、单次授权并独立复读。固定父汽油预算，资格失效、预算不足、拒绝或UNKNOWN停止。';$('gp-fleet-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-fleet-hint').textContent=error.message;}finally{if(gpGet(id)===s&&s.revision===edit){s.pending=false;gpControls(id);}}
 };section.appendChild(gpEl('p','默认不选舰队；仅沿本次视野同城逐舰移动，不扩视野或自动跟随。费用沿原城市归属和地图算法；每舰计划授权当前具体成本，收入不扩固定父预算，到达不证明攻城或占领成功，重启只读不重发。'));
}

function gpRenderFleetOperations(view) {
 const box=gpClear($('gp-fleet-operations')),section=gpEl('div'),s=gpGet('fleet'),scope=viewGuard.capture(),revision=gpRevision,edit=s.revision,source=$('gp-fleet-parameters').value;s.fleetOperationControls=[];s.fleetRepairControls=[];box.appendChild(section);section.appendChild(gpEl('h3','舰队维护与移动'));
 const live=()=>gpSafe(scope,revision)&&gpGet('fleet')===s&&s.data?.view===view&&Array.from(box.children).includes(section);
 const editable=()=>live()&&gpReady('fleet')&&!s.pending&&!s.configDirty&&!s.data?.status?.blocked&&!s.data?.status?.running&&!snapshot?.busy&&snapshot?.connected;
 const control=(input,allowed=()=>true)=>{input._fleetOperationLive=()=>editable()&&allowed();input.disabled=!input._fleetOperationLive();s.fleetOperationControls.push(input);return input;};
 let originalParameters=null;try{originalParameters=JSON.parse(source);}catch{}
 const explicitCenter=originalParameters&&Object.hasOwn(originalParameters,'screenCenter'),center=explicitCenter?originalParameters.screenCenter:null;
 const centerInputs={};for(const key of ['x','y']){const input=control(gpEl('input'));input.inputMode='numeric';input.placeholder='留空使用原默认0';input.value=center&&Number.isSafeInteger(center[key])?String(center[key]):'';input.dataset.fleetScreenCenter=key;centerInputs[key]=input;const label=gpEl('label','观察中心 '+key.toUpperCase()+' ');label.appendChild(input);section.appendChild(label);}
 const centerUnchanged=()=>['x','y'].every(key=>centerInputs[key].value===(center&&Number.isSafeInteger(center[key])?String(center[key]):''));
 const prepareCenter=control(gpEl('button','准备观察中心参数'));prepareCenter.type='button';prepareCenter.dataset.fleetScreenCenterPrepare='true';section.appendChild(prepareCenter);
 prepareCenter.onclick=()=>{if(!prepareCenter._fleetOperationLive())return;try{const values=['x','y'].map(key=>centerInputs[key].value),parameters={};if(values.some(value=>value!=='')){if(values.some(value=>! /^-?(0|[1-9][0-9]*)$/.test(value)||!Number.isSafeInteger(Number(value))||Math.abs(Number(value))>2147483647))throw Error('请同时填写明确的X、Y整数坐标，或同时留空使用原默认视野。');parameters.screenCenter={x:Number(values[0]),y:Number(values[1])};}$('gp-fleet-parameters').value=gpJson(parameters);gpInvalidate('fleet',true);gpRenderCandidates('fleet');gpRenderFleetOperations(view);$('gp-fleet-hint').textContent='观察中心已准备；请重新调查当前视野，再选择舰队和城市。';}catch(error){$('gp-fleet-hint').textContent=error.message;}};
 const world=view?.worldScope;section.appendChild(gpEl('p','本次城市视野 '+(world?.status??'UNKNOWN')+' · 中心 '+gpJson(world?.query?.screenCenter??null)+' · 来源时间 '+String(world?.sourceAt??'UNKNOWN')+'；仅覆盖本次响应，不能推断全图。'));
 gpRenderFleetFieldBatch(section,view);
 const fields=view?.resourceFields;
 gpAllianceTable(section,'本账号已占资源田',['网格','城市','类型原值'],(fields?.fields||[]).map(row=>[row.gridIdx,row.cityId,row.type]));
 section.appendChild(gpEl('p','资源田上限：'+(fields?.maxNum??'未知')+'。放弃只移除明确已占网格，不领取产出；须重新探测、预览并授权。'));
 const fieldReady=()=>s.data?.config?.enabled===true&&s.data?.config?.giveUpResourceField===true&&Array.isArray(fields?.fields)&&s.revision===edit&&$('gp-fleet-parameters').value===source;
 const field=control(gpEl('select'),fieldReady);field.dataset.resourceFieldTarget='true';let emptyField=gpEl('option','请选择明确已占资源田');emptyField.value='';field.appendChild(emptyField);
 for(const row of fields?.fields||[]){const o=gpEl('option','网格 '+row.gridIdx+' · 城市 '+row.cityId);o.value=String(row.gridIdx);field.appendChild(o);}field.value='';section.appendChild(field);
 const giveUp=control(gpEl('button','准备放弃指定资源田参数'),fieldReady);giveUp.dataset.resourceFieldPrepare='true';section.appendChild(giveUp);
 giveUp.onclick=()=>{if(!giveUp._fleetOperationLive())return;const row=fields.fields.find(row=>String(row.gridIdx)===field.value);if(!row||!Number.isInteger(row.gridIdx)||row.gridIdx<0||row.gridIdx>2147483647){$('gp-fleet-hint').textContent='请选择本账号本次完整已占列表中的明确网格。';return;}$('gp-fleet-parameters').value=gpJson({resourceFieldGridIdx:row.gridIdx});gpInvalidate('fleet',true);gpRenderCandidates('fleet');gpRenderFleetOperations(view);$('gp-fleet-hint').textContent='放弃目标已准备；请重新探测，核对零成本及仅指定网格移除，再单独授权。';};
 const fieldRows=(view?.candidates||[]).filter(row=>row.actionType==='giveUpField');
 gpAllianceTable(section,'明确资源田放弃候选',['网格','成本','状态 / 阻塞','选择'],fieldRows.map(row=>{const choose=control(gpEl('button','选择此放弃候选'),()=>!s.dirty&&!gpBlocked(row));choose.dataset.resourceFieldCandidate=row.actionId;choose.onclick=()=>{if(choose._fleetOperationLive()&&s.data?.view?.candidates?.includes(row)){gpSelectDomainCandidate('fleet',row.actionId);gpRenderFleetOperations(view);}};return [row.target?.gridIdx,operationCosts(row.costs),row.reason??row.decision,choose];}));
 const speedBox=gpEl('article');section.appendChild(speedBox);speedBox.appendChild(gpEl('h4','明确单舰道具维修加速'));
 speedBox.appendChild(gpEl('p','只用自有加速器，每件缩短60秒；继续维修或完成须按原计时明确判断并完整复读。这里只准备参数，随后重新调查、预览并单独授权。'));
 for(const row of view?.repairAcceleration||[]){const label=gpEl('label',row.buildingId+' · 本次最多 '+row.maxUseNum+' 件 '),num=control(gpEl('input'));num.type='number';num.min='1';num.max=String(row.maxUseNum);num.value='';num.placeholder='明确自有道具数量';num.dataset.fleetRepairSpeedCount=row.buildingId;label.appendChild(num);const prepare=control(gpEl('button','准备此舰道具加速参数'));prepare.type='button';prepare.dataset.fleetRepairSpeedTarget=row.buildingId;label.appendChild(prepare);speedBox.appendChild(label);prepare.onclick=()=>{if(!prepare._fleetOperationLive()||!num._fleetOperationLive())return;const useNum=Number(num.value);if(!/^[1-9][0-9]*$/.test(num.value)||!Number.isSafeInteger(useNum)||useNum>row.maxUseNum){$('gp-fleet-hint').textContent='请输入本次范围内明确的自有加速器数量。';return;}$('gp-fleet-parameters').value=gpJson({action:'speed-repair',buildingId:row.buildingId,useNum,expectedSpeedHash:row.expectedSpeedHash});gpInvalidate('fleet',true);gpRenderCandidates('fleet');gpRenderFleetOperations(view);$('gp-fleet-hint').textContent='单舰道具加速参数已准备；请重新调查、核对成本和未来截止，再预览并单独授权。';};}
 const labels={speedUpRepair:'自有道具维修加速',fleetRepair:'维修',fleetStopRepair:'停止维修',fleetStopAutoFight:'关闭委任',fleetMove:'移动到城市'};
 const rows=(view?.candidates||[]).filter(row=>Object.hasOwn(labels,row.actionType));
 gpAllianceTable(section,'当前具体维护 / 移动候选',['舰队','动作','目标城市','可执行成本','成本来源','状态 / 阻塞','选择'],rows.map(row=>{
  const button=control(gpEl('button','选择此候选'),()=>!s.dirty&&!gpBlocked(row));button.type='button';button.dataset.fleetOperation=row.actionId;
  button.onclick=()=>{if(!button._fleetOperationLive()||!s.data?.view?.candidates?.includes(row))return;gpSelectDomainCandidate('fleet',row.actionId);gpRenderFleetOperations(view);};
  return [row.target?.buildingId,labels[row.actionType],row.target?.cityId??'—',gpBlocked(row)?'尚未形成可执行成本':operationCosts(row.costs),row.costSource??'未知',gpBlocked(row)?row.reason||row.blockedReason||'UNKNOWN':'可预览',button];
 }));
 section.appendChild(gpEl('p','选择候选只加载当前明确参数，随后预览成本并单次授权。维修阈值、汽油保留线和计划上限使用本账号已有配置；预期收益不增加预算。'));
 const repairBox=gpEl('article'),repairChecks=[];section.appendChild(repairBox);repairBox.appendChild(gpEl('h4','明确多舰有限维护'));
 const repairLive=()=>editable()&&!s.dirty&&!s.targetDraftPending&&centerUnchanged()&&$('gp-fleet-parameters').value===source&&wfEditorEditable(),repairControl=(input,allowed=()=>true)=>{input._fleetOperationLive=()=>repairLive()&&allowed();input.disabled=!input._fleetOperationLive();s.fleetRepairControls.push(input);return input;};
 const repairChanged=input=>{if(input.disabled||!repairLive())return;gpInvalidate('fleet',false);wfInvalidateSettingPlans();$('gp-fleet-hint').textContent='维修组合草稿已改变，旧计划和授权失效；重新准备后核对原优先序、累计汽油和时长。';};
 const maintenanceMode=repairControl(gpEl('select'));maintenanceMode.dataset.fleetMaintenanceAction='true';for(const [value,text]of [['repair','维修'],['stop-repair','停止维修'],['stop-auto-fight','关闭委任']]){const option=gpEl('option',text);option.value=value;maintenanceMode.appendChild(option);}maintenanceMode.value='repair';repairBox.appendChild(maintenanceMode);const maintenanceTargets=gpEl('div');repairBox.appendChild(maintenanceTargets);
 const maintenanceRows=()=>{const kind=maintenanceMode.value,type=kind==='stop-repair'?'fleetStopRepair':'fleetStopAutoFight';return kind==='repair'?view?.repairPreparation||[]:(view?.maintenancePreparation||[]).filter(row=>row.actionType===type);};
 const renderMaintenanceTargets=()=>{gpClear(maintenanceTargets);repairChecks.length=0;const mode=maintenanceMode.value;for(const row of maintenanceRows()){const check=repairControl(gpEl('input'),()=>maintenanceMode.value===mode&&row.decision==='READY'&&row.reason===null);check.type='checkbox';check.checked=false;check.dataset.fleetRepairTarget=row.buildingId;check.onchange=()=>repairChanged(check);repairChecks.push({check,row});const label=gpEl('label',row.buildingId+' · '+operationCosts(row.costs)+' · '+(row.reason??'可准备')+' ');label.appendChild(check);maintenanceTargets.appendChild(label);}};maintenanceMode.onchange=()=>{if(!maintenanceMode._fleetOperationLive())return;repairChanged(maintenanceMode);renderMaintenanceTargets();};renderMaintenanceTargets();
 const repairSeconds=repairControl(gpEl('input'));repairSeconds.type='number';repairSeconds.min='1';repairSeconds.max='86400';repairSeconds.value='';repairSeconds.placeholder='明确组合总时长（秒）';repairSeconds.dataset.fleetRepairDuration='true';repairSeconds.oninput=()=>repairChanged(repairSeconds);repairSeconds.onchange=()=>repairChanged(repairSeconds);repairBox.appendChild(repairSeconds);
 const repairPrepare=repairControl(gpEl('button','准备原Workflow有限维护'));repairPrepare.type='button';repairPrepare.dataset.fleetRepairPrepare='true';repairBox.appendChild(repairPrepare);
 repairPrepare.onclick=async()=>{
  if(!repairPrepare._fleetOperationLive())return;const repairs=repairChecks.filter(({check})=>check.checked).map(({row})=>({buildingId:row.buildingId,expectedRepairHash:row.expectedRepairHash})),duration=repairSeconds.value,seconds=Number(duration);
  if(!repairs.length||repairs.length>24||! /^[1-9][0-9]*$/.test(duration)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-fleet-hint').textContent='请明确选择1至24艘符合资格的舰队及1至86400秒总时长。';return;}
  const mode=maintenanceMode.value,payload={...(mode==='repair'?{}:{action:mode}),repairs,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('fleet-repair-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(repairs),config=s.data.config,editorDraft=$('wf-json').value;
  const active=()=>gpSafe(requestScope,revision)&&gpGet('fleet')===s&&s.revision===edit&&s.data?.view===view&&s.data?.config===config&&Array.from(box.children).includes(section)&&$('gp-fleet-parameters').value===source&&centerUnchanged()&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&$('wf-json').value===editorDraft&&maintenanceMode.value===mode&&repairSeconds.value===duration&&JSON.stringify(repairChecks.filter(({check})=>check.checked).map(({row})=>({buildingId:row.buildingId,expectedRepairHash:row.expectedRepairHash})))===choice;
  s.plan=null;s.selected.clear();gpClear($('gp-fleet-plan-view'));s.pending=true;gpControls('fleet');
  try{const data=await operationMutation('/api/gameplay/fleet/repair/prepare',payload,requestScope);if(!active())return;editor.accept(gpFleetRepairGraph(data,payload,view,config,requestScope.account));$('wf-hint').textContent='已载入明确舰队有限维护；每舰按同一原动作重新调查、单次授权与独立停止或维修验证，未确认、拒绝或UNKNOWN停止。';$('gp-fleet-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-fleet-hint').textContent=error.message;}finally{if(gpGet('fleet')===s&&s.revision===edit){s.pending=false;gpControls('fleet');}}
 };
 repairBox.appendChild(gpEl('p','不默认选择舰队；切换维护种类清空选择并撤销旧计划。维修沿原优先序、阈值和汽油限额；停止维修/关闭委任沿原单舰零支出请求和MyFleets复读，不开启委任、不自动维修或派遣。每舰确认后继续，状态变化、拒绝或UNKNOWN停止。'));
 gpRenderFleetMoveBatch(section,view,centerUnchanged);
 const moveReady=()=>!s.dirty&&centerUnchanged()&&s.data?.config?.enabled===true&&s.data?.config?.move===true&&view?.citiesReliable===true&&view?.formationReliability?.fleets===true&&s.revision===edit&&$('gp-fleet-parameters').value===source;
 const fleet=control(gpEl('select'),moveReady),city=control(gpEl('select'),moveReady);fleet.dataset.fleetMovement='building';city.dataset.fleetMovement='city';
 const option=(select,id,label)=>{const row=gpEl('option',label);row.value=id;select.appendChild(row);};option(fleet,'','请选择精确舰队');option(city,'','请选择当前视野城市');
 for(const row of view?.fleets||[])option(fleet,row.buildingId,row.buildingId+' · 状态 '+(row.state??'未知'));
 for(const row of view?.cities||[])option(city,String(row.id),'城市 '+row.id+' · 当前联盟索引 '+(row.guildIdx??'未知'));
 fleet.value='';city.value='';for(const [text,input]of [['移动舰队',fleet],['目标城市',city]]){const label=gpEl('label',text+' ');label.appendChild(input);section.appendChild(label);}
 section.appendChild(gpEl('p','城市来源：本次 WorldInfo 当前视野，未列出的城市保持未知。实际移动范围、城市归属、地图成本、耐久和汽油须在重新探测后由原 Function 核验。'));
 const prepare=control(gpEl('button','准备明确城市移动参数'),moveReady);prepare.type='button';prepare.dataset.fleetMovementPrepare='true';section.appendChild(prepare);
 prepare.onclick=()=>{
  if(!prepare._fleetOperationLive())return;
  const selectedFleet=(view?.fleets||[]).find(row=>row.buildingId===fleet.value),selectedCity=(view?.cities||[]).find(row=>String(row.id)===city.value);
  if(!selectedFleet||!selectedCity||!Number.isSafeInteger(selectedCity.id)||selectedCity.id<=0||selectedCity.id>2147483647){$('gp-fleet-hint').textContent='请选择本账号本次视野内的精确舰队和城市。';return;}
  $('gp-fleet-parameters').value=gpJson({buildingId:selectedFleet.buildingId,cityId:selectedCity.id,...(explicitCenter?{screenCenter:{x:center.x,y:center.y}}:{})});gpInvalidate('fleet',true);gpRenderCandidates('fleet');gpRenderFleetOperations(view);$('gp-fleet-hint').textContent='移动目标参数已准备；请重新探测，核对具体成本和移动候选，再单次授权。';
 };
 const allMoves=control(gpEl('button','准备此城全部舰队移动候选'),moveReady);allMoves.type='button';allMoves.dataset.fleetMovementAllPrepare='true';section.appendChild(allMoves);
 allMoves.onclick=()=>{if(!allMoves._fleetOperationLive())return;const selectedCity=(view?.cities||[]).find(row=>String(row.id)===city.value);if(!selectedCity||!Number.isSafeInteger(selectedCity.id)||selectedCity.id<=0||selectedCity.id>2147483647){$('gp-fleet-hint').textContent='请选择本次视野内的明确城市。';return;}$('gp-fleet-parameters').value=gpJson({cityId:selectedCity.id,...(explicitCenter?{screenCenter:{x:center.x,y:center.y}}:{})});gpInvalidate('fleet',true);wfInvalidateSettingPlans();gpRenderCandidates('fleet');gpRenderFleetOperations(view);$('gp-fleet-hint').textContent='已准备同城全部舰队移动参数；请重新调查后明确勾选合格舰队，不默认选择或授权。';};
 if(!moveReady())section.appendChild(gpEl('p','移动目标编辑需本账号启用移动，并具备可靠舰队和当前视野城市；旧缓存缺证不推断为可用。'));
 for(const row of view?.blocked||[])if(['speedUpFleet','speedUpRepair','autoFight'].includes(row.actionType))section.appendChild(gpEl('p',row.actionType+' · '+row.code+' · '+row.reason));
 gpWatchTargetDraft('fleet',s,view,'fleetOperationControls');
}

function gpRenderFleetFormation(view,draft={}) {
 const box=gpClear($('gp-fleet-formations')),s=gpGet('fleet'),scope=viewGuard.capture(),revision=gpRevision,edit=s.revision,source=$('gp-fleet-parameters').value,section=gpEl('div');s.fleetFormationControls=[];
 box.appendChild(section);section.appendChild(gpEl('h3','舰队编组与手动站位'));
 section.appendChild(gpEl('p','来源：MyFleets / OnWater / AllHero / MyFormationPreset 和现有阵型配置。编辑只准备参数；须重新探测、预览具体候选并授权，OnWater 独立复读后才确认。'));
 const show=value=>value===null||value===undefined?'未知':String(value),formations=view?.formations||[],fleets=view?.fleets||[],catalog=view?.formationCatalog;
 gpAllianceTable(section,'当前舰队编组',['舰队 ID','状态','耐久 / 上限','委任','维修','模板','英雄站位','宠物 UID（只读）'],fleets.map(fleet=>{const formation=formations.find(row=>row.buildingId===fleet.buildingId)?.formation;return [fleet.buildingId,fleet.state,show(fleet.durability)+' / '+show(fleet.maxDura),fleet.autoFight?.isOn===true?'开启':fleet.autoFight?.isOn===false?'关闭':'未知',fleet.repairing===null?'无维修':fleet.repairing?'维修中':'未知',formation?.presetId,formation?gpJson(formation.heroPositions):'未知',formation?(Object.hasOwn(formation,'petUid')?formation.petUid:'无绑定（原Adapter归一化）'):'未知'];}));
 const reliability=view?.formationReliability,ready=['fleets','buildings','heroes','presets','config'].every(key=>reliability?.[key]===true)&&catalog?.reliable===true&&Number.isSafeInteger(catalog.maxHeroes)&&catalog.maxHeroes>0;
 if(!ready)section.appendChild(gpEl('p','编组事实不完整；需本账号重新探测舰队、OnWater 阵容、英雄和模板。旧缓存缺少可靠性字段时不推断为可靠。'));
 const live=()=>gpSafe(scope,revision)&&gpGet('fleet')===s&&s.data?.view===view&&s.revision===edit&&$('gp-fleet-parameters').value===source&&Array.from(box.children).includes(section)&&gpReady('fleet')&&!s.pending&&!s.configDirty&&!s.data?.status?.blocked&&!s.data?.status?.running&&!snapshot?.busy&&snapshot?.connected&&s.data?.config?.enabled===true&&s.data?.config?.formation===true&&ready;
 const control=(input,allowed=()=>true)=>{input._fleetFormLive=()=>live()&&allowed();input.disabled=!input._fleetFormLive();s.fleetFormationControls.push(input);return input;};
 const label=(text,input)=>{const wrap=gpEl('label',text+' ');wrap.appendChild(input);section.appendChild(wrap);};
 const target=control(gpEl('select'));target.dataset.fleetFormation='building';let option=gpEl('option','请选择精确舰队');option.value='';target.appendChild(option);
 for(const fleet of fleets){const option=gpEl('option',fleet.buildingId+' · 状态 '+show(fleet.state));option.value=fleet.buildingId;target.appendChild(option);}target.value=draft.buildingId||'';label('舰队',target);
 const building=formations.find(row=>row.buildingId===target.value),fleet=fleets.find(row=>row.buildingId===target.value),formation=building?.formation;
 const petKnown=formation&&(!Object.hasOwn(formation,'petUid')||String(formation.petUid)==='0');
 const targetReady=()=>Boolean(fleet&&formation&&building.level>0&&fleet.state===1&&fleet.repairing===null&&fleet.autoFight?.isOn===false&&formations.every(row=>row.formation)&&petKnown);
 if(target.value&&!targetReady())section.appendChild(gpEl('p',!petKnown?'FLEET_PET_BINDING_UNVERIFIED：非零宠物绑定合同缺证，保留原绑定。':'当前舰队状态或全体编组不可靠；保留原阵容，重新探测后再选择。'));
 const layout=control(gpEl('select'),targetReady);layout.dataset.fleetFormation='preset';option=gpEl('option','请选择已解锁可靠模板');option.value='';layout.appendChild(option);
 const layouts=(catalog?.layouts||[]).filter(row=>row.reliable===true&&(view.unlockedPresetIds||[]).includes(row.id));
 for(const row of layouts){const option=gpEl('option','模板 '+row.id+' · '+row.positions.length+' 个坐标');option.value=String(row.id);layout.appendChild(option);}layout.value=String(draft.presetId??formation?.presetId??'');label('阵型模板',layout);
 const occupied=new Set(formations.filter(row=>row.buildingId!==target.value).flatMap(row=>row.formation?.heroPositions?.map(position=>position.heroId)||[])),owned=new Set(view?.ownedHeroIds||[]);
 const slots=draft.slots||formation?.heroPositions?.map(row=>({heroId:row.heroId,x:String(row.pos.x),y:String(row.pos.y),checked:true}))||[],roster=[];
 const rosterTable=gpEl('table'),heading=gpEl('tr');for(const text of ['选择','英雄','职业','占用 / 归属','X','Y'])heading.appendChild(gpEl('th',text));rosterTable.appendChild(heading);
 for(const hero of catalog?.heroes||[]){
  const slot=slots.find(row=>row.heroId===hero.heroId),available=owned.has(hero.heroId)&&hero.reliable===true&&!occupied.has(hero.heroId),row=gpEl('tr'),check=control(gpEl('input'),()=>targetReady()&&available),x=control(gpEl('input'),()=>targetReady()&&available),y=control(gpEl('input'),()=>targetReady()&&available);
  check.type='checkbox';check.checked=slot?.checked===true;check.dataset.fleetFormationHero=hero.heroId;for(const [input,axis]of [[x,'x'],[y,'y']]){input.type='text';input.value=slot?.[axis]??'';input.dataset.fleetFormationHero=hero.heroId;input.dataset.fleetFormationAxis=axis;}
  for(const value of [check,hero.heroId,hero.career,occupied.has(hero.heroId)?'其他舰队占用':!owned.has(hero.heroId)?'未拥有':hero.reliable!==true?'英雄配置未知':'可选择',x,y]){const cell=gpEl('td');if(value&&typeof value==='object'&&value.tagName)cell.appendChild(value);else cell.textContent=show(value);row.appendChild(cell);}rosterTable.appendChild(row);roster.push({heroId:hero.heroId,check,x,y,available});
 }
 section.appendChild(rosterTable);const positions=()=>roster.map(row=>({heroId:row.heroId,checked:row.check.checked,x:row.x.value,y:row.y.value}));
 target.onchange=()=>{if(live()&&fleets.some(row=>row.buildingId===target.value))gpRenderFleetFormation(view,{buildingId:target.value});};
 layout.onchange=()=>{if(live()&&targetReady())gpRenderFleetFormation(view,{buildingId:target.value,presetId:layout.value,slots:positions()});};
 const apply=control(gpEl('button','准备此舰队手动站位参数'),targetReady);apply.type='button';apply.dataset.fleetFormationApply='true';section.appendChild(apply);
 apply.onclick=()=>{
  if(!live()||!targetReady())return;
  try {
   const preset=layouts.find(row=>String(row.id)===layout.value);if(!preset)throw Error('请选择当前已解锁可靠模板。');
   const chosen=roster.filter(row=>row.check.checked);if(!chosen.length||chosen.length>catalog.maxHeroes)throw Error('英雄数量需为1至'+catalog.maxHeroes+'，按当前配置核对。');
   const seen=new Set(),heroPositions=chosen.map(row=>{
    if(!row.available)throw Error('所选英雄归属不可靠或已被其他舰队占用。');
    const pos={};for(const key of ['x','y']){const raw=row[key].value;if(!/^-?(0|[1-9][0-9]*)$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)<-2147483648||Number(raw)>2147483647)throw Error('站位必须是明确十进制 int32；不能使用指数、空白或舍入值。');pos[key]=Number(raw);}
    if(!preset.positions.some(p=>p.x===pos.x&&p.y===pos.y)||seen.has(pos.x+':'+pos.y))throw Error('站位必须属于所选模板且不能重叠。');seen.add(pos.x+':'+pos.y);return {heroId:row.heroId,pos};
   });
   $('gp-fleet-parameters').value=gpJson({buildingId:fleet.buildingId,presetId:preset.id,heroPositions});gpInvalidate('fleet',true);gpRenderCandidates('fleet');gpRenderFleetFormation(view,{buildingId:fleet.buildingId,presetId:preset.id,slots:positions()});$('gp-fleet-hint').textContent='已准备明确舰队编组参数；请重新探测，再选择候选预览与授权。';
  }catch(error){$('gp-fleet-hint').textContent=error.message;}
 };
 gpWatchTargetDraft('fleet',s,view,'fleetFormationControls');
}

function gpCargoSelectable(){const s=gpGet('fleet');return gpReady('fleet')&&!s.pending&&!s.dirty&&!s.targetDraftPending&&!s.configDirty&&!s.data?.status?.blocked&&!s.data?.status?.running&&!snapshot?.busy&&snapshot?.connected;}
function gpCargoFillGraph(data,payload,accountId,view){
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
 const same=(a,b)=>canonical(a)===canonical(b),graph=data.graph,multiShip=payload.action==='fill';
 const loads=multiShip?payload.loads:[payload];
 const matches=multiShip?data.action==='fill'&&same(data.loads,payload.loads)
  :data.shipIndex===payload.shipIndex&&data.expectedCargoHash===payload.expectedCargoHash&&same(data.cargoIndices,payload.cargoIndices);
 const count=loads.reduce((total,load)=>total+load.cargoIndices.length,0);
 if(data.accountId!==accountId||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true
  ||!matches||data.maxDurationMs!==payload.maxDurationMs||!Array.isArray(data.steps)||data.steps.length!==count
  ||!Array.isArray(data.budget?.resources)||!same(data.budget.quotas,[])||!same(data.budget.uids,[]))throw Error('装货组合账号、原货船状态、所选货格或预算不匹配');
 const nodes=[{id:'start',type:'START'}],totals=new Map();
 let stepIndex=0;
 for(const load of loads){
  const ship=multiShip&&view.cargo?.ships?.find(ship=>ship.shipIndex===load.shipIndex);
  for(const [i,cargoIndex] of load.cargoIndices.entries()){
   const step=data.steps[stepIndex++],parameters=step?.parameters;
   if(step?.cargoIndex!==cargoIndex||!parameters||Object.keys(parameters).length!==3||parameters.shipIndex!==load.shipIndex
    ||parameters.cargoIndex!==cargoIndex||typeof parameters.expectedCargoHash!=='string'||!/^[a-f0-9]{64}$/.test(parameters.expectedCargoHash)
    ||i===0&&parameters.expectedCargoHash!==load.expectedCargoHash||!Array.isArray(step.costs))throw Error('装货步骤或预期状态不匹配');
   if(multiShip){
    const slot=ship?.slots?.find(slot=>slot.cargoIndex===cargoIndex);
    if(step.shipIndex!==load.shipIndex||ship?.preparationHash!==load.expectedCargoHash||slot?.reliable!==true||slot.filled!==false
     ||typeof slot.id!=='string'||!Number.isSafeInteger(slot.required)||slot.required<1
     ||!same(step.costs,[{id:slot.id,num:slot.required}]))throw Error('装货步骤与所选货格材料不一致');
    const total=(totals.get(slot.id)||0)+slot.required;
    if(!Number.isSafeInteger(total))throw Error('装货总成本超出可靠范围');
    totals.set(slot.id,total);
   }
   const suffix=multiShip?load.shipIndex+'-'+cargoIndex:cargoIndex;
   nodes.push({id:'fill-'+suffix,type:'ACTION',module:'fleet',parameters,selection:{actionId:'fleet:cargoFill:'+load.shipIndex+':'+cargoIndex}},{id:'verify-'+suffix,type:'VERIFY',module:'fleet'});
  }
 }
 if(multiShip&&(data.budget.resources.length!==totals.size||new Set(data.budget.resources.map(row=>row?.id)).size!==totals.size
  ||data.budget.resources.some(row=>!totals.has(row?.id)||!same(row,{id:row.id,num:totals.get(row.id)}))))throw Error('装货累计预算与所选货格材料不一致');
 nodes.push({id:'stop',type:'STOP'});
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))
  ||!same(graph.budget,data.budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:count,modules:['fleet']}))throw Error('装货步骤、验证顺序或原累计预算不匹配');
 return graph;
}
function gpCargoClaimGraph(data,payload,view,accountId){
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item),same=(a,b)=>canonical(a)===canonical(b),graph=data.graph;
 if(data.accountId!==accountId||data.action!=='claim'||data.resumable!==false||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||data.maxDurationMs!==payload.maxDurationMs||!same(data.claims,payload.claims)||!Array.isArray(data.steps)||data.steps.length!==payload.claims.length)throw Error('到港领取组合账号、目标或时长不匹配');
 const nodes=[{id:'start',type:'START'}];payload.claims.forEach((parameters,i)=>{
  const source=view.cargo?.ships?.find(ship=>ship.shipIndex===parameters.shipIndex),step=data.steps[i],selection={actionId:source?.claimActionId};
  if(source?.reliable!==true||source.status!==2||source.preparationHash!==parameters.expectedCargoHash||!source.claimActionId||!same(step?.parameters,parameters)||!same(step?.selection,selection)||!same(step?.rewards,source.reward)||!same(step?.costs,[]))throw Error('所选到港航次、原奖励或执行顺序已变化');
  nodes.push({id:'claim-'+i,type:'ACTION',module:'fleet',parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'fleet'});
 });nodes.push({id:'stop',type:'STOP'});const budget={resources:[],quotas:[],uids:[]};
 if(graph?.version!==1||!same(graph.nodes,nodes)||!same(graph.edges,nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})))||!same(data.budget,budget)||!same(graph.budget,budget)||!same(graph.runPolicy,{maxDurationMs:payload.maxDurationMs,maxActions:payload.claims.length,modules:['fleet']}))throw Error('逐船验证、有限上限或原父预算不匹配');return graph;
}
function gpRenderCargoClaims(box,view){
 const s=gpGet('fleet'),scope=viewGuard.capture(),revision=gpRevision,source=$('gp-fleet-parameters').value,section=gpEl('div');s.cargoClaimControls=[];box.appendChild(section);section.appendChild(gpEl('h4','明确多船到港领取'));
 const ships=(view?.cargo?.ships||[]).filter(ship=>ship.reliable===true&&ship.status===2&&typeof ship.preparationHash==='string'&&/^[a-f0-9]{64}$/.test(ship.preparationHash)&&ship.claimActionId&&view.candidates?.some(row=>row.actionId===ship.claimActionId&&row.decision==='READY'&&!gpBlocked(row)));
 if(!ships.length){section.appendChild(gpEl('p','本次没有经原Function确认可准备的已到港货船；航行中及未知航次不加入。'));return;}
 const live=()=>gpSafe(scope,revision)&&gpGet('fleet')===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&$('gp-fleet-parameters').value===source,editable=()=>live()&&gpCargoSelectable()&&!s.targetDraftPending&&s.data?.config?.enabled===true&&s.data?.config?.cargoClaim===true&&wfEditorEditable(),control=input=>{input._cargoClaimLive=editable;input.disabled=!editable();s.cargoClaimControls.push(input);return input;};
 const changed=input=>{if(input.disabled||!editable())return;gpInvalidate('fleet',false);wfInvalidateSettingPlans();$('gp-fleet-hint').textContent='到港领取组合草稿已改变，旧计划和授权失效；准备将重新调查原航次与奖励。';};
 const checks=ships.map(ship=>{const check=control(gpEl('input'));check.type='checkbox';check.checked=false;check.dataset.cargoClaimTarget=String(ship.shipIndex);check.onchange=()=>changed(check);const label=gpEl('label','货船 '+ship.shipIndex+' · 原到达值 '+ship.arriveTime+' · 原奖励 '+gpJson(ship.reward)+' ');label.appendChild(check);section.appendChild(label);return {check,ship};});
 const duration=control(gpEl('input'));duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='300';duration.dataset.cargoClaimDuration='true';duration.setAttribute('aria-label','到港领取组合总时长秒');duration.oninput=()=>changed(duration);duration.onchange=()=>changed(duration);section.appendChild(duration);
 const chosen=()=>checks.filter(({check})=>check.checked).map(({ship})=>({shipIndex:ship.shipIndex,expectedCargoHash:ship.preparationHash})),prepare=control(gpEl('button','准备原Workflow逐船领取'));prepare.type='button';prepare.dataset.cargoClaimPrepare='true';section.appendChild(prepare);
 prepare.onclick=async()=>{
  if(!editable())return;const claims=chosen(),text=duration.value,seconds=Number(text);if(!claims.length||claims.length>24||! /^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(seconds)||seconds>86400){$('gp-fleet-hint').textContent='请明确选择1至24艘已到港货船及1至86400秒总时长。';return;}
  const payload={action:'claim',claims,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('cargo-claim-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(claims),config=s.data.config;
  const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&duration.value===text&&JSON.stringify(chosen())===choice;
  s.plan=null;s.selected.clear();gpClear($('gp-fleet-plan-view'));s.pending=true;gpControls('fleet');
  try{const data=await operationMutation('/api/gameplay/fleet/cargo/prepare',payload,requestScope);if(!active())return;editor.accept(gpCargoClaimGraph(data,payload,view,requestScope.account));$('wf-hint').textContent='已载入明确到港逐船领取；每船重新调查和单次授权，沿原typed奖励及完整库存验证，拒绝或UNKNOWN停止。';$('gp-fleet-hint').textContent=data.limitation;}
  catch(error){if(active())$('gp-fleet-hint').textContent=error.message;}finally{if(gpGet('fleet')===s&&s.revision===edit){s.pending=false;gpControls('fleet');}}
 };section.appendChild(gpEl('p','不默认选择；只领取所选已到港航次，不含补货、出航、加速或下一航次。所有奖励使用原计划和typed回执独立确认；预期收入不增加本次父预算。目标变化、拒绝或UNKNOWN停止，重启只读。'));
}

function gpRenderCargo(view){
 const box=gpClear($('gp-fleet-cargo')),s=gpGet('fleet'),scope=viewGuard.capture(),revision=gpRevision;s.cargoControls=[];s.cargoClaimControls=[];
 const cargo=view?.cargo;if(!cargo){box.textContent='货船明细尚未采集';return;}
 box.appendChild(gpEl('h3','港口货船与缺货'));
 box.appendChild(gpEl('p','数据来源：'+(cargo.source||'未知')+' · '+(cargo.reliable?'货船状态可靠':'货船状态存在缺失')+' · 库存'+(cargo.inventoryReliable?'可靠':'未知')));
 const show=value=>value===null||value===undefined?'未知':String(value);
 const select=(parent,actionId,label)=>{if(!actionId)return;const candidate=s.data?.view?.candidates?.find(row=>row.actionId===actionId),button=gpEl('button',label);button.dataset.cargoAction=actionId;button._blocked=!candidate||gpBlocked(candidate);button.disabled=button._blocked||!gpCargoSelectable();button.onclick=()=>{if(button.disabled||!gpCargoSelectable()||!gpSafe(scope,revision)||gpGet('fleet')!==s||s.data?.view!==view)return;const fresh=gpGet('fleet').data?.view?.candidates?.find(row=>row.actionId===actionId);if(!fresh||gpBlocked(fresh)||gpCandidateParametersChanged('fleet',fresh))return;s.selected.clear();s.selected.add(actionId);s.plan=null;s.revision++;if(fresh.parameters)$('gp-fleet-parameters').value=gpJson(fresh.parameters);gpClear($('gp-fleet-plan-view'));gpRender('fleet',s.data,s.scope);$('gp-fleet-hint').textContent='已选择此货船候选；请预览具体计划并授权。';};s.cargoControls.push(button);parent.appendChild(button);};
 gpRenderCargoClaims(box,view);
 const shipChoices=[];
 for(const ship of cargo.ships||[]){
  const section=gpEl('article'),checks=[];
  shipChoices.push({ship,checks});
  section.appendChild(gpEl('h4','货船 '+show(ship.shipIndex)+' · '+(ship.statusText||show(ship.status))));
  if(ship.reason)section.appendChild(gpEl('p','阻塞：'+ship.reason));
  const speed=(view.cargoAcceleration||[]).find(row=>row.shipIndex===ship.shipIndex);
  if(speed){const label=gpEl('label','自有道具加速（最多 '+speed.maxUseNum+' 件，每件60秒；到港不领奖） '),num=gpEl('input'),apply=gpEl('button','准备本船道具加速参数');num.type='number';num.min='1';num.max=String(speed.maxUseNum);num.value='';num.placeholder='明确加速器数量';num.dataset.cargoSpeedCount=String(ship.shipIndex);apply.type='button';apply.dataset.cargoSpeedTarget=String(ship.shipIndex);num._blocked=false;apply._blocked=false;s.cargoControls.push(num,apply);label.appendChild(num);label.appendChild(apply);section.appendChild(label);const current=()=>!apply.disabled&&!num.disabled&&gpSafe(scope,revision)&&gpGet('fleet')===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&gpCargoSelectable();num.oninput=num.onchange=()=>{if(!current())return;gpInvalidate('fleet',false);wfInvalidateSettingPlans();$('gp-fleet-hint').textContent='货船道具数量草稿已改变，旧计划和授权已失效；请应用明确目标后重新调查。';};apply.onclick=()=>{if(!current())return;const useNum=Number(num.value);if(!/^[1-9][0-9]*$/.test(num.value)||!Number.isSafeInteger(useNum)||useNum>speed.maxUseNum){$('gp-fleet-hint').textContent='请输入本次范围内明确的自有加速器数量。';return;}$('gp-fleet-parameters').value=gpJson({action:'speed-cargo',shipIndex:ship.shipIndex,useNum,expectedSpeedHash:speed.expectedSpeedHash});gpInvalidate('fleet',true);gpRenderCandidates('fleet');gpRenderCargo(view);$('gp-fleet-hint').textContent='单船道具加速参数已准备；请重新调查、预览成本和航行/到港结果，再单独授权。';};}
  select(section,(view.candidates||[]).find(row=>row.actionType==='speedUpCargo'&&row.target?.shipIndex===ship.shipIndex)?.actionId,'选择本船道具加速候选');
  const table=gpEl('table'),head=gpEl('tr');for(const text of ['组合选择','货格','物资','需求','持有','缺少','状态/选择'])head.appendChild(gpEl('th',text));table.appendChild(head);
  const live=()=>gpSafe(scope,revision)&&gpGet('fleet')===s&&s.data?.view===view&&Array.from(box.children).includes(section)&&gpCargoSelectable();
  const changed=control=>{if(control.disabled||!live()||!wfEditorEditable())return;gpInvalidate('fleet',false);wfInvalidateSettingPlans();$('gp-fleet-hint').textContent='货格组合草稿已改变，旧计划和授权已失效；重新准备组合后核对。';};
  for(const slot of ship.slots||[]){
   const tr=gpEl('tr'),cell=gpEl('td'),check=gpEl('input');check.type='checkbox';check.checked=false;check.dataset.cargoFillIndex=String(slot.cargoIndex);check._workflowPrepare=true;
   check._blocked=ship.reliable!==true||ship.status!==0||cargo.inventoryReliable!==true||slot.reliable!==true||slot.filled!==false||Boolean(slot.reason)||!Number.isInteger(slot.cargoIndex)||typeof ship.preparationHash!=='string'||!/^[a-f0-9]{64}$/.test(ship.preparationHash)||s.data?.config?.enabled!==true||s.data?.config?.cargoFill!==true;
   check.disabled=check._blocked||!gpCargoSelectable()||!wfEditorEditable();check.onchange=()=>changed(check);checks.push(check);s.cargoControls.push(check);cell.appendChild(check);tr.appendChild(cell);
   for(const value of [slot.cargoIndex,slot.id,slot.required,slot.have,slot.missing])tr.appendChild(gpEl('td',show(value)));
   const last=gpEl('td',slot.filled===true?'已装货':slot.reason||'未装货');select(last,slot.actionId,'选择装货候选');tr.appendChild(last);table.appendChild(tr);
  }
  section.appendChild(table);select(section,ship.claimActionId,'选择到港领奖候选');
  const label=gpEl('label','所选货格总时长（秒）'),duration=gpEl('input');duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='';duration.dataset.cargoFillDuration=String(ship.shipIndex);duration._workflowPrepare=true;duration._blocked=!checks.some(check=>!check._blocked);duration.oninput=()=>changed(duration);label.appendChild(duration);section.appendChild(label);s.cargoControls.push(duration);
  const prepare=gpEl('button','准备所选货格有限装货');prepare.type='button';prepare.dataset.cargoFillPrepare=String(ship.shipIndex);prepare._workflowPrepare=true;prepare._blocked=duration._blocked;s.cargoControls.push(prepare);
  prepare.onclick=async()=>{
   if(prepare.disabled||!live()||!wfEditorEditable())return;
   const indices=checks.filter(check=>check.checked).map(check=>Number(check.dataset.cargoFillIndex)).sort((a,b)=>a-b),text=duration.value,seconds=Number(text);
   if(indices.length<1||indices.length>24||!/^[1-9][0-9]*$/.test(text)||!Number.isInteger(seconds)||seconds>86400){$('gp-fleet-hint').textContent='请明确勾选1至24个未装货格及1至86400秒总时长；不会自动选择或补购。';return;}
   const payload={shipIndex:ship.shipIndex,cargoIndices:indices,expectedCargoHash:ship.preparationHash,maxDurationMs:seconds*1000},requestScope=viewGuard.begin('cargo-fill-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision,choice=JSON.stringify(indices);
   const active=()=>gpSafe(requestScope,revision)&&gpGet('fleet')===s&&s.revision===edit&&s.data?.view===view&&Array.from(box.children).includes(section)&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&duration.value===text&&JSON.stringify(checks.filter(check=>check.checked).map(check=>Number(check.dataset.cargoFillIndex)).sort((a,b)=>a-b))===choice;
   s.plan=null;s.selected.clear();gpClear($('gp-fleet-plan-view'));s.pending=true;gpControls('fleet');
   try{const data=await operationMutation('/api/gameplay/fleet/cargo/prepare',payload,requestScope);if(!active())return;editor.accept(gpCargoFillGraph(data,payload,requestScope.account));$('wf-hint').textContent='已载入明确货格的有限装货流程；核对顺序、原材料总预算与时长，每格重新调查、预览和单独授权。';$('gp-fleet-hint').textContent=data.limitation;}
   catch(cause){if(gpSafe(requestScope,revision)&&gpGet('fleet')===s&&s.revision===edit)$('gp-fleet-hint').textContent='货船组合未准备：'+cause.message;}
   finally{if(gpSafe(requestScope,revision)&&gpGet('fleet')===s){s.pending=false;gpControls('fleet');}}
  };
  section.appendChild(prepare);section.appendChild(gpEl('p','只使用本次自有材料。每格沿用原装货合同，拒绝、UNKNOWN、需求或预期状态变化即停止；最后一格可触发出航，不含到港领奖或下一航次。准备不执行、不授权，重启不续跑。'));box.appendChild(section);
 }

 if(shipChoices.filter(({checks})=>checks.some(check=>!check._blocked)).length>1){
  const section=gpEl('div'),source=$('gp-fleet-parameters').value;
  const duration=gpEl('input'),label=gpEl('label','跨船装货总时长（秒）');
  duration.type='number';duration.min='1';duration.max='86400';duration.step='1';duration.value='';
  duration.dataset.cargoFillBatchDuration='true';label.appendChild(duration);section.appendChild(label);
  const prepare=gpEl('button','准备跨船装货');prepare.type='button';prepare.dataset.cargoFillBatchPrepare='true';
  section.appendChild(prepare);box.appendChild(section);
  for(const control of [duration,prepare]){control._workflowPrepare=true;s.cargoControls.push(control);}
  const live=()=>gpSafe(scope,revision)&&gpGet('fleet')===s&&s.data?.view===view
   &&$('gp-fleet-parameters').value===source&&Array.from(box.children).includes(section);
  const selection=()=>shipChoices.flatMap(({ship,checks})=>{
   const cargoIndices=checks.filter(check=>check.checked&&!check._blocked).map(check=>Number(check.dataset.cargoFillIndex)).sort((a,b)=>a-b);
   return cargoIndices.length?[{shipIndex:ship.shipIndex,cargoIndices,expectedCargoHash:ship.preparationHash}]:[];
  });
  duration.oninput=()=>{if(live()&&gpCargoSelectable()&&wfEditorEditable()){gpInvalidate('fleet',false);wfInvalidateSettingPlans();}};
  prepare.onclick=async()=>{
   if(prepare.disabled||!live()||!gpCargoSelectable()||!wfEditorEditable())return;
   const loads=selection(),count=loads.reduce((total,load)=>total+load.cargoIndices.length,0),time=duration.value,seconds=Number(time);
   if(loads.length<2||count>24||!/^[1-9][0-9]*$/.test(time)||!Number.isSafeInteger(seconds)||seconds>86400){
    $('gp-fleet-hint').textContent='请在至少两艘船上勾选货格，总计最多24格，并填写1至86400秒。';return;
   }
   const payload={action:'fill',loads,maxDurationMs:seconds*1000},selected=JSON.stringify(loads),config=s.data.config;
   const requestScope=viewGuard.begin('cargo-fill-prepare'),editor=captureStageRecommendationEditor(),edit=++s.revision;
   const active=()=>gpSafe(requestScope,revision)&&live()&&s.revision===edit&&s.data?.config===config
    &&!s.configDirty&&snapshot?.connected&&!snapshot?.busy&&editor.current()&&duration.value===time&&JSON.stringify(selection())===selected;
   s.plan=null;s.selected.clear();gpClear($('gp-fleet-plan-view'));s.pending=true;gpControls('fleet');
   try{
    const reply=await operationMutation('/api/gameplay/fleet/cargo/prepare',payload,requestScope);
    if(!active())return;
    editor.accept(gpCargoFillGraph(reply,payload,requestScope.account,view));
    $('wf-hint').textContent='已载入跨船装货流程。核对累计材料预算，每格单独授权。';
    $('gp-fleet-hint').textContent=reply.limitation;
   }catch(error){if(active())$('gp-fleet-hint').textContent=error.message;}
   finally{if(gpSafe(requestScope,revision)&&gpGet('fleet')===s){s.pending=false;gpControls('fleet');}}
  };
 }

 const summary=gpEl('table'),heading=gpEl('tr');for(const text of ['待装总需求','需求量','持有','总缺少'])heading.appendChild(gpEl('th',text));summary.appendChild(heading);for(const item of cargo.shortages||[]){const tr=gpEl('tr');for(const value of [item.id,item.required,item.have,item.missing])tr.appendChild(gpEl('td',show(value)));summary.appendChild(tr);}box.appendChild(summary);for(const note of cargo.notes||[])box.appendChild(gpEl('p',note));
}
function gpRender(id,data,scope,freshSurvey=false) {gpTokenFrom(data,scope);if(data.module!==id)throw Error('玩法模块不匹配');const s=gpGet(id),oldKey=gpJson(s.data?.view);const samePlan=s.plan&&data.lastPlan?.batchId===s.plan.batchId&&data.lastPlan?.planHash===s.plan.planHash;if(oldKey!==gpJson(data.view)&&!samePlan){s.selected.clear();if(s.data){s.plan=null;gpClear($('gp-'+id+'-plan-view'));}}s.data=data;s.scope=viewGuard.capture();gpConfigSource(id);if(freshSurvey){s.dirty=false;s.targetDraftPending=false;}$('gp-'+id+'-status').textContent=gpJson({status:data.status,functions:data.functions});if(!s.configDirty){$('gp-'+id+'-config').value=gpJson(data.config||{enabled:false});gpConfigFields(id,data.config||{enabled:false});}else{try{gpConfigFields(id,gpParse('gp-'+id+'-config'));}catch(error){gpClear($('gp-'+id+'-config-fields'));s.numberConfigControls=[];s.listConfigControls=[];}}const facts=gpClear($('gp-'+id+'-facts'));gpDetails(facts,'查询事实、统计与缺口',data.view);gpRenderCandidates(id);if(id==='formation'&&!s.dirty)gpRenderFormation(data.view);if(id==='alliance')gpRenderAlliance(data.view);if(id==='treasure')gpRenderTreasure(data.view);if(id==='naval'){gpRenderNaval(data.view);gpRenderNavalRules();}if(id==='fleet'){gpRenderFleetOperations(data.view);gpRenderFleetFormation(data.view);gpRenderCargo(data.view);}if(id==='city'||id==='compass-wheel'||id==='trade'||id==='material-packs'||id==='heroes'||id==='production'||id==='farm'||id==='equipment-forge'||id==='formation-unlock'||id==='equipment-growth'||id==='badge-growth'||id==='antique-growth'||id==='museum'||id==='pirate-sweep'||id==='task-rewards'||id==='mail'||id==='afk-level-rewards'||id==='free-gold'||id==='free-recruit'||id==='trial-challenge'||id==='pet')gpRenderDomain(id,data.view);gpControls(id); }
async function refreshGameplay(id) {if(!GP_MODULES.includes(id)||!current||gpGet(id).pending)return;const scope=viewGuard.begin('gameplay-'+id),revision=gpRevision,s=gpGet(id);s.pending=true;gpControls(id);try{const data=await call('/api/gameplay?module='+encodeURIComponent(id),undefined,scope);if(!gpSafe(scope,revision))return;gpRender(id,data,scope);$('gp-'+id+'-hint').textContent='已读取本账号缓存；没有发起游戏写操作。';}catch(error){if(gpSafe(scope,revision)){s.data=null;s.plan=null;gpClear($('gp-'+id+'-candidates'));$('gp-'+id+'-hint').textContent='读取失败：'+error.message;}}finally{if(gpSafe(scope,revision)){s.pending=false;gpRenderCandidates(id);gpControls(id);}} }
async function gpMutate(id,route,payload,render) {const s=gpGet(id);if(!gpReady(id)||s.pending)return;const scope=viewGuard.begin('gameplay-'+id),revision=gpRevision,editRevision=s.revision;s.pending=true;gpControls(id);try{const data=await operationMutation(route,payload,scope);if(!gpSafe(scope,revision)||s.revision!==editRevision)return;if(data.accountId!=null&&data.accountId!==scope.account)throw Error('操作账号不匹配');if(render)render(data,scope);return data;}catch(error){if(gpSafe(scope,revision))$('gp-'+id+'-hint').textContent='操作停止：'+error.message;}finally{if(gpSafe(scope,revision)){s.pending=false;gpRenderCandidates(id);gpControls(id);}} }
async function gpPreview(id) {const s=gpGet(id);if($('gp-'+id+'-plan').disabled)return;const parameters=gpParse('gp-'+id+'-parameters'),selected=[...s.selected];await gpMutate(id,'/api/operations/plan',{module:id,mode:'Manual',selections:selected,parameters:parameters},data=>{const p=data.plan||data;if(p.accountId!==current||p.actions?.length!==selected.length||new Set(p.actions.map(r=>r.actionId)).size!==selected.length||p.actions.some(r=>!selected.includes(r.actionId)))throw Error('具体计划与选择不匹配');s.plan=p;gpRenderPlan($('gp-'+id+'-plan-view'),p);$('gp-'+id+'-hint').textContent='预览已生成，尚未授权。';}); }
async function gpAuthorize(id,plan,kind) {if(!gpPlanLive(plan)||(kind==='workflow'?wfPlan!==plan||wfHasParameterDraft():gpGet(id).plan!==plan||gpGet(id).targetDraftPending||gpGet(id).dirty||gpGet(id).configDirty))return;const scope=viewGuard.begin(kind==='workflow'?'workflow':'gameplay-'+id),revision=gpRevision;const text='账号 '+scope.account+' · 批次 '+plan.batchId+' · '+plan.planHash+'\n'+operationPlanIdentityText(plan)+'\n有效至：'+plan.expiresAt+'\n'+plan.actions.map(r=>(r.label||r.actionType)+' '+gpJson(r.target)+' 成本 '+operationCosts(r.costs)).join('\n')+'\n总资源消耗：'+operationCosts(plan.resourceBudget)+'\n'+operationPlanResourceText(plan)+(gpQuotaText(plan)?'\n额度占用：'+gpQuotaText(plan):'')+(gpFarmHarvestText(plan)?'\n作物批次：'+gpFarmHarvestText(plan):'')+'\n只授权以上具体计划；未知结果立即停止。';if(!window.confirm(text)||!gpSafe(scope,revision))return;viewGuard.assert(scope);plan.consumed=true;const s=kind==='workflow'?null:gpGet(id);if(s){s.pending=true;gpControls(id);}else{wfPending=true;wfControls();}try{const permit=await operationMutation('/api/operations/authorize',{batchId:plan.batchId,planHash:plan.planHash,approvedActionIds:plan.actions.map(r=>r.actionId),resourceBudget:plan.resourceBudget,confirm:true},scope);if(!gpSafe(scope,revision))return;if((kind==='workflow'?wfPlan!==plan:gpGet(id).plan!==plan)||permit.batchId!==plan.batchId||typeof permit.permitId!=='string'||!permit.permitId)throw Error('授权批次不匹配');const result=await operationMutation('/api/operations/execute',{batchId:plan.batchId,permitId:permit.permitId},scope);if(!gpSafe(scope,revision))return;if(s){s.restore=plan.actions[0]?.restoreParameters||s.restore;$('gp-'+id+'-hint').textContent='已提交；结果以复读和执行历史为准。';if(result.status)s.data.status=typeof result.status==='object'?result.status:{finalStatus:result.status};}else{$('wf-hint').textContent='ACTION 已提交，请读取流程与执行历史；成功验证后再继续。';}}catch(error){if(gpSafe(scope,revision))$(kind==='workflow'?'wf-hint':'gp-'+id+'-hint').textContent='执行停止：'+error.message+'；请查看历史，勿重复发送。';}finally{if(gpSafe(scope,revision)){if(s){s.pending=false;gpRenderCandidates(id);gpControls(id);}else{wfPending=false;wfControls();}}} }
function gpSetFormation(manual) {if(!gpDomainSelectable('formation'))return;const view=gpGet('formation').data?.view;const rows=[...$('gp-formation-roster').children].filter(e=>e._formation?.check.checked).map(e=>e._formation);const parameters={...(view?.mode==='expedition'?{mode:'expedition',raidId:view.raidId}:{}),presetId:Number($('gp-formation-template').value)};if(!Number.isSafeInteger(parameters.presetId)||parameters.presetId<=0||!rows.length)throw Error('请选择模板和英雄');if(manual){parameters.heroPositions=rows.map(r=>{if(r.x.value===''||r.y.value==='')throw Error('每名英雄需要明确坐标');const x=Number(r.x.value),y=Number(r.y.value);if(!Number.isInteger(x)||!Number.isInteger(y))throw Error('坐标必须为整数');return {heroId:r.check.value,pos:{x:x,y:y}};});}else parameters.heroIds=rows.map(r=>r.check.value);$('gp-formation-parameters').value=gpJson(parameters);gpInvalidate('formation',true);$('gp-formation-hint').textContent='参数已更新；请只读探测重新验证解锁、英雄归属和站位。';}
function resetGameplay() {gpRevision++;$('wf-unified-cooldown-recruit').value='hero';$('wf-unified-pirate-lower').checked=false;antiqueState={pending:false};gpClear($('antique-summary-view'));$('antique-summary-hint').textContent='';exState={stage:null,rows:[]};gpClear($('ex-selected'));gpClear($('ex-detail'));$('ex-hint').textContent='';nfState={entries:[],scope:null,pending:false,loaded:false};gpClear($('nf-selected'));gpClear($('nf-detail'));$('nf-name').value='';$('nf-hint').textContent='';nfControls();gpToken=null;for(const id of GP_MODULES){delete gpState[id];for(const suffix of ['hint','status','facts','candidates','plan-view','config-fields','config-source'])$('gp-'+id+'-'+suffix).textContent='';$('gp-'+id+'-parameters').value='{}';$('gp-'+id+'-config').value='{}';gpControls(id);}gpClear($('gp-naval-rules'));gpClear($('gp-naval-observations'));gpClear($('gp-treasure-targets'));gpClear($('gp-fleet-operations'));gpClear($('gp-fleet-formations'));gpClear($('gp-fleet-cargo'));$('gp-formation-mode').value='mainline';$('gp-formation-raid').value='';gpClear($('gp-formation-template'));gpClear($('gp-formation-roster'));if($('gp-formation-layout'))gpClear($('gp-formation-layout'));wfData=null;wfPlan=null;wfPending=false;$('wf-unified-intent').value='';$('wf-unified-blocked').textContent='';wfUnifiedResetForm();wfCandidateCache=new Map();wfResetSettings();wfGraph={version:1,id:'workflow-1',name:'新工作流',nodes:[{id:'start',type:'START'},{id:'stop',type:'STOP'}],edges:[{from:'start',to:'stop'}]};gpClear($('wf-saved'));gpClear($('wf-status'));wfHistoryReset();gpClear($('wf-result'));gpClear($('wf-plan'));$('wf-hint').textContent='';wfRenderGraph();wfControls();}
function gameplayActivate(tab) {if(GP_MODULES.includes(tab))return refreshGameplay(tab);if(tab==='workflow')return refreshWorkflows();}
for(const id of GP_MODULES){$('gp-'+id+'-config-default').onclick=()=>gpRestoreDefaults(id);$('gp-'+id+'-load').onclick=()=>refreshGameplay(id);$('gp-'+id+'-parameters').oninput=()=>{gpInvalidate(id,true);gpRenderCandidates(id);};$('gp-'+id+'-config').oninput=()=>{gpGet(id).configDirty=true;gpInvalidate(id,false);try{gpConfigFields(id,gpParse('gp-'+id+'-config'));}catch(error){$('gp-'+id+'-hint').textContent=error.message;}if(id==='naval')gpRenderNavalRules();};$('gp-'+id+'-history').onclick=()=>{const button=document.querySelector('#tabs button[data-tab="operations-history"]');if(button)button.click();};$('gp-'+id+'-config-save').onclick=async()=>{try{const config=gpParse('gp-'+id+'-config');await gpMutate(id,'/api/gameplay/config',{module:id,config:config},(data,scope)=>{gpGet(id).configDirty=false;gpInvalidate(id,true);if(data.module===id&&data.view)gpRender(id,data,scope);else{$('gp-'+id+'-config').value=gpJson(data.config||config);gpGet(id).data.config=data.config||config;gpGet(id).data.source=data.source;gpConfigSource(id);gpConfigFields(id,data.config||config);}if(id==='naval')gpRenderNavalRules();$('gp-'+id+'-hint').textContent='本账号配置已保存，请重新探测。';});}catch(error){$('gp-'+id+'-hint').textContent=error.message;}};$('gp-'+id+'-survey').onclick=async()=>{try{const parameters=gpParse('gp-'+id+'-parameters');gpInvalidate(id,true);await gpMutate(id,'/api/gameplay/survey',{module:id,parameters:parameters},(data,scope)=>{gpRender(id,data,scope,true);$('gp-'+id+'-hint').textContent='探测完成，选择具体动作后预览。';});}catch(error){$('gp-'+id+'-hint').textContent=error.message;}};$('gp-'+id+'-plan').onclick=()=>gpPreview(id).catch(error=>$('gp-'+id+'-hint').textContent=error.message);$('gp-'+id+'-authorize').onclick=()=>gpAuthorize(id,gpGet(id).plan);$('gp-'+id+'-stop').onclick=()=>gpMutate(id,'/api/operations/stop',{},data=>{gpGet(id).data.status=data.status||data;$('gp-'+id+'-hint').textContent='已停止后续操作；未决保护继续保留。';});}
function gpFormationModeChanged(){gpInvalidate('formation',true);gpClear($('gp-formation-roster'));gpClear($('gp-formation-layout'));gpRenderCandidates('formation');}
$('gp-formation-mode').onchange=gpFormationModeChanged;$('gp-formation-raid').oninput=gpFormationModeChanged;
$('gp-formation-mode-prepare').onclick=()=>{const s=gpGet('formation');if(!gpReady('formation')||s.pending||s.data?.status?.blocked||s.data?.status?.running||snapshot?.busy)return;try{const mode=$('gp-formation-mode').value,raidId=Number($('gp-formation-raid').value);if(!['mainline','expedition'].includes(mode)||mode==='expedition'&&(!Number.isInteger(raidId)||raidId<=0||raidId>2147483647))throw Error('远征需要明确正整数 raidId');$('gp-formation-parameters').value=gpJson(mode==='expedition'?{mode:mode,raidId:raidId}:{});s.restore=null;gpFormationModeChanged();$('gp-formation-hint').textContent='模式参数已更新；请只读探测，再选择英雄和模板。';}catch(error){$('gp-formation-hint').textContent=error.message;}};
$('gp-formation-career').onclick=()=>{try{gpSetFormation(false);}catch(error){$('gp-formation-hint').textContent=error.message;}};$('gp-formation-manual').onclick=()=>{try{gpSetFormation(true);}catch(error){$('gp-formation-hint').textContent=error.message;}};$('gp-formation-restore').onclick=()=>{const s=gpGet('formation');if(!s.restore)return;$('gp-formation-parameters').value=gpJson(s.restore);gpInvalidate('formation',true);$('gp-formation-hint').textContent='已加载旧阵容；重新探测、预览和授权后才恢复。';};

function nfReady(){return Boolean(current&&nfState.loaded&&nfState.scope&&viewGuard.current(nfState.scope));}
function exKey(row){return row.playerId+'|'+row.worldId+'|'+row.replayId;}
function exSelected(){return exState.rows.find(row=>exKey(row)===$('ex-selected').value);}
function exControls(){const s=gpGet('formation'),ready=gpReady('formation')&&snapshot?.connected&&!s.pending&&!nfState.pending&&!snapshot?.busy&&!s.data?.status?.blocked&&!s.data?.status?.running;$('ex-survey').disabled=!ready;$('ex-selected').disabled=!ready||!exState.rows.length;$('ex-prepare').disabled=!ready||!exSelected()||s.data?.config?.enabled!==true;}
function exRender(){const select=gpClear($('ex-selected'));for(const row of exState.rows){const option=gpEl('option',(row.nickname||row.playerId)+' · 世界 '+row.worldId+' · 战报 '+row.replayId+' · 战力 '+(row.power??'未知'));option.value=exKey(row);select.appendChild(option);}select.value=exState.rows[0]?exKey(exState.rows[0]):'';$('ex-detail').textContent=gpJson(exSelected()??null);exControls();}
async function exSurvey(){exControls();if($('ex-survey').disabled)return;exState={stage:null,rows:[]};exRender();gpInvalidate('formation',true);await gpMutate('formation','/api/formations/extreme/survey',{},data=>{if(!Number.isSafeInteger(data.stage)||data.stage<=0||!Array.isArray(data.rows))throw Error('极限来源列表不可靠');exState={stage:data.stage,rows:data.rows};exRender();$('ex-hint').textContent='已读取当前关卡 '+data.stage+' 的服务器极限记录；选择具体来源后核对。';});}
async function exPrepare(){exControls();if($('ex-prepare').disabled)return;const row=exSelected(),payload={stage:exState.stage,playerId:row.playerId,worldId:row.worldId,replayId:row.replayId};gpInvalidate('formation',true);await gpMutate('formation','/api/formations/extreme/prepare',payload,data=>{if(data.mode!=='MAINLINE'||data.requiresFreshSurvey!==true||data.requiresFreshPlan!==true||data.requiresAuthorization!==true||!data.parameters)throw Error('极限来源准备合同不可靠');$('gp-formation-parameters').value=gpJson(data.parameters);gpInvalidate('formation',true);gpRenderCandidates('formation');$('ex-detail').textContent=gpJson(data);$('ex-hint').textContent='站位参数已加载并保留当前宠物；请重新探测、预览并单次授权。复制不保证通关。';});}
$('ex-survey').onclick=exSurvey;$('ex-prepare').onclick=exPrepare;$('ex-selected').onchange=()=>{$('ex-detail').textContent=gpJson(exSelected()??null);exControls();};
function nfSelected(){return nfState.entries.find(row=>row.id===$('nf-selected').value);}
function nfControls(){const ready=nfReady(),entry=nfSelected(),locked=nfState.pending||gpGet('formation').pending,gameLocked=Boolean(snapshot?.busy||gpGet('formation').data?.status?.blocked||gpGet('formation').data?.status?.running);$('nf-load').disabled=!current||locked;$('nf-selected').disabled=!ready||locked;$('nf-name').disabled=locked;for(const key of ['rename','delete'])$('nf-'+key).disabled=!ready||!entry||locked;for(const key of ['save','overwrite','prepare'])$('nf-'+key).disabled=!ready||locked||!snapshot?.connected||gameLocked||(key!=='save'&&!entry);}
function nfRender(){const select=$('nf-selected'),old=select.value;gpClear(select);for(const entry of nfState.entries){const option=gpEl('option',entry.name+' · v'+entry.revision);option.value=entry.id;select.appendChild(option);}select.value=nfState.entries.some(row=>row.id===old)?old:nfState.entries[0]?.id||'';$('nf-detail').textContent=gpJson(nfSelected()??null);nfControls();}
async function nfLoad(){if(!current||nfState.pending)return;const scope=viewGuard.begin('named-formation'),revision=gpRevision;nfState.pending=true;nfControls();try{const value=await call('/api/formations/named',undefined,scope);if(!gpSafe(scope,revision))return;gpTokenFrom(value,scope);if(!Array.isArray(value.entries)||value.entries.some(row=>row.accountId!==current||typeof row.id!=='string'||!Number.isSafeInteger(row.revision)||row.revision<1))throw Error('队伍列表或账号不可靠');nfState.entries=value.entries;nfState.scope=viewGuard.capture();nfState.loaded=true;nfRender();$('nf-hint').textContent='本地存档已读取；未连接或写入游戏。';}catch(error){if(gpSafe(scope,revision)){nfState.loaded=false;nfState.entries=[];nfRender();$('nf-hint').textContent='读取停止：'+error.message;}}finally{if(gpSafe(scope,revision)){nfState.pending=false;nfControls();}}}
async function nfMutate(kind){nfControls();if($('nf-'+kind).disabled)return;if(kind==='prepare')gpInvalidate('formation',true);const formationRevision=gpGet('formation').revision;const entry=nfSelected(),scope=viewGuard.begin('named-formation'),revision=gpRevision,payload=kind==='save'?{name:$('nf-name').value}:{id:entry.id,expectedRevision:entry.revision,...(kind==='rename'?{name:$('nf-name').value}:{})};nfState.pending=true;nfControls();gpControls('formation');try{const result=await operationMutation('/api/formations/named/'+kind,payload,scope);if(!gpSafe(scope,revision))return;if(result.accountId!==scope.account)throw Error('队伍操作账号不匹配');if(kind==='prepare'){if(gpGet('formation').revision!==formationRevision)throw Error('阵容草稿已变化，旧应用预览已丢弃');if(result.requiresFreshSurvey!==true||result.requiresFreshPlan!==true||result.requiresAuthorization!==true||result.mode!=='MAINLINE'||!result.parameters)throw Error('队伍应用合同不可靠');$('gp-formation-parameters').value=gpJson(result.parameters);gpInvalidate('formation',true);gpRenderCandidates('formation');$('nf-hint').textContent='应用参数已加载；请重新只读探测、预览具体计划并单次授权。';}else if(kind==='delete'){if(result.deleted!==true||result.id!==payload.id)throw Error('删除版本不匹配');nfState.entries=nfState.entries.filter(row=>row.id!==result.id);nfRender();$('nf-hint').textContent='本地所选版本已删除。';}else{if(typeof result.id!=='string'||!Number.isSafeInteger(result.revision)||result.revision<1)throw Error('存档版本不可靠');nfState.entries=[...nfState.entries.filter(row=>row.id!==result.id),result];nfRender();$('nf-selected').value=result.id;$('nf-detail').textContent=gpJson(result);$('nf-hint').textContent='本地队伍版本已保存；没有游戏写入或执行授权。';}}catch(error){if(gpSafe(scope,revision)){nfState.loaded=false;nfState.entries=[];nfRender();$('nf-hint').textContent='操作停止，请重新读取队伍：'+error.message;}}finally{if(gpSafe(scope,revision)){nfState.pending=false;nfControls();gpControls('formation');}}}
$('nf-load').onclick=nfLoad;$('nf-selected').onchange=()=>{$('nf-detail').textContent=gpJson(nfSelected()??null);nfControls();};for(const key of ['save','rename','overwrite','delete','prepare'])$('nf-'+key).onclick=()=>nfMutate(key);

let wfNodeDrag=null,wfEdgeDrag=null;
let wfEdit=0,wfList=[],wfCandidateCache=new Map(),wfNodeFormControls=[];
const WF_SETTING_NAMES={stage:'主线',orders:'居民订单',city:'城市建设',production:'工厂生产'};
const wfSettings=Object.create(null);
const WF_MODULES=[...new Set([...GP_MODULES,'stage','orders','city'])];
const wfTypes=['START','SURVEY','CONDITION','RULE','ACTION','WAIT','VERIFY','BRANCH','STOP'];

const WF_TASK_REWARD_KINDS=WF_PARAMETER_SCHEMAS['task-rewards'].properties.kind.enum;
const WF_UNIFIED_KINDS = {
 'free-recruit-cooldown':'具名免费招募冷却等待',
 'trade-leg-clock':'具名贸易航段时钟等待',
 'factory-queue-clock':'具名生产队列时钟等待',
 'orderDaily-observe':'每日订单进度只读观察',
 'main-observe':'主线任务只读观察','branch-observe':'支线任务只读观察','achievement-observe':'成就只读观察','daily-observe':'每日任务只读观察',
 main:'主线任务领奖',branch:'支线任务领奖',achievement:'成就领奖',daily:'每日任务领奖','mail-claim':'单封邮件附件','mail-read':'单封空附件邮件已读','mail-enumeration':'只读邮箱有界枚举','afk-level-reward':'挂机单档等级奖励','afk-income':'普通挂机本段收益',
 'weekly-battle-pass-task':'战令任务只读观察',
 'daily-activity':'日活跃单档领奖','daily-gift':'固定免费赠礼','weekly-lottery-gift':'周转盘免费礼包1000','weekly-unique-lottery-gift':'周翻牌免费礼包1000','weekly-chip-gift':'周芯片免费礼包1000','weekly-chip-task':'周芯片当前轮次任务领奖',...Object.fromEntries(Object.entries(GP_OPEN_RANK_LABELS).map(([kind,label])=>[kind,label+'明确score档位领奖'])),
 city:'明确建筑操作',production:'明确工厂生产／收取／道具加速',heroes:'明确英雄／技能／专武成长',
 'equipment-growth':'明确装备成长／空槽穿戴','badge-growth':'明确徽章成长／空槽穿戴','antique-growth':'明确藏品成长／兑换',
 pet:'明确海兽投喂／服役升级','formation-unlock':'明确自有图纸解锁','equipment-forge':'明确装备厂制造／收取',
 'material-packs':'明确自有材料包兑换',fleet:'明确舰队／货船操作',alliance:'明确联盟操作',trade:'明确海商王操作',
 treasure:'明确世界宝藏派舰',farm:'明确单田种植／收取',formation:'明确阵容保存／切换',
 'compass-wheel':'明确罗盘抽取或累计领奖',
 'resident-order':'明确居民订单提交（原候选actionId）','cargo-fill':'港口货轮单格装货（任务进度另查）','free-recruit':'明确英雄／古董招募（免费或自有券）','alliance-order':'联盟城市募兵订单',museum:'博物馆探险出发',stage:'有限主线战斗（不自动领奖）','free-gold':'普通免费点金','trial-challenge':'所选试炼首通（1英雄经验/2强化石/3海兽经验）','pirate-sweep':'单目标海面扫荡'
};
const wfUnifiedEditable = () => Boolean(current && !wfPending && !wfData?.status?.running);
function wfUnifiedNumber(value,min,max,label) {
 if(!/^[0-9]+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)<min||Number(value)>max)throw Error(label+'必须是 '+min+'–'+max+' 的明确整数');
 return Number(value);
}
function wfUnifiedData() {
 const source=$('wf-unified-intent').value.trim();
 const data=source?JSON.parse(source):{entry:$('wf-unified-entry').value||'loop',tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}};
 if(!data||typeof data!=='object'||Array.isArray(data)||!['tasks','dailies','loop'].includes(data.entry))throw Error('声明需要有效的 Tasks、Dailies 或 Loop 入口');
 for(const phase of ['tasks','dailies','world']){if(data[phase]===undefined)data[phase]=[];if(!Array.isArray(data[phase])||data[phase].length>48)throw Error('业务步骤必须是最多48项的列表');}
 if(!data.budget||typeof data.budget!=='object'||Array.isArray(data.budget))throw Error('需要明确累计预算');
 for(const kind of ['resources','quotas','uids']){if(data.budget[kind]===undefined)data.budget[kind]=[];if(!Array.isArray(data.budget[kind]))throw Error('预算必须是列表');}
 return data;
}
function wfUnifiedKinds() {
 const select=$('wf-unified-kind'),previous=select.value,phase=$('wf-unified-phase').value;
 const choices=phase==='tasks'?['main','branch','achievement','daily','main-observe','branch-observe','achievement-observe','daily-observe','orderDaily-observe','resident-order','daily-activity','daily-gift','weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift','weekly-chip-task',...Object.keys(GP_OPEN_RANK_LABELS),'weekly-battle-pass-task','mail-claim','mail-read','mail-enumeration','afk-level-reward','afk-income','free-recruit','stage','free-gold','trial-challenge','cargo-fill','alliance-order','museum','pirate-sweep','free-recruit-cooldown','trade-leg-clock','factory-queue-clock']:['daily','daily-observe','daily-activity','daily-gift','weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift','weekly-chip-task',...Object.keys(GP_OPEN_RANK_LABELS),'weekly-battle-pass-task','free-recruit','stage','afk-income','free-gold','trial-challenge','pirate-sweep','cargo-fill','alliance-order','museum','free-recruit-cooldown','trade-leg-clock','factory-queue-clock'];
 gpClear(select);for(const kind of choices){const option=gpEl('option',WF_UNIFIED_KINDS[kind]);option.value=kind;select.appendChild(option);}
 select.value=choices.includes(previous)?previous:choices[0];wfUnifiedControls();
}
function wfUnifiedControls() {
 const locked=!wfUnifiedEditable();
 for(const box of ['steps','budget-rows'])for(const card of $('wf-unified-'+box).children)for(const control of card.children)if(control.tagName.toLowerCase()==='button')control.disabled=locked||control.dataset.unifiedBoundary==='true';
 for(const id of ['entry','rounds','every','limits','phase','kind','add','budget-kind','budget-id','budget-add','form-load'])$('wf-unified-'+id).disabled=locked;
 const kind=$('wf-unified-kind').value,needsId=['resident-order','free-recruit-cooldown','trade-leg-clock','factory-queue-clock','main-observe','branch-observe','achievement-observe','daily-observe','mail-enumeration','afk-level-reward','afk-income','mail-claim','mail-read','cargo-fill','alliance-order','main','branch','achievement','daily','daily-activity','pirate-sweep','weekly-chip-task',...Object.keys(GP_OPEN_RANK_LABELS),'weekly-battle-pass-task','stage','museum','trial-challenge'].includes(kind);
 $('wf-unified-target').disabled=locked||!needsId;
 $('wf-unified-target').setAttribute('inputmode',kind==='resident-order'?'text':'numeric');
 $('wf-unified-observe').disabled=locked||kind==='weekly-battle-pass-task'||!WF_TASK_REWARD_KINDS.includes(kind);if(kind==='weekly-battle-pass-task')$('wf-unified-observe').checked=true;
 if(!WF_TASK_REWARD_KINDS.includes(kind))$('wf-unified-observe').checked=false;
 $('wf-unified-recruit-count').disabled=locked||kind!=='free-recruit';
 $('wf-unified-recruit-kind').disabled=locked||kind!=='free-recruit'||$('wf-unified-phase').value!=='tasks';if($('wf-unified-phase').value==='dailies')$('wf-unified-recruit-kind').value='hero';
 $('wf-unified-cooldown-recruit').disabled=locked||kind!=='free-recruit-cooldown';
 for(const field of ['afk-start','afk-finish'])$('wf-unified-'+field).disabled=locked||kind!=='afk-income';
 $('wf-unified-chip-round').disabled=locked||kind!=='weekly-chip-task';
 $('wf-unified-daily-reset').disabled=locked||!['daily','daily-activity'].includes(kind);if(!['daily','daily-activity'].includes(kind))$('wf-unified-daily-reset').value='';
 $('wf-unified-mail-page').disabled=locked||!['mail-claim','mail-read'].includes(kind);
 $('wf-unified-pirate-city').disabled=locked||kind!=='pirate-sweep';$('wf-unified-pirate-lower').disabled=locked||kind!=='pirate-sweep';
 $('wf-unified-cargo-index').disabled=locked||kind!=='cargo-fill';
 for(const field of ['factory-id','factory-index'])$('wf-unified-'+field).disabled=locked||kind!=='factory-queue-clock';
 for(const field of ['trade-city','trade-destination'])$('wf-unified-'+field).disabled=locked||kind!=='trade-leg-clock';
 for(const field of ['museum-heroes','museum-factor'])$('wf-unified-'+field).disabled=locked||kind!=='museum';
 $('wf-unified-target-label').textContent=kind==='resident-order'?'原居民订单SUBMIT候选actionId（含完整摘要）':kind==='orderDaily-observe'?'本账号全部每日订单进度（无需任务 ID）':['free-recruit-cooldown','trade-leg-clock','factory-queue-clock'].includes(kind)?'最多等待毫秒（1–60000）':kind==='mail-enumeration'?'邮箱枚举页数上限（1–100，从0页开始）':kind==='afk-income'?'明确本段挂机等级（起止秒均必填）':kind==='afk-level-reward'?'精确挂机奖励等级（按配置下一档）':['mail-claim','mail-read'].includes(kind)?'精确邮件 ID（正int64字符串）':kind==='cargo-fill'?'精确港口货轮编号（从1开始）':kind==='alliance-order'?'精确联盟城市 ID':kind==='museum'?'精确博物馆探险关卡 ID':kind==='stage'?'本节点最多尝试（1–200，战败停止）':kind==='trial-challenge'?'试炼副本1英雄经验／2强化石／3海兽经验（Tasks必填）':kind==='pirate-sweep'?'精确海盗 UID':Object.hasOwn(GP_OPEN_RANK_LABELS,kind)?GP_OPEN_RANK_LABELS[kind]+'精确score档位值（非行号）':kind==='daily-activity'?'精确日活跃档位 ID':kind==='weekly-chip-gift'?'固定礼包：1000（当前周芯片）':kind==='weekly-unique-lottery-gift'?'固定礼包：1000（当前周翻牌）':kind==='weekly-lottery-gift'?'固定礼包：1000（当前周转盘）':kind==='daily-gift'?'固定礼包：赠礼':'精确任务 ID';
 const uid=$('wf-unified-budget-kind').value==='uids';$('wf-unified-budget-type').disabled=locked||!uid;$('wf-unified-budget-num').disabled=locked||uid;wfUnifiedBoundaryControls();
}

function wfUnifiedBoundaryControls(){
 const source=$('wf-unified-intent').value,graph=wfGraph,policy=gpJson(graph.runPolicy),scope=viewGuard.capture(),revision=gpRevision,edit=wfEdit;
 let data;try{data=source.trim()?JSON.parse(source):{};}catch{}
 const declared=data&&typeof data==='object'&&!Array.isArray(data)&&Object.hasOwn(data,'runPolicy');
 const live=()=>wfUnifiedEditable()&&gpSafe(scope,revision)&&edit===wfEdit&&wfGraph===graph&&gpJson(graph.runPolicy)===policy&&$('wf-unified-intent').value===source;
 $('wf-unified-policy-copy').disabled=!live()||!data||!Object.hasOwn(graph,'runPolicy');$('wf-unified-policy-remove').disabled=!live()||!declared;
 $('wf-unified-policy-summary').textContent=!data?'高级声明 JSON 无效；原内容保留。':declared?'当前声明运行边界：'+gpJson(data.runPolicy)+'；编译时按原Workflow合同校验，不增加授权。':'当前声明未设置可选运行边界；可先在下方当前图表单明确应用，再复制到声明。';
 $('wf-unified-policy-copy').onclick=()=>{if(!live()||!data||!Object.hasOwn(graph,'runPolicy'))return;wfUnifiedEdit(next=>{next.runPolicy=JSON.parse(JSON.stringify(graph.runPolicy));});};
 $('wf-unified-policy-remove').onclick=()=>{if(!live()||!declared)return;wfUnifiedEdit(next=>{delete next.runPolicy;});};
}


function wfUnifiedSurveyControl(id) {
 const button=$('gp-'+id+'-unified-survey'),s=gpGet(id),scope=viewGuard.capture(),revision=gpRevision,edit=s.revision,data=s.data,source=$('gp-'+id+'-parameters').value;
 const live=()=>Boolean(gpSafe(scope,revision)&&gpReady(id)&&gpGet(id)===s&&s.data===data&&s.revision===edit&&$('gp-'+id+'-parameters').value===source&&!s.pending&&!s.targetDraftPending&&!snapshot?.busy&&wfUnifiedEditable());
 button.disabled=!live();
 button.onclick=()=>{
  if(!live())return;
  try {
   const parameters=gpParse('gp-'+id+'-parameters'),text=$('wf-unified-intent').value;
   const intent=text.trim()?wfUnifiedData():{entry:'loop',tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}};
   if(intent.entry!=='loop')throw Error('请先将原声明入口改为 Loop；原步骤已保留。');
   if(intent.world.length>=48)throw Error('其他玩法步骤最多48项，请先明确调整原声明。');
   if(id==='mail'&&parameters.action==='enumerate'&&(!Number.isInteger(parameters.maxPages)||parameters.maxPages<1||parameters.maxPages>100))throw Error('邮箱枚举须明确1至100页的上限');
   intent.world.push({type:'SURVEY',module:id,parameters:JSON.parse(JSON.stringify(parameters))});
   $('wf-unified-intent').value=gpJson(intent);wfUnifiedRender();wfControls();
   $('gp-'+id+'-hint').textContent='已加入 Loop 只读调查声明；本次未发送请求。生成预览时按原Function合同校验参数，不会自动选择、授权或执行动作。';
   $('wf-unified-form-hint').textContent='已加入 '+id+' 的只读SURVEY；原累计预算保持声明值，调查结果不代表写入资格。';
  }catch(error){$('gp-'+id+'-hint').textContent='加入只读调查失败：'+error.message;}
 };
}

function wfUnifiedSyncCandidateControls(id) {
 for(const state of id?[gpState[id]]:Object.values(gpState))for(const button of state?.unifiedControls||[])button.disabled=!button._unifiedLive();
 for(const module of id?[id]:GP_MODULES)wfUnifiedSurveyControl(module);
}
function wfUnifiedCandidateButton(card,id,row,state) {
 const scope=viewGuard.capture(),revision=gpRevision,edit=state.revision,data=state.data;
 const explicit=typeof row.actionId==='string'&&row.actionId.length>0&&row.actionId.length<=1000&&row.parameters&&typeof row.parameters==='object'&&!Array.isArray(row.parameters);
 const button=gpEl('button','加入 Loop 声明');button.type='button';button.dataset.unifiedCandidate=row.actionId;
 const live=()=>Boolean(explicit&&!gpBlocked(row)&&gpSafe(scope,revision)&&gpGet(id)===state&&state.data===data&&state.revision===edit
  &&data?.view?.candidates?.includes(row)&&!state.targetDraftPending&&gpDomainSelectable(id)&&wfUnifiedEditable());
 button._unifiedLive=live;button.disabled=!live();state.unifiedControls.push(button);
 button.onclick=()=>{
  if(!live())return;
  try {
   const source=$('wf-unified-intent').value;
   const intent=source.trim()?wfUnifiedData():{entry:'loop',tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}};
   if(intent.entry!=='loop')throw Error('现有声明为 Tasks 或 Dailies，请先在工作流表单中将入口改为 Loop；原步骤已保留。');
   if(intent.world.length>=48)throw Error('其他玩法步骤最多48项，请先明确调整原声明。');
   intent.world.push({module:id,parameters:JSON.parse(JSON.stringify(row.parameters)),selection:{actionId:row.actionId}});
   $('wf-unified-intent').value=gpJson(intent);wfUnifiedRender();wfControls();
   $('gp-'+id+'-hint').textContent='已加入 Loop 声明。请到工作流页核对步骤和累计预算，再生成预览；本次未探测、授权或执行。';
   $('wf-unified-form-hint').textContent='已加入 '+id+' 的精确候选；原累计预算未增加。生成预览后仍须逐项授权。';
  } catch(error){$('gp-'+id+'-hint').textContent='加入声明失败：'+error.message;}
 };
 card.appendChild(button);
 const legacyTaskKind=id==='fleet'&&row.actionType==='cargoFill'?'cargo-fill':id==='alliance'&&row.actionType==='finishOrder'?'alliance-order':id==='museum'&&row.actionType==='startExplore'?'museum':id==='pirate-sweep'&&row.actionType==='SWEEP'?'pirate-sweep':null;
 const exactTask=!legacyTaskKind&&['city','production','heroes','equipment-growth','badge-growth','antique-growth','pet','formation-unlock','equipment-forge','material-packs','fleet','alliance','trade','treasure','farm','formation'].includes(id);
 const taskKind=exactTask?id:legacyTaskKind;
 const taskKeys={'cargo-fill':['shipIndex','cargoIndex'],'alliance-order':['cityId'],museum:['stageId','heroIds','factor'],'pirate-sweep':['uid','cityId','allowLowerLevel','expectedSweep']};
 const taskParameters=taskKind==='alliance-order'?{...row.parameters,cityId:row.target?.cityId}:row.parameters;
 const requiredKeys={'cargo-fill':['shipIndex','cargoIndex'],'alliance-order':['cityId'],museum:['stageId','heroIds','factor'],'pirate-sweep':['uid','cityId']};
 const completeTask=exactTask&&explicit||taskKind&&explicit&&Object.keys(row.parameters).every(key=>taskKeys[taskKind].includes(key))&&requiredKeys[taskKind].every(key=>Object.hasOwn(taskParameters,key)&&taskParameters[key]!==undefined)
  &&(taskKind!=='alliance-order'||Number.isInteger(taskParameters.cityId)&&taskParameters.cityId>0&&taskParameters.cityId<=2147483647&&(row.parameters.cityId===undefined||row.parameters.cityId===taskParameters.cityId));
 if(completeTask){
  const taskButton=gpEl('button','将此明确业务加入Tasks声明');taskButton.type='button';taskButton.dataset.unifiedTaskCandidate=row.actionId;
  taskButton._unifiedLive=live;taskButton.disabled=!live();state.unifiedControls.push(taskButton);
  taskButton.onclick=()=>{
   if(!live())return;
   try{
    const source=$('wf-unified-intent').value,intent=source.trim()?wfUnifiedData():{entry:'tasks',tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}};
    if(!['tasks','loop'].includes(intent.entry))throw Error('请先明确将入口改为Tasks或Loop；原步骤保留。');
    if(intent.tasks.length>=48)throw Error('Tasks步骤已达48项上限');
    intent.tasks.push({kind:taskKind,parameters:JSON.parse(JSON.stringify(exactTask?row.parameters:taskParameters)),...(exactTask?{actionId:row.actionId}:{})});wfInvalidateSettingPlans();
    $('wf-unified-intent').value=gpJson(intent);wfUnifiedRender();wfControls();
    $('gp-'+id+'-hint').textContent='已将本次明确业务参数加入Tasks草稿；核对原目标、成本与累计预算，每项仍重新调查并单独授权。';
    $('wf-unified-form-hint').textContent='原步骤与累计预算保留；本次仅编辑声明，不证明日常完成或领奖，拒绝或UNKNOWN停止。';
   }catch(error){$('gp-'+id+'-hint').textContent='加入Tasks失败：'+error.message;}
  };card.appendChild(taskButton);
 }
 if(!explicit)card.appendChild(gpEl('p','此候选缺少明确业务参数，不能直接加入 Loop 声明；原玩法入口保持可用。'));
}

function wfUnifiedResetForm() {
 for(const [id,value]of Object.entries({entry:'loop',rounds:'1',every:'0',phase:'tasks',target:'','afk-start':'','afk-finish':'','mail-page':'','cargo-index':'','pirate-city':'','trade-city':'','trade-destination':'','factory-id':'','factory-index':'','chip-round':'','daily-reset':'','museum-heroes':'','museum-factor':'','budget-kind':'resources','budget-id':'','budget-num':'','budget-type':''}))$('wf-unified-'+id).value=value;
 $('wf-unified-observe').checked=false;$('wf-unified-pirate-lower').checked=false;$('wf-unified-recruit-count').value='free';$('wf-unified-recruit-kind').value='hero';$('wf-unified-cooldown-recruit').value='hero';
 gpClear($('wf-unified-steps'));gpClear($('wf-unified-budget-rows'));$('wf-unified-form-hint').textContent='';wfUnifiedKinds();
}
function wfUnifiedEdit(change) {
 if(!wfUnifiedEditable())return;
 try{const data=wfUnifiedData();change(data);$('wf-unified-intent').value=gpJson(data);wfUnifiedRender();$('wf-unified-form-hint').textContent='声明已更新；请生成统一工作流预览。';}
 catch(error){$('wf-unified-form-hint').textContent=error.message;}
}
function wfUnifiedRender() {
 const data=wfUnifiedData(),source=$('wf-unified-intent').value,account=current,revision=gpRevision;
 $('wf-unified-entry').value=data.entry;$('wf-unified-rounds').value=String(data.rounds===undefined?1:data.rounds);$('wf-unified-every').value=String(data.everyMs===undefined?0:data.everyMs);
 if(data.entry!=='loop')$('wf-unified-phase').value=data.entry;wfUnifiedKinds();
 const live=()=>wfUnifiedEditable()&&current===account&&gpRevision===revision&&$('wf-unified-intent').value===source;
 const steps=gpClear($('wf-unified-steps'));
 for(const phase of ['tasks','dailies','world'])data[phase].forEach((row,index)=>{
  const card=gpEl('div'),kind=row?.type==='WAIT'?(row.cooldown?.kind==='FACTORY_QUEUE_CLOCK'?'factory-queue-clock':row.cooldown?.kind==='TRADE_LEG_END'?'trade-leg-clock':'free-recruit-cooldown'):phase==='world'?row?.module:row?.action==='observe'?(row.kind||(phase==='dailies'?'daily':''))+'-observe':row?.kind==='mail'?'mail-'+row?.action:row?.kind||(phase==='dailies'?(row?.action==='claim'?'daily':({1002:'free-recruit',1003:'stage',1004:'afk-income',1006:'free-gold',1008:'cargo-fill',1009:'trial-challenge',1010:'pirate-sweep',1012:'alliance-order',1016:'museum'})[row?.taskId]):'');
  const target=(row?.type==='WAIT'?row?.cooldown?.maxWaitMs:undefined)??row?.actionId??row?.maxPages??row?.level??row?.emailId??row?.packId??row?.tierId??(kind==='pirate-sweep'?row?.parameters?.uid:kind==='museum'?row?.parameters?.stageId:kind==='alliance-order'?row?.parameters?.cityId:kind==='cargo-fill'?row?.parameters?.shipIndex:kind==='trial-challenge'?(row?.parameters?.raidId??1):row?.taskId)??'';
  card.appendChild(gpEl('span',phase+' 第 '+(index+1)+' 项 · '+(WF_UNIFIED_KINDS[kind]||(row?.action==='observe'&&WF_TASK_REWARD_KINDS.includes(row.kind)?WF_UNIFIED_KINDS[row.kind]+'（只读观察）':kind)||'待核对业务')+(target!==''?' · '+target:'')));
  if(row?.actionId&&row?.parameters)card.appendChild(gpEl('p','明确业务参数：'+gpJson(row.parameters)+'。运行时重查同一候选，变化即停止；原累计预算不增加，每项仍须单独授权。'));
  if(kind==='compass-wheel')card.appendChild(gpEl('p',row?.parameters?.action==='claim'?'活动 '+row.parameters.activityId+' · 累计奖 '+row.parameters.expectedClaimedId+' → '+row.parameters.expectedTierId+' · 原积分 '+row.parameters.expectedScore+'。运行时重查原范围与领奖窗口，零支出但仍逐项授权，结算UNKNOWN即停止。':'活动 '+(row?.parameters?.activityId??'未知')+' · '+(row?.parameters?.count??'未知')+' 次。运行时重新核对原候选、券和活动窗口，再单独授权。结算UNKNOWN即停止。'));
  if(kind==='resident-order')card.appendChild(gpEl('p','绑定原订单身份和规则摘要；每项重新调查并单独授权，订单替换或规则变化停止。仅使用初始自有材料累计预算，收益不扩额，拒绝或UNKNOWN停止。每日订单档位领奖仍需独立证据。'));
  if(kind==='stage'){gpDetails(card,'原有限主线配置',row.parameters);card.appendChild(gpEl('p','原StageRunner逐场验证，重新调查并单次授权；战败重试或停止沿原有限配置，UNKNOWN停止且不重放。战斗不证明日常完成，不自动领取任务奖励。'));}
  if(kind==='afk-income'){const p=phase==='tasks'?row:row.parameters;card.appendChild(gpEl('p','明确挂机等级 '+String(p?.level??'UNKNOWN')+' · 区间 '+String(p?.afkStartTime??'UNKNOWN')+' → '+String(p?.afkFinishTime??'UNKNOWN')+'；可信时间重新探测，金额不预估，不自动升级或领取任务奖励，UNKNOWN停止且不重放。'));}
  if(row?.kind==='weekly-chip-task')card.appendChild(gpEl('p','周芯片当前轮次 '+String(row.round??'UNKNOWN')+' · 精确任务 ID '+String(row.taskId??'UNKNOWN')));
  if(kind==='free-recruit'){const antique=row?.parameters?.recruit==='antique';card.appendChild(gpEl('p',(antique?'古董':'英雄')+'招募 · '+(row?.parameters?.payment==='ticket'?'明确自有'+(antique?'藏品券':'抽卡券')+' '+String(row.parameters.count??1)+' 张；原Function重新调查和独立结算，不自动切换免费或补购。':'免费单次；不自动转为用券。')+' 每项重新调查并单次授权，UNKNOWN停止。日常1002仅适用于英雄，招募不证明任务进度或奖励到账。'));}
  if(kind==='trial-challenge')card.appendChild(gpEl('p','原免费单场首通 · 副本 '+String(row?.parameters?.raidId??1)+' · '+(row?.parameters?.stageId?'固定关卡 '+String(row.parameters.stageId):'运行时核对本副本精确下一关')+'；重新调查并逐项授权，仅原typed回执、精确通关进度和完整库存共同确认，不推定日常完成或扩收入预算。'));
  if(kind==='free-gold'){card.appendChild(gpEl('p','原普通免费单次；运行时按服务器resetTime重新核对本次额度、逐项授权并独立验证typed金币和完整库存净入。收入不扩累计预算，UNKNOWN停止；不证明日常1006完成。'));if(row?.parameters?.expectedGold)gpDetails(card,'明确绑定的原点金状态',row.parameters.expectedGold);}
  if(kind==='cargo-fill')card.appendChild(gpEl('p','精确货格编号：'+String(row?.parameters?.cargoIndex??'UNKNOWN')+'；仅装自有材料，不补购。装货不证明日常完成，进度及领奖须另行核实。'));
  if(kind==='pirate-sweep')card.appendChild(gpEl('p','精确城市 ID：'+String(row?.parameters?.cityId??'UNKNOWN')+'；下级目标确认：'+(row?.parameters?.allowLowerLevel===true?'已明确':'未确认')+'。'));
  if(['mail-claim','mail-read'].includes(kind))card.appendChild(gpEl('p','精确来源页：'+String(row.pageNo??'UNKNOWN')+'；重新调查后逐项授权，UNKNOWN停止后续步骤。'));
  if(kind==='orderDaily-observe')card.appendChild(gpEl('p','只读调查本账号订单完成计数、已领奖阈值和等待投影；周期未知，不生成动作、领取奖励或提供免费刷新资格。'));
  if(row?.action==='observe'&&(WF_TASK_REWARD_KINDS.includes(row.kind)||['main-observe','branch-observe','achievement-observe','daily-observe'].includes(kind)))card.appendChild(gpEl('p','原任务Function只读SURVEY；不完成任务、不领取奖励、不生成动作或授权。后续写操作须另行明确声明并重新调查。'));
  if(kind==='factory-queue-clock')card.appendChild(gpEl('p','精确工厂 '+row.cooldown.buildingId+' · 队列 idx '+row.cooldown.index+'；同队列身份和截止独立复读，仅等待时钟，不证明生产完成或到账，不收取、不解除拒绝或UNKNOWN。'));
  if(kind==='trade-leg-clock')card.appendChild(gpEl('p','明确港口 '+row.cooldown.cityId+' → '+row.cooldown.mvToCityId+'；最多等待 '+row.cooldown.maxWaitMs+' 毫秒，同航段独立复读只确认时钟到期，不证明到达或收益，不解除拒绝或UNKNOWN。'));
  if(kind==='free-recruit-cooldown')card.appendChild(gpEl('p',(row.cooldown?.recruit==='antique'?'古董':'英雄')+'招募原WAIT具名冷却等待；明确上限内同目标独立复读，不证明可招募，不解除拒绝或UNKNOWN，重启只读。'));
  if(kind==='mail-enumeration')card.appendChild(gpEl('p','只读SURVEY；按明确页数上限观察邮箱，不自动标已读、领取附件或选择任何邮件。领取需另行指定来源页和邮件ID，重新调查并授权。'));
  if(kind==='museum')gpDetails(card,'明确探险队伍与倍率',row?.parameters);
  if(kind==='stage'&&phase==='dailies')gpDetails(card,'明确主线运行边界',row?.parameters?.config);
  if(phase==='world'&&row?.type!=='WAIT'){card.appendChild(gpEl('p',row?.type==='SURVEY'?'只读SURVEY；运行时按原Function重新调查，不自动选择、授权或执行动作。':'精确候选：'+(typeof row?.selection==='string'?row.selection:row?.selection?.actionId??'未指定精确候选')));gpDetails(card,'明确业务参数',row?.parameters);}
  for(const [label,offset]of [['上移',-1],['下移',1],['移除',0]]){const button=gpEl('button',label);button.type='button';button.dataset.unifiedStep=phase+':'+index;button.dataset.unifiedMove=String(offset);button.dataset.unifiedBoundary=String(offset!==0&&(index+offset<0||index+offset>=data[phase].length));button.disabled=!wfUnifiedEditable()||offset!==0&&(index+offset<0||index+offset>=data[phase].length);button.onclick=()=>{if(!live()||button.disabled)return;wfUnifiedEdit(next=>{if(offset===0)next[phase].splice(index,1);else [next[phase][index],next[phase][index+offset]]=[next[phase][index+offset],next[phase][index]];});};card.appendChild(button);}
  steps.appendChild(card);
 });
 if(!steps.childElementCount)steps.textContent='尚未添加业务步骤。';
 wfRenderBudgetRows('wf-unified',data.budget,live,(kind,index)=>wfUnifiedEdit(next=>next.budget[kind].splice(index,1)),'unifiedBudget');
 wfUnifiedControls();
}
$('wf-unified-intent').oninput=()=>wfUnifiedBoundaryControls();
$('wf-unified-daily-reset').oninput=()=>{if(wfUnifiedEditable())wfInvalidateSettingPlans();};
for(const id of ['recruit-kind','recruit-count'])$('wf-unified-'+id).onchange=()=>{if(wfUnifiedEditable())wfInvalidateSettingPlans();};
$('wf-unified-target').oninput=$('wf-unified-pirate-city').oninput=()=>{$('wf-unified-pirate-lower').checked=false;};$('wf-unified-phase').onchange=()=>{$('wf-unified-pirate-lower').checked=false;wfUnifiedKinds();};$('wf-unified-kind').onchange=()=>{$('wf-unified-pirate-lower').checked=false;wfUnifiedControls();};$('wf-unified-budget-kind').onchange=wfUnifiedControls;
$('wf-unified-form-load').onclick=()=>{if(!wfUnifiedEditable())return;try{wfUnifiedRender();$('wf-unified-form-hint').textContent='已读取声明；尚未探测、授权或执行。';}catch(error){$('wf-unified-form-hint').textContent=error.message;}};
$('wf-unified-limits').onclick=()=>wfUnifiedEdit(data=>{
 const entry=$('wf-unified-entry').value,rounds=wfUnifiedNumber($('wf-unified-rounds').value,1,48,'轮次'),everyMs=wfUnifiedNumber($('wf-unified-every').value,0,60000,'轮间隔');
 if(!['tasks','dailies','loop'].includes(entry))throw Error('入口无效');
 if(entry!=='loop'&&(rounds!==1||everyMs!==0))throw Error('Tasks 和 Dailies 只允许单轮且不设轮间隔');
 if(entry!=='loop'&&['tasks','dailies','world'].some(phase=>phase!==entry&&data[phase].length))throw Error('声明还有其他分组的步骤，请先明确移除这些步骤或使用 Loop');
 data.entry=entry;data.rounds=rounds;data.everyMs=everyMs;
});
$('wf-unified-add').onclick=()=>wfUnifiedEdit(data=>{
 const phase=$('wf-unified-phase').value,kind=$('wf-unified-kind').value;
 if(!['tasks','dailies'].includes(phase)||data.entry!=='loop'&&phase!==data.entry)throw Error('步骤分组与已应用的入口不匹配');
 if(data[phase].length>=48)throw Error('每组最多48项步骤');
 const observations=['main-observe','branch-observe','achievement-observe','daily-observe'],rewards=[...observations,'resident-order','orderDaily-observe','free-recruit-cooldown','trade-leg-clock','factory-queue-clock','mail-enumeration','free-recruit','stage','free-gold','trial-challenge','cargo-fill','alliance-order','museum','pirate-sweep','afk-level-reward','afk-income','mail-claim','mail-read','main','branch','achievement','daily','daily-activity','daily-gift','weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift','weekly-chip-task',...Object.keys(GP_OPEN_RANK_LABELS),'weekly-battle-pass-task'],dailyDrivers={'free-recruit':1002,'stage':1003,'afk-income':1004,'free-gold':1006,'cargo-fill':1008,'trial-challenge':1009,'pirate-sweep':1010,'alliance-order':1012,'museum':1016};let row;
 if(phase==='tasks'&&!rewards.includes(kind)||phase==='dailies'&&!['free-recruit-cooldown','trade-leg-clock','factory-queue-clock','daily-observe','daily','daily-activity','daily-gift','weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift','weekly-chip-task',...Object.keys(GP_OPEN_RANK_LABELS),'weekly-battle-pass-task',...Object.keys(dailyDrivers)].includes(kind))throw Error('该分组不支持所选业务');
 if(kind==='factory-queue-clock'){const buildingId=$('wf-unified-factory-id').value,index=$('wf-unified-factory-index').value,limit=$('wf-unified-target').value;if(!buildingId||buildingId!==buildingId.trim()||buildingId.length>100||!/^(0|[1-9][0-9]*)$/.test(index)||!/^[1-9][0-9]*$/.test(limit))throw Error('须明确工厂buildingId、含0的int32队列idx及等待上限');row={type:'WAIT',cooldown:{kind:'FACTORY_QUEUE_CLOCK',buildingId,index:wfUnifiedNumber(index,0,2147483647,'队列idx'),maxWaitMs:wfUnifiedNumber(limit,1,60000,'队列等待上限')}};}
 else if(kind==='trade-leg-clock'){for(const id of ['target','trade-city','trade-destination'])if(!/^[1-9][0-9]*$/.test($('wf-unified-'+id).value))throw Error('航段港口与等待上限须为明确正整数');const cityId=wfUnifiedNumber($('wf-unified-trade-city').value,1,2147483647,'当前港口'),mvToCityId=wfUnifiedNumber($('wf-unified-trade-destination').value,1,2147483647,'目的地港口');if(cityId===mvToCityId)throw Error('航段起点与目的地须不同');row={type:'WAIT',cooldown:{kind:'TRADE_LEG_END',cityId,mvToCityId,maxWaitMs:wfUnifiedNumber($('wf-unified-target').value,1,60000,'航段等待上限')}};}
 else if(kind==='free-recruit-cooldown'){const value=$('wf-unified-target').value;if(!/^[1-9][0-9]*$/.test(value))throw Error('冷却等待须填写1–60000的明确整数上限');const recruit=$('wf-unified-cooldown-recruit').value;if(!['hero','antique'].includes(recruit))throw Error('请明确英雄或古董招募冷却目标');row={type:'WAIT',cooldown:{kind:'FREE_RECRUIT',maxWaitMs:wfUnifiedNumber(value,1,60000,'冷却等待上限'),...(recruit==='antique'?{recruit}:{})}};}
 else if(kind==='weekly-battle-pass-task')row={kind,taskId:wfUnifiedNumber($('wf-unified-target').value,1,2147483647,'战令任务ID'),action:'observe'};
 else if(kind==='orderDaily-observe')row={kind:'orderDaily',action:'observe'};
 else if(observations.includes(kind)){const taskId=wfUnifiedNumber($('wf-unified-target').value,1,2147483647,'只读任务ID');row=phase==='tasks'?{kind:kind.slice(0,-8),taskId,action:'observe'}:{taskId,action:'observe'};}
 else if(kind==='mail-enumeration')row={kind,maxPages:wfUnifiedNumber($('wf-unified-target').value,1,100,'邮箱枚举页数上限')};
 else if(kind==='afk-income'){
  const level=wfUnifiedNumber($('wf-unified-target').value,1,2147483647,'挂机等级'),afkStartTime=wfUnifiedNumber($('wf-unified-afk-start').value,1,2147483647,'挂机起始秒'),afkFinishTime=wfUnifiedNumber($('wf-unified-afk-finish').value,1,2147483647,'挂机上限秒');if(afkFinishTime<=afkStartTime)throw Error('挂机上限秒必须大于起始秒');
  row=phase==='tasks'?{kind,level,afkStartTime,afkFinishTime}:{taskId:1004,action:'perform',parameters:{action:'income',level,afkStartTime,afkFinishTime}};
 }
 else if(kind==='resident-order'){const actionId=$('wf-unified-target').value;if(!/^orders:SUBMIT:[a-f0-9]{64}$/.test(actionId))throw Error('须填写当前居民订单SUBMIT候选完整actionId');row={kind,actionId};}
 else if(kind==='afk-level-reward')row={kind,level:wfUnifiedNumber($('wf-unified-target').value,1,2147483647,'挂机奖励等级')};
 else if(['mail-claim','mail-read'].includes(kind)){
  const emailId=$('wf-unified-target').value;if(!/^[1-9][0-9]{0,18}$/.test(emailId)||BigInt(emailId)>9223372036854775807n)throw Error('邮件ID须为精确正int64字符串，不接受首尾空格或科学计数');
  row={kind:'mail',pageNo:wfUnifiedNumber($('wf-unified-mail-page').value,0,2147483647,'邮件来源页'),emailId,action:kind==='mail-read'?'read':'claim'};
 }
 else if(Object.hasOwn(GP_OPEN_RANK_LABELS,kind))row={kind,tierId:wfUnifiedNumber($('wf-unified-target').value,1,2147483647,GP_OPEN_RANK_LABELS[kind]+'score档位'),...(phase==='dailies'?{action:'claim'}:{})};
 else if(kind==='weekly-chip-task')row={kind,round:wfUnifiedNumber($('wf-unified-chip-round').value,1,2147483647,'周芯片当前轮次'),taskId:wfUnifiedNumber($('wf-unified-target').value,1,2147483647,'任务ID'),...(phase==='dailies'?{action:'claim'}:{})};
 else if(['weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift'].includes(kind))row={kind,packId:'1000',...(phase==='dailies'?{action:'claim'}:{})};
 else if(kind==='free-gold')row=phase==='tasks'?{kind,parameters:{}}:{taskId:1006,action:'perform'};
 else if(kind==='free-recruit'){
  const value=$('wf-unified-recruit-count').value,recruit=$('wf-unified-recruit-kind').value;
  if(!['free','1','10','50'].includes(value)||!['hero','antique'].includes(recruit)||phase==='dailies'&&recruit!=='hero')throw Error('请明确英雄或古董及免费、1/10/50张自有券；日常1002仅支持英雄');
  const parameters={...(recruit==='antique'?{recruit}:{}),...(value==='free'?{}:{payment:'ticket',...(value==='1'?{}:{count:Number(value)})})};
  row=phase==='tasks'?{kind,parameters}:{taskId:1002,action:'perform',...(Object.keys(parameters).length?{parameters}:{})};
 }
 else if(kind==='cargo-fill'){const parameters={shipIndex:wfUnifiedNumber($('wf-unified-target').value,1,2147483647,'货轮编号'),cargoIndex:wfUnifiedNumber($('wf-unified-cargo-index').value,1,2147483647,'货格编号')};row=phase==='tasks'?{kind,parameters}:{taskId:1008,action:'perform',parameters};}
 else if(kind==='alliance-order'){const parameters={cityId:wfUnifiedNumber($('wf-unified-target').value,1,2147483647,'联盟城市ID')};row=phase==='tasks'?{kind,parameters}:{taskId:1012,action:'perform',parameters};}
 else if(kind==='museum'){
  const heroIds=$('wf-unified-museum-heroes').value.split(/\r?\n/);
  if(!heroIds.length||heroIds.length>100||heroIds.some(id=>!id||id!==id.trim()||id.length>200)||new Set(heroIds).size!==heroIds.length)throw Error('探险英雄需每行一个唯一且无首尾空格的ID，最多100项');
  const parameters={stageId:wfUnifiedNumber($('wf-unified-target').value,1,2147483647,'探险关卡ID'),heroIds,factor:wfUnifiedNumber($('wf-unified-museum-factor').value,1,2147483647,'探险时间倍率')};row=phase==='tasks'?{kind,parameters}:{taskId:1016,action:'perform',parameters};
 }
 else if(kind==='pirate-sweep'){
  for(const id of ['target','pirate-city'])if(!/^[1-9][0-9]*$/.test($('wf-unified-'+id).value))throw Error('海盗UID和城市ID须为正int32明确整数，不接受首尾空格或科学计数');
  const parameters={uid:wfUnifiedNumber($('wf-unified-target').value,1,2147483647,'海盗UID'),cityId:wfUnifiedNumber($('wf-unified-pirate-city').value,1,2147483647,'海盗城市ID'),...($('wf-unified-pirate-lower').checked?{allowLowerLevel:true}:{})};row=phase==='tasks'?{kind,parameters}:{taskId:1010,action:'perform',parameters};$('wf-unified-pirate-lower').checked=false;
 }
 else if(kind==='trial-challenge'){const value=$('wf-unified-target').value;if(!['1','2','3'].includes(value)&&!(phase==='dailies'&&value===''))throw Error('Tasks须明确试炼副本1英雄经验、2强化石或3海兽经验；Dailies留空保留原英雄经验默认');row=phase==='tasks'?{kind,parameters:{raidId:Number(value)}}:{taskId:1009,action:'perform',...(value===''?{}:{parameters:{raidId:Number(value)}})};}
 else if(kind==='stage'){const parameters={config:{enabled:true,retryDelaySeconds:10,maxAttempts:wfUnifiedNumber($('wf-unified-target').value,1,200,'主线最多尝试'),maxStage:null,stopOnDefeat:true}};row=phase==='tasks'?{kind,parameters}:{taskId:1003,action:'perform',parameters};}
 else if(kind==='daily-gift')row={kind,packId:'赠礼',...(phase==='dailies'?{action:'claim'}:{})};
 else if(kind==='daily-activity')row={kind,tierId:wfUnifiedNumber($('wf-unified-target').value,1,2147483647,'档位ID'),...(phase==='dailies'?{action:'claim'}:{})};
 else if(rewards.includes(kind)){const taskId=wfUnifiedNumber($('wf-unified-target').value,1,2147483647,'任务ID');row=phase==='tasks'?{kind,taskId}:{taskId,action:'claim'};}
 else row={taskId:dailyDrivers[kind],action:'perform'};
 if(['daily','daily-activity'].includes(kind)&&$('wf-unified-daily-reset').value!=='')row.expectedResetTime=wfUnifiedNumber($('wf-unified-daily-reset').value,1,2147483647,'原服务器日常重置秒');
 if($('wf-unified-observe').checked&&WF_TASK_REWARD_KINDS.includes(kind))row.action='observe';
 if(['resident-order','free-recruit','stage','trial-challenge','cargo-fill','alliance-order','museum','pirate-sweep'].includes(kind))wfInvalidateSettingPlans();
 data[phase].push(row);
});
function wfBudgetInput(prefix,budget) {
 const kind=$(prefix+'-budget-kind').value,id=$(prefix+'-budget-id').value,type=$(prefix+'-budget-type').value;
 const valid=value=>typeof value==='string'&&value.length>0&&value.length<=WF_BUDGET_LIMITS.idLength&&value===value.trim();
 if(!['resources','quotas','uids'].includes(kind)||!valid(id)||kind==='uids'&&!valid(type))throw Error('预算需要明确且无首尾空格的ID；具体目标还需类型');
 const row=kind==='uids'?{type,id}:{id,num:wfUnifiedNumber($(prefix+'-budget-num').value,1,Number.MAX_SAFE_INTEGER,'预算数量')};
 if(budget[kind].some(prior=>prior?.id===id&&(kind!=='uids'||prior.type===type)))throw Error('该预算目标已存在，请明确移除旧行后再添加');
 return {kind,row};
}
function wfRenderBudgetRows(prefix,budget,editable,remove,dataset) {
 const box=gpClear($(prefix+'-budget-rows'));
 for(const kind of ['resources','quotas','uids'])budget[kind].forEach((row,index)=>{
  const card=gpEl('div');card.appendChild(gpEl('span',({resources:'资源',quotas:'配额',uids:'具体目标'})[kind]+' · '+(kind==='uids'?(row?.type||'?')+' / '+(row?.id||'?'):(row?.id||'?')+' × '+String(row?.num??'未知'))));
  const button=gpEl('button','移除预算');button.type='button';button.dataset[dataset]=kind+':'+index;button.disabled=!editable();button.onclick=()=>{if(editable()&&Array.from(box.children).includes(card))remove(kind,index);};card.appendChild(button);box.appendChild(card);
 });
 if(!box.childElementCount)box.textContent='当前累计预算为空；具体操作仍须满足原预算合同。';
}
$('wf-unified-budget-add').onclick=()=>wfUnifiedEdit(data=>{const {kind,row}=wfBudgetInput('wf-unified',data.budget);data.budget[kind].push(row);});

function wfGraphBudgetRender() {
 const graph=wfGraph,stored=gpJson(graph.budget),declared=Object.hasOwn(graph,'budget');
 if(!wfBudgetDraft||wfBudgetDraft.graph!==graph||wfBudgetDraft.stored!==stored||wfBudgetDraft.declared!==declared||!gpSafe(wfBudgetDraft.scope,wfBudgetDraft.revision)){
  const draft={graph,stored,declared,scope:viewGuard.capture(),revision:gpRevision,enabled:declared,error:null};wfBudgetDraft=draft;
  try {
   const data=declared?JSON.parse(JSON.stringify(graph.budget)):{resources:[],quotas:[],uids:[]};
   if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(key=>!['resources','quotas','uids'].includes(key)))throw Error('原预算结构需通过完整图 JSON 修正；表单不会替换或丢弃原值。');
   for(const kind of ['resources','quotas','uids']){if(!Object.hasOwn(data,kind))data[kind]=[];if(!Array.isArray(data[kind]))throw Error('原预算类别不是列表，请先修正完整图 JSON。');}draft.data=data;
  }catch(error){draft.error=error.message;}
  for(const [id,value]of Object.entries({kind:'resources',id:'',num:'',type:''}))$('wf-budget-'+id).value=value;
  $('wf-budget-hint').textContent=draft.error||'修改是本地图预算草稿；点击应用后才更新图，保存与执行继续由原预算合同验证。';
 }
 const draft=wfBudgetDraft,live=()=>wfEditorEditable()&&wfBudgetDraft===draft&&wfGraph===graph&&gpSafe(draft.scope,draft.revision)&&gpJson(graph.budget)===stored&&Object.hasOwn(graph,'budget')===declared&&!draft.error;
 const changed=()=>{if(!live()||draft.dirty)return;draft.dirty=true;wfChanged();$('wf-budget-hint').textContent='累计预算正在编辑；旧预览和授权已失效。请添加明确条目后应用，或放弃草稿；未应用前暂停保存和开始。';};
 const sync=()=>{
  const locked=!live();$('wf-budget-discard').disabled=locked||!draft.dirty;$('wf-budget-enabled').disabled=locked;$('wf-budget-enabled').checked=draft.enabled;
  for(const id of ['kind','id','add'])$('wf-budget-'+id).disabled=locked||!draft.enabled;
  const uid=$('wf-budget-kind').value==='uids';$('wf-budget-type').disabled=locked||!draft.enabled||!uid;$('wf-budget-num').disabled=locked||!draft.enabled||uid;$('wf-budget-apply').disabled=locked;
  for(const card of $('wf-budget-rows').children)for(const control of card.children)if(control.tagName.toLowerCase()==='button')control.disabled=locked||!draft.enabled;
 };
 const rows=()=>{if(draft.data)wfRenderBudgetRows('wf',draft.data,()=>live()&&draft.enabled,(kind,index)=>{draft.data[kind].splice(index,1);changed();rows();sync();},'workflowBudget');else $('wf-budget-rows').textContent=draft.error;};
 $('wf-budget-enabled').onchange=()=>{if(!live())return;draft.enabled=$('wf-budget-enabled').checked;changed();sync();};
 $('wf-budget-kind').onchange=()=>{if(!live())return;changed();sync();};
 for(const key of ['id','num','type'])$('wf-budget-'+key).oninput=()=>{if(!$('wf-budget-'+key).disabled&&live())changed();};
 $('wf-budget-add').onclick=()=>{if(!live()||!draft.enabled)return;try{const {kind,row}=wfBudgetInput('wf',draft.data);draft.data[kind].push(row);for(const key of ['id','num','type'])$('wf-budget-'+key).value='';changed();rows();sync();$('wf-budget-hint').textContent='预算草稿已更新；尚未应用、保存或执行。';}catch(error){$('wf-budget-hint').textContent=error.message;}};
 $('wf-budget-apply').onclick=()=>{
  if(!live())return;
  if(!draft.enabled&&graph.runPolicy!==undefined){$('wf-budget-hint').textContent='请先明确移除运行边界，再移除累计预算。';return;}
  if(draft.enabled&&['id','num','type'].some(key=>$('wf-budget-'+key).value!=='')){$('wf-budget-hint').textContent='有未添加的预算条目；请先添加明确条目或清空输入，保留现有图预算。';return;}
  if(draft.enabled)graph.budget=JSON.parse(JSON.stringify(draft.data));else delete graph.budget;
  draft.dirty=false;wfChanged();wfRenderGraph();$('wf-budget-hint').textContent='当前图预算已更新；须保存并重新生成具体计划和授权，不会增加正在运行的额度。';
 };
 $('wf-budget-discard').onclick=()=>{if(!live()||!draft.dirty)return;wfBudgetDraft=null;wfChanged();wfRenderGraph();$('wf-budget-hint').textContent='已放弃未应用预算草稿；原图额度保持，旧预览和授权未恢复。';};
 rows();wfNodeFormControls.push(sync);sync();
}

const wfTaskProgressKind=kind=>['MAIN_TASK_PROGRESS','BRANCH_TASK_PROGRESS','ACHIEVEMENT_TASK_PROGRESS'].includes(kind);
const wfExactTaskProgress=value=>typeof value==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(value)&&BigInt(value)<(1n<<63n);
function wfEventRuleValid(rule){return Boolean(rule&&typeof rule==='object'&&!Array.isArray(rule)&&(rule.kind==='RESOURCE_AMOUNT_CHANGED'?Object.keys(rule).length===3&&Object.values(WF_RESOURCE_NAMES).includes(rule.resource)&&wfExactTaskProgress(rule.amount):wfTaskProgressKind(rule.kind)?Object.keys(rule).length===3&&Number.isInteger(rule.taskId)&&rule.taskId>=1&&rule.taskId<=2147483647&&wfExactTaskProgress(rule.progress):rule.kind==='DAILY_TASK_PROGRESS'?Object.keys(rule).length===3&&Number.isInteger(rule.taskId)&&rule.taskId>=1&&rule.taskId<=2147483647&&Number.isInteger(rule.progress)&&rule.progress>=0&&rule.progress<=2147483647:rule.kind==='DAILY_TASK_RESET'?Object.keys(rule).length===1:Object.keys(rule).length===2&&['VIP_LEVEL_CHANGED','PLAYER_LEVEL_CHANGED'].includes(rule.kind)&&Number.isInteger(rule.level)&&rule.level>=0&&rule.level<=2147483647));}
function wfEventText(policy){return policy?.eventTrigger?'业务事件：'+(policy.eventTrigger.kind==='RESOURCE_AMOUNT_CHANGED'?policy.eventTrigger.resource+' 余额发生变化且达到 '+policy.eventTrigger.amount+'；首次观察不触发，不证明收入或可支配预算':wfTaskProgressKind(policy.eventTrigger.kind)?(policy.eventTrigger.kind==='MAIN_TASK_PROGRESS'?'主线':policy.eventTrigger.kind==='ACHIEVEMENT_TASK_PROGRESS'?'成就':'支线')+'任务 '+policy.eventTrigger.taskId+' 的新明确进度达到 '+policy.eventTrigger.progress+'；不证明完成或领奖资格':policy.eventTrigger.kind==='DAILY_TASK_PROGRESS'?'任务 '+policy.eventTrigger.taskId+' 的新明确进度达到 '+policy.eventTrigger.progress+'；进度不证明领取资格，每日重置停止旧监听':policy.eventTrigger.kind==='DAILY_TASK_RESET'?'收到新的每日任务重置推送；dailyResetTime是服务端原标记，不推断时区或日界':(policy.eventTrigger.kind==='PLAYER_LEVEL_CHANGED'?'角色等级':'VIP等级')+'变为明确值 '+policy.eventTrigger.level)+'；只消费本次连接起始游标之后的首次匹配变化。推送只启动新调查，不证明资格、奖励或写入成功；重启不恢复监听或权限。':'';}
function wfEventAuthorization(status){const offer=status?.authorizationOffer,trigger=status?.eventTrigger,cursor=offer?.eventCursor;return (status?.status??status?.state)==='WAITING'&&trigger?.state==='WAITING'&&wfEventRuleValid(offer?.graph?.runPolicy?.eventTrigger)&&cursor&&Object.keys(cursor).length===4&&typeof cursor.streamId==='string'&&/^[a-f0-9-]{36}$/.test(cursor.streamId)&&Number.isSafeInteger(cursor.cursor)&&cursor.cursor>=0&&['streamId','cursor','playerId','worldId'].every(key=>cursor[key]===trigger.baseline?.[key])&&['playerId','worldId'].every(key=>typeof cursor[key]==='string'&&cursor[key].length>0&&cursor[key]===String(offer.executionContext?.[key]))&&!status.plan;}
function wfScheduleValid(schedule){
 if(!schedule||typeof schedule!=='object'||Array.isArray(schedule)||schedule.timeZone!=='Asia/Shanghai'||schedule.missedPolicy!=='SKIP')return false;
 if(schedule.kind==='ONCE')return Object.keys(schedule).length===4&&typeof schedule.at==='string'&&Number.isFinite(Date.parse(schedule.at))&&new Date(schedule.at).toISOString()===schedule.at;
 if(!['DAILY','WEEKLY'].includes(schedule.kind)||Object.keys(schedule).some(key=>!['kind','localTime','timeZone','missedPolicy',...(schedule.kind==='WEEKLY'?['weekDay']:[])].includes(key))||typeof schedule.localTime!=='string'||!/^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9][.][0-9]{3}$/.test(schedule.localTime))return false;
 return schedule.kind==='DAILY'||Number.isSafeInteger(schedule.weekDay)&&schedule.weekDay>=1&&schedule.weekDay<=7;
}
function wfScheduleText(policy,scheduledAt){const schedule=policy?.schedule;if(!schedule)return '';const rule=schedule.kind==='ONCE'?'一次时间触发 '+schedule.at:(schedule.kind==='DAILY'?'每日':'每周（周一1至周日7，星期 '+schedule.weekDay+'）')+' '+schedule.localTime+'；本次具体触发 '+(scheduledAt??'尚未启用，须在原期限内确定');return rule+' · 时区 '+schedule.timeZone+' · 错过 '+schedule.missedPolicy+'（跳过不补跑）；等待计入总期限，到点重新调查；下一窗口不自动续权。';}
function wfScheduledAuthorization(status){const offer=status?.authorizationOffer,schedule=offer?.graph?.runPolicy?.schedule,at=schedule?.kind==='ONCE'?schedule.at:offer?.scheduledAt;return (status?.status??status?.state)==='WAITING'&&status.trigger?.state==='WAITING'&&wfScheduleValid(schedule)&&typeof at==='string'&&Number.isFinite(Date.parse(at))&&Date.parse(at)>Date.now()&&(schedule.kind==='ONCE'||status.trigger.scheduledAt===at)&&!status.plan;}
const wfRunAuthorizationAttempts=new Set();
function wfRunAttemptKey(status){return JSON.stringify([current,status?.runId]);}
function wfEventTaskChoices(kind){
 const taskKind=({MAIN_TASK_PROGRESS:'main',BRANCH_TASK_PROGRESS:'branch',ACHIEVEMENT_TASK_PROGRESS:'achievement',DAILY_TASK_PROGRESS:'daily'})[kind];if(!taskKind)return [];
 const result=[];for(const node of wfGraph.nodes){if(node.module!=='task-rewards'||!['SURVEY','ACTION'].includes(node.type))continue;const cached=wfCandidateCache.get(node.id);if(!cached||cached.signature!==wfCandidateSignature(node))continue;for(const id of gpTaskTargetIds(cached.domainView,taskKind,node.parameters)||[])result.push({node,cached,id,label:node.id+' / '+taskKind+' / '+id});}return result;
}
function wfRunPolicyRender(){
 const graph=wfGraph,stored=gpJson(graph.runPolicy),declared=Object.hasOwn(graph,'runPolicy');
 if(!wfPolicyDraft||wfPolicyDraft.graph!==graph||wfPolicyDraft.stored!==stored||wfPolicyDraft.declared!==declared||!gpSafe(wfPolicyDraft.scope,wfPolicyDraft.revision)){
  const draft={graph,stored,declared,scope:viewGuard.capture(),revision:gpRevision,enabled:declared,error:null};wfPolicyDraft=draft;
  const policy=graph.runPolicy;
  if(declared&&(!policy||typeof policy!=='object'||Array.isArray(policy)||Object.keys(policy).some(key=>!['maxDurationMs','maxActions','modules','maxRounds','roundIntervalMs','schedule','eventTrigger'].includes(key))||!Number.isSafeInteger(policy.maxDurationMs)||policy.maxDurationMs<1||policy.maxDurationMs>WF_GRAPH_LIMITS.runDurationMs||!Number.isSafeInteger(policy.maxActions)||policy.maxActions<0||policy.maxActions>WF_GRAPH_LIMITS.actionPlans||!Array.isArray(policy.modules)||policy.modules.length>WF_GRAPH_LIMITS.nodes||policy.modules.some(id=>!WF_MODULES.includes(id))||new Set(policy.modules).size!==policy.modules.length||policy.maxRounds!==undefined&&(!Number.isSafeInteger(policy.maxRounds)||policy.maxRounds<1||policy.maxRounds>WF_GRAPH_LIMITS.rounds)||policy.roundIntervalMs!==undefined&&(policy.maxRounds===undefined||!Number.isSafeInteger(policy.roundIntervalMs)||policy.roundIntervalMs<0||policy.roundIntervalMs>WF_GRAPH_LIMITS.waitMs)||policy.schedule!==undefined&&!wfScheduleValid(policy.schedule)||policy.eventTrigger!==undefined&&(!wfEventRuleValid(policy.eventTrigger)||policy.schedule!==undefined)))draft.error='原运行边界结构需通过完整图 JSON 修正；表单保留原值。';
  draft.duration=declared&&!draft.error?String(policy.maxDurationMs):'';draft.actions=declared&&!draft.error?String(policy.maxActions):'';draft.modules=declared&&!draft.error?policy.modules.join('\n'):'';draft.rounds=declared&&!draft.error&&policy.maxRounds!==undefined?String(policy.maxRounds):'';draft.interval=declared&&!draft.error&&policy.roundIntervalMs!==undefined?String(policy.roundIntervalMs):'';
  draft.scheduled=declared&&!draft.error&&policy.schedule!==undefined;draft.kind=draft.scheduled?policy.schedule.kind:'ONCE';draft.at=draft.scheduled&&draft.kind==='ONCE'?new Date(Date.parse(policy.schedule.at)+8*3600000).toISOString().slice(0,-1):'';draft.localTime=draft.scheduled&&draft.kind!=='ONCE'?policy.schedule.localTime:'';draft.weekDay=draft.scheduled&&draft.kind==='WEEKLY'?String(policy.schedule.weekDay):'';
  draft.eventEnabled=declared&&!draft.error&&policy.eventTrigger!==undefined;draft.eventLevel=draft.eventEnabled&&policy.eventTrigger.kind!=='DAILY_TASK_RESET'?String(policy.eventTrigger.kind==='RESOURCE_AMOUNT_CHANGED'?policy.eventTrigger.amount:(policy.eventTrigger.kind==='DAILY_TASK_PROGRESS'||wfTaskProgressKind(policy.eventTrigger.kind))?policy.eventTrigger.progress:policy.eventTrigger.level):'';draft.eventTask=draft.eventEnabled&&(policy.eventTrigger.kind==='DAILY_TASK_PROGRESS'||wfTaskProgressKind(policy.eventTrigger.kind))?String(policy.eventTrigger.taskId):'';draft.eventKind=draft.eventEnabled?policy.eventTrigger.kind:'VIP_LEVEL_CHANGED';draft.eventResource=draft.eventEnabled&&policy.eventTrigger.kind==='RESOURCE_AMOUNT_CHANGED'?policy.eventTrigger.resource:Object.values(WF_RESOURCE_NAMES)[0];
  $('wf-policy-hint').textContent=draft.error||'本地草稿需明确应用；动作上限按计划次数累计，不代表实际派发或成功次数。';
 }
 const draft=wfPolicyDraft,live=()=>wfEditorEditable()&&wfPolicyDraft===draft&&wfGraph===graph&&gpSafe(draft.scope,draft.revision)&&gpJson(graph.runPolicy)===stored&&Object.hasOwn(graph,'runPolicy')===declared&&!draft.error;
 const sync=()=>{const locked=!live(),choice=gpClear($('wf-policy-event-task-choice')),targets=wfEventTaskChoices(draft.eventKind);let option=gpEl('option',targets.length?'请选择同类已观察任务ID':'本图尚无同类调查任务；可明确填写ID');option.value='';choice.appendChild(option);for(const [i,target]of targets.entries()){option=gpEl('option',target.label);option.value=String(i);choice.appendChild(option);}choice.value='';choice.disabled=locked||!draft.enabled||!draft.eventEnabled||!targets.length;$('wf-policy-discard').disabled=locked||!draft.dirty;$('wf-policy-event-resource').value=draft.eventResource;$('wf-policy-event-resource').disabled=locked||!draft.enabled||!draft.eventEnabled||draft.eventKind!=='RESOURCE_AMOUNT_CHANGED';$('wf-policy-enabled').checked=draft.enabled;$('wf-policy-enabled').disabled=locked;$('wf-policy-apply').disabled=locked;for(const [id,key]of [['duration','duration'],['actions','actions'],['modules','modules'],['rounds','rounds'],['interval','interval'],['at','at'],['kind','kind'],['local-time','localTime'],['week-day','weekDay']]){$('wf-policy-'+id).value=draft[key];$('wf-policy-'+id).disabled=locked||!draft.enabled||['at','kind','local-time','week-day'].includes(id)&&!draft.scheduled||id==='at'&&draft.kind!=='ONCE'||id==='local-time'&&draft.kind==='ONCE'||id==='week-day'&&draft.kind!=='WEEKLY';}$('wf-policy-scheduled').checked=draft.scheduled;$('wf-policy-scheduled').disabled=locked||!draft.enabled;$('wf-policy-event-enabled').checked=draft.eventEnabled;$('wf-policy-event-enabled').disabled=locked||!draft.enabled;$('wf-policy-event-kind').value=draft.eventKind;$('wf-policy-event-kind').disabled=locked||!draft.enabled||!draft.eventEnabled;$('wf-policy-event-level').value=draft.eventLevel;$('wf-policy-event-level').disabled=locked||!draft.enabled||!draft.eventEnabled||draft.eventKind==='DAILY_TASK_RESET';$('wf-policy-event-task').value=draft.eventTask;$('wf-policy-event-task').disabled=locked||!draft.enabled||!draft.eventEnabled||draft.eventKind!=='DAILY_TASK_PROGRESS'&&!wfTaskProgressKind(draft.eventKind);};
 $('wf-policy-enabled').onchange=()=>{if(!live())return;draft.enabled=$('wf-policy-enabled').checked;sync();};
 $('wf-policy-event-enabled').onchange=()=>{if(!live()||!draft.enabled)return;draft.eventEnabled=$('wf-policy-event-enabled').checked;sync();};$('wf-policy-event-kind').onchange=()=>{if(!live()||!draft.enabled||!draft.eventEnabled)return;draft.eventKind=$('wf-policy-event-kind').value;draft.eventTask='';draft.eventLevel='';sync();};$('wf-policy-event-level').oninput=()=>{if(!live()||!draft.enabled||!draft.eventEnabled)return;draft.eventLevel=$('wf-policy-event-level').value;};
 $('wf-policy-event-resource').onchange=()=>{if(!live()||!draft.enabled||!draft.eventEnabled||draft.eventKind!=='RESOURCE_AMOUNT_CHANGED')return;draft.eventResource=$('wf-policy-event-resource').value;};
 $('wf-policy-event-task').oninput=()=>{if(!live()||!draft.enabled||!draft.eventEnabled||draft.eventKind!=='DAILY_TASK_PROGRESS'&&!wfTaskProgressKind(draft.eventKind))return;draft.eventTask=$('wf-policy-event-task').value;};
 $('wf-policy-scheduled').onchange=()=>{if(!live()||!draft.enabled)return;draft.scheduled=$('wf-policy-scheduled').checked;sync();};
 $('wf-policy-kind').onchange=()=>{if(!live()||!draft.enabled||!draft.scheduled)return;draft.kind=$('wf-policy-kind').value;sync();};
 for(const [id,key]of [['local-time','localTime'],['week-day','weekDay']])$('wf-policy-'+id).oninput=()=>{if(!live()||!draft.enabled||!draft.scheduled)return;draft[key]=$('wf-policy-'+id).value;};
 for(const key of ['duration','actions','modules','rounds','interval','at'])$('wf-policy-'+key).oninput=()=>{if(!live()||!draft.enabled)return;draft[key]=$('wf-policy-'+key).value;};
 $('wf-policy-apply').onclick=()=>{
  if(!live())return;
  try{
   if(draft.enabled){
    if(!Object.hasOwn(graph,'budget'))throw Error('请先为当前图明确声明并应用累计预算。');
    const integer=(value,min,max)=>{if(!/^[0-9]+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)<min||Number(value)>max)throw Error('请填写范围内的明确整数；不接受空值或隐式默认值。');return Number(value);};
    const maxDurationMs=integer(draft.duration,1,WF_GRAPH_LIMITS.runDurationMs),maxActions=integer(draft.actions,0,WF_GRAPH_LIMITS.actionPlans),modules=draft.modules===''?[]:draft.modules.split('\n');
    if(modules.length>WF_GRAPH_LIMITS.nodes||new Set(modules).size!==modules.length||modules.some(id=>!WF_MODULES.includes(id))||graph.nodes.some(node=>node.module!==undefined&&!modules.includes(node.module)))throw Error('玩法范围须为每行一个已注册精确 ID，不能重复，并包含当前全部业务节点。');
    const next={maxDurationMs,maxActions,modules};if(draft.rounds!=='')next.maxRounds=integer(draft.rounds,1,WF_GRAPH_LIMITS.rounds);if(draft.interval!==''){if(next.maxRounds===undefined)throw Error('轮间隔必须同时明确最多轮次。');next.roundIntervalMs=integer(draft.interval,0,WF_GRAPH_LIMITS.waitMs);}
    if(draft.scheduled){if(draft.kind!=='ONCE'){const schedule={kind:draft.kind,localTime:draft.localTime,timeZone:'Asia/Shanghai',missedPolicy:'SKIP'};if(draft.kind==='WEEKLY')schedule.weekDay=integer(draft.weekDay,1,7);if(!wfScheduleValid(schedule))throw Error('请填写明确的日周规则与完整上海时刻，不推断游戏日界。');next.schedule=schedule;}else{if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}$/.test(draft.at))throw Error('请填写完整上海时间，精确到毫秒。');const at=Date.parse(draft.at+'+08:00');if(!Number.isFinite(at)||new Date(at+8*3600000).toISOString().slice(0,-1)!==draft.at)throw Error('上海日期或时间无效，不自动修正日期。');next.schedule={kind:'ONCE',at:new Date(at).toISOString(),timeZone:'Asia/Shanghai',missedPolicy:'SKIP'};}}if(draft.eventEnabled){if(draft.scheduled)throw Error('本次运行须明确选择时间或业务事件触发，不能隐式组合。');next.eventTrigger=draft.eventKind==='RESOURCE_AMOUNT_CHANGED'?{kind:draft.eventKind,resource:draft.eventResource,amount:draft.eventLevel}:wfTaskProgressKind(draft.eventKind)?{kind:draft.eventKind,taskId:integer(draft.eventTask,1,2147483647),progress:draft.eventLevel}:draft.eventKind==='DAILY_TASK_PROGRESS'?{kind:draft.eventKind,taskId:integer(draft.eventTask,1,2147483647),progress:integer(draft.eventLevel,0,2147483647)}:draft.eventKind==='DAILY_TASK_RESET'?{kind:draft.eventKind}:{kind:draft.eventKind,level:integer(draft.eventLevel,0,2147483647)};if(!wfEventRuleValid(next.eventTrigger))throw Error('请选择明确支持的业务事件来源。');}graph.runPolicy=next;
   }else delete graph.runPolicy;
   draft.dirty=false;wfChanged();wfRenderGraph();$('wf-policy-hint').textContent='运行边界已应用到当前图；每批仍需具体授权，到限停止，UNKNOWN 不自动重放。';
  }catch(error){$('wf-policy-hint').textContent=error.message;}
 };
 const changed=()=>{if(!live()||draft.dirty)return;draft.dirty=true;wfChanged();$('wf-policy-hint').textContent='运行边界或事件目标正在编辑；旧预览和授权已失效。请应用或明确放弃草稿后保存、模拟和开始。';};
 $('wf-policy-event-task-choice').onchange=()=>{const choice=$('wf-policy-event-task-choice');if(choice.disabled||!live()||choice.value==='')return;const target=wfEventTaskChoices(draft.eventKind)[Number(choice.value)];if(!target||wfCandidateCache.get(target.node.id)!==target.cached||!graph.nodes.includes(target.node))return;draft.eventTask=String(target.id);changed();sync();};
 for(const id of ['enabled','duration','actions','modules','rounds','interval','at','kind','local-time','week-day','scheduled','event-enabled','event-kind','event-level','event-resource','event-task']){const control=$('wf-policy-'+id);for(const event of ['oninput','onchange']){const previous=control[event];if(typeof previous!=='function')continue;control[event]=()=>{if(control.disabled||!live())return;previous();changed();};}}
 $('wf-policy-discard').onclick=()=>{if(!live()||!draft.dirty)return;wfPolicyDraft=null;wfChanged();wfRenderGraph();$('wf-policy-hint').textContent='已放弃未应用运行边界草稿，原图保持；旧预览和授权未恢复。';};
 wfNodeFormControls.push(sync);sync();
}

function wfHasParameterDraft(){return [wfPolicyDraft,wfBudgetDraft].some(draft=>draft?.dirty&&draft.graph===wfGraph&&gpSafe(draft.scope,draft.revision))||Array.from($('wf-nodes').children||[]).some(card=>card.dataset?.workflowParameterDraft==='true'||card.dataset?.workflowConditionDraft==='true'||card.dataset?.workflowWaitDraft==='true');}
function wfControls(){if(!wfEditorEditable()){wfNodeDrag=null;wfEdgeDrag=null;}for(const sync of wfNodeFormControls)sync();wfUnifiedControls();wfUnifiedSyncCandidateControls();$('wf-unified-prepare').disabled=!current||!gameplayCsrfToken()||wfPending||wfData?.status?.running===true;const ready=Boolean(wfData?.accountId===current&&gameplayCsrfToken());for(const id of ['save','simulate'])$('wf-'+id).disabled=!ready||wfPending||wfHasParameterDraft();const workflowStatus=wfData?.status??{},ownWorkflowBusy=Boolean(workflowStatus.runId&&snapshot?.busy==='workflow:'+workflowStatus.runId);$('wf-start').disabled=!ready||wfPending||wfHasParameterDraft()||!snapshot?.connected||Boolean(snapshot?.busy)||workflowStatus.running===true;$('wf-resume').disabled=!ready||wfPending||!snapshot?.connected||Boolean(snapshot?.busy&&!ownWorkflowBusy)||(workflowStatus.status??workflowStatus.state)!=='AWAITING_AUTHORIZATION';$('wf-stop').disabled=!ready||wfPending;$('wf-authorize').disabled=wfPending||!snapshot?.connected||!gpPlanLive(wfPlan)||(workflowStatus.status??workflowStatus.state)!=='AWAITING_AUTHORIZATION'||Boolean(workflowStatus.runAuthorization);wfRunAuthorizationControls();$('wf-load').disabled=wfPending||!current;for(const id of ['add','add-edge','json-apply','open','id','name','json'])$('wf-'+id).disabled=!wfEditorEditable();wfSettingsControls();wfHistoryControls();}
function wfRunAuthorizationControls(){
 const data=wfData,status=data?.status,offer=status?.authorizationOffer,plan=wfPlan,scope=viewGuard.capture(),revision=gpRevision,box=$('wf-run-scope');
 const live=()=>Boolean(data&&data===wfData&&data.accountId===current&&gpSafe(scope,revision)&&!wfHasParameterDraft()&&!wfPending&&snapshot?.connected&&gameplayCsrfToken()&&!wfRunAuthorizationAttempts.has(wfRunAttemptKey(status))&&!status.runAuthorization&&offer?.accountId===current&&offer.runId===status.runId&&offer.graph?.runPolicy&&offer.graph.budget&&wfPlan===plan&&(wfScheduledAuthorization(status)||wfEventAuthorization(status)||(status?.status??status?.state)==='AWAITING_AUTHORIZATION'&&gpPlanLive(plan)));
 $('wf-authorize-run').disabled=!live();$('wf-authorize-run').onclick=()=>{if(live())return wfAuthorizeRun(data,plan,scope,revision);};
 if(box._workflowScope===status)return;box._workflowScope=status;gpClear(box);
 if(!offer){box.textContent='当前没有可明确授权的有限运行范围；原逐批模式可继续使用。';return;}
 box.appendChild(gpEl('p','账号 '+offer.accountId+' · 角色 '+offer.executionContext.playerId+' · 世界 '+offer.executionContext.worldId+' · 图 '+offer.workflowId));
 box.appendChild(gpEl('p','本次范围：总时长 '+offer.graph.runPolicy.maxDurationMs+' 毫秒 · 累计动作计划最多 '+offer.graph.runPolicy.maxActions+' 次'+(offer.graph.runPolicy.maxRounds!==undefined?' · 最多 '+offer.graph.runPolicy.maxRounds+' 轮 · 轮间隔 '+(offer.graph.runPolicy.roundIntervalMs??0)+' 毫秒':'')+' · 到期 '+offer.expiresAt+' · 允许玩法 '+offer.graph.runPolicy.modules.join('、')));
 if(offer.graph.runPolicy.schedule)box.appendChild(gpEl('p',wfScheduleText(offer.graph.runPolicy,offer.scheduledAt)));
 if(offer.graph.runPolicy.eventTrigger){box.appendChild(gpEl('p',wfEventText(offer.graph.runPolicy)));gpDetails(box,'本次连接业务事件起始游标',offer.eventCursor);}
 gpDetails(box,'累计预算与精确目标上限',offer.graph.budget);gpDetails(box,'完整节点策略、条件与等待',offer.graph);gpDetails(box,'本次业务配置与版本',offer.dependencies);
 box.appendChild(gpEl('p',status.runAuthorization?'本次有限运行授权已于 '+status.runAuthorization.approvedAt+' 记录；仅覆盖当前运行，重启不能续用。':'尚未授予运行权限。确认后将自动执行此图策略范围内的新鲜具体计划；UNKNOWN 停止，不自动重放。停止按钮可撤销后续执行，已派发请求仍须核验。'));
}
async function wfAuthorizeRun(data,plan,scope,revision){
 if(wfHasParameterDraft())return;
 const offer=data.status.authorizationOffer;
 if(!window.confirm('确认本账号 '+offer.accountId+' 的本次有限运行范围？\n角色 '+offer.executionContext.playerId+'，世界 '+offer.executionContext.worldId+'；图 '+offer.workflowId+'。\n累计动作计划最多 '+offer.graph.runPolicy.maxActions+' 次'+(offer.graph.runPolicy.maxRounds!==undefined?'；最多 '+offer.graph.runPolicy.maxRounds+' 轮，轮间隔 '+(offer.graph.runPolicy.roundIntervalMs??0)+' 毫秒':'')+'，到期 '+offer.expiresAt+'。'+(offer.graph.runPolicy.schedule?'\n'+wfScheduleText(offer.graph.runPolicy,offer.scheduledAt):'')+(offer.graph.runPolicy.eventTrigger?'\n'+wfEventText(offer.graph.runPolicy)+'\n起始游标 '+gpJson(offer.eventCursor):'')+'\n预算与完整策略见运行范围面板。每笔使用原许可和独立核验；UNKNOWN停止，重启不续用。')||!gpSafe(scope,revision)||wfData!==data||wfPlan!==plan||!(wfScheduledAuthorization(data.status)||wfEventAuthorization(data.status)||gpPlanLive(plan))||wfPending||wfRunAuthorizationAttempts.has(wfRunAttemptKey(data.status)))return;
 const scheduled=wfScheduledAuthorization(data.status)||wfEventAuthorization(data.status),body={offer,batchId:scheduled?null:plan.batchId,planHash:scheduled?null:plan.planHash,confirm:true};wfPending=true;wfRunAuthorizationAttempts.add(wfRunAttemptKey(data.status));if(plan)plan.consumed=true;wfControls();
 try{const result=await operationMutation('/api/workflows/authorize-run',body,scope);if(!gpSafe(scope,revision)||wfData!==data)return;if(result.accountId!==current)throw Error('运行授权账号不匹配');wfRender(result,scope);$('wf-hint').textContent='已提交本次有限运行授权；请读取状态与历史，停止按钮撤销后续执行。';}
 catch(error){if(gpSafe(scope,revision))$('wf-hint').textContent='运行授权停止：'+error.message+'；请只读检查状态与历史，勿重复发送。';}
 finally{if(gpSafe(scope,revision)){wfPending=false;wfControls();}}
}
function wfHistoryControls() {
  $('wf-history-selected').disabled = !current || !wfHistoryRows.length;
  $('wf-history-read').disabled = !current || wfHistoryPending || !wfHistoryRows.some(row => row.runId === $('wf-history-selected').value);
}
function wfHistoryChanged() {
  wfHistoryRevision++; wfHistoryPending = false; wfHistoryReference = null;
  gpClear($('wf-history-detail')); $('wf-history-hint').textContent = '';
  wfHistoryControls();
}
function wfHistoryReset() {
  wfHistoryRows = []; gpClear($('wf-history-selected')); $('wf-history-selected').value = '';
  wfHistoryChanged();
}
function wfHistoryList(rows) {
  const select = $('wf-history-selected'), previous = select.value;
  wfHistoryRows = rows.filter(row => row?.accountId === current && typeof row.runId === 'string' && row.runId.length > 0);
  gpClear(select);
  for (const row of wfHistoryRows) {
    const option = gpEl('option', row.runId + ' · ' + row.status); option.value = row.runId; select.appendChild(option);
  }
  select.value = wfHistoryRows.some(row => row.runId === previous) ? previous : wfHistoryRows[0]?.runId || '';
  if (select.value !== previous) wfHistoryChanged();
  wfHistoryControls();
}
const wfOriginalHistory = WORKFLOW_REASON_VIEW;
function wfHistoryRender(data) {
  const box = gpClear($('wf-history-detail'));
  box.appendChild(gpEl('p', '运行 ' + data.workflowRunId + ' · 流程 ' + data.workflowDefinitionId + ' · ' + data.status + (data.recovered ? ' · 已恢复的只读记录' : '')));
  if(data.currentNode)box.appendChild(gpEl('p','原运行位置：'+data.currentNode+'；位置记录不证明该节点完成或业务成功。'));
  if(data.reason)box.appendChild(gpEl('p','运行说明：'+data.reason));
  const original = wfOriginalHistory(data);
  if (!original) box.appendChild(gpEl('p', '原始工作流原因与身份摘要不可用。'));
  else {
    const ctx = original.executionContext, known = value => value === null || value === undefined ? '未知' : String(value);
    box.appendChild(gpEl('p', '原始记录状态：' + known(original.originalStatus) + ' · 角色 ' + known(ctx?.playerId) + ' · 世界 ' + known(ctx?.worldId) + ' · 代次 ' + known(ctx?.generation) + '；仅原运行归属，不能恢复执行。'));
    box.appendChild(gpEl('p', '原始运行原因：' + (original.reason.coverage === 'RECORDED' ? original.reason.text : original.reason.coverage === 'RECOVERY_ONLY' ? '未知（仅有恢复提示）' : '未知（未记录）')));
    for (const row of original.events) box.appendChild(gpEl('p', '原节点记录 ' + row.nodeId + ' · ' + row.type + ' · ' + row.result + (row.round === null ? '' : ' · 第 ' + row.round + ' 轮') + (row.blockedReasons?.length ? ' · 原因 ' + row.blockedReasons.join('、') : '') + '；原始观察，不证明动作已派发或结算。'));
  }
  if (data.preparation) {
    box.appendChild(gpEl('p', '原声明入口：' + data.preparation.entry + '；编译未纳入 ' + data.preparation.blocked.length + ' 项。此信息仅供审计，不证明游戏资格或已执行。'));
    if(data.preparation.source)gpDetails(box,'原准备来源引用（仅审计，不证明当前资格）',data.preparation.source);
    for (const row of data.preparation.blocked) box.appendChild(gpEl('p', row.phase + ' 第 ' + (row.index + 1) + ' 项 · 任务 ' + row.taskId + ' · 未执行：' + row.reason));
  }
  if(data.runAuthorization){box.appendChild(gpEl('p','原有限运行授权：'+data.runAuthorization.approvedAt+' · 图摘要 '+data.runAuthorization.scope.graphHash+'；仅供审计，重启不可恢复授权。'));gpDetails(box,'原运行授权范围',data.runAuthorization.scope);}
  if(data.runPolicy)box.appendChild(gpEl('p','本次运行边界：总时长 '+data.runPolicy.maxDurationMs+' 毫秒 · 动作计划 '+data.actionPlans+' / '+data.runPolicy.maxActions+' · 允许玩法 '+(data.runPolicy.modules.join('、')||'无业务节点')+' · 到期 '+data.expiresAt+'；此记录只供审计，不能恢复授权。'));
  if(data.runPolicy?.eventTrigger){box.appendChild(gpEl('p',wfEventText(data.runPolicy)));gpDetails(box,'原业务事件身份、起始游标与消费证据',data.eventTrigger??null);}
  if(data.runPolicy?.schedule){box.appendChild(gpEl('p',wfScheduleText(data.runPolicy,data.trigger?.scheduledAt)));gpDetails(box,'原触发状态与时刻',data.trigger??null);}
  if(data.runPolicy?.maxRounds!==undefined)box.appendChild(gpEl('p','本次有限重复：已完成 '+data.completedRounds+' / '+data.runPolicy.maxRounds+' 轮 · 当前第 '+data.round+' 轮 · 轮间隔 '+(data.runPolicy.roundIntervalMs??0)+' 毫秒；全部轮次共享原累计限额。'));
  box.appendChild(gpEl('p', '未关联的操作记录：' + data.unlinkedOperationCount + '。仅显示已持久化且归属一致的动作。'));
  for (const row of data.waits || []) {if(row.cooldownWait){box.appendChild(gpEl('p','节点 '+row.nodeId+' · '+row.result+(row.cooldownWait.kind==='FACTORY_QUEUE_CLOCK'?' · 具名生产队列时钟等待 ':row.cooldownWait.kind==='TRADE_LEG_END'?' · 具名贸易航段时钟等待 ':(row.cooldownWait.recruit==='antique'?' · 具名古董免费招募冷却等待 ':' · 具名英雄免费招募冷却等待 '))+row.durationMs+' 毫秒；原观察及同目标独立复读，不证明当前可招募、到达或收益，不解除拒绝或UNKNOWN，重启不恢复等待。'));if(row.cooldownWait.kind==='FACTORY_QUEUE_CLOCK')box.appendChild(gpEl('p','仅同一队列条目的截止时钟；目标消失或变化为UNKNOWN，不证明生产完成、收取或到账。'));gpDetails(box,'原冷却来源与观察区间',row.cooldownWait);continue;}box.appendChild(gpEl('p', '节点 ' + row.nodeId + (row.round!==undefined?' · 第 '+row.round+' 轮':'')+' · ' + (row.result === 'WAIT_STARTED' ? '等待已开始' : row.result === 'WAITED' ? '等待已结束' : row.result==='ROUND_WAIT_STARTED'?'轮间等待已开始':row.result==='ROUND_WAITED'?'轮间等待已结束':row.result) + ' · 时长 ' + (row.durationMs === undefined ? '未知' : row.durationMs + ' 毫秒') + ' · ' + (row.timestamp || '时间未知') + '；本次运行的间隔记录，不代表游戏冷却或可重放资格。'));}
  for(const row of data.surveys||[]){
    const audit=row.mailbox,naval=row.navalObservation,cooldown=row.recruitCooldown,trade=row.tradeObservation;
    box.appendChild(gpEl('p','只读调查节点 '+row.nodeId+(row.round!==undefined?' · 第 '+row.round+' 轮':'')+' · '+(row.module||'未知模块')+' · '+(row.timestamp||'时间未知')));
    if(row.battlePassObservation){const observed=row.battlePassObservation;box.appendChild(gpEl('p','战令任务 '+observed.taskId+' · Info '+observed.infoStatus+' · 累计积分 '+(observed.info?.score??'未知')+' · WeekInfo窗口 '+observed.windowStatus+'；两个来源分别保留，任务周期与窗口归属未证实，积分到账及可领资格未知，重启不恢复执行。'));gpDetails(box,'原战令任务与独立窗口历史',observed);}
    if(row.recruitTasks){box.appendChild(gpEl('p','英雄/古董累计招募任务的原调查记录；进度与已领标记分开，奖励资格和到账未知。读取历史不重算、不续权、不解除拒绝或UNKNOWN。'));gpDetails(box,'原招募任务计数、来源时间与配置季',row.recruitTasks);}
    if(row.compassObservation){const observed=row.compassObservation,info=observed.info;box.appendChild(gpEl('p','罗盘Info历史观察 '+observed.status+' · 活动 '+(observed.activityId??'未知')+' · 次数 '+(info?.times??'未知')+' · 积分 '+(info?.score??'未知')+' · 已领记录 '+(info?.claimedId??'未知')+'；保底仅原值，领奖资格与到账未知。读取历史不续期、授权或解除UNKNOWN。'));gpDetails(box,'原罗盘Info只读来源',observed);}
    else if(row.orderProgress){
      const count=key=>{const value=row.orderProgress[key];return value?.status==='OBSERVED'&&Number.isInteger(value.value)&&value.value>=0&&value.value<=2147483647?String(value.value):'未知';};
      box.appendChild(gpEl('p','每日订单历史观察：完成计数 '+count('completed')+' · 已领奖阈值 '+count('rewardedThrough')+'；周期与重置时间未知。仅当次观察，不证明当前可领、到账或免费刷新资格，不能恢复执行。'));
    }
    else if(row.taskObservation){box.appendChild(gpEl('p','只读任务调查目标；不证明任务完成、可领或到账。'));gpDetails(box,'原任务Function与明确目标',row.taskObservation);if(row.taskQualification){box.appendChild(gpEl('p','原调查时的任务资格观察；读取历史不重新计算、不续期或授权，奖励到账仍未知。'));gpDetails(box,'任务进度与奖励记录的历史观察',row.taskQualification);}}
    else if(trade){
      box.appendChild(gpEl('p','海商王观察 '+(trade.status==='OBSERVED'?'已观察':'未知')+' · 周期 '+(trade.period??'未知')+' · 港口 '+(trade.cityId??'未知')+' · 船级 '+(trade.cargoLv??'未知')+' · 行情货物 '+(trade.priceCount??'未知')+' · 持货批次 '+(trade.holdingCount??'未知')+' · 非亏损预览 '+(trade.nonLossPreviewCount??'未知')+' · 未知报价 '+(trade.unknownQuoteCount??'未知')+'；仅历史当前港口响应摘要，不证明实时行情、成交或到账，不能恢复执行。'));
    }else if(cooldown){
      const readiness={READY_BY_CLOCK:'观察时冷却已满足',COOLDOWN:'观察时仍在冷却',UNKNOWN:'观察时冷却状态未知'};
      box.appendChild(gpEl('p','免费招募冷却 '+cooldown.status+' · 服务端截止秒 '+(cooldown.freeEndTimeSeconds??'未知')+' · '+(Object.hasOwn(readiness,cooldown.readiness)?readiness[cooldown.readiness]:readiness.UNKNOWN)+' · 来源 '+cooldown.source+' · 原可信时钟区间 '+gpJson(cooldown.serverBounds)+'；仅原调查记录，不代表当前可招募，不自动等待、续跑或解除 UNKNOWN。'));
    }else if(naval){
      const labels={BASELINE:'本次查询基线',UNCHANGED:'与上次响应一致',CHANGED:'当前响应已变化',UNKNOWN:'无法比较'};
      box.appendChild(gpEl('p','海战观察 '+naval.status+' · 响应目标 '+(naval.targetCount??'未知')+' · 筛选通过 '+(naval.matchedCount??'未知')+' · 不匹配 '+(naval.failedCount??'未知')+' · 筛选未知 '+(naval.unknownCount??'未知')+' · '+(Object.hasOwn(labels,naval.comparison)?labels[naval.comparison]:'无法比较')+'；CURRENT_RESPONSE_ONLY，不证明全图覆盖、目标消失或允许攻击。'));
    }else box.appendChild(gpEl('p',audit?'邮箱观察 '+audit.status+' · 页数上限 '+audit.maxPages+' · 已读页数 '+audit.readPages+' · 观察邮件 '+audit.observedMails+' · 服务端报告总数 '+(audit.totalReported??'未知')+(audit.reason?' · '+audit.reason:'')+'；完整覆盖 '+String(audit.allPagesComplete)+'，不证明原子快照或领取资格。':'原历史未保留覆盖摘要；不能据流程结束推断完整观察。'));
  }
  for (const node of data.nodes) {
    box.appendChild(gpEl('h3', '节点 ' + node.nodeId + (node.round!==undefined?' · 第 '+node.round+' 轮':'')+' · ' + node.traceResult));
    if (node.module) box.appendChild(gpEl('p', '模块：' + node.module));
    if (node.blockedReasons?.length) box.appendChild(gpEl('p', '未执行；阻塞原因：' + node.blockedReasons.join('、')));
    if (node.batchId) box.appendChild(gpEl('p', '已预览批次：' + node.batchId + ' · 动作：' + (node.actionId || '未知') + ' · 计划哈希：' + (node.planHash || '未知')));
    if (!node.batches.length) box.appendChild(gpEl('p', node.traceResult?.startsWith('BLOCKED_') ? '该节点未生成可执行批次。' : '暂无可关联执行；预览本身不表示授权或派发。'));
    for (const batch of node.batches) {
      box.appendChild(gpEl('p', '批次 ' + batch.batchId + ' · 操作 ' + batch.operationRunId + ' · ' + batch.finalStatus));
      const evidenceScope=viewGuard.capture(),evidenceRevision=gpRevision,evidenceHistoryRevision=wfHistoryRevision,evidence=gpEl('button','查看此批次的原始执行证据');
      evidence.type='button';evidence.dataset.workflowOperation=batch.operationRunId;
      evidence.onclick=()=>{if(!gpSafe(evidenceScope,evidenceRevision)||evidenceHistoryRevision!==wfHistoryRevision||$('wf-history-selected').value!==data.workflowRunId)return;return openOperationHistoryEvidence({accountId:data.accountId,operationRunId:batch.operationRunId,module:batch.module,batchId:batch.batchId,actionIds:batch.actions.map(row=>row.actionId),exactActions:true,workflowId:data.workflowRunId,workflowDefinitionId:data.workflowDefinitionId,workflowNodeId:node.nodeId,...(node.round!==undefined?{workflowRound:node.round}:{})});};box.appendChild(evidence);
      const authorizationLink=batch.runAuthorizationLink,authorizationText={MATCHED:'已关联原有限运行授权；仅供历史审计',BATCH_ONLY:'仅保留原单批授权记录，未证明继承有限运行授权',MISSING:'有限运行授权关联证据缺失；原执行结果保留',CONFLICT:'有限运行授权关联存在冲突；原执行结果保留'};
      box.appendChild(gpEl('p','授权来源：'+(authorizationText[authorizationLink?.status]??'原历史未记录授权关联')+(authorizationLink?.status==='MATCHED'?' · '+authorizationLink.approvedAt+' · 图摘要 '+authorizationLink.graphHash:'')));
      const table = gpEl('table'), header = gpEl('tr');
      for (const text of ['动作', '原始结果', '请求状态', '验证', '权威复核', '未决写']) header.appendChild(gpEl('th', text));
      table.appendChild(header);
      for (const action of batch.actions) {
        const tr = gpEl('tr');
        for (const text of [action.actionId, action.result, action.requestStatus, action.verificationStatus ?? '未知', action.reconciliationStatus ?? '未复核', action.needsReconciliation ? '待复核' : '无']) tr.appendChild(gpEl('td', text));
        table.appendChild(tr);
      }
      box.appendChild(table);
    }
  }
  const memoryScope=viewGuard.capture(),memoryRevision=gpRevision,historyRevision=wfHistoryRevision,memoryButton=gpEl('button','查看此流程的拒绝与 UNKNOWN 记忆');
  memoryButton.type='button';memoryButton.dataset.workflowMemory=data.workflowRunId;
  memoryButton.onclick=()=>{
    if(!gpSafe(memoryScope,memoryRevision)||historyRevision!==wfHistoryRevision||$('wf-history-selected').value!==data.workflowRunId)return;
    $('ops-memory-run-id').value='';$('ops-memory-workflow-id').value=data.workflowRunId;$('ops-memory-workflow-id').oninput();
    document.querySelector?.('#tabs button[data-tab="operations-history"]')?.click();$('ops-memory-workflow-id').scrollIntoView?.({block:'start'});
    return refreshOperationMemory();
  };box.appendChild(memoryButton);
  $('wf-history-hint').textContent = '只读历史；原始 UNKNOWN 保留，读取不会继续或重发动作。';
}
function readWorkflowHistoryEvidence(expected) {
  const id=value=>typeof value==='string'&&value.length>0&&value.length<=512&&value.trim()===value;
  if(expected?.accountId!==current||!id(expected.workflowRunId)||!id(expected.workflowDefinitionId)||!Object.hasOwn(expected,'executionContext'))return;
  const ctx=expected.executionContext;
  if(ctx!==null&&(!ctx||typeof ctx!=='object'||Array.isArray(ctx)||ctx.accountId!==current||['playerId','worldId','generation','connectionId'].some(key=>!Object.hasOwn(ctx,key))))return;
  // This reference comes from the existing readonly memory projection, not a
  // graph or a resumable run. Only the original history reader is invoked.
  const reference={accountId:expected.accountId,workflowRunId:expected.workflowRunId,workflowDefinitionId:expected.workflowDefinitionId,executionContext:JSON.parse(JSON.stringify(expected.executionContext))};
  wfHistoryList([...wfHistoryRows.filter(row=>row.runId!==reference.workflowRunId),{accountId:current,runId:reference.workflowRunId,status:'原记忆引用'}]);
  $('wf-history-selected').value=reference.workflowRunId;wfHistoryChanged();wfHistoryReference=reference;
  $('wf-history-selected').scrollIntoView?.({block:'start'});
  return wfReadHistory();
}
async function wfReadHistory() {
  const runId = $('wf-history-selected').value, reference = wfHistoryReference;
  if (!current || wfHistoryPending || !wfHistoryRows.some(row => row.runId === runId)) return;
  const scope = viewGuard.begin('workflow-history'), revision = gpRevision, requestRevision = ++wfHistoryRevision;
  const live = () => gpSafe(scope, revision) && requestRevision === wfHistoryRevision && $('wf-history-selected').value === runId;
  wfHistoryPending = true; gpClear($('wf-history-detail')); $('wf-history-hint').textContent = '正在读取本账号运行记录。'; wfHistoryControls();
  try {
    const data = await call('/api/workflows/history?workflowRunId=' + encodeURIComponent(runId), undefined, scope);
    if (!live()) return;
    if (data.accountId !== scope.account || data.workflowRunId !== runId || data.readOnly !== true || data.resumable !== false || !Array.isArray(data.nodes)) throw Error('工作流历史归属不匹配');
    const original=wfOriginalHistory(data);
    if(reference){
      const sameContext=(actual,expected)=>actual===null||expected===null?actual===expected:['accountId','playerId','worldId','generation','connectionId'].every(key=>actual[key]===expected[key]);
      if(reference.accountId!==scope.account||reference.workflowRunId!==runId||reference.workflowDefinitionId!==data.workflowDefinitionId||!original||!sameContext(original.executionContext,reference.executionContext))throw Error('原工作流历史与记忆引用的流程或身份不匹配');
    }
    wfHistoryRender(data);
  } catch (error) {
    if (live()) { gpClear($('wf-history-detail')); $('wf-history-hint').textContent = '历史读取失败：' + error.message; }
  } finally {
    if (live()) { wfHistoryPending = false; wfHistoryControls(); }
  }
}
$('wf-history-selected').onchange = wfHistoryChanged;
$('wf-history-read').onclick = wfReadHistory;
function wfChanged(){wfEdit++;wfPlan=null;gpClear($('wf-plan'));$('wf-json').value=gpJson(wfGraph);wfDraw();wfControls();}
function wfEditorEditable(){return Boolean(current&&!wfPending&&!wfData?.status?.running);}
function wfEditorGuard(element){const scope=viewGuard.capture(),revision=gpRevision,graph=wfGraph;const attached=parent=>Array.from(parent.children||[]).some(child=>child===element||attached(child));return ()=>wfEditorEditable()&&gpSafe(scope,revision)&&wfGraph===graph&&(attached($('wf-nodes'))||attached($('wf-edges')));}
function wfEdgeDragValid(event,readPayload=true) {
 const drag=wfEdgeDrag;if(!drag||!drag.live()||drag.edit!==wfEdit||!wfGraph.nodes.includes(drag.node))return null;
 try{const transfer=event?.dataTransfer;if(!transfer||!Array.from(transfer.types||[]).includes('application/x-crazywater-workflow-edge')||readPayload&&transfer.getData('application/x-crazywater-workflow-edge')!==JSON.stringify({from:drag.node.id,when:drag.when}))return null;}catch{return null;}return drag;
}
function wfConnectNodes(source,target,when) {
 if(wfGraph.edges.length>=WF_GRAPH_LIMITS.edges)throw Error('连线超出原数量上限。');if(source===target||source.type==='STOP'||target.type==='START')throw Error('禁止自连、STOP出边或START入边。');
 const choices=source.type==='BRANCH'?['PASS','FAIL']:['CONDITION','RULE'].includes(source.type)?['ALWAYS','PASS','FAIL']:['ALWAYS'];if(!choices.includes(when))throw Error('此节点不支持所选出口分支。');
 const outgoing=wfGraph.edges.filter(edge=>edge.from===source.id);if(outgoing.some(edge=>(edge.when||'ALWAYS')===when)||when==='ALWAYS'&&outgoing.length||when!=='ALWAYS'&&outgoing.some(edge=>(edge.when||'ALWAYS')==='ALWAYS'))throw Error('同一出口不能重复，无条件出口不能与分支出口混用。');
 const visited=new Set(),pending=[target.id];while(pending.length){const id=pending.pop();if(id===source.id)throw Error('连线会形成循环，原Workflow仅允许DAG。');if(visited.has(id))continue;visited.add(id);for(const edge of wfGraph.edges)if(edge.from===id)pending.push(edge.to);}
 wfGraph.edges.push({from:source.id,to:target.id,...(when==='ALWAYS'?{}:{when})});wfChanged();wfRenderGraph();$('wf-hint').textContent='明确连线已加入图草稿；请保存或模拟，由原Workflow验证完整分支与可达性，尚未执行。';
}
function wfEdgeDragControls(card,node) {
 const section=gpEl('div');section.appendChild(gpEl('p','直接连线：拖动明确输出到另一节点的“连入此节点”。'));card.appendChild(section);
 const choices=node.type==='STOP'?[]:node.type==='BRANCH'?['PASS','FAIL']:['CONDITION','RULE'].includes(node.type)?['ALWAYS','PASS','FAIL']:['ALWAYS'];
 for(const when of choices){const handle=gpEl('button','拖动输出 '+when);handle.type='button';handle.dataset.workflowEdgeFrom=node.id;handle.dataset.workflowEdgeWhen=when;handle.setAttribute('aria-label','从 '+node.id+' 的 '+when+' 输出拖动连线；也可用下方连线表单');section.appendChild(handle);const live=wfEditorGuard(handle),sync=()=>{handle.disabled=!wfEditorEditable();handle.draggable=!handle.disabled;};wfNodeFormControls.push(sync);sync();
  handle.ondragstart=event=>{wfEdgeDrag=null;wfNodeDrag=null;if(!live()||!event?.dataTransfer){event?.preventDefault?.();return;}try{event.dataTransfer.setData('application/x-crazywater-workflow-edge',JSON.stringify({from:node.id,when}));event.dataTransfer.effectAllowed='link';wfEdgeDrag={node,when,live,edit:wfEdit,handle};}catch{event.preventDefault?.();}};handle.ondragend=()=>{if(wfEdgeDrag?.handle===handle)wfEdgeDrag=null;};
 }
 if(node.type==='START')return;const target=gpEl('button','连入此节点');target.type='button';target.dataset.workflowEdgeTo=node.id;target.setAttribute('aria-label','拖入连线至 '+node.id+'；也可用下方连线表单');section.appendChild(target);const live=wfEditorGuard(target),sync=()=>{target.disabled=!wfEditorEditable();};wfNodeFormControls.push(sync);sync();
 target.ondragover=event=>{if(!live()||!wfEdgeDragValid(event,false))return;event.preventDefault();event.stopPropagation?.();event.dataTransfer.dropEffect='link';};
 target.ondrop=event=>{if(!live())return;const drag=wfEdgeDragValid(event);if(!drag)return;event.preventDefault();event.stopPropagation?.();wfEdgeDrag=null;try{wfConnectNodes(drag.node,node,drag.when);}catch(error){$('wf-hint').textContent='连线未添加：'+error.message;}};
}
function wfNodeDragValid(event,readPayload=true) {
 const drag=wfNodeDrag;if(!drag||!drag.live()||drag.edit!==wfEdit||!wfGraph.nodes.includes(drag.node))return null;
 try{const transfer=event?.dataTransfer;if(!transfer||!Array.from(transfer.types||[]).includes('application/x-crazywater-workflow-node')||readPayload&&transfer.getData('application/x-crazywater-workflow-node')!==drag.node.id)return null;}catch{return null;}return drag;
}
function wfNodeDrop(event,target,live) {
 if(!live())return;const drag=wfNodeDragValid(event);if(!drag||target===drag.node)return;if(target&&!wfGraph.nodes.includes(target))return;
 event.preventDefault();event.stopPropagation?.();wfNodeDrag=null;const at=wfGraph.nodes.indexOf(drag.node),before=wfGraph.nodes.slice();wfGraph.nodes.splice(at,1);const index=target?wfGraph.nodes.indexOf(target):wfGraph.nodes.length;wfGraph.nodes.splice(index,0,drag.node);
 if(before.every((node,index)=>wfGraph.nodes[index]===node))return;wfChanged();wfRenderGraph();$('wf-hint').textContent='节点显示顺序已调整；执行顺序仍由原DAG连线和条件决定。请保存或模拟，未发起任何执行。';
}
function wfNodeDragControls(card,node) {
 const handle=gpEl('button','拖动调整显示顺序');handle.type='button';handle.dataset.workflowNodeDrag=node.id;handle.setAttribute('aria-label','拖动节点 '+node.id+' 调整显示顺序，也可使用上移或下移按钮');card.appendChild(handle);const live=wfEditorGuard(handle);
 const sync=()=>{handle.disabled=!wfEditorEditable();handle.draggable=!handle.disabled;};wfNodeFormControls.push(sync);sync();
 handle.ondragstart=event=>{wfNodeDrag=null;wfEdgeDrag=null;if(!live()||!event?.dataTransfer){event?.preventDefault?.();return;}try{event.dataTransfer.setData('application/x-crazywater-workflow-node',node.id);event.dataTransfer.effectAllowed='move';wfNodeDrag={node,live,edit:wfEdit,handle};}catch{event.preventDefault?.();}};
 handle.ondragend=()=>{if(wfNodeDrag?.handle===handle)wfNodeDrag=null;};
 card.ondragover=event=>{if(!live()||!wfNodeDragValid(event,false))return;event.preventDefault();event.dataTransfer.dropEffect='move';};
 card.ondrop=event=>wfNodeDrop(event,node,live);
}
function wfNodeDragEnd(box) {
 const end=gpEl('p','拖到此处移至显示末尾；执行顺序由连线决定。');end.dataset.workflowNodeDropEnd='true';box.appendChild(end);const live=wfEditorGuard(end);
 end.ondragover=event=>{if(!live()||!wfNodeDragValid(event))return;event.preventDefault();event.dataTransfer.dropEffect='move';};end.ondrop=event=>wfNodeDrop(event,null,live);
}
function wfEditorButton(parent,label,change,allowed=()=>true){const button=gpEl('button',label);button.type='button';const live=wfEditorGuard(button),sync=()=>{button.disabled=!wfEditorEditable()||!allowed();};button.onclick=()=>{if(!live()||!allowed())return;return change();};parent.appendChild(button);wfNodeFormControls.push(sync);sync();return button;}
function wfField(parent,label,value,change,choices){const wrap=gpEl('label'),input=gpEl(choices?'select':'input');wrap.appendChild(document.createTextNode(label+' '));if(choices)for(const choice of choices){const option=gpEl('option',choice);option.value=choice;input.appendChild(option);}input.value=value??'';const live=wfEditorGuard(input),sync=()=>{input.disabled=!wfEditorEditable();};input.onchange=()=>{if(!live())return;try{if(choices&&!choices.includes(input.value))throw Error('请选择当前支持的字段值');change(input.value);wfChanged();}catch(error){$('wf-hint').textContent=error.message;}};wrap.appendChild(input);parent.appendChild(wrap);wfNodeFormControls.push(sync);sync();return input;}
function wfJsonField(parent,label,value,change){const wrap=gpEl('label'),input=gpEl('textarea');wrap.appendChild(document.createTextNode(label));input.value=value===undefined?'':gpJson(value);input.rows=3;const live=wfEditorGuard(input),sync=()=>{input.disabled=!wfEditorEditable();};input.onchange=()=>{if(!live())return;try{change(input.value.trim()?JSON.parse(input.value):undefined);wfChanged();}catch(error){$('wf-hint').textContent='节点 JSON 无效：'+error.message;}};wrap.appendChild(input);parent.appendChild(wrap);wfNodeFormControls.push(sync);sync();}


function wfObservedParameterTargets(card,node,fields,live,invalidateDraft,sync,note){
 if(!['task-rewards','production','museum','equipment-growth','badge-growth','pet','equipment-forge','heroes','formation-unlock','trial-challenge'].includes(node.module))return;
 const cached=wfCandidateCache.get(node.id);if(!cached||cached.signature!==wfCandidateSignature(node)||!cached.domainView)return;
 const view=cached.domainView,targets=[],enabled=()=>live()&&cached.signature===wfCandidateSignature(node);
 const typeOf=value=>value===null?'null':typeof value==='number'&&Number.isInteger(value)?'integer':typeof value;
 const fill=parameters=>{
  if(!enabled())return;
  const updates=Object.entries(parameters).map(([key,value])=>({field:fields.find(field=>field.key===key),value}));
  if(updates.some(({field,value})=>!field||field.structured||(Array.isArray(value)?!field.list||!field.setObservedValues||value.length>100||value.some(entry=>!field.observedTypes.includes(typeOf(entry))):field.list||!field.types.includes(typeOf(value))||field.choices&&!field.choices.includes(value)))){note.textContent='原目标与当前Function字段不匹配；保留原参数，请重新调查。';return;}
  invalidateDraft();for(const {field,value}of updates){field.enabled.checked=true;if(Array.isArray(value))field.setObservedValues(value);else{field.kind.value=typeOf(value);field.input.value=field.choices?JSON.stringify(value):value===null?'':String(value);}}sync();note.textContent='已填入原调查目标草稿；请应用业务参数并重新调查，旧候选、计划和授权已失效。观察不代表资格或结算。';
 };
 if(node.module==='museum'&&node.parameters?.popularityThreshold===undefined){
  if(Object.keys(node.parameters||{}).some(key=>!['stageId','heroIds','factor'].includes(key))){card.appendChild(gpEl('p','本Museum节点含其他业务或前置约束，保留原参数，不以探险出发覆盖。'));return;}
  const {stages,heroes,factors}=gpMuseumExploreSources(view);if(!stages||!heroes||!factors)return;
  const section=gpEl('div'),stage=gpEl('select'),factor=gpEl('select'),hint=gpEl('p'),prepare=gpEl('button','填入明确Museum出发目标草稿'),picks=[];
  const option=(select,value,label,disabled=false)=>{const item=gpEl('option',label);item.value=value;item.disabled=disabled;select.appendChild(item);};
  option(stage,'','请选择原调查关卡');for(const row of stages)option(stage,String(row.stageId),row.stageId+' · '+row.status+' · 人数 '+(row.requiredHeroCount??'UNKNOWN'),row.status!=='IDLE'||row.unlocked!==true||!Number.isSafeInteger(row.requiredHeroCount)||row.requiredHeroCount<=0);
  option(factor,'','请选择原已解锁倍率');for(const value of factors)option(factor,String(value),'倍率 '+value);stage.value=factor.value='';stage.dataset.workflowMuseumStage=node.id;factor.dataset.workflowMuseumFactor=node.id;
  section.appendChild(stage);section.appendChild(factor);
  for(const row of heroes){const label=gpEl('label',row.heroId+(row.busy?' · 已占用':'')),input=gpEl('input');input.type='checkbox';input.checked=false;input.dataset.workflowMuseumHero=row.heroId;label.appendChild(input);section.appendChild(label);picks.push({row,input});}
  prepare.type='button';prepare.dataset.workflowMuseumPrepare=node.id;section.appendChild(hint);section.appendChild(prepare);card.appendChild(section);
  const selected=()=>picks.filter(pick=>pick.input.checked&&pick.row.busy===false).map(pick=>pick.row.heroId),controlSync=()=>{const locked=!wfEditorEditable();stage.disabled=factor.disabled=locked;for(const pick of picks)pick.input.disabled=locked||pick.row.busy;const row=stages.find(row=>String(row.stageId)===stage.value);prepare.disabled=locked||!row||row.status!=='IDLE'||row.unlocked!==true||!Number.isSafeInteger(row.requiredHeroCount)||row.requiredHeroCount<=0;hint.textContent='原关卡人数 '+(row?.requiredHeroCount??'UNKNOWN')+'；本次明确选择 '+selected().length+' 名英雄。';};
  stage.onchange=()=>{if(!enabled())return;invalidateDraft();for(const pick of picks)pick.input.checked=false;controlSync();};factor.onchange=()=>{if(enabled())invalidateDraft();};for(const pick of picks)pick.input.onchange=()=>{if(!enabled())return;invalidateDraft();controlSync();};
  prepare.onclick=()=>{if(prepare.disabled||!enabled())return;const row=stages.find(row=>String(row.stageId)===stage.value),multiplier=factors.find(value=>String(value)===factor.value),heroIds=selected();if(!row||!multiplier||heroIds.length!==row.requiredHeroCount||heroIds.length>100){note.textContent='须选原已解锁倍率，并按本关明确人数选择未被占用英雄。';return;}fill({stageId:row.stageId,heroIds,factor:multiplier});};
  section.appendChild(gpEl('p','关卡、倍率和英雄来源与专业页面相同。只填原字段，出发不等于完成或领奖；应用后须重新调查人数、占用、容量和成本。'));wfNodeFormControls.push(controlSync);controlSync();return;
 }
 if(node.module==='museum'){
  for(const row of view.achievementPreparation||[])if(row.executable===true)targets.push({label:'人气档位 '+row.target.popularityThreshold+' / 原配置奖励 '+operationCosts(row.expectedState?.rewards),parameters:row.parameters});
 }else if(node.module==='trial-challenge'){
  for(const row of gpTrialRaidTargets(view))targets.push({label:row.raidId+' / '+row.label+' / 开放等级 '+row.requiredLevel,parameters:{raidId:row.raidId}});
 }else if(node.module==='heroes'){
  const parameters=node.parameters||{},action=parameters.action;if(Object.keys(parameters).some(key=>!['heroId','action','skillIdx','allowUniversal'].includes(key))||parameters.allowUniversal===true||action!==undefined&&!['level','star','skill','exclusive-level','exclusive-star','exclusive-activate'].includes(action))return;const source=gpHeroTargetSources(view);for(const row of source.rows||[]){if(action==='skill'){for(const slot of source.slots(row.heroId))targets.push({label:row.heroId+' / 技能槽 '+slot.index,parameters:{heroId:row.heroId,skillIdx:slot.index}});}else targets.push({label:row.heroId,parameters:{heroId:row.heroId}});}
 }else if(node.module==='formation-unlock'){
  for(const row of gpFormationUnlockTargets(view)||[])targets.push({label:row.presetId+' / '+row.name,parameters:{presetId:row.presetId}});
 }else if(node.module==='pet'){
  if(view?.mode==='gene-exchange'){for(const row of view.genePreparation||[])if(row.sourceNum>0)targets.push({label:row.petId+' / '+row.sourceId+' → '+row.targetId,parameters:{action:'gene-exchange',petId:row.petId}});}
  else if(view?.mode==='breed'){for(const row of view.breedPreparation||[])if(row.stockAvailable===true&&row.parameters?.action==='breed')targets.push({label:row.parameters.petId+' / 当前培育队列',parameters:row.parameters});}
  else if(view?.mode==='claim'){const p=view.claimPreparation;if(p?.action==='claim'&&p.buildingId==='1宠物培育室'&&typeof p.expectedMatureHash==='string'&&/^[a-f0-9]{64}$/.test(p.expectedMatureHash))targets.push({label:p.buildingId+' / 当前完整成熟列表',parameters:p});}
  else{
  const {level,rows,choices}=gpPetTargetSources(view);for(const row of rows||[])for(const target of choices(row.buildingId))targets.push({label:row.buildingId+' / '+target.label,parameters:{action:level?'level':'feed',buildingId:row.buildingId,...(level?{uid:target.value}:{jobIdx:Number(target.value)})}});
  }
 }else if(node.module==='equipment-forge'){
  const parameters=node.parameters||{};if(Object.keys(parameters).some(key=>!['action','buildingId','makeId','allowUniversal'].includes(key))||parameters.allowUniversal===true){card.appendChild(gpEl('p','本Forge节点含队列、数量前置约束或其他成长合同；保留原组合参数，不以单次目标覆盖。'));return;}
  const {rows,recipes}=gpForgeTargetSources(view);if(!['make','pick'].includes(parameters.action))return;for(const row of rows||[]){if(parameters.action==='pick')targets.push({label:row.buildingId+' / 单次收取',parameters:{action:'pick',buildingId:row.buildingId}});else for(const recipe of recipes||[])targets.push({label:row.buildingId+' / 配方 '+recipe.makeId,parameters:{action:'make',buildingId:row.buildingId,makeId:recipe.makeId,allowUniversal:false}});}
 }else if(node.module==='equipment-growth'||node.module==='badge-growth'){
  const parameters=node.parameters||{},badge=node.module==='badge-growth',source=badge?gpBadgeTargetSources(view):gpEquipmentTargetSources(view),action=parameters.action;
  if(Object.keys(parameters).some(key=>!(badge?['heroId','uid','action','pos']:['heroId','uid','action']).includes(key))||action!==undefined&&!(badge?['put-on','star']:['initial-level','refine','put-on','star','take-off']).includes(action))return;
  for(const hero of source.heroes||[]){const observed=source.choices(hero.heroId,action),rows=badge?observed.rows:observed||[];for(const row of rows){if(badge&&action==='put-on'){for(const pos of observed.slots)targets.push({label:hero.heroId+' / UID '+row.uid+' / 空槽 '+pos,parameters:{heroId:hero.heroId,uid:row.uid,pos}});}else targets.push({label:hero.heroId+' / UID '+row.uid,parameters:{heroId:hero.heroId,uid:row.uid}});}}
 }else if(node.module==='task-rewards'){
  const kind=node.parameters?.kind,ids=gpTaskTargetIds(view,kind,node.parameters),key=gpTaskRewardUsesTier(kind)?'tierId':'taskId',selection=view.targetSelection;
  if(WF_TASK_REWARD_KINDS.includes(kind))for(const id of ids||[]){const parameters={kind,[key]:id,...(['daily','daily-activity'].includes(kind)&&node.parameters.expectedResetTime!==undefined?{expectedResetTime:node.parameters.expectedResetTime}:{})};if(kind==='weekly-chip-task'){if(!Number.isInteger(selection?.round)||selection.round<=0||selection.round>2147483647)continue;parameters.round=selection.round;}targets.push({label:gpJson(parameters),parameters});}
 }else{
  if(node.parameters?.materialSource){card.appendChild(gpEl('p','本生产节点带固定材料包来源；保留原组合参数，不能用普通配方选择覆盖。'));return;}
  for(const factory of gpProductionFactories(view)){if(factory.reliable!==true)continue;for(const recipe of gpProductionRecipeTargets(factory))targets.push({label:factory.buildingId+' / '+recipe.productId,parameters:{buildingId:factory.buildingId,productId:recipe.productId}});}
 }
 if(!targets.length)return;
 const section=gpEl('div'),select=gpEl('select');select.dataset.workflowObservedParameterTarget=node.id;let option=gpEl('option','选择原调查中的明确目标');option.value='';select.appendChild(option);
 for(const [i,target]of targets.entries()){option=gpEl('option',target.label);option.value=String(i);select.appendChild(option);}select.value='';section.appendChild(select);card.appendChild(section);
 const controlSync=()=>{select.disabled=!wfEditorEditable();};wfNodeFormControls.push(controlSync);controlSync();
 select.onchange=()=>{
  if(select.disabled||!enabled()||select.value==='')return;const target=targets[Number(select.value)];if(!target)return;
  if(node.module==='task-rewards'){const kind=fields.find(field=>field.key==='kind');if(!kind?.enabled.checked||!kind.choices||kind.input.value!==JSON.stringify(target.parameters.kind)){note.textContent='请先在原参数表单应用同一种任务kind并重新调查；不能跨任务或活动身份借用目标。';return;}}
  if(['equipment-growth','badge-growth','heroes','pet','equipment-forge'].includes(node.module)){const action=fields.find(field=>field.key==='action'),stored=node.parameters?.action;if(!action||action.enabled.checked!==(stored!==undefined)||action.enabled.checked&&action.input.value!==JSON.stringify(stored)){note.textContent='动作种类正在编辑；请先应用并重新调查，再使用对应穿戴或成长来源选择。';return;}}
  fill(target.parameters);
 };
 section.appendChild(gpEl('p','与专业页面共用原任务ID、工厂/配方或成长精确目标来源；UID保留文本，徽章只选原空槽，Pet队列idx含0，Forge保留组合约束。只填写现有Function字段，其他参数保持。选目标后仍应用参数、重新调查及单次授权，不自动采用新资格。'));
}

function wfParameterForm(card,node) {
 const schema=WF_PARAMETER_SCHEMAS[node.module];if(!schema){wfJsonField(card,'业务参数',node.parameters,value=>{if(gpJson(value)!==gpJson(node.parameters))delete node.selection;if(value===undefined)delete node.parameters;else node.parameters=value;wfCandidateCache.delete(node.id);wfRenderGraph();});return;}
 const scope=viewGuard.capture(),revision=gpRevision,graph=wfGraph,module=node.module,type=node.type,stored=gpJson(node.parameters);
 const editable=()=>Boolean(current&&!wfPending&&!wfData?.status?.running);
 const live=()=>editable()&&gpSafe(scope,revision)&&wfGraph===graph&&graph.nodes.includes(node)&&node.module===module&&node.type===type&&gpJson(node.parameters)===stored&&Array.from($('wf-nodes').children).includes(card);
 const section=gpEl('div'),note=gpEl('p','明确启用字段后填写业务选择，再应用。未启用字段从声明中移除；复杂参数原样保留。领域资格、成本和 D6 仍由原 Function 校验。');
 section.appendChild(gpEl('h4','业务参数'));section.appendChild(note);card.appendChild(section);
 const labels={packId:'礼包 ID',itemId:'物品 ID',num:'数量',action:'业务操作',buildingId:'建筑 ID',jobIdx:'培育队列索引（含 0）',expectedMatureHash:'当前成熟列表标识',petId:'海兽种类',expectedBreedHash:'当前培育队列标识',level:'等级',pageNo:'邮件页号（含 0）',emailId:'精确邮件 ID',kind:'任务种类',taskId:'精确任务 ID',tierId:'活跃奖励档位',uid:'精确目标 UID',cityId:'城市 ID',allowLowerLevel:'允许已授权的较低等级目标',antiqueId:'古董 ID',suitId:'古董套装 ID',heroId:'英雄 ID',pos:'栏位',presetId:'阵容模板 ID',makeId:'制造配方 ID',allowUniversal:'允许万能材料',productId:'产品 ID',mode:'业务模式',raidId:'远征 raidId',season:'赛季',techId:'科技 ID',targetLevel:'目标等级',stageId:'关卡 ID',factor:'培养倍率',popularityThreshold:'精确人气成就档位',exhibitionId:'展览 ID',useNum:'使用数量',payment:'支付方式',caseIndex:'展示栏位',keywordType:'关键词类型',shipId:'商船 ID',crewId:'精确舱位 ID',shipIndex:'货船索引',cargoIndex:'货格索引',targetId:'目标 ID',playerId:'精确玩家 ID',minimumPower:'最低战力',maximumPower:'最高战力',skillIdx:'技能槽索引（从 1 开始）',memberIds:'精确联盟成员 ID 列表',reqIds:'精确联盟求助 ID 列表',itemIds:'物品 ID 列表',heroIds:'英雄 ID 列表',fleetBuildingIds:'舰队建筑 ID 列表',excludeGuildIds:'排除联盟 ID 列表',cityIds:'城市 ID 列表',heroPositions:'英雄精确站位',screenCenter:'屏幕中心坐标',config:'主线设置',x:'X 坐标',y:'Y 坐标',enabled:'启用',retryDelaySeconds:'失败间隔秒数',maxAttempts:'最多场数',maxStage:'最高关卡',stopOnDefeat:'首败停止',interStageDelay:'场间等待秒数',minSeconds:'最少秒数',maxSeconds:'最多秒数',formation:'阵容设置'};
 const enums={feed:'投喂',claim:'领取',read:'标为已读',main:'主线',branch:'支线',achievement:'成就',daily:'每日任务','daily-activity':'日活跃',...Object.fromEntries(Object.entries(GP_OPEN_RANK_LABELS).map(([kind,label])=>[kind,label+'档位'])),'daily-gift':'固定免费赠礼',activate:'激活',star:'升星',suit:'套装成长',master:'大师成长',exchange:'碎片兑换','put-on':'穿戴','take-off':'卸下',refine:'精炼',make:'制造',pick:'收取',plant:'播种',harvest:'收取',expedition:'远征',level:'升级',skill:'技能升级','exclusive-activate':'专武首次激活','exclusive-level':'专武升级','exclusive-star':'专武升星','fragment-exchange':'万能碎片兑换',ITEM:'自有物品',FREE:'免费',PREMIUM:'钻石（D6 禁止）'};
 const fields=[],values=node.parameters&&typeof node.parameters==='object'&&!Array.isArray(node.parameters)?node.parameters:{};
 const primitiveTypes=spec=>[...new Set((spec.anyOf||[spec]).flatMap(row=>Array.isArray(row.type)?row.type:[row.type]))].filter(type=>['string','integer','number','boolean','null'].includes(type));
 const valueType=value=>value===null?'null':typeof value==='number'?(Number.isInteger(value)?'integer':'number'):typeof value;
 const tag=(input,key,control)=>{input.dataset.workflowParameter=node.id;input.dataset.parameterField=key;input.dataset.parameterControl=control;return input;};
 const readPrimitive=({key,kind,input,choices,types})=>{
  if(!types.includes(kind.value))throw Error('参数类型无效。');let value;
  if(choices){if(input.value==='')throw Error((labels[key]||key)+'需要明确值。');value=JSON.parse(input.value);if(!choices.includes(value)||value==='PREMIUM')throw Error('该业务值未开放。');}
  else if(kind.value==='string')value=input.value;
  else if(kind.value==='null')value=null;
  else if(kind.value==='boolean'){if(!['true','false'].includes(input.value))throw Error('请选择明确布尔值。');value=input.value==='true';}
  else {
   if(kind.value==='integer'&&!/^-?(0|[1-9][0-9]*)$/.test(input.value))throw Error((labels[key]||key)+'需要明确十进制整数。');
   try{value=JSON.parse(input.value);}catch{throw Error((labels[key]||key)+'需要明确有限数值。');}
   if(typeof value!=='number'||!Number.isFinite(value)||kind.value==='integer'&&!Number.isSafeInteger(value)||Number.isInteger(value)&&!Number.isSafeInteger(value))throw Error((labels[key]||key)+'需要可靠数值；精确 UID 使用对应文本类型。');
  }
  return value;
 };
 const plainObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 const objectSupported=spec=>spec?.type==='object'&&Object.values(spec.properties||{}).every(child=>child.type==='object'?objectSupported(child):(child.anyOf||[child]).every(v=>(Array.isArray(v.type)?v.type:[v.type]).every(t=>['string','integer','number','boolean','null'].includes(t))));
 const objectEditor=(parent,spec,original,key,path=[])=>{
  const originalObject=plainObject(original)?original:{},parts=[],elements=[];
  const control=(tagName,control,text='')=>{const input=tag(gpEl(tagName,text),key,control);input.dataset.parameterPath=JSON.stringify(path);elements.push(input);return input;};
  for(const [name,child]of Object.entries(spec.properties||{})){
   const childPath=[...path,name],group=gpEl('div'),label=gpEl('label'),enabled=control('input','nested-enabled');enabled.dataset.parameterPath=JSON.stringify(childPath);enabled.type='checkbox';enabled.checked=Object.hasOwn(originalObject,name);label.appendChild(enabled);label.appendChild(document.createTextNode(' '+(labels[name]||name)));group.appendChild(label);parent.appendChild(group);
   const old=originalObject[name],types=primitiveTypes(child),inferred=valueType(old),part={name,enabled};
   if(child.type==='object'&&(!enabled.checked||plainObject(old))){part.editor=objectEditor(group,child,old,key,childPath);elements.push(...part.editor.elements);}
   else if(enabled.checked&&(child.type==='object'||!types.includes(inferred))){part.preserved=true;part.value=old;group.appendChild(gpEl('span','原值保持：'+gpJson(old)));}
   else {
    const kind=control('select','nested-type');kind.dataset.parameterPath=JSON.stringify(childPath);for(const type of types){const option=gpEl('option',({string:'文本（精确原文）',integer:'整数',number:'数值',boolean:'布尔',null:'null'})[type]);option.value=type;kind.appendChild(option);}kind.value=types.includes(inferred)?inferred:types[0];if(types.length>1)group.appendChild(kind);
    const choices=child.enum??(types.length===1&&types[0]==='boolean'?[false,true]:null),input=control(choices?'select':'input','nested-value');input.dataset.parameterPath=JSON.stringify(childPath);
    if(choices){const empty=gpEl('option','请选择明确值');empty.value='';input.appendChild(empty);for(const value of choices){const option=gpEl('option',enums[value]||String(value));option.value=JSON.stringify(value);if(value==='PREMIUM')option.disabled=true;input.appendChild(option);}input.value=enabled.checked?JSON.stringify(old):'';}
    else input.value=enabled.checked&&old!==null?String(old):'';
    group.appendChild(input);Object.assign(part,{key:childPath.join('.'),kind,input,choices,types});kind.onchange=sync;
   }
   enabled.onchange=sync;parts.push(part);
  }
  return {elements,read:()=>{const next=JSON.parse(JSON.stringify(originalObject));for(const part of parts){if(!part.enabled.checked)delete next[part.name];else next[part.name]=part.editor?part.editor.read():part.preserved?JSON.parse(JSON.stringify(part.value)):readPrimitive(part);}return next;},
   sync:locked=>{for(const part of parts){part.enabled.disabled=locked;const inactive=locked||!part.enabled.checked;if(part.editor)part.editor.sync(inactive);else if(!part.preserved){part.kind.disabled=inactive;part.input.disabled=inactive||part.kind.value==='null';}}}};
 };
 for(const [key,spec]of Object.entries(schema.properties||{})){
  const structured=spec.type==='object'&&objectSupported(spec),objectList=spec.type==='array'&&objectSupported(spec.items);
  if((structured||objectList)&&(!Object.hasOwn(values,key)||(structured?plainObject(values[key]):Array.isArray(values[key])))){
   const group=gpEl('div'),label=gpEl('label'),enabled=tag(gpEl('input'),key,'enabled');enabled.type='checkbox';enabled.checked=Object.hasOwn(values,key);label.appendChild(enabled);label.appendChild(document.createTextNode(' '+(labels[key]||key)));group.appendChild(label);section.appendChild(group);
   const field={key,enabled,structured:true};fields.push(field);
   if(structured){const editor=objectEditor(group,spec,values[key],key);field.read=editor.read;field.sync=locked=>editor.sync(locked);}
   else {
    const box=gpEl('div');group.appendChild(box);const add=tag(gpEl('button','添加一项'),key,'add');add.type='button';group.appendChild(add);const entries=[];
    const refresh=()=>{gpClear(box);entries.forEach((entry,index)=>{box.appendChild(entry.row);for(const input of [...entry.elements,...entry.buttons.map(b=>b.button)])input.dataset.parameterIndex=String(index);});};
    const append=value=>{
     const row=gpEl('div'),entry={row,elements:[],buttons:[]};if(plainObject(value)||value===undefined){entry.editor=objectEditor(row,spec.items,value,key);entry.elements=entry.editor.elements;}else {entry.value=value;row.appendChild(gpEl('span','原复杂值（保持原文）：'+gpJson(value)));}
     for(const [action,text,delta]of [['up','上移',-1],['down','下移',1],['remove','移除此项',0]]){
      const button=tag(gpEl('button',text),key,action);button.type='button';row.appendChild(button);entry.buttons.push({button,delta});
      button.onclick=()=>{if(!live()||!enabled.checked||!entries.includes(entry)||!Array.from(box.children).includes(row))return;const index=entries.indexOf(entry);
       if(action==='remove')entries.splice(index,1);else {const target=index+delta;if(target<0||target>=entries.length)return;[entries[index],entries[target]]=[entries[target],entries[index]];}refresh();sync();};
     }entries.push(entry);
    };
    for(const value of values[key]||[])append(value);refresh();
    add.onclick=()=>{if(!live()||!enabled.checked||entries.length>=100)return;append();refresh();sync();};
    field.read=()=>{if(entries.length>100)throw Error('列表超出原 Function JSON 上限。');return entries.map(entry=>entry.editor?entry.editor.read():JSON.parse(JSON.stringify(entry.value)));};
    field.sync=locked=>{add.disabled=locked||entries.length>=100;entries.forEach((entry,index)=>{entry.editor?.sync(locked);for(const {button,delta}of entry.buttons)button.disabled=locked||delta!==0&&(index+delta<0||index+delta>=entries.length);});};
   }
   enabled.onchange=sync;continue;
  }
  if(spec.type==='array'&&primitiveTypes(spec.items||{}).length&&(!Object.hasOwn(values,key)||Array.isArray(values[key]))){
   const group=gpEl('div'),label=gpEl('label'),enabled=tag(gpEl('input'),key,'enabled');enabled.type='checkbox';enabled.checked=Object.hasOwn(values,key);
   label.appendChild(enabled);label.appendChild(document.createTextNode(' '+(labels[key]||key)));group.appendChild(label);section.appendChild(group);
   const box=gpEl('div');group.appendChild(box);const add=tag(gpEl('button','添加一项'),key,'add');add.type='button';group.appendChild(add);
   const types=primitiveTypes(spec.items),field={key,enabled,list:true,rows:[],add};fields.push(field);
   const blank=()=>({type:types[0],text:'',preserved:false}),snapshot=entry=>entry.preserved?{preserved:true,value:entry.value}:{type:entry.kind.value,text:entry.input.value,preserved:false};
   const render=entries=>{
    gpClear(box);field.rows=entries.map((entry,index)=>{
     const row=gpEl('div'),model={...entry,row};box.appendChild(row);
     if(entry.preserved)row.appendChild(gpEl('span','原复杂值（保持原文）：'+gpJson(entry.value)));
     else {
      const kind=tag(gpEl('select'),key,'item-type');for(const t of types){const option=gpEl('option',({string:'文本（精确原文）',integer:'整数',number:'数值',boolean:'布尔',null:'null'})[t]);option.value=t;kind.appendChild(option);}kind.value=entry.type;kind.dataset.parameterIndex=String(index);model.kind=kind;if(types.length>1)row.appendChild(kind);
      const input=tag(gpEl('input'),key,'item');input.value=entry.text;input.dataset.parameterIndex=String(index);model.input=input;row.appendChild(input);kind.onchange=sync;
     }
     model.buttons=[];for(const [action,text,delta]of [['up','上移',-1],['down','下移',1],['remove','移除此项',0]]){
      const button=tag(gpEl('button',text),key,action);button.type='button';button.dataset.parameterIndex=String(index);row.appendChild(button);model.buttons.push({button,delta});
      button.onclick=()=>{
       if(!live()||!enabled.checked||!field.rows.includes(model)||!Array.from(box.children).includes(row))return;
       const next=field.rows.map(snapshot);if(action==='remove')next.splice(index,1);else {const target=index+delta;if(target<0||target>=next.length)return;[next[index],next[target]]=[next[target],next[index]];}
       render(next);sync();
      };
     }return model;
    });
   };
   enabled.onchange=sync;add.onclick=()=>{if(!live()||!enabled.checked||field.rows.length>=100)return;render([...field.rows.map(snapshot),blank()]);sync();};
   field.observedTypes=types;field.setObservedValues=values=>render(values.map(value=>({type:valueType(value),text:value===null?'':String(value),preserved:false})));
   render((values[key]||[]).map(value=>{const type=valueType(value);return types.includes(type)?{type,text:value===null?'':String(value),preserved:false}:{preserved:true,value};}));
   continue;
  }
  const variants=spec.anyOf||[spec],types=[...new Set(variants.flatMap(row=>Array.isArray(row.type)?row.type:[row.type]))];
  if(!types.length||types.some(type=>!['string','integer','number','boolean','null'].includes(type))){section.appendChild(gpEl('p',(labels[key]||key)+'：复杂业务参数保持原样，可从专业候选导入或高级编辑。'));continue;}
  const row=gpEl('label'),enabled=gpEl('input');enabled.type='checkbox';enabled.checked=Object.hasOwn(values,key);enabled.dataset.workflowParameter=node.id;enabled.dataset.parameterField=key;enabled.dataset.parameterControl='enabled';row.appendChild(enabled);row.appendChild(document.createTextNode(' '+(labels[key]||key)+' '));
  const kind=gpEl('select');for(const t of types){const option=gpEl('option',({string:'文本（精确原文）',integer:'整数',number:'数值',boolean:'布尔',null:'null'})[t]);option.value=t;kind.appendChild(option);}
  const old=values[key],inferred=old===null?'null':typeof old==='number'?(Number.isInteger(old)?'integer':'number'):typeof old;
  kind.value=types.includes(inferred)?inferred:types[0];kind.dataset.workflowParameter=node.id;kind.dataset.parameterField=key;kind.dataset.parameterControl='type';
  if(types.length>1)row.appendChild(kind);
  const choices=spec.enum??(types.length===1&&types[0]==='boolean'?[false,true]:null),input=gpEl(choices?'select':'input');
  if(choices){const empty=gpEl('option','请选择明确值');empty.value='';input.appendChild(empty);for(const value of choices){const option=gpEl('option',enums[value]||String(value));option.value=JSON.stringify(value);if(value==='PREMIUM')option.disabled=true;input.appendChild(option);}input.value=enabled.checked?JSON.stringify(old):'';}
  else input.value=enabled.checked&&old!==undefined&&old!==null?String(old):'';
  input.dataset.workflowParameter=node.id;input.dataset.parameterField=key;input.dataset.parameterControl='value';row.appendChild(input);section.appendChild(row);fields.push({key,enabled,kind,input,choices,types});
 }
 const apply=gpEl('button','应用业务参数');apply.type='button';apply.dataset.workflowParameterApply=node.id;section.appendChild(apply);
 function sync(){const locked=!editable();for(const field of fields){field.enabled.disabled=locked;const inactive=locked||!field.enabled.checked;
  if(field.structured)field.sync(inactive);
  else if(field.list){field.add.disabled=inactive||field.rows.length>=100;field.rows.forEach((entry,index)=>{if(!entry.preserved){entry.kind.disabled=inactive;entry.input.disabled=inactive||entry.kind.value==='null';}for(const {button,delta}of entry.buttons)button.disabled=inactive||delta!==0&&(index+delta<0||index+delta>=field.rows.length);});}
  else {field.kind.disabled=inactive;field.input.disabled=inactive||field.kind.value==='null';}
 }apply.disabled=locked;}
 for(const field of fields){field.enabled.onchange=sync;if(!field.list&&!field.structured)field.kind.onchange=sync;}
 apply.onclick=()=>{
  if(!live())return;
  try{
   if(node.parameters!==undefined&&(!node.parameters||typeof node.parameters!=='object'||Array.isArray(node.parameters)))throw Error('原业务参数需为对象，请先修正高级编辑。');
   const next=JSON.parse(JSON.stringify(node.parameters||{}));
   for(const field of fields){
    const {key,enabled}=field;if(!enabled.checked){delete next[key];continue;}
    if(field.structured)next[key]=field.read();
    else if(field.list){if(field.rows.length>100)throw Error('列表超出原 Function JSON 上限。');next[key]=field.rows.map(entry=>entry.preserved?JSON.parse(JSON.stringify(entry.value)):readPrimitive({key,kind:entry.kind,input:entry.input,choices:null,types:primitiveTypes(schema.properties[key].items)}));}
    else next[key]=readPrimitive(field);

   }
   if(gpJson(next)!==stored)delete node.selection;node.parameters=next;wfCandidateCache.delete(node.id);wfChanged();wfRenderGraph();$('wf-hint').textContent='业务参数已应用；目标变化已清除旧选择，请重新采集并选择候选，保存与执行继续由原Function校验。';
  }catch(error){note.textContent='参数未应用：'+error.message;}
 };
 wfNodeFormControls.push(sync);sync();
 const advanced=gpEl('details');advanced.appendChild(gpEl('summary','高级业务参数 JSON'));wfJsonField(advanced,'业务参数',node.parameters,value=>{if(gpJson(value)!==gpJson(node.parameters))delete node.selection;if(value===undefined)delete node.parameters;else node.parameters=value;wfCandidateCache.delete(node.id);wfRenderGraph();});card.appendChild(advanced);
 const invalidateDraft=()=>{if(!live()||card.dataset.workflowParameterDraft==='true')return;card.dataset.workflowParameterDraft='true';delete node.selection;wfCandidateCache.delete(node.id);wfChanged();note.textContent='业务目标正在编辑；旧候选选择、预览及授权已失效。请应用参数后重新调查；保存和开始须先应用或明确放弃草稿。';};
 wfObservedParameterTargets(card,node,fields,live,invalidateDraft,sync,note);
 section.oninput=section.onchange=advanced.oninput=invalidateDraft;
 section.onclick=event=>{if(['add','up','down','remove'].includes(event?.target?.dataset?.parameterControl))invalidateDraft();};
 wfEditorButton(card,'放弃未应用参数草稿',()=>{wfRenderGraph();$('wf-hint').textContent='已放弃未应用参数，保留原节点参数；旧选择及预览未恢复，写入前请重新调查。';},()=>card.dataset.workflowParameterDraft==='true');
}

function wfObservedSurveySource(node){
 const nodes=new Map(wfGraph.nodes.map(row=>[row.id,row])),memo=new Map(),visiting=new Set();
 const sourceFor=id=>{
  if(memo.has(id))return memo.get(id);if(visiting.has(id))return null;
  const row=nodes.get(id);if(!row)return null;if(row.type==='SURVEY')return row;
  if(!['CONDITION','RULE','VERIFY','BRANCH'].includes(row.type))return null;
  visiting.add(id);const parents=wfGraph.edges.filter(edge=>edge.to===id),sources=parents.map(edge=>sourceFor(edge.from));visiting.delete(id);
  const result=sources.length&&sources.every(source=>source&&source===sources[0])?sources[0]:null;memo.set(id,result);return result;
 };
 const parentEdges=wfGraph.edges.filter(edge=>edge.to===node.id),sources=parentEdges.map(edge=>sourceFor(edge.from)),source=sources.length&&sources.every(row=>row&&row===sources[0])?sources[0]:null;
 if(!source)return null;const cached=wfCandidateCache.get(source.id);if(!cached||cached.signature!==wfCandidateSignature(source)||!cached.domainView||typeof cached.domainView!=='object'||Array.isArray(cached.domainView))return null;
 return {source,cached};
}
function wfConditionObservedPaths(node){
 const observed=wfObservedSurveySource(node);if(!observed)return null;const {source,cached}=observed;
 const fields=[];const visit=(value,path)=>{
  if(fields.length>=200||path.length>WF_CONDITION_FIELDS.maxDepth)return;
  if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)&&(!Number.isInteger(value)||Number.isSafeInteger(value))){fields.push({path,value});return;}
  if(!value||typeof value!=='object'||Array.isArray(value))return;
  for(const [key,entry]of Object.entries(value)){if(!key.trim()||WF_CONDITION_FIELDS.forbidden.includes(key.toLowerCase()))continue;visit(entry,[...path,key]);if(fields.length>=200)break;}
 };
 visit(cached.domainView,['view']);return {source,cached,fields};
}

function wfConditionForm(card,node) {
 const scope=viewGuard.capture(),revision=gpRevision,graph=wfGraph,stored=gpJson(node.condition),type=node.type;
 const editable=()=>Boolean(current&&!wfPending&&!wfData?.status?.running);
 const live=()=>editable()&&gpSafe(scope,revision)&&wfGraph===graph&&graph.nodes.includes(node)&&node.type===type&&gpJson(node.condition)===stored&&Array.from($('wf-nodes').children).includes(card);
 const section=gpEl('div'),note=gpEl('p','表单草稿只在点击“应用条件”后更新节点；编辑立即撤销旧预览和授权。缺失或类型不匹配的事实仍为 UNKNOWN。'),controls=[];
 card.appendChild(section);section.appendChild(gpEl('h4','条件设置'));section.appendChild(note);
 const invalidateDraft=()=>{if(!live()||card.dataset.workflowConditionDraft==='true')return;card.dataset.workflowConditionDraft='true';wfChanged();note.textContent='条件正在编辑；旧预览及授权已失效。请应用条件或明确放弃草稿后再保存、模拟和开始。';};
 const field=(key,label,value,choices)=>{
  const wrap=gpEl('label',label+' '),input=gpEl(choices?'select':'input');input.dataset.workflowCondition=node.id;input.dataset.conditionField=key;
  if(choices)for(const [id,text]of choices){const option=gpEl('option',text);option.value=id;input.appendChild(option);}
  input.value=value??'';wrap.appendChild(input);section.appendChild(wrap);controls.push(input);return input;
 };
 const rule=node.condition||{},source=field('source','事实来源',rule.source??'survey',WF_CONDITION_FIELDS.sources.map(id=>[id,id==='survey'?'最近一次只读采集结果':'最近一次操作运行结果']));
 const pathBox=gpEl('div');section.appendChild(pathBox);let pathInputs=[];
 const observed=wfConditionObservedPaths(node),observedFields=field('observedPath','已调查字段（仅辅助填路径）','',[['','请选择原调查字段'],...(observed?.fields||[]).map((entry,index)=>[String(index),JSON.stringify(entry.path)+' · '+String(JSON.stringify(entry.value)).slice(0,100)])]);
 section.appendChild(gpEl('p',observed?'字段来源：上游调查节点 '+observed.source.id+' / '+observed.source.module+'；最多展示200个非数组标量路径。执行时仍读取最近一次调查，值可能变化；null仍为UNKNOWN，数组目标须保留精确身份，不自动选择阈值或授权。':'没有唯一且已调查的上游SURVEY字段；可先采集原节点，或沿用手填路径。经过ACTION、WAIT或来源有歧义时不推测字段归属。'));
 const operator=field('operator','比较方式',rule.operator??'EQ',WF_CONDITION_FIELDS.operators.map(id=>[id,({EQ:'等于',NE:'不等于',GT:'大于',GTE:'大于或等于',LT:'小于',LTE:'小于或等于',EXISTS:'字段存在（非 null）'})[id]]));
 const valueType=field('valueType','比较值类型',rule.value===null?'null':typeof rule.value==='number'?'number':typeof rule.value==='boolean'?'boolean':'string',[['string','文本（保留大整数原文）'],['number','数值'],['boolean','布尔值'],['null','null']]);
 const value=field('value','比较值',typeof rule.value==='string'||typeof rule.value==='number'?String(rule.value):'');
 const boolean=field('boolean','布尔值',String(rule.value===true),[['true','true'],['false','false']]);
 const apply=gpEl('button','应用条件');apply.type='button';apply.dataset.workflowConditionApply=node.id;section.appendChild(apply);
 const clear=gpEl('button','改用成功历史验证');clear.type='button';clear.dataset.workflowConditionClear=node.id;if(node.type==='VERIFY')section.appendChild(clear);
 const sync=()=>{
  const locked=!editable();for(const input of controls)input.disabled=locked;
  observedFields.disabled=locked||source.value!=='survey'||!observed?.fields.length;
  const exists=operator.value==='EXISTS';valueType.disabled=locked||exists;value.disabled=locked||exists||!['string','number'].includes(valueType.value);boolean.disabled=locked||exists||valueType.value!=='boolean';
  for(const input of pathInputs)input.disabled=locked;
  for(const row of pathBox.children)for(const child of row.children)if(child.dataset?.conditionPathRemove!==undefined)child.disabled=locked||pathInputs.length<=1;
  addPath.disabled=locked||pathInputs.length>=WF_CONDITION_FIELDS.maxDepth;apply.disabled=locked;clear.disabled=locked||node.condition===undefined;
 };
 const renderPaths=rows=>{
  gpClear(pathBox);pathInputs=rows.map((entry,index)=>{
   const row=gpEl('label','字段 '+(index+1)+' '),input=gpEl('input'),remove=gpEl('button','移除此字段');input.value=entry;input.dataset.workflowCondition=node.id;input.dataset.conditionField='path';input.dataset.conditionPath=String(index);
   remove.type='button';remove.dataset.conditionPathRemove=String(index);remove.onclick=()=>{if(!live()||!Array.from(pathBox.children).includes(row)||pathInputs.length<=1)return;invalidateDraft();renderPaths(pathInputs.filter((_,i)=>i!==index).map(field=>field.value));sync();};
   row.appendChild(input);row.appendChild(remove);pathBox.appendChild(row);return input;
  });
 };
 const addPath=gpEl('button','添加路径字段');addPath.type='button';addPath.dataset.workflowConditionPathAdd=node.id;section.appendChild(addPath);
 addPath.onclick=()=>{if(!live()||pathInputs.length>=WF_CONDITION_FIELDS.maxDepth)return;invalidateDraft();renderPaths([...pathInputs.map(field=>field.value),'']);sync();};
 observedFields.onchange=()=>{if(!live()||source.value!=='survey'||!observed||wfCandidateCache.get(observed.source.id)!==observed.cached||observed.cached.signature!==wfCandidateSignature(observed.source)||!graph.nodes.includes(observed.source))return;const entry=observed.fields[Number(observedFields.value)];if(observedFields.value===''||!entry)return;invalidateDraft();renderPaths(entry.path);sync();};
 source.onchange=sync;operator.onchange=sync;valueType.onchange=sync;
 apply.onclick=()=>{
  if(!live())return;
  try {
   const path=pathInputs.map(field=>field.value),op=operator.value;
   if(!WF_CONDITION_FIELDS.sources.includes(source.value)||!WF_CONDITION_FIELDS.operators.includes(op)||!path.length||path.length>WF_CONDITION_FIELDS.maxDepth||path.some(key=>!key.trim()||WF_CONDITION_FIELDS.forbidden.includes(key.toLowerCase())))throw Error('请选择受支持的来源、比较方式和明确安全的事实路径。');
   const next={source:source.value,path,operator:op};
   if(op!=='EXISTS'){
    if(valueType.value==='string'){if(value.value.length>2000)throw Error('比较文本最多2000字符。');next.value=value.value;}
    else if(valueType.value==='boolean'){if(!['true','false'].includes(boolean.value))throw Error('请选择明确布尔值。');next.value=boolean.value==='true';}
    else if(valueType.value==='null')next.value=null;
    else if(valueType.value==='number'){
     let number;try{number=JSON.parse(value.value);}catch{throw Error('比较数值需要明确有限数值。');}
     if(typeof number!=='number'||!Number.isFinite(number)||Number.isInteger(number)&&!Number.isSafeInteger(number))throw Error('比较数值不可靠；大整数事实请按文本原文比较。');
     next.value=number;
    }else throw Error('比较值类型无效。');
   }
   node.condition=next;wfChanged();wfRenderGraph();$('wf-hint').textContent='条件已应用；保存或模拟时仍由原Workflow合同验证，未采集、授权或执行。';
  }catch(error){note.textContent='条件未应用：'+error.message;}
 };
 clear.onclick=()=>{if(!live()||node.type!=='VERIFY')return;delete node.condition;wfChanged();wfRenderGraph();$('wf-hint').textContent='已移除显式条件；将按原VERIFY规则核验当前批次成功历史。';};
 renderPaths(Array.isArray(rule.path)&&rule.path.length?rule.path.slice():['']);wfNodeFormControls.push(sync);sync();
 const advanced=gpEl('details');advanced.appendChild(gpEl('summary','高级条件 JSON'));wfJsonField(advanced,'条件 {source,path,operator,value?}',node.condition,value=>{if(value===undefined)delete node.condition;else node.condition=value;wfRenderGraph();});card.appendChild(advanced);
 section.oninput=section.onchange=advanced.oninput=invalidateDraft;
 wfEditorButton(card,'放弃未应用条件草稿',()=>{wfRenderGraph();$('wf-hint').textContent='已放弃未应用条件，保留原节点条件；旧预览及授权未恢复。';},()=>card.dataset.workflowConditionDraft==='true');
}

function wfWaitObservedTarget(card,node,mode){
 if(!['FACTORY_QUEUE_CLOCK','TRADE_LEG_END'].includes(mode))return;
 const observed=wfObservedSurveySource(node),expected=mode==='FACTORY_QUEUE_CLOCK'?'production':'trade';
 if(!observed||observed.source.module!==expected){card.appendChild(gpEl('p','可先在唯一上游 '+expected+' 调查节点读取原等待目标；手填参数保留，不从其他调查或本机时间补目标。'));return;}
 const {source,cached}=observed,view=cached.domainView,targets=[];
 if(mode==='FACTORY_QUEUE_CLOCK'){
  const rows=Array.isArray(view.queueClocks)?view.queueClocks:[],keys=rows.map(row=>JSON.stringify([row?.target?.buildingId,row?.target?.index]));
  for(const [i,row]of rows.entries()){const target=row?.target;if(row?.status!=='OBSERVED'||row.executable!==false||row.eligibility!==null||typeof target?.buildingId!=='string'||!target.buildingId||!Number.isInteger(target.index)||target.index<0||target.index>2147483647||keys.indexOf(keys[i])!==keys.lastIndexOf(keys[i]))continue;targets.push({value:JSON.stringify({buildingId:target.buildingId,index:target.index}),parameters:{buildingId:target.buildingId,index:target.index},observation:row});}
 }else{
  const row=view.cooldownObservation,leg=row?.leg;
  if(row?.status==='OBSERVED'&&row.executable===false&&row.eligibility===null&&leg&&[leg.cityId,leg.moveToCityId].every(id=>Number.isInteger(id)&&id>0&&id<=2147483647)&&leg.cityId!==leg.moveToCityId)targets.push({value:JSON.stringify({cityId:leg.cityId,mvToCityId:leg.moveToCityId}),parameters:{cityId:leg.cityId,mvToCityId:leg.moveToCityId},observation:row});
 }
 const select=wfField(card,'从原调查选择等待目标','',value=>{
  if(value==='')return;
  if(wfCandidateCache.get(source.id)!==cached||cached.signature!==wfCandidateSignature(source)||!wfGraph.nodes.includes(source)||node.cooldown?.kind!==mode)throw Error('原等待目标观察已变化，请重新调查后选择。');
  const target=targets.find(row=>row.value===value);if(!target)throw Error('请选择原调查中的明确目标。');node.cooldown={...node.cooldown,...target.parameters};wfRenderGraph();
 },['',...targets.map(row=>row.value)]);select.dataset.workflowWaitObservedTarget=mode;
 card.appendChild(gpEl('p','来源节点 '+source.id+' / '+source.module+'；仅复制原精确目标，不复制时钟、资格或授权。运行时沿原WAIT重新调查并同目标复读；没有可靠目标时保留手填及原UNKNOWN阻断。'));
 for(const row of targets)gpDetails(card,'原等待目标与时钟观察 '+row.value,row.observation);
}

function wfWaitForm(card,node){
 const mode=node.cooldown?.kind??'DURATION';
 const select=wfField(card,'等待来源',mode,value=>{if(['FREE_RECRUIT','TRADE_LEG_END','FACTORY_QUEUE_CLOCK'].includes(value)){delete node.durationMs;node.cooldown={kind:value,maxWaitMs:60000,...(value==='FACTORY_QUEUE_CLOCK'?{buildingId:'',index:null}:value==='TRADE_LEG_END'?{cityId:null,mvToCityId:null}:{})};}else{delete node.cooldown;node.durationMs=1000;}wfRenderGraph();},['DURATION','FREE_RECRUIT','TRADE_LEG_END','FACTORY_QUEUE_CLOCK']);select.dataset.workflowWait='mode';
 if(mode!=='DURATION'){
   if(mode==='FREE_RECRUIT'){const target=wfField(card,'招募冷却目标',node.cooldown.recruit??'hero',value=>{if(!['hero','antique'].includes(value))throw Error('须明确英雄或古董招募冷却目标');if(value==='hero')delete node.cooldown.recruit;else node.cooldown.recruit=value;wfRenderGraph();},['hero','antique']);target.dataset.workflowWait='recruit';}
   wfWaitObservedTarget(card,node,mode);
   const limit=wfField(card,'最多等待毫秒（1–60000）',node.cooldown?.maxWaitMs??'',value=>{if(!/^[1-9][0-9]*$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)>60000)throw Error('请填写1–60000的明确整数等待上限');node.cooldown={...node.cooldown,maxWaitMs:Number(value)};wfRenderGraph();});limit.dataset.workflowWait='limit';
   if(mode==='FACTORY_QUEUE_CLOCK')for(const [key,label]of [['buildingId','精确工厂buildingId'],['index','精确队列idx（含0）']]){const input=wfField(card,label,node.cooldown[key]??'',value=>{if(key==='buildingId'){if(!value||value!==value.trim()||value.length>100)throw Error('须填写无首尾空格的精确buildingId');node.cooldown={...node.cooldown,buildingId:value};}else{if(!/^(0|[1-9][0-9]*)$/.test(value)||Number(value)>2147483647)throw Error('队列idx须为含0的int32整数');node.cooldown={...node.cooldown,index:Number(value)};}wfRenderGraph();});input.dataset.workflowWait=key;}
   if(mode==='TRADE_LEG_END')for(const [key,label]of [['cityId','当前港口 ID'],['mvToCityId','目的地港口 ID']]){const input=wfField(card,label,node.cooldown[key]??'',value=>{if(!/^[1-9][0-9]*$/.test(value)||!Number.isInteger(Number(value))||Number(value)>2147483647)throw Error('港口须为明确正int32整数');node.cooldown={...node.cooldown,[key]:Number(value)};wfRenderGraph();});input.dataset.workflowWait=key;}
   card.appendChild(gpEl('p',mode==='FACTORY_QUEUE_CLOCK'?'原生产Function的精确队列条目和可信时钟，保守下界计时并同目标独立复读；仅时钟到期，不证明生产完成、收取或到账，不解除拒绝或UNKNOWN，重启只读。':mode==='TRADE_LEG_END'?'原贸易Function两次Info及可信时钟，明确同航段到期复读；不证明到达、收益或交易资格，不解除拒绝或UNKNOWN，重启只读。':'英雄/古董目标沿原招募Function读取各自截止与可信时钟，不互相替代，使用保守下界计算等待。到期须同目标重新复读；超上限或失源停止。等待不证明资格、不授予招募、不解除拒绝或UNKNOWN，重启只读。'));
 }else{const duration=wfField(card,'等待毫秒',node.durationMs??1000,value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<0||n>60000)throw Error('等待时间无效');node.durationMs=n;wfRenderGraph();});duration.dataset.workflowWait='duration';}
 const live=wfEditorGuard(select);card.oninput=()=>{if(!live()||card.dataset.workflowWaitDraft==='true')return;card.dataset.workflowWaitDraft='true';wfChanged();$('wf-hint').textContent='等待目标或上限正在编辑；旧预览和授权已失效。字段完成编辑后按原合同应用；无效值须修正或放弃草稿。';};
 wfEditorButton(card,'放弃未应用等待草稿',()=>{wfRenderGraph();$('wf-hint').textContent='已放弃未应用等待草稿，保留原节点合同；旧预览和授权未恢复。';},()=>card.dataset.workflowWaitDraft==='true');
}
function wfRenderGraph(){ wfNodeDrag=null;wfEdgeDrag=null;wfNodeFormControls=[]; if(wfGraph.preparation)$('wf-unified-blocked').textContent='原声明入口：'+wfGraph.preparation.entry+'；编译未纳入步骤（仅审计）：'+gpJson(wfGraph.preparation.blocked)+(wfGraph.preparation.source?'；准备来源引用（仅审计）：'+gpJson(wfGraph.preparation.source):'');else $('wf-unified-blocked').textContent=''; $('wf-id').value=wfGraph.id||'';$('wf-name').value=wfGraph.name||'';const box=gpClear($('wf-nodes'));wfGraph.nodes.forEach((node,index)=>{const card=gpEl('article');card.appendChild(gpEl('h3','节点 '+(index+1)));wfNodeDragControls(card,node);wfEdgeDragControls(card,node);wfField(card,'ID',node.id,value=>{if(!value||wfGraph.nodes.some(other=>other!==node&&other.id===value))throw Error('节点 ID 必须唯一且非空');const old=node.id;node.id=value;for(const edge of wfGraph.edges){if(edge.from===old)edge.from=value;if(edge.to===old)edge.to=value;}wfRenderGraph();});wfField(card,'类型',node.type,value=>{wfGraph.nodes[index]={id:node.id,type:value};if(['SURVEY','ACTION','VERIFY'].includes(value))wfGraph.nodes[index].module='formation';if(value==='WAIT')wfGraph.nodes[index].durationMs=1000;wfRenderGraph();},wfTypes);if(['SURVEY','ACTION','VERIFY'].includes(node.type)){wfField(card,'玩法',node.module||'formation',value=>{if(value!==node.module)delete node.selection;node.module=value;wfCandidateCache.delete(node.id);wfRenderGraph();},WF_MODULES);if(['SURVEY','ACTION'].includes(node.type))wfParameterForm(card,node);}if(node.type==='ACTION')wfJsonField(card,'候选选择 selection：字符串或 {actionId}（由服务端验证）',node.selection,value=>{if(value===undefined)delete node.selection;else node.selection=value;});if(['SURVEY','ACTION'].includes(node.type))wfCandidateControls(card,node);if(['CONDITION','RULE','VERIFY'].includes(node.type))wfConditionForm(card,node);if(node.type==='WAIT')wfWaitForm(card,node);for(const [text,offset]of[['上移',-1],['下移',1]])wfEditorButton(card,text,()=>{const at=wfGraph.nodes.indexOf(node),other=at+offset;[wfGraph.nodes[at],wfGraph.nodes[other]]=[wfGraph.nodes[other],wfGraph.nodes[at]];wfChanged();wfRenderGraph();},()=>{const at=wfGraph.nodes.indexOf(node);return at>=0&&at+offset>=0&&at+offset<wfGraph.nodes.length;});wfEditorButton(card,'删除节点及相关连线',()=>{wfGraph.nodes.splice(wfGraph.nodes.indexOf(node),1);wfGraph.edges=wfGraph.edges.filter(edge=>edge.from!==node.id&&edge.to!==node.id);wfCandidateCache.delete(node.id);wfChanged();wfRenderGraph();},()=>wfGraph.nodes.includes(node));box.appendChild(card);});wfNodeDragEnd(box);const edges=gpClear($('wf-edges')),ids=wfGraph.nodes.map(node=>node.id);wfGraph.edges.forEach((edge,index)=>{const row=gpEl('div');wfField(row,'从',edge.from,value=>edge.from=value,ids);wfField(row,'到',edge.to,value=>edge.to=value,ids);wfField(row,'分支',edge.when||'ALWAYS',value=>{if(value==='ALWAYS')delete edge.when;else edge.when=value;},['ALWAYS','PASS','FAIL']);wfEditorButton(row,'删除连线',()=>{wfGraph.edges.splice(wfGraph.edges.indexOf(edge),1);wfChanged();wfRenderGraph();},()=>wfGraph.edges.includes(edge));edges.appendChild(row);});$('wf-json').value=gpJson(wfGraph);wfGraphBudgetRender();wfRunPolicyRender();wfDraw();}
function wfCandidateSignature(node){return gpJson({type:node.type,module:node.module,parameters:node.parameters||{}});}
function wfOrderProgressText(progress){const value=field=>field?.value??'未知';return '观察完成 '+value(progress?.completed)+' 单；已领奖阈值 '+value(progress?.rewardedThrough)+'；客户端上限投影 '+value(progress?.clientLimit)+'；差额投影 '+value(progress?.remainingProjection)+'（不是可执行额度）；周期标识和重置时间未知。';}
function wfOrderRefreshText(timing){if(timing?.status==='OBSERVED_NO_MARKER')return '本次观察无等待标记；资格仍须原执行链检查。';if(timing?.status==='PROJECTED_WAIT')return '据采集时服务器时间，预计还需 '+timing.remainingSeconds+' 秒；不代表免费刷新资格。';if(timing?.status==='ELAPSED_UNCONFIRMED')return '等待时点已过，需独立复读，资格未知。';return '等待标记或采集时服务器时间未知。';}
function wfDomainObservation(card,module,view){
 if(!view)return;const box=gpEl('div');box.dataset.workflowDomainObservation=module;
 if(module==='production'){
  box.appendChild(gpEl('h4','原生产Function配方与工厂观察'));gpAllianceTable(box,'工厂与队列',['工厂ID','类型','等级','状态','空闲位','本次队列'],(view.factories||[]).map(row=>[row.buildingId,row.type,row.level,row.reliable===true?row.status:'UNKNOWN',row.reliable===true?row.freeSlots:null,row.reliable===true?gpJson(row.queue):'UNKNOWN']));
  gpAllianceTable(box,'本厂原配方',['工厂ID','产品ID','解锁等级','原单份成本','原始秒数','委任调整秒数','范围'],(view.factories||[]).flatMap(factory=>(factory.recipes||[]).map(recipe=>[factory.buildingId,recipe.productId,recipe.unlockLevel,operationCosts(recipe.costs),recipe.produceTime,recipe.appointmentAdjustedSeconds,recipe.timingScope])));
  gpAllianceTable(box,'本次完整库存来源',['物品','持有数量'],view.stockReliable===true?(view.stock||[]).map(row=>[row.id,row.num]):[]);box.appendChild(gpEl('p','库存来源 '+(view.stockReliable===true?'已观察':'UNKNOWN')+'；配方和时间为原只读投影，不代表完成结算。材料包组合继续使用原准备入口及固定materialSource，不能在此删除来源约束。'));
 }else if(module==='fleet'){
  const world=view.worldScope;box.appendChild(gpEl('h4','原舰队Function当前视野观察'));box.appendChild(gpEl('p','城市视野 '+(world?.status??'UNKNOWN')+' · 中心 '+gpJson(world?.query?.screenCenter??null)+' · 来源时间 '+String(world?.sourceAt??'UNKNOWN')+'；仅覆盖本次WorldInfo响应，移动不代表攻击或占领。'));
  gpAllianceTable(box,'本次视野城市',['cityId','当前联盟索引'],(view.cities||[]).map(row=>[row.id,row.guildIdx]));gpAllianceTable(box,'原舰队来源',['buildingId','状态'],(view.fleets||[]).map(row=>[row.buildingId,row.state]));box.appendChild(gpEl('p','移动使用相同buildingId、cityId及显式screenCenter；参数变更后重新调查、预览和单次授权。货船与资源田保持原独立目标合同。'));
 }else if(module==='museum'){
  gpAllianceTable(box,'原人气成就可准备档位',['人气档位','原配置奖励','资源成本'],(view.achievementPreparation||[]).map(row=>[row.target.popularityThreshold,operationCosts(row.expectedState?.rewards),operationCosts(row.costs)]));
  const selection=view.explorationSelection;box.appendChild(gpEl('h4','原Museum目标与占用观察'));gpAllianceTable(box,'探险关卡',['stageId','观察状态','解锁','所需英雄人数'],(selection?.stages||[]).map(row=>[row.stageId,row.status,row.unlocked===true?'已解锁':row.unlocked===false?'未解锁':'UNKNOWN',row.requiredHeroCount]));gpAllianceTable(box,'探险英雄来源',['heroId','占用'],(selection?.heroes||[]).map(row=>[row.heroId,row.busy===true?'已占用':row.busy===false?'本次未占用':'UNKNOWN']));
  box.appendChild(gpEl('p','明确已解锁倍率 '+(Array.isArray(selection?.factors)?selection.factors.join('、'):'UNKNOWN')+' · 队伍上限 '+String(view.teamCount??'UNKNOWN')+' · 占用 '+String(view.occupiedTeams??'UNKNOWN')));
  gpAllianceTable(box,'原出发材料投影',['stageId','材料','所需','持有','缺口','含保留量缺口','状态'],(view.explorationMaterials?.stages||[]).flatMap(stage=>(stage.materials||[]).map(row=>[stage.stageId,row.id,row.required,row.have,row.missing,row.missingWithReserve,stage.status])));
  gpAllianceTable(box,'已观察展区',['exhibitionId','等级','关键词等级','展柜'],(view.exhibitionSelection?.exhibitions||[]).map(row=>[row.exhibitionId,row.level,gpJson(row.keywordLevels),gpJson(row.cases)]));box.appendChild(gpEl('p','人数、倍率、占用及缺口直接来自原Museum投影。参数需明确同一关卡/队伍/倍率或展区目标；观察不证明未来资格，探险出发不等同完成、结算或领奖。'));
 }else if(module==='heroes'){
  box.appendChild(gpEl('h4','原英雄Function成长与碎片观察'));gpAllianceTable(box,'原英雄目标',['heroId','等级','星级','技能槽等级（从1开始）','战力','专武等级','专武星级'],view.reliability?.heroes===true?(view.heroes||[]).map(row=>[row.heroId,row.level,row.star,Array.isArray(row.skillLevels)?gpJson(row.skillLevels):null,row.power,row.exclusive?.level,row.exclusive?.star]):[]);
  gpAllianceTable(box,'原碎片来源',['heroId','万能碎片','持有','专属碎片','持有'],(view.fragments||[]).map(row=>[row.heroId,row.sourceId,row.sourceNum,row.targetId,row.targetNum]));box.appendChild(gpEl('p','英雄来源 '+(view.reliability?.heroes===true?'已观察':'UNKNOWN')+'；完成基础成长、专武成长或明确数量兑换须使用同一原Function参数。碎片来源不授予隐式万能消耗。'));
 }else if(module==='equipment-growth'){
  box.appendChild(gpEl('h4','原装备Function实例观察'));gpAllianceTable(box,'本人佩戴装备',['heroId','精确UID','装备','等级','星级','精炼等级'],(view.heroes||[]).flatMap(hero=>(hero.equips||[]).map(row=>[hero.heroId,row.uid,row.equipId,row.level,row.star,row.refineLv])));gpAllianceTable(box,'原背包装备来源（穿戴资格以原候选为准）',['精确UID','装备','等级','星级','精炼等级'],(view.bag||[]).map(row=>[row.uid,row.equipId,row.level,row.star,row.refineLv]));
  box.appendChild(gpEl('p','UID保留原精确字符串。成长使用本人已佩戴实例，穿戴使用原闲置实例及原空槽候选；不替换、不转移，不把未知列表当空槽或零成本。'));
 }else if(module==='badge-growth'){
  box.appendChild(gpEl('h4','原徽章Function槽位与实例观察'));gpAllianceTable(box,'原英雄空槽来源',['heroId','原已解锁空槽'],(view.heroes||[]).map(row=>[row.heroId,Array.isArray(row.emptySlots)?gpJson(row.emptySlots):null]));gpAllianceTable(box,'本人佩戴徽章',['heroId','精确UID','徽章','等级','星级','槽位'],(view.heroes||[]).flatMap(hero=>(hero.badges||[]).map(row=>[hero.heroId,row.uid,row.badgeId,row.level,row.star,row.pos])));gpAllianceTable(box,'原闲置徽章来源',['精确UID','徽章','等级','星级'],(view.bag||[]).map(row=>[row.uid,row.badgeId,row.level,row.star]));
  box.appendChild(gpEl('p','仅原Function明确返回的emptySlots可用于穿戴；成长仍指向本人佩戴UID。缺字段不推空槽，任务和参数变化后须重新调查。'));
 }else if(module==='pet'){
  box.appendChild(gpEl('h4','原Pet建筑、在岗与培育批次观察'));gpAllianceTable(box,'原在岗来源',['buildingId','精确Pet UID'],(view.serving||[]).map(row=>[row.buildingId,row.uid]));gpAllianceTable(box,'原培育队列',['buildingId','队列idx（含0）','Pet','星级','开始时间原值','完成时间原值'],(view.rooms||[]).flatMap(room=>(room.queue?.breedQ||[]).map(row=>[room.buildingId,row.idx,row.petId,row.star,row.startTime,row.finishTime])));
  gpAllianceTable(box,'原普通培育条件（只读）',['Pet','原成本','原始秒数','赛季','库存','队列','原条件'],(view.breeding?.candidates||[]).map(row=>[row.petId,operationCosts(row.costs),row.breedTime,row.seasonAvailable,row.stockAvailable,row.queueAvailable,row.conditions]));box.appendChild(gpEl('p','升级使用原在岗buildingId/uid；投喂使用原buildingId/jobIdx，0为有效索引。每次只投喂一次，原减时 '+String(view.secondsReduced??'UNKNOWN')+' 秒；培育条件不证明可执行或结果可恢复，不开放培育/成熟领取。'));
 }else if(module==='equipment-forge'){
  box.appendChild(gpEl('h4','原Forge建筑、配方与队列观察'));gpAllianceTable(box,'原锻造厂',['buildingId','等级','本次原队列'],(view.forges||[]).map(row=>[row.buildingId,row.level,gpJson(row.queue)]));gpAllianceTable(box,'原配方',['makeId','类型','赛季','原成本','可能装备'],(view.recipes||[]).map(row=>[row.makeId,row.type,row.season,operationCosts(row.costs),gpJson(row.equipIds)]));
  box.appendChild(gpEl('p','当前赛季 '+String(view.season??'UNKNOWN')+'；制作与领取使用原建筑及队列合同，随机装备列表不代表本次结果。原组合expectedQueue及expectedEquipmentCounts约束须保留，不从本表重建队列身份。'));
 }else if(module==='formation-unlock'){
  box.appendChild(gpEl('h4','原阵型解锁Function图纸与模板观察'));gpAllianceTable(box,'原普通模板',['presetId','名称','已有图纸成本','观察解锁状态'],view.reliability?.catalog===true?(view.templates||[]).map(row=>[row.presetId,row.name,operationCosts(row.costs),view.reliability?.authority===true&&Array.isArray(view.unlockedPresetIds)?view.unlockedPresetIds.includes(row.presetId)?'已解锁':'未解锁':'UNKNOWN']):[]);
  box.appendChild(gpEl('p','图纸库存来源 '+(view.reliability?.inventory===true?'已观察':'UNKNOWN')+'；仅使用已有对应普通图纸，解锁成功不自动应用阵容。'));
 }else if(module==='antique-growth'){
  box.appendChild(gpEl('h4','原古董Function成长观察'));gpAllianceTable(box,'原藏品与碎片',['antiqueId','名称','品质','已持有','星级','专属碎片','数量','万能碎片','数量'],(view.antiques||[]).map(row=>[row.antiqueId,row.name,row.color,row.owned,row.star,row.fragmentId,row.fragments,row.universalItemId,row.universalFragments]));gpAllianceTable(box,'原套装来源',['suitId','名称','等级','已持有成员','所需成员','最高等级','已解锁等级'],(view.suits||[]).map(row=>[row.suitId,row.name,row.level,row.ownedMembers,row.requiredMembers,row.maximumLevel,row.unlockedLevel]));
  if(view.master)gpDetails(box,'原精通投影',view.master);box.appendChild(gpEl('p','只显示原古董Function解析结果；激活、升星、套装、精通与明确兑换分别使用原目标合同，不推定缺失资格或奖励。'));
 }else if(module==='trade'){
  box.appendChild(gpEl('h4','原海商王当前港口观察'));gpAllianceTable(box,'原货舱与余额',['周期','港口','船级','贸易币','已用容量','剩余容量','贸易时段'],[[view.period,view.cargo?.cityId,view.cargo?.cargoLv,view.balances?.coins,view.capacity?.used,view.capacity?.remaining,view.tradingHours?.status]]);
  gpAllianceTable(box,'当前港口原行情',['goodsId','名称','价格','stock原值'],(view.prices||[]).map(row=>[row.goodsId,row.name,row.price,row.stock]));gpAllianceTable(box,'原持有批次',['pid','goodsId','数量','买入单价','来源港口'],(view.holdings||[]).map(row=>[row.pid,row.goodsId,row.num,row.buyPrice,row.cityId]));gpAllianceTable(box,'原非亏损卖价投影',['pid','当前单价','预计总价','预计利润','状态'],(view.quotes||[]).map(row=>[row.pid,row.price,row.total,row.profit,row.reason??row.status]));
  gpAllianceTable(box,'原Radar目的地',['cityId'],(view.route?.destinations||[]).map(row=>[row.cityId]));box.appendChild(gpEl('p','当前航段 '+gpJson(view.cargo?{cityId:view.cargo.cityId,moveToCityId:view.cargo.moveToCityId,moveStartTime:view.cargo.moveStartTime,moveEndTime:view.cargo.moveEndTime}:null)+'；仅当前港口观察，未知不作零值。预计售得不是余额或父预算，不推定目的港报价、到达或收益。'));
 }else {box.appendChild(gpEl('h4','原Function本次调查'));gpDetails(box,'原领域观察与可靠性',view);}
 for(const note of view.notes||[])box.appendChild(gpEl('p',note));
 card.appendChild(box);
}
function wfCargoObservation(card,cargo){
 if(!cargo)return;
 const box=gpEl('div');box.dataset.workflowCargoObservation='true';box.appendChild(gpEl('h4','港口货船与缺货（本次原Function调查）'));box.appendChild(gpEl('p','来源 '+String(cargo.source??'UNKNOWN')+' · 货船 '+(cargo.reliable===true?'已观察':'未知或不完整')+' · 库存 '+(cargo.inventoryReliable===true?'已观察':'未知')+'。显示的奖励是原合同预期，尚未到账；缺口不增加预算或购买物品。'));
 gpAllianceTable(box,'原货船与航次',['船号（从1开始）','观察状态','到达时间原值','来源','领取阻断'],(cargo.ships||[]).map(ship=>[ship.shipIndex,ship.statusText,ship.arriveTime,ship.reliable===true?'已观察':'UNKNOWN',ship.claimReason]));
 gpAllianceTable(box,'原货格材料明细',['船号','货格（从1开始）','物品','所需','持有','缺口','装货记录','来源/阻断'],(cargo.ships||[]).flatMap(ship=>(ship.slots||[]).map(slot=>[ship.shipIndex,slot.cargoIndex,slot.id,slot.required,slot.have,slot.missing,slot.filled===true?'已装':slot.filled===false?'未装':'UNKNOWN',slot.reason??(slot.reliable===true?'已观察':'UNKNOWN')])));
 gpAllianceTable(box,'原合计材料缺口',['物品','需求','持有','缺口','来源'],(cargo.shortages||[]).map(row=>[row.id,row.required,row.have,row.missing,row.reliable===true?'已观察':'UNKNOWN']));
 box.appendChild(gpEl('p','本表只复用cargoShortageView，不根据库存或到达时间推定装货、领奖或结算成功；选择原候选后仍须重新计划与原授权。'));card.appendChild(box);
}
function wfCandidateControls(card,node){const cached=wfCandidateCache.get(node.id),valid=cached&&cached.signature===wfCandidateSignature(node),busy=Boolean(wfPending||wfData?.status?.running),load=wfEditorButton(card,'只读采集候选',()=>wfFetchCandidates(node,card),()=>Boolean(card.dataset.workflowParameterDraft!=='true'&&snapshot?.connected&&gameplayCsrfToken()&&wfGraph.nodes.includes(node)));load.dataset.workflowCandidate=node.id;if(!valid)return;wfDomainObservation(card,node.module,cached.domainView);if(node.module==='fleet')wfCargoObservation(card,cached.cargo);if(node.module==='orders')card.appendChild(gpEl('p',wfOrderProgressText(cached.progress)));if(node.type==='SURVEY'){card.appendChild(gpEl('p','本节点仅调查原Function；本次观察不会保存动作选择、生成写计划或授权。后续写入须独立ACTION重新调查。'));return;}const select=gpEl('select'),empty=gpEl('option','请选择本账号的具体候选');empty.value='';select.appendChild(empty);const currentSelection=typeof node.selection==='string'?node.selection:node.selection?.actionId;for(const row of cached.rows){const option=gpEl('option',(row.label||row.actionType||row.actionId)+' · '+operationCosts(row.costs)+(gpBlocked(row)?' · 禁止执行：'+(row.blockedReason||row.reason||'未验证'):''));option.value=row.actionId;option.disabled=gpBlocked(row);select.appendChild(option);}select.value=currentSelection||'';const live=wfEditorGuard(select),sync=()=>{select.disabled=!wfEditorEditable();};wfNodeFormControls.push(sync);sync();select.dataset.workflowSelection=node.id;select.onchange=()=>{if(!live()||wfCandidateCache.get(node.id)!==cached)return;const row=cached.rows.find(row=>row.actionId===select.value);if(!row||gpBlocked(row))return;const parameters=row.parameters;if(parameters&&typeof parameters==='object'&&!Array.isArray(parameters)&&gpJson(parameters)!==gpJson(node.parameters||{})){node.parameters=JSON.parse(JSON.stringify(parameters));delete node.selection;wfCandidateCache.delete(node.id);wfChanged();wfRenderGraph();$('wf-hint').textContent='已同步原Function候选的精确目标参数；旧选择和预览已失效。请重新只读采集，再选择具体候选。';return;}node.selection=row.actionId;wfChanged();wfRenderGraph();};card.appendChild(select);for(const row of cached.rows){const summary=gpEl('p',(row.label||row.actionType||row.actionId)+' · 成本：'+operationCosts(row.costs)+' · 来源：'+(row.costSource||'未知')+(gpBlocked(row)?' · 阻塞：'+(row.blockedReason||row.reason||'未验证'):''));card.appendChild(summary);gpDetails(card,'候选精确业务目标',row.target);const observedOrder=node.module==='orders'?cached.orders?.find(order=>order.actionId===row.actionId):null;const wait=observedOrder?.productionWait;if(node.module==='orders')card.appendChild(gpEl('p','订单等待：'+wfOrderRefreshText(observedOrder?.refreshTiming)));if(wait){const label=wait.status==='IN_STOCK'?'现有库存已覆盖，无需新增生产':wait.status==='PROJECTED'?wait.leadSeconds+' 秒（至预计生产完成，尚须收取）':'未知 · '+(wait.reason||'来源不完整');card.appendChild(gpEl('p','生产等待估计：'+label+'；仅本次调查投影，不代表当前到账、最短工期或免费刷新资格。'));const detail=gpEl('details');detail.appendChild(gpEl('summary','本次调查的生产等待来源'));detail.appendChild(gpEl('pre',gpJson(wait)));card.appendChild(detail);}}if(!cached.rows.length)card.appendChild(gpEl('p','当前没有候选；检查模块开关、业务参数和事实缺口。'));}
async function wfFetchCandidates(node,card){if(card?.dataset.workflowParameterDraft==='true'||wfPending||wfData?.status?.running||!current||!snapshot?.connected||!gameplayCsrfToken()||!wfGraph.nodes.includes(node)||!['SURVEY','ACTION'].includes(node.type))return;const scope=viewGuard.begin('workflow-candidate-'+node.id),revision=gpRevision,edit=wfEdit,signature=wfCandidateSignature(node),module=node.module,parameters=JSON.parse(JSON.stringify(node.parameters||{}));$('wf-hint').textContent='正在只读采集 '+module+' 候选；不会授权或执行。';try{const data=await operationMutation('/api/gameplay/survey',{module,parameters},scope);if(!gpSafe(scope,revision)||edit!==wfEdit||!wfGraph.nodes.includes(node)||signature!==wfCandidateSignature(node))return;if(data.accountId!==scope.account||data.module!==module)throw Error('候选账号或模块不匹配');wfCandidateCache.set(node.id,{signature,rows:data.view?.candidates||[],orders:module==='orders'?data.view?.orders||[]:[],progress:module==='orders'?data.view?.progress:null,cargo:module==='fleet'?data.view?.cargo??null:null,domainView:data.view??null});wfRenderGraph();$('wf-hint').textContent='采集完成；请选择具体候选，保存图后再开始流程。';}catch(error){if(gpSafe(scope,revision)&&edit===wfEdit)$('wf-hint').textContent='候选采集失败：'+error.message;}}
function wfDraw(){if(typeof document.createElementNS!=='function')return;const svg=gpClear($('wf-canvas')),height=Math.max(120,Math.ceil(wfGraph.nodes.length/4)*100);svg.setAttribute('viewBox','0 0 800 '+height);const positions=new Map(wfGraph.nodes.map((node,index)=>[node.id,{x:20+index%4*200,y:20+Math.floor(index/4)*100}]));const create=(tag,attrs,text)=>{const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,String(value));if(text!==undefined)el.textContent=String(text);svg.appendChild(el);return el;};for(const edge of wfGraph.edges){const a=positions.get(edge.from),b=positions.get(edge.to);if(!a||!b)continue;create('line',{x1:a.x+150,y1:a.y+24,x2:b.x,y2:b.y+24,stroke:'#7c8695','stroke-width':2});create('text',{x:(a.x+b.x+150)/2,y:(a.y+b.y)/2+15,fill:'#e0bd6a','font-size':11},edge.when||'→');}for(const node of wfGraph.nodes){const p=positions.get(node.id);create('rect',{x:p.x,y:p.y,width:150,height:48,rx:6,fill:'#21252c',stroke:'#7c8695'});create('text',{x:p.x+8,y:p.y+19,fill:'#d5dae1','font-size':12},node.id);create('text',{x:p.x+8,y:p.y+37,fill:'#9ca6b5','font-size':11},node.type+(node.module?' · '+node.module:''));}}
function wfAcceptGraph(graph){if(!graph||graph.version!==1||typeof graph.id!=='string'||typeof graph.name!=='string'||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges)||graph.nodes.length>50||graph.edges.length>100)throw Error('图需要 version:1、id、name、nodes 和 edges；最多50节点100连线');wfCandidateCache.clear();wfGraph=JSON.parse(JSON.stringify(graph));wfChanged();wfRenderGraph();}
function wfRender(data,scope){gpTokenFrom(data,scope);if(Array.isArray(data.history)&&!wfHistoryReference)wfHistoryList(data.history);wfData={...wfData,...data};const status=data.status||wfData.status||{};$('wf-status').textContent=gpJson(status);if(data.graphs||data.examples){wfList=[...(data.graphs||[]),...(data.examples||[])].map(row=>row.graph||row);const select=gpClear($('wf-saved'));for(const graph of wfList){const option=gpEl('option',graph.name||graph.id);option.value=graph.id;select.appendChild(option);}}const pending=data.pendingPlan||data.plan||status.pendingPlan||status.plan;if(!pending&&!['AWAITING_AUTHORIZATION','AWAITING_VERIFICATION'].includes((status.status??status.state))){wfPlan=null;gpClear($('wf-plan'));}if(pending?.actions?.length){if(pending.accountId!==current)throw Error('流程 ACTION 计划账号不匹配');wfPlan=pending;gpRenderPlan($('wf-plan'),pending);$('wf-hint').textContent='流程已在 ACTION 暂停，等待以上具体计划的授权。';}wfControls();}
async function refreshWorkflows(){if(!current||wfPending)return;if(wfHistoryReference)wfHistoryChanged();const scope=viewGuard.begin('workflow'),revision=gpRevision;wfPending=true;wfControls();try{const data=await call('/api/workflows',undefined,scope);if(gpSafe(scope,revision))wfRender(data,scope);}catch(error){if(gpSafe(scope,revision)){$('wf-hint').textContent='读取失败：'+error.message;if(!wfHistoryReference)wfHistoryReset();wfData=null;wfPlan=null;gpClear($('wf-plan'));}}finally{if(gpSafe(scope,revision)){wfPending=false;wfControls();}}}
async function wfMutation(action){if(wfPending||!wfData||!gameplayCsrfToken())return;const scope=viewGuard.begin('workflow'),revision=gpRevision,edit=wfEdit;wfPending=true;wfControls();wfRenderGraph();try{const data=await operationMutation('/api/workflows/'+action,['resume','stop'].includes(action)?{}:{graph:wfGraph},scope);if(!gpSafe(scope,revision)||edit!==wfEdit)return;wfRender(data,scope);$('wf-result').textContent=gpJson(data.simulation||data.result||data);if(!wfPlan)$('wf-hint').textContent={save:'图已保存。',simulate:'模拟完成，没有执行游戏写操作。',start:'流程已启动；ACTION 等待具体授权。',resume:'已请求验证历史并继续。',stop:'已停止后续流程。'}[action];}catch(error){if(gpSafe(scope,revision))$('wf-hint').textContent='流程停止：'+error.message;}finally{if(gpSafe(scope,revision)){wfPending=false;wfRenderGraph();wfControls();}}}
function wfOpenUnified(entry){
 if(!current||wfPending||wfData?.status?.running)return;
 const field=$('wf-unified-intent'),existing=field.value.trim().length>0;
 if(!existing){const intent={entry,tasks:[],dailies:entry==='tasks'?[]:[{taskId:1002},{taskId:1006},{taskId:1009}],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}};field.value=gpJson(intent);}
 try{if(existing)wfUnifiedData();else wfUnifiedRender();$('wf-unified-blocked').textContent=existing?'已保留原声明、步骤、预算和运行边界；如需切换入口，请在原表单明确应用。':entry==='tasks'?'请填写要领取的精确 kind 和 taskId，再生成预览。':'请填写累计预算和业务选择，再生成预览。';}
 catch(error){$('wf-unified-blocked').textContent='原声明已保留，请修正后再加载：'+error.message;}
 for(const section of document.querySelectorAll('main > section'))section.classList.toggle('hidden',section.id!=='tab-workflow');
 for(const button of document.querySelectorAll('nav button'))button.classList.toggle('on',button.dataset.tab==='workflow');
 return refreshWorkflows();
}
async function wfPrepareUnified(){if(wfPending||!current||!gameplayCsrfToken()||wfData?.status?.running)return;const scope=viewGuard.begin('workflow-unified'),revision=gpRevision,edit=wfEdit,source=$('wf-unified-intent').value;wfPending=true;wfControls();try{const data=await operationMutation('/api/workflows/prepare',JSON.parse(source),scope);if(!gpSafe(scope,revision)||edit!==wfEdit||source!==$('wf-unified-intent').value)return;if(data.accountId!==current)throw Error('统一流程账号不匹配');$('wf-unified-blocked').textContent=gpJson(data.blocked||[]);if(!data.graph){$('wf-hint').textContent='没有可执行节点；请补全精确选择，缺证项见上方。';return;}wfAcceptGraph(data.graph);$('wf-hint').textContent='统一流程已生成，检查图与累计预算后保存、模拟或开始；每个动作仍单独授权。';}catch(error){if(gpSafe(scope,revision))$('wf-hint').textContent='统一流程准备失败：'+error.message;}finally{if(gpSafe(scope,revision)){wfPending=false;wfControls();}}}
for(const entry of ['tasks','dailies','loop'])$(entry+'-unified').onclick=()=>wfOpenUnified(entry);
$('wf-unified-prepare').onclick=wfPrepareUnified;
$('wf-load').onclick=refreshWorkflows;$('wf-open').onclick=()=>{if(!wfEditorEditable())return;try{const graph=wfList.find(row=>row.id===$('wf-saved').value);if(!graph)throw Error('请选择已保存的图');wfAcceptGraph(graph);}catch(error){$('wf-hint').textContent=error.message;}};for(const action of ['save','simulate','start','resume','stop'])$('wf-'+action).onclick=()=>{if(!$('wf-'+action).disabled)return wfMutation(action);};$('wf-id').oninput=()=>{if(!wfEditorEditable())return;wfGraph.id=$('wf-id').value;wfChanged();};$('wf-name').oninput=()=>{if(!wfEditorEditable())return;wfGraph.name=$('wf-name').value;wfChanged();};$('wf-add').onclick=()=>{if(!wfEditorEditable())return;let sequence=wfGraph.nodes.length+1,id;do{id='node-'+sequence++;}while(wfGraph.nodes.some(node=>node.id===id));wfGraph.nodes.push({id:id,type:'SURVEY',module:'formation',parameters:{}});wfChanged();wfRenderGraph();};$('wf-add-edge').onclick=()=>{if(!wfEditorEditable()||wfGraph.nodes.length<2)return;wfGraph.edges.push({from:wfGraph.nodes[0].id,to:wfGraph.nodes[wfGraph.nodes.length-1].id});wfChanged();wfRenderGraph();};$('wf-json-apply').onclick=()=>{if(!wfEditorEditable())return;try{wfAcceptGraph(gpParse('wf-json'));}catch(error){$('wf-hint').textContent=error.message;}};$('wf-authorize').onclick=()=>gpAuthorize(null,wfPlan,'workflow');
function gameplayPoll(tab){if(tab==='workflow'&&wfHistoryReference)return;if(tab==='workflow'||wfData?.status?.running)return refreshWorkflows();if(GP_MODULES.includes(tab))return refreshGameplay(tab);const running=GP_MODULES.find(id=>gpGet(id).data?.status?.running);if(running)return refreshGameplay(running);}
function wfSetting(id){return wfSettings[id]||(wfSettings[id]={config:null,scope:null});}
function wfSettingReady(id){const setting=wfSetting(id);return Boolean(current&&setting.config&&setting.scope&&viewGuard.current(setting.scope)&&gameplayCsrfToken());}
function wfSettingsControls(){for(const id of Object.keys(WF_SETTING_NAMES)){const ready=wfSettingReady(id),locked=wfPending||Boolean(snapshot?.busy)||wfData?.status?.running===true;$('wf-'+id+'-load').disabled=!current||wfPending;$('wf-'+id+'-enabled').disabled=!ready||locked;$('wf-'+id+'-save').disabled=!ready||locked;$('wf-'+id+'-default').disabled=!ready||locked||wfData?.status?.blocked===true||!wfSetting(id).defaults;}}
function wfResetSettings(){for(const id of Object.keys(WF_SETTING_NAMES)){delete wfSettings[id];$('wf-'+id+'-enabled').checked=false;$('wf-'+id+'-enabled').disabled=true;$('wf-'+id+'-save').disabled=true;$('wf-'+id+'-default').disabled=true;$('wf-'+id+'-source').textContent='';$('wf-'+id+'-hint').textContent='';}}
function wfSettingSource(id,data){$('wf-'+id+'-source').textContent='当前账号：'+current+' · '+(data.source==='account'?'账号独立配置':data.source==='default'?'安全默认配置（尚未保存账号覆盖）':'配置来源未知');}
function wfRestoreDefaults(id){const setting=wfSetting(id);if($('wf-'+id+'-default').disabled||!wfSettingReady(id)||wfPending||snapshot?.busy||wfData?.status?.running===true||wfData?.status?.blocked===true||!setting.defaults)return;$('wf-'+id+'-enabled').checked=setting.defaults.enabled;wfInvalidateSettingPlans();$('wf-'+id+'-hint').textContent='安全默认开关已复制到草稿；保存后仅修改本账号，须重新采集候选和授权。';}
function wfSettingConfig(data,id,scope){if(data.accountId!==scope.account||data.module!==id)throw Error('节点配置账号或模块不匹配');const config=data.config;if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).some(key=>key!=='enabled')||typeof config.enabled!=='boolean')throw Error('节点配置缺少可靠 enabled 开关');return {enabled:config.enabled};}
function wfInvalidateSettingPlans(){wfEdit++;wfPlan=null;gpClear($('wf-plan'));wfCandidateCache.clear();wfRenderGraph();wfControls();}
async function wfLoadSetting(id){if(!current||wfPending)return;const scope=viewGuard.begin('workflow-setting-'+id),revision=gpRevision,setting=wfSetting(id);setting.config=null;setting.scope=null;setting.defaults=null;$('wf-'+id+'-source').textContent='';wfPending=true;wfControls();try{const data=await call('/api/gameplay?module='+encodeURIComponent(id),undefined,scope);if(!gpSafe(scope,revision))return;const config=wfSettingConfig(data,id,scope);gpTokenFrom(data,scope);const defaults=gpMetadataDefaults(data,id);setting.defaults=defaults&&Object.keys(defaults).length===1?{enabled:defaults.enabled}:null;wfSettingSource(id,data);setting.config=config;setting.scope=viewGuard.capture();$('wf-'+id+'-enabled').checked=config.enabled;$('wf-'+id+'-hint').textContent='已读取本账号'+WF_SETTING_NAMES[id]+'节点配置；写操作仍需具体计划和单次授权。';}catch(error){if(gpSafe(scope,revision)){$('wf-'+id+'-enabled').checked=false;$('wf-'+id+'-hint').textContent='读取失败：'+error.message;}}finally{if(gpSafe(scope,revision)){wfPending=false;wfControls();}}}
async function wfSaveSetting(id){if(wfPending||!wfSettingReady(id)||snapshot?.busy||wfData?.status?.running===true)return;const scope=viewGuard.begin('workflow-setting-'+id),revision=gpRevision,setting=wfSetting(id),config={enabled:$('wf-'+id+'-enabled').checked===true};wfInvalidateSettingPlans();wfPending=true;wfControls();try{const data=await operationMutation('/api/gameplay/config',{module:id,config},scope);if(!gpSafe(scope,revision))return;setting.config=wfSettingConfig(data,id,scope);wfSettingSource(id,data);setting.scope=viewGuard.capture();$('wf-'+id+'-enabled').checked=setting.config.enabled;$('wf-'+id+'-hint').textContent='本账号'+WF_SETTING_NAMES[id]+'节点配置已保存；请重新采集候选和生成具体计划。';}catch(error){if(gpSafe(scope,revision)){setting.config=null;setting.scope=null;$('wf-'+id+'-hint').textContent='保存失败：'+error.message+'；请重新读取本账号配置。';}}finally{if(gpSafe(scope,revision)){wfPending=false;wfControls();}}}
for(const id of Object.keys(WF_SETTING_NAMES)){$('wf-'+id+'-default').onclick=()=>wfRestoreDefaults(id);$('wf-'+id+'-load').onclick=()=>wfLoadSetting(id);$('wf-'+id+'-save').onclick=()=>wfSaveSetting(id);$('wf-'+id+'-enabled').onchange=()=>{if(!wfSettingReady(id)||wfPending)return;wfInvalidateSettingPlans();$('wf-'+id+'-hint').textContent='本账号开关尚未保存；保存后请重新采集候选。';};}
function addResidentOrderTaskDeclaration(actionId) {
 if(!/^orders:SUBMIT:[a-f0-9]{64}$/.test(actionId))throw Error('须填写当前居民订单SUBMIT候选完整actionId');
 if(!wfUnifiedEditable())throw Error('当前工作流草稿不可编辑');
 const source=$('wf-unified-intent').value;
 const intent=source.trim()?wfUnifiedData():{entry:'tasks',tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}};
 if(!['tasks','loop'].includes(intent.entry))throw Error('请先将声明入口改为Tasks或Loop');
 if(intent.tasks.length>=48)throw Error('Tasks步骤已达48项上限');
 intent.tasks.push({kind:'resident-order',actionId});
 wfInvalidateSettingPlans();
 $('wf-unified-intent').value=gpJson(intent);wfUnifiedRender();wfControls();
 $('wf-unified-form-hint').textContent='已加入明确居民订单。请核对累计材料预算，运行时仍须逐单确认。';
}

function addStageTaskDeclaration(parameters){
 if(!wfUnifiedEditable())throw Error('当前工作流不可编辑');
 const intent=$('wf-unified-intent').value.trim()?wfUnifiedData():{entry:'tasks',tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}};
 if(!['tasks','loop'].includes(intent.entry))throw Error('请先将声明入口改为Tasks或Loop；原步骤保留');
 if(intent.tasks.length>=48)throw Error('Tasks步骤已达48项上限');
 intent.tasks.push({kind:'stage',parameters:JSON.parse(JSON.stringify(parameters))});wfInvalidateSettingPlans();
 $('wf-unified-intent').value=gpJson(intent);wfUnifiedRender();wfControls();
 $('wf-unified-form-hint').textContent='已加入明确有限主线配置；原步骤及累计预算保留，每项仍须新调查、单次授权和逐场验证。';
}
function captureStageRecommendationEditor(){
 const edit=wfEdit,graph=wfGraph;
 const current=()=>wfEditorEditable()&&wfEdit===edit&&wfGraph===graph;
 return {current,accept(value){if(!current())throw Error('工作流编辑状态已变化，请重新准备');wfAcceptGraph(value);}};
}
Object.assign(globalThis,{addStageTaskDeclaration,stageTaskDeclarationEditable:wfUnifiedEditable,captureStageRecommendationEditor,stageRecommendationEditable:wfEditorEditable,resetGameplay,gameplayCsrfToken,refreshGameplay,refreshWorkflows,readWorkflowHistoryEvidence,gameplayActivate,gameplayPoll,addResidentOrderTaskDeclaration});
resetGameplay();

}
export const GAMEPLAY_SCRIPT = "(" + gameplayClient.toString() + ")(" + JSON.stringify(WORKFLOW_CONDITION_FIELDS) + "," + JSON.stringify(Object.fromEntries(Object.entries(FUNCTION_CONTRACTS).map(([id,c])=>[id,c.inputSchema]))) + "," + JSON.stringify(RUN_BUDGET_LIMITS) + "," + JSON.stringify(NAVAL_RULE_CONTRACT) + "," + moduleConfigNumberValid.toString() + "," + JSON.stringify(WORKFLOW_LIMITS) + "," + validateWorkflowReasonAuditView.toString() + "," + JSON.stringify(RESOURCE_NAMES) + ");";
