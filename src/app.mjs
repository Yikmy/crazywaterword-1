import fs from 'node:fs';
import { assertExecutionActive, executionDelay, executionOutcome, stopsExecution } from './execution.mjs';
import { createCliOutput, loadCliStore, loadCliCredential, cliAccountSelector, isCliEntry } from './cli-safety.mjs';
import { GameClient } from './client.mjs';
import { loadProtocol } from './proto.mjs';
import { createConsole, openBrowser } from './server.mjs';
import { saveStore, pickAccount, removeAccount, setActive, describeAccount, ACCOUNTS_PATH, LEGACY_CREDENTIALS_PATH } from './accounts.mjs';
import { listWorlds, listGroup, enterWorld, describeRole } from './worlds.mjs';
import { collectState, summarize, formatState } from './game.mjs';
import { ACTIONS, listActions, runAction, assertAllowed, buildBody } from './actions.mjs';
import { normalize } from './worlds.mjs';
import { getConfig } from './config.mjs';
import { planHeroes, runHeroPlan, formatHeroPlan } from './heroes.mjs';
import { surveyDailies, runDailies, formatSurvey, planChests, planDailyGift, claimableDailyTasks } from './dailies.mjs';
import { surveyTasks, runTasks, formatTaskPlan } from './tasks.mjs';
import { surveyWorld, planWorld, runWorld, formatWorldPlan, formatFieldReport, loadMapAsset, planFieldOccupy, planFieldGiveUp, SPEED_UP_ITEM } from './world.mjs';
import { runLoop, formatLoopRound } from './loop.mjs';

const cli = createCliOutput();

const cliSignals = new WeakMap();
function bindCliClient(client) {
  const controller = new AbortController();
  cliSignals.set(client, controller.signal);
  const originalStop = client.stop.bind(client);
  let stopped = false;
  const cancel = () => { cli.log('收到停止信号：停止后续操作'); controller.abort(); client.stop(); };
  const cleanup = () => {
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
    client.off?.('state', stateChanged);
  };
  const stateChanged = ({ state }) => {
    if (['FAILED', 'REJECTED', 'CLOSED', 'EXPIRED', 'STOPPED'].includes(state)) {
      controller.abort();
      cleanup();
    }
  };
  client.stop = () => {
    if (stopped) return;
    stopped = true;
    controller.abort();
    cleanup();
    originalStop();
  };
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  client.on?.('state', stateChanged);
  return client;
}
const executionOptions = (client) => ({ signal: cliSignals.get(client) });
const outcomeLine = (entry, label) => entry.status === 'UNKNOWN'
  ? '  ? ' + label + ' 结果未知，已停止后续写操作'
  : entry.status === 'CANCELLED'
    ? '  - ' + label + ' 已取消'
    : entry.ok ? '  . ' + label : '  x ' + label + ' 失败: ' + (entry.error ?? entry.status ?? '未知原因');


const READ_ONLY_PROBES = [
  'AllResourceRequest',
  'AllItemRequest',
  'AfkInfoRequest',
  'DailyTaskInfoRequest',
  'ArenaInfoRequest',
  'GuildInfoRequest',
];

// --account <id|昵称|序号> 或 CW_ACCOUNT 指定用哪个号；都不给就用当前选中的那个。
function accountSelector() { return cliAccountSelector(); }

function loadCredentials() {
  const credential = loadCliCredential({ selector: accountSelector(), output: cli });
  if (credential.accountCount > 1 || accountSelector()) {
    cli.log('账号:', describeAccount(credential.account).title);
  }
  return credential;
}

// 配置表缓存可能不存在，缺了只是少点名字，不该让整条命令失败。
function loadConfigSafe() {
  try {
    return getConfig();
  } catch (error) {
    cli.log(`warn: 未加载配置表 (${error.message})`);
    return null;
  }
}

export async function headless({ seconds = 60, probes = true } = {}, { credentialSource = loadCredentials, protocolSource = loadProtocol, createClient = (options) => new GameClient(options) } = {}) {
  const credential = credentialSource();
  cli.remember(credential);
  const { url, login } = credential;
  const protocol = protocolSource();
  const client = bindCliClient(createClient({ url, protocol }));
  try {

    client.on('state', ({ state, detail }) => cli.log(`state: ${state}${detail ? ` (${detail})` : ''}`));
    client.on('pong', ({ latencyMs, offsetMs }) => cli.log(`pong: ${latencyMs}ms offset=${offsetMs}ms`));
    client.on('message', ({ name, seq, body }) => {
      const text = cli.json(body);
      cli.log(`recv [${name}] seq=${seq} ${text.length > 600 ? `${text.slice(0, 600)}...` : text}`);
    });
    client.on('warn', (message) => cli.log(`warn: ${message}`));
    client.on('fatal', (info) => cli.log(`fatal: ${cli.json(info)}`));

    const response = await client.connect(login);
    assertExecutionActive(client, executionOptions(client));
    cli.log('login ok:', cli.json({
      result: response.result,
      initSeqNo: response.initSeqNo,
      nickname: response.playerInfo?.nickname,
      level: response.playerInfo?.level,
      power: response.playerInfo?.power,
    }));

    if (probes) {
      for (const name of READ_ONLY_PROBES) {
        assertExecutionActive(client, executionOptions(client));
        const responseName = `${name.slice(0, -7)}Response`;
        try {
          const body = await client.request(name, {}, responseName, 8000);
          const text = cli.json(body);
          cli.log(`probe [${name}] ok ${text.length > 400 ? `${text.slice(0, 400)}...` : text}`);
        } catch (error) {
          cli.log(`probe [${name}] failed: ${error.message}`);
        }
      }
    }

    await executionDelay(seconds * 1000, executionOptions(client));
  } finally {
    client.stop();
  }
}

