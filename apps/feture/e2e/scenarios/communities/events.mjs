// E11 create/edit, E03 event page, E06 apply, E15–E18 organiser panel — on a test event this file creates.
// The organiser is persona `host`, the guest is `full`; the open event for RSVP is the host's published one. The
// chain shares the created event id through e2e/out/event-<lane>.json; «E15 cancel» ends it (cleanup cancels leftovers).
import fs from 'node:fs';
import { uploaderDone, leaveGuard, expect } from '../helpers.mjs';
const sheet = '.sheet.on', dialog = '.dialog.on';
const toast = (t, s) => t.see('.toast:has-text("' + s + '")');
import { STAFF } from '../../personas.mjs';
const STATE = new URL(`../../out/event-${process.env.E2E_LANE || 'local'}.json`, import.meta.url).pathname;
const saveId = id => fs.writeFileSync(STATE, JSON.stringify({ id }));
const evId = () => JSON.parse(fs.readFileSync(STATE, 'utf8')).id;
const PNG = fs.readFileSync(new URL('../../fixtures/cover.png', import.meta.url));
const next = t => t.tap('.ctabar .btn:not(.soft)');
const get = async (t, id, as) => (await t.api('event.get', { eventId: id }, as)).event;
/** Toasts sit over the header buttons while they show. */
const noToast = t => t.page.locator('.toast').first().waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});

