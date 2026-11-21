/**
 * Materializes a selected ValidatedSuggestion into canvas state (Issue #60, P60-M1-007).
 *
 *   ValidatedSuggestion → brand check → live catalogVersion check → re-validate against the live
 *   pipeline rules → deterministic layout → fresh canvas IDs → { nodes, connections, guidance }
 *
 * Pure with respect to application state: it never calls React setters, never touches the canvas,
 * history, viewport or notifications, and never mutates the suggestion. It either returns the
 * complete new graph or throws ApplyError, so the caller can commit everything in one synchronous
 * step or nothing at all. It knows nothing about how the suggestion was planned (no model, intent,
 * tier or goal); every ValidatedSuggestion is applied the same way. Card data stays empty: the
 * user configures cards and presses the existing Run.
 */
import { CARD_CONFIG, REQUIRED_USER_CONFIG, RUNTIME_INTERACTION_HINTS } from '../pipelineConfig';
import { CardType, Connection, NodeData } from '../models';
import { buildPipelineCapabilityCatalog } from './pipelineCapabilities';
import { DEFAULT_LAYOUT_ORIGIN, LayoutPosition, PipelineLayout, PipelineLayoutError, layoutPipelineSpec } from './pipelineLayout';
import { ValidatedSuggestion, ValidationConfig, defaultValidationConfig, isValidatedSuggestion, validatePipelineSpec } from './pipelineValidator';

export type ApplyErrorReason = 'invalid' | 'catalog_mismatch';

export class ApplyError extends Error {
    constructor(readonly reason: ApplyErrorReason, readonly detail: string) {
        super(`Cannot apply suggestion: ${reason} (${detail})`);
        this.name = 'ApplyError';
    }
}

/** What a user still has to do for the created cards. Guidance only; never blocks application. */
export interface PendingConfiguration {
    cardType: CardType;
    cardTitle: string;
    /** before_run: REQUIRED_USER_CONFIG; during_run: RUNTIME_INTERACTION_HINTS. */
    kind: 'before_run' | 'during_run';
    hint: string;
    /** How many created cards of this type need it. */
    cardCount: number;
}

export interface MaterializedSuggestion {
    nodes: NodeData[];
    connections: Connection[];
    /** Canvas IDs of the created nodes, in PipelineSpec node order. */
    addedNodeIds: string[];
    pendingConfiguration: PendingConfiguration[];
}

export type ApplyFailureReason = 'canvas_not_empty' | 'pipeline_running' | ApplyErrorReason;

export type ApplyResult =
    | { ok: true; addedNodeIds: string[]; pendingConfiguration: PendingConfiguration[] }
    | { ok: false; reason: ApplyFailureReason; message: string };

/** Fixed, user-safe messages (P60-M1-009); never internal validator or exception text. */
export const APPLY_FAILURE_MESSAGES: Record<ApplyFailureReason, string> = {
    canvas_not_empty:
        'Pipeline suggestions can be added only to an empty canvas in Milestone 1. Save your current session if needed, then use Clear All in the toolbar.',
    pipeline_running: 'Wait for the current run to finish.',
    invalid: 'This suggestion no longer matches the pipeline rules; please regenerate.',
    catalog_mismatch: 'The app was updated — please reload the page.',
};

export interface MaterializeDeps {
    /** Canvas ID generator; the default matches applyTemplate's convention. */
    generateId: () => string;
    /** The live structural catalog version. */
    currentCatalogVersion: () => string;
    /** The live structural rules used for re-validation. */
    validationConfig: () => ValidationConfig;
    origin: LayoutPosition;
}

/** Same ID convention as PipelinePage.applyTemplate. */
export const generateCanvasId = (): string => Math.random().toString(36).substr(2, 9);

const defaultDeps: MaterializeDeps = {
    generateId: generateCanvasId,
    currentCatalogVersion: () => buildPipelineCapabilityCatalog().catalogVersion,
    validationConfig: defaultValidationConfig,
    origin: DEFAULT_LAYOUT_ORIGIN,
};

/** Guidance for the created card types, in PipelineSpec order, one entry per type and kind. */
export const pendingConfigurationFor = (cardTypes: readonly CardType[]): PendingConfiguration[] => {
    const counts = new Map<CardType, number>();
    cardTypes.forEach((type) => counts.set(type, (counts.get(type) ?? 0) + 1));
    const entries: PendingConfiguration[] = [];
    counts.forEach((cardCount, cardType) => {
        const cardTitle = CARD_CONFIG[cardType]?.title ?? cardType;
        const required = REQUIRED_USER_CONFIG[cardType];
        if (required) entries.push({ cardType, cardTitle, kind: 'before_run', hint: required.hint, cardCount });
    });
    counts.forEach((cardCount, cardType) => {
        const hint = RUNTIME_INTERACTION_HINTS[cardType];
        if (hint) entries.push({ cardType, cardTitle: CARD_CONFIG[cardType]?.title ?? cardType, kind: 'during_run', hint, cardCount });
    });
    return entries;
};

