/**
 * Deterministic pipeline composer (P60-M1-017 core, P60-M1-018 two-snapshot recipes).
 *
 *   accepted intent option (analysis capabilities only)
 *     -> composePipeline()  (this module: ALL topology decisions)
 *     -> PipelineSpecV1
 *     -> parsePipelineSpec() and the independent validatePipelineSpec()
 *     -> success only if both accept it (fails closed)
 *
 * The language model contributes no topology (D11). The input type has no field for nodes, edges,
 * prerequisites, coordinates or configuration; only title, rationale and the analysis capability
 * IDs are read, and title/rationale never influence the graph.
 *
 * Sources of truth (no copied connection matrix):
 *   VALID_CONNECTIONS, CARD_INPUT_REQUIREMENTS, INPUT_CARD_TYPES, the capability catalog, and
 *   PIPELINE_TEMPLATES (the canonical way each analysis is fed in this repository).
 *
 * Composition rules:
 *   1. Targets = the requested analysis capabilities, in catalog order.
 *   2. Recipe for a target, first that applies:
 *      a. TEMPLATE: the target's ancestor closure in the FIRST template (PIPELINE_TEMPLATES order)
 *         that contains it. For two-snapshot targets, the template named in TWO_SNAPSHOT_RECIPES.
 *      b. REQUIREMENTS: for a target in no template, the union of the recipes of the first type of
 *         each CARD_INPUT_REQUIREMENTS `requiresAllOf` group, plus an edge from each to the target.
 *      c. PATH: the shortest legal VALID_CONNECTIONS path from an input card (INPUT_CARD_TYPES
 *         order), exploring next cards in catalog order.
 *      Tie-breaking is therefore: canonical template > explicit requirements > fewest added cards,
 *      with catalog order breaking any remaining tie. Nothing is random.
 *   3. Nodes are merged by (namespace, cardType): every target shares one base snapshot chain
 *      (one SYSTEM_INPUT -> MULTI_REPO -> IR_HOLDER, one COMPONENT_GENERATE -> COMPONENT_HOLDER, ...).
 *      Edges are unioned.
 *   4. Required structure: any unmet `requiresAllOf` group is satisfied by rule 2b (fixpoint).
 *   5. No optional enrichment edges (e.g. FORMAL_VERIFY -> SCENARIO_GENERATE filtering).
 *   6. Size: more than the validator's node or edge limit -> COMPOSITION_TOO_LARGE (never truncated).
 *   7. Output order: topological, base namespace before comparison namespace, then catalog order.
 *      Edges sorted by (source position, target position). Keys: lowercase card type, with a
 *      `_compare` suffix in the comparison namespace (e.g. formal_verify, formal_verify_compare).
 *   8. Summary is generated here from catalog titles; the model is never asked for it.
 *   9. Fail closed: the spec must pass parsePipelineSpec and validatePipelineSpec and contain every
 *      requested capability, otherwise COMPOSITION_INVALID. An invalid graph never leaves here.
 *
 * Two-snapshot recipes (P60-M1-018) — why they are special:
 *   - CHANGE_IMPACT compares a base IR with a *different* target System Source
 *     (PipelinePage processNextNodes CHANGE_IMPACT: base MULTI_REPO/IR_HOLDER AND a SYSTEM_INPUT).
 *     Generic sharing would wire the base snapshot's own System Source in as the "target".
 *   - SECURITY_REGRESSION needs EXACTLY two FORMAL_VERIFY inputs with different roles; the runtime
 *     picks base vs PR by y order (`fvNodes.sort((a, b) => a.y - b.y)`). Generic sharing would
 *     collapse both into one FORMAL_VERIFY. The base chain is emitted first, so the layout step
 *     (P60-M1-007) places it higher.
 *   Their recipe graphs still come from the templates; the table only marks which template nodes
 *   belong to the comparison snapshot. The comparison namespace is shared between the two, since
 *   both compare against the same other version.
 */
import { CardType } from '../models';
import { CARD_INPUT_REQUIREMENTS, CardInputRequirement, INPUT_CARD_TYPES, VALID_CONNECTIONS } from '../pipelineConfig';
import { PIPELINE_TEMPLATES, PipelineTemplate } from '../configs/PipelineTemplates';
import { ContractIssue } from './contractIssue';
import { ParsedIntentOption } from './intentPlan';
import { PipelineCapabilityCatalog, buildPipelineCapabilityCatalog } from './pipelineCapabilities';
import { PipelineSpecV1, parsePipelineSpec } from './pipelineSpec';
import { ValidatedSuggestion, ValidationConfig, defaultValidationConfig, validatePipelineSpec } from './pipelineValidator';