// Read-only: list the worlds this account has roles on, plus the user info for the
// world the account currently sits in. Passing a worldId adds a second connection that
// enters that world and prints its user info (see the newRole warning below).
async function worlds({ worldId = null, group = false, seconds = 0 }) {
  const { url, login } = loadCredentials();
  const protocol = loadProtocol();
  const client = bindCliClient(new GameClient({ url, protocol }));
  try {
    client.on('warn', (message) => cli.log(`warn: ${message}`));
    client.on('fatal', (info) => cli.log(`fatal: ${cli.json(info)}`));

    const response = await client.connect(login);
    assertExecutionActive(client, executionOptions(client));
    cli.log(`current world (login worldId=0), user info:`);
    cli.log(cli.json(describeRole(response.playerInfo), null, 2));

    const worlds = await listWorlds(client);
    cli.log(`\nworlds on this account (latestGroupId=${worlds.latestGroupId}, count=${worlds.recentWorlds.length}):`);
    for (const world of worlds.recentWorlds) {
      const role = world.role || {};
      const moved = role.worldId && role.worldId !== world.worldId ? ` -> ${role.worldId}` : '';
      cli.log(`  worldId=${world.worldId}${moved} tag=${world.tag} ${role.nickname ?? ''} lv=${role.level ?? ''} power=${role.power ?? ''} lastLogin=${role.lastLoginTime ?? ''}`);
    }

    if (group && worlds.latestGroupId) {
      const all = await listGroup(client, worlds.latestGroupId);
      cli.log(`\nworlds in group ${worlds.latestGroupId} (count=${all.length}):`);
      for (const world of all) cli.log(`  worldId=${world.worldId} tag=${world.tag}`);
    }

    const worldIds = new Set(worlds.recentWorlds.map((world) => world.worldId));
    client.stop();

    if (worldId !== null) {
      const entered = await enterWorld({ url, login, protocol }, worldId);
      bindCliClient(entered.client);
      const player = entered.player || {};
      cli.log(`\nentered worldId=${player.worldId} (requested ${worldId}), user info:`);
      cli.log(cli.json(describeRole(player), null, 2));
      if (!worldIds.has(worldId)) cli.log(`note: worldId=${worldId} was not in the account's world list`);
      if (player.newRole) cli.log('warning: newRole=true — this login created a role in that world');
      try {
        if (seconds > 0) await executionDelay(seconds * 1000, executionOptions(entered.client));
      } finally { entered.client.stop(); }
    }
  } finally {
    client.stop();
  }
}

// Read-only: fire the whole post-login query set and dump what the game state is.
export async function state({ raw = false, out = null } = {}, { credentialSource = loadCredentials, protocolSource = loadProtocol, createClient = (options) => new GameClient(options), collect = collectState } = {}) {
  const credential = credentialSource();
  cli.remember(credential);
  const { url, login } = credential;
  const protocol = protocolSource();
  const client = bindCliClient(createClient({ url, protocol }));
  try {
    client.on('warn', (message) => cli.log(`warn: ${message}`));
    client.on('fatal', (info) => cli.log(`fatal: ${cli.json(info)}`));

    const response = await client.connect(login);
    assertExecutionActive(client, executionOptions(client));
    cli.log(`login ok: ${describeRole(response.playerInfo)?.nickname} world=${describeRole(response.playerInfo)?.worldId}`);

    const started = Date.now();
    const { ok, failed } = await collect(client, protocol, {
      onResult: (name, body, error) => {
        const size = error ? `failed: ${error.message}` : `${cli.json(body).length}B`;
        cli.log(`  ${error ? 'x' : '.'} ${name} ${size}`);
      },
    });
    cli.log(`collected ${Object.keys(ok).length} responses, ${Object.keys(failed).length} failed in ${Date.now() - started}ms`);
    for (const [name, message] of Object.entries(failed)) cli.log(`  failed ${name}: ${message}`);

    if (out) {
      fs.writeFileSync(out, `${cli.json({ login: describeRole(response.playerInfo), ok, failed }, null, 1)}\n`);
      cli.log(`state written to ${out}`);
    }
    if (raw) {
      for (const [name, body] of Object.entries(ok)) {
        const text = cli.json(body);
        cli.log(`\n=== ${name} ${text.length}B ===`);
        cli.log(text.length > 2000 ? `${text.slice(0, 2000)}...` : text);
      }
    } else {
      cli.log(`\n${formatState(summarize({ ok }, { config: loadConfigSafe() }))}`);
    }
  } finally {
    client.stop();
  }
}


const asArray = (value) => (Array.isArray(value) ? value : []);

