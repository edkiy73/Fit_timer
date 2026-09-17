/* GET /api/catalog/review?key=… — очередь на проверку, страницей для человека.

   Модерация руками, пока программ единицы. Отдельной панели для этого не нужно:
   простая страница со ссылками «взять» и «отклонить» делает ту же работу и не
   требует ни входа, ни интерфейса.

   Ключ — переменная ADMIN_KEY в настройках Vercel. Пока её нет, страница
   отказывается работать и говорит, что завести. */

const { store } = require('./../_store');
const { rateOk, sameSecret, cors } = require('./../_util');

const text = (res, code, body) => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
};

module.exports = async (req, res) => {
  if(cors(req, res)) return;
  if(!store.configured()) return text(res, 503, 'Хранилище не подключено — см. /api/health');

  const admin = process.env.ADMIN_KEY || '';
  if(!admin){
    return text(res, 503,
      'Проверка каталога не настроена.\n\n' +
      'Заведи в Vercel → Settings → Environment Variables переменную ADMIN_KEY\n' +
      'с любым длинным случайным значением, пересобери проект и открой эту\n' +
      'страницу так: /api/catalog/review?key=<то, что задал>\n');
  }
  if(!(await rateOk(req, 'review', 120))) return text(res, 429, 'Слишком часто.');
  const key = (req.query && req.query.key) || '';
  if(!sameSecret(String(key), admin)) return text(res, 403, 'Неверный ключ.');

  const act = (req.query && req.query.do) || '';
  const id = (req.query && req.query.id) || '';
  const L = [];

  if(act && /^u[0-9a-z]{4,16}$/.test(id)){
    const raw = await store.get(`c:${id}`);
    if(!raw) L.push(`Не нашлось: ${id}`);
    else {
      const c = JSON.parse(raw);
      if(act === 'approve'){
        c.status = 'approved';
        await store.set(`c:${id}`, JSON.stringify(c));
        await store.push('c:approved', id);
        L.push(`В каталоге: «${c.name}» от ${c.by}`);
      } else if(act === 'reject'){
        c.status = 'rejected';
        await store.set(`c:${id}`, JSON.stringify(c));
        L.push(`Отклонено: «${c.name}» от ${c.by}`);
      } else if(act === 'ban'){
        const traw = await store.get(`t:${c.by}`);
        if(traw){
          const t = JSON.parse(traw);
          t.banned = true;
          await store.set(`t:${c.by}`, JSON.stringify(t));
        }
        c.status = 'rejected';
        await store.set(`c:${id}`, JSON.stringify(c));
        L.push(`Тренер ${c.by} закрыт, его программы больше не принимаются.`);
      }
    }
    L.push('');
  }

  const ids = await store.list('c:pending');
  const pend = [];
  for(const pid of ids){
    const raw = await store.get(`c:${pid}`);
    if(!raw) continue;
    const c = JSON.parse(raw);
    if(c.status === 'pending') pend.push(c);
  }

  L.push(`На проверке: ${pend.length}`);
  L.push('');
  const base = '/api/catalog/review?key=' + encodeURIComponent(key);
  pend.forEach(c => {
    L.push('─'.repeat(52));
    L.push(`${c.name}   —   ${c.by}`);
    L.push(`${c.cat} · ${c.level} · ${c.min} мин · ${c.exCount} упражнений`);
    L.push('');
    L.push(c.gives);
    L.push('');
    L.push(c.text.slice(0, 1500) + (c.text.length > 1500 ? '\n… (обрезано)' : ''));
    L.push('');
    L.push(`взять:     ${base}&do=approve&id=${c.id}`);
    L.push(`отклонить: ${base}&do=reject&id=${c.id}`);
    L.push(`закрыть тренера: ${base}&do=ban&id=${c.id}`);
    L.push('');
  });
  if(!pend.length) L.push('Пусто — всё разобрано.');

  text(res, 200, L.join('\n'));
};
