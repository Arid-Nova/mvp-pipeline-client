'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const EXTENSIONS = ['.js', '.cjs', '.mjs', '.jsx', '.ts', '.tsx'];
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'target', 'coverage', '.next', 'vendor']);
const LIMITS = Object.freeze({ files: 3000, bytes: 64 * 1024 * 1024, fileBytes: 2 * 1024 * 1024, astNodes: 2000000, directoryDepth: 32, entries: 30000 });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const unwrap = n => {
    while (n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) || ts.isAwaitExpression(n)))
        n = n.expression;
    return n;
};
const prop = n => ts.isPropertyAccessExpression(n) ? n.name.text : ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression) ? n.argumentExpression.text : null;
const literal = n => { n = unwrap(n); return n && ts.isStringLiteralLike(n) ? n.text : null; };
const functionLike = n => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n);
class Project {
    constructor(root) {
        this.root = fs.realpathSync(root);
        this.modules = new Map();
        this.functions = new Map();
        this.scopes = new WeakMap();
        this.functionNodes = new WeakMap();
        this.mutatedNames = new Set();
        this.propertyWrites = [];
        this.staticProperties = new Map();
        this.mutatedExternals = new Set();
        this.coverage = { files: 0, sourceBytes: 0, astNodes: 0, entries: 0, skippedSymlinks: 0, skippedFiles: 0, parseErrors: 0, boundsReached: false };
        this.digest = crypto.createHash('sha256');
        this.walk(this.root);
        this.metadata = {};
        this.metadataFiles = [];
        for (const file of ['package.json', 'package-lock.json']) {
            const absolute = path.join(this.root, file);
            if (!fs.existsSync(absolute)) continue;
            const stat = fs.lstatSync(absolute);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > LIMITS.fileBytes) {
                this.coverage.skippedFiles++;
                this.coverage.boundsReached = true;
                continue;
            }
            const bytes = fs.readFileSync(absolute);
            this.digest.update(file).update('\0').update(bytes).update('\0');
            this.metadataFiles.push({ file, sha256: hash(bytes) });
            try { this.metadata[file] = JSON.parse(bytes.toString('utf8')); }
            catch { this.coverage.parseErrors++; }
        }
        this.sourceDigest = this.digest.digest('hex');
        for (const m of this.modules.values())
            this.index(m);
        for (const n of this.propertyWrites) {
            const target = this.resolve(n.expression);
            if (target?.kind === 'external')
                this.mutatedExternals.add(target.spec);
            if (target?.kind === 'multer-instance' || target?.kind === 'multer-method')
                this.mutatedExternals.add('multer');
            const identity = this.valueIdentity(target), name = prop(n);
            if (identity && name && ts.isBinaryExpression(n.parent)) {
                const key = identity + '.' + name, writes = this.staticProperties.get(key) || [];
                writes.push(this.isStaticAssignment(n.parent) ? n.parent.right : null);
                this.staticProperties.set(key, writes);
            }
        }
    }
    walk(dir, depth = 0) {
        if (depth > LIMITS.directoryDepth) {
            this.coverage.boundsReached = true;
            return;
        }
        for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            if (++this.coverage.entries > LIMITS.entries) {
                this.coverage.boundsReached = true;
                return;
            }
            if (entry.isSymbolicLink()) {
                this.coverage.skippedSymlinks++;
                continue;
            }
            if (entry.isDirectory()) {
                if (!SKIP.has(entry.name) && !entry.name.startsWith('.'))
                    this.walk(path.join(dir, entry.name), depth + 1);
                continue;
            }
            if (!entry.isFile() || !EXTENSIONS.includes(path.extname(entry.name)))
                continue;
            const absolute = path.join(dir, entry.name), stat = fs.lstatSync(absolute);
            if (stat.isSymbolicLink()) {
                this.coverage.skippedSymlinks++;
                continue;
            }
            if (stat.size > LIMITS.fileBytes || this.coverage.files >= LIMITS.files || this.coverage.sourceBytes + stat.size > LIMITS.bytes) {
                this.coverage.skippedFiles++;
                this.coverage.boundsReached = true;
                continue;
            }
            const bytes = fs.readFileSync(absolute), file = path.relative(this.root, absolute).split(path.sep).join('/');
            this.digest.update(file).update('\0').update(bytes).update('\0');
            const sf = ts.createSourceFile(file, bytes.toString('utf8'), ts.ScriptTarget.Latest, true, /\.tsx?$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.JSX);
            this.coverage.files++;
            this.coverage.sourceBytes += bytes.length;
            if (sf.parseDiagnostics.length)
                this.coverage.parseErrors += sf.parseDiagnostics.length;
            this.modules.set(file, { file, sf, exports: new Map(), registrations: [], functions: [] });
        }
    }
    location(n) { const sf = n.getSourceFile(); return { file: sf.fileName, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 }; }
    module(n) { return this.modules.get(n.getSourceFile().fileName); }
    scope(n) {
        for (let p = n; p; p = p.parent)
            if (this.scopes.has(p))
                return this.scopes.get(p);
        return null;
    }
    lookup(name, n) {
        for (let p = n; p; p = p.parent) {
            const s = this.scopes.get(p);
            if (s?.has(name))
                return s.get(name);
        }
        return null;
    }
    index(m) {
        const visit = n => {
            if (this.coverage.astNodes >= LIMITS.astNodes) {
                this.coverage.boundsReached = true;
                return;
            }
            this.coverage.astNodes++;
            if (ts.isSourceFile(n) || ts.isBlock(n) || functionLike(n))
                this.scopes.set(n, new Map());
            if (functionLike(n)) {
                const name = n.name?.text || (ts.isVariableDeclaration(n.parent) ? n.parent.name.getText(m.sf) : prop(n.parent.left || {}) || '<anonymous>');
                const fn = { id: `${m.file}:${n.pos}`, name, node: n, module: m };
                this.functions.set(fn.id, fn);
                this.functionNodes.set(n, fn);
                m.functions.push(fn);
                for (const p of n.parameters || [])
                    if (ts.isIdentifier(p.name))
                        this.scopes.get(n).set(p.name.text, { kind: 'parameter', node: p });
                if (ts.isFunctionDeclaration(n) && n.name) {
                    this.scope(n.parent)?.set(n.name.text, { kind: 'function', fn });
                    if (n.modifiers?.some(x => x.kind === ts.SyntaxKind.ExportKeyword))
                        m.exports.set(n.modifiers.some(x => x.kind === ts.SyntaxKind.DefaultKeyword) ? 'default' : n.name.text, { kind: 'function', fn });
                }
            }
            if (ts.isImportDeclaration(n) && literal(n.moduleSpecifier) != null && n.importClause) {
                const spec = literal(n.moduleSpecifier), c = n.importClause, s = this.scope(n);
                if (c.name)
                    s.set(c.name.text, { kind: 'import', spec, exportName: 'default', module: m });
                if (c.namedBindings && ts.isNamespaceImport(c.namedBindings))
                    s.set(c.namedBindings.name.text, { kind: 'import', spec, exportName: '*', module: m });
                else if (c.namedBindings)
                    for (const e of c.namedBindings.elements)
                        s.set(e.name.text, { kind: 'import', spec, exportName: (e.propertyName || e.name).text, module: m });
            }
            if (ts.isVariableDeclaration(n) && n.initializer) {
                const s = this.scope(n);
                if (ts.isIdentifier(n.name))
                    s?.set(n.name.text, { kind: 'expression', expression: n.initializer, module: m });
                else if (ts.isObjectBindingPattern(n.name))
                    for (const e of n.name.elements)
                        if (ts.isIdentifier(e.name))
                            s?.set(e.name.text, { kind: 'member', base: n.initializer, name: (e.propertyName || e.name).text, module: m });
                if (n.parent.parent.modifiers?.some(x => x.kind === ts.SyntaxKind.ExportKeyword) && ts.isIdentifier(n.name))
                    m.exports.set(n.name.text, { kind: 'expression', expression: n.initializer, module: m });
            }
            if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
                const left = n.left.getText(m.sf);
                if ((left === 'module.exports' || /^(?:module\.)?exports\.[A-Za-z_$][\w$]*$/.test(left)) && !this.isStaticAssignment(n))
                    m.exportsUncertain = true;
                if (ts.isIdentifier(n.left)) {
                    // Legacy CommonJS files sometimes assign an imported binding without
                    // a declaration. Recognize one top-level assignment; any reassignment
                    // remains untrusted, just like a mutated declared import.
                    if (!this.lookup(n.left.text, n) && ts.isExpressionStatement(n.parent) && ts.isSourceFile(n.parent.parent))
                        this.scope(n)?.set(n.left.text, { kind: 'expression', expression: n.right, module: m });
                    else
                        this.mutatedNames.add(`${m.file}:${n.left.text}`);
                }
                if (ts.isPropertyAccessExpression(n.left) || ts.isElementAccessExpression(n.left))
                    this.propertyWrites.push(n.left);
                if (left === 'module.exports') {
                    m.exports.set('default', { kind: 'expression', expression: n.right, module: m });
                    if (ts.isObjectLiteralExpression(n.right))
                        for (const e of n.right.properties) {
                            const name = e.name && (ts.isIdentifier(e.name) || ts.isStringLiteralLike(e.name)) ? e.name.text : null;
                            if (name && ts.isPropertyAssignment(e))
                                m.exports.set(name, { kind: 'expression', expression: e.initializer, module: m });
                            else if (name && ts.isShorthandPropertyAssignment(e))
                                m.exports.set(name, { kind: 'expression', expression: e.name, module: m });
                            else if (name && ts.isMethodDeclaration(e))
                                m.exports.set(name, { kind: 'expression', expression: e, module: m });
                        }
                }
                else if (/^(?:module\.)?exports\.[A-Za-z_$][\w$]*$/.test(left))
                    m.exports.set(prop(n.left), { kind: 'expression', expression: n.right, module: m });
            }
            if (ts.isExportAssignment(n))
                m.exports.set('default', { kind: 'expression', expression: n.expression, module: m });
            ts.forEachChild(n, visit);
        };
        visit(m.sf);
    }
    resolveModule(from, spec) {
        if (typeof spec !== 'string' || !spec.startsWith('.'))
            return null;
        const base = path.posix.normalize(path.posix.join(path.posix.dirname(from.file), spec));
        if (base === '..' || base.startsWith('../') || path.posix.isAbsolute(base))
            return null;
        for (const candidate of [base, ...EXTENSIONS.map(e => base + e), ...EXTENSIONS.map(e => base + '/index' + e)])
            if (this.modules.has(candidate))
                return this.modules.get(candidate);
        return null;
    }
    bindingValue(binding, seen) {
        if (!binding)
            return null;
        if (binding.kind === 'function')
            return binding;
        if (binding.kind === 'parameter')
            return { kind: 'parameter', node: binding.node };
        if (binding.kind === 'expression')
            return this.resolve(binding.expression, seen);
        if (binding.kind === 'member')
            return this.member(this.resolve(binding.base, seen), binding.name, seen);
        if (binding.kind === 'import') {
            const module = this.resolveModule(binding.module, binding.spec);
            if (!module)
                return { kind: binding.spec.startsWith('.') ? 'unresolved' : 'external', spec: binding.spec, member: binding.exportName === 'default' || binding.exportName === '*' ? '' : binding.exportName };
            return binding.exportName === '*' ? { kind: 'module', module } : this.exportValue(module, binding.exportName, seen);
        }
        return null;
    }
    exportValue(module, name, seen) {
        if (module.exportsUncertain) return null;
        const binding = module.exports.get(name);
        if (binding)
            return this.bindingValue(binding, seen);
        if (name !== 'default') {
            const base = this.bindingValue(module.exports.get('default'), seen);
            if (base?.kind === 'object')
                return this.member(base, name, seen);
        }
        return null;
    }
    member(base, name, seen) {
        if (!base)
            return null;
        if (base.kind === 'module')
            return this.exportValue(base.module, name, seen);
        if (base.kind === 'external')
            return { ...base, member: [base.member, name].filter(Boolean).join('.') };
        if (base.kind === 'external-instance')
            return { ...base, member: name };
        if (base.kind === 'multer-instance')
            return { ...base, kind: 'multer-method', member: name };
        const assigned = this.staticProperties.get(this.valueIdentity(base) + '.' + name);
        if (assigned) return assigned.length === 1 && assigned[0] ? this.resolve(assigned[0], seen) : null;
        if (base.kind === 'object') {
            const item = base.node.properties.find(x => x.name && (x.name.text === name));
            return item && this.resolve(ts.isPropertyAssignment(item) ? item.initializer : ts.isShorthandPropertyAssignment(item) ? item.name : item, seen);
        }
        return null;
    }
    resolve(expression, seen = new Set()) {
        const n = unwrap(expression);
        if (!n || seen.size > 30 || seen.has(n))
            return null;
        seen = new Set(seen);
        seen.add(n);
        if (functionLike(n))
            return { kind: 'function', fn: this.functionNodes.get(n) };
        if (ts.isIdentifier(n))
            return this.mutatedNames.has(`${this.module(n).file}:${n.text}`) ? null : this.bindingValue(this.lookup(n.text, n), seen);
        if (ts.isObjectLiteralExpression(n))
            return { kind: 'object', node: n };
        if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n))
            return this.member(this.resolve(n.expression, seen), prop(n), seen);
        if (ts.isCallExpression(n)) {
            if (ts.isIdentifier(n.expression) && n.expression.text === 'require' && !this.lookup('require', n) && literal(n.arguments[0]) != null) {
                const spec = literal(n.arguments[0]), module = this.resolveModule(this.module(n), spec);
                if (!module)
                    return { kind: spec.startsWith('.') ? 'unresolved' : 'external', spec, member: '' };
                const value = this.exportValue(module, 'default', seen);
                return value || { kind: 'module', module };
            }
            const callee = this.resolve(n.expression, seen);
            if (callee?.kind === 'external' && callee.spec === 'express' && ['', 'Router'].includes(callee.member))
                return { kind: 'express', id: `${this.module(n).file}:${n.pos}`, expressKind: callee.member === 'Router' ? 'router' : 'app', node: n };
            if (callee?.kind === 'external' && ['mysql', 'mysql2', 'mysql2/promise'].includes(callee.spec) && ['createPool', 'createConnection'].includes(callee.member) && !this.mutatedExternals.has(callee.spec))
                return { kind: 'external-instance', spec: callee.spec, factory: callee.member, member: '', id: `${this.module(n).file}:${n.pos}` };
            if (callee?.kind === 'external-instance' && callee.member === 'promise' && ['mysql', 'mysql2'].includes(callee.spec))
                return { ...callee, member: '', promise: true };
            if (callee?.kind === 'external' && callee.spec === 'multer' && callee.member === '' && !this.mutatedExternals.has('multer'))
                return { kind: 'multer-instance', node: n, options: n.arguments[0] };
            if (callee?.kind === 'multer-method' && ['single', 'array', 'fields', 'none', 'any'].includes(callee.member) && !this.mutatedExternals.has('multer')) {
                const dependency = this.dependency('multer');
                // Only the reviewed 1.4 LTS API is summarized. Other major versions
                // stay opaque until their continuation semantics are reviewed.
                if (!dependency || !/^[~^]?1\.4\.(?:[0-9]+)(?:-lts\.[0-9]+)?$/.test(dependency.version)) return null;
                const options = this.resolve(callee.options, seen);
                const properties = options?.kind === 'object' ? options.node.properties : [];
                const custom = Boolean(callee.options && options?.kind !== 'object') || properties.some(x => !ts.isPropertyAssignment(x) || ['storage', 'fileFilter'].includes(x.name?.text));
                return { kind: 'middleware-summary', package: 'multer', version: dependency.version, versionSource: dependency.source, operation: callee.member, admission: 'continue-or-error', requestWrites: ['body', callee.member === 'single' ? 'file' : 'files'], guard: false, controlUnknown: custom, authenticationUnknown: custom, limitations: custom ? ['Custom upload storage or filtering callbacks are not covered by the standard Multer continuation summary.'] : dependency.source === 'package-lock.json' ? [] : ['Dependency version is declared by a package range; installed version was not verified.'] };
            }
        }
        if (ts.isNewExpression(n)) {
            const callee = this.resolve(n.expression, seen);
            if (callee?.kind === 'external' && callee.spec === 'pg' && ['Pool', 'Client'].includes(callee.member) && !this.mutatedExternals.has(callee.spec))
                return { kind: 'external-instance', spec: callee.spec, factory: callee.member, member: '', id: `${this.module(n).file}:${n.pos}` };
        }
        return null;
    }
    valueIdentity(value) {
        if (value?.kind === 'function') return value.fn?.id || null;
        if (value?.kind === 'object') return `${value.node.getSourceFile().fileName}:${value.node.pos}`;
        return null;
    }
    isStaticAssignment(node) {
        return ts.isExpressionStatement(node.parent) && ts.isSourceFile(node.parent.parent);
    }
    flatten(expression, depth = 0) {
        const n = unwrap(expression);
        if (depth >= 16) {
            this.coverage.boundsReached = true;
            return [n];
        }
        if (n && ts.isArrayLiteralExpression(n))
            return n.elements.slice(0, 100).flatMap(e => this.flatten(e, depth + 1));
        return [n];
    }
    dependency(name) {
        const lock = this.metadata['package-lock.json'];
        const version = lock?.packages?.['node_modules/' + name]?.version || lock?.dependencies?.[name]?.version;
        if (typeof version === 'string') return { version, source: 'package-lock.json' };
        const declared = this.metadata['package.json']?.dependencies?.[name];
        return typeof declared === 'string' ? { version: declared, source: 'package.json' } : null;
    }
}
module.exports = { Project, ts, unwrap, prop, literal, functionLike, hash, LIMITS };
