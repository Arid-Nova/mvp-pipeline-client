import fs from 'fs';
import path from 'path';
import { CardType } from '../models';
import { CandidateSetResult, assembleCandidateSet } from './candidateSet';
import { INTENT_TIERS, IntentTier, ParsedIntentOption, intentOptionId, parseIntentPlan } from './intentPlan';
import { buildPipelineCapabilityCatalog } from './pipelineCapabilities';
import { ComposableIntent, ComposeResult, composePipeline } from './pipelineComposer';
import { PipelineSpecV1 } from './pipelineSpec';
import { canonicalSignature, isValidatedSuggestion, validatePipelineSpec } from './pipelineValidator';

const catalog = buildPipelineCapabilityCatalog();
const ANALYSIS = catalog.cards.filter((card) => card.isAnalysis).map((card) => card.cardType);

const option = (tier: IntentTier, analysisCardTypes: CardType[], title = `${tier} option`, rationale?: string): ParsedIntentOption => {
    const ordered = ANALYSIS.filter((type) => analysisCardTypes.includes(type));
    return { optionId: intentOptionId(ordered), tier, title, rationale, analysisCardTypes: ordered };
};

/** The G1-like profiles from the intent spike (also the chatbot-backend fixture). */
const G1 = (): ParsedIntentOption[] => [
    option('focused', ['VISUALIZATION', 'FORMAL_VIZ'], 'Architecture and authorization check'),
    option('balanced', ['VISUALIZATION', 'FORMAL_VIZ', 'VERIFICATION_COMPARISON'], 'Architecture, policy and scenario comparison'),
    option('comprehensive', ['VISUALIZATION', 'FORMAL_VIZ', 'VERIFICATION_COMPARISON', 'AEGIS', 'TEST_EXECUTOR'], 'Full authorization and risk analysis'),
];

const expectFailure = (result: CandidateSetResult) => {
    if (result.ok) throw new Error('Expected a failure');
    expect((result as { suggestions?: unknown }).suggestions).toBeUndefined();
    return result;
};

describe('assembleCandidateSet — success', () => {
    it('returns exactly three validated suggestions, ordered focused, balanced, comprehensive', () => {
        const result = assembleCandidateSet(G1());
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.suggestions).toHaveLength(3);
        expect(result.suggestions.map((s) => s.tier)).toEqual([...INTENT_TIERS]);
        result.suggestions.forEach((s) => {
            expect(isValidatedSuggestion(s.suggestion)).toBe(true);
            expect(s.suggestion.candidateId).toMatch(/^pc_[0-9a-f]{10}$/);
            expect(s.suggestion.catalogVersion).toBe(catalog.catalogVersion);
            expect(s.optionId).toBe(s.option.optionId);
            expect(s.suggestion.spec.title).toBe(s.option.title);
        });
        expect(new Set(result.suggestions.map((s) => s.suggestion.candidateId)).size).toBe(3);
    });

    it('reports the final analysis cards, including those added as prerequisites', () => {
        const result = assembleCandidateSet(G1());
        if (!result.ok) throw new Error(result.reason);
        expect(result.suggestions.map((s) => s.analysisCardTypes)).toEqual([
            ['FORMAL_VERIFY', 'VISUALIZATION', 'FORMAL_VIZ'],
            ['FORMAL_VERIFY', 'SCENARIO_GENERATE', 'VISUALIZATION', 'FORMAL_VIZ', 'VERIFICATION_COMPARISON'],
            ['FORMAL_VERIFY', 'SCENARIO_GENERATE', 'PROMPT_GENERATE', 'TEST_GENERATE', 'VISUALIZATION', 'AEGIS', 'FORMAL_VIZ', 'TEST_EXECUTOR', 'VERIFICATION_COMPARISON'],
        ]);
    });

    it('orders by the tier labels of the intent contract, whatever the input order', () => {
        const [focused, balanced, comprehensive] = G1();
        const result = assembleCandidateSet([comprehensive, focused, balanced]);
        if (!result.ok) throw new Error(result.reason);
        expect(result.suggestions.map((s) => s.option.title)).toEqual([focused.title, balanced.title, comprehensive.title]);
    });

    it('preserves the model tiers and never relabels them by graph size', () => {
        // A "focused" option that is larger than the "comprehensive" one stays focused.
        const result = assembleCandidateSet([
            option('focused', ['SECURITY_REGRESSION', 'AEGIS']),
            option('balanced', ['FORMAL_VIZ']),
            option('comprehensive', ['VISUALIZATION']),
        ]);
        if (!result.ok) throw new Error(result.reason);
        const sizes = result.suggestions.map((s) => s.suggestion.spec.nodes.length);
        expect(sizes[0]).toBeGreaterThan(sizes[2]);
        expect(result.suggestions.map((s) => [s.tier, s.option.tier])).toEqual([
            ['focused', 'focused'],
            ['balanced', 'balanced'],
            ['comprehensive', 'comprehensive'],
        ]);
        expect(result.suggestions[0].analysisCardTypes).toEqual(['FORMAL_VERIFY', 'AEGIS', 'SECURITY_REGRESSION']);
    });

    it('preselects nothing and carries no recommendation flag', () => {
        const result = assembleCandidateSet(G1());
        if (!result.ok) throw new Error(result.reason);
        result.suggestions.forEach((s) => expect(Object.keys(s).sort()).toEqual(['analysisCardTypes', 'option', 'optionId', 'suggestion', 'tier']));
        expect(Object.keys(result).sort()).toEqual(['ok', 'suggestions']);
    });

    it('is deterministic and does not mutate the options', () => {
        const options = G1();
        const snapshot = JSON.stringify(options);
        const a = assembleCandidateSet(options);
        const b = assembleCandidateSet(options);
        expect(JSON.stringify(options)).toBe(snapshot);
        if (!a.ok || !b.ok) throw new Error('Expected success');
        expect(a.suggestions.map((s) => s.suggestion.candidateId)).toEqual(b.suggestions.map((s) => s.suggestion.candidateId));
        expect(Object.isFrozen(a.suggestions[0])).toBe(true);
        expect(a.suggestions[0].option).not.toBe(options[0]);
    });
});

