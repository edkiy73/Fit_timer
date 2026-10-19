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
run("toast=()=>{};showMatch=()=>{};renderSide=()=>{};paintAuthor=()=>{};paintReactions=()=>{};back=()=>{};");
function prepare(id='Q03',p={}){timers.length=0;run(`S=freshState('pair');S.session={};QA.autoApprove=false;QA.maintenance=false;initNav();S.nav.stacks.feed=[{id:${JSON.stringify(id)},p:${JSON.stringify(p)},f:{}}];`);}
async function finish(p){const fn=timers.shift();assert.ok(fn,'expected model network timer');fn();await p;await Promise.resolve();}
for(const lang of ['ru','en']){
 prepare('F07');run(`S.lang='${lang}';coupleProfile();S.pair.proposal=null;var r=cur();r.f.text='draft';r.media=[{url:'one'},{url:'two'}];r.tags=['talk'];var before=JSON.stringify({f:r.f,media:r.media,tags:r.tags});ACT.chooseAuthor({dataset:{v:'couple'}})`);assert.equal(run('JSON.stringify({f:r.f,media:r.media,tags:r.tags})'),run('before'));assert.equal(run('r.author'),'couple');
 run("r.p.draft={author:'couple',pairId:S.pair.id,composeId:'test',text:'post by us',tags:['talk'],aud:'all',media:[],poll:null,result:null};var postCount=S.myPosts.length;ACT.publish(null)");await finish();assert.equal(run('S.myPosts.length'),run('postCount'),'no public post before consent');run("var q=Object.values(jointQueue())[0]");assert.equal(run("approveJointWork(q.id,q.version,'me')"),false);assert.equal(run("approveJointWork(q.id,q.version,'outsider')"),false);assert.equal(run("approveJointWork(q.id,q.version,S.pair.with)"),true);assert.equal(run('S.myPosts[0].author'),'couple');assert.equal(run("approveJointWork(q.id,q.version,S.pair.with)"),false,'one publication only');
 run("social('couple').follows.add('maya');S.follows.delete('maya')");assert.equal(run("followingOf('couple').includes('maya')"),false);assert.equal(run("followingOf('me').includes('maya')"),false);for(const op of ['react','comment','follow','community','event'])assert.equal(run(`canAct('${op}','couple')`),false);
 prepare('P01',{id:'mia'});assert.ok(run("receivedGrant('mia')"));run("S.datingActor='couple'");assert.equal(run('actionAuthor()'),'me');run("cur().id='D03'");assert.equal(run("receivedGrant('mia')"),undefined);assert.equal(run("privSection('mia').includes('privPeek')"),false);
 run("S.quota.max=2;S.reqOut=[{t:Date.now()}];social('couple').reqOut=[{t:Date.now()}]");assert.equal(run('C.quotaLeft()'),0);
 prepare('Q03');run("S.pair.proposal=null;var d=editableProfile({p:{owner:'couple'}});d.name={ru:'Together',en:'Together'};d.bio='BIO';d.jars=[{t:'shibari',lv:9,vis:'public'}];d.media=[{url:'PRIVATE'}];markCoupleDraft();submitCoupleDraft();var q=S.pair.proposal;d.bio='NEWER'");assert.equal(run('q.text.bio'),'BIO');assert.equal(run("commitCoupleProposal(S.pair,'me',q.id)"),false);assert.equal(run("commitCoupleProposal(S.pair,'outsider',q.id)"),false);assert.equal(run("commitCoupleProposal(S.pair,S.pair.with,'wrong')"),false);assert.equal(run("commitCoupleProposal(S.pair,S.pair.with,q.id)"),true);assert.equal(run('S.pair.profile.bio'),'BIO');
 prepare();run("S.pair.memberCommunities={kira:['rope']}");assert.equal(run("communityAuthorAllowed('rope','couple')"),false);assert.equal(run("communityAuthorAllowed('rope','me')"),true);run("S.communityRestrictions={rope:{me:true}}");assert.equal(run("communityAuthorAllowed('rope','me')"),false);
 prepare('H01');run("social('couple').matches=[{p:'mia'},{p:'tomeva'}];var t3=ensureThread('mia','couple'),t4=ensureThread('tomeva','couple')");assert.equal(run('t3.members.length'),3);assert.equal(run('t4.members.length'),4);assert.equal(run("isMatch('kira','couple')"),false);assert.equal(run("ensureThread('mia','me').members.length"),2);
 run("var media={mode:'t15',url:'PRIVATE',recipients:['me','kira'],views:{me:{openedAt:chatNow()-16*60e3,done:false},kira:{openedAt:null,done:false}}}");assert.equal(run("cmState(media,'me')"),'expired');assert.equal(run('media.url'),'PRIVATE');assert.equal(run("cmState(media,'kira')"),'unopened');
 run("pairNotify('message','one',{go:['H01']});var n1=S.pair.notifications.me[0],n2=S.pair.notifications.kira[0];n1.read=true");assert.equal(run('n2.read'),false);
 run("var personal=JSON.stringify(S.me);dissolvePair()");assert.equal(run("authorAllowed('couple')"),false);assert.equal(run("isMatch('mia','couple')"),false);assert.equal(run('requestPairRestore()'),false);assert.equal(run('requestPairRestore()'),false);run("S.pairMember='partner'");assert.equal(run('requestPairRestore()'),true);assert.equal(run('coupleProfile().datingVisible'),false);
 run("S.pairMember='me';dissolvePair();expirePair(Date.now()+31*DAY)");assert.equal(run('S.pair.status'),'deleted');assert.equal(run('S.pair.profile'),undefined);assert.equal(run('S.pair.social'),undefined);assert.equal(run('JSON.stringify(S.me)'),run('personal'));assert.equal(run("freshState('new').datingActor"),'me');console.log('PASS social identity',lang,'author, draft, grants, quota, version, rights, chats, media, notifications, unlink, restore, purge/reset');
}
// Focused regressions found by independent review: safety stop beats delayed consent;
// actor context stays denied after dissolution; regular shared media remains regular.
prepare('P07',{owner:'couple'});run("S.pair.proposal=null;var st=social('couple');st.reqIn=[{id:'grant-race',p:'mia',scopes:['info'],status:'new'}];S.ui.gr={id:'grant-race',sel:['info'],term:'7'};ACT.grOk(null);pairSafety('sharing')");await finish();assert.equal(run("st.sharedByMe.length"),0,'safety stop cannot be undone by an in-flight grant');
prepare('H02',{id:'mia',actor:'couple'});run("social('couple').matches.push({p:'mia'});ensureThread('mia','couple')");assert.ok(run("chatMediaHTML({me:1,media:{mode:'normal',url:'image',type:'image',recipients:['mia']}},0)").includes('data-act="chatMedia"'));run("dissolvePair();S.author='me'");assert.equal(run('authorGuard()'),false);
prepare('Q02');run("S.pair=null;S.pairInvite={nick:'kira',by:'me',status:'pending'};var ownInviteAccept=acceptPairInvitation();S.pairMember='partner';acceptPairInvitation()");assert.equal(run('ownInviteAccept'),false);assert.equal(run('activePair()'),true);assert.equal(run('coupleProfile().dating'),false);assert.equal(run('coupleProfile().datingVisible'),false);assert.equal(run('acceptPairInvitation()'),false);
console.log('PASS safety stop vs delayed grant, inactive route actor, regular shared media and invitation limits');
prepare('Q03');run("S.pair.proposal=null;editableProfile({p:{owner:'couple'}}).bio='Explicit approval';markCoupleDraft();submitCoupleDraft();qaApproveAll()");assert.equal(run('S.pair.proposal.status'),'pending','global QA auto approval must not approve a shared profile revision');
console.log('PASS shared profile always requires an explicit other-partner decision');

