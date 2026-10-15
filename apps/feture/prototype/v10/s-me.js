/* ============ X: ME — V9. Claude, 14.10.2026 ============
   A jar is one answer about one topic: level 1–10, «обсуждаемо» or «табу». The same answer control is used in quizzes and in the jar sheet.
   Profiles show a short shelf of jars (top by level) — the full list opens on demand. */
const VIS=()=>({public:[I.globe,L('всем','everyone'),'ok'],granted:[I.key,L('по доступу','by access'),'v'],only:[I.eyeoff,L('только я','only me'),'']});
function nextStep(){const m=S.me;if(!m.jars.length)return[L('Добавь темы, которые тебе интересны','Add topics you are interested in'),'topic',null];if(requiresDiscoveryPhoto(m)&&!m.photo)return[L('Добавь фото для показа в подборке','Add a photo to appear in Discover'),'P02',null];return['','',null];}

const sortJars=list=>{list=list.map(normJar);return [...list.filter(j=>!j.limit).sort((a,b)=>b.lv-a.lv),...list.filter(j=>j.limit==='discuss'),...list.filter(j=>j.limit==='hard')];};
const myJars=()=>sortJars(S.me.jars);
const jv=j=>j?(j.limit||j.lv):null;
const jarFrom=(t,v,base={})=>{const j=typeof v==='number'?{...base,t,lv:v,limit:undefined}:{...base,t,lv:0,limit:v};const d=typeof v==='number'&&hasDir(t)?normDir(base.dir):undefined;if(d)j.dir=d;else delete j.dir;return j;};
/* the one answer control: level 1–10 + «обсуждаемо» + «табу» */
function answerHTML(v,act,o={}){const n=typeof v==='number'?v:null;const dir=normDir(o.dir)||[];const all=dir.length===DIRS.length;
 return `<div class="ans"><div class="ans-scale" role="radiogroup" aria-label="${L('Уровень от 1 до 10','Level 1 to 10')}">${[1,2,3,4,5,6,7,8,9,10].map(k=>`<button class="${n&&k<=n?'fill':''} ${n===k?'on':''}" data-act="${act}" data-v="${k}" role="radio" aria-checked="${n===k}">${k}</button>`).join('')}</div>
 <div class="ans-l"><span>${L('немного','a little')}</span><span>${L('очень','a lot')}</span></div>
 <div class="ans-marks"><button class="ans-m ${v==='discuss'?'on':''}" data-act="${act}" data-v="discuss" aria-pressed="${v==='discuss'}">${I.chat}<span>${L('Обсуждаемо','Negotiable')}</span></button><button class="ans-m taboo ${v==='hard'?'on':''}" data-act="${act}" data-v="hard" aria-pressed="${v==='hard'}">${I.block}<span>${L('Табу','Taboo')}</span></button></div>
 <p class="ans-word" aria-live="polite">${v==null?L('Выбери уровень — или «обсуждаемо» / «табу».','Pick a level — or “negotiable” / “taboo”.'):n?`<b>${n} · ${LV_WORD(n)}</b><span>${LV_HINT(n)}</span>`:MARK_TEXT(v)}</p>
 ${n&&o.dirAct&&hasDir(o.t)?`<div class="ans-dir"><p class="ans-dt">${L('Как тебе ближе','How you like it')} <small>${L('· можно несколько или ничего','· pick any, or none')}</small></p><div class="chips">${[['all',L('Всё','All of it')],['give',L('Давать','Giving')],['get',L('Получать','Receiving')],['watch',L('Смотреть','Watching')]].map(([k,l])=>{const on=k==='all'?all:!all&&dir.includes(k);return `<button class="chip ${on?'on':''}" aria-pressed="${on}" data-act="${o.dirAct}" data-v="${k}">${l}</button>`;}).join('')}</div></div>`:''}</div>`;}
/** «Всё» = all three; tapping a single direction while «Всё» is on keeps only that one */
const toggleDir=(cur,v)=>{const a=normDir(cur)||[];if(v==='all')return a.length===DIRS.length?undefined:[...DIRS];if(!DIRS.includes(v))return normDir(a);if(a.length===DIRS.length)return [v];return normDir(a.includes(v)?a.filter(x=>x!==v):[...a,v]);};
const ansVal=v=>isNaN(+v)?v:+v;
/** a short shelf of jars: the top few by level, then «+N» that opens the full list */
function jarShelf(list,o={}){const all=sortJars(list);const max=o.max||6;const shown=all.slice(0,max);const more=all.length-shown.length;
 return jarsHTML(shown,{...o,more:more>0?{n:more,act:o.moreAct,v:o.who||''}:null});}
function testCards(){const list=Object.entries(QUIZ).sort(([a],[b])=>(S.me.tests[a]?.done?1:0)-(S.me.tests[b]?.done?1:0));
 return `<div class="tests">${list.map(([id,z])=>{const st=S.me.tests[id]||{};const n=z.topics.length;const got=Object.keys(st.ans||{}).length;return `<button class="tcard" data-go="X07" data-id="${id}"><span class="tc-art">${plate(z.pl)}<span class="tc-ic">${I[z.ic||'test']}</span></span><span class="tc-b"><b>${esc(T(z.title))}</b>${st.done?`<span class="tc-res">${sortJars(quizJars(id)).slice(0,3).map(j=>`<i style="--jc:${j.limit?'var(--line2)':jarColor(j.lv)}">${esc(topic(j.t))} <em>${j.limit==='hard'?L('табу','taboo'):j.limit?L('обсужд.','negot.'):j.lv}</em></i>`).join('')}</span>`:''}<small>${st.done?`${I.check}${L('пройден','done')}${st.t?` · ${F.date(st.t)}`:''}`:got?L(`начат · ${got} из ${n}`,`started · ${got} of ${n}`):pl(n,['тема','темы','тем'],['topic','topics'])}</small></span></button>`;}).join('')}</div>`;}

