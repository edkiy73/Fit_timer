// Stage 6B on PGlite as feture_api (docs/notifications.md «Email», owner 03.11.2026): the address kept sealed from the
// signed-in session, the modes (now, now-if-unread, digest), the caps, safe-mode content, one-click unsubscribe and
// suppression from the signed Resend webhook. A fake mail transport records what would go out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { discover } from '../server/commands/discover.mjs';
import { chats } from '../server/commands/chats.mjs';
import { inbox } from '../server/commands/inbox.mjs';
import { couples } from '../server/commands/couples.mjs';
import { social } from '../server/commands/social.mjs';
import { notifyHandlers } from '../server/notify.mjs';
import { drain, enqueue } from '../server/outbox.mjs';
import { DAILY_CAP, addressHash, openAddress, queueDigests, readUnsubToken, renderEmail, sendDueEmails, svixOk, takeResendEvent, testAddress, unsubToken, unsubscribe } from '../server/email.mjs';
import { setup as baseSetup, op, PEPPER } from './fe-helpers.mjs';

const SECRET = 'whsec_' + Buffer.from('k'.repeat(32)).toString('base64');

async function world() {
  const env = await baseSetup({ commands: { ...platform, ...me, ...discover, ...chats, ...inbox, ...couples, ...social } });
  const { db, person, call } = env;
  /** @type {any[]} */
  const mails = [];
  /** @type {(m: any) => Promise<{id: string}>} */
  let send = async m => { mails.push(m); return { id: `re_${mails.length}` }; };
  const mail = { transport: { send: (/** @type {any} */ m) => send(m) }, from: 'KINHAZE <notify@mail.kinhaze.com>', pepper: PEPPER, appUrl: 'https://app.test', apiUrl: 'https://api.test' };
  const notify = async () => { while ((await drain(db, notifyHandlers(db), { limit: 100 })) > 0) { /* inbox rows, queued pushes and emails */ } };
  /** Everything queued becomes due now (the 15-minute wait of now-if-unread included), then the sender runs. */
  const flush = async () => {
    await db.query(`update feture.email_delivery set next_at = now() where state = 'queued'`);
    while ((await sendDueEmails(db, mail)) > 0) { /* until nothing is due */ }
  };
  /** A person who signed in with an address (the handler keeps it from the verified session). */
  const member = async (/** @type {string} */ user, /** @type {string} */ handle, /** @type {any} */ settings = {}) => {
    const id = await person(user, handle);
    const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [id]);
    if (Object.keys(settings).length) await db.query(`insert into feture.notification_settings (account_id, settings) values ($1, $2)`, [account_id, JSON.stringify(settings)]);
    await call(user, null, { action: 'notifications.settings.get' }, { 'x-fit-email': `${handle.toLowerCase()}@example.com`, 'x-fe-tz': 'Europe/Berlin' });
    // Not opened since long ago (digests need it).
    await db.query(`update feture.email_address set seen_at = now() - interval '3 days' where account_id = $1`, [account_id]);
    return { id, account: account_id };
  };
  return { ...env, mails, mail, notify, flush, member, setSend: (/** @type {typeof send} */ f) => { send = f; } };
}

test('the address: kept sealed from the signed-in session with its zone; settings say when it does not accept mail', async () => {
  const { pg, db, call, member } = await world();
  try {
    const a = await member('ua', 'Alex');
    const [row] = await db.query(`select address_sealed, address_hash, tz from feture.email_address where account_id = $1`, [a.account]);
    assert.ok(!row.address_sealed.includes('alex@'));
    assert.equal(openAddress(PEPPER, row.address_sealed), 'alex@example.com');
    assert.ok(Buffer.from(row.address_hash).equals(addressHash(PEPPER, 'Alex@Example.com')));
    assert.equal(row.tz, 'Europe/Berlin');
    assert.equal((await call('ua', null, { action: 'notifications.settings.get' })).emailState, 'ok');
    await db.query(`insert into feture.email_suppression (address_hash, reason) values ($1, 'bounce')`, [row.address_hash]);
    assert.equal((await call('ua', null, { action: 'notifications.settings.get' })).emailState, 'blocked');
  } finally { await pg.close(); }
});