describe('assembleCandidateSet — failures are typed and never partial', () => {
    it.each([
        ['no options', [] as ParsedIntentOption[], ['WRONG_OPTION_COUNT', 'MISSING_TIER', 'MISSING_TIER', 'MISSING_TIER']],
        ['two options', G1().slice(0, 2), ['WRONG_OPTION_COUNT', 'MISSING_TIER']],
        ['four options', [...G1(), option('balanced', ['AEGIS'])], ['WRONG_OPTION_COUNT', 'DUPLICATE_TIER']],
        ['a duplicated tier', [G1()[0], G1()[1], option('balanced', ['AEGIS'])], ['MISSING_TIER', 'DUPLICATE_TIER']],
    ])('rejects %s as INVALID_INTENT_SET', (_name, options, codes) => {
        const result = expectFailure(assembleCandidateSet(options));
        expect(result.reason).toBe('INVALID_INTENT_SET');
        expect(result.issues.map((i) => i.code).sort()).toEqual([...codes].sort());
    });

    it('never throws for malformed input', () => {
        [null, undefined, 'x', [null, null, null], [{}, {}, {}]].forEach((value) => {
            expect(() => assembleCandidateSet(value as unknown as ParsedIntentOption[])).not.toThrow();
            expect(assembleCandidateSet(value as unknown as ParsedIntentOption[]).ok).toBe(false);
        });
    });

    it('returns COMPOSITION_FAILED (not two suggestions) when one tier is too large', () => {
        const options = G1();
        options[2] = option('comprehensive', ['VISUALIZATION', 'AEGIS', 'TEST_EXECUTOR', 'SECURITY_REGRESSION']);
        const result = expectFailure(assembleCandidateSet(options));
        expect(result.reason).toBe('COMPOSITION_FAILED');
        expect(result.compositionFailures).toEqual([
            { tier: 'comprehensive', reason: 'COMPOSITION_TOO_LARGE', requested: ['VISUALIZATION', 'AEGIS', 'TEST_EXECUTOR', 'SECURITY_REGRESSION'] },
        ]);
        expect(result.retryFeedback).toEqual([
            'The comprehensive option [VISUALIZATION, AEGIS, TEST_EXECUTOR, SECURITY_REGRESSION] needs more than 16 cards. Choose fewer capabilities.',
        ]);
    });

    it('detects the G3-1 collision: different requests that expand to the same pipeline', () => {
        // From the intent spike: {SCENARIO_GENERATE, TEST_GENERATE} and {PROMPT_GENERATE, TEST_GENERATE}
        // are different intents (different optionIds) but compose to the same chain.
        const options = [
            option('focused', ['SCENARIO_GENERATE']),
            option('balanced', ['SCENARIO_GENERATE', 'TEST_GENERATE']),
            option('comprehensive', ['PROMPT_GENERATE', 'TEST_GENERATE']),
        ];
        expect(options[1].optionId).not.toBe(options[2].optionId);
        const result = expectFailure(assembleCandidateSet(options));
        expect(result.reason).toBe('INSUFFICIENT_DISTINCT');
        expect(result.collisions).toEqual([
            {
                tiers: ['balanced', 'comprehensive'],
                sameCandidate: true,
                sameAnalysisSet: true,
                analysisCardTypes: ['SCENARIO_GENERATE', 'PROMPT_GENERATE', 'TEST_GENERATE'],
            },
        ]);
        expect(result.issues.map((i) => i.code)).toEqual(['DUPLICATE_CANDIDATE']);
        expect(result.retryFeedback).toEqual([
            'The balanced and comprehensive options both expand to [SCENARIO_GENERATE, PROMPT_GENERATE, TEST_GENERATE] once prerequisites are added. ' +
                'Choose capabilities so that every option ends up with a different set.',
        ]);
    });

    it('detects the same final analysis cards even when the graphs differ', () => {
        // Injected composer: two different, individually valid wirings of System Visualization.
        const direct = (title: string): PipelineSpecV1 => ({
            specVersion: 1,
            title,
            summary: 'Includes System Visualization.',
            nodes: [
                { key: 'system_input', cardType: 'SYSTEM_INPUT' },
                { key: 'visualization', cardType: 'VISUALIZATION' },
            ],
            edges: [{ from: 'system_input', to: 'visualization' }],
        });
        const compose = (intent: ComposableIntent): ComposeResult => {
            if (intent.analysisCardTypes.includes('AEGIS')) return composePipeline(intent);
            if (intent.analysisCardTypes.includes('FORMAL_VIZ')) return composePipeline({ ...intent, analysisCardTypes: ['VISUALIZATION'] });
            const validated = validatePipelineSpec(direct(intent.title));
            if (!validated.valid) throw new Error('fixture must be valid');
            return { ok: true, spec: direct(intent.title), suggestion: validated.suggestion, analysisCardTypes: ['VISUALIZATION'] };
        };
        const result = expectFailure(
            assembleCandidateSet([option('focused', ['VISUALIZATION']), option('balanced', ['FORMAL_VIZ']), option('comprehensive', ['AEGIS'])], { compose })
        );
        expect(result.reason).toBe('INSUFFICIENT_DISTINCT');
        expect(result.collisions).toEqual([
            { tiers: ['focused', 'balanced'], sameCandidate: false, sameAnalysisSet: true, analysisCardTypes: ['VISUALIZATION'] },
        ]);
        expect(result.issues.map((i) => i.code)).toEqual(['DUPLICATE_ANALYSIS_SET']);
    });

    it('refuses suggestions that did not come from the validator', () => {
        const forged = (intent: ComposableIntent): ComposeResult => {
            const real = composePipeline(intent);
            if (!real.ok) return real;
            return { ...real, suggestion: { ...real.suggestion } };
        };
        const result = expectFailure(assembleCandidateSet(G1(), { compose: forged }));
        expect(result.reason).toBe('COMPOSITION_FAILED');
        expect(result.compositionFailures.map((f) => f.reason)).toEqual(['COMPOSITION_INVALID', 'COMPOSITION_INVALID', 'COMPOSITION_INVALID']);
    });

    it('keeps retry feedback at capability level (no titles, rationale or topology)', () => {
        const options = [
            option('focused', ['SCENARIO_GENERATE'], 'Secret title ghp_abc', 'Secret rationale with repo https://example.invalid'),
            option('balanced', ['SCENARIO_GENERATE', 'TEST_GENERATE'], 'Another title'),
            option('comprehensive', ['PROMPT_GENERATE', 'TEST_GENERATE'], 'Third title'),
        ];
        const collision = expectFailure(assembleCandidateSet(options));
        const tooLarge = expectFailure(
            assembleCandidateSet([options[0], option('balanced', ANALYSIS, 'Secret title ghp_abc'), options[2]])
        );
        [...collision.retryFeedback, ...tooLarge.retryFeedback].forEach((line) => {
            expect(line).not.toMatch(/Secret|ghp_|https?:|title/);
            expect(line).not.toMatch(/->|>|system_input|_compare|edge|node/i);
            expect(line.length).toBeLessThan(300);
        });
    });
});

