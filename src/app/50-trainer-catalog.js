/* ---- экран аккаунта: карточка «Тренер» ---- */
function renderTrainerCard(){
  syncDockTabs();
  renderCatalogRow();
  if(!$('tglTrainer')) return;
  const accountReady = trainerAccountReady();
  const modeOn = !!(accountReady && trainer && trainer.on);
  $('tglTrainer').classList.toggle('on', modeOn);
  setShown('coachFields', modeOn);
  setShown('coachDeleteBlock', modeOn);
  if(document.activeElement !== $('coachName'))   $('coachName').value   = (trainer && trainer.name) || '';
  const ph = trainer && trainer.photo;
  coachPhotoDraft = ph || '';
  $('coachPhotoPrev').innerHTML = ph ? `<img src="${esc(ph)}" alt="">` : icon('camera');
  if(document.activeElement !== $('coachLinks')){
    $('coachLinks').value = ((trainer && trainer.links) || '').replace(/^https?:\/\//i, '');
    $('coachLinksErr').textContent = '';
  }
  if(document.activeElement !== $('coachAbout'))  $('coachAbout').value  = (trainer && trainer.about) || '';
  if(document.activeElement !== $('coachYears'))  $('coachYears').value  = (trainer && trainer.years) || '';
  // Ник принадлежит аккаунту, и без аккаунта он уйдёт вместе с телефоном. Говорим
  // об этом там, где ник заводят, а не постфактум.
  setShown('coachNoAcc', !accountReady);
}

/* ---- экран «Подопечные» ---- */
function renderClientsSkeleton(){
  const box = $('clsList');
  if(!box) return;
  box.innerHTML = Array.from({length:3}, () =>
    '<div class="cl-row cl-row-skeleton" aria-hidden="true">'
      + '<div class="ua sk"></div>'
      + '<div class="ub"><i class="sk cl-sk-name"></i><i class="sk cl-sk-sub"></i></div>'
      + '<i class="sk cl-sk-state"></i>'
    + '</div>'
  ).join('');
}
async function refreshClientsScreen(){
  const box = $('clsList');
  if(box && !box.children.length) renderClientsSkeleton();
  await loadTrainer();
  renderClients();
  await pullAll();
}
function openClients(){
  if(show._last === 'scrTrainer'){ refreshClientsScreen(); return; }
  goTab('scrTrainer');
}
async function pullAll(){
  const list = clients.filter(c => clProgs(c).some(pr => pr.link && pr.link.id));
  if(!list.length) return;
  let any = false;
  for(const c of list){ if(await pullClient(c)) any = true; }
  if(show._last === 'scrTrainer'){ renderClients(); renderTrainerCard(); }
  if(any && show._last === 'scrClient') fillClient();
}
function clientDayWord(n){
  return appLocale === 'ru' ? plural(n, 'день', 'дня', 'дней') : (n === 1 ? 'day' : 'days');
}
function renderClients(){
  const n = clients.length;
  const live = clients.filter(c => clientSum(c).n > 0).length;
  const total = clients.reduce((a, c) => a + clientSum(c).n, 0);
  setShown('clsSumCard', n > 0);
  if(n){
    const sum = $('clsSum');
    sum.innerHTML = '';
    // Подпись под числом, а не после него: тогда она не зависит от числа и её не
    // надо согласовывать. Заодно все три видны сразу, а не через точку в строке.
    [[t('clients.statClients'), n], [t('clients.statActive'), live], [t('clients.statWorkouts'), total]].forEach(([label, v]) => {
      const el = document.createElement('div');
      el.className = 'cl-stat' + (v ? '' : ' zero');
      el.innerHTML = '<b></b><small></small>';
      el.querySelector('b').textContent = v;
      el.querySelector('small').textContent = label;
      sum.appendChild(el);
    });
  }
  const box = $('clsList');
  box.innerHTML = '';
  clients.forEach((c, i) => {
    const sum = clientSum(c);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'cl-row';
    // Состояние говорится СЛОВОМ, а не одной приглушённостью: «ждёт» и «молчит 12 дней»
    // читаются с расстояния, а серый оттенок — нет.
    const newest = clProgs(c).slice().reverse().find(pr => pr.sentAt) || null;
    let state, tone = 'wait';
    if(sum.n > 0){
      const d = daysSince(sum.last);
      state = sum.n + ' ' + (appLocale === 'ru' ? plural(sum.n, t('clients.sessionOne'), t('clients.sessionFew'), t('clients.sessionMany')) : t(sum.n === 1 ? 'clients.sessionOne' : 'clients.sessionFew'));
      tone = (d != null && d > 10) ? 'cold' : 'ok';
      if(d != null && d > 10) state += ' · ' + t('clients.silent',{count:d,days:clientDayWord(d)});
    } else if(newest){
      const d = daysSince(newest.sentAt);
      // «Открыл, но не занимался» и «даже не открыл» — разные разговоры с человеком,
      // и тренеру нужно видеть, какой из них его.
      if(sum.opens > 0) state = t('clients.openedNoSessions');
      else state = d === 0 ? t('clients.sentToday') : t('clients.waiting',{count:d,days:clientDayWord(d)});
    } else state = t('clients.notSent');
    const av = esc(((c.name || '?').trim()[0] || '?').toUpperCase());
    row.innerHTML = `<div class="ua">${av}</div><div class="ub"><b></b><small></small></div>`
      + `<span class="cl-state ${tone}"></span>`;
    row.querySelector('b').textContent = c.name || t('profile.noName');
    row.querySelector('.ub small').textContent = !sum.progs ? t('clients.noPrograms')
      : sum.progs === 1 ? (newest ? (newest.name || t('clients.programFallback')) : t('clients.programFallback'))
      : t('clients.withPrograms',{count:sum.progs,programs:storeCountText(sum.progs,'program').replace(/^\d+\s+/,'')});
    row.querySelector('.cl-state').textContent = state;
    row.onclick = ()=> openClient(i);
    box.appendChild(row);
  });
  $('clsHint').textContent = n
    ? t('clients.hintHas')
    : t('clients.hintEmpty');
}

/* ---- карточка подопечного ---- */
function openClient(i){
  clientIdx = i;
  fillClient();                 // сначала показываем что есть — экран не ждёт сети
  show('scrClient');
  const c = curClient();
  if(c && clProgs(c).length) pullClient(c).then(got => {
    if(got && curClient() === c){ fillClient(); renderClients(); renderTrainerCard(); }
  });
}
const curClient = () => clients[clientIdx] || null;

function fillClient(){
  const c = curClient();
  if(!c) return;
  $('clTitle').textContent = c.name || t('clients.default');
  if(document.activeElement !== $('clName')) $('clName').value = c.name || '';
  if(document.activeElement !== $('clNote')) $('clNote').value = c.note || '';

  const box = $('clProgs');
  box.innerHTML = '';
  const list = clProgs(c);
  $('btnClSendTxt').textContent = list.length ? t('clients.sendMore') : t('clients.send');
  $('clSendHint').textContent = list.length
    ? t('clients.sendHintMany')
    : t('clients.sendHintFirst');

  if(!list.length){
    const empty = document.createElement('div');
    empty.className = 'card-block';
    empty.innerHTML = '<p class="field-hint">' + esc(t('clients.emptyCard')) + '</p>';
    box.appendChild(empty);
    return;
  }

  // Каждая программа — своя карточка со своими занятиями. Складывать занятия по
  // разным курсам в одну кучу нельзя: «двенадцать тренировок» ни о чём не говорит,
  // если восемь из них по программе, которую человек уже закончил.
  list.slice().reverse().forEach(pr => box.appendChild(progCard(c, pr)));
}

function progCard(c, pr){
  const el = document.createElement('div');
  el.className = 'card-block';
  const prog = pr.pid ? customPrograms.find(x => x.id === pr.pid) : null;

  const head = document.createElement('div');
  head.className = 'cb-head';
  head.innerHTML = '<p class="cb-title"></p>';
  head.querySelector('.cb-title').textContent = pr.name || t('clients.programFallback');
  el.appendChild(head);

  const bits = [];
  if(pr.sentAt) bits.push(t('clients.sentOn',{date:humanDay(pr.sentAt)}));
  if(pr.link) bits.push(pr.opens > 0
    ? (pr.firstOpen ? t('clients.openedOn',{date:humanDay((pr.firstOpen || '').slice(0, 10))}) : t('clients.opened'))
    : t('clients.notOpened'));
  if(pr.sentAt && !prog) bits.push(t('clients.localMissing'));
  const sub = document.createElement('p');
  sub.className = 'field-hint';
  sub.textContent = bits.join(' · ');
  el.appendChild(sub);

  // Ссылка, отправленная старой версией приложения, сервера не знает — отметок по
  // ней не будет никогда, и молчать об этом нельзя: тренер ждёт того, что не придёт.
  const stale = !!pr.sentAt && !pr.link;
  if(pr.err || stale){
    const st = document.createElement('p');
    st.className = 'field-hint warn';
    st.textContent = pr.err || t('clients.oldLink');
    el.appendChild(st);
  }

  renderReport(el, pr);

  const acts = document.createElement('div');
  acts.className = 'list-rows';
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'choice ico-row';
  again.innerHTML = icon('share') + '<b>' + esc(t('clients.resend')) + '</b>';
  again.onclick = ()=> resendProgram(c, pr);
  acts.appendChild(again);
  const drop = document.createElement('button');
  drop.type = 'button';
  drop.className = 'link-btn';
  drop.textContent = t('clients.remove');
  drop.onclick = async ()=>{
    if(!(await appDialog(t('clients.removeQuestion',{name:pr.name}),
      {confirm: true, okText: t('clients.removeAction'), cancelText: t('common.keep')}))) return;
    c.progs = clProgs(c).filter(x => x !== pr);
    await saveClients();
    fillClient();
    renderClients();
  };
  acts.appendChild(drop);
  el.appendChild(acts);
  return el;
}

/* ОТЧЁТ ПО ОДНОЙ ПРОГРАММЕ. Что тренер должен видеть — разобрано в
   docs/trainer-ui.md: держит ли расписание, что именно делает, как растёт и не
   переделал ли программу. */
function renderReport(box, pr){
  const r = lastReport(pr);
  if(!r){
    const h = document.createElement('p');
    h.className = 'field-hint';
    h.textContent = t('report.none');
    box.appendChild(h);
    return;
  }

  const add = (cls, html) => {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html || '';
    box.appendChild(el);
    return el;
  };
  const line = (label, value, tone) => {
    const el = add('cl-grow', '<span></span><b></b>');
    el.querySelector('span').textContent = label;
    const b = el.querySelector('b');
    b.textContent = value;
    if(tone) b.className = tone;
  };
  // Было → стало. Старое перечёркнутым и приглушённым: стрелка между двумя
  // одинаково яркими числами заставляет разбираться, где какое.
  const change = (label, a, b2, tone) => {
    const el = add('cl-grow', '<span></span><b><s></s> <i></i></b>');
    el.querySelector('span').textContent = label;
    el.querySelector('s').textContent = a;
    el.querySelector('i').textContent = b2;
    if(tone) el.querySelector('b').className = tone;
  };

  // ---- сколько и когда ----
  const head = add('tr-sum cls-sum', '<b></b><small></small>');
  head.querySelector('b').textContent = r.n + ' ' + (appLocale === 'ru' ? plural(r.n,t('report.workoutOne'),t('report.workoutFew'),t('report.workoutMany')) : t(r.n === 1 ? 'report.workoutOne' : 'report.workoutFew'));
  const bits = [];
  if(r.last) bits.push(t('report.last',{date:humanDay(r.last)}));
  if(r.streak > 1) bits.push(t('report.streak',{count:r.streak}));
  head.querySelector('small').textContent = bits.join(' · ');

  /* ---- четыре недели ----
     Главное число не «сколько всего», а «сколько за последние недели»: двенадцать
     за полгода и двенадцать за месяц — два разных человека. */
  const log = r.log || [];
  if(log.length){
    const now = new Date();
    const weeks = [0, 0, 0, 0];
    log.forEach(x => {
      const d = daysSince(x.d);
      if(d != null && d >= 0 && d < 28) weeks[Math.floor(d / 7)]++;
    });
    const top = Math.max(1, ...weeks);
    add('cls-label', t('report.byWeeks'));
    const wrap = add('cl-weeks', '');
    const dm = t => t.getDate() + '.' + String(t.getMonth() + 1).padStart(2, '0');
    weeks.slice().reverse().forEach((n, i) => {
      const back = 3 - i;
      const to = new Date(now); to.setDate(to.getDate() - back * 7);
      const from = new Date(to); from.setDate(from.getDate() - 6);
      const w = document.createElement('div');
      w.className = 'cw' + (n ? ' on' : '') + (back === 0 ? ' now' : '');
      // Столбик, а не рамка с числом: провал должен читаться формой, а не чтением.
      w.innerHTML = `<b></b><span class="cw-bar"><i style="height:${Math.round(n / top * 100)}%"></i></span><small></small>`;
      w.querySelector('b').textContent = n;
      w.querySelector('small').textContent = back === 0 ? t('report.now') : dm(from);
      wrap.appendChild(w);
    });
  }

  /* ---- какие дни делает ---- */
  const plans = (r.plans || []).filter(x => x.days || x.n);
  if(plans.length > 1){
    add('cls-label', t('report.byDays'));
    plans.forEach(pl => line(pl.days ? pl.days.split('·').map(x=>canonicalLabel(x)).join('·') : (t('builder.variant') + ' ' + (pl.i + 1)),
      pl.n ? String(pl.n) : t('report.never'),
      pl.n ? '' : 'muted'));
  }

  /* ---- каждая тренировка отдельно ----
     Средняя длительность скрывает то, ради чего её смотрят: одна тренировка на
     двадцать минут и одна на час дают «сорок минут», которых не было ни разу. */
  if(log.length){
    add('cls-label', t('report.workouts'));
    const wd = null;
    // Сортируем сами: порядок записей в журнале — это порядок, в котором они легли,
    // а не порядок дней. Список тренировок, идущий вразнобой, нельзя читать вовсе.
    const sorted = log.slice().sort((a2, b2) => String(b2.d).localeCompare(String(a2.d)));
    sorted.slice(0, 8).forEach(x => {
      const pl = plans.find(y => y.i === x.p);
      let when = humanDay(x.d);
      try{ when += ', ' + new Intl.DateTimeFormat(localeTag(),{weekday:'short'}).format(new Date(x.d + 'T12:00:00')); }catch(e){}
      // Вариант в скобках, как у упражнений. Через точку он читался как второй день
      // («17 сентября, чт · Пн» выглядит ошибкой), хотя говорит другое: человек
      // сделал понедельничную тренировку в четверг, и это как раз стоит заметить.
      if(plans.length > 1 && pl && pl.days) when += ` (${pl.days})`;
      const mins = x.sec > 0 && x.sec < 6 * 3600 ? Math.round(x.sec / 60) + ' ' + t('store.minuteShort') : '';
      line(when, mins || '—', mins ? '' : 'muted');
    });
    if(log.length > 8) add('field-hint', '').textContent = t('report.moreEarlier',{count:log.length - 8});
  }

  /* ---- что подопечный поменял ---- */
  const d = r.diff || {};
  const changed = (d.add || []).length + (d.del || []).length + (d.mod || []).length;
  if(changed){
    add('cls-label warn', t('report.changed'));
    (d.del || []).forEach(n => line(n, t('report.removed'), 'warn'));
    (d.add || []).forEach(n => line(n, t('report.added'), 'warn'));
    (d.mod || []).forEach(m => change(m.n, m.a, m.b, 'warn'));
  }

  // ---- рост нагрузки ----
  const ex = r.ex || [];
  if(ex.length){
    add('cls-label', t('report.growth'));
    const many = plans.length > 1;
    ex.forEach(e => {
      const pl = plans.find(x => x.i === e.p);
      const tag = [e.w ? t('report.warmup') : '', many && pl && pl.days ? pl.days.split('·').map(x=>canonicalLabel(x)).join('·') : ''].filter(Boolean).join(' · ');
      change(e.n + (tag ? ` (${tag})` : ''), e.a, e.b, 'ok');
    });
  }

  add('field-hint', '').textContent = t('report.reportOn',{date:humanDay(r.at)}) + (pr.reports.length > 1 ? ' · ' + t('report.totalReports',{count:pr.reports.length}) : '');
}

/* ---- отправка программы подопечному ----
   Программа уходит короткой ссылкой через сервер: по ней видно, открыл ли её
   подопечный, а его отчёты приезжают сами. Штамп by внутри программы говорит приложению
   подопечного, от кого она пришла. */
async function sendProgramToClient(c, p){
  if(!p){ appAlert(t('clients.chooseProgram')); return; }

  // Уже отправляли эту же программу — обновляем ту запись, а не заводим вторую:
  // иначе у подопечного в карточке две одинаковые строки с разными половинами занятий.
  let pr = clProgs(c).find(x => x.pid === p.id);
  let link = null, failed = null;
  try{ link = await programLink(p, {to: c.name}); }
  catch(e){ failed = e; }

  if(!link){ appAlert(linkFailNote(failed) + FILE_HINT); return; }

  if(!pr){
    pr = {pid: p.id, name: p.name, reports: []};
    c.progs = clProgs(c).concat([pr]);
  }
  pr.name = p.name;
  pr.sentAt = localISO(new Date());
  pr.link = {id: link.id, key: link.key};
  pr.opens = 0;
  pr.firstOpen = null;
  await saveClients();
  fillClient();
  renderClients();
  renderTrainerCard();

  await shareLink(link.url, c.name, p.name);
}

// Повторная отправка ТОЙ ЖЕ ссылки: отметки и занятия по ней остаются на месте.
async function resendProgram(c, pr){
  if(!pr.link || !pr.link.id){
    const p = pr.pid ? customPrograms.find(x => x.id === pr.pid) : null;
    if(p) return sendProgramToClient(c, p);
    appAlert(t('clients.programGone'));
    return;
  }
  await shareLink(PUBLIC_APP_URL + '?p=' + encodeURIComponent(pr.link.id),
                  c.name, pr.name);
}

async function shareLink(url, who, what){
  const text = t('clients.shareText',{program:what,forClient:who ? t('clients.forClient',{name:who}) : ''});
  if(navigator.share){
    try{ await navigator.share({title: 'Fit Timer', text, url}); return; }
    catch(e){ if(e && e.name === 'AbortError') return; }
  }
  try{
    await navigator.clipboard.writeText(url);
    appAlert(t('clients.linkCopied'));
  }catch(e){ appAlert(t('clients.copyLink'), {code: url}); }
}

/* Что стало со ссылкой: открытия и отчёты. Ключ лежит только в телефоне тренера —
   в саму ссылку он не попадает, иначе доступ к отчётам пересылался бы вместе с ней.

   Ошибку ЗАПОМИНАЕМ и показываем. Раньше здесь стоял пустой catch, и тренер видел
   ровно то же самое при «сети нет», «ссылка старая», «база не настроена» и «всё
   в порядке, но подопечный ещё не занимался»: пустую карточку. */
const PULL_ERR = {
  no_store: 'clients.pullNoStore',
  not_found: 'clients.pullNotFound',
  bad_key: 'clients.pullBadKey',
  rate_limited: 'clients.pullRate'
};
async function pullProgram(pr){
  if(!pr || !pr.link || !pr.link.id) return false;
  let d;
  try{
    // Ключ превращает тот же адрес из «отдай программу» в «отдай отметки и отчёты».
    d = await apiFetch(`/api/p/${encodeURIComponent(pr.link.id)}?key=${encodeURIComponent(pr.link.key)}`);
  }catch(e){
    pr.err = t(PULL_ERR[e && e.code] || 'clients.pullOffline');
    return false;
  }
  pr.err = null;
  pr.checkedAt = Date.now();
  pr.opens = d.opens || 0;
  pr.firstOpen = d.firstOpen || null;
  // Сервер — источник правды по отчётам: перезаписываем целиком, а не дополняем,
  // иначе после переустановки у тренера задвоится всё, что уже было.
  pr.reports = (d.reports || []).map(r => ({at: (r.at || '').slice(0, 10), n: r.n, sec: r.sec,
    streak: r.streak, first: r.first, last: r.last, ex: r.ex || [],
    log: r.log || [], plans: r.plans || [], diff: r.diff || null}));
  return true;
}
// Обновить все программы подопечного разом.
async function pullClient(c){
  let any = false;
  for(const pr of clProgs(c)){ if(await pullProgram(pr)) any = true; }
  await saveClients();
  return any;
}

async function addClient(){
  const c = {id: 'c' + Date.now(), name: t('clients.defaultName',{count:clients.length + 1}), note: '',
             programId: null, programName: '', sentAt: null, reports: []};
  clients.push(c);
  await saveClients();
  return c;
}

// «Отправить подопечному» из меню программы: выбрать, кому, — и сразу отправить.
function pickClientFor(p){
  const box = $('pickClientList');
  box.innerHTML = '';
  $('pickClientModal').querySelector('.mini-label').textContent = t('clients.sendTo');
  clients.forEach(c => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'choice';
    b.innerHTML = '<b></b><small></small>';
    b.querySelector('b').textContent = c.name || t('profile.noName');
    const has = clProgs(c).find(x => x.pid === p.id);
    const sum = clientSum(c);
    b.querySelector('small').textContent = has ? t('clients.alreadyHas')
      : !sum.progs ? t('clients.noPrograms').toLowerCase()
      : t('clients.alreadyCount',{count:sum.progs,programs:storeCountText(sum.progs,'program').replace(/^\d+\s+/,'')});
    b.onclick = async ()=>{
      $('pickClientModal').classList.remove('open');
      await sendProgramToClient(c, p);
    };
    box.appendChild(b);
  });
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'choice add-row';
  add.innerHTML = icon('plus') + '<b>' + esc(t('clients.new')) + '</b>';
  add.onclick = async ()=>{
    $('pickClientModal').classList.remove('open');
    const c = await addClient();
    await sendProgramToClient(c, p);
  };
  box.appendChild(add);
  $('pickClientModal').classList.add('open');
}

