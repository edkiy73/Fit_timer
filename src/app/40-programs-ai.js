/* ================= ПРОГРЕССИЯ НАГРУЗКИ ================= */
// Раз в progression ТРЕНИРОВОК ЭТОГО УПРАЖНЕНИЯ рабочая нагрузка растёт на свой
// шаг — см. ensurePs/advanceExerciseProgression в 60-builder.js и инкремент
// ex.ps.n в commitFinish (70-workout.js). Раньше был один счётчик на программу
// (p.progSteps, потом progStepsAdj поверх floor(completions/progression)):
// удобно для отката, но при чередовании вариантов A/Б каждое упражнение
// получало +1 шаг за КАЖДУЮ тренировку программы, включая дни, где его вообще
// не было. Состояние теперь у каждого упражнения отдельно и растёт только тогда,
// когда это упражнение реально выполнено.
// Прогрессия по-прежнему считается по ФАКТИЧЕСКИ пройденным тренировкам, а не по
// календарю: раньше вес рос просто оттого, что прошло время (отпуск на месяц —
// и программа подняла нагрузку на четыре шага без единой тренировки), что и
// демотивирует, и травмоопасно.
// applyProgressionAll() здесь — не про сам расчёт (он в ensurePs/getExProgValue),
// а только про одноразовую миграцию старых программ на эту модель.
function applyProgressionAll(){
  let changed = false;
  customPrograms.forEach(p => {
    // у программ, живших на календарной прогрессии, уже накоплен progSteps — превращаем его
    // в ручную поправку, чтобы прогресс не обнулился при переходе на счёт по тренировкам
    if(p.progLast != null && p.progStepsAdj == null){
      // переносим только реально накопленный календарём счётчик. Если его нет, программа
      // на календарной прогрессии не жила и переносить нечего: поправка «0 минус авто»
      // ушла бы в минус и навсегда обнулила бы весь будущий рост
      if(p.progSteps != null){
        const done = (p.stats && p.stats.completions) || 0;
        const auto = p.progression ? Math.floor(done / p.progression) : 0;
        p.progStepsAdj = Math.max(0, Math.round(+p.progSteps || 0)) - auto;
      }
      delete p.progLast; // календарь больше не используется
      changed = true;
    }
  });
  if(applyPerExerciseProgressionMigration()) changed = true;
  customPrograms.forEach(p => { if(uniqueExerciseIds(p)) changed = true; });
  if(changed) savePrograms();
}

// Переход с одного счётчика шагов на программу (progSteps = floor(completions/
// progression) + progStepsAdj, читался на лету) на состояние у каждого
// упражнения (ex.ps.cur) — см. docs/ai-edit-progression-plan.md, пачка 3.
// Работает один раз на программу (p.psMigrated): текущая нагрузка КАЖДОГО
// упражнения прогоняется через advanceExerciseProgression() ровно столько раз,
// сколько шагов у него уже фактически накопилось по СТАРОЙ формуле — так все
// ограничения (потолок, двойная прогрессия) применяются как всегда, а не
// переносятся смещением. ex.value/ex.weight (база) не трогаем: если человек ещё
// не обновил мобильное приложение, оно продолжит показывать те же числа, что и
// раньше — база и общий счётчик программы у него по-прежнему на месте, ex.ps
// он просто не знает. Дрейф возможен, только если тренировки на старом
// приложении продолжаются ПОСЛЕ того, как программа уже росла на новом —
// тот же класс риска, что и у любого другого различия версий приложения.
function applyPerExerciseProgressionMigration(){
  let changed = false;
  customPrograms.forEach(p => {
    if(p.psMigrated) return;
    p.psMigrated = true;
    changed = true;
    if(!p.progression) return;
    const done = Math.max(0, +((p.stats && p.stats.completions) || 0));
    const oldProgramSteps = Math.max(0, Math.floor(done / p.progression) + Math.round(+p.progStepsAdj || 0));
    normPlans(p).forEach(pl => (pl.exercises || []).forEach(ex => {
      const progFrom = Math.max(0, Math.round(+ex.progFrom || 0));
      delete ex.progFrom;
      if(ex.warmup || progAxis(ex) === 'none') return;
      ensurePs(ex).n = done % p.progression;
      const exSteps = Math.max(0, oldProgramSteps - progFrom);
      for(let i = 0; i < exSteps; i++) advanceExerciseProgression(ex);
    }));
  });
  return changed;
}

/* ================= ПРИВЕТСТВИЕ И БЛОК «СЕГОДНЯ» ================= */

/* Чип на главной — короткая метка, и объяснить себя в двух словах она не может:
   «под угрозой» и «отработано» звучат как приговор, пока не сказано, что за ними.
   Поэтому чип с объяснением — КНОПКА, и нажатие открывает одну фразу: откуда
   число и что с ним делать. Тот же приём, что у достижений в «Прогрессе». */
function makeChip({ico, val, label, cls, why}){
  const el = document.createElement(why ? 'button' : 'span');
  if(why) el.type = 'button';
  el.className = 'g-chip' + (cls ? ' ' + cls : '');
  const has = val !== '' && val != null;
  el.innerHTML = icon(ico) + (has ? '<b></b>' : '') + '<span></span>';
  if(has) el.querySelector('b').textContent = val;
  el.querySelector('span').textContent = label;
  if(why) el.onclick = ()=> appAlert(why);
  return el;
}

function renderGreeting(){
  const u = curUser();
  const h = new Date().getHours();
  const hi = h < 5 ? t('home.goodNight') : h < 12 ? t('home.goodMorning') : h < 18 ? t('home.goodDay') : t('home.goodEvening');
  const name = (u && u.name || '').trim();
  // Имени на главной нет намеренно. Своё имя человек и так знает, а в крупном
  // начертании оно ведёт себя непредсказуемо: длинное переносится, короткое выглядит
  // обрубком, имя по умолчанию превращает приветствие в «Доброе утро, Мой профиль».
  // Одно приветствие читается спокойнее и одинаково у всех. Чей это экран, показывает
  // аватарка рядом.
  $('greetName').textContent = hi;
  // аватарка: фото, первая буква имени или иконка — то же правило, что в профиле
  $('greetAva').innerHTML = (u && u.photo)
    ? `<img src="${esc(u.photo)}" alt="">`
    : (name ? esc(name[0].toUpperCase()) : icon('user'));
  const box = $('greetChips');
  box.innerHTML = '';
  const chip = o => box.appendChild(makeChip(o));
  const si = calcStreakInfo();
  // Серия не пропадает с экрана от одного пропуска. Пока долг можно отработать, она
  // висит «под угрозой» — это приглашение, а не приговор; а сгоревшая оставляет после
  // себя рекорд, потому что собранное мы не отбираем.
  if(si.n) chip({
    ico: 'flame', val: si.n, cls: si.risk ? 'warn' : 'hot',
    label: si.risk ? t('home.streakRisk') : streakWord(si.n, si.byPlan),
    // числа в подсказках стоят ПОСЛЕ двоеточия: «1 тренировка ещё не пройдены»
    // получалось само собой, стоило числу встать перед глаголом
    why: si.risk
      ? t('home.streakRiskWhy',{count:si.n})
      : t('home.streakWhy',{count:si.n})
  });
  else if(si.best > 1) chip({
    ico: 'flame', val: si.best, label: t('home.bestStreak'),
    why: t('home.bestStreakWhy',{count:si.best})
  });
  const n = stats.count || 0;
  // счётчик тренировок теперь крупной цифрой ниже, в «Прогрессе», — в чипах он был вторым разом
  const mins = Math.round((stats.totalSec || 0) / 60);
  if(mins) chip({
    ico: 'clock',
    val: mins < 60 ? mins : Math.round(mins / 60),
    label: mins < 60 ? t('home.minutesTotal') : t(Math.round(mins/60)===1?'home.hourTotalOne':'home.hourTotalMany'),
    why: t('home.totalTimeWhy',{minutes:mins,workouts:n})
  });
  if(!box.children.length) chip({ico:'sparkle',label:t('home.firstAhead')});
  // крупные цифры под приветствием — они же кнопки в нужную вкладку статистики
  const last = stats.weights && stats.weights.length ? stats.weights[stats.weights.length - 1] : null;
  countTo('qsVal1', n);
  $('qsVal2').textContent = last && last.w ? String(last.w).replace('.', ',') : '—';
  countTo('qsVal3', (photos || []).length);
  renderWellQuick();
}

// Вторая строка «Прогресса»: давление, пульс и сон средним за месяц.
// Плитка появляется только под то, что человек правда записывает, — см. wellAvg().
function renderWellQuick(){
  const box = $('qsWell');
  if(!box) return;
  const a = wellAvg();
  const r1 = v => String(Math.round(v));
  const cards = [];
  // давление — одно число из двух половин, врозь «124» и «79» не читаются
  // «Ср.» стоит в самой подписи: отдельная строка-пояснение под плитками была лишним
  // текстом, а без неё среднее читалось как последнее измерение
  if(a.sys != null && a.dia != null) cards.push({ico: 'gauge', val: r1(a.sys) + '/' + r1(a.dia), label: t('home.avgPressure')});
  if(a.pulse != null) cards.push({ico: 'heart', val: r1(a.pulse), label: t('home.avgPulse')});
  if(a.sleep != null) cards.push({ico: 'moon', val: String(Math.round(a.sleep * 10) / 10).replace('.', ','), label: t('home.avgSleep')});
  box.innerHTML = '';
  cards.forEach(({ico, val, label}) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'qs-btn';
    b.innerHTML = `<span class="qs-ico">${icon(ico)}</span><b></b><span></span>`;
    b.querySelector('b').textContent = val;
    b.querySelector('span:last-child').textContent = label;
    // самочувствие живёт во вкладке «Тело» — там же, где вес
    b.onclick = ()=> openStats('weight');
    box.appendChild(b);
  });
  setShown(box, !!cards.length);
}

// счётчик добегает до значения — но только если человек не просил убрать движение
function countTo(id, val){
  const el = $(id);
  if(!el) return;
  val = Math.max(0, Math.round(val || 0));
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce || val <= 1 || el.textContent === String(val)){ el.textContent = val; return; }
  clearInterval(el._cnt);
  const t0 = Date.now(), dur = 520;
  el._cnt = setInterval(()=>{
    const k = Math.min(1, (Date.now() - t0) / dur);
    el.textContent = Math.round(val * (1 - Math.pow(1 - k, 3)));
    if(k >= 1) clearInterval(el._cnt);
  }, 40);
}

// строка плана — целиком кнопка, чтобы нажатие по названию программы работало
function todayRow({cls, ico, title, sub, action, onclick}){
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'today-row' + (cls ? ' ' + cls : '');
  row.innerHTML = `<span class="tr-ico">${icon(ico)}</span>` +
    `<span class="ti"><b></b><small></small></span>` +
    `<span class="tr-go"></span>`;
  row.querySelector('b').textContent = title;
  row.querySelector('small').textContent = sub;
  row.querySelector('.tr-go').textContent = action;
  row.onclick = onclick;
  return row;
}

// неделя одним взглядом: где галочка — уже сделано, где точка — по плану.
// Состояние передаётся формой значка, а не только цветом.
/* ---- неделя: что назначено, что закрыто и что ещё можно отработать ----
   Неделя считается по СЛОТАМ плана, а слот — это «программа P в день D».
   День выполнен, только когда закрыты ВСЕ слоты этого дня. Раньше день закрывала
   любая тренировка: человек делал десятиминутную разминку вместо силовой — и неделя
   рапортовала «выполнено».
   ОТРАБОТКА: лишняя тренировка закрывает ПРОШЕДШИЙ незакрытый слот той же программы.
   Пропустил среду, сделал в четверг — неделя закрыта, а не «2 из 3 и крестик».
   План недельный, и закрывать его неделей честнее, чем требовать попадания в день.
   Будущие слоты и сегодняшний отработкой НЕ закрываются: иначе «План на сегодня» звал
   бы на тренировку, которую неделя уже посчитала сделанной, — два экрана врали бы
   друг про друга.
   Записи истории до появления pid (id программы) отнести к плану нельзя — они идут
   в «сверх плана», а не занижают выполнение. */
function weekPlanInfo(date){
  const now = date || new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  // «сегодня» — всегда настоящее сегодня: для прошедших недель все слоты уже позади
  const todayIso = localISO(new Date());
  const isos = DAYS.map((_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return localISO(d); });
  const hist = stats.history || [];

  const slots = [];
  customPrograms.forEach(p => planDays(p).forEach(nm => {
    const i = DAYS.indexOf(nm);
    if(i >= 0) slots.push({pid: p.id, idx: i, from: null});
  }));
  const ent = [];
  hist.forEach(h => {
    const i = isos.indexOf(h.d);
    if(i >= 0) ent.push({idx: i, pid: h.pid || null, used: false});
  });
  ent.sort((a, b) => a.idx - b.idx);

  // 1) тренировка в свой день закрывает свой слот
  slots.forEach(s => {
    const e = ent.find(x => !x.used && x.pid === s.pid && x.idx === s.idx);
    if(e){ e.used = true; s.from = s.idx; }
  });
  // 2) отработка: свободная тренировка той же программы закрывает прошедший пропуск.
  //    Берём ближайшую по времени, чтобы подпись «отработана в четверг» не врала.
  slots.forEach(s => {
    if(s.from !== null || isos[s.idx] >= todayIso) return;
    let best = null;
    ent.forEach(x => {
      if(x.used || x.pid !== s.pid) return;
      if(!best || Math.abs(x.idx - s.idx) < Math.abs(best.idx - s.idx)) best = x;
    });
    if(best){ best.used = true; s.from = best.idx; }
  });

  const days = DAYS.map((nm, i) => {
    const mine = slots.filter(s => s.idx === i);
    const shut = mine.filter(s => s.from !== null);
    const iso = isos[i];
    const past = iso < todayIso;
    return {
      name: nm, iso, idx: i,
      planned: mine.length,
      done: shut.length,
      slots: mine.map(s => ({pid:s.pid, from:s.from})),
      moved: shut.filter(s => s.from !== i).length,
      movedFrom: [...new Set(shut.filter(s => s.from !== i).map(s => s.from))],
      help: slots.filter(s => s.from === i && s.idx !== i).length, // закрыл чужой пропуск
      extra: ent.filter(x => x.idx === i && !x.used).length,
      any: ent.some(x => x.idx === i),
      full: mine.length > 0 && shut.length >= mine.length,
      part: mine.length > 0 && shut.length > 0 && shut.length < mine.length,
      debt: mine.length > 0 && shut.length < mine.length && past,
      past, today: iso === todayIso, future: iso > todayIso
    };
  });
  // долг — только прошедшие незакрытые слоты: сегодняшний план ещё не пропуск
  const debt = slots.filter(s => s.from === null && isos[s.idx] < todayIso).sort((a, b) => a.idx - b.idx);
  return {
    monday, todayIso, days, debt,
    plannedDays: days.filter(d => d.planned).length,
    fullDays: days.filter(d => d.full).length,
    plannedTotal: slots.length,
    doneTotal: slots.filter(s => s.from !== null).length,
    movedTotal: slots.filter(s => s.from !== null && s.from !== s.idx).length,
    debtTotal: debt.length,
    extraTotal: ent.filter(x => !x.used).length,
    anyDays: days.filter(d => d.any).length
  };
}

function renderWeekStrip(){
  const box = $('weekStrip');
  if(!box) return;
  box.innerHTML = '';
  const w = weekPlanInfo();
  const di = (new Date().getDay() + 6) % 7;
  w.days.forEach((d, i) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    // пропуск — только у прошедших дней: сегодняшний план ещё можно закрыть
    cell.className = 'ws-day'
      + (d.planned && !d.past && !d.done ? ' plan' : '')
      + (d.full ? ' done' : (d.part ? ' part' : ''))
      + (i === di ? ' today' : '');
    let mark = '<i></i>';
    if(d.full) mark = `<span class="ws-ok">${icon('check')}</span>`;
    else if(d.part) mark = `<span class="ws-part">${d.done}/${d.planned}</span>`;
    else if(d.debt) mark = '<i class="ws-debt"></i>';
    else if(!d.planned && d.any) mark = `<span class="ws-extra">${icon('check')}</span>`;
    cell.innerHTML = `<b>${canonicalLabel(d.name)}</b>` + mark;
    cell.onclick = ()=> openWeekDay(d);
    box.appendChild(cell);
  });
  // ---- счёт недели: цифра, полоса и чипы вместо одной серой строки через « · » ----
  // Смысл тот же, что и был (weekPlanInfo не трогаем), но «сколько закрыто» и
  // «что ещё можно закрыть» — разные мысли, и читаться должны раздельно.
  const planned = w.plannedTotal, closed = planned > 0 && w.doneTotal >= planned;
  setShown('weekScore', planned > 0);
  setShown('weekBar', planned > 0);
  if(planned > 0){
    $('weekDone').textContent = w.doneTotal;
    $('weekOf').textContent = t('week.of',{total:planned});
    $('weekScore').classList.toggle('full', closed);
    $('weekBar').classList.toggle('full', closed);
    // ширину ставим следующим кадром — иначе полоса не «дорастает», а появляется готовой
    const fill = Math.round(100 * Math.min(1, w.doneTotal / planned)) + '%';
    requestAnimationFrame(()=> { $('weekBarFill').style.width = fill; });
  }

  const chips = $('weekChips');
  chips.innerHTML = '';
  const chip = o => chips.appendChild(makeChip(o));
  if(planned > 0){
    if(closed) chip({
      ico: 'check', val: '', label: t('week.closed'), cls: 'ok',
      why: t('week.closedWhy',{done:planned,total:planned})
    });
    // пропуск — не приговор, а незакрытое дело: неделя ещё идёт, срок — воскресенье
    else if(w.debtTotal) chip({
      ico: 'clock', val: w.debtTotal, label: t('week.makeUp'), cls: 'warn',
      why: t('week.makeUpWhy',{count:w.debtTotal})
    });
    if(w.movedTotal) chip({
      ico: 'reset', val: w.movedTotal, label: t(w.movedTotal===1?'week.movedOne':'week.movedMany'),
      why: t('week.movedWhy',{count:w.movedTotal})
    });
    // «сверх плана» без плана — пустые слова: там всё, что сделано, и есть вся неделя
    if(w.extraTotal) chip({
      ico: 'plus', val: w.extraTotal, label: t('week.extra'),
      why: t('week.extraWhy',{count:w.extraTotal})
    });
  }

  // подпись остаётся ровно там, где чипами не сказать: расписания ещё нет
  const hint = !planned
    ? (w.anyDays
        ? t('week.doneThisWeek',{count:w.anyDays,workouts:appLocale==='ru'?plural(w.anyDays,t('calendar.workoutOne'),t('calendar.workoutFew'),t('calendar.workoutMany')):t(w.anyDays===1?'calendar.workoutOne':'calendar.workoutFew')})
        : t('week.daysUnset'))
    : '';
  $('weekStripHint').textContent = hint;
  setShown('weekStripHint', !!hint);
}