test('test addresses (TEST_LOGIN_DOMAIN, .test) are never kept, so no mail is ever queued for them', async () => {
  assert.equal(testAddress('world-mira@feture.test', {}), true, 'any reserved .test domain');
  assert.equal(testAddress('qa-staff@Test.Example', { TEST_LOGIN_DOMAIN: 'test.example' }), true, 'the configured test domain');
  assert.equal(testAddress('a@test.example.com', { TEST_LOGIN_DOMAIN: 'test.example' }), false);
  assert.equal(testAddress('a@example.com', { TEST_LOGIN_DOMAIN: 'feture.test' }), false);
  const { pg, db, call, person, notify, flush, mails } = await world();
  try {
    const id = await person('uw', 'world_mira');
    const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [id]);
    const signIn = (/** @type {string} */ email) => call('uw', null, { action: 'notifications.settings.get' }, { 'x-fit-email': email });
    // Kept before (an earlier build), with mail waiting: the next request from the test address drops both.
    await signIn('mira@example.com');
    await db.tx(q => enqueue(q, 'profile.suspended', id, { until: '2026-12-01T00:00:00Z' }));
    await notify();
    assert.equal((await db.query(`select count(*)::int n from feture.email_delivery where account_id = $1 and state = 'queued'`, [account_id]))[0].n, 1);
    assert.equal((await signIn('world-mira@feture.test')).emailState, 'none');
    assert.deepEqual(await db.query(`select 1 from feture.email_address where account_id = $1`, [account_id]), []);
    assert.deepEqual(await db.query(`select 1 from feture.email_delivery where account_id = $1`, [account_id]), []);
    // New items queue nothing; nothing is sent.
    await db.tx(q => enqueue(q, 'profile.restricted', id, {}));
    await notify(); await flush();
    assert.deepEqual(await db.query(`select 1 from feture.email_delivery where account_id = $1`, [account_id]), []);
    assert.equal(mails.length, 0);
  } finally { await pg.close(); }
});

