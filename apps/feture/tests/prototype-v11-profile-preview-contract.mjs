import fs from 'node:fs';import { fileURLToPath } from 'node:url';import vm from 'node:vm';import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../prototype/v11/',import.meta.url));
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
 const all=text(run("SC.P03.render({lv:'all'},{p:{lv:'all'},f:{}})")),gr=text(run("SC.P03.render({lv:'granted'},{p:{lv:'granted'},f:{}})"));
 assert.equal(run('S.ui.viewGrant'),false,'access level must not leak out of the preview render');
 assert.ok(!all.includes(priv),'public preview shows no private description');
 assert.ok(all.includes(role)&&gr.includes(role),'details (role, format…) are part of the main profile at both levels');
 const byAccess=JSON.parse(JSON.stringify(run("S.me.jars.filter(j=>j.vis==='granted').map(j=>topic(j.t))")));
 for(const t of byAccess)assert.ok(!all.includes(t)&&gr.includes(t),`by-access interest ${t}: hidden without access, shown with it`);
 assert.ok(gr.includes(priv),'with-access preview shows the private description');
 for(const t of onlyMe)assert.ok(!gr.includes(t),`only-me topic ${t} stays hidden even with access`);
 // the private part holds description, interests, photos and video: no details chips, no album permission
 assert.deepEqual(JSON.parse(JSON.stringify(run("REQ_SCOPES.map(s=>s[0])"))),['info','interests','photos','video']);
 assert.ok(!text(run("SC.P03.render({lv:'granted'},{p:{lv:'granted'},f:{}})").split('id="priv"')[1]||'').includes(run("topic(S.me.jars.find(j=>j.vis==='public').t)")),'private part lists only its own interests, not the public ones');
 // activity tab: owner setting decides who sees it; default is everyone; the owner always sees their own
 assert.equal(run("S.me.activityVis"),'all');
 assert.ok(run("activityShown('me')")&&run("activityShown('mia')"),'default: activity visible');
 assert.ok(!run("activityShown('leon')"),'activity off: nobody else sees the tab');
 run("S.me.activityVis='off'");assert.ok(run("activityShown('me')")&&!run("activityShown('me',{asOther:1,grant:'granted'})"),'off hides it from others, never from the owner');
 run("S.me.activityVis='followers'");assert.ok(!run("activityShown('me',{asOther:1,grant:'all'})")&&run("activityShown('me',{asOther:1,grant:'granted'})"),'followers & mutual: strangers do not see it');
 run("S.me.activityVis='all'");
 assert.ok(!run("activityShown('maya')")===!run("social('me').follows.has('maya')||isMatch('maya')"),'followers & mutual follows the real follow/match state');
 assert.ok(!text(run("SC.P01.render({id:'leon'},{p:{id:'leon'},f:{}})")).includes(run("T(PEOPLE.mia.privText)").slice(0,20)));
 // follow counts are the lists people can open; blocking removes the follower both ways
 const n=run("followersOf('me').length");assert.equal(n,run("followersOf('me').filter(x=>!isBlocked(x)).length"));
 run("S.blocked.unshift({p:'mia',t:Date.now()});S.graph.mia.delete('me');S.follows.delete('mia')");
 assert.ok(!run("followersOf('me')").includes('mia')&&!run("followingOf('me')").includes('mia')&&!run("followersOf('kai')").includes('mia'));
}
// Each private permission opens exactly its own thing: info → description, photos → photos, video → video.
run("S=freshState('full');S.session={};initNav();S.me.media=[{id:'a',type:'image',url:'/IMG_A'},{id:'b',type:'video',url:'/VID_B',dur:5},{id:'c',type:'image',url:'/IMG_C'}];S.me.privText={ru:'DESC_TEXT',en:'DESC_TEXT'}");
const gate=g=>text(run(`privOpenHTML('me',{granted:${JSON.stringify(g)},until:null},{preview:1})`))+run(`privOpenHTML('me',{granted:${JSON.stringify(g)},until:null},{preview:1})`);
assert.ok(gate(['info']).includes('DESC_TEXT')&&!gate(['info']).includes('IMG_A')&&!gate(['info']).includes('VID_B'),'description only');
assert.ok(!gate(['photos']).includes('DESC_TEXT')&&gate(['photos']).includes('IMG_A')&&gate(['photos']).includes('IMG_C')&&!gate(['photos']).includes('VID_B'),'photos only');
assert.ok(!gate(['video']).includes('IMG_A')&&gate(['video']).includes('VID_B')&&!gate(['video']).includes('DESC_TEXT'),'video only');
// editor media: drag result reorders each list on its own; delete keep the other kind untouched; main profile mixes photos and video
run("S=freshState('full');S.session={};initNav();S.me.media=[{id:'a',type:'image',url:'/A'},{id:'b',type:'video',url:'/B'},{id:'c',type:'image',url:'/C'}];var route={id:'P02',p:{},f:{},photos:[8,{type:'video',url:'/V',dur:3},'/P'],init:1};S.nav.stacks.feed=[route];closeSheet=()=>{};toast=()=>{};");
run("ACT.miOrder({dataset:{k:'photos',order:'c,a'}})");assert.deepEqual(json("S.me.media.map(m=>m.id)").sort(),['a','b','c']);assert.deepEqual(json("privSplit(S.me.media).photos.map(m=>m.id)"),['c','a']);assert.deepEqual(json("privSplit(S.me.media).video.map(m=>m.id)"),['b']);
run("ACT.miOrder({dataset:{k:'photos',order:'a,zzz'}})");assert.deepEqual(json("privSplit(S.me.media).photos.map(m=>m.id)"),['c','a'],'a bad order is ignored');
run("ACT.miOrder({dataset:{k:'pub',order:'2,0,1'}})");assert.deepEqual(json("route.photos.map(x=>typeof x==='object'?x.type:x)"),['/P',8,'video']);
// a video is framed to 4:5 by its stored crop, never re-encoded
assert.ok(run("vframe({w:1920,h:1080,crop:{x:0,y:0,z:1}})").includes('width:222.22%'),'landscape video fills the 4:5 frame');assert.ok(run("vframe({w:1080,h:1920})").includes('height:'),'portrait video without crop still gets a frame');
assert.equal(run("firstPhoto(route.photos)"),'/P','the first image — not a video — is the main photo');
run("ACT.miRm({dataset:{k:'pub',v:'0'}})");assert.equal(run("route.photos.length"),2);
// «What you share» is one component: the discovery card and the full profile render the same block; matches open the side-by-side answers.
run("S=freshState('full');S.session={};initNav();");
const blk=run("compatBlock('kira')");assert.ok(blk.includes('class="compat"')&&blk.includes('data-go="P05"')&&blk.includes('data-act="topic"')&&blk.includes('data-who="kira"'),'summary opens the comparison, each match opens topic answers');
assert.ok(run("card('kira','top')").includes(blk),'discovery card uses the shared block');assert.ok(run("profileView('kira',{p:{},f:{}})").includes(blk),'full profile uses the shared block');
assert.ok(run("card('kira','top')").includes('data-private-context="kira"')&&!run("card('kira','top')").includes('data-deck-private'),'the card shows the same private panel as the profile');
// The private part is shown to viewers only when it exists; the owner always gets a way to switch it on / fill it.
run("S=freshState('full');S.session={};initNav();");
assert.ok(run("hasPrivatePart('kira')")&&!run("hasPrivatePart('maya')"),'a profile with the private part off has none for viewers');
assert.equal(run("privSection('maya')"),'','viewers see no private block when it is off');
assert.ok(run("privSection('kira')").includes('class="veil"')&&run("privSection('kira')").includes('veil-content'),'closed private part is a blurred veil with the request action');
run("S.me.privOn=false");assert.equal(run("privSection('me',{grant:'granted'})"),'','my preview shows no private block when it is off');assert.ok(run("myPrivSection('me')").includes('data-act="privEnable"'),'the owner can switch it on');
run("S.me.privOn=true;S.me.privText={ru:'',en:''};S.me.media=[];S.me.jars=S.me.jars.filter(j=>j.vis!=='granted')");assert.equal(run("privSection('me',{grant:'granted'})"),'','empty private part: nothing for viewers');assert.ok(run("myPrivSection('me')").includes('data-go="P04"'),'empty private part: the owner is offered to add content');
// Video is trimmed by a media fragment, never re-encoded; a request only offers what the person really has.
assert.equal(run("vsrc({url:'/v.webm',trim:{s:1,e:3.3}})"),'/v.webm#t=1.00,3.30');assert.equal(run("vsrc({url:'/v.webm#t=0,9',trim:{s:2,e:4}})"),'/v.webm#t=2.00,4.00');assert.equal(run("vsrc({url:'/v.webm'})"),'/v.webm');
assert.ok(run("hasPrivatePart('kai')")&&run("hasPrivatePart('kira')")&&!run("hasPrivatePart('sofi')"),'only people who wrote something private have the block');
assert.deepEqual(JSON.parse(JSON.stringify(run("privScopesOf('kai')"))),['info','interests','photos'],'no video permission is offered when there is no private video');
assert.equal(run("privSection('sofi')"),'','a person without a private part shows no block at all');
// «As others see me» has no access switch: the closed block is live and its button opens a demo of the granted view.
run("S=freshState('full');S.session={};initNav();");const pv=run("SC.P03.render({lv:'all'},{p:{lv:'all'},f:{}})");assert.ok(!pv.includes('pv-panel')&&!pv.includes('p3lv')&&pv.includes('data-act="p3Demo"')&&!/disabled[^>]*>[^<]*Запросить/.test(pv),'no access switch; the request button is active');
assert.ok(!/<button[^>]*disabled/.test(pv.split('class="p-acts"')[1]?.split('</div>')[0]||''),'preview action buttons are live (they only announce the demo mode)');assert.ok((pv.match(/data-act="demoNote"/g)||[]).length>=3,'follow / like / shared-interests buttons announce the demo mode');
assert.ok(pv.includes('Нравится')&&!pv.includes('Симпатии выкл'),'my preview shows «Like» while my dating / profile likes are on');run("S.me.dating=false;S.me.socialLikes=false");assert.ok(run("SC.P03.render({lv:'all'},{p:{lv:'all'},f:{}})").includes('Симпатии выкл'),'…and «Likes off» when both are off');
assert.ok(pv.includes('class="compat"')&&pv.includes('cp-demo')&&!pv.includes('Общие интересы — у каждого свои'),'the preview shows the real «what you share» block with a small demo note');
// activity rows share one 46px tile whatever the row shows (picture, heart, avatar): text never shifts between rows.
{const rows=run("activityList('mia',activityOf('mia'))");const leads=[...rows.matchAll(/<button class="li [^"]*"[^>]*>(<span class="[^"]*">)/g)].map(m=>m[1]);assert.ok(leads.length>3&&leads.every(l=>/actth/.test(l)),'every activity row starts with the same tile');}
// One profile content everywhere: the discovery card and the full profile render the same details card, shared block and private panel; no pronouns anywhere.
run("S=freshState('full');S.session={};initNav();");
for(const id of ['kira','mia','maya','tomeva']){const det=run(`detailsGroup('${id}')`),card=run(`card('${id}','top')`),prof=run(`profileView('${id}',{p:{},f:{}})`);
 if(det){assert.ok(card.includes(det)&&prof.includes(det),`${id}: the details card is the same in the discovery card and the profile`);}
 assert.ok(card.includes(run(`compatBlock('${id}')`))&&prof.includes(run(`compatBlock('${id}')`)),`${id}: the shared block is the same`);
 assert.ok(!/Местоимения|Pronouns|он\/его|она\/её/.test(card+prof),`${id}: no pronouns`);
 assert.ok(prof.includes('class="pl"')===!!run(`placeLine('${id}')`)&&card.includes('class="pl"')===!!run(`placeLine('${id}')`),`${id}: the city sits in the header line of both`);}
