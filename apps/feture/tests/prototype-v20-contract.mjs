/* V20 keeps every V14 rule: the V14 contract (which itself runs the V13 contract) runs against the V20 file, with the dating mode
   read as the app mode (S.datingActor → S.actor), then the V18 and V19 rules, then the V20 checks — the switcher, profile photos,
   gallery uploads that are not feed posts, select mode. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import { pathToFileURL } from 'node:url';
const base=fs.readFileSync(new URL('./prototype-v14-contract.mjs',import.meta.url),'utf8');
const swap=(s,a,b)=>{if(!s.includes(a))throw new Error('V14 contract changed: '+a);return s.replace(a,b);};
let src=swap(base,"new URL('../public/prototype-v14.html',import.meta.url).href",JSON.stringify(new URL('../public/prototype-v20.html',import.meta.url).href));
src=swap(src,"new URL('./prototype-v13-contract.mjs',import.meta.url)",'new URL('+JSON.stringify(new URL('./prototype-v13-contract.mjs',import.meta.url).href)+')');
src=swap(src,"src+=`\n// ---- V14 ----","src=swap(src,\"assert.ok(run(\\\"profGo('couple')\\\").includes('data-go=\\\"P03\\\"'))\",\"assert.ok(run(\\\"profGo('couple')\\\").includes('data-v=\\\"couple\\\"'),'V17: my couple opens the profile tab, not a preview')\");\nsrc+=`\n// ---- V14 ----");
/* V20 (with #1270): no author pickers — the dock is the switch; the composer and reply bars name the author in a read-only line */
src=swap(src,"includes('author-picker v14 full'),'V14: the author is named in words above the text'","includes('as-line full'),'V20: the composer names the author in a read-only line, no picker'");
src=swap(src,"text(f07).includes('Опубликовать как')&&text(f07).includes('Мы')","text(f07).includes('Публикуется от')&&text(f07).includes('Alex')");
src=swap(src,"assert.ok(run(\"SC.P01.render(cur().p,cur())\").includes('class=\"p-author\"'),'profile actions say who acts')","assert.ok(!run(\"SC.P01.render(cur().p,cur())\").includes('class=\"p-author\"'),'V20: no author switch beside profile actions — the buttons name the author')");
/* V19: the composer takes its author from the one mode, not from a composer-only switch */
src=swap(src,"S.composeActor='couple';setPairTrust(true)","S.actor='couple';setPairTrust(true)");
/* V19: the dating mode is the app mode — inside the V14 contract, rename it in the V13 source before it runs */
src=swap(src,"src+=`\n// ---- V14 ----","src=src.split('S.dating'+'Actor').join('S.actor');\nsrc+=`\n// ---- V14 ----");
src=swap(src,'`\n// ---- V14 ----',`\`
// ---- V18 ----
assert.equal(run("meTabName()"),'Я','the tab is called «Я»');
prepare('X01');run("S.nav.tab='me';S.nav.stacks.me=[{id:'X01',p:{},f:{}}]");let x=run("SC.X01.render(cur().p,cur())");
assert.ok(x.includes('data-act="meLayer"')&&!x.includes('profile-page'),'«Я» is one screen with three layers, not a copy of the public profile');
for(const k of ['media','basics','details','priv'])assert.ok(x.includes('&quot;only&quot;:&quot;'+k+'&quot;')||x.includes('"only":"'+k+'"'),'block '+k+' opens its own short editor');
assert.ok(!x.includes('shareProfile')&&!x.includes('privLens')&&!x.includes('demoNote'),'no share button, no in-page lens, no demo buttons');
assert.ok(!x.includes('data-go="P07"')&&!x.includes('data-go="Q01"'),'no access or couple-settings shortcuts mixed into the profile layer');
run("ACT.meLayer({dataset:{v:'vis'}})");x=run("SC.X01.render(cur().p,cur())");
assert.ok(x.includes('data-sel="k4mode"')&&x.includes('data-sel="reqFrom"')&&x.includes('lv&quot;:&quot;card')||x.includes('"lv":"card"'),'Visibility holds Discover, who may ask and the Discover card preview');
assert.ok(x.includes('data-act="revoke"'),'who has access is managed in Visibility');
run("ACT.meLayer({dataset:{v:'mine'}})");x=run("SC.X01.render(cur().p,cur())");
assert.ok(x.includes('data-go="F10"')&&x.includes('mine&quot;:1')||x.includes('"mine":1'),'Mine is lists only, incl. what others shared with me');
assert.ok(!x.includes('data-sel=')&&!x.includes('editJar'),'Mine has no settings and no profile content');
run("coupleProfile();ACT.meSwitchTo({dataset:{v:'couple'}})");assert.equal(run("activeActor()"),'couple');assert.equal(run("cur().p.layer"),'mine','switching profile keeps the layer');
assert.equal(run("actionAuthor()"),'couple','«Мы» acts as the couple');assert.ok(run("editableProfile()!==S.me"));
run("ACT.meLayer({dataset:{v:'vis'}})");x=run("SC.X01.render(cur().p,cur())");assert.ok(x.includes('data-act="pairDating"')&&x.includes('data-act="pairTrustOpen"'),'couple rules live in the couple’s Visibility');
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
assert.ok(text(run("SC.E03.render(cur().p,cur())")).includes('2 места'),'«Идём» takes two places');
run("delete social('couple').rsvp['"+ev+"'];S.pairMember='partner';setPairTrust(false);S.pairMember='me';ACT.rsvp({dataset:{v:'going'},classList:{contains:()=>false,add:()=>{},remove:()=>{}},closest:()=>null,setAttribute:()=>{},removeAttribute:()=>{}})");
assert.ok(!run("social('couple').rsvp['"+ev+"']?.status"),'with partner approval switched on the answer waits');assert.equal(run("jointQueue()['rsvp_"+ev+"'].status"),'pending');
run("S.pairMember='partner';S.nav.stacks.feed.push({id:'N01',p:{k:'todo'},f:{}})");assert.ok(run("SC.N01.render(cur().p,cur())").includes('rsvp_'),'the partner finds the event answer in «Нужно решить»');run("ACT.jointReview({dataset:{v:'rsvp_"+ev+"'}})");assert.ok(text(run("S.ui.sheet.build().body")).includes('2 места'),'the review says what the couple answers');run("closeSheet(true)");
run("S.pairMember='partner'");assert.equal(run("approveJointWork('rsvp_"+ev+"',jointQueue()['rsvp_"+ev+"'].version)"),true);run("S.pairMember='me'");assert.equal(run("social('couple').rsvp['"+ev+"'].status"),'going','after the partner approves, the couple is going');
// a like from a profile never silently goes out as «Я» while in «Мы»
run("S.actor='couple';coupleProfile().dating=false");assert.ok(run("likeActor('mia').a")==='couple'&&!!run("likeActor('mia').why"),'in «Мы» a blocked like stays blocked, never falls back to «Я»');
// owned threads act as themselves; viewing the other own profile does not switch the mode
assert.equal(run("S.nav.stacks.feed.push({id:'H02',p:{id:'kai',actor:'me'},f:{}});actionAuthor()"),'me','a chat thread keeps its own identity');
run("S.actor='me';ACT.openOwn({dataset:{v:'couple'}})");assert.equal(run("activeActor()"),'me');assert.equal(run("cur().id"),'P03','the couple profile opens read-only, the mode stays «Я»');
// ---- V20 ----
run("S=freshState('pair');S.session={};initNav();S.nav.tab='me';S.nav.stacks.me=[{id:'X01',p:{},f:{}}];S.actor='me'");
assert.ok(run("dockHTML()").includes('me-tab'),'the dock tab carries the avatar slot class');
run("ACT.dockMe()");let sh=run("S.ui.sheet.build().body");assert.equal((sh.match(/class="actor-row"/g)||[]).length,2,'«Действовать как» has two rows');assert.equal((sh.match(/data-act="dockOpenMe"/g)||[]).length,1,'one «Открыть профиль»');
assert.ok(sh.includes('aria-checked="true"')&&sh.includes('role="menuitemradio"'),'the current profile is checked');
run("closeSheet(true);ACT.dockOpenMe()");assert.equal(run("activeActor()"),'me','«Открыть профиль» never switches the mode');
assert.ok(run("av('couple')").includes('av pair'),'a couple without its own photo shows both members');run("coupleProfile().photos=['/images/v10-content/post-p7-morning-coffee-45.webp'];coupleProfile().photo=coupleProfile().photos[0]");assert.ok(!run("av('couple')").includes('avh'),'a couple with a photo shows that photo');run("coupleProfile().photos=[];coupleProfile().photo=null");
run("S.nav.stacks.feed=[{id:'P01',p:{id:'mia'},f:{}}];S.nav.tab='feed'");assert.equal(run("authorPicker()"),'','no author picker beside actions');run("S.nav.tab='me'");
// profile photos: rules, live order, review, others' view
assert.equal(run("JSON.stringify(phRules([{type:'video',url:'v.mp4'},'/images/a.webp'],1).map(x=>typeof x))"),'["string","object"]','a video is never the main item');
assert.equal(run("phRules([{type:'video',url:'1'},{type:'video',url:'2'},'/images/a.webp'],1).length"),2,'one video per profile');
run("setMyPhotos(['/images/v10-content/gallery-e1-ropes.webp','/images/v10-content/gallery-e3-club.webp'],{quiet:true})");x=run("SC.X01.render(cur().p,cur())");
assert.ok(x.includes('id="mePh"')&&x.includes('data-reorder="phLiveOrder"'),'«Я» shows the profile photos and reorders them in place');
run("ACT.phLiveOrder({dataset:{order:'1,0'}})");assert.equal(run("S.me.photos[0]"),'/images/v10-content/gallery-e3-club.webp','dragging reorders the live profile');assert.equal(run("S.me.photo"),'/images/v10-content/gallery-e3-club.webp','the first photo is the main one');
assert.equal(run("addToProfile('me',['/images/v10-content/post-p2-rope-details.webp'],{review:true})"),1);assert.ok(run("S.me.phReview.length===1"),'a new profile photo waits for review');
run("S.nav.stacks.me.push({id:'P03',p:{},f:{}})");assert.ok(!run("photoItems('me').some(x=>x.src.includes('post-p2-rope-details'))"),'others don’t see a photo in review');run("S.nav.stacks.me.pop()");assert.ok(run("photoItems('me').some(x=>x.src.includes('post-p2-rope-details'))"),'the owner sees it at once');
run("qaApproveAll()");assert.equal(run("S.me.phReview.length"),0,'review approves profile photos');
// the gallery: own albums, uploads that are not feed posts, the feed only on request
assert.ok(run("galleryPosts('me').length>0&&albumsOf('me').some(a=>a.id==='me_a0')"),'demo personas have an own gallery with albums');
x=run("SC.X01.render(cur().p,cur())");assert.ok(x.includes('id="meGal"')&&x.includes('data-act="galOpenAlbum"'),'«Я» shows the gallery with albums');
{const gal=(x.split('id="meGal"')[1]||'').split('</section>')[0];assert.ok(gal.length>100&&!run("privMedia(S.me).map(privSrc)").some(u=>gal.includes(u)),'private media never show in the gallery block');}
run("var n0=S.myPosts.length;galDest('me','me_a0',[{type:'image',url:'/images/v10-content/gallery-e4-cafe.webp'},{type:'image',url:'/images/v10-content/post-p9-evening-atmosphere.webp'}]);ACT.gdCommit()");
assert.equal(run("S.myPosts.length-n0"),2,'each upload is its own gallery item');assert.ok(run("S.myPosts.slice(0,2).every(p=>p.galleryOnly&&p.album==='me_a0'&&p.status==='review')"),'gallery uploads stay out of the feed and are reviewed');
assert.ok(!run("filterPosts(S.myPosts.slice(0,2),{}).length"),'gallery-only uploads never reach the feed');
run("galDest('me',null,[{type:'image',url:'/images/v10-content/gallery-e1-ropes.webp'}]);S.ui.gd.feed=true;ACT.gdCommit()");assert.ok(run("!S.myPosts[0].galleryOnly"),'«Также выложить в ленту» makes one feed post');
run("S.actor='couple';S.pairMember='partner';setPairTrust(false);S.pairMember='me';galDest('couple',null,[{type:'image',url:'/images/v10-content/gallery-e4-cafe.webp'}]);ACT.gdCommit()");
assert.ok(run("Object.values(jointQueue()).some(q=>q.kind==='post'&&q.status==='pending'&&q.draft.galleryOnly)"),'a couple upload waits for the partner');run("S.actor='me'");
// select mode on the gallery
run("S.nav.stacks.me.push({id:'P20',p:{id:'me'},f:{}});ACT.galSel();cur().sel.add('own_me_0');cur().sel.add('own_me_1')");run("SC.P20.render(cur().p,cur())");assert.equal(run("SC.P20.dock"),false,'select mode hides the dock');
run("ACT.galSelAlbumSet({dataset:{v:'me_a1'}})");assert.ok(run("['own_me_0','own_me_1'].every(id=>S.myPosts.find(p=>p.id===id).album==='me_a1')"),'«В альбом» moves the picked items');
run("S.me.photos=[realMedia(S.myPosts.find(p=>p.id==='own_me_0'))[0].url];ACT.galSel();cur().sel.add('own_me_0');ACT.galSelAudSet({dataset:{v:'followers'}})");assert.equal(run("S.me.photos.length"),0,'a photo made followers-only leaves the public profile');
console.log('PASS V20: one switcher (rows, one link, no silent switch), profile photos live on «Я» with review, gallery uploads with albums that are not feed posts, select mode');
console.log('PASS V19 rules in V20: one «Я / Мы» mode in the dock — couple likes, follows, communities and events; event answers ask the partner when approval is on');
\n// ---- V14 ----`);
src=src.replace("const tmp=path.join(os.tmpdir(),'feture-v14-contract-'","const tmp=path.join(os.tmpdir(),'feture-v14in20-contract-'");
const tmp=path.join(os.tmpdir(),'feture-v20-contract-'+process.pid+'.mjs');fs.writeFileSync(tmp,src);
try{await import(pathToFileURL(tmp).href);}finally{fs.rmSync(tmp,{force:true});}
