import fs from 'node:fs';import { fileURLToPath } from 'node:url';import vm from 'node:vm';import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../prototype/v10/',import.meta.url));
const noop=()=>{};const node=()=>({dataset:{},style:{setProperty:noop},classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},addEventListener:noop,setAttribute:noop,removeAttribute:noop,querySelector:()=>null,querySelectorAll:()=>[],focus:noop,getBoundingClientRect:()=>({height:0}),innerHTML:'',scrollTop:0});const nodes=new Map();
const document={querySelector:s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s)},querySelectorAll:()=>[],addEventListener:noop,documentElement:node(),body:node(),activeElement:null};
const c={document,console,URL,URLSearchParams,Intl,Date,Set,Map,Promise,structuredClone,innerHeight:844,innerWidth:390,navigator:{language:'ru'},location:{href:'https://example.test/prototype-v10.html',search:'',hash:''},history:{replaceState:noop,pushState:noop,go:noop,back:noop},localStorage:{getItem:()=>null,setItem:noop},matchMedia:()=>({matches:false,addEventListener:noop}),setTimeout:()=>0,clearTimeout:noop,setInterval:()=>0,clearInterval:noop,requestAnimationFrame:noop,MutationObserver:class{observe(){}},addEventListener:noop};c.window=c;vm.createContext(c);
for(const f of ['data','topics','core','ui','media','s-location','s-auth','s-feed','s-events','s-people','s-profile','s-comm','s-chats','s-me','s-settings','s-completion','s-navigation','qa'])vm.runInContext(fs.readFileSync(root+f+'.js','utf8'),c,{filename:f+'.js'});
const run=s=>vm.runInContext(s,c);const json=s=>JSON.parse(JSON.stringify(run(s)));
const text=h=>String(h).replace(/<[^>]*>/g,' ');
run("render=()=>{};refresh=()=>{};");
// Private couple data is separate; publishing is a snapshot requiring both approvals.
const timers=[];c.setTimeout=fn=>{timers.push(fn);return 1;};
run("closeSheet=()=>{S.ui.sheet=null};toast=()=>{};back=()=>{};");
function prepare(id='Q03',p={}){timers.length=0;run(`S=freshState('pair');S.session={};QA.autoApprove=false;QA.maintenance=false;initNav();S.nav.stacks.feed=[{id:${JSON.stringify(id)},p:${JSON.stringify(p)},f:{}}];`);}
async function finish(p){const fn=timers.shift();assert.ok(fn,'expected model network timer');fn();await p;await Promise.resolve();}
prepare();run("coupleProfile();var m=editableProfile({p:{owner:'couple'}});m.name={ru:'Together',en:'Together'};m.privText='COUPLE_SECRET';m.jars=[{t:'shibari',lv:7,vis:'public'},{t:'latex',lv:8,vis:'only'}];submitCoupleDraft()");
assert.notEqual(run("pname('couple')"),'Together');assert.ok(!run("JSON.stringify(person('couple'))").includes('COUPLE_SECRET'));
run('commitCoupleProposal(S.pair,S.pair.with)');assert.equal(run("pname('couple')"),'Together');assert.notEqual(run('S.me.privText'),'COUPLE_SECRET');
assert.ok(!run("JSON.stringify(person('me'))").includes('privText'));assert.equal(run("person('me').photo"),8);assert.ok(run("T(person('me').bio)").length>20);
for(const lv of ['all','granted']){const html=run(`SC.P03.render({owner:'couple',lv:'${lv}'},{p:{owner:'couple',lv:'${lv}'},f:{}})`);assert.equal(html.includes('COUPLE_SECRET'),lv==='granted');assert.ok(!html.includes(run("topic('latex')")));}
for(const id of ['tomeva','lenamax','nikajonas'])assert.equal(run(`person('${id}').members.every(id=>!!person(id))`),true);
// An approval while a jar save is in flight does not discard the later change.
prepare('X02',{owner:'couple'});run("coupleProfile();editableProfile().bio='Before';submitCoupleDraft();S.ui.jar={t:'shibari',v:9,vis:'public',owner:'couple',session:S.session};ACT.jarSave(null);commitCoupleProposal(S.pair,S.pair.with)");await finish();assert.equal(run('S.pair.draft.jars[0].lv'),9);assert.equal(run('S.pair.proposal'),null);assert.equal(run('S.me.jars.find(x=>x.t==="shibari").lv'),6);
// Session switch cannot apply a pending pair update to the next account.
prepare('P04',{owner:'couple'});run("cur().f.privText='LATE_SECRET';ACT.privTextSave(null);S=freshState('new');S.session={};initNav()");await finish();assert.ok(!run('JSON.stringify(S.me)').includes('LATE_SECRET'));
// Viewer uses draft photographs, never personal photographs on a couple page.
prepare('P03',{owner:'couple'});run("coupleProfile();cur().p.preview={...S.pair.profile,photos:['DRAFT_IMAGE'],photo:'DRAFT_IMAGE'};var viewed;openViewer=items=>viewed=items;ACT.pView()");assert.equal(run('viewed[0].src'),run("IMG('DRAFT_IMAGE')"));
prepare();run("coupleProfile().media=[{url:'PAIR_IMAGE',type:'image',sec:'photos'}];S.me.media=[{url:'PERSONAL_SECRET',type:'image',sec:'photos'}];ACT.privView({dataset:{v:'0'}})");assert.equal(run('viewed[0].src'),'PAIR_IMAGE');
// Replies notify addressed people and content owner once, retaining children of removed comments.
prepare('F05',{id:'p1'});run("var post=postById('p1');identifyReplies('p',post.id);post.comments[0].a='me';var child={id:'child',a:'kira',parent:post.comments[0].id,text:'child text',t:Date.now()};post.comments.push(child);notifyReply('p',post.id,child);notifyReply('p',post.id,child)");assert.equal(run("S.notifs.filter(n=>n.reply==='child').length"),1);assert.equal(run("S.replyDeliveries.filter(n=>n.reply==='child').length"),2);run('post.comments[0].deleted=true');assert.ok(run("replyTree('p','p1')").includes('child text'));
prepare('C06',{id:'d1'});run("var d=S.discussions.find(x=>x.id==='d1');d.author='me';var child={id:'discussionReply',a:'kai',text:'hi',t:Date.now()};d.replies.push(child);notifyReply('d',d.id,child)");assert.equal(run("S.notifs.filter(n=>n.reply==='discussionReply').length"),1);
// A second click cannot change/withdraw a vote; only the explicit link does.
prepare('F05',{id:'p4'});run("var poll=postById('p4');poll.vote=0;ACT.vote({dataset:{v:'p4',i:'1'}})");assert.equal(timers.length,0);assert.equal(run('poll.vote'),0);assert.ok(!run('pollHTML(poll)').includes('data-act="vote"'));assert.equal(run("pollVoters(poll,0).filter(x=>x==='me').length"),1);run("var undo=ACT.unvote({dataset:{v:'p4'}})");await finish(run('undo'));assert.equal(run('poll.vote'),null);
assert.equal(run('newMe().vis.role'),'only');
// Roles share the same bounded multi-selection in onboarding, both editors and dating.
prepare('P02');run("SC.P02.render(cur().p,cur());var originalRole=JSON.stringify(S.me.role);cur().role.push('rigger')");assert.equal(run('JSON.stringify(S.me.role)'),run('originalRole'),'editor role arrays must not alias the profile');
run("var choices=[];for(const v of ['lead','recv','switch','service','rigger','dom'])choices=toggleIdentityValue(choices,'role',v)");assert.equal(run('choices.length'),5);assert.equal(run("choices.includes('dom')"),false);run("choices=toggleIdentityValue(choices,'role','recv');choices=toggleIdentityValue(choices,'role','dom')");assert.equal(run('choices.length'),5);assert.equal(run("choices.includes('dom')"),true);
assert.equal(run("identityDraft({role:['lead','rigger']}).role.length"),2);assert.deepEqual(json("publicField(S.me,'role')"),[],'by-access roles stay out of public profile');
run("PEOPLE.sofi.role=['recv','sub'];var rf={...S.filters.dating,role:['sub']}");assert.equal(run("passDating('sofi',rf)"),true);run("rf.role=['dom']");assert.equal(run("passDating('sofi',rf)"),false);
console.log('PASS V10 followup: pair privacy/approval/in-flight saves/session switch/preview media; addressed reply notifications/dedup/tombstones; locked polls and matching voter rosters');
