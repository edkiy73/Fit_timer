/* V20 keeps every rule of V19 with the owner's #1270 decisions (V13, V14, V18, V19 contracts), then checks the V20 fixes. */
/* V19 keeps every V14 rule: the V14 contract (which itself runs the V13 contract) runs against the V19 file, with the dating mode
   read as the app mode (S.datingActor → S.actor), then the V19 checks — one «Я / Мы» mode, switched on the avatar in the dock. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import { pathToFileURL } from 'node:url';
const base=fs.readFileSync(new URL('./prototype-v14-contract.mjs',import.meta.url),'utf8');
const swap=(s,a,b)=>{if(!s.includes(a))throw new Error('V14 contract changed: '+a);return s.replace(a,b);};
let src=swap(base,"new URL('../public/prototype-v14.html',import.meta.url).href",JSON.stringify(new URL('../public/prototype-v20.html',import.meta.url).href));
src=swap(src,"new URL('./prototype-v13-contract.mjs',import.meta.url)",'new URL('+JSON.stringify(new URL('./prototype-v13-contract.mjs',import.meta.url).href)+')');
src=swap(src,"src+=`\n// ---- V14 ----","src=swap(src,\"assert.ok(run(\\\"profGo('couple')\\\").includes('data-go=\\\"P03\\\"'))\",\"assert.ok(run(\\\"profGo('couple')\\\").includes('data-v=\\\"couple\\\"'),'V17: my couple opens the profile tab, not a preview')\");\nsrc+=`\n// ---- V14 ----");
/* Owner revision: action text names the author; no avatar/picker beside actions. */
src=swap(src,"includes('author-picker v14 full'),'V14: the author is named in words above the text'","includes('publishNow'),'V19: the publish action remains without a duplicate author picker'");
src=swap(src,"text(f07).includes('Опубликовать как')&&text(f07).includes('Мы')","text(f07).includes('Опубликовать от пары')&&!f07.includes('data-author-picker')");
src=swap(src,"assert.ok(run(\"SC.P01.render(cur().p,cur())\").includes('class=\"p-author\"'),'profile actions say who acts')","assert.ok(!run(\"SC.P01.render(cur().p,cur())\").includes('class=\"p-author\"'),'V19: no author avatar beside profile actions')");
/* V20: «Что у вас общего», a grant page and access asked from a profile follow the dock — not the actor saved in the route */
{const A="assert.equal(run(\"compareActor('kira')\"),'me');",B="assert.equal(run(\"compareActor('kira')\"),'couple','V20: compare follows the dock, not the route');";src=swap(src,"src+=`\n// ---- V14 ----","src=swap(src,"+JSON.stringify(A)+","+JSON.stringify(B)+");\nsrc+=`\n// ---- V14 ----");}
/* V20: an article is a post — its pictures are gallery tiles like any other */
{const A="assert.ok(run(\"linkIssue('tomeva')\").length>0,'couples have no personal links');",B="assert.equal(run(\"linkIssue('tomeva')\"),'','V20.2: a link can be with a couple');";src=swap(src,"src+=`\n// ---- V14 ----","src=swap(src,"+JSON.stringify(A)+","+JSON.stringify(B)+");\nsrc+=`\n// ---- V14 ----");}
{const A="assert.equal(run(\"C.meTodo()\"),run(\"todoItems().filter(x=>['req','profile','profileBack','joint','pinv'].includes(x.k)).length\"));",B="assert.equal(run(\"C.meTodo()\"),run(\"todoItems().length\"),'V20.3: the «Я» badge is the whole «Нужно решить» number');";src=swap(src,"src+=`\n// ---- V14 ----","src=swap(src,"+JSON.stringify(A)+","+JSON.stringify(B)+");\nsrc+=`\n// ---- V14 ----");}
{const A="assert.ok(json(\"galleryPosts('noa').every(x=>x.type!=='note')\"),'notes are not gallery tiles');",B="assert.ok(json(\"galleryPosts('noa').length>0\"),'V20: articles with pictures are gallery tiles');";src=swap(src,"src+=`\n// ---- V14 ----","src=swap(src,"+JSON.stringify(A)+","+JSON.stringify(B)+");\nsrc+=`\n// ---- V14 ----");}
/* V19: the composer takes its author from the one mode, not from a composer-only switch */
src=swap(src,"S.composeActor='couple';setPairTrust(true)","S.actor='couple';setPairTrust(true)");
/* V19: the dating mode is the app mode — inside the V14 contract, rename it in the V13 source before it runs */
src=swap(src,"src+=`\n// ---- V14 ----","src=src.split('S.dating'+'Actor').join('S.actor').split('Заме'+'тки').join('Статьи');\nsrc+=`\n// ---- V14 ----");
src=swap(src,'`\n// ---- V14 ----',`\`
// ---- V18 ----
assert.equal(run("meTabName()"),'Я','the tab is called «Я»');
prepare('X01');run("S.nav.tab='me';S.nav.stacks.me=[{id:'X01',p:{},f:{}}]");let x=run("SC.X01.render(cur().p,cur())");
assert.ok(x.includes('data-act="meLayer"')&&!x.includes('profile-page'),'«Я» is one screen with three layers, not a copy of the public profile');
for(const k of ['basics','details'])assert.ok(x.includes('&quot;only&quot;:&quot;'+k+'&quot;')||x.includes('"only":"'+k+'"'),'block '+k+' opens its own short editor');
assert.ok(!x.includes('&quot;only&quot;:&quot;priv&quot;')&&!x.includes('"only":"priv"'),'V20.2: the private part is not on the Profile tab');
assert.ok(!x.includes('shareProfile')&&!x.includes('privLens')&&!x.includes('demoNote'),'no share button, no in-page lens, no demo buttons');
assert.ok(!x.includes('data-go="P07"')&&!x.includes('data-go="Q01"'),'no access or couple-settings shortcuts mixed into the profile layer');
run("ACT.meLayer({dataset:{v:'vis'}})");x=run("SC.X01.render(cur().p,cur())");
assert.ok(x.includes('data-sel="k4mode"')&&x.includes('data-sel="k4act"')&&(x.includes('lv&quot;:&quot;card')||x.includes('"lv":"card"')),'V20.2: Visibility holds Discover, the card preview and who sees activity');
assert.ok(!x.includes('data-act="revoke"')&&!x.includes('data-sel="reqFrom"'),'V20.2: access lives on the Private tab');
run("ACT.meLayer({dataset:{v:'priv'}})");x=run("SC.X01.render(cur().p,cur())");
assert.ok(x.includes('data-act="revoke"')&&x.includes('data-sel="reqFrom"')&&(x.includes('&quot;only&quot;:&quot;priv&quot;')||x.includes('"only":"priv"')),'V20.2: the Private tab holds what access opens, who has it and who may ask');
run("ACT.meLayer({dataset:{v:'mine'}})");x=run("SC.X01.render(cur().p,cur())");
assert.ok(x.includes('data-go="F10"')&&x.includes('mine&quot;:1')||x.includes('"mine":1'),'Mine is lists only, incl. what others shared with me');
assert.ok(!x.includes('data-sel=')&&!x.includes('editJar'),'Mine has no settings and no profile content');
run("coupleProfile();ACT.meSwitchTo({dataset:{v:'couple'}})");assert.equal(run("activeActor()"),'couple');assert.equal(run("cur().p.layer"),'mine','switching profile keeps the layer');
assert.equal(run("actionAuthor()"),'couple','«Мы» acts as the couple');assert.ok(run("editableProfile()!==S.me"));
run("ACT.meLayer({dataset:{v:'vis'}})");x=run("SC.X01.render(cur().p,cur())");assert.ok(x.includes('data-sel="pairMode"')&&x.includes('data-act="pairTrustOpen"'),'couple rules live in the couple’s Visibility');
assert.ok(!run("SC.K01.render({},cur())").includes('data-sel="k4mode"'),'Settings no longer copy dating and privacy switches');
prepare('P03',{lv:'card'});assert.ok(run("SC.P03.render(cur().p,cur())").includes('card18'),'«Как видят» shows the Discover card');
prepare('P03',{});const p3=run("SC.P03.render(cur().p,cur())");assert.ok(!p3.includes('demoNote')&&p3.includes('disabled'),'preview buttons are disabled, never fake');
prepare('P02',{only:'basics'});const pe18=run("SC.P02.render(cur().p,cur())");assert.ok(pe18.includes('name="nick"')&&!pe18.includes('id="peMedia"')&&!pe18.includes('id="privEdit"'),'a block editor shows only its block');
prepare('Q01');run("coupleProfile();S.pair.proposal={id:'d1',by:S.pair.with,status:'pending',text:{...structuredClone(S.pair.profile),bio:{ru:'Новый текст',en:'New text'}}}");assert.ok(text(run("proposalDiff(S.pair.proposal)")).includes('Новый текст'),'a partner’s proposal is reviewed as a difference');
console.log('PASS V18 rules in V20: «Я» — three layers, block editors, one preview with the Discover card, one couple draft');
// ---- V19 ----
const mode=a=>run("S.actor='"+a+"';activeActor()");
prepare('F01');run("coupleProfile()");assert.equal(mode('me'),'me');assert.equal(mode('couple'),'couple','one mode for the whole app');
assert.ok(run("TABDEF().find(x=>x[0]==='me')[1]").includes('dock-av us'),'the dock shows the couple avatar in «Мы»');
assert.ok(run("dockHTML()").includes('data-act="dockMe"'),'with a couple the dock avatar opens «Действовать как»');
run("S.actor='me';ACT.dockMe()");assert.ok(run("S.ui.sheet.build().body").includes('data-act="meSwitchTo" data-v="couple"'));
run("closeSheet(true);ACT.meSwitchTo({dataset:{v:'couple'}})");assert.equal(run("activeActor()"),'couple','choosing «Мы» switches the mode');
assert.equal(run("actionAuthor()"),'couple','screens act as the mode');assert.equal(run("datingActor()"),'couple','Discover follows the mode');
// light actions as the couple: likes, follows, communities, events — with a notification to the partner
run("S.pair.notifications={};var pp=allPosts().find(p=>!ownedIdentity(p.author)&&!isBlocked(p.author));ACT.likePost({dataset:{v:pp.id}})");
assert.ok(run("pp.reactions.couple===true&&!pp.reactions.me"),'a like goes out as the couple only');assert.ok(run("S.pair.notifications[S.pair.with].some(n=>n.pairEvent==='coupleAct'&&n.act==='like')"),'the partner is notified');
run("var fid=Object.keys(PEOPLE).find(k=>!PEOPLE[k].pair&&!S.follows.has(k)&&!social('couple').follows.has(k)&&!isBlocked(k));ACT.follow({dataset:{v:fid},classList:{contains:()=>false}})");assert.ok(run("social('couple').follows.has(fid)&&!S.follows.has(fid)"),'a follow goes out as the couple');
var cid=run("Object.keys(COMMUNITIES).find(c=>COMMUNITIES[c].privacy==='open'&&!S.joined.has(c)&&communityJoinAllowed(c))");
if(cid){run("social('couple').joined=new Set(['"+cid+"'])");assert.ok(run("joinedSet().has('"+cid+"')&&!S.joined.has('"+cid+"')"),'membership is kept per profile');assert.equal(run("communityAuthorReason('"+cid+"','couple')"),'','a couple that joined writes there as one member');}
var ev=run("allEventIds().find(e=>!EV(e).approval&&EV(e).organizer!=='me'&&!isPast(e)&&!EV(e).cancelled)");
run("S.nav.stacks.feed.push({id:'E03',p:{id:'"+ev+"'},f:{}});setPairTrust(true);S.pairMember='partner';setPairTrust(true);S.pairMember='me';var personalBefore=JSON.stringify(S.rsvp['"+ev+"']||null);var rsvpP=ACT.rsvp({dataset:{v:'going'},classList:{contains:()=>false,add:()=>{},remove:()=>{}},closest:()=>null,setAttribute:()=>{},removeAttribute:()=>{}})");await finish(run("rsvpP"));
assert.equal(run("social('couple').rsvp['"+ev+"'].status"),'going','the couple answers an event directly when no approval is asked');assert.equal(run("JSON.stringify(S.rsvp['"+ev+"']||null)"),run("personalBefore"),'the personal answer is untouched');
assert.ok(text(run("SC.E03.render(cur().p,cur())")).includes('Идём вдвоём'),'the couple answers together');
run("delete social('couple').rsvp['"+ev+"'];S.pairMember='partner';setPairTrust(false);S.pairMember='me';ACT.rsvp({dataset:{v:'going'},classList:{contains:()=>false,add:()=>{},remove:()=>{}},closest:()=>null,setAttribute:()=>{},removeAttribute:()=>{}})");
assert.ok(!run("social('couple').rsvp['"+ev+"']?.status"),'with partner approval switched on the answer waits');assert.equal(run("jointQueue()['rsvp_"+ev+"'].status"),'pending');
run("S.pairMember='partner';S.nav.stacks.feed.push({id:'N01',p:{k:'todo'},f:{}})");assert.ok(run("SC.N01.render(cur().p,cur())").includes('rsvp_'),'the partner finds the event answer in «Нужно решить»');run("ACT.jointReview({dataset:{v:'rsvp_"+ev+"'}})");assert.ok(text(run("S.ui.sheet.build().body")).includes('Идём вдвоём'),'the review says what the couple answers');run("closeSheet(true)");
run("S.pairMember='partner'");assert.equal(run("approveJointWork('rsvp_"+ev+"',jointQueue()['rsvp_"+ev+"'].version)"),true);run("S.pairMember='me'");assert.equal(run("social('couple').rsvp['"+ev+"'].status"),'going','after the partner approves, the couple is going');
// a like from a profile never silently goes out as «Я» while in «Мы»
run("S.actor='couple';coupleProfile().dating=false");assert.ok(run("likeActor('mia').a")==='couple'&&!!run("likeActor('mia').why"),'in «Мы» a blocked like stays blocked, never falls back to «Я»');
// owned threads act as themselves; viewing the other own profile does not switch the mode
assert.equal(run("S.nav.stacks.feed.push({id:'H02',p:{id:'kai',actor:'me'},f:{}});actionAuthor()"),'me','a chat thread keeps its own identity');
run("S.actor='me';ACT.openOwn({dataset:{v:'couple'}})");assert.equal(run("activeActor()"),'me');assert.equal(run("cur().id"),'P03','the couple profile opens read-only, the mode stays «Я»');
// Media ownership and privacy are stable contracts despite the changing UI.
prepare('X01');run("initMediaLibrary19('me');initMediaLibrary19('couple')");
const mediaCount=run("S.myPosts.length");run("initMediaLibrary19('me');initMediaLibrary19('couple')");assert.equal(run("S.myPosts.length"),mediaCount,'opening media again never duplicates posts');
assert.ok(run("S.me.photos.every(src=>mediaLibrary19('me').some(p=>p.aud==='all'&&realMedia(p).some(m=>m.url===IMG(src))))"),'profile photos reference public posts');
run("var p19=mediaLibrary19('me').find(p=>p.aud==='all'&&realMedia(p).some(m=>m.type!=='video'));var ref19=mediaRef19(p19,realMedia(p19)[0]);var original19=p19.aud;p19.aud='granted';syncMediaProjection19('me')");
assert.ok(!run("S.me.profileRefs19.includes(ref19)"),'restricting a post removes its public profile photo');
assert.equal(run("mediaPreviewAllowed19(p19,{asOther:true})"),false,'closed posts stay out of public previews');
assert.equal(run("mediaPreviewAllowed19(p19,{asOther:true,grant:'granted'})"),true,'access preview can see a closed post');
assert.equal(run("mediaPreviewAllowed19({...p19,status:'review'},{asOther:true,grant:'granted'})"),false,'access does not bypass media review');
assert.ok(run("S.me.media.some(m=>m.id===ref19)"),'private media derives from the same post');
run("p19.hiddenByPair=true;syncMediaProjection19('me')");assert.ok(!run("S.me.media.some(m=>m.id===ref19)"),'a hidden post disappears from private projections too');
prepare('X01');run("coupleProfile().photos=[1];coupleProfile().photo=1;initMediaLibrary19('me');initMediaLibrary19('couple');var solo19=JSON.stringify(S.me.photos);var cp19=mediaLibrary19('couple').find(p=>p.aud==='all');var ci19=realMedia(cp19).findIndex(m=>m.type!=='video');S.pairMember='partner';setPairTrust(false);S.pairMember='me';var before19=JSON.stringify(coupleProfile().photos);changeProfileRef19({dataset:{v:cp19.id,i:String(ci19)}},'toggle')");
assert.equal(run("JSON.stringify(S.me.photos)"),run('solo19'),'couple media changes do not touch solo');
assert.equal(run("JSON.stringify(coupleProfile().photos)"),run('before19'),'unapproved selection never changes published couple photos');
assert.equal(run("S.pair.proposal.status"),'pending','the couple photo selection follows partner approval');
assert.equal(run("authorPicker()"),'','no duplicate picker remains');
assert.ok(!run("av('couple')").includes('avh'),'one shared avatar per couple');
for(const screen of ['F07','F09','F05','C06','P02','H02'])assert.equal(run("screenHasDock('"+screen+"')"),true,screen+' keeps global navigation');
prepare('X01');run("coupleProfile().photos=[1];coupleProfile().photo=1;editableProfile({p:{owner:'couple'}});initMediaLibrary19('couple');var stale19=mediaLibrary19('couple').find(p=>p.aud==='all');stale19.hiddenByPair=true;syncMediaProjection19('couple');S.pair.draft.bio='updated description';markCoupleDraft();submitCoupleDraft();initMediaLibrary19('couple')");
assert.equal(run("coupleProfile().photos.length"),0,'a pre-library draft cannot resurrect deleted media');
prepare('X01');run("initMediaLibrary19('me');var reviewed19=mediaLibrary19('me').find(p=>p.aud==='all');var refs19=JSON.stringify(S.me.profileRefs19);reviewed19.status='review';syncMediaProjection19('me')");
assert.equal(run("JSON.stringify(S.me.profileRefs19)"),run('refs19'),'temporary review preserves photo references');
run("reviewed19.status='published';syncMediaProjection19('me')");assert.ok(run("S.me.photos.length>0"),'approval restores selected photos');
prepare('F01');run("var marked19={id:'marked-private',author:'mia',status:'published',aud:'granted',text:{ru:'private',en:'private'},media:[{type:'image',url:'/images/private.jpg'}],tags:[],people:[{p:'kai',st:'ok'}],comments:[],t:Date.now()};S.posts.push(marked19);S.reqOut=[]");
assert.ok(!run("taggedPosts('kai').some(p=>p.id==='marked-private')"),'photo marks never bypass the post audience');
prepare('F07');run("SC.F07.render(cur().p,cur());var parent19=cur();parent19.f.text='keep text';parent19.media=[{type:'image',url:'/images/a.jpg'}];var draft19=draftOf(parent19);S.nav.stacks.feed.push({id:'F09',p:{draft:draft19},f:{}});setActor('couple')");
assert.equal(run("cur().p.draft.author"),'couple','preview follows the dock for a new post');assert.equal(run("parent19.author"),'couple','the parent composer follows too');assert.equal(run("parent19.f.text"),'keep text','switching keeps the draft');assert.equal(run("parent19.media.length"),1,'switching keeps media');
console.log('PASS V19 media rules in V20: single upload, public selection, private projections, hidden/review gates, separate owners and partner approval');
// ---- V20 ----
run("S=freshState('pair');S.session={};initNav();S.nav.tab='me';S.nav.stacks.me=[{id:'X01',p:{},f:{}}];S.actor='me'");
assert.ok(run("av('couple')").includes('av split')&&!run("av('couple')").includes('avh'),'a couple without a photo is one circle split in two halves');
run("var cpp=coupleProfile().photo;coupleProfile().photo='/images/v10-content/post-p7-morning-coffee-45.webp'");assert.ok(!run("av('couple')").includes('split'),'a couple with a photo shows that photo');run("coupleProfile().photo=cpp");
assert.ok(run("dockHTML()").includes('me-tab'),'the dock avatar slot carries its class');
run("ACT.dockMe()");let sh=run("S.ui.sheet.build().body");assert.equal((sh.match(/class="actor-card/g)||[]).length,2,'two profile cards');assert.equal((sh.match(/data-act="dockOpenMe"/g)||[]).length,2,'each card opens its profile');
run("closeSheet(true);ACT.dockOpenMe({dataset:{v:'couple'}})");assert.equal(run("activeActor()"),'couple','«Перейти в профиль пары» switches to it');assert.equal(run("cur().id"),'X01','and opens it');
run("S.nav.stacks.me.push({id:'P05',p:{id:'kira',actor:'me'},f:{}})");assert.equal(run("compareActor('kira')"),'couple','«Что у вас общего» follows the dock');run("S.nav.stacks.me.pop();S.actor='me'");
// profile photos: picked from public posts, one video never first, drag order, review mark
run("initMediaLibrary19('me')");const n0=run("profItems20('me').length");assert.ok(n0>=1,'the profile shows its photos');
const pub=run("JSON.stringify(mediaLibrary19('me').filter(p=>p.aud==='all').flatMap(p=>realMedia(p).map(m=>m.url)))"),priv=run("JSON.stringify(privPosts20('me').flatMap(p=>realMedia(p).map(m=>m.url)))");assert.ok(!JSON.parse(priv).some(u=>JSON.parse(pub).includes(u)),'no picture is both public and private');
assert.ok(run("galleryPosts('me').length>0&&galleryPosts('me').every(p=>p.aud!=='granted')"),'the gallery holds public posts; private ones live in the private part');
run("var vp={id:'v20vid',author:'me',status:'published',aud:'all',type:'post',t:Date.now(),media:[{type:'video',url:'/v.mp4',dur:5},{type:'video',url:'/w.mp4',dur:5}],text:{ru:'',en:''},tags:[],comments:[],people:[]};S.myPosts.push(vp)");
assert.equal(run("refRules20('me',[mediaRef19(vp,vp.media[0]),...profItems20('me').map(x=>x.ref)],1).findIndex(r=>r.startsWith('v20vid'))"),1,'a video never stands first');
assert.equal(run("refRules20('me',[...profItems20('me').map(x=>x.ref),mediaRef19(vp,vp.media[0]),mediaRef19(vp,vp.media[1])],1).filter(r=>r.startsWith('v20vid')).length"),1,'one video per profile');
run("var np={id:'v20new',author:'me',status:'review',aud:'all',type:'post',galleryOnly:true,t:Date.now(),media:[{type:'image',url:'/images/v10-content/gallery-e4-cafe.webp'}],text:{ru:'',en:''},tags:[],comments:[],people:[]};S.myPosts.unshift(np);addPostToProfile20('me','v20new')");
assert.ok(run("profItems20('me').some(x=>x.p.id==='v20new')"),'a new upload can go on the profile before review');assert.ok(run("SC.X01.render(cur().p,cur())").includes('ph-rev'),'it is marked «На проверке» for the owner');assert.ok(!run("S.me.photos.some(ph=>String(ph).includes('gallery-e4-cafe'))"),'others don’t see it yet');
run("ACT.phRefOrder({dataset:{owner:'me',order:profItems20('me').map((x,i)=>i).reverse().join(',')}})");assert.equal(run("profItems20('me')[0].p.id"),'v20new','drag reorders the profile');
// the post editor: «Показать в ленте» off for profile/gallery uploads
run("S.nav.stacks.me.push({id:'F07',p:{x:'media',feed:false,aud:'all',toProfile:'me'},f:{}});SC.F07.render(cur().p,cur())");assert.equal(run("cur().feed"),false,'profile uploads start with the feed off');
assert.ok(run("draftOf(cur()).galleryOnly===true&&draftOf(cur()).toProfile==='me'"),'the draft keeps «not in the feed» and «to the profile»');run("ACT.setFeed()");assert.equal(run("draftOf(cur()).galleryOnly"),false,'the toggle puts it in the feed');run("S.nav.stacks.me.pop()");
assert.ok(!run("filterPosts([np],{}).length"),'a gallery-only post stays out of the feed');
// «Я»: same blocks for me and us, albums, no floating hints
let x20=run("SC.X01.render(cur().p,cur())");assert.ok(x20.includes('id="mePh"')&&x20.includes('id="meGal"')&&x20.includes('data-act="galOpenAlbum"'),'«Я» shows profile photos and gallery albums');
assert.ok(!x20.includes('Каждая загрузка')&&!x20.includes('без значка — видят все'),'no floating hints');
run("ACT.meLayer({dataset:{v:'mine'}});S.actor='couple'");x20=run("SC.X01.render(cur().p,cur())");assert.ok(x20.includes('data-go="E10"')&&x20.includes('data-go="G04"'),'the couple has its events and saved');assert.ok(!x20.includes('Здесь только списки'));run("S.actor='me';ACT.meLayer({dataset:{v:'profile'}})");
// gallery select mode
run("S.nav.stacks.me.push({id:'P20',p:{id:'me'},f:{}});ACT.galSel();cur().sel.add('own_me_0')");run("SC.P20.render(cur().p,cur())");assert.equal(run("SC.P20.dock"),false,'select mode hides the dock');
run("ACT.galSelAlbumSet({dataset:{v:'me_a1'}})");assert.equal(run("S.myPosts.find(p=>p.id==='own_me_0').album"),'me_a1','«В альбом» moves the picked posts');
run("S.actor='me';S.nav.stacks.me.push({id:'P10',p:{id:'me',tab:'followers'},f:{}});setActor('couple')");assert.equal(run("cur().p.id"),'couple','an open own page follows the dock');run("setActor('me');S.nav.stacks.me.pop()");
// a couple event (organiser = the couple, partner approval when switched on) and a couple community
const stub="{dataset:{},classList:{contains:()=>false,add:()=>{},remove:()=>{}},closest:()=>null,setAttribute:()=>{},removeAttribute:()=>{}}";
prepare('E11');run("S.actor='couple';S.pairMember='partner';setPairTrust(false);S.pairMember='me';SC.E11.render(cur().p,cur());Object.assign(cur().f,{title:'Evening for two',type:'meetup',desc:'A calm evening for two couples',date:isoDay(NOW+3*DAY),city:'berlin',addr:'Mitte'});evFromForm(cur()).orgAs");
assert.equal(run("cur().asCouple"),true,'an event made in «Мы» is the couple’s');
run("var evBefore=Object.keys(S.extraEvents);var evP=ACT.evfSubmit("+stub+")");await finish(run("evP"));run("var evNew=Object.keys(S.extraEvents).find(k=>!evBefore.includes(k))");
assert.equal(run("S.extraEvents[evNew].orgAs"),'couple','the organiser is the couple');assert.equal(run("S.extraEvents[evNew].holdPair"),true,'with partner approval on, the event waits');assert.equal(run("jointQueue()['event_'+evNew].status"),'pending');
run("S.pairMember='partner'");assert.equal(run("approveJointWork('event_'+evNew,1)"),true,'the partner approves the event');run("S.pairMember='me'");assert.equal(run("S.extraEvents[evNew].holdPair"),false);
assert.ok(run("myEventIds('organize').includes(evNew)"),'the couple lists it as organised');run("S.actor='me'");assert.ok(!run("myEventIds('organize').includes(evNew)"),'«Я» does not list the couple’s event');
assert.equal(run("typeof evOrg"),'function');assert.ok(text(run("(S.actor='couple',SC.E03.render({id:evNew},{}))")).includes('Alex'),'the event page names the couple as organiser');run("S.actor='me'");
// blocks belong to the profile that made them
run("S.blocked=[];S.actor='couple';doBlock('mia')");assert.ok(run("isBlocked('mia')"),'blocked as the couple');run("S.actor='me'");assert.ok(!run("isBlocked('mia')"),'still visible as myself');
run("S.actor='couple';ACT.blockBoth({dataset:{v:'mia'}});S.actor='me'");assert.ok(run("isBlocked('mia')"),'«and for me too» blocks both');run("S.blocked=[]");
// the couple has the three discover modes
run("S.actor='couple';coupleProfile().dating=true;coupleProfile().datingVisible=true;ACT.pairMode({dataset:{v:'hidden'}})");assert.equal(run("coupleProfile().dating&&!coupleProfile().datingVisible"),true,'«Смотрим незаметно»: browsing without being shown');
run("ACT.pairMode({dataset:{v:'off'}})");assert.equal(run("coupleProfile().dating"),false,'«Выключены»');run("S.actor='me'");
// reply boxes name the couple
run("S.actor='couple';S.nav.stacks.feed=[{id:'F05',p:{id:'p1'},f:{}}]");assert.ok(run("SC.F05.render(cur().p,cur())").includes('Ответить от пары'),'the reply box says «от пары»');run("S.actor='me'");
console.log('PASS V20.1: couple events and communities, per-profile blocks, couple discover mode, «от пары» texts');
// ---- V20.2: «Я» by topic, couple parity, staged photo order, re-review only for real changes
prepare('X01');run("S.actor='me';S.nav.tab='me';S.nav.stacks.me=[{id:'X01',p:{},f:{}}]");x=run("SC.X01.render(cur().p,cur())");
assert.ok(!x.includes('me18-st'),'no status chips under the name');for(const v of ['profile','priv','vis','mine'])assert.ok(x.includes('data-act="meLayer" data-v="'+v+'"'),'tab '+v);
assert.ok(x.includes('data-act="linkAnswer"'),'a new link request is answered right on the Profile tab');
run("S.actor='couple'");x=run("SC.X01.render(cur().p,cur())");assert.ok(x.includes('Eva')&&x.includes('data-act="linkAnswer"'),'the couple has links and answers its requests in place');
assert.ok(run("todoItems().some(i=>i.k==='link'&&linkSelf(i.l)==='couple')"),'the couple’s link requests reach «Нужно решить»');
run("ACT.linkAnswer({dataset:{v:'lk10|yes'}})");assert.equal(run("links().find(l=>l.id==='lk10').status"),'ok','the couple confirms a link');
assert.equal(run("linkIssue('nikajonas')"),'','the couple can propose a link to another couple');assert.ok(run("linkIssue(S.pair.with)").length>0,'not to its own member');
run("S.nav.stacks.me.push({id:'P22',p:{id:'nikajonas'},f:{}});SC.P22.render(cur().p,cur())");run("var lkP=ACT.linkSend("+stub+")");await finish(run("lkP"));
assert.ok(run("links().some(l=>l.a==='couple'&&l.b==='nikajonas'&&l.by==='couple')"),'the request goes from the couple');
run("S.nav.stacks.me=[{id:'X01',p:{layer:'vis'},f:{}}]");x=run("SC.X01.render(cur().p,cur())");for(const k of ['k4social','k4likes'])assert.ok(x.includes('data-act="'+k+'"'),'couple has '+k);for(const k of ['k4act','k4mention'])assert.ok(x.includes('data-sel="'+k+'"'),'couple has '+k);
run("S.pairMember='partner';setPairTrust(false);S.pairMember='me';S.pair.proposal=null;S.pair.draft=null;coupleProfile().activityVis='all'");
run("ACT.k4act({dataset:{v:'off',k:'couple'}})");assert.equal(run("coupleProfile().activityVis"),'off','closing applies at once');
run("ACT.k4act({dataset:{v:'all',k:'couple'}})");assert.equal(run("coupleProfile().activityVis"),'off','opening up waits for the partner');assert.equal(run("S.pair.proposal?.status"),'pending');assert.ok(run("pendingSetting('activityVis')"));
assert.ok(run("proposalDiff(S.pair.proposal)").includes('Кто видит активность'),'the partner sees the setting in the review');
run("S.pairMember='partner'");run("commitCoupleProposal(S.pair)");run("S.pairMember='me'");assert.equal(run("coupleProfile().activityVis"),'all','approved');
run("S.actor='me';S.nav.stacks.me=[{id:'X01',p:{},f:{}},{id:'P02',p:{only:'media'},f:{}}];SC.P02.render(cur().p,cur())");const ph0=run("JSON.stringify(S.me.profileRefs19)");
run("var free=mediaLibrary19('me').filter(p=>p.aud==='all').flatMap(p=>realMedia(p).map(m=>mediaRef19(p,m))).find(r=>!profItems20('me').some(x=>x.ref===r));ACT.phToggle({dataset:{owner:'me',v:free}})");
assert.equal(run("JSON.stringify(S.me.profileRefs19)"),ph0,'the photo editor does not save on the fly');assert.ok(run("cur().dirty"),'leaving with changes asks first');
run("var phP=ACT.phSave({...("+stub+"),dataset:{owner:'me'}})");await finish(run("phP"));assert.ok(run("S.me.profileRefs19.includes(free)"),'«Сохранить» writes the photos');
run("var pp={status:'published',aud:'followers',media:[{type:'image',url:'a'}],text:'Один два три четыре пять шесть семь',title:''}");
assert.equal(run("editNeedsReview(pp,{...pp,text:pp.text+' восемь'})"),false,'a small text edit goes live');assert.equal(run("editNeedsReview(pp,{...pp,aud:'only'})"),false,'narrowing the audience goes live');
assert.equal(run("editNeedsReview(pp,{...pp,media:[...pp.media,{type:'image',url:'b'}]})"),true,'a new picture is reviewed');assert.equal(run("editNeedsReview(pp,{...pp,aud:'all'})"),true,'a wider audience is reviewed');
assert.equal(run("editNeedsReview(pp,{...pp,text:'новое '.repeat(30)})"),true,'a large rewrite is reviewed');assert.equal(run("editNeedsReview(null,pp)"),true,'a new post with pictures is reviewed');
run("S.actor='me';var hp=S.posts.find(x=>!ownedIdentity(x.author)&&filterPosts([x],'all').length).id,ha=S.posts.find(x=>!ownedIdentity(x.author)&&x.id!==hp&&filterPosts([x],'all').length).author;S.actor='couple';ACT.hidePost({dataset:{v:hp}});ACT.muteAuthor({dataset:{v:ha}})");
assert.equal(run("filterPosts([postById(hp)],'all').length"),0,'hidden in the couple’s feed');run("S.actor='me'");assert.equal(run("filterPosts([postById(hp)],'all').length"),1,'hiding as the couple does not hide it for me');assert.ok(run("S.posts.filter(x=>x.author===ha).some(x=>filterPosts([x],'all').length)"),'muting as the couple does not mute for me');
run("ACT.hidePost({dataset:{v:hp}});S.actor='couple';feedSet('hiddenPosts').delete(hp)");assert.equal(run("filterPosts([postById(hp)],'all').length"),1,'hiding as me does not hide it for the couple');run("S.actor='me'");
assert.ok(run("profileView('kai',{p:{}},{bodyOnly:1})").includes(run("galleryBlock('kai',false,{})").slice(0,40))||run("profileView('kai',{p:{}},{bodyOnly:1})").length>200,'Discover reuses the profile body');
{const deck=run("(S.actor='me',S.nav.tab='people',S.nav.stacks.people=[{id:'D03',p:{},f:{}}],SC.D03.render(cur().p,cur()))");assert.ok(!deck.includes('Полный профиль')&&deck.includes('pc-full'),'Discover shows the whole profile, not a short card with «Полный профиль»');assert.ok(!deck.includes('pc-coach'),'no coach card over the deck');}
// counters: one number for «Нужно решить», and every number is what the screen behind it lists
run("S.actor='me';S.nav.tab='me'");assert.equal(run("C.meTodo()"),run("todoCount()"),'the «Я» badge, the profile row and the inbox tab are one number');
assert.equal(run("TABDEF().find(x=>x[0]==='me')[3]"),run("C.meTodo()"));
run("links().push({id:'lkT',a:'nikajonas',b:'couple',kind:'friend',status:'pending',by:'nikajonas',vis:{nikajonas:'all',couple:'all'},t:Date.now()})");assert.ok(run("activePair()"));assert.equal(run("todoWhom(todoItems().find(i=>i.k==='link'&&i.l.id==='lkT'))"),'couple','a request to the couple is the couple’s decision');
run("go('N01',{k:'todo'})");{const t=run("SC.N01.render(cur().p,cur())");assert.ok(t.includes('whom-sec us')&&t.includes('whom-sec'),'the inbox splits «Нужно решить» into «Тебе» and «Паре»');assert.equal((t.match(/class="sec whom-sec/g)||[]).length,2);}
assert.equal(run("(()=>{const w=todoItems().map(todoWhom);return w.filter(x=>x==='me').length+w.filter(x=>x==='couple').length})()"),run("todoCount()"),'every decision belongs to you or to the couple');
assert.equal(run("notifications=currentNotifications().filter(notifNew).length"),run("bellCount()-todoCount()"),'the «Все уведомления» number is what the bell adds to decisions');
assert.equal(run("TABDEF().find(x=>x[0]==='people')[3]"),run("C.likesIn()||(C.likesAll()?'dot':0)"),'the «Люди» badge is the likes tab number of the acting profile');
run("go('N01',{k:'all'})");{const t=run("SC.N01.render({k:'all'},cur())");assert.ok(t.includes('class="whom'),'notifications say whether they are for you or for the couple');}
console.log('PASS V20.2: «Я» tabs by topic, couple links and settings, staged profile photos, re-review only for real changes, feed hiding per profile');
console.log('PASS V20: split-circle couple avatar, two profile cards, the mode reaches «Что у вас общего», profile photos from posts (one video, review mark, drag), feed optional for uploads, same «Я» for the couple, select mode');
console.log('PASS V19 rules in V20: one «Я / Мы» mode in the dock — couple likes, follows, communities and events; event answers ask the partner when approval is on');
\n// ---- V14 ----`);
src=src.replace("const tmp=path.join(os.tmpdir(),'feture-v14-contract-'","const tmp=path.join(os.tmpdir(),'feture-v14in20-contract-'");
const tmp=path.join(os.tmpdir(),'feture-v20-contract-'+process.pid+'.mjs');fs.writeFileSync(tmp,src);
try{await import(pathToFileURL(tmp).href);}finally{if(!process.env.KEEP)fs.rmSync(tmp,{force:true});}
