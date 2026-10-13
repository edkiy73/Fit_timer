/* ============ A: WELCOME, SIGN IN / UP, CODE, PROFILE + DATE OF BIRTH, FIRST STEPS, AGE CHECK ============ */
const langSw=()=>`<div class="langsw" role="group" aria-label="Language">${[['ru','RU'],['en','EN']].map(([k,l])=>`<button class="${S.lang===k?'on':''}" data-act="setLang" data-v="${k}" aria-pressed="${S.lang===k}">${l}</button>`).join('')}</div>`;
ACT.setLang=a=>{S.lang=a.dataset.v;document.documentElement.lang=S.lang;refresh();resheet();};

SC.A01={auth:1,title:()=>L('Приветствие','Welcome'),render:()=>`<div class="welcome"><div class="w-bg"></div>
 <div class="w-top"><img class="w-logo" src="${(window.FT_IMG&&FT_IMG.mark)||LOGO()}" alt="FetUre">${langSw()}</div>
 <h1 class="w-word"><span>Fet</span><span>Ure</span></h1>
 <div class="w-lines"><span>${L('Пойми, чего хочешь.','Understand what you want.')}</span><span>${L('Покажи ровно столько, сколько решишь.','Show exactly as much as you choose.')}</span><span>${L('Найди тех, с кем это совпадает.','Find people it resonates with.')}</span></div>
 <div class="w-cta"><button class="btn primary" data-go="A02" data-p='{"mode":"up"}'>${L('Создать аккаунт','Create account')}</button><button class="btn soft" data-go="A02" data-p='{"mode":"in"}'>${L('У меня уже есть аккаунт','I already have an account')}</button></div>
 <div class="w-age">${L('Только для взрослых, 18+. Продолжая, ты соглашаешься с','Adults only, 18+. By continuing you agree to the')} <a href="#" data-act="terms">${L('условиями','terms')}</a>.</div></div>`};

ACT.terms=()=>sheet(()=>({title:L('Условия и приватность','Terms and privacy'),body:`<p class="lead">${L('Коротко о главном. Полный текст юридически согласуется перед запуском.','The essentials. The full legal text is finalised before launch.')}</p>
 ${[[I.shield,L('Тебе 18+','You are 18+'),L('Дата рождения нужна для этого. Другим видно только возраст, и только если ты включишь знакомства.','Your date of birth confirms it. Others only see your age, and only if you turn on dating.')],[I.lock,L('Приватно по умолчанию','Private by default'),L('Карта, дневник и ответы тестов видишь только ты.','Your map, journal and quiz answers are visible only to you.')],[I.heart,L('Чат — только взаимно','Chat only when mutual'),L('Никто не напишет тебе без взаимной симпатии.','Nobody can message you without a mutual like.')],[I.trash,L('Твои данные — твои','Your data is yours'),L('Экспорт и удаление доступны всегда и бесплатно.','Export and deletion are always available and free.')]].map(([i,b,s])=>`<div class="fact"><i class="v">${i}</i><span><b>${b}.</b> ${s}</span></div>`).join('')}`,foot:`<button class="btn primary" data-act="closeSheet">${L('Понятно','Got it')}</button>`}));

