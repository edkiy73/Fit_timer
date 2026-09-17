/* POST /api/catalog/submit — тренер предлагает свою программу в каталог.

   Не «публикует», а ПРЕДЛАГАЕТ: всё проходит через проверку руками. Пока программ
   единицы, это десять минут в неделю, а открытая публикация без модерации в первый
   же месяц превращает каталог в помойку, из которой его уже не вытащить.

   Позиция каталога складывается в том же виде, что и зашитые в приложение
   (STORE_ITEMS): id, by, cat, level, min, name, gives, text. Тогда серверная
   программа неотличима от своей, и ни витрина, ни страница программы, ни добавление
   в библиотеку про сервер знать не должны. */

const { store } = require('./../_store');
const { send, fail, readBody, rateOk, rndId, sameSecret, cors } = require('./../_util');
const crypto = require('crypto');
const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');

// Ключи целей — те же, что в STORE_LOOK у приложения. Именно КЛЮЧ, а не название:
// по нему витрина подбирает обложку и по нему работают фильтры.
const GOALS = ['slim', 'tone', 'glut', 'core', 'power', 'relief', 'flex', 'back', 'post', 'cardio'];
const LEVELS = ['Новичок', 'Средний', 'Продвинутый'];
const PER_DAY = 3;

module.exports = async (req, res) => {
  if(cors(req, res)) return;
  if(req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  if(!store.configured()) return fail(res, 503, 'no_store');
  if(!(await rateOk(req, 'submit', 30))) return fail(res, 429, 'rate_limited');

  let body;
  try{ body = await readBody(req); }catch(e){ return fail(res, 413, 'too_large'); }

  let handle = String((body && body.by) || '').slice(0, 40);
  if(handle && handle[0] !== '@') handle = '@' + handle;
  if(!/^@[\wа-яё.\-]{1,39}$/i.test(handle)) return fail(res, 400, 'bad_handle');

  /* Единственная проверка «кто ты», возможная без аккаунтов: ник должен быть
     закреплён за этим человеком. Она не останавливает того, кто решил спамить,
     зато привязывает всё предложенное к одному имени — а имя уже можно закрыть
     целиком, вместо игры в кошки-мышки с каждой новой программой. */
  const raw = await store.get(`t:${handle}`);
  if(!raw) return fail(res, 403, 'no_trainer');
  let t;
  try{ t = JSON.parse(raw); }catch(e){ return fail(res, 500, 'corrupt'); }
  if(!sameSecret(sha((body && body.trainerKey) || ''), t.keyHash || '')){
    return fail(res, 403, 'not_yours');
  }
  if(t.banned) return fail(res, 403, 'banned');

  const it = (body && body.item) || {};
  const name  = String(it.name || '').trim().slice(0, 60);
  const gives = String(it.gives || '').trim().slice(0, 300);
  const text  = String(it.text || '');
  const cat   = String(it.cat || '');
  const level = String(it.level || '');
  const min   = Math.max(1, Math.min(180, Math.round(+it.min || 0)));
  const cover = String(it.cover || '').slice(0, 90000) || null;
  // Фото упражнений: карта «название → картинка». Режем и по числу, и по общему
  // весу — запись в хранилище не резиновая, а двадцать фото это уже фотоальбом.
  const media = {};
  let budget = 800 * 1024;
  for(const [k, v] of Object.entries((it.media && typeof it.media === 'object') ? it.media : {})){
    const key = String(k).slice(0, 60), val = String(v || '');
    if(!key || !val.startsWith('data:image/') || val.length > budget) continue;
    media[key] = val;
    budget -= val.length;
    if(Object.keys(media).length >= 30) break;
  }
  const exCount = Math.round(+it.exCount || 0);

  const miss = [];
  if(name.length < 3) miss.push('название');
  if(gives.length < 20) miss.push('что даёт — хотя бы 20 символов');
  if(!GOALS.includes(cat)) miss.push('цель');
  if(!LEVELS.includes(level)) miss.push('уровень');
  if(exCount < 3) miss.push('хотя бы три упражнения');
  if(text.length < 60 || text.length > 60000) miss.push('текст программы');
  if(miss.length) return fail(res, 400, 'bad_item', {miss});

  // Не больше трёх предложений в сутки с одного ника: спам стоит времени, а не
  // одного нажатия. Настоящему тренеру три программы в день более чем хватает.
  const day = new Date().toISOString().slice(0, 10);
  const n = await store.incr(`sub:${handle}:${day}`, 2 * 24 * 3600);
  if(n > PER_DAY) return fail(res, 429, 'too_many_today');

  /* Одно и то же название от одного ника второй раз не принимаем — но только пока
     первая заявка ЖИВА. Прежняя проверка ставила метку навсегда, и отклонённую
     программу нельзя было прислать снова даже после правок: тренер видел «уже
     отправлена» про то, чего в каталоге нет. Заслон от двойного нажатия превращался
     в запрет на вторую попытку.

     Поэтому смотрим не на метку, а на состояние самой заявки. */
  const dupKey = `subname:${handle}:${sha(name).slice(0, 16)}`;
  const prevId = await store.get(dupKey);
  if(prevId){
    const prevRaw = await store.get(`c:${prevId}`);
    let prev = null;
    try{ prev = prevRaw ? JSON.parse(prevRaw) : null; }catch(e){}
    // жива — значит это повторное нажатие; отклонена, убрана или пропала — путь открыт
    if(prev && (prev.status === 'pending' || prev.status === 'approved')){
      return fail(res, 409, 'already_sent');
    }
  }

  const id = 'u' + rndId(7);
  await store.set(`c:${id}`, JSON.stringify({
    id, by: handle, cat, level, min, name, gives, text, cover, media,
    exCount, status: 'pending', at: new Date().toISOString()
  }));
  await store.push('c:pending', id);
  await store.set(dupKey, id);   // метка указывает на ПОСЛЕДНЮЮ заявку с этим названием

  send(res, 200, {ok: true, id, status: 'pending'});
};
