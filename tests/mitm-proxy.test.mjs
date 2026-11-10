import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { createProxy, DEFAULT_ALLOWED_HOSTS } from '../tools/mitm-proxy.mjs';

// All certificates are throwaway files. No OS trust store or game credential is read.
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-mitm-test-'));
const openssl = process.env.CW_TEST_OPENSSL || ['C:/Program Files/Git/usr/bin/openssl.exe', 'C:/Program Files/Git/mingw64/bin/openssl.exe'].find((file) => fs.existsSync(file)) || 'openssl';
const run = (args) => execFileSync(openssl, args, { cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'] });
function root(name) {
  run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-keyout', name + '.key', '-out', name + '.crt', '-subj', '/CN=' + name, '-addext', 'basicConstraints=critical,CA:TRUE']);
  return { cert: fs.readFileSync(path.join(workspace, name + '.crt')), keyPem: fs.readFileSync(path.join(workspace, name + '.key')) };
}
function leaf(name, ca, hostname = 'localhost', days = '1') {
  run(['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', name + '.key', '-out', name + '.csr', '-subj', '/CN=' + hostname]);
  fs.writeFileSync(path.join(workspace, name + '.ext'), 'subjectAltName=DNS:' + hostname + '\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n');
  run(['x509', '-req', '-in', name + '.csr', '-CA', ca + '.crt', '-CAkey', ca + '.key', '-CAcreateserial', ...(days === '-1' ? ['-not_before', '20000101000000Z', '-not_after', '20000102000000Z'] : ['-days', days]), '-out', name + '.crt', '-extfile', name + '.ext']);
  return { cert: fs.readFileSync(path.join(workspace, name + '.crt')), keyPem: fs.readFileSync(path.join(workspace, name + '.key')), key: path.join(workspace, name + '.key') };
}
const proxyRoot = root('proxy-root'), upstreamRoot = root('upstream-root');
const proxyLeaf = leaf('proxy-leaf', 'proxy-root');
const validLeaf = leaf('valid-leaf', 'upstream-root');
const wrongLeaf = leaf('wrong-leaf', 'upstream-root', 'wrong.invalid');
const expiredLeaf = leaf('expired-leaf', 'upstream-root', 'localhost', '-1');
const fakeCodec = {
  encode(name, seq, body) { const payload = Buffer.from(JSON.stringify(body)); const out = Buffer.alloc(11 + name.length + payload.length); out[9] = name.length; out.write(name, 10, 'ascii'); out.writeInt32BE(seq, 5); payload.copy(out, 11 + name.length); return out; },
  decode(bytes) { const name = bytes.subarray(10, 10 + bytes[9]).toString(); return { name, seq: bytes.readInt32BE(5), body: JSON.parse(bytes.subarray(11 + bytes[9]).toString()) }; },
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate) { for (let i = 0; i < 100; i++) { if (predicate()) return; await wait(10); } throw new Error('condition not reached'); }
async function listen(server) { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); return server.address().port; }
function receive(socket, marker = '\r\n\r\n') {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(() => done(new Error('loopback read timeout')), 3000);
    const done = (error, value) => { clearTimeout(timer); socket.off('data', data); socket.off('error', failure); socket.off('close', closed); error ? reject(error) : resolve(value); };
    const data = (chunk) => { buffer = Buffer.concat([buffer, chunk]); if (buffer.includes(marker)) done(null, buffer); };
    const failure = (error) => done(error), closed = () => done(new Error('loopback closed'));
    socket.on('data', data); socket.once('error', failure); socket.once('close', closed);
  });
}
async function tunnel(proxy, target, ca, servername = 'localhost') {
  const raw = net.connect(proxy.port, '127.0.0.1'); raw.on('error', () => {});
  await new Promise((resolve, reject) => { raw.once('connect', resolve); raw.once('error', reject); });
  const response = receive(raw); raw.write('CONNECT ' + target + ' HTTP/1.1\r\nHost: ' + target + '\r\n\r\n');
  assert.match((await response).toString(), /^HTTP.1.1 200/);
  const socket = tls.connect({ socket: raw, ca, servername, rejectUnauthorized: true }); socket.on('error', () => {});
  await new Promise((resolve, reject) => { socket.once('secureConnect', resolve); socket.once('error', reject); });
  return socket;
}
async function upstream(t, certificate = validLeaf) {
  const sockets = new Set();
  const server = https.createServer({ key: certificate.keyPem, cert: certificate.cert }, (_req, res) => { res.writeHead(200); res.end('loopback-ok'); });
  server.on('connection', (socket) => { sockets.add(socket); socket.on('error', () => {}); socket.once('close', () => sockets.delete(socket)); });
  const port = await listen(server);
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise((resolve) => server.close(resolve)); });
  return { server, port };
}
async function proxy(t, port, options = {}) {
  const instance = createProxy({ port: 0, allowedHosts: ['localhost'], interceptPorts: [port], leafProvider: () => proxyLeaf, upstreamCa: upstreamRoot.cert, codec: fakeCodec, ...options });
  await instance.listen(); t.after(() => instance.stop()); return instance;
}
async function getStatus(t, certificate, trusted = upstreamRoot.cert) {
  const remote = await upstream(t, certificate); const instance = await proxy(t, remote.port, { upstreamCa: trusted });
  const socket = await tunnel(instance, 'localhost:' + remote.port, proxyRoot.cert); t.after(() => socket.destroy());
  const result = receive(socket); socket.write('GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n'); return (await result).toString();
}
function websocketFrame(payload) {
  const header = payload.length < 126 ? Buffer.from([0x82, payload.length]) : Buffer.from([0x82, 126, payload.length >> 8, payload.length & 255]);
  return Buffer.concat([header, payload]);
}

