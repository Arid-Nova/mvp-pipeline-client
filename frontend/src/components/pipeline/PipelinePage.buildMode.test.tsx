/**
 * P60-M1-008 — Build mode on the real PipelinePage: the real ChatbotPanel, planner, composer,
 * validator and P60-M1-007 applier. Only the HTTP layer (services/api) is mocked. Stops at the
 * applied canvas: configuring System Source and Run belong to P60-M1-011.
 */
import fs from 'fs';
import path from 'path';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { mockedApi, renderPipelinePage } from './__testutils__/renderPipelinePage';
import { Connection, NodeData } from './models';
import { PipelineIntentRequest } from '../../services/types';

interface CanvasRender {
    nodes: NodeData[];
    connections: Connection[];
}
const mockCanvasRenders: CanvasRender[] = [];

jest.mock('./canvas/PipelineCanvas', () => {
    const React = jest.requireActual('react');
    const actual = jest.requireActual('./canvas/PipelineCanvas');
    return {
        ...actual,
        PipelineCanvas: (props: CanvasRender) => {
            mockCanvasRenders.push({ nodes: props.nodes, connections: props.connections });
            return React.createElement(actual.PipelineCanvas, props);
        },
    };
});

const G1 = 'I want to visualize the architecture and check authorization problems.';
const validResponse = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'planning', '__fixtures__', 'intent-response.valid.json'), 'utf8')
);
const latestCanvas = (): CanvasRender => mockCanvasRenders[mockCanvasRenders.length - 1];

const answerIntentsWithG1 = () =>
    mockedApi.requestPipelineIntents.mockImplementation(async (request: PipelineIntentRequest) => ({
        kind: 'response',
        status: 200,
        data: { ...validResponse, suggestionSetId: request.suggestionSetId, catalogVersion: request.catalogVersion },
    }));

const buildSuggestions = async () => {
    fireEvent.click(screen.getByTestId('chatbot-toggle'));
    await screen.findByTestId('chatbot-panel');
    fireEvent.click(screen.getByRole('button', { name: 'Build a pipeline' }));
    fireEvent.change(screen.getByTestId('chatbot-input'), { target: { value: G1 } });
    fireEvent.click(screen.getByTestId('chatbot-submit'));
    await screen.findByTestId('pipeline-suggestions');
    expect(screen.getAllByRole('article')).toHaveLength(3);
};

const typesOf = (render: CanvasRender) => render.nodes.map((n) => n.type).sort();

describe('PipelinePage Build mode (P60-M1-008)', () => {
    beforeEach(() => {
        mockCanvasRenders.length = 0;
    });

    it('empty canvas: Build → three suggestions → Use → the composed graph is on the canvas', async () => {
        await renderPipelinePage();
        answerIntentsWithG1();
        const confirm = window.confirm as jest.Mock;
        confirm.mockClear();

        await buildSuggestions();
        expect(latestCanvas().nodes).toHaveLength(0); // nothing changes before an explicit Use
        expect(mockedApi.requestPipelineIntents).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByTestId('pipeline-suggestion-select-2'));

        await waitFor(() => expect(latestCanvas().nodes).toHaveLength(10));
        expect(latestCanvas().connections).toHaveLength(10);
        expect(typesOf(latestCanvas())).toEqual(
            ['SYSTEM_INPUT', 'MULTI_REPO', 'IR_HOLDER', 'FORMAL_VERIFY', 'FORMAL_VIZ', 'VISUALIZATION',
                'COMPONENT_GENERATE', 'COMPONENT_HOLDER', 'SCENARIO_GENERATE', 'VERIFICATION_COMPARISON'].sort()
        );
        expect(screen.getByTestId('pipeline-suggestion-applied-2')).toHaveTextContent('Added to canvas ✓');
        expect(screen.getByTestId('pipeline-status')).toHaveTextContent('Then press Run.');
        // The page's own success toast appears once; the chat adds a status message, not a second toast.
        expect(screen.getAllByText(/^Pipeline added\. Next: configure System Source, then press Run\.$/)).toHaveLength(1);

        expect(mockedApi.fetchIRFromRepo).not.toHaveBeenCalled(); // no automatic Run
        expect(mockedApi.saveSession).not.toHaveBeenCalled(); // no automatic save
        expect(confirm).not.toHaveBeenCalled(); // no automatic Clear All
        expect(mockedApi.sendChatbotQuery).not.toHaveBeenCalled();
    });

    it('non-empty canvas: suggestions stay disabled until the user clears the canvas, then the same ones apply', async () => {
        await renderPipelinePage();
        answerIntentsWithG1();
        fireEvent.click(screen.getByRole('button', { name: /template library/i }));
        fireEvent.click(await screen.findByRole('button', { name: /architecture reconstruction/i }));
        await waitFor(() => expect(latestCanvas().nodes).toHaveLength(4));
        const confirm = window.confirm as jest.Mock;
        confirm.mockClear();

        await buildSuggestions();
        [1, 2, 3].forEach((n) => expect(screen.getByTestId(`pipeline-suggestion-select-${n}`)).toBeDisabled());
        expect(screen.getByTestId('pipeline-suggestions-empty-canvas-notice')).toBeInTheDocument();
        expect(latestCanvas().nodes).toHaveLength(4); // the user's work is untouched
        expect(confirm).not.toHaveBeenCalled(); // the chatbot never asks to clear
        const titles = screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'));

        // The user clears the canvas with the existing toolbar control.
        fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
        await waitFor(() => expect(latestCanvas().nodes).toHaveLength(0));
        expect(confirm).toHaveBeenCalledTimes(1);

        await waitFor(() => expect(screen.getByTestId('pipeline-suggestion-select-1')).toBeEnabled());
        expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(titles);
        expect(mockedApi.requestPipelineIntents).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByTestId('pipeline-suggestion-select-1'));
        await waitFor(() => expect(latestCanvas().nodes).toHaveLength(6));
        expect(screen.getByTestId('pipeline-suggestion-applied-1')).toBeInTheDocument();
        expect(confirm).toHaveBeenCalledTimes(1);
    });
});
