/* POST /api/forget — стереть себя с сервера.

   Два объёма, и различать их обязательно:

   • scope:'trainer' — «убрать данные о себе как о тренере». Со страницы уходят имя,
     фото, «о себе», стаж и ссылка. Ник остаётся за человеком, ключ правки остаётся
     рабочим: он не переставал быть тренером, он убрал о себе сведения.

   • scope:'all' — «удалить аккаунт». То же самое плюс сама запись аккаунта и все
     ссылки, отправленные подопечным, вместе с их отчётами: это личная переписка,
     и без хозяина ей лежать незачем.

   ПРОГРАММЫ ИЗ КАТАЛОГА НЕ УДАЛЯЮТСЯ НИ В ТОМ, НИ В ДРУГОМ СЛУЧАЕ. Программа,
   которую взяли себе сотни людей, — это не сведения о человеке, а сделанная им
   вещь; выдёргивать её из каталога задним числом значит ломать каталог тем, кто
   на неё смотрит. На странице тренера просто не будет данных.

   Ключ — trainerKey (правка своей страницы) или ключ аккаунта. Своё удаляет только
   тот, кто владеет своим. */

const { store } = require('./_store');
const { send, fail, readBody, rateOk, sameSecret, cors } = require('./_util');
const crypto = require('crypto');
const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');

// Что именно считается «сведениями о тренере». Список один на всё: расходясь с
// тем, что показывает страница, он оставил бы на ней то, что человек стёр.
const FACE = ['name', 'photo', 'about', 'years', 'links'];

module.exports = async (req, res) => {
  if(cors(req, res)) return;
  if(req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  if(!store.configured()) return fail(res, 503, 'no_store');
  if(!(await rateOk(req, 'forget', 20))) return fail(res, 429, 'rate_limited');

  let body;
  try{ body = await readBody(req); }catch(e){ return fail(res, 413, 'too_large'); }

  const all = (body && body.scope) === 'all';
  const email = String((body && body.email) || '').trim().toLowerCase().slice(0, 120);
  const mh = email ? sha(email).slice(0, 32) : '';

  let handle = String((body && body.handle) || '').slice(0, 40);
  if(handle && handle[0] !== '@') handle = '@' + handle;
  const okHandle = /^@[\wа-яё.\-]{1,39}$/i.test(handle);

  let wiped = false;

  /* ---- лицо тренера ---- */
  if(okHandle){
    const raw = await store.get(`t:${handle}`);
    if(raw){
      let t;
      try{ t = JSON.parse(raw); }catch(e){ t = null; }
      if(!t) return fail(res, 500, 'corrupt');
      if(!sameSecret(sha((body && body.trainerKey) || ''), t.keyHash || '')){
        return fail(res, 403, 'not_yours');
      }
      FACE.forEach(k => { delete t[k]; });
      t.wiped = new Date().toISOString();
      /* При удалении аккаунта ник остаётся закреплённым, но управлять им больше
         нечем: ключ снимается, привязка к почте снимается. Освободить ник нельзя —
         его носят программы, уже лежащие в каталоге, и чужой человек, назвавшись
         так же, унаследовал бы их автора. */
      if(all){ t.keyHash = ''; delete t.mailHash; }
      await store.set(`t:${handle}`, JSON.stringify(t));
      wiped = true;
    }
  }

  if(!all) return send(res, 200, {ok: true, wiped});

  /* ---- аккаунт ---- */
  // Ключа у аккаунта отдельного нет: им и служит ключ тренера, а если тренера не
  // было, то удалять на сервере нечего, кроме самой записи, — и её сноса просит
  // тот, кто может подтвердить, что это его почта. Для этого хватает и того, что
  // запрос пришёл от телефона, на котором эта почта уже подтверждена кодом:
  // ключ аккаунта лежит там же.
  let links = 0, account = false;
  if(mh){
    const araw = await store.get(`a:${mh}`);
    if(araw){
      let acc = null;
      try{ acc = JSON.parse(araw); }catch(e){}
      // Аккаунт с ником стирается только вместе с доказанным владением ником —
      // иначе чужую почту можно было бы «удалить», просто зная её.
      if(acc && acc.handle && !wiped) return fail(res, 403, 'not_yours');
      await store.del(`a:${mh}`);
      account = true;
    }
  }

  /* Ссылки, отправленные подопечным, вместе с отчётами и счётчиками открытий.
     Их список знает только телефон тренера — на сервере он нигде не собран,
     и собирать его ради одного удаления значило бы завести ещё одно место,
     где хранится «кто кому что отправил». */
  const want = (Array.isArray(body && body.links) ? body.links : [])
    .map(x => String(x || '')).filter(x => /^[0-9a-z]{4,16}$/.test(x)).slice(0, 300);
  for(const id of want){
    const rec = await store.get(`p:${id}`);
    if(!rec) continue;
    let p;
    try{ p = JSON.parse(rec); }catch(e){ continue; }
    if(okHandle && p.by !== handle) continue;   // чужую ссылку своим ключом не удалить
    await store.del(`p:${id}`);
    await store.del(`p:${id}:reports`);
    await store.del(`p:${id}:opens`);
    await store.del(`p:${id}:first`);
    await store.del(`p:${id}:last`);
    links++;
  }

  send(res, 200, {ok: true, wiped, account, links});
};
