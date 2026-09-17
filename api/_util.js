/* Общее для всех эндпоинтов: ответы, разбор тела, ограничение частоты.

   Приложение офлайновое, и сервер обязан вести себя предсказуемо, когда он не
   отвечает: у клиента на каждый вызов есть запасной путь (ссылка с программой
   внутри). Поэтому ошибки здесь — обычные JSON с кодом, а не пустые 500. */

const { store } = require('./_store');

const MAX_BODY = 256 * 1024;   // программа с описаниями укладывается в десятки КБ

function send(res, code, obj){
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}
const fail = (res, code, error, extra) => send(res, code, Object.assign({error}, extra || {}));

// Тело приходит уже разобранным у Vercel и сырым у локального сервера — умеем оба.
async function readBody(req){
  if(req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  let size = 0;
  for await (const c of req){
    size += c.length;
    if(size > MAX_BODY) throw new Error('too_large');
    chunks.push(c);
  }
  if(!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// Адрес нужен только для ограничения частоты, поэтому храним ХЕШ, а не сам адрес:
// сопоставить с человеком нечего, а считать запросы это не мешает.
function ipHash(req){
  const raw = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || (req.socket && req.socket.remoteAddress) || 'local';
  let h = 5381;
  for(let i = 0; i < raw.length; i++) h = ((h * 33) ^ raw.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Простое окно: N запросов в час с адреса. Защищает от случайного цикла в клиенте
// и от скуки, но не от настоящей атаки — для неё нужен слой выше.
async function rateOk(req, bucket, limit){
  try{
    // На локальном запуске предел ослаблен: он защищает боевой сервер, а не машину
    // разработчика, где сценарии прогоняются по кругу и упираются в него за минуту.
    // Суточные пределы (сколько программ в каталог) это не трогает — они считаются
    // отдельно и проверяются по-настоящему.
    if(process.env.ALLOW_MEMORY_STORE === '1') limit *= 50;
    const hour = Math.floor(Date.now() / 3600000);
    const n = await store.incr(`rl:${bucket}:${ipHash(req)}:${hour}`, 3600);
    return n <= limit;
  }catch(e){ return true; }   // счётчик сломался — это не повод отказывать человеку
}

// Идентификаторы: id открытый (он в ссылке), key секретный (остаётся у тренера).
// Алфавит без похожих символов — коды иногда диктуют голосом.
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
function rndId(len){
  const bytes = require('crypto').randomBytes(len);
  let out = '';
  for(let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// Сравнение секретов постоянного времени: иначе по времени ответа ключ подбирается.
function sameSecret(a, b){
  const A = Buffer.from(String(a || ''), 'utf8');
  const B = Buffer.from(String(b || ''), 'utf8');
  if(A.length !== B.length) return false;
  return require('crypto').timingSafeEqual(A, B);
}

function cors(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if(req.method === 'OPTIONS'){ res.statusCode = 204; res.end(); return true; }
  return false;
}

module.exports = { send, fail, readBody, rateOk, rndId, sameSecret, cors, ipHash, MAX_BODY };
