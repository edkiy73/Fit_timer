/* /api/trainer/:handle — страница тренера: читать и править.

   GET — то, что видит подопечный. Отдаём то, что помогает решить «стоит ли этому
   человеку доверять»: имя, фото, о себе, стаж, ссылку на себя, сколько он с нами и
   сколько раз брали его программы. Ничего из этого не является тайной — страницу
   для того и открывают. Секреты (ключ правки) наружу не уходят никогда.

   POST — тренер правит её у себя. Страница тренера существует только вместе с
   подтверждённым аккаунтом: устройство доказывает вход отдельным syncToken.
   Старый trainerKey сохраняем для ссылок и каталога, но он больше не заменяет
   аккаунт при сохранении страницы.

   Раньше правка жила отдельным файлом /api/profile. Разными их делал только
   глагол: страница одна, и Vercel на бесплатном плане считает каждый файл
   отдельной функцией, которых там всего двенадцать. */
require('../../lib/product');

const { store } = require('../../../../packages/core/server/store');
const { send, fail, readBody, rateOk, rndId, sameSecret, cors,
        clampText, clampLine, cleanPic, cleanLink } = require('../../../../packages/core/server/util');
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

  const email = String((body && body.email) || '').trim().toLowerCase().slice(0, 120);
  const deviceId = String((body && body.deviceId) || '').trim().slice(0, 80);
  const token = String((body && body.token) || '');
  if(!/^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/.test(email) || !deviceId || !token){
    return fail(res, 401, 'account_required');
  }
  const mailHash = sha(email).slice(0, 32);
  let account = null;
  try{ account = JSON.parse(await store.get(`a:${mailHash}`)); }catch(e){}
  const device = account && account.syncDevices && account.syncDevices[deviceId];
  if(!device || !sameSecret(sha(token), device.h || '')) return fail(res, 403, 'bad_sync_token');
  if(account.handle && account.handle !== handle) return fail(res, 403, 'not_yours');

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
       keyHash: sha(key), mailHash}, fields)));
    account.handle = handle;
    await store.set(`h:${handle}`, mailHash);
    await store.set(`a:${mailHash}`, JSON.stringify(account));
    // Отдельный список ников: пройти по всем ключам базы нельзя, а перечислить
    // тренеров в админке надо.
    await store.push('t:all', handle);
    return send(res, 200, {ok: true, trainerKey: key, claimed: true});
  }

  let cur;
  try{ cur = JSON.parse(raw); }catch(e){ return fail(res, 500, 'corrupt'); }
  if(!account.handle){
    const legacyKeyOk = sameSecret(sha(body.trainerKey || ''), cur.keyHash || '');
    if((cur.mailHash && cur.mailHash !== mailHash) || (!cur.mailHash && !legacyKeyOk)){
      return fail(res, 409, 'handle_taken');
    }
    account.handle = handle;
    await store.set(`h:${handle}`, mailHash);
    await store.set(`a:${mailHash}`, JSON.stringify(account));
  }
  if(cur.mailHash && cur.mailHash !== mailHash) return fail(res, 409, 'handle_taken');
  cur.mailHash = mailHash;
  cur.seen = new Date().toISOString();   // когда тренер последний раз давал о себе знать
  delete cur.wiped;                      // снова заполнил — значит, уже не пусто
  await store.set(`t:${handle}`, JSON.stringify(Object.assign(cur, fields)));
  send(res, 200, {ok: true});
};
