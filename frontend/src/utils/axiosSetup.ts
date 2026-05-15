import axios, { AxiosInstance } from 'axios';
import Logger from "js-logger";

export const controller = new AbortController();

// When REACT_APP_USE_PROXY=true (set at build time for prod/Azure VM deploy),
// the frontend makes same-origin /api/<service>/* requests that Caddy reverse-proxies
// to each container. Otherwise (local dev), it talks to localhost:<port> directly.
const useProxy = process.env.REACT_APP_USE_PROXY === 'true';
const serviceURL = (slug: string, devPort: number) =>
    useProxy ? `/api/${slug}` : `http://localhost:${devPort}`;

export const VERIFY_API = axios.create({ baseURL: serviceURL('verifier', 9000) });
export const COMPONENT_API = axios.create({ baseURL: serviceURL('components', 8060) });
export const VECTOR_API = axios.create({ baseURL: serviceURL('vector', 8050) });
export const ANALYSIS_API = axios.create({ baseURL: serviceURL('scenario', 8040) });
export const TEST_API = axios.create({ baseURL: serviceURL('test', 8030) });
export const EXECUTOR_API = axios.create({ baseURL: serviceURL('executor', 8010) });
export const AEGIS_API = axios.create({ baseURL: serviceURL('aegis', 8900) });
export const REPO_API = axios.create({ baseURL: serviceURL('repo', 8020) });

// Base URL for the aegis Flask dashboard (HTML UI). Used by code that does
// window.open / window.location for the /visualize view.
export const aegisDashboardURL = (): string =>
    useProxy ? '/aegis-ui' : 'http://localhost:5600';

// Base URL for the Spring backend's own API. Most calls go through the default
// axios instance whose baseURL is set in setupAxios(), but a few sites need
// the URL string directly (e.g. for force-graph link sources).
export const backendURL = (): string => serviceURL('backend', 8080);

// Helper function for logging
const applyInterceptors = (instance: AxiosInstance) => {
    instance.interceptors.response.use(
        function (response) {
            try {
                Logger.info(
                    `${response?.config?.method?.toLocaleUpperCase()} from ${
                        response.config.url
                    }`
                );
            } catch {
                Logger.warn(
                    "Axios response successful, but there was an issue in axios interceptor"
                );
            }
            return response;
        },
        function (error) {
            try {
                Logger.error(error.message);
            } catch (e) {
                Logger.warn("There was an issue in the axios interceptor:", e);
            }
            return Promise.reject(error);
        }
    );

    instance.interceptors.request.use(
        function (request) {
            if (!request.baseURL) {
                throw new axios.Cancel("No baseURL Set");
            }
            try {
                Logger.info(
                    `Sent ${request?.method?.toLocaleUpperCase()} to ${request.url}`
                );
            } catch {
                Logger.warn(
                    "Axios request successful, but there was an issue in axios request interceptor"
                );
            }
            return request;
        },
        function (error) {
            try {
                Logger.error(error);
            } catch (e) {
                Logger.warn(
                    "There was an issue in the axios request interceptor:",
                    e
                );
            }
            return Promise.reject(error);
        }
    );
};

[axios, VERIFY_API, COMPONENT_API, VECTOR_API, ANALYSIS_API, TEST_API, EXECUTOR_API, AEGIS_API, REPO_API].forEach(applyInterceptors);

export const setupAxios = () => {
    axios.defaults.baseURL = serviceURL('backend', 8080);
    axios.defaults.headers.common["Content-Type"] = "application/json";
};

export const setupLogger = () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    Logger.useDefaults({
        defaultLevel: Logger.DEBUG,
        formatter: function (messages: any, context: any) {
            messages.unshift(`color : ${colorLog(context.level)}`);
            messages.unshift(`%c[${context.level.name}]: `);
        },
    });

    // LOW -> HIGH: TRACE, DEBUG, INFO, TIME, WARN, ERROR, OFF
    Logger.setLevel(Logger.TRACE);

    function colorLog(level: any) {
        let color;
        switch (level) {
            case Logger.DEBUG:
                color = "Green";
                break;
            case Logger.INFO:
                color = "DodgerBlue";
                break;
            case Logger.ERROR:
                color = "Red";
                break;
            case Logger.WARN:
                color = "Orange";
                break;
            default:
                color = null;
        }
        return color;
    }
};

export default axios;