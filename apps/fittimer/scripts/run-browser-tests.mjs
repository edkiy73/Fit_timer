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
            node scripts/run-browser-tests.mjs sync-flow  — выбранные
            node scripts/run-browser-tests.mjs --shard=2/4 — вторая из четырёх частей (CI гоняет части
                     параллельно, у каждой свой сервер). Части балансируются по tests/browser-timings.json.
            node scripts/run-browser-tests.mjs --write-timings — полный прогон и обновление этого файла */

import { spawn } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BROWSER_TESTS, UNIT_TESTS, ADMIN_TESTS, STATIC_TESTS } from './test-lists.mjs';
import { shardTests } from './browser-shards.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// Не тесты: сервер и общий хелпер.
const NOT_TESTS = new Set(['dev-server']);
const PER_TEST_MS = 240000;
const TIMINGS = path.join(ROOT, 'tests', 'browser-timings.json');

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

const argv = process.argv.slice(2);
const shardArg = argv.find(a => a.startsWith('--shard='));
const writeTimings = argv.includes('--write-timings');
const only = argv.filter(a => !a.startsWith('--'));
let list = only.length ? only : BROWSER_TESTS;
let shardIndex = 1;
if(shardArg){
  const m = /^--shard=(\d+)\/(\d+)$/.exec(shardArg);
  if(!m || +m[1] < 1 || +m[1] > +m[2]) throw new Error('Ожидается --shard=<номер>/<всего>, например --shard=1/4');
  shardIndex = +m[1];
  const timings = JSON.parse(await readFile(TIMINGS, 'utf8'));
  list = shardTests(list, timings, shardIndex, +m[2]);
  console.log(`Часть ${m[1]}/${m[2]}: ${list.join(', ')}`);
}
let failed = 0;
const done = [];

// Проверку «тест нигде не запускается» делает только первая часть, чтобы не дублировать.
if(!only.length && shardIndex === 1){
  const gaps = await coverageGaps();
  if(gaps.length){
    console.log('Тесты, которые нигде не запускаются: ' + gaps.join(', '));
    console.log('Добавь их в scripts/test-lists.mjs.');
    failed++;
  }
}

for(const name of list){
  const r = await run(name);
  done.push(r);
  console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${name}  (${r.sec} с)`);
  if(!r.ok){
    failed++;
    console.log(r.out.split('\n').map(l => '      ' + l).join('\n'));
  }
}
const slowest = [...done].sort((a, b) => b.sec - a.sec).slice(0, 5);
console.log(`\nСамые долгие: ${slowest.map(r => `${r.name} ${r.sec} с`).join(', ')}; всего ${done.reduce((s, r) => s + r.sec, 0)} с`);
if(writeTimings && !failed){
  const timings = Object.fromEntries(done.map(r => [r.name, r.sec]).sort((a, b) => a[0].localeCompare(b[0])));
  await writeFile(TIMINGS, JSON.stringify(timings, null, 2) + '\n');
  console.log('Обновлён ' + path.relative(ROOT, TIMINGS));
}
console.log(failed ? `\nПровалено: ${failed}` : `\nВсе ${list.length} прошли`);
process.exit(failed ? 1 : 0);
