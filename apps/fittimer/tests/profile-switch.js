/* Программы каждого профиля остаются своими при переключении.

   Регрессия: при переключении на профиль с другим языком смена языка пересохраняла
   встроенную разминку раньше, чем загружались данные нового профиля, и программы
   прежнего профиля записывались в новый. Удалённое в одном профиле упражнение
   «пропадало» во всех, а потом все профили получали список самого последнего.

   Запуск:  node tests/dev-server.js 8124
            node tests/profile-switch.js */

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

(async () => {
  const b = await chromium.launch({executablePath: CHROME, args: ['--no-sandbox']});
  const errs = [];
  const page = await (await b.newContext({viewport: {width: 412, height: 900}})).newPage();
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(700);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(500); }

  const r = await page.evaluate(async () => {
    const notificationRuns = [];
    syncNativeNotifications = async () => {
      notificationRuns.push({
        user:currentUser,
        programs:customPrograms.filter(p => p.id !== 'warmup').map(p => p.id).sort()
      });
    };
    const prog = (id, n) => ({id, name: id, plans: [{days: [], rounds: 1, roundRest: 0,
      exercises: Array.from({length: n}, (_, i) => ({name: 'E' + i, type: 'reps', value: 10, rest: 10}))}]});
    const A = currentUser;
    curUser().locale = 'ru';
    users.push({id: 'uB', name: 'B', gender: 'm', age: 30, theme: 'system', locale: 'en'});
    users.push({id: 'uC', name: 'C', gender: 'f', age: 30, theme: 'system', locale: 'ru'});
    await saveUsers();
    customPrograms.push(prog('pa', 2)); await savePrograms();
    await switchUser('uB'); customPrograms.push(prog('pb', 5)); await savePrograms();
    await switchUser('uC'); customPrograms.push(prog('pc', 1)); await savePrograms();
    // удаляем упражнение в A и несколько раз переключаемся
    await switchUser(A);
    customPrograms.find(p => p.id === 'pa').plans[0].exercises.pop(); await savePrograms();
    for(const id of ['uB', 'uC', A, 'uC', 'uB', A]) await switchUser(id);
    const read = async id => JSON.parse(await kvGet('customPrograms_' + id))
      .filter(p => p.id !== 'warmup').map(p => p.id + ':' + p.plans[0].exercises.length).join(',');
    await switchUser('uB');
    const warmupEn = (customPrograms.find(p => p.id === 'warmup') || {}).name;
    const lastNotificationRun = notificationRuns[notificationRuns.length - 1] || null;
    return {
      A: await read(A), B: await read('uB'), C: await read('uC'),
      warmupEn, locale: appLocale, notificationRuns, lastNotificationRun
    };
  });
  ok('профиль A: только своя программа, упражнение удалено', r.A === 'pa:1', r.A);
  ok('профиль B не получил программы других профилей', r.B === 'pb:5', r.B);
  ok('профиль C не получил программы других профилей', r.C === 'pc:1', r.C);
  ok('разминка профиля на английском переведена', r.locale === 'en' && r.warmupEn === '10-minute warm-up', r.warmupEn);
  ok('каждое переключение профиля пересобирает нативные уведомления после загрузки его программ',
    r.notificationRuns.length >= 9
      && r.lastNotificationRun
      && r.lastNotificationRun.user === 'uB'
      && r.lastNotificationRun.programs.join(',') === 'pb',
    JSON.stringify(r.lastNotificationRun));

  const aiGender = await page.evaluate(() => {
    const u = curUser();
    const oldGender = u.gender;
    const oldDraft = draft;
    loadBuilderDraft({
      name:'Gender test',
      plans:[{days:[],rounds:1,roundRest:0,exercises:[
        {id:'gender-ex',name:'Squat',desc:'',muscles:[],type:'reps',value:'10',sets:1,weight:0}
      ]}]
    });

    u.gender = '';
    const blankUser = userForAI('en');
    const blankImages = imagesPromptText();

    u.gender = 'm';
    const maleUser = userForAI('en');
    const maleImages = imagesPromptText();

    u.gender = 'f';
    const femaleUser = userForAI('en');
    const femaleImages = imagesPromptText();

    u.gender = oldGender;
    loadBuilderDraft(oldDraft);

    return {blankUser,blankImages,maleUser,maleImages,femaleUser,femaleImages};
  });
  ok('пустой пол в AI-контексте остаётся not specified, а не female',
    /Sex: not specified/.test(aiGender.blankUser)
      && !/Sex: female/.test(aiGender.blankUser)
      && /do not infer it/i.test(aiGender.blankUser),
    aiGender.blankUser);
  ok('пустой пол в промтах картинок не превращается в женщину',
    /user sex not specified/i.test(aiGender.blankImages)
      && !/Character: woman/.test(aiGender.blankImages),
    aiGender.blankImages.slice(0,240));
  ok('явно выбранные male/female по-прежнему передаются точно',
    /Sex: male/.test(aiGender.maleUser)
      && /Character: man/.test(aiGender.maleImages)
      && /Sex: female/.test(aiGender.femaleUser)
      && /Character: woman/.test(aiGender.femaleImages),
    JSON.stringify({male:aiGender.maleUser,female:aiGender.femaleUser}));

  // Удалённая разминка не возвращается ни при переключении, ни после перезапуска.
  await page.evaluate(async () => {
    customPrograms = customPrograms.filter(p => p.id !== 'warmup'); await savePrograms();
    await switchUser('uC'); await switchUser('uB');
  });
  const back = await page.evaluate(() => customPrograms.some(p => p.id === 'warmup'));
  await page.reload({waitUntil: 'load'}); await page.waitForTimeout(1200);
  const afterReload = await page.evaluate(() => currentUser === 'uB' && customPrograms.some(p => p.id === 'warmup'));
  ok('удалённая разминка не возвращается', !back && !afterReload, `после переключения ${back}, после перезапуска ${afterReload}`);
  ok('без ошибок в консоли', !errs.length, errs.join(' | '));
  await b.close();
  console.log(bad ? '\nПровалено: ' + bad : '\nВсё ок');
  process.exit(bad ? 1 : 0);
})();
