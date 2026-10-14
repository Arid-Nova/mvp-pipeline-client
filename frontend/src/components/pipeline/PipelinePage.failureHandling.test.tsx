/**
 * P60-M1-009 — failure handling and canvas safety on the real PipelinePage.
 *
 * The real ChatbotPanel, planner, composer, validator and applier run; only the HTTP layer
 * (services/api) is mocked. Every failure is checked with the canvasSnapshot helper: nodes,
 * connections, undo history, history index and viewport must be exactly unchanged.
 */
import fs from 'fs';
import path from 'path';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { mockedApi, renderPipelinePage } from './__testutils__/renderPipelinePage';
import { CanvasSnapshot, captureCanvas, expectCanvasUnchanged } from './planning/__testutils__/canvasSnapshot';
import { PipelineIntentRequest, PipelineIntentsCallResult } from '../../services/types';

const G1 = 'I want to visualize the architecture and check authorization problems.';
const fixture = (name: string) =>
    JSON.parse(fs.readFileSync(path.join(__dirname, 'planning', '__fixtures__', `intent-response.${name}.json`), 'utf8'));
const reply = (name: string) => async (request: PipelineIntentRequest): Promise<PipelineIntentsCallResult> => ({
    kind: 'response',
    status: 200,
    data: { ...fixture(name), suggestionSetId: request.suggestionSetId, catalogVersion: request.catalogVersion },
});

const openBuildMode = async () => {
    fireEvent.click(screen.getByTestId('chatbot-toggle'));
    await screen.findByTestId('chatbot-panel');
    fireEvent.click(screen.getByRole('button', { name: 'Build a pipeline' }));
};
const submitGoal = (goal = G1) => {
    fireEvent.change(screen.getByTestId('chatbot-input'), { target: { value: goal } });
    fireEvent.click(screen.getByTestId('chatbot-submit'));
};
const applyArchitectureTemplate = async () => {
    fireEvent.click(screen.getByRole('button', { name: /template library/i }));
    fireEvent.click(await screen.findByRole('button', { name: /architecture reconstruction/i }));
    await waitFor(() => expect(captureCanvas().nodes).toHaveLength(4));
};

/** The onClick React rendered for an element (a handler captured before the UI updated). */
const capturedClickHandler = (element: Element): (() => void) => {
    const key = Object.keys(element).find((k) => k.startsWith('__reactProps$')) as string;
    const props = (element as unknown as Record<string, { onClick: () => void }>)[key];
    return () => props.onClick();
};