/* ---- сторона подопечного: отчёт тренеру ----
   Отчёт собирает и отправляет САМ человек, кнопкой. Приложение не следит за ним и не
   отсылает ничего без ведома — иначе «тренер видит мои тренировки» превращается в то,
   на что никто не соглашался. */
/* ЧТО ТРЕНЕР ДОЛЖЕН ВИДЕТЬ.

   Первая версия отчёта показывала четыре упражнения из ПЕРВОГО варианта без
   разминки — то есть отвечала на вопрос «что-то растёт?» и ни на один из
   настоящих. Тренер ведёт человека и должен понимать четыре вещи:

   1. ДЕРЖИТ ЛИ РАСПИСАНИЕ. Не «сколько всего», а сколько за последние недели и
      попадает ли в назначенные дни. «12 тренировок» без срока не значит ничего.
   2. ЧТО ИМЕННО ДЕЛАЕТ. У программы бывает несколько вариантов по дням, и
      «делает только лёгкий, тяжёлый пропускает» — это разговор, который надо
      завести. Без разбивки по вариантам он невозможен.
   3. КАК РАСТЁТ. По ВСЕМ вариантам и с разминкой: разминка не растёт сама, но
      человек мог поменять её руками, и это тоже сведения.
   4. НЕ ПЕРЕДЕЛАЛ ЛИ ПРОГРАММУ. Упражнения можно править, выбрасывать и
      добавлять. Тренер, уверенный, что подопечный делает присланное, а тот выкинул
      половину, — худший вид слепоты, и раньше отчёт о ней молчал.

   Отчёт по-прежнему НАКОПИТЕЛЬНЫЙ: всё состояние целиком, поэтому неудачная
   отправка ничего не теряет. */

