/* POST /api/admin — всё управление каталогом одной дверью.

   Одна точка вместо десятка файлов: действий много, но все они об одном и том же
   и все требуют одного и того же ключа. Разносить их по файлам — значит повторить
   проверку ключа десять раз и десять раз ошибиться в ней по-разному.

   Ключ — ADMIN_KEY в переменных окружения, передаётся заголовком, а не в адресе:
   адрес попадает в историю браузера и в журналы, заголовок — нет. */

const { store } = require('../lib/store');
const { send, fail, readBody, rndId, sameSecret, cors,
        clampText, clampLine, cleanPic } = require('../lib/util');
const { getSettings, sanitizeSettings, providerStatus, generate } = require('../lib/ai');
const { handleAI } = require('../lib/ai-endpoint');

const GOALS = ['slim', 'tone', 'glut', 'core', 'power', 'relief', 'flex', 'back', 'post', 'cardio'];
const LEVELS = ['Новичок', 'Средний', 'Продвинутый'];
const clean = (v, n) => String(v == null ? '' : v).slice(0, n);

const LANGS = ['ru', 'en'];
const normLocale = v => LANGS.includes(String(v || '').toLowerCase()) ? String(v).toLowerCase() : 'ru';

function cleanLocaleBlock(v){
  if(!v || typeof v !== 'object') return null;
  return {
    name: clampLine(v.name, 60),
    gives: clampText(v.gives, 300),
    text: clean(v.text, 60000)
  };
}
function normalizeCatalogText(it, fallbackSource){
  const sourceLocale = normLocale((it && it.sourceLocale) || fallbackSource);
  const locales = {};
  const src = (it && it.locales && typeof it.locales === 'object') ? it.locales : {};
  LANGS.forEach(lang => {
    const block = cleanLocaleBlock(src[lang]);
    if(block && (block.name || block.gives || block.text)) locales[lang] = block;
  });
  // Совместимость со старыми записями и заявками: верхний уровень — оригинал.
  if(!locales[sourceLocale] && it && (it.name || it.gives || it.text)){
    locales[sourceLocale] = cleanLocaleBlock({name:it.name, gives:it.gives, text:it.text});
  }
  return {sourceLocale, locales};
}
function localeMiss(block, label){
  const miss = [];
  if(!block || clean(block.name, 60).trim().length < 3) miss.push(label + ': название');
  if(!block || clean(block.gives, 300).trim().length < 20) miss.push(label + ': что даёт');
  if(!block || clean(block.text, 60000).length < 60) miss.push(label + ': текст программы');
  return miss;
}
const TRANSLATABLE_KEYS = new Set([
  'ПРОГРАММА', 'ОПИСАНИЕ ПРОГРАММЫ', 'УПРАЖНЕНИЕ', 'ОПИСАНИЕ',
  'ОШИБКИ', 'ЗАМЕНА', 'ОПИСАНИЕ ЗАМЕНЫ'
]);
function protocolShape(text){
  return String(text || '').split(/\r?\n/).map(line => {
    const m = line.match(/^([А-ЯЁ][А-ЯЁ ]{1,40}):\s*(.*)$/);
    if(!m) return '';
    // В переводе меняются только человекочитаемые тексты. Повторы, вес, отдых,
    // дни, формат, прогрессия и порядок блоков обязаны быть буквально теми же.
    return m[1] + ':' + (TRANSLATABLE_KEYS.has(m[1]) ? '<text>' : m[2].trim());
  }).filter(Boolean);
}
function syncSourceFields(c, norm){
  const src = norm.locales[norm.sourceLocale] || norm.locales.ru || norm.locales.en;
  c.sourceLocale = norm.sourceLocale;
  c.locales = norm.locales;
  if(src){
    c.name = src.name;
    c.gives = src.gives;
    c.text = src.text;
  }
}

