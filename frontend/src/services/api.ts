import axios, { 
    VERIFY_API, COMPONENT_API, VECTOR_API, 
    ANALYSIS_API, TEST_API, AEGIS_API, REPO_API, 
    USER_API, EXECUTOR_API
} from '../utils/axiosSetup';
import { showError } from '../utils/notifications';
import {
    RepositoryInput, VerificationInput, VerificationResponse,
    OrgImportResponse, SessionPageResponse, ChangeImpactInsight,
    RepoMetadata, CommitPageResponse,
    UserFeedback,
} from './types';
import { PromptItem } from '../components/pipeline/models';
import { decompressPayload, decompressGzipResponse } from '../utils/decompress';

// IR generation and retrieval functions
export const fetchIRFromRepo = async (input: RepositoryInput, options?: { signal?: AbortSignal }) => {
    try {
        const response = await axios.post('/ir/create', input, {
            responseType: 'blob',
            signal: options?.signal 
        });
        return await decompressGzipResponse(response.data);
    } catch (error: any) {
        if (axios.isCancel(error)) {
            console.log("Request canceled by user.");
            throw new Error("AbortError"); 
        }

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

export const checkHistoricalIRs = async (systemName: string, options?: { signal?: AbortSignal }): Promise<boolean> => {
    try {
        const response = await axios.get('/ir/meta', { 
            params: { systemName },
            signal: options?.signal
        });
        return response.status === 200;
    } catch (error: any) {
        if (axios.isCancel(error)) {
            console.log("Historical IR check canceled by user.");
            throw new Error("AbortError"); 
        }
        console.error("Failed to check historical IRs:", error);
        return false;
    }
};

export const fetchHistoricalIRs = async (systemName: string, options?: { signal?: AbortSignal }): Promise<any[]> => {
    try {
        const response = await axios.get('/ir', { 
            params: { systemName },
            responseType: 'blob',
            signal: options?.signal
        });
        return await decompressGzipResponse(response.data);
    } catch (error: any) {
        if (axios.isCancel(error)) {
            console.log("Historical IR fetch canceled by user.");
            throw new Error("AbortError");
        }
        console.error("Failed to fetch historical IRs:", error);
        showError("Failed to load historical timeline data.");
        throw error;
    }
};

// Change impact analysis function
export const fetchChangeImpact = async (deltaInput: any, options?: { signal?: AbortSignal }) => {
    try {
        const response = await axios.post('/ir/delta', deltaInput, {
            responseType: 'blob',
            signal: options?.signal
        });

        return await decompressGzipResponse(response.data);
    }
    catch (error: any) {
        if (axios.isCancel(error)) {
            console.log("Change impact calculation canceled by user.");
            const abortError = new Error("Pipeline stopped by user.");
            abortError.name = "AbortError";
            throw abortError;
        }

        throw new Error(error.response?.data?.detail || "Delta API error");
    }
};

// Session management functions
export const saveSession = async (name: string, canvasData: any, sessionId?: string, options?: { signal?: AbortSignal }): Promise<string> => {
    try {
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
            },
            signal: options?.signal
        });

        return response.data.session_id; 
    } catch(error: any) {
        if (axios.isCancel(error)) {
            console.log("Save session operation canceled.");
            const abortError = new Error("Pipeline stopped by user.");
            abortError.name = "AbortError"; 
            throw abortError;
        }
        throw error;
    }
};

export const getAvailableSessions = async (page: number = 0, size: number = 10, options?: { signal?: AbortSignal }): Promise<SessionPageResponse> => {
    try { 
        const response = await axios.get('/sessions', {
            params: { page, size }
        });
        return response.data;
    } catch(error: any){
        if (axios.isCancel(error)) {
            console.log("Fetching sessions operation canceled.");
            const abortError = new Error("Pipeline stopped by user.");
            abortError.name = "AbortError";
            throw abortError;
        }
        throw error;
    }
};

