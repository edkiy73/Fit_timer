/* Обратная связь тренеру: отметка «открыл», отчёты, страница тренера — и главное,
   ВИДИМОСТЬ ОТКАЗОВ.

   Живая беда: у тренера пусто, и нельзя понять почему — сети нет, ссылка старая,
   база не настроена или клиент просто ещё не занимался. Раньше все четыре случая
   выглядели одинаково: пустая карточка. Этот сценарий проверяет, что каждый из них
   называет себя.

   Запуск:  node tests/dev-server.js 8124
            node tests/trainer-feedback.js */

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

const PROG = `ПРОГРАММА: Сила дома
ДНИ: Пн
КРУГИ: 1
ОТДЫХ МЕЖДУ КРУГАМИ: 10
ПРОГРЕССИЯ: 1

УПРАЖНЕНИЕ: Приседания
ФОРМАТ: повторения
ЗНАЧЕНИЕ: 12
ПОДХОДЫ: 1
ОТДЫХ: 5`;

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
  const NICK = '@coach.' + Math.random().toString(36).slice(2, 8);

  const tp = await boot(b, 'тренер', errs);

  // ---- профиль уезжает при ПРАВКЕ, до всякой отправки программы ----
  await tp.evaluate(async (nick) => {
    const me = users.find(u => u.id === currentUser); me.name = 'Лена';
    trainer = {on: true, handle: nick, links: '', about: '', years: null};
    await saveTrainer();
  }, NICK);
  await tp.evaluate(() => goTab('scrAccount'));
  await tp.waitForTimeout(600);
  await tp.fill('#coachAbout', 'Домашний фитнес, только коврик.');
  await tp.fill('#coachYears', '8');
  await tp.fill('#coachLinks', 't.me/coach');
  await tp.waitForTimeout(2200);   // отправка профиля идёт с задержкой

  const prof = await tp.evaluate(async (nick) => {
    try{ return await apiFetch('/api/trainer/' + encodeURIComponent(nick)); }
    catch(e){ return {error: e.code || String(e)}; }
  }, NICK);
  ok('страница тренера заполняется без отправки программы',
     prof.about === 'Домашний фитнес, только коврик.' && prof.years === 8,
     `${prof.about || prof.error} / стаж ${prof.years}`);
  ok('ключ на ник получен', await tp.evaluate(() => !!trainer.key));

  // ---- клиент со старой ссылкой: говорим прямо, что отметок не будет ----
  const staleMsg = await tp.evaluate(async () => {
    const c = await addClient();
    c.name = 'Старый';
    // так выглядит запись, сделанная прежней версией: ссылки нет
    c.progs = [{pid: null, name: 'Что-то', sentAt: '2026-09-01', link: null, reports: []}];
    await saveClients();
    openClient(clients.indexOf(c));
    return document.getElementById('clProgs').textContent;
  });
  ok('про старую ссылку сказано прямо', /старой версией/.test(staleMsg), staleMsg.slice(0, 48) + '…');

  // ---- живой круг ----
  const link = await tp.evaluate(async (txt) => {
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

  const cp = await boot(b, 'клиент', errs, link);
  await cp.waitForTimeout(1300);
  if(await cp.isVisible('#dlgOk')){ await cp.click('#dlgOk'); await cp.waitForTimeout(400); }
  await cp.click('#btnSaveProgram');
  await cp.waitForTimeout(1200);
  if(await cp.isVisible('#dlgOk')){ await cp.click('#dlgOk'); await cp.waitForTimeout(400); }

  // клиент смотрит страницу тренера — она должна быть заполнена
  await cp.evaluate(() => {
    const p = customPrograms.find(x => x.name === 'Сила дома');
    state.raw = p; state.planIdx = 0; show('scrStart'); renderStartInfo();
  });
  await cp.waitForTimeout(400);
  await cp.click('#startByChip');
  await cp.waitForTimeout(1600);
  const seen = await cp.evaluate(() => ({
    about: document.getElementById('tpAbout').textContent,
    cells: [...document.querySelectorAll('.tp-stat')].map(e => e.textContent.replace(/\s+/g,' ').trim())
  }));
  ok('клиент видит данные о тренере', /коврик/.test(seen.about) && seen.cells.some(c => /стажа/.test(c)),
     seen.cells.join(' | ') || '(пусто)');

  // клиент занимается
  await cp.evaluate(async () => {
    const p = customPrograms.find(x => x.name === 'Сила дома');
    stats.history.push({d: localISO(new Date()), t: 9, pid: p.id, sec: 900, kcal: 90, plan: 0});
    stats.count = 1; await saveStats();
    state.current = {sourceId: p.id}; state.raw = p; state.planIdx = 0;
    await finishWorkout();
  });
  await cp.waitForTimeout(1800);

  // ---- СПИСОК тренера обновляется сам, без захода в карточку ----
  await tp.evaluate(() => openClients());
  await tp.waitForTimeout(2000);
  const row = await tp.evaluate(() => {
    const c = clients.find(x => x.name === 'Марина');
    const pr = c.progs[0];
    return {opens: pr.opens, reports: (pr.reports || []).length, err: pr.err,
            list: document.getElementById('clsList').textContent.replace(/\s+/g,' ').trim()};
  });
  ok('список обновился сам, без захода в карточку', row.opens > 0 && row.reports > 0,
     `открытий ${row.opens}, отчётов ${row.reports}`);
  ok('ошибок не записано', !row.err, row.err || '—');
  ok('в строке видно занятия', /занятие|занятия|занятий/.test(row.list), row.list.slice(0, 60));

  console.log('\npageerror:', errs.length ? errs : 'нет');
  if(errs.length) bad++;
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
