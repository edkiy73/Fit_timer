import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Fail open: if Git history cannot be compared, build rather than miss an update.
const APP = 'unmute';
const APP_PREFIX = `apps/${APP}/`;
const ALWAYS_BUILD = [
  'packages/', 'templates/', 'scripts/', '.github/', 'config/', 'shared/',
];
const ROOT_BUILD_FILES = new Set([
  'package.json', 'package-lock.json', 'npm-shrinkwrap.json',
  'vercel.json', '.npmrc', '.nvmrc', 'tsconfig.json',
]);
function requiresBuild(file) {
  if (file.startsWith(APP_PREFIX)) {
    const local = file.slice(APP_PREFIX.length);
    if (local.endsWith('.md') || local.startsWith('docs/')) return false;
    return true;
  }
  if (/^apps\/[^/]+\//.test(file)) return false;
  if (file.endsWith('.md')) return false;
  if (file.startsWith('docs/') || file.startsWith('.ai/')) return false;
  if (ROOT_BUILD_FILES.has(file)) return true;
  if (ALWAYS_BUILD.some(prefix => file.startsWith(prefix))) return true;
  // Unknown paths can contain runtime dependencies; prefer one extra build.
  return true;
}
export function shouldSkip(files) {
  return files.length > 0 && !files.some(requiresBuild);
}
function changedFiles() {
  const head = process.env.VERCEL_GIT_COMMIT_SHA || 'HEAD';
  const previous = process.env.VERCEL_GIT_PREVIOUS_SHA;
  const options = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
  // Vercel may omit the previous SHA or shallow-clone without its parent.
  // Try the last successful deployment first, then the checked-out commit's parent.
  const bases = previous && !/^0+$/.test(previous)
    ? [previous, head + '^']
    : [head + '^'];
  for (const base of bases) {
    try {
      const output = execFileSync('git', ['diff', '--name-only', base, head], options);
      return output.trim().split(/\r?\n/).filter(Boolean);
    } catch { /* try a different base */ }
  }
  return null; // Insufficient history: deploy for safety.
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const changed = changedFiles();
  // Vercel ignores a deployment on exit code 0; exit 1 means build.
  process.exit(changed && shouldSkip(changed) ? 0 : 1);
}
