import {chromium} from 'playwright';
import fs from 'node:fs';
export const DIR=process.cwd();
fs.mkdirSync(DIR+'/out',{recursive:true});
const FONTS=fs.existsSync(DIR+'/fonts/onest.css');
export const VIEWS=[[320,700],[390,844],[430,932],[768,1024],[1024,768],[1440,900]];
export const URL_=process.env.V10_URL||'http://localhost:8123/prototype-v10.html';
export async function open(browser,{w=390,h=844,lang='ru',persona='full',scheme='light',nosp=true}={}){
  const ctx=await browser.newContext({viewport:{width:w,height:h},colorScheme:scheme,deviceScaleFactor:1});
  // optional: ./fonts/onest.css + woff2 files make the audit independent of Google Fonts
  if(FONTS){await ctx.route(/fonts\.googleapis\.com/,r=>r.fulfill({body:fs.readFileSync(DIR+'/fonts/onest.css'),contentType:'text/css'}));
  await ctx.route(/fonts\.gstatic\.com/,r=>r.abort());
  await ctx.route(/\/fonts\/.*\.woff2/,r=>r.fulfill({body:fs.readFileSync(DIR+'/fonts/'+r.request().url().split('/').pop()),contentType:'font/woff2'}));}
  const p=await ctx.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text())});
  p.errs=errs;
  await p.goto(`${URL_}?persona=${persona}&lang=${lang}${nosp?'&nospace=1':''}`);
  await p.evaluate(()=>document.fonts.ready);
  await p.waitForTimeout(300);
  return p;
}
/* in-page detector — returns findings for currently visible product UI */
export const DETECT=`(()=>{
const out=[];const VW=innerWidth,VH=innerHeight;
const roots=['#main','#side','#ctx','#sheet.on','#dialog.on','#toasts','#matchLayer','#viewer.on'].map(s=>document.querySelector(s)).filter(Boolean);
const vis=e=>{const cs=getComputedStyle(e);if(cs.display==='none'||cs.visibility==='hidden')return false;const r=e.getBoundingClientRect();return r.width>0||r.height>0;};
const sel=e=>{const parts=[];let n=e;for(let i=0;n&&n.nodeType===1&&i<5&&n.id!=='root';i++,n=n.parentElement){let s=n.tagName.toLowerCase();if(n.id)s+='#'+n.id;else if(n.classList.length)s+='.'+[...n.classList].slice(0,3).join('.');parts.unshift(s);if(n.id)break;}return parts.join(' > ');};
const VERT=new Set(['view','sh-b','sheet','dialog','main','ctx','side','toasts','root','stage','layer']);
const isScroller=e=>{const cs=getComputedStyle(e);if(!/(auto|scroll)/.test(cs.overflowX))return false;for(const c of e.classList)if(VERT.has(c))return false;if(e.id&&VERT.has(e.id))return false;return true;};
const inScroller=e=>{for(let n=e;n&&n.nodeType===1;n=n.parentElement){if(isScroller(n)&&n.scrollWidth>n.clientWidth+1)return n;}return null;};
const closedAncestor=e=>{for(let n=e;n;n=n.parentElement){const cs=getComputedStyle(n);if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity===0)return true;}return false;};
const seen=new Set();const add=f=>{const k=f.kind+'|'+f.sel+'|'+(f.text||'').slice(0,20);if(seen.has(k))return;seen.add(k);out.push(f);};
// 1. page / scroll containers with unintended horizontal scroll
const de=document.documentElement;
if(de.scrollWidth>VW+1)add({kind:'PAGE_HSCROLL',sel:'html',amount:de.scrollWidth-VW});
for(const r of roots){for(const e of [r,...r.querySelectorAll('.view,.sh-b,.dialog,.sheet,.ctabar,.inputbar,.bar')]){if(!vis(e))continue;if(e.scrollWidth>e.clientWidth+1&&(/(auto|scroll|hidden|clip)/.test(getComputedStyle(e).overflowX)))add({kind:'CONTAINER_HSCROLL',sel:sel(e),amount:e.scrollWidth-e.clientWidth});}}
// 2. text nodes: out of viewport / clipped / beyond own box / overlapping controls
const ctrlSel='button,a[href],input,textarea,select,.av,.pill,.chip,em,.ibtn,sup,.sw';
for(const root of roots){
 const tw=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let tn;
 while(tn=tw.nextNode()){
  if(!tn.nodeValue.trim())continue;const el=tn.parentElement;if(!el||el.closest('script,style,.qa,#qaFab,[aria-hidden="true"] svg'))continue;
  if(el.closest('#qa,#qaFab,#qaScrim'))continue;if(!vis(el)||closedAncestor(el))continue;
  const rg=document.createRange();rg.selectNodeContents(tn);const rects=[...rg.getClientRects()].filter(r=>r.width>0);if(!rects.length)continue;
  const L=Math.min(...rects.map(r=>r.left)),R=Math.max(...rects.map(r=>r.right)),T=Math.min(...rects.map(r=>r.top)),B=Math.max(...rects.map(r=>r.bottom));
  const scr=inScroller(el);if(scr&&scr.contains(el)){ // inside an intentional horizontal scroller: only flag if text is wider than the scroller's own item box? skip
    continue;}
  const txt=tn.nodeValue.trim();
  // clipping ancestor chain
  let clip=null,ell=false;
  for(let n=el;n&&n!==root.parentElement;n=n.parentElement){const cs=getComputedStyle(n);if(cs.textOverflow==='ellipsis')ell=true;
   if(/(hidden|clip)/.test(cs.overflowX)&&!/(auto|scroll)/.test(cs.overflowX)){const nr=n.getBoundingClientRect();if(R>nr.right+1||L<nr.left-1){clip=n;break;}}}
  const er=el.getBoundingClientRect();
  const beyondBox=R>er.right+1||L<er.left-1;
  const outVp=R>VW+1||L<-1;
  if(!(clip||beyondBox||outVp))continue;
  if(ell&&clip&&getComputedStyle(clip).whiteSpace==='nowrap'&&!outVp)continue; // deliberate single-line ellipsis
  let kind=outVp?'OUT_OF_VIEWPORT':clip?'CLIPPED':'OVERFLOWS_BOX';el.setAttribute('data-qa-hit','1');
  // overlap with interactive neighbours
  let overlap=null;const card=el.closest('.card,.li,.post,.cmt,.sh-h,.bar,.ctabar,.inputbar,section,article,.toast,.dialog,.msg')||el.parentElement;
  for(const c of card.querySelectorAll(ctrlSel)){if(c===el||c.contains(el)||el.contains(c)||!vis(c))continue;const cr=c.getBoundingClientRect();
   const ix=Math.min(R,cr.right)-Math.max(L,cr.left),iy=Math.min(B,cr.bottom)-Math.max(T,cr.top);if(ix>3&&iy>3){overlap=sel(c);break;}}
  add({kind:overlap?kind+'+OVERLAP':kind,sel:sel(el),text:txt.slice(0,48),amount:Math.round(Math.max(R-(clip?clip.getBoundingClientRect().right:Math.min(er.right,VW)),0)),clip:clip?sel(clip):null,overlap,rect:[Math.round(L),Math.round(T),Math.round(R),Math.round(B)]});
 }
 // 3. boxes stretching their parent / leaving the viewport (non text)
 for(const e of root.querySelectorAll('*')){
  if(e.closest('#qa,#qaFab,#qaScrim,svg,script,style')||!vis(e)||closedAncestor(e))continue;
  const cs=getComputedStyle(e);if(cs.position==='fixed'&&e.closest('.toasts')===null&&false)continue;
  const p=e.parentElement;if(!p||p===document.body)continue;
  const r=e.getBoundingClientRect(),pr=p.getBoundingClientRect();if(r.width===0)continue;
  if(inScroller(e))continue;
  const pcs=getComputedStyle(p);
  if(cs.position==='absolute'||cs.position==='fixed')continue;
  if(r.right>pr.right+1.5&&pcs.display!=='contents'&&!/(auto|scroll)/.test(pcs.overflowX)){
    // is it caused by text?  record only if element is wider than its parent
    add({kind:'STRETCH',sel:sel(e),parent:sel(p),amount:Math.round(r.right-pr.right),w:Math.round(r.width),pw:Math.round(pr.width),text:(e.textContent||'').trim().slice(0,30)});
  } else if(r.right>VW+1.5&&!/(auto|scroll)/.test(pcs.overflowX)){add({kind:'BOX_OUT_OF_VIEWPORT',sel:sel(e),amount:Math.round(r.right-VW),text:(e.textContent||'').trim().slice(0,30)});}
 }
}
return out;})()`;
export async function ctxInfo(p){return p.evaluate(()=>({screen:window.FT_QA.screen(),sheet:!!document.querySelector('#sheet.on'),sheetTitle:document.querySelector('#sheet.on h2')?.textContent?.slice(0,30)||null,dialog:!!document.querySelector('#dialog.on'),title:document.title}));}
