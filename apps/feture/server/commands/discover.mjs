// @ts-check
import { discoverCommands } from '../../contracts/discover.mjs';
import { fail } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { mediaDto } from '../media/assets.mjs';
import { checkOptions } from './me.mjs';

/** Slice F: Discover, likes and matches (S1 §11, extract/people-discover-chats.md).
 * The pool: visible profiles with an approved safe avatar, active and unrestricted, no block either way, not related
 * (own profiles, partner, own couple), not decided yet, not matched, passing the viewer's filter. The order (Q7) uses
 * public interests in common and newness only, never private data or any «attractiveness» score. A like is never shown
 * to its target as a «no»: passes, withdrawals and dismissals stay with the profile that made them. Mutual likes make a
 * match; the conversation comes with slice G (outbox `match.created`).
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q
 * @typedef {import('../profiles.mjs').Acting} Acting
 */

/** @param {Acting | null} acting @returns {Acting} */
const need = acting => { if (!acting) throw new Error('acting profile missing'); return acting; };
const DEFAULT_FILTER = { show: 'all', ageMin: 18, ageMax: 99, cityId: null, genders: [], orients: [], formats: [], seeks: [], roles: [], topics: [] };

/** Pool predicate for viewer $1 (no filter): who may appear in the viewer's Discover at all. */
const POOL = `p.id <> $1 and feture.discoverable(p.id) and not feture.blocked($1, p.id) and not feture.related($1, p.id)
  and not exists (select 1 from feture.discover_decision x where x.profile_id = $1 and x.target_profile_id = p.id)
  and not exists (select 1 from feture.profile_match m where m.ended_at is null and m.profile_a = least($1, p.id) and m.profile_b = greatest($1, p.id))`;
/** Filter predicate over parameters $2–$11 (see filterParams). A couple passes the age range when every member does,
 * and gender/orientation when at least one member matches (V21 pool). */
const FILTER = `($2 = 'all' or $2 = 'people' and p.kind = 'person' or $2 = 'pairs' and p.kind = 'couple')
  and (select coalesce(bool_and(x between $3 and $4), false) from unnest(feture.profile_ages(p.id)) x)
  and ($5::uuid is null or d.city_id = $5)
  and (cardinality($6::text[]) = 0 or exists (select 1 from feture.profile_details pd where pd.profile_id in (select feture.profile_people(p.id)) and pd.genders && $6))
  and (cardinality($7::text[]) = 0 or exists (select 1 from feture.profile_details pd where pd.profile_id in (select feture.profile_people(p.id)) and pd.orients && $7))
  and (cardinality($8::text[]) = 0 or d.formats && $8) and (cardinality($9::text[]) = 0 or d.seeks && $9) and (cardinality($10::text[]) = 0 or d.roles && $10)
  and (cardinality($11::text[]) = 0 or exists (select 1 from feture.interest i where i.profile_id = p.id and i.vis = 'public' and i.value is not null and i.topic_id = any($11)))`;
/** @param {any} f */
const filterParams = f => [f.show, f.ageMin, f.ageMax, f.cityId, f.genders, f.orients, f.formats, f.seeks, f.roles, f.topics];

/** @param {Q} q @param {string} accountId */
export async function isPremium(q, accountId) {
  const [a] = await q.query('select premium_until > now() p from feture.account where id = $1', [accountId]);
  return !!a?.p;
}

/** @param {Q} q @param {string} profileId */
async function filterOf(q, profileId) {
  const [f] = await q.query('select * from feture.discover_filter where profile_id = $1', [profileId]);
  if (!f) return DEFAULT_FILTER;
  return { show: f.show, ageMin: f.age_min, ageMax: f.age_max, cityId: f.city_id, genders: f.genders, orients: f.orients, formats: f.formats, seeks: f.seeks, roles: f.roles, topics: f.topics };
}

/** Option codes, a known city and topics that may be filtered on (limits, experienced-only and safety are not
 * something to search people by). @param {Q} q @param {any} f */
async function checkFilter(q, f) {
  await checkOptions(q, f);
  if (f.cityId) {
    const [c] = await q.query(`select 1 from feture.place where id = $1 and state = 'approved'`, [f.cityId]);
    if (!c) fail(400, 'invalid_input', { fields: ['cityId'] });
  }
  if (f.topics.length) {
    const [{ n }] = await q.query(`select count(*)::int n from feture.topic where id = any($1) and not hidden and category_id not in ('limits', 'edge', 'safety')`, [f.topics]);
    if (n !== f.topics.length) fail(400, 'invalid_input', { fields: ['topics'] });
  }
}

