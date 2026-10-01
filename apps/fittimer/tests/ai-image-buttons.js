/* «Через ИИ» для одной картинки есть везде, где её выбирают: у обложки на экране
   картинок, в редакторе упражнения и в настройках программы. Плюс сообщения об
   ошибке ИИ-правки показывают текст, а не исходный код функции.

   Запуск:  node tests/dev-server.js 8124
            node tests/ai-image-buttons.js */

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
  const page = await (await b.newContext({viewport: {width: 360, height: 800}, locale: 'ru-RU'})).newPage();
  page.on('pageerror', e => errs.push(String(e)));
  const imageKinds = [];
  const imageUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  await page.route('**/api/ai', async route => {
    const body = route.request().postDataJSON() || {};
    imageKinds.push(body.kind || '');
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({image:imageUrl})});
  });
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(1000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(800); }
  await page.evaluate(async () => {
    const u = curUser(); u.gender = 'f'; u.age = 30; await saveUsers();
    await kvSet('account', JSON.stringify(Object.assign({}, account, {
      email: 'image-test@example.com',
      syncToken: 'image-test-token',
      sub: {plan:'year', until:'2099-01-01'}
    })));
    await loadAccount();
    await kvSet('deviceId', 'image-test-device'); await loadIdentity();
    const p = {id: 'pd', name: 'Силовая', plans: [{days: ['Пн'], rounds: 1, roundRest: 0,
      exercises: [{name: 'Присед', type: 'reps', value: 10, rest: 30}]}]};
    await kvSet(pk('customPrograms'), JSON.stringify([...customPrograms, p]));
    await loadData();
    await savePrograms(); openBuilder('pd');
  });
  await page.waitForTimeout(300);

  // обложка на экране картинок
  await page.evaluate(() => { openImages(); openSlotPicker(0); });
  await page.waitForTimeout(300);
  ok('у обложки в выборе есть «Сделать через ИИ»', await page.isVisible('#slotGenerateAI'));
  await page.click('#slotGenerateAI'); await page.waitForTimeout(600);
  ok('обложка нарисована', await page.evaluate(() => !!draft.cover) && imageKinds.join() === 'image.cover',
     imageKinds.join());
  await page.evaluate(() => closeImages()); await page.waitForTimeout(700);

  // редактор упражнения
  await page.evaluate(() => { openBuilder('pd'); openExercise(0);
    if($('exDetailsBox').classList.contains('hidden')) $('exDetailsToggle').click(); });
  await page.waitForTimeout(300);
  ok('в редакторе упражнения есть «Через ИИ»', await page.isVisible('#exMediaAI'));
  await page.click('#exMediaAI'); await page.waitForTimeout(600);
  ok('картинка упражнения нарисована', await page.evaluate(() => {
    const img = $('exMediaPrev').querySelector('img');
    return !!img && /^data:image\//.test(img.src || '');
  }));
  await page.evaluate(() => { $('exName').value = ''; });
  await page.click('#exMediaAI'); await page.waitForTimeout(300);
  ok('без названия просит сначала назвать упражнение', /назови упражнение/.test(await page.textContent('#dlgMsg')));
  await page.evaluate(() => document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open')));

  // обложка в настройках программы
  await page.evaluate(() => { openBuilder('pd'); $('bSettingsToggle').click(); });
  await page.click('#bCoverNone');
  await page.waitForTimeout(300);
  ok('в настройках программы есть «Через ИИ» у обложки', await page.isVisible('#bCoverAI'));
  await page.click('#bCoverAI'); await page.waitForTimeout(600);
  ok('обложка из настроек нарисована', await page.evaluate(() => !!draft.cover && /<img/.test($('bCoverPrev').innerHTML)));
  const rows = await page.evaluate(() => [...document.querySelectorAll('#scrProgSettings .media-row button')]
    .map(el => el.scrollWidth <= el.clientWidth + 1));
  ok('на 360 px подписи кнопок не обрезаются', rows.every(Boolean), JSON.stringify(rows));

  // пустой ответ при ИИ-правке — текст, а не код
  const msg = await page.evaluate(async () => {
    document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
    $('aiResult').value = '';
    createEditedProgram();
    await new Promise(r => setTimeout(r, 100));
    return $('dlgMsg').textContent;
  });
  ok('ошибка ИИ-правки — понятный текст, а не код', !/=>|t\(/.test(msg) && /пустое/.test(msg), msg.slice(0, 50));

  ok('без ошибок в консоли', !errs.length, errs.join(' | '));
  await b.close();
  console.log(bad ? '\nПровалено: ' + bad : '\nВсё ок');
  process.exit(bad ? 1 : 0);
})();
