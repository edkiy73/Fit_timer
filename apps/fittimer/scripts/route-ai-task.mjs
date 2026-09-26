import { readFile } from 'node:fs/promises';

const query = process.argv.slice(2).join(' ').trim().toLowerCase();
if(!query){
  console.error('Usage: npm run ai:route -- "task description"');
  process.exit(2);
}

const router = JSON.parse(await readFile('.ai/feature-router.json','utf8'));

function normalize(s){
  return s.toLowerCase().replace(/ё/g,'е');
}

const q = normalize(query);
const tokens = new Set(q.split(/[^a-zа-я0-9_]+/i).filter(Boolean));

function score(route){
  let total = 0;
  const hits = [];
  for(const raw of route.keywords || []){
    const kw = normalize(raw);
    if(q.includes(kw)){
      const weight = kw.includes(' ') ? 6 : Math.max(2, Math.min(5, kw.length / 4));
      total += weight;
      hits.push(raw);
      continue;
    }
    const parts = kw.split(/[^a-zа-я0-9_]+/i).filter(Boolean);
    const overlap = parts.filter(p=>tokens.has(p)).length;
    if(overlap){
      total += overlap;
      hits.push(raw);
    }
  }
  return {route,total,hits:[...new Set(hits)]};
}

const ranked = router.routes
  .map(score)
  .filter(x=>x.total>0)
  .sort((a,b)=>b.total-a.total)
  .slice(0,3);

if(!ranked.length){
  console.log('No confident feature route. Use .ai/symbol-index.json and repository search.');
  process.exit(0);
}

for(const [i,item] of ranked.entries()){
  const r=item.route;
  console.log(`#${i+1} ${r.id}  score=${item.total.toFixed(1)}`);
  console.log(`hits: ${item.hits.join(', ')}`);
  console.log(`files: ${(r.files||[]).join(', ')}`);
  if(r.tests?.length) console.log(`tests: ${r.tests.join(', ')}`);
  if(r.docs?.length) console.log(`docs: ${r.docs.join(', ')}`);
  if(r.checks?.length) console.log(`checks: ${r.checks.join(' -> ')}`);
  if(r.notes) console.log(`notes: ${r.notes}`);
  console.log('');
}
