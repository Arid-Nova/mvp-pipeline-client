"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = void 0;
const axios_1 = __importDefault(require("axios"));
const node_zlib_1 = __importDefault(require("node:zlib"));
const uris_1 = require("./uris");
const utils_1 = require("./utils");
exports.api = {
    // Fetches the saved session (pipeline configuration).
    fetchSessionCanvas: async (sessionId) => {
        const response = await axios_1.default.get(`${uris_1.API_URLS.SESSION}/sessions/${sessionId}/canvas`, {
            responseType: 'arraybuffer'
        });
        const decompressedBuffer = node_zlib_1.default.gunzipSync(response.data);
        const canvasData = JSON.parse(decompressedBuffer.toString('utf-8'));
        return canvasData;
    },
    // Generate or fetch IR.
    fetchIR: async (input) => {
        const response = await axios_1.default.post(`${uris_1.API_URLS.IR}/ir/create`, input, {
            responseType: 'arraybuffer'
        });
        const decompressedBuffer = node_zlib_1.default.gunzipSync(response.data);
        return JSON.parse(decompressedBuffer.toString('utf-8'));
    },
    // Generates components based on the IR and roles.
    generateComponents: async (input) => {
        const response = await axios_1.default.post(`${uris_1.API_URLS.COMPONENT}/component/create`, input);
        return response.data;
    },
    // Generates authorization vectors.
    generateVectors: async (indexId) => {
        const response = await axios_1.default.post(`${uris_1.API_URLS.VECTOR}/vectors/generate-all`, { indexId });
        let int_result = response.data;
        int_result['vectors'] = (0, utils_1.decompressPayload)(int_result.vectors);
        return int_result;
    },
    // Runs formal verification on the system.
    verifySystem: async (input) => {
        const response = await axios_1.default.post(`${uris_1.API_URLS.VERIFY}/verify`, input);
        return response.data;
    },
    // Generate auth testing scenarioes.
    generateScenarios: async (indexId, authVecId) => {
        const response = await axios_1.default.post(`${uris_1.API_URLS.ANALYSIS}/scenarios/generate`, {
            indexId,
            authVecId
        });
        return response.data;
    },
    // Prompting the LLM to generate actual test cases.
    generateTestSuites: async (llm, prompts) => {
        const response = await axios_1.default.post(`${uris_1.API_URLS.TEST}/tests/generate`, {
            llm_model: llm,
            prompts: prompts
        });
        return response.data;
    },
    // Generate prompts for the selected scenarios.
    generatePrompts: async (selectedIds, targetLanguage) => {
        const response = await axios_1.default.post(`${uris_1.API_URLS.ANALYSIS}/scenarios/prompts/generate`, {
            scenario_ids: selectedIds,
            language: targetLanguage
        });
        return response.data;
    },
    // Caling Aegis
    analyzeAegis: async (input) => {
        const response = await axios_1.default.post(`${uris_1.API_URLS.AEGIS}/analyze`, input);
        return response.data;
    },
    // Analyzes codebase delta for change impact.
    analyzeDelta: async (input) => {
        const response = await axios_1.default.post(`${uris_1.API_URLS.IR}/ir/delta`, input, {
            responseType: 'arraybuffer'
        });
        const decompressedBuffer = node_zlib_1.default.gunzipSync(response.data);
        return JSON.parse(decompressedBuffer.toString('utf-8'));
    }
};
