// Audit 04.11.2026, stage 2 on PGlite as feture_api: moderation queues without dead items — material its author took
// down, a removed post the author «deletes», reports / appeals / disputes on material that is gone, changes of hidden
// communities, events whose time passed in review.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { staff } from '../server/commands/staff.mjs';
import { moderation } from '../server/commands/moderation.mjs';
import { communities } from '../server/commands/communities.mjs';
import { events, releaseLateEvents } from '../server/commands/events.mjs';
import { accounts } from '../server/commands/account.mjs';
import { setup as baseSetup, op, photoVerified } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...posts, ...staff, ...moderation, ...communities, ...events, ...accounts } });
const draft = (body, extra = {}) => ({ type: 'post', body, audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [], ...extra });
const DETAILS = 'Подробности для модератора';

async function world() {
  const env = await setup();
  const { db, call, person } = env;
  const boss = await person('uo', 'Boss');
  await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
  const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
  const pub = async (/** @type {string} */ user, /** @type {string} */ prof, /** @type {string} */ body, extra = {}) => {
    const d = await call(user, prof, { action: 'post.saveDraft', opId: op(), post: draft(body, extra) });
    await call(user, prof, { action: 'post.publish', opId: op(), postId: d.id });
    return /** @type {string} */ (d.id);
  };
  const report = (/** @type {string} */ targetType, /** @type {string} */ targetId) =>
    call('ub', b, { action: 'report.create', opId: op(), targetType, targetId, reason: 'spam', details: DETAILS });
  const reportsOf = async (/** @type {string} */ id) => (await db.query('select state, resolution from feture.report where target_id = $1', [id])).map(r => r.state + ':' + r.resolution);
  return { ...env, a, b, pub, report, reportsOf };
}

test('item 3: a post its author hid and a reply they deleted — staff record the violation; the reports close as confirmed, the author is named in the journal', async () => {
  const { pg, db, call, a, b, pub, report, reportsOf } = await world();
  try {
    const post = await pub('ua', a, 'Купи подписку');
    await report('post', post);
    assert.equal((await call('ua', a, { action: 'post.delete', opId: op(), postId: post })).state, 'archived'); // reported: kept as evidence
    const card = (await call('uo', null, { action: 'staff.reportQueue' })).items.find((/** @type {any} */ x) => x.targetId === post);
    assert.equal(card.state, 'archived');
    assert.equal((await call('uo', null, { action: 'staff.reportDecide', opId: op(), targetType: 'post', targetId: post, decision: 'remove', rule: 'spam' })).resolved, 1);
    const [p] = await db.query('select state, removed_reason from feture.post where id = $1', [post]);
    assert.deepEqual([p.state, p.removed_reason], ['archived', 'spam']);
    assert.deepEqual(await reportsOf(post), ['resolved:removed']);
    const [j] = await db.query(`select detail from feture.staff_action where action = 'report.remove' and target_id = $1`, [post]);
    assert.deepEqual([j.detail.author, j.detail.gone], [a, true]);
    // The author is not told about a removal: nothing visible was taken from them.
    assert.equal((await db.query(`select count(*)::int n from feture.outbox where topic = 'content.removed' and payload->>'targetId' = $1`, [post]))[0].n, 0);

    const host = await pub('ub', b, 'Пост для ответа');
    const reply = (await call('ua', a, { action: 'reply.create', opId: op(), postId: host, body: 'Грубый ответ' })).id;
    await report('reply', reply);
    await call('ua', a, { action: 'reply.delete', opId: op(), replyId: reply });
    assert.equal((await call('uo', null, { action: 'staff.reportDecide', opId: op(), targetType: 'reply', targetId: reply, decision: 'remove', rule: 'threats' })).resolved, 1);
    assert.deepEqual(await reportsOf(reply), ['resolved:removed']);
  } finally { await pg.close(); }
});

