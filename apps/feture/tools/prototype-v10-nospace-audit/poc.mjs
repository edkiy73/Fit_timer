import {chromium} from 'playwright';
import {open} from './lib.mjs';
const b=await chromium.launch();
const mk=async()=>{const p=await open(b,{w:390,h:844,lang:'ru',nosp:false});p.setDefaultTimeout(10000);return p;};
const go=async(p,id,pp={})=>{await p.evaluate(({id,pp})=>FT_QA.go(id,pp),{id,pp});await p.waitForTimeout(600);};
const setv=(p,name,v)=>p.evaluate(({name,v})=>{const e=document.querySelector(`[name="${name}"]`);const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));},{name,v});
const rte=(p,v,n=0)=>p.evaluate(({v,n})=>{const e=document.querySelectorAll('.rte-ed')[n];e.focus();document.execCommand('selectAll');document.execCommand('insertText',false,v);},{v,n});
const click=async(p,a,v)=>{await p.evaluate(({a,v})=>{const e=[...document.querySelectorAll('#sheet.on [data-act],#dialog.on [data-r],#main [data-act]')].find(x=>x.dataset.act===a&&(v==null||(x.dataset.v||'')===v)&&!x.disabled);e&&e.click();},{a,v});await p.waitForTimeout(500);};
const hits=p=>p.evaluate(()=>[...new Set(window.__xssHits||[])]);
const X=t=>`<img src=x onerror=__x('${t}')>`;
const res=[];const note=async(n,p,extra='')=>{const h=await hits(p);res.push([n,h.length?'EXECUTED '+h.join(','):'no execution',extra]);console.log(n.padEnd(52),h.length?'EXECUTED '+h.join(','):'no execution',extra);};
// A: community name -> sheet title + leave dialog (viewed by anyone who opens the community)
{const p=await mk();await go(p,'C08');await setv(p,'name',X('A-name'));await rte(p,'Описание сообщества достаточно длинное для создания.');await setv(p,'rules','Правило один\nПравило два');
 await click(p,'c8Topic');await click(p,'c8Save');await p.waitForTimeout(2500);
 const id=await p.evaluate(()=>FT_QA.screen());await go(p,'C01',{sub:'joined'});await note('A1 community name in list (typed)',p);
 let cid=null;for(const sub of ['joined','discover']){await go(p,'C01',{sub});cid=await p.evaluate(()=>{const e=[...document.querySelectorAll('[data-go=C03]')].find(x=>x.textContent.includes('<img src=x'));return e?JSON.parse(e.dataset.p||'{}').id:null});if(cid)break;}
 console.log('   new community id',cid);if(cid)await go(p,'C03',{id:cid});
 await click(p,'cMenu');await note('A2 community name in menu sheet title (typed)',p);
 await p.context().close();}
// B: event title -> organiser announce sheet / cancel sheet
{const p=await mk();await go(p,'E11');await setv(p,'title',X('B-title'));await rte(p,'Описание события достаточно подробное чтобы пройти проверку длины.');await p.evaluate(()=>{const t=document.querySelector('[data-act=evfType]');t&&t.click();});await p.waitForTimeout(300);
 for(let s=0;s<5;s++){await p.evaluate(()=>{document.querySelector('[data-act=evFormat][data-v=online]')?.click();});await p.waitForTimeout(250);
  await p.evaluate(()=>{for(const e of document.querySelectorAll('input[type=date]')){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2026-12-20');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}for(const e of document.querySelectorAll('input[type=time]')){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'18:00');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}});
  await p.evaluate(()=>{const e=document.querySelector('[name=link]');if(e){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'https://meet.example.com/x');e.dispatchEvent(new Event('input',{bubbles:true}));}});
  const nx=await p.evaluate(()=>!!document.querySelector('[data-act=evfNext]'));if(!nx){await click(p,'evfSubmit');break;}await click(p,'evfNext');}
 await p.waitForTimeout(2500);await go(p,'E10');await note('B1 event title in My events list (typed)',p);
 const eid=await p.evaluate(()=>{const e=[...document.querySelectorAll('[data-go]')].find(x=>/E03|E15/.test(x.dataset.go));return e?e.dataset.go+' '+(e.dataset.p||''):null});console.log('   event link',eid);
 const m=eid&&eid.match(/"id":"(\w+)"/);if(m){await go(p,'E15',{id:m[1]});await note('B2 event title on organiser panel (typed)',p);await click(p,'announce');await note('B3 event title in announce sheet (typed)',p);await go(p,'E15',{id:m[1]});await click(p,'evCancel');await note('B4 event title in cancel sheet (typed)',p);}
 await p.context().close();}
// C: discussion title -> bar h1 / lists
{const p=await mk();await go(p,'C07',{id:'rope'});await setv(p,'title',X('C-title'));await rte(p,'Текст обсуждения достаточно длинный для публикации.');await click(p,'cdPost');await p.waitForTimeout(2500);await go(p,'C03',{id:'rope'});await note('C1 discussion title in community list (typed)',p);
 await p.evaluate(()=>{const e=[...document.querySelectorAll('button.disc')][0];e&&e.click();});await p.waitForTimeout(700);await note('C2 discussion title in discussion screen (typed)',p);await p.context().close();}
// D: custom city name -> profile row, K06 sessions, event cards
{const p=await mk();await go(p,'P02');await click(p,'peCity');await p.waitForTimeout(500);
 await p.evaluate(({v})=>{const e=document.querySelector('#sheet.on input');if(e){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));}},{v:X('D-city')});await p.waitForTimeout(400);
 const btn=await p.evaluate(()=>[...document.querySelectorAll('#sheet.on [data-act]')].map(e=>e.dataset.act).join(','));console.log('   city sheet acts:',btn);
 await p.evaluate(()=>{document.querySelector('#sheet.on [data-act=typedCityStart]')?.click();});await p.waitForTimeout(400);await p.evaluate(()=>{const b=document.querySelector('#sheet.on [data-act=typedCity]');b&&b.click();});await p.waitForTimeout(700);
 await note('D1 custom city name in profile editor (typed)',p);await go(p,'K06');await note('D2 custom city in sessions list K06 (typed)',p);await go(p,'X01');await note('D3 custom city on Me hub (typed)',p);await p.context().close();}
// E: markdown / rich text sinks (post body, bio) must stay inert
{const p=await mk();await go(p,'F07',{type:'text'});await rte(p,`[x](javascript:__x('E1')) <img src=x onerror=__x('E2')> [y](https://e.x/a"onmouseover="__x('E3')) <a href="javascript:__x('E4')">l</a> **b**`);await click(p,'publishNow');await p.waitForTimeout(2300);await go(p,'F01',{sub:'foryou'});
 const links=await p.evaluate(()=>[...document.querySelectorAll('.post .md a')].map(a=>a.getAttribute('href')));console.log('   rendered links',links);await note('E1 post body markdown/HTML payloads (typed)',p);
 await p.evaluate(()=>{const a=document.querySelector('.post .md a[data-act=mdLink]');a&&a.click();});await p.waitForTimeout(400);await note('E2 click on rendered link',p);await p.context().close();}
await b.close();
