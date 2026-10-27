// C01 catalogue: list, interest chips, filter sheet, events tab filters, search entry.
const sheet = '.sheet.on';
const cards = t => t.page.locator('.cmc').count();
export default [
 { name: 'C01 catalogue loads: cards, no empty state alongside', persona: 'full', route: '/n/communities', run: async t => {
   await t.page.locator('.cmc').first().waitFor({ timeout: 15000 });
   if (await t.page.locator('.empty').count()) throw new Error('empty state next to cards');
   await t.see('Мои сообщества');
 } },
 { name: 'C01 interest chip narrows, «Все» resets', persona: 'full', route: '/n/communities', run: async t => {
   await t.page.locator('.cmc').first().waitFor({ timeout: 15000 });
   const all = await cards(t);
   const chips = t.page.locator('.filterline .chips .chip');
   if (await chips.count() < 2) throw new Error('no interest chips');
   await chips.nth(1).click(); await t.wait(400);
   const n = await cards(t);
   if (!(n >= 1 && n <= all)) throw new Error(`chip filter gave ${n} of ${all}`);
   if (await chips.nth(1).getAttribute('aria-pressed') !== 'true') throw new Error('chip not pressed');
   await chips.nth(0).click(); await t.wait(400);
   if (await cards(t) !== all) throw new Error('«Все» did not reset');
 } },
 { name: 'C01 filter sheet: «Открытые» applies, badge, clear icon, reset', persona: 'full', route: '/n/communities', run: async t => {
   await t.page.locator('.cmc').first().waitFor({ timeout: 15000 });
   const all = await cards(t);
   await t.tap('.filterline > button.chip');
   await t.see(sheet); await t.see('Фильтры сообществ');
   await t.page.locator(sheet).getByRole('radio', { name: 'Открытые' }).click();
   // «Очистить» is the round ✕ of the prototype, not a clipped word
   await t.see(sheet + ' .fclr[aria-label="Очистить"] svg');
   const btn = t.page.locator(sheet + ' .sh-f .btn');
   const label = await btn.innerText();
   if (!/Показать \d+/.test(label)) throw new Error('apply label: ' + label);
   await btn.click(); await t.wait(400);
   if (await t.page.locator(sheet).count()) throw new Error('sheet stayed open');
   const n = await cards(t);
   if (n >= all || n === 0) throw new Error(`open filter gave ${n} of ${all}`);
   if (await t.page.locator('.cmc .pill', { hasText: 'По заявке' }).count()) throw new Error('closed community shown under «Открытые»');
   await t.see('.filterline .badge-abs');
   await t.tap('.filterline > button.chip');
   await t.page.locator(sheet).getByRole('button', { name: 'Сбросить' }).click();
   await t.page.locator(sheet + ' .sh-f .btn').click(); await t.wait(400);
   if (await cards(t) !== all) throw new Error('reset did not restore');
 } },
 { name: 'C01 filter sheet closes by ✕ and Esc without applying', persona: 'full', route: '/n/communities', run: async t => {
   await t.page.locator('.cmc').first().waitFor({ timeout: 15000 });
   const all = await cards(t);
   for (const how of ['x', 'esc']) {
     await t.tap('.filterline > button.chip'); await t.see(sheet);
     await t.page.locator(sheet).getByRole('radio', { name: 'Открытые' }).click();
     if (how === 'x') await t.page.locator(sheet + ' .sh-h button[aria-label="Закрыть"]').click();
     else await t.page.keyboard.press('Escape');
     await t.wait(400);
     if (await t.page.locator(sheet).count()) throw new Error('sheet not closed by ' + how);
     if (await cards(t) !== all) throw new Error('closing applied the filter: ' + how);
   }
 } },
 { name: 'C01 search button opens search for groups', persona: 'full', route: '/n/communities', run: async t => {
   await t.tap('button[aria-label="Поиск"]');
   await t.wait(500);
   if (!t.page.url().includes('/n/search')) throw new Error('not on search: ' + t.page.url());
 } },
 { name: 'C01 events tab: online chip, filter sheet price, reset', persona: 'full', route: '/n/communities?sub=events', run: async t => {
   await t.page.locator('.evc').first().waitFor({ timeout: 15000 });
   const all = await t.page.locator('.evgrid .evc').count();
   await t.page.locator('.filterline .chips .chip', { hasText: 'Онлайн' }).click(); await t.wait(1500);
   await t.page.locator('.evc').first().waitFor({ timeout: 10000 });
   const online = await t.page.locator('.evgrid .evc').count();
   if (await t.page.locator('.evgrid .evc .fmt', { hasText: /Кройцберг|Нойкёльн|Митте/ }).count()) throw new Error('offline events under online');
   if (online > all) throw new Error(`online gave ${online} of ${all}`);
   await t.page.locator('.filterline .chips .chip').first().click(); await t.wait(1500);
   await t.tap('.filterline > button.chip'); await t.see(sheet); await t.see('Фильтры событий');
   await t.page.locator(sheet).getByRole('radio', { name: 'Платно', exact: true }).click();
   await t.wait(1200);
   const btn = t.page.locator(sheet + ' .sh-f .btn');
   const label = await btn.innerText();
   if (!/Показать|Нет подходящих/.test(label)) throw new Error('apply label: ' + label);
   if (/Показать/.test(label)) {
     await btn.click(); await t.wait(1500);
     await t.page.locator('.evc').first().waitFor({ timeout: 10000 });
     if (await t.page.locator('.evgrid .evc', { hasText: 'Бесплатно' }).count()) throw new Error('free event under paid');
     await t.see('.filterline .badge-abs');
   }
 } },
];
