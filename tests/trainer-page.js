/* Страница тренера глазами клиента.

   Раньше это был попап с одним абзацем. Проверяем, что теперь клиент, получивший
   программу по ссылке, попадает на страницу и видит на ней то, что помогает решить
   «стоит ли доверять»: стаж, сколько программ, сколько раз их брали, где найти.
   И отдельно — что пустые поля не рисуются: выдуманное «стаж не указан» доверия
   не прибавляет.

   Запуск:  node tests/dev-server.js 8124
            node tests/trainer-page.js */

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
const stats = page => page.evaluate(() => [...document.querySelectorAll('#tpStat, .tp-stat')]
  .map(e => e.textContent.replace(/\s+/g, ' ').trim()));

(async () => {
  const b = await chromium.launch({executablePath: CHROME});
  const errs = [];
  // Ник закрепляется за первым, кто им воспользовался, — значит, повторный прогон
  // на том же нике проверял бы не то. Берём свой на каждый запуск.
  const NICK = '@lena.' + Math.random().toString(36).slice(2, 8);

  // ---- тренер заполняет о себе и отправляет программу ----
  const tp = await boot(b, 'тренер', errs);
  const link = await tp.evaluate(async ({txt, nick}) => {
    const me = users.find(u => u.id === currentUser);
    me.name = 'Лена';
    trainer = {on: true, handle: nick, links: 't.me/' + nick.slice(1),
               about: 'Тренер по домашнему фитнесу. Веду тех, у кого дома только коврик.', years: 8};
    await saveTrainer();
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
  }, {txt: PROG, nick: NICK});
  ok('профиль тренера закрепился за ником',
     await tp.evaluate(() => !!trainer.key), await tp.evaluate(() => (trainer.key||'').slice(0,6) + '…'));

  // ---- клиент открывает ссылку и заходит на страницу тренера ----
  const cp = await boot(b, 'клиент', errs, link);
  await cp.waitForTimeout(1300);
  if(await cp.isVisible('#dlgOk')){ await cp.click('#dlgOk'); await cp.waitForTimeout(400); }
  await cp.click('#btnSaveProgram');
  await cp.waitForTimeout(1200);
  if(await cp.isVisible('#dlgOk')){ await cp.click('#dlgOk'); await cp.waitForTimeout(400); }

  await cp.evaluate(() => {
    const p = customPrograms.find(x => x.name === 'Сила дома');
    state.raw = p; state.planIdx = 0; show('scrStart'); renderStartInfo();
  });
  await cp.waitForTimeout(500);
  ok('ник тренера виден на экране программы', await cp.isVisible('#startByChip'));

  await cp.click('#startByChip');
  await cp.waitForTimeout(1600);
  const scr = await cp.evaluate(() => (document.querySelector('.screen.on') || {}).id);
  ok('по нику открывается страница, а не попап', scr === 'scrTrainerPage', scr);

  const page = await cp.evaluate(() => ({
    name: document.getElementById('tpName').textContent,
    nick: document.getElementById('tpNick').textContent,
    about: document.getElementById('tpAbout').textContent,
    link: document.getElementById('tpLinkTxt').textContent,
    linkShown: !document.getElementById('tpLinkCard').classList.contains('hidden'),
    cells: [...document.querySelectorAll('.tp-stat')].map(e => e.textContent.replace(/\s+/g, ' ').trim())
  }));
  ok('имя и ник', page.name === 'Лена' && page.nick === NICK, `${page.name} ${page.nick}`);
  ok('о себе', /коврик/.test(page.about), page.about.slice(0, 40) + '…');
  ok('стаж', page.cells.some(c => /8/.test(c) && /лет стажа/.test(c)), page.cells.join(' | '));
  ok('сколько программ', page.cells.some(c => /программа|программы|программ/.test(c)));
  ok('сколько раз брали', page.cells.some(c => /взял/.test(c)));
  ok('сколько с нами', page.cells.some(c => /с нами/.test(c)));
  ok('ссылка на себя', page.linkShown && page.link === 't.me/' + NICK.slice(1), page.link);

  // Аккаунтов нет, и единственная защита ника — «кто первый, того и ник».
  // Без неё чужой человек переписал бы страницу, просто назвавшись так же.
  const hijack = await tp.evaluate(async (nick) => {
    await apiPost('/api/share', {
      program: {name: 'Чужая', plans: [{days: ['Пн'], exercises: [{name: 'x'}]}]},
      by: nick, trainerKey: 'подобранный-ключ',
      trainer: {name: 'Самозванец', about: 'я тут главный', years: 99, links: 't.me/bad'}
    });
    return await apiFetch('/api/trainer/' + encodeURIComponent(nick));
  }, NICK);
  ok('чужой не перепишет страницу тренера', hijack.name === 'Лена' && hijack.years === 8,
     `${hijack.name}, стаж ${hijack.years}`);

  await cp.screenshot({path: __dirname + '/shot-trainer-page.png'});

  // ---- пустой профиль: пустых полей быть не должно ----
  const empty = await cp.evaluate(() => {
    fillTrainerPage('@ghost', {});
    return {
      about: !document.getElementById('tpAbout').classList.contains('hidden'),
      stats: !document.getElementById('tpStatsCard').classList.contains('hidden'),
      link: !document.getElementById('tpLinkCard').classList.contains('hidden'),
      name: document.getElementById('tpName').textContent
    };
  });
  ok('у пустого профиля не рисуются пустые блоки', !empty.about && !empty.stats && !empty.link);
  ok('но имя всё равно есть', empty.name === 'ghost', empty.name);

  console.log('\npageerror:', errs.length ? errs : 'нет');
  if(errs.length) bad++;
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