/** @param {Q} q @param {string} profileId */
async function modeOf(q, profileId) {
  const [s] = await q.query('select discover_mode, accept_profile_likes from feture.profile_settings where profile_id = $1', [profileId]);
  return s ?? { discover_mode: 'off', accept_profile_likes: false };
}

/** Cards of profiles for the viewer: name, ages they show, city, avatar, «Ты нравишься», public interests in common.
 * @param {Q} q @param {Acting} viewer @param {string[]} ids @param {import('../media/assets.mjs').MediaConfig} media */
async function cards(q, viewer, ids, media) {
  if (!ids.length) return [];
  const rows = await q.query(
    `select p.id, p.kind, p.handle, p.name, p.avatar_asset_id, pl.name_ru city_ru, pl.name_en city_en,
       (select coalesce(array_agg(extract(year from age(current_date, a.birth_date))::int) filter (where coalesce(pd.show_age, false)), '{}')
          from feture.profile_member m join feture.account a on a.id = m.account_id left join feture.profile_details pd on pd.profile_id = a.person_profile_id
          where m.profile_id = p.id and m.state = 'active') ages,
       exists (select 1 from feture.profile_like l where l.from_profile_id = p.id and l.to_profile_id = $2 and l.state = 'active') liked_me,
       (select count(*)::int from feture.interest i join feture.interest j on j.topic_id = i.topic_id and j.profile_id = $2 and j.vis = 'public' and j.value is not null
          where i.profile_id = p.id and i.vis = 'public' and i.value is not null) shared
     from feture.profile p
     left join feture.profile_details d on d.profile_id = p.id
     left join feture.place pl on pl.id = d.city_id and pl.state = 'approved'
     where p.id = any($1)`, [ids, viewer.profileId]);
  const assets = await q.query('select * from feture.media_asset where id = any($1)', [rows.map(r => r.avatar_asset_id).filter(Boolean)]);
  const byId = new Map();
  for (const r of rows) {
    const asset = assets.find(x => x.id === r.avatar_asset_id);
    const avatar = asset ? await mediaDto(media, asset, { viewerProfileId: viewer.profileId, place: 'public', showExplicit: false, staff: false }).catch(() => null) : null;
    byId.set(r.id, {
      id: r.id, kind: r.kind, handle: r.handle, name: r.name || r.handle, ages: r.ages,
      city: r.city_ru ? { ru: r.city_ru, en: r.city_en } : null, avatar, likedMe: r.liked_me, shared: r.shared,
    });
  }
  return ids.map(i => byId.get(i)).filter(Boolean);
}

/** Records (or replaces) the viewer's decision about a profile. @param {Q} q @param {Acting} acting @param {string} target
 * @param {'like' | 'pass'} decision @param {'discover' | 'profile' | 'likes'} source */
async function decide(q, acting, target, decision, source) {
  await q.query(
    `insert into feture.discover_decision (profile_id, target_profile_id, decision, source, acted_by) values ($1, $2, $3, $4, $5)
     on conflict (profile_id, target_profile_id) do update set decision = $3, source = $4, acted_by = $5, decided_at = now()`,
    [acting.profileId, target, decision, source, acting.accountId]);
}

/** Sends a like, or makes a match when the target already likes the sender (V21 likePerson, canLikeFrom).
 * @param {Q} q @param {Acting} acting @param {string} target @param {'discover' | 'profile' | 'likes'} source */