// Программа из попапа дня: закрываем попап и открываем страницу программы на том
// варианте, который стоит в этот день. Состав смотрят уже там, а не в попапе.
function openDayProgram(pid, pi){
  const p = customPrograms.find(x => x.id === pid);
  if(!p) return;
  $('sessModal').classList.remove('open');
  openStart(p);
  if(pi >= 0 && pi < normPlans(p).length && pi !== state.planIdx){
    state.planIdx = pi; renderPlanRow(); renderStartInfo();
  }
}

// нажатие по дню недели: выполненное остаётся подробной историей, а незакрытый
// план показываем отдельными карточками программ — не строкой названий через запятую.
function openWeekDay(d){
  const entries = (stats.history || []).filter(h => h.d === d.iso);
  const title = canonicalLabel(DAY_FULL[d.idx]) + ', ' + dayTitle(d.iso);
  openSessions(t('sessions.dayLabel'), title, entries, '', {status:true});
  const box = $('sessList');
  let plannedRows = 0;

  (d.slots || []).forEach(slot => {
    // Слот, закрытый тренировкой именно в этот день, уже показан выше как sessRow.
    // Здесь нужны только будущие/пропущенные планы и отработки в другой день.
    if(slot.from === d.idx) return;
    const p = customPrograms.find(x => x.id === slot.pid);
    if(!p) return;

    const plans = normPlans(p);
    let planIdx = 0;
    if(p.rotate && plans.length > 1){
      planIdx = defaultPlanIdx(plans, p);
    }else{
      const found = plans.findIndex(pl => (pl.days || []).includes(d.name));
      if(found >= 0) planIdx = found;
    }
    const plan = plans[planIdx] || plans[0] || null;
    const moved = slot.from !== null && slot.from !== d.idx;
    // Обычный текст вместо плашек: что с этой тренировкой в этот день.
    const parts = [moved
      ? t('week.dayMovedOn',{day:appLocale === 'ru' ? canonicalLabel(DAY_FULL[slot.from]).toLowerCase() : canonicalLabel(DAY_FULL[slot.from])})
      : (d.past ? t('week.canStillMakeUp') : t('week.plannedText'))];
    if(p.rotate && plans.length > 1) parts.push(t('today.variant',{current:planIdx+1,total:plans.length}) + '.');

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'sess-row sess-link';
    row.innerHTML = '<div class="sess-head"><b></b></div><p class="sess-line"></p>';
    row.querySelector('.sess-head b').textContent = p.name || t('sessions.workoutFallback');
    row.querySelector('.sess-line').textContent = parts.join(' ');
    row.onclick = () => openDayProgram(p.id, plans.indexOf(plan));

    box.appendChild(row);
    plannedRows++;
  });

  if(!entries.length && !plannedRows){
    const empty = document.createElement('p');
    empty.className = 'sess-empty';
    empty.textContent = t('week.nonePlanned');
    box.appendChild(empty);
  }
}

function renderToday(){
  renderWeekStrip();
  const box = $('todayBox');
  const di = (new Date().getDay() + 6) % 7;
  const today = DAYS[di];
  $('todayDayName').textContent = canonicalLabel(DAY_FULL[di]);
  const anyDays = customPrograms.some(p => planDays(p).length);
  setShown(box, true);
  // раньше без расписания блок просто исчезал, и «Сегодня» оставалась пустой.
  // Теперь она всегда честно говорит, что делать дальше, и ведёт в «Тренировки».
  if(!anyDays){
    const l = $('todayList');
    l.innerHTML = '';
    box.classList.remove('has-plan');
    const own = customPrograms.filter(p => p.id !== 'warmup').length;
    const onlyWarmup = !own && customPrograms.length > 0;
    // расписание может быть задано и при этом не работать — если все программы
    // выключены. «Расписание не задано» звало бы чинить то, что не сломано
    const allOff = !!own && customPrograms.every(p => !progActive(p) || !programDaysUnion(p).length)
                   && customPrograms.some(p => !progActive(p) && programDaysUnion(p).length);
    l.appendChild(todayRow({
      cls: 'rest info',
      ico: allOff ? 'power' : 'sparkle',
      title: allOff ? t('today.programsOff') : (own ? t('today.noSchedule') : (onlyWarmup ? t('today.warmupOnly') : t('today.noPrograms'))),
      sub: allOff ? t('today.enableProgram')
                  : (own ? t('today.chooseDays') : t('today.buildProgram')),
      action: own ? t('today.open') : t('today.create'),
      onclick: ()=> goTab('scrPrograms')
    }));
    return;
  }

  const doneToday = new Set(stats.history.filter(h => h.d === localISO(new Date())).map(h => h.pid));
  const scheduled = [];
  customPrograms.forEach(p => {
    if(!progActive(p)) return;   // выключенная программа на сегодня не зовёт
    const plans = normPlans(p);
    if(p.rotate && plans.length > 1){
      // ротация: дни общие для программы, вариант берём очередной по очереди
      if((p.days || []).includes(today)){
        scheduled.push({p, plan: plans[defaultPlanIdx(plans, p)], done: doneToday.has(p.id), rot: true});
      }
      return;
    }
    const idx = plans.findIndex(pl => (pl.days || []).includes(today));
    if(idx >= 0) scheduled.push({p, plan: plans[idx], done: doneToday.has(p.id)});
  });

  const list = $('todayList');
  list.innerHTML = '';
  box.classList.toggle('has-plan', scheduled.length > 0);

  // Отработка: пропущенный день недели, который ещё можно закрыть. Пропуск без
  // способа исправиться — тупик: человек видит дыру в неделе и ничего не может с ней
  // сделать. Строка даёт конкретное выполнимое дело и появляется только тогда, когда
  // на сегодня ничего не ждёт: сначала сегодняшний план, долги потом.
  const makeUpRow = ()=>{
    const w = weekPlanInfo();
    const slot = w.debt[0];
    if(!slot) return null;
    const p = customPrograms.find(x => x.id === slot.pid);
    if(!p) return null;
    const more = w.debtTotal > 1 ? t('today.andMore',{count:w.debtTotal-1}) : '';
    return todayRow({
      ico: 'reset',
      title: t('today.makeUp'),
      sub: t('today.makeUpSub',{day:canonicalLabel(DAY_FULL[slot.idx]),name:p.name,more}),
      action: t('today.start'),
      onclick: ()=> openStart(p)
    });
  };

  if(scheduled.length){
    scheduled.forEach(({p, plan, done, rot}) => {
      const setsTotal = (plan.exercises || []).reduce((n, e) => n + (e.warmup ? 0 : (parseInt(e.sets) || 1)), 0);
      const bits = [];
      if(rot){
        const plansR = normPlans(p);
        bits.push(t('today.variant',{current:plansR.indexOf(plan)+1,total:plansR.length}));
      }
      bits.push(storeCountText(plan.exercises.length,'exercise'));
      // силовая (подходы у упражнений) — показываем подходы, круговая — круги
      if(plan.rounds > 1) bits.push(storeCountText(plan.rounds,'round'));
      else if(setsTotal > plan.exercises.length) bits.push(storeCountText(setsTotal,'set'));
      const planTime = plan.time || p.time;
      if(planTime) bits.push(planTime);
      list.appendChild(todayRow({
        cls: done ? 'done' : '',
        ico: done ? 'check' : 'play',
        title: p.name,
        sub: done ? t('today.done') : bits.join(' · '),
        action: done ? t('today.again') : t('today.start'),
        onclick: () => openStart(p)
      }));
    });
    // сегодняшнее сделано — можно предложить закрыть долг недели
    if(scheduled.every(s => s.done)){
      const mu = makeUpRow();
      if(mu) list.appendChild(mu);
    }
  } else {
    // день отдыха: ищем ближайшую тренировку в ближайшие 7 дней
    let next = null;
    for(let i = 1; i <= 7 && !next; i++){
      const d = new Date(); d.setDate(d.getDate() + i);
      const dd = DAYS[(d.getDay() + 6) % 7];
      for(const p of customPrograms){
        if(planDays(p).includes(dd)){ next = {day: DAY_FULL[(d.getDay() + 6) % 7], p, in: i}; break; }
      }
    }
    if(next){
      // раньше здесь был просто текст «Следующая тренировка: завтра — Название».
      // Название выглядело нажимаемым, но не нажималось. Теперь это обычная строка
      // плана: тап открывает программу, и в день отдыха можно начать её досрочно.
      const when = next.in === 1 ? t('today.tomorrow') : t('today.onDay',{day:canonicalLabel(next.day)});
      // Название следующей программы в день отдыха не показываем: до неё ещё дожить,
      // а расписание может смениться. Достаточно дня — «Следующая — в понедельник».
      // День установки: программу только что добавили, а приложение отвечает
      // «сегодня отдых» — и первая тренировка не случается никогда. Пока не пройдена
      // ни одна, «отдыха» не бывает: расписание есть, но начать предлагаем сейчас.
      const neverTrained = !stats.history.length;
      list.appendChild(todayRow({
        cls: neverTrained ? '' : 'rest',
        ico: neverTrained ? 'play' : 'moon',
        title: neverTrained ? t('today.startToday') : t('today.rest'),   // заголовок строки не переносится: длиннее — обрежется
        sub: neverTrained ? t('today.firstWorkout',{name:next.p.name}) : t('today.next',{when}),
        action: neverTrained ? t('today.start') : t('today.open'),
        onclick: () => openStart(next.p)
      }));
      // в день отдыха незакрытый долг важнее общих слов про отдых: он конкретен,
      // выполним сегодня и закрывает неделю
      const mu = neverTrained ? null : makeUpRow();
      if(mu) list.appendChild(mu);
      else {
        const note = document.createElement('p');
        note.className = 'today-note';
        note.textContent = neverTrained
          ? t('today.firstNote',{when})
          : t('today.restNote');
        list.appendChild(note);
      }
    } else {
      list.appendChild(todayRow({
        cls: 'rest info',
        ico: 'moon',
        title: t('today.rest'),
        sub: t('today.noWeekWorkouts'),
        action: t('today.open'),
        onclick: () => goTab('scrPrograms')
      }));
    }
  }
}

/* Дублировать программу. Обычный способ начать новую от готовой: у тренера —
   вариант той же программы под другого подопечного, у человека — «то же, но легче».
   Всё, что привязано к ПРОЙДЕННОМУ, копия не наследует: статистика, счётчик
   повышений, метка каталога, метка чужой ссылки. Копия — новая программа,
   а не продолжение старой. */
async function duplicateProgram(p){
  const copy = JSON.parse(JSON.stringify(p));
  copy.id = 'p' + Date.now();
  copy.name = (p.name || t('program.fallback')) + ' — ' + t('program.copySuffix');
  copy.stats = {completions: 0};
  delete copy.progStepsAdj; delete copy.progLast;
  // прогресс каждого упражнения (ex.ps) — тоже часть «пройденного», копия начинает с базы
  normPlans(copy).forEach(pl => (pl.exercises || []).forEach(ex => { delete ex.ps; }));
  delete copy.storeId;      // не «из каталога»: это уже своя программа
  delete copy.pub;          // заявка в каталог принадлежит оригиналу
  delete copy.src;          // и отчёты чужому тренеру от копии уходить не должны
  delete copy.by; delete copy.byLink; delete copy.origEx;
  customPrograms.push(copy);
  await savePrograms();
  renderMine();
  return copy;
}

/* ================= ЭКСПОРТ / ИМПОРТ ПРОГРАММ ================= */
/* ПРОГРАММУ В АДРЕС НЕ КЛАДЁМ. Раньше ссылка выглядела как ?import=FIT1.<вся
   программа в base64>, и на длинной программе это молча ломалось: Vercel отбивает
   такой запрос на границе (URI_TOO_LONG, предел около 14 КБ) — до приложения он
   вообще не доходит, и получатель видит ошибку хостинга вместо программы.
   Три упражнения каталога дают 4 КБ, а у тренера их бывает десять, плюс разминка,
   описания и замены. То есть ломалось ровно на настоящих программах.

   Ссылка теперь одна и только через сервер: короткая, с любой программой, и по ней
   видно, открыл ли её человек. Когда сервера нет, ссылки НЕ БУДЕТ вовсе — вместо
   неё код или файл. Выдать адрес, который у получателя не откроется, хуже, чем
   честно сказать, что ссылка сейчас недоступна. */

/* КАРТИНКИ ЕДУТ ВМЕСТЕ С ПРОГРАММОЙ.

   Раньше и обложка, и фото упражнений выбрасывались: они не помещались в адрес,
   куда программа паковалась целиком. Адреса больше нет — программа идёт на сервер
   обычным JSON, и выбрасывать картинки стало не нужно, а вредно. Тренер их для
   того и ставил: по фото человек понимает движение быстрее, чем по описанию.

   Общий вес ограничен: хранилище не принимает сколь угодно большую запись, а
   двадцать фото по сто килобайт — это уже не программа, а фотоальбом. Что не
   влезло — отбрасывается с конца, и программа всё равно доезжает. */
const MEDIA_BUDGET = 700 * 1024;

// Карта «название упражнения → фото». Отдельно от текста программы, потому что в
// каталоге программа лежит ТЕКСТОМ, а текст картинку в себе не носит. Одна карта
// работает и для ссылки подопечному, и для каталога.
function programMedia(p){
  const out = {};
  let left = MEDIA_BUDGET;
  normPlans(p).forEach(pl => (pl.exercises || []).forEach(ex => {
    const d = ex.media && ex.media.kind === 'img' ? ex.media.data : null;
    const name = (ex.name || '').trim();
    if(!d || !name || out[name]) return;
    if(d.length > left) return;          // не влезло — молча пропускаем, программа важнее
    out[name] = d;
    left -= d.length;
  }));
  return out;
}
// Вернуть фото на места после разбора текста программы.
function applyMedia(p, media){
  if(!media) return p;
  normPlans(p).forEach(pl => (pl.exercises || []).forEach(ex => {
    // cleanPic, а не «есть значит есть»: карта фото приходит с сервера обычным
    // JSON, и строка в ней может быть любой — в том числе такой, что уедет в
    // атрибут <img src> и станет там не адресом.
    const d = cleanPic(media[(ex.name || '').trim()]);
    if(d) ex.media = {kind: 'img', data: d};
  }));
  return p;
}

// Что уезжает получателю: без чужой статистики, но С картинками.
function programPayload(p){
  const copy = JSON.parse(JSON.stringify(p));
  delete copy.stats;
  delete copy.active;     // «отключена» — про мой список, а не про саму программу
  delete copy.src;        // метка чужой ссылки получателю не нужна
  delete copy.origEx;     // снимок для сравнения — дело получателя, а не отправителя
  delete copy.pub;        // заявка в каталог принадлежит оригиналу
  // Обложка и фото остаются. Лишний вес срезает programMedia — здесь только то,
  // что не влезло в общий предел.
  const media = programMedia(p);
  copy.plans = normPlans(copy).map(pl => ({
    ...pl,
    exercises: pl.exercises.map(ex => {
      const keep = media[(ex.name || '').trim()];
      return {...ex, media: keep ? {kind: 'img', data: keep} : null};
    })
  }));
  delete copy.exercises; delete copy.rounds; delete copy.roundRest; delete copy.days;
  // Штамп тренера. По нему приложение подопечного поймёт, от кого программа, и покажет
  // кнопку отчёта. Поле by не новое: под этим же именем ник лежит у программ каталога.
  if(typeof trainerOn === 'function' && trainerOn()){
    copy.by = normHandle(trainer.handle);
    if((trainer.links || '').trim()) copy.byLink = trainer.links.trim();
  }
  return copy;
}

// Короткая ссылка через сервер. Бросает — значит ссылки нет, и это надо сказать.
// Ник тренера уходит и внутри программы, и отдельным полем — сервер показывает его
// на своей стороне, приложение на своей. Берём оба значения ИЗ ОДНОГО места: пока
// отдельное поле заполнялось само по себе, оно молча оставалось пустым.
/* Кто такой тренер — то, что увидит подопечный на его странице. Уезжает ВМЕСТЕ со
   ссылкой, а не отдельным действием: отдельное «сохранить профиль» человек забудет
   нажать, и подопечный увидит пустую страницу. Здесь же профиль всегда свежий. */
function trainerProfile(){
  // Имя тренера своё, но пустым уезжать не должно: у тех, кто включил режим до
  // появления поля, его просто нет, а страница без имени доверия не вызывает.
  const me = users.find(u => u.id === currentUser);
  // Те же пределы, что и на входе. Поля правятся не только через форму — их
  // переносит вход по почте, и тогда `maxlength` в разметке не при чём.
  return {
    name: clampLine(trainer.name, LIM.coachName) || clampLine(me && me.name, LIM.coachName),
    photo: cleanPic(trainer.photo) || '',   // сжато до 240px при загрузке
    about: clampText(trainer.about, LIM.coachAbout),
    years: clampNum(trainer.years, 0, 60, null),
    links: cleanLink(trainer.links) || ''
  };
}

/* Отправка профиля на сервер происходит только по явной кнопке «Сохранить». */
async function pushProfile(){
  if(!trainerAccountReady()){
    trainer.pageErr = t('trainer.needAccountPage');
    return false;
  }
  if(!trainerOn()) return false;
  try{
    // Правка и чтение страницы — один адрес, разные глаголы: страница одна.
    const r = await apiPost('/api/trainer/' + encodeURIComponent(normHandle(trainer.handle)), Object.assign({
      trainer: trainerProfile(),
      trainerKey: trainer.key || ''
    }, accountAuth()));
    if(r.trainerKey) trainer.key = r.trainerKey;
    trainer.pageErr = null;
    return true;
  }catch(e){
    trainer.pageErr = e && e.code === 'handle_taken'
      ? t('trainer.handleTaken')
      : t('trainer.saveFailed');
    return false;
  }
}

