// Couple approvals, stage 3 (docs/notifications.md «Согласования пары и задачи») on PGlite as feture_api: every one of
// the 19 kinds × approve / reject / cancel / expire through the real commands — nothing reaches anyone before the partner
// agrees, a refusal changes nothing and makes no task, a withdrawal and the expiry job close the task, a replay and a
// second device never apply twice, a changed object makes the proposal stale, a newer one supersedes it. Then
// approval.get in every state (a former partner gets not_found), the returned → rejected migration, the pair restore
// with the approval modes from before the pause, and one notice per pause.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { access } from '../server/commands/access.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { inbox } from '../server/commands/inbox.mjs';
import { couples } from '../server/commands/couples.mjs';
import { events } from '../server/commands/events.mjs';
import { communities } from '../server/commands/communities.mjs';
import { people } from '../server/commands/people.mjs';
import { discover } from '../server/commands/discover.mjs';
import { chats } from '../server/commands/chats.mjs';
import { photos } from '../server/commands/photos.mjs';
import { APPROVAL_KINDS } from '../server/approvals.mjs';
import { destination } from '../contracts/notifications.mjs';
import { sweepExpiredApprovals } from '../server/jobs.mjs';
import { notifyHandlers } from '../server/notify.mjs';
import { drain } from '../server/outbox.mjs';
import { MIGRATIONS, setup as baseSetup, op } from './fe-helpers.mjs';

const commands = { ...platform, ...me, ...access, ...social, ...posts, ...inbox, ...couples, ...events, ...communities, ...people, ...discover, ...chats, ...photos };
const day = 864e5;
const at = (/** @type {number} */ days, hours = 0) => new Date(Date.now() + days * day + hours * 36e5).toISOString();
const draft = (/** @type {string} */ body, extra = {}) => ({ type: 'post', body, audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [], ...extra });
const clubBase = { description: 'Встречи и разговоры о верёвке для новичков', topics: ['shibari'], rules: ['Уважать границы'], plate: 'rose' };

/** Alex and Kira as a couple through an invitation (Kira approves Alex's widening changes), Mia on her own. */
async function world(migrations = MIGRATIONS) {
  const env = await baseSetup({ commands, migrations });
  const { db, call, person } = env;
  const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), mia = await person('um', 'Mia');
  const inv = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' });
  const pair = (await call('ub', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: inv.id, accept: true })).profileId;
  await call('ub', pair, { action: 'couple.setApproval', opId: op(), approvesPartner: true });
  const [{ id: berlin }] = await db.query(`select id from feture.place where code = 'berlin'`);
  const ev = (extra = {}) => ({
    title: 'Вечер знакомств', kind: 'meetup', description: 'Спокойный вечер для знакомства, без спешки и давления.',
    format: 'offline', placeId: berlin, area: 'Кройцберг', exactAddress: 'Oranienstr. 1, 2 этаж', tz: 'Europe/Berlin', startsAt: at(7), endsAt: at(7, 3), ...extra,
  });
  const notify = () => drain(db, notifyHandlers(db), { limit: 500, lockSeconds: 60 });
  /** The couple's private part, on and asked for by anyone, with a text to open. */
  const openPrivate = async () => {
    await db.query(`update feture.profile_settings set private_on = true, requests_from = 'all' where profile_id = $1`, [pair]);
    await db.query(`insert into feture.private_part (profile_id, text) values ($1, 'О нас подробнее') on conflict (profile_id) do update set text = excluded.text`, [pair]);
  };
  // Mia takes messages from anyone (the couple writes first in chat.request).
  await db.query(`update feture.profile_settings set messages_from = 'all' where profile_id = $1`, [mia]);
  const one = async (/** @type {string} */ sql, /** @type {unknown[]} */ params = []) => (await db.query(sql, params))[0];
  return { ...env, a, b, mia, pair, berlin, ev, notify, one, openPrivate };
}
/** @typedef {Awaited<ReturnType<typeof world>>} W */

/**
 * How each kind is proposed through its command (as Alex for the couple), what its effect outside the approval is, how
 * its object changes under it (stale), and whether proposing it twice supersedes the first.
 * @type {Record<string, {prep?: (w: W) => Promise<any>, make: (w: W, ctx: any, n: number) => Promise<any>, effect: (w: W, ctx: any) => Promise<boolean>,
 *   touch?: (w: W, ctx: any) => Promise<void>, again?: boolean}>}
 */
