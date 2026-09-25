import { readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';

const CHECK = process.argv.includes('--check');
const targets = [
  ['src/core/storage.ts', 'src/core/storage.runtime.js', 'commonjs-bridge', 'AppBaseStorage'],
  ['src/core/identity.ts', 'src/core/identity.runtime.js', 'commonjs-bridge', 'AppBaseIdentity'],
  ['src/core/sync.ts', 'src/core/sync.runtime.js', 'commonjs-bridge', 'AppBaseSync'],
  ['src/core/observability.ts', 'src/core/observability.runtime.js'],
  ['src/core/notifications.ts', 'src/core/notifications.runtime.js'],
  ['src/core/ui.ts', 'src/core/ui.runtime.js'],
  ['src/core/native-notifications.ts', 'native-notifications.js'],
  ['src/core/mobile.ts', 'mobile-core.js']
];

function buildRuntime(source, sourcePath, mode, globalName){
  if(mode === 'commonjs-bridge'){
    const commonJs = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS
      },
      fileName: sourcePath
    }).outputText;
    return `"use strict";\nvar ${globalName} = (() => {\n    const module = { exports: {} };\n    const exports = module.exports;\n${commonJs.split('\n').map(line => '    ' + line).join('\n')}\n    return module.exports;\n})();\n`;
  }

  return ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None
    },
    fileName: sourcePath
  }).outputText;
}

let bad = false;
for (const [sourcePath, runtimePath, mode, globalName] of targets) {
  const source = await readFile(sourcePath, 'utf8');
  const output = buildRuntime(source, sourcePath, mode, globalName);

  if(CHECK){
    const current = await readFile(runtimePath, 'utf8').catch(() => '');
    if(current !== output){
      bad = true;
      console.error(`${runtimePath} is stale. Run: npm run build:core`);
      console.error('--- expected generated runtime ---');
      console.error(output);
      console.error('--- end expected generated runtime ---');
    }else{
      console.log(`${runtimePath}: TypeScript runtime is in sync`);
    }
  }else{
    const current = await readFile(runtimePath, 'utf8').catch(() => '');
    if(current !== output){
      await writeFile(runtimePath, output, 'utf8');
      console.log(`rebuilt ${runtimePath}`);
    }else{
      console.log(`${runtimePath}: unchanged`);
    }
  }
}
if(bad) process.exit(1);
