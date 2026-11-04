// S4 step 3 on PGlite as feture_api: reports queue and decisions, disputes, sanctions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { staff } from '../server/commands/staff.mjs';
import { moderation } from '../server/commands/moderation.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...posts, ...staff, ...moderation } });
const draft = (body, extra = {}) => ({ type: 'post', body, audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [], ...extra });

test('reports: grouped and ordered, decided once with reasons, reporters told; disputes; sanctions', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const boss = await person('uo', 'Boss'), mod = await person('um', 'Mira'), a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
    await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Mira', role: 'moderator', grant: true });
    const pub = async (user, prof, body) => {
      const d = await call(user, prof, { action: 'post.saveDraft', opId: op(), post: draft(body) });
      await call(user, prof, { action: 'post.publish', opId: op(), postId: d.id });
      return d.id;
    };
    const spam = await pub('ua', a, 'Купи подписку');
    const scary = await pub('ua', a, 'Угроза');
    const modsOwn = await pub('um', mod, 'Пост модератора');
    // Details are required (owner 28.10.2026): missing, blank or under 10 characters is rejected, nothing is queued.
    for (const details of [undefined, '', '          ', 'коротко']) {
      const bad = await call('ub', b, { action: 'report.create', opId: op(), targetType: 'post', targetId: spam, reason: 'spam', ...(details === undefined ? {} : { details }) });
      assert.equal(bad.status, 400); assert.deepEqual(bad.fields, ['details']);
    }
    assert.equal((await db.query('select count(*)::int n from feture.report'))[0].n, 0);
    await call('ub', b, { action: 'report.create', opId: op(), targetType: 'post', targetId: spam, reason: 'spam', details: 'Подробности для модератора' });
    await call('uc', c, { action: 'report.create', opId: op(), targetType: 'post', targetId: spam, reason: 'spam', details: 'реклама в общей ленте' });
    await call('ub', b, { action: 'report.create', opId: op(), targetType: 'post', targetId: scary, reason: 'threat', details: 'Подробности для модератора' });
    await call('ub', b, { action: 'report.create', opId: op(), targetType: 'post', targetId: modsOwn, reason: 'other', details: 'Подробности для модератора' });

    assert.equal((await call('ua', null, { action: 'staff.reportQueue' })).status, 403);
    const queue = (await call('um', null, { action: 'staff.reportQueue' })).items;
    assert.deepEqual(queue.map(i => [i.targetId, i.reports]), [[scary, 1], [spam, 2]]); // threats first; own content excluded
    assert.equal(queue[0].author.handle, 'Alex');
    assert.ok(!JSON.stringify(queue).includes(b) && !JSON.stringify(queue).includes(c)); // reporters are not named

    assert.equal((await call('um', null, { action: 'staff.reportDecide', opId: op(), targetType: 'post', targetId: spam, decision: 'remove' })).status, 400); // a rule is required
    const removed = await call('um', null, { action: 'staff.reportDecide', opId: op(), targetType: 'post', targetId: spam, decision: 'remove', rule: 'spam' });
    assert.equal(removed.resolved, 2);
    assert.equal((await call('uc', c, { action: 'post.get', postId: spam })).status, 404);
    const told = (await db.query(`select topic, profile_id from feture.outbox where topic in ('report.resolved', 'content.removed') order by id`));
    assert.deepEqual(told.map(t => t.topic).sort(), ['content.removed', 'report.resolved', 'report.resolved']);
    assert.equal((await call('um', null, { action: 'staff.reportDecide', opId: op(), targetType: 'post', targetId: modsOwn, decision: 'keep' })).status, 403);
    assert.equal((await call('um', null, { action: 'staff.reportDecide', opId: op(), targetType: 'post', targetId: scary, decision: 'keep' })).resolved, 1);

    // Dispute «это я на фото» on a post with media.
    const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1', [a]);
    const [{ id: img }] = await db.query(
      `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
       values ($1, $2, 'image', 'post', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now()) returning id`, [a, account_id]);
    const d = await call('ua', a, { action: 'post.saveDraft', opId: op(), post: draft('На пляже', { mediaIds: [img] }) });
    await call('ua', a, { action: 'post.publish', opId: op(), postId: d.id });
    await call('uc', c, { action: 'tag.object', opId: op(), postId: d.id });
    assert.deepEqual((await call('um', null, { action: 'staff.disputeQueue' })).items.map(i => i.id), [d.id]);
    assert.equal((await call('um', null, { action: 'staff.disputeDecide', opId: op(), postId: d.id, restore: true })).state, 'published');
    assert.equal((await call('ub', b, { action: 'post.get', postId: d.id })).status, 200);

    // A major edit (new photo) waits for staff; approving applies it, the live version stayed until then.
    const [{ id: img2 }] = await db.query(
      `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
       values ($1, $2, 'image', 'post', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now()) returning id`, [a, account_id]);
    const live = (await call('ua', a, { action: 'post.get', postId: d.id })).post;
    const ed = await call('ua', a, { action: 'post.edit', opId: op(), postId: d.id, rev: live.rev, post: draft('На пляже, два фото', { mediaIds: [img, img2] }) });
    assert.equal(ed.review, true);
    const revs = (await call('um', null, { action: 'staff.revisionQueue' })).items;
    assert.deepEqual(revs.map(r => r.postId), [d.id]);
    assert.equal((await call('um', null, { action: 'staff.revisionDecide', opId: op(), revisionId: revs[0].id, decision: 'approve' })).state, 'approved');
    assert.equal((await call('ub', b, { action: 'post.get', postId: d.id })).post.media.length, 2);
    assert.equal((await call('um', null, { action: 'staff.revisionDecide', opId: op(), revisionId: revs[0].id, decision: 'approve' })).status, 409);

    // Sanctions: only owner/lead; a suspended person is refused at the next request.
    assert.equal((await call('um', null, { action: 'staff.sanction', opId: op(), profileId: a, decision: 'suspend', rule: 'threats' })).status, 403);
    assert.equal((await call('uo', null, { action: 'staff.sanction', opId: op(), profileId: a, decision: 'suspend', rule: 'threats' })).state, 'suspended');
    assert.equal((await call('ua', a, { action: 'profile.settings' })).status, 403);
    assert.equal((await call('ub', b, { action: 'profile.get', profileId: a })).status, 404);
    assert.equal((await call('uo', null, { action: 'staff.sanction', opId: op(), profileId: a, decision: 'lift', rule: 'appeal_granted' })).state, 'active');
    assert.equal((await call('ua', a, { action: 'profile.settings' })).status, 200);
    const j = (await call('uo', null, { action: 'staff.journal' })).items.map(i => i.action);
    for (const act of ['report.remove', 'report.keep', 'dispute.restore', 'revision.approve', 'sanction.suspend', 'sanction.lift']) assert.ok(j.includes(act), act);
  } finally { await pg.close(); }
});

