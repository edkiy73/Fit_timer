// A tab opened before a deploy still opens a screen it has not opened yet (bug 03.11.2026, «Я» → «Экран не открылся»).
// Builds A and B, serves A with server/host.mjs, opens the app, «deploys» B (host restarted on B's dist), then opens a
// screen whose code the tab has not loaded yet: /operator (a lazy page like every /n screen — lazy-screens.ts — and it
// opens signed out, so the check needs no account and no production API). Three cases:
//   kept   — host with ASSETS_KEEP_DIR (prod): A's chunk is still served, the screen opens with no reload;
//   reload — no kept chunks (before this fix): the page reloads once and the screen opens from B;
//   broken — B lacks the chunk too: one reload, then the error screen, and no reload loop.
// Usage (from apps/feture): node e2e/deploy-chunks.mjs   (two vite builds, ~1 min; screenshots in e2e/out/)
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const APP_DIR = path.resolve(new URL('..', import.meta.url).pathname);
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-deploy-chunks-'));
const OUT = new URL('out/', import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const PORT = 4790 + Math.floor(Math.random() * 100);
const APP = `http://127.0.0.1:${PORT}`;
const CHUNK = /^operator-page-[\w-]{8}\.js$/;

/** @param {string} tag */
function buildDist(tag) {
  const out = path.join(WORK, 'dist-' + tag);
  // A different build id changes the entry chunk, so every lazy chunk that imports it gets a new hash too.
  execFileSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], { cwd: APP_DIR, stdio: 'ignore', env: { ...process.env, VERCEL_GIT_COMMIT_SHA: tag.repeat(12).slice(0, 12) } });
  return out;
}
/** @param {string} dist */
const chunkOf = dist => fs.readdirSync(path.join(dist, 'assets')).find(f => CHUNK.test(f));

/** @param {string} dist @param {string} [keep] */
async function host(dist, keep) {
  const child = spawn(process.execPath, ['server/host.mjs'], { cwd: APP_DIR, stdio: 'ignore',
    env: { PATH: process.env.PATH, PORT: String(PORT), STATIC_DIR: dist, FETURE_JOBS_DISABLED: '1', ...(keep ? { ASSETS_KEEP_DIR: keep } : {}) } });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(APP + '/healthz')).ok) return child; } catch { /* starting */ } await sleep(250); }
  throw new Error('host did not start');
}
/** @param {import('node:child_process').ChildProcess} child */
const stop = child => new Promise(r => { child.once('exit', r); child.kill('SIGTERM'); });

console.log('building A and B…');
const A = buildDist('a'), B = buildDist('b');
const cA = chunkOf(A), cB = chunkOf(B);
if (!cA || !cB || cA === cB) throw new Error(`chunk hashes must differ: ${cA} / ${cB}`);
const Bbroken = path.join(WORK, 'dist-b-broken'); fs.cpSync(B, Bbroken, { recursive: true }); fs.rmSync(path.join(Bbroken, 'assets', cB));
console.log(`A: ${cA}, B: ${cB}`);

const browser = await chromium.launch({ headless: true });
const results = [];
for (const kase of ['kept', 'reload', 'broken']) {
  const keep = kase === 'kept' ? path.join(WORK, 'keep') : undefined;
  let server = await host(A, keep);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  await ctx.route(APP + '/api/**', r => r.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false,"error":"unavailable"}' }));
  const page = await ctx.newPage();
  /** @type {string[]} */ const chunks = [];
  page.on('response', r => { if (CHUNK.test(path.basename(r.url()))) chunks.push(path.basename(r.url()) + ' ' + r.status()); });
  let loads = 0; page.on('load', () => { loads++; });
  let err = null;
  try {
    await page.goto(APP + '/#/n/feed');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => { /** @type {any} */ (window).__beforeDeploy = true; });
    await stop(server); // deploy: A's container stops, B's starts (on the same volume when kept)
    server = await host(kase === 'broken' ? Bbroken : B, keep);
    await page.evaluate(() => { location.hash = '#/operator'; });
    if (kase === 'broken') {
      await page.getByText('Что-то пошло не так').waitFor({ timeout: 30000 });
      await page.waitForTimeout(3000); // a loop would reload again here
    } else await page.getByText('Рабочий экран KINHAZE').waitFor({ timeout: 30000 });
    const same = await page.evaluate(() => !!(/** @type {any} */ (window).__beforeDeploy));
    const reloads = loads - 1;
    const want = { kept: [true, 0], reload: [false, 1], broken: [false, 1] }[kase];
    if (same !== want[0] || reloads !== want[1]) throw new Error(`same page ${same}, reloads ${reloads}; expected ${want[0]}, ${want[1]}`);
    await page.screenshot({ path: OUT + `deploy-chunks-${kase}.png` });
  } catch (e) { err = String(/** @type {any} */ (e)?.message || e).split('\n')[0]; }
  results.push(!err);
  console.log(`${err ? 'FAIL' : 'PASS'} ${kase}: ${err || 'ok'} — ${chunks.join(', ')}`);
  await ctx.close(); await stop(server);
}
await browser.close();
fs.rmSync(WORK, { recursive: true, force: true });
process.exit(results.every(Boolean) ? 0 : 1);
