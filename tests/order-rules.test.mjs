import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaultOrderRules, validateOrderRules, ORDER_RULE_TYPES, evaluateOrder, evaluateOrders } from '../src/order-rules.mjs';

const itemId = 'item/toilet-17';
const breadId = 'item/bread-42';
const forbidden = (overrides = {}) => ({ id: 'forbidden', priority: 1, type: 'ITEM_FORBIDDEN', enabled: true, params: { itemIds: [itemId] }, onFail: 'REFRESH', ...overrides });
const exp = (overrides = {}) => ({ id: 'experience', priority: 2, type: 'MIN_EXPERIENCE', enabled: true, params: { value: 700, operator: 'GT' }, onFail: 'KEEP', ...overrides });
const rules = (...entries) => ({ version: 1, enabled: true, rules: entries });
const order = (overrides = {}) => ({ index: 0, workerId: 'resident-0', requirements: [{ id: breadId, num: 2 }], rewardExp: 820, ...overrides });
const inventory = () => new Map([[itemId, 5], [breadId, 8]]);

test('safe default is disabled and returns independent copies without submission advice', () => {
  const a = defaultOrderRules(), b = defaultOrderRules();
  assert.deepEqual(a, { version: 1, enabled: false, rules: [] });
  a.rules.push(forbidden()); assert.deepEqual(b.rules, []);
  const result = evaluateOrder(order(), inventory(), b);
  assert.equal(result.decision, 'NEEDS_REVIEW'); assert.equal(result.inventory.status, 'SKIPPED');
});

test('configuration canonicalization sorts by priority and never aliases editable input', () => {
  const input = rules(exp(), forbidden());
  const result = validateOrderRules(input);
  assert.deepEqual(result.rules.map(({ id }) => id), ['forbidden', 'experience']);
  result.rules[0].params.itemIds.push('new-id');
  assert.deepEqual(input.rules[1].params.itemIds, [itemId]);
  assert.deepEqual(input.rules.map(({ id }) => id), ['experience', 'forbidden']);
  assert.deepEqual(ORDER_RULE_TYPES.map(({ type }) => type), ['ITEM_FORBIDDEN', 'ITEM_REQUIRED', 'MIN_EXPERIENCE', 'MAX_ITEM_COUNT', 'INVENTORY_AVAILABLE']);
});

test('unsupported versions, rule types, duplicate ids/priorities and invalid parameters fail closed', () => {
  const invalid = [
    null, [], {}, { ...rules(), version: 2 }, { ...rules(), enabled: 1 },
    rules(forbidden(), forbidden({ priority: 2 })),
    rules(forbidden(), exp({ priority: 1 })),
    rules(forbidden({ type: 'MIN_GOLD' })),
    rules(forbidden({ onFail: 'SUBMIT' })),
    rules(forbidden({ params: { itemIds: [] } })),
    rules(forbidden({ params: { itemIds: [17] } })),
    rules(exp({ params: { value: '700', operator: 'GT' } })),
    rules(exp({ params: { value: Number.MAX_SAFE_INTEGER + 1, operator: 'GT' } })),
    rules(exp({ params: { value: 700, operator: 'EQ' } })),
    rules(forbidden({ params: { itemIds: [itemId], action: 'DenyOrderRequest' } })),
    { ...rules(forbidden()), injected: true },
  ];
  for (const config of invalid) {
    assert.throws(() => validateOrderRules(config), { statusCode: 400 });
    const result = evaluateOrder(order(), inventory(), config);
    assert.equal(result.decision, 'NEEDS_REVIEW'); assert.equal(result.inventory.status, 'SKIPPED');
  }
});

test('forbidden item passes using exact item IDs rather than matching a display name', () => {
  const result = evaluateOrder(order(), inventory(), rules(forbidden()));
  assert.equal(result.ruleResults[0].status, 'PASS'); assert.equal(result.decision, 'RECOMMEND_SUBMIT');
  assert.equal(result.inventory.status, 'PASS');
});

