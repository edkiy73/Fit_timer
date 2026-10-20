/* ============ A: WELCOME, SIGN IN / UP, CODE, PROFILE + DATE OF BIRTH, FIRST STEPS, AGE CHECK ============ */
const langSw=()=>`<div class="langsw" role="group" aria-label="Language">${[['ru','RU'],['en','EN']].map(([k,l])=>`<button class="${S.lang===k?'on':''}" data-act="setLang" data-v="${k}" aria-pressed="${S.lang===k}">${l}</button>`).join('')}</div>`;
ACT.setLang=a=>{S.lang=a.dataset.v;document.documentElement.lang=S.lang;refresh();resheet();};

/* A01 — welcome (owner, 15.10.2026: «максимально круто», a slider with the top features).
   Always the dark brand palette; on a wide screen hero left, features right; on a phone one column with buttons at the bottom.
   The slider is one grid cell: slides cross-fade, the bar of the active slide fills and moves on (no timers to clean up);
   hover/focus pauses it, reduced motion turns autoplay off. Visuals are decorative; the words carry the meaning. */
const W_SLIDES=()=>[
 {k:L('Баночки','Jars'),h:L('Интересы — баночками, а не анкетой','Interests as jars, not a form'),p:L('Каждый интерес — от 1 до 10, «обсуждаемо» или «табу». И как тебе ближе: давать, получать или смотреть.','Every interest is 1 to 10, “negotiable” or “taboo”. Plus how you like it: giving, receiving or watching.'),
  v:()=>`<div class="wf-jars">${jarsHTML([{t:'shibari',lv:10,dir:['give']},{t:'aftercare',lv:8,dir:['get']},{t:'roleplay',lv:6,dir:DIRS},{t:'latex',lv:3,dir:['watch']}],{pre:1})}</div>`},
 {k:L('Приватность','Privacy'),h:L('Покажи ровно столько, сколько решишь','Show exactly as much as you choose'),p:L('Приватная часть — описание, интересы, фото и видео — открывается только тем, кому разрешишь ты. По умолчанию она закрыта.','Your private part — a description, interests, photos and video — opens only for people you allow. It’s closed by default.'),
  v:()=>`<div class="wf-layers">${[[I.globe,L('Ник и фото','Nickname & photo'),L('всем','everyone'),'ok'],[I.key,L('Приватная часть: описание, интересы, фото, видео','Private part: description, interests, photos, video'),L('по доступу','by access'),'v'],[I.eyeoff,L('Дневник','Journal'),L('только я','only me'),'']].map(([i,b,e,c],n)=>`<div class="wf-row" style="--n:${n}"><span class="wf-ic">${i}</span><b>${b}</b><em class="${c}">${e}</em></div>`).join('')}</div>`},
 {k:L('Доступ на срок','Timed access'),h:L('Приватное — по запросу и на срок','Private — on request, for a set time'),p:L('Фото и желания открываешь конкретному человеку на день, неделю или месяц. Передумаешь — закроешь в один тап.','Open photos and wishes to one person for a day, a week or a month. Change your mind — close it in one tap.'),
  v:()=>`<div class="wf-req"><div class="wf-req-h">${av('mia','wf-av')}<span><b>Mia</b><small>${L('просит открыть фото','asks to see your photos')}</small></span></div><div class="wf-dur">${[L('24 часа','24 hours'),L('7 дней','7 days'),L('30 дней','30 days')].map((d,n)=>`<span class="${n===1?'on':''}">${d}</span>`).join('')}</div><div class="wf-req-f">${I.unlock}<span>${L('Отозвать можно в любой момент','Revoke any time')}</span></div></div>`},
 {k:L('Взаимность','Mutual'),h:L('Пишут только взаимно','Messages only when it’s mutual'),p:L('Никаких непрошеных сообщений: чат открывается только после взаимной симпатии.','No unsolicited messages: a chat opens only after a mutual like.'),
  v:()=>`<div class="wf-match"><div class="wf-pair">${av('lina','wf-big')}<span class="wf-heart">${I.heart}</span>${av('ari','wf-big')}</div><div class="wf-bub l">${L('Взаимно! Теперь можно написать','It’s mutual! You can write now')}</div><div class="wf-bub r">${L('Привет! Классный пост про верёвку','Hi! Loved your post about rope')}</div></div>`},
 {k:L('Совпадения','In common'),h:L('Честно о совпадениях','Honest about what you share'),p:L('Без процентов «совместимости»: что совпадает, что дополняет друг друга и что стоит обсудить заранее.','No “compatibility” percentages: what you share, what complements and what to talk through first.'),
  v:()=>`<div class="wf-cmp">${venn(3,{})}<div class="wf-facts"><span class="wf-f g">${I.check}${L('Шибари: у тебя давать, у Mia получать','Shibari: you giving, Mia receiving')}</span><span class="wf-f a">${I.chat}${L('Темп: стоит обсудить','Pace: worth a talk')}</span></div></div>`},
 {k:L('Сообщество','Community'),h:L('Сообщества и встречи','Communities and meet-ups'),p:L('Обсуждения с модерацией и события онлайн и офлайн. Адрес видят только одобренные участники.','Moderated discussions and events online and offline. Only approved guests see the address.'),
  v:()=>`<div class="wf-ev"><div class="wf-date"><small>${L('СБ','SAT')}</small><b>19</b></div><div class="wf-ev-b"><b>${L('Вечер шибари для новичков','Shibari night for beginners')}</b><small>${I.pin}${L('Берлин · адрес после одобрения','Berlin · address after approval')}</small><div class="wf-ppl">${['sofi','mia','kai','leon'].map(id=>av(id,'wf-sm')).join('')}<em>+38</em></div></div></div>`},
];
SC.A01={auth:1,title:()=>L('Приветствие','Welcome'),render:()=>{const sl=W_SLIDES(),cur=Math.min(S.ui.wIdx||0,sl.length-1),nn=n=>String(n+1).padStart(2,'0');
 return `<div class="welcome wv"><div class="w-aura" aria-hidden="true"><i></i><i></i><i></i></div><div class="w-mark" aria-hidden="true">FetUre</div>
 <header class="w-top"><div class="w-brand"><img class="w-logo" src="${LOGO()}" alt=""><b>Fet<i>Ure</i></b></div>${langSw()}</header>
 <div class="w-grid">
  <div class="w-head">
   <p class="w-kick"><i></i>${L('18+ · приватно по умолчанию','18+ · private by default')}</p>
   <h1 class="w-title">${L('Пойми, чего <em>хочешь</em>.','Know what you <em>want</em>.')}</h1>
   <p class="w-sub">${L('Покажи ровно столько, сколько решишь. Найди тех, с кем это совпадает.','Show exactly as much as you choose. Find people it resonates with.')}</p>
  </div>
  <section class="w-show" aria-roledescription="${L('карусель','carousel')}" aria-label="${L('Главное в FetUre','FetUre highlights')}">
   <div class="w-prog">${sl.map((x,n)=>`<button class="w-pb ${n===cur?'on':''} ${n<cur?'done':''}" data-act="wSlide" data-v="${n}" aria-label="${nn(n)} · ${esc(x.k)}" aria-current="${n===cur}"><i></i></button>`).join('')}</div>
   <div class="w-stage">${sl.map((x,n)=>`<article class="w-slide ${n===cur?'on':''}" data-i="${n}" aria-hidden="${n!==cur}"><div class="w-vis" aria-hidden="true">${x.v()}</div><div class="w-txt"><span class="w-k">${nn(n)} · ${esc(x.k)}</span><h2>${esc(x.h)}</h2><p>${esc(x.p)}</p></div></article>`).join('')}</div>
   <div class="w-ctrl"><span class="w-count"><b>${nn(cur)}</b> / ${nn(sl.length-1)}</span><span class="w-arrows"><button class="ibtn" data-act="wSlide" data-v="prev" aria-label="${L('Назад','Previous')}">${I.back}</button><button class="ibtn" data-act="wSlide" data-v="next" aria-label="${L('Дальше','Next')}">${I.chev}</button></span></div>
  </section>
  <div class="w-act">
   <div class="w-cta"><button class="btn primary" data-go="A02" data-p='{"mode":"up"}'>${L('Создать аккаунт','Create account')}</button><button class="btn soft" data-go="A02" data-p='{"mode":"in"}'>${L('У меня уже есть аккаунт','I already have an account')}</button></div>
   <div class="w-age">${L('Только для взрослых, 18+. Продолжая, ты соглашаешься с','Adults only, 18+. By continuing you agree to the')} <a href="#" data-act="terms">${L('условиями','terms')}</a>.</div>
  </div>
 </div></div>`;},
 after:()=>{const show=$('.w-show');if(!show)return;wPlay(S.ui.wIdx||0,true);wFit();if(!window.__wFitBound){window.__wFitBound=1;addEventListener('resize',()=>{if($('.w-show'))wFit();});}
  show.addEventListener('animationend',e=>{if(e.target.matches('.w-pb.on>i'))wShow((S.ui.wIdx||0)+1);});
  show.addEventListener('keydown',e=>{if(e.key==='ArrowRight')wShow((S.ui.wIdx||0)+1);else if(e.key==='ArrowLeft')wShow((S.ui.wIdx||0)-1);});
  let x0=null,y0=0;const st=$('.w-stage',show);
  st.addEventListener('pointerdown',e=>{x0=e.clientX;y0=e.clientY;});
  st.addEventListener('pointerup',e=>{if(x0==null)return;const dx=e.clientX-x0,dy=e.clientY-y0;x0=null;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy))wShow((S.ui.wIdx||0)+(dx<0?1:-1));});
  st.addEventListener('pointercancel',()=>{x0=null;});}};
