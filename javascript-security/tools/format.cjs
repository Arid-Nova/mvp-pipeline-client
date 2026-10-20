'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false });
for (const name of fs.readdirSync(root).filter(name => name.endsWith('.cjs'))) {
  const target = path.join(root, name);
  const ast = ts.createSourceFile(name, fs.readFileSync(target, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (ast.parseDiagnostics.length) throw new Error(`Cannot format invalid JavaScript: ${name}`);
  fs.writeFileSync(target, printer.printFile(ast));
}