/** What the composer reads from an intent option. There is deliberately no graph input. */
export type ComposableIntent = Readonly<Pick<ParsedIntentOption, 'title' | 'rationale' | 'analysisCardTypes'>>;

export type ComposeFailureReason = 'COMPOSITION_TOO_LARGE' | 'COMPOSITION_UNSUPPORTED' | 'COMPOSITION_INVALID';

export type ComposeResult =
    | { ok: true; spec: PipelineSpecV1; suggestion: ValidatedSuggestion; analysisCardTypes: CardType[] }
    | { ok: false; reason: ComposeFailureReason; issues: ContractIssue[] };

export interface TwoSnapshotRecipe {
    cardType: CardType;
    templateId: string;
    /** Template node keys that belong to the comparison snapshot; all others are the base snapshot. */
    comparisonKeys: readonly string[];
    reason: string;
}

export const TWO_SNAPSHOT_RECIPES: readonly TwoSnapshotRecipe[] = [
    {
        cardType: 'CHANGE_IMPACT',
        templateId: 'change-impact-analysis',
        comparisonKeys: ['sys2'],
        reason: 'Needs a base IR and a different target System Source (processNextNodes CHANGE_IMPACT).',
    },
    {
        cardType: 'SECURITY_REGRESSION',
        templateId: 'policy-drift-comparison',
        comparisonKeys: ['sys2', 'repo2', 'ir2', 'fv2'],
        reason: 'Needs exactly two FORMAL_VERIFY inputs; base vs PR is chosen by y order (processNextNodes SECURITY_REGRESSION).',
    },
];

export interface ComposerFacts {
    catalog: PipelineCapabilityCatalog;
    validConnections: Readonly<Record<string, readonly string[]>>;
    inputRequirements: Readonly<Partial<Record<string, CardInputRequirement>>>;
    inputCardTypes: readonly string[];
    templates: readonly Pick<PipelineTemplate, 'id' | 'nodes' | 'connections'>[];
    twoSnapshotRecipes: readonly TwoSnapshotRecipe[];
    validation: ValidationConfig;
}

let defaultFacts: ComposerFacts | null = null;

export const defaultComposerFacts = (): ComposerFacts => {
    if (!defaultFacts) {
        defaultFacts = {
            catalog: buildPipelineCapabilityCatalog(),
            validConnections: VALID_CONNECTIONS,
            inputRequirements: CARD_INPUT_REQUIREMENTS,
            inputCardTypes: INPUT_CARD_TYPES,
            templates: PIPELINE_TEMPLATES,
            twoSnapshotRecipes: TWO_SNAPSHOT_RECIPES,
            validation: defaultValidationConfig(),
        };
    }
    return defaultFacts;
};

// ---------------------------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------------------------

type Namespace = 'base' | 'compare';
const NAMESPACES: Namespace[] = ['base', 'compare'];

interface RecipeNode {
    namespace: Namespace;
    cardType: string;
}

/** A partial graph keyed by merge key `${namespace}:${cardType}`. */
interface Recipe {
    nodes: Map<string, RecipeNode>;
    edges: Set<string>; // `${fromMergeKey}|${toMergeKey}`
}

export type RecipeSource = 'template' | 'requirements' | 'path';

const mergeKey = (namespace: Namespace, cardType: string) => `${namespace}:${cardType}`;
const emptyRecipe = (): Recipe => ({ nodes: new Map(), edges: new Set() });

const unionInto = (target: Recipe, source: Recipe) => {
    source.nodes.forEach((node, key) => target.nodes.set(key, node));
    source.edges.forEach((edge) => target.edges.add(edge));
};

class RecipeError extends Error {
    constructor(readonly code: string, message: string) {
        super(message);
    }
}

