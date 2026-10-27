// Links P21 «Мои связи» and P22 «Связь»: who may propose, propose a link, see it under «Отправленные», cancel it.
// `full` proposes a link to `basic` (another person of the lane) and cancels it.
import { pinned, expect, pick, until, nameOf } from '../helpers.mjs';
const mine = t => t.api('links.mine', {});
const dropLinks = async (t, id) => { const r = await mine(t); for (const l of [...(r.sent || []), ...(r.confirmed || []), ...(r.incoming || [])]) if (l.other?.id === id) await t.api('link.remove', { opId: t.uuid7(), linkId: l.id }); };

export default [
 { name: 'P21 who may propose links: persisted and restored', persona: 'full', route: '/n/me/links', run: async t => {
   try {
     await t.see('select[aria-label="Кто может предлагать"]'); await pick(t, 'Кто может предлагать', 'Только мои подписки');
     await until(async () => (await t.api('profile.settings', {})).settings.linksFrom === 'follow', 'linksFrom saved');
   } finally { await t.api('profile.setVisibility', { opId: t.uuid7(), setting: 'linksFrom', value: 'all' }); }
 } },
 { name: 'P22 propose a link to a person → «Отправленные» → cancel', persona: 'full', route: '/n/me', run: async t => {
   const other = await t.persona('basic'), MIA_ID = other.personId, name = await nameOf(t, other);
   await dropLinks(t, MIA_ID);
   try {
     await t.page.reload(); // the app's 30 s read cache still holds the list from before the cleanup
     await t.go(`/n/people/${MIA_ID}/link`); await t.see('[role="radiogroup"]');
     await t.page.locator('[role="radiogroup"] [role="radio"]').nth(1).click(); await t.wait(300);
     const side = t.page.locator('.grp .chips .chip'); if (await side.count()) await side.first().click();
     await pinned(t, 'Отправить запрос'); await t.tap('.ctabar button:has-text("Отправить запрос")');
     await t.see('.alert.ok'); await until(async () => (await mine(t)).sent?.some(l => l.other?.id === MIA_ID), 'sent');
     await t.tap('.ctabar button:has-text("Готово")'); await t.go('/n/me/links'); await t.see('Отправленные');
     await t.tap(`.li:has-text("${name}")`); await t.see('.sheet.on'); await t.tap('.sheet.on button:has-text("Отменить запрос")');
     await until(async () => !(await mine(t)).sent?.some(l => l.other?.id === MIA_ID), 'cancelled');
   } finally { await dropLinks(t, MIA_ID); }
 } },
 { name: 'X01 links block opens P21', persona: 'full', route: '/n/me', run: async t => {
   await t.see('#mePh'); const b = t.page.locator('button:has-text("Управлять"), button.ph-empty:has-text("связь")').first();
   await b.scrollIntoViewIfNeeded(); await b.click(); await t.wait(800); expect(t.page.url().includes('/n/me/links'), t.page.url());
 } },
];
