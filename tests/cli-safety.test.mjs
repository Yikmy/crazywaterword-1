import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { EventEmitter } from 'node:events';
import { createCliOutput, loadCliCredential } from '../src/cli-safety.mjs';
import { runAction } from '../src/actions.mjs';
import { normalize } from '../src/worlds.mjs';
import { headless, state, act, accountsCli, planLoot, writerCli } from '../src/app.mjs';
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

// Direct action coverage stays independent of the deliberately disabled CLI write entry.
test('Action response normalization uses the safe CLI sink; read-only CLI cleans up rejected connect', async (t) => {
  const lines = capture(t); const client = new Client();
  const output = createCliOutput(); output.remember(credential());
  client.request = async () => ({ ...payload(), amount: { low: 7, high: 0, unsigned: true } });
  const result = await runAction(client, runtime(client).protocolSource(), 'afkDraw', {}, { allowMutate: true });
  assert.equal(result.status, 'SUCCESS');
  output.log(output.json(normalize(result.body)));
  assert.match(lines.join('\n'), /"amount":7/);
  await headless({ seconds: 0, probes: false }, runtime(client));
  clean(lines.join('\n')); assert.equal(client.stopped, 1);
  const broken = new Client(); broken.connect = async () => { throw new Error('fixture connection failed'); };
  const before = process.listenerCount('SIGINT');
  await assert.rejects(headless({ seconds: 0 }, runtime(broken)), /fixture connection failed/);
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

test('read-only CLI cancellation during login prevents requests; write CLI refuses before credentials', async (t) => {
  const lines = capture(t); const cancelled = new Client(); let calls = 0;
  cancelled.connect = async () => { process.emit('SIGINT'); return {}; };
  cancelled.request = async () => { calls++; return {}; };
  await assert.rejects(headless({ seconds: 0 }, runtime(cancelled)), { code: 'CANCELLED' });
  assert.equal(calls, 0); assert.equal(cancelled.stopped, 1);
  const unavailable = { credentialSource() { assert.fail('must not read credentials'); }, protocolSource() { assert.fail('must not load protocol'); }, createClient() { assert.fail('must not construct a client'); } };
  await assert.rejects(act({ id: 'buildingAutoWork', params: { buildingId: 'fixture-building', isOn: true }, allowMutate: true }, unavailable), { code: 'CLI_WRITE_DISABLED' });
  assert.doesNotMatch(lines.join('\n'), /成功/); clean(lines.join('\n'));
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

test('every standalone write command refuses before malformed credential storage; flags cannot opt out', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-cli-owner-deny-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'accounts.json'); const sentinel = 'not-json-' + token;
  fs.writeFileSync(file, sentinel);
  const moduleUrl = pathToFileURL(path.resolve(import.meta.dirname, '../src/app.mjs')).href;
  const commands = [
    ['act', 'afkDraw'], ['act', 'buildingAutoWork', 'buildingId=b', 'isOn=true'],
    ['loot'], ['heroes'], ['dailies'], ['tasks'], ['world'], ['loop'],
    ['field', 'occupy', '1'], ['field', 'giveup', '1'], ['worlds', '1'],
  ];
  const script = [
    "import assert from 'node:assert/strict';",
    'const { main } = await import(' + JSON.stringify(moduleUrl) + ');',
    'for (const args of ' + JSON.stringify(commands) + ') {',
    "process.argv = [process.execPath, 'fixture-cli', ...args, '--yes', '--paid', '--force'];",
    "await assert.rejects(main(), { code: 'CLI_WRITE_DISABLED' }, args.join(' '));",
    "if (args[0] === 'act') { process.env.CW_ALLOW_MUTATE = '0'; process.argv = [process.execPath, 'fixture-cli', ...args]; await assert.rejects(main(), { code: 'CLI_WRITE_DISABLED' }); process.env.CW_ALLOW_MUTATE = '1'; }",
    '}',
  ].join('\n');
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: dir, env: { ...process.env, CW_DATA_DIR: dir, CW_ALLOW_MUTATE: '1', CW_DEBUG: '1', CW_FORCE: '1' },
    encoding: 'utf8', timeout: 15000,
  });
  assert.equal(output, ''); assert.equal(fs.readFileSync(file, 'utf8'), sentinel);
  assert.deepEqual(fs.readdirSync(dir), ['accounts.json']);
});

test('act --dry normalizes a request without credentials, protocol, clients or mutation consent', async (t) => {
  const lines = capture(t);
  const unavailable = { credentialSource() { assert.fail('dry preview read credentials'); }, protocolSource() { assert.fail('dry preview loaded protocol'); }, createClient() { assert.fail('dry preview connected'); } };
  await act({ id: 'dailyRewardDraw', params: { index: '1,2,3' }, dryRun: true }, unavailable);
  assert.match(lines.join('\n'), /DrawDailyRewardRequest/);
  assert.match(lines.join('\n'), /1,\s+2,\s+3/);
  assert.match(lines.join('\n'), /未读取凭证/);
  await assert.rejects(act({ id: 'dailyRewardDraw', params: { index: 'bad' }, dryRun: true }, unavailable), /int32/);
  clean(lines.join('\n'));
});

