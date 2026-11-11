// 英雄养成：升级、升星、技能升级的判定与执行。
//
// 这里的判定条件逐条对齐游戏客户端自己的红点逻辑（HeroUtil / HeroSkillUtil）：
//   升级  level < maxHeroLevel 且 英雄经验 >= HeroUpgradeCfg[level+1].exp 且 玩家等级 >= reqPlayerLv
//   升星  HeroStarCfg[star+1] 存在，且 该英雄碎片 + 万能碎片 >= 品质对应的消耗
//         HeroStarUpRequest 一次只涨一星（响应里的 nextStar），所以一颗星一条请求
//   技能  当前等级非 0、未达 HeroStarCfg[最大星级].maxSkillLevel[槽位]，
//         且 英雄星级 >= heroStarBySkillLv(槽位, 目标等级)——面板上那个"未解锁"的条件
//         且 HeroSkillUpCfg[品质_目标等级].costArr[槽位] 的道具够
// 服务端是否接受仍以实际回包为准，这里只保证"发出去的一定是客户端也会发的"。

import { assertPaymentAllowed } from './actions.mjs';
import { ResourceLedger, resourceCosts, safeResourceQuantity, validateResources } from './resource-ledger.mjs';
import { assertExecutionActive, awaitExecution, executionDelay, executionOutcome, operationResult, stopsExecution } from './execution.mjs';

export const HERO_EXP_ITEM = '英雄经验';

const QUALITY_CONSUME = {
  BLUE: 'consumeBlue',
  PURPLE: 'consumePur',
  ORANGE: 'consumeOra',
  RED: 'consumeRed',
};

function buildIndex(config) {
  const rows = (name) => config.tables[name]?.data ?? [];
  const byLevel = new Map();
  for (const row of rows('HeroUpgradeCfg')) byLevel.set(row.level, row);
  const starByStar = new Map();
  for (const row of rows('HeroStarCfg')) starByStar.set(row.star, row);
  const heroById = new Map();
  for (const row of rows('HeroCfg')) heroById.set(row.id, row);
  const skillUp = new Map();
  for (const row of rows('HeroSkillUpCfg')) skillUp.set(`${row.quality}_${row.level}`, row);
  return { byLevel, starByStar, heroById, skillUp };
}

// 英雄等级不能超过玩家等级对应的上限（HeroUpgradeCfg 里 reqPlayerLv 的第一处断点）。
export function maxHeroLevelFor(playerLevel, config) {
  const rows = config.tables.HeroUpgradeCfg?.data ?? [];
  let max = 1;
  for (const row of rows) {
    if (row.reqPlayerLv > playerLevel) break;
    max = row.level;
  }
  return max;
}

export function maxHeroStar(config) {
  const rows = config.tables.HeroStarCfg?.data ?? [];
  return rows.length ? rows[rows.length - 1].star : 0;
}

// HeroUtil.heroStarBySkillLv(槽位, 目标等级)：升到该技能等级需要的最低星级，
// 也就是 HeroStarCfg 里第一条 maxSkillLevel[槽位] >= 目标等级 的记录的 star。
export function skillLevelMinStar(config, slot, targetLevel) {
  const rows = config.tables.HeroStarCfg?.data ?? [];
  for (const row of rows) {
    const cap = row.maxSkillLevel?.[slot];
    if (cap && cap >= targetLevel) return row.star;
  }
  return null;
}

