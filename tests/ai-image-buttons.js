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
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(1000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(800); }
  await page.evaluate(async () => {
    const u = curUser(); u.gender = 'f'; u.age = 30; await saveUsers();
    window.premiumGate = () => true;
    const c = document.createElement('canvas'); c.width = 40; c.height = 30;
    c.getContext('2d').fillRect(0, 0, 40, 30);
    const url = c.toDataURL('image/png');
    window.__kinds = [];
    window.callGeminiImage = async (prompt, signal, kind) => { __kinds.push(kind); return url; };
    customPrograms.push({id: 'pd', name: 'Силовая', plans: [{days: ['Пн'], rounds: 1, roundRest: 0,
      exercises: [{name: 'Присед', type: 'reps', value: 10, rest: 30}]}]});
    await savePrograms(); openBuilder('pd');
  });
  await page.waitForTimeout(300);

  // обложка на экране картинок
  await page.evaluate(() => { openImages(); openSlotPicker(0); });
  await page.waitForTimeout(300);
  ok('у обложки в выборе есть «Сделать через ИИ»', await page.isVisible('#slotGenerateAI'));
  await page.click('#slotGenerateAI'); await page.waitForTimeout(600);
  ok('обложка нарисована', await page.evaluate(() => !!draft.cover && __kinds.join() === 'image.cover'),
     await page.evaluate(() => __kinds.join()));
  await page.evaluate(() => closeImages()); await page.waitForTimeout(700);

  // редактор упражнения
  await page.evaluate(() => { openBuilder('pd'); openExercise(0);
    if($('exDetailsBox').classList.contains('hidden')) $('exDetailsToggle').click(); });
  await page.waitForTimeout(300);
  ok('в редакторе упражнения есть «Через ИИ»', await page.isVisible('#exMediaAI'));
  await page.click('#exMediaAI'); await page.waitForTimeout(600);
  ok('картинка упражнения нарисована', await page.evaluate(() =>
    !!(exDraft.media && exDraft.media.data) && /<img/.test($('exMediaPrev').innerHTML)));
  await page.evaluate(() => { $('exName').value = ''; });
  await page.click('#exMediaAI'); await page.waitForTimeout(300);
  ok('без названия просит сначала назвать упражнение', /назови упражнение/.test(await page.textContent('#dlgMsg')));
  await page.evaluate(() => document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open')));

  // обложка в настройках программы
  await page.evaluate(() => { openBuilder('pd'); draft.cover = null; $('bSettingsToggle').click(); });
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