test('forbidden item fails with configured refresh advice and an explanation', () => {
  const result = evaluateOrder(order({ requirements: [{ id: itemId, num: 2 }] }), inventory(), rules(forbidden()));
  assert.equal(result.ruleResults[0].status, 'FAIL'); assert.equal(result.decision, 'RECOMMEND_REFRESH');
  assert.equal(result.firstFailedRuleId, 'forbidden');
  assert.match(result.ruleResults[0].explanation, /item\/toilet-17/);
  assert.equal(result.inventory.status, 'SKIPPED');
});

for (const [rewardExp, expectedStatus, expectedDecision] of [
  [701, 'PASS', 'RECOMMEND_SUBMIT'], [700, 'FAIL', 'RECOMMEND_KEEP'], [699, 'FAIL', 'RECOMMEND_KEEP'],
]) test('experience GT 700 boundary: ' + rewardExp, () => {
  const result = evaluateOrder(order({ rewardExp }), inventory(), rules(exp()));
  assert.equal(result.ruleResults[0].status, expectedStatus); assert.equal(result.decision, expectedDecision);
  assert.match(result.ruleResults[0].explanation, new RegExp(String(rewardExp)));
});

test('GTE is explicit and accepts equality rather than silently changing GT semantics', () => {
  const result = evaluateOrder(order({ rewardExp: 700 }), inventory(), rules(exp({ params: { value: 700, operator: 'GTE' } })));
  assert.equal(result.ruleResults[0].status, 'PASS');
});

test('priority controls the first failure and following rules are not evaluated', () => {
  const result = evaluateOrder(order({ requirements: [{ id: itemId, num: 1 }], rewardExp: 1 }), inventory(), rules(exp(), forbidden()));
  assert.deepEqual(result.ruleResults.map(({ id, status }) => [id, status]), [['forbidden', 'FAIL'], ['experience', 'SKIPPED']]);
  assert.equal(result.decision, 'RECOMMEND_REFRESH');
  const reversed = evaluateOrder(order({ requirements: [{ id: itemId, num: 1 }], rewardExp: 1 }), inventory(), rules(exp({ priority: 1 }), forbidden({ priority: 2 })));
  assert.equal(reversed.firstFailedRuleId, 'experience'); assert.equal(reversed.decision, 'RECOMMEND_KEEP');
});

test('disabled rules are skipped while enabled following rules and final inventory still run', () => {
  const result = evaluateOrder(order({ requirements: [{ id: itemId, num: 1 }] }), inventory(), rules(forbidden({ enabled: false }), exp()));
  assert.deepEqual(result.ruleResults.map(({ status }) => status), ['SKIPPED', 'PASS']);
  assert.equal(result.decision, 'RECOMMEND_SUBMIT');
});

test('globally disabled strategy skips every rule and cannot recommend submit or refresh', () => {
  const result = evaluateOrder(order({ requirements: [{ id: itemId, num: 1 }] }), inventory(), { ...rules(forbidden(), exp()), enabled: false });
  assert.deepEqual(result.ruleResults.map(({ status }) => status), ['SKIPPED', 'SKIPPED']); assert.equal(result.decision, 'NEEDS_REVIEW');
});

for (const [onFail, decision] of [['KEEP', 'RECOMMEND_KEEP'], ['REFRESH', 'RECOMMEND_REFRESH'], ['REVIEW', 'NEEDS_REVIEW']]) {
  test('first failure respects independent onFail ' + onFail, () => {
    const result = evaluateOrder(order({ requirements: [{ id: itemId, num: 1 }] }), inventory(), rules(forbidden({ onFail })));
    assert.equal(result.decision, decision); assert.equal(result.firstFailedRuleId, 'forbidden');
  });
}