test('now: security and account mail goes at once, even read, unless all email is off; a daily cap', async () => {
  const { pg, db, mails, notify, flush, member } = await world();
  try {
    const a = await member('ua', 'Alex', { categories: { groups: { push: false, email: false } } });
    // A suspension notice (email «now»): at once, its own words, the unsubscribe headers.
    await db.tx(q => enqueue(q, 'profile.suspended', a.id, { until: '2026-12-01T00:00:00Z' }));
    await notify();
    await db.query(`update feture.notification set read_at = now() where recipient_account_id = $1`, [a.account]);
    await flush();
    assert.equal(mails.length, 1);
    const m = mails[0];
    assert.deepEqual([m.to, m.from, m.subject], ['alex@example.com', 'KINHAZE <notify@mail.kinhaze.com>', 'Профиль заблокирован']);
    assert.match(m.headers['List-Unsubscribe'], /^<https:\/\/api\.test\/api\/fe\?unsubscribe=1&t=[\w.-]+>$/);
    assert.equal(m.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    assert.ok(m.html.includes('https://app.test/#/n/inbox/') && m.text.includes('https://app.test/#/n/inbox/'));
    assert.match(m.html, /prefers-color-scheme:dark/);
    // All email off: nothing, not even «now».
    await db.query(`update feture.notification_settings set settings = settings || '{"email": false}' where account_id = $1`, [a.account]);
    await db.tx(q => enqueue(q, 'profile.restricted', a.id, {}));
    await notify(); await flush();
    assert.equal(mails.length, 1);
    await db.query(`update feture.notification_settings set settings = settings || '{"email": true}' where account_id = $1`, [a.account]);

    // The daily cap: past it «now» mail is skipped (left for the digest).
    for (let i = 0; i < DAILY_CAP + 2; i++) await db.tx(q => enqueue(q, 'premium.granted', a.id, { until: '2027-01-01T00:00:00Z', n: i }));
    await notify(); await flush();
    const states = await db.query(`select state, last_error from feture.email_delivery where account_id = $1 and ref like 'n:%' order by id`, [a.account]);
    assert.equal(states.filter((/** @type {any} */ s) => s.state === 'sent').length, DAILY_CAP);
    assert.ok(states.some((/** @type {any} */ s) => s.last_error === 'daily_cap'));
    assert.ok(states.some((/** @type {any} */ s) => s.last_error === 'off'));
  } finally { await pg.close(); }
});

test('one «now» email per object; now-if-unread: 15 minutes later only if still unread and actual; a transient error retries, a refusal does not', async () => {
  const { pg, db, call, mails, notify, flush, member, setSend } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira');
    // Two «now» decisions about the same post object (content removed twice): one email.
    const [post] = await db.query(`select gen_random_uuid() id`);
    await db.tx(async q => { await enqueue(q, 'content.removed', a.id, { targetType: 'post', targetId: post.id }); });
    await notify();
    await db.query(`update feture.email_delivery set object = 'contentRemoved:post:x' where account_id = $1`, [a.account]);
    await db.tx(async q => { await enqueue(q, 'content.removed', a.id, { targetType: 'post', targetId: post.id }); });
    await notify();
    await db.query(`update feture.email_delivery set object = 'contentRemoved:post:x' where account_id = $1`, [a.account]);
    await flush();
    assert.equal(mails.length, 1);
    assert.equal((await db.query(`select count(*)::int n from feture.email_delivery where last_error = 'object_cap'`))[0].n, 1);
    mails.length = 0;

    // A couple invitation (a task, now-if-unread): it waits 15 minutes.
    const inv = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' });
    await notify();
    const [row] = await db.query(`select ref, mode, next_at > now() + interval '14 minutes' waits from feture.email_delivery where account_id = $1`, [b.account]);
    assert.deepEqual([row.ref, row.mode, row.waits], [`d:pinv:${inv.id}`, 'now-if-unread', true]);
    // The app open meanwhile (it polls in the background) does not cancel a still-open task: the email goes.
    await db.query(`update feture.email_address set seen_at = now() + interval '1 second' where account_id = $1`, [b.account]);
    await db.query(`update feture.email_delivery set next_at = now() where account_id = $1`, [b.account]);
    await flush();
    assert.equal(mails.length, 1);
    mails.length = 0;
    await call('ua', null, { action: 'couple.inviteWithdraw', opId: op(), inviteId: inv.id });

    // Decided meanwhile: no email. Still open and not seen: the email goes (no names in «Безопасные»).
    await db.query(`update feture.email_address set seen_at = now() - interval '1 day' where account_id = $1`, [b.account]);
    const inv2 = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' });
    await notify();
    await call('ua', null, { action: 'couple.inviteWithdraw', opId: op(), inviteId: inv2.id });
    await flush();
    assert.equal(mails.length, 0);
    const inv3 = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' });
    await notify();
    // A transient error first (Resend 503), then it goes; the idempotency key keeps one email.
    let calls = 0;
    setSend(async m => { calls++; if (calls === 1) throw Object.assign(new Error('email_failed'), { status: 503 }); mails.push(m); return { id: 're_ok' }; });
    await flush();
    await flush();
    assert.equal(mails.length, 1);
    assert.equal(mails[0].subject, 'Приглашение в пару');
    assert.ok(!mails[0].html.includes('Alex') && !mails[0].text.includes('Alex'));
    assert.deepEqual((await db.query(`select state, attempts, provider_id from feture.email_delivery where ref = $1`, [`d:pinv:${inv3.id}`]))[0], { state: 'sent', attempts: 2, provider_id: 're_ok' });
    // A refusal (422) is final.
    setSend(async () => { throw Object.assign(new Error('email_failed'), { status: 422 }); });
    await call('ua', null, { action: 'couple.inviteWithdraw', opId: op(), inviteId: inv3.id });
    const inv4 = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' });
    await notify(); await flush();
    assert.deepEqual((await db.query(`select state, last_error from feture.email_delivery where ref = $1`, [`d:pinv:${inv4.id}`]))[0], { state: 'failed', last_error: 'http_422' });
  } finally { await pg.close(); }
});

