/**
 * Deterministic structural pipeline validator (P60-M1-003).
 *
 * Checks a PipelineSpecV1 against the real pipeline rules: CARD_CONFIG card types,
 * VALID_CONNECTIONS, CARD_INPUT_REQUIREMENTS, INPUT_CARD_TYPES and the analysis categories.
 * It is the independent safety net behind the deterministic composer (P60-M1-017/018) and the
 * re-check inside the canvas applier (P60-M1-007). It is pure: no React, no network, no Date,
 * no Math.random, and it never imports the composer.
 *
 * STRUCTURAL ONLY. It does not check repositories, System Source values, uploaded IRs, model or
 * service availability, credentials, REQUIRED_USER_CONFIG or RUNTIME_INTERACTION_HINTS, and it
 * does not predict whether a run will succeed (D8).
 *
 * Rules (stable codes; every detectable issue is reported, not just the first):
 *   UNKNOWN_CARD_TYPE        cardType is not a key of CARD_CONFIG
 *   DUPLICATE_NODE_KEY       two nodes share a key (the first one is used for graph checks)
 *   EDGE_UNKNOWN_NODE        an edge endpoint doesn't match a node key
 *   SELF_LOOP                from === to
 *   DUPLICATE_EDGE           the same (from, to) pair twice
 *   ILLEGAL_CONNECTION       to.cardType is not in VALID_CONNECTIONS[from.cardType]
 *   CYCLE                    the graph is not a DAG
 *   MISSING_INPUT            no node of an INPUT_CARD_TYPES type
 *   INPUT_WITHOUT_OUTPUT     an input node with no outgoing edge
 *   MISSING_UPSTREAM         a non-input node with no incoming edge
 *   UNREACHABLE_NODE         a node not reachable from any input (runPipeline starts from inputs)
 *   NOT_CONNECTED            more than one weakly connected component
 *   INPUT_REQUIREMENT_UNMET  a CARD_INPUT_REQUIREMENTS rule fails (requiresAllOf, exactUpstreamCount, maxIncoming)
 *   NO_ANALYSIS_CARD         no card of an ANALYSIS_CATEGORIES category
 *   SIZE_LIMIT               nodes outside MIN_NODES..MAX_NODES or more than MAX_EDGES edges
 *
 * Identity: `signature` is a canonical, key-, order- and text-independent description of the
 * graph (card-type multiset, card-type edge multiset and Weisfeiler-Lehman neighbourhood
 * labels); `candidateId` = "pc_" + 10 hex characters of its stable hash.
 */
import {
    ANALYSIS_CATEGORIES,
    CARD_CONFIG,
    CARD_INPUT_REQUIREMENTS,
    CATEGORIES,
    CardInputRequirement,
    INPUT_CARD_TYPES,
    VALID_CONNECTIONS,
} from '../pipelineConfig';
import { buildPipelineCapabilityCatalog } from './pipelineCapabilities';
import { PipelineSpecV1, SpecIssue } from './pipelineSpec';
import { hashString, stableStringify } from './stableHash';

export const MIN_NODES = 2;
export const MAX_NODES = 16;
export const MAX_EDGES = 24;

export interface ValidationConfig {
    cardTypes: ReadonlySet<string>;
    validConnections: Readonly<Record<string, readonly string[]>>;
    inputRequirements: Readonly<Partial<Record<string, CardInputRequirement>>>;
    inputCardTypes: readonly string[];
    analysisCardTypes: ReadonlySet<string>;
    catalogVersion: string;
    minNodes: number;
    maxNodes: number;
    maxEdges: number;
}

const analysisTypesFrom = (categories: Record<string, readonly string[]>, analysisCategories: readonly string[]) =>
    new Set(analysisCategories.flatMap((category) => categories[category] ?? []));

let defaultConfig: ValidationConfig | null = null;

/** The real repository rules. Built lazily once; the catalog version comes from P60-M1-001. */
export const defaultValidationConfig = (): ValidationConfig => {
    if (!defaultConfig) {
        defaultConfig = {
            cardTypes: new Set(Object.keys(CARD_CONFIG)),
            validConnections: VALID_CONNECTIONS,
            inputRequirements: CARD_INPUT_REQUIREMENTS,
            inputCardTypes: INPUT_CARD_TYPES,
            analysisCardTypes: analysisTypesFrom(CATEGORIES, ANALYSIS_CATEGORIES),
            catalogVersion: buildPipelineCapabilityCatalog().catalogVersion,
            minNodes: MIN_NODES,
            maxNodes: MAX_NODES,
            maxEdges: MAX_EDGES,
        };
    }
    return defaultConfig;
};