test('required item means all selected IDs must be present and returns the missing IDs', () => {
  const config = rules(forbidden({ type: 'ITEM_REQUIRED', params: { itemIds: [breadId, itemId] }, onFail: 'KEEP' }));
  const failed = evaluateOrder(order(), inventory(), config);
  assert.equal(failed.ruleResults[0].status, 'FAIL'); assert.match(failed.ruleResults[0].explanation, /item\/toilet-17/);
  const passed = evaluateOrder(order({ requirements: [{ id: breadId, num: 1 }, { id: itemId, num: 1 }] }), inventory(), config);
  assert.equal(passed.ruleResults[0].status, 'PASS');
});

test('maximum item count uses total duplicate requirements and independent final inventory does too', () => {
  const duplicate = order({ requirements: [{ id: breadId, num: 3 }, { id: breadId, num: 2 }] });
  const limited = evaluateOrder(duplicate, inventory(), rules(forbidden({ type: 'MAX_ITEM_COUNT', params: { itemId: breadId, value: 4 }, onFail: 'KEEP' })));
  assert.equal(limited.ruleResults[0].status, 'FAIL'); assert.match(limited.ruleResults[0].explanation, /需求合计 5/);
  const stock = evaluateOrder(duplicate, new Map([[breadId, 4]]), rules());
  assert.equal(stock.decision, 'RECOMMEND_KEEP');
  assert.deepEqual(stock.inventory.missing, [{ id: breadId, required: 5, available: 4, missing: 1 }]);
});

test('final inventory succeeds at exact quantity and insufficient inventory recommends keep', () => {
  assert.equal(evaluateOrder(order(), new Map([[breadId, 2]]), rules()).decision, 'RECOMMEND_SUBMIT');
  const insufficient = evaluateOrder(order(), new Map([[breadId, 1]]), rules());
  assert.equal(insufficient.decision, 'RECOMMEND_KEEP'); assert.equal(insufficient.inventory.status, 'FAIL');
  assert.deepEqual(insufficient.inventory.missing, [{ id: breadId, required: 2, available: 1, missing: 1 }]);
  assert.match(insufficient.explanation.join(' '), /库存不足/);
  assert.equal(evaluateOrder(order(), new Map(), rules()).decision, 'RECOMMEND_KEEP');
});

test('explicit inventory rule uses its own failure action before independent final inventory', () => {
  const config = rules(forbidden({ type: 'INVENTORY_AVAILABLE', params: {}, onFail: 'REVIEW' }));
  const result = evaluateOrder(order(), new Map(), config);
  assert.equal(result.ruleResults[0].status, 'FAIL'); assert.equal(result.decision, 'NEEDS_REVIEW');
  assert.equal(result.inventory.status, 'SKIPPED');
  const enough = evaluateOrder(order(), inventory(), config);
  assert.equal(enough.ruleResults[0].status, 'PASS'); assert.equal(enough.inventory.status, 'PASS');
});