test('digest: in the morning of the person’s zone, once a day, never empty, not after opening the app; safe mode names nobody, normal names', async () => {
  const { pg, db, call, mails, notify, flush, member } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira'), c = await member('uc', 'Noa');
    await db.query(`update feture.profile set chosen_name = 'Алекс' where id = $1`, [a.id]);
    // 10:00 in Berlin (UTC+1 in November).
    const morning = new Date('2026-11-04T09:00:00Z'), night = new Date('2026-11-04T02:00:00Z');
    const kiraDigests = async () => (await db.query(`select count(*)::int n from feture.email_delivery where account_id = $1 and mode = 'digest'`, [b.account]))[0].n;
    // Nothing new: no digest goes (it is queued, then skipped as empty).
    await queueDigests(db, { now: morning });
    await flush();
    assert.equal(mails.length, 0);
    assert.ok((await db.query(`select last_error from feture.email_delivery where account_id = $1 and mode = 'digest'`, [b.account])).every((/** @type {any} */ r) => r.last_error === 'empty'));
    // Two likes and a follow for Kira (digest types), an invitation (a task).
    await call('ua', a.id, { action: 'like.send', opId: op(), profileId: b.id, source: 'profile' });
    await call('uc', c.id, { action: 'like.send', opId: op(), profileId: b.id, source: 'profile' });
    await call('ua', a.id, { action: 'follow.set', opId: op(), profileId: b.id, on: true }).catch(() => null);
    await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' });
    await notify();
    await db.query(`delete from feture.email_delivery where mode = 'digest'`);
    await db.query(`update feture.email_delivery set state = 'skipped' where mode <> 'digest'`); // the task's own email is another test
    // At night in Berlin: not yet.
    assert.equal(await queueDigests(db, { now: night }), 0);
    // In the morning: one per person with something new.
    await queueDigests(db, { now: morning });
    await flush();
    const kira = mails.filter(m => m.to === 'kira@example.com');
    assert.equal(kira.length, 1);
    const d = kira[0];
    assert.equal(d.subject, 'Что нового в KINHAZE');
    // «Безопасные» (the default): counts only, no names.
    assert.match(d.text, /У тебя 1 решение и \d+ новы[хе] уведомлени[йея]/);
    assert.ok(!d.html.includes('Алекс') && !d.text.includes('Алекс') && !d.text.includes('Noa'));
    assert.match(d.headers['List-Unsubscribe'], /unsubscribe=1/);
    // Never twice a day.
    await queueDigests(db, { now: new Date(morning.getTime() + 3600e3) });
    await flush();
    assert.equal(mails.filter(m => m.to === 'kira@example.com').length, 1);

    // Next morning: opened the app since the last digest → none. Not opened, «Обычные» → the names and the actions.
    const next = new Date(morning.getTime() + 864e5);
    // The test's own clock (not the database's): the dates here are fixed, so «a day ago» is a day before `next`.
    await db.query(`update feture.email_address set digest_at = $2::timestamptz - interval '1 day' where account_id = $1`, [b.account, next.toISOString()]);
    await db.query(`update feture.email_address set seen_at = $2::timestamptz - interval '2 hours' where account_id = $1`, [b.account, next.toISOString()]);
    await call('ua', a.id, { action: 'follow.set', opId: op(), profileId: b.id, on: false }).catch(() => null);
    await queueDigests(db, { now: next });
    assert.equal(await kiraDigests(), 1);
    await db.query(`update feture.email_address set seen_at = $2::timestamptz - interval '2 days' where account_id = $1`, [b.account, next.toISOString()]);
    await db.query(`update feture.notification set created_at = $2::timestamptz - interval '1 hour' where recipient_account_id = $1`, [b.account, next.toISOString()]);
    await db.query(`update feture.notification_settings set settings = settings || '{"mode": "normal"}' where account_id = $1`, [b.account]);
    await db.query(`insert into feture.notification_settings (account_id, settings) values ($1, '{"mode": "normal"}') on conflict (account_id) do update set settings = feture.notification_settings.settings || '{"mode": "normal"}'`, [b.account]);
    await queueDigests(db, { now: next });
    await flush();
    const second = mails.filter(m => m.to === 'kira@example.com');
    assert.equal(second.length, 2);
    assert.ok(second[1].text.includes('Алекс ставит тебе симпатию'), second[1].text);
    // Digest off: none.
    await db.query(`update feture.notification_settings set settings = settings || '{"digest": "off"}' where account_id = $1`, [b.account]);
    await db.query(`update feture.email_address set digest_at = $2::timestamptz - interval '1 day' where account_id = $1`, [b.account, next.toISOString()]);
    await queueDigests(db, { now: new Date(next.getTime() + 864e5) });
    assert.equal(await kiraDigests(), 2);
  } finally { await pg.close(); }
});

test('one-click unsubscribe: a signed token flips the same setting the app shows; a forged one does nothing', async () => {
  const { pg, db, call, member } = await world();
  try {
    const a = await member('ua', 'Alex');
    const t = unsubToken(PEPPER, a.account, 'likes');
    assert.deepEqual(readUnsubToken(PEPPER, t), { account: a.account, what: 'likes' });
    assert.equal(readUnsubToken('x'.repeat(40), t), null);
    assert.equal(readUnsubToken(PEPPER, t.replace(/.$/, c => (c === 'A' ? 'B' : 'A'))), null);
    assert.equal(await unsubscribe(db, PEPPER, unsubToken(PEPPER, a.account, 'nonsense')), null);
    assert.deepEqual(await unsubscribe(db, PEPPER, t), { what: 'likes', lang: 'ru' });
    const s = (await call('ua', null, { action: 'notifications.settings.get' })).settings;
    assert.deepEqual([s.categories.likes, s.categories.decide, s.email, s.digest], [{ push: true, email: false }, { push: true, email: true }, true, 'daily']);
    await unsubscribe(db, PEPPER, unsubToken(PEPPER, a.account, 'digest'));
    await unsubscribe(db, PEPPER, unsubToken(PEPPER, a.account, 'all'));
    const s2 = (await call('ua', null, { action: 'notifications.settings.get' })).settings;
    assert.deepEqual([s2.digest, s2.email], ['off', false]);
  } finally { await pg.close(); }
});

