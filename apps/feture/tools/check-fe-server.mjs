// FetUre server guard (owner, 28.10.2026 — server/README.md): every contract action has a handler and the other way
// round; every action is called by some test; no helper is defined twice across server/commands. Gaps that exist
// today are in tools/fe-server-baseline.json and may only shrink.
//   node tools/check-fe-server.mjs           — fail on anything new
//   node tools/check-fe-server.mjs --update  — after closing gaps, shrink the baseline
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const BASE = join(ROOT, 'tools/fe-server-baseline.json');
const read = p => readFileSync(join(ROOT, p), 'utf8');
const ls = (d, re) => readdirSync(join(ROOT, d)).filter(f => re.test(f)).map(f => join(d, f));

const actions = new Set();
for (const f of ls('contracts', /\.mjs$/)) for (const m of read(f).matchAll(/^\s+'([a-z][A-Za-z]*\.[A-Za-z.]+)':\s*\{/gm)) actions.add(m[1]);
const handled = new Set();const defs = {};
for (const f of ls('server/commands', /\.mjs$/)) {
  const src = read(f);
  for (const m of src.matchAll(/^\s+(?:async\s+)?'([a-z][A-Za-z]*\.[A-Za-z.]+)'\s*(?:\(|:)/gm)) handled.add(m[1]);
  for (const m of src.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/gm)) (defs[m[1]] ??= []).push(f);
}
const tests = ls('tests', /\.mjs$/).map(read).join('\n');

const now = {
  noHandler: [...actions].filter(a => !handled.has(a)).sort(),
  noContract: [...handled].filter(a => !actions.has(a)).sort(),
  untested: [...actions].filter(a => !tests.includes(`'${a}'`)).sort(),
  duplicate: Object.entries(defs).filter(([, f]) => new Set(f).size > 1).map(([n]) => n).sort(),
};
if (process.argv.includes('--update')) { writeFileSync(BASE, JSON.stringify(now, null, 1) + '\n'); console.log('fe-server baseline written'); process.exit(0); }
const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : {};
const msgs = { noHandler: 'contract action without a handler', noContract: 'handler without a contract', untested: 'action no test calls', duplicate: 'helper defined in two command files' };
const bad = [];
for (const [k, list] of Object.entries(now)) for (const x of list) if (!(base[k] ?? []).includes(x)) bad.push(`${msgs[k]}: ${x}`);
if (bad.length) { console.error('Server kit rule broken (server/README.md):'); for (const b of bad) console.error('  ' + b); process.exit(1); }
console.log(`fe-server: ${actions.size} actions; known gaps — untested ${now.untested.length}, duplicates ${now.duplicate.length}, no handler ${now.noHandler.length}, no contract ${now.noContract.length}`);
