// «Лента»: tabs, topic filters, «Ещё», the composer row and the bar — compared with what the server returns.
import { expect, until, toastSee } from '../helpers.mjs';
const bodies = async t => (await t.page.locator('.posts article.post .body').allInnerTexts()).map(s => s.trim().slice(0, 40));
const api = async (t, input) => (await t.api('feed.list', { tab: 'forYou', limit: 20, ...input })).items;
const seg = (t, label) => t.page.locator('.seg button', { hasText: label }).first();

export default [
 { name: 'tabs: each shows what the server gives for it', persona: 'full', route: '/n/feed', run: async t => {
   await t.see('.posts article.post');
   for (const [label, tab] of [['Подписки', 'following'], ['Популярное', 'popular'], ['Для тебя', 'forYou']]) {
     await seg(t, label).click(); await t.wait(2500);
     const want = (await api(t, { tab })).map(p => p.id);
     const shown = await t.page.locator('.posts article.post').count();
     console.log(`   ${label}: server ${want.length}, shown ${shown}`);
     expect(shown === Math.min(want.length, 20) || (!want.length && await t.page.locator('.empty').count()), `${label}: shown ${shown} vs ${want.length}`);
   }
 } },
 { name: 'quick topic chip filters, ✕ clears; «Фильтры» sheet applies', persona: 'full', route: '/n/feed', run: async t => {
   await t.see('.filterline .chip');
   const chip = t.page.locator('.filterline .chips .chip').first(); const name = (await chip.innerText()).trim().replace('#', '');
   await chip.click(); await t.wait(2500);
   const n = await t.page.locator('.posts article.post').count(); expect(n > 0, 'filtered list empty');
   const tags = await t.page.locator('.posts article.post .tags').allInnerTexts();
   expect(tags.every(x => x.includes(name)), `every post has #${name}`);
   await t.page.locator('.filterline .chip.on').first().click(); await t.wait(1500);
   expect(!(await t.page.locator('.filterline .chips .chip.on').count()), 'filter cleared');
   await t.tap('.filterline button[aria-label="Фильтры"]'); await t.see('.sheet.on');
   await t.page.locator('.sheet.on .chip:not(.more)').first().click(); await t.tap('.sheet.on .sh-f .btn'); await toastSee(t, '');
   expect((await t.page.locator('.filterline .chip.on').count()) >= 1, 'sheet filter on');
 } },
 { name: '«Ещё» loads the next page without duplicates', persona: 'full', route: '/n/feed', run: async t => {
   await t.see('.posts article.post'); const before = await t.page.locator('.posts article.post').count();
   const more = t.page.locator('.view .btn:has-text("Показать ещё"), .view .btn:has-text("Ещё")').first();
   if (!(await more.count())) { console.log(`   ${before} posts, no next page`); return; }
   await more.scrollIntoViewIfNeeded(); await more.click(); await until(async () => (await t.page.locator('.posts article.post').count()) > before, 'next page');
   const ids = await t.page.locator('.posts article.post').evaluateAll(a => a.map(x => x.textContent.slice(0, 60)));
   expect(new Set(ids).size === ids.length, 'duplicates after «Ещё»');
 } },
 { name: 'composer row: text → editor, photo → file picker, poll → poll ready, «+» → post / article / event', persona: 'full', route: '/n/feed', run: async t => {
   await t.see('.composer'); await t.tap('.composer .cmp-main'); await t.see('.compose .rte-ed'); await t.go('/n/feed');
   const [ch] = await Promise.all([t.page.waitForEvent('filechooser', { timeout: 8000 }), t.tap('.composer button[aria-label="Фото или видео"]')]);
   expect(!!ch, 'file chooser'); await t.go('/n/feed');
   await t.tap('.composer button[aria-label="Опрос"]'); await t.see('#pollQ'); await t.go('/n/feed');
   for (const [row, sel] of [['Публикация', '.compose .rte-ed'], ['Статья', '#ntitle'], ['Событие', '.stepper']]) {
     await t.tap('.composer .ibtn.add'); await t.see(".sheet.on .li"); await t.tap(`.sheet.on .li:has-text("${row}")`); await t.see(sel); await t.go('/n/feed');
   }
 } },
 { name: 'bar: search opens posts search, bell opens notifications', persona: 'full', route: '/n/feed', run: async t => {
   await t.tap('.bar button[aria-label="Поиск"]'); await t.wait(700); expect(t.page.url().includes('/n/search'), t.page.url());
   await t.go('/n/feed'); await t.tap('.bar button[aria-label^="Уведомления"]'); await t.wait(700); expect(/notif|inbox/.test(t.page.url()), t.page.url());
 } },
];