const KIND = {
  'profile.update': {
    make: async (w, _c, n) => w.call('ua', w.pair, { action: 'profile.update', opId: op(), rev: (await w.one(`select rev from feture.profile where id = $1`, [w.pair])).rev, bio: 'Мы вдвоём ' + n }),
    effect: async w => (await w.one(`select bio from feture.profile_details where profile_id = $1`, [w.pair])).bio.startsWith('Мы вдвоём'),
    touch: async w => { await w.db.query(`update feture.profile set rev = rev + 1 where id = $1`, [w.pair]); },
    again: true,
  },
  'profile.photos': {
    prep: async w => {
      const [{ id: acc }] = await w.db.query(`select id from feture.account where person_profile_id = $1`, [w.a]);
      const [{ id }] = await w.db.query(
        `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
         values ($1, $2, 'image', 'avatar', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now()) returning id`, [w.pair, acc]);
      return { asset: id };
    },
    make: (w, c) => w.call('ua', w.pair, { action: 'profile.photosSet', opId: op(), assetIds: [c.asset] }),
    effect: async w => (await w.one(`select count(*)::int n from feture.media_attachment where target_type = 'avatar' and target_id = $1`, [w.pair])).n > 0,
    again: true,
  },
  'profile.setVisibility': {
    prep: async w => { await w.db.query(`update feture.profile_settings set requests_from = 'none' where profile_id = $1`, [w.pair]); },
    make: w => w.call('ua', w.pair, { action: 'profile.setVisibility', opId: op(), setting: 'requestsFrom', value: 'all' }),
    effect: async w => (await w.one(`select requests_from from feture.profile_settings where profile_id = $1`, [w.pair])).requests_from === 'all',
    touch: async w => { await w.db.query(`update feture.profile_settings set requests_from = 'matches' where profile_id = $1`, [w.pair]); },
    again: true,
  },
  'interests.set': {
    prep: async w => ({ topic: (await w.one(`select id from feture.topic where category_id <> 'limits' and not hidden order by id limit 1`)).id }),
    make: (w, c) => w.call('ua', w.pair, { action: 'interests.set', opId: op(), topicId: c.topic, value: 7, vis: 'public' }),
    effect: async (w, c) => !!(await w.one(`select 1 from feture.interest where profile_id = $1 and topic_id = $2 and value = 7`, [w.pair, c.topic])),
    touch: async (w, c) => { await w.db.query(`insert into feture.interest (profile_id, topic_id, value, vis) values ($1, $2, 3, 'only') on conflict (profile_id, topic_id) do update set value = 3`, [w.pair, c.topic]); },
    again: true,
  },
  'post.publish': {
    prep: async w => ({ post: (await w.call('ua', w.pair, { action: 'post.saveDraft', opId: op(), post: draft('Совместный пост') })).id }),
    make: (w, c) => w.call('ua', w.pair, { action: 'post.publish', opId: op(), postId: c.post }),
    effect: async (w, c) => (await w.one(`select state from feture.post where id = $1`, [c.post])).state !== 'draft',
    touch: async (w, c) => { await w.db.query(`update feture.post set rev = rev + 1 where id = $1`, [c.post]); },
    again: true,
  },
  'post.edit': {
    prep: async w => {
      const id = (await w.call('ua', w.pair, { action: 'post.saveDraft', opId: op(), post: draft('Старый текст') })).id;
      await w.db.query(`update feture.post set state = 'published', published_at = now() where id = $1`, [id]);
      return { post: id };
    },
    make: async (w, c, n) => w.call('ua', w.pair, { action: 'post.edit', opId: op(), postId: c.post, rev: (await w.one(`select rev from feture.post where id = $1`, [c.post])).rev, post: draft('Новый текст ' + n) }),
    effect: async (w, c) => (await w.one(`select body from feture.post where id = $1`, [c.post])).body !== 'Старый текст'
      || !!(await w.one(`select 1 from feture.post_revision where post_id = $1`, [c.post]).catch(() => null)),
    touch: async (w, c) => { await w.db.query(`update feture.post set rev = rev + 1 where id = $1`, [c.post]); },
    again: true,
  },
  'event.submit': {
    make: async (w, c) => { const r = await w.call('ua', w.pair, { action: 'event.submit', opId: op(), event: w.ev() }); c.event = r.id; return r; },
    effect: async (w, c) => (await w.one(`select state from feture.event where id = $1`, [c.event]))?.state === 'in_review',
    touch: async (w, c) => { await w.db.query(`update feture.event set rev = rev + 1 where id = $1`, [c.event]); },
  },
  'event.update': {
    prep: async w => {
      await w.call('ub', w.pair, { action: 'couple.setApproval', opId: op(), approvesPartner: false });
      const r = await w.call('ua', w.pair, { action: 'event.submit', opId: op(), event: w.ev() });
      await w.call('ub', w.pair, { action: 'couple.setApproval', opId: op(), approvesPartner: true });
      await w.db.query(`update feture.event set state = 'published', published_at = now() where id = $1`, [r.id]);
      return { event: r.id };
    },
    make: async (w, c, n) => w.call('ua', w.pair, { action: 'event.update', opId: op(), eventId: c.event, rev: (await w.one(`select rev from feture.event where id = $1`, [c.event])).rev,
      event: w.ev({ startsAt: at(8 + n), endsAt: at(8 + n, 3) }) }),
    effect: async (w, c) => new Date((await w.one(`select starts_at from feture.event where id = $1`, [c.event])).starts_at).getTime() > Date.now() + 7.5 * day,
    touch: async (w, c) => { await w.db.query(`update feture.event set rev = rev + 1 where id = $1`, [c.event]); },
    again: true,
  },
  'event.rsvp': {
    prep: async w => {
      const r = await w.call('um', w.mia, { action: 'event.submit', opId: op(), event: w.ev() });
      await w.db.query(`update feture.event set state = 'published', published_at = now() where id = $1`, [r.id]);
      return { event: r.id };
    },
    make: (w, c) => w.call('ua', w.pair, { action: 'event.rsvp', opId: op(), eventId: c.event, status: 'going' }),
    effect: async (w, c) => !!(await w.one(`select 1 from feture.event_rsvp where event_id = $1 and profile_id = $2`, [c.event, w.pair])),
    touch: async (w, c) => { await w.db.query(`insert into feture.event_rsvp (event_id, profile_id, status, acted_by) select $1, $2, 'interested', id from feture.account where person_profile_id = $3`, [c.event, w.pair, w.a]); },
    again: true,
  },
  'event.apply': {
    prep: async w => {
      const r = await w.call('um', w.mia, { action: 'event.submit', opId: op(), event: w.ev({ requiresApplication: true, questions: ['Почему хотите прийти?'] }) });
      await w.db.query(`update feture.event set state = 'published', published_at = now() where id = $1`, [r.id]);
      return { event: r.id };
    },
    make: (w, c) => w.call('ua', w.pair, { action: 'event.apply', opId: op(), eventId: c.event, answers: ['Хотим познакомиться с людьми'], note: 'Мы спокойные', requirementsAccepted: true }),
    effect: async (w, c) => !!(await w.one(`select 1 from feture.event_application where event_id = $1 and profile_id = $2`, [c.event, w.pair])),
    touch: async (w, c) => { await w.db.query(`update feture.event set questions = array['Новый вопрос'] where id = $1`, [c.event]); },
    again: true,
  },
  'access.grant': {
    prep: async w => {
      await w.openPrivate();
      const r = await w.call('um', w.mia, { action: 'access.request', opId: op(), profileId: w.pair, scopes: ['info'] });
      assert.equal(r.status, 200, JSON.stringify(r));
      return { request: r.id ?? r.requestId };
    },
    make: (w, c) => w.call('ua', w.pair, { action: 'access.grant', opId: op(), requestId: c.request, scopes: ['info'], term: '7d' }),
    effect: async w => !!(await w.one(`select 1 from feture.access_grant where owner_profile_id = $1 and viewer_profile_id = $2 and revoked_at is null`, [w.pair, w.mia])),
    touch: async (w, c) => { await w.db.query(`update feture.access_request set state = 'cancelled', decided_at = now() where id = $1`, [c.request]); },
    again: true,
  },
  'private.on': {
    prep: async w => { await w.db.query(`update feture.profile_settings set private_on = false where profile_id = $1`, [w.pair]); },
    make: w => w.call('ua', w.pair, { action: 'private.setOn', opId: op(), on: true }),
    effect: async w => (await w.one(`select private_on from feture.profile_settings where profile_id = $1`, [w.pair])).private_on === true,
    touch: async w => { await w.db.query(`update feture.profile_settings set private_on = true where profile_id = $1`, [w.pair]); },
    again: true,
  },
  'community.create': {
    make: w => w.call('ua', w.pair, { action: 'community.create', opId: op(), name: 'Клуб пары', privacy: 'open', ...clubBase }),
    effect: async w => !!(await w.one(`select 1 from feture.community where name = 'Клуб пары'`)),
    touch: async w => { await w.call('um', w.mia, { action: 'community.create', opId: op(), name: 'Клуб пары', privacy: 'open', ...clubBase }); },
    again: true,
  },
  'community.join': {
    prep: async w => {
      const r = await w.call('um', w.mia, { action: 'community.create', opId: op(), name: 'Закрытый клуб', privacy: 'closed', joinQuestion: 'Что вас привело?', ...clubBase });
      await w.db.query(`update feture.community set state = 'published', published_at = now() where id = $1`, [r.id]);
      return { club: r.id };
    },
    make: (w, c) => w.call('ua', w.pair, { action: 'community.join', opId: op(), communityId: c.club, rulesAccepted: true, answer: 'Хотим учиться вместе' }),
    effect: async (w, c) => !!(await w.one(`select 1 from feture.community_request where community_id = $1 and profile_id = $2`, [c.club, w.pair])),
    touch: async (w, c) => { await w.db.query(`update feture.community set rev = rev + 1 where id = $1`, [c.club]); },
    again: true,
  },
  'link.propose': {
    make: w => w.call('ua', w.pair, { action: 'link.propose', opId: op(), profileId: w.mia, kind: 'friend' }),
    effect: async w => !!(await w.one(`select 1 from feture.profile_link where a_profile_id = $1 and b_profile_id = $2`, [w.pair, w.mia])),
    touch: async w => { await w.call('um', w.mia, { action: 'link.propose', opId: op(), profileId: w.pair, kind: 'friend' }); },
    again: true,
  },
  'link.accept': {
    prep: async w => ({ link: (await w.call('um', w.mia, { action: 'link.propose', opId: op(), profileId: w.pair, kind: 'friend' })).id }),
    make: async (w, c) => {
      c.link ??= (await w.one(`select id from feture.profile_link where a_profile_id = $1 and b_profile_id = $2`, [w.mia, w.pair])).id;
      return w.call('ua', w.pair, { action: 'link.answer', opId: op(), linkId: c.link, accept: true });
    },
    effect: async (w, c) => (await w.one(`select state from feture.profile_link where id = $1`, [c.link])).state === 'ok',
    touch: async (w, c) => { await w.db.query(`update feture.profile_link set kind = 'play' where id = $1`, [c.link]); },
    again: true,
  },
  'link.visibility': {
    prep: async w => {
      const [{ id: acc }] = await w.db.query(`select id from feture.account where person_profile_id = $1`, [w.mia]);
      const [{ id }] = await w.db.query(`insert into feture.profile_link (a_profile_id, b_profile_id, kind, state, b_vis, acted_by, confirmed_at) values ($1, $2, 'friend', 'ok', 'us', $3, now()) returning id`, [w.mia, w.pair, acc]);
      return { link: id };
    },
    make: (w, c) => w.call('ua', w.pair, { action: 'link.setVisibility', opId: op(), linkId: c.link, vis: 'all' }),
    effect: async (w, c) => (await w.one(`select b_vis from feture.profile_link where id = $1`, [c.link])).b_vis === 'all',
    touch: async (w, c) => { await w.db.query(`update feture.profile_link set b_vis = 'followers' where id = $1`, [c.link]); },
    again: true,
  },
  'location.set': {
    make: w => w.call('ua', w.pair, { action: 'location.set', opId: op(), lat: 52.52, lon: 13.41 }),
    effect: async w => !!(await w.one(`select 1 from feture.profile_location where profile_id = $1`, [w.pair])),
    touch: async w => { await w.db.query(`insert into feture.profile_location (profile_id, lat, lon, shared_by) select $1, 48.15, 11.6, id from feture.account where person_profile_id = $2`, [w.pair, w.a]); },
    again: true,
  },
  'chat.request': {
    make: w => w.call('ua', w.pair, { action: 'chat.request', opId: op(), profileId: w.mia, body: 'Привет! Мы из Берлина' }),
    effect: async w => !!(await w.one(`select 1 from feture.conversation where profile_a = least($1::uuid, $2::uuid) and profile_b = greatest($1::uuid, $2::uuid)`, [w.pair, w.mia])),
    touch: async w => { await w.db.query(`insert into feture.conversation (profile_a, profile_b) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid))`, [w.pair, w.mia]); },
    again: true,
  },
};

