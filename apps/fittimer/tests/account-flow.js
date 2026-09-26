/* Аккаунт по почте и два объёма удаления.

   Аккаунт один, и ник тренера принадлежит ему: проверяем, что он привязывается
   при входе, возвращается на пустом телефоне вместе с полями страницы и что
   прежний ключ при переезде перестаёт работать.

   И главное про удаление — что оно НЕ трогает каталог. «Убрать данные о себе»
   очищает страницу и оставляет ник и программы; удаление аккаунта уносит ещё
   аккаунт и ссылки подопечным, но программы в каталоге остаются и там.

   Запуск:  node tests/dev-server.js 8124
            node tests/account-flow.js */

const { becomeTrainer } = require('./helpers/trainer-account');

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
  const NICK = '@lena.' + Math.random().toString(36).slice(2, 8);
  const MAIL = 'lena.' + Math.random().toString(36).slice(2, 8) + '@example.com';

  /* ---- телефон первый: вошёл в аккаунт, взял ник и включил режим тренера ---- */
  const one = await boot(b, 'телефон 1', errs);
  const made = await becomeTrainer(one, {email: MAIL, handle: NICK, trainer: {
    name: 'Лена', about: 'Домашний фитнес, только коврик.', years: 8, links: 't.me/' + NICK.slice(1)}});
  ok('страница тренера создана внутри аккаунта', made.ok && made.handle === NICK, made.err || made.handle);
  await one.evaluate(async ({txt}) => {
    const r = parseProgramText(txt);
    const p = r.program || r; p.id = 'm1';
    customPrograms.push(p); await savePrograms();
    navigator.clipboard.writeText = async () => {};
    navigator.share = async () => {};
    const c = await addClient(); c.name = 'Марина';
    await saveClients(); clientIdx = clients.indexOf(c);
    await sendProgramToClient(c, customPrograms.find(x => x.id === 'm1'));
  }, {txt: PROG});
  const key1 = await one.evaluate(() => trainer.key || '');
  ok('ник закреплён за аккаунтом, ключ страницы выдан', !!key1, key1.slice(0, 6) + '…');

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

  // На модерации добавляем второй язык вручную: отправка тренером сама ИИ не запускает.
  const engName = 'Home Strength ' + PNAME.split(' ').pop();
  const engText = PROG
    .replace('ПРОГРАММА: ' + PNAME, 'ПРОГРАММА: ' + engName)
    .replace('УПРАЖНЕНИЕ: Приседания', 'УПРАЖНЕНИЕ: Squats')
    .replace('УПРАЖНЕНИЕ: Отжимания', 'УПРАЖНЕНИЕ: Push-ups')
    .replace('УПРАЖНЕНИЕ: Планка', 'УПРАЖНЕНИЕ: Plank');
  await fetch(BASE + '/api/admin', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'X-Admin-Key': encodeURIComponent(ADMIN)},
    body: JSON.stringify({action: 'edit', id: sub.id, item: {sourceLocale:'ru', locales:{
      ru:{name:PNAME, gives:'Короткая программа на каждый день без инвентаря.', text:PROG},
      en:{name:engName, gives:'A short everyday home workout without equipment.', text:engText}
    }}})
  });
  // Берём её в каталог: удаление проверяем на том, что в каталоге УЖЕ лежит, —
  // на заявке, которую никто не взял, доказывать нечего.
  await fetch(BASE + '/api/admin', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'X-Admin-Key': encodeURIComponent(ADMIN)},
    body: JSON.stringify({action: 'approve', id: sub.id})
  });
  const live = await fetch(BASE + '/api/catalog').then(r => r.json());
  ok('и лежит в каталоге', (live.items || []).some(x => x.id === sub.id));

  /* ---- телефон второй: пусто, но почта та же ---- */
  const two = await boot(b, 'телефон 2', errs);
  const back = await two.evaluate(async (email) => {
    const s = await apiPost('/api/auth', {action: 'send', email});
    return await apiPost('/api/auth', {action: 'verify', email, code: s.devCode,
                                       deviceId: identity.deviceId, handle: '', trainerKey: ''});
  }, MAIL);
  ok('аккаунт не заводится второй раз', back.fresh === false);
  ok('ник вернулся на новый телефон', back.handle === NICK, back.handle);
  ok('выдан новый ключ', !!back.trainerKey && back.trainerKey !== key1);
  ok('поля страницы приехали вместе с ником',
     back.trainer && back.trainer.name === 'Лена' && back.trainer.years === 8,
     `${back.trainer && back.trainer.name}, стаж ${back.trainer && back.trainer.years}`);

  // Один ключ страницы без входа в аккаунт больше ничего не правит.
  const old = await one.evaluate(async () => {
    try{
      await apiPost('/api/trainer/' + encodeURIComponent(normHandle(trainer.handle)),
                    {trainer: trainerProfile(), trainerKey: trainer.key});
      return 'прошло';
    }catch(e){ return e.code || String(e); }
  });
  ok('без аккаунта страницу не поправить даже ключом', old === 'account_required', old);

  const wrong = await two.evaluate(async (email) => {
    await apiPost('/api/auth', {action: 'send', email});
    try{ await apiPost('/api/auth', {action: 'verify', email, code: '000000'}); return 'прошло'; }
    catch(e){ return e.code; }
  }, MAIL);
  ok('чужой код не пускает', wrong === 'bad_code' || wrong === 'code_expired', wrong);

  /* ---- «убрать данные о себе»: страница пустеет, каталог цел ---- */
  await two.evaluate(async (r) => {
    account.email = r.email; account.syncToken = r.syncToken; account.handle = r.handle;
    await saveAccount();
    trainer = {on: true, handle: r.handle, key: r.trainerKey, name: r.trainer.name,
               about: r.trainer.about, years: r.trainer.years, links: r.trainer.links};
    await saveTrainer();
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

  // Другая почта пытается взять освободившийся, казалось бы, ник.
  const retake = await two.evaluate(async (nick) => {
    const email = 'other.' + Math.random().toString(36).slice(2, 8) + '@example.com';
    const s = await apiPost('/api/auth', {action: 'send', email});
    const v = await apiPost('/api/auth', {action: 'verify', email, code: s.devCode, deviceId: identity.deviceId});
    try{
      await apiPost('/api/auth', {action: 'set_handle', email, deviceId: identity.deviceId,
                                  syncToken: v.syncToken, handle: nick});
      return 'прошло';
    }catch(e){ return e.code; }
  }, NICK);
  ok('ник не достаётся никому другому', retake === 'handle_taken', retake);

  const relogin = await two.evaluate(async (email) => {
    const s = await apiPost('/api/auth', {action: 'send', email});
    return await apiPost('/api/auth', {action: 'verify', email, code: s.devCode});
  }, MAIL);
  ok('аккаунт удалён — вход заводит его заново, без ника',
     relogin.fresh === true && !relogin.handle, `fresh=${relogin.fresh}, ник «${relogin.handle}»`);

  /* ---- то же самое руками: стать тренером без аккаунта нельзя, ведёт во вход ---- */
  const NICK2 = '@olga.' + Math.random().toString(36).slice(2, 8);
  const MAIL2 = 'olga.' + Math.random().toString(36).slice(2, 8) + '@example.com';
  const three = await boot(b, 'телефон 3', errs);

  await three.evaluate(()=> goTab('scrAccount'));
  await three.waitForTimeout(500);
  await three.evaluate(()=> switchMoreTab('coach'));
  await three.waitForTimeout(300);
  ok('без аккаунта тренеру про это сказано', await three.isVisible('#coachNoAcc'));
  ok('отдельного входа для тренеров нет', !(await three.$('#btnCoachMail')));

  await three.evaluate(()=> $('tglTrainer').click());
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
  ok('новый аккаунт просит ник', await three.isVisible('#loginHandle'));
  await three.fill('#loginHandle', NICK2);
  await three.click('#loginGo');
  await three.waitForTimeout(900);
  if(await three.isVisible('#dlgOk')){ await three.click('#dlgOk'); await three.waitForTimeout(400); }
  const bound2 = await three.evaluate(()=> account.email || '');
  ok('аккаунт записался', bound2 === MAIL2, bound2);
  ok('попап закрылся', !(await three.isVisible('#loginCode')));
  const nickKept = await three.evaluate(()=> ({handle: trainer.handle, on: trainerOn()}));
  ok('после входа режим тренера включился с ником аккаунта',
     nickKept.on && nickKept.handle === NICK2, JSON.stringify(nickKept));

  await three.evaluate(()=> switchMoreTab('coach'));
  await three.waitForTimeout(300);
  ok('напоминание про аккаунт пропало', !(await three.isVisible('#coachNoAcc')));

  /* ---- покупка подписки требует кода на почту ----

     Раньше почту просто набирали в поле. На новом телефоне человек вводил тот же
     адрес, получал пустой аккаунт без подписки и был прав, считая, что у него
     отобрали оплаченное; опечатка в адресе давала то же самое. */
  const MAIL3 = 'pay.' + Math.random().toString(36).slice(2, 8) + '@example.com';
  const four = await boot(b, 'телефон 4', errs);

  await four.evaluate((mail) => {
    pmPlan = 'month';
    $('payEmail').value = mail;
    $('payModal').classList.add('open');
  }, MAIL3);
  await four.click('#payGo');
  await four.waitForTimeout(700);
  ok('вместо «куплено» просят подтвердить почту',
     await four.isVisible('#loginEmail')
     && (await four.textContent('#loginLabel')) === 'Подтверждение почты',
     await four.textContent('#loginLabel'));
  ok('и адрес уже подставлен', (await four.inputValue('#loginEmail')) === MAIL3,
     await four.inputValue('#loginEmail'));
  ok('пока код не введён, подписки нет',
     await four.evaluate(() => !isPremium()), await four.evaluate(() => String(isPremium())));

  await four.click('#loginGo');
  await four.waitForTimeout(700);
  ok('второй шаг — код', await four.isVisible('#loginCode'));
  ok('и на нём подписки всё ещё нет',
     await four.evaluate(() => !isPremium()), await four.evaluate(() => String(isPremium())));

  // бросил на шаге кода — премиума не случилось
  await four.click('#loginCancel');
  await four.waitForTimeout(300);
  ok('отменил — подписки не появилось',
     await four.evaluate(() => !isPremium() && !account.sub),
     await four.evaluate(() => JSON.stringify(account.sub)));

  // теперь по-настоящему
  await four.evaluate((mail) => {
    pmPlan = 'month';
    $('payEmail').value = mail;
    $('payModal').classList.add('open');
  }, MAIL3);
  await four.click('#payGo');
  await four.waitForTimeout(700);
  await four.click('#loginGo');          // прислать код
  await four.waitForTimeout(700);
  await four.click('#loginGo');          // код подставлен локальным запуском
  await four.waitForTimeout(900);
  // новый аккаунт: один ник на аккаунт и страницу тренера
  await four.fill('#loginHandle', '@pay.' + Math.random().toString(36).slice(2, 8));
  await four.click('#loginGo');
  await four.waitForTimeout(900);
  if(await four.isVisible('#dlgOk')){ await four.click('#dlgOk'); await four.waitForTimeout(300); }
  ok('с кодом подписка оформлена',
     await four.evaluate((m) => isPremium() && account.email === m, MAIL3),
     await four.evaluate(() => `${isPremium()} / ${account.email}`));

  // Premium — только серверное право: его выдаёт оплата или админка, а не
  // приложение. Другой телефон находит тот же аккаунт, но подписку клиент сам
  // себе на сервере не заводит.
  const five = await boot(b, 'телефон 5', errs);
  const restored = await five.evaluate(async (email) => {
    const s = await apiPost('/api/auth', {action: 'send', email});
    return await apiPost('/api/auth', {action: 'verify', email, code: s.devCode});
  }, MAIL3);
  ok('другой телефон находит тот же аккаунт', restored.fresh === false, 'fresh=' + restored.fresh);
  ok('подписку клиент сам себе на сервере не выдаёт', restored.sub == null, JSON.stringify(restored.sub));

  console.log('\npageerror: ' + (errs.length ? errs.join(' | ') : 'нет'));
  if(errs.length) bad += errs.length;
  await b.close();
  console.log(bad ? 'ПРОВАЛЕНО: ' + bad : 'всё сошлось');
  process.exit(bad ? 1 : 0);
})();
