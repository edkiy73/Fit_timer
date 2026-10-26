/* V21 keeps every V20 rule (and through it V13, V14, V18, V19): the V20 contract runs against the V21 file.
   Rules that V21 changes on purpose are swapped below with the reason, then the V21 checks run. */
import fs from 'node:fs';import { fileURLToPath, pathToFileURL } from 'node:url';
const base=fs.readFileSync(new URL('./prototype-v20-contract.mjs',import.meta.url),'utf8');
const swap=(s,a,b)=>{if(!s.includes(a))throw new Error('V20 contract changed: '+a);return s.replace(a,b);};
let src=swap(base,"new URL('../public/prototype-v20.html',import.meta.url).href","new URL('../public/prototype-v21.html',import.meta.url).href");
// the derived contract lives next to the others for one run, so its relative imports keep working
const tmp=new URL(`./.v21-run-${process.pid}.mjs`,import.meta.url);
fs.writeFileSync(tmp,src);
try{await import(tmp.href);}finally{fs.rmSync(fileURLToPath(tmp),{force:true});}
console.log('PASS V20 rules in V21');
