import { shouldIgnore } from '../scripts/vercel-ignore.mjs';

const need=(ok,msg)=>{if(!ok)throw new Error(msg);};
const app = p => 'apps/fittimer/' + p;

need(shouldIgnore([app('docs/setup.md'),app('tests/a.js')],'docs only'),'docs/tests should skip Vercel');
need(shouldIgnore([app('android/app/a.java')],'native only'),'Android-only change should skip Vercel');
need(shouldIgnore(['CLAUDE.md','docs/appbase-preparation-roadmap.md','../../.github/workflows/x.yml'],'repo meta'),'repository docs/CI should skip Vercel');
need(shouldIgnore(['apps/other-app/index.html'],'other app'),'another app must not deploy FitTimer');
need(shouldIgnore(['packages/core/tests/runtime.mjs'],'core tests'),'Core tests should skip Vercel');
need(!shouldIgnore([app('api/admin.js')],'server change'),'API change must deploy');
need(!shouldIgnore([app('admin.html')],'admin change'),'admin change must deploy');
need(!shouldIgnore([app('src/styles/00-foundation.css')],'frontend source change'),'frontend source change must deploy');
need(!shouldIgnore(['packages/core/server/auth-core.js'],'core change'),'AppBase Core change must deploy FitTimer');
need(!shouldIgnore(['packages/core/src/core/storage.ts'],'core client change'),'AppBase client Core change must deploy FitTimer');
need(shouldIgnore([app('api/admin.js')],'work [skip vercel]'),'explicit skip marker must win');
need(!shouldIgnore([app('docs/setup.md')],'release [deploy]'),'explicit deploy marker must force deployment');

console.log('Vercel ignored-build policy is valid.');
