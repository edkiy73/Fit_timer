/* ============ SHARED COMPONENTS ============ */
const JC=['var(--latex)','var(--lilac)','var(--skin)'];
/** jars: list of {t,lv,limit,vis} or [t,lv]; levels are 1–5 "how it resonates now", never a percentage */
function jarsHTML(list,o={}){
 const items=list.map(x=>Array.isArray(x)?{t:x[0],lv:x[1]}:x);
 return `<div class="jars ${o.pre?'pre':''} ${o.cls||''}">${items.map((j,i)=>{
  const tag=o.act?'button':'div';const attrs=o.act?`data-act="${o.act}" data-v="${j.t}" aria-label="${esc(topic(j.t))}${j.limit?'':`, ${j.lv} ${L('из','of')} 5`}"`:'';
  if(j.limit)return `<${tag} class="jar limit" ${attrs}><div class="glass"><span class="lim">${I.block}</span></div><span>${esc(topic(j.t))}</span></${tag}>`;
  return `<${tag} class="jar" ${attrs} style="--jc:${JC[i%3]}"><div class="glass"><div class="fill" style="--v:${Math.max(8,j.lv*20)}"></div><div class="pct">${j.lv}/5</div>${o.vis&&j.vis!=='public'?`<span class="vis">${j.vis==='only'?I.eyeoff:I.lock}</span>`:''}</div><span>${esc(topic(j.t))}</span></${tag}>`;}).join('')}${o.add?`<button class="jar add" data-act="${o.add}"><div class="glass">${I.plus}</div><span>${L('Добавить','Add')}</span></button>`:''}</div>`;
}
const fillJars=()=>setTimeout(()=>$$('.jars.pre').forEach(j=>j.classList.remove('pre')),90);
function venn(n,o={}){return `<div class="venn ${o.mini?'mini':''} ${o.pre?'pre':''}" ${o.id?`id="${o.id}"`:''}><i></i><i></i><b>${n}${o.mini?'':`<small>${pl(n,['общая тема','общие темы','общих тем'],['shared topic','shared topics'],true)}</small>`}</b></div>`;}
const playVenn=()=>setTimeout(()=>$$('.venn.pre').forEach(v=>v.classList.remove('pre')),120);

/** Shared interests: only data both people made visible. Categories, no score. */
function shared(id){
 const p=person(id);if(!p)return{match:[],complement:[],discuss:[],few:true};
 const mine=S.me.jars.filter(j=>j.vis==='public'&&!j.limit);
 const theirs=(p.jars||[]).map(j=>({t:j[0],lv:j[1]}));
 const match=mine.filter(j=>j.lv>=3&&theirs.some(x=>x.t===j.t&&x.lv>=3)).map(j=>j.t);
 const complement=[];const discuss=[];
 const r1=publicField(S.me,'role'),r2=p.role;
 if((r1==='lead'&&r2==='recv')||(r1==='recv'&&r2==='lead'))complement.push(L(`Твоя ${opt('role',r1)} роль и ${opt('role',r2)} у ${pname(id)} дополняют друг друга`,`Your ${opt('role',r1)} role and ${pname(id)}’s ${opt('role',r2)} role complement each other`));
 else if(r2==='switch'||r1==='switch')complement.push(L(`${pname(id)} — свитч: роли можно договорить вместе`,`${pname(id)} is a switch: roles are open to agree on`));
 mine.forEach(j=>{const x=theirs.find(y=>y.t===j.t);if(x&&Math.abs(x.lv-j.lv)>=2)discuss.push(L(`${topic(j.t)}: у тебя ${j.lv}/5, у ${pname(id)} ${x.lv}/5`,`${topic(j.t)}: you ${j.lv}/5, ${pname(id)} ${x.lv}/5`));
  if(false)discuss.push(L(`${topic(j.t)}: ты хочешь попробовать, для ${pname(id)} это сильный интерес`,`${topic(j.t)}: you want to try, for ${pname(id)} it’s a strong interest`));});
 const publicFormat=publicField(S.me,'format');if(publicFormat&&p.format&&publicFormat!==p.format&&(publicFormat==='mono'||p.format==='mono'))discuss.push(L(`Формат отношений: ${opt('format',publicField(S.me,'format'))} и ${opt('format',p.format)}`,`Relationship format: ${opt('format',publicField(S.me,'format'))} vs ${opt('format',p.format)}`));
 return{match,complement,discuss:[...new Set(discuss)],few:mine.length<2||theirs.length<2};
}
function sharedSummary(id){const s=shared(id);if(s.few)return L('Пока мало общего контекста','Not much shared context yet');
 const parts=[];if(s.match.length)parts.push(pl(s.match.length,['общая тема','общие темы','общих тем'],['shared topic','shared topics']));if(s.complement.length)parts.push(L('роли дополняют','roles complement'));return parts.join(', ')||L('Есть что обсудить','Something to talk about');}

