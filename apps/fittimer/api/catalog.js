/* /api/catalog — витрина и заявки в неё.

   GET — что уже прошло проверку. Отдаём позиции ровно в том виде, в каком они
   лежат в приложении: оно не должно знать, зашита программа или пришла с сервера.
     ?item=<id>   — одна программа целиком, вместе с фото упражнений;
     ?status=<id,id> — что стало с предложенными.

   POST — тренер ПРЕДЛАГАЕТ свою программу. Не «публикует»: всё проходит через
   проверку руками. Пока программ единицы, это десять минут в неделю, а открытая
   публикация без модерации в первый же месяц превращает каталог в помойку, из
   которой его уже не вытащить.

   Раньше заявка была отдельным файлом. Разными их делал только глагол: список и
   попадание в список — одно место, и Vercel на бесплатном плане считает каждый
   файл отдельной функцией, которых там всего двенадцать. По той же причине ушла
   страница проверки /api/catalog/review: её работу делает admin.html, где та же
   очередь лежит рядом с каталогом, тренерами и картинками. */
require('../lib/product');

const { store } = require('../../../packages/core/server/store');
const { validSession, send, fail, readBody, rateOk, rndId, sameSecret, cors,
        clampText, clampLine, cleanPic } = require('../../../packages/core/server/util');
const crypto = require('crypto');
const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');

const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
async function premiumCatalogAccess(req){
  const email=String(req.headers['x-fit-email']||'').trim().toLowerCase().slice(0,120);
  const deviceId=String(req.headers['x-fit-device']||'').trim().slice(0,80);
  const token=String(req.headers['x-fit-token']||'');
  if(!EMAIL.test(email)||!deviceId||!token) return false;
  const mh=sha(email).slice(0,32);
  let acc=null;
  try{acc=JSON.parse(await store.get(`a:${mh}`));}catch(_){}
  const dev=acc&&acc.syncDevices&&acc.syncDevices[deviceId];
  if(!(await validSession(dev, token))) return false;
  return (Date.parse(acc.sub&&acc.sub.until)||0) > Date.now();
}

const REFERENCE_IDS = new Set(require('../lib/seed').SEED_ITEMS.map(item=>String(item.id)));
const CP = require('../lib/fit-catalog-program');
const LANGS = CP.LANGS;
const normLocale = v => LANGS.includes(String(v || '').toLowerCase()) ? String(v).toLowerCase() : 'ru';

/* Запись каталога = одна программа (механика + тексты исходного языка) и накладки
   языков. Язык отдаём, только если он ГОТОВ: название, «что даёт» и все тексты этапов.
   Иначе — следующий по порядку: запрошенный → исходный → ru → en. */
function localeBlock(c, lang){
  const b = c && c.locales && c.locales[lang];
  if(!b || typeof b !== 'object' || !String(b.name || '').trim()) return null;
  const source = normLocale(c.sourceLocale);
  if(lang === source) return {name:b.name, gives:b.gives || '', program:c.program};
  const srcBlock = c.locales[source] || {};
  if(!CP.textsComplete(srcBlock.texts || CP.textsOf(c.program), b.texts)) return null;
  return {name:b.name, gives:b.gives || '', program:CP.applyTexts(c.program, b.texts)};
}
function resolvedLocale(c, want){
  const order = [normLocale(want), normLocale(c && c.sourceLocale), 'ru', 'en'];
  for(const lang of order){
    const block = c && c.program ? localeBlock(c, lang) : null;
    if(block) return Object.assign({lang}, block);
  }
  return {lang:'ru', name:(c && c.name) || '', gives:(c && c.gives) || '', program:null};
}
// Фото упражнений — только v2: stable exercise.id + позиция plan/exercise.
function mediaItems(media){
  return media && +media.v === 2 && Array.isArray(media.items) ? media.items : null;
}
function mediaCount(media){
  const items = mediaItems(media);
  return items ? items.length : 0;
}
function cleanMedia(src){
  const items = mediaItems(src) || [];
  let budget = 800 * 1024;
  const out = [];
  for(const item of items){
    if(!item || typeof item !== 'object') continue;
    const val = cleanPic(item.data, budget);
    if(!val) continue;
    out.push({
      id: clampLine(item.id, 80),
      p: Math.max(0, Math.min(99, Math.round(+item.p || 0))),
      i: Math.max(0, Math.min(199, Math.round(+item.i || 0))),
      n: clampLine(item.n, 60),
      data: val
    });
    budget -= val.length;
    if(out.length >= 30) break;
  }
  return {v:2, items:out};
}

