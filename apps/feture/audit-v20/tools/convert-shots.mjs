// Converts the PNG screenshots referenced by the report into compact WebP files (audit-v20/img/…).
// Usage: node convert-shots.mjs <list.json>   (list = array of paths relative to the raw screenshot root)
// Env: RAW = folder with raw PNG screenshots (default ../screens), CHROME = browser executable.
import {chromium} from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const RAW = process.env.RAW || path.join(here, '../screens');
const OUT = process.env.OUT || path.join(here, '../img');
const list = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const b = await chromium.launch({executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const p = await b.newPage();
let n = 0;
for (const rel of list) {
  const src = path.join(RAW, rel), dst = path.join(OUT, rel.replace(/\.png$/i, '.webp'));
  if (!fs.existsSync(src)) { console.log('missing', rel); continue; }
  if (fs.existsSync(dst) && fs.statSync(dst).mtimeMs > fs.statSync(src).mtimeMs) continue;
  fs.mkdirSync(path.dirname(dst), {recursive: true});
  const b64 = fs.readFileSync(src).toString('base64');
  const out = await p.evaluate(async ([b64, maxW, maxH]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const k = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/webp', 0.8).split(',')[1];
  }, [b64, 1600, 6000]);
  fs.writeFileSync(dst, Buffer.from(out, 'base64')); n++;
}
console.log('converted', n);
await b.close();