/* the couple lives with your profile, not in «activity» (owner 15.10): one row inside the profile card */
function mePairRow(){const P=S.pair;if(P?.status==='active')return `<button class="me-pair on" data-go="Q03"><span class="mp-avs">${av('me','xs')}${av(P.with,'xs')}</span><span class="tx"><b>${esc(pairName())}</b><small>${L('Профиль пары','Couple profile')}</small></span>${I.chev}</button>`;
 return `<button class="me-pair" data-act="pairLink"><span class="mp-ic">${I.couple}</span><span class="tx"><b>${S.pairInvite?L('Приглашение в пару отправлено','Couple invitation sent'):L('Вы пара? Свяжите профили','A couple? Link your profiles')}</b><small>${S.pairInvite?L('ждём ответа партнёра','waiting for your partner'):L('Общий профиль, у каждого — свой аккаунт','A shared profile, each keeps their own account')}</small></span>${I.chev}</button>`;}
SC.X01={root:1,tab:'me',title:()=>L('Я','Me'),render:()=>{const m=S.me;const [ns,nt,nid]=nextStep();
 const head=bar(L('Я','Me'),{actions:`${bellBtn()}<button class="ibtn" data-go="K01" aria-label="${L('Настройки','Settings')}">${I.gear}</button>`});
 const jars=myJars();const priv=(m.media||[]).length;const going=myUpcomingEventIds().length;
 return head+`<div class="view"><div class="wrap">
 <section class="grp"><div class="card me-card"><button class="me-id" data-go="P03">${av('me','me-av')}<span class="grow"><b>${esc(pname('me'))}</b>${m.city?`<small>${esc(city(m.city))}</small>`:''}</span>${I.chev}</button>
  ${mePairRow()}<div class="me-acts"><button class="btn secondary sm" data-go="P03">${I.eye}${L('Как видят','Preview')}</button><button class="btn secondary sm" data-go="P02">${I.edit}${L('Изменить','Edit')}</button></div>
  ${nt?`<button class="nextstep" ${nt==='test'?`data-go="X07" data-id="${nid}"`:nt==='topic'?'data-act="addJar"':'data-go="P02"'}><span class="ico">${nt==='P02'?I.camera:I.test}</span><span class="tx"><b>${L('Следующий шаг','Next step')}</b><small>${ns}</small></span>${I.chev}</button>`:''}</div></section>
 ${grp(L('Мои интересы','My interests'),jars.length?jarShelf(m.jars,{max:4,pre:1,act:'editJar',vis:1,add:'addJar',moreAct:'myJarsAll'}):`<div class="jar-empty"><p>${L('Баночка — это одна тема и то, как она тебе откликается: от 1 до 10, «обсуждаемо» или «табу».','A jar is one topic and how it feels to you: 1 to 10, “negotiable” or “taboo”.')}</p><div class="row g8"><button class="btn secondary sm" data-act="addJar">${I.plus}${L('Добавить интерес','Add an interest')}</button></div></div>`,{right:jars.length?`<button data-go="X02">${L('Все','All')} · ${jars.length}</button>`:''})}
 ${grp(L('Тесты','Quizzes'),linkRow({go:'X05',icon:'test',title:L('Узнай себя','Get to know yourself'),sub:L('Новые тесты о тебе','New quizzes about you'),val:L('скоро','soon')}),{list:1})}
 ${grp(L('Приватное','Private'),`${linkRow({go:'P04',icon:'key',title:L('Расширенный профиль','Private profile'),sub:priv?pl(priv,['фото или видео','фото или видео','фото и видео'],['photo or video','photos and videos']):L('Фото, видео и желания — по запросу и на срок','Photos, video and wishes — on request, for a set time')})}${linkRow({go:'P07',icon:'unlock',title:L('Доступы','Access'),sub:L('Кто просит и кому открыто','Who asks and who can see it'),badge:C.reqIn()||''})}`,{list:1})}
 ${grp(L('Активность','Activity'),`${linkRow({go:'E10',icon:'cal',title:L('Мои события','My events'),val:going?String(going):''})}${linkRow({go:'F10',icon:'feed',title:L('Мои публикации','My posts'),val:String(S.myPosts.length)})}${linkRow({go:'P10',p:{id:'me',tab:'followers'},icon:'users3',title:L('Подписчики и подписки','Followers & following'),val:`${followersOf('me').length} · ${followingOf('me').length}`})}${linkRow({go:'G04',icon:'bookmark',title:L('Сохранённое','Saved'),val:String(m.saved.posts.length+m.saved.events.length)})}`,{list:1})}
 </div></div>`;},after:()=>fillJars()};
