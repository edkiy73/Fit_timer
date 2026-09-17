/* GET /api/catalog/review?key=… — очередь на проверку, страницей с кнопками.

   Модерация руками, пока программ единицы: отдельной панели для этого не нужно,
   но и простыня текста со ссылками — не дело. Решение принимается по трём вещам:
   от кого, что внутри и не мусор ли. Значит, на экране должны быть автор, состав
   программы и три кнопки — и ничего больше.

   Страница отдаётся целиком, без единого внешнего файла: она открывается редко,
   и лишняя загрузка ей ни к чему. Ключ — переменная ADMIN_KEY в настройках Vercel. */

const { store } = require('./../_store');
const { rateOk, sameSecret, cors } = require('./../_util');

const esc = v => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const page = (res, code, body) => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(`<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Проверка каталога</title>
<style>
  :root{color-scheme:light dark;--bg:#F4F2FB;--card:#fff;--ink:#1B1630;--muted:#6C6785;
        --line:#E6E2F2;--ok:#1F9D63;--danger:#C22F4C;--accent:#6B3FE0}
  @media (prefers-color-scheme:dark){:root{--bg:#141020;--card:#1E1930;--ink:#EEEAF7;
        --muted:#9A94B4;--line:#2E2745;--ok:#3ED598;--danger:#FF6079;--accent:#9C7BFF}}
  *{box-sizing:border-box}
  body{margin:0;padding:20px 16px 48px;background:var(--bg);color:var(--ink);
       font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  .wrap{max-width:720px;margin:0 auto}
  h1{font-size:20px;margin:0 0 4px}
  .sub{color:var(--muted);font-size:13px;margin:0 0 20px}
  .msg{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--ok);
       border-radius:10px;padding:12px 14px;margin:0 0 16px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;
        padding:16px;margin:0 0 14px}
  .top{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}
  .name{font-size:17px;font-weight:600;margin:0}
  .who{color:var(--accent);font-size:13px;text-decoration:none}
  .tags{color:var(--muted);font-size:13px;margin:6px 0 10px}
  .gives{margin:0 0 12px}
  details{border-top:1px solid var(--line);padding-top:10px;margin-top:4px}
  summary{cursor:pointer;color:var(--muted);font-size:13px}
  pre{white-space:pre-wrap;word-break:break-word;background:var(--bg);border-radius:8px;
      padding:12px;font-size:12.5px;line-height:1.5;max-height:340px;overflow:auto;margin:10px 0 0}
  .acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
  .btn{flex:1 1 auto;min-width:120px;text-align:center;text-decoration:none;
       border:1px solid var(--line);border-radius:10px;padding:11px 14px;font-weight:600;
       color:var(--ink);background:var(--card);cursor:pointer}
  .btn.ok{background:var(--ok);border-color:var(--ok);color:#fff}
  .btn.no{color:var(--danger);border-color:var(--danger)}
  .btn.ban{color:var(--muted);font-weight:400;flex:0 0 auto;min-width:0}
  .empty{text-align:center;color:var(--muted);padding:48px 0}
  img.cover{width:64px;height:64px;border-radius:10px;object-fit:cover;flex:none}
</style></head><body><div class="wrap">${body}</div></body></html>`);
};

module.exports = async (req, res) => {
  if(cors(req, res)) return;
  if(!store.configured()){
    return page(res, 503, '<h1>Хранилище не подключено</h1>' +
      '<p class="sub">Подробности на <a href="/api/health">/api/health</a></p>');
  }

  const admin = process.env.ADMIN_KEY || '';
  if(!admin){
    return page(res, 503, '<h1>Проверка каталога не настроена</h1>' +
      '<p class="sub">Заведи в Vercel → Settings → Environment Variables переменную ' +
      '<b>ADMIN_KEY</b> с любым длинным случайным значением, пересобери проект и открой ' +
      'эту страницу так: <code>/api/catalog/review?key=&lt;то, что задал&gt;</code></p>');
  }
  if(!(await rateOk(req, 'review', 200))) return page(res, 429, '<h1>Слишком часто</h1>');
  const key = (req.query && req.query.key) || '';
  if(!sameSecret(String(key), admin)) return page(res, 403, '<h1>Неверный ключ</h1>');

  const act = (req.query && req.query.do) || '';
  const id = (req.query && req.query.id) || '';
  let msg = '';

  if(act && /^u[0-9a-z]{4,16}$/.test(id)){
    const raw = await store.get(`c:${id}`);
    if(!raw) msg = `Не нашлось: ${esc(id)}`;
    else {
      const c = JSON.parse(raw);
      if(act === 'approve'){
        c.status = 'approved';
        await store.set(`c:${id}`, JSON.stringify(c));
        await store.push('c:approved', id);
        msg = `В каталоге: «${esc(c.name)}» от ${esc(c.by)}`;
      } else if(act === 'reject'){
        c.status = 'rejected';
        await store.set(`c:${id}`, JSON.stringify(c));
        msg = `Отклонено: «${esc(c.name)}»`;
      } else if(act === 'ban'){
        const traw = await store.get(`t:${c.by}`);
        if(traw){
          const t = JSON.parse(traw);
          t.banned = true;
          await store.set(`t:${c.by}`, JSON.stringify(t));
        }
        c.status = 'rejected';
        await store.set(`c:${id}`, JSON.stringify(c));
        msg = `${esc(c.by)} закрыт — его программы больше не принимаются`;
      }
    }
  }

  const ids = await store.list('c:pending');
  const raws = await store.many(ids.map(x => `c:${x}`));
  const pend = [];
  raws.forEach(raw => {
    if(!raw) return;
    try{ const c = JSON.parse(raw); if(c.status === 'pending') pend.push(c); }catch(e){}
  });

  const base = '/api/catalog/review?key=' + encodeURIComponent(key);
  const html = [
    `<h1>На проверке: ${pend.length}</h1>`,
    `<p class="sub">Решение принимается по трём вещам: кто прислал, что внутри, не мусор ли.</p>`,
    msg ? `<p class="msg">${msg}</p>` : ''
  ];

  if(!pend.length){
    html.push('<div class="empty">Пусто — всё разобрано.</div>');
  }
  pend.forEach(c => {
    html.push(`<div class="card">
      <div class="top">
        ${c.cover ? `<img class="cover" src="${esc(c.cover)}" alt="">` : ''}
        <div style="flex:1;min-width:0">
          <p class="name">${esc(c.name)}</p>
          <a class="who" href="/api/trainer/${encodeURIComponent(c.by)}" target="_blank" rel="noopener">${esc(c.by)}</a>
          <p class="tags">${esc(c.cat)} · ${esc(c.level)} · ${esc(c.min)} мин · ${esc(c.exCount)} упражнений</p>
        </div>
      </div>
      <p class="gives">${esc(c.gives)}</p>
      <details><summary>Что внутри</summary><pre>${esc(c.text)}</pre></details>
      <div class="acts">
        <a class="btn ok" href="${base}&do=approve&id=${c.id}">Взять в каталог</a>
        <a class="btn no" href="${base}&do=reject&id=${c.id}">Отклонить</a>
        <a class="btn ban" href="${base}&do=ban&id=${c.id}"
           onclick="return confirm('Закрыть ${esc(c.by)}? Его программы больше не будут приниматься.')">Закрыть автора</a>
      </div>
    </div>`);
  });

  page(res, 200, html.join(''));
};
