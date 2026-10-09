// Inventario estático, de solo lectura. No elimina archivos ni lee/imprime variables secretas.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const relative = (p) => path.relative(root, p).replaceAll('\\', '/');
const files = [], directories = [];
function walk(dir) {
  directories.push(dir);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else files.push(p);
  }
}
walk(path.join(root, 'src'));
const graph = new Map(), missing = [];
function resolve(from, specifier, sass = false) {
  if (!specifier.startsWith('.') && !sass) return null;
  const base = path.resolve(path.dirname(from), specifier);
  const candidates = sass
    ? [base, base + '.scss', path.join(path.dirname(base), '_' + path.basename(base) + '.scss')]
    : [base, base + '.ts', path.join(base, 'index.ts')];
  const found = candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
  if (!found) missing.push({ archivo: relative(from), referencia: specifier });
  return found ?? null;
}
for (const file of files) {
  const edges = new Set();
  const content = fs.readFileSync(file, 'utf8');
  const add = (specifier, sass = false) => {
    const dependency = resolve(file, specifier, sass);
    if (dependency) edges.add(dependency);
  };
  if (file.endsWith('.ts')) {
    const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) add(node.moduleSpecifier.text);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) add(node.arguments[0].text);
      if (ts.isPropertyAssignment(node) && ['templateUrl', 'styleUrl', 'styleUrls'].includes(node.name.getText(source))) {
        if (ts.isStringLiteral(node.initializer)) add(node.initializer.text);
        if (ts.isArrayLiteralExpression(node.initializer)) for (const element of node.initializer.elements) if (ts.isStringLiteral(element)) add(element.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  if (file.endsWith('.scss')) for (const match of content.matchAll(/@(?:use|forward|import)\s+['"]([^'"]+)['"]/g)) if (!match[1].startsWith('sass:')) add(match[1], true);
  graph.set(file, edges);
}
function reachable(roots) {
  const visited = new Set();
  const visit = (file) => { if (visited.has(file)) return; visited.add(file); for (const edge of graph.get(file) ?? []) visit(edge); };
  roots.forEach(visit);
  return visited;
}
const production = reachable(['src/main.ts','src/styles.scss','src/index.html','src/environments/environment.production.ts'].map((p) => path.join(root, p)));
const all = reachable([...production, ...files.filter((p) => p.endsWith('.spec.ts'))]);
const unconnected = files.filter((p) => !all.has(p)).map(relative).sort();
const empty = directories.filter((p) => fs.readdirSync(p).length === 0).map(relative).sort();
const report = { archivos: files.length, directorios: directories.length, conectadosProduccion: production.size,
  tests: files.filter((p) => p.endsWith('.spec.ts')).length, noConectados: unconnected, carpetasVacias: empty, referenciasInexistentes: missing,
  alcance: 'Imports/export/dynamic-import literales TS, recursos externos Angular y Sass. No prueba uso por sistemas externos ni autoriza borrado.' };
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(missing, [], 'Hay imports o recursos locales que no existen');