const templateRecipe = (cardType: string, facts: ComposerFacts): Recipe | null => {
    const twoSnapshot = facts.twoSnapshotRecipes.find((recipe) => recipe.cardType === cardType);
    const template = twoSnapshot
        ? facts.templates.find((t) => t.id === twoSnapshot.templateId)
        : facts.templates.find((t) => t.nodes.some((node) => node.type === cardType));
    if (!template) return null;
    const target = template.nodes.find((node) => node.type === cardType);
    if (!target) throw new RecipeError('BROKEN_TWO_SNAPSHOT_RECIPE', `Template ${template.id} has no ${cardType}.`);

    const ancestors = new Set([target.tempId]);
    let grew = true;
    while (grew) {
        grew = false;
        for (const conn of template.connections) {
            if (ancestors.has(conn.targetTempId) && !ancestors.has(conn.sourceTempId)) {
                ancestors.add(conn.sourceTempId);
                grew = true;
            }
        }
    }

    const recipe = emptyRecipe();
    const keyOf = new Map<string, string>();
    template.nodes
        .filter((node) => ancestors.has(node.tempId))
        .forEach((node) => {
            const namespace: Namespace = twoSnapshot?.comparisonKeys.includes(node.tempId) ? 'compare' : 'base';
            const key = mergeKey(namespace, node.type);
            if (recipe.nodes.has(key)) {
                throw new RecipeError(
                    'AMBIGUOUS_TEMPLATE_RECIPE',
                    `Template ${template.id} feeds ${cardType} with two ${node.type} cards; it needs a two-snapshot recipe.`
                );
            }
            recipe.nodes.set(key, { namespace, cardType: node.type });
            keyOf.set(node.tempId, key);
        });
    template.connections
        .filter((conn) => ancestors.has(conn.sourceTempId) && ancestors.has(conn.targetTempId))
        .forEach((conn) => recipe.edges.add(`${keyOf.get(conn.sourceTempId)}|${keyOf.get(conn.targetTempId)}`));
    return recipe;
};

const pathRecipe = (cardType: string, facts: ComposerFacts): Recipe | null => {
    const order = facts.catalog.cards.map((card) => card.cardType as string);
    const sortByCatalog = (types: readonly string[]) => [...types].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    for (const input of facts.inputCardTypes) {
        const previous = new Map<string, string | null>([[input, null]]);
        const frontier = [input];
        while (frontier.length && !previous.has(cardType)) {
            const current = frontier.shift() as string;
            sortByCatalog(facts.validConnections[current] ?? []).forEach((next) => {
                if (!previous.has(next)) {
                    previous.set(next, current);
                    frontier.push(next);
                }
            });
        }
        if (previous.has(cardType)) {
            const recipe = emptyRecipe();
            let current: string | null = cardType;
            while (current !== null) {
                recipe.nodes.set(mergeKey('base', current), { namespace: 'base', cardType: current });
                const parent: string | null = previous.get(current) ?? null;
                if (parent !== null) recipe.edges.add(`${mergeKey('base', parent)}|${mergeKey('base', current)}`);
                current = parent;
            }
            return recipe;
        }
    }
    return null;
};

const recipeFor = (cardType: string, facts: ComposerFacts, stack: string[] = []): { recipe: Recipe; source: RecipeSource } | null => {
    if (stack.includes(cardType)) throw new RecipeError('RECIPE_CYCLE', `Recipe for ${cardType} depends on itself.`);
    const fromTemplate = templateRecipe(cardType, facts);
    if (fromTemplate) return { recipe: fromTemplate, source: 'template' };

    const requirement = facts.inputRequirements[cardType];
    if (requirement?.requiresAllOf?.length && !requirement.exactUpstreamCount) {
        const recipe = emptyRecipe();
        recipe.nodes.set(mergeKey('base', cardType), { namespace: 'base', cardType });
        for (const group of requirement.requiresAllOf) {
            const upstream = group[0];
            const sub = recipeFor(upstream, facts, [...stack, cardType]);
            if (!sub) return null;
            unionInto(recipe, sub.recipe);
            recipe.edges.add(`${mergeKey('base', upstream)}|${mergeKey('base', cardType)}`);
        }
        return { recipe, source: 'requirements' };
    }

    const fromPath = pathRecipe(cardType, facts);
    return fromPath ? { recipe: fromPath, source: 'path' } : null;
};