/** Builds the complete new canvas graph for a suggestion, or throws ApplyError. */
export const materializeSuggestion = (suggestion: ValidatedSuggestion, deps: Partial<MaterializeDeps> = {}): MaterializedSuggestion => {
    const { generateId, currentCatalogVersion, validationConfig, origin } = { ...defaultDeps, ...deps };

    if (!isValidatedSuggestion(suggestion)) throw new ApplyError('invalid', 'not a ValidatedSuggestion');
    if (suggestion.catalogVersion !== currentCatalogVersion()) throw new ApplyError('catalog_mismatch', 'catalogVersion differs');

    // Re-validate against the live rules; config may have changed since the suggestion was made.
    const revalidated = validatePipelineSpec(suggestion.spec, validationConfig());
    if (!revalidated.valid) throw new ApplyError('invalid', `revalidation failed (${revalidated.issues.map((i) => i.code).join(', ')})`);
    if (revalidated.suggestion.candidateId !== suggestion.candidateId) throw new ApplyError('invalid', 'candidateId differs');
    // From here on only the validator's whitelisted copy of the graph is used.
    const spec = revalidated.suggestion.spec;

    let layout: PipelineLayout;
    try {
        layout = layoutPipelineSpec(spec, origin);
    } catch (error) {
        if (error instanceof PipelineLayoutError) throw new ApplyError('invalid', `layout failed (${error.message})`);
        throw error;
    }

    const usedIds = new Set<string>();
    const freshId = (): string => {
        const id = generateId();
        if (typeof id !== 'string' || id.length === 0 || usedIds.has(id)) throw new ApplyError('invalid', 'generated canvas IDs are not unique');
        usedIds.add(id);
        return id;
    };

    const idForKey = new Map<string, string>();
    const nodes: NodeData[] = spec.nodes.map((node) => {
        const position = layout.get(node.key);
        if (!position) throw new ApplyError('invalid', 'a node has no layout position');
        const id = freshId();
        idForKey.set(node.key, id);
        return { id, type: node.cardType as CardType, x: position.x, y: position.y, data: {}, status: 'idle', logs: [] };
    });
    const connections: Connection[] = spec.edges.map((edge) => ({
        id: freshId(),
        source: idForKey.get(edge.from) as string,
        target: idForKey.get(edge.to) as string,
    }));

    return {
        nodes,
        connections,
        addedNodeIds: nodes.map((node) => node.id),
        pendingConfiguration: pendingConfigurationFor(nodes.map((node) => node.type)),
    };
};

// ---------------------------------------------------------------------------------------------
// Undo history for an apply (used next to PipelinePage's saveHistory)
// ---------------------------------------------------------------------------------------------

export interface CanvasSnapshot {
    nodes: NodeData[];
    connections: Connection[];
}

const snapshotKey = (snapshot: CanvasSnapshot) => JSON.stringify({ nodes: snapshot.nodes, connections: snapshot.connections });
const copySnapshot = (snapshot: CanvasSnapshot): CanvasSnapshot => ({
    nodes: snapshot.nodes.map((node) => ({ ...node })),
    connections: snapshot.connections.map((connection) => ({ ...connection })),
});

/**
 * The history after applying a pipeline, such that one Undo returns to the real pre-apply canvas.
 * The current entry can be stale (restored or loaded canvases are not recorded), so the actual
 * pre-apply canvas is recorded first unless the current entry already equals it. Like saveHistory,
 * the redo branch is dropped and at most `maxStates` entries are kept.
 */
export const historyAfterApply = (
    history: readonly CanvasSnapshot[],
    historyIndex: number,
    preApply: CanvasSnapshot,
    applied: CanvasSnapshot,
    maxStates: number
): { history: CanvasSnapshot[]; historyIndex: number } => {
    const kept = history.slice(0, historyIndex + 1);
    const current = kept[kept.length - 1];
    const next = current && snapshotKey(current) === snapshotKey(preApply) ? [...kept] : [...kept, copySnapshot(preApply)];
    next.push(copySnapshot(applied));
    const trimmed = next.length > maxStates ? next.slice(next.length - maxStates) : next;
    return { history: trimmed, historyIndex: trimmed.length - 1 };
};