// ---------------------------------------------------------------------------------------------
// ValidatedSuggestion trust boundary
// ---------------------------------------------------------------------------------------------

declare const VALIDATED: unique symbol;

/**
 * A PipelineSpec that passed validatePipelineSpec. The brand uses a symbol that is not exported,
 * so no other module can write an object literal of this type; values are also registered in a
 * module-private WeakSet so `isValidatedSuggestion` can reject look-alikes (e.g. parsed JSON).
 * The contained spec is a deep-frozen copy.
 */
export interface ValidatedSuggestion {
    readonly [VALIDATED]: true;
    readonly spec: Readonly<PipelineSpecV1>;
    readonly signature: string;
    readonly candidateId: string;
    readonly catalogVersion: string;
}

const issued = new WeakSet<object>();

/** True only for objects created by validatePipelineSpec in this JavaScript realm. */
export const isValidatedSuggestion = (value: unknown): value is ValidatedSuggestion =>
    typeof value === 'object' && value !== null && issued.has(value);

const deepFreeze = <T>(value: T): T => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value as Record<string, unknown>).forEach(deepFreeze);
        Object.freeze(value);
    }
    return value;
};

const copySpec = (spec: PipelineSpecV1): PipelineSpecV1 => {
    const copy: PipelineSpecV1 = {
        specVersion: 1,
        title: spec.title,
        summary: spec.summary,
        nodes: spec.nodes.map((node) => ({ key: node.key, cardType: node.cardType })),
        edges: spec.edges.map((edge) => ({ from: edge.from, to: edge.to })),
    };
    if (spec.rationale !== undefined) copy.rationale = spec.rationale;
    return copy;
};

// ---------------------------------------------------------------------------------------------
// Canonical signature
// ---------------------------------------------------------------------------------------------

const WL_ROUNDS = 3;

/**
 * Canonical description of the graph, independent of node keys, node/edge order, title, summary
 * and rationale. Weisfeiler-Lehman refinement makes it sensitive to how card types are wired,
 * not just to which card types and edge type-pairs occur.
 */
export const canonicalSignature = (spec: Pick<PipelineSpecV1, 'nodes' | 'edges'>): string => {
    const typeOf = new Map<string, string>();
    spec.nodes.forEach((node) => {
        if (!typeOf.has(node.key)) typeOf.set(node.key, node.cardType);
    });
    const keys = Array.from(typeOf.keys());
    const edgeIds = new Set<string>();
    const edges: [string, string][] = [];
    spec.edges.forEach((edge) => {
        const id = `${edge.from}\u0000${edge.to}`;
        if (typeOf.has(edge.from) && typeOf.has(edge.to) && !edgeIds.has(id)) {
            edgeIds.add(id);
            edges.push([edge.from, edge.to]);
        }
    });
    let labels = new Map(keys.map((key) => [key, typeOf.get(key) as string]));
    for (let round = 0; round < WL_ROUNDS; round += 1) {
        const current = labels;
        const next = new Map<string, string>();
        for (const key of keys) {
            const ins = edges.filter(([, to]) => to === key).map(([from]) => current.get(from)).sort();
            const outs = edges.filter(([from]) => from === key).map(([, to]) => current.get(to)).sort();
            next.set(key, hashString(`${current.get(key)}|in:${ins.join(',')}|out:${outs.join(',')}`));
        }
        labels = next;
    }
    return stableStringify({
        v: 1,
        nodeTypes: keys.map((key) => typeOf.get(key)).sort(),
        edgeTypes: edges.map(([from, to]) => `${typeOf.get(from)}>${typeOf.get(to)}`).sort(),
        wl: keys.map((key) => labels.get(key)).sort(),
    });
};

export const candidateIdFor = (signature: string): string => `pc_${hashString(signature).slice(0, 10)}`;

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

export type ValidationResult =
    | { valid: true; suggestion: ValidatedSuggestion; issues: [] }
    | { valid: false; issues: SpecIssue[] };