// itemNum: (itemId) => number，直接吃 AllItemRequest 的结果。
export function planHeroes({ config, heroes, itemNum, playerLevel, allowUniversal = true, heroIds = null, ledger = new ResourceLedger(itemNum), kinds = ['level', 'star', 'skill'], atomic = false, slots = null }) {
  // Optional narrow planning is used by the shared operation adapter. Defaults
  // retain the legacy full-plan behavior; atomic never budgets hypothetical calls.
  if (!Array.isArray(kinds) || Array.from(kinds).some(kind => !['level', 'star', 'skill'].includes(kind)) || new Set(kinds).size !== kinds.length
      || typeof atomic !== 'boolean' || slots !== null && (!Array.isArray(slots) || Array.from(slots).some(slot => !Number.isInteger(slot) || slot < 0 || slot > 3) || new Set(slots).size !== slots.length)) throw new TypeError('Invalid hero planning scope');
  const enabledKinds = new Set(kinds);
  const { byLevel, starByStar, heroById, skillUp } = buildIndex(config);
  const maxLevel = maxHeroLevelFor(playerLevel, config);
  const maxStar = maxHeroStar(config);
  const steps = [];
  const notes = [];
  const reservedBefore = new Map(ledger.reserved);

  const picked = heroes.filter((hero) => !heroIds || heroIds.includes(hero.heroId));
  // 升星优先给战力最高的英雄，万能碎片有限时这个顺序更划算。
  const byPower = [...picked].sort((a, b) => (b.power ?? 0) - (a.power ?? 0));

  if (enabledKinds.has('level')) for (const hero of picked) {
    const cfg = heroById.get(hero.heroId);
    if (!cfg) {
      notes.push(`${hero.heroId}: HeroCfg 里没有这个英雄，跳过`);
      continue;
    }
    const level = hero.level ?? 1;
    if (level >= maxLevel) {
      notes.push(`${hero.heroId}: 已到玩家等级允许的上限 lv${maxLevel}`);
      continue;
    }
    let cost = 0;
    let count = 0;
    const callCosts = [];
    for (let target = level + 1; target <= maxLevel && (!atomic || count < 1); target += 1) {
      const row = byLevel.get(target);
      if (!row) break;
      if (row.reqPlayerLv > playerLevel) break;
      const amount = safeResourceQuantity(row.exp);
      if (amount === null || ledger.available(HERO_EXP_ITEM) === null
          || cost + amount > ledger.available(HERO_EXP_ITEM)) break;
      cost += amount;
      count += 1;
      callCosts.push([{ id: HERO_EXP_ITEM, num: amount }]);
    }
    if (count > 0) {
      const costs = [{ id: HERO_EXP_ITEM, num: cost }];
      if (ledger.reserve(costs)) steps.push({ kind: 'level', heroId: hero.heroId, from: level, to: level + count, count, exp: cost, costs, callCosts });
    }
  }

  // 碎片是全局库存，多个英雄抢同一批万能碎片，所以预算要在英雄之间共享。
  const fragLeft = (item) => ledger.available(item);

  if (enabledKinds.has('star')) for (const hero of byPower) {
    const cfg = heroById.get(hero.heroId);
    if (!cfg) continue;
    const key = QUALITY_CONSUME[cfg.quality];
    if (!key) {
      notes.push(`${hero.heroId}: 未知品质 ${cfg.quality}，跳升星`);
      continue;
    }
    const ownItem = `${hero.heroId}碎片`;
    const universalItem = allowUniversal ? cfg.universalItemId : null;
    let star = hero.star ?? 0;
    let total = 0;
    let usedUniversal = false;
    let ownUsed = 0;
    let universalUsed = 0;
    const sameItem = universalItem === ownItem;
    const gained = [];
    while (star < maxStar && (!atomic || gained.length < 1)) {
      const row = starByStar.get(star + 1);
      if (!row) break;
      const need = safeResourceQuantity(row[key]);
      if (need === null || fragLeft(ownItem) === null) break;
      const ownAvailable = fragLeft(ownItem) - ownUsed;
      const fromOwn = Math.min(ownAvailable, need);
      const fromUniversal = need - fromOwn;
      if (fromUniversal > 0) {
        if (!universalItem) break;
        const universalAvailable = fragLeft(universalItem) - (sameItem ? ownUsed : 0) - universalUsed;
        if (fragLeft(universalItem) === null || universalAvailable < fromUniversal) break;
        universalUsed += fromUniversal;
        usedUniversal = true;
      }
      ownUsed += fromOwn;
      total += need;
      star += 1;
      gained.push({ to: star, fragments: need, own: fromOwn });
    }
    if (gained.length) {
      const costs = [{ id: ownItem, num: ownUsed }];
      if (universalUsed > 0) costs.push({ id: universalItem, num: universalUsed });
      if (!ledger.reserve(costs)) continue;
      // 一次升星只涨一星，所以每颗星都是一条独立请求，执行时也会一条一条发。
      for (const entry of gained) {
        // universal=true 表示允许用万能碎片补差额，和客户端里那个"自动兑换"开关等价。
        steps.push({
          kind: 'star',
          heroId: hero.heroId,
          from: entry.to - 1,
          to: entry.to,
          count: 1,
          fragments: entry.fragments,
          own: entry.own,
          total,
          universal: entry.own < entry.fragments,
          costs: resourceCosts([{ id: ownItem, num: entry.own },
            ...(entry.fragments > entry.own ? [{ id: universalItem, num: entry.fragments - entry.own }] : [])]),
        });
      }
      if (usedUniversal) notes.push(`${hero.heroId}: 升星共用掉 ${universalUsed} 个万能碎片`);
    }
  }

  // 技能：升星会抬升技能等级上限，所以升星计划先执行，这里按升星后的星级算。
  const starAfter = new Map();
  for (const hero of heroes) starAfter.set(hero.heroId, hero.star ?? 0);
  for (const step of steps) if (step.kind === 'star') starAfter.set(step.heroId, step.to);

  const bookLeft = (item) => ledger.available(item);

  if (enabledKinds.has('skill')) for (const hero of picked) {
    const cfg = heroById.get(hero.heroId);
    if (!cfg) continue;
    const levels = hero.skillLevels ?? [];
    const star = starAfter.get(hero.heroId) ?? 0;
    for (let slot = 0; slot < Math.max(levels.length, 4); slot += 1) {
      if (slots !== null && !slots.includes(slot)) continue;
      let cur = levels[slot] ?? 0;
      const initialLevel = cur;
      // 等级 0 表示这个技能还没解锁，面板上直接不给升，这里也不排。
      if (cur === 0) continue;
      // 上限取自最高星级那一行（面板用的是 maxStarCfg），不是当前星级那一行。
      const cap = starByStar.get(maxStar)?.maxSkillLevel?.[slot] ?? 0;
      // 每次只升一级：目标是 cur+1，消耗取 HeroSkillUpCfg[品质_目标等级].costArr[槽位]
      while (cur < cap && (!atomic || cur === initialLevel)) {
        const target = cur + 1;
        // 面板条件：英雄星级 >= heroStarBySkillLv(槽位, 目标等级)，不满足就点不动。
        const needStar = skillLevelMinStar(config, slot, target);
        if (needStar === null || star < needStar) {
          notes.push(`${hero.heroId} 技能${slot + 1}: 升到 ${target} 级需要 ${needStar ?? '?'} 星，当前 ${star} 星`);
          break;
        }
        const row = skillUp.get(`${cfg.quality}_${target}`);
        const cost = row?.costArr?.[slot];
        if (!Array.isArray(cost) || cost.length !== 2) break;
        const [item, rawNum] = cost;
        const num = safeResourceQuantity(rawNum);
        if (!ledger.canReserve([[item, num]])) {
          notes.push(`${hero.heroId} 技能${slot + 1}: 还差 ${item} ${num - bookLeft(item)}`);
          break;
        }
        ledger.reserve([[item, num]]);
        steps.push({ kind: 'skill', heroId: hero.heroId, slot, from: cur, to: target, item, num, costs: [{ id: item, num }] });
        cur = target;
      }
    }
  }

  return { steps, notes, maxLevel, maxStar, reserved: [...ledger.reserved].map(([id, n]) => [id, n - (reservedBefore.get(id) ?? 0)]).filter(([, n]) => n > 0) };
}

