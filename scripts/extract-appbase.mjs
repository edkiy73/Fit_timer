#!/usr/bin/env node
/* Assemble AppBase Core on its own (monorepo Core isolation gate).

   node scripts/extract-appbase.mjs [--out <dir>]   write the snapshot (default: dist-appbase/)
   node scripts/extract-appbase.mjs --check         build into a temp dir and verify it:
       - every file listed in config/appbase-manifest.json exists and is domain-free;
       - every relative require/import inside the snapshot resolves inside the snapshot;
       - the client Core typechecks on its own;
       - the neutral server composition loads and passes a smoke test.

   Core files are copied verbatim; everything product-specific is replaced by neutral
   composition templates generated below. The written assembly also serves as a starting
   point for a new product's composition files (apps/<name>/). */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const CHECK = process.argv.includes('--check');
const outArg = process.argv.indexOf('--out');
const manifest = JSON.parse(await readFile(path.join(ROOT, 'config/appbase-manifest.json'), 'utf8'));
const coreFiles = [...manifest.client, ...manifest.server];

// Vocabulary that must never appear in Core. Legacy wire names are listed in the roadmap
// ("Known, accepted legacy names") and are matched case-sensitively below instead.
const DOMAIN_WORDS = /\b(?:workouts?|exercises?|trainers?|trainees?|programs?|fitness|fittimer|progWeights|warm-?up)\b/i;
const BRAND = /Fit Timer|ru\.fittimer|fittimer99/;

function sourceCommit(){
  try{ return execFileSync('git', ['rev-parse', 'HEAD'], {cwd:ROOT, encoding:'utf8', stdio:['ignore','pipe','ignore']}).trim(); }
  catch(_){ return 'unknown'; }
}

const product = JSON.parse(await readFile(path.join(ROOT, 'config/product.json'), 'utf8'));
const typescriptVersion = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'))
  .devDependencies?.typescript || 'latest';

