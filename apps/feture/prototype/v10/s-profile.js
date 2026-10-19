/* ============ P: PROFILES, PRIVATE LAYER & ACCESS, SAFETY ============ */
/** my own preview: would a stranger see a «Like» button? — it follows my dating / profile-likes settings */
const acceptsLikes=id=>{const m=id==='couple'?coupleProfile():(S.ui.profilePreview||S.me);return !!(m&&(m.dating||m.socialLikes));};
function profileView(id,r,o={}){
 const me=id==='me'||id==='couple',self=me&&!o.asOther;const owner=id==='couple'?'couple':'me';if(me&&r.p.preview)S.ui[id==='couple'?'couplePreview':'profilePreview']=r.p.preview;const p=person(id);const ix=(S.ui.ph||{})[id]||0;const t=r.p.t||'about';
 const displayName=me?(p.name||p.nick||L('Ты','You')):pname(id);const posts=(me?S.myPosts.filter(x=>x.status==='published'&&!x.hiddenByPair&&x.author===id):allPosts().filter(x=>x.author===id)).sort((a,b)=>b.t-a.t);
 const act=!me&&activePair()?likeActor(id):{a:'me'};const lk=withActor(act.a,()=>({mutual:!me&&isMatch(id),liked:!me&&social().likesOut.some(l=>l.p===id)}));const mutual=lk.mutual,liked=lk.liked,canLike=!self&&canLikeFrom(act.a,id);
 const sh=me?null:shared(id);const inert=h=>o.asOther?h.replace(/ data-(act|go|p|v|id)=("[^"]*"|'[^']*')/g,'').replace(/<button /g,'<button data-act="demoNote" ').replace(/ btn soft off"/g,' btn soft"'):h;
 const keys=[...fmtList(p.format).slice(0,2).map(x=>opt('format',x)),...fmtList(p.role).filter(v=>v!=='none').slice(0,2).map(v=>opt('role',v)),...(p.dating?(p.seek||[]).slice(0,2).map(s=>opt('seek',s)):[])].filter(Boolean);
 const isPartner=activePair()&&id===S.pair.with;
 const likeBtn=isPartner?'':mutual?`<button class="btn primary" data-act="openChat" data-v="${id}" data-actor="${act.a}">${I.chat}${L('Написать','Message')}</button>`:liked?`<button class="btn on" data-act="unlikeP" data-v="${id}" data-actor="${act.a}" aria-pressed="true">${I.heartf}${L('Симпатия','Liked')}</button>`:canLike||o.asOther&&acceptsLikes(id)?`<button class="btn primary" data-act="likeProfile" data-v="${id}">${I.heartf}${L('Нравится','Like')}</button>`:`<button class="btn soft off" title="${L('Не принимает симпатии','Not accepting likes')}">${I.heart}${L('Симпатии выкл.','Likes off')}</button>`;
 const pending=social().reqOut.find(x=>x.p===id&&x.status==='pending');
 const acts=self?`<div class="row g8" style="margin-top:16px"><button class="btn primary" data-go="P02" data-p='${esc(JSON.stringify({owner}))}'>${I.edit}${L('Редактировать','Edit profile')}</button><button class="btn soft" data-act="shareProfile">${I.share}${L('Поделиться','Share')}</button></div>`
  :inert(`<div class="p-acts">${likeBtn}<button class="btn soft" data-act="follow" data-v="${id}" aria-pressed="${social('me').follows.has(id)}">${social('me').follows.has(id)?`${I.check}${L('Подписка','Following')}`:L('Подписаться','Follow')}</button></div>${!o.asOther&&!isPartner&&!mutual&&!liked&&canLike?profileActorLine(id,act):''}`);
 const orgEvents=allEventIds().filter(e=>EV(e).organizer===id&&!isPast(e)&&!EV(e).cancelled&&EV(e).status!=='review');
 const modOf=Object.keys(COMMUNITIES).filter(c=>COMMUNITIES[c].mods.includes(id));
 const kv=identityFields().filter(([k])=>!['pron','gender','orient'].includes(k)&&!(p.pair&&k==='status')).map(([k,title])=>[title,IDENTITY_MULTI.includes(k)?fmtList(p[k]).map(v=>opt(k,v)).join(', '):opt(k,p[k])]).filter(x=>x[1]);
 /* V8: one page — profile, then the private part right after it when access is open. No tabs. */
 const bio=T(p.bio)?grp(p.pair?L('О нас','About us'):L('О себе','About'),md(T(p.bio),'bio')):'';
 const pj=pubJars(id);const actItems=activityShown(id,o)?activityOf(id):[];
 const body=`${bio}
  ${pj.length?grp(L('Интересы','Interests'),jarShelf(pj,{pre:1,act:'topic',who:id,moreAct:self?(id==='couple'?'coupleJars':'myJarsAll'):'allJars'})):''}
  ${self?myPrivSection(owner):me?(privSection(id,o)||(o.asOther&&!hasPrivatePart(id)?`<div class="owner-only">${myPrivSection(owner)}</div>`:'')):`<div data-private-context="${id}">${privSection(id)}</div>`}
  ${activityBlock(id,[['posts',L('Публикации','Posts'),posts.length,()=>`<div class="posts">${inert(posts.slice(0,3).map((x,i)=>postCard(x,{i})).join(''))}</div>`],['events',L('События','Events'),orgEvents.length,()=>orgEvents.map(e=>eventCard(e,{row:1,neutral:o.asOther})).join('<div style="height:8px"></div>')],...(actItems.length?[['activity',L('Активность','Activity'),actItems.length,()=>activityList(id,actItems,{self:self})]]:[]),['comm',L('Сообщества','Communities'),modOf.length,()=>modOf.map((c,i)=>commCard(c,{i})).join('')]])}`;
 const html=`<header class="bar overlay"><button class="ibtn glass" data-back aria-label="${L('Назад','Back')}">${I.back}</button><span style="flex:1"></span>${self?'':o.asOther?`<button class="ibtn glass" data-act="p3Menu" aria-label="${L('Ещё','More')}">${I.more}</button>`:inert(`<button class="ibtn glass" data-act="profileMenu" data-v="${id}" aria-label="${L('Ещё','More')}">${I.more}</button>`)}</header>
 <div class="view nodock top0 profile-page"><div class="wrap">
 ${o.banner||''}
 <div class="hero">${p.pair&&!hasHeroMedia(id)?`<div class="plate" style="${PL[p.plate]||PL.rose};position:absolute;inset:0"></div><div class="hero-pairav">${av(id,'xl')}</div>`:me&&!hasHeroMedia(id)?`<div class="plate" style="${PL.rose};position:absolute;inset:0"><span class="pi">${I.me}</span></div>`:photoBg(id,ix)+bigPhoto(id,ix)}${photoBars(id,ix)}${photoCount(id)>1?`<button class="pc-zone l" data-act="pPhoto" data-v="-1" aria-label="${L('Предыдущее фото','Previous photo')}"></button><button class="pc-zone r" data-act="pPhoto" data-v="1" aria-label="${L('Следующее фото','Next photo')}"></button>`:''}${hasHeroMedia(id)?`<button class="pc-zone c" data-act="pView" aria-label="${L('Открыть фото на весь экран','Open photo full screen')}"></button>`:''}
  <div class="pc-info"><h2 class="pc-name"><span class="pcn">${esc(displayName)}</span>${p.age?`<span>${p.age}</span>`:''}${nameBadges(p)}</h2><div class="pc-who">${[whoLine(id),placeLine(id)].filter(Boolean).map(x=>`<span>${esc(x)}</span>`).join('')}${!self&&p.online?`<span class="on">${L('в сети','online')}</span>`:''}</div>${followCounts(id)}${keys.length?`<div class="pc-keys">${keys.map(k=>`<span>${esc(k)}</span>`).join('')}</div>`:''}</div></div>
 ${acts}${pairLine(id,o)}${o.before||''}${o.after||''}
 ${!me?`<div class="mt12">${compatBlock(id)}</div>`:o.asOther?`<button class="why mt12" data-act="demoNote">${venn('?',{mini:1})}<span class="grow"><b>${L('Общие интересы — у каждого свои','Shared interests differ per person')}</b><span>${L('Человек увидит своё совпадение с тобой','Each person sees their own overlap with you')}</span></span></button>`:''}
 ${body}${o.footer||''}</div></div>`;if(me)delete S.ui[id==='couple'?'couplePreview':'profilePreview'];return html;
}
SC.P01={title:p=>pname(p.id),valid:p=>!!PEOPLE[p.id]&&!isBlocked(p.id),render:(p,r)=>profileView(p.id,r),after:()=>fillJars()};
SC.P03={title:()=>L('Как видят мой профиль','My profile as others see it'),render:(p,r)=>{const lv=p.lv==='granted'?'granted':'all';S.ui.viewGrant=lv==='granted';try{

 return profileView(p.owner==='couple'?'couple':'me',r,{asOther:true,grant:lv,banner:''});}finally{S.ui.viewGrant=false;}},after:()=>fillJars()};
/* «as others see me» menu: the preview's own actions (it is your profile, so editing is one tap away) */
ACT.p3Menu=()=>{const r=cur(),owner=r.p.owner==='couple'?'couple':'me',lv=r.p.lv==='granted'?'granted':'all';sheet(()=>({title:L('Мой профиль','My profile'),body:`<div class="card list">${linkRow({act:'p3Go',v:'P02',icon:'edit',title:L('Редактировать профиль','Edit profile'),noChev:1})}${owner==='me'?linkRow({act:'shareProfile',icon:'link',title:L('Скопировать ссылку на профиль','Copy profile link'),noChev:1}):''}</div>`}));};
ACT.p3Go=a=>{const r=cur(),owner=r.p.owner==='couple'?'couple':'me';closeSheet(true);go(a.dataset.v,{owner});};
/** the preview has nobody to ask: the request button shows what the person would see once access is granted */
/** every button of the «as others see me» preview just says it is a demo */
ACT.demoNote=()=>toast(L('Это демо-режим: в превью кнопки не работают','This is demo mode: buttons don’t work in the preview'),{type:'ok'});
ACT.p3Demo=()=>{const r=cur();r.p={...r.p,lv:'granted'};refresh();toast(L('Демо-режим: так человек увидит приватную часть, когда ты откроешь доступ','Demo mode: this is what a person sees once you give access'),{type:'ok'});};

ACT.pPhoto=a=>{const id=cur().p.owner==='couple'||cur().id==='Q03'?'couple':cur().id==='P03'?'me':cur().p.id;const preview=cur().p.preview;if(preview)S.ui[id==='couple'?'couplePreview':'profilePreview']=preview;if(!stepPhoto(id,+a.dataset.v)){if(preview)delete S.ui[id==='couple'?'couplePreview':'profilePreview'];const h=$('.hero');h?.classList.remove('nudge-l','nudge-r');void h?.offsetWidth;h?.classList.add(+a.dataset.v<0?'nudge-l':'nudge-r');return;}const h=$('.hero');const ix=S.ui.ph[id];const img=$('.hero>img:not(.mbg),.hero>.vframe,.hero>.plate');if(img){const t=document.createElement('div');t.innerHTML=bigPhoto(id,ix);img.replaceWith(t.firstElementChild);}const bg=$('.hero>.mbg');if(bg){const t=document.createElement('div');t.innerHTML=photoBg(id,ix);if(t.firstElementChild)bg.replaceWith(t.firstElementChild);}$$('.hero .pc-bars i').forEach((b,i)=>b.classList.toggle('on',i===ix));if(preview)delete S.ui[id==='couple'?'couplePreview':'profilePreview'];};
ACT.pView=()=>{const id=cur().p.owner==='couple'||cur().id==='Q03'?'couple':cur().id==='P03'?'me':cur().p.id;const preview=cur().p.preview;openViewer(preview?(preview.photos||[]).map(ph=>isVideoItem(ph)?{type:'video',src:vsrc(ph),dur:ph.dur}:{type:'image',src:IMG(ph)}):photoItems(id),(S.ui.ph||{})[id]||0);};
ACT.toMap=()=>openMe('X01');
ACT.shareProfile=()=>toast(L('Ссылка на профиль скопирована. Без входа она ничего не покажет','Profile link copied. It shows nothing without signing in'),{type:'ok'});
ACT.follow=a=>{const id=a.dataset.v;if(!canAct('follow','me')||isBlocked(id)||id==='me')return;const on=!social('me').follows.has(id);on?social('me').follows.add(id):social('me').follows.delete(id);
 if(a.classList.contains('btn')&&a.closest('.pc-foot')){a.textContent=on?L('Ты подписан(а)','Following'):L('Подписаться','Follow');}else refresh();
 toast(on?L(`Подписка на ${pname(id)}: посты появятся в «Подписках». Чат это не открывает`,`Following ${pname(id)}: posts appear in Following. This doesn’t open a chat`):L('Ты отписался(ась)','Unfollowed'),{type:on?'ok':''});};
