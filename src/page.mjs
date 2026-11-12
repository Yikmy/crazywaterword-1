import { GAMEPLAY_HTML, GAMEPLAY_SCRIPT, CORE_GAMEPLAY_HTML } from './gameplay-page.mjs';
// This same guard is embedded in the browser and exercised by the offline tests.
export function createAccountViewGuard() {
  let account = null;
  let generation = 0;
  const requests = new Map();
  const capture = () => ({ account, generation });
  const current = (scope) => Boolean(scope) && scope.account === account && scope.generation === generation
    && (scope.view == null || requests.get(scope.view) === scope.request);
  const assert = (scope) => {
    if (!current(scope)) {
      const error = new Error('账号或请求已切换，忽略旧结果');
      error.name = 'StaleAccountView';
      throw error;
    }
  };
  return {
    capture, current, assert,
    select(next) { account = next || null; generation += 1; requests.clear(); return capture(); },
    begin(view, scope = capture()) {
      assert(scope);
      const request = (requests.get(view) || 0) + 1;
      requests.set(view, request);
      return { account, generation, view, request };
    },
  };
}

export const PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>疯狂水世界</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 13px/1.6 "Microsoft YaHei", "PingFang SC", system-ui, sans-serif; background: #14161a; color: #d5dae1; }
  header { padding: 10px 16px 0; border-bottom: 1px solid #262a31; }
  .headline { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  h1 { font-size: 15px; margin: 0; font-weight: 600; }
  h2 { font-size: 12px; margin: 16px 0 6px; color: #7c8695; font-weight: 600; }
  h2:first-child { margin-top: 0; }
  button { font: inherit; padding: 5px 12px; border: 1px solid #3a4150; background: #21252c; color: #d5dae1; border-radius: 4px; cursor: pointer; }
  button:hover:not(:disabled) { background: #2b313a; }
  button:disabled { opacity: .45; cursor: not-allowed; }
  button.primary { border-color: #3f6b4a; background: #21301f; }
  button.danger { border-color: #6b3f3f; background: #2c1f1f; }
  button.tiny { padding: 2px 8px; font-size: 12px; }
  nav { display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap; }
  nav button { border-bottom-left-radius: 0; border-bottom-right-radius: 0; border-bottom-color: transparent; }
  nav button.on { background: #262b33; border-color: #3a4150; border-bottom-color: #262b33; color: #fff; }
  main { padding: 14px 16px 40px; }
  .ok { color: #6fd08c; } .bad { color: #f08a8a; } .warn { color: #e0bd6a; } .dim { color: #7c8695; }
  select, input { font: inherit; background: #101317; color: #d5dae1; border: 1px solid #2f353f; border-radius: 4px; padding: 5px 8px; }
  select { min-width: 160px; }
  input { width: 220px; }
  input[type=checkbox] { width: auto; }
  section { border: 1px solid #262a31; border-radius: 6px; background: #191c21; padding: 12px 14px; margin-bottom: 14px; }
  section.hidden { display: none; }
  .mvp-disabled { display: none !important; }
  .bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
  .bar .k { font-size: 11px; color: #7c8695; letter-spacing: .6px; }
  .who { display: flex; gap: 22px; flex-wrap: wrap; align-items: center; }
  .who .item { display: flex; flex-direction: column; }
  .who .item .k { font-size: 11px; color: #7c8695; }
  .who .item .v { font-size: 16px; }
  .icons { display: flex; flex-wrap: wrap; gap: 8px; }
  .cell { display: flex; align-items: center; gap: 6px; border: 1px solid #262a31; border-radius: 5px; background: #12151a; padding: 4px 8px 4px 4px; min-width: 108px; }
  .cell .txt { display: flex; flex-direction: column; line-height: 1.25; }
  .cell .nm { font-size: 12px; }
  .cell .qty { font-size: 11px; color: #7c8695; }
  .ico { display: inline-block; position: relative; overflow: hidden; flex: none; border-radius: 3px; background: #1d2129; }
  .ico .atlas { position: absolute; top: 0; left: 0; background-repeat: no-repeat; transform-origin: 0 0; }
  .ico .fallback { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #7c8695; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { text-align: left; padding: 4px 8px 4px 0; border-bottom: 1px solid #22262d; font-weight: 400; vertical-align: middle; }
  th { color: #7c8695; font-size: 11px; letter-spacing: .6px; }
  td.num, th.num { text-align: right; }
  .chip { display: inline-block; padding: 0 6px; border-radius: 3px; font-size: 11px; border: 1px solid; }
  .chip.ready, .chip.done { color: #6fd08c; border-color: #2f5b3d; }
  .chip.paid { color: #e0bd6a; border-color: #5f5230; }
  .chip.partial, .chip.waiting { color: #8fb8f0; border-color: #33506b; }
  .chip.blocked, .chip.error, .chip.unknown { color: #8a93a1; border-color: #3a4150; }
  .who-cell { display: flex; align-items: center; gap: 6px; }
  #log { border: 1px solid #262a31; border-radius: 6px; background: #101317; height: 220px; overflow: auto; padding: 6px 8px; }
  .row { white-space: pre-wrap; word-break: break-all; padding: 1px 0; }
  .row .ts { color: #5c6673; }
  .row.state { color: #8fb8f0; } .row.error { color: #f08a8a; } .row.warn { color: #e0bd6a; } .row.info { color: #d5dae1; }
  .acct { border: 1px solid #262a31; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; background: #12151a; }
  .acct.on { border-color: #3f6b4a; }
  .acct .top { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .acct .title { font-size: 14px; }
  .acct .id { color: #7c8695; font-size: 12px; }
  pre { margin: 8px 0 0; padding: 8px; background: #101317; border: 1px solid #2f353f; border-radius: 4px; white-space: pre-wrap; color: #b8e0a0; max-height: 300px; overflow: auto; }
  .kv { display: grid; grid-template-columns: 120px 1fr; gap: 2px 10px; margin-top: 6px; }
  .kv .k { color: #7c8695; }
  .kv .v { word-break: break-all; }
  .qr { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
  .qr img, .qr svg { width: 220px; height: 220px; background: #fff; padding: 8px; border-radius: 6px; }
  .steps { margin: 6px 0 0; padding-left: 20px; color: #b9c2ce; }
  .steps li { margin: 2px 0; }
  #modal { position: fixed; inset: 0; background: rgba(8,10,13,.72); display: flex; align-items: center; justify-content: center; }
  #modal.hidden { display: none; }
  #modal .sheet { width: min(560px, 92vw); background: #191c21; border: 1px solid #3a4150; border-radius: 8px; padding: 16px 18px; }
  #modal h3 { margin: 0 0 10px; font-size: 15px; }
  #modal .body { color: #b9c2ce; }
  #modal .body code { background: #101317; padding: 1px 4px; border-radius: 3px; }
  #modal .ack { display: block; margin: 12px 0; }
  #modal .foot { display: flex; gap: 10px; align-items: center; }
  .explorer-layout { display: grid; grid-template-columns: minmax(220px, 300px) minmax(0, 1fr); gap: 14px; }
  .explorer-list { max-height: 640px; overflow: auto; display: flex; flex-direction: column; gap: 5px; }
  .explorer-query { text-align: left; width: 100%; padding: 7px 9px; overflow-wrap: anywhere; }
  .explorer-query.on { border-color: #6a91bd; background: #243040; }
  .explorer-query .protocol { display: block; color: #99a5b4; font-size: 11px; }
  .explorer-panels { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .explorer-panels details { border: 1px solid #303844; border-radius: 4px; padding: 8px; min-width: 0; }
  .explorer-panels summary { cursor: pointer; font-weight: 600; }
  .explorer-panels pre { max-height: 520px; overflow-wrap: anywhere; }
  #explorer-meta, #explorer-source, #explorer-error { overflow-wrap: anywhere; margin: 5px 0; }
  #explorer-search { width: min(380px, 100%); }
  #explorer-copy-text { width: 100%; min-height: 160px; background: #101317; color: #d5dae1; }
  .order-rules-layout { display: grid; grid-template-columns: minmax(320px, 1fr) minmax(320px, 1fr); gap: 16px; align-items: start; }
  .order-rule, .order-preview-card { border: 1px solid #303844; border-radius: 5px; padding: 10px; margin: 8px 0; background: #12151a; overflow-wrap: anywhere; }
  .order-rule-fields { display: flex; flex-wrap: wrap; gap: 8px; }
  .order-rule-field { display: flex; flex-direction: column; gap: 3px; color: #a6b1c0; }
  .order-rule-field input, .order-rule-field select { width: min(250px, 100%); min-width: 120px; }
  .order-rule h3, .order-preview-card h3 { margin: 0 0 7px; font-size: 14px; }
  .order-rule-trace { margin: 8px 0; padding-left: 21px; }
  #order-rules-hint, #order-rules-source, #order-preview-meta { overflow-wrap: anywhere; }
  @media (max-width: 1000px) { .order-rules-layout { grid-template-columns: 1fr; } }
  @media (max-width: 900px) { .explorer-layout, .explorer-panels { grid-template-columns: 1fr; } .explorer-list { max-height: 260px; } }
</style>
</head>
<body>
<header>
  <div class="headline">
    <h1>疯狂水世界</h1>
    <select id="account" title="选择账号"></select>
    <button id="connect" class="primary">连接</button>
    <button id="disconnect">断开</button>
    <button id="refresh-data">刷新数据</button>
    <span class="dim">数据浏览只读 · 业务批次独立授权</span>
    <span id="busy" class="dim"></span>
    <span id="hint" class="warn"></span>
  </div>
  <nav id="tabs">
    <button data-tab="overview" class="on">总览</button>
    <button data-tab="explorer">数据探索器</button>
    <button data-tab="order-rules">居民订单策略</button>
    <button data-tab="orders-execution">居民订单执行</button>
    <button data-tab="city">城市建设</button>
    <button data-tab="production">生产管理</button>
    <button data-tab="operations-history">执行历史</button>
    <button data-tab="stages">自动闯关</button>
    <button data-tab="formation">阵容</button><button data-tab="alliance">联盟</button><button data-tab="museum">博物馆</button><button data-tab="treasure">世界宝藏</button><button data-tab="fleet">舰队</button><button data-tab="naval">海战规则</button><button data-tab="pirate-sweep">海面扫荡</button><button data-tab="fishing">钓鱼</button><button data-tab="workflow">工作流</button>
    <button data-tab="idle">任务与海面</button>
    <button data-tab="heroes">英雄</button>
    <button data-tab="dailies">日常</button><button data-tab="mail">邮件</button>
    <button data-tab="account">账号</button>
  </nav>
</header>
<main>
  <section id="tab-overview">
    <div class="who" id="who"><span class="dim">尚未读取缓存，请先选择账号。</span></div>
    <div id="sync-info" class="dim">尚未采集，请先连接账号并刷新数据</div>
    <h2 class="mvp-disabled">一键领取</h2>
    <div class="bar">
      <button id="loot-run" class="primary" disabled hidden>领取现在能领的</button>
      <span id="loot-hint" class="warn"></span>
    </div>
    <pre id="loot-view" class="mvp-disabled">主线、成就、邮件、挂机收益，能领的都领一遍。不花钻石。</pre>
    <h2>资源</h2><div class="icons" id="res"><span class="dim">连接后显示</span></div>
    <h2>库存</h2><div class="icons" id="items"><span class="dim">连接后显示</span></div>
    <h2>主力英雄</h2><div class="icons" id="hero-strip"><span class="dim">连接后显示</span></div>
    <h2>运行记录</h2>
    <div id="log"></div>
  </section>

  <section id="tab-fishing" class="hidden">
    <h2>钓鱼与鱼类图鉴</h2>
    <p class="dim">显示本账号最近一次采集的钓鱼等级、鱼库存和图鉴奖励进度。</p>
    <div class="bar"><button id="fishing-read" type="button">读取缓存</button><span id="fishing-meta" class="dim" aria-live="polite">尚未读取本账号缓存。</span></div>
    <div id="fishing-facts"></div>
  </section>

  <section id="tab-explorer" class="hidden">
    <h2>Game Data Explorer</h2>
    <div class="bar">
      <button id="explorer-load">读取已有快照</button>
      <select id="explorer-domain" aria-label="业务域"><option value="">全部业务域</option></select>
      <input id="explorer-search" type="search" placeholder="搜索业务名称 / Request / Response" aria-label="搜索游戏数据">
      <button id="explorer-copy" disabled>复制脱敏 JSON</button>
      <button id="explorer-export" disabled>导出脱敏 JSON</button>
    </div>
    <div id="explorer-hint" class="warn" role="status"></div>
    <div id="explorer-summary" class="dim">选择账号后读取已有快照。</div>
    <div class="explorer-layout">
      <div id="explorer-list" class="explorer-list" aria-label="查询列表"></div>
      <div>
        <h2 id="explorer-title">选择一项查询</h2>
        <div id="explorer-meta" class="dim"></div>
        <div id="explorer-source" class="dim"></div>
        <div id="explorer-error" class="bad"></div>
        <div class="explorer-panels">
          <details id="explorer-raw-panel" open><summary>原始响应</summary><pre id="explorer-raw">尚未读取</pre></details>
          <details id="explorer-parsed-panel" open><summary>已有业务解析</summary><pre id="explorer-parsed">尚未读取</pre></details>
        </div>
      </div>
    </div>
    <textarea id="explorer-copy-text" hidden readonly aria-label="脱敏 JSON 复制内容"></textarea>
  </section>
  <section id="tab-order-rules" class="hidden">
    <h2>居民订单策略</h2>
    <p class="warn">只读模拟，不会执行游戏操作。</p>
    <p class="dim">规则按排列顺序判断，遇到首个 FAIL 或 UNKNOWN 停止；全部通过后再检查库存。各订单独立使用同一份缓存库存，建议不代表四单可同时提交。</p>
    <div class="bar">
      <button id="order-rules-load">读取账号配置</button>
      <button id="order-rules-save" disabled>保存配置</button>
      <button id="order-rules-default" disabled>恢复默认配置到编辑器</button>
      <button id="order-rules-preview" class="primary" disabled>模拟当前缓存订单</button>
    </div>
    <div id="order-rules-hint" class="warn" role="status"></div>
    <div id="order-rules-source" class="dim">选择账号后读取独立配置。</div>
    <div class="order-rules-layout">
      <div>
        <h2>优先级规则</h2>
        <label><input id="order-rules-enabled" type="checkbox" disabled> 启用规则（仅模拟）</label>
        <div id="order-rules-editor"></div>
        <div class="bar">
          <select id="order-rule-add-type" aria-label="新增规则类型" disabled></select>
          <button id="order-rule-add" disabled>添加规则</button>
        </div>
        <div id="order-items-note" class="dim">物品使用原始 ID 匹配，显示名称不会自动转换为 ID。</div>
        <datalist id="order-item-options"></datalist>
      </div>
      <div>
        <h2>决策预览</h2>
        <div id="order-preview-meta" class="dim">尚未模拟。</div>
        <div id="order-preview-list"></div>
      </div>
    </div>
  </section>
  <section id="tab-orders-execution" class="hidden">
    <h2>居民订单执行</h2>
    <p class="dim">使用本账号已保存的居民订单策略。策略编辑与缓存模拟仍在「居民订单策略」；这里生成共享预算的执行批次。</p>
    <div id="ops-orders">尚未探测居民订单。</div>
  </section>
  <section id="tab-city" class="hidden">
    <h2>城市建设</h2>
    <p class="dim">选择具体建筑操作，可与订单及生产共用一个批次预算。材料未知或条件不满足的建筑不会提供执行选项。</p>
    <div id="ops-city">尚未探测建筑。</div>
  </section>
  <section id="tab-production" class="hidden">
    ${CORE_GAMEPLAY_HTML.production}
    ${CORE_GAMEPLAY_HTML.farm}
    <h2>生产管理</h2>
    <p class="dim">生产策略按账号保存在本地，仅限制 Automatic 本批次候选；保存配置不会启动生产。每批仍须预览与明确授权。</p>
    <div class="bar"><button id="production-policy-load">读取本地生产策略</button><button id="production-policy-save" disabled>保存本账号策略</button><button id="production-select-recommended" disabled>选择本次推荐生产</button></div>
    <div class="bar">
      <label><input id="production-policy-enabled" type="checkbox" disabled> 启用本批次自动生产策略</label>
      <label><input id="production-policy-shortages" type="checkbox" disabled checked> 仅生产当前订单缺口</label>
      <label>产品 ID <input id="production-policy-products" placeholder="逗号分隔；留空不限定" disabled></label>
      <label>每批最大操作数 <input id="production-policy-limit" type="number" min="1" max="100" step="1" value="10" disabled></label>
    </div>
    <div id="production-policy-source" class="dim">尚未读取本账号策略。</div><div id="production-policy-hint" class="warn" role="status"></div>
    <div id="ops-production">尚未探测工厂。</div>
    <h2>库存与生产缺口</h2><div id="ops-stock"></div>
    <h2>当日本工具验证收取记录</h2>
    <p class="dim">仅统计本工具持久历史中 SUCCESS 且复读 CONFIRMED 的操作。开始生产只计操作次数；收取材料仅汇总可靠数量。无法还原游戏当日全部产量。</p>
    <div id="ops-production-report">读取执行历史后显示。</div>
  </section>
  <section id="tab-operations-history" class="hidden">
    <h2>执行历史</h2>
    <p class="dim">按当前账号保存的历史证据，不代表当前实时游戏状态。UNKNOWN 保留未决状态，不能作为失败重试。</p>
    <div class="bar"><button id="ops-history-load">读取持久历史</button><span id="ops-history-hint" class="warn" role="status"></span></div>
    <div id="ops-history">尚未读取历史。</div>
    <h2>只读执行记忆</h2>
    <p class="dim">记忆是原始执行历史的补充审计，不代表当前游戏状态。原始 UNKNOWN 永远保留；当前是否已复核仅以原始历史追加证据为准。此处不提供清除、重试或执行授权。</p>
    <div class="bar"><button id="ops-memory-load">读取只读执行记忆</button><span id="ops-memory-hint" class="warn" role="status"></span></div>
    <div id="ops-memory-coverage" class="dim">尚未读取覆盖范围。</div>
    <div id="ops-memory-pending"></div>
    <div id="ops-memory">尚未读取执行记忆。</div>
  </section>
  <section id="operations-batch" class="hidden">
    <h2>本批次操作</h2>
    <div class="bar">
      <button id="ops-load">读取已有运行状态</button>
      <button id="ops-survey" class="primary" disabled>探测最新订单与城市</button>
      <label>执行方式 <select id="ops-mode"><option value="Manual">Manual · 逐项</option><option value="Hybrid">Hybrid · 筛选后授权</option><option value="Automatic">Automatic · 本批次</option></select></label>
    </div>
    <div id="ops-mode-note" class="dim"></div>
    <div id="ops-status" class="kv">选择账号后读取运行状态。</div>
    <div id="ops-hint" class="warn" role="status"></div>
    <div id="ops-notes" class="warn"></div>
    <h2>已选操作</h2><div id="ops-selected">尚未选择。</div>
    <div class="bar"><button id="ops-plan" disabled>生成本批次预览</button><button id="ops-clear">清除选择</button><button id="ops-authorize-execute" class="primary" disabled>授权并执行此预览</button><button id="ops-stop" class="danger" disabled>停止当前批次</button></div>
    <div id="ops-plan-meta" class="dim">先选择操作并生成预览，再授权执行。</div>
    <h2>批次总资源预算</h2><div id="ops-budget">尚未生成预览。</div>
    <h2>计划与结果</h2><div id="ops-plan-actions"></div>
  </section>
  <section id="tab-stages" class="hidden">
    <h2>自动闯关</h2>
    <p class="warn">仅支持主线挑战。开始后会实际开战，需要单独确认授权。不会发送跳过动画请求。</p>
    <p class="dim">仅明确战败才等待重试；超时、未知结果、断线或协议异常立即停止。关闭页面不会停止服务端任务；重新打开可读取状态。</p>
    <div id="stages-availability" class="warn" role="status">尚未读取运行条件。</div>
    <div class="bar">
      <label><input id="stages-enabled" type="checkbox"> 启用本次自动闯关</label>
      <label><input id="stages-stop-on-defeat" type="checkbox"> 首次明确战败后停止</label>
      <label><input id="stages-formation-enabled" type="checkbox"> 启用已授权验证阵容</label><label>阵型模板 <input id="stages-formation-preset" type="number" min="1" placeholder="阵型模板 ID"></label><p class="dim">先在阵容页面预览、授权保存并完成复读；启动前再次核对。</p>
      <label>最高目标关卡 <input id="stages-max-stage" type="number" min="1" step="1" placeholder="留空不限制" aria-label="最高目标关卡"></label>
      <label>重试间隔（秒） <input id="stages-retry-delay" type="number" min="0" step="1" value="10" aria-label="重试间隔秒数"></label>
      <label>最大总尝试次数 <input id="stages-max-attempts" type="number" min="1" step="1" placeholder="留空不限制" aria-label="最大总尝试次数"></label>
    </div>
    <div class="bar">
      <button id="stages-load">读取运行状态</button>
      <button id="stages-start" class="primary" disabled>开始自动闯关</button>
      <button id="stages-stop" class="danger" disabled>停止</button>
    </div>
    <div id="stages-hint" class="warn" role="status"></div>
    <div id="stages-status" class="kv">选择账号后读取已有运行状态。</div>
    <div id="stages-countdown" class="dim"></div>
    <div id="stages-delay-policy" class="dim"></div>
    <h2>历史闯关记录</h2>
    <div id="stages-history" class="dim">尚无记录。</div>
  </section>
  <section id="tab-idle" class="hidden">
    <div class="bar">
      <span class="k mvp-disabled">自动循环</span>
      <label class="dim mvp-disabled">轮数 <input id="loop-rounds" value="0" style="width:56px" disabled hidden></label>
      <label class="dim mvp-disabled">间隔秒 <input id="loop-every" value="60" style="width:64px" disabled hidden></label>
      <label class="dim mvp-disabled"><input type="checkbox" id="world-speedup" checked disabled hidden> 允许花加速器</label>
      <label class="dim mvp-disabled"><input type="checkbox" id="world-reroll" disabled hidden> 拒绝重刷订单</label>
      <button id="loop-start" class="primary" disabled hidden>开始挂机</button>
      <button id="loop-stop" class="danger" disabled hidden>停止</button>
      <span id="loop-hint" class="warn"></span>
    </div>
    <pre id="loop-view" class="mvp-disabled">轮数填 0 表示一直跑。每轮按「任务领取 → 日常 → 海面」的顺序重新探测后再执行。钻石与付费礼包永不动，加速只花加速器。</pre>

    <h2>任务奖励</h2>
    <div class="bar">
      <button id="tasks-plan">检查可领</button>
      <button id="tasks-run" class="primary" disabled hidden>领取任务奖励</button>
      <span id="tasks-hint" class="warn"></span>
    </div>
    <pre id="tasks-view">只读展示主线、支线、成就与每日订单的缓存状态。</pre>
    ${CORE_GAMEPLAY_HTML['task-rewards']}

    <h2>海面</h2>
    <div class="bar">
      <button id="world-plan">查看海面数据</button>
      <button id="world-run" class="primary" disabled hidden>执行一轮</button>
      <span id="world-hint" class="warn"></span>
    </div>
    <pre id="world-view">只读展示建筑、生产队列、居民订单、库存与资源田。</pre>
    <div id="world-factories"></div>
    <div id="world-orders"></div>
    <h2>仓库</h2><div class="icons" id="world-stock"></div>
    <h2>资源田</h2><pre id="world-fields"></pre>
  </section>

  <section id="tab-heroes" class="hidden">
    ${CORE_GAMEPLAY_HTML.heroes}
    ${CORE_GAMEPLAY_HTML['equipment-forge']}
    ${CORE_GAMEPLAY_HTML['equipment-growth']}
    ${CORE_GAMEPLAY_HTML['badge-growth']}
    <div class="bar">
      <button id="hero-plan">查看英雄数据</button>
      <button id="hero-run" class="primary" disabled hidden>执行养成</button>
      <span id="hero-hint" class="warn"></span>
    </div>
    <pre id="hero-view">只读展示英雄等级、星级、战力与技能，数据来自最近一次采集。</pre>
    <div id="hero-table"></div>
  </section>

  <section id="tab-dailies" class="hidden">
    <div class="bar">
      <button id="dailies-plan">查看日常数据</button>
      <button id="dailies-run" class="primary" disabled hidden>一键完成</button>
      <label class="dim mvp-disabled"><input type="checkbox" id="dailies-paid" disabled hidden> 允许花钻石（默认关闭）</label>
      <span id="dailies-hint" class="warn"></span>
    </div>
    <pre id="dailies-view">只读展示日常任务与奖励状态，数据来自最近一次采集。</pre>
    <div id="dailies-table"></div>
  </section>

  <section id="tab-account" class="hidden">
    <h2>账号</h2>
    <div id="accounts"></div>

    <h2>凭证</h2>
    <div class="bar">
      <button id="cred-show">查看脱敏信息</button>
      <button id="cred-hide">收起</button>
      <span class="dim">仅展示脱敏信息，不显示凭证全文或登录帧</span>
    </div>
    <div id="cred"></div>

    <h2>区服</h2>
    <div class="bar">
      <button id="load-worlds">加载区服</button>
      <input id="world-input" placeholder="worldId" style="width:130px" disabled hidden>
      <button id="enter-world" disabled hidden>进入该区服</button>
      <span id="worlds-hint" class="warn"></span>
    </div>
    <div id="worlds"></div>

    <div class="mvp-disabled">
    <h2>添加账号（后续登录阶段开放）</h2>
    <div class="bar">
      <button id="cap-start" class="primary" disabled hidden>扫码添加</button>
      <button id="cap-stop" class="danger" disabled hidden>停止抓包</button>
      <span id="cap-hint" class="warn"></span>
    </div>
    <div id="cap-box"></div>
    </div>
  </section>
${GAMEPLAY_HTML}
</main>

<div id="modal" class="hidden">
  <div class="sheet">
    <h3 id="m-title"></h3>
    <div class="body" id="m-body"></div>
    <label class="ack"><input type="checkbox" id="m-ack"> 我明白上面要改的东西，结束时会自动还原</label>
    <div class="foot">
      <button id="m-ok" class="primary" disabled>确认</button>
      <button id="m-cancel">取消</button>
      <span id="m-count" class="dim"></span>
    </div>
  </div>
</div>

<script>
const createAccountViewGuard = ${createAccountViewGuard.toString()};
const $ = (id) => document.getElementById(id);
let current = null;
let accounts = [];
let stream = null;
let snapshot = { connected: false, state: 'IDLE', busy: null, looping: false };
const viewGuard = createAccountViewGuard();
const seen = new Set();
let explorerData = null, explorerScope = null, explorerRequest = null;
let orderRulesData = null, orderRulesDraft = null, orderRulesRevision = 0, orderRuleSequence = 0;
let stagesData = null, stagesActionPending = false, activeTab = 'overview';
let operationsData = null, operationsPlan = null, operationsPending = false, operationsReadable = false;
let operationsRevision = 0, operationsViewKey = null;
let productionPolicyData = null, productionPolicyDraft = null, productionPolicyDirty = false, productionPolicyPending = false;
const operationSelections = new Set();
const OPERATIONS_TABS = new Set(['orders-execution', 'city', 'production', 'operations-history']);
const READ_POSTS = new Set(['/api/connect', '/api/disconnect', '/api/refresh', '/api/accounts/active', '/api/accounts/label', '/api/accounts/remove', '/api/order-rules', '/api/order-rules/preview']);
async function call(path, options, scope = viewGuard.capture()) {
  viewGuard.assert(scope);
  const opts = options || {};
  const method = (opts.method || 'GET').toUpperCase();
  if (method !== 'GET' && !READ_POSTS.has(path.split('?')[0])) throw new Error('MVP 只读模式未开放此操作');
  if (!scope.account && path !== '/api/accounts') throw new Error('请先选择账号');
  const url = new URL(path, location.href);
  if (scope.account) url.searchParams.set('account', scope.account);
  const res = await fetch(url.pathname + url.search, opts);
  const data = await res.json().catch(() => ({}));
  viewGuard.assert(scope);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
async function readView(view, path, render, hint, message) {
  const scope = viewGuard.begin(view);
  if (hint) $(hint).textContent = message || '读取中 ...';
  try {
    const data = await call(path, undefined, scope);
    viewGuard.assert(scope);
    render(data);
    if (hint) $(hint).textContent = '';
  } catch (error) {
    if (viewGuard.current(scope)) {
      const details = { world: ['world-view', 'world-factories', 'world-orders', 'world-stock', 'world-fields'], heroes: ['hero-view', 'hero-table'], dailies: ['dailies-view', 'dailies-table'], tasks: ['tasks-view'], loop: ['loop-view'], worlds: ['worlds'] }[view] || [];
      for (const id of details) clear($(id));
      if (details.length) $(details[0]).textContent = '查询失败：' + error.message;
      if (hint) $(hint).textContent = error.message;
    }
  }
}
function appendLog(entry) {
  if (entry.extra?.detail) return;
  const row = el('div', 'row ' + entry.level);
  row.appendChild(el('span', 'ts', '[' + new Date(entry.t).toLocaleTimeString('zh-CN', { hour12: false }) + '] '));
  row.appendChild(document.createTextNode(entry.message));
  const log = $('log');
  log.appendChild(row);
  while (log.childElementCount > 400) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}
function subscribe() {
  if (stream) stream.close();
  stream = null;
  const scope = viewGuard.capture();
  if (!scope.account) return;
  stream = new EventSource('/api/events?account=' + encodeURIComponent(scope.account));
  stream.onmessage = (event) => {
    if (!viewGuard.current(scope)) return;
    const entry = JSON.parse(event.data);
    if (entry.account && entry.account !== scope.account) return;
    const key = entry.t + '|' + entry.message;
    if (seen.has(key)) return;
    seen.add(key);
    appendLog(entry);
  };
}
function renderAccountSelect() {
  const box = clear($('account'));
  if (!accounts.length) box.appendChild(new Option('没有账号', ''));
  for (const account of accounts) box.appendChild(new Option(account.title + (account.id === current ? '（当前）' : ''), account.id));
  box.disabled = !accounts.length;
  box.value = current || '';
  $('connect').disabled = snapshot.connected || !current;
  $('disconnect').disabled = !snapshot.connected && snapshot.state !== 'CONNECTING';
  $('refresh-data').disabled = !snapshot.connected || Boolean(stagesData?.runner?.running || stagesData?.runner?.inFlight || operationsLocked());
  stageControls(); operationControls();
}
function selectAccount(id) {
  current = id || null;
  viewGuard.select(current);
  if (stream) stream.close();
  stream = null;
  snapshot = { connected: false, state: 'IDLE', busy: null, looping: false };
  seen.clear();
  resetExplorer();
  resetOrderRules();
  resetStages();
  resetOperations();
  resetGameplay();
  renderFishing(null);
  for (const id of ['who', 'res', 'items', 'hero-strip', 'log', 'busy', 'hint', 'loot-hint', 'loot-view', 'loop-hint', 'loop-view', 'tasks-hint', 'tasks-view', 'world-hint', 'world-view', 'world-factories', 'world-orders', 'world-stock', 'world-fields', 'hero-hint', 'hero-view', 'hero-table', 'dailies-hint', 'dailies-view', 'dailies-table', 'cred', 'worlds', 'worlds-hint']) clear($(id));
  $('sync-info').textContent = '尚未采集，请先连接账号并刷新数据';
  $('cred-show').disabled = false;
  renderAccountSelect();
}
async function loadAccounts(reload, scope = viewGuard.capture()) {
  const data = await call('/api/accounts', undefined, scope);
  viewGuard.assert(scope);
  accounts = data.accounts;
  const selected = accounts.some((entry) => entry.id === current) ? current : data.activeId || null;
  if (selected !== current) selectAccount(selected);
  renderAccountSelect();
  renderAccounts();
  if (reload) { subscribe(); await refreshOverview(); }
}
async function switchAccount(id) {
  selectAccount(id);
  renderAccounts();
  const scope = viewGuard.capture();
  try {
    await call('/api/accounts/active', { method: 'POST', body: JSON.stringify({ confirm: true, id }) }, scope);
    await loadAccounts(true, scope);
  } catch (error) { if (viewGuard.current(scope)) $('hint').textContent = error.message; }
}
$('account').onchange = () => switchAccount($('account').value);
$('connect').onclick = async () => {
  const scope = viewGuard.begin('connection');
  $('hint').textContent = '正在连接 ...';
  try {
    await call('/api/connect', { method: 'POST' }, scope);
    await call('/api/refresh', { method: 'POST' }, scope);
    await refreshOverview(scope);
  } catch (error) {
    if (viewGuard.current(scope)) {
      await refreshOverview(scope);
      if (viewGuard.current(scope)) $('hint').textContent = error.message;
    }
  }
};
$('disconnect').onclick = async () => {
  selectAccount(current);
  const scope = viewGuard.begin('connection');
  try {
    await call('/api/disconnect', { method: 'POST' }, scope);
    await refreshOverview(scope);
    if (viewGuard.current(scope)) subscribe();
  } catch (error) { if (viewGuard.current(scope)) $('hint').textContent = error.message; }
};
$('refresh-data').onclick = async () => {
  const scope = viewGuard.begin('refresh');
  $('hint').textContent = '正在采集 ...';
  try {
    await call('/api/refresh', { method: 'POST' }, scope);
    await refreshOverview(scope);
  } catch (error) { if (viewGuard.current(scope)) $('hint').textContent = error.message; }
};
function domainResult(data, request) {
  const outcome = data.outcomes?.[request];
  const failed = Array.isArray(data.failed) ? data.failed.includes(request) : Object.hasOwn(data.failed || {}, request);
  if (outcome?.status === 'SUCCESS') return { readable: true, empty: '本次查询为空' };
  if (outcome?.status === 'FAILED' || failed) {
    const reason = outcome?.error || (!Array.isArray(data.failed) && data.failed?.[request]);
    return { readable: false, empty: '查询失败' + (reason ? '：' + reason : '，数据未知') };
  }
  if (outcome) return { readable: false, empty: '查询未执行，数据未知' + (outcome.error ? '：' + outcome.error : '') };
  return data.updatedAt ? { readable: true, empty: '本次查询为空' } : { readable: false, empty: '尚未采集，数据未知' };
}
function renderFishing(data, readFailed = false) {
  const box = clear($('fishing-facts'));
  const view = data?.fishing, stamp = data?.updatedAt;
  $('fishing-meta').textContent = readFailed ? '无法读取本账号缓存。' : !stamp ? '尚未采集本账号的钓鱼数据。' :
    '最近采集：' + when(stamp) + (data.snapshotStale ? '（历史缓存）' : '') + (data.snapshotStatus === 'PARTIAL' ? '；部分来源读取失败。' : '。');
  if (!view || !stamp) return;
  const { level, inventory, collection } = view, known = value => value == null ? '未知' : String(value);
  box.appendChild(table(['钓鱼等级', '强化', '鱼库存', '原料容量', '剩余空间'], [[
    known(level?.level), known(level?.enhance), known(inventory?.owned), known(inventory?.capacity), known(inventory?.remaining),
  ]]));
  if (inventory?.full === true) box.appendChild(el('p', 'warn', '本次采集显示鱼库存已达到容量。'));
  box.appendChild(table(['已发现鱼种', '图鉴总积分', '已用积分', '可用积分', '已领奖档位'], [[
    known(collection?.collectedCount), known(collection?.totalScore), known(collection?.claimedScore),
    known(collection?.availableScore), known(collection?.rewardId),
  ]]));
  const next = collection?.nextStage;
  if (next) {
    const eligibility = next.eligible === true ? '已达积分门槛' : next.eligible === false ? '还差 ' + known(next.missingScore) + ' 积分' : '积分资格未知';
    box.appendChild(el('h3', null, '图鉴第 ' + next.stage + ' 档'));
    box.appendChild(el('p', null, '本档需 ' + known(next.requiredScore) + ' 积分；' + eligibility + '。'));
    if (Array.isArray(next.rewards) && next.rewards.length) {
      box.appendChild(table(['配置奖励', '数量'], next.rewards.map(row => [row.id === 'RUBY' ? '钻石' : row.id, known(row.num)])));
    }
  } else box.appendChild(el('p', 'dim', collection?.complete === true ? '当前配置中的图鉴档位已领完。' : '下一档奖励资格未知。'));
  box.appendChild(el('p', 'dim', '待捕鱼、收线剩余时间和续接状态：未知。此页只读。'));
}
function renderOverview(data) {
  renderFishing(data);
  const role = data.player || {};
  const status = data.status || {};
  const states = { IDLE: '未连接', CONNECTING: '连接中', READY: '已连接', FAILED: '连接失败', REJECTED: '登录失效或被拒绝', CLOSED: '连接已断开', STOPPED: '已停止' };
  const who = clear($('who'));
  for (const [name, value] of [['账号', data.account?.title || '-'], ['角色', role.nickname || '-'], ['等级', role.level ?? '-'], ['战力', fmt(role.power)], ['区服', role.worldId ?? '-'], ['连接状态', states[status.state] || '未知']]) {
    const row = el('div', 'item');
    row.appendChild(el('span', 'k', name)); row.appendChild(el('span', 'v', String(value))); who.appendChild(row);
  }
  const failures = Array.isArray(data.failed) ? data.failed.length : Object.keys(data.failed || {}).length;
  const statesOfData = { NOT_COLLECTED: '尚未采集（未知）', SUCCESS: '采集成功', PARTIAL: '部分失败', FAILED: '采集失败', unknown: '未知' };
  $('sync-info').textContent = '采集状态：' + (statesOfData[data.snapshotStatus] || data.snapshotStatus || '未知') + (data.snapshotStale ? '（缓存已过期，连接后可手动刷新）' : '') + (data.updatedAt ? '　最近更新：' + when(data.updatedAt) : '　尚未采集') + (failures ? '　查询失败：' + failures + ' 项' : '');
  if (data.dataContext) {
    const clock = data.dataContext.clock?.clock;
    $('sync-info').textContent += '　事实代次：' + data.dataContext.generation + '　游戏时钟：' + (clock?.reliable === true ? '可信（误差≤' + Math.ceil(clock.uncertaintyMs) + 'ms）' : '未知；时间敏感操作受保护');
  }
  const resourceResult = domainResult(data, 'AllResourceRequest');
  const itemResult = domainResult(data, 'AllItemRequest');
  const heroResult = domainResult(data, 'AllHeroRequest');
  const res = clear($('res'));
  for (const entry of resourceResult.readable ? data.resources || [] : []) res.appendChild(cell(entry.icon, 34, entry.name || String(entry.res), fmt(entry.amount)));
  const items = clear($('items'));
  for (const entry of itemResult.readable ? data.items?.top || [] : []) items.appendChild(cell(entry.icon, 34, entry.itemId, 'x' + fmt(entry.num)));
  const heroes = clear($('hero-strip'));
  for (const hero of heroResult.readable ? data.heroes?.list || [] : []) heroes.appendChild(cell(hero.icon, 40, hero.heroId, 'lv' + hero.level + ' · ' + hero.star + '星'));
  for (const [box, result] of [[res, resourceResult], [items, itemResult], [heroes, heroResult]]) if (!box.childElementCount) box.appendChild(el('span', 'dim', result.empty));
}
async function refreshOverview(base = viewGuard.capture()) {
  if (!base.account || !viewGuard.current(base)) return;
  const scope = viewGuard.begin('overview', base);
  try {
    const data = await call('/api/overview', undefined, scope);
    viewGuard.assert(scope);
    if (data.account?.id !== scope.account || data.accountId !== undefined && data.accountId !== scope.account) throw Error('概览账号不匹配');
    snapshot = data.status;
    const account = accounts.find((entry) => entry.id === scope.account);
    if (account) account.status = data.status;
    renderAccountSelect(); renderAccounts(); renderOverview(data);
    $('hint').textContent = '';
    $('busy').textContent = data.status.busy ? '执行中: ' + data.status.busy : '';
  } catch (error) {
    if (viewGuard.current(scope)) { $('hint').textContent = error.message; renderFishing(null, true); }
  }
}
$('fishing-read').onclick = () => refreshOverview();
function renderLoop(data) { $('loop-view').textContent = data.running ? '存在运行任务' : '未运行'; }
async function refreshLoop() { await readView('loop', '/api/loop', renderLoop, 'loop-hint'); }
$('tasks-plan').onclick = () => readView('tasks', '/api/tasks', (data) => { $('tasks-view').textContent = data.text; }, 'tasks-hint');
$('world-plan').onclick = () => readView('world', '/api/world', renderWorld, 'world-hint');
$('hero-plan').onclick = () => readView('heroes', '/api/heroes', renderHeroes, 'hero-hint');
$('dailies-plan').onclick = () => readView('dailies', '/api/dailies', renderDailies, 'dailies-hint');
function cloneOrderRules(value) { return JSON.parse(JSON.stringify(value)); }
function clearOrderPreview(message = '配置已修改，请重新模拟。') {
  clear($('order-preview-list')); $('order-preview-meta').textContent = message;
}
function resetOrderRules() {
  orderRulesData = null; orderRulesDraft = null; orderRulesRevision += 1;
  for (const id of ['order-rules-save', 'order-rules-default', 'order-rules-preview', 'order-rules-enabled', 'order-rule-add-type', 'order-rule-add']) $(id).disabled = true;
  $('order-rules-enabled').checked = false;
  for (const id of ['order-rules-editor', 'order-rule-add-type', 'order-item-options', 'order-rules-hint']) clear($(id));
  $('order-rules-source').textContent = '选择账号后读取独立配置。';
  $('order-items-note').textContent = '物品使用原始 ID 匹配，显示名称不会自动转换为 ID。';
  clearOrderPreview('尚未模拟。');
}
function orderRulesCurrent(scope, revision) { return viewGuard.current(scope) && orderRulesRevision === revision; }
function orderItemText(id) {
  const item = orderRulesData?.items?.find((entry) => String(entry.id) === String(id));
  return item?.name && item.name !== String(id) ? item.name + ' [' + id + ']' : String(id ?? '未知 ID');
}
function editOrderRules(change, render = true) {
  if (!orderRulesDraft) return;
  change(); orderRulesRevision += 1;
  orderRulesDraft.rules.forEach((rule, index) => { rule.priority = index + 1; });
  clearOrderPreview();
  $('order-rules-hint').textContent = '有未保存修改；模拟使用编辑器当前配置。';
  if (render) renderOrderRulesEditor();
}
function orderRuleParams(type) {
  if (type === 'ITEM_FORBIDDEN' || type === 'ITEM_REQUIRED') return { itemIds: [] };
  if (type === 'MIN_EXPERIENCE') return { value: 700, operator: 'GT' };
  if (type === 'MAX_ITEM_COUNT') return { itemId: '', value: 1 };
  return {};
}
function renderOrderRulesEditor() {
  const box = clear($('order-rules-editor'));
  const draft = orderRulesDraft;
  if (!draft) return;
  $('order-rules-enabled').checked = draft.enabled === true;
  for (const id of ['order-rules-save', 'order-rules-default', 'order-rules-preview', 'order-rules-enabled', 'order-rule-add-type', 'order-rule-add']) $(id).disabled = false;
  const scope = viewGuard.capture();
  const modify = (change, render = true) => {
    if (!viewGuard.current(scope) || draft !== orderRulesDraft) return;
    editOrderRules(change, render);
  };
  for (const [index, rule] of draft.rules.entries()) {
    const card = el('div', 'order-rule'); card.dataset.ruleId = rule.id;
    card.appendChild(el('h3', null, '优先级 ' + (index + 1) + ' · ' + rule.id));
    const bar = el('div', 'bar'), enabled = el('input');
    enabled.type = 'checkbox'; enabled.checked = rule.enabled; enabled.dataset.field = 'enabled';
    enabled.onchange = () => modify(() => { rule.enabled = enabled.checked; });
    const enabledLabel = el('label', null, '启用此规则 '); enabledLabel.appendChild(enabled); bar.appendChild(enabledLabel);
    for (const [label, delta] of [['上移', -1], ['下移', 1]]) {
      const move = el('button', 'tiny', label); move.dataset.action = delta < 0 ? 'up' : 'down';
      move.disabled = index + delta < 0 || index + delta >= draft.rules.length;
      move.onclick = () => modify(() => {
        const other = index + delta;
        if (other < 0 || other >= draft.rules.length) return;
        [draft.rules[index], draft.rules[other]] = [draft.rules[other], draft.rules[index]];
      }); bar.appendChild(move);
    }
    const drop = el('button', 'tiny', '删除'); drop.dataset.action = 'delete';
    drop.onclick = () => modify(() => { draft.rules.splice(index, 1); }); bar.appendChild(drop); card.appendChild(bar);
    const fields = el('div', 'order-rule-fields');
    const itemNames = el('div', 'dim');
    const showItemNames = () => { const ids = rule.type === 'MAX_ITEM_COUNT' ? [rule.params.itemId].filter(Boolean) : rule.params.itemIds || []; itemNames.textContent = '已选物品：' + (ids.length ? ids.map(orderItemText).join('；') : '尚未指定原始 ID'); };
    const addField = (label, input) => { const wrap = el('label', 'order-rule-field', label); wrap.appendChild(input); fields.appendChild(wrap); };
    const select = (choices, value, field, change) => {
      const input = el('select'); input.dataset.field = field;
      for (const [id, label] of choices) input.appendChild(new Option(label, id));
      input.value = value; input.onchange = () => modify(() => change(input.value)); return input;
    };
    addField('规则类型', select(orderRulesData.ruleTypes.map((type) => [type.type, type.label]), rule.type, 'type', (value) => { rule.type = value; rule.params = orderRuleParams(value); }));
    addField('不满足时的建议', select([['KEEP', '保留'], ['REFRESH', '刷新'], ['REVIEW', '人工检查']], rule.onFail, 'onFail', (value) => { rule.onFail = value; }));
    const itemInput = (field, value, update) => {
      const input = el('input'); input.dataset.field = field; input.value = value;
      input.setAttribute('list', 'order-item-options'); input.placeholder = '输入原始物品 ID';
      input.oninput = () => { modify(() => update(input.value), false); showItemNames(); }; return input;
    };
    const numberInput = (field, value, update) => {
      const input = el('input'); input.type = 'number'; input.min = '0'; input.step = '1'; input.dataset.field = field; input.value = value ?? '';
      input.oninput = () => modify(() => update(input.value.trim() === '' ? null : Number(input.value)), false); return input;
    };
    if (rule.type === 'ITEM_FORBIDDEN' || rule.type === 'ITEM_REQUIRED') {
      const items = itemInput('itemIds', (rule.params.itemIds || []).join(', '), (value) => {
        rule.params.itemIds = [...new Set(value.split(',').flatMap((part) => part.split('，')).flatMap((part) => part.split(String.fromCharCode(10))).map((id) => id.trim()).filter(Boolean))];
      });
      addField(rule.type === 'ITEM_FORBIDDEN' ? '禁止物品 ID（多个用逗号分隔）' : '必须包含全部物品 ID（逗号分隔）', items);
    } else if (rule.type === 'MIN_EXPERIENCE') {
      addField('经验比较', select([['GT', '>'], ['GTE', '≥']], rule.params.operator, 'operator', (value) => { rule.params.operator = value; }));
      addField('经验门槛', numberInput('value', rule.params.value, (value) => { rule.params.value = value; }));
    } else if (rule.type === 'MAX_ITEM_COUNT') {
      addField('限制的原始物品 ID', itemInput('itemId', rule.params.itemId || '', (value) => { rule.params.itemId = value.trim(); }));
      addField('需求数量上限', numberInput('value', rule.params.value, (value) => { rule.params.value = value; }));
    } else {
      fields.appendChild(el('span', 'dim', '检查当前订单的完整需求是否有足够库存；所有规则通过后仍会独立检查库存。'));
    }
    card.appendChild(fields);
    if (rule.type === 'ITEM_FORBIDDEN' || rule.type === 'ITEM_REQUIRED' || rule.type === 'MAX_ITEM_COUNT') { showItemNames(); card.appendChild(itemNames); }
    box.appendChild(card);
  }
  if (!draft.rules.length) box.appendChild(el('div', 'dim', '尚无规则，可添加规则并指定失败建议。'));
}
function installOrderRulesData(data) {
  if (!data.config || data.config.version !== 1 || !Array.isArray(data.config.rules)) throw new Error('返回的规则配置格式无效');
  orderRulesData = data;
  orderRulesDraft = cloneOrderRules(data.config);
  orderRulesDraft.rules.sort((a, b) => a.priority - b.priority);
  orderRulesRevision += 1;
  const typeBox = clear($('order-rule-add-type'));
  for (const type of data.ruleTypes || []) typeBox.appendChild(new Option(type.label, type.type));
  typeBox.value = data.ruleTypes?.[0]?.type || '';
  const options = clear($('order-item-options'));
  for (const item of data.items || []) {
    const option = el('option', null, item.name + ' · ' + item.source); option.value = String(item.id); option.label = item.name + ' · ID ' + item.id;
    options.appendChild(option);
  }
  $('order-items-note').textContent = (data.itemSourceNote || '物品使用配置表或缓存响应中的原始 ID。') + ' 名称只用于展示；请按原始 ID 精确匹配，不会自动转换名称。';
  $('order-rules-source').textContent = '当前账号：' + data.accountId + ' · 配置来源：' + (data.source === 'account' ? '账号独立配置' : '全局安全默认配置（未保存账号覆盖）') + ' · 格式 v1';
  renderOrderRulesEditor(); clearOrderPreview('尚未模拟当前配置。');
}
async function loadOrderRules() {
  const scope = viewGuard.begin('order-rules');
  orderRulesRevision += 1; const revision = orderRulesRevision;
  clearOrderPreview('正在重新加载规则配置。'); $('order-rules-hint').textContent = '读取账号规则配置 ...';
  try {
    const data = await call('/api/order-rules', undefined, scope);
    if (!orderRulesCurrent(scope, revision)) return;
    if (data.accountId !== scope.account) throw new Error('规则账号不匹配，已忽略响应');
    installOrderRulesData(data); $('order-rules-hint').textContent = data.warning || '已读取；保存和模拟都不会操作游戏。';
  } catch (error) { if (orderRulesCurrent(scope, revision)) $('order-rules-hint').textContent = '读取失败：' + error.message; }
}
async function saveOrderRules() {
  if (!orderRulesDraft) return;
  const scope = viewGuard.begin('order-rules'); const revision = orderRulesRevision;
  const config = cloneOrderRules(orderRulesDraft); $('order-rules-hint').textContent = '保存本账号本地规则 ...';
  try {
    const data = await call('/api/order-rules', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ config }) }, scope);
    if (!viewGuard.current(scope)) return;
    if (data.accountId !== scope.account) throw new Error('规则账号不匹配，已忽略响应');
    if (orderRulesRevision !== revision) { $('order-rules-hint').textContent = '点击保存时的配置已保存；编辑器仍有新的未保存修改。'; return; }
    installOrderRulesData({ ...orderRulesData, ...data }); $('order-rules-hint').textContent = data.warning || '已保存当前账号规则；游戏状态未改变。';
  } catch (error) { if (orderRulesCurrent(scope, revision)) $('order-rules-hint').textContent = '保存失败：' + error.message; }
}
function renderOrderPreview(data) {
  const box = clear($('order-preview-list'));
  $('order-preview-meta').textContent = '只读模拟 · ' + data.status + ' · ' + (data.orders?.length || 0) + ' 个缓存订单 · 快照时间：' + (when(data.updatedAt) || '未知')
    + (data.stale ? '（缓存已过期）' : '') + (data.error ? ' · ' + data.error : '');
  const decisions = { RECOMMEND_SUBMIT: '建议提交', RECOMMEND_REFRESH: '建议刷新', RECOMMEND_KEEP: '建议保留', NEEDS_REVIEW: '需要人工检查' };
  const inventoryStatus = { PASS: '充足', FAIL: '不足', UNKNOWN: '未知', SKIPPED: '未进行最终库存判断' };
  for (const row of data.orders || []) {
    const order = row.order || {}, result = row.result || {}, card = el('div', 'order-preview-card');
    card.appendChild(el('h3', null, '订单 #' + (order.index ?? result.orderId ?? '未知')));
    card.appendChild(el('div', null, '经验：' + (order.rewardExp ?? '未知')));
    card.appendChild(el('div', null, '需求：' + (order.requirements?.length ? order.requirements.map((need) => orderItemText(need.id) + ' × ' + (need.num ?? '未知')).join('；') : '未知')));
    card.appendChild(el('div', null, '库存：' + (inventoryStatus[result.inventory?.status] || '未知') + (result.inventory?.explanation ? ' · ' + result.inventory.explanation : '')));
    if (Array.isArray(row.inventoryFacts)) for (const fact of row.inventoryFacts) {
      card.appendChild(el('div', 'dim', orderItemText(fact.id) + '：需求 ' + (fact.required ?? '未知') + ' / 持有 ' + (fact.available ?? '未知') + ' / 缺口 ' + (fact.missing ?? '未知')));
    }
    const trace = el('ol', 'order-rule-trace');
    for (const rule of result.ruleResults || []) trace.appendChild(el('li', rule.status === 'FAIL' || rule.status === 'UNKNOWN' ? 'warn' : '', '优先级 ' + rule.priority + ' · ' + rule.id + ' · ' + rule.type + ' · ' + rule.status + '：' + rule.explanation));
    if (!trace.childElementCount) trace.appendChild(el('li', 'dim', '没有已配置规则。'));
    card.appendChild(trace);
    card.appendChild(el('div', null, '第一个失败规则：' + (result.firstFailedRuleId || '无 FAIL')));
    card.appendChild(el('div', 'warn', '最终建议：' + (decisions[result.decision] || '需要人工检查') + ' · ' + (result.decision || 'NEEDS_REVIEW')));
    for (const message of result.explanation || []) card.appendChild(el('div', null, message));
    box.appendChild(card);
  }
  if (!box.childElementCount) box.appendChild(el('div', 'dim', data.status === 'SUCCESS' ? '当前快照没有居民订单。' : '订单数据不完整，无法生成可靠建议。'));
}
async function previewOrderRules() {
  if (!orderRulesDraft) return;
  const scope = viewGuard.begin('order-preview'); const revision = orderRulesRevision;
  const config = cloneOrderRules(orderRulesDraft);
  clearOrderPreview('正在使用已有 Snapshot 模拟 ...');
  try {
    const data = await call('/api/order-rules/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ config }) }, scope);
    if (!orderRulesCurrent(scope, revision)) return;
    if (data.accountId !== scope.account) throw new Error('预览账号不匹配，已忽略响应');
    renderOrderPreview(data);
  } catch (error) { if (orderRulesCurrent(scope, revision)) clearOrderPreview('模拟失败：' + error.message); }
}
$('order-rules-load').onclick = loadOrderRules;
$('order-rules-save').onclick = saveOrderRules;
$('order-rules-preview').onclick = previewOrderRules;
$('order-rules-default').onclick = () => {
  if (!orderRulesData?.defaults) return;
  editOrderRules(() => { orderRulesDraft = cloneOrderRules(orderRulesData.defaults); });
  $('order-rules-hint').textContent = '已复制全局安全默认配置到编辑器；需点击保存才会覆盖本账号配置。';
};
$('order-rules-enabled').onchange = () => editOrderRules(() => { orderRulesDraft.enabled = $('order-rules-enabled').checked; });
$('order-rule-add').onclick = () => {
  const type = $('order-rule-add-type').value;
  if (!orderRulesDraft || !orderRulesData?.ruleTypes?.some((entry) => entry.type === type)) return;
  editOrderRules(() => {
    let id; do { id = 'rule-' + Date.now().toString(36) + '-' + (++orderRuleSequence); } while (orderRulesDraft.rules.some((rule) => rule.id === id));
    orderRulesDraft.rules.push({ id, priority: orderRulesDraft.rules.length + 1, type, enabled: true, params: orderRuleParams(type), onFail: 'KEEP' });
  });
};
// Operations use a narrow batch capability; ordinary READ_POSTS is unchanged.
function operationsLocked() { return operationsData?.status?.running === true || operationsData?.status?.blocked === true; }
function operationRows() {
  const orders = operationsData?.view?.orders;
  return [...(Array.isArray(orders) ? orders : orders?.rows || []), ...(operationsData?.view?.city?.candidates || [])];
}
function operationTarget(target) { return typeof target === 'string' ? target : Object.entries(target || {}).map(([key, value]) => key + '=' + value).join(' · '); }
function operationTitle(row) { return row.label || row.actionType + ' · ' + operationTarget(row.target); }
function operationCosts(costs) { return Array.isArray(costs) ? costs.length ? costs.map((cost) => cost.id + ' × ' + (cost.num ?? '未知')).join('；') : '无资源消耗' : '成本未知'; }
function operationValidBudget(budget) { return Array.isArray(budget) && budget.every((cost) => typeof cost.id === 'string' && cost.id && Number.isSafeInteger(cost.num) && cost.num >= 0); }
function operationPlanLive() {
  const plan = operationsPlan;
  const expiry = typeof plan?.expiresAt === 'number' ? plan.expiresAt : Date.parse(plan?.expiresAt || '');
  return Boolean(plan && !plan.consumed && plan.accountId === current && plan.batchId && plan.planHash && Array.isArray(plan.actions) && plan.actions.length && plan.actions.every((action) => operationValidBudget(action.costs)) && operationValidBudget(plan.resourceBudget) && Number.isFinite(expiry) && expiry > Date.now());
}
function operationModeError(rows) {
  const mode = $('ops-mode').value || 'Manual';
  if (!rows.length) return '请先选择具体操作。';
  if (mode === 'Manual' && rows.length !== 1) return 'Manual 每次只授权一个具体操作，请逐项预览。';
  if (mode === 'Hybrid' && rows.some((row) => row.actionType === 'SUBMIT') && rows.length !== 1) return 'Hybrid 提交订单需逐单预览授权；刷新可选择本批次多单。';
  if (mode === 'Automatic' && rows.some((row) => row.actionType === 'startProduce')) {
    if (productionPolicyDirty || !operationsData?.view?.productionPolicy?.enabled) return 'Automatic 生产需要先保存启用的本账号策略，再探测本次推荐。';
    const recommended = new Set(operationsData.view.productionRecommendations || []);
    if (rows.some((row) => row.actionType === 'startProduce' && !recommended.has(row.actionId))) return 'Automatic 只允许本账号当前策略推荐的具体生产操作，请重新探测并选择。';
  }
  return '';
}
function invalidateOperationPlan() {
  operationsRevision += 1; operationsPlan = null;
  $('ops-plan-meta').textContent = '选择或模式已变化，请重新生成本批次预览。';
  $('ops-budget').textContent = '尚未生成预览。'; clear($('ops-plan-actions'));
}
function resetOperations() {
  operationsData = null; operationsPlan = null; operationsPending = false; operationsReadable = false; operationsViewKey = null;
  operationSelections.clear(); operationsRevision += 1; $('ops-mode').value = 'Manual';
  productionPolicyData = null; productionPolicyDraft = null; productionPolicyDirty = false; productionPolicyPending = false;
  $('production-policy-enabled').checked = false; $('production-policy-shortages').checked = true;
  $('production-policy-products').value = ''; $('production-policy-limit').value = '10';
  $('production-policy-source').textContent = '尚未读取本账号策略。'; $('production-policy-hint').textContent = '';
  for (const id of ['ops-orders', 'ops-city', 'ops-production', 'ops-stock', 'ops-notes', 'ops-hint', 'ops-history-hint', 'ops-plan-actions']) clear($(id));
  $('ops-status').textContent = '选择账号后读取已有运行状态。';
  $('ops-history').textContent = '尚未读取历史。'; $('ops-production-report').textContent = '读取执行历史后显示。';
  resetOperationMemory();
  $('ops-budget').textContent = '尚未生成预览。'; $('ops-plan-meta').textContent = '先选择操作并生成预览，再授权执行。';
  renderOperationSelection(); operationControls();
}
function operationControls() {
  const status = operationsData?.status || {};
  const locked = operationsLocked() || Boolean(stagesData?.runner?.running || stagesData?.runner?.inFlight);
  const ready = Boolean(current && snapshot.connected && snapshot.state === 'READY' && operationsData?.csrfToken && operationsReadable && !productionPolicyPending);
  const selected = operationRows().filter((row) => operationSelections.has(row.actionId));
  $('ops-load').disabled = !current || operationsPending;
  $('ops-memory-load').disabled = !current;
  $('ops-survey').disabled = !ready || operationsPending || locked;
  $('ops-plan').disabled = !ready || operationsPending || locked || Boolean(operationModeError(selected));
  $('ops-authorize-execute').disabled = !ready || operationsPending || locked || !operationPlanLive();
  $('ops-stop').disabled = !current || operationsPending || status.running !== true || !operationsData?.csrfToken;
  $('ops-mode').disabled = operationsPending || productionPolicyPending || status.running === true;
  $('ops-clear').disabled = operationsPending || productionPolicyPending || status.running === true;
  const policyBusy = productionPolicyPending || operationsPending || locked;
  $('production-policy-load').disabled = !current || productionPolicyPending;
  $('production-policy-save').disabled = !current || !operationsData?.csrfToken || !productionPolicyDraft || policyBusy;
  for (const id of ['production-policy-enabled', 'production-policy-shortages', 'production-policy-products', 'production-policy-limit']) $(id).disabled = !productionPolicyDraft || policyBusy;
  $('production-select-recommended').disabled = !ready || policyBusy || productionPolicyDirty || !operationsData?.view?.productionPolicy?.enabled || !(operationsData?.view?.productionRecommendations || []).length;
  const mode = $('ops-mode').value || 'Manual';
  $('ops-mode-note').textContent = mode === 'Manual' ? 'Manual：逐单或逐项查看决策并授权。KEEP / REVIEW 保持不执行。' : mode === 'Hybrid' ? 'Hybrid：用户选择的刷新可组成批次；订单提交逐单授权。' : 'Automatic：仅执行本次明确选择与授权的操作列表；新订单、新计划必须重新授权，不自动循环。';
}
function renderOperationSelection() {
  const box = clear($('ops-selected'));
  const selected = operationRows().filter((row) => operationSelections.has(row.actionId));
  for (const row of selected) box.appendChild(el('div', null, operationTitle(row) + ' · ' + operationCosts(row.costs)));
  if (!selected.length) box.textContent = '尚未选择。';
  const error = operationModeError(selected);
  if (selected.length && error) box.appendChild(el('div', 'warn', error));
  operationControls();
}
function operationChoice(row, container) {
  const label = el('label', 'bar'); const input = el('input'); input.type = 'checkbox'; input.dataset.actionId = row.actionId || '';
  input.checked = operationSelections.has(row.actionId);
  input.disabled = !row.actionId || row.executable === false || operationsPending || productionPolicyPending || operationsLocked();
  input.onchange = () => {
    if (input.disabled) return;
    if (input.checked) operationSelections.add(row.actionId); else operationSelections.delete(row.actionId);
    invalidateOperationPlan(); renderOperationSelection();
  };
  label.appendChild(input); label.appendChild(document.createTextNode(operationTitle(row) + ' · ' + operationCosts(row.costs)));
  container.appendChild(label);
  if (row.blockedReason) container.appendChild(el('div', 'warn', row.blockedReason));
}
function renderOperationCandidates() {
  const view = operationsData?.view;
  const orders = clear($('ops-orders')), city = clear($('ops-city')), production = clear($('ops-production')), stock = clear($('ops-stock'));
  if (!view) {
    for (const box of [orders, city, production, stock]) box.textContent = '尚未探测；读取已有运行状态不会向游戏发送查询。';
    return;
  }
  const rows = Array.isArray(view.orders) ? view.orders : view.orders?.rows || [];
  for (const row of rows) {
    const card = el('div', 'order-preview-card'), before = row.beforeState || {};
    card.appendChild(el('h3', null, '订单 #' + (row.target?.index ?? before.index ?? '?') + ' · ' + (row.decision || 'REVIEW')));
    card.appendChild(el('div', null, '需求：' + operationCosts(before.requirements) + ' · 经验：' + (before.rewardExp ?? '未知')));
    for (const rule of row.ruleResult?.ruleResults || []) card.appendChild(el('div', rule.status === 'UNKNOWN' || rule.status === 'FAIL' ? 'warn' : 'dim', '优先级 ' + rule.priority + ' · ' + rule.id + ' · ' + rule.status + '：' + rule.explanation));
    if(row.configuredRewardEvidence){const reward=el('details');reward.appendChild(el('summary',null,'配置基础奖励（最终金币预览公式待证，不作为门槛）'));reward.appendChild(el('pre',null,JSON.stringify(row.configuredRewardEvidence,null,2)));card.appendChild(reward);}
    for (const reason of row.ruleResult?.explanation || []) card.appendChild(el('div', null, reason));
    if (row.ruleResult?.inventory) card.appendChild(el('div', 'dim', '库存检查：' + row.ruleResult.inventory.status + ' · ' + (row.ruleResult.inventory.explanation || '')));
    card.appendChild(el('div', 'dim', '探测库存：' + operationCosts(row.resourceBefore)));
    if (row.actionType === 'KEEP' || row.actionType === 'REVIEW' || !row.actionId) card.appendChild(el('div', 'warn', row.blockedReason || '保留或等待人工检查，不产生游戏写操作。'));
    else operationChoice(row, card);
    orders.appendChild(card);
  }
  if (!rows.length) orders.textContent = '当前没有可解析的居民订单。';
  const data = view.city || {}, candidates = data.candidates || [];
  for (const building of data.buildings || []) {
    const card = el('div', 'order-preview-card'); card.appendChild(el('h3', null, building.buildingId + ' · ' + (building.type || '类型未知') + ' · lv' + (building.level ?? '?')));
    card.appendChild(el('div', null, '当前状态：' + (building.status || '未知')));
    card.appendChild(el('div', 'dim', '升级条件：' + (typeof building.upgradeConditions === 'string' ? building.upgradeConditions : JSON.stringify(building.upgradeConditions ?? '未知'))));
    card.appendChild(el('div', null, '材料需求：' + operationCosts(building.materialCosts)));
    card.appendChild(el('div', 'dim', '操作后预期：' + JSON.stringify(building.expectedState ?? '未知')));
    const actions = candidates.filter((row) => row.target?.buildingId === building.buildingId && !['startProduce', 'gainFactory', 'speedUpProduce'].includes(row.actionType));
    for (const row of actions) operationChoice(row, card);
    if (!actions.length) card.appendChild(el('div', building.reliable === false ? 'warn' : 'dim', building.reliable === false ? '成本或状态不可靠，暂不允许执行。' : '当前没有满足条件的建筑操作；请查看升级条件与探测说明。'));
    city.appendChild(card);
  }
  if (!city.childElementCount) city.textContent = '当前没有建筑数据。';
  for (const factory of data.factories || []) {
    const card = el('div', 'order-preview-card'); card.appendChild(el('h3', null, factory.buildingId + ' · ' + (factory.type || '工厂') + ' · lv' + (factory.level ?? '?')));
    card.appendChild(el('div', null, '当前状态：' + (factory.status || '未知') + ' · 自动生产产品：' + (factory.autoProductId || '未设置')));
    card.appendChild(el('div', null, '生产槽位：' + (factory.slotCapacity ?? '未知') + ' · 空闲槽位：' + (factory.freeSlots ?? '未知')));
    card.appendChild(el('div', null, '可收取成品：' + JSON.stringify(factory.finishedProducts ?? '未知')));
    const queue = factory.queue || [];
    card.appendChild(table(['队列位置', '产品', '剩余秒数', '完成时间'], queue.map((job) => [job.idx ?? '?', job.productId || '未知', job.remainingSeconds ?? '未知', job.finishTime ? when(job.finishTime * 1000) : '未知'])));
    if (!queue.length) card.appendChild(el('div', 'dim', '当前队列为空。'));
    for (const recipe of factory.recipes || []) card.appendChild(el('div', 'dim', '配方 ' + recipe.productId + ' · 解锁等级 ' + (recipe.unlockLevel ?? '?') + ' · 用时 ' + (recipe.produceTime ?? '?') + ' 秒 · ' + operationCosts(recipe.costs)));
    const actions = candidates.filter((row) => row.target?.buildingId === factory.buildingId && ['startProduce', 'gainFactory', 'speedUpProduce'].includes(row.actionType));
    for (const row of actions) operationChoice(row, card);
    if (!actions.length) card.appendChild(el('div', 'dim', '当前没有可靠可执行的生产操作；道具加速仅在成本已知时提供。'));
    production.appendChild(card);
  }
  if (!production.childElementCount) production.textContent = '当前没有工厂数据。';
  stock.appendChild(table(['库存材料', '可靠数量'], (data.stock || []).map((item) => [item.id, item.num ?? '未知'])));
  if (!data.stock?.length) stock.appendChild(el('div', 'dim', '库存未知或为空，以探测结果为准。'));
  const shortages = view.productionShortages;
  if (shortages?.reliable === true && Array.isArray(shortages.items)) {
    stock.appendChild(el('h3', null, '可靠生产缺口汇总'));
    stock.appendChild(table(['材料', '订单需求', '现有库存', '在产数量', '待收成品', '剩余缺口'], shortages.items.map((item) => [item.id, item.required, item.inventory, item.inProgress, item.finished, item.missing])));
    if (!shortages.items.length) stock.appendChild(el('div', 'dim', '当前可靠汇总无缺口条目。'));
  } else stock.appendChild(el('div', 'warn', 'UNKNOWN · 生产缺口未知：库存、订单或生产队列数据不完整，不按 0 处理。'));
  for (const note of shortages?.notes || []) stock.appendChild(el('div', 'dim', typeof note === 'string' ? note : JSON.stringify(note)));
  const notes = clear($('ops-notes'));
  if (view.source) notes.appendChild(el('div', 'dim', view.source));
  if (view.surveyedAt) notes.appendChild(el('div', 'dim', '探测时间：' + when(view.surveyedAt) + '；缓存不代表实时状态。'));
  for (const note of [...(data.notes || []), ...(view.notes || [])]) notes.appendChild(el('div', null, typeof note === 'string' ? note : JSON.stringify(note)));
}
function renderOperations(data) {
  if (data.accountId !== current) throw new Error('操作状态账号不匹配，已忽略响应');
  const key = JSON.stringify(data.view || null);
  const samePlan = operationPlanLive() && data.lastPlan?.accountId === current && data.lastPlan?.batchId === operationsPlan.batchId && data.lastPlan?.planHash === operationsPlan.planHash;
  if (operationsViewKey !== null && key !== operationsViewKey && !samePlan) { operationSelections.clear(); invalidateOperationPlan(); }
  operationsViewKey = key;
  operationsData = { ...data, csrfToken: data.csrfToken || operationsData?.csrfToken }; operationsReadable = true;
  if (data.view?.productionPolicy && !productionPolicyDirty && !productionPolicyPending) renderProductionPolicy({ accountId: current, config: data.view.productionPolicy, source: '本账号当前策略', warning: data.view.productionPolicyWarning || null });
  const status = data.status || {}, box = clear($('ops-status'));
  const labels = { IDLE: '未运行', SURVEY: '探测', PLAN: '规划', RESOURCE_PREFLIGHT: '资源复核', AUTHORIZATION: '待授权', EXECUTING: '执行中', VERIFY: '结果复读', SUCCESS: '成功', FAILED: '失败', UNKNOWN: 'UNKNOWN · 结果未知，禁止自动重试', CANCELLED: '已取消', RATE_LIMITED: '服务器限频，已停止' };
  for (const [name, value] of [['状态', labels[status.finalStatus] || status.finalStatus || '未知'], ['执行批次', status.runId || '无'], ['停止原因', status.stopReason || '无'], ['未决保护', status.blocked ? '存在未决写操作，禁止重复执行。' : '无']]) { box.appendChild(el('div', 'k', name)); box.appendChild(el('div', 'v', value)); }
  renderOperationCandidates(); renderOperationSelection(); renderAccountSelect();
}
async function operationMutation(path, payload, scope) {
  viewGuard.assert(scope);
  const csrfToken = (operationsData?.accountId === scope.account ? operationsData.csrfToken : null) || gameplayCsrfToken();
  if (!scope.account || !csrfToken) throw new Error('请先读取本账号运行状态。');
  if (!['/api/operations/recovery/preview', '/api/operations/recovery/confirm', '/api/operations/survey', '/api/operations/plan', '/api/operations/authorize', '/api/operations/execute', '/api/operations/stop', '/api/operations/production-policy','/api/antiques/summary','/api/gameplay/survey','/api/gameplay/config','/api/workflows/save','/api/workflows/simulate','/api/workflows/start','/api/workflows/resume','/api/workflows/stop','/api/formations/named/save','/api/formations/named/rename','/api/formations/named/overwrite','/api/formations/named/delete','/api/formations/named/prepare','/api/formations/extreme/survey','/api/formations/extreme/prepare'].includes(path)) throw new Error('未开放此批次操作');
  const url = new URL(path, location.href); url.searchParams.set('account', scope.account);
  const response = await fetch(url.pathname + url.search, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cw-csrf': csrfToken }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({})); viewGuard.assert(scope);
  if (!response.ok) throw new Error(data.error || response.statusText);
  if (data.accountId != null && data.accountId !== scope.account) throw new Error('操作账号不匹配');
  return data;
}
async function refreshOperations() {
  if (!current || operationsPending) return;
  const scope = viewGuard.begin('operations');
  try { const data = await call('/api/operations', undefined, scope); renderOperations(data); $('ops-hint').textContent = ''; }
  catch (error) { if (viewGuard.current(scope)) { operationsReadable = false; $('ops-hint').textContent = '读取失败：' + error.message; operationControls(); } }
}
function renderOperationPlan(plan) {
  $('ops-plan-meta').textContent = '待授权 · 批次 ' + plan.batchId + ' · ' + plan.mode + ' · ' + plan.actions.length + ' 项 · 有效至 ' + when(plan.expiresAt) + '。只授权下列计划与资源预算。';
  const box = clear($('ops-plan-actions'));
  for (const row of plan.actions) {
    const card = el('div', 'order-preview-card'); card.appendChild(el('h3', null, operationTitle(row)));
    card.appendChild(el('div', null, '预留资源：' + operationCosts(row.costs)));
    card.appendChild(el('div', 'dim', '预期状态：' + JSON.stringify(row.expectedState ?? '执行后复读核验')));
    const details = el('details'); details.appendChild(el('summary', null, '计划依据与执行前状态')); details.appendChild(el('pre', null, JSON.stringify(row.beforeState, null, 2))); card.appendChild(details); box.appendChild(card);
  }
  for (const note of plan.notes || []) box.appendChild(el('div', 'warn', typeof note === 'string' ? note : JSON.stringify(note)));
  const budget = clear($('ops-budget'));
  budget.appendChild(table(['材料', '本批次总预留'], plan.resourceBudget.map((cost) => [cost.id, cost.num ?? '未知'])));
  if (!plan.resourceBudget.length) budget.appendChild(el('div', 'dim', '本批次无资源消耗；状态修改仍需授权。'));
  if (!operationValidBudget(plan.resourceBudget)) budget.appendChild(el('div', 'warn', '存在未知资源成本，禁止授权。'));
  operationControls();
}
$('ops-load').onclick = refreshOperations;
$('ops-mode').onchange = () => { invalidateOperationPlan(); renderOperationSelection(); };
$('ops-clear').onclick = () => { if (operationsPending) return; operationSelections.clear(); invalidateOperationPlan(); renderOperationCandidates(); renderOperationSelection(); };
$('ops-survey').onclick = async () => {
  if ($('ops-survey').disabled) return;
  const scope = viewGuard.begin('operations'); operationsPending = true; operationControls();
  operationSelections.clear(); invalidateOperationPlan(); $('ops-hint').textContent = '正在只读探测最新状态 ...';
  try { renderOperations(await operationMutation('/api/operations/survey', {}, scope)); $('ops-hint').textContent = '探测完成；请选择具体操作。'; }
  catch (error) { if (viewGuard.current(scope)) { operationsReadable = false; $('ops-hint').textContent = '探测失败：' + error.message; } }
  finally { if (viewGuard.current(scope)) { operationsPending = false; renderOperationCandidates(); operationControls(); } }
};
$('ops-plan').onclick = async () => {
  if ($('ops-plan').disabled) return;
  const selected = operationRows().filter((row) => operationSelections.has(row.actionId));
  const error = operationModeError(selected); if (error) { $('ops-hint').textContent = error; return; }
  const scope = viewGuard.begin('operations'); const revision = operationsRevision; operationsPending = true; operationControls();
  const hasOrders = selected.some((row) => ['SUBMIT', 'REFRESH'].includes(row.actionType));
  const module = hasOrders ? selected.every((row) => ['SUBMIT', 'REFRESH'].includes(row.actionType)) ? 'orders' : 'combined' : 'city';
  $('ops-hint').textContent = '正在生成共享预算预览 ...';
  try {
    const data = await operationMutation('/api/operations/plan', { module, mode: $('ops-mode').value || 'Manual', selections: selected.map((row) => row.actionId) }, scope);
    if (operationsRevision !== revision) return;
    const plan = data.plan || data;
    if (plan.accountId !== scope.account || !Array.isArray(plan.actions) || !Array.isArray(plan.resourceBudget)) throw new Error('计划账号或结构无效');
    operationsPlan = plan; renderOperationPlan(plan); $('ops-hint').textContent = '预览完成，尚未授权或执行。';
  } catch (error) { if (viewGuard.current(scope)) { invalidateOperationPlan(); $('ops-hint').textContent = '预览失败：' + error.message; } }
  finally { if (viewGuard.current(scope)) { operationsPending = false; operationControls(); } }
};
$('ops-authorize-execute').onclick = async () => {
  if ($('ops-authorize-execute').disabled || !operationPlanLive()) return;
  const plan = operationsPlan, scope = viewGuard.begin('operations');
  const text = '为账号 ' + scope.account + ' 授权本批次 ' + plan.batchId + '（' + plan.mode + '）？' + String.fromCharCode(10) + plan.actions.map(operationTitle).join(String.fromCharCode(10)) + String.fromCharCode(10) + '总资源消耗：' + operationCosts(plan.resourceBudget) + String.fromCharCode(10) + '只执行本批次具体列表；新订单或新计划需重新授权。未知结果立即停止。';
  if (!window.confirm(text)) return;
  viewGuard.assert(scope); operationsPending = true; operationControls(); $('ops-hint').textContent = '正在授权此计划与总预算 ...';
  try {
    const permit = await operationMutation('/api/operations/authorize', { batchId: plan.batchId, planHash: plan.planHash, approvedActionIds: plan.actions.map((row) => row.actionId), resourceBudget: plan.resourceBudget, confirm: true }, scope);
    if (permit.batchId !== plan.batchId || typeof permit.permitId !== 'string' || !permit.permitId || operationsPlan !== plan) throw new Error('授权与当前批次不匹配');
    plan.consumed = true;
    const result = await operationMutation('/api/operations/execute', { batchId: plan.batchId, permitId: permit.permitId }, scope);
    const status = typeof result.status === 'object' ? result.status : { running: result.status === 'EXECUTING', runId: result.runId, finalStatus: result.status || 'EXECUTING', blocked: false, stopReason: null };
    renderOperations({ ...operationsData, status }); $('ops-plan-meta').textContent = '此预览已授权使用；再次执行必须生成新预览并重新授权。'; $('ops-hint').textContent = '本批次已提交。结果以服务端复读和持久历史为准。';
  } catch (error) { if (viewGuard.current(scope)) { plan.consumed = true; $('ops-hint').textContent = '执行停止：' + error.message + '；请读取运行状态与历史，禁止重复发送。'; } }
  finally { if (viewGuard.current(scope)) { operationsPending = false; renderOperationCandidates(); operationControls(); } }
};
$('ops-stop').onclick = async () => {
  if ($('ops-stop').disabled) return;
  const scope = viewGuard.begin('operations'); operationsPending = true; operationControls();
  try { const result = await operationMutation('/api/operations/stop', {}, scope); renderOperations({ ...operationsData, ...(result.status ? result : { status: result }) }); $('ops-hint').textContent = '已停止后续操作；已发出的请求无法撤销，未决保护继续保留。'; }
  catch (error) { if (viewGuard.current(scope)) $('ops-hint').textContent = '停止失败：' + error.message; }
  finally { if (viewGuard.current(scope)) { operationsPending = false; operationControls(); } }
};
function renderProductionPolicy(data) {
  if (data.accountId !== current || !data.config) throw new Error('生产策略账号或配置无效');
  if (productionPolicyData && JSON.stringify(productionPolicyData.config) !== JSON.stringify(data.config)) invalidateOperationPlan();
  productionPolicyData = data; productionPolicyDraft = JSON.parse(JSON.stringify(data.config)); productionPolicyDirty = false;
  $('production-policy-enabled').checked = data.config.enabled === true; $('production-policy-shortages').checked = data.config.onlyShortages === true;
  $('production-policy-products').value = (data.config.productIds || []).join(', '); $('production-policy-limit').value = String(data.config.maxOperations ?? 10);
  $('production-policy-source').textContent = '本地账号策略 · ' + (data.source || '本账号配置') + (data.warning ? ' · ' + data.warning : '');
  operationControls();
}
async function refreshProductionPolicy() {
  if (!current || productionPolicyPending) return;
  const scope = viewGuard.begin('production-policy'); productionPolicyPending = true; operationControls();
  try { const data = await call('/api/operations/production-policy', undefined, scope); renderProductionPolicy(data); $('production-policy-hint').textContent = '仅本地配置；未向游戏发送操作。'; }
  catch (error) { if (viewGuard.current(scope)) { productionPolicyData = null; productionPolicyDraft = null; $('production-policy-hint').textContent = '读取失败：' + error.message; } }
  finally { if (viewGuard.current(scope)) { productionPolicyPending = false; operationControls(); } }
}
function editProductionPolicy() {
  if (!productionPolicyDraft || productionPolicyPending || operationsPending || operationsLocked()) return;
  productionPolicyDraft = { version: 1, enabled: $('production-policy-enabled').checked, onlyShortages: $('production-policy-shortages').checked,
    productIds: $('production-policy-products').value.split(/[,，]/).map((id) => id.trim()).filter(Boolean), maxOperations: Number($('production-policy-limit').value) };
  productionPolicyDirty = true; invalidateOperationPlan(); renderOperationSelection(); $('production-policy-hint').textContent = '有未保存修改；保存后请重新探测本批次推荐。';
}
$('production-policy-load').onclick = refreshProductionPolicy;
for (const id of ['production-policy-enabled', 'production-policy-shortages', 'production-policy-products', 'production-policy-limit']) $(id).onchange = editProductionPolicy;
for (const id of ['production-policy-products', 'production-policy-limit']) $(id).oninput = editProductionPolicy;
$('production-policy-save').onclick = async () => {
  if ($('production-policy-save').disabled) return;
  const config = productionPolicyDraft;
  if (!Number.isSafeInteger(config.maxOperations) || config.maxOperations < 1 || config.maxOperations > 100 || new Set(config.productIds).size !== config.productIds.length) { $('production-policy-hint').textContent = '每批操作数须为 1–100 的整数，产品 ID 不可重复。'; return; }
  const scope = viewGuard.begin('production-policy'); productionPolicyPending = true; operationControls();
  try {
    const data = await operationMutation('/api/operations/production-policy', { config }, scope); renderProductionPolicy(data);
    operationSelections.clear(); invalidateOperationPlan();
    if (operationsData?.view) { operationsData = { ...operationsData, view: { ...operationsData.view, productionPolicy: data.config, productionRecommendations: [] } }; operationsViewKey = JSON.stringify(operationsData.view); }
    renderOperationCandidates(); renderOperationSelection(); $('production-policy-hint').textContent = '本账号策略已保存。请重新探测；未启动生产或创建游戏写授权。';
  } catch (error) { if (viewGuard.current(scope)) $('production-policy-hint').textContent = '保存失败：' + error.message; }
  finally { if (viewGuard.current(scope)) { productionPolicyPending = false; operationControls(); } }
};
$('production-select-recommended').onclick = () => {
  if ($('production-select-recommended').disabled) return;
  const recommended = new Set(operationsData.view.productionRecommendations || []);
  for (const row of operationRows()) if (row.actionType === 'startProduce') operationSelections.delete(row.actionId);
  for (const row of operationRows()) if (row.actionType === 'startProduce' && row.executable !== false && recommended.has(row.actionId)) operationSelections.add(row.actionId);
  invalidateOperationPlan(); renderOperationCandidates(); renderOperationSelection(); $('ops-hint').textContent = '已选择本次推荐的具体生产操作，尚未授权；请生成批次预览。';
};
function renderOperationHistory(data) {
  const box = clear($('ops-history')), report = clear($('ops-production-report'));
  const runs = data.runs || [];
  for (const run of runs) {
    const card = el('details', 'order-preview-card'); card.appendChild(el('summary', null, (run.runId || '?') + ' · ' + run.module + ' · ' + run.mode + ' · ' + run.finalStatus + (run.recovered ? ' · 进程恢复记录' : '')));
    card.appendChild(el('div', 'dim', '开始 ' + when(run.startedAt) + ' · 结束 ' + (run.finishedAt ? when(run.finishedAt) : '未完成') + ' · 停止原因 ' + (run.stopReason || '无')));
    card.appendChild(el('div', null, '授权范围：' + JSON.stringify(run.authorizationSummary ?? null)));
    card.appendChild(el('div', null, '本批次预算：' + operationCosts(run.resourceBudget)));
    for (const action of run.actions || []) {
      const actionBox = el('details', 'order-preview-card'); actionBox.appendChild(el('summary', null, action.actionType + ' · ' + operationTarget(action.target) + ' · ' + (typeof action.result === 'string' ? action.result : action.result?.status || action.requestStatus || '未知')));
      actionBox.appendChild(el('pre', null, JSON.stringify({ actionId: action.actionId, beforeState: action.beforeState, resourceReservation: action.resourceReservation, receivedReward: action.receivedReward??null, rewardEvidence: action.rewardEvidence??null, requestStatus: action.requestStatus, stages: action.stages ?? null, dispatchEvidence: action.dispatchEvidence ?? null, reconciliations: action.reconciliations ?? [], afterState: action.afterState, result: action.result, verification: action.verification, timestamp: action.timestamp, reason: action.reason }, null, 2))); card.appendChild(actionBox);

      const pending = action.unresolvedWrite === true || ['DISPATCHING','EXECUTING','VERIFY','UNKNOWN'].includes(action.requestStatus) || action.result === 'UNKNOWN';
      const latest = action.reconciliations?.at(-1);
      if (pending && (!latest || latest.status === 'STILL_UNKNOWN')) {
        const previewButton = el('button', null, '只读复核预览'), resultBox = el('pre'), confirmButton = el('button', null, '确认追加复核证据');
        confirmButton.hidden = true; let preview = null;
        previewButton.onclick = async () => {
          const scope = viewGuard.begin('operations-recovery'); previewButton.disabled = true; confirmButton.hidden = true;
          try {
            preview = await operationMutation('/api/operations/recovery/preview', { runId: run.runId, actionId: action.actionId }, scope);
            viewGuard.assert(scope); resultBox.textContent = JSON.stringify(preview.result, null, 2);
            confirmButton.hidden = false; confirmButton.disabled = false;
            confirmButton.textContent = preview.result.status === 'STILL_UNKNOWN' ? '保留未决并记录复核证据' : '确认追加复核证据';
          } catch (error) { if (viewGuard.current(scope)) resultBox.textContent = error.message; }
          finally { if (viewGuard.current(scope)) previewButton.disabled = false; }
        };
        confirmButton.onclick = async () => {
          if (!preview) return;
          const scope = viewGuard.begin('operations-recovery'); confirmButton.disabled = true; previewButton.disabled = true;
          try {
            const result = await operationMutation('/api/operations/recovery/confirm', { previewId: preview.previewId, previewHash: preview.previewHash, confirm: true }, scope);
            viewGuard.assert(scope); invalidateOperationPlan();
            if (operationsData?.accountId === scope.account) renderOperations({ ...operationsData, status: result.status });
            await refreshOperationHistory();
          } catch (error) { if (viewGuard.current(scope)) { resultBox.textContent = error.message; preview = null; confirmButton.hidden = true; } }
          finally { if (viewGuard.current(scope)) previewButton.disabled = false; }
        };
        actionBox.appendChild(previewButton); actionBox.appendChild(resultBox); actionBox.appendChild(confirmButton);
      }
    }
    box.appendChild(card);
  }
  if (!box.childElementCount) box.textContent = '本账号尚无持久执行记录。';
  const daily = data.dailyReport;
  if (daily?.coverage === 'tool-verified-only') {
    report.appendChild(el('div', 'dim', '本工具验证收取记录 · ' + (daily.date || '当日') + ' · ' + (daily.timeZone || '服务器时区') + ' · 游戏完整产量未知。'));
    report.appendChild(el('div', null, '已确认开始生产操作：' + (daily.startedOperations ?? 0) + ' 次；已确认收取操作：' + (daily.collectedOperations ?? 0) + ' 次。'));
    report.appendChild(table(['已验证收取材料', '可靠数量'], (daily.collected || []).map((item) => [item.id, item.num])));
    if (!daily.collected?.length) report.appendChild(el('div', 'dim', '尚无可靠收取数量；操作次数不作为材料产量。'));
    for (const note of daily.notes || []) report.appendChild(el('div', 'dim', typeof note === 'string' ? note : JSON.stringify(note)));
  } else report.textContent = '尚未提供当日本工具已复核汇总；游戏完整产量未知。';
}
async function refreshOperationHistory() {
  if (!current) return;
  const scope = viewGuard.begin('operations-history'); $('ops-history-hint').textContent = '正在读取本地持久历史 ...';
  try { const data = await call('/api/operations/history', undefined, scope); if (data.accountId !== scope.account) throw new Error('历史账号不匹配'); renderOperationHistory(data); $('ops-history-hint').textContent = ''; }
  catch (error) { if (viewGuard.current(scope)) { clear($('ops-history')); $('ops-production-report').textContent = '历史读取失败，无法汇总本工具验证收取记录。'; $('ops-history-hint').textContent = '读取失败：' + error.message; } }
}
$('ops-history-load').onclick = refreshOperationHistory;

function resetOperationMemory() {
  $('ops-memory').textContent = '尚未读取执行记忆。';
  $('ops-memory-coverage').textContent = '尚未读取覆盖范围。';
  clear($('ops-memory-pending')); $('ops-memory-hint').textContent = '';
}
function renderOperationMemory(data) {
  if(typeof data.available!=='boolean'||!Array.isArray(data.events)||!Array.isArray(data.pendingHistoryProjection)||data.resumable!==false||data.retryAllowed!==false)throw new Error('执行记忆只读合同不可靠');
  const box=clear($('ops-memory')),coverage=clear($('ops-memory-coverage')),pending=clear($('ops-memory-pending'));
  const policy=data.policyCoverage||{};
  coverage.appendChild(el('div',null,(data.available===true?'补充记忆可用':'补充记忆不可用')+' · 覆盖范围 '+(data.coverage||'UNKNOWN')));
  coverage.appendChild(el('div',null,'拒绝身份变化策略：'+(policy.identityChange===true?'已接入':'未覆盖')+'；冷却策略：'+(policy.cooldown===true?'已接入':'未覆盖')+'；游戏日界策略：'+(policy.gameDay===true?'已接入':'未覆盖')+'。未覆盖的冷却或日界不能据此解除限制。'));
  coverage.appendChild(el('div','dim',data.note||'只读审计；不恢复执行、预算或授权。'));
  const projections=Array.isArray(data.pendingHistoryProjection)?data.pendingHistoryProjection:[];
  pending.appendChild(el('div',projections.length?'warn':'dim','原始历史待投影结果：'+projections.length+'；本次 GET 只读取，不补写记忆。'));
  if(projections.length)pending.appendChild(el('pre',null,JSON.stringify(projections,null,2)));
  for(const event of Array.isArray(data.events)?data.events:[]) {
    const origin=event.historyOrigin||{},unknown=event.status==='UNKNOWN';
    const card=el('details','order-preview-card');
    card.appendChild(el('summary',null,(event.module||'?')+' · '+(event.actionType||'?')+' · 原始结果 '+(event.status||'UNKNOWN')+' · '+(event.eventId||'?')));
    if(unknown)card.appendChild(el('div','warn','原始 UNKNOWN 审计保留不变。当前原始历史复核：'+(origin.status||'ORIGIN_UNAVAILABLE')+' · '+(origin.resolved===true?'已追加权威复核证据；不重用旧授权或自动重试。':'仍未解除；禁止以本记忆重试。')));
    else card.appendChild(el('div','dim','确定拒绝记录；当前限制由新鲜权威身份及既有执行保护判断，本记录不授予重试。'));
    card.appendChild(el('pre',null,JSON.stringify({operationRunId:origin.operationRunId??event.runId??null,workflowRunId:origin.workflowRunId??event.workflowId??null,workflowDefinitionId:origin.workflowDefinitionId??null,nodeId:origin.nodeId??event.nodeId??null,batchId:event.batchId??null,actionId:event.actionId??null,capabilityId:event.capabilityId??null},null,2)));
    card.appendChild(el('pre',null,JSON.stringify({eventId:event.eventId,status:event.status,dispatched:event.dispatched,unresolvedWrite:event.unresolvedWrite,targetDigest:event.targetDigest,identityDigest:event.identityDigest,source:event.source,generation:event.generation,recordedAt:event.recordedAt,reason:event.reason,policy:event.policy,timeGate:event.timeGate,historyOrigin:event.historyOrigin},null,2)));
    box.appendChild(card);
  }
  if(!box.childElementCount)box.textContent=data.available===true?'本账号尚无补充执行记忆。':'当前存储未提供补充执行记忆；原始执行历史仍是复核依据。';
}
async function refreshOperationMemory() {
  if(!current)return;
  const scope=viewGuard.begin('operations-memory');
  clear($('ops-memory'));clear($('ops-memory-coverage'));clear($('ops-memory-pending'));
  $('ops-memory-hint').textContent='正在读取本账号只读执行记忆 ...';
  try {
    const data=await call('/api/operations/memory',undefined,scope);
    if(data.accountId!==scope.account)throw new Error('执行记忆账号不匹配');
    renderOperationMemory(data);$('ops-memory-hint').textContent='';
  } catch(error) {
    if(viewGuard.current(scope)) {clear($('ops-memory'));clear($('ops-memory-coverage'));clear($('ops-memory-pending'));$('ops-memory-hint').textContent='读取失败：'+error.message;}
  }
}
$('ops-memory-load').onclick=refreshOperationMemory;

// Stage mutations have their own narrow authorization path; READ_POSTS stays read-only.
function stageReason(value) {
  if (typeof value === 'string') return value;
  return value?.message || value?.code || '';
}
function resetStages() {
  stagesData = null; stagesActionPending = false;
  $('stages-enabled').checked = false; $('stages-stop-on-defeat').checked = false;
  $('stages-formation-enabled').checked=false; $('stages-formation-preset').value='';
  $('stages-retry-delay').value = '10';
  $('stages-max-attempts').value = ''; $('stages-max-stage').value = '';
  $('stages-start').disabled = true; $('stages-stop').disabled = true;
  for (const id of ['stages-enabled', 'stages-stop-on-defeat', 'stages-retry-delay', 'stages-max-attempts', 'stages-max-stage', 'stages-formation-enabled', 'stages-formation-preset']) $(id).disabled = false;
  $('stages-availability').textContent = '尚未读取运行条件。';
  $('stages-hint').textContent = '';
  $('stages-status').textContent = '选择账号后读取已有运行状态。';
  $('stages-countdown').textContent = ''; $('stages-history').textContent = '尚无记录。';
  $('stages-delay-policy').textContent = '';
}
function stageConfig() {
  const integer = (id, optional = false) => {
    const value = $(id).value.trim();
    if (optional && !value) return null;
    const number = Number(value);
    if (!value || !Number.isSafeInteger(number) || number < (optional ? 1 : 0)) throw new Error('关卡与尝试次数应为正整数，重试间隔应为非负整数。');
    return number;
  };
  const config = { enabled: $('stages-enabled').checked === true, stopOnDefeat: $('stages-stop-on-defeat').checked === true, retryDelaySeconds: integer('stages-retry-delay'), maxAttempts: integer('stages-max-attempts', true), maxStage: integer('stages-max-stage', true) };
  const delay = stagesData?.runner?.config?.interStageDelay || stagesData?.defaults?.interStageDelay;
  if (delay) config.interStageDelay = { minSeconds: delay.minSeconds, maxSeconds: delay.maxSeconds };
  if ($('stages-formation-enabled').checked) config.formation={enabled:true,presetId:integer('stages-formation-preset')};
  return config;
}
function stageControls() {
  const runner = stagesData?.runner || {};
  const busy = stagesActionPending || runner.running === true || runner.inFlight === true || operationsLocked();
  $('stages-start').disabled = !current || !stagesData?.available || !snapshot.connected || !snapshot.state || snapshot.state !== 'READY' || busy || runner.uncertain === true || $('stages-enabled').checked !== true;
  $('stages-stop').disabled = !current || stagesActionPending || runner.running !== true;
  for (const id of ['stages-enabled', 'stages-stop-on-defeat', 'stages-retry-delay', 'stages-max-attempts', 'stages-max-stage', 'stages-formation-enabled', 'stages-formation-preset']) $(id).disabled = busy;
}
function updateStageCountdown() {
  const runner = stagesData?.runner;
  const waitingNext = runner?.state === 'WAIT_NEXT_STAGE';
  const value = waitingNext ? runner.nextStageAt : runner?.retryAt;
  const timestamp = typeof value === 'number' ? value : Date.parse(value || '');
  $('stages-countdown').textContent = (waitingNext || runner?.state === 'WAIT_RETRY') && Number.isFinite(timestamp)
    ? (waitingNext ? '下一关：约 ' : '下一次重试：约 ') + Math.max(0, Math.ceil((timestamp - Date.now()) / 1000)) + ' 秒（每 3 秒更新状态）'
    : '';
}
function renderStages(data) {
  const initial = stagesData === null;
  stagesData = data;
  const runner = data.runner || {};
  if (initial) {
    const config = runner.config || data.defaults || { enabled: false, retryDelaySeconds: 10 };
    $('stages-enabled').checked = config.enabled === true; $('stages-stop-on-defeat').checked = config.stopOnDefeat === true;
    $('stages-formation-enabled').checked=config.formation?.enabled===true; $('stages-formation-preset').value=config.formation?.presetId==null?'':String(config.formation.presetId);
    $('stages-retry-delay').value = String(config.retryDelaySeconds ?? 10);
    $('stages-max-attempts').value = config.maxAttempts == null ? '' : String(config.maxAttempts);
    $('stages-max-stage').value = config.maxStage == null ? '' : String(config.maxStage);
  }
  const reason = stageReason(data.unavailableReason);
  $('stages-availability').textContent = data.available === true ? '主线开战能力可用；点击开始仍需明确授权。' : '开战已阻断：' + (reason || '玩家阵营对应关系尚未可靠核实（SIDE_UNVERIFIED），不会发出开战请求。');
  const delay = runner.config?.interStageDelay || data.defaults?.interStageDelay;
  $('stages-delay-policy').textContent = delay ? '胜利后进入下一关：随机等待 ' + delay.minSeconds + '–' + delay.maxSeconds + ' 秒；首次挑战不等待，战败重试使用独立间隔。' : '';
  const labels = { IDLE: '未运行', STARTING: '启动中', WAITING_RESULT: '战斗中，等待服务器结果', SUCCESS: '战斗胜利', FAILED: '战斗失败', NEXT_STAGE: '准备下一关', WAIT_NEXT_STAGE: '战斗胜利，等待下一关', WAIT_RETRY: '战斗失败，等待重试', ERROR: '异常停止', STOPPED: runner.error?.code === 'RATE_LIMITED' ? '服务器限频，已停止（RATE_LIMITED）' : runner.stopKind === 'USER' ? '用户主动停止' : runner.stopKind === 'DEFEAT_STOPPED' ? '首次战败，已停止' : runner.stopKind === 'ERROR' || runner.error ? '异常停止' : '正常完成' };
  const result = runner.lastResult;
  const resultText = result == null ? '尚无结果' : typeof result === 'string' ? result : result.won === true || result.win === true || result.result === 'WIN' || result.outcome === 'SUCCESS' ? '战斗胜利' : result.won === false || result.win === false || result.result === 'LOSS' || result.outcome === 'FAILED' ? '战斗失败' : '结果未知，不能作为战败重试';
  const box = clear($('stages-status'));
  for (const [name, value] of [
    ['当前状态', labels[runner.state] || runner.state || '未运行'], ['当前关卡（本地预期）', runner.currentStage ?? '未知'], ['下一关（本地预期）', runner.nextStage ?? '-'],
    ['本次运行', runner.runId ?? '-'], ['当前关卡战斗结果', resultText], ['已挑战次数', runner.attempts ?? 0], ['连续失败次数', runner.consecutiveFailures ?? 0],
    ['停止原因', stageReason(runner.stopReason) || stageReason(runner.error) || '-'], ['未决开战', runner.inFlight ? '仍在等待旧请求结束，禁止新开战' : runner.uncertain ? '结果不确定，禁止再次开战' : '无'],
    ['错误分类', runner.error?.code || '-'], ['错误时间', runner.error?.at ? when(runner.error.at) : '-'],
  ]) { box.appendChild(el('div', 'k', name)); box.appendChild(el('div', 'v', String(value))); }
  if (runner.battleAnalysis) { const detail=el('details'), title=el('summary',null,'本场战斗分析与推荐（仅BT_MAINLINE）'); detail.appendChild(title); detail.appendChild(el('pre',null,JSON.stringify(runner.battleAnalysis,null,2))); box.appendChild(detail); }
  const history = clear($('stages-history'));
  for (const entry of runner.history || []) {
    const row = el('div', 'acct');
    const outcome = entry.won === true || entry.win === true || entry.result === 'WIN' || entry.outcome === 'SUCCESS' ? '胜利' : entry.won === false || entry.win === false || entry.result === 'LOSS' || entry.outcome === 'FAILED' ? '战败' : entry.outcome === 'ERROR' ? '异常' : entry.result || entry.state || '未知';
    row.appendChild(el('div', null, '第 ' + (entry.attempt ?? entry.attempts ?? '?') + ' 次 · 关卡 ' + (entry.stage ?? '?') + ' · ' + outcome));
    if (typeof entry.interStageDelayMs === 'number') row.appendChild(el('div', 'dim', '本次下一关随机等待：' + entry.interStageDelayMs / 1000 + ' 秒'));
    const message = stageReason(entry.error) || stageReason(entry.reason);
    if (message) row.appendChild(el('div', 'warn', message));
    if (entry.at || entry.t) row.appendChild(el('div', 'dim', when(entry.at ?? entry.t)));
    history.appendChild(row);
  }
  if (!history.childElementCount) history.textContent = '尚无记录。';
  updateStageCountdown(); stageControls(); renderAccountSelect();
}
async function refreshStages() {
  if (!current || stagesActionPending) return;
  const scope = viewGuard.begin('stages');
  try {
    const data = await call('/api/stages', undefined, scope);
    viewGuard.assert(scope);
    if (data.accountId !== scope.account) throw new Error('闯关状态账号不匹配');
    renderStages(data); $('stages-hint').textContent = '';
  } catch (error) {
    if (viewGuard.current(scope)) {
      if (stagesData) renderStages({ ...stagesData, available: false, unavailableReason: '当前运行状态读取失败，以下为上次缓存状态；禁止启动新任务。' });
      $('stages-hint').textContent = '读取失败：' + error.message; stageControls();
    }
  }
}
async function stageMutation(path, payload, scope) {
  viewGuard.assert(scope);
  if (!scope.account) throw new Error('请先选择账号');
  if (path !== '/api/stages/start' && path !== '/api/stages/stop') throw new Error('未开放此闯关操作');
  if (path === '/api/stages/start' && payload.confirm !== true) throw new Error('开战需要明确授权');
  if (stagesData?.accountId !== scope.account || !stagesData?.csrfToken) throw new Error('请先重新读取当前账号闯关授权上下文');
  const url = new URL(path, location.href); url.searchParams.set('account', scope.account);
  const response = await fetch(url.pathname + url.search, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cw-csrf': stagesData.csrfToken }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  viewGuard.assert(scope);
  if (!response.ok) throw new Error(data.error || response.statusText);
  if (data.accountId !== scope.account) throw new Error('闯关状态账号不匹配');
  return data;
}
$('stages-load').onclick = refreshStages;
$('stages-enabled').onchange = stageControls;
$('stages-stop-on-defeat').onchange = stageControls;
$('stages-start').onclick = async () => {
  if ($('stages-start').disabled || stagesActionPending) return;
  let config;
  try { config = stageConfig(); } catch (error) { $('stages-hint').textContent = error.message; return; }
  if (!config.enabled || !stagesData?.available) return;
  if (!window.confirm('为当前账号启动自动主线闯关？这会实际开战并改变游戏进度。'+(config.stopOnDefeat?'首次明确战败后停止；':'仅明确战败才按配置等待重试；')+'异常立即停止。')) return;
  const scope = viewGuard.begin('stages'); stagesActionPending = true; stageControls();
  $('stages-hint').textContent = '正在授权启动自动闯关 ...';
  try { renderStages(await stageMutation('/api/stages/start', { config, confirm: true }, scope)); $('stages-hint').textContent = '已提交本次开战授权。'; }
  catch (error) { if (viewGuard.current(scope)) $('stages-hint').textContent = '启动失败：' + error.message; }
  finally { if (viewGuard.current(scope)) { stagesActionPending = false; stageControls(); } }
};
$('stages-stop').onclick = async () => {
  if ($('stages-stop').disabled || stagesActionPending) return;
  const scope = viewGuard.begin('stages'); stagesActionPending = true; stageControls();
  $('stages-hint').textContent = '正在停止后续挑战；已发出的战斗无法撤销 ...';
  try { renderStages(await stageMutation('/api/stages/stop', {}, scope)); $('stages-hint').textContent = '已停止后续挑战；未决请求结束前不会允许重启。'; }
  catch (error) { if (viewGuard.current(scope)) $('stages-hint').textContent = '停止失败：' + error.message; }
  finally { if (viewGuard.current(scope)) { stagesActionPending = false; stageControls(); } }
};

function resetExplorer() {
  explorerData = null; explorerScope = null; explorerRequest = null;
  $('explorer-copy').disabled = true; $('explorer-export').disabled = true;
  $('explorer-copy-text').value = ''; $('explorer-copy-text').hidden = true;
  for (const id of ['explorer-list', 'explorer-meta', 'explorer-source', 'explorer-error', 'explorer-hint']) clear($(id));
  $('explorer-title').textContent = '选择一项查询';
  $('explorer-raw').textContent = '尚未读取'; $('explorer-parsed').textContent = '尚未读取';
  $('explorer-summary').textContent = '选择账号后读取已有快照。';
  clear($('explorer-domain')).appendChild(new Option('全部业务域', ''));
  $('explorer-domain').value = ''; $('explorer-search').value = '';
}
function explorerEntries() {
  if (!explorerData || !viewGuard.current(explorerScope)) return [];
  const domain = $('explorer-domain').value;
  const search = $('explorer-search').value.trim().toLowerCase();
  return explorerData.entries.filter((entry) => (!domain || (entry.domains || [entry.domain]).includes(domain))
    && (!search || [entry.name, entry.request, entry.response].some((value) => String(value || '').toLowerCase().includes(search))));
}
function explorerJson(value) {
  return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item, 2);
}
function renderExplorerDetail(entry) {
  $('explorer-title').textContent = entry ? entry.name : '没有匹配的查询';
  for (const id of ['explorer-meta', 'explorer-source', 'explorer-error', 'explorer-raw', 'explorer-parsed']) clear($(id));
  if (!entry) return;
  const labels = { SUCCESS: '成功', FAILED: '失败', NOT_EXECUTED: '未执行' };
  $('explorer-meta').textContent = entry.request + ' → ' + entry.response + ' · ' + entry.status + '（' + (labels[entry.status] || '未知') + '）'
    + ' · 采集时间：' + (when(entry.updatedAt) || '尚未采集') + (entry.startedAt ? ' · 开始：' + when(entry.startedAt) : '');
  $('explorer-source').textContent = '数据来源：账号缓存 Snapshot'
    + (entry.rawSource ? ' · 原始来源：' + entry.rawSource : '') + (entry.precisionNote ? ' · ' + entry.precisionNote : '')
    + (entry.parserSource ? ' · 解析来源：' + entry.parserSource + (entry.parsedFields?.length ? ' · ' + entry.parsedFields.join(', ') : '') : ' · 仅原始响应，无专门解析视图');
  $('explorer-error').textContent = [entry.error ? '原因：' + entry.error : '', entry.parseError ? '解析错误：' + entry.parseError : ''].filter(Boolean).join(' · ');
  if (entry.status !== 'SUCCESS') {
    $('explorer-raw').textContent = entry.status === 'FAILED' ? '查询失败，原始数据不可用。' : '查询未执行，原始数据不可用。';
    $('explorer-parsed').textContent = '没有本次成功查询的解析结果。';
    return;
  }
  $('explorer-raw').textContent = entry.raw == null ? '本次成功响应未提供内容。' : explorerJson(entry.raw);
  $('explorer-parsed').textContent = entry.parseError ? '业务解析失败：' + entry.parseError : entry.hasParsedView
    ? (entry.parsed == null ? '本次响应没有可显示的已有解析结果。' : explorerJson(entry.parsed))
    : '仅展示原始响应；尚无专门解析视图。';
}
function renderExplorerList() {
  const box = clear($('explorer-list'));
  const entries = explorerEntries();
  if (!entries.some((entry) => entry.request === explorerRequest)) explorerRequest = entries[0]?.request || null;
  for (const entry of entries) {
    const button = el('button', 'explorer-query' + (entry.request === explorerRequest ? ' on' : ''));
    button.appendChild(el('span', null, entry.name + ' · ' + entry.status));
    button.appendChild(el('span', 'protocol', entry.request));
    button.onclick = () => { if (!viewGuard.current(explorerScope)) return; explorerRequest = entry.request; renderExplorerList(); };
    box.appendChild(button);
  }
  if (!entries.length) box.appendChild(el('span', 'dim', '没有匹配的查询'));
  renderExplorerDetail(entries.find((entry) => entry.request === explorerRequest));
  if (explorerData) {
    const counts = { SUCCESS: 0, FAILED: 0, NOT_EXECUTED: 0 };
    for (const entry of entries) if (entry.status in counts) counts[entry.status] += 1;
    $('explorer-summary').textContent = '显示 ' + entries.length + ' / ' + explorerData.total + ' 项查询 · 成功 ' + counts.SUCCESS + ' · 失败 ' + counts.FAILED + ' · 未执行 ' + counts.NOT_EXECUTED
      + ' · 快照时间：' + (when(explorerData.updatedAt) || '尚未采集') + (explorerData.stale ? '（缓存已过期）' : '')
      + ' · 复制和导出包含当前筛选的全部查询';
  }
}
async function refreshExplorer() {
  const scope = viewGuard.begin('explorer');
  resetExplorer();
  $('explorer-hint').textContent = '正在读取账号已有快照 ...';
  try {
    const data = await call('/api/data-explorer', undefined, scope);
    viewGuard.assert(scope);
    if (data.accountId !== scope.account) throw new Error('数据账号不匹配，已忽略响应');
    explorerData = data; explorerScope = scope;
    const select = clear($('explorer-domain'));
    select.appendChild(new Option('全部业务域', ''));
    for (const domain of data.domains) select.appendChild(new Option(domain.label + '（' + domain.count + '）', domain.id));
    select.value = '';
    $('explorer-copy').disabled = false; $('explorer-export').disabled = false;
    $('explorer-hint').textContent = '';
    renderExplorerList();
  } catch (error) {
    if (viewGuard.current(scope)) {
      resetExplorer(); $('explorer-hint').textContent = '读取失败：' + error.message;
    }
  }
}
function explorerExportText() {
  viewGuard.assert(explorerScope);
  if (!explorerData || explorerData.accountId !== current) throw new Error('请先读取当前账号的快照');
  return explorerJson({ accountId: explorerData.accountId, updatedAt: explorerData.updatedAt, stale: explorerData.stale,
    domains: explorerData.domains, total: explorerData.total, filter: { domain: $('explorer-domain').value, search: $('explorer-search').value.trim() }, entries: explorerEntries() });
}
$('explorer-load').onclick = refreshExplorer;
$('explorer-domain').onchange = renderExplorerList;
$('explorer-search').oninput = renderExplorerList;
$('explorer-copy').onclick = async () => {
  const scope = explorerScope;
  try {
    const text = explorerExportText();
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      viewGuard.assert(scope); $('explorer-hint').textContent = '已复制当前筛选的脱敏 JSON';
    } else {
      const field = $('explorer-copy-text'); field.value = text; field.hidden = false; field.select();
      $('explorer-hint').textContent = '剪贴板不可用，已选中脱敏 JSON，请手动复制。';
    }
  } catch (error) { if (scope && viewGuard.current(scope)) $('explorer-hint').textContent = '复制失败：' + error.message; }
};
$('explorer-export').onclick = () => {
  const scope = explorerScope;
  try {
    const text = explorerExportText();
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = el('a');
    anchor.href = url; anchor.download = 'game-data-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    try { document.body.appendChild(anchor); anchor.click(); }
    finally { anchor.remove(); URL.revokeObjectURL(url); }
    $('explorer-hint').textContent = '已导出当前筛选的脱敏 JSON';
  } catch (error) { if (scope && viewGuard.current(scope)) $('explorer-hint').textContent = '导出失败：' + error.message; }
};
function renderAccounts() {
  const box = clear($('accounts'));
  if (!accounts.length) { box.appendChild(el('div', 'dim', '尚无本地账号记录；账号导入将在下一登录阶段开放。')); return; }
  for (const account of accounts) {
    const card = el('div', 'acct' + (account.id === current ? ' on' : ''));
    const top = el('div', 'top');
    top.appendChild(el('span', 'title', account.title));
    top.appendChild(el('span', 'id', account.id.slice(0, 10) + '…'));
    if (account.id === current) top.appendChild(chip('done', '当前'));
    const role = account.lastSeen || {};
    top.appendChild(el('span', 'id', (role.nickname || '尚未读取角色') + ' lv' + (role.level ?? '?') + ' 区服 ' + (role.worldId ?? '?') + ' 连接状态 ' + (account.status?.state || 'IDLE')));
    const use = el('button', 'tiny', account.id === current ? '已选中' : '切换到它');
    use.disabled = account.id === current; use.onclick = () => switchAccount(account.id);
    const rename = el('button', 'tiny', '改备注');
    rename.onclick = async () => {
      const label = prompt('给这个账号起个名字', account.title);
      if (label == null) return;
      const scope = viewGuard.begin('accounts-edit');
      try {
        await call('/api/accounts/label', { method: 'POST', body: JSON.stringify({ confirm: true, id: account.id, label }) }, scope);
        await loadAccounts(false, scope);
      } catch (error) { if (viewGuard.current(scope)) $('hint').textContent = error.message; }
    };
    const drop = el('button', 'tiny danger', '删除');
    drop.onclick = async () => {
      if (!window.confirm('删掉「' + account.title + '」的本地记录？')) return;
      const scope = viewGuard.begin('accounts-edit');
      try {
        await call('/api/accounts/remove', { method: 'POST', body: JSON.stringify({ confirm: true, id: account.id }) }, scope);
        await loadAccounts(true, scope);
      } catch (error) { if (viewGuard.current(scope)) $('hint').textContent = error.message; }
    };
    top.append(use, rename, drop); card.appendChild(top); box.appendChild(card);
  }
}
$('cred-show').onclick = async () => {
  const scope = viewGuard.begin('credential');
  $('cred-show').disabled = true;
  try {
    const data = await call('/api/accounts/credential', undefined, scope);
    viewGuard.assert(scope);
    const kv = el('div', 'kv');
    for (const [name, value] of [['账号', data.title], ['openId（脱敏）', data.masked?.openId], ['Token（脱敏）', data.masked?.token], ['Sign（脱敏）', data.masked?.sign], ['抓取时间', when(data.capturedAt)]]) {
      kv.appendChild(el('div', 'k', name)); kv.appendChild(el('div', 'v', value || '-'));
    }
    clear($('cred')).appendChild(kv);
  } catch (error) { if (viewGuard.current(scope)) $('hint').textContent = error.message; }
  finally { if (viewGuard.current(scope)) $('cred-show').disabled = false; }
};
$('cred-hide').onclick = () => {
  viewGuard.begin('credential'); $('cred-show').disabled = false;
  clear($('cred')).appendChild(el('span', 'dim', '已收起脱敏信息'));
};
function renderWorlds(data) {
  const box = clear($('worlds'));
  for (const world of data.recentWorlds || []) {
    const role = world.role || {};
    box.appendChild(el('div', 'acct', String(world.worldId) + ' ' + (role.nickname || '') + ' lv' + (role.level ?? '?') + ' 战力' + fmt(role.power)));
  }
  if (!box.childElementCount) box.appendChild(el('div', 'dim', '本次查询未返回区服'));
}
$('load-worlds').onclick = () => readView('worlds', '/api/worlds', renderWorlds, 'worlds-hint');
for (const id of ['loot-run', 'loop-start', 'loop-stop', 'loop-rounds', 'loop-every', 'world-speedup', 'world-reroll', 'tasks-run', 'world-run', 'hero-run', 'dailies-run', 'dailies-paid', 'enter-world', 'world-input', 'cap-start', 'cap-stop']) {
  $(id).disabled = true; $(id).classList.add('mvp-disabled'); $(id).onclick = null;
}
document.querySelectorAll('#tabs button').forEach((button) => {
  button.onclick = () => {
    activeTab = button.dataset.tab;
    document.querySelectorAll('#tabs button').forEach((other) => other.classList.toggle('on', other === button));
    for (const section of document.querySelectorAll('main > section')) section.classList.toggle('hidden', section.id !== 'tab-' + button.dataset.tab);
    gameplayActivate(button.dataset.tab);
    if (button.dataset.tab === 'account') renderAccounts();
    if (button.dataset.tab === 'explorer') refreshExplorer();
    if (button.dataset.tab === 'order-rules' && !orderRulesDraft) loadOrderRules();
    if (button.dataset.tab === 'stages') refreshStages();
    $('operations-batch').classList.toggle('hidden', !OPERATIONS_TABS.has(activeTab));
    if (OPERATIONS_TABS.has(activeTab)) refreshOperations();
    if (activeTab === 'operations-history' || activeTab === 'production') refreshOperationHistory();
    if (activeTab === 'production' && !productionPolicyDirty) refreshProductionPolicy();
  };
});
async function boot() {
  const scope = viewGuard.capture();
  try { await loadAccounts(true, scope); }
  catch (error) { if (viewGuard.current(scope)) $('hint').textContent = error.message; }
}
boot();
setInterval(async () => {
  await refreshOverview();
  await gameplayPoll(activeTab);
  if (activeTab === 'stages' || stagesData?.runner?.running || stagesData?.runner?.inFlight) { updateStageCountdown(); await refreshStages(); }
  if (OPERATIONS_TABS.has(activeTab) || operationsData?.status?.running) await refreshOperations();
}, 3000);
function num(v) {
  if (v == null || typeof v !== 'object') return v;
  return (v.low >>> 0) + (v.high >>> 0) * 4294967296;
}

function fmt(v) {
  const n = num(v);
  if (typeof n !== 'number') return String(n == null ? '-' : n);
  return n.toLocaleString('zh-CN');
}

function when(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { hour12: false });
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function clear(node) {
  node.textContent = '';
  return node;
}

// ---- 图标 ------------------------------------------------------------------
// 图集页整张给到浏览器，靠 CSS 裁。FGUI 里约 15% 的图是转 90 度打包的，
// 这些要把裁好的矩形转回来再摆正，否则显示出来是躺着的。

function iconEl(entry, size, name) {
  const box = el('span', 'ico');
  box.style.width = size + 'px';
  box.style.height = size + 'px';
  if (!entry) {
    box.appendChild(el('span', 'fallback', (name || '?').slice(0, 1)));
    box.title = name || '';
    return box;
  }
  // 显示尺寸就是矩形本身 w×h，转不转都一样。
  const k = size / Math.max(entry.w, entry.h);
  const wrap = el('span', 'ico');
  wrap.style.width = Math.round(entry.w * k) + 'px';
  wrap.style.height = Math.round(entry.h * k) + 'px';
  const inner = el('i', 'atlas');
  // 但旋转打包的贴图在图集里占的是 h 宽、w 高（跟显示尺寸正好差一个 90 度），
  // 所以元素盒子要按 h×w 铺，再整体转回来：占位 [0,w*k]×[0,h*k] 就是显示尺寸。
  inner.style.width = (entry.rotated ? entry.h : entry.w) + 'px';
  inner.style.height = (entry.rotated ? entry.w : entry.h) + 'px';
  inner.style.backgroundImage = 'url(' + entry.url + ')';
  inner.style.backgroundPosition = '-' + entry.x + 'px -' + entry.y + 'px';
  inner.style.transform = entry.rotated
    ? 'translate(0,' + Math.round(entry.h * k) + 'px) rotate(-90deg) scale(' + k + ')'
    : 'scale(' + k + ')';
  inner.title = name || '';
  wrap.appendChild(inner);
  return wrap;
}

// 一项东西：图标 + 名字 + 数量
function cell(entry, size, name, qty) {
  const node = el('div', 'cell');
  node.appendChild(iconEl(entry, size || 34, name));
  const txt = el('div', 'txt');
  txt.appendChild(el('span', 'nm', name || '?'));
  if (qty != null) txt.appendChild(el('span', 'qty', qty));
  node.appendChild(txt);
  return node;
}

function chip(status, text) {
  return el('span', 'chip ' + status, text);
}

function renderWorld(data) {
  $('world-view').textContent = data.text;
  const fbox = clear($('world-factories'));
  // 空位：没盖的（待建）与正在盖的（施工中）。计划器只会建「待建」那些，
  // 施工中的只能等它盖完由竣工步骤收尾，所以两种状态要分开说，不然看不出差在哪。
  const slots = (data.buildings || []).filter((b) => b.level === 0);
  if (slots.length) {
    fbox.appendChild(el('h2', null, '空位'));
    fbox.appendChild(table(['空位', '类型', '状态'], slots.map((b) => [
      { cell: b.icon, text: b.buildingId },
      b.type || '未知类型',
      b.building ? chip('waiting', '施工中') : chip('ready', '待建'),
    ])));
  }
  if (data.factories.length) {
    fbox.appendChild(el('h2', null, '工厂'));
    fbox.appendChild(table(['建筑', '类型', '等级', '队列', '自动生产'], data.factories.map((b) => [
      { cell: b.icon, text: b.buildingId },
      b.type,
      'lv' + b.level,
      b.queue == null ? '未知' : String(b.queue),
      b.auto ? '自动: ' + b.auto : '',
    ])));
  }
  const obox = clear($('world-orders'));
  if (data.orders.length) {
    obox.appendChild(el('h2', null, '居民订单'));
    obox.appendChild(table(['订单', '居民', '需求', '缺口'], data.orders.map((o) => [
      '#' + o.index,
      { cell: null, text: o.workerId + (o.isSpecial ? '（特殊）' : '') },
      { cells: o.requirements },
      o.missing.length === 0 ? chip('done', '材料齐') : { cells: o.missing, prefix: '缺 ' },
    ])));
  }
  if (!data.orders.length) obox.appendChild(el('span', 'dim', '本次查询没有居民订单'));
  const sbox = clear($('world-stock'));
  for (const entry of data.stock) sbox.appendChild(cell(entry.icon, 30, entry.id, fmt(entry.num)));
  if (!sbox.childElementCount) sbox.appendChild(el('span', 'dim', '仓库空'));
  $('world-fields').textContent = data.resFields.text || '';
}

function skillText(levels) {
  const list = levels || [];
  if (!list.length) return '—';
  const raised = list.filter((level) => level > 0);
  return raised.length ? '已升 ' + raised.length + '/' + list.length : '未升级';
}

function renderHeroes(data) {
  $('hero-view').textContent = data.text;
  const box = clear($('hero-table'));
  box.appendChild(table(['英雄', '等级', '星级', { label: '战力', num: true }, '技能'], data.heroes.map((hero) => [
    { cell: hero.head || hero.icon, text: hero.heroId },
    'lv' + hero.level,
    hero.star + ' 星',
    { num: true, text: fmt(hero.power) },
    skillText(hero.skillLevels),
  ])));
}

const DAILY_LABEL = { ready: '可做', paid: '需付费', partial: '部分可做', waiting: '等待中', done: '已完成', blocked: '不可用', error: '出错', unknown: '未知' };

function renderDailyChecklist(data) {
  const view=data.checklist,box=clear($('dailies-table')),known=value=>value??'未知';
  const labels={CLAIMED:'已领',ELIGIBLE:'达到门槛',INCOMPLETE:'未达标',UNKNOWN:'未知'};
  box.appendChild(table(['每日任务','进度','奖励状态','完成途径','配置奖励 / 当前限制'],view.tasks.rows.map(row=>{
    const driver=(data.tasks||[]).find(entry=>entry.task.id===row.taskId);
    return [row.title,known(row.progress)+'/'+known(row.targetProgress),labels[row.status]||'未知',
      driver?(DAILY_LABEL[driver.status]||'未知')+(driver.reason?' · '+driver.reason:''):'前置状态未知',
      (row.configuredReward?'活跃 '+row.configuredReward.activity+' / 经验 '+row.configuredReward.experience:'奖励配置未知')+'；领取合同待核实'];
  })));
  if(!view.tasks.rows.length)box.appendChild(el('div','dim',view.tasks.counts.total===0?'本次缓存的每日任务列表为空':'每日任务列表未知'));
  if(view.tasks.rows.some(row=>row.functionId==='pirate-sweep')){
    const scope=viewGuard.capture(),link=el('button','','打开海面扫荡');link.type='button';
    link.onclick=()=>{if(viewGuard.current(scope))document.querySelector?.('#tabs button[data-tab="pirate-sweep"]')?.click();};box.appendChild(link);
  }
  for(const kind of ['daily','weekly']){
    const activity=view.activity[kind],label=kind==='daily'?'每日宝箱':'每周宝箱';
    box.appendChild(el('h3','',label+' · 活跃 '+known(activity.activity)));
    box.appendChild(table(['档位','门槛','状态','配置奖励'],activity.tiers.map(row=>[
      row.id,known(row.requiredActivity),labels[row.status]||'未知',
      row.configuredRewards?row.configuredRewards.map(r=>r.id+' × '+r.num).join('；'):row.rewardReason==='SEASON_REWARD_AMBIGUOUS'?'季节奖励未确定':'奖励配置未知'
    ])));
    if(!activity.tiers.length)box.appendChild(el('div','dim','档位配置未知'));
  }
  box.appendChild(table(['免费赠礼','状态','说明'],[['每日精选赠礼',labels[view.gift.status]||'未知','仅显示免费赠礼状态；领取合同待核实']]));
  if(view.vip){
    box.appendChild(el('h3','','VIP · 采集等级 '+known(view.vip.vipLevel)));
    box.appendChild(table(['配置包等级','等级条件','配置奖励','每日领取状态'],view.vip.configuredPackages.map(row=>[
      row.level,row.levelConditionMet===null?'未知':row.levelConditionMet?'满足':'未满足',
      row.configuredRewards?row.configuredRewards.map(r=>r.id+' × '+r.num).join('；'):'未知','未知'
    ])));box.appendChild(el('p','dim',view.vip.note));
  }
  const source=view.sources;
  $('dailies-view').textContent=(data.stale?'缓存已过期；':'')+'每日任务来源 '+source.daily.status+' / '+(source.daily.observedAt||'采集时间未知')+'；赠礼来源 '+source.gift.status+' / '+(source.gift.observedAt||'采集时间未知')+String.fromCharCode(10)+view.note;
}
function renderDailies(data) {
  if(data.checklist){renderDailyChecklist(data);return;}
  const box = clear($('dailies-table'));
  box.appendChild(table(['任务', '进度', '状态', '动作 / 原因'], data.tasks.map((entry) => [
    entry.task.title,
    entry.task.progress + '/' + entry.task.targetProgress,
    chip(entry.status, DAILY_LABEL[entry.status] || entry.status),
    entry.status === 'ready' || entry.status === 'paid'
      ? (entry.actions || []).map((a) => a.cost || a.request).join('；') || '直接完成'
      : (entry.reason || ''),
  ])));
  if (data.tasks.some(entry => entry.task.id === 1010 && entry.status === 'blocked' && entry.functionId === 'pirate-sweep')) {
    const scope = viewGuard.capture();
    const link = el('button', '', '打开海面扫荡');
    link.type = 'button';
    link.onclick = () => { if (viewGuard.current(scope)) document.querySelector('#tabs button[data-tab="pirate-sweep"]')?.click(); };
    box.appendChild(link);
  }
  if (data.chestsUnavailable) {
    box.appendChild(el('div', 'warn', '无法判断奖励档位：' + data.chestsUnavailable));
  } else if (data.chests) {
    const line = (label, chest) => {
      const tiers = chest.tiers || [];
      const tail = tiers.length
        ? '第 ' + tiers.map((t2) => t2.id).join(' / ') + ' 档'
        : (chest.nextAt == null ? '这一季的档位都领完了' : '下一档要 ' + chest.nextAt + ' 点活跃');
      return [label, chest.activity + ' 活跃', chip(tiers.length ? 'ready' : 'done', tiers.length ? '可领' : '不欠'), tail];
    };
    box.appendChild(table(['活跃奖励', '活跃度', '状态', '动作 / 原因'], [
      line('每日宝箱', data.chests.daily),
      line('每周宝箱', data.chests.weekly),
    ]));
  }
  if (data.gift) {
    const free = data.gift.freeAvailable;
    box.appendChild(table(['每日礼包', '状态', '动作 / 原因'], [
      ['每日精选赠礼', chip(free ? 'ready' : 'done', free ? '可领' : '已领'),
        free ? '免费礼包可领取（MVP 仅展示）' : '今天那份已经领过了，明天 0 点重置'],
    ]));
  }
  $('dailies-view').textContent = data.text + String.fromCharCode(10) + '钻石 ' + fmt(data.ruby) + '（本工具不主动花钻石）';
}

function putCell(td, spec) {
  if (spec == null) return;
  if (typeof spec !== 'object') {
    td.textContent = spec;
    return;
  }
  if (spec.num) {
    td.className = 'num';
    td.textContent = spec.text;
    return;
  }
  if (spec.chip) {
    td.appendChild(chip(spec.chip, spec.text));
    return;
  }
  if (spec.cell !== undefined || spec.cells) {
    const list = spec.cells || [spec.cell];
    if (spec.prefix) td.appendChild(el('span', 'dim', spec.prefix));
    for (const entry of list) {
      const who = el('span', 'who-cell');
      who.appendChild(iconEl(entry && entry.icon, 26, entry ? entry.id : ''));
      who.appendChild(el('span', null, entry ? entry.id + (entry.num != null ? ' x' + fmt(entry.num) : '') : spec.text));
      td.appendChild(who);
      td.appendChild(document.createTextNode(' '));
    }
    if (!list.length) td.appendChild(el('span', 'dim', '齐'));
    return;
  }
  td.textContent = spec.text || '';
}

function table(headers, rows) {
  const box = el('table');
  const head = el('tr');
  for (const h of headers) {
    const th = el('th', typeof h === 'string' ? null : (h.num ? 'num' : null), typeof h === 'string' ? h : h.label);
    head.appendChild(th);
  }
  box.appendChild(head);
  for (const row of rows) {
    const tr = el('tr');
    for (const spec of row) {
      const td = el('td');
      putCell(td, spec);
      tr.appendChild(td);
    }
    box.appendChild(tr);
  }
  return box;
}

${GAMEPLAY_SCRIPT}
</script>
</body>
</html>`;
