// FetUre safe-top guard (owner, 29.10.2026): on an edge-to-edge phone the status bar lies over the top of the screen.
// Anything pinned to the top edge (position fixed/absolute/sticky with top:0 / inset:0, or a full-height sheet) must keep
// `var(--safe-t)` in the same CSS rule, so a title is never drawn under the system bar.
// Exemption, for a box that is NOT at the top of the screen (an overlay inside a card, a button inside a hero …):
// a comment `/* safe-t: ok — <why> */` inside the rule or right before it.
//   node tools/check-fe-safe-top.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIRS = ['src'];
const files = [];
const walk = d => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : p.endsWith('.css') && files.push(p); } };
DIRS.forEach(d => walk(join(ROOT, d)));

const PIN = /(?:^|;)\s*(?:top\s*:\s*0(?:px)?\s*(?:!important)?\s*(?=;|$)|inset\s*:\s*0(?:px)?(?:\s+[^;]*)?(?=;|$)|inset-block-start\s*:\s*0(?:px)?\s*(?=;|$)|inset-block\s*:\s*0(?:px)?(?:\s+[^;]*)?(?=;|$))/;
const POS = /(?:^|;)\s*position\s*:\s*(fixed|absolute|sticky)/;
const bad = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const re = /(\/\*[\s\S]*?\*\/\s*)?([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    // selector text may start with comments between rules: take the last comment directly before the selector
    const full = m[0]; const sel = m[2]; const body = m[3];
    const lead = (src.slice(Math.max(0, m.index - 0), m.index + full.length));
    const inner = body.replace(/\/\*[\s\S]*?\*\//g, '');
    const pos = POS.exec(inner);
    if (!pos || !PIN.test(inner)) continue;
    // Not a screen-level box: a filler of a media / pseudo element (img, video, ::before …) sits in its own parent.
    const parts = sel.replace(/\/\*[\s\S]*?\*\//g, '').split(',').map(x => x.trim()).filter(Boolean);
    const filler = x => /::?(before|after)\s*$|(?:^|[\s>+~])(?:img|video|svg|picture|canvas|select|i|b)(?:[.:#\[][^\s>+~]*)?\s*$/.test(x);
    if (pos[1] !== 'fixed' && parts.every(filler)) continue;
    if (/--safe-t|safe-area-inset-top/.test(inner)) continue;
    if (/safe-t:\s*ok/.test(lead)) continue;
    const line = src.slice(0, m.index + full.length - body.length - 1).split('\n').length;
    bad.push(`${relative(ROOT, f)}:${line}  ${sel.trim().replace(/\s+/g, ' ').slice(0, 90)}`);
  }
}
if (bad.length) {
  console.error(`check:safe-top — ${bad.length} rule(s) pinned to the top edge without var(--safe-t):`);
  bad.forEach(b => console.error('  ' + b));
  console.error('Add var(--safe-t) to the top padding/offset, or (if it is not at the screen top) /* safe-t: ok — <why> */.');
  process.exit(1);
}
console.log('check:safe-top ok');
