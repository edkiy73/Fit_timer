/* Phase 13 guard: the product runtime is a graph of ES modules (src/app/NN-*.js) that
   import each other cyclically. That is safe only while:
   1. a part's top level only declares things — startup wiring lives in its exported
      init function, which src/app/index.js calls once, in part order;
   2. no top-level initializer reads another part's binding at load time (in a cycle
      it may not be initialised yet); shared constants live in leaf modules (options.js);
   3. every name another module exports is imported where it is used. A forgotten
      import is not a build error: it silently falls back to a global and fails only
      at run time.
   Cross-module writes need no guard: esbuild rejects assignments to imports. */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const APP = 'src/app';
const parts = fs.readdirSync(APP).filter(n => /^\d\d-[\w-]+\.js$/.test(n) && n !== '00-dependencies.js').sort();
const leaves = ['00-dependencies.js', 'options.js'].map(n => path.join(APP, n)).concat('src/i18n/index.js');
const files = parts.map(n => path.join(APP, n)).concat(leaves, path.join(APP, 'index.js')).map(f => path.resolve(f));
const program = ts.createProgram(files, {allowJs:true, checkJs:false, noLib:true, noEmit:true,
  module:ts.ModuleKind.ESNext, moduleResolution:ts.ModuleResolutionKind.Bundler});
const checker = program.getTypeChecker();
const sfOf = f => program.getSourceFile(path.resolve(f));
const hasExport = n => (ts.getCombinedModifierFlags(n) & ts.ModifierFlags.Export) !== 0;

const problems = [];
const exportedBy = new Map();
for(const f of parts.map(n => path.join(APP, n)).concat(leaves)){
  for(const st of sfOf(f).statements){
    if((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name && hasExport(st)) exportedBy.set(st.name.text, f);
    if(ts.isVariableStatement(st) && hasExport(st)) for(const d of st.declarationList.declarations) if(ts.isIdentifier(d.name)) exportedBy.set(d.name.text, f);
  }
}

for(const name of parts){
  const f = path.join(APP, name);
  const sf = sfOf(f);
  const localFns = new Map();
  for(const st of sf.statements){
    if(ts.isFunctionDeclaration(st) && st.name) localFns.set(st.name.text, st);
  }
  // 1. top level only declares
  for(const st of sf.statements){
    if(ts.isImportDeclaration(st) || ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isVariableStatement(st)) continue;
    const line = sf.getLineAndCharacterOfPosition(st.getStart()).line + 1;
    problems.push(`${f}:${line} runs code at module load; move it into the part's init function`);
  }
  // 2. load-time reads of other parts' bindings (following this part's own functions)
  const importedFromPart = id => {
    const sym = checker.getSymbolAtLocation(id);
    if(!sym || !(sym.flags & ts.SymbolFlags.Alias)) return null;
    const decl = sym.declarations && sym.declarations[0];
    const imp = decl && ts.findAncestor(decl, ts.isImportDeclaration);
    const spec = imp && imp.moduleSpecifier.text;
    return spec && /^\.\/\d\d-[\w-]+\.js$/.test(spec) && spec !== './00-dependencies.js' ? spec : null;
  };
  for(const st of sf.statements){
    if(!ts.isVariableStatement(st)) continue;
    for(const d of st.declarationList.declarations){
      if(!d.initializer) continue;
      const seen = new Set();
      const scan = (node, deep) => {
        if(!deep && ts.isFunctionLike(node)) return;
        if(ts.isIdentifier(node)){
          const from = importedFromPart(node);
          if(from){
            const target = checker.getAliasedSymbol(checker.getSymbolAtLocation(node));
            const isFn = target && target.declarations && target.declarations.some(ts.isFunctionDeclaration);
            if(!isFn) problems.push(`${f}: top-level ${d.name.getText()} reads ${node.text} from ${from} at load time`);
          }
          if(localFns.has(node.text) && !seen.has(node.text) && !ts.isFunctionDeclaration(node.parent)){
            seen.add(node.text); scan(localFns.get(node.text).body || localFns.get(node.text), true);
          }
        }
        ts.forEachChild(node, n => scan(n, deep));
      };
      if(ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) continue;
      scan(d.initializer, false);
    }
  }
}

// 3. missing imports
const NOT_REFERENCE = id => {
  const p = id.parent;
  return (ts.isPropertyAccessExpression(p) && p.name === id)
    || ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p)
      || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p)) && p.name === id)
    || (ts.isBindingElement(p) && p.propertyName === id)
    || ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p)
    || ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p) || ts.isQualifiedName(p);
};
for(const f of parts.map(n => path.join(APP, n)).concat(leaves, path.join(APP, 'index.js'))){
  const sf = sfOf(f);
  const missing = new Set();
  (function visit(node){
    if(ts.isIdentifier(node) && !NOT_REFERENCE(node) && exportedBy.has(node.text)){
      const sym = ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node
        ? checker.getShorthandAssignmentValueSymbol(node.parent)
        : checker.getSymbolAtLocation(node);
      if(!sym) missing.add(node.text);
    }
    ts.forEachChild(node, visit);
  })(sf);
  for(const name of missing) problems.push(`${f} uses ${name} without importing it from ${exportedBy.get(name)}`);
}

// 4. the entry imports one init per part and runs them once, in part order
const entry = fs.readFileSync(path.join(APP, 'index.js'), 'utf8');
const inits = [...entry.matchAll(/^import \{ (init[A-Z]\w*) \} from '\.\/([\w-]+\.js)';$/gm)].map(m => [m[2], m[1]]);
const calls = [...entry.matchAll(/^(init[A-Z]\w*)\(\);$/gm)].map(m => m[1]);
if(JSON.stringify(inits.map(i => i[0])) !== JSON.stringify(parts)) problems.push(`src/app/index.js must import the init function of every part in part order (found ${inits.map(i => i[0]).join(', ')})`);
if(JSON.stringify(calls) !== JSON.stringify(inits.map(i => i[1]))) problems.push(`src/app/index.js must call ${inits.map(i => i[1]).join(', ')} once, in that order`);

console.log((problems.length ? ' ПЛОХО' : '  ok  ') + '  product runtime modules: declaration-only top level, no load-time cycles, no missing imports'
  + (problems.length ? '\n    ' + problems.join('\n    ') : ` (${parts.length} parts, ${exportedBy.size} exports, ${inits.length} init functions)`));
process.exit(problems.length ? 1 : 0);