/* ---------- people ---------- */
function whoLine(id){const p=person(id);if(!p)return '';const g=(p.gender||[]).map(x=>opt('gender',x)).join(', ');const o=(p.orient||[]).map(x=>opt('orient',x)).join(', ');return [p.pair?T(p.pairNote):opt('pron',p.pron),[g,o].filter(Boolean).join(', ')].filter(Boolean).join(' · ');}
function placeLine(id){const p=person(id);if(!p)return '';return p.km?`${city(p.city)}, ${p.km} ${L('км','km')}`:city(p.city);}
function presence(id){const p=person(id);if(!p)return '';return p.online?L('сейчас в сети','online now'):T(p.last)||'';}
function personRow(id,o={}){
 return `<button class="li" data-go="P01" data-p='${JSON.stringify({id})}'>${av(id,o.round?'round':'')}<span class="tx"><b>${esc(pname(id))}${person(id).dating&&person(id).age?`, ${person(id).age}`:''}</b><small>${o.sub||esc(whoLine(id))}</small></span>${o.right||I.chev}</button>`;
}

/* ---------- posts ---------- */
const allPosts=()=>[...S.myPosts.filter(p=>p.status==='published'),...S.posts];
const postById=id=>S.posts.find(p=>p.id===id)||S.myPosts.find(p=>p.id===id);
function postCard(p,o={}){
 const mine=p.author==='me';const pid=JSON.stringify({id:p.id});
 const head=`<div class="post-h"><button class="who" data-go="${mine?'P03':'P01'}" data-p='${JSON.stringify({id:p.author})}'>${av(p.author,'sm')}<span class="tx"><b>${esc(pname(p.author))}</b><small>${F.rel(p.t)}${p.aud==='followers'?` · <span class="aud">${I.people}${L('подписчикам','followers')}</span>`:''}${o.community&&p.community?` · ${esc(T(COMMUNITIES[p.community].name))}`:''}</small></span></button><button class="ibtn ghost sm" data-act="postMenu" data-v="${p.id}" aria-label="${L('Ещё','More')}">${I.more}</button></div>`;
 let media='';
 if(p.type==='photo')media=`<div class="media">${plate(p.plate||'rose','image')}</div>`;
 if(p.type==='result'&&p.result)media=`<div class="testcard">${jarsHTML(p.result)}<div style="flex:1"><b>${L('Сдвиг за полгода','Shift in six months')}</b><div class="note">${L('Результат теста «Роли»','Roles quiz result')}</div></div></div>`;
 if(p.type==='poll'&&p.poll){const voted=p.vote!=null;const tot=p.poll.reduce((a,x)=>a+x[1],0)+(voted?1:0);media=`<div class="poll ${voted?'voted':''}">${p.poll.map((x,i)=>{const n=x[1]+(p.vote===i?1:0);const pc=Math.round(n/tot*100);return `<button data-act="vote" data-v="${p.id}" data-i="${i}" class="${p.vote===i?'mine':''}" ${voted?'disabled':''}><i style="width:${voted?pc:0}%"></i><span>${esc(T(x[0]))}</span>${voted?`<span>${pc}%</span>`:''}</button>`;}).join('')}<div class="note">${pl(tot,['голос','голоса','голосов'],['vote','votes'])}</div></div>`;}
 const tags=p.tags&&p.tags.length?`<div class="tags">${p.tags.map(t=>`<button data-go="F04" data-p='${JSON.stringify({id:t})}'>#${esc(topic(t))}</button>`).join('')}</div>`:'';
 const nC=p.comments.length;
 return `<article class="post" style="animation-delay:${(o.i||0)*40}ms">${head}<div class="body" ${o.detail?'':`data-go="F05" data-p='${pid}'`}><p>${esc(T(p.text))}</p>${media}</div>${tags}
 <div class="post-a"><button class="${p.liked?'on':''}" data-act="likePost" data-v="${p.id}" aria-pressed="${!!p.liked}" aria-label="${L('Нравится публикация','Like post')}">${p.liked?I.heartf:I.heart}<span>${p.likes+(p.liked?1:0)}</span></button>
 <button ${o.detail?'data-act="focusReply"':`data-go="F05" data-p='${pid}'`} aria-label="${L('Обсуждение','Replies')}">${I.chat}<span>${nC}</span></button>
 <button class="sp ${p.saved?'saved':''}" data-act="savePost" data-v="${p.id}" aria-pressed="${!!p.saved}" aria-label="${L('Сохранить','Save')}">${p.saved?I.bookmarkf:I.bookmark}</button>
 <button data-act="sharePost" data-v="${p.id}" aria-label="${L('Поделиться','Share')}">${I.share}</button></div></article>`;
}
function skeletonPosts(n=3){return Array.from({length:n},()=>`<div class="skp"><div class="row"><div class="sk" style="width:36px;height:36px;border-radius:12px"></div><div class="grow"><div class="sk" style="height:12px;width:40%"></div><div class="sk" style="height:10px;width:24%;margin-top:6px"></div></div></div><div class="sk" style="height:12px;margin-top:14px"></div><div class="sk" style="height:12px;margin-top:8px;width:80%"></div></div>`).join('');}
/** first visit of a list shows a short skeleton — loading never looks like emptiness */
function firstLoad(key,html,sk){if(QA.seen[key])return html;QA.seen[key]=1;setTimeout(()=>{if(main().dataset.screen&&$('#main .sk'))refresh();},650);return sk||skeletonPosts();}

