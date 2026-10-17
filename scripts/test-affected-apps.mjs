/* Проверка фильтра путей CI: node scripts/test-affected-apps.mjs */
import assert from 'node:assert/strict';
import { affectedApps, lightChecks, fittimerBrowserNeeded } from './affected-apps.mjs';

const APPS = ['feture', 'fittimer', 'task-mini', 'unmute'];
const all = {core: true, apps: APPS};
const F = 'apps/feture/';
const cases = [
  [['packages/core/src/core/ui.ts'], all],
  [['packages/ui-react/src/admin.tsx'], all],
  [['packages/core/README.md'], {core: false, apps: []}],
  [['apps/task-mini/src/app.tsx'], {core: false, apps: ['task-mini']}],
  [['apps/unmute/src/app.tsx'], {core: false, apps: ['unmute']}],
  [['apps/fittimer/src/app/70-workout.js', 'apps/task-mini/src/app.tsx'], {core: false, apps: ['fittimer', 'task-mini']}],
  [['apps/fittimer/docs/why.md', 'apps/fittimer/docs/img.png', 'docs/roadmap.md'], {core: false, apps: []}],
  [['package.json'], all],
  [['scripts/apps.mjs'], all],
  [['templates/react-app/src/app.tsx'], all],
  [['templates/react-app/api/billing.js'], all],
  [['.github/workflows/source-consistency.yml'], all],
  [['apps/unknown-app/x.js'], all],
  [['some/new/place.js'], all],
  [[], {core: false, apps: []}]
];
for(const [files, want] of cases) assert.deepEqual(affectedApps(files, APPS), want, files.join(', '));
console.log(`ok  affected-apps (${cases.length} случаев)`);

const light = [
  [[F + 'prototype/v10/s-chats.js', F + 'prototype/v10/styles.css', F + 'public/prototype-v10.html', F + 'public/prototype-v10-notes.html'], {feture: 'check:prototype'}],
  [[F + 'tools/build-prototype-v10.mjs', F + 'tests/prototype-v10-followup-contract.mjs', F + 'docs/design-reference/V10-CHANGELOG.md'], {feture: 'check:prototype'}],
  [[F + 'prototype/v10/data.js', F + 'src/app.tsx'], {}],
  [[F + 'prototype/v10/data.js', 'apps/task-mini/src/app.tsx'], {feture: 'check:prototype'}],
  [[F + 'prototype/v10/data.js', 'packages/core/src/core/ui.ts'], {}],
  [[F + 'prototype/v10/data.js', 'package.json'], {}],
  [[F + 'public/images/v10-content/x.webp'], {}],
  [[F + 'package.json'], {}],
  [[F + 'docs/why.md'], {}],
  [['apps/task-mini/src/app.tsx'], {}],
  [['apps/fittimer/bar/party-bar.js', 'apps/fittimer/bar/index.html'], {fittimer: 'check:bar'}],
  [['apps/fittimer/bar/party-bar.js', 'apps/fittimer/src/app/70-workout.js'], {}],
  [['apps/fittimer/bar/party-bar.js', 'apps/fittimer/vercel.json'], {}],
  [['apps/fittimer/bar/party-bar.js', 'packages/core/src/core/ui.ts'], {}]
];
for(const [files, want] of light) assert.deepEqual(lightChecks(files, APPS), want, files.join(', '));
console.log(`ok  light-checks (${light.length} случаев)`);

const browser = [
  [['apps/fittimer/bar/party-bar.js'], false],
  [['apps/fittimer/bar/sw.js', 'apps/fittimer/docs/why.md'], false],
  [['apps/fittimer/bar/sw.js', 'apps/fittimer/src/app/70-workout.js'], true],
  [['apps/fittimer/src/app/70-workout.js'], true],
  [['apps/unmute/src/app.tsx'], false],
  [['packages/core/src/core/ui.ts'], true],
  [['package.json'], true]
];
for(const [files, want] of browser) assert.equal(fittimerBrowserNeeded(files, APPS), want, files.join(', '));
console.log(`ok  fittimer-browser-needed (${browser.length} случаев)`);
