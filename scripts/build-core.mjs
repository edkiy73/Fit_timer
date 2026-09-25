import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const CHECK = process.argv.includes('--check');
const sourcePath = 'src/core/storage.ts';
const runtimePath = 'core/storage.js';

const source = await readFile(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext
  },
  fileName: sourcePath
}).outputText;

if(CHECK){
  const current = await readFile(runtimePath, 'utf8').catch(() => '');
  if(current !== output){
    console.error(`${runtimePath} is stale. Run: npm run build:core`);
    console.error('--- expected generated runtime ---');
    console.error(output);
    console.error('--- end expected generated runtime ---');
    process.exit(1);
  }
  console.log(`${runtimePath}: TypeScript ES module is in sync`);
}else{
  await mkdir(path.dirname(runtimePath), {recursive:true});
  const current = await readFile(runtimePath, 'utf8').catch(() => '');
  if(current !== output){
    await writeFile(runtimePath, output, 'utf8');
    console.log(`rebuilt ${runtimePath}`);
  }else{
    console.log(`${runtimePath}: unchanged`);
  }
}
