import { NAVAL_RULE_CONTRACT, moduleConfigNumberValid } from './gameplay-settings.mjs';
import { RUN_BUDGET_LIMITS } from './resource-ledger.mjs';
import { FUNCTION_CONTRACTS } from './function-contracts.mjs';
import { WORKFLOW_CONDITION_FIELDS, WORKFLOW_LIMITS } from './workflow.mjs';
const workflowCoreHtml = Object.entries({ orders: '居民订单', city: '城市建设', production: '工厂生产' }).map(([id, name]) => '<details><summary>本账号' + name + '节点开关（默认关闭）</summary><button id="wf-' + id + '-load">读取' + name + '节点配置</button><label><input id="wf-' + id + '-enabled" type="checkbox" disabled>允许工作流生成' + name + '节点计划</label><button id="wf-' + id + '-save" disabled>保存' + name + '节点配置</button><p id="wf-' + id + '-hint" role="status"></p></details>').join('');
const gameplayNames = { mail: '邮件', formation: '阵容与战报', alliance: '联盟与互助', museum: '博物馆', treasure: '世界寻宝', fleet: '舰队与货船', naval: '海战规则', 'pirate-sweep': '海面扫荡' };
const gameplaySection = ([id, name]) => '<section id="tab-' + id + '" class="hidden"><h2>' + name + '</h2><p class="dim">本账号独立配置。读取缓存后可显式探测；仅选中的具体动作进入现有批次授权。</p><div class="toolbar"><button id="gp-' + id + '-load">读取缓存</button><button id="gp-' + id + '-survey" disabled>只读探测</button><button id="gp-' + id + '-unified-survey" disabled>加入 Loop 只读调查</button><button id="gp-' + id + '-history">执行历史</button><button id="gp-' + id + '-stop" disabled>停止后续操作</button></div><p id="gp-' + id + '-hint" role="status"></p><pre id="gp-' + id + '-status">尚未读取本账号状态</pre><details><summary>本账号玩法配置（默认禁用）</summary><div id="gp-' + id + '-config-fields"></div><label>完整配置 JSON<textarea id="gp-' + id + '-config" rows="6">{}</textarea></label><button id="gp-' + id + '-config-save" disabled>保存本账号配置</button></details>' + (id === 'formation' ? '<div class="card"><h3>阵容编辑</h3><label>模式 <select id="gp-formation-mode"><option value="mainline">主线</option><option value="expedition">远征</option></select></label><label>远征 raidId <input id="gp-formation-raid" type="number" min="1" step="1"></label><button id="gp-formation-mode-prepare">使用模式参数</button><p class="dim">模板表示布局；宠物 UID 始终由当前阵容保留。恢复也是新的具体计划。</p><label>布局模板 <select id="gp-formation-template"></select></label><div id="gp-formation-layout" aria-live="polite">尚未读取模板布局</div><div id="gp-formation-roster"></div><button id="gp-formation-career">生成职业排序参数</button><button id="gp-formation-manual">使用手动站位参数</button><button id="gp-formation-restore" disabled>加载旧阵容恢复参数</button><details><summary>复制主线极限通关站位</summary><p>读取当前关卡的服务器极限记录，选择具体战报并核对英雄和布局。保留本账号当前宠物；准备后仍需探测、预览和授权。</p><button id="ex-survey" disabled>读取当前关卡极限记录</button><select id="ex-selected" disabled></select><button id="ex-prepare" disabled>核对来源并加载站位参数</button><p id="ex-hint" role="status"></p><pre id="ex-detail"></pre></details><details><summary>本账号具名完整队伍</summary><p>存档包含主线布局、英雄站位和明确宠物 UID。应用后需重新探测、预览和授权。</p><button id="nf-load">读取本地队伍</button><select id="nf-selected"></select><label>队伍名称<input id="nf-name" maxlength="80"></label><button id="nf-save" disabled>从当前权威阵容新建</button><button id="nf-rename" disabled>重命名所选版本</button><button id="nf-overwrite" disabled>用当前阵容覆盖所选版本</button><button id="nf-delete" disabled>删除所选版本</button><button id="nf-prepare" disabled>验证并加载应用参数</button><p id="nf-hint" role="status"></p><pre id="nf-detail"></pre></details></div>' : '') + (id==='museum'?'<div class="card"><h3>古董属性总览</h3><p>单独读取全局、阵营、职业属性和特殊效果。查询无需启用养成操作。</p><button id="antique-summary-read" disabled>只读查询古董属性</button><p id="antique-summary-hint" role="status"></p><div id="antique-summary-view"></div></div>':'') + (id==='naval'?'<div id="gp-naval-rules"></div><div id="gp-naval-observations"></div>':'') + (id==='treasure'?'<div id="gp-treasure-targets"></div>':'') + (id==='fleet'?'<div id="gp-fleet-operations"></div><div id="gp-fleet-formations"></div><div id="gp-fleet-cargo"></div>':'') + '<label>业务参数 JSON<textarea id="gp-' + id + '-parameters" rows="5">{}</textarea></label><p class="dim">修改参数后请重新探测。参数只表示业务选择，不接受任意协议请求。</p><div id="gp-' + id + '-facts"></div><h3>候选动作</h3><div id="gp-' + id + '-candidates">尚未探测</div><button id="gp-' + id + '-plan" disabled>预览选中的具体动作</button><div id="gp-' + id + '-plan-view"></div><button id="gp-' + id + '-authorize" disabled>确认并授权执行此预览</button></section>';
export const CORE_GAMEPLAY_HTML = Object.fromEntries([['material-packs','持有材料包兑换'],['heroes','英雄成长'],['production','生产规划与执行'],['farm','农田种植'],['equipment-forge','装备制造与收取'],['formation-unlock','普通阵型图纸解锁'],['equipment-growth','装备成长与穿戴'],['badge-growth','徽章成长与穿戴'],['antique-growth','藏品养成与碎片兑换'],['task-rewards','任务与日活跃奖励'],['afk-level-rewards','挂机等级奖励'],['free-gold','普通免费点金'],['free-recruit','免费英雄招募'],['trial-challenge','英雄经验试炼首通'],['pet','海兽培育与投喂']].map(entry=>[entry[0],gameplaySection(entry).replace('id="tab-'+entry[0]+'" class="hidden"','id="gp-'+entry[0]+'-section"')]));
const executionBudgetFieldsHtml = prefix => "<h4>累计预算上限</h4><div class=\"bar\"><label>预算类别<select id=\"wf-unified-budget-kind\"><option value=\"resources\">资源</option><option value=\"quotas\">配额</option><option value=\"uids\">具体目标</option></select></label><label>ID<input id=\"wf-unified-budget-id\" type=\"text\"></label><label>数量<input id=\"wf-unified-budget-num\" type=\"text\" inputmode=\"numeric\"></label><label>具体目标类型<input id=\"wf-unified-budget-type\" type=\"text\"></label><button id=\"wf-unified-budget-add\" type=\"button\">添加预算上限</button></div><div id=\"wf-unified-budget-rows\"></div>".replaceAll('wf-unified',prefix);
const unifiedExecutionFormHtml = "<div class=\"card\"><h3>统一执行声明</h3><p>先选择业务步骤和明确目标，再填写累计预算上限。表单只编辑声明；预算不证明资格，预期收益不会自动增加额度。</p><div class=\"bar\"><label>入口<select id=\"wf-unified-entry\"><option value=\"tasks\">Tasks 领奖</option><option value=\"dailies\">Dailies 日常</option><option value=\"loop\">Loop 有限循环</option></select></label><label>轮次<input id=\"wf-unified-rounds\" type=\"number\" min=\"1\" max=\"48\" step=\"1\" value=\"1\"></label><label>轮间隔（毫秒）<input id=\"wf-unified-every\" type=\"number\" min=\"0\" max=\"60000\" step=\"1\" value=\"0\"></label><button id=\"wf-unified-limits\" type=\"button\">使用入口与轮次</button></div><div class=\"bar\"><label>步骤分组<select id=\"wf-unified-phase\"><option value=\"tasks\">任务领奖</option><option value=\"dailies\">日常</option></select></label><label>业务<select id=\"wf-unified-kind\"></select></label><label><span id=\"wf-unified-target-label\">精确任务 ID</span><input id=\"wf-unified-target\" type=\"text\" inputmode=\"numeric\"></label><label>邮件来源页（含0）<input id=\"wf-unified-mail-page\" type=\"text\" inputmode=\"numeric\" disabled></label><label>周芯片当前轮次<input id=\"wf-unified-chip-round\" type=\"text\" inputmode=\"numeric\" disabled></label><label>探险英雄 ID（每行一个）<textarea id=\"wf-unified-museum-heroes\" rows=\"3\" disabled></textarea></label><label>探险时间倍率<input id=\"wf-unified-museum-factor\" type=\"text\" inputmode=\"numeric\" disabled></label><button id=\"wf-unified-add\" type=\"button\">添加业务步骤</button></div><div id=\"wf-unified-steps\"></div>" + executionBudgetFieldsHtml('wf-unified') + "<p id=\"wf-unified-form-hint\" role=\"status\"></p><button id=\"wf-unified-form-load\" type=\"button\">从高级声明读取表单</button><p>可选运行边界沿用下方当前图配置，复制后须核对允许玩法覆盖本声明全部步骤。声明修改不会扩大原累计预算；每批仍单独授权。</p><button id=\"wf-unified-policy-copy\" type=\"button\">复制当前图运行边界到声明</button><button id=\"wf-unified-policy-remove\" type=\"button\">移除声明运行边界</button><p id=\"wf-unified-policy-summary\" role=\"status\"></p></div>";
export const GAMEPLAY_HTML = Object.entries(gameplayNames).map(entry=>entry[0]==='formation'?gameplaySection(entry).replace('</section>',CORE_GAMEPLAY_HTML['formation-unlock']+'</section>'):entry[0]==='museum'?gameplaySection(entry).replace('</section>',CORE_GAMEPLAY_HTML['antique-growth']+'</section>'):gameplaySection(entry)).join('') + String.raw`<section id="tab-workflow" class="hidden"><h2>工作流</h2><details open><summary>Tasks / Dailies / Loop 统一执行</summary><p>填写精确任务 ID、日常任务 ID 和累计预算。Loop 按任务、日常、海面顺序有限运行，每个动作都重新展示具体计划并单独授权。轮间隔仅是本次运行的等待，不代表游戏冷却或日界，重启后不会继续。没有可执行候选的节点记为阻塞；UNKNOWN 停止后续执行。</p>${unifiedExecutionFormHtml}<details><summary>高级业务声明 JSON</summary><p>任务格式：tasks:[{kind:"main" 或 "branch" 或 "achievement" 或 "daily",taskId:精确ID}]；精确邮件使用 tasks:[{kind:"mail",pageNo:明确来源页,emailId:"精确正int64",action:"claim" 或 "read"}]，每项复用原单封合同，枚举不自动生成领取声明；挂机单档奖励使用 tasks:[{kind:"afk-level-reward",level:明确等级}]，按配置下一档重新核实资格，时段收益和升级保持独立；日常支持1002招募、1003有限主线（parameters.config 必须明确有限次数或终点，沿用主线授权与胜负合同，不自动领取日常奖励）、1006免费点金、1009经验试炼、1010海面扫荡（parameters.uid 必填）、1016博物馆出发（parameters.stageId/heroIds/factor 必填，只出发，不含结算、加速或领奖）。dailies 中省略 action 或 action:"perform" 完成任务，action:"claim" 只按 taskId 领取该任务奖励（不接受驱动 parameters），重新探测后逐项授权。日活跃宝箱使用 dailies:[{kind:"daily-activity",tierId:精确档位ID,action:"claim"}]，Tasks 也可使用 {kind:"daily-activity",tierId:精确档位ID}。免费赠礼使用 {kind:"daily-gift",packId:"赠礼",action:"claim"}（Tasks省略action）；周转盘免费礼包使用 {kind:"weekly-lottery-gift",packId:"1000",action:"claim"}（Tasks省略action），周翻牌使用kind:"weekly-unique-lottery-gift"及同一固定packId，须明确gotFree=false；周芯片使用kind:"weekly-chip-gift"及同一固定packId，须明确paidTimes=0，只收宝箱不打开；周芯片任务使用kind:"weekly-chip-task",round:当前轮次,taskId:明确任务ID（Dailies加action:"claim"），最后一项换轮仍缺证冻结；均须当前服务器活动窗口及明确资格，不跨周续领；不支持付费/合并礼包，不推断跨周期重领。任务与宝箱不能混用 ID；周宝箱周期仍缺证。world 使用已注册 module、parameters 和明确 selection。预算为 resources/quotas/uids 的累计上限。</p><textarea id="wf-unified-intent" rows="12"></textarea></details><button id="wf-unified-prepare" disabled>生成统一工作流预览</button><pre id="wf-unified-blocked"></pre></details>${workflowCoreHtml}<details><summary>本账号主线节点开关（默认关闭）</summary><button id="wf-stage-load">读取主线节点配置</button><label><input id="wf-stage-enabled" type="checkbox" disabled>允许工作流生成有限主线节点计划</label><button id="wf-stage-save" disabled>保存主线节点配置</button><p id="wf-stage-hint"></p></details><p class="dim">有限节点图逐步运行。ACTION 生成具体计划并暂停待授权；验证成功后才可继续。可在完整图 JSON 的 budget 声明 resources/quotas/uids 累计上限；未声明的旧图固定使用首个计划的可靠库存，后续收入不会补回额度。</p><div class="toolbar"><button id="wf-load">读取本账号图与状态</button><select id="wf-saved"></select><button id="wf-open">加载选中的图</button><button id="wf-save" disabled>保存图</button><button id="wf-simulate" disabled>模拟</button><button id="wf-start" disabled>开始流程</button><button id="wf-resume" disabled>验证已成功后继续</button><button id="wf-stop" disabled>停止流程</button></div><p id="wf-hint" role="status"></p><pre id="wf-status">尚未读取</pre><details><summary>本账号工作流执行历史</summary><select id="wf-history-selected" disabled></select><button id="wf-history-read" disabled>读取所选运行明细</button><p id="wf-history-hint" role="status"></p><div id="wf-history-detail"></div></details><label>图 ID<input id="wf-id" value="workflow-1"></label><label>名称<input id="wf-name" value="新工作流"></label><details open><summary>当前图累计预算</summary><p>预算只声明本次流程的累计上限，不证明资格或成本。明确启用并应用后才更新当前图；未声明的旧图仍使用首个计划的可靠库存，后续收入不会补回额度。</p><label><input id="wf-budget-enabled" type="checkbox">为当前图声明明确累计上限</label>${executionBudgetFieldsHtml('wf')}<button id="wf-budget-apply" type="button">应用预算到当前图</button><p id="wf-budget-hint" role="status"></p></details><details open><summary>当前图运行边界（可选）</summary><p>总时长包含启动、等待与逐批授权时间，最多24小时；动作上限按计划次数累计，最多200次。到限停止后续节点并关闭原父预算。此设置不授予执行权限，也不代表游戏冷却或重置周期。</p><label><input id="wf-policy-enabled" type="checkbox">明确声明本次运行边界</label><label>总时长（毫秒）<input id="wf-policy-duration" inputmode="numeric"></label><label>累计动作计划上限<input id="wf-policy-actions" inputmode="numeric"></label><label>外层最多轮次（可选；留空只运行一轮）<input id="wf-policy-rounds" inputmode="numeric"></label><label>轮间隔（毫秒，可选；仅本次运行的等待）<input id="wf-policy-interval" inputmode="numeric"></label><p>最多200轮；原200步、200条历史、累计动作、期限与预算仍按整次运行限制。每轮重新调查；等待不代表游戏冷却或日界。重启只恢复历史。</p><label><input id="wf-policy-scheduled" type="checkbox">启用一次或日周日历触发</label><label>日历规则<select id="wf-policy-kind"><option value="ONCE">一次明确时间</option><option value="DAILY">每日上海时刻</option><option value="WEEKLY">每周上海时刻</option></select></label><label>每日/每周时刻（HH:mm:ss.sss）<input id="wf-policy-local-time" placeholder="08:30:00.000"></label><label>星期（周一1至周日7，仅每周）<input id="wf-policy-week-day" inputmode="numeric"></label><label>上海时间（YYYY-MM-DDTHH:mm:ss.sss）<input id="wf-policy-at" placeholder="2026-11-14T20:30:00.000"></label><p>时区 Asia/Shanghai；错过按 SKIP 跳过，不补跑。等待包含在本次总时长内，到点重新调查。日周规则每次启用只覆盖本次24小时以内的有界窗口，超出窗口停止；下一窗口须重新启用并授权，不自动续权。重启只读，不自动恢复定时或授权。</p><label><input id="wf-policy-event-enabled" type="checkbox">业务事件触发一次</label><label>事件来源<select id="wf-policy-event-kind"><option value="VIP_LEVEL_CHANGED">VIP等级变化</option><option value="PLAYER_LEVEL_CHANGED">角色等级变化</option><option value="DAILY_TASK_RESET">收到每日任务重置推送</option></select></label><label>明确目标等级（含0）<input id="wf-policy-event-level" inputmode="numeric"></label><p>只订阅当前可信登录连接中的新变化；每日任务重置不填写等级，仅认当前连续连接的新重置推送与服务端标记，不推断时区、日界或领取资格。原期限与累计预算仍适用。推送只触发新调查，不证明领取资格或写入成功。时间触发与事件触发须明确选择一种，重启不恢复监听或权限。</p><label>允许玩法（每行一个精确 ID；无业务节点可留空）<textarea id="wf-policy-modules" rows="3"></textarea></label><button id="wf-policy-apply" type="button">应用运行边界到当前图</button><p id="wf-policy-hint" role="status"></p></details><button id="wf-add">添加节点</button><div id="wf-nodes"></div><h3>连线与条件分支</h3><button id="wf-add-edge">添加连线</button><div id="wf-edges"></div><svg id="wf-canvas" viewBox="0 0 800 120" role="img" aria-label="工作流节点与连线" style="width:100%;min-height:180px;overflow:auto"></svg><details><summary>完整图 JSON</summary><textarea id="wf-json" rows="14"></textarea><button id="wf-json-apply">应用 JSON 到图编辑器</button></details><div id="wf-result"></div><div id="wf-plan"></div><button id="wf-authorize" disabled>确认并授权当前 ACTION 计划</button><details><summary>本次有限运行授权范围（可选）</summary><div id="wf-run-scope"></div><button id="wf-authorize-run" disabled>确认本次有限运行范围并执行</button></details></section>`;

