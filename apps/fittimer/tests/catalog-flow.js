/* Предложение программы в каталог: отправка, проверка руками, появление в витрине.

   Публикации без проверки нет намеренно — разбор в docs/trainer-ui.md. Здесь
   проверяем весь путь и заодно минимальные заслоны: чужой ник, три программы в
   сутки, повтор того же названия, недобор полей.

   Запуск:  ADMIN_KEY=... node tests/dev-server.js 8124
            node tests/catalog-flow.js */

const { becomeTrainer } = require('./helpers/trainer-account');

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const ADMIN = process.env.ADMIN_KEY || 'testadminkey123456';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

const prog = (name) => `ПРОГРАММА: ${name}
ДНИ: Пн, Чт
КРУГИ: 3
ОТДЫХ МЕЖДУ КРУГАМИ: 60
ПРОГРЕССИЯ: 4
` + ['Приседания', 'Отжимания', 'Планка'].map(n => `
УПРАЖНЕНИЕ: ${n}
ФОРМАТ: повторения
ЗНАЧЕНИЕ: 12
ПОДХОДЫ: 3
ОТДЫХ: 45`).join('');

const progEn = (name) => `ПРОГРАММА: ${name}
ДНИ: Пн, Чт
КРУГИ: 3
ОТДЫХ МЕЖДУ КРУГАМИ: 60
ПРОГРЕССИЯ: 4
` + ['Squats', 'Push-ups', 'Plank'].map(n => `
УПРАЖНЕНИЕ: ${n}
ФОРМАТ: повторения
ЗНАЧЕНИЕ: 12
ПОДХОДЫ: 3
ОТДЫХ: 45`).join('');

