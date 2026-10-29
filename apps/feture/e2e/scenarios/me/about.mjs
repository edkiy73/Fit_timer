// «Обо мне» facts (owner 29.10.2026): fill them in the profile editor with an audience each → the chips on «Я» → a
// stranger gets only the facts open to everyone (server-enforced). Run: FE_ADMIN_KEY=… APP=… node e2e/run.mjs e2e/scenarios/me/about.mjs
import { expect, pinned, until } from '../helpers.mjs';
const prof = async (t, id, as) => (await t.api('profile.get', { profileId: id ?? await t.pid() }, as)).profile;
const only = { height: 'only', smoking: 'only', alcohol: 'only', kids: 'only', langs: 'only', zodiac: 'only' };
const reset = async t => { const p = await prof(t);
  const r = await t.api('profile.update', { opId: t.uuid7(), rev: p.rev, height: null, smoking: null, alcohol: null, kids: null, langs: [], zodiac: null, aboutVis: only });
  expect(r.ok, 'reset ' + JSON.stringify(r)); };

export default [
 { name: 'About: fill facts with audiences → chips on «Я», a tap names the fact → a stranger sees only the open ones', persona: 'full', route: '/n/me/edit?only=about', run: async t => {
   const me = await t.pid();
   try {
     await reset(t); await t.page.reload(); // starts with no facts, whatever an earlier run left
     await t.see('#peAbout');
     await t.page.selectOption('select[aria-label="Рост"]', '174');
     await t.page.selectOption('select[aria-label="Курение"]', 'sometimes');
     await t.page.selectOption('select[aria-label="Зодиак"]', 'scorpio');
     await t.tap('.chips[aria-label="Языки"] button:has-text("Русский")'); await t.tap('.chips[aria-label="Языки"] button:has-text("Английский")');
     await t.page.selectOption('select[aria-label="Кто видит: Рост"]', 'all');
     await t.page.selectOption('select[aria-label="Кто видит: Языки"]', 'all');
     await t.page.selectOption('select[aria-label="Кто видит: Курение"]', 'only');
     await t.page.selectOption('select[aria-label="Кто видит: Зодиак"]', 'granted');
     await pinned(t, 'Сохранить'); await t.tap('.ctabar button:has-text("Сохранить")');
     const own = await until(async () => { const p = await prof(t); return p.about?.height === 174 && p; }, 'facts saved');
     expect(JSON.stringify(own.about) === JSON.stringify({ height: 174, smoking: 'sometimes', langs: ['ru', 'en'], zodiac: 'scorpio' }), 'own facts ' + JSON.stringify(own.about));
     expect(own.aboutVis.height === 'all' && own.aboutVis.smoking === 'only' && own.aboutVis.zodiac === 'granted' && own.aboutVis.langs === 'all', 'audiences ' + JSON.stringify(own.aboutVis));

     // «Я»: every own fact as a chip; a tap shows its label in place.
     await t.see('#meAbout'); await t.see('#meAbout button[aria-label="Рост: 174 см"]');
     expect(await t.page.locator('#meAbout .k-fact').count() === 4, 'four chips on «Я»');
     await t.tap('#meAbout button[aria-label="Курение: иногда"]'); await t.see('#meAbout .k-fact.open:has-text("Курение: иногда")');

     // A stranger: only «Все» facts arrive at all; on the profile page they are chips under the bio.
     const stranger = await t.persona('stranger');
     const seen = await prof(t, me, stranger.email);
     expect(JSON.stringify(seen.about) === JSON.stringify({ height: 174, langs: ['ru', 'en'] }), 'stranger gets ' + JSON.stringify(seen.about));
     expect(seen.aboutVis === undefined, 'no audiences for others');

     // «Как видят» → «Все»: the same two; «С доступом» adds the zodiac sign, never the «Только ты» one.
     await t.go('/n/me/preview'); await t.see('#pAbout');
     expect(await t.page.locator('#pAbout .k-fact').count() === 2, 'preview «Все»: two chips');
     await t.tap('.p3-seg button:has-text("С доступом")'); await t.see('#pAbout span[aria-label="Знак зодиака: Скорпион"]');
     expect(await t.page.locator('#pAbout .k-fact').count() === 3, 'preview «С доступом»: three chips');
   } finally {
     await reset(t);
   }
 } },
];
