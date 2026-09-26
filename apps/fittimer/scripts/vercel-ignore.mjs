import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// git diff paths are relative to the repository root. Only this app and AppBase Core
// deploy FitTimer; other apps, repository docs and CI config never do.
const APP_PREFIX = 'apps/fittimer/';
const CORE_PREFIX = 'packages/core/';
const SKIP_PREFIXES = ['.ai/','docs/','tests/','android/','ios/'];
const SKIP_FILES = new Set(['README.md','check.py']);
const CORE_SKIP_PREFIXES = ['tests/'];

function deploysApp(path){
  if(path.startsWith(CORE_PREFIX)){
    const rest=path.slice(CORE_PREFIX.length);
    return !CORE_SKIP_PREFIXES.some(prefix=>rest.startsWith(prefix)) && !rest.endsWith('.md');
  }
  if(!path.startsWith(APP_PREFIX)) return false;
  const rest=path.slice(APP_PREFIX.length);
  return !(SKIP_FILES.has(rest)||SKIP_PREFIXES.some(prefix=>rest.startsWith(prefix)));
}

export function shouldIgnore(files, message=''){
  const msg=String(message||'').toLowerCase();
  if(msg.includes('[deploy]')) return false;
  if(msg.includes('[skip vercel]')) return true;
  const changed=(files||[]).map(x=>String(x).trim()).filter(Boolean);
  if(!changed.length) return false;
  return !changed.some(deploysApp);
}

function changedFiles(){
  const head=process.env.VERCEL_GIT_COMMIT_SHA||'HEAD';
  const base=process.env.VERCEL_GIT_PREVIOUS_SHA||'HEAD^';
  try{
    return execFileSync('git',['diff','--name-only',base,head],{encoding:'utf8'})
      .split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  }catch(_){
    return []; // сомневаемся — не пропускаем деплой
  }
}
function commitMessage(){
  try{return execFileSync('git',['log','-1','--pretty=%B'],{encoding:'utf8'});}
  catch(_){return '';}
}

if(import.meta.url===pathToFileURL(process.argv[1]).href){
  const ignore=shouldIgnore(changedFiles(),commitMessage());
  // Vercel: exit 0 = ignored, exit 1 = deploy.
  process.exit(ignore?0:1);
}
