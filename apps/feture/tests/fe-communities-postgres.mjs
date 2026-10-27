// Slice D1 on PGlite as feture_api: communities, membership, requests, bans, hidden invites, members, discussions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { staff } from '../server/commands/staff.mjs';
import { communities } from '../server/commands/communities.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...posts, ...staff, ...communities } });
const base = { description: 'Встречи и разговоры о верёвке для новичков', topics: ['shibari'], rules: ['Уважать границы'], plate: 'rose' };
const draft = (body, extra = {}) => ({ type: 'post', body, audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [], ...extra });

async function world() {
  const env = await setup();
  const { db, call, person } = env;
  const boss = await person('uo', 'Boss'), mod = await person('um', 'Mira');
  await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
  await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Mira', role: 'moderator', grant: true });
  const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
  /** Staff decide on the version they saw in the queue. */
  const decide = async (communityId, decision = 'approve') => {
    const item = (await call('um', null, { action: 'staff.communityQueue' })).items.find((/** @type {any} */ x) => x.id === communityId);
    return call('um', null, { action: 'staff.communityDecide', opId: op(), communityId, rev: item.rev, decision });
  };
  /** Creates and publishes a community owned by `profile`. */
  const make = async (user, profile, extra) => {
    const r = await call(user, profile, { action: 'community.create', opId: op(), ...base, ...extra });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.equal((await decide(r.id)).decision, 'approve');
    return r.id;
  };
  return { ...env, a, b, c, make, decide };
}

test('created communities wait for staff; catalog; names unique; major edits wait, minor apply', async () => {
  const { pg, call, a, b, decide } = await world();
  try {
    const r = await call('ua', a, { action: 'community.create', opId: op(), name: 'Узлы и разговоры', privacy: 'open', ...base });
    assert.equal(r.state, 'in_review');
    assert.equal((await call('ub', b, { action: 'community.get', communityId: r.id })).status, 404);
    assert.equal((await call('ua', a, { action: 'community.get', communityId: r.id })).community.state, 'in_review');
    assert.equal((await call('ub', b, { action: 'community.create', opId: op(), name: 'УЗЛЫ И РАЗГОВОРЫ', privacy: 'open', ...base })).field, 'name');
    const queue = (await call('um', null, { action: 'staff.communityQueue' })).items;
    assert.ok(queue.some(x => x.id === r.id));
    // Staff decide on what they saw: an edit after the card was opened needs a fresh look.
    const seenRev = (await call('um', null, { action: 'staff.communityQueue' })).items.find((/** @type {any} */ x) => x.id === r.id).rev;
    await call('ua', a, { action: 'community.update', opId: op(), communityId: r.id, rev: seenRev, description: 'Совсем другое описание после открытия карточки' });
    assert.equal((await call('um', null, { action: 'staff.communityDecide', opId: op(), communityId: r.id, rev: seenRev, decision: 'approve' })).status, 409);
    await decide(r.id);
    assert.deepEqual((await call('ub', b, { action: 'community.catalog' })).items.map(i => i.name), ['Узлы и разговоры']);

    const got = (await call('ua', a, { action: 'community.get', communityId: r.id })).community;
    const upd = await call('ua', a, { action: 'community.update', opId: op(), communityId: r.id, rev: got.rev, rules: ['Уважать границы', 'Без фото без согласия'], name: 'Узлы, разговоры и чай' });
    assert.deepEqual(upd.review, ['name']);
    const seen = (await call('ub', b, { action: 'community.get', communityId: r.id })).community;
    assert.deepEqual([seen.name, seen.rules.length], ['Узлы и разговоры', 2]); // rules at once, the new name after staff
    await decide(r.id);
    assert.equal((await call('ub', b, { action: 'community.get', communityId: r.id })).community.name, 'Узлы, разговоры и чай');
    assert.equal((await call('ub', b, { action: 'community.update', opId: op(), communityId: r.id, rev: 9, rules: ['x'] })).status, 403);
  } finally { await pg.close(); }
});

