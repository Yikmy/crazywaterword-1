import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { EventEmitter } from 'node:events';
import { createCliOutput, loadCliCredential } from '../src/cli-safety.mjs';
import { headless, state, act, accountsCli, planLoot } from '../src/app.mjs';
import { runWorldProbe } from '../tools/probe-world.mjs';
import { runDailiesProbe } from '../tools/probe-dailies.mjs';

const token = 'fixture-cli-token+/秘密';
const sign = 'fixture-cli-sign-secret';
const frame = 'fixture-cli-raw-frame';
const cookie = 'fixture-cli-cookie';
const query = 'fixture-cli-query-secret';
const credential = () => ({ id: 'fixture-cli-open-id', url: 'wss://fixture.invalid/ws?token=' + query,
  login: { eworldParams: { openId: 'fixture-cli-open-id', token, sign, timestamp: 1 }, cookie }, loginFrameHex: frame });
const payload = () => ({ token, SIGN: sign, Cookie: cookie, rawLoginFrameHex: frame, nested: [{ note: [token, sign, frame, cookie, query].join(' ') }], padding: 'x'.repeat(2500) });
const secrets = [token, encodeURIComponent(token), sign, frame, cookie, query];
function clean(value) { for (const secret of secrets) assert.equal(String(value).includes(secret), false, 'ordinary output leaked a synthetic secret'); }
function store() { const account = credential(); return { version: 1, activeId: account.id, accounts: [account] }; }
class Client extends EventEmitter {
  connected = true;
  stopped = 0;
  async connect() {
    this.emit('warn', 'echo ' + [token, sign, cookie, query].join(' '));
    this.emit('fatal', payload());
    this.emit('state', { state: 'READY', detail: 'echo ' + token });
    this.emit('message', { name: 'FixtureResponse', seq: 1, body: payload() });
    return { result: 0, playerInfo: { nickname: 'fixture', level: 2 } };
  }
  async request() { return payload(); }
  stop() { this.stopped++; this.connected = false; }
}
function capture(t) {
  const lines = [];
  t.mock.method(console, 'log', (...args) => lines.push(args.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join(' ')));
  t.mock.method(console, 'error', (...args) => lines.push(args.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join(' ')));
  return lines;
}
function runtime(client = new Client()) { return { credentialSource: credential, protocolSource: () => ({ DrawAfkRewardRequest: {}, DrawAfkRewardResponse: {} }), createClient: () => client }; }

test('CLI/probe imports do not read accounts, open sockets, or add process handlers', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-cli-import-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const sentinel = path.join(dir, 'accounts.json'); fs.writeFileSync(sentinel, 'not-json-never-read');
  const files = ['src/app.mjs', 'tools/probe-world.mjs', 'tools/probe-dailies.mjs'];
  const urls = files.map((file) => pathToFileURL(path.resolve(import.meta.dirname, '..', file)).href);
  const script = "import assert from 'node:assert/strict'; const before = ['SIGINT','SIGTERM'].map(n=>process.listenerCount(n)); for (const url of " + JSON.stringify(urls) + ") await import(url); assert.deepEqual(['SIGINT','SIGTERM'].map(n=>process.listenerCount(n)),before);";
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: dir, env: { ...process.env, CW_DATA_DIR: dir }, encoding: 'utf8', timeout: 15000 });
  assert.equal(output, ''); assert.equal(fs.readFileSync(sentinel, 'utf8'), 'not-json-never-read');
});

test('CLI sink redacts structured fields before truncation and remembers URL/credential secrets for errors', () => {
  const lines = []; const output = createCliOutput({ write: (...args) => lines.push(...args), writeError: (...args) => lines.push(...args) });
  output.remember(credential());
  output.log(output.json(payload()).slice(0, 80));
  output.error(new Error([token, sign, frame, cookie, query, encodeURIComponent(token)].join(' ')));
  clean(JSON.stringify(lines));
  assert.match(JSON.stringify(lines), /REDACTED/);
});