/** @param {W} w @param {string} id */
const stateOf = async (w, id) => (await w.one(`select state from feture.partner_approval where id = $1`, [id])).state;
/** @param {W} w @param {string} user */
const jointTasks = async (w, user) => (await w.call(user, null, { action: 'decide.list' })).items.filter((/** @type {any} */ x) => x.kind === 'joint');
/** @param {any} r */
const pendingId = r => { assert.ok(r.pending?.approvalId, 'waits for the partner: ' + JSON.stringify(r).slice(0, 300)); return /** @type {string} */ (r.pending.approvalId); };

test('the 19 kinds are all registered and covered here', () => {
  assert.equal(APPROVAL_KINDS.length, 19);
  assert.deepEqual(Object.keys(KIND).sort(), [...APPROVAL_KINDS].sort());
});

for (const kind of APPROVAL_KINDS) {
  test(`${kind}: nothing before approval; reject, cancel, expire close it without effect; approve once; stale; superseded`, async () => {
    const w = await world();
    const k = KIND[kind];
    try {
      const ctx = (await k.prep?.(w)) ?? {};
      let n = 0;

      // Reject: final, nothing changes, no task for the author, the partner's task goes, a result for the author.
      const r1 = pendingId(await k.make(w, ctx, ++n));
      assert.equal(await k.effect(w, ctx), false, 'no external effect before approval');
      assert.ok((await jointTasks(w, 'ub')).some(x => x.id === r1), 'the partner has the task');
      const task = (await jointTasks(w, 'ub')).find(x => x.id === r1);
      assert.equal(task.kind, 'joint');
      assert.equal(task.approvalKind, kind);
      assert.equal(task.approvalId, r1);
      assert.equal(task.actor?.name, 'Alex');
      assert.equal(task.addressee, w.pair);
      assert.equal(task.addresseeName, 'Alex и Kira');
      assert.equal((await w.call('ub', w.pair, { action: 'decide.approval', opId: op(), approvalId: r1, choice: 'reject', comment: 'Не сейчас' })).state, 'rejected');
      assert.equal(await k.effect(w, ctx), false, 'a refusal changes nothing');
      assert.equal((await jointTasks(w, 'ua')).length, 0, 'no task for the author');
      assert.equal((await jointTasks(w, 'ub')).length, 0, 'the task is gone');
      await w.notify();
      const res = (await w.call('ua', null, { action: 'notifications.list' })).items.find((/** @type {any} */ x) => x.type === 'pair.decided' && x.object?.id === r1);
      assert.equal(res?.data.state, 'rejected', 'the author has the result');

      // Cancel by the author: the task closes.
      const r2 = pendingId(await k.make(w, ctx, ++n));
      assert.equal((await w.call('ua', w.pair, { action: 'decide.cancel', opId: op(), approvalId: r2 })).state, 'cancelled');
      assert.equal((await jointTasks(w, 'ub')).length, 0);
      assert.equal(await k.effect(w, ctx), false);

      // Expire: the background job closes it, the author gets «Срок истёк», the task goes; an old id reads expired.
      const r3 = pendingId(await k.make(w, ctx, ++n));
      await w.db.query(`update feture.partner_approval set expires_at = now() - interval '1 minute' where id = $1`, [r3]);
      assert.equal((await w.call('ub', null, { action: 'approval.get', id: r3 })).approval.state, 'expired', 'reads expired before the job');
      assert.ok(await sweepExpiredApprovals(w.db) >= 1);
      assert.equal(await stateOf(w, r3), 'expired');
      assert.equal((await jointTasks(w, 'ub')).length, 0);
      assert.equal(await k.effect(w, ctx), false);
      await w.notify();
      assert.ok((await w.call('ua', null, { action: 'notifications.list' })).items.some((/** @type {any} */ x) => x.type === 'pair.decided' && x.object?.id === r3 && x.data.state === 'expired'));

      // Stale: the object changed before the partner agreed — nothing applies.
      if (k.touch) {
        const r4 = pendingId(await k.make(w, ctx, ++n));
        await k.touch(w, ctx);
        const d = await w.call('ub', w.pair, { action: 'decide.approval', opId: op(), approvalId: r4, choice: 'approve' });
        assert.equal(d.state, 'stale', JSON.stringify(d));
        assert.equal(await stateOf(w, r4), 'stale');
        // Put things back the way the approval below expects (a fresh world would be slower).
        if (['community.create', 'link.propose', 'chat.request', 'location.set', 'event.rsvp'].includes(kind)) return;
        if (kind === 'access.grant') { await w.db.query(`update feture.access_request set state = 'pending', decided_at = null where id = $1`, [ctx.request]); }
        if (kind === 'private.on') await w.db.query(`update feture.profile_settings set private_on = false where profile_id = $1`, [w.pair]);
        if (kind === 'profile.setVisibility') await w.db.query(`update feture.profile_settings set requests_from = 'none' where profile_id = $1`, [w.pair]);
        if (kind === 'interests.set') await w.db.query(`delete from feture.interest where profile_id = $1 and topic_id = $2`, [w.pair, ctx.topic]);
        if (kind === 'link.accept') await w.db.query(`update feture.profile_link set kind = 'friend' where id = $1`, [ctx.link]);
        if (kind === 'link.visibility') await w.db.query(`update feture.profile_link set b_vis = 'us' where id = $1`, [ctx.link]);
        if (kind === 'event.apply') await w.db.query(`update feture.event set questions = array['Почему хотите прийти?'] where id = $1`, [ctx.event]);
      }

      // Superseded: a newer proposal of the same kind for the same object closes the old one.
      if (k.again) {
        const old = pendingId(await k.make(w, ctx, ++n));
        const fresh = pendingId(await k.make(w, ctx, ++n));
        assert.equal(await stateOf(w, old), 'superseded');
        assert.equal(await stateOf(w, fresh), 'pending');
        assert.equal((await w.call('ua', w.pair, { action: 'decide.cancel', opId: op(), approvalId: fresh })).state, 'cancelled');
      }

      // Approve: applies once; the same opId replays; a second device gets a conflict and nothing applies twice.
      const r5 = pendingId(await k.make(w, ctx, ++n));
      assert.equal(await k.effect(w, ctx), false);
      assert.equal((await w.call('ua', w.pair, { action: 'decide.approval', opId: op(), approvalId: r5, choice: 'approve' })).status, 403, 'never the author');
      const same = op();
      const d1 = await w.call('ub', w.pair, { action: 'decide.approval', opId: same, approvalId: r5, choice: 'approve' });
      assert.deepEqual([d1.state, d1.applied], ['approved', true], JSON.stringify(d1));
      assert.equal(await k.effect(w, ctx), true);
      const replay = await w.call('ub', w.pair, { action: 'decide.approval', opId: same, approvalId: r5, choice: 'approve' });
      assert.deepEqual([replay.state, replay.replayed], ['approved', true]);
      const second = await w.call('ub', w.pair, { action: 'decide.approval', opId: op(), approvalId: r5, choice: 'approve' });
      assert.deepEqual([second.status, second.state], [409, 'approved']);
      assert.equal((await w.one(`select count(*)::int n from feture.partner_approval where id = $1 and state = 'approved'`, [r5])).n, 1);
    } finally { await w.pg.close(); }
  });
}