// 一键领取：先采集状态判定哪些能领，再逐个执行，最后重新采集做前后对比。
// 只包含领取类动作，不改动任何需要消耗资源的东西。
export function planLoot(ok, now, config = null) {
  const plan = [];

  plan.push({ id: 'emailQuickGet', params: {}, why: '邮件一键领取' });

  const daily = ok.DailyTaskInfoRequest;
  for (const task of claimableDailyTasks(daily)) plan.push({ id: 'dailyTaskDraw', params: { id: task.id }, why: `每日任务 ${task.id}` });

  // 活跃度宝箱排在任务奖励之后：任务奖励本身会加活跃度，顺序反了会白跑一轮。
  for (const action of planChests(daily, config).actions) {
    plan.push({
      id: action.request === 'DrawWeeklyRewardRequest' ? 'weeklyRewardDraw' : 'dailyRewardDraw',
      params: { index: action.body.index },
      why: action.note,
    });
  }

  // 每日精选那档免费赠礼，和活跃度宝箱无关，单独看 DailyGiftPackResponse.drawnPack。
  for (const action of planDailyGift(ok.DailyGiftPackResponse).actions) {
    plan.push({ id: 'freeDailyPackDraw', params: { packId: action.body.packId }, why: action.note });
  }

  const achievement = ok.AchievementInfoRequest;
  for (const task of claimableDailyTasks({ dailyTask: achievement?.task })) plan.push({ id: 'achievementDraw', params: { id: task.id }, why: `成就 ${task.id}` });

  const afk = ok.AfkInfoRequest?.afkInfo;
  if (afk && afk.afkFinishTime > 0 && now >= afk.afkFinishTime) {
    plan.push({ id: 'afkDraw', params: {}, why: '挂机本段收益' });
  }
  // 等级奖励的可领等级由 OfflineLvRewardCfg 决定，不是 rewardedLevel+1，也不能超过当前挂机等级。
  if (afk && config) {
    const level = config.nextAfkRewardLevel(afk.rewardedLevel ?? 0);
    if (level !== null && level <= (afk.level ?? 0)) {
      plan.push({ id: 'afkLevelDraw', params: { level }, why: `挂机等级 ${level} 奖励` });
    }
  }

  for (const building of asArray(ok.OnWaterRequest?.building)) {
    // 竣工与建造只能二选一：同一轮先竣工再建造，竣工后它已不是 level 0，建造必被拒。
    const finishing = building.buildFinishTime > 0 && now >= building.buildFinishTime;
    if (finishing) {
      plan.push({ id: 'buildingFinish', params: { buildingId: building.buildingId }, why: `${building.buildingId} 竣工` });
    }
    if (asArray(building.factory?.finishedProducts).length > 0) {
      plan.push({ id: 'factoryGain', params: { buildingId: building.buildingId }, why: `${building.buildingId} 工厂成品` });
    }
    if (asArray(building.product?.asset).length > 0) {
      plan.push({ id: 'buildingCollect', params: { buildingId: building.buildingId }, why: `${building.buildingId} 建筑产物` });
    }
    // Construction uses world planning and its execution budget preflight.

  }
  return plan;
}

const KEY_FIELDS = (ok) => {
  const afk = ok.AfkInfoRequest?.afkInfo;
  const daily = ok.DailyTaskInfoRequest;
  const heroes = asArray(ok.AllHeroRequest?.heroes);
  const items = asArray(ok.AllItemRequest?.items);
  return {
    挂机等级: afk ? `${afk.level} 已领${afk.rewardedLevel} 封顶至${afk.afkFinishTime}` : '-',
    每日任务已完成: daily ? `${asArray(daily.dailyTask).filter((t) => t.progress >= t.targetProgress).length} 个` : '-',
    邮件未领: ok.EmailBoxRequest ? asArray(ok.EmailBoxRequest.email).filter((m) => !m.got).length : '-',
    道具总数: items.length,
    装备数: asArray(ok.EquipsRequest?.equip).length,
    英雄战力: heroes.reduce((sum, hero) => sum + hero.power, 0),
  };
};

// 领取类动作先判定再执行；未知结果立即停止后续写操作。
async function loot({ allowMutate, dryRun = false }) {
  const { url, login } = loadCredentials();
  const protocol = loadProtocol();
  const client = bindCliClient(new GameClient({ url, protocol }));
  try {
    client.on('warn', (message) => cli.log(`warn: ${message}`));
    client.on('fatal', (info) => cli.log(`fatal: ${cli.json(info)}`));

    const response = await client.connect(login);
    assertExecutionActive(client, executionOptions(client));
    cli.log(`login ok: ${describeRole(response.playerInfo)?.nickname} world=${describeRole(response.playerInfo)?.worldId}`);
    const config = loadConfigSafe();
    const before = (await collectState(client, protocol)).ok;
    const now = Date.now() / 1000;
    const plan = planLoot(before, now, config);

    cli.log(`\n可领取 ${plan.length} 项:`);
    for (const step of plan) cli.log(`  ${step.id} ${cli.json(step.params)} — ${step.why}`);

    if (dryRun) {
      cli.log('\n--dry：只列出计划，未执行任何动作');
      return;
    }

    cli.log('\n执行:');
    let failed = 0;
    for (const step of plan) {
      assertExecutionActive(client, executionOptions(client));
      try {
        assertAllowed(step.id, { allowMutate });
        const result = await runAction(client, protocol, step.id, step.params, { ...executionOptions(client), allowMutate });
        if (stopsExecution(result)) { cli.log(outcomeLine(result, result.sent)); return; }
        const detail = result.body ? ` ${cli.json(normalize(result.body)).slice(0, 200)}` : ' 即发即弃';
        cli.log(`  . ${result.sent} ${cli.json(step.params)}${detail}`);
      } catch (error) {
        if (stopsExecution({ status: executionOutcome(error) })) { cli.log(outcomeLine({ status: executionOutcome(error) }, step.id)); return; }
        failed += 1;
        cli.log(`  x ${step.id} ${cli.json(step.params)} 失败: ${error.message}`);
      }
      await executionDelay(300, executionOptions(client));
    }

    await executionDelay(1500, executionOptions(client));
    const after = (await collectState(client, protocol)).ok;
    cli.log(`\n执行 ${plan.length - failed} 项成功，${failed} 项失败`);
    cli.log('\n前后对比:');
    const a = KEY_FIELDS(before);
    const b = KEY_FIELDS(after);
    for (const key of Object.keys(a)) {
      const changed = String(a[key]) !== String(b[key]);
      cli.log(`  ${changed ? '变' : '  '} ${key}: ${a[key]} -> ${b[key]}`);
    }
  } finally {
    client.stop();
  }
}

