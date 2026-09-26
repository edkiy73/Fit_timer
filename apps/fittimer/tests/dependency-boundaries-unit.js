/* Architectural dependency boundary regression (monorepo).
 * - AppBase Core (packages/core) never imports app code;
 * - FitTimer client code reaches Core only through the @appbase/core / @appbase/types aliases;
 * - FitTimer server code reaches Core only through packages/core/server;
 * - no Core module is left inside the app.
 * packages/core/tests/boundaries.js additionally checks Core vocabulary and self-containment.
 */
const fs = require('fs');
const path = require('path');

let bad = 0;
const ok = (name, cond, extra='') => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra ? ' → ' + extra : ''));
};

const APP = path.resolve(__dirname, '..');
const CORE = path.resolve(APP, '../../packages/core');

function walk(dir){
  if(!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry => {
    if(['node_modules','dist','esm','android','ios'].includes(entry.name)) return [];
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

const coreFiles = [...walk(path.join(CORE,'src')), ...walk(path.join(CORE,'server')), ...walk(path.join(CORE,'template'))]
  .filter(file => /\.(?:ts|js)$/.test(file));
const coreViolations = [];
for(const file of coreFiles){
  for(const spec of specifiers(fs.readFileSync(file,'utf8'))){
    const target = spec.startsWith('.') ? path.resolve(path.dirname(file), spec) : '';
    if((target && !target.startsWith(CORE + path.sep)) || /(?:^|\/)apps\//.test(spec) || /(?:^|\/)fit[-_]/i.test(spec)){
      coreViolations.push(path.relative(CORE, file) + ' -> ' + spec);
    }
  }
}
ok('AppBase Core never imports app code', coreFiles.length > 20 && coreViolations.length === 0, coreViolations.join(', '));

const clientFiles = [...walk(path.join(APP,'src')).filter(file => /\.(?:ts|js)$/.test(file)), path.join(APP,'mobile.js')];
const clientDeepImports = [];
for(const file of clientFiles){
  for(const spec of specifiers(fs.readFileSync(file,'utf8'))){
    if(spec.includes('packages/core') || /(?:^|\/)core\/[a-z-]+\.js$/.test(spec) && !spec.startsWith('@appbase/core/')){
      clientDeepImports.push(path.relative(APP, file) + ' -> ' + spec);
    }
  }
}
ok('FitTimer client imports Core only through @appbase aliases', clientDeepImports.length === 0, clientDeepImports.join(', '));

const serverFiles = [...walk(path.join(APP,'api')), ...walk(path.join(APP,'lib'))].filter(file => file.endsWith('.js'));
const serverDeepImports = [];
for(const file of serverFiles){
  for(const spec of specifiers(fs.readFileSync(file,'utf8'))){
    if(!spec.startsWith('.')) continue;
    const target = path.resolve(path.dirname(file), spec);
    if(target.startsWith(CORE + path.sep) && !target.startsWith(path.join(CORE,'server') + path.sep)){
      serverDeepImports.push(path.relative(APP, file) + ' -> ' + spec);
    }
  }
}
ok('FitTimer server imports Core only from packages/core/server', serverDeepImports.length === 0, serverDeepImports.join(', '));

const leftovers = walk(path.join(APP,'lib'))
  .map(file => path.relative(APP, file).replace(/\\/g,'/'))
  .filter(file => /^lib\/[^/]*-core\.js$/.test(file) || file.startsWith('lib/admin/core/'));
ok('no AppBase Core module is left inside the app', leftovers.length === 0, leftovers.join(', '));

const apiFiles = walk(path.join(APP,'api')).filter(file => file.endsWith('.js'));
const unregistered = apiFiles.filter(file => !/require\(['"](?:\.\.\/)+lib\/product['"]\)/.test(fs.readFileSync(file,'utf8')));
ok('every API entry registers the FitTimer product with server Core', unregistered.length === 0,
  unregistered.map(file => path.relative(APP, file)).join(', '));

ok('product TypeScript modules use explicit module imports',
  !walk(path.join(APP,'src/app')).filter(file => file.endsWith('.ts')).some(file =>
    /\bAppBase(?:Storage|Identity|Sync|Observability|Notifications|UI|Mobile|NativeNotifications)\b/
      .test(fs.readFileSync(file,'utf8'))
  ));

console.log(bad ? `\nDependency boundary failures: ${bad}` : '\nDependency boundaries are clean');
process.exit(bad ? 1 : 0);
