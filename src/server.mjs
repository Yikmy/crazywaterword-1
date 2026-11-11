import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createWriterOwnership } from './writer-ownership.mjs';
import { createOperationService } from './operation-service.mjs';
import { createWorkflowRunner, createWorkflowStore, exampleWorkflows, simulateWorkflow, validateWorkflow } from './workflow.mjs';
import { createExecutionHistory } from './execution-history.mjs';
import { createExecutionMemory } from './execution-memory.mjs';
import { createNamedFormationStore } from './named-formations.mjs';
import { GAMEPLAY_MODULES, registerBusinessFunction } from './function-registry.mjs';
import { createStageFunction } from './stage-function.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { GameClient } from './client.mjs';
import { loadProtocol } from './proto.mjs';
import { PAGE } from './page.mjs';
import { listWorlds, enterWorld, describeRole } from './worlds.mjs';
import { collectState, summarize, formatState, ENTRY_QUERIES } from './game.mjs';
import { exploreSnapshot } from './data-catalog.mjs';
import { getConfig, APPID, RESOURCE } from './config.mjs';
import { defaultOrderRules, validateOrderRules, ORDER_RULE_TYPES, evaluateOrders } from './order-rules.mjs';
import { loadOrderRules, saveOrderRules } from './order-rules-store.mjs';
import { createStageRunner, defaultStageConfig, validateStageConfig, MAINLINE_CHALLENGE, MAINLINE_SIDE_AUTHORIZATION, resolveMainlineChallengeSide } from './stages.mjs';
import { qrSvg } from './vendor/qrcode.mjs';
import { planHeroes, runHeroPlan, formatHeroPlan } from './heroes.mjs';
import { surveyDailies, runDailies, formatSurvey, DAILY_DRIVERS, CHEST_TABLE } from './dailies.mjs';
import { surveyTasks, runTasks, formatTaskPlan } from './tasks.mjs';
import { surveyWorld, planWorld, runWorld, formatWorldPlan, formatFieldReport, loadMapAsset } from './world.mjs';
import { runLoop, formatLoopRound } from './loop.mjs';
import { runAction } from './actions.mjs';
import { loadStore, saveStore, upsertAccount, removeAccount, setActive, pickAccount, describeAccount, DATA_DIR } from './accounts.mjs';
import { startCapture, stopCapture, captureState, DEFAULT_PROXY_PORT } from './capture.mjs';
import { iconIndex, atlasFile, itemIcon, resourceIcon, materialIcon, heroIcon, heroCard, buildingIcon } from './art.mjs';

import { redact, redactText, validateCredentials } from './security.mjs';
const LOG_LIMIT = 400;
// 协议帧不再进界面，但仍然要能事后查。默认只写文件，CW_DEBUG=1 时才同时打到终端。
const TRACE_PATH = path.resolve(import.meta.dirname, '../data/protocol.log');

const STATE_TEXT = {
  IDLE: '未连接',
  CONNECTING: '连接中',
  READY: '已连接',
  FAILED: '连接失败',
  REJECTED: '服务器拒绝登录',
  CLOSED: '连接已断开',
  STOPPED: '已停止',
  EXPIRED: '登录已失效',
};

