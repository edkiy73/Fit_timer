/* ============ X: ME — V9. Claude, 14.10.2026 ============
   A jar is one answer about one topic: level 1–10, «обсуждаемо» or «табу». The same answer control is used in quizzes and in the jar sheet.
   Profiles show a short shelf of jars (top by level) — the full list opens on demand. */
const VIS=()=>({public:[I.globe,L('всем','everyone'),'ok'],granted:[I.key,L('по доступу','by access'),'v'],only:[I.eyeoff,L('только я','only me'),'']});
function nextStep(){const m=S.me;const partial=Object.keys(QUIZ).find(id=>!m.tests[id]?.done&&Object.keys(m.tests[id]?.ans||{}).length);if(partial)return[L('Продолжи начатый тест','Continue your unfinished quiz'),'test',partial];if(!m.jars.length){const next=Object.keys(QUIZ).find(id=>!m.tests[id]?.done);return next?[L('Пройди тест или добавь тему вручную','Take a quiz or add a topic yourself'),'test',next]:[L('Добавь тему, которая тебе интересна','Add an interest that interests you'),'topic',null];}if(requiresDiscoveryPhoto(m)&&!m.photo)return[L('Добавь фото для показа в подборке','Add a photo to appear in Discover'),'P02',null];return['','',null];}

const normJar=x=>Array.isArray(x)?{t:x[0],lv:x[1]}:x;
const sortJars=list=>{list=list.map(normJar);return [...list.filter(j=>!j.limit).sort((a,b)=>b.lv-a.lv),...list.filter(j=>j.limit==='discuss'),...list.filter(j=>j.limit==='hard')];};
const myJars=()=>sortJars(S.me.jars);
const jv=j=>j?(j.limit||j.lv):null;
const jarFrom=(t,v,base={})=>typeof v==='number'?{...base,t,lv:v,limit:undefined}:{...base,t,lv:0,limit:v};
/* the one answer control: level 1–10 + «обсуждаемо» + «табу» */
function answerHTML(v,act){const n=typeof v==='number'?v:null;
 return `<div class="ans"><div class="ans-scale" role="radiogroup" aria-label="${L('Уровень от 1 до 10','Level 1 to 10')}">${[1,2,3,4,5,6,7,8,9,10].map(k=>`<button class="${n&&k<=n?'fill':''} ${n===k?'on':''}" data-act="${act}" data-v="${k}" role="radio" aria-checked="${n===k}">${k}</button>`).join('')}</div>
 <div class="ans-l"><span>${L('немного','a little')}</span><span>${L('очень','a lot')}</span></div>
 <div class="ans-marks"><button class="ans-m ${v==='discuss'?'on':''}" data-act="${act}" data-v="discuss" aria-pressed="${v==='discuss'}">${I.chat}<span>${L('Обсуждаемо','Negotiable')}</span></button><button class="ans-m taboo ${v==='hard'?'on':''}" data-act="${act}" data-v="hard" aria-pressed="${v==='hard'}">${I.block}<span>${L('Табу','Taboo')}</span></button></div>
 <p class="ans-word" aria-live="polite">${v==null?L('Выбери уровень — или «обсуждаемо» / «табу».','Pick a level — or “negotiable” / “taboo”.'):n?`<b>${n}</b> · ${LV_WORD(n)}`:MARK_TEXT(v)}</p></div>`;}
const ansVal=v=>isNaN(+v)?v:+v;
/** a short shelf of jars: the top few by level, then «+N» that opens the full list */
function jarShelf(list,o={}){const all=sortJars(list);const max=o.max||6;const shown=all.slice(0,max);const more=all.length-shown.length;
 return jarsHTML(shown,{...o,more:more>0?{n:more,act:o.moreAct,v:o.who||''}:null});}