/** Leftover E2E events (a retried scenario may submit twice): withdrawn or cancelled; E2E drafts deleted. */
async function cleanup(t) {
  const m = await t.api('event.mine', {});
  for (const e of m.organizing ?? []) {
    if (!/^E2E /.test(e.title) || e.state === 'cancelled' || e.state === 'withdrawn') continue;
    if (e.state === 'published') await t.api('event.cancel', { opId: t.uuid7(), eventId: e.id, reason: 'E2E cleanup' });
    else await t.api('event.withdraw', { opId: t.uuid7(), eventId: e.id });
  }
  for (const d of m.drafts ?? []) if (/^E2E /.test(d.title ?? d.form?.title ?? '')) await t.api('event.draftDelete', { opId: t.uuid7(), draftId: d.id });
}
export { cleanup };
export default [
 { name: 'E11 step validation, online link check, back keeps input, draft deleted', persona: 'host', route: '/n/events/new', run: async t => {
   await cleanup(t); await t.go('/n/events/new');
   await t.see('.stepper:has-text("1/4")');
   await next(t);
   await t.see('.field.err:has-text("Минимум 5 символов")'); await t.see('.field.err:has-text("Выбери тип события")');
   await t.fill('input[name="title"]', 'E2E проверка шагов');
   await t.tap('.chip:has-text("Обсуждение")');
   await t.fill('textarea[name="desc"]', 'Описание для проверки шагов формы события, длинное достаточно.');
   await next(t); await t.see('.stepper:has-text("2/4")');
   await t.tap('.chip:has-text("Онлайн")');
   await t.fill('input[name="link"]', 'http://plain');
   await next(t); await t.see('.field.err:has-text("https://")');
   await t.tap('.ctabar .btn.soft'); await t.see('.stepper:has-text("1/4")');
   if (await t.page.locator('input[name="title"]').inputValue() !== 'E2E проверка шагов') throw new Error('back lost the title');
   await t.notSee('.btn:has-text("Удалить черновик")', 300); // a new event is not a draft the person saved
   await cleanup(t);
   const m = await t.api('event.mine', {});
   if (m.drafts.some(d => (d.title ?? d.form?.title) === 'E2E проверка шагов')) throw new Error('draft not deleted');
 } },
 { name: 'E11 leave guard: a filled new event asks on back and tab; «Остаться» keeps it; «Сохранить черновик» keeps a draft', persona: 'host', route: '/n/events/new', run: async t => {
   await cleanup(t); await t.go('/n/events/new'); await t.page.reload(); await t.see('input[name="title"]');
   expect(!(await t.page.locator('css=header .btn:has-text("Сохранить черновик")').count()), 'no draft text on an empty new event');
   const typed = async () => { await t.fill('input[name="title"]', 'E2E охрана выхода'); await t.see('css=header .btn:has-text("Сохранить черновик")'); };
   await leaveGuard(t, { typed, kept: async () => (await t.page.locator('input[name="title"]').inputValue()) === 'E2E охрана выхода', via: 'tab', url: '/events/new' });
   await t.go('/n/events/new'); await t.page.reload(); await typed(); await t.tap('.bar .ibtn >> nth=0');
   for (const b of ['Сохранить черновик', 'Не сохранять', 'Остаться']) await t.see(`.dialog.on .btn:has-text("${b}")`);
   await t.tap('.dialog.on .btn.primary'); await t.wait(1500);
   const m = await t.api('event.mine', {});
   expect(m.drafts.some(d => (d.title ?? d.form?.title) === 'E2E охрана выхода'), 'draft stored by «Сохранить черновик»');
   await cleanup(t);
 } },
 { name: 'E11 cover photo uploads into a draft, draft deleted', persona: 'host', route: '/n/events/new', run: async t => {
   await t.fill('input[name="title"]', 'E2E обложка события');
   await t.page.locator('[data-field="cover"] input[type="file"]').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: PNG });
   await uploaderDone(t);
   await t.see('.evcov img', 20000);
   await noToast(t); await t.tap('css=header .btn:has-text("Сохранить черновик")');
   await t.see('.alert.ok:has-text("Черновик сохранён")');
   await t.tap('.btn:has-text("Удалить черновик")'); await t.tap('.alert .btn.danger');
   await t.wait(1200);
   if (!t.page.url().includes('/n/me')) throw new Error('not back to mine after delete: ' + t.page.url());
 } },
 { name: 'E11 create offline event with application, all 4 steps, submit; staff publishes', persona: 'host', route: '/n/events/new', run: async t => {
   await cleanup(t);
   const title = 'E2E встреча ' + Date.now().toString(36);
   await t.fill('input[name="title"]', title);
   await t.tap('.chip:has-text("Встреча")');
   await t.fill('textarea[name="desc"]', 'Тестовое событие сценариев: заявки, ответы, объявления, отмена.');
   await t.tap('button[aria-label="Морской"]');
   await next(t); await t.see('.stepper:has-text("2/4")');
   const d = new Date(Date.now() + 3 * 864e5); const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
   await t.fill('input[name="date"]', iso);
   await t.fill('input[name="area"]', 'Митте');
   await t.fill('input[name="addr"]', 'Тестовая улица 1, вход со двора');
   // The city is an empty required choice: no step 3 until it is picked; its time zone follows it.
   await next(t); await t.see('[data-field="city"] .field.err');
   await t.tap('[data-field="city"] .sel-btn'); await t.tap('[role="dialog"] >> text=Берлин');
   await t.see('[data-field="tz"]:has-text("UTC")');
   await next(t); await t.see('.stepper:has-text("3/4")');
   await t.tap('button[role="switch"]:has-text("Участие по заявке")');
   await next(t); await t.see('.field.err');
   await t.fill('input[name="q0"]', 'Был ли опыт таких встреч?');
   await t.tap('.chip:has-text("На месте")');
   await t.fill('input[name="amount"]', '5');
   await next(t); await t.see('.stepper:has-text("4/4")');
   await t.see('.evc:has-text("' + title + '")');
   await t.tap('.seg button >> nth=1');
   await t.see('.li:has-text("Тестовая улица 1")');
   await t.tap('.ctabar .btn:has-text("Отправить на проверку")');
   await t.wait(1500);
   if (!t.page.url().includes('/n/me')) throw new Error('not on mine after submit: ' + t.page.url());
   const ev = (await t.api('event.mine', {})).organizing.find(e => e.title === title);
   if (!ev) throw new Error('submitted event not in organizing');
   saveId(ev.id);
   const e = await get(t, ev.id);
   if (e.state !== 'in_review' || !e.requiresApplication || e.questions?.[0] !== 'Был ли опыт таких встреч?' || e.price.kind !== 'door' || e.price.amount !== 5 || e.plate !== 'sea') throw new Error('stored: ' + JSON.stringify({ s: e.state, q: e.questions, p: e.price, pl: e.plate }));
   const r = await t.api('staff.eventDecide', { opId: t.uuid7(), eventId: ev.id, rev: e.rev, decision: 'approve' }, STAFF);
   if (!r.ok) throw new Error('staff approve: ' + r.status + ' ' + r.error);
 } },
 { name: 'E06 apply: validation, send, withdraw, apply again', persona: 'full', run: async t => {
   const id = evId();
   await t.go('/n/events/' + id);
   await t.tap('.ctabar .btn:has-text("Подать заявку")');
   await t.see('.ctabar .btn:has-text("Отправить заявку")');
   await t.tap('.ctabar .btn');
   await t.see('.field.err:has-text("Ответь хотя бы парой слов")');
   // the button accepts the requirements (owner 29.10.2026: no «Принимаю условия» box, as when joining a community)
   if (await t.page.locator('button.check').count()) throw new Error('a «Принимаю условия» box is back');
   await t.fill('textarea[name="q0"]', 'Да, был на паре встреч.');
   await t.tap('.ctabar .btn');
   await toast(t, 'Заявка отправлена');
   if ((await get(t, id)).me.application?.state !== 'pending') throw new Error('application not pending');
   await t.tap('.k-status .btn:has-text("Отозвать")');
   await t.see(dialog); await t.page.locator(dialog + ' .btn.danger').click({ timeout: 5000 });
   await toast(t, 'Заявка отозвана');
   // a withdrawn application is history: «Подать заявку» comes back
   await t.see('.ctabar .btn:has-text("Подать заявку")');
   await t.tap('.ctabar .btn:has-text("Подать заявку")');
   await t.fill('textarea[name="q0"]', 'Да, был на паре встреч.');
   await t.tap('.ctabar .btn');
   await toast(t, 'Заявка отправлена');
 } },
 { name: 'E16 organiser approves the application', persona: 'host', run: async t => {
   const id = evId();
   await t.go('/n/events/' + id + '/manage');
   await t.see('.alert.warn:has-text("заявк")');
   await t.tap('.li:has-text("Заявки")');
   await t.see('.application-card');
   await t.see('.application-answer:has-text("Да, был на паре встреч.")');
   await t.tap('.application-card .btn:has-text("Одобрить")');
   await toast(t, 'принята');
   await t.tap('.seg button:has-text("Одобрены")'); await t.see('.application-card');
   const a = await t.api('event.applications', { eventId: id, state: 'approved' });
   if (a.items.length !== 1) throw new Error('approved: ' + a.items.length);
 } },
 { name: 'E03 approved guest: RSVP going/interested/not, visibility, address, save, share, calendar', persona: 'full', run: async t => {
   const id = evId();
   await t.go('/n/events/' + id);
   await t.see('.k-status:has-text("одобрена")');
   await t.tap('.rsvp .r-going'); await toast(t, 'Ты идёшь');
   if ((await get(t, id)).me.rsvp?.status !== 'going') throw new Error('rsvp going not saved');
   const was = (await get(t, id)).me.rsvp?.showInList;
   await t.tap('.k-answer button[role="switch"]:has-text("Показывать меня в списке")'); await toast(t, 'Видимость сохранена');
   if ((await get(t, id)).me.rsvp?.showInList === was) throw new Error('visibility not saved');
   await t.tap('.ctabar .btn:has-text("Адрес и как пройти")'); await t.see(sheet + ':has-text("Тестовая улица 1")');
   await t.page.keyboard.press('Escape'); await t.wait(300);
   await t.tap('.rsvp .r-interested'); await toast(t, 'Отметили «Интересно»');
   await t.tap('.rsvp .r-not'); await toast(t, 'Отметили «Не иду»');
   if ((await get(t, id)).me.rsvp?.status !== 'not_going') throw new Error('not_going not saved');
   await t.tap('.k-answer-h .btn'); await toast(t, 'Ответ снят');
   await t.tap('.rsvp .r-going'); await toast(t, 'Ты идёшь');
   await noToast(t); await t.tap('css=header button[aria-pressed]'); await toast(t, 'Сохранено');
   let s = await t.api('saved.list', { kind: 'event' }); if (!s.items.some(x => x.target_id === id)) throw new Error('not saved');
   await noToast(t); await t.tap('css=header button[aria-pressed]'); await toast(t, 'Убрано из сохранённого');
   s = await t.api('saved.list', { kind: 'event' }); if (s.items.some(x => x.target_id === id)) throw new Error('still saved');
   await noToast(t); await t.tap('css=header button[aria-label="Поделиться"]');
   // copied, or (headless clipboard refused) the toast shows the link to copy by hand (share.tsx useCopyLink)
   await t.see('.toast:has-text("Ссылка на событие скопирована"), .toast:has-text("/n/events/' + id + '")');
   await noToast(t); await t.tap('css=header button[aria-label="Ещё"]'); await t.see(sheet);
   const dl = t.page.waitForEvent('download', { timeout: 8000 });
   await t.tap(sheet + ' .li:has-text("Добавить в календарь")');
   const f = await dl; if (!/\.ics$/.test(f.suggestedFilename())) throw new Error('ics name ' + f.suggestedFilename());
   await toast(t, 'Файл для календаря готов');
 } },
 { name: 'E17 attendees: organiser sees the guest', persona: 'host', run: async t => {
   await t.go('/n/events/' + evId() + '/attendees?k=going');
   await t.see('.card.list .li');
   // Only the organiser has «Написать» at the end of a row (owner 29.10.2026).
   await t.see('.card.list .li button[aria-label^="Написать"]');
   await t.tap('.seg button:has-text("Интересуются")'); await t.wait(800);
 } },
 { name: 'E11 edit: description saved, read back', persona: 'host', run: async t => {
   const id = evId();
   await t.go('/n/events/' + id + '/edit');
   await t.see('textarea[name="desc"]');
   const desc = 'Тестовое событие сценариев: заявки, ответы, объявления, отмена. Обновлено.';
   await t.fill('textarea[name="desc"]', desc);
   for (let i = 0; i < 3; i++) await next(t);
   await t.see('.stepper:has-text("4/4")');
   await t.tap('.ctabar .btn:has-text("Сохранить")');
   await t.wait(1500);
   if (!t.page.url().includes('/manage')) throw new Error('not on manage: ' + t.page.url());
   await t.see('.toast');
   const e = await get(t, id);
   if (e.description !== desc && e.pendingChange?.description !== desc) throw new Error('description not saved');
   if (e.pendingChange) { const r = await t.api('staff.eventDecide', { opId: t.uuid7(), eventId: id, rev: e.rev, decision: 'approve' }, STAFF); if (!r.ok) throw new Error('staff: ' + r.error); }
 } },
 { name: 'E15 announcement: validation, sent, shown', persona: 'host', run: async t => {
   await t.go('/n/events/' + evId() + '/manage');
   await t.tap('.li:has-text("Объявление участникам")'); await t.see(sheet);
   await t.page.locator(sheet + ' textarea').fill('ок');
   await t.page.locator(sheet + ' .sh-f .btn').click();
   await t.see(sheet + ' .field.err:has-text("минимум 5 символов")');
   await t.page.locator(sheet + ' textarea').fill('E2E: встречаемся у входа во двор.');
   await t.page.locator(sheet + ' .sh-f .btn').click();
   await toast(t, 'Объявление отправлено');
   await t.see('.upd:has-text("E2E: встречаемся у входа во двор.")');
 } },
 { name: 'E15 cancel: ask, reason, cancelled for the guest too', persona: 'host', run: async t => {
   const id = evId();
   await t.go('/n/events/' + id + '/manage');
   await t.tap('.li:has-text("Отменить событие")'); await t.see(dialog);
   await t.page.locator(dialog + ' .btn.soft').click({ timeout: 5000 }); await t.wait(300);
   if (await t.page.locator(dialog).count()) throw new Error('cancel ask did not close');
   await t.tap('.li:has-text("Отменить событие")');
   await t.page.locator(dialog + ' textarea').fill('E2E: тестовое событие');
   await t.page.locator(dialog + ' .btn.danger').click({ timeout: 5000 });
   await toast(t, 'Событие отменено');
   const guest = await t.persona('full'), other = await t.persona('basic');
   const ev = await get(t, id, guest.email);
   if (ev.state !== 'cancelled') throw new Error('not cancelled');
   // Owner 28.10.2026: a cancelled event stays in lists only for people it concerns (the guest applied in E06) and the
   // organizer, until its start; nobody else finds it in the catalogue — a direct link still opens it.
   const found = async as => ((await t.api('event.catalog', { q: ev.title }, as)).items ?? []).find(x => x.id === id);
   if ((await found(guest.email))?.state !== 'cancelled') throw new Error('the guest lost the cancelled event in the catalogue');
   if (!((await t.api('event.mine', {}, guest.email)).cancelled ?? []).some(x => x.id === id)) throw new Error('not in the guest\'s «Мои события → Отменены»');
   if (await found(other.email)) throw new Error('a stranger sees the cancelled event in the catalogue');
   if ((await get(t, id, other.email))?.state !== 'cancelled') throw new Error('the direct link no longer opens it');
 } },
 { name: 'E03 open event: RSVP going → interested → cleared (the host\'s open event)', persona: 'full', run: async t => {
   const COFFEE = (await t.persona('host')).eventId;
   await t.go('/n/events/' + COFFEE); await t.see('.rsvp');
   if ((await get(t, COFFEE)).me.rsvp?.status) { await t.tap('.k-answer-h .btn'); await toast(t, 'Ответ снят'); }
   await t.tap('.rsvp .r-interested'); await toast(t, 'Отметили «Интересно»');
   await t.tap('.rsvp .r-going'); await toast(t, 'Ты идёшь');
   if ((await get(t, COFFEE)).me.rsvp?.status !== 'going') throw new Error('not going');
   await t.see('.ctabar .btn:has-text("Адрес и как пройти")');
   await t.tap('.rsvp .r-going'); await toast(t, 'Ответ снят');
   if ((await get(t, COFFEE)).me.rsvp?.status) throw new Error('not cleared');
 } },
];