// Карта «название упражнения → картинка». Режем и по числу, и по общему весу:
// запись в хранилище не резиновая, а тридцать фото — это уже не программа.
function pics(src){
  const out = {};
  let budget = 800 * 1024;
  for(const [k, v] of Object.entries((src && typeof src === 'object') ? src : {})){
    // Проверяем ФОРМУ: картинка уедет в атрибут <img src> у каждого, кто откроет
    // страницу программы, и «начинается на data:image/» этого не гарантирует.
    const key = clampLine(k, 60), val = cleanPic(v, budget);
    if(!key || !val) continue;
    out[key] = val;
    budget -= val.length;
    if(Object.keys(out).length >= 30) break;
  }
  return out;
}

async function readItems(listKey, want){
  const ids = (await store.list(listKey)).slice(-300);
  const raws = await store.many(ids.map(id => `c:${id}`));
  const out = [];
  raws.forEach(raw => {
    if(!raw) return;
    try{
      const c = JSON.parse(raw);
      if(!want || c.status === want) out.push(c);
    }catch(e){}
  });
  return out;
}

// Метаданные общие для обоих языков, текст — отдельный. В каталог публикуем
// только запись, у которой готовы RU и EN и не разъехалась машинная структура.
function checkItem(it, opts){
  opts = opts || {};
  const norm = normalizeCatalogText(it, opts.fallbackSource || 'ru');
  const miss = [];
  if(!GOALS.includes(it.cat)) miss.push('цель');
  if(!LEVELS.includes(it.level)) miss.push('уровень');
  const required = opts.requireBoth ? LANGS : [norm.sourceLocale];
  required.forEach(lang => miss.push(...localeMiss(norm.locales[lang], lang.toUpperCase())));
  const bothReady = LANGS.every(lang => localeMiss(norm.locales[lang], lang.toUpperCase()).length === 0);
  if(bothReady){
    const ruShape = protocolShape(norm.locales.ru.text);
    const enShape = protocolShape(norm.locales.en.text);
    if(!ruShape.length || JSON.stringify(ruShape) !== JSON.stringify(enShape)){
      miss.push('RU/EN: структура программы должна совпадать');
    }
  }
  return {miss, sourceLocale:norm.sourceLocale, locales:norm.locales};
}