// 逐条执行。HeroLevelUpRequest 一次只升一级，服务端没有批量接口，所以英雄升级会被展开成多次请求。
export async function runHeroPlan(client, protocol, plan, {
  allowMutate = false, timeout = 15000, budget = { ledger: null }, signal, stop, onStep,
} = {}) {
  if (!allowMutate) throw new Error('英雄养成会改变账号状态，需要 --yes');
  const results = [];
  const blocked = new Set();
  const options = { signal, stop };
  for (const step of plan.steps) {
    const key = `${step.kind}|${step.heroId}`;
    if (blocked.has(key)) {
      const entry = operationResult('NOT_EXECUTED', { step, skipped: true, error: '同类操作已被服务端拒绝，跳过' });
      results.push(entry); onStep?.(entry); continue;
    }
    const calls = step.kind === 'level' ? step.count : 1;
    for (let i = 0; i < calls; i += 1) {
      let entry;
      try {
        assertExecutionActive(client, options);
        const { request, body } = buildHeroAction(step);
        if (!request || !protocol[request]) throw Object.assign(new Error('英雄动作协议或类型缺失'), { code: 'NOT_EXECUTED' });
        try { assertPaymentAllowed({ request, body, costs: step.costs }); }
        catch (error) { throw Object.assign(error, { code: 'NOT_EXECUTED' }); }
        const costs = step.kind === 'level' ? step.callCosts?.[i] ?? (calls === 1 ? step.costs : null) : step.costs;
        await validateResources(client, protocol, costs, {
          timeout, budget, signal, stop, assertActive: () => assertExecutionActive(client, options),
        });
        assertExecutionActive(client, options);
        const outcome = await awaitExecution(sendHero(client, protocol, step, body, timeout, { signal }), client, options);
        entry = operationResult(outcome.response ? 'SUCCESS' : 'UNKNOWN', { step, ...outcome });
      } catch (error) {
        const status = executionOutcome(error);
        if (status === 'REJECTED') blocked.add(key);
        entry = operationResult(status, { step, error: error.message });
      }
      results.push(entry); onStep?.(entry);
      if (stopsExecution(entry)) return results;
      if (!entry.ok) break;
      try { await executionDelay(80, options); }
      catch (error) { results.push(operationResult(executionOutcome(error), { step, error: error.message })); return results; }
    }
  }
  return results;
}