ACT.myJarsAll=()=>go('X02');
/* X02 — all my jars, grouped by answer */
SC.X02={title:()=>L('Мои интересы','My interests'),valid:p=>p.owner!=='couple'||S.pair?.status==='active',render:(p,r)=>{const all=sortJars(editableProfile(r).jars);const g=[[L('Интересно','Into it'),all.filter(j=>!j.limit)],[L('Обсуждаемо','Negotiable'),all.filter(j=>j.limit==='discuss')],[L('Табу','Taboo'),all.filter(j=>j.limit==='hard')]].filter(x=>x[1].length);
 return `${bar(L('Мои интересы','My interests'),{back:1,sm:1,actions:`<button class="ibtn" data-go="X04" data-p='${JSON.stringify({owner:p.owner})}' aria-label="${L('История','History')}">${I.hist}</button><button class="ibtn" data-act="addJar" aria-label="${L('Добавить интерес','Add an interest')}">${I.plus}</button>`})}<div class="view nodock"><div class="wrap">
 ${all.length?g.map(([t,l])=>grp(`${t} · ${l.length}`,jarsHTML(l,{pre:1,act:p.owner==='couple'?'editCoupleJar':'editJar',vis:1}))).join(''):p.owner==='couple'?empty('spark',L('Общих интересов пока нет','No couple interests yet'),L('Добавьте общие интересы вручную. Изменения публикуются после согласия обоих. Личные ответы не копируются.','Add couple interests yourselves. Changes publish once both agree. Personal answers are not copied.'),`<button class="btn primary" data-act="addJar">${L('Добавить интерес','Add an interest')}</button>`):empty('test',L('Пока пусто','Empty for now'),L('Выбери темы и настрой, как они тебе откликаются.','Choose topics and set how they feel to you.'),`<button class="btn primary" data-act="addJar">${L('Добавить интересы','Add interests')}</button>`)}
 <p class="grp-n">${I.eyeoff} ${L('только ты','only you')} · ${I.key} ${L('по доступу','by access')} · ${L('без значка — видно всем','no icon — everyone')}. ${L('Табу показывается в профиле как «нельзя», только если ты сам(а) выбрал(а) «Все».','Taboo shows on your profile as “not for me” only if you chose “Everyone”.')}</p></div></div>`;},after:()=>fillJars()};
/* Quizzes are paused (owner, 15.10.2026): the entry stays, the screen says «скоро». New quizzes will not write to jars.
   The old quiz screens (X07–X11) are kept in code below but every route shows this stub. */
const QUIZ_SOON=true;
SC.X05={title:()=>L('Тесты','Quizzes'),render:()=>`${bar(L('Тесты','Quizzes'),{back:1,sm:1})}<div class="view nodock"><div class="wrap soon-wrap">
 <div class="soon"><div class="soon-art" aria-hidden="true"><i></i><i></i><i></i><span>${I.test}</span></div>
 <span class="pill soon-pill">${L('Скоро','Coming soon')}</span>
 <h1 class="t">${L('Тесты готовятся','Quizzes are on the way')}</h1>
 <p class="lead">${L('Делаем новые тесты, которые помогут лучше понять себя. Они будут жить отдельно от баночек: интересы в профиле ты отмечаешь сам.','We’re making new quizzes to help you understand yourself. They’ll live apart from your jars: you set profile interests yourself.')}</p>
 <button class="btn secondary auto" data-act="addJar">${I.plus}${L('Пока — добавить интересы','Meanwhile — add interests')}</button></div>
 </div></div>`};
const histTxt=h=>{const dt=h.dir?`, ${dirText(h.dir)}`:'';const f=v=>v==='limit'||v==='hard'?L('табу','taboo'):v==='discuss'?L('обсуждаемо','negotiable'):v==='—'?'—':`${v}/10`;return h.from==='—'?L(`добавлено: ${f(h.to)}${dt}`,`added: ${f(h.to)}${dt}`):`${f(h.from)} → ${f(h.to)}${dt}`;};
SC.X04={title:()=>L('История интересов','Interest history'),valid:p=>p.owner!=='couple'||S.pair?.status==='active',render:(p,r)=>`${bar(L('История интересов','Interest history'),{back:1,sm:1})}<div class="view nodock"><div class="wrap">${grp('',editableProfile(r).history.map(h=>`<div class="li static"><span class="ico">${h.src==='test'?I.test:I.edit}</span><span class="tx"><b>${esc(topic(h.topic))}</b><small>${histTxt(h)} · ${h.src==='test'?L('из теста','from a quiz'):L('вручную','manual')}</small></span><span class="val">${F.date(h.t)}</span></div>`).join('')||`<div class="li static"><span class="tx"><small>${L('Пока пусто','Empty for now')}</small></span></div>`,{list:1,foot:L('Видишь только ты.','Only you see this.')})}</div></div>`};

