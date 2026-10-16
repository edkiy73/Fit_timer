import {chromium} from 'playwright';
import fs from 'node:fs';
import {open} from './lib.mjs';
const b=await chromium.launch();
const p=await open(b,{w:390,h:844,lang:'ru'});
const list=await p.evaluate(()=>FT_QA.list().flatMap(([g,items])=>items.map(([id,l,pp])=>({id,pp:pp||{}}))));
const screens=new Map(),acts=new Map(),gos=new Map();
const key=(id,pp)=>id+JSON.stringify(pp);
list.forEach(x=>screens.set(key(x.id,x.pp),x));
const harvest=async(from)=>p.evaluate(()=>{const o=[];document.querySelectorAll('#main [data-act],#main [data-go],#ctx [data-go],#ctx [data-act],#sheet.on [data-act],#sheet.on [data-go]').forEach(e=>{o.push({act:e.dataset.act||null,go:e.dataset.go||null,v:e.dataset.v||null,id:e.dataset.id||null,pp:e.dataset.p||null,txt:(e.textContent||'').trim().slice(0,24),in:e.closest('#sheet')?'sheet':e.closest('#ctx')?'ctx':'main'})});return o;});
for(const x of [...screens.values()]){
  if(x.id[0]==='!')continue;
  await p.evaluate(({id,pp})=>FT_QA.go(id,pp),x);await p.waitForTimeout(500);
  for(const e of await harvest()){
    if(e.act){const k=e.act+'|'+(e.v||'')+'|'+(e.id||'');acts.set(k,(acts.get(k)||0)+1);}
    if(e.go&&e.in==='main'){let pp={};try{pp=e.pp?JSON.parse(e.pp):e.id?{id:e.id}:{}}catch(_){}const k=key(e.go,pp);if(!screens.has(k)&&!gos.has(k))gos.set(k,{id:e.go,pp});}
  }
}
console.log('acts',acts.size,'new gos',gos.size);
fs.writeFileSync('out/discovered.json',JSON.stringify({screens:[...screens.values()],gos:[...gos.values()],acts:[...acts.keys()]},null,1));
await b.close();
