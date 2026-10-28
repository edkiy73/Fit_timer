// Discover at a browsing pace (owner 28.10.2026): 15 quick swipes in a row show 15 different people, no rate-limit
// message, no loading card between two people, and the swipe tip shows once per account — not again after a reload.
// A fresh `temp` account looks in «peek» mode (hidden itself), so every run has the whole pool and passes only.
import { expect, toastSee } from '../helpers.mjs';

const TIP = 'Вправо — нравится, влево — пропустить';
const SWIPES = 15;

export default [
 { name: 'D03 deck: 15 quick swipes, 15 people, no limit, no loading between cards, the tip once', persona: 'temp', allow4xx: true, run: async t => {
   const p = t.page;
   await t.api('profile.setVisibility', { opId: t.uuid7(), setting: 'discoverMode', value: 'hidden' });
   const pool = (await t.api('discover.count', { filter: { show: 'all', ageMin: 18, ageMax: 99, cityId: null, placeMode: 'city', radiusKm: 25, genders: [], orients: [], formats: [], seeks: [], roles: [], topics: [] } }));
   console.log(`   pool for a new account: ${pool.count}${pool.capped ? '+' : ''}`);
   const n = Math.min(SWIPES, pool.count);
   expect(n >= SWIPES, `only ${pool.count} people in Discover — too few for ${SWIPES} swipes`);
   // Every /api/fe request and every decided profile, from the page itself.
   const actions = []; const decided = [];
   p.on('request', r => { if (!r.url().includes('/api/fe')) return; try { const b = JSON.parse(r.postData() || '{}'); actions.push(b.action); if (b.action === 'discover.decide') decided.push(b.profileId); } catch {} });
   await t.go('/n/people');
   const top = p.locator('.deck .pc.top'); await top.waitFor({ timeout: 30000 });
   await toastSee(t, TIP, 8000);
   // From the first card on: a loading card (skeleton) or the empty state must never appear.
   await p.evaluate(() => { const w = /** @type {any} */ (window); w.__deckFlash = 0;
     new MutationObserver(() => { if (document.querySelector('.deck .fe-pc-skel, .view .empty')) w.__deckFlash++; }).observe(document.body, { subtree: true, childList: true }); });
   const before = actions.length;
   const seen = [await top.getAttribute('aria-label')];
   for (let i = 0; i < n; i++) {
     await p.keyboard.press('ArrowLeft'); await t.wait(380);
     if (i < n - 1) seen.push(await p.locator('.deck .pc.top').getAttribute('aria-label', { timeout: 3000 }));
   }
   // Decisions go one after another in the background: wait for the last ones to be sent and answered.
   for (let w = 0; w < 30 && decided.length < n; w++) await t.wait(500);
   await t.wait(1500);
   const ids = new Set(decided);
   expect(decided.length === n && ids.size === n, `${n} decisions for ${n} different people: ${decided.length} sent, ${ids.size} distinct`);
   expect(seen.length === n && seen.every(Boolean), 'a card after every swipe: ' + seen.length);
   expect(await p.evaluate(() => /** @type {any} */ (window).__deckFlash) === 0, 'a loading card or the empty state showed between two people');
   expect(!(await p.locator('.toast', { hasText: 'Слишком много' }).count()), 'rate-limit message shown');
   expect(!(await p.locator('.toast.err').count()), 'an error toast: ' + await p.locator('.toast.err').allInnerTexts().catch(() => []));
   const during = actions.slice(before);
   console.log(`   ${during.length} requests for ${n} swipes: ` + Object.entries(during.reduce((a, x) => ({ ...a, [x]: (a[x] ?? 0) + 1 }), {})).map(([k, v]) => k + '×' + v).join(', '));
   expect(during.length <= n * 3, `too many requests per swipe: ${during.length} for ${n}`);
   // Passed people do not come back: the server's deck has none of them.
   const deck = (await t.api('discover.deck', { limit: 20 })).items.map(x => x.id);
   expect(!deck.some(x => ids.has(x)), 'a passed person is back in the deck');
   // The tip: once per account — not after a reload.
   await p.reload(); await p.locator('.deck .pc.top, .view .empty').first().waitFor({ timeout: 30000 });
   await t.wait(2500);
   expect(!(await p.locator('.toast', { hasText: TIP }).count()), 'the tip came back after a reload');
 } },
];
