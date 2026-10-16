import {chromium} from 'playwright';
import fs from 'node:fs';
import {open,VIEWS,ctxInfo} from './lib.mjs';
// usage: node sec.mjs <lang> <width> <shard i/n> [maxClicks]
const [,, lang='ru', wArg='390', shard='0/1', maxClicks='20']=process.argv;
const [si,sn]=shard.split('/').map(Number);
const [w,h]=VIEWS.find(v=>v[0]===+wArg);
const SKIP=/^(closeSheet|logout|oauth|undo|wSlide|setLang|reload|toWelcome|k7del)$/;
const disc=JSON.parse(fs.readFileSync('out/discovered.json'));
const bases=[...disc.screens.filter(x=>(x.id[0]!=='!'&&!/^A0|^A04X/.test(x.id))||x.id==='A01'),...disc.gos].filter((_,i)=>i%sn===si);
const b=await chromium.launch();
const SEC=`(()=>{const out=[];const B=window.__secBase;const cnt=s=>document.querySelectorAll(s).length;
 const path=e=>{const a=[];for(let n=e;n&&n.nodeType===1&&a.length<4;n=n.parentElement)a.unshift(n.tagName.toLowerCase()+(n.id?'#'+n.id:'')+(n.classList.length?'.'+[...n.classList].slice(0,2).join('.'):''));return a.join('>');};
 const hits=[...new Set(window.__xssHits||[])];if(hits.length){const m=FT_QA.hostileIds();out.push({kind:'XSS_EXECUTED',detail:hits.map(i=>i+':'+(m[i]||'?')).join(',')});}
 for(const s of ['script','iframe','object','embed','base','frame','meta:not([charset]):not([name=viewport]):not([name=theme-color]):not([name=robots])','style','link[rel=stylesheet]','form[action]','svg[onload]','img[src=x]','[id^=brk]','input[autofocus]:not(.inp)','details[open]']){const n=cnt(s);if(n>(B[s]||0))out.push({kind:'INJECTED_ELEMENT',detail:s+' +'+(n-(B[s]||0))});}
 const all=document.querySelectorAll('body *');
 for(const e of all){if(e.closest('#qa,#qaFab'))continue;for(const a of e.attributes){const nm=a.name.toLowerCase(),v=a.value;
   if(/^on/.test(nm))out.push({kind:'EVENT_HANDLER_ATTR',detail:path(e)+' '+nm+'='+v.slice(0,50)});
   else if(/^(href|src|action|formaction|xlink:href|data|poster)$/.test(nm)&&/^\\s*(javascript|vbscript|data:text\\/html)/i.test(v))out.push({kind:'DANGEROUS_URL_ATTR',detail:path(e)+' '+nm+'='+v.slice(0,60)});
   else if(nm==="style"&&/background:\\s*red/.test(v))out.push({kind:'INJECTED_STYLE',detail:path(e)+' '+v.slice(0,50)});}}
 const kids=[...document.body.children].map(e=>e.tagName+'#'+e.id).join(',');if(kids!==B.kids)out.push({kind:'BODY_STRUCTURE_CHANGED',detail:kids.slice(0,100)});
 if(cnt('main#main')!==1||cnt('#sheet')!==1)out.push({kind:'APP_STRUCTURE_BROKEN',detail:'main='+cnt('main#main')+' sheet='+cnt('#sheet')});
 if(/Экран не загрузился|The screen did not load/.test(document.querySelector('#main')?.textContent||''))out.push({kind:'SCREEN_CRASH',detail:'error fallback shown'});
 // raw markup leaking as live elements inside text containers
 for(const e of document.querySelectorAll('#main .md *,#main .post b, #main h1 *, #main h2 *, #sheet h2 *, #dialog h2 *, #toasts .tx *')){if(/^(SCRIPT|IMG|IFRAME|SVG|STYLE|META|A|INPUT|DETAILS|OBJECT)$/i.test(e.tagName)&&!e.closest('.md a[data-act=mdLink]')&&!(e.tagName==='A'&&e.dataset.act==='mdLink'))out.push({kind:'LIVE_ELEMENT_IN_TEXT',detail:path(e)});}
 return out;})()`;