prepare('H02',{id:'mia',actor:'couple'});run("var expiredForOne={mode:'t15',type:'image',url:'PRIVATE_EXPIRED_READER',recipients:['me','kira'],views:{me:{openedAt:chatNow()-16*60e3,done:false},kira:{openedAt:null,done:false}}}");assert.equal(run("chatMediaHTML({me:0,media:expiredForOne},0).includes('PRIVATE_EXPIRED_READER')"),false);assert.equal(run('expiredForOne.url'),'PRIVATE_EXPIRED_READER');
prepare('P02',{owner:'couple'});run("editableProfile(cur());cur().pairLease=S.pair.draftLease;cur().pairVersion=S.pair.draftVersion||0;markCoupleDraft()");assert.equal(run('cur().pairVersion'),run('S.pair.draftVersion'));run('markCoupleDraft(true)');assert.notEqual(run('cur().pairVersion'),run('S.pair.draftVersion'));
console.log('PASS merged inline draft baseline and expired recipient DOM isolation');


// Versioned joint work cannot self-approve, replay stale consent or leak media after unlinking.
prepare('Q03');run("coupleProfile();S.me.jars=[];S.pair.profile.jars=[{t:'shibari',lv:7,vis:'public'}];var d={author:'couple',pairId:S.pair.id,by:'me',text:'VERSION_ONE',tags:[],aud:'all',media:[],poll:null,result:['shibari']};submitJointPost(d,'joint-version',null);var v1=jointQueue()['joint-version'].version;d.text='VERSION_TWO';submitJointPost(d,'joint-version',null)");assert.equal(run("approveJointWork('joint-version',v1,'kira')"),false);assert.equal(run("approveJointWork('joint-version',v1+1,'kira')"),true);assert.equal(run("S.myPosts.find(p=>p.id==='joint-version').result[0][0]"),'shibari');assert.equal(run("S.myPosts.filter(p=>p.id==='joint-version').length"),1);
run("S.myPosts.find(p=>p.id==='joint-version').media=[{url:'JOINT_MEDIA_MUST_HIDE'}];var personalPost=JSON.stringify(S.myPosts.find(p=>p.id==='m1'));dissolvePair()");assert.equal(run("SC.F10.render().includes('JOINT_MEDIA_MUST_HIDE')"),false);assert.equal(run("allPosts().some(p=>p.id==='joint-version')"),false);assert.equal(run("JSON.stringify(S.myPosts.find(p=>p.id==='m1'))"),run('personalPost'));assert.equal(run("approveJointWork('joint-version',2,'kira')"),false);
prepare('P07',{owner:'couple'});run("coupleProfile();social('couple').reqIn=[{id:'joint-grant',p:'mia',status:'new',scopes:['info']}];queueJointGrant(social('couple').reqIn[0],{sel:['info']},null);var gq=jointQueue()['grant_joint-grant']");assert.equal(run("social('couple').sharedByMe.length"),0);assert.equal(run("approveJointWork(gq.id,gq.version,'me')"),false);assert.equal(run("approveJointWork(gq.id,gq.version,'kira')"),true);assert.equal(run("social('couple').sharedByMe[0].viewers.join(',')"),'mia');run("pairSafety('sharing')");assert.equal(run("social('couple').sharedByMe.length"),0);
prepare('P01',{id:'mia',actor:'couple'});run("coupleProfile();S.datingActor='couple'");assert.equal(run('actionAuthor()'),'me');assert.equal(run('accessActor()'),'couple');assert.equal(run("receivedGrant('mia')"),undefined);run("S.pairMember='partner'");assert.equal(run("authorAllowed('me')"),false);
console.log('PASS joint work version replay, public-result owner, archive data preservation, mutual grants and explicit access context');

