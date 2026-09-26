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
const { send, fail, readBody, rateOk, rndId, sameSecret, cors,
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
  if(!dev||!sameSecret(sha(token),dev.h||'')) return false;
  return (Date.parse(acc.sub&&acc.sub.until)||0) > Date.now();
}

const LANGS = ['ru', 'en'];
const normLocale = v => LANGS.includes(String(v || '').toLowerCase()) ? String(v).toLowerCase() : 'ru';

function cleanLocaleBlock(v){
  if(!v || typeof v !== 'object') return null;
  return {
    name: clampLine(v.name, 60),
    gives: clampText(v.gives, 300),
    text: String(v.text || '').slice(0, 60000)
  };
}
function rawLocale(c, lang){
  const hit = cleanLocaleBlock(c && c.locales && c.locales[lang]);
  if(hit && (hit.name || hit.gives || hit.text)) return hit;
  const source = normLocale(c && c.sourceLocale);
  if(lang === source && c && (c.name || c.gives || c.text)){
    return cleanLocaleBlock({name:c.name, gives:c.gives, text:c.text});
  }
  // Старые записи не знали о языках: их верхний уровень — русский оригинал.
  if(!c?.locales && lang === 'ru' && c && (c.name || c.gives || c.text)){
    return cleanLocaleBlock({name:c.name, gives:c.gives, text:c.text});
  }
  return null;
}
function resolvedLocale(c, want){
  const order = [normLocale(want), normLocale(c && c.sourceLocale), 'ru', 'en'];
  for(const lang of order){
    const block = rawLocale(c, lang);
    if(block) return Object.assign({lang}, block);
  }
  return {lang:'ru', name:'', gives:'', text:''};
}
function exerciseNames(text){
  const out = [];
  String(text || '').split(/\r?\n/).forEach(line => {
    const m = line.match(/^УПРАЖНЕНИЕ:\s*(.+)$/i);
    if(m && m[1].trim()) out.push(m[1].trim());
  });
  return out;
}
function localizedMedia(c, locale){
  const media = (c && c.media && typeof c.media === 'object') ? c.media : {};
  const keys = Object.keys(media);
  if(!keys.length) return null;
  const source = resolvedLocale(c, normLocale(c && c.sourceLocale));
  const target = resolvedLocale(c, locale);
  if(source.lang === target.lang) return media;
  const from = exerciseNames(source.text), to = exerciseNames(target.text);
  if(!from.length || from.length !== to.length) return media;
  const out = {};
  from.forEach((name, i) => { if(media[name] && to[i]) out[to[i]] = media[name]; });
  return Object.keys(out).length ? out : media;
}

async function upgradeSeedLocales(){
  const key = 'migration:seed-locales-v1';
  if(await store.get(key)) return;
  const { SEED_ITEMS } = require('../lib/seed');
  for(const seed of SEED_ITEMS){
    if(!seed.locales || !seed.locales.en) continue;
    const raw = await store.get(`c:${seed.id}`);
    if(!raw) continue;
    let c;
    try{ c = JSON.parse(raw); }catch(e){ continue; }
    if(c.locales && c.locales.en) continue;
    c.sourceLocale = 'ru';
    c.locales = {
      ru: {name:c.name || seed.name, gives:c.gives || seed.gives, text:c.text || seed.text},
      en: seed.locales.en
    };
    await store.set(`c:${seed.id}`, JSON.stringify(c));
  }
  await store.set(key, '1');
}

async function list(req, res){
  if(!(await rateOk(req, 'catalog', 900))) return fail(res, 429, 'rate_limited');
  try{ await upgradeSeedLocales(); }catch(e){}

  /* Одна программа целиком, вместе с фото упражнений. Отдельным запросом, потому
     что в общем списке фото сделали бы витрину неподъёмной: тридцать программ по
     полмегабайта картинок — это пятнадцать мегабайт на открытие экрана, где
     показывают одну строчку на программу. Фото нужны в момент добавления себе,
     тогда за ними и идём. */
  const one = String((req.query && req.query.item) || '').trim();
  if(one){
    if(!/^[ua][0-9a-z]{4,16}$/.test(one)) return fail(res, 400, 'bad_id');
    const raw = await store.get(`c:${one}`);
    if(!raw) return fail(res, 404, 'not_found');
    let c;
    try{ c = JSON.parse(raw); }catch(e){ return fail(res, 500, 'corrupt'); }
    if(c.status !== 'approved') return fail(res, 404, 'not_found');
    const loc = resolvedLocale(c, req.query && req.query.lang);
    const allowed = !c.pro || await premiumCatalogAccess(req);
    return send(res, 200, {item: {
      id: c.id, by: c.by, cat: c.cat, level: c.level, min: c.min, name: loc.name,
      gives: loc.gives, text: allowed ? loc.text : '', locale: loc.lang, pro: !!c.pro,
      exCount:+c.exCount||exerciseNames(loc.text).length,
      locked:!!c.pro && !allowed,
      cover: c.cover || null, media: allowed ? localizedMedia(c, loc.lang) : null,
      hasMedia:!!(c.media && Object.keys(c.media).length)
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
    items.push({id: c.id, by: c.by, cat: c.cat, level: c.level, min: c.min,
                name: loc.name, gives: loc.gives, text: c.pro ? '' : loc.text, locale: loc.lang, pro: !!c.pro,
                exCount:+c.exCount||exerciseNames(loc.text).length, locked:!!c.pro,
                cover: c.cover || null, hasMedia: !!(c.media && Object.keys(c.media).length)});
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
  const text  = String(it.text || '');
  const sourceBlock = {name, gives, text};
  const cat   = String(it.cat || '');
  const level = String(it.level || '');
  const min   = Math.max(1, Math.min(180, Math.round(+it.min || 0)));
  // Обложка уедет в атрибут <img src> у каждого, кто откроет каталог: проверяем
  // форму, а не длину.
  const cover = cleanPic(it.cover, 90000) || null;
  // Фото упражнений: карта «название → картинка». Режем и по числу, и по общему
  // весу — запись в хранилище не резиновая, а двадцать фото это уже фотоальбом.
  const media = {};
  let budget = 800 * 1024;
  for(const [k, v] of Object.entries((it.media && typeof it.media === 'object') ? it.media : {})){
    const key = clampLine(k, 60), val = cleanPic(v, budget);
    if(!key || !val) continue;
    media[key] = val;
    budget -= val.length;
    if(Object.keys(media).length >= 30) break;
  }
  const exCount = Math.round(+it.exCount || 0);

  const miss = [];
  if(name.length < 3) miss.push('название');
  if(gives.length < 20) miss.push('что даёт — хотя бы 20 символов');
  if(!GOALS.includes(cat)) miss.push('цель');
  if(!LEVELS.includes(level)) miss.push('уровень');
  if(exCount < 3) miss.push('хотя бы три упражнения');
  if(text.length < 60 || text.length > 60000) miss.push('текст программы');
  if(miss.length) return fail(res, 400, 'bad_item', {miss});

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
    id, by: handle, cat, level, min, name, gives, text, sourceLocale,
    locales: {[sourceLocale]: sourceBlock}, cover, media,
    exCount, status: 'pending', at: new Date().toISOString()
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
