/**
 * Candidate assembly (P60-M1-004, revised for D11).
 *
 * For each accepted intent option, per tier:
 *   ParsedIntentOption -> composePipeline -> (validatePipelineSpec inside) -> ValidatedSuggestion
 *
 * Success always means exactly three suggestions, ordered focused, balanced, comprehensive.
 * Tiers come from the validated intent contract and are preserved as-is: they are never
 * reassigned by graph size, and no suggestion is preselected (D3, D4).
 *
 * Distinctness: two options that the composer expands to the same graph (same candidateId) or to
 * the same final set of analysis cards are not distinct suggestions. That is a typed failure; the
 * set is never shrunk to one or two, options are never renamed, and no artificial cards are added.
 * The caller (P60-M1-005/006) may spend its one bounded retry using `retryFeedback`, which talks
 * about capability IDs only: no topology, titles, rationale or other model text.
 */
import { CardType } from '../models';
import { ContractIssue } from './contractIssue';
import { INTENT_TIERS, IntentTier, ParsedIntentOption } from './intentPlan';
import { PipelineCapabilityCatalog, buildPipelineCapabilityCatalog } from './pipelineCapabilities';
import { ComposableIntent, ComposeFailureReason, ComposeResult, composePipeline } from './pipelineComposer';
import { MAX_NODES, ValidatedSuggestion, isValidatedSuggestion } from './pipelineValidator';

export interface CandidateSuggestion {
    tier: IntentTier;
    optionId: string;
    option: Readonly<ParsedIntentOption>;
    suggestion: ValidatedSuggestion;
    /** Analysis cards in the final graph (requested plus those added as prerequisites), catalog order. */
    analysisCardTypes: CardType[];
}

export type CandidateSetFailureReason = 'INVALID_INTENT_SET' | 'COMPOSITION_FAILED' | 'INSUFFICIENT_DISTINCT';

export interface CandidateCollision {
    tiers: [IntentTier, IntentTier];
    sameCandidate: boolean;
    sameAnalysisSet: boolean;
    analysisCardTypes: CardType[];
}

export interface CompositionFailure {
    tier: IntentTier;
    reason: ComposeFailureReason;
    requested: CardType[];
}

export type CandidateSetResult =
    | { ok: true; suggestions: [CandidateSuggestion, CandidateSuggestion, CandidateSuggestion] }
    | {
          ok: false;
          reason: CandidateSetFailureReason;
          issues: ContractIssue[];
          collisions: CandidateCollision[];
          compositionFailures: CompositionFailure[];
          retryFeedback: string[];
      };

export interface CandidateSetDeps {
    compose: (intent: ComposableIntent) => ComposeResult;
    catalog: PipelineCapabilityCatalog;
}

let defaultDeps: CandidateSetDeps | null = null;

const getDefaultDeps = (): CandidateSetDeps => {
    if (!defaultDeps) defaultDeps = { compose: (intent) => composePipeline(intent), catalog: buildPipelineCapabilityCatalog() };
    return defaultDeps;
};

const failure = (
    reason: CandidateSetFailureReason,
    issues: ContractIssue[],
    extra: Partial<{ collisions: CandidateCollision[]; compositionFailures: CompositionFailure[]; retryFeedback: string[] }> = {}
): CandidateSetResult => ({
    ok: false,
    reason,
    issues,
    collisions: extra.collisions ?? [],
    compositionFailures: extra.compositionFailures ?? [],
    retryFeedback: extra.retryFeedback ?? [],
});

