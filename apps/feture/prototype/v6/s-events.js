/* ============ E: EVENTS — catalog, filters, details, RSVP/application/ticket, my events, organiser ============ */
const EF_DEF=()=>({format:'all',when:'any',types:[],lang:[],price:'any',open:false});
function evFiltered(f){
 return allEventIds().filter(id=>{const e=EV(id);if(isPast(id))return false;
  if(e.status==='review'&&e.organizer!=='me')return false;
  if(f.format==='offline'&&(e.format!=='offline'||S.me.city&&e.city!==S.me.city))return false;if(f.format==='online'&&e.format!=='online')return false;
  const d=(e.start-NOW)/DAY;if(f.when==='week'&&d>7)return false;if(f.when==='month'&&d>31)return false;
  if(f.when==='weekend'){const wd=new Date(e.start).getDay();if(!(wd===0||wd===6||wd===5))return false;}
  if((f.types||[]).length&&!f.types.includes(e.type))return false;
  if((f.lang||[]).length&&!f.lang.some(l=>e.lang.includes(l.toUpperCase())))return false;
  if(f.price==='free'&&e.price)return false;if(f.price==='paid'&&!e.price)return false;
  if(f.open&&e.approval)return false;return true;}).sort((a,b)=>EV(a).start-EV(b).start);
}
const efCount=f=>(f.when!=='any'?1:0)+(f.types||[]).length+(f.lang||[]).length+(f.price!=='any'?1:0)+(f.open?1:0);
function eventsList(){
 const f=Object.assign(EF_DEF(),S.filters.events);S.filters.events=f;const ids=evFiltered(f);const n=efCount(f);
 const soon=ids.filter(id=>!EV(id).cancelled&&EV(id).start-NOW<7*DAY),later=ids.filter(id=>!EV(id).cancelled&&EV(id).start-NOW>=7*DAY),canc=ids.filter(id=>EV(id).cancelled);
 const mine=myEventIds('going').length+myEventIds('interested').length+myEventIds('apps').length+myEventIds('organize').length;
 return `<div class="row g8" style="margin-bottom:12px"><button class="btn md soft" data-go="E10">${I.cal}${L('Мои события','My events')}${mine?` <span class="pill hot" style="min-height:22px">${mine}</span>`:''}</button><button class="btn md primary" data-go="E11">${I.plus}${L('Создать','Create')}</button></div>
 <div class="filterline"><div class="chips scroll">${[['all',L('Все','All')],['offline',S.me.city?L('В моём городе','My city'):L('Офлайн','In person')],['online',L('Онлайн','Online')]].map(([k,l])=>`<button class="chip filter ${f.format===k?'on':''}" data-act="evFormat" data-v="${k}" aria-pressed="${f.format===k}">${k==='online'?ic('video',15):k==='offline'?ic('pin',15):''}${l}</button>`).join('')}</div><button class="chip filter ${n?'on':''}" data-act="evFilters">${ic('filter',16)}${n?`<em>${n}</em>`:L('Фильтры','Filters')}</button></div>
 ${!ids.length?empty('cal',L('Событий не нашлось','No events found'),L('Попробуй другой формат или сними фильтры. Можно создать своё.','Try another format or remove filters. Or create your own.'),`<button class="btn soft" data-act="evReset">${L('Сбросить фильтры','Reset filters')}</button><button class="btn text" data-go="E11">${L('Создать событие','Create an event')}</button>`)
 :firstLoad('events',`${soon.length?`<div class="sec">${L('Ближайшие 7 дней','Next 7 days')}</div>${soon.map((id,i)=>eventCard(id,{i})).join('')}`:''}${later.length?`<div class="sec">${L('Позже','Later')}</div>${later.map((id,i)=>eventCard(id,{i})).join('')}`:''}${canc.length?`<div class="sec">${L('Отменены','Cancelled')}</div>${canc.map(id=>eventCard(id,{row:1})).join('')}`:''}`,`<div class="sk" style="height:250px;border-radius:24px;margin-top:20px"></div><div class="sk" style="height:250px;border-radius:24px;margin-top:12px"></div>`)}`;
}
ACT.evFormat=a=>{S.filters.events.format=a.dataset.v;refresh();};
ACT.evReset=()=>{S.filters.events=EF_DEF();refresh();};
/* E02 — event filters */
ACT.evFilters=(a,e,pre)=>{S.ui.ef=pre||JSON.parse(JSON.stringify(Object.assign(EF_DEF(),S.filters.events)));
 sheet(()=>{const f=S.ui.ef;const cnt=evFiltered(f).length;return{title:L('Фильтры событий','Event filters'),head:`<button class="btn text auto" data-act="efReset">${L('Сбросить','Reset')}</button>`,
 body:`<div class="sec">${L('Формат','Format')}</div>${seg([['all',L('Все','All')],['offline',L('Офлайн','In person')],['online',L('Онлайн','Online')]],f.format,'efSet','sm').replace(/data-act="efSet"/g,'data-act="efSet" data-k="format"')}
 <div class="sec">${L('Когда','When')}</div>${chipGroup([['any',L('Любое время','Any time')],['week',L('Эта неделя','This week')],['weekend',L('Выходные','Weekend')],['month',L('Этот месяц','This month')]],[f.when],'efSet',{k:'when'})}
 <div class="sec">${L('Тип','Type')}</div>${chipGroup(['meetup','workshop','talk','party'].map(t=>[t,evType(t)]),f.types,'efMulti',{k:'types'})}
 <div class="sec">${L('Язык события','Event language')}</div>${chipGroup([['ru','Русский'],['en','English'],['de','Deutsch']],f.lang,'efMulti',{k:'lang'})}
 <div class="sec">${L('Стоимость','Price')}</div>${chipGroup([['any',L('Любая','Any')],['free',L('Бесплатно','Free')],['paid',L('Платно','Paid')]],[f.price],'efSet',{k:'price'})}
 <div class="card list mt16">${toggleRow('efOpen',L('Без заявки','No application'),L('Только события, куда можно просто прийти','Only events you can simply attend'),f.open)}</div>
 <p class="note mt12">${L('Город и расстояние — по твоему городу в профиле. Точная геолокация не нужна.','City and distance use the city in your profile. No precise location needed.')}</p>`,
 foot:`<button class="btn primary ${cnt?'':'off'}" data-act="efApply">${cnt?L(`Показать ${pl(cnt,['событие','события','событий'],[])}`,`Show ${pl(cnt,[],['event','events'])}`):L('Нет подходящих событий','No matching events')}</button>`};});};
