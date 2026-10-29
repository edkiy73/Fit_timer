// Every way into an event (owner check of join flows, 28.10.2026), lane `jn`: a free event (Интересно / Иду / Не иду,
// «Снять ответ» with «Отменить»), an event by application (apply, the pending card with «Отозвать», approval opens the
// join link, a decline is final), a ticket at the organizer, a cancelled event, and a couple (answers that wait for the
// partner). The organizer is persona `host` (its `eventId`, `appEventId`, `ticketEventId`, `cancelledEventId`); guests
// are `basic`, `temp` (fresh: a declined application cannot be sent again) and `pair`. Every step reads the result back
// through the API and the guest's answers are removed at the end. There is no capacity / waiting list in events, and a
// past event cannot be made through the app (start must be ahead), so «Событие прошло» is not run here.
// [server 28.10]: needs this change's server (a declined application refused, `me.waiting.id`).
import { expect, until } from '../helpers.mjs';

const sheet = '.sheet.on', dialog = '.dialog.on';
const toast = (t, s) => t.see('.toast:has-text("' + s + '")');
const get = async (t, id, as, profile) => (await t.api('event.get', { eventId: id }, as, profile)).event;
const host = t => t.persona('host');
const clear = (t, id, as, profile) => t.api('event.rsvp', { opId: t.uuid7(), eventId: id, status: null }, as, profile);
/** Withdraws the guest's open application (pending or approved). */
async function noApp(t, id, as, profile) {
  const a = (await get(t, id, as, profile))?.me?.application;
  if (a && ['pending', 'approved'].includes(a.state)) await t.api('event.applicationWithdraw', { opId: t.uuid7(), applicationId: a.id }, as, profile);
}
const asCouple = async (t, coupleId) => { await t.page.evaluate(id => sessionStorage.setItem('feture.fe.acting', id), coupleId); await t.page.reload(); await t.wait(1500); };

