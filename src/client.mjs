import { EventEmitter } from 'node:events';
import { createCodec } from './codec.mjs';
import { trustedGameClock } from './state-facts.mjs';

// Only this module can attest that a local error preceded socket dispatch.
const undispatchedErrors = new WeakMap();
export const isUndispatchedTransportError = (error,guard) => typeof guard === 'function' && error !== null && (typeof error === 'object' || typeof error === 'function') && undispatchedErrors.get(error)===guard;
export const MAX_SEQ = 2147483647;
const HALF_SEQ = (MAX_SEQ - 1) / 2;

export const TICK_INTERVAL_MS = 1000;
export const PING_TIMEOUT_MS = 1000;
export const LOGIN_TIMEOUT_MS = 15000;
export const ACK_DELAY_MS = 1000;
export const HEARTBEAT_DEADLINE_MS = 604800000 + TICK_INTERVAL_MS;

export const DEFAULT_GATEWAY = 'wss://dhyaoj-gate.khlgamen.com/ws';

export function nextSeqNo(seq) {
  return seq === MAX_SEQ ? 1 : seq + 1;
}

// protobufjs decodes int64 into { low, high, unsigned } when no Long library is
// installed, so values echoed back by the server need converting before compare.
export function toNumber(value) {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && typeof value.low === 'number') {
    return value.high * 4294967296 + (value.low >>> 0);
  }
  return Number(value);
}

export function isSeqNoInRange(seq, right) {
  if (!(right > 0 && right <= MAX_SEQ)) throw new RangeError(`Invalid seqNoRight=${right}`);
  const left = right - HALF_SEQ;
  if (left > 0) return seq >= left && seq <= right;
  return (seq >= 1 && seq <= right) || (seq >= MAX_SEQ + left && seq <= MAX_SEQ);
}

export class GameClient extends EventEmitter {
  constructor({ url = DEFAULT_GATEWAY, protocol, login = null, WebSocketImpl = globalThis.WebSocket, assertTransport = () => {}, accountId = null, generation = 0, gameClock = null } = {}) {
    super();
    this.assertTransport = assertTransport;
    this.factContext = { accountId, generation };
    this.gameClock = gameClock ?? (typeof accountId === 'string' && accountId ? trustedGameClock({ accountId, generation }) : { reset() {}, markPing() {}, observePong() {}, read: () => ({ status: 'UNKNOWN', reliable: false, reason: 'CONTEXT_UNKNOWN' }) });
    this.url = url;
    this.login = login;
    this.WebSocketImpl = WebSocketImpl;
    this.loginPromise = null;
    this.loginAttempt = null;
    this.loginResponse = null;
    this.codec = createCodec(protocol);
    this.state = 'IDLE';
    this.socket = null;
    this.sendSeqNo = Math.floor(1000 * Math.random()) + 1;
    this.recvSeqNo = null;
    this.nextAckSeqNo = null;
    this.ackTimer = null;
    this.tickTimer = null;
    this.lastPingTimestamp = 0;
    this.lastResponseAt = 0;
    this.latencyMs = 0;
    this.serverClockOffsetMs = 0;
    this.pending = [];
    this.lateResponses = new Set();
    this.promptUncertain = false;
    this.watchers = [];
    this.uncertainWrites = new Set();
    this.sendOrder = 0;
    this.heartbeatDiagnostics = [];
    this.lastTickAt = null;
    this.stopping = false;
  }

  get connected() {
    return this.state === 'READY' && this.socket !== null && this.socket.readyState === 1;
  }

  setState(state, detail) {
    this.state = state;
    this.emit('state', { state, detail });
  }

