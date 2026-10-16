import {chromium} from 'playwright';
import fs from 'node:fs';
import {open,DETECT,ctxInfo,VIEWS} from './lib.mjs';
// usage: node flows.mjs <lang> <width> [scheme] [persona] [onlyFlowSubstring]
const [,, lang='ru', wArg='390', scheme='light', persona='full', only='']=process.argv;
const [w,h]=VIEWS.find(v=>v[0]===+wArg);
const b=await chromium.launch();
let p=await open(b,{w,h,lang,scheme,persona});p.setDefaultTimeout(12000);
const OUTF=`out/f-${lang}-${w}-${scheme}-${persona}.jsonl`;fs.writeFileSync(OUTF,'');
let FL=0;
// ---- in-page helpers -------------------------------------------------------------------
const FILL=`((flavorStart)=>{
 const CH={cyr:'Непрерывнаястрокабезпробеловсверхдлинноеслово',lat:'Unbreakablestringwithoutanyspacesoverflowcheck',mix:'ПриветWorldДлинноеСловоLongWord2026Ёё',num:'01234567890123456789',wide:'WМШЩWМШЩЖЫWMШЩ'};
 const rep=(c,k)=>c.repeat(Math.ceil(k/c.length)+1).slice(0,k);
 const gen=(f,len,nick)=>{if(nick)return rep(['alexandrina.maximila','W','m_W.'][flavorStart%3],len);
  if(f==='url'&&len>60)return ('https://example.com/'+rep('Unbreakablepathsegment0123456789?q=ПриветWorld&x=1',len)).slice(0,len);
  if(f==='email'&&len>70)return (rep('first.last.nospaces.',len-48)+'@verylongsubdomainnamewithoutspaces.example.org').slice(0,len);
  return rep(CH[f]||CH.lat,len);};
 const F=['cyr','lat','mix','url','email','num','wide'];
 const scope=document.querySelector('#sheet.on')||document.querySelector('#main');
 const out=[];let i=0;
 const els=[...scope.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=range]):not([type=file]),textarea,.rte-ed')].filter(e=>!e.disabled&&e.getClientRects().length&&!e.closest('.qa,#qa')&&!e.closest('.code'));
 for(const e of els){
  const fld=e.closest('.field');const cnt=fld&&fld.querySelector('.counter');let max=cnt?+cnt.textContent.split('/')[1]:0;
  if(!max&&e.maxLength>0&&e.maxLength<9e5)max=e.maxLength;
  const nm=(e.name||e.id||'');const nick=/nick|partner/.test(nm);
  if(!max)max=nick?20:e.id==='msgIn'||nm==='msgIn'?2000:nm==='cmt'?1000:200;
  if(e.type==='email')max=Math.min(max,120);
  if(e.type==='date'){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2026-12-20');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));continue;}
  if(e.type==='time'){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'18:00');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));continue;}
  const f=F[(flavorStart+i++)%F.length];const v=gen(f,max,nick);
  if(e.classList.contains('rte-ed')){e.focus();document.execCommand('selectAll');document.execCommand('insertText',false,v);}
  else{const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));}
  out.push(nm||e.className.slice(0,14)+':'+f+':'+max);
 }
 return out;})`;