let p;const results=[];let errIdx=0;
async function boot(){
  if(p){try{await p.context().close();}catch(_){}}
  p=await open(b,{w,h,lang,nosp:false});p.setDefaultTimeout(12000);errIdx=0;
  await p.evaluate(()=>{const c=s=>document.querySelectorAll(s).length;window.__secBase={};for(const s of ['script','iframe','object','embed','base','frame','meta:not([charset]):not([name=viewport]):not([name=theme-color]):not([name=robots])','style','link[rel=stylesheet]','form[action]','svg[onload]','img[src=x]','[id^=brk]','input[autofocus]:not(.inp)','details[open]'])window.__secBase[s]=c(s);window.__secBase.kids=[...document.body.children].map(e=>e.tagName+'#'+e.id).join(',');FT_QA.hostile(true);});
}
await boot();
const OUTF=`out/s-${lang}-${w}-${si}of${sn}.jsonl`;fs.writeFileSync(OUTF,'');
const SIG=`(()=>{const m=new Map();document.querySelectorAll('#main [data-act],#ctx [data-act],#sheet.on [data-act]').forEach(e=>{if(e.disabled||!(e.getClientRects().length))return;const k=[e.dataset.act,e.dataset.v||'',e.dataset.id||'',e.dataset.k||''].join('|');if(!m.has(k))m.set(k,{act:e.dataset.act,v:e.dataset.v||'',id:e.dataset.id||'',k:e.dataset.k||'',inSheet:!!e.closest('#sheet')});});return [...m.values()];})()`;
const CLICK=`(s=>{const els=[...document.querySelectorAll('#main [data-act],#ctx [data-act],#sheet.on [data-act],#dialog.on [data-r]')].filter(e=>!e.disabled&&e.dataset.act===s.act&&(e.dataset.v||'')===s.v&&(e.dataset.id||'')===s.id&&(e.dataset.k||'')===s.k);if(!els.length)return false;els[0].click();return true;})`;
const lab=s=>`${s.act}${s.v?':'+s.v:''}${s.id?'#'+s.id:''}`;
async function reset(base){try{await p.evaluate(({id,pp})=>FT_QA.go(id,pp),base);}catch(e){await boot();await p.evaluate(({id,pp})=>FT_QA.go(id,pp),base);}await p.waitForTimeout(420);}
async function record(base,via,before){
  const info=await ctxInfo(p);const f=await p.evaluate(SEC);
  const errs=p.errs.slice(errIdx);errIdx=p.errs.length;
  for(const e of errs)if(!/ERR_FILE|Failed to load|favicon|net::ERR/.test(e))f.push({kind:'JS_ERROR',detail:e.slice(0,160)});
  for(const x of f)results.push({lang,w,key:`${base.id}${JSON.stringify(base.pp)}`,via,...info,...x});
  return info;
}
for(const base of bases){
  const before=results.length;
  try{
    await reset(base);await record(base,'');
    const sigs=(await p.evaluate(SIG)).filter(s=>!SKIP.test(s.act)).slice(0,+maxClicks);
    for(const s of sigs){
      let ok=false;try{ok=await p.evaluate(`${CLICK}(${JSON.stringify(s)})`);}catch(e){await reset(base);continue;}
      if(!ok)continue;await p.waitForTimeout(350);
      const info=await record(base,lab(s));
      if(info.dialog){await p.evaluate(()=>{const e=document.querySelector('#dialog.on [data-r="1"]');e&&e.click();});await p.waitForTimeout(350);await record(base,lab(s)+' > confirm');}
      if(info.sheet){
        const sub=(await p.evaluate(SIG)).filter(x=>x.inSheet&&!SKIP.test(x.act)).slice(0,6);
        for(const c of sub){await reset(base);try{await p.evaluate(`${CLICK}(${JSON.stringify(s)})`);}catch(e){continue;}await p.waitForTimeout(350);let ok2=false;try{ok2=await p.evaluate(`${CLICK}(${JSON.stringify(c)})`);}catch(e){}if(!ok2)continue;await p.waitForTimeout(350);await record(base,`${lab(s)} > ${lab(c)}`);}
      }
      await reset(base);
    }
  }catch(e){console.log('BASE FAIL',base.id,String(e).slice(0,100));await boot();}
  fs.appendFileSync(OUTF,results.slice(before).map(x=>JSON.stringify(x)).join('\n')+(results.length>before?'\n':''));
  console.log(si,base.id,JSON.stringify(base.pp),'findings',results.length);
}
await b.close();console.log('DONE');
