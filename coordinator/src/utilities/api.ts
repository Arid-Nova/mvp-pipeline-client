import axios from 'axios';
import zlib from 'node:zlib';

import { API_URLS } from './uris';
import { decompressPayload } from './utils'

export const api = {
    // Fetches the saved session (pipeline configuration).
    fetchSessionCanvas: async (sessionId: string) => {
        const response = await axios.get(`${API_URLS.SESSION}/sessions/${sessionId}/canvas`, {
            responseType: 'arraybuffer'
        });

        const decompressedBuffer = zlib.gunzipSync(response.data);
        const canvasData = JSON.parse(decompressedBuffer.toString('utf-8'));
        return canvasData;
    },

    // Generate or fetch IR.
    fetchIR: async (input: any) => {
        const response = await axios.post(`${API_URLS.IR}/ir/create`, input, {
                responseType: 'arraybuffer'
            });
        const decompressedBuffer = zlib.gunzipSync(response.data);
        return JSON.parse(decompressedBuffer.toString('utf-8'));
    },

    // Generates components based on the IR and roles.
    generateComponents: async (input: any) => {
        const response = await axios.post(`${API_URLS.COMPONENT}/component/create`, input);
        return response.data;
    },

    // Generates authorization vectors.
    generateVectors: async (indexId: string) => {
        const response = await axios.post(`${API_URLS.VECTOR}/vectors/generate-all`, { indexId });
        let int_result = response.data;
        int_result['vectors'] = decompressPayload(int_result.vectors);
        return int_result;
    },

    // Runs formal verification on the system.
    verifySystem: async (input: any) => {
        const response = await axios.post(`${API_URLS.VERIFY}/verify`, input);
        return response.data;
    },

    // Generate auth testing scenarioes.
    generateScenarios: async (indexId: string, authVecId: string) => {
        const response = await axios.post(`${API_URLS.ANALYSIS}/scenarios/generate`, {
            index_id: indexId,
            vectors_id: authVecId
        });
        return response.data;
    },

    // Prompting the LLM to generate actual test cases.
    generateTestSuites: async (llm: string, prompts: any[]) => {
        const response = await axios.post(`${API_URLS.TEST}/testsuites/generate`, {
            llm_model: llm,
            prompts: prompts 
        });
        return response.data;
    },

    // Generate prompts for the selected scenarios.
    generatePrompts: async (selectedIds: string[], targetLanguage: string) => {
        const response = await axios.post(`${API_URLS.ANALYSIS}/scenarios/prompts/generate`, {
            scenario_ids: selectedIds, 
            language: targetLanguage 
        });
        return response.data;
    },

    // Caling Aegis
    analyzeAegis: async (input: any) => {
        const response = await axios.post(`${API_URLS.AEGIS}/analyze`, input);
        return response.data;
    },

    // Analyzes codebase delta for change impact.
    analyzeDelta: async (input: any) => {
        const response = await axios.post(`${API_URLS.IR}/ir/delta`, input, {
                responseType: 'arraybuffer'
            });
        const decompressedBuffer = zlib.gunzipSync(response.data);
        return JSON.parse(decompressedBuffer.toString('utf-8'));
    }
};