/* Batch interests are a temporary draft, independent of quiz answers. */
ACT.addJar=()=>topicPicker();ACT.addLimit=()=>topicPicker();
function topicPicker(initial){
 const owner=cur().p.owner||'me',model=editableProfile({p:{owner}});if(!model)return;
 const d={owner,session:S.session,pair:S.pair,selected:initial&&TOPICS[initial]&&!model.jars.some(j=>j.t===initial)?[initial]:[],answers:{},dirs:{},step:0,stage:'pick',vis:'public'};S.ui.interestDraft=d;
 sheet(()=>{
  if(d.stage==='pick'){const have=model.jars.map(j=>j.t);return{title:L('Добавить интересы','Add interests'),sub:L('Выбери несколько тем, затем настрой каждую.','Choose several topics, then set each one.'),search:true,searchPh:L('Найти интерес','Find an interest'),body:CATS.map(c=>{const ts=Object.keys(TOPICS).filter(t=>TOPICS[t].cat===c.id&&!have.includes(t));return ts.length?fsec(T(c),`<div class="chips">${ts.map(t=>`<button class="chip ${d.selected.includes(t)?'on':''}" aria-pressed="${d.selected.includes(t)}" data-act="pickTopic" data-v="${t}" data-txt="${chipTxt(t,topic(t))}">${esc(topic(t))}</button>`).join('')}</div>`):'';}).join('')+`<p class="note sh-empty" hidden>${L('Такой темы пока нет.','No such topic yet.')}</p>`,foot:`<button class="btn primary" data-act="interestsStart" ${d.selected.length?'':'disabled'}>${L('Продолжить','Continue')}${d.selected.length?` · ${d.selected.length}`:''}</button>`};}
  if(d.stage==='answer'){const t=d.selected[d.step];return{title:topic(t),sub:L(`Интерес ${d.step+1} из ${d.selected.length}`,`Interest ${d.step+1} of ${d.selected.length}`),body:`<div class="qprog"><i style="width:${(d.step+1)/d.selected.length*100}%"></i></div><p class="topic-desc">${esc(T(TOPIC_DESC[t]))}</p>${grp(topicQ(t),answerHTML(d.answers[t]??null,'interestAnswer',{t,dir:d.dirs[t],dirAct:'interestDir'}),{cls:'bare'})}`,foot:`<div class="row g8"><button class="btn secondary" data-act="interestBack">${L('Назад','Back')}</button><button class="btn primary" data-act="interestNext" ${d.answers[t]==null?'disabled':''}>${d.step===d.selected.length-1?L('Продолжить','Continue'):L('Дальше','Next')}</button></div>`};}
  return{title:L('Кому показывать интересы?','Who can see these interests?'),sub:L(`Готово: ${d.selected.length}. Сохрани, чтобы добавить баночки в профиль.`,`${d.selected.length} ready. Save to add the jars to your profile.`),body:`${d.selected.map(t=>ansRow(topic(t),jarFrom(t,d.answers[t],{dir:d.dirs[t]}))).join('')}${grp(L('Кто видит','Who can see'),choices([['public',L('Все','Everyone'),L('В профиле и для совпадений. Табу будет показано как «нельзя».','On your profile and for matching. Taboo is shown as “not for me”.')],['granted',L('По доступу','By access'),L('Те, кому открыт расширенный профиль','People with access to your private profile')],['only',L('Только я','Only me')]],d.vis,'interestsVis'))}`,foot:`<button class="btn primary" data-act="interestsSave">${L('Добавить в профиль','Add to profile')}</button><div class="row g8 mt12"><button class="btn secondary" data-act="interestBack">${L('Назад','Back')}</button><button class="btn soft" data-act="interestsDiscard">${L('Выйти без сохранения','Leave without saving')}</button></div>`};
 },{full:true,guard:()=>d.selected.length>0,onClose:()=>{if(S.ui.interestDraft===d)delete S.ui.interestDraft;}});
}
ACT.pickTopic=a=>{const d=S.ui.interestDraft,t=a.dataset.v;if(!d||!TOPICS[t])return;const i=d.selected.indexOf(t);if(i<0)d.selected.push(t);else{d.selected.splice(i,1);delete d.answers[t];}resheet();};
ACT.interestsStart=()=>{const d=S.ui.interestDraft;if(!d?.selected.length)return;d.stage='answer';d.step=0;S.ui.shq='';resheet();};
ACT.interestAnswer=a=>{const d=S.ui.interestDraft;if(!d||d.stage!=='answer')return;d.answers[d.selected[d.step]]=ansVal(a.dataset.v);resheet();};
ACT.interestDir=a=>{const d=S.ui.interestDraft;if(!d||d.stage!=='answer')return;const t=d.selected[d.step];d.dirs[t]=toggleDir(d.dirs[t],a.dataset.v);resheet();};
ACT.interestNext=()=>{const d=S.ui.interestDraft;if(!d||d.answers[d.selected[d.step]]==null)return;if(d.step<d.selected.length-1)d.step++;else d.stage='visibility';resheet();};
ACT.interestBack=()=>{const d=S.ui.interestDraft;if(!d)return;if(d.stage==='visibility')d.stage='answer';else if(d.step>0)d.step--;else d.stage='pick';resheet();};
ACT.interestsVis=a=>{const d=S.ui.interestDraft;if(d&&['public','granted','only'].includes(a.dataset.v)){d.vis=a.dataset.v;resheet();}};
ACT.interestsDiscard=()=>closeSheet();
ACT.interestsSave=a=>{const d=S.ui.interestDraft;if(!d||d.stage!=='visibility'||d.session!==S.session||!d.selected.length||d.selected.some(t=>d.answers[t]==null))return;
 run(a,()=>{if(S.ui.interestDraft!==d||S.session!==d.session||d.owner==='couple'&&S.pair!==d.pair)return;const model=editableProfile({p:{owner:d.owner}});if(!model)return;
  d.selected.forEach(t=>{const i=model.jars.findIndex(j=>j.t===t),old=model.jars[i];const value=jarFrom(t,d.answers[t],{vis:d.vis,dir:d.dirs[t]});if(i<0)model.jars.push(value);else model.jars[i]=value;model.history.unshift({t:Date.now(),topic:t,from:old?jv(old):'—',to:d.answers[t],dir:value.dir,src:'manual'});});
  if(d.owner==='couple')submitCoupleDraft();closeSheet();refresh();
 },{ms:300,ok:L('Интересы добавлены','Interests added')});};