function gameplayClient(WF_CONDITION_FIELDS, WF_PARAMETER_SCHEMAS, WF_BUDGET_LIMITS, NAVAL_RULE_FIELDS, CONFIG_NUMBER_VALID, WF_GRAPH_LIMITS) {
const GP_MODULES = ['material-packs','formation','alliance','museum','treasure','fleet','naval','heroes','production','farm','equipment-forge','formation-unlock','equipment-growth','badge-growth','antique-growth','pirate-sweep','task-rewards','mail','afk-level-rewards','free-gold','free-recruit','trial-challenge','pet'];
const gpState = Object.create(null);
let nfState={entries:[],scope:null,pending:false,loaded:false};
let exState={stage:null,rows:[]};
let antiqueState={pending:false};
let gpRevision = 0, gpToken = null, wfData = null, wfPending = false, wfPlan = null;
let wfBudgetDraft = null, wfPolicyDraft = null;
let wfHistoryRows = [], wfHistoryPending = false, wfHistoryRevision = 0;
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
function gpControls(id) { wfUnifiedSyncCandidateControls(id); const s=gpGet(id),ready=gpReady(id),locked=Boolean(id==='formation'&&nfState.pending||s.data?.status?.blocked||s.data?.status?.running||snapshot?.busy);$('gp-'+id+'-load').disabled=s.pending||!current;$('gp-'+id+'-survey').disabled=!ready||s.pending||locked||!snapshot?.connected;$('gp-'+id+'-config-save').disabled=!ready||s.pending||locked;$('gp-'+id+'-plan').disabled=!ready||s.pending||locked||!snapshot?.connected||s.dirty||s.configDirty||s.selected.size!==1;$('gp-'+id+'-authorize').disabled=s.pending||locked||!snapshot?.connected||s.dirty||s.configDirty||!gpPlanLive(s.plan);$('gp-'+id+'-stop').disabled=!ready||s.pending||!s.data?.status?.running;for(const field of $('gp-'+id+'-config-fields').children){const control=field.children[0];if(control?._configBooleanLive)control.disabled=!control._configBooleanLive();}for(const control of s.numberConfigControls||[])control.disabled=!control._numberConfigLive();for(const control of s.listConfigControls||[])control.disabled=!control._listConfigLive();for(const control of s.actionControls||[])control.disabled=control._blocked||!(id==='heroes'&&control._heroExchangeDraft?gpHeroExchangeEditable():gpDomainSelectable(id));if(id==='mail')for(const button of s.mailPageControls||[])button.disabled=!ready||s.pending||locked||!snapshot?.connected||button._mailOffset===-1&&(s.data?.view?.page?.pageNo??0)===0;if(id==='museum')antiqueControls();if(id==='treasure')for(const control of s.treasureControls||[])control.disabled=!control._treasureLive();if(id==='naval'){for(const control of s.navalControls||[])control.disabled=!control._navalLive();for(const control of s.navalRuleControls||[])control.disabled=!control._navalRuleLive();}if(id==='formation'){for(const key of ['mode','raid','mode-prepare'])$('gp-formation-'+key).disabled=!ready||s.pending||locked;for(const key of ['career','manual'])$('gp-formation-'+key).disabled=!gpDomainSelectable(id);$('gp-formation-restore').disabled=!s.restore||s.pending||nfState.pending;nfControls();exControls();}if(id==='fleet'){for(const control of s.cargoControls||[])control.disabled=control._blocked||!gpCargoSelectable();for(const control of s.fleetFormationControls||[])control.disabled=!control._fleetFormLive();for(const control of s.fleetOperationControls||[])control.disabled=!control._fleetOperationLive();}if(id==='alliance')for(const control of s.allianceControls||[])control.disabled=control._blocked||!gpAllianceSelectable(); wfUnifiedSurveyControl(id); }
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
function gpInvalidate(id,parametersChanged) { const s=gpGet(id);s.revision++;s.plan=null;s.selected.clear();if(parametersChanged)s.dirty=true;$('gp-'+id+'-plan-view').textContent='选择或参数已变化，请重新预览。';gpControls(id); }
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

function gpRenderCandidates(id) {const s=gpGet(id),box=gpClear($('gp-'+id+'-candidates'));s.unifiedControls=[];for(const row of s.data?.view?.candidates||[]){const card=gpEl('article'),label=gpEl('label'),input=gpEl('input');input.type='checkbox';input.checked=s.selected.has(row.actionId);input.disabled=s.pending||s.dirty||gpBlocked(row);input.onchange=()=>{if(input.disabled||s.pending)return;s.selected.clear();if(input.checked){s.selected.add(row.actionId);if(row.parameters)$('gp-'+id+'-parameters').value=gpJson(row.parameters);}s.plan=null;s.revision++;gpRenderCandidates(id);gpControls(id);};label.appendChild(input);label.appendChild(document.createTextNode(row.label||row.actionType||row.actionId));card.appendChild(label);card.appendChild(gpEl('p','目标：'+gpJson(row.target)+' · 成本：'+operationCosts(row.costs)));card.appendChild(gpEl('p','成本来源：'+(row.costSource||'未知')));if(gpBlocked(row))card.appendChild(gpEl('p','禁止执行：'+(row.blockedReason||row.reason||'没有已验证动作')));gpDetails(card,'当前状态',row.beforeState);gpDetails(card,'预期状态',row.expectedState);wfUnifiedCandidateButton(card,id,row,s);box.appendChild(card);}for(const row of s.data?.view?.blocked||[])box.appendChild(gpEl('p','缺口：'+(row.blockedReason||row.reason||row.code||gpJson(row))));if(!box.children.length)box.textContent='当前没有可执行候选；请查看状态和缺口。'; }
function gpFarmHarvestText(plan) {return (plan.actions||[]).filter(row=>row.module==='farm'&&row.actionType==='HARVEST').map(row=>gpJson({buildingId:row.target?.buildingId,productId:row.target?.productId,plantTime:row.beforeState?.farm?.plantTime,ripeTime:row.beforeState?.farm?.ripeTime,uids:(plan.budgetClaims?.uids||[]).filter(uid=>uid.type==='farm-harvest')})).join('、');}
function gpQuotaText(plan) {const quotas=plan?.budgetClaims?.quotas;return Array.isArray(quotas)&&quotas.length?quotas.map(row=>row.id.startsWith('pirate-sweep:')?'海面扫荡 '+row.id.slice('pirate-sweep:'.length)+' ×'+row.num:row.id+' ×'+row.num).join('、'):'';}
function gpRenderPlan(box,plan) {gpClear(box);box.appendChild(gpEl('h3','待授权批次 '+plan.batchId));box.appendChild(gpEl('p','总资源消耗：'+operationCosts(plan.resourceBudget)));const crop=gpFarmHarvestText(plan);if(crop)box.appendChild(gpEl('p','作物批次：'+crop));const quota=gpQuotaText(plan);if(quota)box.appendChild(gpEl('p','额度占用：'+quota));box.appendChild(gpEl('p','计划标识：'+plan.planHash+' · 有效至：'+plan.expiresAt));for(const row of plan.actions||[]){const card=gpEl('article');card.appendChild(gpEl('h4',row.label||row.actionType));card.appendChild(gpEl('p','目标：'+gpJson(row.target)+' · 成本：'+operationCosts(row.costs)));card.appendChild(gpEl('p','成本来源：'+(row.costSource||'未知')));gpDetails(card,'当前状态',row.beforeState);gpDetails(card,'预期状态',row.expectedState);box.appendChild(card);}for(const note of plan.notes||[])box.appendChild(gpEl('p',typeof note==='string'?note:gpJson(note))); }
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
function gpRenderFormation(view) {$('gp-formation-mode').value=view?.mode==='expedition'?'expedition':'mainline';$('gp-formation-raid').value=view?.mode==='expedition'?String(view.raidId):'';const s=gpGet('formation'),select=gpClear($('gp-formation-template'));for(const layout of view?.layouts||[]){const option=gpEl('option',layout.id+(view.unlockedPresetIds?.includes(layout.id)?' · 已解锁':' · 未解锁'));option.value=String(layout.id);option.disabled=!layout.reliable||!view.unlockedPresetIds?.includes(layout.id);select.appendChild(option);}select.value=String(s.previewPreset??view?.formation?.presetId??'');select.onchange=()=>{const state=gpGet('formation');state.previewPreset=select.value;gpRenderFormationLayout(state.data?.view);};gpRenderFormationLayout(view);const box=gpClear($('gp-formation-roster')),slots=new Map((view?.formation?.heroPositions||[]).map(r=>[r.heroId,r.pos]));for(const row of view?.heroes||[]){const label=gpEl('label'),check=gpEl('input'),x=gpEl('input'),y=gpEl('input');check.type='checkbox';check.checked=slots.has(row.heroId);check.value=row.heroId;x.type='number';y.type='number';x.value=String(slots.get(row.heroId)?.x??'');y.value=String(slots.get(row.heroId)?.y??'');check.dataset.hero=row.heroId;x.dataset.axis='x';y.dataset.axis='y';label.appendChild(check);label.appendChild(document.createTextNode(row.heroId+' · '+row.career+' x='));label.appendChild(x);label.appendChild(document.createTextNode(' y='));label.appendChild(y);label._formation={check:check,x:x,y:y};box.appendChild(label);}gpDetails(box,'当前完整阵容与宠物（只读）',view?.formation);s.restore=s.restore||null; }
function gpAllianceSelectable() {const s=gpGet('alliance');return gpReady('alliance')&&!s.pending&&!s.data?.status?.blocked&&!s.data?.status?.running&&!snapshot?.busy;}
function gpAllianceParameters(parameters) {if(!gpAllianceSelectable())return;$('gp-alliance-parameters').value=gpJson(parameters);gpInvalidate('alliance',true);gpRenderCandidates('alliance');$('gp-alliance-hint').textContent='已选择精确业务目标；请重新只读探测、预览并授权。';}
function gpAllianceTable(parent,title,headings,rows) {const table=gpEl('table');table.appendChild(gpEl('caption',title));const head=gpEl('tr');for(const title of headings)head.appendChild(gpEl('th',title));table.appendChild(head);for(const values of rows){const tr=gpEl('tr');for(const value of values){const cell=gpEl('td');if(value&&typeof value==='object'&&value.tagName)cell.appendChild(value);else cell.textContent=String(value??'UNKNOWN');tr.appendChild(cell);}table.appendChild(tr);}if(!rows.length){const tr=gpEl('tr'),cell=gpEl('td','尚无可靠条目；不表示服务器状态为空');cell.setAttribute('colspan',String(headings.length));tr.appendChild(cell);table.appendChild(tr);}parent.appendChild(table);}
function gpRenderAlliance(view) {const box=$('gp-alliance-facts'),s=gpGet('alliance'),scope=viewGuard.capture(),revision=gpRevision;s.allianceControls=[];if(!view)return;const section=gpEl('div');section.appendChild(gpEl('h3','联盟业务状态'));section.appendChild(gpEl('p','联盟 ID：'+(view.guildId??'UNKNOWN')+' · 本人 ID：'+(view.playerId??'UNKNOWN')));section.appendChild(gpEl('p','科技赛季 / 阶段：'+gpJson(view.techState)));const limits=view.dailyLimits||{};section.appendChild(gpEl('p','帮助剩余：'+(limits.help??'UNKNOWN')+' · 求助剩余：'+(limits.ask??'UNKNOWN')+' · 订单剩余：'+(limits.order??'UNKNOWN')+'。未知额度或冷却继续阻塞对应操作。'));
 const choose=(label,parameters,disabled=false)=>{const button=gpEl('button',label);button.disabled=disabled||!gpAllianceSelectable();button.dataset.allianceSelect=gpJson(parameters);button._blocked=disabled;button.onclick=()=>{if(!button.disabled&&gpSafe(scope,revision)&&gpGet('alliance').data?.view===view)gpAllianceParameters(parameters);};s.allianceControls.push(button);return button;};
 gpAllianceTable(section,'成员（按精确 ID 识别）',['玩家 ID','昵称','联盟职级','在线状态'],(view.members||[]).map(row=>[row.playerId,row.nickname,row.title,row.online===true?'在线':row.online===false?'离线':'UNKNOWN']));
 gpAllianceTable(section,'成员帮助请求',['请求 ID','玩家 ID','物品 ID','到期时间（服务器秒）','选择'],(view.requests||[]).map(row=>[row.reqId,row.askerId,row.itemId,row.endTime,choose('选择请求',{reqIds:[row.reqId],memberIds:[row.askerId],itemIds:[row.itemId]},!row.reqId||!row.askerId||!row.itemId)]));
 gpAllianceTable(section,'本人的求助',['请求 ID','物品 ID','帮助者 ID','到期时间（服务器秒）'],(view.ownRequests||[]).map(row=>[row.reqId,row.itemId,row.helperId??(row.helperKnown?'尚未帮助':'UNKNOWN'),row.endTime]));
 gpAllianceTable(section,'联盟科技（模板与前置由游戏配置提供）',['科技 ID','名称','当前等级','下一等级','成本及来源','前置条件 / 阻断','选择'],(view.technologies||[]).map(row=>{const level=row.level,targetLevel=row.targetLevel,parameters={techId:row.techId,targetLevel};return [row.techId,row.name,level,targetLevel,operationCosts(row.costs)+' · '+(row.costSource||'UNKNOWN'),gpJson({openStage:row.openStage,preTech:row.preTech,preTechLevel:row.preTechLevel,prerequisiteLevel:row.prerequisiteLevel})+' '+(row.blockedReason||''),choose('选择下一等级',parameters,!Number.isSafeInteger(row.techId)||!Number.isSafeInteger(level)||targetLevel!==level+1)];}));
 gpAllianceTable(section,'联盟城市 / 堡垒读取',['城市 ID','读取'],(view.cities||[]).map(row=>[row.cityId,choose('选择城市读取',{cityId:row.cityId},!Number.isSafeInteger(row.cityId))]));
 const fort=view.fort;if(fort){section.appendChild(gpEl('p','堡垒：'+gpJson(fort.fort)+' · 同日捐赠计数：'+String(fort.dailyDonateNum??'UNKNOWN')+' · 游戏日：'+String(fort.dayKey??'UNKNOWN')+'。计数用于功勋衰减，单次仅使用已持有普通材料。'));gpAllianceTable(section,'堡垒普通材料单次目标',['材料','进度 / 需求','自有数量','本次数量','选择'],(fort.materials||[]).map(row=>{const input=gpEl('input');input.type='number';input.min='1';input.step='1';input.value='1';input.dataset.fortMaterial=row.itemId;input.disabled=!gpAllianceSelectable();input._blocked=false;s.allianceControls.push(input);const button=choose('选择捐赠',{cityId:fort.fort?.cityId,itemId:row.itemId,num:1},!fort.fort?.cityId);button.onclick=()=>{if(!button.disabled&&gpSafe(scope,revision)&&gpGet('alliance').data?.view===view){const num=Number(input.value);if(!Number.isSafeInteger(num)||num<=0||num>2147483647){$('gp-alliance-hint').textContent='本次数量必须为正整数';return;}gpAllianceParameters({cityId:fort.fort.cityId,itemId:row.itemId,num:num});}};return [row.itemId,String(row.donated??'UNKNOWN')+' / '+String(row.required??'UNKNOWN'),row.owned,input,button];}));}
 section.appendChild(gpEl('p','选择只更新业务参数；没有直接游戏写入口。每次执行仍需具体计划、成本和单次授权。'));box.appendChild(section);}

function gpHeroExchangeEditable(){const s=gpGet('heroes');return gpReady('heroes')&&!s.pending&&!s.configDirty&&!s.data?.status?.blocked&&!s.data?.status?.running&&!snapshot?.busy&&snapshot?.connected;}
function gpDomainSelectable(id){const s=gpGet(id);return gpReady(id)&&!s.pending&&!s.dirty&&!s.configDirty&&!s.data?.status?.blocked&&!s.data?.status?.running&&!snapshot?.busy&&snapshot?.connected;}
function gpSelectDomainCandidate(id,actionId){const s=gpGet(id);if(!gpDomainSelectable(id))return;const row=s.data?.view?.candidates?.find(row=>row.actionId===actionId);if(!row||gpBlocked(row))return;s.selected.clear();s.selected.add(actionId);s.plan=null;s.revision++;if(row.parameters)$('gp-'+id+'-parameters').value=gpJson(row.parameters);gpClear($('gp-'+id+'-plan-view'));gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已选择当前单项候选；请预览成本及效果并授权。';}
function gpRenderDomain(id,view){
 const s=gpGet(id),box=gpClear($('gp-'+id+'-facts'));s.actionControls=[];s.mailPageControls=[];
 const show=value=>value===null||value===undefined?'未知':String(value);
 const table=(title,headers,rows)=>{box.appendChild(gpEl('h3',title));const element=gpEl('table'),heading=gpEl('tr');for(const label of headers)heading.appendChild(gpEl('th',label));element.appendChild(heading);for(const row of rows){const tr=gpEl('tr');for(const value of row)tr.appendChild(gpEl('td',show(value)));element.appendChild(tr);}box.appendChild(element);};
 if(id==='material-packs'){
  table('自有材料包',['包','持有'],(view?.packs||[]).map(pack=>[pack.packId,pack.have]));
  box.appendChild(gpEl('p','当前世界赛季：'+show(view?.season)+'。选择目标与包数后重新探测，再预览并单独授权。预计得料不作为库存，不自动排产或补购。'));
  const scope=viewGuard.capture(),revision=gpRevision;
  const select=gpEl('select');select.dataset.materialPackTarget='true';select.disabled=!gpDomainSelectable(id);
  for(const pack of view?.packs||[])for(const target of pack.targets||[]){const option=gpEl('option',pack.packId+' → '+target.itemId+' · 每包 '+show(target.perPack)+' · 赛季 '+show(target.requiredSeason));option.value=gpJson({packId:pack.packId,itemId:target.itemId});select.appendChild(option);}
  const num=gpEl('input');num.type='number';num.min='1';num.max='2147483647';num.step='1';num.value='';num.dataset.materialPackQuantity='true';num.disabled=!gpDomainSelectable(id);
  const choose=gpEl('button','准备指定材料兑换');choose.dataset.materialPackPrepare='true';choose.disabled=!gpDomainSelectable(id);
  choose.onclick=()=>{if(choose.disabled||!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id).data?.view!==view)return;const quantity=Number(num.value);if(!select.value||!Number.isInteger(quantity)||quantity<1||quantity>2147483647){$('gp-'+id+'-hint').textContent='请选择材料，并输入明确正整数包数。';return;}const target=JSON.parse(select.value);$('gp-'+id+'-parameters').value=gpJson({...target,num:quantity});gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已准备精确包、目标与数量；重新探测后预览并单独授权兑换。';};
  box.appendChild(select);box.appendChild(num);box.appendChild(choose);s.actionControls.push(select,num,choose);
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
  for(const row of emails){const read=row.read===false&&row.attachment?.hasAttachment===false&&typeof row.got==='boolean';if(!read&&(row.got!==false||row.attachment?.hasAttachment!==true))continue;const button=gpEl('button',(read?'准备单封已读 ':'准备单封附件 ')+row.emailId);if(read)button.dataset.mailReadPrepare=row.emailId;else button.dataset.mailClaimPrepare=row.emailId;button._blocked=false;button.disabled=!gpDomainSelectable(id);button.onclick=()=>{if(button.disabled||!gpDomainSelectable(id)||!viewGuard.current(scope)||gpGet(id).data?.view!==view)return;$('gp-mail-parameters').value=gpJson({pageNo:row.pageNo??page.pageNo,action:read?'read':'claim',emailId:row.emailId});gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-mail-hint').textContent='已准备精确单封邮件；请重新探测附件与库存，预览后单独授权。';};s.actionControls.push(button);box.appendChild(button);}
  box.appendChild(gpEl('p','普通分页只展示本页；明确枚举在页数上限内检查分页覆盖，不证明原子快照。单封普通道具/资源附件及完整空附件未读邮件可以独立探测、预览和授权；批量及实例附件继续冻结。'));
 }else if(id==='museum'){
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
  table('英雄经验试炼',['已通关','下一首通关','开放等级','当前状态'],(view?.candidates||[]).map(row=>[view.raid?.passedStage,row.target?.stageId,row.requiredLevel,row.executable?'可预览单场挑战':row.blockedReason]));
  for(const note of view?.notes||[])box.appendChild(gpEl('p',note));
 }else if(id==='free-recruit'){
  table('免费英雄招募',['当前冷却标记','当前累计次数','广播站','开放等级','当前状态'],(view?.candidates||[]).map(row=>[view.recruit?.hero?.freeEndTimeSeconds,view.recruit?.hero?.recruitTimes,view.broadcast?.level,row.requiredLevel,row.executable?'可预览免费单次':row.blockedReason]));
  for(const note of view?.notes||[])box.appendChild(gpEl('p',note));
 }else if(id==='free-gold'){
  table('普通免费点金',['已用','上限','剩余','服务器重置标记','当前状态'],(view?.candidates||[]).map(row=>[view.gold?.freeTimes,row.limit,row.remaining,view.gold?.resetTime,row.executable?'可预览免费单次':row.blockedReason]));
  for(const note of view?.notes||[])box.appendChild(gpEl('p',note));
 }else if(id==='afk-level-rewards'){
  table('挂机等级与奖励',['当前等级','已领奖等级','下一档','配置奖励','当前状态'],(view?.candidates||[]).map(row=>[view.afk?.level,view.afk?.rewardedLevel,row.target?.level,(row.rewards||[]).map(reward=>reward.id+' × '+reward.num).join('、')||'未知',row.executable?'可预览领取':row.blockedReason]));
  for(const note of view?.notes||[])box.appendChild(gpEl('p',note));
 }else if(id==='task-rewards'){
  const scope=viewGuard.capture(),revision=gpRevision,input=gpEl('input'),round=gpEl('input'),kind=gpEl('select'),choose=gpEl('button','准备日常领奖');
  kind.dataset.dailyRewardKind='true';for(const [value,label]of [['daily','日常任务'],['daily-activity','日活跃宝箱'],['daily-gift','免费赠礼（无需ID）'],['weekly-lottery-gift','周转盘免费礼包（无需ID）'],['weekly-unique-lottery-gift','周翻牌免费礼包（无需ID）'],['weekly-chip-gift','周芯片免费礼包（无需ID）'],['weekly-chip-task','周芯片任务（当前轮次与ID）']]){const option=gpEl('option',label);option.value=value;kind.appendChild(option);}kind.value='daily';kind.disabled=!gpDomainSelectable(id);
  input.type='number';input.min='1';input.max='2147483647';input.step='1';input.value='';input.dataset.dailyRewardId='true';choose.dataset.dailyRewardPrepare='true';
  input.disabled=choose.disabled=!gpDomainSelectable(id);
  round.type='number';round.min='1';round.max='2147483647';round.step='1';round.value='';round.placeholder='周芯片当前轮次';round.dataset.chipTaskRound='true';round.disabled=!gpDomainSelectable(id);
  choose.onclick=()=>{if(choose.disabled||!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id).data?.view!==view)return;const taskId=Number(input.value),chipRound=Number(round.value);if(kind.value==='weekly-chip-task'&&(!Number.isInteger(chipRound)||chipRound<1||chipRound>2147483647)){$('gp-'+id+'-hint').textContent='请填写明确的周芯片当前轮次。';return;}if(!['daily','daily-activity','daily-gift','weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift','weekly-chip-task'].includes(kind.value)||(!['daily-gift','weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift'].includes(kind.value)&&(!Number.isInteger(taskId)||taskId<1||taskId>2147483647))){$('gp-'+id+'-hint').textContent='请选择日常任务/日活跃宝箱并填写正整数ID，或选择固定免费赠礼。';return;}$('gp-'+id+'-parameters').value=gpJson(kind.value==='weekly-chip-task'?{kind:kind.value,round:chipRound,taskId}:['weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift'].includes(kind.value)?{kind:kind.value,packId:'1000'}:kind.value==='daily-gift'?{kind:'daily-gift',packId:'赠礼'}:kind.value==='daily-activity'?{kind:'daily-activity',tierId:taskId}:{kind:'daily',taskId});gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已准备明确任务或日活跃档位；重新探测、预览并单独授权。';};
  box.appendChild(gpEl('p','任务与宝箱需填写明确ID；周芯片任务还需当前轮次，最后一项换轮结算缺证仍冻结；免费赠礼和1000号周转盘/翻牌/芯片礼包无需ID。缓存不能授权领取；周礼包绑定服务器活动窗口，不推算跨周重领；周活跃宝箱周期仍缺证。'));box.appendChild(kind);box.appendChild(input);box.appendChild(round);box.appendChild(choose);s.actionControls.push(kind,input,round,choose);
  if(view?.candidates?.[0]?.parameters?.kind==='weekly-chip-task'){const a=view.daily?.activityTime?.find(r=>r.type===6);box.appendChild(gpEl('p','周芯片任务 · 当前轮次 '+show(view.daily?.round)+' · 累计积分 '+show(view.daily?.score)+' · 已领任务 '+show(view.daily?.gotTaskId?.join('、'))+' · 活动期数 '+show(a?.period)+' · 服务器窗口（秒） '+show(a?.startTime)+' 至 '+show(a?.endTime)+'；仅领取配置奖励并持有宝箱，不打开。'));}
  else if(['weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift'].includes(view?.candidates?.[0]?.parameters?.kind)){const unique=view.candidates[0].parameters.kind==='weekly-unique-lottery-gift',chip=view.candidates[0].parameters.kind==='weekly-chip-gift',a=view.daily?.activityTime?.find(r=>r.type===(chip?6:unique?7:4));box.appendChild(gpEl('p',(chip?'周芯片免费礼包':unique?'周翻牌免费礼包 · 已领 '+show(view.daily?.gotFree):'周转盘免费礼包')+' · 活动期数 '+show(a?.period)+' · 服务器窗口（秒） '+show(a?.startTime)+' 至 '+show(a?.endTime)+'；仅当前窗口，领取记录缺失时不推断未领。'));if(chip)table('周芯片礼包领取记录',['礼包 ID','领取计次'],(view.daily?.gift||[]).map(r=>[r.giftId,r.paidTimes]));else table('周转盘礼包领取记录',['礼包 ID','已领次数','充值标记'],(view.daily?.gift||[]).map(r=>[r.giftId,r.gotTimes,r.charge]));}
  else if(view?.candidates?.[0]?.parameters?.kind==='daily-gift')box.appendChild(gpEl('p','免费赠礼 · 服务器原样标记 '+show(view.daily?.resetMarker)+' · 英雄 '+show(view.daily?.heroId)+'；不据此安排日重领。'));
  else if(view?.daily)box.appendChild(gpEl('p','服务器日常重置标记 '+show(view.daily.resetTime)+' · 日活跃 '+show(view.daily.dailyActivity)+' · 周活跃 '+show(view.daily.weeklyActivity)));
  for(const row of view?.candidates||[])if(row.parameters?.kind==='daily')box.appendChild(gpEl('p','本次配置活跃增量 '+show(row.activityGain)+'；日周活跃和 EXP 须在同周期独立复读一致。'));
  table('任务进度与配置奖励',['任务类型','任务 / 档位 ID','进度','目标','奖励','当前状态'],(view?.candidates||[]).map(row=>[row.target?.kind==='weekly-chip-task'?'周芯片任务':row.target?.kind==='weekly-chip-gift'?'周芯片免费礼包':row.target?.kind==='weekly-unique-lottery-gift'?'周翻牌免费礼包':row.target?.kind==='weekly-lottery-gift'?'周转盘免费礼包':row.target?.kind==='daily-gift'?'免费赠礼':row.target?.kind==='daily-activity'?'日活跃宝箱':row.target?.kind==='daily'?'日常':row.target?.kind==='achievement'?'成就':row.target?.kind==='main'?'主线':'支线',row.target?.taskId??row.target?.tierId??row.target?.packId,row.progress,row.requiredProgress,(row.rewards||[]).map(reward=>reward.id+' × '+reward.num).join('、')||'未知',row.executable?'可预览领取':row.blockedReason]));
  for(const note of view?.notes||[])box.appendChild(gpEl('p',note));
 }else if(id==='antique-growth'){
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
  table('培育队列',['培育室','任务idx','海兽','星级','开始时间','完成时间'],(view?.rooms||[]).flatMap(room=>(room.queue?.breedQ||[]).map(job=>[room.buildingId,job.idx,job.petId,job.star,job.startTime,job.finishTime])));
  table('单次投喂',['培育室','任务idx','海兽','材料成本','状态'],(view?.candidates||[]).filter(row=>row.actionType==='FEED').map(row=>[row.target.buildingId,row.target.jobIdx,row.target.petId,operationCosts(row.costs),row.executable?'可以预览':row.blockedReason]));
  box.appendChild(gpEl('p','每次只投喂指定培育批次一次，减时 '+String(view?.secondsReduced??'未知')+' 秒；只用自有材料。成熟列表变化须独立复读，不自动领取或补料。'));
 }else if(id==='badge-growth'){
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
  table('已佩戴装备单次成长',['英雄','UID','装备','等级','星级','精炼等级'],(view?.heroes||[]).flatMap(hero=>(hero.equips||[]).map(equip=>[hero.heroId,equip.uid,equip.equipId,equip.level,equip.star,equip.refineLv])));
  if(view?.candidates?.some(row=>row.actionType==='PUT-ON')){
   table('空槽穿戴候选',['英雄','装备种类','装备','UID','状态'],view.candidates.filter(row=>row.actionType==='PUT-ON'&&row.beforeState?.equipment).map(row=>[row.target.heroId,row.target.type,row.beforeState.equipment.equipId,row.target.uid,row.executable?'可以预览':row.blockedReason]));
   box.appendChild(gpEl('p','先填写英雄 ID，再探测可穿戴的自有闲置装备。只穿到空槽，不替换已佩戴装备。'));
  }
  box.appendChild(gpEl('p','等级单次消耗自有精铁；显式红装精炼消耗精铁与精炼石，单次升星消耗升星石与精铁。目标英雄战力与属性以服务器完整复读为准。'));
  const scope=viewGuard.capture(),revision=gpRevision;for(const mode of [{label:'查看单次等级',action:null},{label:'查看红装单次精炼',action:'refine'},{label:'穿到空槽',action:'put-on'},{label:'查看红装单次升星',action:'star'}]){const button=gpEl('button',mode.label);button.dataset.equipmentGrowthMode=mode.action||'level';button._blocked=false;button.disabled=!gpDomainSelectable(id);button.onclick=()=>{if(button.disabled||!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id).data?.view!==view)return;const old=gpParse('gp-'+id+'-parameters'),parameters={};for(const key of ['heroId','uid'])if(old[key]!==undefined)parameters[key]=old[key];if(mode.action)parameters.action=mode.action;$('gp-'+id+'-parameters').value=gpJson(parameters);gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已选择成长种类；请重新探测明确目标、成本并单次授权。';};s.actionControls.push(button);box.appendChild(button);}
 }else if(id==='formation-unlock'){
  table('普通阵型模板',['模板','名称','对应已有图纸','解锁状态'],(view?.templates||[]).map(row=>[row.presetId,row.name,operationCosts(row.costs),view?.unlockedPresetIds?.includes(row.presetId)?'已解锁':'未解锁']));
  box.appendChild(gpEl('p','仅消耗已持有的对应图纸一张；解锁后必须重新读取阵容列表，再单独预览并授权应用。'));
 }else if(id==='heroes'){
  table('英雄成长',['英雄','等级','星级','技能槽等级','战力','专武等级','专武星级'],(view?.heroes||[]).map(hero=>[hero.heroId,hero.level,hero.star,Array.isArray(hero.skillLevels)?hero.skillLevels.join(' / '):null,hero.power,hero.exclusive?.level,hero.exclusive?.star]));
  box.appendChild(gpEl('p','每个候选只成长一级或一个技能槽。通用碎片可按指定数量1:1兑换英雄专属碎片；兑换后升星须另行预览与授权。'));
  const scope=viewGuard.capture(),revision=gpRevision;for(const mode of [{label:'查看基础成长',action:null},{label:'查看专武单次升级',action:'exclusive-level'},{label:'查看专武单次升星',action:'exclusive-star'},{label:'查看碎片兑换',action:'fragment-exchange'}]){const button=gpEl('button',mode.label);button.dataset.heroGrowthMode=mode.action||'basic';button._blocked=false;button.disabled=!gpDomainSelectable(id);button.onclick=()=>{if(button.disabled||!gpDomainSelectable(id)||!gpSafe(scope,revision)||gpGet(id).data?.view!==view)return;const old=gpParse('gp-'+id+'-parameters'),parameters={};if(old.heroId!==undefined)parameters.heroId=old.heroId;if(mode.action)parameters.action=mode.action;$('gp-'+id+'-parameters').value=gpJson(parameters);gpInvalidate(id,true);gpRenderCandidates(id);gpControls(id);$('gp-'+id+'-hint').textContent='已选择成长种类；请重新探测明确英雄、成本并单次授权。';};s.actionControls.push(button);box.appendChild(button);}
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
  for(const control of [heroSelect,num,prepare]){control._heroExchangeDraft=true;control.disabled=!gpHeroExchangeEditable();s.actionControls.push(control);}
  heroLabel.appendChild(heroSelect);numLabel.appendChild(num);box.appendChild(heroLabel);box.appendChild(numLabel);box.appendChild(prepare);
 }else if(id==='equipment-forge'){
  table('装备厂队列',['建筑','等级','队列'],(view?.forges||[]).map(row=>[row.buildingId,row.level,gpJson(row.queue)]));
  table('制造配方',['配方','部位','所需赛季','材料','可能产物'],(view?.recipes||[]).map(row=>[row.makeId,row.type,row.season,operationCosts(row.costs),(row.equipIds||[]).join('、')]));
  table('背包装备实例',['UID','装备','等级','星级','精炼等级'],(view?.bag||[]).map(row=>[row.uid,row.equipId,row.level,row.star,row.refineLv]));
  box.appendChild(gpEl('p','每次只制造或收取一个明确批次。使用自有材料，通用材料和自动品质回退未开放。'));
 }else if(id==='farm'){
  table('农田状态',['地块','状态','作物','种植时间（原值）','成熟时间（服务器秒）','阻断'],(view?.plots||[]).map(plot=>[plot.buildingId,plot.state,plot.productId,plot.plantTime,plot.ripeTime,plot.reason]));
  table('种子成本',['作物','种子成本','证据'],(view?.crops||[]).map(crop=>[crop.productId,operationCosts(crop.costs),crop.reliable?'已有种子':'BLOCKED_EVIDENCE']));
  box.appendChild(gpEl('p','服务端自动种植：'+show(view?.autoFarming)+'。明确空地可按精确种子成本单田播种；成熟收取需当前连接可信时钟，每次只收一块地，作物数量以回执和完整库存净入共同确认。'));
 }else{
  const appointment=view?.appointment;box.appendChild(gpEl('h3','生产需求与时间规划'));
  box.appendChild(gpEl('p','委任减时：'+(appointment?.reliable===true?show(appointment.seconds)+' 秒':'未知')+' · 来源：'+(appointment?.source||appointment?.reason||'未知')));
  table('配方时间与持有物资包覆盖',['工厂','产品','原始秒数','委任调整秒数','覆盖缺料','范围'],(view?.factories||[]).flatMap(factory=>(factory.recipes||[]).map(recipe=>[factory.buildingId,recipe.productId,recipe.produceTime,recipe.appointmentAdjustedSeconds,recipe.packCoverage?.reliable===true?(recipe.packCoverage.ok?'持有包可覆盖（仅投影）':'不需兑换或不可覆盖'):'未知',recipe.timingScope])));
  table('作物策略水位',['作物','配方用途数','策略目标'],(view?.cropSupply?.waterlines||[]).map(row=>[row.cropId,row.uses,row.capDisabled?'未设上限':row.target]));
  table('种子储备缺口',['种子','持有','策略目标','缺少'],(view?.cropSupply?.seedDemand||[]).map(row=>[row.itemId,row.have,row.required,row.missing]));
  table('余料建议',['工厂','产品','最多份数'],(view?.cropSupply?.surplusDemand||[]).map(row=>[row.buildType,row.itemId,row.maximumUnits]));
  box.appendChild(gpEl('p','水位、种子、余料和持有包覆盖均为规划投影；仅下方现有生产候选可以进入单次授权。完整速度加成、自动补料和整日产量尚待完成。'));
 }
 for(const row of view?.candidates||[]){const card=gpEl('article');card.appendChild(gpEl('p',(row.label||row.actionType||row.actionId)+' · '+operationCosts(row.costs)+' · '+(row.costSource||'成本来源未知')));if(gpBlocked(row))card.appendChild(gpEl('p','禁止执行：'+(row.blockedReason||row.reason||'缺少可靠动作')));const button=gpEl('button','选择单项候选');button.dataset.domainAction=row.actionId;button._blocked=gpBlocked(row);button.disabled=button._blocked||!gpDomainSelectable(id);button.onclick=()=>{if(!button.disabled&&gpGet(id).data?.view===view)gpSelectDomainCandidate(id,row.actionId);};s.actionControls.push(button);card.appendChild(button);box.appendChild(card);}
 gpDetails(box,'事实、可靠性与完整规划详情',view);
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
}

function gpRenderFleetOperations(view) {
 const box=gpClear($('gp-fleet-operations')),section=gpEl('div'),s=gpGet('fleet'),scope=viewGuard.capture(),revision=gpRevision,edit=s.revision,source=$('gp-fleet-parameters').value;s.fleetOperationControls=[];box.appendChild(section);section.appendChild(gpEl('h3','舰队维护与移动'));
 const live=()=>gpSafe(scope,revision)&&gpGet('fleet')===s&&s.data?.view===view&&Array.from(box.children).includes(section);
 const editable=()=>live()&&gpReady('fleet')&&!s.pending&&!s.configDirty&&!s.data?.status?.blocked&&!s.data?.status?.running&&!snapshot?.busy&&snapshot?.connected;
 const control=(input,allowed=()=>true)=>{input._fleetOperationLive=()=>editable()&&allowed();input.disabled=!input._fleetOperationLive();s.fleetOperationControls.push(input);return input;};
 const labels={fleetRepair:'维修',fleetStopRepair:'停止维修',fleetStopAutoFight:'关闭委任',fleetMove:'移动到城市'};
 const rows=(view?.candidates||[]).filter(row=>Object.hasOwn(labels,row.actionType));
 gpAllianceTable(section,'当前具体维护 / 移动候选',['舰队','动作','目标城市','可执行成本','成本来源','状态 / 阻塞','选择'],rows.map(row=>{
  const button=control(gpEl('button','选择此候选'),()=>!s.dirty&&!gpBlocked(row));button.type='button';button.dataset.fleetOperation=row.actionId;
  button.onclick=()=>{if(!button._fleetOperationLive()||!s.data?.view?.candidates?.includes(row))return;gpSelectDomainCandidate('fleet',row.actionId);gpRenderFleetOperations(view);};
  return [row.target?.buildingId,labels[row.actionType],row.target?.cityId??'—',gpBlocked(row)?'尚未形成可执行成本':operationCosts(row.costs),row.costSource??'未知',gpBlocked(row)?row.reason||row.blockedReason||'UNKNOWN':'可预览',button];
 }));
 section.appendChild(gpEl('p','选择候选只加载当前明确参数，随后预览成本并单次授权。维修阈值、汽油保留线和计划上限使用本账号已有配置；预期收益不增加预算。'));
 const moveReady=()=>s.data?.config?.enabled===true&&s.data?.config?.move===true&&view?.citiesReliable===true&&view?.formationReliability?.fleets===true&&s.revision===edit&&$('gp-fleet-parameters').value===source;
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
  $('gp-fleet-parameters').value=gpJson({buildingId:selectedFleet.buildingId,cityId:selectedCity.id});gpInvalidate('fleet',true);gpRenderCandidates('fleet');gpRenderFleetOperations(view);$('gp-fleet-hint').textContent='移动目标参数已准备；请重新探测，核对具体成本和移动候选，再单次授权。';
 };
 if(!moveReady())section.appendChild(gpEl('p','移动目标编辑需本账号启用移动，并具备可靠舰队和当前视野城市；旧缓存缺证不推断为可用。'));
 for(const row of view?.blocked||[])if(['speedUpFleet','speedUpRepair','autoFight'].includes(row.actionType))section.appendChild(gpEl('p',row.actionType+' · '+row.code+' · '+row.reason));
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
}

function gpCargoSelectable(){const s=gpGet('fleet');return gpReady('fleet')&&!s.pending&&!s.dirty&&!s.configDirty&&!s.data?.status?.blocked&&!s.data?.status?.running&&!snapshot?.busy&&snapshot?.connected;}
function gpRenderCargo(view){
 const box=gpClear($('gp-fleet-cargo')),s=gpGet('fleet');s.cargoControls=[];
 const cargo=view?.cargo;if(!cargo){box.textContent='货船明细尚未采集';return;}
 box.appendChild(gpEl('h3','港口货船与缺货'));
 box.appendChild(gpEl('p','数据来源：'+(cargo.source||'未知')+' · '+(cargo.reliable?'货船状态可靠':'货船状态存在缺失')+' · 库存'+(cargo.inventoryReliable?'可靠':'未知')));
 const show=value=>value===null||value===undefined?'未知':String(value);
 const select=(parent,actionId,label)=>{if(!actionId)return;const candidate=s.data?.view?.candidates?.find(row=>row.actionId===actionId),button=gpEl('button',label);button.dataset.cargoAction=actionId;button._blocked=!candidate||gpBlocked(candidate);button.disabled=button._blocked||!gpCargoSelectable();button.onclick=()=>{if(button.disabled||!gpCargoSelectable())return;const fresh=gpGet('fleet').data?.view?.candidates?.find(row=>row.actionId===actionId);if(!fresh||gpBlocked(fresh))return;s.selected.clear();s.selected.add(actionId);s.plan=null;s.revision++;if(fresh.parameters)$('gp-fleet-parameters').value=gpJson(fresh.parameters);gpClear($('gp-fleet-plan-view'));gpRenderCandidates('fleet');gpControls('fleet');$('gp-fleet-hint').textContent='已选择此货船候选；请预览具体计划并授权。';};s.cargoControls.push(button);parent.appendChild(button);};
 for(const ship of cargo.ships||[]){const section=gpEl('article');section.appendChild(gpEl('h4','货船 '+show(ship.shipIndex)+' · '+(ship.statusText||show(ship.status))));if(ship.reason)section.appendChild(gpEl('p','阻塞：'+ship.reason));const table=gpEl('table'),head=gpEl('tr');for(const text of ['货格','物资','需求','持有','缺少','状态/选择'])head.appendChild(gpEl('th',text));table.appendChild(head);for(const slot of ship.slots||[]){const tr=gpEl('tr');for(const value of [slot.cargoIndex,slot.id,slot.required,slot.have,slot.missing])tr.appendChild(gpEl('td',show(value)));const last=gpEl('td',slot.filled===true?'已装货':slot.reason||'未装货');select(last,slot.actionId,'选择装货候选');tr.appendChild(last);table.appendChild(tr);}section.appendChild(table);select(section,ship.claimActionId,'选择到港领奖候选');box.appendChild(section);}
 const summary=gpEl('table'),heading=gpEl('tr');for(const text of ['待装总需求','需求量','持有','总缺少'])heading.appendChild(gpEl('th',text));summary.appendChild(heading);for(const item of cargo.shortages||[]){const tr=gpEl('tr');for(const value of [item.id,item.required,item.have,item.missing])tr.appendChild(gpEl('td',show(value)));summary.appendChild(tr);}box.appendChild(summary);for(const note of cargo.notes||[])box.appendChild(gpEl('p',note));
}
function gpRender(id,data,scope,freshSurvey=false) {gpTokenFrom(data,scope);if(data.module!==id)throw Error('玩法模块不匹配');const s=gpGet(id),oldKey=gpJson(s.data?.view);const samePlan=s.plan&&data.lastPlan?.batchId===s.plan.batchId&&data.lastPlan?.planHash===s.plan.planHash;if(oldKey!==gpJson(data.view)&&!samePlan){s.selected.clear();if(s.data){s.plan=null;gpClear($('gp-'+id+'-plan-view'));}}s.data=data;s.scope=viewGuard.capture();if(freshSurvey)s.dirty=false;$('gp-'+id+'-status').textContent=gpJson({status:data.status,functions:data.functions});if(!s.configDirty){$('gp-'+id+'-config').value=gpJson(data.config||{enabled:false});gpConfigFields(id,data.config||{enabled:false});}else{try{gpConfigFields(id,gpParse('gp-'+id+'-config'));}catch(error){gpClear($('gp-'+id+'-config-fields'));s.numberConfigControls=[];s.listConfigControls=[];}}const facts=gpClear($('gp-'+id+'-facts'));gpDetails(facts,'查询事实、统计与缺口',data.view);gpRenderCandidates(id);if(id==='formation'&&!s.dirty)gpRenderFormation(data.view);if(id==='alliance')gpRenderAlliance(data.view);if(id==='treasure')gpRenderTreasure(data.view);if(id==='naval'){gpRenderNaval(data.view);gpRenderNavalRules();}if(id==='fleet'){gpRenderFleetOperations(data.view);gpRenderFleetFormation(data.view);gpRenderCargo(data.view);}if(id==='material-packs'||id==='heroes'||id==='production'||id==='farm'||id==='equipment-forge'||id==='formation-unlock'||id==='equipment-growth'||id==='badge-growth'||id==='antique-growth'||id==='museum'||id==='pirate-sweep'||id==='task-rewards'||id==='mail'||id==='afk-level-rewards'||id==='free-gold'||id==='free-recruit'||id==='trial-challenge'||id==='pet')gpRenderDomain(id,data.view);gpControls(id); }
async function refreshGameplay(id) {if(!GP_MODULES.includes(id)||!current||gpGet(id).pending)return;const scope=viewGuard.begin('gameplay-'+id),revision=gpRevision,s=gpGet(id);s.pending=true;gpControls(id);try{const data=await call('/api/gameplay?module='+encodeURIComponent(id),undefined,scope);if(!gpSafe(scope,revision))return;gpRender(id,data,scope);$('gp-'+id+'-hint').textContent='已读取本账号缓存；没有发起游戏写操作。';}catch(error){if(gpSafe(scope,revision)){s.data=null;s.plan=null;gpClear($('gp-'+id+'-candidates'));$('gp-'+id+'-hint').textContent='读取失败：'+error.message;}}finally{if(gpSafe(scope,revision)){s.pending=false;gpRenderCandidates(id);gpControls(id);}} }
async function gpMutate(id,route,payload,render) {const s=gpGet(id);if(!gpReady(id)||s.pending)return;const scope=viewGuard.begin('gameplay-'+id),revision=gpRevision,editRevision=s.revision;s.pending=true;gpControls(id);try{const data=await operationMutation(route,payload,scope);if(!gpSafe(scope,revision)||s.revision!==editRevision)return;if(data.accountId!=null&&data.accountId!==scope.account)throw Error('操作账号不匹配');if(render)render(data,scope);return data;}catch(error){if(gpSafe(scope,revision))$('gp-'+id+'-hint').textContent='操作停止：'+error.message;}finally{if(gpSafe(scope,revision)){s.pending=false;gpRenderCandidates(id);gpControls(id);}} }
async function gpPreview(id) {const s=gpGet(id);if($('gp-'+id+'-plan').disabled)return;const parameters=gpParse('gp-'+id+'-parameters'),selected=[...s.selected];await gpMutate(id,'/api/operations/plan',{module:id,mode:'Manual',selections:selected,parameters:parameters},data=>{const p=data.plan||data;if(p.accountId!==current||p.actions?.length!==selected.length||new Set(p.actions.map(r=>r.actionId)).size!==selected.length||p.actions.some(r=>!selected.includes(r.actionId)))throw Error('具体计划与选择不匹配');s.plan=p;gpRenderPlan($('gp-'+id+'-plan-view'),p);$('gp-'+id+'-hint').textContent='预览已生成，尚未授权。';}); }
async function gpAuthorize(id,plan,kind) {if(!gpPlanLive(plan))return;const scope=viewGuard.begin(kind==='workflow'?'workflow':'gameplay-'+id),revision=gpRevision;const text='账号 '+scope.account+' · 批次 '+plan.batchId+' · '+plan.planHash+'\n'+plan.actions.map(r=>(r.label||r.actionType)+' '+gpJson(r.target)+' 成本 '+operationCosts(r.costs)).join('\n')+'\n总资源消耗：'+operationCosts(plan.resourceBudget)+(gpQuotaText(plan)?'\n额度占用：'+gpQuotaText(plan):'')+(gpFarmHarvestText(plan)?'\n作物批次：'+gpFarmHarvestText(plan):'')+'\n只授权以上具体计划；未知结果立即停止。';if(!window.confirm(text)||!gpSafe(scope,revision))return;viewGuard.assert(scope);plan.consumed=true;const s=kind==='workflow'?null:gpGet(id);if(s){s.pending=true;gpControls(id);}else{wfPending=true;wfControls();}try{const permit=await operationMutation('/api/operations/authorize',{batchId:plan.batchId,planHash:plan.planHash,approvedActionIds:plan.actions.map(r=>r.actionId),resourceBudget:plan.resourceBudget,confirm:true},scope);if(!gpSafe(scope,revision))return;if((kind==='workflow'?wfPlan!==plan:gpGet(id).plan!==plan)||permit.batchId!==plan.batchId||typeof permit.permitId!=='string'||!permit.permitId)throw Error('授权批次不匹配');const result=await operationMutation('/api/operations/execute',{batchId:plan.batchId,permitId:permit.permitId},scope);if(!gpSafe(scope,revision))return;if(s){s.restore=plan.actions[0]?.restoreParameters||s.restore;$('gp-'+id+'-hint').textContent='已提交；结果以复读和执行历史为准。';if(result.status)s.data.status=typeof result.status==='object'?result.status:{finalStatus:result.status};}else{$('wf-hint').textContent='ACTION 已提交，请读取流程与执行历史；成功验证后再继续。';}}catch(error){if(gpSafe(scope,revision))$(kind==='workflow'?'wf-hint':'gp-'+id+'-hint').textContent='执行停止：'+error.message+'；请查看历史，勿重复发送。';}finally{if(gpSafe(scope,revision)){if(s){s.pending=false;gpRenderCandidates(id);gpControls(id);}else{wfPending=false;wfControls();}}} }
function gpSetFormation(manual) {if(!gpDomainSelectable('formation'))return;const view=gpGet('formation').data?.view;const rows=[...$('gp-formation-roster').children].filter(e=>e._formation?.check.checked).map(e=>e._formation);const parameters={...(view?.mode==='expedition'?{mode:'expedition',raidId:view.raidId}:{}),presetId:Number($('gp-formation-template').value)};if(!Number.isSafeInteger(parameters.presetId)||parameters.presetId<=0||!rows.length)throw Error('请选择模板和英雄');if(manual){parameters.heroPositions=rows.map(r=>{if(r.x.value===''||r.y.value==='')throw Error('每名英雄需要明确坐标');const x=Number(r.x.value),y=Number(r.y.value);if(!Number.isInteger(x)||!Number.isInteger(y))throw Error('坐标必须为整数');return {heroId:r.check.value,pos:{x:x,y:y}};});}else parameters.heroIds=rows.map(r=>r.check.value);$('gp-formation-parameters').value=gpJson(parameters);gpInvalidate('formation',true);$('gp-formation-hint').textContent='参数已更新；请只读探测重新验证解锁、英雄归属和站位。';}
function resetGameplay() {gpRevision++;antiqueState={pending:false};gpClear($('antique-summary-view'));$('antique-summary-hint').textContent='';exState={stage:null,rows:[]};gpClear($('ex-selected'));gpClear($('ex-detail'));$('ex-hint').textContent='';nfState={entries:[],scope:null,pending:false,loaded:false};gpClear($('nf-selected'));gpClear($('nf-detail'));$('nf-name').value='';$('nf-hint').textContent='';nfControls();gpToken=null;for(const id of GP_MODULES){delete gpState[id];for(const suffix of ['hint','status','facts','candidates','plan-view','config-fields'])$('gp-'+id+'-'+suffix).textContent='';$('gp-'+id+'-parameters').value='{}';$('gp-'+id+'-config').value='{}';gpControls(id);}gpClear($('gp-naval-rules'));gpClear($('gp-naval-observations'));gpClear($('gp-treasure-targets'));gpClear($('gp-fleet-operations'));gpClear($('gp-fleet-formations'));gpClear($('gp-fleet-cargo'));$('gp-formation-mode').value='mainline';$('gp-formation-raid').value='';gpClear($('gp-formation-template'));gpClear($('gp-formation-roster'));if($('gp-formation-layout'))gpClear($('gp-formation-layout'));wfData=null;wfPlan=null;wfPending=false;$('wf-unified-intent').value='';$('wf-unified-blocked').textContent='';wfUnifiedResetForm();wfCandidateCache=new Map();wfResetSettings();wfGraph={version:1,id:'workflow-1',name:'新工作流',nodes:[{id:'start',type:'START'},{id:'stop',type:'STOP'}],edges:[{from:'start',to:'stop'}]};gpClear($('wf-saved'));gpClear($('wf-status'));wfHistoryReset();gpClear($('wf-result'));gpClear($('wf-plan'));$('wf-hint').textContent='';wfRenderGraph();wfControls();}
function gameplayActivate(tab) {if(GP_MODULES.includes(tab))return refreshGameplay(tab);if(tab==='workflow')return refreshWorkflows();}
for(const id of GP_MODULES){$('gp-'+id+'-load').onclick=()=>refreshGameplay(id);$('gp-'+id+'-parameters').oninput=()=>{gpInvalidate(id,true);gpRenderCandidates(id);};$('gp-'+id+'-config').oninput=()=>{gpGet(id).configDirty=true;gpInvalidate(id,false);try{gpConfigFields(id,gpParse('gp-'+id+'-config'));}catch(error){$('gp-'+id+'-hint').textContent=error.message;}if(id==='naval')gpRenderNavalRules();};$('gp-'+id+'-history').onclick=()=>{const button=document.querySelector('#tabs button[data-tab="operations-history"]');if(button)button.click();};$('gp-'+id+'-config-save').onclick=async()=>{try{const config=gpParse('gp-'+id+'-config');await gpMutate(id,'/api/gameplay/config',{module:id,config:config},(data,scope)=>{gpGet(id).configDirty=false;gpInvalidate(id,true);if(data.module===id&&data.view)gpRender(id,data,scope);else{$('gp-'+id+'-config').value=gpJson(data.config||config);gpGet(id).data.config=data.config||config;gpConfigFields(id,data.config||config);}if(id==='naval')gpRenderNavalRules();$('gp-'+id+'-hint').textContent='本账号配置已保存，请重新探测。';});}catch(error){$('gp-'+id+'-hint').textContent=error.message;}};$('gp-'+id+'-survey').onclick=async()=>{try{const parameters=gpParse('gp-'+id+'-parameters');gpInvalidate(id,true);await gpMutate(id,'/api/gameplay/survey',{module:id,parameters:parameters},(data,scope)=>{gpRender(id,data,scope,true);$('gp-'+id+'-hint').textContent='探测完成，选择具体动作后预览。';});}catch(error){$('gp-'+id+'-hint').textContent=error.message;}};$('gp-'+id+'-plan').onclick=()=>gpPreview(id).catch(error=>$('gp-'+id+'-hint').textContent=error.message);$('gp-'+id+'-authorize').onclick=()=>gpAuthorize(id,gpGet(id).plan);$('gp-'+id+'-stop').onclick=()=>gpMutate(id,'/api/operations/stop',{},data=>{gpGet(id).data.status=data.status||data;$('gp-'+id+'-hint').textContent='已停止后续操作；未决保护继续保留。';});}
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

const WF_UNIFIED_KINDS = {
 main:'主线任务领奖',branch:'支线任务领奖',achievement:'成就领奖',daily:'每日任务领奖','mail-claim':'单封邮件附件','mail-read':'单封空附件邮件已读','mail-enumeration':'只读邮箱有界枚举','afk-level-reward':'挂机单档等级奖励',
 'daily-activity':'日活跃单档领奖','daily-gift':'固定免费赠礼','weekly-lottery-gift':'周转盘免费礼包1000','weekly-unique-lottery-gift':'周翻牌免费礼包1000','weekly-chip-gift':'周芯片免费礼包1000','weekly-chip-task':'周芯片当前轮次任务领奖',
 'free-recruit':'普通免费英雄招募','alliance-order':'联盟城市募兵订单',museum:'博物馆探险出发',stage:'有限主线战斗（不自动领奖）','free-gold':'普通免费点金','trial-challenge':'英雄经验试炼首通','pirate-sweep':'单目标海面扫荡'
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
 const choices=phase==='tasks'?['main','branch','achievement','daily','daily-activity','daily-gift','weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift','weekly-chip-task','mail-claim','mail-read','mail-enumeration','afk-level-reward']:['daily','daily-activity','daily-gift','weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift','weekly-chip-task','free-recruit','stage','free-gold','trial-challenge','pirate-sweep','alliance-order','museum'];
 gpClear(select);for(const kind of choices){const option=gpEl('option',WF_UNIFIED_KINDS[kind]);option.value=kind;select.appendChild(option);}
 select.value=choices.includes(previous)?previous:choices[0];wfUnifiedControls();
}
function wfUnifiedControls() {
 const locked=!wfUnifiedEditable();
 for(const box of ['steps','budget-rows'])for(const card of $('wf-unified-'+box).children)for(const control of card.children)if(control.tagName.toLowerCase()==='button')control.disabled=locked||control.dataset.unifiedBoundary==='true';
 for(const id of ['entry','rounds','every','limits','phase','kind','add','budget-kind','budget-id','budget-add','form-load'])$('wf-unified-'+id).disabled=locked;
 const kind=$('wf-unified-kind').value,needsId=['mail-enumeration','afk-level-reward','mail-claim','mail-read','alliance-order','main','branch','achievement','daily','daily-activity','pirate-sweep','weekly-chip-task','stage','museum'].includes(kind);
 $('wf-unified-target').disabled=locked||!needsId;
 $('wf-unified-chip-round').disabled=locked||kind!=='weekly-chip-task';
 $('wf-unified-mail-page').disabled=locked||!['mail-claim','mail-read'].includes(kind);
 for(const field of ['museum-heroes','museum-factor'])$('wf-unified-'+field).disabled=locked||kind!=='museum';
 $('wf-unified-target-label').textContent=kind==='mail-enumeration'?'邮箱枚举页数上限（1–100，从0页开始）':kind==='afk-level-reward'?'精确挂机奖励等级（按配置下一档）':['mail-claim','mail-read'].includes(kind)?'精确邮件 ID（正int64字符串）':kind==='alliance-order'?'精确联盟城市 ID':kind==='museum'?'精确博物馆探险关卡 ID':kind==='stage'?'本节点最多尝试（1–200，战败停止）':kind==='pirate-sweep'?'精确海盗 UID':kind==='daily-activity'?'精确日活跃档位 ID':kind==='weekly-chip-gift'?'固定礼包：1000（当前周芯片）':kind==='weekly-unique-lottery-gift'?'固定礼包：1000（当前周翻牌）':kind==='weekly-lottery-gift'?'固定礼包：1000（当前周转盘）':kind==='daily-gift'?'固定礼包：赠礼':'精确任务 ID';
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
 const live=()=>Boolean(gpSafe(scope,revision)&&gpReady(id)&&gpGet(id)===s&&s.data===data&&s.revision===edit&&$('gp-'+id+'-parameters').value===source&&!s.pending&&!snapshot?.busy&&wfUnifiedEditable());
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
  &&data?.view?.candidates?.includes(row)&&gpDomainSelectable(id)&&wfUnifiedEditable());
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
 if(!explicit)card.appendChild(gpEl('p','此候选缺少明确业务参数，不能直接加入 Loop 声明；原玩法入口保持可用。'));
}

function wfUnifiedResetForm() {
 for(const [id,value]of Object.entries({entry:'loop',rounds:'1',every:'0',phase:'tasks',target:'','mail-page':'','chip-round':'','museum-heroes':'','museum-factor':'','budget-kind':'resources','budget-id':'','budget-num':'','budget-type':''}))$('wf-unified-'+id).value=value;
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
  const card=gpEl('div'),kind=phase==='world'?row?.module:row?.kind==='mail'?'mail-'+row?.action:row?.kind||(phase==='dailies'?(row?.action==='claim'?'daily':({1002:'free-recruit',1003:'stage',1006:'free-gold',1009:'trial-challenge',1010:'pirate-sweep',1012:'alliance-order',1016:'museum'})[row?.taskId]):'');
  const target=row?.maxPages??row?.level??row?.emailId??row?.packId??row?.tierId??(kind==='pirate-sweep'?row?.parameters?.uid:kind==='museum'?row?.parameters?.stageId:kind==='alliance-order'?row?.parameters?.cityId:row?.taskId)??'';
  card.appendChild(gpEl('span',phase+' 第 '+(index+1)+' 项 · '+(WF_UNIFIED_KINDS[kind]||kind||'待核对业务')+(target!==''?' · '+target:'')));
  if(['mail-claim','mail-read'].includes(kind))card.appendChild(gpEl('p','精确来源页：'+String(row.pageNo??'UNKNOWN')+'；重新调查后逐项授权，UNKNOWN停止后续步骤。'));
  if(kind==='mail-enumeration')card.appendChild(gpEl('p','只读SURVEY；按明确页数上限观察邮箱，不自动标已读、领取附件或选择任何邮件。领取需另行指定来源页和邮件ID，重新调查并授权。'));
  if(kind==='museum'&&phase==='dailies')gpDetails(card,'明确探险队伍与倍率',row?.parameters);
  if(kind==='stage'&&phase==='dailies')gpDetails(card,'明确主线运行边界',row?.parameters?.config);
  if(phase==='world'){card.appendChild(gpEl('p',row?.type==='SURVEY'?'只读SURVEY；运行时按原Function重新调查，不自动选择、授权或执行动作。':'精确候选：'+(typeof row?.selection==='string'?row.selection:row?.selection?.actionId??'未指定精确候选')));gpDetails(card,'明确业务参数',row?.parameters);}
  for(const [label,offset]of [['上移',-1],['下移',1],['移除',0]]){const button=gpEl('button',label);button.type='button';button.dataset.unifiedStep=phase+':'+index;button.dataset.unifiedMove=String(offset);button.dataset.unifiedBoundary=String(offset!==0&&(index+offset<0||index+offset>=data[phase].length));button.disabled=!wfUnifiedEditable()||offset!==0&&(index+offset<0||index+offset>=data[phase].length);button.onclick=()=>{if(!live()||button.disabled)return;wfUnifiedEdit(next=>{if(offset===0)next[phase].splice(index,1);else [next[phase][index],next[phase][index+offset]]=[next[phase][index+offset],next[phase][index]];});};card.appendChild(button);}
  steps.appendChild(card);
 });
 if(!steps.childElementCount)steps.textContent='尚未添加业务步骤。';
 wfRenderBudgetRows('wf-unified',data.budget,live,(kind,index)=>wfUnifiedEdit(next=>next.budget[kind].splice(index,1)),'unifiedBudget');
 wfUnifiedControls();
}
$('wf-unified-intent').oninput=()=>wfUnifiedBoundaryControls();
$('wf-unified-phase').onchange=wfUnifiedKinds;$('wf-unified-kind').onchange=wfUnifiedControls;$('wf-unified-budget-kind').onchange=wfUnifiedControls;
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
 const rewards=['mail-enumeration','afk-level-reward','mail-claim','mail-read','main','branch','achievement','daily','daily-activity','daily-gift','weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift','weekly-chip-task'],dailyDrivers={'free-recruit':1002,'stage':1003,'free-gold':1006,'trial-challenge':1009,'pirate-sweep':1010,'alliance-order':1012,'museum':1016};let row;
 if(phase==='tasks'&&!rewards.includes(kind)||phase==='dailies'&&!['daily','daily-activity','daily-gift','weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift','weekly-chip-task',...Object.keys(dailyDrivers)].includes(kind))throw Error('该分组不支持所选业务');
 if(kind==='mail-enumeration')row={kind,maxPages:wfUnifiedNumber($('wf-unified-target').value,1,100,'邮箱枚举页数上限')};
 else if(kind==='afk-level-reward')row={kind,level:wfUnifiedNumber($('wf-unified-target').value,1,2147483647,'挂机奖励等级')};
 else if(['mail-claim','mail-read'].includes(kind)){
  const emailId=$('wf-unified-target').value;if(!/^[1-9][0-9]{0,18}$/.test(emailId)||BigInt(emailId)>9223372036854775807n)throw Error('邮件ID须为精确正int64字符串，不接受首尾空格或科学计数');
  row={kind:'mail',pageNo:wfUnifiedNumber($('wf-unified-mail-page').value,0,2147483647,'邮件来源页'),emailId,action:kind==='mail-read'?'read':'claim'};
 }
 else if(kind==='weekly-chip-task')row={kind,round:wfUnifiedNumber($('wf-unified-chip-round').value,1,2147483647,'周芯片当前轮次'),taskId:wfUnifiedNumber($('wf-unified-target').value,1,2147483647,'任务ID'),...(phase==='dailies'?{action:'claim'}:{})};
 else if(['weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift'].includes(kind))row={kind,packId:'1000',...(phase==='dailies'?{action:'claim'}:{})};
 else if(kind==='alliance-order')row={taskId:1012,action:'perform',parameters:{cityId:wfUnifiedNumber($('wf-unified-target').value,1,2147483647,'联盟城市ID')}};
 else if(kind==='museum'){
  const heroIds=$('wf-unified-museum-heroes').value.split(/\r?\n/);
  if(!heroIds.length||heroIds.length>100||heroIds.some(id=>!id||id!==id.trim()||id.length>200)||new Set(heroIds).size!==heroIds.length)throw Error('探险英雄需每行一个唯一且无首尾空格的ID，最多100项');
  row={taskId:1016,action:'perform',parameters:{stageId:wfUnifiedNumber($('wf-unified-target').value,1,2147483647,'探险关卡ID'),heroIds,factor:wfUnifiedNumber($('wf-unified-museum-factor').value,1,2147483647,'探险时间倍率')}};
 }
 else if(kind==='stage')row={taskId:1003,action:'perform',parameters:{config:{enabled:true,retryDelaySeconds:10,maxAttempts:wfUnifiedNumber($('wf-unified-target').value,1,200,'主线最多尝试'),maxStage:null,stopOnDefeat:true}}};
 else if(kind==='daily-gift')row={kind,packId:'赠礼',...(phase==='dailies'?{action:'claim'}:{})};
 else if(kind==='daily-activity')row={kind,tierId:wfUnifiedNumber($('wf-unified-target').value,1,2147483647,'档位ID'),...(phase==='dailies'?{action:'claim'}:{})};
 else if(rewards.includes(kind)){const taskId=wfUnifiedNumber($('wf-unified-target').value,1,2147483647,'任务ID');row=phase==='tasks'?{kind,taskId}:{taskId,action:'claim'};}
 else row={taskId:dailyDrivers[kind],action:'perform',...(kind==='pirate-sweep'?{parameters:{uid:wfUnifiedNumber($('wf-unified-target').value,1,Number.MAX_SAFE_INTEGER,'海盗UID')}}:{})};
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
 const sync=()=>{
  const locked=!live();$('wf-budget-enabled').disabled=locked;$('wf-budget-enabled').checked=draft.enabled;
  for(const id of ['kind','id','add'])$('wf-budget-'+id).disabled=locked||!draft.enabled;
  const uid=$('wf-budget-kind').value==='uids';$('wf-budget-type').disabled=locked||!draft.enabled||!uid;$('wf-budget-num').disabled=locked||!draft.enabled||uid;$('wf-budget-apply').disabled=locked;
  for(const card of $('wf-budget-rows').children)for(const control of card.children)if(control.tagName.toLowerCase()==='button')control.disabled=locked||!draft.enabled;
 };
 const rows=()=>{if(draft.data)wfRenderBudgetRows('wf',draft.data,()=>live()&&draft.enabled,(kind,index)=>{draft.data[kind].splice(index,1);rows();sync();},'workflowBudget');else $('wf-budget-rows').textContent=draft.error;};
 $('wf-budget-enabled').onchange=()=>{if(!live())return;draft.enabled=$('wf-budget-enabled').checked;sync();};
 $('wf-budget-kind').onchange=sync;
 $('wf-budget-add').onclick=()=>{if(!live()||!draft.enabled)return;try{const {kind,row}=wfBudgetInput('wf',draft.data);draft.data[kind].push(row);rows();sync();$('wf-budget-hint').textContent='预算草稿已更新；尚未应用、保存或执行。';}catch(error){$('wf-budget-hint').textContent=error.message;}};
 $('wf-budget-apply').onclick=()=>{
  if(!live())return;
  if(!draft.enabled&&graph.runPolicy!==undefined){$('wf-budget-hint').textContent='请先明确移除运行边界，再移除累计预算。';return;}
  if(draft.enabled)graph.budget=JSON.parse(JSON.stringify(draft.data));else delete graph.budget;
  wfChanged();wfRenderGraph();$('wf-budget-hint').textContent='当前图预算已更新；须保存并重新生成具体计划和授权，不会增加正在运行的额度。';
 };
 rows();wfNodeFormControls.push(sync);sync();
}

