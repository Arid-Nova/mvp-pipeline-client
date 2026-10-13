/**
 * P60-M1-007 — applying a ValidatedSuggestion to the real PipelinePage.
 *
 * Uses the P60-M1-013 harness. ChatbotPanel is replaced by a stub that only captures the props
 * PipelinePage passes it (Build mode UI arrives in P60-M1-008), and PipelineCanvas is wrapped to
 * record the nodes/connections of every render. Everything else is the real page.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { mockedApi, mockedTrack, renderPipelinePage } from './__testutils__/renderPipelinePage';
import { CardType, Connection, NodeData } from './models';
import { ApplyResult } from './planning/pipelineApplier';
import { composePipeline } from './planning/pipelineComposer';
import { ValidatedSuggestion, defaultValidationConfig, validatePipelineSpec } from './planning/pipelineValidator';

interface PanelProps {
    onApplyPipelineSuggestion?: (suggestion: ValidatedSuggestion) => ApplyResult;
    canvasIsEmpty?: boolean;
    isPipelineRunning?: boolean;
}
interface CanvasRender {
    nodes: NodeData[];
    connections: Connection[];
    scale: number;
    offset: { x: number; y: number };
    handleWheel: (event: Partial<WheelEvent> & { preventDefault: () => void }) => void;
}

const mockPanel: { props: PanelProps | null } = { props: null };
const mockCanvasRenders: CanvasRender[] = [];

jest.mock('../chatbot/ChatbotPanel', () => ({
    __esModule: true,
    default: (props: PanelProps) => {
        mockPanel.props = props;
        return null;
    },
}));

jest.mock('./canvas/PipelineCanvas', () => {
    const React = jest.requireActual('react');
    const actual = jest.requireActual('./canvas/PipelineCanvas');
    return {
        ...actual,
        PipelineCanvas: (props: CanvasRender) => {
            mockCanvasRenders.push({ nodes: props.nodes, connections: props.connections, scale: props.scale, offset: props.offset, handleWheel: props.handleWheel });
            return React.createElement(actual.PipelineCanvas, props);
        },
    };
});

const suggestionFor = (types: CardType[]): ValidatedSuggestion => {
    const result = composePipeline({ title: 'Page apply test', analysisCardTypes: types });
    if (!result.ok) throw new Error(`Composition failed: ${result.reason}`);
    return result.suggestion;
};
const BALANCED = () => suggestionFor(['VISUALIZATION', 'FORMAL_VIZ', 'VERIFICATION_COMPARISON']);
const POLICY_DRIFT = () => suggestionFor(['SECURITY_REGRESSION']);

const latestCanvas = (): CanvasRender => mockCanvasRenders[mockCanvasRenders.length - 1];
/** Scrolls the canvas through the page's own wheel handler (pans the viewport). */
const panCanvas = (deltaX: number, deltaY: number) => {
    act(() => latestCanvas().handleWheel({ deltaX, deltaY, ctrlKey: false, metaKey: false, preventDefault: () => undefined }));
};
const undoButton = () => screen.getByTitle('Undo (Ctrl+Z)');
const redoButton = () => screen.getByTitle('Redo (Ctrl+Y)');

const apply = (suggestion: ValidatedSuggestion, handler = mockPanel.props?.onApplyPipelineSuggestion): ApplyResult => {
    if (!handler) throw new Error('PipelinePage did not pass onApplyPipelineSuggestion');
    let result: ApplyResult | undefined;
    act(() => {
        result = handler(suggestion);
    });
    return result as ApplyResult;
};

const applyArchitectureTemplate = async () => {
    fireEvent.click(screen.getByRole('button', { name: /template library/i }));
    fireEvent.click(await screen.findByRole('button', { name: /architecture reconstruction/i }));
    await waitFor(() => expect(latestCanvas().nodes).toHaveLength(4));
};