/* R04 — like from a social profile without enrolling in discovery */
ACT.likeProfile=a=>{const id=a.dataset.v,act=likeActor(id),prof=authorProfile(act.a);
 if(!canLikeFrom(act.a,id))return;
 if(act.a==='me'&&PEOPLE[id]?.pair&&!S.me.dating){toast(L('Пары принимают симпатии через знакомства. Включи знакомства.','Couples take likes through Discover. Turn on dating.'),{type:'warn',action:{label:L('Знакомства','Dating'),fn:()=>go('D02')}});return;}
 if(!prof?.dating&&!prof?.socialLikes){toast(L('Симпатии выключены. Включи их в настройках приватности.','Likes are off. Enable them in privacy settings.'),{type:'warn',action:{label:L('Настройки','Settings'),fn:()=>go('K01')}});return;}const ticket=authorTicket(act.a);const doLike=()=>run(a,()=>{if(!validAuthor(ticket))return;const n=()=>withActor(act.a,()=>social().likesOut.length+social().matches.length);const before=n();withActor(act.a,()=>likePerson(id,'profile'));if(n()===before)toast(L('Сейчас это недоступно','Not available right now'),{type:'warn'});refresh();},{ms:300});
 if(prof?.dating||S.ui.r04seen)return doLike();
 sheet(()=>({title:L('Симпатия из профиля','Like from a profile'),lead:`<span class="ico l">${I.heart}</span>`,body:`<div class="fact"><i class="g">${I.check}</i><span>${L(`Если ${esc(pname(id))} ответит взаимностью, откроется личный чат.`,`If ${esc(pname(id))} likes you back, a private chat opens.`)}</span></div><div class="fact"><i class="g">${I.check}</i><span>${L('Твой профиль не появится в подборке знакомств — они у тебя выключены.','Your profile won’t appear in Discover — your dating is off.')}</span></div><div class="fact"><i class="v">${I.info}</i><span>${L('Симпатию можно отменить, человек об этом не узнает.','You can withdraw the like; they won’t be told.')}</span></div>`,foot:`<button class="btn primary" data-act="r04ok" data-v="${id}">${I.heartf}${L('Отправить симпатию','Send like')}</button>`}));};
ACT.r04ok=a=>{S.ui.r04seen=1;closeSheet(true);run(null,()=>{withActor('me',()=>likePerson(a.dataset.v,'profile'));refresh();},{ms:300});};
ACT.unlikeP=a=>withActor(a.dataset.actor||'me',()=>ACT.unlike(a));

/* profile menu: share / report / block */
ACT.profileMenu=a=>{const id=a.dataset.v;sheet(()=>({title:esc(pname(id)),body:`<div class="card list">${linkRow({act:'shareProfile',icon:'link',title:L('Скопировать ссылку','Copy link'),noChev:1})}${social().likesOut.some(l=>l.p===id)?linkRow({act:'unlike',v:id,icon:'heart',title:L('Отменить симпатию','Withdraw like'),noChev:1}):''}${PEOPLE[id]&&!PEOPLE[id].pair?linkRow({act:'giftPremium',v:id,icon:'crown',tone:'l',title:L('Подарить Premium','Gift Premium'),noChev:1}):''}${linkRow({act:'report',v:'person',icon:'flag',cls:'danger',title:L('Пожаловаться','Report'),noChev:1})}${linkRow({act:'block',v:id,icon:'block',cls:'danger',title:L('Заблокировать','Block'),sub:L('Прекратит контакт и все доступы','Ends contact and all access'),noChev:1})}</div>`}));};
/* S02 — report */
ACT.report=a=>{const kind=a.dataset.v||'person';S.ui.rp={why:'',block:kind==='person',who:a.dataset.who||null};closeSheet(true);
 sheet(()=>{const o=S.ui.rp;return{title:L('Пожаловаться','Report'),body:`${[['threat',L('Угрозы или шантаж','Threats or blackmail')],['private',L('Чужие приватные материалы','Someone else’s private content')],['minor',L('Похоже на несовершеннолетнего','Looks underage')],['spam',L('Спам или мошенничество','Spam or scam')],['other',L('Другое','Something else')]].map(([k,l])=>`<button class="radio ${o.why===k?'on':''}" data-act="rpWhy" data-v="${k}"><i></i><span class="tx">${l}</span></button>`).join('')}
 <label class="field mt16"><span>${L('Подробности','Details')}<i>${L('необязательно','optional')}</i></span><textarea class="inp" id="rpText" rows="3" maxlength="500"></textarea></label>${kind==='person'||S.ui.rp.who?`<div class="card list">${toggleRow('rpBlock',L('Также заблокировать','Also block'),L('Сразу прекратить контакт','End contact right away'),o.block)}</div>`:''}`,
 foot:`<button class="btn danger" data-act="rpSend" data-v="${kind}">${L('Отправить жалобу','Send report')}</button>`};});};
ACT.rpWhy=a=>{S.ui.rp.why=a.dataset.v;resheet();};
ACT.rpBlock=()=>{S.ui.rp.block=!S.ui.rp.block;resheet();};
ACT.rpSend=a=>{if(!S.ui.rp.why){toast(L('Выбери причину жалобы','Choose a reason'),{type:'err'});$('#sheet .radio')?.classList.add('shake');return;}
 const id=S.ui.rp.who||cur().p.id;run(a,()=>{closeSheet();if(S.ui.rp.block&&id&&PEOPLE[id])doBlock(id);},{ok:L('Жалоба отправлена. Сообщим о решении в уведомлениях','Report sent. We’ll notify you of the decision')});};
ACT.block=a=>{const id=a.dataset.v;closeSheet(true);ask({icon:'block',tone:'l',title:L(`Заблокировать ${esc(pname(id))}?`,`Block ${esc(pname(id))}?`),text:L('Симпатии, чат и выданные доступы прекратятся сразу. Человек не получит уведомление. Разблокировка не вернёт доступы.','Likes, chat and any access you shared end immediately. They won’t be notified. Unblocking doesn’t restore access.'),ok:L('Заблокировать','Block'),danger:true}).then(ok=>{if(ok)run(null,()=>doBlock(id),{ok:L('Заблокировано','Blocked')});});};
function doBlock(id){social().reqOut=social().reqOut.filter(x=>x.p!==id);social().reqIn=social().reqIn.filter(x=>x.p!==id);S.notifs=S.notifs.filter(x=>x.p!==id);social().likesIn=social().likesIn.filter(x=>x.p!==id);S.blocked.unshift({p:id,t:Date.now()});social().matches=social().matches.filter(m=>m.p!==id);social().likesOut=social().likesOut.filter(l=>l.p!==id);social().sharedByMe=social().sharedByMe.filter(x=>x.p!==id);social('me').follows.delete(id);S.graph[id]?.delete('me');delete S.threads[id];if(S.pair?.social){const d=social('couple');d.follows.delete(id);for(const k of ['reqOut','reqIn','sharedByMe','likesIn','likesOut','matches'])d[k]=d[k].filter(x=>x.p!==id);delete d.threads[id];}
 const st=stack();while(st.length>1&&st[st.length-1].p&&st[st.length-1].p.id===id)st.pop();render('back');}

/* P05 — shared interests: categories, no universal score */
SC.P05={title:()=>L('Что у вас общего','Shared interests'),valid:p=>!!PEOPLE[p.id]&&!isBlocked(p.id),render:(p)=>{const id=p.id;const s=shared(id);const g=receivedGrant(id);
 return `${bar(L('Что у вас общего','Shared interests'),{back:1,sm:1})}<div class="view nodock"><div class="wrap">
 ${venn(s.few?'?':s.match.length,{pre:1})}<p class="center note" style="margin-top:6px">${L('Ты и','You and')} ${esc(pname(id))}</p>
 <div class="card mt16">
  <div class="cat"><span class="ico g">${I.check}</span><div class="tx"><b>${L('Совпадает','In common')}</b>${s.match.length?`<div class="chips">${s.match.map(m=>`<span class="chip hit">${esc(topic(m))}</span>`).join('')}</div>`:``}</div></div>
  <div class="cat"><span class="ico v">${I.couple}</span><div class="tx"><b>${L('Дополняется','Complements')}</b>${s.complement.length?s.complement.map(c=>`<p class="note" style="color:var(--ink);margin-top:4px">${esc(c)}</p>`).join(''):``}</div></div>
  <div class="cat"><span class="ico a">${I.warn}</span><div class="tx"><b>${L('Стоит обсудить','Worth discussing')}</b>${s.discuss.length?s.discuss.map(c=>`<p class="note" style="color:var(--ink);margin-top:4px">${esc(c)}</p>`).join(''):``}</div></div>
  ${s.few?`<div class="cat"><span class="ico">${I.info}</span><div class="tx"><b>${L('Мало данных','Not enough data')}</b></div></div>`:''}
 </div>
 <div class="alert mt12">${I.lock}<span>${L('Сравниваем только то, что вы оба открыли: публичные интересы, формат и роль.','We compare only what you both made visible: public interests, format and role.')} ${g?L('Приватная часть доступна отдельно и не участвует в публичном объяснении.','The private part is available separately and excluded from the public explanation.'):L('Скрытые интересы и границы не участвуют и не раскрываются.','Hidden interests and limits are never used or revealed.')}</span></div>
 ${S.me.jars.filter(j=>j.vis==='public').length<3?`<button class="btn soft mt12" data-act="toMap">${L('Открыть больше своих интересов','Make more of your interests public')}</button>`:''}
 </div></div>`;},after:()=>playVenn()};

