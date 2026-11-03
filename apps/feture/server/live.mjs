// @ts-check
/** Live data (owner 03.11.2026: «данные не обновляются сами, только после перезапуска»). Every change that another
 * screen, device or partner shows sends a realtime `changed` signal with an entity tag right after its command committed
 * (server/handler.mjs) or after the worker tick that made it (server/jobs.mjs). Like every signal it carries no ids, names
 * or text: only «something of this kind changed now» (server/realtime.mjs); the app then refetches the reads of that
 * entity (src/fe/live.ts). `boot` means the bootstrap (profiles, couple status, channel tokens) changed: the app reads
 * `session.bootstrap` again and joins the new channels.
 * @typedef {import('./db.mjs').Q} Q @typedef {import('./realtime.mjs').Signal} Signal
 * @typedef {'profile' | 'couple' | 'check' | 'media' | 'post' | 'counts' | 'chat' | 'decide' | 'boot'} Entity
 * @typedef {{topic: string, profileId: string | null, for?: unknown}} Enqueued an outbox item as `enqueue()` wrote it
 */

export const ENTITIES = /** @type {const} */ (['profile', 'couple', 'check', 'media', 'post', 'counts', 'chat', 'decide', 'boot']);

/** @type {Record<string, readonly Entity[]>} */
const NONE = {};
const POST = /** @type {const} */ (['post', 'counts']);
const DECIDE = /** @type {const} */ (['decide', 'counts']);
const BOOT = /** @type {const} */ (['couple', 'boot', 'counts']);
const STATE = /** @type {const} */ (['profile', 'boot', 'counts']);
const CHECK = /** @type {const} */ (['check', 'profile', 'counts']);

/** topic → what it changes for the people it is addressed to. A topic not listed changes counts only (a notification
 * row comes with the worker tick); history, staff markers and delivery plumbing change nothing anyone shows. */
export const TOPIC_ENTITIES = /** @type {Record<string, readonly Entity[]>} */ (Object.freeze({
  ...NONE,
  'like.received': ['counts'], 'like.withdrawn': ['counts'],
  'match.created': ['chat', 'counts'], 'match.ended': ['chat', 'counts'], 'chat.requested': ['chat', 'counts'], 'chat.accepted': ['chat', 'counts'],
  'message.created': [], // chats signal `chat` themselves (server/commands/chats.mjs)
  'follow.created': ['profile', 'counts'],
  'reply.created': POST, 'reaction.created': POST, 'mention.created': POST, 'mention.removed': POST, 'tag.answered': POST,
  'post.disputed': POST, 'post.restored': POST, 'dispute.resolved': POST, 'revision.approved': POST, 'revision.rejected': POST,
  'post.returned': POST, 'discussion.removed': POST,
  'content.removed': ['post', 'media', 'counts'],
  'tag.requested': DECIDE, 'access.requested': DECIDE, 'community.requested': DECIDE, 'event.applied': DECIDE,
  'link.proposed': DECIDE, 'link.changeProposed': DECIDE, 'decide.created': DECIDE,
  'decide.resolved': ['decide', 'couple', 'counts'],
  'access.granted': ['profile', 'counts'], 'access.revoked': ['profile'], 'access.declined': ['profile'],
  'link.accepted': ['profile', 'counts'], 'link.declined': ['profile', 'counts'], 'link.changed': ['profile', 'counts'], 'link.removed': ['profile', 'counts'],
  'profile.suspended': STATE, 'profile.restored': STATE, 'profile.restricted': STATE, 'profile.unrestricted': STATE,
  'couple.invited': ['decide', 'couple', 'counts'], 'couple.declined': ['couple', 'counts'], 'couple.inviteExpired': ['couple', 'counts'],
  'couple.created': BOOT, 'couple.deleted': BOOT, 'couple.stopped': BOOT, 'couple.restored': BOOT, 'couple.narrowed': BOOT,
  'couple.approvalChanged': BOOT,
  'couple.restoreRequested': ['couple', 'decide', 'counts'], 'couple.changed': ['couple', 'profile', 'counts'],
  'verification.decided': CHECK, 'verification.photoDecided': CHECK, 'verification.expire': ['check'],
  'media.approved': ['media'], 'media.decided': ['media', 'counts'], 'media.hide': ['media', 'post'],
  'premium.granted': ['profile', 'counts'], 'premium.revoked': ['profile', 'counts'], 'premium.gifted': ['profile', 'counts'],
  // A staff role granted or revoked: the staff entry, tab and alerts appear or go without a restart.
  'staff.role': ['profile', 'boot', 'counts'],
  // Plumbing and staff-only markers: nobody's screen shows them.
  'media.scan': [], 'media.purge': [], 'push.deliver': [], 'safety.csamMatch': [], 'staff.alert': [], 'notice.decided': [],
  'support.public': [], 'verification.dropDocument': [],
}));

