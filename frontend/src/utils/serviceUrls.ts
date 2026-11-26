import { env } from '../config';

// When USE_PROXY is "true" (the Azure VM deploy, set by docker-compose.prod.yaml),
// the frontend makes same-origin /api/<service>/* requests that Caddy reverse-proxies
// to each container. Otherwise (local dev) it uses the per-service URL from the
// runtime config, falling back to localhost:<port>.
// Kept free of axios so components that only need a URL don't load it.
const useProxy = env.USE_PROXY === 'true';

export const serviceURL = (slug: string, configured: string | undefined, devPort: number): string =>
    useProxy ? `/api/${slug}` : (configured || `http://localhost:${devPort}`);

// Base URL for the aegis Flask dashboard (HTML UI). Used by code that does
// window.open / window.location for the /visualize view.
export const aegisDashboardURL = (): string =>
    useProxy ? '/aegis-ui' : 'http://localhost:5600';

// Base URL for the Spring backend's own API. Most calls go through the default
// axios instance whose baseURL is set in setupAxios(), but a few sites need
// the URL string directly (e.g. for force-graph link sources).
export const backendURL = (): string => serviceURL('backend', env.IR_SERVICE_URL, 8080);