const loadSessionViaHeader = async (canvasData: unknown) => {
    mockedApi.getAvailableSessions.mockResolvedValue({
        sessions: [{ id: 'session-1', name: 'Saved work', updated_at: new Date(0).toISOString() }],
        currentPage: 0,
        totalPages: 1,
        totalElements: 1,
    });
    mockedApi.loadSession.mockResolvedValue({ name: 'Saved work', canvas_data: canvasData });
    if (!screen.queryByRole('button', { name: /^load$/i })) fireEvent.click(screen.getByTitle('Settings'));
    // Session buttons stay disabled until a running save has finished.
    await waitFor(() => expect(screen.getByRole('button', { name: /^load$/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /^load$/i }));
    fireEvent.click(await screen.findByText('Saved work'));
    await waitFor(() => expect(mockedApi.loadSession).toHaveBeenCalled());
    await screen.findByText(/workspace loaded successfully/i);
};

/** Card types and type-level edges of a canvas graph, independent of random IDs. */
const shape = (nodes: NodeData[], connections: Connection[]) => {
    const typeOf = new Map(nodes.map((n) => [n.id, n.type]));
    return {
        types: nodes.map((n) => n.type).sort(),
        edges: connections.map((c) => `${typeOf.get(c.source)}>${typeOf.get(c.target)}`).sort(),
    };
};
const specShape = (suggestion: ValidatedSuggestion) => {
    const typeOf = new Map(suggestion.spec.nodes.map((n) => [n.key, n.cardType]));
    return {
        types: suggestion.spec.nodes.map((n) => n.cardType).sort(),
        edges: suggestion.spec.edges.map((e) => `${typeOf.get(e.from)}>${typeOf.get(e.to)}`).sort(),
    };
};

describe('PipelinePage.applyPipelineSuggestion (P60-M1-007)', () => {
    beforeEach(() => {
        mockPanel.props = null;
        mockCanvasRenders.length = 0;
    });

    it('passes the apply handler and the canvas flags to the chatbot panel', async () => {
        await renderPipelinePage();
        expect(typeof mockPanel.props?.onApplyPipelineSuggestion).toBe('function');
        expect(mockPanel.props?.canvasIsEmpty).toBe(true);
        expect(mockPanel.props?.isPipelineRunning).toBe(false);
    });

    it('applies the exact validated graph to an empty canvas, without clearing, saving, confirming or running', async () => {
        await renderPipelinePage();
        const confirm = window.confirm as jest.Mock;
        confirm.mockClear();
        mockedTrack.mockClear();
        const suggestion = BALANCED();

        const result = apply(suggestion);

        expect(result.ok).toBe(true);
        const { nodes, connections } = latestCanvas();
        expect(nodes).toHaveLength(suggestion.spec.nodes.length);
        expect(connections).toHaveLength(suggestion.spec.edges.length);
        expect(shape(nodes, connections)).toEqual(specShape(suggestion));
        expect(result.ok && result.addedNodeIds).toEqual(nodes.map((n) => n.id));
        expect(result.ok && result.pendingConfiguration.map((p) => p.cardTitle)).toEqual(['System Source']);
        nodes.forEach((n) => expect([n.status, n.data, n.logs]).toEqual(['idle', {}, []]));

        expect(confirm).not.toHaveBeenCalled();
        expect(mockedApi.saveSession).not.toHaveBeenCalled();
        expect(mockedApi.fetchIRFromRepo).not.toHaveBeenCalled();
        expect(mockedTrack).not.toHaveBeenCalled(); // no CLEARED, RUN_STARTED or SESSION_SAVED
        expect(screen.getByRole('button', { name: /run pipeline/i })).toBeEnabled();
        expect(mockPanel.props?.canvasIsEmpty).toBe(false);
    });

    it('commits nodes and connections in the same render (T12)', async () => {
        await renderPipelinePage();
        const suggestion = POLICY_DRIFT();
        const before = mockCanvasRenders.length;

        apply(suggestion);

        const after = mockCanvasRenders.slice(before);
        const withNodes = after.filter((r) => r.nodes.length > 0);
        expect(withNodes.length).toBeGreaterThan(0);
        withNodes.forEach((r) => expect(r.connections).toHaveLength(suggestion.spec.edges.length));
    });

    it('resets the viewport and shows one success notification', async () => {
        await renderPipelinePage();
        panCanvas(40, 60);
        await waitFor(() => expect(latestCanvas().offset).not.toEqual({ x: 0, y: 0 }));

        apply(BALANCED());

        expect(latestCanvas().scale).toBe(1);
        expect(latestCanvas().offset).toEqual({ x: 0, y: 0 });
        expect(screen.getAllByText('Pipeline added. Next: configure System Source, then press Run.')).toHaveLength(1);
    });

    it('rejects a non-empty canvas and changes nothing, even with a stale "empty" handler (T33)', async () => {
        await renderPipelinePage();
        const staleHandler = mockPanel.props?.onApplyPipelineSuggestion;
        expect(mockPanel.props?.canvasIsEmpty).toBe(true);

        // The user adds their own card after the suggestions were generated.
        fireEvent.click(screen.getAllByRole('button', { name: /^Aegis/ })[0]);
        await waitFor(() => expect(latestCanvas().nodes).toHaveLength(1));
        const before = latestCanvas();
        const undoEnabled = !(undoButton() as HTMLButtonElement).disabled;

        const result = apply(BALANCED(), staleHandler);

        expect(result).toEqual({
            ok: false,
            reason: 'canvas_not_empty',
            message: 'Pipeline suggestions can be added only to an empty canvas in Milestone 1. Save your current session if needed, then use Clear All in the toolbar.',
        });
        expect(latestCanvas().nodes).toBe(before.nodes);
        expect(latestCanvas().connections).toBe(before.connections);
        expect(latestCanvas().nodes.map((n) => n.type)).toEqual(['AEGIS']);
        expect(!(undoButton() as HTMLButtonElement).disabled).toBe(undoEnabled);
        expect(screen.queryByText(/pipeline added/i)).toBeNull();
        expect(latestCanvas().nodes.some((n) => n.type === 'SYSTEM_INPUT')).toBe(false);

        // History is unchanged: one Undo removes exactly the user's card.
        fireEvent.click(undoButton());
        await waitFor(() => expect(latestCanvas().nodes).toHaveLength(0));
    });

    it('rejects while a pipeline is running and changes nothing', async () => {
        await renderPipelinePage();
        mockedApi.fetchRepoMetadata.mockResolvedValue({
            name: 'demo', repoUrl: 'https://github.com/example-org/demo', defaultBranch: 'main', latestCommit: 'abc', branches: ['main'], commitMap: { main: 'abc' },
        });
        mockedApi.fetchIRFromRepo.mockReturnValue(new Promise(() => undefined)); // the run never finishes
        await applyArchitectureTemplate();
        fireEvent.change(screen.getByPlaceholderText('Enter or Auto-filled'), { target: { value: 'demo' } });
        fireEvent.change(screen.getByPlaceholderText('e.g., https://github.com/...'), { target: { value: 'https://github.com/example-org/demo' } });
        fireEvent.click(screen.getByRole('button', { name: /run pipeline/i }));
        await waitFor(() => expect(mockPanel.props?.isPipelineRunning).toBe(true));

        // Empty the canvas with Undo, which stays available during a run (Clear All does not).
        fireEvent.click(undoButton());
        await waitFor(() => expect(latestCanvas().nodes).toHaveLength(0));
        const before = latestCanvas();

        const result = apply(BALANCED());

        expect(result.ok === false && result.reason).toBe('pipeline_running');
        expect(latestCanvas().nodes).toBe(before.nodes);
        expect(latestCanvas().connections).toBe(before.connections);
        expect(mockPanel.props?.isPipelineRunning).toBe(true);
    });

    it('rejects a stale catalog version and changes nothing', async () => {
        await renderPipelinePage();
        panCanvas(0, 80);
        await waitFor(() => expect(latestCanvas().offset.y).not.toBe(0));
        const before = latestCanvas();
        const undoDisabled = (undoButton() as HTMLButtonElement).disabled;
        const stale = validatePipelineSpec(BALANCED().spec, { ...defaultValidationConfig(), catalogVersion: 'pcat-older' });
        if (!stale.valid) throw new Error('fixture must validate');

        const result = apply(stale.suggestion);

        expect(result).toEqual({ ok: false, reason: 'catalog_mismatch', message: 'The app was updated — please reload the page.' });
        expect(latestCanvas().nodes).toBe(before.nodes);
        expect(latestCanvas().offset).toEqual(before.offset);
        expect((undoButton() as HTMLButtonElement).disabled).toBe(undoDisabled);
        expect(screen.queryByText(/pipeline added/i)).toBeNull();
    });

    it('rejects a suggestion that fails re-validation and changes nothing', async () => {
        await renderPipelinePage();
        const before = latestCanvas();
        const undoDisabled = (undoButton() as HTMLButtonElement).disabled;
        const real = BALANCED();
        // Test-only cast: a look-alike whose graph is not valid under the live rules.
        const forged = {
            ...real,
            spec: { ...real.spec, edges: [...real.spec.edges, { from: 'system_input', to: 'formal_viz' }] },
        } as unknown as ValidatedSuggestion;

        const result = apply(forged);

        expect(result).toEqual({ ok: false, reason: 'invalid', message: 'This suggestion no longer matches the pipeline rules; please regenerate.' });
        expect(latestCanvas().nodes).toBe(before.nodes);
        expect((undoButton() as HTMLButtonElement).disabled).toBe(undoDisabled);
    });

    it('one Undo returns to the real empty canvas even when history is stale, and Redo restores the pipeline', async () => {
        await renderPipelinePage();
        // History: [empty, template]. Loading an empty saved session empties the canvas without
        // recording history, so history[historyIndex] still holds the template.
        await applyArchitectureTemplate();
        await loadSessionViaHeader({ nodes: [], connections: [] });
        await waitFor(() => expect(latestCanvas().nodes).toHaveLength(0));
        const suggestion = POLICY_DRIFT();

        const result = apply(suggestion);
        expect(result.ok).toBe(true);
        const applied = latestCanvas();

        fireEvent.click(undoButton());
        await waitFor(() => expect(latestCanvas().nodes).toHaveLength(0));
        expect(latestCanvas().connections).toHaveLength(0);

        fireEvent.click(redoButton());
        await waitFor(() => expect(latestCanvas().nodes).toHaveLength(suggestion.spec.nodes.length));
        expect(latestCanvas().nodes).toEqual(applied.nodes);
        expect(latestCanvas().connections).toEqual(applied.connections);
        expect(shape(latestCanvas().nodes, latestCanvas().connections)).toEqual(specShape(suggestion));
    });

    it('round-trips through the existing session save and load', async () => {
        await renderPipelinePage();
        mockedApi.saveSession.mockResolvedValue('session-1');
        apply(POLICY_DRIFT());
        const applied = latestCanvas();

        fireEvent.click(screen.getByTitle('Settings'));
        fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
        await waitFor(() => expect(mockedApi.saveSession).toHaveBeenCalledTimes(1));
        const [, savedCanvas] = mockedApi.saveSession.mock.calls[0];

        fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
        await waitFor(() => expect(latestCanvas().nodes).toHaveLength(0));
        await loadSessionViaHeader(JSON.parse(JSON.stringify(savedCanvas)));

        await waitFor(() => expect(latestCanvas().nodes).toHaveLength(applied.nodes.length));
        expect(latestCanvas().nodes).toEqual(applied.nodes);
        expect(latestCanvas().connections).toEqual(applied.connections);
    });

    it('leaves the existing template path unchanged', async () => {
        await renderPipelinePage();
        await applyArchitectureTemplate();
        expect(shape(latestCanvas().nodes, latestCanvas().connections)).toEqual({
            types: ['IR_HOLDER', 'MULTI_REPO', 'SYSTEM_INPUT', 'VISUALIZATION'],
            edges: ['IR_HOLDER>VISUALIZATION', 'MULTI_REPO>IR_HOLDER', 'SYSTEM_INPUT>MULTI_REPO'],
        });
        expect(latestCanvas().nodes.map((n) => [n.x, n.y])).toEqual([[100, 200], [450, 200], [800, 200], [1150, 200]]);
        expect(screen.getByText('Workspace Loaded!')).toBeInTheDocument();
    });
});