/* fit each slide's picture into the space it has: as large as possible (up to 1.12 on a desktop), never cut, never squeezed unevenly */
function wFit(){const max=innerWidth>=1024?1.12:1;$$('.w-vis').forEach(v=>{const c=v.firstElementChild;if(!c)return;c.style.transform='none';const cs=getComputedStyle(v),pw=v.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight),ph=v.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);const w=c.scrollWidth,h=c.scrollHeight;if(!w||!h)return;const k=Math.min(max,pw/w,ph/h);c.style.transformOrigin='50% 0';c.style.transform=`translateY(${Math.max(0,(ph-h*k)/2).toFixed(1)}px) scale(${k.toFixed(3)})`;});}
/* switch slides in place — no re-render, so the aura and the page don't flash */
function wShow(i){const sl=$$('.w-slide');if(!sl.length)return;const n=sl.length;i=((i%n)+n)%n;S.ui.wIdx=i;
 sl.forEach((s,k)=>{s.classList.toggle('on',k===i);s.setAttribute('aria-hidden',String(k!==i));});
 $$('.w-pb').forEach((b,k)=>{b.classList.toggle('on',k===i);b.classList.toggle('done',k<i);b.setAttribute('aria-current',String(k===i));const bar=b.firstElementChild;if(k===i&&bar){bar.style.animation='none';void bar.offsetWidth;bar.style.animation='';}});
 const c=$('.w-count b');if(c)c.textContent=String(i+1).padStart(2,'0');wPlay(i);}
