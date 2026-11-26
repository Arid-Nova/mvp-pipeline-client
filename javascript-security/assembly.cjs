'use strict';
const path = require('node:path');
const { ts, unwrap, prop, literal, functionLike } = require('./ast.cjs');

const MAX_STEPS = 100000;
const MAX_DEPTH = 40;
const key = n => `${n.getSourceFile().fileName}:${n.pos}:${n.end}:${n.kind}`;
const parameterKey = n => `${n.getSourceFile().fileName}:parameter:${n.pos}`;

// This is an interpreter of registration statements, never an evaluator of target
// JavaScript. Only literal local imports and recognized app/router operations are
// followed. Source files and package scripts are not loaded with require().
class Assembly {
    constructor(project, rawEvents, profile = {}) {
        this.p = project;
        this.rawEvents = new Map(rawEvents.map(e => [key(e.node), e]));
        this.profile = profile;
        this.events = [];
        this.loaded = new Set();
        this.invoked = new Set();
        this.applicationRoots = new Set();
        this.routingOptions = new Map();
        this.reasons = [];
        this.consignLoads = [];
        this.steps = 0;
        this.order = 0;
        this.entry = this.selectEntrypoint();
        if (project.coverage.boundsReached || project.coverage.parseErrors)
            this.issue('INCOMPLETE_SOURCE_GRAPH', null, 'Source parsing errors or traversal limits prevent complete application assembly.');
        if (this.entry.file) this.load(this.p.modules.get(this.entry.file), new Map(), false, 0);
        this.coverage = {
            status: !this.entry.file || this.reasons.length ? 'partial' : 'complete',
            selectedEntrypoint: this.entry.file,
            selectionSource: this.entry.source,
            selectionScope: 'Static application configuration; deployment startup is not independently verified.',
            reasons: this.entry.reasons.concat(this.reasons),
            loadedModules: [...this.loaded].sort(),
            unreferencedSourceModules: [...project.modules.keys()].filter(x => !this.loaded.has(x)).sort(),
            recordedRegistrations: this.events.filter(e => e.kind === 'route').length,
            consignLoads: this.consignLoads,
            packageMetadata: project.metadataFiles,
            routingSemantics: { framework: 'Express 4 compatible routing', dependency: project.dependency('express'), owners: [...this.routingOptions].map(([owner, options]) => ({ owner, ...options })) },
            limits: { steps: MAX_STEPS, callDepth: MAX_DEPTH },
            steps: this.steps
        };
    }
    selectEntrypoint() {
        const reasons = [];
        const validate = (value, source) => {
            if (typeof value !== 'string' || value.length > 2048 || value.includes('\\') || path.posix.isAbsolute(value) || value.split('/').includes('..'))
                return { file: null, source, reasons: ['Entrypoint must be a literal source-relative path within the analyzed snapshot.'] };
            const file = path.posix.normalize(value.replace(/^\.\//, ''));
            return this.p.modules.has(file) ? { file, source, reasons } : { file: null, source, reasons: ['The selected entrypoint is not a parsed source file in this snapshot.'] };
        };
        if (Object.prototype.hasOwnProperty.call(this.profile || {}, 'entrypoint'))
            return validate(this.profile.entrypoint, 'analysis-profile');
        const pkg = this.p.metadata['package.json'];
        if (typeof pkg?.scripts?.start === 'string') {
            // A script is parsed as data. Shell syntax, environment expansion,
            // command chaining, loaders and arbitrary flags are not interpreted.
            const match = /^(?:node|nodemon)\s+([A-Za-z0-9_./-]+)\s*$/.exec(pkg.scripts.start.trim());
            if (match) return validate(match[1], 'package.json:scripts.start');
            return { file: null, source: 'package.json:scripts.start', reasons: ['The start script is not a supported literal Node entrypoint; provide analysisProfile.entrypoint.'] };
        }
        if (typeof pkg?.main === 'string') return validate(pkg.main, 'package.json:main');
        return { file: null, source: 'unspecified', reasons: ['No explicit or literal package entrypoint was selected.'] };
    }
    issue(code, node, detail) {
        const location = node ? this.p.location(node) : null;
        const item = { code, ...(location ? { location } : {}), detail };
        if (!this.reasons.some(x => x.code === code && x.location?.file === location?.file && x.location?.line === location?.line))
            this.reasons.push(item);
    }
    owner(expression, env) {
        const value = this.p.resolve(expression);
        if (value?.kind === 'express') return value.id;
        if (value?.kind === 'parameter') return env.get(parameterKey(value.node)) || null;
        return null;
    }
    booleanLiteral(node) {
        node = unwrap(node);
        if (node?.kind === ts.SyntaxKind.TrueKeyword) return true;
        if (node?.kind === ts.SyntaxKind.FalseKeyword) return false;
        return null;
    }
    createRoutingOptions(instance) {
        if (this.routingOptions.has(instance.id)) return;
        const options = { kind: instance.expressKind, caseSensitive: false, strict: false, initialized: instance.expressKind === 'router' };
        if (instance.expressKind === 'router' && instance.node.arguments.length) {
            const declaration = this.p.resolve(instance.node.arguments[0]);
            if (declaration?.kind !== 'object') options.caseSensitive = options.strict = null;
            else for (const property of declaration.node.properties) {
                if (!ts.isPropertyAssignment(property)) options.caseSensitive = options.strict = null;
                else if (['caseSensitive', 'strict'].includes(property.name?.text)) options[property.name.text] = this.booleanLiteral(property.initializer);
            }
            if (options.caseSensitive === null || options.strict === null)
                this.issue('UNRESOLVED_ROUTER_OPTIONS', instance.node, 'Router case sensitivity or strict-routing options are not literal booleans.');
        }
        this.routingOptions.set(instance.id, options);
    }
    configureRouting(node, owner, conditional) {
        const method = prop(node.expression), setting = literal(node.arguments[0]);
        if (!['set', 'enable', 'disable'].includes(method)) return;
        const options = this.routingOptions.get(owner);
        if (!options) return;
        if (options.kind !== 'app') {
            this.issue('UNSUPPORTED_ROUTER_SETTINGS', node, 'Router settings must be supplied through constructor options.');
            return;
        }
        // Express captures these settings when app.lazyrouter first creates the
        // underlying router. Later app.set/enable calls do not retrofit it.
        if (options.initialized) return;
        if (setting === null) {
            options.caseSensitive = options.strict = null;
            this.issue('COMPUTED_ROUTING_SETTING', node, 'A computed application setting can change routing semantics.');
        }
        else if (setting === 'case sensitive routing' || setting === 'strict routing') {
            const value = conditional ? null : method === 'enable' ? true : method === 'disable' ? false : this.booleanLiteral(node.arguments[1]);
            options[setting === 'case sensitive routing' ? 'caseSensitive' : 'strict'] = value;
            if (value === null) this.issue('UNRESOLVED_ROUTING_SETTING', node, 'Conditional or computed routing settings leave route matching unresolved.');
        }
    }
    assignRouting(node, env, conditional) {
        if (!ts.isPropertyAccessExpression(node.left) && !ts.isElementAccessExpression(node.left)) return;
        const field = prop(node.left), receiver = node.left.expression;
        let owner = this.owner(receiver, env), directRouter = true;
        if (!owner && ['_router', 'settings'].includes(prop(receiver))) {
            owner = this.owner(receiver.expression, env);
            directRouter = prop(receiver) === '_router';
        }
        const options = this.routingOptions.get(owner);
        if (!options) return;
        const option = ['caseSensitive', 'case sensitive routing'].includes(field) ? 'caseSensitive' : ['strict', 'strict routing'].includes(field) ? 'strict' : null;
        if (!option) return;
        if (this.owner(receiver, env) && options.kind === 'app') return; // app.caseSensitive is not its router setting.
        if (!directRouter && options.initialized) return;
        const value = conditional ? null : this.booleanLiteral(node.right);
        options[option] = value;
        if (value === null) this.issue('UNRESOLVED_ROUTING_MUTATION', node, 'A routing option mutation is conditional or computed.');
    }
    load(module, env, conditional, depth) {
        if (!module || this.loaded.has(module.file)) return;
        this.loaded.add(module.file);
        // Imports initialize before ordinary statements in an ESM module.
        for (const statement of module.sf.statements)
            if (ts.isImportDeclaration(statement)) {
                const spec = literal(statement.moduleSpecifier);
                const dependency = spec && this.p.resolveModule(module, spec);
                if (dependency) this.load(dependency, new Map(), conditional, depth + 1);
            }
        this.visit(module.sf, env, conditional, depth);
    }
    localRequire(node, env, conditional, depth) {
        if (!ts.isIdentifier(node.expression) || node.expression.text !== 'require' || this.p.lookup('require', node)) return false;
        const spec = literal(node.arguments[0]);
        if (spec === null) {
            this.issue('DYNAMIC_MODULE_LOAD', node, 'A computed require call can affect application initialization.');
            return true;
        }
        if (spec.startsWith('.')) {
            const module = this.p.resolveModule(this.p.module(node), spec);
            if (module) this.load(module, new Map(), conditional, depth + 1);
            // Non-code assets do not introduce Express registrations. A missing
            // JavaScript import is nevertheless an unresolved initialization edge.
            else if (!/\.(?:json|pem|crt|key|txt|png|jpg|svg)$/.test(spec))
                this.issue('UNRESOLVED_LOCAL_MODULE', node, 'A literal local code import was not included in the parsed source snapshot.');
        }
        return true;
    }
    invoke(fn, args, env, conditional, depth, call) {
        if (!fn?.node?.body) return;
        const binding = new Map(env);
        for (let i = 0; i < fn.node.parameters.length; i++) {
            const actual = typeof args[i] === 'string' ? args[i] : this.owner(args[i], env);
            if (actual) binding.set(parameterKey(fn.node.parameters[i]), actual);
        }
        const signature = fn.id + ':' + [...binding.values()].join(':');
        if (this.invoked.has(signature)) {
            this.issue('REPEATED_REGISTRAR', call || fn.node, 'A registrar is recursive or invoked repeatedly; duplicate registration order requires review.');
            return;
        }
        this.invoked.add(signature);
        this.visit(fn.node.body, binding, conditional, depth + 1);
    }
    consign(node, env, conditional, depth) {
        if (prop(node.expression) !== 'into') return false;
        const stages = [];
        let cursor = unwrap(node.expression.expression);
        while (cursor && ts.isCallExpression(cursor) && ['include', 'then', 'exclude'].includes(prop(cursor.expression))) {
            stages.unshift({ kind: prop(cursor.expression), path: literal(cursor.arguments[0]), node: cursor });
            cursor = unwrap(cursor.expression.expression);
        }
        if (!cursor || !ts.isCallExpression(cursor)) return false;
        const callee = this.p.resolve(cursor.expression);
        if (callee?.kind !== 'external' || callee.spec !== 'consign' || this.p.mutatedExternals.has('consign')) return false;
        const owner = this.owner(node.arguments[0], env), dependency = this.p.dependency('consign');
        if (!owner || !dependency || !/^[~^]?0\.1\.6$/.test(dependency.version)) {
            this.issue('UNSUPPORTED_CONSIGN_CONTEXT', node, 'Consign needs a resolved Express target and a reviewed 0.1.6 dependency declaration.');
            return true;
        }
        let cwd = '', unsupportedOptions = false;
        if (cursor.arguments.length) {
            const options = this.p.resolve(cursor.arguments[0]);
            if (options?.kind !== 'object') unsupportedOptions = true;
            else for (const property of options.node.properties) {
                const name = property.name?.text;
                if (!ts.isPropertyAssignment(property)) unsupportedOptions = true;
                else if (name === 'cwd') {
                    const value = literal(property.initializer);
                    if (value === null) unsupportedOptions = true;
                    else cwd = value;
                }
                else if (!['verbose', 'locale', 'loggingType'].includes(name)) unsupportedOptions = true;
            }
        }
        if (unsupportedOptions || path.posix.isAbsolute(cwd) || cwd.split('/').includes('..')) {
            this.issue('UNSUPPORTED_CONSIGN_OPTIONS', node, 'Computed loading options, custom extensions, ignore callbacks and paths outside the snapshot require an explicit model.');
            return true;
        }
        let operation = 'include';
        const selected = [];
        for (const stage of stages) {
            if (stage.kind !== 'then') operation = stage.kind;
            if (stage.path === null) {
                this.issue('DYNAMIC_CONSIGN_PATH', stage.node, 'Consign registration paths must be literal.');
                continue;
            }
            if (operation === 'exclude' && stage.path.includes(','))
                this.issue('CONSIGN_VERSION_SPECIFIC_EXCLUSION', stage.node, 'Consign 0.1.6 has special comma-list exclusion behavior; use separate explicit exclusions for a verified registration order.');
            for (const part of stage.path.split(/\s?,\s?/)) {
                const prefix = path.posix.normalize(path.posix.join(cwd, part));
                if (path.posix.isAbsolute(prefix) || prefix.split('/').includes('..')) {
                    this.issue('OUTSIDE_CONSIGN_PATH', stage.node, 'Consign path leaves the analyzed snapshot.');
                    continue;
                }
                // Consign 0.1.x traverses directory entries and invokes exported
                // functions in include/then order. The immutable source manifest
                // gives a deterministic lexical enumeration for this static run.
                const matches = [...this.p.modules.keys()].filter(file => file.endsWith('.js') && (file === prefix || file.startsWith(prefix.replace(/\/$/, '') + '/'))).sort();
                if (matches.length > 1 && !this.p.modules.has(prefix) && matches.some(file => [...this.rawEvents.values()].some(event => event.kind === 'use' && event.location.file === file)))
                    this.issue('CONSIGN_DIRECTORY_MIDDLEWARE_ORDER', stage.node, 'This Consign directory installs middleware across files; fs.readdirSync enumeration is not a portable runtime ordering guarantee. Use explicit ordered include paths to resolve the order.');
                if (!matches.length) this.issue('UNRESOLVED_CONSIGN_PATH', stage.node, 'No parsed JavaScript module matched this Consign path.');
                if (operation === 'exclude') {
                    for (const file of matches) {
                        const at = selected.indexOf(file);
                        if (at >= 0) selected.splice(at, 1);
                        else this.issue('CONSIGN_UNSELECTED_EXCLUSION', stage.node, 'Excluding an existing but unselected file has version-specific effects on Consign registration order.');
                    }
                }
                else for (const file of matches) if (!selected.includes(file)) selected.push(file);
            }
        }
        this.consignLoads.push({ location: this.p.location(node), version: dependency.version, versionSource: dependency.source, modules: selected, directoryEnumeration: 'lexical-source-snapshot', runtimeOrderVerified: false });
        for (const file of selected) {
            const module = this.p.modules.get(file);
            if (this.loaded.has(file) && [...this.rawEvents.values()].some(event => event.owner && event.location.file === file))
                this.issue('CONSIGN_RELOADS_REGISTRATIONS', node, 'Consign clears the included module cache; this previously imported registrar may be initialized again.');
            this.load(module, new Map(), conditional, depth + 1);
            const exported = this.p.exportValue(module, 'default', new Set());
            if (exported?.kind === 'function') this.invoke(exported.fn, [owner], env, conditional, depth + 1, node);
        }
        return true;
    }
    visit(node, env, conditional, depth) {
        if (!node) return;
        if (++this.steps > MAX_STEPS || depth > MAX_DEPTH) {
            this.issue('ASSEMBLY_BOUND', node, 'Application registration traversal reached a documented resource bound.');
            return;
        }
        if (functionLike(node)) return; // Function declarations are inert until called.
        if (ts.isSourceFile(node) || ts.isBlock(node)) {
            for (const statement of node.statements) {
                this.visit(statement, env, conditional, depth);
                if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) break;
            }
            return;
        }
        if (ts.isIfStatement(node)) {
            this.visit(node.expression, env, conditional, depth);
            const expression = unwrap(node.expression);
            if (expression.kind === ts.SyntaxKind.TrueKeyword) this.visit(node.thenStatement, env, conditional, depth);
            else if (expression.kind === ts.SyntaxKind.FalseKeyword) this.visit(node.elseStatement, env, conditional, depth);
            else {
                this.visit(node.thenStatement, env, true, depth);
                this.visit(node.elseStatement, env, true, depth);
            }
            return;
        }
        if (ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node) || ts.isSwitchStatement(node) || ts.isConditionalExpression(node) || ts.isTryStatement(node)) {
            ts.forEachChild(node, child => this.visit(child, env, true, depth));
            return;
        }
        if (ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) {
            this.visit(node.left, env, conditional, depth);
            this.visit(node.right, env, true, depth);
            return;
        }
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken)
            this.assignRouting(node, env, conditional);
        if (ts.isCallExpression(node)) {
            if (this.consign(node, env, conditional, depth)) return;
            // Evaluating the callee/arguments may initialize local modules, but
            // function arguments are declarations and are deliberately not run.
            this.visit(node.expression, env, conditional, depth);
            for (const argument of node.arguments) this.visit(argument, env, conditional, depth);
            if (this.localRequire(node, env, conditional, depth)) return;
            if (node.expression.kind === ts.SyntaxKind.ImportKeyword)
                this.issue('DEFERRED_MODULE_LOAD', node, 'Dynamic import timing and module initialization are not part of the synchronous registration model.');
            const instance = this.p.resolve(node);
            if (instance?.kind === 'express') {
                this.createRoutingOptions(instance);
                if (instance.expressKind === 'app') this.applicationRoots.add(instance.id);
            }
            const raw = this.rawEvents.get(key(node));
            if (raw) {
                const owner = this.owner(raw.target, env);
                if (owner) {
                    const options = this.routingOptions.get(owner);
                    if (options) options.initialized = true;
                    this.events.push({ ...raw, owner, order: ++this.order, conditional, rawNode: raw.node, routingOptions: options ? { caseSensitive: options.caseSensitive, strict: options.strict } : { caseSensitive: null, strict: null } });
                }
                else this.issue('UNRESOLVED_REGISTRATION_OWNER', node, 'A registration receiver could not be bound to the selected application or router.');
                return;
            }
            const resolved = this.p.resolve(node.expression);
            const receiver = node.expression.expression;
            const receiverOwner = receiver && this.owner(receiver, env);
            if (receiverOwner) {
                this.configureRouting(node, receiverOwner, conditional);
                if (['route', 'param'].includes(prop(node.expression))) {
                    const options = this.routingOptions.get(receiverOwner);
                    if (options) options.initialized = true;
                }
            }
            if (receiver && this.owner(receiver, env) && !['set', 'enable', 'disable', 'enabled', 'disabled', 'get', 'listen', 'route'].includes(prop(node.expression)))
                this.issue('UNMODELED_APPLICATION_METHOD', node, 'This application/router method can affect registration or parameter middleware and needs a behavior model.');
            for (const argument of node.arguments) {
                const callback = this.p.resolve(argument);
                if (callback?.kind === 'function' && this.hasRegistrations(callback.fn.node))
                    this.issue('DEFERRED_REGISTRAR_CALLBACK', node, 'A registration callback is passed to another function; its execution timing is unresolved.');
            }
            if (resolved?.kind === 'function' && resolved.fn && (node.arguments.some(arg => this.owner(arg, env)) || this.hasRegistrations(resolved.fn.node)))
                this.invoke(resolved.fn, [...node.arguments], env, conditional, depth, node);
            else if (node.arguments.some(arg => this.owner(arg, env)) && !(resolved?.kind === 'external' && ['http', 'https', 'express'].includes(resolved.spec)))
                this.issue('UNRESOLVED_APPLICATION_CALL', node, 'An unresolved function receives the application/router and may alter registration.');
            if (ts.isIdentifier(node.expression) && node.expression.text === 'eval')
                this.issue('DYNAMIC_EVALUATION', node, 'Dynamic code evaluation prevents complete application assembly.');
            return;
        }
        ts.forEachChild(node, child => this.visit(child, env, conditional, depth));
    }
    hasRegistrations(node) {
        let found = false;
        const visit = child => {
            if (this.rawEvents.get(key(child))?.owner) found = true;
            if (!found) ts.forEachChild(child, visit);
        };
        visit(node);
        return found;
    }
}
module.exports = { Assembly };
