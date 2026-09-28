import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4175;
const URL = `http://127.0.0.1:${PORT}/`;
const CHROME = process.env.FIT_CHROME || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
let bad = 0;
const ok = (name, value) => { if(!value) bad++; console.log((value ? '  ok  ' : ' FAIL ') + name); };

const server = spawn('npx',['vite','preview','--port',String(PORT),'--strictPort','--host','127.0.0.1'],{stdio:'ignore'});
const browser = await chromium.launch(CHROME ? {executablePath:CHROME} : {});
try{
  for(let i=0;i<60;i++){ try{ if((await fetch(URL)).ok) break; }catch{} await new Promise(r=>setTimeout(r,250)); }
  const page = await browser.newPage({viewport:{width:390,height:800}});
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(({slug,locale}) => {
    localStorage.setItem(slug + '.auth.session', JSON.stringify({
      email:'demo@example.com',deviceId:'device-e2e',syncToken:'token-e2e',handle:'@demo',
      locale,sub:null,premium:false,fresh:false
    }));
  }, {slug:'__APP_SLUG__', locale:'__APP_LOCALE__'});
  await page.goto(URL);
  await page.getByRole('heading',{name:'__READY_TITLE__'}).waitFor();
  ok('production build boots', true);
  ok('theme tokens are applied', (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())) !== '');
  ok('no runtime errors', errors.length === 0);
} catch(error){ bad++; console.error(error); }
finally{ await browser.close(); server.kill(); }

console.log(bad ? '\nStarter e2e failures: ' + bad : '\nStarter e2e passed');
process.exit(bad ? 1 : 0);
