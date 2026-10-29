// «Лента»: tabs, topic filters, «Ещё», the composer row and the bar — compared with what the server returns.
import { sheetBelowStatusBar, expect, until, toastSee, composerSheet } from '../helpers.mjs';
const bodies = async t => (await t.page.locator('.posts article.post .body').allInnerTexts()).map(s => s.trim().slice(0, 40));
const api = async (t, input) => (await t.api('feed.list', { tab: 'forYou', limit: 20, ...input })).items;
const seg = (t, label) => t.page.locator('.seg button', { hasText: label }).first();

export default [
 { name: 'tabs: each shows what the server gives for it', persona: 'full', route: '/n/feed', run: async t => {
   await t.see('.posts article.post');
   for (const [label, tab] of [['Подписки', 'following'], ['Популярное', 'popular'], ['Для тебя', 'forYou']]) {
     await seg(t, label).click(); await t.wait(2500);
     const want = (await api(t, { tab, ...(tab === 'popular' ? { myInterests: true } : {}) })).map(p => p.id); // «Популярное» is by my interests
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
   await t.tap('.filterline button[aria-label="Фильтры"]'); await t.see('.sheet.on'); await sheetBelowStatusBar(t); await t.shot('filters-safe-top');
   await t.page.locator('.sheet.on .chip:not(.more)').first().click(); await t.tap('.sheet.on .sh-f .btn'); await toastSee(t, '');
   expect((await t.page.locator('.filterline .chip.on').count()) >= 1, 'sheet filter on');
 } },
 { name: 'scrolling down loads the next page by itself (no «Показать ещё» button), without duplicates', persona: 'full', route: '/n/feed', run: async t => {
   await t.see('.posts article.post'); const before = await t.page.locator('.posts article.post').count();
   expect(!(await t.page.locator('.view .btn:has-text("Показать ещё")').count()), 'a «Показать ещё» button is still there');
   if (!(await t.page.locator('.view .k-more').count())) { console.log(`   ${before} posts, no next page`); return; }
   // Scroll the screen (not the sentinel into view): the page is asked about a screen before the end.
   for (let i = 0; i < 40 && (await t.page.locator('.posts article.post').count()) <= before; i++) {
     await t.page.evaluate(() => { const v = document.querySelector('.view'); v.scrollBy(0, v.clientHeight * .8); }); await t.wait(350);
   }
   await until(async () => (await t.page.locator('.posts article.post').count()) > before, 'next page by scrolling');
   const ids = await t.page.locator('.posts article.post').evaluateAll(a => a.map(x => x.textContent.slice(0, 60)));
   expect(new Set(ids).size === ids.length, 'duplicates after the next page');
   await t.shot('feed-page2');
 } },
 { name: 'composer row is one «Создать» button: field, photo, poll, «+» and Enter/Space all open the sheet → post / article / event / photo / poll', persona: 'full', route: '/n/feed', run: async t => {
   await t.see('.composer');
   const row = t.page.locator('button.composer'); expect(await row.count() === 1, 'the row is one button');
   expect(await row.getAttribute('aria-label') === 'Создать' && await row.getAttribute('aria-haspopup') === 'dialog', 'row name/popup');
   expect(!(await t.page.locator('.composer button, .composer [role="button"]').count()), 'an icon is still its own button');
   for (const [part, li, sel] of [['field', 'Публикация', '.compose .rte-ed'], ['media', 'Статья', '#ntitle'], ['poll', 'Событие', '.stepper']]) {
     await composerSheet(t, part); await t.see('.sheet.on .li:has-text("Статья")'); await t.tap(`.sheet.on .li:has-text("${li}")`); await t.see(sel); await t.go('/n/feed');
   }
   await composerSheet(t, 'media');
   const [ch] = await Promise.all([t.page.waitForEvent('filechooser', { timeout: 8000 }), t.tap('.sheet.on .create-q button:has-text("Фото и видео")')]);
   expect(!!ch, 'file chooser'); await t.go('/n/feed');
   await composerSheet(t, 'add'); await t.tap('.sheet.on .create-q button:has-text("Опрос")'); await t.see('#pollQ'); await t.go('/n/feed');
   for (const key of ['Enter', ' ']) {
     await t.see('.composer'); await row.focus(); await t.page.keyboard.press(key); await t.see('.sheet.on:has-text("Создать")');
     await t.page.keyboard.press('Escape'); await t.wait(500);
   }
 } },
 { name: 'bar: search opens posts search, bell opens notifications', persona: 'full', route: '/n/feed', run: async t => {
   await t.tap('.bar button[aria-label="Поиск"]'); await t.wait(700); expect(t.page.url().includes('/n/search'), t.page.url());
   await t.go('/n/feed'); await t.tap('.bar button[aria-label^="Уведомления"]'); await t.wait(700); expect(/notif|inbox/.test(t.page.url()), t.page.url());
 } },
 { name: '«Подписки» never shows my own posts (owner 28.10.2026)', persona: 'basic', route: '/n/feed', run: async t => {
   const body = 'e2e свой пост ' + Date.now().toString(36);
   const d = await t.api('post.saveDraft', { opId: t.uuid7(), post: { type: 'post', body, audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [] } });
   await t.api('post.publish', { opId: t.uuid7(), postId: d.id });
   try {
     const items = (await t.api('feed.list', { tab: 'following', activity: [], limit: 50 })).items;
     expect(!items.some(x => x.id === d.id || x.author?.id === t.me.personId || x.actor?.id === t.me.personId), 'own posts / activity on the server');
     await seg(t, 'Подписки').click(); await t.wait(2500);
     expect(!(await t.page.locator('.posts article.post', { hasText: body }).count()), 'own post in «Подписки»');
     await seg(t, 'Для тебя').click(); await t.see('.posts article.post:has-text("' + body + '")');
   } finally { await t.api('post.delete', { opId: t.uuid7(), postId: d.id }); }
 } },
];