ACT.editJar=a=>{if(S.ui.sheet)closeSheet(true);if(!editableProfile().jars.some(j=>j.t===a.dataset.v)){topicPicker(a.dataset.v);return;}openJar(a.dataset.v);};
/* the jar sheet: what it is → your answer → who sees. Nothing is preselected for a new topic. */
function openJar(t,owner=cur().p.owner||'me'){const model=editableProfile({p:{owner}});if(!model)return;const ex=model.jars.find(j=>j.t===t);S.ui.jar={t,v:jv(ex),dir:normDir(ex?.dir),vis:ex?.vis||'only',owner,session:S.session};const start=JSON.stringify(S.ui.jar);
 sheet(()=>{const j=S.ui.jar;const taboo=j.v==='hard';
 return{title:topic(t),sub:T(CATS.find(c=>c.id===TOPICS[t]?.cat)||''),body:`<p class="topic-desc">${esc(T(TOPIC_DESC[t]))}</p>
 ${grp(topicQ(t),answerHTML(j.v,'jarAns',{t,dir:j.dir,dirAct:'jarDir'}),{cls:'bare'})}
 ${j.v==null?'':grp(L('Кто видит','Who can see'),choices([['only',L('Только я','Only me')],['granted',L('По доступу','By access'),L('Те, кому ты откроешь расширенный профиль','People you share your private profile with')],['public',L('Все','Everyone'),taboo?L('Другие увидят в профиле: «нельзя». Без подробностей','Others see “not for me” on your profile. No details'):L('В профиле и для совпадений','On your profile and for matching')]],j.vis,'jarVis'))}`,
 foot:`<div class="row g8">${ex?`<button class="btn secondary icon" data-act="jarDel" aria-label="${L('Убрать','Remove')}">${I.trash}</button>`:''}<button class="btn primary ${j.v==null?'off':''}" data-act="jarSave">${ex?L('Сохранить','Save'):L('Добавить','Add')}</button></div>`};},{guard:()=>JSON.stringify(S.ui.jar)!==start});}
ACT.jarAns=a=>{const j=S.ui.jar;j.v=ansVal(a.dataset.v);resheet();};
ACT.jarDir=a=>{const j=S.ui.jar;if(!j)return;j.dir=toggleDir(j.dir,a.dataset.v);resheet();};
ACT.jarVis=a=>{S.ui.jar.vis=a.dataset.v;resheet();};
ACT.jarSave=a=>{const j=S.ui.jar;if(j.v==null||j.session!==S.session)return;const pair=S.pair;run(a,()=>{if(S.session!==j.session||j.owner==='couple'&&S.pair!==pair)return;const model=editableProfile({p:{owner:j.owner}});if(!model)return;const arr=model.jars,i=arr.findIndex(x=>x.t===j.t),old=arr[i];const val=jarFrom(j.t,j.v,{vis:j.vis,dir:j.dir});if(i>=0)arr[i]=val;else arr.push(val);model.history.unshift({t:Date.now(),topic:j.t,from:old?jv(old):'—',to:j.v,dir:val.dir,src:'manual'});if(j.owner==='couple')submitCoupleDraft();closeSheet();refresh();},{ms:300,ok:L('Сохранено','Saved')});};
ACT.jarDel=()=>{const {t,owner,session}=S.ui.jar;closeSheet(true);ask({icon:'trash',tone:'l',title:L(`Убрать «${topic(t)}»?`,`Remove “${topic(t)}”?`),text:L('История изменений сохранится — её видишь только ты.','Change history is kept — only you can see it.'),ok:L('Убрать','Remove'),danger:true}).then(ok=>{if(ok&&S.session===session){const model=editableProfile({p:{owner}});if(!model)return;model.jars=model.jars.filter(j=>j.t!==t);if(owner==='couple')submitCoupleDraft();refresh();toast(L('Убрано','Removed'),{type:'ok'});}});};
/** someone else’s jar: what it is, their answer and yours */
/* «Как откликается» always pairs the person whose jar was tapped with you. The tapped jar carries the answer it showed
   (data-ans), so a jar from a private layer or a quiz result still shows that person’s row. Opened from a topic page there is no
   other person: the group is then «Твой ответ», one row. */
