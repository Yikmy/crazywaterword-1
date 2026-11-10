// Loopback proxy: only explicitly allowed game hosts are decrypted.
// OS proxy settings, trust installation and credential persistence belong to callers.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

import { pathToFileURL } from 'node:url';
import { leafFor } from './mitm-ca.mjs';
import { redact, redactText } from '../src/security.mjs';

export const DEFAULT_PROXY_PORT = Number(process.env.CW_PROXY_PORT ?? 17322);
export const DEFAULT_ALLOWED_HOSTS = Object.freeze(['dhyaoj-gate.khlgamen.com']);

let defaultCodecPromise;
function gameCodec() {
  defaultCodecPromise ??= Promise.all([import('../src/proto.mjs'), import('../src/codec.mjs')])
    .then(([{ loadProtocol }, { createCodec }]) => createCodec(loadProtocol()));
  return defaultCodecPromise;
}
export function decodeWsFrame(bytes, codec = null) {
  if (bytes.length < 12) return null;
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const length = view.getInt8(9);
    if (length <= 0 || length > 127 || 11 + length > bytes.length) return null;
    return codec ? codec.decode(bytes) : null;
  } catch { return null; }
}
function frameReader(onFrame) {
  let buffer = Buffer.alloc(0), fragments = [];
  return (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const fin = Boolean(buffer[0] & 0x80), opcode = buffer[0] & 15, masked = Boolean(buffer[1] & 0x80);
      let length = buffer[1] & 127, offset = 2;
      if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4; }
      if (length === 127) { if (buffer.length < 10) return; const wide = buffer.readBigUInt64BE(2); if (wide > 16777216n) { buffer = Buffer.alloc(0); fragments = []; return; } length = Number(wide); offset = 10; }
      if (length > 16777216) { buffer = Buffer.alloc(0); fragments = []; return; }
      const mask = masked ? buffer.subarray(offset, offset + 4) : null;
      if (masked) offset += 4;
      if (buffer.length < offset + length) return;
      let payload = buffer.subarray(offset, offset + length);
      if (masked) { payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4]; }
      buffer = buffer.subarray(offset + length);
      if (opcode === 8) return;
      if (opcode === 9 || opcode === 10) continue;
      fragments.push(payload);
      if (fin) { onFrame(Buffer.concat(fragments)); fragments = []; }
    }
  };
}
function hosts(values) {
  if (!Array.isArray(values)) throw new Error('allowedHosts must be an array of exact host names');
  return new Set(values.map((value) => {
    const host = String(value).toLowerCase();
    if (!host || host.includes('*') || !/^[a-z0-9.-]+$/.test(host) || host.includes('..') || host.startsWith('.') || host.endsWith('.')) throw new Error('allowedHosts requires exact host names without wildcards');
    return host;
  }));
}
function authority(value) {
  const url = new URL('https://' + value);
  if (!value || [' ', '/', '?', '#', '@'].some((char) => value.includes(char)) || url.username || url.password) throw new Error('invalid CONNECT authority');
  const port = Number(url.port || 443);
  if (port < 1 || port > 65535) throw new Error('invalid CONNECT port');
  const host = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
  return { host: host.toLowerCase(), port, secure: true };
}

