// Interests X01 #meJars, X02 «Все интересы» (picker), interest sheet, no history (removed 29.10).
import { pinned, expect, until } from '../helpers.mjs';
const list = async (t, as) => (await t.api('interests.list', { profileId: await t.pid(as) }, as)).items;
const TOPIC = 'Шибари';

export default [
 { name: 'X02 empty: only the empty state, no catalog under it; button opens the picker', persona: 'basic', route: '/n/me/interests', run: async t => {
   const items = await list(t); expect(!items.length, 'basic must have no interests: ' + items.map(i => i.topicId));
   await t.see('Пока пусто'); expect(!(await t.page.locator('.view .chip').count()), 'catalog chips shown next to the empty state');
   await t.tap('.empty button:has-text("Добавить интерес")'); await t.see('.sheet.on'); await t.see('.sheet.on .chip');
   await t.tap('.sheet.on .sh-h button'); await t.notSee('.sheet.on', 600); await t.see('Пока пусто');
 } },
 { name: 'X01 empty interests card opens the picker', persona: 'basic', route: '/n/me', run: async t => {
   const items = await list(t); expect(!items.length, 'basic must have no interests');
   await t.tap('#meJars .ph-empty'); await t.see('.sheet.on .chip'); expect(t.page.url().includes('/n/me/interests'), t.page.url());
 } },
 { name: 'X02 add two at once (search, step by step, edit from the check) → saved; edit to «граница» → remove', persona: 'full', route: '/n/me/interests', run: async t => {
   let ids = [];
   try {
     await t.see('.jars'); expect(!(await t.page.locator('.view .fsec').count()), 'no inline catalog with items present');
     await t.tap('.bar button[aria-label="Добавить интерес"]'); await t.see('.sheet.on input[type="search"]');
     expect(await t.page.locator('.sheet.on .sh-f .btn.primary').isDisabled(), 'continue disabled before a pick');
     await t.fill('.sheet.on input[type="search"]', 'шиба'); await t.see(`.sheet.on .chip:has-text("${TOPIC}")`);
     expect((await t.page.locator('.sheet.on .chip').count()) === 1, 'search narrows');
     await t.fill('.sheet.on input[type="search"]', 'zzzz'); await t.see('Такого интереса пока нет');
     await t.fill('.sheet.on input[type="search"]', 'шиба'); await t.tap(`.sheet.on .chip:has-text("${TOPIC}")`);
     await t.fill('.sheet.on input[type="search"]', '');
     const second = (await t.page.locator('.sheet.on .chip:not(.on)').first().innerText()).trim();
     await t.tap('.sheet.on .chip:not(.on) >> nth=0'); await t.see('.sheet.on .sh-f button:has-text("Продолжить · 2")');
     await t.tap('.sheet.on .sh-f .btn.primary');
     await t.see('Интерес 1 из 2'); await t.see(`.sheet.on h2:has-text("${TOPIC}")`);
     await t.tap('.sheet.on .chip:has-text("Давать")'); await t.tap('.sheet.on .chip:has-text("По доступу")'); await t.tap('.sheet.on .ans-scale button:has-text("6")');
     await t.see('Интерес 2 из 2'); await t.tap('.sheet.on .ans-m:not(.taboo)');
     await t.see('Проверь ответы'); await t.see(`.sheet.on .sc:has-text("${TOPIC}")`); await t.see(`.sheet.on .sc:has-text("${second}")`);
     await t.tap(`.sheet.on .sc:has-text("${TOPIC}")`); await t.see('Интерес 1 из 2'); await t.tap('.sheet.on .ans-scale button:has-text("7")');
     await t.see('Проверь ответы'); await t.tap('.sheet.on .sh-f button:has-text("Сохранить")'); await t.notSee('.sheet.on', 1500);
     const it = await until(async () => (await list(t)).find(x => x.value === 7 && x.vis === 'granted'), 'saved');
     ids.push(it.topicId); expect(JSON.stringify(it.dir) === '["give"]', 'dir give: ' + JSON.stringify(it.dir));
     const two = await until(async () => (await list(t)).find(x => x.mark === 'discuss' && x.topicId !== it.topicId && !ids.includes(x.topicId)), 'second saved');
     ids.push(two.topicId);
     await t.see(`.sc:has-text("${TOPIC}")`);
     await t.tap(`.sc:has-text("${TOPIC}")`); await t.see('.sheet.on'); await t.tap('.sheet.on .ans-m.taboo'); await t.tap('.sheet.on .sh-f .btn.primary');
     await until(async () => (await list(t)).find(x => x.topicId === it.topicId)?.mark === 'hard', 'edited to hard');
     await t.tap(`.sc:has-text("${TOPIC}")`); await t.tap('.sheet.on .sh-f .btn.icon'); await t.tap('.sheet.on .sh-f .btn.danger');
     await until(async () => !(await list(t)).some(x => x.topicId === it.topicId), 'removed'); ids = ids.filter(x => x !== it.topicId);
   } finally { for (const topicId of ids) await t.api('interests.remove', { opId: t.uuid7(), topicId }); }
 } },
 { name: 'X01 interests block: capsule sheet and «Все интересы» link', persona: 'full', route: '/n/me', run: async t => {
   await t.see('#meJars .sc'); await t.tap('#meJars .sc >> nth=0'); await t.see('.sheet.on'); await t.tap('.sheet.on .sh-h button'); await t.notSee('.sheet.on', 600);
   expect(!(await t.page.locator('#meJars button:has-text("История")').count()), 'no «История» link');
   await t.tap('#meJars button:has-text("Все интересы")'); await t.wait(800); expect(t.page.url().endsWith('/n/me/interests'), t.page.url());
 } },
 { name: 'P04 «Добавить интерес» from the private editor presets «По доступу»', persona: 'full', route: '/n/me', run: async t => {
   await t.go('/n/me/edit?only=priv'); await t.see('#privEdit');
   await t.tap('#privEdit button:has-text("Добавить")'); await t.see('.sheet.on .chip');
   await t.tap('.sheet.on .chip >> nth=0'); await t.tap('.sheet.on .sh-f .btn.primary'); await t.see('Интерес 1 из 1');
   expect(await t.page.locator('.sheet.on .chip[aria-pressed="true"]:has-text("По доступу")').count(), 'granted preset');
 } },
];