// Снимок присланного: с чем сравнивать правки подопечного. Снимается один раз, при
// получении программы, и живёт в ней же — сравнивать «сейчас» не с чем иначе.
function snapshotEx(p){
  const out = [];
  normPlans(p).forEach((pl, pi) => (pl.exercises || []).forEach(e => {
    out.push({p: pi, w: e.warmup ? 1 : 0, n: e.name || '',
              v: String(e.value == null ? '' : e.value),
              s: +e.sets || 1, kg: +e.weight || 0});
  }));
  return out;
}

// Ключ упражнения — вариант плюс название: одно и то же движение в разных днях
// это разные строки программы, и путать их нельзя.
const exKey = x => x.p + '|' + (x.n || '').trim().toLowerCase();
const exVal = x => x.v + (x.kg > 0 ? ' × ' + x.kg + ' ' + t('progress.kg') : '') + (x.s > 1 ? ' × ' + x.s + ' ' + t('report.setShort') : '');

function buildReport(p){
  const mine = stats.history.filter(h => h.pid === p.id);
  const me = users.find(u => u.id === currentUser);
  const plans = normPlans(p);

  // 1. Журнал: что и когда. Тридцати тренировок хватает на два месяца занятий —
  // дальше тренеру интересна не история, а то, что происходит сейчас.
  const log = mine.slice(-30).map(h => ({d: h.d, p: +h.plan || 0, sec: h.sec || 0}));

  // 2. Варианты: какие дни назначены и сколько раз каждый сделан.
  const planStats = plans.map((pl, i) => {
    const own = mine.filter(h => (+h.plan || 0) === i);
    // Сколько это занимает У ПОДОПЕЧНОГО. Тренер планировал одно, а человек делает
    // сорок минут вместо двадцати или пятнадцать вместо тридцати — и то и другое
    // повод поговорить, но узнать об этом иначе неоткуда.
    // Шесть часов — заведомо не тренировка, а забытый на ночь таймер или сбой.
    // Одна такая запись сдвигает среднее так, что число перестаёт что-то значить.
    const secs = own.map(h => +h.sec || 0).filter(x => x > 0 && x < 6 * 3600);
    return {
      i, days: (pl.days || []).join('·'), n: own.length,
      sec: secs.length ? Math.round(secs.reduce((a, b) => a + b, 0) / secs.length) : 0
    };
  });

  /* 3. Рост — по всем вариантам, разминка помечена отдельно.

     Сравнивать СТРОКИ нельзя. При двойной прогрессии цель — одно число, а не
     диапазон, поэтому «12-15» превращается в «12» уже на нулевом шаге: ничего не
     выросло, а строки разные. В отчёт попадало «12-15 × 6 кг → 12 × 6 кг», и это
     читалось как падение нагрузки там, где её вообще не трогали.
     Сравниваем числа: выросла нижняя граница повторов или вес. */
  const ex = [];
  plans.forEach((pl, pi) => (pl.exercises || []).forEach(e => {
    if(ex.length >= 40) return;
    const was = String(e.value == null ? '' : e.value);
    const now = e.warmup ? was : progressedRepsRange(p.id, e, p);
    const kgWas = hasWeight(e) ? (+e.weight || 0) : 0;
    const kgNow = hasWeight(e) ? getExWeight(p.id, e, p) : 0;
    const grew = parseValue(now).min > parseValue(was).min || kgNow > kgWas;
    if(!grew) return;
    ex.push({p: pi, w: e.warmup ? 1 : 0, n: e.name || t('common.exerciseFallback'),
             a: was + (kgWas > 0 ? ` × ${fmtKg(kgWas)} ${t('progress.kg')}` : ''),
             b: now + (kgNow > 0 ? ` × ${fmtKg(kgNow)} ${t('progress.kg')}` : '')});
  }));

  // 4. Правки: что подопечный убрал, добавил и поменял руками.
  const diff = {add: [], del: [], mod: []};
  if(Array.isArray(p.origEx)){
    const now = snapshotEx(p);
    const byKey = new Map(now.map(x => [exKey(x), x]));
    const wasKeys = new Set();
    p.origEx.forEach(o => {
      wasKeys.add(exKey(o));
      const cur = byKey.get(exKey(o));
      if(!cur){ if(diff.del.length < 12) diff.del.push(o.n); return; }
      // Поправку от прогрессии за правку не считаем: она и так в списке роста.
      if(cur.v !== o.v || cur.s !== o.s || cur.kg !== o.kg){
        if(diff.mod.length < 12) diff.mod.push({n: o.n, a: exVal(o), b: exVal(cur)});
      }
    });
    now.forEach(x => { if(!wasKeys.has(exKey(x)) && diff.add.length < 12) diff.add.push(x.n); });
  }

  return {
    v: 2, by: p.by || '', who: (me && me.name) || '', name: p.name,
    n: mine.length,
    sec: mine.reduce((a, h) => a + (h.sec || 0), 0),
    first: mine.length ? mine[0].d : null,
    last: mine.length ? mine[mine.length - 1].d : null,
    streak: calcStreakInfo().n,
    log, plans: planStats, ex, diff
  };
}

/* Отчёт тренеру — сам, после каждой законченной тренировки.

   Отчёт НАКОПИТЕЛЬНЫЙ: в нём всегда всё состояние целиком, а не «что нового».
   Из этого следует главное свойство — неудачная отправка ничего не теряет.
   Нет сети, сервер не отвечает, человек тренировался в подвале — следующая
   отправка увезёт и это тоже. Поэтому здесь нет ни очереди, ни повторов, ни
   сообщений об ошибке: всё это чинило бы беду, которой нет.

   Молчим и при успехе: человек закончил тренировку и смотрит на свой результат,
   а не на отчётность. О том, что тренер видит занятия, сказано один раз — когда
   программа принималась (см. importProgramLink). */
