/* Резервная копия: всё ли уезжает и всё ли возвращается.

   Копия собиралась перечислением четырёх полей руками, и за ней не уследили: мимо
   прошли ручные правки веса, режим тренера с ником и ключом, вся картотека
   подопечных, пол с датой рождения и аккаунт с подпиской. Человек восстанавливался
   из копии и терял оплаченное, не узнав об этом.

   Проверяем не «работает ли выгрузка», а РОВНО ЭТО: что в файле лежит всё, что
   приложение пишет, и что после восстановления оно на месте.

   Запуск:  node tests/dev-server.js 8124
            node tests/backup-flow.js */

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

const PROG = `ПРОГРАММА: Сила дома
ДНИ: Пн, Чт
КРУГИ: 3
ОТДЫХ МЕЖДУ КРУГАМИ: 90

УПРАЖНЕНИЕ: Приседания
ФОРМАТ: повторения и вес
ЗНАЧЕНИЕ: 12
ВЕС: 10
ПОДХОДЫ: 3
ОТДЫХ: 60
ШАГ ВЕСА: 2`;

const boot = async (b, errs, label) => {
  const page = await (await b.newContext({viewport: {width: 412, height: 900}})).newPage();
  page.on('pageerror', e => errs.push(label + ': ' + e));
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(2000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(1500); }
  return page;
};

/* Восстановление тем же путём, что у кнопки: файл, подтверждение нажатием и
   перезагрузка, которую делает само приложение. Обходить эти шаги значило бы
   проверять не то, чем пользуются. */
async function restore(page, dump){
  await page.evaluate(d => {
    const file = new File([JSON.stringify(d)], 'backup.json', {type: 'application/json'});
    window.__done = importAllData(file);
  }, dump);
  await page.waitForTimeout(400);
  if(await page.isVisible('#dlgOk')) await page.click('#dlgOk');
  await page.waitForTimeout(1500);
  await page.reload({waitUntil: 'load'});
  await page.waitForTimeout(2200);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(1500); }
}