test('joining: open at once, closed by request decided by hosts, removal is a ban, the owner cannot leave', async () => {
  const { pg, call, a, b, c, make } = await world();
  try {
    const open = await make('ua', a, { name: 'Открытое сообщество', privacy: 'open' });
    const closed = await make('ua', a, { name: 'Закрытое сообщество', privacy: 'closed', joinQuestion: 'Почему вам интересно?' });
    assert.equal((await call('ub', b, { action: 'community.join', opId: op(), communityId: open, rulesAccepted: true })).state, 'member');
    assert.deepEqual((await call('uc', c, { action: 'community.join', opId: op(), communityId: closed, rulesAccepted: true, answer: 'Коротко' })).fields, ['answer']);
    const req = await call('uc', c, { action: 'community.join', opId: op(), communityId: closed, rulesAccepted: true, answer: 'Хочу научиться безопасно' });
    assert.equal(req.state, 'requested');
    assert.equal((await call('ub', b, { action: 'community.requests', communityId: closed })).status, 403);
    const pending = (await call('ua', a, { action: 'community.requests', communityId: closed })).items;
    assert.deepEqual([pending[0].profile.handle, pending[0].answer], ['Noa', 'Хочу научиться безопасно']);
    assert.equal((await call('ua', a, { action: 'community.requestDecide', opId: op(), requestId: req.id, rev: pending[0].rev, approve: true })).state, 'approved');
    assert.equal((await call('uc', c, { action: 'community.get', communityId: closed })).community.me.state, 'active');

    // Removal is once and a ban: rejoining even an open community needs a request.
    await call('ua', a, { action: 'community.member', opId: op(), communityId: open, profileId: b, change: 'remove' });
    assert.equal((await call('ub', b, { action: 'community.join', opId: op(), communityId: open, rulesAccepted: true })).state, 'requested');
    assert.equal((await call('ua', a, { action: 'community.leave', opId: op(), communityId: open })).rule, 'owner_cannot_leave');
    // Hosts manage members; only the owner manages hosts.
    await call('ua', a, { action: 'community.member', opId: op(), communityId: closed, profileId: c, change: 'host' });
    assert.equal((await call('uc', c, { action: 'community.requests', communityId: closed })).status, 200);
    assert.equal((await call('uc', c, { action: 'community.member', opId: op(), communityId: closed, profileId: a, change: 'remove' })).rule, 'not_allowed');
  } finally { await pg.close(); }
});

test('hidden communities exist only for members and invitation holders; member lists are unlisted by default', async () => {
  const { pg, call, a, b, c, make } = await world();
  try {
    const hidden = await make('ua', a, { name: 'Скрытое сообщество', privacy: 'hidden', joinQuestion: 'Кто вас пригласил?' });
    assert.equal((await call('ub', b, { action: 'community.get', communityId: hidden })).status, 404);
    assert.deepEqual((await call('ub', b, { action: 'community.catalog' })).items, []);
    const { token } = await call('ua', a, { action: 'community.invite', opId: op(), communityId: hidden });
    assert.equal((await call('ub', b, { action: 'community.get', communityId: hidden, invite: token })).community.privacy, 'hidden');
    const req = await call('ub', b, { action: 'community.join', opId: op(), communityId: hidden, rulesAccepted: true, answer: 'Меня позвал Алекс', invite: token });
    assert.equal(req.state, 'requested');
    await call('ua', a, { action: 'community.invite', opId: op(), communityId: hidden, revokeAll: true });
    assert.equal((await call('uc', c, { action: 'community.get', communityId: hidden, invite: token })).status, 404);

    const open = await make('ua', a, { name: 'Ещё открытое', privacy: 'open' });
    await call('ub', b, { action: 'community.join', opId: op(), communityId: open, rulesAccepted: true });
    await call('uc', c, { action: 'community.join', opId: op(), communityId: open, rulesAccepted: true });
    const list = await call('ub', b, { action: 'community.members', communityId: open });
    assert.deepEqual([list.count, list.items.map(m => m.handle).sort()], [3, ['Alex', 'Kira']]); // hosts and oneself; Noa is unlisted
    // The owner moderates every member, listed or not.
    assert.deepEqual((await call('ua', a, { action: 'community.members', communityId: open })).items.map(m => m.handle).sort(), ['Alex', 'Kira', 'Noa']);
    await call('uc', c, { action: 'community.self', opId: op(), communityId: open, listed: true });
    assert.ok((await call('ub', b, { action: 'community.members', communityId: open })).items.some(m => m.handle === 'Noa'));
  } finally { await pg.close(); }
});

