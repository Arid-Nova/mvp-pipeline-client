import axios, { AxiosInstance } from 'axios';
import Logger from "js-logger";

export const controller = new AbortController();

// Service configurations
export const VERIFY_API = axios.create({ baseURL: process.env.VERIFY_SERVICE_URL || 'http://localhost:9000' });
export const COMPONENT_API = axios.create({ baseURL: process.env.COMPONENT_SERVICE_URL || 'http://localhost:8060' });
export const VECTOR_API = axios.create({ baseURL: process.env.VECTOR_SERVICE_URL || 'http://localhost:8050' });
export const ANALYSIS_API = axios.create({ baseURL: process.env.ANALYSIS_SERVICE_URL || 'http://localhost:8040' });
export const TEST_API = axios.create({ baseURL: process.env.TEST_SERVICE_URL || 'http://localhost:8030' });
export const AEGIS_API = axios.create({ baseURL: process.env.AEGIS_SERVICE_URL || 'http://localhost:8900' });
export const REPO_API = axios.create({ baseURL: process.env.REPO_SERVICE_URL || 'http://localhost:8020'});
export const USER_API = axios.create({ baseURL: process.env.USER_SERVICE_URL || 'http://localhost:8010'});

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

[axios, VERIFY_API, COMPONENT_API, VECTOR_API, ANALYSIS_API, TEST_API, AEGIS_API, REPO_API].forEach(applyInterceptors);

export const setupAxios = () => {
    axios.defaults.baseURL = process.env.IR_SERVICE_URL || 'http://localhost:8080';
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