test('item 4: «удалить» on a post moderators removed keeps it removed (appealable), out of the author’s lists; a granted appeal brings it back', async () => {
  const { pg, db, call, a, pub, report } = await world();
  try {
    const post = await pub('ua', a, 'Спорный пост');
    await report('post', post);
    await call('uo', null, { action: 'staff.reportDecide', opId: op(), targetType: 'post', targetId: post, decision: 'remove', rule: 'spam' });
    assert.equal((await call('ua', a, { action: 'post.delete', opId: op(), postId: post })).state, 'removed');
    const [p] = await db.query('select state, author_hidden from feture.post where id = $1', [post]);
    assert.deepEqual([p.state, p.author_hidden], ['removed', true]);
    assert.ok(!(await call('ua', a, { action: 'me.posts' })).items.some((/** @type {any} */ x) => x.id === post));
    const ap = await call('ua', a, { action: 'appeal.create', opId: op(), targetType: 'post', targetId: post, body: 'Это не спам, прошу проверить ещё раз.' });
    assert.equal(ap.state, 'open', JSON.stringify(ap));
    // Another senior looks: the owner decided the removal, a lead decides the appeal.
    await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Kira', role: 'lead', grant: true });
    assert.equal((await call('ub', null, { action: 'staff.appealDecide', opId: op(), appealId: ap.id, grant: true, note: '' })).status, 200);
    const [back] = await db.query('select state, author_hidden from feture.post where id = $1', [post]);
    assert.deepEqual([back.state, back.author_hidden], ['published', false]);
  } finally { await pg.close(); }
});

test('items 22, 24, 25: a deleted account closes reports on its profile and community as «unavailable», its open appeal, the disputes on its posts', async () => {
  const { pg, db, call, a, b, pub, report, reportsOf } = await world();
  try {
    const c = await call('ua', a, { action: 'community.create', opId: op(), name: 'Клуб Алекса', privacy: 'open', description: 'Встречи и разговоры о верёвке для новичков', topics: ['shibari'], rules: ['Уважать границы'], plate: 'rose' });
    const item = (await call('uo', null, { action: 'staff.communityQueue' })).items.find((/** @type {any} */ x) => x.id === c.id);
    await call('uo', null, { action: 'staff.communityDecide', opId: op(), communityId: c.id, rev: item.rev, decision: 'approve' });
    await report('community', c.id);
    await report('profile', a);
    // An open appeal of a restriction.
    await call('uo', null, { action: 'staff.restrict', opId: op(), profileId: a, on: true, rule: 'spam', days: 7 });
    const ap = await call('ua', a, { action: 'appeal.create', opId: op(), targetType: 'profile', targetId: a, body: 'Это ошибка, я не рассылал спам.' });
    assert.equal(ap.state, 'open', JSON.stringify(ap));
    await call('uo', null, { action: 'staff.restrict', opId: op(), profileId: a, on: false, rule: 'spam' }); // deletion waits for no restriction
    // A «это я на фото» dispute on a photo post.
    const [{ id: acc }] = await db.query('select id from feture.account where person_profile_id = $1', [a]);
    const [{ id: img }] = await db.query(`insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
      values ($1, $2, 'image', 'post', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now()) returning id`, [a, acc]);
    const photo = await pub('ua', a, 'Фото', { mediaIds: [img] });
    await photoVerified(db, b);
    assert.equal((await call('ub', b, { action: 'tag.object', opId: op(), postId: photo })).status, 200);

    assert.equal((await call('ua', null, { action: 'account.delete', opId: op(), confirmHandle: 'Alex' })).deleted, true);
    assert.deepEqual(await reportsOf(c.id), ['resolved:unavailable']);
    assert.deepEqual(await reportsOf(a), ['resolved:unavailable']);
    assert.equal((await db.query('select state from feture.appeal where id = $1', [ap.id]))[0].state, 'closed');
    assert.equal((await call('uo', null, { action: 'staff.appealQueue' })).items.length, 0);
    assert.equal((await db.query('select state from feture.photo_dispute where post_id = $1', [photo]))[0].state, 'closed');
    const told = await db.query(`select payload from feture.outbox where topic = 'dispute.resolved'`);
    assert.deepEqual(told.map(r => r.payload.outcome), ['gone']);
    const resolved = await db.query(`select payload from feture.outbox where topic = 'report.resolved'`);
    assert.ok(resolved.length >= 2 && resolved.every(r => r.payload.resolution === 'unavailable'));
  } finally { await pg.close(); }
});

