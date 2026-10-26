// @ts-check
import { socialCommands } from '../../contracts/social.mjs';
import { fail } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { lockPair } from './discover.mjs';

/** Slice B social graph: blocks, follows, article subscriptions, feed hides, saved items (S1 §7).
 * A block belongs to the profile that made it and ends that profile's ties with the other side; visibility is
 * hidden both ways everywhere through feture.blocked(). Extending a block to one's other profile is explicit.
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q
 * @typedef {import('../profiles.mjs').Acting} Acting
 */

/** @param {Acting | null} acting @returns {Acting} */
const need = acting => { if (!acting) throw new Error('acting profile missing'); return acting; };

/** The other side exists, is active and is not one of my own profiles. @param {Q} q @param {Acting} acting @param {string} target */
async function otherProfile(q, acting, target) {
  if (target === acting.profileId) fail(422, 'rule_violation', { rule: 'self' });
  const [p] = await q.query(
    `select p.id, exists (select 1 from feture.profile_member m where m.profile_id = p.id and m.account_id = $2 and m.state = 'active') mine
     from feture.profile p where p.id = $1 and p.state = 'active'`, [target, acting.accountId]);
  if (!p) fail(404, 'not_found');
  if (p.mine) fail(422, 'rule_violation', { rule: 'own_profile' });
  return p;
}

/** Ends every tie of the blocking profile with the other side (S1 §7): follows both ways, private-part access both
 * ways, requests both ways. Likes, matches and chats join here in slices F and G. History is kept, never deleted.
 * @param {Q} q @param {string} blocker @param {string} blocked */
async function cutTies(q, blocker, blocked) {
  // Ties to the blocked person's couples go too, so nothing comes back on unblock.
  const sides = await q.query(
    `select x.id from feture.profile x where x.id in (select feture.profile_people($1))
        or exists (select 1 from feture.profile_member m join feture.account a on a.id = m.account_id
                   where m.profile_id = x.id and m.state = 'active' and a.person_profile_id in (select feture.profile_people($1)))`, [blocked]);
  for (const s of sides) await cutPair(q, blocker, s.id);
}

/** @param {Q} q @param {string} blocker @param {string} blocked */
async function cutPair(q, blocker, blocked) {
  await q.query(`delete from feture.follow where (follower_profile_id = $1 and target_profile_id = $2) or (follower_profile_id = $2 and target_profile_id = $1)`, [blocker, blocked]);
  await q.query(`delete from feture.note_subscription where (subscriber_profile_id = $1 and author_profile_id = $2) or (subscriber_profile_id = $2 and author_profile_id = $1)`, [blocker, blocked]);
  await q.query(
    `update feture.access_grant set revoked_at = now() where revoked_at is null
     and ((owner_profile_id = $1 and viewer_profile_id = $2) or (owner_profile_id = $2 and viewer_profile_id = $1))`, [blocker, blocked]);
  await q.query(
    `update feture.access_request set state = 'closed', closed_reason = 'blocked', decided_at = now() where state = 'pending'
     and ((owner_profile_id = $1 and requester_profile_id = $2) or (owner_profile_id = $2 and requester_profile_id = $1))`, [blocker, blocked]);
  // Likes both ways (dismissed ones too) and the match go; unblocking brings nothing back.
  await lockPair(q, blocker, blocked);
  const likes = await q.query(
    `update feture.profile_like l set state = 'withdrawn', updated_at = now() from (select id, state, from_profile_id, to_profile_id from feture.profile_like
       where state in ('active', 'matched', 'dismissed') and ((from_profile_id = $1 and to_profile_id = $2) or (from_profile_id = $2 and to_profile_id = $1)) for update) old
     where l.id = old.id returning old.state, old.from_profile_id, old.to_profile_id`, [blocker, blocked]);
  for (const l of likes) if (l.state === 'active') await enqueue(q, 'like.withdrawn', l.to_profile_id, { from: l.from_profile_id });
  const ended = await q.query(
    `update feture.profile_match set ended_at = now(), ended_by_profile = $1
     where ended_at is null and profile_a = least($1::uuid, $2::uuid) and profile_b = greatest($1::uuid, $2::uuid) returning id`, [blocker, blocked]);
  if (ended[0]) await enqueue(q, 'match.ended', blocker, { matchId: ended[0].id, with: blocked });
}

