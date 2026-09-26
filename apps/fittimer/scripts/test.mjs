#!/usr/bin/env node
/* Один вход для всех проверок — локально и в CI одинаково.

   npm test                  статические проверки + unit/серверные тесты
   npm test -- --static      только статические проверки
   npm test -- --unit        только unit/серверные тесты (сервер поднимается сам)
   npm test -- --browser     только сборка dist и браузерные сценарии (нужен Chromium)
   npm test -- --admin       только браузерный smoke админки
   npm test -- --all         всё вместе — перед мержем крупных изменений
   Флаги можно сочетать: npm test -- --unit --browser

   Списки тестов — scripts/test-lists.mjs; workflow вызывают этот скрипт,
   а не держат свои копии списков.
   Chromium: FIT_CHROME, иначе /opt/pw-browsers/chromium, иначе playwright. */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, openSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
process.chdir(ROOT);

import { UNIT_TESTS, UNIT_TESTS_WITH_TEST_ENV, ADMIN_TESTS, STATIC_TESTS } from './test-lists.mjs';

const TEST_ENV = {ADMIN_KEY:'testadminkey123456', GEMINI_API_KEY:'test', AI_TEST_MODE:'1'};
const API_PORT = 8124, STATIC_PORT = 8123;
// Лог тестового сервера: при провале печатаем хвост, в CI его же выводит workflow.
export const SERVER_LOG = path.join(os.tmpdir(), 'fittimer-dev-server.log');

const args = new Set(process.argv.slice(2));
const all = args.has('--all');
const picked = ['--static', '--unit', '--browser', '--admin'].some(a => args.has(a));
const want = {
  static: all || args.has('--static') || !picked,
  unit: all || args.has('--unit') || !picked,
  browser: all || args.has('--browser'),
  admin: all || args.has('--admin')
};

let failed = 0;
const results = [];
function step(name, cmd, argv, opts = {}){
  const started = Date.now();
  const r = spawnSync(cmd, argv, {stdio: opts.quiet ? 'pipe' : 'inherit', encoding: 'utf8', env: {...process.env, ...(opts.env || {})}});
  const ok = r.status === 0;
  const sec = Math.round((Date.now() - started) / 1000);
  results.push({name, ok, sec});
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}  (${sec} с)`);
  if(!ok){
    failed++;
    if(opts.quiet) console.log(((r.stdout || '') + (r.stderr || '')).split('\n').map(l => '      ' + l).join('\n'));
  }
  return ok;
}
const npm = (script, quiet = true) => step(`npm run ${script}`, 'npm', ['run', '-s', script], {quiet});
const node = (file, env) => step(file, process.execPath, [file], {quiet: true, env});

async function waitFor(url, ms = 15000){
  const until = Date.now() + ms;
  while(Date.now() < until){
    try{ const r = await fetch(url); if(r.ok) return true; }catch(_){}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`не поднялся ${url}`);
}
const children = [];
process.on('exit', () => children.forEach(c => { try{ c.kill(); }catch(_){} }));
async function startServers(withStatic){
  const log = openSync(SERVER_LOG, 'a');
  const api = spawn(process.execPath, ['tests/dev-server.js', String(API_PORT)], {env: {...process.env, ...TEST_ENV}, stdio: ['ignore', log, log]});
  children.push(api);
  await waitFor(`http://127.0.0.1:${API_PORT}/index.html`);
  if(withStatic){
    const stat = spawn('python3', ['-m', 'http.server', String(STATIC_PORT), '--bind', '127.0.0.1', '--directory', 'dist'], {stdio: 'ignore'});
    children.push(stat);
    await waitFor(`http://127.0.0.1:${STATIC_PORT}/index.html`);
  }
}
function stopServers(){ while(children.length) children.pop().kill(); }

function chromiumPath(){
  if(process.env.FIT_CHROME) return process.env.FIT_CHROME;
  if(existsSync('/opt/pw-browsers/chromium')) return '/opt/pw-browsers/chromium';
  try{
    const r = spawnSync(process.execPath, ['-e', "console.log(require('playwright').chromium.executablePath())"], {encoding: 'utf8'});
    if(r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }catch(_){}
  return '';
}

if(want.static){
  console.log('\n— статические проверки');
  npm('typecheck');
  npm('build:esm');
  for(const name of STATIC_TESTS) node(`tests/${name}.js`);
  npm('test:boundaries');
  npm('check:sources');
  npm('check:ai-index');
  npm('i18n:check');
  const files = ['api', 'lib', 'tests'].flatMap(dir => readdirSync(dir, {recursive: true}).filter(f => f.endsWith('.js')).map(f => path.join(dir, f)))
    .concat(readdirSync('scripts').filter(f => f.endsWith('.mjs')).map(f => path.join('scripts', f)));
  const bad = files.filter(f => spawnSync(process.execPath, ['--check', f]).status !== 0);
  results.push({name: 'node --check', ok: !bad.length});
  console.log(`${bad.length ? 'FAIL' : 'ok  '}  node --check (${files.length} файлов)${bad.length ? ': ' + bad.join(', ') : ''}`);
  if(bad.length) failed++;
  step('python3 check.py', 'python3', ['check.py'], {quiet: true});
}

if(want.unit){
  console.log('\n— unit и серверные тесты');
  await startServers(false);
  for(const name of UNIT_TESTS) node(`tests/${name}.js`, UNIT_TESTS_WITH_TEST_ENV.includes(name) ? TEST_ENV : {});
  stopServers();
}

if(want.browser || want.admin){
  const chrome = chromiumPath();
  if(!chrome){
    console.log('FAIL  браузерные тесты: не найден Chromium (FIT_CHROME или npm install --no-save playwright && npx playwright install chromium)');
    failed++;
  } else {
    console.log('\n— браузерные тесты');
    if(npm('build', false)){
      // dist/ — это и мобильный бандл: тестовый флаг ставим только на время прогона.
      const configPath = 'dist/app.config.js';
      const original = readFileSync('app.config.js', 'utf8');
      writeFileSync(configPath, original + '\nwindow.__FIT_TEST_MODE__ = true;\n');
      try{
        await startServers(true);
        const env = {...TEST_ENV, FIT_CHROME: chrome};
        if(want.browser) step('scripts/run-browser-tests.mjs', process.execPath, ['scripts/run-browser-tests.mjs'], {env});
        if(want.admin) for(const name of ADMIN_TESTS) node(`tests/${name}.js`, env);
      } finally {
        stopServers();
        writeFileSync(configPath, original);
      }
    }
  }
}

if(failed && existsSync(SERVER_LOG)){
  const lines = readFileSync(SERVER_LOG, 'utf8').trimEnd().split('\n');
  console.log(`\nХвост лога тестового сервера (${SERVER_LOG}):\n` + lines.slice(-60).join('\n'));
}
console.log(failed ? `\nПровалено: ${failed}` : `\nВсё прошло (${results.length} шагов)`);
process.exit(failed ? 1 : 0);
