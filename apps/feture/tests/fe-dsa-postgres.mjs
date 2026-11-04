// S4 steps 5–6 on PGlite as feture_api: notices without an account, the staff queue and the answer, transparency figures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { staff } from '../server/commands/staff.mjs';
import { posts } from '../server/commands/posts.mjs';
import { moderation } from '../server/commands/moderation.mjs';
import { dsa, takeNotice, noticeHandlers, sweepNotices } from '../server/commands/dsa.mjs';
import { drain } from '../server/outbox.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...staff, ...posts, ...moderation, ...dsa } });
const notice = (extra = {}) => ({ targetUrl: 'https://feture.app/p/123', reason: 'illegal', explanation: 'Здесь продают запрещённые вещества, это незаконно.', senderEmail: 'someone@example.org', locale: 'ru', goodFaith: true, ...extra });

test('notices: anyone can send one; an address is needed except for child abuse; child abuse first; staff never see the address; the answer goes once', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const boss = await person('uo', 'Boss');
    await person('um', 'Mira');
    await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
    await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Mira', role: 'moderator', grant: true });

    assert.deepEqual((await takeNotice(db, notice({ senderEmail: undefined }))).body.fields, ['senderEmail']);
    assert.equal((await takeNotice(db, notice({ goodFaith: false }))).status, 400);
    assert.equal((await takeNotice(db, notice({ targetUrl: 'javascript:alert(1)' }))).status, 400);
    assert.equal((await takeNotice(db, notice({ explanation: '😀😀😀😀😀😀😀😀😀😀' }))).status, 400);
    assert.equal((await takeNotice(db, notice({ targetUrl: 'https://feture.app/\u202ep/1' }))).status, 400);
    assert.equal((await takeNotice(db, notice({ senderEmail: 'x<victim@evil.com>' }))).status, 400);
    // The links point at two posts in the app (audit item 30: «Удалить и ответить» removes exactly what the link names).
    const author = await person('ua', 'Alex');
    const pub = async (/** @type {string} */ body) => {
      const d = await call('ua', author, { action: 'post.saveDraft', opId: op(), post: { type: 'post', body, audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [] } });
      await call('ua', author, { action: 'post.publish', opId: op(), postId: d.id });
      return /** @type {string} */ (d.id);
    };
    const p1 = await pub('Продаю запрещённое'), p2 = await pub('Плохое фото');
    assert.equal((await takeNotice(db, notice({ targetUrl: `https://app.kinhaze.com/#/n/feed/post/${p1}` }))).status, 200);
    assert.equal((await takeNotice(db, notice({ targetUrl: `https://app.kinhaze.com/#/n/feed/post/${p2}`, reason: 'csam', senderEmail: undefined, explanation: 'На этой странице изображение ребёнка сексуального характера.' }))).status, 200);

    const q = (await call('um', null, { action: 'staff.noticeQueue' })).items;
    assert.deepEqual(q.map((/** @type {any} */ x) => x.reason), ['csam', 'illegal']);
    assert.ok(!JSON.stringify(q).includes('someone@example.org'));
    assert.equal((await call('ua', null, { action: 'staff.noticeQueue' })).status, 403);

    assert.deepEqual((await call('um', null, { action: 'staff.noticeDecide', opId: op(), noticeId: q[1].id, outcome: 'removed' })).fields, ['rule']);
    assert.deepEqual(q.map((/** @type {any} */ x) => x.target?.id), [p2, p1]);
    await call('um', null, { action: 'staff.noticeDecide', opId: op(), noticeId: q[1].id, outcome: 'removed', rule: 'illegal' });
    await call('um', null, { action: 'staff.noticeDecide', opId: op(), noticeId: q[0].id, outcome: 'removed', rule: 'minors' });
    assert.deepEqual((await db.query('select state from feture.post where id = any($1) order by id', [[p1, p2].sort()])).map(r => r.state), ['removed', 'removed']);
    // The author can appeal a removal made on a notice.
    assert.equal((await call('ua', author, { action: 'appeal.create', opId: op(), targetType: 'post', targetId: p1, body: 'Это не продажа, прошу проверить.' })).state, 'open');
    // A link to another site cannot be «removed»: nothing is decided, no answer goes out.
    assert.equal((await takeNotice(db, notice({ targetUrl: 'https://example.org/page' }))).status, 200);
    const other = (await call('um', null, { action: 'staff.noticeQueue' })).items[0];
    assert.equal(other.target, null);
    assert.equal((await call('um', null, { action: 'staff.noticeDecide', opId: op(), noticeId: other.id, outcome: 'removed', rule: 'illegal' })).rule, 'notice_no_target');
    await db.query(`delete from feture.dsa_notice where id = $1`, [other.id]);
    /** @type {any[]} */
    const mails = [];
    const handlers = noticeHandlers(db, async m => { mails.push(m); });
    await drain(db, handlers, { limit: 10 });
    const again = await db.query(`select id::text, topic, profile_id, payload, attempts, lock_token::text from feture.outbox where topic = 'notice.decided'`);
    for (const it of again) await handlers['notice.decided'](/** @type {any} */ (it));
    assert.equal(mails.length, 1); // only the one with an address, and only once
    assert.match(mails[0].text, /удалили его: незаконный контент/);
    // Two workers at once (a claim that expired mid-send): still one mail.
    await db.query(`update feture.dsa_notice set replied_at = null where id = $1`, [q[1].id]);
    await Promise.all(again.map(it => handlers['notice.decided'](/** @type {any} */ (it))).concat(again.map(it => handlers['notice.decided'](/** @type {any} */ (it)))));
    assert.equal(mails.length, 2);
    // No mail service: no handler, decided items wait instead of being given up.
    assert.deepEqual(Object.keys(noticeHandlers(db, null)), []);

    assert.deepEqual((await call('uo', null, { action: 'staff.transparency', from: '0000-01-01', to: '2027-12-31' })).fields, ['from']);
    assert.deepEqual((await call('uo', null, { action: 'staff.transparency', from: '2026-10-01', to: '2026-10-05' })).fields, ['to']);
    const t = await call('uo', null, { action: 'staff.transparency', from: '2026-01-01', to: '2027-12-31' });
    assert.deepEqual(t.notices.map((/** @type {any} */ r) => [r.reason, r.received, r.removed]), [['csam', 1, 1], ['illegal', 1, 1]]);
    assert.ok(!JSON.stringify(t).includes('@'));

    await db.query(`update feture.dsa_notice set decided_at = now() - interval '13 months'`);
    assert.equal(await sweepNotices(db), 1);
  } finally { await pg.close(); }
});
