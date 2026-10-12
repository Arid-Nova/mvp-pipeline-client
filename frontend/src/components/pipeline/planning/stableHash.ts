/**
 * Deterministic hashing helpers shared by the planning modules (catalog version, intent option
 * IDs, candidate IDs). Non-cryptographic; used only for stable identity, never for security.
 */

/** JSON with object keys sorted, so semantically identical values always serialize identically. */
export const stableStringify = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        const entries = Object.keys(value as Record<string, unknown>)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
        return `{${entries.join(',')}}`;
    }
    return JSON.stringify(value);
};

/** cyrb53: small deterministic 53-bit string hash, returned as 14 hex characters. */
export const hashString = (input: string): string => {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < input.length; i += 1) {
        const ch = input.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    return hash.toString(16).padStart(14, '0');
};
