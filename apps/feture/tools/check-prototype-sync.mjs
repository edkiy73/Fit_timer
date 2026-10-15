/* Облегчённая проверка прототипа: собранные public/prototype-v10*.html совпадают с исходниками prototype/v10 и docs.
   Запуск: node tools/check-prototype-sync.mjs (из apps/feture). Падает, если после сборки в git есть различия. */
import { spawnSync } from 'node:child_process';

const run = (cmd, args) => spawnSync(cmd, args, {stdio: 'inherit'});
if (run(process.execPath, ['tools/build-prototype-v10.mjs']).status !== 0) process.exit(1);
const diff = run('git', ['diff', '--exit-code', '--stat', '--', 'public/prototype-v10.html', 'public/prototype-v10-notes.html']);
if (diff.status !== 0) {
  console.error('\nСобранный прототип не совпадает с исходниками. Выполни в apps/feture: node tools/build-prototype-v10.mjs — и закоммить public/prototype-v10*.html.');
  process.exit(1);
}
console.log('ok  prototype-v10 build is in sync');