function autoReport(p){
  if(!p || !p.src) return;
  let rep;
  try{ rep = buildReport(p); }catch(e){ return; }
  if(!rep.n) return;
  apiPost('/api/report', {link: p.src, report: rep}).catch(()=>{});
}

/* ================= КАТАЛОГ ПРОГРАММ =================
   Готовые программы от тренеров. Оплаты нет: программу добавляют в библиотеку,
   а не покупают, и слова «купить», «цена», «бесплатно» на экране не встречаются
   вовсе — иначе новичок читает «бесплатно» как «пока бесплатно».
   Каталог лежит прямо здесь; поле by — ник тренера, составившего программу.
   Каждая программа описана ровно тем же текстовым форматом, что и
   ответ нейросети, и при добавлении проходит через тот же parseProgramText —
   поэтому программа из каталога неотличима от собранной руками: те же круги,
   подходы, прогрессия с потолком и замены. Когда появится база, поменяется
   только источник каталога, а всё остальное останется как есть.
   Метка storeId у добавленной программы прежняя — библиотеки старых пользователей
   продолжают узнаваться. */
// Направление программы в каталоге — ЭТО ТА ЖЕ ЦЕЛЬ, которую спрашивают при
// создании программы: список один (OPT_GOAL), здесь к каждой цели добавлены
// только короткий ключ, значок и пара цветов обложки. Ключ уходит в поле cat
// у программы, поэтому менять его нельзя — поменяется расклад обложек.
// Цвета — все в фиолетовом семействе, чтобы витрина не рябила.
const STORE_LOOK = {
  'Похудеть':                   {id:'slim',   ico:'flame',    grad:['#F2617A','#8E33E0']},
  'Подтянуть всё тело':         {id:'tone',   ico:'dumbbell', grad:['#5B4BE8','#2E9BD6']},
  'Ягодицы и пресс':            {id:'glut',   ico:'weight',   grad:['#C13AA0','#6134DE']},
  'Плоский живот':              {id:'core',   ico:'target',   grad:['#7C56F5','#B44BDA']},
  'Сила и выносливость':        {id:'power',  ico:'bolt',     grad:['#6A3FE0','#C13AA0']},
  'Рельеф мышц':                {id:'relief', ico:'gem',      grad:['#8E33E0','#2E9BD6']},
  'Растяжка и гибкость':        {id:'flex',   ico:'moon',     grad:['#4FB3A0','#7C56F5']},
  'Осанка и спина':             {id:'back',   ico:'shield',   grad:['#4A7BE8','#8E33E0']},
  'Восстановиться после родов': {id:'post',   ico:'heart',    grad:['#E06A9E','#7C56F5']},
  'Кардио и энергия':           {id:'cardio', ico:'rocket',   grad:['#F2617A','#5B4BE8']}
};
const STORE_CATS = OPT_GOAL.map(name => Object.assign({name}, STORE_LOOK[name]));
const STORE_LEVELS = OPT_LEVEL;
const storeCat = id => STORE_CATS.find(c => c.id === id) || STORE_CATS[0];
function storeCountText(n, type){
  const forms = {
    program:['store.programOne','store.programFew','store.programMany'],
    set:['store.setOne','store.setFew','store.setMany'],
    round:['store.roundOne','store.roundFew','store.roundMany'],
    variant:['store.variantOne','store.variantFew','store.variantMany'],
    exercise:['store.exerciseOne','store.exerciseFew','store.exerciseMany']
  }[type];
  if(!forms) return String(n);
  const word = appLocale === 'ru'
    ? plural(n, t(forms[0]), t(forms[1]), t(forms[2]))
    : t(n === 1 ? forms[0] : forms[1]);
  return n + ' ' + word;
}
// Расклад обложки берём по месту программы ВНУТРИ её категории, а не по хешу
// названия: хеш легко кладёт двух соседей в один вариант, и рядом стоящие
// карточки выглядят близнецами. Порядковый номер такого не допускает.
function storeVariant(it){
  const n = storeAll().filter(x => x.cat === it.cat).findIndex(x => x.id === it.id);
  return (n < 0 ? 0 : n) % 3;
}

/* Тренеры каталога. Ник — ключ, по нему карточка находит человека. Фото пока нет ни
   у кого: `photo` останется пустым до реального наполнения, и тогда в попапе рисуется
   заглушка из набора иконок. Описание — обычный текст, в нём же могут быть контакты:
   ссылками ник специально не делаем, чтобы карточка каталога не уводила из приложения. */
/* Каталог — это зашитые программы ПЛЮС принятые с сервера. Серверная позиция
   складывается в том же виде (id, by, cat, level, min, name, gives, text), поэтому
   ни витрина, ни страница программы, ни добавление в библиотеку не знают, откуда
   она взялась, — и знать не должны. */
let storeServer = [];
/* Каталог живёт ТОЛЬКО в базе. Раньше десяток программ был вшит сюда и ехал в
   загрузке к каждому человеку, хотя нужен ровно однажды — чтобы витрине было чем
   открыться. Теперь стартовый набор заливается из админки (api/_seed.js), а
   приложение знает то, что пришло с сервера, плюс последний ответ на случай без
   сети. Каталога без сети у того, кто его ни разу не открывал, не будет — и это
   честно: пустая витрина лучше вечно устаревшей. */
const storeAll = () => storeServer;
let storeLoading = false;
async function loadStoreServer(){
  const locale = appLocale === 'ru' ? 'ru' : 'en';
  const cacheKey = 'catalog_' + locale;
  storeLoading = true;
  try{
    const d = await apiFetch('/api/catalog?lang=' + encodeURIComponent(locale));
    storeServer = Array.isArray(d.items) ? d.items : [];
    lastSeen(cacheKey, storeServer);
  }catch(e){
    // Кэш тоже языковой: после переключения профиля русская витрина не должна
    // внезапно подменять английскую и наоборот.
    storeServer = lastSeen(cacheKey) || [];
  } finally { storeLoading = false; }
}


