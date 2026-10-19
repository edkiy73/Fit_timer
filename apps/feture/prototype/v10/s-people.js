/* ============ D: PEOPLE — discover deck, likes, matches, dating opt-in, filters, history ============ */
/* V7: browsing Discover needs only dating switched on — no photo, no extra checks. A photo is needed only to be shown to others. */
const DATING_LIVE=()=>QA.datingLive!==false;window.DATING_ON=DATING_LIVE;
const pool=()=>!DATING_LIVE()?[]:S.deckOrder.filter(id=>!social().decided[id]&&!isMatch(id)&&!isBlocked(id)&&!relatedFor(actionAuthor(),id)&&!(activePair()&&id===S.pair.with)&&PEOPLE[id].dating&&passDating(id,social().filters.dating));
function passDating(id,f){const p=PEOPLE[id];if(!p.verified||!p.pair&&p.age<18)return false;
 if((f.placeMode||'city')==='city'&&f.city&&p.city!==f.city)return false;
 if(f.placeMode==='nearby'){const a=f.coords||S.me.location?.coords,b=p.location;if(!a||!b||distanceKm(a,b)>f.dist)return false;}
 if(f.show==='people'&&p.pair)return false;if(f.show==='pairs'&&!p.pair)return false;
 if(!p.pair&&(p.age<f.age[0]||p.age>f.age[1]))return false;
 if(f.gender.length&&!p.pair&&!p.gender.some(g=>f.gender.includes(g)))return false;
 if((f.orient||[]).length&&!p.pair&&!(p.orient||[]).some(o=>f.orient.includes(o)))return false;
 if(f.format.length&&!fmtList(p.format).some(x=>f.format.includes(x)))return false;
 if(f.seek.length&&!p.seek.some(s=>f.seek.includes(s)))return false;
 if((f.role||[]).length&&!fmtList(p.role).some(v=>f.role.includes(v)))return false;
 if((f.topics||[]).length&&!p.jars.some(j=>f.topics.includes(Array.isArray(j)?j[0]:j.t)))return false;return true;}
const dfCount=f=>[f.show!=='all',f.age[0]!==18||f.age[1]!==99,f.placeMode==='nearby',!!f.city,f.gender.length,(f.orient||[]).length,f.format.length,f.seek.length,(f.topics||[]).length,(f.role||[]).length].filter(Boolean).length;

SC.D03={root:1,tab:'people',title:()=>L('Люди','People'),render:(p,r)=>{
 const sub=p.sub||'discover';if(sub==='matches')return SC.H01.render({sub:'chats'},r);if(sub==='requests')return `<header class="bar">${seg([['discover',L('Подборка','Discover')],['likes',L('Симпатии','Likes'),C.likesIn()||''],['requests',L('Запросы','Requests'),C.reqIn()||'']],sub,'pplSub')}${authorPicker()}${bellBtn()}</header><div class="view"><div class="wrap">${accessBody(p)}</div></div>`;const n=C.likesIn();
 const tabs=seg([['discover',L('Подборка','Discover')],['likes',L('Симпатии','Likes'),n||''],['requests',L('Запросы','Requests'),C.reqIn()||'']],sub,'pplSub');
 const right=sub==='discover'&&authorProfile().dating?`<button class="ibtn" data-act="dfSheet" aria-label="${L('Фильтры','Filters')}">${I.filter}${dfCount(social().filters.dating)?`<sup>${dfCount(social().filters.dating)}</sup>`:''}</button>`:bellBtn();
 const head=`<header class="bar">${tabs}${authorPicker()}${right}</header><p class="note" data-dating-author-reason ${actionAuthor()==='couple'&&!authorProfile().dating?'':'hidden'}>${actionAuthor()==='couple'&&!authorProfile().dating?L('Знакомства пары выключены. Изменить это можно в профиле пары.','Couple dating is off. Change this in the couple profile.'):''}</p>`;
 if(sub==='likes')return head+`<div class="view"><div class="wrap">${likesBody(r)}</div></div>`;
 if(sub==='matches')return head+`<div class="view"><div class="wrap">${matchesBody()}</div></div>`;
 if(!DATING_LIVE())return head+`<div class="view"><div class="wrap">${datingSoon()}</div></div>`;
 if(!authorProfile().dating)return head+`<div class="view"><div class="wrap">${datingOff()}</div></div>`;
 let list=pool();const requested=S.ui.datingCandidate;if(requested&&list.includes(requested)){list=[requested,...list.filter(id=>id!==requested)];S.deckOrder=[requested,...S.deckOrder.filter(id=>id!==requested)];}delete S.ui.datingCandidate;
 if(!list.length)return head+`<div class="view"><div class="wrap">${deckEmpty()}</div></div>`;
 return head+`<div class="view deckmode"><div class="deck" id="deck">${deckInner(list)}</div></div>`;},
 after:(p)=>{if((p.sub||'discover')==='discover'&&$('#deck'))initDeck();fillJars();}};
ACT.pplSub=a=>setSub(a.dataset.v);

/* D01 — dating is off: no candidate photos, names or counts. V7: two honest ways in. */
function datingOff(){if(actionAuthor()==='couple')return `<div class="empty"><span class="ico l">${I.heart}</span><h3>${L('Знакомства пары выключены','Couple dating is off')}</h3><p>${L('Включите знакомства в профиле пары и согласуйте изменения.','Enable dating in the couple profile and approve the changes.')}</p><button class="btn primary" data-go="P02" data-p='{"owner":"couple"}'>${L('Настроить профиль','Edit profile')}</button></div>`;return `<div class="empty" style="padding-top:8px"><div class="opt-hero" style="width:100%"><span class="c c1"></span><span class="c c2"></span><span class="lockc">${I.heart}</span></div>
 <h3 style="font-size:24px">${L('Знакомства выключены','Dating is off')}</h3><p style="max-width:340px">${L('Можно сначала просто посмотреть — твою анкету при этом никто не увидит. Показаться другим можно потом, одним переключателем.','You can just look first — nobody will see your profile. Show yourself later with one switch.')}</p>
 <div class="dmode">
  <button class="dm" data-act="datingPeek"><span class="ico v">${I.eyeoff}</span><span class="tx"><b>${L('Смотреть незаметно','Browse hidden')}</b><small>${L('Ты видишь анкеты, тебя в подборке нет. Фото не нужно. Человек увидит тебя, только если ты отправишь симпатию.','You see profiles, you’re not in Discover. No photo needed. Someone sees you only if you like them.')}</small></span>${I.chev}</button>
  <button class="dm" data-act="enableDating"><span class="ico l">${I.heart}</span><span class="tx"><b>${L('Смотреть и показываться','Browse and be seen')}</b><small>${L('Анкета с фото — в подборке у тех, кто тоже включил знакомства.','A profile with a photo — in Discover for people who also turned dating on.')}</small></span>${I.chev}</button>
 </div>
 <div class="card list mt16" style="text-align:left;width:100%">
  <div class="li"><span class="ico g">${I.check}</span><span class="tx"><b>${L('Твой обычный профиль остаётся','Your regular profile stays')}</b><small>${L('Посты, сообщества и поиск по нику работают как раньше','Posts, communities and nickname search work as before')}</small></span></div>
  <div class="li"><span class="ico">${I.chat}</span><span class="tx"><b>${L('Чат — только при взаимной симпатии','Chat only when mutual')}</b><small>${L('В любом режиме написать тебе можно только после взаимности','In any mode, nobody can message you without a mutual like')}</small></span></div>
 </div></div>`;}
