import { CHATBOT_API } from '../utils/axiosSetup';
import { requestPipelineIntents } from './api';
import { PipelineIntentRequest } from './types';

// axios 1.x ships ESM that Jest 27 can't load, so the configured instances are replaced here.
jest.mock('../utils/axiosSetup', () => ({
    __esModule: true,
    default: { isCancel: (error: { __CANCEL__?: boolean }) => Boolean(error?.__CANCEL__) },
    CHATBOT_API: { post: jest.fn(), get: jest.fn() },
}));

const post = CHATBOT_API.post as jest.Mock;

const request = (overrides: Partial<PipelineIntentRequest> = {}): PipelineIntentRequest => ({
    goal: 'I want to visualize the architecture and check authorization problems.',
    suggestionSetId: '3f2b8c1e-9a4d-4e6f-b1c2-7d8e9f0a1b2c',
    attempt: 1,
    catalog: { catalogVersion: 'pcat-0861a6885a178a', cards: [] },
    catalogVersion: 'pcat-0861a6885a178a',
    excludeCapabilitySets: [],
    rejectionFeedback: [],
    ...overrides,
});

const httpError = (status: number, data: unknown = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });

describe('requestPipelineIntents', () => {
    beforeEach(() => post.mockReset());

    it('POSTs the request body to /chatbot/pipeline/intents with the signal and timeout', async () => {
        post.mockResolvedValue({ status: 200, data: { outcome: 'OK' } });
        const controller = new AbortController();
        const body = request();

        await requestPipelineIntents(body, { signal: controller.signal, timeoutMs: 42_000 });

        expect(post).toHaveBeenCalledTimes(1);
        const [url, sent, config] = post.mock.calls[0];
        expect(url).toBe('/chatbot/pipeline/intents');
        expect(url).not.toContain('/plan');
        expect(sent).toBe(body);
        expect(config).toEqual({ signal: controller.signal, timeout: 42_000 });
    });

    it('serializes attempt 2 with its retry inputs unchanged', async () => {
        post.mockResolvedValue({ status: 200, data: {} });
        const retry = request({
            attempt: 2,
            excludeCapabilitySets: [['VISUALIZATION', 'AEGIS']],
            rejectionFeedback: ['Problem: DUPLICATE_TIER'],
        });

        await requestPipelineIntents(retry);

        const sent = JSON.parse(JSON.stringify(post.mock.calls[0][1]));
        expect(sent).toEqual({
            goal: retry.goal,
            suggestionSetId: '3f2b8c1e-9a4d-4e6f-b1c2-7d8e9f0a1b2c',
            attempt: 2,
            catalog: retry.catalog,
            catalogVersion: 'pcat-0861a6885a178a',
            excludeCapabilitySets: [['VISUALIZATION', 'AEGIS']],
            rejectionFeedback: ['Problem: DUPLICATE_TIER'],
        });
    });

    it('returns the response body as untrusted data, without interpreting it', async () => {
        const data = { outcome: 'OK', options: [{ nodes: [1], whatever: true }], extra: 'kept' };
        post.mockResolvedValue({ status: 200, data });

        const result = await requestPipelineIntents(request());

        expect(result).toEqual({ kind: 'response', status: 200, data });
        expect((result as { data?: unknown }).data).toBe(data);
    });

    it.each([
        ['503 MODEL_UNAVAILABLE', httpError(503, { outcome: 'MODEL_UNAVAILABLE' }), { kind: 'model_unavailable', status: 503, data: { outcome: 'MODEL_UNAVAILABLE' } }],
        ['400 validation error', httpError(400, { message: 'goal must be at most 1000 characters.' }), { kind: 'request_invalid', status: 400 }],
        ['500 server error', httpError(500), { kind: 'http_error', status: 500 }],
        ['404 (wrong endpoint)', httpError(404), { kind: 'http_error', status: 404 }],
        ['network error', new Error('Network Error'), { kind: 'network_error' }],
        ['client timeout', Object.assign(new Error('timeout of 42000ms exceeded'), { code: 'ECONNABORTED' }), { kind: 'timeout' }],
        ['cancellation', Object.assign(new Error('canceled'), { __CANCEL__: true }), { kind: 'cancelled' }],
    ])('maps %s to a typed result instead of throwing', async (_name, error, expected) => {
        post.mockRejectedValue(error);

        await expect(requestPipelineIntents(request())).resolves.toEqual(expected);
    });

    it('reports cancelled when the caller aborted, whatever error the client raised', async () => {
        const controller = new AbortController();
        controller.abort();
        post.mockRejectedValue(new Error('aborted'));

        await expect(requestPipelineIntents(request(), { signal: controller.signal })).resolves.toEqual({ kind: 'cancelled' });
    });
});
