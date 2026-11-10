import test from 'node:test';
import assert from 'node:assert/strict';
import { collectState, ENTRY_QUERIES, ENTRY_SIGNALS, summarize, formatState } from '../src/game.mjs';
import { redact, redactText, validateCredentials } from '../src/security.mjs';
import { upsertAccount } from '../src/accounts.mjs';

const credential = (id = 'account-a') => ({ url: 'wss://example/ws', login: { eworldParams: { openId: id, token: 'private-token-a', sign: 'private-sign-a', timestamp: 1 } } });
const protocol = Object.fromEntries(ENTRY_QUERIES.flatMap(({ name }) => [[name, {}], [name.slice(0, -7) + 'Response', {}]]).concat(ENTRY_SIGNALS.map(({ name }) => [name, {}])));

test('collection is single-flight per client, reports every outcome, and never sends entry signals', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const calls = [];
  const client = { async request(name) { calls.push(name); await gate; return { marker: 'a' }; }, send() { assert.fail('entry signal must not be sent'); } };
  let firstResults = 0, secondResults = 0;
  const first = collectState(client, protocol, { onResult() { firstResults++; } });
  const second = collectState(client, protocol, { onResult() { secondResults++; } });
  assert.equal(first, second);
  release();
  const result = await first;
  assert.equal(calls.length, ENTRY_QUERIES.length);
  assert.equal(firstResults, ENTRY_QUERIES.length);
  assert.equal(secondResults, ENTRY_QUERIES.length);
  assert.equal(Object.keys(result.outcomes).length, ENTRY_QUERIES.length);
  for (const [name, outcome] of Object.entries(result.outcomes)) {
    assert.equal(outcome.status, 'SUCCESS');
    assert.equal(outcome.response, name.slice(0, -7) + 'Response');
    assert.ok(Number.isFinite(Date.parse(outcome.startedAt)));
    assert.ok(Number.isFinite(Date.parse(outcome.updatedAt)));
  }
  await collectState(client, protocol);
  assert.equal(calls.length, ENTRY_QUERIES.length * 2, 'completed collection does not freeze future refreshes');
});

test('separate account clients collect concurrently and keep state isolated', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = [];
  const make = (id) => ({ async request() { started.push(id); await gate; return { account: id }; } });
  const a = collectState(make('a'), protocol);
  const b = collectState(make('b'), protocol);
  await Promise.resolve();
  assert.ok(started.includes('a') && started.includes('b'));
  release();
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(ra.ok.AllHeroRequest.account, 'a');
  assert.equal(rb.ok.AllHeroRequest.account, 'b');
});

test('missing protocol is NOT_EXECUTED with callbacks and failure is different from empty success', async () => {
  let callbacks = 0;
  const missing = await collectState({ request() { assert.fail('must not send unknown protocol'); } }, {}, { onResult(name, body, error) { callbacks++; assert.equal(body, null); assert.ok(error); } });
  assert.equal(callbacks, ENTRY_QUERIES.length);
  assert.equal(missing.outcomes.AllHeroRequest.status, 'NOT_EXECUTED');
  const failed = summarize(missing);
  assert.equal(failed.heroes, null);
  assert.equal(failed.items, null);
  assert.equal(failed.fleets, null);
  assert.equal(failed.pets, null);
  assert.match(formatState(failed), /未知（读取失败）/);
  assert.doesNotMatch(formatState(failed), /舰队 0/);
  const empty = summarize({ ok: { AllHeroRequest: { heroes: [] } } });
  assert.equal(empty.heroes.count, 0);
  assert.equal(empty.availability.AllHeroRequest.status, 'SUCCESS');
});

test('request errors are retained safely and callback failures do not erase successes', async () => {
  const client = { login: credential().login, async request(name) {
    if (name === 'AllHeroRequest') throw new Error('rejected private-token-a with sign=private-sign-a');
    return {};
  } };
  const result = await collectState(client, protocol, { onResult() { throw new Error('view failed'); } });
  assert.equal(result.outcomes.AllHeroRequest.status, 'FAILED');
  assert.ok(result.ok.AllItemRequest);
  assert.doesNotMatch(JSON.stringify(result.failed), /private-token-a|private-sign-a/);
  assert.equal(summarize(result).heroes, null);
});

test('recursive redaction is JSON safe, immutable, and handles dates, arrays, cycles and mixed case', () => {
  const input = { nested: [{ ToKeN: 'sensitive-t', SIGN: 'sensitive-s', authorization: 'Bearer hidden', COOKIE: 'sid=private' }], loginFrameHex: 'ffee', superToken: 'dev-secret', testAccount: true, error: 'sensitive-t repeated', at: new Date('2026-11-10T00:00:00Z'), n: 8n };
  input.self = input;
  const safe = redact(input);
  const serialized = JSON.stringify(safe);
  assert.doesNotMatch(serialized, /sensitive-t|sensitive-s|Bearer hidden|sid=private|ffee|dev-secret/);
  assert.equal(input.nested[0].ToKeN, 'sensitive-t');
  assert.equal(safe.at, '2026-11-10T00:00:00.000Z');
  assert.equal(safe.n, '8');
  assert.equal(safe.self, '[Circular]');
  assert.equal(JSON.parse(serialized).nested[0].ToKeN, '[REDACTED]');
});

