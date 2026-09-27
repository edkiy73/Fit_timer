/* Проверка фильтра путей CI: node scripts/test-affected-apps.mjs */
import assert from 'node:assert/strict';
import { affectedApps } from './affected-apps.mjs';

const APPS = ['fittimer', 'task-mini'];
const all = {core: true, apps: APPS};
const cases = [
  [['packages/core/src/core/ui.ts'], all],
  [['packages/core/README.md'], {core: false, apps: []}],
  [['apps/task-mini/src/ui.ts'], {core: false, apps: ['task-mini']}],
  [['apps/fittimer/src/app/70-workout.js', 'apps/task-mini/src/ui.ts'], {core: false, apps: APPS}],
  [['apps/fittimer/docs/why.md', 'apps/fittimer/docs/img.png', 'docs/roadmap.md'], {core: false, apps: []}],
  [['package.json'], all],
  [['scripts/apps.mjs'], all],
  [['.github/workflows/source-consistency.yml'], all],
  [['apps/unknown-app/x.js'], all],
  [['some/new/place.js'], all],
  [[], {core: false, apps: []}]
];
for(const [files, want] of cases) assert.deepEqual(affectedApps(files, APPS), want, files.join(', '));
console.log(`ok  affected-apps (${cases.length} случаев)`);
