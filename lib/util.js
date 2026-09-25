/* Общее для всех эндпоинтов: ответы, разбор тела, ограничение частоты.

   Приложение офлайновое, и сервер обязан вести себя предсказуемо, когда он не
   отвечает: у клиента на каждый вызов есть запасной путь (ссылка с программой
   внутри). Поэтому ошибки здесь — обычные JSON с кодом, а не пустые 500. */

const { store } = require('./store');

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

// Простое окно по IP. Для обычных дешёвых запросов оставляем fail-open:
// временная проблема счётчика не должна выключать приложение целиком.
async function rateOk(req, bucket, limit){
  return rateOkScoped(req, bucket, limit, '', 3600, false);
}

// Более строгий лимитер для дорогих/чувствительных действий (OTP, AI).
// scope — уже обезличенный идентификатор (например hash email/account).
// failClosed=true означает: если Redis не смог посчитать лимит, действие не выполняем.
async function rateOkScoped(req, bucket, limit, scope, windowSec = 3600, failClosed = false){
  try{
    if(process.env.ALLOW_MEMORY_STORE === '1') limit *= 50;
    const win = Math.floor(Date.now() / (Math.max(1, windowSec) * 1000));
    const suffix = scope ? ':' + String(scope).replace(/[^a-z0-9_.-]/gi, '').slice(0,80) : '';
    const n = await store.incr(`rl:${bucket}:${ipHash(req)}${suffix}:${win}`, Math.max(2, windowSec + 5));
    return n <= limit;
  }catch(e){
    return failClosed ? false : true;
  }
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

/* ---- пределы полей на сервере ----

   То же самое, что делает приложение у себя, но здесь это обязательно: запрос
   приходит не только из приложения. Любой может послать в публичный эндпоинт строку
   в мегабайт или «ссылку» javascript:, и отдавать её потом ЧУЖИМ людям на публичной
   странице мы не будем.

   Управляющие символы вырезаем всегда: невидимое в тексте — это сломанная
   разметка у того, кто его читает, и он не поймёт почему. */
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\uFEFF]/g;

function clampText(v, max){
  return String(v == null ? '' : v).replace(/[\u2028\u2029\r]/g, '\n')
    .replace(CTRL, '').trim().slice(0, max);
}
function clampLine(v, max){
  return clampText(v, max * 2).replace(/\s+/g, ' ').trim().slice(0, max);
}

// Картинка — только data-адрес картинки. Всё остальное уедет в <img src> у
// читателя страницы и станет там не адресом.
const PIC_RE = /^data:image\/(png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+/]+=*$/;
function cleanPic(v, max){
  const s = String(v == null ? '' : v).trim();
  return (s.length <= (max || 900 * 1024) && PIC_RE.test(s)) ? s : '';
}

// Ссылка на себя: имя узла с точкой, схема только http(s). «хуй» адресом не
// является, javascript: — тем более.
const HOST_RE = /^[a-zа-яё0-9]([a-zа-яё0-9-]*[a-zа-яё0-9])?(\.[a-zа-яё0-9-]+)+$/i;
function cleanLink(v, max){
  let s = clampLine(v, max || 120);
  if(!s) return '';
  if(/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https?:\/\//i.test(s)) return '';
  const host = s.replace(/^https?:\/\//i, '').split(/[/?#]/)[0];
  if(!HOST_RE.test(host)) return '';
  return /^https?:\/\//i.test(s) ? s : 'https://' + s;
}

function cors(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Fit-Email, X-Fit-Device, X-Fit-Token, X-Fit-Link-Key, X-Admin-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if(req.method === 'OPTIONS'){ res.statusCode = 204; res.end(); return true; }
  return false;
}

module.exports = { send, fail, readBody, rateOk, rateOkScoped, rndId, sameSecret, cors, ipHash, MAX_BODY,
                   clampText, clampLine, cleanPic, cleanLink };