const templates = {
  'config/product.json': JSON.stringify({
    id: 'com.example.appbase',
    name: 'AppBase',
    slug: 'appbase',
    defaultApiUrl: 'https://example.com',
    defaultPublicUrl: 'https://example.com',
    brand: {
      background: '#101114',
      notificationAccent: '#3B6EF5',
      ui: {
        dark: {background:'#101114', card:'#181A1F', surface:'#20232A', accent:'#4C7DFF', accentInk:'#A9C0FF'},
        light: {background:'#F5F6F8', card:'#FFFFFF', surface:'#EEF1F6', accent:'#2F5FE0', accentInk:'#244BB8'}
      }
    },
    features: Object.fromEntries(Object.keys(product.features).map(key => [key, true]))
  }, null, 2) + '\n',

  'lib/app-analytics.js': `'use strict';
/* Product analytics taxonomy. Add the product's funnel events here. */
const { store } = require('./store');
const { createAnalyticsEngine } = require('./analytics-core');

const EVENTS = Object.freeze(['install', 'onboarding_complete', 'account_created', 'premium_opened', 'purchase_started']);
const engine = createAnalyticsEngine({store, events:EVENTS});

module.exports = {
  EVENTS,
  recordAnalytics: engine.recordAnalytics,
  removeAnalyticsDevice: engine.removeAnalyticsDevice,
  analyticsStats: engine.analyticsStats
};
`,

  'lib/app-sync-schema.js': `'use strict';
/* Product sync documents. Register each document key/prefix the product syncs. */
const { createSyncRegistry } = require('./sync-registry');

const ACCOUNT_PROFILE = '__account__';

module.exports = {
  ACCOUNT_PROFILE,
  registry: createSyncRegistry([
    // Notification opt-out must work without a subscription.
    {scope:'account', key:'notificationPrefs', free:true}
  ])
};
`,

  'lib/app-ai-actions.js': `'use strict';
/* Product AI actions: id, quota bucket (heavy/light/image) and optional validation. */
const { createAIActionRegistry } = require('./ai-action-registry');

module.exports = { registry: createAIActionRegistry([]) };
`,

  'api/auth.js': `/* POST /api/auth — account/auth. Pass a product account extension when needed. */
const { createAuthHandler } = require('../lib/auth-core');
const analytics = require('../lib/app-analytics');

module.exports = createAuthHandler({analytics});
`,

  'api/sync.js': `/* POST /api/sync — document sync for the product registry. */
const { createSyncHandler } = require('../lib/sync-core');
const { ACCOUNT_PROFILE, registry } = require('../lib/app-sync-schema');

module.exports = createSyncHandler({registry, accountProfile: ACCOUNT_PROFILE});
`,

  'api/health.js': `/* GET /api/health — JSON health report. */
const { collectHealth } = require('../lib/health');

module.exports = async (req, res) => {
  const h = await collectHealth();
  res.statusCode = h.ok ? 200 : 503;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(h));
};
`,

  'api/admin.js': `/* POST /api/admin — single authenticated Admin dispatcher (+ /api/ai and /api/config rewrites). */
const { store } = require('../lib/store');
const { fail, readBody, rateOkScoped, sameSecret, cors } = require('../lib/util');
const { createAIHandler } = require('../lib/ai-endpoint');
const { registry: aiActions } = require('../lib/app-ai-actions');
const { analyticsStats } = require('../lib/app-analytics');
const { createAdminObservability } = require('../lib/admin/core/observability');
const { handleAdminAccounts } = require('../lib/admin/core/accounts');
const { handleAdminCampaigns } = require('../lib/admin/core/campaigns');
const { handleAdminAISettings } = require('../lib/admin/core/ai-settings');

const handleAI = createAIHandler(aiActions);
const handleAdminObservability = createAdminObservability({analyticsStats});

module.exports = async (req, res) => {
  if(req.query && (req.query.ai_endpoint === '1' || req.query.public_config === '1')) return handleAI(req, res);
  if(cors(req, res)) return;
  if(req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  if(!store.configured()) return fail(res, 503, 'no_store');
  const admin = process.env.ADMIN_KEY || '';
  if(!admin) return fail(res, 503, 'no_admin_key');
  if(!(await rateOkScoped(req, 'admin-auth', 30, '', 3600, true))) return fail(res, 429, 'rate_limited');
  let given = String(req.headers['x-admin-key'] || '');
  try{ given = decodeURIComponent(given); }catch(_){ return fail(res, 403, 'bad_key'); }
  if(!sameSecret(given, admin)) return fail(res, 403, 'bad_key');
  let body;
  try{ body = await readBody(req); }catch(_){ return fail(res, 413, 'too_large'); }
  const action = (body && body.action) || '';
  if(await handleAdminObservability(action, body, res)) return;
  if(await handleAdminAccounts(action, body, res)) return;
  if(await handleAdminCampaigns(action, body, res)) return;
  if(await handleAdminAISettings(action, body, res)) return;
  return fail(res, 400, 'unknown_action');
};
`,

  'src/types/global.d.ts': `import type { RuntimeAppConfig } from './core';

declare global {
  interface Window {
    APP_CONFIG?: Readonly<RuntimeAppConfig>;
  }
}

export {};
`,

  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022', 'DOM'],
      strict: true, noEmit: true, skipLibCheck: true, exactOptionalPropertyTypes: true,
      noUncheckedIndexedAccess: true, verbatimModuleSyntax: false
    },
    include: ['src/types/**/*.ts', 'src/core/**/*.ts']
  }, null, 2) + '\n',

  'package.json': JSON.stringify({
    name: 'appbase',
    private: true,
    version: '0.1.0',
    scripts: {
      typecheck: 'tsc -p tsconfig.json',
      test: 'node tests/smoke.js'
    },
    devDependencies: {typescript: typescriptVersion}
  }, null, 2) + '\n',

  'tests/smoke.js': `/* AppBase snapshot smoke test: the neutral composition loads and Core behaves generically. */
process.env.ALLOW_MEMORY_STORE = '1';
let bad = 0;
const ok = (name, cond) => { if(!cond) bad++; console.log((cond ? '  ok  ' : ' FAIL ') + ' ' + name); };

function fakeRes(){
  return {statusCode:0, headers:{}, body:'', setHeader(k, v){ this.headers[k] = v; }, end(b){ this.body = b || ''; }};
}

(async () => {
  const auth = require('../api/auth');
  const sync = require('../api/sync');
  const admin = require('../api/admin');
  const health = require('../api/health');
  ok('neutral API composition loads', [auth, sync, admin, health].every(fn => typeof fn === 'function'));

  const { capabilities } = require('../lib/capabilities-core');
  ok('capabilities come from config/product.json', capabilities().enabled('ai'));
  const { productIdentity } = require('../lib/product-core');
  ok('product identity comes from config/product.json', productIdentity().name === 'AppBase');

  const { registry } = require('../lib/app-sync-schema');
  ok('sync registry accepts free account preferences', registry.accepts('account', 'notificationPrefs'));

  const res = fakeRes();
  await sync({method:'POST', headers:{}, body:{}}, res);
  ok('sync rejects unauthenticated requests', res.statusCode === 401);

  const authRes = fakeRes();
  await auth({method:'POST', headers:{}, body:{action:'unknown'}}, authRes);
  ok('auth rejects unknown actions without an email', authRes.statusCode >= 400);

  console.log(bad ? '\\nAppBase smoke failures: ' + bad : '\\nAppBase smoke test passed');
  process.exit(bad ? 1 : 0);
})();
`,

  'README.md': `# AppBase

Reusable application base extracted from a production app. It provides:

- **Client Core** (\`src/core/\`, TypeScript ES modules): storage, account/profile defaults, document-sync registry, analytics/diagnostics transport, notification preferences + delivery budget, native notification transport, mobile bridge (lifecycle, URLs, share, haptics, theme, biometrics), native speech, UI primitives, capability switches.
- **Server Core** (\`lib/\`): key-value store adapter (Upstash/memory), email-code account auth, document sync with revisions/tombstones, AI runtime (providers, fallback, quotas, logging) behind an action registry, analytics engine, diagnostics, push (FCM/APNs), mail, health, Supabase document-store adapter/shadow writes, Core Admin (accounts, analytics, campaigns, AI settings, releases).

## Composition points a product provides

| Where | What |
|---|---|
| \`config/product.json\` | identity, brand tokens, capability switches (\`profiles\`, \`premium\`, \`ai\`, \`notifications\`, \`biometrics\`, \`sharing\`, \`voice\`) |
| \`lib/app-sync-schema.js\` | document keys/prefixes the product syncs |
| \`lib/app-ai-actions.js\` | AI actions (id, quota bucket, validation, optional custom run) |
| \`lib/app-analytics.js\` | analytics event taxonomy |
| \`api/auth.js\` | optional account extension (\`createAuthHandler({accountExtension})\`, contract = \`NO_ACCOUNT_EXTENSION\` in \`lib/auth-core.js\`) |
| \`api/sync.js\` | optional product profile fields (\`sanitizeProfile\`) |
| \`api/health.js\` | optional product health probes |
| \`api/admin.js\` | product admin actions after the Core admin handlers |

Core must never import product modules. Keep product code outside \`src/core/\` and outside the Core files listed in \`APPBASE_SOURCE.json\`.

## Commands

\`\`\`bash
npm install
npm run typecheck
npm test
\`\`\`

See \`APPBASE_SOURCE.json\` for the source commit and file hashes this snapshot was taken from.
`
};

