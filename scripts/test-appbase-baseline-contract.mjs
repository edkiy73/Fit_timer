import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { BASELINE, CURRENT_GAPS, TIERS } from './appbase-baseline-contract.mjs';

const ROOT = process.cwd();
const targets = {
  starter: path.join(ROOT, 'templates/react-app'),
  taskMini: path.join(ROOT, 'apps/task-mini')
};

async function exists(file){ try{ await access(file); return true; }catch{ return false; } }
async function text(root, rel){ return readFile(path.join(root, rel), 'utf8'); }
async function has(root, rel, pattern){
  if(!(await exists(path.join(root, rel)))) return false;
  return pattern.test(await text(root, rel));
}

const evidence = {
  reactTsVite: async root => {
    const pkg = JSON.parse(await text(root, 'package.json'));
    return !!(pkg.dependencies?.react && pkg.devDependencies?.typescript && pkg.devDependencies?.vite);
  },
  routing: root => has(root, 'src/main.tsx', /createHashRouter|createBrowserRouter/),
  coreAliases: async root => (await has(root, 'vite.config.mts', /@appbase\/core/)) && (await has(root, 'vite.config.mts', /@appbase\/ui-react/)),
  auth: async root => (await has(root, 'src/app.tsx', /AuthProvider/)) && (await has(root, 'src/auth.ts', /createAuthClient/)),
  i18n: async root => (await has(root, 'src/app.tsx', /I18nProvider/)) && (await exists(path.join(root, 'src/i18n/index.ts'))),
  theme: root => has(root, 'src/main.tsx', /applyProductTheme\(\)/),
  localFirstSync: async root => {
    const starter = await has(root, 'src/sync.ts', /createDocumentSync/);
    const task = await has(root, 'src/tasks\/sync.ts'.replace('\\/','/'), /startAutoSync/);
    return starter || task;
  },
  billingClient: async root => (await has(root, 'src/billing.ts', /createBillingClient/)) && (await has(root, 'api/billing.js', /createBillingHandler/)),
  installAnalytics: root => has(root, 'src/main.tsx', /trackInstallOnce\(\)/),
  clientDiagnostics: root => has(root, 'src/main.tsx', /installGlobalDiagnostics\(\)/),
  fatalErrorBoundary: root => has(root, 'src/main.tsx', /AppErrorBoundary/),
  genericFallbackUx: root => has(root, 'src/app.tsx', /path:\s*['"]\*['"]|errorElement|NotFound|RouteError/),
  adminUi: async root => (await has(root, 'src/app.tsx', /AdminPanel/)) && (await has(root, 'src/app.tsx', /path:\s*['"]\/admin['"]/)),
  adminApi: root => has(root, 'api/admin.js', /createAdminHandler/),
  healthApi: root => exists(path.join(root, 'api/health.js')),
  legalConfig: root => has(root, 'api/admin.js', /createAdminHandler/),
  checks: async root => {
    const pkg = JSON.parse(await text(root, 'package.json'));
    const check = String(pkg.scripts?.check || '');
    return /typecheck/.test(check) && /test:/.test(check) && /build/.test(check);
  }
};

const tiers = new Set(Object.values(TIERS));
assert.equal(new Set(BASELINE.map(item => item.id)).size, BASELINE.length, 'baseline ids must be unique');
for(const item of BASELINE){
  assert.ok(tiers.has(item.tier), 'unknown tier for ' + item.id);
  assert.ok(item.description, 'missing description for ' + item.id);
}

const required = BASELINE.filter(item => item.tier === TIERS.REQUIRED);
for(const [name, root] of Object.entries(targets)){
  const missing = [];
  for(const item of required){
    const check = evidence[item.id];
    assert.equal(typeof check, 'function', 'missing evidence checker for required capability ' + item.id);
    if(!(await check(root))) missing.push(item.id);
  }
  assert.deepEqual(missing, [...CURRENT_GAPS[name]], name + ' baseline drift changed; update implementation or CURRENT_GAPS intentionally');
  console.log('ok  ' + name + ': ' + (required.length - missing.length) + '/' + required.length + ' required baseline capabilities; gaps=' + (missing.join(',') || 'none'));
}

console.log('ok  AppBase baseline contract tiers: required=' +
  BASELINE.filter(x=>x.tier===TIERS.REQUIRED).length + ', optional=' +
  BASELINE.filter(x=>x.tier===TIERS.OPTIONAL).length + ', product=' +
  BASELINE.filter(x=>x.tier===TIERS.PRODUCT).length);

const taskMiniWorkflow = await readFile(path.join(ROOT, '.github/workflows/task-mini.yml'), 'utf8');
for(const requiredPath of [
  "'packages/core/**'",
  "'packages/ui-react/**'",
  "'templates/react-app/**'",
  "'apps/task-mini/**'"
]){
  assert.ok(taskMiniWorkflow.includes(requiredPath),
    'Task Mini e2e must run for shared/starter drift: missing workflow path ' + requiredPath);
}
console.log('ok  Task Mini e2e watches Core, shared UI, starter and Task Mini');
