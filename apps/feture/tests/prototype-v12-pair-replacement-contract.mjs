import fs from 'node:fs';import { fileURLToPath } from 'node:url';import vm from 'node:vm';import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../public/prototype-v12.html',import.meta.url),'utf8'); const source=f=>html.split('/* ---- '+f+'.js ---- */')[1].split('/* ---- ')[0];
const noop=()=>{};const node=()=>({dataset:{},style:{setProperty:noop},classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},addEventListener:noop,setAttribute:noop,removeAttribute:noop,querySelector:()=>null,querySelectorAll:()=>[],focus:noop,getBoundingClientRect:()=>({height:0}),innerHTML:'',scrollTop:0});const nodes=new Map();
const document={querySelector:s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s)},querySelectorAll:()=>[],addEventListener:noop,documentElement:node(),body:node(),activeElement:null};
const c={document,console,URL,URLSearchParams,Intl,Date,Set,Map,Promise,structuredClone,innerHeight:844,innerWidth:390,navigator:{language:'ru'},location:{href:'https://example.test/prototype-v10.html',search:'',hash:''},history:{replaceState:noop,pushState:noop,go:noop,back:noop},localStorage:{getItem:()=>null,setItem:noop},matchMedia:()=>({matches:false,addEventListener:noop}),setTimeout:()=>0,clearTimeout:noop,setInterval:()=>0,clearInterval:noop,requestAnimationFrame:noop,MutationObserver:class{observe(){}},addEventListener:noop};c.window=c;vm.createContext(c);
for(const f of ['data','topics','core','ui','media','s-location','s-auth','s-feed','s-events','s-people','s-profile','s-comm','s-chats','s-me','s-settings','s-completion','s-navigation','qa'])vm.runInContext(source(f),c,{filename:f+'.js'});
const run=s=>vm.runInContext(s,c);const json=s=>JSON.parse(JSON.stringify(run(s)));
run('const originalSheetForContext=sheet');
const text=h=>String(h).replace(/<[^>]*>/g,' ');
run("render=()=>{};refresh=()=>{};");
// Private couple data is separate; publishing is a snapshot requiring both approvals.
const timers=[];c.setTimeout=fn=>{timers.push(fn);return 1;};
run("toast=()=>{};showMatch=()=>{};renderSide=()=>{};paintAuthor=()=>{};paintReactions=()=>{};back=()=>{};");
function prepare(id='Q03',p={}){timers.length=0;run(`S=freshState('pair');S.session={};QA.autoApprove=false;QA.maintenance=false;initNav();S.nav.stacks.feed=[{id:${JSON.stringify(id)},p:${JSON.stringify(p)},f:{}}];`);}
async function finish(p){const fn=timers.shift();assert.ok(fn,'expected model network timer');fn();await p;await Promise.resolve();}
for(const expired of [false,true]){
 prepare('Q07');run("coupleProfile();S.myPosts.push({id:'old',author:'couple',text:'old pair',t:Date.now(),comments:[],media:[]});var oldPair=S.pair;dissolvePair();"+(expired?"expirePair(Date.now()+31*DAY);":""));
 assert.ok(run("SC.Q07.render().includes('data-act=\"pairNew\"')"));
 assert.ok(run("SC.Q01.render({create:true},{}).includes('name=\"partner\"')"));
 run("S.pairInvite={nick:'mia',by:'me',status:'pending'};S.pairMember='partner';ACT.pairInvitationAnswer({dataset:{v:'yes'}})");
 assert.equal(run('activePair()'),true);assert.equal(run('S.pair.with'),'mia');assert.equal(run('S.pairInvite'),null);assert.equal(run("social('couple').sharedByMe.length"),0);assert.equal(run("Object.keys(social('couple').threads).length"),0);assert.equal(run('S.pairHistory.length'),1);assert.equal(run("S.pairHistory[0].posts[0].text"),'old pair');assert.equal(run('requestPairRestore()'),false);assert.ok(run("S.myPosts.find(p=>p.id==='old').hiddenByPair"));
 run("S.myPosts.push({id:'new-pair-post',pairId:S.pair.id,author:'couple',text:'second pair',t:Date.now(),comments:[],media:[]});dissolvePair();S.pairInvite={nick:'kira',by:'me',status:'pending'};S.pairMember='partner';ACT.pairInvitationAnswer({dataset:{v:'yes'}})");
 assert.equal(run('S.pairHistory.length'),2);assert.equal(run('S.pairHistory[1].posts.length'),1);assert.equal(run('S.pairHistory[1].posts[0].text'),'second pair');
 console.log('PASS replacement with DIFFERENT partner, fresh social state and distinct archives',expired?'after expiry':'immediately');
}
