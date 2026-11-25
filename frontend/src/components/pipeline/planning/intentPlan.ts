/**
 * PipelineIntentPlan v1 (P60-M1-015): the ONLY thing the language model returns (D11).
 *
 * The model chooses WHAT to analyse: three intent options, one per tier, each naming analysis
 * capabilities from the capability catalog. It never supplies graph structure: nodes, edges,
 * prerequisite cards, IDs, coordinates, configuration or runtime data are stripped here and
 * never used. The deterministic composer (P60-M1-017/018) builds the graph and the user-facing
 * summary; the model is not asked for a summary.
 *
 * Example of a valid plan:
 *   {
 *     "version": 1,
 *     "options": [
 *       { "tier": "focused", "title": "Architecture and auth check",
 *         "rationale": "Shows the topology and checks authorization policy.",
 *         "analysisCardTypes": ["VISUALIZATION", "FORMAL_VIZ"] },
 *       { "tier": "balanced", ... }, { "tier": "comprehensive", ... }
 *     ]
 *   }
 *
 * Capability rules (catalog-driven, `isAnalysis` from buildPipelineCapabilityCatalog()):
 *   - ID not in the catalog                    -> UNKNOWN_CAPABILITY (option rejected)
 *   - catalog card with isAnalysis = false     -> dropped, NON_ANALYSIS_DROPPED note
 *   - no analysis capability left              -> NO_ANALYSIS_CAPABILITY (option rejected)
 *   - more than MAX_ANALYSIS_PER_OPTION        -> TOO_MANY_CAPABILITIES (option rejected)
 *   - repeated ID within an option             -> collapsed, DUPLICATE_CAPABILITY_COLLAPSED note
 *   - IDs are normalized to catalog order, so [B, A] equals [A, B].
 * Plan rules: version 1, exactly three valid options, exactly one per tier, three distinct
 * capability sets. A plan with no options and an `unsupportedReason` is "unsupported".
 *
 * `parseIntentPlan` never throws. Each attempt is judged as a complete plan: only `status: 'ok'`
 * (three valid options) is usable. Individually valid options are still reported in `validOptions`
 * when the plan as a whole is invalid, but only for diagnostics and retry feedback: orchestration
 * (P60-M1-006) then requests a complete replacement plan and never merges these options with it
 * or carries them forward as partial suggestions.
 */
import { CardType } from '../models';
import { ContractIssue, cleanText, isPlainObject } from './contractIssue';
import { PipelineCapabilityCatalog, buildPipelineCapabilityCatalog } from './pipelineCapabilities';
import { hashString } from './stableHash';

export type IntentIssue = ContractIssue;

export const INTENT_TIERS = ['focused', 'balanced', 'comprehensive'] as const;
export type IntentTier = (typeof INTENT_TIERS)[number];

/** What the model is asked to return for one option. */
export interface PipelineIntentOption {
    tier: IntentTier;
    /** 1..60 characters. */
    title: string;
    /** 0..400 characters, "why this fits the goal". Optional. */
    rationale?: string;
    /** 1..MAX_ANALYSIS_PER_OPTION unique analysis capability IDs. */
    analysisCardTypes: string[];
}

/** What the model is asked to return. */
export interface PipelineIntentPlanV1 {
    version: 1;
    options: PipelineIntentOption[];
    unsupportedReason?: string;
}

/** A validated option: capabilities are known analysis CardTypes in catalog order. */
export interface ParsedIntentOption {
    /** Stable ID of the normalized capability set ("io_" + hash), for retries and telemetry. */
    optionId: string;
    tier: IntentTier;
    title: string;
    rationale?: string;
    analysisCardTypes: CardType[];
}

export type IntentPlanStatus = 'ok' | 'unsupported' | 'invalid';