(async () => {
  const b = await chromium.launch({executablePath: CHROME});
  const errs = [];
  const page = await boot(b, errs, 'телефон 1');

  /* ---- набиваем телефон всем, что бывает ---- */
  await page.evaluate(async (txt) => {
    const me = users.find(u => u.id === currentUser);
    me.name = 'Лена';
    me.theme = 'light';
    me.prepSec = 7;
    await saveUsers();

    // Пол и дата рождения живут в самом профиле, а не в identity: identity —
    // это «кто я для сервера» (profileId, почта, согласия).
    me.gender = 'f';
    me.birth = '1990-05-01';
    await saveUsers();

    const r = parseProgramText(txt);
    const p = r.program || r; p.id = 'bk1';
    customPrograms.push(p); await savePrograms();

    stats.count = 12;
    stats.totalSec = 42000;
    stats.weights = [{d: '2026-09-01', v: 61.5}, {d: '2026-09-10', v: 60.8}];
    stats.badges = ['first'];
    await saveStats();

    // ручная правка веса с тренировки — то, чего копия и не забирала
    progWeights['bk1|Приседания'] = 4;
    await saveProgWeights();

    photos = [{d: '2026-09-01', img: 'data:image/png;base64,iVBORw0KGgo='}];
    await savePhotos();

    trainer = {on: true, handle: '@lena.doma', key: 'ключ-правки-страницы',
               name: 'Лена', about: 'Домашний фитнес', years: 8,
               links: 'https://t.me/lena.doma'};
    await saveTrainer();

    clients = [{id: 'c1', name: 'Марина', note: 'колено', progs: [
      {pid: 'bk1', name: 'Сила дома', sentAt: '2026-09-05',
       link: {id: 'abc12345', key: 'ключ-ссылки'}, opens: 2, reports: []}
    ]}];
    await saveClients();

    account.email = 'lena@example.com';
    account.sub = {plan: 'year', since: '2026-09-01', until: '2027-09-01',
                   currency: 'RUB', price: 1990, autoRenew: true};
    await saveAccount();

    await kvSet('hfMode', 'clap');
    await kvSet('soundOff', '0');
  }, PROG);

  /* ---- снимаем копию тем же кодом, каким её снимает кнопка ---- */
  const dump = await page.evaluate(async () => {
    const out = {app: 'fittimer', version: 2, users, currentUser, data: {}, settings: {}};
    for(const u of users){
      const d = {};
      for(const k of backupProfileKeys()){
        const v = await kvGet(k + '_' + u.id);
        if(v != null) d[k] = v;
      }
      out.data[u.id] = d;
    }
    for(const k of backupGlobalKeys()){
      const v = await kvGet(k);
      if(v != null) out.settings[k] = v;
    }
    return out;
  });

  const uid = Object.keys(dump.data)[0];
  const inFile = Object.keys(dump.data[uid]);
  ok('в копии есть программы', inFile.includes('customPrograms'), inFile.join(', '));
  ok('и ручные правки веса', inFile.includes('progWeights'));
  ok('и пол с датой рождения', inFile.includes('identity'));
  ok('и режим тренера', inFile.includes('trainer'));
  ok('и картотека подопечных', inFile.includes('clients'));
  ok('и статистика с весом тела', inFile.includes('stats'));
  ok('и фото прогресса', inFile.includes('photos'));
  ok('аккаунт с подпиской — в настройках', !!dump.settings.account,
     Object.keys(dump.settings).join(', '));
  ok('и управление без рук', dump.settings.hfMode === 'clap', dump.settings.hfMode);

  // Того, что переносить нельзя, в копии быть не должно вовсе.
  ok('очередь отправки в копию НЕ попадает', !inFile.includes('outbox'));
  ok('и служебные метки обмена тоже', !inFile.includes('docMeta'));
  ok('и незавершённая тренировка', !inFile.includes('workoutSession'));
  ok('и id устройства', !dump.settings.deviceId, String(dump.settings.deviceId));

  /* ---- сторож: копия берёт ВСЁ, что перечислено для удаления ---- */
  const drift = await page.evaluate(() => {
    const miss = PROFILE_KEYS.filter(k => !NO_BACKUP.includes(k) && !backupProfileKeys().includes(k))
      .concat(GLOBAL_KEYS.filter(k => !NO_BACKUP.includes(k) && !backupGlobalKeys().includes(k)));
    return miss;
  });
  ok('списки копии и удаления не разошлись', drift.length === 0, drift.join(', ') || '—');

  /* ---- чистый телефон: восстанавливаем ---- */
  const two = await boot(b, errs, 'телефон 2');
  // Тот же путь, что и у кнопки: importAllData спрашивает подтверждение и сам
  // перезагружает страницу — подтверждаем нажатием, перезагрузку просто ждём.
  await restore(two, dump);

  const got = await two.evaluate(() => {
    const me = users.find(u => u.id === currentUser) || {};
    return {
      name: me.name, theme: me.theme, prep: me.prepSec,
      gender: me.gender, birth: me.birth, profileId: !!(identity && identity.profileId),
      // Ищем по имени: при первом запуске приложение само кладёт стартовую
      // программу, и наша в списке не первая.
      prog: (customPrograms.find(p => p.name === 'Сила дома') || {}).name,
      weightStep: (() => {
        const p = customPrograms.find(p => p.name === 'Сила дома');
        return p ? normPlans(p)[0].exercises[0].wStep : null;
      })(),
      count: stats.count, body: (stats.weights || []).length,
      // Достижения пересчитываются при загрузке, и на двенадцати тренировках их
      // становится больше, чем было записано, — проверяем, что записанное на месте.
      badge: (stats.badges || []).includes('first'),
      manual: progWeights['bk1|Приседания'],
      photos: photos.length,
      coach: trainer && trainer.handle, coachKey: trainer && trainer.key,
      coachLink: trainer && trainer.links,
      clients: clients.length, clientName: clients[0] && clients[0].name,
      clientLink: clients[0] && clients[0].progs[0] && clients[0].progs[0].link.id,
      email: account.email, sub: account.sub && account.sub.plan, premium: isPremium(),
      hf: hfMode
    };
  });

  ok('профиль вернулся', got.name === 'Лена' && got.theme === 'light' && got.prep === 7,
     `${got.name} · ${got.theme} · ${got.prep}`);
  ok('пол и дата рождения вернулись', got.gender === 'f' && got.birth === '1990-05-01',
     `${got.gender} ${got.birth}`);
  ok('и «кто я для сервера» на месте', got.profileId);
  ok('программа вернулась', got.prog === 'Сила дома' && got.weightStep === 2,
     `${got.prog}, шаг ${got.weightStep}`);
  ok('статистика, вес тела и достижения', got.count === 12 && got.body === 2 && got.badge,
     `${got.count} тренировок, ${got.body} замера, достижение на месте: ${got.badge}`);
  ok('РУЧНАЯ ПРАВКА ВЕСА вернулась', got.manual === 4, String(got.manual));
  ok('фото прогресса вернулись', got.photos === 1, got.photos);
  ok('режим тренера вернулся вместе с ключом',
     got.coach === '@lena.doma' && got.coachKey === 'ключ-правки-страницы', got.coach);
  ok('и ссылка на себя', got.coachLink === 'https://t.me/lena.doma', got.coachLink);
  ok('подопечные вернулись вместе со ссылками',
     got.clients === 1 && got.clientName === 'Марина' && got.clientLink === 'abc12345',
     `${got.clients} · ${got.clientName} · ${got.clientLink}`);
  ok('АККАУНТ И ПОДПИСКА вернулись',
     got.email === 'lena@example.com' && got.sub === 'year' && got.premium === true,
     `${got.email} · ${got.sub} · премиум ${got.premium}`);
  ok('управление без рук вернулось', got.hf === 'clap', got.hf);

  /* ---- старый файл первой версии продолжает открываться ---- */
  const three = await boot(b, errs, 'телефон 3');
  await restore(three, {app: 'fittimer', version: 1,
    users: [{id: 'u1', name: 'Старый'}], currentUser: 'u1',
    data: {u1: {
      programs: [{id: 'old1', name: 'Из старой копии', plans: [{days: ['Ср'], rounds: 2,
        roundRest: 60, exercises: [{name: 'Планка', type: 'time', value: 40, sets: 2, rest: 30}]}]}],
      stats: {count: 5, weights: []},
      photos: [],
      warmupAdded: true
    }},
    settings: {soundOff: '1'}});
  const oldGot = await three.evaluate(async () => ({
    prog: (customPrograms[0] || {}).name, count: stats.count,
    // булево из копии первой версии должно лечь в хранилище строкой '1'
    warm: await kvGet(pk('warmupAdded')), sound: await kvGet('soundOff')
  }));
  ok('копия первой версии тоже открывается',
     oldGot.prog === 'Из старой копии' && oldGot.count === 5,
     `${oldGot.prog}, ${oldGot.count} тренировок`);
  ok('и её булевы поля поняты верно', oldGot.warm === '1' && oldGot.sound === '1',
     `warmupAdded=${oldGot.warm}, soundOff=${oldGot.sound}`);

  console.log('\npageerror: ' + (errs.length ? errs.join(' | ') : 'нет'));
  if(errs.length) bad += errs.length;
  await b.close();
  console.log(bad ? 'ПРОВАЛЕНО: ' + bad : 'всё сошлось');
  process.exit(bad ? 1 : 0);
})();
