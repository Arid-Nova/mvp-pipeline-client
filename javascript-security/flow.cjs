'use strict';
const { ts, unwrap, prop, literal, functionLike, hash } = require('./ast.cjs');
const { safeName } = require('./routes.cjs');
const { sources, queryShape, typedPredicate, hasUnknown, ownershipPaths, predicateBound } = require('./flow-policy.cjs');
const BOUNDS = Object.freeze({ paths: 48, steps: 12000, depth: 5, guards: 100 });
const U = { kind: 'unknown' };
const value = (kind, data = {}) => ({ kind, ...data });
const clone = s => ({ ...s, env: new Map(s.env), conditions: [...s.conditions], denials: [...s.denials], verifiedEvidence: [...s.verifiedEvidence], unknown: new Set(s.unknown) });
const constant = x => value('constant', { value: x });
const field = (v, key) => {
    if (v?.kind === 'object')
        return v.fields[key] || U;
    if (v?.kind === 'array')
        return key === 'length' ? constant(v.items.length) : /^\d+$/.test(key || '') ? v.items[Number(key)] || U : U;
    if (v?.kind === 'dataRecord')
        return value('dataRecord', { path: `${v.path}.${key}`, source: v.source });
    if (v?.kind === 'request') {
        if (key === 'user')
            return value('principal', { path: 'principal', verified: false });
        if (['body', 'params', 'query', 'headers', 'cookies'].includes(key))
            return value('input', { path: `request.${key}` });
        if (key === 'route')
            return value('route');
        if (key === 'baseUrl')
            return value('routeBase');
    }
    if (v?.kind === 'principal')
        return v.overrides && Object.prototype.hasOwnProperty.call(v.overrides, key) ? v.overrides[key] : value(['role', 'role_id', 'roleId', 'roles'].includes(key) ? 'role' : ['id', 'userId', 'user_id', 'sub'].includes(key) ? 'principalId' : 'principalField', { path: `principal.${key}`, verified: v.verified, decoded: v.decoded });
    if (v?.kind === 'input')
        return value(v.path === 'request.headers' && /^(authorization|x-access-token|token)$/i.test(key) ? 'credential' : 'input', { path: `${v.path}.${key}` });
    if (v?.kind === 'opaqueInput')
        return value('opaqueInput', { path: v.path });
    if (v?.kind === 'credential')
        return v;
    if (v?.kind === 'route' && key === 'path')
        return value('routePattern');
    return U;
};
const evidence = (location, observation) => ({ ...location, observation });
function describe(v, allowPolicyLiteral = false) {
    if (!v)
        return 'unknown';
    if (v.kind === 'constant')
        return allowPolicyLiteral && (typeof v.value === 'number' || typeof v.value === 'boolean' || v.value === null || typeof v.value === 'string' && v.value.length <= 40) ? v.value : '<literal>';
    return v.path || v.kind;
}
function truth(v) { return v?.kind === 'constant' ? !!v.value : null; }
function hasCallEffects(n) {
    let found = false;
    const visit = x => {
        if (ts.isCallExpression(x) && !['includes', 'indexOf', 'toString', 'parseInt', 'parseFloat', 'Number', 'String'].includes(prop(x.expression) || safeName(x.expression)))
            found = true;
        if (!found)
            ts.forEachChild(x, visit);
    };
    visit(n);
    return found;
}
class Flow {
    constructor(project, endpoint) { this.p = project; this.endpoint = endpoint; this.steps = 0; this.bounded = false; this.guards = new Map(); this.accepted = []; this.denied = []; this.issues = []; this.visited = new Set(); this.unknownCalls = new Set(); this.unsupportedAuth = false; this.unsupportedControl = false; this.authBounded = false; this.boundReasons = new Set(); this.operations = []; this.flowReasons = new Set(); this.summaries = new Map(); this.summaryHits = 0; this.mergedPaths = 0; this.functionFacts = new Map(); this.currentPhase = 'admission'; this.admissionReasons = new Set(); this.literalCache = new WeakMap(); }
    initial() { return { env: new Map(), reqUser: value('principal', { verified: false, path: 'principal' }), verified: false, verifiedEvidence: [], decodedUsed: false, verifyFailed: false, conditions: [], denials: [], responseStatus: 200, flow: 'active', unknown: new Set(), returned: U, passed: false }; }
    bound(states) {
        // Equal abstract states have identical future security behavior. Collapsing
        // them avoids exponential growth from business-only branch conditions.
        const unique = new Map();
        for (const row of states) {
            const state = row.s || row;
            const key = this.stateKey(state, !row.s) + (row.s ? ':' + (row.v ? 'value' : row.args ? 'args:' + row.args.length : row.items ? 'items:' + row.items.length : 'fields:' + Object.keys(row.fields || {}).sort().join(',')) : '');
            if (!unique.has(key)) unique.set(key, row);
            else {
                this.mergedPaths++;
                if (!row.s) {
                    const previous = unique.get(key), merged = clone(previous);
                    for (const name of new Set([...previous.env.keys(), ...state.env.keys()])) merged.env.set(name, this.joinValue(previous.env.get(name) || U, state.env.get(name) || U));
                    merged.returned = this.joinValue(previous.returned, state.returned);
                    unique.set(key, merged);
                }
                else {
                    const previous = unique.get(key), merged = { ...previous };
                    if (row.v) merged.v = this.joinValue(previous.v, row.v);
                    if (row.args) merged.args = previous.args.map((x, i) => this.joinValue(x, row.args[i]));
                    if (row.items) merged.items = previous.items.map((x, i) => this.joinValue(x, row.items[i]));
                    if (row.fields) merged.fields = this.joinValue(value('object', { fields: previous.fields }), value('object', { fields: row.fields })).fields;
                    unique.set(key, merged);
                }
            }
        }
        states = [...unique.values()];
        if (states.length > BOUNDS.paths) {
            this.markBound('path-state-limit');
            states = states.slice(0, BOUNDS.paths);
        }
        return states;
    }
    joinValue(a = U, b = U, depth = 0) {
        if (this.valueKey(a) === this.valueKey(b)) return a;
        if (depth > 5) return U;
        if (a.kind === 'object' && b.kind === 'object') return value('object', { fields: Object.fromEntries([...new Set([...Object.keys(a.fields), ...Object.keys(b.fields)])].map(k => [k, this.joinValue(a.fields[k], b.fields[k], depth + 1)])) });
        if (a.kind === 'array' && b.kind === 'array' && a.items.length === b.items.length) return value('array', { items: a.items.map((x, i) => this.joinValue(x, b.items[i], depth + 1)) });
        if (a.kind === 'sql' && b.kind === 'sql') return value('sql', { operation: a.operation === b.operation ? a.operation : 'unknown', tables: [...new Set([...a.tables, ...b.tables])], sources: [...a.sources, ...b.sources], selectorMapping: a.selectorMapping === 'complete' && b.selectorMapping === 'complete' && JSON.stringify(a.selectorIndices) === JSON.stringify(b.selectorIndices) ? 'complete' : 'unknown', selectorIndices: a.selectorIndices });
        if (a.kind === 'promise' && b.kind === 'promise') return value('promise', { outcomes: [...new Map([...a.outcomes, ...b.outcomes].map(x => [x.rejected + ':' + this.valueKey(x.value), x])).values()] });
        const origin = sources(value('array', { items: [a, b] }));
        return origin.length ? value('derived', { sources: origin }) : U;
    }
    valueKey(v, depth = 0) {
        if (depth > 6) return 'depth';
        if (!v) return 'null';
        if (Array.isArray(v)) return '[' + v.map(x => this.valueKey(x, depth + 1)).join(',') + ']';
        if (v.kind === 'function') return 'fn:' + v.fn?.id;
        if (v.kind === 'constant') return 'constant:' + JSON.stringify(v.value);
        if (v.kind === 'object') return 'object:' + Object.keys(v.fields).sort().map(k => k + '=' + this.valueKey(v.fields[k], depth + 1)).join('|');
        if (v.kind === 'array') return this.valueKey(v.items, depth + 1);
        if (v.kind === 'principal') return 'principal:' + v.verified + ':' + v.decoded + ':' + this.valueKey(value('object', { fields: v.overrides || {} }), depth + 1);
        if (v.kind === 'promise') return 'promise:' + v.outcomes.map(x => x.rejected + ':' + this.valueKey(x.value, depth + 1) + ':' + x.state?.verified + ':' + this.valueKey(x.state?.reqUser, depth + 1)).join(';');
        if (v.kind === 'predicate') return JSON.stringify(this.predicate(v));
        if (v.kind === 'sql') return 'sql:' + v.operation + ':' + (v.tables || []).join(',') + ':' + this.valueKey(v.sources, depth + 1) + ':' + v.selectorMapping + ':' + JSON.stringify(v.selectorIndices);
        return JSON.stringify({ kind: v.kind, path: v.path, verified: v.verified, source: v.source, decoded: v.decoded });
    }
    stateKey(s, abstractEnvironment = false) {
        return [s.flow, s.verified, s.verifyFailed, s.decodedUsed, s.passed, s.responseStatus, s.policyUnknown,
            this.valueKey(s.reqUser), abstractEnvironment ? '' : this.valueKey(s.returned),
            abstractEnvironment ? '' : [...s.env].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => k + '=' + this.valueKey(v)).join(';'),
            [...new Map(s.conditions.map(c => [c.id, c])).values()].sort((a, b) => a.id.localeCompare(b.id)).map(c => c.id + ':' + c.outcome).join(';'),
            s.denials.map(e => e.file + ':' + e.line).join(';'), [...s.unknown].sort().join(';'), this.valueKey(s.promiseValue), s.promiseRejected].join('~');
    }
    markBound(reason) { this.bounded = true; this.boundReasons.add(reason); this.flowReasons.add(reason); if (this.currentPhase === 'admission') this.admissionReasons.add(reason); }
    unknown(reason, state, authentication = false) { this.flowReasons.add(reason); state?.unknown.add(reason); if (authentication && this.currentPhase === 'admission') { this.admissionReasons.add(reason); this.unsupportedAuth = true; } }
    issue(ruleId, title, s, location, detail) { this.issues.push({ ruleId, title, location, evidence: [...(ruleId.startsWith('DENIAL_') ? s.denials : []), evidence(location, detail)], severity: ruleId === 'JWT_DECODE_IDENTITY' ? 'high' : 'medium', confidence: 'high', classification: 'source-supported' }); }
    result(s, v = U) { return [{ s, v }]; }
    tick(s) {
        if (++this.steps > BOUNDS.steps) {
            this.markBound('execution-step-limit');
            s.unknown.add('execution-step-limit');
            return false;
        }
        return true;
    }
    eval(expression, s, ctx, depth = 0) {
        if (expression && ts.isAwaitExpression(expression)) {
            return this.eval(expression.expression, s, { ...ctx, awaited: true }, depth + 1).flatMap(r => {
                if (r.v.kind !== 'promise') return [r];
                return r.v.outcomes.map(outcome => { const state = clone(outcome.state || r.s); state.env = new Map(r.s.env); if (outcome.rejected) state.flow = 'throw'; return { s: state, v: outcome.value }; });
            });
        }
        const n = unwrap(expression);
        if (depth > 30) { this.markBound('expression-depth-limit'); s.unknown.add('expression-depth-limit'); }
        if (!n || depth > 30 || !this.tick(s))
            return this.result(s);
        if (ts.isIdentifier(n)) {
            if (n.text === 'undefined')
                return this.result(s, constant(undefined));
            if (s.env.has(n.text))
                return this.result(s, s.env.get(n.text));
            const resolved = this.p.resolve(n);
            if (resolved?.kind === 'function')
                return this.result(s, value('function', { fn: resolved.fn, closure: new Map(s.env) }));
            const binding = this.p.lookup(n.text, n);
            if (binding?.kind === 'expression' && binding.expression !== n && !ctx.evaluating?.has(binding.expression)) {
                if (this.literalCache.has(binding.expression)) { this.summaryHits++; return this.result(s, this.literalCache.get(binding.expression)); }
                const evaluating = new Set(ctx.evaluating || []);
                evaluating.add(binding.expression);
                const rows = this.eval(binding.expression, s, { ...ctx, evaluating }, depth + 1);
                if (rows.length === 1 && rows[0].s.flow === 'active' && this.isLiteralTree(binding.expression)) this.literalCache.set(binding.expression, rows[0].v);
                return rows;
            }
            return this.result(s, U);
        }
        if (ts.isStringLiteralLike(n)) {
            const shape = queryShape(n.text);
            return this.result(s, shape ? value('sql', { ...shape, sources: [] }) : constant(n.text));
        }
        if (ts.isNumericLiteral(n))
            return this.result(s, constant(Number(n.text)));
        if (ts.isRegularExpressionLiteral(n))
            return this.result(s, value('regexp'));
        if (ts.isTypeOfExpression(n))
            return this.eval(n.expression, s, ctx, depth + 1).map(r => ({ s: r.s,
                v: r.v.kind === 'constant' ? constant(typeof r.v.value) : ['object', 'array', 'request', 'principal', 'response', 'date', 'regexp'].includes(r.v.kind) ? constant('object') : r.v.kind === 'function' ? constant('function') : value('derived', { sources: [r.v] }) }));
        if (ts.isPostfixUnaryExpression(n) || ts.isPrefixUnaryExpression(n) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(n.operator)) {
            return this.eval(n.operand, s, ctx, depth + 1).map(r => {
                const next = r.v.kind === 'constant' && typeof r.v.value === 'number' ? constant(r.v.value + (n.operator === ts.SyntaxKind.PlusPlusToken ? 1 : -1)) : value('derived', { sources: [r.v] });
                this.assign(n.operand, next, r.s, ctx);
                return { s: r.s, v: ts.isPostfixUnaryExpression(n) ? r.v : next };
            });
        }
        if (n.kind === ts.SyntaxKind.TrueKeyword)
            return this.result(s, constant(true));
        if (n.kind === ts.SyntaxKind.FalseKeyword)
            return this.result(s, constant(false));
        if (n.kind === ts.SyntaxKind.NullKeyword)
            return this.result(s, constant(null));
        if (ts.isObjectLiteralExpression(n)) {
            let rows = [{ s, fields: {} }];
            for (const p of n.properties) {
                if (ts.isSpreadAssignment(p)) {
                    rows = this.bound(rows.flatMap(r => this.eval(p.expression, r.s, ctx, depth + 1).map(q => ({ s: q.s, fields: { ...r.fields, ...(q.v.fields || {}) } }))));
                    continue;
                }
                if (!ts.isPropertyAssignment(p) && !ts.isShorthandPropertyAssignment(p))
                    continue;
                const key = p.name?.text;
                if (!key)
                    continue;
                rows = this.bound(rows.flatMap(r => this.eval(ts.isPropertyAssignment(p) ? p.initializer : p.name, r.s, ctx, depth + 1).map(q => ({ s: q.s, fields: { ...r.fields, [key]: q.v } }))));
            }
            return rows.map(r => ({ s: r.s, v: value('object', { fields: r.fields }) }));
        }
        if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n))
            return this.eval(n.expression, s, ctx, depth + 1).map(r => {
                const key = prop(n) || (ts.isElementAccessExpression(n) && ts.isNumericLiteral(n.argumentExpression) ? n.argumentExpression.text : null);
                if (r.v.kind === 'request' && key === 'user')
                    return { s: r.s, v: r.s.reqUser };
                if (r.v.kind === 'principal' && r.v.verified !== true) {
                    r.s.policyUnknown = true;
                    this.unknown(r.v.decoded ? 'principal-identity-unverified' : 'principal-origin-unestablished', r.s);
                }
                return { s: r.s, v: field(r.v, key) };
            });
        if (ts.isPrefixUnaryExpression(n))
            return this.eval(n.operand, s, ctx, depth + 1).map(r => ({ s: r.s, v: n.operator === ts.SyntaxKind.ExclamationToken ? truth(r.v) === null ? value('predicate', { operator: 'not', terms: [r.v] }) : constant(!truth(r.v)) : U }));
        if (ts.isBinaryExpression(n)) {
            const op = n.operatorToken.kind;
            if (op === ts.SyntaxKind.EqualsToken)
                return this.eval(n.right, s, ctx, depth + 1).map(r => { this.assign(n.left, r.v, r.s, ctx); return r; });
            if ([ts.SyntaxKind.AmpersandAmpersandEqualsToken, ts.SyntaxKind.BarBarEqualsToken, ts.SyntaxKind.QuestionQuestionEqualsToken].includes(op)) {
                this.unsupportedAuth = true;
                s.unknown.add('logical-assignment-control-flow');
                return [{ s: clone(s), v: U }, ...this.eval(n.right, s, ctx, depth + 1).map(r => { this.assign(n.left, r.v, r.s, ctx); return r; })];
            }
            if (op >= ts.SyntaxKind.FirstCompoundAssignment && op <= ts.SyntaxKind.LastCompoundAssignment) {
                return this.eval(n.left, s, ctx, depth + 1).flatMap(a => this.eval(n.right, a.s, ctx, depth + 1).map(b => {
                    let updated = value('derived', { sources: [a.v, b.v] });
                    if (a.v.kind === 'constant' && b.v.kind === 'constant' && typeof a.v.value === 'number' && typeof b.v.value === 'number') {
                        const x = a.v.value, y = b.v.value;
                        if (op === ts.SyntaxKind.PlusEqualsToken) updated = constant(x + y);
                        else if (op === ts.SyntaxKind.MinusEqualsToken) updated = constant(x - y);
                        else if (op === ts.SyntaxKind.AsteriskEqualsToken) updated = constant(x * y);
                        else if (op === ts.SyntaxKind.SlashEqualsToken) updated = constant(x / y);
                        else if (op === ts.SyntaxKind.PercentEqualsToken) updated = constant(x % y);
                    }
                    this.assign(n.left, updated, b.s, ctx);
                    return { s: b.s, v: updated };
                }));
            }
            if (op === ts.SyntaxKind.QuestionQuestionToken)
                return this.eval(n.left, s, ctx, depth + 1).flatMap(a => a.v.kind === 'constant' ? a.v.value === null || a.v.value === undefined ? this.eval(n.right, a.s, ctx, depth + 1) : [a] : hasCallEffects(n.right) ? [{ s: clone(a.s), v: a.v }, ...this.eval(n.right, a.s, ctx, depth + 1)] : this.eval(n.right, a.s, ctx, depth + 1).map(b => ({ s: b.s, v: this.joinValue(a.v, b.v) })));
            if (op === ts.SyntaxKind.PlusToken && ts.isBinaryExpression(n.left) && n.left.operatorToken.kind === ts.SyntaxKind.PlusToken) {
                const rights = []; let left = n;
                while (ts.isBinaryExpression(left) && left.operatorToken.kind === ts.SyntaxKind.PlusToken) { rights.unshift(left.right); left = left.left; }
                let rows = this.eval(left, s, ctx, depth + 1);
                for (const right of rights) rows = this.bound(rows.flatMap(a => this.eval(right, a.s, ctx, depth + 1).map(b => ({ s: b.s, v: this.addValue(a.v, b.v) }))));
                return rows;
            }
            if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken) {
                // Logical predicates retain their complete conjunction/disjunction. Calls in
                // an unknown right side are explored conservatively, never credited as guards.
                return this.eval(n.left, s, ctx, depth + 1).flatMap(a => {
                    const t = truth(a.v), and = op === ts.SyntaxKind.AmpersandAmpersandToken;
                    if ((and && t === false) || (!and && t === true))
                        return [a];
                    const skipped = t === null && hasCallEffects(n.right) ? [{ s: clone(a.s), v: constant(!and) }] : [];
                    return [...skipped, ...this.eval(n.right, a.s, ctx, depth + 1).map(b => ({ s: b.s, v: t === null ? value('predicate', { operator: and ? 'all-of' : 'any-of', terms: [a.v, b.v] }) : b.v }))];
                });
            }
            return this.eval(n.left, s, ctx, depth + 1).flatMap(a => this.eval(n.right, a.s, ctx, depth + 1).map(b => {
                if (op === ts.SyntaxKind.PlusToken) {
                    if (a.v.kind === 'sql' || b.v.kind === 'sql') {
                        const sql = a.v.kind === 'sql' ? a.v : b.v;
                        return { s: b.s, v: value('sql', { ...sql, selectorMapping: 'unknown', sources: [a.v, b.v].flatMap(x => x.kind === 'sql' ? x.sources : [x]) }) };
                    }
                    if (a.v.kind === 'constant' && b.v.kind === 'constant')
                        return { s: b.s, v: constant(a.v.value + b.v.value) };
                    if (['routeBase', 'routePattern'].includes(a.v.kind) && ['routeBase', 'routePattern'].includes(b.v.kind))
                        return { s: b.s, v: value('routePattern') };
                }
                const operators = new Map([[ts.SyntaxKind.EqualsEqualsEqualsToken, '==='], [ts.SyntaxKind.EqualsEqualsToken, '=='], [ts.SyntaxKind.ExclamationEqualsEqualsToken, '!=='], [ts.SyntaxKind.ExclamationEqualsToken, '!='], [ts.SyntaxKind.GreaterThanToken, '>'], [ts.SyntaxKind.LessThanToken, '<'], [ts.SyntaxKind.GreaterThanEqualsToken, '>='], [ts.SyntaxKind.LessThanEqualsToken, '<=']]);
                if (operators.has(op)) {
                    if (a.v.kind === 'constant' && b.v.kind === 'constant') {
                        const x = a.v.value, y = b.v.value;
                        let t;
                        switch (op) {
                            case ts.SyntaxKind.EqualsEqualsEqualsToken:
                                t = x === y;
                                break;
                            case ts.SyntaxKind.EqualsEqualsToken:
                                t = x == y;
                                break;
                            case ts.SyntaxKind.ExclamationEqualsEqualsToken:
                                t = x !== y;
                                break;
                            case ts.SyntaxKind.ExclamationEqualsToken:
                                t = x != y;
                                break;
                            case ts.SyntaxKind.GreaterThanToken:
                                t = x > y;
                                break;
                            case ts.SyntaxKind.LessThanToken:
                                t = x < y;
                                break;
                            case ts.SyntaxKind.GreaterThanEqualsToken:
                                t = x >= y;
                                break;
                            default: t = x <= y;
                        }
                        return { s: b.s, v: constant(t) };
                    }
                    return { s: b.s, v: value('predicate', { operator: operators.get(op), left: a.v, right: b.v }) };
                }
                return { s: b.s, v: U };
            }));
        }
        if (ts.isConditionalExpression(n))
            return this.condition(n.condition, s, ctx).flatMap(r => this.eval(r.truth ? n.whenTrue : n.whenFalse, r.s, ctx, depth + 1));
        if (ts.isCallExpression(n))
            return this.call(n, s, ctx, depth + 1);
        if (functionLike(n))
            return this.result(s, value('function', { fn: this.p.functionNodes.get(n), closure: new Map(s.env) }));
        if (ts.isArrayLiteralExpression(n)) {
            let rows = [{ s, items: [] }];
            for (const element of n.elements) rows = this.bound(rows.flatMap(r => this.eval(ts.isSpreadElement(element) ? element.expression : element, r.s, ctx, depth + 1).map(q => {
                if (ts.isSpreadElement(element) && q.v.kind !== 'array') { q.s.policyUnknown = true; this.unknown('spread-cardinality-unresolved', q.s); }
                return { s: q.s, items: [...r.items, ...(ts.isSpreadElement(element) && q.v.kind === 'array' ? q.v.items : [q.v])] };
            })));
            return rows.map(r => ({ s: r.s, v: value('array', { items: r.items }) }));
        }
        if (ts.isTemplateExpression(n)) {
            const shape = queryShape(n.head.text);
            let rows = [{ s, items: [] }];
            for (const span of n.templateSpans) rows = this.bound(rows.flatMap(r => this.eval(span.expression, r.s, ctx, depth + 1).map(q => ({ s: q.s, items: [...r.items, q.v] }))));
            return rows.map(r => ({ s: r.s, v: shape ? value('sql', { ...shape, selectorMapping: 'unknown', sources: r.items }) : value('derived', { sources: r.items }) }));
        }
        if (ts.isNewExpression(n)) return this.newExpression(n, s, ctx, depth);
        s.policyUnknown = true;
        this.unknown('unmodeled-expression:' + ts.SyntaxKind[n.kind], s);
        return this.result(s, U);
    }
    isLiteralTree(n) {
        if (ts.isStringLiteralLike(n) || ts.isNumericLiteral(n) || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(n.kind)) return true;
        if (ts.isArrayLiteralExpression(n)) return n.elements.every(x => this.isLiteralTree(x));
        if (ts.isObjectLiteralExpression(n)) return n.properties.every(x => ts.isPropertyAssignment(x) && this.isLiteralTree(x.initializer));
        return false;
    }
    addValue(a, b) {
        if (a.kind === 'constant' && b.kind === 'constant') return constant(a.value + b.value);
        const sql = a.kind === 'sql' ? a : b.kind === 'sql' ? b : null;
        if (sql) return value('sql', { ...sql, selectorMapping: 'unknown', sources: [a, b].flatMap(x => x.kind === 'sql' ? x.sources : [x]) });
        return value('derived', { sources: [a, b] });
    }
    assign(left, v, s, ctx) {
        left = unwrap(left);
        if (ts.isIdentifier(left)) {
            s.env.set(left.text, v);
            return;
        }
        if (ts.isPropertyAccessExpression(left) || ts.isElementAccessExpression(left)) {
            const base = this.eval(left.expression, clone(s), ctx)[0]?.v, key = prop(left);
            if (base?.kind === 'request' && key === 'user') {
                s.reqUser = v.kind === 'principal' ? v : v.kind === 'object' ? v : value('principal', { verified: false, path: 'principal' });
                s.decodedUsed = !!v.decoded;
            }
            else if (base?.kind === 'principal' && key) {
                const updated = value('principal', { ...base, overrides: { ...(base.overrides || {}), [key]: v } });
                if (s.reqUser === base || s.reqUser.kind === 'principal' && s.reqUser.path === base.path) s.reqUser = updated;
                for (const [name, existing] of s.env) if (existing === base || existing.kind === 'principal' && existing.path === base.path) s.env.set(name, updated);
                s.policyUnknown = true;
                this.unknown('principal-policy-field-mutated', s);
            }
            else if (base?.kind === 'object' && key) {
                // Update local aliases without mutating another explored path.
                const updated = value('object', { fields: { ...base.fields, [key]: v } });
                if (ts.isIdentifier(left.expression)) s.env.set(left.expression.text, updated);
            }
        }
    }
    call(n, s, ctx, depth) {
        const name = prop(n.expression), resolved = this.p.resolve(n.expression);
        if (resolved?.kind === 'external' && resolved.spec === 'jsonwebtoken' && ['verify', 'decode'].includes(resolved.member)) {
            if (n.arguments.some(ts.isSpreadElement)) { this.unknown('spread-verification-arguments', s, true); return this.result(s, U); }
            if (this.p.mutatedExternals.has('jsonwebtoken')) {
                s.unknown.add('mutated-verification-library');
                this.unsupportedAuth = true;
                return this.result(s, U);
            }
            if (resolved.member === 'decode')
                return this.result(s, value('principal', { verified: false, decoded: true, decodedAt: this.p.location(n), path: 'principal' }));
            const callbackNode = n.arguments[n.arguments.length - 1], callbackResolved = callbackNode && this.p.resolve(callbackNode);
            const callback = callbackNode && (functionLike(unwrap(callbackNode)) ? this.p.functionNodes.get(unwrap(callbackNode)) : callbackResolved?.kind === 'function' ? callbackResolved.fn : null);
            if (!callback && (n.arguments.length >= 4 || n.arguments.length === 3 && !ts.isObjectLiteralExpression(unwrap(n.arguments[2])))) {
                this.unknown('unresolved-jwt-verification-options-or-callback', s, true);
                return this.result(s, U);
            }
            return this.eval(n.arguments[0], s, ctx, depth + 1).flatMap(token => {
                if (!['credential', 'input'].includes(token.v.kind)) {
                    token.s.unknown.add('verification-input-provenance-unknown');
                    this.unsupportedAuth = true;
                    return this.result(token.s, U);
                }
                const good = clone(token.s), bad = clone(token.s), ev = evidence(this.p.location(n), 'jsonwebtoken.verify must return successfully on request-derived input on this path.');
                good.verified = true;
                good.verifiedEvidence.push(ev);
                bad.verifyFailed = true;
                bad.flow = 'throw';
                bad.unknown.add('jwt-verification-failure');
                if (callback) {
                    // The library callback is asynchronous. Its continuations are
                    // independent of statements executed immediately after verify().
                    bad.flow = 'active';
                    const goodRun = this.run(callback, [constant(null), value('principal', { verified: true, path: 'principal' })], good, { depth: ctx.depth + 1, stack: ctx.stack, closure: new Map(s.env) });
                    const badRun = this.run(callback, [constant(true), constant(undefined)], bad, { depth: ctx.depth + 1, stack: ctx.stack, closure: new Map(s.env) });
                    ctx.next.push(...goodRun.next, ...badRun.next);
                    this.flowReasons.add('asynchronous-callback-schedule');
                    return this.result(token.s, U);
                }
                return [{ s: good, v: value('principal', { verified: true, path: 'principal' }) }, { s: bad, v: U }];
            });
        }
        let rows = [{ s, args: [] }];
        for (const a of n.arguments) {
            if (functionLike(unwrap(a))) {
                rows = rows.map(r => ({ ...r, args: [...r.args, value('function', { fn: this.p.functionNodes.get(unwrap(a)), closure: new Map(r.s.env) })] }));
                continue;
            }
            rows = this.bound(rows.flatMap(r => r.s.flow !== 'active' ? [r] : this.eval(ts.isSpreadElement(a) ? a.expression : a, r.s, ctx, depth + 1).map(q => {
                if (ts.isSpreadElement(a) && q.v.kind !== 'array') { q.s.policyUnknown = true; this.unknown('spread-cardinality-unresolved', q.s, true); }
                return { s: q.s, args: [...r.args, ...(ts.isSpreadElement(a) && q.v.kind === 'array' ? q.v.items : [q.v])] };
            })));
        }
        return rows.flatMap(r => {
            if (r.s.flow !== 'active')
                return this.result(r.s, U);
            const baseNode = (ts.isPropertyAccessExpression(n.expression) || ts.isElementAccessExpression(n.expression)) ? n.expression.expression : null;
            const base = baseNode ? this.eval(baseNode, clone(r.s), ctx, depth + 1)[0]?.v : null;
            const callee = ts.isIdentifier(n.expression) ? r.s.env.get(n.expression.text) : null;
            if (ts.isIdentifier(n.expression) && n.expression.text === 'require' && !this.p.lookup('require', n) && n.arguments.length === 1 && ts.isStringLiteralLike(n.arguments[0])) {
                const linked = this.p.resolve(n);
                // Static imports are linked by Project rather than executed by
                // the function interpreter. Dynamic/missing source imports do
                // not receive this summary. Module initialization is outside
                // the declared handler execution model.
                if (linked && linked.kind !== 'unresolved') return this.result(r.s, U);
            }
            if (baseNode && ts.isIdentifier(baseNode) && baseNode.text === 'console' && !this.p.lookup('console', n) && ['log', 'info', 'warn', 'error', 'debug'].includes(name))
                return this.result(r.s, constant(undefined));
            if (ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(baseNode) && baseNode.text === 'Promise' && !this.p.lookup('Promise', n)) {
                if (['resolve', 'reject'].includes(name)) return this.result(r.s, value('promise', { outcomes: [{ rejected: name === 'reject', value: r.args[0] || U }] }));
                if (name === 'all') return this.result(r.s, value('promise', { outcomes: [{ rejected: false, value: r.args[0] || U }, { rejected: true, value: U }] }));
            }
            if (callee?.kind === 'promise-resolve' || callee?.kind === 'promise-reject') {
                r.s.promiseValue = r.args[0] || U;
                r.s.promiseRejected = callee.kind === 'promise-reject';
                return this.result(r.s, U);
            }
            if (callee?.kind === 'next') {
                if (r.args.length) {
                    r.s.unknown.add('next-with-argument');
                    this.unsupportedControl = true;
                    return this.result(r.s, U);
                }
                const next = clone(r.s);
                next.passed = true;
                ctx.next.push(next);
                r.s.passed = true;
                if (next.denials.length)
                    this.issue('DENIAL_FALLTHROUGH', 'A denial response is followed by next().', next, this.p.location(n), 'Sending a response did not terminate this observed path before next().');
                if (next.verifyFailed)
                    this.issue('JWT_FAILURE_CONTINUES', 'Token verification failure can continue to another handler.', next, this.p.location(n), 'A caught jsonwebtoken.verify failure reaches next().');
                return this.result(r.s, U);
            }
            if (base?.kind === 'request' && ['header', 'get'].includes(name))
                return this.result(r.s, value('credential', { path: 'request.header' }));
            if (base?.kind === 'response') {
                if (name === 'status') {
                    r.s.responseStatus = r.args[0]?.kind === 'constant' ? r.args[0].value : null;
                    return this.result(r.s, value('response', { status: r.s.responseStatus }));
                }
                if (['send', 'json', 'end', 'sendStatus', 'redirect', 'sendFile', 'download'].includes(name)) {
                    const status = name === 'sendStatus' && r.args[0]?.kind === 'constant' ? r.args[0].value : base.status ?? r.s.responseStatus ?? 200;
                    if (status >= 400) {
                        r.s.denials.push(evidence(this.p.location(n), `An HTTP ${status} response is sent.`));
                        this.denied.push(clone(r.s));
                    }
                    else
                        this.accepted.push({ s: clone(r.s), location: this.p.location(n), kind: 'response' });
                    return this.result(r.s, value('response', { status }));
                }
            }
            if (base?.kind === 'routePattern' && ['includes', 'indexOf'].includes(name) && r.args[0]?.kind === 'constant' && typeof this.endpoint.path === 'string')
                return this.result(r.s, constant(name === 'includes' ? this.endpoint.path.includes(r.args[0].value) : this.endpoint.path.indexOf(r.args[0].value)));
            if (base?.kind === 'date' && ['toISOString', 'toJSON', 'toLocaleString', 'toLocaleDateString', 'getTime', 'getDate', 'getMonth', 'getFullYear', 'setDate', 'setMonth', 'setFullYear'].includes(name))
                return this.result(r.s, value('derived', { sources: base.sources || [] }));
            if (base?.kind === 'regexp' && ['test', 'exec'].includes(name))
                return this.result(r.s, value('derived', { sources: r.args }));
            if (base?.kind === 'role' && ['includes', 'has'].includes(name)) {
                this.unknown('role-membership-container-type', r.s);
                return this.result(r.s, value('predicate', { operator: 'contains', left: base, right: r.args[0] || U }));
            }
            if (base?.kind === 'credential' && ['split', 'trim', 'trimLeft', 'trimRight', 'trimStart', 'trimEnd', 'replace', 'substring', 'slice'].includes(name))
                return this.result(r.s, base);
            if (base && ['input', 'principalId', 'role'].includes(base.kind) && name === 'toString')
                return this.result(r.s, value('transformed', { path: `String(${base.path})`, transformation: 'String', sources: [base] }));
            if (ts.isIdentifier(n.expression) && !this.p.lookup(n.expression.text, n) && ['Number', 'String', 'parseInt', 'parseFloat'].includes(n.expression.text))
                return this.result(r.s, value('transformed', { path: `${n.expression.text}(${r.args[0]?.path || 'unknown'})`, transformation: n.expression.text, sources: [r.args[0] || U] }));
            if (ts.isPropertyAccessExpression(n.expression) && safeName(n.expression) === 'JSON.parse' && !this.p.lookup('JSON', n)) {
                const parsed = r.args[0]?.kind === 'input' ? value('input', { path: r.args[0].path, transformation: 'JSON.parse' }) : U;
                const failed = clone(r.s); failed.flow = 'throw';
                return [{ s: r.s, v: parsed }, { s: failed, v: U }];
            }
            const data = this.dataDescriptor(n, resolved);
            if (data) return this.dataCall(n, r.s, r.args, ctx, data);
            if (base?.kind === 'array' && ['push', 'unshift'].includes(name)) {
                const updated = value('array', { items: name === 'push' ? [...base.items, ...r.args] : [...r.args, ...base.items] });
                if (ts.isIdentifier(baseNode)) r.s.env.set(baseNode.text, updated);
                return this.result(r.s, constant(updated.items.length));
            }
            if (['then', 'catch', 'finally'].includes(name) && base?.kind === 'promise')
                return this.promiseChain(n, r.s, base, r.args, ctx, name);
            if (['map', 'forEach', 'filter', 'some', 'every'].includes(name) && r.args[0]?.kind === 'function')
                return this.arrayCallback(n, r.s, base, r.args[0], ctx, name);
            const fn = resolved?.kind === 'function' ? resolved.fn : callee?.kind === 'function' ? callee.fn : null;
            if (fn && ctx.depth < BOUNDS.depth && !ctx.stack.has(fn.id)) {
                // Only propagate locally resolvable helpers carrying request/principal or
                // response context. Model/database calls remain explicitly bounded sinks.
                {
                    let enclosing = fn.node.parent;
                    while (enclosing && !functionLike(enclosing)) enclosing = enclosing.parent;
                    const closure = callee?.closure || (enclosing === ctx.fn.node ? new Map(r.s.env) : undefined);
                    const sub = this.run(fn, r.args, r.s, { depth: ctx.depth + 1, stack: ctx.stack, closure });
                    ctx.next.push(...sub.next);
                    if (fn.node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) && !ctx.awaited) {
                        if (this.facts(fn).authentication || this.facts(fn).next) this.unknown('unawaited-async-helper-admission', r.s, true);
                        return this.result(r.s, value('promise', { outcomes: sub.states.map(x => ({ rejected: x.s.flow === 'throw', value: x.v })) }));
                    }
                    return sub.states.map(x => ({ s: x.s, v: x.v }));
                }
            }
            if (fn && (ctx.depth >= BOUNDS.depth || ctx.stack.has(fn.id))) {
                this.markBound(ctx.stack.has(fn.id) ? 'recursive-helper' : 'helper-depth-limit');
                r.s.unknown.add('helper-depth-or-recursion-limit');
            }
            if (r.args.some(a => ['input', 'opaqueInput', 'principalId'].includes(a.kind)) && !['require'].includes(safeName(n.expression))) {
                this.accepted.push({ s: clone(r.s), location: this.p.location(n), kind: 'data-call' });
            }
            // Every fallthrough call lacks a supported implementation summary.
            // Passing only scalars does not prove that it cannot throw, mutate
            // ambient state or affect later authorization.
            {
                this.unknownCalls.add(`${this.p.location(n).file}:${this.p.location(n).line}`);
                r.s.unknown.add('unmodeled-call');
                this.unknown('unmodeled-call', r.s, r.args.some(a => ['request', 'next'].includes(a.kind)));
            }
            if (r.args.some(a => a.kind === 'next')) {
                this.unsupportedControl = true;
                r.s.unknown.add('next-forwarded-to-unresolved-call');
            }
            if (r.args.some(a => a.kind === 'function')) this.unknown('unresolved-callback-invocation', r.s, true);
            return this.result(r.s, sources(value('array', { items: r.args })).length ? value('derived', { sources: r.args }) : U);
        });
    }
    dataDescriptor(n, resolved) {
        const loc = this.p.location(n);
        const recorded = (this.endpoint.dataAccess || []).find(x => x.file === loc.file && x.line === loc.line);
        if (recorded) return { operation: recorded.operation, tables: recorded.tables || [], recognition: 'cimet-source-provenance' };
        if (['external', 'external-instance'].includes(resolved?.kind) && ['mysql', 'mysql2', 'mysql2/promise', 'pg', 'mssql'].includes(resolved.spec) && /(?:^|\.)(query|execute)$/.test(resolved.member || ''))
            return { operation: 'unknown', tables: [], recognition: 'database-library-provenance' };
        return null;
    }
    dataCall(n, s, args, ctx, descriptor) {
        const location = this.p.location(n), sql = args.find(v => v.kind === 'sql');
        if (s.denials.length) this.issue('DENIAL_BEFORE_DATA_OPERATION', 'A data operation is reached after a denial response.', s, location, 'This source path sends an HTTP error response and subsequently reaches a database operation without terminating. Confirm the intended denial and operation effects.');
        const record = { id: `operation-${hash(`${this.endpoint.id || this.endpoint.path}:${location.file}:${n.pos}`).slice(0, 20)}`,
            location, operation: sql?.operation || descriptor.operation || 'unknown', tables: sql?.tables || descriptor.tables,
            recognition: descriptor.recognition, subjects: sources(value('array', { items: args.filter(v => v.kind !== 'function') })),
            selectors: sql?.selectorMapping === 'complete' && args[1]?.kind === 'array' ? sources(value('array', { items: (sql.selectorIndices || []).map(i => args[1].items[i] || U) })) : [],
            selectorMapping: sql?.selectorMapping === 'complete' && (!(sql.selectorIndices || []).length || args[1]?.kind === 'array') ? 'complete' : 'unknown',
            state: clone(s) };
        this.operations.push(record);
        this.accepted.push({ s: clone(s), location, kind: 'data-call' });
        const result = value('dataRecord', { path: 'database-result', source: record.id });
        const cb = args.find(v => v.kind === 'function');
        if (cb?.fn) {
            const success = this.run(cb.fn, [constant(null), result, U], clone(s), { depth: ctx.depth + 1, stack: ctx.stack, closure: cb.closure });
            const failure = this.run(cb.fn, [constant(true), U, U], clone(s), { depth: ctx.depth + 1, stack: ctx.stack, closure: cb.closure });
            ctx.next.push(...success.next, ...failure.next);
            // Promise settlement produced in a database callback is retained in
            // an executor, while callback effects never authenticate its caller.
            const settled = [...success.states, ...failure.states].filter(r => r.s.promiseValue);
            if (settled.length) return settled.map(r => ({ s: r.s, v: U }));
            this.flowReasons.add('asynchronous-callback-schedule');
            return this.result(s, U);
        }
        const failed = clone(s); failed.flow = 'throw';
        return [{ s, v: result }, { s: failed, v: U }];
    }
    newExpression(n, s, ctx, depth) {
        if (ts.isIdentifier(n.expression) && n.expression.text === 'Date' && !this.p.lookup('Date', n)) {
            let rows = [{ s, args: [] }];
            for (const arg of n.arguments || []) rows = this.bound(rows.flatMap(r => this.eval(arg, r.s, ctx, depth + 1).map(q => ({ s: q.s, args: [...r.args, q.v] }))));
            return rows.map(r => {
                if (r.args.length) this.unknown('date-value-and-exception-semantics', r.s);
                return { s: r.s, v: value('date', { sources: r.args }) };
            });
        }
        if (ts.isIdentifier(n.expression) && n.expression.text === 'Promise' && !this.p.lookup('Promise', n)) {
            const executor = n.arguments?.[0] && this.p.resolve(n.arguments[0]);
            if (executor?.kind !== 'function') { this.unknown('unresolved-promise-executor', s, true); return this.result(s, U); }
            const execution = this.run(executor.fn, [value('promise-resolve'), value('promise-reject')], s, { depth: ctx.depth + 1, stack: ctx.stack, closure: new Map(s.env) });
            ctx.next.push(...execution.next);
            return execution.states.map(r => {
                const rejected = r.s.flow === 'throw' || !!r.s.promiseRejected;
                const resolved = r.s.promiseValue;
                if (!resolved && !rejected) this.unknown('promise-settlement-not-observed', r.s);
                const result = value('promise', { outcomes: [{ rejected, value: resolved || U }] });
                r.s.flow = 'active'; delete r.s.promiseValue; delete r.s.promiseRejected;
                return { s: r.s, v: result };
            });
        }
        this.unknown('unmodeled-constructor', s);
        return this.result(s, U);
    }
    promiseChain(n, s, promise, args, ctx, method) {
        const rows = [];
        if (!ctx.awaited && !ctx.returned) this.flowReasons.add('asynchronous-promise-schedule');
        for (const outcome of promise.outcomes) {
            const cb = method === 'finally' ? args[0] : method === 'catch' ? outcome.rejected ? args[0] : null : outcome.rejected ? args[1] : args[0];
            if (!cb) { rows.push({ s: clone(s), v: value('promise', { outcomes: [outcome] }) }); continue; }
            if (!cb.fn) { this.unknown('unresolved-promise-handler', s, true); rows.push({ s: clone(s), v: U }); continue; }
            const result = this.run(cb.fn, method === 'finally' ? [] : [outcome.value], clone(outcome.state || s), { depth: ctx.depth + 1, stack: ctx.stack, closure: cb.closure });
            ctx.next.push(...result.next);
            rows.push(...result.states.map(r => {
                const rejected = r.s.flow === 'throw'; r.s.flow = 'active';
                return { s: clone(s), v: value('promise', { outcomes: [method === 'finally' && !rejected ? outcome : { rejected, value: r.v, state: clone(r.s) }] }) };
            }));
        }
        return this.bound(rows);
    }
    arrayCallback(n, s, base, callback, ctx, method) {
        if (!callback.fn) { this.unknown('unresolved-array-callback', s, true); return this.result(s, U); }
        const samples = base?.kind === 'array' ? base.items.slice(0, BOUNDS.paths) : [base?.kind === 'input' ? value('input', { path: base.path + '[]' }) : U];
        const facts = this.facts(callback.fn);
        if (facts.authentication || facts.next) this.unknown('repeated-callback-control', s, true);
        let current = [{ s, items: [] }];
        for (let i = 0; i < samples.length; i++) {
            current = this.bound(current.flatMap(r => {
                const result = this.run(callback.fn, [samples[i], constant(i), base || U], r.s, { depth: ctx.depth + 1, stack: ctx.stack, closure: callback.closure });
                ctx.next.push(...result.next);
                return result.states.map(q => ({ s: q.s, items: [...r.items, q.v] }));
            }));
        }
        // An unknown collection can be empty. Its callback checks cannot become
        // mandatory authorization for the operation following the collection.
        if (base?.kind !== 'array') current.push({ s: clone(s), items: [] });
        return this.bound(current).map(r => ({ s: r.s, v: method === 'map' ? value('array', { items: r.items }) : method === 'filter' ? base || U : U }));
    }
    facts(fn) {
        if (this.functionFacts.has(fn.id)) return this.functionFacts.get(fn.id);
        const facts = { authentication: false, next: false, calls: false, writes: false };
        const visit = n => {
            if (functionLike(n) && n !== fn.node) return;
            if (ts.isCallExpression(n)) {
                facts.calls = true;
                const resolved = this.p.resolve(n.expression);
                if (resolved?.spec === 'jsonwebtoken') facts.authentication = true;
                if (ts.isIdentifier(n.expression) && fn.node.parameters.some(p => ts.isIdentifier(p.name) && p.name.text === n.expression.text)) facts.next = true;
            }
            if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && !ts.isIdentifier(n.left)) facts.writes = true;
            ts.forEachChild(n, visit);
        };
        visit(fn.node); this.functionFacts.set(fn.id, facts); return facts;
    }
    predicate(v) {
        if (v.kind !== 'predicate')
            return null;
        if (v.operator === 'not')
            return { operator: 'not', terms: v.terms.map(x => this.predicate(x) || { value: describe(x) }) };
        if (v.terms)
            return { operator: v.operator, terms: v.terms.map(x => this.predicate(x) || { value: describe(x) }) };
        return { operator: v.operator, left: describe(v.left, v.right?.kind === 'role'), right: describe(v.right, v.left?.kind === 'role') };
    }
    kinds(v) {
        if (!v || v.kind !== 'predicate')
            return [];
        if (v.terms)
            return [...new Set(v.terms.flatMap(x => this.kinds(x)))];
        const vs = [v.left, v.right], k = [];
        if (vs.some(x => x?.kind === 'role') && vs.some(x => x?.kind === 'constant'))
            k.push('role');
        if (vs.some(x => x?.kind === 'transformed' && sources(x).some(s => s.kind === 'role')) && vs.some(x => x?.kind === 'constant')) k.push('role-unknown');
        if (vs.some(x => x?.kind === 'principalId') && vs.some(x => x?.kind === 'input' || x?.kind === 'opaqueInput' || x?.kind === 'dataRecord'))
            k.push(vs.some(x => x?.kind === 'opaqueInput') ? 'ownership-unknown' : 'ownership');
        else if (vs.some(x => x?.kind === 'principalId' || x?.kind === 'transformed' && sources(x).some(s => s.kind === 'principalId')) && vs.some(x => x?.kind === 'transformed' && sources(x).some(s => s.kind === 'input'))) k.push('ownership-unknown');
        return k;
    }
    condition(n, s, ctx) {
        return this.eval(n, s, ctx).flatMap(r => this.conditionValue(n, r.v, r.s, ctx));
    }
    conditionValue(n, v, state, ctx) {
            const r = { v, s: state };
            if (r.s.flow !== 'active')
                return [{ s: r.s, truth: false }];
            const t = truth(r.v), kinds = this.kinds(r.v);
            // A predicate not represented in the policy language must never
            // disappear into a supposedly complete admission/operation formula.
            // Its business branches are still explored and safely joined.
            if (t === null && !kinds.length && !['credential', 'principal'].includes(r.v.kind)) r.s.policyUnknown = true;
            let guard = null;
            if (kinds.length && this.guards.size < BOUNDS.guards) {
                const loc = this.p.location(n), id = `guard-${hash(`${loc.file}:${n.pos}:${ctx.fn.id}`).slice(0, 16)}`;
                const priorConditions = r.s.conditions.filter(x => this.guards.get(x.id)?.fn === ctx.fn.id).map(x => ({ ...x }));
                const old = this.guards.get(id);
                guard = { id, kinds, location: loc, predicate: this.predicate(r.v), rawPredicate: r.v, fn: ctx.fn.id, priorConditions: old ? old.priorConditions.filter(x => priorConditions.some(y => y.id === x.id && y.outcome === x.outcome)) : priorConditions, afterNext: old?.afterNext || r.s.passed };
                this.guards.set(id, guard);
                if (r.s.passed)
                    this.issue('GUARD_AFTER_NEXT', 'A policy condition is evaluated after next().', r.s, loc, 'The next handler can run before this later policy condition.');
            }
            else if (kinds.length) this.markBound('guard-record-limit');
            const make = b => {
                const next = clone(r.s);
                if (guard) {
                    const previous = next.conditions.find(x => x.id === guard.id);
                    if (previous && previous.outcome !== b) return null;
                    if (!previous) next.conditions.push({ id: guard.id, outcome: b });
                }
                return { s: next, truth: b };
            };
            return (t === null ? [make(true), make(false)] : [make(t)]).filter(Boolean);
    }
    statements(nodes, states, ctx) {
        for (const n of nodes) {
            if (this.steps > BOUNDS.steps) {
                this.markBound('execution-step-limit');
                break;
            }
            states = this.bound(states.flatMap(s => s.flow === 'active' ? this.statement(n, s, ctx) : [s]));
        }
        return states;
    }
    statement(n, s, ctx) {
        if (!this.tick(s))
            return [s];
        if (ts.isBlock(n))
            return this.statements(n.statements, [s], ctx);
        if (ts.isExpressionStatement(n))
            return this.eval(n.expression, s, ctx).map(r => r.s);
        if (ts.isVariableStatement(n)) {
            let states = [s];
            for (const d of n.declarationList.declarations) {
                if (!d.initializer)
                    continue;
                states = this.bound(states.flatMap(x => this.eval(d.initializer, x, ctx).map(r => {
                    if (ts.isIdentifier(d.name))
                        r.s.env.set(d.name.text, r.v);
                    else if (ts.isObjectBindingPattern(d.name))
                        for (const el of d.name.elements) {
                            if (ts.isIdentifier(el.name))
                                r.s.env.set(el.name.text, field(r.v, (el.propertyName || el.name).text));
                        }
                    return r.s;
                })));
            }
            return states;
        }
        if (ts.isIfStatement(n))
            return this.condition(n.expression, s, ctx).flatMap(r => r.s.flow !== 'active' ? [r.s] : r.truth ? this.statement(n.thenStatement, r.s, ctx) : n.elseStatement ? this.statement(n.elseStatement, r.s, ctx) : [r.s]);
        if (ts.isReturnStatement(n))
            return (n.expression ? this.eval(n.expression, s, { ...ctx, returned: true }) : this.result(s, U)).map(r => {
                if (r.s.flow === 'active') {
                    r.s.flow = 'return';
                    r.s.returned = r.v;
                }
                return r.s;
            });
        if (ts.isThrowStatement(n)) {
            s.flow = 'throw';
            return [s];
        }
        if (ts.isTryStatement(n)) {
            let states = this.statement(n.tryBlock, s, ctx);
            if (n.catchClause)
                states = states.flatMap(x => {
                    if (x.flow !== 'throw')
                        return [x];
                    x = clone(x);
                    x.flow = 'active';
                    return this.statement(n.catchClause.block, x, ctx);
                });
            if (n.finallyBlock)
                states = states.flatMap(x => {
                    const flow = x.flow;
                    x.flow = 'active';
                    return this.statement(n.finallyBlock, x, ctx).map(y => {
                        if (y.flow === 'active')
                            y.flow = flow;
                        return y;
                    });
                });
            return states;
        }
        if (functionLike(n) || ts.isEmptyStatement(n))
            return [s];
        if (ts.isBreakStatement(n) || ts.isContinueStatement(n)) { s.flow = ts.isBreakStatement(n) ? 'break' : 'continue'; if (n.label) this.unknown('labeled-control-transfer', s, true); return [s]; }
        if (ts.isForStatement(n) || ts.isForOfStatement(n) || ts.isForInStatement(n) || ts.isWhileStatement(n) || ts.isDoStatement(n)) return this.loop(n, s, ctx);
        if (ts.isSwitchStatement(n)) return this.switchStatement(n, s, ctx);
        this.unknown('unsupported-statement:' + ts.SyntaxKind[n.kind], s, true);
        return [s];
    }
    loop(n, state, ctx) {
        // Zero/representative-iteration abstraction: loop-carried scalar values
        // are widened before exploring the body, preserving all policy branches.
        let s = clone(state), element = U;
        if (ts.isForOfStatement(n) || ts.isForInStatement(n)) {
            const source = this.eval(n.expression, s, ctx)[0];
            if (source) { s = source.s; element = source.v.kind === 'input' ? value('input', { path: source.v.path + '[]' }) : source.v.kind === 'array' && source.v.items.length === 1 ? source.v.items[0] : U; }
            if (ts.isVariableDeclarationList(n.initializer)) {
                for (const d of n.initializer.declarations) if (ts.isIdentifier(d.name)) s.env.set(d.name.text, element);
            } else this.assign(n.initializer, element, s, ctx);
        }
        else if (ts.isForStatement(n) && n.initializer) {
            if (ts.isVariableDeclarationList(n.initializer)) {
                for (const d of n.initializer.declarations) if (ts.isIdentifier(d.name)) s.env.set(d.name.text, U);
            } else this.eval(n.initializer, s, ctx);
        }
        const assigned = new Set(), risky = { authentication: false, next: false };
        const scan = x => {
            if (functionLike(x)) return;
            if (ts.isBinaryExpression(x) && [ts.SyntaxKind.EqualsToken, ts.SyntaxKind.PlusEqualsToken, ts.SyntaxKind.MinusEqualsToken].includes(x.operatorToken.kind) && ts.isIdentifier(x.left)) assigned.add(x.left.text);
            if ((ts.isPostfixUnaryExpression(x) || ts.isPrefixUnaryExpression(x)) && ts.isIdentifier(x.operand)) assigned.add(x.operand.text);
            if (ts.isCallExpression(x)) {
                const resolved = this.p.resolve(x.expression);
                if (resolved?.spec === 'jsonwebtoken' || resolved?.kind === 'function' && this.facts(resolved.fn).authentication) risky.authentication = true;
                if (ts.isIdentifier(x.expression) && s.env.get(x.expression.text)?.kind === 'next') risky.next = true;
            }
            ts.forEachChild(x, scan);
        };
        scan(n.statement);
        for (const name of assigned) s.env.set(name, U);
        if (risky.authentication || risky.next) {
            this.unknown('loop-dependent-admission', s, true);
            this.markBound('loop-policy-fixpoint-unresolved');
        }
        const condition = ts.isForStatement(n) ? n.condition : ts.isWhileStatement(n) || ts.isDoStatement(n) ? n.expression : null;
        const branches = condition && !ts.isDoStatement(n) ? this.condition(condition, s, ctx) : [{ s: clone(s), truth: true }, ...(ts.isDoStatement(n) ? [] : [{ s: clone(s), truth: false }])];
        const results = branches.flatMap(branch => {
            if (!branch.truth) return [branch.s];
            return this.statement(n.statement, branch.s, ctx).map(out => {
                if (['break', 'continue'].includes(out.flow)) out.flow = 'active';
                for (const name of assigned) out.env.set(name, U);
                return out;
            });
        });
        this.flowReasons.add('loop-iteration-summary');
        return this.bound(results);
    }
    switchStatement(n, state, ctx) {
        return this.eval(n.expression, state, ctx).flatMap(r => {
            let remaining = [r.s], choices = [], finished = [], defaultIndex = -1;
            const clauses = [...n.caseBlock.clauses];
            for (let index = 0; index < clauses.length; index++) {
                const clause = clauses[index];
                if (ts.isDefaultClause(clause)) { defaultIndex = index; continue; }
                const matched = [], unmatched = [];
                for (const current of remaining) {
                    for (const c of this.eval(clause.expression, current, ctx)) {
                        const comparison = r.v.kind === 'constant' && c.v.kind === 'constant' ? constant(r.v.value === c.v.value) : value('predicate', { operator: '===', left: r.v, right: c.v });
                        for (const b of this.conditionValue(clause.expression, comparison, c.s, ctx)) (b.truth ? matched : unmatched).push(b.s);
                    }
                }
                remaining = unmatched;
                choices.push(...matched.map(s => ({ start: index, s })));
            }
            if (defaultIndex >= 0) choices.push(...remaining.map(s => ({ start: defaultIndex, s })));
            else finished.push(...remaining);
            for (const choice of choices) {
                let paths = [choice.s];
                for (let index = choice.start; index < clauses.length; index++) paths = this.statements(clauses[index].statements, paths, ctx);
                finished.push(...paths.map(s => { if (s.flow === 'break') s.flow = 'active'; return s; }));
            }
            return this.bound(finished);
        });
    }
    run(fn, args, state, options = {}) {
        if (!fn?.node.body) {
            state.unknown.add('function-body-unavailable');
            return { states: [{ s: state, v: U }], next: [] };
        }
        this.visited.add(fn.id);
        const facts = this.facts(fn), body = fn.node.body;
        const cacheable = !facts.calls && !facts.writes && (ts.isBlock(body) ? body.statements.length === 1 && ts.isReturnStatement(body.statements[0]) : true);
        const cacheKey = cacheable ? `${fn.id}:${this.valueKey(args)}:${this.valueKey(state.reqUser)}:${state.verified}:${[...(options.closure || [])].map(([k, v]) => k + '=' + this.valueKey(v)).join(';')}` : null;
        if (cacheKey && this.summaries.has(cacheKey)) {
            this.summaryHits++;
            return { states: this.summaries.get(cacheKey).map(v => ({ s: clone(state), v })), next: [] };
        }
        const s = clone(state), callerEnv = s.env;
        s.env = new Map(options.closure || []);
        for (let i = 0; i < fn.node.parameters.length; i++) {
            const name = fn.node.parameters[i].name;
            if (ts.isIdentifier(name)) {
                let argument = args[i] || constant(undefined);
                const initializer = fn.node.parameters[i].initializer;
                if (initializer && argument.kind === 'constant' && argument.value === undefined) {
                    if (ts.isNumericLiteral(initializer)) argument = constant(Number(initializer.text));
                    else if (ts.isStringLiteralLike(initializer)) argument = constant(initializer.text);
                    else if (initializer.kind === ts.SyntaxKind.TrueKeyword || initializer.kind === ts.SyntaxKind.FalseKeyword) argument = constant(initializer.kind === ts.SyntaxKind.TrueKeyword);
                    else { argument = U; this.unknown('unresolved-parameter-default', s, true); }
                }
                s.env.set(name.text, argument);
            }
            else if (ts.isObjectBindingPattern(name)) for (const element of name.elements) {
                if (ts.isIdentifier(element.name)) s.env.set(element.name.text, field(args[i] || U, (element.propertyName || element.name).text));
            }
        }
        s.flow = 'active';
        s.returned = U;
        s.passed = false;
        const stack = new Set(options.stack || []);
        stack.add(fn.id);
        const ctx = { fn, next: [], depth: options.depth || 0, stack };
        const states = ts.isBlock(fn.node.body) ? this.statements(fn.node.body.statements, [s], ctx) : this.eval(fn.node.body, s, ctx).map(r => { r.s.returned = r.v; return r.s; });
        if (cacheKey && states.every(x => x.flow !== 'throw') && !ctx.next.length && this.summaries.size < 256) this.summaries.set(cacheKey, states.map(x => x.returned || U));
        return { states: states.map(x => {
                const v = x.returned || U;
                x.env = callerEnv;
                if (x.flow === 'return')
                    x.flow = 'active';
                return { s: x, v };
            }), next: ctx.next.map(x => { x.env = callerEnv; return x; }) };
    }
    analyze(chain) {
        let states = [this.initial()], authBoundary = [], opaque = false;
        let admissionUnsupportedAuth = false, admissionUnsupportedControl = false;
        let finalContinuations = 0;
        const chainEvidence = [];
        for (let i = 0; i < chain.length; i++) {
            const h = chain[i], isLast = i === chain.length - 1, fn = h.value?.kind === 'function' ? h.value.fn : null;
            if (isLast && chain.length > 1) {
                admissionUnsupportedAuth = this.unsupportedAuth;
                admissionUnsupportedControl = this.unsupportedControl;
                this.currentPhase = 'operations';
            }
            if (!fn) {
                if (h.value?.kind === 'middleware-summary' && h.value.admission === 'continue-or-error' && h.value.guard === false) {
                    if (h.value.controlUnknown || h.value.authenticationUnknown) {
                        opaque = true;
                        for (const state of states) this.unknown('external-middleware-custom-callback', state, true);
                    }
                    for (const state of states) { const error = clone(state); error.flow = 'throw'; this.denied.push(error); }
                    chainEvidence.push({ ...h, behavior: 'modeled-continue-or-error' });
                    continue;
                }
                // Infrastructure middleware is recorded but cannot establish authentication.
                const infrastructure = ['external', 'factory'].includes(h.value?.kind) && ['cors', 'body-parser', 'express', 'compression', 'helmet', 'morgan', 'cookie-parser'].includes(h.value.spec);
                if (!infrastructure) {
                    opaque = true;
                    for (const s of states)
                        s.unknown.add('unresolved-middleware');
                    this.admissionReasons.add('unresolved-middleware');
                }
                chainEvidence.push({ ...h, behavior: 'unknown' });
                continue;
            }
            const next = h.conditional ? states.map(clone) : [];
            if (fn.module.sf.parseDiagnostics.length)
                this.unsupportedAuth = true;
            for (const state of states) {
                const run = this.run(fn, [value('request'), value('response'), value('next')], state);
                if (isLast) finalContinuations += run.next.length;
                next.push(...run.next);
                if (isLast && chain.length === 1) {
                    authBoundary.push(...run.next, ...run.states.filter(r => r.s.flow !== 'throw' && r.s.denials.length === 0).map(r => r.s));
                }
            }
            if (!isLast) {
                states = this.bound(next);
                authBoundary = states.map(clone);
                this.authBounded = this.bounded;
            }
            chainEvidence.push({ ...h, behavior: 'source-analyzed' });
            if (states.length === 0 && !isLast)
                break;
        }
        if (chain.length <= 1) { admissionUnsupportedAuth = this.unsupportedAuth; admissionUnsupportedControl = this.unsupportedControl; this.authBounded = this.bounded; }
        const paths = authBoundary.length ? authBoundary : states;
        // Authentication describes admission through the middleware chain; controller
        // business predicates do not turn optional credentials into mandatory JWTs.
        const verified = paths.filter(s => s.verified), unverified = paths.filter(s => !s.verified);
        let status = verified.length && unverified.length ? 'optional' : verified.length ? 'required' : 'not-observed';
        if (!verified.length && (opaque || this.authBounded || admissionUnsupportedAuth || paths.some(s => s.verifyFailed)))
            status = 'unknown';
        if (!paths.length)
            status = 'unknown';
        if (this.authBounded || admissionUnsupportedControl || admissionUnsupportedAuth || chain.some(h => h.conditional))
            status = 'unknown';
        const authEvidence = [...new Map(paths.flatMap(s => s.verifiedEvidence).map(e => [`${e.file}:${e.line}`, e])).values()];
        if (status === 'optional')
            authEvidence.push(evidence(chain[0]?.location || this.endpoint.location, 'At least one observed continuation has no successful credential verification.'));
        if (!authEvidence.length)
            authEvidence.push(evidence(chain[0]?.location || this.endpoint.location, status === 'unknown' ? 'Authentication could not be fully resolved in the bounded source analysis.' : 'No recognized credential-verification requirement was observed in this analyzed handler chain.'));
        for (const p of paths)
            if (p.decodedUsed)
                this.issue('JWT_DECODE_IDENTITY', 'Decoded token data is assigned as request identity without observed verification of that identity.', p, p.reqUser.decodedAt || chain[0]?.location || this.endpoint.location, 'jsonwebtoken.decode supplies request identity on an observed continuation; verifying another value does not validate this decoded identity.');
        const accepted = [...this.accepted.map(x => x.s), ...paths], guards = [];
        for (const g of this.guards.values()) {
            const success = accepted.flatMap(s => s.conditions.filter(x => x.id === g.id).map(x => x.outcome));
            const denial = this.denied.flatMap(s => s.conditions.filter(x => x.id === g.id).map(x => x.outcome));
            const outcomes = [...new Set(success)], rejected = [...new Set(denial)], dataOutcomes = [...new Set(this.accepted.filter(x => x.kind === 'data-call').flatMap(x => x.s.conditions.filter(c => c.id === g.id).map(c => c.outcome)))];
            const enforced = outcomes.length === 1 && rejected.includes(!outcomes[0]) && !g.afterNext && !this.bounded;
            const dataGuarded = !enforced && dataOutcomes.length === 1 && !g.afterNext && !this.bounded;
            const scope = g.priorConditions.length ? 'conditional' : dataGuarded ? 'observed-data-calls' : 'observed-function-paths';
            for (const kind of g.kinds) {
                guards.push({ id: g.id, kind: kind.startsWith('ownership') ? 'ownership' : 'role', status: kind.endsWith('-unknown') ? 'unknown' : enforced || dataGuarded ? 'enforced' : 'observed', location: g.location, predicate: g.predicate, scope, acceptedOutcomes: outcomes, deniedOutcomes: rejected, dataCallOutcomes: dataOutcomes, conditions: g.priorConditions, afterNext: g.afterNext, evidence: [evidence(g.location, kind.endsWith('-unknown') ? 'A principal comparison transforms a source value; equivalence with the original identifier or role is unresolved.' : enforced ? 'Only one predicate outcome reaches an observed continuation, response, or data call; the opposite outcome sends a denial.' : dataGuarded ? 'Observed data calls occur only on one predicate outcome; other responses or continuations may still occur.' : 'A policy predicate is present; complete enforcement is not established.')] });
            }
        }
        const executionPaths = paths.slice(0, BOUNDS.paths).map((s, i) => ({ id: `path-${i + 1}`, credentialVerification: s.verified ? 'observed' : 'not-observed', verificationFailure: s.verifyFailed, conditions: s.conditions, denialBeforeContinuation: s.denials.length > 0, unknowns: [...s.unknown] }));
        const dimensions = { token: ['missing', 'invalid', 'expired', 'valid'], role: ['OTHER'] };
        for (const guard of guards) guard.typedPredicate = typedPredicate(this.guards.get(guard.id)?.rawPredicate, dimensions);
        const pathPredicate = state => {
            const args = state.verified ? [{ op: 'eq', field: 'token', value: 'valid' }] : [];
            for (const condition of state.conditions) {
                const pred = typedPredicate(this.guards.get(condition.id)?.rawPredicate, dimensions);
                args.push(condition.outcome ? pred : { op: 'not', arg: pred });
            }
            return args.length ? { op: 'and', args } : { op: 'true' };
        };
        const groupedOperations = new Map();
        for (const operation of this.operations) {
            let group = groupedOperations.get(operation.id);
            if (!group) { group = { ...operation, states: [], selectorAlternatives: [] }; delete group.state; groupedOperations.set(operation.id, group); }
            group.states.push(operation.state);
            group.selectorAlternatives.push(operation.selectors);
            group.subjects = [...new Map([...group.subjects, ...operation.subjects].map(x => [x.kind + ':' + x.path, x])).values()];
            group.selectors = [...new Map([...group.selectors, ...operation.selectors].map(x => [x.kind + ':' + x.path, x])).values()];
            if (operation.selectorMapping !== 'complete') group.selectorMapping = 'unknown';
        }
        const dataOperations = [...groupedOperations.values()].map(operation => {
            const operationStates = this.bound(operation.states), conditions = operationStates.map(s => s.conditions);
            const common = conditions.length ? conditions[0].filter(c => conditions.every(row => row.some(d => d.id === c.id && d.outcome === c.outcome))) : [];
            const relevant = common.map(c => ({ condition: c, guard: guards.find(g => g.id === c.id) })).filter(x => x.guard);
            const ownership = relevant.filter(x => x.guard.kind === 'ownership' && operation.selectorMapping === 'complete' && operation.selectorAlternatives.every(selectors => selectors.some(subject => ownershipPaths(this.guards.get(x.guard.id)?.rawPredicate).includes(subject.path))));
            const roles = relevant.filter(x => x.guard.kind === 'role');
            const unresolved = [...new Set(operationStates.flatMap(s => [...s.unknown]))];
            const predicate = { op: 'or', args: operationStates.map(s => s.policyUnknown ? { op: 'and', args: [pathPredicate(s), { op: 'unknown' }] } : pathPredicate(s)) };
            const guarded = [...ownership, ...roles].some(x => x.guard.status === 'enforced' && !x.guard.afterNext);
            const policyStatus = hasUnknown(predicate) || unresolved.some(x => !['jwt-verification-failure'].includes(x)) || this.bounded || operation.selectorMapping !== 'complete' ? 'unknown' : guarded ? 'guarded' : 'unguarded';
            return { id: operation.id, location: operation.location, operation: operation.operation, tables: operation.tables,
                recognition: operation.recognition, subjects: operation.subjects, selectors: operation.selectors, selectorMapping: operation.selectorMapping, pathConditions: conditions,
                predicate, policy: { status: policyStatus, conditions: common, ownershipGuardIds: ownership.map(x => x.guard.id), roleGuardIds: roles.map(x => x.guard.id) }, unknowns: unresolved };
        });
        const successfulResponses = this.accepted.filter(x => x.kind === 'response').map(x => x.s);
        const policyAdmissionPaths = successfulResponses.length ? successfulResponses : [];
        const admission = policyAdmissionPaths.length ? { op: 'or', args: policyAdmissionPaths.map(s => s.policyUnknown ? { op: 'and', args: [pathPredicate(s), { op: 'unknown' }] } : pathPredicate(s)) } : { op: 'unknown' };
        const authReasons = [...new Set([...this.admissionReasons, ...(status === 'unknown' ? ['admission-not-fully-resolved'] : []), ...(chain.some(h => h.conditional) ? ['conditional-middleware'] : [])])];
        const executionReasons = [...new Set([...this.flowReasons, ...this.boundReasons, ...(this.unsupportedControl ? ['unresolved-control-transfer'] : [])])];
        const capability = reasons => ({ status: reasons.length ? 'partial' : 'complete', reasons });
        const roleReasons = guards.some(g => g.kind === 'role' && hasUnknown(g.typedPredicate)) ? ['unresolved-role-policy-predicate'] : [];
        const ownershipReasons = guards.some(g => g.kind === 'ownership' && hasUnknown(g.typedPredicate)) ? ['unresolved-ownership-policy-predicate'] : [];
        const capabilities = { authentication: capability(authReasons), roleChecks: capability([...executionReasons, ...roleReasons]), ownershipChecks: capability([...executionReasons, ...ownershipReasons]), executionPaths: capability(executionReasons), dataAccess: capability([...executionReasons, ...(dataOperations.some(o => o.operation === 'unknown') ? ['unresolved-database-operation'] : []), ...(dataOperations.some(o => o.selectorMapping !== 'complete') ? ['unresolved-database-selector'] : [])]) };
        const modelReasons = [...new Set([...authReasons, ...executionReasons, ...(hasUnknown(admission) || dataOperations.some(o => hasUnknown(o.predicate)) ? ['unresolved-policy-predicate'] : [])])];
        if (guards.some(g => { const p = this.guards.get(g.id)?.rawPredicate; return p && JSON.stringify(this.predicate(p)).includes('"OTHER"'); })) modelReasons.push('role-value-collides-with-remainder-domain');
        const policyModel = { status: modelReasons.length ? 'partial' : 'complete', admissionScope: 'successful-http-response', admission, operations: dataOperations.map(o => ({ id: o.id, kind: o.operation, location: o.location, predicate: o.predicate })), dimensions, unknownReasons: modelReasons };
        const fullyTraced = !opaque && !this.bounded && executionReasons.length === 0;
        const necessaryCredential = status === 'required' ? { op: 'eq', field: 'token', value: 'valid' } : { op: 'true' };
        policyModel.authorizationEnvelope = {
            scope: 'conservative-authorization-control',
            // This is an overapproximation of permission paths, not an exact
            // model of successful business responses or database results.
            mayPermit: fullyTraced ? predicateBound(admission, true) : necessaryCredential,
            mustPermit: policyModel.status === 'complete' ? admission : { op: 'false' },
            operations: dataOperations.map(o => ({ id: o.id,
                // A write can precede credential verification in middleware.
                // The endpoint's eventual authentication requirement cannot
                // constrain an unresolved operation that may already execute.
                mayReach: fullyTraced ? predicateBound(o.predicate, true) : { op: 'true' },
                mustReach: policyModel.status === 'complete' && o.policy.status !== 'unknown' ? o.predicate : { op: 'false' } })),
            approximation: fullyTraced ? 'unknown-predicate-bounds' : 'credential-bound-only',
            exactModel: policyModel.status === 'complete'
        };
        const dispatchUnknown = this.bounded || this.unsupportedControl || opaque || this.flowReasons.has('unresolved-callback-invocation');
        const dispatch = { status: dispatchUnknown ? 'partial' : 'complete', canContinue: dispatchUnknown ? null : finalContinuations > 0, reason: dispatchUnknown ? 'Continuation has unresolved control or callback behavior.' : finalContinuations ? 'A final handler calls next() on an observed path.' : 'No final handler continuation exists in the analyzed control paths.' };
        return { authentication: { status, evidence: authEvidence }, roleChecks: guards.filter(g => g.kind === 'role'), ownershipChecks: guards.filter(g => g.kind === 'ownership'), executionPaths, dataOperations, policyModel, dispatch, issues: this.issues, coverage: { functionsAnalyzed: this.visited.size, steps: this.steps, boundsReached: this.bounded, boundReasons: [...this.boundReasons], unmodeledCalls: this.unknownCalls.size, unmodeledCallSites: [...this.unknownCalls].map(site => { const split = site.lastIndexOf(':'); return { file: site.slice(0, split), line: Number(site.slice(split + 1)) }; }), mergedPaths: this.mergedPaths, functionSummaryCacheHits: this.summaryHits, capabilities }, chain: chainEvidence };
    }
}
module.exports = { Flow, BOUNDS };
