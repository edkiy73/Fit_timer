// Wave 7 on communities and events: the ticket at the organizer (E09: sheet, site link, «Билет уже куплен», снять
// отметку → «Отменить»), «Снять ответ» → «Отменить», a discussion's «⋯» with «Не показывать в «Популярном»» (host),
// a join request decision with «Отменить» (sent only once the toast is gone) and «Жалобы сообщества» in C10.
// Actors: `host` owns the community and the events, `full` answers events, `basic` asks to join.
import { expect, until, toastSee } from '../helpers.mjs';

const sheet = '.sheet.on', dialog = '.dialog.on';
const rsvpOf = async (t, id) => (await t.api('event.get', { eventId: id })).event.me.rsvp ?? null;

export default [
 { name: 'E09 ticket at the organizer: sheet with the site, «Билет уже куплен», снять отметку → «Отменить»', persona: 'full', run: async t => {
   const host = await t.persona('host');
   const id = host.ticketEventId;
   await t.api('event.rsvp', { opId: t.uuid7(), eventId: id, status: null });
   try {
     await t.go('/n/events/' + id);
     await t.tap('.ctabar .btn:has-text("Билет у организатора")');
     await t.see(sheet + ':has-text("example.org")');
     const href = await t.page.locator(sheet + ' a:has-text("Перейти на сайт")').getAttribute('href');
     expect(href === 'https://example.org/tickets', 'site link: ' + href);
     await t.see(sheet + ':has-text("вне FetUre")');
     await t.tap(sheet + ' .btn:has-text("Билет уже куплен")');
     await toastSee(t, 'покажи билет на входе');
     const r = await until(async () => { const x = await rsvpOf(t, id); return x?.ticketMarked && x; }, 'ticket marked');
     expect(r.status === 'going', 'going with the ticket: ' + r.status);
     await t.tap('.li:has-text("билет куплен")'); await t.see(sheet);
     await t.tap(sheet + ' .btn:has-text("Снять отметку о билете")');
     await toastSee(t, 'Отметка о билете снята');
     await until(async () => (await rsvpOf(t, id))?.ticketMarked === false, 'mark removed');
     await t.tap('.toast button:has-text("Отменить")');
     await until(async () => (await rsvpOf(t, id))?.ticketMarked === true, 'mark back after «Отменить»');
   } finally { await t.api('event.rsvp', { opId: t.uuid7(), eventId: id, status: null }); }
 } },
 { name: 'E03 «Снять ответ» → «Отменить» puts the answer back', persona: 'full', run: async t => {
   const host = await t.persona('host');
   const id = host.eventId;
   await t.api('event.rsvp', { opId: t.uuid7(), eventId: id, status: 'interested' });
   try {
     await t.go('/n/events/' + id);
     await t.tap('.k-answer-h .btn:has-text("Снять ответ")');
     await toastSee(t, 'Ответ снят');
     await until(async () => (await rsvpOf(t, id)) === null || !(await rsvpOf(t, id))?.status, 'cleared');
     await t.tap('.toast button:has-text("Отменить")');
     await until(async () => (await rsvpOf(t, id))?.status === 'interested', 'interested again');
   } finally { await t.api('event.rsvp', { opId: t.uuid7(), eventId: id, status: null }); }
 } },
 { name: 'C03 discussion «⋯» (host): keep out of «Популярное» and back; copy link', persona: 'host', run: async t => {
   const MINE = t.me.openId;
   for (const d of (await t.api('community.discussions', { communityId: MINE })).items.filter(x => x.excerpt.startsWith('E2E w7 '))) await t.api('post.delete', { opId: t.uuid7(), postId: d.id });
   const stamp = 'E2E w7 ' + Date.now().toString(36);
   const s = await t.api('post.saveDraft', { opId: t.uuid7(), post: { body: stamp + ' — обсуждение для «Популярного»', communityId: MINE, inFeed: false } });
   const p = await t.api('post.publish', { opId: t.uuid7(), postId: s.id }); if (!p.ok) throw new Error('publish: ' + p.error);
   const excluded = async () => (await t.api('community.discussions', { communityId: MINE })).items.find(x => x.id === s.id)?.popularExcluded;
   try {
     await t.go('/n/communities/' + MINE);
     const item = () => t.page.locator('.card.list > div').filter({ hasText: stamp }).first();
     await item().waitFor({ timeout: 20000 });
     await item().locator('button[aria-label]').last().click(); await t.see(sheet);
     await t.tap(sheet + ' .li:has-text("Не показывать в «Популярном»")'); await toastSee(t, 'Не попадёт в «Популярное»');
     await until(async () => (await excluded()) === true, 'excluded on the server');
     await item().locator('button[aria-label]').last().click();
     await t.tap(sheet + ' .li:has-text("Вернуть в «Популярное»")'); await toastSee(t, 'Снова может попасть');
     await until(async () => (await excluded()) === false, 'included again');
     await item().locator('button[aria-label]').last().click();
     await t.see(sheet + ' .li:has-text("Скопировать ссылку")');
     await t.page.keyboard.press('Escape');
   } finally { await t.api('post.delete', { opId: t.uuid7(), postId: s.id }); }
 } },
 { name: 'C11 request: «Одобрить» → «Отменить» keeps it waiting; approving again goes out after the toast', persona: 'host', run: async t => {
   // A fresh person each run: `basic` is also asked in by other scenarios, and a decline elsewhere holds its next
   // request for a week.
   const basic = await t.persona('temp');
   const CLOSED = t.me.closedId;
   const reqs = async () => (await t.api('community.requests', { communityId: CLOSED, tab: 'pending' })).items ?? [];
   const member = async () => (await t.api('community.mine', {}, basic.email)).member.some(c => c.id === CLOSED);
   if (await member()) await t.api('community.leave', { opId: t.uuid7(), communityId: CLOSED }, basic.email);
   if (!(await reqs()).some(r => r.profile.id === basic.personId)) {
     const j = await t.api('community.join', { opId: t.uuid7(), communityId: CLOSED, rulesAccepted: true, answer: 'Хочу на встречи и обсуждения, правила прочитаны.' }, basic.email);
     expect(j.ok, 'join request: ' + JSON.stringify(j).slice(0, 200));
   }
   try {
     await t.go('/n/communities/' + CLOSED + '/requests');
     const card = () => t.page.locator('.application-card', { hasText: basic.handle }).first();
     await card().waitFor({ timeout: 20000 });
     await card().locator('.btn:has-text("Одобрить")').click();
     await toastSee(t, 'Участие одобрено');
     await t.tap('.toast button:has-text("Отменить")');
     await card().waitFor({ timeout: 5000 });
     await t.wait(6500);
     expect((await reqs()).some(r => r.profile.id === basic.personId), 'still waiting after «Отменить»');
     expect(!(await member()), 'not a member after «Отменить»');
     await card().locator('.btn:has-text("Одобрить")').click();
     await until(member, 'member once the toast is gone', 25000);
   } finally { if (await member()) await t.api('community.leave', { opId: t.uuid7(), communityId: CLOSED }, basic.email); }
 } },
 { name: 'C10 «Жалобы сообщества» opens its sheet', persona: 'host', run: async t => {
   await t.go('/n/communities/' + t.me.openId + '/manage');
   await t.tap('.li:has-text("Жалобы сообщества")');
   await t.see(sheet + ':has-text("Жалоб нет")');
   await t.page.keyboard.press('Escape'); await t.notSee(sheet, 600);
 } },
];
