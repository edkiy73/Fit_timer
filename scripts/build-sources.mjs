import { readFile, writeFile } from 'node:fs/promises';

const CHECK = process.argv.includes('--check');

const APP_TEST_BRIDGE = `
/* Generated test-only legacy binding bridge. Disabled in production. */
if(globalThis.__FIT_TEST_MODE__ === true){
  const __fitExpose = (name, get, set) => {
    const current = Object.getOwnPropertyDescriptor(globalThis, name);
    if(current && !current.configurable) return;
    const descriptor = {configurable:true, enumerable:false, get};
    if(set) descriptor.set = set;
    Object.defineProperty(globalThis, name, descriptor);
  };
  __fitExpose('parseProgramText', () => parseProgramText);
  __fitExpose('customPrograms', () => customPrograms, value => { customPrograms = value; });
  __fitExpose('localISO', () => localISO);
  __fitExpose('DAYS', () => DAYS);
  __fitExpose('currentUser', () => currentUser, value => { currentUser = value; });
  __fitExpose('curUser', () => curUser);
  __fitExpose('goTab', () => goTab);
  __fitExpose('apiPost', () => apiPost);
  __fitExpose('cleanLink', () => cleanLink);
  __fitExpose('openStoreItem', () => openStoreItem);
  __fitExpose('users', () => users, value => { users = value; });
  __fitExpose('refreshVoicePackUI', () => refreshVoicePackUI);
  __fitExpose('stats', () => stats, value => { stats = value; });
  __fitExpose('progWeights', () => progWeights, value => { progWeights = value; });
  __fitExpose('photos', () => photos, value => { photos = value; });
  __fitExpose('account', () => account, value => { account = value; });
  __fitExpose('identity', () => identity, value => { identity = value; });
  __fitExpose('accountSyncAdapter', () => accountSyncAdapter);
  __fitExpose('saveUsers', () => saveUsers);
  __fitExpose('savePrograms', () => savePrograms);
  __fitExpose('saveStats', () => saveStats);
  __fitExpose('saveProgWeights', () => saveProgWeights);
  __fitExpose('kvSet', () => kvSet);
  __fitExpose('kvGet', () => kvGet);
  __fitExpose('connectAccountSync', () => connectAccountSync);
  __fitExpose('isPremium', () => isPremium);
  __fitExpose('saveAccount', () => saveAccount);
  __fitExpose('saveIdentity', () => saveIdentity);
  __fitExpose('state', () => state);
  __fitExpose('openExAI', () => openExAI);
  __fitExpose('exaAddExercise', () => exaAddExercise);
  __fitExpose('// This deterministic concatenation is also the CI consistency gate for generated sources.

const targets = [
  {
    target: 'app.js',
    parts: [
      'src/i18n/ru.js',
      'src/i18n/en.js',
      'src/i18n/index.js',
      'src/app/00-dependencies.js',
      'src/app/00-core.js',
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
  const next = chunks.join('') + (item.target === 'app.js' ? APP_TEST_BRIDGE : '');
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
, () => $);
  __fitExpose('t', () => t);
  __fitExpose('show', () => show);
  __fitExpose('setShown', () => setShown);
  __fitExpose('APP_UPDATE', () => APP_UPDATE);
  __fitExpose('applyAndroidUpdateConfig', () => applyAndroidUpdateConfig);
  __fitExpose('trainer', () => trainer, value => { trainer = value; });
  __fitExpose('storeServer', () => storeServer, value => { storeServer = value; });
  __fitExpose('recognitionLang', () => recognitionLang, value => { recognitionLang = value; });
  __fitExpose('loadData', () => loadData);
  __fitExpose('renderHome', () => renderHome);
}
`;

// This deterministic concatenation is also the CI consistency gate for generated sources.

const targets = [
  {
    target: 'app.js',
    parts: [
      'src/i18n/ru.js',
      'src/i18n/en.js',
      'src/i18n/index.js',
      'src/app/00-dependencies.js',
      'src/app/00-core.js',
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
