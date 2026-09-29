/* End-to-end check of the production build: node tests/e2e.mjs (after npm run build).
   Serves dist/ with the real api/* handlers on the memory store and drives Chromium:
   anonymous learning, first sign-in merge and progress sync between two devices. */
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
const API = Object.fromEntries(['auth', 'sync', 'health', 'admin', 'billing', 'content'].map(name => [name, require(join(APP, 'api', name + '.js'))]));
const TYPES = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json'};

const PORT = 4175;
const URL_ = `http://127.0.0.1:${PORT}/`;
const CHROME = process.env.FIT_CHROME || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const Content = require(join(APP, 'lib', 'content-store.js'));
await Content.putDraft({
  schemaVersion:1,
  id:'general-foundation',
  revision:1,
  slug:'general-foundation',
  title:{ru:'Основной курс'},
  level:{labels:[]},
  access:{mode:'free'},
  defaultRoadmapId:'main',
  roadmaps:[{
    id:'main',
    title:{ru:'Путь'},
    nodes:[
      {
        id:'day-1',
        kind:'lesson',
        title:{ru:'День 1'},
        dayIndex:1,
        order:0,
        prerequisites:[],
        activityIds:['day-1.theory'],
        optional:false
      },
      {
        id:'day-2',
        kind:'lesson',
        title:{ru:'День 2'},
        dayIndex:2,
        order:1,
        prerequisites:[],
        activityIds:['day-2.theory'],
        optional:false
      }
    ]
  }],
  activities:[
    {
      id:'day-1.theory',
      revision:1,
      type:'theory',
      tags:[],
      revisionProgress:'preserve',
      lexiconRefs:[],
      body:{ru:'Hello.'},
      format:'text'
    },
    {
      id:'day-2.theory',
      revision:1,
      type:'theory',
      tags:[],
      revisionProgress:'preserve',
      lexiconRefs:[],
      body:{ru:'Goodbye.'},
      format:'text'
    }
  ],
  resources:[]
});
await Content.publish('general-foundation');

// Copy of the default locale (src/i18n) and of the shared sign-in form.
const COPY = {
  ru: {
    signIn:'Войти',
    account:'Аккаунт',
    today:'Сегодня',
    onboarding:'Говори по-английски в реальной жизни',
    start:'Начать день 1',
    continue:'Продолжить',
    complete:'Курс пройден',
    send:'Прислать код',
    verify:'Войти',
    handle:'Ник',
    create:'Создать аккаунт'
  }
}['ru'];

const server = createServer(async (req, res) => {
  const parsedUrl = new URL(req.url || '/', URL_);
  const path = decodeURIComponent(parsedUrl.pathname);
  req.query = Object.fromEntries(parsedUrl.searchParams.entries());
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
async function openDevice(browser, errors){
  const context=await browser.newContext({viewport:{width:390,height:800},locale:'ru-RU'});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(URL_);
  return {context,page};
}

async function finishOnboarding(page){
  await page.getByRole('heading',{name:COPY.onboarding}).waitFor();
  await page.getByRole('button',{name:COPY.start}).click();
  return page.waitForURL(/#\/learn\/day-1/,{timeout:5000}).then(()=>true,()=>false);
}

async function completeTheory(page){
  await page.getByRole('button',{name:COPY.continue}).click();
  return page.waitForURL(/#\/$/,{timeout:5000}).then(()=>true,()=>false);
}

async function signIn(page,email){
  await page.getByRole('link',{name:COPY.signIn}).click();
  await page.getByRole('textbox',{name:'Email'}).fill(email);
  await page.getByRole('button',{name:COPY.send}).click();
  await page.getByText(/^DEV: \d+$/).waitFor();
  await page.getByRole('button',{name:COPY.verify}).click();
  if(await appears(page.getByRole('textbox',{name:COPY.handle}),1200)){
    await page.getByRole('textbox',{name:COPY.handle}).fill('@person');
    await page.getByRole('button',{name:COPY.create}).click();
  }
  return appears(page.getByRole('link',{name:COPY.account}),5000);
}

const browser = await chromium.launch(CHROME ? {executablePath:CHROME} : {});
try{
  const errors=[];

  const phone=await openDevice(browser,errors);
  ok('first anonymous visit opens minimal onboarding',await appears(phone.page.getByRole('heading',{name:COPY.onboarding})));
  ok('onboarding starts day 1',await finishOnboarding(phone.page));
  ok('day 1 is completed locally before sign-in',await completeTheory(phone.page));
  ok('anonymous phone advances to day 2',await appears(phone.page.getByRole('heading',{name:'День 2'})));
  ok('theme tokens are applied',(await phone.page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()))!=='');

  const phoneSignedIn=await signIn(phone.page,'person@example.com');
  await phone.page.goto(URL_+'#/');
  ok(
    'first sign-in keeps the phone local progress',
    phoneSignedIn&&await appears(phone.page.getByRole('heading',{name:'День 2'}))
  );

  const laptop=await openDevice(browser,errors);
  ok('second device starts with its own anonymous state',await finishOnboarding(laptop.page));
  await laptop.page.goto(URL_+'#/learn/day-2');
  ok('second device can make a different local course change',await appears(laptop.page.getByText('Goodbye.')));
  ok('day 2 is completed locally before second-device sign-in',await completeTheory(laptop.page));
  ok('second device still needs day 1 before account merge',await appears(laptop.page.getByRole('heading',{name:'День 1'})));

  const laptopSignedIn=await signIn(laptop.page,'person@example.com');
  await laptop.page.goto(URL_+'#/');
  ok('second device signs into the same account',laptopSignedIn);
  ok(
    'second device merges phone day 1 with its own day 2',
    await appears(laptop.page.getByRole('heading',{name:COPY.complete}),8000)
  );

  await phone.page.reload();
  ok(
    'first device pulls the merged progress from the second device',
    await appears(phone.page.getByRole('heading',{name:COPY.complete}),8000)
  );

  await phone.page.reload();
  ok(
    'merged progress survives a production-build reload',
    await appears(phone.page.getByRole('heading',{name:COPY.complete}),8000)
  );

  const adminContext=await browser.newContext({locale:'ru-RU'});
  const admin=await adminContext.newPage();
  admin.on('pageerror',error=>errors.push(String(error)));
  await admin.goto(URL_+'#/admin');
  ok('shared Admin opens and asks for the key',await appears(admin.getByLabel('ADMIN_KEY')));

  ok('no runtime errors',errors.length===0);
  if(errors.length)console.log(errors.join('\n'));

  await adminContext.close();
  await laptop.context.close();
  await phone.context.close();
}catch(error){
  bad++;
  console.error(error);
}finally{
  await browser.close();
  server.close();
}

console.log(bad ? '\nUnMute e2e failures: '+bad : '\nUnMute e2e passed');
process.exit(bad ? 1 : 0);