test('accounts show and list expose only safe metadata, including --reveal and debug modes', async (t) => {
  const lines = capture(t); const accountStore = { loadStore: store };
  await accountsCli(['show', '1', '--reveal'], { accountStore });
  await accountsCli(['list'], { accountStore });
  clean(lines.join('\n')); assert.doesNotMatch(lines.join('\n'), /"raw"|"loginFrameHex"|"eworldParams"/);
});

test('headless probes sanitize message, warning, fatal, state, and truncated response output', async (t) => {
  const lines = capture(t); const client = new Client();
  const before = process.listenerCount('SIGINT');
  await headless({ seconds: 0 }, runtime(client));
  clean(lines.join('\n')); assert.equal(client.stopped, 1); assert.equal(process.listenerCount('SIGINT'), before);
});

test('state raw and --out sanitize responses and failed/callback errors', async (t) => {
  const lines = capture(t); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-cli-state-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = path.join(dir, 'state.json'); const client = new Client();
  await state({ raw: true, out }, { ...runtime(client), collect: async (_, __, { onResult }) => {
    onResult('FixtureRequest', null, new Error(token + ' ' + sign));
    return { ok: { FixtureRequest: payload() }, failed: { OtherRequest: token + ' ' + sign } };
  } });
  clean(lines.join('\n') + fs.readFileSync(out, 'utf8')); assert.equal(client.stopped, 1);
});

test('act sanitizes response bodies and cleans up on rejected connect', async (t) => {
  const lines = capture(t); const client = new Client();
  await act({ id: 'afkDraw', params: {}, allowMutate: true }, runtime(client));
  clean(lines.join('\n')); assert.equal(client.stopped, 1);
  const broken = new Client(); broken.connect = async () => { throw new Error('fixture connection failed'); };
  const before = process.listenerCount('SIGINT');
  await assert.rejects(act({ id: 'afkDraw', params: {}, allowMutate: true }, runtime(broken)), /fixture connection failed/);
  assert.equal(broken.stopped, 1); assert.equal(process.listenerCount('SIGINT'), before);
});

for (const run of [runWorldProbe, runDailiesProbe]) test(run.name + ' uses validated account storage and safe output; no legacy direct read', async () => {
  const lines = []; const client = new Client();
  const output = createCliOutput({ write: (...args) => lines.push(...args), writeError: (...args) => lines.push(...args) });
  let selected;
  await run({ selector: 'chosen', accountStore: { loadStore: store, pickAccount(value, selector) { selected = selector; return value.accounts[0]; } }, output, protocolSource: () => ({}), configSource: () => ({ tables: {} }), createClient: () => client });
  assert.equal(selected, 'chosen'); assert.equal(client.stopped, 1); clean(JSON.stringify(lines));
});

test('invalid/developer credentials and unreadable stores fail before client construction without echoing file content', () => {
  const account = credential(); account.login.superToken = token;
  const output = createCliOutput({ write() {}, writeError() {} });
  assert.throws(() => loadCliCredential({ output, accountStore: { loadStore: () => ({ accounts: [account] }), pickAccount: () => account } }), /禁止/);
  try { loadCliCredential({ output, accountStore: { loadStore() { throw new Error(token); } } }); assert.fail('expected refusal'); }
  catch (error) { clean(error.message); assert.match(error.message, /账号库/); }
});

test('direct CLI show and debug failures use only a synthetic account directory and redact secrets', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-cli-main-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'accounts.json'); fs.writeFileSync(file, JSON.stringify(store()));
  const cliPath = path.resolve(import.meta.dirname, '../src/app.mjs');
  const options = { cwd: dir, env: { ...process.env, CW_DATA_DIR: dir, CW_DEBUG: '1' }, encoding: 'utf8', timeout: 10000 };
  clean(execFileSync(process.execPath, [cliPath, 'accounts', 'show', '1'], options));
  fs.writeFileSync(file, token);
  try { execFileSync(process.execPath, [cliPath, 'accounts', 'show', '1'], { ...options, stdio: ['ignore', 'pipe', 'pipe'] }); assert.fail('invalid JSON must fail'); }
  catch (error) { assert.equal(error.status, 1); clean(error.stderr); assert.match(error.stderr, /无法读取账号库/); }
});