test('event.submit: a refused, withdrawn or expired event goes back to the author’s drafts; «Изменить и отправить снова» finds it', async () => {
  const w = await world();
  try {
    const r = await w.call('ua', w.pair, { action: 'event.submit', opId: op(), event: w.ev({ title: 'Вечер пары' }) });
    assert.equal(r.state, 'pending_partner');
    await w.call('ub', w.pair, { action: 'decide.approval', opId: op(), approvalId: r.pending.approvalId, choice: 'reject' });
    assert.equal(await w.one(`select 1 from feture.event where id = $1`, [r.id]), undefined, 'nobody sees it');
    const got = (await w.call('ua', null, { action: 'approval.get', id: r.pending.approvalId })).approval;
    assert.equal(got.state, 'rejected');
    const draftRow = await w.one(`select form->>'title' title from feture.event_draft where id = $1`, [got.outcome.eventDraftId]);
    assert.equal(draftRow.title, 'Вечер пары');
    assert.equal(got.object.title, 'Вечер пары');
    // An event left waiting with nothing pending (closed before stage 3) is released by the job too.
    const r2 = await w.call('ua', w.pair, { action: 'event.submit', opId: op(), event: w.ev({ title: 'Застрял' }) });
    await w.db.query(`update feture.partner_approval set state = 'cancelled', decided_at = now() where id = $1`, [r2.pending.approvalId]);
    await sweepExpiredApprovals(w.db);
    assert.equal(await w.one(`select 1 from feture.event where id = $1`, [r2.id]), undefined);
    assert.ok(await w.one(`select 1 from feture.event_draft where form->>'title' = 'Застрял'`));
  } finally { await w.pg.close(); }
});

