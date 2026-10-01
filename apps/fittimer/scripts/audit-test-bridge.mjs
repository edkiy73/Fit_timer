#!/usr/bin/env node
/* Audit the temporary browser-test binding bridge.
   This does not change runtime behavior. It answers two questions before we shrink the bridge:
   1) which product-module bindings browser/admin tests actually reference inside browser callbacks;
   2) which of those bindings tests overwrite/stub.

   Usage:
     node scripts/audit-test-bridge.mjs
     node scripts/audit-test-bridge.mjs --json
*/
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const json = process.argv.includes('--json');
const SOURCE_FILES = [
  ...readdirSync('src/app').filter(name => /^(?:\d\d-[\w-]+|options)\.js$/.test(name)).map(name => path.join('src/app', name)),
  'src/i18n/index.js'
];

function bindingNames(node){
  if(ts.isIdentifier(node)) return [node.text];
  if(ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node)){
    return node.elements.flatMap(el => ts.isOmittedExpression(el) ? [] : bindingNames(el.name));
  }
  return [];
}

function topLevelBindings(fileName){
  const source = readFileSync(fileName, 'utf8');
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, false, ts.ScriptKind.JS);
  const out = new Set();
  for(const stmt of sf.statements){
    if((ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) && stmt.name) out.add(stmt.name.text);
    if(ts.isVariableStatement(stmt)){
      for(const decl of stmt.declarationList.declarations) for(const name of bindingNames(decl.name)) out.add(name);
    }
  }
  return out;
}

const candidates = new Set(SOURCE_FILES.flatMap(file => [...topLevelBindings(file)]));

function walkTests(dir){
  const out = [];
  for(const ent of readdirSync(dir, {withFileTypes:true})){
    const p = path.join(dir, ent.name);
    if(ent.isDirectory()) out.push(...walkTests(p));
    else if(ent.isFile() && ent.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const browserCall = node => ts.isCallExpression(node)
  && ts.isPropertyAccessExpression(node.expression)
  && ['evaluate','evaluateHandle','waitForFunction'].includes(node.expression.name.text)
  && node.arguments.length
  && (ts.isArrowFunction(node.arguments[0]) || ts.isFunctionExpression(node.arguments[0]));

function isWrite(id){
  const p = id.parent;
  if(!p) return false;
  if(ts.isBinaryExpression(p) && p.left === id && p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && p.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return true;
  if((ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p))
    && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(p.operator)) return true;
  return false;
}

const usage = new Map();
function mark(name, file, write){
  if(!candidates.has(name)) return;
  if(!usage.has(name)) usage.set(name, {read:new Set(), write:new Set()});
  usage.get(name)[write ? 'write' : 'read'].add(file);
}

for(const fileName of walkTests('tests')){
  const source = readFileSync(fileName, 'utf8');
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, false, ts.ScriptKind.JS);
  const short = path.relative(ROOT, path.resolve(fileName)).replaceAll('\\\\','/');
  const scanCallback = root => {
    const visit = node => {
      if(ts.isIdentifier(node)){
        const p = node.parent;
        if(!p){ ts.forEachChild(node, visit); return; }
        const propertyName = ts.isPropertyAccessExpression(p) && p.name === node;
        const objectKey = (ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p)) && p.name === node;
        if(!propertyName && !objectKey) mark(node.text, short, isWrite(node));
      }
      if(ts.isPropertyAccessExpression(node)
        && ts.isIdentifier(node.expression)
        && ['window','globalThis'].includes(node.expression.text)){
        mark(node.name.text, short,
          ts.isBinaryExpression(node.parent) && node.parent.left === node
          && node.parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
          && node.parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment);
      }
      ts.forEachChild(node, visit);
    };
    visit(root);
  };
  const visit = node => {
    if(browserCall(node)) scanCallback(node.arguments[0].body);
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const rows = [...usage.entries()]
  .map(([name, value]) => ({
    name,
    writes:[...value.write].sort(),
    reads:[...value.read].sort()
  }))
  .sort((a,b) => a.name.localeCompare(b.name));

const report = {
  candidateBindings:candidates.size,
  usedBindings:rows.length,
  overwrittenBindings:rows.filter(row => row.writes.length).length,
  bindings:rows
};

if(json){
  console.log(JSON.stringify(report, null, 2));
}else{
  console.log(`Bridge candidates: ${report.candidateBindings}`);
  console.log(`Referenced by browser callbacks: ${report.usedBindings}`);
  console.log(`Overwritten/stubbed by browser callbacks: ${report.overwrittenBindings}`);
  console.log('');
  for(const row of rows){
    const mode = row.writes.length ? 'WRITE' : 'read ';
    const files = [...new Set([...row.writes, ...row.reads])];
    console.log(`${mode}  ${row.name}  ← ${files.join(', ')}`);
  }
}