ACT.efSet=a=>{S.ui.ef[a.dataset.k]=a.dataset.v;resheet();};
ACT.efMulti=a=>{const arr=S.ui.ef[a.dataset.k];const i=arr.indexOf(a.dataset.v);i<0?arr.push(a.dataset.v):arr.splice(i,1);resheet();};
ACT.efOpen=()=>{S.ui.ef.open=!S.ui.ef.open;resheet();};
ACT.efReset=()=>{S.ui.ef=EF_DEF();resheet();};
ACT.efApply=()=>{S.filters.events=S.ui.ef;closeSheet();refresh();};

/* E03 — event details: RSVP, application and ticket are three separate statuses */
function evAccess(id){const e=EV(id),r=myR(id);if(e.organizer==='me')return true;if(e.cancelled||isPast(id))return false;return e.approval?r.app==='approved':r.status==='going';}
SC.E03={title:p=>EV(p.id)?T(EV(p.id).title):'',valid:p=>!!EV(p.id)&&(EV(p.id).status!=='review'||EV(p.id).organizer==='me'),render:(p)=>{
 const id=p.id,e=EV(id),r=myR(id),past=isPast(id),acc=evAccess(id),orgMe=e.organizer==='me';const saved=S.me.saved.events.includes(id);
 const diffTz=e.tz!==USER_TZ;
 const rsvpRow=!e.cancelled&&!past&&!orgMe&&(!e.approval||r.app==='approved')?`<div class="sec">${L('Твой ответ','Your answer')}</div><div class="rsvp">${[['interested',I.eye,L('Интересуюсь','Interested')],['going',I.check,L('Иду','Going')],['not',I.x,L('Не иду','Not going')]].map(([k,i,l])=>`<button class="${r.status===k?'on':''}" data-act="rsvp" data-v="${k}" aria-pressed="${r.status===k}">${i}${l}</button>`).join('')}</div>`:'';
 const lines=[];
 if(!orgMe&&!e.cancelled&&!past){
  lines.push([I.check,L('Ответ','Answer'),{none:L('не выбран','not chosen'),interested:L('интересуюсь — это не заявка и не билет','interested — not an application or ticket'),going:L('иду','going'),not:L('не иду','not going')}[r.status||'none']]);
  if(e.approval)lines.push([I.doc,L('Заявка','Application'),{none:L('не подана — нужна для участия','not submitted — required to attend'),pending:L('на рассмотрении у организатора','being reviewed by the organiser'),approved:L('одобрена','approved'),declined:L('отклонена','declined')}[r.app||'none']]);
  if(e.price||e.external)lines.push([I.ticket,L('Билет','Ticket'),e.external?(r.ticket==='self'?L('ты отметил(а), что купил(а) на сайте','you marked it as bought on the site'):L('продаётся на сайте организатора, мы его не проверяем','sold on the organiser’s site; we don’t verify it')):L(`оплата на месте, ${T(e.price)}`,`pay at the door, ${T(e.price)}`)]);
  lines.push([I.eyeoff,L('Видимость','Visibility'),r.show?L('другие видят, что ты идёшь','others can see you’re going'):L('твоё участие видит только организатор','only the organiser sees you’re attending')]);
 }
 let cta='';
 if(orgMe)cta=`<button class="btn primary" data-go="E15" data-id="${id}">${I.gear}${L('Панель организатора','Manage event')}</button>`;
 else if(e.cancelled)cta=`<button class="btn soft" data-act="similar">${L('Похожие события','Similar events')}</button>`;
 else if(past)cta=`<button class="btn soft off">${L('Событие прошло','This event has ended')}</button>`;
 else if(e.approval&&r.app==='none'||e.approval&&!r.app)cta=`<button class="btn primary" data-go="E06" data-id="${id}">${I.doc}${L('Подать заявку','Apply to attend')}</button>`;
 else if(e.approval&&r.app==='pending')cta=`<button class="btn soft" data-act="withdrawApp">${L('Отозвать заявку','Withdraw application')}</button>`;
 else if(e.approval&&r.app==='declined')cta=`<button class="btn soft off">${L('Заявка отклонена','Application declined')}</button>`;
 else if(acc&&e.external&&r.ticket!=='self')cta=`<button class="btn primary" data-act="extTicket">${I.ticket}${L('Билет у организатора','Get ticket from organiser')}</button>`;
 else if(acc)cta=`<button class="btn primary" data-act="venue">${e.format==='online'?`${I.video}${L('Как подключиться','How to join')}`:`${I.pin}${L('Адрес и как пройти','Address & directions')}`}</button>`;
 else cta=`<button class="btn primary" data-act="rsvp" data-v="going">${I.check}${L('Иду','I’m going')}</button>`;
 return `<header class="bar overlay"><button class="ibtn glass" data-back aria-label="${L('Назад','Back')}">${I.back}</button><span style="flex:1"></span><button class="ibtn glass" data-act="evShare" aria-label="${L('Поделиться','Share')}">${I.share}</button><button class="ibtn glass" data-act="evMenu" aria-label="${L('Ещё','More')}">${I.more}</button></header>
 <div class="view nodock top0 cta1"><div class="wrap"><div class="ev-hero">${plate(e.plate,'cal')}<div class="pc-info"><div class="row g8" style="margin-bottom:10px"><span class="pill" style="background:rgba(255,255,255,.2);color:#fff">${e.format==='online'?I.video:I.pin}${e.format==='online'?L('Онлайн','Online'):esc(city(e.city))}</span><span class="pill" style="background:rgba(255,255,255,.2);color:#fff">${esc(evType(e.type))}</span></div><h2 class="ev-title">${esc(T(e.title))}</h2></div></div>
 ${e.cancelled?`<div class="alert err mt16">${I.alert}<span><b>${L('Событие отменено','Event cancelled')}</b>${esc(T(e.cancelled))}</span></div>`:''}
 ${e.status==='review'?`<div class="alert warn mt16">${I.clock}<span><b>${L('На проверке','In review')}</b>${L('Пока событие видишь только ты. Обычно проверка занимает до часа.','Only you can see the event for now. Review usually takes under an hour.')}</span></div>`:''}
 <div class="card list mt16">
  <button class="li" data-go="${orgMe?'P03':'P01'}" data-p='${JSON.stringify({id:e.organizer})}'>${av(e.organizer,'sm')}<span class="tx"><b>${esc(pname(e.organizer))}</b><small>${L('Организатор','Organiser')}</small></span>${I.chev}</button>
  ${e.community?`<button class="li" data-go="C03" data-id="${e.community}"><span class="av sm" style="position:relative">${plate(COMMUNITIES[e.community].plate)}</span><span class="tx"><b>${esc(T(COMMUNITIES[e.community].name))}</b><small>${L('Сообщество','Community')}</small></span>${I.chev}</button>`:''}
 </div>
 <div class="card list mt12">
  <div class="li"><span class="ico l">${I.cal}</span><span class="tx"><b>${F.day(e.start)}</b><small>${F.time(e.start)}–${F.time(e.end)} ${diffTz?`${L('у тебя','your time')} · ${F.time(e.start,e.tz)} ${F.tzName(e.tz)}`:F.tzName(USER_TZ)}</small></span></div>
  <div class="li"><span class="ico v">${e.format==='online'?I.video:I.pin}</span><span class="tx"><b>${e.format==='online'?L('Онлайн','Online'):esc(T(e.area)+', '+city(e.city))}</b><small>${acc?(e.format==='online'?L('Ссылка доступна — нажми «Как подключиться»','Link available — tap “How to join”'):esc(T(e.venue))):e.approval?L('Адрес и ссылка откроются после одобрения заявки','Address and link open after your application is approved'):L('Точное место откроется, когда ответишь «Иду»','The exact place opens once you answer “Going”')}</small></span>${acc?'':`<span class="lockpill">${I.lock}</span>`}</div>
  <div class="li"><span class="ico g">${I.globe}</span><span class="tx"><b>${e.lang}</b><small>${L('Язык события','Event language')}</small></span></div>
  <div class="li"><span class="ico a">${I.ticket}</span><span class="tx"><b>${e.price?esc(T(e.price)):L('Бесплатно','Free')}</b><small>${e.external?L(`Билеты: ${e.external}`,`Tickets: ${e.external}`):e.approval?L('Участие по заявке','By application'):L('Можно просто прийти','Just come along')}</small></span></div>
 </div>
 <div class="sec">${L('О событии','About')}</div><p style="margin:0;font-size:15.5px;line-height:1.55">${esc(T(e.desc))}</p>
 ${e.reqs&&e.reqs.length?`<div class="sec">${L('Условия участия','Requirements')}</div><div class="card">${e.reqs.map(x=>`<div class="fact"><i class="v">${I.check}</i><span>${esc(T(x))}</span></div>`).join('')}<p class="note mt8">${L('Условия задаёт организатор. FetUre не даёт медицинских и юридических гарантий.','The organiser sets the requirements. FetUre gives no medical or legal guarantees.')}</p></div>`:''}
 ${rsvpRow}
 ${lines.length?`<div class="sec">${L('Твой статус','Your status')}</div><div class="card list">${lines.map(([i,b,s])=>`<div class="statusline"><span class="ico">${i}</span><span class="tx"><b>${b}</b><small>${s}</small></span></div>`).join('')}${!orgMe?`<button class="btn text auto" data-act="rsvpPrivacy" style="min-height:40px">${L('Настроить видимость участия','Attendance visibility')}</button>`:''}</div>`:''}
 ${(e.announce||[]).length||S.updates.some(u=>u.e===id)?`<div class="sec">${L('Объявления организатора','Organiser updates')}</div>${S.updates.filter(u=>u.e===id).map(updCard).join('')}`:''}
 </div></div>
 <div class="ctabar"><div class="wrap"><div class="row g8"><button class="ibtn" style="width:52px;height:52px;border-radius:17px" data-act="saveEvent" data-v="${id}" aria-pressed="${saved}" aria-label="${L('Сохранить','Save')}">${saved?I.bookmarkf:I.bookmark}</button>${cta.replace('class="btn','style="flex:1" class="btn')}</div></div></div>`;}};
