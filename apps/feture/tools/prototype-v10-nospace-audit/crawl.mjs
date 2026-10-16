import {chromium} from 'playwright';
import fs from 'node:fs';
import {open,DETECT,ctxInfo,VIEWS} from './lib.mjs';
// usage: node crawl.mjs <lang> <width> <shard i/n> [scheme] [persona]
const [,, lang='ru', wArg='390', shard='0/1', scheme='light', persona='full']=process.argv;
const [si,sn]=shard.split('/').map(Number);
const [w,h]=VIEWS.find(v=>v[0]===+wArg);
const SKIP=/^(closeSheet|logout|oauth|undo|wSlide|setLang|reload|toWelcome|k7del)$/;
const disc=JSON.parse(fs.readFileSync('out/discovered.json'));
const bases=[...disc.screens.filter(x=>(x.id[0]!=='!'&&!/^A0|^A04X/.test(x.id))||x.id==='A01'),...disc.gos].filter((_,i)=>i%sn===si);
const b=await chromium.launch();
let p=await open(b,{w,h,lang,scheme,persona});p.setDefaultTimeout(12000);
const OUTF=`out/c-${lang}-${w}-${scheme}-${persona}-${si}of${sn}.jsonl`;fs.writeFileSync(OUTF,'');
const relaunch=async()=>{try{await p.context().close();}catch(_){}p=await open(b,{w,h,lang,scheme,persona});p.setDefaultTimeout(12000);};
const SIG=`(()=>{const m=new Map();document.querySelectorAll('#main [data-act],#ctx [data-act],#sheet.on [data-act]').forEach(e=>{if(e.disabled||!(e.getClientRects().length))return;const k=[e.dataset.act,e.dataset.v||'',e.dataset.id||'',e.dataset.k||''].join('|');if(!m.has(k))m.set(k,{act:e.dataset.act,v:e.dataset.v||'',id:e.dataset.id||'',k:e.dataset.k||'',inSheet:!!e.closest('#sheet'),txt:(e.textContent||'').trim().slice(0,20)});});return [...m.values()];})()`;
const CLICK=`(s=>{const els=[...document.querySelectorAll('#main [data-act],#ctx [data-act],#sheet.on [data-act]')].filter(e=>!e.disabled&&e.dataset.act===s.act&&(e.dataset.v||'')===s.v&&(e.dataset.id||'')===s.id&&(e.dataset.k||'')===s.k);if(!els.length)return false;els[0].click();return true;})`;
const settle=()=>p.waitForTimeout(380);
async function reset(base){
  try{await p.evaluate(({id,pp})=>FT_QA.go(id,pp),base);}catch(e){await relaunch();await p.evaluate(({id,pp})=>FT_QA.go(id,pp),base);}
  await p.waitForTimeout(450);
}
let results=[];
async function record(base,via){
  const info=await ctxInfo(p);const f=await p.evaluate(DETECT);
  for(const x of f)results.push({lang,w,h,scheme,persona,key:`${base.id}${JSON.stringify(base.pp)}`,via,...info,...x});
  return info;
}
const lab=s=>`${s.act}${s.v?':'+s.v:''}${s.id?'#'+s.id:''}`;
let n=0;
for(const base of bases){
  const before=results.length;
  try{
    await reset(base);
    await record(base,'');
    const sigs=(await p.evaluate(SIG)).filter(s=>!SKIP.test(s.act)).slice(0,26);
    for(const s of sigs){
      let ok=false;try{ok=await p.evaluate(`${CLICK}(${JSON.stringify(s)})`);}catch(e){await reset(base);continue;}
      if(!ok)continue;await settle();n++;
      const info=await record(base,lab(s));
      if(info.sheet){
        const sub=(await p.evaluate(SIG)).filter(x=>x.inSheet&&!SKIP.test(x.act)).slice(0,10);
        for(const c of sub){
          await reset(base);try{await p.evaluate(`${CLICK}(${JSON.stringify(s)})`);}catch(e){continue;}await settle();
          let ok2=false;try{ok2=await p.evaluate(`${CLICK}(${JSON.stringify(c)})`);}catch(e){}
          if(!ok2)continue;await settle();n++;await record(base,`${lab(s)} > ${lab(c)}`);
        }
      }
      await reset(base);
    }
  }catch(e){console.log('BASE FAIL',base.id,String(e).slice(0,100));results.push({lang,w,h,key:base.id,kind:'HARNESS_ERROR',err:String(e).slice(0,160)});await relaunch();}
  fs.appendFileSync(OUTF,results.slice(before).map(x=>JSON.stringify(x)).join('\n')+(results.length>before?'\n':''));
  console.log(si,base.id,JSON.stringify(base.pp),'clicks',n,'findings',results.length);
}
await b.close();
console.log('DONE');