/* P06 — request private access: categories, quota, no message, no chat */
ACT.reqAccess=a=>{const id=a.dataset.v||cur().p.id;if(!needAge(()=>ACT.reqAccess({dataset:{v:id}})))return;
 const pend=social(accessActor()).reqOut.find(x=>x.p===id&&x.status==='pending');
 if(pend){sheet(()=>({title:L('Запрос уже отправлен','Request already sent'),lead:`<span class="ico a">${I.clock}</span>`,body:`<p class="lead">${L(`${esc(pname(id))} ещё не ответил(а). Ответ придёт в уведомления.`,`${esc(pname(id))} hasn’t answered yet. You’ll be notified.`)}</p><div class="card list">${linkRow({icon:'lock',title:SCOPE_TXT(pend.scopes),sub:L('Отправлен','Sent')+' '+F.rel(pend.t),noChev:1})}</div>`,foot:`<button class="btn soft" data-act="cancelReq" data-v="${pend.id}">${L('Отменить запрос','Cancel request')}</button><button class="btn text" data-act="toAccess" data-v="out">${L('Все мои запросы','All my requests')}</button>`}));return;}
 const dec=social(accessActor()).reqOut.find(x=>x.p===id&&x.status==='declined'&&Date.now()-x.t<7*DAY);
 if(dec){toast(L('Повторный запрос этому человеку можно отправить через 7 дней после отказа','You can ask this person again 7 days after a decline'),{type:'warn'});return;}
 if(C.quotaLeft()<=0){limitSheet();return;}
 const avail=privScopesOf(id),scopes=REQ_SCOPES.filter(([k])=>allowedScopes(accessActor(),id).includes(k)&&avail.includes(k));S.ui.rq={id,actor:accessActor(),ticket:authorTicket(accessActor()),sel:[scopes.length&&!scopes.some(x=>x[0]==='info')?scopes[0][0]:'info']};
 sheet(()=>{const o=S.ui.rq;const left=C.quotaLeft(),max=S.quota.max;return{title:L('Запросить приватную часть','Request private part'),body:`<p class="note" data-couple-request ${accessActor()==='couple'?'':'hidden'}>${L(`Доступ для ${esc(pname('couple'))}.`,`Access for ${esc(pname('couple'))}.`)}</p>
 ${chipGroup(scopes.map(([k,l])=>[k,T(l)]),o.sel,'rqPick')}
 <div class="sec">${L('Осталось запросов сегодня','Requests left today')}<b style="color:var(--ink)">${left} ${L('из','of')} ${max}</b></div><div class="quota">${Array.from({length:Math.min(max,15)},(_,i)=>`<i class="${i<left?'':'off'}"></i>`).join('')}</div>
 <div class="alert mt16">${I.info}<span>${L('Запрос не отправляет сообщение и не открывает чат. Можно открыть меньше или отказать без объяснения.','A request sends no message and doesn’t open a chat. They can share less or decline without explanation.')}</span></div>`,
 foot:`<button class="btn primary ${o.sel.length?'':'off'}" data-act="rqSend">${L('Отправить запрос','Send request')}</button>`};});};
ACT.rqPick=a=>{const o=S.ui.rq;if(!o||!validAuthor(o.ticket)||!allowedScopes(o.actor,o.id).includes(a.dataset.v))return;const s=o.sel;const i=s.indexOf(a.dataset.v);i<0?s.push(a.dataset.v):s.splice(i,1);resheet();};
ACT.rqSend=a=>{const o=S.ui.rq;if(!o?.sel.length)return;const ticket=o.ticket||authorTicket(o.actor||'me'),reason=requestReason(o.id,ticket.id);if(!validAuthor(ticket))return;if(reason){toast(reason,{type:'warn'});return;}const scopes=cleanScopes(o.sel).filter(s=>allowedScopes(ticket.id,o.id).includes(s));if(!scopes.length)return;let sent=false;
 return run(a,()=>{if(!validAuthor(ticket)||requestReason(o.id,ticket.id)||S.ui.rq!==o)return;social(ticket.id).reqOut.unshift({id:'o'+Date.now(),p:o.id,actor:ticket.id,pairId:ticket.id==='couple'?S.pair.id:null,viewers:realMembers(ticket.id),scopes,t:Date.now(),status:'pending'});autoResolve();S.quota.used++;sent=true;closeSheet();refresh();},{ok:()=>sent?L('Запрос отправлен','Request sent'):null});};
/* B02 — the single paywall moment: quota of new outgoing requests */
function limitSheet(){sheet(()=>({title:L('Запросы на сегодня закончились','No requests left today'),lead:`<span class="ico a">${I.timer}</span>`,body:``,foot:`<button class="btn primary" data-act="closeSheet">${L('Понятно','Got it')}</button>`}));}
ACT.cancelReq=a=>{const x=social().reqOut.find(y=>y.id===a.dataset.v);run(a,()=>{x.status='cancelled';closeSheet();refresh();},{ok:L('Запрос отменён. Попытка не возвращается','Request cancelled. The attempt isn’t refunded')});};
ACT.toAccess=a=>{closeSheet(true);go('P07',{tab:a.dataset.v||'byme'});};

/* P07 — access center: received / sent / shared with me / shared by me */
const SCOPE_TXT=arr=>cleanScopes(arr).map(s=>T(REQ_SCOPES.find(x=>x[0]===s)[1])).join(', ');
const REQ_STATUS=()=>({pending:['wait',L('ждёт ответа','pending')],partial:['ok',L('открыт частично','partly shared')],granted:['ok',L('открыт','shared')],declined:['',L('без ответа','no answer')],expired:['',L('истёк','expired')],cancelled:['',L('отменён','cancelled')]});
/** access requests and grants: one body used by P07 and directly by People → Requests (no list page in between) */
/** one incoming access request as a decision card (used by the inbox): Open reviews four independent permissions before sharing */
function reqCardHTML(r,a='me'){return `<div class="card rqcard" style="margin-bottom:10px"><div class="row">${av(r.p,'')}<button class="grow" style="text-align:left" data-go="P01" data-id="${r.p}"><b style="font-size:16px">${esc(pname(r.p))}${person(r.p).age?', '+person(r.p).age:''}${nameBadges(person(r.p))}</b><div class="note">${F.rel(r.t)} · ${esc(sharedSummary(r.p))}${a==='couple'?` · ${L('для','for')} ${esc(pname('couple'))}`:''}</div></button></div><div class="chips mt12">${cleanScopes(r.scopes).map(s=>`<span class="pill">${esc(T(REQ_SCOPES.find(x=>x[0]===s)[1]))}</span>`).join('')}</div>
  <div class="row g8 mt12"><button class="btn md primary" data-act="grant" data-v="${r.id}" data-actor="${a}">${L('Открыть','Share')}</button><button class="btn md soft" data-act="decline" data-v="${r.id}" data-actor="${a}">${L('Отказать','Decline')}</button></div></div>`;}
function accessBody(p){const t=['out','withme','byme'].includes(p.tab)?p.tab:'byme';
 const out=social().reqOut.filter(r=>!isBlocked(r.p)).map(r=>({...r,status:effectiveRequestStatus(r)})),withMe=social().reqOut.filter(r=>receivedGrant(r.p)===r),byMe=givenGrantEntries();
 const tabs=seg([['byme',L('Выдано','Granted'),byMe.length],['withme',L('Получено','Received'),withMe.length],['out',L('Жду ответа','Waiting'),out.filter(r=>r.status==='pending').length]],t,'p7tab','sm');const sections={};
 let body='';
 {const only=p.f==='pending';const list=out.filter(r=>!only||r.status==='pending');body=`<div class="row" style="justify-content:space-between;margin-bottom:10px"><span class="note">${L('Сегодня осталось','Left today')} <b>${C.quotaLeft()} ${L('из','of')} ${S.quota.max}</b></span><button class="chip filter ${only?'on':''}" data-act="p7f">${L('Ждут ответа','Pending')}</button></div>
  ${list.length?`<div class="card list">${list.map(r=>{const [c,l]=REQ_STATUS()[r.status];return `<div class="rqrow"><button class="top" style="width:100%;text-align:left" data-go="P01" data-id="${r.p}">${av(r.p,'')}<span class="grow"><b>${esc(pname(r.p))} <span class="pill ${c}">${l}</span></b><small>${L('Просил(а)','Asked for')}: ${esc(SCOPE_TXT(r.scopes))} · ${F.rel(r.t)}</small>${r.status==='partial'?`<small>${L('Открыто','Shared')}: ${esc(SCOPE_TXT(r.granted))} · ${F.left(r.until)}</small>`:''}</span></button>${r.status==='pending'?`<div class="acts3"><button class="btn text auto" data-act="cancelReq" data-v="${r.id}">${L('Отменить запрос','Cancel request')}</button></div>`:['partial','granted'].includes(r.status)?`<div class="acts3"><button class="btn text auto" data-go="P08" data-p='${esc(JSON.stringify({id:r.p,actor:actionAuthor()}))}'>${L('Смотреть открытое','View shared')}</button></div>`:''}</div>`;}).join('')}</div>`:empty('send',only?L('Ничего не ждёт ответа','Nothing pending'):L('Ты ещё ничего не запрашивал(а)','You haven’t asked for anything yet'),L('Запросить доступ можно в профиле человека или в подборке.','You can request access on a profile or in Discover.'))}
  `;sections.out=body;}
 {body=withMe.length?`<div class="card list">${withMe.map(r=>linkRow({go:'P08',p:{id:r.p,actor:actionAuthor()},av:av(r.p,''),title:esc(pname(r.p)),sub:`${SCOPE_TXT(r.granted)} · ${F.left(r.until)}`})).join('')}</div>`:empty('unlock',L('Пока никто не открыл','Nothing shared with you yet'),L('Здесь появятся приватные части, которые тебе открыли.','Private parts shared with you appear here.'));;sections.withme=body;}
 {body=byMe.length?byMe.map(x=>`<div class="card" style="margin-bottom:10px"><div class="row">${whoLink(x.p,'')}<div class="grow"><button class="plink pnm" ${profGo(x.p)}>${esc(pname(x.p))}</button><div class="note">${esc(SCOPE_TXT(x.scopes))}</div></div><span class="pill">${x.until?F.left(x.until):L('без срока','no limit')}</span></div><div class="row g8 mt12"><button class="btn md soft" data-act="narrow" data-v="${x.p}">${L('Изменить','Change')}</button><button class="btn md danger" data-act="revoke" data-v="${x.p}">${L('Отозвать','Revoke')}</button></div></div>`).join(''):empty('lock',L('Ты никому не открывал(а) доступ','You haven’t shared with anyone'),L('Открыть можно, ответив на запрос.','You can share by answering a request.'));;sections.byme=body;}
 const couple=actionAuthor()==='couple',pol=authorProfile()?.requestsFrom||'all';
 return `${tabs}${sections[t]}`;}
SC.P07={title:()=>L('Доступы','Access'),render:(p)=>`${bar(L('Доступы','Access'),{back:1,sm:1,actions:authorPicker(p.owner==='couple'?'couple':null)})}<div class="view nodock"><div class="wrap">${accessBody(p)}</div></div>`,after:()=>{$('#main .tabs .on')?.scrollIntoView({block:'nearest',inline:'nearest'});}};

ACT.revokeAll=()=>{const couple=cur().p.owner==='couple';ask({icon:'lock',tone:'l',title:L('Отозвать все доступы?','Revoke all access?'),text:L('Все, кому открыта приватная часть, потеряют доступ сразу. Новые запросы можно отключить отдельно.','Everyone with access loses it at once. You can turn off new requests separately.'),ok:L('Отозвать все','Revoke all'),danger:true}).then(ok=>{if(!ok)return;if(couple){pairSafety('sharing');return;}S.sharedByMe=[];S.reqIn.forEach(q=>{if(['open','partial','granted'].includes(q.status))q.status='no';});refresh();toast(L('Все доступы отозваны','All access revoked'),{type:'ok'});});};
ACT.reqFromQuick=a=>{if(actionAuthor()==='couple')return;S.me.requestsFrom=a.dataset.v;navNextReplace=true;refresh();toast(L('Сохранено','Saved'),{type:'ok'});};
ACT.p7tab=a=>{const r=cur();r.p.tab=a.dataset.v;r.scroll=0;navNextReplace=true;render('fade');};
ACT.p7f=()=>setP('f',cur().p.f==='pending'?'':'pending');
/* P09 — review an incoming request: choose less, set a term, preview; no chat toggle */
ACT.grant=a=>withActor(a.dataset.actor||actionAuthor(),()=>grantSheet(a));
function grantSheet(a){const r=social().reqIn.find(x=>x.id===a.dataset.v);if(!r||r.status!=='new'||isBlocked(r.p))return;const actor=actionAuthor(),allowed=allowedScopes(actor,r.p);S.ui.gr={id:r.id,ticket:authorTicket(),actor,sel:cleanScopes(r.scopes).filter(k=>allowed.includes(k)),term:'7'};
 sheet(()=>{const o=S.ui.gr;return{title:L('Открыть доступ','Share access'),body:`<div class="grant-options">${REQ_SCOPES.filter(([k])=>allowed.includes(k)).map(([k,label])=>`<button class="grant-option" role="checkbox" aria-checked="${o.sel.includes(k)}" data-act="grPick" data-v="${k}"><span>${esc(T(label))}</span><span class="grant-check" aria-hidden="true">${o.sel.includes(k)?I.check:''}</span></button>`).join('')}</div><div class="card grant-duration">${selectRow('grTerm',L('Срок','Duration'),[['1',L('24 часа','24 hours')],['7',L('7 дней','7 days')],['0',L('Без срока','No limit')]],o.term)}</div>`,foot:`<button class="btn primary ${o.sel.length?'':'off'}" data-act="grOk" ${o.sel.length?'':'disabled'}>${I.unlock}${L('Открыть доступ','Share access')}</button>`};});}