prepare('P01',{id:'mia'});run("var capturedViewer;openViewer=(items,index,o)=>{capturedViewer=o};var privateGrant=receivedGrant('mia');privateGrant.granted=['info','photos'];ACT.privPeek({dataset:{v:'mia',i:'0'}})");assert.equal(run('capturedViewer.guard()'),true);run("privateGrant.granted=['info']");assert.equal(run('capturedViewer.guard()'),false,'narrowing a media scope revokes an already open viewer');
console.log('PASS fullscreen private viewer denies a narrowed media scope on the same grant object');

prepare('Q01');run("S.pair=null;S.pairInvite={nick:'kira',by:'me',status:'pending'};qaApproveAll()");assert.equal(run('activePair()'),false);assert.equal(run("S.pairInvite.status"),'pending');
console.log('PASS invitation cannot self-accept or inherit a global QA approval');

prepare('D03');run("coupleProfile();S.deckOrder.unshift('kira');S.datingActor='me'");assert.equal(run("pool().includes('kira')"),false,'current partner is never a discover candidate');run("S.datingActor='couple';S.pair.profile.dating=true");assert.equal(run("pool().includes('kira')"),false);
console.log('PASS partner excluded from both personal and joint discovery');

// Review-only partner mode must not claim the pair is inactive on personal discussion screens.
for(const lang of ['ru','en']){
 prepare('C06',{id:'d1'});run(`S.lang='${lang}';S.pairMember='partner'`);
 assert.equal(run("authorAllowed('me')"),false,'reviewer still cannot write into Alex personal history');
 const reason=run("communityAuthorReason('rope','me','comment')");
 assert.ok(reason.includes('V10'));assert.ok(!/отключён|inactive/.test(reason));
 run("S.pairMember='me'");assert.equal(run("communityAuthorReason('rope','me','comment')"),'');
 const replies=run("replyTree('d','d1')");
 assert.ok(replies.includes(lang==='ru'?'Ответ скрыт: автор заблокирован':'Reply hidden: author blocked'));
 assert.ok(!replies.includes('Можно ссылку на видео'));
}
console.log('PASS discussion explains QA reviewer mode and blocked reply without weakening personal permissions');

