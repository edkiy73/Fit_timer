const { collectModuleSpecifiers, coreDependencyAllowed } = await import('../scripts/check-appbase-boundaries.mjs');

let bad = 0;
const ok = (name, cond, extra) => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' FAIL ') + ' ' + name + (extra != null ? ' → ' + extra : ''));
};

const sample = `
import { storage } from './storage.js';
export { CoreProfile } from '../types/core.js';
const lazy = import('./mobile.js');
const legacy = require('./identity.js');
`;
const specs = collectModuleSpecifiers(sample, 'src/core/example.ts').map(x => x.specifier);
ok('checker parses static import', specs.includes('./storage.js'));
ok('checker parses re-export', specs.includes('../types/core.js'));
ok('checker parses dynamic import', specs.includes('./mobile.js'));
ok('checker parses require', specs.includes('./identity.js'));

ok('Core may import another Core module',
  coreDependencyAllowed('src/core/example.ts', './storage.js'));
ok('Core may import generic Core contracts',
  coreDependencyAllowed('src/core/example.ts', '../types/core.js'));
ok('Core may import external packages',
  coreDependencyAllowed('src/core/example.ts', '@capacitor/app'));
ok('Core may not import FitTimer fitness contracts',
  !coreDependencyAllowed('src/core/example.ts', '../types/fitness.js'));
ok('Core may not import product runtime',
  !coreDependencyAllowed('src/core/example.ts', '../app/70-workout.js'));
ok('Core may not import product config',
  !coreDependencyAllowed('src/core/example.ts', '../../config/product.json'));

if(bad){
  console.error('\nAppBase boundary unit failures: ' + bad);
  process.exit(1);
}
console.log('\nAppBase boundary checker behavior is valid.');