ACT.grPick=a=>{const o=S.ui.gr;if(!o||!validAuthor(o.ticket))return;const r=social(o.actor).reqIn.find(x=>x.id===o.id);if(!r||!allowedScopes(o.actor,r.p).includes(a.dataset.v))return;const s=o.sel,i=s.indexOf(a.dataset.v);i<0?s.push(a.dataset.v):s.splice(i,1);resheet();};
ACT.grTerm=a=>{if(S.ui.gr&&['0','1','7'].includes(a.dataset.v)){S.ui.gr.term=a.dataset.v;resheet();}};
ACT.grOk=a=>{const o=S.ui.gr;if(!o)return;const ticket=o.ticket||authorTicket(o.actor||actionAuthor()),st=social(ticket.id);if(!validAuthor(ticket))return;const r=st.reqIn.find(x=>x.id===o.id);if(!r||r.status!=='new'||!['0','1','7'].includes(o.term))return;const scopes=cleanScopes(o.sel).filter(k=>allowedScopes(ticket.id,r.p).includes(k));if(!scopes.length)return;const until=o.term==='0'?null:Date.now()+(+o.term)*DAY;
 return run(a,()=>{if(!validAuthor(ticket)||S.ui.gr!==o||!st.reqIn.includes(r)||r.status!=='new'||isBlocked(r.p))return;if(ticket.id==='couple'){queueJointGrant(r,{...o,sel:scopes},until);closeSheet();refresh();return;}r.status='open';r.granted=[...scopes];r.until=until;st.sharedByMe=st.sharedByMe.filter(x=>x.p!==r.p);st.sharedByMe.unshift({p:r.p,owner:'me',viewers:[...realMembers(r.p)],scopes:[...scopes],until,t:Date.now()});closeSheet();refresh();},{ok:L(`Открыто ${pname(r.p)}`,`Shared with ${pname(r.p)}`)});};
ACT.decline=a=>withActor(a.dataset.actor||actionAuthor(),()=>declineReq(a));
function declineReq(a){const r=social().reqIn.find(x=>x.id===a.dataset.v);run(a,()=>{r.status='no';refresh();},{ok:L('Отказано. Человек увидит «без ответа»','Declined. They’ll see “no answer”'),undo:()=>{r.status='new';refresh();}});}
/* P11 — revoke */
ACT.revoke=a=>{const ticket=authorTicket(actionAuthor()),st=social(ticket.id),id=a.dataset.v;ask({icon:'lock',tone:'l',title:L(`Отозвать доступ у ${esc(pname(id))}?`,`Revoke access for ${esc(pname(id))}?`),text:L('Новые просмотры прекратятся сразу. То, что человек уже видел или сохранил вне FetUre, отозвать нельзя. Чат и симпатия не меняются.','New views stop immediately. What they already saw or saved outside FetUre can’t be recalled. Chat and likes stay as they are.'),ok:L('Отозвать','Revoke'),danger:true}).then(ok=>{if(!ok||!validAuthor(ticket))return;run(null,()=>{if(!validAuthor(ticket))return;st.sharedByMe=st.sharedByMe.filter(x=>x.p!==id);const r=st.reqIn.find(x=>x.p===id&&x.status==='open');if(r)r.status='no';refresh();},{ok:L('Доступ отозван','Access revoked')});});};
ACT.narrow=a=>{const x=givenGrant(a.dataset.v);if(!x){toast(L('Доступ уже завершён','Access has ended'),{type:'warn'});refresh();return;}S.ui.nw={p:x.p,sel:[...x.scopes]};sheet(()=>({title:L('Изменить доступ','Change access'),body:`${chipGroup(cleanScopes(x.scopes).map(s=>[s,T(REQ_SCOPES.find(y=>y[0]===s)[1])]),S.ui.nw.sel,'nwPick')}`,foot:`<button class="btn primary" data-act="nwOk">${L('Сохранить','Save')}</button>`}));};
ACT.nwPick=a=>{const s=S.ui.nw.sel;const i=s.indexOf(a.dataset.v);i<0?s.push(a.dataset.v):s.splice(i,1);resheet();};
ACT.nwOk=a=>{const ticket=authorTicket(actionAuthor()),st=social(ticket.id),o=S.ui.nw,x=givenGrant(o.p);if(!x){closeSheet(true);toast(L('Доступ уже завершён','Access has ended'),{type:'warn'});refresh();return;}if(!o.sel.length){closeSheet(true);ACT.revoke({dataset:{v:o.p}});return;}run(a,()=>{if(!validAuthor(ticket)||!st.sharedByMe.includes(x))return;x.scopes=x.scopes.filter(k=>o.sel.includes(k));st.reqIn.filter(y=>y.p===o.p&&y.status==='open'&&grantTimeActive(y.until)).forEach(y=>y.granted=[...x.scopes]);closeSheet();refresh();},{ok:L('Доступ изменён','Access updated')});};

/* P08 — private part shared with me */
/* P08 — V8: the private part is a continuation of the profile, not a separate screen */
const activeGrant=receivedGrant;
/** What a person with access sees in someone's private layer. One projection for seed people and for me,
 *  so «Как видят» (my preview) and a real granted view render through the same code. */
const SEED_PRIV_JARS=[{t:'shibari',lv:9},{t:'sensory',lv:8},{t:'temperature',lv:6},{t:'roleplay',lv:7},{t:'aftercare',lv:10},{t:'filming',lv:0,limit:'hard'},{t:'strongpain',lv:0,limit:'discuss'},{t:'publicplace',lv:0,limit:'hard'}];
function privProj(id){
 if(id==='me'||id==='couple'){const m=id==='couple'?(S.ui.couplePreview||coupleProfile()):(S.ui.profilePreview||S.me);return{jars:m.jars.filter(j=>j.vis==='granted'),text:T(m.privText)||'',media:privMedia(m).map(m=>({type:m.type==='video'?'video':'image',src:privSrc(m),style:m.style,sec:m.type==='video'?'video':'photos',dur:m.dur,w:m.w,h:m.h,crop:m.crop,trim:m.trim}))};}
 const P0=person(id);const own=P0?.photo?photoItems(id).map(x=>x.src):[];return{jars:P0?.privText?SEED_PRIV_JARS:[],text:T(P0?.privText)||'',media:P0?.privText&&P0?.photo?[...own,...['/images/v10-content/post-p9-evening-atmosphere-45.webp','/images/v10-content/gallery-e3-club.webp','/images/v10-content/post-p6-latex-night-prep-45.webp','/images/v10-content/gallery-e1-ropes.webp']].slice(0,6).map(src=>({type:'image',src,sec:'photos'})):[]};}
/** sections a grant opens: info → description; interests → the interests placed in the private part; photos → photos; video → video */
/* private gallery (owner 15.10): no card, no cut-up crops — the first photo large, the rest as 4:5 tiles; watermark per viewer */
function privGallery(list,o={}){if(!list.length)return '';return `<div class="pgal">${list.map((m,i)=>`<button class="pgc" ${o.act?`data-act="${o.act}" ${o.v!=null?`data-v="${o.v}"`:''} data-i="${i+(o.off||0)}"`:'disabled'} aria-label="${L('Открыть','Open')}">${m.type==='video'?`<video src="${esc(m.src)}" ${m.type==='video'?`style="${vframe(m)}"`:''} muted playsinline preload="metadata"></video><span class="dur">${I.video}${fmtDur(m.dur||0)}</span>`:`<img src="${esc(m.src)}" alt="" draggable="false">`}${o.wm?`<span class="wm">${esc(o.wm)}</span>`:''}</button>`).join('')}</div>`;}
/** the private part is a layer of its own: a visibly separate panel with its own header, state and content */
function vaultHTML(inner,o={}){return `<section class="vault ${o.cls||''}" id="priv"><div class="vault-h"><span class="vi">${o.open?I.unlock:I.lock}</span><div><b>${L('Приватная часть','Private part')}</b></div>${o.badge?`<span class="vst">${o.badge}</span>`:''}</div>${inner?`<div class="vault-b">${inner}</div>`:''}</section>`;}
/** the private part holds exactly three things, each with its own permission: description (info), photos, video.
    Photos and video are separate lists everywhere; index `i` in the viewer runs over photos first, then video. */
const PRIV_MAX={photos:12,video:6};
const privSplit=list=>({photos:list.filter(m=>m.type!=='video'),video:list.filter(m=>m.type==='video')});
const privOrdered=list=>{const s=privSplit(list);return [...s.photos,...s.video];};
function privMediaGroups(media,o={}){const s=privSplit(media);let off=0;const groups=[[s.photos,L('Фото','Photos')],[s.video,L('Видео','Video')]].filter(([l])=>l.length);
 return groups.map(([l,t],gi)=>{const h=grp(`${t} · ${l.length}`,privGallery(l,{act:o.act,v:o.v,wm:o.wm,off}),{cls:'bare',foot:gi===groups.length-1?o.foot:''});off+=l.length;return h;}).join('');}
/** does this person have a private part worth showing to others? (switched on and not empty) */
/** what a person's private part can actually give: only those permissions are offered in a request */
function privScopesOf(id){const pr=privProj(id);return REQ_SCOPES.map(x=>x[0]).filter(k=>k==='info'?!!pr.text:k==='interests'?pr.jars.length>0:k==='photos'?pr.media.some(m=>m.type!=='video'):pr.media.some(m=>m.type==='video'));}
function hasPrivatePart(id){if(id==='me'||id==='couple'){const m=id==='couple'?(S.ui.couplePreview||coupleProfile()):(S.ui.profilePreview||S.me);if(!m||m.privOn===false)return false;const pr=privProj(id);return !!(pr.text||pr.jars.length||pr.media.length);}
 const p=PEOPLE[id];if(!p||p.privOn===false)return false;const pr=privProj(id);return !!(pr.text||pr.jars.length||pr.media.length);}
function privOpenHTML(id,g,o={}){const pr=privProj(id),has=k=>g.granted.includes(k);
 const media=pr.media.filter(m=>has(m.sec));
 const desc=has('info')&&pr.text?grp(L('Описание','Description'),md(pr.text,'bio')):'';
 const pj=sortJars(pr.jars||[]);const interests=has('interests')&&pj.length?grp(L('Интересы','Interests'),jarsHTML(pj,{act:o.preview?'':'topic',who:id})):'';
 const wm=o.preview?L('ник зрителя','viewer’s nick'):(S.me.nick||'');
 const mediaHTML=privMediaGroups(media,{act:o.preview?'privView':'privPeek',v:id,wm,foot:o.preview?L('Каждый видит с собственным водяным знаком.','Everyone sees them with their own watermark.'):L('С твоим водяным знаком. Доступ могут отозвать в любой момент — уважай доверие.','With your watermark. Access can be revoked any time — respect the trust.')});
 return vaultHTML(`${desc}${interests}${mediaHTML}${!desc&&!interests&&!mediaHTML?`<p class="note">${L('Здесь пока ничего нет.','Nothing here yet.')}</p>`:''}`,{open:1,badge:g.until?`<span class="pill v">${esc(F.left(g.until))}</span>`:''});}