ACT.saveEvent=a=>{const id=a.dataset.v;const s=S.me.saved.events;const i=s.indexOf(id);i<0?s.push(id):s.splice(i,1);a.innerHTML=i<0?I.bookmarkf:I.bookmark;toast(i<0?L('Сохранено. Это не ответ «Иду»','Saved. This isn’t a “Going” answer'):L('Убрано из сохранённого','Removed from saved'),{type:i<0?'ok':''});};
ACT.evShare=()=>toast(L('Ссылка на событие скопирована. Адрес по ней не раскрывается','Event link copied. It doesn’t reveal the address'),{type:'ok'});
ACT.evMenu=()=>sheet(()=>({title:L('Событие','Event'),body:`<div class="card list">${linkRow({act:'addCal',icon:'calplus',title:L('Добавить в календарь','Add to calendar'),noChev:1})}${linkRow({act:'evShare',icon:'link',title:L('Скопировать ссылку','Copy link'),noChev:1})}${linkRow({act:'report',v:'event',icon:'flag',cls:'danger',title:L('Пожаловаться','Report'),noChev:1})}</div>`}));
ACT.addCal=()=>{closeSheet();toast(L('Добавлено в календарь','Added to calendar'),{type:'ok'});};
ACT.similar=()=>{back();setTimeout(()=>tab('feed',{sub:'events'}),50);};
/* E05 — RSVP and privacy */
ACT.rsvp=a=>{const id=cur().p.id;const e=EV(id);const v=a.dataset.v;
 if(e.reqs.some(x=>/18\+/.test(T(x)))&&v==='going'&&!needAge(()=>ACT.rsvp(a)))return;
 S.ui.rv={status:v,show:myR(id).show??S.me.rsvpShow};
 if(v!=='going'){run(a,()=>{S.rsvp[id]={...myR(id),status:v};refresh();},{ok:v==='interested'?L('Отметили «Интересуюсь». Это не заявка и не билет','Marked “Interested”. That’s not an application or ticket'):L('Ответ снят','Answer removed')});return;}
 rsvpSheet(id);};