describe('G1 architectural acceptance (intent JSON -> parser -> composer -> validator -> three suggestions)', () => {
    it('turns the frozen G1 intent fixture into three distinct, independently valid suggestions', () => {
        const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '__fixtures__', 'intent-response.valid.json'), 'utf8'));
        const parsed = parseIntentPlan({ version: 1, options: fixture.options }, catalog);
        expect(parsed.status).toBe('ok');
        const result = assembleCandidateSet(parsed.options ?? []);
        if (!result.ok) throw new Error(`${result.reason}: ${result.issues.map((i) => i.code).join(', ')}`);

        result.suggestions.forEach((s, i) => {
            const requested = fixture.options[i].analysisCardTypes as string[];
            expect(s.tier).toBe(fixture.options[i].tier);
            // Independent re-validation of the plain spec (no trust in the brand).
            const plain: PipelineSpecV1 = JSON.parse(JSON.stringify(s.suggestion.spec));
            const again = validatePipelineSpec(plain);
            expect(again.valid).toBe(true);
            expect(again.valid && again.suggestion.candidateId).toBe(s.suggestion.candidateId);
            expect(canonicalSignature(plain)).toBe(s.suggestion.signature);
            requested.forEach((type) => expect(plain.nodes.map((n) => n.cardType)).toContain(type));
            expect(plain.summary.startsWith('Includes ')).toBe(true);
            expect(plain.rationale).toBe(fixture.options[i].rationale);
            expect(JSON.stringify(plain)).not.toMatch(/"x"|"y"|position|config/);
        });
        // Focused requests Verification Visualization (adds Formal Verification): 6 cards; then 10 and 14 as in §2.
        expect(result.suggestions.map((s) => s.suggestion.spec.nodes.length)).toEqual([6, 10, 14]);
        expect(new Set(result.suggestions.map((s) => s.suggestion.candidateId)).size).toBe(3);
    });
});
