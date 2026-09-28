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
  await page.getByText('Купить хлеб').click();
  ok('task is added and completed', await page.getByRole('checkbox', {name: 'Купить хлеб'}).isChecked());

  await page.getByRole('link', {name: /Готовые/}).click();
  ok('hash route changes with the filter', page.url().endsWith('#/done'));

  await page.reload();
  await page.getByText('Купить хлеб').waitFor();
  ok('route and task survive a reload (Core storage + hash router)',
    page.url().endsWith('#/done') && await page.getByRole('checkbox', {name: 'Купить хлеб'}).isChecked());
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