function testCards(){const list=Object.entries(QUIZ).sort(([a],[b])=>(S.me.tests[a]?.done?1:0)-(S.me.tests[b]?.done?1:0));
 return `<div class="tests">${list.map(([id,z])=>{const st=S.me.tests[id]||{};const n=z.topics.length;const got=Object.keys(st.ans||{}).length;return `<button class="tcard" data-go="X07" data-id="${id}"><span class="tc-art">${plate(z.pl)}<span class="tc-ic">${I[z.ic||'test']}</span></span><span class="tc-b"><b>${esc(T(z.title))}</b>${st.done?`<span class="tc-res">${sortJars(quizJars(id)).slice(0,3).map(j=>`<i style="--jc:${j.limit?'var(--line2)':jarColor(j.lv)}">${esc(topic(j.t))} <em>${j.limit==='hard'?L('табу','taboo'):j.limit?L('обсужд.','negot.'):j.lv}</em></i>`).join('')}</span>`:''}<small>${st.done?`${I.check}${L('пройден','done')}${st.t?` · ${F.date(st.t)}`:''}`:got?L(`начат · ${got} из ${n}`,`started · ${got} of ${n}`):pl(n,['тема','темы','тем'],['topic','topics'])}</small></span></button>`;}).join('')}</div>`;}

SC.X01={root:1,tab:'me',title:()=>L('Я','Me'),render:()=>{const m=S.me;const [ns,nt,nid]=nextStep();
 const head=bar(L('Я','Me'),{actions:`${bellBtn()}<button class="ibtn" data-go="K01" aria-label="${L('Настройки','Settings')}">${I.gear}</button>`});
 const jars=myJars();const priv=(m.media||[]).length;const going=myUpcomingEventIds().length;const done=Object.keys(QUIZ).filter(k=>m.tests[k]?.done).length;const next=Object.keys(QUIZ).find(k=>!m.tests[k]?.done);
 return head+`<div class="view"><div class="wrap">
 <section class="grp"><div class="card me-card"><button class="me-id" data-go="P03">${av('me','me-av')}<span class="grow"><b>${esc(pname('me'))}</b>${m.city?`<small>${esc(city(m.city))}</small>`:''}</span>${I.chev}</button>
  <div class="me-acts"><button class="btn secondary sm" data-go="P03">${I.eye}${L('Как видят','Preview')}</button><button class="btn secondary sm" data-go="P02">${I.edit}${L('Изменить','Edit')}</button></div>
  ${nt?`<button class="nextstep" ${nt==='test'?`data-go="X07" data-id="${nid}"`:nt==='topic'?'data-act="addJar"':'data-go="P02"'}><span class="ico">${nt==='P02'?I.camera:I.test}</span><span class="tx"><b>${L('Следующий шаг','Next step')}</b><small>${ns}</small></span>${I.chev}</button>`:''}</div></section>
 ${grp(L('Мои интересы','My interests'),jars.length?jarShelf(m.jars,{max:4,pre:1,act:'editJar',vis:1,add:'addJar',moreAct:'myJarsAll'}):`<div class="jar-empty"><p>${L('Баночка — это одна тема и то, как она тебе откликается: от 1 до 10, «обсуждаемо» или «табу».','A jar is one topic and how it feels to you: 1 to 10, “negotiable” or “taboo”.')}</p><div class="row g8"><button class="btn primary sm" data-go="X07" data-id="${next||'rope'}">${L('Пройти тест','Take a quiz')}</button><button class="btn secondary sm" data-act="addJar">${I.plus}${L('Добавить интерес','Add an interest')}</button></div></div>`,{right:jars.length?`<button data-go="X02">${L('Все','All')} · ${jars.length}</button>`:''})}
 ${grp(L('Тесты','Quizzes'),linkRow({go:'X05',icon:'test',title:L('Узнай себя','Get to know yourself'),sub:L(`Пройдено ${done} из ${Object.keys(QUIZ).length}. Каждый тест — несколько тем с пояснениями.`,`${done} of ${Object.keys(QUIZ).length} done. Each quiz is a few topics, each explained.`)}),{list:1})}
 ${grp(L('Приватное','Private'),`${linkRow({go:'P04',icon:'key',title:L('Расширенный профиль','Private profile'),sub:priv?pl(priv,['фото или видео','фото или видео','фото и видео'],['photo or video','photos and videos']):L('Фото, видео и желания — по запросу и на срок','Photos, video and wishes — on request, for a set time')})}${linkRow({go:'P07',icon:'unlock',title:L('Доступы','Access'),sub:L('Кто просит и кому открыто','Who asks and who can see it'),badge:C.reqIn()||''})}`,{list:1})}
 ${grp(L('Активность','Activity'),`${linkRow({go:'E10',icon:'cal',title:L('Мои события','My events'),val:going?String(going):''})}${linkRow({go:'F10',icon:'feed',title:L('Мои публикации','My posts'),val:String(S.myPosts.length)})}${linkRow({go:'P10',p:{id:'me',tab:'followers'},icon:'users3',title:L('Подписчики и подписки','Followers & following'),val:`${followersOf('me').length} · ${followingOf('me').length}`})}${linkRow({go:'G04',icon:'bookmark',title:L('Сохранённое','Saved'),val:String(m.saved.posts.length+m.saved.events.length)})}${S.pair?.status==='active'?linkRow({go:'Q03',icon:'couple',title:L('Пара','Couple'),sub:pairName()}):linkRow({act:'pairLink',icon:'couple',title:L('Пара','Couple'),sub:S.pairInvite?L('ждём ответа партнёра','waiting for your partner'):''})}`,{list:1})}
 </div></div>`;},after:()=>fillJars()};