test('review fixes: no suspension through reports, rank rules, suspension covers the couple, owner-only lifts, stale revisions', async () => {
  const { pg, db, call, person, coupleOf } = await setup();
  try {
    const boss = await person('uo', 'Boss'), lead = await person('ul', 'Lena'), mod = await person('um', 'Mira');
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
    await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Lena', role: 'lead', grant: true });
    await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Mira', role: 'moderator', grant: true });

    // Profiles are never removed through a report decision, and a decision needs an open report.
    await call('ub', b, { action: 'report.create', opId: op(), targetType: 'profile', targetId: a, reason: 'threat', details: 'Подробности для модератора' });
    assert.equal((await call('um', null, { action: 'staff.reportDecide', opId: op(), targetType: 'profile', targetId: a, decision: 'remove', rule: 'threats' })).status, 400);
    const d = await call('ua', a, { action: 'post.saveDraft', opId: op(), post: draft('Без жалоб') });
    await call('ua', a, { action: 'post.publish', opId: op(), postId: d.id });
    assert.equal((await call('um', null, { action: 'staff.reportDecide', opId: op(), targetType: 'post', targetId: d.id, decision: 'remove', rule: 'spam' })).rule, 'no_open_reports');

    // Rank: a lead cannot suspend the owner or another lead.
    assert.equal((await call('ul', null, { action: 'staff.sanction', opId: op(), profileId: boss, decision: 'suspend', rule: 'threats' })).status, 403);

    // Suspending a person stops their couple too: the partner cannot keep acting as it.
    const pair = await coupleOf([a, c]);
    assert.equal((await call('ul', null, { action: 'staff.sanction', opId: op(), profileId: a, decision: 'suspend', rule: 'minors' })).state, 'suspended');
    assert.equal((await call('uc', pair, { action: 'profile.settings' })).status, 403);
    assert.equal((await call('uc', c, { action: 'profile.settings' })).status, 200); // the partner's own profile is untouched
    // A 'minors' suspension is lifted by the owner only.
    assert.equal((await call('ul', null, { action: 'staff.sanction', opId: op(), profileId: a, decision: 'lift', rule: 'appeal_granted' })).status, 403);
    assert.equal((await call('uo', null, { action: 'staff.sanction', opId: op(), profileId: a, decision: 'lift', rule: 'appeal_granted' })).state, 'active');

    // A revision made on an older version is stale once the author edited again; staff may open media of reported posts.
    const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1', [a]);
    const mk = async () => (await db.query(
      `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
       values ($1, $2, 'image', 'post', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now()) returning id`, [a, account_id]))[0].id;
    const i1 = await mk(), i2 = await mk();
    const p = await call('ua', a, { action: 'post.saveDraft', opId: op(), post: draft('Фото', { mediaIds: [i1] }) });
    await call('ua', a, { action: 'post.publish', opId: op(), postId: p.id });
    const r1 = (await call('ua', a, { action: 'post.get', postId: p.id })).post.rev;
    await call('ua', a, { action: 'post.edit', opId: op(), postId: p.id, rev: r1, post: draft('Фото', { mediaIds: [i1, i2] }) }); // major → review
    await call('ua', a, { action: 'post.edit', opId: op(), postId: p.id, rev: r1, post: draft('Фото.', { mediaIds: [i1] }) });   // minor → supersedes it
    assert.deepEqual((await call('um', null, { action: 'staff.revisionQueue' })).items, []);
    assert.equal((await call('um', null, { action: 'staff.mediaView', assetId: i1 })).status, 409);
    await call('ub', b, { action: 'report.create', opId: op(), targetType: 'post', targetId: p.id, reason: 'private', details: 'Подробности для модератора' });
    assert.ok((await call('um', null, { action: 'staff.mediaView', assetId: i1 })).src);
    const queue = (await call('um', null, { action: 'staff.reportQueue' })).items;
    assert.equal(queue.find(x => x.targetId === p.id).reported.body, 'Фото.'); // evidence snapshot taken at report time
  } finally { await pg.close(); }
});

