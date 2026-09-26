/* Phase 13 guard: every top-level binding of the product runtime has one owner chunk.
   Other src/app chunks may read it, but reassign it only through the owner's
   set<Name>Shared() setter. This keeps each chunk splittable into an ES module
   (imported bindings are read-only). Scope-aware: uses the TypeScript checker, so
   local variables that merely share a name are not counted. */
const fs = require('fs');
const ts = require('typescript');

const build = fs.readFileSync('scripts/build-sources.mjs', 'utf8');
const parts = [...build.slice(build.indexOf("target: 'app.js'"), build.indexOf("target: 'style.css'"))
  .matchAll(/'([^']+\.js)'/g)].map(m => m[1]).filter(p => p !== 'app.js');
const texts = parts.map(p => fs.readFileSync(p, 'utf8'));
const starts = [];
let acc = 0;
for(const text of texts){ starts.push(acc); acc += text.length; }
const joined = texts.join('');
const chunkAt = pos => { let i = starts.length - 1; while(i > 0 && starts[i] > pos) i--; return i; };

const FILE = '/virtual/app.js';
const host = ts.createCompilerHost({allowJs:true});
const baseGet = host.getSourceFile;
host.getSourceFile = (name, lang) => name === FILE
  ? ts.createSourceFile(name, joined, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)
  : baseGet(name, lang);
host.fileExists = name => name === FILE || ts.sys.fileExists(name);
host.readFile = name => name === FILE ? joined : ts.sys.readFile(name);
const program = ts.createProgram([FILE], {allowJs:true, checkJs:false, noResolve:true, noLib:true}, host);
const checker = program.getTypeChecker();
const sf = program.getSourceFile(FILE);

const topLevel = new Set();
for(const st of sf.statements){
  if(ts.isVariableStatement(st)) for(const d of st.declarationList.declarations) topLevel.add(d);
  if(ts.isFunctionDeclaration(st)) topLevel.add(st);
}
const isAssign = k => k >= ts.SyntaxKind.FirstAssignment && k <= ts.SyntaxKind.LastAssignment;
const violations = [];
(function visit(node){
  let id = null;
  if(ts.isBinaryExpression(node) && ts.isIdentifier(node.left) && isAssign(node.operatorToken.kind)) id = node.left;
  else if((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && ts.isIdentifier(node.operand)
    && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) id = node.operand;
  if(id){
    const sym = checker.getSymbolAtLocation(id);
    const decl = sym && sym.valueDeclaration;
    if(decl && topLevel.has(decl) && chunkAt(decl.getStart()) !== chunkAt(node.getStart())){
      violations.push(`${parts[chunkAt(node.getStart())]} writes ${id.text} (owner ${parts[chunkAt(decl.getStart())]})`);
    }
  }
  ts.forEachChild(node, visit);
})(sf);

const setters = texts.join('').match(/function set\w+Shared\(value\)/g) || [];
console.log((violations.length ? ' ПЛОХО' : '  ok  ') + '  no chunk reassigns another chunk\'s top-level state'
  + (violations.length ? '\n    ' + violations.join('\n    ') : ` (${setters.length} owner setters)`));
process.exit(violations.length ? 1 : 0);
