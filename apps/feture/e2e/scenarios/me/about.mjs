// «Обо мне» facts (owner 29.10.2026): fill them in the profile editor → the chips on «Я» → a stranger sees every
// filled fact (facts are always visible to everyone), on the profile page under the bio and the main buttons.
// Run: FE_ADMIN_KEY=… APP=… node e2e/run.mjs e2e/scenarios/me/about.mjs
import { expect, pinned, until } from '../helpers.mjs';
const prof = async (t, id, as) => (await t.api('profile.get', { profileId: id ?? await t.pid() }, as)).profile;
const reset = async t => { const p = await prof(t);
  const r = await t.api('profile.update', { opId: t.uuid7(), rev: p.rev, height: null, smoking: null, alcohol: null, kids: null, langs: [], zodiac: null });
  expect(r.ok, 'reset ' + JSON.stringify(r)); };

export default [
 { name: 'About: fill facts → chips on «Я», a tap names the fact → a stranger sees all of them, under the bio and the buttons', persona: 'full', route: '/n/me/edit?only=about', run: async t => {
   const me = await t.pid();
   try {
     await reset(t); await t.page.reload(); // starts with no facts, whatever an earlier run left
     await t.see('#peAbout');
     expect(await t.page.locator('#peAbout select[aria-label^="Кто видит"]').count() === 0, 'no per-fact audience');
     await t.page.selectOption('select[aria-label="Рост"]', '174');
     await t.page.selectOption('select[aria-label="Курение"]', 'sometimes');
     await t.page.selectOption('select[aria-label="Зодиак"]', 'scorpio');
     await t.tap('.chips[aria-label="Языки"] button:has-text("Русский")'); await t.tap('.chips[aria-label="Языки"] button:has-text("Английский")');
     await pinned(t, 'Сохранить'); await t.tap('.ctabar button:has-text("Сохранить")');
     const own = await until(async () => { const p = await prof(t); return p.about?.height === 174 && p; }, 'facts saved');
     const facts = { height: 174, smoking: 'sometimes', langs: ['ru', 'en'], zodiac: 'scorpio' };
     expect(JSON.stringify(own.about) === JSON.stringify(facts), 'own facts ' + JSON.stringify(own.about));

     // «Я»: every own fact as a chip; a tap shows its label in place.
     await t.see('#meAbout'); await t.see('#meAbout button[aria-label="Рост: 174 см"]');
     expect(await t.page.locator('#meAbout .k-fact').count() === 4, 'four chips on «Я»');
     await t.tap('#meAbout button[aria-label="Курение: иногда"]'); await t.see('#meAbout .k-fact.open:has-text("Курение: иногда")');

     // A stranger gets every filled fact; on the profile page «Обо мне» comes after the main buttons.
     const stranger = await t.persona('stranger');
     const seen = await prof(t, me, stranger.email);
     expect(JSON.stringify(seen.about) === JSON.stringify(facts), 'stranger gets ' + JSON.stringify(seen.about));
     expect(seen.aboutVis === undefined, 'no audiences');

     // «Как видят»: all four, below the buttons.
     await t.go('/n/me/preview'); await t.see('#pAbout');
     expect(await t.page.locator('#pAbout .k-fact').count() === 4, 'preview: four chips');
     const below = await t.page.evaluate(() => { const a = document.querySelector('#pAbout'), b = document.querySelector('.profile-page .actions, .profile-page .pacts, .profile-page .btn');
       return !!a && !!b && (b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) > 0; });
     expect(below, '«Обо мне» after the buttons');
   } finally {
     await reset(t);
   }
 } },
];