ACT.rsvpPrivacy=()=>{const id=cur().p.id;S.ui.rv={status:myR(id).status,show:myR(id).show??S.me.rsvpShow};rsvpSheet(id);};
function rsvpSheet(id){const e=EV(id);sheet(()=>{const v=S.ui.rv;return{title:L('Ответ и видимость','RSVP and privacy'),body:`
 ${[['none',L('Без ответа','No response'),L('Не участвовать в списках','Stay out of attendee lists')],['interested',L('Интересуюсь','Interested'),L('Напомним о событии. Это не заявка','We’ll remind you. Not an application')],['going',L('Иду','Going'),e.external?L('Билет нужно купить у организатора отдельно','You still need a ticket from the organiser'):L('Откроем адрес или ссылку','We’ll reveal the address or link')]].map(([k,t,s])=>`<button class="radio ${v.status===k?'on':''}" data-act="rvSet" data-v="${k}"><i></i><span class="tx"><b>${t}</b><small>${s}</small></span></button>`).join('')}
 <div class="card list mt16">${toggleRow('rvShow',L('Показывать моё участие другим','Show my attendance to others'),L('В списке участников, в профиле и подсказках знакомым — везде одинаково','In the attendee list, on your profile and in suggestions — the same everywhere'),v.show)}</div>
 <p class="note mt12">${L('Организатор видит всех, кто ответил «Иду», — так он готовит место. Анонимность действует только для других участников.','The organiser sees everyone who answered “Going” to prepare the venue. Anonymity applies only to other attendees.')}</p>`,
 foot:`<button class="btn primary" data-act="rvSave">${L('Сохранить ответ','Save answer')}</button>`};});}
ACT.rvSet=a=>{S.ui.rv.status=a.dataset.v;resheet();};
ACT.rvShow=()=>{S.ui.rv.show=!S.ui.rv.show;resheet();};
ACT.rvSave=a=>{const id=cur().p.id;const v={...S.ui.rv};const e=EV(id);if(v.status==='going'&&(e.reqs||[]).some(x=>/18\+/.test(T(x)))&&S.me.ageCheck!=='ok'){closeSheet(true);needAge(()=>{S.ui.rv=v;rsvpSheet(id);});return;}run(a,()=>{S.rsvp[id]={...myR(id),status:v.status,show:v.show};closeSheet();refresh();},{ok:()=>v.status==='going'?(EV(id).external?L('Ты в списке «Иду». Билет — на сайте организатора','You’re on the “Going” list. Get the ticket on the organiser’s site'):L('Ты в списке «Иду». Место открыто ниже','You’re going. The place is now shown below')):L('Сохранено','Saved')});};
ACT.withdrawApp=()=>{const id=cur().p.id;ask({icon:'doc',title:L('Отозвать заявку?','Withdraw application?'),text:L('Организатор перестанет её видеть. Подать снова можно, пока идёт набор.','The organiser won’t see it anymore. You can apply again while applications are open.'),ok:L('Отозвать','Withdraw'),danger:true}).then(ok=>{if(ok)run(null,()=>{S.rsvp[id]={status:'none',app:'none'};refresh();},{ok:L('Заявка отозвана','Application withdrawn')});});};
/* E08 venue / joining link; E09 external ticket */
ACT.venue=()=>{const e=EV(cur().p.id);sheet(()=>({title:e.format==='online'?L('Подключение','How to join'):L('Адрес','Address'),body:e.format==='online'?`<div class="card flat"><div class="flabel">${L('Ссылка','Link')}</div><b style="font-size:16px;word-break:break-all">${esc(e.link||'meet.feture.app')}</b><p class="note mt8">${L('Ссылка личная: не пересылай её. Она проверяет доступ при каждом открытии.','The link is personal — don’t forward it. Access is checked every time it opens.')}</p></div>`
 :`<div class="card flat"><b style="font-size:16px">${esc(T(e.venue))}</b><p class="note mt8">${esc(T(e.area))}, ${esc(city(e.city))} · ${F.day(e.start)}, ${F.time(e.start)}</p></div><p class="note mt12">${L('Адрес видят только допущенные участники. Если доступ отзовут, он пропадёт.','Only admitted attendees see the address. If access is revoked it disappears.')}</p>`,
 foot:`<button class="btn primary" data-act="extOpen" data-v="${e.format==='online'?'link':'map'}">${e.format==='online'?`${I.ext}${L('Открыть ссылку','Open link')}`:`${I.map}${L('Открыть в картах','Open in maps')}`}</button><button class="btn soft" data-act="addCal">${I.calplus}${L('В календарь','Add to calendar')}</button>`}));};
ACT.extOpen=()=>{closeSheet();toast(L('Открываем во внешнем приложении','Opening in an external app'),{type:'info'});};
ACT.extTicket=()=>{const id=cur().p.id,e=EV(id);sheet(()=>({title:L('Билет у организатора','Ticket from organiser'),lead:`<span class="ico a">${I.ticket}</span>`,body:`<div class="card list">${linkRow({icon:'people',title:pname(e.organizer),sub:L('Организатор','Organiser'),noChev:1})}${linkRow({icon:'globe',title:e.external,sub:L('Сайт продажи','Ticket site'),noChev:1})}${linkRow({icon:'ticket',title:T(e.price)||L('Бесплатно','Free'),sub:L('Цена со слов организатора','Price as stated by the organiser'),noChev:1})}</div>
 <div class="alert warn mt12">${I.info}<span>${L('Покупка проходит вне FetUre. Возврат в приложение не подтверждает оплату, а возвраты решает организатор.','The purchase happens outside FetUre. Coming back to the app doesn’t confirm payment; refunds are up to the organiser.')}</span></div>`,
 foot:`<button class="btn primary" data-act="extGo">${I.ext}${L(`Перейти на ${e.external}`,`Go to ${e.external}`)}</button><button class="btn soft" data-act="ticketSelf">${L('Я уже купил(а) билет','I already bought a ticket')}</button>`}));};
ACT.extGo=()=>{closeSheet();toast(L('Открываем сайт организатора','Opening the organiser’s site'),{type:'info'});};
ACT.ticketSelf=()=>{const id=cur().p.id;S.rsvp[id]={...myR(id),status:'going',ticket:'self'};closeSheet();refresh();toast(L('Отметили. Покажи билет на входе','Noted. Show your ticket at the door'),{type:'ok'});};