function wfEventRuleValid(rule){return Boolean(rule&&typeof rule==='object'&&!Array.isArray(rule)&&(rule.kind==='DAILY_TASK_RESET'?Object.keys(rule).length===1:Object.keys(rule).length===2&&['VIP_LEVEL_CHANGED','PLAYER_LEVEL_CHANGED'].includes(rule.kind)&&Number.isInteger(rule.level)&&rule.level>=0&&rule.level<=2147483647));}
function wfEventText(policy){return policy?.eventTrigger?'业务事件：'+(policy.eventTrigger.kind==='DAILY_TASK_RESET'?'收到新的每日任务重置推送；dailyResetTime是服务端原标记，不推断时区或日界':(policy.eventTrigger.kind==='PLAYER_LEVEL_CHANGED'?'角色等级':'VIP等级')+'变为明确值 '+policy.eventTrigger.level)+'；只消费本次连接起始游标之后的首次匹配变化。推送只启动新调查，不证明资格、奖励或写入成功；重启不恢复监听或权限。':'';}
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
function wfRunPolicyRender(){
 const graph=wfGraph,stored=gpJson(graph.runPolicy),declared=Object.hasOwn(graph,'runPolicy');
 if(!wfPolicyDraft||wfPolicyDraft.graph!==graph||wfPolicyDraft.stored!==stored||wfPolicyDraft.declared!==declared||!gpSafe(wfPolicyDraft.scope,wfPolicyDraft.revision)){
  const draft={graph,stored,declared,scope:viewGuard.capture(),revision:gpRevision,enabled:declared,error:null};wfPolicyDraft=draft;
  const policy=graph.runPolicy;
  if(declared&&(!policy||typeof policy!=='object'||Array.isArray(policy)||Object.keys(policy).some(key=>!['maxDurationMs','maxActions','modules','maxRounds','roundIntervalMs','schedule','eventTrigger'].includes(key))||!Number.isSafeInteger(policy.maxDurationMs)||policy.maxDurationMs<1||policy.maxDurationMs>WF_GRAPH_LIMITS.runDurationMs||!Number.isSafeInteger(policy.maxActions)||policy.maxActions<0||policy.maxActions>WF_GRAPH_LIMITS.actionPlans||!Array.isArray(policy.modules)||policy.modules.length>WF_GRAPH_LIMITS.nodes||policy.modules.some(id=>!WF_MODULES.includes(id))||new Set(policy.modules).size!==policy.modules.length||policy.maxRounds!==undefined&&(!Number.isSafeInteger(policy.maxRounds)||policy.maxRounds<1||policy.maxRounds>WF_GRAPH_LIMITS.rounds)||policy.roundIntervalMs!==undefined&&(policy.maxRounds===undefined||!Number.isSafeInteger(policy.roundIntervalMs)||policy.roundIntervalMs<0||policy.roundIntervalMs>WF_GRAPH_LIMITS.waitMs)||policy.schedule!==undefined&&!wfScheduleValid(policy.schedule)||policy.eventTrigger!==undefined&&(!wfEventRuleValid(policy.eventTrigger)||policy.schedule!==undefined)))draft.error='原运行边界结构需通过完整图 JSON 修正；表单保留原值。';
  draft.duration=declared&&!draft.error?String(policy.maxDurationMs):'';draft.actions=declared&&!draft.error?String(policy.maxActions):'';draft.modules=declared&&!draft.error?policy.modules.join('\n'):'';draft.rounds=declared&&!draft.error&&policy.maxRounds!==undefined?String(policy.maxRounds):'';draft.interval=declared&&!draft.error&&policy.roundIntervalMs!==undefined?String(policy.roundIntervalMs):'';
  draft.scheduled=declared&&!draft.error&&policy.schedule!==undefined;draft.kind=draft.scheduled?policy.schedule.kind:'ONCE';draft.at=draft.scheduled&&draft.kind==='ONCE'?new Date(Date.parse(policy.schedule.at)+8*3600000).toISOString().slice(0,-1):'';draft.localTime=draft.scheduled&&draft.kind!=='ONCE'?policy.schedule.localTime:'';draft.weekDay=draft.scheduled&&draft.kind==='WEEKLY'?String(policy.schedule.weekDay):'';
  draft.eventEnabled=declared&&!draft.error&&policy.eventTrigger!==undefined;draft.eventLevel=draft.eventEnabled&&policy.eventTrigger.kind!=='DAILY_TASK_RESET'?String(policy.eventTrigger.level):'';draft.eventKind=draft.eventEnabled?policy.eventTrigger.kind:'VIP_LEVEL_CHANGED';
  $('wf-policy-hint').textContent=draft.error||'本地草稿需明确应用；动作上限按计划次数累计，不代表实际派发或成功次数。';
 }
 const draft=wfPolicyDraft,live=()=>wfEditorEditable()&&wfPolicyDraft===draft&&wfGraph===graph&&gpSafe(draft.scope,draft.revision)&&gpJson(graph.runPolicy)===stored&&Object.hasOwn(graph,'runPolicy')===declared&&!draft.error;
 const sync=()=>{const locked=!live();$('wf-policy-enabled').checked=draft.enabled;$('wf-policy-enabled').disabled=locked;$('wf-policy-apply').disabled=locked;for(const [id,key]of [['duration','duration'],['actions','actions'],['modules','modules'],['rounds','rounds'],['interval','interval'],['at','at'],['kind','kind'],['local-time','localTime'],['week-day','weekDay']]){$('wf-policy-'+id).value=draft[key];$('wf-policy-'+id).disabled=locked||!draft.enabled||['at','kind','local-time','week-day'].includes(id)&&!draft.scheduled||id==='at'&&draft.kind!=='ONCE'||id==='local-time'&&draft.kind==='ONCE'||id==='week-day'&&draft.kind!=='WEEKLY';}$('wf-policy-scheduled').checked=draft.scheduled;$('wf-policy-scheduled').disabled=locked||!draft.enabled;$('wf-policy-event-enabled').checked=draft.eventEnabled;$('wf-policy-event-enabled').disabled=locked||!draft.enabled;$('wf-policy-event-kind').value=draft.eventKind;$('wf-policy-event-kind').disabled=locked||!draft.enabled||!draft.eventEnabled;$('wf-policy-event-level').value=draft.eventLevel;$('wf-policy-event-level').disabled=locked||!draft.enabled||!draft.eventEnabled||draft.eventKind==='DAILY_TASK_RESET';};
 $('wf-policy-enabled').onchange=()=>{if(!live())return;draft.enabled=$('wf-policy-enabled').checked;sync();};
 $('wf-policy-event-enabled').onchange=()=>{if(!live()||!draft.enabled)return;draft.eventEnabled=$('wf-policy-event-enabled').checked;sync();};$('wf-policy-event-kind').onchange=()=>{if(!live()||!draft.enabled||!draft.eventEnabled)return;draft.eventKind=$('wf-policy-event-kind').value;sync();};$('wf-policy-event-level').oninput=()=>{if(!live()||!draft.enabled||!draft.eventEnabled)return;draft.eventLevel=$('wf-policy-event-level').value;};
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
    if(draft.scheduled){if(draft.kind!=='ONCE'){const schedule={kind:draft.kind,localTime:draft.localTime,timeZone:'Asia/Shanghai',missedPolicy:'SKIP'};if(draft.kind==='WEEKLY')schedule.weekDay=integer(draft.weekDay,1,7);if(!wfScheduleValid(schedule))throw Error('请填写明确的日周规则与完整上海时刻，不推断游戏日界。');next.schedule=schedule;}else{if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}$/.test(draft.at))throw Error('请填写完整上海时间，精确到毫秒。');const at=Date.parse(draft.at+'+08:00');if(!Number.isFinite(at)||new Date(at+8*3600000).toISOString().slice(0,-1)!==draft.at)throw Error('上海日期或时间无效，不自动修正日期。');next.schedule={kind:'ONCE',at:new Date(at).toISOString(),timeZone:'Asia/Shanghai',missedPolicy:'SKIP'};}}if(draft.eventEnabled){if(draft.scheduled)throw Error('本次运行须明确选择时间或业务事件触发，不能隐式组合。');next.eventTrigger=draft.eventKind==='DAILY_TASK_RESET'?{kind:draft.eventKind}:{kind:draft.eventKind,level:integer(draft.eventLevel,0,2147483647)};if(!wfEventRuleValid(next.eventTrigger))throw Error('请选择明确支持的业务事件来源。');}graph.runPolicy=next;
   }else delete graph.runPolicy;
   wfChanged();wfRenderGraph();$('wf-policy-hint').textContent='运行边界已应用到当前图；每批仍需具体授权，到限停止，UNKNOWN 不自动重放。';
  }catch(error){$('wf-policy-hint').textContent=error.message;}
 };
 wfNodeFormControls.push(sync);sync();
}

