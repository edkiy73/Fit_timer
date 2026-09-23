/* Действия над программой одинаковы на всех экранах, где она есть.

   Действие, доступное в списке и недоступное на странице программы (или наоборот),
   человек считает сломанным, а не «не предусмотренным здесь». Здесь проверяется,
   что «Дублировать» и «Предложить в каталог» есть в обоих меню, и что копия не
   наследует чужого: статистику, метку каталога, чужую ссылку.

   Запуск:  node tests/dev-server.js 8124
            node tests/program-actions.js */

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

(async () => {
  const b = await chromium.launch({executablePath: CHROME});
  const errs = [];
  const page = await (await b.newContext({viewport: {width: 412, height: 900}, locale: 'ru-RU'})).newPage();
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(2000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(1500); }

  await page.evaluate(async () => {
    trainer = {on: true, handle: '@act.coach', about: '', years: null, links: ''};
    await saveTrainer();
    const r = parseProgramText(`ПРОГРАММА: Проба
ДНИ: Пн
КРУГИ: 2
ОТДЫХ МЕЖДУ КРУГАМИ: 60

УПРАЖНЕНИЕ: Приседания
ФОРМАТ: повторения
ЗНАЧЕНИЕ: 12
ПОДХОДЫ: 3
ОТДЫХ: 45`);
    const p = r.program || r;
    p.id = 'src1';
    p.stats = {completions: 7};
    p.storeId = 'slim-tiho';        // как будто взята из каталога
    p.src = 'abcd1234';             // и пришла от тренера по ссылке
    p.by = '@someone';
    customPrograms.push(p);
    await savePrograms();
  });

  // ---- меню на ЭКРАНЕ ПРОГРАММЫ ----
  const onStart = await page.evaluate(() => {
    const p = customPrograms.find(x => x.id === 'src1');
    state.raw = p; state.planIdx = 0; show('scrStart'); buildStartMenu();
    return [...document.querySelectorAll('#startMenu button')].map(x => x.textContent.trim());
  });
  ok('на экране программы есть «Дублировать»', onStart.some(t => /Дублировать/.test(t)), onStart.join(' | '));

  // ---- меню в СПИСКЕ ----
  const inList = await page.evaluate(async () => {
    // Своя программа, не из каталога: у взятой из каталога предлагать нечего.
    const r = parseProgramText('ПРОГРАММА: Своя\nДНИ: Пн\nКРУГИ: 1\n\nУПРАЖНЕНИЕ: Планка\nФОРМАТ: время\nЗНАЧЕНИЕ: 40\nПОДХОДЫ: 1\nОТДЫХ: 20');
    const own = r.program || r; own.id = 'own1';
    customPrograms.push(own); await savePrograms();
    goTab('scrPrograms');
    renderMine();
    const menus = [...document.querySelectorAll('#mineList .ctx-menu')];
    const last = menus[menus.length - 1];
    return last ? [...last.querySelectorAll('button')].map(x => x.textContent.trim()) : [];
  });
  ok('в списке есть «Дублировать»', inList.some(t => /Дублировать/.test(t)), inList.join(' | '));
  ok('в списке есть «Предложить в каталог»', inList.some(t => /каталог/.test(t)));

  const order = await page.evaluate(() => {
    const p = customPrograms.find(x => x.id === 'own1');
    state.raw = p; state.planIdx = 0; show('scrStart'); buildStartMenu();
    return [...document.querySelectorAll('#startMenu button')].map(x => x.textContent.trim());
  });
  ok('порядок пунктов одинаков в обоих меню',
     order.filter(t => /Дублировать|Поделиться|каталог/.test(t)).join('|')
     === inList.filter(t => /Дублировать|Поделиться|каталог/.test(t)).join('|'),
     order.filter(t => /Дублировать|Поделиться|каталог/.test(t)).join(' | '));

  // у программы ИЗ каталога предлагать нечего — она там уже есть
  const store = await page.evaluate(() => {
    const p = customPrograms.find(x => x.id === 'src1');
    state.raw = p; state.planIdx = 0; show('scrStart'); buildStartMenu();
    return [...document.querySelectorAll('#startMenu button')].map(x => x.textContent.trim());
  });
  ok('у программы из каталога пункта «в каталог» нет', !store.some(t => /каталог/.test(t)));

  // ---- копия ----
  const copy = await page.evaluate(async () => {
    const p = customPrograms.find(x => x.id === 'src1');
    const c = await duplicateProgram(p);
    return {name: c.name, ex: (normPlans(c)[0].exercises || []).length,
            completions: c.stats.completions, storeId: c.storeId, src: c.src, by: c.by,
            sameId: c.id === p.id, total: customPrograms.length};
  });
  ok('копия создана и названа понятно', /копия/.test(copy.name) && !copy.sameId, copy.name);
  ok('упражнения скопированы', copy.ex === 1);
  ok('счётчик пройденного обнулён', copy.completions === 0, String(copy.completions));
  ok('метка каталога не унаследована', copy.storeId === undefined);
  ok('чужая ссылка и тренер не унаследованы', copy.src === undefined && copy.by === undefined);

  // у копии пункт «в каталог» уже есть — она своя
  const copyMenu = await page.evaluate(() => {
    const c = customPrograms[customPrograms.length - 1];
    state.raw = c; state.planIdx = 0; show('scrStart'); buildStartMenu();
    return [...document.querySelectorAll('#startMenu button')].map(x => x.textContent.trim());
  });
  ok('копию уже можно предложить в каталог', copyMenu.some(t => /каталог/.test(t)));

  console.log('\npageerror:', errs.length ? errs : 'нет');
  if(errs.length) bad++;
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