/* E06 — application */
SC.E06={title:()=>L('Заявка','Application'),valid:p=>!!EV(p.id),render:(p,r)=>{const e=EV(p.id);r.f.ok=r.f.ok||false;return `${bar(L('Заявка на участие','Apply to attend'),{back:1,sm:1,sub:esc(T(e.title))})}<div class="view nodock cta1"><div class="wrap">
 <div class="alert info">${I.info}<span>${L('Организатор увидит ник, возраст и ответы ниже. Расширенный профиль и карта не прикладываются.','The organiser will see your nickname, age and the answers below. Your private profile and map are not attached.')}</span></div>
 <div style="height:14px"></div>${(e.q||[{ru:'Расскажи немного о себе',en:'Tell us a bit about yourself'}]).map((q,i)=>field({name:'q'+i,label:T(q),textarea:1,max:300,attrs:'rows="3"'})).join('')}
 ${field({name:'note',label:L('Что важно знать организатору','Anything the organiser should know'),opt:1,ph:L('Например, доступность площадки','For example, venue accessibility'),textarea:1,max:300,attrs:'rows="2"'})}
 <button class="check ${r.f.ok?'on':''} ${r.err&&r.err.ok?'err':''}" data-act="chk" data-v="ok" data-field="ok"><i>${I.check}</i><span>${L('Прочитал(а) условия участия и согласен(на) с ними','I’ve read and accept the requirements')}${r.err&&r.err.ok?`<span class="ferr">${I.alert}${r.err.ok}</span>`:''}</span></button>
 </div></div><div class="ctabar"><div class="wrap"><button class="btn primary" data-act="sendApp">${L('Отправить заявку','Send application')}</button></div></div>`;}};
ACT.sendApp=a=>{const r=cur();const e=EV(r.p.id);r.err={};(e.q||[1]).forEach((q,i)=>{const v=fv('q'+i).trim();if(v.length<3)r.err['q'+i]=L('Ответь хотя бы парой слов','Answer in at least a few words');});if(!r.f.ok)r.err.ok=L('Нужно согласие с условиями','You need to accept the requirements');
 if(Object.keys(r.err).length){refresh();shakeFirstErr();return;}
 if(e.reqs.some(x=>/18\+/.test(T(x)))&&!needAge(()=>ACT.sendApp($('[data-act="sendApp"]'))))return;
 run(a,()=>{S.rsvp[r.p.id]={...myR(r.p.id),status:'going',app:'pending'};r.dirty=false;back();},{ok:L('Заявка отправлена. Ответ придёт в уведомления','Application sent. You’ll be notified of the answer')});};

/* E10 — my events: only events with MY status (fix: previously showed all events) */
SC.E10={title:()=>L('Мои события','My events'),render:(p)=>{const k=p.k||'going';
 const tabs=[['going',L('Иду','Going')],['interested',L('Интересуюсь','Interested')],['apps',L('Заявки','Applications')],['organize',L('Организую','Organising')],['past',L('Прошедшие','Past')]].map(([id,l])=>[id,l,myEventIds(id).length||'']);
 const ids=myEventIds(k);
 const txt={going:L('Отметь «Иду» на странице события — оно появится здесь.','Answer “Going” on an event page and it shows up here.'),interested:L('Сюда попадают события с отметкой «Интересуюсь».','Events you marked “Interested” land here.'),apps:L('Здесь статусы твоих заявок на события с отбором.','Your applications to events with admission appear here.'),organize:L('Создай своё событие — онлайн или офлайн.','Create your own event — online or in person.'),past:L('Прошедшие события, где ты был(а). Отметка не публикуется.','Past events you attended. Never published.')}[k];
 return `${bar(L('Мои события','My events'),{back:1,sm:1,actions:`<button class="ibtn" data-go="E11" aria-label="${L('Создать событие','Create event')}">${I.plus}</button>`})}<div class="view nodock"><div class="wrap">${tabsRow(tabs,k,'e10tab')}
 ${ids.length?ids.map((id,i)=>eventCard(id,{row:1,i})).join('<div style="height:10px"></div>'):empty('cal',L('Пока пусто','Nothing here yet'),txt,k==='organize'?`<button class="btn primary" data-go="E11">${L('Создать событие','Create an event')}</button>`:`<button class="btn soft" data-act="toEvents">${L('Смотреть события','Browse events')}</button>`)}
 </div></div>`;}};
ACT.e10tab=a=>setP('k',a.dataset.v);
ACT.toEvents=()=>tab('feed',{sub:'events'});