function wfControls(){if(!wfEditorEditable()){wfNodeDrag=null;wfEdgeDrag=null;}for(const sync of wfNodeFormControls)sync();wfUnifiedControls();wfUnifiedSyncCandidateControls();$('wf-unified-prepare').disabled=!current||!gameplayCsrfToken()||wfPending||wfData?.status?.running===true;const ready=Boolean(wfData?.accountId===current&&gameplayCsrfToken());for(const id of ['save','simulate'])$('wf-'+id).disabled=!ready||wfPending;const workflowStatus=wfData?.status??{},ownWorkflowBusy=Boolean(workflowStatus.runId&&snapshot?.busy==='workflow:'+workflowStatus.runId);$('wf-start').disabled=!ready||wfPending||!snapshot?.connected||Boolean(snapshot?.busy)||workflowStatus.running===true;$('wf-resume').disabled=!ready||wfPending||!snapshot?.connected||Boolean(snapshot?.busy&&!ownWorkflowBusy)||(workflowStatus.status??workflowStatus.state)!=='AWAITING_AUTHORIZATION';$('wf-stop').disabled=!ready||wfPending;$('wf-authorize').disabled=wfPending||!snapshot?.connected||!gpPlanLive(wfPlan)||(workflowStatus.status??workflowStatus.state)!=='AWAITING_AUTHORIZATION'||Boolean(workflowStatus.runAuthorization);wfRunAuthorizationControls();$('wf-load').disabled=wfPending||!current;for(const id of ['add','add-edge','json-apply','open','id','name','json'])$('wf-'+id).disabled=!wfEditorEditable();wfSettingsControls();wfHistoryControls();}
function wfRunAuthorizationControls(){
 const data=wfData,status=data?.status,offer=status?.authorizationOffer,plan=wfPlan,scope=viewGuard.capture(),revision=gpRevision,box=$('wf-run-scope');
 const live=()=>Boolean(data&&data===wfData&&data.accountId===current&&gpSafe(scope,revision)&&!wfPending&&snapshot?.connected&&gameplayCsrfToken()&&!wfRunAuthorizationAttempts.has(wfRunAttemptKey(status))&&!status.runAuthorization&&offer?.accountId===current&&offer.runId===status.runId&&offer.graph?.runPolicy&&offer.graph.budget&&wfPlan===plan&&(wfScheduledAuthorization(status)||wfEventAuthorization(status)||(status?.status??status?.state)==='AWAITING_AUTHORIZATION'&&gpPlanLive(plan)));
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
  wfHistoryRevision++; wfHistoryPending = false;
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
function wfHistoryRender(data) {
  const box = gpClear($('wf-history-detail'));
  box.appendChild(gpEl('p', '运行 ' + data.workflowRunId + ' · 流程 ' + data.workflowDefinitionId + ' · ' + data.status + (data.recovered ? ' · 已恢复的只读记录' : '')));
  if(data.currentNode)box.appendChild(gpEl('p','原运行位置：'+data.currentNode+'；位置记录不证明该节点完成或业务成功。'));
  if(data.reason)box.appendChild(gpEl('p','运行说明：'+data.reason));
  if (data.preparation) {
    box.appendChild(gpEl('p', '原声明入口：' + data.preparation.entry + '；编译未纳入 ' + data.preparation.blocked.length + ' 项。此信息仅供审计，不证明游戏资格或已执行。'));
    for (const row of data.preparation.blocked) box.appendChild(gpEl('p', row.phase + ' 第 ' + (row.index + 1) + ' 项 · 任务 ' + row.taskId + ' · 未执行：' + row.reason));
  }
  if(data.runAuthorization){box.appendChild(gpEl('p','原有限运行授权：'+data.runAuthorization.approvedAt+' · 图摘要 '+data.runAuthorization.scope.graphHash+'；仅供审计，重启不可恢复授权。'));gpDetails(box,'原运行授权范围',data.runAuthorization.scope);}
  if(data.runPolicy)box.appendChild(gpEl('p','本次运行边界：总时长 '+data.runPolicy.maxDurationMs+' 毫秒 · 动作计划 '+data.actionPlans+' / '+data.runPolicy.maxActions+' · 允许玩法 '+(data.runPolicy.modules.join('、')||'无业务节点')+' · 到期 '+data.expiresAt+'；此记录只供审计，不能恢复授权。'));
  if(data.runPolicy?.eventTrigger){box.appendChild(gpEl('p',wfEventText(data.runPolicy)));gpDetails(box,'原业务事件身份、起始游标与消费证据',data.eventTrigger??null);}
  if(data.runPolicy?.schedule){box.appendChild(gpEl('p',wfScheduleText(data.runPolicy,data.trigger?.scheduledAt)));gpDetails(box,'原触发状态与时刻',data.trigger??null);}
  if(data.runPolicy?.maxRounds!==undefined)box.appendChild(gpEl('p','本次有限重复：已完成 '+data.completedRounds+' / '+data.runPolicy.maxRounds+' 轮 · 当前第 '+data.round+' 轮 · 轮间隔 '+(data.runPolicy.roundIntervalMs??0)+' 毫秒；全部轮次共享原累计限额。'));
  box.appendChild(gpEl('p', '未关联的操作记录：' + data.unlinkedOperationCount + '。仅显示已持久化且归属一致的动作。'));
  for (const row of data.waits || []) box.appendChild(gpEl('p', '节点 ' + row.nodeId + (row.round!==undefined?' · 第 '+row.round+' 轮':'')+' · ' + (row.result === 'WAIT_STARTED' ? '等待已开始' : row.result === 'WAITED' ? '等待已结束' : row.result==='ROUND_WAIT_STARTED'?'轮间等待已开始':row.result==='ROUND_WAITED'?'轮间等待已结束':row.result) + ' · 时长 ' + (row.durationMs === undefined ? '未知' : row.durationMs + ' 毫秒') + ' · ' + (row.timestamp || '时间未知') + '；本次运行的间隔记录，不代表游戏冷却或可重放资格。'));
  for(const row of data.surveys||[]){
    const audit=row.mailbox,naval=row.navalObservation;
    box.appendChild(gpEl('p','只读调查节点 '+row.nodeId+(row.round!==undefined?' · 第 '+row.round+' 轮':'')+' · '+(row.module||'未知模块')+' · '+(row.timestamp||'时间未知')));
    if(naval){
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
async function wfReadHistory() {
  const runId = $('wf-history-selected').value;
  if (!current || wfHistoryPending || !wfHistoryRows.some(row => row.runId === runId)) return;
  const scope = viewGuard.begin('workflow-history'), revision = gpRevision, requestRevision = ++wfHistoryRevision;
  const live = () => gpSafe(scope, revision) && requestRevision === wfHistoryRevision && $('wf-history-selected').value === runId;
  wfHistoryPending = true; gpClear($('wf-history-detail')); $('wf-history-hint').textContent = '正在读取本账号运行记录。'; wfHistoryControls();
  try {
    const data = await call('/api/workflows/history?workflowRunId=' + encodeURIComponent(runId), undefined, scope);
    if (!live()) return;
    if (data.accountId !== scope.account || data.workflowRunId !== runId || data.readOnly !== true || data.resumable !== false || !Array.isArray(data.nodes)) throw Error('工作流历史归属不匹配');
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


function wfParameterForm(card,node) {
 const schema=WF_PARAMETER_SCHEMAS[node.module];if(!schema){wfJsonField(card,'业务参数',node.parameters,value=>{if(value===undefined)delete node.parameters;else node.parameters=value;wfCandidateCache.delete(node.id);wfRenderGraph();});return;}
 const scope=viewGuard.capture(),revision=gpRevision,graph=wfGraph,module=node.module,type=node.type,stored=gpJson(node.parameters);
 const editable=()=>Boolean(current&&!wfPending&&!wfData?.status?.running);
 const live=()=>editable()&&gpSafe(scope,revision)&&wfGraph===graph&&graph.nodes.includes(node)&&node.module===module&&node.type===type&&gpJson(node.parameters)===stored&&Array.from($('wf-nodes').children).includes(card);
 const section=gpEl('div'),note=gpEl('p','明确启用字段后填写业务选择，再应用。未启用字段从声明中移除；复杂参数原样保留。领域资格、成本和 D6 仍由原 Function 校验。');
 section.appendChild(gpEl('h4','业务参数'));section.appendChild(note);card.appendChild(section);
 const labels={packId:'礼包 ID',itemId:'物品 ID',num:'数量',action:'业务操作',buildingId:'建筑 ID',jobIdx:'培育队列索引（含 0）',level:'等级',pageNo:'邮件页号（含 0）',emailId:'精确邮件 ID',kind:'任务种类',taskId:'精确任务 ID',tierId:'活跃奖励档位',uid:'精确目标 UID',cityId:'城市 ID',allowLowerLevel:'允许已授权的较低等级目标',antiqueId:'古董 ID',suitId:'古董套装 ID',heroId:'英雄 ID',pos:'栏位',presetId:'阵容模板 ID',makeId:'制造配方 ID',allowUniversal:'允许万能材料',productId:'产品 ID',mode:'业务模式',raidId:'远征 raidId',season:'赛季',techId:'科技 ID',targetLevel:'目标等级',stageId:'关卡 ID',factor:'培养倍率',exhibitionId:'展览 ID',useNum:'使用数量',payment:'支付方式',caseIndex:'展示栏位',keywordType:'关键词类型',shipIndex:'货船索引',cargoIndex:'货格索引',targetId:'目标 ID',playerId:'精确玩家 ID',minimumPower:'最低战力',maximumPower:'最高战力',skillIdx:'技能索引（含 0）',memberIds:'精确联盟成员 ID 列表',reqIds:'精确联盟求助 ID 列表',itemIds:'物品 ID 列表',heroIds:'英雄 ID 列表',fleetBuildingIds:'舰队建筑 ID 列表',excludeGuildIds:'排除联盟 ID 列表',cityIds:'城市 ID 列表',heroPositions:'英雄精确站位',screenCenter:'屏幕中心坐标',config:'主线设置',x:'X 坐标',y:'Y 坐标',enabled:'启用',retryDelaySeconds:'失败间隔秒数',maxAttempts:'最多场数',maxStage:'最高关卡',stopOnDefeat:'首败停止',interStageDelay:'场间等待秒数',minSeconds:'最少秒数',maxSeconds:'最多秒数',formation:'阵容设置'};
 const enums={feed:'投喂',claim:'领取',read:'标为已读',main:'主线',branch:'支线',achievement:'成就',daily:'每日任务','daily-activity':'日活跃','daily-gift':'固定免费赠礼',activate:'激活',star:'升星',suit:'套装成长',master:'大师成长',exchange:'碎片兑换','put-on':'穿戴',refine:'精炼',make:'制造',pick:'收取',plant:'播种',harvest:'收取',expedition:'远征',level:'升级',skill:'技能升级','exclusive-level':'专武升级','exclusive-star':'专武升星','fragment-exchange':'万能碎片兑换',ITEM:'自有物品',FREE:'免费',PREMIUM:'钻石（D6 禁止）'};
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
   node.parameters=next;wfCandidateCache.delete(node.id);wfChanged();wfRenderGraph();$('wf-hint').textContent='业务参数已应用；原候选选择仍需重新采集核验，保存与执行继续由原Function校验。';
  }catch(error){note.textContent='参数未应用：'+error.message;}
 };
 wfNodeFormControls.push(sync);sync();
 const advanced=gpEl('details');advanced.appendChild(gpEl('summary','高级业务参数 JSON'));wfJsonField(advanced,'业务参数',node.parameters,value=>{if(value===undefined)delete node.parameters;else node.parameters=value;wfCandidateCache.delete(node.id);wfRenderGraph();});card.appendChild(advanced);
}

function wfConditionForm(card,node) {
 const scope=viewGuard.capture(),revision=gpRevision,graph=wfGraph,stored=gpJson(node.condition),type=node.type;
 const editable=()=>Boolean(current&&!wfPending&&!wfData?.status?.running);
 const live=()=>editable()&&gpSafe(scope,revision)&&wfGraph===graph&&graph.nodes.includes(node)&&node.type===type&&gpJson(node.condition)===stored&&Array.from($('wf-nodes').children).includes(card);
 const section=gpEl('div'),note=gpEl('p','表单草稿只在点击“应用条件”后更新节点；缺失或类型不匹配的事实仍为 UNKNOWN。'),controls=[];
 card.appendChild(section);section.appendChild(gpEl('h4','条件设置'));section.appendChild(note);
 const field=(key,label,value,choices)=>{
  const wrap=gpEl('label',label+' '),input=gpEl(choices?'select':'input');input.dataset.workflowCondition=node.id;input.dataset.conditionField=key;
  if(choices)for(const [id,text]of choices){const option=gpEl('option',text);option.value=id;input.appendChild(option);}
  input.value=value??'';wrap.appendChild(input);section.appendChild(wrap);controls.push(input);return input;
 };
 const rule=node.condition||{},source=field('source','事实来源',rule.source??'survey',WF_CONDITION_FIELDS.sources.map(id=>[id,id==='survey'?'最近一次只读采集结果':'最近一次操作运行结果']));
 const pathBox=gpEl('div');section.appendChild(pathBox);let pathInputs=[];
 const operator=field('operator','比较方式',rule.operator??'EQ',WF_CONDITION_FIELDS.operators.map(id=>[id,({EQ:'等于',NE:'不等于',GT:'大于',GTE:'大于或等于',LT:'小于',LTE:'小于或等于',EXISTS:'字段存在（非 null）'})[id]]));
 const valueType=field('valueType','比较值类型',rule.value===null?'null':typeof rule.value==='number'?'number':typeof rule.value==='boolean'?'boolean':'string',[['string','文本（保留大整数原文）'],['number','数值'],['boolean','布尔值'],['null','null']]);
 const value=field('value','比较值',typeof rule.value==='string'||typeof rule.value==='number'?String(rule.value):'');
 const boolean=field('boolean','布尔值',String(rule.value===true),[['true','true'],['false','false']]);
 const apply=gpEl('button','应用条件');apply.type='button';apply.dataset.workflowConditionApply=node.id;section.appendChild(apply);
 const clear=gpEl('button','改用成功历史验证');clear.type='button';clear.dataset.workflowConditionClear=node.id;if(node.type==='VERIFY')section.appendChild(clear);
 const sync=()=>{
  const locked=!editable();for(const input of controls)input.disabled=locked;
  const exists=operator.value==='EXISTS';valueType.disabled=locked||exists;value.disabled=locked||exists||!['string','number'].includes(valueType.value);boolean.disabled=locked||exists||valueType.value!=='boolean';
  for(const input of pathInputs)input.disabled=locked;
  for(const row of pathBox.children)for(const child of row.children)if(child.dataset?.conditionPathRemove!==undefined)child.disabled=locked||pathInputs.length<=1;
  addPath.disabled=locked||pathInputs.length>=WF_CONDITION_FIELDS.maxDepth;apply.disabled=locked;clear.disabled=locked||node.condition===undefined;
 };
 const renderPaths=rows=>{
  gpClear(pathBox);pathInputs=rows.map((entry,index)=>{
   const row=gpEl('label','字段 '+(index+1)+' '),input=gpEl('input'),remove=gpEl('button','移除此字段');input.value=entry;input.dataset.workflowCondition=node.id;input.dataset.conditionField='path';input.dataset.conditionPath=String(index);
   remove.type='button';remove.dataset.conditionPathRemove=String(index);remove.onclick=()=>{if(!live()||!Array.from(pathBox.children).includes(row)||pathInputs.length<=1)return;renderPaths(pathInputs.filter((_,i)=>i!==index).map(field=>field.value));sync();};
   row.appendChild(input);row.appendChild(remove);pathBox.appendChild(row);return input;
  });
 };
 const addPath=gpEl('button','添加路径字段');addPath.type='button';addPath.dataset.workflowConditionPathAdd=node.id;section.appendChild(addPath);
 addPath.onclick=()=>{if(!live()||pathInputs.length>=WF_CONDITION_FIELDS.maxDepth)return;renderPaths([...pathInputs.map(field=>field.value),'']);sync();};
 operator.onchange=sync;valueType.onchange=sync;
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
}

function wfRenderGraph(){ wfNodeDrag=null;wfEdgeDrag=null;wfNodeFormControls=[]; if(wfGraph.preparation)$('wf-unified-blocked').textContent='原声明入口：'+wfGraph.preparation.entry+'；编译未纳入步骤（仅审计）：'+gpJson(wfGraph.preparation.blocked);else $('wf-unified-blocked').textContent=''; $('wf-id').value=wfGraph.id||'';$('wf-name').value=wfGraph.name||'';const box=gpClear($('wf-nodes'));wfGraph.nodes.forEach((node,index)=>{const card=gpEl('article');card.appendChild(gpEl('h3','节点 '+(index+1)));wfNodeDragControls(card,node);wfEdgeDragControls(card,node);wfField(card,'ID',node.id,value=>{if(!value||wfGraph.nodes.some(other=>other!==node&&other.id===value))throw Error('节点 ID 必须唯一且非空');const old=node.id;node.id=value;for(const edge of wfGraph.edges){if(edge.from===old)edge.from=value;if(edge.to===old)edge.to=value;}wfRenderGraph();});wfField(card,'类型',node.type,value=>{wfGraph.nodes[index]={id:node.id,type:value};if(['SURVEY','ACTION','VERIFY'].includes(value))wfGraph.nodes[index].module='formation';if(value==='WAIT')wfGraph.nodes[index].durationMs=1000;wfRenderGraph();},wfTypes);if(['SURVEY','ACTION','VERIFY'].includes(node.type)){wfField(card,'玩法',node.module||'formation',value=>{node.module=value;wfCandidateCache.delete(node.id);wfRenderGraph();},WF_MODULES);if(['SURVEY','ACTION'].includes(node.type))wfParameterForm(card,node);}if(node.type==='ACTION'){wfJsonField(card,'候选选择 selection：字符串或 {actionId}（由服务端验证）',node.selection,value=>{if(value===undefined)delete node.selection;else node.selection=value;});wfCandidateControls(card,node);}if(['CONDITION','RULE','VERIFY'].includes(node.type))wfConditionForm(card,node);if(node.type==='WAIT')wfField(card,'等待毫秒',node.durationMs??1000,value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<0||n>60000)throw Error('等待时间无效');node.durationMs=n;});for(const [text,offset]of[['上移',-1],['下移',1]])wfEditorButton(card,text,()=>{const at=wfGraph.nodes.indexOf(node),other=at+offset;[wfGraph.nodes[at],wfGraph.nodes[other]]=[wfGraph.nodes[other],wfGraph.nodes[at]];wfChanged();wfRenderGraph();},()=>{const at=wfGraph.nodes.indexOf(node);return at>=0&&at+offset>=0&&at+offset<wfGraph.nodes.length;});wfEditorButton(card,'删除节点及相关连线',()=>{wfGraph.nodes.splice(wfGraph.nodes.indexOf(node),1);wfGraph.edges=wfGraph.edges.filter(edge=>edge.from!==node.id&&edge.to!==node.id);wfCandidateCache.delete(node.id);wfChanged();wfRenderGraph();},()=>wfGraph.nodes.includes(node));box.appendChild(card);});wfNodeDragEnd(box);const edges=gpClear($('wf-edges')),ids=wfGraph.nodes.map(node=>node.id);wfGraph.edges.forEach((edge,index)=>{const row=gpEl('div');wfField(row,'从',edge.from,value=>edge.from=value,ids);wfField(row,'到',edge.to,value=>edge.to=value,ids);wfField(row,'分支',edge.when||'ALWAYS',value=>{if(value==='ALWAYS')delete edge.when;else edge.when=value;},['ALWAYS','PASS','FAIL']);wfEditorButton(row,'删除连线',()=>{wfGraph.edges.splice(wfGraph.edges.indexOf(edge),1);wfChanged();wfRenderGraph();},()=>wfGraph.edges.includes(edge));edges.appendChild(row);});$('wf-json').value=gpJson(wfGraph);wfGraphBudgetRender();wfRunPolicyRender();wfDraw();}
function wfCandidateSignature(node){return gpJson({module:node.module,parameters:node.parameters||{}});}
function wfCandidateControls(card,node){const cached=wfCandidateCache.get(node.id),valid=cached&&cached.signature===wfCandidateSignature(node),busy=Boolean(wfPending||wfData?.status?.running),load=wfEditorButton(card,'只读采集候选',()=>wfFetchCandidates(node),()=>Boolean(snapshot?.connected&&gameplayCsrfToken()&&wfGraph.nodes.includes(node)));load.dataset.workflowCandidate=node.id;if(!valid)return;const select=gpEl('select'),empty=gpEl('option','请选择本账号的具体候选');empty.value='';select.appendChild(empty);const currentSelection=typeof node.selection==='string'?node.selection:node.selection?.actionId;for(const row of cached.rows){const option=gpEl('option',(row.label||row.actionType||row.actionId)+' · '+operationCosts(row.costs)+(gpBlocked(row)?' · 禁止执行：'+(row.blockedReason||row.reason||'未验证'):''));option.value=row.actionId;option.disabled=gpBlocked(row);select.appendChild(option);}select.value=currentSelection||'';const live=wfEditorGuard(select),sync=()=>{select.disabled=!wfEditorEditable();};wfNodeFormControls.push(sync);sync();select.dataset.workflowSelection=node.id;select.onchange=()=>{if(!live()||wfCandidateCache.get(node.id)!==cached)return;const row=cached.rows.find(row=>row.actionId===select.value);if(!row||gpBlocked(row))return;node.selection=row.actionId;wfChanged();wfRenderGraph();};card.appendChild(select);for(const row of cached.rows){const summary=gpEl('p',(row.label||row.actionType||row.actionId)+' · 成本：'+operationCosts(row.costs)+' · 来源：'+(row.costSource||'未知')+(gpBlocked(row)?' · 阻塞：'+(row.blockedReason||row.reason||'未验证'):''));card.appendChild(summary);}if(!cached.rows.length)card.appendChild(gpEl('p','当前没有候选；检查模块开关、业务参数和事实缺口。'));}
async function wfFetchCandidates(node){if(wfPending||wfData?.status?.running||!current||!snapshot?.connected||!gameplayCsrfToken())return;const scope=viewGuard.begin('workflow-candidate-'+node.id),revision=gpRevision,edit=wfEdit,signature=wfCandidateSignature(node),module=node.module,parameters=JSON.parse(JSON.stringify(node.parameters||{}));$('wf-hint').textContent='正在只读采集 '+module+' 候选；不会授权或执行。';try{const data=await operationMutation('/api/gameplay/survey',{module,parameters},scope);if(!gpSafe(scope,revision)||edit!==wfEdit||!wfGraph.nodes.includes(node)||signature!==wfCandidateSignature(node))return;if(data.accountId!==scope.account||data.module!==module)throw Error('候选账号或模块不匹配');wfCandidateCache.set(node.id,{signature,rows:data.view?.candidates||[]});wfRenderGraph();$('wf-hint').textContent='采集完成；请选择具体候选，保存图后再开始流程。';}catch(error){if(gpSafe(scope,revision)&&edit===wfEdit)$('wf-hint').textContent='候选采集失败：'+error.message;}}
function wfDraw(){if(typeof document.createElementNS!=='function')return;const svg=gpClear($('wf-canvas')),height=Math.max(120,Math.ceil(wfGraph.nodes.length/4)*100);svg.setAttribute('viewBox','0 0 800 '+height);const positions=new Map(wfGraph.nodes.map((node,index)=>[node.id,{x:20+index%4*200,y:20+Math.floor(index/4)*100}]));const create=(tag,attrs,text)=>{const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,String(value));if(text!==undefined)el.textContent=String(text);svg.appendChild(el);return el;};for(const edge of wfGraph.edges){const a=positions.get(edge.from),b=positions.get(edge.to);if(!a||!b)continue;create('line',{x1:a.x+150,y1:a.y+24,x2:b.x,y2:b.y+24,stroke:'#7c8695','stroke-width':2});create('text',{x:(a.x+b.x+150)/2,y:(a.y+b.y)/2+15,fill:'#e0bd6a','font-size':11},edge.when||'→');}for(const node of wfGraph.nodes){const p=positions.get(node.id);create('rect',{x:p.x,y:p.y,width:150,height:48,rx:6,fill:'#21252c',stroke:'#7c8695'});create('text',{x:p.x+8,y:p.y+19,fill:'#d5dae1','font-size':12},node.id);create('text',{x:p.x+8,y:p.y+37,fill:'#9ca6b5','font-size':11},node.type+(node.module?' · '+node.module:''));}}
function wfAcceptGraph(graph){if(!graph||graph.version!==1||typeof graph.id!=='string'||typeof graph.name!=='string'||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges)||graph.nodes.length>50||graph.edges.length>100)throw Error('图需要 version:1、id、name、nodes 和 edges；最多50节点100连线');wfCandidateCache.clear();wfGraph=JSON.parse(JSON.stringify(graph));wfChanged();wfRenderGraph();}
function wfRender(data,scope){gpTokenFrom(data,scope);if(Array.isArray(data.history))wfHistoryList(data.history);wfData={...wfData,...data};const status=data.status||wfData.status||{};$('wf-status').textContent=gpJson(status);if(data.graphs||data.examples){wfList=[...(data.graphs||[]),...(data.examples||[])].map(row=>row.graph||row);const select=gpClear($('wf-saved'));for(const graph of wfList){const option=gpEl('option',graph.name||graph.id);option.value=graph.id;select.appendChild(option);}}const pending=data.pendingPlan||data.plan||status.pendingPlan||status.plan;if(!pending&&!['AWAITING_AUTHORIZATION','AWAITING_VERIFICATION'].includes((status.status??status.state))){wfPlan=null;gpClear($('wf-plan'));}if(pending?.actions?.length){if(pending.accountId!==current)throw Error('流程 ACTION 计划账号不匹配');wfPlan=pending;gpRenderPlan($('wf-plan'),pending);$('wf-hint').textContent='流程已在 ACTION 暂停，等待以上具体计划的授权。';}wfControls();}
async function refreshWorkflows(){if(!current||wfPending)return;const scope=viewGuard.begin('workflow'),revision=gpRevision;wfPending=true;wfControls();try{const data=await call('/api/workflows',undefined,scope);if(gpSafe(scope,revision))wfRender(data,scope);}catch(error){if(gpSafe(scope,revision)){$('wf-hint').textContent='读取失败：'+error.message;wfHistoryReset();wfData=null;wfPlan=null;gpClear($('wf-plan'));}}finally{if(gpSafe(scope,revision)){wfPending=false;wfControls();}}}
async function wfMutation(action){if(wfPending||!wfData||!gameplayCsrfToken())return;const scope=viewGuard.begin('workflow'),revision=gpRevision,edit=wfEdit;wfPending=true;wfControls();wfRenderGraph();try{const data=await operationMutation('/api/workflows/'+action,['resume','stop'].includes(action)?{}:{graph:wfGraph},scope);if(!gpSafe(scope,revision)||edit!==wfEdit)return;wfRender(data,scope);$('wf-result').textContent=gpJson(data.simulation||data.result||data);if(!wfPlan)$('wf-hint').textContent={save:'图已保存。',simulate:'模拟完成，没有执行游戏写操作。',start:'流程已启动；ACTION 等待具体授权。',resume:'已请求验证历史并继续。',stop:'已停止后续流程。'}[action];}catch(error){if(gpSafe(scope,revision))$('wf-hint').textContent='流程停止：'+error.message;}finally{if(gpSafe(scope,revision)){wfPending=false;wfRenderGraph();wfControls();}}}
function wfOpenUnified(entry){if(wfPending||wfData?.status?.running)return;const intent={entry,tasks:[],dailies:entry==='tasks'?[]:[{taskId:1002},{taskId:1006},{taskId:1009}],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}};$('wf-unified-intent').value=gpJson(intent);wfUnifiedRender();$('wf-unified-blocked').textContent=entry==='tasks'?'请填写要领取的精确 kind 和 taskId，再生成预览。':'请填写累计预算和业务选择，再生成预览。';for(const section of document.querySelectorAll('main > section'))section.classList.toggle('hidden',section.id!=='tab-workflow');for(const button of document.querySelectorAll('nav button'))button.classList.toggle('on',button.dataset.tab==='workflow');return refreshWorkflows();}
async function wfPrepareUnified(){if(wfPending||!current||!gameplayCsrfToken()||wfData?.status?.running)return;const scope=viewGuard.begin('workflow-unified'),revision=gpRevision,edit=wfEdit,source=$('wf-unified-intent').value;wfPending=true;wfControls();try{const data=await operationMutation('/api/workflows/prepare',JSON.parse(source),scope);if(!gpSafe(scope,revision)||edit!==wfEdit||source!==$('wf-unified-intent').value)return;if(data.accountId!==current)throw Error('统一流程账号不匹配');$('wf-unified-blocked').textContent=gpJson(data.blocked||[]);if(!data.graph){$('wf-hint').textContent='没有可执行节点；请补全精确选择，缺证项见上方。';return;}wfAcceptGraph(data.graph);$('wf-hint').textContent='统一流程已生成，检查图与累计预算后保存、模拟或开始；每个动作仍单独授权。';}catch(error){if(gpSafe(scope,revision))$('wf-hint').textContent='统一流程准备失败：'+error.message;}finally{if(gpSafe(scope,revision)){wfPending=false;wfControls();}}}
for(const entry of ['tasks','dailies','loop'])$(entry+'-unified').onclick=()=>wfOpenUnified(entry);
$('wf-unified-prepare').onclick=wfPrepareUnified;
$('wf-load').onclick=refreshWorkflows;$('wf-open').onclick=()=>{if(!wfEditorEditable())return;try{const graph=wfList.find(row=>row.id===$('wf-saved').value);if(!graph)throw Error('请选择已保存的图');wfAcceptGraph(graph);}catch(error){$('wf-hint').textContent=error.message;}};for(const action of ['save','simulate','start','resume','stop'])$('wf-'+action).onclick=()=>{if(!$('wf-'+action).disabled)return wfMutation(action);};$('wf-id').oninput=()=>{if(!wfEditorEditable())return;wfGraph.id=$('wf-id').value;wfChanged();};$('wf-name').oninput=()=>{if(!wfEditorEditable())return;wfGraph.name=$('wf-name').value;wfChanged();};$('wf-add').onclick=()=>{if(!wfEditorEditable())return;let sequence=wfGraph.nodes.length+1,id;do{id='node-'+sequence++;}while(wfGraph.nodes.some(node=>node.id===id));wfGraph.nodes.push({id:id,type:'SURVEY',module:'formation',parameters:{}});wfChanged();wfRenderGraph();};$('wf-add-edge').onclick=()=>{if(!wfEditorEditable()||wfGraph.nodes.length<2)return;wfGraph.edges.push({from:wfGraph.nodes[0].id,to:wfGraph.nodes[wfGraph.nodes.length-1].id});wfChanged();wfRenderGraph();};$('wf-json-apply').onclick=()=>{if(!wfEditorEditable())return;try{wfAcceptGraph(gpParse('wf-json'));}catch(error){$('wf-hint').textContent=error.message;}};$('wf-authorize').onclick=()=>gpAuthorize(null,wfPlan,'workflow');
function gameplayPoll(tab){if(tab==='workflow'||wfData?.status?.running)return refreshWorkflows();if(GP_MODULES.includes(tab))return refreshGameplay(tab);const running=GP_MODULES.find(id=>gpGet(id).data?.status?.running);if(running)return refreshGameplay(running);}
function wfSetting(id){return wfSettings[id]||(wfSettings[id]={config:null,scope:null});}
function wfSettingReady(id){const setting=wfSetting(id);return Boolean(current&&setting.config&&setting.scope&&viewGuard.current(setting.scope)&&gameplayCsrfToken());}
function wfSettingsControls(){for(const id of Object.keys(WF_SETTING_NAMES)){const ready=wfSettingReady(id),locked=wfPending||Boolean(snapshot?.busy)||wfData?.status?.running===true;$('wf-'+id+'-load').disabled=!current||wfPending;$('wf-'+id+'-enabled').disabled=!ready||locked;$('wf-'+id+'-save').disabled=!ready||locked;}}
function wfResetSettings(){for(const id of Object.keys(WF_SETTING_NAMES)){delete wfSettings[id];$('wf-'+id+'-enabled').checked=false;$('wf-'+id+'-enabled').disabled=true;$('wf-'+id+'-save').disabled=true;$('wf-'+id+'-hint').textContent='';}}
function wfSettingConfig(data,id,scope){if(data.accountId!==scope.account||data.module!==id)throw Error('节点配置账号或模块不匹配');const config=data.config;if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).some(key=>key!=='enabled')||typeof config.enabled!=='boolean')throw Error('节点配置缺少可靠 enabled 开关');return {enabled:config.enabled};}
function wfInvalidateSettingPlans(){wfEdit++;wfPlan=null;gpClear($('wf-plan'));wfCandidateCache.clear();wfRenderGraph();wfControls();}
async function wfLoadSetting(id){if(!current||wfPending)return;const scope=viewGuard.begin('workflow-setting-'+id),revision=gpRevision,setting=wfSetting(id);setting.config=null;setting.scope=null;wfPending=true;wfControls();try{const data=await call('/api/gameplay?module='+encodeURIComponent(id),undefined,scope);if(!gpSafe(scope,revision))return;const config=wfSettingConfig(data,id,scope);gpTokenFrom(data,scope);setting.config=config;setting.scope=viewGuard.capture();$('wf-'+id+'-enabled').checked=config.enabled;$('wf-'+id+'-hint').textContent='已读取本账号'+WF_SETTING_NAMES[id]+'节点配置；写操作仍需具体计划和单次授权。';}catch(error){if(gpSafe(scope,revision)){$('wf-'+id+'-enabled').checked=false;$('wf-'+id+'-hint').textContent='读取失败：'+error.message;}}finally{if(gpSafe(scope,revision)){wfPending=false;wfControls();}}}
async function wfSaveSetting(id){if(wfPending||!wfSettingReady(id)||snapshot?.busy||wfData?.status?.running===true)return;const scope=viewGuard.begin('workflow-setting-'+id),revision=gpRevision,setting=wfSetting(id),config={enabled:$('wf-'+id+'-enabled').checked===true};wfInvalidateSettingPlans();wfPending=true;wfControls();try{const data=await operationMutation('/api/gameplay/config',{module:id,config},scope);if(!gpSafe(scope,revision))return;setting.config=wfSettingConfig(data,id,scope);setting.scope=viewGuard.capture();$('wf-'+id+'-enabled').checked=setting.config.enabled;$('wf-'+id+'-hint').textContent='本账号'+WF_SETTING_NAMES[id]+'节点配置已保存；请重新采集候选和生成具体计划。';}catch(error){if(gpSafe(scope,revision)){setting.config=null;setting.scope=null;$('wf-'+id+'-hint').textContent='保存失败：'+error.message+'；请重新读取本账号配置。';}}finally{if(gpSafe(scope,revision)){wfPending=false;wfControls();}}}
for(const id of Object.keys(WF_SETTING_NAMES)){$('wf-'+id+'-load').onclick=()=>wfLoadSetting(id);$('wf-'+id+'-save').onclick=()=>wfSaveSetting(id);$('wf-'+id+'-enabled').onchange=()=>{if(!wfSettingReady(id)||wfPending)return;wfInvalidateSettingPlans();$('wf-'+id+'-hint').textContent='本账号开关尚未保存；保存后请重新采集候选。';};}
Object.assign(globalThis,{resetGameplay,gameplayCsrfToken,refreshGameplay,refreshWorkflows,gameplayActivate,gameplayPoll});
resetGameplay();

}
export const GAMEPLAY_SCRIPT = "(" + gameplayClient.toString() + ")(" + JSON.stringify(WORKFLOW_CONDITION_FIELDS) + "," + JSON.stringify(Object.fromEntries(Object.entries(FUNCTION_CONTRACTS).map(([id,c])=>[id,c.inputSchema]))) + "," + JSON.stringify(RUN_BUDGET_LIMITS) + "," + JSON.stringify(NAVAL_RULE_CONTRACT) + "," + moduleConfigNumberValid.toString() + "," + JSON.stringify(WORKFLOW_LIMITS) + ");";
