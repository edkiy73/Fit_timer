/* Сквозной сценарий «тренер → клиент → отчёт → тренер».
   Единственное место, где весь круг проверяется целиком: отдельные куски работают
   и по отдельности, а ломается стык — ник в ссылке, поля упражнения в отчёте, поиск
   клиента по имени. Скриншоты пишет рядом с собой.

   Запуск:  python3 -m http.server 8123   (из корня репозитория)
            npm i playwright-core            (один раз, куда угодно)
            node tests/trainer-flow.js
   Обязательно смотреть на строку pageerror: приложение падает молча, экран просто
   не переключается. */
let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){
  console.error('Нужен playwright-core: npm i playwright-core (можно глобально или задать NODE_PATH).');
  process.exit(1);
}
const URL = process.env.FIT_URL || 'http://localhost:8123/index.html';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

async function boot(b, label) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(label + ': ' + e));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  if (await page.isVisible('#obStart')) { await page.click('#obStart'); await page.waitForTimeout(1200); }
  return { page, errs };
}
const screen = p => p.evaluate(() => (document.querySelector('.screen.on') || {}).id);

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const allErrs = [];

  // ---------- ТРЕНЕР ----------
  const T = await boot(b, 'тренер'); allErrs.push(...T.errs);
  const tp = T.page;
  await tp.evaluate(() => goTab('scrAccount'));
  await tp.waitForTimeout(500);
  console.log('карточка «Тренер» видна:', await tp.isVisible('#tglTrainer'));
  console.log('поля скрыты до включения:', !(await tp.isVisible('#coachHandle')));

  await tp.click('#tglTrainer');
  await tp.waitForTimeout(300);
  await tp.fill('#coachHandle', 't.me/lena.doma');
  await tp.evaluate(() => $("coachHandle").blur());
  await tp.waitForTimeout(300);
  console.log('ник приведён к виду:', await tp.inputValue('#coachHandle'));

  // программа тренера
  await tp.evaluate(async () => {
    const r = parseProgramText(`ПРОГРАММА: Сила дома
ДНИ: Пн, Чт
КРУГИ: 3
ОТДЫХ МЕЖДУ КРУГАМИ: 60
ПРОГРЕССИЯ: 4

УПРАЖНЕНИЕ: Приседания
ФОРМАТ: повторения
ЗНАЧЕНИЕ: 12-15
ПОДХОДЫ: 3
ОТДЫХ: 45
УСЛОЖНЯТЬ: да
ШАГ: 1
ПОТОЛОК: 25

УПРАЖНЕНИЕ: Отжимания
ФОРМАТ: повторения
ЗНАЧЕНИЕ: 8
ПОДХОДЫ: 3
ОТДЫХ: 60
УСЛОЖНЯТЬ: да
ШАГ: 1`);
    const prog = r.program || r;
    prog.id = 'tp1';
    customPrograms.push(prog);
    await savePrograms();
  });

  await tp.click('#btnClients');
  await tp.waitForTimeout(500);
  console.log('экран:', await screen(tp));

  await tp.click('#btnAddClient');
  await tp.waitForTimeout(500);
  console.log('экран после «Добавить клиента»:', await screen(tp));
  await tp.fill('#clName', 'Марина');
  await tp.fill('#clNote', 'колено, без прыжков');
  await tp.waitForTimeout(200);

  // отправка: программы у клиента ещё нет — должен открыться выбор программы
  await tp.click('#btnClSend');
  await tp.waitForTimeout(400);
  console.log('попап выбора программы:', await tp.isVisible('#pickClientModal'),
              '|', await tp.textContent('#pickClientModal .mini-label'));
  const link = await tp.evaluate(async () => {
    // navigator.share/clipboard в песочнице недоступны — берём ссылку из того же кода
    let captured = null;
    const orig = navigator.clipboard && navigator.clipboard.writeText;
    navigator.clipboard.writeText = async t => { captured = t; };
    document.querySelectorAll('#pickClientList .choice')[0].click();
    await new Promise(r => setTimeout(r, 600));
    if (orig) navigator.clipboard.writeText = orig;
    return captured;
  });
  await tp.waitForTimeout(500);
  console.log('ссылка получена:', !!link && link.includes('?import=FIT1.'));
  console.log('клиенту записана программа:', await tp.evaluate(() => clients[0].programName + ' · ' + clients[0].sentAt));
  console.log('в ссылке есть ник тренера:', await tp.evaluate(l => {
    const code = decodeURIComponent(l.split('import=')[1]);
    return JSON.parse(decodeURIComponent(escape(atob(code.slice(5))))).by;
  }, link));

  // ---------- КЛИЕНТ ----------
  const C = await boot(b, 'клиент'); allErrs.push(...C.errs);
  const cp = C.page;
  await cp.evaluate(() => { const u = users.find(x => x.id === currentUser); u.name = 'Марина'; });
  await cp.goto(link, { waitUntil: 'load' });
  await cp.waitForTimeout(2200);
  if (await cp.isVisible('#obStart')) { await cp.click('#obStart'); await cp.waitForTimeout(1500); }
  console.log('\nклиент: экран после ссылки:', await screen(cp));

  const got = await cp.evaluate(async () => {
    // сохраняем импортированную программу и подделываем три тренировки по ней
    const u = users.find(x => x.id === currentUser); u.name = 'Марина';
    const p = draft; p.id = 'cp1'; p.stats = {completions: 9};
    customPrograms.push(p); await savePrograms();
    for (let i = 3; i > 0; i--) stats.history.push({d: localISO(new Date(Date.now() - i*86400000)), t: 9, pid: 'cp1', sec: 1500, kcal: 120, plan: 0});
    stats.count = 3; await saveStats();
    state.raw = p; state.planIdx = 0;
    show('scrStart'); buildStartMenu();
    return {by: p.by, chip: !document.getElementById('startByChip').classList.contains('hidden'),
            chipText: document.getElementById('startByName').textContent,
            menu: [...document.querySelectorAll('#startMenu button')].map(b => b.textContent.trim())};
  });
  console.log('программа помечена тренером:', got.by, '| чип:', got.chip, got.chipText);
  console.log('пункт отчёта в меню:', got.menu.some(t => t.includes('отчёт')));

  const report = await cp.evaluate(async () => {
    let captured = null;
    navigator.clipboard.writeText = async t => { captured = t; };
    await sendReport(customPrograms.find(p => p.id === 'cp1'));
    return captured;
  });
  console.log('отчёт собран:', !!report && report.includes('?report=FITR1.'));

  // ---------- ТРЕНЕР ПРИНИМАЕТ ----------
  if (await tp.isVisible('#dlgOk')) { await tp.click('#dlgOk'); await tp.waitForTimeout(300); }
  await tp.evaluate(() => openClients());
  await tp.waitForTimeout(400);
  await tp.fill('#clsReportCode', report);
  await tp.click('#btnTakeReport');
  await tp.waitForTimeout(800);
  console.log('\nтренер: экран после приёма:', await screen(tp));
  console.log('в карточке:', (await tp.textContent('#clReports')).replace(/\s+/g, ' ').trim().slice(0, 160));
  await tp.evaluate(() => openClients());
  await tp.waitForTimeout(400);
  console.log('сводка:', (await tp.textContent('#clsSum')).replace(/\s+/g, ' ').trim());
  console.log('строка списка:', (await tp.textContent('#clsList')).replace(/\s+/g, ' ').trim());

  await tp.screenshot({path: __dirname + '/shot-clients.png'});
  await tp.evaluate(() => openClient(0));
  await tp.waitForTimeout(500);
  await tp.screenshot({path: __dirname + '/shot-client.png'});
  await tp.evaluate(() => goTab('scrAccount'));
  await tp.waitForTimeout(600);
  await tp.screenshot({path: __dirname + '/shot-account.png'});
  await cp.evaluate(() => { state.raw = customPrograms.find(p => p.id === 'cp1'); state.planIdx = 0; show('scrStart'); renderStartInfo(); });
  await cp.waitForTimeout(600);
  await cp.screenshot({path: __dirname + '/shot-client-side.png'});
  console.log('\npageerror:', allErrs.length ? allErrs : 'нет');
  await b.close();
})();