// Обложка рисуется, а не хранится: градиент, два мягких блика и крупная
// пиктограмма категории. Ни одного внешнего файла — офлайн витрина выглядит
// так же, как онлайн.
// Счётчик у идентификатора градиента. Одна и та же обложка стоит теперь в двух
// местах сразу (строка витрины и страница программы), и при одинаковых id браузер
// берёт ПЕРВОЕ определение в документе — то, что лежит в скрытом экране витрины.
// Обложка на странице программы из-за этого оставалась белой.
let storeUid = 0;
function storeCover(it, square){
  // Своя картинка вместо рисованной. Рисованная остаётся у всех, кто её не задал:
  // пустое место на витрине хуже, чем обложка по цели.
  if(it.cover){
    return `<div class="st-photo"${square ? ' data-square="1"' : ''}><img src="${esc(it.cover)}" alt=""></div>`;
  }
  const c = storeCat(it.cat);
  const g = c.grad;
  const uid = 'stg' + it.id.replace(/[^a-z0-9]/gi, '') + (square ? 'q' : '') + (++storeUid);
  // Цвет обложки задаёт категория — по нему витрина читается с одного взгляда.
  // Но тогда две программы одной категории подряд выглядят близнецами, поэтому
  // наклон градиента, места бликов и посадка пиктограммы разводятся по самой
  // программе: устойчивое число из её id, три готовых расклада.
  const v = storeVariant(it);
  const AX = [[0,0,1,1], [1,1,0,0], [0,0,1,.3]][v];
  const BL = [[52,26,96, 286,164,78], [270,14,88, 34,176,74], [30,152,92, 262,16,84]][v];
  const IC = [[200,34,3.6], [196,54,3.2], [206,24,3.9]][v];
  // квадратный вариант — для миниатюры в библиотеке: она обрезает картинку по
  // бокам, и вынесенная вправо пиктограмма из широкой обложки уезжала за край
  if(square) return `<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="${uid}" x1="${AX[0]}" y1="${AX[1]}" x2="${AX[2]}" y2="${AX[3]}">
        <stop offset="0" stop-color="${g[0]}"/><stop offset="1" stop-color="${g[1]}"/>
      </linearGradient>
      <radialGradient id="${uid}b"><stop offset="0" stop-color="#fff" stop-opacity=".4"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="200" height="200" fill="url(#${uid})"/>
    <circle cx="34" cy="22" r="86" fill="url(#${uid}b)"/>
    <circle cx="176" cy="188" r="70" fill="url(#${uid}b)"/>
    <g transform="translate(58,58) scale(3.5)" opacity=".92" color="#ffffff" fill="none"
       stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[c.ico] || ''}</g>
  </svg>`;
  // берём разметку иконки, а не результат icon(): вложенный <svg> внутри <g> с
  // transform браузер размеряет по своим правилам и уносит его за пределы обложки.
  // ICONS[...] — это уже готовые фигуры в системе координат 24×24, их и масштабируем.
  const ico = ICONS[c.ico] || '';
  return `<svg viewBox="0 0 320 170" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="${uid}" x1="${AX[0]}" y1="${AX[1]}" x2="${AX[2]}" y2="${AX[3]}">
        <stop offset="0" stop-color="${g[0]}"/><stop offset="1" stop-color="${g[1]}"/>
      </linearGradient>
      <radialGradient id="${uid}b"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="320" height="170" fill="url(#${uid})"/>
    <circle cx="${BL[0]}" cy="${BL[1]}" r="${BL[2]}" fill="url(#${uid}b)"/>
    <circle cx="${BL[3]}" cy="${BL[4]}" r="${BL[5]}" fill="url(#${uid}b)"/>
    <g transform="translate(${IC[0]},${IC[1]}) scale(${IC[2]})" opacity=".9" color="#ffffff" fill="none"
       stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${ico}</g>
  </svg>`;
}
// та же обложка, но как картинка для карточки в библиотеке: программа из каталога
// не должна выглядеть в списке безымянной гантелью
function storeCoverData(it){
  if(it.cover) return it.cover;
  // как отдельный документ SVG обязан объявить пространство имён: внутри HTML оно
  // подразумевается, а в data-URI без него картинка не грузится вовсе
  const svg = storeCover(it, true)
    .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
    .replace(/\s+/g, ' ');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

let storeFilter = {q: '', cat: '', level: ''};
// уже добавлена: у программы из каталога остаётся метка storeId, поэтому
// повторный заход предлагает открыть, а не положить второй экземпляр.
// Имя поля storeId не трогаем — по нему узнаются библиотеки старых пользователей.
const storeOwned = id => customPrograms.find(p => p.storeId === id) || null;

// список для выбора одного варианта в своём попапе — вместо системной шторки select
// «Цель»/«Уровень» — подпись поля, а не значение из набора: в списке её не
// показываем, чтобы не выглядела как ещё один вариант выбора. Сброс — отдельной
// строкой и только когда правда есть что сбрасывать.
function openOptPicker(title, opts, cur, onPick){
  $('optTitle').textContent = title;
  const box = $('optList'); box.innerHTML = '';
  opts.forEach(([v, t]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'opt-row'; b.classList.toggle('act', v === cur);
    b.innerHTML = `<span></span><span class="or-check">${icon('check')}</span>`;
    b.querySelector('span').textContent = t;
    b.onclick = ()=>{ $('optModal').classList.remove('open'); onPick(v); };
    box.appendChild(b);
  });
  const reset = $('optReset');
  setShown(reset, cur !== '');
  reset.onclick = ()=>{ $('optModal').classList.remove('open'); onPick(''); };
  $('optModal').classList.add('open');
}

function renderStoreFilters(){
  const fill = (btnId, valId, chevId, ph, opts, cur, onPick) => {
    const cho = opts.find(([v]) => v === cur);
    $(valId).textContent = cho ? cho[1] : ph;
    $(btnId).classList.toggle('ph', !cho);
    $(chevId).innerHTML = icon('chevD');
    $(btnId).onclick = ()=> openOptPicker(ph, opts, cur, v => { onPick(v); renderStoreFilters(); renderStore(); });
  };
  // Подписи над списками убраны: первый пункт и есть подпись — «Цель», «Уровень».
  // Показываем только те цели, по которым в каталоге вообще что-то есть: пустой
  // пункт в списке — обещание, которого каталог не выполняет.
  const has = id => storeAll().some(x => x.cat === id);
  fill('storeCatBtn', 'storeCatVal', 'storeCatChev', t('ai.goal'),
    STORE_CATS.filter(c => has(c.id)).map(c => [c.id, canonicalLabel(c.name)]),
    storeFilter.cat, v => storeFilter.cat = v);
  fill('storeLevelBtn', 'storeLevelVal', 'storeLevelChev', t('ai.level'),
    STORE_LEVELS.map(l => [l, canonicalLabel(l)]),
    storeFilter.level, v => storeFilter.level = v);
}

function storeMatches(it){
  if(storeFilter.cat && it.cat !== storeFilter.cat) return false;
  if(storeFilter.level && it.level !== storeFilter.level) return false;
  const q = storeFilter.q.trim().toLowerCase();
  if(!q) return true;
  // ищем по названию — и по категории с ником тренера заодно: «пресс» человек
  // наберёт скорее, чем полное имя программы, а тренера ищут по нику
  return ((it.name || '') + ' ' + storeCat(it.cat).name + ' ' + canonicalLabel(storeCat(it.cat).name) + ' ' + (it.by || '')).toLowerCase().includes(q);
}

// «Премиум» и «Уже у вас» — одни и те же метки в списке и на странице программы.
// Раньше на странице «Премиум» был серой меткой в ряду фактов и с меткой на
// витрине не имел ничего общего, а «добавлено» показывалось галочкой в углу
// обложки — её читали как «выбрано».
function storeLabels(it, own){
  if(!it.pro && !own) return '';
  return `<div class="st-labels">` +
    (it.pro ? `<span class="st-tag pro">${icon('crown')}${esc(t('premium.title'))}</span>` : '') +
    (own ? `<span class="st-own">${icon('check')}${esc(t('store.alreadyOwned'))}</span>` : '') +
    `</div>`;
}

function renderStore(){
  const box = $('storeList');
  // Пока каталог едет и показывать нечего — заглушка строками той же формы.
  if(storeLoading && !storeServer.length){
    $('storeCount').textContent = '';
    // Форма строки та же, что у настоящей (.store-row), иначе появление данных
    // подвинет всё на экране — ровно то мигание, от которого заглушка и спасает.
    box.innerHTML = [0, 1, 2, 3].map(()=>
      '<article class="store-row"><div class="sr-cover"><span class="sk" style="display:block;width:100%;height:100%"></span></div>'
      + '<div class="sr-info"><span class="sk sk-line" style="display:block;width:72%"></span>'
      + '<span class="sk sk-line" style="display:block;width:46%"></span>'
      + '<span class="sk sk-line" style="display:block;width:58%"></span></div></article>').join('');
    return;
  }
  const list = storeAll().filter(storeMatches);
  $('storeCount').textContent = list.length
    ? storeCountText(list.length, 'program')
    : '';
  if(!list.length){
    box.innerHTML = '<div class="empty-state">' +
      `<span class="es-ico">${icon('sparkle')}</span>` +
      `<b>${esc(t('store.emptyTitle'))}</b>` +
      `<p>${esc(t('store.emptyText'))}</p>` +
      '</div>';
    return;
  }
  // Строка витрины отвечает на один вопрос — «стоит ли открыть»: обложка, название,
  // цель, минуты, уровень и тренер. Остальное (состав, расписание, описание) живёт
  // на странице программы.
  box.innerHTML = list.map(it => {
    const own = storeOwned(it.id);
    return `<article class="store-row" data-open="${it.id}">
      <div class="sr-cover">${storeCover(it, true)}</div>
      <div class="sr-info">
        <h3>${esc(it.name || t('store.untitled'))}</h3>
        <div class="sr-goal">${esc(canonicalLabel(storeCat(it.cat).name))}</div>
        <div class="sr-meta"><span>${it.min} ${esc(t('store.minuteShort'))}</span><span>${esc(canonicalLabel(it.level))}</span>${it.by ? `<span>${esc(it.by)}</span>` : ''}</div>
        ${storeLabels(it, own)}
      </div>
    </article>`;
  }).join('');
  box.querySelectorAll('[data-open]').forEach(b => b.onclick = ()=> openStoreItem(b.dataset.open));
}

/* ---- страница программы каталога ---- */
let siItem = null;
// объём упражнения для превью. НЕ exSummary: тот смотрит в draft и подставил бы
// рабочий вес чужой программы — здесь нужен состав ровно такой, как в тексте.
function siBits(ex){
  const b = [];
  b.push(ex.type === 'time' ? `${parseValue(ex.value).min} ${t('store.secShort')}` : `${valueText(ex.value)} ${t('store.repShort')}`);
  const sets = Math.max(1, parseInt(ex.sets) || 1);
  if(sets > 1) b.push(storeCountText(sets, 'set'));
  if(+ex.weight > 0) b.push(`${fmtKg(ex.weight)} ${t('progress.kg')}`);
  if(ex.perSide) b.push(t('store.perSide'));
  return b;
}
function openStoreItem(id){
  const it = storeAll().find(x => x.id === id);
  if(!it) return;
  siItem = it;
  const c = storeCat(it.cat);
  $('siCover').innerHTML = storeCover(it, true);
  $('siName').textContent = it.name || t('store.untitled');
  $('siGoal').textContent = canonicalLabel(c.name);
  $('siGives').textContent = it.gives || '';
  $('siNick').textContent = it.by || '';
  setShown('siBy', !!it.by);

  const {program} = parseProgramText(it.text);
  const plans = (program && program.plans) || [];
  const exs = plans.reduce((a, pl) => a.concat(pl.exercises || []), []);
  const rounds = (plans[0] && +plans[0].rounds) || 1;
  // Дни — СО ВСЕЙ программы, а не с первого варианта. У программы «Пн, Чт» плюс
  // «Вт, Пт» в шапке значилось «Пн, Чт», и выходило, что занимаются два раза.
  const days = (program && program.rotate)
    ? '' : DAYS.filter(d => plans.some(pl => (pl.days || []).includes(d))).join(', ');

  const facts = $('siFacts'); facts.innerHTML = '';
  const fact = (txt, cls) => {
    if(!txt) return;
    const el = document.createElement('span');
    if(cls) el.className = cls;
    el.textContent = txt;
    facts.appendChild(el);
  };
  fact(canonicalLabel(it.level));
  fact(`${it.min} ${t('store.minuteShort')}`);
  if(rounds > 1) fact(storeCountText(rounds, 'round'));
  if(days) fact(days.split(',').map(x => canonicalLabel(x.trim())).join(', '));
  if(plans.length > 1){
    fact(program.rotate
      ? `${storeCountText(plans.length, 'variant')} ${t('store.inSequence')}`
      : storeCountText(plans.length, 'variant'));
  }

  const own = storeOwned(it.id);
  $('siLabels').innerHTML = storeLabels(it, own);

  // При нескольких вариантах в заголовке — число ВАРИАНТОВ, а не сумма упражнений:
  // сумма читалась как «столько делают за раз», а сколько в каждом — написано на
  // самом варианте.
  $('siCount').textContent = plans.length > 1
    ? storeCountText(plans.length, 'variant')
    : storeCountText(exs.length, 'exercise');
  // Состав премиум-программы — часть подписки: без неё показываем не пустоту и не
  // отказ, а что именно там лежит. Нажатие открывает витрину подписки.
  const locked = !!it.pro && !isPremium();
  setShown('siList', !locked);
  setShown('siLock', locked);
  if(locked){
    $('siLockTxt').textContent =
      t('store.lockedText',{count:exs.length,exercises:appLocale === 'ru' ? plural(exs.length,t('store.exerciseOne'),t('store.exerciseFew'),t('store.exerciseMany')) : (exs.length === 1 ? t('store.exerciseOne') : t('store.exerciseFew'))});
  }
  /* Состав — ПО ВАРИАНТАМ, а не одним списком.

     Одним списком он врал в трёх местах сразу: упражнения разных дней шли подряд
     и выглядели как одна тренировка, сквозная нумерация давала «12 упражнений»
     там, где за раз делают четыре, а разминка, которая есть в каждом варианте,
     повторялась столько раз, сколько вариантов, — и это читалось как ошибка в
     программе. Человек смотрит сюда, чтобы понять, во что ввязывается, и понимать
     он должен ОДНУ тренировку, а не сумму всех.

     Вкладок здесь нет намеренно, хотя в редакторе они есть: там человек правит
     один вариант и остальные ему мешают, а здесь он ВЫБИРАЕТ — и половина
     состава, спрятанная за вкладкой, ровно то, чего не хватает для выбора. */
  const box = $('siList'); box.innerHTML = '';
  if(!locked) plans.forEach((pl, pi) => {
    if(plans.length > 1){
      const head = document.createElement('p');
      head.className = 'si-plan';
      const list = (pl.days || []).join(', ');
      head.textContent = (program.rotate || !list) ? `${t('builder.variant')} ${pi + 1}` : list.split(',').map(x => canonicalLabel(x.trim())).join(', ');
      const n = (pl.exercises || []).length;
      const sub = document.createElement('span');
      sub.textContent = storeCountText(n, 'exercise') + (+pl.rounds > 1 ? ` · ${storeCountText(+pl.rounds, 'round')}` : '');
      head.appendChild(sub);
      box.appendChild(head);
    }
    // Номера СВОИ у каждого варианта: сквозные говорили бы, что за одну
    // тренировку делают двенадцать упражнений.
    const list = sortWarmFirst((pl.exercises || []).slice());
    list.forEach((ex, i) => {
      const row = document.createElement('div');
      row.className = 'ex-row static' + (ex.warmup ? ' warm' : '');
      const before = list.slice(0, i).filter(e => !e.warmup).length;
      row.innerHTML =
        `<div class="ex-thumb">${ex.warmup ? icon('flame') : (before + 1)}</div>` +
        `<div class="ex-info"><b></b><div class="ex-meta">` +
        (ex.warmup ? `<span class="wm">${esc(t('store.warmup'))}</span>` : '') +
        siBits(ex).map(t => `<span>${t}</span>`).join('') +
        (progShort(ex) ? `<span class="grow">${progShort(ex)}</span>` : '') +
        `</div></div>`;
      row.querySelector('b').textContent = (ex.name || '').trim() || t('store.untitled');
      // Название — ключ к фото: карта фото приходит отдельным запросом, и связывать
      // её с рядами надо по тому же, по чему она собрана на сервере.
      row.dataset.ex = (ex.name || '').trim();
      box.appendChild(row);
    });
  });

  $('siBuy').textContent = own ? t('store.open') : t('store.addMine');
  show('scrStoreItem');
  window.scrollTo(0, 0);
  if(!locked) siPaintMedia(it);
}

/* Фото упражнений на странице программы.

   В списке каталога их нет намеренно — тридцать программ по полмегабайта картинок
   это пятнадцать мегабайт на открытие витрины, где у программы одна строка. Но на
   странице программы они обязательны: по фото и понятно, что за движение, а без
   них состав читается как список слов.

   Поэтому отдельным запросом и ПОСЛЕ отрисовки: страница открывается сразу, фото
   доезжают через мгновение. Ждать их, чтобы показать текст, значит показывать
   пустой экран. Карта кладётся на саму позицию — второй заход по той же программе
   уже не спрашивает сервер. */
async function siPaintMedia(it){
  if(!(it.hasMedia || it.media)) return;
  let media = it.media;
  if(!media){
    try{ media = (await apiFetch('/api/catalog?item=' + encodeURIComponent(it.id) + '&lang=' + encodeURIComponent(appLocale === 'ru' ? 'ru' : 'en'))).item.media; }
    catch(e){ return; }            // без фото страница остаётся рабочей
    it.media = media || {};
  }
  if(!media) return;
  // Пока фото ехали, человек мог уйти на другую программу. Рисуем только если
  // открыта всё та же.
  if(!siItem || siItem.id !== it.id) return;
  $('siList').querySelectorAll('.ex-row').forEach(row => {
    const pic = media[row.dataset.ex || ''];
    if(!pic) return;
    const thumb = row.querySelector('.ex-thumb');
    if(thumb) thumb.innerHTML = `<img src="${esc(pic)}" alt="">`;
  });
}
$('siLock').onclick = openPremium;
$('siBy').onclick = ()=> siItem && openTrainer(siItem.by);
$('siBuy').onclick = ()=> siItem && addStoreItem(siItem.id);
$('siBackTop').onclick = ()=> goBackTo('scrStore');

async function addStoreItem(id){
  const it = storeAll().find(x => x.id === id);
  if(!it) return;
  const own = storeOwned(id);
  if(own){
    // уже добавлена — открываем экран старта. Каталог не корневой раздел, поэтому
    // «назад» с него сам не настроится: возвращаем туда, откуда пришли в каталог
    startFrom = storeFrom;
    openStart(own);
    return;
  }
  // программа по подписке — вместо отказа показываем, что даёт подписка
  if(it.pro && !isPremium()){ openPremium(); return; }

  const {program, errors} = parseProgramText(it.text);
  if(errors.length || !program.plans.length){
    appAlert(t('store.addFailed'));
    return;
  }
  program.id = 'p' + Date.now();
  program.stats = {completions: 0};
  // После добавления это обычная личная одноязычная копия. Язык нужен ИИ-правкам,
  // чтобы они не переписали английскую программу на язык текущего интерфейса.
  program.locale = (it.locale === 'ru' || it.locale === 'en') ? it.locale : (appLocale === 'ru' ? 'ru' : 'en');
  // Фото упражнений в списке каталога не лежат (иначе витрина весила бы мегабайты).
  // Забираем их сейчас — в момент, когда программа становится своей.
  if(it.hasMedia || it.media){
    let media = it.media;
    if(!media){
      try{ media = (await apiFetch('/api/catalog?item=' + encodeURIComponent(it.id) + '&lang=' + encodeURIComponent(appLocale === 'ru' ? 'ru' : 'en'))).item.media; }
      catch(e){ media = null; }        // без фото программа всё равно рабочая
    }
    applyMedia(program, media);
  }
  if(it.cover) program.cover = it.cover;
  program.storeId = it.id;             // метка каталога: по ней узнаём, что уже добавлено
  program.cover = storeCoverData(it);
  customPrograms.push(program);
  await savePrograms();
  renderMine();
  renderStore();                        // в списке у программы появляется метка «Уже у вас»
  // Уходить отсюда на витрину НЕЛЬЗЯ: возврат по истории асинхронный, и popstate
  // приходит уже после открытия попапа — а обработчик popstate закрывает верхний
  // попап. Остаёмся на странице программы, кнопка превращается в «Открыть».
  if(siItem && siItem.id === id){
    $('siBuy').textContent = t('store.open');
    // метку «Уже у вас» ставим тут же: уходить с экрана после добавления нельзя
    // (возврат по истории асинхронный и закрыл бы только что открытый попап)
    $('siLabels').innerHTML = storeLabels(siItem, true);
  }
  renderToday();
  /* Про дни здесь БОЛЬШЕ НЕ СПРАШИВАЕМ. Дни у программы из каталога уже есть — они
     записаны в её тексте, — и попап предлагал переделать их человеку, который
     секунду назад решал совсем другой вопрос: брать программу или нет. Захочет
     иначе — поменяет в самой программе, туда за этим и ходят. */
  appAlert(t('store.added',{name:it.name || t('store.untitled')}));
}

// откуда пришли в каталог: с «Сегодня» или из «Тренировок». Кнопка «назад»
// должна возвращать туда же, а не всегда на главную
let storeFrom = 'scrMenu';
// Карточка тренера. Ник может не найтись в справочнике — тогда показываем сам ник и
// честную строку вместо выдуманного описания, а не пустой попап.
/* Страница тренера. Всё знает сервер: и тех, чьи программы в каталоге, и тех, кто
   прислал программу ссылкой. Что знаем — показываем, чего не знаем — не выдумываем. */
let tpFrom = 'scrMenu';

function openTrainer(nick){
  if(!nick) return;
  tpFrom = show._last;
  /* Сразу рисуем виденное в прошлый раз. Если человека видим впервые — заглушку:
     пустой экран, который через секунду наполняется, читается как сбой, а смена
     одной раскладки на другую — как мигание. */
  const seen = lastSeen('tr_' + nick);
  if(seen) fillTrainerPage(nick, seen);
  else skeletonTrainer(nick);
  show('scrTrainerPage');
  apiFetch('/api/trainer/' + encodeURIComponent(nick)).then(d => {
    const trainerData = Object.assign({}, d, {
      programs: Math.max(d.programs || 0, storeAll().filter(x => x.by === nick).length)
    });
    lastSeen('tr_' + nick, trainerData);
    if(show._last === 'scrTrainerPage') fillTrainerPage(nick, trainerData);
  }).catch(()=>{});
}

// Заглушка страницы тренера: та же форма, что и настоящая, — фото, имя, ник,
// три числа и ссылка. Поэтому появление данных не двигает ни одну строку.
function skeletonTrainer(nick){
  $('tpPhoto').innerHTML = '<span class="sk" style="width:100%;height:100%;border-radius:50%"></span>';
  $('tpName').textContent = nick.replace(/^@/, '');
  $('tpNick').textContent = nick;
  setShown('tpAbout', true);
  $('tpAbout').innerHTML = '<span class="sk sk-line" style="display:block;width:92%"></span>'
    + '<span class="sk sk-line" style="display:block;width:64%"></span>';
  setShown('tpStatsCard', true);
  $('tpStats').innerHTML = [0, 1, 2].map(()=>
    '<div class="tp-stat"><span class="sk" style="width:34px;height:20px"></span>'
    + '<span class="sk sk-line" style="width:56px;margin:4px 0 0"></span></div>').join('');
  setShown('tpLinkCard', false);
}

function fillTrainerPage(nick, trainerData){
  trainerData = trainerData || {};
  $('tpPhoto').innerHTML = trainerData.photo ? `<img src="${esc(trainerData.photo)}" alt="">` : icon('user');
  $('tpName').textContent = trainerData.name || nick.replace(/^@/, '');
  $('tpNick').textContent = nick;
  const about = trainerData.about || '';
  setShown('tpAbout', !!about);
  $('tpAbout').textContent = about;   // textContent затирает и разметку заглушки

  // Три числа, и каждое показывается, только если оно есть. «0 программ» и
  // «стаж не указан» доверия не добавляют, а место занимают.
  const cells = [];
  if(trainerData.years != null && trainerData.years > 0){
    cells.push([trainerData.years, appLocale === 'ru'
      ? plural(trainerData.years, t('trainer.experienceOne'), t('trainer.experienceFew'), t('trainer.experienceMany'))
      : t(trainerData.years === 1 ? 'trainer.experienceOne' : 'trainer.experienceFew')]);
  }
  if(trainerData.programs > 0){
    cells.push([trainerData.programs, appLocale === 'ru'
      ? plural(trainerData.programs, t('trainer.programOne'), t('trainer.programFew'), t('trainer.programMany'))
      : t(trainerData.programs === 1 ? 'trainer.programOne' : 'trainer.programFew')]);
  }
  if(trainerData.opens > 0){
    cells.push([trainerData.opens, t(trainerData.opens === 1 ? 'trainer.opensOne' : 'trainer.opensMany')]);
  }
  if(trainerData.since){
    const d = daysSince((trainerData.since || '').slice(0, 10));
    if(d != null){
      const m = Math.floor(d / 30);
      cells.push(m >= 1
        ? [m, t(m === 1 ? 'trainer.withUsMonth' : 'trainer.withUsMonths')]
        : [Math.max(1, d), t(Math.max(1, d) === 1 ? 'trainer.withUsDay' : 'trainer.withUsDays')]);
    }
  }
  setShown('tpStatsCard', cells.length > 0);
  $('tpStats').innerHTML = '';
  cells.forEach(([n, label]) => {
    const el = document.createElement('div');
    el.className = 'tp-stat';
    el.innerHTML = '<b></b><small></small>';
    el.querySelector('b').textContent = n;
    el.querySelector('small').textContent = label;
    $('tpStats').appendChild(el);
  });

  const link = (trainerData.links || '').trim();
  setShown('tpLinkCard', !!link);
  if(link){
    $('tpLink').href = /^https?:/.test(link) ? link : 'https://' + link;
    $('tpLinkTxt').textContent = link.replace(/^https?:\/\//, '');
  }
}

/* ПРЕДЛОЖИТЬ В КАТАЛОГ */
let pubProg = null;
let pubFrom = 'scrPrograms';
let pubDraft = {cat: '', level: '', gives: ''};

// Минуты для витрины. Точность здесь не нужна и невозможна — человек читает это
// как «влезет ли в обед», а не как обещание. Считаем грубо и честно округляем.
function estimateMinutes(p){
  let sec = 0;
  const plans = normPlans(p);
  const pl = plans[0] || {exercises: []};
  (pl.exercises || []).forEach(ex => {
    const sets = Math.max(1, +ex.sets || 1);
    const one = ex.type === 'time' ? (+parseValue(ex.value).max || 30)
                                   : (parseValue(ex.value).max || 12) * 3;
    sec += sets * one + (sets - 1) * (+ex.rest || 30) + exRestAfter(ex);
  });
  const rounds = Math.max(1, +pl.rounds || 1);
  sec = sec * rounds + (rounds - 1) * (+pl.roundRest || 60);
  return Math.max(1, Math.round(sec / 60));
}

function pubLabel(status){
  const item = {
    pending:  ['publish.pending', 'wait'],
    approved: ['publish.approved', 'ok'],
    rejected: ['publish.rejected', 'cold'],
    gone:     ['publish.gone', 'cold']
  }[status] || ['publish.pending', 'wait'];
  return [t(item[0]), item[1]];
}
const pubbed = () => customPrograms.filter(p => p.pub && p.pub.id);

function openMyCatalog(){
  renderMyCatalog();
  show('scrMyCatalog');
  refreshAllPubStatus();
}
function renderMyCatalog(){
  const box = $('mcList');
  box.innerHTML = '';
  const list = pubbed();
  list.forEach(p => {
    const [label, tone] = pubLabel(p.pub.status);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'cl-row';
    const ex = (normPlans(p)[0].exercises || []).length;
    row.innerHTML = `<div class="ua">${icon('crown')}</div>`
      + `<div class="ub"><b></b><small></small></div><span class="cl-state ${tone}"></span>`;
    row.querySelector('b').textContent = p.name;
    row.querySelector('.ub small').textContent =
      storeCountText(ex, 'exercise');
    row.querySelector('.cl-state').textContent = label;
    row.onclick = ()=> openPublish(p);
    box.appendChild(row);
  });
  $('mcHint').textContent = list.length
    ? t('publish.listHint')
    : t('publish.emptyHint');
}
// Статусы всех заявок разом: по одной на программу — это столько путей до сервера,
// сколько программ.
async function refreshAllPubStatus(){
  const list = pubbed();
  if(!list.length) return;
  try{
    const d = await apiFetch('/api/catalog?status=' + encodeURIComponent(list.map(p => p.pub.id).join(',')));
    let ch = false;
    list.forEach(p => {
      const st = d.status && d.status[p.pub.id];
      if(st && st !== p.pub.status){ p.pub.status = st; ch = true; }
    });
    if(ch){
      await savePrograms();
      if(show._last === 'scrMyCatalog') renderMyCatalog();
      if(show._last === 'scrPublish') fillPublish();
      renderTrainerCard();
    }
  }catch(e){}
}

function openPublish(p){
  pubProg = p;
  // Возврат туда, откуда пришли: из списка, со страницы программы или из «В каталоге».
  pubFrom = ['scrMyCatalog', 'scrStart', 'scrPrograms'].includes(show._last) ? show._last : 'scrPrograms';
  pubDraft = Object.assign({cat: '', level: '', gives: ''}, p.pub && p.pub.draft || {});
  fillPublish();
  show('scrPublish');
  refreshPubStatus();
}

function fillPublish(){
  const p = pubProg;
  if(!p) return;
  const ex = (normPlans(p)[0].exercises || []).length;
  $('pubName').textContent = p.name;
  $('pubSub').textContent = t('publish.approx',{count:ex,exercises:storeCountText(ex,'exercise').replace(/^\d+\s+/,''),minutes:estimateMinutes(p)});

  const st = p.pub && p.pub.status;
  const shown = st ? t({
    pending:'publish.pendingText',
    approved:'publish.approvedText',
    rejected:'publish.rejectedText',
    gone:'publish.goneText'
  }[st] || 'publish.pendingText') : '';
  $('pubState').textContent = shown;
  $('pubState').classList.toggle('warn', st === 'rejected' || st === 'gone');
  setShown('pubForm', st !== 'pending' && st !== 'approved');
  setShown($('btnPublish').parentElement, st !== 'pending' && st !== 'approved');

  const fill = (btnId, valId, chevId, ph, opts, cur, onPick) => {
    const cho = opts.find(([v]) => v === cur);
    $(valId).textContent = cho ? cho[1] : ph;
    $(btnId).classList.toggle('ph', !cho);
    $(chevId).innerHTML = icon('chevD');
    $(btnId).onclick = ()=> openOptPicker(ph, opts, cur, v => { onPick(v); fillPublish(); });
  };
  fill('pubCatBtn', 'pubCatVal', 'pubCatChev', t('ai.goal'),
       OPT_GOAL.map(g => [g, canonicalLabel(g)]), pubDraft.cat, v => pubDraft.cat = v);
  fill('pubLevelBtn', 'pubLevelVal', 'pubLevelChev', t('ai.level'),
       OPT_LEVEL.map(l => [l, canonicalLabel(l)]), pubDraft.level, v => pubDraft.level = v);
  if(document.activeElement !== $('pubGives')) $('pubGives').value = pubDraft.gives || '';
}

// Что стало с заявкой. Спрашиваем сервер, а не помним своё: «на проверке» навсегда
// — это ровно то, из-за чего человек жмёт кнопку повторно.
async function refreshPubStatus(){
  const p = pubProg;
  if(!p || !p.pub || !p.pub.id) return;
  try{
    const d = await apiFetch('/api/catalog?status=' + encodeURIComponent(p.pub.id));
    const st = d.status && d.status[p.pub.id];
    if(st && st !== p.pub.status){
      p.pub.status = st;
      await savePrograms();
      if(show._last === 'scrPublish') fillPublish();
    }
  }catch(e){}
}

async function doPublish(){
  const p = pubProg;
  if(!p) return;
  pubDraft.gives = clampText($('pubGives').value, LIM.gives);
  const miss = [];
  if(!pubDraft.cat) miss.push(t('publish.needGoal'));
  if(!pubDraft.level) miss.push(t('publish.needLevel'));
  if(pubDraft.gives.length < 20) miss.push(t('publish.needGives'));
  const ex = (normPlans(p)[0].exercises || []).length;
  if(ex < 3) miss.push(t('publish.needExercises'));
  if(miss.length){
    appAlert(t('publish.missing',{items:miss.join(', ')}));
    return;
  }
  try{
    const r = await apiPost('/api/catalog', {
      by: normHandle(trainer.handle),
      trainerKey: trainer.key || '',
      item: {
        sourceLocale: (p.locale === 'ru' || p.locale === 'en') ? p.locale : (appLocale === 'ru' ? 'ru' : 'en'),
        name: p.name, gives: pubDraft.gives,
        // cat — КЛЮЧ цели («cardio»), а не её название: по нему подбирается обложка
        // и работают фильтры витрины. С названием обложка бралась первая попавшаяся.
        cat: (STORE_LOOK[pubDraft.cat] || {}).id || '',
        level: pubDraft.level,
        min: estimateMinutes(p), exCount: ex, text: programToText(p),
        // Своя обложка, если тренер её задал. Рисованная по цели остаётся запасной.
        cover: (p.cover && String(p.cover).length < 90000) ? p.cover : null,
        // Фото упражнений — отдельной картой: в тексте программы им места нет.
        media: programMedia(p)
      }
    });
    p.pub = {id: r.id, status: r.status, draft: pubDraft};
    await savePrograms();
    fillPublish();
    renderCatalogRow();
    appAlert(t('publish.sent'));
  }catch(e){
    const why = {
      no_trainer: t('publish.errNoTrainer'),
      not_yours: t('publish.errNotYours'),
      banned: t('publish.errBanned'),
      too_many_today: t('publish.errTooMany'),
      already_sent: t('publish.errAlready'),
      no_store: t('publish.errStore'),
      bad_item: t('publish.errBad',{items:((e.miss || []).join(', ') || t('publish.checkFields'))})
    }[e && e.code];
    appAlert(why || t('publish.errNetwork'));
  }
}

function openStore(from){
  storeFrom = from || 'scrMenu';
  if(!storeServer.length) storeServer = lastSeen('catalog_' + (appLocale === 'ru' ? 'ru' : 'en')) || [];
  // Свежие позиции подтягиваем при входе и дорисовываем, когда придут: витрина
  // не должна ждать сеть, чтобы показать то, что уже есть.
  loadStoreServer().then(()=>{ if(show._last === 'scrStore'){ renderStoreFilters(); renderStore(); } });
  storeFilter = {q: '', cat: '', level: ''};
  $('storeQuery').value = '';
  setShown('storeClear', false);
  renderStoreFilters();
  renderStore();
  show('scrStore', true);
  window.scrollTo(0, 0);
}

// Заявки живут рядом с профилем тренера: это его публикации и модерация, а не
// обычный список тренировок. Строка сразу показывает сводку статусов.
function renderCatalogRow(){
  if(!$('btnMyCatalog')) return;
  const n = storeAll().length;
  $('storeRowSub').textContent = n
    ? t('catalog.fromTrainers',{count:n,programs:storeCountText(n,'program').replace(/^\d+\s+/,'')})
    : t('catalog.trainerWorkouts');
  // Строку заявок показываем, только когда заявки есть: «ничего не отправлено»
  // сообщает ровно то, что строку не надо было показывать.
  const pub = pubbed();
  setShown('btnMyCatalog', trainerOn() && pub.length > 0);
  if(!pub.length) return;
  const byStatus = st => pub.filter(p => p.pub.status === st).length;
  $('coachCatSub').textContent =
    [[byStatus('approved'), t('publish.statusCatalog')], [byStatus('pending'), t('publish.statusReview')],
     [byStatus('rejected'), t('publish.statusRejected')]]
      .filter(([k]) => k > 0).map(([k, w]) => `${k} ${w}`).join(' · ');
}

function renderMine(){
  renderCatalogRow();
  const box = $('mineList'); box.innerHTML='';
  const own = customPrograms.length;
  $('progCount').textContent = own ? storeCountText(own,'program') : t('programs.none');

  if(!customPrograms.length){
    box.insertAdjacentHTML('beforeend',
      '<div class="empty-state">' +
      `<span class="es-ico">${icon('sparkle')}</span>` +
      '<b>' + esc(t('programs.emptyTitle')) + '</b>' +
      '<p>' + esc(t('programs.emptyText')) + '</p>' +
      '</div>');
    renderToday();
    return;
  }
  customPrograms.forEach(p=>{
    const wrap = document.createElement('div');
    // выключенную программу не прячем: иначе кажется, что она пропала совсем.
    // Приглушаем и подписываем словом — одним цветом такое сообщать нельзя
    const on = progActive(p);
    wrap.className = 'mine-card' + (on ? '' : ' off');
    const card = document.createElement('button');
    card.className = 'month-card';
    const plans = normPlans(p);
    const exTotal = plans.reduce((n, pl)=> n + pl.exercises.length, 0);
    const daysU = programDaysUnion(p);
    // расписание — один чип, очередь вариантов — отдельный: длинная строка
    // «Пн · Ср · 07:30 · варианты по очереди» разрывалась посреди фразы
    const schedule = [daysU.length ? daysU.map(canonicalLabel).join(' · ') : '', p.time].filter(Boolean).join(' · ');
    const rotates = p.rotate && plans.length > 1;
    const done = (p.stats && p.stats.completions) || 0;
    const cover = p.cover ? `<img src="${esc(p.cover)}" alt="">` : DUMBBELL_ICON;
    const setsOne = (plans[0].exercises || []).reduce((n, e) => n + (e.warmup ? 0 : (parseInt(e.sets) || 1)), 0);
    const volOne = (plans[0].rounds > 1 || setsOne <= plans[0].exercises.length)
      ? storeCountText(plans[0].rounds,'round')
      : storeCountText(setsOne,'set');
    // человеческие подписи вместо «Упр-ий» и «Вар-ов»
    const exWord = storeCountText(exTotal,'exercise');
    const line1 = plans.length > 1
      ? `${storeCountText(plans.length,'variant')} · ${exWord}`
      : `${exWord} · ${volOne}`;
    card.innerHTML =
      `<div class="mc-cover">${cover}</div>` +
      `<div class="mc-body"><h3></h3>` +
      `<p>${line1}</p>` +
      (done ? `<p>${esc(t('programs.completed',{count:done}))}</p>` : '') +
      ((schedule || rotates || !on)
        ? `<p class="mc-chips">` +
          (!on ? `<span class="sched off">${icon('power')}${esc(t('programs.offShort'))}</span>` : '') +
          (schedule ? `<span class="sched">${icon('calendar')}<span></span></span>` : '') +
          (rotates ? `<span class="sched">${icon('reset')}${esc(t('programs.sequence'))}</span>` : '') +
          `</p>`
        : '') + `</div>`;
    card.querySelector('h3').textContent = p.name;
    if(schedule) card.querySelector('.sched span').textContent = schedule;
    card.onclick = ()=> openStart(p);

    // контекстное меню ⋮
    const more = document.createElement('button');
    more.className = 'more-btn';
    more.innerHTML = icon('more');
    more.title = t('common.actions');
    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    const bEdit = document.createElement('button');
    bEdit.innerHTML = icon('pencil') + t('common.edit');
    bEdit.onclick = ()=>{ closeAllMenus(); openBuilder(p.id); };
    // включить / отключить: рядом с «Изменить», а не рядом с «Удалить» — это
    // не уничтожение, и путать эти два действия соседством нельзя
    const bOff = document.createElement('button');
    bOff.innerHTML = icon('power') + (on ? t('programs.disable') : t('programs.enable'));
    bOff.title = on ? t('programs.disableTitle') : t('programs.enableTitle');
    bOff.onclick = async ()=>{
      closeAllMenus();
      p.active = !on;
      await savePrograms();
      renderMine();
      // объясняем только выключение: включение возвращает привычное поведение,
      // а вот исчезновение программы из «Сегодня» без объяснения пугает
      if(on) appAlert(t('programs.disabledAlert'));
    };
    const bShare = document.createElement('button');
    bShare.innerHTML = icon('share') + t('programs.shareLink');
    bShare.onclick = ()=>{ closeAllMenus(); exportProgram(p); };
    // «Отправить подопечному» — то же действие, но с адресатом: отправка запоминается,
    // и потом видно, кому что уходило. Пункт есть только у тренера.
    const bClient = document.createElement('button');
    bClient.innerHTML = icon('users') + t('programs.sendClient');
    bClient.onclick = ()=>{ closeAllMenus(); pickClientFor(p); };
    const bFile = document.createElement('button');
    bFile.innerHTML = icon('download') + t('programs.saveFile');
    bFile.title = t('programs.allImages');
    bFile.onclick = ()=>{ closeAllMenus(); exportProgramFile(p); };
    const bDel = document.createElement('button');
    bDel.className = 'danger';
    bDel.innerHTML = icon('trash') + t('common.delete');
    bDel.onclick = async ()=>{
      closeAllMenus();
      if(!(await appDialog(t('programs.deleteQuestion',{name:p.name}), {confirm: true, okText: t('common.delete'), cancelText: t('common.keep')}))) return;
      customPrograms = customPrograms.filter(x=>x.id!==p.id);
      await savePrograms();
      renderMine();
    };
    // Копия и предложение в каталог — те же действия, что на экране программы.
    // Действие, доступное в одном месте и недоступное в другом, человек считает
    // сломанным, а не «не предусмотренным здесь».
    const bCopy = document.createElement('button');
    bCopy.innerHTML = icon('copy') + t('common.duplicate');
    bCopy.onclick = async ()=>{
      closeAllMenus();
      const c = await duplicateProgram(p);
      openBuilder(c.id);
    };
    const bPub = document.createElement('button');
    bPub.innerHTML = icon('crown') + t('programs.submitCatalog');
    bPub.onclick = ()=>{ closeAllMenus(); openPublish(p); };

    menu.append(bEdit, bOff, bCopy, bShare);
    if(trainerOn()) menu.append(bClient);
    if(trainerOn() && !p.storeId) menu.append(bPub);
    menu.append(bFile, bDel);
    more.onclick = e=>{ e.stopPropagation(); toggleMenu(menu); };
    const handle = document.createElement('button');
    handle.className = 'drag-handle';
    handle.innerHTML = icon('grip');
    handle.title = t('programs.drag');
    wrap.append(card, handle, more, menu);
    wrap.dataset.pid = p.id;
    enableDrag(wrap, handle);
    box.appendChild(wrap);
  });
  renderToday();
}

