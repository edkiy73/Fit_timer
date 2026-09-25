import { readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';

const CHECK = process.argv.includes('--check');
const sourcePath = 'src/core/storage.ts';
const runtimePath = 'src/core/storage.runtime.js';

const source = await readFile(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.None
  },
  fileName: sourcePath
}).outputText;

if(CHECK){
  const current = await readFile(runtimePath, 'utf8');
  if(current !== output){
    console.error(`${runtimePath} is stale. Run: npm run build:core`);
    process.exit(1);
  }
  console.log(`${runtimePath}: TypeScript runtime is in sync`);
}else{
  const current = await readFile(runtimePath, 'utf8').catch(() => '');
  if(current !== output){
    await writeFile(runtimePath, output, 'utf8');
    console.log(`rebuilt ${runtimePath}`);
  }else{
    console.log(`${runtimePath}: unchanged`);
  }
}