async function sendLike(q, acting, target, source) {
  const [t] = await q.query(
    `select p.id, p.kind, p.state, feture.blocked($1, p.id) blocked, feture.related($1, p.id) related from feture.profile p where p.id = $2`, [acting.profileId, target]);
  if (!t || t.state !== 'active' || t.blocked) fail(404, 'not_found');
  if (t.related) fail(422, 'rule_violation', { rule: 'related' });
  const [m] = await q.query(`select 1 from feture.profile_match where ended_at is null and profile_a = least($1::uuid, $2::uuid) and profile_b = greatest($1::uuid, $2::uuid)`, [acting.profileId, target]);
  if (m) fail(409, 'conflict', { rule: 'already_matched' });
  const mine = await modeOf(q, acting.profileId), theirs = await modeOf(q, target);
  const [back] = await q.query(`select id from feture.profile_like where from_profile_id = $1 and to_profile_id = $2 and state = 'active' for update`, [target, acting.profileId]);
  if (!back) {
    if (mine.discover_mode === 'off' && (source === 'discover' || acting.kind === 'couple' || t.kind === 'couple' || !mine.accept_profile_likes)) {
      fail(422, 'rule_violation', { rule: 'own_discover_off' });
    }
    if (source !== 'discover') {
      // Without Discover a like comes only through the profile page, where the target accepts such likes;
      // couples take likes only through Discover (PRF-003).
      if (!theirs.accept_profile_likes) fail(422, 'rule_violation', { rule: 'likes_not_accepted' });
      if ((acting.kind === 'couple' || t.kind === 'couple') && theirs.discover_mode === 'off') fail(422, 'rule_violation', { rule: 'couples_via_discover_only' });
    }
  }
  const [already] = await q.query(`select id from feture.profile_like where from_profile_id = $1 and to_profile_id = $2 and state = 'active'`, [acting.profileId, target]);
  if (already) return { state: 'liked' };
  await decide(q, acting, target, 'like', source);
  if (back) {
    await q.query(`update feture.profile_like set state = 'matched', updated_at = now() where id = $1`, [back.id]);
    await q.query(`insert into feture.profile_like (from_profile_id, to_profile_id, source, initiator_account_id, state) values ($1, $2, $3, $4, 'matched')`,
      [acting.profileId, target, source, acting.accountId]);
    const [match] = await q.query(
      `insert into feture.profile_match (profile_a, profile_b) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid)) returning id`, [acting.profileId, target]);
    await enqueue(q, 'match.created', acting.profileId, { matchId: match.id, with: target });
    await enqueue(q, 'match.created', target, { matchId: match.id, with: acting.profileId });
    return { state: 'matched', matchId: match.id };
  }
  await q.query(`insert into feture.profile_like (from_profile_id, to_profile_id, source, initiator_account_id) values ($1, $2, $3, $4)`,
    [acting.profileId, target, source, acting.accountId]);
  await enqueue(q, 'like.received', target, { from: acting.profileId });
  if (acting.kind === 'couple') await enqueue(q, 'couple.changed', acting.profileId, { for: acting.partnerAccountId, what: 'like', target });
  return { state: 'liked' };
}

/** Withdraws the viewer's active like; the target's notification goes too. @param {Q} q @param {string} from @param {string} to */
async function withdrawLike(q, from, to) {
  const rows = await q.query(`update feture.profile_like set state = 'withdrawn', updated_at = now() where from_profile_id = $1 and to_profile_id = $2 and state = 'active' returning id`, [from, to]);
  if (rows[0]) await enqueue(q, 'like.withdrawn', to, { from });
  return rows.length > 0;
}