test('previews: the whole text and audience, the answers to the organizer and the host, the term of access; never the exact address', async () => {
  const w = await world();
  try {
    const long = ('Длинный текст. '.repeat(40)).trim();
    const d = await w.call('ua', w.pair, { action: 'post.saveDraft', opId: op(), post: draft(long, { audience: 'followers' }) });
    const pp = (await w.call('ub', null, { action: 'approval.get', id: pendingId(await w.call('ua', w.pair, { action: 'post.publish', opId: op(), postId: d.id })) })).approval.preview;
    assert.deepEqual([pp.post.body, pp.post.audience], [long, 'followers']);

    const e = await w.call('um', w.mia, { action: 'event.submit', opId: op(), event: w.ev({ requiresApplication: true, questions: ['Почему хотите прийти?'] }) });
    await w.db.query(`update feture.event set state = 'published', published_at = now() where id = $1`, [e.id]);
    const ap = (await w.call('ub', null, { action: 'approval.get', id: pendingId(await w.call('ua', w.pair, { action: 'event.apply', opId: op(), eventId: e.id, answers: ['Хотим познакомиться'], note: 'Мы тихие', requirementsAccepted: true })) })).approval;
    assert.deepEqual(ap.preview.application, { answers: [{ question: 'Почему хотите прийти?', answer: 'Хотим познакомиться' }], note: 'Мы тихие' });
    assert.equal(ap.preview.subject.name, 'Mia');
    assert.ok(!JSON.stringify(ap).includes('Oranienstr'), 'no exact address');

    const c = await w.call('um', w.mia, { action: 'community.create', opId: op(), name: 'Закрытый клуб', privacy: 'closed', joinQuestion: 'Что вас привело?', ...clubBase });
    await w.db.query(`update feture.community set state = 'published', published_at = now() where id = $1`, [c.id]);
    const cj = (await w.call('ub', null, { action: 'approval.get', id: pendingId(await w.call('ua', w.pair, { action: 'community.join', opId: op(), communityId: c.id, rulesAccepted: true, answer: 'Хотим учиться вместе' })) })).approval;
    assert.deepEqual([cj.preview.community.name, cj.preview.community.rules, cj.preview.community.question, cj.preview.community.answer, cj.preview.community.direct],
      ['Закрытый клуб', ['Уважать границы'], 'Что вас привело?', 'Хотим учиться вместе', false]);

    await w.openPrivate();
    const req = await w.call('um', w.mia, { action: 'access.request', opId: op(), profileId: w.pair, scopes: ['info'] });
    const ag = (await w.call('ub', null, { action: 'approval.get', id: pendingId(await w.call('ua', w.pair, { action: 'access.grant', opId: op(), requestId: req.id ?? req.requestId, scopes: ['info'], term: '7d' })) })).approval;
    assert.deepEqual([ag.preview.access.term, ag.preview.access.days, ag.preview.access.scopes, ag.preview.subject.name], ['7d', 7, ['info'], 'Mia']);
    assert.ok(ag.preview.access.until);

    // «Нужно решить» carries the contract fields for every joint item.
    const items = await jointTasks(w, 'ub');
    assert.equal(items.length, 4);
    for (const x of items) {
      for (const f of ['approvalKind', 'actor', 'addressee', 'addresseeName', 'object', 'summary', 'approvalId', 'baseRev']) assert.ok(f in x, f);
      assert.ok(!('rev' in x) || typeof x.rev === 'number', 'rev stays a number');
      assert.deepEqual(Object.keys(x.object).sort(), ['id', 'title', 'type']);
      assert.ok(typeof x.summary === 'string' && x.summary.length <= 80, x.summary);
      // decide.get returns the same item.
      assert.equal((await w.call('ub', null, { action: 'decide.get', kind: 'joint', id: x.id })).item.approvalKind, x.approvalKind);
    }
    assert.ok(!JSON.stringify(items).includes('Oranienstr'));
  } finally { await w.pg.close(); }
});

