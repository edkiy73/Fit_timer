/* End-to-end check of the real production build: node tests/e2e.mjs (after npm run build).
   Serves dist/ with vite preview and drives Chromium: add → complete → filter → reload keeps data. */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4174;
const URL = `http://127.0.0.1:${PORT}/`;
const CHROME = process.env.FIT_CHROME || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

let bad = 0;
const ok = (name, cond) => { if(!cond) bad++; console.log((cond ? '  ok  ' : ' FAIL ') + ' ' + name); };
// Wait for a state instead of reading it right after an action: React applies updates asynchronously.
const appears = locator => locator.waitFor({timeout: 5000}).then(() => true, () => false);

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {stdio: 'ignore'});
const browser = await chromium.launch(CHROME ? {executablePath: CHROME} : {});
try{
  for(let i = 0; i < 60; i++){
    try{ if((await fetch(URL)).ok) break; }catch{}
    await new Promise(r => setTimeout(r, 250));
  }
  const errors = [];
  const page = await browser.newPage({viewport: {width: 390, height: 800}});
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL);
  await page.getByText('Пока задач нет.').waitFor();
  ok('app boots on the production build', true);
  ok('product theme tokens are applied', (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())) !== '');

  await page.getByRole('textbox', {name: 'Новая задача'}).fill('Купить хлеб');
  await page.getByRole('button', {name: 'Добавить'}).click();
  ok('task is added', await appears(page.getByRole('checkbox', {name: 'Купить хлеб', checked: false})));
  await page.getByText('Купить хлеб').click();
  ok('task is completed', await appears(page.getByRole('checkbox', {name: 'Купить хлеб', checked: true})));

  await page.getByRole('link', {name: /Готовые/}).click();
  await page.waitForURL(/#\/done$/);
  ok('hash route changes with the filter', page.url().endsWith('#/done'));

  await page.reload();
  ok('route and task survive a reload (Core storage + hash router)',
    await appears(page.getByRole('checkbox', {name: 'Купить хлеб', checked: true})) && page.url().endsWith('#/done'));
  ok('no runtime errors', errors.length === 0);
  if(errors.length) console.log(errors.join('\n'));
}catch(error){
  bad++;
  console.error(error);
}finally{
  await browser.close();
  server.kill();
}
console.log(bad ? `\nTask Mini e2e failures: ${bad}` : '\nTask Mini e2e passed');
process.exit(bad ? 1 : 0);