function privSection(id,o={}){
 if(id==='me'||id==='couple'){if(!hasPrivatePart(id))return '';const g=o.grant==='granted'?{granted:['info','interests','photos','video'],until:null}:null;
  if(!g)return vaultHTML(veilBlock(id).replace(/ data-act="reqAccess" data-v="[^"]*"/g,' data-act="p3Demo"').replace(/ data-act="cancelReq" data-v="[^"]*"/g,' data-act="p3Demo"'),{cls:'closed'});
  return privOpenHTML(id,g,{preview:1});}
 if(!hasPrivatePart(id))return '';const g=activeGrant(id);if(!g)return vaultHTML(veilBlock(id),{cls:'closed'});
 return privOpenHTML(id,g);}
function myPrivSection(owner='me'){const model=owner==='couple'?(S.ui.couplePreview||coupleProfile()):S.me;
 if(model.privOn===false)return vaultHTML(`<p class="vault-lead">${L('Приватную часть видишь только ты. Включи её, чтобы показывать описание, интересы, фото и видео тем, кому разрешишь.','Only you see the private part. Turn it on to share a description, interests, photos and video with people you allow.')}</p><button class="btn primary" data-act="privEnable" data-v="${owner}">${I.unlock}${L('Включить приватную часть','Turn on the private part')}</button>`,{cls:'off',badge:`<span class="pill">${L('выключена','off')}</span>`});
 const media=privMedia(model).map(m=>({type:m.type==='video'?'video':'image',src:privSrc(m),dur:m.dur,w:m.w,h:m.h,crop:m.crop,trim:m.trim}));const jars=(model.jars||[]).filter(j=>j.vis==='granted');
 const parts=`${T(model.privText)?grp(L('Описание','Description'),md(T(model.privText),'bio')):''}${jars.length?grp(L('Интересы','Interests'),jarsHTML(sortJars(jars),{act:'topic',who:'me'})):''}${privMediaGroups(media,{act:'privView',wm:S.me.nick||''})}`;
 return vaultHTML(parts.trim()?parts:`<p class="vault-lead">${L('Пока пусто. Добавь описание, интересы, фото или видео — их увидят только те, кому ты откроешь доступ.','Nothing here yet. Add a description, interests, photos or video — only people you give access to will see them.')}</p><button class="btn soft" data-go="P04" data-p='${esc(JSON.stringify({owner}))}'>${I.plus}${L('Добавить','Add')}</button>`);}
ACT.privEnable=a=>{const owner=a.dataset.v==='couple'?'couple':'me';if(owner==='couple'&&!coupleWritable())return;const m=editableProfile({p:{owner}});if(!m)return;m.privOn=true;if(owner==='couple')markCoupleDraft();go('P04',{owner});toast(L('Приватная часть включена — добавь, что покажешь','Private part is on — add what you want to share'),{type:'ok'});};
ACT.privPeek=a=>{const id=a.dataset.v,g=activeGrant(id);const media=g?privOrdered(privProj(id).media.filter(m=>g.granted.includes(m.sec)&&(accessActor()!=='couple'||PEOPLE[id]?.pair))):[];if(!person(id)||!media.length){toast(L('Доступ к фото недоступен','Photo access is unavailable'),{type:'warn'});refresh();return;}const actor=accessActor(),ticket=authorTicket(actor),scopes=[...new Set(media.map(m=>m.sec))];openViewer(media.map(m=>({type:m.type,src:m.src,wm:'@'+(S.me.nick||'')})),+a.dataset.i,{guard:()=>validAuthor(ticket)&&receivedGrant(id,actor)===g&&scopes.every(sec=>g.granted.includes(sec))&&(actor!=='couple'||!!PEOPLE[id]?.pair)});};
SC.P08={title:p=>pname(p.id),valid:p=>!!PEOPLE[p.id]&&!isBlocked(p.id),render:(p,r)=>profileView(p.id,r),after:()=>{fillJars();setTimeout(()=>$('#priv')?.scrollIntoView({block:'start',behavior:'smooth'}),120);}};

/* P02 — edit my profile: one source of truth for every screen */
/* Main profile: media (photos and video together), basics + your details in ONE card, interests. The private part comes last, as its own panel
   with the switch next to its title; it holds only a description, photos and video — each with its own permission. Saved with the profile, no separate save. */
const COUPLE_FIELDS=['role','format','seek'];
/** main-profile interests: public ones and the ones only you see (crossed eye); interests placed in the private part are in its panel */
function peJars(m,owner){const list=sortJars((m.jars||[]).filter(j=>j.vis!=='granted'));
 return `<section class="grp" id="peJars"><div class="grp-t"><span>${owner==='couple'?L('Общие интересы','Couple interests'):L('Интересы','Interests')}</span><span class="note">${list.length}</span></div><div class="card form-card">
 ${jarsHTML(list,{act:owner==='couple'?'editCoupleJar':'editJar',add:'peJarAdd',vis:1})}
</div></section>`;}
ACT.peJarAdd=()=>topicPicker(null,null,'public');
ACT.peJarAddPriv=()=>topicPicker(null,null,'granted');

/* ----- media editor: one grid for the main profile (photos + video together) and one per private kind (photos / video) ----- */
/** a cell: tap → menu (view, replace, crop, move, delete), ✕ → delete, press-and-drag → reorder */
const miCell=o=>`<div class="mi" data-id="${esc(o.id)}">${o.type==='video'?`<video src="${esc(o.src)}" style="${vframe(o)}" muted playsinline preload="metadata"></video><span class="dur">${I.video}${fmtDur(o.dur||0)}</span>`:`<img src="${esc(o.src)}" alt="" draggable="false">`}${o.main?`<span class="mainph">${L('главное','main')}</span>`:''}<button class="vw" data-act="miMenu" data-k="${o.k}" data-v="${esc(o.id)}" aria-label="${o.type==='video'?L('Действия с видео','Video actions'):L('Действия с фото','Photo actions')}"></button><button class="rm" data-act="miRm" data-k="${o.k}" data-v="${esc(o.id)}" aria-label="${o.type==='video'?L('Удалить видео','Remove video'):L('Удалить фото','Remove photo')}">${I.close}</button></div>`;
const miAdd=(k,label)=>`<button class="mi-add" data-act="miAdd" data-k="${k}" aria-label="${label}">${k==='video'?I.video:I.camera}<small>${L('Добавить','Add')}</small></button>`;
const miGrid=(k,cells,add)=>`<div class="mgrid" data-reorder="miOrder" data-k="${k}">${cells.join('')}${add||''}</div>`;
const PUB_MAX=6;
/** where a main-profile item sits: the draft list r.photos holds photos (src) and videos ({type:'video',url,dur}) in display order */
function pubMediaEditor(r){const first=r.photos.findIndex(x=>!isVideoItem(x));
 return miGrid('pub',r.photos.map((ph,i)=>miCell({k:'pub',id:String(i),type:isVideoItem(ph)?'video':'image',src:isVideoItem(ph)?vsrc(ph):IMG(ph),dur:ph.dur,w:ph.w,h:ph.h,crop:ph.crop,main:i===first})),r.photos.length<PUB_MAX?miAdd('pub',L('Добавить фото или видео','Add photos or video')):'');}
/** the private part in the editor: one panel — switch beside the title; description, photos, video, who may ask, access */
function privEditor(m,r,owner){const sp=privSplit(privMedia(m)),jars=sortJars((m.jars||[]).filter(j=>j.vis==='granted')),grants=givenGrantEntries().length,on=!!r.privOn;
 const head=`<section class="vault" id="privEdit"><div class="vault-h"><span class="vi">${I.lock}</span><div><b>${L('Приватная часть','Private part')}</b></div><button class="vsw" data-act="pePriv" role="switch" aria-checked="${on}" aria-label="${L('Приватная часть','Private part')}">${sw(on)}</button></div>`;
 if(!on)return `${head}</section>`;
 const kind=(k,title,label)=>`<section class="grp"><div class="grp-t"><span>${title}</span><span class="note">${sp[k].length}/${PRIV_MAX[k]}</span></div><div class="card form-card">${miGrid(k,sp[k].map(x=>miCell({k,id:x.id,type:x.type==='video'?'video':'image',src:privSrc(x),dur:x.dur,w:x.w,h:x.h,crop:x.crop})),sp[k].length<PRIV_MAX[k]?miAdd(k,label):'')}</div></section>`;
 return `${head}
 <div class="vault-b">
 <section class="grp"><div class="grp-t"><span>${L('Описание','Description')}</span></div><div class="card form-card">${rteField({name:'privText',label:'',max:1000,ph:L('Как тебе удобно договариваться, что важно до встречи','How you like to agree on things, what matters before meeting')})}</div></section>
 <section class="grp"><div class="grp-t"><span>${L('Интересы','Interests')}</span><span class="note">${jars.length}</span></div><div class="card form-card">${jarsHTML(jars,{act:owner==='couple'?'editCoupleJar':'editJar',add:'peJarAddPriv'})}</div></section>
 ${kind('photos',L('Фото','Photos'),L('Добавить фото','Add photos'))}
 ${kind('video',L('Видео','Video'),L('Добавить видео','Add video'))}
 ${owner==='couple'?`<div class="card list mt12">${linkRow({go:'Q05',icon:'unlock',title:L('Кому открыто','Who has access'),val:String(grants)})}</div>`:''}
 <div class="card list mt16"><div class="li">${selectRow('peReq',L('Кто может просить доступ','Who may ask'),[['all',L('Все','Everyone')],['matches',L('Взаимные','Mutual')],['none',L('Никто','Nobody')]],r.reqFrom||'all')}</div></div>
 ${grants?`<div class="vault-act"><button class="btn text danger auto" data-act="revokeAll">${L('Отозвать все доступы','Revoke all access')}</button></div>`:''}
 </div></section>`;}
