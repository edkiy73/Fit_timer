/* AppBase Core boundaries: Core is product-neutral and self-contained.
   - no product vocabulary or product brand anywhere in Core sources or the template;
   - every relative import stays inside packages/core;
   - no imports from apps/. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let bad = 0;
const ok = (name, cond, extra='') => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' FAIL ') + ' ' + name + (extra ? ' → ' + extra : ''));
};

// Legacy wire names that must stay for installed clients are documented in
// docs/appbase-preparation-roadmap.md ("Known, accepted legacy names").
const DOMAIN_WORDS = /\b(?:workouts?|exercises?|trainers?|trainees?|programs?|fitness|fittimer|progWeights|warm-?up)\b/i;
const BRAND = /Fit Timer|ru\.fittimer|fittimer99/;

function walk(dir){
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
    if(['node_modules', 'dist', 'tests'].includes(entry.name)) return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const files = walk(ROOT).filter(file => /\.(?:js|ts|json)$/.test(file) && !/package(-lock)?\.json$/.test(file));
const vocabulary = [];
const escapes = [];
for(const file of files){
  const rel = path.relative(ROOT, file);
  const source = fs.readFileSync(file, 'utf8');
  const word = source.match(DOMAIN_WORDS) || source.match(BRAND);
  if(word) vocabulary.push(`${rel} (${word[0]})`);
  for(const m of source.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)|from\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)){
    const spec = m[1] || m[2] || m[3];
    const target = path.resolve(path.dirname(file), spec);
    if(!target.startsWith(ROOT + path.sep)) escapes.push(`${rel} -> ${spec}`);
    else if(!['', '.js', '.json', '.ts'].some(ext => fs.existsSync(target + ext) || fs.existsSync(target.replace(/\.js$/, '.ts')))){
      escapes.push(`${rel} -> ${spec} (unresolved)`);
    }
  }
}
ok('Core has no product vocabulary or brand', vocabulary.length === 0, vocabulary.join(', '));
ok('Core imports stay inside packages/core and resolve', escapes.length === 0, escapes.join(', '));

console.log(bad ? `\nCore boundary failures: ${bad}` : '\nCore boundaries are clean');
process.exit(bad ? 1 : 0);
