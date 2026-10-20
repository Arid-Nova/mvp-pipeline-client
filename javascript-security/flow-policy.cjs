'use strict';

// Values below are abstract source facts. Raw SQL and application string values
// are never emitted into the policy report.
function sources(v, result = [], seen = new Set()) {
    if (!v || seen.has(v)) return result;
    seen.add(v);
    if (['input', 'principalId', 'role', 'credential', 'opaqueInput', 'dataRecord'].includes(v.kind))
        result.push({ kind: v.kind, path: v.path });
    if (v.kind === 'object') for (const x of Object.values(v.fields)) sources(x, result, seen);
    if (v.kind === 'array') for (const x of v.items) sources(x, result, seen);
    if (v.kind === 'predicate') for (const x of [...(v.terms || []), v.left, v.right]) sources(x, result, seen);
    for (const x of v.sources || []) sources(x, result, seen);
    return [...new Map(result.map(x => [x.kind + ':' + x.path, x])).values()];
}

function queryShape(text) {
    if (typeof text !== 'string') return null;
    const trimmed = text.replace(/^\s*(?:\/\*[\s\S]*?\*\/\s*)*/, '').trim();
    const operation = /^(select|insert|update|delete|replace)\b/i.exec(trimmed)?.[1]?.toLowerCase();
    if (!operation) return null;
    const tables = [];
    for (const match of trimmed.matchAll(/\b(?:from|join|into|update)\s+([A-Za-z_][A-Za-z0-9_]*)/gi))
        if (!tables.includes(match[1])) tables.push(match[1]);
    // Count placeholders outside strings/comments and retain only WHERE inputs.
    // SET/INSERT values are deliberately not treated as resource selectors.
    const tokens = trimmed.match(/'(?:''|\\.|[^'])*'|"(?:""|\\.|[^"])*"|`(?:``|[^`])*`|--[^\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_][A-Za-z0-9_]*|>=|<=|<>|!=|==|\?|[^\s]/g) || [];
    let index = 0, inWhere = false, unmodeled = false, selects = 0;
    const selectorIndices = [];
    for (let position = 0; position < tokens.length; position++) {
        const token = tokens[position];
        if (/^['"`]/.test(token) || token.startsWith('--') || token.startsWith('/*')) continue;
        const word = token.toLowerCase();
        if (token === ';' && position < tokens.length - 1) unmodeled = true;
        if (word === 'select' && ++selects > 1) unmodeled = true;
        if (word === 'where') inWhere = true;
        if (inWhere && ['or', 'not'].includes(word)) unmodeled = true;
        if (['order', 'group', 'limit', 'returning', 'having', 'union'].includes(word)) inWhere = false;
        if (['union', 'with'].includes(word)) unmodeled = true;
        if (token === '?') {
            if (inWhere) {
                const next = tokens[position + 1]?.toLowerCase();
                const terminalValue = !next || ['and', 'or', 'order', 'group', 'limit', 'returning', 'having', ')', ';'].includes(next);
                const positiveEquality = terminalValue && tokens[position - 1] === '=' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(tokens[position - 2] || '') || tokens[position + 1] === '=' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(tokens[position + 2] || '');
                if (positiveEquality) selectorIndices.push(index); else unmodeled = true;
            }
            index++;
        }
    }
    return { operation, tables: tables.slice(0, 16), selectorIndices, selectorMapping: unmodeled ? 'unknown' : 'complete' };
}

function ownershipPaths(v, result = []) {
    if (!v || v.kind !== 'predicate') return result;
    if (v.terms) for (const term of v.terms) ownershipPaths(term, result);
    else {
        const values = [v.left, v.right];
        if (values.some(x => x?.kind === 'principalId')) for (const x of values) if (x?.kind === 'input' || x?.kind === 'dataRecord') result.push(x.path);
    }
    return [...new Set(result)];
}

function typedPredicate(v, dimensions) {
    if (!v) return { op: 'unknown' };
    if (v.kind === 'constant' && typeof v.value === 'boolean') return { op: v.value ? 'true' : 'false' };
    if (v.kind !== 'predicate') return { op: 'unknown' };
    if (v.operator === 'not') return { op: 'not', arg: typedPredicate(v.terms[0], dimensions) };
    if (v.terms) return { op: v.operator === 'all-of' ? 'and' : 'or', args: v.terms.map(x => typedPredicate(x, dimensions)) };
    const operands = [v.left, v.right];
    if (['===', '==', '!==', '!='].includes(v.operator)) {
        const role = operands.find(x => x?.kind === 'role'), c = operands.find(x => x?.kind === 'constant');
        let result;
        if (role && c && ['number', 'string', 'boolean'].includes(typeof c.value)) {
            if (role.verified !== true) return { op: 'unknown' };
            // Principal roles have no established runtime type. JavaScript loose
            // comparison and coercion cannot be represented as strict equality.
            if (['==', '!='].includes(v.operator) || c.value === 'OTHER') return { op: 'unknown' };
            if (typeof c.value === 'string' && c.value.length > 40) return { op: 'unknown' };
            if (!dimensions.role.includes(c.value)) dimensions.role.unshift(c.value);
            result = { op: 'eq', field: 'role', value: c.value };
        }
        const principal = operands.find(x => x?.kind === 'principalId'), input = operands.find(x => x?.kind === 'input' || x?.kind === 'dataRecord');
        if (principal && input) {
            if (principal.verified !== true) return { op: 'unknown' };
            if (['==', '!='].includes(v.operator)) return { op: 'unknown' };
            const dimension = 'owner:' + (input.source ? input.source + ':' : '') + input.path;
            dimensions[dimension] = [true, false];
            result = { op: 'eq', field: dimension, value: true };
        }
        if (result) return ['!==', '!='].includes(v.operator) ? { op: 'not', arg: result } : result;
    }
    return { op: 'unknown' };
}

function hasUnknown(predicate) {
    return !predicate || predicate.op === 'unknown' || (predicate.args || []).some(hasUnknown) || predicate.arg && hasUnknown(predicate.arg);
}

// Upper bounds replace unknown truth with both possibilities. Negation reverses
// lower/upper bounds; replacing every unknown with true under NOT is unsound.
function predicateBound(predicate, upper) {
    if (!predicate || predicate.op === 'unknown') return { op: upper ? 'true' : 'false' };
    if (predicate.op === 'not') return { op: 'not', arg: predicateBound(predicate.arg, !upper) };
    if (predicate.args) return { ...predicate, args: predicate.args.map(x => predicateBound(x, upper)) };
    return predicate;
}

module.exports = { sources, queryShape, typedPredicate, hasUnknown, ownershipPaths, predicateBound };
