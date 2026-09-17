/* GET /api/trainer/:handle — страница тренера глазами клиента.

   Отдаём то, что помогает решить «стоит ли этому человеку доверять»: имя, фото,
   о себе, стаж, ссылку на себя, сколько он с нами и сколько раз брали его
   программы. Ничего из этого не является тайной — страницу для того и открывают.

   Секреты (ключ правки профиля) наружу не уходят никогда. */

const { store } = require('./../_store');
const { send, fail, rateOk, cors } = require('./../_util');

module.exports = async (req, res) => {
  if(cors(req, res)) return;
  if(req.method !== 'GET') return fail(res, 405, 'method_not_allowed');
  if(!store.configured()) return fail(res, 503, 'no_store');
  if(!(await rateOk(req, 'trainer', 600))) return fail(res, 429, 'rate_limited');

  let handle = decodeURIComponent((req.query && req.query.handle) || '');
  if(handle && handle[0] !== '@') handle = '@' + handle;
  if(!/^@[\wа-яё.\-]{1,39}$/i.test(handle)) return fail(res, 400, 'bad_handle');

  // Профиль и оба счётчика — одним обращением: по отдельности это три пути до
  // базы, а она стоит не рядом с функцией.
  const [raw, programs, opens] = await store.many(
    [`t:${handle}`, `t:${handle}:programs`, `t:${handle}:opens`]);
  if(!raw) return fail(res, 404, 'not_found');

  let t;
  try{ t = JSON.parse(raw); }catch(e){ return fail(res, 500, 'corrupt'); }
  // Человек попросил себя забыть — запись осталась только для того, чтобы ник
  // не достался другому. Показывать по ней нечего, и «пусто» честнее «не найдено».
  if(t.deleted) return fail(res, 404, 'not_found');

  send(res, 200, {
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
};
