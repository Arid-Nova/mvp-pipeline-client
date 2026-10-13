/**
 * Deterministic left-to-right layout for a PipelineSpec (Issue #60, P60-M1-007).
 *
 *   layer(input) = 0, layer(node) = 1 + max(layer(parent))   (longest path from any input)
 *   x = origin.x + layer * COLUMN_GAP
 *   y = origin.y + row * ROW_GAP, rows assigned in PipelineSpec node order within each layer
 *
 * Positions are canvas metadata only; they are never written back into the PipelineSpec.
 * Keeping spec order inside a layer matters at runtime: SECURITY_REGRESSION picks base vs PR by
 * sorting its two upstream FORMAL_VERIFY cards on y, and the composer lists the base first, so the
 * base gets the smaller y. Pure: no DOM measurement, randomness or clock.
 */
import { PipelineSpecV1 } from './pipelineSpec';

/** Collapsed cards are `w-80` (320 px); the shipped templates space columns 350 px apart. */
export const COLUMN_GAP = 350;
/** Vertical spacing used by the shipped templates (e.g. policy-drift-comparison: y 50 and 350). */
export const ROW_GAP = 300;
export const DEFAULT_LAYOUT_ORIGIN = Object.freeze({ x: 100, y: 200 });

export interface LayoutPosition {
    x: number;
    y: number;
}

export interface NodeLayout extends LayoutPosition {
    layer: number;
    row: number;
}

/** Spec node key → position, in spec node order. */
export type PipelineLayout = ReadonlyMap<string, NodeLayout>;

export class PipelineLayoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PipelineLayoutError';
    }
}

/** Lays out a (validated) PipelineSpec. Throws PipelineLayoutError if any node can't be placed. */
export const layoutPipelineSpec = (
    spec: Pick<PipelineSpecV1, 'nodes' | 'edges'>,
    origin: LayoutPosition = DEFAULT_LAYOUT_ORIGIN
): PipelineLayout => {
    const keys = spec.nodes.map((node) => node.key);
    if (new Set(keys).size !== keys.length) throw new PipelineLayoutError('Duplicate node key.');
    const known = new Set(keys);
    const parents = new Map(keys.map((key) => [key, [] as string[]]));
    const children = new Map(keys.map((key) => [key, [] as string[]]));
    spec.edges.forEach((edge) => {
        if (!known.has(edge.from) || !known.has(edge.to)) throw new PipelineLayoutError('Edge endpoint is not a node.');
        (parents.get(edge.to) as string[]).push(edge.from);
        (children.get(edge.from) as string[]).push(edge.to);
    });

    // Longest path from the sources, in topological (Kahn) order.
    const layer = new Map<string, number>();
    const remaining = new Map(keys.map((key) => [key, (parents.get(key) as string[]).length]));
    const queue = keys.filter((key) => remaining.get(key) === 0);
    queue.forEach((key) => layer.set(key, 0));
    while (queue.length) {
        const key = queue.shift() as string;
        (children.get(key) as string[]).forEach((child) => {
            layer.set(child, Math.max(layer.get(child) ?? 0, (layer.get(key) as number) + 1));
            remaining.set(child, (remaining.get(child) as number) - 1);
            if (remaining.get(child) === 0) queue.push(child);
        });
    }
    if (keys.some((key) => remaining.get(key) !== 0)) throw new PipelineLayoutError('The graph has a cycle.');

    const rowsUsed = new Map<number, number>();
    const result = new Map<string, NodeLayout>();
    keys.forEach((key) => {
        const nodeLayer = layer.get(key) as number;
        const row = rowsUsed.get(nodeLayer) ?? 0;
        rowsUsed.set(nodeLayer, row + 1);
        result.set(key, { layer: nodeLayer, row, x: origin.x + nodeLayer * COLUMN_GAP, y: origin.y + row * ROW_GAP });
    });
    return result;
};
