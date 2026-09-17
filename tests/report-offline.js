/* Запасной путь для ОТЧЁТА: клиент без интернета.

   Программу без сети передать нельзя — ссылка делается только на сервере, и это
   решено сознательно (см. docs/trainer-ui.md). А вот отчёт — другое дело: он
   короткий, помещается в обычную ссылку, и человек, у которого в зале не ловит,
   должен иметь возможность отчитаться. Поэтому путь ссылкой здесь остаётся, и
   его проверяет этот сценарий.

   Запуск:  python3 -m http.server 8123
            node tests/report-offline.js */

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8123';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL_SAFE = 1800;

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

const PROG = `ПРОГРАММА: Сила дома
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
ПОТОЛОК: 25`;

async function boot(b, label, errs){
  const page = await (await b.newContext({viewport: {width: 412, height: 900}})).newPage();
  page.on('pageerror', e => errs.push(label + ': ' + e));
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(2000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(1500); }
  return page;
}

(async () => {
  const b = await chromium.launch({executablePath: CHROME});
  const errs = [];

  // ---- клиент: программа от тренера уже есть, интернета нет ----
  const cp = await boot(b, 'клиент', errs);
  const report = await cp.evaluate(async (txt) => {
    const u = users.find(x => x.id === currentUser); u.name = 'Марина';
    const r = parseProgramText(txt);
    const p = r.program || r;
    p.id = 'cp1'; p.by = '@lena.doma'; p.src = 'abcd1234'; p.stats = {completions: 9};
    customPrograms.push(p); await savePrograms();
    for(let i = 3; i > 0; i--) stats.history.push({d: localISO(new Date(Date.now() - i*86400000)), t: 9, pid: 'cp1', sec: 1500, kcal: 120, plan: 0});
    stats.count = 3; await saveStats();

    let out = null;
    navigator.clipboard.writeText = async t => { out = t; };
    navigator.share = async d => { out = d.url; };
    await sendReport(p);              // сервера нет: уйдёт ссылкой
    return out;
  }, PROG);

  ok('без сети отчёт всё равно уходит', !!report && report.includes('?report=FITR1.'), (report||'').slice(-28));
  ok('ссылка с отчётом короткая', report.length < URL_SAFE, report.length + ' символов');

  // ---- тренер вставляет её у себя ----
  const tp = await boot(b, 'тренер', errs);
  const got = await tp.evaluate(async (rep) => {
    trainer = {on: true, handle: '@lena.doma', links: ''};
    await saveTrainer();
    const c = await addClient();
    c.name = 'Марина'; c.programName = 'Сила дома';
    await saveClients();
    await takeReport(rep);
    return {n: (clients[0].reports || []).length,
            card: document.getElementById('clReports').textContent.replace(/\s+/g, ' ').trim()};
  }, report);

  ok('отчёт лёг в карточку клиента', got.n === 1, got.card.slice(0, 52) + '…');
  ok('рост нагрузки сохранился', /12-15 → 14-17/.test(got.card));

  console.log('\npageerror:', errs.length ? errs : 'нет');
  if(errs.length) bad++;
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
