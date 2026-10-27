// @ts-check
import { b64url, hmac } from './hash.mjs';

/** Realtime «something new» signals (docs/server/S2-API.md §8). Data never travels here: a client that hears a
 * signal fetches with the normal commands. No JWT secret is needed: each profile listens on a public Supabase
 * Broadcast channel whose name is an opaque token only its current members get (in `session.bootstrap`):
 * `fe:` + base64url(HMAC-SHA256(FETURE_ID_PEPPER, 'rt:' + profileId + ':' + sorted active member account ids)).
 * Binding the name to the member set means an ex-partner's old token goes quiet once the couple changes.
 * The payload is only the kind (`{k}`): no ids, names or text, so someone holding a leaked token learns only
 * that «something of this kind happened now».
 * Sending is best-effort: errors and timeouts are swallowed, a command or a worker tick never fails because of it.
 * @typedef {import('./db.mjs').Q} Q
 * @typedef {'chat' | 'notify' | 'decide' | 'feed'} Kind
 * @typedef {{profile: string, kind: Kind}} Signal
 * @typedef {(messages: {topic: string, event: string, payload: {k: Kind}, private: false}[]) => Promise<void>} Sender
 * @typedef {{send: (signals: Signal[]) => Promise<void>, channels: (q: Q, profileIds: string[]) => Promise<Record<string, string>>}} Signals
 */

export const KINDS = /** @type {const} */ (['chat', 'notify', 'decide', 'feed']);
const BATCH = 100; // messages per REST call (a worker tick may notify many profiles)
const TOKEN_CHARS = 32; // 192 bits of the HMAC; at least 22 chars (128 bits) are required

/** @param {string} pepper @param {string} profileId @param {string[]} memberAccountIds */
export function channelFor(pepper, profileId, memberAccountIds) {
  if (!pepper) throw new Error('pepper_missing');
  const members = [...memberAccountIds].sort().join(',');
  return 'fe:' + b64url(hmac(pepper, `rt:${profileId}:${members}`)).slice(0, TOKEN_CHARS);
}

/** Supabase Realtime REST broadcast (batch endpoint). @param {{url: string, secret: string, timeoutMs?: number,
 * fetch?: typeof fetch}} opts @returns {Sender} */
export function broadcastSender({ url, secret, timeoutMs = 1000, fetch: f = fetch }) {
  const endpoint = url.replace(/\/$/, '') + '/realtime/v1/api/broadcast';
  return async messages => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await f(endpoint, {
        method: 'POST',
        headers: { apikey: secret, Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error('realtime_http_' + res.status);
    } finally { clearTimeout(timer); }
  };
}

/** @param {{db: Q, pepper: string, sender: Sender | null, onError?: (code: string) => void}} deps @returns {Signals} */
export function createSignals({ db, pepper, sender, onError = () => {} }) {
  /** @param {Q} q @param {string[]} profileIds */
  const channels = async (q, profileIds) => {
    const ids = [...new Set(profileIds)];
    if (!ids.length || !pepper) return {};
    const rows = await q.query(
      `select profile_id, array_agg(account_id::text) members from feture.profile_member
       where profile_id = any($1) and state = 'active' group by profile_id`, [ids]);
    return Object.fromEntries(rows.map(r => [r.profile_id, channelFor(pepper, r.profile_id, r.members)]));
  };
  return {
    channels,
    async send(signals) {
      if (!sender || !signals.length) return;
      try {
        const wanted = signals.filter(s => s.profile && KINDS.includes(s.kind));
        const topics = await channels(db, wanted.map(s => s.profile));
        const seen = new Set();
        const messages = [];
        for (const s of wanted) {
          const topic = topics[s.profile];
          if (!topic || seen.has(topic + s.kind)) continue;
          seen.add(topic + s.kind);
          messages.push({ topic, event: 'new', payload: { k: s.kind }, private: /** @type {const} */ (false) });
        }
        for (let i = 0; i < messages.length; i += BATCH) await sender(messages.slice(i, i + BATCH));
      } catch (error) {
        try { onError(error instanceof Error && /^[a-z_0-9]+$/.test(error.message) ? error.message : 'realtime_error'); } catch { /* never */ }
      }
    },
  };
}
