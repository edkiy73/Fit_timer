/* End-to-end check of the production build: node tests/e2e.mjs (after npm run build).
   Serves dist/ with the real api/* handlers on the memory store and drives Chromium. */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

process.env.ALLOW_MEMORY_STORE = '1';
process.env.ADMIN_KEY ||= 'starter-e2e';
const require = createRequire(import.meta.url);
const APP = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(APP, 'dist');
const API = Object.fromEntries(['auth', 'sync', 'health', 'admin', 'billing', 'domain', 'catalog'].map(name => [name, require(join(APP, 'api', name + '.js'))]));
const TYPES = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json'};

const PORT = 4175;
const URL_ = `http://127.0.0.1:${PORT}/`;
const CHROME = process.env.FIT_CHROME || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
// Copy of the default locale (src/i18n) and of the shared sign-in form.
const COPY = {
  ru: {signIn:'Войти', account:'Аккаунт', ready:'Основа готова', send:'Прислать код', verify:'Войти', handle:'Ник', create:'Создать аккаунт'},
  en: {signIn:'Sign in', account:'Account', ready:'Foundation ready', send:'Send code', verify:'Sign in', handle:'Handle', create:'Create account'}
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

const VISUAL_QA = process.argv.includes('--visual-qa');
const VISUAL_WIDTHS = [320,390,768,1024,1440];
const ARTIFACTS = join(APP, '.artifacts', 'visual-qa');
/* Explicit opt-in only: screenshots of the actual built React app with memory-store
   fixture accounts. Never take screenshots of deployed private accounts. */
async function captureVisual(page,label,route,screen){
  if(!VISUAL_QA)return;
  mkdirSync(ARTIFACTS,{recursive:true});
  await page.goto(URL_+'#'+route);
  ok(label+' route renders',await appears(screen()));
  for(const width of VISUAL_WIDTHS){
    for(const theme of (width===390||width===1440?['light','dark']:['light'])){
      await page.setViewportSize({width,height:820});
      // Apply a saved preference at startup so controlled theme pickers and
      // CSS both show the same mode, rather than changing only root tokens.
      await page.evaluate(mode=>localStorage.setItem('feture.theme',mode),theme);
      await page.reload();
      await screen().waitFor();
      await page.screenshot({path:join(ARTIFACTS,label+'-'+width+'-'+theme+'.png'),fullPage:true});
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
      ok(label+' '+width+'px '+theme+' no horizontal overflow',!overflow);
      if(label==='home'||label==='explore'){
        const navigation=page.getByRole('link',{name:'Исследовать',exact:true});
        ok(label+' '+width+'px visible navigation',await navigation.evaluateAll(links=>links.some(link=>link.getBoundingClientRect().width>0)));
      }
    }
  }
}


const browser = await chromium.launch(CHROME ? {executablePath:CHROME} : {});
try{
  const context = await browser.newContext({viewport:{width:390,height:800}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL_);
  ok('native React home boots without an account', await appears(page.getByRole('heading', {name:/Твой мир/i})));
  ok('theme tokens are applied', (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())) !== '');

  await page.getByRole('link', {name:'Исследовать'}).first().click();
  ok('native interest explorer opens', await appears(page.getByRole('heading',{name:'Открой новые грани'})));
  await captureVisual(page,'explore','/explore',()=>page.getByRole('heading',{name:'Открой новые грани'}));
  await captureVisual(page,'home','/',()=>page.getByRole('heading',{name:/Твой мир/i}));
  await captureVisual(page,'account-guest','/account',()=>page.getByRole('heading',{name:'Войти или зарегистрироваться'}));
  await page.goto(URL_ + '#/account');
  await page.getByRole('textbox', {name:'Email'}).fill('person@example.com');
  await page.getByRole('button', {name:COPY.send}).click();
  await page.getByText(/^DEV: \d+$/).waitFor();
  await page.getByRole('button', {name:COPY.verify}).click();
  if(await appears(page.getByRole('textbox', {name:COPY.handle}), 2000)){
    await page.getByRole('textbox', {name:COPY.handle}).fill('@person');
    await page.getByRole('button', {name:COPY.create}).click();
  }
  ok('email sign-in works against the real auth endpoint', await appears(page.getByRole('link', {name:COPY.account})));
  // SignInForm finishes by navigating home. Wait before changing routes, or
  // its late onSignedIn callback overwrites the screenshot's account navigation.
  await page.waitForURL(url=>url.hash==='#/'||url.hash==='');
  await page.getByRole('heading',{name:/Твой мир/i}).waitFor();
  await captureVisual(page,'account-signed-in','/account',()=>page.getByRole('heading',{name:'Аккаунт',exact:true}));
  await captureVisual(page,'profile','/profile',()=>page.getByRole('heading',{name:'Твой профиль'}));

  const admin = await context.newPage();
  await admin.goto(URL_ + '#/admin');
  ok('shared Admin opens and asks for the key', await appears(admin.getByLabel('Ключ администратора')));
  await captureVisual(admin,'admin-login','/admin',()=>admin.getByLabel('Ключ администратора'));
  ok('no runtime errors', errors.length === 0);
  if(errors.length) console.log(errors.join('\n'));
}catch(error){ bad++; console.error(error); }
finally{ await browser.close(); server.close(); }

console.log(bad ? '\nStarter e2e failures: ' + bad : '\nStarter e2e passed');
process.exit(bad ? 1 : 0);