// Публичная страница — серверный источник данных тренера. Подтягиваем её при
// входе в раздел и при запуске даже без Premium: аккаунт тренера бесплатный, а
// его имя и описание не должны зависеть от синхронизации тренировок.
async function refreshTrainerProfile(){
  if(!trainerAccountReady() || !(trainer && trainer.handle)) return false;
  try{
    const remote = await apiFetch('/api/trainer/' + encodeURIComponent(normHandle(trainer.handle)));
    ['name', 'photo', 'about', 'links'].forEach(k => { trainer[k] = remote[k] || ''; });
    trainer.years = remote.years == null ? null : remote.years;
    trainer.pageErr = null;
    await saveTrainer({remote:true});
    if(show._last === 'scrAccount') renderTrainerCard();
    return true;
  }catch(e){
    return false;
  }
}

/* ---- ссылки, отправленные подопечным ---- */

/* Нужны ровно в одном месте — когда человек удаляет аккаунт: на сервере список
   «кто кому что отправил» нигде не собран, и собирать его ради одного удаления
   значило бы завести ещё одно место, где такое хранится. Знает его только этот
   телефон. */
function coachLinkIds(){
  const out = [];
  (clients || []).forEach(c => clProgs(c).forEach(pr => {
    if(pr.link && pr.link.id) out.push(pr.link.id);
  }));
  return out;
}

// Человеческие названия отказов сервера. Код вроде mail_failed сам по себе не
// говорит человеку ничего, а разбираться ему придётся самому.
const MAIL_ERRS = {
  no_mail:'mail.noMail', no_store:'mail.noStore', bad_email:'mail.badEmail',
  too_many_today:'mail.tooManyToday', rate_limited:'mail.rateLimited',
  code_expired:'mail.codeExpired', too_many_tries:'mail.tooManyTries',
  bad_code:'mail.badCode', handle_taken:'mail.handleTaken', offline:'mail.offline'
};
const mailErrText = e => (e && MAIL_ERRS[e.code] ? t(MAIL_ERRS[e.code]) : null)
  || (e && e.code === 'mail_failed'
      ? t('mail.failed',{detail:(e.detail || '').slice(0,120) || t('mail.serviceRefused')})
      : t('mail.generic'));

/* ---- удаление ----

   Два объёма, и разница между ними существенная. «Удалить данные о себе» очищает
   СТРАНИЦУ: имя, фото, «о себе», стаж, ссылку. Ник остаётся, ключ правки остаётся,
   программы в каталоге остаются — человек убрал о себе сведения, а не отозвал
   сделанное. Полное удаление аккаунта уносит ещё и сам аккаунт со ссылками
   подопечным, но каталог не трогает и там: программа, которую взяли себе сотни
   людей, — это не сведения о человеке, а сделанная им вещь. */
async function forgetMe(scope){
  const body = {scope, links: scope === 'all' ? coachLinkIds() : []};
  if(trainer && trainer.key && (trainer.handle || '').trim()){
    body.handle = normHandle(trainer.handle);
    body.trainerKey = trainer.key;
  }
  if(account && account.email) body.email = account.email;
  if(account && account.syncToken){
    body.syncToken = account.syncToken;
    body.deviceId = (identity && identity.deviceId) || '';
  }
  if(!body.handle && !body.email) return true;   // на сервере нас нет
  await apiPost('/api/auth', Object.assign({action: 'forget'}, body));
  return true;
}

async function wipeTrainerInfo(){
  const ok = await appDialog(
    t('trainer.removeInfoQuestion'),
    {confirm:true,okText:t('clients.removeAction'),cancelText:t('common.cancel')}
  );
  if(!ok) return;
  try{ await forgetMe('trainer'); }
  catch(e){
    appAlert(t('trainer.removeInfoFailed'));
    return;
  }
  ['name', 'photo', 'about', 'years', 'links'].forEach(k => { delete trainer[k]; });
  await saveTrainer();
  renderTrainerCard();
  appAlert(t('trainer.removeInfoDone'));
}

async function programLink(p, extra){
  const program = programPayload(p);
  const r = await apiPost('/api/share', Object.assign(
    {program, by: program.by || '', byLink: program.byLink || '',
     trainer: trainerProfile(), trainerKey: trainer.key || ''}, extra || {}));
  // Ник закрепляется за первым, кто им воспользовался: ключ приходит один раз и
  // дальше подтверждает, что профиль правит его хозяин.
  if(r.trainerKey && !trainer.key){ trainer.key = r.trainerKey; saveTrainer(); }
  return {url: PUBLIC_APP_URL + 'p/' + encodeURIComponent(r.id), id: r.id, key: r.key};
}

/* Почему ссылки не вышло — человеку, и без запасного пути.

   Раньше здесь в буфер уходил код программы. Он длины не боялся, но и смысла не
   имел: отправлять простыню в мессенджер человек всё равно не станет, а объяснять
   получателю, куда её вставлять, — тем более. Остался один запасной путь, который
   люди действительно понимают: файл. Он и так есть в меню, и он лучше — уходит
   целиком, вместе с картинками. */
function linkFailNote(e){
  if(e && e.code === 'no_store'){
    return t('share.noStore');
  }
  if(e && e.code === 'rate_limited'){
    return t('share.rate');
  }
  return t('share.offline');
}
const FILE_HINT = ()=> t('share.fileHint');

async function exportProgram(p){
  let link;
  try{ link = await programLink(p); }
  catch(e){ appAlert(linkFailNote(e) + FILE_HINT()); return; }

  const text = t('share.programText',{name:p.name});
  if(navigator.share){
    try{ await navigator.share({title: 'Fit Timer', text, url: link.url}); return; }
    catch(e){ if(e && e.name === 'AbortError') return; }
  }
  try{
    await navigator.clipboard.writeText(link.url);
    appAlert(t('share.linkCopied'));
  }catch(e){
    appAlert(t('common.copyManual'), {code: link.url});
  }
}

// Экспорт программы файлом — со всем содержимым: обложка и фото упражнений
async function exportProgramFile(p){
  const copy = JSON.parse(JSON.stringify(p));
  delete copy.stats;      // чужая статистика получателю не нужна
  delete copy.active;     // «отключена» — про мой список, а не про саму программу
  delete copy.rotIdx;     // позиция в очереди — личная
  delete copy.progLast;
  copy.plans = normPlans(copy);
  delete copy.exercises; delete copy.rounds; delete copy.roundRest;
  const payload = {app: 'fittimer', type: 'program', v: 1, program: copy};
  const json = JSON.stringify(payload);
  const safeName = (p.name || 'program').replace(/[^\wа-яёА-ЯЁ\- ]+/g, '').trim().slice(0, 40) || 'program';
  const fname = `fittimer-${safeName}.json`;
  const blob = new Blob([json], {type: 'application/json'});

  const sizeKb = Math.round(json.length / 1024);
  if(window.FitNative && window.FitNative.isNative){
    await shareGeneratedFile(blob, fname, t('share.fileTitle',{name:p.name}));
    return;
  }
  const file = new File([blob], fname, {type: 'application/json'});
  if(navigator.canShare && navigator.canShare({files: [file]})){
    try{
      await navigator.share({files: [file], title:t('share.fileTitle',{name:p.name})});
      return;
    }catch(e){ if(e && e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  a.click();
  setTimeout(()=> URL.revokeObjectURL(a.href), 5000);
  appAlert(t('share.fileSaved',{size:sizeKb}));
}

// Импорт программы из файла
async function importProgramFile(file){
  try{
    const text = await file.text();
    const data = JSON.parse(text);
    // поддерживаем и файл программы, и голый объект программы
    const prog = (data && data.type === 'program' && data.program) ? data.program : data;
    if(!prog || !prog.name || !Array.isArray(prog.plans)){
      appAlert(t('share.badFile'));
      return;
    }
    prog.id = 'p' + Date.now();
    prog.stats = {completions: 0};
    delete prog.rotIdx; delete prog.progLast;
    prog.plans = normPlans(prog);
    sanitizeProgram(prog);      // файл мог написать кто угодно и чем угодно
    customPrograms.push(prog);
    await savePrograms();
    renderMine();
    appAlert(t('share.programAdded',{name:prog.name}));
  }catch(e){
    appAlert(t('share.readFileFailed',{error:e && e.message ? e.message : t('common.unknownError')}));
  }
}

/* ---- возраст и пол: нужны для подбора тренировок ---- */
function userAge(u){
  return profileAge(u);
}
// Возраст обязателен только там, где его спрашивают ради дела (попап «пара
// уточнений»). В профиле пустое поле — законное состояние: на старте его больше не
// спрашивают, и человек не должен упираться в ошибку, зайдя поменять имя.
function ageError(v, required = false){
  if(v === '' || v == null) return required ? t('age.required') : '';
  const a = Number(v);
  if(!Number.isInteger(a)) return t('age.integer');
  if(a < 5) return t('age.tooYoung');
  if(a > 100) return t('age.tooOld');
  return '';
}
// строка о человеке для запроса к ИИ
function userForAI(locale){
  const u = curUser();
  if(!u) return '';
  const bits = [];
  bits.push(u.gender === 'm' ? 'Sex: male' : 'Sex: female');
  const a = userAge(u);
  if(a) bits.push(`Age: ${a}`);
  const outLang=locale==='ru'?'Russian':locale==='en'?'English':aiOutputLanguage();
  bits.push(`User-visible output language: ${outLang}`);
  return bits.join('. ') + '. Use age and stated context when choosing exercise selection and recovery, but never infer absolute strength or starting weight from sex alone.';
}

/* ================= GEMINI API ================= */
// Несколько моделей на выбор: Google периодически выключает старые, и жёстко зашитое имя
// однажды начинает отдавать 404 (так случилось с псевдонимом gemini-flash-latest).
// Перебираем список, рабочую модель запоминаем, чтобы не тратить попытки каждый раз.
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-3.7-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];

function geminiKey(){
  const u = curUser();
  return (u && u.geminiKey ? String(u.geminiKey).trim() : '');
}
function hasGemini(){ return !!geminiKey(); }

function geminiModelOrder(){
  let saved = '';
  try{ saved = localStorage.getItem('geminiModel') || ''; }catch(e){}
  // ранее сработавшую модель пробуем первой, остальные оставляем запасными
  return saved ? [saved, ...GEMINI_MODELS.filter(m => m !== saved)] : GEMINI_MODELS.slice();
}

// «Failed to fetch» — запрос не дошёл до сервера: сеть, блокировка или отсутствие CORS.
// Отличаем это от ответов API, чтобы не показывать бессмысленное «HTTP undefined».
function isNetworkFail(e){
  return e && (e.name === 'TypeError' || /failed to fetch|network|load failed/i.test(e.message || ''));
}
function networkFailMessage(){
  const isFile = location.protocol === 'file:';
  let m = 'Запрос не дошёл до Google — это сетевая ошибка, а не отказ ключа.\n\nВероятные причины:\n';
  if(isFile) m += '• Приложение открыто как файл с диска (file://). Из такого режима браузер запрещает запросы к сторонним серверам — открой приложение по адресу http/https.\n';
  m += '• Нет интернета или он пропал в момент запроса.\n' +
       '• Домен generativelanguage.googleapis.com недоступен у твоего провайдера или в регионе — в этом случае поможет VPN.\n' +
       '• Запрос режет расширение браузера (блокировщик рекламы, антитрекер) — попробуй отключить их для этой страницы.\n\n' +
       'Ключ при этом может быть полностью рабочим: в AI Studio запросы идут с серверов Google, а здесь — прямо с твоего устройства.';
  return m;
}

// одна попытка на конкретной модели; возвращает {ok, text, status, msg}
// Браузер шлёт предварительный запрос OPTIONS, если у POST нестандартный заголовок
// (X-goog-api-key) или Content-Type: application/json. В некоторых сетях этот
// предварительный запрос режется — тогда сам POST даже не отправляется («Failed to fetch»),
// хотя обычный GET к тому же домену проходит.
// Поэтому сначала пробуем «простой» запрос: ключ в адресе, Content-Type: text/plain —
// такой POST отправляется сразу, без OPTIONS. Если не выйдет — пробуем обычный способ.
async function geminiFetch(url, body, signal, simple){
  if(simple){
    return fetch(url + '?key=' + encodeURIComponent(geminiKey()), {
      method: 'POST',
      headers: {'Content-Type': 'text/plain;charset=UTF-8'}, // из безопасного списка — OPTIONS не нужен
      body: JSON.stringify(body),
      signal
    });
  }
  return fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'X-goog-api-key': geminiKey()},
    body: JSON.stringify(body),
    signal
  });
}

async function geminiTry(model, body, signal){
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  let res = null, lastErr = null;
  for(const simple of [true, false]){
    try{
      res = await geminiFetch(url, body, signal, simple);
      break;
    }catch(e){
      if(e && e.name === 'AbortError') throw e;   // отмена пользователем — пробрасываем как есть
      if(!isNetworkFail(e)) throw e;
      lastErr = e;                                 // сеть не пустила — пробуем другой способ
    }
  }
  if(!res) return {ok: false, status: 0, msg: networkFailMessage(), network: true};
  if(res.ok) return {ok: true, data: await res.json()};
  let msg = 'HTTP ' + res.status;
  try{
    const j = await res.json();
    if(j && j.error && j.error.message) msg = j.error.message;
  }catch(e){}
  return {ok: false, status: res.status, msg, model};
}

async function callGemini(prompt, signal){
  const key = geminiKey();
  if(!key) throw new Error(t('ai.keyMissing'));
  // ответ бывает большим (программа целиком с описаниями),
  // поэтому лимит вывода задаём явно — иначе модель обрежет на полуслове
  const body = {
    contents: [{parts: [{text: prompt}]}],
    generationConfig: {maxOutputTokens: 32768, temperature: .3}
  };
  let last = null;
  // 503 «high demand» — временная перегрузка, а не отказ: Google прямо советует повторить.
  // Один проход по моделям этого не лечит (все могут быть заняты одновременно),
  // поэтому делаем несколько кругов с нарастающей паузой.
  const ROUNDS = 3;
  for(let round = 0; round < ROUNDS; round++){
    if(round > 0){
      // ждём перед новым кругом: 4с, потом 10с — обычно перегрузка проходит за это время
      const waitMs = round === 1 ? 4000 : 10000;
      if(typeof aiRunNote === 'function') aiRunNote(t('ai.busyRetry',{seconds:Math.round(waitMs/1000),attempt:round+1,total:ROUNDS}));
      await new Promise(res => setTimeout(res, waitMs));
      if(signal && signal.aborted) throw Object.assign(new Error('aborted'), {name: 'AbortError'});
    }
  for(const model of geminiModelOrder()){
    const r = await geminiTry(model, body, signal);
    if(r.ok){
      try{ localStorage.setItem('geminiModel', model); }catch(e){}
      const cand = (r.data.candidates || [])[0] || {};
      const parts = (cand.content || {}).parts || [];
      const text = parts.map(p => p.text || '').join('').trim();
      if(!text){
        const why = cand.finishReason || (r.data.promptFeedback && r.data.promptFeedback.blockReason) || '';
        throw new Error(t('ai.emptyResponse',{reason:why?t('ai.reason',{reason:why}):''}));
      }
      if(cand.finishReason === 'MAX_TOKENS'){
        throw new Error(t('ai.tooLong'));
      }
      return text;
    }
    last = r;
    if(r.network) break; // сеть недоступна — другие модели не помогут
    // модели не существует, её убрали, или она сейчас перегружена — пробуем следующую из списка.
    // 503/«high demand»/«overloaded» — это отказ КОНКРЕТНОЙ модели, а не всего сервиса,
    // и именно это раньше обрывало попытки без перехода на запасной вариант.
    const tryNext = r.status === 404 || r.status === 503 ||
      /not found|not supported|is not available|overloaded|high demand|unavailable/i.test(r.msg);
    if(!tryNext) break;
  }
  // ошибка не связана с загруженностью — новые круги не помогут
  const busy = last && (last.status === 503 || /overloaded|high demand|unavailable/i.test(last.msg || ''));
  if(!busy) break;
  }
  let msg = last ? last.msg : 'Неизвестная ошибка';
  if(last && !last.network){
    // Дружелюбная формулировка первой строкой: «Ответ Google (модель X, код 429)»
    // отпугивал ещё до дочитывания. Технический хвост оставляем — без него
    // непонятно, что именно пошло не так, — но он идёт после человеческого текста.
    let hint = '';
    if(last.status === 429) hint = 'Нейросеть сейчас перегружена — слишком много запросов за день. Попробуй ещё раз через минуту, а если не выходит и потом — собери программу в чате с нейросетью (способ ниже на экране).';
    else if(last.status === 400 && /API key/i.test(msg)) hint = 'Похоже, ключ ИИ введён неверно — Google его отклонил. Проверь ключ в настройках, а если он на месте — включи Generative Language API в своём кабинете Google.';
    else if(last.status === 503) hint = 'Серверы Google сейчас перегружены. Обычно проходит за пару минут — попробуй ещё раз.';
    else if(last.status === 404) hint = 'Эта модель сейчас недоступна. Попробуй ещё раз — запрос пойдёт на другую.';
    else if(last.status === 413 || /too large|exceeds|token/i.test(msg)) hint = 'Запрос оказался слишком длинным. Попробуй доработать программу по частям или сократить описание.';
    msg = (hint ? hint + '\n\n' : '') +
          `Технические детали (можно не читать):\nмодель ${last.model || '—'}, код ${last.status}.\n${last.msg}`;
  }
  throw new Error(msg);
}

/* Встроенная генерация идёт через наш сервер. Ключи провайдеров не попадают в
   HTML/APK, а основной и резервный провайдер выбираются в админке. Эта функция
   объявлена после прежнего клиента намеренно: старые профили продолжают
   открываться, но пользовательский Gemini-ключ больше нигде не используется. */
function aiAuth(){
  return {email:(account && account.email) || '', token:(account && account.syncToken) || '',
          deviceId:(identity && identity.deviceId) || ''};
}
async function callServerAI(prompt, signal, kind){
  const auth = aiAuth();
  if(!auth.email || !auth.token || !auth.deviceId)
    throw new Error(t('ai.signInPremium'));
  const extra = kind === 'video.parse' ? {
    videoUrl:(parseYouTubeUrl($('ytUrl').value) || {}).url || ($('ytUrl').value || '').trim(),
    locale:appLocale,
    wish:clampText($('ytWish').value,LIM.wish),
    userContext:userForAI()
  } : {};
  const res = await fetch(API_BASE + '/api/ai', {method:'POST',headers:{'Content-Type':'application/json'},signal,
    body:JSON.stringify(Object.assign({prompt,kind}, extra, auth))});
  const j = await res.json().catch(()=> ({}));
  if(!res.ok){
    if(j.error === 'ai_limit') throw new Error(t('ai.limitReached',{used:j.used,limit:j.limit}));
    if(j.error === 'premium_required') throw new Error(t('ai.premiumRequired'));
    if(j.error === 'ai_disabled') throw new Error(t('ai.disabled'));
    if(j.error === 'video_not_workout') throw new Error(t('video.notWorkout'));
    if(j.error === 'video_no_transcript') throw new Error(t('video.noTranscript'));
    if(j.error === 'video_insufficient') throw new Error(t('video.insufficient'));
    if(j.error === 'video_unavailable') throw new Error(t('video.unavailable'));
    if(j.error === 'video_analysis_timeout') throw new Error(t('video.analysisTimeout'));
    if(j.error === 'video_bad_url') throw new Error(t('video.badUrl'));
    if(j.error === 'ai_timeout') throw new Error(t('ai.timeout'));
    if(j.error === 'ai_bad_response'){
      const miss = Array.isArray(j.missing) ? j.missing.filter(Boolean).slice(0,6).join(', ') : '';
      throw new Error(t('ai.badResponse') + (miss ? ' ' + t('ai.badResponseMissing',{fields:miss}) : ''));
    }
    throw new Error(j.detail || t('ai.serviceFailed'));
  }
  trackProductEvent('ai_used').catch(()=>{});
  return j;
}

