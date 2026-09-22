/* Админка каталога: очередь, правка, удаление, тренеры, стартовый набор.

   Каталог целиком живёт в базе — в приложении не осталось ни одной зашитой
   программы. Значит, единственный способ им управлять — эта страница, и она
   обязана уметь всё: залить стартовый набор, взять или отклонить заявку, поправить
   уже лежащее, убрать из каталога и закрыть автора.

   Запуск:  ADMIN_KEY=testadminkey123456 node tests/dev-server.js 8124
            node tests/admin-flow.js */

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const ADMIN = process.env.ADMIN_KEY || 'testadminkey123456';
const CHROME = process.env.FIT_CHROME || '';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

const api = (action, extra, key) => fetch(BASE + '/api/admin', {
  method: 'POST',
  headers: {'Content-Type': 'application/json',
            'X-Admin-Key': encodeURIComponent(key || ADMIN)},
  body: JSON.stringify(Object.assign({action}, extra || {}))
}).then(async r => ({s: r.status, j: await r.json().catch(() => ({}))}));

(async () => {
  const b = await chromium.launch(CHROME ? {executablePath: CHROME} : {});
  const errs = [];

  // ---- дверь заперта ----
  ok('без ключа не пускает', (await api('overview', {}, 'wrong-key-0000')).s === 403);
  // Ключ с кириллицей ронял сам запрос: в заголовок можно положить только ASCII.
  ok('ключ с кириллицей не роняет запрос, а отвергается',
     (await api('overview', {}, 'неверный')).s === 403);

  // ---- стартовый набор ----
  const seeded = await api('seed');
  ok('стартовый набор заливается', seeded.s === 200 && seeded.j.items === 5, seeded.j.items);
  const again = await api('seed');
  ok('повторная заливка не двоит', again.s === 200);
  const cat1 = await fetch(BASE + '/api/catalog').then(r => r.json());
  const names = cat1.items.map(x => x.name);
  ok('в каталоге нет повторов', new Set(names).size === names.length, names.length + ' программ');
  const lena = (await api('overview')).j.trainers.find(t => t.handle === '@lena.doma');
  ok('тренеры стартового набора заведены', !!lena);
  ok('и у них посчитаны программы', lena && lena.programs > 0, lena && lena.programs);

  // ---- добавить своими руками ----
  const NAME = 'От нас ' + Math.random().toString(36).slice(2, 6);
  const добавь = (over) => {
    const item = Object.assign({
      name: NAME, cat: 'power', level: 'Средний', min: 25,
      gives: 'Программа, добавленная прямо из админки, а не присланная тренером.',
      text: 'ПРОГРАММА: ' + NAME + '\nДНИ: Пн\nКРУГИ: 2\n\nУПРАЖНЕНИЕ: Приседания\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 12\nПОДХОДЫ: 3\nОТДЫХ: 45',
      exCount: 1
    }, over || {});
    item.sourceLocale = 'ru';
    item.locales = {
      ru: {name:item.name, gives:item.gives, text:item.text},
      en: {name:'EN ' + item.name, gives:'English version. ' + item.gives, text:item.text}
    };
    if(over && over.locales) item.locales = over.locales;
    return api('add', {item});
  };

  const bad1 = await добавь({gives: 'коротко'});
  ok('недобор полей не проходит', bad1.s === 400 && (bad1.j.miss || []).length > 0,
     (bad1.j.miss || []).join(', '));
  const bad2 = await добавь({cat: 'Сила и выносливость'});
  ok('цель названием, а не ключом, не проходит', bad2.s === 400, (bad2.j.miss || []).join(', '));

  const added = await добавь();
  ok('добавляется и сразу в каталоге', added.s === 200 && !!added.j.id, added.j.id);
  const cat2 = await fetch(BASE + '/api/catalog').then(r => r.json());
  ok('витрина её видит', cat2.items.some(x => x.id === added.j.id));

  // ---- поправить ----
  const ed = await api('edit', {id: added.j.id, item: {min: 33, level: 'Продвинутый'}});
  ok('правка проходит', ed.s === 200);
  const cat3 = await fetch(BASE + '/api/catalog').then(r => r.json());
  const mine = cat3.items.find(x => x.id === added.j.id);
  ok('правка доехала до витрины', mine && mine.min === 33 && mine.level === 'Продвинутый',
     mine && `${mine.min} мин, ${mine.level}`);
  const edBad = await api('edit', {id: added.j.id, item: {name: 'ы'}});
  ok('правка тоже проверяется', edBad.s === 400, (edBad.j.miss || []).join(', '));

  // ---- убрать ----
  ok('убирается из каталога', (await api('remove', {id: added.j.id})).s === 200);
  const cat4 = await fetch(BASE + '/api/catalog').then(r => r.json());
  ok('и пропала с витрины', !cat4.items.some(x => x.id === added.j.id));

  // ---- картинки: обложка и фото упражнений ----
  const pic = t => 'data:image/png;base64,' + btoa('pic-' + t).replace(/=/g, '');
  const withPics = await добавь({
    name: NAME + ' с фото',
    cover: pic('cover'),
    media: {'Приседания': pic('sq'), 'Планка': pic('pl')}
  });
  ok('программа добавляется с картинками', withPics.s === 200, withPics.j.id);
  const one = await fetch(BASE + '/api/catalog?item=' + withPics.j.id).then(r => r.json());
  ok('обложка сохранилась', !!(one.item && one.item.cover));
  ok('фото упражнений сохранились', Object.keys(one.item.media || {}).length === 2,
     Object.keys(one.item.media || {}).join(', '));

  // правкой картинку можно и заменить, и убрать
  await api('edit', {id: withPics.j.id, item: {cover: '', media: {'Планка': pic('pl2')}}});
  const one2 = await fetch(BASE + '/api/catalog?item=' + withPics.j.id).then(r => r.json());
  ok('обложку можно убрать правкой', !one2.item.cover);
  ok('карта фото заменяется целиком', Object.keys(one2.item.media || {}).join() === 'Планка',
     Object.keys(one2.item.media || {}).join(', '));
  ok('мусор вместо картинки не принимается',
     (await api('edit', {id: withPics.j.id, item: {media: {'Планка': 'не-картинка'}}})).s === 200
     && Object.keys((await fetch(BASE + '/api/catalog?item=' + withPics.j.id).then(r => r.json())).item.media || {}).length === 0);
  await api('remove', {id: withPics.j.id});

  // ---- закрыть и вернуть тренера ----
  ok('тренер закрывается', (await api('ban', {handle: '@lena.doma'})).s === 200);
  const banned = (await api('overview')).j.trainers.find(t => t.handle === '@lena.doma');
  ok('это видно в списке', banned && banned.banned === true);
  ok('и возвращается', (await api('unban', {handle: '@lena.doma'})).s === 200);

  // ---- сама страница ----
  const page = await (await b.newContext({viewport: {width: 412, height: 900}})).newPage();
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/admin.html', {waitUntil: 'load'});
  await page.waitForTimeout(500);
  ok('без ключа показывает вход', await page.isVisible('#gate'));
  await page.fill('#key', 'неверный');
  await page.click('#enter');
  await page.waitForTimeout(700);
  ok('неверный ключ не пускает и говорит об этом',
     /не подошёл/.test(await page.textContent('#gateErr')));
  await page.fill('#key', ADMIN);
  await page.click('#enter');
  await page.waitForTimeout(900);
  ok('с ключом открывается', await page.isVisible('#app'));
  await page.click('.nav-btn[data-tab="approved"]');
  await page.waitForTimeout(400);
  const listed = await page.textContent('#body');
  ok('на вкладке «В каталоге» видны программы', /Кардио без прыжков/.test(listed));
  await page.click('.nav-btn[data-tab="trainers"]');
  await page.waitForTimeout(400);
  ok('на вкладке «Тренеры» видна активность',
     /активность/.test(await page.textContent('#body')));
  await page.click('.nav-btn[data-tab="add"]');
  await page.waitForTimeout(300);
  ok('у новой программы есть полноценный режим создания через ИИ',
     await page.isVisible('#aiCreateCard') && await page.isVisible('#fAiCreate'));
  await page.fill('#aiCreateWish','Собери тестовую силовую программу');
  await page.click('#fAiCreate');
  await page.waitForFunction(() => document.querySelector('#fNameRu')?.value === 'Тестовая программа'
    && document.querySelector('#fNameEn')?.value === 'EN Test Program');
  ok('AI-create заполняет редактор валидной программой и вторым языком',
     (await page.inputValue('#fNameRu')) === 'Тестовая программа'
     && (await page.inputValue('#fNameEn')) === 'EN Test Program'
     && /УПРАЖНЕНИЕ: Приседания/.test(await page.inputValue('#fTextRu')));
  await page.fill('#fTextRu', 'ПРОГРАММА: Проба\nДНИ: Пн\n\nУПРАЖНЕНИЕ: Приседания\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 12\n\nУПРАЖНЕНИЕ: Планка\nФОРМАТ: время\nЗНАЧЕНИЕ: 40');
  await page.waitForTimeout(300);
  const slots = await page.evaluate(() => [...document.querySelectorAll('#fPics .pic small')].map(x => x.textContent));
  ok('места под фото берутся из текста программы',
     slots.join(',') === 'Приседания,Планка', slots.join(', '));
  ok('обложке тоже есть место', await page.isVisible('#fCoverBox .ph'));
  ok('в админке есть отдельные RU и EN поля', await page.isVisible('#fNameRu') && await page.isVisible('#fNameEn'));
  ok('есть ручная вставка перевода без ИИ', await page.isVisible('#fPasteToggle'));
  await page.screenshot({path: __dirname + '/shot-admin.png', fullPage: true});

  /* ---- доступ по подписке: решают здесь, а не тренер в заявке ---- */
  const made = await добавь({
    name: 'Платная ' + Math.random().toString(36).slice(2, 6),
    gives: 'Программа для проверки доступа по подписке, двадцать символов есть.',
    cat: 'power', level: 'Средний', min: 30, exCount: 3,
    text: 'ПРОГРАММА: Платная\nДНИ: Пн\nКРУГИ: 3\n\nУПРАЖНЕНИЕ: Приседания\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 12\nПОДХОДЫ: 3\nОТДЫХ: 45',
    pro: true
  });
  ok('программа добавляется сразу премиумной', made.s === 200, made.j.id || made.j.error);

  const fromCat = await fetch(BASE + '/api/catalog').then(r => r.json());
  const proRow = (fromCat.items || []).find(x => x.id === made.j.id);
  ok('и каталог отдаёт метку', proRow && proRow.pro === true, String(proRow && proRow.pro));

  const opened = await api('pro', {id: made.j.id, pro: false});
  ok('её можно открыть всем одним действием', opened.s === 200 && opened.j.pro === false,
     String(opened.j.pro));
  const back = await fetch(BASE + '/api/catalog').then(r => r.json());
  ok('и каталог это видит',
     (back.items || []).find(x => x.id === made.j.id).pro === false);

  const edited = await api('edit', {id: made.j.id, item: {pro: true}});
  ok('правкой тоже переключается', edited.s === 200);
  const solo = await fetch(BASE + '/api/catalog?item=' + made.j.id).then(r => r.json());
  ok('и по одной программе метка приезжает', solo.item.pro === true, String(solo.item.pro));

  console.log('\npageerror:', errs.length ? errs : 'нет');
  if(errs.length) bad++;
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
