// Builds the standalone V7 design prototype into public/prototype-v7.html (+ notes page).
// One self-contained file: works from Vercel and when downloaded to a phone.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(app, 'prototype/v7');
const read = (p) => readFileSync(join(src, p), 'utf8');
const order = ['data.js', 'core.js', 'ui.js', 'media.js', 's-location.js', 's-auth.js', 's-feed.js', 's-events.js', 's-people.js', 's-profile.js', 's-comm.js', 's-chats.js', 's-me.js', 's-settings.js', 's-completion.js', 's-navigation.js', 'qa.js', 'main.js'];

const img = {};
for (let i = 1; i <= 9; i++) img[i] = 'data:image/webp;base64,' + readFileSync(join(app, `public/images/profile-${i}.webp`)).toString('base64');
// V7: logos are inline SVG in core.js (LOGOS); the raster test mark is no longer embedded.

const js = `window.FT_IMG=${JSON.stringify(img)};\n(function(){\n${order.map((f) => `/* ---- ${f} ---- */\n${read(f)}`).join('\n')}\n})();`;
const html = read('index.html').replace('/*CSS*/', () => read('styles.css')).replace('/*JS*/', () => js.replace(/<\/script/gi, '<\\/script'));
writeFileSync(join(app, 'public/prototype-v7.html'), html);
console.log(`prototype-v7.html: ${(html.length / 1024).toFixed(0)} KB`);

// Notes page: the review document rendered as a readable page (tiny Markdown subset).
const md = readFileSync(join(app, 'docs/design-reference/V7-CHANGELOG.md'), 'utf8');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
let out = '', list = false, table = false;
for (const line of md.split('\n')) {
  if (/^\|/.test(line)) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^-+$/.test(c))) continue;
    if (!table) { out += '<div class="t"><table>'; table = 'h'; }
    const tag = table === 'h' ? 'th' : 'td'; table = 'b';
    out += `<tr>${cells.map((c) => `<${tag}>${inline(c)}</${tag}>`).join('')}</tr>`; continue;
  }
  if (table) { out += '</table></div>'; table = false; }
  if (/^\s*[-*] /.test(line)) { if (!list) { out += '<ul>'; list = true; } out += `<li>${inline(line.replace(/^\s*[-*] /, ''))}</li>`; continue; }
  if (list) { out += '</ul>'; list = false; }
  const h = line.match(/^(#{1,3}) (.*)/);
  if (h) out += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
  else if (line.trim()) out += `<p>${inline(line)}</p>`;
}
if (list) out += '</ul>'; if (table) out += '</table></div>';
const page = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>FetUre V7 — что изменено</title><style>
:root{--bg:#F3EEF2;--surf:#fff;--ink:#1E1219;--mute:#6F5A67;--line:#E6DAE3;--acc:#E01A3E;--lil:#5C47D6}
@media(prefers-color-scheme:dark){:root{--bg:#1A0F16;--surf:#241520;--ink:#FBF0F4;--mute:#BCA4B1;--line:#3E2636;--acc:#FF3355;--lil:#B9A6FF}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:860px;margin:auto;padding:28px 16px 64px}h1{font-size:clamp(28px,6vw,42px);line-height:1.1;letter-spacing:-.03em}h2{margin-top:40px;font-size:24px;letter-spacing:-.02em}h3{margin-top:26px}
a{color:var(--lil)}code{background:var(--surf);border:1px solid var(--line);border-radius:6px;padding:1px 5px;font-size:.88em;overflow-wrap:anywhere}
.t{overflow-x:auto;margin:14px 0;border:1px solid var(--line);border-radius:14px;background:var(--surf)}table{border-collapse:collapse;width:100%;font-size:14.5px}th,td{text-align:left;vertical-align:top;padding:10px 12px;border-top:1px solid var(--line)}th{background:color-mix(in srgb,var(--line) 40%,transparent);border-top:0}
li{margin:4px 0}.cta{display:inline-block;margin:6px 0 10px;padding:12px 18px;border-radius:14px;background:var(--acc);color:#fff;font-weight:700;text-decoration:none}
</style></head><body><main><a class="cta" href="prototype-v7.html">Открыть прототип V7 →</a>${out}</main></body></html>`;
writeFileSync(join(app, 'public/prototype-v7-notes.html'), page);
console.log('prototype-v7-notes.html written');
