import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(path, 'utf8');
const source = await read('.github/workflows/source-consistency.yml');
const task = await read('.github/workflows/task-mini.yml');
const rootPkg = JSON.parse(await read('package.json'));
const taskPkg = JSON.parse(await read('apps/task-mini/package.json'));

for(const watched of ["'packages/core/**'", "'packages/ui-react/**'", "'templates/**'", "'scripts/**'"]){
  assert.ok(source.includes(watched), 'source-consistency must watch ' + watched);
}
assert.ok(source.includes('npm run check:affected'), 'source-consistency must run affected Core/app checks');
assert.ok(source.includes('Generate and compile clean React starter'), 'source-consistency must compile a generated starter when required');
assert.ok(source.includes('npm run app:create'), 'starter compilation must use the real generator');

for(const watched of ["'packages/core/**'", "'packages/ui-react/**'", "'templates/react-app/**'", "'apps/task-mini/**'"]){
  assert.ok(task.includes(watched), 'Task Mini e2e must watch ' + watched);
}
assert.ok(task.includes('npm run test:browser'), 'Task Mini workflow must run the real browser reference');

assert.match(String(rootPkg.scripts?.['baseline:check'] || ''), /test-appbase-baseline-contract/, 'root baseline check must pin Starter/Task Mini parity');
assert.match(String(rootPkg.scripts?.['starter:check'] || ''), /baseline:check/, 'starter check must include the baseline contract');
assert.match(String(taskPkg.scripts?.check || ''), /test:billing/, 'Task Mini check must include executable billing reference');
assert.match(String(taskPkg.scripts?.['test:billing'] || ''), /billing-reference/, 'Task Mini billing script must run the billing reference');

console.log('ok  AppBase CI contract keeps Starter and Task Mini drift protection wired');