test('Resend webhook: a signed bounce or complaint stops mail to the address; a bad signature, an old one or no secret is refused', async () => {
  const { pg, db, mails, notify, flush, member } = await world();
  try {
    const a = await member('ua', 'Alex');
    const body = JSON.stringify({ type: 'email.bounced', data: { email_id: 're_1', to: ['alex@example.com'], bounce: { type: 'Permanent' } } });
    const sign = (/** @type {string} */ raw, ts = Math.floor(Date.now() / 1000)) => {
      const key = Buffer.from(SECRET.slice(6), 'base64');
      return { 'svix-id': 'msg_1', 'svix-timestamp': String(ts), 'svix-signature': 'v1,' + createHmac('sha256', key).update(`msg_1.${ts}.${raw}`).digest('base64') };
    };
    assert.ok(svixOk(SECRET, sign(body), body));
    // A wrong signature, a changed body, a stale timestamp, no secret: refused, nothing changes.
    assert.equal((await takeResendEvent(db, PEPPER, SECRET, { ...sign(body), 'svix-signature': 'v1,AAAA' }, body)).status, 401);
    assert.equal((await takeResendEvent(db, PEPPER, SECRET, sign(body), body.replace('alex', 'alex2'))).status, 401);
    assert.equal((await takeResendEvent(db, PEPPER, SECRET, sign(body, Math.floor(Date.now() / 1000) - 3600), body)).status, 401);
    assert.equal((await takeResendEvent(db, PEPPER, '', sign(body), body)).status, 404);
    assert.equal((await db.query(`select count(*)::int n from feture.email_suppression`))[0].n, 0);
    // A soft bounce is ignored.
    const soft = JSON.stringify({ type: 'email.bounced', data: { to: ['alex@example.com'], bounce: { type: 'Transient' } } });
    assert.deepEqual((await takeResendEvent(db, PEPPER, SECRET, sign(soft), soft)).body, { ok: true, ignored: true });
    // The signed hard bounce: the address is suppressed (by its hash), no more mail goes there.
    assert.equal((await takeResendEvent(db, PEPPER, SECRET, sign(body), body)).status, 200);
    const [sup] = await db.query(`select address_hash, reason from feture.email_suppression`);
    assert.ok(Buffer.from(sup.address_hash).equals(addressHash(PEPPER, 'alex@example.com')));
    assert.equal(sup.reason, 'bounce');
    await db.tx(q => enqueue(q, 'profile.suspended', a.id, {}));
    await notify(); await flush();
    assert.equal(mails.length, 0);
    assert.equal((await db.query(`select last_error from feture.email_delivery`))[0].last_error, 'suppressed');
    // A complaint about the same address keeps it suppressed, as a complaint.
    const complaint = JSON.stringify({ type: 'email.complained', data: { to: ['Alex <alex@example.com>'] } });
    await takeResendEvent(db, PEPPER, SECRET, sign(complaint), complaint);
    assert.equal((await db.query(`select reason from feture.email_suppression`))[0].reason, 'complaint');
  } finally { await pg.close(); }
});

test('the template: one KINHAZE email, light and dark, escaped, with its button, why and how to stop it', () => {
  const { html, text } = renderEmail({ lang: 'ru', subject: 'Тема', title: '<b>Мира</b> ставит тебе симпатию', lines: ['Строка & ещё'], more: 2,
    button: { label: 'Открыть', url: 'https://app.test/#/n/inbox' }, unsubscribeUrl: 'https://api.test/api/fe?unsubscribe=1&t=x', settingsUrl: 'https://app.test/#/n/settings/notifications' });
  assert.ok(html.includes('&lt;b&gt;Мира&lt;/b&gt;') && !html.includes('<b>Мира'));
  assert.ok(html.includes('Строка &amp; ещё') && html.includes('И ещё 2 в приложении'));
  assert.ok(html.includes('name="color-scheme" content="light dark"') && html.includes('prefers-color-scheme:dark'));
  assert.ok(html.includes('KINHAZE') && !/<img/i.test(html));
  assert.ok(text.includes('Отписаться: https://api.test/api/fe?unsubscribe=1&t=x') && text.includes('Открыть: https://app.test/#/n/inbox'));
});