// onLogin is the dedicated credential sink; onFrame and log always receive redacted copies.
export function createProxy({
  port = DEFAULT_PROXY_PORT, allowedHosts = DEFAULT_ALLOWED_HOSTS, interceptPorts = [443],
  leafProvider = leafFor, upstreamCa, codec = null, onLogin, onFrame, log = () => {},
} = {}) {
  const allowed = hosts(allowedHosts);
  const ports = new Set(interceptPorts);
  if ([...ports].some((value) => !Number.isInteger(value) || value < 1 || value > 65535)) throw new Error('invalid intercepted port');
  const sockets = new Set(), requests = new Set(), tlsServers = new Map(), secrets = new Set();
  let listenPromise = null, stopPromise = null, stopping = false, captured = false, actualPort = port, generation = 0;
  const remember = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, entry] of Object.entries(value)) {
      if (/token|sign|open.?id|authorization|cookie|password|secret|framehex/i.test(key) && (typeof entry === 'string' || typeof entry === 'number')) { if (String(entry)) secrets.add(String(entry)); }
      else if (entry && typeof entry === 'object') remember(entry);
    }
  };
  const safeLog = (kind, message) => { try { log(kind, redactText(message, [...secrets])); } catch { /* observers cannot break forwarding */ } };
  const track = (socket) => { sockets.add(socket); socket.on('error', () => {}); socket.once('close', () => sockets.delete(socket)); return socket; };
  const server = http.createServer(onRequest);
  server.on('connection', track);
  server.on('connect', onConnect);
  server.on('upgrade', onUpgrade);
  server.on('clientError', (_error, socket) => socket.destroy());

  function inspect(socket, direction, context) {
    const epoch = generation;
    const current = () => !stopping && generation === epoch;
    let queue = Promise.resolve();
    const inspectFrame = async (bytes) => {
      if (!current()) return;
      const decoded = decodeWsFrame(bytes, codec ? await codec : await gameCodec());
      if (!current()) return;
      if (!decoded) return;
      remember(decoded.body);
      if (direction === 'up' && decoded.name === 'LoginRequest') {
        const rawFrameHex = bytes.toString('hex'); secrets.add(rawFrameHex);
        if (!captured) {
          captured = true;
          Promise.resolve().then(() => { if (current()) return onLogin?.({ url: context, name: decoded.name, body: structuredClone(decoded.body), rawFrameHex }); })
            .catch((error) => safeLog('capture', '处理登录包失败: ' + error.message));
        }
      }
      safeLog('ws', direction + ' ' + decoded.name + ' seq=' + decoded.seq);
      if (!current()) return;
      try { Promise.resolve(onFrame?.(redact({ direction, context, name: decoded.name, seq: decoded.seq, body: decoded.body }, [...secrets]))).catch((error) => safeLog('frame', error.message)); }
      catch (error) { safeLog('frame', error.message); }
    };
    socket.on('data', frameReader((bytes) => { queue = queue.then(() => inspectFrame(bytes)).catch((error) => safeLog('decode', error.message)); }));
  }
  function tlsServer(target) {
    const key = target.host + ':' + target.port;
    if (tlsServers.has(key)) return tlsServers.get(key);
    const leaf = leafProvider(target.host);
    // key is a file path in leafFor(); only keyPem contains a usable TLS private key.
    const inner = tls.createServer({ cert: leaf.cert, key: leaf.keyPem }, (socket) => {
      track(socket); socket._target = target; server.emit('connection', socket);
    });
    inner.on('tlsClientError', (error) => safeLog('tls', error.message));
    tlsServers.set(key, inner); return inner;
  }
  function onConnect(req, client, head) {
    if (stopping) { client.destroy(); return; }
    let target; try { target = authority(req.url); } catch { client.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
    safeLog('connect', target.host + ':' + target.port);
    if (!allowed.has(target.host) || !ports.has(target.port)) {
      const upstream = track(net.connect({ host: target.host, port: target.port }, () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        client.pipe(upstream); upstream.pipe(client);
      }));
      upstream.once('error', () => client.destroy());
      client.once('close', () => upstream.destroy()); upstream.once('close', () => client.destroy());
      return;
    }
    try {
      const inner = tlsServer(target);
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) client.unshift(head);
      inner.emit('connection', client);
    } catch (error) { safeLog('tls', error.message); client.destroy(); }
  }
  function targetFor(req) {
    if (req.socket._target) return { target: req.socket._target, requestPath: req.url };
    const url = new URL(req.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('unsupported proxy URL');
    return { target: { host: url.hostname.toLowerCase(), port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)), secure: url.protocol === 'https:' }, requestPath: url.pathname + url.search };
  }
  function upstream(target, req, requestPath, callback) {
    remember(req.headers);
    const request = (target.secure ? https : http).request({
      hostname: target.host, port: target.port, path: requestPath, method: req.method,
      headers: req.headers, servername: net.isIP(target.host) ? undefined : target.host,
      rejectUnauthorized: true, ...(upstreamCa ? { ca: upstreamCa } : {}),
    }, callback);
    requests.add(request); request.once('close', () => requests.delete(request)); request.on('socket', track);
    return request;
  }
  function onRequest(req, res) {
    if (stopping) { res.writeHead(503); res.end(); return; }
    let found; try { found = targetFor(req); } catch { res.writeHead(502); res.end(); return; }
    const { target, requestPath } = found;
    // Ordinary HTTP traffic is forwarded without inspecting headers or bodies.
    const request = upstream(target, req, requestPath, (response) => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
    request.on('error', (error) => { safeLog('http', '上游出错: ' + error.message); if (!res.headersSent) res.writeHead(502); res.end(); });
    res.once('close', () => request.destroy()); req.pipe(request);
  }
  function onUpgrade(req, client, head) {
    const target = req.socket._target;
    if (stopping || !target || !allowed.has(target.host) || !ports.has(target.port)) { client.destroy(); return; }
    const context = 'wss://' + target.host + ':' + target.port + req.url;
    remember(req.headers); safeLog('upgrade', context);
    const request = upstream(target, req, req.url);
    request.on('upgrade', (response, upstreamSocket, upstreamHead) => {
      track(upstreamSocket);
      client.write('HTTP/1.1 101 Switching Protocols\r\n' + Object.entries(response.headers).map(([key, value]) => key + ': ' + value).join('\r\n') + '\r\n\r\n');
      inspect(upstreamSocket, 'down', context); inspect(client, 'up', context);
      // The upgrade's head bytes arrived before data listeners were attached.
      if (head.length) { client.emit('data', head); upstreamSocket.write(head); }
      if (upstreamHead.length) { upstreamSocket.emit('data', upstreamHead); client.write(upstreamHead); }
      client.once('close', () => upstreamSocket.destroy()); upstreamSocket.once('close', () => client.destroy());
      client.pipe(upstreamSocket); upstreamSocket.pipe(client);
    });
    request.on('response', (response) => { response.resume(); client.destroy(); });
    request.on('error', (error) => { safeLog('upgrade', '上游出错: ' + error.message); client.destroy(); });
    client.once('close', () => request.destroy()); request.end();
  }
  return {
    get port() { return actualPort; },
    get captured() { return captured; },
    get socketCount() { return sockets.size; },
    listen() {
      if (stopPromise) return stopPromise.then(() => this.listen());
      if (listenPromise) return listenPromise;
      stopping = false; captured = false; generation += 1;
      const task = new Promise((resolve, reject) => {
        const failed = (error) => { server.off('listening', ready); reject(error); };
        const ready = () => { server.off('error', failed); actualPort = server.address().port; safeLog('start', '代理监听 127.0.0.1:' + actualPort); resolve(); };
        server.once('error', failed); server.once('listening', ready);
        try { server.listen(port, '127.0.0.1'); } catch (error) { server.off('error', failed); server.off('listening', ready); reject(error); }
      });
      listenPromise = task;
      task.catch(() => { if (listenPromise === task) listenPromise = null; });
      return task;
    },
    stop() {
      if (stopPromise) return stopPromise;
      stopping = true; generation += 1;
      const task = (async () => {
        if (listenPromise) await listenPromise.catch(() => {});
        const done = server.listening ? new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) : Promise.resolve();
        for (const request of requests) request.destroy(); requests.clear();
        for (const socket of sockets) socket.destroy(); sockets.clear(); tlsServers.clear();
        await done; listenPromise = null;
      })();
      stopPromise = task;
      task.finally(() => { if (stopPromise === task) stopPromise = null; }).catch(() => {});
      return task;
    },
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.stderr.write('Use tools/capture-credentials.mjs; standalone proxy credential persistence is disabled.\n');
  process.exitCode = 1;
}
