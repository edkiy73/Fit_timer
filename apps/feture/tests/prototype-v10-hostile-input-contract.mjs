import fs from 'node:fs';import { fileURLToPath } from 'node:url';import vm from 'node:vm';import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../prototype/v10/',import.meta.url));
const noop=()=>{};const node=()=>({dataset:{},style:{setProperty:noop},classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},addEventListener:noop,setAttribute:noop,removeAttribute:noop,querySelector:()=>null,querySelectorAll:()=>[],focus:noop,getBoundingClientRect:()=>({height:0}),innerHTML:'',scrollTop:0});const nodes=new Map();
const document={querySelector:s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s)},querySelectorAll:()=>[],addEventListener:noop,documentElement:node(),body:node(),activeElement:null};
const c={document,console,URL,URLSearchParams,Intl,Date,Set,Map,Promise,innerHeight:844,innerWidth:390,navigator:{language:'ru'},location:{href:'https://example.test/prototype-v10.html',search:'',hash:''},history:{replaceState:noop,pushState:noop,go:noop,back:noop},localStorage:{getItem:()=>null,setItem:noop},matchMedia:()=>({matches:false,addEventListener:noop}),setTimeout:()=>0,clearTimeout:noop,setInterval:()=>0,clearInterval:noop,requestAnimationFrame:noop,MutationObserver:class{observe(){}},addEventListener:noop};c.window=c;vm.createContext(c);
for(const f of ['data','topics','core','ui','media','s-location','s-auth','s-feed','s-events','s-people','s-profile','s-comm','s-chats','s-me','s-settings','s-completion','s-navigation','qa'])vm.runInContext(fs.readFileSync(root+f+'.js','utf8'),c,{filename:f+'.js'});
const run=s=>vm.runInContext(s,c);const json=s=>JSON.parse(JSON.stringify(run(s)));
// Hostile input: the shared text helpers that every HTML template relies on (docs/input-safety-backend-checklist.md).
const esc=s=>run(`esc(${JSON.stringify(s)})`),clean=s=>run(`cleanText(${JSON.stringify(s)})`);
const HOSTILE=['<img src=x onerror=alert(1)>','"><svg onload=alert(1)>',"'; DROP TABLE users;--",'</h2></div><b id=x>','javascript:alert(1)','a‮b⁦c​d﻿e\u0000f\u007Fg','Za'+'̶̴̵̷҉'.repeat(30)];
for(const h of HOSTILE){
 const e=esc(h);
 assert.ok(!/[<>"']/.test(e),'esc leaves no raw <, >, " or \' in '+JSON.stringify(h.slice(0,24)));
 assert.equal(clean(clean(h)),clean(h),'cleanText is idempotent');
 assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​‎‏‪-‮⁠-⁤⁦-⁯﻿]/.test(clean(h)),'no control/bidi/invisible characters survive');
 assert.ok(!/\p{M}{5}/u.test(clean(h)),'combining marks capped at 4');
}
assert.equal(esc('Rope & Talk'),'Rope &amp; Talk','one level of escaping, not two');
assert.equal(clean('👨‍👩‍👧'),'👨‍👩‍👧','ZWJ emoji sequences are kept');
assert.equal(clean('ทื่นี้ café ñ'),'ทื่นี้ café ñ','ordinary combining marks are kept');
assert.equal(esc(null)+esc(undefined),'','null/undefined render as empty');
console.log('PASS hostile input: esc() escapes markup once, cleanText() removes control/bidi/invisible characters, caps combining-mark runs, is idempotent and keeps emoji ZWJ and ordinary diacritics');