export interface ParseIntentPlanResult {
    status: IntentPlanStatus;
    /** Present only when status is 'ok': exactly three options, ordered focused, balanced, comprehensive. */
    options?: [ParsedIntentOption, ParsedIntentOption, ParsedIntentOption];
    /** Every individually valid option, in input order (also when the plan as a whole is invalid). */
    validOptions: ParsedIntentOption[];
    unsupportedReason?: string;
    /** Problems that reject an option or the plan. */
    issues: IntentIssue[];
    /** Non-fatal observations (dropped non-analysis cards, collapsed duplicates, alias use). */
    notes: IntentIssue[];
    /** Fields that were present but are not part of the contract (graph, config, IDs, ...). */
    ignoredFields: string[];
}

export const MAX_ANALYSIS_PER_OPTION = 6;
export const INTENT_TITLE_MAX = 60;
export const INTENT_RATIONALE_MAX = 400;
export const INTENT_UNSUPPORTED_REASON_MAX = 400;
/** Upper bound on options inspected, so oversized input stays cheap. */
const MAX_OPTIONS_INSPECTED = 10;
const MAX_IDS_INSPECTED = 32;

const PLAN_FIELDS = ['version', 'options', 'unsupportedReason'];
const OPTION_FIELDS = ['tier', 'title', 'rationale', 'summary', 'analysisCardTypes'];

/** Stable ID of a normalized capability set. */
export const intentOptionId = (analysisCardTypes: string[]): string =>
    `io_${hashString(analysisCardTypes.join('+')).slice(0, 10)}`;

const parseText = (
    value: unknown,
    max: number,
    path: string,
    code: string,
    issues: IntentIssue[]
): { present: boolean; text?: string } => {
    if (value === undefined || value === null) return { present: false };
    if (typeof value !== 'string') {
        issues.push({ code: `BAD_${code}`, message: `${path} must be a string.`, path });
        return { present: true };
    }
    const text = cleanText(value);
    if (text.length === 0) return { present: false };
    if (text.length > max) {
        issues.push({ code: `${code}_TOO_LONG`, message: `${path} must be at most ${max} characters.`, path });
        return { present: true };
    }
    return { present: true, text };
};