ACT.pePriv=()=>{const r=cur();r.privOn=!r.privOn;r.dirty=true;refresh();};
ACT.peReq=a=>{const r=cur();r.reqFrom=a.dataset.v;r.dirty=true;refresh();};
SC.P02={title:()=>L('Редактировать профиль','Edit profile'),valid:p=>p.owner!=='couple'||S.pair?.status==='active',render:(p,r)=>{const m=editableProfile(r);const owner=p.owner||'me';
 if(!r.init){r.init=1;Object.assign(r.f,{nick:owner==='couple'?T(m.name):m.nick,bio:T(m.bio),city:m.city||''});r.photos=[...m.photos];r.pron=m.pron;r.gender=[...m.gender];r.orient=[...m.orient];r.format=[...fmtList(m.format)];r.status=m.status||null;r.role=[...fmtList(m.role)];r.showAge=m.showAge!==false;r.seek=[...(m.seek||[])];r.pairVersion=S.pair?.draftVersion||0;r.pairLease=S.pair?.draftLease||0;r.datingVisible=!!m.datingVisible;r.socialLikes=m.socialLikes!==false;r.requestsFrom=m.requestsFrom||'all';r.reqFrom=r.requestsFrom;r.privOn=m.privOn??(privMedia(m).length>0||!!T(m.privText));r.f.privText=T(m.privText)||'';}
 S.ui.privSec='';
 const fields=identityFields().filter(([k])=>owner!=='couple'||COUPLE_FIELDS.includes(k));
 /* your details are folded into one summary row inside the same card; open by default only while nothing is chosen */
 const whoOpen=r.openWho??!fields.some(([k])=>fmtList(r[k]).length);
 const whoSum=fields.map(([k,t])=>{const v=fmtList(r[k]).map(x=>opt(k,x)).filter(Boolean).slice(0,2).join(', ');return v?`${t}: ${v}`:'';}).filter(Boolean);
 const whoRow=`<button class="li" data-act="peWho" aria-expanded="${whoOpen}"><span class="tx"><b>${owner==='couple'?L('Данные пары','Couple details'):L('Данные о тебе','Your details')}</b><small>${whoSum.length?esc(whoSum.slice(0,3).join(' · ')):L('Пока ничего не выбрано','Nothing chosen yet')}</small></span><span class="chv ${whoOpen?'open':''}">${I.down}</span></button>`;
 return `${bar(L('Профиль','Profile'),{back:1,sm:1,actions:`<button class="btn text auto" data-act="previewDraft">${L('Как видят','Preview')}</button>`})}<div class="view nodock cta1"><div class="wrap">
 <section class="grp"><div class="grp-t"><span>${L('Фото и видео','Photos & video')}</span><span class="note">${r.photos.length}/${PUB_MAX}</span></div><div class="card form-card">${pubMediaEditor(r)}</div></section>
 <section class="grp"><div class="card form-card">
 ${field({name:'nick',label:owner==='couple'?L('Название пары','Couple name'):L('Ник','Nickname'),icon:'at',attrs:'autocapitalize="off" spellcheck="false"'})}
 ${owner!=='couple'?toggleRow('peShowAge',L('Показывать возраст в профиле','Show age on profile'),'',r.showAge):''}
 ${rteField({name:'bio',label:L('О себе','About you'),max:500,ph:L('Пара фраз о том, что для тебя важно','A few lines about what matters to you')})}
 <button class="li" data-act="peCity"><span class="ico">${I.pin}</span><span class="tx"><b>${L('Город','City')}</b><small>${r.f.city?esc(placeCaption(r.f.city)):L('Не показывать','Don’t show')}</small></span>${I.chev}</button>
 ${owner==='couple'?toggleRow('pairDating',L('Показывать пару в знакомствах','Show couple in Discover'),pairTrusted()?L('Сохранится вместе с профилем','Saved with the profile'):L('Включается после согласования всей версии профиля','Enabled after approval of the complete profile version'),r.datingVisible):''}
 ${whoRow}${whoOpen?fields.map(([k,title])=>`<div class="field"><span class="flabel">${title}</span>${identityChoices(k,r[k],IDENTITY_MULTI.includes(k)?'peMulti':'peOne')}</div>`).join(''):''}
 </div></section>${peJars(m,owner)}${privEditor(m,r,owner)}
 </div></div><div class="ctabar"><div class="wrap"><button class="btn primary" data-act="peSave">${L('Сохранить','Save')}</button></div></div>`;}};
ACT.peWho=()=>{const r=cur();const f=identityFields().filter(([k])=>r.p.owner!=='couple'||COUPLE_FIELDS.includes(k));const was=r.openWho??!f.some(([k])=>fmtList(r[k]).length);r.openWho=!was;refresh();};
ACT.peOne=a=>{const r=cur(),k=a.dataset.k;r[k]=toggleIdentityValue(r[k],k,a.dataset.v);r.dirty=true;refresh();};
ACT.peMulti=a=>{const r=cur(),k=a.dataset.k;r[k]=toggleIdentityValue(r[k],k,a.dataset.v);r.dirty=true;refresh();};
/* main-profile media (draft until «Сохранить») */
const pubItem=(r,id)=>{const i=+id;return Number.isInteger(i)&&i>=0&&i<r.photos.length?i:-1;};
const pubFromUpload=i=>i.type==='video'?vitem(i):i.url;
ACT.phAdd=()=>{const r=cur();openUploader({max:PUB_MAX,have:r.photos.length,accept:'media',aspect:'4:5',title:L('Фото и видео профиля','Profile photos & video'),done:items=>{r.photos.push(...items.map(pubFromUpload));r.dirty=true;refresh();}});};
/** private media (applied right away, like the text of a shared album): list, writer guard and refresh in one place */
function privEdit(fn){const route=cur();if(route.p.owner==='couple'&&!coupleWritable())return;const model=editableProfile(route);if(!model)return;const session=S.session,pair=S.pair,lease=S.pair?.draftLease;
 return fn(model,()=>{if(S.session!==session||route.p.owner==='couple'&&(S.pair!==pair||!coupleWritable(lease)))return false;if(route.p.owner==='couple')markCoupleDraft();refresh();return true;},route);}
const privById=(model,id)=>privMedia(model).findIndex(x=>x.id===id);
ACT.miAdd=a=>{const k=a.dataset.k;if(k==='pub')return ACT.phAdd();
 privEdit((model,done,route)=>{const lease=S.pair?.draftLease,pair=S.pair,session=S.session;const sp=privSplit(privMedia(model)),have=sp.photos.length+sp.video.length,cap=PRIV_MAX.photos+PRIV_MAX.video;
  /* a photo or a video can be added from either button: each lands in its own list; cropping to 4:5 is optional */
  openUploader({max:cap,have,accept:'media',aspect:null,cropAsk:true,title:L('Приватные фото и видео','Private photos & video'),done:items=>{if(S.session!==session||route.p.owner==='couple'&&(S.pair!==pair||!coupleWritable(lease)))return;const target=route.p.owner==='couple'?editableProfile(route):model;const list=privMedia(target),now=privSplit(list);let skipped=0;
   for(const i of items){const kind=i.type==='video'?'video':'photos';if(now[kind].length>=PRIV_MAX[kind]){skipped++;continue;}const it={id:'pm'+Math.random().toString(36).slice(2,7),...(i.type==='video'?vitem(i):{type:i.type,url:i.url})};list.push(it);now[kind].push(it);}
   if(skipped)toast(L(`Лишнее не добавлено: ${skipped} (фото до ${PRIV_MAX.photos}, видео до ${PRIV_MAX.video})`,`Not added: ${skipped} (up to ${PRIV_MAX.photos} photos, ${PRIV_MAX.video} videos)`),{type:'warn'});
   if(route.p.owner==='couple')markCoupleDraft();refresh();}});});};
/** drag-and-drop result: dataset.k = 'pub' | 'photos' | 'video', dataset.order = ids in the new order */
ACT.miOrder=a=>{const k=a.dataset.k,ids=String(a.dataset.order||'').split(',');
 if(k==='pub'){const r=cur();if(ids.length!==r.photos.length)return refresh();const next=ids.map(i=>r.photos[+i]);if(next.some(x=>x===undefined))return refresh();r.photos=next;r.dirty=true;refresh();return;}
 privEdit((model,done)=>{const list=privMedia(model),mine=list.filter(x=>(k==='video')===(x.type==='video')),byId=new Map(mine.map(x=>[x.id,x]));if(ids.length!==mine.length||ids.some(i=>!byId.has(i)))return refresh();model.media=[...list.filter(x=>!byId.has(x.id)),...ids.map(i=>byId.get(i))];done();});};
ACT.miView=a=>{closeSheet(true);const k=a.dataset.k,id=a.dataset.v;
 if(k==='pub'){const r=cur();openViewer(r.photos.map(ph=>isVideoItem(ph)?{type:'video',src:vsrc(ph),dur:ph.dur}:{type:'image',src:IMG(ph)}),Math.max(0,pubItem(r,id)));return;}
 const list=privOrdered(privMedia(editableProfile()));openViewer(list.map(m=>({type:m.type==='video'?'video':'image',src:privSrc(m),style:m.style,wm:'@'+(S.me.nick||'')})),Math.max(0,list.findIndex(x=>x.id===id)));};
ACT.miMenu=a=>{const k=a.dataset.k,id=a.dataset.v,r=cur();
 const item=k==='pub'?r.photos[pubItem(r,id)]:privMedia(editableProfile())[privById(editableProfile(),id)];if(item==null)return;const video=k==='pub'?isVideoItem(item):item.type==='video';
 const first=k==='pub'?r.photos.findIndex(x=>!isVideoItem(x)):-1;
 sheet(()=>({title:video?L('Видео','Video'):L('Фото','Photo'),body:`<div class="card list">${linkRow({act:'miView',k,v:id,icon:'eye',title:L('Посмотреть','View'),noChev:1}).replace('<button ',`<button data-k="${k}" `)}${linkRow({act:'miReplace',v:id,icon:'camera',title:L('Заменить','Replace'),noChev:1}).replace('<button ',`<button data-k="${k}" `)}${linkRow({act:'miCrop',v:id,icon:'edit',title:L('Кадрировать','Crop'),noChev:1}).replace('<button ',`<button data-k="${k}" `)}${k==='pub'&&!video&&pubItem(r,id)!==first?linkRow({act:'phMain',v:id,icon:'check',title:L('Сделать главным','Make main'),sub:L('Его увидят первым в профиле и подборке','Shown first on your profile and in Discover'),noChev:1}):''}${linkRow({act:'miRm',v:id,icon:'trash',cls:'danger',title:L('Удалить','Delete'),noChev:1}).replace('<button ',`<button data-k="${k}" `)}</div>`}));};
ACT.miReplace=a=>{closeSheet(true);const k=a.dataset.k,id=a.dataset.v;
 if(k==='pub'){const r=cur(),i=pubItem(r,id);if(i<0)return;openUploader({max:1,have:0,accept:'media',aspect:'4:5',title:L('Заменить','Replace'),done:items=>{const j=pubItem(r,id);if(j<0||!items[0])return;r.photos[j]=pubFromUpload(items[0]);r.dirty=true;refresh();}});return;}
 privEdit((model,done,route)=>{const x=privMedia(model).find(m=>m.id===id);if(!x)return;const video=x.type==='video',session=S.session,pair=S.pair,lease=S.pair?.draftLease;
  openUploader({max:1,have:0,accept:video?'video':'image',aspect:null,cropAsk:true,title:L('Заменить','Replace'),done:items=>{if(S.session!==session||route.p.owner==='couple'&&(S.pair!==pair||!coupleWritable(lease)))return;const target=route.p.owner==='couple'?editableProfile(route):model,list=privMedia(target),i=list.findIndex(m=>m.id===id);if(i<0||!items[0])return;list[i]={id,...(items[0].type==='video'?vitem(items[0]):{type:items[0].type,url:items[0].url})};if(route.p.owner==='couple')markCoupleDraft();refresh();}});});};
/** crop for photos (re-framed to 4:5) and video (framing stored, applied on display) — main profile and private part alike */
ACT.miCrop=a=>{closeSheet(true);const k=a.dataset.k,id=a.dataset.v;S.ui.up=null;
 if(k==='pub'){const r=cur(),i=pubItem(r,id);if(i<0)return;const it=r.photos[i];
  if(isVideoItem(it)){openCrop(it.url,'4:5',it.crop||{x:0,y:0,z:1},(crop,trim)=>{const j=pubItem(r,id);if(j<0)return;r.photos[j]={...r.photos[j],crop,trim,dur:trim?trim.e-trim.s:r.photos[j].dur};r.dirty=true;refresh();toast(L('Кадр сохранён','Crop saved'),{type:'ok'});},'video',{fdur:it.fdur||it.dur,trim:it.trim});return;}
  const src=IMG(it);openCrop(src,'4:5',{x:0,y:0,z:1},async crop=>{const c=await cropImage({full:src,crop:{...crop,touched:true}},'4:5');const j=pubItem(r,id);if(j<0)return;r.photos[j]=c.url;r.dirty=true;refresh();toast(L('Кадр сохранён','Crop saved'),{type:'ok'});});return;}
 privEdit((model,done)=>{const x=privMedia(model).find(m=>m.id===id);if(!x)return;
  const save=patch=>privEdit((m2,d2)=>{const y=privMedia(m2).find(m=>m.id===id);if(!y)return;Object.assign(y,patch);if(d2())toast(L('Кадр сохранён','Crop saved'),{type:'ok'});});
  if(x.type==='video'){openCrop(x.url,'4:5',x.crop||{x:0,y:0,z:1},(crop,trim)=>save({crop,trim,dur:trim?trim.e-trim.s:x.dur}),'video',{fdur:x.fdur||x.dur,trim:x.trim});return;}
  const src=privSrc(x);openCrop(src,'4:5',{x:0,y:0,z:1},async crop=>{const c=await cropImage({full:src,crop:{...crop,touched:true}},'4:5');save({url:c.url,src:undefined});});});};
