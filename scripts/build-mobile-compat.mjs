import { readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';

const CHECK = process.argv.includes('--check');
const targets = [
  ['src/core/native-notifications.ts', 'native-notifications.js', 'AppBaseNativeNotifications'],
  ['src/core/mobile.ts', 'mobile-core.js', 'AppBaseMobile']
];

function buildBridge(source, sourcePath, globalName){
  const commonJs = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS
    },
    fileName: sourcePath
  }).outputText;

  return `"use strict";
var ${globalName} = (() => {
    const module = { exports: {} };
    const exports = module.exports;
${commonJs.split('\n').map(line => '    ' + line).join('\n')}
    return module.exports;
})();
`;
}

let bad = false;
for (const [sourcePath, runtimePath, globalName] of targets) {
  const source = await readFile(sourcePath, 'utf8');
  const output = buildBridge(source, sourcePath, globalName);

  if(CHECK){
    const current = await readFile(runtimePath, 'utf8').catch(() => '');
    if(current !== output){
      bad = true;
      console.error(`${runtimePath} is stale. Run: npm run build:mobile-compat`);
    }else{
      console.log(`${runtimePath}: mobile compatibility runtime is in sync`);
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