SC.A02={auth:1,title:p=>p.mode==='in'?L('Вход','Sign in'):L('Регистрация','Sign up'),render:(p)=>{const up=p.mode!=='in';return `${bar('',{back:1,actions:langSw()})}<div class="view nodock"><div class="auth-wrap">
 ${seg([['up',L('Регистрация','Sign up')],['in',L('Вход','Sign in')]],up?'up':'in','authMode')}
 <h2 class="t">${up?L('Создадим аккаунт','Let’s create your account'):L('С возвращением','Welcome back')}</h2>
 <p class="lead">${up?L('Профиль никто не увидит, пока ты сам не решишь его показать.','Nobody sees your profile until you decide to show it.'):L('Войди тем же способом, что и при регистрации.','Sign in the same way you signed up.')}</p>
 <div class="oauth"><button class="btn oa apple" data-act="oauth" data-v="apple">${I.apple}${L('Продолжить с Apple','Continue with Apple')}</button><button class="btn oa" data-act="oauth" data-v="google">${I.google}${L('Продолжить с Google','Continue with Google')}</button></div>
 <div class="divider">${L('или по почте','or with email')}</div>
 ${field({name:'email',label:L('Электронная почта','Email'),type:'email',ph:'name@mail.com',icon:'mail',attrs:'autocomplete="email" inputmode="email" data-enter="sendCode"',hint:L('Пароль не нужен — пришлём код из 6 цифр.','No password — we’ll send a 6-digit code.')})}
 <button class="btn primary" data-act="sendCode">${L('Получить код','Get code')}</button>
 <p class="note center mt16">${L('Почта не видна в профиле. Мы не пишем от твоего имени.','Your email is never shown on your profile. We never post on your behalf.')}</p>
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
  body:g?`<p class="lead">${L('Выбери аккаунт. FetUre получит только имя и почту — без контактов и календаря.','Choose an account. FetUre gets only your name and email — no contacts or calendar.')}</p>${accs.map(([m,n],i)=>`<button class="acct ${o.acc===i?'on':''}" data-act="oaAcc" data-v="${i}"><span class="av sm ini">${plate(i?'sea':'rose')}<b style="position:relative">${n[0]}</b></span><span class="grow"><b>${n}</b><small>${m}</small></span>${o.acc===i?I.check:''}</button>`).join('')}`
  :`<p class="lead">${L('Apple подтвердит, что это ты. Почту можно скрыть — письма будут приходить через Apple.','Apple confirms it’s you. You can hide your email — mail is relayed by Apple.')}</p><button class="radio ${o.hide?'':'on'}" data-act="oaHide" data-v="0"><i></i><span class="tx">${L('Поделиться почтой','Share my email')}<small>alex@icloud.com</small></span></button><button class="radio ${o.hide?'on':''}" data-act="oaHide" data-v="1"><i></i><span class="tx">${L('Скрыть почту','Hide my email')}<small>x7k2…@privaterelay.appleid.com</small></span></button>`,
  foot:`<button class="btn ${g?'primary':'dark'}" data-act="oaGo" data-v="${prov}" data-m="${mode}">${g?L('Продолжить','Continue'):`${I.apple}${L('Продолжить с Face ID','Continue with Face ID')}`}</button>`};});};
ACT.oaAcc=a=>{S.ui.oa.acc=+a.dataset.v;resheet();};
ACT.oaHide=a=>{S.ui.oa.hide=a.dataset.v==='1';resheet();};
ACT.oaGo=a=>{const o=S.ui.oa;const existing=o.prov==='google'&&o.acc===0;
 run(a,()=>{closeSheet(true);
  if(existing){signIn('full');toast(L('С возвращением, Alex','Welcome back, Alex'),{type:'ok'});return;}
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
  if(r.p.mode==='in'){signIn('full');toast(L('С возвращением, Alex','Welcome back, Alex'),{type:'ok'});}
  else go('A04',{email:r.p.email,via:'email'});});};
ACT.resend=a=>run(a,()=>{cur().sent=Date.now();cur().f.code='';refresh();},{ok:L('Новый код отправлен','New code sent')});

/* A04 — minimal profile with date of birth (owner requirement 13.10.2026) */
const MONTHS=()=>S.lang==='en'?['January','February','March','April','May','June','July','August','September','October','November','December']:['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
SC.A04={auth:1,title:()=>L('Профиль','Profile'),render:(p,r)=>{const yNow=new Date(NOW).getFullYear();r.f.pron=r.f.pron||'';return `${bar('',{back:1,actions:`<span class="pill">1 / 2</span>`})}<div class="view nodock cta1"><div class="auth-wrap">
 <div class="steps"><i class="on"></i><i></i></div>
 <h2 class="t">${L('Как тебя называть','What should we call you')}</h2><p class="lead">${L('Только самое нужное. Фото и подробности — потом, когда захочешь.','Just the essentials. Photos and details later, whenever you like.')}</p>
 ${p.via&&p.via!=='email'?`<div class="alert ok mb16" style="margin-bottom:16px">${I.okc}<span>${L('Вход подтверждён через','Signed in with')} ${p.via==='google'?'Google':'Apple'} · ${esc(p.email)}</span></div>`:''}
 ${field({name:'nick',label:L('Ник','Nickname'),ph:'alex_b',icon:'at',attrs:'autocomplete="username" autocapitalize="off" spellcheck="false" data-in="nick"',hint:L('Латиница, цифры, точка и _. По нику тебя смогут найти.','Latin letters, digits, dot and _. People can find you by it.')}).replace('data-in="f" ','')}
 ${field({name:'name',label:L('Имя в профиле','Display name'),opt:1,ph:'Alex',attrs:'autocomplete="given-name"'})}
 <div class="field ${r.err&&r.err.dob?'err':''}" data-field="dob"><span class="flabel">${L('Дата рождения','Date of birth')}</span>
  <div class="dob"><select class="inp" name="dd" data-ch="dob" aria-label="${L('День','Day')}"><option value="">${L('День','Day')}</option>${Array.from({length:31},(_,i)=>`<option ${r.f.dd==i+1?'selected':''}>${i+1}</option>`).join('')}</select>
  <select class="inp" name="mm" data-ch="dob" aria-label="${L('Месяц','Month')}"><option value="">${L('Месяц','Month')}</option>${MONTHS().map((m,i)=>`<option value="${i+1}" ${r.f.mm==i+1?'selected':''}>${m}</option>`).join('')}</select>
  <select class="inp" name="yy" data-ch="dob" aria-label="${L('Год','Year')}"><option value="">${L('Год','Year')}</option>${Array.from({length:90},(_,i)=>yNow-i).map(y=>`<option ${r.f.yy==y?'selected':''}>${y}</option>`).join('')}</select></div>
  ${r.err&&r.err.dob?`<div class="ferr">${I.alert}${r.err.dob}</div>`:`<div class="fhint">${r.f.dd&&r.f.mm&&r.f.yy&&!V.dob(r.f.dd,r.f.mm,r.f.yy)?`<span style="color:var(--mint);font-weight:600">${L('Тебе','You are')} ${ageOf(`${r.f.yy}-${String(r.f.mm).padStart(2,'0')}-${String(r.f.dd).padStart(2,'0')}`)}.</span> `:''}${L('Нужна, чтобы подтвердить 18+. Дату никто не увидит — в профиле только возраст, и только если ты сам включишь знакомства.','Needed to confirm 18+. Nobody sees the date — your profile shows only your age, and only if you turn on dating.')}</div>`}</div>
 <div class="field"><span class="flabel">${L('Местоимения','Pronouns')}<i style="font-style:normal;font-weight:500;color:var(--faint)">${L('необязательно','optional')}</i></span>${chipGroup(optItems('pron'),[r.f.pron],'pickPron')}</div>
 <div class="hr"></div>
 <button class="check ${r.f.terms?'on':''} ${r.err&&r.err.terms?'err':''}" data-act="chk" data-v="terms" data-field="terms" role="checkbox" aria-checked="${!!r.f.terms}"><i>${I.check}</i><span>${L('Принимаю','I accept the')} <a href="#" data-act="terms">${L('условия и политику приватности','terms and privacy policy')}</a>${r.err&&r.err.terms?`<span class="ferr" style="margin-top:4px">${I.alert}${r.err.terms}</span>`:''}</span></button>
 <button class="check ${r.f.news?'on':''}" data-act="chk" data-v="news" role="checkbox" aria-checked="${!!r.f.news}"><i>${I.check}</i><span>${L('Присылать новости FetUre на почту','Email me FetUre news')} <span class="note">· ${L('необязательно','optional')}</span></span></button>
 </div></div><div class="ctabar"><div class="wrap"><button class="btn primary" data-act="saveA04">${L('Дальше','Continue')}</button></div></div>`;}};
I.at=sv('<circle cx="12" cy="12" r="3.6"/><path d="M15.6 12v1.4a2.6 2.6 0 0 0 5.2 0V12a8.8 8.8 0 1 0-3.5 7"/>');
let nickT;IN.nick=el=>{IN.f(el);clearTimeout(nickT);const v=el.value;nickT=setTimeout(()=>{if(cur().f.nick!==v)return;const e=V.nick(v);if(v.length>=3){setErr('nick',e);if(!e){const f=$('[data-field="nick"]');if(f&&!$('.fok',f)){const d=document.createElement('div');d.className='fok';d.innerHTML=I.okc+L('Ник свободен','Nickname is available');$('.fhint',f)?.replaceWith(d);}}}},450);};
CH.dob=el=>{const r=cur();r.f[el.name]=el.value;r.dirty=true;if(r.err)delete r.err.dob;refresh();};
ACT.pickPron=a=>{const r=cur();r.f.pron=r.f.pron===a.dataset.v?'':a.dataset.v;refresh();};
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
  S.me.nick=fv('nick').trim();S.me.name=fv('name').trim();S.me.dob=`${r.f.yy}-${String(r.f.mm).padStart(2,'0')}-${String(r.f.dd).padStart(2,'0')}`;S.me.pron=r.f.pron||null;S.me.email=r.p.email||'';S.me.methods=[r.p.via||'email'];
  go('A05',{step:1});});};
SC.A04X={auth:1,title:()=>'18+',render:()=>`${bar('',{back:1})}<div class="view nodock"><div class="auth-wrap">${empty('shield',L('FetUre только для взрослых','FetUre is for adults only'),L('Судя по дате рождения, тебе ещё нет 18. Мы не создали аккаунт и не сохранили введённые данные.','Based on your date of birth you’re not 18 yet. We didn’t create an account or keep what you entered.'),`<button class="btn soft" data-back>${L('Я ошибся в дате','I entered the wrong date')}</button><button class="btn text" data-act="toWelcome">${L('На главную','Back to start')}</button>`)}</div></div>`};
ACT.toWelcome=()=>{S.nav.auth=[{id:'A01',p:{},f:{}}];render('back');};

/* A05 — optional first steps: identity (private by default) → where to start */
SC.A05={auth:1,title:()=>L('Первые шаги','First steps'),render:(p,r)=>{
 if(p.step===2)return `${bar('',{back:1,actions:`<span class="pill">2 / 2</span>`})}<div class="view nodock"><div class="auth-wrap">
  <div class="steps"><i class="on"></i><i class="on"></i></div>
  <h2 class="t">${L('С чего начнём?','Where shall we start?')}</h2><p class="lead">${L('Можно всё сразу или ничего — это не обязательный шаг.','Do it all or nothing — this step is optional.')}</p>
  ${[['test','l','X07',{id:'roles'},L('Короткий тест «Роли»','Short “Roles” quiz'),L('10 вопросов · 3 минуты · ответы видишь только ты','10 questions · 3 minutes · only you see the answers')],['compass','v','X01',{sub:'explore'},L('Изучить темы','Explore topics'),L('Термины простыми словами и проверенные материалы','Plain-language terms and reviewed guides')],['feed','g','F01',{sub:'foryou'},L('Почитать ленту','Read the feed'),L('Истории и вопросы людей рядом','Stories and questions from people nearby')]].map(([i,t,g,pp,b,s])=>`<button class="testc" data-act="finishOnb" data-v="${g}" data-p='${JSON.stringify(pp)}'><span class="ico ${t}" style="width:48px;height:48px;border-radius:16px">${I[i]}</span><span class="tx"><b>${b}</b><small>${s}</small></span>${I.chev}</button>`).join('')}
  <div class="alert info mt24">${I.info}<span>${L('Знакомства выключены. Включить их можно в разделе «Люди», когда будешь готов(а).','Dating is off. You can turn it on in People whenever you’re ready.')}</span></div>
  <button class="btn text mt8" data-act="finishOnb" data-v="F01">${L('Пропустить','Skip')}</button></div></div>`;
 r.f.gender=r.f.gender||[];r.f.orient=r.f.orient||[];r.f.format=r.f.format||[];
 return `${bar('',{back:1,actions:`<button class="btn text auto" data-act="a05skip">${L('Пропустить','Skip')}</button>`})}<div class="view nodock cta1"><div class="auth-wrap">
 <div class="steps"><i class="on"></i><i></i></div>
 <h2 class="t">${L('Кто ты','Who you are')}</h2><p class="lead">${L('Выбирай сколько угодно. Сейчас это видишь только ты — что показывать в профиле, решишь отдельно.','Pick as many as you like. Only you see this now — you decide separately what your profile shows.')}</p>
 ${[['gender',L('Гендер','Gender')],['orient',L('Ориентация','Orientation')],['format',L('Формат отношений','Relationship format')]].map(([g,t])=>`<div class="sec">${t}<span class="lockpill">${I.eyeoff}${L('только я','only me')}</span></div>${chipGroup(optItems(g),r.f[g],'idPick',{k:g}).replace('</div>',`<button class="chip" data-act="ownWord" data-v="${g}">${ic('plus',15)}${L('своё','other')}</button></div>`)}`).join('')}
 </div></div><div class="ctabar"><div class="wrap"><button class="btn primary" data-act="a05next">${L('Дальше','Continue')}</button></div></div>`;}};
ACT.idPick=a=>{const r=cur();const k=a.dataset.k,v=a.dataset.v;const arr=r.f[k];const i=arr.indexOf(v);i<0?arr.push(v):arr.splice(i,1);a.classList.toggle('on',i<0);a.classList.toggle('ck',i<0);a.setAttribute('aria-pressed',i<0);};
ACT.ownWord=a=>{S.ui.ow='';sheet(()=>({title:L('Своё слово','Your own word'),body:`<p class="lead">${L('Напиши, как называешь себя. Это увидишь только ты, пока не решишь иначе.','Write how you describe yourself. Only you will see it unless you decide otherwise.')}</p><label class="field"><input class="inp" id="ownw" maxlength="30" placeholder="${L('Например, «флюид»','For example, “fluid”')}" autofocus></label>`,foot:`<button class="btn primary" data-act="ownSave" data-v="${a.dataset.v}">${L('Добавить','Add')}</button>`}));};
ACT.ownSave=a=>{const v=$('#ownw').value.trim();if(!v){$('#ownw').classList.add('err');toast(L('Напиши хотя бы одно слово','Write at least one word'),{type:'err'});return;}const k=a.dataset.v;OPT[k].push([v.toLowerCase(),v,v]);cur().f[k].push(v.toLowerCase());closeSheet();refresh();toast(L('Добавлено','Added'),{type:'ok'});};
ACT.a05next=a=>{const r=cur();S.me.gender=r.f.gender;S.me.orient=r.f.orient;S.me.format=r.f.format[0]||null;go('A05',{step:2});};
ACT.a05skip=()=>go('A05',{step:2});
ACT.finishOnb=a=>{const target=a.dataset.v;const p=parseP(a);run(a,()=>{S.session={at:Date.now()};initNav();render('fade');if(target!=='F01'||p.sub)go(target,p);toast(L('Аккаунт создан. Добро пожаловать!','Account created. Welcome!'),{type:'ok'});},{ms:400});};
function signIn(persona){closeSheet(true);const lang=S.lang;S=freshState(persona);S.lang=lang;S.session={at:Date.now()};initNav();QA.seen={};render('fade');}

/* A06–A08 — age check is a separate real process, never a checkbox */
function needAge(then){
 if(S.me.ageCheck==='ok')return true;
 sheet(()=>({title:L('Нужна проверка возраста','Age check needed'),lead:`<span class="ico l">${I.shield}</span>`,body:`<p class="lead">${L('Это действие доступно только после проверки 18+. Дата рождения при регистрации — самодекларация, её недостаточно.','This is available only after an 18+ check. The date of birth you entered is self-declared and isn’t enough.')}</p>
 <div class="fact"><i class="g">${I.check}</i><span>${L('Займёт 1–2 минуты: селфи для оценки возраста или документ','Takes 1–2 minutes: a selfie age estimate or an ID')}</span></div>
 <div class="fact"><i class="g">${I.check}</i><span>${L('Проверку делает отдельный сервис; фото не становится аватаром и не публикуется','A separate service checks it; the photo never becomes your avatar or gets published')}</span></div>
 ${S.me.ageCheck==='pending'?`<div class="alert warn mt12">${I.clock}<span>${L('Проверка уже идёт — статус в «Я → Настройки».','A check is already in progress — see Me → Settings.')}</span></div>`:''}`,
 foot:S.me.ageCheck==='pending'?`<button class="btn soft" data-act="closeSheet">${L('Понятно','OK')}</button>`:`<button class="btn primary" data-act="ageStart">${L('Пройти проверку','Start the check')}</button><button class="btn text" data-act="closeSheet">${L('Не сейчас','Not now')}</button>`}));
 S.ui.ageThen=then;return false;
}
ACT.ageStart=()=>{closeSheet(true);go('A07',{});};
SC.A07={title:()=>L('Проверка возраста','Age check'),render:(p,r)=>{const st=r.st||'choose';
 if(st==='choose')return `${bar(L('Проверка возраста','Age check'),{back:1,sm:1})}<div class="view nodock">
 <p class="lead">${L('Выбери удобный способ. Результат — только «18+ подтверждено», без хранения документа в FetUre.','Choose a method. The result is just “18+ confirmed” — FetUre doesn’t store your ID.')}</p>
 <button class="radio ${r.m!=='doc'?'on':''}" data-act="ageM" data-v="selfie"><i></i><span class="tx"><b>${L('Селфи','Selfie')}</b><small>${L('Оценка возраста по лицу, около минуты','Face age estimate, about a minute')}</small></span></button>
 <button class="radio ${r.m==='doc'?'on':''}" data-act="ageM" data-v="doc"><i></i><span class="tx"><b>${L('Документ','ID document')}</b><small>${L('Паспорт или права, 2–3 минуты','Passport or licence, 2–3 minutes')}</small></span></button>
 <div class="alert mt16">${I.lock}<span>${L('Камера нужна только на время проверки. Снимок не попадёт в профиль, ленту или чаты.','The camera is used only during the check. The image never goes to your profile, feed or chats.')}</span></div>
 <button class="btn primary mt24" data-act="ageCam">${I.camera}${L('Разрешить камеру','Allow camera')}</button></div>`;
 if(st==='denied')return `${bar(L('Проверка возраста','Age check'),{back:1,sm:1})}<div class="view nodock">${empty('camera',L('Нет доступа к камере','No camera access'),L('Разреши камеру в настройках телефона или выбери проверку по документу с загрузкой файла.','Allow camera access in your phone settings, or choose an ID check with a file upload.'),`<button class="btn primary" data-act="ageCam">${L('Попробовать снова','Try again')}</button><button class="btn soft" data-act="ageUpload">${I.doc}${L('Загрузить файл документа','Upload an ID file')}</button>`)}</div>`;
 if(st==='shoot')return `${bar(L('Селфи','Selfie'),{back:1,sm:1})}<div class="view nodock"><div style="position:relative;aspect-ratio:3/4;border-radius:30px;overflow:hidden;background:#140B11;display:grid;place-items:center"><div style="width:62%;aspect-ratio:3/4;border-radius:50%;border:3px dashed rgba(255,255,255,.6)"></div><div style="position:absolute;bottom:16px;left:0;right:0;text-align:center;color:#fff;font-size:14px;font-weight:600">${L('Помести лицо в овал','Fit your face in the oval')}</div></div><button class="btn primary mt16" data-act="ageShot">${I.camera}${L('Сделать снимок','Take photo')}</button></div>`;
 return `${bar(L('Статус проверки','Check status'),{back:1,sm:1})}<div class="view nodock">${S.me.ageCheck==='ok'?empty('shield',L('18+ подтверждено','18+ confirmed'),L('Теперь доступны знакомства, расширенные профили и события 18+. Проверку повторять не нужно.','Dating, private profiles and 18+ events are now available. No need to repeat the check.'),`<button class="btn primary" data-act="ageDone">${L('Продолжить','Continue')}</button>`):`<div class="empty"><div class="em-ic">${I.clock}</div><h3>${L('Проверяем…','Checking…')}</h3><p>${L('Обычно это меньше минуты. Можно закрыть экран — пришлём уведомление.','Usually under a minute. You can leave — we’ll notify you.')}</p><div class="prog" style="width:220px"><i style="width:${r.prog||10}%"></i></div></div>`}</div>`;},
 after:(p,r)=>{if(r.st==='wait'&&S.me.ageCheck!=='ok'){clearTimeout(S.ui.ageT);S.ui.ageT=setTimeout(()=>{if(cur()!==r)return;S.me.ageCheck='ok';refresh();toast(L('Возраст подтверждён','Age confirmed'),{type:'ok'});},2600);setTimeout(()=>{const b=$('.prog i');if(b)b.style.width='90%';},60);}}};
ACT.ageM=a=>{cur().m=a.dataset.v;refresh();};
ACT.ageCam=a=>{const r=cur();r.tries=(r.tries||0)+1;run(a,()=>{r.st=r.tries===1?'denied':'shoot';refresh();});};
ACT.ageUpload=a=>run(a,()=>{const r=cur();r.st='wait';S.me.ageCheck='pending';refresh();});
ACT.ageShot=a=>run(a,()=>{const r=cur();r.st='wait';S.me.ageCheck='pending';refresh();},{ms:800});
ACT.ageDone=()=>{const then=S.ui.ageThen;S.ui.ageThen=null;back();then&&setTimeout(then,350);};
