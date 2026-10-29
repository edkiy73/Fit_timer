// FetUre design system guard (owner, 28.10.2026): screens take controls only from src/fe/kit and values only from the
// kit tokens. This counts, per file, what a screen writes by hand instead; the count may only go down.
//   node tools/check-fe-kit.mjs           — fail if any file has more than its baseline (or a new file has any)
//   node tools/check-fe-kit.mjs --update  — after removing hand-written pieces, lower the baseline
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const BASE = join(ROOT, 'tools/fe-kit-baseline.json');
// The kit itself, and the generated prototype stylesheet, are where these things are allowed to live.
const KIT = ['src/fe/kit/', 'src/fe/ui.tsx'];

const TSX = [
  ['sheet', /className=(?:"|\{['`])[^"'`}]*(?<![\w-])sheet(?![\w-])/g],
  ['dialog', /className=(?:"|\{['`])[^"'`}]*(?<![\w-])dialog(?![\w-])/g],
  ['tabs', /role="tablist"/g],
  ['switch', /role="switch"/g],
  ['list row', /className=(?:"|\{['`])li(?:\b|["' ])/g],
  ['chip', /className=(?:"|\{['`])[^"'`}]*(?<![\w-])chip(?![\w-])/g],
  ['notice', /className=(?:"|\{['`])[^"'`}]*(?<![\w-])alert(?![\w-])/g],
  ['round button', /className=(?:"|\{['`])[^"'`}]*(?<![\w-])ibtn(?![\w-])/g],
  ['button', /className=(?:"|\{['`])[^"'`}]*(?<![\w-])btn(?![\w-])/g],
  ['input', /<input\b/g],
  ['textarea', /<textarea\b/g],
  ['select', /<select\b/g],
  // A style object that only passes CSS variables (a value from data: a bar width, an aspect ratio) is allowed.
  ['inline style', /style=\{\{(?!\s*['"]--)/g],
  ['heading', /<h[1-5]\b/g],
  ['card', /className=(?:"|\{['`])[^"'`}]*(?<![\w-])card(?![\w-])/g],
  ['pill', /className=(?:"|\{['`])[^"'`}]*(?<![\w-])pill(?![\w-])/g],
  ['divider', /<hr\b/g],
  ['radio', /role="radio"/g],
  ['checkbox', /role="checkbox"/g],
  ['note', /className=(?:"|\{['`])note["' ]/g],
  ['section label', /className="sec"/g],
  ['progress', /className="qprog"/g],
  // Layout grid (owner 29.10.2026): screens do not space or size blocks themselves — the kit's rhythm (--block-gap),
  // Stack / Actions gaps and the page column do. mt* / mb* classes and inline widths are what is left to move.
  ['margin class', /className=(?:"|\{['`])[^"'`}]*(?<![\w-])(?:mt|mb)\d+(?![\w-])/g],
  // An empty state is the kit's Empty (compact inside a screen part or sheet), never a Note saying «nothing here».
  ['empty note', /<Note[^>]*>\{t\('[^']*(?:\.no[A-Z]|[nN]othing|[eE]mpty|[nN]one\b|None')[^']*'[^}]*\}<\/Note>/g],
  // A row of buttons is the kit's Actions, not a Stack row / .row of Btns.
  ['button row', /<Stack row[^>]*>\s*<Btn\b|className="row g\d+"[^>]*>\s*<Btn\b/g],
];
// «Одно действие — один компонент» (owner 29.10.2026): one shared component per meaning. These may appear only in
// their one home (outside it the count must be 0, no baseline): a second composer row, create sheet, report flow,
// clipboard link, follow call or browser confirm is a copy, and a copy is wrong. See AGENTS.md and src/fe/kit/README.md.
const ONE = [
  ['composer row (use Composer from create-entry.tsx)', /className=(?:"|\{['`])[^"'`}]*(?<![\w-])(?:composer|cmp-main)(?![\w-])/g, []],
  ['«Создать» sheet (use CreateSheet from create-entry.tsx)', /<Sheet[^>]*title=\{t\('fe\.create'\)\}/g, ['src/fe/create-entry.tsx']],
  ['report call (use ReportSheet from report.tsx)', /call\('report\.create'/g, ['src/fe/report.tsx']],
  ['clipboard (use useCopyLink / copyLink from share.tsx)', /navigator\.clipboard/g, ['src/fe/share.tsx', 'src/fe/chats.tsx']],
  ['follow call (use FollowButton from follow.tsx)', /call\('follow\.set'/g, ['src/fe/follow.tsx']],
  ['photo tile grid (use PhotoTiles from kit/PhotoTiles.tsx)', /className=(?:"|\{['`])[^"'`}]*(?<![\w-])(?:edit-ph|k-ptiles)(?![\w-])/g, ['src/fe/kit/PhotoTiles.tsx']],
  ['browser confirm (use Ask)', /window\.confirm\(/g, []],
  ['«Принимаю правила» box (the join button accepts the rules)', /fe\.host\.join\.accept'/g, []],
];
const CSS = [
  ['stylesheet', /^/],  // a screen stylesheet at all: new styles go into the kit (kit.css / tokens.css)
  ['colour', /#[0-9a-fA-F]{3,8}\b|rgba?\(/g],
  ['font size', /font-size\s*:\s*\d/g],
  ['font family', /font-family\s*:/g],
];

function files(dir, ext) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p, ext));
    else if (ext.some(x => e.name.endsWith(x))) out.push(p);
  }
  return out;
}
const counts = {};
const copies = [];
for (const f of files(join(ROOT, 'src/fe'), ['.tsx', '.ts', '.css'])) {
  const rel = relative(ROOT, f);
  if (KIT.some(k => rel.startsWith(k)) || rel.includes('/i18n/')) continue;
  const src = readFileSync(f, 'utf8');
  if (!rel.endsWith('.css')) for (const [name, re, home] of ONE) {
    const n = (src.match(re) || []).length;
    if (n && !home.includes(rel)) copies.push(`${rel}: ${name} ×${n}`);
  }
  for (const [name, re] of rel.endsWith('.css') ? CSS : TSX) {
    const n = (src.match(re) || []).length;
    if (n) (counts[rel] ??= {})[name] = n;
  }
}
if (copies.length) {
  console.error('«Одно действие — один компонент»: a second version of a shared component. Use the shared one:');
  for (const c of copies) console.error('  ' + c);
  process.exit(1);
}
if (process.argv.includes('--update')) {
  writeFileSync(BASE, JSON.stringify(counts, null, 1) + '\n');
  console.log('fe-kit baseline written');
  process.exit(0);
}
const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : {};
const over = [];let down = 0;
for (const [f, c] of Object.entries(counts)) for (const [k, n] of Object.entries(c)) {
  const b = base[f]?.[k] ?? 0;
  if (n > b) over.push(`${f}: ${k} ${b} → ${n}`); else if (n < b) down++;
}
for (const [f, c] of Object.entries(base)) for (const [k, b] of Object.entries(c)) if ((counts[f]?.[k] ?? 0) < b) down++;
if (over.length) {
  console.error('A screen hand-writes what the kit (src/fe/kit) has, or a value the V21 tokens have. Use the kit component / var(--token):');
  for (const o of over) console.error('  ' + o);
  process.exit(1);
}
const total = Object.values(counts).reduce((s, c) => s + Object.values(c).reduce((a, b) => a + b, 0), 0);
console.log(`fe-kit: ${total} hand-written pieces left${down ? ` (lower the baseline: node tools/check-fe-kit.mjs --update)` : ''}`);