// Более позднее присваивание заменяет прежний прямой вызов Gemini во всех
// обработчиках, включая те, которые были объявлены выше по файлу.
callGemini = async function(prompt, signal, kind){
  return (await callServerAI(prompt, signal, kind || 'program.create')).text;
};

// Единая дверь ко всему платному. Отказов вида «недоступно» в приложении нет:
// нажатие либо работает, либо показывает, что даёт подписка и сколько стоит.
function premiumGate(){
  if(isPremium()) return true;
  openPremium();
  return false;
}

// Кнопка «за меня» входит в подписку. Без подписки она не исчезает и ничего не
// запрещает: на ней стоит метка «Премиум», а нажатие открывает витрину подписки.
function syncGeminiBtns(){
  const on = isPremium();
  document.querySelectorAll('.ai-self').forEach(b => {
    const txt = b.querySelector('.ha-txt');
    if(!txt) return;
    let mark = txt.querySelector('.ha-pro');
    if(!mark){
      mark = document.createElement('span');
      mark.className = 'ha-pro';
      mark.innerHTML = icon('crown') + t('premium.title').replace(/^Fit Timer\s+/,'');
      txt.appendChild(mark);
    }
    setShown(mark, !on);
  });
}

// временная подпись на кнопке («Проверяю…», «Обработка…»): меняем только текст,
// иконка и пояснение в строке остаются на месте
function btnBusy(btn, text){
  const el = btn.querySelector('b') || btn;
  const was = el.textContent;
  el.textContent = text;
  btn.disabled = true;
  return ()=>{ el.textContent = was; btn.disabled = false; };
}

// короткое «✓ Скопировано» на кнопке: подпись живёт в <b>, поэтому меняем именно её,
// а не всю кнопку целиком — иначе из строки пропадали иконка и пояснение
function flashDone(btn, text){
  if(!btn) return;
  const el = btn.querySelector('b') || btn;
  if(el.dataset.flash) return;
  el.dataset.flash = el.textContent;
  el.textContent = text || t('common.copied');
  setTimeout(()=>{ el.textContent = el.dataset.flash; delete el.dataset.flash; }, 1600);
}


/* ================= ОДИН ЭКРАН ЗАПРОСА К ИИ =================
   Источников пять, а экран один. Всё, чем источники отличаются, собрано здесь в
   таблицу: заголовок, вкладки, панель первого шага, подписи, чем собрать промт,
   чем применить ответ и куда вернуть «назад». Добавить шестой источник — одна
   строка в этой таблице, а не ещё один экран.

   Формат обмена с нейросетью таблица НЕ трогает: prompt и apply — те же самые
   функции, что были на прежних экранах, просто названы по имени. */
const AI_UI_KEYS = {
  'Новая программа':'programs.newProgram','Вручную':'common.manual','Через ИИ':'common.viaAI','Из видео':'common.fromVideo',
  'Упражнение':'builder.exercise','Редактирование':'ai.editTitle',
  'Пара вопросов — и готова программа: упражнения, повторения, круги и дни. Всё можно поправить.':'ai.createLead',
  'Шаг 1 · О тебе и тренировке':'ai.stepAbout','Шаг 2 · Как собрать':'ai.stepBuild','Собрать за меня':'ai.buildForMe',
  'Собираю программу':'ai.preparingProgram',
  'Приложение подготовит задание для нейросети. Передай его в чат, ответ вставь сюда. Дольше, зато бесплатно.':'ai.chatTaskNote',
  'Вставь ответ нейросети целиком — программа откроется в конструкторе.':'ai.answerProgramHint','Собрать программу из ответа':'ai.buildFromAnswer',
  'Ссылка на тренировку с YouTube — нейросеть разложит ролик на упражнения с таймингом.':'ai.videoLead',
  'Шаг 1 · Ссылка на видео':'ai.stepVideo','Шаг 2 · Как разобрать':'ai.stepParse','Разобрать за меня':'ai.parseForMe','Разбираю видео':'ai.parsingVideo',
  'Видео умеет смотреть не каждый чат — нужен тот, у кого есть доступ в интернет.':'ai.videoChatNote',
  'Шаг 1 · Что поправить':'ai.stepWhatFix','Шаг 2 · Как внести правки':'ai.stepHowApply','Изменить за меня':'ai.changeForMe','Вношу изменения':'ai.applyingChanges',
  'Старая программа останется, рядом появится изменённая копия. Картинки перенесутся сами.':'ai.editCopyNote',
  'Приложение подготовит задание с твоей программой. Передай его в чат, ответ вставь сюда.':'ai.chatProgramNote',
  'Вставь ответ нейросети целиком — получится изменённая копия. Старая программа останется.':'ai.answerEditedHint','Создать изменённую программу':'ai.createEdited',
  'Опиши упражнение словами — нейросеть добавит технику, мышцы и частые ошибки.':'ai.exerciseLead',
  'Шаг 1 · Какое упражнение нужно':'ai.stepExerciseNeed','Шаг 2 · Как подобрать упражнение':'ai.stepPickExercise','Подбираю упражнение':'ai.pickingExercise',
  'Приложение подготовит задание. Передай его в чат, ответ вставь сюда.':'ai.chatExerciseNote',
  'Вставь ответ нейросети целиком — упражнение добавится в конец программы.':'ai.answerExerciseHint','Добавить в программу':'ai.addToProgram',
  'Шаг 1 · Что поменять':'ai.stepWhatChange','Шаг 2 · Как применить':'ai.stepApply','Меняю упражнение':'ai.changingExercise',
  'Картинка упражнения останется на месте.':'ai.keepImageNote','Вставь ответ нейросети целиком — приложение возьмёт из него всё, что нашлось.':'ai.answerApplyHint',
  'Применить изменения':'ai.applyChanges'
};
function aiUiText(value){
  const raw=String(value == null ? '' : value);
  const key=AI_UI_KEYS[raw];
  return key ? t(key) : raw;
}
let aiSrc = null;                 // ключ текущего источника
const AI_SOURCES = {
  text: {
    kind: 'program.create',
    title: 'Новая программа',
    tabs: [['manual','Вручную'], ['text','Через ИИ'], ['video','Из видео']],
    lead: ['sparkle', 'Пара вопросов — и готова программа: упражнения, повторения, круги и дни. Всё можно поправить.'],
    pane: 'aiPaneText',
    step1: 'Шаг 1 · О тебе и тренировке',
    step2: 'Шаг 2 · Как собрать',
    self: 'Собрать за меня',
    selfTitle: 'Собираю программу',
    guard: ()=> aiCreateProgramGuard(),
    chatNote: ['chat', 'Приложение подготовит задание для нейросети. Передай его в чат, ответ вставь сюда. Дольше, зато бесплатно.'],
    answerHint: 'Вставь ответ нейросети целиком — программа откроется в конструкторе.',
    action: 'Собрать программу из ответа',
    prompt: ()=> fullAIPrompt(),
    copy:   ()=> copyPrompt(),
    apply:  ()=> importFromText(),
    dirty: ['qNote', 'qContext', 'aiResult'],
    manual: ()=> openBuilder(),
    back:  ()=> goTab('scrPrograms')
  },
  video: {
    kind: 'video.parse',
    title: 'Новая программа',
    tabs: [['manual','Вручную'], ['text','Через ИИ'], ['video','Из видео']],
    lead: ['video', 'Ссылка на тренировку с YouTube — нейросеть разложит ролик на упражнения с таймингом.'],
    pane: 'aiPaneVideo',
    step1: 'Шаг 1 · Ссылка на видео',
    step2: 'Шаг 2 · Как разобрать',
    self: 'Разобрать за меня',
    selfTitle: 'Разбираю видео',
    guard: ()=> ytGuard(),
    chatNote: ['alert', 'Видео умеет смотреть не каждый чат — нужен тот, у кого есть доступ в интернет.'],
    answerHint: 'Вставь ответ нейросети целиком — программа откроется в конструкторе.',
    action: 'Собрать программу из ответа',
    prompt: ()=> youtubePrompt(),
    copy:   ()=> ytCopyPrompt(),
    apply:  ()=> ytApplyResult(),
    dirty: ['ytUrl', 'ytWish', 'aiResult'],
    manual: ()=> openBuilder(),
    back:  ()=> goTab('scrPrograms')
  },
  edit: {
    kind: 'program.modify',
    title: 'Редактирование',
    tabs: [['manual','Вручную'], ['ai','Через ИИ']],
    subject: true,
    pane: 'aiPaneEdit',
    step1: 'Шаг 1 · Что поправить',
    step2: 'Шаг 2 · Как внести правки',
    self: 'Изменить за меня',
    selfTitle: 'Вношу изменения',
    guard: ()=> aiEditRequestGuard('eaWish'),
    selfNote: ['check', 'Старая программа останется, рядом появится изменённая копия. Картинки перенесутся сами.'],
    chatNote: ['chat', 'Приложение подготовит задание с твоей программой. Передай его в чат, ответ вставь сюда.'],
    copyFull: true,
    answerHint: 'Вставь ответ нейросети целиком — получится изменённая копия. Старая программа останется.',
    action: 'Создать изменённую программу',
    prompt: ()=> editAIPrompt(),
    copy:   ()=> copyEditPrompt(),
    apply:  ()=> createEditedProgram(),
    dirty: ['eaWish', 'aiResult'],
    manual: ()=> editAIProg ? openBuilder(editAIProg.id) : goTab('scrPrograms'),
    back:  ()=> goTab('scrPrograms')
  },
  exNew: {
    kind: 'exercise.create',
    title: 'Упражнение',
    tabs: [['manual','Вручную'], ['ai','Через ИИ']],
    lead: ['sparkle', 'Опиши упражнение словами — нейросеть добавит технику, мышцы и частые ошибки.'],
    pane: 'aiPaneExNew',
    step1: 'Шаг 1 · Какое упражнение нужно',
    step2: 'Шаг 2 · Как подобрать упражнение',
    self: ()=> exaSelfLabel(),
    selfTitle: 'Подбираю упражнение',
    guard: ()=> aiCreateExerciseGuard(),
    chatNote: ['chat', 'Приложение подготовит задание. Передай его в чат, ответ вставь сюда.'],
    answerHint: 'Вставь ответ нейросети целиком — упражнение добавится в конец программы.',
    action: 'Добавить в программу',
    prompt: ()=> exaPrompt(),
    copy:   ()=> exaCopyPrompt(),
    apply:  ()=> exaAddExercise(),
    dirty: ['exaWish', 'exaContext', 'aiResult'],
    manual: ()=> addExManual(),
    back:  ()=> goBackTo('scrBuilder')
  },
  exEdit: {
    kind: 'exercise.modify',
    title: 'Упражнение',
    tabs: [['manual','Вручную'], ['ai','Через ИИ']],
    subject: true,
    pane: 'aiPaneExEdit',
    step1: 'Шаг 1 · Что поменять',
    step2: 'Шаг 2 · Как применить',
    self: 'Изменить за меня',
    selfTitle: 'Меняю упражнение',
    guard: ()=> aiEditRequestGuard('exeWish'),
    selfNote: ['image', 'Картинка упражнения останется на месте.'],
    answerHint: 'Вставь ответ нейросети целиком — приложение возьмёт из него всё, что нашлось.',
    action: 'Применить изменения',
    prompt: ()=> exePrompt(),
    copy:   ()=> exeCopyPrompt(),
    apply:  ()=> applyExEdit(),
    dirty: ['exeWish', 'aiResult'],
    manual: ()=> {
      const keep = exeIdx;
      if(keep >= 0 && curPlan().exercises[keep]) openExercise(keep);
      else exitExAI();
    },
    back:  ()=> exitExAI()
  }
};

// Куда возвращаться с экрана ИИ по упражнению: на тренировку, если правка началась
// оттуда, иначе в конструктор. Раньше отсюда всегда уводило в конструктор — и
// тренировка, идущая прямо сейчас, оставалась брошенной.
function exitExAI(){
  if(exFromWork) backToWorkout(false);
  else goBackTo('scrBuilder');
}

// Любая AI-правка существующего объекта требует явного задания от пользователя.
// Сам факт наличия программы/упражнения — это контекст, а не запрос на изменение.
function aiEditRequestGuard(fieldId){
  const field = $(fieldId);
  const wish = clampText(field && field.value || '', LIM.wish).trim();
  if(wish) return true;
  appAlert(t('ai.needEditRequest'));
  if(field) field.focus();
  return false;
}

// собирает экран под источник и показывает его
function openAI(key){
  const c = AI_SOURCES[key];
  if(!c) return;
  aiSrc = key;
  $('aiTitle').textContent = aiUiText(c.title);
  $('aiStep1Title').textContent = aiUiText(c.step1);
  $('aiStep2Title').textContent = aiUiText(c.step2);
  $('aiSelfLabel').textContent = typeof c.self === 'function' ? c.self() : aiUiText(c.self);
  $('aiApply').textContent = aiUiText(c.action);
  $('aiAnswerHint').textContent = aiUiText(c.answerHint);
  $('aiResult').value = '';

  // вкладки режима: у программы их три, у упражнения две
  const tabs = $('aiTabs');
  tabs.innerHTML = '';
  c.tabs.forEach(([m, label]) => {
    const b = document.createElement('button');
    b.className = 'tab' + (m === key || (m === 'ai' && key !== 'manual' && c.tabs.length === 2) ? ' act' : '');
    b.dataset.m = m;
    b.textContent = aiUiText(label);
    tabs.appendChild(b);
  });
  markAITab();

  // заметки: показываем только те, что заданы у источника
  const note = (box, ico, txt, val) => {
    setShown(box, !!val);
    if(!val) return;
    $(ico).innerHTML = icon(val[0]);
    $(txt).textContent = aiUiText(val[1]);
  };
  note('aiLead', 'aiLeadIco', 'aiLeadTxt', c.lead);
  note('aiSelfNote', 'aiSelfNoteIco', 'aiSelfNoteTxt', c.selfNote);
  note('aiChatNote', 'aiChatNoteIco', 'aiChatNoteTxt', c.chatNote);

  // меню действий есть только там, где есть с чем действовать: у правки
  // существующего упражнения
  setShown('aiMenuWrap', key === 'exEdit');
  if(key === 'exEdit') buildAiMenu();
  setShown('aiSubject', !!c.subject);
  setShown('aiCopyFull', !!c.copyFull);

  // первый шаг у каждого источника свой
  document.querySelectorAll('#scrAI .ai-pane').forEach(el => setShown(el, el.id === c.pane));

  syncGeminiBtns();
  aiWaysReset.scrAI && aiWaysReset.scrAI();
  show('scrAI');
  window.scrollTo(0, 0);
}

// подсветка активной вкладки: «через ИИ» — это и text, и ai
function markAITab(){
  const cur = (aiSrc === 'video') ? 'video' : (aiSrc === 'text' ? 'text' : 'ai');
  document.querySelectorAll('#aiTabs .tab').forEach(x => x.classList.toggle('act', x.dataset.m === cur));
}

/* ---- экраны запроса к ИИ: главный путь и ручной ----
   Раньше ручной путь прятался под раскрывашкой (её надо было догадаться нажать), а поле
   «Ответ из чата» висело на экране всегда — даже у тех, кто ничего никуда не копировал,
   и читалось как обязательный третий шаг. Теперь ручной путь виден сразу, а поле для
   ответа появляется, только когда ему есть что принимать: после копирования задания —
   или сразу, если ответ в нём уже лежит. */
const aiWaysReset = {};
function setupAIAnswer(cfg){
  const answer = cfg.answer ? $(cfg.answer) : null;
  const actions = cfg.actions ? $(cfg.actions) : null;
  if(!answer && !actions){ aiWaysReset[cfg.screen] = ()=>{}; return; }
  // «уже копировал» помним по источнику, а не по экрану: экран запроса к ИИ теперь
  // один на пять источников, и общий флаг открывал поле ответа на упражнении только
  // потому, что человек когда-то копировал задание на программе.
  const copied = new Set();
  const apply = on => { setShown(answer, on); setShown(actions, on); };
  aiWaysReset[cfg.screen] = ()=>{
    const filled = cfg.result && $(cfg.result) && $(cfg.result).value.trim();
    apply(copied.has(aiSrc) || !!filled);
  };
  (cfg.copy || []).forEach(id => {
    const b = $(id);
    if(!b) return;
    // именно addEventListener: у кнопки уже есть свой onclick с копированием
    b.addEventListener('click', ()=>{
      copied.add(aiSrc);
      apply(true);
      setTimeout(()=> answer && answer.scrollIntoView({behavior: 'smooth', block: 'nearest'}), 150);
    });
  });
  apply(false);
}

/* ---- картинка упражнения ---- */
// Пиктограмм больше нет: рисованные нейросетью человечки на 44 пикселях списка
// не читались вовсе, а правила их рисования занимали пятую часть промта и столько же
// вывода модели. Осталось одно фото на упражнение.
function setExImg(ex, data){
  ex.media = data ? {kind: 'img', data} : null;
}
function dropExMedia(ex){
  ex.media = null;
}

/* ================= ГЕНЕРАЦИЯ КАРТИНОК ЧЕРЕЗ PREMIUM AI ================= */
// модель с выводом изображений — платная, в отличие от текстовой модели, которую приложение
// использует для остального ИИ. У неё нет бесплатной квоты, поэтому предупреждаем перед тратой денег.
const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image';

