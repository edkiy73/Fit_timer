/* GET /api/p/:id — всё про одну отправленную ссылку.

   Две стороны одной вещи, поэтому и функция одна:

   • без ключа — САМА ПРОГРАММА. Открыто всем, у кого есть ссылка, и это сказано
     человеку прямо в интерфейсе: защищать пока нечего. Каждое открытие считается —
     по этому счётчику тренер видит «ссылку открыли», чего раньше не мог узнать
     в принципе.

   • с ?key=… — ОТМЕТКИ И ОТЧЁТЫ. Ключ не в ссылке: её пересылают дальше, а доступ
     к отчётам пересылаться не должен. Сравнение постоянного времени — иначе ключ
     подбирается по времени ответа.

   Раньше это были два файла (/api/p/:id и /api/link/:id). Разными их делал только
   адрес: ресурс один, и Vercel на бесплатном плане считает каждый файл отдельной
   функцией, которых там всего двенадцать. */

const { store } = require('../../lib/store');
const { send, fail, rateOk, rateOkScoped, sameSecret, cors, readBody } = require('../../lib/util');
const crypto = require('crypto');
const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');

module.exports = async (req, res) => {
  if(cors(req, res)) return;
  if(!store.configured()) return fail(res, 503, 'no_store');

  const id = (req.query && req.query.id) || '';
  if(!/^[0-9a-z]{4,16}$/.test(id)) return fail(res, 400, 'bad_id');
  // Новый клиент передаёт секрет в заголовке, чтобы он не попадал в URL/историю/логи.
  // Query оставлен только для совместимости со старыми APK.
  const key = String(req.headers['x-fit-link-key'] || (req.query && req.query.key) || '');

  if(!(await rateOk(req, key ? 'link' : 'open', key ? 300 : 600))){
    return fail(res, 429, 'rate_limited');
  }
  if(key && !(await rateOkScoped(req, 'link-key', 60, id, 15 * 60, true))){
    return fail(res, 429, 'rate_limited');
  }

  const raw = await store.get(`p:${id}`);
  if(!raw) return fail(res, 404, 'not_found');

  let rec;
  try{ rec = JSON.parse(raw); }catch(e){ return fail(res, 500, 'corrupt'); }

  if(req.method === 'POST'){
    let body;
    try{ body=await readBody(req); }catch(e){ return fail(res,413,'too_large'); }
    if(!body || body.action !== 'claim') return fail(res,400,'unknown_action');
    const email=String(body.email||'').trim().toLowerCase().slice(0,120);
    const deviceId=String(body.deviceId||'').trim().slice(0,80);
    const token=String(body.token||'');
    if(!/^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/.test(email)||!deviceId||!token) return fail(res,401,'account_required');
    const mh=sha(email).slice(0,32);
    let acc=null;try{acc=JSON.parse(await store.get(`a:${mh}`));}catch(_){}
    const device=acc&&acc.syncDevices&&acc.syncDevices[deviceId];
    if(!device||!sameSecret(sha(token),device.h||'')) return fail(res,403,'bad_sync_token');
    rec.clientMailHash=mh;
    rec.claimedAt=new Date().toISOString();
    await store.set(`p:${id}`,JSON.stringify(rec));
    return send(res,200,{ok:true});
  }
  if(req.method !== 'GET') return fail(res,405,'method_not_allowed');

  /* ---- тренер смотрит, что стало со ссылкой ---- */
  if(key){
    const given = require('crypto').createHash('sha256').update(String(key)).digest('hex');
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

    return send(res, 200, {
      opens: +opens || 0,
      firstOpen: firstOpen || null,
      lastOpen: lastOpen || null,
      sentAt: rec.at,
      name: rec.program && rec.program.name,
      reports
    });
  }

  /* ---- подопечный открыл ссылку ----

     Отметки об открытии — одним пакетом. Первое открытие помечаем отдельно:
     «ссылку открыли через 6 дней» — это другой разговор с клиентом, чем «открыли
     сразу», и тренеру он нужен. Счётчик у тренера («сколько раз брали мои
     программы») едет тем же пакетом.

     NX у первой отметки заменяет «прочитать счётчик, потом решить»: так это одна
     команда, а не два пути до базы. */
  const now = new Date().toISOString();
  const YEAR = String(365 * 24 * 3600);
  const marks = [
    ['INCR', `p:${id}:opens`],
    ['SET', `p:${id}:first`, now, 'EX', YEAR, 'NX'],
    ['SET', `p:${id}:last`, now, 'EX', YEAR]
  ];
  if(rec.by) marks.push(['INCR', `t:${rec.by}:opens`]);
  await store.pipe(marks);

  send(res, 200, {program: rec.program, by: rec.by, byLink: rec.byLink, at: rec.at});
};
