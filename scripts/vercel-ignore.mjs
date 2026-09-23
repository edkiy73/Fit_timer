import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SKIP_PREFIXES = ['.github/','.ai/','docs/','tests/','android/','ios/'];
const SKIP_FILES = new Set(['AGENTS.md','CLAUDE.md','README.md','check.py']);

export function shouldIgnore(files, message=''){
  const msg=String(message||'').toLowerCase();
  if(msg.includes('[deploy]')) return false;
  if(msg.includes('[skip vercel]')) return true;
  const changed=(files||[]).map(x=>String(x).trim()).filter(Boolean);
  if(!changed.length) return false;
  return changed.every(path=>SKIP_FILES.has(path)||SKIP_PREFIXES.some(prefix=>path.startsWith(prefix)));
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
