import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.mjs';
import { museumView, planMuseum, surveyMuseum } from '../src/museum.mjs';

const config = loadConfig({ file: new URL('../work/cdn/config_cn_pack.json', import.meta.url) });
const names = ['MuseumInfo', 'AllHero', 'AllItem', 'AllResource', 'AllAntique', 'MuseumStartExplore'];
const protocol = Object.fromEntries(names.flatMap(name => [[name + 'Request', {}], [name + 'Response', {}]]));
const stage = (stageId = 1, cost = [{ id: '小麦', num: 2 }, { id: 'GOLD', num: 3 }], endTime = 0) => ({
  stageId, progress: 0, expedition: { startTime: 0, endTime, heroIds: [], cost: { asset: cost }, conditionId: config.tables.MuseumExpeditionConditionCfg.data[0].conditionId, factor: 1 },
});
async function read({ parameters = { factor: 2 }, level = 40, stages = [stage()], items = [{ itemId: '小麦', num: 1 }], resources = [{ res: 3, amount: 7 }], ...options } = {}) {
  const responses = {
    MuseumInfoRequest: { exploreStages: stages, exhibitions: [{ exhibitionId: 1, level: 1 }], uncollectedRevenue: 0 },
    AllHeroRequest: { heroes: [{ heroId: 'A' }, { heroId: 'B' }, { heroId: 'C' }, { heroId: 'D' }] },
    AllItemRequest: items === null ? null : { items },
    AllResourceRequest: resources === null ? null : { list: resources },
    AllAntiqueRequest: { antiques: [] },
  };
  const requests = [];
  const client = {
    connected: true,
    async request(name, body, type) {
      assert.equal(type, name.replace(/Request$/, 'Response'));
      assert.deepEqual(body, {});
      requests.push(name);
      assert.ok(Object.hasOwn(responses, name), name + ' is not a survey request');
      return structuredClone(responses[name]);
    },
  };
  const player = Object.hasOwn(options, 'player') ? options.player : { id: '1', level };
  return { facts: await surveyMuseum(client, protocol, { player, parameters }), requests };
}
const project = (facts, options = {}) => museumView(facts, { config, ...options }).explorationMaterials;

test('C142 reports one idle expedition independently of hero selection and write switches', async () => {
  const { facts, requests } = await read();
  const expected = {
    factor: 2, reason: null, stages: [{
      stageId: 1, status: 'SHORTAGE', reason: null,
      materials: [{ id: '小麦', required: 4, have: 1, missing: 3, reserve: 0, missingWithReserve: 3 }, { id: 'GOLD', required: 6, have: 7, missing: 0, reserve: 0, missingWithReserve: 0 }],
    }],
  };
  assert.deepEqual(project(facts), expected);
  const reserved = structuredClone(expected);
  Object.assign(reserved.stages[0].materials[1], { reserve: 6, missingWithReserve: 5 });
  assert.deepEqual(project(facts, { moduleConfig: { enabled: true, exploration: true, stockItemIds: ['GOLD'], stockReserveQuantities: [6] } }), reserved);
  assert.equal(museumView(facts, { config }).candidates.length, 0);
  assert.deepEqual(requests, ['MuseumInfoRequest','AllHeroRequest','AllItemRequest','AllResourceRequest','AllAntiqueRequest']);
});

test('C142 uses exact scaled aggregated cost and distinguishes known zero from missing inventory authority', async () => {
  const options = { stages: [stage(1, [{ id: '小麦', num: 2 }, { id: '小麦', num: 1 }, { id: 'GOLD', num: 2 }])] };
  const { facts } = await read({ ...options, items: [] });
  assert.deepEqual(project(facts).stages[0].materials, [{ id: '小麦', required: 6, have: 0, missing: 6, reserve: 0, missingWithReserve: 6 }, { id: 'GOLD', required: 4, have: 7, missing: 0, reserve: 0, missingWithReserve: 0 }]);
  for (const patch of [{ items: null }, { resources: null }, { items: [{ itemId: 'GOLD', num: 10 }] }, { items: [{ itemId: '小麦', num: -1 }] }]) {
    const { facts: unknown } = await read({ ...options, ...patch });
    assert.deepEqual(project(unknown).stages[0], {
      stageId: 1, status: 'UNKNOWN', reason: 'INVENTORY_UNKNOWN',
      materials: [{ id: '小麦', required: 6, have: null, missing: null, reserve: 0, missingWithReserve: null }, { id: 'GOLD', required: 4, have: null, missing: null, reserve: 0, missingWithReserve: null }],
    });
  }
});