/* ---------- events ---------- */
const EV=id=>EVENTS[id]||S.extraEvents[id];
const allEventIds=()=>[...Object.keys(EVENTS),...Object.keys(S.extraEvents)];
const myR=id=>S.rsvp[id]||{status:'none',app:'none'};
const isPast=id=>{const e=EV(id);return e.past||e.end<NOW;};
function evStatusPill(id){
 const e=EV(id),r=myR(id);
 if(e.cancelled)return `<span class="pill bad">${L('Отменено','Cancelled')}</span>`;
 if(e.organizer==='me')return `<span class="pill v">${L('Ты организатор','You organise')}</span>`;
 if(isPast(id))return r.status==='going'?`<span class="pill">${L('Ты был(а)','You went')}</span>`:'';
 if(r.app==='pending')return `<span class="pill wait">${L('Заявка на рассмотрении','Application pending')}</span>`;
 if(r.app==='approved')return `<span class="pill ok">${L('Заявка одобрена','Approved')}</span>`;
 if(r.app==='declined')return `<span class="pill bad">${L('Заявка отклонена','Declined')}</span>`;
 if(r.status==='going')return `<span class="pill ok">${L('Иду','Going')}</span>`;
 if(r.status==='interested')return `<span class="pill v">${L('Интересуюсь','Interested')}</span>`;
 return '';
}
function evWhen(id,full){const e=EV(id);const t=F.time(e.start,USER_TZ);const day=full?F.day(e.start):F.date(e.start);
 const diffTz=e.format==='online'&&e.tz!==USER_TZ;return `${day}, ${t}${diffTz?` · ${F.time(e.start,e.tz)} ${F.tzName(e.tz)}`:''}`;}