/** Which recipe source the composer uses for a capability, or null if it has none. */
export const recipeSourceFor = (cardType: CardType, facts: ComposerFacts = defaultComposerFacts()): RecipeSource | null => {
    try {
        return recipeFor(cardType, facts)?.source ?? null;
    } catch {
        return null;
    }
};

/** Analysis capabilities the composer can build on their own (catalog order). */
export const supportedAnalysisCapabilities = (facts: ComposerFacts = defaultComposerFacts()): CardType[] =>
    facts.catalog.cards.filter((card) => card.isAnalysis && recipeSourceFor(card.cardType, facts) !== null).map((card) => card.cardType);

/** Rule 4: satisfy unmet `requiresAllOf` groups until nothing changes. */
const satisfyRequirements = (graph: Recipe, facts: ComposerFacts) => {
    for (let round = 0; round < 20; round += 1) {
        let changed = false;
        const nodes = Array.from(graph.nodes.entries());
        for (const [key, node] of nodes) {
            const requirement = facts.inputRequirements[node.cardType];
            for (const group of requirement?.requiresAllOf ?? []) {
                const upstreamTypes = Array.from(graph.edges)
                    .filter((edge) => edge.endsWith(`|${key}`))
                    .map((edge) => graph.nodes.get(edge.split('|')[0])?.cardType);
                if (upstreamTypes.some((type) => type !== undefined && (group as string[]).includes(type))) continue;
                const sub = recipeFor(group[0], facts);
                if (!sub) throw new RecipeError('UNSATISFIABLE_REQUIREMENT', `No recipe for ${group[0]}, required by ${node.cardType}.`);
                unionInto(graph, sub.recipe);
                graph.edges.add(`${mergeKey('base', group[0])}|${key}`);
                changed = true;
            }
        }
        if (!changed) return;
    }
    throw new RecipeError('UNSATISFIABLE_REQUIREMENT', 'Input requirements did not converge.');
};

// ---------------------------------------------------------------------------------------------
// Spec construction
// ---------------------------------------------------------------------------------------------

const nodeKeyFor = (node: RecipeNode) => `${node.cardType.toLowerCase()}${node.namespace === 'compare' ? '_compare' : ''}`;

const listTitles = (titles: string[]): string => {
    if (titles.length <= 1) return titles.join('');
    return `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`;
};

/** Deterministic, user-facing summary built from catalog titles (never from model text). */
export const composedSummary = (analysisCardTypes: readonly string[], catalog: PipelineCapabilityCatalog): string => {
    const titles = analysisCardTypes.map((type) => catalog.cards.find((card) => card.cardType === type)?.title ?? type);
    return `Includes ${listTitles(titles)}. AridNova adds the required inputs and intermediate steps.`;
};

const orderGraph = (graph: Recipe, facts: ComposerFacts): string[] => {
    const catalogOrder = facts.catalog.cards.map((card) => card.cardType as string);
    const rank = (key: string) => {
        const node = graph.nodes.get(key) as RecipeNode;
        return NAMESPACES.indexOf(node.namespace) * 1000 + catalogOrder.indexOf(node.cardType);
    };
    const keys = Array.from(graph.nodes.keys());
    const edges = Array.from(graph.edges).map((edge) => edge.split('|') as [string, string]);
    const indegree = new Map(keys.map((key) => [key, edges.filter(([, to]) => to === key).length]));
    const ordered: string[] = [];
    const available = keys.filter((key) => indegree.get(key) === 0);
    while (available.length) {
        available.sort((a, b) => rank(a) - rank(b));
        const key = available.shift() as string;
        ordered.push(key);
        edges
            .filter(([from]) => from === key)
            .forEach(([, to]) => {
                indegree.set(to, (indegree.get(to) as number) - 1);
                if (indegree.get(to) === 0) available.push(to);
            });
    }
    if (ordered.length !== keys.length) throw new RecipeError('RECIPE_CYCLE', 'Composed graph contains a cycle.');
    return ordered;
};

const fail = (reason: ComposeFailureReason, code: string, message: string, extra: ContractIssue[] = []): ComposeResult => ({
    ok: false,
    reason,
    issues: [{ code, message }, ...extra],
});

