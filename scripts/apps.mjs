import { readdir, readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const APPS_DIR = path.join(ROOT, 'apps');

async function exists(file){
  try { await access(file, constants.F_OK); return true; } catch { return false; }
}

async function apps(){
  const entries = await readdir(APPS_DIR, {withFileTypes:true});
  const out = [];
  for(const entry of entries){
    if(!entry.isDirectory()) continue;
    const dir = path.join(APPS_DIR, entry.name);
    const pkgPath = path.join(dir, 'package.json');
    if(!(await exists(pkgPath))) continue;
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    out.push({name:entry.name, dir, pkg});
  }
  return out.sort((a,b) => a.name.localeCompare(b.name));
}

function run(command, args, cwd=ROOT){
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd, stdio:'inherit', shell:process.platform === 'win32'});
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(command + ' exited with ' + code)));
    child.on('error', reject);
  });
}

const [mode, scriptName] = process.argv.slice(2);
const all = await apps();
if(!all.length) throw new Error('No apps with package.json found under apps/');

if(mode === 'setup'){
  for(const app of all){
    const lock = path.join(app.dir, 'package-lock.json');
    const hasDeps = Object.keys(app.pkg.dependencies || {}).length || Object.keys(app.pkg.devDependencies || {}).length;
    if(await exists(lock)){
      console.log('\n== setup ' + app.name + ' ==');
      await run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], app.dir);
    }else if(hasDeps){
      throw new Error(app.name + ' has dependencies but no package-lock.json');
    }else{
      console.log('\n== setup ' + app.name + ' (no dependencies) ==');
    }
  }
}else if(mode === 'check'){
  for(const app of all){
    if(!app.pkg.scripts?.check) throw new Error(app.name + ' must define scripts.check');
    console.log('\n== check ' + app.name + ' ==');
    await run('npm', ['run', 'check'], app.dir);
  }
}else if(mode === 'run'){
  if(!scriptName) throw new Error('Usage: node scripts/apps.mjs run <script>');
  for(const app of all){
    if(!app.pkg.scripts?.[scriptName]) continue;
    console.log('\n== ' + scriptName + ' ' + app.name + ' ==');
    await run('npm', ['run', scriptName], app.dir);
  }
}else{
  throw new Error('Usage: node scripts/apps.mjs <setup|check|run> [script]');
}
