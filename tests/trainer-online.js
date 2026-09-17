/* Тот же круг «тренер → клиент → отчёт → тренер», но ПО СЕТИ.

   Отличие от trainer-flow.js: там связь держится на копипасте ссылок и проверяется
   запасной путь, здесь — короткая ссылка, автоматический отчёт и отметка «открыл».
   Оба сценария нужны: сервер может быть недоступен, и второй путь обязан работать.

   Запуск:  node tests/dev-server.js 8124
            node tests/trainer-online.js */

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

async function boot(b, label, errs, url){
  const page = await (await b.newContext({viewport: {width: 412, height: 900}})).newPage();
  page.on('pageerror', e => errs.push(label + ': ' + e));
  await page.goto(url || BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(2000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(1500); }
  return page;
}

(async () => {
  const b = await chromium.launch({executablePath: CHROME});
  const errs = [];

  // ---- тренер ----
  const tp = await boot(b, 'тренер', errs);
  await tp.evaluate(async () => {
    trainer = {on: true, handle: '@lena.doma', links: 't.me/lena.doma'};
    await saveTrainer();
    const prog = parseProgramText(`ПРОГРАММА: Сила дома
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
ПОТОЛОК: 25`);
    const p = prog.program || prog; p.id = 'tp1';
    customPrograms.push(p); await savePrograms();
  });

  const link = await tp.evaluate(async () => {
    let captured = null;
    navigator.clipboard.writeText = async t => { captured = t; };
    const c = await addClient();
    c.name = 'Марина';
    c.programId = 'tp1'; c.programName = 'Сила дома';
    await saveClients();
    clientIdx = clients.indexOf(c);
    await sendProgramToClient(c);
    return captured;
  });
  ok('ссылка короткая, а не с программой внутри', !!link && /\?p=[0-9a-z]{8}$/.test(link), link && link.slice(-14));
  ok('ключ остался у тренера и не в ссылке',
     await tp.evaluate(() => !!(clients[0].link && clients[0].link.key)) && !/key=/.test(link || ''));

  // ---- клиент ----
  const cp = await boot(b, 'клиент', errs, link);
  await cp.waitForTimeout(1200);
  ok('клиент попал в проверку программы', (await cp.evaluate(() => (document.querySelector('.screen.on')||{}).id)) === 'scrBuilder');

  const seen = await cp.evaluate(async () => {
    const u = users.find(x => x.id === currentUser); u.name = 'Марина';
    const p = draft; p.id = 'cp1'; p.stats = {completions: 9};
    customPrograms.push(p); await savePrograms();
    for(let i = 3; i > 0; i--) stats.history.push({d: localISO(new Date(Date.now() - i*86400000)), t: 9, pid: 'cp1', sec: 1500, kcal: 120, plan: 0});
    stats.count = 3; await saveStats();
    return {by: p.by, src: p.src};
  });
  ok('программа помечена тренером', seen.by === '@lena.doma', seen.by);
  ok('в программе есть метка ссылки', !!seen.src, seen.src);

  const sent = await cp.evaluate(async () => {
    let dialog = null;
    const p = customPrograms.find(x => x.id === 'cp1');
    await sendReport(p);
    dialog = document.getElementById('dlgMsg').textContent;
    return dialog;
  });
  ok('отчёт ушёл по сети, без копипаста', /Отправлено/.test(sent), sent.slice(0, 40));

  // ---- тренер смотрит ----
  await tp.evaluate(() => openClient(0));
  await tp.waitForTimeout(1500);
  const card = await tp.evaluate(() => ({
    sub: document.getElementById('clSentSub').textContent,
    rep: document.getElementById('clReports').textContent.replace(/\s+/g, ' ').trim(),
    opens: clients[0].opens, n: (clients[0].reports || []).length
  }));
  ok('видно, что клиент открыл ссылку', card.opens > 0 && /открыл/.test(card.sub), card.sub);
  ok('отчёт приехал сам', card.n === 1 && /3 тренировки/.test(card.rep), card.rep.slice(0, 60));
  ok('рост нагрузки в отчёте', /12-15 → 14-17/.test(card.rep));

  // повторное открытие карточки не должно задваивать отчёты
  await tp.evaluate(() => openClient(0));
  await tp.waitForTimeout(1200);
  ok('повторный заход не задваивает отчёты', (await tp.evaluate(() => clients[0].reports.length)) === 1);

  await tp.screenshot({path: __dirname + '/shot-online-client.png'});
  console.log('\npageerror:', errs.length ? errs : 'нет');
  if(errs.length) bad++;
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
