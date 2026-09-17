/* Навигация: четыре раздела у обычного человека, пять у тренера.

   «Клиенты» появляются вместе с режимом тренера и исчезают вместе с ним: пока его
   нет, кнопка занимала бы место под раздел, в который незачем заходить. «Аккаунт» и
   «Настройки» слиты в «Ещё» — они делились не по смыслу, а по истории, и человек
   искал нужное в двух местах по очереди. Каталог не в доке: туда заходят три раза
   за всё время, а место в доке постоянное.

   Запуск:  node tests/dev-server.js 8124
            node tests/nav-flow.js */

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
  const page = await (await b.newContext({viewport: {width: 412, height: 900}})).newPage();
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(2000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(1500); }

  // ---- обычный человек ----
  const plain = await tabs(page);
  ok('четыре раздела без режима тренера', plain.length === 4, plain.join(' · '));
  ok('«Ещё» вместо «Аккаунта» и «Настроек»',
     plain.includes('Ещё') && !plain.includes('Настройки') && !plain.includes('Аккаунт'));
  ok('«Клиентов» не видно', !plain.includes('Клиенты'));

  // всё из настроек доехало в «Ещё»
  await page.evaluate(() => goTab('scrAccount'));
  await page.waitForTimeout(600);
  const more = await page.evaluate(() => ({
    title: document.querySelector('#scrAccount h1').textContent,
    hasSound: !!document.getElementById('hfSeg'),
    hasProfiles: !!document.getElementById('usersList'),
    hasPlan: !!document.getElementById('btnPlanCard'),
    visible: !document.getElementById('hfSeg').closest('.screen').classList.contains('hidden')
  }));
  ok('раздел называется «Ещё»', more.title === 'Ещё', more.title);
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

  // ---- включаем режим тренера ----
  await page.evaluate(async () => {
    goTab('scrAccount');
    trainer = {on: true, handle: '@nav.coach', about: '', years: null, links: ''};
    await saveTrainer();
    renderTrainerCard();
    renderMine();
  });
  await page.waitForTimeout(500);
  const coach = await tabs(page);
  ok('у тренера пять разделов', coach.length === 5, coach.join(' · '));
  ok('появились «Клиенты»', coach.includes('Клиенты'));

  await page.evaluate(() => goTab('scrPrograms'));
  await page.waitForTimeout(400);
  ok('и заявки в каталог на «Тренировках»', await page.isVisible('#btnMyCatalog'));

  // «Клиенты» — корневой раздел: док на месте, панели действий нет
  await page.evaluate(() => goTab('scrTrainer'));
  await page.waitForTimeout(600);
  ok('«Клиенты» открываются из дока', (await screen(page)) === 'scrTrainer', await screen(page));
  ok('док на них виден', await page.isVisible('.dock'));
  ok('кнопки «назад» у корневого раздела нет', !(await page.isVisible('#clsBackTop')));

  // «назад» с вкладки возвращает на «Сегодня», а не в глубину
  await page.goBack();
  await page.waitForTimeout(600);
  ok('«назад» с раздела ведёт на «Сегодня»', (await screen(page)) === 'scrMenu', await screen(page));

  // ---- выключаем — раздел уходит ----
  await page.evaluate(async () => {
    trainer.on = false;
    await saveTrainer();
    renderTrainerCard();
  });
  await page.waitForTimeout(300);
  const off = await tabs(page);
  ok('без режима тренера «Клиенты» снова скрыты', !off.includes('Клиенты'), off.join(' · '));

  await page.evaluate(() => goTab('scrPrograms'));
  await page.waitForTimeout(400);
  await page.screenshot({path: __dirname + '/shot-nav.png'});

  console.log('\npageerror:', errs.length ? errs : 'нет');
  if(errs.length) bad++;
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
