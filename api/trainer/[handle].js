/* /api/trainer/:handle — страница тренера: читать и править.

   GET — то, что видит подопечный. Отдаём то, что помогает решить «стоит ли этому
   человеку доверять»: имя, фото, о себе, стаж, ссылку на себя, сколько он с нами и
   сколько раз брали его программы. Ничего из этого не является тайной — страницу
   для того и открывают. Секреты (ключ правки) наружу не уходят никогда.

   POST — тренер правит её у себя. Ник закрепляется за ПЕРВЫМ, кто им
   воспользовался; дальше правки требуют ключа, выданного при закреплении. Это
   единственная защита, возможная без аккаунтов, а с аккаунтом ключ возвращается
   по почте.

   Раньше правка жила отдельным файлом /api/profile. Разными их делал только
   глагол: страница одна, и Vercel на бесплатном плане считает каждый файл
   отдельной функцией, которых там всего двенадцать. */

const { store } = require('../../lib/store');
const { send, fail, readBody, rateOk, rndId, sameSecret, cors,
        clampText, clampLine, cleanPic, cleanLink } = require('../../lib/util');
const crypto = require('crypto');
const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');


module.exports = async (req, res) => {
  if(cors(req, res)) return;
  if(!store.configured()) return fail(res, 503, 'no_store');

  let handle = decodeURIComponent((req.query && req.query.handle) || '');
  if(handle && handle[0] !== '@') handle = '@' + handle;
  if(!/^@[\wа-яё.\-]{1,39}$/i.test(handle)) return fail(res, 400, 'bad_handle');

  /* ---- подопечный смотрит страницу ---- */
  if(req.method === 'GET'){
    if(!(await rateOk(req, 'trainer', 600))) return fail(res, 429, 'rate_limited');

    // Профиль и оба счётчика — одним обращением: по отдельности это три пути до
    // базы, а она стоит не рядом с функцией.
    const [raw, programs, opens] = await store.many(
      [`t:${handle}`, `t:${handle}:programs`, `t:${handle}:opens`]);
    if(!raw) return fail(res, 404, 'not_found');

    let t;
    try{ t = JSON.parse(raw); }catch(e){ return fail(res, 500, 'corrupt'); }
    /* Данные о себе человек мог стереть (`wiped`). Страница при этом ОСТАЁТСЯ и
       отвечает 200 с пустыми полями: на неё ведут программы, которые лежат в
       каталоге и никуда не делись. «Не найдено» ломало бы вход с них на ровном
       месте — пустых блоков страница и так не рисует. */

    return send(res, 200, {
      handle: t.handle,
      name: t.name || '',
      photo: t.photo || '',
      about: t.about || '',
      years: t.years == null ? null : t.years,
      links: t.links || '',
      since: t.since || null,
      programs: +programs || 0,
      opens: +opens || 0
    });
  }

  /* ---- тренер правит свою страницу ----

     Раньше профиль уезжал ТОЛЬКО вместе со ссылкой на программу. Из-за этого
     заполнение «О себе» и «Стаж» не делало ничего видимого: страница обновлялась
     лишь при следующей отправке программы, а до неё подопечный видел пусто.
     Человек заполняет поля и ждёт результата сейчас, а не когда-нибудь. */
  if(req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  if(!(await rateOk(req, 'profile', 120))) return fail(res, 429, 'rate_limited');

  let body;
  try{ body = await readBody(req); }catch(e){ return fail(res, 413, 'too_large'); }

  /* Поля чистим ЗДЕСЬ, а не полагаемся на приложение: запрос приходит не только
     из него. Страницу тренера читают чужие люди — отдавать им строку в мегабайт,
     невидимые символы посреди имени или «ссылку» javascript: мы не будем. */
  const p = (body && body.trainer) || {};
  const fields = {
    name:  clampLine(p.name, 40),
    photo: cleanPic(p.photo, 120000),
    about: clampText(p.about, 400),
    years: typeof p.years === 'number' ? Math.max(0, Math.min(60, Math.round(p.years))) : null,
    links: cleanLink(p.links, 120)
  };

  const raw = await store.get(`t:${handle}`);
  if(!raw){
    const key = rndId(24);
    await store.set(`t:${handle}`, JSON.stringify(Object.assign(
      {handle, since: new Date().toISOString(), seen: new Date().toISOString(),
       keyHash: sha(key)}, fields)));
    // Отдельный список ников: пройти по всем ключам базы нельзя, а перечислить
    // тренеров в админке надо.
    await store.push('t:all', handle);
    return send(res, 200, {ok: true, trainerKey: key, claimed: true});
  }

  let cur;
  try{ cur = JSON.parse(raw); }catch(e){ return fail(res, 500, 'corrupt'); }
  if(!sameSecret(sha(body.trainerKey || ''), cur.keyHash || '')){
    // Ник занят кем-то другим. Это не ошибка ввода, и человеку надо сказать прямо,
    // а не оставлять в недоумении, почему страница не меняется.
    return fail(res, 409, 'handle_taken');
  }
  cur.seen = new Date().toISOString();   // когда тренер последний раз давал о себе знать
  delete cur.wiped;                      // снова заполнил — значит, уже не пусто
  await store.set(`t:${handle}`, JSON.stringify(Object.assign(cur, fields)));
  send(res, 200, {ok: true});
};