describe('PipelinePage failure handling (P60-M1-009)', () => {
    it('canvasSnapshot captures canvas, history and viewport changes (helper self-check)', async () => {
        await renderPipelinePage();
        const empty = captureCanvas();
        expect(empty.nodes).toEqual([]);
        expect(empty.history[empty.historyIndex]).toEqual({ nodes: [], connections: [] });

        await applyArchitectureTemplate();
        const applied = captureCanvas();
        expect(applied.nodes).toHaveLength(4);
        expect(applied.historyIndex).toBe(empty.historyIndex + 1);
        expect(applied.history[applied.historyIndex].nodes).toHaveLength(4);
        expect(() => expectCanvasUnchanged(empty)).toThrow();
    });

    it('model unavailable: clear message, Retry and Browse templates, canvas and history untouched (T13)', async () => {
        await renderPipelinePage();
        mockedApi.requestPipelineIntents.mockResolvedValue({ kind: 'model_unavailable', status: 503, data: {} });
        const before: CanvasSnapshot = captureCanvas();
        await openBuildMode();

        submitGoal();

        const failure = await screen.findByTestId('pipeline-planning-failure');
        expect(failure).toHaveTextContent("The assistant's model isn't reachable right now.");
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
        expect(screen.queryAllByRole('article')).toHaveLength(0);
        expectCanvasUnchanged(before);

        // Browse templates opens the existing library; nothing is applied until the user picks one.
        fireEvent.click(screen.getByRole('button', { name: 'Browse templates' }));
        expect(await screen.findByRole('heading', { name: 'Pipeline Library' })).toBeInTheDocument();
        expectCanvasUnchanged(before);
        expect(mockedApi.requestPipelineIntents).toHaveBeenCalledTimes(1);
        expect(mockedApi.saveSession).not.toHaveBeenCalled();
    });

    it('insufficient valid candidates on a non-empty canvas: no cards, user work and history untouched', async () => {
        await renderPipelinePage();
        await applyArchitectureTemplate();
        mockedApi.requestPipelineIntents.mockImplementation(reply('too-large'));
        const before = captureCanvas();
        const confirm = window.confirm as jest.Mock;
        confirm.mockClear();
        await openBuildMode();

        submitGoal();

        expect(await screen.findByTestId('pipeline-planning-failure')).toHaveTextContent(
            "I couldn't find three valid, different pipelines for that goal. Try describing it differently."
        );
        expect(mockedApi.requestPipelineIntents).toHaveBeenCalledTimes(2); // the planner's own two attempts
        expect(screen.queryAllByRole('article')).toHaveLength(0);
        expectCanvasUnchanged(before);
        expect(before.history[before.historyIndex].nodes).toHaveLength(4);
        expect(confirm).not.toHaveBeenCalled();
    });

    it.each([
        ['timeout', (async () => ({ kind: 'timeout' })) as never, 'That took too long.'],
        ['invalid model output', reply('prose'), "The assistant couldn't produce usable analysis options for that goal."],
        ['unsupported goal', reply('unsupported'), 'AridNova pipelines can:'],
        ['catalog mismatch', (async (request: PipelineIntentRequest) => ({ kind: 'response', status: 200, data: { ...fixture('valid'), suggestionSetId: request.suggestionSetId, catalogVersion: 'pcat-other' } })) as never, 'The app was updated — please reload the page.'],
        ['request invalid (HTTP 400)', (async () => ({ kind: 'request_invalid', status: 400 })) as never, 'Please describe your goal in 1 to 1000 characters.'],
    ])('%s: safe failure UI and an unchanged non-empty canvas', async (_name, backend, text) => {
        await renderPipelinePage();
        await applyArchitectureTemplate();
        mockedApi.requestPipelineIntents.mockImplementation(backend);
        const before = captureCanvas();
        await openBuildMode();

        submitGoal();

        expect(await screen.findByTestId('pipeline-planning-failure')).toHaveTextContent(text);
        expect(screen.queryAllByRole('article')).toHaveLength(0);
        expectCanvasUnchanged(before);
    });

    it('stale Use click after the user added a card (T33): canvas_not_empty, inline guidance, no toast, nothing changes', async () => {
        await renderPipelinePage();
        mockedApi.requestPipelineIntents.mockImplementation(reply('valid'));
        await openBuildMode();
        submitGoal();
        await screen.findByTestId('pipeline-suggestions');
        const staleUse = capturedClickHandler(screen.getByTestId('pipeline-suggestion-select-1'));

        // The user adds their own card; then the click captured while the canvas was empty arrives.
        fireEvent.click(screen.getAllByRole('button', { name: /^Aegis/ })[0]);
        await waitFor(() => expect(captureCanvas().nodes).toHaveLength(1));
        const before = captureCanvas();
        const confirm = window.confirm as jest.Mock;
        confirm.mockClear();

        act(() => staleUse());

        expectCanvasUnchanged(before);
        expect(captureCanvas().nodes.map((n) => n.type)).toEqual(['AEGIS']);
        expect(screen.getAllByText(/can be added only to an empty canvas in Milestone 1/)).toHaveLength(1);
        expect(screen.queryByText(/Pipeline added/)).toBeNull(); // no success toast, no status
        expect(confirm).not.toHaveBeenCalled();
        expect(mockedApi.saveSession).not.toHaveBeenCalled();
        [1, 2, 3].forEach((n) => expect(screen.getByTestId(`pipeline-suggestion-select-${n}`)).toBeDisabled());

        // Recoverable: once the user empties the canvas themselves, the same set can be used.
        fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
        await waitFor(() => expect(screen.getByTestId('pipeline-suggestion-select-1')).toBeEnabled());
        expect(mockedApi.requestPipelineIntents).toHaveBeenCalledTimes(1);
    });

    it('closing the panel while planning cancels it; the late reply never appears', async () => {
        await renderPipelinePage();
        let release: (result: PipelineIntentsCallResult) => void = () => undefined;
        let signal: AbortSignal | undefined;
        mockedApi.requestPipelineIntents.mockImplementation((request, options) => {
            signal = options?.signal;
            return new Promise((resolve) => {
                release = resolve;
            });
        });
        const before = captureCanvas();
        await openBuildMode();
        submitGoal();
        await screen.findByTestId('pipeline-planning-progress');

        fireEvent.click(screen.getByTestId('chatbot-toggle')); // close

        expect(signal?.aborted).toBe(true);
        const request = mockedApi.requestPipelineIntents.mock.calls[0][0];
        await act(async () => release(await reply('valid')(request)));
        fireEvent.click(screen.getByTestId('chatbot-toggle')); // reopen
        await screen.findByTestId('chatbot-panel');

        expect(screen.queryByTestId('pipeline-suggestions')).toBeNull();
        expect(screen.queryByTestId('pipeline-planning-failure')).toBeNull();
        expect(screen.queryByTestId('pipeline-planning-progress')).toBeNull();
        expectCanvasUnchanged(before);
    });

    it('health unavailable: Build Send is disabled with an explanation; Ask still sends', async () => {
        await renderPipelinePage();
        mockedApi.getChatbotHealth.mockResolvedValue({
            status: 'unavailable', provider: 'OLLAMA', model: 'llama3.2', baseUrl: 'x', message: 'down', checkedAt: new Date(0).toISOString(), latencyMs: null,
        });
        mockedApi.sendChatbotQuery.mockResolvedValue({
            answer: 'Unavailable answer.', citations: [], confidence: 'LOW', flags: ['model_unavailable'], requestId: 'r', processingTimeMs: 0, model: 'llama3.2', provider: 'OLLAMA',
        });
        const before = captureCanvas();
        await openBuildMode();

        await screen.findByTestId('pipeline-planning-unavailable');
        fireEvent.change(screen.getByTestId('chatbot-input'), { target: { value: G1 } });
        expect(screen.getByTestId('chatbot-submit')).toBeDisabled();
        expect(screen.getByTestId('chatbot-submit')).toHaveAttribute('aria-describedby', 'pipeline-planning-unavailable');

        fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
        expect(screen.getByTestId('chatbot-submit')).toBeEnabled();
        fireEvent.click(screen.getByTestId('chatbot-submit'));
        await waitFor(() => expect(mockedApi.sendChatbotQuery).toHaveBeenCalledTimes(1));
        expect(mockedApi.requestPipelineIntents).not.toHaveBeenCalled();
        expectCanvasUnchanged(before);
    });
});