/* replay the entrance of the active visual: jars fill again, rows slide in */
function wPlay(i,first){const s=$$('.w-slide')[i];if(!s)return;const j=$('.jars',s);if(j){j.classList.add('pre');setTimeout(()=>j.classList.remove('pre'),first?260:120);}
 const v=$('.venn',s);if(v){v.classList.add('pre');setTimeout(()=>v.classList.remove('pre'),first?260:140);}}
ACT.wSlide=a=>{const v=a.dataset.v,i=S.ui.wIdx||0;wShow(v==='next'?i+1:v==='prev'?i-1:+v);};

ACT.terms=()=>sheet(()=>({title:L('Условия и приватность','Terms and privacy'),body:`
 ${[[I.shield,L('Тебе 18+','You are 18+'),L('Дата рождения нужна, чтобы подтвердить 18+. Её никто не увидит. Возраст можно показывать в профиле по твоему выбору.','Your birth date confirms you are 18+. Nobody sees it. You choose whether to show your age on your profile.')],[I.lock,L('Приватно по умолчанию','Private by default'),L('Интересы и ответы тестов видишь только ты.','Your interests and quiz answers are visible only to you.')],[I.heart,L('Чат — только взаимно','Chat only when mutual'),L('Никто не напишет тебе без взаимной симпатии.','Nobody can message you without a mutual like.')],[I.trash,L('Твои данные — твои','Your data is yours'),L('Экспорт и удаление доступны всегда и бесплатно.','Export and deletion are always available and free.')]].map(([i,b,s])=>`<div class="fact"><i class="v">${i}</i><span><b>${b}.</b> ${s}</span></div>`).join('')}`,foot:`<button class="btn primary" data-act="closeSheet">${L('Понятно','Got it')}</button>`}));

SC.A02={auth:1,title:p=>p.mode==='in'?L('Вход','Sign in'):L('Регистрация','Sign up'),render:(p)=>{const up=p.mode!=='in';return `${bar('',{back:1,actions:langSw()})}<div class="view nodock"><div class="auth-wrap">
 ${seg([['up',L('Регистрация','Sign up')],['in',L('Вход','Sign in')]],up?'up':'in','authMode')}
 <h2 class="t">${up?L('Создадим аккаунт','Let’s create your account'):L('С возвращением','Welcome back')}</h2>
 
 <div class="oauth"><button class="btn oa apple" data-act="oauth" data-v="apple">${I.apple}${L('Продолжить с Apple','Continue with Apple')}</button><button class="btn oa" data-act="oauth" data-v="google">${I.google}${L('Продолжить с Google','Continue with Google')}</button></div>
 <div class="divider">${L('или по почте','or with email')}</div>
 ${field({name:'email',label:L('Электронная почта','Email'),type:'email',ph:'name@mail.com',icon:'mail',attrs:'autocomplete="email" inputmode="email" data-enter="sendCode"',hint:L('Пароль не нужен — пришлём код из 6 цифр.','No password — we’ll send a 6-digit code.')})}
 <button class="btn primary" data-act="sendCode">${L('Получить код','Get code')}</button>
 
 </div></div>`;}};