export const loadSession = async (sessionId: string, options?: { signal?: AbortSignal }): Promise<any> => {
    try {
        // Metadata about the session
        const metaResponse = await axios.get(`/sessions/${sessionId}`, 
            { signal: options?.signal }
        );
        const sessionName = metaResponse.data.name;

        // Retreiving the compressed binary blob
        const fileResponse = await axios.get(`/sessions/${sessionId}/canvas`, {
            responseType: 'blob',
            signal: options?.signal
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
    } catch(error: any) {
        if (axios.isCancel(error)) {
            console.log("Load session operation canceled by user.");
            const abortError = new Error("Pipeline stopped by user.");
            abortError.name = "AbortError";
            throw abortError;
        }
        throw error;
    }
    
};

export const deleteSession = async (sessionId: string, options?: { signal?: AbortSignal }): Promise<void> => {
    try {
        await axios.delete(`/sessions/${sessionId}`, {
            signal: options?.signal 
        });
    } catch (error: any) {
        if (axios.isCancel(error)) {
            console.log("Delete session operation canceled.");
            const abortError = new Error("Pipeline stopped by user.");
            abortError.name = "AbortError";
            throw abortError;
        }
        throw error;
    }
};

// Formal verification function
export const verifySystem = async (input: VerificationInput, options?: { signal?: AbortSignal }): Promise<VerificationResponse> => {
    try {
        const response = await VERIFY_API.post('/verify', input, {
            signal: options?.signal 
        });
        return response.data;
    } catch (error: any) {
        if (axios.isCancel(error)) {
            console.log("System verification canceled by user.");
            const abortError = new Error("Pipeline stopped by user.");
            abortError.name = "AbortError";
            throw abortError;
        }

        const msg = error.response?.data?.message || "Verification service unreachable.";
        showError(msg);
        throw error;
    }
};

// AI Test generation functions
export const createComponent = async (reqBody: any, options?: { signal?: AbortSignal }) => {
    try {
        const response = await COMPONENT_API.post('/component/create', reqBody, {
            signal: options?.signal 
        });
        return response.data;
    } catch (error: any) {
        if (axios.isCancel(error)) {
            console.log("Component creation canceled by user.");
            const abortError = new Error("Pipeline stopped by user.");
            abortError.name = "AbortError";
            throw abortError;
        }

        throw new Error(error.response?.data?.detail || "Component creation error.");
    }
};

export const generateAuthVectors = async (indexId: string, options?: { signal?: AbortSignal }) => {
    try {
        const response = await VECTOR_API.post('/vectors/generate-all', { indexId: indexId }, {
            signal: options?.signal 
        });
        let int_result = response.data;
        int_result['vectors'] = decompressPayload(int_result.vectors);
        return int_result;
    } catch (error: any) {
        if (axios.isCancel(error)) {
            console.log("Vector generation canceled by user.");
            const abortError = new Error("Pipeline stopped by user.");
            abortError.name = "AbortError";
            throw abortError;
        }

        throw new Error(error.response?.data?.detail || "Vector generation error.");
    }
};

export const generateScenarios = async (indexId: string|undefined, vectorsId: string|undefined, options?: { signal?: AbortSignal }) => {
    try {
        const response = await ANALYSIS_API.post('/scenarios/generate', {   
            index_id: indexId,
            vectors_id: vectorsId
        }, {
            signal: options?.signal 
        });
        return response.data;
    } catch (error: any) {
        if (axios.isCancel(error)) {
            console.log("Scenario generation canceled by user.");
            const abortError = new Error("Pipeline stopped by user.");
            abortError.name = "AbortError";
            throw abortError;
        }
        throw new Error(error.response?.data?.detail || "Scenario generation error.");
    }
};

export const generateTestSuites = async (selectedLlm: string, prompts: PromptItem[] | undefined, options?: { signal?: AbortSignal }) => {
    try {
        const response = await TEST_API.post('/testsuites/generate', { 
            llm_model: selectedLlm,
            prompts: prompts 
        }, {
            signal: options?.signal 
        });
        return response.data;
    } catch (error: any) {
        if (axios.isCancel(error)) {
            console.log("Test suite generation canceled by user.");
            const abortError = new Error("Pipeline stopped by user.");
            abortError.name = "AbortError";
            throw abortError;
        }

        throw new Error(error.response?.data?.detail || "Test Generation error");
    }
};

export const generatePrompts = async (selectedIds: string[], targetLanguage: string, options?: { signal?: AbortSignal }) => {
    try {
        const response = await ANALYSIS_API.post('/scenarios/prompts/generate', { 
            scenario_ids: selectedIds, 
            language: targetLanguage 
        }, {
            signal: options?.signal 
        });
        return response.data;
    } catch (error: any) {
        if (axios.isCancel(error)) {
            console.log("Prompt generation canceled by user.");
            const abortError = new Error("Pipeline stopped by user.");
            abortError.name = "AbortError";
            throw abortError;
        }

        throw new Error(error.response?.data?.detail || "Prompt generation error");
    }
};

// Aegis introspection functions 
export const analyzeAegis = async (enginePayload: any, options?: { signal?: AbortSignal }) => {
    try {
        const response = await AEGIS_API.post('/analyze', enginePayload, {
            signal: options?.signal 
        });
        return response.data;
    } catch (error: any) {
        if (axios.isCancel(error)) {
            console.log("Aegis analysis canceled by user.");
            const abortError = new Error("Pipeline stopped by user.");
            abortError.name = "AbortError";
            throw abortError;
        }

        throw new Error(error.response?.data?.detail || "Aegis API error");
    }
};

// GitHub repository management functions
export const importOrganization = async (orgUrl: string, options?: { signal?: AbortSignal }): Promise<OrgImportResponse> => {
    try {
        const response = await REPO_API.post('/import/organization', { org_url: orgUrl }, {
            signal: options?.signal 
        });
        return response.data;
    } catch (error: any) {
        if (axios.isCancel(error)) {
            console.log("Organization import canceled by user.");
            const abortError = new Error("Pipeline stopped by user.");
            abortError.name = "AbortError";
            throw abortError;
        }

        const errorMessage = error.response?.data?.detail || "API error: Failed to import organization";
        showError(errorMessage);
        throw new Error(errorMessage);
    }
};

export const fetchBranchCommits = async (
    repoUrl: string,
    branch: string,
    page: number = 1,
    perPage: number = 10,
    options?: { signal?: AbortSignal }
): Promise<CommitPageResponse> => {
    try {
        const response = await REPO_API.post(
            '/import/repository/commits',
            { repo_url: repoUrl, branch, page, per_page: perPage },
            { signal: options?.signal },
        );
        return response.data;
    } catch (error: any) {
        if (axios.isCancel(error)) {
            console.log("Fetch branch commits operation canceled.");
            const abortError = new Error("Pipeline stopped by user.");
            abortError.name = "AbortError";
            throw abortError;
        }

        throw new Error(error.response?.data?.detail || 'Failed to fetch commits');
    }
};

export const fetchRepoMetadata = async (repoUrl: string, options?: { signal?: AbortSignal }): Promise<RepoMetadata> => {
    try {
        const response = await REPO_API.post(
            '/import/repository',
            { repo_url: repoUrl },
            { signal: options?.signal },
        );
        return response.data;
    } catch (error: any) {
        if (axios.isCancel(error)) {
            console.log("Fetch repository metadata operation canceled.");
            const abortError = new Error("Pipeline stopped by user.");
            abortError.name = "AbortError";
            throw abortError;
        }

        throw new Error(error.response?.data?.detail || 'Failed to fetch repository metadata');
    }
};

export const saveGitHubToken = async (token: string, options?: { signal?: AbortSignal }) => {
    try {
        const response = await REPO_API.post('/settings/github-token', { github_token: token }, {
            signal: options?.signal,
            headers: {
                'X-Internal-Service-Auth': process.env.REACT_APP_INTERNAL_SERVICE_KEY
            } 
        });
        return response.data;
    } catch (error: any) {
        if (axios.isCancel(error)) {
            console.log("Save GitHub token operation canceled.");
            const abortError = new Error("Pipeline stopped by user.");
            abortError.name = "AbortError";
            throw abortError;
        }

        throw new Error(error.response?.data?.detail || "API error saving GitHub token");
    }
};

export const deleteGitHubToken = async (options?: { signal?: AbortSignal }) => {
    try {
        const response = await REPO_API.delete('/settings/github-token', {
            signal: options?.signal,
            headers: {
                'X-Internal-Service-Auth': process.env.REACT_APP_INTERNAL_SERVICE_KEY
            } 
        });
        return response.data;
    } catch (error: any) {
        if (axios.isCancel(error)) {
            console.log("Delete GitHub token operation canceled.");
            const abortError = new Error("Pipeline stopped by user.");
            abortError.name = "AbortError";
            throw abortError;
        }

        throw new Error(error.response?.data?.detail || "API error deleting GitHub token");
    }
};

export const checkGitHubTokenStatus = async (options?: { signal?: AbortSignal }) => {
    try {
        const response = await REPO_API.get('/settings/github-token/status', {
            signal: options?.signal,
            headers: {
                'X-Internal-Service-Auth': process.env.REACT_APP_INTERNAL_SERVICE_KEY
            } 
        });
        return response.data.hasToken;
    } catch (error) {
        if (axios.isCancel(error)) {
            console.log("Token status check operation canceled.");
            return false;
        }

        console.error("Failed to check token status", error);
        return false; 
    }
};

// Change Impact Analysis
export const generateChangeImpactInsights = async (payload: ChangeImpactInsight, options?: { signal?: AbortSignal }) => {
    const jsonString = JSON.stringify(payload);
    const stream = new Blob([jsonString]).stream();

    const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
    const compressedBody = await new Response(compressedStream).blob();

    try {
        const response = await ANALYSIS_API.post('/analysis/impact-insights', compressedBody, {
            headers: { 'Content-Encoding': 'gzip' },
            signal: options?.signal 
        });
        return response.data;
    } catch (error: any) {
        if (axios.isCancel(error)) {
            console.log("Change impact insight generation canceled by user.");
            const abortError = new Error("Pipeline stopped by user.");
            abortError.name = "AbortError";
            throw abortError;
        }
        
        throw new Error(error.response?.data?.detail || "API error generating impact insights");
    }
};

// User Services 
export const recordUserFeedback = async (payload: UserFeedback) => {
    try {
        const response = await USER_API.post('/users/feedback', payload, {
            headers: {
                'X-Internal-Service-Auth': process.env.REACT_APP_INTERNAL_SERVICE_KEY
            }
        });
        return response.data;
    } catch (error: any) {
        throw new Error(error.response?.data?.detail || 'Failed to record feedback');
    }
}

// Test Executor Proxy Service 
export const executeTest = async (language: string, payload: { command?: string; code?: string }) => {
    try {
        const response = await EXECUTOR_API.post(`/api/execute/${language}`, payload);
        return { ok: true, status: response.status, data: response.data };
    } catch (error: any) {
        return { 
            ok: false, 
            status: error.response?.status || 500, 
            error: error.message 
        };
    }
};