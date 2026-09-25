/* Architectural dependency boundary regression.
 * Generic Core may never import product/domain modules.
 * Generic server Core may never import FitTimer-specific modules.
 */
const fs = require('fs');
const path = require('path');

let bad = 0;
const ok = (name, cond, extra='') => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra ? ' → ' + extra : ''));
};

function walk(dir){
  if(!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function specifiers(source){
  const out = [];
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g
  ];
  for(const pattern of patterns){
    let match;
    while((match = pattern.exec(source))) out.push(match[1]);
  }
  return out;
}

function normalized(value){
  return String(value || '').replace(/\\/g,'/');
}

const clientCoreFiles = walk('src/core').filter(file => /\.(?:ts|js)$/.test(file));
const clientViolations = [];
for(const file of clientCoreFiles){
  const source = fs.readFileSync(file,'utf8');
  for(const spec of specifiers(source)){
    const s = normalized(spec);
    if(
      s.includes('/app/') || s.startsWith('../app/') || s.startsWith('./app/')
      || s.includes('types/fitness') || /(?:^|\/)fit(?:timer)?[-_/]/i.test(s)
    ){
      clientViolations.push(file + ' -> ' + spec);
    }
  }
}
ok('client Core never imports product/domain modules',
  clientViolations.length === 0,
  clientViolations.join(', '));

const genericServerFiles = [
  ...walk('lib/admin/core').filter(file => file.endsWith('.js')),
  ...walk('lib').filter(file =>
    file.endsWith('.js')
    && !normalized(file).includes('/admin/fittimer/')
    && /(?:^|[-_/])core(?:[-_.\/]|$)/i.test(normalized(file))
  )
];

const serverViolations = [];
for(const file of [...new Set(genericServerFiles)]){
  const source = fs.readFileSync(file,'utf8');
  for(const spec of specifiers(source)){
    const s = normalized(spec);
    if(
      /(?:^|\/)fit[-_]/i.test(s)
      || s.includes('/fittimer/')
      || s.includes('/admin/fittimer/')
    ){
      serverViolations.push(file + ' -> ' + spec);
    }
  }
}
ok('generic server Core never imports FitTimer modules',
  serverViolations.length === 0,
  serverViolations.join(', '));

const productCoreReverseImports = [];
for(const file of walk('src/app').filter(file => file.endsWith('.ts'))){
  const source = fs.readFileSync(file,'utf8');
  for(const spec of specifiers(source)){
    if(normalized(spec).startsWith('../core/')) continue;
    if(normalized(spec).startsWith('./')) continue;
  }
}
ok('product TypeScript modules use explicit module imports',
  !walk('src/app').filter(file => file.endsWith('.ts')).some(file =>
    /\bAppBase(?:Storage|Identity|Sync|Observability|Notifications|UI|Mobile|NativeNotifications)\b/
      .test(fs.readFileSync(file,'utf8'))
  ));


const appbaseManifest = JSON.parse(fs.readFileSync('config/appbase-manifest.json','utf8'));
const manifestFiles = new Set([...appbaseManifest.client, ...appbaseManifest.server]);
const expectedCore = [
  ...walk('src/core').filter(file => file.endsWith('.ts')),
  'src/types/core.ts',
  ...walk('lib/admin/core').filter(file => file.endsWith('.js')),
  ...walk('lib').filter(file => /^lib\/[^/]*-core\.js$/.test(normalized(file)))
].map(normalized);
const unlisted = expectedCore.filter(file => !manifestFiles.has(file));
const missing = [...manifestFiles].filter(file => !fs.existsSync(file));
ok('AppBase manifest lists every Core module', unlisted.length === 0, unlisted.join(', '));
ok('AppBase manifest has no stale entries', missing.length === 0, missing.join(', '));
const manifestFitImports = [];
for(const file of manifestFiles){
  if(!fs.existsSync(file)) continue;
  for(const spec of specifiers(fs.readFileSync(file,'utf8'))){
    const s = normalized(spec);
    if(/(?:^|\/)fit[-_]/i.test(s) || s.includes('/fittimer/') || /(?:^|\/)analytics(?:\.js)?$/.test(s)){
      manifestFitImports.push(file + ' -> ' + spec);
    }
  }
}
ok('AppBase Core files never import FitTimer composition modules', manifestFitImports.length === 0, manifestFitImports.join(', '));

console.log(bad ? `\nDependency boundary failures: ${bad}` : '\nDependency boundaries are clean');
process.exit(bad ? 1 : 0);