async function list(req, res){
  if(!(await rateOk(req, 'catalog', 900))) return fail(res, 429, 'rate_limited');

  /* Одна программа целиком, вместе с фото упражнений. Отдельным запросом, потому
     что в общем списке фото сделали бы витрину неподъёмной: тридцать программ по
     полмегабайта картинок — это пятнадцать мегабайт на открытие экрана, где
     показывают одну строчку на программу. Фото нужны в момент добавления себе,
     тогда за ними и идём. */
  const one = String((req.query && req.query.item) || '').trim();
  if(one){
    // Published Admin drafts keep their d... id after publication. Canonical
    // reference programs use stable descriptive IDs such as slim_toned_v2.
    // Accept only the legacy generated IDs or IDs present in the reference registry.
    if(!/^[uad][0-9a-z]{4,16}$/.test(one) && !REFERENCE_IDS.has(one)) return fail(res, 400, 'bad_id');
    const raw = await store.get(`c:${one}`);
    if(!raw) return fail(res, 404, 'not_found');
    let c;
    try{ c = JSON.parse(raw); }catch(e){ return fail(res, 500, 'corrupt'); }
    if(c.status !== 'approved') return fail(res, 404, 'not_found');
    const loc = resolvedLocale(c, req.query && req.query.lang);
    const allowed = !c.pro || await premiumCatalogAccess(req);
    return send(res, 200, {item: {
      id: c.id, by: c.by, cat: c.cat, level: c.level, min: c.min, name: loc.name,
      gives: loc.gives, program: allowed ? loc.program : null, locale: loc.lang, pro: !!c.pro,
      exCount: +c.exCount || 0,
      locked: !!c.pro && !allowed,
      // v2 несёт stable exercise.id: перевод названий картинки не трогает
      cover: c.cover || null, media: allowed && mediaCount(c.media) ? c.media : null,
      hasMedia: mediaCount(c.media) > 0
    }});
  }

  const ask = String((req.query && req.query.status) || '').trim();
  if(ask){
    const ids = ask.split(',').filter(x => /^u[0-9a-z]{4,16}$/.test(x)).slice(0, 20);
    const raws = await store.many(ids.map(id => `c:${id}`));
    const out = {};
    ids.forEach((id, i) => {
      if(!raws[i]){ out[id] = 'gone'; return; }
      try{ out[id] = JSON.parse(raws[i]).status || 'pending'; }catch(e){ out[id] = 'gone'; }
    });
    return send(res, 200, {status: out});
  }

  const ids = (await store.list('c:approved')).slice(-200);
  // Один запрос на весь список. Обход по программе давал столько путей до базы,
  // сколько программ в каталоге, — и витрина открывалась секундами.
  const raws = await store.many(ids.map(id => `c:${id}`));
  const items = [];
  raws.forEach(raw => {
    if(!raw) return;
    let c;
    try{ c = JSON.parse(raw); }catch(e){ return; }
    if(c.status !== 'approved') return;
    // media в списке НЕТ намеренно — см. выше. Обложка одна на программу и лёгкая.
    const loc = resolvedLocale(c, req.query && req.query.lang);
    if(!loc.program) return;
    items.push({id: c.id, by: c.by, cat: c.cat, level: c.level, min: c.min,
                name: loc.name, gives: loc.gives, program: c.pro ? null : loc.program, locale: loc.lang, pro: !!c.pro,
                exCount: +c.exCount || 0, locked: !!c.pro,
                cover: c.cover || null, hasMedia: mediaCount(c.media) > 0});
  });
  send(res, 200, {items});
}

// Ключи целей — те же, что в STORE_LOOK у приложения. Именно КЛЮЧ, а не название:
// по нему витрина подбирает обложку и по нему работают фильтры.
const GOALS = ['slim', 'tone', 'glut', 'core', 'power', 'relief', 'flex', 'back', 'post', 'cardio'];
const LEVELS = ['Новичок', 'Средний', 'Продвинутый'];
const PER_DAY = 3;