async function callGeminiImage(prompt, signal){
  const key = geminiKey();
  if(!key) throw new Error(t('ai.keyMissing'));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`;
  const body = {
    contents: [{parts: [{text: prompt}]}],
    generationConfig: {responseModalities: ['TEXT', 'IMAGE']}
  };
  // тот же обход предварительной проверки CORS, что и в текстовых запросах
  let res = null;
  for(const simple of [true, false]){
    try{ res = await geminiFetch(url, body, signal, simple); break; }
    catch(e){
      if(e && e.name === 'AbortError') throw e;
      if(!isNetworkFail(e)) throw e;
    }
  }
  if(!res) throw new Error(networkFailMessage());
  if(!res.ok){
    let msg = 'HTTP ' + res.status;
    try{
      const j = await res.json();
      if(j && j.error && j.error.message) msg = j.error.message;
    }catch(e){}
    if(res.status === 400 && /API key/i.test(msg)) msg = t('images.keyRejected');
    if(res.status === 429) msg = t('images.rateLimited');
    if(res.status === 403 || /billing|permission/i.test(msg)) msg = t('images.billingRequired');
    if(res.status === 503 || /overloaded|high demand|unavailable/i.test(msg)) msg = t('images.providerBusy');
    throw new Error(msg);
  }
  const data = await res.json();
  const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  const imgPart = parts.find(p => p.inlineData && p.inlineData.data);
  if(!imgPart){
    const textPart = parts.find(p => p.text);
    throw new Error(textPart ? t('images.textInstead',{text:textPart.text.slice(0,120)}) : t('images.noImage'));
  }
  return `data:${imgPart.inlineData.mimeType || 'image/png'};base64,${imgPart.inlineData.data}`;
}

callGeminiImage = async function(prompt, signal, kind){
  return (await callServerAI(prompt, signal, kind || 'image.exercise')).image;
};

// сжимает готовую картинку (data URL) так же, как сжимаются загруженные с телефона фото
function shrinkDataUrl(dataUrl, maxSide, cb){
  const img = new Image();
  img.onload = ()=>{
    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    try{ cb(c.toDataURL('image/jpeg', .85)); }catch(e){ cb(null); }
  };
  img.onerror = ()=> cb(null);
  img.src = dataUrl;
}

// промт под ОДНО конкретное изображение (в отличие от промта для копирования — там просят весь набор разом)
function imageEquipment(item){
  const s = `${item && item.name || ''} ${item && item.desc || ''}`.toLowerCase();
  const out = [];
  const add = (re, label) => { if(re.test(s) && !out.includes(label)) out.push(label); };
  add(/гантел|dumbbell/, 'dumbbells');
  add(/штанг|barbell/, 'barbell');
  add(/гир(я|и|ей|ю|ь)?|kettlebell/, 'kettlebell');
  add(/резин|эспанд|resistance band|\bband\b/, 'resistance band');
  add(/скам(ья|ьи|ью)|bench/, 'workout bench');
  add(/блок|кроссовер|трос|cable/, 'cable machine');
  add(/турник|перекладин|pull[- ]?up bar/, 'pull-up bar');
  add(/коврик|\bmat\b/, 'exercise mat');
  add(/фитбол|мяч|exercise ball|swiss ball/, 'exercise ball');
  add(/тумб|платформ|степ|plyo box|step platform/, 'box or step platform');
  return out;
}

function imageStaticExercise(item){
  const s = `${item && item.name || ''} ${item && item.desc || ''}`.toLowerCase();
  return /планк|удержан|статич|изометр|вис на|wall sit|dead hang|hollow hold|side plank|isometric|static hold/.test(s);
}

function imageProgramContext(){
  const parts = [
    draft && draft.goal, draft && draft.cat, draft && draft.category,
    draft && draft.name, draft && draft.desc
  ];
  uniqueProgramExercises().slice(0, 12).forEach(ex => {
    parts.push(ex.name);
    if(ex.muscles && ex.muscles.length) parts.push(ex.muscles.join(', '));
  });
  return parts.filter(Boolean).join(' · ');
}

function imageCoverTone(context){
  const s = String(context || '').toLowerCase();
  if(/кардио|вынослив|жиросж|похуд|hiit|cardio|endurance|fat loss/.test(s))
    return {tone:'deep blue to cyan', mood:'energetic, fast, fresh'};
  if(/сила|силов|мышечн|масса|гипертроф|strength|muscle|hypertrophy/.test(s))
    return {tone:'deep crimson and burgundy with subtle violet undertones', mood:'powerful, intense, athletic'};
  if(/растяж|гибк|мобил|восстанов|после род|stretch|flexibility|mobility|recovery|postpartum/.test(s))
    return {tone:'teal and emerald with soft lavender accents', mood:'calm, fluid, restorative'};
  if(/осанк|спин|кор|пресс|стабил|posture|back|core|stability/.test(s))
    return {tone:'indigo and warm amber with violet accents', mood:'focused, controlled, stable'};
  if(/ягод|glute/.test(s))
    return {tone:'berry magenta and deep violet', mood:'strong, sculpted, energetic'};
  return {tone:'Fit Timer violet and purple', mood:'balanced, premium, modern'};
}


function imageMuscleRegions(item){
  const exercise = `${item && item.name || ''} ${item && item.desc || ''}`.toLowerCase();
  const labels = (item && item.muscles || []).map(x => String(x || '').trim()).filter(Boolean);
  const out = [];
  const add = text => { if(text && !out.includes(text)) out.push(text); };
  labels.forEach(label => {
    const raw = label.toLowerCase();
    const en = String(aiCanonicalEnglish(label) || '').toLowerCase();
    const key = raw + ' ' + en;
    if(/ягод|glute/.test(key)) add('gluteus maximus on both sides');
    else if(/квадриц|quadriceps/.test(key)) add('quadriceps on both legs');
    else if(/задн.*бед|hamstring/.test(key)) add('hamstrings on both legs');
    else if(/икр|calves|calf/.test(key)) add('calf muscles on both legs');
    else if(/груд|chest/.test(key)) add('pectoralis major on both sides of the chest');
    else if(/плеч|shoulder/.test(key)) add('deltoid muscles on both shoulders');
    else if(/пресс|core|abs|abdom/.test(key)) add('rectus abdominis and obliques on both sides of the core');
    else if(/рук|arms/.test(key)){
      if(/бицепс|biceps? curl|hammer curl|сгибан.*рук/.test(exercise)){
        add('biceps brachii on both upper arms');
        add('brachialis on both upper arms');
        add('brachioradialis on both forearms');
      } else if(/трицепс|triceps? extension|разгибан.*рук/.test(exercise)){
        add('triceps brachii on both upper arms');
      } else add('upper-arm muscles on both arms');
    }
    else if(/шея|neck/.test(key)) add('neck stabilizer muscles on both sides');
    else if(/спин|back/.test(key)){
      if(/присед|squat|станов|deadlift|румын|romanian|наклон|good morning|hip hinge/.test(exercise))
        add('lower back / spinal erectors on both sides');
      else
        add('latissimus dorsi and mid-back muscles on both sides');
    } else add(aiCanonicalEnglish(label));
  });
  return out;
}

function imageCharacterStyle(genderTxt){
  return genderTxt === 'man'
    ? 'lifelike male athlete, natural skin tone, attractive masculine face, strong athletic physique'
    : 'lifelike female athlete, natural skin tone, beautiful feminine face, fit athletic physique';
}

function exerciseImagePrompt(item, genderTxt){
  const equipment = imageEquipment(item);
  const isStatic = imageStaticExercise(item);
  const regions = imageMuscleRegions(item);
  const muscles = regions.length ? regions.join(', ') : 'only the primary working muscles required by this movement';
  // Раньше немоторные (не изометрические, не изолированные суставом) движения
  // просили «два полупрозрачных наложенных фото одного атлета» — нейросеть
  // регулярно рисовала это как двух слипшихся людей друг в друге, а не как
  // внятное до/после. Один чёткий кадр самой показательной фазы + стрелки —
  // тот же приём, что уже нормально работал для локальных движений (сгибания
  // рук и т.п.), теперь единый для всех не-статичных упражнений.
  const motion = isStatic
    ? 'Show ONE clear final pose only. No ghost pose or movement trail.'
    : 'Show ONE full athlete only, in the single clearest and most demonstrative phase of the movement (usually peak contraction or full range of motion). Exactly one solid, fully opaque figure — no second body, no duplicated limbs, no ghost pose, no semi-transparent overlay, no motion blur, no double exposure. Show the direction of motion only with one or two small violet-lavender trajectory arrows beside the moving body part(s) or equipment.';
  return [
    `Create a 4:3 instructional fitness illustration for "${item.name}" in the Fit Timer app.`,
    `Style: premium stylized-realistic 3D, ${imageCharacterStyle(genderTxt)}, realistic dark sportswear, polished high-end rendering.`,
    'Background: premium modern gym with depth and good lighting, softly blurred and secondary; avoid flat gray studio backgrounds.',
    'Brand accents: Fit Timer violet (#7C56F5) and light lavender (#B7A0FF) only for arrows, subtle rim light and small environmental accents.',
    item.desc ? `Technique: ${item.desc}` : null,
    equipment.length
      ? `Equipment: ${equipment.join(', ')}. Show correct quantity, scale, grip/contact and position.`
      : 'Do not invent equipment that the exercise does not require.',
    motion,
    `Highlight ONLY these muscle regions with a clearly visible localized warm red to red-orange glow: ${muscles}.`,
    'Do not highlight unrelated muscles. Keep muscle glow anatomically consistent, symmetrical and equally strong between male and female versions.',
    'Choose the clearest side or three-quarter camera angle. Keep important joints, limbs and equipment visible.',
    'Prioritize correct biomechanics: realistic joint alignment, spine, stance, grip, range of motion and equipment placement.',
    'No extra limbs, merged hands, duplicated equipment, text, labels, logos, UI, collage, borders or watermarks.'
  ].filter(Boolean).join('\n');
}

function coverImagePrompt(name, genderTxt){
  const context = imageProgramContext();
  const palette = imageCoverTone(context);
  const exercises = uniqueProgramExercises().slice(0, 8).map(x => x.name).join(', ');
  return [
    `Create a square 1:1 premium catalog cover for the fitness program "${name}".`,
    'This is a PROGRAM COVER, not an exercise instruction. Create one bold, simple hero image that reads instantly at small thumbnail size.',
    'COMPOSITION: full-bleed edge-to-edge artwork. Absolutely no inset square, inner card, picture frame, border, outline, vignette frame or mockup-within-a-mockup. The artwork itself must fill the entire 1:1 canvas.',
    'Use one large hero athlete as the dominant subject, occupying roughly 65-80% of the frame. Prefer a close or medium-wide athletic composition over a distant full gym scene. Keep only one or two large supporting elements; avoid tiny weights, racks, plates and decorative detail that disappears in the catalog.',
    'VISUAL STYLE: premium cinematic stylized-realistic 3D, natural skin tone, realistic sportswear, polished directional lighting, subtle depth and a modern gym atmosphere. Avoid gray mannequin/anatomy-model styling.',
    `Character: ${genderTxt}. Make the pose energetic and aspirational, but not an exercise diagram.`,
    `Program context: ${context || name}.`,
    exercises ? `Representative exercises: ${exercises}.` : null,
    `Goal-specific atmosphere: ${palette.tone}. Mood: ${palette.mood}. Keep one restrained Fit Timer violet (#7C56F5) rim-light or environmental accent so every category still belongs to the same brand.`,
    'The goal color should come mainly from the background light and atmosphere, not from tinting the athlete skin.',
    'Use a softly blurred, simplified gym background with broad shapes and depth. The athlete must remain much more important than the environment.',
    'No instructional arrows, no ghost poses, no muscle heat-map, no text, letters, numbers, labels, logos, UI, collage, split-screen, frames, borders, corner icons, badges, decorative sparkles, stars or watermarks.'
  ].filter(Boolean).join('\n');
}

function imageProgramName(){
  const field = $('bName');
  if(field && field.value != null) return String(field.value).trim();
  return String(draft && draft.name || '').trim();
}

function unnamedImageExerciseCount(){
  let count = 0;
  ((draft && draft.plans) || []).forEach(pl => (pl.exercises || []).forEach(ex => {
    if(!String(ex && ex.name || '').trim()) count++;
  }));
  return count;
}

function imageGenerationGuard(kind, item){
  if(kind === 'cover'){
    if(imageProgramName()) return true;
    appAlert(t('images.needProgramName'));
    return false;
  }
  if(String(item && item.name || '').trim()) return true;
  appAlert(t('images.needExerciseName'));
  return false;
}

function imageWorkspaceGuard(){
  if(!imageProgramName()){
    appAlert(t('images.needProgramName'));
    return false;
  }
  const unnamed = unnamedImageExerciseCount();
  if(unnamed){
    appAlert(t('images.needAllExerciseNames',{count:unnamed}));
    return false;
  }
  return true;
}

// Промт под ОДНО конкретное изображение. До этой точки всегда проходит общий
// guard, поэтому скрытого fallback-названия нет: картинка строится только из
// реального названия программы/упражнения.
function singleImagePrompt(kind, item){
  const u = curUser();
  const genderTxt = u && u.gender === 'm' ? 'man' : 'woman';
  const name = imageProgramName();
  return kind === 'cover'
    ? coverImagePrompt(name, genderTxt)
    : exerciseImagePrompt(item || {}, genderTxt);
}

let imgGenCancelled = false;

async function generateAllImagesViaAI(scope){
  if(!premiumGate()) return;
  if(!imageWorkspaceGuard()) return;
  scope = scope === 'missing' ? 'missing' : 'all';

  const exList = uniqueProgramExercises().filter(ex => {
    if(scope !== 'missing') return true;
    const key = ex.name.toLowerCase();
    return !(draft.plans || []).some(pl => (pl.exercises || []).some(e2 =>
      (e2.name || '').trim().toLowerCase() === key &&
      e2.media && e2.media.kind === 'img' && e2.media.data
    ));
  });
  const makeCover = scope !== 'missing' || !draft.cover;
  const total = (makeCover ? 1 : 0) + exList.length;
  if(!total){ appAlert(t('images.nothingMissing')); return; }

  const imageWord = appLocale === 'ru'
    ? plural(total,t('images.imageOne'),t('images.imageFew'),t('images.imageMany'))
    : t(total === 1 ? 'images.imageOne' : 'images.imageMany');
  const ok = await appDialog(
    t('images.generateConfirm',{count:total,images:imageWord}),
    {confirm:true,okText:t('images.draw'),cancelText:t('common.cancel')}
  );
  if(!ok) return;

  imgGenCancelled = false;
  aiRunOpen(t('images.generating'), ()=>{ imgGenCancelled = true; });

  const failed = [];
  let done = 0;

  const runOne = async (kind, item, applyFn)=>{
    if(imgGenCancelled) return false;
    $('aiRunTitle').textContent = t('images.progress',{current:done+1,total});
    $('aiRunText').textContent = kind === 'cover' ? t('images.coverProgram') : item.name;
    try{
      const raw = await callGeminiImage(singleImagePrompt(kind, item), aiRunCtl ? aiRunCtl.signal : undefined,
        kind === 'cover' ? 'image.cover' : 'image.exercise');
      await new Promise(res => shrinkDataUrl(raw, 640, data => {
        if(data){
          applyFn(data);
          if(!imgTray.includes(data)) imgTray.push(data);
        } else failed.push(kind === 'cover' ? t('images.cover') : item.name);
        res();
      }));
      renderTray();
      renderSlots();
    }catch(e){
      if(imgGenCancelled) return false;
      failed.push((kind === 'cover' ? t('images.cover') : item.name) + ': ' + (e && e.message ? e.message : t('images.error')));
    }
    done++;
    return !imgGenCancelled;
  };

  if(makeCover){
    if(!(await runOne('cover', null, data => { draft.cover = data; }))){ aiRunClose(); await finishImgGen(done, total, failed); return; }
  }
  for(const ex of exList){
    const go = await runOne('ex', ex, data => {
      // применяем ко всем упражнениям с этим именем во всех вариантах — не платим за копию дважды
      (draft.plans || []).forEach(pl => (pl.exercises || []).forEach(e2 => {
        if((e2.name || '').trim().toLowerCase() === ex.name.toLowerCase()) setExImg(e2, data);
      }));
    });
    if(!go) break;
  }
  aiRunClose();
  await finishImgGen(done, total, failed);
}

// Что рисовать для упражнения: название, техника и мышцы.
function exImageItem(ex){
  return {
    name:(ex && ex.name || '').trim(),
    desc:(ex && ex.desc || '').trim(),
    muscles:((ex && ex.muscles) || []).map(id => M_LABEL[id]).filter(Boolean)
  };
}

// Одна картинка через ИИ — общая для экрана картинок, редактора упражнения и
// обложки в настройках программы: тот же прогресс, отмена и «Попробовать снова».
// apply(data) получает уже ужатую картинку.
async function generateOneImageViaAI(kind, item, title, apply){
  if(!premiumGate()) return false;
  if(!imageGenerationGuard(kind, item)) return false;
  imgGenCancelled = false;
  aiRunOpen(t('images.generating'), ()=>{ imgGenCancelled = true; });
  $('aiRunTitle').textContent = t('images.progress',{current:1,total:1});
  $('aiRunText').textContent = title;
  try{
    const raw = await callGeminiImage(singleImagePrompt(kind, item), aiRunCtl ? aiRunCtl.signal : undefined,
      kind === 'cover' ? 'image.cover' : 'image.exercise');
    let applied = false;
    await new Promise(res => shrinkDataUrl(raw, 640, data => {
      if(data){ apply(data); applied = true; }
      res();
    }));
    aiRunClose();
    if(!applied) appAlert(t('images.loadFailed'));
    return applied;
  }catch(e){
    aiRunClose();
    if(imgGenCancelled) return false;
    const retry = await appDialog(
      t('ai.runFailed',{error:(e && e.message ? e.message : t('common.unknownError'))}) + '\n\n' + t('ai.retryQuestion'),
      {confirm:true,okText:t('ai.retry'),cancelText:t('ai.notNow')}
    );
    if(retry) return generateOneImageViaAI(kind, item, title, apply);
    return false;   // всё, что уже было, остаётся на месте
  }
}

async function generateSlotImageViaAI(){
  const s = imageSlots()[slotTarget];
  if(!s) return;
  let kind = 'cover', item = null;
  if(s.kind === 'ex'){
    const pl = (draft.plans || [])[s.plan];
    const ex = pl && pl.exercises ? pl.exercises[s.idx] : null;
    if(!ex) return;
    kind = 'ex';
    item = exImageItem(ex);
  }
  $('slotModal').classList.remove('open');
  await generateOneImageViaAI(kind, item, s.title, data => {
    s.set(data);
    if(!imgTray.includes(data)) imgTray.push(data);
    renderTray(); renderSlots();
  });
}