test('approval.get: every state for current members only — a former partner and a stranger get not_found', async () => {
  const w = await world();
  try {
    const states = /** @type {Record<string, string>} */ ({});
    const prof = async (/** @type {number} */ n) => pendingId(await KIND['profile.update'].make(w, {}, n));
    const ap = await prof(1);
    await w.call('ub', w.pair, { action: 'decide.approval', opId: op(), approvalId: ap, choice: 'approve' }); states[ap] = 'approved';
    const rj = await prof(2);
    await w.call('ub', w.pair, { action: 'decide.approval', opId: op(), approvalId: rj, choice: 'reject', comment: 'Нет' }); states[rj] = 'rejected';
    const cn = await prof(3);
    await w.call('ua', w.pair, { action: 'decide.cancel', opId: op(), approvalId: cn }); states[cn] = 'cancelled';
    const sp = await prof(4); const st = await prof(5); states[sp] = 'superseded';
    await w.db.query(`update feture.profile set rev = rev + 1 where id = $1`, [w.pair]);
    await w.call('ub', w.pair, { action: 'decide.approval', opId: op(), approvalId: st, choice: 'approve' }); states[st] = 'stale';
    const ex = await prof(6);
    await w.db.query(`update feture.partner_approval set expires_at = now() - interval '1 minute' where id = $1`, [ex]);
    await sweepExpiredApprovals(w.db); states[ex] = 'expired';
    const pe = await prof(7); states[pe] = 'pending';
    for (const [id, state] of Object.entries(states)) {
      for (const user of ['ua', 'ub']) {
        const r = await w.call(user, null, { action: 'approval.get', id });
        assert.equal(r.status, 200, JSON.stringify(r));
        assert.equal(r.approval.state, state, `${user} ${state}`);
        assert.equal(r.approval.kind, 'profile.update');
        assert.equal(r.approval.initiator.name, 'Alex');
        assert.equal(r.approval.addressee.id, w.pair);
        assert.equal(r.approval.mine, user === 'ua');
        assert.ok(r.approval.preview.rows.some((/** @type {any} */ x) => x.field === 'bio'));
      }
    }
    const rr = (await w.call('ua', null, { action: 'approval.get', id: rj })).approval;
    assert.deepEqual([rr.decidedBy.name, rr.comment, !!rr.decidedAt], ['Kira', 'Нет', true]);
    assert.equal((await w.call('um', null, { action: 'approval.get', id: ap })).status, 404, 'a stranger');
    // Kira leaves: the couple is paused and then deleted — she reads nothing of it any more.
    await w.call('ub', w.pair, { action: 'couple.stop', opId: op(), confirm: true });
    await w.db.query(`update feture.profile_member set state = 'left', left_at = now() where profile_id = $1 and account_id = (select id from feture.account where person_profile_id = $2)`, [w.pair, w.b]);
    assert.equal((await w.call('ub', null, { action: 'approval.get', id: ap })).status, 404, 'a former partner');
    assert.equal((await w.call('ua', null, { action: 'approval.get', id: ap })).status, 200, 'still a member');
  } finally { await w.pg.close(); }
});