ACT.authMode=a=>{cur().p.mode=a.dataset.v;refresh();};
ACT.sendCode=a=>{
 const v=fv('email');const e=V.email(v);setErr('email',e);if(e){shakeFirstErr();return;}
 const btn=a.classList.contains('btn')?a:$('[data-act="sendCode"].btn');
 if(/^limit@/i.test(v.trim())){toast(L('Слишком много попыток. Новый код можно запросить через 60 секунд','Too many attempts. You can request a new code in 60 seconds'),{type:'err'});return;}
 run(btn,()=>go('A03',{email:v.trim(),mode:cur().p.mode||'up'}),{});
};
ACT.oauth=a=>{const prov=a.dataset.v;const mode=cur().p.mode||'up';
 S.ui.oa={prov,acc:0,hide:true};
 sheet(()=>{const o=S.ui.oa;const g=prov==='google';
  const accs=g?[['alex.b@gmail.com','Alex B.'],['new.person@gmail.com',L('Новый аккаунт','New account')]]:[];
  return{title:g?L('Вход через Google','Sign in with Google'):L('Вход через Apple','Sign in with Apple'),lead:`<span class="ico" style="background:${g?'var(--surf)':'var(--ink)'};color:${g?'':'var(--bg)'};border:1px solid var(--line)">${g?I.google:I.apple}</span>`,
  body:g?`${accs.map(([m,n],i)=>`<button class="acct ${o.acc===i?'on':''}" data-act="oaAcc" data-v="${i}"><span class="av sm ini">${plate(i?'sea':'rose')}<b style="position:relative">${n[0]}</b></span><span class="grow"><b>${n}</b><small>${m}</small></span>${o.acc===i?I.check:''}</button>`).join('')}`
  :`<button class="radio ${o.hide?'':'on'}" data-act="oaHide" data-v="0"><i></i><span class="tx">${L('Поделиться почтой','Share my email')}<small>alex@icloud.com</small></span></button><button class="radio ${o.hide?'on':''}" data-act="oaHide" data-v="1"><i></i><span class="tx">${L('Скрыть почту','Hide my email')}<small>x7k2…@privaterelay.appleid.com</small></span></button>`,
  foot:`<button class="btn ${g?'primary':'dark'}" data-act="oaGo" data-v="${prov}" data-m="${mode}">${g?L('Продолжить','Continue'):`${I.apple}${L('Продолжить с Face ID','Continue with Face ID')}`}</button>`};});};
ACT.oaAcc=a=>{S.ui.oa.acc=+a.dataset.v;resheet();};
ACT.oaHide=a=>{S.ui.oa.hide=a.dataset.v==='1';resheet();};
ACT.oaGo=a=>{const o=S.ui.oa;const existing=o.prov==='google'&&o.acc===0;
 run(a,()=>{closeSheet(true);
  if(existing){signIn(S.persona==='pair'?'pair':'full');toast(L('С возвращением, Alex','Welcome back, Alex'),{type:'ok'});return;}
  if(a.dataset.m==='in'){toast(L('Аккаунта с этой почтой ещё нет — создадим новый','No account with this email yet — let’s create one'),{type:'info'});}
  const email=o.prov==='google'?'new.person@gmail.com':(o.hide?'x7k2@privaterelay.appleid.com':'alex@icloud.com');
  go('A04',{email,via:o.prov});});};

SC.A03={auth:1,title:()=>L('Код из письма','Email code'),valid:p=>!!p.email,render:(p,r)=>{const left=Math.max(0,30-Math.round((Date.now()-(r.sent||(r.sent=Date.now())))/1000));const m=p.email.replace(/^(.)(.*)(@.*)$/,(x,a,b,c)=>a+'•'.repeat(Math.min(6,b.length))+c);return `${bar('',{back:1})}<div class="view nodock"><div class="auth-wrap">
 <h2 class="t">${L('Введи код','Enter the code')}</h2><p class="lead">${L('Отправили 6 цифр на','We sent 6 digits to')} <b>${esc(m)}</b>. ${L('Код действует 10 минут.','The code is valid for 10 minutes.')}</p>
 <div class="code ${r.err&&r.err.code?'err':''}" data-field="code">${[0,1,2,3,4,5].map(i=>`<input inputmode="numeric" autocomplete="one-time-code" aria-label="${L('Цифра','Digit')} ${i+1}" data-in="code" data-i="${i}" value="${esc((r.f.code||'')[i]||'')}" ${i===0?'autofocus':''}>`).join('')}</div>
 ${r.err&&r.err.code?`<div class="ferr">${I.alert}${r.err.code}</div>`:''}
 <button class="btn primary mt24" data-act="checkCode">${L('Подтвердить','Confirm')}</button>
 <div class="authrow mt16"><button class="btn text auto" data-back>${L('Изменить адрес','Change email')}</button><button class="btn text auto" data-act="resend" ${left?'disabled style="color:var(--faint)"':''} id="resend">${left?L(`Новый код через ${left} с`,`Resend in ${left}s`):L('Отправить ещё раз','Resend code')}</button></div>
 </div></div>`;},after:(p,r)=>{const f=$('.code input');f&&f.focus();clearInterval(S.ui.tm);S.ui.tm=setInterval(()=>{const b=$('#resend');if(!b||cur()!==r){clearInterval(S.ui.tm);return;}const left=Math.max(0,30-Math.round((Date.now()-r.sent)/1000));if(left){b.textContent=L(`Новый код через ${left} с`,`Resend in ${left}s`);}else{b.disabled=false;b.style.color='';b.textContent=L('Отправить ещё раз','Resend code');clearInterval(S.ui.tm);}},1000);}};
IN.code=(el,e)=>{const r=cur();const ins=$$('.code input');let v=el.value.replace(/\D/g,'');
 const start=+el.dataset.i;
 if(v.length>1){v.split('').slice(0,6-start).forEach((d,i)=>{if(ins[start+i])ins[start+i].value=d;});}else el.value=v;
 r.f.code=ins.map(i=>i.value.slice(0,1)).join('').slice(0,6);if(r.err&&r.err.code){r.err={};$('.code').classList.remove('err');$('.ferr')?.remove();}
 const i=start;if(v&&i<5&&v.length===1)ins[i+1].focus();if(r.f.code.length===6)ACT.checkCode($('[data-act="checkCode"]'));};