// Mutual trust delegates future shared content only; it never grants private access.
prepare('Q03');run("coupleProfile();S.pair.proposal=null;var prior={author:'couple',pairId:S.pair.id,by:'me',text:'Awaiting original consent',tags:[],aud:'all',media:[],poll:null,result:null};submitJointPost(prior,'old-pending');setPairTrust(true)");
assert.equal(run('pairTrusted()'),false,'one partner cannot enable trust');
run("S.pairMember='partner';setPairTrust(true)");assert.equal(run('pairTrusted()'),true);
assert.equal(run("jointQueue()['old-pending'].status"),'pending','trust cannot auto-publish existing pending work');
run("var trustedDraft={...prior,text:'Future shared post'};submitJointPost(trustedDraft,'trusted-new')");
assert.equal(run("S.myPosts.filter(p=>p.id==='trusted-new').length"),1);assert.equal(run("jointQueue()['trusted-new'].status"),'approved');
run("var profileDraft=editableProfile({p:{owner:'couple'}});profileDraft.bio='Trusted complete version';markCoupleDraft();submitCoupleDraft()");assert.equal(run("T(S.pair.profile.bio)"),'Trusted complete version');assert.equal(run('S.pair.proposal'),null);
run("var trustGrant={id:'trust-grant',p:'mia',status:'new',scopes:['info']};social('couple').reqIn=[trustGrant];queueJointGrant(trustGrant,{sel:['info']},null);var trustQ=jointQueue()['grant_trust-grant']");
assert.equal(run("trustQ.status"),'pending');assert.equal(run("approveJointWork(trustQ.id,trustQ.version,pairMember())"),false,'trust does not allow self-approved sensitive grants');
assert.equal(run("social('couple').sharedByMe.some(x=>x.p==='mia')"),false);
run("var trustTicket=authorTicket('couple');setPairTrust(false)");assert.equal(run('pairTrusted()'),false);assert.equal(run('validAuthor(trustTicket)'),false,'revocation invalidates delayed writes');
run("submitJointPost({...trustedDraft,text:'Needs consent again'},'after-revoke')");assert.equal(run("jointQueue()['after-revoke'].status"),'pending');assert.equal(run("S.myPosts.some(p=>p.id==='after-revoke')"),false);
run("setPairTrust(true);S.pairMember='me';setPairTrust(true);dissolvePair()");assert.equal(run('pairTrusted()'),false);assert.equal(run('S.pair.trust'),null);
run("S.pair.status='active'");assert.equal(run('pairTrusted()'),false,'restoration never restores delegated consent');
for(const lang of ['ru','en']){prepare('Q03');run(`S.lang='${lang}';coupleProfile()`);const h=run("SC.Q01.render(cur().p,cur())");assert.ok(h.includes('pairTrustOpen'));assert.ok(!h.includes('Редактировать приватную часть'));assert.ok(!h.includes('Edit private part'));
 const review=run("jointPostReview({author:'couple',text:'Review content',tags:[],aud:'all',media:[],poll:null,result:null})");assert.ok(!/postMenu|likePost|savePost|sharePost|post-a/.test(review),'approval preview contains no dead social controls');
 const hidden=run("replyTree('d','d1')");assert.ok(hidden.includes('cm-ghost'));assert.ok(hidden.includes('aria-hidden="true"'));
}
console.log('PASS mutual content trust, revocation, explicit private grants, unlink reset and focused review UI');
prepare('Q03');run("sheet=()=>{};coupleProfile();ACT.pairTrustOpen();var oldTrustButton={dataset:{form:trustConsentForm.id,pair:S.pair.id,epoch:String(S.pair.safetyEpoch||0),v:'on'}};S.pairMember='partner';ACT.pairTrustSet(oldTrustButton)");assert.equal(run('S.pair.trust'),undefined,'stale form cannot consent for another participant');
run("S.pairMember='me';ACT.pairTrustOpen();oldTrustButton.dataset.form=trustConsentForm.id;S.session={};ACT.pairTrustSet(oldTrustButton)");assert.equal(run('S.pair.trust'),undefined,'stale consent cannot cross session');
console.log('PASS trust consent is bound to the opening session and participant');
for(const owner of ['me','couple']){prepare('P02',{owner});run("coupleProfile();setPairTrust(true);S.pairMember='partner';setPairTrust(true);S.pairMember='me';SC.P02.render(cur().p,cur());cur().privOn=true;cur().f.privText='Unified editor private text';cur().dirty=true");
 const query=document.querySelector;document.querySelector=s=>s==='[name="privText"]'?null:query(s);
 const save=run('ACT.peSave(null)');await finish(save);document.querySelector=query;
 assert.equal(run(owner==='me'?'T(S.me.privText)':'T(S.pair.profile.privText)'),'Unified editor private text','unified RTE saves private text without a legacy textarea');}
