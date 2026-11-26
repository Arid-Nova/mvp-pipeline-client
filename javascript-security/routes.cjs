'use strict';
const { ts, unwrap, prop, literal, functionLike } = require('./ast.cjs');
const { Assembly } = require('./assembly.cjs');
const METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'all']);
const safeName = n => {
    n = unwrap(n);
    if (!n)
        return '<unknown>';
    if (ts.isIdentifier(n))
        return n.text;
    if (ts.isPropertyAccessExpression(n))
        return safeName(n.expression) + '.' + n.name.text;
    if (ts.isCallExpression(n))
        return safeName(n.expression) + '(...)';
    return '<expression>';
};
class Routes {
    constructor(project, profile = {}) {
        this.p = project;
        this.events = new Map();
        this.rawEvents = [];
        this.routes = [];
        this.invocations = [];
        this.dynamicLoading = false;
        this.collect();
        this.sourceRoutes = this.routes;
        this.assembly = new Assembly(project, this.rawEvents, profile);
        this.applicationCoverage = this.assembly.coverage;
        if (this.assembly.entry.file) {
            this.events = new Map();
            this.routes = this.assembly.events.filter(e => e.kind === 'route');
            this.invocations = [];
            this.dynamicLoading = this.applicationCoverage.status !== 'complete';
            for (const event of this.assembly.events) this.add(event.owner, event);
        }
    }
    owner(n) {
        const v = this.p.resolve(n);
        if (v?.kind === 'express')
            return v.id;
        if (v?.kind === 'parameter')
            return `${v.node.getSourceFile().fileName}:parameter:${v.node.pos}`;
        return null;
    }
    conditional(n, owner) {
        for (let p = n.parent; p && !ts.isSourceFile(p); p = p.parent) {
            if (ts.isIfStatement(p) || ts.isConditionalExpression(p) || ts.isForStatement(p) || ts.isForOfStatement(p) || ts.isForInStatement(p) || ts.isWhileStatement(p) || ts.isDoStatement(p) || ts.isCaseClause(p) || ts.isCatchClause(p))
                return true;
            if (functionLike(p)) {
                if (!(p.parameters || []).some(x => `${x.getSourceFile().fileName}:parameter:${x.pos}` === owner))
                    return true;
            }
        }
        return false;
    }
    add(owner, event) {
        this.rawEvents.push(event);
        if (!owner)
            return;
        const xs = this.events.get(owner) || [];
        xs.push(event);
        this.events.set(owner, xs);
    }
    collect() {
        const calls = [];
        for (const m of this.p.modules.values()) {
            const visit = n => {
                if (ts.isCallExpression(n)) {
                    calls.push(n);
                    const method = prop(n.expression), receiver = n.expression.expression;
                    if (method === 'into' || (ts.isIdentifier(n.expression) && n.expression.text === 'eval'))
                        this.dynamicLoading = true;
                    if (receiver && (METHODS.has(method) || method === 'use')) {
                        let target = receiver, pathArg = n.arguments[0], handlers = [...n.arguments].slice(1), routePath = literal(pathArg);
                        let routeBuilder = receiver;
                        while (ts.isCallExpression(routeBuilder) && METHODS.has(prop(routeBuilder.expression)))
                            routeBuilder = routeBuilder.expression.expression;
                        if (ts.isCallExpression(routeBuilder) && prop(routeBuilder.expression) === 'route') {
                            target = routeBuilder.expression.expression;
                            routePath = literal(routeBuilder.arguments[0]);
                            handlers = [...n.arguments];
                        }
                        else if (method === 'get' && n.arguments.length < 2) {
                            // Express app.get(setting) is a configuration read.
                            ts.forEachChild(n, visit);
                            return;
                        }
                        const owner = this.owner(target), location = this.p.location(n);
                        if (method === 'use') {
                            if (routePath === null) {
                                const arg = unwrap(n.arguments[0]), first = this.p.resolve(arg), factory = arg && ts.isCallExpression(arg) ? this.p.resolve(arg.expression) : null;
                                handlers = [...n.arguments];
                                routePath = arg && (first || functionLike(arg) || ts.isArrayLiteralExpression(arg) || factory?.kind === 'external' && ['cors', 'body-parser', 'express', 'compression', 'helmet', 'morgan', 'cookie-parser'].includes(factory.spec)) ? '/' : null;
                            }
                            const entries = handlers.flatMap(x => this.p.flatten(x));
                            const event = { kind: 'use', owner, target, node: n, location, path: routePath, handlers: entries, order: n.pos, conditional: this.conditional(n, owner) };
                            this.add(owner, event);
                        }
                        else {
                            const event = { kind: 'route', owner, target, node: n, location, path: routePath, method: method.toUpperCase(), handlers: handlers.flatMap(x => this.p.flatten(x)), order: n.pos, conditional: this.conditional(n, owner) };
                            this.routes.push(event);
                            this.add(owner, event);
                        }
                    }
                }
                ts.forEachChild(n, visit);
            };
            visit(m.sf);
        }
        for (const call of calls) {
            const resolved = this.p.resolve(call.expression);
            if (resolved?.kind !== 'function' || !resolved.fn)
                continue;
            for (let i = 0; i < resolved.fn.node.parameters.length; i++) {
                const parameter = resolved.fn.node.parameters[i], target = `${parameter.getSourceFile().fileName}:parameter:${parameter.pos}`, owner = this.owner(call.arguments[i]);
                if (owner && this.events.has(target))
                    this.invocations.push({ kind: 'use', owner, target, node: call, location: this.p.location(call), path: '/', handlers: [], order: call.pos });
            }
        }
        for (const xs of this.events.values())
            xs.sort((a, b) => a.location.file.localeCompare(b.location.file) || a.order - b.order);
    }
    handler(n, source, extra = {}) {
        let v = this.p.resolve(n);
        if (!v && ts.isCallExpression(n)) {
            const callee = this.p.resolve(n.expression);
            if (callee?.kind === 'external')
                v = { ...callee, kind: 'factory' };
        }
        return { node: n, value: v, name: safeName(n), source, location: this.p.location(n), resolution: v?.kind === 'function' && v.fn ? 'resolved' : v?.kind === 'middleware-summary' ? 'modeled-external' : v?.kind === 'external' || v?.kind === 'factory' ? 'external' : 'unknown', ...extra };
    }
    prefix(prefix, path, options = { caseSensitive: false }, pathOptions = { strict: false }) {
        if (prefix === '/' || prefix === '')
            return true;
        if (path === null || prefix === null || /[:*?()\[\]{}+\\]/.test(prefix))
            return null;
        const variants = [path];
        if (pathOptions.strict !== true) variants.push(path.endsWith('/') ? path.slice(0, -1) : path + '/');
        const sensitivities = options.caseSensitive === null ? [true, false] : [Boolean(options.caseSensitive)];
        const results = [];
        for (const sensitive of sensitivities) {
            const escaped = prefix.replace(/[.+^$|]/g, '\\$&');
            // Express Router.use always constructs a strict:false, end:false
            // layer, independent of strict routing for endpoint routes.
            const expression = escaped.endsWith('/') ? escaped + '?' : escaped + '/?';
            const pattern = new RegExp('^' + expression + '(?=/|$)', sensitive ? '' : 'i');
            for (const value of variants) {
                if (pattern.test(value)) results.push(true);
                else if (/[:*?()\[\]{}+]/.test(value)) {
                    const a = prefix.split('/'), b = value.split('/');
                    let possible = true;
                    for (let i = 0; i < Math.min(a.length, b.length); i++) {
                        if (/[:*?()\[\]{}+]/.test(b[i])) break;
                        if ((sensitive ? a[i] !== b[i] : a[i].toLowerCase() !== b[i].toLowerCase()) && a[i] !== '') { possible = false; break; }
                    }
                    results.push(possible ? null : false);
                }
                else results.push(false);
            }
        }
        return results.every(value => value === true) ? true : results.every(value => value === false) ? false : null;
    }
    forEndpoint(endpoint) {
        const candidates = this.routes.filter(r => r.location.file === endpoint.file && r.location.line === endpoint.line && (r.method === endpoint.method || r.method === 'ALL'));
        if (candidates.length === 0 && this.assembly.entry.file) {
            const source = this.sourceRoutes.find(r => r.location.file === endpoint.file && r.location.line === endpoint.line && (r.method === endpoint.method || r.method === 'ALL'));
            if (source) return { handlers: [], alternatives: 0, status: this.applicationCoverage.status === 'complete' ? 'resolved' : 'partial', reachability: this.applicationCoverage.status === 'complete' ? 'inactive' : 'unknown', reason: 'The snapshot registration is not reached from the selected application entrypoint.', reasons: ['The snapshot registration is not reached from the selected application entrypoint.'], effectivePaths: [], registration: source };
        }
        if (candidates.length !== 1)
            return { handlers: [], status: 'unknown', reachability: 'unknown', reason: 'Snapshot registration could not be uniquely matched to an AST call.', reasons: ['Snapshot registration could not be uniquely matched to an AST call.'], registration: null };
        const route = candidates[0];
        let unknown = !route.owner || route.conditional, chains = [];
        const reasons = [];
        if (route.path === null) { unknown = true; reasons.push('A computed route path could not be resolved.'); }
        if (route.conditional) reasons.push('Route registration is conditional on unresolved startup control flow.');
        const collect = (target, routePath, seen) => {
            if (seen.has(target.owner) || seen.size >= 8) {
                unknown = true;
                return [[]];
            }
            seen = new Set(seen);
            seen.add(target.owner);
            const before = (this.events.get(target.owner) || []).filter(e => e.order < target.order && (this.assembly.entry.file || e.location.file === target.location.file));
            if (!this.assembly.entry.file && (this.events.get(target.owner) || []).some(e => e.location.file !== target.location.file))
                unknown = true;
            const local = [];
            for (const e of before) {
                if (e.kind !== 'use')
                    continue;
                const options = e.routingOptions || { caseSensitive: false, strict: false };
                let matches = this.prefix(e.path, routePath, options, route.routingOptions || { strict: false });
                if (matches === true && options.caseSensitive === true && route.routingOptions?.caseSensitive !== true && target.owner !== route.owner && /[a-z]/i.test(e.path || ''))
                    matches = null;
                if (matches === false)
                    continue;
                if (matches === null)
                    unknown = true;
                for (const h of e.handlers) {
                    if (this.owner(h))
                        continue;
                    local.push(this.handler(h, 'use', { conditional: matches === null || e.conditional }));
                    if (e.conditional)
                        unknown = true;
                }
            }
            const parents = [];
            for (const xs of this.events.values())
                for (const e of xs)
                    if (e.kind === 'use')
                        for (const h of e.handlers)
                            if (this.owner(h) === target.owner)
                                parents.push(e);
            parents.push(...this.invocations.filter(e => e.target === target.owner));
            if (parents.length === 0) {
                if (String(target.owner).includes(':parameter:'))
                    unknown = true;
                return [local];
            }
            if (parents.length > 1)
                unknown = true;
            return parents.slice(0, 8).flatMap(parent => {
                if (parent.conditional) unknown = true;
                const at = parent.handlers.findIndex(h => this.owner(h) === target.owner), within = (at < 0 ? [] : parent.handlers.slice(0, at)).filter(h => !this.owner(h)).map(h => this.handler(h, 'mount', { conditional: parent.path === null || parent.conditional }));
                return collect(parent, parent.path === null ? null : this.joinPath(parent.path, routePath), seen).map(x => [...x, ...within, ...local]);
            });
        };
        chains = collect(route, route.path, new Set()).map(x => [...x, ...route.handlers.map(n => this.handler(n, 'route'))]);
        if (this.assembly.entry.file && !this.mountedAtApplication(route.owner, new Set()))
            return { handlers: [], alternatives: 0, status: this.applicationCoverage.status === 'complete' ? 'resolved' : 'partial', reachability: this.applicationCoverage.status === 'complete' ? 'inactive' : 'unknown', reason: 'The router is initialized but is not mounted in the selected application.', reasons: ['The router is initialized but is not mounted in the selected application.'], effectivePaths: [], registration: route };
        if (this.dynamicLoading)
            unknown = true;
        if (this.dynamicLoading) reasons.push(...this.applicationCoverage.reasons.map(x => typeof x === 'string' ? x : x.detail));
        if (unknown && !reasons.length) reasons.push('Global registration order or mounting is not fully resolved.');
        const effectivePaths = this.effectivePaths(route.owner, route.path, new Set());
        const precedingRoutes = this.precedingRoutes(route);
        if (precedingRoutes.length) {
            unknown = true;
            reasons.push('Earlier matching route handlers may terminate or alter the request before this registration; inter-route continuation requires review.');
        }
        return { handlers: chains[0] || [], alternatives: chains.length, status: unknown ? 'partial' : 'resolved', reachability: this.assembly.entry.file ? route.conditional ? 'unknown' : 'active' : 'unknown', reasons, effectivePaths, precedingRoutes, reason: reasons[0] || null, registration: route };
    }
    joinPath(prefix, suffix) {
        if (prefix === null || suffix === null) return null;
        return '/' + [prefix, suffix].map(x => x.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');
    }
    effectivePaths(owner, routePath, seen) {
        if (seen.has(owner) || seen.size >= 8) return [];
        const visited = new Set(seen).add(owner), parents = [];
        for (const xs of this.events.values()) for (const event of xs)
            if (event.kind === 'use' && event.handlers.some(h => this.owner(h) === owner)) parents.push(event);
        if (!parents.length) return [routePath];
        return [...new Set(parents.flatMap(parent => this.effectivePaths(parent.owner, this.joinPath(parent.path, routePath), visited)))];
    }
    mountedAtApplication(owner, seen) {
        if (this.assembly.applicationRoots.has(owner)) return true;
        if (seen.has(owner) || seen.size >= 8) return false;
        const visited = new Set(seen).add(owner);
        for (const xs of this.events.values()) for (const event of xs)
            if (event.kind === 'use' && event.handlers.some(h => this.owner(h) === owner) && this.mountedAtApplication(event.owner, visited)) return true;
        return false;
    }
    routeContexts(route, seen = new Set()) {
        if (seen.has(route.owner) || seen.size >= 8) return [];
        const parents = [];
        for (const xs of this.events.values()) for (const event of xs)
            if (event.kind === 'use' && event.handlers.some(h => this.owner(h) === route.owner)) parents.push(event);
        if (!parents.length) return [{ owner: route.owner, path: route.path, order: route.order, priority: [route.order] }];
        const visited = new Set(seen).add(route.owner);
        return parents.flatMap(parent => this.routeContexts({ ...parent, path: this.joinPath(parent.path, route.path) }, visited).map(context => ({ ...context, priority: [...context.priority, route.order] })));
    }
    pathsOverlap(left, right) {
        if (left === null || right === null) return true;
        const a = left.toLowerCase().replace(/\/$/, '').split('/'), b = right.toLowerCase().replace(/\/$/, '').split('/');
        const minimum = parts => parts.filter(part => !part.includes('?')).length;
        const maximum = parts => parts.some(part => part.includes('*')) ? Infinity : parts.length;
        if (minimum(a) > maximum(b) || minimum(b) > maximum(a)) return false;
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
            if (/[*?()[\]{}+]/.test(a[i] + b[i])) return true;
            if (!a[i].startsWith(':') && !b[i].startsWith(':') && a[i] !== b[i]) return false;
        }
        return a.length === b.length || [...a.slice(b.length), ...b.slice(a.length)].some(part => /[*?]/.test(part));
    }
    precedingRoutes(route) {
        // This diagnostic concerns request dispatch across registrations, not
        // source registration matching. Do not claim later guards cover a path
        // that an earlier matching handler can consume or rewrite.
        const contexts = this.routeContexts(route), output = [];
        for (const earlier of this.routes) {
            if (earlier === route) continue;
            const methodOverlap = earlier.method === 'ALL' || route.method === 'ALL' || earlier.method === route.method || earlier.method === 'GET' && route.method === 'HEAD';
            if (!methodOverlap) continue;
            const priorContexts = this.routeContexts(earlier);
            if (contexts.some(current => priorContexts.some(prior => prior.owner === current.owner && this.isEarlier(prior.priority, current.priority) && this.pathsOverlap(prior.path, current.path))))
                output.push({ method: earlier.method, path: earlier.path, location: earlier.location });
        }
        return output;
    }
    isEarlier(prior, current) {
        for (let i = 0; i < Math.min(prior.length, current.length); i++) {
            if (prior[i] !== current[i]) return prior[i] < current[i];
        }
        return false;
    }
}
module.exports = { Routes, safeName };