  // One login owns one socket; all callers share it until it settles.
  connect(loginBody = this.login, { timeout = LOGIN_TIMEOUT_MS } = {}) {
    if (this.loginPromise) return this.loginPromise;
    if (this.state === 'READY' && this.connected) return Promise.resolve(this.loginResponse);
    this.stopping = false;
    this.gameClock.reset();
    const attempt = { resolve: null, reject: null, timer: null };
    const promise = new Promise((resolve, reject) => Object.assign(attempt, { resolve, reject }));
    this.loginPromise = promise;
    this.loginAttempt = attempt;
    this.setState('CONNECTING', this.url);
    if (this.loginAttempt !== attempt) return promise;
    try {
      this.assertTransport();
      const socket = new this.WebSocketImpl(this.url);
      socket.binaryType = 'arraybuffer';
      this.socket = socket;
      const frame = this.codec.encode('LoginRequest', this.bumpSeqNo(), loginBody || {});
      const current = () => this.loginAttempt === attempt && this.socket === socket;
      attempt.timer = setTimeout(() => {
        if (current()) this.finishConnection('FAILED', new Error('login timeout'), 'loginTimeout');
      }, timeout);
      socket.onopen = () => {
        if (!current()) return;
        try {
          this.emit('frame', { dir: 'out', name: 'LoginRequest', seq: this.sendSeqNo, bytes: frame });
          this.assertTransport();
          if (!current()) return;
          socket.send(frame);
        } catch (error) {
          this.finishConnection('FAILED', error, 'loginSendFailed');
        }
      };
      socket.onerror = () => {
        if (current()) this.finishConnection('FAILED', new Error('socket error during login'), 'loginSocketError');
      };
      socket.onclose = (event) => { if (current()) this.onClose(event); };
      socket.onmessage = (event) => {
        if (!current()) return;
        try {
          const decoded = this.codec.decode(event.data);
          if (decoded.name !== 'LoginResponse') throw new Error('unexpected auth reply: ' + decoded.name);
          const body = decoded.body;
          if (body.result !== 0) {
            const error = new Error('login rejected: result=' + body.result + ' ' + (body.errorMessage || ''));
            error.loginResponse = body;
            this.finishConnection('REJECTED', error, 'loginRejected');
            return;
          }
          clearTimeout(attempt.timer);
          attempt.timer = null;
          this.sendSeqNo = body.initSeqNo ?? 0;
          this.recvSeqNo = null;
          this.nextAckSeqNo = null;
          this.lastResponseAt = Date.now();
          this.loginResponse = body;
          socket.onmessage = (message) => { if (this.socket === socket) this.onMessage(message.data); };
          socket.onclose = (closed) => { if (this.socket === socket) this.onClose(closed); };
          socket.onerror = () => {
            if (this.socket !== socket) return;
            const error = new Error('socket error');
            this.finishConnection('FAILED', error, 'socketError');
            if (this.listenerCount('error')) this.emit('error', error);
          };
          socket.onopen = null;
          this.lastPingTimestamp = 0;
          this.setState('READY', 'player=' + (body.playerInfo?.nickname ?? '') + ' initSeqNo=' + body.initSeqNo);
          if (!current()) return;
          this.sendPing(Date.now());
          if (!current()) return;
          this.tickTimer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
          this.loginAttempt = null;
          this.loginPromise = null;
          attempt.resolve(body);
          this.emit('login', body);
        } catch (error) {
          if (this.socket === socket) this.finishConnection('FAILED', error, 'loginFailed');
        }
      };
    } catch (error) {
      this.finishConnection('FAILED', error, 'connectFailed');
    }
    return promise;
  }

  // Every terminal path releases resources before publishing its final state.
  finishConnection(state, error, reason = state.toLowerCase()) {
    this.recordHeartbeat('TERMINAL', { state });
    this.gameClock.reset();
    const attempt = this.loginAttempt;
    this.loginAttempt = null;
    this.loginPromise = null;
    this.loginResponse = null;
    this.lateResponses.clear();
    this.promptUncertain = false;
    if (attempt) clearTimeout(attempt.timer);
    if (this.tickTimer !== null) clearInterval(this.tickTimer);
    if (this.ackTimer !== null) clearTimeout(this.ackTimer);
    this.tickTimer = null;
    this.ackTimer = null;
    this.nextAckSeqNo = null;
    this.lastPingTimestamp = 0;
    for (const entry of [...this.pending.splice(0), ...this.watchers.splice(0)]) {
      clearTimeout(entry.timer);
      entry.cleanup?.();
      if (entry.mutate && entry.sent !== undefined) this.uncertainWrites.add(entry.key);
      entry.reject(error);
    }
    this.discardSocket(reason);
    this.setState(state, error?.message);
    attempt?.reject(error);
  }

