import { redact } from '../src/security.mjs';

// B2-only instrumentation. Importing this module never reads credentials or opens a socket.
export function createB2Diagnostics({ getSecrets = () => [], persistFirstFailure = () => {}, now = () => new Date().toISOString() } = {}) {
  let firstFailure = null, client = null, lastIncoming = null, lastOutgoing = null, failedMessage = null, close = null;
  const events = [];
  const safe = value => redact(value, getSecrets());
  const copy = value => value === null ? null : structuredClone(value);
  function record(event) {
    events.push(safe({ at: now(), ...event }));
    if (events.length > 500) events.shift();
  }
  function errorFields(error, seen = new Set()) {
    if (!error || typeof error !== 'object') return { name: 'Error', message: String(error ?? 'Unknown failure') };
    if (seen.has(error)) return { name: 'Error', message: '[Circular cause]' };
    seen.add(error);
    const value = { name: String(error.name ?? 'Error'), message: String(error.message ?? 'Unknown failure') };
    if (typeof error.code === 'string' || typeof error.code === 'number') value.code = error.code;
    if (typeof error.stack === 'string') value.stack = error.stack;
    if (error.cause !== undefined && seen.size < 8) value.cause = errorFields(error.cause, seen);
    // Never serialize arbitrary Error properties such as loginResponse or raw frame material.
    return value;
  }
  function capture(error, context = {}) {
    if (firstFailure) return copy(firstFailure);
    firstFailure = safe({
      at: now(), beforeState: context.beforeState ?? client?.state ?? null,
      state: context.state ?? client?.state ?? null,
      eventType: context.eventType ?? 'error',
      messageType: Object.hasOwn(context, 'messageType') ? context.messageType : failedMessage ?? lastIncoming ?? lastOutgoing ?? null,
      lastIncoming, lastOutgoing, error: errorFields(error),
      ...((context.close ?? close) ? { close: context.close ?? close } : {}),
    });
    // Store the snapshot before terminal state listeners can abort or clear the Session.
    try { persistFirstFailure(copy(firstFailure)); }
    catch { record({ eventType: 'diagnosticPersistenceFailed' }); }
    return copy(firstFailure);
  }
  function attach(instance) {
    if (client === instance) return;
    if (client) throw new Error('B2 diagnostics already owns a Runtime');
    client = instance;
    const sendNoSeq = client.sendNoSeq.bind(client);
    client.sendNoSeq = (name, body) => {
      lastOutgoing = name;
      try {
        if (!['PingRequest', 'Ack'].includes(name)) throw new Error('Unapproved no-sequence send blocked');
        return sendNoSeq(name, body);
      } catch (error) { failedMessage = name; throw error; }
    };
    const finishConnection = client.finishConnection.bind(client);
    client.finishConnection = (state, error, reason) => {
      if (['FAILED', 'REJECTED', 'CLOSED', 'EXPIRED'].includes(state)) {
        capture(error, { beforeState: client.state, state, eventType: reason ?? state.toLowerCase() });
      }
      return finishConnection(state, error, reason);
    };
    const onClose = client.onClose.bind(client);
    client.onClose = event => {
      close = { code: event?.code ?? null, reason: event?.reason ?? '' };
      try { return onClose(event); } finally { close = null; }
    };
    const decode = client.codec.decode.bind(client.codec);
    client.codec.decode = bytes => {
      try {
        const decoded = decode(bytes);
        lastIncoming = decoded.name;
        failedMessage = null;
        // Authentication is observed before the first Ping, not only via the later login event.
        if (client.state === 'CONNECTING') record({ eventType: 'authResponse', messageType: decoded.name, seq: decoded.seq,
          ...(decoded.name === 'LoginResponse' && typeof decoded.body?.result === 'number' ? { result: decoded.body.result } : {}) });
        return decoded;
      } catch (error) {
        capture(error, { eventType: 'decodeFailed', state: 'FAILED', messageType: null });
        throw error;
      }
    };
    client.on('frame', ({ dir, name }) => { if (dir === 'out') lastOutgoing = name; });
    client.on('state', ({ state, detail }) => record({ eventType: 'state', state, detail }));
    client.on('close', event => record({ eventType: 'close', code: event?.code ?? null, reason: event?.reason ?? '' }));
  }
  return { attach, capture, getFirstFailure: () => copy(firstFailure), getEvents: () => copy(events) };
}