// One protocol call. Mutating actions need CW_ALLOW_MUTATE=1; without it the run stops
// before anything leaves the socket.
export async function act({ id, params, allowMutate }, { credentialSource = loadCredentials, protocolSource = loadProtocol, createClient = (options) => new GameClient(options) } = {}) {
  assertAllowed(id, { allowMutate });
  buildBody(ACTIONS[id], params);
  if (['upgradeBuilding', 'buildBuilding', 'startProduce', 'finishOrder', 'speedUpUpgrade', 'speedUpProduce'].includes(id)) {
    throw new Error('资源消耗动作必须通过 world 计划与执行前余额复核；act 不接受此类动作');
  }
  if (id === 'afkUpgrade') throw new Error('挂机升级缺少可靠的成本与余额校验，当前禁止通过 act 执行');
  const credential = credentialSource();
  cli.remember(credential);
  const { url, login } = credential;
  const protocol = protocolSource();
  const client = bindCliClient(createClient({ url, protocol }));
  try {
    client.on('warn', (message) => cli.log(`warn: ${message}`));
    client.on('fatal', (info) => cli.log(`fatal: ${cli.json(info)}`));

    await client.connect(login);
    assertExecutionActive(client, executionOptions(client));
    const result = await runAction(client, protocol, id, params, { ...executionOptions(client), allowMutate });
    cli.log(result.status === 'UNKNOWN' ? `${result.sent} 结果未知，未获得最终确认` : `${result.sent}${result.response ? ` -> ${result.response}` : ''}`);
    if (result.body) cli.log(cli.json(normalize(result.body), null, 2));
  } finally {
    client.stop();
  }
}

// 英雄养成：先按客户端红点条件算计划，--dry 只打印，--yes 才真发请求。
async function heroes({ allowMutate, dryRun, allowUniversal }) {
  const { url, login } = loadCredentials();
  const protocol = loadProtocol();
  const client = bindCliClient(new GameClient({ url, protocol }));
  try {
    client.on('warn', (message) => cli.log(`warn: ${message}`));
    client.on('fatal', (info) => cli.log(`fatal: ${cli.json(info)}`));

    const response = await client.connect(login);
    assertExecutionActive(client, executionOptions(client));
    const config = loadConfigSafe();
    const heroList = await client.request('AllHeroRequest', {}, 'AllHeroResponse', 15000);
    const itemList = await client.request('AllItemRequest', {}, 'AllItemResponse', 15000);
    const counts = new Map();
    for (const item of itemList.items ?? []) {
      const id = item.itemId ?? item.id;
      counts.set(id, (counts.get(id) ?? 0) + Number(item.num ?? item.count ?? 0));
    }
    const itemNum = (id) => counts.get(id) ?? 0;
    const playerLevel = describeRole(response.playerInfo).level;
    const plan = planHeroes({ config, heroes: heroList.heroes ?? [], itemNum, playerLevel, allowUniversal });
    cli.log(`玩家等级 ${playerLevel}，英雄等级上限 ${plan.maxLevel}，星级上限 ${plan.maxStar}`);
    cli.log(formatHeroPlan(plan));
    const requests = plan.steps.reduce((sum, step) => sum + (step.kind === 'level' ? step.count : 1), 0);
    cli.log(`\n共 ${plan.steps.length} 个步骤 / ${requests} 个请求`);

    if (dryRun) {
      cli.log('\n--dry：只列计划，未执行');
      return;
    }
    await runHeroPlan(client, protocol, plan, {
      ...executionOptions(client),
      allowMutate,
      timeout: 8000,
      onStep: (entry) => {
        const step = entry.step;
        const label = step.kind === 'level' ? `${step.heroId} lv${step.to}` : step.kind === 'star' ? `${step.heroId} ${step.to}星` : `${step.heroId} 技能${step.slot + 1}`;
        cli.log(outcomeLine(entry, label));
      },
    });
    const after = await client.request('AllHeroRequest', {}, 'AllHeroResponse', 15000);
    cli.log('\n养成后:');
    for (const hero of after.heroes ?? []) cli.log(`  ${hero.heroId} lv${hero.level} ${hero.star}星 战力${hero.power} 技能${cli.json(hero.skillLevels)}`);
  } finally {
    client.stop();
  }
}

