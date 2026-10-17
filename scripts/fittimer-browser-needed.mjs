/* CI: печатает true/false — нужны ли браузерные тесты FitTimer для изменений с <base>.
   Если изменения посчитать нельзя — true (лишняя проверка лучше пропущенной). */
import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { fittimerBrowserNeeded } from './affected-apps.mjs';

const base = process.argv[2] || '';
const diff = base && !/^0+$/.test(base) ? spawnSync('git', ['diff', '--name-only', base + '...HEAD'], {encoding: 'utf8'}) : null;
if(!(diff && diff.status === 0)){ console.log('true'); process.exit(0); }
const apps = readdirSync('apps').filter(n => existsSync(`apps/${n}/package.json`));
console.log(String(fittimerBrowserNeeded(diff.stdout.split('\n').filter(Boolean), apps)));
