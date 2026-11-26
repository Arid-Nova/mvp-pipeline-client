// The VM deploy depends on USE_PROXY: without it the browser calls localhost:<port>.
const load = (env: Record<string, string | undefined>) => {
    let mod: typeof import('../serviceUrls') | undefined;
    jest.isolateModules(() => {
        jest.doMock('../../config', () => ({ env }));
        mod = require('../serviceUrls');
    });
    return mod!;
};

afterEach(() => jest.dontMock('../../config'));

describe('serviceUrls behind the Caddy proxy', () => {
    const urls = load({ USE_PROXY: 'true', VERIFY_SERVICE_URL: 'http://localhost:9000', IR_SERVICE_URL: 'http://localhost:8080' });

    it('uses same-origin /api/<slug> paths even when per-service URLs are configured', () => {
        expect(urls.serviceURL('verifier', 'http://localhost:9000', 9000)).toBe('/api/verifier');
        expect(urls.serviceURL('slm', undefined, 8071)).toBe('/api/slm');
    });

    it('points the backend and Aegis dashboard at their proxy paths', () => {
        expect(urls.backendURL()).toBe('/api/backend');
        expect(urls.aegisDashboardURL()).toBe('/aegis-ui');
    });
});

describe('serviceUrls in local development', () => {
    it('uses the configured per-service URL', () => {
        const urls = load({ IR_SERVICE_URL: 'http://ir.local:8080' });
        expect(urls.serviceURL('verifier', 'http://verify.local:9000', 9000)).toBe('http://verify.local:9000');
        expect(urls.backendURL()).toBe('http://ir.local:8080');
    });

    it('falls back to localhost:<port> when nothing is configured', () => {
        const urls = load({});
        expect(urls.serviceURL('test', undefined, 8030)).toBe('http://localhost:8030');
        expect(urls.backendURL()).toBe('http://localhost:8080');
        expect(urls.aegisDashboardURL()).toBe('http://localhost:5600');
    });

    it('treats any USE_PROXY value other than "true" as off', () => {
        const urls = load({ USE_PROXY: 'false' });
        expect(urls.serviceURL('user', undefined, 8100)).toBe('http://localhost:8100');
    });
});

export {};