async function finishImgGen(done, total, failed){
  renderSlots();
  if(imgGenCancelled){
    appAlert(t('images.stopped',{done,total}));
    return;
  }
  if(!failed.length){
    appAlert(t('images.done',{done,total}));
  } else {
    const retry = await appDialog(
      t('images.partial',{done:done-failed.length,total,failed:failed.join('\n• ')}) + '\n\n' + t('ai.retryQuestion'),
      {confirm:true,okText:t('ai.retry'),cancelText:t('ai.notNow')}
    );
    // Повторяем только пустые места: уже успешно созданные картинки не тратим заново.
    if(retry) return generateAllImagesViaAI('missing');
  }
}

/* ================= ПРОМТ ДЛЯ ГЕНЕРАЦИИ КАРТИНОК ================= */
// уникальные упражнения программы: без повторов между вариантами, с описанием и мышцами
function uniqueProgramExercises(){
  const seen = new Map(); // ключ — имя в нижнем регистре
  (draft.plans || []).forEach(pl => (pl.exercises || []).forEach(ex => {
    const name = (ex.name || '').trim();
    if(!name) return;
    const key = name.toLowerCase();
    if(seen.has(key)) return;
    seen.set(key, {
      name,
      desc: (ex.desc || '').trim(),
      muscles: (ex.muscles || []).map(id => M_LABEL[id]).filter(Boolean),
      format: ex.type || '',
      weight: +ex.weight || 0
    });
  }));
  return [...seen.values()];
}

function imagesPromptText(){
  const u = curUser();
  const genderTxt = u && u.gender === 'm' ? 'man' : 'woman';
  const name = (draft.name || '').trim() || 'Workout program';
  const exList = uniqueProgramExercises();
  const L = [
    'Generate a coherent image set for the Fit Timer fitness app.',
    'All exercise illustrations use 4:3. The program cover uses 1:1.',
    'Keep the same premium stylized-realistic 3D visual language, athlete, sportswear and rendering quality throughout the set.',
    '',
    'PROGRAM COVER:',
    coverImagePrompt(name, genderTxt)
  ];
  exList.forEach((ex, i) => {
    L.push('', `EXERCISE ${i + 1}:`, exerciseImagePrompt(ex, genderTxt));
  });
  L.push('', 'Return the cover first, then the exercise images in the exact order listed above.');
  return L.join('\n');
}

/* ================= КАРТИНКИ ПРОГРАММЫ: МАССОВАЯ ЗАГРУЗКА ================= */
let imgTray = [];        // загруженные, но ещё не разложенные картинки (data-url)
let slotTarget = null;   // {kind:'cover'} | {kind:'ex', plan, idx}

// последовательно сжимаем выбранные файлы
function shrinkAll(files, maxSide, done){
  const out = [];
  let i = 0;
  const next = ()=>{
    if(i >= files.length){ done(out); return; }
    shrinkImage(files[i++], maxSide, data => { if(data) out.push(data); next(); });
  };
  next();
}

// Экран картинок открывается и из настроек программы, и (для уже сохранённой
// программы) из её меню — поэтому «Готово» возвращает туда, откуда пришли, а не
// всегда в конструктор.
let imagesFrom = 'scrBuilder';
function openImages(){
  if(!imageWorkspaceGuard()) return false;
  imagesFrom = show._last || 'scrBuilder';
  // «Доступные» всегда начинается с картинок, которые уже используются в программе.
  // Поэтому после сохранения и повторного открытия назначенные изображения не исчезают.
  imgTray = [];
  imageSlots().forEach(s => {
    const data = s.get();
    if(data && !imgTray.includes(data)) imgTray.push(data);
  });
  renderTray();
  renderSlots();
  syncGeminiBtns();
  show('scrImages');
  window.scrollTo(0, 0);
}
function closeImages(){
  renderExList();
  syncSettingsSum();
  goBackTo(imagesFrom === 'scrImages' ? 'scrBuilder' : imagesFrom);
}

// Какие из загруженных картинок уже где-то стоят. Раньше «разложенность» считали
// тем, что картинка ИСЧЕЗАЛА из лотка при назначении, — и из-за этого: одну
// картинку нельзя было поставить двум упражнениям; замена картинки у одного и
// того же места съедала лоток по штуке за раз, а прежняя пропадала совсем; снятая
// с упражнения картинка в лоток не возвращалась. Теперь назначение КОПИРУЕТ, а
// лоток — просто то, что загружено.
function trayUsed(){
  const set = new Set();
  imageSlots().forEach(s0 => { const v = s0.get(); if(v) set.add(v); });
  return set;
}
function renderTray(){
  const box = $('tray');
  setShown('trayBox', imgTray.length);
  const used = trayUsed();
  const left = imgTray.filter(d => !used.has(d)).length;
  $('trayCount').textContent = imgTray.length ? `· ${imgTray.length}` : '';
  $('trayLeft').textContent = imgTray.length
    ? (left ? t('images.trayLeft',{count:left}) : t('images.trayAll'))
    : '';
  box.innerHTML = '';
  imgTray.forEach((data, i)=>{
    const el = document.createElement('div');
    const isUsed = used.has(data);
    el.className = 'tray-item' + (isUsed ? ' used' : '');
    el.innerHTML = `<img src="${esc(data)}" alt="">` +
      (isUsed ? '' : `<button type="button" class="ti-x">${icon('close')}</button>`);
    const x = el.querySelector('.ti-x');
    if(x) x.onclick = e => { e.stopPropagation(); imgTray.splice(i, 1); renderTray(); };
    el.onclick = ()=> appAlert(t('images.pickHint'));
    box.appendChild(el);
  });
}

// все места, куда можно подставить картинку
function imageSlots(){
  const slots = [{kind:'cover',group:t('images.cover'),title:t('images.coverProgram'),get:()=>draft.cover,set:v=>draft.cover=v}];
  const plans = draft.plans || [];
  plans.forEach((pl, pi)=>{
    (pl.exercises || []).forEach((ex, ei)=>{
      slots.push({
        kind: 'ex', plan: pi, idx: ei,
        group: plans.length > 1 ? `${t('builder.variant')} ${pi + 1}` : t('images.exerciseGroup'),
        title: (ex.name || '').trim() || t('store.untitled'),
        get: ()=> (ex.media && ex.media.kind === 'img') ? ex.media.data : null,
        set: v => { if(v) setExImg(ex, v); else dropExMedia(ex); }
      });
    });
  });
  return slots;
}

function renderSlots(){
  const box = $('slotList'); box.innerHTML = '';
  const slots = imageSlots();
  let lastGroup = null;
  slots.forEach((s, i)=>{
    if(s.group && s.group !== lastGroup){
      lastGroup = s.group;
      const g = document.createElement('div');
      g.className = 'slot-group';
      g.textContent = s.group;
      box.appendChild(g);
    }
    const cur = s.get();
    const row = document.createElement('div');
    row.className = 'slot-row';
    row.innerHTML =
      `<div class="sl-thumb">${cur ? `<img src="${esc(cur)}" alt="">` : DUMBBELL_ICON}</div>` +
      `<div class="sl-body"><b></b><small class="${cur ? 'has' : ''}">${cur ? 'картинка есть' : 'нет картинки'}</small></div>`;
    row.querySelector('b').textContent = s.title;
    row.onclick = ()=> openSlotPicker(i);
    box.appendChild(row);
  });
}

function openSlotPicker(i){
  const slots = imageSlots();
  slotTarget = i;
  const s = slots[i];
  $('slotTitle').textContent = s.title;
  const box = $('slotTray'); box.innerHTML = '';
  setShown('slotEmptyHint', !(imgTray.length));
  const cur = s.get();
  imgTray.forEach(data =>{
    const el = document.createElement('div');
    el.className = 'tray-item' + (data === cur ? ' act' : '');
    el.innerHTML = `<img src="${esc(data)}" alt="">`;
    el.onclick = ()=>{
      s.set(data);                       // копируем, лоток не трогаем
      $('slotModal').classList.remove('open');
      renderTray(); renderSlots();
    };
    box.appendChild(el);
  });
  // обложку тоже можно нарисовать — как и картинку упражнения
  setShown('slotRemove', s.get());
  $('slotModal').classList.add('open');
}

// раскладывает лоток по местам без картинок, по порядку
function trayAutoAssign(){
  if(!imgTray.length){ appAlert(t('images.pickFirst')); return; }
  const already = trayUsed();
  const free = imgTray.filter(d => !already.has(d));   // раскладываем ещё не пристроенные
  if(!free.length){ appAlert(t('images.allPlaced')); return; }
  let n = 0;
  for(const s of imageSlots()){
    if(n >= free.length) break;
    if(s.get()) continue;          // тут уже есть картинка — не трогаем
    s.set(free[n++]);
  }
  renderTray(); renderSlots();
  const rest = free.length - n;
  appAlert(n
    ? t('images.assigned',{count:n}) + (rest ? t('images.noRoom',{count:rest}) : '')
    : t('images.noSlots'));
}

/* ================= ПРАВКА УПРАЖНЕНИЯ ЧЕРЕЗ ИИ ================= */
let exeIdx = -1; // индекс правимого упражнения

// «ФОРМАТ: …» — четыре сочетания: повторения/время × без веса/с весом
// («время и вес» — удержание или перенос с утяжелением: фермерская прогулка,
// планка с блином, вис с утяжелителем).
function exFormatLine(ex){
  const axis = ex.type === 'time' ? 'время' : 'повторения';
  return 'ФОРМАТ: ' + (hasWeight(ex) ? axis + ' и вес' : axis);
}
// ОТДЫХ — между подходами (как раньше). Вторую строку, «после упражнения»,
// пишем только когда она реально отличается: у большинства упражнений отдых
// после — то же число, и не указанное явно поле само возьмёт его в качестве
// запасного варианта (exRestAfter) — не нужно засорять текст повтором.
function exRestLines(ex){
  const L = ['ОТДЫХ: ' + (ex.rest || 0)];
  const after = exRestAfter(ex);
  if(after !== (+ex.rest || 0)) L.push('ОТДЫХ ПОСЛЕ УПРАЖНЕНИЯ: ' + after);
  return L;
}
// строки УСЛОЖНЯТЬ/ВЕС/ШАГ/ПОТОЛОК/ЗАМЕНА — общие для сериализации упражнения
// что в тексте одного упражнения (правка через ИИ), что в тексте всей программы.
// Сериализуем только оси, которые реально что-то значат для этого формата: для
// «…и вес» — обе независимо (0 = эта ось намеренно не растёт), для простых — одна.
function exProgToLines(ex, opts){
  // при forEdit (opts.program задан) показываем текущий прогрессированный вес,
  // а не базу — см. exCurrentValueText/programToText выше
  const p = opts && opts.program;
  const weightNow = p ? getExWeight(p.id, ex, p) : (+ex.weight || 0);
  const L = ['УСЛОЖНЯТЬ: ' + (progAxis(ex) === 'none' ? 'нет' : 'да')];
  // ВЕС: 0 — не «пустое место», а значимое «снаряд ещё не выбран» (см.
  // weightPending() в 60-builder.js): раньше строку пропускали при нуле, и
  // формат «повторения и вес» без выбранного снаряда терял ВЕС из протокола
  // вовсе, а прогрессия молча копилась поверх несуществующей базы.
  if(hasWeight(ex)) L.push('ВЕС: ' + fmtKg(weightNow));
  if(progAxis(ex) !== 'none'){
    if(hasWeight(ex)){
      if(ex.type === 'time'){
        L.push('ШАГ ВРЕМЕНИ: ' + (ex.timeStep != null ? ex.timeStep : 5));
        L.push('ШАГ ВЕСА: ' + fmtKg(ex.wStep != null ? ex.wStep : 2));
        if(+ex.timeMax > 0) L.push('ПОТОЛОК ВРЕМЕНИ: ' + ex.timeMax);
        if(+ex.weightMax > 0) L.push('ПОТОЛОК ВЕСА: ' + fmtKg(ex.weightMax));
      } else {
        L.push('ШАГ ПОВТОРОВ: ' + (ex.repsStep != null ? ex.repsStep : 1));
        L.push('ШАГ ВЕСА: ' + fmtKg(ex.wStep != null ? ex.wStep : 2));
        if(+ex.repsMax > 0) L.push('ПОТОЛОК ПОВТОРОВ: ' + ex.repsMax);
        if(+ex.weightMax > 0) L.push('ПОТОЛОК ВЕСА: ' + fmtKg(ex.weightMax));
        if(ex.dualProg) L.push('ПРИ ПОТОЛКЕ: да');
      }
    } else if(ex.type === 'time'){
      L.push('ШАГ: ' + (ex.timeStep != null ? ex.timeStep : 5));
      if(+ex.timeMax > 0) L.push('ПОТОЛОК: ' + ex.timeMax);
    } else {
      L.push('ШАГ: ' + (ex.repsStep != null ? ex.repsStep : 1));
      if(+ex.repsMax > 0) L.push('ПОТОЛОК: ' + ex.repsMax);
    }
    if(ex.swapOn && (ex.swapName || '').trim()){
      L.push('ЗАМЕНА: ' + ex.swapName.trim());
      if((ex.swapDesc || '').trim()) L.push('ОПИСАНИЕ ЗАМЕНЫ: ' + ex.swapDesc.replace(/\s*\n+\s*/g, ' ').trim());
    }
  }
  return L;
}

// одно упражнение → текст в нашем формате
function exerciseToText(ex){
  const L = ['УПРАЖНЕНИЕ: ' + (ex.name || '')];
  if((ex.desc || '').trim()) L.push('ОПИСАНИЕ: ' + ex.desc.replace(/\s*\n+\s*/g, ' ').trim());
  const mus = (ex.muscles || []).map(id => M_LABEL[id]).filter(Boolean);
  if(mus.length) L.push('МЫШЦЫ: ' + mus.join(', '));
  if((ex.mistakes || '').trim()) L.push('ОШИБКИ: ' + ex.mistakes.replace(/\s*\n+\s*/g, ' ').trim());
  L.push(exFormatLine(ex));
  L.push('ЗНАЧЕНИЕ: ' + valueText(ex.value).replace('–', '-'));
  L.push('ПОДХОДЫ: ' + (parseInt(ex.sets) || 1));
  if(ex.perSide) L.push('СТОРОНА: да');
  if(ex.warmup) L.push('РАЗМИНКА: да');
  L.push(...exRestLines(ex));
  L.push(...exProgToLines(ex));
  if((ex.video || '').trim()) L.push('ВИДЕО: ' + ex.video.trim());
  return L.join('\n');
}

function openExEdAI(i){
  const ex = curPlan().exercises[i];
  if(!ex) return;
  exeIdx = i;
  $('aiSubjName').textContent = (ex.name || '').trim() || t('common.exerciseFallback');
  $('aiSubjSum').textContent = exSummary(ex);
  $('exeWish').value = '';
  autoGrow($('exeWish'));
  openAI('exEdit');
}

// формат ответа для ОДНОГО упражнения — общий для правки через ИИ и для замены прямо
// с тренировки, чтобы обе кнопки просили у нейросети ровно одно и то же
function aiClientVerdict(kind, raw, opts){
  const verdict = FitAIProtocol.validateResponse(kind, raw);
  if(!verdict.ok){
    const miss = (verdict.missing || []).slice(0,6).join(', ');
    appAlert(MSG_AI_PARSE() + (miss ? '\n\n' + t('ai.parseProblems') + '\n— ' + miss : ''));
    return null;
  }
  if(opts && opts.expectedCount != null && verdict.count != null && verdict.count !== opts.expectedCount){
    appAlert(MSG_AI_PARSE());
    return null;
  }
  return verdict.text;
}

function exAnswerFormat(locale){
  const lang=locale==='ru'?'Russian':locale==='en'?'English':aiOutputLanguage();
  return [
    FitAIProtocol.machineLanguageRules(lang),
    FitAIProtocol.exerciseSchema(lang),
    FitAIProtocol.progressionRules()
  ].join('\n\n');
}

function exePrompt(){
  const ex=curPlan().exercises[exeIdx];
  const wish=clampText($('exeWish').value,LIM.wish);
  return [
    'Edit exactly ONE home-workout exercise.',
    'Return exactly ONE complete exercise block and nothing else: no Markdown and no explanation.',
    FitAIProtocol.editRules(),
    'USER: '+userForAI(draft&&draft.locale),
    'REQUEST: '+wish,
    '=== CURRENT EXERCISE ===\n'+exerciseToText(ex),
    exAnswerFormat(draft&&draft.locale)
  ].join('\n\n');
}

async function applyExEdit(){
  const raw=($('aiResult').value||'').trim();
  if(!raw){appAlert(MSG_AI_EMPTY());return;}
  const list=curPlan().exercises;
  const oldEx=list[exeIdx];
  if(!oldEx){goBackTo('scrBuilder');return;}
  // ровно один блок — правка не имеет права тихо расплодиться в два упражнения
  const candidateBlocks=aiExerciseBlocks(raw);
  if(candidateBlocks.length!==1){appAlert(MSG_AI_NOEX());return;}
  // Ответ ИИ используется как есть; carryExerciseFields лишь подставляет описание/
  // мышцы/ошибки/видео из старого блока, если ИИ их не вернул — раньше здесь был
  // позиционный merge всех полей, который не давал ИИ ни убрать, ни переставить строку.
  const merged=FitAIProtocol.carryExerciseFields(exerciseToText(oldEx),candidateBlocks[0].lines.join('\n'));
  if(!aiClientVerdict('exercise.modify', merged, {expectedCount:1})) return;
  const wrapped='ПРОГРАММА: temp\nДЕНЬ:\nКРУГИ: 1\n\n'+merged;
  const {program}=parseProgramText(wrapped);
  const got=(program.plans&&program.plans[0]&&program.plans[0].exercises)||[];
  if(got.length!==1){appAlert(MSG_AI_NOEX());return;}
  const upd=got[0];
  if(!upd.media&&oldEx.media)upd.media=oldEx.media;
  // это правка, а не замена: то же самое упражнение сохраняет свой id, а
  // прогресс — если ИИ не менял его базовые числа (см. carryExerciseProgress)
  upd.id=oldEx.id;
  carryExerciseProgress(oldEx, upd);
  list[exeIdx]=upd;
  // запрос тоже очищаем: пока в нём был текст, экран считался несохранённым,
  // и возврат назад молча не срабатывал — человек оставался на «Через ИИ»
  $('aiResult').value='';
  $('exeWish').value='';
  if(exFromWork) await afterExChange();
  else{
    // показываем результат там, где его видно и можно сразу поправить руками
    renderExList();
    const keep=exeIdx;
    asTab(()=> openExercise(keep));
  }
  appAlert(t('ai.exerciseUpdated',{name:upd.name||t('common.exerciseFallback')}));
}