function openTopic(t,who,ans,dir){const other=who&&who!=='me'&&person(who);const shown=ans!=null&&ans!==''?jarFrom(t,ansVal(ans),{dir:dir?dir.split(' '):undefined}):null;
 const theirs=other?(shown||(other.jars||[]).map(normJar).find(x=>x.t===t)||null):null;const mine=S.me.jars.find(j=>j.t===t);
 sheet(()=>({title:topic(t),sub:T(CATS.find(c=>c.id===TOPICS[t]?.cat)||''),body:`<p class="topic-desc">${esc(T(TOPIC_DESC[t]))}</p>
 ${grp(theirs?L('Как откликается','How it feels'):L('Твой ответ','Your answer'),`${theirs?ansRow(pname(who),theirs):''}${ansRow(L('Ты','You'),mine||null,mine&&mine.vis!=='public'?L('видишь только ты','only you see it'):'')}`,{list:1})}`,
 foot:`<button class="btn ${mine?'secondary':'primary'}" data-act="editJar" data-v="${t}">${mine?L('Изменить у себя','Edit mine'):`${I.plus}${L('Добавить к себе','Add to mine')}`}</button>`}));}
ACT.topic=a=>openTopic(a.dataset.v,a.dataset.who,a.dataset.ans,a.dataset.dir);
/** all public jars of a person, grouped by category */
ACT.allJars=a=>{const who=a.dataset.v;const list=sortJars((person(who)?.jars||[]).filter(j=>!normJar(j).vis||normJar(j).vis==='public'));
 sheet(()=>({title:L(`Интересы · ${pname(who)}`,`Interests · ${pname(who)}`),body:CATS.map(c=>{const l=list.filter(j=>TOPICS[j.t]?.cat===c.id);return l.length?grp(T(c),jarsHTML(l,{act:'topic',who}),{cls:'bare'}):'';}).join('')}),{full:true});setTimeout(fillJars,50);};

/* ---------- quizzes: one question = one topic: what it is + level 1–10 / обсуждаемо / табу ---------- */
SC.X07={title:p=>T(QUIZ[p.id]?.title)||L('Тест','Quiz'),valid:p=>!!QUIZ[p.id],after:()=>fillJars(),render:(p)=>{const z=QUIZ[p.id];const st=S.me.tests[p.id]||{};const n=z.topics.length;const got=Object.keys(st.ans||{}).length;return `${bar('',{back:1})}<div class="view nodock cta1"><div class="wrap">
 <div class="quiz-art">${plate(z.pl)}<span class="tc-ic">${I[z.ic||'test']}</span></div>
 <h1 class="t">${esc(T(z.title))}</h1><p class="lead">${esc(T(z.desc))}</p>
 ${st.done?grp(L(`Последний результат${st.t?` · ${F.date(st.t)}`:''}`,`Last result${st.t?` · ${F.date(st.t)}`:''}`),jarsHTML(sortJars(quizJars(p.id)),{pre:1,act:'qResultTopic'}),{foot:L('Ответы теста хранятся отдельно от интересов профиля.','Quiz answers are separate from profile interests.')}):''}
 ${grp('',`<div class="li static"><span class="ico">${I.test}</span><span class="tx"><b>${pl(n,['тема','темы','тем'],['topic','topics'])} · ~${Math.max(1,Math.round(n/3))} ${L('мин','min')}</b><small>${L('У каждой — пояснение, что это','Each one explained')}</small></span></div>
 <div class="li static"><span class="ico">${I.undo}</span><span class="tx"><b>${L('Можно пропускать','Skip any topic')}</b><small>${L('Пропуск не считается ответом','A skip isn’t an answer')}</small></span></div>
 <div class="li static"><span class="ico">${I.lock}</span><span class="tx"><b>${L('Ответы видишь только ты','Only you see your answers')}</b><small>${L('Результат теста не меняет интересы профиля','Quiz results do not change profile interests')}</small></span></div>`,{list:1})}
 </div></div><div class="ctabar"><div class="wrap"><button class="btn primary" data-act="quizStart" data-v="${p.id}">${st.done?L('Пройти заново','Retake'):got?L('Продолжить','Continue'):L('Начать','Start')}</button></div></div>`;}};
ACT.quizStart=a=>{const id=a.dataset.v;const st=S.me.tests[id]||(S.me.tests[id]={});if(st.done){st.done=false;st.step=0;st.ans={};}else{st.ans=st.ans||{};const z=QUIZ[id];const f=z.topics.findIndex(t=>st.ans[t]==null);st.step=f<0?0:f;}go('X08',{id});};
SC.X08={title:p=>T(QUIZ[p.id]?.title)||L('Тест','Quiz'),valid:p=>!!QUIZ[p.id],render:(p)=>{const z=QUIZ[p.id];const st=S.me.tests[p.id]||(S.me.tests[p.id]={});st.ans=st.ans||{};const n=z.topics.length;const i=Math.min(st.step||0,n-1);st.step=i;const t=z.topics[i];const a=st.ans[t];
 return `<header class="bar"><button class="ibtn" data-act="quizClose" aria-label="${L('Закрыть','Close')}">${I.close}</button><div class="qprog"><i style="width:${(i+1)/n*100}%"></i></div><span class="qcount">${i+1} / ${n}</span></header><div class="view nodock cta1"><div class="wrap">
 <div class="q" style="animation:${S.ui.qdir==='back'?'enterBack':'enter'} .28s var(--ease)"><p class="q-cat">${esc(T(CATS.find(c=>c.id===TOPICS[t]?.cat)||''))}</p><h1 class="q-t">${esc(topic(t))}</h1><p class="q-d">${esc(T(TOPIC_DESC[t]))}</p>
 <p class="q-q">${topicQ(t)}</p>${answerHTML(a??null,'qAns')}</div></div></div>
 <div class="ctabar"><div class="wrap"><div class="row g8">${i>0?`<button class="btn secondary icon" data-act="qPrev" aria-label="${L('Назад','Back')}">${I.back}</button>`:''}<button class="btn secondary" data-act="qSkip">${L('Пропустить','Skip')}</button><button class="btn primary ${a==null?'off':''}" data-act="qNext">${i<n-1?L('Дальше','Next'):L('Результат','Result')}</button></div></div></div>`;}};