// 日常：先只读探一遍（--dry 到这里就够），--yes 才执行；钻石与付费礼包始终禁止。
async function dailies({ allowMutate, dryRun, allowPaid }) {
  const { url, login } = loadCredentials();
  const protocol = loadProtocol();
  const client = bindCliClient(new GameClient({ url, protocol }));
  try {
    client.on('warn', (message) => cli.log(`warn: ${message}`));
    client.on('fatal', (info) => cli.log(`fatal: ${cli.json(info)}`));

    const response = await client.connect(login);
    assertExecutionActive(client, executionOptions(client));
    const config = loadConfigSafe();
    cli.log(`login ok: ${describeRole(response.playerInfo)?.nickname} world=${describeRole(response.playerInfo)?.worldId}`);
    const survey = await surveyDailies(client, protocol, { config, player: response.playerInfo });
    cli.log(`\n${formatSurvey(survey)}\n`);
    for (const entry of survey.tasks) {
      for (const action of entry.actions ?? []) cli.log(`  ${entry.task.id} ${action.request} ${cli.json(action.body)} — ${action.note} (${action.cost})`);
    }

    if (dryRun) {
      cli.log('\n--dry：只列计划，未执行');
      return;
    }

    cli.log('\n执行:');
    await runDailies(client, protocol, survey, {
      ...executionOptions(client),
      allowMutate,
      allowPaid,
      onStep: (entry) => {
        if (entry.skipped) cli.log(`  - ${entry.title} 跳过: ${entry.reason}`);
        else cli.log(outcomeLine(entry, `${entry.title} ${entry.note ?? ''}`));
      },
    });

    // 完成数变化只认服务端回包，重新拉一次对照。
    await executionDelay(1200, executionOptions(client));
    const after = await surveyDailies(client, protocol, { config, player: response.playerInfo });
    cli.log('\n任务进度对比:');
    const before = new Map(survey.tasks.map((entry) => [entry.task.id, entry.task]));
    for (const entry of after.tasks) {
      const was = before.get(entry.task.id);
      const a = `${was?.progress ?? 0}/${was?.targetProgress ?? 0}`;
      const b = `${entry.task.progress}/${entry.task.targetProgress}`;
      cli.log(`  ${a !== b ? '变' : '  '} ${entry.task.title}: ${a} -> ${b}`);
    }
    // runDailies 已经把任务奖励、活跃度宝箱与每日赠礼收尾了，这里只把剩下的状态摆出来。
    cli.log(`\n${formatSurvey(after).split('\n').filter((line) => line.startsWith('活跃奖励') || line.startsWith('每日赠礼')).join('\n')}`);
    if (after.ruby !== survey.ruby) cli.log(`\n钻石 ${survey.ruby} -> ${after.ruby}`);
  } finally {
    client.stop();
  }
}

// 任务领取：主线 / 支线 / 成就 / 每日订单档位。--dry 只列判定，--yes 才真领。
async function tasks({ allowMutate, dryRun }) {
  const { url, login } = loadCredentials();
  const protocol = loadProtocol();
  const client = bindCliClient(new GameClient({ url, protocol }));
  try {
    client.on('warn', (message) => cli.log(`warn: ${message}`));
    client.on('fatal', (info) => cli.log(`fatal: ${cli.json(info)}`));

    const response = await client.connect(login);
    assertExecutionActive(client, executionOptions(client));
    const config = loadConfigSafe();
    cli.log(`login ok: ${describeRole(response.playerInfo)?.nickname} lv${describeRole(response.playerInfo)?.level}`);
    const survey = await surveyTasks(client, protocol, { config });
    cli.log(`\n${formatTaskPlan(survey)}\n`);
    for (const step of survey.plan) {
      const reward = step.reward ? ` 奖励 ${step.reward.map(([id, num]) => `${id}x${num}`).join(',')}` : '';
      cli.log(`  ${step.request} ${cli.json(step.body)} — ${step.label}${reward}`);
    }
    cli.log(`\n共 ${survey.plan.length} 条可领`);

    if (dryRun) {
      cli.log('--dry：只列判定，未领取');
      return;
    }

    cli.log('\n领取:');
    await runTasks(client, protocol, survey, {
      ...executionOptions(client),
      allowMutate,
      onStep: (entry) => {
        if (entry.skipped) cli.log(`  - ${entry.step.label} 跳过: ${entry.error}`);
        else cli.log(outcomeLine(entry, entry.step.label));
      },
    });

    // 领没领到只认服务端回包，重新探一遍对照。
    await executionDelay(1200, executionOptions(client));
    const after = await surveyTasks(client, protocol, { config });
    cli.log(`\n领取后剩余可领 ${after.plan.length} 条:`);
    for (const step of after.plan) cli.log(`  ${step.label}`);
  } finally {
    client.stop();
  }
}

