/* GET /api/link/:id?key=… — что стало со ссылкой: открытия и отчёты.

   Читать может только тот, у кого секретный ключ, выданный при создании ссылки.
   Ключ не в ссылке: её пересылают дальше, а доступ к отчётам пересылаться не
   должен. Сравнение постоянного времени — иначе ключ подбирается по времени ответа. */

const { store } = require('./../_store');
const { send, fail, rateOk, cors } = require('./../_util');

module.exports = async (req, res) => {
  if(cors(req, res)) return;
  if(req.method !== 'GET') return fail(res, 405, 'method_not_allowed');
  if(!store.configured()) return fail(res, 503, 'no_store');
  if(!(await rateOk(req, 'link', 300))) return fail(res, 429, 'rate_limited');

  const id = (req.query && req.query.id) || '';
  const key = (req.query && req.query.key) || '';
  if(!/^[0-9a-z]{4,16}$/.test(id)) return fail(res, 400, 'bad_id');

  const raw = await store.get(`p:${id}`);
  if(!raw) return fail(res, 404, 'not_found');

  let rec;
  try{ rec = JSON.parse(raw); }catch(e){ return fail(res, 500, 'corrupt'); }

  const given = require('crypto').createHash('sha256').update(String(key)).digest('hex');
  const { sameSecret } = require('./../_util');
  if(!sameSecret(given, rec.keyHash)) return fail(res, 403, 'bad_key');

  // Отчёты и три отметки — одним пакетом вместо четырёх отдельных путей до базы.
  const [list, opens, firstOpen, lastOpen] = await store.pipe([
    ['LRANGE', `p:${id}:reports`, '0', '-1'],
    ['GET', `p:${id}:opens`],
    ['GET', `p:${id}:first`],
    ['GET', `p:${id}:last`]
  ]);
  const reports = (list || []).map(s => {
    try{ return JSON.parse(s); }catch(e){ return null; }
  }).filter(Boolean);

  send(res, 200, {
    opens: +opens || 0,
    firstOpen: firstOpen || null,
    lastOpen: lastOpen || null,
    sentAt: rec.at,
    name: rec.program && rec.program.name,
    reports
  });
};
