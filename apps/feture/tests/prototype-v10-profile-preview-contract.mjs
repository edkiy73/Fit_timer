import fs from 'node:fs';import { fileURLToPath } from 'node:url';import vm from 'node:vm';import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../prototype/v10/',import.meta.url));
const noop=()=>{};const node=()=>({dataset:{},style:{setProperty:noop},classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},addEventListener:noop,setAttribute:noop,removeAttribute:noop,querySelector:()=>null,querySelectorAll:()=>[],focus:noop,getBoundingClientRect:()=>({height:0}),innerHTML:'',scrollTop:0});const nodes=new Map();
const document={querySelector:s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s)},querySelectorAll:()=>[],addEventListener:noop,documentElement:node(),body:node(),activeElement:null};
const c={document,console,URL,URLSearchParams,Intl,Date,Set,Map,Promise,innerHeight:844,innerWidth:390,navigator:{language:'ru'},location:{href:'https://example.test/prototype-v10.html',search:'',hash:''},history:{replaceState:noop,pushState:noop,go:noop,back:noop},localStorage:{getItem:()=>null,setItem:noop},matchMedia:()=>({matches:false,addEventListener:noop}),setTimeout:()=>0,clearTimeout:noop,setInterval:()=>0,clearInterval:noop,requestAnimationFrame:noop,MutationObserver:class{observe(){}},addEventListener:noop};c.window=c;vm.createContext(c);
for(const f of ['data','topics','core','ui','media','s-location','s-auth','s-feed','s-events','s-people','s-profile','s-comm','s-chats','s-me','s-settings','s-completion','s-navigation','qa'])vm.runInContext(fs.readFileSync(root+f+'.js','utf8'),c,{filename:f+'.js'});
const run=s=>vm.runInContext(s,c);const json=s=>JSON.parse(JSON.stringify(run(s)));
const text=h=>String(h).replace(/<[^>]*>/g,' ');
run("render=()=>{};refresh=()=>{};");
// «Как видят» renders my profile through the same code as anyone else's; the public level never carries private fields.
for(const lang of ['ru','en']){
 run(`S=freshState('full');S.lang='${lang}';S.session={};initNav();`);
 const priv=run('T(S.me.privText)').slice(0,20),role=run("opt('role',S.me.role)");
 const hidden=JSON.parse(JSON.stringify(run("S.me.jars.filter(j=>j.vis!=='public').map(j=>topic(j.t))")));
 const onlyMe=JSON.parse(JSON.stringify(run("S.me.jars.filter(j=>j.vis==='only').map(j=>topic(j.t))")));
 assert.equal(run("S.me.vis.role"),'granted');
 const all=text(run("SC.P03.render({lv:'all'},{p:{lv:'all'},f:{}})")),gr=text(run("SC.P03.render({lv:'granted'},{p:{lv:'granted'},f:{}})"));
 assert.equal(run('S.ui.viewGrant'),false,'access level must not leak out of the preview render');
 assert.ok(!all.includes(priv)&&!all.includes(role),'public preview shows no private text or by-access field');
 for(const t of hidden)assert.ok(!all.includes(t),`public preview hides ${t}`);
 assert.ok(gr.includes(priv)&&gr.includes(role),'with-access preview shows the private layer');
 for(const t of onlyMe)assert.ok(!gr.includes(t),`only-me topic ${t} stays hidden even with access`);
 assert.ok(!text(run("SC.P01.render({id:'leon'},{p:{id:'leon'},f:{}})")).includes(run("T(PEOPLE.mia.privText)").slice(0,20)));
 // follow counts are the lists people can open; blocking removes the follower both ways
 const n=run("followersOf('me').length");assert.equal(n,run("followersOf('me').filter(x=>!isBlocked(x)).length"));
 run("S.blocked.unshift({p:'mia',t:Date.now()});S.graph.mia.delete('me');S.follows.delete('mia')");
 assert.ok(!run("followersOf('me')").includes('mia')&&!run("followingOf('me')").includes('mia')&&!run("followersOf('kai')").includes('mia'));
}
console.log('PASS RU/EN profile preview: public level hides private text, by-access fields and non-public topics; with-access shows the private layer but never only-me topics; follow lists drop blocked people');