ACT.qAns=a=>{const id=cur().p.id,z=QUIZ[id],st=S.me.tests[id];const t=z.topics[st.step];const first=st.ans[t]==null;st.ans[t]=ansVal(a.dataset.v);S.ui.qdir='none';refresh();
 if(first)setTimeout(()=>{if(cur()?.id==='X08'&&S.me.tests[id].step===z.topics.indexOf(t))ACT.qNext();},420);};
ACT.qNext=()=>{const id=cur().p.id,z=QUIZ[id],st=S.me.tests[id];if(st.step<z.topics.length-1){st.step++;S.ui.qdir='fwd';refresh();}else{st.done=true;st.t=Date.now();go('X09',{id},{replace:true});}};
ACT.qSkip=()=>{const id=cur().p.id,z=QUIZ[id],st=S.me.tests[id];delete st.ans[z.topics[st.step]];ACT.qNext();};
ACT.qPrev=()=>{const st=S.me.tests[cur().p.id];st.step=Math.max(0,st.step-1);S.ui.qdir='back';refresh();};
ACT.quizClose=()=>{const st=S.me.tests[cur().p.id];ask({icon:'test',tone:'v',title:L('Закончить позже?','Finish later?'),text:L(`Ответы сохранены. Продолжишь с темы ${st.step+1}.`,`Answers are saved. You’ll continue from topic ${st.step+1}.`),ok:L('Выйти','Leave'),cancel:L('Остаться','Stay')}).then(ok=>{if(ok)back();});};
/* X09 — result: every answered topic as a jar, grouped; tap any jar to change the answer; one button saves all */
const quizJars=id=>{const z=QUIZ[id],st=S.me.tests[id]||{};return z.topics.filter(t=>st.ans&&st.ans[t]!=null).map(t=>jarFrom(t,st.ans[t]));};
const shareableQuizJars=id=>sortJars(quizJars(id)).filter(j=>!j.limit&&Number.isInteger(j.lv)&&j.lv>=1&&j.lv<=10);
const normalizeShareSelection=(id,sel)=>[...new Set(sel||[])].filter(t=>shareableQuizJars(id).some(j=>j.t===t)).slice(0,4);
SC.X09={title:()=>L('Результат','Result'),valid:p=>!!QUIZ[p.id],render:(p)=>{const z=QUIZ[p.id];const js=sortJars(quizJars(p.id));const skipped=z.topics.length-js.length;
 const g=[[L('Интересно','Into it'),js.filter(j=>!j.limit)],[L('Обсуждаемо','Negotiable'),js.filter(j=>j.limit==='discuss')],[L('Табу','Taboo'),js.filter(j=>j.limit==='hard')]].filter(x=>x[1].length);
 return `${bar('',{back:1})}<div class="view nodock cta2"><div class="wrap"><p class="q-cat">${L('Тест','Quiz')} · ${esc(T(z.title))}</p><h1 class="t">${L('Результат теста','Quiz result')}</h1>
 <p class="lead">${[g.map(([t,l])=>`${t.toLowerCase()} — ${l.length}`).join(', '),skipped?L(`пропущено — ${skipped}`,`skipped — ${skipped}`):''].filter(Boolean).join(', ')}. ${L('Нажми на баночку, чтобы поправить ответ.','Tap a jar to adjust your answer.')}</p>
 ${g.map(([t,l])=>grp(`${t} · ${l.length}`,jarsHTML(l,{pre:1,act:'qEdit'}),{cls:'bare'})).join('')||`<p class="note">${L('Ты пропустил(а) все темы.','You skipped every topic.')}</p>`}

 </div></div><div class="ctabar"><div class="wrap"><button class="btn primary ${js.length?'':'off'}" data-act="qSave" data-v="${p.id}">${L('Готово','Done')}</button>${js.some(j=>!j.limit)?`<button class="btn secondary" data-go="X11" data-id="${p.id}">${I.share}${L('Поделиться','Share')}</button>`:''}</div></div>`;},after:()=>fillJars()};