  bumpSeqNo() {
    this.sendSeqNo = nextSeqNo(this.sendSeqNo);
    return this.sendSeqNo;
  }

  send(name, body, { signal, onDispatch, beforeDispatch } = {}) {
    let transportEntered = false;
    try {
      if (!this.connected) throw Object.assign(new Error('not connected'),{code:'CANCELLED'});
      const seq = this.bumpSeqNo();
      const frame = this.codec.encode(name, seq, body || {});
      this.emit('frame', { dir: 'out', name, seq, bytes: frame, body });
      if (signal?.aborted) {
        const error = new Error('execution cancelled before dispatch');
        error.code = 'CANCELLED';
        throw error;
      }
      if (!this.connected) throw Object.assign(new Error('not connected'),{code:'CANCELLED'});
      this.assertTransport();
      // Encoding, frame listeners and the writer fence can block synchronously.
      // The caller rechecks current business eligibility after all of them.
      beforeDispatch?.();
      onDispatch?.(seq);
      transportEntered = true;
      this.socket.send(frame);
      return seq;
    } catch(error) {
      if(!transportEntered) {
        // A fresh wrapper proves this occurrence only; a reused Error from a
        // prior failed attempt must never attest a later socket failure.
        const local = new Error(error?.message ?? String(error), {cause:error});
        if(error?.code!==undefined)local.code=error.code;
        if(error?.name==='AbortError')local.name='AbortError';
        undispatchedErrors.set(local,beforeDispatch);
        throw local;
      }
      throw error;
    }
  }

  sendNoSeq(name, body) {
    if (!this.connected) return false;
    const frame = this.codec.encode(name, 0, body || {});
    this.emit('frame', { dir: 'out', name, seq: 0, bytes: frame, body });
    this.assertTransport();
    this.socket.send(frame);
    return true;
  }

  request(name, body, responseName = name.slice(0, -7) + 'Response', timeout = 15000, { mutate = false, signal, beforeDispatch } = {}) {
    // Responses carry no request id: only equivalent requests can share one response.
    let key;
    try {
      key = Array.from(this.codec.encode(name, 0, body || {})).join(',');
    } catch (error) {
      return Promise.reject(error);
    }
    if (signal?.aborted) {
      const error = new Error('execution cancelled before dispatch');
      error.code = 'CANCELLED';
      return Promise.reject(error);
    }
    if (mutate && this.uncertainWrites.has(key)) {
      const error = new Error('previous write remains unverified: ' + name);
      error.code = 'WRITE_UNCERTAIN';
      return Promise.reject(error);
    }
    if (this.lateResponses.has(responseName)) {
      const error = new Error('previous request timed out; response is still uncorrelated: ' + responseName);
      error.code = 'RESPONSE_UNCERTAIN';
      return Promise.reject(error);
    }
    const existing = this.pending.find((entry) => entry.responseName === responseName);
    if (existing) {
      if (existing.name === name && existing.key === key) return existing.promise;
      const error = new Error('conflicting request already waiting for ' + responseName);
      error.code = 'RESPONSE_CONFLICT';
      return Promise.reject(error);
    }
    const entry = { name, responseName, key, mutate, timer: null, order: this.sendOrder++, promise: null };
    entry.promise = new Promise((resolve, reject) => Object.assign(entry, { resolve, reject }));
    entry.timer = setTimeout(() => {
      this.pending = this.pending.filter((item) => item !== entry);
      this.lateResponses.add(responseName);
      if (entry.mutate && entry.sent !== undefined) this.uncertainWrites.add(key);
      this.promptUncertain = true;
      const error = new Error('timeout waiting for ' + responseName + ' (sent ' + name + ')');
      error.code = 'RESPONSE_TIMEOUT';
      entry.reject(error);
    }, timeout);
    this.pending.push(entry);
    try {
      this.send(name, body, { signal, beforeDispatch, onDispatch: (seq) => { entry.sent = seq; } });
    } catch (error) {
      if (entry.mutate && entry.sent !== undefined) this.uncertainWrites.add(key);
      clearTimeout(entry.timer);
      this.pending = this.pending.filter((item) => item !== entry);
      entry.reject(error);
    }
    return entry.promise;
  }

