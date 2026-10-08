import { shouldSkip } from '../scripts/vercel-ignore.mjs';

const need=(ok,msg)=>{if(!ok)throw new Error(msg);};
const app = p => 'apps/fittimer/' + p;

need(shouldSkip([app('docs/setup.md'),app('tests/a.js')]),'docs/tests should skip Vercel');
need(shouldSkip([app('android/app/a.java')]),'Android-only change should skip Vercel');
need(shouldSkip(['CLAUDE.md','docs/appbase-preparation-roadmap.md','../../.github/workflows/x.yml']),'repository docs/CI should skip Vercel');
need(shouldSkip(['apps/other-app/index.html']),'another app must not deploy FitTimer');
need(shouldSkip(['packages/core/tests/runtime.mjs']),'Core tests should skip Vercel');
need(!shouldSkip([app('api/admin.js')]),'API change must deploy');
need(!shouldSkip([app('admin.html')]),'admin change must deploy');
need(!shouldSkip([app('src/styles/00-foundation.css')]),'frontend source change must deploy');
need(!shouldSkip(['packages/core/server/auth-core.js']),'AppBase Core change must deploy FitTimer');
need(!shouldSkip(['packages/core/src/core/storage.ts']),'AppBase client Core change must deploy FitTimer');
need(!shouldSkip([app('api/admin.js')]),'commit markers must not skip runtime changes');
need(shouldSkip([app('docs/setup.md')]),'docs-only changes may skip');

console.log('Vercel ignored-build policy is valid.');
