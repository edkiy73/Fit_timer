/* ============ SHARED COMPONENTS ============ */
/** jars: list of {t,lv,limit,vis} or [t,lv]. V9: one vessel, one colour; the fill is the level 1–10.
 *  «обсуждаемо» — dashed outline, «табу» — crossed out. o.more adds a «+N» tile, o.was shows the previous answer. */
function jarsHTML(list,o={}){
 const items=list.map(x=>Array.isArray(x)?{t:x[0],lv:x[1]}:x);
 return `<div class="jars ${o.pre?'pre':''} ${o.cls||''}">${items.map((j,i)=>{
  const tag=o.act?'button':'div';const attrs=o.act?`data-act="${o.act}" data-v="${j.t}" ${o.who?`data-who="${o.who}"`:''} aria-label="${esc(topic(j.t))}: ${esc(jarWord(j))}"`:'';
  const was=o.was&&o.was[j.t]!=null?`<small class="was">${L('было','was')} ${o.was[j.t]==='hard'?L('табу','taboo'):o.was[j.t]==='discuss'?L('обсужд.','negot.'):o.was[j.t]}</small>`:'';
  const vis=o.vis&&j.vis!=='public'?`<span class="jvis">${j.vis==='granted'?I.key:I.eyeoff}</span>`:'';
  if(j.limit)return `<${tag} class="jar ${j.limit==='hard'?'taboo':'discuss'}" ${attrs}><span class="vessel"><span class="jm">${j.limit==='hard'?I.block:I.chat}</span>${vis}</span><span class="jn">${esc(topic(j.t))}</span><span class="jw">${j.limit==='hard'?L('табу','taboo'):L('обсуждаемо','negotiable')}</span>${was}</${tag}>`;
  return `<${tag} class="jar" ${attrs} style="--v:${j.lv};--d:${(i%6)*.05}s"><span class="vessel"><span class="fill"></span><b class="lv">${j.lv}</b>${vis}</span><span class="jn">${esc(topic(j.t))}</span><span class="jw">${esc(LV_WORD(j.lv).toLowerCase())}</span>${was}</${tag}>`;}).join('')}${o.more?`<button class="jar more" data-act="${o.more.act}" data-v="${o.more.v}"><span class="vessel"><b>+${o.more.n}</b></span><span class="jn">${L('Все','All')}</span></button>`:''}${o.add?`<button class="jar add" data-act="${o.add}"><span class="vessel">${I.plus}</span><span class="jn">${L('Добавить','Add')}</span></button>`:''}</div>`;
}
const pubJars=id=>id==='me'?S.me.jars.filter(j=>j.vis==='public'&&j.limit!=='hard'):(person(id)?.jars||[]).map(x=>Array.isArray(x)?{t:x[0],lv:x[1]}:x).filter(j=>(!j.vis||j.vis==='public')&&j.limit!=='hard');
const fillJars=()=>setTimeout(()=>$$('.jars.pre').forEach(j=>j.classList.remove('pre')),90);
function venn(n,o={}){return `<div class="venn ${o.mini?'mini':''} ${o.pre?'pre':''}" ${o.id?`id="${o.id}"`:''}><i></i><i></i><b>${n}${o.mini?'':`<small>${pl(n,['общая тема','общие темы','общих тем'],['shared topic','shared topics'],true)}</small>`}</b></div>`;}
const playVenn=()=>setTimeout(()=>$$('.venn.pre').forEach(v=>v.classList.remove('pre')),120);

