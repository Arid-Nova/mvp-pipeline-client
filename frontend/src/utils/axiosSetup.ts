import axios, { AxiosInstance } from 'axios';
import Logger from "js-logger";
import { env } from '../config';
import { serviceURL, backendURL } from './serviceUrls';

export { aegisDashboardURL, backendURL } from './serviceUrls';

export const controller = new AbortController();

export const VERIFY_API = axios.create({ baseURL: serviceURL('verifier', env.VERIFY_SERVICE_URL, 9000) });
export const COMPONENT_API = axios.create({ baseURL: serviceURL('components', env.COMPONENT_SERVICE_URL, 8060) });
export const VECTOR_API = axios.create({ baseURL: serviceURL('vector', env.VECTOR_SERVICE_URL, 8050) });
export const ANALYSIS_API = axios.create({ baseURL: serviceURL('scenario', env.ANALYSIS_SERVICE_URL, 8040) });
export const TEST_API = axios.create({ baseURL: serviceURL('test', env.TEST_SERVICE_URL, 8030) });
export const AEGIS_API = axios.create({ baseURL: serviceURL('aegis', env.AEGIS_SERVICE_URL, 8900) });
export const REPO_API = axios.create({ baseURL: serviceURL('repo', env.REPO_SERVICE_URL, 8020) });  // Not replicated in coordinator. Frontend only.
export const EXECUTOR_API = axios.create({ baseURL: serviceURL('executor', env.EXEC_SERVICE_URL, 8010) }); // Not replicated in coordinator. Frontend only.
export const USER_API = axios.create({ baseURL: serviceURL('user', env.USER_SERVICE_URL, 8100) }); // Not replicated in coordinator. Frontend only.
export const CHATBOT_API = axios.create({ baseURL: serviceURL('chatbot', env.CHATBOT_SERVICE_URL, 8081) }); // Not replicated in coordinator. Frontend only.
export const SLMBACKEND_API = axios.create({ baseURL: serviceURL('slm', env.SLMBACKEND_SERVICE_URL, 8071) }); // Not replicated in coordinator. Frontend only.

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

[axios, VERIFY_API, COMPONENT_API, VECTOR_API, ANALYSIS_API, TEST_API, EXECUTOR_API, AEGIS_API, REPO_API, USER_API, CHATBOT_API].forEach(applyInterceptors);

export const setupAxios = () => {
    axios.defaults.baseURL = backendURL();
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
