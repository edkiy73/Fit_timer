// QA for the V10 prototype: every review-drawer screen in RU and EN at 390px (and 320px),
// JS errors, horizontal overflow, Cyrillic leaking into EN, plus touch-swipe and back/forward checks.
// Usage: node tools/qa-prototype-v10.mjs [outDir]  (needs playwright-core and a Chromium)
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] || 'qa-v10';
mkdirSync(out, { recursive: true });
const exe = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
// V10_URL=http://localhost:PORT/prototype-v10.html serves linked photos; file:// cannot resolve /images/*.
const url = process.env.V10_URL || pathToFileURL(join(process.cwd(), 'public/prototype-v10.html')).href;
const b = await chromium.launch({ executablePath: exe });
const problems = [];
const note = (m) => { problems.push(m); console.log('✗', m); };

async function page(width = 390, touch = true) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => note(`[${width}] JS error: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') note(`[${width}] console: ${m.text()}`); });
  await p.goto(url);
  await p.waitForTimeout(400);
  return { ctx, p };
}

// 1. every screen, both languages
for (const [lang, width] of [['ru', 390], ['en', 390], ['ru', 320]]) {
  const { ctx, p } = await page(width);
  await p.evaluate((l) => { window.FT_QA.go('F01', { sub: 'foryou' }); }, lang);
  if (lang === 'en') await p.evaluate(() => { document.querySelector('#qaFab').click(); document.querySelector('[data-act="qaLang"][data-v="en"]').click(); window.QA_CLOSE(); });
  const list = await p.evaluate(() => window.FT_QA.list().flatMap(([g, items]) => items.map(([id, l, pp]) => ({ id, l, pp: pp || {} }))));
  let i = 0;
  for (const s of list) {
    await p.evaluate(({ id, pp }) => window.FT_QA.go(id, pp), s);
    await p.waitForTimeout(s.id[0] === '!' ? 750 : 420);
    const r = await p.evaluate((lang) => {
      const m = document.querySelector('#main');
      const clipped = (e) => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.overflowX !== 'visible') { const r = a.getBoundingClientRect(); if (r.right <= innerWidth + 1 && r.left >= -1) return true; } } return false; };
      const over = [...document.querySelectorAll('#main *, #sheet *')].filter((e) => { const rc = e.getBoundingClientRect(); return rc.width && (rc.right > innerWidth + 1 || rc.left < -1) && getComputedStyle(e).position !== 'fixed' && !e.closest('.sheet:not(.on)') && !clipped(e); }).slice(0, 3).map((e) => (typeof e.className === 'string' ? e.className : e.tagName) + '@' + Math.round(e.getBoundingClientRect().right));
      const txt = (m?.innerText || '') + ' ' + (document.querySelector('#sheet.on')?.innerText || '');
      const cyr = lang === 'en' ? (txt.match(/[А-Яа-яЁё]{3,}[^\n]{0,30}/g) || []).filter((x) => !/Русский|Москв|русский/.test(x)).slice(0, 3) : [];
      return { over, cyr, screen: m?.dataset.screen };
    }, lang);
    if (r.over.length) note(`[${lang}/${width}] ${s.id} ${s.l}: overflow ${r.over.join(' | ')}`);
    if (r.cyr.length) note(`[${lang}/${width}] ${s.id} ${s.l}: Cyrillic in EN: ${r.cyr.join(' | ')}`);
    if (width === 390) await p.screenshot({ path: join(out, `${lang}-${String(i).padStart(3, '0')}-${s.id.replace('!', '_')}.png`) });
    i++;
  }
  await ctx.close();
}

// 2. touch swipe on the deck
{
  const { ctx, p } = await page(390);
  // dating is off until the audience grows: switch it on in the review drawer first
  await p.evaluate(() => { document.querySelector('#qaFab').click(); document.querySelector('[data-act="qaDating"][data-v="on"]').click(); window.QA_CLOSE(); });
  await p.evaluate(() => window.FT_QA.go('D03', { sub: 'discover' }));
  await p.waitForTimeout(700);
  const cdp = await ctx.newCDPSession(p);
  const top = () => p.evaluate(() => document.querySelector('#deck .pc.top')?.dataset.id);
  const swipe = async (x0, y0, x1, y1) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let k = 1; k <= 12; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * k / 12, y: y0 + (y1 - y0) * k / 12 }] }); await p.waitForTimeout(18); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(650);
  };
  const a = await top(); await swipe(220, 420, 30, 430); const b2 = await top();
  if (a === b2) note(`touch swipe left did not advance (${a})`); else console.log('✓ swipe left', a, '→', b2);
  await swipe(150, 420, 370, 410); const c = await top();
  if (b2 === c) note(`touch swipe right did not advance (${b2})`); else console.log('✓ swipe right', b2, '→', c);
  // edge tap switches photo
  await p.evaluate(() => { window.FT_QA.go('D03', { sub: 'discover' }); });
  await p.waitForTimeout(600);
  const bars = await p.evaluate(() => document.querySelectorAll('#deck .pc.top .pc-bars i').length);
  console.log('photo bars on top card:', bars);
  await ctx.close();
}

// 3. back / forward and leave guard
{
  const { ctx, p } = await page(390);
  await p.evaluate(() => window.FT_QA.go('F01', { sub: 'foryou' }));
  await p.waitForTimeout(300);
  await p.click('.composer .cmp-main'); await p.waitForTimeout(350);
  await p.click('.rte-ed[data-name="text"]'); await p.keyboard.type('Привет, это тест');
  await p.click('[data-act="toPreview"]'); await p.waitForTimeout(400);
  const s1 = await p.evaluate(() => window.FT_QA.screen());
  if (s1 !== 'F09') note(`preview blocked by leave dialog (screen ${s1})`); else console.log('✓ editor → preview without dialog');
  await p.goBack(); await p.waitForTimeout(400);
  const s2 = await p.evaluate(() => [window.FT_QA.screen(), document.querySelector('.rte-ed[data-name="text"]')?.textContent]);
  if (s2[0] !== 'F07' || s2[1] !== 'Привет, это тест') note(`system back from preview lost the draft: ${s2}`); else console.log('✓ back keeps the draft');
  await p.goForward(); await p.waitForTimeout(400);
  if (await p.evaluate(() => window.FT_QA.screen()) !== 'F09') note('system forward did not return to preview'); else console.log('✓ forward');
  await p.goBack(); await p.waitForTimeout(300); await p.goBack(); await p.waitForTimeout(400);
  const dlg = await p.evaluate(() => document.querySelector('#dialog.on h2')?.textContent);
  if (!dlg) note('leaving a dirty editor with Back did not ask'); else console.log('✓ leaving dirty editor asks:', dlg);
  await p.click('#dialog [data-r="0"]'); await p.waitForTimeout(300);
  await p.evaluate(() => window.FT_QA.tab('people')); await p.waitForTimeout(300);
  const dlg2 = await p.evaluate(() => document.querySelector('#dialog.on h2')?.textContent);
  if (dlg2) note('switching tabs from a dirty editor asked to leave'); else console.log('✓ tab switch keeps draft without asking');
  await p.evaluate(() => window.FT_QA.tab('feed')); await p.waitForTimeout(300);
  if (await p.evaluate(() => window.FT_QA.screen()) !== 'F07') note('returning to the feed tab lost the editor'); else console.log('✓ tab returns to the editor');
  await ctx.close();
}
await b.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nNo problems found');
process.exitCode = problems.length ? 1 : 0;