test('discussions: members write, closed ones are for members, read-only cannot post, hosts pin and remove, couples write as members', async () => {
  const { pg, call, coupleOf, a, b, c, make } = await world();
  try {
    const closed = await make('ua', a, { name: 'Закрытый клуб', privacy: 'closed', joinQuestion: 'Кто вы?' });
    const open = await make('ua', a, { name: 'Открытый клуб', privacy: 'open' });
    const post = async (user, prof, communityId, body) => {
      const d = await call(user, prof, { action: 'post.saveDraft', opId: op(), post: draft(body, { communityId }) });
      if (d.status !== 200) return d;
      return { id: d.id, ...(await call(user, prof, { action: 'post.publish', opId: op(), postId: d.id })) };
    };
    assert.equal((await post('ub', b, open, 'Чужой пост')).rule, 'community_members_only');
    await call('ub', b, { action: 'community.join', opId: op(), communityId: open, rulesAccepted: true });
    const t = await post('ub', b, open, 'Тема для обсуждения');
    assert.equal(t.state, 'published');
    assert.equal((await call('uc', c, { action: 'post.get', postId: t.id })).status, 200); // open: everyone reads
    assert.equal((await call('uc', c, { action: 'reply.create', opId: op(), postId: t.id, body: 'Мимо проходил' })).rule, 'community_members_only');
    assert.ok(!(await call('uc', c, { action: 'feed.list', tab: 'forYou' })).items.some(i => i.id === t.id)); // never in the main feed

    const inside = await post('ua', a, closed, 'Только для своих');
    assert.equal((await call('ub', b, { action: 'post.get', postId: inside.id })).status, 404);
    assert.equal((await call('ub', b, { action: 'community.discussions', communityId: closed })).locked, true);

    await call('ua', a, { action: 'community.member', opId: op(), communityId: open, profileId: b, change: 'readOnly' });
    assert.equal((await post('ub', b, open, 'Ещё тема')).rule, 'community_members_only');
    await call('ua', a, { action: 'discussion.host', opId: op(), postId: t.id, change: 'pin' });
    assert.equal((await call('uc', c, { action: 'community.discussions', communityId: open })).items[0].pinned, true);
    await call('ua', a, { action: 'discussion.host', opId: op(), postId: t.id, change: 'remove' });
    assert.equal((await call('uc', c, { action: 'post.get', postId: t.id })).status, 404);

    // A couple writes «от пары» when both partners are members who may write.
    await call('uc', c, { action: 'community.join', opId: op(), communityId: open, rulesAccepted: true });
    await call('ua', a, { action: 'community.member', opId: op(), communityId: open, profileId: b, change: 'canWrite' });
    const pair = await coupleOf([b, c]);
    assert.equal((await post('ub', pair, open, 'Тема от пары')).state, 'published');
  } finally { await pg.close(); }
});

test('review fixes: refs on update, wider privacy keeps old discussions for members, bans cover couples, couples read, votes and host limits', async () => {
  const { pg, db, call, coupleOf, a, b, c, make, decide } = await world();
  try {
    const post = async (user, prof, communityId, body) => {
      const d = await call(user, prof, { action: 'post.saveDraft', opId: op(), post: draft(body, { communityId }) });
      if (d.status !== 200) return d;
      return { id: d.id, ...(await call(user, prof, { action: 'post.publish', opId: op(), postId: d.id })) };
    };
    // Someone else's photo never becomes a cover, not even through an edit.
    const [{ id: foreign }] = await db.query(`insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, mime, declared_bytes, storage_key, state)
      select $1, account_id, 'image', 'community', 'image/jpeg', 10, 'u/x', 'uploaded' from feture.profile_member where profile_id = $1 returning id`, [b]);
    const closed = await make('ua', a, { name: 'Был закрытым', privacy: 'closed', joinQuestion: 'Кто вы?' });
    let got = (await call('ua', a, { action: 'community.get', communityId: closed })).community;
    assert.deepEqual((await call('ua', a, { action: 'community.update', opId: op(), communityId: closed, rev: got.rev, coverAssetId: foreign })).fields, ['coverAssetId']);

    // A discussion written while closed stays for members after the community opens.
    const inside = await post('ua', a, closed, 'Писалось только для своих');
    got = (await call('ua', a, { action: 'community.get', communityId: closed })).community;
    assert.deepEqual((await call('ua', a, { action: 'community.update', opId: op(), communityId: closed, rev: got.rev, privacy: 'open' })).review, ['privacy', 'joinQuestion']);
    await decide(closed);
    const now = (await call('ub', b, { action: 'community.get', communityId: closed })).community;
    assert.deepEqual([now.privacy, now.joinQuestion], ['open', null]);
    assert.equal((await call('ub', b, { action: 'post.get', postId: inside.id })).status, 404);
    const later = await post('ua', a, closed, 'Это уже для всех');
    assert.equal((await call('ub', b, { action: 'post.get', postId: later.id })).status, 200);
    // Only members vote; hosts do not remove the owner's discussions.
    assert.equal((await call('ub', b, { action: 'poll.vote', opId: op(), postId: later.id, option: 0 })).rule, 'community_members_only');
    await call('ub', b, { action: 'community.join', opId: op(), communityId: closed, rulesAccepted: true });
    await call('ua', a, { action: 'community.member', opId: op(), communityId: closed, profileId: b, change: 'host' });
    assert.equal((await call('ub', b, { action: 'discussion.host', opId: op(), postId: later.id, change: 'remove' })).status, 403);

    // A ban covers the person's couple: it has to ask.
    const open = await make('ua', a, { name: 'Открытое для пар', privacy: 'open' });
    await call('uc', c, { action: 'community.join', opId: op(), communityId: open, rulesAccepted: true });
    await call('ua', a, { action: 'community.member', opId: op(), communityId: open, profileId: c, change: 'remove' });
    const pair = await coupleOf([b, c]);
    assert.equal((await call('ub', pair, { action: 'community.join', opId: op(), communityId: open, rulesAccepted: true })).state, 'requested');

    // A couple whose partners are both members reads a closed community's discussions.
    const club = await make('ua', a, { name: 'Клуб для двоих', privacy: 'closed', joinQuestion: 'Кто вы?' });
    for (const [u, prof] of [['ub', b], ['uc', c]]) {
      const r = await call(u, prof, { action: 'community.join', opId: op(), communityId: club, rulesAccepted: true, answer: 'Хотим вместе учиться' });
      const pending = (await call('ua', a, { action: 'community.requests', communityId: club })).items.find((/** @type {any} */ x) => x.id === r.id);
      await call('ua', a, { action: 'community.requestDecide', opId: op(), requestId: r.id, rev: pending.rev, approve: true });
    }
    const t = await post('ua', a, club, 'Закрытая тема клуба');
    assert.equal((await call('ub', pair, { action: 'post.get', postId: t.id })).status, 200);
    assert.equal((await call('ub', pair, { action: 'community.discussions', communityId: club })).locked, false);
  } finally { await pg.close(); }
});