export default [
 { name: 'JN-E1 free event: Интересно → Иду (address opens) → Не иду; the same answer again clears it, «Отменить» puts it back', persona: 'basic', run: async t => {
   const h = await host(t); await clear(t, h.eventId);
   try {
     await t.go('/n/events/' + h.eventId);
     await t.see('.rsvp');
     await t.tap('.rsvp .r-interested'); await toast(t, 'Отметили «Интересно»');
     expect((await get(t, h.eventId)).me.rsvp?.status === 'interested', 'interested saved');
     expect(!(await get(t, h.eventId)).exactAddress, 'no address for «интересно»');
     await t.tap('.rsvp .r-going'); await toast(t, 'Ты идёшь');
     const g = await get(t, h.eventId); expect(g.me.rsvp?.status === 'going' && g.exactAddress, 'going opens the address');
     await t.tap('.ctabar .btn:has-text("Адрес и как пройти")'); await t.see(sheet + ':has-text("Тестовая улица 1")');
     await t.page.keyboard.press('Escape'); await t.wait(300);
     await t.tap('.rsvp .r-not'); await toast(t, 'Отметили «Не иду»');
     const n = await get(t, h.eventId); expect(n.me.rsvp?.status === 'not_going' && !n.exactAddress, 'not going closes the address');
     // Tapping the chosen answer again removes it; «Отменить» brings it back.
     await t.tap('.rsvp .r-not'); await toast(t, 'Ответ снят');
     expect(!(await get(t, h.eventId)).me.rsvp, 'answer removed');
     await t.tap('.toast .tb'); await toast(t, 'Ответ возвращён');
     await until(async () => (await get(t, h.eventId)).me.rsvp?.status === 'not_going', 'answer restored');
   } finally { await clear(t, h.eventId); }
 } },

 { name: 'JN-E2 by application: no «Иду» before applying; apply → one status card → «Отозвать» → apply again → approved → «Как подключиться» shows the link', persona: 'basic', run: async t => {
   const h = await host(t); await noApp(t, h.appEventId); await clear(t, h.appEventId);
   try {
     expect((await t.api('event.rsvp', { opId: t.uuid7(), eventId: h.appEventId, status: 'going' })).rule === 'application_first', '«Иду» needs an approved application');
     await t.go('/n/events/' + h.appEventId);
     await t.see('.k-status:has-text("Нужна заявка")'); await t.notSee('.rsvp', 300);
     await t.tap('.ctabar .btn:has-text("Подать заявку")');
     await t.fill('textarea[name="q0"]', 'Да, был на паре встреч.'); await t.tap('.ctabar .btn');
     await toast(t, 'Заявка отправлена');
     expect((await get(t, h.appEventId)).me.application?.state === 'pending', 'pending on the server');
     await t.see('.k-status:has-text("Заявка на рассмотрении") .btn:has-text("Отозвать")');
     expect(!(await t.page.locator('.ctabar').count()), 'no second «Отозвать» in the bottom bar');
     expect(!(await get(t, h.appEventId)).joinUrl, 'no link while pending');
     await t.tap('.k-status .btn:has-text("Отозвать")'); await t.see(dialog); await t.page.locator(dialog + ' .btn.danger').click();
     await toast(t, 'Заявка отозвана');
     expect((await get(t, h.appEventId)).me.application?.state === 'withdrawn', 'withdrawn on the server');
     // Applying again works after withdrawing; the organizer approves.
     const r = await t.api('event.apply', { opId: t.uuid7(), eventId: h.appEventId, answers: ['Да, был на паре встреч.'], requirementsAccepted: true });
     expect(r.state === 'pending', 'applied again: ' + JSON.stringify(r).slice(0, 160));
     const [x] = (await t.api('event.applications', { eventId: h.appEventId, state: 'pending' }, h.email)).items.filter(a => a.profile.id === t.me.personId);
     expect((await t.api('event.applicationDecide', { opId: t.uuid7(), applicationId: x.id, rev: x.rev, approve: true }, h.email)).state === 'approved', 'approved');
     await t.page.reload();
     await t.see('.k-status:has-text("Заявка одобрена")');
     await t.tap('.ctabar .btn:has-text("Как подключиться")'); await t.see(sheet + ':has-text("meet.example.org")');
     expect((await get(t, h.appEventId)).joinUrl === 'https://meet.example.org/qa', 'link on the server');
   } finally { await noApp(t, h.appEventId); await clear(t, h.appEventId); }
 } },

 { name: 'JN-E3 [server 28.10] by application: a declined one shows its card, no button, and cannot be sent again', persona: 'temp', run: async t => {
   const h = await host(t); const pid = await t.pid();
   const r = await t.api('event.apply', { opId: t.uuid7(), eventId: h.appEventId, answers: ['Нет, впервые.'], requirementsAccepted: true });
   expect(r.state === 'pending', 'applied: ' + JSON.stringify(r).slice(0, 160));
   const [x] = (await t.api('event.applications', { eventId: h.appEventId, state: 'pending' }, h.email)).items.filter(a => a.profile.id === pid);
   await t.api('event.applicationDecide', { opId: t.uuid7(), applicationId: x.id, rev: x.rev, approve: false }, h.email);
   await t.go('/n/events/' + h.appEventId);
   await t.see('.k-status:has-text("Заявка не одобрена")');
   expect(!(await t.page.locator('.ctabar .btn:has-text("Подать заявку")').count()), 'no new application button');
   const again = await t.api('event.apply', { opId: t.uuid7(), eventId: h.appEventId, answers: ['Ещё раз'], requirementsAccepted: true });
   expect(again.rule === 'application_declined', 'refused: ' + JSON.stringify(again).slice(0, 160));
 } },

 { name: 'JN-E4 ticket at the organizer: the sheet links out; «Билет уже куплен» is «Иду» with a mark; the mark comes off', persona: 'basic', run: async t => {
   const h = await host(t); await clear(t, h.ticketEventId);
   try {
     await t.go('/n/events/' + h.ticketEventId);
     await t.tap('.ctabar .btn:has-text("Билет у организатора")');
     await t.see(sheet + ':has-text("example.org")');
     await t.tap(sheet + ' .btn:has-text("Билет уже куплен")'); await toast(t, 'Отмечено «Иду» с билетом');
     const m = await get(t, h.ticketEventId); expect(m.me.rsvp?.status === 'going' && m.me.rsvp?.ticketMarked === true, 'going with a ticket mark');
     await t.tap('.li:has-text("€")'); await t.tap(sheet + ' .btn:has-text("Снять отметку о билете")'); await toast(t, 'Отметка о билете снята');
     expect((await get(t, h.ticketEventId)).me.rsvp?.ticketMarked === false, 'mark removed');
   } finally { await clear(t, h.ticketEventId); }
 } },

 { name: 'JN-E5 cancelled event: the reason, no answers, «Похожие события»; the server refuses an answer', persona: 'basic', allow4xx: true, run: async t => {
   const h = await host(t);
   await t.go('/n/events/' + h.cancelledEventId);
   await t.see('.alert.err:has-text("Событие отменено")'); await t.see('text=Ведущий заболел');
   await t.notSee('.rsvp', 300);
   await t.see('.ctabar .btn:has-text("Похожие события")');
   const r = await t.api('event.rsvp', { opId: t.uuid7(), eventId: h.cancelledEventId, status: 'interested' });
   expect(r.status === 409, 'no answer to a cancelled event: ' + r.status);
   // No relation to it: not in the catalogue, «Скоро» or «Мои события» (owner 28.10.2026); the link above still opened it.
   const title = (await t.api('event.get', { eventId: h.cancelledEventId })).event.title;
   expect(!((await t.api('event.catalog', { q: title })).items ?? []).some(x => x.id === h.cancelledEventId), 'a cancelled event in the catalogue of someone it does not concern');
   expect(!((await t.api('event.soon', {})).items ?? []).some(x => x.id === h.cancelledEventId), 'a cancelled event in «Скоро»');
   expect(!((await t.api('event.mine', {})).cancelled ?? []).some(x => x.id === h.cancelledEventId), 'a cancelled event in «Мои события»');
 } },

 { name: 'JN-E6 couple: «Нам интересно» at once; with approvals on «Идём вдвоём» waits for the partner', persona: 'pair', run: async t => {
   const h = await host(t); const cp = t.me.coupleId, B = t.me.partner.email;
   const cancelMine = async () => { for (const a of (await t.api('decide.approvals', {}, t.me.email, cp)).items ?? []) if (a.mine && a.kind?.startsWith('event.')) await t.api('decide.cancel', { opId: t.uuid7(), approvalId: a.id }, t.me.email, cp); };
   await cancelMine(); await clear(t, h.eventId, t.me.email, cp);
   await t.api('couple.setApproval', { opId: t.uuid7(), approvesPartner: false }, B, cp);
   try {
     await t.go('/n/events/' + h.eventId); await asCouple(t, cp);
     await t.tap('.rsvp .r-interested'); await toast(t, 'Вам интересно');
     expect((await get(t, h.eventId, t.me.email, cp)).me.rsvp?.status === 'interested', 'couple interested');
     await t.api('couple.setApproval', { opId: t.uuid7(), approvesPartner: true }, B, cp);
     await t.page.reload(); await t.wait(1000);
     await t.tap('.rsvp .r-going'); await toast(t, 'ждёт согласия партнёра');
     const e = await get(t, h.eventId, t.me.email, cp);
     expect(e.me.rsvp?.status === 'interested' && e.me.waiting, '«идём» waits, «интересно» stays: ' + JSON.stringify(e.me).slice(0, 200));
     expect(!e.exactAddress, 'no address before the partner agrees');
   } finally { await cancelMine(); await clear(t, h.eventId, t.me.email, cp); await t.api('couple.setApproval', { opId: t.uuid7(), approvesPartner: false }, B, cp); }
 } },

 { name: 'JN-E7 [server 28.10] couple by application: the waiting application is one card; «Отозвать» takes it back', persona: 'pair', run: async t => {
   const h = await host(t); const cp = t.me.coupleId, B = t.me.partner.email;
   const cancelMine = async () => { for (const a of (await t.api('decide.approvals', {}, t.me.email, cp)).items ?? []) if (a.mine && a.kind?.startsWith('event.')) await t.api('decide.cancel', { opId: t.uuid7(), approvalId: a.id }, t.me.email, cp); };
   await cancelMine(); await noApp(t, h.appEventId, t.me.email, cp);
   await t.api('couple.setApproval', { opId: t.uuid7(), approvesPartner: true }, B, cp);
   try {
     const r = await t.api('event.apply', { opId: t.uuid7(), eventId: h.appEventId, answers: ['Да, вдвоём ходили.'], requirementsAccepted: true }, t.me.email, cp);
     expect(r.pending?.approvalId, 'waits for B: ' + JSON.stringify(r).slice(0, 160));
     expect((await get(t, h.appEventId, t.me.email, cp)).me.waiting?.id === r.pending.approvalId, 'event.get gives the approval id');
     await t.go('/n/events/' + h.appEventId); await asCouple(t, cp);
     await t.see('.k-status:has-text("Ждёт согласия партнёра")');
     await t.tap('.k-status .btn:has-text("Отозвать")'); await t.page.locator(dialog + ' .btn.danger').click();
     await toast(t, 'Заявка пары отозвана'); // acting as the couple (#1408)
     await until(async () => !(await get(t, h.appEventId, t.me.email, cp)).me.waiting, 'approval taken back');
     await t.see('.ctabar .btn:has-text("Подать заявку от пары")');
   } finally { await cancelMine(); await noApp(t, h.appEventId, t.me.email, cp); await t.api('couple.setApproval', { opId: t.uuid7(), approvesPartner: false }, B, cp); }
 } },
];