const parseOption = (
    raw: unknown,
    index: number,
    catalog: PipelineCapabilityCatalog,
    issues: IntentIssue[],
    notes: IntentIssue[],
    ignoredFields: string[]
): ParsedIntentOption | null => {
    const base = `options[${index}]`;
    if (!isPlainObject(raw)) {
        issues.push({ code: 'BAD_OPTION', message: 'Each option must be an object.', path: base });
        return null;
    }
    const optionIssues: IntentIssue[] = [];
    Object.keys(raw)
        .filter((key) => !OPTION_FIELDS.includes(key))
        .forEach((key) => ignoredFields.push(`${base}.${key}`));

    const tier = typeof raw.tier === 'string' ? cleanText(raw.tier) : '';
    if (!(INTENT_TIERS as readonly string[]).includes(tier)) {
        optionIssues.push({ code: 'BAD_TIER', message: `tier must be one of ${INTENT_TIERS.join(', ')}.`, path: `${base}.tier` });
    }

    const title = parseText(raw.title, INTENT_TITLE_MAX, `${base}.title`, 'TITLE', optionIssues);
    if (!title.present) optionIssues.push({ code: 'MISSING_TITLE', message: 'title is required.', path: `${base}.title` });

    // `rationale` is optional. A model-supplied `summary` is accepted only as a fallback for a
    // missing rationale; the contract never requires it (the composer writes the summary).
    let rationale = parseText(raw.rationale, INTENT_RATIONALE_MAX, `${base}.rationale`, 'RATIONALE', optionIssues);
    if (!rationale.present && raw.summary !== undefined) {
        rationale = parseText(raw.summary, INTENT_RATIONALE_MAX, `${base}.summary`, 'RATIONALE', optionIssues);
        if (rationale.text !== undefined) {
            notes.push({ code: 'SUMMARY_USED_AS_RATIONALE', message: 'summary was used as the rationale.', path: `${base}.summary` });
        }
    } else if (raw.summary !== undefined) {
        ignoredFields.push(`${base}.summary`);
    }

    const ids: CardType[] = [];
    if (!Array.isArray(raw.analysisCardTypes)) {
        optionIssues.push({ code: 'NO_CAPABILITY_ARRAY', message: 'analysisCardTypes must be an array.', path: `${base}.analysisCardTypes` });
    } else {
        const cards = new Map(catalog.cards.map((card) => [card.cardType as string, card]));
        const requested = new Set<string>();
        raw.analysisCardTypes.slice(0, MAX_IDS_INSPECTED).forEach((value, i) => {
            const path = `${base}.analysisCardTypes[${i}]`;
            if (typeof value !== 'string') {
                optionIssues.push({ code: 'BAD_CAPABILITY_ID', message: 'Capability IDs must be strings.', path });
                return;
            }
            const id = cleanText(value);
            const card = cards.get(id);
            if (!card) {
                optionIssues.push({ code: 'UNKNOWN_CAPABILITY', message: `Unknown capability "${id.slice(0, 64)}".`, path });
            } else if (!card.isAnalysis) {
                notes.push({ code: 'NON_ANALYSIS_DROPPED', message: `${id} is not an analysis capability and was dropped.`, path });
            } else if (requested.has(id)) {
                notes.push({ code: 'DUPLICATE_CAPABILITY_COLLAPSED', message: `${id} was listed more than once.`, path });
            } else {
                requested.add(id);
            }
        });
        if (raw.analysisCardTypes.length > MAX_IDS_INSPECTED) {
            optionIssues.push({ code: 'TOO_MANY_CAPABILITIES', message: `At most ${MAX_ANALYSIS_PER_OPTION} capabilities.`, path: `${base}.analysisCardTypes` });
        }
        // Normalize to catalog order.
        catalog.cards.forEach((card) => {
            if (requested.has(card.cardType)) ids.push(card.cardType);
        });
        if (ids.length === 0 && !optionIssues.some((i) => i.code === 'UNKNOWN_CAPABILITY' || i.code === 'BAD_CAPABILITY_ID')) {
            optionIssues.push({ code: 'NO_ANALYSIS_CAPABILITY', message: 'At least one analysis capability is required.', path: `${base}.analysisCardTypes` });
        }
        if (ids.length > MAX_ANALYSIS_PER_OPTION && !optionIssues.some((i) => i.code === 'TOO_MANY_CAPABILITIES')) {
            optionIssues.push({ code: 'TOO_MANY_CAPABILITIES', message: `At most ${MAX_ANALYSIS_PER_OPTION} capabilities.`, path: `${base}.analysisCardTypes` });
        }
    }

    issues.push(...optionIssues);
    if (optionIssues.length > 0 || title.text === undefined) return null;
    const option: ParsedIntentOption = {
        optionId: intentOptionId(ids),
        tier: tier as IntentTier,
        title: title.text,
        analysisCardTypes: ids,
    };
    if (rationale.text !== undefined) option.rationale = rationale.text;
    return option;
};