ACT.qResultTopic=a=>{const t=a.dataset.v,v=S.me.tests[cur().p.id]?.ans?.[t];sheet(()=>({title:topic(t),body:`<p class="topic-desc">${esc(T(TOPIC_DESC[t]))}</p><p class="lead">${esc(jarWord(jarFrom(t,v)))}</p><p class="note">${L('Ответ теста не меняет интересы профиля.','This quiz answer does not change profile interests.')}</p>`}));};
ACT.qEdit=a=>{const id=cur().p.id,t=a.dataset.v,st=S.me.tests[id];S.ui.qe={id,t,v:st.ans[t]};sheet(()=>({title:topic(t),body:`<p class="topic-desc">${esc(T(TOPIC_DESC[t]))}</p>${grp(topicQ(t),answerHTML(S.ui.qe.v,'qeAns'),{cls:'bare'})}`,foot:`<div class="row g8"><button class="btn secondary" data-act="qeSkip">${L('Убрать из результата','Remove')}</button><button class="btn primary" data-act="qeOk">${L('Готово','Done')}</button></div>`}));};
ACT.qeAns=a=>{S.ui.qe.v=ansVal(a.dataset.v);resheet();};
ACT.qeOk=()=>{const q=S.ui.qe;S.me.tests[q.id].ans[q.t]=q.v;closeSheet(true);refresh();};
ACT.qeSkip=()=>{const q=S.ui.qe;delete S.me.tests[q.id].ans[q.t];closeSheet(true);refresh();};
ACT.qSave=()=>{go('X05');};
SC.X10={title:()=>L('Результат','Result'),valid:p=>!!QUIZ[p.id],render:(p,r)=>SC.X09.render(p,r)};
SC.X11={title:()=>L('Поделиться','Share'),valid:p=>!!QUIZ[p.id],render:(p,r)=>{const jars=shareableQuizJars(p.id);if(!r.sel)r.sel=jars.slice(0,4).map(j=>j.t);else r.sel=normalizeShareSelection(p.id,r.sel);r.aud=r.aud||'all';const chosen=jars.filter(j=>r.sel.includes(j.t));
 return `${bar(L('Поделиться результатом','Share result'),{back:1,sm:1})}<div class="view nodock cta1"><div class="wrap">
 <div class="sharecard"><div class="sc-top"><img src="${LOGO()}" alt="">FetUre · ${esc(T(QUIZ[p.id].title))}</div>${chosen.length?jarsHTML(chosen):`<p class="note">${L('Выбери темы ниже','Pick topics below')}</p>`}</div>
 ${grp(L('Что показать · до 4','What to show · up to 4'),choices(jars.map(j=>[j.t,topic(j.t),jarWord(j)]),r.sel,'x11pick',{multi:1}),{foot:L('Табу, «обсуждаемо» и невыбранные темы в публикацию не попадут.','Taboo, negotiable and unselected topics are never included.')})}
 ${grp(L('Кому','Audience'),choices(AUD().slice(0,3).map(([k,i,t,s])=>[k,t,s]),r.aud,'x11aud'))}
 </div></div><div class="ctabar"><div class="wrap"><button class="btn primary ${chosen.length?'':'off'}" data-act="x11go">${L('Опубликовать','Publish')}</button></div></div>`;},after:()=>fillJars()};
ACT.x11pick=a=>{const r=cur();r.sel=normalizeShareSelection(r.p.id,r.sel);if(!shareableQuizJars(r.p.id).some(j=>j.t===a.dataset.v))return;const i=r.sel.indexOf(a.dataset.v);if(i<0&&r.sel.length>=4){toast(L('Не больше 4 тем','Up to 4 topics'),{type:'warn'});return;}i<0?r.sel.push(a.dataset.v):r.sel.splice(i,1);refresh();};
ACT.x11aud=a=>{cur().aud=a.dataset.v;refresh();};
ACT.x11go=a=>{const r=cur();const jars=shareableQuizJars(r.p.id).filter(s=>r.sel.includes(s.t)).slice(0,4);if(!jars.length){toast(L('Выбери хотя бы одну тему для публикации','Choose at least one topic to publish'),{type:'warn'});refresh();return;}run(a,()=>{S.myPosts.unshift({id:'m'+Date.now(),author:'me',t:Date.now(),type:'result',tags:jars.slice(0,3).map(j=>j.t),likes:0,aud:r.aud,status:'published',text:{ru:`Мой результат теста «${QUIZ[r.p.id].title.ru}»`,en:`My “${QUIZ[r.p.id].title.en}” quiz result`},result:jars.map(j=>[j.t,j.lv]),comments:[]});back();},{ok:L('Опубликовано в ленте','Published to the feed')});};

if(QUIZ_SOON)for(const k of ['X07','X08','X09','X10','X11'])SC[k]={title:SC.X05.title,render:SC.X05.render};
/* G04 — saved */
SC.G04={title:()=>L('Сохранённое','Saved'),render:()=>{const s=S.me.saved;const posts=s.posts.map(postById).filter(Boolean),evs=s.events.filter(EV);
 return `${bar(L('Сохранённое','Saved'),{back:1,sm:1})}<div class="view nodock"><div class="wrap">
 ${!posts.length&&!evs.length?empty('bookmark',L('Пока ничего не сохранено','Nothing saved yet'),L('Нажми на закладку у публикации или события — оно появится здесь. Сохранение — не ответ «Иду».','Tap the bookmark on a post or event and it shows up here. Saving isn’t a “Going” answer.')):''}
 ${evs.length?`<div class="grp"><div class="grp-t"><span>${L('События','Events')} · ${evs.length}</span></div>${evs.map(id=>eventCard(id,{row:1})).join('<div style="height:8px"></div>')}</div>`:''}
 ${posts.length?`<div class="grp"><div class="grp-t"><span>${L('Публикации','Posts')} · ${posts.length}</span></div><div class="posts">${posts.map((x,i)=>postCard(x,{i})).join('')}</div></div>`:''}
 <p class="grp-n">${L('Сохранённое видишь только ты.','Only you can see your saved items.')}</p></div></div>`;}};



ACT.editCoupleJar=a=>openJar(a.dataset.v,'couple');
ACT.coupleJars=()=>go('X02',{owner:'couple'});