console.log('PASS unified profile editor saves rich private text for personal and trusted couple profiles');
// Acting identity: remembered modes, likes from a profile (person and couple targets), pair page without actions.
{prepare('P01',{id:'mia'});run("S.me.dating=true;S.me.socialLikes=true;coupleProfile();S.pair.profile.dating=true;S.pair.profile.datingVisible=true;S.datingActor='couple'");
 assert.equal(run("likeActor('mia').a"),'couple','couple mode likes a dating profile as the couple');
 assert.equal(run("likeActor('maya').a"),'me');assert.equal(run("likeActor('maya').why"),'solo','social-only target is liked personally, with the reason shown');
 assert.equal(run("canLikeFrom('couple','maya')"),false);assert.equal(run("canLikeFrom('me','lenamax')"),true,'a couple with dating on can be liked from its page');
 run("S.pair.profile.dating=false");assert.equal(run("likeActor('mia').a"),'me');assert.equal(run("likeActor('mia').why"),'coupleOff','couple dating off falls back to personal with a reason');
 run("S.pair.profile.dating=true");
 const target=run("Object.keys(PEOPLE).find(id=>PEOPLE[id].dating&&!PEOPLE[id].pair&&!relatedFor('couple',id)&&!social('couple').likesIn.some(l=>l.p===id)&&!social('couple').matches.some(m=>m.p===id)&&!isBlocked(id))");assert.ok(target);
 const meBefore=run("S.likesOut.length");await finish(run(`ACT.likeProfile({dataset:{v:'${target}'},classList:{contains:()=>false,add(){},remove(){}},setAttribute(){},removeAttribute(){}})`));
 assert.equal(run(`social('couple').likesOut.some(l=>l.p==='${target}'&&l.src==='profile')`),true,'profile like is recorded on the couple side');
 assert.equal(run("S.likesOut.length"),meBefore,'the personal list is untouched');
 assert.equal(run(`withActor('me',()=>social().likesOut.some(l=>l.p==='${target}'))`),false);
 assert.ok(text(run(`profileActorLine('${target}',{a:'me'})`)).includes('Alex'),'the line names the other identity that already acted');
 assert.equal(run("profileActorLine('mia',{a:'me'}).length>0"),true);
 prepare('F07');run("coupleProfile();ACT.chooseAuthor({dataset:{v:'couple',k:'compose'}})");assert.equal(run('S.composeActor'),'couple');
 prepare('F07');run("S.composeActor='couple';coupleProfile()");run("SC.F07.render(cur().p,cur())");assert.equal(run('cur().author'),'couple','the publishing identity is remembered');
 prepare('Q03');run("coupleProfile()");const page=run("SC.Q03.render(cur().p,cur())");for(const a of ['pairTrustOpen','pairSubmit','jointReview','pairHide','Q06','F07'])assert.ok(!String(page).includes(a),'couple page has no actions: '+a);
 const hub=run("SC.Q01.render(cur().p,cur())");assert.ok(hub.includes('pairTrustOpen')&&hub.includes('Q06'),'all pair management lives in one hub');
 prepare('P01',{id:'mia'});run("S.me=S.me;S.datingActor='me'");assert.ok(!run("profileActorLine('mia',{a:'me'})").includes('undefined'));
 console.log('PASS acting identity: remembered modes, couple/personal profile likes with reasons and other-side state, couple page without actions, single pair hub');}