async function submit(req, res){
  if(!(await rateOk(req, 'submit', 30))) return fail(res, 429, 'rate_limited');

  let body;
  try{ body = await readBody(req); }catch(e){ return fail(res, 413, 'too_large'); }

  let handle = String((body && body.by) || '').slice(0, 40);
  if(handle && handle[0] !== '@') handle = '@' + handle;
  if(!/^@[\wа-яё.\-]{1,39}$/i.test(handle)) return fail(res, 400, 'bad_handle');

  /* Единственная проверка «кто ты», возможная без аккаунтов: ник должен быть
     закреплён за этим человеком. Она не останавливает того, кто решил спамить,
     зато привязывает всё предложенное к одному имени — а имя уже можно закрыть
     целиком, вместо игры в кошки-мышки с каждой новой программой. */
  const raw = await store.get(`t:${handle}`);
  if(!raw) return fail(res, 403, 'no_trainer');
  let t;
  try{ t = JSON.parse(raw); }catch(e){ return fail(res, 500, 'corrupt'); }
  if(!sameSecret(sha((body && body.trainerKey) || ''), t.keyHash || '')){
    return fail(res, 403, 'not_yours');
  }
  if(t.banned) return fail(res, 403, 'banned');

  const it = (body && body.item) || {};
  // Название и «что даёт» встанут в витрину и на страницу программы, поэтому
  // здесь не просто обрезка по длине: невидимые символы и переносы строк в них
  // ломают ряд там, где место под одну строку.
  const sourceLocale = normLocale(it.sourceLocale || it.locale);
  const name  = clampLine(it.name, 60);
  const gives = clampText(it.gives, 300);
  const cat   = String(it.cat || '');
  const level = String(it.level || '');
  const min   = Math.max(1, Math.min(180, Math.round(+it.min || 0)));
  // Программа приходит объектом модели V2 и чистится до шаблона: без прогресса,
  // фото, статистики и личных полей. Её id — мост к накладкам языков и фото.
  const cleaned = CP.cleanCatalogProgram(it.program);
  // Обложка уедет в атрибут <img src> у каждого, кто откроет каталог: проверяем
  // форму, а не длину.
  const cover = cleanPic(it.cover, 90000) || null;
  // Фото упражнений — v2 по stable exercise.id.
  const media = cleanMedia(it.media);

  const miss = [];
  if(name.length < 3) miss.push('название');
  if(gives.length < 20) miss.push('что даёт — хотя бы 20 символов');
  if(!GOALS.includes(cat)) miss.push('цель');
  if(!LEVELS.includes(level)) miss.push('уровень');
  if(!cleaned.program) miss.push('программа');
  else if(cleaned.errors.includes('exercises.min')) miss.push('хотя бы три упражнения');
  else if(cleaned.errors.length) miss.push('программа');
  if(miss.length) return fail(res, 400, 'bad_item', {miss});
  const program = cleaned.program;

  // Не больше трёх предложений в сутки с одного ника: спам стоит времени, а не
  // одного нажатия. Настоящему тренеру три программы в день более чем хватает.
  const day = new Date().toISOString().slice(0, 10);
  const n = await store.incr(`sub:${handle}:${day}`, 2 * 24 * 3600);
  if(n > PER_DAY) return fail(res, 429, 'too_many_today');

  /* Одно и то же название от одного ника второй раз не принимаем — но только пока
     первая заявка ЖИВА. Прежняя проверка ставила метку навсегда, и отклонённую
     программу нельзя было прислать снова даже после правок: тренер видел «уже
     отправлена» про то, чего в каталоге нет. Заслон от двойного нажатия превращался
     в запрет на вторую попытку.

     Поэтому смотрим не на метку, а на состояние самой заявки. */
  const dupKey = `subname:${handle}:${sha(name).slice(0, 16)}`;
  const prevId = await store.get(dupKey);
  if(prevId){
    const prevRaw = await store.get(`c:${prevId}`);
    let prev = null;
    try{ prev = prevRaw ? JSON.parse(prevRaw) : null; }catch(e){}
    // жива — значит это повторное нажатие; отклонена, убрана или пропала — путь открыт
    if(prev && (prev.status === 'pending' || prev.status === 'approved')){
      return fail(res, 409, 'already_sent');
    }
  }

  const id = 'u' + rndId(7);
  await store.set(`c:${id}`, JSON.stringify({
    id, by: handle, cat, level, min, name, gives, sourceLocale, program,
    locales: {[sourceLocale]: {name, gives, texts: CP.textsOf(program)}}, cover, media,
    exCount: cleaned.exCount, status: 'pending', at: new Date().toISOString()
  }));
  await store.push('c:pending', id);
  await store.set(dupKey, id);   // метка указывает на ПОСЛЕДНЮЮ заявку с этим названием

  send(res, 200, {ok: true, id, status: 'pending'});
}

module.exports = async (req, res) => {
  if(cors(req, res)) return;
  if(!store.configured()) return fail(res, 503, 'no_store');
  if(req.method === 'GET')  return list(req, res);
  if(req.method === 'POST') return submit(req, res);
  fail(res, 405, 'method_not_allowed');
};