test('read-only worlds, field and business dry previews use synthetic query transport only', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-cli-owner-preview-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'accounts.json'), JSON.stringify(store()));
  const config = path.join(dir, 'config.json'); fs.writeFileSync(config, '[]');
  const moduleUrl = (file) => pathToFileURL(path.resolve(import.meta.dirname, '..', file)).href;
  const script = [
    "import assert from 'node:assert/strict';",
    'const { GameClient } = await import(' + JSON.stringify(moduleUrl('src/client.mjs')) + ');',
    'const { ENTRY_QUERIES } = await import(' + JSON.stringify(moduleUrl('src/game.mjs')) + ');',
    "const queries = new Set([...ENTRY_QUERIES.map(row => row.name), 'GameWorldListRequest', 'GameWorldGroupListRequest']);",
    'let connected = 0, stopped = 0, requested = 0;',
    "globalThis.WebSocket = class { constructor() { assert.fail('must not open a real socket'); } };",
    "Object.defineProperty(GameClient.prototype, 'connected', { get() { return this.fixtureConnected === true; } });",
    "GameClient.prototype.connect = async function(login) { assert.equal(login.worldId ?? 0, 0); connected++; this.fixtureConnected = true; return { result: 0, playerInfo: { playerId: 'fixture', worldId: 1, level: 2, scenarioId: 0 } }; };",
    "GameClient.prototype.stop = function() { stopped++; this.fixtureConnected = false; };",
    "GameClient.prototype.sendWatch = () => assert.fail('preview attempted a game write');",
    "GameClient.prototype.send = () => assert.fail('preview attempted direct transport');",
    "GameClient.prototype.request = async function(name, body, response, timeout, options) {",
    "  assert.equal(options?.mutate === true, false, 'preview marked mutating request'); assert.ok(queries.has(name), name); requested++;",
    "  if (name === 'GameWorldListRequest') return { latestGroupId: 1, recentWorlds: [] };",
    "  if (name === 'MyResFieldsRequest') return { info: { maxNum: 2, fields: [{ gridIdx: 1, cityId: 1 }] } };",
    "  return { items: [], list: [], heroes: [], dailyTask: [], task: [], building: [], fleets: [], worlds: [], recentWorlds: [] };",
    '};',
    'const { main } = await import(' + JSON.stringify(moduleUrl('src/app.mjs')) + ');',
    "const commands = [['loot'], ['heroes'], ['dailies'], ['tasks'], ['world'], ['loop'], ['field', 'giveup', '1']];",
    "for (const args of commands) { process.argv = [process.execPath, 'fixture-cli', ...args, '--dry', '--yes', '--paid']; await main(); }",
    "for (const args of [['worlds'], ['worlds', 'all', '--group'], ['field']]) { process.argv = [process.execPath, 'fixture-cli', ...args]; await main(); }",
    "process.env.CW_ALLOW_MUTATE = '0';",
    "for (const args of [['loot'], ['heroes'], ['dailies'], ['tasks'], ['world'], ['field', 'giveup', '1']]) { process.argv = [process.execPath, 'fixture-cli', ...args]; await main(); }",
    'assert.equal(connected, commands.length + 3 + 6); assert.equal(stopped, connected); assert.ok(requested > 0);',
  ].join('\n');
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: dir, env: { ...process.env, CW_DATA_DIR: dir, CW_CONFIG_PACK: config, CW_ALLOW_MUTATE: '1' },
    encoding: 'utf8', timeout: 15000,
  });
  clean(output); assert.match(output, /只列单轮计划/);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['accounts.json', 'config.json']);
});
test('writer inspect projects safe owner metadata without credentials, claim or machine fence output', async (t) => {
  const lines = capture(t); let inspected = 0;
  const owner = { version: 1, ownerId: '11111111-1111-4111-8111-111111111111', pid: 41, host: 'fixture-host', hostFence: 'private-machine-fence', createdAt: '2026-11-11T00:00:00.000Z', role: 'console', token };
  const writerOwnership = { inspect() { inspected++; return { state: 'BLOCKED', owner }; }, claim() { assert.fail('inspect must not claim'); }, recoverAbandoned() { assert.fail('inspect must not recover'); } };
  const result = await writerCli(['inspect'], { writerOwnership });
  assert.equal(inspected, 1); assert.equal(result.state, 'BLOCKED'); assert.equal(result.owner.ownerId, owner.ownerId);
  assert.deepEqual(Object.keys(result.owner), ['version', 'ownerId', 'pid', 'host', 'createdAt', 'role']);
  assert.doesNotMatch(lines.join('\n'), /private-machine-fence|hostFence|token/); clean(lines.join('\n'));
});

