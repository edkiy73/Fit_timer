/* Ссылка не должна упираться в предел длины адреса.

   Живая поломка: ссылка ?import=FIT1.<программа в base64> на длинной программе
   отбивалась хостингом (URI_TOO_LONG) ещё на границе — получатель видел ошибку
   вместо тренировки. Проверяем, что приложение больше не выдаёт таких адресов
   НИ ПРИ КАКОМ размере программы и ни при каком состоянии сервера.

   Запуск:  node tests/dev-server.js 8124   (сервер есть)
            python3 -m http.server 8123     (сервера нет)
            node tests/link-length.js */

const { becomeTrainer } = require('./helpers/trainer-account');

const { installV2Fixtures } = require('./helpers/v2-fixtures');
let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const WITH_API = process.env.FIT_API_URL || 'http://localhost:8124';
const NO_API   = process.env.FIT_URL     || 'http://localhost:8123';
const CHROME   = process.env.FIT_CHROME  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL_SAFE = 1800;

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

// Программа такого размера, какую реально собирает тренер: десять упражнений
// с описаниями, ошибками, мышцами, прогрессией и вторым этапом (усложнённый вариант).
const DESC = 'Встань ровно, стопы на ширине таза, носки чуть в стороны. Уходи тазом назад и вниз, колени идут по направлению носков, спина прямая, взгляд вперёд. Из нижней точки поднимись усилием ягодиц, в верхней не переразгибай поясницу. Опускайся медленно, вниз на два счёта, вверх на один.';
const STAGE_DESC = 'То же движение, но из нижней точки мягко выталкивайся вверх, отрывая пятки от пола. Приземляйся беззвучно, сначала на носок, потом опускай пятку.';
const MISTAKES = 'Колени заваливаются внутрь — разводи их в стороны усилием ягодиц, а не доворотом стопы.';

const NICK = '@lena.' + Math.random().toString(36).slice(2, 8);

// withTrainer — тренер существует только внутри аккаунта, а вход требует сервера.
async function boot(b, url, errs, withTrainer){
  const page = await (await b.newContext({viewport: {width: 412, height: 900}, locale: 'ru-RU'})).newPage();
  await installV2Fixtures(page);
  page.on('pageerror', e => errs.push(e + ''));
  await page.goto(url + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(2000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(1500); }
  if(withTrainer) await becomeTrainer(page, {handle: NICK, trainer: {links: ''}});
  await page.evaluate(async ({DESC, STAGE_DESC, MISTAKES}) => {
    const exercises = Array.from({length: 10}, (_, i) => v2ex('Упражнение номер ' + (i + 1), {
      desc: DESC, mistakes: MISTAKES, muscles: ['gl', 'le', 'ca'],
      type: 'reps', value: '10-12', sets: 4, rest: 60,
      prog: {mode: 'reps', every: 3, reps: {step: 1, max: 20}},
      stages: [{name: 'Упражнение номер ' + (i + 1) + ', усложнённый вариант', desc: STAGE_DESC,
                type: 'reps', value: '10-12', sets: 4, rest: 60}]
    }));
    const p = {id: 'big', name: 'Силовая база', days: ['Пн', 'Чт'],
               plans: [v2plan('p1', exercises, {days: ['Пн', 'Чт'], rounds: 4, roundRest: 90})]};
    await kvSet(pk('customPrograms'), JSON.stringify([...customPrograms, p]));
    await loadData();
    await savePrograms();
  }, {DESC, STAGE_DESC, MISTAKES});
  return page;
}

// Что приложение положило в буфер или отдало в «Поделиться»
async function capture(page, fn){
  return page.evaluate(async (src) => {
    let out = null;
    navigator.clipboard.writeText = async t => { out = {kind: 'clipboard', text: t}; };
    navigator.share = async d => { out = {kind: 'share', text: d.url || d.text}; };
    await eval(src);
    return {out, dlg: (document.getElementById('dlgMsg') || {}).textContent || ''};
  }, fn);
}

(async () => {
  const b = await chromium.launch({executablePath: CHROME});
  const errs = [];

  const size = await (async () => {
    const page = await boot(b, NO_API, errs);
    const n = await page.evaluate(() => btoa(unescape(encodeURIComponent(
      JSON.stringify(programPayload(customPrograms.find(p => p.id === 'big')))))).length);
    // ---- сервера нет ----
    const r = await capture(page, `exportProgram(customPrograms.find(p => p.id === 'big'))`);
    const text = (r.out && r.out.text) || '';
    ok('без сервера ничего не отдаётся', !text, text ? text.slice(0, 48) : '(пусто)');
    ok('человеку объяснили, почему', /ссылк/i.test(r.dlg), r.dlg.slice(0, 50) + '…');
    ok('и подсказали файл', /файл/i.test(r.dlg));
    await page.close();
    return n;
  })();
  console.log(`      (программа в base64: ${size} символов — в адрес она не помещается)`);

  // ---- сервер есть ----
  const page = await boot(b, WITH_API, errs, true);
  const r = await capture(page, `exportProgram(customPrograms.find(p => p.id === 'big'))`);
  const url = (r.out && r.out.text) || '';
  ok('с сервером выдаётся App Link', /^https?:\/\/.+\/p\/[0-9a-z]{4,16}$/.test(url), url.slice(-24));
  ok('адрес короткий', url.length < URL_SAFE, url.length + ' символов');
  ok('программа в адрес не попала', !/FIT1\./.test(url));

  // ссылка действительно открывается и приносит ту же программу
  const back = await page.evaluate(async (u) => {
    const id = new URL(u).pathname.split('/').filter(Boolean).pop();
    const d = await apiFetch('/api/p/' + id);
    return {name: d.program.name, ex: (d.program.plans[0].exercises || []).length, by: d.by};
  }, url);
  ok('по адресу приходит та же программа', back.name === 'Силовая база' && back.ex === 10, `${back.name}, ${back.ex} упр.`);
  ok('ник тренера доехал', back.by === NICK, back.by);

  console.log('\npageerror:', errs.length ? errs : 'нет');
  if(errs.length) bad++;
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
