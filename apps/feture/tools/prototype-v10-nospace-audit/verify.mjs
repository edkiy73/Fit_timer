import {chromium} from 'playwright';
import fs from 'node:fs';
import {open,VIEWS} from './lib.mjs';
const [,, wArg='320', lang='ru', scheme='light', only='']=process.argv;
const comps=JSON.parse(fs.readFileSync('comps.json')).filter(c=>!only||c.n.includes(only));
const b=await chromium.launch();
fs.mkdirSync('shots',{recursive:true});
const res=[];
for(const c of comps){
  const w=c.w||+wArg;const [vw,vh]=VIEWS.find(v=>v[0]===w);
  const p=await open(b,{w:vw,h:vh,lang,scheme});p.setDefaultTimeout(10000);
  await p.evaluate(({id,pp})=>FT_QA.go(id,pp),c);await p.waitForTimeout(700);
  for(const ck of [].concat(c.click||[])){await p.evaluate(s=>{const e=[...document.querySelectorAll('#main [data-act],#sheet.on [data-act]')].find(x=>x.dataset.act===s.act&&(!s.v||x.dataset.v===s.v));e&&e.click();},ck);await p.waitForTimeout(700);}
  const info=await p.evaluate(sel=>{
    const cands=[...document.querySelectorAll(sel)].filter(e=>{const t=e.textContent.trim();return t.length>=18&&!/\s/.test(t.slice(0,18))&&e.getClientRects().length});
    const e=cands[0];if(!e)return {found:false,count:0};
    e.scrollIntoView({block:'center'});e.setAttribute('data-qa-hit','1');
    const chain=[];let n=e;for(let i=0;n&&i<7&&n.id!=='main';i++,n=n.parentElement){const cs=getComputedStyle(n),r=n.getBoundingClientRect();chain.push({el:n.tagName.toLowerCase()+(n.id?'#'+n.id:'')+'.'+[...n.classList].slice(0,2).join('.'),disp:cs.display,minw:cs.minWidth,ow:cs.overflowWrap,wb:cs.wordBreak,ws:cs.whiteSpace,ox:cs.overflowX,te:cs.textOverflow,clamp:cs.webkitLineClamp,w:Math.round(r.width),sw:n.scrollWidth,cw:n.clientWidth});}
    const r=e.getBoundingClientRect();const view=document.querySelector('#main .view,#sheet.on .sh-b');
    const rg=document.createRange();rg.selectNodeContents(e);const rr=rg.getBoundingClientRect();
    return {found:true,count:cands.length,text:e.textContent.trim().slice(0,30),box:[Math.round(r.left),Math.round(r.right)],textRight:Math.round(rr.right),vw:innerWidth,viewScroll:view?view.scrollWidth-view.clientWidth:0,chain};
  },c.sel);
  if(info.found){await p.addStyleTag({content:'[data-qa-hit]{outline:2px solid #f0f !important;outline-offset:1px}'});await p.waitForTimeout(150);await p.screenshot({path:`shots/c-${c.n}-${w}-${lang}${scheme==="dark"?"-dark":""}.png`});}
  if(info.found){const c0=info.chain[0];const ell=info.chain.slice(0,3).some(x=>x.te==='ellipsis');info.verdict=(info.textRight<=info.box[1]+1&&info.box[1]<=info.vw+1)?'ok':(ell&&info.box[1]<=info.vw+1)?'ellipsis(ok)':'BAD';}
  res.push({n:c.n,w,...info});
  console.log(c.n,w,info.found?`found ${info.count} text:${info.text} boxR:${info.box[1]} textR:${info.textRight} vw:${info.vw} hscroll:${info.viewScroll} => ${info.verdict}`:'NOT FOUND');
  await p.context().close();
}
fs.writeFileSync(`out/verify-${wArg}-${lang}-${scheme}${only?'-'+only:''}.json`,JSON.stringify(res,null,1));
await b.close();