  // Silence proves dispatch only. Keep an unresolved fingerprint so the same
  // write cannot be re-sent after timeout, cancellation or reconnection.
  sendWatch(name, body, { window = 350, signal, beforeDispatch } = {}) {
    if (signal?.aborted) {
      const error = new Error('execution cancelled');
      error.code = 'CANCELLED';
      return Promise.reject(error);
    }
    let key;
    try { key = Array.from(this.codec.encode(name, 0, body || {})).join(','); }
    catch (error) { return Promise.reject(error); }
    if (this.uncertainWrites.has(key) || this.watchers.some((entry) => entry.key === key)) {
      const error = new Error('previous write remains unverified: ' + name);
      error.code = 'WRITE_UNCERTAIN';
      return Promise.reject(error);
    }
    const watcher = { name, key, mutate: true, order: this.sendOrder++, timer: null };
    const promise = new Promise((resolve, reject) => Object.assign(watcher, { resolve, reject }));
    const cleanup = () => {
      watcher.settled = true;
      signal?.removeEventListener('abort', cancel);
    };
    const uncertain = () => {
      if (watcher.sent !== undefined) {
        this.uncertainWrites.add(key);
      }
    };
    const cancel = () => {
      if (watcher.settled) return;
      this.watchers = this.watchers.filter((entry) => entry !== watcher);
      clearTimeout(watcher.timer);
      cleanup();
      uncertain();
      const error = new Error('execution cancelled; dispatched write is unverified');
      error.code = 'CANCELLED';
      if(watcher.sent===undefined)undispatchedErrors.set(error,beforeDispatch);
      watcher.reject(error);
    };
    watcher.cleanup = cleanup;
    this.watchers.push(watcher);
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      this.send(name, body, { signal, beforeDispatch, onDispatch: (seq) => { watcher.sent = seq; } });
      // Synchronous prompts, close and abort callbacks already settled this watcher.
      if (watcher.settled) return promise;
      if (signal?.aborted) { cancel(); return promise; }
      watcher.timer = setTimeout(() => {
        this.watchers = this.watchers.filter((entry) => entry !== watcher);
        cleanup();
        uncertain();
        if (watcher.ambiguousPrompt) {
          const error = new Error('uncorrelated server prompt while waiting for ' + name);
          error.code = 'AMBIGUOUS_PROMPT';
          watcher.reject(error);
        } else {
          watcher.resolve({ sent: watcher.sent, name, status: 'UNKNOWN', ok: null });
        }
      }, window);
    } catch (error) {
      this.watchers = this.watchers.filter((entry) => entry !== watcher);
      cleanup();
      uncertain();
      watcher.reject(error);
    }
    return promise;
  }

  // A typed acknowledgement is insufficient when the authoritative post-read failed.
  markUnverifiedWrite(name, body) {
    const key = Array.from(this.codec.encode(name, 0, body || {})).join(',');
    this.uncertainWrites.add(key);
    return key;
  }

  // Only a caller that re-read and verified the effect may release this write.
  confirmWatchedWrite(name, body) {
    const key = Array.from(this.codec.encode(name, 0, body || {})).join(',');
    return this.uncertainWrites.delete(key);
  }

  // PromptResponse has no correlation id. Multiple candidates must not be guessed.
  attributePrompt(body) {
    const candidates = [...this.pending, ...this.watchers];
    const uncertain = this.promptUncertain || this.uncertainWrites.size > 0;
    if (candidates.length !== 1 || uncertain) {
      if (candidates.length > 1 || uncertain) {
        this.promptUncertain = true;
        for (const entry of candidates) entry.ambiguousPrompt = true;
        this.emit('promptAmbiguous', { requests: candidates.map((entry) => entry.name) });
      }
      return;
    }
    const entry = candidates[0];
    const reason = (body?.args ?? []).join(' ') || 'prompt=' + body?.prompt;
    const error = new Error('server prompt: ' + reason);
    error.prompt = body;
    error.request = entry.name;
    this.pending = this.pending.filter((item) => item !== entry);
    this.watchers = this.watchers.filter((item) => item !== entry);
    clearTimeout(entry.timer);
    entry.cleanup?.();
    entry.reject(error);
  }

  recordHeartbeat(kind, values = {}) {
    this.heartbeatDiagnostics.push({ kind, at: Date.now(), ...values });
    if (this.heartbeatDiagnostics.length > 20) this.heartbeatDiagnostics.shift();
  }

  clockDiagnostics() { return { clock: this.gameClock.read(this.factContext), events: structuredClone(this.heartbeatDiagnostics), pingTimeoutMs: PING_TIMEOUT_MS, tickIntervalMs: TICK_INTERVAL_MS }; }

  sendPing(timestamp) {
    this.lastPingTimestamp = timestamp;
    this.gameClock.markPing(timestamp);
    this.recordHeartbeat('PING', { outstandingAgeMs: 0 });
    this.sendNoSeq('PingRequest', { clientTimestamp: timestamp });
  }

  tryHandlePong(body) {
    if (!this.lastPingTimestamp) return false;
    // The server echoes our timestamp back as an int64, which decodes to the
    // long-form { low, high } object when no Long library is installed.
    const echoed = toNumber(body?.clientTimestamp);
    if (echoed !== this.lastPingTimestamp) return false;
    const now = Date.now();
    const clockFact = this.gameClock.observePong(body);
    this.recordHeartbeat('PONG', { roundTripMs: Math.max(0, now - echoed), trusted: clockFact?.reliable === true });
    this.lastPingTimestamp = 0;
    const sample = 0.4 * (now - echoed) + 0.6 * this.latencyMs;
    this.latencyMs = Math.round(Math.max(sample, 0));
    this.serverClockOffsetMs = Math.round(toNumber(body.serverTimestamp) - now + sample / 2);
    this.emit('pong', { latencyMs: this.latencyMs, offsetMs: this.serverClockOffsetMs });
    return true;
  }

  onMessage(data) {
    let decoded;
    try {
      decoded = this.codec.decode(data);
    } catch (error) {
      this.emit('error', new Error(`decode failed: ${error.message}`));
      return;
    }
    this.lastResponseAt = Date.now();
    const { seq, name, body } = decoded;
    if (name === 'PingResponse' && this.tryHandlePong(body)) return;

    if (!this.handleSeqNo(seq, name)) return;
    this.emit('message', { seq, name, body });

    if (name === 'ResendFailed') {
      this.finishConnection('FAILED', new Error('resend failed'), 'resendFailed');
      this.emit('fatal', { reason: 'ResendFailed', seqNo: body.seqNo });
      return;
    }
    if (name === 'SCChannelExpired') {
      this.finishConnection('EXPIRED', new Error('channel expired'), 'channelExpired');
      this.emit('fatal', { reason: 'SCChannelExpired', detail: body.reason });
      return;
    }
    // 业务拦截：服务端拒绝一个请求时不回 *Response，而是推一条 PromptResponse。
    // 不处理的话每次被拒都要干等满超时。
    if (name === 'PromptResponse') {
      this.emit('prompt', body);
      this.attributePrompt(body);
      return;
    }
    if (this.lateResponses.delete(name)) {
      this.emit('drop', { reason: 'lateResponse', name, seq });
      return;
    }
    const index = this.pending.findIndex((item) => item.responseName === name);
    if (index >= 0) {
      const [entry] = this.pending.splice(index, 1);
      clearTimeout(entry.timer);
      entry.resolve(body);
    }
  }

  handleSeqNo(seq, name) {
    if (seq > 0 && seq <= MAX_SEQ) {
      if (this.recvSeqNo === null) {
        this.recvSeqNo = seq;
      } else if (seq !== nextSeqNo(this.recvSeqNo)) {
        if (isSeqNoInRange(seq, this.recvSeqNo)) {
          this.ack(this.recvSeqNo);
          this.emit('drop', { reason: 'duplicate', name, seq, recvSeqNo: this.recvSeqNo });
        } else {
          this.sendNack(this.recvSeqNo);
          this.emit('drop', { reason: 'gap', name, seq, recvSeqNo: this.recvSeqNo });
        }
        return false;
      } else {
        this.recvSeqNo = seq;
        this.ack(seq);
      }
    }
    return true;
  }

  ack(seq) {
    if (this.nextAckSeqNo === null) {
      this.nextAckSeqNo = seq;
    } else if (!isSeqNoInRange(seq, this.nextAckSeqNo)) {
      this.nextAckSeqNo = seq;
    }
    if (this.ackTimer === null) {
      this.ackTimer = setTimeout(() => {
        this.ackTimer = null;
        if (this.nextAckSeqNo !== null) {
          try {
            this.sendNoSeq('Ack', { seqNo: this.nextAckSeqNo });
          } catch (error) {
            this.finishConnection('FAILED', error, 'ackSendFailed');
          }
          this.nextAckSeqNo = null;
        }
      }, ACK_DELAY_MS);
    }
  }

  sendNack(seqNo) {
    this.sendNoSeq('Nack', { seqNo });
  }

  tick() {
    const observedAt = Date.now(), tickGapMs = this.lastTickAt === null ? null : Math.max(0, observedAt - this.lastTickAt);
    this.lastTickAt = observedAt;
    if (tickGapMs !== null && tickGapMs > TICK_INTERVAL_MS + 100) this.recordHeartbeat('TICK_DELAY', { tickGapMs });
    if (!this.stopping) {
      const now = Date.now();
      if (this.connected) {
        if (this.lastPingTimestamp > 0) {
          if (now - this.lastPingTimestamp > PING_TIMEOUT_MS) {
            this.emit('warn', 'ping timeout');
            this.finishConnection('FAILED', new Error('ping timeout'), 'pingTimeout');
          }
        } else {
          try {
            this.sendPing(now);
          } catch (error) {
            this.finishConnection('FAILED', error, 'pingSendFailed');
          }
        }
      }
    }
    this.emit('tick', this.snapshot());
  }

  snapshot() {
    return {
      state: this.state,
      url: this.url,
      connected: this.connected,
      latencyMs: this.latencyMs,
      offsetMs: this.serverClockOffsetMs,
      sendSeqNo: this.sendSeqNo,
      recvSeqNo: this.recvSeqNo,
      lastResponseAt: this.lastResponseAt,
    };
  }

  discardSocket(reason) {
    if (!this.socket) return;
    const socket = this.socket;
    this.socket = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    socket.onopen = null;
    try {
      socket.close(4001, reason);
    } catch {
      /* already closing */
    }
  }

  onClose(event) {
    const error = new Error('socket closed: ' + (event?.code ?? '') + ' ' + (event?.reason || ''));
    this.finishConnection(this.stopping ? 'STOPPED' : 'CLOSED', error, 'socketClosed');
    this.emit('close', { code: event?.code, reason: event?.reason });
  }

  stop() {
    this.stopping = true;
    if (!this.socket && !this.loginAttempt && ['FAILED', 'CLOSED', 'REJECTED', 'EXPIRED', 'STOPPED'].includes(this.state)) return;
    this.finishConnection('STOPPED', new Error('client stopped'), 'stop');
  }
}
