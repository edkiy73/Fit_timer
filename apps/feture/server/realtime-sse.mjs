// @ts-check
/** Realtime «something new» signals over Server-Sent Events, on our own server (docs/infra/migration-plan.md, day 3).
 * Replaces Supabase Broadcast with the same model (server/realtime.mjs, S2 §8): a channel is an opaque token only its
 * profile's current members get in `session.bootstrap`, a message carries only the kind (and the opaque typing tag),
 * and the client then fetches with the normal commands. Holding the token is the whole permission — as with the public
 * Broadcast channels — so no session is needed here and nothing private ever travels on this stream.
 *
 * One Node process (server/host.mjs) holds every connection, so the hub is a module-level singleton: api/fe.mjs sends
 * into it, the host serves `GET /api/fe-events?c=<token>,<token>` from it, and the queue worker tick (a request to the
 * same process) reaches it too. A second app process would need a shared bus (Postgres LISTEN/NOTIFY) — not now.
 * @typedef {import('./realtime.mjs').Sender} Sender
 */

const TOKEN_RE = /^fe:[A-Za-z0-9_-]{22,64}$/;
/** An account acts as itself and at most one couple; a little headroom, never a fan-out over many channels. */
const MAX_CHANNELS = 4;
const HEARTBEAT_MS = 25_000;

/** @typedef {(event: {c: string, k: string, t?: string}) => void} Subscriber */

export function createHub({ maxPerAddress = 20, maxTotal = 20_000 } = {}) {
  /** @type {Map<string, Set<Subscriber>>} */
  const byTopic = new Map();
  /** @type {Map<string, number>} */
  const perAddress = new Map();
  let total = 0;

  /** @param {string[]} topics @param {Subscriber} fn @returns {() => void} */
  function subscribe(topics, fn) {
    for (const t of topics) {
      let set = byTopic.get(t);
      if (!set) byTopic.set(t, set = new Set());
      set.add(fn);
    }
    return () => {
      for (const t of topics) {
        const set = byTopic.get(t);
        if (!set) continue;
        set.delete(fn);
        if (!set.size) byTopic.delete(t);
      }
    };
  }

  /** The `Sender` of `createSignals` (same message shape as Broadcast). @type {Sender} */
  const sender = async messages => {
    for (const m of messages) {
      const set = byTopic.get(m.topic);
      if (!set) continue;
      const event = { c: m.topic, k: m.payload.k, ...(typeof m.payload.t === 'string' ? { t: m.payload.t } : {}) };
      for (const fn of [...set]) { try { fn(event); } catch { /* a broken connection never stops the others */ } }
    }
  };

  /** `GET /api/fe-events?c=…` — the stream. @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res */
  function handle(req, res) {
    // Tokens are the permission, so any origin may listen (the web app, the Android WebView on https://localhost).
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    const refuse = (/** @type {number} */ status, /** @type {string} */ error) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error }));
    };
    if (req.method !== 'GET') return refuse(405, 'method');
    const raw = new URL(String(req.url || '/'), 'http://x').searchParams.get('c') ?? '';
    const topics = [...new Set(raw.split(',').filter(Boolean))];
    if (!topics.length || topics.length > MAX_CHANNELS || !topics.every(t => TOKEN_RE.test(t))) return refuse(400, 'channels');
    // Caddy sets X-Forwarded-For to the real client (deploy/Caddyfile); one address cannot hold the server open.
    const address = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    if (total >= maxTotal || (perAddress.get(address) ?? 0) >= maxPerAddress) return refuse(429, 'too_many');

    total++;
    perAddress.set(address, (perAddress.get(address) ?? 0) + 1);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    // retry: how long the browser waits before reconnecting by itself; the comment opens the stream at once.
    res.write('retry: 5000\n: ok\n\n');
    const unsubscribe = subscribe(topics, e => { res.write(`data: ${JSON.stringify(e)}\n\n`); });
    const beat = setInterval(() => res.write(': hb\n\n'), HEARTBEAT_MS);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(beat);
      unsubscribe();
      total--;
      const n = (perAddress.get(address) ?? 1) - 1;
      if (n > 0) perAddress.set(address, n); else perAddress.delete(address);
    };
    req.on('close', close);
    res.on('close', close);
    res.on('error', close);
  }

  return { subscribe, sender, handle, stats: () => ({ connections: total, topics: byTopic.size }) };
}

/** The process-wide hub (see above). */
export const hub = createHub();
