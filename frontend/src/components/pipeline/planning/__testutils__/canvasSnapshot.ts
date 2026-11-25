/**
 * TEST ONLY (Issue #60, P60-M1-009): a snapshot of everything a pipeline failure must leave alone.
 *
 * Captures, from the rendered PipelinePage, the canvas nodes and connections, the undo history and
 * its index, and the viewport. PipelinePage keeps these in private React state, so this helper reads
 * them from the rendered React tree instead of widening the production API:
 *   - nodes, connections, scale and offset: the props the page passes to PipelineCanvas (found from
 *     the canvas DOM element, so it also works when PipelineCanvas is wrapped by a test spy);
 *   - history and historyIndex: PipelinePage's `history` state (the only state holding an array of
 *     { nodes, connections } snapshots) and the `historyIndex` state declared right after it.
 * Values are deep-copied, so later page updates can't change a captured snapshot.
 */
import { Connection, NodeData } from '../../models';
import PipelinePage from '../../PipelinePage';

export interface CanvasSnapshot {
    nodes: NodeData[];
    connections: Connection[];
    history: { nodes: NodeData[]; connections: Connection[] }[];
    historyIndex: number;
    viewport: { scale: number; offset: { x: number; y: number } };
}

interface Fiber {
    tag: number;
    return: Fiber | null;
    child: Fiber | null;
    sibling: Fiber | null;
    stateNode: unknown;
    elementType: unknown;
    memoizedProps: Record<string, unknown> | null;
    memoizedState: Hook | null;
}
interface Hook {
    memoizedState: unknown;
    next: Hook | null;
}

const fiberOf = (element: Element): Fiber => {
    const key = Object.keys(element).find((k) => k.startsWith('__reactFiber$'));
    if (!key) throw new Error('canvasSnapshot: no React fiber on the canvas element');
    return (element as unknown as Record<string, Fiber>)[key];
};

const HOST_ROOT = 3;

/**
 * The fiber stored on a DOM node is the one from its first render and may be stale, so the search
 * starts from the root's *current* tree (FiberRoot.current), which always holds committed state.
 */
const currentRoot = (element: Element): Fiber => {
    let fiber: Fiber | null = fiberOf(element);
    while (fiber && fiber.tag !== HOST_ROOT) fiber = fiber.return;
    if (!fiber) throw new Error('canvasSnapshot: React root not found');
    return (fiber.stateNode as { current: Fiber }).current;
};

const findDown = (root: Fiber, predicate: (fiber: Fiber) => boolean, what: string): Fiber => {
    const stack: Fiber[] = [root];
    while (stack.length) {
        const fiber = stack.pop() as Fiber;
        if (predicate(fiber)) return fiber;
        if (fiber.sibling) stack.push(fiber.sibling);
        if (fiber.child) stack.push(fiber.child);
    }
    throw new Error(`canvasSnapshot: ${what} not found`);
};

const isHistory = (value: unknown): value is CanvasSnapshot['history'] =>
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => entry && Array.isArray(entry.nodes) && Array.isArray(entry.connections));

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Captures the current canvas, history and viewport of the rendered PipelinePage. */
export const captureCanvas = (): CanvasSnapshot => {
    const canvasElement = document.querySelector('.tour-pipeline-canvas');
    if (!canvasElement) throw new Error('canvasSnapshot: PipelinePage canvas is not rendered');
    const root = currentRoot(canvasElement);

    const canvas = findDown(
        root,
        (fiber) => {
            const props = fiber.memoizedProps;
            return typeof props === 'object' && props !== null && 'nodes' in props && 'connections' in props && 'scale' in props;
        },
        'PipelineCanvas props'
    );
    const props = canvas.memoizedProps as { nodes: NodeData[]; connections: Connection[]; scale: number; offset: { x: number; y: number } };

    const page = findDown(root, (fiber) => fiber.elementType === PipelinePage, 'PipelinePage');
    let history: CanvasSnapshot['history'] | null = null;
    let historyIndex: number | null = null;
    for (let hook = page.memoizedState; hook; hook = hook.next) {
        if (isHistory(hook.memoizedState) && hook.next && typeof hook.next.memoizedState === 'number') {
            history = hook.memoizedState;
            historyIndex = hook.next.memoizedState;
            break;
        }
    }
    if (history === null || historyIndex === null) throw new Error('canvasSnapshot: PipelinePage history state not found');

    return copy({
        nodes: props.nodes,
        connections: props.connections,
        history,
        historyIndex,
        viewport: { scale: props.scale, offset: props.offset },
    });
};

/** Asserts that nothing captured by `captureCanvas` changed since `before`. */
export const expectCanvasUnchanged = (before: CanvasSnapshot): void => {
    expect(captureCanvas()).toEqual(before);
};

/**
 * Props of every rendered component matching `predicate`, in tree order (e.g. the
 * PipelineSuggestionCard items, to check the exact suggestions the user can select).
 */
export const findRenderedProps = <T>(predicate: (props: Record<string, unknown>) => boolean): T[] => {
    const canvasElement = document.querySelector('.tour-pipeline-canvas');
    if (!canvasElement) throw new Error('canvasSnapshot: PipelinePage canvas is not rendered');
    const found: T[] = [];
    const stack: Fiber[] = [currentRoot(canvasElement)];
    while (stack.length) {
        const fiber = stack.pop() as Fiber;
        const props = fiber.memoizedProps;
        if (typeof fiber.elementType === 'function' && typeof props === 'object' && props !== null && predicate(props)) {
            found.push(props as unknown as T);
        }
        if (fiber.sibling) stack.push(fiber.sibling);
        if (fiber.child) stack.push(fiber.child);
    }
    return found;
};
