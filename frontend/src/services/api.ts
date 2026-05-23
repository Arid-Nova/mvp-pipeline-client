import axios, { 
    VERIFY_API, COMPONENT_API, VECTOR_API, 
    ANALYSIS_API, TEST_API, AEGIS_API, REPO_API 
} from '../utils/axiosSetup';
import { showError } from '../utils/notifications';
import {
    RepositoryInput,
    VerificationInput,
    VerificationResponse,
    OrgImportResponse,
    SessionPageResponse,
    ChangeImpactInsight,
    ChatbotQueryRequest,
    ChatbotResponse,
    ChatbotHealthResponse,
    ChatbotContextRefreshRequest,
    ChatbotContextRefreshResponse
} from './types';
import { PromptItem } from '../components/pipeline/models';
import { decompressPayload, decompressGzipResponse } from '../utils/decompress';

// IR generation and retrieval functions
export const fetchIRFromRepo = async (input: RepositoryInput) => {
    try {
        const response = await axios.post('/ir/create', input, {
            responseType: 'blob' 
        });
        return await decompressGzipResponse(response.data);
    } catch (error: any) {
        let msg = "Failed to generate IR from repository.";

        if (error.response?.data instanceof Blob) {
            const errorText = await error.response.data.text();
            try {
                const errorJson = JSON.parse(errorText);
                msg = errorJson.message || msg;
            } catch {
                console.log("Failed to parse error response:");
            }
        } else if (error.response?.data?.message) {
            msg = error.response.data.message;
        }

        showError(msg);
        throw error;
    }
};

export const checkHistoricalIRs = async (systemName: string): Promise<boolean> => {
    try {
        const response = await axios.get('/ir/meta', { 
            params: { systemName }
        });
        return response.status === 200;
    } catch (error: any) {
        console.error("Failed to check historical IRs:", error);
        return false;
    }
};

export const fetchHistoricalIRs = async (systemName: string): Promise<any[]> => {
    try {
        const response = await axios.get('/ir', { 
            params: { systemName },
            responseType: 'blob'
        });
        return await decompressGzipResponse(response.data);
    } catch (error: any) {
        console.error("Failed to fetch historical IRs:", error);
        showError("Failed to load historical timeline data.");
        throw error;
    }
};

// Change impact analysis function
export const fetchChangeImpact = async (deltaInput: any) => {
    try {
        const response = await axios.post('/ir/delta', deltaInput, {
            responseType: 'blob'
        });

        return await decompressGzipResponse(response.data);
    }
    catch (error: any) {
        throw new Error(error.response?.data?.detail || "Delta API error");
    }
};

// Session management functions
export const saveSession = async (name: string, canvasData: any, sessionId?: string): Promise<string> => {
    // Compresing the session data
    const jsonString = JSON.stringify(canvasData);
    const stream = new Blob([jsonString]).stream().pipeThrough(new CompressionStream('gzip'));
    const compressedBlob = await new Response(stream).blob();

    const formData = new FormData();
    formData.append('name', name);
    if (sessionId) {
        formData.append('session_id', sessionId);
    }

    formData.append('canvas_data_file', compressedBlob, 'canvas.json.gz');

    const response = await axios.post('/sessions', formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });

    return response.data.session_id; 
};

export const getAvailableSessions = async (page: number = 0, size: number = 10): Promise<SessionPageResponse> => {
    const response = await axios.get('/sessions', {
        params: { page, size }
    });
    return response.data;
};

export const loadSession = async (sessionId: string): Promise<any> => {
    // Metadata about the session
    const metaResponse = await axios.get(`/sessions/${sessionId}`);
    const sessionName = metaResponse.data.name;

    // Retreiving the compressed binary blob
    const fileResponse = await axios.get(`/sessions/${sessionId}/canvas`, {
        responseType: 'blob'
    });

    // Decompressing
    const compressedStream = fileResponse.data.stream();
    const decompressionStream = new DecompressionStream('gzip');
    const decompressedStream = compressedStream.pipeThrough(decompressionStream);
    
    const decompressedText = await new Response(decompressedStream).text();
    const canvasData = JSON.parse(decompressedText);

    return {
        name: sessionName,
        canvas_data: canvasData
    };
};

export const deleteSession = async (sessionId: string): Promise<void> => {
    await axios.delete(`/sessions/${sessionId}`);
};

// Formal verification function
export const verifySystem = async (input: VerificationInput): Promise<VerificationResponse> => {
    try {
        const response = await VERIFY_API.post('/verify', input);
        return response.data;
    } catch (error: any) {
        const msg = error.response?.data?.message || "Verification service unreachable.";
        showError(msg);
        throw error;
    }
};

// AI Test generation functions
export const createComponent = async (reqBody: any) => {
    try {
        const response = await COMPONENT_API.post('/component/create', reqBody);
        return response.data;
    } catch (error: any) {
        throw new Error(error.response?.data?.detail || "Component creation error.");
    }
};

