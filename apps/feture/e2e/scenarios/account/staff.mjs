// Staff area as the qa moderator (persona `staff`): queues, a real photo-check decision end to end, Premium
// grant/revoke, the journal. The people decided on are fresh `temp` persons of the lane, deleted at the end.
import fs from 'node:fs';
const until = async (fn, ms = 30000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { try { return await fn(); } catch (e) { last = e; await new Promise(r => setTimeout(r, 700)); } } throw last; };
const IMG = new URL('../../../public/images/profile-3-45.webp', import.meta.url).pathname;
const drop = async (t, p) => { if (p) await t.api('account.delete', { opId: t.uuid7(), confirmHandle: p.handle }, p.email); };
const tab = (t, re) => t.page.locator('.seg[aria-label="Очереди проверки"] [role=tab]').filter({ hasText: re }).first();

export default [
 { name: 'Staff: non-staff sees «недоступно»', persona: 'full', route: '/n/staff', run: async t => {
   await t.see('Это недоступно'); await t.notSee('.seg', 300);
 } },
 { name: 'Staff: roles, sections, queue tabs with counts, refresh; back goes to Me', persona: 'staff', route: '/n/staff', run: async t => {
   await t.see('.seg'); await t.page.locator('.seg[aria-label="Очереди проверки"] [role=tab]').first().waitFor({ timeout: 20000 });
   const tabs = t.page.locator('.seg[aria-label="Очереди проверки"] [role=tab]'); const n = await tabs.count(); if (n < 3) throw new Error('queue tabs: ' + n);
   for (let i = 0; i < n; i++) { await tabs.nth(i).click(); await t.wait(150); if (await tabs.nth(i).getAttribute('aria-selected') !== 'true') throw new Error('tab not selected ' + i);
     if (await t.page.locator('.view .empty[role=alert]').count()) throw new Error('queue error on tab ' + (await tabs.nth(i).innerText())); }
   await t.tap('.st-tools .btn'); await t.page.locator('.seg[aria-label="Очереди проверки"] [role=tab]').first().waitFor({ timeout: 20000 });
   await t.tap('.seg >> text=Премиум'); await t.see('Выдать Премиум для теста');
   await t.tap('.seg >> text=Журнал'); await t.page.locator('.view .card.list, .view .empty').first().waitFor({ timeout: 15000 });
   await t.tap('header.bar button[aria-label="Назад"]'); await t.page.waitForURL(/\/n\/me/);
 } },
 { name: 'Staff: a submitted photo check is rejected with a reason; the person sees «rejected» (API)', persona: 'staff', route: '/n/staff', run: async t => {
   const tmp = await t.persona('temp'), who = tmp.email;
   try {
   const st = await t.api('verification.photoStatus', {}, who);
   if (st.state !== 'pending') {
     const start = await t.api('verification.photoStart', { opId: t.uuid7() }, who); if (!start.ok) throw new Error('photoStart ' + JSON.stringify(start));
     const buf = fs.readFileSync(IMG);
     const i = await t.api('media.uploadIntent', { opId: t.uuid7(), purpose: 'verification', kind: 'image', mime: 'image/webp', bytes: buf.length }, who); if (!i.ok) throw new Error('intent ' + JSON.stringify(i));
     const put = await fetch(i.upload.url, { method: i.upload.method, headers: i.upload.headers, body: buf }); if (!put.ok) throw new Error('put ' + put.status);
     const c = await t.api('media.commit', { assetId: i.assetId }, who); if (!c.ok) throw new Error('commit ' + JSON.stringify(c));
     const s = await t.api('verification.photoSubmit', { opId: t.uuid7(), checkId: start.id, assetId: i.assetId }, who); if (!s.ok) throw new Error('submit ' + JSON.stringify(s));
   }
   const boot = await t.api('session.bootstrap', {}, who); const handle = boot.profiles.find(p => p.kind === 'person').handle;
   await t.page.reload(); await t.page.locator('.seg[aria-label="Очереди проверки"] [role=tab]').first().waitFor({ timeout: 20000 });
   await tab(t, /^Фото-верификация/).click();
   const card = t.page.locator('.st-card', { hasText: '@' + handle }).first();
   await card.waitFor({ timeout: 15000 });
   const reject = card.locator('.btn:has-text("Отклонить")');
   if (!(await reject.isDisabled())) throw new Error('reject must wait for a reason');
   await card.locator('[role=radiogroup] .chip').first().click(); await reject.click();
   await card.locator('.st-confirm .btn:has-text("Отмена")').click(); await card.locator('.btn:has-text("Отклонить")').click();
   await card.locator('.st-confirm .btn.danger').click();
   await t.see('Решение сохранено.');
   await until(async () => { const s = await t.api('verification.photoStatus', {}, who); if (s.state !== 'rejected') throw new Error('state ' + s.state); });
   } finally { await drop(t, tmp); }
 } },
 { name: 'Staff Premium: grant to a fresh account, status on, revoke with confirm, status off (API)', persona: 'staff', route: '/n/staff', run: async t => {
   const tmp = await t.persona('temp'), other = tmp.email, otherNick = tmp.handle;
   try {
     await t.see('.seg'); await t.tap('.seg >> text=Премиум');
     const grant = t.page.locator('.btn:has-text("Выдать")');
     if (!(await grant.isDisabled())) throw new Error('grant must be disabled while empty');
     await t.page.getByLabel('Ник').fill(otherNick); await t.page.getByLabel('Дней').fill('2');
     await t.page.locator('textarea').first().fill('e2e проверка');
     await grant.click(); await t.see('Выдано до');
     await until(async () => { const s = await t.api('premium.status', {}, other); if (!s.premium) throw new Error('not premium'); });
     const id = await t.page.getByLabel('Номер выдачи').inputValue(); if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('entitlement id not filled: ' + id);
     await t.page.locator('textarea').nth(1).fill('e2e отзыв');
     await t.tap('.btn.danger:has-text("Отозвать")'); await t.tap('.st-confirm .btn.danger'); await t.see('Выдача отозвана.');
     await until(async () => { const s = await t.api('premium.status', {}, other); if (s.premium) throw new Error('still premium'); });
     await t.tap('.seg >> text=Журнал'); await t.page.locator('.view .card.list').first().waitFor({ timeout: 15000 });
     await t.see('.view .card.list >> text=premium');
   } finally { await drop(t, tmp); }
 } },
 { name: 'Staff journal: filter by an id and clear', persona: 'staff', route: '/n/staff', run: async t => {
   await t.see('.seg'); await t.tap('.seg >> text=Журнал');
   await t.page.locator('.view .card.list, .view .empty').first().waitFor({ timeout: 15000 });
   const f = t.page.getByLabel('ID объекта (необязательно)');
   await f.fill('nope'); if (!(await t.page.locator('.btn:has-text("Показать")').isDisabled())) throw new Error('bad id should disable «Показать»');
   const first = t.page.locator('.view .card.list .ibtn:not([disabled])').first();
   if (await first.count()) { await first.click(); await t.page.locator('.view .card.list, .view .empty').first().waitFor({ timeout: 15000 });
     const v = await f.inputValue(); if (!/^[0-9a-f-]{36}$/i.test(v)) throw new Error('filter not set'); }
   await f.fill(''); await t.tap('.btn:has-text("Показать")'); await t.page.locator('.view .card.list').first().waitFor({ timeout: 15000 });
 } },
];