test('import is independent of protocol bundles and exact allowlist rejects wildcards', () => {
  assert.deepEqual(DEFAULT_ALLOWED_HOSTS, ['dhyaoj-gate.khlgamen.com']);
  for (const host of ['*.example.com', '.example.com', 'example.com.', 'https://example.com']) assert.throws(() => createProxy({ allowedHosts: [host] }), /exact host/);
});
test('trusted upstream chain and matching hostname succeeds using keyPem rather than key path', async (t) => {
  assert.match(await getStatus(t, validLeaf), /^HTTP.1.1 200/);
});
test('untrusted upstream certificate fails closed', async (t) => {
  assert.match(await getStatus(t, validLeaf, proxyRoot.cert), /^HTTP.1.1 502/);
});
test('trusted certificate with wrong hostname fails closed', async (t) => {
  assert.match(await getStatus(t, wrongLeaf), /^HTTP.1.1 502/);
});
test('expired upstream certificate fails closed', async (t) => {
  assert.match(await getStatus(t, expiredLeaf), /^HTTP.1.1 502/);
});
test('non-allowlisted host on an intercepted port stays an opaque tunnel with original certificate', async (t) => {
  const remote = await upstream(t); let leafCalls = 0;
  const instance = await proxy(t, remote.port, { leafProvider: () => { leafCalls++; throw new Error('must never decrypt'); } });
  const socket = await tunnel(instance, '127.0.0.1:' + remote.port, upstreamRoot.cert); t.after(() => socket.destroy());
  assert.equal(socket.getPeerCertificate().fingerprint256, new (await import('node:crypto')).X509Certificate(validLeaf.cert).fingerprint256);
  const response = receive(socket); socket.write('GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
  assert.match((await response).toString(), /^HTTP.1.1 200/); assert.equal(leafCalls, 0); assert.equal(instance.captured, false);
});
test('capture receives raw credentials once while log and frame observers receive recursively redacted data', async (t) => {
  const remote = await upstream(t); const records = [], frames = [], logs = [];
  remote.server.on('upgrade', (_req, socket) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
    socket.on('data', () => socket.write(websocketFrame(fakeCodec.encode('SyntheticResponse', 9, { nested: [{ token: 'synthetic-token' }], message: 'synthetic-sign' }))));
  });
  const instance = await proxy(t, remote.port, { onLogin: (record) => records.push(record), onFrame: async (frame) => { frames.push(frame); throw new Error('observer synthetic-token'); }, log: (kind, message) => logs.push({ kind, message }) });
  const socket = await tunnel(instance, 'localhost:' + remote.port, proxyRoot.cert); t.after(() => socket.destroy());
  const upgraded = receive(socket); socket.write('GET /ws?token=synthetic-token HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nAuthorization: Bearer synthetic-token\r\n\r\n');
  assert.match((await upgraded).toString(), /^HTTP.1.1 101/);
  const raw = fakeCodec.encode('LoginRequest', 7, { eworldParams: { openId: 'synthetic-id', token: 'synthetic-token', sign: 'synthetic-sign' } });
  socket.write(websocketFrame(raw)); await until(() => records.length === 1 && frames.some((frame) => frame.direction === 'down'));
  socket.write(websocketFrame(raw)); await wait(20);
  assert.equal(records.length, 1); assert.equal(records[0].body.eworldParams.token, 'synthetic-token'); assert.equal(records[0].rawFrameHex, raw.toString('hex'));
  const observed = JSON.stringify({ frames, logs });
  for (const secret of ['synthetic-token', 'synthetic-sign', 'synthetic-id', raw.toString('hex')]) assert.equal(observed.includes(secret), false, secret);
  assert.ok(observed.includes('[REDACTED]'));
  await instance.stop(); assert.equal(instance.socketCount, 0);
  await instance.listen(); assert.equal(instance.captured, false);
});
test('listen conflict can be retried; concurrent listen/stop and active tunnel cleanup are idempotent', async (t) => {
  const occupied = net.createServer(); const occupiedPort = await listen(occupied);
  const instance = createProxy({ port: occupiedPort, allowedHosts: [] }); t.after(() => instance.stop());
  const first = instance.listen(); assert.equal(first, instance.listen()); await assert.rejects(first, { code: 'EADDRINUSE' }); await instance.stop();
  await new Promise((resolve) => occupied.close(resolve));
  await instance.listen(); const raw = net.connect(instance.port, '127.0.0.1'); raw.on('error', () => {}); await new Promise((resolve) => raw.once('connect', resolve));
  const stopped = instance.stop(); assert.equal(stopped, instance.stop()); await stopped; assert.equal(instance.socketCount, 0);
  await instance.stop(); await instance.listen(); await instance.stop();
});