// 海面世界：收成品 / 竣工 / 交单 / 排产 / 余料升级建筑。--dry 只列计划，--yes 才真发请求。
// --speed-up 才允许花「加速器」（钻石永远不碰）；--reroll 才允许拒绝材料不齐的订单。
async function world({ allowMutate, dryRun, allowSpeedUp, allowReroll }) {
  const { url, login } = loadCredentials();
  const protocol = loadProtocol();
  const client = bindCliClient(new GameClient({ url, protocol }));
  try {
    client.on('warn', (message) => cli.log(`warn: ${message}`));
    client.on('fatal', (info) => cli.log(`fatal: ${cli.json(info)}`));

    const response = await client.connect(login);
    assertExecutionActive(client, executionOptions(client));
    const config = loadConfigSafe();
    cli.log(`login ok: ${describeRole(response.playerInfo)?.nickname} lv${describeRole(response.playerInfo)?.level}`);
    const survey = await surveyWorld(client, protocol, { config, player: response.playerInfo });
    const plan = planWorld(survey, { config, allowSpeedUp, allowReroll });
    cli.log(`\n${formatWorldPlan(survey, plan)}\n`);
    cli.log(`共 ${plan.actions.length} 个动作${allowSpeedUp ? '' : '（未开 --speed-up，不会花' + SPEED_UP_ITEM + '）'}`);

    if (dryRun) {
      cli.log('--dry：只列计划，未执行');
      return;
    }

    cli.log('\n执行:');
    const { rejected } = await runWorld(client, protocol, plan, {
      ...executionOptions(client),
      allowMutate,
      onStep: (entry) => {
        if (entry.skipped) cli.log(`  - ${entry.step.label} 跳过: ${entry.error}`);
        else cli.log(outcomeLine(entry, entry.step.label));
      },
    });
    if (rejected.size) cli.log(`本轮被拒 ${rejected.size} 条`);

    // 前面对照只认重新探测的结果。
    await executionDelay(1200, executionOptions(client));
    const after = await surveyWorld(client, protocol, { config, player: response.playerInfo });
    cli.log(`\n对照: 人口 ${survey.population}/${survey.maxPopulation} -> ${after.population}/${after.maxPopulation}`);
    cli.log(`  库存种类 ${survey.stock.size} -> ${after.stock.size}，订单 ${survey.orders.length} -> ${after.orders.length}`);
    const changed = survey.buildings.filter((b) => {
      const now = after.buildings.find((x) => x.buildingId === b.buildingId);
      return now && now.level !== b.level;
    });
    for (const b of changed) {
      const now = after.buildings.find((x) => x.buildingId === b.buildingId);
      cli.log(`  变 ${b.buildingId} lv${b.level} -> lv${now.level}`);
    }
    for (const key of ['建筑蓝图', 'GOLD', SPEED_UP_ITEM, '木材', '玻璃', '塑料', '碎布', '金属', '海藻']) {
      const a = survey.have(key);
      const b = after.have(key);
      if (a !== b) cli.log(`  变 ${key} ${a} -> ${b}`);
    }
  } finally {
    client.stop();
  }
}

// 资源田：默认只读报告；occupy / giveup 需要显式 gridIdx 与 --yes。
// 占田要求「该田所属城是我方城 + 有闲置且耐久>0 的舰队」，条件不满足就直接拒绝，不发请求。
async function field({ sub, gridIdx, fleets, allowMutate }) {
  const { url, login } = loadCredentials();
  const protocol = loadProtocol();
  const client = bindCliClient(new GameClient({ url, protocol }));
  try {
    client.on('warn', (message) => cli.log(`warn: ${message}`));
    client.on('fatal', (info) => cli.log(`fatal: ${cli.json(info)}`));

    const response = await client.connect(login);
    assertExecutionActive(client, executionOptions(client));
    const config = loadConfigSafe();
    const player = response.playerInfo;
    let map = null;
    try {
      map = loadMapAsset(Number(player?.scenarioId ?? 0));
    } catch (error) {
      cli.log(`warn: 地图资源读取失败 (${error.message})`);
    }
    const survey = await surveyWorld(client, protocol, { config, player });
    cli.log(formatFieldReport(survey, map));

    if (!sub) return;
    const grid = Number(gridIdx);
    if (!Number.isFinite(grid)) throw new Error('usage: node src/app.mjs field [occupy|giveup <gridIdx>] [--fleets a,b]');
    const fleetIds = (fleets ?? '').split(',').map((s) => s.trim()).filter(Boolean);

    let planned;
    if (sub === 'occupy') {
      const at = map?.fieldAt(grid);
      if (map && !at) throw new Error(`gridIdx=${grid} 在地图上不是资源田`);
      if (at) cli.log(`地图: gridIdx=${grid} 属于城 ${at.cityId}，类型 ${at.resType}`);
      planned = planFieldOccupy(survey, grid, { fleetBuildingIds: fleetIds });
    } else if (sub === 'giveup') {
      planned = planFieldGiveUp(survey, grid);
    } else {
      throw new Error(`未知子命令 ${sub}`);
    }
    if (planned.error) throw new Error(planned.error);

    cli.log(`${planned.action.label} -> ${planned.action.request} ${cli.json(planned.action.body)}`);
    if (!allowMutate) {
      cli.log('未加 --yes，只打印计划，未发送');
      return;
    }
    const { rejected } = await runWorld(client, protocol, { actions: [planned.action], notes: [] }, {
      ...executionOptions(client),
      allowMutate,
      onStep: (entry) => cli.log(outcomeLine(entry, '资源田操作')),
    });
    if (rejected.size) cli.log('被服务端拒绝（PromptResponse），未生效');
  } finally {
    client.stop();
  }
}