export function createConsole({ host = '127.0.0.1', port = 17321, protocol: suppliedProtocol = null, clientFactory = (options) => new GameClient(options), collect = collectState, tracePath = TRACE_PATH, stageSideResolver = resolveMainlineChallengeSide, stageClock, writerOwnership = createWriterOwnership(), operationOptions = {} } = {}) {
  const protocol = suppliedProtocol ?? loadProtocol();
  let closed = false;
  let closingPromise = null;
  const globalLog = [];
  const streams = new Set();
  const sessions = new Map();
  const knownSecrets = new Set();

  const logLimit = (list) => {
    while (list.length > LOG_LIMIT) list.shift();
  };

  function emit(session, level, message, extra) {
    const entry = redact({ t: Date.now(), level, message, extra, account: session?.id ?? null }, secrets());
    const list = session ? session.log : globalLog;
    list.push(entry);
    logLimit(list);
    const payload = `data: ${JSON.stringify(entry)}\n\n`;
    for (const res of streams) {
      if (res.account && res.account !== entry.account && entry.account !== null) continue;
      res.write(payload);
    }
    return entry;
  }

  // 协议层细节（帧、序号、字节数、原始 JSON）只落盘，不进运行记录。
  let traceStream = null;
  function trace(session, line) {
    line = redactText(line, secrets());
    const text = `${new Date().toISOString()} [${session.id.slice(0, 8)}] ${line}\n`;
    if (process.env.CW_DEBUG === '1') process.stdout.write(text);
    try {
      if (!traceStream) {
        fs.mkdirSync(path.dirname(tracePath), { recursive: true });
        traceStream = fs.createWriteStream(tracePath, { flags: 'a' });
      }
      traceStream.write(text);
    } catch {
      /* 写不进去就算了，协议日志不是功能 */
    }
  }

  function newSession(id) {
    return {
      id,
      client: null,
      unwire: null,
      player: null,
      state: 'IDLE', generation: 0, abort: new AbortController(),
      connectionPromise: null, collectionPromise: null, loginResponse: null,
      snapshot: null, snapshotAt: null, snapshotStale: false,
      busy: null,
      stageRunner: null, stageClient: null,
      log: [],
      loop: {
        running: false,
        rounds: 0,
        completed: 0,
        everyMs: 60_000,
        stop: { aborted: false },
        history: [],
        error: null,
      },
    };
  }

  function sessionFor(id) {
    if (!sessions.has(id)) sessions.set(id, newSession(id));
    return sessions.get(id);
  }

  function secrets() {
    let accounts = [];
    try { accounts = loadStore().accounts; } catch { /* retain secrets already known if the store is damaged */ }
    for (const account of accounts) {
      for (const value of [account.login?.eworldParams?.token, account.login?.eworldParams?.sign, account.loginFrameHex]) {
        if (typeof value === 'string' && value) knownSecrets.add(value);
      }
    }
    return [...knownSecrets];
  }

  const operationCsrf = randomUUID();
  const stageFunction=createStageFunction({ getSession:(client,player)=>[...sessions.values()].find(session=>session.client===client&&session.player===player),prepareRunner:prepareStageRunner,assertFormationReady:(session,requested)=>operations.assertFormationReady(session,requested,{alreadyLocked:true}) });
  const operations = createOperationService({ protocol, modules:{...GAMEPLAY_MODULES,stage:registerBusinessFunction(stageFunction)}, getConfig: loadConfigSafe, loadRules: loadOrderRules,
    history: createExecutionHistory({ secrets, assertWriter: () => writerOwnership.assertOwned() }), ...(Object.hasOwn(operationOptions,'history')?{}:{memory:createExecutionMemory({secrets,assertWriter:()=>writerOwnership.assertOwned()}),namedFormationsStore:createNamedFormationStore({secrets,assertWriter:()=>writerOwnership.assertOwned()})}), ...operationOptions, assertWriter: () => writerOwnership.assertOwned() });

  const workflowRunners=new Map();
  const workflowStore=createWorkflowStore({file:path.join(DATA_DIR,'workflows.json'),modules:operations.modules,secrets});
  function prepareStageRunner(session) {
    const id=session.id, instance=session.client;
        if (!session.stageRunner || session.stageClient !== instance) {
          const generation = session.generation;
          session.stageClient = instance;
          session.stageRunner = createStageRunner({ client: instance, player: session.player, protocol,
            formationFacts:()=>operations.formationContext(id).facts, formationModuleConfig:()=>operations.formationContext(id).moduleConfig,
            resolvePlayerSide: stageSideResolver, battleMode: MAINLINE_CHALLENGE, clock: stageClock, signal: session.abort.signal,
            isCurrent: () => !closed && sessions.get(id) === session && session.generation === generation && session.client === instance && Boolean(writerOwnership.assertOwned()),
            onUpdate: (status) => {
              if (sessions.get(id) !== session || session.generation !== generation || session.client !== instance) return;
              if (status.lastResult) session.snapshotStale = Boolean(session.snapshot);
              emit(session, 'stages', '自动闯关：' + status.state, { runId: status.runId, stage: status.currentStage, attempts: status.attempts });
            } });
        }
    return session.stageRunner;
  }
  function workflowView(id) { return {accountId:id,csrfToken:operationCsrf,functions:operations.modules?Object.keys(operations.modules):[],graphs:workflowStore.list(id),examples:exampleWorkflows(operations.modules),status:workflowRunners.get(id)?.getStatus()??{status:'IDLE',running:false},history:workflowStore.history(id)}; }
  function workflowRunner(id) {
    if(!workflowRunners.has(id))workflowRunners.set(id,createWorkflowRunner({operations,getSession:accountId=>sessions.get(accountId),modules:operations.modules,
      isCurrent:(session,generation,client)=>!closed&&sessions.get(id)===session&&session.generation===generation&&session.client===client&&session.state==='READY',
      claim:(accountId,runId,options)=>operations.claimWorkflow(sessions.get(accountId),runId,options),
      onUpdate:status=>{ writerOwnership.assertOwned(); workflowStore.record(id,status); }}));
    return workflowRunners.get(id);
  }
  function cancelSession(session, state = 'STOPPED') {
    workflowRunners.get(session.id)?.stop();
    operations.stop(session.id);
    if (state === 'STOPPED' || state === 'IDLE') session.stageRunner?.stop('账号已断开或会话已重置');
    else session.stageRunner?.fail(new Error('账号连接异常：' + state));
    session.generation += 1;
    session.workflowOwner = null;
    session.abort.abort();
    session.loop.stop.aborted = true;
    session.loop.running = false;
    const instance = session.client;
    session.unwire?.();
    session.unwire = null;
    session.client = null;
    session.player = null;
    session.loginResponse = null;
    session.connectionPromise = null;
    session.collectionPromise = null;
    session.busy = null;
    session.snapshotStale = Boolean(session.snapshot);
    session.state = state;
    instance?.stop();
  }

  function activeTask(signal, task) {
    // Observe task even if it synchronously emitted FAILED and aborted the session.
    const observed = Promise.resolve(task);
    if (signal.aborted) return observed.then(() => { throw new Error('账号任务已取消'); }, (error) => { throw error; });
    let cancel;
    const stopped = new Promise((_, reject) => {
      cancel = () => reject(new Error('账号任务已取消'));
      signal.addEventListener('abort', cancel, { once: true });
    });
    return Promise.race([observed, stopped]).finally(() => signal.removeEventListener('abort', cancel));
  }

  function assertCurrent(session, generation, instance) {
    if (closed || sessions.get(session.id) !== session || session.generation !== generation || session.client !== instance) throw new Error('账号任务已取消');
  }

  function wire(session, instance) {
    const current = () => session.client === instance;
    const handlers = [];
    const on = (name, handler) => { handlers.push([name, handler]); instance.on(name, handler); };
    session.unwire = () => { for (const [name, handler] of handlers) instance.off(name, handler); };
    on('state', ({ state, detail }) => {
      if (!current()) return;
      session.state = state;
      if (['FAILED', 'REJECTED', 'CLOSED', 'EXPIRED', 'STOPPED'].includes(state)) cancelSession(session, state);
      emit(session, 'state', STATE_TEXT[state] ?? state, detail ? { detail } : undefined);
    });
    on('frame', ({ dir, name, seq, bytes }) => { if (current()) trace(session, (dir === 'out' ? '->' : '<-') + ' [' + name + '] seq=' + seq + ' ' + bytes.byteLength + 'B'); });
    on('message', ({ seq, name, body }) => { if (current()) trace(session, '[' + name + '] seq=' + seq + ' ' + JSON.stringify(redact(body, secrets())).slice(0, 400)); });
    on('pong', ({ latencyMs, offsetMs }) => { if (current()) trace(session, 'pong ' + latencyMs + 'ms offset=' + offsetMs + 'ms'); });
    on('warn', (message) => { if (current()) emit(session, 'warn', message); });
    on('promptAmbiguous', () => { if (current()) emit(session, 'warn', '收到无法确定请求归属的服务端提示，未匹配到任何请求'); });
    on('fatal', ({ reason }) => { if (current()) emit(session, 'error', '连接失效：' + reason); });
    on('error', (error) => { if (current()) emit(session, 'error', error.message); });
  }
  // 每次连接把服务端给的昵称/等级/区服写回账号文件，账号列表里就能看到人话标记。
  function persistIdentity(account, player) {
    writerOwnership.assertOwned();
    try {
      const store = loadStore();
      const target = store.accounts.find((entry) => entry.id === account.id);
      if (!target) return;
      const role = describeRole(player);
      target.lastSeen = { nickname: role?.nickname ?? null, level: role?.level ?? null, power: role?.power ?? null, worldId: role?.worldId ?? null, at: new Date().toISOString() };
      if (!target.label && role?.nickname) target.label = role.nickname;
      saveStore(store);
    } catch {
      /* 回填失败不影响连接 */
    }
  }

  function connect(session, account) {
    if (closed) return Promise.reject(new Error('控制台已关闭'));
    writerOwnership.assertOwned();
    if (session.connectionPromise) return session.connectionPromise;
    if (session.client?.connected && session.state === 'READY') return Promise.resolve(session.loginResponse);
    validateCredentials(account);
    cancelSession(session, 'IDLE');
    session.abort = new AbortController();
    const generation = session.generation;
    const instance = clientFactory({ url: account.url, protocol, accountId: session.id, generation, assertTransport: () => writerOwnership.assertOwned() });
    session.connectionId = randomUUID();
    instance.factContext = { accountId: session.id, generation, connectionId: session.connectionId };
    for (const method of ['request', 'sendWatch', 'send', 'sendNoSeq']) {
      if (typeof instance[method] !== 'function') continue;
      const original = instance[method].bind(instance);
      instance[method] = (...args) => { writerOwnership.assertOwned(); return original(...args); };
    }
    session.client = instance;
    session.state = 'CONNECTING';
    wire(session, instance);
    const task = Promise.resolve().then(async () => {
      assertCurrent(session, generation, instance);
      writerOwnership.assertOwned();
      const response = await activeTask(session.abort.signal, instance.connect(account.login));
      assertCurrent(session, generation, instance);
      session.player = response.playerInfo || null;
      session.loginResponse = response;
      session.state = 'READY';
      persistIdentity(account, session.player);
      emit(session, 'info', '已进入游戏：' + (describeRole(session.player)?.nickname ?? '未知'));
      return response;
    }).catch((error) => {
      if (session.generation === generation && session.client === instance) cancelSession(session, 'FAILED');
      throw error;
    }).finally(() => { if (session.connectionPromise === task) session.connectionPromise = null; });
    session.connectionPromise = task;
    return task;
  }

  async function ensureConnected(session) {
    if (session.connectionPromise) await session.connectionPromise;
    if (!session.client?.connected || session.state !== 'READY') {
      const error = new Error('账号未连接，请先显式连接');
      error.statusCode = 409;
      throw error;
    }
    return session.client;
  }

  function refresh(session, account) {
    if (operations.running(session.id) || (session.busy?.startsWith('operations:') || session.workflowOwner) || session.stageRunner?.getStatus().running || session.stageRunner?.getStatus().inFlight) {
      const error = new Error('自动闯关或未决战斗期间不能完整采集；已有缓存仍可浏览');
      error.statusCode = 409; return Promise.reject(error);
    }
    if (session.collectionPromise) return session.collectionPromise;
    const generation = session.generation;
    const signal = session.abort.signal;
    const task = Promise.resolve().then(async () => {
      const instance = await ensureConnected(session);
      assertCurrent(session, generation, instance);
      session.busy = '采集只读状态';
      const result = await activeTask(signal, collect(instance, protocol, { timeout: 15000 }));
      assertCurrent(session, generation, instance);
      session.snapshot = result;
      session.snapshotAt = new Date().toISOString();
      session.snapshotStale = false;
      return overview(session, account);
    }).finally(() => {
      if (session.collectionPromise === task) { session.collectionPromise = null; session.busy = null; }
    });
    session.collectionPromise = task;
    return task;
  }
  // 每个请求都带 ?account=<id>；不给就是当前选中的那个账号。
  function resolve(url) {
    const store = loadStore();
    const account = pickAccount(store, url.searchParams.get('account'));
    if (!account) throw new Error('还没有任何账号，先在「账号」页添加一个');
    return { store, account, session: sessionFor(account.id) };
  }

  function accountStatus(session) {
    return {
      connected: Boolean(session.client?.connected),
      state: session.state,
      busy: session.busy,
      looping: session.loop.running,
    };
  }

  function loadConfigSafe() {
    try {
      return getConfig();
    } catch {
      return null;
    }
  }

  // ---- 只读汇总 -------------------------------------------------------------

  function overview(session, account) {
    const state = session.snapshot ?? { ok: {}, failed: {} };
    const { ok, failed } = state;
    const config = loadConfigSafe();
    const view = summarize(state, { config });
    const daily = view.daily;
    return {
      account: describeAccount(account, { active: account.id === loadStore().activeId }),
      status: accountStatus(session),
      player: describeRole(session.player),
      accountId: account.id, updatedAt: session.snapshotAt, snapshotStale: session.snapshotStale,
      dataContext: { generation: session.generation, clock: session.client?.clockDiagnostics?.() ?? null },
      snapshotStatus: !session.snapshot ? 'NOT_COLLECTED' : Object.keys(failed).length ? (Object.keys(ok).length ? 'PARTIAL' : 'FAILED') : 'SUCCESS',
      failed, outcomes: state.outcomes ?? {}, availability: view.availability ?? {},
      resources: (view.resources ?? []).map((entry) => ({ ...entry, icon: resourceIcon(entry.res) })),
      items: {
        ...view.items, kinds: session.snapshot ? view.items?.kinds ?? null : null, total: session.snapshot ? view.items?.total ?? null : null,
        top: (view.items?.top ?? []).map((item) => ({ itemId: item.itemId, num: item.num, icon: itemIcon(item.itemId) })),
      },
      claimable: {
        mainTask: Object.hasOwn(ok, 'MainTaskInfoRequest') ? (view.mainTask ? 1 : 0) : null,
        daily: daily?.claimable ?? null,
        achievement: view.achievements?.claimable ?? null,
        email: view.email?.unclaimed ?? null,
        afk: view.afk ? Math.max((view.afk.level ?? 0) - (view.afk.rewardedLevel ?? 0), 0) : null,
      },
      afk: view.afk,
      heroes: {
        count: session.snapshot ? view.heroes?.count ?? null : null,
        power: session.snapshot ? view.heroes?.power ?? null : null,
        list: (view.heroes?.list ?? []).slice(0, 12).map((hero) => ({ ...hero, icon: heroCard(hero.heroId) ?? heroIcon(hero.heroId) })),
      },
      water: view.water,
      resFields: view.resFields,
      monthCard: view.monthCard,
      unreadable: Object.keys(failed),
      text: session.snapshot ? formatState(view) : '尚未采集；请先连接，再手动刷新',
    };
  }

  function cachedClient(session, dependencies) {
    if (!session.snapshot) throw new Error('尚无快照，请先连接并手动刷新');
    for (const request of dependencies) {
      if (!Object.hasOwn(session.snapshot.ok, request)) throw new Error(request + ' 未获取成功：' + (session.snapshot.failed[request] ?? '未采集'));
    }
    const snapshot = session.snapshot;
    const errors = new Map();
    return { errors, request: async (name, body = {}) => {
      const query = ENTRY_QUERIES.find((entry) => entry.name === name);
      let error = null;
      if (!Object.hasOwn(snapshot.ok, name)) error = name + ' 未获取成功：' + (snapshot.failed[name] ?? '未采集');
      else if (!query || JSON.stringify(body) !== JSON.stringify(query.body ?? {})) error = name + ' 快照请求参数不匹配，未执行新请求';
      if (error) { errors.set(name, error); throw new Error(error); }
      return snapshot.ok[name];
    } };
  }


  // Reuse surveyWorld's order/experience/stock parsing through the cache only.
  function orderSource(snapshot, name) {
    const outcome = snapshot?.outcomes?.[name];
    const body = snapshot?.ok?.[name];
    let status = outcome?.status ?? (Object.hasOwn(snapshot?.failed ?? {}, name) ? 'FAILED' : body ? 'SUCCESS' : 'NOT_EXECUTED');
    const missingBody = !body || typeof body !== 'object' || Array.isArray(body);
    if (status === 'SUCCESS' && missingBody) status = 'FAILED';
    return { status, body, raw: snapshot?.raw?.[name] ?? body,
      error: outcome?.error ?? snapshot?.failed?.[name] ?? (missingBody ? '缓存响应缺失' : null), updatedAt: outcome?.updatedAt ?? null };
  }
  function orderItems(snapshot, config) {
    const options = new Map();
    const resourceRows = config?.tables?.ResourceCfg?.data ?? [];
    const add = (id, source) => {
      if (typeof id !== 'string' || !id.trim()) return;
      const name = resourceRows.find((row) => row.id === id)?.show_name ?? id;
      const previous = options.get(id);
      options.set(id, { id, name, source: previous ? previous.source + '; ' + source : source });
    };
    for (const row of config?.tables?.WorkerOrderCfg?.data ?? []) add(row.itemId, 'WorkerOrderCfg.itemId');
    const items = orderSource(snapshot, 'AllItemRequest').raw?.items;
    for (const row of Array.isArray(items) ? items : []) add(row?.itemId ?? row?.id, 'AllItemResponse.items[].itemId/id');
    const orders = orderSource(snapshot, 'OnWaterRequest').raw?.workerOrder;
    for (const order of Array.isArray(orders) ? orders : []) {
      for (const row of Array.isArray(order?.requirements) ? order.requirements : []) add(row?.id, 'OnWaterResponse.workerOrder[].requirements[].id');
    }
    return [...options.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }
  const itemSourceNote = '规则匹配配置或响应中的原始物品 ID；显示名称不参与匹配。无单独名称定义时显示 ID。';
  function safeQuantity(value) {
    if (typeof value === 'string' && /^\d+$/.test(value) && BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value);
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  async function previewOrderRules(session, policy) {
    const snapshot = session?.snapshot;
    const base = { updatedAt: session?.snapshotAt ?? null, stale: session?.snapshotStale ?? false, itemSourceNote,
      simulationNote: '只读模拟，不会执行游戏操作。各订单独立使用同一库存，未跨订单预留库存。' };
    const water = orderSource(snapshot, 'OnWaterRequest');
    if (water.status !== 'SUCCESS' || !Array.isArray(water.raw?.workerOrder)) {
      return { ...base, status: 'UNKNOWN', error: water.error ?? '没有可用的居民订单缓存或订单字段缺失，请通过原有刷新流程获取快照', orders: [] };
    }
    let survey;
    try {
      // Do not let a failed source's old body enter surveyWorld's combined stock.
      const readable = { ...snapshot, ok: Object.fromEntries(Object.entries(snapshot.ok ?? {}).filter(([name]) => orderSource(snapshot, name).status === 'SUCCESS')), failed: snapshot.failed ?? {} };
      survey = await surveyWorld(cachedClient({ snapshot: readable }, ['OnWaterRequest']), protocol, { config: loadConfigSafe(), player: session?.player });
    } catch {
      return { ...base, status: 'UNKNOWN', error: '已有订单解析无法处理当前缓存，请检查数据探索器中的 OnWaterResponse', orders: [] };
    }
    const inventory = new Map(survey.stock);
    const itemData = orderSource(snapshot, 'AllItemRequest');
    const resourceData = orderSource(snapshot, 'AllResourceRequest');
    let itemsKnown = itemData.status === 'SUCCESS' && Array.isArray(itemData.raw?.items) && Boolean(protocol.AllItemRequest && protocol.AllItemResponse);
    let resourcesKnown = resourceData.status === 'SUCCESS' && Array.isArray(resourceData.raw?.list) && Boolean(protocol.AllResourceRequest && protocol.AllResourceResponse);
    const invalidItems = new Set();
    for (const row of Array.isArray(itemData.raw?.items) ? itemData.raw.items : []) {
      const id = row?.itemId ?? row?.id;
      if (typeof id !== 'string' || !id.trim()) { itemsKnown = false; continue; }
      if (itemData.status !== 'SUCCESS' || safeQuantity(row.num ?? row.count) === null) invalidItems.add(id);
    }
    for (const row of Array.isArray(resourceData.raw?.list) ? resourceData.raw.list : []) {
      if (!Number.isSafeInteger(row?.res)) { resourcesKnown = false; continue; }
      const id = RESOURCE[row.res] ?? String(row.res);
      if (resourceData.status !== 'SUCCESS' || safeQuantity(row.amount) === null) invalidItems.add(id);
    }
    const resources = new Set(Object.values(RESOURCE));
    for (const row of Array.isArray(resourceData.raw?.list) ? resourceData.raw.list : []) {
      if (Number.isSafeInteger(row?.res)) resources.add(RESOURCE[row.res] ?? String(row.res));
    }
    const orders = survey.orders.map((order, index) => {
      const raw = water.raw.workerOrder[index];
      const valid = Array.isArray(raw?.requirements) && raw.requirements.length > 0
        && raw.requirements.every((need) => typeof need?.id === 'string' && need.id.trim() && safeQuantity(need.num) !== null && safeQuantity(need.num) > 0);
      return { ...order, requirements: valid ? order.requirements : null };
    });
    for (const order of orders) {
      for (const need of order.requirements ?? []) {
        if (!(resources.has(need.id) ? resourcesKnown : itemsKnown) || invalidItems.has(need.id)
            || (inventory.has(need.id) && safeQuantity(inventory.get(need.id)) === null)) inventory.set(need.id, null);
      }
    }
    const results = evaluateOrders(orders, inventory, policy);
    return { ...base, status: 'SUCCESS', error: null,
      orders: orders.map((order, index) => {
        const totals = new Map();
        for (const need of order.requirements ?? []) totals.set(need.id, (totals.get(need.id) ?? 0) + need.num);
        return { order, result: results[index], inventoryFacts: [...totals].map(([id, required]) => {
          const available = inventory.has(id) ? inventory.get(id) : 0;
          return { id, required: Number.isSafeInteger(required) ? required : null, available,
            missing: available === null || !Number.isSafeInteger(required) ? null : Math.max(0, required - available) };
        }) };
      }),
    };
  }

  async function tasks(session, account) {
    const instance = cachedClient(session, ["MainTaskInfoRequest","AchievementInfoRequest","OnWaterRequest"]);
    const survey = await surveyTasks(instance, protocol, { config: loadConfigSafe() });
    return { ...survey, text: formatTaskPlan(survey) };
  }

  async function world(session, account) {
    const instance = cachedClient(session, ["OnWaterRequest","AllItemRequest","AllResourceRequest","MyResFieldsRequest","MyFleetsRequest"]);
    const config = loadConfigSafe();
    const survey = await surveyWorld(instance, protocol, { config, player: session.player });
    const plan = planWorld(survey, { config });
    let map = null;
    try {
      map = loadMapAsset(Number(session.player?.scenarioId ?? 0));
    } catch {
      map = null;
    }
    const fields = { ...survey.resFields, text: formatFieldReport(survey, map) };
    return {
      population: `${survey.population}/${survey.maxPopulation}`,
      factories: survey.factories.map((b) => ({ buildingId: b.buildingId, type: b.type, level: b.level, queue: Array.isArray(b.factory.factoryQ) ? b.factory.factoryQ.length : null, auto: b.factory.autoProductId ?? null, icon: buildingIcon(b.type) })),
      orders: survey.orders.map((order) => ({
        ...order,
        requirements: order.requirements.map((need) => ({ ...need, icon: materialIcon(need.id) })),
        missing: (order.missing ?? []).map((need) => ({ ...need, icon: materialIcon(need.id) })),
      })),
      // 建筑全表：level=0 的是空位（正在盖或还没盖），界面靠它解释「为什么没在建造」。
      buildings: survey.buildings.map((b) => ({
        buildingId: b.buildingId, type: b.type ?? null, level: b.level,
        building: b.buildFinishTime > 0 && b.buildFinishTime > Date.now() / 1000,
        icon: buildingIcon(b.type),
      })),
      stock: [...survey.stock].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([id, num_]) => ({ id, num: num_, icon: materialIcon(id) })),
      resFields: fields,
      plan: plan.actions,
      notes: [...survey.notes, ...plan.notes],
      text: formatWorldPlan(survey, plan),
    };
  }

  async function heroes(session, account) {
    const instance = cachedClient(session, ["AllHeroRequest","AllItemRequest"]);
    const heroList = await instance.request('AllHeroRequest', {}, 'AllHeroResponse', 15000);
    const itemList = await instance.request('AllItemRequest', {}, 'AllItemResponse', 15000);
    const counts = new Map();
    for (const item of itemList.items ?? []) {
      const id = item.itemId ?? item.id;
      counts.set(id, (counts.get(id) ?? 0) + Number(item.num ?? item.count ?? 0));
    }
    const config = loadConfigSafe();
    if (!config) throw new Error('没有配置表，算不出英雄养成计划');
    const plan = planHeroes({ config, heroes: heroList.heroes ?? [], itemNum: (id) => counts.get(id) ?? 0, playerLevel: describeRole(session.player)?.level ?? 1 });
    return {
      steps: plan.steps,
      notes: plan.notes,
      maxLevel: plan.maxLevel,
      maxStar: plan.maxStar,
      text: formatHeroPlan(plan),
      heroes: (heroList.heroes ?? []).map((hero) => ({ ...hero, icon: heroCard(hero.heroId), head: heroIcon(hero.heroId) })),
    };
  }

  async function dailies(session, account) {
    const instance = cachedClient(session, ["DailyTaskInfoRequest","AllItemRequest","AllResourceRequest","AfkInfoRequest","RecruitInfoRequest"]);
    const config = loadConfigSafe();
    const survey = await surveyDailies(instance, protocol, { config, player: session.player });
    survey.tasks = survey.tasks.map((entry) => {
      if (entry.status === 'done') return entry;
      const missing = (DAILY_DRIVERS[entry.task.id]?.probes ?? []).map(([name]) => instance.errors.get(name)).filter(Boolean);
      return missing.length ? { task: entry.task, status: 'unknown', reason: missing.join('; '), actions: [] } : entry;
    });
    const chestsUnavailable = Object.values(CHEST_TABLE).some((name) => !config?.tables?.[name]?.data?.length) ? '缺少有效奖励配置，无法判断奖励档位' : null;
    if (chestsUnavailable) survey.chests = null;
    const text = formatSurvey(survey) + (chestsUnavailable ? '\n' + chestsUnavailable : '');
    return { tasks: survey.tasks.map((entry) => ({ ...entry, task: { ...entry.task } })), chests: survey.chests, chestsUnavailable, gift: survey.gift, ruby: survey.ruby, text };
  }

  // ---- 抓包与扫码 -----------------------------------------------------------

  // 二维码只负责把游戏在电脑上拉起来，凭证还是靠本机代理抓。
  // 优先级：用户自己放的 data/qrcode.png → 微信官方的跳转链接画成码 → 页面上只留手动步骤。
  function qrInfo() {
    if (fs.existsSync(path.join(DATA_DIR, 'qrcode.png'))) {
      return { kind: 'image', url: '/api/capture/qrcode', note: '用的是你放在 data/qrcode.png 的小程序码' };
    }
    const scheme = `weixin://dl/business/?appid=${APPID}&env_version=release`;
    const content = `https://servicewechat.com/wxascheme/jump_wxa?url=${encodeURIComponent(scheme)}`;
    const note = '手机扫一下，让微信把游戏在电脑上打开；扫不动就复制链接，或按下面的步骤手动开';
    try {
      return { kind: 'svg', svg: qrSvg(content, { scale: 4 }), content, note };
    } catch (error) {
      return { kind: 'link', content, note: `二维码画不出来（${error.message}），复制链接或按下面的步骤手动开游戏` };
    }
  }

  // 抓到登录包就落库；顺手连一次把昵称/等级/区服回填，账号列表才看得到人话。
  async function addCapturedAccount({ url, body, rawFrameHex }) {
    if (closed) throw new Error('控制台已关闭');
    writerOwnership.assertOwned();
    const credential = { url, login: body, loginFrameHex: rawFrameHex, source: 'mitm', capturedAt: new Date().toISOString() };
    const store = loadStore();
    const { account, created } = upsertAccount(store, credential);
    saveStore(store);
    const title = describeAccount(account).title;
    emit(null, 'info', created ? `新账号已入库：${title}` : `账号凭证已刷新：${title}`);

    const session = sessionFor(account.id);
    try {
      await connect(session, account);
      emit(null, 'info', `${title} 的角色信息已读取（游戏那边会被顶下线一次，重进即可）`);
      session.client?.stop();
      session.client = null;
      session.player = null;
    } catch (error) {
      emit(null, 'warn', `读取角色信息失败，账号本身已经存好了：${error.message}`);
    }
    await stopCapture('已抓到账号');
    return { id: account.id };
  }

  // STEP 4-B1 releases only the evidence-backed mainline adapter. Explicit null still disables it.
  // HTTP/config cannot supply an adapter or authorize another battle mode.
  const stageSideAvailable = typeof stageSideResolver === 'function';
  const stageUnavailableReason = 'SIDE_UNVERIFIED：当前没有已授权的主线阵营适配器；开战已阻止';
  function stageView(id, session) {
    return { accountId: id, available: stageSideAvailable, unavailableReason: stageSideAvailable ? null : stageUnavailableReason,
      csrfToken: operationCsrf, battleMode: MAINLINE_CHALLENGE,
      sideAuthorization: stageSideResolver === resolveMainlineChallengeSide ? MAINLINE_SIDE_AUTHORIZATION : null,
      defaults: { ...defaultStageConfig(), interStageDelay: { minSeconds: 10, maxSeconds: 11 } },
      runner: session?.stageRunner?.getStatus() ?? { runId: null, state: 'IDLE', running: false,
        currentStage: session?.player?.mainlineStage ?? null, nextStage: null, attempts: 0, consecutiveFailures: 0,
        lastResult: null, retryAt: null, nextStageAt: null, history: [], stopReason: null, stopKind: null, error: null,
        uncertain: false, inFlight: false, config: defaultStageConfig() } };
  }
  // ---- 路由 -----------------------------------------------------------------

  async function handle(req, res, body) {
    const parsed = new URL(req.url, 'http://localhost');
    const route = `${req.method} ${parsed.pathname}`;
    const json = (value, code = 200) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(redact(value, secrets())));
    };
    const jsonBody = () => JSON.parse(body || '{}');
    const needConfirm = (payload) => {
      if (payload.confirm !== true) throw new Error('这个操作会改动游戏里的状态，需要先确认');
    };
    let scoped = null;
    // 所有账号相关的路由都先过这里：拿到账号、对应会话，长请求再挂个忙碌标记。
    const scoped_ = (url) => {
      const found = resolve(url);
      scoped = found.session;
      return found;
    };
    try {
      if (closed) { json({ error: '控制台已关闭' }, 503); return; }
      const allowed = new Set([
        'GET /', 'GET /api/art/index', 'GET /api/events', 'GET /api/accounts', 'GET /api/accounts/credential',
        'POST /api/accounts/active', 'POST /api/accounts/label', 'POST /api/accounts/remove',
        'POST /api/connect', 'POST /api/disconnect', 'POST /api/refresh', 'GET /api/overview',
        'GET /api/heroes', 'GET /api/dailies', 'GET /api/tasks', 'GET /api/world', 'GET /api/worlds',
        'GET /api/loop', 'GET /api/snapshot/export', 'GET /api/data-explorer',
        // Local settings/simulation only; game mutation stays blocked.
        'GET /api/order-rules', 'POST /api/order-rules', 'POST /api/order-rules/preview',
      ]);
      // Keep the existing read-only policy intact. Stage start has a separate,
      // explicit mutation gate below; no generic game Action route is opened.
      const stageRoute = route === 'GET /api/stages' || route === 'POST /api/stages/start' || route === 'POST /api/stages/stop';
      const operationRoute = new Set(['POST /api/operations/recovery/preview', 'POST /api/operations/recovery/confirm', 'GET /api/operations', 'GET /api/operations/history', 'GET /api/operations/memory', 'GET /api/operations/production-policy', 'POST /api/operations/production-policy', 'POST /api/operations/survey', 'POST /api/operations/plan', 'POST /api/operations/authorize', 'POST /api/operations/execute', 'POST /api/operations/stop']).has(route);
      const namedFormationRoute=new Set(['GET /api/formations/named','POST /api/formations/named/save','POST /api/formations/named/rename','POST /api/formations/named/overwrite','POST /api/formations/named/delete','POST /api/formations/named/prepare']).has(route);
      const gameplayRoute=new Set(['GET /api/gameplay','POST /api/gameplay/survey','POST /api/gameplay/config','GET /api/workflows','POST /api/workflows/save','POST /api/workflows/simulate','POST /api/workflows/start','POST /api/workflows/resume','POST /api/workflows/stop']).has(route);
      if (!allowed.has(route) && !stageRoute && !operationRoute && !gameplayRoute && !namedFormationRoute && !(req.method === 'GET' && parsed.pathname.startsWith('/api/art/atlas/'))) {
        json({ error: 'STEP 1-A 只读控制台禁止此路由', code: 'READ_ONLY_ROUTE' }, 403);
        return;
      }
      if (req.method === 'POST') writerOwnership.assertOwned();
      if (operationRoute || gameplayRoute || stageRoute || namedFormationRoute) {
        // Separate, narrow PHASE 2 gate. The old Web write allowlist stays unchanged.
        const expectedPort = server.address()?.port;
        const acceptedHosts = new Set([host + ':' + expectedPort]);
        if (host === '127.0.0.1') acceptedHosts.add('localhost:' + expectedPort);
        if (!acceptedHosts.has(req.headers.host) || (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host)
          || req.headers['sec-fetch-site'] === 'cross-site') {
          json({ error: '执行接口仅允许同源请求', code: 'ORIGIN_REQUIRED' }, 403); return;
        }
        const id = parsed.searchParams.get('account');
        if (!id || parsed.searchParams.getAll('account').length !== 1) { json({ error: '必须指定唯一精确账号 ID' }, 400); return; }
        if (!loadStore().accounts.some(account => account.id === id)) { json({ error: '没有这个账号' }, 404); return; }
        if(namedFormationRoute&&(parsed.searchParams.getAll('account').length!==1||[...parsed.searchParams.keys()].some(key=>key!=='account')))throw Object.assign(Error('具名阵容需唯一精确账号且不接受其他查询字段'),{code:'INVALID_INPUT',statusCode:400});
        if(route==='GET /api/formations/named'){json({...operations.namedFormations(id),csrfToken:operationCsrf});return;}
        if (stageRoute && req.method === 'GET') { json(stageView(id, sessions.get(id))); return; }
        if (route === 'GET /api/gameplay') { json({...operations.moduleView(id,parsed.searchParams.get('module')),csrfToken:operationCsrf});return; }
        if (route === 'GET /api/workflows') { json(workflowView(id));return; }
        if (route === 'GET /api/operations') { json({ ...operations.view(id), csrfToken: operationCsrf }); return; }
        if (route === 'GET /api/operations/production-policy') { json(operations.productionPolicy(id)); return; }
        if (route === 'GET /api/operations/memory') { if(parsed.searchParams.getAll('account').length!==1)throw Object.assign(Error('记忆查询需唯一账号'),{code:'INVALID_INPUT',statusCode:400});const filters=Object.create(null);for(const [key,value] of parsed.searchParams){if(key==='account')continue;if(Object.hasOwn(filters,key))throw Object.assign(Error('重复记忆筛选字段'),{code:'INVALID_INPUT',statusCode:400});filters[key]=value;}json(operations.executionMemory(id,filters));return; }
        if (route === 'GET /api/operations/history') { json(operations.history(id, parsed.searchParams.get('runId'))); return; }
        const csrf = req.headers['x-cw-csrf'];
        if (req.headers.origin !== 'http://' + req.headers.host || typeof csrf !== 'string' || Buffer.byteLength(csrf) !== Buffer.byteLength(operationCsrf)
          || !timingSafeEqual(Buffer.from(csrf), Buffer.from(operationCsrf)) || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) {
          json({ error: '缺少当前页面同源执行授权上下文', code: 'CSRF_REQUIRED' }, 403); return;
        }
        if (Buffer.byteLength(body) > 65536) { json({ error: '执行请求过大' }, 413); return; }
        writerOwnership.assertOwned();
        if (stageRoute) { /* Original Runner uses the common Origin/CSRF gate. */ } else {
        const payload = jsonBody();
        const fields = keys => {if(!payload || typeof payload!=='object' || Array.isArray(payload) || Object.keys(payload).some(key=>!keys.includes(key)))throw Object.assign(new Error('玩法请求包含未知字段'),{statusCode:400});};
        if(namedFormationRoute){fields(route.endsWith('/save')?['name']:route.endsWith('/rename')?['id','name','expectedRevision']:['id','expectedRevision']);}
        if(route==='POST /api/formations/named/rename'){json(operations.renameNamedFormation(id,payload));return;}
        if(route==='POST /api/formations/named/delete'){json(operations.deleteNamedFormation(id,payload));return;}
        if (route==='POST /api/gameplay/config') {fields(['module','config']);if(sessions.get(id)?.busy)throw Object.assign(new Error('账号任务运行期间不能修改玩法配置'),{code:'ACCOUNT_BUSY',statusCode:409});json(operations.saveModuleConfig(id,payload));return;}
        if (route==='POST /api/workflows/save') {fields(['graph']);workflowStore.save(id,payload.graph);json(workflowView(id));return;}
        if (route==='POST /api/workflows/simulate') {fields(['graph']);json({accountId:id,...simulateWorkflow(payload.graph,{modules:operations.modules})});return;}
        if (route==='POST /api/workflows/stop') {fields([]);workflowRunners.get(id)?.stop();operations.stop(id);await workflowRunners.get(id)?.settle();json(workflowView(id));return;}
        if (route==='POST /api/workflows/resume') {fields([]);const runner=workflowRunner(id);if(runner.getStatus().status!=='AWAITING_AUTHORIZATION')throw Object.assign(new Error('工作流没有待核对批次'),{statusCode:409});runner.resume().catch(cause=>emit(sessions.get(id),'error',cause.message));await Promise.resolve();json(workflowView(id));return;}
        if (route === 'POST /api/operations/production-policy') { json(operations.saveProductionPolicy(id, payload)); return; }
        if (route === 'POST /api/operations/stop') {
          if (!payload || Array.isArray(payload) || Object.keys(payload).length) throw new Error('停止操作不接受额外字段');
          json(operations.stop(id)); return;
        }
        const session = sessions.get(id); scoped = session ?? null;
        if (!session?.client?.connected || session.state !== 'READY') { json({ error: '账号未连接，请先显式连接', code: 'NOT_CONNECTED' }, 409); return; }
        if(route==='POST /api/formations/named/save'){json(await operations.saveNamedFormation(session,payload));return;}
        if(route==='POST /api/formations/named/overwrite'){json(await operations.overwriteNamedFormation(session,payload));return;}
        if(route==='POST /api/formations/named/prepare'){json(await operations.prepareNamedFormation(session,payload));return;}
        if (route==='POST /api/gameplay/survey') {fields(['module','parameters']);json({...await operations.surveyModule(session,payload.module,payload.parameters??{}),csrfToken:operationCsrf});return;}
        if (route==='POST /api/workflows/start') {fields(['graph']);validateWorkflow(payload.graph,{modules:operations.modules});const runner=workflowRunner(id);if(runner.getStatus().running)throw Object.assign(new Error('账号工作流正在运行'),{code:'WORKFLOW_BUSY',statusCode:409});runner.start(id,payload.graph).catch(cause=>emit(session,'error',cause.message));await Promise.resolve();json(workflowView(id));return;}
        if (route === 'POST /api/operations/survey') {
          if (!payload || Array.isArray(payload) || Object.keys(payload).length) throw new Error('采集操作不接受额外字段');
          json(await operations.survey(session)); return;
        }
        if (route === 'POST /api/operations/recovery/preview') { json(await operations.previewRecovery(session, payload)); return; }
        if (route === 'POST /api/operations/recovery/confirm') { json(await operations.confirmRecovery(session, payload)); return; }
        if (route === 'POST /api/operations/plan') { json(await operations.plan(session, payload)); return; }
        if (route === 'POST /api/operations/authorize') { json(operations.authorize(session, payload)); return; }
        if (route === 'POST /api/operations/execute') { json(operations.execute(session, payload)); return; }
        }
      }
      if (stageRoute) {
        const id = parsed.searchParams.get('account');
        if (!id) { json({ error: '必须指定账号 ID' }, 400); return; }
        if (!loadStore().accounts.some((account) => account.id === id)) { json({ error: '没有这个账号' }, 404); return; }
        const session = sessions.get(id);
        scoped = session ?? null;
        if (route === 'GET /api/stages') { json(stageView(id, session)); return; }
        if (route === 'POST /api/stages/stop') {
          const payload = jsonBody(); if (!payload || Array.isArray(payload) || Object.keys(payload).length) throw Object.assign(new Error('停止不接受额外字段'), {statusCode:400});
          session?.stageRunner?.stop('用户主动停止');
          json(stageView(id, session)); return;
        }
        const payload = jsonBody();
        if (!payload || Array.isArray(payload) || Object.keys(payload).some(key => !['confirm', 'config'].includes(key))) throw Object.assign(new Error('闯关请求包含未知字段'), {statusCode:400});
        needConfirm(payload);
        const config = validateStageConfig(payload.config);
        if (!config.enabled) { json({ error: '自动闯关配置未启用', code: 'STAGES_DISABLED' }, 409); return; }
        if (!stageSideAvailable) { json({ error: stageUnavailableReason, code: 'SIDE_UNVERIFIED' }, 409); return; }
        if (!session || !session.client?.connected || session.state !== 'READY') {
          json({ error: '账号未连接，请先显式连接', code: 'NOT_CONNECTED' }, 409); return;
        }
        if (session.collectionPromise || session.busy || session.loop?.running) {
          json({ error: '账号有其他任务运行中', code: 'ACCOUNT_BUSY' }, 409); return;
        }
        if (operations.running(id) || operations.blocked(id)) { json({ error: '账号存在城市/订单执行或历史未决操作', code: 'RECOVERY_UNCERTAIN' }, 409); return; }
        const instance = session.client, generation = session.generation;
        // GameClient can coalesce identical requests; never attach a new run to an old battle.
        if (instance.pending?.length || instance.watchers?.length || instance.promptUncertain || instance.lateResponses?.size || instance.uncertainWrites?.size) {
          json({ error: '连接存在未决请求或归属不确定，请先重新连接', code: 'RESPONSE_UNCERTAIN' }, 409); return;
        }
        const formationEvidence=await operations.assertFormationReady(session,config.formation);
        // Formation preflight yields and releases its own lock. Recheck synchronously
        // before starting the original Runner so another task cannot enter that gap.
        if (closed || sessions.get(id) !== session || session.generation !== generation || session.client !== instance
          || !instance.connected || session.state !== 'READY' || session.abort?.signal.aborted) {
          json({ error: '阵容检查期间账号会话已切换或失效', code: 'CANCELLED' }, 409); return;
        }
        const stageStatus = session.stageClient === instance ? session.stageRunner?.getStatus() : null;
        if (session.collectionPromise || session.busy || session.workflowOwner || session.loop?.running) {
          json({ error: '账号有其他任务运行中', code: 'ACCOUNT_BUSY' }, 409); return;
        }
        if (operations.running(id) || operations.blocked(id)) {
          json({ error: '账号存在城市/订单执行或历史未决操作', code: 'RECOVERY_UNCERTAIN' }, 409); return;
        }
        if (stageStatus?.running || stageStatus?.inFlight) {
          json({ error: '该账号已有闯关或未决战斗', code: 'STAGE_BUSY' }, 409); return;
        }
        if (stageStatus?.uncertain) {
          json({ error: '上次战斗结果不确定，请先明确重新连接同步关卡', code: 'RESULT_UNCERTAIN' }, 409); return;
        }
        if (instance.pending?.length || instance.watchers?.length || instance.promptUncertain || instance.lateResponses?.size || instance.uncertainWrites?.size) {
          json({ error: '连接或主线存在未决结果，禁止启动新主线', code: 'RESPONSE_UNCERTAIN' }, 409); return;
        }
        prepareStageRunner(session);
        session.stageRunner.start(config, { allowMutate: true, formationEvidence });
        json(stageView(id, session)); return;
      }
      if (route === 'POST /api/refresh') {
        const { account, session } = scoped_(parsed);
        json(await refresh(session, account));
        return;
      }
      if (route === 'GET /api/order-rules' || route === 'POST /api/order-rules' || route === 'POST /api/order-rules/preview') {
        const id = parsed.searchParams.get('account');
        if (!id) { json({ error: '必须指定账号 ID' }, 400); return; }
        if (!loadStore().accounts.some((account) => account.id === id)) { json({ error: '没有这个账号' }, 404); return; }
        const session = sessions.get(id);
        if (route === 'GET /api/order-rules') {
          json({ accountId: id, ...loadOrderRules(id), defaults: defaultOrderRules(), ruleTypes: ORDER_RULE_TYPES,
            items: orderItems(session?.snapshot, loadConfigSafe()), itemSourceNote });
        } else if (route === 'POST /api/order-rules') {
          json({ accountId: id, ...saveOrderRules(id, jsonBody().config) });
        } else {
          const policy = validateOrderRules(jsonBody().config);
          const preview = await previewOrderRules(session, policy);
          if (!loadStore().accounts.some((account) => account.id === id) || sessions.get(id) !== session) {
            json({ error: '账号已删除或会话已切换，请重新读取' }, 409); return;
          }
          json({ accountId: id, ...preview });
        }
        return;
      }
      if (route === 'GET /api/data-explorer') {
        // Browsing never allocates a Runtime: exact account identity, existing cache only.
        const id = parsed.searchParams.get('account');
        if (!id) { json({ error: '必须指定账号 ID' }, 400); return; }
        const account = loadStore().accounts.find((entry) => entry.id === id);
        if (!account) { json({ error: '没有这个账号' }, 404); return; }
        const session = sessions.get(account.id);
        json({ accountId: account.id, updatedAt: session?.snapshotAt ?? null, stale: session?.snapshotStale ?? false,
          ...exploreSnapshot(session?.snapshot, { domain: parsed.searchParams.get('domain'), config: loadConfigSafe(), updatedAt: session?.snapshotAt ?? null }) });
        return;
      }
      if (route === 'GET /api/snapshot/export') {
        const { account, session } = scoped_(parsed);
        json({ accountId: account.id, updatedAt: session.snapshotAt, stale: session.snapshotStale, snapshot: session.snapshot });
        return;
      }
      if (route === 'GET /') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(PAGE);
        return;
      }
      if (route === 'GET /api/art/index') {
        json(iconIndex());
        return;
      }
      // 图标是游戏自己的贴图，从 FairyGUI 图集里按图集页整张给出去，裁切交给浏览器。
      if (route.startsWith('GET /api/art/atlas/')) {
        const [, , , , bundle, file] = route.split('/').map((part) => decodeURIComponent(part));
        const found = atlasFile(bundle, file);
        if (!found) {
          json({ error: 'not found' }, 404);
          return;
        }
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' });
        res.end(fs.readFileSync(found));
        return;
      }
      if (route === 'GET /api/events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        res.account = parsed.searchParams.get('account');
        streams.add(res);
        res.on('close', () => streams.delete(res));
        res.flushHeaders();
        return;
      }

      // ---- 账号 ----
      if (route === 'GET /api/accounts') {
        const store = loadStore();
        json({
          activeId: store.activeId,
          accounts: store.accounts.map((account) => ({
            ...describeAccount(account, { active: account.id === store.activeId }),
            status: accountStatus(sessionFor(account.id)),
          })),
        });
        return;
      }
      if (route === 'GET /api/accounts/credential') {
        const store = loadStore();
        const account = pickAccount(store, parsed.searchParams.get('account'));
        if (!account) throw new Error('没有这个账号');
        json(describeAccount(account, { active: account.id === store.activeId }));
        return;
      }
      if (route === 'POST /api/accounts/active') {
        const payload = jsonBody();
        needConfirm(payload);
        const store = loadStore();
        const account = pickAccount(store, payload.id);
        if (!account) throw new Error('没有这个账号');
        setActive(store, account.id);
        saveStore(store);
        emit(null, 'info', `当前账号切到 ${describeAccount(account).title}`);
        json({ ok: true, activeId: account.id });
        return;
      }
      if (route === 'POST /api/accounts/label') {
        const payload = jsonBody();
        needConfirm(payload);
        const store = loadStore();
        const account = pickAccount(store, payload.id);
        if (!account) throw new Error('没有这个账号');
        account.label = String(payload.label ?? '').trim() || null;
        saveStore(store);
        json({ ok: true });
        return;
      }
      if (route === 'POST /api/accounts/remove') {
        const payload = jsonBody();
        needConfirm(payload);
        const store = loadStore();
        const account = pickAccount(store, payload.id);
        if (!account) throw new Error('没有这个账号');
        const removedSession = sessions.get(account.id);
        if (removedSession) cancelSession(removedSession, 'STOPPED');
        removeAccount(store, account.id);
        saveStore(store);
        sessions.delete(account.id);
        emit(null, 'info', `已删除账号 ${describeAccount(account).title}`);
        json({ ok: true });
        return;
      }

      // ---- 连接 ----
      if (route === 'POST /api/connect') {
        const payload = jsonBody();
        const { account, session } = scoped_(parsed);
        json(await connect(session, account));
        return;
      }
      if (route === 'POST /api/disconnect') {
        const { session } = scoped_(parsed);
        cancelSession(session, 'STOPPED');
        json({ ok: true });
        return;
      }

      // ---- 抓包与扫码 ----
      // 二维码只负责把游戏在电脑上拉起来，凭证还是靠本机代理抓。
      // 优先用游戏自己的小程序码（data/qrcode.png），没有就退回微信的跳转链接。
      if (route === 'GET /api/capture') {
        json({ ...captureState(), qr: qrInfo() });
        return;
      }
      if (route === 'GET /api/capture/qrcode') {
        const file = path.join(DATA_DIR, 'qrcode.png');
        if (!fs.existsSync(file)) {
          json({ error: '没有 data/qrcode.png' }, 404);
          return;
        }
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
        res.end(fs.readFileSync(file));
        return;
      }
      if (route === 'POST /api/capture/start') {
        const payload = jsonBody();
        needConfirm(payload);
        if (captureState().running) throw new Error('已经在抓包了');
        emit(null, 'info', `开始抓包：本地 CA 与系统代理（127.0.0.1:${DEFAULT_PROXY_PORT}）都是当前用户范围，抓到即自动还原`);
        await startCapture({
          port: DEFAULT_PROXY_PORT,
          onLog: (line) => emit(null, 'info', line),
          onLogin: async ({ url, body, rawFrameHex }) => addCapturedAccount({ url, body, rawFrameHex }),
        });
        json({ ...captureState(), qr: qrInfo() });
        return;
      }
      if (route === 'POST /api/capture/stop') {
        needConfirm(jsonBody());
        await stopCapture('用户点了停止');
        json({ ...captureState(), qr: qrInfo() });
        return;
      }

      // ---- 只读视图 ----
      if (route === 'GET /api/overview') {
        const { account, session } = scoped_(parsed);
        json(await overview(session, account));
        return;
      }
      if (route === 'GET /api/heroes') {
        const { account, session } = scoped_(parsed);
        json(await heroes(session, account));
        return;
      }
      if (route === 'GET /api/dailies') {
        const { account, session } = scoped_(parsed);
        json(await dailies(session, account));
        return;
      }
      if (route === 'GET /api/tasks') {
        const { account, session } = scoped_(parsed);
        json(await tasks(session, account));
        return;
      }
      if (route === 'GET /api/world') {
        const { account, session } = scoped_(parsed);
        json(await world(session, account));
        return;
      }
      if (route === 'GET /api/worlds') {
        const { account, session } = scoped_(parsed);
        const stage = session.stageRunner?.getStatus();
        if (stage?.running || stage?.inFlight) {
          json({ error: '自动闯关或未决战斗期间不能查询区服；已有缓存仍可浏览', code: 'STAGE_BUSY' }, 409); return;
        }
        const instance = await ensureConnected(session, account);
        json({ ...(await listWorlds(instance)), currentPlayer: describeRole(session.player) });
        return;
      }
      // 进服自己开一条短连接，所以不会打扰控制台这边正在跑的会话。
      if (route === 'POST /api/worlds/enter') {
        const payload = jsonBody();
        needConfirm(payload);
        const { account, session } = scoped_(parsed);
        if (!payload.worldId) throw new Error('要指定 worldId');
        const entered = await enterWorld({ url: account.url, login: account.login, protocol }, Number(payload.worldId));
        const player = describeRole(entered.player);
        entered.client.stop();
        json({ player });
        return;
      }

      // ---- 写操作 ----
      if (route === 'POST /api/heroes/run') {
        const payload = jsonBody();
        needConfirm(payload);
        const { account, session } = scoped_(parsed);
        const instance = await ensureConnected(session, account);
        const plan = await heroes(session, account);
        const started = Date.now();
        const steps = [];
        const results = await runHeroPlan(instance, protocol, plan, {
          allowMutate: true,
          signal: session.abort.signal,
          timeout: 8000,
          onStep: (entry) => {
            const step = entry.step;
            const label = step.kind === 'level' ? `${step.heroId} 升到 ${step.to} 级` : step.kind === 'star' ? `${step.heroId} 升到 ${step.to} 星` : `${step.heroId} 技能 ${step.slot + 1}`;
            steps.push({ label, ok: entry.ok, error: entry.error });
            emit(session, entry.ok ? 'info' : 'error', entry.ok ? `英雄 ${label}` : `英雄 ${label} 失败：${entry.error}`);
          },
        });
        const after = await instance.request('AllHeroRequest', {}, 'AllHeroResponse', 15000);
        json({ sent: results.length, failed: results.filter((r) => !r.ok).length, ms: Date.now() - started, steps, heroes: after.heroes ?? [] });
        return;
      }
      if (route === 'POST /api/dailies/run') {
        const payload = jsonBody();
        needConfirm(payload);
        const { account, session } = scoped_(parsed);
        const instance = await ensureConnected(session, account);
        const config = loadConfigSafe();
        const survey = await surveyDailies(instance, protocol, { config, player: session.player });
        const started = Date.now();
        const results = await runDailies(instance, protocol, survey, {
          allowMutate: true,
          signal: session.abort.signal,
          config,
          allowPaid: payload.paid === true,
          onStep: (entry) => {
            if (entry.skipped) emit(session, 'warn', `日常「${entry.title}」跳过：${entry.reason}`);
            else emit(session, entry.ok ? 'info' : 'error', entry.ok ? `日常「${entry.title}」${entry.note}` : `日常「${entry.title}」失败：${entry.error}`);
          },
        });
        // 任务奖励、活跃度宝箱与每日赠礼的领取都在 runDailies 内部收尾，这里只把结果重新读一遍给页面。
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const after = await surveyDailies(instance, protocol, { config, player: session.player });
        const claimed = results
          .filter((entry) => entry.ok && (entry.request === 'DrawDailyTaskRewardRequest' || entry.id === 'activityChest' || entry.id === 'freeDailyPack'))
          .map((entry) => entry.note);
        json({ results, claimed, ms: Date.now() - started, tasks: after.tasks, chests: after.chests, gift: after.gift, ruby: after.ruby });
        return;
      }
      if (route === 'POST /api/tasks/run') {
        const payload = jsonBody();
        needConfirm(payload);
        const { account, session } = scoped_(parsed);
        const instance = await ensureConnected(session, account);
        const survey = await tasks(session, account);
        const results = await runTasks(instance, protocol, survey, {
          allowMutate: true,
          signal: session.abort.signal,
          onStep: (entry) => {
            if (entry.skipped) emit(session, 'warn', `任务「${entry.step.label}」跳过：${entry.error}`);
            else emit(session, entry.ok ? 'info' : 'error', entry.ok ? `领取 ${entry.step.label}` : `领取 ${entry.step.label} 失败：${entry.error}`);
          },
        });
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const after = await tasks(session, account);
        json({ results: results.map((r) => ({ label: r.step.label, ok: r.ok, skipped: r.skipped, error: r.error })), plan: after.plan, text: after.text });
        return;
      }
      if (route === 'POST /api/world/run') {
        const payload = jsonBody();
        needConfirm(payload);
        const { account, session } = scoped_(parsed);
        const instance = await ensureConnected(session, account);
        const config = loadConfigSafe();
        const survey = await surveyWorld(instance, protocol, { config, player: session.player });
        const plan = planWorld(survey, { config, allowSpeedUp: payload.speedUp === true, allowReroll: payload.reroll === true });
        const { results } = await runWorld(instance, protocol, plan, {
          allowMutate: true,
          signal: session.abort.signal,
          onStep: (entry) => {
            if (entry.skipped) emit(session, 'warn', `海面「${entry.step.label}」跳过：${entry.error}`);
            else emit(session, entry.ok ? 'info' : 'error', entry.ok ? `海面 ${entry.step.label}` : `海面 ${entry.step.label} 失败：${entry.error}`);
          },
        });
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const after = await world(session, account);
        json({ results: results.map((r) => ({ label: r.step.label, ok: r.ok, skipped: r.skipped, error: r.error })), plan: after.plan, text: after.text, population: after.population });
        return;
      }
      // 循环：开启后立刻返回，进度走 /api/loop 与事件流。
      if (route === 'GET /api/loop') {
        const { session } = scoped_(parsed);
        json(loopView(session));
        return;
      }
      if (route === 'POST /api/loop/start') {
        const payload = jsonBody();
        needConfirm(payload);
        const { account, session } = scoped_(parsed);
        const loop = session.loop;
        if (loop.running) throw new Error('这个账号的循环已经在跑了');
        const instance = await ensureConnected(session, account);
        const config = loadConfigSafe();
        loop.running = true;
        loop.rounds = Number(payload.rounds ?? 1);
        loop.completed = 0;
        loop.everyMs = Number(payload.everySeconds ?? 60) * 1000;
        loop.history = [];
        loop.error = null;
        loop.stop = { aborted: false };
        const generation = session.generation;
        const current = () => sessions.get(session.id) === session && session.generation === generation && session.client === instance;
        emit(session, 'info', `自动挂机开始：${loop.rounds} 轮，每轮间隔 ${payload.everySeconds ?? 60} 秒`);
        runLoop(instance, protocol, {
          config,
          player: session.player,
          rounds: loop.rounds,
          everyMs: loop.everyMs,
          allowMutate: true,
          allowPaid: payload.paid === true,
          allowSpeedUp: payload.speedUp === true,
          allowReroll: payload.reroll === true,
          stop: loop.stop,
          signal: session.abort.signal,
          onRound: (summary) => {
            if (!current()) return;
            loop.completed = summary.round;
            loop.history.push(summary);
            if (loop.history.length > 50) loop.history.shift();
            emit(session, 'info', formatLoopRound(summary));
          },
          onStep: (entry) => {
            if (!current()) return;
            const label = entry.step?.label ?? entry.title ?? entry.id;
            if (entry.skipped) return;
            emit(session, entry.ok ? 'info' : 'error', entry.ok ? `循环[${entry.phase}] ${label}` : `循环[${entry.phase}] ${label} 失败：${entry.error}`);
          },
        })
          .then((result) => {
            if (!current()) return;
            loop.status = result.status;
            loop.error = result.error;
            emit(session, result.status === 'SUCCESS' ? 'info' : 'warn', '自动挂机结束：' + result.status);
          })
          .catch((error) => {
            if (!current()) return;
            loop.error = error.message;
            emit(session, 'error', `自动挂机中止：${error.message}`);
          })
          .finally(() => {
            if (!current()) return;
            loop.running = false;
          });
        json({ ok: true, running: true });
        return;
      }
      if (route === 'POST /api/loop/stop') {
        const payload = jsonBody();
        needConfirm(payload);
        const { session } = scoped_(parsed);
        session.loop.stop.aborted = true;
        json({ ok: true, running: session.loop.running });
        return;
      }

      json({ error: 'not found' }, 404);
    } catch (error) {
      emit(scoped, 'error', error.message);
      json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.statusCode ?? 400);
    } finally {
      if (scoped && scoped.busy === route) scoped.busy = null;
    }
  }

  function loopView(session) {
    const loop = session.loop;
    return {
      running: loop.running,
      rounds: loop.rounds,
      completed: loop.completed,
      everyMs: loop.everyMs,
      history: loop.history.map((summary) => ({ ...summary, text: formatLoopRound(summary) })),
      error: loop.error,
    };
  }

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => handle(req, res, body));
  });

  return {
    server,
    listen: () =>
      new Promise((resolve, reject) => {
        try { writerOwnership.claim(); } catch (cause) { reject(cause); return; }
        const startupError = cause => { try { writerOwnership.release(); } catch {} reject(cause); };
        server.once('error', startupError);
        server.listen(port, host, () => {
          server.off('error', startupError);
          server.on('error', cause => {
            closed = true;
            for (const session of sessions.values()) cancelSession(session, 'FAILED');
            emit(null, 'error', 'HTTP 服务异常；任务已取消，写所有权保留至关闭结算', { code: cause.code ?? 'SERVER_ERROR' });
          });
          emit(null, 'info', `控制台已启动 http://${host}:${port}`);
          resolve(`http://${host}:${port}`);
        });
      }),
    close: () => {
      if (closingPromise) return closingPromise;
      closed = true;
      const httpClosed = server.listening
        ? new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
        : Promise.resolve();
      const operationTasks = [...sessions.keys()].map(id => operations.settle(id));
      const stageTasks = [...sessions.values()].map(session => session.stageRunner?.completion).filter(Boolean);
      for (const session of sessions.values()) cancelSession(session, 'STOPPED');
      sessions.clear();
      for (const stream of streams) stream.end();
      streams.clear();
      const traceClosed = traceStream ? new Promise((resolve) => traceStream.end(resolve)) : Promise.resolve();
      closingPromise = Promise.all([httpClosed, traceClosed, ...operationTasks, ...stageTasks, ...[...workflowRunners.values()].map(runner=>runner.settle())]).then(() => { writerOwnership.release(); });
      return closingPromise;
    },
    emit,
    sessions,
    captureState,
    operations,
  };
}

export function openBrowser(url) {
  const attempts = [
    ['msedge', [`--app=${url}`]],
    ['chrome', [`--app=${url}`]],
    ['cmd', ['/c', 'start', '', url]],
  ];
  for (const [command, args] of attempts) {
    try {
      const child = spawn(command, args, { detached: true, stdio: 'ignore' });
      child.on('error', () => {});
      child.unref();
      return command;
    } catch {
      /* try next */
    }
  }
  return null;
}