/* E11–E14 — create event in 4 short steps with validation */
const pad=n=>String(n).padStart(2,'0');
const isoDay=ts=>{const d=new Date(ts);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
SC.E11={title:()=>L('Новое событие','New event'),render:(p,r)=>{
 const step=r.step||1;const f=r.f;f.type=f.type||'';f.format=f.format||'offline';f.tz=f.tz||USER_TZ;f.date=f.date||isoDay(NOW+7*DAY);f.t1=f.t1||'19:00';f.t2=f.t2||'21:00';f.price=f.price||'free';f.approval=f.approval??false;f.plate=f.plate||'rose';f.city=f.city||'berlin';
 const names=[L('Основное','Basics'),L('Время и место','Time & place'),L('Условия','Admission'),L('Проверка','Review')];
 const head=`${bar(L('Новое событие','New event'),{back:1,sm:1})}<div class="view nodock cta1"><div class="wrap"><div class="stepper"><span>${step}/4 · ${names[step-1]}</span><div class="qprog"><i style="width:${step*25}%"></i></div></div>`;
 let body='';
 if(step===1)body=`${field({name:'title',label:L('Название','Title'),ph:L('Например, «Кофе для новичков»','For example, “Newcomers coffee”'),max:80})}
  <div class="field ${r.err&&r.err.type?'err':''}" data-field="type"><span class="flabel">${L('Тип','Type')}</span>${chipGroup(['meetup','workshop','talk','party'].map(t=>[t,evType(t)]),[f.type],'evfType')}${r.err&&r.err.type?`<div class="ferr">${I.alert}${r.err.type}</div>`:''}</div>
  ${field({name:'desc',label:L('Описание','Description'),textarea:1,max:1500,ph:L('Что будет, для кого, как всё устроено','What happens, who it’s for, how it works'),attrs:'rows="5"'})}
  <div class="field"><span class="flabel">${L('Обложка','Cover')}</span><div class="chips">${['rose','sea','amber','lilac','moss','coal'].map(k=>`<button data-act="evfPlate" data-v="${k}" aria-label="${k}" style="position:relative;width:52px;height:52px;border-radius:16px;overflow:hidden;outline:${f.plate===k?'3px solid var(--ink)':'0'};outline-offset:2px">${plate(k)}</button>`).join('')}</div></div>`;
 if(step===2)body=`<div class="field"><span class="flabel">${L('Формат','Format')}</span>${seg([['offline',L('Офлайн','In person')],['online',L('Онлайн','Online')]],f.format,'evfFormat','sm')}</div>
  <div class="row g8" style="align-items:flex-start"><div class="grow">${field({name:'date',label:L('Дата','Date'),type:'date',attrs:`min="${isoDay(NOW)}"`})}</div></div>
  ${field({name:'date2',label:L('Дата завершения — если позже','End date — if later'),type:'date',opt:true})}<div class="row g8" style="align-items:flex-start"><div class="grow">${field({name:'t1',label:L('Начало','Start'),type:'time'})}</div><div class="grow">${field({name:'t2',label:L('Конец','End'),type:'time'})}</div></div>
  <label class="field"><span>${L('Часовой пояс','Time zone')}</span><select class="inp" name="tz" data-ch="fsel">${!['Europe/Berlin','Europe/Moscow','Europe/London'].includes(f.tz)?`<option value="${esc(f.tz)}" selected>${esc(f.tz)} · ${L('выбрано','selected')}</option>`:''}<option value="Europe/Berlin" ${f.tz==='Europe/Berlin'?'selected':''}>${L('Берлин (CET/CEST)','Berlin (CET/CEST)')}</option><option value="Europe/Moscow" ${f.tz==='Europe/Moscow'?'selected':''}>${L('Москва (MSK)','Moscow (MSK)')}</option><option value="Europe/London" ${f.tz==='Europe/London'?'selected':''}>${L('Лондон (GMT/BST)','London (GMT/BST)')}</option></select><div class="fhint">${L('Участники увидят и твоё время, и своё.','Attendees see both your time and theirs.')}</div></label>
  ${f.format==='offline'?`<label class="field"><span>${L('Город','City')}</span><select class="inp" name="city" data-ch="fsel">${['berlin','hamburg','moscow'].map(c=>`<option value="${c}" ${f.city===c?'selected':''}>${city(c)}</option>`).join('')}</select></label>${field({name:'area',label:L('Район — виден всем','Area — visible to everyone'),ph:L('Кройцберг','Kreuzberg')})}${field({name:'addr',label:L('Точный адрес — только допущенным','Exact address — admitted only'),icon:'lock',ph:L('Улица, дом, вход','Street, number, entrance')})}`
  :field({name:'link',label:L('Ссылка на встречу — только допущенным','Meeting link — admitted only'),icon:'link',type:'url',ph:'https://',attrs:'inputmode="url"'})}`;
 if(step===3)body=`<div class="card list">${toggleRow('evfAppr',L('Участие по заявке','Admission by application'),L('Ты одобряешь каждого, адрес откроется после одобрения','You approve each person; the address opens after approval'),f.approval)}</div>
  ${f.approval?`<div style="height:12px"></div>${field({name:'q0',label:L('Вопрос к заявке','Application question'),ph:L('Например, был ли опыт?','E.g. any experience?'),max:120})}`:''}
  <div class="field mt16"><span class="flabel">${L('Стоимость','Price')}</span>${seg([['free',L('Бесплатно','Free')],['door',L('На месте','At the door')],['ext',L('Билет на сайте','Ticket site')]],f.price,'evfPrice','sm')}</div>
  ${f.price!=='free'?field({name:'amount',label:L('Цена','Price'),ph:'15 €'}):''}${f.price==='ext'?field({name:'ext',label:L('Сайт продажи билетов','Ticket website'),icon:'link',ph:'tickets.example.org',hint:L('FetUre не продаёт билеты и не проверяет оплату.','FetUre doesn’t sell tickets or verify payment.')}):''}
  ${field({name:'reqs',label:L('Условия участия','Requirements'),opt:1,textarea:1,max:500,ph:L('Дресс-код, правила, что взять с собой','Dress code, rules, what to bring'),attrs:'rows="3"'})}
  <div class="alert mt8">${I.eyeoff}<span>${L('Списки участников по умолчанию скрыты. Каждый сам решает, показывать ли своё участие.','Attendee lists are hidden by default. Everyone decides whether to show their attendance.')}</span></div>`;
 if(step===4){const fake=evFromForm(r);S.extraEvents.__pv=fake;body=`${seg([['all',L('Как видят все','Public view')],['ok',L('Допущенные','Admitted view')]],r.pv||'all','evfPv','sm')}<div style="pointer-events:none">${eventCard('__pv')}</div>
  <div class="card list mt12"><div class="li"><span class="ico ${r.pv==='ok'?'g':''}">${r.pv==='ok'?I.unlock:I.lock}</span><span class="tx"><b>${fake.format==='online'?L('Ссылка','Link'):L('Адрес','Address')}</b><small>${r.pv==='ok'?esc(fake.format==='online'?fake.link:T(fake.venue)):L('Скрыт до допуска','Hidden until admitted')}</small></span></div></div>
  <div class="alert warn mt12">${I.clock}<span>${L('После отправки событие проверят модераторы — обычно до часа. До этого его видишь только ты.','After you submit, moderators review the event — usually within an hour. Until then only you can see it.')}</span></div>`;delete S.extraEvents.__pv;}
 return head+body+`</div></div><div class="ctabar"><div class="wrap"><div class="row g8">${step>1?`<button class="btn soft" style="flex:0 0 auto;width:auto" data-act="evfStep" data-v="-1">${I.back}</button>`:''}<button class="btn primary" data-act="${step<4?'evfNext':'evfSubmit'}">${step<4?L('Дальше','Next'):L('Отправить на проверку','Submit for review')}</button></div></div></div>`;}};
function evFromForm(r){const f=r.f;const [y,m,d]=(f.date||isoDay(NOW)).split('-').map(Number);const [ye,me,de]=(f.date2||f.date||isoDay(NOW)).split('-').map(Number);const [h1,mi1]=f.t1.split(':').map(Number);const [h2,mi2]=f.t2.split(':').map(Number);
 const start=zonedTime(y,m,d,h1,mi1,f.tz);const end=zonedTime(ye,me,de,h2,mi2,f.tz);
 return{title:{ru:f.title,en:f.title},type:f.type||'meetup',format:f.format,city:f.city,area:{ru:f.area||'',en:f.area||''},venue:{ru:f.addr||'',en:f.addr||''},link:f.link,start,end,tz:f.tz,lang:S.lang.toUpperCase(),price:f.price==='free'?null:{ru:f.amount||'',en:f.amount||''},external:f.price==='ext'?f.ext:null,organizer:'me',community:null,approval:f.approval,plate:f.plate,desc:{ru:f.desc,en:f.desc},reqs:f.reqs?[{ru:f.reqs,en:f.reqs}]:[],q:f.approval&&f.q0?[{ru:f.q0,en:f.q0}]:null,status:'review',apps:[],announce:[]};}
function evfValidate(r){const f=r.f;const e={};const s=r.step||1;
 if(s===1){if((f.title||'').trim().length<5)e.title=L('Минимум 5 символов','At least 5 characters');if(!f.type)e.type=L('Выбери тип события','Choose an event type');if((f.desc||'').trim().length<20)e.desc=L('Опиши подробнее — хотя бы 20 символов','Describe it a bit more — at least 20 characters');}
 if(s===2){const ev=evFromForm(r);if(!f.date)e.date=L('Укажи дату','Pick a date');else if(ev.start<Date.now())e.date=L('Дата уже прошла','That date has passed');
  if(!Number.isFinite(ev.start)||!Number.isFinite(ev.end)||ev.end<=ev.start)e.t2=L('Конец должен быть позже начала','End must be after start');
  if(f.format==='offline'){if(!(f.addr||'').trim())e.addr=L('Нужен адрес — его увидят только допущенные','Address needed — only admitted people will see it');if(!(f.area||'').trim())e.area=L('Укажи район','Enter the area');}
  else if(!/^https?:\/\/\S+\.\S+/.test(f.link||''))e.link=L('Нужна ссылка вида https://…','A link like https://… is needed');}
 if(s===3){if(f.price!=='free'&&!(f.amount||'').trim())e.amount=L('Укажи цену','Enter the price');if(f.price==='ext'&&!/\S+\.\S+/.test(f.ext||''))e.ext=L('Укажи сайт продажи','Enter the ticket website');if(f.approval&&!(f.q0||'').trim())e.q0=L('Задай хотя бы один вопрос','Ask at least one question');}
 r.err=e;return !Object.keys(e).length;}
ACT.evfNext=()=>{const r=cur();if(!evfValidate(r)){refresh();shakeFirstErr();return;}r.step=(r.step||1)+1;r.scroll=0;render('fwd');};
ACT.evfStep=()=>{const r=cur();r.step=Math.max(1,(r.step||1)-1);r.err={};render('back');};
ACT.evfType=a=>{const r=cur();r.f.type=a.dataset.v;r.dirty=true;if(r.err)delete r.err.type;refresh();};
ACT.evfPlate=a=>{cur().f.plate=a.dataset.v;refresh();};
ACT.evfFormat=a=>{cur().f.format=a.dataset.v;refresh();};
ACT.evfAppr=()=>{const r=cur();r.f.approval=!r.f.approval;r.dirty=true;refresh();};
ACT.evfPrice=a=>{cur().f.price=a.dataset.v;refresh();};
ACT.evfPv=a=>{cur().pv=a.dataset.v;refresh();};
CH.fsel=el=>{cur().f[el.name]=el.value;refresh();};
ACT.evfSubmit=a=>{const r=cur();run(a,()=>{const old=r.editId&&S.extraEvents[r.editId];const id=r.editId||'e'+Date.now();S.extraEvents[id]={...evFromForm(r),apps:old?old.apps:[],announce:old?old.announce:[],status:old?old.status:'review'};r.dirty=false;if(old){back();toast(L('Изменения сохранены. Участники получат уведомление','Changes saved. Attendees will be notified'),{type:'ok'});return;}
 const st=stack();st.pop();go('E15',{id},{replace:false});
 setTimeout(()=>{const e=S.extraEvents[id];if(e&&e.status==='review'){e.status='published';S.notifs.unshift({id:'n'+Date.now(),type:'evok',e:id,t:Date.now(),read:false,go:['E15',{id}]});if(cur().id==='E15'||cur().id==='E03')refresh();else renderSide();toast(L('Событие опубликовано','Your event is live'),{type:'ok'});}},6000);},{ok:()=>r.editId?'':L('Отправлено на проверку','Submitted for review')});};

/* E15–E18 — organiser panel */
SC.E15={title:()=>L('Панель организатора','Manage event'),valid:p=>!!EV(p.id)&&EV(p.id).organizer==='me',render:(p)=>{const id=p.id,e=EV(id);const apps=e.apps||[];const pend=apps.filter(a=>a.status==='pending').length,appr=apps.filter(a=>a.status==='approved').length;
 const st=e.cancelled?`<span class="pill bad">${L('Отменено','Cancelled')}</span>`:e.status==='review'?`<span class="pill wait">${L('На проверке','In review')}</span>`:`<span class="pill ok">${L('Опубликовано','Published')}</span>`;
 return `${bar(L('Панель организатора','Manage event'),{back:1,sm:1})}<div class="view nodock"><div class="wrap">
 ${eventCard(id,{row:1})}
 <div class="row mt12" style="justify-content:space-between">${st}<button class="btn text auto" data-go="E03" data-id="${id}">${L('Открыть страницу','View page')} ${ic('chev',16)}</button></div>
 ${e.cancelled?'':pend?`<div class="alert warn mt12">${I.doc}<span><b>${L('Следующий шаг','Next step')}</b>${L(`Ждут решения: ${pend}`,`Awaiting decision: ${pend}`)}</span></div>`:''}
 <div class="stat3">${[[pend,L('ждут решения','pending')],[appr,L('одобрено','approved')],[Object.values(S.rsvp).length?0:0,L('интересуются','interested')]].map(([n,l],i)=>`<div><b>${i===2?(e.interested||0):n}</b><small>${l}</small></div>`).join('')}</div>
 <div class="card list">${e.approval?linkRow({go:'E16',p:{id},icon:'doc',tone:'v',title:L('Заявки и допуски','Applications'),badge:pend||''}):''}${linkRow({act:'announce',icon:'bell',tone:'l',title:L('Объявление участникам','Post an update'),sub:L('Придёт в «Чаты → Обновления», не в личные чаты','Goes to Chats → Updates, not private chats')})}${linkRow({act:'evEdit',icon:'edit',title:L('Редактировать','Edit'),sub:L('Участникам придёт уведомление об изменении','Attendees get a change notification')})}${e.cancelled?'':linkRow({act:'evCancel',icon:'block',cls:'danger',title:L('Отменить событие','Cancel event'),noChev:1})}</div>
 ${(e.announce||[]).length?`<div class="sec">${L('Отправленные объявления','Sent updates')}</div>${e.announce.map(x=>`<div class="upd"><span class="ico l">${I.bell}</span><span class="tx"><p style="color:var(--ink);margin:0">${esc(x.text)}</p><small>${F.rel(x.t)}</small></span></div>`).join('')}`:''}
 <p class="note mt16">${L('Ты видишь только тех, кто ответил или подал заявку. Личные чаты, альбомы и карты участников организатору недоступны.','You only see people who answered or applied. Attendees’ private chats, albums and maps are never available to organisers.')}</p></div></div>`;}};
SC.E16={title:()=>L('Заявки','Applications'),valid:p=>!!EV(p.id)&&EV(p.id).organizer==='me',render:(p)=>{const e=EV(p.id);const k=p.k||'pending';const list=(e.apps||[]).filter(a=>a.status===k);
 return `${bar(L('Заявки','Applications'),{back:1,sm:1,sub:esc(T(e.title))})}<div class="view nodock"><div class="wrap">${seg([['pending',L('Ждут','Pending'),(e.apps||[]).filter(a=>a.status==='pending').length||''],['approved',L('Одобрены','Approved')],['declined',L('Отклонены','Declined')]],k,'e16tab')}
 ${list.length?list.map(a=>`<div class="card" style="margin-bottom:10px"><div class="row">${av(a.p,'')}<div class="grow"><b>${esc(pname(a.p))}, ${person(a.p).age}</b><div class="note">${esc(whoLine(a.p))}</div></div></div><div class="card flat mt12" style="padding:12px 14px"><div class="note">${esc(T((e.q||[{ru:'Ответ',en:'Answer'}])[0]))}</div><div style="margin-top:4px">${esc(T(a.answer))}</div></div>
  ${k==='pending'?`<div class="row g8 mt12"><button class="btn md primary" data-act="appDecide" data-v="${a.p}" data-d="approved">${L('Одобрить','Approve')}</button><button class="btn md soft" data-act="appDecide" data-v="${a.p}" data-d="declined">${L('Отклонить','Decline')}</button></div>`:''}</div>`).join(''):empty('doc',L('Здесь пусто','Nothing here'),k==='pending'?L('Новые заявки появятся здесь и в уведомлениях.','New applications appear here and in notifications.'):'')}
 <p class="note">${L('Причину отказа можно не объяснять. Человек увидит нейтральное «Заявка отклонена».','You don’t have to give a reason. The person sees a neutral “Application declined”.')}</p></div></div>`;}};
ACT.e16tab=a=>setP('k',a.dataset.v);
ACT.appDecide=a=>{const e=EV(cur().p.id);const x=e.apps.find(y=>y.p===a.dataset.v);run(a,()=>{x.status=a.dataset.d;refresh();},{ok:a.dataset.d==='approved'?L(`${pname(x.p)} допущен(а). Адрес откроется у неё/него`,`${pname(x.p)} approved. The address is now visible to them`):L('Заявка отклонена','Application declined'),undo:()=>{x.status='pending';refresh();}});};
ACT.announce=()=>{S.ui.an='';sheet(()=>({title:L('Объявление','Update'),body:`<p class="lead">${L('Получат все, кто ответил «Иду» или подал заявку. Ответить лично они не смогут — это не чат.','Everyone who answered “Going” or applied will receive it. They can’t reply privately — it’s not a chat.')}</p><label class="field" data-field="an"><textarea class="inp" id="anText" rows="4" maxlength="500" placeholder="${L('Например: начало переносится на 19:30','E.g.: start moves to 19:30')}" autofocus></textarea></label>`,foot:`<button class="btn primary" data-act="anSend">${I.send}${L('Отправить','Send')}</button>`}));};
ACT.anSend=a=>{const t=$('#anText').value.trim();if(t.length<5){$('#anText').classList.add('err');toast(L('Напиши объявление — минимум 5 символов','Write the update — at least 5 characters'),{type:'err'});return;}const e=EV(cur().p.id);run(a,()=>{e.announce=e.announce||[];e.announce.unshift({text:t,t:Date.now()});closeSheet();refresh();},{ok:L('Объявление отправлено','Update sent')});};
ACT.evEdit=()=>{const id=cur().p.id,e=EV(id);go('E11',{});const r=cur();r.editId=id;Object.assign(r.f,{title:T(e.title),type:e.type,desc:T(e.desc),format:e.format,plate:e.plate,link:e.link||'',approval:e.approval,area:T(e.area),addr:T(e.venue),city:e.city||'berlin',tz:e.tz,date:zonedDay(e.start,e.tz),date2:zonedDay(e.end,e.tz),t1:F.time(e.start,e.tz),t2:F.time(e.end,e.tz),reqs:(e.reqs||[]).map(T).join('\n'),price:e.external?'ext':e.price?'door':'free',amount:T(e.price),ext:e.external||'',q0:e.q?T(e.q[0]):''});refresh();};
ACT.evCancel=()=>{const id=cur().p.id;S.ui.cr='';sheet(()=>({title:L('Отменить событие?','Cancel the event?'),lead:`<span class="ico l">${I.block}</span>`,body:`<p class="lead">${L('Новые заявки и напоминания остановятся. Страница останется с пометкой «Отменено».','New applications and reminders stop. The page stays with a “Cancelled” label.')}</p><label class="field"><span>${L('Причина — увидят участники','Reason — attendees will see it')}<i>${L('необязательно','optional')}</i></span><textarea class="inp" id="cReason" rows="3" maxlength="300"></textarea></label><div class="alert warn">${I.ticket}<span>${L('Если продавались билеты на внешнем сайте, возврат делаешь ты — FetUre не возвращает деньги автоматически.','If tickets were sold on an external site, refunds are on you — FetUre doesn’t refund automatically.')}</span></div>`,foot:`<button class="btn danger" data-act="cDo">${L('Отменить событие','Cancel event')}</button><button class="btn soft" data-act="closeSheet">${L('Не отменять','Keep event')}</button>`}));};
ACT.cDo=a=>{const e=EV(cur().p.id);const reason=$('#cReason').value.trim();run(a,()=>{e.cancelled={ru:reason||'Организатор отменил событие.',en:reason||'The organiser cancelled the event.'};closeSheet();refresh();},{ok:L('Событие отменено. Участники получат уведомление','Event cancelled. Attendees will be notified')});};


function zonedParts(ts,tz){const p=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(ts);return Object.fromEntries(p.filter(x=>x.type!=='literal').map(x=>[x.type,+x.value]));}
function zonedDay(ts,tz){const p=zonedParts(ts,tz);return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;}
function zonedTime(y,m,d,h,mi,tz){if(![y,m,d,h,mi].every(Number.isFinite))return NaN;const target=Date.UTC(y,m-1,d,h,mi);let ts=target;for(let i=0;i<4;i++){const p=zonedParts(ts,tz);const delta=target-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);if(!delta)break;ts+=delta;}const p=zonedParts(ts,tz);return p.year===y&&p.month===m&&p.day===d&&p.hour===h&&p.minute===mi?ts:NaN;}