/** @param {string} topic @returns {readonly Entity[]} */
export function topicEntities(topic) {
  if (Object.hasOwn(TOPIC_ENTITIES, topic)) return TOPIC_ENTITIES[topic];
  if (topic.startsWith('moderation.')) return [];
  return ['counts'];
}

/** Outbox items the worker processes that change what people see while processing (no command commits then):
 * a checked file completes the posts waiting for it and may become the avatar. */
export const PROCESSED_ENTITIES = /** @type {Record<string, readonly Entity[]>} */ (Object.freeze({
  'media.approved': ['media', 'post', 'profile'],
  'media.hide': ['media', 'post', 'profile'],
  'verification.expire': ['check'],
}));

/** A write command's own change, for the acting profile's other devices (and, acting as a couple, the partner's):
 * nothing is enqueued for most of them. The device that wrote reads again too; that is one cheap read. */
const ACTIONS = /** @type {[RegExp, readonly Entity[]][]} */ ([
  [/^(profile\.(update|setVisibility|photosSet)|interests\.(set|remove)|settings\.update|location\.(set|clear)|private\.|onboarding\.|discover\.setFilter|dating\.notify|link\.|follow\.|follower\.|block\.)/, ['profile']],
  [/^(profile\.photosSet|media\.(commit|remove))$/, ['media']],
  [/^couple\./, ['couple']],
  [/^(post\.|reply\.|reaction\.|poll\.|album\.|gallery\.|tag\.|feedHide\.|saved\.)/, ['post']],
  [/^decide\./, ['decide']],
  [/^verification\./, ['check']],
  // `chat.read` signals itself, only when the read mark really moved (server/commands/chats.mjs).
  [/^(chat\.(mute|archive|requestAnswer)|match\.end)$/, ['chat']],
  // Whatever closes an item of «Нужно решить» or marks something read moves the counters at once.
  [/^(notifications\.read|chat\.requestAnswer|decide\.|couple\.(inviteAnswer|inviteWithdraw|linkAccept)|access\.(grant|decline|undoDecline|cancel)|link\.(answer|answerChange)|community\.requestDecide|event\.applicationDecide|tag\.answer|like\.dismiss)/, ['counts']],
]);

/** @param {string} action @returns {Entity[]} */
export function actionEntities(action) {
  if (action.startsWith('staff.')) return [];
  /** @type {Set<Entity>} */
  const out = new Set();
  for (const [re, entities] of ACTIONS) if (re.test(action)) for (const e of entities) out.add(e);
  return [...out];
}

/** The `for` accounts of an outbox payload. @param {unknown} value @returns {string[]} */
const accountsOf = value => [value].flat().filter(x => typeof x === 'string' && x.length > 0).map(String);

/** `changed` signals for outbox items that just committed: to the profile each item is addressed to and to the person
 * profile (own channel) of each `for` account. A `boot` change also reaches `actorAccounts` — the partner who acted
 * listens on the couple channel a stop or a new couple makes stale. Best-effort: a failed lookup sends what it can.
 * @param {Q} q @param {{topic: string, profileId: string | null, for?: unknown}[]} items
 * @param {{actorAccounts?: string[], entitiesOf?: (topic: string) => readonly Entity[]}} [opts] @returns {Promise<Signal[]>} */
export async function liveSignals(q, items, { actorAccounts = [], entitiesOf = topicEntities } = {}) {
  /** @type {{entities: readonly Entity[], profileId: string | null, accounts: string[]}[]} */
  const wanted = [];
  const lookup = new Set();
  for (const item of items) {
    const entities = entitiesOf(item.topic);
    if (!entities.length) continue;
    const accounts = [...accountsOf(item.for), ...(entities.includes('boot') ? actorAccounts : [])];
    for (const a of accounts) lookup.add(a);
    wanted.push({ entities, profileId: item.profileId, accounts });
  }
  if (!wanted.length) return [];
  /** @type {Map<string, string>} */
  const person = new Map();
  if (lookup.size) {
    try {
      const rows = await q.query(`select id::text, person_profile_id::text from feture.account where id = any($1) and person_profile_id is not null`, [[...lookup]]);
      for (const r of rows) person.set(r.id, r.person_profile_id);
    } catch { /* the addressed profiles still get theirs */ }
  }
  const seen = new Set();
  /** @type {Signal[]} */
  const out = [];
  for (const w of wanted) {
    const profiles = new Set([w.profileId, ...w.accounts.map(a => person.get(a))].filter(p => typeof p === 'string' && p));
    for (const profile of /** @type {Set<string>} */ (profiles)) {
      for (const tag of w.entities) {
        if (seen.has(profile + tag)) continue;
        seen.add(profile + tag);
        out.push({ profile, kind: 'changed', tag });
      }
    }
  }
  return out;
}