module.exports = async (req, res) => {
  if(req.query && (req.query.ai_endpoint === '1' || req.query.public_config === '1')) return handleAI(req, res);
  if(cors(req, res)) return;
  if(req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  if(!store.configured()) return fail(res, 503, 'no_store');

  const admin = process.env.ADMIN_KEY || '';
  if(!admin) return fail(res, 503, 'no_admin_key');
  // Заголовок приходит закодированным — в него можно положить только ASCII,
  // а ключ бывает любым. Кривую кодировку считаем неверным ключом, а не падаем.
  let given = String(req.headers['x-admin-key'] || '');
  try{ given = decodeURIComponent(given); }catch(e){ return fail(res, 403, 'bad_key'); }
  if(!sameSecret(given, admin)) return fail(res, 403, 'bad_key');

  let body;
  try{ body = await readBody(req); }catch(e){ return fail(res, 413, 'too_large'); }
  const a = (body && body.action) || '';
  const id = clean(body && body.id, 20);

  /* ---- что происходит в каталоге ---- */
  if(a === 'overview'){
    const [pending, approved, settings] = await Promise.all([
      readItems('c:pending', 'pending'),
      readItems('c:approved', 'approved'),
      getSettings()
    ]);
    // Тренеры: те, кто хоть раз отметился. Список ников лежит отдельно, потому что
    // пройти по всем ключам базы нельзя — и не нужно.
    const handles = await store.list('t:all');
    const raws = await store.many(handles.map(h => `t:${h}`));
    const counts = await store.pipe(handles.flatMap(h => [
      ['GET', `t:${h}:programs`], ['GET', `t:${h}:opens`]
    ]));
    const trainers = [];
    raws.forEach((raw, i) => {
      if(!raw) return;
      try{
        const t = JSON.parse(raw);
        trainers.push({handle: t.handle, name: t.name || '', about: t.about || '',
                       years: t.years == null ? null : t.years, links: t.links || '',
                       since: t.since || null, seen: t.seen || null, banned: !!t.banned,
                       programs: +counts[i * 2] || 0, opens: +counts[i * 2 + 1] || 0});
      }catch(e){}
    });
    return send(res, 200, {pending, approved, trainers, settings, providers:providerStatus()});
  }

  /* ---- ИИ, тариф и платёжные идентификаторы ----
     Секретных ключей здесь нет: они остаются в окружении сервера. Админка меняет
     только маршрутизацию, модели, лимиты и отображаемую цену. */
  if(a === 'save_settings'){
    const settings = sanitizeSettings(body && body.settings);
    await store.set('settings:ai', JSON.stringify(settings));
    return send(res, 200, {ok:true, settings});
  }

  if(a === 'test_ai'){
    const type = body && body.type === 'image' ? 'image' : 'text';
    const settings = await getSettings();
    try{
      const out = await generate(type, settings, type === 'image'
        ? 'Minimal flat fitness app icon, violet on dark background, no text'
        : 'Ответь ровно одним словом: работает');
      return send(res, 200, {ok:true, provider:out.provider, model:out.model,
        fallback:out.fallback, result:type === 'text' ? out.text.slice(0,100) : 'image'});
    }catch(e){
      return fail(res, 502, 'ai_test_failed', {detail:String(e.message || e).slice(0,500)});
    }
  }

  /* ---- перевод каталога по запросу модератора ----
     Никаких автоматических переводов при отправке: тратим ИИ только на заявку,
     которую действительно решили готовить к публикации. Ручной ввод в админке
     остаётся полноценным запасным путём. */
  if(a === 'translate_catalog'){
    const from = normLocale(body && body.from);
    const to = normLocale(body && body.to);
    if(from === to) return fail(res, 400, 'same_locale');
    const source = cleanLocaleBlock(body && body.locale);
    const bad = localeMiss(source, from.toUpperCase());
    if(bad.length) return fail(res, 400, 'bad_source_locale', {miss:bad});
    const names = {ru:'Russian', en:'English'};
    const prompt =
      'Translate this fitness catalog entry from ' + names[from] + ' to ' + names[to] + '.\n' +
      'Return ONLY valid JSON with exactly these keys: name, gives, text. No Markdown.\n' +
      'In text, keep every protocol label before the colon EXACTLY unchanged (for example ПРОГРАММА, ДНИ, КРУГИ, УПРАЖНЕНИЕ, ОПИСАНИЕ, ФОРМАТ, ЗНАЧЕНИЕ, ПОДХОДЫ, ОТДЫХ, ШАГ, ПОТОЛОК).\n' +
      'Keep line order, blank lines, numbers, day tokens, boolean/control values and format values unchanged. ' +
      'Translate only human-readable names and prose: program/exercise names, descriptions, muscles, mistakes, replacements.\n' +
      'Do not add, remove, reorder or change exercises or workout mechanics.\n\nSOURCE JSON:\n' +
      JSON.stringify(source);
    try{
      const settings = await getSettings();
      const out = await generate('text', settings, prompt);
      const raw = String(out.text || '').trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/, '');
      let parsed;
      try{ parsed = JSON.parse(raw); }catch(e){ return fail(res, 502, 'translation_bad_json'); }
      const locale = cleanLocaleBlock(parsed);
      const miss = localeMiss(locale, to.toUpperCase());
      if(miss.length) return fail(res, 502, 'translation_incomplete', {miss});
      if(JSON.stringify(protocolShape(source.text)) !== JSON.stringify(protocolShape(locale.text))){
        return fail(res, 502, 'translation_changed_structure');
      }
      return send(res, 200, {ok:true, locale, provider:out.provider, model:out.model, fallback:out.fallback});
    }catch(e){
      return fail(res, 502, 'translation_failed', {detail:String(e.message || e).slice(0,500)});
    }
  }

  /* ---- решение по заявке ---- */
  if(a === 'approve' || a === 'reject'){
    const raw = await store.get(`c:${id}`);
    if(!raw) return fail(res, 404, 'not_found');
    const c = JSON.parse(raw);
    if(a === 'approve'){
      const checked = checkItem(c, {requireBoth:true, fallbackSource:c.sourceLocale || 'ru'});
      if(checked.miss.length) return fail(res, 400, 'missing_locales', {miss:checked.miss});
      syncSourceFields(c, checked);
    }
    c.status = a === 'approve' ? 'approved' : 'rejected';
    /* Доступ решается ЗДЕСЬ, а не тренером в заявке: «премиум» — это про то, что
       мы продаём, и отдавать этот рычаг тому, кто программу прислал, значит
       получить премиум-каталог из всего, что прислали. */
    if(a === 'approve' && body.pro !== undefined) c.pro = !!body.pro;
    await store.set(`c:${id}`, JSON.stringify(c));
    if(a === 'approve') await store.push('c:approved', id);
    return send(res, 200, {ok: true, status: c.status, pro: !!c.pro});
  }

  /* ---- открыть или закрыть программу подпиской ----
     Отдельным действием, а не только в правке: это решение принимают на витрине,
     глядя на список, и ради одного переключателя открывать всю форму незачем. */
  if(a === 'pro'){
    const raw = await store.get(`c:${id}`);
    if(!raw) return fail(res, 404, 'not_found');
    const c = JSON.parse(raw);
    c.pro = !!(body && body.pro);
    await store.set(`c:${id}`, JSON.stringify(c));
    return send(res, 200, {ok: true, pro: c.pro});
  }

  /* ---- закрыть или вернуть тренера ---- */
  if(a === 'ban' || a === 'unban'){
    const handle = clean(body && body.handle, 40);
    const raw = await store.get(`t:${handle}`);
    if(!raw) return fail(res, 404, 'not_found');
    const t = JSON.parse(raw);
    t.banned = a === 'ban';
    await store.set(`t:${handle}`, JSON.stringify(t));
    return send(res, 200, {ok: true, banned: t.banned});
  }

  /* ---- добавить программу от себя ---- */
  if(a === 'add'){
    const it = (body && body.item) || {};
    const checked = checkItem(it, {requireBoth:true, fallbackSource:it.sourceLocale || 'ru'});
    if(checked.miss.length) return fail(res, 400, 'bad_item', {miss:checked.miss});
    const newId = 'a' + rndId(7);
    const c = {
      id: newId, by: clean(it.by, 40), cat: it.cat, level: it.level,
      min: Math.max(1, Math.min(180, Math.round(+it.min || 20))),
      cover: cleanPic(it.cover, 90000) || null, media: pics(it.media),
      exCount: Math.max(0, Math.round(+it.exCount || 0)),
      pro: !!it.pro,
      status: 'approved', at: new Date().toISOString(), mine: true
    };
    syncSourceFields(c, checked);
    await store.set(`c:${newId}`, JSON.stringify(c));
    await store.push('c:approved', newId);
    return send(res, 200, {ok: true, id: newId});
  }

  /* ---- поправить уже лежащее ---- */
  if(a === 'edit'){
    const raw = await store.get(`c:${id}`);
    if(!raw) return fail(res, 404, 'not_found');
    const c = JSON.parse(raw);
    const incoming = (body && body.item) || {};
    const it = Object.assign({}, c, incoming);
    if(incoming.locales !== undefined){
      it.locales = Object.assign({}, c.locales || {}, incoming.locales || {});
    }
    const touchesLegacyText = incoming.name !== undefined || incoming.gives !== undefined || incoming.text !== undefined;
    if(incoming.locales === undefined && touchesLegacyText){
      // Старый админ/API правил name/gives/text напрямую. Не игнорируем такую правку:
      // она относится к исходному языку, а второй язык остаётся как был.
      const base = normalizeCatalogText(c, c.sourceLocale || 'ru');
      const srcLang = normLocale(incoming.sourceLocale || base.sourceLocale);
      it.sourceLocale = srcLang;
      it.locales = Object.assign({}, base.locales);
      it.locales[srcLang] = Object.assign({}, it.locales[srcLang] || {});
      ['name','gives','text'].forEach(k => { if(incoming[k] !== undefined) it.locales[srcLang][k] = incoming[k]; });
    }
    const touchesText = incoming.locales !== undefined || incoming.sourceLocale !== undefined || touchesLegacyText;
    const checked = checkItem(it, {
      requireBoth: c.status === 'approved' && touchesText,
      fallbackSource:c.sourceLocale || 'ru'
    });
    if(checked.miss.length) return fail(res, 400, 'bad_item', {miss:checked.miss});
    // Правка идёт теми же пределами, что и добавление: разойдясь, они дают
    // каталог, в который через правку попадает то, что не прошло бы при добавлении.
    if(touchesText) syncSourceFields(c, checked);
    if(it.by    != null) c.by    = clampLine(it.by, 40);
    ['cat', 'level'].forEach(k => { if(it[k] != null) c[k] = clean(it[k], 40); });
    if(it.min != null) c.min = Math.max(1, Math.min(180, Math.round(+it.min || 20)));
    if(it.cover !== undefined) c.cover = cleanPic(it.cover, 90000) || null;
    if(it.exCount != null) c.exCount = Math.max(0, Math.round(+it.exCount || 0));
    if(it.pro !== undefined) c.pro = !!it.pro;
    // Картинки правятся целиком: присланная карта заменяет прежнюю, поэтому убрать
    // фото можно тем же действием, каким его добавляют.
    if(it.media !== undefined) c.media = pics(it.media);
    await store.set(`c:${id}`, JSON.stringify(c));
    return send(res, 200, {ok: true});
  }

  /* ---- убрать из каталога ----
     Запись помечаем удалённой, а не стираем: витрина отдаёт только approved,
     а по id ещё может прийти запрос от того, кто успел её добавить. */
  if(a === 'remove'){
    const raw = await store.get(`c:${id}`);
    if(!raw) return fail(res, 404, 'not_found');
    const c = JSON.parse(raw);
    c.status = 'removed';
    await store.set(`c:${id}`, JSON.stringify(c));
    return send(res, 200, {ok: true});
  }

  /* ---- залить стартовый набор ----
     Нужно ровно один раз, чтобы каталогу было чем открыться. Повторный вызов
     ничего не портит: программы с теми же id перезаписываются, а не двоятся. */
  if(a === 'seed'){
    const { SEED_ITEMS, SEED_TRAINERS } = require('../lib/seed');
    const now = new Date().toISOString();
    for(const [handle, t] of Object.entries(SEED_TRAINERS)){
      if(await store.get(`t:${handle}`)) continue;
      await store.push('t:all', handle);
      await store.set(`t:${handle}`, JSON.stringify(Object.assign(
        {handle, since: now, seen: now, keyHash: '', years: null, links: ''}, t)));
    }
    const have = new Set((await store.list('c:approved')));
    for(const it of SEED_ITEMS){
      await store.set(`c:${it.id}`, JSON.stringify(Object.assign(
        {status: 'approved', at: now, cover: null}, it)));
      if(!have.has(it.id)){
        await store.push('c:approved', it.id);
        // Счётчик программ автора: без него на его странице и в списке тренеров
        // значилось «0 программ» рядом с его же программой в каталоге.
        if(it.by) await store.incr(`t:${it.by}:programs`);
      }
    }
    return send(res, 200, {ok: true, items: SEED_ITEMS.length});
  }

  fail(res, 400, 'unknown_action');
};
