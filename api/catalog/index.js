/* GET /api/catalog — что уже прошло проверку.

   Отдаём позиции ровно в том виде, в каком они лежат в приложении (STORE_ITEMS):
   приложение не должно знать, зашита программа или пришла с сервера.

   GET /api/catalog?status=<id1,id2> — узнать, что стало с предложенными: тренеру
   нужно видеть «на проверке», «в каталоге» или «отклонено», иначе он жмёт кнопку
   ещё раз и думает, что сломалось. */

const { store } = require('./../_store');
const { send, fail, rateOk, cors } = require('./../_util');

module.exports = async (req, res) => {
  if(cors(req, res)) return;
  if(req.method !== 'GET') return fail(res, 405, 'method_not_allowed');
  if(!store.configured()) return fail(res, 503, 'no_store');
  if(!(await rateOk(req, 'catalog', 900))) return fail(res, 429, 'rate_limited');

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
    return send(res, 200, {item: {
      id: c.id, by: c.by, cat: c.cat, level: c.level, min: c.min, name: c.name,
      gives: c.gives, text: c.text, cover: c.cover || null, media: c.media || null
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
    items.push({id: c.id, by: c.by, cat: c.cat, level: c.level, min: c.min,
                name: c.name, gives: c.gives, text: c.text,
                cover: c.cover || null, hasMedia: !!(c.media && Object.keys(c.media).length)});
  });
  send(res, 200, {items});
};