ACT.myJarsAll=()=>go('X02');
/* X02 — all my jars, grouped by answer */
SC.X02={title:()=>L('Мои интересы','My interests'),valid:p=>p.owner!=='couple'||S.pair?.status==='active',render:(p,r)=>{const all=sortJars(editableProfile(r).jars);const g=[[L('Интересно','Into it'),all.filter(j=>!j.limit)],[L('Обсуждаемо','Negotiable'),all.filter(j=>j.limit==='discuss')],[L('Табу','Taboo'),all.filter(j=>j.limit==='hard')]].filter(x=>x[1].length);
 return `${bar(L('Мои интересы','My interests'),{back:1,sm:1,actions:`<button class="ibtn" data-go="X04" data-p='${JSON.stringify({owner:p.owner})}' aria-label="${L('История','History')}">${I.hist}</button><button class="ibtn" data-act="addJar" aria-label="${L('Добавить интерес','Add an interest')}">${I.plus}</button>`})}<div class="view nodock"><div class="wrap">
 ${all.length?g.map(([t,l])=>grp(`${t} · ${l.length}`,jarsHTML(l,{pre:1,act:p.owner==='couple'?'editCoupleJar':'editJar',vis:1}))).join(''):p.owner==='couple'?empty('spark',L('Общих интересов пока нет','No couple interests yet'),L('Добавьте общие интересы вручную. Изменения публикуются после согласия обоих. Личные ответы не копируются.','Add couple interests yourselves. Changes publish once both agree. Personal answers are not copied.'),`<button class="btn primary" data-act="addJar">${L('Добавить интерес','Add an interest')}</button>`):empty('test',L('Пока пусто','Empty for now'),L('Пройди тест или добавь тему сам(а).','Take a quiz or add a topic yourself.'),`<button class="btn primary" data-go="X05">${L('К тестам','See quizzes')}</button>`)}
 <p class="grp-n">${I.eyeoff} ${L('только ты','only you')} · ${I.key} ${L('по доступу','by access')} · ${L('без значка — видно всем','no icon — everyone')}. ${L('Табу показывается в профиле как «нельзя», только если ты сам(а) выбрал(а) «Все».','Taboo shows on your profile as “not for me” only if you chose “Everyone”.')}</p></div></div>`;},after:()=>fillJars()};
