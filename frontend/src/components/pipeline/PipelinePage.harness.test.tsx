/**
 * P60-M1-013 — PipelinePage integration-test feasibility spike (proof test).
 *
 * Exercises the real PipelinePage through its existing UI only, with the module-level mocks
 * documented in ./__testutils__/renderPipelinePage.tsx. No Issue #60 functionality is involved.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { mockedApi, renderPipelinePage } from './__testutils__/renderPipelinePage';

const getCanvas = (container: HTMLElement): HTMLElement => {
    const canvas = container.querySelector<HTMLElement>('.tour-pipeline-canvas');
    if (!canvas) throw new Error('Pipeline canvas not found');
    return canvas;
};

const connectionPaths = (canvas: HTMLElement) =>
    canvas.querySelectorAll('svg path[stroke-dasharray="8,4"]');

const applyArchitectureTemplate = async () => {
    fireEvent.click(screen.getByRole('button', { name: /template library/i }));
    fireEvent.click(await screen.findByRole('button', { name: /architecture reconstruction/i }));
};

describe('PipelinePage harness (P60-M1-013 spike)', () => {
    it('probe 1: renders the page with the toolbox and a disabled Run control on an empty canvas', async () => {
        const { container } = await renderPipelinePage();

        expect(screen.getByRole('heading', { name: /toolbox/i })).toBeInTheDocument();
        const run = screen.getByRole('button', { name: /run pipeline/i });
        expect(run).toBeDisabled();
        expect(connectionPaths(getCanvas(container))).toHaveLength(0);
    });

    it('probe 2: opens the chatbot panel', async () => {
        await renderPipelinePage();

        fireEvent.click(screen.getByTestId('chatbot-toggle'));
        expect(await screen.findByTestId('chatbot-panel')).toBeInTheDocument();
        expect(mockedApi.getChatbotHealth).toHaveBeenCalled();
    });

    it('probe 3: applying an existing template puts its cards and connections on the canvas', async () => {
        const { container } = await renderPipelinePage();

        await applyArchitectureTemplate();

        const canvas = within(getCanvas(container));
        await waitFor(() => expect(canvas.getByText('System Source')).toBeInTheDocument());
        expect(canvas.getByText('Generate Snapshot')).toBeInTheDocument();
        expect(canvas.getByText('IR Card')).toBeInTheDocument();
        expect(canvas.getByText('System Visualization')).toBeInTheDocument();
        expect(connectionPaths(getCanvas(container))).toHaveLength(3);
        expect(screen.getByRole('button', { name: /run pipeline/i })).toBeEnabled();
    });

    it('probe 4: Run reaches the existing System Source validation when it is unconfigured', async () => {
        const { container } = await renderPipelinePage();
        await applyArchitectureTemplate();
        await waitFor(() => expect(connectionPaths(getCanvas(container))).toHaveLength(3));

        fireEvent.click(screen.getByRole('button', { name: /run pipeline/i }));

        expect(
            await within(getCanvas(container)).findByText('System Name and at least one Repository URL are required.')
        ).toBeInTheDocument();
        expect(mockedApi.fetchIRFromRepo).not.toHaveBeenCalled();
    });

    it('probe 5: with System Source configured, Run completes the first normal step (Generate Snapshot)', async () => {
        const repoUrl = 'https://github.com/example-org/demo-system';

        // renderPipelinePage resets every API mock, so per-test behaviour is installed after it.
        const { container } = await renderPipelinePage();
        mockedApi.fetchRepoMetadata.mockResolvedValue({
            name: 'demo-system',
            repoUrl,
            defaultBranch: 'main',
            latestCommit: 'abc1234',
            branches: ['main'],
            commitMap: { main: 'abc1234' },
        });
        mockedApi.fetchIRFromRepo.mockResolvedValue({ name: 'demo-system', microservices: [] });

        await applyArchitectureTemplate();
        const canvasEl = getCanvas(container);
        await waitFor(() => expect(connectionPaths(canvasEl)).toHaveLength(3));

        fireEvent.change(within(canvasEl).getByPlaceholderText('Enter or Auto-filled'), {
            target: { value: 'demo-system' },
        });
        fireEvent.change(within(canvasEl).getByPlaceholderText('e.g., https://github.com/...'), {
            target: { value: repoUrl },
        });

        fireEvent.click(screen.getByRole('button', { name: /run pipeline/i }));

        await waitFor(() => expect(mockedApi.fetchIRFromRepo).toHaveBeenCalledTimes(1));
        const [input] = mockedApi.fetchIRFromRepo.mock.calls[0];
        expect(input.systemName).toBe('demo-system');
        expect(input.systemRepositories[0].repoBranchPair.repositoryURL).toContain('example-org/demo-system');
        expect(await within(canvasEl).findByText('IR generated.')).toBeInTheDocument();
    });

    it('isolation: each render starts from an empty canvas despite the module-level canvas cache', async () => {
        // Earlier probes left nodes in PipelinePage's module-level `inMemoryPipelineCache`;
        // renderPipelinePage must have emptied the canvas through the existing "Clear All".
        const { container } = await renderPipelinePage();

        expect(connectionPaths(getCanvas(container))).toHaveLength(0);
        expect(within(getCanvas(container)).queryByText('System Source')).toBeNull();
        expect(screen.getByRole('button', { name: /run pipeline/i })).toBeDisabled();
    });
});