test('writer recovery requires exact owner flag and rejects force, TTL, duplicate or malformed inputs before storage', async (t) => {
  capture(t);
  const id = '11111111-1111-4111-8111-111111111111';
  const writerOwnership = { inspect() { assert.fail('invalid input reached storage'); }, recoverAbandoned() { assert.fail('invalid input reached recovery'); }, claim() { assert.fail('must not claim'); } };
  for (const args of [['unknown'], ['inspect', '--force'], ['recover'], ['recover', id], ['recover', '--owner-id'], ['recover', '--owner-id', 'wrong'], ['recover', '--owner-id', id, '--force'], ['recover', '--ttl', '0'], ['recover', '--owner-id', id, '--owner-id', id]]) {
    await assert.rejects(writerCli(args, { writerOwnership }), { code: 'WRITER_INVALID_INPUT' });
  }
});

test('writer recovery delegates once to same-host dead-process helper and never claims or clears history', async (t) => {
  const lines = capture(t); const id = '11111111-1111-4111-8111-111111111111'; let calls = 0;
  const writerOwnership = { recoverAbandoned(options) { calls++; assert.deepEqual(options, { expectedOwnerId: id }); return { recovered: true, ownerId: id, recordPath: '/fixture/owner-recovery.json' }; }, inspect() { assert.fail('recovery must not inspect implicitly'); }, claim() { assert.fail('recovery must not claim'); } };
  const result = await writerCli(['recover', '--owner-id', id], { writerOwnership });
  assert.equal(calls, 1); assert.equal(result.recovered, true); assert.match(result.message, /UNKNOWN/);
  assert.match(lines.join('\n'), /未取得写权限/); clean(lines.join('\n'));
  writerOwnership.recoverAbandoned = () => { throw Object.assign(new Error('live writer'), { code: 'WRITER_PROCESS_UNCERTAIN' }); };
  await assert.rejects(writerCli(['recover', '--owner-id', id], { writerOwnership }), { code: 'WRITER_PROCESS_UNCERTAIN' });
});

test('writer main inspect and dead-owner recovery preserve malformed credentials and UNKNOWN bytes in isolated store', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-cli-writer-maintenance-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const accounts = path.join(dir, 'accounts.json'), history = path.join(dir, 'execution-history.json');
  const accountBytes = 'not-json-' + token, historyBytes = '{"fixture":"UNKNOWN","reserved":17}';
  fs.writeFileSync(accounts, accountBytes); fs.writeFileSync(history, historyBytes);
  const appPath = path.resolve(import.meta.dirname, '../src/app.mjs');
  const ownerModule = pathToFileURL(path.resolve(import.meta.dirname, '../src/writer-ownership.mjs')).href;
  const options = { cwd: dir, env: { ...process.env, CW_DATA_DIR: dir }, encoding: 'utf8', timeout: 15000 };
  const free = JSON.parse(execFileSync(process.execPath, [appPath, 'writer', 'inspect'], options));
  assert.deepEqual(free, { state: 'FREE', owner: null });
  assert.deepEqual(fs.readdirSync(dir).sort(), ['accounts.json', 'execution-history.json']);
  const owner = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', 'const { createWriterOwnership } = await import(' + JSON.stringify(ownerModule) + '); const record = createWriterOwnership().claim(); console.log(JSON.stringify(record));'], options));
  const lock = path.join(dir, 'writer-owner.lock'), ownerFile = path.join(lock, 'owner-' + owner.ownerId + '.json');
  const original = fs.readFileSync(ownerFile, 'utf8');
  const inspection = execFileSync(process.execPath, [appPath, 'writer', 'inspect'], options);
  assert.equal(JSON.parse(inspection).state, 'BLOCKED'); assert.doesNotMatch(inspection, /hostFence/); assert.equal(inspection.includes(owner.hostFence), false);
  const wrong = '22222222-2222-4222-8222-222222222222';
  assert.throws(() => execFileSync(process.execPath, [appPath, 'writer', 'recover', '--owner-id', wrong], { ...options, stdio: ['ignore', 'pipe', 'pipe'] }), { status: 1 });
  assert.equal(fs.readFileSync(ownerFile, 'utf8'), original);
  const recovered = JSON.parse(execFileSync(process.execPath, [appPath, 'writer', 'recover', '--owner-id', owner.ownerId], options));
  assert.equal(recovered.recovered, true); assert.equal(fs.existsSync(lock), false); assert.equal(fs.existsSync(recovered.recordPath), true);
  assert.equal(fs.readFileSync(accounts, 'utf8'), accountBytes); assert.equal(fs.readFileSync(history, 'utf8'), historyBytes);
  const names = fs.readdirSync(dir); assert.equal(names.length, 3); assert.equal(names.some(name => name.endsWith('.lock')), false);
  clean(inspection + JSON.stringify(recovered));
});