SC.X05={title:()=>L('Тесты','Quizzes'),render:()=>{const done=Object.keys(QUIZ).filter(k=>S.me.tests[k]?.done).length;return `${bar(L('Тесты','Quizzes'),{back:1,sm:1})}<div class="view nodock"><div class="wrap">
 <p class="lead">${L('В каждом тесте несколько тем. У каждой — пояснение, что это. Отвечаешь от 1 до 10, «обсуждаемо» или «табу». Любую тему можно пропустить.','Each quiz is a few topics, each with an explanation. Answer 1 to 10, “negotiable” or “taboo”. Skip any topic.')}</p>
 <section class="grp"><div class="grp-t"><span>${L(`Пройдено ${done} из ${Object.keys(QUIZ).length}`,`${done} of ${Object.keys(QUIZ).length} done`)}</span></div>${testCards()}</section></div></div>`;}};
const histTxt=h=>{const f=v=>v==='limit'||v==='hard'?L('табу','taboo'):v==='discuss'?L('обсуждаемо','negotiable'):v==='—'?'—':`${v}/10`;return h.from==='—'?L(`добавлено: ${f(h.to)}`,`added: ${f(h.to)}`):`${f(h.from)} → ${f(h.to)}`;};
SC.X04={title:()=>L('История интересов','Interest history'),valid:p=>p.owner!=='couple'||S.pair?.status==='active',render:(p,r)=>`${bar(L('История интересов','Interest history'),{back:1,sm:1})}<div class="view nodock"><div class="wrap">${grp('',editableProfile(r).history.map(h=>`<div class="li static"><span class="ico">${h.src==='test'?I.test:I.edit}</span><span class="tx"><b>${esc(topic(h.topic))}</b><small>${histTxt(h)} · ${h.src==='test'?L('из теста','from a quiz'):L('вручную','manual')}</small></span><span class="val">${F.date(h.t)}</span></div>`).join('')||`<div class="li static"><span class="tx"><small>${L('Пока пусто','Empty for now')}</small></span></div>`,{list:1,foot:L('Видишь только ты.','Only you see this.')})}</div></div>`};

/* add a topic: picker with search → the jar sheet with nothing preselected */
ACT.addJar=()=>topicPicker();ACT.addLimit=()=>topicPicker();
function topicPicker(){sheet(()=>{const have=editableProfile().jars.map(j=>j.t);
 return{title:L('Добавить интерес','Add an interest'),search:true,searchPh:L('Найти интерес','Find an interest'),body:`${CATS.map(c=>{const ts=Object.keys(TOPICS).filter(t=>TOPICS[t].cat===c.id);return ts.length?fsec(T(c),`<div class="chips">${ts.map(t=>`<button class="chip ${have.includes(t)?'on':''}" data-act="pickTopic" data-v="${t}" data-txt="${chipTxt(t,topic(t))}">${esc(topic(t))}</button>`).join('')}</div>`):'';}).join('')}<p class="note sh-empty" hidden>${L('Такой темы пока нет.','No such topic yet.')}</p>`};},{full:true});}
ACT.pickTopic=a=>{closeSheet(true);openJar(a.dataset.v);};
ACT.editJar=a=>{if(S.ui.sheet)closeSheet(true);openJar(a.dataset.v);};
/* the jar sheet: what it is → your answer → who sees. Nothing is preselected for a new topic. */
function openJar(t,owner=cur().p.owner||'me'){const model=editableProfile({p:{owner}});if(!model)return;const ex=model.jars.find(j=>j.t===t);S.ui.jar={t,v:jv(ex),vis:ex?.vis||'only',owner,session:S.session};const start=JSON.stringify(S.ui.jar);
 sheet(()=>{const j=S.ui.jar;const taboo=j.v==='hard';
 return{title:topic(t),sub:T(CATS.find(c=>c.id===TOPICS[t]?.cat)||''),body:`<p class="topic-desc">${esc(T(TOPIC_DESC[t]))}</p>
 ${grp(topicQ(t),answerHTML(j.v,'jarAns'),{cls:'bare'})}
 ${j.v==null?'':grp(L('Кто видит','Who can see'),choices([['only',L('Только я','Only me')],['granted',L('По доступу','By access'),L('Те, кому ты откроешь расширенный профиль','People you share your private profile with')],['public',L('Все','Everyone'),taboo?L('Другие увидят в профиле: «нельзя». Без подробностей','Others see “not for me” on your profile. No details'):L('В профиле и для совпадений','On your profile and for matching')]],j.vis,'jarVis'))}`,
 foot:`<div class="row g8">${ex?`<button class="btn secondary icon" data-act="jarDel" aria-label="${L('Убрать','Remove')}">${I.trash}</button>`:''}<button class="btn primary ${j.v==null?'off':''}" data-act="jarSave">${ex?L('Сохранить','Save'):L('Добавить','Add')}</button></div>`};},{guard:()=>JSON.stringify(S.ui.jar)!==start});}
