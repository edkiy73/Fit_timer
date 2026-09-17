/* POST /api/profile — тренер правит свою страницу.

   Раньше профиль уезжал ТОЛЬКО вместе со ссылкой на программу. Из-за этого
   заполнение «О себе» и «Стаж» в аккаунте не делало ничего видимого: страница
   обновлялась лишь при следующей отправке программы, а до неё клиент видел пусто.
   Человек заполняет поля и ждёт результата сейчас, а не когда-нибудь.

   Ник закрепляется за первым, кто им воспользовался; дальше правки требуют ключа,
   выданного при закреплении. Это единственная защита, возможная без аккаунтов. */

const { store } = require('./_store');
const { send, fail, readBody, rateOk, rndId, sameSecret, cors } = require('./_util');
const crypto = require('crypto');
const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');

const clean = (v, n) => String(v == null ? '' : v).slice(0, n);

module.exports = async (req, res) => {
  if(cors(req, res)) return;
  if(req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  if(!store.configured()) return fail(res, 503, 'no_store');
  if(!(await rateOk(req, 'profile', 120))) return fail(res, 429, 'rate_limited');

  let body;
  try{ body = await readBody(req); }catch(e){ return fail(res, 413, 'too_large'); }

  let handle = clean(body && body.handle, 40);
  if(handle && handle[0] !== '@') handle = '@' + handle;
  if(!/^@[\wа-яё.\-]{1,39}$/i.test(handle)) return fail(res, 400, 'bad_handle');

  const p = (body && body.trainer) || {};
  const fields = {
    name:  clean(p.name, 40),
    photo: clean(p.photo, 120000),
    about: clean(p.about, 400),
    years: typeof p.years === 'number' ? Math.max(0, Math.min(60, Math.round(p.years))) : null,
    links: clean(p.links, 120)
  };

  const raw = await store.get(`t:${handle}`);
  if(!raw){
    const key = rndId(24);
    await store.set(`t:${handle}`, JSON.stringify(Object.assign(
      {handle, since: new Date().toISOString(), keyHash: sha(key)}, fields)));
    return send(res, 200, {ok: true, trainerKey: key, claimed: true});
  }

  let cur;
  try{ cur = JSON.parse(raw); }catch(e){ return fail(res, 500, 'corrupt'); }
  if(!sameSecret(sha(body.trainerKey || ''), cur.keyHash || '')){
    // Ник занят кем-то другим. Это не ошибка ввода, и человеку надо сказать прямо,
    // а не оставлять в недоумении, почему страница не меняется.
    return fail(res, 409, 'handle_taken');
  }
  await store.set(`t:${handle}`, JSON.stringify(Object.assign(cur, fields)));
  send(res, 200, {ok: true});
};
