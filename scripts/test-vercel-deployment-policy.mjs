import assert from 'node:assert/strict';
import { shouldDeployPath as fit, shouldSkip as fitSkip } from '../apps/fittimer/scripts/vercel-ignore.mjs';
import { shouldDeployPath as unmute, shouldSkip as unmuteSkip } from '../apps/unmute/scripts/vercel-ignore.mjs';
import { shouldDeployPath as mini, shouldSkip as miniSkip } from '../apps/task-mini/scripts/vercel-ignore.mjs';

for (const [name, active, skip] of [['fittimer',fit,fitSkip],['unmute',unmute,unmuteSkip],['task-mini',mini,miniSkip]]) {
  assert.equal(active(`apps/${name}/src/main.ts`),true);
  assert.equal(active(`apps/${name}/api/admin.js`),true);
  assert.equal(active(`apps/${name}/package-lock.json`),true);
  assert.equal(active(`apps/${name}/tests/smoke.js`),false);
  assert.equal(active(`apps/${name}/src/example.test.ts`),false);
  assert.equal(active('packages/core/src/core/ui.ts'),true);
  assert.equal(active('packages/core/tests/boundaries.js'),false);
  assert.equal(active('packages/ui-react/src/index.ts'),true);
  assert.equal(active('docs/roadmap.md'),false);
  assert.equal(active('.github/workflows/source-consistency.yml'),false);
  assert.equal(active('templates/react-app/src/app.tsx'),false);
  assert.equal(active('apps/other-app/src/main.ts'),false);
  assert.equal(active('surprising-new-file'),true);
  assert.equal(skip(['apps/other-app/src/main.ts','docs/roadmap.md']),true);
  assert.equal(skip(['apps/other-app/src/main.ts','packages/core/src/core/ui.ts']),false);
  assert.equal(skip(null),false);
  assert.equal(skip([]),false);
}
console.log('ok vercel deployment path policy for 3 apps');
