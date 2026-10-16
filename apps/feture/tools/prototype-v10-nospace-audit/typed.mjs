import {chromium} from 'playwright';
import {open} from './lib.mjs';
const b=await chromium.launch();
const p=await open(b,{w:390,h:844,lang:'ru',nosp:false});await p.evaluate(()=>FT_QA.sanitize(false));
const ZAL='Za'+'̶̴̵̷҉'.repeat(20)+'lgo';
const dirty='ab‮cd​ef\u0000gh⁦ij﻿kl '+ZAL;
// plain input via search, textarea via comment, rte via bio
await p.evaluate(()=>FT_QA.go('G01',{scope:'all'}));await p.waitForTimeout(500);
await p.evaluate(v=>{const e=document.querySelector('input[type=search],input.inp');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));},dirty);
console.log('search input ->',JSON.stringify(await p.evaluate(()=>document.querySelector('input[type=search],input.inp').value)),'len',(await p.evaluate(()=>document.querySelector('input[type=search],input.inp').value)).length);
await p.evaluate(()=>FT_QA.go('F05',{id:'p1'}));await p.waitForTimeout(500);
await p.evaluate(v=>{const e=document.querySelector('#cmt');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));},dirty);
console.log('textarea ->',JSON.stringify(await p.evaluate(()=>document.querySelector('#cmt').value)).slice(0,60));
await p.evaluate(()=>FT_QA.go('P02',{}));await p.waitForTimeout(600);
await p.evaluate(v=>{const e=document.querySelectorAll('.rte-ed')[0];e.focus();document.execCommand('selectAll');document.execCommand('insertText',false,v);},dirty);await p.waitForTimeout(200);
console.log('rte ->',JSON.stringify(await p.evaluate(()=>document.querySelectorAll('.rte-ed')[0].textContent)).slice(0,60),'| stored md:',JSON.stringify(await p.evaluate(()=>document.querySelectorAll('.rte-ed')[0].dataset.md)).slice(0,60));
// display path: hostile data with bidi/zalgo is cleaned by esc()
await p.evaluate(()=>FT_QA.hostile(true));await p.evaluate(()=>FT_QA.go('F01',{sub:'foryou'}));await p.waitForTimeout(500);
const bad=await p.evaluate(()=>{const t=document.body.innerText;return {rlo:/[‪-‮⁦-⁩]/.test(t),zw:/[​﻿]/.test(t),ctrl:/[\u0000-\u0008]/.test(t),zalgo:/\p{M}{5,}/u.test(t)}});
console.log('displayed text contains (should all be false):',bad);
console.log('theme hostile ->',await p.evaluate(()=>{localStorage.setItem('feture-v6-theme','"><img src=x>');return 'set'}));
await b.close();
