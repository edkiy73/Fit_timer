/* Картинки едут вместе с программой — и клиенту по ссылке, и в каталог.

   Раньше и обложка, и фото упражнений выбрасывались: они не помещались в адрес,
   куда программа паковалась целиком. Адреса больше нет, а выбрасывание осталось.
   Тренер ставит фото не для красоты — по нему движение понимают быстрее, чем по
   описанию.

   Заодно проверяется, что фото НЕ едут в общем списке каталога: тридцать программ
   по полмегабайта картинок — это витрина, которая не открывается.

   Запуск:  ADMIN_KEY=testadminkey123456 node tests/dev-server.js 8124
            node tests/media-flow.js */

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
  const NICK = '@pic.' + Math.random().toString(36).slice(2, 7);
  const NAME = 'С картинками ' + Math.random().toString(36).slice(2, 6);

  const tp = await boot(b, 'тренер', errs);
  const link = await tp.evaluate(async ({txt, nick, name}) => {
    // Картинки подделываем маленькими — важно, что они ЕСТЬ и что доезжают.
    const pic = n => 'data:image/png;base64,' + btoa('pic-' + n).replace(/=/g, '');
    const me = users.find(u => u.id === currentUser); me.name = 'Лена';
    trainer = {on: true, handle: nick, about: '', years: null, links: ''};
    await saveTrainer();
    await pushProfile();
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
  ok('заявка дошла с картинками', mine && mine.cover && Object.keys(mine.media || {}).length === 3,
     mine ? Object.keys(mine.media || {}).length + ' фото' : 'нет заявки');
  await api('approve', {id: mine.id});

  // ---- витрина лёгкая, фото приходят при добавлении ----
  const list = await fetch(BASE + '/api/catalog').then(r => r.json());
  const row = list.items.find(x => x.name === NAME);
  ok('в списке каталога фото НЕТ', row && row.media === undefined && row.hasMedia === true);
  ok('но обложка в списке есть', !!(row && row.cover));

  const full = await fetch(BASE + '/api/catalog?item=' + row.id).then(r => r.json());
  ok('отдельным запросом фото приходят', Object.keys(full.item.media || {}).length === 3,
     Object.keys(full.item.media || {}).length + '');

  // ---- добавление себе возвращает фото на места ----
  const added = await cp.evaluate(async (name) => {
    await loadStoreServer();
    const it = storeAll().find(x => x.name === name);
    if(!it) return {found: false};
    await addStoreItem(it.id);
    const p = customPrograms.find(x => x.storeId === it.id);
    if(!p) return {found: true, saved: false};
    return {found: true, saved: true, cover: !!p.cover,
            withPic: normPlans(p)[0].exercises.filter(e => e.media && e.media.kind === 'img').length};
  }, NAME);
  ok('программа из каталога добавляется', added.found && added.saved, JSON.stringify(added));
  ok('и приносит фото упражнений', added.withPic === 3, added.withPic + '');
  ok('и обложку', added.cover === true);

  console.log('\npageerror:', errs.length ? errs : 'нет');
  if(errs.length) bad++;
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