test('«Меры»: a restriction until lifted can be lifted; staff find what is in force by @nick, never their own', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const boss = await person('uo', 'Boss'), mod = await person('um', 'Mira'), a = await person('ua', 'Alex');
    await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
    await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Mira', role: 'moderator', grant: true });
    assert.equal((await call('ua', null, { action: 'staff.profileMeasures', handle: 'Alex' })).status, 403);
    assert.equal((await call('um', null, { action: 'staff.profileMeasures', handle: 'Mira' })).status, 403);
    assert.equal((await call('um', null, { action: 'staff.profileMeasures', handle: 'nobody' })).status, 404);
    let m = await call('um', null, { action: 'staff.profileMeasures', handle: '@alex' });
    assert.deepEqual([m.profileId, m.restricted, m.suspended], [a, null, null]);

    // Until lifted (no end): the lift used to find nothing (`null <= now()`).
    assert.equal((await call('um', null, { action: 'staff.restrict', opId: op(), profileId: a, on: true, rule: 'spam' })).restricted, true);
    m = await call('um', null, { action: 'staff.profileMeasures', handle: 'Alex' });
    assert.deepEqual(m.restricted, { rule: 'spam', until: null });
    assert.equal((await call('um', null, { action: 'staff.restrict', opId: op(), profileId: a, on: true, rule: 'spam' })).rule, 'already_restricted');
    assert.equal((await call('um', null, { action: 'staff.restrict', opId: op(), profileId: a, on: false, rule: 'spam' })).restricted, false);
    const [row] = await db.query('select restricted_at from feture.profile where id = $1', [a]);
    assert.equal(row.restricted_at, null);
    assert.equal((await call('um', null, { action: 'staff.restrict', opId: op(), profileId: a, on: false, rule: 'spam' })).rule, 'not_restricted');
    // A timed one that ran out (the worker has not lifted it yet) shows as none.
    await call('um', null, { action: 'staff.restrict', opId: op(), profileId: a, on: true, rule: 'spam', days: 1 });
    await db.query(`update feture.profile set restricted_until = now() - interval '1 minute' where id = $1`, [a]);
    assert.equal((await call('um', null, { action: 'staff.profileMeasures', handle: 'Alex' })).restricted, null);
    await db.query(`update feture.profile set restricted_at = null, restricted_until = null, restriction_rule = null where id = $1`, [a]);

    // A suspension shows with its rule and end; a lead or the owner lifts it.
    await call('um', null, { action: 'staff.sanction', opId: op(), profileId: a, decision: 'suspend', rule: 'threats', days: 7 });
    m = await call('um', null, { action: 'staff.profileMeasures', handle: 'Alex' });
    assert.equal(m.suspended.rule, 'threats');
    assert.ok(m.suspended.until);
    assert.equal((await call('um', null, { action: 'staff.sanction', opId: op(), profileId: a, decision: 'lift', rule: 'threats' })).status, 403);
    assert.equal((await call('uo', null, { action: 'staff.sanction', opId: op(), profileId: a, decision: 'lift', rule: 'threats' })).state, 'active');
    assert.equal((await call('um', null, { action: 'staff.profileMeasures', handle: 'Alex' })).suspended, null);
  } finally { await pg.close(); }
});

