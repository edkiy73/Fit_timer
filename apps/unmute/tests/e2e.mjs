/* End-to-end check of the production build: node tests/e2e.mjs (after npm run build).
   Serves dist/ with the real api/* handlers on the memory store and drives Chromium. */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

process.env.ALLOW_MEMORY_STORE = '1';
process.env.ADMIN_KEY ||= 'starter-e2e';
const require = createRequire(import.meta.url);
const APP = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(APP, 'dist');
const API = Object.fromEntries(['auth', 'sync', 'health', 'admin', 'billing'].map(name => [name, require(join(APP, 'api', name + '.js'))]));
const TYPES = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json'};

const PORT = 4175;
const URL_ = `http://127.0.0.1:${PORT}/`;
const CHROME = process.env.FIT_CHROME || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
// Copy of the default locale (src/i18n) and of the shared sign-in form.
const COPY = {
  ru: {signIn:'Войти', account:'Аккаунт', today:'Сегодня', onboarding:'Говори по-английски в реальной жизни', start:'Начать день 1', send:'Прислать код', verify:'Войти', handle:'Ник', create:'Создать аккаунт'},
  en: {signIn:'Sign in', account:'Account', today:'Today', send:'Send code', verify:'Sign in', handle:'Handle', create:'Create account'}
}['ru'];

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url || '/', URL_).pathname);
  const api = /^\/api\/([a-z]+)$/.exec(path);
  if(api){
    const handler = API[api[1]];
    if(!handler){ res.statusCode = 404; res.end(); return; }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    req.body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    await handler(req, res);
    return;
  }
  const file = normalize(join(DIST, path === '/' ? 'index.html' : path));
  if(!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()){ res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

let bad = 0;
const ok = (name, value) => { if(!value) bad++; console.log((value ? '  ok  ' : ' FAIL ') + name); };
const appears = (locator, timeout = 5000) => locator.waitFor({timeout}).then(() => true, () => false);

const browser = await chromium.launch(CHROME ? {executablePath:CHROME} : {});
try{
  const context = await browser.newContext({viewport:{width:390,height:800}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL_);
  ok('first anonymous visit opens minimal onboarding', await appears(page.getByRole('heading', {name:COPY.onboarding})));
  await page.getByRole('button', {name:COPY.start}).click();
  ok('onboarding starts the first lesson', await page.waitForURL(/#\/learn\//, {timeout:5000}).then(()=>true,()=>false));
  await page.goto(URL_ + '#/');
  ok('completed onboarding opens Today without an account', await appears(page.getByRole('heading', {name:COPY.today})));
  ok('theme tokens are applied', (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())) !== '');

  await page.getByRole('link', {name:COPY.signIn}).click();
  await page.getByRole('textbox', {name:'Email'}).fill('person@example.com');
  await page.getByRole('button', {name:COPY.send}).click();
  await page.getByText(/^DEV: \d+$/).waitFor();
  await page.getByRole('button', {name:COPY.verify}).click();
  if(await appears(page.getByRole('textbox', {name:COPY.handle}), 2000)){
    await page.getByRole('textbox', {name:COPY.handle}).fill('@person');
    await page.getByRole('button', {name:COPY.create}).click();
  }
  ok('email sign-in works against the real auth endpoint', await appears(page.getByRole('link', {name:COPY.account})));

  const admin = await context.newPage();
  await admin.goto(URL_ + '#/admin');
  ok('shared Admin opens and asks for the key', await appears(admin.getByLabel('ADMIN_KEY')));
  ok('no runtime errors', errors.length === 0);
  if(errors.length) console.log(errors.join('\n'));
}catch(error){ bad++; console.error(error); }
finally{ await browser.close(); server.close(); }

console.log(bad ? '\nStarter e2e failures: ' + bad : '\nStarter e2e passed');
process.exit(bad ? 1 : 0);
