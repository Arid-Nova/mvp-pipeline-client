import fs from 'fs';
import path from 'path';
import { CardType, Connection, NodeData } from '../models';
import { CARD_CONFIG, REQUIRED_USER_CONFIG, RUNTIME_INTERACTION_HINTS, VALID_CONNECTIONS } from '../pipelineConfig';
import {
    APPLY_FAILURE_MESSAGES,
    ApplyError,
    MaterializedSuggestion,
    historyAfterApply,
    materializeSuggestion,
    pendingConfigurationFor,
} from './pipelineApplier';
import { buildPipelineCapabilityCatalog } from './pipelineCapabilities';
import { composePipeline } from './pipelineComposer';
import { layoutPipelineSpec } from './pipelineLayout';
import { PipelineSpecV1 } from './pipelineSpec';
import { ValidatedSuggestion, defaultValidationConfig, validatePipelineSpec } from './pipelineValidator';

const suggestionFor = (types: CardType[], title = 'Applier test'): ValidatedSuggestion => {
    const result = composePipeline({ title, analysisCardTypes: types });
    if (!result.ok) throw new Error(`Composition failed: ${result.reason}`);
    return result.suggestion;
};

const SIMPLE = (): ValidatedSuggestion => suggestionFor(['VISUALIZATION']);
const BALANCED_G1 = (): ValidatedSuggestion => suggestionFor(['VISUALIZATION', 'FORMAL_VIZ', 'VERIFICATION_COMPARISON']);
const POLICY_DRIFT = (): ValidatedSuggestion => suggestionFor(['SECURITY_REGRESSION', 'TEST_EXECUTOR']);

const sequentialIds = (prefix = 'id') => {
    let n = 0;
    return () => {
        n += 1;
        return `${prefix}-${n}`;
    };
};

const materialize = (suggestion: ValidatedSuggestion, prefix?: string): MaterializedSuggestion =>
    materializeSuggestion(suggestion, { generateId: sequentialIds(prefix) });

const applyError = (fn: () => unknown): ApplyError => {
    try {
        fn();
    } catch (error) {
        if (error instanceof ApplyError) return error;
        throw error;
    }
    throw new Error('Expected an ApplyError');
};

/** TEST ONLY: converts a materialized canvas graph back into a structural PipelineSpec. */
const canvasToSpec = (nodes: NodeData[], connections: Connection[]): PipelineSpecV1 => {
    const keyOf = new Map(nodes.map((node, i) => [node.id, `n${i}`]));
    return {
        specVersion: 1,
        title: 'Round trip',
        summary: 'Round trip.',
        nodes: nodes.map((node) => ({ key: keyOf.get(node.id) as string, cardType: node.type })),
        edges: connections.map((c) => ({ from: keyOf.get(c.source) as string, to: keyOf.get(c.target) as string })),
    };
};