/* ================= УПРАЖНЕНИЕ ЧЕРЕЗ ИИ ================= */
// Наборы чипов ОДНИ И ТЕ ЖЕ у программы и у упражнения. Раньше они разошлись:
// в программе инвентарь начинался с «Нет» и содержал «Резинки», «Утяжелители» и
// «Турник», в упражнении — с «Без инвентаря», «Резинка» и без последних двух.
// Мышцы тоже: у программы был свой список с «Талией» и «Ногами целиком», у
// упражнения — строгий список MUSCLES, который понимает парсер.
const EXA_OPTS = {
  format: ['Повторения', 'С весом', 'Время'],
  level: OPT_LEVEL,
  equip: OPT_EQUIP
};
// сколько упражнений просить у нейросети — обычное число, а не диапазон чипом
const exa = {count: 1, format: '', level: '', muscles: [], equip: []};

// «Подобрать за меня» без объекта непонятно, что именно подберётся — называем
// прямо, и число упражнений в кнопке следует за выбором в «Сколько упражнений»
function exaSelfLabel(){
  const n = exa.count || 1;
  if(n === 1) return t('ai.pickOneExercise');
  return appLocale === 'ru'
    ? `Подобрать ${n} ${plural(n, 'упражнение', 'упражнения', 'упражнений')}`
    : t('ai.pickExercises', {count:n});
}

function exaChips(){
  const sel = $('exaCount');
  if(!sel.options.length){
    for(let i = 1; i <= 10; i++) sel.add(new Option(String(i), String(i)));
    sel.onchange = ()=>{
      exa.count = Math.max(1, Math.min(10, parseInt(sel.value) || 1));
      if(aiSrc === 'exNew') $('aiSelfLabel').textContent = exaSelfLabel();
    };
  }
  sel.value = String(exa.count || 1);
  qChips('exaFormat', EXA_OPTS.format, false, ()=> exa.format, v => exa.format = v);
  qChips('exaLevel', EXA_OPTS.level, false, ()=> exa.level, v => exa.level = v);
  qChips('exaEquip', EXA_OPTS.equip, true, ()=> exa.equip, v => exa.equip = v);
  qChips('exaMuscles', MUSCLES.map(m => m[1]), true, ()=> exa.muscles, v => exa.muscles = v);
}

function openExAI(){
  exa.count = 1; exa.format = ''; exa.level = ''; exa.muscles = []; exa.equip = [];
  $('exaWish').value = '';
  $('exaContext').value = '';
  exaChips();
  autoGrow($('exaWish'));
  autoGrow($('exaContext'));
  openAI('exNew');
}

function aiExerciseHasUserInput(){
  const wish = clampText((($('exaWish') && $('exaWish').value) || ''), LIM.wish).trim();
  const context = clampText((($('exaContext') && $('exaContext').value) || ''), 600).trim();
  return !!(
    exa.format || exa.level ||
    (exa.muscles && exa.muscles.length) ||
    (exa.equip && exa.equip.length) ||
    wish || context
  );
}

function aiCreateExerciseGuard(){
  if(aiExerciseHasUserInput()) return true;
  appAlert(t('ai.needExerciseInput'));
  return false;
}

function exaPrompt(){
  const wish=clampText($('exaWish').value,LIM.wish);
  const given=[],free=[];
  const fmtMap={'Повторения':'unweighted reps','С весом':'weighted reps','Время':'time'};
  if(exa.format)given.push(`Preferred format: ${fmtMap[exa.format]||aiCanonicalEnglish(exa.format)}.`);
  else free.push('choose the most natural format: reps, weighted reps, time, or weighted time');
  if(exa.level)given.push(`Difficulty: ${aiCanonicalEnglish(exa.level)}.`);
  else free.push('difficulty level');
  if(exa.muscles.length)given.push(`Target muscles: ${exa.muscles.map(aiCanonicalEnglish).join(', ')}.`);
  else free.push('working muscles');
  if(exa.equip.length)given.push(`Available equipment: ${exa.equip.map(aiCanonicalEnglish).join(', ')}.`);
  else free.push('equipment; assume no special home equipment unless the exercise needs it');

  const cnt=Math.max(1,Math.min(10,parseInt(exa.count)||1));
  const many=cnt>1;
  const task=many
    ? `Create exactly ${cnt} different home-workout exercises. Return exactly ${cnt} separate exercise blocks, each beginning with "УПРАЖНЕНИЕ:", separated by a blank line. Do not duplicate exercises. Return nothing else.`
    : 'Create exactly one home-workout exercise. Return exactly one exercise block and nothing else.';
  let req='USER: '+userForAI(draft&&draft.locale)+'\nREQUEST: '+(wish||'(No specific request. Suggest a useful exercise that fits the user.)');
  const context=clampText(($('exaContext')&&$('exaContext').value)||'',600).trim();
  if(context){
    req+='\nUSER CAPABILITIES / LIMITATIONS CONTEXT: '+context+
      '. Treat this as authoritative self-reported context for exercise selection, starting load, range of motion, impact and progression. Do not diagnose from it. If it describes an injury, pain, or other health limitation, avoid exercise choices that clearly conflict with it and do not claim medical clearance.';
  }
  if(given.length)req+='\n'+given.join(' ');
  if(free.length)req+='\nDecide these unspecified items yourself using sensible training logic: '+free.join('; ')+'.';
  return [task,req,exAnswerFormat(draft&&draft.locale)].join('\n\n');
}

async function exaAddExercise(){
  const raw = ($('aiResult').value || '').trim();
  if(!raw){ appAlert(MSG_AI_EMPTY()); return; }
  const checkedRaw = aiClientVerdict('exercise.create', raw);
  if(!checkedRaw) return;
  // оборачиваем в минимальную программу, чтобы переиспользовать основной парсер
  const wrapped = 'ПРОГРАММА: temp\nДЕНЬ:\nКРУГИ: 1\n\n' + checkedRaw;
  const {program, errors} = parseProgramText(wrapped);
  const list = (program.plans && program.plans[0] && program.plans[0].exercises) || [];
  if(!list.length){
    appAlert(MSG_AI_NOEX());
    return;
  }
  const target = curPlan().exercises;
  const nWarm = target.filter(e => e.warmup).length;
  let nMain = target.length - nWarm;
  let added = 0;
  for(const ex of list){
    if(ex.warmup ? nWarm + added >= MAX_WARM : nMain >= MAX_MAIN) break;
    target.push(ex);
    if(!ex.warmup) nMain++;
    added++;
  }
  if(!added){ appAlert(t('exercise.addLimit')); return; }
  $('aiResult').value = '';
  if($('exaContext')) $('exaContext').value = '';
  renderExList();
  // Успешное применение завершает режим ИИ. Builder уже лежит под экраном ИИ,
  // поэтому именно ВОЗВРАЩАЕМСЯ к нему и ждём popstate. Простая замена текущей
  // записи делала два Builder подряд, из-за чего следующий Back оставался в Builder.
  await goBackTo('scrBuilder');
  appAlert(added === 1
    ? t('exercise.addedOne',{name:list[0].name})
    : t('exercise.addedMany',{count:added}));
}

/* ================= ПРОГРАММА ИЗ ВИДЕО ================= */
// проверяем и нормализуем ссылку на YouTube
function parseYouTubeUrl(raw){
  const s = String(raw || '').trim();
  if(!s) return null;
  const m = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{6,})/i);
  if(!m) return null;
  return {id: m[1], url: s.startsWith('http') ? s : ('https://' + s)};
}

function youtubePrompt(){
  const yt = parseYouTubeUrl($('ytUrl').value);
  const wish = clampText($('ytWish').value, LIM.wish);
  const link = yt ? yt.url : ($('ytUrl').value || '').trim();
  return aiPrompt() +
    '\n\n=== TASK: BUILD A PROGRAM FROM A VIDEO ===\n' +
    'Analyze the workout at the link and convert it into the protocol above.\n' +
    'VIDEO URL: ' + link + '\n' +
    'USER: ' + userForAI() + '\n\n' +
    'Requirements:\n' +
    '- Keep exercises in the same order as the video, with the same reps/durations and rest when they can be determined.\n' +
    '- Mark warm-up exercises with the exact token "РАЗМИНКА: да".\n' +
    '- If the video repeats the whole exercise list, represent that with КРУГИ. If one exercise is repeated in consecutive sets, use ПОДХОДЫ.\n' +
    '- Write user-visible exercise names and descriptions in ' + aiOutputLanguage() + '.\n' +
    '- For ВИДЕО on EACH exercise, use the same video URL with a timestamp for the moment that exercise starts. Prefer an approximate timestamp over linking to the beginning when exact timing is uncertain.\n' +
    '- Describe technique in your own words; do not quote the creator verbatim.\n' +
    '- In ОПИСАНИЕ ПРОГРАММЫ mention the source video and what type of workout it is.\n' +
    '- If the video is unavailable or is not a workout, say so instead of inventing a program.\n' +
    (wish ? ('\nADDITIONAL USER REQUEST: ' + wish + '\n') : '');
}

function openYouTube(){
  $('ytUrl').value = '';
  $('ytWish').value = '';
  autoGrow($('ytWish'));
  openAI('video');
  requireWho('ai', ()=> goTab('scrPrograms'));
}

function ytCheckUrl(){
  const v = ($('ytUrl').value || '').trim();
  const ok = !v || !!parseYouTubeUrl(v);
  $('ytHint').style.color = ok ? '' : 'var(--danger)';
  $('ytHint').textContent = ok ? t('youtube.hint') : t('youtube.badLink');
  return ok;
}

/* ================= ДОРАБОТКА ПРОГРАММЫ ЧЕРЕЗ ИИ ================= */
let editAIProg = null; // программа-исходник

// текущее (уже прогрессированное) значение упражнения — то, что человек реально
// делает сейчас, а не база из редактора. Используется только для AI-правки всей
// программы (см. programToText forEdit): она создаёт НОВУЮ программу со своим
// счётчиком прогрессии с нуля, поэтому если отдать ИИ базу, правка отбросит
// пользователя к исходным цифрам — а если отдать текущее и принять его как
// новую базу, продолжение идёт ровно с той точки, на которой человек остановился.
function exCurrentValueText(p, ex){
  if(ex.type === 'time') return String(getExProgValue(p.id, ex, p, 'time'));
  // двойная прогрессия: текущие повторы — одна точка внутри диапазона. Отдать
  // её как новую базу значит потерять низ диапазона, к которому повторы
  // сбрасываются при прибавке веса. Отдаём диапазон как есть — после правки
  // повторы начнут цикл снизу с текущим (уже выросшим) весом.
  if(isDualProg(ex)) return valueText(ex.value).replace('–', '-');
  return progressedRepsRange(p.id, ex, p).replace('–', '-');
}

// программа → текст того же формата, который понимает парсер
// картинки и svg НЕ включаем: они длинные, а перенесём их сами по id (см. carryMedia)
// opts.forEdit: для AI-правки всей программы — добавляет техническую метку КОД:
// у каждого упражнения (не видна пользователю) и отдаёт текущую прогрессированную
// нагрузку вместо базовой, см. exCurrentValueText выше и exProgToLines(ex, opts)
function programToText(p, opts){
  const forEdit = !!(opts && opts.forEdit);
  const L = [];
  L.push('ПРОГРАММА: ' + (p.name || ''));
  if((p.desc || '').trim()) L.push('ОПИСАНИЕ ПРОГРАММЫ: ' + p.desc.replace(/\s*\n+\s*/g, ' ').trim());
  if(p.time) L.push('ВРЕМЯ: ' + p.time);
  if(p.progression){
    L.push(`ПРОГРЕССИЯ: ${p.progression} — проверять нагрузку раз в ${p.progression} ${plural(p.progression, 'выполнение упражнения', 'выполнения упражнения', 'выполнений упражнения')}`);
  }
  const plans = normPlans(p);
  if(p.rotate && plans.length > 1){
    L.push('ЧЕРЕДОВАНИЕ: да');
    if((p.days || []).length) L.push('ДНИ ТРЕНИРОВОК: ' + p.days.join(', '));
  }
  plans.forEach(pl => {
    L.push('');
    L.push('ДЕНЬ: ' + ((!p.rotate && pl.days && pl.days.length) ? pl.days.join(', ') : ''));
    L.push('КРУГИ: ' + (pl.rounds || 1));
    L.push('ОТДЫХ МЕЖДУ КРУГАМИ: ' + (pl.roundRest || 0));
    if(pl.time) L.push('ВРЕМЯ ВАРИАНТА: ' + pl.time);
    (pl.exercises || []).forEach(ex => {
      L.push('');
      L.push('УПРАЖНЕНИЕ: ' + (ex.name || ''));
      if(forEdit && ex.id) L.push('КОД: ' + ex.id);
      if((ex.desc || '').trim()) L.push('ОПИСАНИЕ: ' + ex.desc.replace(/\s*\n+\s*/g, ' ').trim());
      const mus = (ex.muscles || []).map(id => M_LABEL[id]).filter(Boolean);
      if(mus.length) L.push('МЫШЦЫ: ' + mus.join(', '));
      if((ex.mistakes || '').trim()) L.push('ОШИБКИ: ' + ex.mistakes.replace(/\s*\n+\s*/g, ' ').trim());
      L.push(exFormatLine(ex));
      L.push('ЗНАЧЕНИЕ: ' + (forEdit ? exCurrentValueText(p, ex) : valueText(ex.value).replace('–', '-')));
      // всегда, даже при 1 подходе: ИИ повторяет формат исходника, и без строки
      // возвращал программу без ПОДХОДЫ вовсе
      L.push('ПОДХОДЫ: ' + (parseInt(ex.sets) || 1));
      if(ex.perSide) L.push('СТОРОНА: да');
      if(ex.warmup) L.push('РАЗМИНКА: да');
      L.push(...exRestLines(ex));
      L.push(...exProgToLines(ex, forEdit ? {program:p} : null));
      if((ex.video || '').trim()) L.push('ВИДЕО: ' + ex.video.trim());
    });
  });
  return L.join('\n');
}

function editAIPrompt(){
  const wish=clampText($('eaWish').value,LIM.wish);
  return aiPrompt((editAIProg&&editAIProg.locale)||appLocale)+
    '\n\n=== TASK: EDIT AN EXISTING PROGRAM ===\n'+
    'Apply the requested changes and return the COMPLETE program in the same machine-readable protocol.\n'+
    FitAIProtocol.editRules()+'\n'+
    // КОД — только для сопоставления «то же упражнение / новое», сюда не входит в
    // обычный протокол и не должна попасть в пользовательский текст (ОПИСАНИЕ и т.п.)
    'Each УПРАЖНЕНИЕ line may be followed by a КОД: <code> line — an internal reference tag, never user-visible text. Repeat the SAME КОД for the same movement even if you rename it, move it, or change its format; give a genuinely new exercise no КОД line at all; never move a КОД onto a different exercise.\n'+
    // Длинная программа (20+ упражнений) переписывалась целиком вместе с
    // описаниями техники по 600 знаков и не успевала за время ответа сервера.
    // Описания неизменных упражнений приложение подставит само (carryExerciseText).
    'Keep the answer short: for an exercise you keep (it has a КОД) whose ОПИСАНИЕ, МЫШЦЫ and ОШИБКИ stay accurate after the change, OMIT those three lines — the app keeps the existing text. Write them in full for new exercises and whenever the movement, equipment or technique changes.\n'+
    'USER: '+userForAI((editAIProg&&editAIProg.locale)||appLocale)+'\n'+
    'USER REQUEST: '+wish+'\n\n'+
    '=== CURRENT PROGRAM (values shown are the CURRENT working load, not the original baseline) ===\n'+programToText(editAIProg, {forEdit:true});
}

function openEditAI(p){
  editAIProg = p;
  $('aiSubjName').textContent = p.name || t('program.fallback');
  const plans = normPlans(p);
  const exN = plans.reduce((n, pl) => n + pl.exercises.length, 0);
  $('aiSubjSum').textContent = (plans.length>1?storeCountText(plans.length,'variant')+' · ':'') + storeCountText(exN,'exercise');
  $('eaWish').value = '';
  autoGrow($('eaWish'));
  openAI('edit');
}

// подбирает свободное имя: «Ягодицы (обновлённая)», «Ягодицы (обновлённая 2)»…
function versionedName(base){
  const clean = String(base || t('program.fallback')).replace(/\s+\((?:обновлённая|updated)(?:\s+\d+)?\)$/i, '').trim();
  const taken = new Set(customPrograms.map(x => (x.name || '').trim().toLowerCase()));
  if(!taken.has(clean.toLowerCase())) return clean;
  const cand = `${clean} (${t('program.updated')})`;
  if(!taken.has(cand.toLowerCase())) return cand;
  for(let v = 2; v < 100; v++){
    const cand2 = `${clean} (${t('program.updatedN',{count:v})})`;
    if(!taken.has(cand2.toLowerCase())) return cand2;
  }
  return clean + ' (' + t('program.updatedN',{count:Date.now()}) + ')';
}

// переносит картинки и обложку из исходной программы. Упражнения сопоставлены
// заранее через FitAIProtocol.diffPrograms (id/КОД/имя, см. createEditedProgram)
// — так перестановка и лёгкое переименование сохраняют картинку, а настоящая
// замена движения (новое упражнение без пары) — нет: старая картинка от другого
// движения только запутала бы.
function carryMedia(oldProg, newProg, diff){
  let carried = 0;
  diff.matches.forEach(({oldEx, newEx}) => {
    if(!newEx.media && oldEx.media){ newEx.media = JSON.parse(JSON.stringify(oldEx.media)); carried++; }
  });
  if(!newProg.cover && oldProg.cover) newProg.cover = oldProg.cover;
  return carried;
}

// Счётчик «сколько раз выполнено до проверки повышения» (ex.ps.n) — у того же
// упражнения после правки он продолжается, а не начинается с нуля. Текущие
// значения (ps.cur) не переносим: ИИ получил их в тексте программы
// (programToText forEdit) и вернул как новую базу — иначе прибавка
// посчиталась бы дважды.
// Исключение — база упражнения не изменилась (правили описание, отдых, порядок;
// у двойной прогрессии ИИ видит исходный диапазон, а не текущее число): тогда
// переносится и ps.cur, иначе повторы двойной прогрессии откатывались к началу.
function carryProgressCounters(diff){
  diff.matches.forEach(({oldEx, newEx}) => { carryExerciseProgress(oldEx, newEx); });
}

