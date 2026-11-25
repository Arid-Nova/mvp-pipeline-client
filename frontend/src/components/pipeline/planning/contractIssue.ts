/** A coded problem found while parsing an untrusted planning contract (PipelineSpec, intent plan). */
export interface ContractIssue {
    /** Stable, machine-readable code, e.g. `TITLE_TOO_LONG`. */
    code: string;
    /** Human-readable explanation for logs and tests. */
    message: string;
    /** JSON-path-like location, e.g. `options[1].analysisCardTypes[0]`. */
    path?: string;
}

/** Characters that are never kept in user-facing text: C0/C1 control characters except whitespace. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** Trims and removes control characters from model- or fixture-supplied text. */
export const cleanText = (value: string): string => value.replace(CONTROL_CHARS, '').trim();

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
