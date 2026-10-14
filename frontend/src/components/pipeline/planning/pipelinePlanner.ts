/**
 * Pipeline planning orchestration (Issue #60, P60-M1-006). Pure async logic, no React.
 *
 *   goal → POST /chatbot/pipeline/intents (attempt 1)
 *        → backend outcome → parseIntentPlan (strict) → assembleCandidateSet
 *          (compose → validate → distinctness, per tier) → exactly 3 ValidatedSuggestions
 *        → on a planning-quality failure: ONE retry asking for a complete new plan (attempt 2)
 *        → success or a typed failure. Never a third request, never 1–2 suggestions.
 *
 * The model only chooses analysis capabilities. Its options are untrusted until parseIntentPlan
 * accepts them; graphs come only from the deterministic composer and validator. Nothing here
 * repairs model output: bad output is rejected and, once, re-requested.
 *
 * Retried (attempt 1 only): INVALID_MODEL_OUTPUT, an intent plan the parser rejects (count, tiers,
 * unknown or non-analysis IDs, too many capabilities, titles, duplicate sets), a composition
 * failure (e.g. too large) and a post-composition collision.
 * Not retried: UNSUPPORTED_GOAL, model unavailable (503, network, HTTP errors), per-call or total
 * timeout, cancellation, catalogVersion or suggestionSetId mismatch, malformed responses and
 * invalid requests.
 *
 * Each attempt stands alone: attempt 2's plan is assembled by itself and never merged with
 * attempt 1's options.
 */
import { CardType } from '../models';
import { PipelineIntentRequest, PipelineIntentsCallResult } from '../../../services/types';
import { CandidateSetResult, CandidateSuggestion, assembleCandidateSet } from './candidateSet';
import { isPlainObject } from './contractIssue';
import {
    MAX_ANALYSIS_PER_OPTION,
    ParseIntentPlanResult,
    ParsedIntentOption,
    describeIntentIssuesForRetry,
    parseIntentPlan,
} from './intentPlan';
import { PipelineCapabilityCatalog, buildPipelineCapabilityCatalog } from './pipelineCapabilities';
import { ValidatedSuggestion } from './pipelineValidator';

// ---------------------------------------------------------------------------------------------
// Constants (the planning limits live here; MAX_ANALYSIS_PER_OPTION is re-exported from the
// intent contract so there is one place to look)
// ---------------------------------------------------------------------------------------------

export const MAX_PLAN_ATTEMPTS = 2;
/** Total budget for one planning operation, all attempts and frontend processing included. */
export const PLAN_TOTAL_BUDGET_MS = 150_000;
/** Per-request budget; matches the backend's per-call model timeout. */
export const PLAN_CALL_TIMEOUT_MS = 75_000;
export const MAX_GOAL_CHARS = 1000;
export { MAX_ANALYSIS_PER_OPTION };

/** chatbot-backend request bounds (PipelineIntentRequest validation). */
const MAX_FEEDBACK_LINES = 20;
const MAX_FEEDBACK_CHARS = 200;
const MAX_EXCLUDED_SETS = 6;
const CAPABILITY_ID_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

// ---------------------------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------------------------

export type PlanFailureReason =
    | 'model_unavailable'
    | 'invalid_model_output'
    | 'insufficient_valid_candidates'
    | 'unsupported_goal'
    | 'request_invalid'
    | 'catalog_mismatch'
    | 'timeout'
    | 'cancelled';

/** Finer-grained cause for logs, tests and later UI mapping. Never contains server or model text. */
export type PlanFailureCause =
    | 'EMPTY_GOAL'
    | 'GOAL_TOO_LONG'
    | 'BAD_REQUEST'
    | 'MODEL_UNAVAILABLE'
    | 'NETWORK_ERROR'
    | 'HTTP_ERROR'
    | 'CALL_TIMEOUT'
    | 'DEADLINE_EXCEEDED'
    | 'CANCELLED'
    | 'CATALOG_VERSION_MISMATCH'
    | 'SUGGESTION_SET_ID_MISMATCH'
    | 'MALFORMED_RESPONSE'
    | 'UNSUPPORTED_GOAL'
    | 'INVALID_MODEL_OUTPUT'
    | 'INVALID_INTENT_PLAN'
    | 'COMPOSITION_FAILED'
    | 'INSUFFICIENT_DISTINCT'
    | 'UNEXPECTED_ERROR';