// 自动循环：任务 → 日常 → 海面，Ctrl-C 中止当前等待并停止后续操作。
async function loopCli({ allowMutate, rounds, everySeconds, allowSpeedUp, allowReroll, allowPaid }) {
  const { url, login } = loadCredentials();
  const protocol = loadProtocol();
  const client = bindCliClient(new GameClient({ url, protocol }));
  try {
    client.on('warn', (message) => cli.log('warn:', message));
    client.on('fatal', (info) => cli.log('fatal:', info));
    const response = await client.connect(login);
    assertExecutionActive(client, executionOptions(client));
    const config = loadConfigSafe();
    const player = response.playerInfo;
    cli.log('login ok:', describeRole(player)?.nickname, 'lv' + describeRole(player)?.level,
      rounds > 0 ? '共 ' + rounds + ' 轮' : '一直跑（Ctrl-C 停）', '间隔 ' + everySeconds + 's');
    cli.log('开关: 加速=' + (allowSpeedUp ? '开(只花' + SPEED_UP_ITEM + ')' : '关') + ' 拒绝重刷=' + (allowReroll ? '开' : '关'));
    await runLoop(client, protocol, {
      ...executionOptions(client), config, player, rounds, everyMs: everySeconds * 1000,
      allowMutate, allowPaid, allowSpeedUp, allowReroll,
      onRound: (summary) => cli.log('\n' + formatLoopRound(summary)),
      onStep: (entry) => {
        const label = entry.step?.label ?? entry.title ?? entry.id;
        if (entry.skipped) cli.log('  - ' + label + ' 跳过: ' + (entry.reason ?? entry.error));
        else cli.log(outcomeLine(entry, label));
      },
    });
  } finally {
    client.stop();
  }
}

// 账号管理：列、改名、切换、删除、看脱敏元信息。加账号本身要抓包，走
// tools/capture-credentials.mjs 或网页控制台的扫码向导。
export async function accountsCli(args, { accountStore } = {}) {
  const sub = args.find((arg) => !arg.startsWith('--')) ?? 'list';
  const rest = args.filter((arg) => !arg.startsWith('--') && arg !== sub);
  const store = loadCliStore({ output: cli, ...(accountStore ? { accountStore } : {}) });

  const mutate = () => {
    saveStore(store);
    cli.log(`已写入 ${ACCOUNTS_PATH}`);
  };

  if (sub === 'list') {
    if (!store.accounts.length) {
      cli.log(`还没有任何账号。抓一份凭证：node tools/capture-credentials.mjs`);
      if (fs.existsSync(LEGACY_CREDENTIALS_PATH)) cli.log(`（${LEGACY_CREDENTIALS_PATH} 也没读出来）`);
      return;
    }
    for (const [index, account] of store.accounts.entries()) {
      const info = describeAccount(account, { active: account.id === store.activeId });
      const seen = info.lastSeen;
      const tail = seen
        ? `lv${seen.level ?? '?'} 战力${seen.power ?? '?'} 区服${seen.worldId ?? '?'}`
        : '（还没连上过）';
      cli.log(`${info.active ? '*' : ' '} ${index + 1}. ${info.title}  ${tail}`);
      cli.log(`     openId ${info.id}  凭证抓于 ${info.capturedAt ?? '未知'}`);
    }
    return;
  }

  if (sub === 'use') {
    const account = pickAccount(store, rest[0]);
    if (!account) throw new Error('用法: node src/app.mjs accounts use <id|昵称|序号>');
    setActive(store, account.id);
    mutate();
    cli.log(`当前账号: ${describeAccount(account).title}`);
    return;
  }

  if (sub === 'label') {
    const account = pickAccount(store, rest[0]);
    if (!account || !rest[1]) throw new Error('用法: node src/app.mjs accounts label <id|昵称|序号> <新名字>');
    account.label = rest[1];
    mutate();
    return;
  }

  if (sub === 'remove' || sub === 'rm') {
    const account = pickAccount(store, rest[0]);
    if (!account) throw new Error('用法: node src/app.mjs accounts remove <id|昵称|序号>');
    removeAccount(store, account.id);
    mutate();
    cli.log(`已删除 ${describeAccount(account).title}（原文件里的凭证会一起没掉）`);
    return;
  }

  if (sub === 'show') {
    const account = pickAccount(store, rest[0]);
    if (!account) throw new Error('用法: node src/app.mjs accounts show <id|昵称|序号>');
    cli.log(cli.json(describeAccount(account), null, 2));
    return;
  }

  throw new Error(`未知子命令 ${sub}。可用: list / use / label / remove / show`);
}