ACT.enableDating=()=>go('D02');
ACT.datingPeek=a=>run(a,()=>{authorProfile().dating=true;authorProfile().datingVisible=false;refresh();},{ms:350,ok:L('Смотришь незаметно. Тебя нет в подборке','Browsing hidden. You’re not in Discover')});
ACT.incogInfo=()=>sheet(()=>({title:L('Режим «незаметно»','Hidden mode'),lead:`<span class="ico v">${I.eyeoff}</span>`,body:`<div class="fact"><i class="g">${I.check}</i><span>${L('Ты листаешь подборку, а тебя в ней нет.','You browse Discover while staying out of it.')}</span></div><div class="fact"><i class="g">${I.check}</i><span>${L('Когда ты отправляешь симпатию, человек видит твою анкету у себя в «Симпатиях».','When you like someone, they see your profile in their Likes.')}</span></div><div class="fact"><i class="v">${I.info}</i><span>${S.me.photo?L('Чтобы показаться всем, включи видимость — фото уже есть.','To be seen by everyone, turn visibility on — you already have a photo.'):L('Чтобы показаться всем, нужно хотя бы одно фото.','To be seen by everyone, you need at least one photo.')}</span></div>`,foot:`<button class="btn primary" data-act="${S.me.photo?'goVisible':'enableDating'}">${I.heart}${L('Показаться в подборке','Show me in Discover')}</button><button class="btn soft" data-act="closeSheet">${L('Остаться незаметным','Stay hidden')}</button>`}));
ACT.goVisible=a=>{closeSheet(true);run(null,()=>{authorProfile().datingVisible=true;refresh();},{ok:L('Теперь ты в подборке','You’re in Discover now')});};
/* D11 — dating switched off by admins: a teaser, nothing about candidates */
function datingSoon(){const on=S.me.notifyDating;return `<div class="soon"><div class="soon-art" aria-hidden="true"><span class="s1"></span><span class="s2"></span><span class="sh">${I.heartf}</span><i></i><i></i><i></i></div>
 <span class="pill hot">${L('Скоро','Coming soon')}</span><h3>${L('Готовим прорыв в мире знакомств','We’re preparing a breakthrough in dating')}</h3>
 <p>${L('Подборка не по фото и случайным свайпам, а по тому, что откликается вам обоим. Запускаем в ближайшее время.','Matching not on photos and random swipes, but on what resonates with both of you. Launching soon.')}</p>
 <div class="soon-list">${[[I.spark,L('Совпадения по интересам и границам — честно, без рейтингов','Matches by interests and limits — honest, no ratings')],[I.key,L('Приватное открываешь сам(а): кому, что и на сколько','You decide who sees what, and for how long')],[I.chat,L('Написать можно только при взаимной симпатии','Messages only after a mutual like')]].map(([i,t])=>`<div>${i}<span>${t}</span></div>`).join('')}</div>
 <button class="btn ${on?'soft':'primary'}" data-act="notifyDating">${on?`${I.check}${L('Сообщим, как только запустим','We’ll tell you at launch')}`:`${I.bell}${L('Сообщить о запуске','Notify me at launch')}`}</button>
 <button class="btn text" data-act="toMap">${L('Пока пройти тесты — пригодится','Meanwhile, take a quiz — it’ll help')}</button></div>`;}
ACT.notifyDating=a=>run(a,()=>{S.me.notifyDating=!S.me.notifyDating;refresh();},{ms:300,ok:()=>S.me.notifyDating?L('Готово — пришлём уведомление о запуске','Done — we’ll notify you at launch'):L('Не будем напоминать','We won’t remind you')});

/* deck */
function deckInner(list){const a=list[0],b=list[1];return `${b?card(b,'next'):''}${card(a,'top')}<div class="acts onphoto" id="acts"><button class="act undo ${social().dhist&&social().dhist.length?'':'off'}" data-act="undo" aria-label="${L('Вернуть предыдущую анкету','Bring back the previous profile')}">${I.undo}</button><button class="act pass" data-act="decide" data-v="-1" aria-label="${L('Пропустить','Pass')}">${I.x}</button><button class="act req" data-act="reqAccess" data-v="${a}" aria-label="${L('Запросить расширенный профиль','Request private profile')}">${I.key}</button><button class="act like" data-act="decide" data-v="1" aria-label="${L('Нравится человек','Like this person')}">${I.heartf}</button></div>`;}
function card(id,pos){const p=PEOPLE[id];const ix=(S.ui.ph||{})[id]||0;const sh=shared(id);const likesMe=social().likesIn.some(l=>l.p===id);
 const post=allPosts().filter(x=>x.author===id).sort((a,b)=>b.t-a.t)[0];
 const keys=[...fmtList(p.format).slice(0,2).map(x=>opt('format',x)),...fmtList(p.role).filter(v=>v!=='none').slice(0,2).map(v=>opt('role',v)),...p.seek.slice(0,1).map(s=>opt('seek',s))].filter(Boolean);
 return `<article class="pc ${pos}" data-id="${id}" ${pos==='next'?'inert aria-hidden="true"':`aria-label="${esc(pname(id))}"`}>
 <div class="pc-ph">${photoBg(id,ix)}${bigPhoto(id,ix)}
  ${photoBars(id,ix)}
  ${photoCount(id)>1?`<div class="pc-zone l" data-ph="-1"></div><div class="pc-zone r" data-ph="1"></div>`:''}<div class="pc-zone c" data-ph="0" aria-hidden="true"></div>
  <div class="pc-tags">${likesMe?`<span class="pc-liked">${I.heartf}${L('Ты нравишься','Likes you')}</span>`:''}<span class="pc-score"><b>${sh.few?'—':sh.match.length}</b><small>${sh.few?L('мало данных','not enough data'):pl(sh.match.length,['общая тема','общие темы','общих тем'],['shared topic','shared topics'],true)}</small></span></div>
  <div class="stamp l">${L('Да','Like')}</div><div class="stamp n">${L('Мимо','Pass')}</div>
  <div class="pc-info"><h2 class="pc-name"><span class="pcn">${esc(pname(id))}</span>${p.age?`<span>${p.age}</span>`:''}${nameBadges(p)}</h2>
   <div class="pc-who">${[whoLine(id),placeLine(id)].filter(Boolean).map(x=>`<span>${esc(x)}</span>`).join('')}${p.online?`<span class="on">${L('в сети','online')}</span>`:''}</div>
   <div class="pc-keys">${keys.map(k=>`<span>${esc(k)}</span>`).join('')}</div>
   <div class="pc-hint">${I.down}${L('Листай вниз — что у вас общего','Scroll down — what you share')}</div></div>
 </div>
 <div class="pc-body">
  <button class="why" data-go="P05" data-id="${id}">${venn(sh.few?'?':sh.match.length,{mini:1})}<span class="grow"><b>${esc(sharedSummary(id))}</b><span>${L('Только то, что вы оба открыли','Only what you both made visible')}</span></span>${I.chev}</button>
  <div class="sec">${L('О себе','About')}</div>${md(T(p.bio),'bio')}
  ${sh.match.length?`<div class="sec">${L('Совпадает','In common')}</div><div class="chips">${sh.match.map(m=>`<span class="chip hit">${esc(topic(m))}</span>`).join('')}</div>`:''}
  ${sh.complement.length?`<div class="sec">${L('Дополняете друг друга','You complement each other')}</div>${sh.complement.map(c=>`<div class="fact"><i class="g">${I.check}</i><span>${esc(c)}</span></div>`).join('')}`:''}
  ${sh.discuss.length?`<div class="sec">${L('Стоит обсудить','Worth discussing')}</div>${sh.discuss.slice(0,2).map(c=>`<div class="fact"><i class="a">${I.warn}</i><span>${esc(c)}</span></div>`).join('')}`:''}
  <div class="sec">${L('Интересы','Interests')}</div>${jarShelf(pubJars(id),{pre:1,act:'topic',who:id,moreAct:'allJars'})}
  ${post?`<div class="sec">${L('Публикация','Post')} · ${F.rel(post.t)}</div><button class="quote" data-go="F05" data-id="${post.id}"><p>${esc(T(post.text))}</p>${ic('chev',18)}</button>`:''}
  <div class="sec">${L('Расширенный профиль','Private profile')}</div><div data-deck-private="${id}">${veilBlock(id)}</div>
  <div class="pc-foot"><button class="btn soft" data-go="P01" data-p='${esc(JSON.stringify({id,actor:datingActor()}))}'>${L('Полный профиль','Full profile')}</button><button class="btn soft" data-act="follow" data-v="${id}">${social('me').follows.has(id)?L('Ты подписан(а)','Following'):L('Подписаться','Follow')}</button></div>
  <p class="note center mt12">${L('Подписка показывает посты, но не открывает чат','Following shows posts but doesn’t open a chat')}</p>
 </div></article>`;}