/** Blocks `target` from the acting profile (and, explicitly, from the account's other profile).
 * @param {Q} q @param {Acting} acting @param {string} target @param {'partner' | 'me'} [alsoFor] */
export async function blockProfile(q, acting, target, alsoFor) {
  await otherProfile(q, acting, target);
  const targets = [acting.profileId];
  if (alsoFor) {
    // «И для пары / И для меня»: the account's other profile, explicitly.
    const [other] = await q.query(
      `select p.id from feture.profile_member m join feture.profile p on p.id = m.profile_id
       where m.account_id = $1 and m.state = 'active' and p.state in ('active', 'paused') and p.id <> $2 and p.kind = $3`,
      [acting.accountId, acting.profileId, alsoFor === 'partner' ? 'couple' : 'person']);
    if (other) targets.push(other.id);
  }
  for (const blocker of targets) {
    await q.query(
      `insert into feture.block (blocker_profile_id, blocked_profile_id, acted_by) values ($1, $2, $3) on conflict do nothing`,
      [blocker, target, acting.accountId]);
    await cutTies(q, blocker, target);
  }
  // The blocked side is never told; a partner learns that the couple blocked someone.
  if (acting.kind === 'couple') await enqueue(q, 'couple.changed', acting.profileId, { for: acting.partnerAccountId, what: 'block' });
  return targets.length;
}

