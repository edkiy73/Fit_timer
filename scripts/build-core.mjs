import { readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';

const CHECK = process.argv.includes('--check');
const targets = [
  ['src/core/storage.ts', 'src/core/storage.runtime.js'],
  ['src/core/identity.ts', 'src/core/identity.runtime.js'],
  ['src/core/sync.ts', 'src/core/sync.runtime.js'],
  ['src/core/observability.ts', 'src/core/observability.runtime.js']
];

let bad = false;
for (const [sourcePath, runtimePath] of targets) {
  const source = await readFile(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None
    },
    fileName: sourcePath
  }).outputText;

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