test.after(() => fs.rmSync(workspace, { recursive: true, force: true }));

test('stop and restart invalidate an older asynchronous decode before credential callbacks', async (t) => {
  const remote = await upstream(t); let release;
  const delayed = new Promise((resolve) => { release = resolve; });
  const records = [], frames = [];
  remote.server.on('upgrade', (_req, socket) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
  });
  const instance = await proxy(t, remote.port, { codec: delayed, onLogin: (record) => records.push(record), onFrame: (frame) => frames.push(frame) });
  const socket = await tunnel(instance, 'localhost:' + remote.port, proxyRoot.cert); t.after(() => socket.destroy());
  const upgrade = receive(socket); socket.write('GET /ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'); await upgrade;
  socket.write(websocketFrame(fakeCodec.encode('LoginRequest', 1, { token: 'old-synthetic-token' })));
  await wait(30); await instance.stop(); await instance.listen(); release(fakeCodec); await wait(30);
  assert.equal(records.length, 0); assert.equal(frames.length, 0); assert.equal(instance.captured, false);
});

test('lazy real protobuf captures a masked LoginRequest and returns the exact LoginResponse bytes', async (t) => {
  const [{ createCodec }, { loadProtocol }] = await Promise.all([import('../src/codec.mjs'), import('../src/proto.mjs')]);
  const real = createCodec(loadProtocol()); const remote = await upstream(t); let captured;
  const reply = Buffer.from(real.encode('LoginResponse', 1, { result: 0, initSeqNo: 100, playerInfo: { nickname: 'synthetic-echo' } }));
  remote.server.on('upgrade', (_req, socket) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
    socket.on('data', () => socket.write(websocketFrame(reply)));
  });
  const instance = await proxy(t, remote.port, { codec: null, onLogin: (record) => { captured = record; } });
  const socket = await tunnel(instance, 'localhost:' + remote.port, proxyRoot.cert); t.after(() => socket.destroy());
  const upgrade = receive(socket); socket.write('GET /ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'); await upgrade;
  const raw = Buffer.from(real.encode('LoginRequest', 7, { language: 'zh_CN', worldId: 1, eworldParams: { openId: 'oSYNTHETIC', token: 'synthetic-token', timestamp: 1700000000, sign: 'synthetic-sign' } }));
  const mask = Buffer.from([1, 2, 3, 4]); const payload = Buffer.from(raw); for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
  const header = payload.length < 126 ? Buffer.from([0x82, 0x80 | payload.length]) : Buffer.from([0x82, 0xfe, payload.length >> 8, payload.length & 255]);
  const returned = receive(socket, reply); socket.write(Buffer.concat([header, mask, payload]));
  const wireReply = await returned; await until(() => captured);
  assert.equal(captured.url, 'wss://localhost:' + remote.port + '/ws'); assert.equal(captured.body.eworldParams.openId, 'oSYNTHETIC');
  assert.deepEqual(Buffer.from(captured.rawFrameHex, 'hex'), raw); assert.ok(wireReply.includes(reply)); assert.equal(real.decode(reply).name, 'LoginResponse');
});