/** Shared interests: only data both people made visible. Categories, no score. */
function shared(id){
 const p=person(id);if(!p)return{match:[],complement:[],discuss:[],few:true};
 const mine=S.me.jars.filter(j=>j.vis==='public'&&!j.limit);
 const theirs=(p.jars||[]).map(j=>({t:j[0],lv:j[1]}));
 const match=mine.filter(j=>j.lv>=6&&theirs.some(x=>x.t===j.t&&x.lv>=6)).map(j=>j.t);
 const complement=[];const discuss=[];
 const r1=publicField(S.me,'role'),r2=p.role;
 if((r1==='lead'&&r2==='recv')||(r1==='recv'&&r2==='lead'))complement.push(L(`Твоя ${opt('role',r1)} роль и ${opt('role',r2)} у ${pname(id)} дополняют друг друга`,`Your ${opt('role',r1)} role and ${pname(id)}’s ${opt('role',r2)} role complement each other`));
 else if(r2==='switch'||r1==='switch')complement.push(L(`${pname(id)} — свитч: роли можно договорить вместе`,`${pname(id)} is a switch: roles are open to agree on`));
 mine.forEach(j=>{const x=theirs.find(y=>y.t===j.t);if(x&&Math.abs(x.lv-j.lv)>=4)discuss.push(L(`${topic(j.t)}: у тебя ${j.lv}/10, у ${pname(id)} ${x.lv}/10`,`${topic(j.t)}: you ${j.lv}/10, ${pname(id)} ${x.lv}/10`));
  if(false)discuss.push(L(`${topic(j.t)}: ты хочешь попробовать, для ${pname(id)} это сильный интерес`,`${topic(j.t)}: you want to try, for ${pname(id)} it’s a strong interest`));});
 const mf=fmtList(publicField(S.me,'format')),tf=fmtList(p.format);if(mf.length&&tf.length&&mf.includes('mono')!==tf.includes('mono'))discuss.push(L(`Формат отношений: ${fmtText(mf,2)} и ${fmtText(tf,2)}`,`Relationship format: ${fmtText(mf,2)} vs ${fmtText(tf,2)}`));else{const both=mf.filter(x=>tf.includes(x));if(both.length)complement.push(L(`Совпадает формат: ${fmtText(both,2)}`,`Same format: ${fmtText(both,2)}`));}
 return{match,complement,discuss:[...new Set(discuss)],few:mine.length<2||theirs.length<2};
}
function sharedSummary(id){const s=shared(id);if(s.few)return L('Пока мало общего контекста','Not much shared context yet');
 const parts=[];if(s.match.length)parts.push(pl(s.match.length,['общая тема','общие темы','общих тем'],['shared topic','shared topics']));if(s.complement.length)parts.push(L('роли дополняют','roles complement'));return parts.join(', ')||L('Есть что обсудить','Something to talk about');}

/* ---------- people ---------- */
function whoLine(id){const p=person(id);if(!p)return '';const g=(p.gender||[]).map(x=>opt('gender',x)).join(', ');const o=(p.orient||[]).map(x=>opt('orient',x)).join(', ');return [p.pair?T(p.pairNote):opt('pron',p.pron),[g,o].filter(Boolean).join(', ')].filter(Boolean).join(' · ');}
function placeLine(id){const p=person(id);if(!p)return '';const km=S.me.location?.mode==='nearby'?nearbyDistance(id):null;return [city(p.city),km!==null?L(`около ${Math.max(5,km)} км`,`about ${Math.max(5,km)} km`):''].filter(Boolean).join(' · ');}
function presence(id){const p=person(id);if(!p)return '';return p.online?L('сейчас в сети','online now'):T(p.last)||'';}
function personRow(id,o={}){
 return `<button class="li" data-go="P01" data-p='${JSON.stringify({id})}'>${av(id,o.round?'round':'')}<span class="tx"><b>${esc(pname(id))}${person(id).dating&&person(id).age?`, ${person(id).age}`:''}</b><small>${o.sub||esc(whoLine(id))}</small></span>${o.right||I.chev}</button>`;
}

/* ---------- posts ---------- */
const allPosts=()=>[...S.myPosts.filter(p=>p.status==='published'),...S.posts];
const postById=id=>S.posts.find(p=>p.id===id)||S.myPosts.find(p=>p.id===id);
/** V7: one post type with optional attachments — photos/video (≤6), a poll (2–10 options) or a quiz result */
const postMedia=p=>p.media&&p.media.length?p.media:p.type==='photo'?[{type:'plate',key:p.plate||'rose'}]:[];
const postKinds=p=>{const k=[];if(postMedia(p).length)k.push('photo');if(p.poll)k.push('poll');if(p.result)k.push('result');if(!k.length)k.push('text');return k;};
function pollHTML(p,o={}){const voted=p.vote!=null;const opts=p.poll;const tot=opts.reduce((a,x)=>a+x[1],0)+(voted?1:0);const live=!o.preview;
 return `<div class="poll ${voted?'voted':''}" role="group" aria-label="${L('Опрос','Poll')}">${opts.map((x,i)=>{const n=x[1]+(p.vote===i?1:0);const pc=tot?Math.round(n/tot*100):0;return `<button ${live?`data-act="vote" data-v="${p.id}" data-i="${i}"`:'tabindex="-1"'} class="${p.vote===i?'mine':''}" aria-pressed="${p.vote===i}"><i style="width:${voted?pc:0}%"></i><span class="po">${p.vote===i?ic('check',15):''}${esc(T(x[0]))}</span>${voted?`<span class="pc">${pc}%</span>`:''}</button>`;}).join('')}
 <div class="poll-f"><span class="note">${pl(tot,['голос','голоса','голосов'],['vote','votes'])}${voted?` · ${L('голос можно изменить','you can change your vote')}`:''}</span>${voted&&live?`<button class="btn text auto" data-act="unvote" data-v="${p.id}">${L('Отменить голос','Withdraw vote')}</button>`:''}</div></div>`;}