ACT.jarAns=a=>{const j=S.ui.jar;j.v=ansVal(a.dataset.v);resheet();};
ACT.jarVis=a=>{S.ui.jar.vis=a.dataset.v;resheet();};
ACT.jarSave=a=>{const j=S.ui.jar;if(j.v==null||j.session!==S.session)return;const pair=S.pair;run(a,()=>{if(S.session!==j.session||j.owner==='couple'&&S.pair!==pair)return;const model=editableProfile({p:{owner:j.owner}});if(!model)return;const arr=model.jars,i=arr.findIndex(x=>x.t===j.t),old=arr[i];const val=jarFrom(j.t,j.v,{vis:j.vis});if(i>=0)arr[i]=val;else arr.push(val);model.history.unshift({t:Date.now(),topic:j.t,from:old?jv(old):'—',to:j.v,src:'manual'});if(j.owner==='couple')submitCoupleDraft();closeSheet();refresh();},{ms:300,ok:L('Сохранено','Saved')});};
ACT.jarDel=()=>{const {t,owner,session}=S.ui.jar;closeSheet(true);ask({icon:'trash',tone:'l',title:L(`Убрать «${topic(t)}»?`,`Remove “${topic(t)}”?`),text:L('История изменений сохранится — её видишь только ты.','Change history is kept — only you can see it.'),ok:L('Убрать','Remove'),danger:true}).then(ok=>{if(ok&&S.session===session){const model=editableProfile({p:{owner}});if(!model)return;model.jars=model.jars.filter(j=>j.t!==t);if(owner==='couple')submitCoupleDraft();refresh();toast(L('Убрано','Removed'),{type:'ok'});}});};
/** someone else’s jar: what it is, their answer and yours */
/* «Как откликается» always pairs the person whose jar was tapped with you. The tapped jar carries the answer it showed
   (data-ans), so a jar from a private layer or a quiz result still shows that person’s row. Opened from a topic page there is no
   other person: the group is then «Твой ответ», one row. */
function openTopic(t,who,ans){const other=who&&who!=='me'&&person(who);const shown=ans!=null&&ans!==''?jarFrom(t,ansVal(ans)):null;
 const theirs=other?(shown||(other.jars||[]).map(normJar).find(x=>x.t===t)||null):null;const mine=S.me.jars.find(j=>j.t===t);
 sheet(()=>({title:topic(t),sub:T(CATS.find(c=>c.id===TOPICS[t]?.cat)||''),body:`<p class="topic-desc">${esc(T(TOPIC_DESC[t]))}</p>
 ${grp(theirs?L('Как откликается','How it feels'):L('Твой ответ','Your answer'),`${theirs?`<div class="li static"><span class="tx"><b>${esc(pname(who))}</b></span><span class="val strong">${esc(jarWord(theirs))}</span></div>`:''}<div class="li static"><span class="tx"><b>${L('Ты','You')}</b>${mine&&mine.vis!=='public'?`<small>${L('твой ответ видишь только ты','only you see your answer')}</small>`:''}</span><span class="val ${mine?'strong':''}">${mine?esc(jarWord(mine)):L('не отмечено','not set')}</span></div>`,{list:1})}`,
 foot:`<button class="btn ${mine?'secondary':'primary'}" data-act="editJar" data-v="${t}">${mine?L('Изменить у себя','Edit mine'):`${I.plus}${L('Добавить к себе','Add to mine')}`}</button>`}));}
