import {chromium} from 'playwright';
import {open,URL_} from './lib.mjs';
const b=await chromium.launch();
const mk=async(qs,hash)=>{const ctx=await b.newContext({viewport:{width:390,height:844}});await ctx.route(/fonts\./,r=>r.abort());const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.addInitScript(()=>{window.__x=i=>{(window.__xssHits=window.__xssHits||[]).push(i);};});await p.goto(URL_+qs+hash);await p.waitForTimeout(800);return {p,errs,ctx};};
const P=`<img src=x onerror=__x('U')>`,Q=encodeURIComponent(P);
const cases=[['?persona=full&lang=ru','#P01:'+Q],['?persona=full&lang=ru','#E03:'+Q],['?persona=full&lang=ru','#C03:'+Q],['?persona=full&lang=ru','#'+Q],['?persona=full&lang=ru','#F05:'+encodeURIComponent('"><svg onload=__x(1)>')],['?persona='+Q+'&lang=ru',''],['?persona=full&lang='+Q,''],['?persona=full&lang=ru&restart='+Q,''],['?persona=full&lang=ru&long='+Q+'&hostile=0','#A01'],['?persona=full&lang=ru','#P01:..%2F..%2F'+Q+'%00']];
for(const [qs,h] of cases){const {p,errs,ctx}=await mk(qs,h);
 const r=await p.evaluate(()=>({hits:window.__xssHits||[],title:document.title,scr:window.FT_QA?.screen?.(),img:document.querySelectorAll('img[src=x]').length,txt:(document.querySelector('#main')?.innerText||'').slice(0,50).replace(/\n/g,' ')}));
 console.log((qs+h).slice(0,70).padEnd(72),'hits',r.hits.length,'img',r.img,'screen',r.scr,'| title:',r.title.slice(0,40),'| errs',errs.length);await ctx.close();}
// localStorage theme injection
{const ctx=await b.newContext({viewport:{width:390,height:844}});await ctx.route(/fonts\./,r=>r.abort());const p=await ctx.newPage();await p.addInitScript(()=>{localStorage.setItem('feture-v6-theme','"><img src=x onerror=__x(1)>');window.__x=i=>{(window.__xssHits=window.__xssHits||[]).push(i);};});await p.goto(URL_+'?persona=full&lang=ru#F01');await p.waitForTimeout(700);console.log('localStorage theme injection → hits',await p.evaluate(()=>window.__xssHits||[]),'data-theme=',await p.evaluate(()=>document.documentElement.getAttribute('data-theme')));await ctx.close();}
await b.close();
