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
