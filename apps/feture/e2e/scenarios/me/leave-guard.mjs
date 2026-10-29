// Audit 29.10.2026 (profile): an edited form asks «Выйти без сохранения?» on every way out; «Как видят → Все» follows the
// audience (hidden age); «Нужна помощь со входом» is reachable before sign-in.
// Run: FE_ADMIN_KEY=… E2E_LANE=<lane> APP=http://localhost:<port> node e2e/run.mjs e2e/scenarios/me/leave-guard.mjs
import { expect } from '../helpers.mjs';
const dialog = '.dialog.on';

export default [
 { name: 'G01 edited bio: dock tab, own back and browser Back ask; «Остаться» keeps the text; «Выйти» leaves', persona: 'full', route: '/n/me', run: async t => {
   // Opened from «Я» (in-app history, like a person does) so the browser's Back has a place to go back to.
   await t.see('.blk-btn'); await t.page.locator('.blk-btn').first().click(); await t.wait(600);
   expect(t.page.url().includes('/n/me/edit'), 'editor opened: ' + t.page.url());
   const bio = t.page.locator('textarea').first();
   await bio.waitFor({ state: 'visible', timeout: 20000 });
   await bio.fill('e2e unsaved ' + Date.now().toString(36));
   await t.tap('nav.dock button >> nth=0'); // «Лента»
   await t.see(dialog + ':has-text("Выйти без сохранения?")'); await t.shot('guard-dialog-390');
   await t.tap(dialog + ' button:has-text("Остаться")'); await t.wait(300);
   expect(t.page.url().includes('/n/me/edit'), 'stayed: ' + t.page.url());
   expect((await bio.inputValue()).startsWith('e2e unsaved'), 'text kept');
   await t.page.goBack(); await t.see(dialog + ':has-text("Выйти без сохранения?")');
   await t.tap(dialog + ' button:has-text("Остаться")'); await t.wait(300);
   expect(t.page.url().includes('/n/me/edit'), 'still there after browser Back: ' + t.page.url());
   await t.tap('header.bar button[aria-label="Назад"]'); await t.see(dialog + ':has-text("Выйти без сохранения?")');
   await t.tap(dialog + ' button:has-text("Выйти")'); await t.wait(800);
   expect(!t.page.url().includes('/n/me/edit'), 'left: ' + t.page.url());
 } },
 { name: 'G02 untouched form leaves without a question', persona: 'full', route: '/n/me', run: async t => {
   await t.go('/n/me/edit?only=basics'); await t.page.locator('textarea').first().waitFor({ state: 'visible', timeout: 20000 });
   await t.tap('nav.dock button >> nth=0'); await t.wait(800);
   expect(!t.page.url().includes('/n/me/edit'), 'left at once: ' + t.page.url());
   await t.notSee(dialog, 500);
 } },
 { name: 'G03 «Как видят → Все» hides the age when «Показывать возраст» is off', persona: 'full', route: '/n/me', run: async t => {
   const p = (await t.api('profile.get', { profileId: await t.pid() })).profile;
   try {
     const cur = (await t.api('profile.get', { profileId: p.id })).profile;
     await t.api('profile.update', { opId: t.uuid7(), rev: cur.rev, showAge: false });
     await t.go('/n/me/preview'); await t.page.reload(); await t.wait(1500); await t.see('.pc-info'); await t.shot('preview-noage-390');
     const ages = await t.page.locator('.pc-name > span:not(.pcn)').allInnerTexts();
     expect(!ages.some(x => /^\d{2}$/.test(x.trim())), 'no age in the preview hero: ' + JSON.stringify(ages));
   } finally {
     const cur = (await t.api('profile.get', { profileId: p.id })).profile;
     await t.api('profile.update', { opId: t.uuid7(), rev: cur.rev, showAge: true });
   }
 } },
 { name: 'G04 signed out: «Нужна помощь со входом» opens the form on welcome and e-mail screens', persona: null, route: '/n/feed', run: async t => {
   await t.see('Нужна помощь со входом'); await t.shot('help-welcome-390');
   await t.tap('Нужна помощь со входом'); await t.see('.sheet.on:has-text("Помощь со входом")'); await t.shot('help-sheet-390');
   await t.tap('.sheet.on button[aria-label="Закрыть"]'); await t.wait(300);
   await t.tap('Создать аккаунт'); await t.see('Нужна помощь со входом');
 } },
];
