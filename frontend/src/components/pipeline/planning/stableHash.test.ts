import { hashString, stableStringify } from './stableHash';

describe('stableHash', () => {
    it('keeps the cyrb53 output stable (golden values)', () => {
        // Pinned so that moving the helper (or editing it) cannot silently change catalogVersion,
        // option IDs or candidate IDs.
        expect(hashString('aridnova')).toBe('15d9cffac8cd67');
        expect(hashString('')).toBe('0bdcb81aee8d83');
        expect(hashString('aridnova')).toMatch(/^[0-9a-f]{14}$/);
    });

    it('serializes objects independently of key order', () => {
        expect(stableStringify({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(stableStringify({ a: [{ c: 3, d: 2 }], b: 1 }));
        expect(stableStringify({ a: [1, 2] })).not.toBe(stableStringify({ a: [2, 1] }));
    });
});