const CLICKA=`((a,v)=>{const q=[...document.querySelectorAll('#sheet.on [data-act],#dialog.on [data-r],#main [data-act],#ctx [data-act]')];const e=q.find(x=>x.dataset.act===a&&(v==null||(x.dataset.v||'')===v)&&!x.disabled&&x.getClientRects().length);if(e){e.click();return true;}return false;})`;
const wait=ms=>p.waitForTimeout(ms);
const go=async(id,pp={})=>{await p.evaluate(({id,pp})=>FT_QA.go(id,pp),{id,pp});await wait(600);};
const fill=async()=>p.evaluate(`${FILL}(${FL++})`);
const click=async(a,v)=>{const ok=await p.evaluate(`${CLICKA}(${JSON.stringify(a)},${v==null?'null':JSON.stringify(v)})`);await wait(450);return ok;};
const clickSel=async s=>{const ok=await p.evaluate(s=>{const e=document.querySelector(s);if(e){e.click();return true}return false},s);await wait(450);return ok;};
let results=[];let flowName='';
const rec=async step=>{const info=await ctxInfo(p);const f=await p.evaluate(DETECT);for(const x of f)results.push({lang,w,h,scheme,persona,flow:flowName,step,...info,...x});return f.length;};
const FLOWS={
 async 'post-text'(){await go('F07',{type:'text'});await fill();await rec('filled');await click('toPreview');await rec('preview');await p.evaluate(()=>history.back());await wait(400);await go('F07',{type:'text'});await fill();await click('publishNow');await wait(2200);await rec('after-publish');await go('F01',{sub:'foryou'});await wait(300);await rec('feed-with-mine');await go('F10',{});await rec('my-posts');},
 async 'post-poll'(){await go('F07',{type:'poll'});await click('addOpt');await click('addOpt');await fill();await rec('filled');await click('toPreview');await rec('preview');await go('F07',{type:'poll'});await click('addOpt');await fill();await click('publishNow');await wait(2200);await rec('after-publish');await go('F01',{sub:'foryou'});await rec('feed');const ok=await click('vote');await wait(500);await rec('voted');await click('mView');await wait(500);await rec('voters-sheet');},
 async 'comment-reply'(){await go('F05',{id:'p1'});await fill();await rec('typed');await click('sendComment');await wait(2000);await rec('sent');await click('rReply');await wait(400);await fill();await rec('reply-typed');await click('sendComment');await wait(1500);await rec('reply-sent');await click('rMore');await rec('more');},
 async 'chat'(){await go('H02',{id:'mia'});await fill();await rec('typed');await click('send');await wait(4500);await rec('sent+autoreply');await click('chatMenu');await rec('chat-menu');},
 async 'event-create'(){await go('E11',{});await rec('step1-empty');
   for(let s=0;s<6;s++){await click('evfType',null).catch(()=>{});await p.evaluate(()=>{const e=document.querySelector('[data-act="evfType"]');e&&e.click();});await wait(300);await p.evaluate(()=>{const e=document.querySelector('[data-act="evFormat"]');e&&e.click();});await wait(200);await fill();await rec('step'+(s+1)+'-filled');const nxt=await click('evfNext');if(!nxt){await click('evfSubmit');await wait(2200);await rec('saved');break;}await wait(300);await rec('step'+(s+2)+'-after-next');}
   await go('E10',{});await rec('my-events');},
 async 'event-apply'(){await go('E06',{id:'e4'});await fill();await rec('filled');await click('sendApp');await wait(2400);await rec('sent');await go('E03',{id:'e4'});await rec('event-page');await go('E10',{});await rec('my-events');},
 async 'community-create'(){await go('C08',{});await fill();await rec('filled');await click('c8Topic');await click('c8Priv');await fill();await click('c8Save');await wait(2400);await rec('saved');await go('C01',{sub:'joined'});await rec('joined-list');},
 async 'discussion'(){await go('C07',{id:'rope'});await fill();await rec('filled');await click('cdPost');await wait(2400);await rec('posted');await go('C03',{id:'rope'});await rec('community');},
 async 'profile-edit'(){await go('P02',{});await fill();await rec('filled');await click('peSave');await wait(2400);await rec('saved-or-errors');await go('X01',{});await rec('me-hub');await go('P03',{});await rec('as-others');},
 async 'profile-nick-over-limit'(){await go('P02',{});await p.evaluate(()=>{const e=document.querySelector('[name=nick]');e.value='A'.repeat(70);e.dispatchEvent(new Event('input',{bubbles:true}));});await click('peSave');await wait(900);await rec('nick-error');},
 async 'search'(){await go('G01',{scope:'all'});await fill();await wait(600);await rec('query-empty-result');await go('G01',{scope:'all'});await p.evaluate(()=>{const e=document.querySelector('[name=gq],#gq,input[type=search]');if(e){e.value='sofi';e.dispatchEvent(new Event('input',{bubbles:true}));}});await wait(500);await rec('query-hit');},
 async 'auth-forms'(){await go('A02',{mode:'up'});await fill();await rec('email-typed');await click('sendCode');await wait(800);await rec('email-error');await go('A04',{email:'new@mail.com',via:'email'});await fill();await rec('profile-typed');await click('saveA04');await wait(900);await rec('profile-errors');},
 async 'pair-invite'(){await go('Q01',{});await fill();await wait(600);await rec('typed');await click('v6PairInvite');await wait(1200);await rec('invited');},
 async 'closed-join'(){await go('C03',{id:'queer'});await click('cJoin');await rec('join-sheet');await fill();await rec('join-typed');await click('cjOk');await click('cjGo');await wait(1800);await rec('join-sent');await go('C01',{sub:'joined'});await rec('joined-list');await go('C03',{id:'queer'});await rec('pending-page');},
 async 'open-join'(){await go('C03',{id:'rope'});await click('cJoin');await rec('rules-sheet');await click('cjOk');await click('cjGo');await wait(1800);await rec('joined');},
 async 'post-menu-report'(){await go('F05',{id:'p1'});await click('postMenu');await rec('menu');await click('report');await rec('report-sheet');await fill();await rec('report-typed');},
 async 'event-organiser'(){await go('E15',{id:'e8'});await rec('panel');await click('announce');await fill();await rec('announce-typed');await click('anSend');await wait(1500);await rec('announce-sent');await go('E15',{id:'e8'});await click('evCancel');await fill();await rec('cancel-typed');await go('E16',{id:'e8'});await rec('applications');},
 async 'community-owner'(){await go('C03',{id:'slow'});await click('cMenu');await rec('cmenu');await go('X02',{owner:'me'});await rec('x02');},
 async 'dialogs-and-menus'(){
   for(const [id,pp,acts] of [['P01',{id:'mia'},['profileMenu']],['F01',{sub:'foryou'},['postMenu','sharePost']],['H02',{id:'mia'},['chatMenu']],['E03',{id:'e1'},['evMenu','evShare','rsvp']],['C03',{id:'rope'},['cMenu','cLeave']],['P07',{tab:'in'},['grant','decline']],['P10',{id:'me',tab:'followers'},['flwToggle']],['P03',{}, ['p3Menu']]]){
     for(const a of acts){await go(id,pp);const ok=await click(a);if(ok){await rec(id+':'+a);
       // open every row of the menu sheet / confirm dialogs
       const subs=await p.evaluate(()=>[...document.querySelectorAll('#sheet.on [data-act]')].map(e=>e.dataset.act+'|'+(e.dataset.v||'')).filter(x=>!/^closeSheet/.test(x)).slice(0,10));
       for(const s of subs){const [sa,sv]=s.split('|');await go(id,pp);await click(a);await click(sa,sv||null);await rec(id+':'+a+'>'+sa+(sv?':'+sv:''));}
     }}}
 },
};
for(const [name,fn] of Object.entries(FLOWS)){
  if(only&&!name.includes(only))continue;
  flowName=name;const before=results.length;
  try{await fn();}catch(e){console.log('FLOW FAIL',name,String(e).slice(0,140));results.push({lang,w,h,flow:name,kind:'HARNESS_ERROR',err:String(e).slice(0,160)});try{await p.context().close();}catch(_){}p=await open(b,{w,h,lang,scheme,persona});p.setDefaultTimeout(12000);}
  fs.appendFileSync(OUTF,results.slice(before).map(x=>JSON.stringify(x)).join('\n')+(results.length>before?'\n':''));
  console.log(name,'findings',results.length-before,'errs',p.errs.filter(e=>!/ERR_FILE|Failed to load/.test(e)).slice(0,2));
}
await b.close();console.log('DONE');