test('unknown experience stops later rules regardless of refresh onFail', () => {
  for (const rewardExp of [null, undefined, '820', NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const result = evaluateOrder(order({ rewardExp }), inventory(), rules(exp({ priority: 1, onFail: 'REFRESH' }), forbidden({ priority: 2 })));
    assert.equal(result.decision, 'NEEDS_REVIEW'); assert.equal(result.ruleResults[0].status, 'UNKNOWN');
    assert.equal(result.ruleResults[1].status, 'SKIPPED'); assert.equal(result.firstFailedRuleId, null);
  }
});

test('unknown inventory never becomes zero or a successful submission', () => {
  for (const stock of [null, {}, new Map([[breadId, null]]), new Map([[breadId, '5']]), new Map([[breadId, -1]]), new Map([[breadId, Number.MAX_SAFE_INTEGER + 1]])]) {
    const result = evaluateOrder(order(), stock, rules());
    assert.equal(result.decision, 'NEEDS_REVIEW'); assert.equal(result.inventory.status, 'UNKNOWN');
    const withRule = evaluateOrder(order(), stock, rules(forbidden({ type: 'INVENTORY_AVAILABLE', params: {} })));
    assert.equal(withRule.ruleResults[0].status, 'UNKNOWN'); assert.equal(withRule.decision, 'NEEDS_REVIEW');
  }
});

test('missing or malformed order input produces UNKNOWN rather than a free successful order', () => {
  const invalid = [
    null, {}, order({ index: null }), order({ index: -1 }), order({ requirements: null }), order({ requirements: [] }),
    order({ requirements: [{ id: '', num: 2 }] }), order({ requirements: [{ id: breadId }] }),
    order({ requirements: [{ id: breadId, num: 0 }] }), order({ requirements: [{ id: breadId, num: '2' }] }),
    order({ requirements: [{ id: breadId, num: Number.MAX_SAFE_INTEGER }, { id: breadId, num: 1 }] }),
  ];
  for (const item of invalid) {
    const result = evaluateOrder(item, inventory(), rules(forbidden()));
    assert.equal(result.decision, 'NEEDS_REVIEW'); assert.equal(result.ruleResults[0].status, 'UNKNOWN');
    assert.equal(evaluateOrder(item, inventory(), rules()).inventory.status, 'UNKNOWN');
  }
});

test('four-order batch preserves order identity and evaluates independently without reserving stock', () => {
  const inputs = [order(), order({ index: 1, rewardExp: 700 }), order({ index: 2, requirements: [{ id: itemId, num: 1 }] }), order({ index: 3, requirements: [{ id: breadId, num: 20 }] })];
  const result = evaluateOrders(inputs, inventory(), rules(forbidden(), exp()));
  assert.deepEqual(result.map(({ orderId }) => orderId), [0, 1, 2, 3]);
  assert.deepEqual(result.map(({ decision }) => decision), ['RECOMMEND_SUBMIT', 'RECOMMEND_KEEP', 'RECOMMEND_REFRESH', 'RECOMMEND_KEEP']);
  const shared = evaluateOrders([order(), order({ index: 1 })], new Map([[breadId, 2]]), rules());
  assert.deepEqual(shared.map(({ decision }) => decision), ['RECOMMEND_SUBMIT', 'RECOMMEND_SUBMIT']);
  assert.deepEqual(evaluateOrders([], inventory(), rules()), []);
  assert.equal(evaluateOrders(null, inventory(), rules())[0].decision, 'NEEDS_REVIEW');
});

test('same input has deterministic output and orders, rules and inventory stay unchanged', () => {
  const inputs = [order(), order({ index: 1, requirements: [{ id: itemId, num: 1 }] })], stock = inventory(), config = rules(forbidden(), exp());
  const before = structuredClone({ inputs, stock, config });
  const a = evaluateOrders(inputs, stock, config), b = evaluateOrders(inputs, stock, config);
  assert.deepEqual(a, b); assert.deepEqual({ inputs, stock, config }, before);
  Object.freeze(inputs[0].requirements[0]); Object.freeze(inputs[0].requirements); Object.freeze(inputs[0]); Object.freeze(inputs);
  assert.doesNotThrow(() => evaluateOrders(inputs, stock, config));
});

test('evaluator has no action/network imports and does not consult ambient network or clock', () => {
  const source = fs.readFileSync(new URL('../src/order-rules.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s*import\s/m);
  const previousFetch = globalThis.fetch, previousNow = Date.now;
  let fetches = 0;
  globalThis.fetch = () => { fetches++; throw Error('network forbidden'); };
  Date.now = () => { throw Error('clock forbidden'); };
  try { assert.equal(evaluateOrder(order(), inventory(), rules(forbidden(), exp())).decision, 'RECOMMEND_SUBMIT'); }
  finally { globalThis.fetch = previousFetch; Date.now = previousNow; }
  assert.equal(fetches, 0);
});
