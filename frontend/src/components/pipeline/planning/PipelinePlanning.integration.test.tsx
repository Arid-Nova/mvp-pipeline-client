/**
 * P60-M1-011 — Milestone 1 end-to-end integration on the real PipelinePage (Outcome A harness).
 *
 *   goal → Build mode → POST /chatbot/pipeline/intents (HTTP mocked; one realistic bad first
 *   answer, then a complete plan) → real parser → real composer → real validator → real
 *   candidate set → exactly 3 cards → Use #2 → real atomic applier → System Source configured
 *   through its own inputs → existing Run → existing execution path → Undo → empty canvas.
 *
 * Only external boundaries are mocked: the chatbot HTTP calls and the repository/analysis
 * services. Nothing from planning, application or execution is mocked.
 */
import fs from 'fs';
import path from 'path';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { mockedApi, renderPipelinePage } from '../__testutils__/renderPipelinePage';
import { CardType } from '../models';
import { VALID_CONNECTIONS } from '../pipelineConfig';
import { PipelineIntentRequest, PipelineIntentsCallResult } from '../../../services/types';
import { CanvasSnapshot, captureCanvas, expectCanvasUnchanged, findRenderedProps } from './__testutils__/canvasSnapshot';
import { PipelineSuggestionItem } from '../../chatbot/PipelineSuggestionCard';
import { isValidatedSuggestion, validatePipelineSpec } from './pipelineValidator';

const G1 = 'I want to visualize the architecture and check authorization problems.';
const REPO_URL = 'https://github.com/example-org/demo-system';

const fixtureText = (name: string) => fs.readFileSync(path.join(__dirname, '__fixtures__', `intent-response.${name}.json`), 'utf8');
const fixture = (name: string) => JSON.parse(fixtureText(name));
const reply = (name: string) => async (request: PipelineIntentRequest): Promise<PipelineIntentsCallResult> => ({
    kind: 'response',
    status: 200,
    data: { ...fixture(name), suggestionSetId: request.suggestionSetId, catalogVersion: request.catalogVersion },
});
/** Answers successive intent requests with the given fixtures, like the real endpoint. */
const backendAnswers = (...names: string[]) => {
    names.forEach((name) => mockedApi.requestPipelineIntents.mockImplementationOnce(reply(name)));
};
const intentRequests = (): PipelineIntentRequest[] => mockedApi.requestPipelineIntents.mock.calls.map(([request]) => request);

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
const clearAllViaToolbar = async () => {
    fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
    await waitFor(() => expect(captureCanvas().nodes).toHaveLength(0));
};
/** The exact items the three rendered cards will apply, in card order. */
const cardItems = (): PipelineSuggestionItem[] =>
    findRenderedProps<{ item: PipelineSuggestionItem; position: number }>((p) => 'item' in p && 'position' in p && 'canSelect' in p)
        .sort((a, b) => a.position - b.position)
        .map((p) => p.item);
/** The onClick React rendered for an element, i.e. a click captured before the UI updated. */
const capturedClickHandler = (element: Element): (() => void) => {
    const key = Object.keys(element).find((k) => k.startsWith('__reactProps$')) as string;
    const props = (element as unknown as Record<string, { onClick: () => void }>)[key];
    return () => props.onClick();
};