const parseUnsafe = (raw: unknown, catalog: PipelineCapabilityCatalog): ParseIntentPlanResult => {
    const issues: IntentIssue[] = [];
    const notes: IntentIssue[] = [];
    const ignoredFields: string[] = [];
    const invalid = (): ParseIntentPlanResult => ({ status: 'invalid', validOptions: [], issues, notes, ignoredFields });

    if (!isPlainObject(raw)) {
        issues.push({ code: 'NOT_OBJECT', message: 'An intent plan must be a JSON object.' });
        return invalid();
    }
    Object.keys(raw)
        .filter((key) => !PLAN_FIELDS.includes(key))
        .forEach((key) => ignoredFields.push(key));
    if (raw.version !== 1) issues.push({ code: 'BAD_VERSION', message: 'version must be 1.', path: 'version' });
    if (!Array.isArray(raw.options)) {
        issues.push({ code: 'NO_OPTIONS_ARRAY', message: 'options must be an array.', path: 'options' });
        return invalid();
    }

    const reason = parseText(raw.unsupportedReason, INTENT_UNSUPPORTED_REASON_MAX, 'unsupportedReason', 'UNSUPPORTED_REASON', issues);
    if (raw.options.length === 0 && reason.text !== undefined && raw.version === 1) {
        return { status: 'unsupported', validOptions: [], unsupportedReason: reason.text, issues, notes, ignoredFields };
    }

    const rawOptions: unknown[] = raw.options;
    const validOptions = rawOptions
        .slice(0, MAX_OPTIONS_INSPECTED)
        .map((option, i) => parseOption(option, i, catalog, issues, notes, ignoredFields))
        .filter((option): option is ParsedIntentOption => option !== null);

    if (rawOptions.length !== INTENT_TIERS.length) {
        issues.push({ code: 'WRONG_OPTION_COUNT', message: `Exactly ${INTENT_TIERS.length} options are required.`, path: 'options' });
    }
    INTENT_TIERS.forEach((tier) => {
        const count = rawOptions.filter((option) => isPlainObject(option) && typeof option.tier === 'string' && cleanText(option.tier) === tier).length;
        if (count === 0) issues.push({ code: 'MISSING_TIER', message: `No "${tier}" option.`, path: 'options' });
        if (count > 1) issues.push({ code: 'DUPLICATE_TIER', message: `More than one "${tier}" option.`, path: 'options' });
    });
    const seenSets = new Set<string>();
    validOptions.forEach((option) => {
        if (seenSets.has(option.optionId)) {
            issues.push({ code: 'DUPLICATE_CAPABILITY_SET', message: `Two options request the same capabilities (${option.analysisCardTypes.join(', ')}).`, path: 'options' });
        }
        seenSets.add(option.optionId);
    });

    const ok = issues.length === 0 && validOptions.length === INTENT_TIERS.length;
    if (!ok) return { status: 'invalid', validOptions, issues, notes, ignoredFields };
    const ordered = INTENT_TIERS.map((tier) => validOptions.find((option) => option.tier === tier) as ParsedIntentOption);
    return {
        status: 'ok',
        options: [ordered[0], ordered[1], ordered[2]],
        validOptions,
        issues,
        notes,
        ignoredFields,
    };
};

/** Strictly parses an untrusted value into a validated intent plan. Never throws. */
export const parseIntentPlan = (
    raw: unknown,
    catalog: PipelineCapabilityCatalog = buildPipelineCapabilityCatalog()
): ParseIntentPlanResult => {
    try {
        return parseUnsafe(raw, catalog);
    } catch (error) {
        return {
            status: 'invalid',
            validOptions: [],
            issues: [{ code: 'PARSE_ERROR', message: `Unexpected input: ${String((error as Error)?.message ?? error)}` }],
            notes: [],
            ignoredFields: [],
        };
    }
};

/**
 * Short, de-duplicated, model-readable feedback for the one required retry (P60-M1-006):
 * the issue codes found, unknown IDs to avoid, and the capability sets already accepted.
 */
export const describeIntentIssuesForRetry = (result: ParseIntentPlanResult, accepted: ParsedIntentOption[] = []): string[] => {
    const lines = Array.from(new Set(result.issues.map((issue) => issue.code))).map((code) => `Problem: ${code}`);
    const unknown = Array.from(
        new Set(
            result.issues
                .filter((issue) => issue.code === 'UNKNOWN_CAPABILITY')
                .map((issue) => issue.message.replace(/^Unknown capability "(.*)"\.$/, '$1'))
        )
    );
    if (unknown.length) lines.push(`Not capability IDs, do not use: ${unknown.join(', ')}`);
    accepted.forEach((option) => lines.push(`Already accepted, do not repeat: [${option.analysisCardTypes.join(', ')}]`));
    return lines.slice(0, 20).map((line) => line.slice(0, 200));
};
