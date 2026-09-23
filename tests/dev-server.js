/* Локальный сервер: статика из корня + те же функции из api/, что запускает Vercel.

   Нужен, чтобы серверную часть можно было потрогать и прогнать тестами, не
   деплоя. Маршруты повторяют правила Vercel: api/foo.js → /api/foo,
   api/p/[id].js → /api/p/<что угодно>.

   Запуск:  node tests/dev-server.js [порт]
   Без переменных KV_REST_API_* хранилище живёт в памяти процесса — для тестов
   это ровно то, что нужно. */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = path.join(__dirname, '..');
// без настроенной базы держим данные в памяти — это разрешение, а не умолчание,
// см. api/_store.js
if(!process.env.KV_REST_API_URL) process.env.ALLOW_MEMORY_STORE = '1';
const PORT = +(process.argv[2] || process.env.PORT || 8124);

const TYPES = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
               '.css':'text/css; charset=utf-8',
               '.json':'application/json; charset=utf-8',
               '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml'};

// api/p/[id].js → {re: /^\/api\/p\/([^/]+)$/, params: ['id']}
function routes(){
  const out = [];
  (function walk(dir, prefix){
    for(const name of fs.readdirSync(dir)){
      const full = path.join(dir, name);
      if(fs.statSync(full).isDirectory()){ walk(full, prefix + '/' + name); continue; }
      if(!name.endsWith('.js') || name.startsWith('_')) continue;
      const base = name.slice(0, -3);
      // index.js отвечает за саму папку: api/catalog/index.js → /api/catalog.
      // Так же это делает Vercel, и расходиться с ним здесь нельзя.
      const path_ = base === 'index' ? prefix : (prefix + '/' + base);
      const parts = path_.split('/').filter(Boolean);
      const params = [];
      const re = '^/' + parts.map(p => {
        const m = p.match(/^\[(.+)\]$/);
        if(m){ params.push(m[1]); return '([^/]+)'; }
        return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }).join('/') + '/?$';
      out.push({re: new RegExp(re), params, file: full});
    }
  })(path.join(ROOT, 'api'), '/api');
  return out;
}
const ROUTES = routes();

// rewrites из vercel.json — тем же порядком, что у Vercel: сначала функция или файл
// по исходному пути, и только если их нет — rewrite. Иначе тестовый сервер расходился
// с продом (/api/ai, /api/config, /p/<id>).
const REWRITES = (() => {
  try{
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    return (cfg.rewrites || []).map(r => {
      const names = [];
      const re = new RegExp('^' + r.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/:(\w+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '/?$');
      return {re, names, destination: r.destination};
    });
  }catch(e){ return []; }
})();
function rewrite(u){
  for(const r of REWRITES){
    const m = u.pathname.match(r.re);
    if(!m) continue;
    let dest = r.destination;
    r.names.forEach((n, i) => { dest = dest.split(':' + n).join(m[i + 1]); });
    const next = new URL(dest, 'http://localhost');
    u.searchParams.forEach((v, k) => { if(!next.searchParams.has(k)) next.searchParams.set(k, v); });
    return next;
  }
  return null;
}
const staticFile = pathname => {
  let rel = decodeURIComponent(pathname);
  if(rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ''));
  return (file.startsWith(ROOT) && fs.existsSync(file) && !fs.statSync(file).isDirectory()) ? file : null;
};

http.createServer(async (req, res) => {
  let u = new URL(req.url, 'http://localhost');
  if(!ROUTES.some(r => r.re.test(u.pathname)) && !staticFile(u.pathname)){
    const next = rewrite(u);
    if(next) u = next;
  }
  const hit = ROUTES.find(r => r.re.test(u.pathname));
  if(hit){
    const m = u.pathname.match(hit.re);
    req.query = Object.fromEntries(u.searchParams);
    hit.params.forEach((p, i) => { req.query[p] = decodeURIComponent(m[i + 1]); });
    try{
      delete require.cache[require.resolve(hit.file)];  // правка кода видна без перезапуска
      await require(hit.file)(req, res);
    }catch(e){
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({error: 'handler_failed', detail: String(e && e.message)}));
    }
    return;
  }
  // статика
  const file = staticFile(u.pathname);
  if(!file){ res.statusCode = 404; res.end('not found'); return; }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, ()=> console.log('http://localhost:' + PORT + (process.env.KV_REST_API_URL ? '' : '  (хранилище в памяти)')));