describe('materializeSuggestion — nodes and connections', () => {
    it.each([
        ['simple', SIMPLE],
        ['Balanced G1', BALANCED_G1],
        ['Policy Drift', POLICY_DRIFT],
    ])('materializes exactly the validated graph (%s)', (_name, make) => {
        const suggestion = make();
        const { nodes, connections, addedNodeIds } = materialize(suggestion);
        const spec = suggestion.spec;

        expect(nodes.map((n) => n.type)).toEqual(spec.nodes.map((n) => n.cardType));
        expect(connections).toHaveLength(spec.edges.length);
        expect(addedNodeIds).toEqual(nodes.map((n) => n.id));

        const idFor = new Map(spec.nodes.map((n, i) => [n.key, nodes[i].id]));
        expect(connections.map((c) => [c.source, c.target])).toEqual(spec.edges.map((e) => [idFor.get(e.from), idFor.get(e.to)]));
        connections.forEach((c) => {
            const from = nodes.find((n) => n.id === c.source) as NodeData;
            const to = nodes.find((n) => n.id === c.target) as NodeData;
            expect(VALID_CONNECTIONS[from.type]).toContain(to.type);
        });
    });

    it('creates idle, empty, unconfigured cards at the layout positions', () => {
        const suggestion = BALANCED_G1();
        const { nodes } = materialize(suggestion);
        const layout = layoutPipelineSpec(suggestion.spec);

        nodes.forEach((node, i) => {
            expect(Object.keys(node).sort()).toEqual(['data', 'id', 'logs', 'status', 'type', 'x', 'y']);
            expect(node.data).toEqual({});
            expect(node.status).toBe('idle');
            expect(node.logs).toEqual([]);
            const position = layout.get(suggestion.spec.nodes[i].key);
            expect([node.x, node.y]).toEqual([position?.x, position?.y]);
        });
    });

    it('gives every logical key a fresh, unique canvas ID (never the logical key)', () => {
        const suggestion = POLICY_DRIFT();
        const { nodes, connections } = materializeSuggestion(suggestion); // production generator
        const ids = [...nodes.map((n) => n.id), ...connections.map((c) => c.id)];
        expect(new Set(ids).size).toBe(ids.length);
        const keys = new Set(suggestion.spec.nodes.map((n) => n.key));
        nodes.forEach((node) => expect(keys.has(node.id)).toBe(false));
        ids.forEach((id) => expect(id).toMatch(/^[a-z0-9]{1,9}$/));
    });

    it('uses an injected ID generator deterministically', () => {
        const a = materialize(BALANCED_G1(), 'x');
        const b = materialize(BALANCED_G1(), 'x');
        expect(b).toEqual(a);
        expect(a.nodes[0].id).toBe('x-1');
    });

    it('fails before producing anything when the generator repeats an ID', () => {
        let n = 0;
        const repeating = () => {
            n += 1;
            return n === 3 ? 'id-1' : `id-${n}`;
        };
        const error = applyError(() => materializeSuggestion(BALANCED_G1(), { generateId: repeating }));
        expect(error.reason).toBe('invalid');
    });

    it('creates no runtime configuration and no extra edges', () => {
        const { nodes, connections } = materialize(POLICY_DRIFT());
        expect(JSON.stringify(nodes)).not.toMatch(/systemName|repositories|targetUrl|payload|selectedLlm/);
        expect(connections).toHaveLength(POLICY_DRIFT().spec.edges.length);
    });

    it('keeps the base Formal Verification above the comparison one', () => {
        const suggestion = POLICY_DRIFT();
        const { nodes, connections } = materialize(suggestion);
        const regression = nodes.find((n) => n.type === 'SECURITY_REGRESSION') as NodeData;
        const upstream = connections.filter((c) => c.target === regression.id).map((c) => nodes.find((n) => n.id === c.source) as NodeData);
        expect(upstream.map((n) => n.type)).toEqual(['FORMAL_VERIFY', 'FORMAL_VERIFY']);
        const baseIndex = suggestion.spec.nodes.findIndex((n) => n.key === 'formal_verify');
        const compareIndex = suggestion.spec.nodes.findIndex((n) => n.key === 'formal_verify_compare');
        expect(nodes[baseIndex].y).toBeLessThan(nodes[compareIndex].y);
        // Exactly the runtime's rule (PipelinePage SECURITY_REGRESSION): sort upstream FVs on y.
        const [base] = [...upstream].sort((a, b) => a.y - b.y);
        expect(base.id).toBe(nodes[baseIndex].id);
    });

    it('does not mutate the suggestion and repeats with equivalent topology and layout', () => {
        const suggestion = POLICY_DRIFT();
        const snapshot = JSON.stringify(suggestion);
        const a = materialize(suggestion, 'a');
        const b = materialize(suggestion, 'b');
        expect(JSON.stringify(suggestion)).toBe(snapshot);
        const strip = (m: MaterializedSuggestion) => ({
            nodes: m.nodes.map(({ type, x, y }) => ({ type, x, y })),
            edges: m.connections.map((c) => [m.addedNodeIds.indexOf(c.source), m.addedNodeIds.indexOf(c.target)]),
        });
        expect(strip(b)).toEqual(strip(a));
    });
});