/** Assembles the three suggestions for one accepted intent plan. Never throws. */
export const assembleCandidateSet = (
    options: readonly ParsedIntentOption[],
    deps: Partial<CandidateSetDeps> = {}
): CandidateSetResult => {
    const { compose, catalog } = { ...getDefaultDeps(), ...deps };
    const analysisOrder = catalog.cards.filter((card) => card.isAnalysis).map((card) => card.cardType);
    const known = (types: readonly string[]) => analysisOrder.filter((type) => types.includes(type));
    const ids = (types: readonly string[]) => `[${known(types).join(', ')}]`;

    // 1. Exactly one option per tier, taken from the intent contract.
    const list = Array.isArray(options) ? options : [];
    const issues: ContractIssue[] = [];
    if (list.length !== INTENT_TIERS.length) {
        issues.push({ code: 'WRONG_OPTION_COUNT', message: `Exactly ${INTENT_TIERS.length} intent options are required (got ${list.length}).` });
    }
    INTENT_TIERS.forEach((tier) => {
        const count = list.filter((option) => option?.tier === tier).length;
        if (count !== 1) issues.push({ code: count === 0 ? 'MISSING_TIER' : 'DUPLICATE_TIER', message: `Expected one "${tier}" option, got ${count}.` });
    });
    if (issues.length) return failure('INVALID_INTENT_SET', issues);
    const ordered = INTENT_TIERS.map((tier) => list.find((option) => option.tier === tier) as ParsedIntentOption);

    // 2. Compose and validate each tier independently.
    const built: CandidateSuggestion[] = [];
    const compositionFailures: CompositionFailure[] = [];
    ordered.forEach((option) => {
        const requested = known(Array.isArray(option.analysisCardTypes) ? option.analysisCardTypes : []);
        const result = compose({ title: option.title, rationale: option.rationale, analysisCardTypes: option.analysisCardTypes });
        if (!result.ok) {
            compositionFailures.push({ tier: option.tier, reason: result.reason, requested });
            return;
        }
        if (!isValidatedSuggestion(result.suggestion)) {
            compositionFailures.push({ tier: option.tier, reason: 'COMPOSITION_INVALID', requested });
            return;
        }
        const present = new Set(result.suggestion.spec.nodes.map((node) => node.cardType));
        built.push(
            Object.freeze({
                tier: option.tier,
                optionId: option.optionId,
                option: Object.freeze({ ...option, analysisCardTypes: [...option.analysisCardTypes] }),
                suggestion: result.suggestion,
                analysisCardTypes: analysisOrder.filter((type) => present.has(type)),
            })
        );
    });
    if (compositionFailures.length) {
        return failure(
            'COMPOSITION_FAILED',
            compositionFailures.map((f) => ({ code: f.reason, message: `The ${f.tier} option could not be composed.` })),
            {
                compositionFailures,
                retryFeedback: compositionFailures.map((f) =>
                    f.reason === 'COMPOSITION_TOO_LARGE'
                        ? `The ${f.tier} option ${ids(f.requested)} needs more than ${MAX_NODES} cards. Choose fewer capabilities.`
                        : `The ${f.tier} option ${ids(f.requested)} cannot be built. Choose different capabilities.`
                ),
            }
        );
    }

    // 3. Distinctness: same graph, or same final analysis cards.
    const collisions: CandidateCollision[] = [];
    built.forEach((a, i) =>
        built.slice(i + 1).forEach((b) => {
            const sameCandidate = a.suggestion.candidateId === b.suggestion.candidateId;
            const sameAnalysisSet = a.analysisCardTypes.join('+') === b.analysisCardTypes.join('+');
            if (sameCandidate || sameAnalysisSet) {
                collisions.push({ tiers: [a.tier, b.tier], sameCandidate, sameAnalysisSet, analysisCardTypes: a.analysisCardTypes });
            }
        })
    );
    if (collisions.length) {
        return failure(
            'INSUFFICIENT_DISTINCT',
            collisions.map((c) => ({
                code: c.sameCandidate ? 'DUPLICATE_CANDIDATE' : 'DUPLICATE_ANALYSIS_SET',
                message: `The ${c.tiers[0]} and ${c.tiers[1]} options produce the same ${c.sameCandidate ? 'pipeline' : 'analysis cards'}.`,
            })),
            {
                collisions,
                retryFeedback: collisions.map(
                    (c) =>
                        `The ${c.tiers[0]} and ${c.tiers[1]} options both expand to ${ids(c.analysisCardTypes)} once prerequisites are added. ` +
                        'Choose capabilities so that every option ends up with a different set.'
                ),
            }
        );
    }

    return { ok: true, suggestions: [built[0], built[1], built[2]] };
};