describe('Issue #60 Milestone 1 — chatbot-assisted pipeline creation (P60-M1-011)', () => {
    it('goal → retry → three validated suggestions → Use #2 → configure → existing Run → Undo to the empty canvas', async () => {
        await renderPipelinePage();
        // A previously used canvas that the user emptied themselves: history holds older work.
        await applyArchitectureTemplate();
        await clearAllViaToolbar();
        const preApply: CanvasSnapshot = captureCanvas();
        expect(preApply.history.some((entry) => entry.nodes.length === 4)).toBe(true);

        // Attempt 1 is the real llama3.2 slip (two options, misspelled FORMAL_VERYFY); attempt 2 is complete.
        backendAnswers('unknown-capability', 'valid');
        await openBuildMode();
        submitGoal();
        await screen.findByTestId('pipeline-suggestions');

        // The planner's one bounded retry: two requests, attempts 1 → 2, one suggestionSetId.
        const requests = intentRequests();
        expect(requests.map((r) => r.attempt)).toEqual([1, 2]);
        expect(requests[1].suggestionSetId).toBe(requests[0].suggestionSetId);
        expect(requests[1].rejectionFeedback).toEqual(expect.arrayContaining(['Problem: UNKNOWN_CAPABILITY', 'Problem: WRONG_OPTION_COUNT']));
        expect(requests[1].excludeCapabilitySets).toEqual([]);

        // Exactly three equal, unselected, independently valid suggestions in tier order.
        const items = cardItems();
        expect(items).toHaveLength(3);
        expect(screen.getAllByRole('article')).toHaveLength(3);
        expect(items.map((i) => i.tier)).toEqual(['focused', 'balanced', 'comprehensive']);
        expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label')?.split(' option')[0])).toEqual([
            'Focused',
            'Balanced',
            'Comprehensive',
        ]);
        expect(new Set(items.map((i) => i.suggestion.candidateId)).size).toBe(3);
        items.forEach((item) => {
            expect(isValidatedSuggestion(item.suggestion)).toBe(true);
            expect(validatePipelineSpec(JSON.parse(JSON.stringify(item.suggestion.spec))).valid).toBe(true);
        });
        // Attempt 2's own profiles, composed by the deterministic composer (not merged with attempt 1).
        expect(items.map((i) => [...i.chosenAnalyses].sort())).toEqual(
            fixture('valid').options.map((o: { analysisCardTypes: string[] }) => [...o.analysisCardTypes].sort())
        );
        [1, 2, 3].forEach((n) => expect(screen.getByTestId(`pipeline-suggestion-select-${n}`)).toBeEnabled());
        const visibleText = screen.getByTestId('pipeline-suggestions').textContent ?? '';
        expect(visibleText).not.toMatch(/\b(SYSTEM_INPUT|MULTI_REPO|IR_HOLDER|FORMAL_VERIFY|FORMAL_VIZ|VERIFICATION_COMPARISON|SCENARIO_GENERATE)\b/);
        expectCanvasUnchanged(preApply); // nothing changes before an explicit Use

        // Use #2 (Balanced).
        const selected = items[1];
        fireEvent.click(screen.getByTestId('pipeline-suggestion-select-2'));
        await waitFor(() => expect(captureCanvas().nodes).toHaveLength(selected.suggestion.spec.nodes.length));

        const applied = captureCanvas();
        const spec = selected.suggestion.spec;
        expect(applied.connections).toHaveLength(spec.edges.length);
        expect([applied.nodes.length, applied.connections.length]).toEqual([10, 10]); // golden for the G1 Balanced profile
        expect(applied.nodes.map((n) => n.type)).toEqual(spec.nodes.map((n) => n.cardType)); // same cards, in spec order
        const keyOfId = new Map(applied.nodes.map((n, i) => [n.id, spec.nodes[i].key]));
        expect(applied.connections.map((c) => `${keyOfId.get(c.source)}>${keyOfId.get(c.target)}`).sort()).toEqual(
            spec.edges.map((e) => `${e.from}>${e.to}`).sort()
        );
        const typeOfId = new Map(applied.nodes.map((n) => [n.id, n.type]));
        applied.connections.forEach((c) => expect(VALID_CONNECTIONS[typeOfId.get(c.source) as CardType]).toContain(typeOfId.get(c.target)));
        applied.nodes.forEach((n) => expect([n.data, n.status, n.logs]).toEqual([{}, 'idle', []])); // no model config
        expect(screen.getByTestId('pipeline-suggestion-applied-2')).toHaveTextContent('Added to canvas ✓');
        [1, 3].forEach((n) => expect(screen.getByTestId(`pipeline-suggestion-select-${n}`)).toBeDisabled());
        expect(screen.getByTestId('pipeline-status')).toHaveTextContent('Then press Run.');
        expect(mockedApi.fetchIRFromRepo).not.toHaveBeenCalled(); // applying never runs

        // Configure the generated System Source through its own inputs, then press the existing Run.
        mockedApi.fetchRepoMetadata.mockResolvedValue({
            name: 'demo-system', repoUrl: REPO_URL, defaultBranch: 'main', latestCommit: 'abc1234', branches: ['main'], commitMap: { main: 'abc1234' },
        });
        mockedApi.fetchIRFromRepo.mockResolvedValue({ name: 'demo-system', microservices: [] });
        fireEvent.change(screen.getByPlaceholderText('Enter or Auto-filled'), { target: { value: 'demo-system' } });
        fireEvent.change(screen.getByPlaceholderText('e.g., https://github.com/...'), { target: { value: REPO_URL } });
        fireEvent.click(screen.getByRole('button', { name: /run pipeline/i }));

        // The generated SYSTEM_INPUT enters the ordinary Run → processNextNodes path.
        await waitFor(() => expect(mockedApi.fetchIRFromRepo).toHaveBeenCalledTimes(1));
        const [input] = mockedApi.fetchIRFromRepo.mock.calls[0];
        expect(input.systemName).toBe('demo-system');
        expect(input.systemRepositories[0].repoBranchPair.repositoryURL).toContain('example-org/demo-system');
        expect(await screen.findByText('IR generated.')).toBeInTheDocument();
        await waitFor(() => expect(captureCanvas().nodes.find((n) => n.type === 'MULTI_REPO')?.status).toBe('completed'));

        // Let the (mocked, partly inert) run settle, then one Undo removes the whole pipeline.
        expect(await screen.findByRole('button', { name: /run pipeline/i }, { timeout: 5000 })).toBeInTheDocument();
        fireEvent.click(screen.getByTitle('Undo (Ctrl+Z)'));
        await waitFor(() => expect(captureCanvas().nodes).toHaveLength(0));
        const undone = captureCanvas();
        expect(undone.connections).toEqual([]);
        expect(undone.nodes.some((n) => n.type === 'VISUALIZATION')).toBe(false); // not the older template
        expect(undone.history[undone.historyIndex]).toEqual({ nodes: [], connections: [] });
    });

    it('non-empty canvas: plan, Use disabled with guidance, user Clear All enables the same set, Use #1 applies', async () => {
        await renderPipelinePage();
        await applyArchitectureTemplate();
        backendAnswers('valid');
        const userWork = captureCanvas();
        const confirm = window.confirm as jest.Mock;
        confirm.mockClear();

        await openBuildMode();
        submitGoal();
        await screen.findByTestId('pipeline-suggestions');

        expect(screen.getAllByRole('article')).toHaveLength(3);
        [1, 2, 3].forEach((n) => expect(screen.getByTestId(`pipeline-suggestion-select-${n}`)).toBeDisabled());
        expect(screen.getByTestId('pipeline-suggestions-empty-canvas-notice')).toBeInTheDocument();
        expectCanvasUnchanged(userWork);
        expect(confirm).not.toHaveBeenCalled();
        expect(mockedApi.saveSession).not.toHaveBeenCalled();
        const ids = cardItems().map((i) => i.suggestion.candidateId);
        const setId = intentRequests()[0].suggestionSetId;

        await clearAllViaToolbar(); // the user's own action (window.confirm is stubbed to accept)
        expect(confirm).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(screen.getByTestId('pipeline-suggestion-select-1')).toBeEnabled());
        expect(cardItems().map((i) => i.suggestion.candidateId)).toEqual(ids);
        expect(intentRequests()).toHaveLength(1);
        expect(intentRequests()[0].suggestionSetId).toBe(setId);

        fireEvent.click(screen.getByTestId('pipeline-suggestion-select-1'));
        await waitFor(() => expect(captureCanvas().nodes).toHaveLength(cardItems()[0].suggestion.spec.nodes.length));
        expect(screen.getByTestId('pipeline-suggestion-applied-1')).toBeInTheDocument();
        expect(confirm).toHaveBeenCalledTimes(1);
    });

    it('generate-then-change race: a stale Use after the user added a card changes nothing', async () => {
        await renderPipelinePage();
        backendAnswers('valid');
        await openBuildMode();
        submitGoal();
        await screen.findByTestId('pipeline-suggestions');
        const staleUse = capturedClickHandler(screen.getByTestId('pipeline-suggestion-select-1'));

        fireEvent.click(screen.getAllByRole('button', { name: /^Aegis/ })[0]);
        await waitFor(() => expect(captureCanvas().nodes).toHaveLength(1));
        const userCard = captureCanvas();
        staleUse();

        await waitFor(() => expect(screen.getAllByText(/can be added only to an empty canvas in Milestone 1/)).toHaveLength(1));
        expectCanvasUnchanged(userCard);
        expect(captureCanvas().nodes.map((n) => n.type)).toEqual(['AEGIS']);
    });

    it('model unavailable: safe failure, no cards, canvas unchanged; Browse templates opens the library without applying', async () => {
        await renderPipelinePage();
        mockedApi.requestPipelineIntents.mockResolvedValue({ kind: 'model_unavailable', status: 503, data: {} });
        const before = captureCanvas();
        await openBuildMode();

        submitGoal();

        expect(await screen.findByTestId('pipeline-planning-failure')).toHaveTextContent("The assistant's model isn't reachable right now.");
        expect(screen.queryAllByRole('article')).toHaveLength(0);
        expect(screen.queryByTestId('pipeline-suggestion-select-1')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Browse templates' }));
        expect(await screen.findByRole('heading', { name: 'Pipeline Library' })).toBeInTheDocument();
        expectCanvasUnchanged(before);
        expect(intentRequests()).toHaveLength(1); // no hidden retry or fallback
        expect(mockedApi.sendChatbotQuery).not.toHaveBeenCalled();
    });

    it('insufficient valid candidates: safe failure after the bounded retry, no partial suggestions, canvas unchanged', async () => {
        await renderPipelinePage();
        backendAnswers('too-large', 'compose-to-same-graph');
        const before = captureCanvas();
        await openBuildMode();

        submitGoal();

        expect(await screen.findByTestId('pipeline-planning-failure')).toHaveTextContent(
            "I couldn't find three valid, different pipelines for that goal. Try describing it differently."
        );
        expect(intentRequests().map((r) => r.attempt)).toEqual([1, 2]);
        expect(screen.queryAllByRole('article')).toHaveLength(0);
        expectCanvasUnchanged(before);
    });

    it('Dismiss: nothing is applied or run and the canvas is unchanged', async () => {
        await renderPipelinePage();
        backendAnswers('valid');
        const before = captureCanvas();
        await openBuildMode();
        submitGoal();
        await screen.findByTestId('pipeline-suggestions');

        fireEvent.click(screen.getByTestId('pipeline-suggestions-dismiss'));

        expect(screen.getByTestId('pipeline-suggestions-dismissed')).toBeInTheDocument();
        expect(screen.queryByTestId('pipeline-suggestion-select-1')).toBeNull();
        expectCanvasUnchanged(before);
        expect(mockedApi.fetchIRFromRepo).not.toHaveBeenCalled();
    });
});

