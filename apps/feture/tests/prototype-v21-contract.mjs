/* V21 keeps every V20 rule (and through it V13, V14, V18, V19): the V20 contract runs against the V21 file.
   Rules that V21 changes on purpose are swapped below with the reason, then the V21 checks run. */
import fs from 'node:fs';import { fileURLToPath, pathToFileURL } from 'node:url';
const base=fs.readFileSync(new URL('./prototype-v20-contract.mjs',import.meta.url),'utf8');
const swap=(s,a,b)=>{if(!s.includes(a))throw new Error('V20 contract changed: '+a);return s.replace(a,b);};
/* rules inside the older contracts the V20 one reads at run time (V13 via V14): swapped as those files are read */
const deepSwaps=[];const readFile=fs.readFileSync;fs.readFileSync=function(f,...r){let t=readFile.call(this,f,...r);const n=String(f?.href||f);if(typeof t==='string')for(const [file,x,y] of deepSwaps)if(n.endsWith('/'+file))t=swap(t,x,y);return t;};
/* V21 (PRF-001): a block belongs to the profile that made it — the couple loses the person (and the partner is told) only when the block is made as «Мы» */
deepSwaps.push(['prototype-v13-contract.mjs',`run("coupleProfile();S.pair.notifications={};social('couple').likesIn=[{p:'ari',t:1}];doBlock('ari')")`,`run("coupleProfile();S.pair.notifications={};social('couple').likesIn=[{p:'ari',t:1}];withActor('couple',()=>doBlock('ari'))")`]);
/* V21 (PPL-009): Q01 no longer has its own on/off switch — it links to the three-way mode in the couple's «Я → Видимость» (ACT.pairDating stays and is still checked) */
deepSwaps.push(['prototype-v13-contract.mjs',`prepare('Q01');run("coupleProfile()");assert.ok(run("SC.Q01.render({},cur())").includes('data-act="pairDating"'));`,`prepare('Q01');run("coupleProfile()");assert.ok(run("SC.Q01.render({},cur())").includes('data-act="pairVisOpen"'));`]);
let src=swap(base,"new URL('../public/prototype-v20.html',import.meta.url).href","new URL('../public/prototype-v21.html',import.meta.url).href");
// the derived contract lives next to the others for one run, so its relative imports keep working
const tmp=new URL(`./.v21-run-${process.pid}.mjs`,import.meta.url);
fs.writeFileSync(tmp,src);
try{await import(tmp.href);}finally{fs.rmSync(fileURLToPath(tmp),{force:true});}
console.log('PASS V20 rules in V21');
