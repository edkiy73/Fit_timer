import fs from 'node:fs';import { fileURLToPath } from 'node:url';import vm from 'node:vm';import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../public/prototype-v13.html',import.meta.url),'utf8'); const source=f=>html.split('/* ---- '+f+'.js ---- */')[1].split('/* ---- ')[0];
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
// Each member independently opts in to reviewing the partner's shared actions.
for(const lang of ['ru','en']){
 prepare();run(`S.lang='${lang}';coupleProfile()`);
 assert.equal(run('pairTrusted()'),true);
 run('setPairTrust(false)');assert.equal(run('pairApprovalRequired()'),true);assert.equal(run('pairTrusted()'),true);
 run("S.pairMember='partner'");assert.equal(run('pairTrusted()'),false);assert.equal(run('pairApprovalRequired()'),false);
 run("setPairTrust(false);S.pairMember='me';setPairTrust(true)");assert.equal(run('pairTrusted()'),false);
 run("S.pairMember='partner'");assert.equal(run('pairTrusted()'),true);
 prepare();run("coupleProfile();editableProfile({p:{owner:'couple'}}).bio='new';markCoupleDraft(true)");
 assert.equal(run('submitCoupleDraft()'),true);assert.equal(run('T(S.pair.profile.bio)'),'new');assert.equal(run('S.pair.proposal'),null);
 assert.ok(run("S.pair.notifications[S.pair.with].some(n=>n.pairEvent==='profileUpdated')"));
 prepare();run("coupleProfile();S.pairMember='partner';setPairTrust(false);S.pairMember='me';editableProfile({p:{owner:'couple'}}).bio='pending v1';markCoupleDraft(true);submitCoupleDraft();var v1=S.pair.proposal.id;S.pair.draft.bio='pending v2';markCoupleDraft(true);submitCoupleDraft();var v2=S.pair.proposal.id;S.pairMember='partner'");
 assert.equal(run('commitCoupleProposal(S.pair,pairMember(),v1)'),false);
 assert.equal(run('commitCoupleProposal(S.pair,pairMember(),v2)'),true);assert.equal(run('T(S.pair.profile.bio)'),'pending v2');
 prepare('P07',{owner:'couple'});run("coupleProfile();var req={id:'v12grant',p:'mia',status:'new',scopes:['info']};social('couple').reqIn=[req]");
 assert.equal(run("queueJointGrant(req,{sel:['info']},null)"),true);assert.equal(run('req.status'),'open');assert.ok(run("givenGrant('mia')"));
 prepare('P07',{owner:'couple'});run("coupleProfile();S.pairMember='partner';setPairTrust(false);S.pairMember='me';var req={id:'v12grant',p:'mia',status:'new',scopes:['info']};social('couple').reqIn=[req];queueJointGrant(req,{sel:['info']},null);var q=jointQueue()['grant_v12grant']");
 assert.equal(run('req.status'),'new');run('setPairTrust(false)');assert.equal(run('approveJointWork(q.id,q.version,pairMember(),true)'),false);
 run("S.pairMember='partner';S.pair.revision=(S.pair.revision||0)+1");assert.equal(run('approveJointWork(q.id,q.version)'),false);
 prepare('N01');run("var grBtn=Object.assign(document.querySelector('test'),{dataset:{v:'r1',actor:'me'}});ACT.grant(grBtn)");
 assert.deepEqual(json('S.ui.gr.sel'),['info','photos']);
 await finish(run("ACT.grOk(document.querySelector('test'))"));assert.equal(run("S.reqIn.find(x=>x.id==='r1').status"),'open');assert.ok(run("S.sharedByMe.find(x=>x.p==='kai')"));
 console.log('PASS independent approval preferences, automatic profile delivery, stale revisions and private grants',lang);
}
prepare('P07',{owner:'couple'});run("coupleProfile();S.pairMember='partner';setPairTrust(false);S.pairMember='me';var prefReq={id:'pref-grant',p:'mia',status:'new',scopes:['info']};social('couple').reqIn=[prefReq];queueJointGrant(prefReq,{sel:['info']},null);setPairTrust(false);S.pairMember='partner';var prefQ=jointQueue()['grant_pref-grant']");
assert.equal(run('approveJointWork(prefQ.id,prefQ.version)'),true,'unrelated personal preference change cannot strand pending grants');
prepare('P02',{owner:'couple'});run("SC.P02.render(cur().p,cur());cur().f.bio='Saved directly from editor';ACT.peSave(document.querySelector('test'))");await finish();
assert.equal(run('T(S.pair.profile.bio)'),'Saved directly from editor');assert.equal(run('S.pair.proposal'),null);
prepare('P02',{owner:'couple'});run("S.pairMember='partner';setPairTrust(false);S.pairMember='me';SC.P02.render(cur().p,cur());cur().f.bio='Editor pending';ACT.peSave(document.querySelector('test'))");await finish();
assert.equal(run('T(S.pair.proposal.text.bio)'),'Editor pending');assert.equal(run('S.pair.proposal.status'),'pending');assert.ok(!run("pairStatusHTML().includes('data-act=\"pairSubmit\"')"));
prepare('D03');run("S.me.socialLikes=false;var likeTarget=pool().find(id=>!PEOPLE[id].pair);likePerson(likeTarget,'discover')");assert.ok(run('S.likesOut.some(x=>x.p===likeTarget)||isMatch(likeTarget)'));
run("PEOPLE[likeTarget].socialLikes=false");assert.equal(run("canLikeFrom('me',likeTarget)"),false);assert.equal(run('PEOPLE[likeTarget].dating'),true);
console.log('PASS preference-change pending-grant regression, actual editor auto-save and independent dating likes');
// People round 5: likes «Тебе» pass + undo, couple Discover visibility lives in couple settings, couple profile = solo preview screen.
prepare('D03',{sub:'likes'});run("var passId=social().likesIn.find(l=>!l.passed&&!isMatch(l.p)).p;ACT.likePass({dataset:{v:passId}})");
assert.equal(run('C.likesIn()'),run("social().likesIn.filter(l=>!isMatch(l.p)&&!isBlocked(l.p)&&!l.passed).length"));assert.equal(run('social().decided[passId]'),-1);
assert.ok(!text(run("likesBody(cur())")).includes(run("sharedSummary(passId)")),'likes cards carry no match captions');
prepare('P02',{owner:'couple'});assert.ok(!run("SC.P02.render(cur().p,cur())").includes('data-act="pairDating"'),'Discover visibility is not a profile-editor field');
prepare('Q01');run("coupleProfile()");assert.ok(run("SC.Q01.render({},cur())").includes('data-act="pairDating"'));
assert.equal(run('pairDatingState()'),'on','a new couple is shown in Discover by default');
run("S.me.ageCheck='ok';PEOPLE[S.pair.with].verified=true;ACT.pairDating()");assert.equal(run('pairDatingState()'),'off');
run("ACT.pairDating()");assert.equal(run('pairDatingState()'),'on');assert.equal(run('S.pair.profile.datingVisible'),true);
prepare('Q01');run("coupleProfile().dating=false;coupleProfile().datingVisible=false;S.pairMember='partner';setPairTrust(false);S.pairMember='me';S.me.ageCheck='ok';PEOPLE[S.pair.with].verified=true;ACT.pairDating()");
assert.equal(run('pairDatingState()'),'pending');assert.equal(run('S.pair.profile.datingVisible'),false);
assert.ok(run("profGo('couple')").includes('data-go="P03"'));
console.log('PASS likes pass/undo without captions, couple Discover visibility in couple settings, couple profile uses the solo preview');
// Couple gender/orientation/age come from members' own profiles; Discover filters: any member for gender/orientation, every shown age in range.
prepare('D03');run("var df={show:'all',age:[18,99],dist:100,gender:[],orient:[],format:[],seek:[],topics:[],role:[],placeMode:'city',city:'',coords:null}");
const pairsFor=f=>json(`Object.keys(PEOPLE).filter(k=>PEOPLE[k].pair&&passDating(k,Object.assign({},df,${JSON.stringify(f)})))`);
assert.deepEqual(pairsFor({orient:['hetero']}),['lenamax'],'one hetero member is enough');
assert.ok(pairsFor({gender:['woman']}).includes('lenamax'));assert.deepEqual(pairsFor({gender:['nonbinary']}),[]);
assert.deepEqual(pairsFor({age:[30,33]}),[],'every member with a shown age must be in range');assert.ok(pairsFor({age:[29,34]}).includes('lenamax'));
run("coupleProfile()");assert.deepEqual(json("pairPeople('couple').map(m=>m.id)"),['me',run('S.pair.with')]);
run("S.me.showAge=false");assert.equal(run("pairPeople('couple')[0].age"),null,'hidden personal age is not exposed through the couple');
assert.ok(text(run("pairLine('lenamax')")).includes(run("opt('orient','hetero')")),'members block shows each member’s own data');assert.ok(!run("detailsGroup('lenamax')").includes('Lena'));
run("S.pair=null;S.pairInvite=null");assert.ok(run("SC.Q01.render({},cur())").includes(run("L('Сразу после создания','Right after you create it')")),'defaults are explained on creation');
console.log('PASS couple details from members, Discover filters for couples');
// An untouched draft opened by the partner does not block turning Discover back on.
prepare('Q01');run("coupleProfile().dating=false;coupleProfile().datingVisible=false;S.me.ageCheck='ok';PEOPLE[S.pair.with].verified=true;S.pairMember='partner';editableProfile({p:{owner:'couple'}});S.pairMember='me';ACT.pairDating()");
assert.equal(run('pairDatingState()'),'on','partner’s untouched draft must not lock the Discover switch');
console.log('PASS untouched partner draft does not block the Discover switch');
// Sent back for changes: optional note, sender sees it in the inbox and the notification, can rework or discard; access has a way out.
prepare('Q01');run("coupleProfile();S.pairMember='partner';setPairTrust(false);S.pairMember='me';editableProfile({p:{owner:'couple'}}).bio='v1';markCoupleDraft(true);submitCoupleDraft();var pid=S.pair.proposal.id");
run("S.pairMember='partner'");assert.equal(run("returnWork('profile',pid,'другое фото')"),true);run("S.pairMember='me'");
assert.equal(run("S.pair.proposal.status"),'returned');assert.ok(run("todoItems().some(x=>x.k==='profileBack')"),'sender has the returned version to do');
assert.ok(text(run("NTXT.pair(currentNotifications().find(n=>n.pairEvent==='returned'))")).includes('другое фото'),'note rides in the notification');
assert.ok(run("pairStatusHTML()").includes('другое фото'));
run("ACT.pairCancelChanges()");assert.equal(run("S.pair.proposal"),null);assert.equal(run("S.pair.draft"),null);assert.equal(run("T(S.pair.profile.bio)")===run("'v1'"),false,'discard keeps the published profile');
prepare('P07',{owner:'couple'});run("coupleProfile();S.pairMember='partner';setPairTrust(false);S.pairMember='me';var rq={id:'rb1',p:'mia',status:'new',scopes:['info']};social('couple').reqIn=[rq];queueJointGrant(rq,{sel:['info']},null)");
assert.ok(!run("todoItems().some(x=>x.k==='req'&&x.r.id==='rb1')"),'a queued couple decision is not offered twice');
run("S.pairMember='partner'");assert.equal(run("returnWork('joint','grant_rb1','',1)"),true);run("S.pairMember='me'");
assert.ok(run("todoItems().some(x=>x.k==='joint'&&x.q.id==='grant_rb1'&&x.q.status==='returned')"));
assert.ok(!text(run("NTXT.pair(currentNotifications().find(n=>n.pairEvent==='workReturned'))")).includes('Новое уведомление'));
run("queueJointGrant(rq,{sel:['info']},null)");assert.equal(run("jointQueue().grant_rb1.status"),'pending');assert.equal(run("jointQueue().grant_rb1.version"),2,'change decision sends a new version');
run("ACT.jointCancel({dataset:{v:'grant_rb1'}})");assert.equal(run("jointQueue().grant_rb1"),undefined);assert.ok(run("todoItems().some(x=>x.k==='req'&&x.r.id==='rb1')"),'withdrawn decision puts the request back');
console.log('PASS sent back for changes: note, inbox, status, rework, discard and access way out');
// Someone likes or asks the couple: both members are notified, dock badges count the couple too, and the notification opens the right place.
prepare('F01');run("coupleProfile().dating=true;S.datingActor='me';social('couple').likesIn=[];social('couple').reqIn=[];S.pair.notifications={}");
const people0=run("C.likesAll()"),me0=run("C.reqAll()");
run("receiveCoupleLike('ari');receiveCoupleRequest('vera',['info'])");
assert.equal(run("C.likesAll()"),people0+1,'People badge counts the couple like');assert.equal(run("C.reqAll()"),me0+1,'Profiles badge counts the couple request');
for(const m of ['me',run('S.pair.with')])assert.deepEqual(json(`S.pair.notifications['${m}'].map(n=>n.pairEvent).sort()`),['like','req'],'both members are notified');
assert.ok(text(run("NTXT.pair(S.notifs.find(n=>n.pairEvent==='like'))")).includes(run("pname('ari')")),'the notification names who liked');
run("social('couple').likesIn[0].passed=true");assert.equal(run("C.likesAll()"),people0,'a passed like stops counting');
run("coupleProfile().dating=false;receiveCoupleLike('ren')");assert.ok(!run("social('couple').likesIn.some(l=>l.p==='ren')"),'a hidden couple gets no new likes');
prepare('N01',{k:'all'});run("coupleProfile().dating=true;S.datingActor='me';receiveCoupleLike('ari');receiveCoupleRequest('vera',['info']);ACT.openNotif({dataset:{v:S.notifs.find(n=>n.pairEvent==='like').id}})");
assert.equal(run("cur().id+'/'+cur().p.sub+'/'+datingActor()"),'D03/likes/couple','like notification opens the couple likes');
prepare('N01',{k:'all'});run("coupleProfile();receiveCoupleRequest('vera',['info']);ACT.openNotif({dataset:{v:S.notifs.find(n=>n.pairEvent==='req').id}})");assert.equal(run("cur().id+'/'+cur().p.k"),'N01/todo','request notification opens «Нужно решить»');
console.log('PASS couple likes and requests: notifications for both, dock badges, opening the right place');
// Couple events audit: no self-notifications, every event has text, partner learns about trust changes, blocks, partner messages, grants and reviewed posts.
const pn=m=>json(`(S.pair.notifications['${m}']||[]).map(n=>n.pairEvent)`);const partner=()=>run('S.pair.with');
prepare('Q01');run("coupleProfile();S.pair.notifications={};S.pairMember='partner';setPairTrust(false);S.pairMember='me';S.pair.notifications={};editableProfile({p:{owner:'couple'}}).bio='v1';markCoupleDraft(true);submitCoupleDraft()");
assert.deepEqual(pn('me'),[],'the author is not notified about their own proposal');assert.deepEqual(pn(partner()),['proposal']);
run("S.pairMember='partner';commitCoupleProposal(S.pair,S.pair.with,S.pair.proposal.id)");assert.deepEqual(pn('me'),['profileApproved'],'the author learns it was approved');assert.ok(!pn(partner()).includes('profileApproved'),'the reviewer is not notified');
prepare('Q01');run("coupleProfile();S.pair.notifications={};setPairTrust(false)");assert.deepEqual(pn(partner()),['trustOff'],'partner learns approval is required again');run("setPairTrust(false)");assert.deepEqual(pn(partner()),['trustOff'],'no change, no notification');
run("setPairTrust(true)");assert.ok(text(run("NTXT.pair(S.pair.notifications[S.pair.with][0])")).includes('без согласования'));
prepare('P07',{owner:'couple'});run("coupleProfile();S.pair.notifications={};var rq={id:'ra1',p:'mia',status:'new',scopes:['info']};social('couple').reqIn=[rq];queueJointGrant(rq,{sel:['info']},null)");
assert.equal(run("rq.status"),'open');const wa=run("S.pair.notifications[S.pair.with].find(n=>n.pairEvent==='workApproved')");assert.ok(wa,'partner learns access was shared');
assert.ok(!text(run("NTXT.pair(S.pair.notifications[S.pair.with].find(n=>n.pairEvent==='workApproved'))")).includes('Новое уведомление'),'approved work has its own text');assert.deepEqual(pn('me'),[]);
prepare('D03');run("coupleProfile();S.pair.notifications={};social('couple').likesIn=[{p:'ari',t:1}];doBlock('ari')");assert.deepEqual(pn(partner()),['blocked'],'partner learns the couple lost this person');assert.ok(text(run("NTXT.pair(S.pair.notifications[S.pair.with][0])")).includes(run("pname('ari')")));
run("S.pair.notifications={};doBlock('ren')");assert.deepEqual(pn(partner()),[],'a person the couple never met is a personal block');
prepare('H01');run("coupleProfile();var th=ensureThread('mia','couple');th.unread=0;th.msgs.length=0;th.msgs.push({me:1,sender:S.pair.with,text:{ru:'hi',en:'hi'},t:Date.now()})");assert.equal(run("chatUnread(th)"),1,'partner’s message in the couple chat is unread for me');
run("th.msgs.push({me:1,sender:'me',text:{ru:'hi',en:'hi'},t:Date.now()})");assert.equal(run("chatUnread(th)"),1,'my own message is not unread');
prepare('F01');run("coupleProfile();S.pair.notifications={};social('couple').reqOut=[{id:'co1',p:'mia',actor:'couple',scopes:['info'],status:'pending',t:1}];S.myPosts.unshift({id:'cpx',author:'couple',status:'review',text:{ru:'x',en:'x'}});qaApproveAll()");
for(const m of ['me',partner()]){assert.ok(pn(m).includes('grant'),'both learn the couple got access');assert.ok(pn(m).includes('postok'),'both learn the joint post passed review');}
assert.deepEqual(json("S.pair.notifications.me.find(n=>n.pairEvent==='grant').go"),['P08',{id:'mia',actor:'couple'}],'opens the couple’s view of the access');
console.log('PASS couple events: no self-notifications, texts for every event, trust, blocks, partner messages, grants and reviewed posts');
// Counters show only what waits on me: decided items never count, a decision is counted once, Profiles shows what to decide about my profiles.
prepare('F01');run("coupleProfile();S.pair.notifications={};receiveCoupleRequest('vera',['info'])");
const todoN=run("todoCount()");assert.equal(run("bellCount()"),run("currentNotifications().filter(n=>!n.read&&n.type!=='req'&&!(n.type==='pair'&&TODO_PAIR_EVENTS.has(n.pairEvent))).length")+todoN);
assert.ok(!json("currentNotifications().filter(n=>!n.read&&n.type!=='req'&&!(n.type==='pair'&&TODO_PAIR_EVENTS.has(n.pairEvent)))").some(n=>n.pairEvent==='req'),'a couple request is counted once, in «Нужно решить»');
assert.equal(run("C.meTodo()"),run("todoItems().filter(x=>['req','profile','profileBack','joint','pinv'].includes(x.k)).length"));assert.equal(run("TABDEF().find(x=>x[0]==='me')[3]"),run("C.meTodo()"));
assert.ok(text(run("SC.X01.render({},cur())")).includes(run("L('Нужно решить','To decide')")),'Profiles shows where the decisions are');
run("var cid=Object.keys(COMMUNITIES)[0];S.communityRequests[cid]=[{id:'d1',p:'mia',status:'approved',t:1},{id:'d2',p:'ari',status:'declined',t:1},{id:'d3',p:'ren',status:'pending',t:1}];S.managedCommunities=new Set([cid]);COMMUNITIES[cid].owner='me'");
const c11=run("SC.C11.render({id:cid},cur())");assert.ok(/Новые<\/span><em>1<\/em>/.test(c11),'one new request');assert.ok(!/Решения<\/span><em>/.test(c11),'decided requests have no counter');
console.log('PASS counters: decided items never count, a decision counts once, Profiles shows what to decide');
// One editor for posts and community discussions; the author (me / couple) is chosen the same way for posts, discussions and replies.
prepare('F01');run("coupleProfile();var cid=[...S.joined][0];S.pair.memberCommunities={};S.pair.memberCommunities[S.pair.with]=[];S.nav.stacks.feed.push({id:'C07',p:{id:cid},f:{}});SC.C07.render(cur().p,cur())");
assert.equal(run("cur().id+'/'+cur().p.community"),'F07/'+run('cid'),'«Новое обсуждение» is the post editor in community mode');
assert.equal(run("authorKind()"),'compose');assert.ok(run("coupleAuthorBlock('compose')").includes(run("pname(S.pair.with)")),'the menu says the partner is not in the community');
run("cur().author='couple'");assert.equal(run("publishDiscussion({community:cid,author:'couple',title:'Тема обсуждения',text:'Текст',media:[],tags:[],poll:null,result:null,by:'me'})"),null,'no couple discussion while the partner is outside');
run("S.pair.memberCommunities[S.pair.with]=[cid];S.pair.approvalRequired={};S.pair.approvalRequired[S.pair.with]=true;var n0=S.discussions.length");
const qid=run("publishDiscussion({community:cid,author:'couple',pairId:S.pair.id,title:'Тема обсуждения',text:'Текст',media:[],tags:['bondage'],poll:['Да','Нет'],pollQ:'Вопрос?',result:null,by:'me',aud:'all'})");
assert.ok(qid,'couple discussion goes to approval');assert.equal(run("S.discussions.length"),run('n0'),'not published before approval');
run(`S.pairMember='partner';approveJointWork('${qid}',1,S.pair.with);S.pairMember='me'`);const disc=json(`S.discussions.find(d=>d.id==='${qid}')`);
assert.equal(disc.c,run('cid'));assert.equal(disc.author,'couple');assert.equal(disc.poll.length,2,'polls work in discussions');assert.ok(run(`postById('${qid}')`),'poll votes find the discussion');
prepare('F01');run("coupleProfile();var cid=[...S.joined][0];S.pair.memberCommunities={};S.pair.memberCommunities[S.pair.with]=[cid];S.discussions.unshift({id:'dx',c:cid,author:'me',t:1,title:{ru:'x',en:'x'},text:{ru:'x',en:'x'},media:[],replies:[]});S.nav.stacks.feed.push({id:'C06',p:{id:'dx'},f:{}})");
assert.equal(run("authorKind()"),'reply');run("cur().replyAuthor='couple';document.querySelector('#dr').value='Ответ от пары';ACT.sendReply()");
assert.equal(run("S.discussions[0].replies.at(-1)?.a"),'couple','a reply can come from the couple');
run("S.pair.memberCommunities[S.pair.with]=[];document.querySelector('#dr').value='Ещё';ACT.sendReply()");assert.equal(run("S.discussions[0].replies.length"),1,'not when the partner is outside the community');
prepare('F01');run("coupleProfile();var px=S.posts.find(x=>!x.unavailable&&x.author!=='couple');S.nav.stacks.feed.push({id:'F05',p:{id:px.id},f:{}});cur().replyAuthor='couple';document.querySelector('#cmt').value='Ответ пары';ACT.sendComment()");
assert.equal(run("px.comments.at(-1).a"),'couple','post replies can come from the couple');
assert.ok(run("SC.F07.render({},cur())").includes('author-picker av-only'),'the author is an avatar in the header');
console.log('PASS one editor for posts and discussions, author choice for posts, discussions and replies');
// Acting as the couple tells the partner: replies, likes, access requests; request cards say what is asked and of whom; couple setup uses the standard select rows.
prepare('F01');run("coupleProfile();S.pair.notifications={};var px=S.posts.find(x=>!x.unavailable&&x.author!=='couple');var c={id:'cr9',a:'couple',sender:'me',text:{ru:'x',en:'x'},parent:null,t:Date.now(),status:'pending'};px.comments.push(c);sendPostReply(c,px,cur(),S,S.session)");
timers.splice(0).forEach(f=>f());await new Promise(r=>setTimeout(r,0));
assert.ok(json("(S.pair.notifications[S.pair.with]||[]).map(n=>n.pairEvent)").includes('coupleReply'),'partner learns about a reply as the couple');assert.ok(!json("(S.pair.notifications.me||[]).map(n=>n.pairEvent)").includes('coupleReply'),'not the author');
const card=text(run("reqCardHTML({id:'q',p:'leon',scopes:['info'],t:Date.now(),status:'new'},'couple')"));assert.ok(card.includes('Просит открыть приватную часть пары'),'request card says what and of whom');
assert.ok(text(run("reqCardHTML({id:'q',p:'leon',scopes:['info'],t:Date.now(),status:'new'},'me')")).includes('Просит открыть твою приватную часть'));
prepare('Q09');run("coupleProfile()");const q9=run("SC.Q09.render({},cur())");assert.ok(q9.includes('class="li"')&&q9.includes('selrow')&&!q9.includes('selrow solo'),'couple setup uses labelled select rows');
console.log('PASS couple actions reach the partner, clear request cards, standard selects in couple setup');
// Community owner manages hosts and members from the member list; events show who is going; «Прочитать все» is a button under the tabs.
prepare('C03',{id:'circle',t:'members'});const mem=run("SC.C03.render(cur().p,cur())");assert.ok(mem.includes('data-act="cMember"'),'owner can open a member menu');
run("ACT.cMemberDo({dataset:{v:'host|circle|kai'}})");assert.ok(!run("COMMUNITIES.circle.mods.includes('kai')"),'host removed');run("ACT.cMemberDo({dataset:{v:'host|circle|kai'}})");assert.ok(run("COMMUNITIES.circle.mods.includes('kai')"),'host added back');
run("ACT.cMemberDo({dataset:{v:'mute|circle|mia'}})");assert.equal(run("communityMemberCanWrite('circle','mia')"),false,'a muted member cannot post');
prepare('C03',{id:'rope',t:'members'});assert.ok(!run("SC.C03.render(cur().p,cur())").includes('data-act="cMember"'),'members cannot manage others');
prepare('F01');const ev1=run("allEventIds().find(e=>EV(e).organizer!=='me'&&!EV(e).approval)");const crowd=json(`eventCrowd('${ev1}')`);assert.ok(crowd.going.length+crowd.interested.length>0);
run(`S.rsvp['${ev1}']={...myR('${ev1}'),status:'going',show:false}`);assert.ok(!json(`eventCrowd('${ev1}')`).going.includes('me'),'hidden attendance is not listed');assert.ok(json(`eventCrowd('${ev1}')`).meHidden);
prepare('N01',{k:'all'});const n01=run("SC.N01.render(cur().p,cur())");assert.ok(n01.indexOf('inbox-read-all')<n01.indexOf('inbox-filters'),'read-all sits right under the tabs');
console.log('PASS community hosts and members management, who is going, read-all under the tabs');
// Comparison uses the profile you act as; invite says why a person can't be invited; owner sets community access; event status is one clear line.
prepare('F01');run("coupleProfile();S.datingActor='couple';coupleProfile().dating=true;S.nav.stacks.feed.push({id:'P05',p:{id:'kira',actor:'couple'},f:{}})");
assert.equal(run("compareActor('kira')"),'couple','P05 compares as the couple');run("cur().p.actor='me'");assert.equal(run("compareActor('kira')"),'me');
assert.ok(run("pairInviteIssue('eva')").includes('уже в паре'),'a person in a couple is named as such');assert.ok(run("pairInviteIssue('Eva')").includes('уже в паре'),'nickname case does not matter');
assert.ok(run("pairInviteIssue('evatom')||pairInviteIssue('nosuchnick')").length>0);assert.equal(run("pairInviteIssue('kai')"),'');
prepare('C10',{id:'circle'});run("ACT.c10Priv({dataset:{v:'open',k:'circle'}})");assert.equal(run("COMMUNITIES.circle.privacy"),'open','owner changes who can join');
prepare('F01');const evA=run("allEventIds().find(e=>EV(e).approval&&EV(e).organizer!=='me'&&!isPast(e))");run(`S.rsvp['${evA}']={...myR('${evA}'),status:'going',app:'pending'};S.nav.stacks.feed.push({id:'E03',p:{id:'${evA}'},f:{}})`);
const e03=text(run("SC.E03.render(cur().p,cur())"));assert.ok(e03.includes('Заявка на рассмотрении')&&!e03.includes('Твой статус'),'one clear attendance status');
console.log('PASS comparison as the acting profile, invite reasons, community access, clear attendance status');
// The dot on the People author avatar counts only the other profile's new likes (requests live on «Профили»).
prepare('D03');run("coupleProfile();S.datingActor='couple'");assert.equal(run("otherActorWaiting()"),run("waitingLikes('me')"),'only likes of the other profile');
console.log('PASS People author dot = the other profile’s new likes');
// Every action that touches another person tells them (deliveries), the couple variants reach both partners.
prepare('F01');run("S.socialDeliveries={}");const got=(to,type)=>run(`(S.socialDeliveries['${to}']||[]).some(n=>n.type==='${type}')`);
run("ACT.flwToggle({dataset:{v:'lina'}})");assert.ok(got('lina','follow'),'follow');
run("var rq={id:'qq1',p:'kai',scopes:['info'],status:'new',t:1};S.reqIn.unshift(rq)");
run("var btn=d=>({dataset:d,classList:{contains:()=>false,add(){},remove(){},toggle(){}},closest:()=>null,setAttribute(){},removeAttribute(){},getAttribute:()=>null,querySelector:()=>null,innerHTML:'',textContent:''})");run("declineReq(btn({v:'qq1'}))");timers.splice(0).forEach(f=>f());await new Promise(r=>setTimeout(r,0));assert.ok(got('kai','reqDeclined'),'declined request');
run("var ev=allEventIds().find(e=>EV(e).organizer==='me'&&(EV(e).apps||[]).some(x=>x.status==='pending'));var ap=EV(ev).apps.find(x=>x.status==='pending');S.nav.stacks.feed.push({id:'E16',p:{id:ev},f:{}});ACT.appDecide(btn({e:ev,v:ap.p,d:'approved'}))");timers.splice(0).forEach(f=>f());await new Promise(r=>setTimeout(r,0));
assert.ok(got(run('ap.p'),'evapp'),'event application decision');
run("ACT.cMemberDo({dataset:{v:'mute|circle|kai'}})");assert.ok(got('kai','communityMuted'),'muted member');run("ACT.cMemberDo({dataset:{v:'host|circle|kai'}})");assert.ok(got('kai','hostRemoved'),'host change');
prepare('F01');run("S.socialDeliveries={};S.pair=null;S.pairInvite={nick:'kai',status:'pending',by:'me',t:1};S.pairMember='partner';acceptPairInvitation('kai');S.pairMember='me'");
assert.ok(json("(S.pair.notifications.me||[]).map(n=>n.pairEvent)").includes('pairCreated'),'inviter learns the invitation was accepted');
console.log('PASS outgoing notifications: follow, declined request, event decision, community roles, accepted pair invitation');
// V13 — gallery: every post with photos/video in one grid on the profile, albums, stepping between posts; gallery-only posts stay out of the feed.
prepare('F01');const gl=json("galleryPosts('noa').map(x=>x.id)");assert.ok(gl.length>=6,'a person has a lived-in gallery');
assert.ok(json("filterPosts(allPosts(),{}).every(x=>!x.galleryOnly)"),'gallery-only posts stay out of the feed');
const alb=json("albumsOf('noa').map(a=>a.id)");assert.ok(alb.length>=2);assert.ok(json(`galleryPosts('noa','${alb[0]}').length`)<gl.length,'an album narrows the gallery');
const pb=run("profileView('noa',{p:{id:'noa'},f:{}})");assert.ok(pb.includes('class="ggrid"')&&pb.includes('data-go="P20"'),'profile shows the gallery block with «see all»');
run(`S.nav.stacks.feed.push({id:'F05',p:{id:'${gl[0]}',gal:{o:'noa',a:null}},f:{}})`);assert.ok(run("SC.F05.render(cur().p,cur())").includes('gal-nav'),'gallery post can be stepped through');
run("ACT.galStep({dataset:{v:'1'}})");assert.equal(run("cur().p.id"),gl[1],'next post in the gallery');
run("S.nav.stacks.feed.push({id:'P20',p:{id:'me'},f:{}});myAlbums('me').push({id:'alX',name:{ru:'Тест',en:'Test'}})");assert.ok(run("SC.P20.render(cur().p,cur())").includes('Тест'),'own albums are listed');
console.log('PASS gallery grid, albums, stepping between posts, gallery-only posts stay out of the feed');
// Posting into an album; profile photos can live in the gallery too; notes are long reads with a title.
prepare('F01');run("S.nav.stacks.feed.push({id:'F07',p:{},f:{}});SC.F07.render(cur().p,cur());cur().media=[{type:'image',url:'/images/v10-content/gallery-e1-ropes.webp'}];cur().album='alX';myAlbums('me').push({id:'alX',name:{ru:'Тест',en:'Test'}})");
assert.ok(run("SC.F07.render(cur().p,cur())").includes('data-sel=\"setAlbum\"'),'composer offers an album for posts with pictures');
assert.equal(run("postFromDraft({...draftOf(cur()),text:'x'},'t1').album"),'alX','album travels with the post');
run("S.myPosts.unshift({...postFromDraft({...draftOf(cur()),text:'x'},'t2'),status:'published'})");assert.ok(json("galleryPosts('me','alX').map(x=>x.id)").includes('t2'),'published post lands in its album');
prepare('F01');run("S.me.galPh=[phKey(firstPhoto(S.me.photos))];syncProfileGallery('me',S.me.photos,new Set(S.me.galPh))");
assert.equal(run("S.myPosts.filter(x=>x.profilePhoto).length"),1,'a chosen profile photo becomes a gallery post');assert.ok(run("myAlbums('me').some(a=>a.id==='me_profile')"),'«Фото профиля» album');
assert.ok(json("galleryPosts('me').map(x=>x.profilePhoto||'')").some(Boolean));run("S.me.galPh=[];syncProfileGallery('me',S.me.photos,new Set())");assert.equal(run("S.myPosts.filter(x=>x.profilePhoto).length"),0,'unticked photo leaves the gallery');
prepare('F01');const n1=text(run("postCard(postById('n1'),{})"));assert.ok(n1.includes('Читать полностью')&&n1.includes('мин чтения'),'note card: title, excerpt, read more');
assert.ok(json("galleryPosts('noa').every(x=>x.type!=='note')"),'notes are not gallery tiles');
run("S.nav.stacks.feed.push({id:'F07',p:{x:'note'},f:{}})");const nf=run("SC.F07.render(cur().p,cur())");assert.ok(nf.includes('name=\"ntitle\"')&&nf.includes('data-max=\"10000\"'),'note editor: title and 10 000 characters');
const d=json("({...draftOf(cur()),note:true,noteTitle:'Заголовок',text:'Длинный текст'})");assert.equal(json(`postFromDraft(${JSON.stringify(d)},'nn').type`),'note');
const pv=run("profileView('noa',{p:{id:'noa'},f:{}})");assert.ok(pv.includes('Заметки'),'profile has a «Notes» tab');
console.log('PASS albums in the composer, profile photos in the gallery, notes');
// Links: both sides confirm; the more private visibility wins; blocked people and couples never get links; answers reach the other person.
prepare('F01');run("ensureV13();S.socialDeliveries={}");assert.ok(json("todoItems().map(x=>x.k)").includes('link'),'incoming link request waits in «Нужно решить»');
run("ACT.linkAnswer({dataset:{v:'lk2|yes'}})");assert.equal(run("links().find(l=>l.id==='lk2').status"),'ok');assert.ok(run("(S.socialDeliveries.kai||[]).some(n=>n.type==='linkOk')"),'Kai learns the link was confirmed');
assert.ok(json("linksShown('kai').map(l=>linkOther(l,'kai'))").includes('me'),'confirmed link shows on both profiles');
assert.equal(run("linkVis({a:'x',b:'y',vis:{x:'all',y:'us'}})"),'us','the more private choice wins');
assert.equal(json("linksShown('sofi').length"),0,'followers-only link is hidden from non-followers');
assert.ok(run("linkIssue('leon')").includes('не принимает'),'people can refuse link requests');assert.ok(run("linkIssue('tomeva')").length>0,'couples have no personal links');
run("S.nav.stacks.feed.push({id:'P22',p:{id:'noa'},f:{}});SC.P22.render(cur().p,cur());cur().kind='ds';cur().side=null;ACT.linkSend(btn({}))");assert.ok(!run("!!linkWith('noa')"),'a two-sided kind needs my side');
run("cur().side='sub';ACT.linkSend(btn({}))");timers.splice(0).forEach(f=>f());await new Promise(r=>setTimeout(r,0));assert.equal(run("linkWith('noa')?.side?.noa"),'dom','the other person gets the opposite side');assert.ok(run("(S.socialDeliveries.noa||[]).some(n=>n.type==='linkReq')"));
run("doBlock('mia')");assert.ok(!run("!!linkWith('mia')"),'blocking removes the link');
console.log('PASS links: two-sided confirmation, visibility, refusals, blocking');
// People on photos: a marked person confirms before others see the post; anyone pictured can hide it; new photos ask again.
prepare('F01');run("ensureV13();S.socialDeliveries={}");assert.ok(run("consentHidden(postById('p11'))"),'post waits for my consent');assert.ok(run("postVisible(postById('p11'))"),'the marked person can open it');
assert.ok(json("filterPosts(allPosts(),{}).map(p=>p.id)").every(id=>id!=='p11'),'not in the feed until everyone agrees');assert.ok(json("todoItems().map(x=>x.k)").includes('tag'));
run("ACT.tagAnswer({dataset:{v:'p11|yes'}})");assert.ok(!run("consentHidden(postById('p11'))"));assert.ok(run("(S.socialDeliveries.mia||[]).some(n=>n.type==='tagOk')"),'author learns about consent');
assert.ok(text(run("postCard(postById('p11'),{})")).includes('На фото'),'confirmed people are named');
run("postById('p2').disputed={by:'me',t:1}");assert.ok(!run("postVisible(postById('p2'))"),'«that’s me» hides the post for everyone');
const pp=json("postPeople({media:[{url:'a'}],people:[]},{media:[{url:'a'}],people:[{p:'kai',st:'no'}]})");assert.equal(pp.people[0].st,'no','a declined mark stays while the photos are the same');
const pn2=json("postPeople({media:[{url:'b'}],people:['kai']},{media:[{url:'a'}],people:[{p:'kai',st:'no'}],disputed:{by:'x'}})");assert.equal(pn2.people[0].st,'pending','new photos ask again');assert.equal(pn2.disputed,null);
run("S.myPosts.unshift({...postFromDraft({author:'me',tags:[],aud:'all',text:'x',media:[{type:'image',url:'/images/v10-content/gallery-e1-ropes.webp'}],poll:null,result:null,people:['kai']},'tp1'),status:'published'});askTagged()");
assert.ok(run("(S.socialDeliveries.kai||[]).some(n=>n.type==='tagReq')"),'marked person gets a request');assert.ok(!json("filterPosts(allPosts(),{}).map(p=>p.id)").includes('tp1'));
run("qaV13('no')");assert.ok(json("S.notifs.map(n=>n.type)").includes('tagno'),'author learns about a refusal');
console.log('PASS photo consent: marks, refusals, «that’s me», re-asking after new photos');
// «Популярное»: only my interests, never taboo, only public and visible posts; hosts manage community picks.
prepare('F01');run("ensureV13()");const mine=json("myInterestTags()"),taboo=json("[...myTaboo()]");const pop=json("popularPosts('').map(p=>({t:p.tags,aud:p.aud,id:p.id}))");
assert.ok(pop.every(p=>p.aud==='all'&&p.t.some(t=>mine.includes(t))&&!p.t.some(t=>taboo.includes(t))),'only my interests, no taboo, public only');
assert.ok(text(run("SC.F01.render({sub:'popular'})")).includes('Самое обсуждаемое за неделю'),'feed has a Popular tab');
run("S.reportedPosts=new Set(popularPosts('').slice(0,1).map(p=>p.id))");assert.ok(!json("popularPosts('').map(p=>p.id)").some(id=>run("S.reportedPosts.has('"+id+"')")),'reported posts drop out');
const pdx=json("popularDiscs('rope').map(d=>d.id)");if(pdx.length){run(`S.popOff=new Set(['${pdx[0]}'])`);assert.ok(!json("popularDiscs('rope').map(d=>d.id)").includes(pdx[0]),'hosts can keep a discussion out of Popular');}
console.log('PASS Popular: interests only, no taboo, public, reports and host choices respected');