ACT.topic=a=>openTopic(a.dataset.v,a.dataset.who,a.dataset.ans);
/** all public jars of a person, grouped by category */
ACT.allJars=a=>{const who=a.dataset.v;const list=sortJars((person(who)?.jars||[]).filter(j=>!normJar(j).vis||normJar(j).vis==='public'));
 sheet(()=>({title:L(`Интересы · ${pname(who)}`,`Interests · ${pname(who)}`),body:CATS.map(c=>{const l=list.filter(j=>TOPICS[j.t]?.cat===c.id);return l.length?grp(T(c),jarsHTML(l,{act:'topic',who}),{cls:'bare'}):'';}).join('')}),{full:true});setTimeout(fillJars,50);};

/* ---------- quizzes: one question = one topic: what it is + level 1–10 / обсуждаемо / табу ---------- */
SC.X07={title:p=>T(QUIZ[p.id]?.title)||L('Тест','Quiz'),valid:p=>!!QUIZ[p.id],after:()=>fillJars(),render:(p)=>{const z=QUIZ[p.id];const st=S.me.tests[p.id]||{};const n=z.topics.length;const got=Object.keys(st.ans||{}).length;return `${bar('',{back:1})}<div class="view nodock cta1"><div class="wrap">
 <div class="quiz-art">${plate(z.pl)}<span class="tc-ic">${I[z.ic||'test']}</span></div>
 <h1 class="t">${esc(T(z.title))}</h1><p class="lead">${esc(T(z.desc))}</p>
 ${st.done?grp(L(`Последний результат${st.t?` · ${F.date(st.t)}`:''}`,`Last result${st.t?` · ${F.date(st.t)}`:''}`),jarsHTML(sortJars(quizJars(p.id)),{pre:1,act:'editJar'}),{foot:L('Это твои ответы — видишь только ты. Что показывать в профиле, решаешь в «Мои интересы».','These are your answers — only you see them. What shows on your profile is set in My interests.')}):''}
 ${grp('',`<div class="li static"><span class="ico">${I.test}</span><span class="tx"><b>${pl(n,['тема','темы','тем'],['topic','topics'])} · ~${Math.max(1,Math.round(n/3))} ${L('мин','min')}</b><small>${L('У каждой — пояснение, что это','Each one explained')}</small></span></div>
 <div class="li static"><span class="ico">${I.undo}</span><span class="tx"><b>${L('Можно пропускать','Skip any topic')}</b><small>${L('Пропуск не считается ответом','A skip isn’t an answer')}</small></span></div>
 <div class="li static"><span class="ico">${I.lock}</span><span class="tx"><b>${L('Ответы видишь только ты','Only you see your answers')}</b><small>${L('Интересы меняются, когда ты сохранишь результат','Interests change only when you save the result')}</small></span></div>`,{list:1})}
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
 const was={};js.forEach(j=>{const m=S.me.jars.find(x=>x.t===j.t);if(m&&jv(m)!==jv(j))was[j.t]=jv(m);});
 return `${bar('',{back:1})}<div class="view nodock cta2"><div class="wrap"><p class="q-cat">${L('Тест','Quiz')} · ${esc(T(z.title))}</p><h1 class="t">${L('Твои интересы','Your interests')}</h1>
 <p class="lead">${[g.map(([t,l])=>`${t.toLowerCase()} — ${l.length}`).join(', '),skipped?L(`пропущено — ${skipped}`,`skipped — ${skipped}`):''].filter(Boolean).join(', ')}. ${L('Нажми на баночку, чтобы поправить ответ.','Tap a jar to adjust your answer.')}</p>
 ${g.map(([t,l])=>grp(`${t} · ${l.length}`,jarsHTML(l,{pre:1,act:'qEdit',was}),{cls:'bare'})).join('')||`<p class="note">${L('Ты пропустил(а) все темы.','You skipped every topic.')}</p>`}
 ${Object.keys(was).length?`<p class="grp-n">${L('«Было» — твой прежний ответ. Сохранение заменит его.','“Was” is your previous answer. Saving replaces it.')}</p>`:''}
 </div></div><div class="ctabar"><div class="wrap"><button class="btn primary ${js.length?'':'off'}" data-act="qSave" data-v="${p.id}">${L('Сохранить в мои интересы','Save to my interests')}</button>${js.some(j=>!j.limit)?`<button class="btn secondary" data-go="X11" data-id="${p.id}">${I.share}${L('Поделиться','Share')}</button>`:''}</div></div>`;},after:()=>fillJars()};
ACT.qEdit=a=>{const id=cur().p.id,t=a.dataset.v,st=S.me.tests[id];S.ui.qe={id,t,v:st.ans[t]};sheet(()=>({title:topic(t),body:`<p class="topic-desc">${esc(T(TOPIC_DESC[t]))}</p>${grp(topicQ(t),answerHTML(S.ui.qe.v,'qeAns'),{cls:'bare'})}`,foot:`<div class="row g8"><button class="btn secondary" data-act="qeSkip">${L('Убрать из результата','Remove')}</button><button class="btn primary" data-act="qeOk">${L('Готово','Done')}</button></div>`}));};
ACT.qeAns=a=>{S.ui.qe.v=ansVal(a.dataset.v);resheet();};
ACT.qeOk=()=>{const q=S.ui.qe;S.me.tests[q.id].ans[q.t]=q.v;closeSheet(true);refresh();};
ACT.qeSkip=()=>{const q=S.ui.qe;delete S.me.tests[q.id].ans[q.t];closeSheet(true);refresh();};
ACT.qSave=a=>{const id=a.dataset.v;const js=quizJars(id);run(a,()=>{js.forEach(n=>{const i=S.me.jars.findIndex(j=>j.t===n.t);const old=i>=0?S.me.jars[i]:null;const val={...n,vis:old?old.vis:'only'};if(val.limit==='hard'&&val.vis==='public')val.vis='only';i>=0?S.me.jars[i]=val:S.me.jars.push(val);if(!old||jv(old)!==jv(n))S.me.history.unshift({t:Date.now(),topic:n.t,from:old?jv(old):'—',to:jv(n),src:'test'});});
 const st=stack();while(st.length>1&&['X07','X08','X09'].includes(cur().id))st.pop();go('X02');},{ok:L(`Сохранено: ${js.length}. Новые интересы видишь только ты`,`Saved: ${js.length}. New interests are visible only to you`)});};
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

/* G04 — saved */
SC.G04={title:()=>L('Сохранённое','Saved'),render:()=>{const s=S.me.saved;const posts=s.posts.map(postById).filter(Boolean),evs=s.events.filter(EV);
 return `${bar(L('Сохранённое','Saved'),{back:1,sm:1})}<div class="view nodock"><div class="wrap">
 ${!posts.length&&!evs.length?empty('bookmark',L('Пока ничего не сохранено','Nothing saved yet'),L('Нажми на закладку у публикации или события — оно появится здесь. Сохранение — не ответ «Иду».','Tap the bookmark on a post or event and it shows up here. Saving isn’t a “Going” answer.')):''}
 ${evs.length?`<div class="grp"><div class="grp-t"><span>${L('События','Events')} · ${evs.length}</span></div>${evs.map(id=>eventCard(id,{row:1})).join('<div style="height:8px"></div>')}</div>`:''}
 ${posts.length?`<div class="grp"><div class="grp-t"><span>${L('Публикации','Posts')} · ${posts.length}</span></div><div class="posts">${posts.map((x,i)=>postCard(x,{i})).join('')}</div></div>`:''}
 <p class="grp-n">${L('Сохранённое видишь только ты.','Only you can see your saved items.')}</p></div></div>`;}};



ACT.editCoupleJar=a=>openJar(a.dataset.v,'couple');
ACT.coupleJars=()=>go('X02',{owner:'couple'});