/** @type {Record<keyof typeof discoverCommands, Command['run']>} */
const run = {
  async 'discover.filter'(q, { acting }) {
    return { filter: await filterOf(q, need(acting).profileId) };
  },

  async 'discover.setFilter'(q, { acting: a, input }) {
    const acting = need(a);
    const f = input.filter;
    await checkFilter(q, f);
    await q.query(
      `insert into feture.discover_filter (profile_id, show, age_min, age_max, city_id, genders, orients, formats, seeks, roles, topics)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (profile_id) do update set show = $2, age_min = $3, age_max = $4, city_id = $5, genders = $6, orients = $7, formats = $8,
         seeks = $9, roles = $10, topics = $11, updated_at = now()`, [acting.profileId, ...filterParams(f)]);
    return { filter: f };
  },

  async 'discover.count'(q, { acting: a, input }) {
    // «Показать · N» for a filter draft; capped so it cannot be used to measure the whole membership.
    const viewer = need(a);
    await checkFilter(q, input.filter);
    const [{ n }] = await q.query(
      `select count(*)::int n from (select 1 from feture.profile p left join feture.profile_details d on d.profile_id = p.id
       where ${POOL} and ${FILTER} limit 100) x`, [viewer.profileId, ...filterParams(input.filter)]);
    return { count: n, capped: n >= 100 };
  },

  async 'discover.deck'(q, { acting: a, input, cfg }) {
    const viewer = need(a);
    if ((await modeOf(q, viewer.profileId)).discover_mode === 'off') return { off: true, items: [] };
    const f = await filterOf(q, viewer.profileId);
    // Q7: public interests in common first, then newer profiles. Nothing private, no score.
    const rows = await q.query(
      `select p.id from feture.profile p left join feture.profile_details d on d.profile_id = p.id
       where ${POOL} and ${FILTER}
       order by (select count(*) from feture.interest i join feture.interest j on j.topic_id = i.topic_id and j.profile_id = $1 and j.vis = 'public' and j.value is not null
                 where i.profile_id = p.id and i.vis = 'public' and i.value is not null) desc, p.created_at desc, p.id
       limit $12`, [viewer.profileId, ...filterParams(f), input.limit]);
    return { off: false, items: await cards(q, viewer, rows.map(r => r.id), cfg.media) };
  },

  async 'discover.decide'(q, { acting: a, input }) {
    const acting = need(a);
    if ((await modeOf(q, acting.profileId)).discover_mode === 'off') fail(422, 'rule_violation', { rule: 'own_discover_off' });
    const [inPool] = await q.query(`select 1 from feture.profile p where p.id = $2 and ${POOL}`, [acting.profileId, input.profileId]);
    if (!inPool) {
      const [done] = await q.query('select 1 from feture.discover_decision where profile_id = $1 and target_profile_id = $2', [acting.profileId, input.profileId]);
      fail(done ? 409 : 404, done ? 'conflict' : 'not_found', done ? { rule: 'already_decided' } : {});
    }
    if (input.decision === 'pass') {
      await decide(q, acting, input.profileId, 'pass', 'discover');
      return { decision: 'pass' };
    }
    return { decision: 'like', ...(await sendLike(q, acting, input.profileId, 'discover')) };
  },

  async 'discover.undo'(q, { acting: a }) {
    // Q6: one free undo a day, unlimited with Premium. A match is never undone.
    const acting = need(a);
    const [last] = await q.query(
      `select target_profile_id, decision, source from feture.discover_decision where profile_id = $1 order by decided_at desc limit 1 for update`, [acting.profileId]);
    if (!last) fail(404, 'not_found', { rule: 'nothing_to_undo' });
    const [m] = await q.query(`select 1 from feture.profile_match where ended_at is null and profile_a = least($1::uuid, $2::uuid) and profile_b = greatest($1::uuid, $2::uuid)`,
      [acting.profileId, last.target_profile_id]);
    if (m) fail(409, 'conflict', { rule: 'already_mutual' });
    if (!(await isPremium(q, acting.accountId))) {
      const [{ n }] = await q.query(`select count(*)::int n from feture.rate_event where account_id = $1 and kind = 'discover.undo' and created_at > now() - interval '1 day'`, [acting.accountId]);
      if (n >= 1) fail(403, 'premium_required');
    }
    await q.query(`insert into feture.rate_event (account_id, kind) values ($1, 'discover.undo')`, [acting.accountId]);
    await q.query('delete from feture.discover_decision where profile_id = $1 and target_profile_id = $2', [acting.profileId, last.target_profile_id]);
    if (last.decision === 'like') await withdrawLike(q, acting.profileId, last.target_profile_id);
    if (last.decision === 'pass' && last.source === 'likes') {
      // A dismissed like comes back to the Likes list.
      await q.query(
        `update feture.profile_like set state = 'active', updated_at = now()
         where id = (select id from feture.profile_like where from_profile_id = $1 and to_profile_id = $2 and state = 'dismissed' order by updated_at desc limit 1)
           and not exists (select 1 from feture.profile_like where from_profile_id = $1 and to_profile_id = $2 and state = 'active')`,
        [last.target_profile_id, acting.profileId]);
    }
    return { profileId: last.target_profile_id, decision: last.decision };
  },

  async 'discover.restore'(q, { acting: a, input }) {
    const acting = need(a);
    const rows = await q.query(`delete from feture.discover_decision where profile_id = $1 and target_profile_id = $2 and decision = 'pass' returning 1`, [acting.profileId, input.profileId]);
    if (!rows[0]) fail(404, 'not_found');
    return { restored: true };
  },

  async 'discover.history'(q, { acting: a, input, cfg }) {
    // Free: the newest decision only; Premium: seven days.
    const viewer = need(a);
    const premium = await isPremium(q, viewer.accountId);
    const rows = await q.query(
      `select x.target_profile_id id, x.decision, x.decided_at from feture.discover_decision x join feture.profile p on p.id = x.target_profile_id
       where x.profile_id = $1 and ($2 = 'all' or x.decision = $2) and p.state = 'active' and not feture.blocked($1, p.id)
         and (not $3 or x.decided_at > now() - interval '7 days')
       order by x.decided_at desc limit $4`, [viewer.profileId, input.kind, premium, premium ? 200 : 1]);
    const people = await cards(q, viewer, rows.map(r => r.id), cfg.media);
    return { premium, items: rows.map(r => ({ decision: r.decision, decidedAt: r.decided_at, profile: people.find(c => c.id === r.id) ?? null })).filter(x => x.profile) };
  },

  async 'like.send'(q, { acting: a, input }) {
    return sendLike(q, need(a), input.profileId, input.source);
  },

  async 'like.withdraw'(q, { acting: a, input }) {
    return { withdrawn: await withdrawLike(q, need(a).profileId, input.profileId) };
  },

  async 'like.dismiss'(q, { acting: a, input }) {
    // The sender is never told; the dismissal is a «pass» that one undo can bring back.
    const acting = need(a);
    const rows = await q.query(
      `update feture.profile_like set state = 'dismissed', updated_at = now() where from_profile_id = $1 and to_profile_id = $2 and state = 'active' returning id`,
      [input.profileId, acting.profileId]);
    if (!rows[0]) fail(404, 'not_found');
    await decide(q, acting, input.profileId, 'pass', 'likes');
    return { dismissed: true };
  },

  async 'likes.incoming'(q, { acting: a, cfg }) {
    // Free to see and to answer (V21 D06).
    const viewer = need(a);
    const rows = await q.query(
      `select l.from_profile_id id, l.created_at from feture.profile_like l join feture.profile p on p.id = l.from_profile_id
       where l.to_profile_id = $1 and l.state = 'active' and p.state = 'active' and not feture.blocked($1, p.id)
       order by l.created_at desc limit 200`, [viewer.profileId]);
    const people = await cards(q, viewer, rows.map(r => r.id), cfg.media);
    return { items: people.map(p => ({ profile: p, at: rows.find(r => r.id === p.id)?.created_at })) };
  },

  async 'likes.outgoing'(q, { acting: a, cfg }) {
    const viewer = need(a);
    const rows = await q.query(
      `select l.to_profile_id id, l.created_at, l.source, ip.handle initiator from feture.profile_like l join feture.profile p on p.id = l.to_profile_id
       join feture.account ia on ia.id = l.initiator_account_id left join feture.profile ip on ip.id = ia.person_profile_id
       where l.from_profile_id = $1 and l.state = 'active' and p.state = 'active' and not feture.blocked($1, p.id)
       order by l.created_at desc limit 200`, [viewer.profileId]);
    const people = await cards(q, viewer, rows.map(r => r.id), cfg.media);
    return {
      items: people.map(p => {
        const r = rows.find(x => x.id === p.id);
        return { profile: p, at: r?.created_at, source: r?.source, ...(viewer.kind === 'couple' ? { initiator: r?.initiator } : {}) };
      }),
    };
  },

  async 'matches.list'(q, { acting: a, cfg }) {
    const viewer = need(a);
    const rows = await q.query(
      `select m.id match_id, m.created_at, case when m.profile_a = $1 then m.profile_b else m.profile_a end id
       from feture.profile_match m join feture.profile p on p.id = case when m.profile_a = $1 then m.profile_b else m.profile_a end
       where (m.profile_a = $1 or m.profile_b = $1) and m.ended_at is null and p.state = 'active' and not feture.blocked($1, p.id)
       order by m.created_at desc limit 500`, [viewer.profileId]);
    const people = await cards(q, viewer, rows.map(r => r.id), cfg.media);
    return { items: people.map(p => { const r = rows.find(x => x.id === p.id); return { matchId: r?.match_id, at: r?.created_at, profile: p }; }) };
  },

  async 'match.end'(q, { acting: a, input }) {
    // «Прекратить общение»: the other side is not told; optionally the viewer's own grant goes too.
    const acting = need(a);
    const rows = await q.query(
      `update feture.profile_match set ended_at = now(), ended_by_profile = $1
       where ended_at is null and profile_a = least($1::uuid, $2::uuid) and profile_b = greatest($1::uuid, $2::uuid) returning id`, [acting.profileId, input.profileId]);
    if (!rows[0]) fail(404, 'not_found');
    await q.query(`update feture.profile_like set state = 'withdrawn', updated_at = now() where from_profile_id = $1 and to_profile_id = $2 and state = 'matched'`, [acting.profileId, input.profileId]);
    if (input.revokeMyGrant) {
      await q.query(`update feture.access_grant set revoked_at = now() where owner_profile_id = $1 and viewer_profile_id = $2 and revoked_at is null`, [acting.profileId, input.profileId]);
    }
    await enqueue(q, 'match.ended', acting.profileId, { matchId: rows[0].id, with: input.profileId });
    return { ended: true };
  },
};

/** @type {Record<string, Command>} */
export const discover = Object.fromEntries(
  Object.entries(discoverCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
