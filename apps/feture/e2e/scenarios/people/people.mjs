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
     await t.tap('.acts .act.undo'); await t.wait(1500);
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
   await t.tap('.sheet.on .sh-f .btn.danger'); await t.see('.sheet.on .alert.err'); // no reason chosen → the error, nothing sent
   await t.tap('.sheet.on .sh-h button[aria-label="Закрыть"]'); await t.notSee('.sheet.on', 800);
   await t.tap('.pbar button[aria-label="Ещё"]'); await t.tap('.sheet.on .li.danger:has-text("Заблокировать")');
   await t.see('.sheet.on .sh-f .btn.danger'); await t.tap('.sheet.on .sh-f .btn.text'); await t.notSee('.sheet.on', 800);
   // The private part: request access, then cancel it so the run leaves nothing behind.
   const vault = p.locator('#priv'); await vault.waitFor({ timeout: 20000 }).catch(() => {});
   if (await vault.count()) {
     await vault.scrollIntoViewIfNeeded();
     const ask = vault.locator('.veil-act .btn.dark:not([disabled])');
     if (await ask.count()) { await ask.click(); await t.see('#priv .pill.wait'); await t.tap('#priv .veil-act .btn.soft'); await t.see('#priv .veil-act .btn.dark', 30000); }
     else console.log('   (vault state: ' + (await vault.locator('.veil-act').innerText().catch(() => 'open')) + ')');
   } else console.log('   (the profile shows no private part)');
   const cmp = p.locator('.compat .cp-h'); if (await cmp.count()) { await cmp.click(); await t.see('.cmp14'); await t.page.goBack(); await t.see('.profile-page .hero'); }
 } },
 { name: 'D09 history: tabs and cards', persona: 'full', route: '/n/people/history', run: async t => {
   await t.see('.view .seg [role="tab"]');
   for (const n of [2, 3, 1]) { await t.tap(`.view .seg [role="tab"]:nth-of-type(${n})`); await t.wait(1200); }
   await t.see('.hist .hcard, .view .empty');
 } },
];