function eventCard(id,o={}){
 const e=EV(id);const st=evStatusPill(id);
 const fmt=e.format==='online'?`<span>${I.video}${L('Онлайн','Online')}</span>`:`<span>${I.pin}${esc(T(e.area)||city(e.city))}</span>`;
 const meta=`<div class="meta"><span>${I.clock}${F.time(e.start)}</span><span>${I.globe}${e.lang}</span><span>${I.ticket}${e.price?esc(T(e.price)):L('Бесплатно','Free')}</span></div>`;
 if(o.row)return `<button class="evc row" data-go="E03" data-p='${JSON.stringify({id})}'><div class="cv">${plate(e.plate,'cal')}<div class="date"><b>${F.dnum(e.start)}</b><small>${F.mon(e.start)}</small></div></div><div class="bd"><small>${e.format==='online'?L('Онлайн','Online'):esc(city(e.city))} · ${F.time(e.start)}</small><b>${esc(T(e.title))}</b>${st||`<span class="note">${esc(pname(e.organizer))}</span>`}</div></button>`;
 return `<button class="evc" data-go="E03" data-p='${JSON.stringify({id})}' style="animation-delay:${(o.i||0)*50}ms"><div class="cv">${plate(e.plate,'cal')}<div class="date"><b>${F.dnum(e.start)}</b><small>${F.mon(e.start)}</small></div><div class="fmt">${fmt}</div>${st?`<div class="my">${st}</div>`:''}</div>
 <div class="bd"><small>${esc(evType(e.type))} · ${esc(pname(e.organizer))}</small><b>${esc(T(e.title))}</b>${meta}</div></button>`;
}
const evType=t=>({workshop:L('Мастер-класс','Workshop'),talk:L('Обсуждение','Discussion'),party:L('Вечеринка','Party'),meetup:L('Встреча','Meetup'),edu:L('Обучение','Class')}[t]||t);

/* ---------- communities ---------- */
function commCard(id,o={}){
 const c=COMMUNITIES[id];const j=S.joined.has(id),pend=S.pendingJoin.has(id);
 const state=j?`<span class="pill ok">${I.check}${L('Ты участник','Member')}</span>`:pend?`<span class="pill wait">${L('Заявка отправлена','Request sent')}</span>`:c.privacy==='closed'?`<span class="pill">${I.lock}${L('По заявке','By request')}</span>`:'';
 return `<button class="cmc" data-go="C03" data-p='${JSON.stringify({id})}' style="animation-delay:${(o.i||0)*40}ms"><div class="cv" style="position:relative">${plate(c.plate,'users3')}</div><div class="tx"><b>${esc(T(c.name))}</b><small>${esc(T(c.desc))}</small><div class="meta"><span>${pl(C.members(id),['участник','участника','участников'],['member','members'])}</span><span>·</span><span>${c.city==='online'?L('онлайн','online'):esc(city(c.city))}</span>${state?` ${state}`:''}</div></div></button>`;
}

/* ---------- sheet builders reused across screens ---------- */
/** chip group: k = state key in obj; multi */
function chipGroup(items,selected,act,o={}){return `<div class="chips ${o.cls||''}">${items.map(([id,l])=>{const on=selected.includes(id);const ex=o.ex&&o.ex.includes(id);return `<button class="chip ${on?'on ck':''} ${ex?'ex':''}" data-act="${act}" data-v="${id}" ${o.k?`data-k="${o.k}"`:''} aria-pressed="${on}">${esc(l)}</button>`;}).join('')}</div>`;}
const optItems=g=>OPT[g].map(x=>[x[0],S.lang==='en'?x[2]:x[1]]);
const topicItems=ids=>(ids||Object.keys(TOPICS)).map(t=>[t,topic(t)]);

