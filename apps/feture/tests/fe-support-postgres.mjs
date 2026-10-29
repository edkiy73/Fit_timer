// Wave 8 on PGlite as feture_api: support tickets (person ↔ staff, the reply in the inbox, strangers see nothing) and
// the maintenance switch (only owner/lead; non-staff get 503 «maintenance», staff and the status read keep working).
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { staff } from '../server/commands/staff.mjs';
import { inbox } from '../server/commands/inbox.mjs';
import { support, takeHelp, helpHandlers, sweepPublicHelp } from '../server/commands/support.mjs';
import { supportEmail, SUPPORT_EMAIL_DEFAULT } from '../server/support-config.mjs';
import { notifyHandlers } from '../server/notify.mjs';
import { drain } from '../server/outbox.mjs';
import { setup, op } from './fe-helpers.mjs';

async function world() {
  const env = await setup({ commands: { ...platform, ...me, ...staff, ...inbox, ...support } });
  const { db, call, person } = env;
  const boss = await person('uo', 'Boss');
  await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
  await person('us', 'Sasha');
  await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Sasha', role: 'support', grant: true });
  await person('um', 'Mira');
  await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Mira', role: 'verifier', grant: true });
  const deliver = async () => { while ((await drain(db, notifyHandlers(db), { limit: 50 })) > 0) { /* until empty */ } };
  return { ...env, deliver };
}

test('support: a ticket reaches the staff queue, the reply comes back to the person and their inbox; nobody else reads it', async () => {
  const { pg, db, call, person, deliver } = await world();
  try {
    const p = await person('ua', 'Alex');
    await person('ux', 'Xena');
    assert.equal((await call('ua', null, { action: 'support.create', opId: op(), body: 'hi' })).error, 'invalid_input', 'at least five characters');
    const made = await call('ua', null, { action: 'support.create', opId: op(), topic: 'account', body: 'Не приходит код из письма' });
    assert.equal(made.status, 200, JSON.stringify(made));
    const id = made.ticket.id;
    assert.equal(made.ticket.state, 'open');
    assert.equal(made.ticket.messages.length, 1);

    // Only support staff see the queue; a verifier and a plain person do not.
    assert.equal((await call('ux', null, { action: 'staff.supportQueue' })).status, 403);
    assert.equal((await call('um', null, { action: 'staff.supportQueue' })).status, 403);
    const queue = await call('us', null, { action: 'staff.supportQueue' });
    assert.equal(queue.status, 200);
    const item = queue.items.find(x => x.id === id);
    assert.equal(item.handle, 'Alex');
    assert.ok(!JSON.stringify(queue).includes('@'), 'no email in the queue');

    // A stranger can neither read nor answer it.
    assert.equal((await call('ux', null, { action: 'support.mine' })).tickets.length, 0);
    assert.equal((await call('ux', null, { action: 'support.reply', opId: op(), ticketId: id, body: 'Чужой ответ тут' })).status, 404);
    assert.equal((await call('ux', null, { action: 'staff.supportReply', opId: op(), ticketId: id, body: 'Я не сотрудник' })).status, 403);

    const ans = await call('us', null, { action: 'staff.supportReply', opId: op(), ticketId: id, body: 'Проверь папку «Спам», код живёт 15 минут.' });
    assert.equal(ans.state, 'answered');
    await deliver();
    const n = await call('ua', p, { action: 'notifications.list' });
    const note = n.items.find(x => x.type === 'supportReply');
    assert.ok(note, JSON.stringify(n));
    assert.equal(note.data.ticketId, id);
    const mine = await call('ua', null, { action: 'support.mine' });
    assert.equal(mine.tickets[0].state, 'answered');
    assert.deepEqual(mine.tickets[0].messages.map(m => m.fromStaff), [false, true]);
    assert.ok(!('staff_account_id' in mine.tickets[0].messages[1]), 'staff are not named');

    // The person answers again: back in the open queue; staff close it; a closed ticket takes no more messages.
    const again = await call('ua', null, { action: 'support.reply', opId: op(), ticketId: id, body: 'Нашёл, спасибо!' });
    assert.equal(again.ticket.state, 'open');
    assert.equal((await call('us', null, { action: 'staff.supportReply', opId: op(), ticketId: id })).error, 'invalid_input', 'a reply needs text or close');
    assert.equal((await call('us', null, { action: 'staff.supportReply', opId: op(), ticketId: id, close: true })).state, 'closed');
    assert.equal((await call('ua', null, { action: 'support.reply', opId: op(), ticketId: id, body: 'Ещё вопрос тут' })).status, 409);
    assert.equal((await call('us', null, { action: 'staff.supportQueue', state: 'closed' })).items[0].id, id);

    // Staff never answer their own ticket.
    const own = await call('us', null, { action: 'support.create', opId: op(), body: 'Мой собственный вопрос' });
    assert.equal((await call('us', null, { action: 'staff.supportReply', opId: op(), ticketId: own.ticket.id, body: 'Сам себе отвечу' })).status, 403);
    assert.ok(!(await call('us', null, { action: 'staff.supportQueue' })).items.some(x => x.id === own.ticket.id));

    // Daily limit: ten new tickets a day.
    for (let i = 0; i < 9; i++) assert.equal((await call('ux', null, { action: 'support.create', opId: op(), body: 'Вопрос номер ' + i })).status, 200);
    assert.equal((await call('ux', null, { action: 'support.create', opId: op(), body: 'Вопрос номер 9' })).status, 200);
    assert.equal((await call('ux', null, { action: 'support.create', opId: op(), body: 'Вопрос номер 10' })).status, 429);
    const journal = await db.query(`select action from feture.staff_action where action like 'support.%' order by created_at`);
    assert.deepEqual(journal.map(r => r.action), ['support.reply', 'support.close']);
  } finally { await pg.close(); }
});

