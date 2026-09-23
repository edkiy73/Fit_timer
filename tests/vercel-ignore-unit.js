import { shouldIgnore } from '../scripts/vercel-ignore.mjs';

const need=(ok,msg)=>{if(!ok)throw new Error(msg);};

need(shouldIgnore(['docs/setup.md','tests/a.js'],'docs only'),'docs/tests should skip Vercel');
need(shouldIgnore(['android/app/a.java'],'native only'),'Android-only change should skip Vercel');
need(!shouldIgnore(['api/admin.js'],'server change'),'API change must deploy');
need(!shouldIgnore(['admin.html'],'admin change'),'admin change must deploy');
need(!shouldIgnore(['src/styles/00-foundation.css'],'frontend source change'),'frontend source change must deploy');
need(shouldIgnore(['api/admin.js'],'work [skip vercel]'),'explicit skip marker must win');
need(!shouldIgnore(['docs/setup.md'],'release [deploy]'),'explicit deploy marker must force deployment');

console.log('Vercel ignored-build policy is valid.');