(async () => {
  const b = await chromium.launch({executablePath: CHROME});
  const errs = [];
  const NICK = '@pub.' + Math.random().toString(36).slice(2, 8);
  // Хранилище между прогонами не чистится, поэтому и ник, и название — свои на
  // каждый запуск. Иначе тест проверяет остатки прошлого раза, а не себя.
  const NAME = 'Силовая база ' + Math.random().toString(36).slice(2, 6);

  /* Стартовый набор заливаем сами. Каталог целиком живёт на сервере, зашитых в
     приложение программ больше нет — и на чистом хранилище «лежит вместе с
     остальными» проверять было не с чем. Прогон не должен зависеть от того, что
     до него запускали что-то ещё. */
  await fetch(BASE + '/api/admin', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'X-Admin-Key': encodeURIComponent(ADMIN)},
    body: JSON.stringify({action: 'seed'})
  }).catch(()=>{});

  const page = await (await b.newContext({viewport: {width: 412, height: 900}, locale: 'ru-RU'})).newPage();
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(2000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(1500); }

  // тренер — режим аккаунта: вход, ник, сохранение страницы
  await page.evaluate(() => { users.find(u => u.id === currentUser).name = 'Лена'; });
  await becomeTrainer(page, {handle: NICK, trainer: {about: 'Домашний фитнес.', years: 5, links: ''}});
  ok('ник закреплён', await page.evaluate(() => !!trainer.key));

  const add = (name) => page.evaluate(async ({txt, name}) => {
    const r = parseProgramText(txt);
    const p = r.program || r; p.id = 'p' + Math.random().toString(36).slice(2, 8); p.name = name;
    customPrograms.push(p); await savePrograms();
    return p.id;
  }, {txt: prog(name), name});

  // ---- недобор полей ловится ДО отправки ----
  const id1 = await add(NAME);
  const miss = await page.evaluate(async (pid) => {
    openPublish(customPrograms.find(p => p.id === pid));
    await doPublish();                       // ничего не заполнено
    return document.getElementById('dlgMsg').textContent;
  }, id1);
  ok('пустую заявку не пускает', /Не хватает/.test(miss), miss.slice(0, 52));
  await page.click('#dlgOk'); await page.waitForTimeout(300);

  // ---- нормальная отправка ----
  const sent = await page.evaluate(async () => {
    pubDraft.cat = 'Кардио и энергия';
    pubDraft.level = 'Средний';
    pubDraft.gives = 'Три базовых движения по кругу. Ничего, кроме коврика, не нужно.';
    document.getElementById('pubGives').value = pubDraft.gives;
    await doPublish();
    return {status: pubProg.pub && pubProg.pub.status, msg: document.getElementById('dlgMsg').textContent};
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
  const dup = await page.evaluate(async ({nick, name}) => {
    try{
      await apiPost('/api/catalog', {by: nick, trainerKey: trainer.key, item: {
        name, gives: 'то же самое, но ещё раз, двадцать символов точно',
        cat: 'cardio', level: 'Средний', min: 20, exCount: 3, text: 'x'.repeat(100)}});
      return 'принято';
    }catch(e){ return e.code; }
  }, {nick: NICK, name: NAME});
  ok('повтор того же названия отбит', dup === 'already_sent', dup);


  // ---- чужой ник ----
  const alien = await page.evaluate(async (nick) => {
    try{
      await apiPost('/api/catalog', {by: nick, trainerKey: 'не-мой-ключ', item: {
        name: 'Подделка', gives: 'двадцать символов здесь точно наберётся, поверь',
        cat: 'cardio', level: 'Средний', min: 20, exCount: 3, text: 'x'.repeat(100)}});
      return 'принято';
    }catch(e){ return e.code; }
  }, NICK);
  ok('с чужим ключом не принимает', alien === 'not_yours', alien);

  /* ---- проверка руками ----
     Отдельной страницы /api/catalog/review больше нет: ту же очередь показывает
     admin.html, где она лежит рядом с каталогом, тренерами и картинками. Здесь
     ходим тем же путём, каким ходит админка. */
  const admin = (action, extra) => fetch(BASE + '/api/admin', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'X-Admin-Key': encodeURIComponent(ADMIN)},
    body: JSON.stringify(Object.assign({action}, extra || {}))
  }).then(r => r.json());

  const queue = await admin('overview');
  const asked = (queue.pending || []).find(x => x.name === NAME && x.by === NICK);
  ok('заявка видна в очереди', !!asked, asked ? asked.id : '(не нашлась)');
  ok('и несёт всё, по чему решают', !!(asked && asked.gives && asked.text && asked.cat),
     asked ? `${asked.cat} · ${(asked.gives || '').slice(0, 24)}…` : '');
  const blocked = await admin('approve', {id: asked.id});
  ok('без второго языка публикация блокируется', blocked.error === 'catalog_not_ready', blocked.error || blocked.status);
  // Перевод появляется только здесь, когда модератор решил готовить заявку.
  const ENAME = 'Strength Base ' + NAME.split(' ').pop();
  const prepared = await admin('edit', {id: asked.id, item: {
    sourceLocale: 'ru',
    locales: {
      ru: {name: asked.name, gives: asked.gives, text: asked.text},
      en: {name: ENAME, gives: 'Three basic movements in a simple home circuit workout.',
        // Даже если внешний переводчик полез в механику, сервер должен восстановить
        // её из оригинала и оставить только переведённый текст (ключи протокола
        // всегда русские — по ним сервер и находит переводимые поля).
        text: progEn(ENAME).replace(/ЗНАЧЕНИЕ: 12/g, 'ЗНАЧЕНИЕ: 999')}
    }
  }});
  ok('модератор добавил второй язык', prepared.ok === true, prepared.error || 'ok');
  const took = await admin('approve', {id: asked.id});
  ok('заявку взяли только после RU + EN', took.status === 'approved', took.status || took.error);
  const fromApi = await fetch(BASE + '/api/catalog?lang=ru').then(r => r.json());
  ok('сервер отдаёт русский вариант', (fromApi.items || []).some(x => x.name === NAME),
     (fromApi.items || []).length + ' позиций');
  const fromEn = await fetch(BASE + '/api/catalog?lang=en').then(r => r.json());
  ok('тот же id отдаётся на английском', (fromEn.items || []).some(x => x.id === asked.id && x.name === ENAME),
     ((fromEn.items || []).find(x => x.id === asked.id) || {}).name || 'нет');
  const enFull = await fetch(BASE + '/api/catalog?item=' + asked.id + '&lang=en').then(r => r.json());
  ok('механика перевода восстановлена из оригинала',
     /УПРАЖНЕНИЕ: Squats/.test(enFull.item.text) && /ЗНАЧЕНИЕ: 12/.test(enFull.item.text) && !/999/.test(enFull.item.text),
     (enFull.item.text || '').slice(0, 80));

  // ---- и вот теперь она в каталоге ----
  const after = await page.evaluate(async (name) => {
    await loadStoreServer();
    const it = storeServer.find(x => x.name === name);
    return {found: !!it, by: it && it.by, cat: it && it.cat,
            inAll: storeAll().some(x => x.name === name), all: storeAll().length};
  }, NAME);
  ok('после проверки появилась в каталоге', after.found, after.by || '(не нашлась)');
  ok('обложка соответствует цели, а не первой попавшейся', after.cat === 'cardio', after.cat);
  ok('и лежит вместе с остальными в одном списке', after.inAll && after.all > 5, after.all + ' программ');

  // ---- статус у тренера обновился сам ----
  const st = await page.evaluate(async () => { await refreshPubStatus(); return pubProg.pub.status; });
  ok('тренер видит, что программу взяли', st === 'approved', st);

  // ---- её можно добавить себе, как любую другую ----
  const added = await page.evaluate(async (name) => {
    const it = storeAll().find(x => x.name === name);
    if(!it) return {found: false};
    openStoreItem(it.id);
    return {found: true, screen: (document.querySelector('.screen.on') || {}).id,
            title: (document.getElementById('siName') || {}).textContent};
  }, NAME);
  ok('страница программы из каталога открывается',
     added.found && added.screen === 'scrStoreItem', added.screen);

  // ---- лимит в сутки ----
  const limit = await page.evaluate(async ({nick, NAME}) => {
    const out = [];
    for(let i = 0; i < 4; i++){
      try{
        await apiPost('/api/catalog', {by: nick, trainerKey: trainer.key, item: {
          name: NAME + ' вариант ' + i, gives: 'двадцать символов здесь точно наберётся, поверь',
          cat: 'cardio', level: 'Средний', min: 20, exCount: 3, text: 'x'.repeat(100)}});
        out.push('ok');
      }catch(e){ out.push(e.code); }
    }
    return out;
  }, {nick: NICK, NAME});
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
     нет: заслон от двойного нажатия превращался в запрет на вторую попытку.
     Проверяем в самом конце, чтобы не ломать порядок остального сценария. */
  // Свой ник и свой аккаунт: у прежнего уже выбран суточный предел проверкой выше.
  const rej = await (await b.newContext({viewport: {width: 412, height: 900}, locale: 'ru-RU'})).newPage();
  rej.on('pageerror', e => errs.push(String(e)));
  await rej.goto(BASE + '/index.html', {waitUntil: 'load'});
  await rej.waitForTimeout(1500);
  if(await rej.isVisible('#obStart')){ await rej.click('#obStart'); await rej.waitForTimeout(1000); }
  await becomeTrainer(rej, {handle: '@rej.' + Math.random().toString(36).slice(2, 7), trainer: {name: 'Т'}});
  const again = await rej.evaluate(async ({base, admin}) => {
    const nick = normHandle(trainer.handle);
    const key = trainer.key;
    const name = 'Отклонённая ' + Math.random().toString(36).slice(2, 6);
    const item = {name, gives: 'двадцать символов здесь точно наберётся, поверь мне',
                  cat: 'cardio', level: 'Средний', min: 20, exCount: 3, text: 'x'.repeat(100)};
    const first = await apiPost('/api/catalog', {by: nick, trainerKey: key, item});
    await fetch(base + '/api/admin', {method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-Admin-Key': encodeURIComponent(admin)},
      body: JSON.stringify({action: 'reject', id: first.id})});
    try{
      await apiPost('/api/catalog', {by: nick, trainerKey: key, item});
      return 'принято';
    }catch(e){ return e.code; }
  }, {base: BASE, admin: ADMIN});
  ok('отклонённую можно прислать заново', again === 'принято', again);

  console.log('\npageerror:', errs.length ? errs : 'нет');
  if(errs.length) bad++;
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
