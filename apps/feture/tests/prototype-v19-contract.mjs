/* V19 keeps every V14 rule: the V14 contract (which itself runs the V13 contract) runs against the V19 file, with the dating mode
   read as the app mode (S.datingActor → S.actor), then the V19 checks — one «Я / Мы» mode, switched on the avatar in the dock. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import { pathToFileURL } from 'node:url';
const base=fs.readFileSync(new URL('./prototype-v14-contract.mjs',import.meta.url),'utf8');
const swap=(s,a,b)=>{if(!s.includes(a))throw new Error('V14 contract changed: '+a);return s.replace(a,b);};
let src=swap(base,"new URL('../public/prototype-v14.html',import.meta.url).href",JSON.stringify(new URL('../public/prototype-v19.html',import.meta.url).href));
src=swap(src,"new URL('./prototype-v13-contract.mjs',import.meta.url)",'new URL('+JSON.stringify(new URL('./prototype-v13-contract.mjs',import.meta.url).href)+')');
src=swap(src,"src+=`\n// ---- V14 ----","src=swap(src,\"assert.ok(run(\\\"profGo('couple')\\\").includes('data-go=\\\"P03\\\"'))\",\"assert.ok(run(\\\"profGo('couple')\\\").includes('data-v=\\\"couple\\\"'),'V17: my couple opens the profile tab, not a preview')\");\nsrc+=`\n// ---- V14 ----");
/* Owner revision: action text names the author; no avatar/picker beside actions. */
src=swap(src,"includes('author-picker v14 full'),'V14: the author is named in words above the text'","includes('publishNow'),'V19: the publish action remains without a duplicate author picker'");
src=swap(src,"text(f07).includes('Опубликовать как')&&text(f07).includes('Мы')","text(f07).includes('Опубликовать от пары')&&!f07.includes('data-author-picker')");
src=swap(src,"assert.ok(run(\"SC.P01.render(cur().p,cur())\").includes('class=\"p-author\"'),'profile actions say who acts')","assert.ok(!run(\"SC.P01.render(cur().p,cur())\").includes('class=\"p-author\"'),'V19: no author avatar beside profile actions')");
/* V19: the composer takes its author from the one mode, not from a composer-only switch */
src=swap(src,"S.composeActor='couple';setPairTrust(true)","S.actor='couple';setPairTrust(true)");
/* V19: the dating mode is the app mode — inside the V14 contract, rename it in the V13 source before it runs */
src=swap(src,"src+=`\n// ---- V14 ----","src=src.split('S.dating'+'Actor').join('S.actor');\nsrc+=`\n// ---- V14 ----");
src=swap(src,'`\n// ---- V14 ----',`\`
// ---- V18 ----
assert.equal(run("meTabName()"),'Я','the tab is called «Я»');
prepare('X01');run("S.nav.tab='me';S.nav.stacks.me=[{id:'X01',p:{},f:{}}]");let x=run("SC.X01.render(cur().p,cur())");
assert.ok(x.includes('data-act="meLayer"')&&!x.includes('profile-page'),'«Я» is one screen with three layers, not a copy of the public profile');
for(const k of ['basics','details','priv'])assert.ok(x.includes('&quot;only&quot;:&quot;'+k+'&quot;')||x.includes('"only":"'+k+'"'),'block '+k+' opens its own short editor');
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
console.log('PASS V18 rules in V19: «Я» — three layers, block editors, one preview with the Discover card, one couple draft');
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
console.log('PASS V19 unified media: single upload, public selection, private projections, hidden/review gates, separate owners and partner approval');
console.log('PASS V19: one «Я / Мы» mode in the dock — couple likes, follows, communities and events; event answers ask the partner when approval is on');
\n// ---- V14 ----`);
src=src.replace("const tmp=path.join(os.tmpdir(),'feture-v14-contract-'","const tmp=path.join(os.tmpdir(),'feture-v14in19-contract-'");
const tmp=path.join(os.tmpdir(),'feture-v19-contract-'+process.pid+'.mjs');fs.writeFileSync(tmp,src);
try{await import(pathToFileURL(tmp).href);}finally{fs.rmSync(tmp,{force:true});}