ACT.phMain=a=>{closeSheet(true);const r=cur(),i=pubItem(r,a.dataset.v);if(i<0||isVideoItem(r.photos[i]))return;const [ph]=r.photos.splice(i,1);r.photos.unshift(ph);r.dirty=true;refresh();toast(L('Теперь это главное фото','This is now your main photo'),{type:'ok'});};
/** delete with an undo toast: the item goes back to the same place */
ACT.miRm=a=>{if(S.ui.sheet)closeSheet(true);const k=a.dataset.k,id=a.dataset.v;
 if(k==='pub'){const r=cur(),i=pubItem(r,id);if(i<0)return;const was=r.photos[i];
  if(requiresDiscoveryPhoto(editableProfile())&&!isVideoItem(was)&&r.photos.filter(x=>!isVideoItem(x)).length===1){toast(L('Для показа в подборке нужно фото. Сначала выключи показ анкеты в настройках.','A photo is required to appear in Discover. Turn off profile visibility in settings first.'),{type:'warn'});return;}
  r.photos.splice(i,1);r.dirty=true;refresh();toast(isVideoItem(was)?L('Видео удалено','Video removed'):L('Фото удалено','Photo removed'),{action:{label:L('Вернуть','Undo'),fn:()=>{if(cur()!==r||r.photos.length>=PUB_MAX)return;r.photos.splice(Math.min(i,r.photos.length),0,was);r.dirty=true;refresh();}}});return;}
 privEdit((model,done,route)=>{const list=privMedia(model),i=privById(model,id);if(i<0)return;const was=list[i],owner=route.p.owner;list.splice(i,1);done();
  toast(was.type==='video'?L('Видео удалено','Video removed'):L('Фото удалено','Photo removed'),{action:{label:L('Вернуть','Undo'),fn:()=>{if(cur()!==route||owner==='couple'&&!coupleWritable())return;const m=editableProfile(route),l=privMedia(m);if(!l.some(x=>x.id===was.id))l.splice(Math.min(i,l.length),0,was);if(owner==='couple')markCoupleDraft();refresh();}}});});};
ACT.peSave=a=>{const r=cur(),session=S.session,pair=S.pair,ticket=authorTicket(r.p.owner==='couple'?'couple':'me');if(r.p.owner==='couple'&&(!coupleWritable(r.pairLease)||(S.pair.draftVersion||0)!==r.pairVersion)){toast(L('Черновик изменился. Открой актуальную версию; введённые данные остаются здесь.','The draft changed. Open the current version; your input stays here.'),{type:'warn'});return;}if(requiresDiscoveryPhoto(r.p.owner==='couple'?{dating:r.datingVisible,datingVisible:r.datingVisible}:editableProfile(r))&&firstPhoto(r.photos)==null){toast(L('Для показа в подборке нужно хотя бы одно фото','At least one photo is required to appear in Discover'),{type:'warn'});return;}r.err={};const nk=fv('nick').trim();const ne=r.p.owner==='couple'?(nk.length<2||nk.length>60?L('От 2 до 60 символов','2 to 60 characters'):''):nk.toLowerCase()===S.me.nick.toLowerCase()?'':V.nick(nk);if(ne)r.err.nick=ne;if(fv('bio').length>500)r.err.bio=L('Максимум 500 символов','500 characters max');
 if(Object.keys(r.err).length){refresh();shakeFirstErr();toast(L('Проверь отмеченные поля','Check the highlighted fields'),{type:'err'});return;}
 const bio=fv('bio');if(r.p.owner==='couple'&&r.datingVisible&&(firstPhoto(r.photos)==null||S.me.ageCheck!=='ok'||!PEOPLE[pair.with]?.verified)){toast(L('Для знакомств нужны фото и подтверждение 18+ обоих участников','Discover requires a photo and 18+ confirmation for both partners'),{type:'warn'});return;}run(a,()=>{if(S.session!==session||cur()!==r||!validAuthor(ticket)||r.p.owner==='couple'&&S.pair!==pair)return;if(r.p.owner==='couple'&&(!coupleWritable(r.pairLease)||(S.pair.draftVersion||0)!==r.pairVersion)){toast(L('Черновик изменён в другом редакторе. Открой его заново; введённые данные сохранены на этом экране.','The draft changed in another editor. Reopen it; this screen keeps your input.'),{type:'warn'});return;}const m=editableProfile(r);if(!m)return;Object.assign(m,{nick:r.p.owner==='couple'?'couple':nk,...(r.p.owner==='couple'?{name:editedText(m.name,nk)}:{}),bio:editedText(m.bio,bio),city:r.f.city||null,photos:[...r.photos],photo:firstPhoto(r.photos),showAge:r.showAge,pron:r.pron,gender:r.gender,orient:r.orient,format:[...r.format],status:r.status,role:[...r.role],seek:[...r.seek],privOn:!!r.privOn,requestsFrom:r.reqFrom,...(r.privOn?{privText:editedText(m.privText,fv('privText').trim().slice(0,1000))}:{}),...(r.p.owner==='couple'?{dating:r.datingVisible,datingVisible:r.datingVisible,socialLikes:false,requestsFrom:r.reqFrom}:{})});if(r.p.owner==='couple'){markCoupleDraft(true);if(pairTrusted()&&coupleDraftChanged())submitCoupleDraft();}r.dirty=false;back();},{ok:r.p.owner==='couple'&&!pairTrusted()?L('Черновик сохранён. Отправь общую версию на согласование в профиле пары.','Draft saved. Submit the complete version from the couple profile.'):L('Профиль обновлён','Profile updated')});};

/* P04 — the private part: what you share by request — description, photos, video (each with its own permission) */
function privMedia(model=editableProfile()){if(!model)return [];if(!model.media){model.media=S.persona!=='new'?[{id:'pm0',type:'image',src:8},...['/images/v10-content/post-p9-evening-atmosphere-45.webp','/images/v10-content/gallery-e3-club.webp','/images/v10-content/post-p6-latex-night-prep-45.webp','/images/v10-content/gallery-e1-ropes.webp'].map((url,i)=>({id:'pa'+i,type:'image',url}))]:[];}return model.media;}
const privSrc=m=>m.type==='video'?vsrc(m):(m.url||IMG(m.src));
MEDIA_SRC.priv=()=>{const pv=cur().p?.preview;return privOrdered(privMedia(pv||(cur().id==='Q03'?coupleProfile():editableProfile()))).map(m=>({type:m.type,url:privSrc(m),style:m.style,dur:m.dur}));};
/* P04 (old standalone screen) now opens the profile editor scrolled to the private block */
SC.P04={...SC.P02,title:()=>L('Приватная часть','Private part'),render:(p,r)=>SC.P02.render(p,r),after:()=>setTimeout(()=>$('#privEdit')?.scrollIntoView({block:'start'}),60)};
ACT.privTextSave=a=>{if(cur().p.owner==='couple'&&!coupleWritable())return;const r=cur(),session=S.session,pair=S.pair;const v=fv('privText').trim().slice(0,1000);run(a,()=>{if(S.session!==session||r.p.owner==='couple'&&S.pair!==pair)return;const m=editableProfile(r);if(!m)return;m.privText=v;if(r.p.owner==='couple')markCoupleDraft();r.f.privText=v;r.dirty=false;refresh();},{ms:300,ok:L('Текст сохранён — его видят только те, кому ты откроешь доступ','Saved — only people you share access with can see it')});};
ACT.privView=a=>{MEDIA_SRC.priv&&openViewer(MEDIA_SRC.priv().map(m=>({type:m.type,src:m.url,style:m.style,wm:'@'+(S.me.nick||'')})),+(a.dataset.i??a.dataset.v));};
ACT.reqFrom=a=>run(null,()=>{const r=cur(),m=editableProfile(r);if(!m)return;m.requestsFrom=a.dataset.v;if(r.p.owner==='couple')markCoupleDraft();refresh();},{ms:300,ok:L('Сохранено','Saved')});

/* Q01 — partner link */
ACT.pairLink=()=>{sheet(()=>({title:L('Профиль пары','Couple profile'),lead:`<span class="ico v">${I.couple}</span>`,body:`
 <div class="fact"><i class="g">${I.check}</i><span>${L('Общими станут: описание пары, правила и совместные публикации','Shared: couple description, rules and joint posts')}</span></div><div class="fact"><i class="g">${I.check}</i><span>${L('Совместные фото и доступы — только с согласия обоих','Joint photos and access — only with both agreeing')}</span></div>
 <label class="field mt16"><span>${L('Ник партнёра','Partner’s nickname')}</span><div class="inwrap">${I.at}<input class="inp" id="pairNick" placeholder="kira" autocapitalize="off"></div></label>`,foot:`<button class="btn primary" data-act="pairSend">${L('Отправить приглашение','Send invitation')}</button>`}));};
ACT.pairSend=a=>{const v=$('#pairNick').value.trim().toLowerCase();if(!v){$('#pairNick').classList.add('err');toast(L('Укажи ник партнёра','Enter your partner’s nickname'),{type:'err'});return;}if(!PEOPLE[v]){$('#pairNick').classList.add('err');toast(L('Такого ника нет. Проверь написание','No such nickname. Check the spelling'),{type:'err'});return;}run(a,()=>{S.pairInvite={p:v,t:Date.now()};closeSheet();refresh();},{ok:L(`Приглашение отправлено ${pname(v)}. Пара появится после её/его согласия`,`Invitation sent to ${pname(v)}. The couple appears once they accept`)});};

ACT.previewDraft=()=>{const r=cur();const m=editableProfile(r);const value={...m,...(r.p.owner==='couple'?{name:{ru:fv('nick'),en:fv('nick')}}:{}),nick:fv('nick'),bio:{ru:fv('bio'),en:fv('bio')},city:r.f.city||null,photos:[...r.photos],photo:firstPhoto(r.photos),showAge:r.showAge,pron:r.pron,gender:[...r.gender],orient:[...r.orient],format:[...r.format],status:r.status,role:[...r.role],seek:[...r.seek],privOn:!!r.privOn,...(r.privOn?{privText:{ru:fv('privText'),en:fv('privText')}}:{})};go('P03',{preview:value,owner:r.p.owner},{keepDraft:true});};
ACT.peCity=()=>openCityPicker(cur().f.city,id=>{cur().f.city=id;cur().dirty=true;refresh();},{clear:1});
ACT.peHideCity=()=>{cur().f.city='';cur().dirty=true;refresh();};