// Описание, мышцы, ошибки и видео у сопоставленного упражнения, которые ИИ не
// вернул (так просит editAIPrompt — ради короткого ответа), берём из исходника.
// Вернул — значит поменял: его текст не трогаем.
function carryExerciseText(diff){
  diff.matches.forEach(({oldEx, newEx}) => {
    if(!(newEx.desc || '').trim() && (oldEx.desc || '').trim()) newEx.desc = oldEx.desc;
    if(!(newEx.muscles || []).length && (oldEx.muscles || []).length) newEx.muscles = oldEx.muscles.slice();
    if(!(newEx.mistakes || '').trim() && (oldEx.mistakes || '').trim()) newEx.mistakes = oldEx.mistakes;
    if(!(newEx.video || '').trim() && (oldEx.video || '').trim()) newEx.video = oldEx.video;
  });
}

// расчётная (не по истории) длительность одного варианта — используется только
// для сравнения «было / стало» при AI-правке, поэтому обеим сторонам нужна одна
// и та же основа: реальная история новой программы всегда пуста (свежий id), а у
// старой может быть — сравнение «средняя реальная» против «расчётная» было бы
// нечестным. Подменяем id, чтобы estimatedWorkoutMinutes не подобрала историю.
function structuralMinutes(p, planIdx){
  return estimatedWorkoutMinutes(Object.assign({}, p, {id:'~diff~'}), planIdx || 0, []).n;
}

// «Было / стало» после AI-правки: коротко, без похода в текст ответа. Плюс
// хардовые проверки итога (пачка 1, п.4) — то, что не запретить заранее в
// промте, но можно и нужно поймать после генерации.
function editSummaryText(diff, oldProg, newProg){
  const bits = [];
  if(diff.added.length) bits.push(t('ai.editAdded', {names: diff.added.map(e => e.name || t('common.exerciseFallback')).join(', ')}));
  if(diff.removed.length) bits.push(t('ai.editRemoved', {names: diff.removed.map(e => e.name || t('common.exerciseFallback')).join(', ')}));
  if(diff.moved > 0) bits.push(t('ai.editReordered'));
  // сравниваем КАЖДЫЙ вариант (Пн/Чт…): ИИ мог раздуть только один из них.
  // Вариант, которого до правки не было или который убрали, в сравнение не
  // идёт — его упражнения уже названы выше как добавленные/убранные.
  // Порог как в самой генерации: короткие тренировки — ±5 минут, длинные — ±20%.
  const n = Math.min(normPlans(oldProg).length, normPlans(newProg).length);
  let worst = null;
  for(let i = 0; i < n; i++){
    const before = structuralMinutes(oldProg, i), after = structuralMinutes(newProg, i);
    const d = Math.abs(after - before);
    const notable = before > 0 && d > (before <= 20 ? 5 : Math.max(5, before * 0.2));
    if(notable && (!worst || d > worst.d)) worst = {before, after, d};
  }
  if(worst) bits.push(t('ai.editTimeChanged', {before: worst.before, after: worst.after}));
  return bits.join('');
}

async function createEditedProgram(){
  const raw = ($('aiResult').value || '').trim();
  if(!raw){ appAlert(MSG_AI_EMPTY()); return; }
  // Ответ ИИ принимается как есть — свобода добавлять/убирать/переставлять
  // упражнения теперь в промте (FitAIProtocol.editRules), а не в клиенте через
  // regex-угадайку «structural» и принудительный merge старой структуры.
  const checkedRaw = aiClientVerdict('program.modify', raw);
  if(!checkedRaw) return;
  const {program, errors} = parseProgramText(checkedRaw);
  if(errors.length){
    appAlert(MSG_AI_PARSE() + '\n\n' + t('ai.parseProblems') + '\n— ' + errors.join('\n— '));
    return;
  }
  // жёсткая проверка итога: программа не развалилась на пустые варианты — иначе
  // за «улучшением» на деле нет тренировки
  const newPlans = normPlans(program);
  if(!newPlans.length || newPlans.some(pl => !(pl.exercises || []).length)){
    appAlert(MSG_AI_PARSE());
    return;
  }
  const diff = FitAIProtocol.diffPrograms({plans: normPlans(editAIProg)}, {plans: newPlans});
  // КОД — техническая метка сопоставления, в сохранённой программе ей делать нечего
  newPlans.forEach(pl => (pl.exercises || []).forEach(ex => { delete ex._code; }));

  program.id = 'p' + Date.now();
  program.stats = {completions: 0};
  program.locale = (editAIProg && (editAIProg.locale === 'ru' || editAIProg.locale === 'en'))
    ? editAIProg.locale : (appLocale === 'ru' ? 'ru' : 'en');
  delete program.rotIdx; delete program.progLast;
  // имя: если не изменилось — добавляем версию
  program.name = versionedName(program.name || editAIProg.name);
  carryMedia(editAIProg, program, diff);
  carryExerciseText(diff);
  carryProgressCounters(diff);
  // настройки, которые ИИ мог не вернуть, берём из исходника
  if(!program.time && editAIProg.time) program.time = editAIProg.time;
  if(program.load == null && editAIProg.load != null) program.load = editAIProg.load;

  customPrograms.push(program);
  await savePrograms();
  renderMine();
  $('aiResult').value = '';
  goTab('scrPrograms');
  appAlert(t('program.createdEdited',{name:program.name}) + editSummaryText(diff, editAIProg, program));
}

/* Короткая ссылка /p/<id>: программу забираем с сервера. Метка src остаётся в
   программе — по ней потом уедет отчёт, и по ней же подопечный понимает, что программа
   пришла от тренера, а не собрана им самим. */
async function claimProgramLink(id){
  if(!id || !account || !account.email || !account.syncToken) return false;
  let deviceId=await kvGet('deviceId');
  if(!deviceId){deviceId=newId();await kvSet('deviceId',deviceId);}
  try{
    await apiPost('/api/p/'+encodeURIComponent(id),{action:'claim',email:account.email,deviceId,token:account.syncToken});
    return true;
  }catch(_){return false;}
}

async function importProgramLink(id){
  let d;
  try{ d = await apiFetch('/api/p/' + encodeURIComponent(id)); }
  catch(e){
    appAlert(e.status === 404
      ? t('import.linkExpired')
      : t('import.linkOffline'));
    return;
  }
  const prog = d.program;
  if(!prog || !prog.name){ appAlert(t('import.noProgram')); return; }
  const existing = customPrograms.find(x => x && x.src === id);
  prog.id = existing ? existing.id : ('p' + Date.now());
  prog.stats = existing && existing.stats ? existing.stats : {completions: 0};
  if(existing && existing.active !== undefined) prog.active = existing.active;
  if(existing && existing.progStepsAdj != null) prog.progStepsAdj = existing.progStepsAdj;
  prog.src = id;
  prog.plans = normPlans(prog);
  sanitizeProgram(prog);        // пришло по сети — значит, могло прийти любым
  // Снимок присланного — чтобы потом было видно, что подопечный в нём поменял.
  prog.origEx = snapshotEx(prog);
  if(d.by) prog.by = d.by;
  if(d.byLink) prog.byLink = d.byLink;
  draft = prog;
  draft.plans = JSON.parse(JSON.stringify(normPlans(draft)));
  delete draft.exercises; delete draft.rounds; delete draft.roundRest; delete draft.days;
  planIdx = 0;
  fillBuilder(t('import.reviewSave'));
  // Говорим ОДИН РАЗ и ЗАРАНЕЕ: тренер будет видеть занятия по этой программе.
  // Отчёты уходят сами, и узнавать об этом постфактум человек не должен —
  // согласие на «за мной смотрят» даётся до, а не после.
  if(prog.by){
    appAlert(t('import.trainerNotice',{trainer:prog.by}));
  }
}

/* Разбор вставленного. Приложение выдаёт КОРОТКУЮ ссылку (?p=<id>) — и именно её
   поле не понимало вовсе: человек вставлял то, что ему прислали, и получал «это не
   похоже на код программы». Проверять надо то, что приходит, а не то, что мы когда-то
   выдавали.

   Три случая, и все три встречаются:
   • короткая ссылка ?p=<id> — программу забираем с сервера;
   • старая ссылка ?import=FIT1… — приложение таких больше не делает, но они лежат
     в чужих переписках, и ломать их задним числом незачем;
   • голый код FIT1… — то же самое, вставленное без адреса. */
function importProgramCode(code){
  code = (code || '').trim();

  const short = code.match(/[?&]p=([0-9a-z]{4,16})\b/i)
    || (/^[0-9a-z]{4,16}$/i.test(code) && !/^FIT1/i.test(code) ? [null, code] : null);
  if(short){
    $('importModal').classList.remove('open');
    importProgramLink(short[1]);
    return;
  }

  if(code.includes('import=')){
    try{ code = decodeURIComponent(code.split('import=')[1].split('&')[0]); }catch(e){}
  }
  if(!code.startsWith('FIT1.')){
    appAlert(t('import.badLink'));
    return;
  }
  let prog;
  try{
    prog = JSON.parse(decodeURIComponent(escape(atob(code.slice(5)))));
  }catch(e){ appAlert(t('import.badCode')); return; }
  if(!prog || !prog.name || !normPlans(prog).some(pl => pl.exercises && pl.exercises.length)){
    appAlert(t('import.noProgramCode')); return;
  }
  prog.id = 'p' + Date.now();
  prog.stats = {completions: 0};
  prog.plans = normPlans(prog);
  sanitizeProgram(prog);        // код можно собрать руками, и собирают
  draft = prog;
  draft.plans = JSON.parse(JSON.stringify(normPlans(draft)));
  delete draft.exercises; delete draft.rounds; delete draft.roundRest; delete draft.days;
  planIdx = 0;
  $('importModal').classList.remove('open');
  fillBuilder(t('import.reviewSave'));
}

/* ================= СЕРВЕРНАЯ ЧАСТЬ =================
   Приложение работает без сети и обязано продолжать: сервер тут ДОБАВЛЯЕТ, а не
   заменяет. Поэтому у каждого вызова есть запасной путь, а сам вызов короткий —
   если сервера нет (офлайн, открыли файлом, ещё не задеплоено), ждать его нечего.

   База по умолчанию — тот же адрес, откуда открыто приложение: функции лежат
   рядом со страницей (api/ в репозитории). */
const RUNTIME_CONFIG = window.APP_CONFIG || window.FIT_TIMER_CONFIG || {};
const API_BASE = RUNTIME_CONFIG.apiBase
  ? String(RUNTIME_CONFIG.apiBase).replace(/\/$/, '')
  : (location.protocol.startsWith('http') ? '' : null);
const PUBLIC_APP_URL = RUNTIME_CONFIG.publicAppUrl
  ? String(RUNTIME_CONFIG.publicAppUrl).replace(/\/$/, '') + '/'
  : (location.origin + location.pathname.replace(/[^/]*$/, ''));   // /index.html → /
const API_WAIT = 7000;
/* Потолок длины адреса, который мы соглашаемся выдать человеку. Настоящий предел
   выше (хостинг отбивает около 14 КБ), но запас нужен: ссылку пересылают, к ней
   дописывают метки переходов, а мессенджеры её оборачивают. Всё, что не влезло,
   уходит не ссылкой, а кодом или файлом — см. exportProgram. */
const URL_SAFE = 1800;

async function apiFetch(path, opts){
  if(API_BASE === null) throw new Error('offline');
  const cfg = Object.assign({}, opts || {});
  const wait = Math.max(1000, Math.min(30000, +cfg.timeoutMs || API_WAIT));
  delete cfg.timeoutMs;
  const ctl = new AbortController();
  const t = setTimeout(()=> ctl.abort(), wait);
  try{
    // Ответы API краткоживущие и не должны кэшироваться браузером.
    const res = await fetch(API_BASE + path,
      Object.assign({signal: ctl.signal, cache: 'no-store'}, cfg));
    const data = await res.json().catch(()=> ({}));
    if(!res.ok){
      const err = new Error(data.error || ('http_' + res.status));
      err.code = data.error; err.status = res.status;
      throw err;
    }
    return data;
  } finally { clearTimeout(t); }
}
/* Последний ответ сервера — чтобы экран не был пустым, пока идёт новый.

   Показать вчерашние данные и через секунду заменить их свежими честнее, чем
   держать пустоту: человек видит содержимое сразу, а не «сломалось». Хранится в
   localStorage, потому что переживать перезапуск обязано, а ценности не имеет —
   пропало, значит просто подождём ответа, как раньше. */
function lastSeen(key, value){
  try{
    if(value === undefined){
      const raw = localStorage.getItem('seen_' + key);
      return raw ? JSON.parse(raw) : null;
    }
    localStorage.setItem('seen_' + key, JSON.stringify(value));
  }catch(e){}
  return null;
}

const apiPost = (path, body) => apiFetch(path, {
  method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)
});

/* ================= ТРЕНЕР И ЕГО ПОДОПЕЧНЫЕ =================
   Кабинет строится ДО бэкенда, потому что его задача — не хранить данные, а выяснить,
   пользуются ли тренеры каналом вообще. Поэтому v1 целиком локальная и держится на
   том, что в приложении уже работает: программа уезжает подопечному ссылкой FIT1, отчёт
   возвращается ссылкой FITR1. Ни аккаунта, ни регистрации, ни сети.

   Когда появится сервер, экраны останутся те же — поменяется только источник подопечных
   и способ доставки отчётов. Разбор — docs/trainer-ui.md. */

let trainer = null;    // {on, handle, links}
/* Подопечный: [{id, name, note, progs: [...]}]
   progs — программы, отправленные ЭТОМУ человеку, у каждой своя ссылка, свои
   отметки и свои занятия:
     {pid, name, sentAt, link:{id,key}, opens, firstOpen, reports:[], err, checkedAt}
   Раньше ссылка была одна на подопечного, и вторая отправка затирала первую вместе с
   её занятиями — тренер терял всё, что человек сделал по прошлому курсу. */
let clients = [];
let clientIdx = -1;    // какого подопечного открыли на scrClient
let coachPhotoDraft = null;

async function loadTrainer(){
  let localTrainer = null, localClients = [];
  try{ localTrainer = JSON.parse(await kvGet(pk('trainer'))) || null; }catch(e){}
  try{ localClients = JSON.parse(await kvGet(pk('clients'))) || []; }catch(e){}
  if(account && account.email){
    const rec = await readAccountBucket();
    if(!rec.bucket.trainer && localTrainer){
      rec.bucket.trainer = localTrainer;
      bumpAccountMeta(rec.bucket, 'trainer');
    }
    if(!rec.bucket.clients && Array.isArray(localClients) && localClients.length){
      rec.bucket.clients = localClients;
      bumpAccountMeta(rec.bucket, 'clients');
    }
    trainer = rec.bucket.trainer || null;
    clients = rec.bucket.clients || [];
    await writeAccountBucket(rec);
    // После миграции данные принадлежат аккаунту, а не активному профилю.
    await kvDel(pk('trainer'));
    await kvDel(pk('clients'));
  } else {
    trainer = localTrainer;
    clients = localClients;
  }
  if(!trainer) trainer = {on: false, handle: '', links: ''};
  if(!Array.isArray(clients)) clients = [];
  // Прежняя запись: одна программа прямо на подопечном. Переносим её в список, ничего
  // не теряя, — у тех, кто уже отправлял, занятия должны остаться на месте.
  let moved = false;
  clients.forEach(c => {
    if(Array.isArray(c.progs)) return;
    c.progs = (c.programId || c.link || c.sentAt) ? [{
      pid: c.programId || null, name: c.programName || '', sentAt: c.sentAt || null,
      link: c.link || null, opens: c.opens || 0, firstOpen: c.firstOpen || null,
      reports: c.reports || []
    }] : [];
    ['programId', 'programName', 'sentAt', 'link', 'opens', 'firstOpen', 'reports', 'err', 'checkedAt']
      .forEach(k => delete c[k]);
    moved = true;
  });
  if(moved) await saveClients();
}
async function saveTrainer(opts){
  if(account && account.email){
    const rec = await readAccountBucket();
    rec.bucket.trainer = trainer;
    if(!(opts && opts.remote)) bumpAccountMeta(rec.bucket, 'trainer');
    await writeAccountBucket(rec);
    if(!(opts && (opts.remote || opts.deferSync))) queueAccountSync();
  } else await kvSet(pk('trainer'), JSON.stringify(trainer));
}
async function saveClients(opts){
  if(account && account.email){
    const rec = await readAccountBucket();
    rec.bucket.clients = clients;
    if(!(opts && opts.remote)) bumpAccountMeta(rec.bucket, 'clients');
    await writeAccountBucket(rec);
    if(!(opts && opts.remote)) queueAccountSync();
  } else await kvSet(pk('clients'), JSON.stringify(clients));
}
// Режим считается включённым только вместе с ником: без ника подопечный не поймёт, от кого
// пришла программа, а «Отправить подопечному» в меню без адресата — пункт в никуда.
const trainerAccountReady = () => !!(account && account.email && account.syncToken && account.handle);
const trainerOn = () => !!(trainerAccountReady() && trainer && trainer.on && (trainer.handle || '').trim());
// ник приводим к одному виду: человек напишет и «@lena», и «lena», и «t.me/lena»
function normHandle(v){
  let h = String(v || '').trim().replace(/^https?:\/\//, '').replace(/^(t\.me|instagram\.com)\//, '');
  h = h.replace(/^@+/, '').replace(/[^\wа-яё.\-]/gi, '');
  return h ? '@' + h : '';
}
function humanDay(iso){
  if(!iso) return '';
  try{ return new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU', {day: 'numeric', month: 'long'}); }
  catch(e){ return iso; }
}
function daysSince(iso){
  if(!iso) return null;
  try{ return Math.floor((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 86400000); }catch(e){ return null; }
}
const lastReport = pr => (pr && pr.reports && pr.reports.length) ? pr.reports[pr.reports.length - 1] : null;
const clProgs = c => (c && Array.isArray(c.progs)) ? c.progs : [];
// Сводка по подопечному целиком: занятия по всем программам, самое свежее из них.
function clientSum(c){
  let n = 0, last = '', opens = 0, sent = 0;
  clProgs(c).forEach(pr => {
    const r = lastReport(pr);
    if(r){ n += r.n || 0; if((r.last || '') > last) last = r.last || ''; }
    opens += pr.opens || 0;
    if(pr.sentAt) sent++;
  });
  return {n, last, opens, sent, progs: clProgs(c).length};
}

