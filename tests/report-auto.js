/* Отчёт уходит САМ, после каждой законченной тренировки.

   Живая поломка: кнопка «Отправить отчёт тренеру» лежала в меню программы, куда
   после финала никто не заходит, — и отчёты не уходили никогда. Теперь кнопки нет
   вовсе, отправка происходит в finishWorkout. Этот сценарий проверяет именно её,
   а не наличие кнопки.

   Запуск:  node tests/dev-server.js 8124
            node tests/report-auto.js */

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
КРУГИ: 1
ОТДЫХ МЕЖДУ КРУГАМИ: 10
ПРОГРЕССИЯ: 1

УПРАЖНЕНИЕ: Приседания
ФОРМАТ: повторения
ЗНАЧЕНИЕ: 12-15
ПОДХОДЫ: 1
ОТДЫХ: 5
УСЛОЖНЯТЬ: да
ШАГ: 1`;

async function boot(b, label, errs, url){
  const page = await (await b.newContext({viewport: {width: 412, height: 900}, locale: 'ru-RU'})).newPage();
  page.on('pageerror', e => errs.push(label + ': ' + e));
  await page.goto(url || BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(2000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(1500); }
  return page;
}

(async () => {
  const b = await chromium.launch({executablePath: CHROME});
  const errs = [];

  // ---- тренер отправляет ----
  const tp = await boot(b, 'тренер', errs);
  const link = await tp.evaluate(async (txt) => {
    trainer = {on: true, handle: '@lena.doma', links: ''}; await saveTrainer();
    const r = parseProgramText(txt);
    const p = r.program || r; p.id = 'tp1';
    customPrograms.push(p); await savePrograms();
    let out = null;
    navigator.clipboard.writeText = async t => { out = t; };
    navigator.share = async d => { out = d.url; };
    const c = await addClient(); c.name = 'Марина';
    await saveClients(); clientIdx = clients.indexOf(c);
    await sendProgramToClient(c, customPrograms.find(x => x.id === 'tp1'));
    return out;
  }, PROG);

  ok('ключ тренера остался у него и не попал в ссылку',
     await tp.evaluate(() => !!(clients[0].progs[0].link && clients[0].progs[0].link.key)) && !/key=/.test(link || ''));

  // ---- клиент принимает: его предупреждают ДО, а не после ----
  const cp = await boot(b, 'клиент', errs, link);
  await cp.waitForTimeout(1300);
  const warn = await cp.evaluate(() => (document.getElementById('dlgMsg') || {}).textContent || '');
  ok('клиента предупредили, что тренер видит занятия', /тренер/i.test(warn) && /видеть/i.test(warn), warn.slice(0, 56) + '…');
  ok('и сказали, чего он НЕ видит', /ни вес|ни фото/.test(warn));
  if(await cp.isVisible('#dlgOk')){ await cp.click('#dlgOk'); await cp.waitForTimeout(400); }

  // сохраняем программу настоящей кнопкой — метки тренера должны пережить сохранение
  await cp.evaluate(() => { const u = users.find(x => x.id === currentUser); u.name = 'Марина'; });
  await cp.click('#btnSaveProgram');
  await cp.waitForTimeout(1200);
  if(await cp.isVisible('#dlgOk')){ await cp.click('#dlgOk'); await cp.waitForTimeout(400); }

  const saved = await cp.evaluate(() => {
    const p = customPrograms.find(x => x.name === 'Сила дома');
    return {by: p && p.by, src: p && p.src};
  });
  ok('метка тренера пережила сохранение', !!saved.by && !!saved.src, `${saved.by} / ${saved.src}`);

  const menu = await cp.evaluate(() => {
    const p = customPrograms.find(x => x.name === 'Сила дома');
    state.raw = p; state.planIdx = 0; show('scrStart'); buildStartMenu();
    return [...document.querySelectorAll('#startMenu button')].map(x => x.textContent.trim());
  });
  ok('кнопки «отправить отчёт» больше нет', !menu.some(t => /отчёт/i.test(t)), menu.join(' | '));

  // ---- тренировка целиком, через настоящий финал ----
  await cp.evaluate(async () => {
    const p = customPrograms.find(x => x.name === 'Сила дома');
    stats.history.push({d: localISO(new Date()), t: 9, pid: p.id, sec: 900, kcal: 90, plan: 0});
    stats.count = 1; await saveStats();
    p.stats = {completions: 0};
    // финал — единственное место, откуда теперь уходит отчёт
    state.current = {sourceId: p.id};
    state.raw = p; state.planIdx = 0;
    await finishWorkout();
  });
  await cp.waitForTimeout(1800);

  // ---- тренер смотрит: отчёт должен быть уже там ----
  await tp.evaluate(() => openClient(0));
  await tp.waitForTimeout(1800);
  const card = await tp.evaluate(() => ({
    n: (clients[0].progs[0].reports || []).length,
    txt: document.getElementById('clProgs').textContent.replace(/\s+/g, ' ').trim()
  }));
  ok('отчёт доехал сам, без единого нажатия', card.n >= 1, card.txt.slice(0, 56) + '…');
  ok('видно, что клиент открыл ссылку', await tp.evaluate(() => clients[0].progs[0].opens > 0));

  // сервер — источник правды: повторный заход не должен задваивать отчёты
  const was = await tp.evaluate(() => clients[0].progs[0].reports.length);
  await tp.evaluate(() => openClient(0));
  await tp.waitForTimeout(1200);
  ok('повторный заход не задваивает отчёты',
     (await tp.evaluate(() => clients[0].progs[0].reports.length)) === was, was + '');

  console.log('\npageerror:', errs.length ? errs : 'нет');
  if(errs.length) bad++;
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