/* ---------- desktop context column ---------- */
window.CTX=function(tabId){
 const ev=allEventIds().filter(id=>!isPast(id)&&!EV(id).cancelled).sort((a,b)=>EV(a).start-EV(b).start).slice(0,3);
 const foot='';
 if(tabId==='feed')return `<h3>${L('Ближайшие события','Coming up')}</h3>${ev.map(id=>eventCard(id,{row:1})).join('<div style="height:8px"></div>')}<h3>${L('Сообщества для тебя','Communities for you')}</h3><div class="card list">${Object.keys(COMMUNITIES).filter(c=>!S.joined.has(c)).slice(0,3).map(c=>`<button class="mini" data-go="C03" data-id="${c}"><span class="av sm" style="position:relative">${plate(COMMUNITIES[c].plate)}</span><span class="grow"><b>${esc(T(COMMUNITIES[c].name))}</b><small>${pl(C.members(c),['участник','участника','участников'],['member','members'])}</small></span></button>`).join('')}</div>${foot}`;
 if(tabId==='people'){const li=S.likesIn.filter(l=>!isMatch(l.p)&&!l.passed);return `<h3>${L('Тебе симпатизируют','Liked you')}</h3>${li.length?`<div class="card list">${li.map(l=>`<button class="mini" data-go="P01" data-id="${l.p}">${av(l.p,'sm')}<span class="grow"><b>${esc(pname(l.p))}</b><small>${l.src==='profile'?L('из профиля','from profile'):L('из подборки','from discover')}</small></span></button>`).join('')}</div>`:`<p class="note">${L('Пока никого — это нормально.','No one yet — that’s fine.')}</p>`}<h3>${L('Запросы и доступы','Requests and sharing')}</h3>${accessSummary()}${foot}`;}
 if(tabId==='groups')return `<h3>${L('Мои сообщества','My communities')}</h3><div class="card list">${[...S.joined].length?[...S.joined].map(c=>`<button class="mini" data-go="C03" data-id="${c}"><span class="av sm" style="position:relative">${plate(COMMUNITIES[c].plate)}</span><span class="grow"><b>${esc(T(COMMUNITIES[c].name))}</b><small>${pl(S.discussions.filter(d=>d.c===c).length,['обсуждение','обсуждения','обсуждений'],['discussion','discussions'])}</small></span></button>`).join(''):`<p class="note" style="padding:10px 0">${L('Ты пока ни в одном','You haven’t joined any yet')}</p>`}</div><h3>${L('События сообществ','Community events')}</h3>${ev.filter(id=>EV(id).community).map(id=>eventCard(id,{row:1})).join('<div style="height:8px"></div>')}${foot}`;
 if(tabId==='chats')return `<h3>${L('Обновления','Updates')}</h3>${S.updates.length?S.updates.map(u=>updCard(u)).join(''):`<p class="note">${L('Объявления событий и сообществ появятся здесь.','Event and community announcements appear here.')}</p>`}<h3>${L('Как работают чаты','How chats work')}</h3><div class="card flat note">${L('Личный диалог открывается только после взаимной симпатии. Подписка, доступ к профилю или участие в событии чат не открывают.','A private chat opens only after a mutual like. Following, profile access or event attendance don’t open a chat.')}</div>${foot}`;
 if(tabId==='me')return `<h3>${L('Доступы','Access')}</h3><div class="card list">${linkRow({go:'P07',p:{tab:'in'},icon:'lock',tone:'v',title:L('Запросы ко мне','Requests to me'),badge:C.reqIn()||''})}${linkRow({go:'P07',p:{tab:'out'},icon:'send',title:L('Мои запросы','My requests'),val:String(S.reqOut.length)})}</div><h3>${L('Мои события','My events')}</h3>${myEventIds('going').slice(0,2).map(id=>eventCard(id,{row:1})).join('<div style="height:8px"></div>')||`<p class="note">${L('Пока нет','None yet')}</p>`}${foot}`;
 return foot;
};
function myEventIds(kind){
 return allEventIds().filter(id=>{const e=EV(id),r=myR(id),past=isPast(id);
  if(kind==='going')return !past&&!e.cancelled&&r.status==='going'&&e.organizer!=='me';
  if(kind==='interested')return !past&&!e.cancelled&&r.status==='interested';
  if(kind==='apps')return !past&&r.app&&r.app!=='none';
  if(kind==='organize')return e.organizer==='me';
  if(kind==='past')return past&&r.status==='going';
  return false;}).sort((a,b)=>EV(a).start-EV(b).start);
}
function updCard(u){const src=u.e?T(EV(u.e).title):T(COMMUNITIES[u.c].name);return `<button class="upd ${u.read?'':'unread'}" data-act="openUpdate" data-v="${u.id}"><span class="ico ${u.e?'l':'v'}">${u.e?I.cal:I.users3}</span><span class="tx"><b>${esc(src)}</b><p>${esc(T(u.text))}</p><small>${F.rel(u.t)}</small></span></button>`;}


function accessSummary(){const pending=S.reqOut.filter(x=>x.status==='pending'&&!isBlocked(x.p)).length;return `<div class="card list">${linkRow({go:'P07',p:{tab:'in'},icon:'lock',tone:'v',title:L('Запросы ко мне','Requests to me'),badge:C.reqIn()||'',sub:L('Выбирай разделы и срок','Choose sections and duration')})}${linkRow({go:'P07',p:{tab:'out'},icon:'clock',title:L('Мои запросы','My requests'),val:String(pending),sub:L('Ожидающие и история решений','Pending requests and decisions')})}${linkRow({go:'P07',p:{tab:'withme'},icon:'unlock',title:L('Открыто мне','Shared with me')})}</div>`;}