test('migration: a change returned «на доработку» reads as a rejected result with its draft kept', async () => {
  const w = await world();
  try {
    const d = await w.call('ua', w.pair, { action: 'post.saveDraft', opId: op(), post: draft('Съездили в Вильнюс на фестиваль') });
    const id = pendingId(await w.call('ua', w.pair, { action: 'post.publish', opId: op(), postId: d.id }));
    const [{ id: kira }] = await w.db.query(`select id from feture.account where person_profile_id = $1`, [w.b]);
    // The table as it was before 20261103130000, with the old «вернуть» stored the old way.
    await w.pg.exec(`reset role;
      alter table feture.partner_approval drop constraint partner_approval_state_check;
      alter table feture.partner_approval rename column comment to return_note;
      alter table feture.partner_approval drop column base_rev, drop column couple_name, drop column superseded_by, drop column outcome;
      alter table feture.profile_member drop column approves_before_pause;
      drop index feture.partner_approval_due; drop index feture.partner_approval_closed;
      alter table feture.partner_approval add constraint partner_approval_state_check check (state in ('pending', 'approved', 'returned', 'cancelled', 'expired'));
      create index partner_approval_returned on feture.partner_approval (profile_id, decided_at desc) where state = 'returned';
      update feture.partner_approval set state = 'returned', decided_by = '${kira}', decided_at = now(), return_note = 'Убери название' where id = '${id}';`);
    await w.pg.exec(readFileSync(new URL('../supabase/migrations/20261103210000_fe_approval_outcomes.sql', import.meta.url), 'utf8'));
    await w.pg.exec('set role feture_api');
    const got = (await w.call('ua', null, { action: 'approval.get', id })).approval;
    assert.deepEqual([got.state, got.comment, got.decidedBy.name, got.addressee.name], ['rejected', 'Убери название', 'Kira', 'Alex и Kira']);
    assert.equal((await w.one(`select state from feture.post where id = $1`, [d.id])).state, 'draft', 'the draft is kept');
    assert.equal((await jointTasks(w, 'ua')).length, 0, 'no task');
    assert.equal((await jointTasks(w, 'ub')).length, 0);
    const note = (await w.call('ua', null, { action: 'notifications.list' })).items.find((/** @type {any} */ x) => x.type === 'pair.decided' && x.object?.id === id);
    assert.deepEqual([note?.data.state, note?.couple], ['rejected', w.pair]);
    assert.equal((await w.call('ub', null, { action: 'notifications.list' })).items.filter((/** @type {any} */ x) => x.type === 'pair.decided').length, 0);
  } finally { await w.pg.close(); }
});

test('pause: one «Пара на паузе» per side; restore brings back the approval modes, not visibility, dating or access', async () => {
  const w = await world();
  try {
    await w.openPrivate();
    await w.db.query(`update feture.profile_settings set discover_mode = 'visible' where profile_id = $1`, [w.pair]);
    const req = await w.call('um', w.mia, { action: 'access.request', opId: op(), profileId: w.pair, scopes: ['info'] });
    await w.call('ua', w.pair, { action: 'couple.setApproval', opId: op(), approvesPartner: false });
    // Kira approves Alex; a grant needs both anyway (two consents even in trust mode).
    const g = pendingId(await w.call('ub', w.pair, { action: 'access.grant', opId: op(), requestId: req.id ?? req.requestId, scopes: ['info'], term: 'none' }));
    assert.equal((await w.call('ua', w.pair, { action: 'decide.approval', opId: op(), approvalId: g, choice: 'approve' })).state, 'approved');
    const pend = pendingId(await KIND['profile.update'].make(w, {}, 1));
    await w.notify();
    const count = async (/** @type {string} */ user) => (await w.call(user, null, { action: 'notifications.list' })).items.length;
    const [na, nb] = [await count('ua'), await count('ub')];

    assert.equal((await w.call('ua', w.pair, { action: 'couple.stop', opId: op(), confirm: true })).state, 'paused');
    await w.notify();
    const newB = (await w.call('ub', null, { action: 'notifications.list' })).items.slice(0, (await count('ub')) - nb);
    assert.deepEqual(newB.map((/** @type {any} */ x) => x.type), ['pair.stopped'], 'one notice for the partner');
    assert.equal(await count('ua') - na, 0, 'none about one’s own pause');
    assert.equal(await stateOf(w, pend), 'cancelled');
    // The restore request opens the restore screen of that couple.
    await w.call('ub', w.pair, { action: 'couple.restore', opId: op() });
    await w.notify();
    const rq = (await w.call('ua', null, { action: 'notifications.list' })).items.find((/** @type {any} */ x) => x.type === 'pair.restoreRequested');
    assert.ok(rq);
    const paused = (await w.call('ua', w.pair, { action: 'couple.get' })).couple;
    assert.deepEqual(paused.members.map((/** @type {any} */ m) => [m.me, m.approvesPartner, m.restoreAgreed]), [[true, false, false], [false, true, true]]);
    assert.equal((await w.call('ua', w.pair, { action: 'couple.restore', opId: op() })).state, 'active');
    const back = (await w.call('ua', w.pair, { action: 'couple.get' })).couple;
    assert.deepEqual(back.members.map((/** @type {any} */ m) => [m.me, m.approvesPartner]), [[true, false], [false, true]]);
    // Kira approves Alex again: his widening waits for her.
    pendingId(await KIND['profile.update'].make(w, {}, 2));
    const s = await w.one(`select discover_mode from feture.profile_settings where profile_id = $1`, [w.pair]);
    assert.equal(s.discover_mode, 'off', 'dating stays off');
    assert.equal(await w.one(`select 1 from feture.access_grant where owner_profile_id = $1 and revoked_at is null`, [w.pair]), undefined, 'access stays closed');
  } finally { await w.pg.close(); }
});

/** The account of a person profile. @param {W} w @param {string} profile */
const accountOf = async (w, profile) => (await w.one(`select id from feture.account where person_profile_id = $1`, [profile])).id;
/** Push kinds queued for an account. @param {W} w @param {string} account */
const pushKinds = async (w, account) => (await w.db.query(`select payload->>'kind' kind from feture.outbox where topic = 'push.deliver' and payload->>'account' = $1 order by id`, [account])).map(r => r.kind);