// One inbox: access requests (personal and couple), partner approvals, host requests; quick share = everything asked for 7 days.
{prepare('N01',{});run("coupleProfile();S.pair.proposal=null");
 const kinds=run("todoItems().map(x=>x.k+':'+(x.a||''))");assert.ok(kinds.some(k=>k.startsWith('req:me')),'personal requests are decisions');assert.ok(kinds.some(k=>k==='comm:'||k==='event:'),'host requests are decisions');
 const html=run("todoHTML()");assert.ok(html.includes('grantQuick')&&html.includes('decline'),'inbox cards decide in place');
 const id=run("S.reqIn.find(r=>r.status==='new').id");const scopes=run(`S.reqIn.find(r=>r.id==='${id}').scopes.join()`);
 await finish(run(`ACT.grantQuick({dataset:{v:'${id}',actor:'me'},classList:{contains:()=>false,add(){},remove(){}},setAttribute(){},removeAttribute(){}})`));
 assert.equal(run(`S.reqIn.find(r=>r.id==='${id}').status`),'open');assert.equal(run(`S.reqIn.find(r=>r.id==='${id}').granted.join()`),scopes,'quick share opens everything that was asked');
 const days=run(`Math.round((S.reqIn.find(r=>r.id==='${id}').until-Date.now())/86400000)`);assert.equal(days,7);
 assert.ok(!run("SC.D03.render({sub:'discover'},cur())").includes("pplSub\" data-v=\"requests"),'People has no Requests tab');
 const access=run("accessBody({tab:'in'})");assert.ok(!access.includes('data-v="in"'),'Access is a ledger: no incoming-decision tab');
 console.log('PASS one inbox for decisions: personal/couple requests, partner approvals, host requests; quick share for 7 days; People and Access without request tabs');}
