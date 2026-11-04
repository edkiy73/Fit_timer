// Audit 04.11.2026, stage 3 on PGlite as feture_api: moderation decisions are clear and appealable — the decision
// card names the material, a report kept by staff is not filed again unchanged, a rejected event can be appealed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { staff } from '../server/commands/staff.mjs';
import { moderation } from '../server/commands/moderation.mjs';
import { events } from '../server/commands/events.mjs';
import { inbox } from '../server/commands/inbox.mjs';
import { notifyHandlers } from '../server/notify.mjs';
import { drain } from '../server/outbox.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...posts, ...staff, ...moderation, ...events, ...inbox } });
const draft = (body) => ({ type: 'post', body, audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [] });
const DETAILS = 'Подробности для модератора';

async function world() {
  const env = await setup();
  const { db, call, person } = env;
  const boss = await person('uo', 'Boss');
  await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
  const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
  const pub = async (/** @type {string} */ body) => {
    const d = await call('ua', a, { action: 'post.saveDraft', opId: op(), post: draft(body) });
    await call('ua', a, { action: 'post.publish', opId: op(), postId: d.id });
    return /** @type {string} */ (d.id);
  };
  const deliver = async () => { while ((await drain(db, notifyHandlers(db), { limit: 50 })) > 0) { /* until empty */ } };
  return { ...env, a, b, pub, deliver };
}

test('item 29: the decision card names the material (an excerpt and its date) for its author only', async () => {
  const { pg, call, a, b, pub, deliver } = await world();
  try {
    const post = await pub('Очень длинный текст поста, который нарушает правила сообщества, потому что в нём реклама и ссылка на сторонний сайт с подпиской. '.repeat(2));
    await call('ub', b, { action: 'report.create', opId: op(), targetType: 'post', targetId: post, reason: 'spam', details: DETAILS });
    await call('uo', null, { action: 'staff.reportDecide', opId: op(), targetType: 'post', targetId: post, decision: 'remove', rule: 'spam' });
    await deliver();
    const row = (await call('ua', null, { action: 'notifications.list' })).items.find((/** @type {any} */ x) => x.type === 'contentRemoved');
    const card = await call('ua', null, { action: 'notifications.get', id: row.id });
    assert.ok(card.material.excerpt.startsWith('Очень длинный текст поста'));
    assert.ok(card.material.excerpt.length <= 120 && card.material.excerpt.endsWith('…'));
    assert.ok(card.material.at);
    // The reporter's «Жалоба рассмотрена» carries nothing of the material.
    const rep = (await call('ub', null, { action: 'notifications.list' })).items.find((/** @type {any} */ x) => x.type === 'reportResolved');
    assert.equal((await call('ub', null, { action: 'notifications.get', id: rep.id })).material, null);
  } finally { await pg.close(); }
});

test('item 31: after «оставлено» the same person cannot report the same unchanged material again; after an edit, or someone else, can', async () => {
  const { pg, call, person, a, b, pub } = await world();
  try {
    const post = await pub('Обычный пост');
    const report = (/** @type {string} */ user, /** @type {string} */ prof) =>
      call(user, prof, { action: 'report.create', opId: op(), targetType: 'post', targetId: post, reason: 'spam', details: DETAILS });
    assert.equal((await report('ub', b)).status, 200);
    await call('uo', null, { action: 'staff.reportDecide', opId: op(), targetType: 'post', targetId: post, decision: 'keep' });
    const again = await report('ub', b);
    assert.deepEqual([again.status, again.rule], [409, 'already_checked']);
    const c = await person('uc', 'Noa');
    assert.equal((await report('uc', c)).status, 200); // someone else: as usual
    const rev = (await call('ua', a, { action: 'post.get', postId: post })).post.rev;
    await call('ua', a, { action: 'post.edit', opId: op(), postId: post, rev, post: draft('Обычный пост, исправленный') });
    assert.equal((await report('ub', b)).status, 200); // changed since: as usual
  } finally { await pg.close(); }
});

test('item 38: a rejected event can be appealed; granted, it is published while its start is ahead; an edit closes the appeal', async () => {
  const { pg, db, call, a, b } = await world();
  try {
    await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Kira', role: 'lead', grant: true });
    const [{ id: berlin }] = await db.query(`select id from feture.place where code = 'berlin'`);
    const at = (/** @type {number} */ d, h = 0) => new Date(Date.now() + d * 864e5 + h * 36e5).toISOString();
    const ev = { title: 'Вечер знакомств', kind: 'meetup', description: 'Спокойный вечер для знакомства, без спешки и давления.',
      format: 'offline', placeId: berlin, area: 'Кройцберг', exactAddress: 'Oranienstr. 1, 2 этаж', tz: 'Europe/Berlin', startsAt: at(7), endsAt: at(7, 3) };
    const submit = async () => {
      const r = await call('ua', a, { action: 'event.submit', opId: op(), event: ev });
      const item = (await call('uo', null, { action: 'staff.eventQueue' })).items.find((/** @type {any} */ x) => x.id === r.id);
      await call('uo', null, { action: 'staff.eventDecide', opId: op(), eventId: r.id, rev: item.rev, decision: 'reject', reason: 'Нет описания правил' });
      return /** @type {string} */ (r.id);
    };
    const e1 = await submit();
    const ap = await call('ua', a, { action: 'appeal.create', opId: op(), targetType: 'event', targetId: e1, body: 'Правила есть в описании, прошу посмотреть ещё раз.' });
    assert.equal(ap.state, 'open', JSON.stringify(ap));
    assert.equal((await call('ub', null, { action: 'staff.appealDecide', opId: op(), appealId: ap.id, grant: true, note: '' })).status, 200);
    assert.equal((await call('ua', a, { action: 'event.get', eventId: e1 })).event.state, 'published');

    // Edited after the rejection: the open appeal closes (the decision no longer stands for what is there).
    const e2 = await submit();
    const ap2 = await call('ua', a, { action: 'appeal.create', opId: op(), targetType: 'event', targetId: e2, body: 'Правила есть в описании, прошу посмотреть ещё раз.' });
    const rev = (await call('ua', a, { action: 'event.get', eventId: e2 })).event.rev;
    assert.equal((await call('ua', a, { action: 'event.update', opId: op(), eventId: e2, rev, event: { ...ev, description: 'Спокойный вечер для знакомства. Правила: уважение и согласие.' } })).status, 200);
    assert.equal((await db.query('select state from feture.appeal where id = $1', [ap2.id]))[0].state, 'closed');

    // A rejected event whose start passed is not published by a granted appeal.
    const e3 = await submit();
    const ap3 = await call('ua', a, { action: 'appeal.create', opId: op(), targetType: 'event', targetId: e3, body: 'Правила есть в описании, прошу посмотреть ещё раз.' });
    await db.query(`update feture.event set starts_at = now() - interval '1 hour' where id = $1`, [e3]);
    await call('ub', null, { action: 'staff.appealDecide', opId: op(), appealId: ap3.id, grant: true, note: '' });
    assert.equal((await db.query('select state from feture.event where id = $1', [e3]))[0].state, 'rejected');
  } finally { await pg.close(); }
});
