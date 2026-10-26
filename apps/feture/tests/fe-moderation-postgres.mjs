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
    await call('ub', b, { action: 'report.create', opId: op(), targetType: 'post', targetId: spam, reason: 'spam' });
    await call('uc', c, { action: 'report.create', opId: op(), targetType: 'post', targetId: spam, reason: 'spam', details: 'реклама' });
    await call('ub', b, { action: 'report.create', opId: op(), targetType: 'post', targetId: scary, reason: 'threat' });
    await call('ub', b, { action: 'report.create', opId: op(), targetType: 'post', targetId: modsOwn, reason: 'other' });

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
