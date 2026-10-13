// QA for the V5 prototype: opens every review entry in RU and EN, collects JS errors,
// stray Cyrillic in the English UI and horizontal overflow; optional screenshots.
// Usage: node tools/qa-prototype-v5.mjs [--shots dir] [--width 390]
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const shots = arg('--shots', ''); const width = +arg('--width', 390);
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const url = pathToFileURL(join(app, 'public/prototype-v5.html')).href;
let problems = 0;
for (const lang of ['ru', 'en']) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto(url + '?lang=' + lang);
  await page.waitForTimeout(300);
  const entries = await page.evaluate(() => window.FT_QA.list().flatMap(([g, items]) => items.map(([id, l, p]) => ({ id, l, p: p || {} }))));
  if (shots) mkdirSync(shots, { recursive: true });
  for (const [i, e] of entries.entries()) {
    const before = errors.length;
    await page.evaluate(({ id, p }) => window.FT_QA.go(id, p), e);
    await page.waitForTimeout(e.id[0] === '!' ? 900 : 750);
    const r = await page.evaluate(() => {
      const vis = (el) => el && el.offsetParent !== null;
      const text = ['#main', '#side', '#ctx', '#sheet.on', '#dialog.on', '#matchLayer', '#toasts'].map((s) => document.querySelector(s)).filter(vis).map((el) => el.innerText).join('\n');
      const cyr = (text.match(/[^\n]*[А-Яа-яЁё][^\n]*/g) || []).filter((l) => !/Русский|русский/.test(l));
      const view = document.querySelector('#main .view');
      return { cyr, overflow: document.documentElement.scrollWidth > innerWidth + 1 || (view && view.scrollWidth > view.clientWidth + 1), screen: window.FT_QA.screen() };
    });
    const issues = [];
    if (errors.length > before) issues.push('JS: ' + errors.slice(before).join(' | '));
    if (lang === 'en' && r.cyr.length) issues.push('RU text in EN UI: ' + r.cyr.slice(0, 3).join(' / '));
    if (r.overflow) issues.push('horizontal overflow');
    if (issues.length) { problems += issues.length; console.log(`[${lang}] ${e.id} ${e.l}: ${issues.join('; ')}`); }
    if (shots && lang === 'ru') await page.screenshot({ path: join(shots, `${String(i).padStart(2, '0')}-${e.id.replace('!', 'x')}.png`) });
  }
  console.log(`[${lang}] ${entries.length} entries checked`);
  await page.close();
}
await browser.close();
console.log(problems ? `${problems} problem(s)` : 'OK: no JS errors, no Russian in the English UI, no horizontal overflow');
process.exit(problems ? 1 : 0);
