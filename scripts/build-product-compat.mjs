import { readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';

const CHECK = process.argv.includes('--check');
const sourcePath = 'src/app/sync-schema.ts';
const targetPath = 'src/app/11-sync-schema.js';

const source = await readFile(sourcePath, 'utf8');
const commonJs = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS
  },
  fileName: sourcePath
}).outputText;

const output = `/* Generated from ${sourcePath}. Do not edit directly. */
const __fitSyncSchemaCompat = (() => {
  const module = { exports: {} };
  const exports = module.exports;
  const require = (specifier) => {
    if(specifier === '../core/sync.js') return AppBaseSync;
    throw new Error('Unsupported compatibility import: ' + specifier);
  };
${commonJs.split('\n').map(line => '  ' + line).join('\n')}
  return module.exports;
})();
const FIT_SYNC_PROFILE_DOC_KEYS = __fitSyncSchemaCompat.FIT_SYNC_PROFILE_DOC_KEYS;
const FIT_SYNC_ACCOUNT_DOC_KEYS = __fitSyncSchemaCompat.FIT_SYNC_ACCOUNT_DOC_KEYS;
const FIT_SYNC_REGISTRY = __fitSyncSchemaCompat.FIT_SYNC_REGISTRY;
`;

if(CHECK){
  const current = await readFile(targetPath, 'utf8').catch(() => '');
  if(current !== output){
    console.error(`${targetPath} is stale. Run: npm run build:product-compat`);
    process.exit(1);
  }
  console.log(`${targetPath}: product compatibility output is in sync`);
}else{
  const current = await readFile(targetPath, 'utf8').catch(() => '');
  if(current !== output){
    await writeFile(targetPath, output, 'utf8');
    console.log(`rebuilt ${targetPath}`);
  }else{
    console.log(`${targetPath}: unchanged`);
  }
}
