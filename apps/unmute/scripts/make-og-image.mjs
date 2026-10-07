/* Link preview picture (og:image, 1200×630) for the landing page: `node scripts/make-og-image.mjs`
   renders public/og.png with the bundled Chromium. Re-run after changing the text or the icon. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const APP_DIR = fileURLToPath(new URL('..', import.meta.url));
const icon = readFileSync(APP_DIR + 'public/icon.png').toString('base64');
const fontCyr = readFileSync(APP_DIR + 'src/fonts/manrope-cyrillic-wght-normal.woff2').toString('base64');
const fontLat = readFileSync(APP_DIR + 'src/fonts/manrope-latin-wght-normal.woff2').toString('base64');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:M;font-weight:200 800;src:url(data:font/woff2;base64,${fontCyr}) format("woff2");unicode-range:U+0400-045F}
@font-face{font-family:M;font-weight:200 800;src:url(data:font/woff2;base64,${fontLat}) format("woff2");unicode-range:U+0000-00FF,U+2000-206F}
body{margin:0;width:1200px;height:630px;background:#FBF7F2;font-family:M,sans-serif;color:#1B1A24;display:grid;grid-template-columns:1fr 420px;align-items:center;gap:40px;padding:0 72px;box-sizing:border-box}
.brand{display:flex;align-items:center;gap:16px;font-size:34px;font-weight:800}
.brand img{width:72px;height:72px;border-radius:20px}
h1{margin:36px 0 18px;font-size:64px;line-height:1.05;letter-spacing:-.02em}
p{margin:0;font-size:28px;color:#625E70;line-height:1.35}
.card{background:#fff;border:2px solid #E6DED3;border-radius:36px;padding:34px;box-shadow:0 30px 60px -30px rgba(27,26,36,.35)}
.kicker{display:inline-block;padding:6px 14px;border-radius:999px;background:#FFE4DB;color:#C2412A;font-size:22px;font-weight:700}
.card h2{margin:18px 0 18px;font-size:34px;line-height:1.2}
.answer{padding:18px 20px;border-radius:22px;background:#F3EDE5;font-size:28px;font-weight:700}
</style></head><body>
<div><div class="brand"><img src="data:image/png;base64,${icon}">UnMute</div>
<h1>Заговори по&#8209;английски в реальной жизни</h1>
<p>Фразы для магазина, врача, работы и соседей. Первые дни бесплатно.</p></div>
<div class="card"><span class="kicker">Скажи вслух</span><h2>Я живу здесь два года.</h2><div class="answer">I've lived here for two years.</div></div>
</body></html>`;

const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium'});
const page = await browser.newPage({viewport: {width: 1200, height: 630}});
await page.setContent(html);
await page.waitForTimeout(300);
await page.screenshot({path: APP_DIR + 'public/og.png'});
await browser.close();
console.log('public/og.png');
