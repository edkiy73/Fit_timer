// People screens on the kit: Discover deck (pass, like + undo), the filter sheet (nested list, back, Esc, close),
// «Симпатии» tabs, a person profile (menu sheet open/close, report and block sheets open/close, request access,
// compat), and the Discover history. Fails on console errors via run.mjs.
// The person whose profile is opened is persona `mate` (full, with a private part); `full` looks.
import { expect, until } from '../helpers.mjs';

export default [
 { name: 'D03 deck: filter sheet, nested list back/Esc, pass and like', persona: 'full', route: '/n/people', allow4xx: true, run: async t => {
   const p = t.page;
   await t.see('.bar .seg [role="tab"]');
   // Filters: the kit sheet with its reset button in the head, the nested list with a back button and search.
   const open = p.locator('.bar button[aria-haspopup="dialog"]');
   await open.waitFor({ timeout: 30000 }); await until(async () => !(await open.isDisabled()), 'filter button enabled');
   await open.click(); await t.see('.sheet.full.on [role="radiogroup"]');
   expect(await p.locator('.sheet.on .sh-h h2').innerText() === 'Фильтры знакомств', 'filter sheet title: ' + await p.locator('.sheet.on .sh-h h2').innerText());
   await p.locator('.sheet.on .df-row .li').first().click(); await t.wait(500);
   await t.see('.sheet.on .sh-h button[aria-label="К фильтрам"]');
   const chip = p.locator('.sheet.on .chips .chip').first(); await chip.waitFor({ timeout: 30000 });
   await chip.click(); expect(await chip.getAttribute('aria-pressed') === 'true', 'chip toggles on');
   await chip.click(); expect(await chip.getAttribute('aria-pressed') === 'false', 'chip toggles off');
   await p.keyboard.press('Escape'); await t.wait(400);
   await t.see('.sheet.on [role="radiogroup"]'); // Esc in a nested list goes back, the sheet stays
   await p.locator('.sheet.on .df-row .li').first().click(); await t.see('.sheet.on .sh-h button[aria-label="К фильтрам"]');
   await t.tap('.sheet.on .sh-h button[aria-label="К фильтрам"]'); await t.see('.sheet.on [role="radiogroup"]');
   const show = p.locator('.sheet.on [role="radiogroup"]').nth(1).locator('[role="radio"]');
   await show.nth(1).click(); expect(await show.nth(1).getAttribute('aria-checked') === 'true', 'show radio');
   await show.nth(0).click();
   await p.keyboard.press('Escape'); await t.notSee('.sheet.on', 800);
   // Deck: pass and like with the buttons, then undo the last one when the server allows it.
   const top = p.locator('.deck .pc.top'); await top.waitFor({ timeout: 30000 }).catch(() => {});
   if (await top.count()) {
     const first = await top.getAttribute('aria-label');
     await t.tap('.acts button[aria-label="Пропустить"]'); await t.wait(1200);
     const second = await p.locator('.deck .pc.top').getAttribute('aria-label').catch(() => null);
     expect(second !== first, 'pass moves the deck on');
     await t.tap('.acts .act.undo');
     // One free undo a day (Q6): after it, «Вернуть» opens the Premium sheet with the undo feature marked — closed with Esc.
     await t.see('.toast:has-text("Профиль возвращён"), .sheet.on .pw-f.on', 20000);
     if (await p.locator('.sheet.on .pw-f.on').count()) { await p.keyboard.press('Escape'); await t.notSee('.sheet.on', 800); }
   } else console.log('   (deck empty for this persona — only the empty state checked)');
   await t.tap('.bar [role="tab"]:has-text("Симпатии")'); await t.see('.view .seg [role="tab"]');
   await t.tap('.view .seg [role="tab"]:nth-of-type(2)'); await t.wait(1500);
   await t.see('.view .card.list .li, .view .empty');
   await t.tap('.bar [role="tab"]:has-text("Подборка")'); await t.wait(800);
 } },
 { name: 'P01 person profile: menu sheet, report and block sheets, request access sheet, compat', persona: 'full', allow4xx: true, run: async t => {
   const p = t.page;
   await t.go('/n/people/' + (await t.persona('mate')).personId);
   await t.see('.profile-page .hero'); await t.see('.p-acts .btn');
   await t.tap('.pbar button[aria-label="Ещё"]'); await t.see('.sheet.on .card.list .li');
   const rows = await p.locator('.sheet.on .li').allInnerTexts(); expect(rows.length >= 4, 'menu rows: ' + rows.join(' | '));
   await p.keyboard.press('Escape'); await t.notSee('.sheet.on', 800);
   await t.tap('.pbar button[aria-label="Ещё"]'); await t.tap('.sheet.on .li.danger:has-text("Пожаловаться")');
   await t.see('.sheet.on [role="radiogroup"]'); await t.see('.sheet.on textarea.inp'); await t.see('.sheet.on button[role="switch"][aria-checked="true"]');
   // No reason chosen → the first wrong field (the reasons) is marked and shakes, nothing is sent (no summary line since #1409).
   await t.tap('.sheet.on .sh-f .btn.danger'); await t.see('.sheet.on .field.err[data-field="reason"] .ferr');
   expect(!(await p.locator('.sheet.on .alert.err').count()), 'no summary error line in the report sheet');
   await t.tap('.sheet.on .sh-h button[aria-label="Закрыть"]'); await t.notSee('.sheet.on', 800);
   await t.tap('.pbar button[aria-label="Ещё"]'); await t.tap('.sheet.on .li.danger:has-text("Заблокировать")');
   await t.see('.sheet.on .sh-f .btn.danger'); await t.tap('.sheet.on .sh-f .btn.text'); await t.notSee('.sheet.on', 800);
   // The private part: request access (the sheet with scopes and today's quota), then cancel it so the run leaves nothing behind.
   const vault = p.locator('#priv'); await vault.waitFor({ timeout: 20000 }).catch(() => {});
   if (await vault.count()) {
     await vault.scrollIntoViewIfNeeded();
     const sent = vault.locator('.veil-act .btn.dark:has-text("Запрос отправлен")');
     // «Запрос отправлен» opens the pending sheet; «Отменить запрос» there takes it back (also a request a failed run left).
     const cancel = async () => { await sent.click(); await t.tap('.sheet.on .sh-f .btn.soft'); await t.notSee('.sheet.on', 1500); await t.see('#priv .veil-act .btn.dark:not(:has-text("Запрос отправлен"))', 30000); };
     if (await sent.count()) await cancel();
     const ask = vault.locator('.veil-act .btn.dark:not([disabled])');
     if (await ask.count()) { await ask.click(); await t.tap('.sheet.on .sh-f .btn:has-text("Отправить запрос")'); await t.notSee('.sheet.on', 1500); await t.see('#priv .veil-act .btn.dark:has-text("Запрос отправлен")'); await cancel(); }
     else console.log('   (vault state: ' + (await vault.locator('.veil-act').innerText().catch(() => 'open')) + ')');
   } else console.log('   (the profile shows no private part)');
   const cmp = p.locator('.compat .cp-h'); if (await cmp.count()) { await cmp.click(); await t.see('.cmp14'); await t.page.goBack(); await t.see('.profile-page .hero'); }
 } },
 { name: 'P01 back from a profile opened in «Люди» (deck, «Симпатии») returns there; a profile opened by link goes to «Люди»', persona: 'full', route: '/n/feed', allow4xx: true, run: async t => {
   const p = t.page; const at = re => until(() => re.test(p.url()) || null, 'at ' + re + ', not ' + p.url(), 15000);
   await t.go('/n/people');
   const full = p.locator('.pc-foot .btn', { hasText: 'Полный профиль' }).first();
   if (await full.count() || await full.waitFor({ timeout: 20000 }).then(() => true, () => false)) {
     await full.click(); await t.see('.profile-page .hero');
     await p.locator('.pbar .ibtn').first().click(); await at(/\/n\/people$/); await t.see('.bar .seg [role="tab"]');
   } else console.log('   (deck is empty for this persona)');
   // «Симпатии» keeps its place in the address (and the router's history), and back from a profile comes back to it.
   await t.tap('.bar .seg [role="tab"]:has-text("Симпатии")'); await at(/sub=likes/);
   expect(await p.evaluate(() => typeof history.state?.key === 'string'), 'the tab switch keeps the router entry: ' + JSON.stringify(await p.evaluate(() => history.state)));
   const tile = p.locator('.lk .k-lk-open').first();
   if (await tile.waitFor({ timeout: 8000 }).then(() => true, () => false)) {
     await tile.click(); await t.see('.profile-page .hero');
     await p.locator('.pbar .ibtn').first().click(); await at(/sub=likes/);
     await t.see('.bar .seg [role="tab"][aria-selected="true"]:has-text("Симпатии")');
   } else console.log('   (no tiles in «Симпатии» for this persona)');
   // Opened straight by a link (nothing to go back to): «Назад» goes to «Люди», not out of the app.
   await p.goto(p.url().split('#')[0] + '#/n/people/' + (await t.persona('mate')).personId); await p.reload(); await t.see('.profile-page .hero');
   await p.evaluate(() => history.replaceState({ ...(history.state || {}), idx: 0 }, ''));
   await p.locator('.pbar .ibtn').first().click(); await at(/\/n\/people$/);
 } },
 { name: 'P01 profile posts: no tab bar with one kind; «Активность» tab by «Кто видит мою активность»', persona: 'full', allow4xx: true, run: async t => {
   const S = await t.persona('stranger'); const body = 'e2e вкладки ' + Date.now().toString(36);
   const d = await t.api('post.saveDraft', { opId: t.uuid7(), post: { type: 'post', body, audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [] } }, S.email);
   await t.api('post.publish', { opId: t.uuid7(), postId: d.id }, S.email);
   try {
     await t.go('/n/people/' + S.personId); await t.see('.profile-page .activity article.post');
     const acts = (await t.api('profile.activity', { profileId: S.personId }).catch(() => ({ items: [] }))).items ?? [];
     const kinds = 1 + (acts.length ? 1 : 0);
     expect((await t.page.locator('.profile-page .activity .seg').count()) === (kinds > 1 ? 1 : 0), `tab bar only with more than one kind (${kinds})`);
     await t.shot('profile-tabs');
   } finally { await t.api('post.delete', { opId: t.uuid7(), postId: d.id }, S.email); }
 } },
 { name: 'D09 history: tabs and cards', persona: 'full', route: '/n/people/history', run: async t => {
   await t.see('.view .seg [role="tab"]');
   for (const n of [2, 3, 1]) { await t.tap(`.view .seg [role="tab"]:nth-of-type(${n})`); await t.wait(1200); }
   await t.see('.hist .hcard, .view .empty');
 } },
];
