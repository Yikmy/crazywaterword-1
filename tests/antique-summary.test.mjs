import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodec } from '../src/codec.mjs';
import { loadConfig } from '../src/config.mjs';
import { loadProtocol } from '../src/proto.mjs';
import {
  ANTIQUE_SUMMARY_REQUEST, ANTIQUE_SUMMARY_RESPONSE, antiqueSummaryView, parseAntiqueSummary, surveyAntiqueSummary,
} from '../src/antique-summary.mjs';

const protocol = loadProtocol();
const codec = createCodec(protocol);
const attr = protocol.EnhanceAttr.attriGain_healthPoint_base;
const request = (name, body) => codec.decode(codec.encode(name, 0, body));
const attribute = (value, scope = {}) => ({ ...scope, attrValue: { attr, value } });
const body = (items = [], effects = []) => ({ items, effects });
const fromWire = response => parseAntiqueSummary(request(ANTIQUE_SUMMARY_RESPONSE, response).body, { protocol });

test('PRO-007 reads exactly one typed request and renders independent scopes with exact values', async () => {
  const config = loadConfig({ file: new URL('../work/cdn/config_cn_pack.json', import.meta.url) });
  const calls = [];
  const controller = new AbortController();
  const client = {
    connected: true,
    async request(name, payload, response, timeout, options) {
      calls.push({ name, payload, response, timeout, options });
      assert.equal(request(name, payload).name, ANTIQUE_SUMMARY_REQUEST);
      return request(response, body([
        attribute(0),
        attribute(31.125, { heroCamp: '阵营A', heroProf: '' }),
        attribute(4.75, { heroProf: '射手' }),
      ], [
        { effectId: '生产速度提高', value: 0.125 },
        { effectId: '新效果', value: -1.25 },
      ])).body;
    },
  };

  const facts = await surveyAntiqueSummary(client, protocol, { signal: controller.signal, timeout: 123 });
  assert.deepEqual(calls, [{
    name: 'AntiqueAttrSummaryRequest', payload: {}, response: 'AntiqueAttrSummaryResponse', timeout: 123,
    options: { signal: controller.signal },
  }]);
  assert.deepEqual(antiqueSummaryView(facts, { config }), {
    status: 'AVAILABLE', reason: null,
    global: [{ attr, value: 0, name: '生命', viewType: '数值' }],
    camps: [{ id: '阵营A', name: '兄弟会', attributes: [{ attr, value: 31.125, name: '生命', viewType: '数值' }] }],
    professions: [{ id: '射手', name: '射手', attributes: [{ attr, value: 4.75, name: '生命', viewType: '数值' }] }],
    effects: [
      { effectId: '生产速度提高', value: 0.125, description: '生产速度', viewType: '百分比' },
      { effectId: '新效果', value: -1.25, description: null, viewType: null },
    ],
  });
  assert.deepEqual(antiqueSummaryView(facts).global, [{ attr, value: 0, name: null, viewType: null }]);
});

test('the typed empty summary is known, but a missing optional protobuf value is not a zero', () => {
  assert.deepEqual(antiqueSummaryView(fromWire(body())), {
    status: 'AVAILABLE', reason: null, global: [], camps: [], professions: [], effects: [],
  });
  assert.equal(fromWire(body([{ attrValue: { attr } }])).reason, 'INVALID_RESPONSE');
  assert.equal(fromWire(body([{ attrValue: { value: 0 } }])).reason, 'INVALID_RESPONSE');
  assert.equal(fromWire(body([attribute(Infinity)])).reason, 'INVALID_RESPONSE');
});

test('unsupported scopes, malformed rows, and repeated summary keys produce no partial view', () => {
  for (const [response, reason] of [
    [null, 'INVALID_RESPONSE'],
    [{ items: [] }, 'INVALID_RESPONSE'],
    [body([attribute(1, { heroCamp: null })]), 'INVALID_RESPONSE'],
    [body([attribute(1, { heroProf: 1 })]), 'INVALID_RESPONSE'],
    [body([attribute(1, { heroCamp: ' ' })]), 'INVALID_RESPONSE'],
    [body([attribute('1')]), 'INVALID_RESPONSE'],
    [body([{ attrValue: { attr, value: 1, rating: 0.5 } }]), 'INVALID_RESPONSE'],
    [body([attribute(1, { heroCamp: '阵营A', heroProf: '射手' })]), 'UNSUPPORTED_ATTRIBUTE_SCOPE'],
    [body([attribute(1), attribute(2, { heroCamp: '' })]), 'DUPLICATE_ATTRIBUTE'],
    [body([attribute(1, { heroCamp: '阵营A' }), attribute(2, { heroCamp: '阵营A' })]), 'DUPLICATE_ATTRIBUTE'],
    [body([attribute(1)], [{ effectId: 'x', value: 1 }, { effectId: 'x', value: 2 }]), 'DUPLICATE_EFFECT'],
  ]) {
    assert.deepEqual(antiqueSummaryView(parseAntiqueSummary(response, { protocol })), {
      status: 'UNKNOWN', reason, global: [], camps: [], professions: [], effects: [],
    });
  }
});

test('missing protocol, failed reads and cancellation cannot show a successful empty summary', async () => {
  let reads = 0;
  const client = {
    connected: true,
    async request() { reads += 1; throw new Error('test transport detail'); },
  };
  assert.equal((await surveyAntiqueSummary(client, {})).reason, 'PROTOCOL_UNAVAILABLE');
  assert.equal(reads, 0);
  assert.equal((await surveyAntiqueSummary(client, protocol)).reason, 'READ_FAILED');
  assert.equal(reads, 1);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(surveyAntiqueSummary(client, protocol, { signal: controller.signal }), { code: 'CANCELLED' });
  assert.equal(reads, 1);
});