export type ThreeSuggestions = readonly [ValidatedSuggestion, ValidatedSuggestion, ValidatedSuggestion];
export type ThreeCandidates = readonly [CandidateSuggestion, CandidateSuggestion, CandidateSuggestion];

export interface PlanSuccess {
    status: 'success';
    suggestionSetId: string;
    catalogVersion: string;
    /** Exactly three, ordered focused, balanced, comprehensive. */
    suggestions: ThreeSuggestions;
    /** The same three with their tier, parsed option and final analysis cards. */
    candidates: ThreeCandidates;
    attempts: number;
    requestId?: string;
    model?: string;
    provider?: string;
    rejectedByCode: Record<string, number>;
}

export interface PlanFailure {
    status: 'failure';
    suggestionSetId: string;
    reason: PlanFailureReason;
    cause: PlanFailureCause;
    /** Fixed, user-safe text for the reason; never server or model text. */
    message: string;
    attempts: number;
    rejectedByCode: Record<string, number>;
    /** Bounded, cleaned model explanation (unsupported_goal only), shown as plain text. */
    unsupportedReason?: string;
}

export type PlanOutcome = PlanSuccess | PlanFailure;

/** The API call's typed result (services/api requestPipelineIntents). */
export type PipelineIntentsCall = PipelineIntentsCallResult;

export interface PlannerDeps {
    /** POST /chatbot/pipeline/intents; must never throw for expected failures. */
    requestIntents: (request: PipelineIntentRequest, options: { signal: AbortSignal; timeoutMs: number }) => Promise<PipelineIntentsCall>;
    buildCatalog: () => PipelineCapabilityCatalog;
    newSuggestionSetId: () => string;
    now: () => number;
    assemble: (options: readonly ParsedIntentOption[], catalog: PipelineCapabilityCatalog) => CandidateSetResult;
    /** Developer-facing errors only (a COMPOSITION_INVALID is a composer bug). */
    reportDeveloperError: (message: string) => void;
}

export interface PlanRequest {
    goal: string;
    signal?: AbortSignal;
}

export const FAILURE_MESSAGES: Record<PlanFailureReason, string> = {
    model_unavailable: "The assistant's model isn't reachable right now.",
    timeout: 'That took too long. Local models can be slow — try again or use a shorter description.',
    invalid_model_output: "The assistant couldn't produce usable analysis options for that goal.",
    insufficient_valid_candidates: "I couldn't find three valid, different pipelines for that goal. Try describing it differently.",
    unsupported_goal: "That goal isn't something AridNova pipelines can analyse.",
    request_invalid: 'Please describe your goal in 1 to 1000 characters.',
    catalog_mismatch: 'The app was updated — please reload the page.',
    cancelled: '',
};

// ---------------------------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------------------------

