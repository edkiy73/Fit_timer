#!/usr/bin/env node
/* Audit the temporary browser-test binding bridge.
   This does not change runtime behavior. It answers two questions before we shrink the bridge:
   1) which product-module bindings browser/admin tests actually reference inside browser callbacks;
   2) which of those bindings tests overwrite/stub.

   Usage:
     node scripts/audit-test-bridge.mjs
     node scripts/audit-test-bridge.mjs --json
     node scripts/audit-test-bridge.mjs --check
*/
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { TEST_BRIDGE_ALLOWLIST, TEST_BRIDGE_WRITABLE } from './test-bridge.mjs';

const ROOT = process.cwd();
const json = process.argv.includes('--json');
const check = process.argv.includes('--check');
const DYNAMIC_BRIDGE_ALLOWLIST = new Set(['exportProgram']);
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
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
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
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
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
        const parent = node.parent;
        mark(node.name.text, short,
          !!parent && ts.isBinaryExpression(parent) && parent.left === node
          && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
          && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment);
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

if(check){
  const measured = new Set(rows.map(row => row.name));
  const missing = rows.map(row => row.name).filter(name => !TEST_BRIDGE_ALLOWLIST.has(name));
  const missingWritable = rows.filter(row => row.writes.length && !TEST_BRIDGE_WRITABLE.has(row.name)).map(row => row.name);
  const writableOutsideBridge = [...TEST_BRIDGE_WRITABLE].filter(name => !TEST_BRIDGE_ALLOWLIST.has(name));
  const stale = [...TEST_BRIDGE_ALLOWLIST].filter(name => !measured.has(name) && !DYNAMIC_BRIDGE_ALLOWLIST.has(name));
  const missingDynamic = [...DYNAMIC_BRIDGE_ALLOWLIST].filter(name => !TEST_BRIDGE_ALLOWLIST.has(name));
  if(missing.length || missingWritable.length || writableOutsideBridge.length || stale.length || missingDynamic.length){
    if(missing.length) console.error('Browser tests use bindings missing from TEST_BRIDGE_ALLOWLIST: ' + missing.join(', '));
    if(missingWritable.length) console.error('Browser tests overwrite bindings missing from TEST_BRIDGE_WRITABLE: ' + missingWritable.join(', '));
    if(writableOutsideBridge.length) console.error('Writable bridge names must also be exposed: ' + writableOutsideBridge.join(', '));
    if(stale.length) console.error('Stale read-only bridge bindings: ' + stale.join(', '));
    if(missingDynamic.length) console.error('Dynamic bridge bindings must stay exposed: ' + missingDynamic.join(', '));
    process.exit(1);
  }
  console.log(`Test bridge covers ${report.usedBindings} measured reads and ${report.overwrittenBindings} measured writes (from ${report.candidateBindings} candidates).`);
}else if(json){
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