describe('intent contract drift (frontend ↔ chatbot-backend)', () => {
    const backendDto = (file: string) =>
        fs.readFileSync(
            path.join(__dirname, `../../../../../chatbot-backend/src/main/java/edu/baylor/ecs/cloudhubs/chatbot/pipeline/model/${file}`),
            'utf8'
        );
    /** Instance field names of a Lombok DTO: each `private ... name [= ...];` statement (may span lines). */
    const javaFields = (source: string) =>
        Array.from(source.matchAll(/\bprivate\s+(?!static)([^;]*?);/g))
            .map((m) => m[1].replace(/"[^"]*"/g, '""').replace(/@\w+(\([^)]*\))?/g, ' '))
            .map((declaration) => declaration.split('=')[0].trim().split(/\s+/).pop() as string);

    it('the shared response fixture has exactly the backend DTO fields and intent-only options', () => {
        const response = fixture('valid');
        expect(Object.keys(response).sort()).toEqual(javaFields(backendDto('PipelineIntentResponse.java')).sort());
        response.options.forEach((option: Record<string, unknown>) => {
            Object.keys(option).forEach((key) => expect(['tier', 'title', 'rationale', 'analysisCardTypes']).toContain(key));
        });
        expect(fixtureText('valid')).not.toMatch(/"(nodes|edges|prerequisites|config|x|y|specVersion)"/);
    });

    it('the request DTO carries no graph fields', () => {
        expect(javaFields(backendDto('PipelineIntentRequest.java')).sort()).toEqual(
            ['attempt', 'catalog', 'catalogVersion', 'excludeCapabilitySets', 'goal', 'rejectionFeedback', 'suggestionSetId']
        );
    });
});