test('item 26: removing a post for a dispute answers the reports on it', async () => {
  const { pg, db, call, a, b, pub, report, reportsOf } = await world();
  try {
    const [{ id: acc }] = await db.query('select id from feture.account where person_profile_id = $1', [a]);
    const [{ id: img }] = await db.query(`insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
      values ($1, $2, 'image', 'post', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now()) returning id`, [a, acc]);
    const photo = await pub('ua', a, 'Фото', { mediaIds: [img] });
    await photoVerified(db, b);
    await call('ub', b, { action: 'tag.object', opId: op(), postId: photo });
    await db.query(`update feture.post set disputed_at = null where id = $1`, [photo]); // still visible: the report is open on a live post
    await report('post', photo);
    assert.equal((await call('uo', null, { action: 'staff.disputeDecide', opId: op(), postId: photo, restore: false, note: '' })).state, 'removed');
    assert.deepEqual(await reportsOf(photo), ['resolved:removed']);
  } finally { await pg.close(); }
});

test('item 18: a change of a community that staff hid leaves the queue and cannot be approved', async () => {
  const { pg, call, a, report } = await world();
  try {
    const c = await call('ua', a, { action: 'community.create', opId: op(), name: 'Старое имя', privacy: 'open', description: 'Встречи и разговоры о верёвке для новичков', topics: ['shibari'], rules: ['Уважать границы'], plate: 'rose' });
    let item = (await call('uo', null, { action: 'staff.communityQueue' })).items.find((/** @type {any} */ x) => x.id === c.id);
    await call('uo', null, { action: 'staff.communityDecide', opId: op(), communityId: c.id, rev: item.rev, decision: 'approve' });
    const g = (await call('ua', a, { action: 'community.get', communityId: c.id })).community;
    assert.deepEqual((await call('ua', a, { action: 'community.update', opId: op(), communityId: c.id, rev: g.rev, name: 'Новое имя' })).review, ['name']);
    await report('community', c.id);
    await call('uo', null, { action: 'staff.reportDecide', opId: op(), targetType: 'community', targetId: c.id, decision: 'remove', rule: 'spam' });
    assert.ok(!(await call('uo', null, { action: 'staff.communityQueue' })).items.some((/** @type {any} */ x) => x.id === c.id));
  } finally { await pg.close(); }
});

test('item 32: an event whose start passed in review goes back to drafts, leaves the queue, and the organizer is told', async () => {
  const { pg, db, call, a } = await world();
  try {
    const [{ id: berlin }] = await db.query(`select id from feture.place where code = 'berlin'`);
    const at = (/** @type {number} */ d, h = 0) => new Date(Date.now() + d * 864e5 + h * 36e5).toISOString();
    const r = await call('ua', a, { action: 'event.submit', opId: op(), event: {
      title: 'Вечер знакомств', kind: 'meetup', description: 'Спокойный вечер для знакомства, без спешки и давления.',
      format: 'offline', placeId: berlin, area: 'Кройцберг', exactAddress: 'Oranienstr. 1, 2 этаж', tz: 'Europe/Berlin', startsAt: at(7), endsAt: at(7, 3) } });
    assert.equal(r.state, 'in_review', JSON.stringify(r));
    await db.query(`update feture.event set starts_at = now() - interval '1 hour', ends_at = now() + interval '2 hours' where id = $1`, [r.id]);
    assert.ok(!(await call('uo', null, { action: 'staff.eventQueue' })).items.some((/** @type {any} */ x) => x.id === r.id));
    assert.equal(await db.tx((/** @type {any} */ q) => releaseLateEvents(q)), 1);
    assert.equal((await db.query('select count(*)::int n from feture.event where id = $1', [r.id]))[0].n, 0);
    const [d] = await db.query('select id, form->>\'title\' title from feture.event_draft where owner_profile_id = $1', [a]);
    assert.equal(d.title, 'Вечер знакомств');
    const [n] = await db.query(`select payload from feture.outbox where topic = 'event.lateDraft'`);
    assert.equal(n.payload.draftId, d.id);
  } finally { await pg.close(); }
});