test('text redaction handles known secrets, URL encoding and key spellings', () => {
  const text = 'echo x+y/z and x%2By%2Fz; Token=abc; SIGN: def; super_token=ghi; loginFrameHex=ffee\nAuthorization: Bearer abc def\nCookie: sid=aaa; next=bbb';
  const safe = redactText(text, ['x+y/z']);
  assert.doesNotMatch(safe, /x\+y\/z|x%2By%2Fz|abc|def|ghi|ffee|sid=aaa|next=bbb/);
  assert.doesNotMatch(JSON.stringify(redact({ message: 'raw-private-value', other: ['raw-private-value'] }, ['raw-private-value'])), /raw-private-value/);
});

test('credential validation accepts normal login shapes and loopback fixtures', () => {
  const value = credential();
  assert.equal(validateCredentials(value), value);
  assert.doesNotThrow(() => validateCredentials({ id: 'account-a', ...value }));
  assert.doesNotThrow(() => validateCredentials({ wsUrl: 'ws://127.0.0.1:17322/ws', body: value.login }));
  assert.doesNotThrow(() => validateCredentials({ ...value, url: 'ws://[::1]/ws' }));
  assert.doesNotThrow(() => validateCredentials({ ...value, login: { eworldParams: { ...value.login.eworldParams, timestamp: { low: 1, high: 0 } } } }));
});

test('credential validation rejects developer fields, cross-account identity and missing auth before upsert', () => {
  const invalid = [
    { ...credential(), login: { ...credential().login, testAccount: false } },
    { ...credential(), nested: { SUPER_TOKEN: 'developer' } },
    { ...credential(), id: 'another-account' },
    { ...credential(), url: 'ws://external.example/ws' },
    { ...credential(), url: 'https://example/ws' },
    { ...credential(), url: 'wss://user:password@example/ws' },
    ...['openId', 'token', 'sign', 'timestamp'].map((field) => ({ ...credential(), login: { eworldParams: { ...credential().login.eworldParams, [field]: '' } } })),
  ];
  for (const value of invalid) {
    assert.throws(() => validateCredentials(value));
    const store = { version: 1, activeId: null, accounts: [] };
    assert.throws(() => upsertAccount(store, value));
    assert.deepEqual(store.accounts, []);
    assert.equal(store.activeId, null);
  }
});

test('raw capture frame aliases use the same recursive credential redaction', () => {
  const input = { rawFrameHex: 'synthetic-raw-frame', nested: [{ RAW_LOGIN_FRAME_HEX: 'synthetic-login-frame' }], note: 'synthetic-raw-frame synthetic-login-frame' };
  const output = JSON.stringify(redact(input));
  assert.doesNotMatch(output, /synthetic-raw-frame|synthetic-login-frame/);
  assert.doesNotMatch(redactText('rawFrameHex=synthetic-raw-frame RAW_LOGIN_FRAME_HEX=synthetic-login-frame'), /synthetic-raw-frame|synthetic-login-frame/);
});


test('text redaction removes complete prefixed authorization and cookie header values', () => {
  const input = '[upstream] Authorization: Bearer prefixed-bearer-secret\n' +
    '[request] Cookie: sid=prefixed-cookie-secret; next=prefixed-next-secret\r\n' +
    '[response] Set-Cookie: session=prefixed-set-cookie-secret; Path=/; HttpOnly';
  const safe = redactText(input);
  assert.doesNotMatch(safe, /prefixed-bearer-secret|prefixed-cookie-secret|prefixed-next-secret|prefixed-set-cookie-secret|Bearer|HttpOnly/);
  assert.equal(safe, '[upstream] Authorization: [REDACTED]\n[request] Cookie: [REDACTED]\r\n[response] Set-Cookie: [REDACTED]');
  assert.equal(redactText('Authorization: Bearer standalone-secret'), 'Authorization: [REDACTED]');
  assert.equal(redactText('Cookie: sid=first-secret; next=second-secret'), 'Cookie: [REDACTED]');
  assert.doesNotMatch(JSON.stringify(redact({ error: input })), /prefixed-bearer-secret|prefixed-cookie-secret|prefixed-next-secret|prefixed-set-cookie-secret/);
});

test('known secret redaction tolerates unpaired Unicode surrogates and still masks raw values', () => {
  for (const secret of ['prefix-' + String.fromCharCode(0xD800) + '-secret', 'prefix-' + String.fromCharCode(0xDC00) + '-secret']) {
    assert.equal(redactText('echo ' + secret, [secret]), 'echo [REDACTED]');
    const safe = redact({ token: secret, error: 'echo ' + secret });
    assert.equal(safe.token, '[REDACTED]'); assert.equal(safe.error, 'echo [REDACTED]');
  }
});
