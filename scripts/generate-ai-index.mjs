import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CHECK = process.argv.includes('--check');
const ROOTS = ['src/app', 'src/html'];
const OUTPUT = '.ai/symbol-index.json';

async function walk(dir){
  const out = [];
  for(const ent of await readdir(dir, {withFileTypes:true})){
    const p = path.posix.join(dir, ent.name);
    if(ent.isDirectory()) out.push(...await walk(p));
    else if(/\.(js|html)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function uniq(values){
  return [...new Set(values)].sort((a,b)=>a.localeCompare(b));
}

function jsSymbols(source){
  const out = [];
  const patterns = [
    /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g,
    /\bclass\s+([A-Za-z_$][\w$]*)\b/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g
  ];
  for(const re of patterns){
    let m;
    while((m = re.exec(source))) out.push(m[1]);
  }
  const actions = /\bACTIONS\.([A-Za-z_$][\w$]*)\s*=/g;
  let m;
  while((m = actions.exec(source))) out.push(`ACTIONS.${m[1]}`);
  return uniq(out);
}

function attrValues(source, attr){
  const out = [];
  const pattern = attr === 'id'
    ? /\bid=["']([^"']+)["']/g
    : /\bdata-act=["']([^"']+)["']/g;
  let m;
  while((m = pattern.exec(source))) out.push(m[1]);
  return uniq(out);
}

const sourceFiles = (await Promise.all(ROOTS.map(walk)))
  .flat()
  .sort((a,b)=>a.localeCompare(b));

const index = {
  version: 1,
  generatedBy: 'scripts/generate-ai-index.mjs',
  scope: ['src/app/**/*.js', 'src/html/**/*.html'],
  files: {}
};

for(const file of sourceFiles){
  const source = await readFile(file, 'utf8');
  const entry = {
    kind: file.startsWith('src/app/') ? 'frontend-js' : 'frontend-html',
    lines: source.split('\n').length,
    chars: source.length
  };

  if(file.endsWith('.js')){
    const symbols = jsSymbols(source);
    if(symbols.length) entry.symbols = symbols;
  }else{
    const ids = attrValues(source, 'id');
    const actions = attrValues(source, 'data-act');
    if(ids.length) entry.ids = ids;
    if(actions.length) entry.actions = actions;
  }
  index.files[file] = entry;
}

const next = JSON.stringify(index, null, 2) + '\n';

if(CHECK){
  const current = await readFile(OUTPUT, 'utf8').catch(()=>'');
  if(current !== next){
    console.error(`${OUTPUT} is stale. Run: npm run ai:index`);
    process.exit(1);
  }
  console.log(`${OUTPUT}: up to date`);
}else{
  await writeFile(OUTPUT, next, 'utf8');
  console.log(`wrote ${OUTPUT} (${sourceFiles.length} files)`);
}
