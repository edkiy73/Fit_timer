// Moderation plan stage 5 (owner 05.11.2026) on PGlite as feture_api: a report on an organizer's announcement reaches
// the queue; removing it takes it off the event page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { posts } from '../server/commands/posts.mjs';
import { events } from '../server/commands/events.mjs';
import { staff } from '../server/commands/staff.mjs';
import { moderation } from '../server/commands/moderation.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...posts, ...events, ...staff, ...moderation } });

test('a report on an announcement: in the queue with its text; «Удалить» takes it off the event page', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const boss = await person('uo', 'Boss'), org = await person('ug', 'Olga'), kira = await person('uk', 'Kira');
    await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
    const at = (/** @type {number} */ d, h = 0) => new Date(Date.now() + d * 864e5 + h * 36e5).toISOString();
    const [{ id: ev }] = await db.query(
      `insert into feture.event (organizer_profile_id, created_by, title, kind, description, format, join_url, tz, starts_at, ends_at, state)
       select $1, account_id, 'Вечер', 'meetup', 'Спокойный вечер для знакомства, без спешки и давления.', 'online', 'https://meet.example/x', 'UTC', $2, $3, 'published'
       from feture.profile_member where profile_id = $1 limit 1 returning id`, [org, at(5), at(5, 3)]);
    const n = await call('ug', org, { action: 'event.announce', opId: op(), eventId: ev, body: 'Пишите мне в личку за скидкой' });
    assert.equal((await call('uk', kira, { action: 'report.create', opId: op(), targetType: 'announcement', targetId: n.id, reason: 'spam', details: 'Реклама в объявлении события' })).status, 200);
    const item = (await call('uo', null, { action: 'staff.reportQueue' })).items.find((/** @type {any} */ x) => x.targetType === 'announcement');
    assert.ok(item?.excerpt?.includes('скидкой'), JSON.stringify(item));
    assert.equal((await call('uo', null, { action: 'staff.reportDecide', opId: op(), targetType: 'announcement', targetId: n.id, decision: 'remove', rule: 'spam' })).status, 200);
    const page = await call('uk', kira, { action: 'event.get', eventId: ev });
    assert.equal((page.event.announcements ?? []).some((/** @type {any} */ a) => a.id === n.id), false);
  } finally { await pg.close(); }
});

test('the word filter: a listed word sends a reply and a profile to the report queue as «Автофильтр», once; the text is not held back', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const boss = await person('uo', 'Boss'), kira = await person('uk', 'Kira');
    await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
    assert.equal((await call('uo', null, { action: 'staff.wordSet', opId: op(), word: 'Казино', on: true })).word, 'казино');
    assert.deepEqual((await call('uo', null, { action: 'staff.words' })).items.map((/** @type {any} */ x) => x.word), ['казино']);
    const d = await call('uk', kira, { action: 'post.saveDraft', opId: op(), post: { type: 'post', body: 'Лучшее КАЗИНО в городе', audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [] } });
    assert.equal((await call('uk', kira, { action: 'post.publish', opId: op(), postId: d.id })).state, 'published');
    const r = await call('uk', kira, { action: 'reply.create', opId: op(), postId: d.id, body: 'и ещё казино' });
    assert.ok(r.id);
    await call('uk', kira, { action: 'profile.update', opId: op(), rev: 1, bio: 'Пишите про казино' });
    const auto = await db.query(`select target_type, details from feture.report where auto = 'words' order by created_at`);
    assert.deepEqual(auto.map(x => x.target_type), ['post', 'reply', 'profile']);
    assert.ok(auto[0].details.includes('казино'));
    // An edit does not file a second report while the first is open; «казиноман» is another word.
    const [{ rev }] = await db.query('select rev from feture.reply where id = $1', [r.id]);
    await call('uk', kira, { action: 'reply.edit', opId: op(), replyId: r.id, rev, body: 'и ещё казино и казиноман' });
    assert.equal((await db.query(`select count(*)::int n from feture.report where auto = 'words' and target_type = 'reply'`))[0].n, 1);
    const q = await call('uo', null, { action: 'staff.reportQueue' });
    assert.ok(q.items.some((/** @type {any} */ x) => x.targetType === 'reply'));
  } finally { await pg.close(); }
});
