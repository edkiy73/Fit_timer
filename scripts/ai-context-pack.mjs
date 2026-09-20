import { readFile, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const writeMode = args.includes('--write');
const task = args.filter(x => x !== '--write').join(' ').trim();

if(!task){
  console.error('Usage: npm run ai:context -- "task description" [--write]');
  process.exit(2);
}

const router = JSON.parse(await readFile('.ai/feature-router.json','utf8'));
const symbolIndex = JSON.parse(await readFile('.ai/symbol-index.json','utf8'));

function norm(value){
  return String(value || '').toLowerCase().replace(/ё/g,'е');
}

function routeScore(route){
  const q = norm(task);
  const tokens = new Set(q.split(/[^a-zа-я0-9_]+/i).filter(Boolean));
  let total = 0;
  const hits = [];
  for(const raw of route.keywords || []){
    const kw = norm(raw);
    if(q.includes(kw)){
      total += kw.includes(' ') ? 6 : Math.max(2, Math.min(5, kw.length / 4));
      hits.push(raw);
      continue;
    }
    const parts = kw.split(/[^a-zа-я0-9_]+/i).filter(Boolean);
    const overlap = parts.filter(p => tokens.has(p)).length;
    if(overlap){
      total += overlap;
      hits.push(raw);
    }
  }
  return {route,total,hits:[...new Set(hits)]};
}

const ranked = router.routes.map(routeScore).filter(x => x.total > 0).sort((a,b)=>b.total-a.total);
const chosen = ranked[0] || null;

const stop = new Set(['и','в','на','не','что','как','для','с','со','по','из','у','а','но','или','это','the','a','an','to','of','in','on','for','with','is','it','and','or','not']);
const terms = [...new Set(norm(task).split(/[^a-zа-я0-9_]+/i).filter(x => x.length >= 3 && !stop.has(x)))];

async function exists(file){
  try { return (await stat(file)).isFile(); } catch { return false; }
}

function excerptMatches(source, radius=8, maxBlocks=3, maxLines=90){
  const lines = source.split('\n');
  const matches = [];
  for(let i=0;i<lines.length;i++){
    const line = norm(lines[i]);
    if(terms.some(t => line.includes(t))) matches.push(i);
  }
  if(!matches.length) return '';

  const ranges = [];
  for(const idx of matches){
    const start = Math.max(0, idx-radius);
    const end = Math.min(lines.length-1, idx+radius);
    const prev = ranges[ranges.length-1];
    if(prev && start <= prev[1] + 2) prev[1] = Math.max(prev[1], end);
    else ranges.push([start,end]);
    if(ranges.length >= maxBlocks) break;
  }

  let used = 0;
  const blocks = [];
  for(const [start,end] of ranges){
    const block = [];
    for(let i=start;i<=end && used<maxLines;i++,used++){
      block.push(String(i+1).padStart(5,' ') + ' | ' + lines[i]);
    }
    blocks.push(block.join('\n'));
    if(used >= maxLines) break;
  }
  return blocks.join('\n...\n');
}

function relevantSymbols(file){
  const list = symbolIndex.files?.[file]?.symbols || [];
  const q = norm(task);
  return list.map(name => {
    const n = norm(name);
    let score = q.includes(n) ? 10 : 0;
    for(const t of terms) if(n.includes(t) || t.includes(n)) score += 2;
    return {name,score};
  }).sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name)).slice(0,18).map(x=>x.name);
}

function safeGit(args){
  try{
    return execFileSync('git', args, {encoding:'utf8', stdio:['ignore','pipe','ignore']}).trim();
  }catch{
    return '';
  }
}

const route = chosen?.route || null;
const routeFiles = route?.files || [];
const tests = route?.tests || [];
const docs = route?.docs || [];
const allFiles = [...new Set([...routeFiles,...tests,...docs])];

const out = [];
out.push('# FitTimer AI context pack','');
out.push('Task: ' + task,'');
if(route){
  out.push('Route: ' + route.id);
  if(chosen.hits.length) out.push('Route hits: ' + chosen.hits.join(', '));
  if(route.notes) out.push('Route note: ' + route.notes);
}else{
  out.push('Route: none (use symbol index / repository search)');
}
out.push('');

if(route?.checks?.length){
  out.push('Suggested checks:');
  for(const c of route.checks) out.push('- ' + c);
  out.push('');
}

out.push('Files:');
for(const f of routeFiles) out.push('- ' + f);
if(tests.length){
  out.push('Tests:');
  for(const f of tests) out.push('- ' + f);
}
if(docs.length){
  out.push('Docs:');
  for(const f of docs) out.push('- ' + f);
}
out.push('');

for(const file of routeFiles){
  if(!(await exists(file))) continue;
  const source = await readFile(file,'utf8').catch(()=>null);
  if(source == null || source.length > 1500000) continue;

  out.push('## ' + file);
  const symbols = relevantSymbols(file);
  if(symbols.length) out.push('Relevant symbols: ' + symbols.join(', '));

  const excerpt = excerptMatches(source);
  if(excerpt){
    out.push('~~~text', excerpt, '~~~');
  }else{
    out.push('(No direct task-term matches; use symbol index before opening the whole file.)');
  }
  out.push('');
}

const concrete = allFiles.filter(f => !f.endsWith('/') && !f.includes('*'));
if(concrete.length){
  const log = safeGit(['log','-5','--oneline','--',...concrete]);
  if(log) out.push('## Recent commits touching routed files','~~~text',log,'~~~','');

  const diff = safeGit(['diff','--unified=8','HEAD','--',...concrete]);
  if(diff){
    const lines = diff.split('\n');
    out.push('## Current diff for routed files','~~~diff',lines.slice(0,320).join('\n'));
    if(lines.length > 320) out.push('... diff clipped ...');
    out.push('~~~','');
  }
}

out.push('## Agent instruction');
out.push('Diagnose from this pack first. Open additional source only when a specific missing fact blocks the fix. Do not reread generated root app.js/style.css/index.html.');

const output = out.join('\n') + '\n';
if(writeMode){
  await writeFile('.ai/context-pack.md', output, 'utf8');
  console.log('wrote .ai/context-pack.md');
}else{
  process.stdout.write(output);
}