document.addEventListener('keydown',e=>{if(e.key==='Backspace'&&e.target.dataset&&e.target.dataset.in==='code'&&!e.target.value){const i=+e.target.dataset.i;if(i>0)$$('.code input')[i-1].focus();}});
ACT.checkCode=a=>{const r=cur();const c=r.f.code||'';
 const fail=msg=>{r.err={code:msg};refresh();shakeFirstErr();};
 if(c.length<6)return fail(L('Введи все 6 цифр','Enter all 6 digits'));
 run(a,()=>{if(c==='000000'){r.tries=(r.tries||5)-1;return fail(L(`Неверный код. Осталось попыток: ${r.tries}`,`Wrong code. Attempts left: ${r.tries}`));}
  if(c==='999999')return fail(L('Код истёк. Запроси новый','The code has expired. Request a new one'));
  if(r.p.mode==='in'){signIn(S.persona==='pair'?'pair':'full');toast(L('С возвращением, Alex','Welcome back, Alex'),{type:'ok'});}
  else go('A04',{email:r.p.email,via:'email'});});};
ACT.resend=a=>run(a,()=>{cur().sent=Date.now();cur().f.code='';refresh();},{ok:L('Новый код отправлен','New code sent')});

/* A04 — minimal profile with date of birth (owner requirement 13.10.2026) */
const MONTHS=()=>S.lang==='en'?['January','February','March','April','May','June','July','August','September','October','November','December']:['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
SC.A04={auth:1,title:()=>L('Профиль','Profile'),render:(p,r)=>{const yNow=new Date(NOW).getFullYear();return `${bar('',{back:1,actions:`<span class="pill">1 / 3</span>`})}<div class="view nodock cta1"><div class="auth-wrap">
 <div class="steps"><i class="on"></i><i></i><i></i></div>
 <h2 class="t">${L('Как тебя называть','What should we call you')}</h2>
 ${p.via&&p.via!=='email'?`<div class="alert ok mb16" style="margin-bottom:16px">${I.okc}<span>${L('Вход подтверждён через','Signed in with')} ${p.via==='google'?'Google':'Apple'} · ${esc(p.email)}</span></div>`:''}
 ${field({name:'nick',label:L('Ник','Nickname'),ph:'alex_b',icon:'at',attrs:'autocomplete="username" autocapitalize="off" spellcheck="false" data-in="nick"',hint:L('Латиница, цифры, точка и _. По нику тебя смогут найти.','Latin letters, digits, dot and _. People can find you by it.')}).replace('data-in="f" ','')}
 
 <div class="field ${r.err&&r.err.dob?'err':''}" data-field="dob"><span class="flabel">${L('Дата рождения','Date of birth')}</span>
  <div class="dob"><select class="inp" name="dd" data-ch="dob" aria-label="${L('День','Day')}"><option value="">${L('День','Day')}</option>${Array.from({length:31},(_,i)=>`<option ${r.f.dd==i+1?'selected':''}>${i+1}</option>`).join('')}</select>
  <select class="inp" name="mm" data-ch="dob" aria-label="${L('Месяц','Month')}"><option value="">${L('Месяц','Month')}</option>${MONTHS().map((m,i)=>`<option value="${i+1}" ${r.f.mm==i+1?'selected':''}>${m}</option>`).join('')}</select>
  <select class="inp" name="yy" data-ch="dob" aria-label="${L('Год','Year')}"><option value="">${L('Год','Year')}</option>${Array.from({length:90},(_,i)=>yNow-i).map(y=>`<option ${r.f.yy==y?'selected':''}>${y}</option>`).join('')}</select></div>
  ${r.err&&r.err.dob?`<div class="ferr">${I.alert}${r.err.dob}</div>`:`<div class="fhint">${r.f.dd&&r.f.mm&&r.f.yy&&!V.dob(r.f.dd,r.f.mm,r.f.yy)?`<span style="color:var(--mint);font-weight:600">${L('Тебе','You are')} ${ageOf(`${r.f.yy}-${String(r.f.mm).padStart(2,'0')}-${String(r.f.dd).padStart(2,'0')}`)}.</span> `:''}${L('Нужна, чтобы подтвердить 18+. Дату никто не увидит. Ты выбираешь, показывать ли возраст в профиле.','Needed to confirm 18+. Nobody sees the date. You choose whether to show your age on your profile.')}</div>`}</div>
 <div class="hr"></div>
 <button class="check ${r.f.terms?'on':''} ${r.err&&r.err.terms?'err':''}" data-act="chk" data-v="terms" data-field="terms" role="checkbox" aria-checked="${!!r.f.terms}"><i>${I.check}</i><span>${L('Принимаю','I accept the')} <a href="#" data-act="terms">${L('условия и политику приватности','terms and privacy policy')}</a>${r.err&&r.err.terms?`<span class="ferr" style="margin-top:4px">${I.alert}${r.err.terms}</span>`:''}</span></button>
 <button class="check ${r.f.news?'on':''}" data-act="chk" data-v="news" role="checkbox" aria-checked="${!!r.f.news}"><i>${I.check}</i><span>${L('Присылать новости FetUre на почту','Email me FetUre news')} <span class="note">· ${L('необязательно','optional')}</span></span></button>
 </div></div><div class="ctabar"><div class="wrap"><button class="btn primary" data-act="saveA04">${L('Дальше','Continue')}</button></div></div>`;}};
I.at=sv('<circle cx="12" cy="12" r="3.6"/><path d="M15.6 12v1.4a2.6 2.6 0 0 0 5.2 0V12a8.8 8.8 0 1 0-3.5 7"/>');
let nickT;IN.nick=el=>{IN.f(el);clearTimeout(nickT);const v=el.value;nickT=setTimeout(()=>{if(cur().f.nick!==v)return;const e=V.nick(v);if(v.length>=3){setErr('nick',e);if(!e){const f=$('[data-field="nick"]');if(f&&!$('.fok',f)){const d=document.createElement('div');d.className='fok';d.innerHTML=I.okc+L('Ник свободен','Nickname is available');$('.fhint',f)?.replaceWith(d);}}}},450);};
CH.dob=el=>{const r=cur();r.f[el.name]=el.value;r.dirty=true;if(r.err)delete r.err.dob;refresh();};
ACT.chk=a=>{const r=cur();r.f[a.dataset.v]=!r.f[a.dataset.v];if(r.err)delete r.err[a.dataset.v];refresh();};
ACT.saveA04=a=>{const r=cur();r.err={};
 const n=V.nick(fv('nick'));if(n)r.err.nick=n;
 const d=V.dob(r.f.dd,r.f.mm,r.f.yy);if(d&&d!=='U18')r.err.dob=d;
 if(!r.f.terms)r.err.terms=L('Без согласия с условиями аккаунт не создать','You need to accept the terms to create an account');
 if(Object.keys(r.err).length){refresh();shakeFirstErr();toast(L('Проверь отмеченные поля','Check the highlighted fields'),{type:'err'});return;}
 if(d==='U18'){go('A04X',{},{replace:false});return;}
 run(a,()=>{
  // a new account starts empty: keep only the language and the open sign-up flow
  const nav=S.nav,lang=S.lang;S=freshState('new');S.nav=nav;S.lang=lang;QA.seen={};
  S.me.nick=fv('nick').trim();S.me.dob=`${r.f.yy}-${String(r.f.mm).padStart(2,'0')}-${String(r.f.dd).padStart(2,'0')}`;S.me.email=r.p.email||'';S.me.methods=[r.p.via||'email'];
  go('A05',{step:1});});};
SC.A04X={auth:1,title:()=>'18+',render:()=>`${bar('',{back:1})}<div class="view nodock"><div class="auth-wrap">${empty('shield',L('FetUre только для взрослых','FetUre is for adults only'),L('Судя по дате рождения, тебе ещё нет 18. Мы не создали аккаунт и не сохранили введённые данные.','Based on your date of birth you’re not 18 yet. We didn’t create an account or keep what you entered.'),`<button class="btn soft" data-back>${L('Дата указана неверно','The date is wrong')}</button><button class="btn text" data-act="toWelcome">${L('На главную','Back to start')}</button>`)}</div></div>`};
ACT.toWelcome=()=>{S.nav.auth=[{id:'A01',p:{},f:{}}];render('back');};

/* A05 — optional first steps: identity (private by default) → where to start */
SC.A05={auth:1,title:()=>L('Первые шаги','First steps'),render:(p,r)=>{
 /* community first — interests → communities. Quizzes are «скоро» (owner, 15.10) and no longer part of onboarding. Dating is not part of onboarding. */
 if(p.step>=2){r.f.tp=r.f.tp||[];const pop=['shibari','bondage','talk','aftercare','slow','latex','roleplay','sensory','intimacy','rituals','service','experiments'];const comms=Object.keys(COMMUNITIES).filter(c=>!COMMUNITIES[c].hidden&&(!r.f.tp.length||COMMUNITIES[c].topics.some(t=>r.f.tp.includes(t)))).slice(0,4);
  return `${bar('',{back:1,actions:`<span class="pill">3 / 3</span>`})}<div class="view nodock cta1"><div class="auth-wrap">
  <div class="steps"><i class="on"></i><i class="on"></i><i class="on"></i></div><h2 class="t">${L('Что тебе интересно?','What are you into?')}</h2>
  ${grp(L('Интересы','Interests'),`<div class="chips">${pop.map(t=>chipBtn(t,topic(t),r.f.tp.includes(t),'onbTopic')).join('')}</div>`)}
  <div class="grp"><div class="grp-t"><span>${L('Сообщества для тебя','Communities for you')}</span></div>${comms.map(c=>`<div class="onb-c">${commCard(c)}<button class="btn sm ${S.joined.has(c)||S.pendingJoin.has(c)?'soft':'primary'} auto" data-act="onbJoin" data-v="${c}">${S.joined.has(c)?L('Отменить','Undo'):S.pendingJoin.has(c)?L('Отозвать','Withdraw'):COMMUNITIES[c].privacy==='closed'?L('Подать заявку','Request to join'):L('Вступить','Join')}</button></div>`).join('')}</div>
  </div></div><div class="ctabar"><div class="wrap"><button class="btn primary" data-act="finishOnb" data-v="F01">${L('Готово','Done')}</button></div></div>`;}
 if(!r.identityInit){Object.assign(r.f,identityDraft(S.me));r.identityInit=true;}
 return `${bar(L('О тебе','About you'),{back:1,actions:`<span class="pill">2 / 3</span>`})}<div class="view nodock cta2"><div class="auth-wrap identity-onboarding"><div class="steps"><i class="on"></i><i class="on"></i><i></i></div><section class="fin"><div class="fin-t"><b>${L('Ты здесь с партнёром?','Are you here with a partner?')}</b></div>${choiceChips([['yes',L('Да, вместе','Yes, together')],['no',L('Нет, только я','No, just me')]],r.f.withPartner||'','onbPartner')}${r.f.withPartner==='yes'?`<p class="fhint mt8">${L('После регистрации пригласишь партнёра.','After sign-up you’ll invite your partner.')}</p>`:''}</section>${identityFields().map(([k,title])=>`<section class="fin"><div class="fin-t"><b>${title}</b>${IDENTITY_MULTI.includes(k)?`<span>${L('можно несколько','pick any')}</span>`:''}</div>${identityChoices(k,r.f[k],'idPick')}${k==='role'?`<p class="fhint mt8">${L('Это не согласие на практики.','This is not consent to any practice.')}</p>`:''}</section>`).join('')}</div></div></div><div class="ctabar"><div class="wrap"><button class="btn primary" data-act="a05next">${L('Сохранить и продолжить','Save and continue')}</button><button class="btn secondary" data-act="a05skip">${L('Заполнить позже','Fill in later')}</button></div></div>`;}};
ACT.onbPartner=a=>{const r=cur();r.f.withPartner=r.f.withPartner===a.dataset.v?null:a.dataset.v;refresh();};
ACT.idPick=a=>{const r=cur(),k=a.dataset.k;if(!IDENTITY_KEYS.includes(k))return;r.f[k]=toggleIdentityValue(r.f[k],k,a.dataset.v);r.dirty=true;refresh();};
function applyIdentityDraft(){const r=cur();Object.assign(S.me,identityDraft(r.f));r.dirty=false;}
ACT.a05next=()=>{applyIdentityDraft();go('A05',{step:2});};
ACT.a05skip=()=>{const r=cur();Object.assign(r.f,identityDraft(S.me));r.dirty=false;go('A05',{step:2});};
ACT.onbTopic=a=>{const r=cur();const i=r.f.tp.indexOf(a.dataset.v);i<0?r.f.tp.push(a.dataset.v):r.f.tp.splice(i,1);refresh();};
ACT.onbJoin=a=>{const c=a.dataset.v;if(COMMUNITIES[c].privacy==='closed'){if(S.pendingJoin.has(c)){S.pendingJoin.delete(c);refresh();return;}S.pendingJoin.add(c);toast(L('Заявка будет отправлена после входа','Request will be sent after sign-up'),{type:'ok'});}else S.joined.has(c)?S.joined.delete(c):S.joined.add(c);refresh();};
ACT.finishOnb=a=>{const target=a.dataset.v;const p=parseP(a);const withPartner=S.nav.auth.find(r=>r.id==='A05'&&r.p.step===1)?.f.withPartner==='yes';run(a,()=>{const topics=[...S.nav.auth].reverse().find(r=>r.id==='A05'&&r.p.step===2)?.f.tp;if(Array.isArray(topics))S.filters.feed={...S.filters.feed,tags:[...new Set(topics.filter(t=>TOPICS[t]))]};S.session={at:Date.now()};initNav();render('fade');if(/^X0[1-7]$/.test(target))openMe(target,p);else if(target!=='F01'||p.sub)go(target,p);if(withPartner)go('Q01');toast(L('Аккаунт создан. Добро пожаловать!','Account created. Welcome!'),{type:'ok'});},{ms:400});};
function signIn(persona){closeSheet(true);const lang=S.lang;S=freshState(persona);S.lang=lang;S.session={at:Date.now()};initNav();QA.seen={};render('fade');}

/* A06–A08 — age check is a separate real process, never a checkbox */
function needAge(then){
 if(!QA.ageRequired||S.me.ageCheck==='ok')return true; // V7.1: off by default — 18+ by date of birth at sign-up; admin can require a check per country
 sheet(()=>({title:L('Нужна проверка возраста','Age check needed'),lead:`<span class="ico l">${I.shield}</span>`,body:`<p class="lead">${L('Это действие доступно только после проверки 18+. Дата рождения при регистрации — самодекларация, её недостаточно.','This is available only after an 18+ check. The date of birth you entered is self-declared and isn’t enough.')}</p>
 <div class="fact"><i class="g">${I.check}</i><span>${L('Займёт 1–2 минуты: селфи для оценки возраста или документ','Takes 1–2 minutes: a selfie age estimate or an ID')}</span></div>
 <div class="fact"><i class="g">${I.check}</i><span>${L('Проверку делает отдельный сервис; фото не становится аватаром и не публикуется','A separate service checks it; the photo never becomes your avatar or gets published')}</span></div>
 ${S.me.ageCheck==='pending'?`<div class="alert warn mt12">${I.clock}<span>${L('Проверка уже идёт — статус в «Профиль → Настройки».','A check is already in progress — see Profile → Settings.')}</span></div>`:''}`,
 foot:S.me.ageCheck==='pending'?`<button class="btn soft" data-act="closeSheet">${L('Понятно','OK')}</button>`:`<button class="btn primary" data-act="ageStart">${L('Пройти проверку','Start the check')}</button><button class="btn text" data-act="closeSheet">${L('Не сейчас','Not now')}</button>`}));
 S.ui.ageThen=then;return false;
}
ACT.ageStart=()=>{closeSheet(true);go('A07',{});};
SC.A07={title:()=>L('Проверка возраста','Age check'),render:(p,r)=>{const st=r.st||'choose';
 if(st==='choose')return `${bar(L('Проверка возраста','Age check'),{back:1,sm:1})}<div class="view nodock">
 
 <button class="radio ${r.m!=='doc'?'on':''}" data-act="ageM" data-v="selfie"><i></i><span class="tx"><b>${L('Селфи','Selfie')}</b><small>${L('Оценка возраста по лицу, около минуты','Face age estimate, about a minute')}</small></span></button>
 <button class="radio ${r.m==='doc'?'on':''}" data-act="ageM" data-v="doc"><i></i><span class="tx"><b>${L('Документ','ID document')}</b><small>${L('Паспорт или права, 2–3 минуты','Passport or licence, 2–3 minutes')}</small></span></button>
 <div class="alert mt16">${I.lock}<span>${L('Камера нужна только на время проверки. Снимок не попадёт в профиль, ленту или чаты.','The camera is used only during the check. The image never goes to your profile, feed or chats.')}</span></div>
 <button class="btn primary mt24" data-act="ageCam">${I.camera}${L('Разрешить камеру','Allow camera')}</button></div>`;
 if(st==='denied')return `${bar(L('Проверка возраста','Age check'),{back:1,sm:1})}<div class="view nodock">${empty('camera',L('Нет доступа к камере','No camera access'),L('Разреши камеру в настройках телефона или выбери проверку по документу с загрузкой файла.','Allow camera access in your phone settings, or choose an ID check with a file upload.'),`<button class="btn primary" data-act="ageCam">${L('Попробовать снова','Try again')}</button><button class="btn soft" data-act="ageUpload">${I.doc}${L('Загрузить файл документа','Upload an ID file')}</button>`)}</div>`;
 if(st==='shoot')return `${bar(L('Селфи','Selfie'),{back:1,sm:1})}<div class="view nodock"><div style="position:relative;aspect-ratio:3/4;border-radius:30px;overflow:hidden;background:#140B11;display:grid;place-items:center"><div style="width:62%;aspect-ratio:3/4;border-radius:50%;border:3px dashed rgba(255,255,255,.6)"></div><div style="position:absolute;bottom:16px;left:0;right:0;text-align:center;color:#fff;font-size:14px;font-weight:600">${L('Помести лицо в овал','Fit your face in the oval')}</div></div><button class="btn primary mt16" data-act="ageShot">${I.camera}${L('Сделать снимок','Take photo')}</button></div>`;
 return `${bar(L('Статус проверки','Check status'),{back:1,sm:1})}<div class="view nodock">${S.me.ageCheck==='ok'?empty('shield',L('18+ подтверждено','18+ confirmed'),L('Теперь доступны знакомства, приватные части и события 18+. Проверку повторять не нужно.','Dating, private parts and 18+ events are now available. No need to repeat the check.'),`<button class="btn primary" data-act="ageDone">${L('Продолжить','Continue')}</button>`):`<div class="empty"><div class="em-ic">${I.clock}</div><h3>${L('Проверяем…','Checking…')}</h3><p>${L('Обычно это меньше минуты. Можно закрыть экран — пришлём уведомление.','Usually under a minute. You can leave — we’ll notify you.')}</p><div class="prog" style="width:220px"><i style="width:${r.prog||10}%"></i></div></div>`}</div>`;},
 after:(p,r)=>{if(r.st==='wait'&&S.me.ageCheck!=='ok'){clearTimeout(S.ui.ageT);S.ui.ageT=setTimeout(()=>{if(cur()!==r)return;S.me.ageCheck='ok';refresh();toast(L('Возраст подтверждён','Age confirmed'),{type:'ok'});},2600);setTimeout(()=>{const b=$('.prog i');if(b)b.style.width='90%';},60);}}};
ACT.ageM=a=>{cur().m=a.dataset.v;refresh();};
ACT.ageCam=a=>{const r=cur();r.tries=(r.tries||0)+1;run(a,()=>{r.st=r.tries===1?'denied':'shoot';refresh();});};
ACT.ageUpload=a=>run(a,()=>{const r=cur();r.st='wait';S.me.ageCheck='pending';refresh();});
ACT.ageShot=a=>run(a,()=>{const r=cur();r.st='wait';S.me.ageCheck='pending';refresh();},{ms:800});
ACT.ageDone=()=>{const then=S.ui.ageThen;S.ui.ageThen=null;back();then&&setTimeout(then,350);};

