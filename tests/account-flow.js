/* Аккаунт по почте и два объёма удаления.

   Аккаунт один, и ник тренера принадлежит ему: проверяем, что он привязывается
   при входе, возвращается на пустом телефоне вместе с полями страницы и что
   прежний ключ при переезде перестаёт работать.

   И главное про удаление — что оно НЕ трогает каталог. «Убрать данные о себе»
   очищает страницу и оставляет ник и программы; удаление аккаунта уносит ещё
   аккаунт и ссылки подопечным, но программы в каталоге остаются и там.

   Запуск:  node tests/dev-server.js 8124
            node tests/account-flow.js */

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const ADMIN = process.env.ADMIN_KEY || 'testadminkey123456';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

// Название своё на каждый прогон: хранилище между запусками не чистится, а
// одобренная программа остаётся в каталоге — два прогона давали в нём двойника.
const PNAME = 'Сила дома ' + Math.random().toString(36).slice(2, 6);
const PROG = `ПРОГРАММА: ${PNAME}
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
    return await apiPost('/api/catalog', {
      by: normHandle(trainer.handle), trainerKey: trainer.key,
      item: {name: p.name, gives: 'Короткая программа на каждый день без инвентаря.',
             cat: 'tone', level: 'Новичок', min: 20, exCount: 3, text: programToText(p)}
    });
  });
  ok('заявка в каталог ушла', sub.status === 'pending', sub.status);

  // Берём её в каталог: удаление проверяем на том, что в каталоге УЖЕ лежит, —
  // на заявке, которую никто не взял, доказывать нечего.
  await fetch(BASE + '/api/admin', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'X-Admin-Key': encodeURIComponent(ADMIN)},
    body: JSON.stringify({action: 'approve', id: sub.id})
  });
  const live = await fetch(BASE + '/api/catalog').then(r => r.json());
  ok('и лежит в каталоге', (live.items || []).some(x => x.id === sub.id));

  const bind = await one.evaluate(async (email) => {
    const s = await apiPost('/api/auth', {action: 'send', email});
    const v = await apiPost('/api/auth', {action: 'verify', email, code: s.devCode,
                                          handle: normHandle(trainer.handle), trainerKey: trainer.key});
    return {s, v};
  }, MAIL);
  ok('код пришёл', !!bind.s.devCode);
  ok('аккаунт заведён этим же кодом', bind.v.fresh === true);
  ok('ник привязался к аккаунту', bind.v.handle === NICK, bind.v.handle);
  ok('ключ при этом НЕ менялся', !bind.v.trainerKey);

  /* ---- телефон второй: пусто, но почта та же ---- */
  const two = await boot(b, 'телефон 2', errs);
  const back = await two.evaluate(async (email) => {
    const s = await apiPost('/api/auth', {action: 'send', email});
    return await apiPost('/api/auth', {action: 'verify', email, code: s.devCode,
                                       handle: '', trainerKey: ''});
  }, MAIL);
  ok('аккаунт не заводится второй раз', back.fresh === false);
  ok('ник вернулся на новый телефон', back.handle === NICK, back.handle);
  ok('выдан новый ключ', !!back.trainerKey && back.trainerKey !== key1);
  ok('поля страницы приехали вместе с ником',
     back.trainer && back.trainer.name === 'Лена' && back.trainer.years === 8,
     `${back.trainer && back.trainer.name}, стаж ${back.trainer && back.trainer.years}`);

  const old = await one.evaluate(async () => {
    try{
      await apiPost('/api/trainer/' + encodeURIComponent(normHandle(trainer.handle)),
                    {trainer: trainerProfile(), trainerKey: trainer.key});
      return 'прошло';
    }catch(e){ return e.code || String(e); }
  });
  ok('прежний ключ перестал работать', old === 'handle_taken', old);

  const wrong = await two.evaluate(async (email) => {
    await apiPost('/api/auth', {action: 'send', email});
    try{ await apiPost('/api/auth', {action: 'verify', email, code: '000000'}); return 'прошло'; }
    catch(e){ return e.code; }
  }, MAIL);
  ok('чужой код не пускает', wrong === 'bad_code' || wrong === 'code_expired', wrong);

  /* ---- «убрать данные о себе»: страница пустеет, каталог цел ---- */
  await two.evaluate(async (r) => {
    trainer = {on: true, handle: r.handle, key: r.trainerKey, name: r.trainer.name,
               about: r.trainer.about, years: r.trainer.years, links: r.trainer.links};
    await saveTrainer();
    account.email = r.email; await saveAccount();
    clients = [{id: 'c1', name: 'Марина', progs: [{pid: null, name: 'программа',
                link: {id: r.linkId, key: 'неважно'}, reports: []}]}];
    await saveClients();
  }, Object.assign({}, back, {email: MAIL, linkId}));

  const soft = await two.evaluate(async () => {
    await forgetMe('trainer');
    const page = await apiFetch('/api/trainer/' + encodeURIComponent(trainer.handle));
    const cat = await apiFetch('/api/catalog');
    let link = 'есть';
    try{ await apiFetch('/api/p/' + encodeURIComponent(clients[0].progs[0].link.id)); }
    catch(e){ link = e.code; }
    return {name: page.name, about: page.about, years: page.years,
            mine: cat.items.filter(x => x.by === trainer.handle).length, link};
  });
  ok('страница осталась, но пустая',
     soft.name === '' && soft.about === '' && soft.years == null,
     `имя «${soft.name}», стаж ${soft.years}`);
  ok('программа из каталога НЕ удалена', soft.mine === 1, soft.mine + ' в каталоге');
  ok('ссылка подопечному цела', soft.link === 'есть', soft.link);

  const stillMine = await two.evaluate(async () => {
    trainer.name = 'Лена снова';
    try{ await pushProfile(); }catch(e){}
    const page = await apiFetch('/api/trainer/' + encodeURIComponent(trainer.handle));
    return page.name;
  });
  ok('ник остался за человеком — страницу можно заполнить заново',
     stillMine === 'Лена снова', stillMine);

  /* ---- удаление аккаунта: уносит аккаунт и ссылки, каталог не трогает ---- */
  const hard = await two.evaluate(async () => {
    await forgetMe('all');
    const out = {};
    const page = await apiFetch('/api/trainer/' + encodeURIComponent(trainer.handle));
    out.name = page.name;
    try{ await apiFetch('/api/p/' + encodeURIComponent(clients[0].progs[0].link.id)); out.link = 'есть'; }
    catch(e){ out.link = e.code; }
    const cat = await apiFetch('/api/catalog');
    out.mine = cat.items.filter(x => x.by === trainer.handle).length;
    return out;
  });
  ok('со страницы снова всё убрано', hard.name === '', hard.name);
  ok('ссылка подопечному стёрта', hard.link === 'not_found', hard.link);
  ok('и ТУТ программа из каталога осталась', hard.mine === 1, hard.mine + ' в каталоге');

  const retake = await two.evaluate(async () => {
    try{
      await apiPost('/api/trainer/' + encodeURIComponent(trainer.handle),
                    {trainer: {name: 'Самозванец'}, trainerKey: ''});
      return 'прошло';
    }catch(e){ return e.code; }
  });
  ok('ник не достаётся никому другому', retake === 'handle_taken', retake);

  const relogin = await two.evaluate(async (email) => {
    const s = await apiPost('/api/auth', {action: 'send', email});
    return await apiPost('/api/auth', {action: 'verify', email, code: s.devCode});
  }, MAIL);
  ok('аккаунт удалён — вход заводит его заново, без ника',
     relogin.fresh === true && !relogin.handle, `fresh=${relogin.fresh}, ник «${relogin.handle}»`);

  /* ---- то же самое руками, через попап входа ---- */
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
  ok('без аккаунта тренеру про это сказано', await three.isVisible('#coachNoAcc'));
  ok('отдельного входа для тренеров нет', !(await three.$('#btnCoachMail')));

  await three.evaluate(()=> switchMoreTab('acc'));
  await three.waitForTimeout(300);
  await three.click('#btnLoginRow');
  await three.waitForTimeout(400);
  ok('попап открылся на первом шаге',
     await three.isVisible('#loginEmail') && !(await three.isVisible('#loginCode')));

  await three.fill('#loginEmail', 'не почта');
  await three.click('#loginGo');
  await three.waitForTimeout(400);
  ok('кривой адрес не отправляется',
     /опечатка/.test(await three.textContent('#loginErr')), await three.textContent('#loginErr'));

  await three.fill('#loginEmail', MAIL2);
  await three.click('#loginGo');
  await three.waitForTimeout(700);
  ok('второй шаг — код', await three.isVisible('#loginCode'));
  ok('кнопка сменила подпись', (await three.textContent('#loginGo')) === 'Войти',
     await three.textContent('#loginGo'));

  await three.click('#loginGo');
  await three.waitForTimeout(900);
  if(await three.isVisible('#dlgOk')){ await three.click('#dlgOk'); await three.waitForTimeout(400); }
  const bound2 = await three.evaluate(()=> account.email || '');
  ok('аккаунт записался', bound2 === MAIL2, bound2);
  ok('попап закрылся', !(await three.isVisible('#loginCode')));
  const nickKept = await three.evaluate(()=> trainer.handle);
  ok('ник тренера привязался к аккаунту', nickKept === NICK2, nickKept);

  await three.evaluate(()=> switchMoreTab('coach'));
  await three.waitForTimeout(300);
  ok('напоминание про аккаунт пропало', !(await three.isVisible('#coachNoAcc')));

  console.log('\npageerror: ' + (errs.length ? errs.join(' | ') : 'нет'));
  if(errs.length) bad += errs.length;
  await b.close();
  console.log(bad ? 'ПРОВАЛЕНО: ' + bad : 'всё сошлось');
  process.exit(bad ? 1 : 0);
})();