test('stage 4: a couple’s request to a closed club reaches every host once — only after the partner agrees', async () => {
  const w = await world();
  try {
    const noa = await w.person('un', 'Noa');
    const r = await w.call('um', w.mia, { action: 'community.create', opId: op(), name: 'Закрытый клуб', privacy: 'closed', joinQuestion: 'Что вас привело?', ...clubBase });
    await w.db.query(`update feture.community set state = 'published', published_at = now() where id = $1`, [r.id]);
    // Noa hosts the club; Mia and Noa also host it as a couple of their own: each account still gets one task.
    const hosts = await w.coupleOf([w.mia, noa]);
    await w.db.query(`insert into feture.community_member (community_id, profile_id, role) values ($1, $2, 'host'), ($1, $3, 'host')`, [r.id, noa, hosts]);
    const um = await accountOf(w, w.mia), un = await accountOf(w, noa);
    const ap = pendingId(await w.call('ua', w.pair, { action: 'community.join', opId: op(), communityId: r.id, rulesAccepted: true, answer: 'Хотим учиться вместе' }));
    await w.notify();
    // Before the partner agrees the hosts get nothing: no request, no task, no push.
    assert.equal(await w.one(`select 1 from feture.community_request where community_id = $1`, [r.id]), undefined);
    for (const u of ['um', 'un']) assert.equal((await w.call(u, null, { action: 'decide.list' })).items.filter((/** @type {any} */ x) => x.kind === 'capp').length, 0);
    assert.deepEqual([...await pushKinds(w, um), ...await pushKinds(w, un)].filter(k => k === 'decide'), []);
    assert.equal((await w.call('ub', w.pair, { action: 'decide.approval', opId: op(), approvalId: ap, choice: 'approve' })).state, 'approved');
    await w.notify();
    assert.deepEqual(await pushKinds(w, um), ['decide'], 'the owner: one push');
    assert.deepEqual(await pushKinds(w, un), ['decide'], 'the host: one push, although in two host profiles');
    for (const u of ['um', 'un']) assert.ok((await w.call(u, null, { action: 'decide.list' })).items.some((/** @type {any} */ x) => x.kind === 'capp'), u);
    // The direct path takes the same helper: one push per host account.
    await w.call('ua', w.a, { action: 'community.join', opId: op(), communityId: r.id, rulesAccepted: true, answer: 'Хочу учиться тоже' });
    await w.notify();
    assert.deepEqual(await pushKinds(w, um), ['decide', 'decide']);
    assert.deepEqual(await pushKinds(w, un), ['decide', 'decide']);
  } finally { await w.pg.close(); }
});

test('stage 4: trust mode — the partner gets a history row for what matters, a push only for an event, access or a link; follow opens that person', async () => {
  const w = await world();
  try {
    await w.call('ub', w.pair, { action: 'couple.setApproval', opId: op(), approvesPartner: false });
    const ub = await accountOf(w, w.b), ua = await accountOf(w, w.a);
    const e = await w.call('um', w.mia, { action: 'event.submit', opId: op(), event: w.ev() });
    const e2 = await w.call('um', w.mia, { action: 'event.submit', opId: op(), event: w.ev({ requiresApplication: true, questions: ['Почему хотите прийти?'] }) });
    await w.db.query(`update feture.event set state = 'published', published_at = now() where id = any($1)`, [[e.id, e2.id]]);
    const club = await w.call('um', w.mia, { action: 'community.create', opId: op(), name: 'Открытый клуб', privacy: 'open', ...clubBase });
    await w.db.query(`update feture.community set state = 'published', published_at = now() where id = $1`, [club.id]);
    await w.db.query(`update feture.profile_settings set private_on = false where profile_id = $1`, [w.pair]);
    const done = async (/** @type {any} */ r) => { assert.ok(r.ok !== false && !r.code && !r.pending, 'applies at once: ' + JSON.stringify(r)); };
    await done(await w.call('ua', w.pair, { action: 'event.rsvp', opId: op(), eventId: e.id, status: 'going' }));
    await done(await w.call('ua', w.pair, { action: 'event.apply', opId: op(), eventId: e2.id, answers: ['Хотим познакомиться с людьми'], note: 'Мы спокойные', requirementsAccepted: true }));
    await done(await w.call('ua', w.pair, { action: 'community.join', opId: op(), communityId: club.id, rulesAccepted: true }));
    await done(await w.call('ua', w.pair, { action: 'private.setOn', opId: op(), on: true }));
    await done(await w.call('ua', w.pair, { action: 'follow.set', opId: op(), profileId: w.mia, on: true }));
    // Going down needs nobody and is no news.
    await done(await w.call('ua', w.pair, { action: 'event.rsvp', opId: op(), eventId: e.id, status: 'not_going' }));
    await w.notify();
    const rows = await w.db.query(`select id, data from feture.notification where recipient_account_id = $1 and type = 'pair.acted' order by created_at, id`, [ub]);
    assert.deepEqual(rows.map(r => r.data.what).sort(), ['access', 'community', 'event', 'eventApply', 'follow']);
    assert.equal((await w.db.query(`select 1 from feture.notification where recipient_account_id = $1 and type = 'pair.acted'`, [ua])).length, 0, 'never to the one who did it');
    const pushed = (await w.db.query(`select payload->>'notificationId' n from feture.outbox where topic = 'push.deliver' and payload->>'account' = $1`, [ub])).map(r => r.n);
    const what = Object.fromEntries(rows.map(r => [r.data.what, r]));
    for (const k of ['event', 'eventApply', 'access']) assert.ok(pushed.includes(what[k].id), `${k}: a push`);
    for (const k of ['community', 'follow']) assert.ok(!pushed.includes(what[k].id), `${k}: history only`);
    // Each row opens its place; a follow opens the person followed, as the couple.
    assert.equal(what.follow.data.target, w.mia);
    assert.equal(destination({ type: 'pair.acted', data: what.follow.data, couple: w.pair }), `/n/people/${w.mia}?as=${w.pair}`);
    assert.equal(destination({ type: 'pair.acted', data: what.event.data, couple: w.pair }), `/n/events/${e.id}?as=${w.pair}`);
    assert.equal(destination({ type: 'pair.acted', data: what.community.data, couple: w.pair }), `/n/communities/${club.id}?as=${w.pair}`);
  } finally { await w.pg.close(); }
});
