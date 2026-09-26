/* Product runtime entry (lazily imported by src/main.ts once the native bridge is up).
   Every src/app part is an ES module whose top level only declares things; the startup
   wiring of each part (listeners, handlers, timers, first render) lives in its init
   function. The parts import each other cyclically, which is safe exactly because
   nothing runs at module evaluation. The init functions run here, after the whole
   graph is evaluated, in the original part order. */
import { initCore } from './00-core.js';
import { initDataSync } from './10-data-sync.js';
import { initAccount } from './20-account.js';
import { initProgressMedia } from './30-progress-media.js';
import { initProgramsAi } from './40-programs-ai.js';
import { initTrainerCatalog } from './50-trainer-catalog.js';
import { initBuilder } from './60-builder.js';
import { initWorkout } from './70-workout.js';
import { initPlatform } from './80-platform.js';
import { initEvents } from './90-events.js';

initCore();
initDataSync();
initAccount();
initProgressMedia();
initProgramsAi();
initTrainerCatalog();
initBuilder();
initWorkout();
initPlatform();
initEvents();
