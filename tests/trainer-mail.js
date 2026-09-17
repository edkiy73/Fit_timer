/* Почта тренера и удаление страницы.

   Проверяем то, ради чего почта заведена: человек переставил приложение, ключа
   правки у него больше нет, ник занят им же — и по коду с почты страница
   возвращается вместе с полями. И второе: «удалить страницу» действительно
   стирает её на СЕРВЕРЕ, а не только прячет на телефоне.

   Запуск:  node tests/dev-server.js 8124
            node tests/trainer-mail.js */

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
ОТДЫХ: 5

УПРАЖНЕНИЕ: Отжимания
ФОРМАТ: повторения
ЗНАЧЕНИЕ: 10
ПОДХОДЫ: 1
ОТДЫХ: 5

УПРАЖНЕНИЕ: Планка
ФОРМАТ: время
ЗНАЧЕНИЕ: 30
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
  const NICK = '@lena.' + Math.random().toString(36).slice(2, 8);
  const MAIL = 'lena.' + Math.random().toString(36).slice(2, 8) + '@example.com';

  /* ---- телефон первый: тренер завёл страницу и привязал почту ---- */
  const one = await boot(b, 'телефон 1', errs);
  await one.evaluate(async ({txt, nick}) => {
    trainer = {on: true, handle: nick, name: 'Лена', about: 'Домашний фитнес, только коврик.',
               years: 8, links: 't.me/' + nick.slice(1)};
    await saveTrainer();
    const r = parseProgramText(txt);
    const p = r.program || r; p.id = 'm1';
    customPrograms.push(p); await savePrograms();
    navigator.clipboard.writeText = async () => {};
    navigator.share = async () => {};
    const c = await addClient(); c.name = 'Марина';
    await saveClients(); clientIdx = clients.indexOf(c);
    await sendProgramToClient(c, customPrograms.find(x => x.id === 'm1'));
  }, {txt: PROG, nick: NICK});
  const key1 = await one.evaluate(() => trainer.key || '');
  ok('ник закреплён за первым телефоном', !!key1, key1.slice(0, 6) + '…');

  const linkId = await one.evaluate(() => (clients[0].progs[0].link || {}).id || '');
  ok('ссылка подопечному создана', !!linkId, linkId);

  // Заявка в каталог — чтобы проверить, что удаление уносит и её.
  const sub = await one.evaluate(async () => {
    const p = customPrograms.find(x => x.id === 'm1');
    return await apiPost('/api/catalog/submit', {
      by: normHandle(trainer.handle), trainerKey: trainer.key,
      item: {name: p.name, gives: 'Короткая программа на каждый день без инвентаря.',
             cat: 'tone', level: 'Новичок', min: 20, exCount: 3, text: programToText(p)}
    });
  });
  ok('заявка в каталог ушла', sub.status === 'pending', sub.status);

  const bind = await one.evaluate(async (email) => {
    const s = await apiPost('/api/auth', {action: 'send', email});
    const v = await apiPost('/api/auth', {action: 'verify', email, code: s.devCode,
                                          handle: normHandle(trainer.handle), trainerKey: trainer.key});
    return {s, v};
  }, MAIL);
  ok('код пришёл', !!bind.s.devCode);
  ok('почта привязана к своему нику', bind.v.linked === true && bind.v.handle === NICK, bind.v.handle);
  ok('ключ при этом НЕ менялся', !bind.v.trainerKey);

  /* ---- телефон второй: пусто, но почта та же ---- */
  const two = await boot(b, 'телефон 2', errs);
  const back = await two.evaluate(async (email) => {
    const s = await apiPost('/api/auth', {action: 'send', email});
    return await apiPost('/api/auth', {action: 'verify', email, code: s.devCode,
                                       handle: '', trainerKey: ''});
  }, MAIL);
  ok('страница вернулась на новый телефон', back.restored === true && back.handle === NICK, back.handle);
  ok('выдан новый ключ', !!back.trainerKey && back.trainerKey !== key1);
  ok('поля приехали вместе с ником',
     back.trainer && back.trainer.name === 'Лена' && back.trainer.years === 8,
     `${back.trainer && back.trainer.name}, стаж ${back.trainer && back.trainer.years}`);

  const old = await one.evaluate(async () => {
    try{
      await apiPost('/api/profile', {handle: normHandle(trainer.handle),
                                     trainer: trainerProfile(), trainerKey: trainer.key});
      return 'прошло';
    }catch(e){ return e.code || String(e); }
  });
  ok('прежний ключ перестал работать', old === 'handle_taken', old);

  const wrong = await two.evaluate(async (email) => {
    const s = await apiPost('/api/auth', {action: 'send', email});
    try{ await apiPost('/api/auth', {action: 'verify', email, code: '000000'}); return 'прошло'; }
    catch(e){ return e.code; }
  }, MAIL);
  ok('чужой код не пускает', wrong === 'bad_code' || wrong === 'code_expired', wrong);

  /* ---- удаление страницы ---- */
  await two.evaluate(async (r) => {
    trainer = {on: true, handle: r.handle, key: r.trainerKey, name: r.trainer.name,
               about: r.trainer.about, years: r.trainer.years, links: r.trainer.links,
               email: r.email};
    await saveTrainer();
    clients = [{id: 'c1', name: 'Марина', progs: [{pid: null, name: 'Сила дома',
                link: {id: r.linkId, key: 'неважно'}, reports: []}]}];
    await saveClients();
  }, Object.assign({}, back, {email: MAIL, linkId}));

  const gone = await two.evaluate(async () => {
    await forgetTrainer();
    const out = {};
    try{ await apiFetch('/api/trainer/' + encodeURIComponent(trainer.handle)); out.page = 'есть'; }
    catch(e){ out.page = e.code; }
    try{ await apiFetch('/api/p/' + encodeURIComponent(clients[0].progs[0].link.id)); out.link = 'есть'; }
    catch(e){ out.link = e.code; }
    const cat = await apiFetch('/api/catalog');
    out.mine = cat.items.filter(x => x.by === trainer.handle).length;
    return out;
  });
  ok('страница тренера стёрта', gone.page === 'not_found', gone.page);
  ok('отправленная ссылка стёрта', gone.link === 'not_found', gone.link);
  ok('заявки в каталоге больше нет', gone.mine === 0, gone.mine);

  const retake = await two.evaluate(async () => {
    try{
      await apiPost('/api/profile', {handle: trainer.handle,
                                     trainer: {name: 'Самозванец'}, trainerKey: ''});
      return 'прошло';
    }catch(e){ return e.code; }
  });
  ok('ник не достаётся никому другому', retake === 'handle_taken', retake);

  const relogin = await two.evaluate(async (email) => {
    const s = await apiPost('/api/auth', {action: 'send', email});
    try{ await apiPost('/api/auth', {action: 'verify', email, code: s.devCode}); return 'прошло'; }
    catch(e){ return e.code; }
  }, MAIL);
  ok('по стёртой почте не войти', relogin === 'no_handle' || relogin === 'not_found', relogin);

  /* ---- то же самое руками, через попап ---- */
  const NICK2 = '@olga.' + Math.random().toString(36).slice(2, 8);
  const MAIL2 = 'olga.' + Math.random().toString(36).slice(2, 8) + '@example.com';
  const three = await boot(b, 'телефон 3', errs);
  await three.evaluate(async (nick) => {
    trainer = {on: true, handle: nick, name: 'Оля', about: 'Пилатес дома', years: 5};
    await saveTrainer();
    await pushProfile();
  }, NICK2);

  await three.evaluate(()=> goTab('scrAccount'));
  await three.waitForTimeout(500);
  await three.evaluate(()=> switchMoreTab('coach'));
  await three.waitForTimeout(300);
  ok('строка почты видна в табе «Тренер»', await three.isVisible('#btnCoachMail'));

  await three.click('#btnCoachMail');
  await three.waitForTimeout(400);
  ok('попап открылся на первом шаге',
     await three.isVisible('#mailAddr') && !(await three.isVisible('#mailCode')));

  await three.fill('#mailAddr', 'не почта');
  await three.click('#mailGo');
  await three.waitForTimeout(400);
  ok('кривой адрес не отправляется',
     /опечатка/.test(await three.textContent('#mailErr')), await three.textContent('#mailErr'));

  await three.fill('#mailAddr', MAIL2);
  await three.click('#mailGo');
  await three.waitForTimeout(700);
  ok('второй шаг — код', await three.isVisible('#mailCode'));
  ok('кнопка сменила подпись', (await three.textContent('#mailGo')) === 'Войти',
     await three.textContent('#mailGo'));

  await three.click('#mailGo');
  await three.waitForTimeout(900);
  if(await three.isVisible('#dlgOk')){ await three.click('#dlgOk'); await three.waitForTimeout(400); }
  const bound2 = await three.evaluate(()=> trainer.email || '');
  ok('почта записалась в тренера', bound2 === MAIL2, bound2);
  ok('попап закрылся', !(await three.isVisible('#mailCode')));
  ok('подпись строки стала адресом',
     (await three.textContent('#coachMailSub')) === MAIL2, await three.textContent('#coachMailSub'));

  console.log('\npageerror: ' + (errs.length ? errs.join(' | ') : 'нет'));
  if(errs.length) bad += errs.length;
  await b.close();
  console.log(bad ? 'ПРОВАЛЕНО: ' + bad : 'всё сошлось');
  process.exit(bad ? 1 : 0);
})();
