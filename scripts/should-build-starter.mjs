// Conservative trigger for compiling the generated starter in CI.
// The lightweight starter contract checks continue on every affected CI run.
export function requiresStarterBuild(files) {
  if (!Array.isArray(files)) return true;
  return files.some(file => {
    if (file.endsWith('.md') || file.startsWith('docs/')) return false;
    if (file.startsWith('apps/')) return false;
    if (file.startsWith('.github/')) return file === '.github/workflows/source-consistency.yml';
    if (file.startsWith('scripts/')) return file === 'scripts/create-app.mjs' ||
      file === 'scripts/affected-apps.mjs' ||
      file === 'scripts/apps.mjs' ||
      file === 'scripts/should-build-starter.mjs' ||
      file === 'scripts/test-should-build-starter.mjs';
    return true; // templates, Core, UI, root config, unknown paths.
  });
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const { execFileSync } = await import('node:child_process');
  const base = process.argv[2];
  let needs = true;
  if (base && !/^0+$/.test(base)) {
    try {
      const files = execFileSync('git', ['diff', '--name-only', base + '...HEAD'], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
      needs = requiresStarterBuild(files);
    } catch { needs = true; }
  }
  process.stdout.write(needs ? 'true' : 'false');
}
