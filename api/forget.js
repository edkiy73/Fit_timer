/* POST /api/forget — тренер стирает себя с сервера.

   Пока этого не было, «Удалить все данные» стирало телефон и НЕ трогало сервер:
   страница тренера с именем и фотографией оставалась висеть навсегда, программы
   продолжали лежать в каталоге под ником, которым больше некому управлять, а ключ
   правки уходил вместе с телефоном — то есть исправить или убрать это не мог уже
   никто, включая самого человека. Для 152-ФЗ этого мало: согласие должно отзываться
   целиком, а не наполовину.

   Что уходит: имя, фото, «о себе», стаж, ссылка, все программы, предложенные в
   каталог, и все ссылки, отправленные подопечным, вместе с их отчётами.

   Что остаётся и почему:
   • САМ НИК. Запись превращается в надгробие без единого поля и без ключа — ник
     закреплён, но им уже нельзя воспользоваться. Освободить его значит позволить
     кому угодно назваться им и унаследовать чужие старые ссылки.
   • КОПИИ ПРОГРАММ у тех, кто уже добавил их себе. Это копии на чужих телефонах,
     и обещать их удаление было бы враньём.

   Ключ — тот же trainerKey, которым тренер правит свою страницу. Своё удаляет
   только тот, кто владеет своим. */

const { store } = require('./_store');
const { send, fail, readBody, rateOk, sameSecret, cors } = require('./_util');
const crypto = require('crypto');
const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');

module.exports = async (req, res) => {
  if(cors(req, res)) return;
  if(req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  if(!store.configured()) return fail(res, 503, 'no_store');
  if(!(await rateOk(req, 'forget', 20))) return fail(res, 429, 'rate_limited');

  let body;
  try{ body = await readBody(req); }catch(e){ return fail(res, 413, 'too_large'); }

  let handle = String((body && body.handle) || '').slice(0, 40);
  if(handle && handle[0] !== '@') handle = '@' + handle;
  if(!/^@[\wа-яё.\-]{1,39}$/i.test(handle)) return fail(res, 400, 'bad_handle');

  const raw = await store.get(`t:${handle}`);
  if(!raw) return fail(res, 404, 'not_found');
  let t;
  try{ t = JSON.parse(raw); }catch(e){ return fail(res, 500, 'corrupt'); }
  if(!sameSecret(sha((body && body.trainerKey) || ''), t.keyHash || '')){
    return fail(res, 403, 'not_yours');
  }

  /* Программы в каталоге. Перебрать все ключи базы нельзя, но оба списка заявок
     лежат рядом и коротки — по ним и идём. Записи СТИРАЕМ, а не помечаем: в них
     лежит ник автора и его фотографии упражнений. */
  let items = 0;
  const lists = await Promise.all([store.list('c:pending'), store.list('c:approved')]);
  const ids = [...new Set([].concat(lists[0] || [], lists[1] || []))].slice(-600);
  const raws = await store.many(ids.map(id => `c:${id}`));
  const drop = [];
  raws.forEach((r, i) => {
    if(!r) return;
    try{ if(JSON.parse(r).by === handle) drop.push(ids[i]); }catch(e){}
  });
  for(const id of drop){
    await store.del(`c:${id}`);
    items++;
  }

  /* Ссылки, отправленные подопечным, вместе с отчётами и счётчиками открытий.
     Их список знает только телефон тренера — на сервере он нигде не собран,
     и собирать его ради одного удаления значило бы завести ещё одно место,
     где хранится «кто кому что отправил». */
  let links = 0;
  const want = (Array.isArray(body && body.links) ? body.links : [])
    .map(x => String(x || '')).filter(x => /^[0-9a-z]{4,16}$/.test(x)).slice(0, 300);
  for(const id of want){
    const rec = await store.get(`p:${id}`);
    if(!rec) continue;
    let p;
    try{ p = JSON.parse(rec); }catch(e){ continue; }
    if(p.by !== handle) continue;   // чужую ссылку своим ключом не удалить
    await store.del(`p:${id}`);
    await store.del(`p:${id}:reports`);
    await store.del(`p:${id}:opens`);
    await store.del(`p:${id}:first`);
    await store.del(`p:${id}:last`);
    links++;
  }

  await store.del(`t:${handle}:programs`);
  await store.del(`t:${handle}:opens`);
  // Привязку почты убираем обеими сторонами: иначе по старому адресу можно было бы
  // «восстановить» ник, у которого уже ничего нет.
  if(t.mailHash) await store.del(`e:${t.mailHash}`);

  // Надгробие: ник занят, полей нет, ключа нет — значит, править нечего и некому.
  await store.set(`t:${handle}`, JSON.stringify({
    handle, deleted: true, at: new Date().toISOString(), keyHash: ''
  }));

  send(res, 200, {ok: true, items, links});
};
