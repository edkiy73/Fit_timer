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
               '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json',
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
      const parts = (prefix + '/' + base).split('/').filter(Boolean);
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

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
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
  let rel = decodeURIComponent(u.pathname);
  if(rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ''));
  if(!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){
    res.statusCode = 404; res.end('not found'); return;
  }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, ()=> console.log('http://localhost:' + PORT + (process.env.KV_REST_API_URL ? '' : '  (хранилище в памяти)')));
