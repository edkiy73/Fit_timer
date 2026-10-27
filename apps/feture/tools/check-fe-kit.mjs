// FetUre design system guard (owner, 28.10.2026): screens take controls only from src/fe/kit and values only from the
// V21 tokens. This counts, per file, what a screen writes by hand instead; the count may only go down.
//   node tools/check-fe-kit.mjs           — fail if any file has more than its baseline (or a new file has any)
//   node tools/check-fe-kit.mjs --update  — after removing hand-written pieces, lower the baseline
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const BASE = join(ROOT, 'tools/fe-kit-baseline.json');
// The kit itself, and the generated prototype stylesheet, are where these things are allowed to live.
const KIT = ['src/fe/kit/', 'src/fe/ui.tsx', 'src/fe/v21.css'];

const TSX = [
  ['sheet', /className=(?:"|\{['`])[^"'`}]*\bsheet\b/g],
  ['dialog', /className=(?:"|\{['`])[^"'`}]*\bdialog\b/g],
  ['tabs', /role="tablist"/g],
  ['switch', /role="switch"/g],
  ['list row', /className=(?:"|\{['`])li(?:\b|["' ])/g],
  ['chip', /className=(?:"|\{['`])[^"'`}]*\bchip\b/g],
  ['notice', /className=(?:"|\{['`])[^"'`}]*\balert\b/g],
  ['round button', /className=(?:"|\{['`])[^"'`}]*\bibtn\b/g],
  ['button', /className=(?:"|\{['`])[^"'`}]*\bbtn\b/g],
  ['input', /<input\b/g],
  ['textarea', /<textarea\b/g],
  ['select', /<select\b/g],
  ['inline style', /style=\{\{/g],
];
const CSS = [
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
for (const f of files(join(ROOT, 'src/fe'), ['.tsx', '.ts', '.css'])) {
  const rel = relative(ROOT, f);
  if (KIT.some(k => rel.startsWith(k)) || rel.includes('/i18n/')) continue;
  const src = readFileSync(f, 'utf8');
  for (const [name, re] of rel.endsWith('.css') ? CSS : TSX) {
    const n = (src.match(re) || []).length;
    if (n) (counts[rel] ??= {})[name] = n;
  }
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
