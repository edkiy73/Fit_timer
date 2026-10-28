// FetUre load timings on a phone: Playwright with mobile emulation, CPU ×4 slower, «fast 4G» network.
// Usage (from apps/feture): FE_ADMIN_KEY=… E2E_LANE=<lane> [APP=http://localhost:<port>] node e2e/perf.mjs [label]
// Without APP it measures production. Prints, per step: time to the first content, time until the screen stops
// changing («settled»), how many times the screen changed after its content appeared («late»), and the /api/fe calls
// (action, start, duration, server time). Writes e2e/out/perf-<label>.json.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { PROD, boot, session, sleep } from './lib.mjs';
import { persona } from './personas.mjs';

const APP = process.env.APP || PROD;
const LANE = process.env.E2E_LANE || 'pf';
const label = process.argv[2] || (APP === PROD ? 'prod' : 'local');
const OUT = new URL('out/', import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const me = await persona(LANE, 'full');
const s = await session(me.email); await boot(me.email);

const browser = await chromium.launch({ headless: true });
const results = [];

async function newPage() {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'ru-RU', timezoneId: 'Europe/Berlin',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  });
  if (APP !== PROD) await ctx.route(APP + '/api/**', async r => {
    try { const res = await r.fetch({ url: r.request().url().replace(APP, PROD), headers: { ...r.request().headers(), origin: PROD, referer: PROD + '/' } }); await r.fulfill({ response: res }); } catch { /* closed */ }
  });
  await ctx.addInitScript(x => { const { _at, personId, ...rest } = x; localStorage.setItem('feture.auth.session', JSON.stringify(rest)); localStorage.setItem('feture.auth.device', rest.deviceId); }, s);
  // Records when the screen changes: every added/removed element under <main> (toasts and image fades aside).
  await ctx.addInitScript(() => {
    window.__muts = [];
    const start = () => {
      const mo = new MutationObserver(list => {
        for (const m of list) {
          const el = m.target instanceof Element ? m.target : m.target.parentElement;
          if (el?.closest('.toasts,.toast')) continue;
          if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)) { window.__muts.push(performance.now()); break; }
          if (m.type === 'characterData') { window.__muts.push(performance.now()); break; }
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    };
    if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  // Chrome DevTools «Fast 4G»: 9 Mbit/s down, 1.5 Mbit/s up, 60 ms RTT (+ the real distance to the server).
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const calls = []; const bytes = { js: 0, css: 0, font: 0, img: 0, other: 0 };
  page.on('request', r => {
    if (!r.url().includes('/api/fe')) return;
    let action = '?'; try { action = JSON.parse(r.postData() || '{}').action; } catch {}
    calls.push({ r, action, wall: Date.now(), at: null, ms: null, server: null });
  });
  // Pictures that fail make a post ask for fresh links (post.get): worth seeing.
  page.on('requestfailed', r => { if (r.resourceType() === 'image') console.log('    ! image failed', r.failure()?.errorText, r.url().slice(0, 90)); });
  page.on('response', r => { if (r.request().resourceType() === 'image' && r.status() >= 400) console.log('    ! image', r.status(), r.url().slice(0, 90)); });
  page.on('requestfinished', async r => {
    const sizes = await r.sizes().catch(() => null); const n = sizes ? sizes.responseBodySize + sizes.responseHeadersSize : 0;
    const type = r.resourceType(); const k = type === 'script' ? 'js' : type === 'stylesheet' ? 'css' : type === 'font' ? 'font' : type === 'image' ? 'img' : 'other';
    bytes[k] += n;
    const c = calls.find(x => x.r === r); if (!c) return;
    const tm = r.timing(); c.ms = Math.round(tm.responseEnd);
    const resp = await r.response(); const st = resp ? (await resp.allHeaders())['server-timing'] : null;
    c.server = st ? Object.fromEntries(st.split(',').map(x => { const [n2, d] = x.trim().split(';dur='); return [n2, Number(d)]; })) : null;
    c.status = resp?.status();
  });
  return { ctx, page, calls, bytes };
}

/** Waits until the content is there (`ready` visible, no skeleton in the view) and then until the screen has not
 * changed for `quiet` ms. Times are from `t0` (performance.now() in the page). */
async function settle(page, ready, t0, quiet = 2500, max = 30000, url = '') {
  const began = Date.now();
  let contentAt = null;
  while (Date.now() - began < max) {
    const ok = await page.evaluate(([sel, url]) => {
      if (url && !new RegExp(url).test(location.hash)) return false;
      const v = document.querySelector('main .view');
      return !!v && !v.querySelector('.sk') && (!sel || !!v.querySelector(sel)) && v.innerText.trim().length > 20;
    }, [ready, url]).catch(() => false);
    if (ok) { contentAt = await page.evaluate(() => performance.now()); break; }
    await sleep(50);
  }
  for (;;) {
    const { now, last } = await page.evaluate(() => ({ now: performance.now(), last: window.__muts.at(-1) ?? 0 }));
    if (now - last >= quiet || Date.now() - began > max) {
      const muts = await page.evaluate(([a, b]) => window.__muts.filter(x => x > a && x <= b), [contentAt ?? t0, last]);
      // «late» = separate bursts of changes after the content first appeared (100 ms apart or more)
      let late = 0, prev = -1e9; for (const m of muts) { if (m - prev > 100) late++; prev = m; }
      return { content: contentAt == null ? null : Math.round(contentAt - t0), settled: Math.round(Math.max(last, contentAt ?? 0) - t0), late };
    }
    await sleep(200);
  }
}

function report(name, r, calls, wall0, extra = {}) {
  const list = calls.filter(c => c.wall >= wall0 - 5).map(c => ({ action: c.action, at: c.wall - wall0, ms: c.ms, server: c.server?.total ?? null, cmd: c.server?.cmd ?? null, status: c.status }));
  const row = { name, ...r, api: list.length, ...extra, calls: list };
  results.push(row);
  console.log(`${name.padEnd(26)} content ${String(r.content).padStart(5)} ms  settled ${String(r.settled).padStart(5)} ms  late ${r.late}  api ${list.length}` + (extra.js != null ? `  js ${extra.js} kB css ${extra.css} kB` : ''));
  for (const c of list) console.log(`    ${c.action.padEnd(24)} +${String(c.at).padStart(5)}  ${String(c.ms).padStart(5)} ms  server ${c.server ?? '-'} (cmd ${c.cmd ?? '-'})`);
}

const navStart = async page => page.evaluate(() => performance.timeOrigin);
const wallToPage = async (page, wall) => wall - await navStart(page);
const POSTS = '.posts article.post, .posts > *';

// 1. Cold start (empty HTTP cache) to the first feed posts.
{
  const { ctx, page, calls, bytes } = await newPage();
  const shot = n => page.screenshot({ path: OUT + 'perf-' + label + '-' + n.replace(/[^a-zа-я0-9]+/gi, '_') + '.png' }).catch(() => {});
  const w0 = Date.now();
  await page.goto(APP + '/#/n/feed');
  const r = await settle(page, POSTS, 0, 3000);
  const fcp = await page.evaluate(() => Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1));
  // calls[].at is in ms since the request's own start — use resource timing for start offsets instead
  await shot('cold');
  report('cold start → feed', r, calls, w0, { fcp, js: Math.round(bytes.js / 1024), css: Math.round(bytes.css / 1024), font: Math.round(bytes.font / 1024) });

  // 2. Reload with the HTTP cache warm (the person opens the app again).
  calls.length = 0; for (const k in bytes) bytes[k] = 0;
  const w1 = Date.now();
  await page.reload();
  const r2 = await settle(page, POSTS, 0, 3000);
  const fcp2 = await page.evaluate(() => Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1));
  report('warm reload → feed', r2, calls, w1, { fcp: fcp2, js: Math.round(bytes.js / 1024), css: Math.round(bytes.css / 1024), font: Math.round(bytes.font / 1024) });

  // 3. In-app steps: each timed from the tap.
  const step = async (name, act, ready, url) => {
    await sleep(300); calls.length = 0;
    const t0 = await page.evaluate(() => performance.now()); const wall = Date.now();
    await act();
    const r3 = await settle(page, ready, t0, 2500, 30000, url);
    await shot(name);
    report(name, r3, calls, wall);
  };
  const dock = name => () => page.locator(`nav.dock button[aria-label^="${name}"]`).first().tap();
  await step('feed → «Подписки»', () => page.locator('.seg button', { hasText: 'Подписки' }).first().tap(), '');
  await step('«Подписки» → «Для тебя»', () => page.locator('.seg button', { hasText: 'Для тебя' }).first().tap(), POSTS);
  await step('tab: Люди', dock('Люди'), '', '/n/people');
  await step('tab: Комьюнити', dock('Комьюнити'), '', '/n/communities');
  await step('tab: Чаты', dock('Чаты'), '', '/n/chats');
  await step('tab: Я', dock('Я'), '', '/n/me');
  await step('tab: Лента (again)', dock('Лента'), POSTS, '/n/feed');
  await step('open a post', () => page.locator('.posts article.post .body').first().tap(), 'article.post', '/n/feed/post/');
  await page.goBack(); await settle(page, POSTS, 0, 1500, 30000, '/n/feed');
  await step('open an author profile', () => page.locator('.posts article.post .who, .posts article.post header .av').first().tap(), '', '/n/(people/|me$)');
  // the same steps again a minute later (cached answers older than 30 s): what a person sees coming back to a tab
  await page.waitForTimeout(40000);
  await step('again: tab Люди', dock('Люди'), '', '/n/people');
  await step('again: tab Чаты', dock('Чаты'), '', '/n/chats');
  await step('again: tab Лента', dock('Лента'), POSTS, '/n/feed');
  await ctx.close();
}
await browser.close();
fs.writeFileSync(OUT + 'perf-' + label + '.json', JSON.stringify(results, null, 1));
console.log('\nwritten', OUT + 'perf-' + label + '.json');
