/* GET /api/p/:id — забрать программу по короткой ссылке.

   Открыто всем, у кого есть ссылка, и это сказано человеку прямо в интерфейсе:
   защищать пока нечего. Каждое открытие считается — по этому счётчику тренер
   видит «ссылку открыли», чего раньше не мог узнать в принципе. */

const { store } = require('./../_store');
const { send, fail, rateOk, cors } = require('./../_util');

module.exports = async (req, res) => {
  if(cors(req, res)) return;
  if(req.method !== 'GET') return fail(res, 405, 'method_not_allowed');
  if(!store.configured()) return fail(res, 503, 'no_store');
  if(!(await rateOk(req, 'open', 600))) return fail(res, 429, 'rate_limited');

  const id = (req.query && req.query.id) || '';
  if(!/^[0-9a-z]{4,16}$/.test(id)) return fail(res, 400, 'bad_id');

  const raw = await store.get(`p:${id}`);
  if(!raw) return fail(res, 404, 'not_found');

  let rec;
  try{ rec = JSON.parse(raw); }catch(e){ return fail(res, 500, 'corrupt'); }

  // Первое открытие отмечаем отдельно: «ссылку открыли через 6 дней» — это другой
  // разговор с клиентом, чем «открыли сразу», и тренеру он нужен.
  const opens = await store.incr(`p:${id}:opens`);
  if(opens === 1) await store.set(`p:${id}:first`, new Date().toISOString());
  await store.set(`p:${id}:last`, new Date().toISOString());

  send(res, 200, {program: rec.program, by: rec.by, byLink: rec.byLink, at: rec.at});
};