export async function main() {
  const mode = process.argv[2] || 'console';

  if (mode === 'selftest') {
    await import('./selftest.mjs');
    return;
  }

  if (mode === 'accounts') {
    await accountsCli(process.argv.slice(3));
    return;
  }

  if (mode === 'connect') {
    await headless({ seconds: Number(process.argv[3] ?? 60) });
    return;
  }

  if (mode === 'probe') {
    await headless({ seconds: 0 });
    return;
  }

  if (mode === 'actions') {
    for (const action of listActions()) {
      const params = action.params.length ? ` <${action.params.join('> <')}>` : '';
      cli.log(`${action.mutate ? '改状态' : '只读'}  ${action.id}${params}`);
      cli.log(`        ${action.request} — ${action.desc}`);
    }
    return;
  }

  if (mode === 'act') {
    const id = process.argv[3];
    if (!id) throw new Error('usage: node src/app.mjs act <actionId> [k=v ...]');
    const params = {};
    for (const token of process.argv.slice(4).filter((arg) => !arg.startsWith('--'))) {
      const at = token.indexOf('=');
      if (at < 0) throw new Error(`parameter must be k=v, got: ${token}`);
      params[token.slice(0, at)] = token.slice(at + 1);
    }
    await act({
      id,
      params,
      allowMutate: process.env.CW_ALLOW_MUTATE === '1' || process.argv.includes('--yes'),
    });
    return;
  }

  if (mode === 'config') {
    const config = getConfig();
    const name = process.argv[3];
    if (!name) {
      cli.log(`本地配置表 ${config.names.length} 张:`);
      cli.log(config.names.join(', '));
      return;
    }
    const table = config.tables[name];
    if (!table) throw new Error(`没有配置表 ${name}`);
    cli.log(cli.json(table, null, 1));
    return;
  }

  if (mode === 'loot') {
    await loot({
      dryRun: process.argv.includes('--dry'),
      allowMutate: process.env.CW_ALLOW_MUTATE === '1' || process.argv.includes('--yes'),
    });
    return;
  }

  if (mode === 'heroes') {
    await heroes({
      dryRun: process.argv.includes('--dry'),
      allowUniversal: !process.argv.includes('--no-universal'),
      allowMutate: process.env.CW_ALLOW_MUTATE === '1' || process.argv.includes('--yes'),
    });
    return;
  }

  if (mode === 'dailies') {
    await dailies({
      dryRun: process.argv.includes('--dry'),
      allowPaid: process.argv.includes('--paid'),
      allowMutate: process.env.CW_ALLOW_MUTATE === '1' || process.argv.includes('--yes'),
    });
    return;
  }

  if (mode === 'loop') {
    const at = (name, fallback) => {
      const i = process.argv.indexOf(name);
      return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
    };
    await loopCli({
      rounds: at('--rounds', 1),
      everySeconds: at('--every', 60),
      allowSpeedUp: process.argv.includes('--speed-up'),
      allowReroll: process.argv.includes('--reroll'),
      allowPaid: process.argv.includes('--paid'),
      allowMutate: process.env.CW_ALLOW_MUTATE === '1' || process.argv.includes('--yes'),
    });
    return;
  }

  if (mode === 'field') {
    const args = process.argv.slice(3).filter((arg) => !arg.startsWith('--'));
    const fleetsAt = process.argv.findIndex((arg) => arg === '--fleets');
    await field({
      sub: args[0] ?? null,
      gridIdx: args[1] ?? null,
      fleets: fleetsAt >= 0 ? process.argv[fleetsAt + 1] : null,
      allowMutate: process.env.CW_ALLOW_MUTATE === '1' || process.argv.includes('--yes'),
    });
    return;
  }

  if (mode === 'world') {
    await world({
      dryRun: process.argv.includes('--dry'),
      allowSpeedUp: process.argv.includes('--speed-up'),
      allowReroll: process.argv.includes('--reroll'),
      allowMutate: process.env.CW_ALLOW_MUTATE === '1' || process.argv.includes('--yes'),
    });
    return;
  }

  if (mode === 'tasks') {
    await tasks({
      dryRun: process.argv.includes('--dry'),
      allowMutate: process.env.CW_ALLOW_MUTATE === '1' || process.argv.includes('--yes'),
    });
    return;
  }

  if (mode === 'state') {
    await state({
      raw: process.argv.includes('--raw'),
      out: process.env.CW_STATE_OUT ?? (process.argv.includes('--out') ? 'data/state.json' : null),
    });
    return;
  }

  if (mode === 'worlds') {
    const arg = process.argv[3];
    await worlds({
      worldId: arg && arg !== 'all' ? Number(arg) : null,
      group: process.argv.includes('--group'),
      seconds: Number(process.env.CW_WORLD_HOLD ?? 0),
    });
    return;
  }

  const port = Number(process.env.CW_PORT ?? 17321);
  const console_ = createConsole({ port });
  const url = await console_.listen();
  const browser = process.env.CW_NO_BROWSER ? null : openBrowser(url);
  cli.log(`console: ${url}${browser ? ` (via ${browser})` : ''}`);
  const store = loadCliStore({ output: cli });
  if (!store.accounts.length) {
    cli.log(`还没有账号：打开 ${url} 用「账号」页扫码添加，或跑 node tools/capture-credentials.mjs`);
  } else {
    cli.log(`账号 ${store.accounts.length} 个，当前: ${describeAccount(pickAccount(store, null)).title}`);
  }
}

if (isCliEntry(import.meta.url)) main().catch((error) => {
  cli.error(process.env.CW_DEBUG ? error : error.message);
  process.exitCode = 1;
});
