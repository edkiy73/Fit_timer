// FetUre interaction runner. Usage (from apps/feture):
//   FE_ADMIN_KEY=… E2E_LANE=<your lane> APP=http://localhost:<port> node e2e/run.mjs <scenario-file.mjs> [name-filter]
// A scenario file exports `default [{name, persona:'full'|'basic'|'new'|'pair'|…, route:'/n/…', run: async t => {…}}]`.
// `persona` signs the browser in as that persona of your lane (e2e/personas.mjs); `persona: null` opens the app signed
// out. There is no default account: a scenario without `persona` fails.
// `mic: true` gives that scenario's page a fake microphone (a beep), already allowed; `mic: 'deny'` makes the browser refuse it.
// t: page (Playwright), go(route), tap(textOrSelector), fill(selectorOrLabel, value), see(text), notSee(text), wait(ms),
//    api(action, input, asEmail?, profile?) — a direct API call for setup or to read the result back, me (the persona),
//    persona(kind) — another persona of the same lane (an actor who asks, invites, applies…; built on first use),
//    admin(action, body) — the admin API (test codes), pid(asEmail?), boot(asEmail?), shot(name).
// Fails on: thrown errors, a failed see(), console errors, any /api/fe response ≥ 500 or an unexpected 4xx.
// APP is a local `vite preview` of your build; /api is proxied to production (the shared API).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { PROD, api, boot, post, session, sleep, uuid7 } from './lib.mjs';
import { persona } from './personas.mjs';
const APP = process.env.APP || PROD;
const LANE = process.env.E2E_LANE || 'local';
const DIR = new URL('.', import.meta.url).pathname;
const OUT = DIR + 'out/'; fs.mkdirSync(OUT, { recursive: true });
const [, , file, filter] = process.argv;
const scenarios = (await import(new URL(file, 'file://' + process.cwd() + '/').href)).default.filter(s => !filter || s.name.includes(filter));
// Fake media (a beep and a test pattern). Headless Chromium honours a microphone grant only with the fake-UI switch, so
// `mic: true` scenarios run in a second browser that has it; `mic: 'deny'` refuses getUserMedia as a person saying no does.
const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream'] });
let micBrowser = null;
const results = [];
for (const sc of scenarios) {
  if (sc.persona === undefined) { results.push({ name: sc.name, ok: false, err: 'no persona' }); console.log('FAIL ' + sc.name + '\n   ✗ every scenario names a persona (or persona: null for signed out)'); continue; }
  let me;
  try { me = sc.persona ? await persona(LANE, sc.persona) : { email: null }; }
  catch (e) { results.push({ name: sc.name, ok: false, err: 'persona: ' + e.message }); console.log('FAIL ' + sc.name + '\n   ✗ persona ' + sc.persona + ': ' + e.message); continue; }
  const email = me.email;
  const s = email ? await session(email) : null; if (email) await boot(email);
  if (sc.mic === true) micBrowser ??= await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const ctx = await (sc.mic === true ? micBrowser : browser).newContext({ viewport: sc.viewport || { width: 390, height: 844 }, locale: 'ru-RU', timezoneId: 'Europe/Berlin' });
  if (APP !== PROD) await ctx.route(APP + '/api/**', async r => {
    try {
      let res;
      // The page aborts a call after 15 s: retries of a 429 stay well under that.
      for (let i = 0; i < 5; i++) { res = await r.fetch({ url: r.request().url().replace(APP, PROD), headers: { ...r.request().headers(), origin: PROD, referer: PROD + '/' } }); if (res.status() !== 429) break; await sleep(1500 + i * 1000); }
      await r.fulfill({ response: res });
    } catch { /* context closed */ }
  });
  if (s) await ctx.addInitScript(x => { const { _at, personId, ...rest } = x; localStorage.setItem('feture.auth.session', JSON.stringify(rest)); localStorage.setItem('feture.auth.device', rest.deviceId); }, s);
  if (sc.mic === 'deny') await ctx.addInitScript(() => { if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')); });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 4/.test(m.text())) problems.push('console: ' + m.text().slice(0, 300)); });
  page.on('pageerror', e => problems.push('pageerror: ' + String(e).slice(0, 300)));
  page.on('response', async r => { if (!r.url().includes('/api/fe')) return; const st = r.status(); if (st >= 500 || (st >= 400 && !(sc.allow4xx))) { let body = ''; try { body = (await r.text()).slice(0, 200); } catch {} let act = ''; try { act = JSON.parse(r.request().postData() || '{}').action; } catch {} problems.push(`api ${act} → ${st} ${body}`); } });
  const loc = q => typeof q === 'string' && /^[.#\[]|^[a-z]+[.\[#:]|>>|^role=|^text=|^css=/.test(q) ? page.locator(q) : page.getByText(q, { exact: false });
  const t = {
    page, uuid7, me,
    go: async r => { await page.goto(APP + '/#' + r); await page.waitForTimeout(600); },
    tap: async q => { await loc(q).first().click({ timeout: 25000 }); await page.waitForTimeout(500); },
    fill: async (q, v) => { const l = typeof q === 'string' && !/^[.#\[]|^[a-z]+[.\[#:]/.test(q) ? page.getByLabel(q).or(page.getByPlaceholder(q)) : page.locator(q); await l.first().fill(v, { timeout: 25000 }); await page.waitForTimeout(300); },
    see: async (q, timeout = 30000) => { await loc(q).first().waitFor({ state: 'visible', timeout }); },
    notSee: async (q, timeout = 3000) => { await page.waitForTimeout(timeout); if (await loc(q).first().isVisible().catch(() => false)) throw new Error('should not see: ' + q); },
    wait: ms => page.waitForTimeout(ms),
    api: (action, input, as, profile) => api(as || email, action, input, profile),
    persona: kind => persona(LANE, kind),
    admin: (action, body) => post('/api/admin', { action, ...body }, { 'x-admin-key': process.env.FE_ADMIN_KEY ?? '' }),
    pid: async as => { await api(as || email, 'profile.settings', {}); return (await session(as || email)).personId; },
    boot: as => boot(as || email), // session.bootstrap; also refreshes the cached person / couple ids for t.api
    shot: async n => page.screenshot({ path: OUT + n + '.png' }),
  };
  const t0 = Date.now(); let err = null;
  try { if (sc.route) await t.go(sc.route); await sc.run(t); } catch (e) { err = String(e.message || e).split('\n').slice(0, 12).join(' | ').slice(0, 1200); }
  const fname = sc.name.replace(/[^a-zа-я0-9]+/gi, '_').slice(0, 60);
  if (err || problems.length) await page.screenshot({ path: OUT + 'FAIL-' + fname + '.png' }).catch(() => {});
  results.push({ name: sc.name, ok: !err && !problems.length, ms: Date.now() - t0, err, problems: [...new Set(problems)].slice(0, 6) });
  console.log((!err && !problems.length ? 'PASS ' : 'FAIL ') + sc.name + (err ? '\n   ✗ ' + err : '') + (problems.length ? '\n   ! ' + [...new Set(problems)].slice(0, 4).join('\n   ! ') : ''));
  await ctx.close();
  await sleep(Number(process.env.PAUSE ?? 4000)); // spare the shared quota
}
await browser.close(); await micBrowser?.close();
fs.writeFileSync(OUT + 'last-' + (file.split('/').pop()) + '.json', JSON.stringify(results, null, 1));
const f = results.filter(r => !r.ok).length; console.log(`\n${results.length - f}/${results.length} passed`); process.exit(f ? 1 : 0);