/** Builds the pipeline for one accepted intent option. Never throws for any intent input. */
export const composePipeline = (intent: ComposableIntent, facts: ComposerFacts = defaultComposerFacts()): ComposeResult => {
    const cards = new Map(facts.catalog.cards.map((card) => [card.cardType as string, card]));
    const requested: readonly string[] = Array.isArray(intent?.analysisCardTypes) ? intent.analysisCardTypes : [];
    if (requested.length === 0) return fail('COMPOSITION_UNSUPPORTED', 'NO_CAPABILITIES', 'No analysis capabilities were requested.');
    const unknown = requested.filter((type) => !cards.has(type));
    // Unknown values are counted, not echoed: they may be arbitrary text.
    if (unknown.length) return fail('COMPOSITION_UNSUPPORTED', 'UNKNOWN_CAPABILITY', `${unknown.length} requested capability ID(s) are not in the catalog.`);
    const notAnalysis = requested.filter((type) => !cards.get(type)?.isAnalysis);
    if (notAnalysis.length) return fail('COMPOSITION_UNSUPPORTED', 'NOT_ANALYSIS_CAPABILITY', `Not analysis capabilities: ${notAnalysis.join(', ')}.`);
    const targets = facts.catalog.cards.map((card) => card.cardType as string).filter((type) => requested.includes(type));

    let graph: Recipe;
    try {
        graph = emptyRecipe();
        for (const target of targets) {
            const recipe = recipeFor(target, facts);
            if (!recipe) return fail('COMPOSITION_UNSUPPORTED', 'NO_RECIPE', `No legal way to build ${target} from an input card.`);
            unionInto(graph, recipe.recipe);
        }
        satisfyRequirements(graph, facts);
    } catch (error) {
        if (error instanceof RecipeError) return fail('COMPOSITION_UNSUPPORTED', error.code, error.message);
        throw error;
    }

    if (graph.nodes.size > facts.validation.maxNodes || graph.edges.size > facts.validation.maxEdges) {
        return fail(
            'COMPOSITION_TOO_LARGE',
            'COMPOSED_SIZE_LIMIT',
            `The requested analyses need ${graph.nodes.size} cards and ${graph.edges.size} connections ` +
                `(limit ${facts.validation.maxNodes} and ${facts.validation.maxEdges}).`
        );
    }

    let ordered: string[];
    try {
        ordered = orderGraph(graph, facts);
    } catch (error) {
        if (error instanceof RecipeError) return fail('COMPOSITION_INVALID', error.code, error.message);
        throw error;
    }
    const keyFor = new Map(ordered.map((key) => [key, nodeKeyFor(graph.nodes.get(key) as RecipeNode)]));
    const position = new Map(ordered.map((key, i) => [key, i]));
    const edges = Array.from(graph.edges)
        .map((edge) => edge.split('|') as [string, string])
        .sort(([a1, b1], [a2, b2]) => (position.get(a1) as number) - (position.get(a2) as number) || (position.get(b1) as number) - (position.get(b2) as number));

    const raw: Record<string, unknown> = {
        specVersion: 1,
        title: intent.title,
        summary: composedSummary(targets, facts.catalog),
        nodes: ordered.map((key) => ({ key: keyFor.get(key), cardType: (graph.nodes.get(key) as RecipeNode).cardType })),
        edges: edges.map(([from, to]) => ({ from: keyFor.get(from), to: keyFor.get(to) })),
    };
    if (intent.rationale !== undefined) raw.rationale = intent.rationale;

    const parsed = parsePipelineSpec(raw);
    if (!parsed.ok) return fail('COMPOSITION_INVALID', 'COMPOSED_SPEC_INVALID', 'The composed pipeline is not a valid PipelineSpec.', parsed.issues);
    const validated = validatePipelineSpec(parsed.spec, facts.validation);
    if (!validated.valid) return fail('COMPOSITION_INVALID', 'COMPOSED_GRAPH_INVALID', 'The composed pipeline failed structural validation.', validated.issues);

    const present = new Set(parsed.spec.nodes.map((node) => node.cardType));
    const missing = targets.filter((type) => !present.has(type));
    if (missing.length) return fail('COMPOSITION_INVALID', 'REQUESTED_CAPABILITY_MISSING', `Missing requested capability: ${missing.join(', ')}.`);

    const analysisCardTypes = facts.catalog.cards.filter((card) => card.isAnalysis && present.has(card.cardType)).map((card) => card.cardType);
    return { ok: true, spec: parsed.spec, suggestion: validated.suggestion, analysisCardTypes };
};
