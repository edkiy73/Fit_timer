// @ts-check
import { b64url, hmac } from './hash.mjs';
import { ENTITIES } from './live.mjs';

/** Realtime «something new» signals (docs/server/S2-API.md §8). Data never travels here: a client that hears a
 * signal fetches with the normal commands. Delivery is Server-Sent Events from our own server (server/realtime-sse.mjs,
 * `GET /api/fe-events`); this file decides who hears what. Each profile has one channel whose name is an opaque token
 * only its current members get (in `session.bootstrap`):
 * `fe:` + base64url(HMAC-SHA256(FETURE_ID_PEPPER, 'rt:' + profileId + ':' + sorted active member account ids)).
 * Binding the name to the member set means an ex-partner's old token goes quiet once the couple changes.
 * The payload is only the kind (`{k}`): no ids, names or text, so someone holding a leaked token learns only
 * that «something of this kind happened now».
 * Sending is best-effort: errors are swallowed, a command or a worker tick never fails because of it.
 * @typedef {import('./db.mjs').Q} Q
 * `typing` (owner, 28.10: «печатает…») is the one kind with a second field: `t`, an opaque per-conversation tag
 * (typingTag) that only the conversation's members get in chat.messages, so a client can tell which chat it is
 * about; it is never stored and carries no ids, names or text either.
 * `changed` (owner 03.11.2026, server/live.mjs) carries the entity that changed in `t` (profile, couple, check, media, post,
 * counts, chat, decide, boot): a code from a fixed list, never an id.
 * @typedef {'chat' | 'notify' | 'decide' | 'typing' | 'changed'} Kind
 * @typedef {{profile: string, kind: Kind, tag?: string | undefined}} Signal
 * @typedef {(messages: {topic: string, event: string, payload: {k: Kind, t?: string}}[]) => Promise<void>} Sender
 * @typedef {{send: (signals: Signal[]) => Promise<void>, channels: (q: Q, profileIds: string[]) => Promise<Record<string, string>>}} Signals
 */

export const KINDS = /** @type {const} */ (['chat', 'notify', 'decide', 'typing', 'changed']);
/** The tag a signal of this kind may carry. @param {Kind} kind @param {unknown} tag */
const tagOf = (kind, tag) => typeof tag !== 'string' ? undefined
  : kind === 'typing' ? tag : kind === 'changed' && /** @type {readonly string[]} */ (ENTITIES).includes(tag) ? tag : undefined;

/** The typing tag of a conversation: opaque, stable, only for its members. @param {string} pepper @param {string} conversationId */
export function typingTag(pepper, conversationId) {
  if (!pepper) throw new Error('pepper_missing');
  return b64url(hmac(pepper, `typing:${conversationId}`)).slice(0, 16);
}
const BATCH = 100; // messages handed to the sender at once (a worker tick may notify many profiles)
const TOKEN_CHARS = 32; // 192 bits of the HMAC; at least 22 chars (128 bits) are required

/** @param {string} pepper @param {string} profileId @param {string[]} memberAccountIds */
export function channelFor(pepper, profileId, memberAccountIds) {
  if (!pepper) throw new Error('pepper_missing');
  const members = [...memberAccountIds].sort().join(',');
  return 'fe:' + b64url(hmac(pepper, `rt:${profileId}:${members}`)).slice(0, TOKEN_CHARS);
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
        // A `changed` signal without a known entity says nothing: it is dropped, never sent bare.
        const wanted = signals.filter(s => s.profile && KINDS.includes(s.kind) && (s.kind !== 'changed' || tagOf(s.kind, s.tag)));
        const topics = await channels(db, wanted.map(s => s.profile));
        const seen = new Set();
        const messages = [];
        for (const s of wanted) {
          const topic = topics[s.profile];
          const tag = tagOf(s.kind, s.tag);
          if (!topic || seen.has(topic + s.kind + (tag ?? ''))) continue;
          seen.add(topic + s.kind + (tag ?? ''));
          messages.push({ topic, event: 'new', payload: tag ? { k: s.kind, t: tag } : { k: s.kind } });
        }
        for (let i = 0; i < messages.length; i += BATCH) await sender(messages.slice(i, i + BATCH));
      } catch (error) {
        try { onError(error instanceof Error && /^[a-z_0-9]+$/.test(error.message) ? error.message : 'realtime_error'); } catch { /* never */ }
      }
    },
  };
}