describe('materializeSuggestion — trust checks', () => {
    it('accepts the current catalogVersion', () => {
        expect(SIMPLE().catalogVersion).toBe(buildPipelineCapabilityCatalog().catalogVersion);
        expect(() => materialize(SIMPLE())).not.toThrow();
    });

    it('rejects a genuinely validated suggestion made under an older catalog', () => {
        const stale = validatePipelineSpec(SIMPLE().spec, { ...defaultValidationConfig(), catalogVersion: 'pcat-older' });
        if (!stale.valid) throw new Error('fixture must validate');
        expect(applyError(() => materializeSuggestion(stale.suggestion)).reason).toBe('catalog_mismatch');
    });

    it('rejects a suggestion from a different catalog version', () => {
        const error = applyError(() => materializeSuggestion(SIMPLE(), { currentCatalogVersion: () => 'pcat-newer' }));
        expect(error.reason).toBe('catalog_mismatch');
    });

    it('re-validates against the live rules and rejects a graph they no longer allow', () => {
        const stricter = () => ({
            ...defaultValidationConfig(),
            validConnections: { ...defaultValidationConfig().validConnections, IR_HOLDER: ['AEGIS'] },
        });
        const error = applyError(() => materializeSuggestion(SIMPLE(), { validationConfig: stricter }));
        expect(error.reason).toBe('invalid');
        expect(error.detail).toContain('ILLEGAL_CONNECTION');
    });

    it('rejects forged or cast objects, even with a valid-looking spec', () => {
        const real = SIMPLE();
        const forged = { spec: real.spec, signature: real.signature, candidateId: real.candidateId, catalogVersion: real.catalogVersion };
        expect(applyError(() => materializeSuggestion(forged as unknown as ValidatedSuggestion)).reason).toBe('invalid');
        expect(applyError(() => materializeSuggestion(JSON.parse(JSON.stringify(real)))).reason).toBe('invalid');
    });

    it('maps reasons to fixed, safe messages', () => {
        Object.values(APPLY_FAILURE_MESSAGES).forEach((message) => expect(message).not.toMatch(/ILLEGAL|Error|undefined/));
    });

    it('knows nothing about how the suggestion was planned', () => {
        const source = ['pipelineApplier.ts', 'pipelineLayout.ts']
            .map((file) => fs.readFileSync(path.join(__dirname, file), 'utf8'))
            .join('\n')
            .replace(/\/\*[\s\S]*?\*\//g, '');
        expect(source).not.toMatch(/llama|prompt|attempt|rejectionFeedback|PipelineIntentOption|\/chatbot\/|goal|focused|balanced|comprehensive|composePipeline|assembleCandidateSet/i);
        expect(source).not.toMatch(/window\.confirm|saveSession|runPipeline|clearPipeline|Date\.now/);
    });
});

describe('pendingConfigurationFor', () => {
    it('lists required configuration, then runtime hints, from the live config, once per card type', () => {
        const { nodes, pendingConfiguration } = materialize(suggestionFor(['TEST_EXECUTOR', 'CHANGE_IMPACT']));
        const types = new Set(nodes.map((n) => n.type));
        expect(types.has('SYSTEM_INPUT')).toBe(true);
        expect(pendingConfiguration).toEqual([
            {
                cardType: 'SYSTEM_INPUT',
                cardTitle: CARD_CONFIG.SYSTEM_INPUT.title,
                kind: 'before_run',
                hint: REQUIRED_USER_CONFIG.SYSTEM_INPUT?.hint,
                cardCount: 2, // base and comparison System Source, guided once
            },
            { cardType: 'PROMPT_GENERATE', cardTitle: CARD_CONFIG.PROMPT_GENERATE.title, kind: 'during_run', hint: RUNTIME_INTERACTION_HINTS.PROMPT_GENERATE, cardCount: 1 },
            { cardType: 'TEST_EXECUTOR', cardTitle: CARD_CONFIG.TEST_EXECUTOR.title, kind: 'during_run', hint: RUNTIME_INTERACTION_HINTS.TEST_EXECUTOR, cardCount: 1 },
        ]);
    });

    it('excludes card types that were not created', () => {
        const { pendingConfiguration } = materialize(SIMPLE());
        expect(pendingConfiguration.map((p) => p.cardType)).toEqual(['SYSTEM_INPUT']);
        expect(pendingConfigurationFor(['VISUALIZATION', 'AEGIS'])).toEqual([]);
        expect(pendingConfigurationFor(['UPLOAD_IR'])).toEqual([
            { cardType: 'UPLOAD_IR', cardTitle: 'Load Snapshot', kind: 'before_run', hint: REQUIRED_USER_CONFIG.UPLOAD_IR?.hint, cardCount: 1 },
        ]);
    });

    it('is deterministic and de-duplicated', () => {
        const types: CardType[] = ['SYSTEM_INPUT', 'TEST_EXECUTOR', 'SYSTEM_INPUT', 'TEST_EXECUTOR'];
        expect(pendingConfigurationFor(types)).toEqual(pendingConfigurationFor(types));
        expect(pendingConfigurationFor(types)).toHaveLength(2);
    });
});

describe('materialized graph round trip (test-only conversion)', () => {
    it.each([
        ['simple', SIMPLE],
        ['Balanced G1', BALANCED_G1],
        ['Policy Drift', POLICY_DRIFT],
    ])('canvas → spec validates again with the same signature (%s)', (_name, make) => {
        const suggestion = make();
        const { nodes, connections } = materialize(suggestion);
        const result = validatePipelineSpec(canvasToSpec(nodes, connections));
        expect(result.valid).toBe(true);
        expect(result.valid && result.suggestion.candidateId).toBe(suggestion.candidateId);
    });
});

describe('historyAfterApply', () => {
    const empty = { nodes: [], connections: [] };
    const graph = (id: string) => ({ nodes: [{ id, type: 'AEGIS' as CardType, x: 0, y: 0, data: {}, status: 'idle' as const, logs: [] }], connections: [] });

    it('adds only the applied state when the current entry already equals the empty canvas', () => {
        const result = historyAfterApply([empty], 0, empty, graph('g'), 10);
        expect(result.history).toEqual([empty, graph('g')]);
        expect(result.historyIndex).toBe(1);
    });

    it('records the real pre-apply canvas first when the current entry is stale', () => {
        const result = historyAfterApply([empty, graph('old')], 1, empty, graph('g'), 10);
        expect(result.history).toEqual([empty, graph('old'), empty, graph('g')]);
        expect(result.history[result.historyIndex - 1]).toEqual(empty);
    });

    it('drops the redo branch and respects the history limit', () => {
        const long = Array.from({ length: 10 }, (_, i) => graph(`h${i}`));
        const result = historyAfterApply(long, 4, empty, graph('g'), 10);
        expect(result.history.map((s) => s.nodes[0]?.id ?? 'empty')).toEqual(['h0', 'h1', 'h2', 'h3', 'h4', 'empty', 'g']);
        const full = historyAfterApply(long, 9, empty, graph('g'), 10);
        expect(full.history).toHaveLength(10);
        expect(full.historyIndex).toBe(9);
        expect(full.history[8]).toEqual(empty);
    });

    it('copies snapshots instead of sharing arrays with live state', () => {
        const applied = graph('g');
        const result = historyAfterApply([empty], 0, empty, applied, 10);
        expect(result.history[1].nodes).not.toBe(applied.nodes);
    });
});