const issue = (code: string, message: string, path?: string): SpecIssue => (path ? { code, message, path } : { code, message });

const runRules = (spec: PipelineSpecV1, config: ValidationConfig): SpecIssue[] => {
    const issues: SpecIssue[] = [];
    // Messages only ever name catalog card types, never arbitrary spec text.
    const label = (cardType: string | undefined) => (cardType !== undefined && config.cardTypes.has(cardType) ? cardType : 'An unknown card');

    // Nodes
    const typeOf = new Map<string, string>();
    spec.nodes.forEach((node, i) => {
        if (!config.cardTypes.has(node.cardType)) {
            // The value is not echoed: it may be arbitrary text.
            issues.push(issue('UNKNOWN_CARD_TYPE', 'Card type is not in the catalog.', `nodes[${i}].cardType`));
        }
        if (typeOf.has(node.key)) {
            issues.push(issue('DUPLICATE_NODE_KEY', `A node key is used more than once (${label(node.cardType)}).`, `nodes[${i}].key`));
        } else {
            typeOf.set(node.key, node.cardType);
        }
    });
    const keys = Array.from(typeOf.keys());

    // Edges
    const seen = new Set<string>();
    const graph: [string, string][] = [];
    spec.edges.forEach((edge, i) => {
        const path = `edges[${i}]`;
        if (!typeOf.has(edge.from) || !typeOf.has(edge.to)) {
            issues.push(issue('EDGE_UNKNOWN_NODE', 'Edge endpoint does not match a node key.', path));
            return;
        }
        const fromType = typeOf.get(edge.from) as string;
        const toType = typeOf.get(edge.to) as string;
        if (edge.from === edge.to) {
            issues.push(issue('SELF_LOOP', `${label(fromType)} is connected to itself.`, path));
            return;
        }
        const id = `${edge.from}\u0000${edge.to}`;
        if (seen.has(id)) {
            issues.push(issue('DUPLICATE_EDGE', `${label(fromType)} -> ${label(toType)} appears more than once.`, path));
            return;
        }
        seen.add(id);
        if (config.cardTypes.has(fromType) && config.cardTypes.has(toType) && !(config.validConnections[fromType] ?? []).includes(toType)) {
            issues.push(issue('ILLEGAL_CONNECTION', `${fromType} cannot connect to ${toType}.`, path));
        }
        graph.push([edge.from, edge.to]);
    });

    const incoming = new Map(keys.map((key) => [key, [] as string[]]));
    const outgoing = new Map(keys.map((key) => [key, [] as string[]]));
    graph.forEach(([from, to]) => {
        (outgoing.get(from) as string[]).push(to);
        (incoming.get(to) as string[]).push(from);
    });

    // Cycle (Kahn)
    const indegree = new Map(keys.map((key) => [key, (incoming.get(key) as string[]).length]));
    const queue = keys.filter((key) => indegree.get(key) === 0);
    let visited = 0;
    while (queue.length) {
        const key = queue.shift() as string;
        visited += 1;
        (outgoing.get(key) as string[]).forEach((to) => {
            indegree.set(to, (indegree.get(to) as number) - 1);
            if (indegree.get(to) === 0) queue.push(to);
        });
    }
    if (visited < keys.length) issues.push(issue('CYCLE', 'The pipeline contains a cycle.'));

    // Inputs, upstream, reachability
    const isInput = (key: string) => config.inputCardTypes.includes(typeOf.get(key) as string);
    const inputs = keys.filter(isInput);
    if (inputs.length === 0) issues.push(issue('MISSING_INPUT', `No input card (${config.inputCardTypes.join(' or ')}).`));
    inputs.forEach((key) => {
        if ((outgoing.get(key) as string[]).length === 0) {
            issues.push(issue('INPUT_WITHOUT_OUTPUT', `${label(typeOf.get(key))} has no outgoing connection.`, `node:${key}`));
        }
    });
    keys.filter((key) => !isInput(key)).forEach((key) => {
        if ((incoming.get(key) as string[]).length === 0) {
            issues.push(issue('MISSING_UPSTREAM', `${label(typeOf.get(key))} has no incoming connection.`, `node:${key}`));
        }
    });
    if (inputs.length > 0) {
        const reached = new Set(inputs);
        const frontier = [...inputs];
        while (frontier.length) {
            const key = frontier.shift() as string;
            (outgoing.get(key) as string[]).forEach((to) => {
                if (!reached.has(to)) {
                    reached.add(to);
                    frontier.push(to);
                }
            });
        }
        keys.filter((key) => !reached.has(key)).forEach((key) => {
            issues.push(issue('UNREACHABLE_NODE', `${label(typeOf.get(key))} is not reachable from an input card.`, `node:${key}`));
        });
    }

    // Weak connectivity
    if (keys.length > 0) {
        const component = new Set([keys[0]]);
        const frontier = [keys[0]];
        while (frontier.length) {
            const key = frontier.shift() as string;
            [...(outgoing.get(key) as string[]), ...(incoming.get(key) as string[])].forEach((other) => {
                if (!component.has(other)) {
                    component.add(other);
                    frontier.push(other);
                }
            });
        }
        if (component.size < keys.length) issues.push(issue('NOT_CONNECTED', 'The pipeline has more than one disconnected part.'));
    }

    // Structural input requirements
    keys.forEach((key) => {
        const cardType = typeOf.get(key) as string;
        const requirement = config.inputRequirements[cardType];
        if (!requirement) return;
        const upstreamTypes = (incoming.get(key) as string[]).map((from) => typeOf.get(from) as string);
        if (requirement.maxIncoming !== undefined && upstreamTypes.length > requirement.maxIncoming) {
            issues.push(issue('INPUT_REQUIREMENT_UNMET', `${cardType} accepts at most ${requirement.maxIncoming} incoming connection(s).`, `node:${key}`));
        }
        requirement.requiresAllOf?.forEach((group) => {
            if (!upstreamTypes.some((type) => (group as string[]).includes(type))) {
                issues.push(issue('INPUT_REQUIREMENT_UNMET', `${cardType} needs an incoming connection from ${group.join(' or ')}.`, `node:${key}`));
            }
        });
        if (requirement.exactUpstreamCount) {
            const { type, count } = requirement.exactUpstreamCount;
            const actual = upstreamTypes.filter((upstream) => upstream === type).length;
            if (actual !== count) {
                issues.push(issue('INPUT_REQUIREMENT_UNMET', `${cardType} needs exactly ${count} ${type} inputs (has ${actual}).`, `node:${key}`));
            }
        }
    });

    // Analysis card and size
    if (!spec.nodes.some((node) => config.analysisCardTypes.has(node.cardType))) {
        issues.push(issue('NO_ANALYSIS_CARD', 'The pipeline has no analysis card.'));
    }
    if (spec.nodes.length < config.minNodes || spec.nodes.length > config.maxNodes || spec.edges.length > config.maxEdges) {
        issues.push(
            issue(
                'SIZE_LIMIT',
                `Pipelines need ${config.minNodes}..${config.maxNodes} cards and at most ${config.maxEdges} connections ` +
                    `(has ${spec.nodes.length} cards, ${spec.edges.length} connections).`
            )
        );
    }
    return issues;
};

/** Validates the structure of a PipelineSpecV1 against the pipeline rules. Pure and deterministic. */
export const validatePipelineSpec = (spec: PipelineSpecV1, config: ValidationConfig = defaultValidationConfig()): ValidationResult => {
    const issues = runRules(spec, config);
    if (issues.length > 0) return { valid: false, issues };
    const frozen = deepFreeze(copySpec(spec));
    const signature = canonicalSignature(frozen);
    const suggestion = Object.freeze({
        spec: frozen,
        signature,
        candidateId: candidateIdFor(signature),
        catalogVersion: config.catalogVersion,
    }) as unknown as ValidatedSuggestion;
    issued.add(suggestion);
    return { valid: true, suggestion, issues: [] };
};

/**
 * Short, de-duplicated, model-readable descriptions of validation failures: issue codes plus card
 * types only. No node keys, paths, titles or other free text from the spec.
 */
export const describeIssuesForRetry = (issues: readonly SpecIssue[]): string[] => {
    const safe = (message: string) => message.replace(/[^A-Za-z0-9_ .,()>|-]/g, '').slice(0, 160);
    const lines = issues.map((item) => `${item.code}: ${safe(item.message)}`);
    return Array.from(new Set(lines)).slice(0, 12);
};
