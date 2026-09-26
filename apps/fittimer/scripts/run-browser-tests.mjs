#!/usr/bin/env node
/* Прогон браузерных и сквозных тестов против tests/dev-server.js.

   Раньше эти тесты в CI не запускались совсем и незаметно ломались месяцами:
   тестовый сервер не отдавал CSS, тренерские сценарии падали на no_trainer.
   Этот скрипт запускает их по одному, печатает итог и падает, если упал хоть один.
   Заодно проверяет, что каждый tests/*.js где-то запускается — здесь или в scripts/test-lists.mjs,
   чтобы новый тест снова не оказался «забытым».

   Проще всего: npm test -- --browser (сам собирает dist и поднимает серверы).
   Вручную нужны: node tests/dev-server.js 8124 (с ADMIN_KEY, GEMINI_API_KEY=test, AI_TEST_MODE=1),
          статика без API на 8123 (python3 -m http.server 8123) для link-length,
          playwright-core и FIT_CHROME — путь к Chromium.

   Запуск:  node scripts/run-browser-tests.mjs            — все
            node scripts/run-browser-tests.mjs sync-flow  — выбранные */

import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { UNIT_TESTS, ADMIN_TESTS, STATIC_TESTS } from './test-lists.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// Тесты, которые идут здесь. Порядок — от быстрых к долгим.
export const BROWSER_TESTS = [
  'api-flow', 'ai-api', 'youtube-video',
  'csp', 'parse-flat', 'start-overview', 'notifications', 'workout-resume', 'profile-switch', 'quick-finish', 'update-banner',
  'storage-idb', 'ai-image-buttons', 'ai-generation-guards', 'program-actions', 'nav-flow', 'nav-transitions',
  'limits', 'link-length', 'tap-targets', 'store-page', 'backup-flow', 'media-flow', 'catalog-flow',
  'report-auto', 'report-detail', 'prog-check-flow', 'ai-edit-carry', 'voice-test-ui', 'trainer-page', 'trainer-feedback', 'sync-flow', 'account-flow'
];
// Не тесты: сервер и общий хелпер.
const NOT_TESTS = new Set(['dev-server']);
const PER_TEST_MS = 240000;

async function coverageGaps(){
  const files = (await readdir(path.join(ROOT, 'tests'))).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3));
  const pkg = await readFile(path.join(ROOT, 'package.json'), 'utf8');
  const listed = new Set([...BROWSER_TESTS, ...UNIT_TESTS, ...ADMIN_TESTS, ...STATIC_TESTS]);
  return files.filter(n => !NOT_TESTS.has(n) && !listed.has(n) && !pkg.includes(`tests/${n}.js`));
}

function run(name){
  return new Promise(resolve => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(ROOT, 'tests', name + '.js')], {cwd: ROOT, env: process.env});
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    const timer = setTimeout(() => { out += `\n[таймаут ${PER_TEST_MS / 1000} с]`; child.kill('SIGKILL'); }, PER_TEST_MS);
    child.on('close', code => {
      clearTimeout(timer);
      resolve({name, ok: code === 0, sec: Math.round((Date.now() - started) / 1000), out});
    });
  });
}

const only = process.argv.slice(2);
const list = only.length ? only : BROWSER_TESTS;
let failed = 0;

if(!only.length){
  const gaps = await coverageGaps();
  if(gaps.length){
    console.log('Тесты, которые нигде не запускаются: ' + gaps.join(', '));
    console.log('Добавь их в BROWSER_TESTS (scripts/run-browser-tests.mjs) или в scripts/test-lists.mjs.');
    failed++;
  }
}

for(const name of list){
  const r = await run(name);
  console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${name}  (${r.sec} с)`);
  if(!r.ok){
    failed++;
    console.log(r.out.split('\n').map(l => '      ' + l).join('\n'));
  }
}
console.log(failed ? `\nПровалено: ${failed}` : `\nВсе ${list.length} прошли`);
process.exit(failed ? 1 : 0);
