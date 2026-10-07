/**
 * Test harness for rendering the real PipelinePage under Jest + React Testing Library.
 *
 * Created by the P60-M1-013 feasibility spike (docs/issue-60-milestone-1-user-stories.md).
 * Only module-level mocks are used; no pipeline component or PipelinePage internals are mocked.
 *
 * Mocks and why they are needed:
 * - services/api: every export is a jest.fn. The real module imports axios 1.x, which ships as
 *   ESM and cannot be loaded by CRA's Jest 27, and the page/header/cards/chatbot call several
 *   endpoints on mount. Mount-path calls get inert resolved values (see `resetApiMocks`).
 * - analytics/posthog: `track` becomes a jest.fn so tests can assert events; the rest is real.
 * - react-router-dom: resolution shim only, not a behaviour mock. v7.9.1 declares
 *   `"main": "./dist/main.js"`, which does not exist; its real entry points are only in the
 *   package `exports` map, which Jest 27 (CRA 5) does not read. The shims load the real
 *   `react-router-dom/dist/index.js` and the `react-router/dom` subpath it requires, and
 *   polyfill TextEncoder/TextDecoder (React Router 7 needs them; Jest 27's jsdom lacks them).
 * - date-fns/{format,isValid,formatDistanceToNow}: resolution shims only. date-fns 4 subpaths
 *   resolve to ESM `.js` files under Jest 27; the shims load the published `.cjs` builds.
 *
 * Environment set-up done by `renderPipelinePage`:
 * - MemoryRouter at /pipeline (the header and toolbox call useNavigate).
 * - A fresh QueryClient with retries disabled (SystemInputCard uses @tanstack/react-query).
 * - sessionStorage cleared; localStorage `pipeline_feedback_handled` set so the 15-minute
 *   feedback interval timer is never started.
 * - window.confirm stubbed to `true` (used by the existing "Clear All" action).
 *
 * Isolation caveat: PipelinePage keeps canvas state in a module-level `inMemoryPipelineCache`
 * that survives unmounts. `renderPipelinePage` therefore empties a non-empty canvas through
 * the existing toolbar "Clear All" action before returning, so each test starts from an empty
 * canvas.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PipelinePage from '../PipelinePage';
import * as api from '../../../services/api';
import { track } from '../../../analytics/posthog';

jest.mock('../../../services/api', () => ({
    fetchIRFromRepo: jest.fn(),
    checkHistoricalIRs: jest.fn(),
    fetchHistoricalIRs: jest.fn(),
    fetchIRVersions: jest.fn(),
    fetchSpecificIRs: jest.fn(),
    deleteIR: jest.fn(),
    getSystemVersionMetadata: jest.fn(),
    updateIRVersion: jest.fn(),
    fetchChangeImpact: jest.fn(),
    saveSession: jest.fn(),
    getAvailableSessions: jest.fn(),
    loadSession: jest.fn(),
    deleteSession: jest.fn(),
    verifySystem: jest.fn(),
    createComponent: jest.fn(),
    generateAuthVectors: jest.fn(),
    generateScenarios: jest.fn(),
    generateTestSuites: jest.fn(),
    generatePrompts: jest.fn(),
    analyzeAegis: jest.fn(),
    importOrganization: jest.fn(),
    fetchBranchCommits: jest.fn(),
    fetchRepoMetadata: jest.fn(),
    saveGitHubToken: jest.fn(),
    deleteGitHubToken: jest.fn(),
    checkGitHubTokenStatus: jest.fn(),
    getChatbotHealth: jest.fn(),
    sendChatbotQuery: jest.fn(),
    refreshChatbotContext: jest.fn(),
    generateChangeImpactInsights: jest.fn(),
    executeTest: jest.fn(),
    recordUserFeedback: jest.fn(),
    startUserSession: jest.fn(),
    checkEndedSessionsExists: jest.fn(),
    endUserSession: jest.fn(),
    summarizePipelineResults: jest.fn(),
}));

jest.mock('react-router-dom', () => {
    // React Router 7 uses TextEncoder/TextDecoder, which Jest 27's jsdom environment lacks.
    const { TextEncoder, TextDecoder } = jest.requireActual('util');
    Object.assign(global, { TextEncoder, TextDecoder });
    return jest.requireActual('react-router-dom/dist/index.js');
}, { virtual: true });
jest.mock('react-router/dom', () => jest.requireActual('react-router/dist/development/dom-export.js'), { virtual: true });

// date-fns 4 subpath imports resolve to ESM `.js` files without `exports` support; load the
// published CommonJS builds instead (SystemInputCard imports these three).
jest.mock('date-fns/format', () => jest.requireActual('date-fns/format.cjs'));
jest.mock('date-fns/isValid', () => jest.requireActual('date-fns/isValid.cjs'));
jest.mock('date-fns/formatDistanceToNow', () => jest.requireActual('date-fns/formatDistanceToNow.cjs'));

jest.mock('../../../analytics/posthog', () => ({
    ...jest.requireActual('../../../analytics/posthog'),
    track: jest.fn(),
}));

export const mockedApi = api as jest.Mocked<typeof api>;
export const mockedTrack = track as jest.MockedFunction<typeof track>;

/** Resets every API mock and installs inert defaults for calls made while mounting. */
export const resetApiMocks = (): void => {
    Object.values(mockedApi).forEach((fn) => {
        if (jest.isMockFunction(fn)) fn.mockReset();
    });
    mockedApi.getChatbotHealth.mockResolvedValue({
        status: 'healthy',
        provider: 'OLLAMA',
        model: 'llama3.2',
        baseUrl: 'http://localhost:11434',
        message: 'ok',
        checkedAt: new Date(0).toISOString(),
        latencyMs: 1,
    });
    mockedApi.refreshChatbotContext.mockResolvedValue({
        success: true,
        refreshedArtifactCountsByType: {},
        unavailableProviders: [],
        refreshedAt: new Date(0).toISOString(),
        refreshVersion: 'test',
        message: 'ok',
        staleContext: false,
    });
    mockedApi.checkGitHubTokenStatus.mockResolvedValue(true);
    mockedApi.getAvailableSessions.mockResolvedValue({
        sessions: [],
        currentPage: 0,
        totalPages: 0,
        totalElements: 0,
    });
    mockedTrack.mockReset();
};

/** Empties the canvas through the existing toolbar "Clear All" action, if it is shown. */
export const clearCanvasViaToolbar = async (): Promise<void> => {
    const clearAll = screen.queryByRole('button', { name: /clear all/i });
    if (!clearAll) return;
    fireEvent.click(clearAll);
    await waitFor(() => expect(screen.queryByRole('button', { name: /clear all/i })).toBeNull());
};

export const renderPipelinePage = async () => {
    resetApiMocks();
    sessionStorage.clear();
    localStorage.setItem('pipeline_feedback_handled', 'true');
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    });

    const utils = render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/pipeline']}>
                <PipelinePage />
            </MemoryRouter>
        </QueryClientProvider>
    );

    // Let mount-time effects (chatbot health check, GitHub token status) settle inside act().
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await clearCanvasViaToolbar();

    return { ...utils, queryClient };
};