/** private layer: no real data is sent before access — the veil hides placeholders only */
function veilBlock(id){const o=social().reqOut.find(x=>x.p===id&&x.status==='pending'&&!isBlocked(id));const shared=receivedGrant(id);
 if(shared)return `<button class="granted" style="width:100%;text-align:left" data-go="P08" data-id="${id}">${I.unlock}<span class="grow"><b>${L(`${esc(pname(id))} открыл(а) тебе доступ`,`${esc(pname(id))} shared with you`)}</b><span>${shared.granted.map(g=>T(REQ_SCOPES.find(x=>x[0]===g)[1])).join(', ')} · ${F.left(shared.until)}</span></span>${I.chev}</button>`;
 return `<div class="veil"><div class="veil-content"><div class="bar-sk" style="width:60%"></div><div class="bar-sk"></div><div class="bar-sk" style="width:80%"></div><div class="bar-sk" style="width:40%"></div></div>
 <div class="veil-glass"><div class="lockdot">${I.lock}</div><b>${L(`Открывает ${esc(pname(id))}`,`${esc(pname(id))} decides`)}</b><p>${L('Интересы, приватные фото и альбомы — только по решению владельца.','Interests, private photos and albums — only if the owner decides.')}</p>${o?`<span class="pill wait">${I.clock}${L('Запрос ждёт ответа','Request pending')}</span>`:`<button class="btn dark" data-act="reqAccess" data-v="${id}">${L('Запросить доступ','Request access')}</button>`}</div></div>`;}
