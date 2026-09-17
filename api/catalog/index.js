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

  const ask = String((req.query && req.query.status) || '').trim();
  if(ask){
    const ids = ask.split(',').filter(x => /^u[0-9a-z]{4,16}$/.test(x)).slice(0, 20);
    const out = {};
    for(const id of ids){
      const raw = await store.get(`c:${id}`);
      if(!raw){ out[id] = 'gone'; continue; }
      try{ out[id] = JSON.parse(raw).status || 'pending'; }catch(e){ out[id] = 'gone'; }
    }
    return send(res, 200, {status: out});
  }

  const ids = await store.list('c:approved');
  const items = [];
  for(const id of ids.slice(-200)){
    const raw = await store.get(`c:${id}`);
    if(!raw) continue;
    let c;
    try{ c = JSON.parse(raw); }catch(e){ continue; }
    if(c.status !== 'approved') continue;
    items.push({id: c.id, by: c.by, cat: c.cat, level: c.level, min: c.min,
                name: c.name, gives: c.gives, text: c.text});
  }
  send(res, 200, {items});
};