async function listFiles(dir, base = dir){
  const out = [];
  for(const entry of await readdir(dir, {withFileTypes:true})){
    const full = path.join(dir, entry.name);
    if(entry.name === 'node_modules') continue;
    if(entry.isDirectory()) out.push(...await listFiles(full, base));
    else out.push(path.relative(base, full));
  }
  return out;
}

async function writeSnapshot(out){
  await rm(out, {recursive:true, force:true});
  await mkdir(out, {recursive:true});
  const hashes = {};
  for(const file of coreFiles){
    const src = path.join(ROOT, file);
    if(!existsSync(src)) throw new Error('Manifest file is missing: ' + file);
    await mkdir(path.dirname(path.join(out, file)), {recursive:true});
    await cp(src, path.join(out, file));
    hashes[file] = createHash('sha256').update(await readFile(src)).digest('hex');
  }
  for(const [file, content] of Object.entries(templates)){
    await mkdir(path.dirname(path.join(out, file)), {recursive:true});
    await writeFile(path.join(out, file), content, 'utf8');
  }
  await writeFile(path.join(out, 'APPBASE_SOURCE.json'), JSON.stringify({
    sourceRepository: 'edkiy73/Fit_timer',
    sourceCommit: sourceCommit(),
    files: hashes
  }, null, 2) + '\n', 'utf8');
}

function relativeSpecifiers(source){
  const out = [];
  for(const m of source.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)|from\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)){
    out.push(m[1] || m[2] || m[3]);
  }
  return out;
}

async function verifySnapshot(out){
  const problems = [];
  const files = await listFiles(out);
  for(const file of files.filter(f => /\.(?:js|ts|json)$/.test(f))){
    const source = await readFile(path.join(out, file), 'utf8');
    if(file === 'APPBASE_SOURCE.json') continue;
    if(DOMAIN_WORDS.test(source)) problems.push(`${file}: product-domain vocabulary (${source.match(DOMAIN_WORDS)[0]})`);
    if(BRAND.test(source)) problems.push(`${file}: source product brand (${source.match(BRAND)[0]})`);
    for(const spec of relativeSpecifiers(source)){
      const target = path.resolve(path.dirname(path.join(out, file)), spec);
      const candidates = [target, target + '.js', target + '.json', target.replace(/\.js$/, '.ts'), target + '.ts'];
      let found = false;
      for(const candidate of candidates){
        if(existsSync(candidate) && (await stat(candidate)).isFile()){ found = true; break; }
      }
      if(!found) problems.push(`${file}: unresolved ${spec}`);
    }
  }
  if(problems.length) throw new Error('AppBase snapshot problems:\n- ' + problems.join('\n- '));

  const tsc = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  execFileSync(process.execPath, [tsc, '-p', path.join(out, 'tsconfig.json')], {stdio:'inherit'});
  execFileSync(process.execPath, [path.join(out, 'tests', 'smoke.js')], {cwd:out, stdio:'inherit'});
}

if(CHECK){
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'appbase-'));
  try{
    await writeSnapshot(tmp);
    await verifySnapshot(tmp);
    console.log(`AppBase snapshot is clean (${coreFiles.length} Core files)`);
  }finally{
    await rm(tmp, {recursive:true, force:true});
  }
}else{
  const out = path.resolve(ROOT, outArg >= 0 ? process.argv[outArg + 1] : 'dist-appbase');
  await writeSnapshot(out);
  console.log(`AppBase snapshot written to ${path.relative(ROOT, out) || out} (${coreFiles.length} Core files)`);
}