test('«Пожаловаться» on one’s own: never on one’s couple from the personal profile, nor on one’s personal profile from the couple', async () => {
  const { pg, call, person, coupleOf } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    const pair = await coupleOf([a, b]);
    const pub = async (user, prof, body) => {
      const d = await call(user, prof, { action: 'post.saveDraft', opId: op(), post: draft(body) });
      await call(user, prof, { action: 'post.publish', opId: op(), postId: d.id });
      return d.id;
    };
    const ours = await pub('ua', pair, 'Пост пары');
    const mine = await pub('ua', a, 'Мой пост');
    const report = (user, prof, targetType, targetId) =>
      call(user, prof, { action: 'report.create', opId: op(), targetType, targetId, reason: 'spam', details: 'Подробности для модератора' });
    for (const [user, prof, type, id] of [['ua', a, 'post', ours], ['ub', b, 'post', ours], ['ub', b, 'profile', pair], ['ua', pair, 'post', mine], ['ua', pair, 'profile', a]]) {
      assert.equal((await report(user, prof, type, id)).rule, 'own_content', `${user} ${type}`);
    }
    // Someone else still reports either.
    assert.equal((await report('uc', c, 'post', ours)).status, 200);
    assert.equal((await report('uc', c, 'profile', a)).status, 200);
  } finally { await pg.close(); }
});

test('staff «своё» (audit items 7, 23): a moderator in a couple never sees or decides reports on the partner, the couple or themself; the queue count agrees', async () => {
  const { pg, db, call, person, coupleOf } = await setup();
  try {
    const boss = await person('uo', 'Boss'), mira = await person('um', 'Mira'), petya = await person('up', 'Petya'), c = await person('uc', 'Noa');
    await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
    await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Mira', role: 'moderator', grant: true });
    const pair = await coupleOf([mira, petya]);
    const pub = async (user, prof, body) => {
      const d = await call(user, prof, { action: 'post.saveDraft', opId: op(), post: draft(body) });
      await call(user, prof, { action: 'post.publish', opId: op(), postId: d.id });
      return d.id;
    };
    const partners = await pub('up', petya, 'Пост Пети'), ours = await pub('up', pair, 'Пост пары'), mine = await pub('um', mira, 'Пост Миры');
    for (const id of [partners, ours, mine]) {
      await call('uc', c, { action: 'report.create', opId: op(), targetType: 'post', targetId: id, reason: 'spam', details: 'Подробности для модератора' });
    }
    await call('uc', c, { action: 'report.create', opId: op(), targetType: 'profile', targetId: petya, reason: 'spam', details: 'Подробности для модератора' });
    const q = await call('um', null, { action: 'staff.reportQueue' });
    assert.deepEqual([q.items.length, q.total ?? q.items.length], [0, 0]);
    assert.equal((await call('um', null, { action: 'staff.reportDecide', opId: op(), targetType: 'post', targetId: partners, decision: 'keep' })).status, 403);
    assert.equal((await call('um', null, { action: 'staff.restrict', opId: op(), profileId: petya, on: true, rule: 'spam' })).status, 403);
    assert.equal((await call('um', null, { action: 'staff.profileMeasures', handle: 'Petya' })).status, 403);
    // The owner sees all four.
    assert.equal((await call('uo', null, { action: 'staff.reportQueue' })).items.length, 4);
  } finally { await pg.close(); }
});