test('support queue pages by cursor: 51 tickets, 50 on the first page, the last one on the second, nothing twice', async () => {
  const { pg, db, call, person } = await world();
  try {
    await person('ua', 'Alex');
    await db.query(
      `with t as (insert into feture.support_ticket (account_id, topic, updated_at)
         select a.id, 'other', timestamptz '2026-10-01 10:00:00+00' + g * interval '1 minute'
         from feture.account a, generate_series(1, 51) g where a.person_profile_id is not null and exists
           (select 1 from feture.profile p where p.id = a.person_profile_id and p.handle = 'Alex') returning id)
       insert into feture.support_message (ticket_id, body) select id, 'Вопрос по аккаунту' from t`);
    const first = await call('us', null, { action: 'staff.supportQueue', limit: 50 });
    assert.equal(first.items.length, 50);
    assert.ok(first.next);
    const second = await call('us', null, { action: 'staff.supportQueue', limit: 50, after: first.next });
    assert.equal(second.items.length, 1);
    assert.equal(second.next, null);
    const ids = [...first.items, ...second.items].map(x => x.id);
    assert.equal(new Set(ids).size, 51);
    assert.ok(!JSON.stringify(first).includes('_cursor'));
  } finally { await pg.close(); }
});

test('maintenance: owner/lead switch it; everyone else gets the maintenance answer, staff keep working', async () => {
  const { pg, call, person } = await world();
  try {
    const p = await person('ua', 'Alex');
    assert.deepEqual((({ active, message }) => ({ active, message }))(await call('ua', null, { action: 'platform.maintenance' })), { active: false, message: null });
    assert.equal((await call('us', null, { action: 'staff.maintenanceSet', opId: op(), active: true })).status, 403, 'support may not');
    assert.equal((await call('ua', null, { action: 'staff.maintenanceSet', opId: op(), active: true })).status, 403);
    const on = await call('uo', null, { action: 'staff.maintenanceSet', opId: op(), active: true, message: 'Обновляем базу, вернёмся к 15:00' });
    assert.equal(on.active, true);
    const blocked = await call('ua', p, { action: 'support.mine' });
    assert.equal(blocked.status, 503);
    assert.equal(blocked.error, 'maintenance');
    assert.equal(blocked.message, 'Обновляем базу, вернёмся к 15:00');
    const st = await call('ua', null, { action: 'platform.maintenance' });
    assert.equal(st.status, 200, 'the status stays readable');
    assert.equal(st.active, true);
    assert.equal((await call('us', null, { action: 'support.mine' })).status, 200, 'staff work during maintenance');
    assert.equal((await call('uo', null, { action: 'staff.maintenanceSet', opId: op(), active: false })).active, false);
    assert.equal((await call('ua', null, { action: 'support.mine' })).status, 200);
    assert.equal((await call('ua', null, { action: 'platform.maintenance' })).message, null);
  } finally { await pg.close(); }
});

test('public help: anyone can write without an account; validated; mailed once to the one configured address; old ones are swept', async () => {
  const { pg, db } = await world();
  try {
    assert.equal(supportEmail({}), SUPPORT_EMAIL_DEFAULT);
    assert.equal(supportEmail({ FETURE_SUPPORT_EMAIL: ' help@example.org ' }), 'help@example.org');
    assert.equal((await takeHelp(db, { body: 'x' })).status, 400); // too short
    assert.equal((await takeHelp(db, { body: 'Не приходит код из письма', extra: 1 })).status, 400); // strict
    assert.equal((await takeHelp(db, { body: 'Не приходит код из письма', contact: 'a'.repeat(121) })).status, 400);
    assert.equal((await takeHelp(db, { body: 'Не приходит код из письма', contact: 'me@example.org', locale: 'ru' })).status, 200);
    assert.equal((await takeHelp(db, { body: 'The code never arrives' })).status, 200);
    /** @type {any[]} */
    const mails = [];
    const handlers = helpHandlers(db, async m => { mails.push(m); }, supportEmail({}));
    await drain(db, handlers, { limit: 10 });
    assert.equal(mails.length, 2);
    assert.ok(mails.every(m => m.to === SUPPORT_EMAIL_DEFAULT));
    assert.ok(mails.some(m => m.text.includes('me@example.org')));
    await drain(db, handlers, { limit: 10 });
    assert.equal(mails.length, 2); // once each
    assert.deepEqual(helpHandlers(db, null, 'x'), {}); // no mail service: the queue waits
    await db.query(`update feture.support_public set created_at = now() - interval '91 days' where contact is null`);
    assert.equal(await sweepPublicHelp(db), 1);
  } finally { await pg.close(); }
});