test('C142 never reuses an active expedition, a locked factor, or unobserved costs as a future quote', async () => {
  const cases = [
    [{ stages: [stage(1, undefined, 100)] }, 'NOT_APPLICABLE', 'EXPEDITION_ALREADY_STARTED'],
    [{ stages: [stage(2)] }, 'NOT_APPLICABLE', 'STAGE_LOCKED'],
    [{ level: 29 }, 'UNKNOWN', 'TIME_FACTOR_LOCKED_OR_UNKNOWN'],
    [{ parameters: { factor: 4 } }, 'UNKNOWN', 'TIME_FACTOR_LOCKED_OR_UNKNOWN'],
    [{ stages: [stage(1, [])] }, 'UNKNOWN', 'AUTHORITATIVE_EXPEDITION_COST_UNKNOWN'],
    [{ stages: [stage(1, [{ id: 'GOLD', num: Number.MAX_SAFE_INTEGER }])] }, 'UNKNOWN', 'AUTHORITATIVE_EXPEDITION_COST_UNKNOWN'],
  ];
  for (const [options, status, reason] of cases) {
    const { facts } = await read(options);
    assert.deepEqual(project(facts).stages.map(row => [row.status,row.reason,row.materials]), [[status, reason, []]]);
  }
  for (const [options, reason] of [[{ stages: null }, 'EXPEDITION_STATE_UNKNOWN'], [{ stages: [stage(),stage()] }, 'EXPEDITION_STATE_UNKNOWN'], [{ parameters: { stageId: 3 } }, 'STAGE_NOT_OBSERVED'], [{ player: null }, 'PLAYER_IDENTITY_UNKNOWN']]) {
    const { facts } = await read(options);
    const result = project(facts);
    assert.equal(result.reason, reason);
    assert.deepEqual(result.stages, []);
  }
});

test('C142 and the existing start plan agree on exact costs without changing reserve policy', async () => {
  const condition = config.tables.MuseumExpeditionConditionCfg.data[0];
  const parameters = { stageId: 1, factor: 2, heroIds: ['A', 'B', 'C', 'D'].slice(0, condition.heroCount) };
  const { facts } = await read({ parameters, items: [{ itemId: '小麦', num: 4 }] });
  const options = { config, moduleConfig: { enabled: true, exploration: true } };
  const trustedNow = 1800000000;
  facts.now = trustedNow;
  facts.gameTime = { reliable: true, status: 'TRUSTED', earliestMs: trustedNow * 1000, nowMs: trustedNow * 1000, latestMs: trustedNow * 1000 };
  const displayed = museumView(facts, options);
  const report = displayed.explorationMaterials.stages[0];
  assert.equal(report.status, 'AVAILABLE');
  const start = displayed.candidates.find(row => row.actionType === 'startExplore');
  assert.ok(start);
  assert.deepEqual(start.costs, report.materials.map(({ id, required }) => ({ id, num: required })));
  assert.deepEqual(planMuseum(facts, { ...options, selections: [start.actionId] }).actions.map(row => row.action.body), [{ stageId: 1, factor: 2, heroIds: parameters.heroIds }]);
  const reserve = museumView(facts, { ...options, moduleConfig: { ...options.moduleConfig, stockItemIds: ['GOLD'], stockReserveQuantities: [2] } });
  assert.equal(reserve.candidates.some(row => row.actionType === 'startExplore'), false);
  const budgetReport = reserve.explorationMaterials.stages[0];
  assert.equal(budgetReport.status, 'AVAILABLE');
  assert.deepEqual(budgetReport.materials.find(row => row.id === 'GOLD'), { id: 'GOLD', required: 6, have: 7, missing: 0, reserve: 2, missingWithReserve: 1 });
});