test('catalog cards: description, cover, «обсуждали…» only where the viewer may read; members and requests carry faces', async () => {
  const { pg, db, call, a, b, c, make } = await world();
  try {
    const open = await make('ua', a, { name: 'Открытый клуб', privacy: 'open' });
    const closed = await make('ua', a, { name: 'Закрытый клуб', privacy: 'closed', joinQuestion: 'Почему вам интересно?' });
    for (const communityId of [open, closed]) {
      const d = await call('ua', a, { action: 'post.saveDraft', opId: op(), post: draft('Первое обсуждение клуба', { communityId }) });
      assert.equal((await call('ua', a, { action: 'post.publish', opId: op(), postId: d.id })).status, 200);
    }
    // An approved cover is shown as a public place shows it.
    const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [a]);
    const [cov] = await db.query(
      `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
       values ($1, $2, 'image', 'community', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now()) returning id`, [a, account_id]);
    await db.query('update feture.community set cover_asset_id = $1 where id = $2', [cov.id, open]);
    const items = (await call('ub', b, { action: 'community.catalog' })).items;
    const o = items.find((/** @type {any} */ x) => x.id === open), cl = items.find((/** @type {any} */ x) => x.id === closed);
    assert.equal(o.description, base.description);
    assert.ok(o.cover?.src?.thumb, 'cover url');
    assert.equal(cl.cover, null);
    assert.ok(o.lastTalkAt && !Number.isNaN(Date.parse(o.lastTalkAt)));
    assert.equal(cl.lastTalkAt, null); // a closed club's discussions are for members only
    assert.equal(o.nextEventAt, null);
    const got = (await call('ub', b, { action: 'community.get', communityId: open })).community;
    assert.ok(got.cover?.src && got.lastTalkAt);
    assert.deepEqual([got.hosts[0].id, got.hosts[0].premium, got.hosts[0].photoVerified], [a, false, false]);

    // Faces: the age only when the person shows it, the Premium badge is public.
    await db.query(`update feture.profile_details set show_age = true where profile_id = $1`, [b]);
    await db.query(`update feture.profile_details set show_age = false where profile_id = $1`, [c]);
    await db.query(`update feture.account set premium_until = now() + interval '1 month' where person_profile_id = $1`, [b]);
    await call('ub', b, { action: 'community.join', opId: op(), communityId: open, rulesAccepted: true });
    await call('uc', c, { action: 'community.join', opId: op(), communityId: closed, rulesAccepted: true, answer: 'Хочу научиться безопасно' });
    const kira = (await call('ua', a, { action: 'community.members', communityId: open })).items.find((/** @type {any} */ m) => m.id === b);
    assert.deepEqual([typeof kira.age, kira.premium, kira.photoVerified, kira.avatar], ['number', true, false, null]);
    const req = (await call('ua', a, { action: 'community.requests', communityId: closed })).items[0];
    assert.deepEqual([req.profile.id, req.profile.age, req.profile.premium], [c, null, false]);
  } finally { await pg.close(); }
});