export function buildHeroBody(step) {
  if (step.kind === 'level') return { heroId: step.heroId };
  if (step.kind === 'star') return { heroId: step.heroId, universal: step.universal !== false };
  if (step.kind === 'skill') return { heroId: step.heroId, skillIdx: step.slot + 1 };
  throw new Error(`unknown hero step: ${step.kind}`);
}

// Shared request construction only: operation adapters must use their existing
// generic executor rather than nesting this module's legacy transport loop.
export function buildHeroAction(step) {
  const requests = { level: 'HeroLevelUpRequest', star: 'HeroStarUpRequest', skill: 'HeroSkillLevelUpRequest' };
  if (!Object.hasOwn(requests, step.kind)) throw Object.assign(new Error(`unknown hero step: ${step.kind}`), { code: 'NOT_EXECUTED' });
  const request = requests[step.kind];
  return { request, response: step.kind === 'star' ? 'HeroStarUpResponse' : null, body: buildHeroBody(step) };
}

// 只有 HeroStarUpRequest 在协议表里有配套的 Response，升级和技能走推送（SCUpdateHero），
// 短观察窗口无法确认最终提交；未观察到拒绝仍返回 UNKNOWN 并停止后续写操作。
async function sendHero(client, protocol, step, body, timeout, { signal } = {}) {
  const { request, response: responseType } = buildHeroAction(step);
  if (!protocol[request]) throw Object.assign(new Error(`protocol has no type ${request}`), { code: 'NOT_EXECUTED' });
  if (request === 'HeroStarUpRequest') {
    if (!protocol.HeroStarUpResponse) throw Object.assign(new Error('protocol has no type HeroStarUpResponse'), { code: 'NOT_EXECUTED' });
    const response = await client.request(request, body, responseType, timeout, { mutate: true, signal });
    return { response: 'HeroStarUpResponse', body: response };
  }
  const watched = await client.sendWatch(request, body, { window: 300, signal });
  return { response: null, body: watched };
}

export function formatHeroPlan(plan) {
  const lines = [];
  for (const step of plan.steps) {
    if (step.kind === 'level') lines.push(`升级 ${step.heroId} lv${step.from} -> lv${step.to} (${step.count} 级, ${step.exp} 经验)`);
    else if (step.kind === 'star') lines.push(`升星 ${step.heroId} ${step.from} -> ${step.to} 星 (${step.fragments} 碎片${step.universal ? '，含万能' : ''})`);
    else lines.push(`技能 ${step.heroId} 第${step.slot + 1}技能 ${step.from} -> ${step.to} (${step.item} x${step.num})`);
  }
  for (const note of plan.notes) lines.push(`跳过 ${note}`);
  return lines.join('\n');
}
