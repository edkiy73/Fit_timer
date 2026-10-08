/* Предложение программы в каталог: отправка, проверка руками, появление в витрине.

   Публикации без проверки нет намеренно — разбор в docs/trainer-ui.md. Здесь
   проверяем весь путь и заодно минимальные заслоны: чужой ник, три программы в
   сутки, повтор того же названия, недобор полей.

   Запись каталога — одна программа V2 (механика + тексты исходного языка) и накладки
   языков (lib/fit-catalog-program.js).

   Запуск:  ADMIN_KEY=... node tests/dev-server.js 8124
            node tests/catalog-flow.js */

const { becomeTrainer } = require('./helpers/trainer-account');
const { installV2Fixtures } = require('./helpers/v2-fixtures');
const { catalogProgram, translated } = require('./helpers/catalog-program');
let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const ADMIN = process.env.ADMIN_KEY || 'testadminkey123456';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

// Программа для заявок прямо в API (заслоны сервера проверяем без интерфейса)
const apiProgram = name => catalogProgram(name, ['Приседания', 'Отжимания', 'Планка']);

(async () => {
  const b = await chromium.launch({executablePath: CHROME});
  const errs = [];
  const NICK = '@pub.' + Math.random().toString(36).slice(2, 8);
  // Хранилище между прогонами не чистится, поэтому и ник, и название — свои на
  // каждый запуск. Иначе тест проверяет остатки прошлого раза, а не себя.
  const NAME = 'Силовая база ' + Math.random().toString(36).slice(2, 6);

  const page = await (await b.newContext({viewport: {width: 412, height: 900}, locale: 'ru-RU'})).newPage();
  await installV2Fixtures(page);
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(2000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(1500); }

  // тренер — режим аккаунта: вход, ник, сохранение страницы
  await page.evaluate(() => { curUser().name = 'Лена'; });
  await becomeTrainer(page, {handle: NICK, trainer: {about: 'Домашний фитнес.', years: 5, links: ''}});
  ok('ник закреплён', await page.evaluate(() => !!trainer.key));

  // личная программа тренера: с прогрессом и статистикой, которые в каталог уйти не должны
  await page.evaluate(async (name) => {
    customPrograms.push({id: 'pub1', name, stats: {completions: 4}, plans: [v2plan('pub1-plan', [
      v2ex('Приседания', {value: 12, sets: 3, rest: 45, state: {count: 3, current: {reps: '14'}}}),
      v2ex('Отжимания', {value: 10, sets: 3, rest: 60}),
      v2ex('Планка', {type: 'time', value: 40, sets: 3, rest: 30})
    ], {days: ['Пн', 'Чт'], rounds: 3, roundRest: 60})]});
    await savePrograms();
  }, NAME);

  // ---- недобор полей ловится ДО отправки ----
  const miss = await page.evaluate(async () => {
    openPublish(customPrograms.find(p => p.id === 'pub1'));
    await doPublish();                       // ничего не заполнено
    return document.getElementById('dlgMsg').textContent;
  });
  ok('пустую заявку не пускает', /Не хватает/.test(miss), miss.slice(0, 52));
  await page.click('#dlgOk'); await page.waitForTimeout(300);

  // ---- нормальная отправка из интерфейса ----
  const sent = await page.evaluate(async () => {
    pubDraft.cat = 'Кардио и энергия';
    pubDraft.level = 'Средний';
    pubDraft.gives = 'Три базовых движения по кругу. Ничего, кроме коврика, не нужно.';
    document.getElementById('pubGives').value = pubDraft.gives;
    await doPublish();
    const published = customPrograms.find(p => p.id === 'pub1');
    return {status: published && published.pub && published.pub.status, msg: document.getElementById('dlgMsg').textContent};
  });
  ok('заявка ушла и ждёт проверки', sent.status === 'pending', sent.status);
  ok('человеку сказано, что заявка ушла на проверку', /на проверку/.test(sent.msg), sent.msg.slice(0, 60));
  await page.click('#dlgOk'); await page.waitForTimeout(300);

  // ---- в каталоге её ещё нет ----
  const before = await page.evaluate(async (name) => {
    await loadStoreServer();
    return storeAll().some(x => x.name === name);
  }, NAME);
  ok('до проверки в каталоге не появляется', before === false, String(before));

  // ---- повтор того же названия не принимается ----
  const dup = await page.evaluate(async ({nick, name, program}) => {
    try{
      await apiPost('/api/catalog', {by: nick, trainerKey: trainer.key, item: {
        name, gives: 'то же самое, но ещё раз, двадцать символов точно',
        cat: 'cardio', level: 'Средний', min: 20, program}});
      return 'принято';
    }catch(e){ return e.code; }
  }, {nick: NICK, name: NAME, program: apiProgram(NAME)});
  ok('повтор того же названия отбит', dup === 'already_sent', dup);

  // ---- старый текстовый формат не принимается вовсе ----
  const legacy = await page.evaluate(async ({nick}) => {
    const r = await fetch('/api/catalog', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({by: nick, trainerKey: trainer.key, item: {
        name: 'Текстом ' + Math.random().toString(36).slice(2, 6), gives: 'двадцать символов здесь точно наберётся, поверь',
        cat: 'cardio', level: 'Средний', min: 20, exCount: 3, text: 'ПРОГРАММА: x\n' + 'x'.repeat(100)}})});
    const j = await r.json();
    return r.status === 200 ? 'принято' : j.error + ':' + (j.miss || []).join(',');
  }, {nick: NICK});
  ok('заявка текстом без программы отклоняется', /^bad_item:.*программа/.test(legacy), legacy);

  // ---- чужой ник ----
  const alien = await page.evaluate(async ({nick, program}) => {
    try{
      await apiPost('/api/catalog', {by: nick, trainerKey: 'не-мой-ключ', item: {
        name: 'Подделка', gives: 'двадцать символов здесь точно наберётся, поверь',
        cat: 'cardio', level: 'Средний', min: 20, program}});
      return 'принято';
    }catch(e){ return e.code; }
  }, {nick: NICK, program: apiProgram('Подделка')});
  ok('с чужим ключом не принимает', alien === 'not_yours', alien);

  /* ---- проверка руками ----
     Ту же очередь показывает admin.html; здесь ходим тем же путём, каким ходит админка. */
  const admin = (action, extra) => fetch(BASE + '/api/admin', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'X-Admin-Key': encodeURIComponent(ADMIN)},
    body: JSON.stringify(Object.assign({action}, extra || {}))
  }).then(r => r.json());

  const queue = await admin('overview');
  const asked = (queue.pending || []).find(x => x.name === NAME && x.by === NICK);
  ok('заявка видна в очереди', !!asked, asked ? asked.id : '(не нашлась)');
  const ap = asked && asked.program;
  ok('и несёт программу V2, по которой решают', !!(asked && asked.gives && asked.cat && ap
       && ap.plans[0].exercises.length === 3 && asked.exCount === 3),
     asked ? `${asked.cat} · ${asked.exCount} упр.` : '');
  ok('в каталог ушёл шаблон: без прогресса, статистики и личных полей',
     ap && ap.plans[0].exercises.every(ex => ex.progressState.count === 0 && ex.progressState.current.reps === null)
       && !ap.stats && !ap.id && !('text' in asked),
     ap && JSON.stringify(ap.plans[0].exercises[0].progressState));
  ok('исходный язык снят с программы', asked && asked.locales.ru.texts.stages.length === 3
     && asked.locales.ru.texts.stages[0].name === 'Приседания');
  ok('готовность языков посчитана сервером', asked && asked.ready && asked.ready.ru === true && asked.ready.en === false);
  const blocked = await admin('approve', {id: asked.id});
  ok('без второго языка публикация блокируется', blocked.error === 'catalog_not_ready', blocked.error || blocked.status);

  // Перевод появляется только здесь, когда модератор решил готовить заявку.
  const ENAME = 'Strength Base ' + NAME.split(' ').pop();
  const partial = translated(ap, {'Приседания': 'Squats', 'Отжимания': 'Push-ups', 'Планка': 'Plank'});
  partial.stages.pop();
  await admin('edit', {id: asked.id, item: {locales: {en: {name: ENAME,
    gives: 'Three basic movements in a simple home circuit workout.', texts: partial}}}});
  const half = await admin('approve', {id: asked.id});
  ok('неполная накладка (не все этапы) публикацию не пускает', half.error === 'catalog_not_ready'
     && (half.miss || []).some(x => /EN: тексты программы/.test(x)), (half.miss || []).join(' · '));
  const prepared = await admin('edit', {id: asked.id, item: {locales: {en: {name: ENAME,
    gives: 'Three basic movements in a simple home circuit workout.',
    texts: translated(ap, {'Приседания': 'Squats', 'Отжимания': 'Push-ups', 'Планка': 'Plank'}, {programName: ENAME})}}}});
  ok('модератор добавил второй язык', prepared.ok === true, prepared.error || 'ok');
  const took = await admin('approve', {id: asked.id});
  ok('заявку взяли только после RU + EN', took.status === 'approved', took.status || took.error);
  const fromApi = await fetch(BASE + '/api/catalog?lang=ru').then(r => r.json());
  const ruRow = (fromApi.items || []).find(x => x.id === asked.id);
  ok('сервер отдаёт русский вариант с программой', ruRow && ruRow.name === NAME && ruRow.program
     && ruRow.program.plans[0].exercises[0].stages[0].prescription.name === 'Приседания' && !('text' in ruRow));
  const fromEn = await fetch(BASE + '/api/catalog?lang=en').then(r => r.json());
  const enRow = (fromEn.items || []).find(x => x.id === asked.id);
  ok('тот же id отдаётся на английском', enRow && enRow.name === ENAME && enRow.locale === 'en', enRow && enRow.name);
  const enFull = await fetch(BASE + '/api/catalog?item=' + asked.id + '&lang=en').then(r => r.json());
  const enEx = enFull.item.program.plans[0].exercises, ruEx = ruRow.program.plans[0].exercises;
  ok('английская программа — та же механика с переведёнными текстами',
     enEx[0].stages[0].prescription.name === 'Squats'
       && enEx.map(e => e.id + ':' + e.stages[0].prescription.sets + ':' + e.stages[0].prescription.value).join()
          === ruEx.map(e => e.id + ':' + e.stages[0].prescription.sets + ':' + e.stages[0].prescription.value).join(),
     enEx.map(e => e.stages[0].prescription.name).join(', '));

  // ---- и вот теперь она в каталоге ----
  const after = await page.evaluate(async (name) => {
    await loadStoreServer();
    const it = storeAll().find(x => x.name === name);
    return {found: !!it, by: it && it.by, cat: it && it.cat};
  }, NAME);
  ok('после проверки появилась в каталоге', after.found, after.by || '(не нашлась)');
  ok('обложка соответствует цели, а не первой попавшейся', after.cat === 'cardio', after.cat);

  // ---- статус у тренера обновился сам ----
  const st = await page.evaluate(async (name) => {
    openPublish(customPrograms.find(p => p.name === name));
    await refreshPubStatus();
    const published = customPrograms.find(p => p.name === name);
    return published && published.pub && published.pub.status;
  }, NAME);
  ok('тренер видит, что программу взяли', st === 'approved', st);

  // ---- её можно добавить себе, как любую другую ----
  const added = await page.evaluate(async (name) => {
    const it = storeAll().find(x => x.name === name);
    if(!it) return {found: false};
    openStoreItem(it.id);
    const screen = (document.querySelector('.screen.on') || {}).id;
    await addStoreItem(it.id);
    const msg = document.getElementById('dlgMsg').textContent;
    const p = customPrograms.find(x => x.storeId === it.id);
    const src = it.program.plans[0];
    const ids = p ? p.plans[0].exercises.map(e => e.id) : [];
    const stageIds = p ? p.plans[0].exercises.map(e => e.stages[0].stageId) : [];
    return {found: true, screen, msg, saved: !!p, locale: p && p.locale,
      names: p ? p.plans[0].exercises.map(e => FitExerciseV2.prescriptionOf(e).name).join(',') : '',
      days: p ? p.plans[0].days.join(',') : '',
      freshIds: !!p && p.plans[0].id !== src.id && ids.every((id, i) => id !== src.exercises[i].id)
        && stageIds.every((id, i) => id !== src.exercises[i].stages[0].stageId)
        && p.plans[0].exercises.every(e => e.currentStageId === e.stages[0].stageId),
      button: document.getElementById('siBuy').textContent};
  }, NAME);
  ok('страница программы из каталога открывается', added.found && added.screen === 'scrStoreItem', added.screen);
  ok('программа добавляется себе', added.saved && /в твоих тренировках/.test(added.msg), added.msg.slice(0, 60));
  ok('личная копия — та же программа на языке витрины', added.names === 'Приседания,Отжимания,Планка'
     && added.days === 'Пн,Чт' && added.locale === 'ru', added.names + ' · ' + added.days);
  ok('у копии свои id варианта, упражнений и этапов', added.freshIds);
  ok('кнопка превращается в «Открыть»', /Открыть/.test(added.button), added.button);
  if(await page.isVisible('#dlgOk')){ await page.click('#dlgOk'); await page.waitForTimeout(200); }

  // ---- лимит в сутки ----
  const limit = await page.evaluate(async ({nick, NAME, programs}) => {
    const out = [];
    for(let i = 0; i < 4; i++){
      try{
        await apiPost('/api/catalog', {by: nick, trainerKey: trainer.key, item: {
          name: NAME + ' вариант ' + i, gives: 'двадцать символов здесь точно наберётся, поверь',
          cat: 'cardio', level: 'Средний', min: 20, program: programs[i]}});
        out.push('ok');
      }catch(e){ out.push(e.code); }
    }
    return out;
  }, {nick: NICK, NAME, programs: [0, 1, 2, 3].map(i => apiProgram(NAME + ' вариант ' + i))});
  ok('больше трёх в сутки не принимает', limit.includes('too_many_today'), limit.join(', '));

  // ---- тренер видит свою страницу и своё отправленное ----
  const mine = await page.evaluate(async () => {
    openMyCatalog();
    await new Promise(r => setTimeout(r, 900));
    return {screen: (document.querySelector('.screen.on') || {}).id,
            list: document.getElementById('mcList').textContent.replace(/\s+/g, ' ').trim()};
  });
  ok('список отправленного открывается', mine.screen === 'scrMyCatalog', mine.screen);
  ok('и показывает статус', /в каталоге|на проверке/.test(mine.list), mine.list.slice(0, 70));

  const own = await page.evaluate(async () => {
    openTrainer(normHandle(trainer.handle));
    await new Promise(r => setTimeout(r, 1200));
    return {screen: (document.querySelector('.screen.on') || {}).id,
            nick: document.getElementById('tpNick').textContent};
  });
  ok('тренер может посмотреть свою страницу', own.screen === 'scrTrainerPage' && own.nick === NICK,
     own.nick);

  /* Отклонённую программу можно прислать снова. Прежняя метка «такое название уже
     было» стояла навсегда, и тренер видел «уже отправлена» про то, чего в каталоге
     нет. Проверяем в самом конце, чтобы не ломать порядок остального сценария. */
  const rej = await (await b.newContext({viewport: {width: 412, height: 900}, locale: 'ru-RU'})).newPage();
  await installV2Fixtures(rej);
  rej.on('pageerror', e => errs.push(String(e)));
  await rej.goto(BASE + '/index.html', {waitUntil: 'load'});
  await rej.waitForTimeout(1500);
  if(await rej.isVisible('#obStart')){ await rej.click('#obStart'); await rej.waitForTimeout(1000); }
  await becomeTrainer(rej, {handle: '@rej.' + Math.random().toString(36).slice(2, 7), trainer: {name: 'Т'}});
  const RNAME = 'Отклонённая ' + Math.random().toString(36).slice(2, 6);
  const again = await rej.evaluate(async ({base, admin, name, program}) => {
    const nick = normHandle(trainer.handle);
    const key = trainer.key;
    const item = {name, gives: 'двадцать символов здесь точно наберётся, поверь мне',
                  cat: 'cardio', level: 'Средний', min: 20, program};
    const first = await apiPost('/api/catalog', {by: nick, trainerKey: key, item});
    await fetch(base + '/api/admin', {method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-Admin-Key': encodeURIComponent(admin)},
      body: JSON.stringify({action: 'reject', id: first.id})});
    try{
      await apiPost('/api/catalog', {by: nick, trainerKey: key, item});
      return 'принято';
    }catch(e){ return e.code; }
  }, {base: BASE, admin: ADMIN, name: RNAME, program: apiProgram(RNAME)});
  ok('отклонённую можно прислать заново', again === 'принято', again);

  console.log('\npageerror:', errs.length ? errs : 'нет');
  if(errs.length) bad++;
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