/* ---------- V10 revision part 2: badges, followers / following ---------- */
/** small badges after a name: photo verification and Premium. Neither opens private data or chat. */
/** one block for everything a person does (posts, events they run, communities they lead): the only tabbed part of a profile */
function activityBlock(id,tabs){const on=tabs.filter(t=>t[2]);if(!on.length)return '';S.ui.pa||(S.ui.pa={});const cur_=on.some(t=>t[0]===S.ui.pa[id])?S.ui.pa[id]:on[0][0];const t=on.find(x=>x[0]===cur_);
 return `<section class="grp activity">${on.length>1?tabsRow(on.map(x=>[x[0],x[1],x[2]]),cur_,'profAct','tabs-full'):`<div class="grp-t"><span>${t[1]} · ${t[2]}</span></div>`}${t[3]()}</section>`;}
/* ---------- activity: what a person did — likes, events, communities, follows. The owner decides who sees the tab (Settings → Privacy) ---------- */
const ACT_VIS=()=>[['all',L('Все','Everyone')],['followers',L('Подписчики и взаимные','Followers & mutual')],['off',L('Никто','Nobody')]];
const actHash=s=>{let h=0;for(const c of String(s))h=(h*31+c.charCodeAt(0))>>>0;return h;};
const activityMode=id=>(id==='me'?S.me.activityVis:person(id)?.actVis)||'all';
/** is the activity tab visible to this viewer? `o.asOther` = «as others see me» preview: no access = a stranger, with access = a contact */
function activityShown(id,o={}){if(id==='couple'||person(id)?.pair)return false;if(id==='me'&&!o.asOther)return true;const m=activityMode(id);if(m==='off')return false;if(m==='all')return true;
 if(o.asOther)return o.grant==='granted';return social('me').follows.has(id)||isMatch(id);}
function activityOf(id){const out=[],pub=p=>p.aud==='all'&&!p.unavailable&&!isBlocked(p.author);
 if(id==='me'){allPosts().filter(p=>(p.reactions?p.reactions.me:p.liked)&&!isBlocked(p.author)).forEach((p,i)=>out.push({k:'like',post:p,t:p.likedAt||p.t+i}));
  Object.entries(S.rsvp||{}).filter(([e,v])=>EV(e)&&['going','interested'].includes(v.status)).forEach(([e,v],i)=>out.push({k:'event',e,st:v.status,t:Date.now()-(i+2)*DAY}));
  [...S.joined].filter(c=>COMMUNITIES[c]&&!COMMUNITIES[c].hidden).forEach((c,i)=>out.push({k:'comm',c,t:Date.now()-(i+4)*DAY}));
  followingOf('me').forEach((p,i)=>out.push({k:'follow',p,t:Date.now()-(i+3)*DAY*1.5}));}
 else{allPosts().filter(p=>p.author!==id&&pub(p)&&actHash(id+p.id)%3===0).slice(0,6).forEach(p=>out.push({k:'like',post:p,t:Math.min(Date.now()-HOUR,p.t+(actHash(id+p.id)%7+1)*20*60e3)}));
  allEventIds().filter(e=>!EV(e).cancelled&&EV(e).status!=='review'&&!EV(e).private&&actHash(id+e)%4===0).slice(0,2).forEach((e,i)=>out.push({k:'event',e,st:'going',t:Date.now()-(i+1)*DAY*2}));
  Object.keys(COMMUNITIES).filter(c=>!COMMUNITIES[c].hidden&&COMMUNITIES[c].privacy==='open'&&(COMMUNITIES[c].mods.includes(id)||actHash(id+c)%4===0)).slice(0,2).forEach((c,i)=>out.push({k:'comm',c,t:Date.now()-(i+5)*DAY}));
  followingOf(id).slice(0,2).forEach((p,i)=>out.push({k:'follow',p,t:Date.now()-(i+2)*DAY*1.7}));}
 return out.sort((a,b)=>b.t-a.t);}
function activityList(id,items,o={}){const rows=items.slice(0,12).map(x=>{
  if(x.k==='like')return linkRow({go:'F05',p:{id:x.post.id},...((x.post.media||[]).find(m=>m.type==='image'&&m.url)?{av:`<span class="actth"><img src="${esc(x.post.media.find(m=>m.type==='image'&&m.url).url)}" alt="" loading="lazy" draggable="false"><i>${I.heartf}</i></span>`}:{icon:'heartf',tone:'l'}),title:L(`Лайк · публикация ${pname(x.post.author)}`,`Like · ${pname(x.post.author)}’s post`),sub:`${mdPlain(T(x.post.text)).slice(0,70)||L('Публикация','Post')} · ${F.rel(x.t)}`});
  if(x.k==='event')return linkRow({go:'E03',p:{id:x.e},av:`<span class="actth">${evCover(EV(x.e),'cal')}</span>`,title:x.st==='interested'?L('Интересует событие','Interested in an event'):L('Идёт на событие','Going to an event'),sub:`${T(EV(x.e).title)} · ${F.rel(x.t)}`});
  if(x.k==='comm')return linkRow({go:'C03',p:{id:x.c},av:`<span class="actth">${commAv(COMMUNITIES[x.c])}</span>`,title:L('Сообщество','Community'),sub:`${T(COMMUNITIES[x.c].name)} · ${F.rel(x.t)}`});
  return linkRow({go:'P01',p:{id:x.p},av:av(x.p,''),title:L('Подписка','Followed'),sub:`${pname(x.p)} · ${F.rel(x.t)}`});}).join('');
 const mode=ACT_VIS().find(x=>x[0]===activityMode(id));
 return `<div class="card list">${rows}</div>${o.self?`<p class="note mt12">${L('Видят','Visible to')}: ${esc(mode[1].toLowerCase())} · <button class="btn text auto" data-go="K01">${L('Изменить в настройках','Change in settings')}</button></p>`:''}`;}
ACT.profAct=a=>{const id=cur().p.id||(cur().p.owner==='couple'?'couple':'me');S.ui.pa||(S.ui.pa={});S.ui.pa[id]=a.dataset.v;refresh();};
function nameBadges(p,sm){if(!p)return '';return `${p.pv?`<span class="nbadge v" title="${L('Фото подтверждено','Photo verified')}" role="img" aria-label="${L('Фото подтверждено','Photo verified')}">${I.check}</span>`:''}${p.premium||S.giftedTo?.has(p)?`<span class="nbadge p" title="Premium" role="img" aria-label="Premium">${I.crown}</span>`:''}`;}
/** follow graph: counts are always the length of the lists people can open */
function followingOf(id){const set=person(id)?.pair?new Set():id==='me'?S.follows:id==='couple'?new Set():(S.graph[id]||new Set());return [...set].filter(x=>(x==='me'||x==='couple'&&activePair()||PEOPLE[x])&&!isBlocked(x));}
function followersOf(id){return ['me',...(activePair()?['couple']:[]),...Object.keys(PEOPLE)].filter(k=>k!==id&&!isBlocked(k)&&followingOf(k).includes(id));}
function followCounts(id){const a=followersOf(id).length,b=followingOf(id).length;
 return `<div class="pc-stats"><button data-go="P10" data-p='${esc(JSON.stringify({id,tab:'followers'}))}'><b>${a}</b>${pl(a,['подписчик','подписчика','подписчиков'],['follower','followers'],true)}</button>${person(id)?.pair?'':`<button data-go="P10" data-p='${esc(JSON.stringify({id,tab:'following'}))}'><b>${b}</b>${pl(b,['подписка','подписки','подписок'],['following','following'],true)}</button>`}</div>`;}
SC.P10={title:p=>p.tab==='following'?L('Подписки','Following'):L('Подписчики','Followers'),valid:p=>(p.id==='me'||p.id==='couple'&&S.pair?.status==='active'||!!PEOPLE[p.id])&&!isBlocked(p.id),render:(p)=>{const id=p.id,tab=p.tab==='following'?'following':'followers',mine=id==='me';
 const list=tab==='following'?followingOf(id):followersOf(id);
 const row=k=>{const self=k==='me';const fol=social('me').follows.has(k);
  const act=self?`<span class="note">${L('это ты','you')}</span>`
   :mine&&tab==='followers'?`<button class="btn sm ${fol?'soft':'primary'}" data-act="flwToggle" data-v="${k}" aria-pressed="${fol}">${fol?L('Отписаться','Unfollow'):L('Подписаться','Follow back')}</button>`
   :`<button class="btn sm ${fol?'soft':'primary'}" data-act="flwToggle" data-v="${k}" aria-pressed="${fol}">${fol?L('Отписаться','Unfollow'):L('Подписаться','Follow')}</button>`;
  return `<div class="li frow"><button class="frow-go" data-go="${self?'P03':'P01'}" ${self?'':`data-p='${esc(JSON.stringify({id:k}))}'`}>${av(k,'')}<span class="tx"><b><span class="fnm">${esc(pname(k))}</span>${nameBadges(person(k),1)}</b><small>${esc(placeLine(k)||'')}</small></span></button>${act}</div>`;};
 const who=mine?'':` · ${esc(pname(id))}`;
 return `${bar((tab==='following'?L('Подписки','Following'):L('Подписчики','Followers'))+who,{back:1,sm:1,actions:authorPicker()})}<div class="view nodock"><div class="wrap">
 ${person(id)?.pair?'':seg([['followers',`${L('Подписчики','Followers')} · ${followersOf(id).length}`],['following',`${L('Подписки','Following')} · ${followingOf(id).length}`]],tab,'flwTab')}
 ${mine&&tab==='followers'?``:''}
 ${list.length?`<div class="card list mt12">${list.map(row).join('')}</div>`:empty('people',tab==='following'?L('Пока ни на кого не подписан(а)','Not following anyone yet'):L('Подписчиков пока нет','No followers yet'),'')}</div></div>`;}};
ACT.flwTab=a=>{const r=cur();r.p={...r.p,tab:a.dataset.v};refresh();};
ACT.flwToggle=a=>{const id=a.dataset.v;if(!canAct('follow','me')||!(PEOPLE[id]||id==='couple'&&activePair())||isBlocked(id)||id==='me')return;const on=!social('me').follows.has(id);on?social('me').follows.add(id):social('me').follows.delete(id);refresh();toast(on?L(`Подписка на ${pname(id)}`,`Following ${pname(id)}`):L(`Ты отписался(ась) от ${pname(id)}`,`Unfollowed ${pname(id)}`),{type:on?'ok':'',action:{label:L('Отменить','Undo'),fn:()=>{if(isBlocked(id))return;on?social('me').follows.delete(id):social('me').follows.add(id);refresh();}}});};

/** couple links on a profile: a couple profile names its two accounts, each partner links to the couple */
function pairLine(id,o={}){const p=person(id);if(!p)return '';
 if(p.pair&&p.members)return grp(L('Участники','Members'),p.members.map(m=>personRow(m,{sub:L('личный профиль','personal profile')})).join(''),{list:1});
 const couple=p.pairOf&&PEOPLE[p.pairOf]?['P01',{id:p.pairOf},pname(p.pairOf)]:S.pair?.status==='active'&&(id==='me'||id===S.pair.with)?['Q03',null,pairName()]:null;
 if(!couple)return '';const btn=`<button class="pairline" data-go="${couple[0]}" ${couple[1]?`data-p='${esc(JSON.stringify(couple[1]))}'`:''}>${I.couple}<span>${L('В паре','In a couple')} · <b>${esc(couple[2])}</b></span>${I.chev}</button>`;
 return o.asOther?btn.replace(/ data-(go|p)=("[^"]*"|'[^']*')/g,'').replace('<button ','<button disabled '):btn;}


ACT.peShowAge=()=>{cur().showAge=!cur().showAge;cur().dirty=true;refresh();};

ACT.pairDating=()=>{cur().datingVisible=!cur().datingVisible;cur().dirty=true;refresh();};
ACT.pairSocialLikes=()=>{cur().socialLikes=!cur().socialLikes;cur().dirty=true;refresh();};
ACT.pairRequests=a=>{cur().requestsFrom=a.dataset.v;cur().dirty=true;refresh();};

