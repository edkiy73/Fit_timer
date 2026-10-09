/* Навигация: четыре раздела у обычного человека, пять у тренера.

   «Подопечные» появляются вместе с режимом тренера и исчезают вместе с ним: пока его
   нет, кнопка занимала бы место под раздел, в который незачем заходить. «Аккаунт» и
   «Настройки» слиты в «Другое» — они делились не по смыслу, а по истории, и человек
   искал нужное в двух местах по очереди. Каталог не в доке: туда заходят три раза
   за всё время, а место в доке постоянное.

   Запуск:  node tests/dev-server.js 8124
            node tests/nav-flow.js */

const { becomeTrainer } = require('./helpers/trainer-account');

const { installV2Fixtures } = require('./helpers/v2-fixtures');
let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

const tabs = page => page.evaluate(() => [...document.querySelectorAll('.dock-btn')]
  .filter(b => !b.classList.contains('hidden'))
  .map(b => b.textContent.trim()));
const screen = page => page.evaluate(() => (document.querySelector('.screen.on') || {}).id);

(async () => {
  const b = await chromium.launch({executablePath: CHROME});
  const errs = [];
  const page = await (await b.newContext({viewport: {width: 412, height: 900}, locale: 'ru-RU'})).newPage();
  await installV2Fixtures(page);
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(2000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(1500); }

  // ---- обычный человек ----
  const plain = await tabs(page);
  ok('четыре раздела без режима тренера', plain.length === 4, plain.join(' · '));
  ok('«Другое» вместо «Аккаунта» и «Настроек»',
     plain.includes('Другое') && !plain.includes('Настройки') && !plain.includes('Аккаунт'));
  ok('«Подопечных» не видно', !plain.includes('Подопечные'));

  // всё из настроек доехало в «Другое»
  await page.evaluate(() => goTab('scrAccount'));
  await page.waitForTimeout(600);
  const more = await page.evaluate(() => ({
    title: document.querySelector('#scrAccount h1').textContent,
    hasSound: !!document.getElementById('hfSeg'),
    hasProfiles: !!document.getElementById('usersList'),
    hasPlan: !!document.getElementById('btnPlanCard'),
    visible: !document.getElementById('hfSeg').closest('.screen').classList.contains('hidden')
  }));
  ok('раздел называется «Другое»', more.title === 'Другое', more.title);
  ok('звук, профили и тариф — в одном месте',
     more.hasSound && more.hasProfiles && more.hasPlan && more.visible);

  // каталог — на «Тренировках», а не в доке
  await page.evaluate(() => goTab('scrPrograms'));
  await page.waitForTimeout(500);
  ok('вход в каталог на «Тренировках»', await page.isVisible('#btnToStore'));
  ok('заявок в каталог у нетренера нет', !(await page.isVisible('#btnMyCatalog')));
  await page.click('#btnToStore');
  await page.waitForTimeout(700);
  ok('по нему открывается каталог', (await screen(page)) === 'scrStore', await screen(page));

  // ---- включаем режим тренера (только внутри аккаунта) ----
  await page.evaluate(() => goTab('scrAccount'));
  await becomeTrainer(page, {handle: '@nav.' + Math.random().toString(36).slice(2, 8)});
  await page.evaluate(() => { renderTrainerCard(); renderMine(); });
  await page.waitForTimeout(500);
  const coach = await tabs(page);
  ok('у тренера пять разделов', coach.length === 5, coach.join(' · '));
  ok('появились «Подопечные»', coach.includes('Подопечные'));

  // Строка заявок живёт во вкладке «Тренер» и показывается, только когда заявки
  // ЕСТЬ: «ничего не отправлено» сообщает ровно то, что строку не надо было показывать.
  await page.evaluate(() => { goTab('scrAccount'); switchMoreTab('coach'); });
  await page.waitForTimeout(400);
  ok('без заявок строки нет даже у тренера', !(await page.isVisible('#btnMyCatalog')));
  await page.evaluate(async () => {
    const p = {id:'navp1', name:'Проба', pub:{id:'u1', status:'pending'},
      plans:[v2plan('navp1-plan', [v2ex('Планка', {type:'time', value:40, rest:20})], {days:['Пн']})]};
    await kvSet(pk('customPrograms'), JSON.stringify([...customPrograms, p]));
    await loadData();
    await savePrograms();
    renderTrainerCard();
  });
  await page.waitForTimeout(300);
  ok('с заявкой строка появляется', await page.isVisible('#btnMyCatalog'));
  await page.evaluate(() => switchMoreTab('me'));

  // «Другое» разделено вкладками — иначе одиннадцать карточек подряд читаются как свалка
  await page.evaluate(() => goTab('scrAccount'));
  await page.waitForTimeout(500);
  const moreTabs = await page.evaluate(() =>
    [...document.querySelectorAll('#moreTabs .tab')].map(b => b.textContent.trim()));
  ok('«Другое» поделено вкладками', moreTabs.length === 4, moreTabs.join(' · '));
  ok('открывается на первой', await page.evaluate(() =>
    !document.getElementById('morePane_me').classList.contains('hidden')
    && document.getElementById('morePane_acc').classList.contains('hidden')));
  await page.click('#moreTabs .tab[data-more="coach"]');
  await page.waitForTimeout(250);
  ok('вкладка тренера открывается', await page.isVisible('#coachName'));

  // «Подопечные» — корневой раздел: док на месте, панели действий нет
  await page.evaluate(() => goTab('scrTrainer'));
  await page.waitForTimeout(600);
  ok('«Подопечные» открываются из дока', (await screen(page)) === 'scrTrainer', await screen(page));
  ok('док на них виден', await page.isVisible('.dock'));
  ok('кнопки «назад» у корневого раздела нет', !(await page.isVisible('#clsBackTop')));

  // «назад» с вкладки возвращает на «Сегодня», а не в глубину
  await page.goBack();
  await page.waitForTimeout(600);
  ok('«назад» с раздела ведёт на «Сегодня»', (await screen(page)) === 'scrMenu', await screen(page));

  // ---- выключаем — раздел уходит ----
  await page.evaluate(async () => {
    restoreTrainerClientState({trainer: Object.assign({}, trainer, {on: false}), clients});
    await saveTrainer();
    renderTrainerCard();
  });
  await page.waitForTimeout(300);
  const off = await tabs(page);
  ok('без режима тренера «Подопечные» снова скрыты', !off.includes('Подопечные'), off.join(' · '));

  await page.evaluate(() => goTab('scrPrograms'));
  await page.waitForTimeout(400);
  // ---- Unsaved AI request: exactly one confirmation for tap and system Back ----
  await page.evaluate(async () => {
    const u = curUser(); u.age = 30; u.gender = 'f'; await saveUsers();
    initAIForm(); openAI('text');
    $('qNote').value = 'Поменяй технику упражнения';
  });
  await page.evaluate(() => { $('aiBackTop').click(); $('aiBackTop').click(); });
  await page.waitForFunction(() => document.querySelector('#dlg.open'));
  ok('double-tap Back leaves one AI confirmation visible',
    /Заполненный запрос ещё не сохранён/.test(await page.textContent('#dlgMsg')));
  await page.click('#dlgCancel');
  await page.waitForFunction(() => !document.querySelector('#dlg.open'));
  ok('Stay preserves AI draft and keeps editing screen',
    await screen(page) === 'scrAI'
    && (await page.inputValue('#qNote')) === 'Поменяй технику упражнения');
  await page.evaluate(() => $('aiBackTop').click());
  await page.waitForFunction(() => document.querySelector('#dlg.open'));
  await page.click('#dlgOk');
  await page.waitForFunction(() => !document.querySelector('#dlg.open') && !document.querySelector('#scrAI.on'));
  await page.waitForTimeout(250);
  ok('confirmed top Back leaves without another prompt',
    !(await page.isVisible('#dlg')) && (await screen(page)) === 'scrPrograms');

  await page.evaluate(() => { initAIForm(); openAI('text'); $('qNote').value = 'Другой запрос'; });
  await page.evaluate(() => history.back());
  await page.waitForFunction(() => document.querySelector('#dlg.open'));
  ok('system Back uses a single grammatically correct AI guard',
    (await page.textContent('#dlgMsg')).trim()
      === 'Заполненный запрос ещё не сохранён. Если выйти сейчас, он пропадёт.');
  await page.click('#dlgCancel');
  await page.waitForFunction(() => !document.querySelector('#dlg.open'));
  ok('system Back Stay does not erase typed request',
    (await screen(page)) === 'scrAI' && (await page.inputValue('#qNote')) === 'Другой запрос');
  await page.evaluate(() => history.back());
  await page.waitForFunction(() => document.querySelector('#dlg.open'));
  await page.click('#dlgOk');
  await page.waitForFunction(() => !document.querySelector('#dlg.open') && !document.querySelector('#scrAI.on'));
  await page.waitForTimeout(250);
  ok('system Back confirm navigates exactly once', !(await page.isVisible('#dlg')));

  await page.screenshot({path: __dirname + '/shot-nav.png'});

  console.log('\npageerror:', errs.length ? errs : 'нет');
  if(errs.length) bad++;
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
