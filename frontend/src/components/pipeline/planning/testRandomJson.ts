/**
 * Deterministic pseudo-random JSON-like values for "parser never throws" tests.
 * Test support only; not used by production code.
 */
const KEYS = [
    'specVersion', 'version', 'title', 'summary', 'rationale', 'nodes', 'edges', 'key', 'cardType', 'from', 'to',
    'options', 'tier', 'analysisCardTypes', 'unsupportedReason', 'x', 'y', 'id', 'config', '__proto__', 'constructor',
];
const STRINGS = ['', ' ', 'focused', 'balanced', 'comprehensive', 'VISUALIZATION', 'SYSTEM_INPUT', 'VECTOR_GENERATE', 'a', 'x'.repeat(500), '\u0000\u001f', 'Bad Key!'];

export const createRandom = (seed: number) => {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
};

export const randomJsonValue = (random: () => number, depth = 0): unknown => {
    const pick = Math.floor(random() * (depth > 3 ? 6 : 8));
    switch (pick) {
        case 0: return null;
        case 1: return random() < 0.5;
        case 2: return Math.floor(random() * 2000) - 1000;
        case 3: return STRINGS[Math.floor(random() * STRINGS.length)];
        case 4: return 1;
        case 5: return undefined;
        case 6: return Array.from({ length: Math.floor(random() * 5) }, () => randomJsonValue(random, depth + 1));
        default: {
            const obj: Record<string, unknown> = {};
            const n = Math.floor(random() * 6);
            for (let i = 0; i < n; i += 1) {
                obj[KEYS[Math.floor(random() * KEYS.length)]] = randomJsonValue(random, depth + 1);
            }
            return obj;
        }
    }
};