export const generateAuthVectors = async (indexId: string) => {
    try {
        const response = await VECTOR_API.post('/vectors/generate-all', { indexId: indexId });
        let int_result = response.data;
        int_result['vectors'] = decompressPayload(int_result.vectors);
        return int_result;
    } catch (error: any) {
        throw new Error(error.response?.data?.detail || "Vector generation error.");
    }
};

export const generateScenarios = async (indexId: string|undefined, vectorsId: string|undefined) => {
    try {
        const response = await ANALYSIS_API.post('/scenarios/generate', {   
            index_id: indexId,
            vectors_id: vectorsId
        });
        return response.data;
    } catch (error: any) {
        throw new Error(error.response?.data?.detail || "Scenario generation error.");
    }
};

export const generateTestSuites = async (selectedLlm: string, prompts: PromptItem[] | undefined) => {
    try {
        const response = await TEST_API.post('/testsuites/generate', { 
            llm_model: selectedLlm,
            prompts: prompts 
        });
        return response.data;
    } catch (error: any) {
        throw new Error(error.response?.data?.detail || "Test Generation error");
    }
};

export const generatePrompts = async (selectedIds: string[], targetLanguage: string) => {
    try {
        const response = await ANALYSIS_API.post('/scenarios/prompts/generate', { 
            scenario_ids: selectedIds, 
            language: targetLanguage 
        });
        return response.data;
    } catch (error: any) {
        throw new Error(error.response?.data?.detail || "Prompt generation error");
    }
};

// Aegis introspection functions 
export const analyzeAegis = async (enginePayload: any) => {
    try {
        const response = await AEGIS_API.post('/analyze', enginePayload);
        return response.data;
    } catch (error: any) {
        throw new Error(error.response?.data?.detail || "Aegis API error");
    }
};

// GitHub repository management functions
export const importOrganization = async (orgUrl: string): Promise<OrgImportResponse> => {
    try {
        const response = await REPO_API.post('/import/organization', { org_url: orgUrl });
        return response.data;
    } catch (error: any) {
        const errorMessage = error.response?.data?.detail || "API error: Failed to import organization";
        showError(errorMessage);
        throw new Error(errorMessage);
    }
};

export const saveGitHubToken = async (token: string) => {
    try {
        const response = await REPO_API.post('/settings/github-token', { github_token: token });
        return response.data;
    } catch (error: any) {
        throw new Error(error.response?.data?.detail || "API error saving GitHub token");
    }
};

export const deleteGitHubToken = async () => {
    try {
        const response = await REPO_API.delete('/settings/github-token');
        return response.data;
    } catch (error: any) {
        throw new Error(error.response?.data?.detail || "API error deleting GitHub token");
    }
};

export const checkGitHubTokenStatus = async () => {
    try {
        const response = await REPO_API.get('/settings/github-token/status');
        return response.data.hasToken;
    } catch (error) {
        console.error("Failed to check token status", error);
        return false; 
    }
};

const normalizeChatbotError = (error: any): string => {
    const backendMessage =
        (typeof error?.response?.data?.message === "string" && error.response.data.message.trim())
            ? error.response.data.message.trim()
            : (typeof error?.response?.data === "string" && error.response.data.trim())
                ? error.response.data.trim()
                : "";

    if (error?.response?.status === 503) {
        return backendMessage || "Chatbot runtime is currently unavailable. Please ensure the local model runtime is running.";
    }
    if (error?.response?.status === 400) {
        return backendMessage || "Invalid chatbot request. Please check your question and context.";
    }
    if (!error?.response) {
        return "Network error while contacting chatbot backend.";
    }
    return backendMessage || "Chatbot request failed.";
};

export const getChatbotHealth = async (): Promise<ChatbotHealthResponse> => {
    try {
        const response = await axios.get('/chatbot/health');
        return response.data;
    } catch (error: any) {
        const msg = normalizeChatbotError(error);
        showError(msg);
        throw new Error(msg);
    }
};

export const sendChatbotQuery = async (request: ChatbotQueryRequest): Promise<ChatbotResponse> => {
    try {
        const response = await axios.post('/chatbot/query', request);
        return response.data;
    } catch (error: any) {
        const msg = normalizeChatbotError(error);
        showError(msg);
        throw new Error(msg);
    }
};

export const refreshChatbotContext = async (request: ChatbotContextRefreshRequest): Promise<ChatbotContextRefreshResponse> => {
    try {
        const response = await axios.post('/chatbot/context/refresh', request);
        return response.data;
    } catch (error: any) {
        const msg = normalizeChatbotError(error);
        showError(msg);
        throw new Error(msg);
    }
};

// Change Impact Analysis
export const generateChangeImpactInsights = async (payload: ChangeImpactInsight) => {
    const jsonString = JSON.stringify(payload);
    const stream = new Blob([jsonString]).stream();

    const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
    const compressedBody = await new Response(compressedStream).blob();

    try {
        const response = await ANALYSIS_API.post('/analysis/impact-insights', compressedBody, {
            headers: { 'Content-Encoding': 'gzip' } 
        });
        return response.data;
    } catch (error: any) {
        throw new Error(error.response?.data?.detail || "API error generating impact insights");
    }
};
