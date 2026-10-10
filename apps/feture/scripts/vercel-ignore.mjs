import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// AppBase deployment policy: only runtime-impacting changes deploy.
// Unknown files or unavailable Git history always deploy (fail open).
const APP = 'feture';
const OWN = `apps/${APP}/`;
const RUNTIME_SHARED = ['packages/', 'shared/', 'config/'];
const ROOT_RUNTIME = new Set(['package.json','package-lock.json','npm-shrinkwrap.json','vercel.json','.npmrc','.nvmrc','tsconfig.json']);
const TEST_FILE = /(?:^|\/)(?:__tests__|tests|test|e2e)\//;
const TEST_SUFFIX = /(?:\.test|\.spec)\.[cm]?[jt]sx?$/;

export function shouldDeployPath(path) {
  const file = String(path).replaceAll('\\', '/');
  if (file.endsWith('.md') || file.startsWith('docs/') || file.startsWith('.ai/')) return false;
  if (file.startsWith('.github/')) return false; // CI changes do not change deployed app.
  if (file.startsWith('templates/')) return false; // Future-app starter only.
  if (file.startsWith('scripts/')) return !/^scripts\/(?:test-|check-)/.test(file); // build tooling may affect apps
  if (file.startsWith('apps/')) {
    if (!file.startsWith(OWN)) return false;
    const local = file.slice(OWN.length);
    if (/^(docs|tests|test|e2e|__tests__|android|ios)\//.test(local)) return false;
    if (TEST_FILE.test(local) || TEST_SUFFIX.test(local)) return false;
    return true;
  }
  if (file.startsWith('packages/')) {
    if (TEST_FILE.test(file) || TEST_SUFFIX.test(file)) return false;
    return true;
  }
  if (RUNTIME_SHARED.some(prefix => file.startsWith(prefix))) return true;
  if (ROOT_RUNTIME.has(file)) return true;
  return true; // Unrecognized changes may affect deployment.
}

export function shouldSkip(files) {
  return Array.isArray(files) && files.length > 0 && !files.some(shouldDeployPath);
}

function changes() {
  const head = process.env.VERCEL_GIT_COMMIT_SHA || 'HEAD';
  const previous = process.env.VERCEL_GIT_PREVIOUS_SHA;
  // A known previous deployment must be compared cumulatively, not against HEAD^.
  // If missing from shallow clone, build rather than miss intermediate changes.
  const base = previous && !/^0+$/.test(previous) ? previous : head + '^';
  try {
    const result = execFileSync('git', ['diff', '--name-only', base, head], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    return result.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  } catch {
    return null;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = changes();
  // Vercel: exit 0 skips; exit 1 deploys.
  process.exit(shouldSkip(files) ? 0 : 1);
}
