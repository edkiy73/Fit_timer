import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync(new URL('../apps/fittimer/package.json', import.meta.url), 'utf8'));
const runner = readFileSync(new URL('../apps/fittimer/scripts/test.mjs', import.meta.url), 'utf8');
const command = pkg.scripts.check || '';
assert.match(command, /node scripts\/test\.mjs --static/);
assert.match(command, /node scripts\/test\.mjs --unit/);
assert.match(command, /npm run build/);
assert.match(command, /npm run check:mobile/);
for (const redundant of ['npm run typecheck', 'npm run test:boundaries', 'npm run test:foundation', 'npm run check:sources']) {
  assert.ok(!command.includes(redundant), 'duplicated check: ' + redundant);
}
assert.match(runner, /npm\('typecheck'\)/);
assert.match(runner, /npm\('test:boundaries'\)/);
assert.match(runner, /npm\('check:sources'\)/);
assert.match(runner, /STATIC_TESTS/);
console.log('FitTimer full check preserves static, unit, build and mobile checks without redundant commands');
