import { readFile, writeFile } from 'node:fs/promises';

const CHECK = process.argv.includes('--check');
// This deterministic concatenation is also the CI consistency gate for generated sources.

const targets = [
  {
    target: 'app.js',
    parts: [
      'src/i18n/ru.js',
      'src/i18n/en.js',
      'src/i18n/index.js',
      'lib/ai-protocol.js',
      'src/core/storage.runtime.js',
      'src/core/identity.runtime.js',
      'src/core/sync.runtime.js',
      'src/core/observability.runtime.js',
      'src/core/notifications.runtime.js',
      'src/app/00-core.js',
      'src/app/11-sync-schema.js',
      'src/app/10-data-sync.js',
      'src/app/20-account.js',
      'src/app/30-progress-media.js',
      'src/app/40-programs-ai.js',
      'src/app/50-trainer-catalog.js',
      'src/app/60-builder.js',
      'src/app/70-workout.js',
      'src/app/80-platform.js',
      'src/app/90-events.js'
    ]
  },
  {
    target: 'style.css',
    parts: [
      'src/styles/00-foundation.css',
      'src/styles/10-start-workout.css',
      'src/styles/20-finish.css',
      'src/styles/30-themes-settings.css',
      'src/styles/40-home.css',
      'src/styles/50-components-trainer.css',
      'src/styles/60-progress.css'
    ]
  },
  {
    target: 'index.html',
    parts: [
      'src/html/00-shell-home.html',
      'src/html/10-programs-builder.html',
      'src/html/20-workout-finish.html',
      'src/html/30-onboarding-account.html',
      'src/html/40-profiles.html',
      'src/html/50-profile-progress.html'
    ]
  }
];

let bad = false;
for (const item of targets) {
  const chunks = await Promise.all(item.parts.map(path => readFile(path, 'utf8')));
  const next = chunks.join('');
  if (CHECK) {
    const current = await readFile(item.target, 'utf8');
    if (current !== next) {
      bad = true;
      console.error(`${item.target} is stale. Run: npm run build:sources`);
    } else {
      console.log(`${item.target}: source parts are in sync`);
    }
  } else {
    const current = await readFile(item.target, 'utf8').catch(() => '');
    if (current !== next) {
      await writeFile(item.target, next, 'utf8');
      console.log(`rebuilt ${item.target}`);
    } else {
      console.log(`${item.target}: unchanged`);
    }
  }
}
if (bad) process.exit(1);