test('CLI SIGINT interrupts a long wait and removes its listeners and client once', async (t) => {
  const lines = capture(t); const client = new Client();
  const before = process.listenerCount('SIGINT');
  const timer = setTimeout(() => process.emit('SIGINT'), 20);
  try { await assert.rejects(headless({ seconds: 60, probes: false }, runtime(client)), { code: 'CANCELLED' }); }
  finally { clearTimeout(timer); }
  assert.equal(client.stopped, 1); assert.equal(process.listenerCount('SIGINT'), before); clean(lines.join('\n'));
});

test('CLI cancellation during login prevents the first write; silent action output says UNKNOWN', async (t) => {
  const lines = capture(t); const cancelled = new Client(); let calls = 0;
  cancelled.connect = async () => { process.emit('SIGINT'); return {}; };
  cancelled.request = async () => { calls++; return {}; };
  await assert.rejects(act({ id: 'afkDraw', params: {}, allowMutate: true }, runtime(cancelled)), { code: 'CANCELLED' });
  assert.equal(calls, 0); assert.equal(cancelled.stopped, 1);
  const silent = new Client(); silent.sendWatch = async () => ({ status: 'UNKNOWN', name: 'SetBuildingAutoWorkRequest' });
  const options = { ...runtime(silent), protocolSource: () => ({ SetBuildingAutoWorkRequest: {} }) };
  await act({ id: 'buildingAutoWork', params: { buildingId: 'fixture-building', isOn: true }, allowMutate: true }, options);
  assert.match(lines.join('\n'), /结果未知/); assert.doesNotMatch(lines.join('\n'), /成功/); assert.equal(silent.stopped, 1); clean(lines.join('\n'));
});

test('act refuses budgeted/unknown-cost writes before any credential read or connection', async () => {
  const runtime = { credentialSource() { assert.fail('preflight refusal must precede credentials'); }, createClient() { assert.fail('must not connect'); } };
  const params = { buildingId: 'fixture-building', productId: 'fixture-product', index: 1, useNum: 1, level: 2 };
  for (const id of ['upgradeBuilding', 'buildBuilding', 'startProduce', 'finishOrder', 'speedUpUpgrade', 'speedUpProduce', 'afkUpgrade']) {
    await assert.rejects(act({ id, params, allowMutate: true }, runtime), /余额|成本/);
  }
});


test('loot reuses reliable reward eligibility and leaves construction to world budget planning', () => {
  const malformed = { id: 1006, progress: null, targetProgress: null, rewardClaimed: false };
  const valid = { id: 1006, progress: 1, targetProgress: 1, rewardClaimed: false };
  const make = (task) => ({ DailyTaskInfoRequest: { dailyTask: [task] }, AchievementInfoRequest: { task: [task] },
    OnWaterRequest: { building: [{ buildingId: '1民居', level: 0 }] } });
  const config = { tables: {
    BuildingCfg: { data: [{ buildingType: '民居' }] },
    BuildingUpgradeCfg: { data: [{ buildingType: '民居', level: 1, condition: [], playerLevel: 1, consume: [['木材', 5]] }] },
  } };
  const invalidPlan = planLoot(make(malformed), 100, config);
  assert.equal(invalidPlan.some((entry) => ['dailyTaskDraw', 'achievementDraw', 'buildBuilding'].includes(entry.id)), false);
  const validPlan = planLoot(make(valid), 100, config);
  assert.equal(validPlan.some((entry) => entry.id === 'dailyTaskDraw'), true);
  assert.equal(validPlan.some((entry) => entry.id === 'achievementDraw'), true);
  assert.equal(validPlan.some((entry) => entry.id === 'buildBuilding'), false);
});
