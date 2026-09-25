import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CORE_DIR = path.join(ROOT, 'src', 'core');
const GENERIC_TYPES = path.join(ROOT, 'src', 'types', 'core');

function stripModuleExtension(value){
  return value
    .replace(/\.(?:d\.)?[cm]?[jt]sx?$/i, '')
    .replace(/\/index$/i, '');
}

export function collectModuleSpecifiers(source, fileName = 'module.ts'){
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.getScriptKindFromFileName(fileName)
  );
  const found = [];

  const add = node => {
    if(!node || !ts.isStringLiteralLike(node)) return;
    const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    found.push({specifier: node.text, line: pos.line + 1});
  };

  const visit = node => {
    if(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)){
      add(node.moduleSpecifier);
    }else if(ts.isCallExpression(node) && node.arguments.length){
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if(isDynamicImport || isRequire) add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

export function coreDependencyAllowed(sourcePath, specifier, root = ROOT){
  if(typeof specifier !== 'string' || !specifier) return true;
  if(!specifier.startsWith('.') && !specifier.startsWith('/')) return true;

  const absoluteSource = path.resolve(root, sourcePath);
  const resolved = specifier.startsWith('/')
    ? path.resolve(root, '.' + specifier)
    : path.resolve(path.dirname(absoluteSource), specifier);
  const target = stripModuleExtension(resolved);
  const core = stripModuleExtension(path.resolve(root, 'src/core'));
  const genericTypes = stripModuleExtension(path.resolve(root, 'src/types/core'));

  return target === core
    || target.startsWith(core + path.sep)
    || target === genericTypes;
}

async function coreSourceFiles(dir = CORE_DIR){
  const entries = await readdir(dir, {withFileTypes:true});
  const files = [];
  for(const entry of entries){
    const full = path.join(dir, entry.name);
    if(entry.isDirectory()) files.push(...await coreSourceFiles(full));
    else if(/\.[cm]?[jt]sx?$/i.test(entry.name) && !entry.name.endsWith('.runtime.js')) files.push(full);
  }
  return files.sort();
}

export async function checkAppBaseBoundaries(root = ROOT){
  const files = await coreSourceFiles(path.resolve(root, 'src/core'));
  const errors = [];
  for(const file of files){
    const source = await readFile(file, 'utf8');
    const rel = path.relative(root, file).replaceAll(path.sep, '/');
    for(const item of collectModuleSpecifiers(source, file)){
      if(!coreDependencyAllowed(rel, item.specifier, root)){
        errors.push({file:rel, line:item.line, specifier:item.specifier});
      }
    }
  }
  return errors;
}

async function main(){
  const errors = await checkAppBaseBoundaries();
  if(errors.length){
    console.error('AppBase dependency boundary violations:');
    for(const item of errors){
      console.error(`  ${item.file}:${item.line} -> ${item.specifier}`);
    }
    console.error('Core may depend only on src/core/**, src/types/core, or external packages.');
    process.exit(1);
  }
  console.log('AppBase dependency boundaries are valid.');
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