assert.ok(run("identityFields().map(f=>f[0]).join()")==='gender,orient,role,status,format,seek','pronouns are not a profile field any more');
assert.ok(run("detailsGroup('me')").includes('<dl class="kv">'),'my own details are listed too');
// «End connection» is in the profile's ⋯ menu once a like is set; it works for a like without a chat and removes the like.
run("S=freshState('full');S.session={};initNav();toast=()=>{};closeSheet=()=>{};sheet=()=>{};refresh=()=>{};");
let menu='';run("sheet=b=>{globalThis.__m=b()}");run("ACT.profileMenu({dataset:{v:'maya'}})");menu=String(run("__m.body"));
assert.ok(run("social().likesOut.some(l=>l.p==='maya')")&&menu.includes('data-act="endConn"'),'a liked person offers «End connection» in the menu');
const none=run("Object.keys(PEOPLE).find(id=>!PEOPLE[id].pair&&!social().likesOut.some(l=>l.p===id)&&!isMatch(id))");run(`ACT.profileMenu({dataset:{v:'${none}'}})`);assert.ok(!String(run("__m.body")).includes('data-act="endConn"'),'no like, no «End connection»');
run("ACT.endConn({dataset:{v:'maya'}});");const pop=String(run("__m.body"));assert.ok(pop.includes('Твоя симпатия снимается')&&pop.includes('не блокировка'),'the popup says what happens');
// Filters: the feed filter sheet has the «All / Following only» source; closing a filter sheet never asks «close without saving?»; single-choice rows carry no hint.
run("S=freshState('full');S.session={};initNav();toast=()=>{};closeSheet=()=>{};refresh=()=>{};globalThis.__s=null;sheet=(b,o)=>{globalThis.__s={b,o}}");
run("ACT.feedFilters({dataset:{v:'feed'}})");const fsh=run("__s.b()");assert.ok(String(fsh.body).includes('data-act="ffSrc"')&&String(fsh.body).includes('Только подписки'),'the feed filter has the Following-only source');
assert.ok(!run("__s.o.guard"),'filter sheets have no «close without saving?» guard');
assert.ok(!String(fsh.body).includes('один вариант'),'no «one option» hints');
// Filters v2: short single choices are chips, long ones stay a select; every section with a value has a ✕ that clears just that section.
assert.ok(run("fitChips([['a','Все'],['b','Офлайн'],['c','Онлайн']])")&&!run("fitChips([['a','Любое время'],['b','Эта неделя'],['c','Выходные'],['d','Этот месяц']])"),'chips only when the options fit in one row');
assert.ok(run("fchoices([['a','Все'],['b','Люди']],'a','x')").includes('role="radio"')&&run("fchoices([['a','Любое время'],['b','Эта неделя'],['c','Выходные'],['d','Этот месяц']],'a','x')").includes('data-ch="sel"'),'chips or select by width');
run("sheet=b=>{globalThis.__s={b}};ACT.evFilters({dataset:{}});");const ev0=String(run("__s.b().body")).includes('data-act="fClear"');run("ACT.efSet({dataset:{k:'format',v:'online'}})");const ev1=String(run("__s.b().body"));assert.ok(!ev0&&ev1.includes('data-act="fClear" data-v="format"'),'a ✕ appears only after a value is chosen');
run("ACT.fClear({dataset:{v:'format'}})");assert.equal(run("S.ui.ef.format"),'all','✕ resets that section only');
run("S.ui.df=null;ACT.dfSheet();");run("ACT.dfWhere({dataset:{v:'nearby'}})");assert.equal(run("S.ui.df.placeMode"),'nearby');run("ACT.dfClear({dataset:{v:'where'}})");assert.ok(run("S.ui.df.placeMode")==='city'&&!run("S.ui.df.city"),'the «Where» ✕ returns to anywhere');
console.log('PASS RU/EN profile preview: details are public at both levels; the private part (description/interests/photos/video) opens only with access; hidden topics stay hidden; activity tab follows its privacy setting; follow lists drop blocked people');
