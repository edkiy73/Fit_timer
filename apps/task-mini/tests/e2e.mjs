/* End-to-end check of the real production build: node tests/e2e.mjs (after npm run build).
   Serves dist/ together with the real api/* handlers on the memory store and drives Chromium:
   local-first use without an account, sign-in, sync between two devices, reload persistence. */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

process.env.ALLOW_MEMORY_STORE = '1';
process.env.ADMIN_KEY ||= 'task-mini-e2e';
const require = createRequire(import.meta.url);
const APP = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(APP, 'dist');
const API = {
  auth: require(join(APP, 'api/auth.js')),
  sync: require(join(APP, 'api/sync.js')),
  health: require(join(APP, 'api/health.js')),
  admin: require(join(APP, 'api/admin.js'))
};
const TYPES = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json'};

const PORT = 4174;
const URL_ = `http://127.0.0.1:${PORT}/`;
const CHROME = process.env.FIT_CHROME || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

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
const ok = (name, cond) => { if(!cond) bad++; console.log((cond ? '  ok  ' : ' FAIL ') + ' ' + name); };
// Wait for a state instead of reading it right after an action: React applies updates asynchronously.
const appears = (locator, timeout = 5000) => locator.waitFor({timeout}).then(() => true, () => false);

async function openDevice(browser, errors){
  const context = await browser.newContext({viewport: {width: 390, height: 800}});
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL_);
  await page.getByText(/Пока задач нет|Загружаю/).first().waitFor();
  return page;
}

async function addTask(page, title){
  await page.getByRole('textbox', {name: 'Новая задача'}).fill(title);
  await page.getByRole('button', {name: 'Добавить'}).click();
  return appears(page.getByRole('checkbox', {name: title}));
}

async function signIn(page, email, handle){
  await page.getByRole('link', {name: 'Войти'}).click();
  await page.getByRole('textbox', {name: 'Email'}).fill(email);
  await page.getByRole('button', {name: 'Прислать код'}).click();
  // The memory store returns the code to the page (DEV only), the form fills it in.
  await page.getByText(/^DEV: \d+$/).waitFor();
  await page.getByRole('button', {name: 'Войти'}).click();
  if(handle){
    await page.getByRole('textbox', {name: 'Ник'}).fill(handle);
    await page.getByRole('button', {name: 'Создать аккаунт'}).click();
  }
  // Back on the task list with the account link in the header.
  return appears(page.getByRole('link', {name: 'Аккаунт'}));
}

const pushed = page => page.waitForResponse(response => response.url().endsWith('/api/sync')
  && (response.request().postData() || '').includes('"action":"push"'), {timeout: 8000});

const browser = await chromium.launch(CHROME ? {executablePath: CHROME} : {});
try{
  const errors = [];
  const phone = await openDevice(browser, errors);
  ok('app boots on the production build without an account', await appears(phone.getByRole('link', {name: 'Войти'})));
  ok('product theme tokens are applied', (await phone.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())) !== '');

  ok('tasks work without an account', await addTask(phone, 'С телефона'));
  ok('first sign-in keeps local tasks (email code + handle)', await signIn(phone, 'person@example.com', '@person')
    && await appears(phone.getByRole('checkbox', {name: 'С телефона'})));

  const laptop = await openDevice(browser, errors);
  ok('second device has its own local tasks before sign-in', await addTask(laptop, 'С ноутбука'));
  ok('second device signs in without the handle step', await signIn(laptop, 'person@example.com'));
  ok('second device merges the account tasks with its own',
    await appears(laptop.getByRole('checkbox', {name: 'С телефона'}), 8000)
    && await appears(laptop.getByRole('checkbox', {name: 'С ноутбука'})));

  const completedSent = pushed(laptop);
  await laptop.getByText('С телефона').click();
  ok('task is completed on the second device', await appears(laptop.getByRole('checkbox', {name: 'С телефона', checked: true})));
  ok('the change is sent after the short local pause', (await completedSent).ok());
  // Reopening the app on the phone pulls the change.
  await phone.reload();
  ok('first device receives both the laptop task and its change',
    await appears(phone.getByRole('checkbox', {name: 'С ноутбука'}), 8000)
    && await appears(phone.getByRole('checkbox', {name: 'С телефона', checked: true}), 8000));

  // Paid feature: locked, granted in the shared Admin UI, visible after the app refreshes rights.
  await phone.getByRole('link', {name: 'Аккаунт'}).click();
  ok('paid export is locked before purchase', await appears(phone.getByText(/Экспорт задач в файл — отдельная покупка/)));
  const adminPage = await (await browser.newContext()).newPage();
  adminPage.on('pageerror', e => errors.push(String(e)));
  await adminPage.goto(URL_ + '#/admin');
  await adminPage.getByLabel('ADMIN_KEY').fill(process.env.ADMIN_KEY);
  await adminPage.getByRole('button', {name: 'Подключиться'}).click();
  await adminPage.getByRole('button', {name: 'Пользователи'}).click();
  await adminPage.getByRole('textbox', {name: 'Email'}).fill('person@example.com');
  await adminPage.getByLabel('Покупка (SKU)').selectOption('export');
  await adminPage.getByRole('button', {name: 'Выдать', exact: true}).click();
  ok('admin grants the purchase from the shared Admin UI',
    await appears(adminPage.getByRole('cell', {name: 'export', exact: true})));
  await phone.reload();
  ok('app refreshes rights on start and opens the paid feature',
    await appears(phone.getByRole('button', {name: /Скачать задачи/}), 8000));
  await phone.getByRole('link', {name: /К задачам/}).click();

  await phone.getByRole('link', {name: /Готовые/}).click();
  await phone.waitForURL(/#\/done$/);
  ok('hash route changes with the filter', phone.url().endsWith('#/done'));
  await phone.reload();
  ok('route and task survive a reload (Core storage + hash router)',
    await appears(phone.getByRole('checkbox', {name: 'С телефона', checked: true})) && phone.url().endsWith('#/done'));

  ok('no runtime errors', errors.length === 0);
  if(errors.length) console.log(errors.join('\n'));
}catch(error){
  bad++;
  console.error(error);
}finally{
  await browser.close();
  server.close();
}
console.log(bad ? `\nTask Mini e2e failures: ${bad}` : '\nTask Mini e2e passed');
process.exit(bad ? 1 : 0);
