import test from 'node:test';
import assert from 'node:assert/strict';
import { toSnapshotJson, collectState, ENTRY_QUERIES } from '../src/game.mjs';
import { redact } from '../src/security.mjs';

const long = (decimal, unsigned = false) => {
  const bits = BigInt.asUintN(64, BigInt(decimal));
  return { low: Number(BigInt.asIntN(32, bits)), high: Number(BigInt.asIntN(32, bits >> 32n)), unsigned };
};

test('raw int64 signed and unsigned boundaries serialize exactly without Number rounding', () => {
  for (const [decimal, unsigned, expected] of [
    ['0', false, 0], ['-1', false, -1], ['9007199254740991', false, 9007199254740991],
    ['-9007199254740991', false, -9007199254740991],
    ['9007199254740993', false, '9007199254740993'],
    ['-9007199254740993', false, '-9007199254740993'],
    ['9223372036854775807', false, '9223372036854775807'],
    ['-9223372036854775808', false, '-9223372036854775808'],
    ['18446744073709551615', true, '18446744073709551615'],
  ]) assert.equal(JSON.parse(JSON.stringify(toSnapshotJson(long(decimal, unsigned)))), expected);
});

test('raw JSON copying preserves nested values, does not execute toJSON, and is prototype safe', () => {
  const input = {
    rows: [long('9223372036854775807'), { amount: 18446744073709551615n }],
    at: new Date('2026-11-10T00:00:00Z'), ordinary: { low: 1, high: 2, label: 'business coordinates' },
    invalid: { low: 1.5, high: 0 }, token: 'fixture-int64-token', sign: 'fixture-int64-sign',
    toJSON() { throw Error('must not execute'); },
  };
  Object.defineProperty(input, '__proto__', { value: { preserved: true }, enumerable: true });
  input.self = input;
  const copied = toSnapshotJson(input);
  assert.equal(copied.rows[0], '9223372036854775807');
  assert.equal(copied.rows[1].amount, '18446744073709551615');
  assert.equal(copied.at, '2026-11-10T00:00:00.000Z');
  assert.deepEqual(copied.ordinary, input.ordinary); assert.deepEqual(copied.invalid, input.invalid);
  assert.equal(copied.self, '[Circular]');
  assert.equal(Object.getPrototypeOf(copied), Object.prototype);
  assert.equal(Object.hasOwn(copied, '__proto__'), true);
  assert.deepEqual(copied.__proto__, { preserved: true });
  assert.doesNotThrow(() => JSON.stringify(copied));
  assert.doesNotThrow(() => JSON.stringify(redact(copied)));
  assert.doesNotMatch(JSON.stringify(redact(copied)), /fixture-int64-token|fixture-int64-sign/);
  assert.equal(typeof input.rows[0], 'object'); assert.equal(typeof input.rows[1].amount, 'bigint');
});

test('one existing collection stores exact raw before observers run while retaining the business snapshot', async () => {
  const protocol = Object.fromEntries(ENTRY_QUERIES.flatMap(({ name }) => [[name, {}], [name.replace(/Request$/, 'Response'), {}]]));
  const calls = [];
  const result = await collectState({
    async request(name) {
      calls.push(name);
      return name === 'AllItemRequest' ? { items: [{ itemId: 'fixture', num: long('9007199254740993') }] } : {};
    },
  }, protocol, { onResult(name, body) { if (name === 'AllItemRequest') body.items[0].num.low = 0; } });
  assert.equal(calls.length, 48); assert.equal(new Set(calls).size, 48);
  assert.equal(result.raw.AllItemRequest.items[0].num, '9007199254740993');
  assert.equal(typeof result.ok.AllItemRequest.items[0].num, 'number');
  assert.equal(result.outcomes.AllItemRequest.status, 'SUCCESS');
  const exported = JSON.parse(JSON.stringify(redact(result)));
  assert.equal(exported.raw.AllItemRequest.items[0].num, '9007199254740993');
});

test('failed and unexecuted queries cannot leave raw successful data', async () => {
  const protocol = { AllItemRequest: {}, AllItemResponse: {} };
  const result = await collectState({ async request() { throw Error('fixture failure'); } }, protocol);
  assert.equal(result.outcomes.AllItemRequest.status, 'FAILED');
  assert.equal(result.outcomes.AllHeroRequest.status, 'NOT_EXECUTED');
  assert.deepEqual(result.raw, {});
});