/** RFC 4122 v4 UUID. Uses crypto.randomUUID when available (secure contexts). */
export const newSuggestionSetId = (): string => {
    const cryptoApi: Crypto | undefined = typeof globalThis !== 'undefined' ? (globalThis as { crypto?: Crypto }).crypto : undefined;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
    const bytes = new Uint8Array(16);
    if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
        cryptoApi.getRandomValues(bytes);
    } else {
        for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const defaultDeps: Omit<PlannerDeps, 'requestIntents'> = {
    buildCatalog: buildPipelineCapabilityCatalog,
    newSuggestionSetId,
    now: () => Date.now(),
    assemble: (options, catalog) => assembleCandidateSet(options, { catalog }),
    // eslint-disable-next-line no-console
    reportDeveloperError: (message) => console.error(message),
};

// ---------------------------------------------------------------------------------------------
// Retry feedback (capability and profile level only; never raw model text or graph wiring)
// ---------------------------------------------------------------------------------------------

const PROFILE_RULE = 'Return exactly three options: one focused, one balanced and one comprehensive.';

const GUIDANCE_BY_CODE: Record<string, string> = {
    WRONG_OPTION_COUNT: PROFILE_RULE,
    MISSING_TIER: PROFILE_RULE,
    DUPLICATE_TIER: PROFILE_RULE,
    BAD_TIER: PROFILE_RULE,
    NO_OPTIONS_ARRAY: PROFILE_RULE,
    BAD_OPTION: PROFILE_RULE,
    DUPLICATE_CAPABILITY_SET: 'Each option must use a different set of capabilities.',
    TOO_MANY_CAPABILITIES: `Use at most ${MAX_ANALYSIS_PER_OPTION} capabilities per option.`,
    TITLE_TOO_LONG: 'Keep each title under 60 characters.',
    MISSING_TITLE: 'Give every option a short title.',
    UNKNOWN_CAPABILITY: 'Use only capability IDs from the supplied list, copied exactly.',
    BAD_CAPABILITY_ID: 'Use only capability IDs from the supplied list, copied exactly.',
    NO_CAPABILITY_ARRAY: 'Give every option an analysisCardTypes list of capability IDs.',
    NO_ANALYSIS_CAPABILITY: 'Every option needs at least one analysis capability from the supplied list.',
};

const safeLine = (line: string): string => line.replace(/[^A-Za-z0-9_ .,:;()[\]'-]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_FEEDBACK_CHARS);

/** Lines over the backend's 200-character limit are split at sentence boundaries, not cut mid-sentence. */
const splitLong = (line: string): string[] =>
    line.length <= MAX_FEEDBACK_CHARS
        ? [line]
        : line.split('. ').map((part, i, parts) => (i < parts.length - 1 ? `${part}.` : part));

const boundFeedback = (lines: string[]): string[] =>
    Array.from(new Set(lines.flatMap(splitLong).map(safeLine).filter((line) => line.length > 0))).slice(0, MAX_FEEDBACK_LINES);

/** Feedback for a plan the strict parser rejected. Unknown IDs are named only if ID-shaped. */
export const intentPlanFeedback = (parsed: ParseIntentPlanResult): string[] => {
    const lines = describeIntentIssuesForRetry(parsed).filter((line) => line.startsWith('Problem: '));
    const codes = Array.from(new Set(parsed.issues.map((issue) => issue.code)));
    codes.forEach((code) => {
        if (GUIDANCE_BY_CODE[code]) lines.push(GUIDANCE_BY_CODE[code]);
    });
    parsed.issues
        .filter((issue) => issue.code === 'UNKNOWN_CAPABILITY')
        .map((issue) => issue.message.replace(/^Unknown capability "(.*)"\.$/, '$1'))
        .filter((id) => CAPABILITY_ID_PATTERN.test(id))
        .forEach((id) => lines.push(`Capability ${id} is not available. Use only IDs from the supplied list.`));
    return boundFeedback(lines);
};

/** Feedback when the backend could not extract a usable plan. Only its fixed parse messages are used. */
export const invalidOutputFeedback = (data: Record<string, unknown>): string[] => {
    const parseErrors = Array.isArray(data.parseErrors) ? data.parseErrors.filter((e): e is string => typeof e === 'string') : [];
    return boundFeedback([
        'Problem: INVALID_MODEL_OUTPUT',
        'Respond with one JSON object that has an options list of exactly three options.',
        ...parseErrors.slice(0, 5),
    ]);
};

/** Feedback and exclusions after composition failed or two pipelines collided. */
export const candidateSetRetryInput = (
    result: Extract<CandidateSetResult, { ok: false }>,
    options: readonly ParsedIntentOption[],
    catalog: PipelineCapabilityCatalog
): { feedback: string[]; exclude: CardType[][] } => {
    const order = catalog.cards.filter((card) => card.isAnalysis).map((card) => card.cardType);
    const canonical = (ids: readonly string[]) => order.filter((id) => ids.includes(id));
    const sets: CardType[][] = [];
    result.compositionFailures.forEach((failure) => sets.push(canonical(failure.requested)));
    result.collisions.forEach((collision) =>
        collision.tiers.forEach((tier) => {
            const option = options.find((o) => o.tier === tier);
            if (option) sets.push(canonical(option.analysisCardTypes));
        })
    );
    const seen = new Set<string>();
    const exclude = sets.filter((set) => {
        const key = set.join('+');
        if (set.length === 0 || set.length > MAX_ANALYSIS_PER_OPTION || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    const feedback = [...result.retryFeedback];
    if (result.compositionFailures.some((f) => f.reason === 'COMPOSITION_TOO_LARGE')) {
        feedback.push('The selected capability combination produces a pipeline that is too large. Choose fewer or different analysis capabilities.');
    }
    if (result.collisions.length) {
        feedback.push('Choose capability sets that stay different after required prerequisites are added.');
    }
    feedback.push(PROFILE_RULE);
    return { feedback: boundFeedback(feedback), exclude: exclude.slice(0, MAX_EXCLUDED_SETS) };
};

// ---------------------------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------------------------

type AttemptResult =
    | { done: true; outcome: PlanOutcome }
    | { done: false; feedback: string[]; exclude: CardType[][]; producedValidPlan: boolean; cause: PlanFailureCause };

const count = (tally: Record<string, number>, code: string) => {
    tally[code] = (tally[code] ?? 0) + 1;
};

/** Resolves with the promise, or with 'aborted' as soon as the signal aborts (late results are dropped). */
const untilAborted = <T>(promise: Promise<T>, signal: AbortSignal): Promise<T | 'aborted'> =>
    new Promise((resolve) => {
        if (signal.aborted) {
            resolve('aborted');
            return;
        }
        const onAbort = () => resolve('aborted');
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener('abort', onAbort);
                resolve(value);
            },
            () => {
                signal.removeEventListener('abort', onAbort);
                resolve('aborted');
            }
        );
    });

/**
 * Plans three pipeline suggestions for a goal. Always resolves (never rejects) with a typed
 * outcome. Success always holds exactly three ValidatedSuggestions.
 */
export const planPipelineSuggestions = async (
    request: PlanRequest,
    dependencies: Partial<PlannerDeps> & Pick<PlannerDeps, 'requestIntents'>
): Promise<PlanOutcome> => {
    const deps: PlannerDeps = { ...defaultDeps, ...dependencies };
    const suggestionSetId = deps.newSuggestionSetId();
    const rejectedByCode: Record<string, number> = {};
    let attempts = 0;

    const fail = (reason: PlanFailureReason, cause: PlanFailureCause, extra: Partial<PlanFailure> = {}): PlanFailure => ({
        status: 'failure',
        suggestionSetId,
        reason,
        cause,
        message: FAILURE_MESSAGES[reason],
        attempts,
        rejectedByCode,
        ...extra,
    });

    const goal = typeof request.goal === 'string' ? request.goal.trim() : '';
    if (!goal) return fail('request_invalid', 'EMPTY_GOAL');
    if (goal.length > MAX_GOAL_CHARS) return fail('request_invalid', 'GOAL_TOO_LONG');

    // One deadline and one abort controller for the whole operation.
    const operation = new AbortController();
    let deadlineExceeded = false;
    const deadline = deps.now() + PLAN_TOTAL_BUDGET_MS;
    const deadlineTimer = setTimeout(() => {
        deadlineExceeded = true;
        operation.abort();
    }, PLAN_TOTAL_BUDGET_MS);
    const onExternalAbort = () => operation.abort();
    if (request.signal?.aborted) operation.abort();
    request.signal?.addEventListener('abort', onExternalAbort, { once: true });

    const stopped = (): PlanFailure | null => {
        if (deadlineExceeded || deps.now() >= deadline) return fail('timeout', 'DEADLINE_EXCEEDED');
        if (operation.signal.aborted) return fail('cancelled', 'CANCELLED');
        return null;
    };

    try {
        // The catalog is captured once and used for both attempts, parsing and assembly.
        const catalog = deps.buildCatalog();
        let feedback: string[] = [];
        let exclude: CardType[][] = [];
        let producedValidPlan = false;
        let lastCause: PlanFailureCause = 'INVALID_MODEL_OUTPUT';

        for (let attempt = 1; attempt <= MAX_PLAN_ATTEMPTS; attempt += 1) {
            const halted = stopped();
            if (halted) return halted;
            const timeoutMs = Math.min(PLAN_CALL_TIMEOUT_MS, deadline - deps.now());
            if (timeoutMs <= 0) return fail('timeout', 'DEADLINE_EXCEEDED');

            const body: PipelineIntentRequest = {
                goal,
                suggestionSetId,
                attempt,
                catalog,
                catalogVersion: catalog.catalogVersion,
                excludeCapabilitySets: exclude,
                rejectionFeedback: feedback,
            };
            attempts = attempt;
            // eslint-disable-next-line no-await-in-loop
            const call = await untilAborted(deps.requestIntents(body, { signal: operation.signal, timeoutMs }), operation.signal);
            const haltedAfterCall = stopped();
            if (haltedAfterCall) return haltedAfterCall;
            if (call === 'aborted' || call.kind === 'cancelled') return fail('cancelled', 'CANCELLED');

            const result = handleAttempt(call, { suggestionSetId, catalog, deps, rejectedByCode, attempts: attempt, fail });
            if (result.done) return result.outcome;
            producedValidPlan = producedValidPlan || result.producedValidPlan;
            lastCause = result.cause;
            feedback = result.feedback;
            exclude = result.exclude;
        }

        return producedValidPlan
            ? fail('insufficient_valid_candidates', lastCause)
            : fail('invalid_model_output', lastCause);
    } catch (error) {
        deps.reportDeveloperError(`Pipeline planning failed unexpectedly: ${String((error as Error)?.message ?? error)}`);
        return stopped() ?? fail('model_unavailable', 'UNEXPECTED_ERROR');
    } finally {
        clearTimeout(deadlineTimer);
        request.signal?.removeEventListener('abort', onExternalAbort);
    }
};

interface AttemptContext {
    suggestionSetId: string;
    catalog: PipelineCapabilityCatalog;
    deps: PlannerDeps;
    rejectedByCode: Record<string, number>;
    attempts: number;
    fail: (reason: PlanFailureReason, cause: PlanFailureCause, extra?: Partial<PlanFailure>) => PlanFailure;
}

const OUTCOMES = ['OK', 'INVALID_MODEL_OUTPUT', 'UNSUPPORTED_GOAL', 'MODEL_UNAVAILABLE'];

const handleAttempt = (call: Exclude<PipelineIntentsCall, { kind: 'cancelled' }>, ctx: AttemptContext): AttemptResult => {
    const { fail, rejectedByCode } = ctx;
    switch (call.kind) {
        case 'model_unavailable':
            count(rejectedByCode, 'MODEL_UNAVAILABLE');
            return { done: true, outcome: fail('model_unavailable', 'MODEL_UNAVAILABLE') };
        case 'network_error':
            return { done: true, outcome: fail('model_unavailable', 'NETWORK_ERROR') };
        case 'http_error':
            return { done: true, outcome: fail('model_unavailable', 'HTTP_ERROR') };
        case 'timeout':
            return { done: true, outcome: fail('timeout', 'CALL_TIMEOUT') };
        case 'request_invalid':
            return { done: true, outcome: fail('request_invalid', 'BAD_REQUEST') };
        default:
            break;
    }

    // HTTP 2xx: the body is untrusted until checked.
    const data = call.data;
    if (!isPlainObject(data) || typeof data.outcome !== 'string' || !OUTCOMES.includes(data.outcome)) {
        return { done: true, outcome: fail('catalog_mismatch', 'MALFORMED_RESPONSE') };
    }
    if (data.suggestionSetId !== ctx.suggestionSetId) {
        return { done: true, outcome: fail('catalog_mismatch', 'SUGGESTION_SET_ID_MISMATCH') };
    }
    if (data.catalogVersion !== ctx.catalog.catalogVersion) {
        return { done: true, outcome: fail('catalog_mismatch', 'CATALOG_VERSION_MISMATCH') };
    }

    if (data.outcome === 'MODEL_UNAVAILABLE') {
        count(rejectedByCode, 'MODEL_UNAVAILABLE');
        return { done: true, outcome: fail('model_unavailable', 'MODEL_UNAVAILABLE') };
    }
    if (data.outcome === 'UNSUPPORTED_GOAL') {
        count(rejectedByCode, 'UNSUPPORTED_GOAL');
        const parsed = parseIntentPlan({ version: 1, options: [], unsupportedReason: data.unsupportedReason }, ctx.catalog);
        return {
            done: true,
            outcome: fail('unsupported_goal', 'UNSUPPORTED_GOAL', parsed.unsupportedReason ? { unsupportedReason: parsed.unsupportedReason } : {}),
        };
    }
    if (data.outcome === 'INVALID_MODEL_OUTPUT') {
        count(rejectedByCode, 'INVALID_MODEL_OUTPUT');
        return { done: false, feedback: invalidOutputFeedback(data), exclude: [], producedValidPlan: false, cause: 'INVALID_MODEL_OUTPUT' };
    }

    // outcome OK: the strict frontend parser decides. The backend's shape check proves nothing.
    const parsed = parseIntentPlan({ version: 1, options: data.options }, ctx.catalog);
    if (parsed.status !== 'ok' || !parsed.options) {
        parsed.issues.forEach((issue) => count(rejectedByCode, issue.code));
        // OK with an empty option list is still not a usable plan.
        const feedback = parsed.status === 'unsupported' ? boundFeedback([PROFILE_RULE]) : intentPlanFeedback(parsed);
        return { done: false, feedback, exclude: [], producedValidPlan: false, cause: 'INVALID_INTENT_PLAN' };
    }

    const assembled = ctx.deps.assemble(parsed.options, ctx.catalog);
    if (assembled.ok) {
        const candidates = assembled.suggestions;
        const success: PlanSuccess = {
            status: 'success',
            suggestionSetId: ctx.suggestionSetId,
            catalogVersion: ctx.catalog.catalogVersion,
            suggestions: [candidates[0].suggestion, candidates[1].suggestion, candidates[2].suggestion],
            candidates,
            attempts: ctx.attempts,
            requestId: typeof data.requestId === 'string' ? data.requestId : undefined,
            model: typeof data.model === 'string' ? data.model : undefined,
            provider: typeof data.provider === 'string' ? data.provider : undefined,
            rejectedByCode,
        };
        return { done: true, outcome: success };
    }

    assembled.issues.forEach((issue) => count(rejectedByCode, issue.code));
    assembled.compositionFailures.forEach((failure) => count(rejectedByCode, failure.reason));
    if (assembled.compositionFailures.some((failure) => failure.reason === 'COMPOSITION_INVALID')) {
        ctx.deps.reportDeveloperError('Pipeline composer produced an invalid graph (COMPOSITION_INVALID); this is a composer bug.');
    }
    if (assembled.reason === 'INVALID_INTENT_SET') {
        // Unreachable after a successful parse (it guarantees one option per tier); fail safe anyway.
        return { done: false, feedback: boundFeedback([PROFILE_RULE]), exclude: [], producedValidPlan: false, cause: 'INVALID_INTENT_PLAN' };
    }
    const retry = candidateSetRetryInput(assembled, parsed.options, ctx.catalog);
    return {
        done: false,
        feedback: retry.feedback,
        exclude: retry.exclude,
        producedValidPlan: true,
        cause: assembled.reason === 'COMPOSITION_FAILED' ? 'COMPOSITION_FAILED' : 'INSUFFICIENT_DISTINCT',
    };
};

/** Exhaustiveness helper for consumers switching on PlanFailureReason. */
export const assertNeverReason = (reason: never): never => {
    throw new Error(`Unhandled plan failure reason: ${String(reason)}`);
};