function postMediaHTML(p,o={}){let h='';const m=postMedia(p);if(m.length)h+=mediaGrid(m,{id:p.id});
 if(p.poll)h+=pollHTML(p,o);
 if(p.result)h+=`<div class="testcard">${jarsHTML(p.result,{act:o.preview?'':'topic',who:p.author})}<div style="flex:1"><b>${L('Результат теста','Quiz result')}</b><div class="note">${L('Только выбранные темы, без ответов','Only chosen topics, no answers')}</div></div></div>`;
 return h;}
function postCard(p,o={}){
 const mine=p.author==='me';const pid=JSON.stringify({id:p.id});
 const head=`<div class="post-h"><button class="who" data-go="${mine?'P03':'P01'}" data-p='${JSON.stringify({id:p.author})}'>${av(p.author,'sm')}<span class="tx"><b>${esc(pname(p.author))}</b><small>${F.rel(p.t)}${p.aud==='followers'?` · <span class="aud">${I.people}${L('подписчикам','followers')}</span>`:''}${o.community&&p.community?` · ${esc(T(COMMUNITIES[p.community].name))}`:''}</small></span></button><button class="ibtn ghost sm" data-act="postMenu" data-v="${p.id}" aria-label="${L('Ещё','More')}">${I.more}</button></div>`;
 const media=postMediaHTML(p,o);
 const tags=p.tags&&p.tags.length?`<div class="tags">${p.tags.map(t=>`<button data-go="F04" data-p='${JSON.stringify({id:t})}'>#${esc(topic(t))}</button>`).join('')}</div>`:'';
 const nC=p.comments.length;
 return `<article class="post" style="animation-delay:${(o.i||0)*40}ms">${head}<div class="body" ${o.detail?'':`data-go="F05" data-p='${pid}'`}>${T(p.text)?`<p>${esc(T(p.text))}</p>`:''}${media}</div>${tags}
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
 if(isPast(id))return eventAttendanceConfirmed(id)?`<span class="pill">${L('Ты был(а)','You went')}</span>`:'';
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
 if(o.row)return `<button class="evc row" data-go="E03" data-p='${JSON.stringify({id})}'><div class="cv">${evCover(e,'cal')}<div class="date"><b>${F.dnum(e.start)}</b><small>${F.mon(e.start)}</small></div></div><div class="bd"><small>${e.format==='online'?L('Онлайн','Online'):esc(city(e.city))} · ${F.time(e.start)}</small><b>${esc(T(e.title))}</b>${st||`<span class="note">${esc(pname(e.organizer))}</span>`}</div></button>`;
 return `<button class="evc" data-go="E03" data-p='${JSON.stringify({id})}' style="animation-delay:${(o.i||0)*50}ms"><div class="cv">${evCover(e,'cal')}<div class="date"><b>${F.dnum(e.start)}</b><small>${F.mon(e.start)}</small></div><div class="fmt">${fmt}</div>${st?`<div class="my">${st}</div>`:''}</div>
 <div class="bd"><small>${esc(evType(e.type))} · ${esc(pname(e.organizer))}</small><b>${esc(T(e.title))}</b>${meta}</div></button>`;
}
const evCover=(e,icon)=>e.cover?`<img class="evimg" src="${esc(e.cover)}" alt="" draggable="false">`:plate(e.plate,icon);
const evType=t=>({workshop:L('Мастер-класс','Workshop'),talk:L('Обсуждение','Discussion'),party:L('Вечеринка','Party'),meetup:L('Встреча','Meetup'),edu:L('Обучение','Class')}[t]||t);

/* ---------- communities ---------- */
function commCard(id,o={}){
 const c=COMMUNITIES[id];const j=S.joined.has(id),pend=S.pendingJoin.has(id);
 const state=ownsCommunity(id)?`<span class="pill ok">${I.gear}${L('Ты ведёшь','You host')}</span>`:j?`<span class="pill ok">${I.check}${L('Ты участник','Member')}</span>`:pend?`<span class="pill wait">${L('Заявка отправлена','Request sent')}</span>`:c.privacy==='closed'?`<span class="pill">${I.lock}${L('По заявке','By request')}</span>`:'';
 return `<button class="cmc" data-go="C03" data-p='${JSON.stringify({id})}' style="animation-delay:${(o.i||0)*40}ms"><div class="cv" style="position:relative">${evCover(c,'users3')}</div><div class="tx"><b>${esc(T(c.name))}</b><small>${esc(T(c.desc))}</small><div class="meta"><span>${pl(C.members(id),['участник','участника','участников'],['member','members'])}</span><span>·</span><span>${c.city==='online'?L('онлайн','online'):esc(city(c.city))}</span>${state?` ${state}`:''}</div></div></button>`;
}

/* ---------- sheet builders reused across screens ---------- */
/* ---------- V7 chips: inline chips + full-screen picker with search (forms) or fold/expand (filter screens) ---------- */
const chipTxt=(id,l)=>{const en=Object.values(OPT).flat().find(x=>x[0]===id);return esc((l+' '+id+' '+(TOPICS[id]?.en||'')+' '+(TOPICS[id]?.ru||'')+' '+(en?en[1]+' '+en[2]:'')).toLowerCase());};
function chipBtn(id,l,on,act,o={},extra=''){const ex=o.ex?.includes(id);return `<button class="chip ${on?'on':''} ${ex?'ex':''} ${extra}" data-act="${act}" data-v="${esc(id)}" ${o.k?`data-k="${o.k}"`:''} ${o.key?`data-key="${o.key}"`:''} aria-pressed="${on}" data-txt="${chipTxt(id,l)}">${esc(l)}</button>`;}
/** items: [[id,label]]; selected: ids. o: {k, title, groups:[[title,ids]], max, ex, limit, fold, all} */
function chipGroup(items,selected,act,o={}){
 const key=act+'|'+(o.k||'');const sel=new Set((selected||[]).filter(x=>x!=null&&x!==''));const lim=o.limit??8;
 S.ui.chipReg=S.ui.chipReg||{};S.ui.chipReg[key]={items,sel:[...sel],act,k:o.k,title:o.title,groups:o.groups,ex:o.ex,max:o.max};
 if(o.all||items.length<=lim+2)return `<div class="chips">${items.map(([id,l])=>chipBtn(id,l,sel.has(id),act,o)).join('')}</div>`;
 if(o.fold){const open=S.ui.unfold?.[key];const keep=new Set([...sel,...items.slice(0,lim).map(x=>x[0])]);const hid=items.filter(([id])=>!keep.has(id)).length;
  return `<div class="chips ${open?'':'folded'}" data-fold="${key}">${items.map(([id,l])=>chipBtn(id,l,sel.has(id),act,o,keep.has(id)?'':'fx')).join('')}<button class="chip more" data-act="chipFold" data-v="${key}" data-n="${hid}">${open?L('Свернуть','Show less'):L(`Ещё ${hid}`,`${hid} more`)}</button></div>`;}
 // keep the original order and every chip already on screen: selecting never moves chips around
 S.ui.chipShown=S.ui.chipShown||{};const shown=S.ui.chipShown[key]=new Set([...(S.ui.chipShown[key]||[]),...items.slice(0,lim).map(x=>x[0]),...sel]);
 const first=items.filter(([id])=>shown.has(id));
 return `<div class="chips">${first.map(([id,l])=>chipBtn(id,l,sel.has(id),act,o)).join('')}<button class="chip more" data-act="chipAll" data-v="${key}">${ic('search',14)}${L('Все варианты','All options')} · ${items.length}</button></div>`;
}
const chipPicker=o=>chipGroup(o.items,o.sel,o.act,{title:o.title,max:o.max,groups:o.cats?topicGroups(o.items.map(x=>x[0])):o.groups});
const optGroups=g=>{const b=OPT_BASE[g]||8;const ids=OPT[g].map(x=>x[0]);return [[L('Популярное','Popular'),ids.slice(0,b)],[L('Ещё варианты','More options'),ids.slice(b)]];};
/** Shared identity choices: same IDs, multiplicity and catalog in onboarding/profile. */
const IDENTITY_KEYS=['gender','orient','format','role'];
const identityFields=()=>[
 ['gender',L('Гендер','Gender'),L('Можно выбрать несколько вариантов.','You can choose more than one.')],
 ['orient',L('Ориентация','Orientation'),L('Выбери определения, которые тебе подходят.','Choose the definitions that fit you.')],
 ['format',L('Формат отношений','Relationship format'),L('Какие форматы подходят тебе сейчас?','Which relationship styles fit you now?')],
 ['role',L('Роль','Role'),L('Один вариант. Это не согласие на какие-либо практики.','One option. This is not consent to any practice.')]
];
const identityDraft=m=>({gender:[...(m.gender||[])],orient:[...(m.orient||[])],format:[...fmtList(m.format)],role:m.role||null});
function identityChoices(k,value,act){const title=identityFields().find(x=>x[0]===k)[1];return chipGroup(optItems(k),k==='role'?[value]:value,act,{k,title,groups:optGroups(k),limit:{gender:4,orient:6,format:6,role:3}[k]});}
function toggleIdentityValue(value,k,v){if(k==='role')return value===v?null:v;const arr=[...(value||[])],i=arr.indexOf(v);i<0?arr.push(v):arr.splice(i,1);return arr;}

const topicGroups=ids=>{ids=ids||Object.keys(TOPICS);return CATS.map(c=>[T(c),ids.filter(t=>TOPICS[t]?.cat===c.id)]).filter(g=>g[1].length);};
ACT.chipFold=a=>{const key=a.dataset.v;S.ui.unfold=S.ui.unfold||{};const box=a.closest('.chips');const open=box.classList.toggle('folded')===false;S.ui.unfold[key]=open;a.textContent=open?L('Свернуть','Show less'):L(`Ещё ${a.dataset.n}`,`${a.dataset.n} more`);};
ACT.chipAll=a=>openChipPicker(a.dataset.v);
function openChipPicker(key){S.ui.pickKey=key;sheet(()=>{const r=S.ui.chipReg[key];const sel=new Set(r.sel);const groups=r.groups||[[L('Все варианты','All options'),r.items.map(x=>x[0])]];const label=id=>r.items.find(x=>x[0]===id)?.[1]||id;
 return{title:r.title||L('Выбор','Choose'),search:true,searchPh:L('Найти вариант','Find an option'),head:`<span class="pill ${sel.size?'v':''}">${r.max?`${sel.size}/${r.max}`:sel.size}</span>`,
 body:groups.map(([t,ids])=>`<section class="fsec" data-t="${esc(t.toLowerCase())}"><div class="sec">${esc(t)}</div><div class="chips">${ids.filter(id=>r.items.some(x=>x[0]===id)).map(id=>chipBtn(id,label(id),sel.has(id),'chipPick',{ex:r.ex,key})).join('')}</div></section>`).join('')+`<p class="note sh-empty" hidden>${L('Такого варианта нет. Попробуй другое слово — ищем по-русски и по-английски.','No such option. Try another word — we search in Russian and English.')}</p>`,
 foot:`<div class="row g8">${sel.size?`<button class="btn soft" style="flex:0 0 auto;width:auto" data-act="chipClear" data-v="${key}">${L('Сбросить','Clear')}</button>`:''}<button class="btn primary" data-act="closeSheet">${sel.size?L(`Готово · ${sel.size}`,`Done · ${sel.size}`):L('Готово','Done')}</button></div>`};},{full:true});}
ACT.chipPick=a=>{const r=S.ui.chipReg[a.dataset.key];const fn=ACT[r.act];if(!fn)return;fn({dataset:{v:a.dataset.v,k:r.k||''},classList:{contains:()=>false,add(){},remove(){}},closest:()=>null},null);resheet();};
ACT.chipClear=a=>{const r=S.ui.chipReg[a.dataset.v];for(const v of [...r.sel])ACT[r.act]({dataset:{v,k:r.k||''},classList:{contains:()=>false,add(){},remove(){}},closest:()=>null},null);resheet();};
/** search across chip sections (.fsec) inside a container: sheets and full-screen filter pages */
function filterSections(root,q){q=(q||'').toLowerCase().trim();let total=0;
 for(const sec of root.querySelectorAll('.fsec')){const titleHit=q&&sec.dataset.t?.includes(q);let n=0;sec.classList.toggle('searching',!!q);
  for(const el of sec.querySelectorAll('[data-txt]')){const hit=!q||titleHit||el.dataset.txt.includes(q);el.hidden=!hit;if(hit)n++;}
  sec.hidden=!!q&&!n&&!titleHit;total+=n;}
 const em=root.querySelector('.sh-empty,.pg-empty');if(em)em.hidden=!q||!!total;}
IN.shq=el=>{S.ui.shq=el.value;filterSections($('#sheet .sh-b'),el.value);};
IN.pgq=el=>{cur().fq=el.value;filterSections($('#main .view'),el.value);};
const pageSearch=(ph)=>`<div class="fsearch"><div class="inwrap">${I.search}<input class="inp" type="search" data-in="pgq" value="${esc(cur().fq||'')}" placeholder="${esc(ph)}" aria-label="${esc(ph)}" enterkeyhint="search"></div></div>`;
const fsec=(title,html,o={})=>`<section class="fsec" data-t="${esc(String(title).replace(/<[^>]+>/g,'').toLowerCase())}"><div class="sec">${title}${o.right||''}</div>${html}</section>`;
const localMediaURLs=new Set();
function clearLocalMedia(){for(const url of localMediaURLs)URL.revokeObjectURL(url);localMediaURLs.clear();}
function pickLocalMedia(accept,multiple=true){return new Promise(resolve=>{
 const input=document.createElement('input');input.type='file';input.accept=accept;input.multiple=multiple;input.hidden=true;document.body.append(input);
 const finish=files=>{input.remove();resolve(files);};input.addEventListener('cancel',()=>finish([]),{once:true});
 input.addEventListener('change',()=>{const chosen=[];for(const file of input.files){const video=file.type.startsWith('video/'),image=file.type.startsWith('image/');
  if(!video&&!image||accept==='image/*'&&!image){toast(L('Выбери фото или видео поддерживаемого формата','Choose a supported photo or video'),{type:'warn'});continue;}
  if(file.size>(video?100:20)*1024*1024){toast(L('Фото — до 20 МБ, видео — до 100 МБ','Photos up to 20 MB, videos up to 100 MB'),{type:'warn'});continue;}
  const url=URL.createObjectURL(file);localMediaURLs.add(url);chosen.push({url,name:file.name,type:video?'video':'image',size:file.size});if(chosen.length>=6)break;
 }finish(chosen);},{once:true});input.click();
});}
function mediaPreviews(files,removeAct){return files?.length?`<div class="attachment-preview">${files.map((f,i)=>`<figure>${f.type==='video'?`<video controls playsinline preload="metadata" src="${esc(f.url)}"></video>`:`<img src="${esc(f.url)}" alt="${esc(f.name)}" loading="lazy">`}<figcaption>${esc(f.name)}</figcaption>${removeAct?`<button class="btn soft auto" data-act="${removeAct}" data-v="${i}">${L('Убрать','Remove')}</button>`:''}</figure>`).join('')}</div>`:'';}
const optItems=g=>OPT[g].map(x=>[x[0],S.lang==='en'?x[2]:x[1]]);

const topicItems=ids=>(ids||Object.keys(TOPICS)).map(t=>[t,topic(t)]);

/* ---------- desktop context column ---------- */
window.CTX=function(tabId){
 const ev=allEventIds().filter(id=>!isPast(id)&&!EV(id).cancelled).sort((a,b)=>EV(a).start-EV(b).start).slice(0,3);
 const foot='';const groups=[...new Set([...S.joined,...myComms()])];
 if(tabId==='feed')return `<h3>${L('Ближайшие события','Coming up')}</h3>${ev.map(id=>eventCard(id,{row:1})).join('<div style="height:8px"></div>')}<h3>${L('Сообщества для тебя','Communities for you')}</h3><div class="card list">${Object.keys(COMMUNITIES).filter(c=>!S.joined.has(c)&&!ownsCommunity(c)&&!COMMUNITIES[c].hidden&&COMMUNITIES[c].status!=='review').slice(0,3).map(c=>`<button class="mini" data-go="C03" data-id="${c}"><span class="av sm" style="position:relative">${plate(COMMUNITIES[c].plate)}</span><span class="grow"><b>${esc(T(COMMUNITIES[c].name))}</b><small>${pl(C.members(c),['участник','участника','участников'],['member','members'])}</small></span></button>`).join('')}</div>${foot}`;
 if(tabId==='people'){const li=S.likesIn.filter(l=>!isMatch(l.p)&&!l.passed);return `<h3>${L('Тебе симпатизируют','Liked you')}</h3>${li.length?`<div class="card list">${li.map(l=>`<button class="mini" data-go="P01" data-id="${l.p}">${av(l.p,'sm')}<span class="grow"><b>${esc(pname(l.p))}</b><small>${l.src==='profile'?L('из профиля','from profile'):L('из подборки','from discover')}</small></span></button>`).join('')}</div>`:`<p class="note">${L('Пока никого — это нормально.','No one yet — that’s fine.')}</p>`}<h3>${L('Запросы и доступы','Requests and sharing')}</h3>${accessSummary()}${foot}`;}
 if(tabId==='groups')return `<h3>${L('Мои сообщества','My communities')}</h3><div class="card list">${groups.length?groups.map(c=>`<button class="mini" data-go="C03" data-id="${c}"><span class="av sm" style="position:relative">${plate(COMMUNITIES[c].plate)}</span><span class="grow"><b>${esc(T(COMMUNITIES[c].name))}</b><small>${pl(S.discussions.filter(d=>d.c===c).length,['обсуждение','обсуждения','обсуждений'],['discussion','discussions'])}</small></span></button>`).join(''):`<p class="note" style="padding:10px 0">${L('Ты пока ни в одном','You haven’t joined any yet')}</p>`}</div><h3>${L('События сообществ','Community events')}</h3>${ev.filter(id=>EV(id).community).map(id=>eventCard(id,{row:1})).join('<div style="height:8px"></div>')}${foot}`;
 if(tabId==='chats')return `<h3>${L('Обновления','Updates')}</h3>${S.updates.length?S.updates.map(u=>updCard(u)).join(''):`<p class="note">${L('Объявления событий и сообществ появятся здесь.','Event and community announcements appear here.')}</p>`}<h3>${L('Как работают чаты','How chats work')}</h3><div class="card flat note">${L('Личный диалог открывается только после взаимной симпатии. Подписка, доступ к профилю или участие в событии чат не открывают.','A private chat opens only after a mutual like. Following, profile access or event attendance don’t open a chat.')}</div>${foot}`;
 if(tabId==='me')return `<h3>${L('Доступы','Access')}</h3><div class="card list">${linkRow({go:'P07',p:{tab:'in'},icon:'key',tone:'v',title:L('Запросы ко мне','Requests to me'),badge:C.reqIn()||''})}${linkRow({go:'P07',p:{tab:'out'},icon:'send',title:L('Мои запросы','My requests'),val:String(S.reqOut.length)})}</div><h3>${L('Мои события','My events')}</h3>${myEventIds('going').slice(0,2).map(id=>eventCard(id,{row:1})).join('<div style="height:8px"></div>')||`<p class="note">${L('Пока нет','None yet')}</p>`}${foot}`;
 return foot;
};
function eventAttendanceConfirmed(id){const e=EV(id),r=myR(id);return r.status==='going'&&(!e.approval||r.app==='approved');}
function myEventIds(kind){
 return allEventIds().filter(id=>{const e=EV(id),r=myR(id),past=isPast(id),own=e.organizer==='me';
  const app=e.approval&&['pending','approved','declined'].includes(r.app);
  if(kind==='organize')return own;
  if(own)return false;
  if(kind==='cancelled')return !!e.cancelled&&(app||['going','interested'].includes(r.status));
  if(e.cancelled)return false;
  if(kind==='past')return past&&eventAttendanceConfirmed(id);
  if(past)return false;
  if(kind==='going')return eventAttendanceConfirmed(id);
  if(kind==='apps')return app&&!eventAttendanceConfirmed(id);
  if(kind==='interested')return r.status==='interested'&&!app;
  return false;}).sort((a,b)=>EV(a).start-EV(b).start);
}
const myUpcomingEventIds=()=>[...new Set(['going','apps','interested','organize'].flatMap(myEventIds))].filter(id=>!isPast(id)&&!EV(id).cancelled);

function updCard(u){const src=u.e?T(EV(u.e).title):T(COMMUNITIES[u.c].name);return `<button class="upd ${u.read?'':'unread'}" data-act="openUpdate" data-v="${u.id}"><span class="ico ${u.e?'l':'v'}">${u.e?I.cal:I.users3}</span><span class="tx"><b>${esc(src)}</b><p>${esc(T(u.text))}</p><small>${F.rel(u.t)}</small></span></button>`;}


function accessSummary(){const pending=S.reqOut.filter(x=>x.status==='pending'&&!isBlocked(x.p)).length;return `<div class="card list">${linkRow({go:'P07',p:{tab:'in'},icon:'lock',tone:'v',title:L('Запросы ко мне','Requests to me'),badge:C.reqIn()||'',sub:L('Выбирай разделы и срок','Choose sections and duration')})}${linkRow({go:'P07',p:{tab:'out'},icon:'clock',title:L('Мои запросы','My requests'),val:String(pending),sub:L('Ожидающие и история решений','Pending requests and decisions')})}${linkRow({go:'P07',p:{tab:'withme'},icon:'unlock',title:L('Открыто мне','Shared with me')})}</div>`;}

/* ---------- V8 filters, Feeld-style: a tidy list «category → current choice»; a row opens its options with search ---------- */
const sumOf=(items,sel,none)=>{const l=items.filter(([id])=>sel.includes(id)).map(x=>x[1]);return l.length?(l.slice(0,2).join(', ')+(l.length>2?` +${l.length-2}`:'')):(none||L('Любые','Any'));};
function filterSheet(cfg){S.ui.fcfg=cfg;S.ui.fsub=null;const start=JSON.stringify(cfg.draft());
 sheet(()=>{const c=S.ui.fcfg;const sub=S.ui.fsub&&c.rows.find(r=>r.k===S.ui.fsub);
  if(sub)return{title:sub.label,lead:`<button class="ibtn ghost sm" data-act="fBack" aria-label="${L('К фильтрам','Back to filters')}">${I.back}</button>`,search:!!sub.search,searchPh:L('Найти вариант','Find an option'),body:`${sub.body()}<p class="note sh-empty" hidden>${L('Ничего не нашлось','Nothing found')}</p>`,foot:`<button class="btn primary" data-act="fBack">${L('Готово','Done')}</button>`};
  const n=c.count();return{title:c.title,head:`<button class="btn text auto" data-act="fReset">${L('Сбросить','Reset')}</button>`,
   body:`${c.top?c.top():''}<div class="card list frows">${c.rows.map(r=>`<button class="li frow" data-act="fOpen" data-v="${r.k}"><span class="tx"><b>${r.label}</b><small class="${r.on()?'on':''}">${esc(r.summary())}</small></span>${I.chev}</button>`).join('')}</div>${c.note?`<p class="grp-n">${c.note}</p>`:''}${!n?`<p class="note mt12">${L('С такими фильтрами пока ничего нет. Можно применить их или изменить выбор.','Nothing matches yet. You can apply these filters or change your choices.')}</p>`:''}`,
   foot:`<button class="btn primary" data-act="fApply">${n?c.applyLabel(n):L('Применить фильтры','Apply filters')}</button>`};},
 {full:true,guard:()=>JSON.stringify(S.ui.fcfg.draft())!==start,back:()=>{if(S.ui.fsub){S.ui.fsub=null;resheet();return true;}return false;}});}
ACT.fOpen=a=>{S.ui.fsub=a.dataset.v;S.ui.shq='';resheet();$('#sheet .sh-b')&&($('#sheet .sh-b').scrollTop=0);};
ACT.fBack=()=>{S.ui.fsub=null;S.ui.shq='';resheet();};
ACT.fReset=()=>{S.ui.fcfg.reset();resheet();};
ACT.fApply=()=>{S.ui.fcfg.apply();closeSheet();refresh();toast(L('Фильтры применены','Filters applied'),{type:'ok'});};
/** a single option list for one filter category: chips grouped, searchable */
const fChips=(items,sel,act,o={})=>o.groups?o.groups.map(([t,ids])=>fsec(t,chipGroup(items.filter(([id])=>ids.includes(id)),sel,act,{...o,all:1,k:o.k}))).join(''):fsec(o.title||'',chipGroup(items,sel,act,{...o,all:1}));