function deckRender(){const d=$('#deck');const list=pool();if(!d||!list.length){refresh();return;}d.innerHTML=deckInner(list);initDeck();fillJars();}
let undoAnim=0;
function initDeck(){const c=$('#deck .pc.top');if(!c)return;const acts=$('#acts');
 if(undoAnim){const d=undoAnim;undoAnim=0;c.style.transition='none';c.style.transform=`translateX(${d*120}%) rotate(${d*14}deg)`;requestAnimationFrame(()=>requestAnimationFrame(()=>{c.style.transition='';c.style.transform='';}));}
 c.addEventListener('scroll',()=>{acts&&acts.classList.toggle('onphoto',c.scrollTop<c.clientHeight*.55);},{passive:true});
 let sx,sy,startedAt,dx=0,mode=null,pid=null;const nx=$('#deck .pc.next');
 c.addEventListener('dragstart',e=>e.preventDefault());
 c.addEventListener('pointerdown',e=>{if(e.button>0||e.target.closest('button,a,input,textarea,select'))return;sx=e.clientX;sy=e.clientY;startedAt=e.timeStamp;dx=0;mode=null;pid=e.pointerId;});
 c.addEventListener('pointermove',e=>{if(pid!==e.pointerId)return;const mx=e.clientX-sx,my=e.clientY-sy;
  if(!mode){if(Math.abs(mx)>10&&Math.abs(mx)>Math.abs(my)*1.2){mode='x';c.setPointerCapture(pid);c.classList.add('drag');nx&&nx.classList.add('drag');}else if(Math.abs(my)>10&&Math.abs(my)>Math.abs(mx)*1.2)mode='y';}
  if(mode==='x'){dx=mx;const pr=Math.min(1,Math.abs(dx)/140);if(nx)nx.style.transform=`scale(${.95+.05*pr}) translateY(${10-10*pr}px)`;c.style.transform=`translateX(${dx}px) rotate(${dx/18}deg)`;c.style.setProperty('--l',Math.max(0,Math.min(1,dx/110)));c.style.setProperty('--n',Math.max(0,Math.min(1,-dx/110)));}});
 const end=e=>{if(pid!==e.pointerId)return;pid=null;c.classList.remove('drag');nx&&nx.classList.remove('drag');
  if(mode==='x'){c.dataset.dr=1;setTimeout(()=>delete c.dataset.dr,60);if(Math.abs(dx)>Math.max(80,Math.min(110,c.clientWidth*.28))||Math.abs(dx)>44&&Math.abs(dx)/Math.max(1,e.timeStamp-startedAt)>.6)decide(dx>0?1:-1);else{c.style.transform='';if(nx)nx.style.transform='';c.style.setProperty('--l',0);c.style.setProperty('--n',0);}}mode=null;};
 c.addEventListener('pointerup',end);c.addEventListener('pointercancel',e=>{dx=0;end(e);});
 // V7 fix: setPointerCapture moves capture away from the touched child; its lostpointercapture bubbles up and used to cancel every touch swipe
 c.addEventListener('lostpointercapture',e=>{if(e.target!==c||pid!==e.pointerId)return;end(e);});
 c.addEventListener('click',e=>{if(c.dataset.dr){e.stopPropagation();e.preventDefault();return;}
  const z=e.target.closest('[data-ph]');if(!z)return;e.stopPropagation();const id=c.dataset.id;const d=+z.dataset.ph;
  if(!d){openViewer(photoItems(id),(S.ui.ph||{})[id]||0);return;}
  if(!stepPhoto(id,d)){c.classList.remove('nudge-l','nudge-r');void c.offsetWidth;c.classList.add(d<0?'nudge-l':'nudge-r');return;}
  const ph=$('.pc-ph',c);const img=ph.querySelector(':scope>img:not(.mbg),:scope>.plate')||ph.lastElementChild;const tmp=document.createElement('div');tmp.innerHTML=bigPhoto(id,S.ui.ph[id]);ph.replaceChild(tmp.firstElementChild,img);
  $$('.pc-bars i',c).forEach((b,i)=>b.classList.toggle('on',i===S.ui.ph[id]));},true);
}
document.addEventListener('keydown',e=>{if(!S||!S.session||cur().id!=='D03'||(cur().p.sub||'discover')!=='discover'||S.ui.sheet||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(e.key==='ArrowRight')decide(1);if(e.key==='ArrowLeft')decide(-1);});
let deckBusy=false;
function decide(dir){if(cur()?.id!=='D03'||(cur().p.sub||'discover')!=='discover'||deckBusy)return;const id=$('#deck .pc.top')?.dataset.id||pool()[0];const selected=actionAuthor();if(!authorGuard(selected))return;if(!authorProfile(selected)?.dating){toast(L('Знакомства этого профиля выключены. Включи их в редакторе профиля.','Dating is off for this profile. Enable it in the profile editor.'),{type:'warn'});return;}const list=pool();if(!id)return;const c=$('#deck .pc.top');const owner=S,route=cur(),ticket=authorTicket(actionAuthor());
 if(QA.offline){toast(NETFAIL(),{type:'err'});if(c){c.style.transform='';c.style.setProperty('--l',0);c.style.setProperty('--n',0);}return;}
 deckBusy=true;if(c){c.classList.add('fly');c.style.transform=`translateX(${dir*130}%) rotate(${dir*16}deg)`;c.style.setProperty(dir>0?'--l':'--n',1);}
 const nx=$('#deck .pc.next');if(nx){nx.style.transform='';nx.classList.add('promote');}
 social().dhist=social().dhist||[];social().dhist.push({id,dir});social().decided[id]=dir;social().history.unshift({p:id,d:dir,t:Date.now()});if(dir>0)likePerson(id,'discover');
 setTimeout(()=>{deckBusy=false;if(!validAuthor(ticket)||datingActor()!==ticket.id||S!==owner||cur()!==route||!S.session||!authorProfile().dating)return;deckRender();},c?290:0);
}
ACT.decide=a=>decide(+a.dataset.v);
ACT.undo=()=>{if(cur()?.id!=='D03'||!canAct('dating',datingActor()))return;const h=social().dhist||[];if(h.length&&isMatch(h.at(-1).id)){toast(L('Уже взаимно. Управлять контактом можно в Чатах.','Already mutual. Manage this connection in Chats.'),{type:'info',action:{label:L('Чаты','Chats'),fn:()=>tab('chats')}});return;}if(!h.length){toast(L('Пока некого возвращать','Nothing to bring back yet'),{type:'info'});return;}
 if((social().undos||0)>=1&&!S.me.premium){premiumSheet('undo');return;}
 const last=h.pop();delete social().decided[last.id];social().history.shift();social().likesOut=social().likesOut.filter(l=>l.p!==last.id);social().undos=(social().undos||0)+1;undoAnim=last.dir;deckRender();toast(L('Вернули предыдущую анкету','Previous profile is back'),{type:'ok'});};
/** a personal like; only a mutual like opens a chat (R01) */
function likePerson(id,src){if(src==='profile'&&(actionAuthor()!=='me'||PEOPLE[id]?.pair))return;if(actionAuthor()==='couple'&&!canAct('dating','couple'))return;if(!authorGuard()||!PEOPLE[id]||relatedFor(actionAuthor(),id)||isBlocked(id)||isMatch(id)||!authorProfile().socialLikes&&src!=='discover'||src==='discover'&&!authorProfile().dating||!PEOPLE[id].dating&&!PEOPLE[id].socialLikes)return;
 const theyLike=social().likesIn.some(l=>l.p===id)||QA.autoApprove;
 if(theyLike){social().matches.unshift({p:id,t:Date.now()});social().likesIn=social().likesIn.filter(l=>l.p!==id);if(actionAuthor()==='couple')pairNotify('match',id,{p:id,go:['H02',{id,actor:'couple'}]});else S.notifs.unshift({id:'n'+Date.now(),type:'match',p:id,t:Date.now(),read:true,go:['H01']});ensureThread(id,actionAuthor());showMatch(id);}
 else{if(!social().likesOut.some(l=>l.p===id))social().likesOut.unshift({p:id,src,initiator:pairMember(),pairId:actionAuthor()==='couple'?S.pair.id:null,t:Date.now()});toast(authorProfile().dating&&!authorProfile().datingVisible?L(`Симпатия отправлена. ${pname(id)} увидит твою анкету в «Симпатиях»`,`Like sent. ${pname(id)} will see your profile in Likes`):L(`Симпатия отправлена. Чат откроется, если ${pname(id)} ответит взаимностью`,`Like sent. A chat opens if ${pname(id)} likes you back`),{type:'ok'});}
 renderSide();const d=$('.dock');if(d&&screenHasDock(cur().id)){d.outerHTML=dockHTML();}
}
/* D08 — it’s mutual */
function showMatch(id){S.ui.matchContext={id,actor:actionAuthor(),ticket:authorTicket()};const m=$('#matchLayer');const sh=sharedSummary(id);
 m.innerHTML=`<div class="match" role="dialog" aria-modal="true" aria-label="${L('Это взаимно','It’s mutual')}"><div class="pair">${av(actionAuthor(),'')}<span class="heart">${I.heartf}</span>${av(id,'')}</div><h2>${L('Это взаимно','It’s mutual')}</h2><p>${L(`${actionAuthor()==='couple'?esc(pname('couple')):'Ты'} и ${esc(pname(id))} понравились друг другу. ${sh}.`,`${actionAuthor()==='couple'?esc(pname('couple')):'You'} and ${esc(pname(id))} like each other. ${sh}.`)}</p>
 <button class="btn primary" data-act="matchChat" data-v="${id}">${I.chat}${L('Написать первым','Send the first message')}</button><button class="btn soft" data-act="matchClose">${L('Смотреть дальше','Keep browsing')}</button><p class="note mt16">${L('Расширенный профиль остаётся закрытым — его открывают отдельно.','The private profile stays closed — it’s shared separately.')}</p></div>`;
 m.style.pointerEvents='auto';$('.match .btn',m).focus();}
ACT.matchClose=()=>{const m=$('#matchLayer');m.innerHTML='';m.style.pointerEvents='none';if(cur().id==='D03')refresh();};
ACT.matchChat=a=>{const context=S.ui.matchContext;ACT.matchClose();if(!context||context.id!==a.dataset.v||!validAuthor(context.ticket))return;openChat(context.id,context.actor);};

/* D10 — nobody left */
function deckEmpty(){const n=dfCount(social().filters.dating);return `<div class="empty" style="padding-top:4px"><div class="radar"><i></i><i></i><i></i><span class="me">${S.me.photo?`<img src="${IMG(S.me.photo)}" alt="" style="width:100%;height:100%;object-fit:cover">`:plate('rose')}</span><span class="dot" style="left:18px;top:60px;position:absolute;overflow:hidden">${plate('sea')}</span><span class="dot" style="right:24px;top:150px;width:22px;height:22px;position:absolute;overflow:hidden">${plate('amber')}</span></div>
 <h3>${L('На сегодня анкеты закончились','That’s everyone for today')}</h3><p>${n?L('С текущими фильтрами больше никого. Можно расширить поиск или заглянуть позже.','No one else matches your filters. Widen the search or check back later.'):L('Новые люди появятся, когда кто-то рядом включит знакомства.','New people appear as others nearby turn on dating.')}</p>
 <div class="btns">${n?`<button class="btn primary" data-act="dfSheet">${L('Изменить фильтры','Change filters')}</button>`:''}<button class="btn soft" data-act="toLikes">${L('Ответить на симпатии','Answer your likes')}${C.likesIn()?` · ${C.likesIn()}`:''}</button><button class="btn text" data-go="D09">${L('Кого я уже смотрел(а)','Recently viewed')}</button></div>
 <div class="card list mt16" style="text-align:left;width:100%">${linkRow({act:'toEvents',icon:'cal',tone:'g',title:L('События рядом','Events nearby'),sub:L('Познакомиться вживую','Meet in person')})}${linkRow({tab:1,act:'toGroups',icon:'groups',tone:'v',title:L('Сообщества','Communities'),sub:L('Люди по интересам','People with your interests')})}${linkRow({act:'toMap',icon:'spark',tone:'l',title:L('Пройти тест','Take a quiz'),sub:L('Больше общего — точнее подборка','More shared topics — better matches')})}</div></div>`;}
ACT.toLikes=()=>setSub('likes');ACT.toGroups=()=>tab('groups');

/* D06 — likes, free to see and to answer */
function likesBody(r){const k=r.p.lk||'in';const inc=social().likesIn.filter(l=>!isMatch(l.p)&&!isBlocked(l.p)&&!l.passed);const out=social().likesOut.filter(l=>!isMatch(l.p));
 const t=seg([['in',L('Тебе','To you'),inc.length||''],['out',L('Твои','Yours')]],k,'lkTab','sm');
 if(k==='out')return t+(out.length?`<p class="note" style="margin:0 0 10px">${L('Ждут ответа. Отменить симпатию можно в любой момент — человек не узнает.','Waiting for an answer. You can withdraw a like any time — they won’t be told.')}</p><div class="card list">${out.map(l=>`<div class="li">${av(l.p,'')}<button class="tx" data-go="P01" data-id="${l.p}" style="text-align:left"><b>${esc(pname(l.p))}</b><small>${l.src==='profile'?L('из профиля','from profile'):L('из подборки','from discover')} · ${F.rel(l.t)}${actionAuthor()==='couple'?' · '+esc(pname(l.initiator||'me')):''}</small></button><span class="pill wait">${L('ждёт','pending')}</span><button class="ibtn ghost sm" data-act="unlike" data-v="${l.p}" aria-label="${L('Отменить симпатию','Withdraw like')}">${I.close}</button></div>`).join('')}</div>`:empty('heart',L('Ты пока никому не отправил(а) симпатию','You haven’t liked anyone yet'),L('Симпатию можно отправить из подборки или из профиля человека.','You can like someone from Discover or from their profile.'),`<button class="btn soft" data-act="pplSub" data-v="discover">${L('К подборке','To Discover')}</button>`));
 if(!inc.length)return t+empty('heart',L('Пока никто не отправил симпатию','No likes yet'),L('Пройденные тесты и пара публикаций помогают людям найти тебя.','Quizzes and a couple of posts help people find you.'),`<button class="btn soft" data-go="P02">${L('Дополнить профиль','Improve your profile')}</button>`);
 return t+`<p class="note" style="margin:0 0 12px">${L('Ответная симпатия сразу откроет чат.','Liking back opens a chat right away.')}</p><div class="likes">${inc.map((l,i)=>`<div class="lk" style="animation-delay:${i*50}ms"><button style="position:absolute;inset:0" data-go="P01" data-id="${l.p}" aria-label="${esc(pname(l.p))}">${bigPhoto(l.p,0)}</button><span class="src">${l.src==='profile'?L('из профиля','from profile'):L('из подборки','from discover')}</span><span class="inf"><b>${esc(pname(l.p))}${person(l.p).age?', '+person(l.p).age:''}</b><small>${esc(sharedSummary(l.p))}</small></span><button class="lkb" data-act="likeBack" data-v="${l.p}" aria-label="${L('Ответить симпатией','Like back')}">${I.heartf}</button></div>`).join('')}</div>`;}
ACT.lkTab=a=>{cur().p.lk=a.dataset.v;refresh();};
ACT.likeBack=a=>{const ticket=authorTicket();if(!authorProfile().dating&&!authorProfile().socialLikes){toast(L('Сначала включи симпатии в настройках приватности','Turn on likes in privacy settings first'),{type:'warn'});return;}run(a,()=>{if(!validAuthor(ticket)||actionAuthor()!==ticket.id)return;likePerson(a.dataset.v,'likes');if(cur().id==='D03')refresh();},{ms:300});};
ACT.unlike=a=>{const id=a.dataset.v,ticket=authorTicket(),st=social();const prev=st.likesOut.slice();run(a,()=>{if(!validAuthor(ticket))return;st.likesOut=st.likesOut.filter(l=>l.p!==id);refresh();},{ok:L('Симпатия отменена','Like withdrawn'),undo:()=>{if(!validAuthor(ticket))return;st.likesOut=prev;refresh();}});};

/* D07 — matches */
function matchesBody(){const ms=social().matches.filter(m=>!isBlocked(m.p));
 if(!ms.length)return empty('chat',L('Совпадений пока нет','No matches yet'),L('Совпадение — это взаимная симпатия. Тогда откроется личный чат.','A match is a mutual like. That’s when a private chat opens.'));
 return `<p class="note" style="margin:0 0 6px">${L('Совпадения — взаимные симпатии. С ними можно переписываться.','Matches are mutual likes. You can chat with them.')}</p><div class="card list">${ms.map(m=>`<div class="li">${av(m.p,'round')}<button class="tx" data-go="P01" data-id="${m.p}" style="text-align:left"><b>${esc(pname(m.p))}</b><small>${L('совпали','matched')} ${F.rel(m.t)} · ${esc(sharedSummary(m.p))}</small></button><button class="btn sm ${S.threads[m.p]?'soft':'primary'}" data-act="openChat" data-v="${m.p}">${S.threads[m.p]?L('Чат','Chat'):L('Написать','Message')}</button></div>`).join('')}</div>`;}
ACT.openChat=a=>openChat(a.dataset.v,a.dataset.actor||actionAuthor());
function ensureThread(id,actor=actionAuthor()){const st=social(actor);if(!st)return null;const t=st.threads[id]??={msgs:[],unread:0,fresh:true};t.actor??=actor;t.target??=id;t.members??=[...new Set([...realMembers(actor),...realMembers(id)])];t.pairId??=actor==='couple'?S.pair?.id:null;t.pair=t.members.length>2;t.readBy??={};return t;}
function openChat(id,actor=actionAuthor()){if(!PEOPLE[id]||!chatReadable(id,actor)||relatedFor(actor,id)||isBlocked(id)||!isMatch(id,actor)&&!social(actor)?.threads[id]?.ended){toast(L('Чат доступен только после взаимной симпатии выбранных профилей.','Chat requires a mutual like between the selected profiles.'),{type:'warn'});return;}ensureThread(id,actor);social(actor).archived.delete(id);if(S.nav.tab!=='chats'){S.nav.tab='chats';S.nav.stacks.chats.length=1;}go('H02',{id,actor});}

/* D04 — dating filters: only fields people opened for dating */
/* D04 — dating filters: a popup like every other filter (round 5). The draft lives in S.ui.df until «Показать»;
   long lists open inside the same popup (S.ui.dfsub), the city picker returns to it. */
const dfRows=()=>[['gender',L('Гендер','Gender'),optItems('gender'),optGroups('gender')],['orient',L('Ориентация','Orientation'),optItems('orient'),optGroups('orient')],['format',L('Формат отношений','Relationship format'),optItems('format'),optGroups('format')],['seek',L('Что ищет','Looking for'),optItems('seek')],['role',L('Роль','Role'),optItems('role'),optGroups('role')],['topics',L('Интересы','Interests'),topicItems(Object.keys(TOPICS).filter(t=>!['limits','edge','safety'].includes(TOPICS[t].cat))),topicGroups(Object.keys(TOPICS).filter(t=>!['limits','edge','safety'].includes(TOPICS[t].cat)))]];
const dfr=()=>S.ui.df;
const dfRe=()=>{if(S.ui.sheet)resheet();else refresh();};
function dfMatches(f){return S.deckOrder.filter(id=>!social().decided[id]&&!isMatch(id)&&!isBlocked(id)&&!relatedFor(actionAuthor(),id)&&!(activePair()&&id===S.pair.with)&&PEOPLE[id].dating&&passDating(id,f)).length;}
function dfSheet(){if(!S.ui.df)S.ui.df=JSON.parse(JSON.stringify(social().filters.dating));S.ui.dfsub=null;const f0=S.ui.df;f0.topics=f0.topics||[];f0.placeMode=f0.placeMode||'city';
 sheet(()=>{const f=S.ui.df;if(!f)return{title:'',body:''};const DROWS=dfRows();
  if(S.ui.dfsub){const row=DROWS.find(x=>x[0]===S.ui.dfsub);f[row[0]]=f[row[0]]||[];return{title:row[1],lead:`<button class="ibtn ghost sm" data-act="dfBack" aria-label="${L('К фильтрам','Back to filters')}">${I.back}</button>`,search:row[2].length>10,searchPh:L('Найти вариант','Find an option'),body:`${fChips(row[2],f[row[0]],'dfMulti',{k:row[0],groups:row[3]})}<p class="note sh-empty" hidden>${L('Ничего не нашлось','Nothing found')}</p>`,foot:`<button class="btn primary" data-act="dfBack">${f[row[0]].length?L(`Готово · ${f[row[0]].length}`,`Done · ${f[row[0]].length}`):L('Готово','Done')}</button>`};}
  const n=dfMatches(f);
  return{title:L('Фильтры знакомств','Dating filters'),head:`<button class="btn text auto" data-act="dfReset">${L('Сбросить','Reset')}</button>`,
   body:`<section class="fin"><div class="fin-t"><b>${L('Кого показывать','Show')}</b><span>${L('один вариант','one option')}</span></div><div class="fin-b">${choices([['all',L('Все','All')],['people',L('Люди','People')],['pairs',L('Пары','Couples')]],f.show,'dfShow')}</div></section>
 <section class="fin"><div class="fin-t"><b>${L('Возраст','Age')}</b><b class="fin-v" id="ageLbl">${f.age[0]}–${f.age[1]}</b></div><div class="card"><div class="dual"><span class="trk"><i style="left:${(f.age[0]-18)/81*100}%;right:${100-(f.age[1]-18)/81*100}%"></i></span><input type="range" min="18" max="99" value="${f.age[0]}" data-in="dfAge" data-i="0" aria-label="${L('Минимальный возраст','Minimum age')}"><input type="range" min="18" max="99" value="${f.age[1]}" data-in="dfAge" data-i="1" aria-label="${L('Максимальный возраст','Maximum age')}"></div></div></section>
 <section class="fin"><div class="fin-t"><b>${L('Где искать','Where')}</b></div><div class="card">${locationFields(f,'dfCity','dfPlaceMode','dfGeo').replace(/^<div class="sec">[^<]*<\/div>/,'')}${f.city&&f.placeMode==='city'?`<button class="btn text auto" data-act="dfAnyCity">${L('Искать в любом городе','Search any city')}</button>`:''}${f.placeMode==='nearby'?`<div class="row" style="justify-content:space-between;margin-top:10px"><span class="note">${L('Радиус','Radius')}</span><b id="distLbl">${L(`до ${f.dist} км`,`up to ${f.dist} km`)}</b></div><div class="dual single"><span class="trk"><i style="left:0;right:${100-(f.dist-5)/95*100}%"></i></span><input type="range" min="5" max="100" step="5" value="${f.dist}" data-in="dfDist" aria-label="${L('Расстояние','Distance')}"></div>`:''}</div></section>
 ${DROWS.map(([k,l,items,groups])=>`<section class="fin"><div class="fin-t"><b>${l}</b><span>${L('можно несколько','pick any')}</span></div>${popChips(items,f[k]||[],'dfMulti',`data-act="dfOpen" data-v="${k}"`,{groups,k,lim:k==='topics'?6:groups?groups[0][1].length:items.length})}</section>`).join('')}
 <p class="grp-n">${L('Фильтры работают только по данным, которые люди сами открыли для знакомств. Скрытые поля и границы не участвуют.','Filters use only what people opened for dating. Hidden fields and limits are never used.')}</p>`,
   foot:`<button class="btn primary" data-act="dfApply">${n?L(`Показать ${pl(n,['анкету','анкеты','анкет'],[])}`,`Show ${pl(n,[],['profile','profiles'])}`):L('Применить · пока никого','Apply · no matches yet')}</button>`};},{full:true});}
ACT.dfSheet=()=>{S.ui.df=null;dfSheet();};
ACT.dfBack=()=>{S.ui.dfsub=null;resheet();};
ACT.dfOpen=a=>{S.ui.dfsub=a.dataset.v;resheet();};
ACT.dfShow=a=>{dfr().show=a.dataset.v;dfRe();};
ACT.dfMulti=a=>{const d=dfr();d[a.dataset.k]=d[a.dataset.k]||[];if(a.dataset.k==='role')d.role=toggleIdentityValue(d.role,'role',a.dataset.v);else{const arr=d[a.dataset.k];const i=arr.indexOf(a.dataset.v);i<0?arr.push(a.dataset.v):arr.splice(i,1);}dfRe();};
ACT.dfReset=()=>{S.ui.df={show:'all',age:[18,99],dist:100,gender:[],orient:[],format:[],seek:[],topics:[],role:[],placeMode:'city',city:'',coords:null};dfRe();};
IN.dfAge=el=>{const f=dfr();const i=+el.dataset.i;let v=+el.value;if(i===0)v=Math.min(v,f.age[1]-1);else v=Math.max(v,f.age[0]+1);el.value=v;f.age[i]=v;$('#ageLbl').textContent=`${f.age[0]}–${f.age[1]}`;const t=el.parentNode.querySelector('.trk i');t.style.left=(f.age[0]-18)/81*100+'%';t.style.right=100-(f.age[1]-18)/81*100+'%';clearTimeout(S.ui.dfT);S.ui.dfT=setTimeout(dfRe,350);};
IN.dfDist=el=>{const f=dfr();f.dist=+el.value;$('#distLbl').textContent=L(`до ${f.dist} км`,`up to ${f.dist} km`);el.parentNode.querySelector('.trk i').style.right=100-(f.dist-5)/95*100+'%';clearTimeout(S.ui.dfT);S.ui.dfT=setTimeout(dfRe,350);};
ACT.dfApply=()=>{const f=dfr();if(f.placeMode==='nearby'&&!f.coords&&!S.me.location?.coords){toast(L('Укажи примерное расположение или выбери поиск по городу','Set approximate location or search by city'),{type:'warn'});return;}social().filters.dating={...f,age:[Math.max(18,f.age[0]),Math.max(18,f.age[1])]};S.ui.df=null;closeSheet(true);if(cur().id==='D04')back();else refresh();toast(L('Фильтры применены','Filters applied'),{type:'ok'});};
/* deep link / review list: the deck with the filter popup open */
SC.D04={tab:'people',title:()=>L('Фильтры знакомств','Dating filters'),render:(p,r)=>SC.D03.render({sub:'discover'},r),after:()=>{SC.D03.after({sub:'discover'});S.ui.df=null;setTimeout(dfSheet,60);}};

/* D02 — enable dating */
SC.D02={title:()=>L('Анкета для знакомств','Dating profile'),render:(p,r)=>{const f=r.f;
 if(!r.init){r.init=1;f.gender=[...(social().filters.dating.gender||[])];f.seek=[...S.me.seek];f.format=[...fmtList(S.me.format)];f.role=[...fmtList(S.me.role)];f.city=S.me.city||'';f.placeMode=S.me.location?.mode||'city';f.coords=S.me.location?.coords||null;f.photo=S.me.photo;f.showAge=S.me.showAge!==false;f.ok=false;f.visible=authorProfile().dating?authorProfile().datingVisible!==false:true;}
 return `${bar(L('Анкета для знакомств','Dating profile'),{back:1,sm:1})}<div class="view nodock cta1"><div class="wrap">
 <p class="lead">${L('Это займёт минуту. Всё можно поменять или выключить в любой момент.','It takes a minute. You can change or turn it off any time.')}</p>
 <section class="grp"><div class="grp-t"><span>${L('Что ищешь и кого','What you look for')}</span></div><div class="card form-card"><div class="field ${r.err&&r.err.seek?'err':''}" data-field="seek"><span class="flabel">${L('Что ищешь','Looking for')}</span>${chipGroup(optItems('seek'),f.seek,'d2Multi',{k:'seek',all:1})}${r.err&&r.err.seek?`<div class="ferr">${I.alert}${r.err.seek}</div>`:''}</div>
 <div class="field ${r.err&&r.err.gender?'err':''}" data-field="gender"><span class="flabel">${L('Кого показывать','Who to show')}</span>${chipGroup(optItems('gender'),f.gender,'d2Multi',{k:'gender',title:L('Кого показывать','Who to show'),groups:optGroups('gender')})}${r.err&&r.err.gender?`<div class="ferr">${I.alert}${r.err.gender}</div>`:''}</div>
 <div class="field"><span class="flabel">${L('Формат отношений','Relationship format')}<i style="font-style:normal;font-weight:500;color:var(--faint)">${L('можно несколько','pick any')}</i></span>${identityChoices('format',f.format,'d2Multi')}</div>
 <div class="field"><span class="flabel">${L('Роль','Role')}<i style="font-style:normal;font-weight:500;color:var(--faint)">${L('необязательно','optional')}</i></span>${identityChoices('role',f.role,'d2Multi')}</div>
</div></section><section class="grp"><div class="card form-card"> ${locationFields(f,'d2City','d2PlaceMode','d2Geo')}${r.err?.city?`<p class="ferr">${r.err.city}</p>`:''}
</div></section> <div class="card list">${toggleRow('d2Age',L(`Показывать возраст — ${ageOf(S.me.dob)}`,`Show my age — ${ageOf(S.me.dob)}`),L('Дата рождения скрыта всегда','Date of birth is always hidden'),f.showAge)}</div>
 <div class="sec">${L('Как участвовать','How to take part')}</div><div class="dmode">${[[true,'heart','l',L('Смотреть и показываться','Browse and be seen'),L('Нужно хотя бы одно фото','At least one photo needed')],[false,'eyeoff','v',L('Только смотреть, незаметно','Browse hidden only'),L('Фото не нужно. Тебя увидят, только если ты отправишь симпатию','No photo needed. People see you only if you like them')]].map(([v,i,t,b,sm])=>`<button class="dm ${f.visible===v?'on':''}" data-act="d2Vis" data-v="${v?1:0}" aria-pressed="${f.visible===v}"><span class="ico ${t}">${I[i]}</span><span class="tx"><b>${b}</b><small>${sm}</small></span><span class="rd"></span></button>`).join('')}</div>
 ${f.visible!==false?`<div class="card list mt12 ${r.err?.photo?'err':''}" data-field="photo"><div class="li"><span class="ico">${I.camera}</span><span class="tx"><b>${L('Фото для подборки','Photo for Discover')}</b><small>${f.photo?L('Можно заменить или добавить ещё в профиле','Replace it or add more in your profile'):L('Добавь своё фото — без него тебя не покажут другим','Add your photo — without it you won’t be shown')}</small></span><button class="btn soft sm auto" data-act="d2Photo">${f.photo?L('Заменить','Replace'):L('Добавить','Add')}</button></div>${f.photo?`<button class="d2ph" data-act="d2View"><img src="${IMG(f.photo)}" alt="${L('Твоё фото','Your photo')}"></button>`:''}${r.err?.photo?`<p class="ferr">${I.alert}${r.err.photo}</p>`:''}</div>`:''}
 <div class="sec">${L('Так тебя увидят','How you’ll appear')}</div>
 <div class="card row">${f.photo?`<span class="av lg"><img src="${IMG(f.photo)}" alt=""></span>`:av('me','lg')}<div class="grow"><b style="font-size:17px">${esc(pname('me'))}${f.showAge?`, ${ageOf(S.me.dob)}`:''}</b><div class="note">${esc([opt('pron',S.me.pron),city(f.city)].filter(Boolean).join(' · '))}</div><div class="chips mt8">${[...f.format.slice(0,2).map(x=>opt('format',x)),...f.role.filter(v=>v!=='none').slice(0,2).map(v=>opt('role',v)),...f.seek.slice(0,1).map(s=>opt('seek',s))].filter(Boolean).map(x=>`<span class="chip tag">${esc(x)}</span>`).join('')}</div></div></div>
 <button class="check ${f.ok?'on':''} ${r.err&&r.err.ok?'err':''}" data-act="chk" data-v="ok" data-field="ok"><i>${I.check}</i><span>${L('Понимаю: анкету увидят только те, кто тоже включил знакомства. Личный чат — только после взаимной симпатии.','I understand: only people who also turned on dating can see me. Private chat only after a mutual like.')}${r.err&&r.err.ok?`<span class="ferr">${I.alert}${r.err.ok}</span>`:''}</span></button>
 </div></div><div class="ctabar"><div class="wrap"><button class="btn primary" data-act="d2Save">${I.heart}${authorProfile().dating?L('Сохранить анкету','Save dating profile'):L('Включить знакомства','Turn on dating')}</button></div></div>`;}};
ACT.d2Multi=a=>{const r=cur();r.f[a.dataset.k]=toggleIdentityValue(r.f[a.dataset.k],a.dataset.k,a.dataset.v);if(r.err)delete r.err[a.dataset.k];r.dirty=true;refresh();};
ACT.d2One=a=>{const r=cur();r.f[a.dataset.k]=r.f[a.dataset.k]===a.dataset.v?'':a.dataset.v;r.dirty=true;refresh();};
ACT.d2Age=()=>{const r=cur();r.f.showAge=!r.f.showAge;refresh();};
ACT.d2Vis=a=>{const r=cur();r.f.visible=a.dataset.v==='1';if(r.err)delete r.err.photo;r.dirty=true;refresh();};
ACT.d2View=()=>openViewer([{type:'image',src:IMG(cur().f.photo)}]);
ACT.d2Save=a=>{const r=cur(),f=r.f;r.err={};if(f.visible!==false&&!f.photo)r.err.photo=L('Добавь фото — это обязательное условие знакомств','Add a photo — it is required for dating');if(f.placeMode==='city'&&!f.city)r.err.city=L('Выбери город','Choose a city');if(f.placeMode==='nearby'&&!f.coords)r.err.city=L('Укажи примерное расположение','Set approximate location');if(!f.seek.length)r.err.seek=L('Выбери хотя бы одно','Pick at least one');if(!f.gender.length)r.err.gender=L('Выбери, кого показывать','Choose who to show');if(!f.ok)r.err.ok=L('Нужно подтверждение','Please confirm');
 if(Object.keys(r.err).length){refresh();shakeFirstErr();return;}
 run(a,()=>{Object.assign(S.me,{dating:true,datingVisible:f.visible!==false,showAge:f.showAge,seek:f.seek,format:f.format.length?[...f.format]:fmtList(S.me.format),role:[...f.role],city:f.city||null,photo:f.photo||S.me.photo,photos:f.photo?[f.photo,...S.me.photos.filter(x=>x!==f.photo)]:S.me.photos,location:{mode:f.placeMode,coords:f.placeMode==='nearby'?f.coords:null}});social().filters.dating.gender=f.gender;social().filters.dating.placeMode=f.placeMode;social().filters.dating.city=f.placeMode==='city'?f.city:'';social().filters.dating.coords=f.coords;r.dirty=false;back();},{ok:()=>f.visible!==false?L('Знакомства включены. Ты появишься в подборке у других','Dating is on. You’ll appear in others’ Discover'):L('Знакомства включены. Ты смотришь незаметно','Dating is on. You’re browsing hidden')});};

/* D09 — recently viewed (Premium only adds depth) */
SC.D09={title:()=>L('Просмотренные','Recently viewed'),render:(p)=>{const k=p.k||'all';const hist=social().history.filter(h=>PEOPLE[h.p]&&!isBlocked(h.p)&&(k==='all'||(k==='pass'?h.d<0:h.d>0)));
 return `${bar(L('Просмотренные','Recently viewed'),{back:1,sm:1})}<div class="view nodock"><div class="wrap"><p class="lead">${L('Анкеты за последние 7 дней. Пропущенных можно вернуть в подборку.','Profiles from the last 7 days. You can bring back the ones you passed.')}</p>
 ${seg([['all',L('Все','All')],['pass',L('Пропущенные','Passed')],['like',L('Симпатии','Liked')]],k,'d9tab','sm')}
 ${hist.length?`<div class="hist">${hist.map((h,i)=>{const lock=!S.me.premium&&i>0;return `<button class="hcard ${lock?'lock':''}" data-act="${lock?'premD9':h.d<0?'restore':'go'}" data-v="${h.d<0?h.p:'P01'}" data-p='${esc(JSON.stringify({id:h.p}))}'>${bigPhoto(h.p)}<span class="mk ${h.d>0?'l':''}">${h.d>0?I.heartf:I.x}</span><span class="nm">${lock?'••••':esc(pname(h.p))}</span></button>`;}).join('')}</div>`:empty('hist',L('Пусто','Empty'),L('Здесь появятся анкеты, которые ты смотрел(а).','Profiles you’ve viewed will show up here.'))}
 ${!S.me.premium&&hist.length>1?`<div class="paywall"><b>${L('Вся история за неделю','The whole week of history')}</b><p>${L('Бесплатно видна последняя анкета. Premium хранит 7 дней просмотров.','The last profile is free. Premium keeps 7 days of views.')}</p><button class="btn" data-act="premD9">${L('Открыть всю неделю','Unlock the whole week')}</button></div>`:''}</div></div>`;}};
ACT.d9tab=a=>setP('k',a.dataset.v);
ACT.premD9=()=>premiumSheet('history');
ACT.restore=a=>{const id=a.dataset.v;run(a,()=>{delete social().decided[id];S.deckOrder=[id,...S.deckOrder.filter(x=>x!==id)];},{ok:L(`${pname(id)} снова в подборке`,`${pname(id)} is back in Discover`)});};

ACT.dfCity=()=>{const keep=S.ui.df;openCityPicker(keep.city,id=>{keep.city=id;S.ui.df=keep;dfSheet();});};
ACT.dfAnyCity=()=>{dfr().city='';dfRe();};
ACT.dfPlaceMode=a=>{dfr().placeMode=a.dataset.v;dfr().coords=dfr().coords||S.me.location?.coords||null;dfRe();};
ACT.dfGeo=()=>{const keep=S.ui.df;requestCoarseLocation(coords=>{keep.coords=coords;keep.city=nearestKnownCity(coords);S.ui.df=keep;if(S.ui.sheet)resheet();else dfSheet();});};
ACT.d2City=()=>openCityPicker(cur().f.city,id=>{cur().f.city=id;if(cur().err)delete cur().err.city;cur().dirty=true;refresh();});
ACT.d2PlaceMode=a=>{cur().f.placeMode=a.dataset.v;cur().dirty=true;refresh();};
ACT.d2Geo=()=>requestCoarseLocation(coords=>{cur().f.coords=coords;cur().f.city=nearestKnownCity(coords);if(cur().err)delete cur().err.city;cur().dirty=true;refresh();});
ACT.d2Photo=()=>{const r=cur();openUploader({max:1,have:0,accept:'image',aspect:'4:5',title:L('Фото для подборки','Photo for Discover'),done:items=>{r.f.photo=items[0].url;if(r.err)delete r.err.photo;r.dirty=true;refresh();}});};


for(const key of ['enableDating','datingPeek','goVisible']){const original=ACT[key];ACT[key]=(...args)=>{if(actionAuthor()==='couple'){go('P02',{owner:'couple'});return;}return original(...args);};}

