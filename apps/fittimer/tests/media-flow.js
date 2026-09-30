/* Картинки едут вместе с программой — и клиенту по ссылке, и в каталог.

   Раньше и обложка, и фото упражнений выбрасывались: они не помещались в адрес,
   куда программа паковалась целиком. Адреса больше нет, а выбрасывание осталось.
   Тренер ставит фото не для красоты — по нему движение понимают быстрее, чем по
   описанию.

   Заодно проверяется, что фото НЕ едут в общем списке каталога: тридцать программ
   по полмегабайта картинок — это витрина, которая не открывается.

   Запуск:  ADMIN_KEY=testadminkey123456 node tests/dev-server.js 8124
            node tests/media-flow.js */

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

const PROG = `ПРОГРАММА: С картинками
ДНИ: Пн
КРУГИ: 2
ОТДЫХ МЕЖДУ КРУГАМИ: 60

УПРАЖНЕНИЕ: Приседания
ФОРМАТ: повторения
ЗНАЧЕНИЕ: 12
ПОДХОДЫ: 3
ОТДЫХ: 45

УПРАЖНЕНИЕ: Планка
ФОРМАТ: время
ЗНАЧЕНИЕ: 40
ПОДХОДЫ: 3
ОТДЫХ: 30

УПРАЖНЕНИЕ: Отжимания
ФОРМАТ: повторения
ЗНАЧЕНИЕ: 8
ПОДХОДЫ: 3
ОТДЫХ: 60`;

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
  const NICK = '@pic.' + Math.random().toString(36).slice(2, 7);
  const NAME = 'С картинками ' + Math.random().toString(36).slice(2, 6);

  const tp = await boot(b, 'тренер', errs);
  await tp.evaluate(() => { users.find(u => u.id === currentUser).name = 'Лена'; });
  await becomeTrainer(tp, {handle: NICK, trainer: {about: '', years: null, links: ''}});
  const link = await tp.evaluate(async ({txt, nick, name}) => {
    // Картинки подделываем маленькими — важно, что они ЕСТЬ и что доезжают.
    const pic = n => 'data:image/png;base64,' + btoa('pic-' + n).replace(/=/g, '');
    const r = parseProgramText(txt);
    const p = r.program || r;
    p.id = 'pic1'; p.name = name;
    p.cover = pic('cover');
    normPlans(p)[0].exercises.forEach((ex, i) => { ex.media = {kind: 'img', data: pic(i)}; });
    customPrograms.push(p); await savePrograms();
    let out = null;
    navigator.clipboard.writeText = async t => { out = t; };
    navigator.share = async d => { out = d.url; };
    const c = await addClient(); c.name = 'Марина';
    await saveClients(); clientIdx = clients.indexOf(c);
    await sendProgramToClient(c, customPrograms.find(x => x.id === 'pic1'));
    return out;
  }, {txt: PROG, nick: NICK, name: NAME});

  // ---- клиент получает программу С фото ----
  const cp = await boot(b, 'клиент', errs, link);
  await cp.waitForTimeout(1400);
  if(await cp.isVisible('#dlgOk')){ await cp.click('#dlgOk'); await cp.waitForTimeout(400); }
  const got = await cp.evaluate(() => ({
    cover: !!(draft && draft.cover),
    withPic: normPlans(draft)[0].exercises.filter(e => e.media && e.media.kind === 'img').length,
    total: normPlans(draft)[0].exercises.length
  }));
  ok('обложка доехала до клиента', got.cover);
  ok('фото упражнений доехали', got.withPic === got.total, `${got.withPic} из ${got.total}`);

  const mediaIdentity = await tp.evaluate(() => {
    const pic = n => 'data:image/png;base64,' + btoa('identity-' + n).replace(/=/g, '');
    const ex = (id, data) => ({
      id, name:'Одинаковое', type:'reps', value:'10', sets:1, rest:0,
      media:{kind:'img',data}
    });
    const p = {id:'media-id-test',name:'Media id',plans:[{
      days:[],rounds:1,roundRest:0,
      exercises:[ex('media-a',pic('a')),ex('media-b',pic('b'))]
    }]};
    const packed = programMedia(p);

    const exact = JSON.parse(JSON.stringify(p));
    exact.plans[0].exercises.forEach(e => { delete e.media; });
    exact.plans[0].exercises[1].name = 'Переименованное';
    applyMedia(exact, packed);

    // Каталог парсит переведённый текст и получает временные новые id.
    // Position fallback должен вернуть ИСХОДНЫЕ id, а не привязывать фото по имени.
    const translated = JSON.parse(JSON.stringify(p));
    translated.plans[0].exercises.forEach((e, i) => {
      delete e.media;
      e.id = 'temporary-' + i;
      e.name = i ? 'Same translated' : 'Same translated';
    });
    applyMedia(translated, packed);

    const legacy = JSON.parse(JSON.stringify(p));
    legacy.plans[0].exercises.forEach(e => { delete e.media; });
    applyMedia(legacy, {'Одинаковое':pic('legacy')});

    return {
      version:packed.v,
      ids:(packed.items || []).map(x => x.id),
      exact:exact.plans[0].exercises.map(e => [e.id,e.name,e.media && e.media.data]),
      translated:translated.plans[0].exercises.map(e => [e.id,e.media && e.media.data]),
      legacyPics:legacy.plans[0].exercises.filter(e => e.media).length
    };
  });
  ok('media v2 хранит отдельную картинку каждого exercise.id даже при одинаковых названиях',
     mediaIdentity.version === 2
       && mediaIdentity.ids.join(',') === 'media-a,media-b'
       && mediaIdentity.exact[0][2] !== mediaIdentity.exact[1][2],
     JSON.stringify(mediaIdentity));
  ok('переименование не ломает картинку: exact exercise.id остаётся главным ключом',
     mediaIdentity.exact[1][0] === 'media-b'
       && mediaIdentity.exact[1][1] === 'Переименованное'
       && !!mediaIdentity.exact[1][2],
     JSON.stringify(mediaIdentity.exact[1]));
  ok('каталожный position fallback возвращает исходные exercise.id и разные фото',
     mediaIdentity.translated[0][0] === 'media-a'
       && mediaIdentity.translated[1][0] === 'media-b'
       && mediaIdentity.translated[0][1] !== mediaIdentity.translated[1][1],
     JSON.stringify(mediaIdentity.translated));
  ok('legacy карта по имени не угадывает между двумя одинаковыми упражнениями',
     mediaIdentity.legacyPics === 0, mediaIdentity.legacyPics);

  // ---- в каталог ----
  await tp.evaluate(async ({name}) => {
    const p = customPrograms.find(x => x.name === name);
    openPublish(p);
    pubDraft.cat = 'Сила и выносливость';
    pubDraft.level = 'Средний';
    pubDraft.gives = 'Три движения по кругу, у каждого своя картинка — видно, что делать.';
    document.getElementById('pubGives').value = pubDraft.gives;
    await doPublish();
  }, {name: NAME});
  await tp.waitForTimeout(800);
  if(await tp.isVisible('#dlgOk')){ await tp.click('#dlgOk'); await tp.waitForTimeout(300); }

  const api = (action, extra) => fetch(BASE + '/api/admin', {
    method: 'POST', headers: {'Content-Type': 'application/json', 'X-Admin-Key': encodeURIComponent(ADMIN)},
    body: JSON.stringify(Object.assign({action}, extra || {}))
  }).then(r => r.json());
  const queue = await api('overview');
  const mine = queue.pending.find(x => x.name === NAME);
  const mineMedia = mine && mine.media && mine.media.v === 2 && Array.isArray(mine.media.items)
    ? mine.media.items : [];
  ok('заявка дошла с id-картинками', mine && mine.cover && mineMedia.length === 3
       && mineMedia.every(x => x.id && x.data),
     mine ? mineMedia.length + ' фото' : 'нет заявки');
  const enName = 'With pictures ' + NAME.split(' ').pop();
  const enText = mine.text
    .replace('ПРОГРАММА: ' + NAME, 'ПРОГРАММА: ' + enName)
    .replace('УПРАЖНЕНИЕ: Приседания', 'УПРАЖНЕНИЕ: Squats')
    .replace('УПРАЖНЕНИЕ: Планка', 'УПРАЖНЕНИЕ: Plank')
    .replace('УПРАЖНЕНИЕ: Отжимания', 'УПРАЖНЕНИЕ: Push-ups');
  await api('edit', {id:mine.id, item:{sourceLocale:'ru', locales:{
    ru:{name:mine.name, gives:mine.gives, text:mine.text},
    en:{name:enName, gives:'Three exercises in a circuit, each with its own technique image.', text:enText}
  }}});
  await api('approve', {id: mine.id});

  // ---- витрина лёгкая, фото приходят при добавлении ----
  const list = await fetch(BASE + '/api/catalog').then(r => r.json());
  const row = list.items.find(x => x.name === NAME);
  ok('в списке каталога фото НЕТ', row && row.media === undefined && row.hasMedia === true);
  ok('но обложка в списке есть', !!(row && row.cover));

  const full = await fetch(BASE + '/api/catalog?item=' + row.id + '&lang=ru').then(r => r.json());
  const fullItems = full.item.media && full.item.media.v === 2 ? (full.item.media.items || []) : [];
  ok('отдельным запросом id-фото приходят', fullItems.length === 3 && fullItems.every(x => x.id && x.data),
     fullItems.map(x => x.id).join(', '));
  const fullEn = await fetch(BASE + '/api/catalog?item=' + row.id + '&lang=en').then(r => r.json());
  const enItems = fullEn.item.media && fullEn.item.media.v === 2 ? (fullEn.item.media.items || []) : [];
  ok('для английского сохраняются те же stable exercise.id — перевод имени больше не ключ',
     enItems.length === 3
       && enItems.map(x => x.id).join(',') === fullItems.map(x => x.id).join(','),
     enItems.map(x => x.id).join(', '));

  /* ---- страница программы в каталоге показывает фото ----
     Их там нет в момент отрисовки: список каталога фото не несёт, и они доезжают
     отдельным запросом уже после того, как страница открылась. Ждём. */
  const onPage = await cp.evaluate(async (name) => {
    await loadStoreServer();
    const it = storeAll().find(x => x.name === name);
    if(!it) return {found: false};
    openStoreItem(it.id);
    const count = () => document.querySelectorAll('#siList .ex-thumb img').length;
    const atOnce = count();
    for(let i = 0; i < 40 && count() < 3; i++) await new Promise(r => setTimeout(r, 100));
    return {found: true, atOnce, later: count(),
            rows: document.querySelectorAll('#siList .ex-row').length};
  }, NAME);
  ok('страница программы открывается сразу, не дожидаясь фото',
     onPage.found && onPage.rows === 3 && onPage.atOnce === 0,
     `${onPage.rows} строк, фото сразу ${onPage.atOnce}`);
  ok('и фото доезжают на свои места', onPage.later === 3, onPage.later + ' из 3');

  // ---- добавление себе возвращает фото на места ----
  const added = await cp.evaluate(async (name) => {
    await loadStoreServer();
    const it = storeAll().find(x => x.name === name);
    if(!it) return {found: false};
    await addStoreItem(it.id);
    const p = customPrograms.find(x => x.storeId === it.id);
    if(!p) return {found: true, saved: false};
    return {found: true, saved: true, cover: !!p.cover, locale:p.locale,
            withPic: normPlans(p)[0].exercises.filter(e => e.media && e.media.kind === 'img').length};
  }, NAME);
  ok('программа из каталога добавляется', added.found && added.saved, JSON.stringify(added));
  ok('и приносит фото упражнений', added.withPic === 3, added.withPic + '');
  ok('и обложку', added.cover === true);
  ok('личная копия запоминает язык каталога', added.locale === 'ru', added.locale);

  console.log('\npageerror:', errs.length ? errs : 'нет');
  if(errs.length) bad++;
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