/** @type {Record<keyof typeof socialCommands, Command['run']>} */
const run = {
  async 'block.set'(q, { acting: a, input }) {
    const acting = need(a);
    if (!input.on) {
      // Unblocking restores nothing: follows, access and requests stay ended.
      await q.query(`delete from feture.block where blocker_profile_id = $1 and blocked_profile_id = $2`, [acting.profileId, input.profileId]);
      return { blocked: false };
    }
    return { blocked: true, profiles: await blockProfile(q, acting, input.profileId, input.alsoFor) };
  },

  async 'blocks.list'(q, { acting: a }) {
    const acting = need(a);
    const items = await q.query(
      `select b.blocked_profile_id id, b.created_at, p.kind, p.handle, p.name from feture.block b join feture.profile p on p.id = b.blocked_profile_id
       where b.blocker_profile_id = $1 order by b.created_at desc limit 200`, [acting.profileId]);
    return { items };
  },

  async 'follow.set'(q, { acting: a, input }) {
    const acting = need(a);
    if (!input.on) {
      await q.query(`delete from feture.follow where follower_profile_id = $1 and target_profile_id = $2`, [acting.profileId, input.profileId]);
      return { following: false };
    }
    await otherProfile(q, acting, input.profileId);
    const [{ b }] = await q.query('select feture.blocked($1, $2) b', [acting.profileId, input.profileId]);
    if (b) fail(404, 'not_found');
    const rows = await q.query(
      `insert into feture.follow (follower_profile_id, target_profile_id, acted_by) values ($1, $2, $3) on conflict do nothing returning 1`,
      [acting.profileId, input.profileId, acting.accountId]);
    // Follow, unfollow, follow again: told once a day per person.
    const [{ told }] = await q.query(
      `select exists (select 1 from feture.outbox where topic = 'follow.created' and profile_id = $1 and payload->>'from' = $2 and created_at > now() - interval '1 day') told`,
      [input.profileId, acting.profileId]);
    if (rows.length && !told) {
      await enqueue(q, 'follow.created', input.profileId, { from: acting.profileId });
      if (acting.kind === 'couple') await enqueue(q, 'couple.changed', acting.profileId, { for: acting.partnerAccountId, what: 'follow' });
    }
    return { following: true };
  },

  async 'noteSub.set'(q, { acting: a, input }) {
    const acting = need(a);
    if (!input.on) {
      await q.query(`delete from feture.note_subscription where subscriber_profile_id = $1 and author_profile_id = $2`, [acting.profileId, input.profileId]);
      return { subscribed: false };
    }
    await otherProfile(q, acting, input.profileId);
    const [{ b }] = await q.query('select feture.blocked($1, $2) b', [acting.profileId, input.profileId]);
    if (b) fail(404, 'not_found');
    // The author is not told (V21: «автор не узнает»).
    await q.query(`insert into feture.note_subscription (subscriber_profile_id, author_profile_id) values ($1, $2) on conflict do nothing`, [acting.profileId, input.profileId]);
    return { subscribed: true };
  },

  async 'feedHide.set'(q, { acting: a, input }) {
    const acting = need(a);
    if (input.on) {
      if (input.kind === 'author' || input.kind === 'activity') await otherProfile(q, acting, input.targetId);
      if (input.kind === 'post') {
        const [v] = await q.query(`select 1 from feture.post p where p.id = $1 and feture.post_visible(p, $2, $3)`, [input.targetId, acting.profileId, acting.accountId]);
        if (!v) fail(404, 'not_found');
      }
      await q.query(`insert into feture.feed_hide (profile_id, kind, target_id) values ($1, $2, $3) on conflict do nothing`, [acting.profileId, input.kind, input.targetId]);
    } else {
      await q.query(`delete from feture.feed_hide where profile_id = $1 and kind = $2 and target_id = $3`, [acting.profileId, input.kind, input.targetId]);
    }
    return { hidden: input.on }; // the author is never told
  },

  async 'feedHide.list'(q, { acting: a }) {
    const acting = need(a);
    const items = await q.query(
      `select h.kind, h.target_id, h.created_at,
         case when h.kind in ('author', 'activity') then (select json_build_object('id', p.id, 'handle', p.handle, 'name', p.name) from feture.profile p where p.id = h.target_id and p.state = 'active')
              when h.kind = 'post' then (select json_build_object('id', x.id, 'excerpt', left(coalesce(x.title, x.body), 60)) from feture.post x
                                         where x.id = h.target_id and feture.post_visible(x, $1, $2))
         end target
       from feture.feed_hide h where h.profile_id = $1 order by h.created_at desc limit 200`, [acting.profileId, acting.accountId]);
    return { items, count: items.length };
  },

  async 'saved.set'(q, { acting: a, input }) {
    const acting = need(a);
    if (input.on) {
      await q.query(`insert into feture.saved_item (profile_id, kind, target_id) values ($1, $2, $3) on conflict do nothing`, [acting.profileId, input.kind, input.targetId]);
    } else {
      await q.query(`delete from feture.saved_item where profile_id = $1 and kind = $2 and target_id = $3`, [acting.profileId, input.kind, input.targetId]);
    }
    return { saved: input.on };
  },

  async 'saved.list'(q, { acting: a, input }) {
    const acting = need(a);
    // Items no longer visible are dropped by the feed query that renders them; here only the saved keys per profile.
    const items = await q.query(
      `select kind, target_id, created_at from feture.saved_item where profile_id = $1 and ($2::text is null or kind = $2) order by created_at desc limit 200`,
      [acting.profileId, input.kind ?? null]);
    return { items };
  },

  async 'profile.followers'(q, { acting: a, input }) {
    const acting = need(a);
    const [t] = await q.query(`select feture.blocked($1, id) b from feture.profile where id = $2 and state = 'active'`, [acting.profileId, input.profileId]);
    if (!t || t.b) fail(404, 'not_found');
    const col = input.following ? ['follower_profile_id', 'target_profile_id'] : ['target_profile_id', 'follower_profile_id'];
    const items = await q.query(
      `select p.id, p.kind, p.handle, p.name, f.created_at from feture.follow f join feture.profile p on p.id = f.${col[1]}
       where f.${col[0]} = $1 and p.state = 'active' and not feture.blocked($2, p.id) order by f.created_at desc limit 50`,
      [input.profileId, acting.profileId]);
    return { items };
  },
};

/** @type {Record<string, Command>} */
export const social = Object.fromEntries(
  Object.entries(socialCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
